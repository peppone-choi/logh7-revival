"""Recover LOGH VI labeled portraits and match LOGH VII canon faces against them.

LOGH VI is the immediately-prior game: same canon cast, similar (but redrawn)
art style, and -- crucially -- its data files LABEL each portrait with a
character name. We crack that labeling, then match each VII face to its best
VI labeled portrait with a STYLE-ROBUST method (not raw pixels, which fail
across the redraw), and emit human-verifiable side-by-side comparison sheets.

READ-ONLY against the prior-game files under E:/DGGL/Games/GinVI_Win_231225.

VI data format (cracked here)
-----------------------------
- DATA/Charcost.bin : master roster. 256 records x 112 bytes, whole file
  XOR-0x2f obfuscated. Record layout (after de-XOR):
    +0x00 : cp949 character name, NUL-terminated (Korean DGGL localized build)
    +0x34..+0x4c : 7x int32 LE ability scores
    +0x50 : int32 command-class (1..5)   <- NOT faction
    +0x54 : int32 branch group (0..4)    <- NOT faction
  NOTE: Charcost has NO faction field (Empire/Alliance chars span all +0x50/+0x54
  values). Faction is supplied from a curated canon name list (CANON_FACTION)
  only for the famous characters; unknown VI chars are faction "unknown" and are
  eligible to match any VII bucket.
  Named characters are char_id 1..193; char_id 250..255 (face 350..355) are
  generic operator/extra faces and are EXCLUDED from the labeled set.
- FACEGRPH.DLL : 118 RT_BITMAP face portraits (80x120, 8bpp DIB),
  resource id = char_id + 100  (the linkage). Ids 101..293 are the 112 named
  characters; ids 350..355 are generic operator/extra faces.

So: char_id -> name (Charcost) and char_id -> portrait (FACEGRPH res char_id+100)
gives a fully LABELED VI portrait set.

Usage
-----
    python -m tools.logh7_ginvi_reference_match roster        # dump VI name table
    python -m tools.logh7_ginvi_reference_match build-vi       # extract labeled VI faces
    python -m tools.logh7_ginvi_reference_match match          # match VII->VI + sheets
    python -m tools.logh7_ginvi_reference_match all            # build-vi + match
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

GINVI = Path(r"E:/DGGL/Games/GinVI_Win_231225")
CHARCOST = GINVI / "DATA" / "Charcost.bin"
FACEGRPH = GINVI / "FACEGRPH.DLL"
XOR_KEY = 0x2F
REC_STRIDE = 112
NAME_OFF = 0x00
FACTION_OFF = 0x50
BRANCH_OFF = 0x54
FACE_RES_BASE = 100  # FACEGRPH resource id = char_id + 100

REPO = Path(__file__).resolve().parents[1]
VI_LABELED_DIR = REPO / "content" / "roster" / "idkit" / "vi-labeled"
VII_ROOT = REPO / "content" / "roster" / "canon-portraits"
SHEET_DIR = REPO / "content" / "roster" / "idkit" / "vi-match"
OUT_JSON = REPO / "content" / "roster" / "portrait-identities-vi.json"

MAX_NAMED_CHAR_ID = 193  # 250..255 are generic operator faces, excluded

# Curated canon faction for the well-known cast (Charcost has no faction field).
# Korean (cp949) names exactly as they appear in the VI roster.
CANON_FACTION = {
    "empire": {
        "라인하르트", "로엔그람", "뮈젤", "키르히아이스", "미터마이어", "로이엔탈",
        "비텐펠트", "뮐러", "오베르슈타인", "메르카츠", "파렌하이트", "케슬러",
        "메크링거", "와렌", "바렌", "젝트", "슈타인메츠", "루츠", "켐프",
        "파렌하이트", "렌넨캄프", "레르히", "안스바흐", "브라운슈바이크", "리텐하임",
        "오프레서", "슈타덴", "힐데스하임", "프레겔", "베르겐그륀", "아이제나흐",
        "그릴팔처", "포겔", "뷔로", "브렌타노", "딕켈", "그뤼네만", "할버슈타트",
        "하르바슈타트", "슈트라이트", "리히텐라데", "프리드리히Ⅳ세", "에렌베르크",
        "슈타인호프", "뮈켄베르거", "레므샤이드", "란즈베르크", "엘즈하임",
    },
    "alliance": {
        "양", "쇤코프", "어텐보로", "뷰코크", "뷰코크 ", "캬젤느", "파에타",
        "우란푸", "쿠브르슬리", "무라이", "핏셔", "포플란", "보로딘", "무어",
        "호우드", "애플턴", "Ｄ．그린힐", "Ｆ．그린힐", "Ｉ．코네프", "코네프",
        "비로라이넨", "바그다슈", "파트리체프", "마리네티", "그린힐", "시토레",
        "로보스", "트류니히트", "레베로", "샌포드", "윈저", "도손", "호우드",
        "치드", "아랄콘", "치융", "츙", "윈저", "사이토르", "마쉰고",
    },
}


def canon_faction(name_kr: str) -> str:
    n = name_kr.strip()
    if n in CANON_FACTION["empire"]:
        return "empire"
    if n in CANON_FACTION["alliance"]:
        return "alliance"
    return "unknown"


# --------------------------------------------------------------------------- #
# VI roster (Charcost.bin)
# --------------------------------------------------------------------------- #
def read_vi_roster() -> list[dict]:
    """Return [{char_id, name_kr, faction, branch}] for all named VI characters."""
    data = bytes(b ^ XOR_KEY for b in CHARCOST.read_bytes())
    nrec = len(data) // REC_STRIDE
    out = []
    for cid in range(nrec):
        rec = data[cid * REC_STRIDE:(cid + 1) * REC_STRIDE]
        z = rec.find(b"\x00", NAME_OFF)
        nb = rec[NAME_OFF:z] if z >= 0 else rec[NAME_OFF:]
        try:
            name = nb.decode("cp949").strip()
        except Exception:
            name = ""
        if not name or name == "부정":  # '부정' = invalid/none
            continue
        if cid > MAX_NAMED_CHAR_ID:  # generic operator/extra faces
            continue
        cmd_class = struct.unpack_from("<i", rec, FACTION_OFF)[0]
        branch = struct.unpack_from("<i", rec, BRANCH_OFF)[0]
        out.append({
            "char_id": cid,
            "name_kr": name,
            "cmd_class": cmd_class,
            "branch": branch,
            "faction": canon_faction(name),
            "face_res": cid + FACE_RES_BASE,
        })
    return out


# --------------------------------------------------------------------------- #
# FACEGRPH extraction (DIB decode)
# --------------------------------------------------------------------------- #
def _decode_dib(data: bytes):
    from PIL import Image
    if len(data) < 40:
        return None
    bi_size, width, height, planes, bpp = struct.unpack_from("<IiiHH", data, 0)
    if bi_size != 40 or width <= 0 or width > 4096 or abs(height) > 4096:
        return None
    clr_used = struct.unpack_from("<I", data, 32)[0]
    top_down = height < 0
    h = abs(height)
    off = bi_size
    palette = None
    if bpp <= 8:
        ncolors = clr_used if clr_used else (1 << bpp)
        palette = data[off:off + ncolors * 4]
        off += ncolors * 4
    pixels = data[off:]
    if bpp == 8:
        stride = (width + 3) & ~3
        if len(pixels) < stride * h:
            return None
        img = Image.new("RGB", (width, h))
        px = img.load()
        for y in range(h):
            sy = y if top_down else (h - 1 - y)
            base = y * stride
            for x in range(width):
                idx = pixels[base + x]
                b = palette[idx * 4]; g = palette[idx * 4 + 1]; r = palette[idx * 4 + 2]
                px[x, sy] = (r, g, b)
        return img
    return None


def _facegrph_resources():
    """Yield (res_id, png_image) for every RT_BITMAP in FACEGRPH.DLL."""
    import pefile
    pe = pefile.PE(str(FACEGRPH), fast_load=True)
    pe.parse_data_directories(
        directories=[pefile.DIRECTORY_ENTRY["IMAGE_DIRECTORY_ENTRY_RESOURCE"]])
    for type_entry in pe.DIRECTORY_ENTRY_RESOURCE.entries:
        if type_entry.id != 2:  # RT_BITMAP
            continue
        for res_entry in type_entry.directory.entries:
            lang = res_entry.directory.entries[0]
            ds = lang.data.struct
            data = pe.get_data(ds.OffsetToData, ds.Size)
            img = _decode_dib(data)
            if img is not None:
                yield res_entry.id, img


def build_vi(out_dir: Path = VI_LABELED_DIR) -> list[dict]:
    """Extract the labeled VI portrait set: face_res -> char name."""
    out_dir.mkdir(parents=True, exist_ok=True)
    roster = read_vi_roster()
    by_res = {c["face_res"]: c for c in roster}
    faces = dict(_facegrph_resources())
    labeled = []
    for res_id, img in faces.items():
        c = by_res.get(res_id)
        if not c:
            continue  # generic/extra face with no named character
        fn = f"vi_{c['char_id']:03d}_{c['faction']}.png"
        img.save(out_dir / fn)
        labeled.append({**c, "file": str((out_dir / fn).relative_to(REPO))})
    (out_dir / "_labels.json").write_text(
        json.dumps(labeled, ensure_ascii=False, indent=2), encoding="utf-8")
    return labeled


# --------------------------------------------------------------------------- #
# Style-robust matching
# --------------------------------------------------------------------------- #
def _face_crop(img):
    """Center face crop, normalized to a fixed gray + color feature space.

    VI portraits are 80x120 with the head in the upper portion; VII are 64x80
    head-and-shoulders. We crop both to the head region and resize to 64x64.
    """
    import numpy as np
    from PIL import Image
    w, h = img.size
    # Take the upper ~80% (head + shoulders), centered.
    crop = img.crop((0, 0, w, int(h * 0.85)))
    crop = crop.resize((64, 64), Image.BILINEAR)
    arr = np.asarray(crop.convert("RGB"), dtype=np.float32)
    return arr


def _features(arr):
    """Return (gray_vec, color_hist) style-robust descriptors."""
    import numpy as np
    gray = arr.mean(axis=2)
    # contrast-normalize gray (kills overall brightness/redraw tone shift)
    g = gray - gray.mean()
    s = g.std()
    if s > 1e-3:
        g = g / s
    # downsample to 16x16 structural signature
    gs = g.reshape(4, 16, 4, 16).mean(axis=(1, 3)).ravel()
    # hue/skin-tone histogram (robust-ish to redraw): coarse 4x4x4 RGB hist on
    # the central face region only
    cy = arr[16:56, 16:48].reshape(-1, 3)
    bins = (cy // 64).astype(int).clip(0, 3)
    hist = np.zeros(64, dtype=np.float32)
    idx = bins[:, 0] * 16 + bins[:, 1] * 4 + bins[:, 2]
    for i in idx:
        hist[i] += 1
    hist = hist / (hist.sum() + 1e-6)
    return gs.astype(np.float32), hist


def _score(fa, fb):
    """Combine structural NCC + color-hist similarity into one score [0,1]."""
    import numpy as np
    ga, ha = fa
    gb, hb = fb
    # structural correlation
    na = ga - ga.mean(); nb = gb - gb.mean()
    denom = (np.linalg.norm(na) * np.linalg.norm(nb)) + 1e-6
    struct_ncc = float((na @ nb) / denom)  # -1..1
    struct_ncc = (struct_ncc + 1) / 2      # 0..1
    # color histogram intersection
    color = float(np.minimum(ha, hb).sum())  # 0..1
    return 0.55 * struct_ncc + 0.45 * color


def _load_vii_faces():
    faces = []
    for bucket in ("oem", "oam", "o"):
        d = VII_ROOT / bucket
        if not d.exists():
            continue
        for p in sorted(d.glob("*.png")):
            faces.append((bucket, p.stem, p))
    return faces


# VII bucket -> which VI factions are eligible. "unknown" VI faction is always
# eligible (we only know canon faction for the famous cast). 'o' bucket is
# female/misc, so any faction is allowed.
BUCKET_FACTIONS = {
    "oem": {"empire", "unknown"},
    "oam": {"alliance", "unknown"},
    "o": {"empire", "alliance", "unknown"},
}


def match(emit_sheets: bool = True, top_k: int = 3) -> dict:
    import numpy as np
    from PIL import Image, ImageDraw

    labels = json.loads((VI_LABELED_DIR / "_labels.json").read_text(encoding="utf-8"))
    # precompute VI features
    vi = []
    for c in labels:
        img = Image.open(REPO / c["file"]).convert("RGB")
        vi.append((c, _features(_face_crop(img)), img))

    vii = _load_vii_faces()
    SHEET_DIR.mkdir(parents=True, exist_ok=True)

    results = []
    for bucket, slot, path in vii:
        img = Image.open(path).convert("RGB")
        fa = _features(_face_crop(img))
        elig_fac = BUCKET_FACTIONS[bucket]
        scored = []
        for c, fb, _vimg in vi:
            if c["faction"] not in elig_fac:
                continue
            scored.append((_score(fa, fb), c))
        if not scored:
            continue
        scored.sort(key=lambda t: -t[0])
        top = scored[:top_k]
        best_score, best_c = top[0]
        # HONESTY GATE: anchor validation (below) shows the automated matcher
        # does NOT reliably recover identity across the VII<->VI redraw
        # (Yang ranks ~#4/76, Schenkopp ~#31/76). We therefore NEVER assert an
        # identity from the score alone. The top pick is published only as a
        # weak "machine_suggestion" for human review via the comparison sheet;
        # everything else is "unidentified".
        margin = (best_score - top[1][0]) if len(top) > 1 else 1.0
        if best_score >= 0.70 and margin >= 0.05:
            conf = "machine_suggestion"
        else:
            conf = "unidentified"
        results.append({
            "vii_atlas": bucket,
            "vii_slot": slot,
            "identified_name_ja": None,   # not asserted: redraw defeats auto-ID
            "identified_name_kr": None,
            "vi_suggestion_char_id": best_c["char_id"],
            "vi_suggestion_name_kr": best_c["name_kr"],
            "vi_suggestion_faction": best_c["faction"],
            "vi_portrait_ref": best_c["file"],
            "match_method": "struct-ncc+colorhist(0.55/0.45), 64x64 head crop, faction-bucketed",
            "confidence": conf,
            "score": round(best_score, 4),
            "top3": [
                {"vi_char_id": c["char_id"], "name_kr": c["name_kr"], "score": round(s, 4)}
                for s, c in top
            ],
        })

    payload = {
        "_method": "VI labeled-portrait reference match. VI data-format crack "
                   "(Charcost.bin XOR-0x2f roster + FACEGRPH res=char_id+100) "
                   "SUCCEEDED: 112 VI portraits are name-labeled. The VII<->VI "
                   "MATCH did NOT: VII redrew the art, so struct/color correlation "
                   "cannot recover identity (anchor Yang #4/76, Schenkopp #31/76). "
                   "No identity is asserted; vi_suggestion_* is a weak hint for "
                   "human review against the side-by-side sheets.",
        "_anchor_validation": _anchor_validation(vi),
        "matches": results,
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    summary = _summarize(results)
    summary["anchor_validation"] = payload["_anchor_validation"]
    if emit_sheets:
        _emit_sheets(results, vi, vii, top_k)
        contact_sheet()
        anchor_sheet()
    return summary


def _anchor_validation(vi):
    """Where does the CORRECT VI char rank for the 2 pixel-confirmed anchors?"""
    from PIL import Image
    out = []
    for bucket, slot, cid, nm in [("oam", "0274", 133, "Yang"),
                                  ("oam", "0230", 51, "Schenkopp")]:
        fa = _features(_face_crop(Image.open(VII_ROOT / bucket / f"{slot}.png").convert("RGB")))
        elig = BUCKET_FACTIONS[bucket]
        scored = sorted(((_score(fa, fb), c) for c, fb, _ in vi if c["faction"] in elig),
                        key=lambda t: -t[0])
        rank = next((i + 1 for i, (s, c) in enumerate(scored) if c["char_id"] == cid), None)
        out.append({
            "vii": f"{bucket}/{slot}", "expected": nm, "expected_vi_char_id": cid,
            "rank_of_correct": rank, "pool_size": len(scored),
            "top1": scored[0][1]["name_kr"] if scored else None,
            "in_top3": bool(rank and rank <= 3),
        })
    return out


def contact_sheet(out: Path = None):
    """One browsable grid of all 112 labeled VI portraits (name under each)."""
    from PIL import Image, ImageDraw, ImageFont
    out = out or (SHEET_DIR / "_vi_labeled_contact.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    labels = json.loads((VI_LABELED_DIR / "_labels.json").read_text(encoding="utf-8"))
    labels.sort(key=lambda c: (c["faction"], c["char_id"]))
    try:
        font = ImageFont.truetype("malgun.ttf", 10)
    except Exception:
        font = ImageFont.load_default()
    cell = (80, 120); pad = 16; cols = 12
    rows = (len(labels) + cols - 1) // cols
    W = cols * cell[0]; H = rows * (cell[1] + pad)
    sheet = Image.new("RGB", (W, H), (25, 25, 25))
    d = ImageDraw.Draw(sheet)
    fac_color = {"empire": (200, 180, 120), "alliance": (120, 180, 220), "unknown": (170, 170, 170)}
    for i, c in enumerate(labels):
        r, col = divmod(i, cols)
        x = col * cell[0]; y = r * (cell[1] + pad)
        sheet.paste(Image.open(REPO / c["file"]).convert("RGB"), (x, y))
        d.text((x + 1, y + cell[1] + 1), c["name_kr"][:6], fill=fac_color[c["faction"]], font=font)
    sheet.save(out)
    return out, len(labels)


def anchor_sheet(out: Path = None):
    """VII anchor next to its CANON-correct VI portrait (ground-truth pairing)."""
    from PIL import Image, ImageDraw, ImageFont
    out = out or (SHEET_DIR / "_anchor_verification.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    labels = {c["char_id"]: c for c in
              json.loads((VI_LABELED_DIR / "_labels.json").read_text(encoding="utf-8"))}
    try:
        font = ImageFont.truetype("malgun.ttf", 12)
    except Exception:
        font = ImageFont.load_default()
    # (VII bucket, slot, correct VI char_id, label)
    pairs = [("oam", "0274", 133, "Yang 양"), ("oam", "0230", 51, "Schenkopp 쇤코프")]
    cell = (110, 130)
    sheet = Image.new("RGB", (cell[0] * 2 * len(pairs) + 20, cell[1] + 24), (25, 25, 25))
    d = ImageDraw.Draw(sheet)
    for i, (b, s, cid, lab) in enumerate(pairs):
        x0 = i * (cell[0] * 2 + 20)
        vii = Image.open(VII_ROOT / b / f"{s}.png").convert("RGB").resize(cell)
        vi = Image.open(REPO / labels[cid]["file"]).convert("RGB").resize(cell)
        sheet.paste(vii, (x0, 0)); sheet.paste(vi, (x0 + cell[0], 0))
        d.text((x0 + 2, cell[1] + 2), f"VII {b}/{s}", fill=(120, 220, 120), font=font)
        d.text((x0 + cell[0] + 2, cell[1] + 2), f"VI {lab}", fill=(220, 220, 120), font=font)
    sheet.save(out)
    return out


def _summarize(results):
    tiers = {}
    for r in results:
        tiers[r["confidence"]] = tiers.get(r["confidence"], 0) + 1
    return {"total_vii": len(results), "tiers": tiers}


def _emit_sheets(results, vi, vii, top_k):
    """One comparison sheet per VII face: VII | top-k VI candidates (labeled)."""
    from PIL import Image, ImageDraw, ImageFont
    vii_by = {(b, s): p for b, s, p in vii}
    vi_by_cid = {c["char_id"]: vimg for c, _f, vimg in vi}
    try:
        font = ImageFont.truetype("malgun.ttf", 11)  # Korean-capable on Windows
    except Exception:
        font = ImageFont.load_default()
    cell = (96, 120)
    # Only sheet the tentative matches + the two known anchors (keeps it human-reviewable)
    interesting = [r for r in results
                   if r["confidence"] != "unidentified"
                   or (r["vii_atlas"], r["vii_slot"]) in (("oam", "0274"), ("oam", "0230"))]
    for r in interesting:
        p = vii_by.get((r["vii_atlas"], r["vii_slot"]))
        if not p:
            continue
        cols = 1 + len(r["top3"])
        sheet = Image.new("RGB", (cell[0] * cols, cell[1] + 30), (30, 30, 30))
        d = ImageDraw.Draw(sheet)
        sheet.paste(Image.open(p).convert("RGB").resize(cell), (0, 0))
        d.text((2, cell[1] + 2), f"VII {r['vii_atlas']}/{r['vii_slot']}", fill=(120, 220, 120), font=font)
        for i, cand in enumerate(r["top3"]):
            vimg = vi_by_cid.get(cand["vi_char_id"])
            if vimg is None:
                continue
            x = (i + 1) * cell[0]
            sheet.paste(vimg.resize(cell), (x, 0))
            d.text((x + 2, cell[1] + 2), f"{cand['name_kr']}", fill=(220, 220, 120), font=font)
            d.text((x + 2, cell[1] + 16), f"{cand['score']:.3f}", fill=(180, 180, 180), font=font)
        name = f"{r['vii_atlas']}_{r['vii_slot']}.png"
        sheet.save(SHEET_DIR / name)


# --------------------------------------------------------------------------- #
def cmd_roster(_):
    for c in read_vi_roster():
        print(f"cid{c['char_id']:3d} face{c['face_res']:3d} [{c['faction']:8s}] {c['name_kr']}")


def cmd_build_vi(_):
    labeled = build_vi()
    print(f"labeled VI portraits extracted: {len(labeled)} -> {VI_LABELED_DIR}")


def cmd_match(args):
    summary = match(emit_sheets=not args.no_sheets)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def cmd_all(args):
    labeled = build_vi()
    print(f"labeled VI portraits: {len(labeled)}")
    summary = match(emit_sheets=not args.no_sheets)
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def cmd_sheets(_):
    out, n = contact_sheet()
    print(f"contact sheet ({n} VI portraits) -> {out}")
    print(f"anchor sheet -> {anchor_sheet()}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("roster").set_defaults(func=cmd_roster)
    sub.add_parser("build-vi").set_defaults(func=cmd_build_vi)
    m = sub.add_parser("match"); m.add_argument("--no-sheets", action="store_true"); m.set_defaults(func=cmd_match)
    sub.add_parser("sheets").set_defaults(func=cmd_sheets)
    a = sub.add_parser("all"); a.add_argument("--no-sheets", action="store_true"); a.set_defaults(func=cmd_all)
    args = ap.parse_args(argv)
    return args.func(args) or 0


if __name__ == "__main__":
    sys.exit(main())
