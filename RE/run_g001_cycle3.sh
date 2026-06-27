#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SESSION=".omo/ui-explorer/g001-c002-cycle3-20260623"
PORT=47900

cd "$ROOT"

# cleanup any previous lock (best effort)
rm -f .omo/work/logh7-installed/exe/G7MTClient.exe.uiexplorer || true

python -m tools.logh7_ui_explorer --session "$SESSION" start --port "$PORT" \
  --patched-exe .omo/work/logh7-installed/exe/G7MTClient.autologin.emp1.exe --no-login \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_SS_FORMAT=message32 \
  --env LOGH_STRAT_GALAXY=1 --env LOGH_STRAT_GRID_EARLY=1 --env LOGH_STRAT_TERRAIN=1 \
  --env LOGH_WORLD_PLAYER=1 --env LOGH_POSTLOAD_PLAYER_RECORD=1 --env LOGH_FULL_UNIT_LOCATION=1 \
  --env LOGH_GRID_ENTER=1 --env LOGH_PLAYER_FOCUS_CELL=1 \
  --env LOGH_COMMAND_TABLE_PRELOAD_PROBE=1 --env LOGH_FLEET_MOVE_PROBE=1

# wait for autologin patch to drive through title/lobby/character/world, then fleet move delay
sleep 45

# run read-only C002 probes (these tools take no --session; redirect output)
python -m tools.logh7_c002_cmdmenu_probe --seconds 3 > "$SESSION/cmdmenu-probe.json" 2>&1 || true
python -m tools.logh7_c002_catgate_probe --seconds 3 > "$SESSION/catgate-probe.json" 2>&1 || true

# capture final state
python -m tools.logh7_ui_explorer --session "$SESSION" shot --label post-world || true

# stop restores canonical EXE
python -m tools.logh7_ui_explorer --session "$SESSION" stop
