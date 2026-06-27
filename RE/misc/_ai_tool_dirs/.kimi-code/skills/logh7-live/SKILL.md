---
name: logh7-live
description: Drive and verify the real LOGH VII D3D8 client live via tools/logh7_ui_explorer.py. Use when you need to confirm something WORKS in the actual game (login, lobby, character creation, world entry, strategic map, an EXE patch, a wire record), capture a screenshot/trace, or reproduce an in-client symptom. Triggers: "라이브검증", "실클라", "ui_explorer", "does X work in the real client", "capture a trace/screenshot", "drive the client".
---

# LOGH VII — Live Client Verification

The ONLY ground truth for client behavior. A Vite/React screen is NOT the game; a passing unit test is NOT live proof. Verify with the real `G7MTClient.exe` driven by `tools/logh7_ui_explorer.py`.

## ⚠️ #1 gotcha: the splash screen (cost ~10 debugging cycles once)
After `start`, the client shows the **BOTHTEC / MPS / Microvision splash for ~25–35s** before the lobby is click-ready. If you drive `create-character` immediately, every click lands on the splash → flow stalls at the session list (only `0x2005/0x2006`, no `0x2009`). **Always wait for the lobby first.**

```bash
# 1) clean slate (stale node => trace.jsonl 0 bytes; stale client => wrong PID)
taskkill //IM node.exe //F >/dev/null 2>&1; taskkill //IM G7MTClient.exe //F >/dev/null 2>&1; sleep 2
# 2) start (canonical playable + proven-safe flags). --patched-exe <exe> to test a build.
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> start --port 47900 \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_SS_FORMAT=message32 \
  --env LOGH_STRAT_GALAXY=1 --env LOGH_STRAT_GRID_EARLY=1 --env LOGH_STRAT_TERRAIN=1 \
  --env LOGH_WORLD_PLAYER=1 \
  --env LOGH_POSTLOAD_PLAYER_RECORD=1 --env LOGH_FULL_UNIT_LOCATION=1 --env LOGH_GRID_ENTER=1
# 3) WAIT for splash to clear (~30s), confirm lobby with a shot, THEN drive
for i in 1 2 3 4 5 6; do sleep 6; done
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> shot --label lobby-ready   # Read the PNG to confirm
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> create-character \
  --session-row 1 --faction empire --lastname Lohengram --firstname Reinhard --flagship Brunhild
# 4) observe: world entry => trace has 0x0f02 0x0313 0x0323 0x0325 ; click + check trace
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> shot --label world --settle 3   # Read it
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> key 70 --hw --label f-key --settle 1
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> click 506 421 --label fleet --settle 2
grep -oE "0x0b01|0x0f02|0x0313" .omo/ui-explorer/<id>/trace.jsonl | sort | uniq -c
# 5) ALWAYS stop + verify SHA restored (so `stop` can't leave a menu-disabled EXE)
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> stop   # expect shaVerified:true
taskkill //IM node.exe //F >/dev/null 2>&1
```

## Reading results
- **trace.jsonl** is the truth. Codes: `0x7000` login → `0x0020` lobby → `0x2005/0x2006` session list → `0x2009/0x0200` connect → `0x1008` char-create → `0x0f02` world → `0x0313/0x0315` grid → `0x0323` char → `0x0325` unit. Movement: `0x0b01` select-grid, `0x0400` move, `0x0423/0x0424` notify-moved.
- **In-world keyboard uses hardware injection**: the client polls `GetAsyncKeyState`; normal `PostMessage` keys do not reach the in-world loop. Use `key <vk> --hw` (`keybd_event`). This has live proof for catGate transition `0x1→0x2→0x6` and cellStatePush firing. Mouse targeting is still unresolved; suspect cursor clipping or DirectInput-level injection.
- **Blind clicks**: the D3D8 window exposes no `windowText`, so you cannot read UI labels — always `shot` then Read the PNG to locate a target before clicking. Window is ~1024×768; clicks are window-relative pixels.
- **Empty trace.jsonl (0 bytes)** = a stale node server held the port. Kill all node, restart.

## Don'ts
- Don't run two `ui_explorer` sessions / two node servers on the same port.
- Don't claim a live result a `shot`/`trace` doesn't show.
- Don't skip `stop` — it restores and SHA-verifies the canonical EXE.

Related: [[logh7-patch]] (build the `--patched-exe`), [[logh7-wire]] (interpret trace records), [[logh7-re]] (find what a click should fire).
