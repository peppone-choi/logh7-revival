# LOGH VII Command State Ledger - 2026-06-30

Purpose: proven playable commands leave inspectable authoritative state, not only transient notify packets.

## Current Scope

`server/src/server/logh7-world-state.mjs` now has a bounded command ledger:

- `recordCommand(entry)`
- `commandLogCount()`
- `listCommandLog()`
- `toSnapshot()/restore()` round-trip support

Ledger records:

- sequence number
- connection id
- inbound command opcode
- accept/reject state
- affected unit ids
- effect label
- optional debug metadata

## Wired Effects

- `/grid <cell>` chat fallback (`0x0f1c`) records `grid-chat-fleet-move`.
- Native strategic grid move (`0x0b01`) records `fleet-grid-move`.
- Dev C002 route fallback (`LOGH_DEV_GRID_MOVE_FALLBACK_CELL`) maps the current live 33-byte coordinate/form `0x0b01` payload to a player-side fleet and records the original parsed dwords in `debug.fallback`.
- Generic `processCommand(...)` wrapper records accepted/rejected decisions when a handler does not already write a more specific row.
- Covered generic labels: `grid-chat`, `strategy-command`, `logistics-command`, `battle-ops-command`, `personnel-command`, `social-command`, `account-command`, and rejected unknown commands.

The direct movement paths already mutate authoritative fleet cell and emit `0x0b07 NotifyMovedGrid`; the wrapper fills the remaining command decisions into persistent snapshots without double-recording those direct paths.

`serve-auth` admin snapshot (`/admin/session-state` or `/api/admin/session-state`, admin token required) exposes `counts.commandRecords`, `world.recentCommands`, and per-session `commandRecords` for live EXE diagnostics.

## Test

```bash
node --test tests/server/logh7-world-state.test.mjs tests/server/logh7-command-engine.test.mjs
node --test tests/server/logh7-auth-server.test.mjs
```

Run from `server/`.

## Next Expansion

- Add per-command effect details for logistics/base/troop commands (`0x0b00`..`0x0b06`) after their target/effect binding is confirmed.
- Add per-command effect details for personnel/politics/intelligence command families once each native consumer/target binding is confirmed.
- RE the live 33-byte `0x0b01` coordinate/form payload so the dev fallback can be replaced by canonical target extraction.

This is a debugging/persistence aid. It does not create new wire bytes; each logged effect must still be backed by an existing authoritative handler and real client-consumed notify path.
