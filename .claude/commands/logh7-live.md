---
description: LOGH VII live verification with the real canonical game EXE
argument-hint: "[target: C002 | font | lobby UI | world entry]"
---

Use the **logh7-live** skill in `.claude/skills/logh7-live/SKILL.md`. Verify in the real client: `$ARGUMENTS`.

Current rule (2026-06-29): use the installed canonical playable `G7MTClient.exe` SHA `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad` via `RE/tools/logh7_ui_explorer.py`.

- Start from `RE\` and pass `--server-root ..\server`.
- Start/login in windowed mode by default. Switch later with `display --mode borderless` when a larger play surface is needed.
- Do not blanket-kill `node.exe`; use `ui_explorer stop` and only terminate verified session/game PIDs.
- Keep `LOGH_PRESEED_PLAYER_CHAR` off unless a diagnostic explicitly asks for it.
- Wait for the BOTHTEC/MPS splash to clear before driving lobby or character UI.
- Use `shot` and inspect the PNG before blind clicks.
- `trace.jsonl` is the truth (`0x0f02`=world, `0x0b01`=SelectGrid movement).
- Always `stop` and confirm `shaVerified:true`.
