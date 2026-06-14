# LOGH VII — Battle core: ChangeMode / SwitchMode + Move / Turn / Reverse / Stop / Warp

Static RE of `G7MTClient.exe` (Ghidra index `.omo/ghidra/export/G7MTClient/`). This is the
**SPACE-WAR ENTRY POINT** family: the messages that flip the client between the strategic map and a
controllable tactical battle, plus the per-ship maneuver siblings of `CommandMoveShip 0x0400`
(documented in `docs/logh7-moveship-wire.md`). **Static RE only — no client/server launch.**

All field offsets are **into the inner body** (the bytes AFTER the framing prefix). Bodies are
**little-endian**. Framing: client→server inner = `[u16 BE code][body]`; server→client conn3 =
message32 `[u32 0][u16 code][body]`.

> **Two "sizes" exist — do not confuse them.**
> - The dispatch table (`FUN_004b8b00`) `*param_4 = N` is the **fixed in-memory receive-struct size** the
>   client allocates for that code (e.g. ChangeMode `0x98`, NotifyChangeMode `0x298`). The on-the-wire
>   parsers (`Input_*::input_from_stream`) deserialize INTO that struct.
> - `Output_*::get_length` is the **actual serialized wire length**, which for the array messages is
>   **variable** (`fixed + 4*unitCount`). Example: `Output_CommandChangeMode::get_length` returns
>   `0x12 + 4*unitCount` (`FUN_00496e40` @0x00496e40), NOT `0x98`. The struct is fixed; the wire is packed.
>
> The field tables below give the **struct offsets** (what the parser writes / the applier reads). On the
> wire the fields appear in the same order, tightly packed (count then exactly `count` ids, no padding to
> the 32-slot maximum).

---

## 0. Stream getter decode key (proven, used by every Input_/Output_ below)

Every `Input_*::input_from_stream` calls virtual getters on the `mtNetStream` object `param_2` via its
vtable. Widths proven by cross-checking `Input_CommandMoveShip` (`FUN_0049a5d0`) against the **known**
MoveShip layout in `docs/logh7-moveship-wire.md` (shipId=u32, then 4 floats):

| vtable slot | call form | width | reads |
|---|---|---|---|
| `*(stream+0x0c)` | `(**(code**)(*param_2+0xc))(dst)` | 4 | **f32** (float) — e.g. MoveShip heading/x/z/y/speed |
| `*(stream+0x1c)` | `(**(code**)(*param_2+0x1c))(dst)` | 4 | **u32** (int) — e.g. shipId, ids, dwords |
| `*(stream+0x20)` | `(**(code**)(*param_2+0x20))(dst)` | 2 | **u16** — proven: NotifyWarpedShip writes @0xc then count @0xe (2-byte gap) |
| `*(stream+0x24)` | `(**(code**)(*param_2+0x24))(dst)` | 1 | **u8** — array element count |
| `FUN_00610420(dst,1,0,2)` | buffered copy | ≤4 | **opaque blob/short read** — only the **low byte** is consumed downstream (see §1 off 0x04) |

This key makes every layout below mechanical: read the parser, map each getter call → (offset, width,
type). All confirmed against dispatch struct sizes.

---

## 1. CommandChangeMode `0x0411` — THE TACTICAL-BATTLE REQUEST (C→S)

- **Dispatch** (`FUN_004b8b00`): `*param_4 = 0x98`; calls **`FUN_004be8c0(body, 1)`** (mode arg = 1).
- **Wire parser (Input)**: `Input_CommandChangeMode::input_from_stream` = **`FUN_004a01e0`** @0x004a01e0.
- **get_length (Output)**: `FUN_00496e40` → `0x12 + 4*unitCount` (fixed 18 + 4 per unit, max 32 units).
- **Dispatch parser (applier)**: `FUN_004be8c0` @0x004be8c0 → `FUN_004be7c0` @0x004be7c0.
- **Sibling codes that share `FUN_004be8c0`/`FUN_004be7c0`**: `0x40f CommandSortieTroops` (0x94),
  `0x410 CommandEvacuateTroops` (0x90), `0x412 CommandSortie` (0x90). Same body shape, different intent.

### 1a. Body layout (in-memory struct 0x98 = 152B; wire = 0x12 + 4*count)

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `base` | payload base ptr/cookie (header). `base+len` = a **time anchor** used by the applier. | `Input` `*+0x1c`; `FUN_004be7c0`: `(param_2[0]+param_2[1]) - now` |
| 0x04 | 4 | u32 | `len` | payload length, pairs with `base`. | `Input` `*+0x1c`; `param_2[1]` |
| 0x08 | 4 | u32 | `field8` | header slack (not read by the applier). | `Input` `*+0x1c`; unused in `FUN_004be7c0` |
| 0x0c | 1 | u8 | **`unitCount`** | number of unit/ship ids (1..32). | `Input` `*+0x24`; applier loops `*(byte*)(param_2+3)` |
| 0x0d | 3 | — | pad | high bytes of dword 3. | only low byte used |
| 0x10 | 4×N | u32[] | **`unitIds`** | ship/unit ids to change mode (stride **4**, `unitCount` entries). | `Input` loop `iVar6=+0x10; +=4`; applier `param_4=param_2+4; param_4++` |
| 0x90 | ≤4 | blob | `tail0` | `FUN_00610420(+0x90,1,0,2)` opaque/short read (low byte = a sub-mode/flag). Not consumed by the timer applier. | `Input` `FUN_00610420((int)param_1+0x90,1,0,2)` |
| 0x94 | 4 | u32 | `tail1` | trailing dword (target mode / context id — see note). | `Input` `*+0x1c` @ `param_1+0x94` |

**In-memory struct total = 0x98.** On the wire the `unitIds` array is packed to `unitCount` entries
(`get_length = 18 + 4*count`), so the 32-slot reservation is NOT transmitted.

### 1b. What the dispatch parser does on receipt (`FUN_004be8c0`→`FUN_004be7c0`)

```c
// FUN_004be8c0(client, body, modeArg)
if (client[0x126718] != 0 && modeArg != 0)        // tactical pool must be active
   FUN_004be7c0(body[0]/*base*/, body[1]/*len*/, body+4/*ids*/, body[3]&0xff /*count*/);
// FUN_004be7c0: for each id -> entity = FUN_004c7cd0(client+0x126718, id, 1,...);
//   t = (base + len) - FUN_004c53b0();   // global-clock delta = move/mode timer
//   entity[0x5c0] = t;  entity[0x5bc] = t;   // stamps a pending-action timer ONLY
```

So **CommandChangeMode by itself only stamps a per-ship timer on the local tactical pool** (exactly like
Warp/Sortie). It does **NOT** itself enter the battle. The authoritative mode transition is the
**server's `NotifyChangeMode 0x42f`** broadcast (§2) — that is what actually populates the field and flips
the client into a controllable tactical battle. `0x411` is the *request*; `0x42f` is the *grant*.

> **Confidence:** body offsets 0x00/0x04/0x0c/0x10 = **high** (parser + applier agree, count drives the
> loop). 0x90/0x94 `tail0/tail1` meaning = **medium** (read by Input but ignored by the timer applier; the
> echo handler copies the whole 0x98 struct, see §1c). `tail1`/`tail0` most likely carry the **requested
> mode id / sub-mode** but no client code branches on them in the timer path — a live capture would pin it.

### 1c. Client echo handler (case 0x411 in `FUN_004ba2b0`)

On the S→C "OK" echo, `case 0x411` logs `"CommandChangeMode OK"` and copies **0x26=38 dwords (152B = the
full 0x98 struct)** into global `DAT_004335fc`. Pure bookkeeping of the last mode request; the real state
change comes through `0x42f`.

---

## 2. NotifyChangeMode `0x042f` — THE AUTHORITATIVE MODE-TRANSITION (S→C) ★ KEY

This is the message the server sends to **put the client into a controllable tactical battle** (or back
out). It carries the **battle field id, the participant list, and every participant's spawn pose**.

- **Dispatch** (`FUN_004b8b00`): `*param_4 = 0x298` (664B in-memory struct).
- **Wire parser (Input)**: `Input_NotifyChangeMode::input_from_stream` = **`FUN_004a79b0`** @0x004a79b0.
- **Client handler**: `case 0x42f` in `FUN_004ba2b0` — copies **0xa6=166 dwords (664B = 0x298)** into
  global `DAT_00433694`, then calls the **applier `FUN_004c1c30`** @0x004c1c30.

### 2a. Body layout (0x298 = 664B)

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `field0` | header dword (cookie / sequence). | `Input` `*+0x1c` @ `param_1` |
| 0x04 | ≤4 | blob | **`modeKind`** | `FUN_00610420(+4,1,0,2)` blob; **low byte = the battle/mode kind** (4/5/6/7 — see §2c). Passed to `FUN_004c1d20` as `param_6`. | `Input` `FUN_00610420(param_1+4,...)`; applier `*(u8)(puVar3+1)` |
| 0x08 | 4 | u32 | **`fieldOwnerId`** | the field/lead reference; resolved with **mode 0** (`FUN_004c7cd0(pool,id,0,…)`) — the anchor ship/base the offsets are relative to. | `Input` `*+0x1c` @ `param_1+8`; applier `FUN_004c7cd0(...,param_2[2],0,...)` |
| 0x0c | 1 | u8 | **`unitCount`** | number of participant pose entries (1..32). | `Input` `*+0x24`; applier loop `*(byte*)(puVar3+3)` |
| 0x0d | 3 | — | pad | high bytes of dword 3. | |
| 0x10 | 20×N | struct[] | **`participants`** | per-ship spawn-pose array, stride **0x14 (20B / 5 dwords)**. Identical shape to MoveShip per-unit entry. See §2b. | `Input` loop `iVar3+=0x14`; applier `puVar2+=5` |
| 0x290 | 4 | u32 | **`tail0`** | written to new-field obj `+0x40` (battle/camera/turn param). | `Input` `*+0x1c` @ `+0x290`; applier `*(iVar5+0x40)=puVar3[0xa4]` |
| 0x294 | 4 | u32 | **`tail1`** | written to new-field obj `+0x44`. | `Input` `*+0x1c` @ `+0x294`; applier `*(iVar5+0x44)=puVar3[0xa5]` |

**Body total = 0x298 = 664.** (16 header + 32×20 max participants = 656 + 8 tail = 664.) Wire-packed to
`unitCount` participants.

### 2b. Participant pose entry (20B / 5 dwords) — same shape as MoveShip

| Entry off | Dword | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| +0x00 | 0 | u32 | **`shipId`** | participant ship/unit id; resolved with mode 1 (`FUN_004c7cd0(pool,id,1,…)`). | `Input` `*+0x1c` @ entry+0; applier `puVar2[4]` |
| +0x04 | 1 | f32 | **`heading`** | spawn facing (Y-yaw radians). → placement `param_4`. | `Input` `*+0xc` @ entry+0x04; applier `puVar2[5]`→`FUN_004c1d20 param_4` |
| +0x08 | 2 | f32 | **`x`** | spawn X (world units, continuous). → placement `param_2`. | `Input` `*+0xc` @ entry+0x08; applier `puVar2[6]`→`param_2`; placed to `entity+0x14` |
| +0x0c | 3 | f32 | **`z`** | spawn Z. → placement `param_3`. | `Input` `*+0xc` @ entry+0x0c; applier `puVar2[7]`→`param_3`; placed to `entity+0x1c` |
| +0x10 | 4 | f32 | **`y`** | spawn Y / vertical (≈0 in 2D battle plane). | `Input` `*+0xc` @ entry+0x10 (5th float; not used by `FUN_004c1d20`, parallels MoveShip Y) |

> Note: `Input_NotifyChangeMode` reads the SAME 1×u32 + 4×f32 entry as `Input_CommandMoveShip`
> (`FUN_0049a5d0`); the applier `FUN_004c1c30` consumes dwords 0,4,5,6 (`shipId, x, z, heading`). Entry
> dword 4 (`y`) is parsed but the placement helper takes only x/z/heading, so `y` is **medium** confidence
> (vertical, ≈0 in the battle plane).

### 2c. Applier `FUN_004c1c30` → `FUN_004c1d20` (what entering the battle DOES)

```c
// FUN_004c1c30(client, body)
if (client[0x126718] == 0) return;                 // tactical pool must already be allocated
anchor = FUN_004c7cd0(client+0x126718, body.fieldOwnerId, 0, ...);  // resolve field anchor
for (i=0; i < body.unitCount; i++) {
   ship = FUN_004c7cd0(client+0x126718, entry[i].shipId, 1, ...);
   if (ship) {
      FUN_004c1d20(ship, entry[i].x, entry[i].z, entry[i].heading, anchor, body.modeKind&0xff);
      if (ship[9] == 0) {                          // first-time placement
         newObj = FUN_004c8440(FUN_004b5c00());    // allocate a field/turn object
         newObj[0x40] = body.tail0;  newObj[0x44] = body.tail1;
      }
   }
}
```

`FUN_004c1d20(ship, x, z, heading, anchor, modeKind)` (per-ship spawn) — `modeKind` selects the battle
sub-state written to `ship+0x5c4`:

| `modeKind` (off 0x04 low byte) | `ship+0x5c4` | meaning (best-effort) |
|---|---|---|
| 4 or 6 | 0 | normal tactical engage |
| 5 | 5 | (variant — e.g. evac/retreat mode) |
| 7 | 6 | (variant — e.g. air/landing mode) |

…then writes the ship's authoritative world pose: `ship+0x14 = x`, `ship+0x1c = z`,
`ship+0x24 = heading`, and a relative offset from the anchor `ship+0x50 = x - anchor.x`,
`ship+0x58 = z - anchor.z`. So **NotifyChangeMode literally seeds every battle ship's position/facing in
the same continuous float XZ space as NotifyMovedShip 0x423** and ties them to the field anchor.

> **Confidence:** layout/offsets = **high**; the exact gameplay meaning of `modeKind` values 4/5/6/7 and
> `tail0/tail1` (obj+0x40/+0x44 — likely turn/clock or camera) = **medium** (mapping read directly, but
> the named meaning is inferred). The `modeKind` low byte at off 0x04 is the field that distinguishes
> *which* tactical mode the battle enters.

---

## 3. The battle-mode FSM (how the client becomes a controllable tactical battle)

State lives on the client/global object (`DAT_007ccffc` base, here `client`):

| Field | Meaning | Set by |
|---|---|---|
| `client+0x126710` | **current mode word** = `(modeKind<<8) | 1` when a field is active, `0` when none. | `FUN_004c45f0` |
| `client+0x126714` | active field id. | `FUN_004c45f0` (=`fieldId` arg) |
| `client+0x126718` | **tactical entity pool** (≈0x5fc77 dwords ≈ 1.5 MB); byte[0] = "tactical active" flag. | `FUN_004c45f0(...,modeKind=0)` zeroes+activates it |
| `client+0x2a58f8` | **strategic grid pool** (≈0x6959 dwords); byte[0] = "strategic active". | `FUN_004c45f0(...,modeKind=2)` |

**Allocator `FUN_004c45f0(client, fieldId, modeKind)`** @0x004c45f0:
- `modeKind == 0` → zero + activate the **tactical battle pool** `client+0x126718`, set
  `client+0x126710 = 0x001` (`(0<<8)|1`), `client+0x126714 = fieldId`. **← this is "enter tactical".**
- `modeKind == 2` → zero + activate the **strategic grid pool** `client+0x2a58f8`. **← "enter strategic".**
- `modeKind == 1` → already-in-mode (log only).

**FieldMake `FUN_004b64c0`** @0x004b64c0 (the actual 3D tactical-grid builder, gated on
`client+0x126711` mode state) is driven each frame from the **MainLoop `FUN_004e96f0`** →
`FUN_004b68f0` (boot/field state advancer) once the tactical pool is active. It calls
`FUN_004be440/004be520/004be4d0` (per-unit tactical model setup over up to 600 unit slots, stride 0x9ec)
to materialize the on-screen battle from the pool that NotifyChangeMode populated.

**Teardown / re-sync `FUN_004c2a80(client, param)`** @0x004c2a80: on `param==0` (mode 0 → leave battle)
it zeroes the tactical pool, the strategic pool, and the world buffers (back to strategic). It is invoked
from `FUN_004ba2b0` (e.g. `case 0xb0a NotifyEnterGridEnd` → `FUN_004c2a80(1); FUN_004c32a0(1)`).

### FSM summary (the space-war loop)

```
   STRATEGIC MAP                                            TACTICAL BATTLE
   (client+0x2a58f8 active,                                 (client+0x126718 active,
    client+0x126710 = (2<<8)|1)                              client+0x126710 = (0<<8)|1)
          |                                                          ^
          |  player issues engage  -- C->S 0x0411 CommandChangeMode  |
          |  (ids of fleets, requested mode)                         |
          v                                                          |
   server validates engagement, builds battle field, picks spawns    |
          |                                                          |
          |  S->C 0x042f NotifyChangeMode  (modeKind=0, fieldOwnerId, |
          |   participants[]={shipId,x,z,heading,y}, tail0/tail1) ----+
          v                                                          |
   FUN_004c1c30 seeds every ship's pose into client+0x126718,        |
   FUN_004c45f0(.,fieldId,0) activates tactical pool,                |
   MainLoop FUN_004e96f0 -> FUN_004b68f0 -> FieldMake FUN_004b64c0   |
   builds the 3D grid  =====>  CONTROLLABLE TACTICAL BATTLE  --------+
          ^                                                          |
          |  battle ends / retreat -- S->C 0x042f (modeKind back) or  |
          |  NotifyEnterGridEnd 0xb0a -> FUN_004c2a80(0) tears down ---+
          |  back to strategic
```

---

## 4. CommandTurnShip `0x0401` (C→S) — turn-in-place sibling of MoveShip

- **Dispatch**: `*param_4 = 0x114` (276B struct); calls **`FUN_004bef70(body, 1)`**.
- **Wire parser**: `Input_CommandTurnShip::input_from_stream` = **`FUN_0049b040`** @0x0049b040.
- **Applier**: `FUN_004bef70` @0x004bef70 → `FUN_004be840` (timer path) / full-math path via
  `FUN_004c8110` + `FUN_004bf4c0` (same helpers as MoveShip).

### Body layout (struct 0x114 = 276B; wire packed to count)

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `base` | payload base/time anchor. | `Input` `*+0x1c` |
| 0x04 | 4 | u32 | `len` | payload length. | `Input` `*+0x1c` |
| 0x08 | 4 | u32 | `field8` | header slack. | `Input` `*+0x1c` |
| 0x0c | 1 | u8 | **`unitCount`** | unit count (1..32). | `Input` `*+0x24` |
| 0x0d | 3 | — | pad | | |
| 0x10 | 8×N | struct[] | **`unitEntries`** | per-unit, stride **8B (2 dwords)**: `{u32 shipId; f32 heading}`. | `Input` loop: `*+0x1c`@`iVar9-4` (id), `*+0xc`@`iVar9` (float); `iVar9+=8` |
| 0x110 | 4 | f32 | **`turnParam`** | trailing float (turn rate / arrival heading scalar). | `Input` `*+0xc` @ `param_1+0x110` |

**Per-unit entry = 8B**: `+0x00 u32 shipId`, `+0x04 f32 heading` (target facing, Y-yaw radians).
Total struct = 16 + 32×8 + 4 = 0x114. The applier writes `entity+0x62 = 3` (turn tag, vs MoveShip 2 /
parallel 4) and runs the same `FUN_004bf4c0` commit with `speed = 0x3f800000` (1.0f) and the per-unit
heading delta → a pure rotation, no translation.

> **Confidence: high** (parser is the MoveShip parser minus the position floats; applier confirms turn-tag).

---

## 5. CommandReverseShip `0x0403` (C→S) — reverse/back-off sibling

- **Dispatch**: `*param_4 = 0x114`; **`*param_3 = *param_2`** — **NO parser call**. The client only sets
  the size and relays (the inner is forwarded to the server as-is; no local apply).
- **Wire parser**: `Input_CommandReverseShip::input_from_stream` = **`FUN_0049xxxx`** (string
  `_INF:CommandReverseShip#` @0x00769b58; over-32 error @0x0076b204). Layout is the **TurnShip shape**
  (0x114 struct, 8B per-unit `{shipId, f32}`) — same `over than 32` guard and same 0x114 size.

### Body layout (struct 0x114 = 276B) — mirror of TurnShip

| Off | Size | Type | Field | Meaning |
|---|---|---|---|---|
| 0x00..0x0c | 13 | hdr+u8 | `base/len/field8/unitCount` | as TurnShip |
| 0x10 | 8×N | struct[] | `unitEntries` | `{u32 shipId; f32 heading}` (reverse target facing/amount) |
| 0x110 | 4 | f32 | `turnParam` | trailing float |

> **Confidence: medium-high.** Same dispatch size (0x114) and `over than 32` guard as TurnShip pin the
> shape; because the client relays without a local applier, the exact float semantics (reverse distance
> vs heading) are best confirmed against the server's TurnShip-family handler. Treat as the TurnShip
> layout with "reverse" intent.

---

## 6. CommandStop `0x040a` (C→S) — halt sibling

- **Dispatch**: `*param_4 = 0x114`; **`*param_3 = *param_2`** — **NO parser call** (relay, like Reverse).
- **Wire parser**: `Input_CommandStop::input_from_stream` (string `_INF:CommandStop#` @0x00769ef8). Same
  0x114 struct family.

### Body layout (struct 0x114 = 276B) — same family

| Off | Size | Type | Field | Meaning |
|---|---|---|---|---|
| 0x00..0x0c | 13 | hdr+u8 | `base/len/field8/unitCount` | header + count |
| 0x10 | 8×N | struct[] | `unitEntries` | `{u32 shipId; f32 param}` — for Stop the float is typically 0/ignored; the id list is what matters |
| 0x110 | 4 | f32 | `tail` | trailing float |

Semantics: cancel the moving/turning state for each `shipId` (clear `entity+0x18`/`+0x105` "moving"
flags, zero velocity). **Confidence: medium** (size/family confirmed; the client relays so the per-field
float role for Stop specifically is inferred — only the id list is semantically required).

---

## 7. CommandWarpShip `0x0404` (C→S) — tactical warp jump

- **Dispatch**: `*param_4 = 0x90`; calls **`FUN_004bfc40(body, 1)`** (shared with `0x405 CommandAttackShip`,
  `0x406 CommandShootShip` — all 0x98/0x90, all `FUN_004bfc40`).
- **Wire parser**: `Input_CommandWarpShip::input_from_stream` = **`FUN_0049c5a0`** @0x0049c5a0.
- **Applier**: `FUN_004bfc40` @0x004bfc40 (timer-stamp only on the local pool).

### Body layout (struct 0x90 = 144B; wire = fixed + 4*count)

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `base` | payload base/time anchor. | `Input` `*+0x1c` |
| 0x04 | 4 | u32 | `len` | payload length. | `Input` `*+0x1c` |
| 0x08 | 4 | u32 | `field8` | header slack. | `Input` `*+0x1c` |
| 0x0c | 1 | u8 | **`unitCount`** | unit count (1..32). | `Input` `*+0x24` |
| 0x0d | 3 | — | pad | | |
| 0x10 | 4×N | u32[] | **`unitIds`** | ship ids to warp (stride **4**). | `Input` loop `param_1+=4` |

**Struct total = 0x10 + 32×4 = 0x90.** Applier `FUN_004bfc40`: for each id, `entity[0x5c0]=entity[0x5bc]=
(base+len) - now` — i.e. **warp is a pure id-list command**: the *destination* is NOT in this body. The
server decides the warp target and broadcasts the result via **NotifyWarpedShip 0x425** (§8). The
client-side body just nominates which ships warp + a time anchor.

> **Confidence: high** for layout; the absence of a target in the C→S body (server picks/validates the
> jump) = **high** (parser only reads the id list).

---

## 8. NotifyWarpedShip `0x0425` (S→C) — authoritative warp result

- **Dispatch**: `*param_4 = 0x90`.
- **Wire parser**: `Input_NotifyWarpedShip::input_from_stream` = **`FUN_004a5cc0`** @0x004a5cc0
  (paired writer/handler `FUN_004a5e50`).

### Body layout (struct 0x90 = 144B)

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `field0` | header dword. | `Input` `*+0x1c` |
| 0x04 | 4 | u32 | `field4` | header dword. | `Input` `*+0x1c` |
| 0x08 | 4 | u32 | `field8` | header dword (likely time/seq). | `Input` `*+0x1c` |
| 0x0c | 2 | u16 | **`field0c`** | u16 (warp group / fleet ref). | `Input` `*+0x20` @ `+0xc` |
| 0x0e | 1 | u8 | **`unitCount`** | warped-ship count (1..32). | `Input` `*+0x24` @ `+0xe` |
| 0x0f | 1 | — | pad | | |
| 0x10 | 4×N | u32[] | **`unitIds`** | warped ship ids (stride **4**). | `Input` loop `param_1+=4` |

**Struct total = 0x10 + 32×4 = 0x90.** Note: like the command, the notify is **id-list-only** — it does
not carry an (x,z) destination inline. The actual post-warp positions arrive via the subsequent
**NotifyMovedShip 0x423** stream (or the field re-seed), with this notify marking *which* ships jumped and
triggering the warp VFX/state for them.

> **Confidence: high** for layout; the post-warp position delivery via 0x423 = **medium** (inferred from
> the absence of coords here + the 0x423 position stream being the only authoritative pose channel).

---

## 9. CommandSwitchMode `0x0b06` (C→S) — strategic↔tactical switch (grid layer)

- **Dispatch**: `*param_4 = 0x164` (356B struct); `*param_3 = *param_2` (relay, no local parser call in
  dispatch — server-driven).
- **Wire parser**: `Input_CommandSwitchMode::input_from_stream` = **`FUN_0044a880`** @0x0044a880.
- **Caps** (from error strings @0x00766904/0x00766958): `unit_size` max **70**, `move_character_size`
  max **10**.

### Body layout (struct 0x164 = 356B)

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `field0` | header dword. | `Input` `*+0x1c` |
| 0x04 | 4 | u32 | `field4` | header dword. | `Input` `*+0x1c` |
| 0x08 | 4 | u32 | `field8` | header dword. | `Input` `*+0x1c` |
| 0x0c | 2 | u16 | `field0c` | u16 (mode/flags). | `Input` `*+0x20` @ `+0xc` |
| 0x0e | 2 | — | pad | (struct aligns next u32 to 0x10) | |
| 0x10 | 4 | u32 | `field10` | u32. | `Input` `*+0x1c` @ `+0x10` |
| 0x14 | 2 | u16 | `field14` | u16. | `Input` `*+0x20` @ `+0x14` |
| 0x16 | 1 | u8 | **`unitCount`** | unit id count (1..70). | `Input` `*+0x24` @ `+0x16`; guard `< 0x47` |
| 0x17 | 1 | — | pad | | |
| 0x18 | 4×U | u32[] | **`unitIds`** | unit ids (stride **4**, up to 70 → 280B). | `Input` loop `iVar6=+0x18; +=4` |
| 0x130 | 4 | u32 | `tail0` | trailing u32. | `Input` `*+0x1c` @ `+0x130` |
| 0x134 | 4 | u32 | `tail1` | trailing u32. | `Input` `*+0x1c` @ `+0x134` |
| 0x138 | 1 | u8 | **`charCount`** | "move_character" id count (1..10). | `Input` `*+0x24` @ `+0x138`; guard `< 0xb` |
| 0x139 | 3 | — | pad | | |
| 0x13c | 4×C | u32[] | **`charIds`** | character ids (stride **4**, up to 10 → 40B). | `Input` loop `param_1=+0x13c; +=4` |

**Struct total = 0x18 + 70×4 (=0x130) + 8 + 1+3 + 10×4 = 0x164.** Confirmed against dispatch 0x164.

`CommandSwitchMode` is the **strategic-map grid-layer** switch (carries a set of unit ids + a set of
character ids that move together when toggling the view/mode), distinct from `ChangeMode 0x411` which is
the **per-ship tactical-combat** engage. The two coexist (the catalog: `0xb06` strategic vs tactical view;
`0x411` enters the battle field). **Confidence: high** for layout; the precise gameplay of the two id sets
(which units/characters carry across the switch) = **medium**.

---

## 10. Server response contract (what the authoritative server must do)

### CommandChangeMode 0x411 → engage tactical battle
1. **Validate**: the requesting account owns every `shipId` in `unitIds`; the target fleets are in
   contact (adjacent grid / in combat range); not already in a battle.
2. **Build the battle field**: allocate a field id; choose participant spawn poses (both sides), in the
   continuous float XZ space (same units as `NotifyMovedShip 0x423`).
3. **Grant**: broadcast **`NotifyChangeMode 0x42f`** to all participants with:
   - `modeKind` (off 0x04 low byte) = `0` for a normal tactical engage (4/6 map to `ship+0x5c4=0`),
   - `fieldOwnerId` (off 0x08) = the anchor ship/base id,
   - `participants[]` (off 0x10) = `{shipId, x, z, heading, y≈0}` for **every** ship on both sides,
   - `tail0/tail1` (off 0x290/0x294) = the field/turn params (battle clock / camera anchor).
   This is what flips clients into the controllable tactical battle (client allocates the pool, FieldMake
   builds the 3D grid, ships spawn at the given poses).
4. After 0x42f, drive the battle with the per-unit notifies (`0x423` move, `0x424` turn, `0x426` attacked,
   `0x425` warped, …) and end it with another `0x42f` (mode back) or `NotifyEnding 0x35a`.

### CommandTurnShip 0x401 / ReverseShip 0x403 / Stop 0x40a
- Parse the 8B-per-unit `{shipId, f32}` array. For **Turn**: set each ship's target heading; broadcast
  `NotifyTurnedShip 0x424`. For **Reverse**: apply a backward maneuver (target = behind current pose) and
  stream `0x423`/`0x424`. For **Stop**: clear the moving/turning state and zero velocity; optionally echo
  a `0x424` at the current heading. Ownership-check every id; clamp count to 32.

### CommandWarpShip 0x404 → NotifyWarpedShip 0x425
- Body is **id-list only** (no destination). Server **chooses/validates** the warp destination per ship
  (cooldown via the `base+len` time anchor, fuel, legal jump range), then broadcasts `NotifyWarpedShip
  0x425` (same id list) to trigger the warp on clients, followed by `NotifyMovedShip 0x423` with the new
  positions. Clamp count to 32; reject ids the account doesn't own.

### CommandSwitchMode 0xb06
- Strategic-layer view/mode switch carrying a unit-id set (≤70) and a character-id set (≤10). Validate
  ownership, apply the grid/mode change, and broadcast the resulting grid notifies (`0xb07
  NotifyMovedGrid`, `0xb09/0xb0a` enter-grid). Not a tactical-combat entry.

---

## 11. To-do — wire these into the authoritative engine

(Do NOT edit `src/server/*.mjs` from this RE pass — docs only. This is the implementation checklist.)

- [ ] **`buildNotifyChangeMode(fieldId, anchorId, modeKind, participants[], tail0, tail1)`** (S→C 0x42f):
      - `u32 field0`, `[modeKind byte + 3 pad]` @0x04, `u32 anchorId` @0x08, `u8 count` @0x0c (+3 pad),
        then `count` × `{u32 shipId; f32 heading; f32 x; f32 z; f32 y}` (20B) @0x10, `u32 tail0` @0x290,
        `u32 tail1` @0x294. Zero-pad to 0x298 OR emit wire-packed (count entries only) — **use packed**
        to match `Output_*::get_length` behavior; the dispatch 0x298 is the client's receive buffer.
      - `modeKind=0` for a standard tactical engage. Wrap as message32 `[u32 0][u16 0x042f][body]`.
- [ ] **`parseCommandChangeMode(body)`** (C→S 0x411): read `unitCount=body[12]`, `unitIds[]` @0x10
      (u32, stride 4, count). Ignore `base/len/field8` (header) for engage intent; capture `tail0/tail1`
      (@0x90/@0x94) opportunistically as the requested mode/context.
- [ ] **`parseCommandTurnShip / Reverse / Stop`** (0x401/0x403/0x40a, 0x114): `unitCount=body[12]`, then
      `count` × `{u32 shipId @+0; f32 heading @+4}` @0x10 stride 8; trailing `f32 @0x110`. Map to
      `applyShipTurn` (build `NotifyTurnedShip 0x424`); for Stop, clear move state.
- [ ] **`parseCommandWarpShip`** (0x404, 0x90): `unitCount=body[12]`, `unitIds[]` @0x10 (u32, stride 4).
      Server picks destinations → `buildNotifyWarpedShip(0x425)` (id list) + `NotifyMovedShip 0x423`.
- [ ] **`buildNotifyWarpedShip(ids[])`** (S→C 0x425, 0x90): `u32 field0/4/8`, `u16 @0xc`, `u8 count @0xe`,
      then `count` × `u32 id` @0x10.
- [ ] **`parseCommandSwitchMode`** (0xb06, 0x164): header dwords + `u16 @0xc/@0x14`, `unitCount=body[0x16]`
      (≤70) + `unitIds[]` @0x18; `tail0/tail1` @0x130/0x134; `charCount=body[0x138]` (≤10) + `charIds[]`
      @0x13c. Apply grid switch; broadcast grid notifies.
- [ ] **Battle-mode FSM (server side):** maintain a `BattleField { id, anchorId, participants:Map<shipId,
      pose>, modeKind }`. On 0x411 → create field + emit 0x42f to all participants. On battle end → emit
      0x42f (mode back) / `NotifyEnding 0x35a`. This is the server analog of the client's
      `client+0x126710/0x126718` mode state.
- [ ] **Endianness:** body fields LE; only the 2-byte inner code prefix is BE. Floats are IEEE-754 LE.
- [ ] **Validation:** clamp counts (32 for ship arrays, 70/10 for SwitchMode); reject NaN/Inf spawn
      floats; ownership-check every ship/char id.

---

## 12. Open questions

1. **`NotifyChangeMode.modeKind` (off 0x04) values 4/5/6/7 ↔ `ship+0x5c4` 0/5/6.** The mapping is read
   directly from `FUN_004c1d20`, but the *named* battle sub-mode (normal vs evac vs air/landing) is
   inferred. A live 0x42f capture entering each battle type would pin the enum.
2. **`NotifyChangeMode.tail0/tail1` (off 0x290/0x294 → field obj +0x40/+0x44).** Almost certainly the
   battle clock / turn counter or camera anchor; exact semantics need the consumer of obj+0x40/+0x44.
3. **`CommandChangeMode.tail0/tail1` (off 0x90/0x94).** Read by `Input` but ignored by the timer applier
   (the dispatch path only stamps timers). Likely the *requested* mode id / sub-mode the player chose; a
   capture of a real 0x411 confirms.
4. **Reverse 0x403 / Stop 0x40a float semantics.** Both relay without a local applier, so the per-unit
   float role (reverse distance vs heading; stop ignores it) is inferred from the TurnShip family shape.
5. **Warp destination channel.** Body 0x404/0x425 are id-list-only; the post-warp position is assumed to
   arrive via `NotifyMovedShip 0x423` (the only authoritative pose channel). Confirm with a capture that
   0x425 is immediately followed by 0x423 for the same ids.
6. **`CommandSwitchMode` two id sets.** The unit-id set (≤70) vs character-id set (≤10) — which entities
   "carry across" the strategic↔tactical view switch — is structurally clear but gameplay-uncertain.

---

### Evidence index (Ghidra addrs)
- `FUN_004b8b00` — inner message dispatch switch (sizes + parser routing for all codes above).
- `FUN_004ba2b0` — S→C notify handler/applier dispatch (cases 0x411 echo, 0x42f apply, mode FSM calls).
- **ChangeMode:** `FUN_004a01e0` Input_CommandChangeMode; `FUN_00496e40` Output get_length (`0x12+4*N`);
  `FUN_004a79b0` Input_NotifyChangeMode; `FUN_004be8c0`→`FUN_004be7c0` dispatch applier (timer stamp);
  `FUN_004c1c30` NotifyChangeMode applier (field seed); `FUN_004c1d20` per-ship spawn placement.
- **FSM:** `FUN_004c45f0` field allocator (modeKind 0=tactical/2=strategic); `FUN_004c2a80` teardown;
  `FUN_004b64c0` FieldMake (3D grid build); `FUN_004b68f0` field/boot state advancer; `FUN_004e96f0`
  MainLoop; `FUN_004be440/004be520/004be4d0` tactical unit-model setup; `FUN_004b5db0`/`FUN_004b5c00`
  battle clock/turn helpers.
- **Turn/Reverse/Stop:** `FUN_004bef70` TurnShip applier; `FUN_0049b040` Input_CommandTurnShip;
  `FUN_004be840` Turn timer path; strings `_INF:CommandReverseShip#` @0x00769b58,
  `_INF:CommandStop#` @0x00769ef8.
- **Warp:** `FUN_004bfc40` Warp/Attack/Shoot applier; `FUN_0049c5a0` Input_CommandWarpShip;
  `FUN_004a5cc0`/`FUN_004a5e50` NotifyWarpedShip I/O.
- **SwitchMode:** `FUN_0044a880` Input_CommandSwitchMode (caps 70 units / 10 chars).
- **Shared helpers:** `FUN_004c7cd0` tactical-pool entity lookup (mode 0=field/1=ship);
  `FUN_004c8110`/`FUN_004bf4c0` pose-resolve + move-commit (shared with MoveShip 0x400);
  `FUN_00610420` mtStreamInputBuffer read; `FUN_004c53b0` global clock/tick source.
- **Cross-check:** `FUN_0049a5d0` Input_CommandMoveShip (proves stream getter widths via the known
  MoveShip layout in `docs/logh7-moveship-wire.md`).
