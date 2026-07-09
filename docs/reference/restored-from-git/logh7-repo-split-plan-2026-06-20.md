# LOGH VII repo split plan (2026-06-20)

## Decision

Split the current mixed revival workspace into two independent Git repos under this directory:

- `server/`: authoritative game server, admin surfaces, server content, SQLite state.
- `client/`: player-facing Windows client package builder and generated client-only distribution.

The current root stays as a development data workspace during migration. It is not a parent product repo and should not be used as a Git boundary for server/client changes.

Acceptance for the split:

- `server/.git` exists and `git -C server rev-parse --show-toplevel` resolves to `.../server`.
- `client/.git` exists and `git -C client rev-parse --show-toplevel` resolves to `.../client`.
- root `.git` is absent from the workspace, with the former metadata preserved only as an outside-workspace recovery backup if needed, so `git rev-parse --show-toplevel` from the parent no longer resolves to the workspace root.
- `npm test` passes from `server/`.
- `npm run check:package` passes from `client/` using `client/vendor/logh7-installed/` or an explicit source path.

## Server Repo Owns

- `server/src/server/`
- `server/tests/server/`
- `server/content/`
- `server/state/accounts.sqlite`
- `server/state/world-state.sqlite`
- `server/logs/`
- `server/traces/`
- admin CLI/API, including `/admin/session-state`
- `server/content/crypto/child-codec-tables.json` as the committed codec table fixture

Server package must not include the Windows client EXE, Pretendard payload, player launcher package, parent `.omo` workspace, or any parent-relative runtime path.

## Client Repo Owns

- `client/tools/package_client.py`
- `client/tools/packaging/install-pretendard.ps1`
- `client/fonts/`
- local ignored `client/vendor/logh7-installed/` payload for rebuilds
- generated `client/dist/logh7-client/exe/G7MTClient.exe`
- generated client-only setup/launch scripts

Client package must not include `src/server`, `content/logh7-content.db`, `accounts.sqlite`, `world-state.sqlite`, admin API code, server logs, or server traces.

The player is assumed not to have the original LOGH VII installer. A client package must therefore contain the playable EXE and required client data.

Client rebuild input is explicit: `client/tools/package_client.py` defaults to `client/vendor/logh7-installed/`, can be overridden by `--source` or `LOGH7_CLIENT_SOURCE`, and must not silently read the parent development workspace.

## Root Workspace After Split

Keep as development data until extraction/rebuild is fully reproducible from the new repos:

- `artifacts/`
- `.omo/`
- `.omc/`
- `.debug-journal.md`
- reverse-engineering docs and handoffs
- original extraction/build tooling that is not yet moved

Delete or archive from root only after both split repos pass their own checks:

- root `src/server/` once `server/src/server/` is authoritative
- root React demo/dashboard once moved to an admin product surface
- root `tests/server/` once `server/tests/server/` is authoritative
- root package scripts that duplicate server/client package scripts

## Current Persistence Boundary

- Account registry: SQLite by default at `state/accounts.sqlite`.
- World/session snapshots: SQLite by default at `state/world-state.sqlite`.
- Running server memory remains live authority; SQLite is boot restore and durable checkpoint.
- Admin session API reports the live in-memory state plus persistence backend/path.
- Codec handshake tables are loaded from `server/content/crypto/child-codec-tables.json`; if the fixture must be regenerated, use `server/tools/logh7_extract_codec_tables.mjs` with an explicit EXE path.

## Current Client Address Boundary

The current playable EXE address field is fixed-width. `client/tools/package_client.py` can patch the login host only when it fits the legacy 13-byte ASCII field, such as an IPv4 address.
