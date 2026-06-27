#!/usr/bin/env python3
"""TGA/texture pipeline — edit the game's textures in PNG, ship them back as a Layer-B asset overlay.

Most graphics are TGA, but the loader is D3DX8 CD3DXImage which dispatches on the file's CONTENT magic,
NOT the extension (docs/logh7-modding-architecture.md §B.1). So a texture can be edited in any modern
tool and shipped either as a TGA or as PNG bytes under the same `.tga` filename — both load. The path is
baked into the EXE, so the FILENAME must be preserved; the content format is free.

This tool:
  extract  : copy a texture dir's *.tga/*.bmp -> *.png (mirroring relative paths) for editing
  repack   : take edited PNGs -> write back as TGA (default) or keep-PNG-in-.tga-name, into an overlay dir
             that mirrors the install tree (ready to drop over the install, with backup)
Formats preserved: 24-bit (RGB) and 32-bit (RGBA, the TGA alpha the originals use).

Usage:
  python tools/logh7_texture_pipeline.py extract --src .omo/work/logh7-installed/data/image/strategy --out work/tex_edit
  python tools/logh7_texture_pipeline.py repack  --src work/tex_edit --out work/tex_overlay [--as-png]
Requires Pillow.
"""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

from PIL import Image

IMG_EXTS = {".tga", ".bmp", ".png", ".jpg", ".jpeg"}


def extract(src: Path, out: Path) -> int:
    n = 0
    for p in src.rglob("*"):
        if p.suffix.lower() not in IMG_EXTS or not p.is_file():
            continue
        rel = p.relative_to(src)
        dst = (out / rel).with_suffix(".png")
        dst.parent.mkdir(parents=True, exist_ok=True)
        img = Image.open(p)
        # keep alpha if present; record the original extension in the PNG filename stem suffix so repack
        # can restore the exact target name (e.g. foo.tga -> foo__tga.png)
        tagged = dst.with_name(f"{p.stem}__{p.suffix.lower().lstrip('.')}.png")
        img.save(tagged)
        n += 1
    return n


def repack(src: Path, out: Path, as_png: bool) -> int:
    n = 0
    for p in src.rglob("*.png"):
        # restore the original target filename from the `__ext` tag (default .tga if untagged)
        stem = p.stem
        if "__" in stem:
            base, ext = stem.rsplit("__", 1)
            target_name = f"{base}.{ext}"
        else:
            base, target_name = stem, f"{stem}.tga"
        rel = p.relative_to(src).with_name(target_name)
        dst = out / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        img = Image.open(p)
        if as_png:
            # PNG bytes under the .tga (or original) name — D3DX8 loads by content magic
            img.save(dst, format="PNG")
        else:
            # real TGA, preserving 32-bit alpha when present, else 24-bit
            mode = "RGBA" if img.mode in ("RGBA", "LA", "PA") or "transparency" in img.info else "RGB"
            img.convert(mode).save(dst, format="TGA")
        n += 1
    return n


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract")
    e.add_argument("--src", required=True)
    e.add_argument("--out", required=True)
    r = sub.add_parser("repack")
    r.add_argument("--src", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--as-png", action="store_true", help="ship PNG bytes under the .tga name (vs re-encode TGA)")
    args = ap.parse_args(argv)

    if args.cmd == "extract":
        n = extract(Path(args.src), Path(args.out))
        print(f"extracted {n} textures -> {args.out} (edit the PNGs; the `__ext` tag preserves the target name)")
    else:
        n = repack(Path(args.src), Path(args.out), args.as_png)
        fmt = "PNG-in-.tga-name" if args.as_png else "TGA"
        print(f"repacked {n} textures as {fmt} -> {args.out} (drop this overlay over the install; back up originals)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
