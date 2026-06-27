#!/usr/bin/env python3
"""TCF PACKER — the inverse of logh7_tcf_decode.py. Add portraits to the Face atlases.

This is the missing encoder that makes portraits drop-in (docs/logh7-modding-architecture.md §B.2).
A portrait region (verified byte-exact vs the decoder) =
  18B header: palette_count u16@0x00 (=256) | const preamble 10B @0x02 (`01 00 00 00 01 20 00 00 00 00`)
              | width u16@0x0c | height u16@0x0e | bpp u16@0x10 (=8)
  + 1024B palette (256 * BGRA)
  + width*height 8-bit palette indices, stored BOTTOM-UP.
tcf.hed = u32[offset],u32[size] per global slot; the O atlases occupy slot blocks oem@0, oam@200, o@350
(byte bases 0x0/0x640/0xaf0 in FUN_005924c0). The hed offset is the byte offset INSIDE that atlas file.

This packer APPENDS new portrait regions to an O atlas and points the chosen slot(s) at them (existing
regions untouched), then round-trip-decodes to verify. To use slots beyond the per-atlas cap (oem 199 /
oam 95 / o 99) you also need the tools/client_patches/face-atlas-expand.json patch (§B.2) — this tool
warns when a target slot exceeds the cap.

Usage:
  python tools/logh7_tcf_pack.py add --atlas oem --slot 150 --png new_face.png
  python tools/logh7_tcf_pack.py add --atlas o --from-dir mods/mymod/portraits   # slot = block_base+filename-index
  (add --in-place to overwrite the installed atlas+hed; default writes *.new beside them)
"""
from __future__ import annotations
import argparse
import struct
import sys
from pathlib import Path

from PIL import Image

FACE_DIR = Path(".omo/work/logh7-installed/data/image/Face")
HEADER_PREAMBLE = bytes.fromhex("01000000012000000000")  # const bytes 0x02..0x0b (verified oem/oam/o)
# O-group atlas -> (hed slot-block base, per-atlas index cap inclusive). From FUN_005924c0 / FACE_ATLAS.
# O-blocks are STRIDE-1: one hed entry per index. The EXE cap (cmp imm) is index-EXCLUSIVE, so the
# inclusive last index = cap_excl-1: oem cmp<200 -> 199, oam cmp<150 -> 149, o cmp<100 -> 99.
O_ATLAS = {"oem": (0, 199), "oam": (200, 149), "o": (350, 99)}
# G-group atlas -> (hed slot-block base, per-atlas index cap inclusive). From FUN_005924c0 cases 3-6.
# G-blocks are STRIDE-3: each index occupies 3 consecutive hed entries (param_4 = 0,1,2 columns;
# the renderer picks a column). Byte base = (idx*3 + block_base)*8, so slot base = block_base.
# EXE caps (index-exclusive): gem cmp<100 ->99, gef cmp<50 ->49, gam cmp<100 ->99, gaf cmp<50 ->49.
# face-atlas-expand.json raises ONLY gaf cmp 0x32->0x33 (50->51) -> inclusive last index 50 (slots
# 1350..1352), the one index the fixed 1355-slot hed buffer physically has room for.
G_ATLAS = {"gem": (450, 99), "gef": (750, 49), "gam": (900, 99), "gaf": (49, 50)}
# NOTE on G_ATLAS values: (base_slot, cap_inclusive) where cap_inclusive is the VANILLA cap, EXCEPT
# gaf whose value carries the EXPANDED cap 50 (with face-atlas-expand.json applied). Stored as a
# dict below for clarity rather than overloading the tuple:
G_ATLAS = {
    # name: (block_base_slot, vanilla_cap_inclusive, expanded_cap_inclusive)
    "gem": (450, 99, 99),
    "gef": (750, 49, 49),
    "gam": (900, 99, 99),
    "gaf": (1200, 49, 50),  # expanded_cap 50 needs tools/client_patches/face-atlas-expand.json
}
G_STRIDE = 3  # hed entries per G index
HED_BUF_SLOTS = 0x2a58 // 8  # 1355: fixed client buffer (FUN_00591f60 zeroes 0xa96 dwords); HARD CAP.
CELL_W, CELL_H = 64, 80


def encode_region(img: Image.Image, w=CELL_W, h=CELL_H) -> bytes:
    """PNG/PIL image -> a byte-exact TCF region (header + BGRA palette + bottom-up indices)."""
    img = img.convert("RGB").resize((w, h))
    # quantize to <=256 colors -> palette image
    pal_img = img.quantize(colors=256, method=Image.MEDIANCUT)
    rgb_pal = pal_img.getpalette()[: 256 * 3]
    while len(rgb_pal) < 256 * 3:
        rgb_pal += [0, 0, 0]
    palette = bytearray()
    for i in range(256):
        r, g, b = rgb_pal[i * 3], rgb_pal[i * 3 + 1], rgb_pal[i * 3 + 2]
        palette += bytes((b, g, r, 0))  # BGRA, A=0 like the originals
    idx = list(pal_img.getdata())  # top-down
    # store BOTTOM-UP (decoder flips vertically on read)
    rows = [idx[row * w:(row + 1) * w] for row in range(h)]
    pixels = bytearray()
    for row in reversed(rows):
        pixels += bytes(row)
    header = struct.pack("<H", 256) + HEADER_PREAMBLE + struct.pack("<HHH", w, h, 8)
    assert len(header) == 18, len(header)
    region = bytes(header) + bytes(palette) + bytes(pixels)
    assert len(region) == 18 + 1024 + w * h
    return region


def load_hed(face_dir: Path):
    hed = (face_dir / "tcf.hed").read_bytes()
    return [list(struct.unpack_from("<II", hed, i * 8)) for i in range(len(hed) // 8)]


def save_hed(entries, path: Path):
    out = bytearray()
    for off, sz in entries:
        out += struct.pack("<II", off, sz)
    path.write_bytes(out)


def decode_region(region: bytes):
    if len(region) < 18 + 1024:
        return None
    w = struct.unpack_from("<H", region, 0x0c)[0]
    h = struct.unpack_from("<H", region, 0x0e)[0]
    if 18 + 1024 + w * h != len(region):
        return None
    return (w, h)


def _slot_in_buffer(slot: int, span: int = 1) -> bool:
    """A hed slot (and its span-1 following entries) must stay inside the fixed client buffer."""
    return slot + span <= HED_BUF_SLOTS


def add_portraits(atlas: str, items: dict[int, Path], face_dir: Path, in_place: bool):
    if atlas in G_ATLAS:
        return _add_g_portraits(atlas, items, face_dir, in_place)
    if atlas not in O_ATLAS:
        raise SystemExit(f"atlas must be one of {list(O_ATLAS) + list(G_ATLAS)}")
    base, cap = O_ATLAS[atlas]
    atlas_path = face_dir / f"{atlas}.tcf"
    data = bytearray(atlas_path.read_bytes())
    entries = load_hed(face_dir)
    warnings = []
    added = []
    for local_idx, png in sorted(items.items()):
        if local_idx > cap:
            warnings.append(f"slot {local_idx} > atlas cap {cap}: needs client_patches/face-atlas-expand.json to render")
        slot = base + local_idx
        if not _slot_in_buffer(slot):
            raise SystemExit(
                f"{atlas} idx {local_idx} -> hed slot {slot} exceeds the fixed {HED_BUF_SLOTS}-slot client buffer; "
                "growing tcf.hed past this overruns live globals (no code cave in this tool)"
            )
        region = encode_region(Image.open(png))
        off = len(data)
        data += region
        while slot >= len(entries):
            entries.append([0, 0])
        entries[slot] = [off, len(region)]
        added.append((slot, local_idx, off, len(region), png.name))

    out_tcf = atlas_path if in_place else atlas_path.with_suffix(".tcf.new")
    out_hed = (face_dir / "tcf.hed") if in_place else (face_dir / "tcf.hed.new")
    out_tcf.write_bytes(bytes(data))
    save_hed(entries, out_hed)

    # round-trip verify every added region decodes to the right dims from the written atlas
    verify_data = out_tcf.read_bytes()
    ok = 0
    for slot, local_idx, off, sz, nm in added:
        dims = decode_region(verify_data[off:off + sz])
        if dims == (CELL_W, CELL_H):
            ok += 1
        else:
            warnings.append(f"slot {slot} ({nm}) round-trip FAILED (got {dims})")
    return added, ok, warnings, out_tcf, out_hed


def _add_g_portraits(atlas: str, items: dict[int, Path], face_dir: Path, in_place: bool):
    """Pack portrait(s) into a G-group atlas (gem/gef/gam/gaf). STRIDE-3: each index owns 3 hed
    entries (cols 0,1,2). We append one byte-exact 64x80 cell per index and point ALL 3 columns
    at it, so the renderer reads a valid cell whichever column (param_4) it requests."""
    base_slot, vanilla_cap, expanded_cap = G_ATLAS[atlas]
    atlas_path = face_dir / f"{atlas}.tcf"
    data = bytearray(atlas_path.read_bytes())
    entries = load_hed(face_dir)
    warnings = []
    added = []
    for local_idx, png in sorted(items.items()):
        if local_idx > expanded_cap:
            raise SystemExit(
                f"{atlas} idx {local_idx} > max addressable index {expanded_cap}: the client cap can't reach it "
                "(even with face-atlas-expand.json) without relocating the hed buffer (code cave)"
            )
        if local_idx > vanilla_cap:
            warnings.append(
                f"{atlas} idx {local_idx} > vanilla cap {vanilla_cap}: requires "
                "tools/client_patches/face-atlas-expand.json (raises the EXE index gate) to render"
            )
        slot = base_slot + local_idx * G_STRIDE
        if not _slot_in_buffer(slot, span=G_STRIDE):
            raise SystemExit(
                f"{atlas} idx {local_idx} -> hed slots {slot}..{slot + G_STRIDE - 1} exceed the fixed "
                f"{HED_BUF_SLOTS}-slot client buffer; cannot grow tcf.hed without overrunning live globals"
            )
        region = encode_region(Image.open(png))
        off = len(data)
        data += region
        while slot + G_STRIDE - 1 >= len(entries):
            entries.append([0, 0])
        for col in range(G_STRIDE):  # all 3 columns -> the same valid single cell
            entries[slot + col] = [off, len(region)]
        added.append((slot, local_idx, off, len(region), png.name))

    out_tcf = atlas_path if in_place else atlas_path.with_suffix(".tcf.new")
    out_hed = (face_dir / "tcf.hed") if in_place else (face_dir / "tcf.hed.new")
    out_tcf.write_bytes(bytes(data))
    save_hed(entries, out_hed)

    verify_data = out_tcf.read_bytes()
    ok = 0
    for slot, local_idx, off, sz, nm in added:
        dims = decode_region(verify_data[off:off + sz])
        if dims == (CELL_W, CELL_H):
            ok += 1
        else:
            warnings.append(f"slot {slot} ({nm}) round-trip FAILED (got {dims})")
    return added, ok, warnings, out_tcf, out_hed


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("add")
    a.add_argument("--atlas", required=True, choices=list(O_ATLAS) + list(G_ATLAS))
    a.add_argument("--slot", type=int, help="per-atlas local index for a single --png")
    a.add_argument("--png", help="single portrait image")
    a.add_argument("--from-dir", help="folder of PNGs; local slot = file order (0,1,2,...) unless name is an int")
    a.add_argument("--start-slot", type=int, default=0, help="first slot for --from-dir")
    a.add_argument("--face-dir", default=str(FACE_DIR))
    a.add_argument("--in-place", action="store_true", help="overwrite the installed atlas+hed (default: *.new)")
    args = ap.parse_args(argv)

    fd = Path(args.face_dir)
    items: dict[int, Path] = {}
    if args.png and args.slot is not None:
        items[args.slot] = Path(args.png)
    elif args.from_dir:
        pngs = sorted(Path(args.from_dir).glob("*.png"))
        for i, p in enumerate(pngs):
            stem = p.stem
            slot = int(stem) if stem.isdigit() else args.start_slot + i
            items[slot] = p
    else:
        ap.error("give --png + --slot, or --from-dir")

    added, ok, warnings, out_tcf, out_hed = add_portraits(args.atlas, items, fd, args.in_place)
    print(f"packed {len(added)} portrait(s) into {args.atlas} -> {out_tcf}, hed -> {out_hed}")
    print(f"round-trip verified: {ok}/{len(added)}")
    for slot, li, off, sz, nm in added:
        print(f"  slot {slot} (atlas idx {li}) off=0x{off:x} size={sz}  <- {nm}")
    for w in warnings:
        print(f"  WARNING: {w}")
    return 0 if ok == len(added) else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
