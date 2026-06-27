#!/usr/bin/env python3
"""레퍼런스 스크린샷 콘택트시트(몽타주) 생성 — 전수 육안 확인용.

.omo/reference/_unique.txt(중복제거 목록)의 이미지를 라벨 붙인 썸네일 그리드로 묶어
시트당 24장(4x6)으로 .omo/reference/montage/sheet_NN.jpg 생성. Read로 시트만 보면 전수 확인.
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw

ROOT = ".omo/reference"

def label(f: str) -> str:
    b = os.path.basename(f)
    if "_" in b and len(b.split("_", 1)[0]) == 6:
        b = b.split("_", 1)[1]
    host = os.path.basename(os.path.dirname(f))[:5]
    return (host + "/" + b)[:46]

def main() -> int:
    outdir = os.path.join(ROOT, "montage")
    os.makedirs(outdir, exist_ok=True)
    listing = os.path.join(ROOT, "_unique.txt")
    files = [l.strip().replace(chr(92), "/") for l in open(listing, encoding="utf-8") if l.strip()]
    files = [f for f in files if os.path.exists(f)]
    files.sort()
    CW, CH, LH, PAD = 300, 225, 16, 4
    COLS, ROWS = 4, 6
    cellW, cellH = CW + PAD, CH + LH + PAD
    sheetW, sheetH = COLS * cellW, ROWS * cellH
    sheets = []
    i = 0
    n = 0
    while i < len(files):
        sheet = Image.new("RGB", (sheetW, sheetH), (20, 20, 28))
        d = ImageDraw.Draw(sheet)
        for cell in range(COLS * ROWS):
            if i >= len(files):
                break
            f = files[i]
            i += 1
            x = (cell % COLS) * cellW
            y = (cell // COLS) * cellH
            try:
                im = Image.open(f)
                if getattr(im, "format", "") == "GIF":
                    im.seek(0)
                im = im.convert("RGB")
                im.thumbnail((CW, CH))
                ox = x + (CW - im.width) // 2
                oy = y + (CH - im.height) // 2
                sheet.paste(im, (ox, oy))
            except Exception as e:
                d.text((x + 4, y + 4), ("ERR " + str(e))[:40], fill=(255, 80, 80))
            d.text((x + 2, y + CH + 2), label(f), fill=(180, 220, 255))
        p = os.path.join(outdir, "sheet_%02d.jpg" % n)
        sheet.save(p, quality=82)
        sheets.append(p)
        n += 1
    print("created %d montage sheets for %d images:" % (len(sheets), len(files)))
    for s in sheets:
        print("  ", s, os.path.getsize(s) // 1024, "KB")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
