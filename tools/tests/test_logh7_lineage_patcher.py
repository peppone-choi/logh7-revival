from __future__ import annotations

"""재현가능 패처(`tools/live/lineage_patcher.py`) TDD.

합성 fixture만 사용한다. 실제 g7mtclient.exe / 실제 설치본은 절대 건드리지 않는다.
검증 항목:
  - 결정론: 검증된 base + patch manifest → 항상 동일 바이트·동일 new_hash.
  - parent_hash 불일치(잘못된 base) → fail-closed(PatchError).
  - transform_ops의 expect 가드 불일치 → fail-closed.
  - transform_ops 변조로 결과가 expected_new_hash와 어긋나면 → fail-closed.
  - expected_new_hash 자체가 틀리면 → fail-closed.
  - append(코드케이브) op 지원.
  - patch manifest → gate authorized-node 투영이 무손실.
"""

import copy
import hashlib
import struct
import unittest

from tools.live.lineage_patcher import (
    MAX_APPEND_BYTES,
    PatchError,
    apply_patch_manifest,
    derive_authorized_node,
)


def _synthetic_pe(*, image_base: int = 0x00400000, stub_offset: int = 0x100) -> bytes:
    """inspect_pe가 파싱 가능한 최소 PE32. stub_offset에 8바이트 NOP 스텁을 둔다."""
    buf = bytearray(512)
    buf[0:2] = b"MZ"
    pe_off = 0x80
    struct.pack_into("<I", buf, 0x3C, pe_off)
    buf[pe_off : pe_off + 4] = b"PE\0\0"
    struct.pack_into("<I", buf, pe_off + 8, 0x40779EB8)  # timestamp
    optional_off = pe_off + 24
    struct.pack_into("<H", buf, optional_off, 0x10B)  # PE32 magic
    struct.pack_into("<I", buf, optional_off + 28, image_base)
    buf[stub_offset : stub_offset + 8] = b"\x90" * 8  # NOP stub to be replaced
    return bytes(buf)


# 독립 오라클: 패처의 op 루프와 무관하게 손으로 기대 산출물을 만든다.
_STUB_OFFSET = 0x100
_ORIGINAL_STUB = b"\x90" * 8
_PATCHED_STUB = b"\xB8\x01\x00\x00\x00\xC3\x90\x90"  # mov eax,1; ret; nop nop
_BASE = _synthetic_pe(stub_offset=_STUB_OFFSET)
_BASE_HASH = hashlib.sha256(_BASE).hexdigest()


def _expected_patched_bytes() -> bytes:
    buf = bytearray(_BASE)
    buf[_STUB_OFFSET : _STUB_OFFSET + len(_PATCHED_STUB)] = _PATCHED_STUB
    return bytes(buf)


_PATCHED = _expected_patched_bytes()
_PATCHED_HASH = hashlib.sha256(_PATCHED).hexdigest()


def _good_manifest() -> dict:
    return {
        "patch_manifest_id": "patch_v1_0x4a_notifybase",
        "parent_hash": _BASE_HASH,
        "transform_ops": [
            {
                "op": "replace",
                "offset": _STUB_OFFSET,
                "expect": _ORIGINAL_STUB.hex(),
                "bytes": _PATCHED_STUB.hex(),
            }
        ],
        "expected_new_hash": _PATCHED_HASH,
        "image_base": "0x00400000",
        "sentinel_set": [{"offset": _STUB_OFFSET, "hex": _PATCHED_STUB.hex()}],
        "capability_profile": "layer3-notifybase-render",
        "provenance": "patch for Layer3 NotifyBaseParameter UI binding",
        "approval_ref": "LOGH7-212",
    }


class PatcherTests(unittest.TestCase):
    def test_deterministic_regeneration(self) -> None:
        manifest = _good_manifest()
        first = apply_patch_manifest(_BASE, manifest)
        second = apply_patch_manifest(_BASE, manifest)
        self.assertEqual(first, second)  # same input → same output
        self.assertEqual(first, _PATCHED)  # matches independent oracle
        self.assertEqual(hashlib.sha256(first).hexdigest(), _PATCHED_HASH)

    def test_rejects_wrong_base_parent_hash(self) -> None:
        other_base = _synthetic_pe(image_base=0x00500000)
        with self.assertRaises(PatchError) as ctx:
            apply_patch_manifest(other_base, _good_manifest())
        self.assertIn("parent_hash", str(ctx.exception))

    def test_rejects_expect_guard_mismatch(self) -> None:
        manifest = _good_manifest()
        manifest["transform_ops"][0]["expect"] = "deadbeefdeadbeef"  # not in base
        with self.assertRaises(PatchError) as ctx:
            apply_patch_manifest(_BASE, manifest)
        self.assertIn("expect", str(ctx.exception))

    def test_rejects_tampered_transform(self) -> None:
        # 결과 바이트만 몰래 바꾸면 expected_new_hash와 어긋나 fail-closed.
        manifest = _good_manifest()
        manifest["transform_ops"][0]["bytes"] = "b802000000c39090"  # mov eax,2 대신
        with self.assertRaises(PatchError) as ctx:
            apply_patch_manifest(_BASE, manifest)
        self.assertIn("expected_new_hash", str(ctx.exception))

    def test_rejects_wrong_expected_hash(self) -> None:
        manifest = _good_manifest()
        manifest["expected_new_hash"] = "0" * 64
        with self.assertRaises(PatchError) as ctx:
            apply_patch_manifest(_BASE, manifest)
        self.assertIn("expected_new_hash", str(ctx.exception))

    def test_replace_length_change_rejected(self) -> None:
        manifest = _good_manifest()
        manifest["transform_ops"][0]["bytes"] = "b801000000c3"  # 6 bytes, expect is 8
        with self.assertRaises(PatchError) as ctx:
            apply_patch_manifest(_BASE, manifest)
        self.assertIn("length", str(ctx.exception).lower())

    def test_append_codecave_op(self) -> None:
        cave = b"\xCC\xCC\xCC\xCC"
        expected = _PATCHED + cave
        manifest = _good_manifest()
        manifest["transform_ops"].append({"op": "append", "bytes": cave.hex()})
        manifest["expected_new_hash"] = hashlib.sha256(expected).hexdigest()
        out = apply_patch_manifest(_BASE, manifest)
        self.assertEqual(out, expected)

    def test_append_cap_enforced(self) -> None:
        # MINOR-3: append 방어심층 크기 상한. expected_new_hash가 유일 봉인이지만
        # 비정상적으로 큰 코드케이브는 상한에서 먼저 거부한다.
        manifest = _good_manifest()
        oversized = b"\x00" * (MAX_APPEND_BYTES + 1)
        manifest["transform_ops"].append({"op": "append", "bytes": oversized.hex()})
        manifest["expected_new_hash"] = hashlib.sha256(_PATCHED + oversized).hexdigest()
        with self.assertRaises(PatchError) as ctx:
            apply_patch_manifest(_BASE, manifest)
        self.assertIn("append exceeds cap", str(ctx.exception))

    def test_unknown_op_rejected(self) -> None:
        manifest = _good_manifest()
        manifest["transform_ops"] = [{"op": "nuke", "offset": 0, "bytes": "00"}]
        with self.assertRaises(PatchError):
            apply_patch_manifest(_BASE, manifest)

    def test_derive_authorized_node_lossless(self) -> None:
        node = derive_authorized_node(_good_manifest())
        self.assertEqual(node["kind"], "patch")
        self.assertEqual(node["nodeId"], "patch_v1_0x4a_notifybase")
        self.assertEqual(node["sha256"], _PATCHED_HASH)
        self.assertEqual(node["imageBase"], "0x00400000")
        self.assertEqual(node["sentinels"], [{"offset": _STUB_OFFSET, "hex": _PATCHED_STUB.hex()}])
        self.assertEqual(node["capabilityProfile"], "layer3-notifybase-render")
        self.assertEqual(node["provenance"], "patch for Layer3 NotifyBaseParameter UI binding")
        self.assertEqual(node["approvalRef"], "LOGH7-212")

    def test_input_manifest_not_mutated(self) -> None:
        manifest = _good_manifest()
        snapshot = copy.deepcopy(manifest)
        apply_patch_manifest(_BASE, manifest)
        self.assertEqual(manifest, snapshot)


if __name__ == "__main__":
    unittest.main()
