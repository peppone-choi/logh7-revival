"""Evidence-assisted canon-face identification kit (anti-guesswork).

The original name↔face roster was server-side and is lost; only 12 official name↔face-number anchors
survive. To name MORE canon faces WITHOUT guessing, this builds a principled human-ID workspace:

  - per-atlas contact sheets of the UNIQUE canon faces (oem=Empire-male, oam=Alliance-male, o=female/misc),
    each tile labelled with its tcf-slot index + the 12 official anchors marked in yellow,
  - a per-face dominant HAIR-REGION colour (top strip) so distinctive canon cast surface fast
    (Kircheis red, Mittermeyer silver, Yang/Reuenthal black, Bittenfeld orange, Reinhard gold…),
  - a faction/sex constraint baked in (the atlas itself), narrowing each face's candidate identity.

The human (who knows LOGH) then identifies the RECOGNISABLE cast against known reference art; matches are
recorded with a confidence tier. Unidentifiable faces stay anonymous — never guessed.

Usage:
  python tools/logh7_face_idkit.py sheets   # write content/roster/idkit/{oem,oam,o}.png + faces.json
"""
from __future__ import annotations

import json
import struct
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

FACE_DIR = Path(".omo/work/logh7-installed/data/image/Face")
OUT = Path("content/roster/idkit")
# atlas -> (label, faction, sex)
ORIGINAL = {"oem": ("Empire male", "empire", "male"),
            "oam": ("Alliance male", "alliance", "male"),
            "o": ("female/misc", None, None)}
# the 12 official anchors are flat chara numbers, not tcf slots — marked by pixel-confirmed slot where known
ANCHOR_SLOTS = {"oam": {274: "Yang(206)", 230: "Schenkopp(85)"}}


def load_hed():
    hed = (FACE_DIR / "tcf.hed").read_bytes()
    return [struct.unpack_from("<II", hed, i * 8) for i in range(len(hed) // 8)]


def decode(region: bytes):
    # STRICT: region length must EXACTLY equal header+palette+pixels (loose "fits" accepted garbage
    # when a slot was read from the wrong atlas — e.g. oam slot 83 is really an oem portrait).
    if len(region) < 18 + 1024:
        return None
    w = struct.unpack_from("<H", region, 0x0c)[0]
    h = struct.unpack_from("<H", region, 0x0e)[0]
    if not (8 <= w <= 256 and 8 <= h <= 256) or 18 + 1024 + w * h != len(region):
        return None
    pal = region[18:18 + 1024]
    px = region[18 + 1024:18 + 1024 + w * h]
    img = Image.new("RGB", (w, h))
    img.putdata([(pal[i * 4 + 2], pal[i * 4 + 1], pal[i * 4 + 0]) for i in px])
    return img.transpose(Image.FLIP_TOP_BOTTOM)


def hair_color(img: Image.Image) -> tuple[int, int, int]:
    """Dominant colour of the top hair strip (rows 6..22) — a cheap, principled identity cue."""
    strip = img.crop((8, 6, img.width - 8, 22)).resize((16, 8))
    most = Counter(strip.getdata()).most_common(1)[0][0]
    return most


def color_name(rgb: tuple[int, int, int]) -> str:
    r, g, b = rgb
    mx = max(rgb)
    if mx < 60:
        return "black"
    if r > 150 and g > 130 and b < 120 and abs(r - g) < 60:
        return "blond"
    if r > 130 and g < 110 and b < 100:
        return "red/orange"
    if mx - min(rgb) < 30 and mx > 120:
        return "silver/gray"
    if b > r and b > g:
        return "blue/black"
    if r > 110 and g > 80 and b < 90:
        return "brown"
    return f"rgb{rgb}"


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    hed = load_hed()
    catalog = {}
    for atlas, (label, faction, sex) in ORIGINAL.items():
        data = (FACE_DIR / f"{atlas}.tcf").read_bytes()
        # DEDUP: the same person repeats across slots (514 slots → 290 unique). Hash each decoded image
        # and keep ONE tile per unique face, listing all its slots — so the human IDs each person once.
        by_hash = {}
        for i, (off, sz) in enumerate(hed):
            if sz == 0 or off + sz > len(data):
                continue
            img = decode(data[off:off + sz])
            if img is None:
                continue
            key = img.tobytes()
            if key in by_hash:
                by_hash[key][2].append(i)  # extra duplicate slot
            else:
                by_hash[key] = (i, img, [i], hair_color(img))
        faces = [(rep, img, hc, slots) for (rep, img, slots, hc) in by_hash.values()]
        # contact sheet, sorted by hair colour so same-haired cast cluster (distinctive ones pop)
        faces.sort(key=lambda t: (color_name(t[2]), t[0]))
        cols, scale = 12, 2
        cw, ch = 64 * scale, 80 * scale + 26
        rows = (len(faces) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cw, rows * ch), (24, 24, 28))
        d = ImageDraw.Draw(sheet)
        for n, (idx, img, hc, slots) in enumerate(faces):
            r, c = divmod(n, cols)
            sheet.paste(img.resize((64 * scale, 80 * scale)), (c * cw, r * ch))
            anchors = ANCHOR_SLOTS.get(atlas, {})
            anchor = next((anchors[s] for s in slots if s in anchors), None)
            dup = f" x{len(slots)}" if len(slots) > 1 else ""
            d.text((c * cw + 2, r * ch + 80 * scale), f"{idx}{dup} {color_name(hc)[:6]}",
                   fill=(255, 230, 90) if anchor else (200, 200, 200))
            if anchor:
                d.rectangle([c * cw, r * ch, c * cw + 64 * scale - 1, r * ch + 80 * scale - 1],
                            outline=(255, 230, 90), width=2)
                d.text((c * cw + 2, r * ch + 80 * scale + 12), anchor, fill=(255, 230, 90))
        sheet.save(OUT / f"{atlas}.png")
        catalog[atlas] = {"label": label, "faction": faction, "sex": sex,
                          "unique": len(faces),
                          "faces": [{"slot": i, "slots": slots, "hair": color_name(hc), "rgb": list(hc)}
                                    for i, _, hc, slots in faces]}
        print(f"{atlas} ({label}): {len(faces)} UNIQUE faces "
              f"({sum(len(f[3]) for f in faces)} slots) -> {OUT/(atlas+'.png')}")
    (OUT / "faces.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1))
    print(f"catalog -> {OUT/'faces.json'}")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "sheets":
        build()
    else:
        print(__doc__)
