# LOGH VII face-code → portrait conversion logic (extracted)

Reverse-engineered from `G7MTClient.exe` (Ghidra). Two parallel client code paths resolve a
character's portrait. This documents both and the encoding the server must produce.

## Path 1 — flat number → loose TGA (`FUN_00517e70`)
```
if (1 <= face && face <= 0x255 /*597*/)
    sprintf(path, "/../data/image/Face/%d%d%d.tga", (face/100)%10, (face/10)%10, face%10);
```
- The **flat face number 1..597** → `data/image/Face/<NNN>.tga` (zero-padded 3 digits).
- This is the numbering the official site used: `picture/chara/NNN.jpg` == `Face/NNN.tga`.
- The 12 recovered anchors (Reinhard=209, Yang=206, Schenkopp=85, …) are flat numbers in this space.
- NOTE: the shipped game has **no loose `NNN.tga` files** — only the packed `.tcf` atlases. So this
  path is a fallback/dev path; the runtime portrait comes from Path 2 (the atlas).

## Path 2 — composite code → atlas filename (`FUN_00592c30` → `FUN_005924c0`)
`FUN_00592c30(param_1, code, …)` decomposes `code` by DECIMAL DIGIT-FIELDS and appends one prefix
**character** per field, building the atlas name under `/../data/image/face/`:

| field expression | picks char (when field==0) | meaning |
|---|---|---|
| `code / 1000000` | `'O'` (DAT_0078d800) | **O**riginal (vs `'G'` Generate @d810) |
| `(code % 1000000) / 100000` | `'E'` (DAT_0078d804) | **E**mpire (vs Alliance) |
| `(code % 100000) / 10000` | `'M'` (DAT_0078d808) | **M**ale (vs `'F'` Female @d80c) |
| `code % 1000` | — | **index** within the selected atlas |

The prefix chars `O E M F G` live at `0x0078d800..0x0078d810` (single-char strings); the path parts
`/../data` `data/ima` `/image/f` confirm `data/image/face/<PREFIX>…`. So the resulting atlas =
`{O|G}{E|A}{M|F}` = exactly our atlas files **OEM / OAM / GEM / GEF / GAM / GAF** (+ `O` for the
female/misc set). `FUN_005924c0` then loads that atlas and indexes it by the bottom field (case 0 =
`oem`, bound `index <= 199`, matching oem's 201 portraits).

### What this means
- The portrait is keyed by **(Original|Generate, Empire|Alliance, Male|Female) = atlas** + **index**.
  The character record already carries `power`(faction) and `sex`; combined with the original/generate
  flag and a face index, the client picks atlas + slot. **Art style and prior-game IDs are irrelevant**
  — it's a pure numeric scheme.
- The official **flat** chara number (Path 1) and the **composite** atlas code (Path 2) are DIFFERENT
  numbering systems. Pixel-matching proved flat `206`(Yang) ↔ our decoded `oam` slot `274`, and flat
  `85`(Schenkopp) ↔ `oam` slot `230` — i.e. flat-number ≠ atlas-slot; a per-atlas remap sits between.

## Open piece (the only thing left for full inversion)
The atlas **index → tcf.hed slot** remap is a **runtime data table** (`FUN_005924c0` reads arrays at
`this+0x2a60` / `this+0x2d80` indexed by the field, not a closed formula). With only 2 flat↔slot
anchors it can't be fit analytically. To invert "decoded portrait (atlas,slot) → flat face number"
for a manually-identified character we need either (a) more flat↔slot anchors (more official
`chara/NNN.jpg` images — but Wayback preserved only 2), or (b) to dump that runtime table from a live
client. Until then, only the **12 official flat numbers** are server-usable as authentic faces.

## Server implication (current wiring)
`src/server/logh7-content-adapter.mjs` `loadFaceAssigner` assigns the **12 authoritative flat face
numbers** (from `content/roster/face-name-map.json`) to the matching named principals, and a stable
pool pick to everyone else. The 0x0323 record's `face` field carries the flat number; the client
resolves it to the portrait. The 12 principals therefore render their REAL faces; the rest render a
consistent (non-authentic) assigned face.
