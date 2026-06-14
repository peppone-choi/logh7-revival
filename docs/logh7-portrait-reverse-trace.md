# LOGH VII portrait reverse-trace — who is each canon portrait?

User idea: "포트레잇 274번을 쓰는 캐릭터가 누군지 역추적" (reverse-trace which character
uses portrait 274), generalized to all 514 extracted VII canon portraits.

**Answer to the original question: `oam/0274` = Yang Wen-li (양 웬리)** — confirmed by official
pixel-match (NCC 0.937), agreeing with the prior anchor.

## TL;DR
- **Was prior-game (LOGH VI) art reused? NO.** VII redrew the portraits. This is the decisive
  finding (evidence below). Visual matching against LOGH VI is therefore unreliable for identity.
- **High-confidence IDs: 4 portrait records / 2 distinct characters** (Yang `oam/0274`;
  Schenkopp `oam/0230`, with same-image duplicates at `oam/0481`, `oam/0931`).
- The bottleneck is the labeled source: the only art that *pixel-matches* VII is the official
  `gineiden.com chara/NNN.jpg` set, and that site (plus archive.org) was **unreachable from this
  build environment**. Only 2 official portraits were pre-downloaded, so only 2 identities are
  anchorable right now. The method and tooling to scale to the full roster are in place — it only
  needs the official portrait set fetched on a networked machine.

## The decisive test — art reuse?
Method: normalize each portrait (grayscale, resize 48×60, zero-mean/unit-std to kill illumination),
compute normalized cross-correlation (NCC) of the two VII anchors against (a) all 118 LOGH VI faces
and (b) the official gineiden.com art that VII is known to use.

| Comparison | NCC | Verdict |
|---|---|---|
| VII Yang `oam/0274` vs official `chara/206.jpg` | **0.937** | same art (VII uses official art) |
| VII Schenkopp `oam/0230` vs official `chara/085.jpg` | **0.881** | same art |
| VII Yang vs *best* LOGH VI face (`r233`) | 0.675 | **different person** (r233 is a random VI officer) |
| VII Schenkopp vs *best* LOGH VI face (`r213`) | 0.675 | different person |

Both VII anchors map to the *same* wrong VI faces (`r233`, `r213`) at ~0.67 — that is generic
"young man in a military cap" similarity, not identity. The whole unique VII set peaks at only
**~0.71 NCC** against VI. Conclusion: **LOGH VII portraits are freshly redrawn; LOGH VI's
`FACEGRPH.DLL` art was NOT reused.** A prior-game label cannot be transferred by pixel-identity.

## What each source yielded
1. **LOGH VI `FACEGRPH.DLL` (top lead) — cracked, but art differs.**
   It is a Windows PE resource container: 118 `RT_BITMAP` resources, each a packed 8-bpp DIB
   (40-byte BITMAPINFOHEADER + 256×4 palette + pixels), **80×120** (VII portraits are 64×80).
   All 118 extracted cleanly (tool below). The faces are the same canon cast (Reinhard, Yang,
   Kircheis, etc. are visually present) but **redrawn** vs VII, so no pixel bridge.
   VI's `DATA/` has no name↔face-id table that pairs with the resource ids (`Charcost.bin` is
   stat/cost data); names live SJIS-encoded in the EXE/scenario resources, not trivially indexable.
2. **LOGH IV EX `db.mdb` — opened, but no face column.**
   Read via `Microsoft.ACE.OLEDB.12.0` (PowerShell). Tables: `인물`(characters), `성계`(systems),
   `행성`(planets). `인물` has only `ID | 이름` (181 names) — a clean name list but **no portrait/
   face id column**, so no name→face mapping to mine.
3. **Official gineiden.com pixel-anchors — the only reliable bridge, but network-blocked.**
   The 2 pre-downloaded official portraits pixel-match VII at 0.88–0.94 → these are the same images
   VII ships. This is the path that scales, pending fetch of the full `chara/NNN.jpg` set.

## Atlas structure discovered (important for scaling)
- 514 PNG files collapse to **290 unique images** — heavy duplication (86 duplicate-groups, several
  of size 7). e.g. Schenkopp's image appears at `oam/0230`, `/0481`, `/0931`.
- Indices are the sparse global `tcf.hed` slot id (oam spans 1..1210), **not** the official
  `chara/NNN` number. The `portraits/README.md` claim "PNG index NNNN == official chara/NNN.jpg" is
  **wrong**: official Yang `206` matches VII `oam/0274` (0.937), not `oam/0206`.
- `portrait-identities.json` ships the full `duplicate_groups` map, so each future official-portrait
  match auto-propagates to every duplicate index.

## Identified so far (honest confidence)
| VII | character | confidence | source |
|---|---|---|---|
| `oam/0274` | Yang Wen-li | 0.94 | official-anchor (gineiden 206) |
| `oam/0230` | Walter von Schenkopp | 0.88 | official-anchor (gineiden 085) |
| `oam/0481`, `oam/0931` | Walter von Schenkopp | 0.86 | duplicate of `oam/0230` |

Color-cluster pools were computed as *candidate sets* (25 blond, 44 red-ish, 10 black-hair among
the 290 uniques; Yang correctly lands in the black-hair pool) but color alone cannot separate, e.g.,
Reinhard from any other blond, so **no identity is asserted from color or from VI visual NCC** —
those leads are stored as raw, explicitly-rejected data in the JSON.

## What remains unidentifiable here
288 of the 290 unique images. They are identifiable in principle by the proven official-anchor
method; they are blocked only by lack of network access to gineiden.com / archive.org in this env.

## Tools written
- `tools/logh7_facegrph_extract.py` — `probe` / `dump` LOGH VI `FACEGRPH.DLL` PE bitmaps
  (reusable; READ-ONLY against prior-game files).

## How to finish on a networked machine
1. Fetch `gineiden.com` (or Wayback) `chara/NNN.jpg` for the full cast → labeled set.
2. Pixel-match each labeled portrait against the 290 VII uniques (same NCC pipeline); accept ≥0.85.
3. Propagate accepted IDs across `duplicate_groups`; append to `portrait-identities.json`.
