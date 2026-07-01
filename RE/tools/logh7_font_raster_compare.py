from __future__ import annotations

import argparse
import ctypes
import json
import sys
from ctypes import wintypes
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]

FR_PRIVATE = 0x10
BI_RGB = 0
DIB_RGB_COLORS = 0
HANGEUL_CHARSET = 0x81
ANTIALIASED_QUALITY = 4
CLEARTYPE_QUALITY = 5
DEFAULT_PITCH = 0
FIXED_PITCH = 1

gdi32 = ctypes.windll.gdi32
user32 = ctypes.windll.user32


class BITMAPINFOHEADER(ctypes.Structure):
    _fields_ = [
        ("biSize", wintypes.DWORD),
        ("biWidth", wintypes.LONG),
        ("biHeight", wintypes.LONG),
        ("biPlanes", wintypes.WORD),
        ("biBitCount", wintypes.WORD),
        ("biCompression", wintypes.DWORD),
        ("biSizeImage", wintypes.DWORD),
        ("biXPelsPerMeter", wintypes.LONG),
        ("biYPelsPerMeter", wintypes.LONG),
        ("biClrUsed", wintypes.DWORD),
        ("biClrImportant", wintypes.DWORD),
    ]


class RGBQUAD(ctypes.Structure):
    _fields_ = [
        ("rgbBlue", wintypes.BYTE),
        ("rgbGreen", wintypes.BYTE),
        ("rgbRed", wintypes.BYTE),
        ("rgbReserved", wintypes.BYTE),
    ]


class BITMAPINFO(ctypes.Structure):
    _fields_ = [
        ("bmiHeader", BITMAPINFOHEADER),
        ("bmiColors", RGBQUAD * 1),
    ]


class SIZE(ctypes.Structure):
    _fields_ = [("cx", wintypes.LONG), ("cy", wintypes.LONG)]


gdi32.AddFontResourceExW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.LPVOID]
gdi32.AddFontResourceExW.restype = ctypes.c_int
gdi32.CreateCompatibleDC.argtypes = [wintypes.HDC]
gdi32.CreateCompatibleDC.restype = wintypes.HDC
gdi32.CreateDIBSection.argtypes = [
    wintypes.HDC,
    ctypes.POINTER(BITMAPINFO),
    wintypes.UINT,
    ctypes.POINTER(ctypes.c_void_p),
    wintypes.HANDLE,
    wintypes.DWORD,
]
gdi32.CreateDIBSection.restype = wintypes.HBITMAP
gdi32.CreateFontA.argtypes = [
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    ctypes.c_int,
    wintypes.DWORD,
    wintypes.DWORD,
    wintypes.DWORD,
    wintypes.DWORD,
    wintypes.DWORD,
    wintypes.DWORD,
    wintypes.DWORD,
    wintypes.DWORD,
    wintypes.LPCSTR,
]
gdi32.CreateFontA.restype = wintypes.HFONT
gdi32.DeleteDC.argtypes = [wintypes.HDC]
gdi32.DeleteDC.restype = wintypes.BOOL
gdi32.DeleteObject.argtypes = [wintypes.HGDIOBJ]
gdi32.DeleteObject.restype = wintypes.BOOL
gdi32.ExtTextOutA.argtypes = [
    wintypes.HDC,
    ctypes.c_int,
    ctypes.c_int,
    wintypes.UINT,
    wintypes.LPVOID,
    wintypes.LPCSTR,
    wintypes.UINT,
    wintypes.LPVOID,
]
gdi32.ExtTextOutA.restype = wintypes.BOOL
gdi32.GetTextExtentPoint32A.argtypes = [
    wintypes.HDC,
    wintypes.LPCSTR,
    ctypes.c_int,
    ctypes.POINTER(SIZE),
]
gdi32.GetTextExtentPoint32A.restype = wintypes.BOOL
gdi32.SelectObject.argtypes = [wintypes.HDC, wintypes.HGDIOBJ]
gdi32.SelectObject.restype = wintypes.HGDIOBJ
gdi32.SetBkColor.argtypes = [wintypes.HDC, wintypes.COLORREF]
gdi32.SetBkColor.restype = wintypes.COLORREF
gdi32.SetMapMode.argtypes = [wintypes.HDC, ctypes.c_int]
gdi32.SetMapMode.restype = ctypes.c_int
gdi32.SetTextAlign.argtypes = [wintypes.HDC, wintypes.UINT]
gdi32.SetTextAlign.restype = wintypes.UINT
gdi32.SetTextColor.argtypes = [wintypes.HDC, wintypes.COLORREF]
gdi32.SetTextColor.restype = wintypes.COLORREF


def register_fonts(font_root: Path) -> dict[str, int]:
    total = 0
    loaded = 0
    for source in sorted(font_root.rglob("*")):
        if source.suffix.lower() not in {".ttf", ".otf"}:
            continue
        total += 1
        loaded += int(gdi32.AddFontResourceExW(str(source), FR_PRIVATE, None))
    return {"files": total, "faces": loaded}


def make_dib(width: int, height: int, bpp: int) -> tuple[wintypes.HDC, wintypes.HBITMAP, ctypes.c_void_p]:
    info = BITMAPINFO()
    info.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    info.bmiHeader.biWidth = width
    info.bmiHeader.biHeight = -height
    info.bmiHeader.biPlanes = 1
    info.bmiHeader.biBitCount = bpp
    info.bmiHeader.biCompression = BI_RGB
    hdc = gdi32.CreateCompatibleDC(None)
    bits = ctypes.c_void_p()
    hbitmap = gdi32.CreateDIBSection(hdc, ctypes.byref(info), DIB_RGB_COLORS, ctypes.byref(bits), None, 0)
    if not hdc or not hbitmap or not bits:
        raise OSError("CreateDIBSection failed")
    gdi32.SelectObject(hdc, hbitmap)
    return hdc, hbitmap, bits


def render_case(
    *,
    text: str,
    face: str,
    height: int,
    weight: int,
    quality: int,
    bpp: int,
    width: int,
    canvas_height: int,
) -> tuple[Image.Image, Image.Image, dict[str, int | str]]:
    hdc, hbitmap, bits = make_dib(width, canvas_height, bpp)
    stride = ((width * bpp + 31) // 32) * 4
    buf_len = stride * canvas_height
    try:
        ctypes.memset(bits, 0, buf_len)
        gdi32.SetMapMode(hdc, 1)
        font = gdi32.CreateFontA(
            height,
            0,
            0,
            0,
            weight,
            0,
            0,
            0,
            HANGEUL_CHARSET,
            0,
            0,
            quality,
            FIXED_PITCH if bpp == 16 else DEFAULT_PITCH,
            face.encode("ascii"),
        )
        if not font:
            raise OSError(f"CreateFontA failed for {face}")
        old_font = gdi32.SelectObject(hdc, font)
        gdi32.SetTextColor(hdc, 0xFFFFFF)
        gdi32.SetBkColor(hdc, 0)
        gdi32.SetTextAlign(hdc, 0)
        encoded = text.encode("cp949")
        size = SIZE()
        gdi32.GetTextExtentPoint32A(hdc, encoded, len(encoded), ctypes.byref(size))
        x = max(0, (width - size.cx) // 2)
        y = max(0, (canvas_height - abs(height)) // 2)
        gdi32.ExtTextOutA(hdc, x, y, 0, None, encoded, len(encoded), None)
        raw = ctypes.string_at(bits, buf_len)
        if bpp == 16:
            # LOGH VII's dynamic glyph atlas does this: alpha = first byte's high nibble.
            alpha = bytearray(width * canvas_height)
            raw_luma = bytearray(width * canvas_height)
            for yy in range(canvas_height):
                row = yy * stride
                for xx in range(width):
                    lo = raw[row + xx * 2]
                    hi = raw[row + xx * 2 + 1]
                    a4 = lo >> 4
                    alpha[yy * width + xx] = a4 * 17
                    raw_luma[yy * width + xx] = max(lo, hi)
            raw_img = Image.frombytes("L", (width, canvas_height), bytes(raw_luma))
            game_img = Image.frombytes("L", (width, canvas_height), bytes(alpha))
        else:
            alpha = bytearray(width * canvas_height)
            raw_luma = bytearray(width * canvas_height)
            for yy in range(canvas_height):
                row = yy * stride
                for xx in range(width):
                    b = raw[row + xx * 4]
                    g = raw[row + xx * 4 + 1]
                    r = raw[row + xx * 4 + 2]
                    alpha[yy * width + xx] = ((b >> 4) & 0x0F) * 17
                    raw_luma[yy * width + xx] = max(r, g, b)
            raw_img = Image.frombytes("L", (width, canvas_height), bytes(raw_luma))
            game_img = Image.frombytes("L", (width, canvas_height), bytes(alpha))
        solid = sum(1 for value in game_img.tobytes() if value >= 204)
        lit = sum(1 for value in game_img.tobytes() if value > 0)
        avg = int(sum(game_img.tobytes()) / max(1, lit))
        metrics = {
            "face": face,
            "height": height,
            "weight": weight,
            "quality": quality,
            "bpp": bpp,
            "textWidth": int(size.cx),
            "textHeight": int(size.cy),
            "litPixels": lit,
            "solidPixels": solid,
            "avgLitAlpha": avg,
            "solidRatioPermille": int((solid * 1000) / max(1, lit)),
        }
        gdi32.SelectObject(hdc, old_font)
        gdi32.DeleteObject(font)
        return raw_img, game_img, metrics
    finally:
        gdi32.DeleteObject(hbitmap)
        gdi32.DeleteDC(hdc)


def label_font() -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("arial.ttf", 13)
    except OSError:
        return ImageFont.load_default()


def build_montage(rows: list[tuple[str, Image.Image, Image.Image, dict[str, int | str]]], out: Path) -> None:
    scale = 4
    label_h = 38
    pad = 10
    cell_w = max(img.width for _, img, _, _ in rows) * scale
    cell_h = max(img.height for _, img, _, _ in rows) * scale
    montage = Image.new("RGB", (pad * 3 + cell_w * 2, pad + len(rows) * (label_h + cell_h + pad)), (20, 22, 28))
    draw = ImageDraw.Draw(montage)
    font = label_font()
    y = pad
    for label, raw_img, game_img, metrics in rows:
        draw.text((pad, y), label, fill=(230, 235, 245), font=font)
        draw.text(
            (pad, y + 17),
            f"lit={metrics['litPixels']} solid={metrics['solidPixels']} solidRatio={metrics['solidRatioPermille']}/1000 avg={metrics['avgLitAlpha']}",
            fill=(170, 190, 215),
            font=font,
        )
        y += label_h
        raw_scaled = raw_img.resize((raw_img.width * scale, raw_img.height * scale), Image.Resampling.NEAREST).convert("RGB")
        game_scaled = game_img.resize((game_img.width * scale, game_img.height * scale), Image.Resampling.NEAREST).convert("RGB")
        montage.paste(raw_scaled, (pad, y))
        montage.paste(game_scaled, (pad * 2 + cell_w, y))
        draw.text((pad, y + 2), "raw DIB", fill=(80, 220, 255), font=font)
        draw.text((pad * 2 + cell_w, y + 2), "LOGH alpha extraction", fill=(255, 210, 80), font=font)
        y += cell_h + pad
    out.parent.mkdir(parents=True, exist_ok=True)
    montage.save(out)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare LOGH VII GDI font rasterization and atlas alpha extraction.")
    parser.add_argument("--out-dir", type=Path, default=ROOT / ".omo/font-raster-compare")
    parser.add_argument("--text", default="게임 시작")
    parser.add_argument("--font-root", type=Path, default=ROOT / ".omo/work/logh7-installed/fonts")
    args = parser.parse_args()

    font_receipt = register_fonts(args.font_root)
    cases = [
        ("Gulim 14 q4 w400 atlas", "Gulim", 14, 400, ANTIALIASED_QUALITY, 16),
        ("Pretendard 14 q5 w400 atlas-current", "Pretendard", 14, 400, CLEARTYPE_QUALITY, 16),
        ("Pretendard 14 q4 w400 atlas-no-cleartype", "Pretendard", 14, 400, ANTIALIASED_QUALITY, 16),
        ("Pretendard 16 q4 w400 atlas", "Pretendard", 16, 400, ANTIALIASED_QUALITY, 16),
        ("Pretendard 16 q4 w600 atlas", "Pretendard", 16, 600, ANTIALIASED_QUALITY, 16),
        ("Pretendard -19 q5 w700 primary-current", "Pretendard", -19, 700, CLEARTYPE_QUALITY, 32),
        ("Gulim -19 q4 w700 primary", "Gulim", -19, 700, ANTIALIASED_QUALITY, 32),
    ]
    rows = []
    metrics = []
    for label, face, height, weight, quality, bpp in cases:
        raw_img, game_img, row_metrics = render_case(
            text=args.text,
            face=face,
            height=height,
            weight=weight,
            quality=quality,
            bpp=bpp,
            width=220,
            canvas_height=44,
        )
        rows.append((label, raw_img, game_img, row_metrics))
        metrics.append(row_metrics)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    build_montage(rows, args.out_dir / "font-raster-compare.png")
    (args.out_dir / "font-raster-compare.json").write_text(
        json.dumps({"fontRegistration": font_receipt, "text": args.text, "metrics": metrics}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "fontRegistration": font_receipt,
        "outImage": str(args.out_dir / "font-raster-compare.png"),
        "outMetrics": str(args.out_dir / "font-raster-compare.json"),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    if sys.platform != "win32":
        raise SystemExit("Windows is required for GDI raster comparison.")
    raise SystemExit(main())
