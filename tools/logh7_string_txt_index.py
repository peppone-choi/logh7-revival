#!/usr/bin/env python
"""LANE 1 - String.txt master string/name table extractor.

Fully enumerates every string in exe/String.txt (cp932 / Shift-JIS, the GDI ANSI
client encoding) with its 1-based line index, classifies each, diffs against
String.txt.original, and writes content/extracted/strings-index.json plus a
names subset.

ABSOLUTE RULE: no value is invented. Every record is a byte-for-byte decode of a
line in the source file. Classification heuristics are documented per category.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / ".omo/work/logh7-installed/exe/String.txt"
ORIG = REPO / ".omo/work/logh7-installed/exe/String.txt.original"
OUT_DIR = REPO / "content/extracted"
OUT_INDEX = OUT_DIR / "strings-index.json"
OUT_NAMES = OUT_DIR / "strings-names.json"

# Katakana block (proper-name heuristic: LOGH JP names are katakana).
KATAKANA = re.compile(r"[゠-ヿㇰ-ㇿ]")
HAS_CJK = re.compile(r"[一-鿿぀-ゟ゠-ヿ]")
# $token$ message-template markers.
TOKEN = re.compile(r"\$[^$]+\$")

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
    # Full-sentence JP message (ends with 。 or contains failure/result verbs).
    if s.endswith("。") or "ました" in s or "ません" in s or "できません" in s:
        return "message_template"
    # Katakana-dominant short token with no CJK kanji could be a proper name,
    # but bare UI nouns (ラジオボタン, タイトル) are katakana loanwords, not names.
    # Treat katakana-only strings as ui_label unless they look like a personal
    # name (contains the middle-dot ・ used to separate given/family in JP).
    if "・" in s and KATAKANA.search(s):
        return "character_name"
    # Default for short CJK labels.
    return "ui_label"


def main() -> int:
    raw = SRC.read_bytes()
    raw_orig = ORIG.read_bytes() if ORIG.exists() else None

    # Normalize CRLF/LF, split into lines (keep every line including blanks).
    text = raw.replace(b"\r\n", b"\n")
    lines = text.split(b"\n")
    # A trailing newline yields a final empty element; drop only a single
    # trailing empty produced by a terminating newline so indices stay honest.
    if lines and lines[-1] == b"":
        lines = lines[:-1]

    records = []
    for i, b in enumerate(lines, start=1):
        try:
            decoded = b.decode("cp932")
            decode_ok = True
        except UnicodeDecodeError:
            decoded = b.decode("cp932", errors="replace")
            decode_ok = False
        rec = {"index": i, "text": decoded, "category": classify(decoded)}
        if not decode_ok:
            rec["decode_error"] = True
            rec["raw_hex"] = b.hex()
        records.append(rec)

    name_categories = {
        "character_name", "ship_name", "system_name", "planet_name",
        "faction", "rank", "post",
    }
    names = [r for r in records if r["category"] in name_categories]

    # Category histogram.
    hist: dict[str, int] = {}
    for r in records:
        hist[r["category"]] = hist.get(r["category"], 0) + 1

    identical = raw_orig is not None and raw == raw_orig

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index_doc = {
        "_source": str(SRC.relative_to(REPO)).replace("\\", "/"),
        "_encoding": "cp932 (Shift-JIS); client renders via GDI ANSI",
        "_note": (
            "This installed exe/String.txt is a 927-byte UI-string fragment "
            "(header marker '吸出し start' = JP 'dump/extract start', followed by "
            "a 40-entry block repeated 3x). It is NOT the ~43K-string master name "
            "table referenced elsewhere; no character/ship/system/planet name rows "
            "exist in this file. byte-identical to String.txt.original."
        ),
        "_diff_vs_original": {
            "original_present": raw_orig is not None,
            "byte_identical": identical,
            "installed_bytes": len(raw),
            "original_bytes": len(raw_orig) if raw_orig is not None else None,
        },
        "_counts": {
            "records": len(records),
            "unique_texts": len({r["text"] for r in records}),
            "names": len(names),
            "by_category": dict(sorted(hist.items(), key=lambda kv: -kv[1])),
        },
        "strings": records,
    }
    OUT_INDEX.write_text(
        json.dumps(index_doc, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    names_doc = {
        "_source": index_doc["_source"],
        "_note": "Name-category subset of strings-index.json. Empty here: this "
                 "fragment contains no proper-name rows.",
        "count": len(names),
        "names": names,
    }
    OUT_NAMES.write_text(
        json.dumps(names_doc, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    print(f"records={len(records)} names={len(names)} "
          f"unique={index_doc['_counts']['unique_texts']} "
          f"byte_identical_to_original={identical}")
    print("by_category=", index_doc["_counts"]["by_category"])
    print(f"wrote {OUT_INDEX.relative_to(REPO)}")
    print(f"wrote {OUT_NAMES.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
