from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Final

from logh7_iso import MissingSourceError, PipelineError


SUPPORTED_MAGICS: Final = {b"HFWR", b"GFWR"}
HEADER_BYTES: Final = 16
HFWR_TEXT_ENCODINGS: Final[tuple[str, ...]] = ("cp932", "cp949")
TOKEN_PATTERN = re.compile(rb"\$[A-Za-z0-9_]+\$")
TEXT_TOKEN_PATTERN = re.compile(r"\$[A-Za-z0-9_]+\$")


def _has_cjk_text(text: str) -> bool:
    return any(
        "\u3040" <= char <= "\u30ff" or "\u3400" <= char <= "\u9fff" or "\uac00" <= char <= "\ud7af"
        for char in text
    )


def _text_encoding_score(text: str, encoding: str) -> int:
    score = 0
    if encoding == "cp932":
        score += 5
        if not any("\uac00" <= char <= "\ud7af" for char in text):
            score += 10
    for char in text:
        if "\uac00" <= char <= "\ud7af":
            score += 10
        elif "\u3040" <= char <= "\u30ff" or "\u3400" <= char <= "\u9fff":
            score += 20
        elif "\uff00" <= char <= "\uffef" and not ("\uff61" <= char <= "\uff9f"):
            score += 5
        elif "\uff61" <= char <= "\uff9f":
            score -= 8
        elif "\ue000" <= char <= "\uf8ff":
            score -= 20
    return score


def _correct_cp949_misread(text_cp932: str) -> str | None:
    """cp932로 디코드된 텍스트가 실은 cp949 한글의 오판독(mojibake)인지 판별해, 맞으면 cp949 복원값 반환.

    점수 휴리스틱은 짧은 한글 라벨(예: 3자 '사기값')에서 cp932 한자 가산점(+20/자)이 한글(+10/자)을
    눌러 mojibake를 채택하는 약점이 있다(긴 한글은 정상). 지문 기반 교정:
      (1) cp932 해석에 반각가나가 섞여 있어야 한다(cp949 한글 바이트가 cp932로 오판독될 때의 흔적).
          진짜 한자/히라가나 문자열(移動·の終了)은 반각가나가 없어 트리거되지 않는다.
      (2) 같은 바이트를 cp949로 재해독하면 한글이 나오고, 반각가나/PUA/일본어 가나·한자가 섞이지 않아야
          한다. 진짜 반각가나 일본어(ﾍﾙﾌﾟ→梏璟)는 cp949 재해독이 한자가 되어 트리거되지 않는다.
    바이트 자체가 손상된 토큰(예: 캐논 함급명 잔존 ピ)은 (2)에서 걸러져 자동변경되지 않는다(캐논 복구로 남김)."""
    if not any(0xFF61 <= ord(c) <= 0xFF9F for c in text_cp932):
        return None
    try:
        rec = text_cp932.encode("cp932").decode("cp949")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return None
    has_hangul = any(0xAC00 <= ord(c) <= 0xD7A3 for c in rec)
    has_noise = any(
        0xFF61 <= ord(c) <= 0xFF9F  # 반각가나
        or 0xE000 <= ord(c) <= 0xF8FF  # PUA
        or 0x3040 <= ord(c) <= 0x30FF  # 히라가나/가타카나
        or 0x3400 <= ord(c) <= 0x9FFF  # CJK 한자
        for c in rec
    )
    return rec if (has_hangul and not has_noise) else None


def _decode_hfwr_text(raw: bytes) -> tuple[str, str]:
    best: tuple[int, str, str] | None = None
    for encoding in HFWR_TEXT_ENCODINGS:
        try:
            text = raw.decode(encoding)
        except UnicodeDecodeError:
            continue
        candidate = (_text_encoding_score(text, encoding), encoding, text)
        if best is None or candidate[0] > best[0]:
            best = candidate
    if best is None:
        raise PipelineError("HFWR MsgDat record is not decodable as cp932 or cp949")
    # 점수상 cp932가 뽑혔어도 짧은 한글 라벨 mojibake면 cp949로 교정(지문 기반, 진짜 일본어는 불변).
    if best[1] == "cp932":
        corrected = _correct_cp949_misread(best[2])
        if corrected is not None:
            return "cp949", corrected
    return best[1], best[2]


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
            encoding, decoded = _decode_hfwr_text(span)
        except PipelineError:
            continue
        text_start = 0
        for match in TEXT_TOKEN_PATTERN.finditer(decoded):
            part = decoded[text_start : match.start()]
            text_start = match.end()
            leading = len(part) - len(part.lstrip())
            text = part.strip()
            if len(text) < 2 or not _has_cjk_text(text):
                continue
            candidate_offset = start + len(decoded[: match.start() - len(part) + leading].encode(encoding))
            key = (candidate_offset, text)
            if key not in seen:
                seen.add(key)
                candidates.append({"offset": candidate_offset, "encoding": encoding, "text": text})
        part = decoded[text_start:]
        leading = len(part) - len(part.lstrip())
        text = part.strip()
        if len(text) >= 2 and _has_cjk_text(text):
            candidate_offset = start + len(decoded[:text_start + leading].encode(encoding))
            key = (candidate_offset, text)
            if key not in seen:
                seen.add(key)
                candidates.append({"offset": candidate_offset, "encoding": encoding, "text": text})
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


def _decode_hfwr_records(raw: bytes) -> tuple[dict[str, int | str | list[dict[str, int]] | list[str]], list[dict[str, int | str | list[str]]]]:
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
        "format": "nul-terminated-multibyte",
        "supportedTextEncodings": list(HFWR_TEXT_ENCODINGS),
        "textPointerCount": text_pointer_count,
        "offsetTableCount": offset_table_count,
        "alignedOffsetTableCount": aligned_offset_table_count,
        "offsetTableFileOffset": HEADER_BYTES,
        "payloadOffset": payload_offset,
        "payloadBytes": len(raw) - payload_offset,
        "offsetTable": offset_table,
    }
    records: list[dict[str, int | str | list[str]]] = []
    record_encodings: set[str] = set()
    cursor = payload_offset
    for record_id in range(text_pointer_count):
        end = raw.find(b"\x00", cursor)
        if end < 0:
            raise PipelineError(f"HFWR MsgDat record {record_id} is missing a NUL terminator")
        record_raw = raw[cursor:end]
        encoding, text = _decode_hfwr_text(record_raw)
        record_encodings.add(encoding)
        records.append(
            {
                "id": record_id,
                "idHex": f"0x{record_id:04x}",
                "offset": cursor,
                "byteLength": len(record_raw),
                "encoding": encoding,
                "text": text,
                "tokens": _record_tokens(record_raw),
            }
        )
        cursor = end + 1
    layout["recordEncodings"] = sorted(record_encodings)
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
            "textEncoding": "cp932/cp949 for HFWR, utf-16le for GFWR",
            "notes": [
                "MsgDat files are binary containers; offsets are byte offsets in the source file.",
                "HFWR records follow the client loader: header textPointerCount, aligned offset table, then NUL-terminated multibyte strings.",
                "Japanese retail files decode as CP932; localized installed files can contain CP949 records. Each record carries its selected encoding.",
                "GFWR records are length-prefixed UTF-16LE strings.",
                "Text candidates are conservative multibyte spans and are not yet full record boundaries.",
            ],
        },
        "files": files,
    }


def write_msgdat_index(source: Path, destination: Path) -> None:
    index = build_msgdat_index(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
