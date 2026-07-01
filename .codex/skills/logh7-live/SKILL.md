---
name: logh7-live
description: Drive and verify the real LOGH VII D3D8 client live via RE/tools/logh7_ui_explorer.py. Use when you need to confirm something WORKS in the actual game (login, lobby, character creation, world entry, strategic map, an EXE patch, a wire record), capture a screenshot/trace, or reproduce an in-client symptom. Triggers: "라이브검증", "실클라", "ui_explorer", "does X work in the real client", "capture a trace/screenshot", "drive the client".
---

# LOGH VII Live Client Verification

The only ground truth for client behavior is the real `G7MTClient.exe` driven by `RE/tools/logh7_ui_explorer.py`. A Vite/React screen or unit test is not live proof.

## Current canonical rules (2026-06-28)
- Use the installed canonical playable game EXE, SHA256 `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`.
- Work from repo root `C:\Users\by0ng\OneDrive\Desktop\logh7-revival`; live commands normally run from `RE\` and pass `--server-root ..\server`.
- Start/login in `windowed` mode by default. Switch later with `display --mode borderless`; `cursor-clip=auto` clips only in borderless/fullscreen and releases in windowed/stop.
- Do not blanket-kill `node.exe`. Use `ui_explorer stop` first. If a stale client remains, terminate only `G7MTClient.exe` or a verified session PID.
- Keep `LOGH_PRESEED_PLAYER_CHAR` off by default. Use it only for isolated bypass diagnostics.
- Always finish with `ui_explorer stop` and confirm `shaVerified:true`.

## Standard run
```bash
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> stop
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> start --server-root ../server --port 47900 \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_SS_FORMAT=message32 \
  --env LOGH_STRAT_GALAXY=1 --env LOGH_STRAT_GRID_EARLY=1 --env LOGH_STRAT_TERRAIN=1 \
  --env LOGH_WORLD_PLAYER=1 \
  --env LOGH_POSTLOAD_PLAYER_RECORD=1 --env LOGH_POSTLOAD_RICH_CHARACTER=1 \
  --env LOGH_PLANET_BASE_RECORDS=1 --env LOGH_FULL_UNIT_LOCATION=1 --env LOGH_GRID_ENTER=1
```

Wait for the BOTHTEC/MPS splash to clear before clicking lobby or character UI. Use `shot` and inspect the PNG before blind clicks because the D3D8 window exposes no useful text. `trace.jsonl` is the truth: `0x0f02` proves world entry, `0x0313/0x0315` grid data, and natural movement requires `0x0b01` plus response/broadcast evidence.

## Safety
- Do not run two `ui_explorer` sessions or node servers on the same port.
- Do not claim a live result unless a screenshot or trace proves it.
- Do not judge font blur from a stretched/lanczos windowed dgVoodoo config; use the sharp profile for windowed QA.

Related: [[logh7-patch]] for EXE patch builds, [[logh7-wire]] for trace/wire records, [[logh7-re]] for client call paths.
