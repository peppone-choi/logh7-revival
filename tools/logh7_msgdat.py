from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Final

from logh7_iso import MissingSourceError, PipelineError


SUPPORTED_MAGICS: Final = {b"HFWR", b"GFWR"}
HEADER_BYTES: Final = 16
TOKEN_PATTERN = re.compile(rb"\$[A-Za-z0-9_]+\$")
TEXT_TOKEN_PATTERN = re.compile(r"\$[A-Za-z0-9_]+\$")


def _has_japanese(text: str) -> bool:
    return any(
        "\u3040" <= char <= "\u30ff" or "\u3400" <= char <= "\u9fff" for char in text
    )


def _is_span_byte(value: int) -> bool:
    if value in {0x09, 0x0A, 0x0D}:
        return False
    return 0x20 <= value <= 0x7E or value >= 0x80


def _decode_text_candidates(raw: bytes) -> list[dict[str, int | str]]:
    candidates: list[dict[str, int | str]] = []
    seen: set[tuple[int, str]] = set()
    offset = 0
    while offset < len(raw):
        if not _is_span_byte(raw[offset]):
            offset += 1
            continue
        start = offset
        while offset < len(raw) and _is_span_byte(raw[offset]):
            offset += 1
        span = raw[start:offset]
        try:
            decoded = span.decode("cp932")
        except UnicodeDecodeError:
            continue
        text_start = 0
        for match in TEXT_TOKEN_PATTERN.finditer(decoded):
            part = decoded[text_start : match.start()]
            text_start = match.end()
            leading = len(part) - len(part.lstrip())
            text = part.strip()
            if len(text) < 2 or not _has_japanese(text):
                continue
            candidate_offset = start + len(decoded[: match.start() - len(part) + leading].encode("cp932"))
            key = (candidate_offset, text)
            if key not in seen:
                seen.add(key)
                candidates.append({"offset": candidate_offset, "encoding": "cp932", "text": text})
        part = decoded[text_start:]
        leading = len(part) - len(part.lstrip())
        text = part.strip()
        if len(text) >= 2 and _has_japanese(text):
            candidate_offset = start + len(decoded[:text_start + leading].encode("cp932"))
            key = (candidate_offset, text)
            if key not in seen:
                seen.add(key)
                candidates.append({"offset": candidate_offset, "encoding": "cp932", "text": text})
    return candidates


def _tokens(raw: bytes) -> list[dict[str, int | str]]:
    return [
        {"offset": match.start(), "value": match.group(0).decode("ascii")}
        for match in TOKEN_PATTERN.finditer(raw)
    ]


def _read_u32(raw: bytes, offset: int) -> int:
    return int.from_bytes(raw[offset : offset + 4], "little")


def _aligned_dword_count(count: int) -> int:
    return (count + 3) & ~3


def _record_tokens(raw: bytes) -> list[str]:
    return [match.group(0).decode("ascii") for match in TOKEN_PATTERN.finditer(raw)]


def _decode_hfwr_records(raw: bytes) -> tuple[dict[str, int | str | list[dict[str, int]]], list[dict[str, int | str | list[str]]]]:
    if len(raw) < HEADER_BYTES:
        raise PipelineError("HFWR MsgDat file is shorter than its 16-byte header")
    text_pointer_count = _read_u32(raw, 8)
    offset_table_count = _read_u32(raw, 12)
    aligned_offset_table_count = _aligned_dword_count(offset_table_count)
    payload_offset = HEADER_BYTES + aligned_offset_table_count * 4
    if payload_offset > len(raw):
        raise PipelineError("HFWR MsgDat offset table extends past end of file")
    offset_table = [
        {"index": index, "value": _read_u32(raw, HEADER_BYTES + index * 4)}
        for index in range(offset_table_count)
    ]
    layout: dict[str, int | str | list[dict[str, int]]] = {
        "format": "nul-terminated-cp932",
        "textPointerCount": text_pointer_count,
        "offsetTableCount": offset_table_count,
        "alignedOffsetTableCount": aligned_offset_table_count,
        "offsetTableFileOffset": HEADER_BYTES,
        "payloadOffset": payload_offset,
        "payloadBytes": len(raw) - payload_offset,
        "offsetTable": offset_table,
    }
    records: list[dict[str, int | str | list[str]]] = []
    cursor = payload_offset
    for record_id in range(text_pointer_count):
        end = raw.find(b"\x00", cursor)
        if end < 0:
            raise PipelineError(f"HFWR MsgDat record {record_id} is missing a NUL terminator")
        record_raw = raw[cursor:end]
        records.append(
            {
                "id": record_id,
                "idHex": f"0x{record_id:04x}",
                "offset": cursor,
                "byteLength": len(record_raw),
                "encoding": "cp932",
                "text": record_raw.decode("cp932"),
                "tokens": _record_tokens(record_raw),
            }
        )
        cursor = end + 1
    return layout, records


def _decode_gfwr_records(raw: bytes) -> tuple[dict[str, int | str], list[dict[str, int | str]]]:
    if len(raw) < HEADER_BYTES:
        raise PipelineError("GFWR MsgDat file is shorter than its 16-byte header")
    record_count = _read_u32(raw, 12)
    layout = {
        "format": "length-prefixed-utf16le",
        "recordCount": record_count,
        "payloadOffset": HEADER_BYTES,
        "payloadBytes": len(raw) - HEADER_BYTES,
    }
    records: list[dict[str, int | str]] = []
    cursor = HEADER_BYTES
    for record_id in range(record_count):
        if cursor + 4 > len(raw):
            raise PipelineError(f"GFWR MsgDat record {record_id} is missing its length field")
        char_count = _read_u32(raw, cursor)
        text_offset = cursor + 4
        byte_length = char_count * 2
        end = text_offset + byte_length
        if end > len(raw):
            raise PipelineError(f"GFWR MsgDat record {record_id} extends past end of file")
        records.append(
            {
                "id": record_id,
                "idHex": f"0x{record_id:04x}",
                "offset": text_offset,
                "charLength": char_count,
                "encoding": "utf-16le",
                "text": raw[text_offset:end].decode("utf-16le"),
            }
        )
        cursor = end
    return layout, records


def index_msgdat_file(path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    magic = raw[:4]
    if magic not in SUPPORTED_MAGICS:
        raise PipelineError(f"{path} has unsupported MsgDat magic {magic!r}")
    match magic:
        case b"HFWR":
            layout, records = _decode_hfwr_records(raw)
            text_candidates = _decode_text_candidates(raw)
        case b"GFWR":
            layout, records = _decode_gfwr_records(raw)
            text_candidates = []
        case unreachable:
            raise AssertionError(f"unreachable MsgDat magic: {unreachable!r}")
    return {
        "path": path.name,
        "size": len(raw),
        "magic": magic.decode("ascii"),
        "layout": layout,
        "records": records,
        "tokens": _tokens(raw),
        "textCandidates": text_candidates,
    }


def build_msgdat_index(source: Path) -> dict[str, object]:
    if not source.exists():
        raise MissingSourceError(f"{source} does not exist")
    if not source.is_dir():
        raise PipelineError(f"{source} is not a directory")

    files = [index_msgdat_file(path) for path in sorted(source.glob("*.dat"))]
    return {
        "source": str(source),
        "schema": {
            "containerMagics": sorted(magic.decode("ascii") for magic in SUPPORTED_MAGICS),
            "tokenPattern": "$<field>$",
            "textEncoding": "cp932",
            "notes": [
                "MsgDat files are binary containers; offsets are byte offsets in the source file.",
                "HFWR records follow the client loader: header textPointerCount, aligned offset table, then NUL-terminated CP932 strings.",
                "GFWR records are length-prefixed UTF-16LE strings.",
                "Text candidates are conservative CP932 spans and are not yet full record boundaries.",
            ],
        },
        "files": files,
    }


def write_msgdat_index(source: Path, destination: Path) -> None:
    index = build_msgdat_index(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
