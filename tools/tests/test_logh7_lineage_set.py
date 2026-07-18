from __future__ import annotations

"""인가된 계보 노드 집합 게이트(`check_client_lineage_set`) TDD.

불변식(절대 약화 금지): 미인가/미상 hash는 여전히 fail-closed(차단).
검증 항목:
  - 원본 노드 accept(병존).
  - 인가된 패치 노드 accept.
  - 미상 hash reject(어느 노드에도 안 맞음) — fail-closed 크라운 주얼.
  - hash는 맞지만 approval_ref/provenance 없는 패치 노드는 인가되지 않아 hash를 축복하지 못함 → reject.
  - hash는 맞지만 image base/sentinel이 어긋나면 reject(방어 심층).
  - 패처 산출 patched 바이너리를 실제로 만들어 파생 노드로 accept되는 end-to-end.
"""

import hashlib
import struct
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from tools.live.lineage_guard import check_client_lineage_set
from tools.live.lineage_patcher import apply_patch_manifest, derive_authorized_node


def _synthetic_pe(*, image_base: int = 0x00400000, stub_offset: int = 0x100, stub: bytes = b"\x90" * 8) -> bytes:
    buf = bytearray(512)
    buf[0:2] = b"MZ"
    pe_off = 0x80
    struct.pack_into("<I", buf, 0x3C, pe_off)
    buf[pe_off : pe_off + 4] = b"PE\0\0"
    struct.pack_into("<I", buf, pe_off + 8, 0x40779EB8)
    optional_off = pe_off + 24
    struct.pack_into("<H", buf, optional_off, 0x10B)
    struct.pack_into("<I", buf, optional_off + 28, image_base)
    buf[stub_offset : stub_offset + len(stub)] = stub
    return bytes(buf)


_STUB_OFFSET = 0x100
_ORIGINAL_STUB = b"\x90" * 8
_PATCHED_STUB = b"\xB8\x01\x00\x00\x00\xC3\x90\x90"
_ORIGINAL_PE = _synthetic_pe(stub=_ORIGINAL_STUB)
_ORIGINAL_HASH = hashlib.sha256(_ORIGINAL_PE).hexdigest()
_PATCHED_PE = _synthetic_pe(stub=_PATCHED_STUB)
_PATCHED_HASH = hashlib.sha256(_PATCHED_PE).hexdigest()


def _original_node() -> dict:
    return {
        "nodeId": "original",
        "kind": "original",
        "sha256": _ORIGINAL_HASH,
        "imageBase": "0x00400000",
        "sentinels": [{"offset": _STUB_OFFSET, "hex": _ORIGINAL_STUB.hex()}],
    }


def _patch_node() -> dict:
    return {
        "nodeId": "patch_v1",
        "kind": "patch",
        "parentHash": _ORIGINAL_HASH,
        "sha256": _PATCHED_HASH,
        "imageBase": "0x00400000",
        "sentinels": [{"offset": _STUB_OFFSET, "hex": _PATCHED_STUB.hex()}],
        "capabilityProfile": "layer3-notifybase-render",
        "provenance": "patch for Layer3 NotifyBaseParameter UI binding",
        "approvalRef": "LOGH7-212",
    }


class LineageSetTests(unittest.TestCase):
    def _write(self, tmp: str, name: str, data: bytes) -> Path:
        path = Path(tmp) / name
        path.write_bytes(data)
        return path

    def test_original_node_accepted(self) -> None:
        with TemporaryDirectory() as tmp:
            exe = self._write(tmp, "orig.exe", _ORIGINAL_PE)
            verdict = check_client_lineage_set(exe, [_original_node(), _patch_node()])
            self.assertTrue(verdict["ok"])
            self.assertEqual(verdict["matchedNode"], "original")

    def test_authorized_patch_node_accepted(self) -> None:
        with TemporaryDirectory() as tmp:
            exe = self._write(tmp, "patched.exe", _PATCHED_PE)
            verdict = check_client_lineage_set(exe, [_original_node(), _patch_node()])
            self.assertTrue(verdict["ok"])
            self.assertEqual(verdict["matchedNode"], "patch_v1")

    def test_unknown_hash_rejected_fail_closed(self) -> None:
        # 어느 인가 노드에도 안 맞는 미상 바이너리는 반드시 차단.
        with TemporaryDirectory() as tmp:
            rogue = _synthetic_pe(stub=b"\xEB\xFE" + b"\x90" * 6)  # 다른 바이트
            exe = self._write(tmp, "rogue.exe", rogue)
            verdict = check_client_lineage_set(exe, [_original_node(), _patch_node()])
            self.assertFalse(verdict["ok"])
            self.assertIsNone(verdict["matchedNode"])

    def test_patch_node_without_approval_does_not_bless_hash(self) -> None:
        # hash는 정확히 맞지만 approval_ref/provenance/capability가 없으면
        # 그 노드는 인가되지 않으므로 hash를 축복하지 못한다(fail-closed).
        with TemporaryDirectory() as tmp:
            exe = self._write(tmp, "patched.exe", _PATCHED_PE)
            unapproved = _patch_node()
            del unapproved["approvalRef"]
            del unapproved["provenance"]
            verdict = check_client_lineage_set(exe, [_original_node(), unapproved])
            self.assertFalse(verdict["ok"])
            self.assertIsNone(verdict["matchedNode"])
            # 노드가 인가 거부됐다는 근거가 남아야 한다.
            patch_result = next(n for n in verdict["nodes"] if n["nodeId"] == "patch_v1")
            self.assertFalse(patch_result["authorized"])

    def test_hash_match_but_image_base_mismatch_rejected(self) -> None:
        # 방어 심층: 노드가 인가돼도 EXE가 image base까지 맞아야 accept.
        with TemporaryDirectory() as tmp:
            exe = self._write(tmp, "patched.exe", _PATCHED_PE)
            node = _patch_node()
            node["imageBase"] = "0x00990000"  # PE는 0x400000
            verdict = check_client_lineage_set(exe, [node])
            self.assertFalse(verdict["ok"])

    def test_empty_node_set_rejected(self) -> None:
        with TemporaryDirectory() as tmp:
            exe = self._write(tmp, "x.exe", _PATCHED_PE)
            self.assertFalse(check_client_lineage_set(exe, [])["ok"])
            self.assertFalse(check_client_lineage_set(exe, None)["ok"])

    def test_relabel_patch_as_original_still_requires_approval(self) -> None:
        # MINOR-1: patched EXE 노드를 kind="original"로 relabel해도 parentHash가
        # 있으면 provenance 요건을 회피할 수 없다(회피 시 patched exe가 무승인 통과).
        with TemporaryDirectory() as tmp:
            exe = self._write(tmp, "patched.exe", _PATCHED_PE)
            relabelled = {
                "nodeId": "sneaky",
                "kind": "original",  # 거짓 라벨
                "parentHash": _ORIGINAL_HASH,  # 그러나 패치 파생임이 드러남
                "sha256": _PATCHED_HASH,
                "imageBase": "0x00400000",
                "sentinels": [{"offset": _STUB_OFFSET, "hex": _PATCHED_STUB.hex()}],
                # capabilityProfile/provenance/approvalRef 없음
            }
            verdict = check_client_lineage_set(exe, [relabelled])
            self.assertFalse(verdict["ok"])
            self.assertIsNone(verdict["matchedNode"])
            self.assertFalse(verdict["nodes"][0]["authorized"])

    def test_approval_ref_format_enforced(self) -> None:
        # MINOR-1: approvalRef는 LOGH7-<번호> 형식이어야 한다(임의 문자열 거부).
        with TemporaryDirectory() as tmp:
            exe = self._write(tmp, "patched.exe", _PATCHED_PE)
            for bad in ("whatever", "LOGH7-", "logh7-212", "PROJ-9", " "):
                node = _patch_node()
                node["approvalRef"] = bad
                verdict = check_client_lineage_set(exe, [node])
                self.assertFalse(verdict["ok"], f"approvalRef {bad!r} must be rejected")
                self.assertFalse(verdict["nodes"][0]["authorized"])

    def test_genuine_original_without_parenthash_still_accepted(self) -> None:
        # 회귀: parentHash 없는 진짜 원본은 provenance 없이도 인가된다.
        with TemporaryDirectory() as tmp:
            exe = self._write(tmp, "orig.exe", _ORIGINAL_PE)
            verdict = check_client_lineage_set(exe, [_original_node()])
            self.assertTrue(verdict["ok"])
            self.assertEqual(verdict["matchedNode"], "original")

    def test_end_to_end_patcher_output_accepted_by_gate(self) -> None:
        # 패처가 만든 patched 바이너리 → 파생 노드 → 게이트 accept.
        with TemporaryDirectory() as tmp:
            patch_manifest = {
                "patch_manifest_id": "patch_v1",
                "parent_hash": _ORIGINAL_HASH,
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
            produced = apply_patch_manifest(_ORIGINAL_PE, patch_manifest)
            exe = self._write(tmp, "produced.exe", produced)
            node = derive_authorized_node(patch_manifest)
            verdict = check_client_lineage_set(exe, [_original_node(), node])
            self.assertTrue(verdict["ok"])
            self.assertEqual(verdict["matchedNode"], "patch_v1")


if __name__ == "__main__":
    unittest.main()
