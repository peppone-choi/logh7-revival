<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# logh7-revival

> CURRENT AUTHORITY (2026-06-30): canonical live diagnostics use the installed playable game EXE SHA256 `e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c` (18px-ish readable-font build), driven from `RE/` by `RE/tools/logh7_ui_explorer.py --server-root ..\server`. Start/login in windowed mode by default; switch with `display --mode borderless` when needed, which auto-enables cursor clipping. Do not blanket-kill `node.exe`; use `ui_explorer stop` and verified game/session PIDs only. Keep `LOGH_PRESEED_PLAYER_CHAR` off unless explicitly running a bypass diagnostic. Server edits/tests belong under `server/`; client/launcher/localization outputs belong under `client/` or `RE/tools` as appropriate.

> ★ 2026-06-26 재구조화: 루트 = **`server/`**(서버 레포) + **`client/`**(클라 레포) + **`docs/`** + **`RE/`**(dev/RE 워크스페이스: tools·.omo).
> **작업 결과물은 캐논 레포 두 곳에 반영한다** — 서버/와이어/콘텐츠 → `server/src/server`(검증 `cd server && node --test tests/server/*.test.mjs`),
> 클라/런처/한글화/에셋 → `client/`. **루트 src/tools/tests·RE/src는 이주 dup(캐논 아님, 편집 금지).** 아래 본문은 재구조화 이전 레이아웃 설명이라 경로는 server/·client/ 기준으로 읽을 것. 상세 `docs/logh7-repo-restructure-2026-06-26.md`.

## Purpose
Revival project for the 1990s Japanese strategy game "Legend of the Galactic Heroes VII" / 은하영웅전설 VII (BOTHTEC; registry key `SOFTWARE\BOTHTEC\銀河英雄伝説VII\1.0`). Package name is `logh-7-rework` (v0.1.0, private ESM). Work spans three intertwined streams: (1) reverse-engineering the legacy Windows PE client (`G7MTClient.exe`, `G7Start.exe` launcher, `Gin7UpdateClient.exe`) and its TCP network protocol; (2) building a dependency-free Node.js replacement game/resource server (`src/server/logh7-server.mjs`, run via `npm run server:*`); (3) Python tooling under `tools/` for ISO/InstallShield extraction, cipher reconstruction, PE patch/log trampolines, and localization/packaging. The repo root is also a Vite + React 18 SPA (`index.html` -> `src/main.jsx`) but is currently only a demo sign-in/dashboard placeholder, not real game UI. The hard technical core (login handshake: cipher transport codes `0x0034`/`0x0035`/`0x0036` -> internal queued IDs `0x0405`/`0x0406`, multi-phase key exchange around a Blowfish-like 16-round Feistel "child codec", static tables de-obfuscated by XOR `0x91`) is recorded in `.debug-journal.md`. Per the journal, the cipher handshake is solved but no real client has yet been advanced into a playable session (criteria C001/C002 pending). Intended deployment (per `docs/logh7-server-setup.md`): Windows PC runs the legacy client/capture, Linux/macOS does protocol analysis and regression tests, AWS Docker hosts the real server.

## Key Files
| File | Description |
|------|-------------|
| `package.json` | ESM manifest (`logh-7-rework`). Scripts: `dev` (vite on 127.0.0.1), `build` (vite build), `server:logh7`/`server:gameplay`/`server:health` (node src/server/logh7-server.mjs serve\|serve-gameplay\|health), `test:tools`, `test:server`, `test` (all three + playwright). Deps: vite, @vitejs/plugin-react, react, react-dom; devDep @playwright/test. |
| `playwright.config.js` | E2E config: testDir `./tests`, testMatch `**/*.spec.ts`, baseURL `http://127.0.0.1:4173`, chromium-only, webServer auto-runs `npm run dev -- --port 4173` (reuseExistingServer), trace on-first-retry. |
| `index.html` | Vite HTML entry, title "LOGH Authentication", mounts `#root`, loads `/src/main.jsx`. |
| `.debug-journal.md` | 554-line append-only reverse-engineering work journal — the project's real technical knowledge base (dated findings G005-G063: transport/internal code mappings, phase1/2/3 key-exchange layouts, child-codec addresses, key extraction, packet sequence, runtime manager dispatcher tracing). Git-ignored via `.git/info/exclude`; treat as source of truth for protocol/cipher detail. Append dated findings — never rewrite history. |
| `.gitignore` | Ignores `node_modules/`, `dist/`, `.omo/`, `__pycache__/`, `.bkit/`, `.playwright/`, `playwright-report/`, `test-results/`, `*.log`. Does NOT list `.omc/` or `.ruff_cache/` (present as untracked tool state) — add them before committing if you want to avoid tool noise. |
| `.gitattributes` | Git LFS rules for legacy CD artifacts: `artifacts/logh7-cd/*.bin`, `*.iso`, `*.cab`, `*.pdf` (filter/diff/merge=lfs, -text). Never inline-commit these binaries. |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `artifacts/` | Binary-artifact root holding the Git LFS-managed canonical LOGH VII CD image (`logh7-cd/`: `Logh7.bin` MODE2/2352 dump, cue sheet, converted `Logh7_mode2_2048.iso`) — immutable, never-shipped reference inputs consumed by `tools/convert_mode2_bin_to_iso.py` and `tools/logh7_pipeline.py`. |
| `docs/` | Korean-language coordination docs for the revival: environment role-split rules, Windows analysis toolchain, the CD-to-distributable localization pipeline, Codex handoff prompts, and the append-only G### reverse-engineering evidence ledger for `G7MTClient.exe`'s protocol and cipher handshake. |
| `src/` | Application source root: the demo-only React 18 + Vite auth SPA (`main.jsx`/`styles.css`) and the dependency-free Node.js replacement protocol server under `server/` (Blowfish-variant child codec, BE transport framing, `0x0034`->`0x0035` login handshake, probe builders, policy-gated HTTP resource + TCP gameplay-capture servers behind a CLI). |
| `tests/` | Playwright E2E suite for the SPA demo login (`auth.spec.ts`) plus a node:test protocol/server suite under `server/` for the reverse-engineered codec, handshake, bootstrap/world-init frames, HTTP+TCP servers and probe CLI, anchored to golden hex values from the real `G7MTClient.exe`. |
| `tools/` | Python 3.11+/Node toolkit for reverse-engineering the client (image base `0x00400000`) and its TCP protocol: ISO/MsgDat asset extraction, the child-codec cipher and transport framing, capstone static disassembly recovering the handshake/dispatch/entity-pool state machine, ctypes/pywin32 live-client probing, and x86 detour/trampoline runtime-patch builders; orchestrated by `logh7_pipeline.py`, tested via `tools/tests/`. |

### Excluded directories
`node_modules/`, `dist/`, `test-results/`, `.bkit/`, `.omo/`, `.omc/`, `.ruff_cache/` are build output / assistant tool state — no AGENTS.md, do not document or edit as source. (`.omo/`, `.bkit/`, `dist/`, `test-results/`, `node_modules/` are git-ignored; `.omc/` and `.ruff_cache/` are present but not yet in `.gitignore`.)

## For AI Agents
### Working In This Directory
- `src/main.jsx` is a demo auth placeholder (hardcoded `demo@example.com`/`password123`, session in localStorage key `logh.auth.email`) — it does NOT reflect game logic. The substantive code is the Node server (`src/server/`) and Python tools (`tools/`).
- `.debug-journal.md` is git-ignored via `.git/info/exclude` and holds sensitive reverse-engineered binary addresses. Treat it as the protocol/cipher source of truth; append new dated findings, do not rewrite, and do not promote secret/runtime addresses elsewhere without care.
- Legacy CD binaries under `artifacts/logh7-cd/` (`*.bin`/`*.iso`/`*.cab`/`*.pdf`) are Git LFS pointers — install git-lfs before touching them; never inline-commit large binaries.

### Testing Requirements
- Full suite: `npm test` — chains `npm run test:tools` (`node tools/run_python_tests.mjs`, drives Python `tools/tests/`) then `npm run test:server` (`node --test tests/server/*.test.mjs`) then `playwright test` (chromium, auto-starts dev server on port 4173).
- Subsets: `npm run test:tools`, `npm run test:server`, or `npx playwright test`. Python tests require Python 3.11+ (run from repo root).

### Common Patterns
- npm scripts: `npm run dev` (Vite on 127.0.0.1), `npm run build` (-> `dist/`), `npm run server:logh7`/`server:gameplay`/`server:health` (node src/server/logh7-server.mjs serve\|serve-gameplay\|health). Example: `npm run server:logh7 -- --host 127.0.0.1 --port 4787 --manifest <manifest.json> --resource-root <dir>`.
- Dependency-free / minimal-dependency stance: the Node server and tooling avoid runtime deps; root deps are only Vite+React (frontend) and Playwright (test).
- Server CLI is subcommand-driven (`serve`/`serve-gameplay`/`health`) and binds `127.0.0.1` by default — never external interfaces.
- Evidence-first, no-fabrication policy: server responses (e.g. the encrypted `0x0035` login frame) are emitted only when explicitly configured (`server.gameplay.loginResponse`); the server returns 404 rather than ship speculative protocol bytes.
- Protocol invariants to preserve when editing server/tooling: transport codes `0x0034`/`0x0035`/`0x0036` map to internal `0x0405`/`0x0406`, gated by a cipher-enabled flag; the child block cipher is Blowfish-like (8-byte blocks, 16 rounds, static tables XOR `0x91`). Changing these breaks the handshake reproduction.
- Binary VAs vs file offsets are tracked explicitly (e.g. VA `0x006140c0` -> file offset `0x002140c0`); patch targets are guarded by 16-byte original signatures to fail closed on PE drift.

## Dependencies
### Internal
- `index.html` -> `/src/main.jsx`; `src/main.jsx` -> `src/styles.css`
- `package.json` scripts -> `src/server/logh7-server.mjs`, `tools/run_python_tests.mjs`, `tests/server/*.test.mjs`
- `playwright.config.js` -> `tests/**/*.spec.ts` and `npm run dev`
- `docs/logh7-server-setup.md` documents server runtime expectations consumed by `src/server/logh7-server.mjs`

### External
- `vite ^5.4.19` — dev server and build for the React SPA root
- `@vitejs/plugin-react ^4.5.2` — React fast-refresh / JSX transform for Vite
- `react ^18.3.1` + `react-dom ^18.3.1` — SPA UI (createRoot) for the demo auth front-end
- `@playwright/test ^1.52.0` — chromium e2e tests under `tests/**/*.spec.ts` (devDependency)
- Python 3.11+ (external, not in package.json) — required by `tools/` scripts and `tools/run_python_tests.mjs`; ruff used for linting (`.ruff_cache/`)
- Node.js built-in test runner (`node --test`) — server tests; Git LFS — required for `artifacts/logh7-cd/*` binaries

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
