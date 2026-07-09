# LOGH VII Live Test Standard (2026-06-28)

This is the single live-diagnostic standard for the real game client.

## Authority

- Canonical live client: installed playable `G7MTClient.exe`
- Canonical SHA256: `e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c`
- Live tool: `RE/tools/logh7_ui_explorer.py`
- Canonical server root: `server/`
- Run live commands from `RE/` and pass `--server-root ..\server`
- Default display: windowed for login/start. Switch after login with `display --mode borderless` when needed.
- Cursor clipping: leave `cursor-clip=auto`; it clips only in borderless/fullscreen and releases in windowed/stop.
- `LOGH_PRESEED_PLAYER_CHAR` is off by default. Use it only for an explicit bypass diagnostic.

## Do Not

- Do not blanket-kill `node.exe`; this can kill MCP and harness processes.
- Do not count Vite/React screens as game proof.
- Do not claim a live result without `shot` or `trace` evidence.
- Do not judge font blur from a stretched/lanczos windowed dgVoodoo config.

## Standard Command Shape

```bash
cd RE
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> stop
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> start --server-root ../server --port 47900 \
  --env LOGH_ACCEPT_ANY_GIN7=1 \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_SS_FORMAT=message32 \
  --env LOGH_STRAT_GALAXY=1 --env LOGH_STRAT_GRID_EARLY=1 --env LOGH_STRAT_TERRAIN=1 \
--env LOGH_WORLD_PLAYER=1 \
--env LOGH_POSTLOAD_PLAYER_RECORD=1 --env LOGH_POSTLOAD_RICH_CHARACTER=1 --env LOGH_POSTLOAD_ACTION_LIST_SEATS=1 \
--env LOGH_ACTION_LIST_CATEGORY=0 --env LOGH_COMMAND_TABLE_PRELOAD_PROBE=0 --env LOGH_DEV_COMMAND_GRANT_ALL=0 \
 --env LOGH_PLANET_BASE_RECORDS=1 --env LOGH_FULL_UNIT_LOCATION=1 --env LOGH_GRID_ENTER=1 \
--env LOGH_STATIC_SHIPS=1 --env LOGH_STATIC_SHIPS_LIMIT=1 --env LOGH_STATIC_TROOPS=0 --env LOGH_STATIC_FIGHTERS=0 \
--env LOGH_STATIC_ARMS=0 --env LOGH_STATIC_POWER_DISTRIBUTION=0 --env LOGH_STATIC_MASTER_PLAYABLE_SEED=0
```

Wait for the BOTHTEC/MPS splash to clear before clicking lobby or character UI.

2026-06-29 live correction: keep `LOGH_COMMAND_TABLE_PRELOAD_PROBE=0` and `LOGH_DEV_COMMAND_GRANT_ALL=0` in the standard profile. A live session `devcmd-target-20260629` proved that nonzero generic `0x0305` sends seven P3 cards (`worldInfoWireCountLe0=7`) but leaves the native command table empty and stalls at NOW LOADING. Treat that path as an explicit diagnostic only; command exposure must be recovered through the native command-table/factory path, not the conn3 generic `0x0305/0x0307` walker.

Keep `LOGH_STATIC_SHIPS=1` in standard profile: `bisect-ships-20260629` reached world view and emitted `0x0f02`, `0x0f03`, `0x0f06`, `0x0356`. Keep `LOGH_STATIC_TROOPS/FIGHTERS/ARMS/POWER_DISTRIBUTION/STATIC_MASTER_PLAYABLE_SEED=0` by default. `cmdpatch-smoke-20260629` showed `ships+troops` exits after `0x0f01`; the full P3 seed bundle `bisect2-bundle-20260629` and repeated `seed+ships` sessions do the same. `seed+ships` only survived with `LOGH_STATIC_SHIPS_LIMIT=1`, so troop/P3 seed tables remain diagnostic/dev-only until the ship-row interaction is root-caused. Use:

```bash
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> shot --label lobby-ready
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> trace
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> stop
```

`stop` must report `shaVerified:true`.

## Fast C002 Dev Playable Route

Use the scripted route when the task is to keep the first playable command path alive, not to recover canon command data:

```bash
cd RE
python -m tools.logh7_c002_playable_route --session ..\.omo\ui-explorer\c002-playable-route-20260630 --stop-existing --server-root ..\server
```

The script drives: lobby start -> character select -> temporary resident command table injection (`category=0`, factories `0x002b,0x0041`) -> manager dispatch -> target grid click -> confirm -> historical trace checks for `0x0b01` and `0x0b07`. Omit `--stop-at-end` when you want to continue playing from the post-command map; add it for a clean proof run. This is dev-only and does not claim the injected factory ids are canonical authority-card data.

By default the route also enables the local admin snapshot on an ephemeral port and writes `adminSnapshot` plus `playable-route-logs/admin-session-state.json`. Use that to confirm the server-side command ledger (`world.recentCommands`) after the EXE route, not just trace packet presence. Add `--no-admin-snapshot` only when you intentionally need the old no-admin behavior.

The route also enables dev-only state fallback by default: it resolves `バーラト` from `server/content/galaxy.json` and passes `LOGH_DEV_GRID_MOVE_FALLBACK_CELL=2115`. This makes the current 33-byte live `0x0b01` coordinate/form payload mutate an actual authoritative fleet while raw payload RE continues. Add `--no-dev-grid-fallback` for raw-only diagnostics.

## Evidence Codes

- Login/lobby: `0x7000`, `0x0020`
- Session list: `0x2005 -> 0x2006`
- Session/character selection to world: `0x2009 -> 0x200a`, `0x0200`, `0x0204`
- Character creation: `0x1008`
- World entry/data: `0x0f02`, `0x0313/0x0315`, `0x0323`, `0x0325`, `0x0356`
- Natural SelectGrid movement: `0x0b01` with response/broadcast evidence such as `0x0b07`
- `0x0f08 -> 0x0f09` is info/status traffic, not SelectGrid movement proof.

## Sharp Windowed QA Profile

For font/UI blur checks, use the sharp dgVoodoo profile:

- `FullScreenMode=false`
- `ScalingMode=centered`
- `Resampling=pointsampled`
- `Filtering=appdriven`
- `Antialiasing=off`
- `RTTexturesForceScaleAndMSAA=false`
- `SmoothedDepthSampling=false`

## Current UI Note

The canonical playable stack now ends with `lobby-res`, `lobby-native-layout-v2`, `charsel-recenter`, `charsel-content-inset`, `charsel-content-y-inset`, and `charsel-confirm-dialog-inset`. Main lobby notice content was already inside the right panel; the character/session/create content blocks and the final registration confirm dialog are now inside the native right panel in the default playable EXE.
