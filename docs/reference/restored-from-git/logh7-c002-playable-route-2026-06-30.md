# LOGH VII C002 Playable Route Smoke - 2026-06-30

Purpose: keep the first proven playable command path repeatable while canon command-card/factory recovery continues.

## Command

```bash
cd RE
python -m tools.logh7_c002_playable_route --session ..\.omo\ui-explorer\c002-playable-route-20260630-smoke --stop-existing --stop-at-end --server-root ..\server
```

## Result

- Step summary: `start`, `game-start`, `select-character`, `inject-dispatch-command`, `target-grid-cell`, `confirm-command`, `wait-trace-0x0b01`, `wait-trace-0x0b07`, and `stop-at-end` all exited `0`. `stop-existing` exited `1` only because no prior session existed.
- `0x0b01` evidence: matched inbound `login-message` with `innerPayloadLength:33`, relay echo, and `authoritative-command accept:true reject:null delivered:1`.
- `0x0b07` evidence: matched relay delivery with `frameBytes:608`.
- Current tool behavior: `logh7_c002_playable_route.py` now starts `serve-auth` with local admin enabled by default (`LOGH_ADMIN_PORT=0`) and writes `adminSnapshot` into `playable-route-summary.json` before optional shutdown. This captures `counts.commandRecords` plus recent command ledger rows from `/admin/session-state`.
- Stop evidence: `shaVerified:true`, restored SHA `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`.

## Stateful Proof - 2026-06-30

Fresh run: `.omo/ui-explorer/c002-playable-route-stateful-clean-20260630`.

- Trace captured live raw `0x0b01` payload: `0b01033500880335008800000001000003350098ffffffff09b969000000000005`.
- `authoritative-command` accepted and delivered `0x0b07`.
- Admin ledger row: `units:[1001]`, `effect:"fleet-grid-move"`, `debug.destCell:2115`, `debug.hadFleet:true`.
- `2115` is `バーラト` from `server/content/galaxy.json` (`canonGameRow=21`, `canonGameCol=15`).
- This stateful move uses the dev-only fallback env `LOGH_DEV_GRID_MOVE_FALLBACK_CELL=2115` because the current live `0x0b01` payload is a 33-byte coordinate/form payload, not the older 9-dword fixture layout. The raw payload is now traced for RE follow-up.
- Clean proof summary has `stopAtEndError:null`; all steps after expected empty `stop-existing` returned `0`, including `stop-at-end`, with `shaVerified:true`.

## Evidence Files

- Summary: `.omo/ui-explorer/c002-playable-route-20260630-smoke/playable-route-summary.json`
- Admin command ledger snapshot: `.omo/ui-explorer/c002-playable-route-20260630-smoke/playable-route-logs/admin-session-state.json` on new runs
- Stateful summary: `.omo/ui-explorer/c002-playable-route-stateful-clean-20260630/playable-route-summary.json`
- Stateful admin snapshot: `.omo/ui-explorer/c002-playable-route-stateful-clean-20260630/playable-route-logs/admin-session-state.json`
- `0x0b01`: `.omo/ui-explorer/c002-playable-route-20260630-smoke/playable-route-logs/08-wait-trace-0x0b01.stdout.txt`
- `0x0b07`: `.omo/ui-explorer/c002-playable-route-20260630-smoke/playable-route-logs/09-wait-trace-0x0b07.stdout.txt`
- Stop/SHA: `.omo/ui-explorer/c002-playable-route-20260630-smoke/playable-route-logs/10-stop-at-end.stdout.txt`

## Scope

This is dev-only runtime resident-command-table injection. It proves a playable route through the native command manager and server authority path, but does not claim factories `0x002b` or `0x0041` are canonical authority-card mappings.

Next work: replace injection with recovered native/server data population, expand command categories, and attach target resolvers for movement, sortie, proposals, orders, logistics, combat, fighters, weapons, and ground troops.
## Codex Readiness Gate - 2026-06-30

Fresh run:

```bash
cd RE
python -m tools.logh7_c002_playable_route --session ..\.omo\ui-explorer\c002-playable-route-codex-20260630-readiness --stop-existing --stop-at-end --server-root ..\server
```

Result:

- Step summary: `start`, `game-start`, `select-character`, `inject-dispatch-command`, `target-grid-cell`, `confirm-command`, `wait-trace-0x0b01`, `wait-trace-0x0b07`, `stop-at-end` all exited `0`. `stop-existing=1` only meant no prior session.
- Live trace: client sent `0x0b01`; server emitted `authoritative-command accept:true reject:null delivered:1`; `0x0b07` delivery was observed.
- Admin recent command: `innerCode:2817` (`0x0b01`), `effect:"fleet-grid-move"`, `units:[1001]`, `debug.destCell:2115`, `debug.hadFleet:true`.
- Admin readiness summary now records command target counts and dev-card executability in the route summary:
  - world: `executableCommands:81/81`, target counts include characters/outfits/ships/troops/gridCells/fighters/weapons/operationPlans/posts/ranks/powers.
  - session 1: `commandRecords:1`, `executableCommands:81/81`.
  - session 2: `commandRecords:0`, `executableCommands:81/81`.
- `tools.logh7_c002_playable_route._route_verification(summary)` on this summary returns `ok:true`, with `accepted0b01`, `waitTrace0b01`, and `waitTrace0b07` all true.

Static RE anchor:

- `python -m tools.logh7_redex func 0x00581c80` confirms the SelectGrid factory body contains `SelectGrid`, `TARGET_GRID`, `TARGET_BASE_GRID`, request `0x0b01`, response `0x0b07`.
- `python -m tools.logh7_redex func 0x004f93c0` confirms the command manager dispatch invokes a selected factory function from the command table.

Status:

- This remains a dev-only resident command-table route. It proves a repeatable playable command path through the native command manager and authoritative server state, but does not yet prove canonical authority-card factory ids. Replacing `0x002b,0x0041` with recovered canonical mapping must keep this readiness gate green.

Factory provenance gate:

- `RE/tools/logh7_c002_playable_route.py` now writes `factoryProvenance` into each route summary and `_route_verification(summary)` requires the `0x002b` SelectGrid anchor before returning `ok:true`.
- Existing live evidence plus `factoryProvenance(DEFAULT_FACTORIES)` verifies `ok:true`; proven anchors are `0x002b` and `0x0041`.
- `0x002b` is statically anchored to `FUN_00581c80` via `DAT_00c9e3a8` and carries `SelectGrid` / `TARGET_GRID` / `TARGET_BASE_GRID`, request `0x0b01`, response `0x0b07`.
- `0x0041` is statically anchored to `FUN_00584c90` via `DAT_00c9e400`, but its gameplay semantic remains less certain than the `0x002b` movement route.

## Live Recheck - 2026-06-30 20:24 KST

Command:

```bash
cd RE
python -m tools.logh7_c002_playable_route --session ..\.omo\ui-explorer\c002-playable-route-live2 --server-root ..\server --stop-existing --stop-at-end --trace-timeout 20 --start-settle 16 --lobby-settle 3 --character-settle 8 --target-settle 4 --confirm-settle 4 --inject-seconds 2.5
```

Result:

- Dev-only injected resident command table route reached native command dispatch again.
- `0x0b01` was received from the client at `2026-06-30T11:24:07.197Z`, payload `0b01033500880335008800000001000003350098ffffffff09b977000000000005`.
- `wait-trace 0x0b07` matched relay delivery at `2026-06-30T11:24:07.206Z`.
- Server also emitted `0x0b02` response at `2026-06-30T11:24:07.207Z`.
- The current parser still tags the payload as `sendwarp-live-v1` with `unitId:null`, `destCell:null`, `unresolved:true`; this proves the command path, not the final semantic field map.
- Route summary originally reported `ok:false` only because the first `stop-at-end` returned nonzero before retry succeeded. Tool verification now treats a successful `stop-at-end-retry-*` as cleanup success.
- `start-settle` was raised to `16.0` because shorter startup waits can click the game-start coordinate while the client is still on the logo/menu transition.

Status: warp/navigation command transport goes through in the dev-only route. Canonical authority-card/factory mapping and natural UI admission are still pending.
