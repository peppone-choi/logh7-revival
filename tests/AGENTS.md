<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# tests

## Purpose
Two test suites live here. A Playwright E2E suite (`auth.spec.ts`) drives the React/Vite SPA demo login in Chromium via the Playwright webServer (Vite dev server on port 4173). A Node `node:test` suite under `tests/server/` exercises the reverse-engineered LOGH VII protocol code and replacement server in `src/server/`: the child-codec cipher, phase1/phase3 handshake frames, session-bootstrap and world-init candidate frames, the HTTP manifest/update.ini/protocol-catalog server, the TCP gameplay capture server, and the standalone world-init probe CLI. Server tests enforce an evidence-first policy: never fabricate protocol responses unless real captured client bytes or an explicit manifest-provided frame exist.

## Key Files
| File | Description |
|------|-------------|
| auth.spec.ts | Playwright E2E: 5 tests covering demo login (demo@example.com/password123) to /dashboard, empty/wrong-creds alert "Enter the demo email and password to continue.", unauthenticated /dashboard redirect to /, sign-out blocking dashboard re-entry, and labelled Email/Password form accessibility. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| server/ | node:test suite for the LOGH VII protocol codec, handshake/bootstrap/world-init frame builders, HTTP+TCP replacement server, and the world-init probe CLI, anchored to golden hex values derived from the real G7MTClient.exe. |

## For AI Agents
### Working In This Directory
- File-name routing is load-bearing: `playwright.config.js` sets testMatch `**/*.spec.ts`, so server `.test.mjs` files are excluded from Playwright. Keep `.test.mjs` for node:test files; renaming a server test to `.spec.ts` would misroute it into Playwright.
- `auth.spec.ts` asserts exact UI strings: heading "Command dashboard", "Signed in as demo@example.com", alert "Enter the demo email and password to continue.", URL regexes for / and /dashboard, and the demo credentials. Keep these in sync with the SPA.
- `tests/server/*.test.mjs` need the real binary fixture at `.omo/work/logh7-installed/exe/G7MTClient.exe`; without it the codec/session-bootstrap/world-init/dynamicProbe tests fail to extract static tables (HTTP-only and observed-packet tests still pass).

### Testing Requirements
- `npm run test:server` runs `node --test tests/server/*.test.mjs`.
- `playwright test` runs auth.spec.ts; the configured webServer launches Vite via `npm run dev --port 4173` with baseURL http://127.0.0.1:4173.
- `npm test` runs everything: test:tools (python) then test:server then playwright.

### Common Patterns
- node:test (`import test from 'node:test'`, `assert from 'node:assert/strict'`) for server tests; `@playwright/test` for `*.spec.ts`.
- Server tests isolate via `mkdtemp` in `os.tmpdir()`, write a manifest.json fixture, bind to port 0, and clean up in `finally` with `server.close()` and `rm`.
- Golden hex/length/offset assertions act as regression anchors tied to the EXE; regenerate them rather than hand-editing if codec output changes.
- Evidence-first: the gameplay server emits zero bytes for observed packets unless the manifest supplies loginResponse/commandOkResponses/dynamicProbe; trace records carry evidence filenames (g005/g013/g022/g024) and responsePolicy strings.

## Dependencies
### Internal
- `src/server/logh7-codec.mjs`, `src/server/logh7-server.mjs`, `src/server/logh7-session-bootstrap.mjs`, `src/server/logh7-world-init.mjs` — code under test for the server suite
- `tools/logh7_world_init_probe_server.mjs` — CLI spawned by the probe-server integration test
- `.omo/work/logh7-installed/exe/G7MTClient.exe` — real binary fixture for static-table extraction
- `playwright.config.js` — testDir ./tests, testMatch `**/*.spec.ts`, Vite webServer on 4173

### External
- `@playwright/test` ^1.52.0 (devDependency) — E2E runner/assertions, Chromium Desktop Chrome project
- `node:test` / `node:assert/strict` — built-in runner/assertions for all server tests
- `node:net`, `node:child_process`, `node:fs/promises`, `node:os`, `node:events` — TCP clients, CLI spawning, temp dirs, trace IO
- global `fetch` (Node 18+) — HTTP assertions against startLogh7Server
- `vite` ^5.4.19 + `@vitejs/plugin-react` — dev server hosting the SPA for Playwright

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
