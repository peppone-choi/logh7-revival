from __future__ import annotations

import json
import re
from pathlib import Path

from logh7_iso import MissingSourceError, PipelineError


SUPPORTED_MAGICS = {b"HFWR", b"GFWR"}
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


def index_msgdat_file(path: Path) -> dict[str, object]:
    raw = path.read_bytes()
    magic = raw[:4]
    if magic not in SUPPORTED_MAGICS:
        raise PipelineError(f"{path} has unsupported MsgDat magic {magic!r}")
    return {
        "path": path.name,
        "size": len(raw),
        "magic": magic.decode("ascii"),
        "tokens": _tokens(raw),
        "textCandidates": _decode_text_candidates(raw) if magic == b"HFWR" else [],
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
                "Text candidates are conservative CP932 spans and are not yet full record boundaries.",
            ],
        },
        "files": files,
    }


def write_msgdat_index(source: Path, destination: Path) -> None:
    index = build_msgdat_index(source)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
