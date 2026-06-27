# LOGH VII distribution file layout

## Client Archive

Give this to players.

- `은하영웅전설7.exe`
- `업데이트.exe`
- `exe/G7MTClient.exe`
- legacy client data directories/files
- `fonts/`
- `tools/packaging/install-pretendard.ps1`
- `_support/setup-client.ps1`
- `_support/launch-client.ps1`
- `_support/update-client.ps1`
- `_support/apply-pending-update.ps1`
- `CLIENT-PACKAGE.txt`
- `client-package-manifest.json`
- `SERVER.INI`

Must not include server state, server content DB, account hashes, world snapshots, admin APIs, server logs, or original installer media.

Build input belongs inside the client repo (`vendor/logh7-installed/`) or is supplied explicitly with `--source`; the package builder must not require the parent development workspace.

`vendor/logh7-installed/` is a local ignored payload, not a player-facing archive. A player receives only the generated client archive.

The player-facing root should look like a normal Windows game directory: `은하영웅전설7.exe` starts the game, `업데이트.exe` runs a manual update check, and support scripts/logs live under `_support/`. The game launcher checks the configured update manifest before starting the client. Changed files are downloaded from the server resource endpoint and verified by SHA-256. If the running launcher itself is updated, the updater schedules `_support/apply-pending-update.ps1`, exits, copies the locked EXE after process exit, and relaunches `은하영웅전설7.exe`.

Update hosting uses the existing resource server:

- `npm run serve:update -- --host <host> --port 4787 --manifest <client-package-manifest.json> --resource-root <client-package-root>`
- `GET /manifest` returns the client package manifest.
- `GET /resources/<path>` returns each file listed by the manifest.
- `GET /update.ini` remains the legacy update client compatibility endpoint.

## Server/Admin Archive

Keep this with the operator.

- `src/server/`
- `content/`
- `package.json`
- `.env.example`
- `content/crypto/child-codec-tables.json`
- `state/accounts.sqlite`
- `state/world-state.sqlite`
- `logs/`
- `traces/`

Admin entry points:

- `npm run admin -- create <account> --password-stdin --account-db state/accounts.sqlite`
- `npm run serve:auth -- --admin-host 127.0.0.1 --admin-port 47910 --admin-token <12자 이상 토큰>`
- `http://127.0.0.1:47910/admin/session-state`
- `http://127.0.0.1:47910/admin/notice`

The server archive is standalone. It must not require the root development workspace, `.omo/`, a client EXE, or the original installer.

If `content/crypto/child-codec-tables.json` ever needs regeneration, run `npm run extract:codec -- <G7MTClient.exe>` inside the server repo as an explicit maintenance action. This is not a runtime dependency.

Committed `_source` fields may name `.omo` extraction artifacts for provenance. They are audit text only and must not be interpreted as runtime paths.

## Development Data Workspace

Keep only for rebuilding and reverse engineering:

- `artifacts/`
- `.omo/`
- `.omc/`
- `.debug-journal.md`
- extraction, RE, and patch tooling not yet migrated
- handoff and evidence docs

This workspace must not be a parent Git repo for `server/` or `client/`. Those directories are independent Git roots.
