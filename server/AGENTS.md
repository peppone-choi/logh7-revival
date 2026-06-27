# LOGH VII Revival Server

## Scope

This directory is an independent Git repository for the authoritative LOGH VII server and admin surfaces. Do not rely on files outside this repo at runtime or in tests.

## Owns

- `src/server/`: login, lobby, session, world state, command handling, admin CLI/API.
- `tests/server/`: standalone node:test coverage for the server package.
- `content/`: committed server content, scenarios, roster, galaxy, economy, manual-derived data, and codec fixtures.
- `state/`: local SQLite runtime state. This directory is ignored and should be created by the running server/admin tools.
- `logs/` and `traces/`: local runtime evidence. These directories are ignored.

## Does Not Own

- Windows client EXEs, launchers, player packaging, or Pretendard font payloads.
- Original LOGH VII installer/CD/ISO artifacts.
- Parent workspace paths such as `../`, `.omo/`, `.omc/`, or root extraction scratch data.

## Rules

- Keep the server package dependency-light and evidence-first.
- Runtime defaults must resolve inside this repo: `content/`, `state/accounts.sqlite`, and `state/world-state.sqlite`.
- Codec tables are loaded from `content/crypto/child-codec-tables.json`. Regenerating them requires an explicit `G7MTClient.exe` path and is not a runtime dependency.
- Tests must run from this repo with `npm test` and must not read the parent workspace or a client EXE.
- Do not commit SQLite state, logs, traces, or generated caches.

## Verification

```bash
npm test
node --check src/server/logh7-server.mjs
node --check src/server/logh7-auth-server.mjs
```
