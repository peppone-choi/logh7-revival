# LOGH VII Multiplayer — Status & Roadmap (2026-06-12)

Self-contained summary of the multiplayer effort driven by the autonomous loop. Goal:
**a real authoritative server that drives the original Windows client (G7MTClient.exe) into actual
multiplayer.**

## ★★ G200 (2026-06-12, ulw): strategic fleet data + authoritative movement + character creation

This ultrawork pass reverse-engineered and implemented four wire formats end-to-end (server fully
unit-tested at **143 server tests green**, then live-verified against the unpatched client):

- **Strategic sector map (0x0313 object table + 0x0315 cell grid)** — `buildStaticInformationGridTypeInner`
  (object record = byte0 content-id / byte1 class=3 clickable / byte2 variant) +
  `buildStaticInformationGridInner` upgraded to place a fleet object value at a cell and RLE-encode the
  full 100×50 board (rleCount = pair-region BYTE length, confirmed against decompiled `FUN_004abbb0`;
  the fixed 5004-byte record is the size-table requirement — `buildLobbyResponseInner` zero-pads it).
  Wired into the 0x0f02 push behind `LOGH_STRAT_FLEET=1`. Docs: `docs/logh7-strategic-map-wire.md`.
- **Authoritative tactical movement (0x0400/0x0402)** — `parseInboundMoveShip` now fully decodes per-unit
  target poses (heading/x/z/y floats @ entry+4/+8/+12/+16) + speed/formation; `processCommand` builds
  authoritative `NotifyMovedShip 0x0423` (+ `0x0424` on heading) from the parsed targets instead of
  blind-relaying. Docs: `docs/logh7-moveship-wire.md`.
- **Authoritative strategic movement (0x0b01→0x0b07)** — `parseInboundMoveGrid` + `buildNotifyMovedGridInner`
  (0x14 header + stride-8 {unitId,cell} array); `processCommand` broadcasts the canonical
  `NotifyMovedGrid 0x0b07` to ALL clients (the 0x0b01 consumer `FUN_004bea90` is an empty stub).
  Docs: `docs/logh7-strategic-input-wire.md`.
- **Character creation (新キャラクターの作成)** — `parseGenerateCharacterCharge` (0x1008 packed request:
  power/blood/sex/UCS-2 names/face/ability_8/bonus_point/rank) + `buildGenerateCharacterChargeOkInner`;
  the login-session handler validates (names ≤13, entry cap 5), assigns an id, appends the character so
  the next 0x2003→0x2004 card list renders it, and accepts sibling 0x2007/0x1006/0x1007 + 0x2008 delete.
  Docs: `docs/logh7-character-creation-wire.md`.
- **Latency**: both TCP servers set `socket.setNoDelay(true)` (tiny request/response frames; Nagle only
  added dead time).

**Live proof (`.omo/ulw-loop/evidence/g200-world-strat-fleet-loaded.png`):** unpatched client (SHA
`2848be76…`) driven via `LOGH_LOBBY_OK_FORMAT=message32 LOGH_SS_FORMAT=message32 LOGH_WORLD_PLAYER=1
LOGH_STRAT_FLEET=1` → login → lobby menu → **character cards render with portraits** → session →
conn3 → SS-login → **WORLD LOADED (space view + HUD + sector radar)**. Trace shows 0x0313×2 + 0x0315×2
delivered at the 0x0f02 timing alongside 0x0204/0x0323/0x0325, full 0x0f00–0x0f03 world-init, and
0x0f06/0x0f07 idle — **client stayed alive (no crash)**, proving the strategic fleet push is safe and
the G164 world-load is non-regressed. EXE restored + SHA-verified after each session.

**Remaining (needs interactive RE, not server work):** whether the placed object is actually clickable
to emit 0x0b01 (the click→command enablement gates G4/G5 in `docs/logh7-strategic-input-wire.md`); and
driving the character-creation FORM live (blocked by the unpatched-Japanese-font invisible UI / likely
separate dialog window — the 0x1008 server path is unit-test-proven, the live card list renders).

## ★ Headline achievement — G164: unpatched world load

The **original, byte-for-byte unmodified** client (SHA `2848be76…`) is driven by our authoritative
server through `login → lobby → character-select → session → SS-login → WORLD` and **renders the
game world (space view + HUD) with zero client patches**, 75 s with **zero exceptions**
(crash_catcher). Earlier (G158) this needed a 6-byte client crash-skip patch; G164 made it
unnecessary.

**The fix** (`LOGH_WORLD_PLAYER=1`): push the local player's spawn on **`0x0f02` RequestGridInitialize**
— `0x0204` (selected char id) + `0x0325` (unit table) + `0x0323` (724-byte character record) before
the `0x0f03` ack. This is the only timing window that survives: the world-init reset fires at
`0x0f01` (zeroes `client+0x36a5dc`, memsets PLAYER_INFO), and the HUD renders right after `0x0f03`;
`0x0f02` is after the reset and before the render, so grid-init's `FUN_004c2a80` rebuilds
PLAYER_INFO in time and the HUD's `FUN_004c7290(focusId)` returns non-null (no `[0x80]` crash).
Proven by `tools/logh7_player_info_probe.py`: `sessionCount=1`, `playerInfoActiveCount=1`,
`focusMatchesAnActiveSlot=true`.

## In-world protocol map (complete)

| Message | Code | Dir | Size | Notes |
|---|---|---|---|---|
| CommandMoveGrid | `0x0b01` | C→S (relayed) | 36B | **strategic** fleet move (sector map), `FUN_004bea90` (stub) |
| NotifyMovedGrid | `0x0b07` | S→C | 580B | strategic fleet/units moved, `FUN_004bee20`→`FUN_00517cd0` |
| NotifyEnterGridBegin/End | `0x0b09`/`0x0b0a` | S→C | 1B | grid placement; `0xb0a`→`FUN_004c2a80(1)`+`FUN_004c32a0(1)` |
| CommandMoveShip | `0x0400` | C→S (relayed) | 1052B | **tactical** ship move (battle grid), `FUN_004be8f0` |
| CommandParallelMoveShip | `0x0402` | C→S (relayed) | 1052B | tactical formation move |
| NotifyMovedShip | `0x0423` | S→C | 28B | ship moved; `dword1`=shipId, `dword3..5`=pos(x,y,z float) |
| NotifyTurnedShip | `0x0424` | S→C | 12B | ship turned; `dword1`=shipId |
| CommandGridChat | `0x0f1c` | C→S (relayed) | 140B | **player chat** (sender + ≤65 char text) |
| CommandSpotChat | `0x0f1d` | C→S (relayed) | — | spot chat |

Framing (verified G172): client→server inners are raw `[u16 code@0][payload]`; server→client conn3
is message32 `[u32 0][u16 code][payload]`.

## Server-side infrastructure (built, wired, tested — 85 server tests green)

- **Per-connection isolation** (auth-server): `connectionId`/`session`/`phase1Key`/reply-id are all
  per-connection → concurrent independent clients already work (code-verified).
- **In-world relay** `src/server/logh7-world-relay.mjs`: `createWorldRelay()` (register/broadcast/
  unregister, sender-excluded, dead-socket-safe) + `RELAY_COMMAND_CODES` (chat + strategic/tactical
  moves) + `isRelayCommandCode`. Wired into the auth-server (register conn3 on SS handshake →
  rebroadcast in-world commands re-wrapped via `wrapRawInnerAsMessage32` → unregister on close).
  **Gated behind `LOGH_RELAY=1`** so the proven G164 flow is never perturbed.
- **Builders**: `buildNotifyTurnedShipInner`/`buildNotifyMovedShipInner`/`buildNotifyEnterGridBegin/
  EndInner`/`buildInformationUnitRecordInner` (in `logh7-login-protocol.mjs`).
- **Diagnostic tooling**: `logh7_crash_catcher.py` (ctypes debugger, exact fault address),
  `logh7_player_info_probe.py` (live PLAYER_INFO/focus/grid state), `logh7_two_client_test.py`
  (two concurrent clients), `logh7_world_crash_patch.py` (the legacy 6-byte skip, now obsolete).

## The boundary — what interactive in-game multiplayer still needs

The relay forwards the right commands, but a client can only ISSUE them once its **fleet is
controllable**. G167 live probe: after world load the player is on the **strategic sector view**
with PLAYER_INFO populated but `gridActive(0x126718)=0` and 0 grid slots — clicking issues no
command. The strategic-map fleet placement + the click→`CommandMoveGrid` input path live in a deep
chain of delegating handlers (`FUN_004bee20`→`FUN_00517cd0`, `FUN_004bea90` is a stub) = the game's
strategic data model + FSM. Reverse-engineering and reimplementing that is a large effort and needs
live/interactive debugging (the headless 2-client GUI test is too fragile — Win32 foreground-steal
blocks `login()` clicks with overlapping windows).

## Strategic-map data model — mapped (G176–G187)

The world the client loads is the **strategic sector view**. The fleet a player would move is an
object on a **100×50 sector grid**. The full data model (all server-controlled, all sent EMPTY today):

- **Cell grid** `client+0x2c03cc` (100×50 bytes; each cell value 2..88 = an object index, 0 = empty).
  Read by `FUN_004c8b70(col,row)` = `cellValue*3 + client+0x2c1755`. Source: **`0x0315`
  ResponseStaticInformationGrid** (RLE `[u8 w][u8 h][u16 rleCount][run,value pairs]`, decoded by
  `FUN_004abbb0`) → `client+0x3f4448` → copied by `FUN_004c5350`.
- **Object table** `client+0x2c1755` (3 bytes/object, ~100). Source: **`0x0313`
  ResponseStaticInformationGridType** → `client+0x3f57d4` → copied by the same `FUN_004c5350`.
- **Unit table** `client+0x41a368` (count u16 @`0x41a364`). Source: **`0x0325` ResponseInformationUnit**
  (52KB) — PROVEN to deliver/process at the `0x0f02` timing (`unitCount` became non-zero).
- **Unit positions** `client+0x42eb8c` (count u16; records `[u32 unitId][pos floats]`, stride from the
  world tick `FUN_004b6e00`). Source: **`0x0349` ResponsePositionUnit** — but applies to the TACTICAL
  pool `0x126718` via `FUN_004c7cd0`, not the strategic map.
- **Strategic field setup** `FUN_004c8a10` (mode 2) → `FUN_004c8bc0` builds a value→position index
  from the cell grid. The TACTICAL grid `0x126718` is built by `FieldMake FUN_004b64c0` only in
  `mode==0` (battle/encounter) — so grid-enter (`0xb09`/`0xb0a`) does NOT place strategic fleets.
- **Fleet order = a UI command**, not a raw click: `FUN_00581c80` (`SelectGrid`→`CommandMoveGrid
  0xb01`) is one of ~80 strategic handlers installed into a func-ptr table by `FUN_0058c750`.

### Two key correctness findings
- **Large frames are NOT dropped by size** (G184): the 52KB `0x0325` processes fine at the `0x0f02`
  push timing; the original G180 "large-frame blocker" was a misdiagnosis (it was the early-walk
  burst timing + an unrelated `0x0315`-specific quirk).
- **`0x0315` specifically fails to dispatch** (G187) regardless of push position/order — an unsolved
  content-specific client quirk, but NON-critical (strategic grid already has content from elsewhere).

### What's needed for a controllable player fleet
The player's fleet must be an OBJECT in the sector object table (`0x2c1755`) placed at a CELL
(`0x2c03cc`), i.e. real `0x0313`+`0x0315` map data with the player's fleet, AND the unit
(`0x0325`, works) + the link from PLAYER_INFO/session to that object. This is the game's real
sector-map content — a substantial data-model reconstruction (per-object record formats still TBD),
best done with a live client in an interactive RE session.

## Recommendation / next steps

1. **Live two-client demo** (chat is simplest): run the server with `LOGH_RELAY=1`, two clients in
   an INTERACTIVE session (manual window placement), open chat → verify `CommandGridChat` relays.
2. **Fleet controllability**: RE the strategic-map fleet placement (what populates the sector grid
   with the player's fleet) + the click→`0x0b01` input handler. This is the gateway to strategic
   multiplayer movement, which the relay then propagates between players.
3. The server foundation (auth + world load + relay) is solid; remaining work is game-logic RE.
