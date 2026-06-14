# LOGH VII — Strategic-map ops + Logistics/Organization + Institutions wire spec

Static reverse-engineering of `G7MTClient.exe` (Ghidra index `.omo/ghidra/export/G7MTClient/`,
query via `python -m tools.logh7_redex func <addr> | grep | xref | calls`). **No client/server
launch — static only.** Every claim cites a function address or string addr.

This is the internal-affairs ACTION family on the strategic sector map plus logistics/organization and
institutions:

- **Strategic map `0x0bxx`**: CommandMoveBase 0xb00, CommandMoveGrid 0xb01 (DONE, see
  `docs/logh7-strategic-input-wire.md`), CommandSupplyFuel 0xb02, CommandSearch 0xb03,
  CommandUnloadTroop 0xb04, CommandLoadTroop 0xb05, CommandSwitchMode 0xb06; notifies
  NotifyMovedGrid 0xb07 (DONE), NotifyLeaveOutGrid 0xb08, NotifyEnterGridBegin 0xb09 /
  NotifyEnterGridEnd 0xb0a (DONE, strategic-input-wire), NotifyMovedBase 0xb0b, NotifySuppliedFuel
  0xb0c, NotifySearch 0xb0d.
- **Logistics/org `0x0cxx`**: CommandCompletenessRepair 0xc00, CommandCompletenessSupply 0xc01,
  CommandReorganization 0xc02, CommandSupplement 0xc05, CommandCarryingInOut 0xc08,
  CommandAssignment 0xc0b, CommandCarryingOut 0xc0c.
- **Institutions `0x0exx`**: CommandMoveInstitutionSpot 0xe00 (+ build/destroy/pause family).

## Conventions

- **Framing.** C→S inner = `[u16 BE code][body]`; S→C conn3 = message32 `[u32 0][u16 code][body]`.
  Bodies are **little-endian**. All offsets below are INTO THE BODY (after the code prefix).
- **Stream vtable** (the `mtStreamInputBuffer`/`mtStreamOutputBuffer` method table `*param_2`):
  - `*+0x10` → float/dword write/read (used by reorg/carry for fractional/scalar fields)
  - `*+0x14` → secondary scalar read/write
  - `*+0x1c` → **u32**
  - `*+0x20` → **u16**
  - `*+0x24` → **u8**
  - `FUN_00610420(dest, len, 0, 2)` → raw N-byte stream read (`mtStreamInputBuffer::read`).
- **Size source.** Every body size is binary-proven from the wire size table `FUN_004b8b00`
  (`*param_4 = <size>` per case) AND the dispatcher copy-loops in `FUN_004ba2b0`
  (`for(i=<dwords>;…) *dst=*src` = `dwords*4` bytes). The two always agree; both are cited.
- **Echo/ACK pattern.** Every C→S command in this family is **echoed back** by the server (the same
  code, possibly with the authoritative result filled in). The client's dispatcher
  (`FUN_004ba2b0`) copies the echo into a per-command global and calls a small apply/ACK consumer
  that (a) releases the modal UI dialog FSM via `FUN_00517cd0(code, record)` and/or (b) writes the
  authoritative result into PLAYER_INFO / the unit pool. `local_1c = param_3[1]` or `param_3[2]` is
  the echo's result/sequence id the dialog FSM matches.
- **PLAYER_INFO** = `clientBase(DAT_007ccffc)+0xc`, stride **0x370**, walk limit `0x80e7f`
  (≈600 entries). Position pair lives at `playerInfo+0x40 / +0x44`; fuel pair at `+0x74 / +0x78`.

---

# PART A — Strategic map ops (0x0bxx)

## A.0 Family dispatch / size summary (`FUN_004b8b00`, `FUN_004ba2b0`)

| Code | Class | Dir | Size | size-table | dispatcher copy | apply/ACK fn |
|---|---|---|---|---|---|---|
| 0xb00 | CommandMoveBase | C→S (echo) | 0x20 (32) | `*p4=0x20` | 8 dw → `+0x437958` | `FUN_004c5780` |
| 0xb01 | CommandMoveGrid | C→S (echo) | 0x24 (36) | `*p4=0x24` | 9 dw → `+0x4376f0` | `FUN_004bea90` (stub) — DONE |
| 0xb02 | CommandSupplyFuel | C→S (echo) | 0x18 (24) | `*p4=0x18` | 6 dw → `+0x437494` | `FUN_004c02f0` |
| 0xb03 | CommandSearch | C→S (echo) | 0x14 (20) | `*p4=0x14` | 5 dw → `+0x433b24` | `FUN_004bfcd0` |
| 0xb04 | CommandUnloadTroop | C→S (echo) | 0x24 (36) | `*p4=0x24` | 9 dw → `FUN_00448450+4` | `FUN_004c00c0` |
| 0xb05 | CommandLoadTroop | C→S (echo) | 0x24 (36) | `*p4=0x24` | 9 dw → `+0x448478` | `FUN_004c0130` |
| 0xb06 | CommandSwitchMode | C→S (echo) | 0x164 (356) | `*p4=0x164` | 0x59 dw → `+0x44849c` | `FUN_004c01a0` |
| 0xb07 | NotifyMovedGrid | S→C | 0x244 (580) | `*p4=0x244` | 0x91 dw → `+0x437714` | `FUN_004bee20` — DONE |
| 0xb08 | NotifyLeaveOutGrid | S→C | 0x11c (284) | `*p4=0x11c` | 0x47 dw → `+0x4379d4` | `FUN_004bece0` |
| 0xb09 | NotifyEnterGridBegin | S→C | 1 | `*p4=1` | byte → `+0x4376ec` | inline (reset char count) — DONE |
| 0xb0a | NotifyEnterGridEnd | S→C | 1 | `*p4=1` | byte → `+0x4376ed` | `FUN_004c2a80(1)` — DONE |
| 0xb0b | NotifyMovedBase | S→C | 0x44 (68) | `*p4=0x44` | 0x11 dw → `+0x437978` | `FUN_004bee60` |
| 0xb0c | NotifySuppliedFuel | S→C | 0x240 (576) | `*p4=0x240` | 0x90 dw → `+0x4374ac` | `FUN_004c0860` |
| 0xb0d | NotifySearch | S→C | 0xa9c (2716) | `*p4=0xa9c` | 0x2a7 dw → `+0x433b38` | `FUN_004bfd30` |

> Echo-with-tail note: `0xb02`/`0xb03` use `*param_3 = param_2[1] + *param_2` in the size table (a
> base+len tail anchor, like CommandMoveShip), and their dispatcher echo reads the result id from
> `param_3[2]` (offset 0x08). `0xb00`/`0xb04`/`0xb05`/`0xb06` read it from `param_3[1]`/`[2]`.

---

## A.1 `0xb00 CommandMoveBase` — 32 B (C→S, echoed)

Move a base/fortress on the strategic map. **No compiled `Input_` parser** in the client (C→S only:
the client assembles it in the SelectGrid/base-move UI; the server parses it). Frame proven by size
table (`0x20`) + echo copy (8 dwords). Echo ACK = `FUN_004c5780`: gated on world-active `0x2a58f8`,
calls `FUN_00517cd0(0xb00, record)` to release the dialog FSM (UI dialog code `0x12647c=0xb03`). No
direct position write — the **visible** base relocation is driven by `0xb0b NotifyMovedBase` (A.8).

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u32 | time/seq | family header (`param_3[0]`) | `FUN_004ba2b0` 0xb00 |
| 0x04 | u32 | result/echo id | dialog-FSM match id (low) | `local_1c=param_3[2]` (note [2]) |
| 0x08 | u32 | **baseId** | base/fortress being moved | family id slot; mirrors 0xb0b mover @0x08 |
| 0x0c | u32 | **target** | destination cell/system id | TARGET_BASE_GRID selection |
| 0x10 | u32 | param/route | route or option | inferred |
| 0x14 | u32 | param | reserved | inferred |
| 0x18 | u32 | param | reserved | inferred |
| 0x1c | u32 | param | reserved | inferred |

Confidence: size **proven**; dwords 0x08..0x1c **inferred** (no `Input_` to pin them). For emulation,
echo byte-faithfully and broadcast `0xb0b` with the authoritative destination.

---

## A.2 `0xb02 CommandSupplyFuel` — 24 B (C→S, echoed) — HIGH VALUE

Transfer fuel to a fleet on the strategic map. Echo ACK `FUN_004c02f0` is the key evidence: when
NOT in a modal (`0x3579cc==0`) and world-active, it walks PLAYER_INFO (stride 0x370, limit 0x80e7f),
matches the entry by entity id `record@0x08`, and writes the authoritative fuel result:

- `record@0x10` → `playerInfo+0x74`
- `record@0x14` → `playerInfo+0x78`

So the **echo carries the server-computed post-transfer fuel** (two scalars), and the target id at
0x08.

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u32 | time/seq | family header | `FUN_004ba2b0` 0xb02 |
| 0x04 | u32 | result/echo id | dialog-FSM match (`param_3[1]`) | echo copy |
| 0x08 | u32 | **targetUnitId** | fleet receiving fuel | `*(param_2+8)` matched vs PLAYER_INFO id `FUN_004b5b80()` |
| 0x10 | u32 | **fuel / amount A** | → `playerInfo+0x74` (post-transfer fuel) | `FUN_004c02f0` |
| 0x14 | u32 | **fuel / amount B** | → `playerInfo+0x78` (secondary fuel/supply scalar) | `FUN_004c02f0` |

(0x0c is a header slot not consumed by the ACK; 24 B total.) Confidence: 0x08/0x10/0x14
**proven** by the apply writes; 0x00/0x04/0x0c header **inferred**.

**Server semantics:** validate the target fleet is the player's & in range of a supply source;
compute new fuel; echo `0xb02` with `@0x08=unitId, @0x10=newFuelA, @0x14=newFuelB`; broadcast
`0xb0c NotifySuppliedFuel` (A.9) to observers.

---

## A.3 `0xb03 CommandSearch` — 20 B (C→S, echoed) — HIGH VALUE (scout/recon)

Order a fleet/base to scan/search a sector. Echo ACK = `FUN_004bfcd0` (shared with CompletenessRepair
/ Assignment — a generic "release dialog + enqueue 0xb03" consumer; sets UI dialog code). The actual
recon RESULT is delivered by `0xb0d NotifySearch` (A.10), whose apply `FUN_004bfd30` reveals the full
scan-table model. **No compiled `Input_` for the command** (C→S only).

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u32 | time/seq | header | size table tail anchor |
| 0x04 | u32 | result/echo id | dialog FSM (`param_3[2]`) | echo copy |
| 0x08 | u32 | **searcherUnitId** | fleet/base performing the search | family id slot |
| 0x0c | u32 | **targetCell / range** | search center cell or radius | inferred |
| 0x10 | u32 | param | option/mode | inferred |

Confidence: size **proven** (5 dw); fields **inferred**. Server: validate searcher, compute visible
enemy units in range, reply `0xb0d` with the scan list.

---

## A.4 `0xb04 CommandUnloadTroop` / `0xb05 CommandLoadTroop` — 36 B each (C→S) — PROVEN LAYOUT

Both have a compiled `Input_` parser and are **byte-for-byte identical** in layout.
`Input_CommandUnloadTroop::input_from_stream` = `FUN_00449e20`;
`Input_CommandLoadTroop::input_from_stream` = `FUN_0044a350`.

Stream order (all `*+0x1c`=u32 except the count `*+0x24`=u8):

| off | type | field | meaning | evidence (`FUN_00449e20`) |
|---|---|---|---|---|
| 0x00 | u32 | dword0 (time/seq) | header | `(**+0x1c)(p)` |
| 0x04 | u32 | dword1 | header / actor | `(**+0x1c)(p+4)` |
| 0x08 | u32 | **baseOrFleetId** | container being (un)loaded | `(**+0x1c)(p+8)` |
| 0x0c | u32 | **targetId** | the other side of the transfer (fleet↔base) | `(**+0x1c)(p+0xc)` |
| 0x10 | u32 | param/spot | spot or option | `(**+0x1c)(p+0x10)` |
| 0x14 | u8 | **unitCount** | troop-unit count, **max 3** | `(**+0x24)(p+0x14)`; `bVar2<4` else throw `unload_unit_size over than 3` |
| 0x15 | — | pad (3) | align to 0x18 | |
| 0x18 | u32[unitCount] | **troopUnitIds** | troop unit ids to move (stride 4) | loop `p+0x18 += 4` ×count |

Total = 0x18 + 3×4 = **0x24 = 36 B** (fixed; unused slots zero). Echo ACK `0xb04`=`FUN_004c00c0`,
`0xb05`=`FUN_004c0130` (release dialog; enqueue). Confidence: **high** (full parser).

**Server semantics:** validate the base+fleet are co-located and own troop units 0..2; move the named
troop ids between base garrison and fleet transports; echo back; update unit records.

---

## A.5 `0xb06 CommandSwitchMode` — 356 B (C→S) — PROVEN LAYOUT — strategic↔tactical transition

`Input_CommandSwitchMode::input_from_stream` = `FUN_0044a880`. This is the command that flips a sector
into tactical (battle/encounter) mode, carrying the participating units and characters.

| off | type | field | meaning | evidence (`FUN_0044a880`) |
|---|---|---|---|---|
| 0x00 | u32 | dword0 (time/seq) | header | `(**+0x1c)()` |
| 0x04 | u32 | dword1 | header | `(**+0x1c)(p+4)` |
| 0x08 | u16 | half@0x08 | mode/flags | `(**+0x20)(p+8)` |
| 0x0c | u32 | dword@0x0c | spot/grid id | `(**+0x1c)(p+0xc)` |
| 0x10 | u32 | dword@0x10 | spot/grid id 2 | `(**+0x1c)(p+0x10)` |
| 0x14 | u16 | half@0x14 | mode kind (0 battle / 1 encounter / 2 strategic) | `(**+0x20)(p+0x14)` |
| 0x16 | u8 | **unit_size** | participating unit count, **max 70** | `(**+0x24)(p+0x16)`; `<0x47` else throw `unit_size over than 70` |
| 0x18 | u32[unit_size] | **unitIds** | participating units (stride 4) | loop `p+0x18 += 4` ×unit_size |
| 0x130 | u32 | dword@0x130 | post-array scalar (e.g. center cell) | `(**+0x1c)(p+0x130)` |
| 0x134 | u32 | dword@0x134 | scalar 2 | `(**+0x1c)(p+0x134)` |
| 0x138 | u8 | **move_character_size** | character count, **max 10** | `(**+0x24)(p+0x138)`; `<0xb` else throw `move_character_size over than 10` |
| 0x13c | u32[move_character_size] | **characterIds** | characters entering the mode (stride 4) | loop `p+0x13c += 4` |

Total = 0x18 + 70×4(=0x118 →0x130) + 8 + 4(count+pad→0x13c) + 10×4 = **0x164 = 356 B** (fixed).
Echo ACK `FUN_004c01a0`. Confidence: **high** (full parser).

**Server semantics:** authoritative gate for entering tactical combat — validate the unit list belongs
to the sector and the player can initiate; set up the tactical field; echo + broadcast a mode-change
to all participants (then the 0x0337.. tactics data + 0x0349 ResponsePositionUnit etc. follow).

---

## A.6 `0xb08 NotifyLeaveOutGrid` — 284 B (S→C) — units despawn from the current view

`Input_NotifyLeaveOutGrid::input_from_stream` = `FUN_0044ba10`. Apply = `FUN_004bece0`.

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u8 | **unit_size** | departing-unit count, **max 70** | `FUN_0044ba10` `*param_1`; `<0x47` else throw |
| 0x01 | — | pad (3) | align | |
| 0x04 | u32[unit_size] | **unitIds** | units that left this grid/sector (stride 4) | loop `pbVar2+4 += 4` |

Total = 4 + 70×4 = **0x11c = 284 B**. Apply `FUN_004bece0`: for each unit id, walk PLAYER_INFO
(600 entries) matching `record@0x04` vs `FUN_004b5bc0()`, then free its sprite
(`FUN_00522010(0x76)`→`FUN_0064c144`) and remove it; ALSO flag it in the tactical pool
(`0x126718`) entry `+0x5b8=1, +0x5b9=1` (departed flags) via `FUN_004c7cd0(pool, id, 1, …)`.

**Server semantics:** broadcast when fleets warp out / leave the observed sector. Body = count +
unit-id list. Confidence: **high** (parser + apply).

---

## A.7 `0xb09 / 0xb0a` NotifyEnterGrid{Begin,End} — 1 B each (S→C) — DONE

Covered in `docs/logh7-strategic-input-wire.md` §4. Recap: both 1 byte (a begin/end flag). `0xb0a`
in strategic mode (`0x126711==2`) with begin-flag 0 → `FUN_004c2a80(1)` rebuilds the PLAYER_INFO↔unit
linkage (gate G5). Used at sector entry to make fleets selectable.

---

## A.8 `0xb0b NotifyMovedBase` — 68 B (S→C) — base/fortress relocation — PROVEN

`Input_NotifyMovedBase::input_from_stream` = `FUN_0044bee0`. Apply = `FUN_004bee60`.

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u32 | dword0 (time/seq) | header | `(**+0x1c)()` |
| 0x04 | u32 | dword1 | header/result | `(**+0x1c)(p+4)` |
| 0x08 | u32 | **baseId** | the base/fortress that moved | `(**+0x1c)(p+8)`; apply `FUN_004b5be0(record@8)` |
| 0x0c | u16 | half@0x0c | route/grid scalar | `(**+0x20)(p+0xc)`; apply `FUN_004b5bd0(record@0xc)` |
| 0x0e | — | pad (2) | align | |
| 0x10 | u32 | **newX** | new strategic position X | `(**+0x1c)(p+0x10)`; apply → `playerInfo+0x40` |
| 0x14 | u32 | **newY** | new strategic position Y | `(**+0x1c)(p+0x14)`; apply → `playerInfo+0x44` |
| 0x18 | u8 | **move_character_size** | affected characters, **max 10** | `(**+0x24)(p+0x18)`; `<0xb` else throw |
| 0x1c | u32[move_character_size] | **characterIds** | characters relocated with the base (stride 4) | loop `p+0x1c += 4` |

Total = 0x1c + 10×4 = **0x44 = 68 B**. Apply `FUN_004bee60`: walk PLAYER_INFO (600); for each, if the
char-id array contains a matching entry, write `record@0x10→+0x40` and `record@0x14→+0x44` (new
position), set base id (`FUN_004b5be0`) and scalar (`FUN_004b5bd0`), and enqueue `FUN_00517cd0(0xb0b)`
for the matched base. **Same `+0x40/+0x44` position model as NotifyMovedGrid.**

**Server semantics:** when a base/fortress moves (e.g. mobile fortress), broadcast `0xb0b` with
`{baseId, newX, newY, [characterIds of personnel aboard]}`. Confidence: **high**.

---

## A.9 `0xb0c NotifySuppliedFuel` — 576 B (S→C) — fleet fuel/supply broadcast — PROVEN

`Input_NotifySuppliedFuel::input_from_stream` = `FUN_0044c450`. Apply = `FUN_004c0860`
(world-active gate → `FUN_00517cd0(0xb0c, record)` deferred event; sets UI dialog `0x12647c=0xb0c`).

| off | type | field | meaning | evidence (`FUN_0044c450`) |
|---|---|---|---|---|
| 0x00 | u32 | dword0 (time/seq) | header | `(**+0x1c)(p)` |
| 0x04 | u32 | dword1 | header/result | `(**+0x1c)(p+4)` |
| 0x08 | u32 | dword2 | source base/spot id | `(**+0x1c)(p+8)` |
| 0x0c | u8 | **unit_size** | supplied-unit count, **max 70** | `(**+0x24)(p+0xc)`; `<0x47` else throw |
| 0x0d | — | pad (3) | align to 0x10 | |
| 0x10 | struct[unit_size] | **suppliedUnits** | per-unit fuel result, **stride 8** | loop reads `(p-4)` then `(p)` with p=+0x14, stride 8 → entries from 0x10 |

Per-unit element (stride 8):

| rel | type | field | meaning |
|---|---|---|---|
| +0x00 | u32 | unitId | fleet that was supplied |
| +0x04 | u32 | fuelAfter | post-supply fuel/supply value |

Total = 0x10 + 70×8 = **0x240 = 576 B** (fixed). Confidence: **high** (parser pins header @0..0xc,
count max 70, stride-8 pair).

**Server semantics:** broadcast after a supply tick / `0xb02` — list each affected fleet and its new
fuel level so all observers update. The `0xb02` echo updates the actor; `0xb0c` updates everyone.

---

## A.10 `0xb0d NotifySearch` — 2716 B (S→C) — scout/recon RESULTS — PROVEN + RICH SEMANTICS

`Input_NotifySearch::input_from_stream` = `FUN_0044c960` (which inlines `Input_SearchEnemyInfo`).
Apply = `FUN_004bfd30` (writes the strategic scan/fog table at `clientBase+0x2a58fa`, stride 14 B per
cell, 100×50 grid).

### Outer record

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u32 | dword0 (time/seq) | header | `(**+0x1c)(p)` |
| 0x04 | u32 | dword1 | header/result | `(**+0x1c)(p+4)` |
| 0x08 | u32 | dword2 | searcher/faction id | `(**+0x1c)(p+8)` |
| 0x0c | u8 | **search_info_size** | scanned-cell count, **max 225** | `(**+0x24)(p+0xc)`; `<0xe2` else throw `over than 225` |
| 0x0d..0x0f | — | (count high bytes unused) | | |
| 0x10 | struct[search_info_size] | **searchInfo[]** | per-scanned-cell record, **stride 12** | loop `pbVar5 += 0xc` ×count |

### `searchInfo` element (SearchEnemyInfo, stride 0xc = 12 B)

| rel | type | field | meaning | evidence |
|---|---|---|---|---|
| +0x00 | u16 | **cell** | scanned cell index (`cell%100`=col, `cell/100`=row; 100×50 board) | `(**+0x20)(pbVar5-2)`; apply `uVar11=cell%100, uVar8=cell/100` |
| +0x02 | u8 | **about_unit_size** | detected-enemy count in this cell, **max 2** | `(**+0x24)(pbVar5)`; `2<*pbVar5` else throw `SearchEnemyInfo about_unit_size over than 2` |
| +0x03 | — | pad (1) | align | |
| +0x04 | enemy[about_unit_size] | **enemies** | up to 2 detected-unit records, **stride 4** | inner loop `pbVar8 += 4`, ×about_unit_size |

`enemies` element (stride 4): `{ u8 factionA, u8 factionB, u16 unitId/value }` — inner loop reads two
1-byte raw fields (`FUN_00610420(...,1,...)`) then a u16 (`(**+0x20)`). 0x10 + 225×12 =
**0xa9c = 2716 B** (fixed). Confidence: **high** (parser + apply both decoded).

**Apply semantics (`FUN_004bfd30`):** clears the scan table, then for each scanned cell writes the
cell value at `scanTable[cell].+4 = cell` and, per detected enemy, stores its unit id into
`scanTable[cell].+8 + n*4` with `scanTable[cell].+6 = enemyCount` (cap 2), matching the player's own
faction bytes (`ownPcVar5[0x28]/[0x29]`) to decide own-vs-enemy bucketing. Then enqueues
`FUN_00517cd0(0xb0d)`.

**Server semantics:** reply to `0xb03 CommandSearch`. Compute the set of cells revealed by the search
and, per cell, up to 2 enemy units present; send the 2716 B record. This is the strategic
fog-of-war / recon update.

---

# PART B — Logistics / organization (0x0cxx)

These are the **fleet/base reorganization & supply** commands (内政 logistics). All are **C→S,
echoed**. Several carry large per-ship/per-troop transfer tables. The client compiles `Input_`
parsers for the ones it must also read back (echo), so the layouts below are stream-proven where an
`Input_`/`Output_` exists.

## B.0 Dispatch / size summary

| Code | Class | Size | size-table | dispatcher copy | apply/ACK |
|---|---|---|---|---|---|
| 0xc00 | CommandCompletenessRepair | 0x35c (860) | `*p4=0x35c` | 0xd7 dw → `+0x43d254` | `FUN_004bfcd0` |
| 0xc01 | CommandCompletenessSupply | 0x324 (804) | `*p4=0x324`,ret 0xc01 | 0xc9 dw → `+0x43d5b0` | `FUN_004c5800` |
| 0xc02 | CommandReorganization | 0x310 (784) | `*p4=0x310` | 0xc4 dw → `+0x43d8d4` | `FUN_004c0030` |
| 0xc05 | CommandSupplement | 0x9e5c (40540) | `*p4=0x9e5c` | 0x2797 dw → `+0x43dbe4` | `FUN_004bffa0` |
| 0xc08 | CommandCarryingInOut | 0x100 (256) | `*p4=0x100` | 0x40 dw → `+0x447a40` | (stored, no apply) |
| 0xc0b | CommandAssignment | 0x8dc (2268) | `*p4=0x8dc` | 0x237 dw → `+0x447b60` | `FUN_004bfcd0` |
| 0xc0c | CommandCarryingOut | 0x20 (32) | `*p4=0x20`,ret 0xc01 | 8 dw → `+0x447b40` | (stored, no apply) |

Array bounds (from `Output_*::get_length`/`output_to_stream` error strings): Reorganization
move_ships≤99, move_troops≤24; Supplement result_outfit_ships≤99 / result_outfit_troops≤24 /
move_ships≤99 / move_troops≤24 + `InformationSupplementUnit units≤99`; Assignment result_outfit_ships
≤99 / result_outfit_troops≤24 / result_base_ships≤99 / result_base_troops≤24 / move_ships≤99 /
move_troops≤24; CarryingInOut move_troop_packages≤24 / move_other_packages≤3; CompletenessRepair
ship_units≤70; CompletenessSupply result_to_unit≤70 / result_from_unit≤26.

## B.1 `0xc02 CommandReorganization` — 784 B (PROVEN) — fleet/troop reorg

`Input_CommandReorganization::input_from_stream` = `FUN_00555eb0` (move_ships≤99, move_troops≤24).

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u32 | dword0 (time/seq) | header | `(**+0x1c)()` |
| 0x04 | u32 | dword1 | header/actor | `(**+0x1c)(p+4)` |
| 0x08 | u8 | flag@0x08 | reorg flag/mode | `(**+0x24)()` |
| 0x0c | u32 | dword@0x0c | source outfit/fleet id | `(**+0x1c)(p+0xc)` |
| 0x10 | u32 | dword@0x10 | dest outfit/fleet id | `(**+0x1c)(p+0x10)` |
| 0x14 | u32 | dword@0x14 | spot/base id | `(**+0x1c)(p+0x14)` |
| 0x18 | u32 | dword@0x18 | param | `(**+0x1c)(p+0x18)` |
| 0x1c | u8 | byte@0x1c | sub-flag | `FUN_00610420(p+0x1c,1,…)` raw read |
| 0x1d | u8 | **move_ships_size** | ships to move, **max 99** | `(**+0x24)(p+0x1d)`; `<100` |
| 0x1e | struct[move_ships_size] | **moveShips** | per-ship, **stride 6** | loop `iVar8 += 6` |
| 0x270 | u8 | **move_troops_size** | troops to move, **max 24** | `(**+0x24)(p+0x270)`; `<0x19` |
| 0x274 | struct[move_troops_size] | **moveTroops** | per-troop, **stride 6** | loop `iVar5 += 6` |
| 0x304 | f32/u32 | field@0x304 | scalar (`*+0x10` slot) | `(**+0x10)(p+0x304)` |
| 0x308 | f32/u32 | field@0x308 | scalar (`*+0x10` slot) | `(**+0x10)(p+0x308)` |
| 0x30c | u32 | field@0x30c | trailing scalar | `(**+0x1c)(p+0x30c)` |

`moveShips` element (stride 6) = `{ u16 shipId @+0, u8 destSlot @+2(raw), u16 param @+4 }`
(`(**+0x20)(iVar8-2)`, `FUN_00610420(iVar8)`, `(**+0x20)(iVar8+2)`).
`moveTroops` element (stride 6) = `{ u16 troopId @+0, u8 destSlot @+2(raw), u16/special @+4 }`
(last field read via `*+0x14`). Total = 0x1e + 99×6(=0x252→0x270) + 1 + 24×6(=0x90→0x304) + 12 =
**0x310 = 784 B**. Confidence: **high** (full parser).

**Server semantics:** reassign ships/troops between outfits/fleets (the core 編成 internal-affairs
action). Validate ownership & capacity; mutate unit composition; echo back; emit
`NotifyReorganizationBegin/End` (strings @0x788f2c/0x788f14) to drive the UI.

## B.2 `0xc08 CommandCarryingInOut` — 256 B (PROVEN) — package/cargo transfer

`Input_CommandCarryingInOut::input_from_stream` = `FUN_005580a0`
(move_troop_packages≤24, move_other_packages≤3).

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u32 | dword0 | header | `(**+0x1c)()` |
| 0x04 | u32 | dword1 | header | `(**+0x1c)()` |
| 0x08 | u32 | dword2 | header | `(**+0x1c)()` |
| 0x0c | u32 | dword@0x0c | source id | `(**+0x1c)()` |
| 0x10 | u32 | dword@0x10 | dest id | `(**+0x1c)(p+0x10)` |
| 0x14 | u32 | dword@0x14 | spot/base id | `(**+0x1c)(p+0x14)` |
| 0x18 | u8 | byte@0x18 | flag | `FUN_00610420(p+0x18,1,…)` |
| 0x1c | u32 | dword@0x1c | param | `(**+0x1c)(p+0x1c)` |
| 0x20 | u8 | **move_other_packages_size** | non-troop packages, **max 3** | `(**+0x24)(p+0x20)`; `<4` |
| 0x24 | struct[size] | **otherPackages** | stride 8 | loop `iVar6 += 8` |
| 0x3c | u8 | **move_troop_packages_size** | troop packages, **max 24** | `(**+0x24)(p+0x3c)`; `<0x19` |
| 0x3d | struct[size] | **troopPackages** | stride 8 | loop `param_1 += 8` |

Package element (stride 8) = `{ u8 typeA @+0, u8 typeB @+1, pad(2), u32/f32 amount @+4 }`
(two raw bytes `FUN_00610420`, then `*+0x10` dword). Total = 0x24 + 3×8(→0x3c) + 1 + 24×8(→0x100) =
**0x100 = 256 B**. Confidence: **high**. Echo is stored only (no apply consumer) → server just
echoes + persists the cargo move + emits `NotifyCarryingBegin/End` (@0x788ea8/0x788e94).

## B.3 `0xc00 CommandCompletenessRepair` / `0xc01 CommandCompletenessSupply` — 860 / 804 B

C→S. Output bounds: Repair `ship_units≤70`; Supply `result_to_unit≤70`, `result_from_unit≤26`. These
are "repair/supply this fleet to full" commands carrying the per-ship result tables the server fills
on echo. Echo apply: 0xc00→`FUN_004bfcd0` (release dialog), 0xc01→`FUN_004c5800`. Header is the
standard `{u32 seq, u32 result, u32 targetId, …}`; the body then holds a `ship_units` u8 count + a
per-ship result array (stride ~ (860−header)/70 ≈ 12). **Layout pinned only at the array bounds**
(no full `Input_` decoded here). Confidence: size **proven**; per-field **medium/low** — flagged.

**Server semantics:** repair/resupply the named fleet's ships to completeness from a base; echo with
the resulting per-ship hull/ammo values; broadcast simple-info deltas (0x120b
NotifySimpleInformationCompletenessSupplyOutfit).

## B.4 `0xc0b CommandAssignment` — 2268 B — personnel/unit assignment (largest non-supplement)

C→S. Output bounds: result_outfit_ships≤99, result_outfit_troops≤24, result_base_ships≤99,
result_base_troops≤24, move_ships≤99, move_troops≤24 (`FUN_005539b0` references all six). It is a
**superset of Reorganization** with both an outfit-side and base-side result table plus the move
table. Echo apply = `FUN_004bfcd0`. Structure mirrors B.1 with three count/array groups
(outfit-result, base-result, move). Confidence: bounds **proven**; exact offsets **medium** (decode
`FUN_005539b0`/`FUN_00558b70` fully before server impl). 

## B.5 `0xc05 CommandSupplement` — 40540 B — bulk reinforcement (largest in family)

C→S. Output bounds: result_outfit_ships≤99, result_outfit_troops≤24, move_ships≤99, move_troops≤24,
plus an embedded `InformationSupplementUnit units≤99` sub-record. The 40 KB size = many embedded
full unit records (new ships built/assigned). Echo apply `FUN_004bffa0`. Confidence: size **proven**;
field layout **low** (huge nested record — decode `FUN_005520f0`/`FUN_00556b10` before impl). Emits
`NotifySupplementBegin/End` (@0x788ee8/0x788ed4).

## B.6 `0xc0c CommandCarryingOut` — 32 B — simple cargo-out

C→S, echoed (8 dw, stored only). Header `{u32 seq, u32 result, u32 id, …}` + a small target/amount.
Confidence: size **proven**, fields **inferred**.

---

# PART C — Institutions (0x0exx)

## C.1 `0xe00 CommandMoveInstitutionSpot` — 24 B (C→S, echoed)

Relocate an institution (factory/shipyard/etc.) to a new spot. **No compiled `Input_` parser**
(C→S only). The name→code table `PTR_s_CommandMoveInstitutionSpot_00766e8c` maps index 0 → code
`0xe00` (`FUN_0044dae0`: `*param_3 = local_8 + 0xe00`). The 0xe00 family has up to **12 commands**
(`(ushort)(code+0xe000) < 0xc` gate in the family resolver), i.e. codes **0xe00..0xe0b**.

Echo apply `0xe00` = **`FUN_004beaa0`** — the PLAYER_INFO **position applicator** (walk `+0xc` stride
0x370, match by id, write `+0x40/+0x44`). So the echo carries the institution's new strategic
position, applied exactly like NotifyMovedGrid/Base.

| off | type | field | meaning | evidence |
|---|---|---|---|---|
| 0x00 | u32 | time/seq | header | `FUN_004ba2b0` 0xe00 |
| 0x04 | u32 | result/echo id | dialog FSM (`param_3[1]`) | echo copy |
| 0x08 | u32 | **institutionId** | institution being moved | matched by `FUN_004beaa0` |
| 0x0c | u32 | param | spot/option | inferred |
| 0x10 | u32 | **newX** | new position X → `playerInfo+0x40` | `FUN_004beaa0` |
| 0x14 | u32 | **newY** | new position Y → `playerInfo+0x44` | `FUN_004beaa0` |

Total 24 B (6 dw). Confidence: 0x08/0x10/0x14 **proven** by the applicator; header **inferred**.

## C.2 Institution build/destroy family (CommandInstitutionBuild / Destroy / Pause / ReOperation / BuildShip / BuildShipStop)

Strings @0x764b44..0x764bd4. These are additional `0xe0x` commands (indices 1..N within the 0xe00
family, exact codes from the unresolved PTR table at `0x766e8c+`). The main dispatcher
(`FUN_004ba2b0`) only handles `0xe00` explicitly; the build/destroy ACKs flow through a generic path.
`NotifyInstitutionBuild` (@0x764a88, `_INF` @0x764f74) is the S→C completion notify. **CommandInstitutionDestroy**
has no `over than` array → likely a small fixed body `{seq, result, institutionId}`.

Confidence: **low** on exact codes/sizes (not in the explicit size-table cases dumped). To pin: read
the `0xe00`-family resolver's PTR table (`PTR_s_CommandMoveInstitutionSpot_00766e8c[index]`) and the
`Output_CommandInstitution*::output_to_stream` functions. Flagged as open.

---

# Server to-do (authoritative implementation)

Priority order by playability (deepest, fully-proven first):

1. **`0xb04/0xb05` UnloadTroop/LoadTroop (PROVEN 36 B).** Parse `{baseId@8, targetId@0xc, spot@0x10,
   u8 count@0x14, u32 troopIds[≤3]@0x18}`. Validate co-location + ownership; move troop units between
   base garrison and fleet transports; echo the command back; update unit records.
2. **`0xb06 SwitchMode` (PROVEN 356 B).** The tactical-combat entry gate. Parse the unit list (u8
   @0x16, ≤70) + character list (u8 @0x138, ≤10) + mode (u16 @0x14). Validate; build the tactical
   field; echo + broadcast; then stream the 0x0337/0x033b/0x0349 tactics data.
3. **`0xb02 SupplyFuel` (PROVEN apply).** Parse `{targetUnitId@8, fuelA@0x10, fuelB@0x14}`; compute
   authoritative fuel; echo with the result (client writes `playerInfo+0x74/+0x78`); broadcast
   `0xb0c NotifySuppliedFuel`.
4. **`0xb0c NotifySuppliedFuel` (PROVEN 576 B).** Build `{seq, _, srcId@8, u8 unitCount@0xc,
   {u32 unitId, u32 fuelAfter}[≤70]@0x10}`, pad to 576 B. Broadcast after supply.
5. **`0xb0b NotifyMovedBase` (PROVEN 68 B).** Build `{_, _, baseId@8, u16@0xc, newX@0x10, newY@0x14,
   u8 charCount@0x18, u32 charIds[≤10]@0x1c}`. Broadcast on base/fortress move (mirrors 0xb07).
6. **`0xb0d NotifySearch` (PROVEN 2716 B) + `0xb03 CommandSearch`.** On `0xb03`, compute revealed
   cells; build `{_, _, searcherId@8, u8 cellCount@0xc, searchInfo[≤225]@0x10}` where each
   `searchInfo` = `{u16 cell, u8 enemyCount(≤2), {u8 facA, u8 facB, u16 unitId}[enemyCount]}`,
   stride 12, padded to 2716 B. This is strategic fog-of-war.
7. **`0xb08 NotifyLeaveOutGrid` (PROVEN 284 B).** Build `{u8 unitCount@0, u32 unitIds[≤70]@4}`,
   pad to 284 B. Broadcast when fleets warp out of the observed sector (despawn).
8. **`0xb00 MoveBase` (32 B).** Echo + broadcast `0xb0b`. Treat dwords 0x08.. as `{baseId, target,…}`
   (inferred — capture to confirm).
9. **`0xc02 Reorganization` (PROVEN 784 B).** Parse move_ships(≤99, stride6) + move_troops(≤24,
   stride6) + the two `*+0x10` scalars. Mutate unit composition; echo; emit Reorg Begin/End.
10. **`0xc08 CarryingInOut` (PROVEN 256 B).** Parse otherPackages(≤3) + troopPackages(≤24), stride 8.
    Move cargo; echo (stored); emit Carrying Begin/End.
11. **`0xc00/0xc01/0xc0b/0xc05` (sizes proven, layouts partial).** Repair/Supply/Assignment/
    Supplement — decode the remaining `Input_`/`Output_` (`FUN_00554f80`, `FUN_00551610`,
    `FUN_005539b0`, `FUN_005520f0`) before authoritative impl; for now echo byte-faithfully so the
    UI dialog FSM completes.
12. **`0xe00 MoveInstitutionSpot` (apply proven).** Echo with `{institutionId@8, newX@0x10,
    newY@0x14}`; client applies via the PLAYER_INFO position applicator. Build/destroy family: decode
    PTR table for codes.

**Endianness:** all bodies little-endian; only the 2-byte inner code prefix is big-endian.
**Echo rule:** for every C→S command here, reply with the same code (message32-wrapped S→C) carrying
the authoritative result; this both ACKs the modal dialog FSM and applies results client-side.

---

# Open questions (clearly flagged)

1. **C→S command header dwords (0x00/0x04).** Across the family the leading two dwords are a
   seq/result pair the client only uses for dialog-FSM matching (`local_1c=param_3[1|2]`). Their exact
   server meaning (timestamp vs sequence vs actor) isn't pinned — a live capture of one real command
   would confirm.
2. **`0xb00/0xb03` non-array command bodies** have no compiled `Input_` (C→S only); dwords past 0x08
   are inferred from sibling notifies. Capture or symbolize the SelectGrid/base-move send method.
3. **`0xc00/0xc01/0xc05/0xc0b` exact field offsets.** Only array bounds are proven from the
   `Output_*::get_length` strings; the full per-element struct (esp. CompletenessSupply's
   result_from_unit≤26 second array, and Supplement's embedded InformationSupplementUnit) needs the
   `Input_`/`Output_` decoded in full (large functions `FUN_00554f80`, `FUN_00551610`, `FUN_005520f0`,
   `FUN_005539b0`).
4. **Reorganization/CarryingInOut element `+0x04` field type** (`*+0x10` slot): read as a 4-byte
   dword via the float/dword slot — likely a count or fractional amount; whether it's int or f32 is
   not disambiguated statically.
5. **Institution build/destroy codes (0xe01..0xe0b).** The PTR table
   `PTR_s_CommandMoveInstitutionSpot_00766e8c[index]` orders them but isn't fully resolved in the
   export; the explicit size-table only lists 0xe00. Codes/sizes for Build/Destroy/Pause/ReOperation/
   BuildShip/BuildShipStop are flagged low-confidence.
6. **NotifySearch enemy element faction bytes (+0x00/+0x01).** Apply compares them to the player's own
   faction (`ownChar[0x28]/[0x29]`) — confirmed faction discriminators, but whether they are
   (empire/alliance) ids or (faction,subfaction) needs a live recon capture.

---

## Evidence index (Ghidra addrs)

| Addr | Role |
|---|---|
| `FUN_004b8b00` | wire size table (all family sizes) |
| `FUN_004ba2b0` | main client dispatcher (echo copies + apply calls for every code) |
| `FUN_00449e20` | Input_CommandUnloadTroop (0xb04, 36 B) |
| `FUN_0044a350` | Input_CommandLoadTroop (0xb05, 36 B) |
| `FUN_0044a880` | Input_CommandSwitchMode (0xb06, 356 B) |
| `FUN_0044ba10` | Input_NotifyLeaveOutGrid (0xb08, 284 B) |
| `FUN_0044bee0` | Input_NotifyMovedBase (0xb0b, 68 B) |
| `FUN_0044c450` | Input_NotifySuppliedFuel (0xb0c, 576 B) |
| `FUN_0044c960` | Input_NotifySearch + inlined SearchEnemyInfo (0xb0d, 2716 B) |
| `FUN_00555eb0` | Input_CommandReorganization (0xc02, 784 B) |
| `FUN_005580a0` | Input_CommandCarryingInOut (0xc08, 256 B) |
| `FUN_005539b0` | Output_CommandAssignment (0xc0b, bounds) |
| `FUN_004c5780` | 0xb00 MoveBase echo ACK (enqueue 0xb00) |
| `FUN_004c02f0` | 0xb02 SupplyFuel echo ACK (write playerInfo +0x74/+0x78) |
| `FUN_004bfcd0` | 0xb03/0xc00/0xc0b shared echo ACK (release dialog) |
| `FUN_004bece0` | 0xb08 NotifyLeaveOutGrid apply (despawn units) |
| `FUN_004bee60` | 0xb0b NotifyMovedBase apply (write playerInfo +0x40/+0x44) |
| `FUN_004c0860` | 0xb0c NotifySuppliedFuel apply (enqueue event) |
| `FUN_004bfd30` | 0xb0d NotifySearch apply (write scan table @0x2a58fa, stride 14) |
| `FUN_004beaa0` | 0xe00 MoveInstitutionSpot apply = PLAYER_INFO position applicator |
| `FUN_0044dae0` | institution name→code resolver (index 0 → 0xe00) |
| `FUN_00517cd0` | deferred-event enqueue (events 0x16=0xb07, etc.) |
| `FUN_00610420` | raw stream byte read (mtStreamInputBuffer::read) |
| `FUN_004b5b80` / `FUN_004b5bc0` | PLAYER_INFO id getters |
| `FUN_00522010` | content table-of-tables accessor (tag 0x76 = sprite for despawn) |

**Related docs:** `docs/logh7-strategic-input-wire.md` (0xb01/0xb07/0xb09/0xb0a, PLAYER_INFO model),
`docs/logh7-strategic-map-wire.md` (0x0313/0x0315 sector map), `docs/logh7-moveship-wire.md`
(tactical 0x0400 style reference), `docs/logh7-info-records-wire.md` (0x0323 char record incl.
flagship `char+0x24`).
