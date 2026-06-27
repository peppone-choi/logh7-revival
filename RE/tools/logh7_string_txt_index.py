#!/usr/bin/env python
"""LANE 1 - String.txt runtime/original string fragment extractor.

Fully enumerates every string in exe/String.txt with its 1-based line index,
classifies each, diffs against the runtime backup, and records the preserved
original Japanese reference when present.

ABSOLUTE RULE: no value is invented. Every record is a byte-for-byte decode of a
line in the source file. Classification heuristics are documented per category.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / ".omo/work/logh7-installed/exe/String.txt"
ORIG = REPO / ".omo/work/logh7-installed/exe/String.txt.original"
ORIGINAL_REF = REPO / ".omo/work/logh7-installed/exe/String.txt.jpbak"
OUT_DIR = REPO / "content/extracted"
OUT_INDEX = OUT_DIR / "strings-index.json"
OUT_NAMES = OUT_DIR / "strings-names.json"

# Katakana block (proper-name heuristic: LOGH JP names are katakana).
KATAKANA = re.compile(r"[゠-ヿㇰ-ㇿ]")
HAS_CJK = re.compile(r"[一-鿿぀-ゟ゠-ヿ가-힣]")
# $token$ message-template markers.
TOKEN = re.compile(r"\$[^$]+\$")
GOOD_TEXT = re.compile(r"[一-鿿぀-ゟ゠-ヿ가-힣]")
BAD_TEXT = re.compile(r"[\ufffd\ue000-\uf8ff]")
ENCODINGS = ("cp932", "cp949")
BAD_ASSIGNMENT_MARKERS = ("통일황제", "통일왕조")

# Known faction / rank / post vocabulary (LOGH canon, used only to label strings
# that literally equal these words -- never to inject a value).
FACTIONS = {"帝国", "同盟", "銀河帝国", "自由惑星同盟", "フェザーン", "地球教"}
RANKS = {
    "元帥", "上級大将", "大将", "中将", "少将", "准将",
    "大佐", "中佐", "少佐", "大尉", "中尉", "少尉", "准尉", "兵長",
}
POSTS = {"皇帝", "宇宙艦隊司令長官", "軍務尚書", "統帥本部総長", "参謀長", "議長", "最高評議会議長"}


def classify(text: str) -> str:
    """Return one of the task's category labels for a single string.

    Heuristics (documented, deterministic):
      faction / rank / post : exact match against LOGH canon vocab sets.
      message_template       : contains a $token$ marker OR is a full sentence
                               (ends with the JP full-stop, contains failure verbs).
      ui_label               : short CJK label with no sentence terminator.
      character_name etc.    : katakana proper-name heuristic (no name table here).
      other                  : empty, numeric, single ASCII letters, markers.
    """
    s = text.strip()
    if s == "":
        return "other"
    if s in FACTIONS:
        return "faction"
    if s in RANKS:
        return "rank"
    if s in POSTS:
        return "post"
    if TOKEN.search(s):
        return "message_template"
    # Pure numeric / single ASCII placeholder values.
    if re.fullmatch(r"-?\d+", s) or re.fullmatch(r"[A-Za-z]", s):
        return "other"
    if not HAS_CJK.search(s):
        # ASCII / latin token with no CJK and no $token$ -> opaque placeholder.
        return "other"
    # Full-sentence JP/KR message (ends with punctuation or contains result verbs).
    if (
        s.endswith(("。", "."))
        or "ました" in s
        or "ません" in s
        or "できません" in s
        or "했습니다" in s
        or "않습니다" in s
    ):
        return "message_template"
    # Katakana-dominant short token with no CJK kanji could be a proper name,
    # but bare UI nouns (ラジオボタン, タイトル) are katakana loanwords, not names.
    # Treat katakana-only strings as ui_label unless they look like a personal
    # name (contains the middle-dot ・ used to separate given/family in JP).
    if "・" in s and KATAKANA.search(s):
        return "character_name"
    # Default for short CJK labels.
    return "ui_label"


class StringIndexError(RuntimeError):
    pass


def _decode(raw: bytes) -> tuple[str, str, bool]:
    best: tuple[int, str, str, bool] | None = None
    for encoding in ENCODINGS:
        try:
            text = raw.decode(encoding)
            decode_ok = True
        except UnicodeDecodeError:
            text = raw.decode(encoding, errors="replace")
            decode_ok = False
        score = (
            len(GOOD_TEXT.findall(text)) * 10
            - len(BAD_TEXT.findall(text)) * 30
            - text.count("\ufffd") * 50
            + (5 if decode_ok else 0)
        )
        candidate = (score, text, encoding, decode_ok)
        if best is None or candidate[0] > best[0]:
            best = candidate
    if best is None:
        raise StringIndexError("no supported String.txt encoding candidates")
    _, text, encoding, decode_ok = best
    return text, encoding, decode_ok


def _line_bytes(raw: bytes) -> list[bytes]:
    normalized = raw.replace(b"\r\n", b"\n")
    lines = normalized.split(b"\n")
    if lines and lines[-1] == b"":
        lines = lines[:-1]
    return lines


def _records(raw: bytes, encoding: str) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for index, line in enumerate(_line_bytes(raw), start=1):
        try:
            decoded = line.decode(encoding)
            decode_ok = True
        except UnicodeDecodeError:
            decoded = line.decode(encoding, errors="replace")
            decode_ok = False
        record: dict[str, Any] = {"index": index, "text": decoded, "category": classify(decoded)}
        if not decode_ok:
            record["decode_error"] = True
            record["raw_hex"] = line.hex()
        records.append(record)
    return records


def _histogram(records: list[dict[str, Any]]) -> dict[str, int]:
    hist: dict[str, int] = {}
    for record in records:
        category = str(record["category"])
        hist[category] = hist.get(category, 0) + 1
    return dict(sorted(hist.items(), key=lambda kv: -kv[1]))


def _relative(path: Path) -> str:
    try:
        return str(path.relative_to(REPO)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def _reference_doc(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists():
        return None
    raw = path.read_bytes()
    text, encoding, decode_ok = _decode(raw)
    return {
        "path": _relative(path),
        "encoding": encoding,
        "decode_ok": decode_ok,
        "bytes": len(raw),
        "records": len(_line_bytes(raw)),
        "first": text.replace("\r\n", "\n").split("\n", 1)[0],
    }


def _guard_contamination(raw: bytes) -> None:
    text, _, _ = _decode(raw)
    for marker in BAD_ASSIGNMENT_MARKERS:
        if marker in text:
            raise StringIndexError(
                f"contaminated assignment text in String.txt: {marker}"
            )


def build_index_document(
    source: Path = SRC,
    backup: Path | None = ORIG,
    original_reference: Path | None = ORIGINAL_REF,
) -> tuple[dict[str, Any], dict[str, Any]]:
    raw = source.read_bytes()
    _guard_contamination(raw)
    text, encoding, decode_ok = _decode(raw)
    raw_backup = backup.read_bytes() if backup is not None and backup.exists() else None

    records = _records(raw, encoding)

    name_categories: set[str] = {
        "character_name", "ship_name", "system_name", "planet_name",
        "faction", "rank", "post",
    }
    names = [record for record in records if record["category"] in name_categories]

    identical = raw_backup is not None and raw == raw_backup
    runtime_kind = "localized-runtime-fragment" if encoding == "cp949" else "original-runtime-fragment"

    index_doc = {
        "_source": _relative(source),
        "_encoding": encoding,
        "_decode_ok": decode_ok,
        "_runtimeStringKind": runtime_kind,
        "_note": (
            "The installed exe/String.txt is the small UI-string fragment used by the "
            "runtime, not the recovered large master-name table. The current playable "
            "tree may carry a CP949 Korean overlay; the original CP932 Japanese fragment "
            "is tracked separately in _original_reference when present. No proper-name "
            "rows exist in this fragment."
        ),
        "_diff_vs_backup": {
            "backup_present": raw_backup is not None,
            "byte_identical": identical,
            "installed_bytes": len(raw),
            "backup_bytes": len(raw_backup) if raw_backup is not None else None,
        },
        "_original_reference": _reference_doc(original_reference),
        "_counts": {
            "records": len(records),
            "unique_texts": len({str(record["text"]) for record in records}),
            "names": len(names),
            "by_category": _histogram(records),
        },
        "strings": records,
    }
    names_doc = {
        "_source": index_doc["_source"],
        "_note": "Name-category subset of strings-index.json. Empty here: this "
                 "fragment contains no proper-name rows.",
        "count": len(names),
        "names": names,
    }
    return index_doc, names_doc


def main() -> int:
    try:
        index_doc, names_doc = build_index_document()
    except (OSError, StringIndexError) as error:
        print(str(error), file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT_INDEX.write_text(
        json.dumps(index_doc, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    OUT_NAMES.write_text(
        json.dumps(names_doc, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    print(f"records={index_doc['_counts']['records']} names={names_doc['count']} "
          f"unique={index_doc['_counts']['unique_texts']} "
          f"byte_identical_to_backup={index_doc['_diff_vs_backup']['byte_identical']}")
    print("by_category=", index_doc["_counts"]["by_category"])
    print(f"wrote {OUT_INDEX.relative_to(REPO)}")
    print(f"wrote {OUT_NAMES.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
