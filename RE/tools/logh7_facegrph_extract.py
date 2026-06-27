"""Extract face bitmaps from LOGH VI FACEGRPH.DLL (PE resource container).

Probe + extract tool for reverse-tracing LOGH VII portraits against the
labeled prior-game (LOGH VI) face art. READ-ONLY against prior-game files.

Usage:
    python -m tools.logh7_facegrph_extract probe   [--dll PATH]
    python -m tools.logh7_facegrph_extract dump --out-dir DIR [--dll PATH]
"""
from __future__ import annotations

import argparse
import struct
import sys
from pathlib import Path

DEFAULT_DLL = Path(r"E:/DGGL/Games/GinVI_Win_231225/FACEGRPH.DLL")


def _load_pe(dll_path: Path):
    import pefile

    pe = pefile.PE(str(dll_path), fast_load=True)
    pe.parse_data_directories(
        directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_RESOURCE"]]
    )
    return pe, pefile


def probe(dll_path: Path) -> None:
    pe, pefile = _load_pe(dll_path)
    if not hasattr(pe, "DIRECTORY_ENTRY_RESOURCE"):
        print("NO RESOURCE DIRECTORY")
        return
    for entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        try:
            rname = pefile.RESOURCE_TYPE.get(entry.id)
        except Exception:
            rname = None
        subs = entry.directory.entries if hasattr(entry, "directory") else []
        print(f"TYPE id={entry.id} name={rname} #entries={len(subs)}")
        # show first few resource ids + sizes
        for i, sub in enumerate(subs[:8]):
            data_entry = sub.directory.entries[0].data.struct
            size = data_entry.Size
            sid = sub.id if sub.id is not None else sub.name
            print(f"    res id={sid} size={size}")


def _iter_resources(pe, pefile):
    """Yield (type_id, res_id, lang_id, raw_bytes)."""
    if not hasattr(pe, "DIRECTORY_ENTRY_RESOURCE"):
        return
    for type_entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        for res_entry in type_entry.directory.entries:
            for lang_entry in res_entry.directory.entries:
                ds = lang_entry.data.struct
                data = pe.get_data(ds.OffsetToData, ds.Size)
                yield type_entry.id, res_entry.id, lang_entry.id, data


def _decode_bitmap(data: bytes):
    """Decode a packed DIB (BITMAPINFOHEADER + palette + pixels) into a PIL image."""
    from PIL import Image

    if len(data) < 40:
        return None
    (bi_size, width, height, planes, bpp) = struct.unpack_from("<IiiHH", data, 0)
    if bi_size != 40:
        return None
    compression = struct.unpack_from("<I", data, 16)[0]
    clr_used = struct.unpack_from("<I", data, 32)[0]
    if width <= 0 or abs(height) == 0 or width > 4096 or abs(height) > 4096:
        return None
    top_down = height < 0
    h = abs(height)

    off = bi_size
    palette = None
    if bpp <= 8:
        ncolors = clr_used if clr_used else (1 << bpp)
        pal_bytes = ncolors * 4
        palette = data[off:off + pal_bytes]
        off += pal_bytes

    pixels = data[off:]
    if bpp == 8:
        row_stride = (width + 3) & ~3
        need = row_stride * h
        if len(pixels) < need:
            return None
        img = Image.new("RGB", (width, h))
        px = img.load()
        for y in range(h):
            src_y = y if top_down else (h - 1 - y)
            base = y * row_stride
            for x in range(width):
                idx = pixels[base + x]
                b = palette[idx * 4 + 0]
                g = palette[idx * 4 + 1]
                r = palette[idx * 4 + 2]
                px[x, src_y] = (r, g, b)
        return img
    elif bpp == 24:
        row_stride = (width * 3 + 3) & ~3
        need = row_stride * h
        if len(pixels) < need:
            return None
        img = Image.new("RGB", (width, h))
        px = img.load()
        for y in range(h):
            src_y = y if top_down else (h - 1 - y)
            base = y * row_stride
            for x in range(width):
                b = pixels[base + x * 3 + 0]
                g = pixels[base + x * 3 + 1]
                r = pixels[base + x * 3 + 2]
                px[x, src_y] = (r, g, b)
        return img
    return None


def dump(dll_path: Path, out_dir: Path) -> None:
    pe, pefile = _load_pe(dll_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    from PIL import Image

    n_ok = 0
    n_fail = 0
    for type_id, res_id, lang_id, data in _iter_resources(pe, pefile):
        tag = f"t{type_id}_r{res_id}"
        # Try BMP file (with BITMAPFILEHEADER) first
        img = None
        if data[:2] == b"BM":
            try:
                from io import BytesIO
                img = Image.open(BytesIO(data)).convert("RGB")
            except Exception:
                img = None
        if img is None:
            img = _decode_bitmap(data)
        if img is None:
            # RT_BITMAP resources are DIBs without the 14-byte file header;
            # already handled by _decode_bitmap. Save raw for inspection.
            (out_dir / f"{tag}.raw").write_bytes(data[:64])
            n_fail += 1
            continue
        img.save(out_dir / f"{tag}.png")
        n_ok += 1
    print(f"decoded={n_ok} failed={n_fail} -> {out_dir}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_probe = sub.add_parser("probe")
    p_probe.add_argument("--dll", type=Path, default=DEFAULT_DLL)
    p_dump = sub.add_parser("dump")
    p_dump.add_argument("--dll", type=Path, default=DEFAULT_DLL)
    p_dump.add_argument("--out-dir", type=Path, required=True)
    args = ap.parse_args(argv)

    if args.cmd == "probe":
        probe(args.dll)
    elif args.cmd == "dump":
        dump(args.dll, args.out_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())
