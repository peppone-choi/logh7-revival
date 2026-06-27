# Session Handoff — 2026-06-15 (post-/clear continuation)

Very long session. Read this + `MEMORY.md` (esp. `logh7-play-features-2026-06-15`,
`logh7-localization-cp932-wall`, `logh7-run-procedure-and-status`) to continue. Server tests baseline:
`node --test tests/server/*.test.mjs` → **472 pass / 0 fail**. Pristine client EXE SHA `2848be76…`.

## ★ THE RUN COMMAND (proven: signup→login→lobby→title menu→char-select→world, all Korean)
```
python -m tools.logh7_ui_explorer stop
python -m tools.logh7_ui_explorer start --port 47900 \
  --patched-exe .omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe \
  --env LOGH_RELAY=1 --env LOGH_AUTHORITATIVE=1 --env LOGH_CONTENT_DB=1 --env LOGH_NPC_AI=1 \
  --env LOGH_NPC_SEED=1 --env LOGH_ACCOUNT_DB=.omo/work/e2e-accounts.json \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_SS_FORMAT=message32 --env LOGH_WORLD_PLAYER=1 \
  --env LOGH_STRAT_GRID=1 --env LOGH_STRAT_FLEET=1 --env LOGH_TACTICS_UNIT=1 --env LOGH_GRID_ENTER=1 \
  --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_STRAT_GALAXY=1
```
Then to drive: `click 110 192` (게임시작) → `click 460 188` (char1) → `click 600 350` (확인) → world.
**Screenshot trick**: ui_explorer GDI capture = BLACK for D3D8. Use **`python -c "from PIL import ImageGrab; ImageGrab.grab().save('shot.png')"`** (full-screen) — captures the dgVoodoo D3D11 swapchain. Restore: `stop` + restore pristine + JP data + remove D3D8.dll/dgVoodoo.conf from exe dir.

## ✅ DONE THIS SESSION (verified live)
- **Korean codepage — SOLVED**: global `DAT_03350674` was set to 932 ONCE at file `0x1fffc9` (frida watchpoint). Same-length patch at **file 0x1fffbe**: `8b45e8 83c420 83ff02 7505` → `83c420 b8b5030000 909090` (add esp,0x20; mov eax,0x3b5(949); nop×3; drop guard) → global=949 runtime (frida-confirmed). Canonical client = **`.omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe`** (lobby-unblock + HANGEUL/굴림 font + 0x1fffbe global-force + strict-relax 0x2003f3/0x20047c). koreader.exe(IAT trampoline)=CRASH(cave beyond VirtualSize); kosafe.exe(3-site push)=blank. **Global-force was the answer.**
- **Full translation**: 4528 strings JP→KO (29-batch workflow) → **20 .dat re-encoded CP949** in `.omo/work/logh7-ko-overlay/data/MsgDat/` (constmsg 3144 + messages_* + tac/com). Menu+detail+in-game HUD all Korean (verified). Apply: copy those .dat over installed data (backup .jpbak) + KO String.txt→String.txt.original. g7sw.dat(14, GFWR) DEFERRED (encoder is HFWR-only).
- **AI fleet battle** (LOGH_NPC_SEED=1, auth-server seeds 8 enemy ships): proven 724× `respInnerCodeHex=0x0426` broadcasts to in-world client.
- **Galaxy register** (LOGH_STRAT_GALAXY=1): `buildStrategicGalaxyGrid` injects 80 systems into 0x0313/0x0315.
- **Lobby UI handlers** (executor, 472 tests): in login-session.mjs ABOVE the generic walker — **0x1000→0x1001, 0x1002→0x1003 (count≥1, THE 새캐릭/추첨 blocker fix), 0x1004→0x1005** (real builders from logh7-account.mjs), **0x1006** original-charge, **0x2005** multi-session + **0x2009** routing (세션변경), **0x0322→0x0323** info-panel card. 공지 builder added but NOT wired (transport drops extraInners on lobby-login-ok; 0x2003 code collision; needs lobby-response-kind emit).
- **content/planet-economy.json**: 281 planets w/ procedural population/food/industry (for NotifyBaseParameter info panels — galaxy.json has only name+orbit).

## 🔑 KEY RE FINDINGS (full specs in the workflow output files, see below)
- **In-game command menu = constmsg #0–63** (#0 旗艦용 커맨드 / #1 戦隊용 / #2-3 gating headers; #4-30 verbs 이동/공격/사격/백병전…; #31-54 toggles; #55-63 missions). All translated.
- **Command dispatcher = `FUN_004b78a0`**: actionId-1 → switch → send opcode + expected-response opcode. Map: 이동=0xb01(→0xb07), 0x400 MoveShip, 0x405 AttackShip, 0x406 Shoot, etc. Server move path (0xb01→command-engine→0xb07 broadcast) is ALREADY correct.
- **In-world control BLOCKER (the real one)**: clicks emit nothing because 0x0313/0x0315 send the player fleet as a grid object but the **G4/G5 gates** aren't fully met — need a selectable fleet OBJECT in the sector tables (cell 0x2c03cc/obj 0x2c1755) AND PLAYER_INFO↔unit linkage via `FUN_004c2a80(1)` on 0x0b0a (mode==2). 0x0f06 now sends 0x0b09/0x0b0a (value=0 fix applied) but click→0x0b01 STILL not firing → the 0x0315 cell grid carrying the fleet value may be dropped, or the linkage gate unmet. Also add **0xb01 self-echo** so SelectGrid FSM (FUN_005751b0) closes on the mover. (docs/logh7-strategic-input-wire.md.)
- **Names in client**: system names **80/80 IN client** (constmsg #1406-1490); planet names **271/281 NOT** in client (5 only); character roster names **NOT** in client. → planet/char names need external injection (galaxy.json / canon roster + portrait-namer KO names).

## 🟡 REMAINING (user goal = fully playable + all-Korean game)
1. **Live-verify the new lobby handlers** — relaunch, click 새캐릭터/오리지널추첨 → confirm they now ENTER (the 0x1002 fix). NOT yet live-tested.
2. **In-game UI handlers (all)** — strategic commands (0xb01 self-echo + ensure fleet object selectable), duty cards (직무카드, logh7-personnel), combat UI (tactical mode==0), info panels wiring (use planet-economy.json via NotifyBaseParameter). Specs in w2xh1y4z6 output.
3. **In-world control** — make click→0x0b01 actually fire (the G4/G5 grid-object + linkage; live frida memory-dump of 0x126710/0x126711/0x41a364/PLAYER_INFO at click recommended).
4. **Galaxy markers render** — 80 system markers not visibly drawn (0x0315 cell-grid drop suspected).
5. **Planet names KO** — inject 281 galaxy.json planet names (translate to KO, push as content).
6. **Pillarbox** — dgVoodoo D3D8 deployed + compatible, but `Resolution`/`centered_ar` override NOT taking (game keeps setting 1024×768 mode → monitor stretches). Native=1920×1080. Try dgVoodooCpl GUI config OR NVIDIA CP "aspect ratio" scaling (GTX1660Ti). conf at .omo/tools/dgvoodoo2/extracted/dgVoodoo.conf.
7. **공지 (announcement)** wire as lobby-response action (builder exists). **캐릭터 삭제** handler. **g7sw.dat** GFWR translation.
8. **Lottery↔names** — wire canon roster (portrait-namer KO names) into the 0x1006 lottery candidates so in-game shows Korean canon names.

## 📁 ARTIFACTS / PATHS
- Korean client: `.omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe` (+ _pristine.exe, _step2.exe intermediates).
- KO data: `.omo/work/logh7-ko-overlay/data/MsgDat/*.dat` (20 files). Translation worklist+batches: `.omo/localization/`.
- dgVoodoo: `.omo/tools/dgvoodoo2/extracted/` (D3D8.dll + dgVoodoo.conf).
- planet economy: `content/planet-economy.json`. Galaxy: `content/galaxy.json` (80 sys/281 planets, JP names).
- **RE workflow outputs (FULL specs — read these!)**: lobby UI `…/tasks/wndew4jop.output`, in-game UI `…/tasks/w2xh1y4z6.output` (under `C:\Users\user\AppData\Local\Temp\claude\E--logh7-revival\<session>\tasks\`). Parse `d['result']` JSON → {lanes, plan}.
- Decode MsgDat: `PYTHONPATH=tools:. python -c "from logh7_msgdat import index_msgdat_file; from pathlib import Path; ..."` (pass Path, not str).
- Portrait namer (canon face↔KO name): Desktop `LOGH7-OriginalPortraitNamer` + repo `tools/standalone/original-portrait-namer/`.

## ⚙️ GOTCHAS
- ui_explorer `cmd_start` restores String.txt from `String.txt.original` every launch → write KO String.txt to `.original` (not String.txt).
- Server restart drops the live conn3 → must re-drive login→world each time (batch server changes).
- Process file-lock: after taskkill G7MTClient, wait ~1.5s before overwriting the exe.
- GetSystemMetrics may read a stale 1024×768 after a fullscreen exit; native is 1920×1080.
- Not committed (459→472 tests pass). Modified: src/server/logh7-login-session.mjs, logh7-login-protocol.mjs, logh7-account.mjs(?), + tests. New: content/planet-economy.json, docs, tools.
