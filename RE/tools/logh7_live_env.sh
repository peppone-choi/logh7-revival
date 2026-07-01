#!/usr/bin/env bash
# LOGH VII unified live-test wrapper.
# Usage: tools/logh7_live_env.sh <start|login|shot|trace|wait|stop|info|create|display> [extra args]
# Manual login is preferred. This wrapper keeps the harness route equivalent to
# the official player route: canonical EXE, port 47900, server/ root, standard ENV.
set -u
cd "$(dirname "$0")/.." || exit 1

SESSION=".omo/ui-explorer/live"
SERVER_ROOT="../server"
PORT="$(python -c 'from tools.logh7_launch_config import PORT; print(PORT)')"
mapfile -t ENVS < <(python -c 'from tools.logh7_launch_config import standard_env_cli_args; print("\n".join(standard_env_cli_args()))')
UX() { python -m tools.logh7_ui_explorer --session "$SESSION" "$@"; }

cmd="${1:-}"; shift || true
case "$cmd" in
  start)
    # Clean slate through ui_explorer, not a blanket node kill.
    UX stop >/dev/null 2>&1 || true
    # Start/login in windowed mode. Switch later with: tools/logh7_live_env.sh display --mode borderless
    UX start --server-root "$SERVER_ROOT" --port "$PORT" --no-login --display-mode windowed "${ENVS[@]}" "$@"
    echo ">>> Focus the game window and log in manually. Any ID/PW is accepted by the standard local server."
    ;;
  login)   echo "Manual login only. Automatic login is intentionally not part of this wrapper.";;
  wait)    UX wait-trace "$@";;
  shot)    UX shot "$@";;
  trace)   UX trace "$@";;
  info)    UX info "$@";;
  create)  UX create-character "$@";;
  display) UX display "$@";;
  stop)    UX stop "$@";;   # Always stop to restore and SHA-verify the canonical EXE.
  *) echo "usage: $0 <start|wait|shot|trace|info|create|display|stop> [args]"; exit 1;;
esac
