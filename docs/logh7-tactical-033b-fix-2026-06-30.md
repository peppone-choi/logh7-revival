# LOGH VII Tactical 0x033b UnitShip Wire Fix - 2026-06-30

## Summary

`buildResponseTacticsInformationInner` now emits the client-confirmed `0x033b`
UnitShip receive-object shape:

- payload size: fixed `0x79e4`
- header: `u16 count @0`, `u16 padding @2`
- first record: payload `+4`
- record stride: `0x34` / 52 bytes

This replaces the old short `2 + count * 47` payload form.

## RE Evidence

- Parser: `FUN_00421f80`
- Parser reads count first, sets its record cursor to payload `+4`.
- The first `unitId` is read from record base `+0`.
- Record advance is `0x34`.
- `FUN_004c32a0` consumes the copied source table at
  `clientBase+0x4271a8/+0x4271ac` to seed tactical active units.

## Current Record Fields

The server writes only RE-confirmed or safe fields:

- `+0x00 u32 unitId`
- `+0x04 u8 controllable`
- `+0x05 u8 confusion`
- `+0x08 u32 character/commander key` (falls back to mapSection/unit id when no character is known)
- `+0x0c..+0x18 float x/y/z/heading`
- `+0x1c..+0x30 reserved tactical tail`, zero unless explicitly provided

## Battle-Entry Builder Alignment

`server/src/server/logh7-battle-engine.mjs` now uses the same fixed `0x79e4`
UnitShip object shape in `buildTacticsInformationUnitShipInner`, so
`openBattleField()` no longer sends the old short form for `0x033b`.

## Live Sequencing Result

Live runs with `LOGH_BATTLE_ENTRY_PROBE=1` showed the server can now order
battle-entry data as:

- pre-grid: `0x0b09`, replay `0x0325/0x0323`, then `0x0349`, `0x033b`,
  `0x0341`, `0x0343`, `0x0337`
- grid end / grants: delayed `0x0b0a`, `0x042f` by default; `0x0f1f` is explicit opt-in only.

This removes the earlier ordering bug where `0x033b` arrived after `0x0b0a`.
However, live memory still showed `clientBase+0x4271a8` count `0` and tactical
pool head `0`, even when runtime `clientBase+0x126711` was poked to mode `0`
before delayed `0x0b0a`.

The next blocker is therefore not wire size or message order. It is `0x033b`
consumption itself: `FUN_004b8b00` returns the special class `0x301` for
`0x033b`, so the next RE task is to confirm whether the client requires a real
`0x033a` request/response association before `FUN_00421f80` copies the table.

## Verification

Focused checks:

```powershell
cd server
node --check src/server/logh7-login-session.mjs
node --test tests/server/logh7-login-session.test.mjs --test-name-pattern "battle-entry probe"
```

Both passed on 2026-06-30.

## 2026-07-01 Cross-Record Link Fix

Live crash triage showed that `charId != unitId` exposed a bad cross-record link: `0x033b +0x08`
still defaulted to unit id while the replayed `0x0323` character table used the real active
character id. `FUN_004c32a0` then could not match the UnitShip row back to the character table.
The battle-entry preseed now emits:

- `0x033b.id == 0x0325.id`
- `0x033b +0x08 == 0x0323.characterId`
- tactical replay `0x0325.cell/owner/faction/spot/mapSection` nonzero and aligned to the active
  character location
- replayed `0x0323` keeps power/camp from content/lobby fallback when worldState has no character

Server guard added: `battle-entry tactical preseed links UnitShip rows to active character and fleet cell`.
Verified with `node --test server/tests/server/logh7-login-session.test.mjs` on 2026-07-01.

## Current Limit

Do not claim `NO DATA` is gone. Verified so far:

- `0x033b` fixed-size wire shape is corrected.
- battle-entry server order is improved.
- live client still does not populate the tactical source table or active pool.
- `0x042f NotifyChangeMode` alone is live-safe and leaves strategy UI alive.
- `0x0f1f NotifyTactics` currently crashes the client at APPCRASH `c0000005`, fault offset
  `0x0018f83a` (VA `0x0058f83a`, `FUN_0058ee70`) when emitted with current prerequisites.
  Server default battle-entry probes therefore omit `0x0f1f`; use
  `LOGH_BATTLE_ENTRY_NOTIFY_TACTICS=1` or explicit `LOGH_BATTLE_ENTRY_CODES=0x0f1f` only for crash/RE sessions.

## 2026-07-01 Live Offset/Ordering Update

- Fixed `buildTacticsInformationUnitShipInner` to match `FUN_00421f80`: payload `[u16 count][u16 pad][record @ +4]`, record stride `0x34`, fields `id@0`, flags `@4/@5`, character/mapSection `@8`, pose `@0x0c..0x18`, tail `@0x1c..0x30`.
- Live session `.omo/ui-explorer/tactical-033b-offset-47900-20260701` sent `0x033b` with `respLen=31210` at `23:21:48.040Z`; the client did not reset immediately on that packet.
- The crash still happened later: `0x042f` and `0x0f1f` were sent at `23:21:56.066Z/067Z`, the client sent a second `0x0f02`, the server answered ack-only `0x0f03`, then the socket closed with `read ECONNRESET` at `23:22:07.017Z`.
- RE follow-up shows `0x0b0a` only calls `FUN_004c32a0(1)` on the mode-0 path, while `FUN_004c1c30` (`0x042f`) itself requires `client+0x126718 != 0`. Live session `.omo/ui-explorer/tactical-defer-gridend-47900-20260701` refuted the attempted `0x042f -> 0x0b0a` ordering: after both packets, `modeByte=2`, `poolHead=0`, and `tacticsInfoCount=12`. Keep `LOGH_BATTLE_ENTRY_DEFER_GRID_END=1` as an explicit diagnostic only, not the default.
