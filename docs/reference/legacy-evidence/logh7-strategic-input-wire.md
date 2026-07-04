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
2. The server-visible fleet-move notification is **`0x0b07 NotifyMovedGrid` (580B)**,
   which the server broadcasts. Its confirmed client chain is
   `FUN_004ba2b0`(case 0xb07, copy 0x91 dw → `clientBase+0x437714`) → `FUN_004bee20` →
   `FUN_00517cd0` (enqueues deferred event `0x16`) → SelectGrid/result-node activity. Canonical
   live #82 proves transient SelectGrid state change only, not persistent unit/PLAYER_INFO/cell
   mutation or visible fleet-marker movement.
3. **The blocker is enablement, not the wire.** A click only issues `0x0b01` after the SelectGrid
   dialog (`FUN_00581c80`) is constructed. G1-G5 below are still prerequisites for a strategic
   fleet to be meaningful, but the 2026-06-20 rerun proves they are not sufficient: the current
   blocker is the HUD selection/category/command-row admission path in §1.2.1.
4. **`0x0b09/0x0b0a` grid-enter** on the strategic map calls `FUN_004c2a80(1)` (PLAYER_INFO rebuild,
   no world reset). It is the known mechanism that links a character record to its grid-unit.
   Whether an ordinary `0x0b07` must be followed by another rebuild/placement trigger for visible
   relocation is still open after live #82.

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

### 1.2.1 HUD command-admission gates (2026-06-20 RE addendum)

G1-G5 are still necessary, but the 2026-06-20 C002 rerun proved they are not sufficient. With
`LOGH_POSTLOAD_UNIT_STREAM_WIRE=1` and `LOGH_PLAYER_FOCUS_CELL=1`, the live client had
`unitCount=1`, `PLAYER_INFO` linkage, and `DAT_007cd04c+0x11178=2550` (`x=50,y=25`), yet natural
clicks still emitted no `0x0b01` and no `0x0b07`. Static RE narrows the remaining blocker to the
native HUD selection/action admission path:

| # | Gate (client state) | RE evidence | What to capture next |
|---|---|---|---|
| H1 | Current player/action payload is imported into the selection list | `FUN_004f68f0(selectionList,payload)` stores `payload` at `selectionList+0x628`, reads `payload+0x270`, and copies that count to `selectionList+0x620` (`listCount188`) | `payloadCount270`, `listCount188`, `listPayload18a` |
| H2 | A visible selection-list row is actually hit-tested | `FUN_004f6600` loops `i < listCount188`, tests row object pointers at `selectionList+(0x22+i)*4` and `selectionList+(0x32+i)*4` via `FUN_005015f0`, then writes `selectionList+0x624` (`listSelected189`) | row object gates, rects, `listSelected189` |
| H3 | HUD mode is the category-apply mode | `FUN_004fd100` only applies the category when `HUD+0xf4 == 2` and `HUD+0xab0` changed since the start of the tick | `hudModeF4`, `hudAb0`, `hudState14e0` |
| H4 | Category resolves from the selected payload slot | `FUN_004f6b00` returns `*(u16 *)(payload + 0x26c + (listCount - selectedIndex) * 8)` if `0 <= selectedIndex < 0x10`; otherwise `-1` | category value and payload slot bytes |
| H5 | Command menu row hit dispatches a factory | `FUN_004f5cb0` reads the static command table at `clientBase+0x3416d8`, builds command rows, and `FUN_004f58c0` maps a row hit to a factory id before calling `FUN_004f93c0(factory,category)` | command `rowCountD4`, `categoryD6`, row rects, selected row |

The SelectGrid factory is still `FUN_00581c80` (`factoryIndex=0x2b`), and its `ReceiveResult`
object still burns in the `0x0b01` send / `0x0b07` receive pair. The new conclusion is that C002 is
blocked *upstream of SelectGrid construction*: the client must first expose and hit a selection-list
row, resolve a command category, and dispatch a command row.

`tools/logh7_selectgrid_snapshot.py` now captures the H1-H5 fields without installing hooks:
`hudModeF4`, `hudState14e0`, `listSelected189`, selection row primary/secondary object gates and
rects, command row rects, and the runtime command table header. Use it immediately after a world
session click before trying new server records.

**Why the live probe saw `gridActive(0x126718)=0`:** `0x126718` is the **tactical** pool, built only
in `mode==0` by `FieldMake FUN_004b64c0`. In strategic `mode==2` that pool is intentionally empty
(`FUN_004c2a80(0)` zeroes `0x5fc77` dwords there). The strategic field lives in the **cell/object
tables** (`0x2c03cc`/`0x2c1755`) + the **grid-unit list** (`0x41a368`), NOT `0x126718`. This explains
the stale tactical-pool false lead; it is not the current primary blocker. The latest blocker is H1-H5
above: HUD selection-list import, row hit-test, category resolve, command row construction, and
factory dispatch.

### 1.3 Server-actionable enablement sequence

Historical prerequisite sequence, still required for data correctness but no longer enough by itself:
1. Deliver real `0x0313` (grid-type/object table) + `0x0315` (cell grid, RLE) that include the
   player's fleet as an object at a cell. (Note G187: `0x0315` has a content-specific dispatch quirk
   — track separately; the cell grid can also arrive via the already-working bulk world content.)
2. Deliver `0x0325` ResponseInformationUnit containing the fleet's unit (id, position) — **proven to
   process** at the `0x0f02` push timing.
3. Ensure the player's `0x0323` character record has `flagship (char+0x24)` == that unit's id, and
   `0x0204` selects that character — so `FUN_004c2a80` links PLAYER_INFO to the unit (G5).
4. Drive a `0x0b0a NotifyEnterGridEnd` (1B) at strategic entry so `FUN_004c2a80(1)` runs the linkage
   while `clientBase+0x126711==2` (the `==2` branch in the `0xb0a` dispatcher).

After this sequence, do not claim SelectGrid readiness until §1.2.1 H1-H5 are captured live. The
next evidence pass should snapshot HUD mode/category state and selection/command row objects.

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

> **★ LIVE RESOLUTION (2026-06-29, clean A/B, session `abc-live-20260629`).** The entry layout is
> **`@0x13 BIG-ENDIAN`** — settled by real client. A fresh session captured a single fleet-move
> `0x0b07` with the watcher attached BEFORE the probe fired (`bee20-enter=1`): the
> `clientBase+0x437714` record decoded to the server intent (`unitId=1`, `cell=2597 = 2588+9`) at
> `@0x13 BE`, while `@0x14 LE` gave garbage (`65536` / `2427392`). This **overturns the static
> reversal below** (which had argued "verbatim transport ⇒ `@0x14 LE`, the journal #82 capture was
> a confound"): even a clean capture is `@0x13 BE`. The data reaches the client correctly; the
> watcher now parses `@0x13 BE` (`layoutResolved=true`). The remaining open item is that the
> server builder writes `@0x14 LE` in-memory yet the client reads `@0x13 BE` — an unresolved
> server↔wire serialization detail (the on-wire frame evidently already carries `@0x13 BE` since
> the client decodes correctly, so no functional data loss; a byte-trace of the actual emitted
> frame would close it). `verdictCode = applied-transient-selectgrid-change`: data arrives, but
> only transient SelectGrid state changed — visible relocation remains unproven (per §3.2 / #84).
> The two-cycle reasoning below is preserved as history; the live verdict supersedes its conclusion.
>
> **Correction (2026-06-29, live #82 r2 vs runtime path).** The table above is derived from
> `FUN_0044b460` / `FUN_0044b600`, but those are a **separate serialization-registry** parser
> (`FUN_0044b1e0`, vtable `PTR_FUN_0066d09c`) that is **NOT on the 0x0b07 runtime path**. At runtime
> the body is raw-copied verbatim (`FUN_004ba2b0` case 0xb07 → `clientBase+0x437714`).
>
> **The runtime entry layout is currently UNRESOLVED**, reconciled across two cycles:
> - **Server + transport ⇒ `@0x14 little-endian` (leading hypothesis).** `buildNotifyMovedGridInner`
>   writes `count @0x12` then entries `@0x14 LE`. The message32 decipher `FUN_00645db0` `ntohs/ntohl`-
>   swaps **only the 8-byte outer transport header** (checksum/seq/len) and copies the message body
>   **raw** (dword loop + byte tail, no swap, no Feistel decrypt); `FUN_004ae0d0 → FUN_004b8850 /
>   FUN_004b8b00 (fixed 0x244) → FUN_004ba2b0` then raw-copies it. So client `param_3` == server
>   payload byte-for-byte, and a **clean** `clientBase+0x437714` record should read `@0x14 LE`.
> - **Journal #82 capture ⇒ `@0x13 big-endian`, but confounded.** The captured `clientBase+0x437714`
>   (`.omo/ui-explorer/0b07-location-watch-r2-20260629`, read at `FUN_004bee20` onEnter) was **dense**
>   — it carried dwords (`2312`, `2313`, `49`) the fleet-move probe never sends, unlike the sparse
>   `buildNotifyMovedGridInner` output — so the watcher did **not** read a fresh fleet-move copy. The
>   server intent (`unitId=1`, `cell=2597 = 2588+9`) appears in that buffer only under `@0x13
>   big-endian`; this is treated as **coincidental**, not a confirmed layout.
>
> `RE/tools/logh7_0b07_location_watch.py` now reports **both** decodes per entry (primary `@0x14 LE`,
> alt `@0x13 BE`) plus raw bytes, with `RE_CONFIRMED_0B07.recordLayout.layoutResolved = false`. No
> server wire change is justified yet. **Settling it requires a controlled live A/B** that dumps the
> server-emitted 0x0b07 frame bytes and the `clientBase+0x437714` bytes in the **same** session and
> confirms whether a clean record reads `@0x14 LE` (then the watcher's primary is correct and the
> server stays) or `@0x13 BE` (then both watcher and server need the offset/endianness change).

### 3.2 What the client applies from `0x0b07`

`FUN_004bee20(record)` gates on `clientBase+0x2a58f8 != 0` (world-active, G3), logs a warning if
`**(clientBase+8)==0`, then calls `FUN_00517cd0(0xb07, record)`. `FUN_00517cd0`:
- branches on scene FSM `*DAT_02215e2c` (1/2/3) and validates a sub-state via `FUN_0050cf40`;
- enqueues a **deferred event `0x16`** carrying the record (`FUN_00501e30(0x16, queue, record)`),
  which `FUN_005751b0` (the SelectGrid ReceiveResult update) is polling.

Important correction after the canonical live #46 pass: `FUN_004bee20` itself does **not** directly
write `PLAYER_INFO+0x40/+0x44` or the `clientBase+0x41a368` unit table. That direct write pattern
belongs to sibling notify paths such as `FUN_004bee60` / `FUN_004beaa0`, which walk PLAYER_INFO
(`clientBase+0x0c`, stride `0x370`) and update location-like dwords. For `0x0b07`, the confirmed
client effect is now:

1. `FUN_004bee20` runs with `client+0x2a58f8` open;
2. `FUN_00517cd0(0xb07, record)` runs;
3. `FUN_00501e30(0x16, ...)` enqueues the scene event;
4. the SelectGrid result node (`FUN_005751b0`) should consume that event and drive its state machine
   (`DAT_009d2a7c`, `_DAT_009d2a74`, node `+0x34/+0x3c/+0x44/+0x4c`).

Live #46 confirms steps 1-3. Canonical live #82 confirms step 4 also runs, but the only observed
state change is transient SelectGrid result state. Static RE of `FUN_005751b0` shows it drives the
ReceiveResult FSM (`DAT_009d2a7c`, `_DAT_009d2a74`, node fields) and does not contain a persistent
unit-table, PLAYER_INFO, cell/object, or own-cell writer. Therefore a bare `0x0b07` is currently
classified as a result-control event, not as a proven visual relocation event.

### 3.3 Live apply-probe verdict codes

Use `RE/tools/logh7_0b07_apply_probe.py` during a standard `ui_explorer` session with
`LOGH_FLEET_MOVE_PROBE=1` after grid entry. The probe is read-only and now reports a stable
`verdictCode` so live evidence can be compared mechanically:

```bash
cd RE
python -m tools.logh7_0b07_apply_probe --seconds 30 --out .omo/ui-explorer/<session>/0b07-apply.json
```

Server-side prerequisite: `server/tests/server/logh7-login-session.test.mjs` locks the opt-in
`LOGH_FLEET_MOVE_PROBE=1` path so post-load grid entry defers exactly one `0x0b07` message32 frame,
using the active unit id and `fleetCellId() + LOGH_FLEET_MOVE_DELTA`.

Follow-up placement candidate: `LOGH_FLEET_MOVE_REBUILD_PROBE=1` extends that same delayed diagnostic
sequence from `[0x0b07]` to `[0x0b07, 0x0325, 0x0b0a]`. The appended `0x0325` is a full one-unit
refresh with its `cell` field set to the same destination as the `0x0b07` payload, and the appended
`0x0b0a(value=0)` runs the known strategic no-reset rebuild path (`FUN_004c2a80(1)`). This is an
opt-in live candidate for the open persistent-placement question, not proof that visible movement is
fixed.

Expected progression:

| verdictCode | Meaning |
|---|---|
| `record-missing` | `FUN_004bee20` was not reached; the client did not observe an applied `0x0b07` in the probe window. |
| `grid-gate-closed` | `FUN_004bee20` ran, but `client+0x2a58f8` stayed zero, so the world/grid-active gate blocked dispatch. |
| `dispatch-missing` | The gate opened, but `FUN_00517cd0(0x0b07)` did not fire. |
| `enqueue-missing` | Dispatch fired, but `FUN_00501e30(0x16)` did not enqueue a scene event. |
| `applied-no-owncell-change` | The event queue saw `0x0b07`; the watched own-cell field did not change, so use screenshots or a fleet/object watch to prove visual movement. |
| `applied-owncell-changed` | Apply, dispatch, enqueue, and the watched own-cell mutation were all observed. |

### 3.4 Live location/result watcher verdict codes

Use `RE/tools/logh7_0b07_location_watch.py` when the apply probe already reports
`applied-no-owncell-change`. This watcher is also read-only. It samples the unit table
(`clientBase+0x41a364/+0x41a368`), character linkage (`+0x36a5dc/+0x36a8b4`), PLAYER_INFO location
fields (`+0x3c/+0x40/+0x44/+0x48`, officer count `+0x270`), SelectGrid globals
(`DAT_009d2a7c`, `_DAT_009d2a74`), and hooks `FUN_005751b0` / `FUN_004d6a80`.

```bash
cd RE
python -m tools.logh7_0b07_location_watch --seconds 90 \
  --session .omo/ui-explorer/<session> \
  --out .omo/ui-explorer/<session>/0b07-location.json
```

| verdictCode | Meaning |
|---|---|
| `record-missing` | No `FUN_004bee20` hit was observed. |
| `dispatch-missing` | `FUN_004bee20` ran, but `FUN_00517cd0(0x0b07)` did not. |
| `enqueue-missing` | Dispatch ran, but `FUN_00501e30(0x16)` did not. |
| `result-node-missing` | The event reached the queue, but `FUN_005751b0` did not run in the watch window. |
| `applied-no-location-change` | Result path ran, but watched unit/PLAYER_INFO/cell/SelectGrid signatures stayed unchanged. |
| `applied-transient-selectgrid-change` | Result path ran and SelectGrid result state changed, but persistent unit/PLAYER_INFO/cell/own-cell state did not. This is the canonical live #82 result. |
| `applied-location-state-changed` | Result path ran and persistent unit/PLAYER_INFO/cell/own-cell state changed. This still needs screenshot agreement for visual movement proof. |

The watcher JSON also emits `reEvidence` with the static contract for this opcode: parser
`FUN_0044b460`, size `0x244`, `unit_count @ +0x12`, unit entries at `+0x14` stride `8`, and the known
consumer path `FUN_004bee20 -> FUN_00517cd0 -> FUN_00501e30(0x16) -> FUN_005751b0`. Its
`staticPersistentWriterKnown:false` flag is intentional; promote movement only from observed
unit/PLAYER_INFO/cell diffs plus screenshot agreement, not from event arrival alone.

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

**Is `0x0b0a` needed after a `0x0b07`?** Still open for visible relocation. `0x0b0a`->`FUN_004c2a80(1)`
is the known strategic-entry rebuild path for PLAYER_INFO<->unit linkage. Canonical live #82 shows a
server-pushed `0x0b07` by itself reaches event `0x16` and changes SelectGrid result state, but does
not move the watched unit row, PLAYER_INFO row, cell/object bytes, own-cell field, or visible marker.
The next RE target is therefore not another bare `0x0b07` replay; it is the persistent placement
trigger after a move, such as a rebuild (`0x0b0a`), refreshed unit/grid content (`0x0325`,
`0x0313`/`0x0315`), or another writer outside the known `0x0b07` control path. Do not claim
`0x0b07` alone visibly re-places a fleet until that writer path is RE-pinned and live-proven.

---

## 5. Recommended server send-sequence: protocol ACK + observer notify

Pre-req (one-time per player at strategic entry; see §1.3): sector map with the player's fleet as a
grid object (`0x0313`+`0x0315`), the unit (`0x0325`), char linkage (`0x0323`+`0x0204`), and a
`0x0b0a` so `FUN_004c2a80(1)` links PLAYER_INFO↔unit. These satisfy G1-G5 only; SelectGrid still
requires the H1-H5 HUD command-admission gates.

Then per move, at the protocol/control layer:

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
   Every client receives it through `FUN_004bee20`->`FUN_00517cd0` (event 0x16). This satisfies the
   known SelectGrid result-control path only. Visible render at `newCell` still requires a
   persistent placement trigger plus section 3.4 row/cell diffs and screenshot proof.
   This is the broadcast the existing relay (`createWorldRelay`, `RELAY_COMMAND_CODES`)
   already forwards — server just needs to translate the inbound `0x0b01` into the authoritative
   `0x0b07` for all observers (and the `0x0b01` echo for the mover).

**Minimal viable protocol logic:** on inbound `0x0b01` from conn3, (a) reflect `0x0b01` to the sender,
(b) compute the authoritative destination, (c) broadcast one `0x0b07` with `unit_count=1` carrying
`[fleetUnitId, destCell]` to every registered conn3. Whether a follow-up placement/rebuild trigger is
needed per visible move remains open after live #82.

---

## 6. Open questions

1. **`0x0b01` payload dwords 0x0c–0x20 (§2)** are inferred, not symbol-pinned. To make the SERVER
   correctly read the player's chosen destination (vs. just echoing), capture one real `0x0b01` send
   live, or symbolize the `SendWarpCommand` send method behind vtable `PTR_FUN_00676aec`.
2. **`0x0b07` unit element position meaning (§3.1, +0x04):** `FUN_0044b460` confirms the element
   shape as `{ u32 unitId, u32 positionOrCell }` at `+0x14` stride 8. The remaining question is not
   byte layout; it is whether `positionOrCell` is a raw `0x2c03cc` cell, a packed position, or merely
   control data consumed before a separate placement/rebuild writer.
3. **Sector-object record format (gate G4):** the per-object record in `0x2c1755` (3B/object) plus the
   `0x0313`/`0x0315` content that places the player's fleet as a selectable object is still useful
   data-model work, but it is not the current primary C002 blocker. `0x0315` also has the unresolved
   content-specific dispatch quirk (roadmap G187).
4. **`half@0x10` and `dword3` in `0x0b07`:** named "route scalar" / "dest spot" by position; the
   labeled `_INF:NotifyMovedGrid#` dump serializer (string @0x00766a64) is **not compiled** into the
   client (server-side only), so field names are not recoverable from this binary.
5. **Visible movement writer after `0x0b07`:** identify whether the client expects a follow-up
   strategic rebuild/content push (`0x0b0a`, `0x0325`, `0x0313`/`0x0315`, or another opcode) to make
   observers update persistent unit/PLAYER_INFO/cell state after the SelectGrid result FSM accepts
   `0x0b07`.
6. **HUD command-admission source:** after G4/G5 are true, identify which server record or native
   UI action changes `HUD+0xf4` to `2`, updates `HUD+0xab0`, and makes a selection row hit-test pass.
   `0x0356` can populate `payload+0x270`, but it does not by itself prove row visibility or command
   category dispatch.

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
