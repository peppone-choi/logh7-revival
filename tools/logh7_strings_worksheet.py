"""Build a JP->KO translation worksheet from the REAL LOGH VII MsgDat files.

Task A of docs/logh7-localization-collab-request.md. Ground-truth only: the
Japanese source text is decoded directly from the extracted client's
``data/MsgDat/*.dat`` (HFWR/GFWR containers) via :mod:`logh7_msgdat`, whose output
has been byte-verified 1:1 against the client (9582/9582 records). The current
Korean column is taken from the project's manual translation catalog
(``content/localization/constmsg-ko.json``, keyed by constmsg.dat record id).

Every row carries the original CP932 byte length as ``jp_byte_len`` -- the slot's
reference budget for a length-safe CP949 re-encode (see
``tools/logh7_msgdat_encode.py``; the HFWR offset table is record-index based, so a
translation MAY exceed this, but the original length is the canonical reference the
worksheet reports).

Cross-platform, standard-library only (macOS friendly). Deterministic output.

Usage:
    python3 tools/logh7_strings_worksheet.py \
        --msgdat <dir with *.dat>  \
        --ko content/localization/constmsg-ko.json \
        --out-json content/localization/strings-worksheet.json \
        --out-tsv  content/localization/strings-worksheet.tsv

If --msgdat is omitted the tool auto-locates the extracted client MsgDat under
``.omo/work/installed`` (the directory holding ``constmsg.dat``).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Final

# logh7_msgdat lives next to this file and imports its siblings (logh7_iso) by bare name.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_msgdat import index_msgdat_file  # noqa: E402

TOKEN_RE: Final = re.compile(r"\$[A-Za-z0-9_]+\$")
# Kana + CJK ideographs + halfwidth katakana: "does this string still contain Japanese?"
JP_RE: Final = re.compile(r"[぀-ヿ㐀-鿿ｦ-ﾝ]")


def _has_japanese(text: str) -> bool:
    return bool(JP_RE.search(text))


def _strip_tokens(text: str) -> str:
    return TOKEN_RE.sub("", text)


def _classify(jp: str, ko: str | None) -> str:
    """translated | untranslated | no-text | empty (status of a single record)."""
    if jp == "":
        return "empty"
    if ko is not None and ko != "":
        return "translated"
    # Non-empty source: does it actually contain Japanese that needs translating?
    if _has_japanese(_strip_tokens(jp)):
        return "untranslated"
    return "no-text"  # pure tokens / ascii / numbers / symbols -- nothing to translate


def _cp932_len(text: str) -> int:
    try:
        return len(text.encode("cp932"))
    except UnicodeEncodeError:
        # Should not happen for text decoded from cp932, but stay total.
        return len(text.encode("cp932", errors="replace"))


def _locate_msgdat() -> Path | None:
    root = Path(".omo/work/installed")
    if not root.exists():
        return None
    for cand in sorted(root.rglob("constmsg.dat")):
        return cand.parent
    return None


def _load_ko(path: Path | None) -> dict[int, str]:
    if path is None or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    raw = data.get("translations", data) if isinstance(data, dict) else data
    out: dict[int, str] = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            if str(key).startswith("_"):
                continue
            try:
                out[int(key)] = str(value)
            except (TypeError, ValueError):
                continue
    return out


def build_worksheet(msgdat_dir: Path, ko_map: dict[int, str]) -> dict[str, object]:
    rows: list[dict[str, object]] = []
    dat_files = sorted(msgdat_dir.glob("*.dat"))
    if not dat_files:
        raise SystemExit(f"no .dat files under {msgdat_dir}")
    for dat in dat_files:
        name = dat.name
        index = index_msgdat_file(dat)
        is_constmsg = name == "constmsg.dat"
        for rec in index["records"]:
            rid = int(rec["id"])
            jp = str(rec["text"])
            ko = ko_map.get(rid) if is_constmsg else None
            rows.append(
                {
                    "source": name,
                    "id": rid,
                    "offset": int(rec.get("offset", 0)),
                    "status": _classify(jp, ko),
                    "jp_byte_len": _cp932_len(jp),
                    "jp": jp,
                    "ko": ko,
                    "tokens": TOKEN_RE.findall(jp),
                }
            )
    by_status: dict[str, int] = {}
    by_file: dict[str, dict[str, int]] = {}
    for r in rows:
        st = str(r["status"])
        by_status[st] = by_status.get(st, 0) + 1
        fb = by_file.setdefault(str(r["source"]), {})
        fb[st] = fb.get(st, 0) + 1
    return {
        "_purpose": "Task A JP->KO translation worksheet, decoded from the real client MsgDat (ground truth).",
        "_jp_source": str(msgdat_dir),
        "_ko_source": "content/localization/constmsg-ko.json (constmsg.dat record ids)",
        "_jp_byte_len_meaning": "original CP932 byte length of the record = reference slot budget for length-safe CP949 re-encode",
        "_status_legend": {
            "translated": "ko present",
            "untranslated": "Japanese text present, no ko yet (Task A target)",
            "no-text": "tokens/ascii/numbers only -- nothing to translate",
            "empty": "blank slot",
        },
        "_counts": {"total": len(rows), "by_status": by_status},
        "_by_file": by_file,
        "rows": rows,
    }


def write_tsv(worksheet: dict[str, object], path: Path) -> None:
    cols = ["source", "id", "status", "jp_byte_len", "jp", "ko", "tokens"]
    lines = ["\t".join(cols)]
    for r in worksheet["rows"]:  # type: ignore[index]
        jp = str(r["jp"]).replace("\t", " ").replace("\n", "\\n").replace("\r", "")
        ko = "" if r["ko"] is None else str(r["ko"]).replace("\t", " ").replace("\n", "\\n")
        tokens = ",".join(r["tokens"])  # type: ignore[arg-type]
        lines.append(
            "\t".join([str(r["source"]), str(r["id"]), str(r["status"]), str(r["jp_byte_len"]), jp, ko, tokens])
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the LOGH VII JP->KO string worksheet from real MsgDat.")
    parser.add_argument("--msgdat", type=Path, default=None, help="dir with the real *.dat files")
    parser.add_argument("--ko", type=Path, default=Path("content/localization/constmsg-ko.json"))
    parser.add_argument("--out-json", type=Path, default=Path("content/localization/strings-worksheet.json"))
    parser.add_argument("--out-tsv", type=Path, default=Path("content/localization/strings-worksheet.tsv"))
    args = parser.parse_args()

    msgdat_dir = args.msgdat or _locate_msgdat()
    if msgdat_dir is None or not msgdat_dir.exists():
        print("could not locate MsgDat dir; pass --msgdat <dir>", file=sys.stderr)
        return 1
    ko_map = _load_ko(args.ko)
    worksheet = build_worksheet(msgdat_dir, ko_map)
    args.out_json.parent.mkdir(parents=True, exist_ok=True)
    args.out_json.write_text(json.dumps(worksheet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_tsv(worksheet, args.out_tsv)

    counts = worksheet["_counts"]
    print(json.dumps({"msgdat": str(msgdat_dir), "ko_entries": len(ko_map), "counts": counts,
                      "out_json": str(args.out_json), "out_tsv": str(args.out_tsv)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
