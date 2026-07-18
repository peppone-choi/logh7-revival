from __future__ import annotations

"""원본 클라이언트의 lineage를 fail-closed로 판정하는 순수 헬퍼.

Wine 도구·prefix에 의존하지 않으므로 native Windows 직접 실행 경로와
격리 Wine 경로가 **동일한 판정**을 공유한다. 표준 라이브러리만 사용한다.
manifest v1의 ``working`` 블록(``sha256``·``imageBase``·``sentinels``)을
기대값으로 받아 대상 EXE와 대조한다.
"""

import hashlib
import re
import struct
from collections.abc import Mapping
from pathlib import Path
from typing import Any

SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def inspect_pe(path: Path) -> dict[str, int]:
    """PE32/PE32+ timestamp와 image base를 외부 의존성 없이 읽는다."""

    data = path.read_bytes()
    if len(data) < 0x40 or data[:2] != b"MZ":
        raise ValueError("missing MZ header")
    pe_offset = struct.unpack_from("<I", data, 0x3C)[0]
    if pe_offset + 24 > len(data) or data[pe_offset : pe_offset + 4] != b"PE\0\0":
        raise ValueError("missing PE signature")
    timestamp = struct.unpack_from("<I", data, pe_offset + 8)[0]
    optional_offset = pe_offset + 24
    if optional_offset + 32 > len(data):
        raise ValueError("truncated optional header")
    magic = struct.unpack_from("<H", data, optional_offset)[0]
    if magic == 0x10B:
        image_base = struct.unpack_from("<I", data, optional_offset + 28)[0]
    elif magic == 0x20B:
        if optional_offset + 32 > len(data):
            raise ValueError("truncated PE32+ optional header")
        image_base = struct.unpack_from("<Q", data, optional_offset + 24)[0]
    else:
        raise ValueError(f"unsupported optional-header magic 0x{magic:04x}")
    return {"timestamp": timestamp, "imageBase": image_base, "optionalMagic": magic}


def _parse_integer(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{label} must be an integer")
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        return int(value, 0)
    raise ValueError(f"{label} must be an integer or 0x-prefixed string")


def check_client_lineage(exe: Path, working: Any) -> dict[str, Any]:
    """대상 EXE를 manifest ``working`` 블록과 대조해 판정을 돌려준다.

    반환: ``{"ok", "exe", "checks", "mismatches"}``. ``checks``의 각 항목은
    ``{"check", "expected", "actual", "matched"[, "detail"]}`` 형태다. 하나라도
    ``matched``가 아니면 ``ok``는 ``False``이고, 근거는 ``mismatches``에 담긴다.
    형식 오류·읽기 실패도 불일치(fail-closed)로 취급한다.
    """

    checks: list[dict[str, Any]] = []

    def record(check: str, expected: Any, actual: Any, matched: bool, detail: str | None = None) -> None:
        entry: dict[str, Any] = {"check": check, "expected": expected, "actual": actual, "matched": matched}
        if detail is not None:
            entry["detail"] = detail
        checks.append(entry)

    if not isinstance(working, Mapping):
        record("working", "object", type(working).__name__, False, "manifest working block is missing or not an object")
        return _verdict(exe, checks)

    try:
        exe_bytes = exe.read_bytes()
    except OSError as error:
        record("client-readable", "readable", "unreadable", False, str(error))
        return _verdict(exe, checks)

    expected_sha = working.get("sha256")
    normalized_sha = expected_sha.strip().lower() if isinstance(expected_sha, str) else None
    if normalized_sha is None or not SHA256_RE.fullmatch(normalized_sha):
        record("sha256", expected_sha, None, False, "working.sha256 must be a 64-char hex string")
    else:
        actual_sha = hashlib.sha256(exe_bytes).hexdigest()
        record("sha256", normalized_sha, actual_sha, actual_sha == normalized_sha)

    try:
        expected_base = _parse_integer(working.get("imageBase"), "working.imageBase")
    except (ValueError, TypeError) as error:
        record("imageBase", working.get("imageBase"), None, False, str(error))
    else:
        try:
            actual_base = inspect_pe(exe)["imageBase"]
        except (OSError, ValueError, struct.error) as error:
            record("imageBase", f"0x{expected_base:x}", None, False, str(error))
        else:
            record("imageBase", f"0x{expected_base:x}", f"0x{actual_base:x}", actual_base == expected_base)

    _check_sentinels(exe_bytes, working.get("sentinels"), record)

    return _verdict(exe, checks)


APPROVAL_REF_RE = re.compile(r"^LOGH7-\d+$")


def _node_authorization_error(node: Any) -> str | None:
    """노드가 자기 hash를 축복할 자격(인가)이 있는지 판정한다.

    진짜 ``original``(무패치 원본) 노드만 provenance 없이 자기 hash를 인가한다.
    **패치 파생 여부는 self-declared ``kind``가 아니라 ``parentHash`` 존재로
    판정한다** — 패치 EXE를 ``kind:"original"``로 relabel해도 ``parentHash``가 있으면
    patch 요건을 회피할 수 없다. 파생 노드는 ``capabilityProfile``·``provenance``·
    ``approvalRef``를 모두 갖춰야 하고, ``approvalRef``는 ``LOGH7-<번호>`` 형식이어야
    한다(빈/임의 문자열 거부). 자격 없는 노드는 hash가 우연히 맞아도 대상 EXE를
    accept시키지 못한다. 자격이 있으면 ``None``.
    """
    if not isinstance(node, Mapping):
        return "node must be an object"
    kind = node.get("kind", "original")
    if kind not in ("original", "patch"):
        return f"unsupported node kind {kind!r}"
    # parentHash가 있으면 patch 파생 — kind 라벨과 무관하게 provenance를 강제한다.
    is_derived = node.get("parentHash") is not None or kind == "patch"
    if is_derived:
        for field in ("capabilityProfile", "provenance", "approvalRef"):
            value = node.get(field)
            if not isinstance(value, str) or not value.strip():
                return f"patch node missing required authorization field {field!r}"
        approval = node.get("approvalRef").strip()
        if not APPROVAL_REF_RE.fullmatch(approval):
            return f"approvalRef must match LOGH7-<number>, got {approval!r}"
    return None


def check_client_lineage_set(exe: Path, nodes: Any) -> dict[str, Any]:
    """대상 EXE를 **인가된 계보 노드 집합**과 대조한다(fail-closed 보존).

    ``nodes``는 원본 노드 + 승인된 패치 노드의 배열이다. 각 노드는 자기 hash를
    인가할 자격(``_node_authorization_error``)을 통과해야 하고, 그 뒤 EXE가 그
    노드의 sha256·image base·sentinel을 **전부** 만족해야 그 노드에 매치된다.
    자격 있는 노드 중 하나라도 완전 매치하면 accept한다.

    fail-closed 불변식: 어느 인가 노드에도 완전 매치하지 않는 EXE(미상 hash 포함)는
    ``ok=False``로 차단한다. 자격 없는 노드는 hash가 맞아도 매치 후보에서 빠진다.
    """
    node_results: list[dict[str, Any]] = []
    if not isinstance(nodes, list) or not nodes:
        return {
            "ok": False,
            "exe": str(exe),
            "matchedNode": None,
            "nodes": node_results,
            "reason": "authorizedNodes must be a non-empty array",
        }

    matched_node: str | None = None
    for index, node in enumerate(nodes):
        node_id = node.get("nodeId", f"node[{index}]") if isinstance(node, Mapping) else f"node[{index}]"
        auth_error = _node_authorization_error(node)
        if auth_error is not None:
            node_results.append(
                {"nodeId": node_id, "authorized": False, "matched": False, "reason": auth_error}
            )
            continue
        verdict = check_client_lineage(exe, node)
        node_results.append(
            {"nodeId": node_id, "authorized": True, "matched": verdict["ok"], "verdict": verdict}
        )
        if verdict["ok"] and matched_node is None:
            matched_node = node_id

    return {
        "ok": matched_node is not None,
        "exe": str(exe),
        "matchedNode": matched_node,
        "nodes": node_results,
    }


def _check_sentinels(exe_bytes: bytes, raw_sentinels: Any, record: Any) -> None:
    if not isinstance(raw_sentinels, list) or not raw_sentinels:
        record("sentinels", "non-empty array", raw_sentinels, False, "working.sentinels must be a non-empty array")
        return
    for index, entry in enumerate(raw_sentinels):
        name = f"sentinel[{index}]"
        if not isinstance(entry, Mapping):
            record(name, "object", entry, False, "sentinel must be an object")
            continue
        try:
            offset = _parse_integer(entry.get("offset"), f"{name} offset")
            raw_hex = entry.get("hex")
            if not isinstance(raw_hex, str) or len(raw_hex) == 0 or len(raw_hex) % 2:
                raise ValueError("hex must contain a non-empty even number of characters")
            expected = bytes.fromhex(raw_hex)
        except (ValueError, TypeError) as error:
            record(name, entry.get("hex"), None, False, str(error))
            continue
        if offset < 0 or offset + len(expected) > len(exe_bytes):
            record(name, expected.hex(), None, False, f"offset 0x{offset:x} exceeds file bounds")
            continue
        actual = exe_bytes[offset : offset + len(expected)]
        record(name, expected.hex(), actual.hex(), actual == expected, f"offset 0x{offset:x}")


def _verdict(exe: Path, checks: list[dict[str, Any]]) -> dict[str, Any]:
    mismatches = [entry for entry in checks if not entry["matched"]]
    return {
        "ok": not mismatches,
        "exe": str(exe),
        "checks": checks,
        "mismatches": mismatches,
    }
