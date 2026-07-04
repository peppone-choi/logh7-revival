# LOGH VII — CommandMoveShip / CommandParallelMoveShip wire layout (0x0400 / 0x0402)

Static RE of `G7MTClient.exe` (Ghidra index `.omo/ghidra/export/G7MTClient/`). Fully decodes the
1052-byte tactical ship-move command body so the authoritative server can parse target positions and
compute real movement. **No client/server launch — static only.**

All offsets below are **into the inner body** (the bytes AFTER the `[u16 BE code]` framing prefix).
The dispatcher (`FUN_004b8b00`) declares the body size for both codes as `*param_4 = 0x41c` = **1052
bytes**, and the parser receives a pointer to that body as `int *param_2` (so `param_2[N]` = body dword
N = body byte `N*4`). Evidence: dispatch reads unit count at `*(byte*)(param_2+3)` = body byte 12, and
the existing server parser already reads count at body @12 — they agree, proving `param_2` = raw body.

---

## 1. Dispatch (evidence: `FUN_004b8b00` @ 0x004b8b00)

```
case 0x400:  // CommandMoveShip
  log(">>>>CommandMoveShip"); *param_4 = 0x41c;          // body = 1052 bytes
  *param_3 = param_2[1] + *param_2;                       // = absolute payload tail ptr (base+len)
  FUN_004be8f0(param_2, 1);                               // parser, mode arg = 1
case 0x402:  // CommandParallelMoveShip
  *param_4 = 0x41c;                                       // body = 1052 bytes
  *param_3 = param_2[1] + *param_2;
  FUN_004bf320(param_2, 1);                               // parser (identical except formation tag)
case 0x401:  // CommandTurnShip (sibling, body 0x114) — FUN_004bef70
case 0x423:  // NotifyMovedShip  (S->C, 0x1c=28B)  — log only at dispatch; applied by world tick
case 0x424:  // NotifyTurnedShip (S->C, 0xc=12B)
```

`FUN_004be8f0` (0x0400) and `FUN_004bf320` (0x0402) are **byte-for-byte identical** except one tag:
`*(entity+0x62) = 2` (normal move) vs `= 4` (parallel/formation move). Same body layout, same position
math, same unit iteration. `0x0401 TurnShip` shares the unit-entry array shape but a smaller body.

> **Mode arg note.** The dispatcher calls the parser with `param_3 = 1`. In the parser the `param_3==0`
> branch runs the full position math (`FUN_004c8110`/`FUN_004bf4c0`); the `param_3!=0` branch only
> stamps a move timer (`entity+0x5c0/0x5bc`). On the **original client** the full-math branch is what
> matters for reconstructing intent. The server must parse the body the same way the `param_3==0`
> branch reads it (that is the only branch that consumes the target fields).

---

## 2. Body byte layout (1052 bytes, little-endian)

| Off (hex) | Off (dec) | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|---|
| 0x00 | 0 | 4 | u32/ptr | `base` | payload base ptr/cookie. `base+len` = tail. | `param_2[0]`; `*param_3 = param_2[1]+*param_2` |
| 0x04 | 4 | 4 | u32 | `len` | payload length used with base. Also `FUN_004bf4c0` arg3 = `base+len` (a context/time anchor). | `param_2[1]` |
| 0x08 | 8 | 4 | u32 | `field8` | unused by move math (header slack). | not read in math branch |
| 0x0c | 12 | 1 | u8 | **`unitCount`** | number of unit entries (1..32). | `*(byte*)(param_2+3)`; loop bound |
| 0x0d | 13 | 3 | — | pad | high 3 bytes of dword 3 (unused). | dword read but only low byte used |
| 0x10 | 16 | 20×N | struct[] | **`unitEntries`** | per-unit array, stride **20 bytes (5 dwords)**. See §3. | `piVar4 = param_2+4`; `piVar4 += 5` |
| … | … | … | — | (entries occupy 16 … 16+20*unitCount; max 32 → up to 656B) | | |
| 0x290 | 656 | 4 | f32 | **`speed`** | move speed / velocity scalar. → `entity[0x107]=speed`, `entity[0x106]=speed*entity[0x108]`. | `param_2[0xa4]` → `FUN_004bf4c0` arg `param_4` |
| 0x294 | 660 | 4 | f32 | **`arrivalHeading`** | final facing angle (radians, Y-axis yaw) applied on arrival; default for formation slots. | `param_2[0xa5]` → arg `param_8` |
| 0x298 | 664 | 1 | u8 | **`formationCount`** | formation member count minus 1 (`entity[0x43]=formationCount+1`). 0 = single ship. | `param_2[0xa6]` → arg `param_6` |
| 0x299 | 665 | 3 | — | pad | high bytes of dword 0xa6. | |
| 0x29c | 668 | 12×M | f32[3][] | **`formationOffsets`** | formation slot table, stride **12 bytes (3 floats)**, `formationCount` entries. Slot = (dx, ?, dz) relative offsets; the parser reads `[off+0]→x`, `[off+8]→z`. | `param_2+0xa7` → arg `param_7`; `pfVar5=(param_7+4)`, `+=3` |
| … | … | … | — | formation table runs from 668 up to body end (1052). Capacity ≈ (1052−668)/12 ≈ 32 slots. | | |

**Body total = 1052 = 0x41c.** Header (16) + max units (32×20=640) + speed/heading/count (12) +
formation table (≈384) ≈ 1052. The fixed size means unused unit/formation slots are zero-padded.

---

## 3. Per-unit entry (20 bytes / 5 dwords) — evidence `FUN_004c8110` @ 0x004c8110

`FUN_004be8f0` calls `FUN_004c8110(unitArrayPtr, 0, unitCount, &outPose, 0)`. With `param_1 != 0`
(unit-array pointer), it reads the lead pose from entry+offsets, then walks each entry with stride 5
dwords copying 5 floats into a scratch pose buffer. Per-entry field map:

| Entry off | Dword | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| +0x00 | 0 | u32 | **`shipId`** | unit/ship id (matched via `FUN_004c7cd0(pool, id, 1, …)`). | `*piVar4` lookup arg; existing server `unitIds` |
| +0x04 | 1 | f32 | **`heading`** | per-unit target heading (Y-axis yaw, radians). → pose slot `param_4[4]`. | `param_4[4] = *(param_1+4)` |
| +0x08 | 2 | f32 | **`targetX`** | target X (world units, continuous). → pose slot `param_4[0]`. | `*param_4 = *(param_1+8)` |
| +0x0c | 3 | f32 | **`targetZ`** | target Z (world units, continuous). → pose slot `param_4[2]`. | `param_4[2] = *(param_1+0xc)` |
| +0x10 | 4 | f32 | **`targetY`** | target Y / vertical (≈0 in 2D battle plane). → pose slot `param_4[1]`. | `param_4[1] = *(param_1+0x10)` |

Pose convention (6-float `param_4`): `[X, Y, Z, 0, heading, 0]`. Movement is on the **XZ plane**;
`heading` is the rotation about the vertical (Y) axis — confirmed by the rotation matrix builder
`FUN_004b20b0(M, angle)` which writes only `cos/sin` into M[0],M[2],M[8],M[10] (a pure Y-yaw matrix),
and `FUN_004b26a0` is a standard 4×4 matrix·vector transform.

---

## 4. Position / movement math

Two helpers do the work; both operate in the **same continuous float XYZ space as NotifyMovedShip
0x0423** (whose dword3..5 are pos x,y,z floats). No grid quantization on the wire — these are raw world
coordinates.

### 4a. `FUN_004c8110` — resolve target pose(s)
- Builds an anchor pose from the entry array (lead ship) and a scratch list of per-unit poses
  (`local_280`, stride 5 floats).
- Final pass (`param_5==0`): for each unit, computes a delta `(targetX−anchorX, 0, targetZ−anchorZ)`,
  builds a Y-yaw matrix from the anchor heading (`FUN_004b20b0`), inverts/composes it
  (`FUN_004b1eb0`), and transforms the delta (`FUN_004b26a0`) into the ship's local frame, storing the
  result at `entity+0x44` (the ship's relative-move vector / matrix slot).
- Returns the lead heading; the caller passes this as `FUN_004bf4c0` arg `param_2`.

### 4b. `FUN_004bf4c0` — commit the move onto each entity
Args (from the parser): `(entity, leadHeading, base+len, speed=@0x290, &deltaPose, formationCount=@0x298,
formationOffsets=@0x29c, arrivalHeading=@0x294, entity[0x44], entity[0x4c])`.

Writes onto the entity struct (offsets in floats unless noted):
- `entity[0x17] = heading` (or current if 0), `entity[0x19] = base+len` (move-start time anchor).
- `entity[0x106] = speed * entity[0x108]`, `entity[0x107] = speed` → **velocity** (per-tick step).
- `entity[0x43] = formationCount+1` → number of formation members.
- `entity[0x44/0x45/0x46] = deltaPose.x / 0 / deltaPose.z` → **target waypoint (local)**.
- `*(u8)(entity+0x18)=1`, `*(u8)(entity+0x105)=1` → "moving" flags; `entity[0x104]=0` (progress reset).
- Formation members: loops `formationCount` slots, each from `formationOffsets[i]` (stride 3 floats),
  computing a per-member heading via `atan2`-like `FUN_005ff4f0(dx,dz)` and accumulating member target
  positions at `entity+0x45…` (so formation members are placed relative to the lead's waypoint).

**Net effect:** the command sets each commanded ship's **target waypoint + heading + speed**; the
world tick then **interpolates** the ship toward the waypoint each frame (this is why `entity[0x106/107]`
is a per-tick velocity and `entity[0x104]` is a progress accumulator — NOT a teleport).

### Coordinate system summary
- Continuous world floats, XZ ground plane, Y vertical (~0 in battle). Heading = radians, Y-axis yaw.
- **Identical space to NotifyMovedShip 0x0423** `dword3..5 = (x,y,z)`. A server that parses
  `(targetX, targetY, targetZ, heading)` from the command can emit 0x0423 in the same units directly.

---

## 5. Server response contract (what the original server does with a 0x0400)

The moving client does **NOT** apply the move purely locally and wait — it sets the target locally
(the `param_3==1` dispatch branch stamps the move timer) but the AUTHORITATIVE position stream that
all clients (including the mover, for correction) render is the server's notify stream:

- **NotifyMovedShip `0x0423`** (28B, `dword1=shipId`, `dword3..5 = x,y,z float`): the per-tick (or
  on-arrival) authoritative position. The world tick consumer applies this to the entity's position
  (`entity+0x14` region) — same float space as the command targets. Emit one per moved ship; for a
  smooth move, stream these per tick along the interpolated path, or send a single final-position
  0x0423 and let the client interpolate from its locally-set waypoint (the client supports both since
  it computes velocity from `speed`).
- **NotifyTurnedShip `0x0424`** (12B, `dword1=shipId`): emitted when a ship changes facing
  (turn-in-place or arrival heading). Pair with 0x0423 when the move includes a heading change.
- For a **formation move (0x0402)**, emit the per-member 0x0423/0x0424 for every ship in the unit
  list (the lead plus the `formationCount` members at their offset slots).

**Tick model:** continuous interpolation toward the waypoint at `speed` (velocity), not a single
teleport. The client renders the server's 0x0423 position; if the server only sends start+end, the
client interpolates using the `speed` it parsed from the command. Authoritative server should drive
the interpolation server-side and stream 0x0423 so all clients stay in sync (and to be anti-cheat
authoritative on final positions).

---

## 6. CommandParallelMoveShip 0x0402 differences

- Same 1052-byte body, **same field layout** as 0x0400 (parser `FUN_004bf320` is identical to
  `FUN_004be8f0` except `entity+0x62 = 4` vs `2`).
- Semantically: 0x0400 = each ship moves to its own per-entry target; 0x0402 = **formation move** where
  ships hold the formation offset table (`@0x29c`) relative to the lead's waypoint. The `formationCount`
  (@0x298) and `formationOffsets` (@0x29c) fields are the formation geometry — populated for 0x0402,
  typically zero/single for 0x0400 single-ship moves. Both run the identical `FUN_004c8110`/
  `FUN_004bf4c0` math, so a single server parser handles both; only the `move kind` tag differs.

---

## 7. Checklist — upgrade `parseInboundMoveShip` to full authoritative movement

(Do NOT edit `src/server/logh7-command-engine.mjs` from this RE pass — docs only. This is the to-do.)

- [ ] **Header.** Read `unitCount = body.readUInt8(12)`; clamp 1..32 (already done). Bytes 0..11 are a
      base/len/slack header not needed for movement (keep ignoring).
- [ ] **Per-unit entries** @16, stride 20: for each `i`:
      - `shipId  = body.readUInt32LE(16 + i*20 + 0)`  (already parsed)
      - `heading = body.readFloatLE (16 + i*20 + 4)`  ← NEW (Y-yaw radians)
      - `targetX = body.readFloatLE (16 + i*20 + 8)`  ← NEW
      - `targetZ = body.readFloatLE (16 + i*20 + 12)` ← NEW
      - `targetY = body.readFloatLE (16 + i*20 + 16)` ← NEW (≈0)
- [ ] **Trailing move params** (fixed offsets, independent of unitCount):
      - `speed          = body.readFloatLE(0x290)` (656)
      - `arrivalHeading = body.readFloatLE(0x294)` (660)
      - `formationCount = body.readUInt8 (0x298)` (664)
      - `formationOffsets[]` @0x29c (668), stride 12 (3 floats: dx, _, dz), `formationCount` entries —
        only needed for full 0x0402 formation reconstruction.
- [ ] **Return shape:** extend to `{ count, units: [{ shipId, x: targetX, y: targetY, z: targetZ,
      heading }], speed, arrivalHeading, formation: { count, offsets } }`.
- [ ] **Apply authoritatively:** for each unit call `applyShipMove(state, { shipId, x, y, z })` and,
      when `heading` differs, `applyShipTurn(state, { shipId, heading })`. These already mutate state +
      build `NotifyMovedShip 0x0423` / `NotifyTurnedShip 0x0424` in the right (identical) float space.
- [ ] **Replace the relay path:** in `processCommand` for `0x0400/0x0402`, stop wrapping the raw inner
      (`wrapRawInnerAsMessage32(inner)`) and instead emit the server-built `0x0423`(+`0x0424`) notifies
      from the parsed targets → fully authoritative movement (server decides final positions).
- [ ] **Tick/interpolation (optional, for smoothness/anti-cheat):** drive server-side interpolation
      toward the waypoint at `speed` and stream `0x0423` per tick; or send a single arrival `0x0423`
      and rely on client-side interpolation from `speed`. Either matches the client's velocity model.
- [ ] **0x0402 formation:** emit `0x0423/0x0424` for the lead AND each formation member (lead waypoint
      + per-slot offset from `formationOffsets`).
- [ ] **Endianness:** body fields are **little-endian** (Intel client). Only the 2-byte inner code
      prefix is big-endian; the body floats/ints are LE.
- [ ] **Validation already present:** keep `count 1..32` + ownership check; add a sanity clamp on
      target coordinates (reject NaN/Inf floats) before applying.

---

## 8. Open questions

1. **Entry dword4 (+0x10) exact role.** Mapped to pose slot `param_4[1]` (the middle/Y slot) — almost
   certainly vertical Y (≈0 in the 2D battle plane), but a live capture of a real 0x0400 would confirm
   whether it's Y, a per-unit flag, or a speed override. Static evidence only places it as the 5th
   float copied into the pose buffer.
2. **`speed` (@0x290) units.** It scales `entity[0x108]` to produce per-tick velocity; the absolute
   unit (world-units/tick vs a normalized 0..1) isn't pinned without a capture or the tick stepper
   (`FUN_004b6e00`) constants. For server interpolation, replaying the same per-tick formula is safest.
3. **Header dwords 0/1 (base/len).** Used as `base+len` = a context/time anchor inside `FUN_004bf4c0`
   (`entity[0x19]`). On the wire from the client these are likely a serialized pointer/length pair the
   server can ignore for movement; confirm they carry no target data with a capture.
4. **Formation offset slot middle float.** `formationOffsets[i]` reads `[+0]`→x and `[+8]`→z; the
   `[+4]` middle float's meaning (vertical or unused) is unconfirmed.
5. **Per-tick vs single-shot 0x0423.** Both are client-supported; which the original server used (and
   the exact tick cadence) needs a live server capture — does not block the authoritative reimpl.

---

### Evidence index (Ghidra addrs)
- `FUN_004b8b00` — inner message dispatch switch (sizes, 0x400/0x402/0x423/0x424).
- `FUN_004be8f0` — CommandMoveShip 0x0400 parser.
- `FUN_004bf320` — CommandParallelMoveShip 0x0402 parser (identical, tag 4).
- `FUN_004bef70` / `FUN_004be840` — CommandTurnShip 0x0401 sibling (entry-array shape cross-check).
- `FUN_004c8110` — target-pose resolver (per-unit entry field offsets).
- `FUN_004bf4c0` — move commit onto entity (speed/heading/formation/waypoint writes).
- `FUN_004c7cd0` — entity lookup in tactical pool `client+0x126718` (mode 1 = active-ship table).
- `FUN_004b20b0` / `FUN_004b26a0` / `FUN_004b1eb0` — Y-yaw matrix build / mat·vec transform / inverse.
- `FUN_004c53b0` — global time/tick source (move timer base).
