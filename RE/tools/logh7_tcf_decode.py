"""Decode LOGH VII character portraits (data/image/Face/*.tcf) — the per-character face images.

Format (reverse-engineered): each portrait region = 18-byte header + 256-color palette (BGRA, 4
bytes/entry = 1024B) + width*height 8-bit palette indices, stored BOTTOM-UP (flip vertically).
Header: palette_count u16@0, width u16@0x0c, height u16@0x0e, bpp u16@0x10. Typical 64x80, size 6162.

tcf.hed is the index: 8-byte entries [u32 offset][u32 size] addressing a virtual concatenation of
the .tcf atlases. An entry whose [offset,size] fits inside a given .tcf file belongs to that file.
The official site numbered portraits picture/chara/NNN.jpg with NNN == this global index (12 anchors:
Reinhard=209, Yang=206, Schenkopp=85, Mittermeyer=195, ...), so the index is the character's face id.

Usage:
  python -m tools.logh7_tcf_decode sheet --tcf gem.tcf --out sheet.png      # contact sheet of one atlas
  python -m tools.logh7_tcf_decode one --index 209 --out r.png             # one portrait by global index
"""
from __future__ import annotations

import argparse
import struct
from pathlib import Path

from PIL import Image, ImageDraw

FACE_DIR = Path(".omo/work/logh7-installed/data/image/Face")
ATLASES = ["gem.tcf", "gef.tcf", "gam.tcf", "gaf.tcf", "o.tcf", "oam.tcf", "oem.tcf"]


def decode_region(region: bytes) -> Image.Image | None:
    """Decode one portrait region to a PIL image (BGR palette, vertical flip).

    Validation is STRICT: the region length must EXACTLY equal 18 + 1024 + w*h. A loose "fits"
    check accepted garbage (slot 83 read from the wrong atlas decoded as a bogus 257x1 strip);
    a real portrait region always matches its declared dimensions byte-exactly.
    """
    if len(region) < 18 + 1024:
        return None
    w = struct.unpack_from("<H", region, 0x0c)[0]
    h = struct.unpack_from("<H", region, 0x0e)[0]
    if not (8 <= w <= 256 and 8 <= h <= 256) or 18 + 1024 + w * h != len(region):
        return None
    pal = region[18:18 + 1024]
    px = region[18 + 1024:18 + 1024 + w * h]
    img = Image.new("RGB", (w, h))
    img.putdata([(pal[i * 4 + 2], pal[i * 4 + 1], pal[i * 4 + 0]) for i in px])  # BGR -> RGB
    return img.transpose(Image.FLIP_TOP_BOTTOM)  # stored bottom-up


def load_hed(face_dir: Path) -> list[tuple[int, int]]:
    hed = (face_dir / "tcf.hed").read_bytes()
    return [struct.unpack_from("<II", hed, i * 8) for i in range(len(hed) // 8)]


def portraits_in_atlas(face_dir: Path, atlas: str) -> dict[int, Image.Image]:
    """Return {global_index: image} for every tcf.hed entry that fits inside this atlas file."""
    data = (face_dir / atlas).read_bytes()
    out: dict[int, Image.Image] = {}
    for idx, (off, sz) in enumerate(load_hed(face_dir)):
        if sz == 0 or off + sz > len(data):
            continue
        img = decode_region(data[off:off + sz])
        if img is not None:
            out[idx] = img
    return out


def contact_sheet(face_dir: Path, atlas: str, out: Path, cols: int = 12, scale: int = 1) -> int:
    ports = portraits_in_atlas(face_dir, atlas)
    items = sorted(ports.items())
    if not items:
        return 0
    cw, ch = 64 * scale, 80 * scale + 12
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw, rows * ch), (30, 30, 30))
    draw = ImageDraw.Draw(sheet)
    for n, (idx, img) in enumerate(items):
        r, c = divmod(n, cols)
        if scale != 1:
            img = img.resize((64 * scale, 80 * scale))
        sheet.paste(img, (c * cw, r * ch))
        draw.text((c * cw + 2, r * ch + 80 * scale), str(idx), fill=(255, 255, 0))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return len(items)


def dump_all(face_dir: Path, out_dir: Path, scale: int = 1) -> int:
    """Decode every tcf.hed entry that resolves in any atlas to out_dir/NNN.png. Returns the count."""
    out_dir.mkdir(parents=True, exist_ok=True)
    hed = load_hed(face_dir)
    atlas_data = {a: (face_dir / a).read_bytes() for a in ATLASES if (face_dir / a).exists()}
    count = 0
    for idx, (off, sz) in enumerate(hed):
        if sz == 0:
            continue
        # The hed offset resolves against any atlas the region fits in; try them all and keep the
        # first that DECODES to a valid image (fit alone isn't enough — the wrong atlas yields garbage).
        for data in atlas_data.values():
            if off + sz > len(data):
                continue
            img = decode_region(data[off:off + sz])
            if img is not None:
                if scale != 1:
                    img = img.resize((img.width * scale, img.height * scale))
                img.save(out_dir / f"{idx:04d}.png")
                count += 1
                break
    return count


def find_one(face_dir: Path, index: int) -> Image.Image | None:
    hed = load_hed(face_dir)
    if index >= len(hed):
        return None
    off, sz = hed[index]
    for atlas in ATLASES:
        data = (face_dir / atlas).read_bytes()
        if off + sz <= len(data):
            img = decode_region(data[off:off + sz])
            if img is not None:
                return img
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sheet")
    s.add_argument("--tcf", required=True)
    s.add_argument("--out", required=True)
    s.add_argument("--cols", type=int, default=12)
    s.add_argument("--scale", type=int, default=1)
    s.add_argument("--face-dir", default=str(FACE_DIR))
    o = sub.add_parser("one")
    o.add_argument("--index", type=int, required=True)
    o.add_argument("--out", required=True)
    o.add_argument("--face-dir", default=str(FACE_DIR))
    d = sub.add_parser("dumpall")
    d.add_argument("--out-dir", required=True)
    d.add_argument("--scale", type=int, default=1)
    d.add_argument("--face-dir", default=str(FACE_DIR))
    args = ap.parse_args()
    fd = Path(args.face_dir)
    if args.cmd == "sheet":
        n = contact_sheet(fd, args.tcf, Path(args.out), args.cols, args.scale)
        print(f"{args.tcf}: {n} portraits -> {args.out}")
    elif args.cmd == "dumpall":
        n = dump_all(fd, Path(args.out_dir), args.scale)
        print(f"dumped {n} portraits -> {args.out_dir}")
    else:
        img = find_one(fd, args.index)
        if img is None:
            print(f"index {args.index}: not found")
            return 1
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        img.resize((64 * 3, 80 * 3)).save(args.out)
        print(f"index {args.index} -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
