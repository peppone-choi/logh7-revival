# LOGH VII — Tactics battle-setup data layer (per-ship combat stats + battle field)

Static RE of `G7MTClient.exe` (Ghidra index `.omo/ghidra/export/G7MTClient/`). This is the **read model**
behind tactical (space-war) combat: the data the authoritative server pushes to set up a battle —
per-ship combat stats, shield/beam-gun arrays, corps morale, unit/base positions, and obstacle field.
**No client/server launch — static only.**

All field offsets below are **into the inner body** (the bytes AFTER the `[u16 BE code]` framing prefix).
Bodies are **little-endian**. For S→C the server frames each as a conn3 `message32` `[u32 0][u16 code][body]`.

---

## 0. Critical decoding model — "dispatch size" ≠ "wire size"

Every message in this family is a `Response*`/`Information*` class with a
`Input_<Class>::input_from_stream(this, mtStreamInputBuffer*)` deserializer. The stream is read with
**typed `operator>>` getters** on `mtStreamInputBuffer` (class strings at 0x007b5d3c…). I mapped the
client's getter-vtable slots to wire sizes by triangulating the wire parser against each message's
**text parser** (`{a,b,c,…}` config reader, uses `FUN_005ff09b`=parse-int / `FUN_005ff0a6`=parse-float)
and **named-dump** (`FUN_00439da0` print with field-name strings). All three agree on type-at-offset.

**Stream getter vtable map (confirmed, used by every parser below):**

| vtable slot | getter | wire bytes | evidence |
|---|---|---|---|
| `*(this+0x0c)` | `operator>>(float)`  | **4** (f32) | reads slots the text parser fills via `FUN_005ff0a6` (float) |
| `*(this+0x1c)` | `operator>>(uint32)` | **4** (u32) | reads `id`/`character`/`leader` (text parser `FUN_005ff09b`→dword) |
| `*(this+0x20)` | `operator>>(uint16)` | **2** (u16) | reads the record **count** header (`*param_1`, bound `<0x259`) and u16 arrays one ushort apart |
| `*(this+0x24)` | `operator>>(uint8/int8)` | **1** (u8) | reads small **count** headers (`<0x11`, `<5`) and byte fields |
| `FUN_00610420(p,1,0,2)` | raw 1-byte copy | **1** (u8) | inline byte read (morale/confusion/search) |

Typed getter funcs: u8=`FUN_006105b0`, u16=`FUN_00610600`, u32=`FUN_00610650`, int8=`FUN_006106a0`,
float=`FUN_00610790` (each throws "[mtStreamInputBuffer] operator >> (…): no data to input").

**The "size" the dispatcher (`FUN_004b8b00`) declares (`*param_4`) is the in-memory STRUCT-buffer size**
the client allocates and `memcpy`s into — **NOT the wire body length**. For every record array message it
factors exactly as `size = 4 (count+pad header) + MAXCOUNT × struct_stride`, where `struct_stride` is the
**padded** C++ record (e.g. UnitShip 52 B) and the **wire record is the packed sum of getter sizes**
(UnitShip 47 B). The wire body the server actually serializes is `header + actual_count × wire_record`.

> Why this matters for the server: emit `[u16 count][packed records]` using the **packed wire record**
> sizes in each table below; the client's `input_from_stream` advances the stream by exactly those packed
> sizes and re-expands into its padded struct. Do **not** zero-pad to the full dispatch size on the wire —
> only the deserialized count is read; the dispatch size is just the receive-buffer cap.

Cross-check, all confirmed: `size = 4 + MAXCOUNT × struct_stride`:

| Msg | code | dispatch size | = 4 + N × stride |
|---|---|---|---|
| UnitShip | 0x33b | 0x79e4 = 31204 | 4 + 600 × 52 |
| Corps | 0x33f | 0x8ca4 = 36004 | 4 + 600 × 60 |
| FillShield | 0x341 | 0x5dc4 = 24004 | 4 + 600 × 40 |
| FillBeamGun | 0x343 | (0x2ee4 = 12004) | 4 + 600 × 20 |
| TacticsCharacter | 0x337 | 0x964 = 2404 | 4 + 600 × 4 |
| Base | 0x345 | 0x204 = 516 | 4 + 16 × 32 |
| PositionUnit | 0x349 | 0x2ee4 = 12004 | 4 + 600 × 20 |
| PositionBase | 0x34b | 0x44 = 68 | 4 + 4 × 16 |
| Obstacle | 0x347 | 0x1d8 = 472 | sum of 5 sub-tables (see §8) |

---

## 1. ResponseTacticsInformationUnitShip — 0x33b  ★ THE per-ship combat stat table

**This is the highest-value message: it defines every ship's tactical combat capabilities.**

- Dispatch: `FUN_004b8b00` `0x33b → *param_4 = 0x79e4` (struct buffer 31204 B), `*param_3 = 0` (S→C read model).
- Client store/handler: `FUN_004ba2b0` @ `local_3c==0x33b`: `memcpy` **0x1e79 dwords (=31204 B)** into global
  `client+0x4271a8`, then `FUN_004be750` runs the deserializer.
- **Input parser (WIRE LAYOUT): `FUN_00421f80`** = `Input_ResponseTacticsInformationUnitShip::input_from_stream`.
- Text parser (type cross-check): `FUN_00422190`. Named dump (field names): `FUN_00422620`.
- Bound: `count < 0x259` → **max 600 ships** ("information_size … over than 600", 0x00764020).

**Wire body:** `[u16 count]` then `count ×` the **47-byte packed record** below (struct stride 52 B).

| Off (wire) | Size | Type | Field | Meaning | Confidence | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | unit/ship id (battle handle) | high | `(*+0x1c)(rec-2)`; dump `&DAT_0075ef60,*(u32)(rec)` |
| 0x04 | 1 | u8 | `morale` | crew morale (0..?) | high | `FUN_00610420(rec,1,…)`; dump `s_morale__00761730` |
| 0x05 | 1 | u8 | `confusion` | confusion/panic state | high | `FUN_00610420(rec+1,1,…)`; dump `s_confusion__00761724` |
| 0x06 | 4 | u32 | `character` | commander/character id aboard | high | `(*+0x1c)(rec+2)`; dump `s_character__00761718` |
| 0x0a | 4 | f32 | `f_x` | battle-field X (anchor/spawn) | med | `(*+0xc)(rec+4)`; text `FUN_005ff0a6` |
| 0x0e | 4 | f32 | `f_y` | battle-field Y / vertical (≈0) | med | `(*+0xc)(rec+6)` |
| 0x12 | 4 | f32 | `f_z` | battle-field Z | med | `(*+0xc)(rec+8)` |
| 0x16 | 4 | f32 | `direction` | facing / heading (radians, Y-yaw) | high | `(*+0xc)(rec+10)`; dump `s_direction__00761700` |
| 0x1a | 4 | u32 | `detachment_leader` | detachment/parent leader id | high | `(*+0x1c)(rec+0xc)`; dump `s_detachment_leader__007616ec` |
| 0x1e | 4 | f32 | `det_x` | detachment anchor X | med | `(*+0xc)(rec+0xe)` |
| 0x22 | 4 | f32 | `det_y` | detachment anchor Y | med | `(*+0xc)(rec+0x10)` |
| 0x26 | 4 | f32 | `det_z` | detachment anchor Z | med | `(*+0xc)(rec+0x12)` |
| 0x2a | 4 | f32 | `detachment_direction` | detachment facing (radians) | high | `(*+0xc)(rec+0x14)`; dump `s_detachment_direction__007616d4` |
| 0x2e | 1 | u8 | `search` | search/scan state flag | high | `FUN_00610420(rec+0x16,1,…)`; dump `s_search__007616cc` |

**Wire record = 47 B; struct stride = 52 B (0x1a ushort).** Body = `2 + count×47`.

> **Note on combat scalars (durability/beam/etc.):** the *static* per-hull stats (durability, beam-gun
> power, shield capacity, speed) are NOT in this per-instance record — they live in the **static** unit
> tables (`ResponseStaticInformationUnitShip 0x30b`, size 0x6d64) keyed by ship type, and in
> `content/manual/ship-units.json`. 0x33b carries the **live per-ship battle state** (which character,
> morale, confusion, position, facing, detachment grouping, search). The fill arrays (§3/§4) carry the
> live shield charge and beam-gun ready state. Confidence on the three f32 triples being position vs.
> some other vec3 is **medium** (no dump label for those 4-float groups; inferred from float type +
> `direction`/`detachment_direction` flanking them, matching the position/facing convention used by
> 0x0423 NotifyMovedShip).

---

## 2. ResponseTacticsCharacter — 0x337  (commander roster for the battle)

- Dispatch: `0x337 → *param_4 = 0x964` (2404 B), S→C.
- Parser: **`FUN_00421740`** = `Input_ResponseTacticsCharacter::input_from_stream`. Bound `<0x259` (600).
- Error: "character_size … over than 600" (0x00763f70).

**Wire body:**

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 2 | u16 | `field0` | leading header word (battle/side id?) | low | `(*+0x20)(param_1)` read before count |
| 0x02 | 2 | u16 | `count` | number of character ids | high | `(*+0x20)(param_1+2)`; bound `<0x259` |
| 0x04 | 4×N | u32[] | `character_id[]` | participating commander/character ids | high | loop `(*+0x1c)(iVar2+4)`, step +4 |

Struct buffer = `4 + 600×4`. Wire body = `4 + count×4`. **Semantics:** the cast list of characters present
in the tactical battle (used to fetch their cards / abilities for the battle UI).

---

## 3. ResponseTacticsInformationFillShield — 0x341  ★ per-ship live shield arrays

- Dispatch: `0x341 → *param_4 = 0x5dc4` (24004 B), S→C.
- Parser: **`FUN_00423890`** = `Input_ResponseTacticsInformationFillShield::input_from_stream`. Bound 600.
- Field-name strings (adjacent in `.rdata`): `damaged_shield[6]` (0x761790), `fill_shield[6]` (0x7617a4),
  `power_shield[6]` (0x7617d0), `shield_step[6]` (0x761890).

**Wire body:** `[u16 count]` then `count ×` 40-byte record (struct stride 40 B = 0x14 ushort):

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | ship id (matches 0x33b `id`) | high | `(*+0x1c)(rec-2)` |
| 0x04 | 24 | u32[6] | `shield[6]` | per-facing shield value (6 directions) | high | 6× `(*+0x1c)`, step +2 ushort (+4 B) |
| 0x1c | 12 | u16[6] | `fill[6]` | per-facing shield **fill/charge** (0..max) | med-high | 6× `(*+0x20)`, step +1 ushort (+2 B) |

**Wire record = 4 + 24 + 12 = 40 B.** Body = `2 + count×40`. The ship's 6-direction shield model — the
u32[6] is the shield strength per facing and the u16[6] is the current fill level (regenerates over the
battle). The `[6]` matches `fill_shield[6]`/`power_shield[6]`/`shield_step[6]`. **Maps directly to the damage
model: incoming beam hits a facing, depletes `fill[facing]`, then `durability`.**

---

## 4. ResponseTacticsInformationFillBeamGun — 0x343  ★ per-ship live beam-gun arrays

- Code: **0x343** (RequestTacticsInformationFillBeamGun = the C→S request sibling at code 0x342; Response
  S→C = 0x343). Not a distinct case in the trimmed `FUN_004b8b00` switch (shares the FillShield path);
  struct buffer factors as `4 + 600×20 = 12004`. Bound 600 ("over than 600", 0x007641bc).
- Parser: **`FUN_00423e10`** = `Input_ResponseTacticsInformationFillBeamGun::input_from_stream`.

**Wire body:** `[u16 count]` then `count ×` 16-byte record (struct stride 20 B = 10 ushort):

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | ship id | high | `(*+0x1c)(rec-2)` |
| 0x04 | 4 | u32 | `beamgun_a` | beam-gun bank value (power/count) | med | `(*+0x1c)(rec)` |
| 0x08 | 2 | u16 | `fill_a` | beam-gun bank fill/cooldown | med | `(*+0x20)(rec+2)` |
| 0x0a | 4 | u32 | `beamgun_b` | second beam bank value | med | `(*+0x1c)(rec+4)` |
| 0x0e | 2 | u16 | `fill_b` | second beam bank fill/cooldown | med | `(*+0x20)(rec+6)` |

**Wire record = 4+4+2+4+2 = 16 B.** Body = `2 + count×16`. Two beam-gun banks per ship, each `(value,fill)`.
The fill is the cooldown/charge that gates `CommandShootShip 0x406` / `CommandAttackShip 0x405`. Field split
(which is "main" vs "secondary" beam) is **medium** confidence — no dump labels; inferred from the
`fill_shield`/`power_shield` naming analogy and the (u32,u16) pairing.

---

## 5. ResponseTacticsInformationCorps — 0x33f  (corps/fleet group morale + shield/armor)

- Dispatch: `0x33f → *param_4 = 0x8ca4` (36004 B), S→C. Bound 600 (0x007640f0).
- Parser: **`FUN_00422d80`** = `Input_ResponseTacticsInformationCorps::input_from_stream`.
  Text parser `FUN_00423000` (type cross-check).

**Wire body:** `[u16 count]` then `count ×` 55-byte packed record (struct stride 60 B = 0x1e ushort):

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | corps/group id | high | `(*+0x1c)(rec-2)` |
| 0x04 | 1 | u8 | `morale` | corps morale | high | `FUN_00610420(rec,1)` (dump `s_morale`) |
| 0x05 | 1 | u8 | `confusion` | corps confusion | high | `FUN_00610420(rec+1,1)` (dump `s_confusion`) |
| 0x06 | 4 | u32 | `character` | corps commander id | high | `(*+0x1c)(rec+2)` |
| 0x0a | 4 | f32 | `direction` | corps facing (radians) | med | `(*+0xc)(rec+4)` (float) |
| 0x0e | 1 | u8 | `b_flag` | small state byte | low | `(*+0x24)(rec+6)` (u8 getter) |
| 0x0f | 6 | u8[6] | `byte6a[6]` | 6× per-facing byte (damaged_shield[6]?) | med | 6 interleaved `FUN_00610420(…,1)` reads |
| 0x15 | 4 | u16[2] | `word2[2]` | 2× u16 (group counters) | low | `(*+0x20)(rec+0xd), (rec+0xe)` |
| 0x19 | 12 | u16[6] | `wordA[6]` | per-facing u16 (fill_shield[6]) | med | 6× `(*+0x20)(rec+0xf..0x14)` |
| 0x25 | 12 | u16[6] | `wordB[6]` | per-facing u16 (power_shield[6]) | med | 6× `(*+0x20)(rec+0x15..0x1a)` |

**Wire record ≈ 55 B; struct stride = 60 B.** The exact split/naming of the trailing arrays is
**low-medium** confidence (the named-dump for the full 60-B corps record is inlined/not separately indexed;
the `[6]` arrays line up with the `damaged_shield[6]`/`fill_shield[6]`/`power_shield[6]` strings at
0x761790-0x7617d0 sitting between the Corps and FillShield class strings). Treat the trailing 6-wide arrays
as **per-facing shield/armor state for the corps as an aggregate**; pin exact semantics with a live capture.

---

## 6. ResponseTacticsInformationBase — 0x345  (fortress/base battle entries)

- Dispatch: `0x345 → *param_4 = 0x204` (516 B), S→C.
- Parser: **`FUN_00424330`**. **Count is u8** (`(*+0x24)`), bound `< 0x11` → **max 16 bases**
  ("id_size … over than 16", 0x00762aec / 0x00764228).

**Wire body:** `[u8 count][3 pad]` (8-byte header — struct starts at `param_1+8`) then `count ×` 28-byte
record (struct stride 32 B = 0x20):

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | base/fortress id | high | `(*+0x1c)(rec-4)` |
| 0x04 | 4 | f32 | `x` | battle X | high | `(*+0xc)(rec)` |
| 0x08 | 4 | f32 | `y` | battle Y (≈0) | high | `(*+0xc)(rec+4)` |
| 0x0c | 4 | f32 | `z` | battle Z | high | `(*+0xc)(rec+8)` |
| 0x10 | 4 | u32 | `u32a` | base param (durability/type?) | med | `(*+0x1c)(rec+0xc)` |
| 0x14 | 2 | u16 | `u16a` | base param | low | `(*+0x20)(rec+0x10)` |
| 0x16 | 4 | u32 | `u32b` | base param (owner/garrison?) | med | `(*+0x1c)(rec+0x14)` |
| 0x1a | 2 | u16 | `u16b` | base param | low | `(*+0x20)(rec+0x18)` |

**Wire record = 4+4+4+4+4+2+4+2 = 28 B.** Header(8) + 16×32 = 0x204. Body = `4 + count×28` on the wire.

---

## 7. Battle-unit / base POSITIONS

### 7a. ResponsePositionUnit — 0x349  ★ per-unit battle position (id + xyz + heading)

- Dispatch: `0x349 → *param_4 = 0x2ee4` (12004 B), S→C. Bound 600 (0x00764438).
- Parser: **`FUN_00426360`**.

**Wire body:** `[u16 count]` then `count ×` 20-byte record (struct stride 20 B):

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | unit/ship id | high | `(*+0x1c)(rec-2)` |
| 0x04 | 4 | f32 | `x` | position X (world units) | high | `(*+0xc)(rec)` |
| 0x08 | 4 | f32 | `y` | position Y (≈0) | high | `(*+0xc)(rec+2)` |
| 0x0c | 4 | f32 | `z` | position Z | high | `(*+0xc)(rec+4)` |
| 0x10 | 4 | f32 | `heading` | facing (radians, Y-yaw) | high | `(*+0xc)(rec+6)` |

**Wire record = 20 B.** Body = `2 + count×20`. **Same float space as NotifyMovedShip 0x0423.** This is the
initial-placement snapshot of every ship at battle start (the server fills it from world state); per-tick
updates go through `0x0423`/`0x0424`.

### 7b. ResponsePositionBase — 0x34b  (base battle positions)

- Dispatch: `0x34b → *param_4 = 0x44` (68 B), S→C. **Count u8**, bound `< 5` → **max 4 bases** (0x00764490).
- Parser: **`FUN_004268b0`**.

**Wire body:** `[u8 count][3 pad]` (8-B header) then `count ×` 16-byte record (struct stride 16 B):

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | base id | high | `(*+0x1c)(rec-4)` |
| 0x04 | 4 | f32 | `x` | X | high | `(*+0xc)(rec)` |
| 0x08 | 4 | f32 | `y` | Y | high | `(*+0xc)(rec+4)` |
| 0x0c | 4 | f32 | `z` | Z | high | `(*+0xc)(rec+8)` |

**Wire record = 16 B.** Header(8) + 4×16 = 68 = 0x44.

---

## 8. InformationObstacle — 0x347  (battle-field hazards: 5 sub-tables)

- Dispatch: `0x347 → *param_4 = 0x1d8` (472 B), S→C.
- Parser: **`FUN_00424970`** = `Input_InformationObstacle::input_from_stream`. **Five sequential
  count-prefixed sub-tables**, each `[u8 count]` then records. Per the error strings the sub-tables and
  caps are: **circle ≤5** (0x0076428c), **abnormalgravity ≤1** (0x007642dc), **gascloud ≤10** (0x00764338),
  **asteroidbelt ≤1** (0x0076438c), **blackhole ≤1** (0x007643e4).

The parser walks five sections back-to-back. Each "small" obstacle record (the recurring shape in the
decompile) is: `u32 id`, `u8 flag`, `u16 word`, `f32 a`, `f32 b` (= 4+1+2+4+4 = 15 B packed), and the larger
(gascloud) record adds a second `(u32,u8,f32,f32)` block. Exact per-section record layouts:

| Section | Cap | Per-record fields (wire order) | Evidence |
|---|---|---|---|
| `circle[]` | 5 | u32 id, u8 flag, u16 w, f32 x/center, f32 radius | `(*+0x1c),610420(1),(*+0x20),(*+0xc),(*+0xc)` |
| `abnormalgravity[]` | 1 | u32 id, u8 flag, u16 w, f32, f32 | same shape (2nd block) |
| `gascloud[]` | 10 | u32 id, u8 flag, u16 w, f32, **u32 id2, u8 flag2, f32, f32** | the wider `iVar10 += 0x1c` (28 B) loop |
| `asteroidbelt[]` | 1 | u32 id, u8 flag, u16 w, f32, f32 | same small shape |
| `blackhole[]` | 5* | u32 id, u8 flag, u16 w, f32 x, f32 y, f32 z, f32 r | last loop reads 5 floats (`+0x18` stride, bound `<6`) |

\* the trailing section in the decompile bounds at `<6` reading 5 floats; the error string names blackhole
≤1 but the loop cap is 5 — **medium** confidence on the exact blackhole cap/record; the field *types*
(u32 id + flag/word + several floats = center + radius/strength) are solid. Total fits in 472 B.

**Semantics:** static battlefield hazards. The server fills this once at battle setup. `circle` =
no-go/nebula circles, `abnormalgravity`/`blackhole` = gravity wells (`NotifyBlackHoleSuction 0x441`,
`max_suction_speed=` 0x007619e4 relates), `gascloud` = sensor-blocking clouds, `asteroidbelt` = damage belt.

---

## 9. NotifyTactics — 0x0f1f  (battle start / mode switch signal)

- Dispatch: `0xf1f` → shares case `0x431` path → `*param_4 = 8`. (Catalog lists 0x24 = receive-buffer cap;
  **only 8 bytes are consumed.**)
- Client handler `FUN_004ba2b0` `case 0xf1f`: copies `*param_3` and `param_3[1]` (2 dwords) to
  `DAT_00433b1c`/`DAT_00433b20`, then `FUN_004c1b20`.

**Wire body (8 B):**

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `arg0` | tactics/battle context (battle id or mode) | med | `*(u32)(DAT_00433b1c)=*param_3`; consumer `FUN_004c1b20` checks a byte = mode |
| 0x04 | 4 | u32 | `arg1` | secondary context (side / phase) | low | `param_3[1]` |

**Semantics (consumer `FUN_004c1b20`):** transitions the client into **tactical-battle mode** — zeroes the
battle counters at `client+0x126454…0x1264a0`, stamps battle-state `client+0x12647c = 0xf1f`, and calls
`FUN_004c2920` (battle init). The first byte of the payload selects a setup branch (`==1` → state 2 else 0).
This is the **"enter space-war"** trigger the server sends after pushing the §1-§8 read-model tables.

---

## 10. NotifyTacticsChiefCommander — 0x431  (assign battle chief commander)

- Dispatch: `0x431 → *param_4 = 8`, S→C.
- Client handler `FUN_004ba2b0` `case 0x431`: `local_1c = param_3[1]`; stores `*param_3`→`DAT_0043334c`,
  `param_3[1]`→`DAT_00433350`.

**Wire body (8 B):**

| Off | Size | Type | Field | Meaning | Conf | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `arg0` | unit/side id whose chief changed | med | `*(u32)(DAT_0043334c)=*param_3` |
| 0x04 | 4 | u32 | `character` | new chief-commander character id | med | `*(u32)(DAT_00433350)=param_3[1]` |

**Semantics:** notifies that the tactical chief commander for a side/unit changed (affects command radius /
order propagation). Pure broadcast — client just records the pair.

---

## 11. Server to-do (authoritative battle-setup sequence)

The authoritative server, when a tactical battle starts, must **build and push these S→C read-model tables**
(framed as conn3 `message32 [u32 0][u16 code][body]`, bodies LE, packed wire records per the tables above):

1. **`0x337 ResponseTacticsCharacter`** — `[u16 field0][u16 count][u32 character_id × count]`: the roster of
   commanders in the battle.
2. **`0x33b ResponseTacticsInformationUnitShip`** — `[u16 count][47-B record × count]`: live per-ship battle
   state (id, morale, confusion, character, position vec3, direction, detachment leader+anchor+dir, search).
   Pull static combat scalars (durability/beam/shield-cap/speed) from `0x30b`/`content/manual/ship-units.json`.
3. **`0x33f ResponseTacticsInformationCorps`** — `[u16 count][55-B record × count]`: corps morale/confusion +
   per-facing shield/armor aggregates.
4. **`0x341 ResponseTacticsInformationFillShield`** — `[u16 count][40-B: u32 id, u32 shield[6], u16 fill[6]]`:
   per-ship 6-direction shield strength + current charge. Feeds the damage model (deplete facing fill→durability).
5. **`0x343 ResponseTacticsInformationFillBeamGun`** — `[u16 count][16-B: u32 id, (u32 val,u16 fill)×2]`:
   per-ship beam-gun banks + cooldown/charge (gates `0x405/0x406` fire commands).
6. **`0x349 ResponsePositionUnit`** — `[u16 count][20-B: u32 id, f32 x,y,z, f32 heading]`: initial ship
   placement (same float space as `0x0423`). **Per-tick movement thereafter via `0x0423`/`0x0424`.**
7. **`0x345 ResponseTacticsInformationBase`** / **`0x34b ResponsePositionBase`** — `[u8 count][3 pad][record]`:
   fortress/base entries + positions (≤16 / ≤4).
8. **`0x347 InformationObstacle`** — five `[u8 count][records]` sub-tables (circle/abnormalgravity/gascloud/
   asteroidbelt/blackhole): the static battlefield hazards.
9. **`0x0f1f NotifyTactics`** (8 B) — once the tables are loaded, send to flip every participant's client into
   tactical-battle mode (the "begin space-war" signal). Byte0 of arg0 selects the battle setup branch.
10. **`0x431 NotifyTacticsChiefCommander`** (8 B, `u32 side/unit id, u32 character`) — whenever the battle
    chief commander changes.

**Validation/mutation the server owns:** all of §1-§8 are server-authored read models (the server is the
source of truth for ship stats, shield/beam fill, positions, morale, obstacles). On combat commands
(`0x405 Attack`, `0x406 Shoot`, `0x40e AirBattle`, …) the server mutates `shield.fill[facing]`,
`beamgun.fill`, ship durability, morale/confusion, and re-broadcasts the deltas (the `0x12xx`
NotifySimpleInformation* family, e.g. `0x1207 NotifySimpleInformationUnit`) plus position via `0x0423`.
Counts must be clamped to the caps (UnitShip/Corps/FillShield/FillBeamGun/PositionUnit ≤600, Base ≤16,
PositionBase ≤4, obstacle sub-caps in §8) or the client throws and drops the battle.

---

## 12. Open questions

1. **UnitShip three f32 triples (0x0a, 0x1e).** No dump labels for the 4-float groups; inferred as
   `(x,y,z)` position + detachment anchor from the flanking `direction`/`detachment_direction` floats and
   the 0x0423 convention. A live 0x33b capture would confirm whether 0x0a/0x1e are world positions or some
   other vec3 (e.g. a velocity or a normalized aim).
2. **FillShield u16[6] vs u32[6] roles.** `u32[6]` = shield strength, `u16[6]` = current fill is the best fit
   to `power_shield[6]`/`fill_shield[6]`; could instead be `(capacity, current)`. Capture to pin which is max
   vs current and the facing index order (front/back/L/R/top/bottom?).
3. **FillBeamGun bank split.** Which of `(beamgun_a,fill_a)` / `(beamgun_b,fill_b)` is main vs secondary
   battery, and whether `fill` is cooldown-ms or charge-0..max — needs the fire-command consumer or a capture.
4. **Corps trailing arrays (0x15-0x30).** The 60-B corps record's named dump is inlined; the two u16[6] arrays
   are per-facing shield/armor aggregates with medium confidence on exact mapping to
   `damaged/fill/power_shield`.
5. **Obstacle blackhole cap.** Error string says ≤1 but the final loop bounds at `<6` reading 5 floats —
   reconcile with a capture; record field *types* (id + flag + center vec + radius/strength) are solid.
6. **NotifyTactics 0xf1f arg semantics.** arg0 byte0 = setup-branch selector (confirmed via `FUN_004c1b20`);
   the remaining 7 bytes' exact meaning (battle id? map id? side?) needs a capture.

---

### Evidence index (Ghidra addrs)

- `FUN_004b8b00` — inner message dispatch (declares struct-buffer sizes per code).
- `FUN_004ba2b0` — client receive handler (per-code memcpy into global read-model buffers; 0x33b/0xf1f/0x431).
- Stream getters: u8 `FUN_006105b0`, u16 `FUN_00610600`, u32 `FUN_00610650`, int8 `FUN_006106a0`,
  float `FUN_00610790`; raw byte copy `FUN_00610420`; position calc `FUN_006104b0`.
- `FUN_00421f80` Input UnitShip / `FUN_00422190` text / `FUN_00422620` dump.
- `FUN_00421740` Input TacticsCharacter.
- `FUN_00423890` Input FillShield. `FUN_00423e10` Input FillBeamGun.
- `FUN_00422d80` Input Corps / `FUN_00423000` text Corps / `FUN_00422c70` (summary dump).
- `FUN_00424330` Input Base. `FUN_00424970` Input Obstacle.
- `FUN_00426360` Input PositionUnit. `FUN_004268b0` Input PositionBase.
- `FUN_004c1b20` NotifyTactics 0xf1f consumer (battle-mode init). `FUN_004c2920` battle init.
- `FUN_004be750` deserializer runner (invokes Input_* on a received buffer).
- Field-name strings: morale 0x761730, confusion 0x761724, character 0x761718, direction 0x761700,
  detachment_leader 0x7616ec, detachment_direction 0x7616d4, search 0x7616cc;
  damaged_shield[6] 0x761790, fill_shield[6] 0x7617a4, power_shield[6] 0x7617d0, shield_step[6] 0x761890.

---

## 13. ResponseStaticInformationUnitShip — 0x30b  ★ THE static per-hull stat table (real ship numbers)

This is the **static** companion to §1's live 0x33b record: the per-ship-TYPE combat scalars (armor, shield,
weapon 破壊力, speed, build time, supply). 0x33b carries live per-instance state; **0x30b carries the hull spec**.

- Dispatch: `ResponseStaticInformationUnitShip` = code **0x30b**. Struct buffer **0x6d64 = 28004 B
  = 4 (count+pad header) + 200 × 140 (struct stride)**.
- Bounds: `information_size < 200` ("over than 200", `0x00762f00`); each record's `name_size <= 13`
  ("over than 13", `0x00762ea8`) → a `<=13`-char ship name per record.
- Parser: `Input_ResponseStaticInformationUnitShip::input_from_stream` (class string `0x00760548`);
  per-name reader `Input_StaticInformationUnitShip` (`0x00762ea8`). "OK" trace `0x007706bc`.

**Static dump field-name strings (`Output_*`, contiguous `0x760984..0x760b2c`)** — these name the per-hull
fields the client stores, and map 1:1 onto the manual `stats` labels in `content/manual/ship-units.json`:

| dump string (addr) | manual label | meaning |
|---|---|---|
| `armor_front=` 0x760a80 / `armor_side=` 0x760a68 / `armor_back=` 0x760a74 | 装甲(前/側/後) | per-facing armor |
| `shield=` 0x760a60 | シールド防護値 | per-hit shield absorb |
| `shield_capacity=` 0x760a4c | シールド容量 | shield pool |
| `beam_power=` 0x760a38 | ビーム兵装 破壊力 | beam destruction power |
| `gun_power=` 0x760a1c | ガン兵装 破壊力 | rail/gun power |
| `missile_power=` 0x7609fc | ミサイル兵装 破壊力 | missile power |
| `antiaircraft_power=` 0x7609bc | 対空兵装 破壊力 | anti-air power |
| `speed=` 0x760a98 / `turn=` 0x760a90 | 最高速度 | max speed / turn |
| `crew=` 0x760afc | 必要乗組員 | required crew |
| `term=` 0x760b10 / `cost=` 0x760b18 / `resources=` 0x760b20 | 工期 / cost | build time + cost |
| `repair=` 0x760984 | 修理消費物資(1隻) | repair supply cost |
| `resource_loadage=` 0x76098c | 物資搭載量 | supply capacity |
| `fighter_num=` 0x7609a0 / `fighter=` 0x7609b0 | 戦闘艇搭載数 | fighter complement |
| `searching_range=` 0x760ad0 / `communication_range=` 0x760ae4 | 索敵範囲 | sensor / comms range |

**Where the real numbers come from:** the original *server* (which authored 0x30b) is not archived, and the
client only RECEIVES 0x30b, so we cannot dump the table from RE alone. The authoritative real numbers survive
in **`content/manual/ship-units.json`** (gin7 manual 別表 艦艇ユニット). `tools/logh7_ship_stats.py` parses
those REAL numbers per field (with the exact source substring + a confidence flag; null + note where the OCR
is corrupt — never guessed) into **`content/ship-stats-raw.json`**, and applies ONE documented transform into
the server combat pools in **`content/ship-stats.json`**.

### Documented transform — manual numbers → server combat pools (logh7-combat-engine)

The combat engine (`src/server/logh7-combat-engine.mjs`) renders the three on-wire pools the client derives as
`current = max − cumulativeDamage` (NotifyAttackedShip 0x426): **armor** (entity+0x8d4), **zanki/残機**
(entity+0x8d8), **shield** (shipClass+0x288). The real manual numbers map with one reversible rule:

| server pool | = real manual field(s) |
|---|---|
| `maxArmor`  | `armor_front + armor_side + armor_back` (sum of the three real 装甲 facings) |
| `maxShield` | `shield_capacity` (real シールド容量) |
| `maxZanki`  | `unit_count` (ユニット数 = ships per stack / 残機 pool) |
| `beamPower` | `max(beam_power, gun_power, missile_power)` (ship's strongest real 破壊力) |
| `defense`   | `shield` 防護値 (real per-hit shield absorb = damage mitigated per hit) |
| `morale`    | `100` (battle-start default; live morale comes from 0x33b, not a static hull stat) |

Every pool therefore traces to a real manual number, or is **null** when its source is null/OCR-corrupt; the
engine's `shipClassStats` layers `real manual pools → class-archetype default → DEFAULT_SHIP_STATS`, so a null
pool transparently falls back to a documented default while every surviving real number is used as-is. The
transform is mirrored in `content/ship-stats.json` `_derivation`. Coverage (63 ship types incl. variations):
maxArmor 48/63, beamPower 55/63, maxZanki 51/63, defense 34/63, maxShield 21/63; 61/63 have ≥1 real pool (the
2 gaps = 偵察巡航艦 "not isolable in OCR" and 高速艇 K86, both null+noted).

**Variation inheritance:** variant hulls (戦艦Ⅲ..Ⅷ, 巡航艦Ⅲ.., …) whose manual text says "see base type"
INHERIT the base ship's REAL parsed numbers, resolved by code family (SS75→戦艦, PK86→高速戦艦, SK80→巡航艦,
Z82→駆逐艦, FR88→戦闘艇母艦, A76→工作艦, …). Each variant's description delta is kept as a LABELED
`_variant_modifier` string only — no invented numeric delta.
