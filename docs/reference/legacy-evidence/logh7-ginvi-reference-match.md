# LOGH VI as a labeled reference for identifying LOGH VII portraits

**Date:** 2026-06-12
**Tool:** `tools/logh7_ginvi_reference_match.py`
**Source (READ-ONLY):** `E:/DGGL/Games/GinVI_Win_231225/` (Korean DGGL build of 銀河英雄伝説VI)

## TL;DR

- **VI data-format crack: SUCCEEDED.** We fully recovered VI's labeled portrait
  set — **112 face portraits, each tagged with its canon character name** — by
  reversing `Charcost.bin` (the name table) and the `FACEGRPH.DLL` linkage.
- **VII → VI automated match: FAILED (honestly reported).** VII redrew the
  portraits hard enough that style-robust correlation (structure + colour) does
  **not** recover identity. On the two pixel-confirmed anchors the correct VI
  character ranks **#4/76 (Yang)** and **#31/76 (Schenkopp)** — neither in the
  top-3. We therefore **assert no identities**; the top pick is published only as
  a weak `machine_suggestion` for human review.
- **The usable deliverable is the labeled VI reference itself** plus
  side-by-side comparison sheets: a human can now eyeball any VII face against a
  named VI gallery and decide. The anchor-verification sheet visually proves the
  VI labels are correct (VII-Yang next to VI-Yang is unmistakably the same man).

## VI data format, cracked

### `DATA/Charcost.bin` — master roster (name + stats)

- 28 672 bytes = **256 records × 112 bytes**.
- **The whole file is XOR-0x2f obfuscated** (the conspicuous `0x2f` ("/") fill
  is original `0x00` after XOR). De-XOR first, then parse.
- Record layout (after de-XOR):

  | offset | type | meaning |
  |--------|------|---------|
  | `+0x00` | cp949 string, NUL-terminated | character name (Korean, this is the localized DGGL build; original JP is Shift-JIS) |
  | `+0x34..+0x4c` | 7 × int32 LE | ability scores (統率/政治/… style stats) |
  | `+0x50` | int32 | command-class 1..5 (**not** faction) |
  | `+0x54` | int32 | branch group 0..4 (**not** faction) |
  | `+0x60..` | int32 | trailing flags, `0xffffffff` terminator |

- **Named characters are `char_id` 1..193** (`char_id 0` = `부정` = "invalid").
  `char_id` 250..255 are generic `오퍼레이터` ("operator") placeholders.
- **There is no faction field in Charcost.** Empire and Alliance characters span
  every `+0x50`/`+0x54` value. Faction for the famous cast is therefore supplied
  from a curated canon list (`CANON_FACTION` in the tool); unknown VI characters
  are faction `unknown` and may match any VII bucket.

### `FACEGRPH.DLL` — the portraits, and the linkage

- PE resource container, **118 `RT_BITMAP` entries** (80×120, 8 bpp DIB; one is
  82×120). Resource IDs are **sparse**: 101–293 plus 350–355.
- **Linkage cracked: `FACEGRPH resource id = char_id + 100`.**
  - Resource IDs 101–293 → the 112 named characters that have a unique portrait.
  - Resource IDs 350–355 → generic operator faces (no named character).
- Validated on the anchors: Yang `char_id 133 → res 233`, Schenkopp `51 → 151`,
  Reinhard `180 → 280`, Kircheis `29 → 129`, Mittermeyer `122 → 222` — all present.
- ~82 of the 194 named characters share generic rank-based faces (no dedicated
  resource); only **112 have a unique, name-labeled portrait**.

(For comparison, VII stores its portrait number directly in the `0x0323`
character record `@0xf4` — see `content/roster/face-name-map.json`. The VI scheme
is the inverse: an external `char_id+100` lookup rather than an inline field.)

## Matching method (VII → VI)

VII portraits are 64×80; VI are 80×120. Pixel/NCC identity fails across the
redraw (a prior agent measured NCC ≈ 0.71). The tool uses a deliberately
**style-robust** descriptor instead of raw pixels:

1. Crop each portrait to the head region, resize to 64×64.
2. **Structural signature:** contrast-normalized grayscale, downsampled to 16×16,
   compared by normalized cross-correlation (kills overall brightness/tone shift).
3. **Colour signature:** coarse 4×4×4 RGB histogram over the central face region,
   compared by histogram intersection (hair/skin tone, somewhat redraw-robust).
4. Score = `0.55 · structural + 0.45 · colour`, restricted to the faction bucket
   (VII `oem`→Empire, `oam`→Alliance, `o`→either; `unknown` VI faction always
   eligible).

## Anchor validation (the honest part)

The two anchors are the only VII faces with an independently confirmed identity
(pixel-matched to surviving official `chara/NNN.jpg`): `oam/0274 = Yang`,
`oam/0230 = Schenkopp`. Running the matcher against the labeled VI gallery:

| VII anchor | expected VI char | rank of correct answer | matcher's top-1 | in top-3? |
|------------|------------------|------------------------|-----------------|-----------|
| `oam/0274` | 양 Yang (cid 133) | **#4 / 76** | 암즈도르프 (wrong) | no |
| `oam/0230` | 쇤코프 Schenkopp (cid 51) | **#31 / 76** | 바그다슈 (wrong) | no |

**Conclusion: the automated matcher is not reliable.** Yang is borderline
(close, just outside top-3); Schenkopp is essentially random. The VII redraw
defeats both structural and colour correlation. We do **not** assert identities
from the score.

Crucially, the *labels themselves are correct* — the anchor-verification sheet
(`_anchor_verification.png`) places each VII anchor beside its canon-correct VI
portrait, and they are visibly the same character. So VI labeling **works as a
human reference**; only the *automatic* cross-game pixel matching does not.

## How many of the 290/514 VII faces were identified?

- VII canon-portraits present: 514 total (`oem` 201, `oam` 221, `o` 92).
  (The brief's "290 unique" is a dedup subset; the tool scores all 514 slots.)
- **Confidently identified by the automated method: 0.** Anchor validation shows
  the method cannot be trusted to assert identity, so every entry is published as
  either `unidentified` (495) or `machine_suggestion` (19, a weak hint only).
- **Labeled VI reference available for human matching: 112 named portraits**,
  rendered into a single browsable contact sheet.

This is the honest ceiling of the data-driven approach: VI gives us a perfect
*labeled gallery*, but bridging the VII↔VI art redraw is a human (or
learned-embedding) task, not something raw correlation solves.

## Deliverables

| Path | What |
|------|------|
| `tools/logh7_ginvi_reference_match.py` | VI roster crack + FACEGRPH linkage + matcher + sheets (`roster`/`build-vi`/`match`/`sheets`/`all`) |
| `content/roster/idkit/vi-labeled/*.png` | 112 VI portraits, filename `vi_<charId>_<faction>.png` |
| `content/roster/idkit/vi-labeled/_labels.json` | char_id → name_kr → faction → face_res |
| `content/roster/portrait-identities-vi.json` | per-VII-face match output (honest: identities `null`, `vi_suggestion_*` is a hint), plus `_anchor_validation` |
| `content/roster/idkit/vi-match/_vi_labeled_contact.png` | browsable grid of all 112 named VI portraits |
| `content/roster/idkit/vi-match/_anchor_verification.png` | VII anchor ↔ canon-correct VI portrait (proves labels) |
| `content/roster/idkit/vi-match/<bucket>_<slot>.png` | per-face VII vs top-3 VI candidate sheets |

## Honest limits / next steps

- The 0x2f XOR + `char_id+100` linkage are confirmed and reproducible; the VI
  labeled gallery is trustworthy.
- Faction tags exist only for the curated famous cast (59 of 112); the other 53
  are `unknown` and matched against any bucket.
- Names are the **Korean (cp949)** localized strings. Japanese names are not in
  this build's `Charcost.bin`; map back via canon if JP is needed.
- To actually bridge VII↔VI automatically would need a learned face embedding
  (e.g. a face-recognition net) rather than hand-rolled correlation — out of
  scope here, and not guaranteed to work given the stylization gap. For now,
  **human review against the contact sheet is the recommended path.**
