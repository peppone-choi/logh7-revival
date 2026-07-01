---
description: Run one evidence-first LOGH VII revival loop cycle
argument-hint: "[P0 item id, e.g. P0-02 | auto]"
---

Run one LOGH VII revival loop cycle for `$ARGUMENTS`. If no item is given, choose the first `next` or `blocked-needs-evidence` item in `docs/logh7-loop-state.md`.

## Current Canonical Rules (2026-06-28)

- Canonical server: `server/`.
- Canonical client/package work: `client/`.
- RE/live tools: `RE/tools`.
- Live proof must use the installed canonical playable `G7MTClient.exe`, SHA256 `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`.
- Start/login in windowed mode by default. Switch later with `display --mode borderless` when needed; `cursor-clip=auto` confines the cursor only in borderless/fullscreen and releases it in windowed/stop.
- Do not blanket-kill `node.exe`. Use `ui_explorer stop`; only terminate verified session/game PIDs.
- Keep `LOGH_PRESEED_PLAYER_CHAR` off by default. Use it only for isolated diagnostics.

## Procedure

1. Read state first: `AGENTS.md`, `docs/logh7-current-work-register-2026-06-17.md`, `docs/logh7-loop-engineering.md`, and `docs/logh7-loop-state.md`.
2. Collect evidence before changing code. Use `logh7-loop-explorer` or subagents for independent RE/manual/PDF/asset/trace questions.
3. Implement only when the evidence justifies the change. Mark data provenance as P0/P1/P2/P3.
4. Run targeted tests: server work under `server/`; RE/tool work under `RE/`.
5. Use a separate verifier pass or subagent for any completion claim.
6. For client-facing claims, run `RE/tools/logh7_ui_explorer.py` against the real game EXE, capture `shot` and `trace`, then `stop` and confirm `shaVerified:true`.
7. Document every action and result in `docs/logh7-loop-state.md` or the active session/audit doc before ending the cycle.

Vite/React screens are not game proof. `0x0f08 -> 0x0f09` info/status traffic is not SelectGrid movement proof. Natural movement remains `0x0b01` with response/broadcast evidence.
