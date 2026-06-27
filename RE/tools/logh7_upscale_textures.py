#!/usr/bin/env python3
"""LOGH VII .tga texture AI-upscale pipeline (NO exe patch).

Why a bespoke TGA codec: the D3DX8 loader is dimension-agnostic and reads the dims
straight from the file header (docs/logh7-graphics-remaster.md §3.1), so a larger
same-format file decodes to a larger surface with ZERO exe change. BUT 470 of the
651 UI textures in data/image/** are *color-mapped* 8-bit TGAs with a 32-bit
palette, and Pillow CANNOT read those ("unrecognized raw mode"). So this tool ships
a self-contained TGA reader/writer (color-mapped 16/24/32-bit palette + truecolor
16/24/32-bit, uncompressed + RLE-decode) that decodes to RGBA, upscales, and writes
a standard truecolor TGA the loader accepts (FUN_005a91a7 supports 16/24/32-bit).

Upscaler: if an external 2x/4x AI upscaler is on PATH (realesrgan-ncnn-vulkan,
upscayl, waifu2x-ncnn-vulkan, esrgan) it is invoked via a clean HOOK; otherwise a
high-quality Pillow Lanczos resample is the graceful fallback. Either way the scale
is an INTEGER factor (2 or 4) so power-of-two stays power-of-two (512->1024->2048),
keeping FUN_005a3b2e's pow2 branch a no-op and never hitting the device-cap clamp.

Safety: every overwrite is preceded by a backup into a sidecar mirror
(<install>/.upscale-backup/<scale>x/...) recorded in a JSON manifest, and the write
itself is atomic (temp file + os.replace). `revert` restores every backed-up file
byte-for-byte and removes the backup tree. The EXE is never touched.

verify-later (needsLive): the loader/codec being dimension-agnostic proves the
LOADER accepts arbitrary sizes; it does NOT prove every UI atlas CONSUMER tolerates
a 2x/4x asset (src/dst rect math). Drop a SINGLE upscaled asset (`--only <file>` or
`--limit 1`) and eyeball it in the live client before a bulk run (§3.1 spot check).

Usage:
  python tools/logh7_upscale_textures.py selftest
  python tools/logh7_upscale_textures.py list                 # survey the tga tree
  python tools/logh7_upscale_textures.py upscale --scale 2 --only data/image/gamemenu/title_korea.tga
  python tools/logh7_upscale_textures.py upscale --scale 2 --dirs data/image            # bulk, in place + backup
  python tools/logh7_upscale_textures.py upscale --scale 4 --dirs data/image --dry-run  # plan only
  python tools/logh7_upscale_textures.py revert                # restore everything from the backup mirror
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

DEFAULT_INSTALL = Path(".omo") / "work" / "logh7-installed"
BACKUP_DIRNAME = ".upscale-backup"
MANIFEST_NAME = "upscale-manifest.json"
# Dirs that hold drop-in upscalable textures (UI atlases + model image LODs).
DEFAULT_DIRS = ("data/image", "data/model/images/Hi")

# External AI upscalers we know how to drive, in preference order. Each entry:
#   (exe-name, build_argv(src,dst,scale) -> argv).  Detected on PATH; first hit wins.
# realesrgan-ncnn-vulkan: -i in -o out -s scale [-n model]
# upscayl-bin / upscayl: same realesrgan-style CLI
# waifu2x-ncnn-vulkan: -i in -o out -s scale -n noise
_EXTERNAL_UPSCALERS = (
    ("realesrgan-ncnn-vulkan", lambda s, d, sc: ["-i", s, "-o", d, "-s", str(sc)]),
    ("upscayl-bin", lambda s, d, sc: ["-i", s, "-o", d, "-s", str(sc)]),
    ("upscayl", lambda s, d, sc: ["-i", s, "-o", d, "-s", str(sc)]),
    ("waifu2x-ncnn-vulkan", lambda s, d, sc: ["-i", s, "-o", d, "-s", str(sc), "-n", "1"]),
    ("esrgan", lambda s, d, sc: ["--input", s, "--output", d, "--scale", str(sc)]),
)


# --------------------------------------------------------------------------- TGA codec
@dataclass
class Tga:
    width: int
    height: int
    rgba: bytes          # width*height*4, top-down rows, RGBA order
    had_alpha: bool      # source carried meaningful alpha (32-bit truecolor or 32-bit palette)


def _read_colormap(data: bytes, off: int, length: int, depth: int) -> list[tuple[int, int, int, int]]:
    """Return palette as a list of (R,G,B,A). depth in {15,16,24,32}."""
    pal: list[tuple[int, int, int, int]] = []
    if depth in (15, 16):
        for i in range(length):
            v = struct.unpack_from("<H", data, off + i * 2)[0]
            r = ((v >> 10) & 0x1F) * 255 // 31
            g = ((v >> 5) & 0x1F) * 255 // 31
            b = (v & 0x1F) * 255 // 31
            a = 255 if (depth == 15 or (v & 0x8000)) else 0
            pal.append((r, g, b, a))
    elif depth == 24:
        for i in range(length):
            b, g, r = data[off + i * 3], data[off + i * 3 + 1], data[off + i * 3 + 2]
            pal.append((r, g, b, 255))
    elif depth == 32:
        for i in range(length):
            b, g, r, a = data[off + i * 4:off + i * 4 + 4]
            pal.append((r, g, b, a))
    else:
        raise ValueError(f"unsupported colormap depth {depth}")
    return pal


def _unpack_pixels(data: bytes, off: int, count: int, bpp: int, rle: bool) -> list[int]:
    """Return `count` raw pixel values (palette index for 8bpp, packed color else)."""
    bytes_per = bpp // 8
    out: list[int] = []
    if not rle:
        for i in range(count):
            p = off + i * bytes_per
            out.append(int.from_bytes(data[p:p + bytes_per], "little"))
        return out
    # RLE: packets of 1-byte header then 1 (RLE) or N (raw) pixels
    pos = off
    while len(out) < count:
        header = data[pos]; pos += 1
        n = (header & 0x7F) + 1
        if header & 0x80:  # run-length packet: one pixel repeated n times
            val = int.from_bytes(data[pos:pos + bytes_per], "little"); pos += bytes_per
            out.extend([val] * n)
        else:              # raw packet: n distinct pixels
            for _ in range(n):
                out.append(int.from_bytes(data[pos:pos + bytes_per], "little")); pos += bytes_per
    return out[:count]


def read_tga(path: Path) -> Tga:
    """Decode a TGA (color-mapped 8/16/24/32 palette, truecolor 16/24/32, RLE or raw) to RGBA top-down."""
    data = path.read_bytes()
    if len(data) < 18:
        raise ValueError(f"{path}: too short to be a TGA")
    idlen = data[0]
    cmap_type = data[1]
    img_type = data[2]
    cmap_first, cmap_len, cmap_depth = struct.unpack_from("<HHB", data, 3)
    x_org, y_org, width, height = struct.unpack_from("<HHHH", data, 8)
    bpp = data[16]
    descriptor = data[17]
    top_origin = bool((descriptor >> 5) & 1)  # bit5: 0 = bottom-left origin (TGA default)

    rle = img_type in (9, 10, 11)
    base_type = img_type & 0x7  # 1=colormapped 2=truecolor 3=grayscale (mask off RLE bit 0x8)
    pos = 18 + idlen

    palette: list[tuple[int, int, int, int]] = []
    if cmap_type == 1 and cmap_len:
        palette = _read_colormap(data, pos, cmap_len, cmap_depth)
        pos += cmap_len * (cmap_depth // 8)

    raw = _unpack_pixels(data, pos, width * height, bpp, rle)

    had_alpha = False
    rgba = bytearray(width * height * 4)
    if base_type == 1:  # color-mapped
        had_alpha = cmap_depth == 32 or cmap_depth in (15, 16)
        for i, idx in enumerate(raw):
            real = idx - cmap_first
            r, g, b, a = palette[real] if 0 <= real < len(palette) else (0, 0, 0, 0)
            j = i * 4
            rgba[j:j + 4] = bytes((r, g, b, a))
    elif base_type == 2:  # truecolor
        for i, v in enumerate(raw):
            if bpp == 32:
                b = v & 0xFF; g = (v >> 8) & 0xFF; r = (v >> 16) & 0xFF; a = (v >> 24) & 0xFF
                had_alpha = True
            elif bpp == 24:
                b = v & 0xFF; g = (v >> 8) & 0xFF; r = (v >> 16) & 0xFF; a = 255
            elif bpp in (15, 16):
                r = ((v >> 10) & 0x1F) * 255 // 31
                g = ((v >> 5) & 0x1F) * 255 // 31
                b = (v & 0x1F) * 255 // 31
                a = 255 if (bpp == 15 or (v & 0x8000)) else 255
            else:
                raise ValueError(f"{path}: unsupported truecolor bpp {bpp}")
            j = i * 4
            rgba[j:j + 4] = bytes((r, g, b, a))
    elif base_type == 3:  # grayscale
        for i, v in enumerate(raw):
            g = v & 0xFF
            rgba[i * 4:i * 4 + 4] = bytes((g, g, g, 255))
    else:
        raise ValueError(f"{path}: unsupported TGA image type {img_type}")

    # Normalize to top-down row order so callers see a consistent buffer.
    if not top_origin:
        row = width * 4
        flipped = bytearray(len(rgba))
        for y in range(height):
            src = (height - 1 - y) * row
            flipped[y * row:y * row + row] = rgba[src:src + row]
        rgba = flipped
    return Tga(width, height, bytes(rgba), had_alpha)


def write_tga(path: Path, width: int, height: int, rgba: bytes, alpha: bool) -> None:
    """Write a standard uncompressed truecolor TGA (BGRA 32-bit if alpha else BGR 24-bit), bottom-left origin."""
    bpp = 32 if alpha else 24
    descriptor = 0x08 if alpha else 0x00  # low nibble = attribute (alpha) bits
    header = struct.pack(
        "<BBBHHBHHHHBB",
        0,            # id length
        0,            # color map type (none)
        2,            # image type: uncompressed truecolor
        0, 0, 0,      # color map spec (unused)
        0, 0,         # x/y origin
        width, height,
        bpp, descriptor,
    )
    body = bytearray(width * height * (bpp // 8))
    step = bpp // 8
    # Source rgba is top-down; TGA bottom-left origin => write rows bottom-up.
    for y in range(height):
        src_row = (height - 1 - y) * width * 4
        dst_row = y * width * step
        for x in range(width):
            r, g, b, a = rgba[src_row + x * 4:src_row + x * 4 + 4]
            o = dst_row + x * step
            if alpha:
                body[o:o + 4] = bytes((b, g, r, a))
            else:
                body[o:o + 3] = bytes((b, g, r))
    _atomic_write(path, header + bytes(body))


# --------------------------------------------------------------------------- upscale backends
def detect_external_upscaler() -> tuple[str, object] | None:
    for name, builder in _EXTERNAL_UPSCALERS:
        exe = shutil.which(name)
        if exe:
            return exe, builder
    return None


def _upscale_external(tga: Tga, scale: int, exe: str, builder) -> Tga | None:
    """HOOK: drive an external AI upscaler over PNG temp files. Returns None on any failure (caller falls back)."""
    try:
        from PIL import Image
    except Exception:
        return None
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, "in.png")
        dst = os.path.join(td, "out.png")
        Image.frombytes("RGBA", (tga.width, tga.height), tga.rgba).save(src)
        argv = [exe] + list(builder(src, dst, scale))
        try:
            subprocess.run(argv, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600)
        except Exception:
            return None
        if not os.path.exists(dst):
            return None
        out = Image.open(dst).convert("RGBA")
        ow, oh = out.size
        if (ow, oh) != (tga.width * scale, tga.height * scale):
            out = out.resize((tga.width * scale, tga.height * scale), Image.LANCZOS)
            ow, oh = out.size
        return Tga(ow, oh, out.tobytes(), tga.had_alpha)


def _upscale_lanczos(tga: Tga, scale: int) -> Tga:
    """Graceful fallback: high-quality Lanczos resample (Pillow if present, else a pure-python box+bilinear)."""
    nw, nh = tga.width * scale, tga.height * scale
    try:
        from PIL import Image
        img = Image.frombytes("RGBA", (tga.width, tga.height), tga.rgba)
        out = img.resize((nw, nh), Image.LANCZOS)
        return Tga(nw, nh, out.tobytes(), tga.had_alpha)
    except Exception:
        # dependency-free nearest-neighbour integer replication (last-resort, keeps the pipeline working)
        src, dst = tga.rgba, bytearray(nw * nh * 4)
        for y in range(nh):
            sy = y // scale
            for x in range(nw):
                sx = x // scale
                s = (sy * tga.width + sx) * 4
                d = (y * nw + x) * 4
                dst[d:d + 4] = src[s:s + 4]
        return Tga(nw, nh, bytes(dst), tga.had_alpha)


def upscale_tga(tga: Tga, scale: int, prefer_external: bool = True) -> tuple[Tga, str]:
    """Upscale by an integer factor. Returns (upscaled, backend-label)."""
    if prefer_external:
        ext = detect_external_upscaler()
        if ext:
            res = _upscale_external(tga, scale, *ext)
            if res is not None:
                return res, f"external:{os.path.basename(ext[0])}"
    return _upscale_lanczos(tga, scale), "lanczos"


# --------------------------------------------------------------------------- file ops
def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".tmp-upscale-")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
        os.replace(tmp, path)  # atomic on the same filesystem
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def iter_tgas(install: Path, dirs: tuple[str, ...]) -> list[Path]:
    out: list[Path] = []
    for d in dirs:
        base = install / d
        if not base.exists():
            continue
        for p in sorted(base.rglob("*.tga")):
            if BACKUP_DIRNAME in p.parts:
                continue
            if p.is_file():
                out.append(p)
    return out


def _backup_root(install: Path, scale: int) -> Path:
    return install / BACKUP_DIRNAME / f"{scale}x"


def _backup_file(install: Path, src: Path, scale: int) -> Path:
    rel = src.relative_to(install)
    dst = _backup_root(install, scale) / rel
    if not dst.exists():  # never clobber an earlier (true original) backup
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    return dst


# --------------------------------------------------------------------------- commands
def cmd_upscale(args) -> int:
    install = Path(args.install)
    if not install.exists():
        print(f"install root not found: {install}", file=sys.stderr)
        return 2
    if args.only:
        targets = [install / args.only if not os.path.isabs(args.only) else Path(args.only)]
        targets = [t for t in targets if t.exists()]
        if not targets:
            print(f"--only target not found under {install}: {args.only}", file=sys.stderr)
            return 2
    else:
        targets = iter_tgas(install, tuple(args.dirs))
    if args.limit:
        targets = targets[: args.limit]

    ext = detect_external_upscaler()
    backend = f"external:{os.path.basename(ext[0])}" if ext else "lanczos-fallback"
    print(f"upscaler backend: {backend}  (scale x{args.scale}, {len(targets)} file(s){' DRY-RUN' if args.dry_run else ''})")

    manifest = {"install": str(install), "scale": args.scale, "backend": backend, "entries": []}
    done = failed = 0
    for p in targets:
        try:
            tga = read_tga(p)
        except Exception as e:
            print(f"  SKIP (decode) {p.relative_to(install)}: {e}")
            failed += 1
            continue
        new_w, new_h = tga.width * args.scale, tga.height * args.scale
        rel = p.relative_to(install).as_posix()
        if args.dry_run:
            print(f"  {rel}: {tga.width}x{tga.height} -> {new_w}x{new_h} (alpha={tga.had_alpha})")
            manifest["entries"].append({"path": rel, "from": [tga.width, tga.height], "to": [new_w, new_h]})
            done += 1
            continue
        up, used = upscale_tga(tga, args.scale, prefer_external=not args.no_external)
        backup = _backup_file(install, p, args.scale)
        write_tga(p, up.width, up.height, up.rgba, tga.had_alpha)
        # verify the freshly-written file decodes back to the expected dims
        check = read_tga(p)
        ok = (check.width, check.height) == (new_w, new_h)
        status = "ok" if ok else "DIM-MISMATCH"
        if not ok:
            failed += 1
        else:
            done += 1
        print(f"  {rel}: {tga.width}x{tga.height} -> {check.width}x{check.height} [{used}] {status}")
        manifest["entries"].append({
            "path": rel, "backup": str(backup.relative_to(install)),
            "from": [tga.width, tga.height], "to": [new_w, new_h], "backend": used, "ok": ok,
        })

    if not args.dry_run and manifest["entries"]:
        man_path = _backup_root(install, args.scale) / MANIFEST_NAME
        man_path.parent.mkdir(parents=True, exist_ok=True)
        # merge with any existing manifest so repeated runs accumulate revert info
        if man_path.exists():
            try:
                prev = json.loads(man_path.read_text(encoding="utf-8"))
                known = {e["path"] for e in manifest["entries"]}
                manifest["entries"] = [e for e in prev.get("entries", []) if e["path"] not in known] + manifest["entries"]
            except Exception:
                pass
        man_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"manifest -> {man_path}")
    print(f"done: {done} upscaled, {failed} skipped/failed")
    return 0 if failed == 0 else 1


def cmd_revert(args) -> int:
    install = Path(args.install)
    restored = 0
    roots = []
    base = install / BACKUP_DIRNAME
    if not base.exists():
        print("nothing to revert (no backup tree)")
        return 0
    for scale_dir in sorted(base.iterdir()):
        if not scale_dir.is_dir():
            continue
        roots.append(scale_dir)
    for scale_dir in roots:
        for src in sorted(scale_dir.rglob("*.tga")):
            rel = src.relative_to(scale_dir)
            target = install / rel
            shutil.copy2(src, target)
            restored += 1
    print(f"reverted {restored} texture(s) from {base}")
    if not args.keep_backup:
        shutil.rmtree(base)
        print(f"removed backup tree {base}")
    return 0


def cmd_list(args) -> int:
    install = Path(args.install)
    targets = iter_tgas(install, tuple(args.dirs))
    import collections
    fmt = collections.Counter()
    dims = collections.Counter()
    for p in targets:
        data = p.read_bytes()
        if len(data) < 18:
            continue
        img_type = data[2]
        bpp = data[16]
        w, h = struct.unpack_from("<HH", data, 12)
        fmt[(img_type, bpp)] += 1
        dims[(w, h)] += 1
    print(f"{len(targets)} .tga under {args.dirs}")
    print("formats (img_type, bpp):")
    for k, v in fmt.most_common():
        print(f"  {k}: {v}")
    print("top dims:")
    for k, v in dims.most_common(10):
        print(f"  {k[0]}x{k[1]}: {v}")
    return 0


def cmd_selftest(args) -> int:
    """Round-trip a synthetic color-mapped TGA through the codec + a 2x upscale; assert dims/format."""
    import tempfile as _tf
    failures: list[str] = []
    with _tf.TemporaryDirectory() as td:
        td = Path(td)
        # 1) Build a tiny 8-bit COLOR-MAPPED TGA (32-bit palette) by hand — the format Pillow can't read.
        W, H = 4, 4
        palette = [(255, 0, 0, 255), (0, 255, 0, 128), (0, 0, 255, 0), (255, 255, 255, 255)]
        pal_bytes = b"".join(bytes((b, g, r, a)) for (r, g, b, a) in palette)
        pal_bytes += b"\x00" * (4 * (256 - len(palette)))  # pad to 256 entries
        indices = [(x + y) % 4 for y in range(H) for x in range(W)]  # top-down logical image
        # store bottom-up (origin bottom-left, descriptor bit5=0)
        rows = [indices[y * W:(y + 1) * W] for y in range(H)]
        pix = bytearray()
        for row in reversed(rows):
            pix += bytes(row)
        header = struct.pack("<BBBHHBHHHHBB", 0, 1, 1, 0, 256, 32, 0, 0, W, H, 8, 0x00)
        cm_path = td / "cm.tga"
        cm_path.write_bytes(header + pal_bytes + bytes(pix))

        # 2) Decode with our codec and confirm pixel[0,0] = palette[index(0,0)].
        t = read_tga(cm_path)
        if (t.width, t.height) != (W, H):
            failures.append(f"colormapped decode dims {t.width}x{t.height} != {W}x{H}")
        if not t.had_alpha:
            failures.append("32-bit palette should flag had_alpha")
        # top-left logical pixel index = (0+0)%4 = 0 = red
        r, g, b, a = t.rgba[0:4]
        if (r, g, b, a) != (255, 0, 0, 255):
            failures.append(f"colormapped pixel(0,0)={ (r,g,b,a) } != red(255,0,0,255)")
        # pixel (1,0) index=1 -> green a=128
        r1, g1, b1, a1 = t.rgba[4:8]
        if (r1, g1, b1, a1) != (0, 255, 0, 128):
            failures.append(f"colormapped pixel(1,0)={ (r1,g1,b1,a1) } != (0,255,0,128)")

        # 3) Upscale 2x (force the deterministic Lanczos/NN path for a reproducible selftest).
        up, used = upscale_tga(t, 2, prefer_external=False)
        if (up.width, up.height) != (W * 2, H * 2):
            failures.append(f"2x upscale dims {up.width}x{up.height} != {W*2}x{H*2}")

        # 4) Write back as truecolor TGA, re-read, confirm dims + 32-bit (alpha preserved).
        out_path = td / "out.tga"
        write_tga(out_path, up.width, up.height, up.rgba, alpha=True)
        wb = out_path.read_bytes()
        if wb[2] != 2:
            failures.append(f"written TGA image_type {wb[2]} != 2 (truecolor)")
        if wb[16] != 32:
            failures.append(f"written TGA bpp {wb[16]} != 32")
        rt = read_tga(out_path)
        if (rt.width, rt.height) != (W * 2, H * 2):
            failures.append(f"roundtrip dims {rt.width}x{rt.height} != {W*2}x{H*2}")

        # 5) Truecolor 32-bit round-trip (the format PIL also reads) — independent of palette path.
        tc_rgba = bytes([10, 20, 30, 200] * (W * H))
        tc_path = td / "tc.tga"
        write_tga(tc_path, W, H, tc_rgba, alpha=True)
        tc = read_tga(tc_path)
        if tc.rgba[0:4] != bytes([10, 20, 30, 200]):
            failures.append(f"truecolor roundtrip pixel {list(tc.rgba[0:4])} != [10,20,30,200]")

        # 6) Backup + atomic replace + revert against a throwaway install tree.
        fake = td / "install"
        rel = Path("data/image/test/cm.tga")
        (fake / rel.parent).mkdir(parents=True, exist_ok=True)
        shutil.copy2(cm_path, fake / rel)
        original = (fake / rel).read_bytes()
        b = _backup_file(fake, fake / rel, 2)
        if not b.exists():
            failures.append("backup file not created")
        # overwrite in place atomically, then revert
        up2 = read_tga(fake / rel)
        u2, _ = upscale_tga(up2, 2, prefer_external=False)
        write_tga(fake / rel, u2.width, u2.height, u2.rgba, alpha=True)
        if (fake / rel).read_bytes() == original:
            failures.append("in-place overwrite did not change the file")

        class _A:
            install = str(fake)
            keep_backup = False
        cmd_revert(_A())
        if (fake / rel).read_bytes() != original:
            failures.append("revert did not restore original bytes")
        if (fake / BACKUP_DIRNAME).exists():
            failures.append("revert did not remove backup tree")

    if failures:
        print("SELFTEST FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("SELFTEST PASSED: colormapped decode, 2x upscale, truecolor write/roundtrip, backup+atomic+revert all ok")
    ext = detect_external_upscaler()
    print(f"external upscaler on PATH: {os.path.basename(ext[0]) if ext else 'none (Lanczos fallback active)'}")
    return 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--install", default=str(DEFAULT_INSTALL), help="install tree root")
    sub = ap.add_subparsers(dest="cmd", required=True)

    up = sub.add_parser("upscale", help="upscale tga(s) in place with backup")
    up.add_argument("--scale", type=int, choices=[2, 4], default=2)
    up.add_argument("--dirs", nargs="+", default=list(DEFAULT_DIRS), help="install-relative dirs to walk")
    up.add_argument("--only", help="upscale a single install-relative (or absolute) .tga (spot check)")
    up.add_argument("--limit", type=int, help="cap the number of files (e.g. --limit 1 for a spot check)")
    up.add_argument("--dry-run", action="store_true", help="plan only; no writes")
    up.add_argument("--no-external", action="store_true", help="force the Lanczos fallback (ignore external upscalers)")
    up.set_defaults(func=cmd_upscale)

    rv = sub.add_parser("revert", help="restore every backed-up texture and drop the backup tree")
    rv.add_argument("--keep-backup", action="store_true", help="restore but keep the backup mirror")
    rv.set_defaults(func=cmd_revert)

    ls = sub.add_parser("list", help="survey the tga tree (formats + dims)")
    ls.add_argument("--dirs", nargs="+", default=list(DEFAULT_DIRS))
    ls.set_defaults(func=cmd_list)

    st = sub.add_parser("selftest", help="codec + upscale + backup/revert self-test")
    st.set_defaults(func=cmd_selftest)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
