# LOGH VII strategic-map input wire (`G7MTClient.exe`, static RE)

Maps the **strategic sector-map** input path (click → `CommandMoveGrid 0x0b01`) and the
server→client move notification (`NotifyMovedGrid 0x0b07`), so the authoritative server can
make a player's fleet controllable and propagate moves to all clients.

**Source export:** `E:/logh7-revival/.omo/ghidra/export/G7MTClient/`
(`functions.jsonl`, `strings.tsv`, `symbols.tsv`). Tool: `python -m tools.logh7_redex func <addr>`.

**Method:** static analysis only. Every claim cites a function address. Sizes are
**binary-proven** from the wire size-table `FUN_004b8b00` and the main dispatcher copy-loops in
`FUN_004ba2b0`. Field types from the stream vtable (`*+0x1c`=u32, `*+0x20`=u16, `*+0x24`=u8).

**Conventions used below**
- `clientBase` = `*DAT_007ccffc` (the client this-pointer). PLAYER_INFO array = `clientBase+0xc`,
  stride `0x370`, walk limit `0x80e7f` (`FUN_004beaa0`).
- conn3 framing (verified G172): S→C inner is message32 `[u32 0][u16 code][payload]`;
  C→S inner is raw `[u16 code][payload]`.

---

## 0. Executive summary (server-actionable)

1. **`0x0b01 CommandMoveGrid`** is **bidirectional**: the client SENDS it (36B) to order a fleet
   warp; the server ECHOES it back (36B) as the move ACK. The client's own-move ACK mutates **no**
   map state (`FUN_004bea90` is an empty stub) — it only releases the SelectGrid dialog FSM.
2. The visible fleet movement on every client is driven by **`0x0b07 NotifyMovedGrid` (580B)**,
   which the server broadcasts. Its consumer chain is
   `FUN_004ba2b0`(case 0xb07, copy 0x91 dw → `clientBase+0x437714`) → `FUN_004bee20` →
   `FUN_00517cd0` (enqueues deferred event `0x16`) → applied to the unit position table + PLAYER_INFO.
3. **The blocker is enablement, not the wire.** A click only issues `0x0b01` when the SelectGrid
   dialog (`FUN_00581c80`) can be opened, which requires (a) the strategic field is live
   (`clientBase+0x126710!=0` gridActive, `clientBase+0x126711==2` strategic mode,
   `clientBase+0x2a58f8!=0` world-active), and (b) a **selectable fleet object** the player owns
   exists on the sector grid and is linked into PLAYER_INFO. Today the server sends the sector map
   EMPTY, so there is nothing to select. See §1.
4. **`0x0b09/0x0b0a` grid-enter** on the strategic map calls `FUN_004c2a80(1)` (PLAYER_INFO rebuild,
   no world reset). It is the mechanism that links a character record to its grid-unit. After a
   `0x0b07` you do **not** need a `0x0b0a` to re-place a fleet — `0x0b07` mutates positions directly
   (§3). `0x0b0a` is only needed to (re)establish the PLAYER_INFO↔unit linkage (e.g. on first entry).

---

## 1. Click → `0x0b01` enablement gate checklist

The strategic UI is a table of ~80 dialog factories installed by `FUN_0058c750` into
`_DAT_00c9e2fc..` (e.g. `_DAT_00c9e3a8 = FUN_00581c80` = the **SelectGrid** factory). A click on a
sector cell that targets a movable fleet opens the SelectGrid dialog, which drives the warp.

### 1.1 The SelectGrid dialog (`FUN_00581c80`, label `s_SelectGrid_0078c784`)

Constructs a dialog object with sub-handlers (all confirmed in the factory body):
- `TARGET_GRID` (`FUN_00581f20`, `s_TARGET_GRID_0078bf80`) — destination cell picker.
- `TARGET_BASE_GRID` (`FUN_0058cc20`, `s_TARGET_BASE_GRID_0078bf6c`) — destination base/system picker.
- `SendWarpCommand` (vtable `PTR_FUN_00676aec`, `s_SendWarpCommand_0078c76c`) — transmits `0x0b01`.
- `GoReceive` / `ReceiveResult` — the response FSM, with the **code pair burned in**:
  `puVar2[10]=0xb07` (recv, dialog field `+0x28`) and `puVar2[0xb]=0xb01` (send, dialog field `+0x2c`).

The ReceiveResult update method `FUN_005751b0` polls the deferred event queue: event `0x16` for the
`0xb07` arrival (`+0x28`), event `0x17` for the `0x0b01` send-ack (`+0x2c`). Completion of the FSM
requires BOTH the `0x0b01` echo and the `0x0b07` notify.

### 1.2 Gates that must ALL hold for a click to issue `0x0b01`

| # | Gate (client state) | Read at | Set / populated by (server message) |
|---|---|---|---|
| G1 | **gridActive** `clientBase+0x126710 != 0` | `FUN_004beb30`, `FUN_004b64c0`, `FUN_004c2a80` | `FUN_004b64c0` FieldMake sets it once the field is built; world-load timing |
| G2 | **field mode** `clientBase+0x126711 == 2` (2=strategic, 0=battle, 1=encounter) | `FUN_004beb30`, `FUN_004b6840`, `FUN_004b68a0`, `FUN_004ba2b0` (0xb0a) | mode chosen by `FUN_004f3730(9)` (clamped 0..2) in `FUN_004b64c0`; strategic field via `FUN_004c8a10(mode 2)` |
| G3 | **world-active** `clientBase+0x2a58f8 != 0` | `FUN_004b6840` (mode-2 branch → `FUN_004c8ac0`), `FUN_004bee20`, `FUN_004beaa0` | set during world bring-up; required before any grid command/notify is processed |
| G4 | **a selectable fleet object on the sector grid** the player owns | cell grid `clientBase+0x2c03cc` (100×50) → object table `clientBase+0x2c1755` via `FUN_004c8b70(col,row)=cell*3+0x2c1755` | `0x0313` ResponseStaticInformationGridType (`+0x3f57d4`) + `0x0315` ResponseStaticInformationGrid (`+0x3f4448`) — **server sends EMPTY today** |
| G5 | **PLAYER_INFO ↔ unit linkage** for the player's own fleet | `FUN_004c2a80`: char array `clientBase+0x36a8b4` (count `+0x36a5dc`, stride `0xb5*4=0x2d4`); own char = `record[0]==*(clientBase+0x3584a0)`; flagship `char+0x24` matched against grid-unit list `clientBase+0x41a368` (count u16 `+0x41a364`, **stride 0x58=88B**) | char from `0x0323`; selected-char id from `0x0204`; units from `0x0325`; linkage pushed by `FUN_004c2c80` on `0x0b0a` (`FUN_004c2a80(1)`) |

**Why the live probe saw `gridActive(0x126718)=0`:** `0x126718` is the **tactical** pool, built only
in `mode==0` by `FieldMake FUN_004b64c0`. In strategic `mode==2` that pool is intentionally empty
(`FUN_004c2a80(0)` zeroes `0x5fc77` dwords there). The strategic field lives in the **cell/object
tables** (`0x2c03cc`/`0x2c1755`) + the **grid-unit list** (`0x41a368`), NOT `0x126718`. So the real
missing piece (G4+G5) is: the server has never placed the player's fleet as an object in
`0x2c1755`/`0x2c03cc` nor delivered the `0x0313`/`0x0315` map content with that fleet.

### 1.3 Server-actionable enablement sequence

To make a player's fleet clickable & movable:
1. Deliver real `0x0313` (grid-type/object table) + `0x0315` (cell grid, RLE) that include the
   player's fleet as an object at a cell. (Note G187: `0x0315` has a content-specific dispatch quirk
   — track separately; the cell grid can also arrive via the already-working bulk world content.)
2. Deliver `0x0325` ResponseInformationUnit containing the fleet's unit (id, position) — **proven to
   process** at the `0x0f02` push timing.
3. Ensure the player's `0x0323` character record has `flagship (char+0x24)` == that unit's id, and
   `0x0204` selects that character — so `FUN_004c2a80` links PLAYER_INFO to the unit (G5).
4. Drive a `0x0b0a NotifyEnterGridEnd` (1B) at strategic entry so `FUN_004c2a80(1)` runs the linkage
   while `clientBase+0x126711==2` (the `==2` branch in the `0xb0a` dispatcher).

---

## 2. `0x0b01 CommandMoveGrid` — 36-byte layout (C→S, echoed S→C)

**Size: 0x24 = 36 bytes**, proven: `FUN_004b8b00` case `0xb01` → `*param_4 = 0x24`.
**S→C echo (the move ACK)**: `FUN_004ba2b0` case `0xb01` copies **9 dwords (36B)** from `param_3`
into `clientBase+0x4376f0`, sets the result id from `param_3[2]` (offset 0x08), then calls
`FUN_004bea90` — **an empty stub** (`004bea90: return;`). So the client's own-move ACK changes no
map state; it only satisfies the SelectGrid FSM (`FUN_005751b0` matching `+0x2c==0xb01`).

The 36B buffer is assembled by the SelectGrid dialog from TARGET_GRID/TARGET_BASE_GRID selection
and sent by the `SendWarpCommand` object (vtable `PTR_FUN_00676aec`). The send path is an indirect
vtable call, so absolute field names are not all symbol-resolved in the export; layout below is the
9-dword frame proven by the size table + echo copy. Header dwords follow the family convention seen
across all command echoes in `FUN_004ba2b0` (`param_3[0]`=time/seq, `param_3[1]`/`[2]`=result/echo).

| offset | type | field | evidence / notes |
|---|---|---|---|
| 0x00 | u32 | time / sequence | family header; `FUN_004ba2b0` reads `param_3[0]` as the leading dword on every command |
| 0x04 | u32 | actor / sender char-or-fleet id | family header (`param_3[1]`); pairs with the player's own character |
| 0x08 | u32 | result / echo id | `FUN_004ba2b0` case 0xb01 `local_1c = param_3[2]` (the value compared by `FUN_005751b0 +0x2c`) |
| 0x0c | u32 | **unit / fleet id** (the grid-unit being warped) | the entity id; matches grid-unit list `0x41a368` records (id at rec+0) |
| 0x10 | u32 | **target / destination** (cell index or base/system id) | from TARGET_GRID (cell) or TARGET_BASE_GRID (base); cell index addresses `0x2c03cc` 100×50 |
| 0x14 | u32 | src cell / current grid (or route param) | second positional dword (see `0x0b07` unit pair, which is `[id, cell]`) |
| 0x18 | u32 | param / flags | warp option (e.g. parallel/formation flag, mirrors tactical `0x0402`) |
| 0x1c | u32 | param | reserved / route |
| 0x20 | u32 | param | reserved / route |

> Confidence: size & frame count are **binary-proven**; per-dword names at 0x0c..0x20 are
> **inferred** from the grid-unit record shape and the `0x0b07` reply (which pairs `[unitId, cell]`).
> A live capture of one real `0x0b01` send (or symbolizing `PTR_FUN_00676aec`'s send method) would
> pin 0x0c..0x20 exactly. **For server emulation the echo only needs to be byte-faithful**: store
> the inbound 36B and reflect it back as the ACK (the stub consumes nothing).

---

## 3. `0x0b07 NotifyMovedGrid` — 580-byte layout (S→C)

**Size: 0x244 = 580 bytes**, proven three ways:
- size table `FUN_004b8b00` case `0xb07` → `*param_4 = 0x244` (logs `>>>>NotifyMovedGrid`).
- main dispatcher `FUN_004ba2b0` case `0xb07` copies **0x91 dwords = 580B** from `param_3` into
  global `clientBase+0x437714`, logs `NotifyMovedGrid OK`, then calls `FUN_004bee20(clientBase+0x437714)`.
- binary parser `FUN_0044b460` + text parser `FUN_0044b600` (emit
  `[Input_NotifyMovedGrid::input_from_stream] unit_size[%d] is over than 70`).

### 3.1 Record layout (from parsers `FUN_0044b460` / `FUN_0044b600`)

| offset | type | field | evidence |
|---|---|---|---|
| 0x00 | u32 | dword0 (time / seq) | `FUN_0044b460` `(**+0x1c)(param_1)`; text `param_1[0]` |
| 0x04 | u32 | dword1 (result/echo id) | `(**+0x1c)(param_1+4)`; `FUN_004ba2b0` `local_1c=param_3[1]` |
| 0x08 | u32 | dword2 (mover / fleet id) | `(**+0x1c)(param_1+8)`; text `param_1[2]` |
| 0x0c | u32 | dword3 (target spot / dest) | `(**+0x1c)(param_1+0xc)`; text `param_1[3]` |
| 0x10 | u16 | half @0x10 (route/grid scalar) | `(**+0x20)(param_1+0x10)`; text `*(u16*)(param_1+4)` |
| 0x12 | u8 | **unit_count** (max 70) | `(**+0x24)(param_1+0x12)`; guard `bVar2 < 0x47` (70) else throw |
| 0x13 | u8 | pad | alignment to the 0x14 array |
| 0x14 | unit[unit_count] | **moved-unit array**, stride 8 | loop `param_1=+0x18; do{ read u32 @(p-4); read u32 @(p); p+=8 }` → entries begin at 0x14 |

**Unit array element (stride 8, starting 0x14):**

| rel | type | field |
|---|---|---|
| +0x00 | u32 | unit id (grid-unit id; matches `0x41a368` rec+0 and char flagship `char+0x24`) |
| +0x04 | u32 | cell / position (sector cell index into `0x2c03cc`, or packed pos) |

70 entries × 8B = 560B; array spans [0x14, 0x14+560 = 0x244 = 580]. Exact fit ⇒ the fixed header is
0x14 (20B) and the rest is the 70-slot unit table. Only the first `unit_count` slots are read; the
tail is zero-padded to keep the frame a fixed 580B.

### 3.2 What the client mutates from `0x0b07`

`FUN_004bee20(record)` gates on `clientBase+0x2a58f8 != 0` (world-active, G3), logs a warning if
`**(clientBase+8)==0`, then calls `FUN_00517cd0(0xb07, record)`. `FUN_00517cd0`:
- branches on scene FSM `*DAT_02215e2c` (1/2/3) and validates a sub-state via `FUN_0050cf40`;
- enqueues a **deferred event `0x16`** carrying the record (`FUN_00501e30(0x16, queue, record)`),
  which `FUN_005751b0` (the SelectGrid ReceiveResult update) is polling.

The position application follows the **PLAYER_INFO update pattern** (`FUN_004beaa0`, the sibling
applicator): walk PLAYER_INFO (`DAT_007ccffc+0xc`, stride `0x370`, limit `0x80e7f`), match a record by
entity id (`FUN_004b5b80()` vs `record+4`), then write the new position dwords into
`playerInfo+0x40` / `playerInfo+0x44`. For each unit in the `0x0b07` array, the client updates that
unit's cell in the object/cell tables and its PLAYER_INFO position, then the strategic renderer
(`FUN_004c8ac0`, reached from `FUN_004b6840` mode-2 branch) draws the fleet at the new cell.

> Net: a single `0x0b07` carrying `[unitId, newCell]` for the moved fleet (unit_count=1) is
> sufficient to relocate it on every client. Multi-unit moves (formations) fill more slots.

---

## 4. `0x0b09 / 0x0b0a` grid-enter semantics (strategic)

Both are **1 byte** (`FUN_004b8b00`: `0xb09`/`0xb0a` → `*param_4 = 1`; logs
`>>>>NotifyEnterGridBegin` / `>>>>NotifyEnterGridEnd`).

`FUN_004ba2b0`:
- **case 0xb09 `NotifyEnterGridBegin`**: `clientBase+0x36a5dc = 0` (reset char count),
  `clientBase+0x4376ec = payload[0]` (a begin-flag).
- **case 0xb0a `NotifyEnterGridEnd`**: `clientBase+0x4376ed = payload[0]`. Then **branch on mode
  `clientBase+0x126711`**:
  - `== 2` (strategic): if begin-flag `+0x4376ec == 0` → `FUN_004c2a80(1)` (PLAYER_INFO rebuild, **no**
    world reset); else set camera/zoom globals (`DAT_007ccffc[0x357e84]=0`, `+0x357e88=1.0f`, etc.).
  - `== 0` (battle): `FUN_004c2a80(1)` + `FUN_004c32a0(1)` (also imports the Base table).

`FUN_004c2a80(1)` (param_2=1, the no-reset path): walks the character array
`clientBase+0x36a8b4` (count `+0x36a5dc`, stride `0x2d4`), and for the **own** character
(`record[0]==*(clientBase+0x3584a0)`) finds the grid-unit whose id == `char+0x24` (flagship) in the
unit list `clientBase+0x41a368` (stride `0x58`), then `FUN_004c2c80(0, record)` pushes it into
PLAYER_INFO. Other characters → `FUN_004c2c80(2, record)`.

**Is `0x0b0a` needed after a `0x0b07`?** No. `0x0b07` mutates unit positions + PLAYER_INFO directly
(§3.2). `0x0b0a`→`FUN_004c2a80(1)` only **(re)builds the PLAYER_INFO↔unit linkage** — required at
strategic **entry** (to make the fleet selectable, gate G5) and after structural changes
(unit added/removed), not after an ordinary move.

---

## 5. Recommended server send-sequence: "player clicks → fleet moves → all clients see it"

Pre-req (one-time per player at strategic entry; see §1.3): sector map with the player's fleet as a
grid object (`0x0313`+`0x0315`), the unit (`0x0325`), char linkage (`0x0323`+`0x0204`), and a
`0x0b0a` so `FUN_004c2a80(1)` links PLAYER_INFO↔unit (gates G1–G5 satisfied → SelectGrid opens).

Then per move:

1. **Client A → server:** `0x0b01 CommandMoveGrid` (36B), raw inner `[u16 0x0b01][36B payload]`.
   Payload carries the warping unit id and destination cell/base (§2; for emulation, treat as opaque
   36B + parse `0x0c` = unit id, `0x10` = dest).
2. **Server → client A (ACK):** echo `0x0b01` (36B) re-wrapped as message32
   `[u32 0][u16 0x0b01][36B]`. Byte-faithful reflection is enough (consumer `FUN_004bea90` is a stub);
   it releases A's SelectGrid FSM (`FUN_005751b0` `+0x2c` match) and re-enables input.
3. **Server → ALL clients (incl. A):** `0x0b07 NotifyMovedGrid` (580B) message32
   `[u32 0][u16 0x0b07][580B]`. Build the 580B record (§3.1):
   - header: `dword0`=tick/seq, `dword1`=result id (echo A's), `dword2`=mover fleet id,
     `dword3`=dest spot, `half@0x10`=route scalar (0 ok), `u8@0x12`=`unit_count` (1 for a single fleet);
   - unit[0] = `{ u32 unitId, u32 newCell }`; remaining 69 slots zero; pad to 580B.
   Every client applies it via `FUN_004bee20`→`FUN_00517cd0` (event 0x16) and renders the fleet at
   `newCell`. This is the broadcast the existing relay (`createWorldRelay`, `RELAY_COMMAND_CODES`)
   already forwards — server just needs to translate the inbound `0x0b01` into the authoritative
   `0x0b07` for all observers (and the `0x0b01` echo for the mover).

**Minimal viable server logic:** on inbound `0x0b01` from conn3, (a) reflect `0x0b01` to the sender,
(b) compute the authoritative destination, (c) broadcast one `0x0b07` with `unit_count=1` carrying
`[fleetUnitId, destCell]` to every registered conn3. No `0x0b09/0x0b0a` needed per-move.

---

## 6. Open questions

1. **`0x0b01` payload dwords 0x0c–0x20 (§2)** are inferred, not symbol-pinned. To make the SERVER
   correctly read the player's chosen destination (vs. just echoing), capture one real `0x0b01` send
   live, or symbolize the `SendWarpCommand` send method behind vtable `PTR_FUN_00676aec`.
2. **`0x0b07` unit element pos field (§3.1, +0x04):** confirmed a u32, but whether it is a raw cell
   index into `0x2c03cc` or a packed (col,row)/float position needs a live `0x0b07` capture to
   disambiguate from the PLAYER_INFO `+0x40/+0x44` float pair written by `FUN_004beaa0`.
3. **Sector-object record format (gate G4):** the per-object record in `0x2c1755` (3B/object) plus the
   `0x0313`/`0x0315` content that places the player's fleet as a selectable object is still TBD —
   this is the remaining data-model reconstruction blocking controllability (best done with a live
   client). `0x0315` also has the unresolved content-specific dispatch quirk (roadmap G187).
4. **`half@0x10` and `dword3` in `0x0b07`:** named "route scalar" / "dest spot" by position; the
   labeled `_INF:NotifyMovedGrid#` dump serializer (string @0x00766a64) is **not compiled** into the
   client (server-side only), so field names are not recoverable from this binary.

---

## Key functions (addresses)

| addr | role |
|---|---|
| `FUN_00581c80` | SelectGrid dialog factory (send=0xb01 @+0x2c, recv=0xb07 @+0x28); SendWarpCommand + ReceiveResult |
| `FUN_0058c750` | installs ~80 strategic dialog factories into `_DAT_00c9e2fc..` (`_DAT_00c9e3a8`=SelectGrid) |
| `FUN_005751b0` | ReceiveResult FSM update: polls event 0x16 (0xb07) / 0x17 (0xb01 ack) |
| `FUN_004b8b00` | wire size table: 0xb01→0x24, 0xb07→0x244, 0xb09/0xb0a→1, 0xb00→0x20, 0xb0b→0x44 … |
| `FUN_004ba2b0` | main dispatcher: case 0xb01 (copy 9dw→`+0x4376f0`, `FUN_004bea90`), case 0xb07 (copy 0x91dw→`+0x437714`, `FUN_004bee20`), case 0xb0a (`FUN_004c2a80(1)`) |
| `FUN_004bea90` | 0xb01 own-move ACK consumer — **empty stub** |
| `FUN_004bee20` | 0xb07 entry: gate `+0x2a58f8`, → `FUN_00517cd0(0xb07,rec)` |
| `FUN_00517cd0` | 0xb07 deferred dispatch: scene FSM `*DAT_02215e2c`, enqueue event 0x16 (`FUN_00501e30`) |
| `FUN_0044b460` / `FUN_0044b600` | 0xb07 binary / text parsers (header 0x14 + 70×8 unit array) |
| `FUN_004beaa0` | PLAYER_INFO position applicator (walk `+0xc` stride 0x370; write `+0x40/+0x44`) |
| `FUN_004c2a80` | grid-enter PLAYER_INFO rebuild (param=0 full reset incl. 0x126718; param=1 link-only) |
| `FUN_004c32a0` | Base-table world import (0xb0a battle path) |
| `FUN_004b64c0` | FieldMake: mode via `FUN_004f3730(9)`, sets `0x126710`/`0x126711`; builds tactical pool only mode 0 |
| `FUN_004b6840` / `FUN_004b68a0` | per-mode grid update (mode 2 → `FUN_004c8ac0` strategic render) |
| `FUN_004beb30` | grid tick: gate `0x126710!=0` && `0x126711!=0` |
| `FUN_004c8a10` | strategic field setup (mode 2) → `FUN_004c8bc0` value→position index |
| `FUN_004c8b70` | cell lookup `cell*3 + clientBase+0x2c1755` |

## Related docs / memory

- `docs/multiplayer-roadmap-2026-06-12.md` (In-world protocol map, Strategic-map data model).
- `docs/logh7-info-records-wire.md` (0x0323 char record incl. flagship `char+0x24`).
- Memory: `logh7-inworld-multiplayer-protocol`, `logh7-info-records-wire`,
  `logh7-character-record-schema`, `logh7-message-code-scheme`.
