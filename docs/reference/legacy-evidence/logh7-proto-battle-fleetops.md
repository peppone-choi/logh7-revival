# LOGH VII — Battle fleet/troop/fortress ops wire spec (0x408–0x422 commands, 0x429–0x442 notifies)

Static RE of `G7MTClient.exe` (Ghidra index `.omo/ghidra/export/G7MTClient/`). This decodes the
**in-battle fleet/troop/fortress operation** message family: sortie/evacuate troops, repair/supply,
encourage, control, admission, file-fleet, shoot/move fortress, change-authority, mission, and their
S→C notifies. **No client/server launch — static only.**

All offsets are **into the inner body** (the bytes AFTER the `[u16 BE code]` framing prefix). Bodies are
**little-endian**. Server→client conn3 wraps as message32 `[u32 0][u16 BE code][body]`.

---

## 0. Shared header + the dispatch read model (evidence: `FUN_004b8b00` @ 0x4b8b00)

Every C→S command in this family is a C++ class whose serializer reads a **common 3-dword (or
4-dword) header** before its payload. The dispatch parsers receive `int *param_2` = the raw body dword
array, so `param_2[N]` = body byte `N*4`.

| Body dword | Off | Field | Meaning (from parsers) |
|---|---|---|---|
| `param_2[0]` | 0x00 | `time` / `base` | command timestamp / payload base cookie. Used as `(param_2[1]+param_2[0]) − now()` to compute a move-timer delta `entity+0x5c0/0x5bc`. |
| `param_2[1]` | 0x04 | `wait` / `len` | wait/length anchor; `base+len` = the time anchor for `entity+0x5bc`. |
| `param_2[2]` | 0x08 | `field8` | header slack (some classes use it as a secondary id; e.g. CommandControl `unit`/`condenser` follow it). |
| `param_2[3]`low | 0x0c | `count` | u8 element count (≤0x20=32), high 3 bytes pad. (For 4-dword-header classes the count sits at 0x10.) |
| `param_2[4]…` | 0x10 | `ids[]` | u32 id list (or stride-20 entry array for FileFleet). |

**Read helpers (mtNetStream getter vtable), confirmed across all parsers:**
`*vtbl+0x0c` = read **f32** (4B) · `*vtbl+0x14` = read **u16** (2B) · `*vtbl+0x1c` = read **u32** (4B) ·
`*vtbl+0x24` = read **u8** (1B). The `_INF:<Class>#`, `... OK`, and `... is over than N` strings tag each
class; the binary `input_from_stream` reads fields in wire order; a sibling text serializer
(`FUN_00439da0(...,&fmt,value)`) prints field **names** — that is where the human field names below come
from.

**The two dispatch modes.** Each parser is `FUN(client, body, mode)`. `mode==0` = full local apply
(preview/predict on the issuing client); `mode!=0` (dispatch always calls with `1`) = only stamp the
move-timer `entity+0x5c0/0x5bc = (base+len) − now()`. The authoritative server must read the body the
same way the `mode==0` branch consumes it (that branch is the one that reads the real fields).

**Entity lookup** `FUN_004c7cd0(pool, id, kind, f1,f2,f3)`: `kind=1` → active-unit/ship table
(`client+0x126718`, 600 slots, stride 0x9ec); `kind=0` → base/fortress table (`+0x174124`, 10 slots,
stride 0x8cc); `kind=2` → a third table (`+0x17991c`). `0xff` args = wildcard. The presence of the pool
flag `*(client+0x126718)` gates every handler (must be in a tactical session).

---

## 1. Troop ops — Sortie / Evacuate / Sortie(ship) / ChangeMode  (0x40f, 0x410, 0x412, 0x411)

All four route through the **same** dispatch parser `FUN_004be8c0` → inner `FUN_004be7c0`, and share the
**same body shape**: 3-dword header + u8 count@0xc + `count`×u32 ids@0x10. Confirmed by the binary
`Input_CommandSortieTroops::input_from_stream` `FUN_0049f860` (reads 3×u32 via `+0x1c`, u8 count via
`+0x24` with `<0x21` bound, then `count` u32 ids) and the CSV sibling `FUN_0049fa00`
(`id,id,id,{count}id,...`).

### CommandSortieTroops 0x40f — body 0x94 (148B)  · parser `FUN_004be8c0`→`FUN_004be7c0`

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | cmd timestamp / move-timer base | `FUN_0049f860` read1; `param_2[0]` |
| 0x04 | 4 | u32 | `wait` | wait/len anchor → `entity+0x5bc` | read2; `param_2[1]` |
| 0x08 | 4 | u32 | `field8` | header slack | read3 |
| 0x0c | 1 | u8 | `unit_size` | troop/unit count (1..32) | `FUN_0049f860` `+0x24`, bound `<0x21`; loop `param_2+3` |
| 0x0d | 3 | — | pad | | |
| 0x10 | 4×N | u32[] | `unitIds[]` | troop/unit ids to sortie | loop reads `param_2+4 + i` |
| … | | | | tail zero-padded to 148 (32 ids max) | 0x10+32×4=0x90, +4 slack = 0x94 |

**CommandEvacuateTroops 0x410 — body 0x90 (144B)**: identical layout (32 ids → 0x10+0x80=0x90). Same
parser; opposite direction (pull troops back into ship/base).
**CommandSortie 0x412 — body 0x90 (144B)**: identical layout (`_INF:CommandSortie#`,
`Output_CommandSortie` strings). Sortie a *fleet/ship* unit (vs troops).
**CommandChangeMode 0x411 — body 0x98 (152B)**: same parser `FUN_004be8c0`, logs
`>>>>CommandChangeMode`; 0x98 = 0x10 header + 0x80 ids + 8 trailing flag bytes (battle-mode toggle, e.g.
attack/defense/escape posture — see 0x42f NotifyChangeMode 0x298 for the resulting per-ship mode record).

**Server semantics (troop ops):** validate each `unitId` is owned by the sender and currently
embarked (sortie) / deployed (evacuate); transition the unit's carrier/deployment state; for a base
assault, mark the troop as landed. Broadcast the result via **NotifySortie 0x437** (the sortied unit),
**NotifyMovedTroop 0x429** (troop position updates), and **NotifyLandCombat 0x42a** when a ground
engagement resolves. The client only stamps a move-timer locally — authoritative deploy state is the
server's.

---

## 2. Repair / Supply / Emergency-supply  (0x413, 0x414, 0x422)

### CommandRepairFleet 0x413 — body 0x14 (20B)  · parser `FUN_004c13a0`
### CommandSupplyFleet 0x414 — body 0x14 (20B)  · parser `FUN_004c14a0`

Byte-identical parsers; the only difference is the tag they stamp (`entity+0x5c4 = 2` repair vs `= 1`
supply). They read **two** unit ids (`param_2[3]` = the unit being serviced, `param_2[4]` = the
supplier/source unit), so the body is header(12) + 2 u32 ids (the `param_2[3]/param_2[4]` slots).

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | timestamp | `param_2[0]` |
| 0x04 | 4 | u32 | `wait` | len/wait anchor | `param_2[1]` |
| 0x08 | 4 | u32 | `field8` | slack | |
| 0x0c | 4 | u32 | `targetUnitId` | unit to repair/supply | `param_2[3]` → `FUN_004c7cd0(...,param_2[3],1,...)` |
| 0x10 | 4 | u32 | `sourceUnitId` | supplier/repair source unit | `param_2[4]` → lookup; copies `src+4`→`tgt+0x5c8`, `src+8`→`tgt+0x5cc` |

On apply (`mode==0`): `*(u8)(tgt+0x5c4)= 2|1` (repair|supply tag), `tgt+0x5c8 = *(u32)(src+4)`,
`*(u8)(tgt+0x5cc)= *(u8)(src+8)` — i.e. it records *who is supplying/repairing whom*. `mode!=0` only
stamps the move timer of the target unit.

### CommandEmergencySupply 0x422 — body 0x14 (20B)
Dispatch gives size 0x14, `*param_3 = *param_2`, no dedicated parser call (handled like a simple
single-id request). Same header(12) + likely `targetId`@0x0c (+ a source/amount field @0x10). **Confidence
medium** — no count loop, no error string; layout inferred from the 0x14 size and the repair/supply
sibling shape. Pairs with **NotifyEmergencySupplyBase 0x438** (0x10).

**Server semantics:** validate adjacency/range between source and target and that the source has fuel/
ammo/repair capacity; transfer resources / restore hull; emit **NotifyRepairFleet 0x42d** /
**NotifySupplyFleet 0x42e** / **NotifyEmergencySupplyBase 0x438** (all 0x10 = 16B: `[u32 targetId][u32
sourceId][u32 amount/result][u32 _]`, layout from dispatch size + apply, **confidence medium**).

---

## 3. Encourage / Suggestion / Control  (0x409, 0x408, 0x40c)

### CommandEncourageFlagship 0x409 — body 0x10 (16B)
Dispatch: `size=0x10`, `*param_3=*param_2`, no parser (simple). Header(12) + `flagshipId`@0x0c
(**confidence medium**; single-target encourage). Raises crew morale of the targeted flagship.
→ **NotifyEncourageFlagship 0x42c** below.

### CommandSuggestion 0x408 — body 0x18 (24B)
Dispatch: `size=0x18`, `*param_3 = param_2[1]+*param_2`. Header(12) + payload(12). A tactical
*suggestion/order* to an allied/AI unit (target id + suggestion code + param). **Confidence medium** —
no count loop / error string; 24B = header + 3 dwords (likely `targetId`, `suggestionType`, `arg`).

### CommandControl 0x40c — body 0x20 (32B)  · `input` near `FUN_00495b70` (text serializer, full field names)

**Per-ship subsystem power / damage-control allocation.** The text serializer `FUN_00495b70` prints every
field with its name:

| Off | Size | Type | Field | Meaning | Evidence (`FUN_00495b70`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | timestamp | `*param_1` "time" |
| 0x04 | 4 | u32 | `wait` | wait | `param_1[1]` "wait" |
| 0x08 | 4 | u32 | `field8` | (unnamed dword) | `param_1[2]` |
| 0x0c | 4 | u32 | `unit` | ship/unit id | `param_1[3]` "unit" |
| 0x10 | 2 | u16 | `condenser` | condenser/power-bank setting | `*(u16*)(param_1+4)` "condenser" |
| 0x12 | 1 | u8 | `beam` | beam-weapon power | `*(u8*)(param_1+0x12)` "beam" |
| 0x13 | 1 | u8 | (unnamed) | second weapon/aux power | `*(u8*)(param_1+0x13)` |
| 0x14 | 6 | u8[6] | `shield[6]` | per-facing shield power (6 arcs) | loop `+0x14..+0x19` "shield_6:" |
| 0x1a | 1 | u8 | `engine` | engine power | `+0x1a` "engine" |
| 0x1b | 1 | u8 | `warp` | warp power | `+0x1b` "warp" |
| 0x1c | 1 | u8 | `sensor` | sensor power | `param_1+7` (=byte 0x1c) "sensor" |
| 0x1d | 3 | — | pad | → 32 | |

**Server semantics:** store the per-ship power/shield/repair-priority profile on the unit; affects combat
resolution (shield mitigation per arc, beam damage, mobility). No broadcast notify of its own — its
effects surface through combat notifies (attack/shield results).

---

## 4. Admission / FileFleet  (0x40b, 0x40d)

### CommandAdmission 0x40b — body 0x94 (148B)  · `Input_CommandAdmission` `FUN_0049e340`
**4-dword header** (one extra id dword vs the 3-dword troop header), then count + id list:

| Off | Size | Type | Field | Meaning | Evidence (`FUN_0049e340`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | timestamp | read1 `+0x1c` |
| 0x04 | 4 | u32 | `wait` | wait/len | read2 |
| 0x08 | 4 | u32 | `field8` | slack | read3 |
| 0x0c | 4 | u32 | `targetId` | the base/unit being entered (admission target) | read4 |
| 0x10 | 1 | u8 | `target_size` | count of admitted units (≤32) | `+0x24`, bound `<0x21` |
| 0x14 | 4×N | u32[] | `unitIds[]` | units requesting admission | loop `param_1+0x14`, stride 4 |

`0x14 + 32×4 = 0x94`. ✓ Admit fleet(s) into a base/fortress dock. **CommandAdmissionBase 0x41a** (0x94)
and **CommandRepairBase 0x41b / CommandSupplyBase 0x41c** (0x94) share this `target_size` shape (same
"target_size is over than 32" strings) but operate on bases.
**Server semantics:** validate ownership + base capacity + range; dock the units; possibly begin
repair/supply.

### CommandFileFleet 0x40d — body 0x294 (660B)  · `Input_CommandFileFleet` `FUN_0049ec60`, parser `FUN_004bf0c0`
**Re-form / re-file a fleet into a new formation** — same 5-dword entry array as CommandMoveShip:

| Off | Size | Type | Field | Meaning | Evidence (`FUN_0049ec60`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | timestamp | read1 `+0x1c` |
| 0x04 | 4 | u32 | `wait` | wait/len | read2 |
| 0x08 | 4 | u32 | `field8` | slack | read3 |
| 0x0c | 1 | u8 | `position_size` | entry count (≤32) | `+0x24`, bound `<0x21` |
| 0x10 | 20×N | struct[] | `entries[]` | per-ship: see below | loop stride 0x14 |
| 0x290 | 4 | u8/u32 | `flag` | `param_2[0xa4]` boolean: 0 = clear formation (`entity+0x68=0`, set "arrived"), 1 = engage formation (`entity+0x68=1`) | `FUN_004bf0c0` `(char)param_2[0xa4]` |

Per-entry (stride 20, `Input` reads `+0x1c` then 4×`+0xc`): `+0x00 u32 shipId`, `+0x04 f32 heading`,
`+0x08 f32 x`, `+0x0c f32 z`, `+0x10 f32 y` — **identical to the CommandMoveShip unit entry**
(docs/logh7-moveship-wire.md §3). `FUN_004bf0c0` resolves target poses via `FUN_004c8110` and commits
each ship's waypoint via `FUN_004bf4c0` exactly like a move, then tags `entity+0x62 = 3` (file-fleet
move kind) and `entity+0x435=1`. So FileFleet = a formation move that also **clears the old formation
membership** (the 600-slot loop zeroing `puVar8[-2]/*puVar8/+7` for ships matching the fleet group from
`FUN_004b5c00`). `0x294 = 0x10 + 32×20 + 4`.

**Server semantics:** reassign the listed ships to a new formation/fleet grouping and move them to the
per-entry waypoints; broadcast `NotifyMovedShip 0x423` / `NotifyTurnedShip 0x424` per ship (same as a
move). Drop each ship's prior formation linkage first.

---

## 5. Fortress ops — ShootFortress / MoveFortress  (0x419, 0x41f)

### CommandShootFortress 0x419 — body 0x14 (20B)  · parser `FUN_004bfa10`
Fortress main-gun fire toward a heading. Parser reads `param_2[3]` (fortress id, looked up in the **base
table** `kind=0`) and `param_2[4]` (a **fire angle**, used as float: `sin/cos(angle)` via `FUN_005ff6b4`/
`FUN_005ff764` scaled by `_DAT_0066e178` to build a beam endpoint from the fortress position `base+0x14`):

| Off | Size | Type | Field | Meaning | Evidence (`FUN_004bfa10`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | timestamp | `param_2[0]` |
| 0x04 | 4 | u32 | `wait` | len/wait anchor | `param_2[1]` |
| 0x08 | 4 | u32 | `field8` | slack | |
| 0x0c | 4 | u32 | `fortressId` | firing fortress (base table) | `param_2[3]`, `FUN_004c7cd0(...,0,...)` kind=0 |
| 0x10 | 4 | f32/u32 | `angle` | fire heading (radians); also stored at scratch `iStack_898` | `(float)param_2[4]`, `FUN_005ff6b4/764(param_2[4])` |

`mode==0` builds the beam vector and calls `FUN_004b3460(fortress, beamDesc, 10)` (spawn beam fx). →
**NotifyShootFortress 0x436** / **NotifyShootBase 0x43f**.

### CommandMoveFortress 0x41f — body 0x1a4 (420B)  · `Input_CommandMoveFortress` `FUN_004a35b0`
Move a mobile fortress (e.g. Geiersburg/Iserlohn-class) along a path:

| Off | Size | Type | Field | Meaning | Evidence (`FUN_004a35b0`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | timestamp | read1 `+0x1c` |
| 0x04 | 4 | u32 | `wait` | wait/len | read2 |
| 0x08 | 4 | u32 | `field8` | slack | read3 |
| 0x0c | 4 | u32 | `fortressId` | the fortress | read4 `+0x1c` |
| 0x10 | 4 | f32 | `x0` | start/anchor x | `+0xc` |
| 0x14 | 4 | f32 | `y0` | start/anchor y | `+0xc` |
| 0x18 | 4 | f32 | `z0` | start/anchor z | `+0xc` |
| 0x1c | 4 | u32 | `param` | move param (speed/flags) | `+0x1c` |
| 0x20 | 1 | u8 | `to_position_size` | waypoint count (≤32) | `+0x24`, bound `<0x21` |
| 0x28 | 12×N | f32[3][] | `waypoints[]` | path points (x,y,z each) | loop stride 0xc: `+0xc,+0xc,+0xc` |

`0x28 + 32×12 = 0x1a4`. ✓ (entries start at 0x28; the parser steps `param_1+0x28` then `+0xc` each).
→ **NotifyMovedFortress 0x435** (0x14).

**Server semantics:** validate the fortress is mobile + owned; set its waypoint path; tick it along the
path; broadcast `NotifyMovedFortress 0x435` (`[u32 fortressId][f32 x][f32 y][f32 z]` = 0x14, **confidence
medium** from size).

---

## 6. ChangeAuthority / Mission  (0x420, 0x421)

### CommandChangeAuthority 0x420 — body 0x94 (148B)  · `Input_CommandChangeAuthority` `FUN_004a3d60`, parser `FUN_004c08e0`
Reassign command authority of a set of units to a new commander character:

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | timestamp | `FUN_004a3d60` read1 |
| 0x04 | 4 | u32 | `wait` | wait/len | read2 |
| 0x08 | 4 | u32 | `field8` | slack | read3 |
| 0x0c | 1 | u8 | `unit_size` | unit count (≤32) | `+0x24`, bound `<0x21`; loop `param_2+3` |
| 0x10 | 4×N | u32[] | `unitIds[]` | units changing authority | loop, stride 4 |
| 0x90 | 4 | u32 | `newCommanderId` | the character/commander receiving authority | `FUN_004a3d60` reads `param_1+0x90`; parser uses `param_2[0x24]` (=byte 0x90) |

`0x10 + 32×4 = 0x90`, then the trailing commander id → `0x94`. ✓ The parser loops each unit and (per
unit) looks up both the unit and `param_2[0x24]` (the new commander). → **NotifyChangedAuthority 0x439**.

### CommandMission 0x421 — body 0x98 (152B)  · `Input_CommandMission` `FUN_004a4250`
Assign a mission/objective to a set of units:

| Off | Size | Type | Field | Meaning | Evidence (`FUN_004a4250`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | timestamp | read1 `+0x1c` |
| 0x04 | 4 | u32 | `wait` | wait/len | read2 |
| 0x08 | 4 | u32 | `field8` | slack | read3 |
| 0x0c | 1 | u8 | `unit_size` | unit count (≤32) | `+0x24`, bound `<0x21` |
| 0x10 | 4×N | u32[] | `unitIds[]` | units assigned the mission | loop, stride 4 |
| 0x90 | 1 | u8 | `flagA` | mission flag/type (string-built byte) | `FUN_00610420(param_1+0x90,...)` |
| 0x91 | 1 | u8 | `flagB` | second mission flag/type | `FUN_00610420(param_1+0x91,...)` |
| 0x94 | 4 | u32 | `missionTarget` | objective id/target | read `param_1+0x94` `+0x1c` |

`0x90 = 0x10 + 32×4`, then 2 flag bytes + a u32 target → `0x98`. ✓ → **NotifyMissionResult 0x43c**
(0x10), **NotifyFinishOccupation 0x442** (8) when an occupation objective completes.

---

## 7. Server→Client notifies (sizes from dispatch; layouts from Input/apply)

The S→C notifies in this family are mostly **fixed-size** and are *logged* at the dispatch then *applied*
by the big tactical apply handler `FUN_004ba2b0`. Codes/sizes are confirmed ground truth from
`FUN_004b8b00`; field layouts below are from each `Input_*::input_from_stream` where one exists, else from
the dispatch size + the apply branch (confidence flagged).

### NotifyEncourageFlagship 0x42c — body 0xfc (252B)  · `Input_NotifyEncourageFlagship` `FUN_004a7260` (HIGH)
| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 1 | u8 | `unit_size` | affected-ship count (≤61=0x3d) | `+0x24`, bound `<0x3e` |
| 0x04 | 4×N | u32[] | `unitIds[]` | flagships encouraged | loop `param_1+4`, stride 4 |
| 0xf8 | 2 | s16 | `morale` | morale delta applied (label "move_morale") | `+0x14` (u16); `FUN_004a75c0` prints `*(short*)(p+0xf8)` |

`0xf8 + 2 → pad 0xfc`. The serializer literally labels it **`move_morale`** → this is the morale change
broadcast to all clients so every UI shows the boosted flagships.

### NotifyShootFortress 0x436 — body 0x8c (140B)  · `Input_NotifyShootFortress` `FUN_004a8c10` (HIGH)
| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `fortressId` | firing fortress | read1 `+0x1c` |
| 0x04 | 4 | u32 | `arg` | angle/target (mirror of command `angle`) | read2 `+0x1c` |
| 0x08 | 1 | u8 | `unit_size` | hit-target count (≤32) | `+0x24`, bound `<0x21` |
| 0x0c | 4×N | u32[] | `targetIds[]` | units hit by the volley | loop `param_1+0xc`, stride 4 |

`0xc + 32×4 = 0x8c`. ✓ **NotifyShootBase 0x43f** is the base-variant (dispatch routes 0x43f to the
4-byte `*param_4=0x10` group → actually `case 0x42d/0x42e/0x433/0x434` share 0x10; 0x43f shares the
`0x409` group `size 0x10`). **Confidence medium** for 0x43f exact layout.

### NotifyChangedAuthority 0x439 — body 0x88 (136B)  · `Input_NotifyChangedAuthority` `FUN_004a94d0` (HIGH)
| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `newCommanderId` | commander now holding authority | read1 `+0x1c` |
| 0x04 | 1 | u8 | `unit_size` | unit count (≤32) | `+0x24`, bound `<0x21` |
| 0x08 | 4×N | u32[] | `unitIds[]` | units whose authority changed | loop, stride 4 |

`0x08 + 32×4 = 0x88`. ✓ Mirror of CommandChangeAuthority, commander id moved to the front.

### Fixed small notifies (size = ground truth; layout confidence medium/low)
| Code | Name | Size | Inferred layout | Conf |
|---|---|---|---|---|
| 0x429 | NotifyMovedTroop | 0xc (12) | `[u32 troopId][f32/u32 a][f32/u32 b]` (troop pos/state). Dispatch shares the `0x422` group (`*param_4=0x14`)? — actually 0x429 jumps to `caseD_422` then logs; size **0x14** per dispatch. **Re-check:** `case 0x429: log; goto caseD_422` ⇒ size **0x14 (20B)**. | med |
| 0x42a | NotifyLandCombat | 0xc (12) | `[u32 unitId][u16 result][u16 _][u32 _]` ground-combat tick result | med |
| 0x437 | NotifySortie | 0x1c (28) | shares `caseD_359` ⇒ size **0x1c**; `[u32 unitId][record…]` sortie confirmation | med |
| 0x42d | NotifyRepairFleet | 0x10 (16) | `[u32 targetId][u32 sourceId][u32 amount][u32 _]` | med |
| 0x42e | NotifySupplyFleet | 0x10 (16) | as 0x42d (fuel/ammo restored) | med |
| 0x438 | NotifyEmergencySupplyBase | 0x10 (16) | `[u32 baseId][u32 unitId][u32 amount][u32 _]` | med |
| 0x435 | NotifyMovedFortress | 0x14 (20) | `[u32 fortressId][f32 x][f32 y][f32 z]` | med |
| 0x43c | NotifyMissionResult | 0x10 (16) | `[u32 unitId][u32 missionId][u32 result][u32 _]` | med |
| 0x442 | NotifyFinishOccupation | 8 | `[u32 baseId][u32 newOwner]` occupation complete | med |
| 0x43a | NotifyCharacterAchievement | 0xc (12) | `[u32 charId][u32 kind][u32 value]` (功績) | med |
| 0x440 | NotifyMoraleDown | 0xc (12) | `[u32 unitId][u16 morale][u16 _][u32 _]` | med |

> NotifyMovedTroop note: dispatch `case 0x429:` logs `>>>>NotifyMovedTroop` then `goto
> switchD_004b8db0_caseD_422` which sets `*param_4 = 0x14`. So **NotifyMovedTroop is 0x14 (20B)**, not the
> catalog's `?`. Likely `[u32 troopId][f32 x][f32 y][f32 z]` mirroring NotifyMovedShip. Confidence medium.

---

## 8. Server to-do (authoritative implementation)

(Docs only — do NOT edit `src/server/*.mjs` here.)

- **Parsers (C→S).** Add body parsers keyed by code. The shared header (`time@0, wait@4, field8@8`) can be
  skipped for game logic but `time`/`wait` are the client's timing anchors — echo or re-stamp them in
  notifies if the client expects them. Read `count` at @0x0c (or @0x10 for Admission's 4-dword header,
  @0x20 for MoveFortress) as u8 (clamp 1..32; EncourageFlagship clamp 1..61). Read id lists as u32 LE
  arrays at the offsets above; FileFleet/MoveFortress entry arrays as stride-20 / stride-12 structs.
- **Ownership + state validation** per command:
  - Sortie/Evacuate/Sortie(ship)/ChangeMode: units owned + embarked/deployed state machine.
  - Repair/Supply/EmergencySupply: source in range + has capacity; mutate hull/fuel/ammo.
  - Control: persist per-ship subsystem power profile (shield arcs, beam, engine, warp, sensor) — feeds
    combat resolution.
  - Admission: base ownership + dock capacity.
  - FileFleet: reassign formation + move (reuse the 0x400 move path; entries are identical).
  - ShootFortress: fortress owned + on cooldown? build beam toward `angle` from fortress pos; resolve hits.
  - MoveFortress: fortress mobile + owned; set path.
  - ChangeAuthority: sender outranks/owns the units; set `commander = newCommanderId`.
  - Mission: assign objective; track completion → occupation.
- **Broadcast (S→C).** Build the notify for every observer:
  - 0x437 NotifySortie, 0x429 NotifyMovedTroop, 0x42a NotifyLandCombat (troops).
  - 0x42d/0x42e/0x438 (repair/supply), 0x42c NotifyEncourageFlagship (morale, with `move_morale` s16).
  - 0x436 NotifyShootFortress (+ 0x43f NotifyShootBase), 0x435 NotifyMovedFortress.
  - 0x439 NotifyChangedAuthority, 0x43c NotifyMissionResult, 0x442 NotifyFinishOccupation.
  - Wrap each as message32 `[u32 0][u16 BE code][body]` on conn3.
- **Endianness.** Body fields LE; only the 2-byte inner code prefix is BE. Floats are IEEE-754 LE.
- **Same coordinate space** as NotifyMovedShip 0x423 (continuous XZ-plane floats, Y≈0, heading = Y-yaw
  radians) for all positional fields (FileFleet entries, MoveFortress waypoints, ShootFortress angle).

---

## 9. Open questions
1. **CommandEmergencySupply 0x422 / CommandSuggestion 0x408 / CommandEncourageFlagship 0x409 exact body
   fields.** No count loop or error string ⇒ no `Input_*` with named fields located; layouts inferred from
   dispatch sizes (0x14/0x18/0x10) and sibling shapes. A capture or the `_INF:` text serializer (if it has
   one) would pin field names.
2. **Fixed S→C notify inner layouts** (0x429/0x42a/0x435/0x43c/0x438/0x442, etc.). Sizes are ground truth;
   field offsets are inferred from the apply branch in `FUN_004ba2b0` (not yet line-traced) + the mirror
   command. Decompiling the specific `case` in `FUN_004ba2b0` (3118-line handler) would upgrade these to
   high confidence.
3. **NotifyMovedTroop true size.** Dispatch routes `0x429 → caseD_422` = `0x14` (20B), conflicting with the
   catalog's `?`. Treated as 20B here.
4. **CommandChangeMode 0x411 trailing 8 bytes** (0x98 = ids 0x90 + 8): the battle-mode posture flags — map
   against NotifyChangeMode 0x42f (0x298) per-ship mode record.
5. **`field8` (@0x08) role.** Header slack in most classes; in a few it may carry a secondary id — confirm
   per class with a capture.

---

### Evidence index (Ghidra addrs)
- `FUN_004b8b00` — inner dispatch switch (all codes/sizes + parser calls + log strings).
- `FUN_004be8c0` → `FUN_004be7c0` — Sortie/Evacuate/Sortie/ChangeMode parser (single-dword id loop).
- `FUN_004c13a0` / `FUN_004c14a0` — RepairFleet / SupplyFleet parser (target+source ids, tag 2/1).
- `FUN_004bfc40` — Warp/Attack/Shoot id-loop parser (sibling shape).
- `FUN_004bfa10` — ShootFortress parser (base-table lookup + beam-angle math).
- `FUN_004c08e0` — ChangeAuthority parser (per-unit + new commander `param_2[0x24]`).
- `FUN_004bf0c0` — FileFleet parser (stride-20 entries → move commit `FUN_004bf4c0`, formation clear).
- `FUN_004be8f0` / `FUN_004bf4c0` / `FUN_004c8110` — move-commit + pose resolver (shared with 0x400).
- `FUN_004c7cd0` — entity lookup (kind 0=base, 1=unit, 2=other).
- Input serializers: `FUN_0049f860` SortieTroops, `FUN_0049ec60` FileFleet, `FUN_0049e340` Admission,
  `FUN_004a35b0` MoveFortress, `FUN_004a3d60` ChangeAuthority, `FUN_004a4250` Mission,
  `FUN_004a7260` NotifyEncourageFlagship, `FUN_004a8c10` NotifyShootFortress,
  `FUN_004a94d0` NotifyChangedAuthority.
- Text serializers (field names): `FUN_0049fa00` SortieTroops CSV, `FUN_00495b70` Control,
  `FUN_004a73d0`/`FUN_004a75c0` NotifyEncourageFlagship (`move_morale`).
- `FUN_004ba2b0` — tactical S→C apply handler (per-code branches; 3118 lines, not yet line-traced).
