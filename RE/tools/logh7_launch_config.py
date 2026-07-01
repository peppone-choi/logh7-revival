"""LOGH VII live harness launch defaults.

The test harness (`ui_explorer` / `logh7_live_env.sh`) reads the port, standard
server environment, and canonical playable EXE from this module. The C# player
launcher keeps a mirrored core config and adds player-runtime-only settings
such as the SQLite account DB, admin API, and client path. Keep the core flags
aligned, and document intentional launcher-only deltas.

Current authority is recorded in docs/logh7-live-test-standard.md:
- PORT=47900 is fixed by the client bootstrap route. Other ports make the
  client look at an empty 47900 and show NO DATA.
- Canonical playable EXE SHA is
  e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c.
- Standard ENV contains proven gameplay-enable flags only. Diagnostic-only
  flags such as LOGH_PRESEED_PLAYER_CHAR
  must be passed explicitly per run.
"""
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Final

from tools.logh7_client_exe import (
    CANONICAL_PLAYABLE_EXE,
    INSTALLED_CLIENT_EXE,
    REPO_ROOT,
    canonical_playable_sha256,
)

# Fixed live standard. Changing this breaks client/server parity.
PORT: Final[int] = 47900

# Standard server ENV. Keep this aligned with the playable path while leaving
# intrusive C002 diagnostic flags opt-in.
STANDARD_SERVER_ENV: Final["OrderedDict[str, str]"] = OrderedDict(
    (
        ("LOGH_ACCEPT_ANY_GIN7", "1"),
        ("LOGH_LOBBY_OK_FORMAT", "message32"),
        ("LOGH_LOBBY_EARLY_OK", "1"),
    ("LOGH_SS_FORMAT", "message32"),
    ("LOGH_STRAT_GALAXY", "1"),
    ("LOGH_STRAT_GRID", "1"),
    ("LOGH_STRAT_GRID_EARLY", "1"),
    ("LOGH_STRAT_TERRAIN", "1"),
    ("LOGH_STRAT_FLEET", "1"),
    ("LOGH_WORLD_PLAYER", "1"),
    ("LOGH_POSTLOAD_PLAYER_RECORD", "1"),
    ("LOGH_POSTLOAD_RICH_CHARACTER", "1"),
    ("LOGH_POSTLOAD_ACTION_LIST_SEATS", "1"),
("LOGH_ACTION_LIST_CATEGORY", "0"),
# 2026-06-29 live: generic 0x0305 card preload stalls NOW LOADING and leaves the
# native command table empty. Keep the dev-card path explicit/diagnostic-only.
("LOGH_COMMAND_TABLE_PRELOAD_PROBE", "0"),
("LOGH_DEV_COMMAND_GRANT_ALL", "0"),
("LOGH_FULL_UNIT_LOCATION", "1"),
    ("LOGH_GRID_ENTER", "1"),
    ("LOGH_PLANET_BASE_RECORDS", "1"),
    # 2026-06-29 live: ship master passes world entry. Keep troop/P3 seed
    # tables off; ship+troop and seed+ships exit before 0x0f02.
("LOGH_STATIC_SHIPS", "1"),
("LOGH_STATIC_SHIPS_LIMIT", "1"),
("LOGH_STATIC_TROOPS", "0"),
    ("LOGH_STATIC_FIGHTERS", "0"),
    ("LOGH_STATIC_ARMS", "0"),
    ("LOGH_STATIC_POWER_DISTRIBUTION", "0"),
    ("LOGH_STATIC_MASTER_PLAYABLE_SEED", "0"),
    ("LOGH_SEED_CANON_NPCS", "1"),
)
)

HARNESS_ONLY_SERVER_ENV_KEYS: Final[tuple[str, ...]] = (
    # The harness uses this to bypass account setup during RE/live diagnostics.
    # The player launcher provisions and uses its SQLite account DB instead.
    "LOGH_ACCEPT_ANY_GIN7",
)

LAUNCHER_ONLY_SERVER_ENV_KEYS: Final[tuple[str, ...]] = (
    "NODE_NO_WARNINGS",
    "LOGH_ACCOUNT_DB",
    "LOGH_SESSION_DB",
    "LOGH_LOBBY_RICH_CHARACTERS",
    "LOGH_WORLD_IMPORT_BASES",
    "LOGH_STRAT_GRID",
    "LOGH_STRAT_FLEET",
    "LOGH_TACTICS_UNIT",
    "LOGH_POSTLOAD_UNIT_STREAM_WIRE",
    "LOGH_PLAYER_FOCUS_CELL",
    "LOGH_BASE_ECONOMY",
    "LOGH_STATIC_SHIPS",
    "LOGH_CONTENT_DB",
    "LOGH_KO_NAMES",
    "LOGH_SCENARIO",
    "LOGH_REPOSITORY_BACKEND",
    "LOGH_SQLITE_PATH",
    "LOGH_ADMIN_HOST",
    "LOGH_ADMIN_PORT",
    "LOGH_ADMIN_TOKEN",
)

SHARED_LAUNCHER_ENV_KEYS: Final[tuple[str, ...]] = tuple(
    key for key in STANDARD_SERVER_ENV if key not in HARNESS_ONLY_SERVER_ENV_KEYS
)


def standard_server_env() -> "OrderedDict[str, str]":
    """Return a mutable copy of the standard ENV."""
    return OrderedDict(STANDARD_SERVER_ENV)


def standard_env_cli_args() -> list[str]:
    """Return ui_explorer `--env KEY=VAL` arguments."""
    args: list[str] = []
    for key, value in STANDARD_SERVER_ENV.items():
        args.extend(("--env", f"{key}={value}"))
    return args


def resolve_playable_client_exe() -> Path:
    """Return the canonical playable EXE used for live sessions."""
    if CANONICAL_PLAYABLE_EXE.exists():
        return CANONICAL_PLAYABLE_EXE
    return INSTALLED_CLIENT_EXE


def playable_client_sha256() -> str:
    return canonical_playable_sha256()


__all__ = [
    "PORT",
    "REPO_ROOT",
    "STANDARD_SERVER_ENV",
    "HARNESS_ONLY_SERVER_ENV_KEYS",
    "LAUNCHER_ONLY_SERVER_ENV_KEYS",
    "SHARED_LAUNCHER_ENV_KEYS",
    "standard_server_env",
    "standard_env_cli_args",
    "resolve_playable_client_exe",
    "playable_client_sha256",
]
