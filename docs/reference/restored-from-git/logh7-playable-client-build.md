# LOGH VII — Playable Client Build & Lobby-Button Regression (living doc)

Updated: 2026-06-15. Living document — append/update as fixes land. Purpose: make the
playable client **reproducible** and **non-regressing**, per the user directive
"성공하면 뒤로 못돌아오게 최종 exe 패치본을 만들면서 가도록 문서에 적어놔."

## 1. The canonical playable client

The playable client = localized base EXE + an ordered, drift-checked stack of same-length
binary patches that fix client-side regressions the server cannot reach.

- Builder: `tools/logh7_build_playable_client.py`
- Version-controlled patch specs: `tools/client_patches/*.json`
- Output: `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` (+ `*.playable-manifest.json`)

```
python -m tools.logh7_build_playable_client            # build only
python -m tools.logh7_build_playable_client --deploy   # build + deploy + overwrite ui_explorer backup
```

Patch stack (applied in order; each same-length + drift-checked against current file state):

| # | patch | spec | effect | verified |
|---|---|---|---|---|
| 1 | menufix | `tools/client_patches/menufix.json` | enable lobby buttons 1-4 (NewChar/Lottery/Delete/Session); scene 0x16 hardcodes them disabled | **live (clickable)** |
| 2 | dlgfix | `tools/client_patches/dlgfix.json` | repoint generic-dialog confirm-button labels (login-error → 결정/취소) | applied; not live-verified |
| 3 | brightbtn | `tools/client_patches/brightbtn.json` | force the bright/active button sprite (UV-Y rows → frame0 0x209) | **REVERTED out of default build per user 2026-06-15** ("일단 버튼 이미지는 되돌려"). Was live-verified (RGB 17,77,140→~20,115,213) but cosmetic only — buttons still did not respond to clicks. Spec kept; include only via explicit `--patches`. |

Reproducibility proof (2026-06-15): `korean.exe (466725e2…)` + menufix + dlgfix →
`playable.exe (1f7fad43…)`, byte-identical to the hand-built `G7MTClient.korean.menufix.dlgfix.exe`.
All 6 patch bytes verified (menu `01×4`, dlg `62×2`).

## 2. Why the lobby buttons "regress" (root cause, byte-verified)

The four lobby buttons (새 캐릭터 작성 / 오리지널 추첨 / 캐릭터 삭제 / 세션 변경) are **hardcoded
disabled** by the lobby scene driver `FUN_0051a370` (scene 0x16): it builds the 8-button enable
array `[1,0,0,0,0,1,0,1]` from eight `mov byte [esp+disp],imm8` immediates. Only `menufix`
flips the four imm8 `00→01`. Server data can never enable them.

**Regression vector (the "다시 안 눌린다" cause):** the patched bytes live ONLY in the patched
EXE. But:
- `ui_explorer stop` restores the vanilla EXE (SHA `2848be76…`, menu **disabled**).
- the default `ui_explorer start` (no `--patched-exe`) applies only `apply_lobby_unblock_patch`
  (NOT menufix) → menu **disabled**.
- `base korean.exe` and the old `.uiexplorer` backup are both menu **disabled** (`00 00 00 00`).

So unless the **playable EXE** is the one running, the buttons revert to disabled. Verified by
reading the four imm8 across all EXEs (only `menufix*`/`dlgfix`/`playable` are `01`).

**Anti-regression (closed):** `--deploy` copies the playable EXE to BOTH the installed
`G7MTClient.exe` and the `G7MTClient.exe.uiexplorer` restore-backup, so a `stop` can no longer
revert to a menu-disabled EXE. Always run with `--patched-exe …/G7MTClient.playable.exe`.

## 3. The "dark/dim button" issue (= the same "disabled" problem, per user)

User report: the buttons should render **bright/active**; currently they are **dark/dull**, and
this is the *same* problem as "not clickable" — the buttons are in a **disabled-looking state**.
"전엔 밝게 나왔다" → it is a regression from a bright/active state.

Live measurement (2026-06-15, playable EXE running): all 8 buttons render a uniform dark
medium-blue ≈ `RGB(18,77,140)` (brightness ~78). The atlas bright "active" sprite
(`data/image/gamemenu/menu_parts.tga`, idx 146 = `RGB(22,121,227)`) is far brighter. Ratio
≈ **0.63×** on G/B, uniform across ALL buttons **including the natively-always-enabled 게임시작** —
so this is NOT the per-button menufix enable byte (which only adds ~10 brightness). It is a
separate **draw-state / color-modulation / sprite-selection** that draws the buttons dim.

Atlas evidence: `gamemenu/menu_parts.tga` (1024², 8-bit paletted, 32-bit BGRA, idx0=transparent)
contains stacked button-bar sprites by state: bright-glossy (active), very-pale (hover/highlight),
dark-navy ×2 (disabled/pressed). The game is selecting a dim state.

**Status: NOT yet fixed.** Binary RE in progress (find the state→sprite/modulation selector in
the button draw path; design a same-length patch like menufix). When found, it becomes
`tools/client_patches/brightbtn.json` and slots into the playable build (stack #3). Do not paint
a glow into the texture — the fix is the engine's own bright/active state.

Weak secondary lead (recorded, not the cause): `GraphicConfig.txt` has all texture levels at 0
(`ModelTextureLevel/BGTextureLevel/StarsModelLevel=0`); LOD/detail, not brightness — but worth
raising to max as a general quality pass on a future restart.

## 4. Related server fix this session — empty session list (0x2005 → 0x2006)

Clicking 새 캐릭터 작성 sends `0x2005` (RequestInformationSession, sub-args 02/01); the
session-select list rendered **0 rows** (regression). Root cause: a P12 `useCompactLobbySession`
`auto` router diverted the live variant-01/02 requests to the old packed builder
(`buildLobbyInformationSessionInner`, wrong offsets), so the client parser `FUN_00444900`
(fixed stride 0x14c) read garbage → 0 valid records. Fix: in `src/server/logh7-login-session.mjs`
the `0x2005` handler now always falls through to the fixed-stride `buildInformationSessionInner`
(P0 RE layout); the packed shape stays behind the explicit `LOGH_LOBBY_SESSION_LAYOUT=compact`
A/B knob. Tests: `node --test tests/server/*.test.mjs` → **601/601**. Live: `0x2005` now answered
with `respLen 21258 (0x530a)`. (Session rows still need the bright/clickable button fix to be
exercised end-to-end live.)

## 5. Run procedure (canonical)

```
python -m tools.logh7_ui_explorer stop
python -m tools.logh7_ui_explorer start --port 47900 \
  --env LOGH_CONTENT_DB=1 --env LOGH_ACCOUNT_DB=.omo/work/e2e-accounts.sqlite \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_SS_FORMAT=message32 --env LOGH_WORLD_PLAYER=1 \
  --env LOGH_STRAT_GRID=1 --env LOGH_STRAT_GALAXY=1 --env LOGH_STRAT_GRID_EARLY=1 \
  --env LOGH_STRAT_FLEET=1 --env LOGH_TACTICS_UNIT=1 --env LOGH_GRID_ENTER=1 \
  --env LOGH_KO_NAMES=1
```
- As of 2026-06-18 v50, `ui_explorer start` selects `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`
  by default and the canonical playable stack is `menufix`, `dlgfix`, `earlygrid-ringclear` with SHA
  `e75486ef762787448d91e38a612103f6d11691833c36a6bcb30d13a9cbdb2366`.
- `build-installed` must deploy a playable client with that stack as the final `exe/G7MTClient.exe`;
  the launcher sets `LOGH_STRAT_GRID_EARLY=1`, so shipping the un-ringcleared extracted EXE is invalid.
- Do NOT set `LOGH_ROSTER_PUSH=1` / `LOGH_DUTY_CARDS=1` / `LOGH_DUTY_CARDS_PRELOAD=1` /
  `LOGH_DUTY_CARDS_POSTLOAD=1` during normal live QA.
- Screenshot (GDI window-capture is black due to D3D8): `python -c "from PIL import ImageGrab; ImageGrab.grab().save('.omo/work/shot.png')"`.
- Lobby buttons (screen coords, 1024×768): 게임시작 y≈192, 새캐릭 y≈249, 추첨 y≈306, 삭제 y≈363, 세션변경 y≈420, 환경설정 y≈477, 크레딧(disabled) y≈534, 종료 y≈591; x≈120.
- v50 live proof: installed `exe/G7MTClient.exe` is canonical playable SHA
  `e75486ef762787448d91e38a612103f6d11691833c36a6bcb30d13a9cbdb2366`; lobby Korean labels render, an existing
  character reaches the HUD, minimap movement reveals visible Korean system labels (`베큘라`, `발할라`), and
  `0x0f06 -> 0x0f07 -> 0x0b09/0x0b0a` grid-enter notifies arrive. Native star-click command emission
  (`0x0b01`) is still pending.
  Remaining gaps are data/protocol: character/HUD labels still show partial wrong text/NO DATA. The server trace
  did emit post-load `0x0b09/0x0325/0x0323/0x0b0a/0x0356/0x1200/0x1202/0x1201` plus the normal world-login
  `0x0305/0x0307` family; P56 later proved those `0x0305/0x0307` frames are not a duty-card command-table path. The unclosed
  gap is client-origin interaction (`0x0f08`, `0x0b01`, `0x0b07`) and the visible HUD/marker consumption.

## 6. THE "buttons don't click" mystery — RESOLVED (input method, not a game bug)

User confirmed: **the lobby buttons DO respond to a real physical mouse.** The long-standing
"안 눌린다" was never a button/menufix/lobby bug — it was that synthetic/remote clicks
(`SetCursorPos` + `mouse_event`, used by ui_explorer AND likely the /rc remote control) do not
drive the game's in-game cursor.

Live frida findings (`.omo/work/probe_*.py`):
- The in-game scenes poll the **button** via `GetAsyncKeyState(VK_LBUTTON)` (saw the click — 14
  down-polls) but read the cursor **position** via `GetCursorPos` **only while the mouse is
  moving** (575 polls during injected movement; **0** polls during a `SetCursorPos`-only click).
- So `SetCursorPos` (no movement event) leaves the game's last-known cursor stale → the down/up
  lands at the wrong place → the widget never fires. The lobby FSM (`FUN_0051a370`) and its button
  event-scan (`FUN_00501ed0`) were confirmed *running* the whole time (probe_lobby_gates.py) — the
  click simply never hit-tested a button.
- Earlier dead-ends ruled out: lobby_unblock scene-active gate (already NOP-applied in base
  korean.exe), recv-pump outstanding-count freeze (lobbyfsm patch did NOT fix it → reverted),
  success-flag 0x35837b (set; client reached 0x2003/0x2005).

**FIX (tooling, `tools/logh7_window_login.py:_click`):** glide the cursor in with injected
ABSOLUTE `mouse_event` MOVE and keep it moving *through* the down/up so a `GetCursorPos` poll
coincides with the button edge ("jiggle click"). Synthetic clicks now fire like a physical mouse.
**Verified live: 게임시작 → 캐릭터 선택 화면 (2 characters); 새캐릭 → scene transition.** This also
fixes the project-wide in-game UI automated-verification reliability (all prior in-game click
tests were unreliable for this reason). Implication for the /rc remote control: it must inject
cursor MOVEMENT (not just position) for the user's remote clicks to register in-game.

## 7. New-char / lottery flow — historical blocker (session list)

Status correction: this section records the 2026-06-15 blocker state. The 2026-06-16 packed-wire
fix later resolved the empty session picker; see `docs/SESSION-HANDOFF-2026-06-16.md` §1/§16 for
the current live verification through faction/gender/origin/name-entry.

With reliable clicks: 게임시작 → 캐릭터 선택 works (roster renders). But **새 캐릭터 작성 / 오리지널
추첨 → a "서버 공지" (SysSessionAnnounceNotify 0x2003) panel flashes, then an EMPTY session-select
panel** (user reported the 서버공지). Double-clicking the session-row position (≈747,260) sends no
message → there is no session row → the flow cannot reach the 8-step creation form.

Historical blocker detail: the **session list (0x2006) was not rendering any rows**, even though §4's
server fix made the wire format correct (601 tests, `respLen 21258=0x530a`, opcode 0x2006). Next
RE: why the client parser `FUN_00444900` shows 0 rows live — candidates: the client sends 0x2005
twice (variant 0x02 then 0x01) and only one is answered; or the per-record `status` (1/2 =
selectable) gate; or a record-stride/field mismatch. Now testable live via the jiggle click.

## 8. Player-facing EXE runtime — no Python QA tool required

As of 2026-06-16, the installed-tree play entrypoint is:

```text
.omo/work/logh7-installed/LOGH7Launcher.exe
```

`LOGH7Launcher.exe` is a compiled Windows launcher that separates the local server runtime from the
legacy client:

- client: `.omo/work/logh7-installed/exe/G7MTClient.exe`
- server runtime: `.omo/work/logh7-installed/logh7-runtime/src/server/logh7-server.mjs`
- server content: `.omo/work/logh7-installed/logh7-runtime/content`
- persistent state/logs/traces: `.omo/work/logh7-installed/logh7-runtime/{state,logs,traces}`

The launcher validates Node.js, the server entry, and the canonical Korean playable client; writes
the per-user BOTHTEC install registry key; starts `serve-auth` on `127.0.0.1:47900`; then launches
`exe/G7MTClient.exe` from the correct working directory. The normal user path is double-clicking
`LOGH7Launcher.exe`; `launch-client.ps1` is only a wrapper around the same executable.

Build/stage command:

```bash
python -m tools.logh7_build_player_launcher --installed-root .omo/work/logh7-installed
```

Final smoke evidence (G251):

- installed client SHA remains canonical playable:
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`
- `LOGH7Launcher.exe --check` passed.
- `LOGH7Launcher.exe --server-smoke` started the local server and exited cleanly.
- `LOGH7Launcher.exe --client-smoke` started the server, started `G7MTClient.exe`, verified the client
  survived 5 seconds, then cleaned up.
- After smoke, port `47900` was closed and no `G7MTClient.exe` process remained.
- Evidence JSON: `.omo/ulw-loop/full-revival-20260615/evidence/g251-player-launcher-runtime/summary.json`

Boundary: this closes the player-facing startup/packaging gap. It does **not** claim full strategic
gameplay completion; movement/command activation still needs a fresh `0x0b01->0x0b07` loop or a
proven equivalent, and original server-authoritative system/planet/building/office/action-context
tables remain unrecovered.
