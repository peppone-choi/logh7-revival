<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# src

## Purpose
Application source root for "logh7-revival" (package `logh-7-rework`, v0.1.0, private ESM) — a project reviving BOTHTEC's 1990s game "Legend of the Galactic Heroes VII" / 은하영웅전설 VII (client registry key `SOFTWARE\BOTHTEC\銀河英雄伝説VII\1.0`). This directory holds the React 18 + Vite SPA front-end (`main.jsx`, `styles.css`) and the dependency-free Node.js replacement game/resource server under `server/`. The SPA is currently only a demo sign-in/dashboard placeholder, not real game UI; the substantive code is the Node protocol server in `server/`. Sibling workstreams outside `src/` include reverse-engineering the legacy Windows PE client (G7MTClient.exe, G7Start.exe, Gin7UpdateClient.exe) and Python tooling under `tools/` for ISO/InstallShield extraction, cipher reconstruction, and PE patch/log trampolines. The technical core (login cipher handshake using transport codes 0x0034/0x0035/0x0036 over a Blowfish-like child codec) is documented in the git-ignored `.debug-journal.md` at the repo root.

## Key Files
| File | Description |
|------|-------------|
| main.jsx | React 18 SPA entry (createRoot); demo-only auth (DEMO_USER demo@example.com/password123), session in localStorage key `logh.auth.email`, hand-rolled history pushState/popstate routing with a /dashboard guard — placeholder UI, not real game logic. |
| styles.css | Plain CSS (no framework) for the demo auth UI: `.auth-shell`/`.auth-panel` sign-in card, `.dashboard-shell`/`.dashboard-grid`, teal brand `#2e6f67`, 640px responsive breakpoint. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| server/ | Dependency-free Node.js (ESM .mjs) replacement game server + protocol toolkit: child-codec cipher, transport framing, login handshake state machine, candidate-frame probe builders, and HTTP resource + TCP gameplay-capture servers wired to a CLI. |

## For AI Agents
### Working In This Directory
- `main.jsx` is a demo auth placeholder (hardcoded demo@example.com/password123) — do NOT treat it as the real game client or assume it reflects game logic; the real protocol work lives in `server/`.
- Front-end uses Vite + React 18 with hand-rolled routing (no router lib). Routing is `window.history.pushState`/`popstate`; the /dashboard route guard redirects to / when `localStorage['logh.auth.email']` is unset.
- Keep the dependency-free stance: the Node server avoids runtime deps; root deps are only Vite + React (front-end) and Playwright (test). Do not add runtime dependencies casually.
- Do NOT place AGENTS.md files in build/tool-state dirs: node_modules/, dist/, test-results/, .bkit/, .omo/, .omc/, .ruff_cache/.

### Testing Requirements
- Full suite: `npm test` chains `npm run test:tools` (node tools/run_python_tests.mjs — Python tools/tests), then `npm run test:server` (node --test tests/server/*.test.mjs), then `playwright test` (chromium, auto-starts dev server on port 4173).
- Subsets: `npm run test:tools`, `npm run test:server`, or `npx playwright test` individually.
- Run dev/build/servers: `npm run dev` (Vite on 127.0.0.1), `npm run build` (vite build -> dist/), `npm run server:logh7` / `server:gameplay` / `server:health` (node src/server/logh7-server.mjs serve|serve-gameplay|health). Example: `npm run server:logh7 -- --host 127.0.0.1 --port 4787 --manifest <manifest.json> --resource-root <dir>`.

### Common Patterns
- Evidence-first, no-fabrication policy: the server only emits protocol bytes (e.g. encrypted 0x0035 login frame) when explicitly configured; it returns 404 / trace-logs rather than ship speculative config.
- Server CLI is subcommand-driven (`serve`|`serve-gameplay`|`health`) and binds 127.0.0.1 by default — never external interfaces.
- Reverse-engineering findings are append-only dated entries in the root `.debug-journal.md` (git-ignored via `.git/info/exclude`); treat it as source of truth for protocol/cipher details and append rather than rewrite. Do not promote secret/runtime binary addresses elsewhere without care.
- Protocol invariants to preserve when editing server/tooling: transport codes 0x0034/0x0035/0x0036 map to internal 0x0405/0x0406, gated by a cipher-enabled flag; the child block cipher is Blowfish-like (8-byte blocks, 16 rounds, static tables XOR 0x91). Changing these breaks the handshake reproduction.

## Dependencies
### Internal
- `main.jsx` -> `styles.css`
- repo-root `index.html` -> `/src/main.jsx`
- repo-root `package.json` scripts -> `src/server/logh7-server.mjs`, `tools/run_python_tests.mjs`, `tests/server/*.test.mjs`
- `docs/logh7-server-setup.md` documents runtime expectations consumed by `src/server/logh7-server.mjs`

### External
- vite ^5.4.19 — dev server and build for the React SPA
- @vitejs/plugin-react ^4.5.2 — React fast-refresh / JSX transform
- react ^18.3.1 + react-dom ^18.3.1 — SPA UI (createRoot) for the demo auth front-end
- @playwright/test ^1.52.0 — chromium e2e tests under tests/**/*.spec.ts (devDependency)
- Node.js built-in test runner (node --test) — server tests
- (sibling workstreams, not under src/) Python 3 + ruff for tools/; Git LFS for artifacts/logh7-cd/* binaries

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
