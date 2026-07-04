# LOGH VII Face-ID Encoding (reverse-engineered)

How the client turns a character's face value (0x0323 record @0xf4) into a drawn
portrait. Reversed from `G7MTClient` (Ghidra export). Tool: `tools/logh7_face_id_decode.py`.

## Two resolvers

1. **`FUN_00517e70`** — the `.tga` path. Bounds the id to `1..0x255 (=597)` and
   builds `../data/image/Face/<d><d><d>.tga` from the id's 3 digits. This is the
   path whose numbering equals the official gineiden `chara/NNN` gallery number
   (so chara/206 = Yang = id 206 here). BUT no numbered `.tga` files ship — only
   `unknownface.tga` (the fallback). So this path is effectively legacy/fallback.

2. **`FUN_00592c30` → `FUN_005924c0`** — the `.tcf` path, what actually draws.
   `FUN_00592c30` decomposes the face value by DIGIT POSITION into an atlas
   selector + per-atlas local index; `FUN_005924c0` (`switch` on the selector)
   opens that atlas `.tcf` and loads the local-index-th region.

## The composite digit encoding (the real face value)

For face value `n`:

```
local_index = n % 1000
M  = n / 1000000           # 0 = officer-rank atlas group, 1 = general-rank group
d5 = (n % 1000000)/100000  # faction column
d4 = (n %  100000)/10000   # sex / o-bucket column
d3 = (n %   10000)/1000     # 0 = real atlas; nonzero = 'o' overflow bucket
```

Atlas selector (`switch` order in `FUN_005924c0`): `0 oem, 1 oam, 2 o, 3 gem, 4 gef, 5 gam, 6 gaf`.
Per-atlas loader caps (`param_3` bound): `oem<=199 oam<=95 o<=99 gem<=99 gef<=31 gam<=99 gaf<=31`.

| atlas | (M,d5,d4) | faction / sex / rank | `face_value = base + index` |
|-------|-----------|----------------------|------------------------------|
| oem | (0,0,0) | empire / male / officer   | `index` |
| oam | (0,1,0) | alliance / male / officer | `100000 + index` |
| o   | (0,0,1) | misc (unknown)            | `10000 + index` |
| gem | (1,0,0) | empire / male / general   | `1000000 + index` |
| gef | (1,0,1) | empire / female / general | `1010000 + index` |
| gam | (1,1,0) | alliance / male / general | `1100000 + index` |
| gaf | (1,1,1) | alliance / female / general | `1110000 + index` |

`d3 != 0` routes to atlas `o` with an index offset (`+10/+20/+40/+50/+60/+70`) —
a shared overflow pool for the smaller atlases.

## Why this resolves the whole portrait saga

- The official `chara/NNN` gallery number is a **separate space** from the in-game
  face value. That is why earlier `dumpall` hed-index == chara-number assumptions
  failed INDEXCHECK (dumpall/0206 != Yang): the game never used a flat index.
- **The atlas selector already encodes faction + sex + rank.** For authoritative
  face ASSIGNMENT that is exactly what we need: pick the atlas that matches the
  character (e.g. Reinhard -> `gem` empire/male/general), choose an index whose art
  fits, and `encode()` the value. The server sends it; the client draws the right
  pool art.

## Validation

- `decode(100079) == ("oam", 79)`; Yang's art is tcf.hed region 274, which resolves
  in the `oam` atlas (NCC 0.92 vs official `chara/206`). Round-trip holds for all 7
  atlases (`python tools/logh7_face_id_decode.py` self-test passes).

## Open item (narrow, well-scoped)

The per-atlas **local-index -> region** mapping is not yet byte-locked. Findings
that pin it down to a small remaining step:

- The `.tcf` files share an identical 64-byte Shift-JIS signature header then raw
  region data; `tcf.hed` (8-byte `[offset][size]`) is the real region index.
- The atlases occupy **distinct contiguous-ish `tcf.hed` index ranges** (NOT a flat
  0..459 block layout). Unambiguous-decode runs observed:
  `oem ≈ hed 7..130, oam ≈ 264..308, gem ≈ 520..721, gef ≈ 763..805`. The `o`,
  `gam`, `gaf` entries are palette-ambiguous (decode in multiple atlases) and
  interleave in the gaps.
- **Anchor confirms the skeleton:** Yang's art = hed region 274, which lies inside
  the `oam` run (264..308). So local_index(oam) = 274 - (oam range start).

Remaining: pin each atlas's exact hed-range start (resolve the ambiguous
`o`/`gam`/`gaf` boundaries), giving `hed_index -> (atlas, local_index)`; then
`face_value = ATLAS_BASE[atlas] + local_index` fills `face-assignment.json`'s
`face_number`. Fallback/confirmation: render a few `encode()`d values through the
real client (`tools/logh7_ui_explorer.py`). Atlas SELECTION (faction/sex/rank) is
fully solved; only intra-atlas index calibration remains.

## Deliverables

- `tools/logh7_face_id_decode.py` — `encode(atlas,index)` / `decode(n)` / `face_meta(n)`.
- `content/roster/face-assignment.json` — per-character face assignment (Direction 3);
  `face_number` to be filled by `encode()` once index calibration lands.
- `tools/logh7_portrait_pixelmatch.py` + `.omc/portrait-ai/pixelmatch-report.json` —
  NCC matcher (Direction 2); network to gineiden.com is unreachable, 2 local anchors.
