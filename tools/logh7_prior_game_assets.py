from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
import time
import zlib
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont


FACTIONS = {
    "doumei": {"label": "Free Planets Alliance", "label_ko": "자유행성동맹"},
    "teikoku": {"label": "Galactic Empire", "label_ko": "은하제국"},
}

TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
BIG_RE = re.compile(r"<big[^>]*>(.*?)</big>", re.IGNORECASE | re.DOTALL)
SPAN_RE = re.compile(r"<span[^>]*>(.*?)</span>", re.IGNORECASE | re.DOTALL)
IMG_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+?\.jpg)[\"'][^>]*>", re.IGNORECASE | re.DOTALL)
ALT_RE = re.compile(r"alt=[\"']([^\"']*)[\"']", re.IGNORECASE | re.DOTALL)
CHARSET_RE = re.compile(r"charset=([A-Za-z0-9_\-]+)", re.IGNORECASE)


def repo_relative(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def strip_markup(value: str | None) -> str | None:
    if not value:
        return None
    value = re.sub(r"<[^>]+>", " ", value)
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def decode_html(path: Path) -> tuple[str, str]:
    raw = path.read_bytes()
    head = raw[:2048].decode("ascii", errors="ignore")
    candidates: list[str] = []
    match = CHARSET_RE.search(head)
    if match:
        candidates.append(match.group(1).lower().replace("shift_jis", "cp932").replace("x-sjis", "cp932"))
    candidates.extend(["utf-8", "cp932", "shift_jis"])
    seen: set[str] = set()
    for encoding in candidates:
        if encoding in seen:
            continue
        seen.add(encoding)
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw.decode("cp932", errors="replace"), "cp932-replace"


def parse_vi_help_entry(htm_path: Path, faction: str) -> dict[str, Any] | None:
    text, encoding = decode_html(htm_path)
    image_match = IMG_RE.search(text)
    if not image_match:
        return None

    image_name = image_match.group(1).replace("\\", "/").split("/")[-1]
    image_path = htm_path.with_name(image_name)
    if not image_path.exists():
        return None

    title = strip_markup(TITLE_RE.search(text).group(1) if TITLE_RE.search(text) else None)
    full_name = strip_markup(BIG_RE.search(text).group(1) if BIG_RE.search(text) else None)
    alt = strip_markup(ALT_RE.search(image_match.group(0)).group(1) if ALT_RE.search(image_match.group(0)) else None)
    romanized = None
    for span in SPAN_RE.findall(text):
        clean = strip_markup(span)
        if clean and re.search(r"[A-Za-z]", clean):
            romanized = clean
            break

    with Image.open(image_path) as img:
        width, height = img.size

    display = full_name or title or alt or htm_path.stem
    return {
        "identifier": f"vi_help_{faction}_{htm_path.stem}",
        "title": display,
        "short_name_ja": title,
        "name_ja": full_name or title,
        "name_en": romanized,
        "image_alt": alt,
        "role": "prior_game_vi_help_portrait",
        "game": "Ginga Eiyuu Densetsu VI",
        "faction": faction,
        "faction_label": FACTIONS[faction]["label"],
        "faction_label_ko": FACTIONS[faction]["label_ko"],
        "source_name": f"LOGH VI help {faction}/{htm_path.name}",
        "source_url": None,
        "source_path": repo_relative(htm_path),
        "local_path": repo_relative(image_path),
        "status": "exists",
        "confidence_cap": 0.92,
        "width": width,
        "height": height,
        "encoding": encoding,
    }


def harvest_vi_help(root: Path) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    skipped: list[str] = []
    for faction in FACTIONS:
        faction_dir = root / faction
        for htm_path in sorted(faction_dir.glob("*.htm")):
            entry = parse_vi_help_entry(htm_path, faction)
            if entry:
                entries.append(entry)
            else:
                skipped.append(repo_relative(htm_path))
    return {
        "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "_method": "LOGH VI local HTML help portrait harvest; immediate doumei/teikoku person directories only",
        "_counts": {
            "entries": len(entries),
            "skipped_html_without_portraits": len(skipped),
            "by_faction": {faction: sum(1 for e in entries if e["faction"] == faction) for faction in FACTIONS},
        },
        "entries": entries,
        "skipped": skipped,
    }


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


def fit_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = list(text)
    lines: list[str] = []
    current = ""
    for char in words:
        trial = current + char
        bbox = draw.textbbox((0, 0), trial, font=font)
        if bbox[2] - bbox[0] <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines[:3]


def write_contact_sheet(entries: list[dict[str, Any]], out_path: Path, columns: int = 8) -> None:
    thumb_w, thumb_h = 80, 120
    tile_w, tile_h = 210, 178
    rows = max(1, math.ceil(len(entries) / columns))
    sheet = Image.new("RGB", (columns * tile_w, rows * tile_h), (248, 248, 246))
    draw = ImageDraw.Draw(sheet)
    label_font = load_font(14)
    small_font = load_font(11)
    for index, entry in enumerate(entries):
        col = index % columns
        row = index // columns
        x = col * tile_w
        y = row * tile_h
        draw.rectangle((x, y, x + tile_w - 1, y + tile_h - 1), outline=(210, 210, 205))
        with Image.open(entry["local_path"]) as img:
            img = img.convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(img, (x + 8, y + 8))
        title = entry.get("name_ja") or entry.get("title") or entry["identifier"]
        for line_index, line in enumerate(fit_text(draw, title, label_font, tile_w - thumb_w - 24)):
            draw.text((x + thumb_w + 16, y + 10 + line_index * 18), line, fill=(24, 28, 36), font=label_font)
        romanized = entry.get("name_en") or ""
        if romanized:
            draw.text((x + thumb_w + 16, y + 74), romanized[:28], fill=(68, 76, 90), font=small_font)
        draw.text((x + thumb_w + 16, y + 132), entry["identifier"].replace("vi_help_", ""), fill=(86, 92, 102), font=small_font)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_path)


def load_palette(path: Path) -> list[int]:
    data = path.read_bytes()
    palette = data[2 : 2 + 768] if len(data) >= 770 else data[:768]
    if len(palette) < 768:
        raise ValueError(f"palette is too short: {path}")
    return list(palette[:768])


def decode_gdt(path: Path, palette: list[int]) -> tuple[Image.Image, dict[str, Any]]:
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError("GDT file is too short")
    width = int.from_bytes(data[4:6], "little")
    height = int.from_bytes(data[6:8], "little")
    raw = zlib.decompress(data[18:])
    expected = width * height
    if len(raw) != expected:
        raise ValueError(f"unexpected raw size {len(raw)} for {width}x{height}")
    img = Image.frombytes("P", (width, height), raw)
    img.putpalette(palette)
    img = img.transpose(Image.Transpose.FLIP_TOP_BOTTOM).convert("RGB")
    return img, {"width": width, "height": height, "raw_size": len(raw)}


def decode_v_gdt(root: Path, palette_path: Path, out_dir: Path, only_sizes: set[str] | None, max_files: int | None) -> dict[str, Any]:
    palette = load_palette(palette_path)
    entries: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    for gdt_path in sorted(root.rglob("*.gdt")):
        if max_files is not None and len(entries) >= max_files:
            break
        try:
            img, meta = decode_gdt(gdt_path, palette)
        except Exception as exc:  # noqa: BLE001 - file corpus includes mixed binary formats.
            failures.append({"path": repo_relative(gdt_path), "error": str(exc)})
            continue
        size_key = f"{meta['width']}x{meta['height']}"
        if only_sizes and size_key not in only_sizes:
            continue
        rel = gdt_path.resolve().relative_to(root.resolve())
        out_path = out_dir / rel.with_suffix(".png")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(out_path)
        entries.append(
            {
                "identifier": f"v_gdt_{rel.with_suffix('').as_posix().replace('/', '_')}",
                "title": rel.as_posix(),
                "role": "prior_game_v_gdt_decoded_screen",
                "game": "Ginga Eiyuu Densetsu V",
                "source_name": f"LOGH V GDT {rel.as_posix()}",
                "source_url": None,
                "source_path": repo_relative(gdt_path),
                "local_path": repo_relative(out_path),
                "status": "exists",
                "width": meta["width"],
                "height": meta["height"],
                "raw_size": meta["raw_size"],
            }
        )
    return {
        "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "_method": "LOGH V GDT header + zlib stream decode with palref.pdt palette and bottom-up flip",
        "_counts": {"entries": len(entries), "failures": len(failures)},
        "entries": entries,
        "failures": failures[:200],
    }


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Harvest and normalize prior LOGH game portrait assets.")
    sub = parser.add_subparsers(dest="command", required=True)

    vi = sub.add_parser("vi-help", help="Harvest LOGH VI help portrait JPGs and labels.")
    vi.add_argument("--root", type=Path, required=True)
    vi.add_argument("--out", type=Path, required=True)
    vi.add_argument("--contact-sheet", type=Path)

    gdt = sub.add_parser("decode-v-gdt", help="Decode LOGH V .gdt zlib/palette image files.")
    gdt.add_argument("--root", type=Path, required=True)
    gdt.add_argument("--palette", type=Path, required=True)
    gdt.add_argument("--out-dir", type=Path, required=True)
    gdt.add_argument("--manifest-out", type=Path, required=True)
    gdt.add_argument("--only-sizes", help="Comma-separated size allowlist such as 160x110,128x128.")
    gdt.add_argument("--max-files", type=int)

    args = parser.parse_args(argv)
    if args.command == "vi-help":
        manifest = harvest_vi_help(args.root)
        write_json(args.out, manifest)
        if args.contact_sheet:
            write_contact_sheet(manifest["entries"], args.contact_sheet)
        print(json.dumps(manifest["_counts"], ensure_ascii=False, indent=2))
        return 0

    if args.command == "decode-v-gdt":
        only_sizes = {s.strip() for s in args.only_sizes.split(",") if s.strip()} if args.only_sizes else None
        manifest = decode_v_gdt(args.root, args.palette, args.out_dir, only_sizes, args.max_files)
        write_json(args.manifest_out, manifest)
        print(json.dumps(manifest["_counts"], ensure_ascii=False, indent=2))
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
