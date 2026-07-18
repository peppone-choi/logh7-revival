from __future__ import annotations

"""재현가능 클라이언트 패처 — 검증된 base EXE + 선언적 patch manifest → patched 바이너리.

손으로 편집한 바이너리를 계보에 축복하지 않는다. patched 산출물은 오직
``원본 + transform_ops``의 결정론적 재생성으로만 정의된다. 같은 입력이면 항상
같은 바이트·같은 ``expected_new_hash``가 나오고, CI가 이를 재검증한다. 어떤
단계든 불일치하면 즉시 ``PatchError``로 fail-closed 한다(부분 산출물 반환 금지).

표준 라이브러리만 사용한다. 실제 g7mtclient.exe를 다루는 코드가 아니며, 실제
패치 적용은 인간 승인 게이트 하에 별도 티켓(LOGH7-212)에서 exact RE 바이트로만
수행한다. 이 모듈은 그 절차의 재현가능·검증가능 인프라다.

Patch manifest 스키마 (선언적):
    {
      "patch_manifest_id": str,               # 노드 식별자
      "parent_hash": <sha256 hex>,            # 검증된 base 전체 해시
      "transform_ops": [                      # 순서대로 적용
        {"op": "replace", "offset": int|"0x..", "expect": <hex>, "bytes": <hex>},
        {"op": "append",  "bytes": <hex>}     # 코드케이브(파일 끝에 덧붙임)
      ],
      "expected_new_hash": <sha256 hex>,      # 재생성 결과 전체 해시(무결성 정박)
      "image_base": int|"0x..",               # patched PE image base
      "sentinel_set": [{"offset": int|"0x..", "hex": <hex>}],
      "capability_profile": str,              # 이 노드가 여는 능력
      "provenance": str,                      # 근거
      "approval_ref": str                     # 인간 승인 참조(Jira/PR)
    }
"""

import hashlib
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")

# append(코드케이브) op은 offset/expect 가드가 없다 — 방어심층 크기 상한.
MAX_APPEND_BYTES = 1 << 20  # 1 MiB. 정당한 코드케이브는 이보다 훨씬 작다.


class PatchError(Exception):
    """patch manifest 적용 중 fail-closed 위반. 부분 산출물은 절대 반환하지 않는다."""


def _as_int(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise PatchError(f"{label} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value, 0)
        except ValueError as error:
            raise PatchError(f"{label} is not a valid integer: {value!r}") from error
    raise PatchError(f"{label} must be an integer or 0x-prefixed string")


def _as_hex(value: Any, label: str) -> bytes:
    if not isinstance(value, str) or len(value) == 0 or len(value) % 2:
        raise PatchError(f"{label} must be a non-empty even-length hex string")
    try:
        return bytes.fromhex(value)
    except ValueError as error:
        raise PatchError(f"{label} is not valid hex: {value!r}") from error


def _normalized_sha(value: Any, label: str) -> str:
    if not isinstance(value, str):
        raise PatchError(f"{label} must be a 64-char hex sha256 string")
    normalized = value.strip().lower()
    if not SHA256_RE.fullmatch(normalized):
        raise PatchError(f"{label} must be a 64-char hex sha256 string")
    return normalized


def _apply_ops(buf: bytearray, ops: Any) -> None:
    if not isinstance(ops, list) or not ops:
        raise PatchError("transform_ops must be a non-empty array")
    for index, op in enumerate(ops):
        if not isinstance(op, Mapping):
            raise PatchError(f"transform_ops[{index}] must be an object")
        kind = op.get("op")
        if kind == "replace":
            offset = _as_int(op.get("offset"), f"transform_ops[{index}].offset")
            expect = _as_hex(op.get("expect"), f"transform_ops[{index}].expect")
            new = _as_hex(op.get("bytes"), f"transform_ops[{index}].bytes")
            if len(new) != len(expect):
                raise PatchError(
                    f"transform_ops[{index}] replace length mismatch: "
                    f"expect {len(expect)} bytes, bytes {len(new)} bytes"
                )
            if offset < 0 or offset + len(expect) > len(buf):
                raise PatchError(f"transform_ops[{index}] offset 0x{offset:x} exceeds file bounds")
            actual = bytes(buf[offset : offset + len(expect)])
            if actual != expect:
                raise PatchError(
                    f"transform_ops[{index}] expect guard mismatch at 0x{offset:x}: "
                    f"file has {actual.hex()}, manifest expect {expect.hex()}"
                )
            buf[offset : offset + len(new)] = new
        elif kind == "append":
            # append는 offset/expect 위치 가드가 없다. 이 op의 무결성 봉인은 오직
            # apply_patch_manifest 마지막의 expected_new_hash 전체검증이다 — 그것이
            # 최종·유일 방어다. 방어심층으로 크기 상한만 추가로 강제한다.
            cave = _as_hex(op.get("bytes"), f"transform_ops[{index}].bytes")
            if len(cave) > MAX_APPEND_BYTES:
                raise PatchError(
                    f"transform_ops[{index}] append exceeds cap ({len(cave)} > {MAX_APPEND_BYTES} bytes)"
                )
            buf.extend(cave)
        else:
            raise PatchError(f"transform_ops[{index}] has unsupported op {kind!r}")


def apply_patch_manifest(base_bytes: bytes, manifest: Mapping[str, Any]) -> bytes:
    """검증된 base + patch manifest → patched 바이너리를 결정론적으로 생성한다.

    fail-closed 순서:
      1. ``parent_hash``가 base 전체 해시와 일치해야 한다(잘못된 base 거부).
      2. ``transform_ops``를 순서대로 적용하되, 각 replace op은 ``expect`` 가드
         바이트가 실제로 그 위치에 있어야 한다(엉뚱한 오프셋/변조 base 거부).
      3. 결과 전체 해시가 ``expected_new_hash``와 일치해야 한다(변조/드리프트 거부).
    어느 단계든 어긋나면 ``PatchError``. 입력 manifest는 변형하지 않는다.
    """
    if not isinstance(manifest, Mapping):
        raise PatchError("patch manifest must be an object")

    parent_hash = _normalized_sha(manifest.get("parent_hash"), "parent_hash")
    actual_parent = hashlib.sha256(base_bytes).hexdigest()
    if actual_parent != parent_hash:
        raise PatchError(
            f"parent_hash mismatch: base is {actual_parent}, manifest parent_hash {parent_hash}"
        )

    expected_new = _normalized_sha(manifest.get("expected_new_hash"), "expected_new_hash")

    buf = bytearray(base_bytes)
    _apply_ops(buf, manifest.get("transform_ops"))

    produced = bytes(buf)
    actual_new = hashlib.sha256(produced).hexdigest()
    if actual_new != expected_new:
        raise PatchError(
            f"expected_new_hash mismatch: produced {actual_new}, manifest expected_new_hash {expected_new}"
        )
    return produced


def derive_authorized_node(manifest: Mapping[str, Any]) -> dict[str, Any]:
    """patch manifest를 게이트용 인가 노드(camelCase)로 무손실 투영한다.

    단일 진실원: patched 노드의 hash·image base·sentinel·capability·provenance·
    approval은 patch manifest에서만 온다. gate가 소비하는 ``sha256``/``imageBase``/
    ``sentinels`` 필드 이름(check_client_lineage 규약)에 맞춰 매핑한다.
    """
    if not isinstance(manifest, Mapping):
        raise PatchError("patch manifest must be an object")
    node_id = manifest.get("patch_manifest_id")
    if not isinstance(node_id, str) or not node_id.strip():
        raise PatchError("patch_manifest_id must be a non-empty string")
    return {
        "nodeId": node_id,
        "kind": "patch",
        "parentHash": _normalized_sha(manifest.get("parent_hash"), "parent_hash"),
        "sha256": _normalized_sha(manifest.get("expected_new_hash"), "expected_new_hash"),
        "imageBase": manifest.get("image_base"),
        "sentinels": manifest.get("sentinel_set"),
        "capabilityProfile": manifest.get("capability_profile"),
        "provenance": manifest.get("provenance"),
        "approvalRef": manifest.get("approval_ref"),
    }


def _main(argv: list[str] | None = None) -> int:
    """CI/CLI: 검증된 base + manifest → output 재생성. 결정론·해시 검증은 함수가 강제한다."""
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Reproducible LOGH7 client patcher (synthetic infra)")
    parser.add_argument("--base", required=True, type=Path, help="검증된 base EXE 절대경로")
    parser.add_argument("--manifest", required=True, type=Path, help="patch manifest JSON 경로")
    parser.add_argument("--output", required=True, type=Path, help="patched 산출물 경로(없어야 함)")
    args = parser.parse_args(argv)

    if args.output.exists():
        raise SystemExit(f"output already exists (refuse overwrite): {args.output}")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    produced = apply_patch_manifest(args.base.read_bytes(), manifest)
    args.output.write_bytes(produced)
    print(
        json.dumps(
            {
                "ok": True,
                "output": str(args.output),
                "sha256": hashlib.sha256(produced).hexdigest(),
                "patchManifestId": manifest.get("patch_manifest_id"),
            },
            ensure_ascii=True,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(_main())
