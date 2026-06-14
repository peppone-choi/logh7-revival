"""Survey EVERY client data file: classify by magic, decode Shift-JIS text tables, inventory what
game data each holds. The original server data is gone, so the client's own files are the data
source (logh7-client-data-map) — this maps them exhaustively. Writes a JSON + text report (avoids
console encoding issues with Japanese).

Usage: python -m tools.logh7_data_survey [--root .omo/work/logh7-installed] [--out .omo/work/data-survey]
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

IMAGE = {".bmp", ".tga", ".jpg", ".jpeg", ".png"}
AUDIO = {".wav", ".ogg"}
MODEL = {".mdx", ".mds", ".vix"}


def classify_magic(head: bytes) -> str:
    if head[:4] == b"HFWR":
        return "hfwr-string-table"
    if head[:4] == b"GFWR":
        return "gfwr-table"
    if head[:4] == b"ViX ":
        return "vix-image-catalog"
    if head[:2] in (b"BM",):
        return "bmp"
    if head[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if head[:4] == b"\x89PNG":
        return "png"
    if head[:4] == b"%PDF":
        return "pdf"
    return "binary/unknown"


def decode_sjis(data: bytes) -> str:
    return data.decode("cp932", errors="ignore")


def extract_strings(text: str, min_len: int = 2) -> list[str]:
    out, cur = [], []
    for ch in text:
        printable = ch in "\t" or (ch.isprintable() and ch not in "\r")
        jp = "぀" <= ch <= "ヿ" or "一" <= ch <= "鿿" or "＀" <= ch <= "￯"
        if printable or jp:
            cur.append(ch)
        else:
            if len(cur) >= min_len:
                out.append("".join(cur).strip())
            cur = []
    if len(cur) >= min_len:
        out.append("".join(cur).strip())
    return [s for s in out if len(s) >= min_len]


def parse_hfwr(data: bytes) -> dict:
    # HFWR(4) + dword[1] + count?(dword@8) + dword@0xc + dword@0x10, then u32 offset table, then strings.
    import struct

    if len(data) < 20 or data[:4] != b"HFWR":
        return {"ok": False}
    d2 = struct.unpack_from("<I", data, 8)[0]
    d3 = struct.unpack_from("<I", data, 12)[0]
    return {"ok": True, "dword2": d2, "dword3": d3, "rawStringSample": extract_strings(decode_sjis(data), 2)[:40]}


def survey(root: Path) -> dict:
    report = {"root": str(root), "byClass": {}, "files": []}
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        size = path.stat().st_size
        entry = {"path": str(path.relative_to(root)), "size": size, "ext": ext}
        if ext in IMAGE:
            entry["class"] = "image"
        elif ext in AUDIO:
            entry["class"] = "audio"
        elif ext in MODEL:
            entry["class"] = "model"
        else:
            head = path.read_bytes()[:16] if size else b""
            cls = classify_magic(head)
            entry["class"] = cls
            if cls in ("hfwr-string-table", "gfwr-table") or ext in (".txt", ".dat", ".hed"):
                data = path.read_bytes()
                strings = extract_strings(decode_sjis(data))
                entry["stringCount"] = len(strings)
                entry["sample"] = strings[:25]
                if cls == "hfwr-string-table":
                    entry["hfwr"] = parse_hfwr(data)
        report["files"].append(entry)
        report["byClass"][entry["class"]] = report["byClass"].get(entry["class"], 0) + 1
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--root", default=".omo/work/logh7-installed")
    ap.add_argument("--out", default=".omo/work/data-survey")
    args = ap.parse_args()
    root = Path(args.root)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    report = survey(root)
    (out / "survey.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    # readable summary
    lines = [f"# Client data survey: {root}", f"file classes: {report['byClass']}", ""]
    text_files = [f for f in report["files"] if "sample" in f]
    lines.append(f"## {len(text_files)} text/data files (decoded Shift-JIS):")
    for f in sorted(text_files, key=lambda x: -x.get("stringCount", 0)):
        lines.append(f"\n### {f['path']}  ({f['size']}B, {f.get('stringCount', 0)} strings, {f['class']})")
        for s in f["sample"][:12]:
            lines.append(f"    {s}")
    (out / "summary.txt").write_text("\n".join(lines), encoding="utf-8")
    print(f"surveyed {len(report['files'])} files -> {out}/survey.json + summary.txt")
    print(f"classes: {report['byClass']}")
    print(f"text/data files with strings: {len(text_files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
