# LOGH VII — In-World Backlog PROGRESS LOG (living handoff)

**Purpose:** phase-by-phase progress for the full in-world implementation backlog. If this session is
interrupted (token/context exhaustion), **hand off to Codex** by giving it this file + the plan doc.
Append a dated entry at the end of every phase. NEVER delete history — append only.

**Resume in 3 steps:**
1. Read `docs/logh7-inworld-backlog.md` (the full plan: root cause, entity catalog, TIER A/B, critical path).
2. Read this file's **CURRENT STATE** + **NEXT ACTION** below.
3. Run the client (RUN COMMAND below) and continue from NEXT ACTION.

---

## RUN COMMAND (safe P0-02 baseline, no relay/NPC)
```
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/p0-02-coordinate-check stop
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/p0-02-coordinate-check start --port 47900 --no-login \
  --env LOGH_ACCOUNT_DB=.omo/work/p0-01-accounts.sqlite \
  --env LOGH_LOBBY_OK_FORMAT=message32 \
  --env LOGH_LOBBY_RICH_CHARACTERS=1 \
  --env LOGH_LOBBY_EARLY_OK=1 \
  --env LOGH_SS_FORMAT=message32 \
  --env LOGH_WORLD_PLAYER=1 \
  --env LOGH_STRAT_GRID=1 \
  --env LOGH_STRAT_FLEET=1 \
  --env LOGH_STRAT_GALAXY=1 \
  --env LOGH_TACTICS_UNIT=1 \
  --env LOGH_GRID_ENTER=1 \
  --env LOGH_POSTLOAD_RICH_CHARACTER=1 \
  --env LOGH_CONTENT_DB=1 \
  --env LOGH_KO_NAMES=1
$env:LOGH_P0_PASSWORD="<로컬에서만 설정한 8자 ASCII 비밀번호>"
$env:LOGH_P0_PASSWORD | python -m tools.logh7_ui_explorer --session .omo/ui-explorer/p0-02-coordinate-check login --account p001flow --password-stdin
```
- Enter world: `click 128 197` (game start) → settle 3s → `click 520 270` ×2 (char double-click) → world.
- Screenshot: `python -c "from PIL import ImageGrab; ImageGrab.grab().save('.omo/work/shot.png')"`.
- Frida marker probe: `python .omo/work/probe_markers.py <clientPid>` (clientPid via `ui_explorer info`).
- Tests: `node --test tests/server/*.test.mjs`.
- GOTCHAS: do NOT set `LOGH_NPC_AI=1`, `LOGH_RELAY=1`, `LOGH_AUTHORITATIVE=1`, `LOGH_DUTY_CARDS=1`,
  `LOGH_DUTY_CARDS_PRELOAD=1`, `LOGH_DUTY_CARDS_POSTLOAD=1`, or `LOGH_ROSTER_PUSH=1`
  for the default P0-02 QA path. `LOGH_STRAT_GRID_EARLY=1` is now part of the canonical
  playable ringclear path; the server must suppress duplicate late grid replay after `0x0f02`.
  `cmd_stop` restores the EXE/String.txt state and verifies the client SHA.

---

## PHASE STATUS
| Phase | Item | Status |
|---|---|---|
| 0 | Comprehensive RE (markers/systems/entities/text) | ✅ done → backlog.md |
| 0 | Ability seed (char-stat NO DATA) | ✅ applied + tests |
| 0 | A0 marker snapshot fix (server 0x0312/0x0314 real grid) | ✅ canonical ringclear + early grid live: v50 shows Korean star labels (`베큘라`, `발할라`) and grid-enter notify reaches the client; native `0x0b01` writer still pending |
| 0 | Canon content tables (ranks/medals/fortresses/ship-stats) | ✅ done (ranks 28, medals 52, fortresses 6, ship-stats 63) |
| 1 | World entry restored (gate off) verified live | ✅ full walk → 0x0f03, strategic map loads |
| 1 | A1 fleet record / A2 fleet entity | ✅ builder+entity (613 tests); live wiring later |
| 1 | A4 wire real 0x031d (KO names) | ✅ P12 (0x031c→0x031d from contentPack.systems) |
| 1 | A3 planet economy (0x0337) builder + loader | ✅ P2/P12 logh7-base-economy.mjs |
| 1 | A3 true 0x031f ResponseInformationBase builder | ✅ P17 logh7-base-record.mjs (byte-exact, 10 tests); wiring in flight (a7e81cf) |
| 1 | A5 marker real labels (group 0x18) + extra types | ☐ (gated on client marker render wall) |
| 1 | A6 char record 42 fields | ✅ P10 (state/fame/pcp/mcp/money/influence, delayed 0x0f06 resend) |
| 1 | A7 scenario/session world-state | ✅ P12 (0x2005→0x2006 fixed-stride builder) |
| 1 | 0x0321 ResponseInformationInstitution builder | ✅ P17 logh7-institution-record.mjs (byte-exact, 13 tests; old builder +4/−4 bug found); wiring in flight (a7e81cf) |
| 1 | NEW modules authored (economy/scenario/rank/fortress) | ✅ 4 modules + 51 tests; suite 641/641; A3/A7 wired, rank/fortress not |
| 2 | TIER B (rank wiring, 0x031f, fortress, troops, institutions, diplomacy, mail, tick) | ☐ |
| 3 | STEP 5 battle-end + 2-client live loop verify | ☐ |

**New modules ready to wire (created P2):** `src/server/logh7-base-economy.mjs` (buildNotifyBaseParameterInner + loadPlanetEconomy, A3), `logh7-scenario-session.mjs` (createScenarioState + buildInformationSessionInner, A7), `logh7-rank-table.mjs` (rankName/rankId, B1), `logh7-fortress.mjs` (loadFortresses/fortressMarkerObjects, B4). Each has tests/server/<name>.test.mjs. Integration = call from login-session.mjs world-init / panel-read handlers — DO live-test each for walk-stall first (see A0 lesson).

---

## LOG P3 (markers + A6) — 2026-06-15
- **MARKER DATA FIX = LIVE PASS.** marker-client-re built `.omo/work/probe_marker_fix.py` (frida): seeds
  STAGING (obj table→clientBase+0x3f57d4, cell grid→+0x3f4448), clears guard +0x2c03c0, calls
  FUN_004c5350. Ran vs live in-world client → VERDICT PASS: LIVE class-3=81, LIVE cell markers=81
  (values 3..83). Companion binary patch `.omo/work/marker-fix/snapshot-rerun.codepage_patch.json`
  (VA 0x4c535a 753d→9090, NOP run-once guard). RE: 0x0f02 grids DO reach staging but are stranded behind
  the run-once guard (snapshot fires on scene-enter first); real 0x0315@0x0314 reentrantly calls
  FUN_004c2a30 which zeroes the pending-send ring → walk stall (so server-early-grid is impossible).
- **MARKER VISUAL RENDER GAP (open):** despite 81 in the LIVE cell/object tables, NO markers draw — the
  RENDER table DAT_009d1520 (built by FUN_004d3bd0 scanning live cells for class-3) was not rebuilt after
  the late data poke. Camera move (minimap click + arrow pan) did NOT trigger it (user-confirmed). marker-
  client-re [a29d846] is extending probe_marker_fix.py to call/trigger FUN_004d3bd0 directly + screenshot.
- **A6 FIX A applied** (login-session.mjs grid-enter 0x0f06/SS_REQ_MESSENGER_STAT_CODE handler): re-send
  0x0325 + 0x0323 BETWEEN 0x0b09(begin,reset) and 0x0b0a(end,trigger) so FUN_004c2a80(1) finds a resident
  char record and builds the player-slot entity (clientBase+0xc) — without which the HUD shows
  "이미 탈퇴하셨습니다" + NO DATA. Tests 584/584. NEEDS LIVE VERIFY (restart + re-enter).
- **A6 FIX B (pending):** builder must also write PCP@record 0x50 / MCP@record 0x54 (entity+0x74/+0x78,
  NOT derived from ability_8) + state@0x06 + influence@0x1a8. nodata-re gave exact offsets. Do after FIX A
  live-confirms the entity builds.

## LOG P4 (marker render — data proven, render-trigger open) — 2026-06-15
- **DATA fix = PROVEN** (4 live runs, always PASS): probe_marker_fix.py seeds staging + clears guard +
  FUN_004c5350 → LIVE class-3=81, LIVE cell markers=81. Solid.
- **RENDER fix = OPEN.** The render-table DAT_009d1510 (128×0x28, valid records the per-frame drawer
  FUN_004d6b70 reads) is built ONLY by FUN_004d3bd0, which ALSO creates the D3D icon node per marker
  (record+0x20 via FUN_004d1e70) — so a hand-written table crashes the renderer; only FUN_004d3bd0 yields
  drawable records. marker-client-re corrected the ABI: FUN_004d3bd0 = __thiscall(ecx=0x009d2a30, 1 stack
  arg = *(*(0x7c1b4c)+0x2a418)), ret 4; rebuild wrapper FUN_004c8a10. BUT all frida cold-call variants
  FAULT live ("access violation 0x4/0x8") — the scene object needs a runtime state a cold call doesn't
  satisfy. Clearing the built flag (*0x7cd048, already 0 live) + nudging the map (minimap/keys) did NOT
  re-run the scene build. So FUN_004d3bd0 only re-runs on a genuine SCENE RE-ENTER, not a frida poke.
  Runtime dump (mode=2): *(0x7cd048)=0, *(0x7cd048+4)=scene param (valid), *(0x7c1b4c) sceneRoot valid.
- **ROBUST PATH (recommended, not yet tested):** the binary patch
  `.omo/work/marker-fix/snapshot-rerun.codepage_patch.json` (VA 0x4c535a 753d→9090) makes FUN_004c5350
  re-run on EVERY scene-build (FUN_004c2a30). Since the 0x0f02 grid IS in staging (stranded behind the
  guard), a NATURAL strategic-scene RE-ENTER (leave to a panel/battle and return) then re-promotes
  staging→live AND re-runs FUN_004d3bd0 → markers render with real icon handles. NEXT: apply that patch,
  restart, enter world, trigger a scene re-enter (RE the exact UI action), screenshot. This is the
  distributable fix; the frida render-call is a dead end (faults).
- Camera: FUN_004d3540 projects col/row onto a fixed board plane at the default camera — no pan needed
  once the table builds (systems spread col 2..99/row 2..49).

## LOG P5 (marker render WALL + live findings) — 2026-06-15
- **Marker render = genuine WALL this session.** Call chain: FUN_004b68f0 (world FSM @0x4b68f0) →
  FUN_004b64c0 (scene build @0x4b64c0, mode-gated on clientBase+0x126711) → FUN_004c8a10 (@0x4c8a10, NO
  internal guard — rebuilds every call: FUN_004c8a70 free + FUN_004d3bd0 build + FUN_004c8bc0) → FUN_004d3bd0
  (@0x4d3bd0 scans live cells clientBase+0x2c03cc, writes render-table 0x9d1510 stride 0x28, creates D3D icon
  node per marker via FUN_004d1e70). The render-table build runs ONCE during world-init (FSM state), with
  EMPTY cells (data arrives later). After the frida data fix populates live cells, the build does NOT re-run:
  the FSM only re-enters the build state on a FULL SCENE TRANSITION (battle enter/exit), NOT on overlay UI
  (info panels, camera pan, zoom, panel open/close — all TRIED live, none re-trigger). And battle-entry needs
  a clickable marker (circular). frida COLD-CALLS of FUN_004c8a10/FUN_004d3bd0 CORRUPT the D3D scene (3D
  galaxy → gray; FUN_004c8a70 frees an invalid handle at fieldObj+8; even fixing +8 crashes elsewhere).
- **What IS proven live:** marker DATA fix = 81/81 in live cell+object tables (repeatable PASS). Char info
  panel (정보 menu → 캐릭터 정보, 0x0322→0x0323) RENDERS a row "소속 진영=통일 | 캐릭터 이름=---" → the
  server→client PANEL data path works (faction shows; name "---" = content-pack char #1 has no nameRomaji).
- **DOCUMENTED PATHS to finish markers (next session / Codex):**
  1. Decompile FUN_004b68f0 to find the FSM state byte (clientBase+0x126711 transition) that re-enters the
     build, set it safely via frida so the GAME's own FUN_004b64c0 rebuilds (no cold-call corruption).
  2. OR binary-patch the per-frame render path to also call FUN_004c8a10 (game-native, valid state) — needs
     a call-insertion patch (not same-length), or patch FUN_004b68f0 to keep the build state active.
  3. OR the snapshot-rerun binary patch (.omo/work/marker-fix/) + a real battle enter/exit once any one
     marker (the fleet) is clickable.
- **A6 HUD also NOT solved live:** FIX A (re-send 0x0325+0x0323 between 0x0b09/0x0b0a) applied + tests 584/584,
  but the in-world HUD still shows "이미 탈퇴하셨습니다"/NO DATA — the player-entity build (FUN_004c2a80(1) at
  0x0b0a) is still not producing the slot. Likely the extra-inner ordering (client may process 0x0b0a before
  the re-sent 0x0323 is resident) or a FUN_004c2a80 gate beyond id/grid-unit match. Needs a live frida probe of
  FUN_004c2a80's exact gate + entity table clientBase+0xc after 0x0b0a. FIX B (PCP@0x50/MCP@0x54/state@0x06)
  pending FIX A.

## LOG P6 (marker render — FINAL: runtime-poke dead-end, needs invasive binary patch) — 2026-06-15
- **8 live attempts, all fail.** The render-build FUN_004d3bd0 CANNOT be invoked manually without
  corrupting the D3D scene (galaxy → gray), in EVERY configuration: cold frida call, render-thread hook
  (Interceptor on FUN_004b6840, D3D device current), and with the free-skip (clear *0x7cd048=0 so
  FUN_004c8a70's FUN_004d4d20 resource-free is skipped). The render-thread call STILL threw "system error"
  AND grayed the scene. So manual FUN_004d3bd0 is OFF THE TABLE.
- **The architectural wall (fully RE'd):** the field build is a ONE-SHOT gated by clientBase+0x35837f,
  fired by the FSM FUN_004b68f0 only when the world-init walk FUN_004b76e0 completes — ONCE, with EMPTY
  cells (the 0x0f02 grid arrives but the scene snapshot froze empty first). Re-arming it (clear 0x35837f,
  or the game's own rebuild-request clientBase[0]=1 via FUN_004fef90 case 3 / FUN_004e96f0) re-runs the
  FULL walk, whose FUN_004c2a30 ZEROES 0x8..0x3552b4 — WIPING our seeded strategic tables 0x2c03cc/0x2c1755
  — and re-requests the grid via the broken 0x0314/0x0f02 path. So every native re-trigger destroys the
  data; every manual build call corrupts the scene. The two are mutually exclusive at runtime.
- **CONCLUSION:** markers need an INVASIVE BINARY PATCH (not runtime), e.g. ONE of: (a) patch FUN_004c2a30's
  memset range to EXCLUDE the strategic tables 0x2c03cc/0x2c1755 so a re-walk preserves seeded data, then
  the natural build picks them up; (b) patch the grid delivery so the real 0x0313/0x0315 reach staging
  BEFORE the one-shot build fires (defeat the 0x0314 reentrant-stall, e.g. patch FUN_004abbb0 / the walk
  ring so a real 0x0315 at 0x0314 doesn't call FUN_004c2a30); (c) patch FUN_004d3bd0/FUN_004c8a70 so a
  manual build is non-destructive. All are multi-step binary-patch RE for a FOCUSED session. The frida
  data fix (.omo/work/probe_marker_fix.py) + the snapshot-rerun patch remain as building blocks.
- **NET for markers this session:** DATA path 100% proven (81/81 live, repeatable) + full client RE of the
  render pipeline + the exact wall + 3 candidate binary-patch fixes documented. Visual render = NOT done.

## LOG P7 (A6 root cause + 정보-panel spec — actionable server fixes for Codex) — 2026-06-15
nodata-re delivered the EXACT server fixes (decompile-confirmed). These are READY TO IMPLEMENT:

**A6 HUD root cause (why FIX A failed):** the player-slot entity (clientBase+0xc) is built ONLY by
FUN_004c2c80(0,rec) inside FUN_004c2a80 (@0x4c2a80). The 0x0b0a dispatcher case calls FUN_004c2a80(1)
ONLY when the world MODE byte clientBase+0x126711 == 2 (strategy) or == 0 (tactics). That mode byte is
set by the CLIENT's frame-driven Field_Import (FUN_004c4170→mode=2 via FUN_004c45f0), NOT by any server
message. When our re-sent 0x0b0a was processed, the client had NOT finished Field_Import → mode was
pre-import (≠2,≠0) → both 0x0b0a branches skipped → entity never built. The data gates (id==*0x3584a0,
flagship@0x24==0x0325 unit) are already satisfied — ordering/mode is the blocker.
  **FIX (server, login-session.mjs):** DEFER the 0x0b09/0x0b0a + re-send to a LATER client request (the
  0x0f06 messenger-stat tick the client repeats in-world), AFTER the client reached mode==2 — NOT inline
  with the 0x0f02/0x0f03 burst. Sequence: 0x0b09(value byte=0, required for the mode==2 branch via
  clientBase+0x4376ec) → re-send 0x0325 → 0x0323 → 0x0b0a(value 0x01). FRIDA PROBE to confirm mode at
  0x0b0a time: read clientBase+0x126711 (want 2/0), +0x4376ec (want 0), +0x36a5dc (charCount≥1),
  +0x41a364 (unitCount≥1), +0xc+0x24 (playerSlotId==selChar) — snippet in nodata-re output a7e6208b.

**정보-menu panels (testable WITHOUT markers, via toolbar 정보 menu):**
- 캐릭터 정보 roster = server-PUSH **0x1202 NotifySimpleInformationCharacter** (store clientBase+0x4c83a4,
  stride 0x120). Name shows "---" because `buildNotifySimpleInfoCharacterInner` (src/server/
  logh7-simple-info.mjs:174-189) writes ONLY the row id, never display_name. **FIX:** write canon name
  (u8 len + 13×u16 UTF-16LE) at the packed display_name offset (mirror of 724B rec 0x80+0x38/0x3a).
  Faction ("소속 진영") already paints (table lookup). Row-click → 0x0322→0x0323 → shows seeded abilities
  (handler login-session.mjs:694, INDEPENDENT of the broken HUD slot — so this is a clean way to display
  char stats live).
- **Do not trust `content/roster/*` as original LOGH VII server data.** Treat it as a provisional,
  AI-assisted/content-pack seed only. Originality must be proven from shipped game files/client binary
  consumers/official documents/live memory or TCP field evidence. A UI test that a roster-derived name
  appears proves the **wire/layout mechanism**, not that the name/stat row is original.
- Wire-code map (req=resp−1): 함대정보 0x032a→0x032b, 함대편성 0x032e→0x032f, 부대정보 0x0324→0x0325,
  시설 0x0320→0x0321, 인사카드 0x034e→0x034f — all have server handlers already. 기지경제 0x031e→**0x031f
  NOT built** (TIER A A3/B3). 전대/육전대 = Tactics family (0x033x, in-battle, not wired for strategic).

## LOG P8 (MARKER BINARY PATCH DELIVERED — the distributable solve) — 2026-06-15
- **Root cause (corrected):** NOT a reentrant FUN_004c2a30. The world-init walk FSM FUN_004b76e0 advances
  only when FUN_004b7890()→FUN_004b8950() returns `*(clientBase+0x357ec0)==0` (the pending-send RING must be
  empty). An empty 0x0315 drains the ring → walk proceeds. A REAL (non-empty) 0x0315 leaves the ring
  non-empty → walk FREEZES at the grid state, never reaching state-0xb (snapshot FUN_004c2a30→FUN_004c5350
  staging→live) or state-0x10 (native build, gate 0x35837f=1). Walk timeline: state 1 = grid 0x0314→0x0315;
  state 0xb = snapshot; state 0x10 = build. So if the walk advances, the real early-grid lands in staging
  and the snapshot promotes it to LIVE *before* the one-shot build — exactly the goal.
- **PATCH (surgical, grid-state-ONLY):** at the 0x0315 dispatcher arm VA 0x004bae19 (file off 0xbae19),
  force the ring counter to 0 (`xor edx,edx; mov [eax+0x357ec0],edx`) so ONLY the grid reply releases the
  walk; every other state keeps its barrier. Decode (FUN_004abbb0) + tail (jmp LAB_004bdd33) preserved;
  rel32 recomputed. Same length (30 bytes). The one dropped op (`mov [ebp-0x18],-1`) proven inert.
  - Patch JSON: `.omo/work/marker-fix/earlygrid-ringclear.codepage_patch.json`
  - **Patched EXE: `.omo/work/marker-fix/G7MTClient.korean.menufix.markerfix.exe`** (drift-checked, same
    3,956,736 B, only 0xbae19..0xbae36 changed, PE intact).
- **TEST (non-destructive, one restart):** start ui_explorer with
  `--patched-exe .omo/work/marker-fix/G7MTClient.korean.menufix.markerfix.exe` + add env
  `--env LOGH_STRAT_GRID_EARLY=1` (the matched server half: login-session.mjs:~555 answers 0x0312→real
  0x0313 and 0x0314→real 0x0315 as single okInner frames). Enter world → the real 81-marker grid lands in
  staging at the first grid request → state-0xb snapshot promotes to live → state-0x10 native build creates
  81 markers WITH proper D3D icon handles → markers render (NO frida, NO corruption). Verify: walk reaches
  0x0f03 (not stalled) + screenshot shows system markers. THIS IS THE DISTRIBUTABLE MARKER FIX — untested
  live only because the session paused for Codex handoff.

## HANDOFF TO CODEX — prioritized next steps
1. **A6 HUD** (server-only, high value): post-load 0x0f06 resend is now wired and live-proven for default
   charId=1 (P10). Still RE the charId=209/original-character world-entry crash; it dies before 0x0f06.
2. **정보 panel names**: SUPERSEDED by P9. Do **not** write display_name into 0x1202. Keep 0x1202 as
   proven id/raw bytes only; names must be driven through full 0x0323 parentage/display_name fields and
   validated from original/non-AI sources before being called original data.
3. **Markers** (binary patch — marker agent a29d846 is producing a same-length patch to defeat the 0x0314
   reentrant FUN_004c2a30 stall; test = restart with .markerfix.exe + LOGH_STRAT_GRID_EARLY=1 → native build
   picks up 81 markers). See P5/P6 for the 3 candidate patches.
4. **Module wiring** (4 modules ready, P2): A3 economy (0x031f base econ), A7 session, B1 rank, B4 fortress.
5. **A4** real 0x031d KO names (watch walk-stall — gate + live-test like A0).

## CURRENT STATE (2026-06-15)
- **A0 fix is in `src/server/logh7-login-session.mjs:522-565`** (branch: 0x0312→0x0313 obj + 0x0315 cell
  extraInner; 0x0314→0x0315 cell + 0x0313 obj extraInner; gated worldPlayerEnabled()&&stratGalaxyEnabled()).
  Constant `SS_REQ_STATIC_GRID_TYPE_CODE=0x0312` added. 3 tests in tests/server/logh7-login-session.test.mjs.
- **Ability seed** in same file ~466-475 (resolveCreatedAbilities fallback for world-init 0x0323).
- **Root cause of empty markers (confirmed):** snapshot FUN_004c5350 is SCENE-timed run-once (not network);
  freezes staging at first strategic-scene render; 0x0f02 push too late. Fix lands real grid at FIRST
  grid request (0x0312/0x0314) so staging is valid before the scene snapshot.
- **NEEDS-LIVE:** restart client → frida re-read clientBase+0x2c1755 should show 81 class-3 records;
  +0x2c03cc should show 81 non-zero cells (values 3..83); screenshot should show system markers.
  FALLBACK if scene still snapshots first: clear guard 0x2c03c0 on world-reset (client poke).
- **KO text:** codepage already 949 (frida-proven); remaining garbling = untranslated client constmsg/
  galaxy.mdx records + world-init 0x031d zero-filled (A4 fixes the wire path).

## NEXT ACTION
1. Confirm full test suite count (target: 530 baseline + new tests, 0 unexpected fails).
2. Restart client (RUN COMMAND) → enter world → frida marker probe + screenshot → CONFIRM 81 class-3
   markers render live. Record result here.
3. If markers render → proceed A1/A4/A3/A5/A6/A7 (Phase 1). If not → apply guard-clear fallback.

---

## LOG (append-only)
- **2026-06-15 P0** — RE complete (4 workflows/agents). Backlog doc written. Ability-seed applied.
  A0 marker snapshot fix applied (marker-path-re) + 3 tests. Codepage confirmed already 949. Canon
  content workflow launched (wslghyiaa). NEXT = live-verify A0 markers.
- **2026-06-15 P1** — A0 server early-grid path LIVE-PROVEN to STALL the world-init walk at 0x0314: a
  NON-EMPTY 0x0315 decode halts the walk (it never reaches 0x0f02). Removing the sibling extraInner did
  NOT help → the real cell-grid payload itself is the stall trigger (empty walker 0x0315 is a decode
  no-op, so it never stalled). Gated the path behind `LOGH_STRAT_GRID_EARLY` (default OFF). World entry
  RESTORED + verified live (full walk to 0x0f03, strategic map renders). Canon content tables done.
  Test fix: made 0x0304 duty-card test self-contained (env set/restore) — suite now 533/533 green.
  **Marker fix re-scoped → CLIENT guard-clear binary patch** (clear clientBase+0x2c03c0 after the 0x0f02
  push so the scene-timed snapshot FUN_004c5350 re-runs). CAVEAT: the pre-A0 frida probe showed the
  0x0f02 extra-inner 0x0313/0x0315 did NOT reach STAGING either (staging had 0 class-3), so guard-clear
  alone may be insufficient — need to confirm the 0x0f02 grids actually decode into staging (clientBase
  +0x3f444c/+0x3f57d4) first. Deeper client RE / a different staging-delivery timing needed.
  GOTCHA (live): after `ui_explorer start`, the FIRST game-start click (128,197) often misses; re-click
  it once the lobby is fully painted, then char double-click 520,270 ×2.
  NEXT = verifiable TIER A that needs NO markers: A4 real 0x031d (KO names, fixes 광역권 mojibake + NO-DATA
  names), A6 char fields, A3 economy. WATCH for the same walk-stall when answering 0x031c/0x031d with
  non-empty data — test each live before committing.
- **2026-06-15 P2** — User: "전부 착수 + 마커 클라 RE 동시." Launched 3 parallel background threads:
  (1) marker-client-re [agent a29d846] — RE the client snapshot/staging delivery + design a CLIENT
  binary/frida fix (why 0x0f02 grids don't reach staging; why real 0x0315@0x0314 stalls; guard-clear);
  (2) inworld-modules [workflow w9opt0lzj] — NEW modules logh7-base-economy (A3 NotifyBaseParameter),
  logh7-scenario-session (A7), logh7-rank-table (B1), logh7-fortress (B4) + tests, no hot-path edits;
  (3) nodata-re follow-up [agent a7e6208b] — exact FUN_0057a1f0 HUD validity gate + A6 field spec.
  LIVE FINDING: the applied ability seed does NOT fix the visible player HUD — PCP/MCP still 0, ability
  bars NO DATA, status "이미 탈퇴하셨습니다" (withdrawn). So the HUD gates stats on char VALIDITY (a field
  like state@0x06), and/or PCP/MCP read a different source than 0x0323 ability_8@0x188. A6/A4 hot-path
  wiring WAITS on nodata-re's field spec (avoid blind edits). Char builder accepts
  characterId/gridUnitId/power/spot/spotOwner/abilities/online/lastname/firstname/rank/face
  (login-protocol.mjs:214; writes power@0x04/spot@0x1c/spotOwner@0x20/online@0x64/ability@0x188/rank@0xd6/face@0xf4).
- **2026-06-15 P9** — CORRECTION: do **not** trust `content/roster/*` or AI-assisted roster/name output as
  original LOGH VII data. They are provisional seeds only. Originality must be proven from shipped game
  files, client binary consumers, official docs/archive evidence, live memory, or TCP captures.
  Static reader work refuted the earlier "0x1202 display_name quick win": `FUN_004c1e80` only copies
  0x1202 rows into the simple-info table, and `FUN_00539ce0` consumes row id/filter/nested fields before
  routing by id into the full character-info path. The guessed 0x1202 name mirroring was live-refuted and
  can corrupt those filter/nested bytes.
  CURRENT DIRECTION: keep 0x1202 to proven id/raw bytes only. Names for 캐릭터 정보 must be driven through
  full 0x0323 records: `parentage_len@0x7d`, `parentage[0].truth@0x80`, `display_name@0xb8/0xba`.
  Next live verification: 정보 menu -> 캐릭터 정보 -> row select, confirming whether 0x0323 display_name
  appears after the full-record fix.
- **2026-06-15 P10** — A6 HUD post-load wiring applied and recorded. `buildInformationCharacterRecordInner`
  now writes the binary-evidenced HUD fields `state@0x06`, `fame@0x10`, `pcp@0x50`, `mcp@0x54`,
  `money@0x68`, `influence@0x1a8` when supplied. `login-session.mjs` supplies non-zero server seed values
  only on the delayed 0x0f06 resend and explicit UI read paths (0x0322 detail / 0x034e card); the early
  0x0f02 world-init 0x0323 stays minimal because live QA showed early A6 seed can terminate the client
  before 0x0f06. Tests: focused RED `g215-a6-red.txt`, focused GREEN `g215-a6-delayed-focused-green.txt`,
  final server `g215-a6-final-server-tests.txt` = 587/587. Live QA: default charId=1 reached the in-world
  HUD and trace emitted `0x0f06 -> 0x0f07` plus `0x0b09,0x0325,0x0323,0x0b0a,0x1200,0x1202,0x1201`
  (`.omo/ui-explorer/session-codex-g215-default-char/shots/004-select-top-character.png`), EXE SHA restored.
  Separate blocker: `LOGH_WORLD_CHAR_ID=209` still dies before any 0x0f06 trace (`0x0f02` push -> second
  0x0300 -> ECONNRESET), so original-character/world-entry data remains a distinct RE target.
- **2026-06-15 P11** — Markerfix live verification completed as a negative result. Server regression passed
  (`node --test tests/server/*.test.mjs` = 590/590, evidence
  `.omo/ulw-loop/inworld-20260615/evidence/markerfix-server-tests.txt`). Live run used
  `.omo/work/marker-fix/G7MTClient.korean.menufix.markerfix.exe` with `LOGH_STRAT_GRID_EARLY=1`; trace reached
  world-entry traffic including `0x0314 -> 0x0315` without immediate ECONNRESET, but the client stayed on
  `NOW LOADING` and never reached strategic map mode. Read-only probes refuted marker promotion:
  `LIVE_cellsNonZero=0`, `LIVE_class3Count=0`, `LIVE_cellMarkers=0`, `STAGING_class3=0`, `MARKER_valid=0`,
  `mode(clientBase+0x126711)=0` (expected strategic mode = 2). Patch bytes at file offset `0xbae19` matched
  the markerfix EXE inside the installed EXE, so this was not a wrong-binary test. Cleanup: `ui_explorer stop`
  restored SHA (`shaVerified=true`) and port 47900 was `CLEAR`. Evidence:
  `.omo/ulw-loop/inworld-20260615/evidence/markerfix-live-entry-retry1.txt`,
  `.omo/ulw-loop/inworld-20260615/evidence/markerfix-probe-and-screenshot.txt`,
  `.omo/ui-explorer/session-markerfix/shots/012-markerfix-final.png`.
  NEXT: the P8 same-length ring-clear patch is insufficient by itself; resume RE around the post-`0x0315`
  world-init walk/state transition and staging decode path (`FUN_004b76e0` / `FUN_004b7890` / `FUN_004b8950`
  plus the `0x0315` decode destination) before trying another distributable marker patch.
- **2026-06-15 P12** — A4/A7 non-marker server wiring landed and proven by failing-first tests. A7
  `0x2005 -> 0x2006` now uses the decoded fixed-stride `InformationSession` builder from
  `logh7-scenario-session.mjs` instead of the old partial lobby-session shape. A4 `0x031c -> 0x031d`
  now answers `ResponseStaticInformationBase` from `contentPack.systems`, including the gated KO-name
  source (`LOGH_KO_NAMES=1`) without changing UTF-16LE wire encoding. RED evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/a4-a7-red.txt` failed for the expected reasons
  (old `0x2006` layout and zero-filled `0x031d`). GREEN evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/a4-a7-green.txt` = focused login-session 47/47 and
  `.omo/ulw-loop/full-revival-20260615/evidence/a4-a7-server-tests.txt` = server suite 591/591.
  Full regression output: `.omo/ulw-loop/full-revival-20260615/evidence/a4-a7-npm-test.txt` reached
  server 591/591 and Playwright 5/5; the shell tool timed out waiting for the long command, but the
  output file shows completion and a later process check found no npm/node/playwright/vite/chromium
  process left running.
  Faithful server-surface proof: `.omo/ulw-loop/full-revival-20260615/evidence/a4-a7-wire-dump.json`
  parsed real session responses showing `0x2006` count=2 (`암릿처 회전`, `버밀리온`) and `0x031d`
  count=2 (`룬비니`, `이젤론`, fortress-backed class=2). No long-lived server/browser/tmux process was
  spawned. IMPORTANT: A3 was deliberately not wired here; current `logh7-base-economy.mjs` is a
  `NotifyBaseParameter`-style path and must not be asserted as true `0x031e -> 0x031f` until the
  `0x031f` object layout is decoded/RE-confirmed. NEXT = true A3 `0x031f` RE, manual coverage matrix,
  then client live QA for A4/A7 if/when the non-marker UI path is reachable.
- **2026-06-15 P13** — Data trust policy tightened after user directive: "모든 데이터를 의심해.
  직접 RE하면서 확인." Added `docs/logh7-re-coverage-matrix.md` as the strict coverage ledger.
  Evidence tiers are now explicit: P0=binary/live/capture, P1=shipped data with known consumer,
  P2=official/manual candidate, P3=reconstructed/synthetic seed. P2/P3 may support smoke tests,
  but must not be called original server data or silently promoted into default authoritative data.
  Source comments were corrected in `logh7-canon-content.mjs`, `logh7-auth-server.mjs`,
  `logh7-content-adapter.mjs`, `logh7-entities.mjs`, and `logh7-command-engine.mjs`: current
  `CANON_CONTENT` is P3 playable seed data, not the lost original server state. Current manual
  candidate counts are pinned in the coverage matrix: 81 strategy commands, 121 org posts, 64 ship
  unit entries, 38 unit types, 65 deployments. Marker priority remains above non-rendered server
  plumbing: P11 proved marker server traffic is insufficient; next marker RE target is the client
  scene/state gate around `FUN_004b76e0` / `FUN_004b68f0`, `clientBase+0x126711`, staging/live
  grid promotion, and visible marker/click proof. A3 remains blocked on true `0x031e -> 0x031f`
  layout RE; `NotifyBaseParameter 0x0337` is not a substitute.
- **2026-06-15 P14** — Marker render priority resumed with a stricter live-over-manifest reading.
  Evidence checkpoint written to `.omo/ulw-loop/full-revival-20260615/evidence/p14-marker-scene-gate-re.txt`.
  Static RE pins the remaining render gate: `FUN_004b68f0` one-shots field build on
  `clientBase+0x35837f`, `FUN_004b76e0` state `0xb` calls `FUN_004c2a30`, and `FUN_004c2a30`
  zeroes live tables through `+0x3552b4` before `FUN_004c5350` copies staging -> live. The actual
  marker builder `FUN_004d3bd0` clears `DAT_009d1510`, scans 50x100 cells through `FUN_004c8b70`,
  and only creates marker entries when the resolved object exists and `object[1] == 3`.
  Therefore the next marker patch must be preceded by one probe that logs, per `FUN_004b76e0` tick:
  `DAT_007cd020`, pending ring `+0x357ec0`, build flags `+0x35837f/+0x358380/+0x358382`,
  branch flag `+0x35f35a`, mode `+0x126711`, field-ready `+0x2a58f8`, staging counts
  `+0x3f57d4/+0x3f444c`, live counts `+0x2c1754/+0x2c03cc`, and `DAT_009d1510` render entries
  at `FUN_004d3bd0` exit. P11 live result overrides the optimistic marker-fix manifest notes:
  markerfix still ended with `STAGING_class3=0`, `LIVE_cellsNonZero=0`, `MARKER_valid=0`,
  and mode `0` instead of strategic `2`. Do not add new server marker variants until this probe
  shows exactly whether 0x0315 staging, state-0xb snapshot, or mode/build gate is the failing link.
- **2026-06-15 P15** — Marker gate probe implemented, but live attach is still pending because
  `G7MTClient.exe` is not currently running. Tool: `.omo/work/probe_marker_gate.py`.
  Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/p15-marker-gate-probe.txt`.
  The probe is read-only and hooks the exact remaining client-side gates: `FUN_004b76e0`,
  `FUN_004b7890`, `FUN_004b8950`, `FUN_004b64c0`, `FUN_004c2a30`, `FUN_004c5350`,
  `FUN_004d3bd0`, plus dispatcher points `0x004bae19/0x004bae21/0x004bae37/0x004bdd33`.
  Each event records `DAT_007cd020`, ring/progress fields, build/mode flags, staging
  cell/object counts, live cell/object counts, and `DAT_009d1510` marker render entries.
  The per-frame `FUN_004b68f0` hook was deliberately skipped so the probe does not make
  world entry slower while scanning 5000-cell tables. Static validation passed:
  `python -m py_compile`, CLI `--help`, extracted embedded JS `node --check`,
  `ruff check --preview`, and the OMO Python no-excuse checker. Next live command:
  `python .omo/work/probe_marker_gate.py <PID> --out .omo/ulw-loop/full-revival-20260615/evidence/p15-marker-gate-live.jsonl --seconds 120 --tick-ms 1000`.
  Do not design another marker binary patch until this JSONL proves whether the failing
  link is 0x0315 decode/staging, reset+snapshot promotion, object resolution, or
  mode/scene readiness.
- **2026-06-15 P16 — LOBBY CLICK MYSTERY SOLVED (input method) + in-game automated-verification
  RESTORED.** User report "메뉴 버튼이 안 눌린다 (again)" was NOT a game/menufix bug. The buttons
  respond to a REAL physical mouse (user-confirmed). Root cause (live frida): in-game scenes read the
  cursor POSITION via `GetCursorPos` **only while the mouse is moving** (575 polls during injected
  movement; **0** during a `SetCursorPos`-only click), and the button via `GetAsyncKeyState(VK_LBUTTON)`.
  So synthetic/remote (/rc) clicks using `SetCursorPos` (no movement event) leave the game's cursor
  stale → the click lands at the wrong place → no widget fires. **This silently invalidated ALL prior
  in-game UI click verification in this project** (login worked because its screen uses a different
  input path). **FIX = `tools/logh7_window_login.py:_click`** now drives the cursor with injected
  ABSOLUTE `mouse_event` MOVE and keeps it moving THROUGH the down/up ("jiggle click"). Verified live:
  게임시작 → 캐릭터 선택 (2 chars); 새캐릭 → scene transition; clicks now emit trace events. Probes:
  `.omo/work/probe_{lobby_gates,input_model,cursor}.py`. Implication for /rc: inject cursor MOVEMENT,
  not just position.
- **2026-06-15 P16b — Playable client finalized + anti-regression DEPLOYED.** `playable.exe = korean +
  menufix + dlgfix` (SHA 1f7fad43), reproducible builder `tools/logh7_build_playable_client.py` +
  version-controlled patch specs `tools/client_patches/`. `--deploy` wrote it to BOTH installed
  `G7MTClient.exe` AND the `.uiexplorer` restore-backup, so `ui_explorer stop` no longer reverts to the
  menu-disabled vanilla (2848be76). brightbtn (bright-button sprite, user said revert) and lobbyfsm
  (recv-pump gate — refuted, the click failure was the input method not the FSM) were REVERTED out of the
  build (specs kept, excluded). Doc: `docs/logh7-playable-client-build.md`.
- **2026-06-15 P16c — Session-select 0 rows (새캐릭/추첨 → empty picker) — diagnosed, live-fix
  pending.** User's structural point: 세션 ⊃ 필드 + 캐릭터; chars render (game-start→char-select) but
  session-select is empty = incoherent. Findings: server 0x2006 wire is **byte-correct** (agent
  ab367929 independently reconciled every client-consumer offset: FUN_00444900/00593cf0/00593d90/005946d0;
  601 tests). Live trace: client sends `0x2005 variant 0x02` ONLY (payload 200502, not 02+01), gets the
  full-list `0x2006` (21258B), yet picker renders 0 rows → **client-render downstream**, NOT the wire.
  Announce-collision (0x2003) ruled out (announce env off). frida session-chain probe HANGS on this
  client (parser/copy/render hooks) → live slab-count unreadable. Open RE (agent a700f82d, static):
  the 0x2006→pending-0x2005 transport match / `slab = obj+idx*0x5304` slab-idx routing / why the client
  never sends variant 0x01. DO NOT touch the 0x2006 wire (byte-correct). Decisive cheap check: user
  real-mouse confirm whether the picker is truly empty.
- **2026-06-16 P17 — SESSION-LIST ROOT CAUSE RE-DIAGNOSED (fragmentation hypothesis REFUTED) + base-management
  builders (0x031f / 0x0321) authored.**
  - **Fragmentation/0x31/buffer-underflow hypothesis = REFUTED** (deep static RE + architect cross-check).
    Prior P16c/memory claim that the transport router `FUN_006130a0` rejects the 21KB single `0x0030`
    frame via a buffer-cap underflow, and that `0x31` is a fragment-continuation marker requiring
    server-side splitting, is WRONG. Findings: (1) `0x31` = **cipher rekey (set_key)** op `[u16 BE 0x31][key]`
    (router → blowfish vtable+4 `FUN_006140c0` → key schedule `FUN_00613ad0` + `FUN_00614810` set_key,
    cipherMgr+0x20 sequence gate zeroed, recurses; **no reassembly accumulator exists**). (2) Client max
    single application message = **0xf000 (61440B)** (`FUN_00614ea0` stores arg 0xf000 at socket-struct+0xac;
    recv ring 0x3e8000). The 21KB `0x2006` is far under it and **decodes successfully** (decode size 0x5318 =
    21272, 8-byte aligned, blowfish `FUN_00614460` alignment check passes). So no underflow, no split needed,
    none possible.
  - **CORRECTED root cause = client post-decode drop.** recv (21280B ✅) → router `FUN_006130a0` → decipher
    (✅ 2×) → **receive-object factory `FUN_00612510` → teardown `FUN_006122c0` discards the decoded `0x2006`
    BEFORE enqueue** (✗) → classifier `FUN_004b8b00` / enqueue `FUN_004b8850` / dispatcher `FUN_004ba2b0`
    never see it (this explains the live probe's "0x2004 passes, 0x2006 = 0 everywhere"). The 1776B `0x2004`
    passes; only the 21KB `0x2006` is torn down. **No server change can fix this** (architect-confirmed,
    independent of TCP segmentation/ordering). Fix = **client binary patch**. The old `lobbyfsm.json`
    (0x4b8ae8 85c0→33c0) was an earlier recv-pump guess already LIVE-REFUTED (forcing the tick didn't advance
    the FSM) → wrong site; the real site is in the factory/teardown. **Open RE (tracer agent, in flight):**
    WHY does `FUN_006122c0` tear down 21KB but not 1.7KB? Competing hypotheses — H1 factory per-object size
    cap (<21KB, smaller than the 0xf000 socket cap), H2 post-rekey sequence-gate (cipherMgr+0x20) mismatch,
    H3 recv-pump FSM. Deliverables: causal report + same-length client patch spec (tools/client_patches/) +
    read-only probe `.omo/work/probe_recv_object.py`. **Side-effect to watch:** if the cause is a factory
    per-object cap, the SAME drop hits every large `0x0030` frame — 36KB `0x0321` (institutions), `0x031d`,
    `0x0315` markers — so this one client patch may unblock the session picker AND in-world large-record
    rendering together.
  - **Server contract-lock (a61c345a):** `src/server/logh7-envelope-0030.mjs` gained evidence-documented
    transport constants `TRANSPORT_MAX_SINGLE_MESSAGE_BYTES=0xf000`, `TRANSPORT_REKEY_INNER_CODE=0x31`,
    `build0031RekeyInner(key)` (the TRUE rekey contract), `classify0030SingleFrame()` + 5 failing-first tests.
    No wire-layout change. The agent correctly refused to fabricate a splitter the client cannot parse.
  - **Base-management builders authored (true A3 + sibling):** the 「基地管理」 panel has two record halves.
    (1) `src/server/logh7-base-record.mjs` — **`ResponseInformationBase` 0x031f** (economy/defense/ownership),
    fixed 0x604 body, stride 0x180 × max 4, all offsets P0 (parser `FUN_00414c70`); five arrays cross-mapped
    HIGH via unique caps (transport_supplies@+0x24, outfit_supplies@+0xa0, budgeting@+0x130, budget@+0x140,
    commodity@+0x168); 25 scalars byte-correct under provisional `fieldNN` names; values P3 (default 0). 10 tests.
    (2) `src/server/logh7-institution-record.mjs` — **`ResponseInformationInstitution` 0x0321** (facilities),
    fixed 0x8DE4=36324B, three-level nested (base → institution[≤36] → spot[≤20]), all offsets P0 (dispatcher
    case 0x321 + parsers `FUN_004167f0`/`FUN_00416bd0` cross-validated). 13 tests. **Bug found:** the
    pre-existing wired `buildInformationInstitutionInner` (logh7-info-records.mjs:222) places nested
    institution_count/institution[0] **+4/−4 off** the parser-pinned positions; the new builder is byte-exact.
    Wire doc updated (§2 0x031f, §2a 0x0321; confidence 0.60→0.70). Both are pure new modules (import only the
    framing helper), zero hot-path conflict.
  - **Wiring (executor agent, in flight):** swap `login-session.mjs` 0x031e→0x031f handler to
    `buildResponseInformationBaseInner` (seed `b04`→`field04`) and 0x0320→0x0321 handler to
    `buildResponseInformationInstitutionInner` (fixes the +4/−4 bug), both kept as explicit UI-read responses
    (NOT world-init inline — A4/A7 walk-stall precedent), with reconciled + offset-locking tests. 0x031f (1540B)
    is small → not gated by the factory drop → live-testable; 0x0321 (36KB) wiring fixes the bug now but live
    transmission waits on the client drop patch.
  - **Baseline: server `node --test tests/server/*.test.mjs` = 641/641 pass, 0 fail** (613 + A3 10 + 0x0321 13
    + transport-lock 5). DO NOT re-enable lobbyfsm / NOPAD / brightbtn (all refuted). DO NOT touch the 0x2006
    wire (0x5304, byte-correct).
  - **NEXT:** tracer agent's client-patch spec → add to `tools/logh7_build_playable_client.py` patch stack →
    rebuild playable → jiggle-click new-char + `probe_recv_object.py`/`probe_pipeline.py` live verify (0x2006
    passes factory → enqueue → dispatcher → FSM advances → picker renders). If the cause is a shared factory
    cap, re-check large in-world frames (markers/fleet/0x0321) in the same run.
- **2026-06-16 P18 — live extractor probe BUILT + tried; blocked on re-triggering a fresh 0x2005.**
  `.omo/work/probe_extractor_live.py` = the proven `probe_pipeline.py` harness (frida.attach + the exact
  `tools/logh7_window_login.py:_click` jiggle) + a hook on the frame extractor `FUN_006130a0` onLeave that
  records the descriptor return (NULL vs non-NULL) and `len16` per frame, plus the classifier `FUN_004b8b00`
  op-tally. It answers ac16e78f's single critical unknown in one run: does the 21KB 0x2006's extractor return
  non-NULL (drop downstream) or NULL (extractor drops it). **All hooks attach cleanly live (no frida hang —
  the small 3-line FUN_00612510 is deliberately NOT hooked); the recv pump is confirmed spinning (FUN_006130a0
  called 2472–2600× per run, all NULL = idle, no frame to extract).** BLOCKER: the live client (playable.exe,
  pid in session.json) is **idle post-burst** — the server trace shows the lobby conn already did
  `0x2003→0x2004(1762B)` then `0x2005→0x2006(respLen=21258)` earlier, so the session list was requested once;
  re-clicking 새 캐릭터 작성 now yields **zero traffic and no UI change** (the idle D3D client isn't accepting
  injected clicks the way it did fresh — screen unchanged, window foreground-confirmed). Lobby button centers
  re-measured (brightness scan, 1024×768 win): 게임시작~200, **새캐릭~258**, 추첨~312, 삭제~370, 세션변경~432.
  **To capture: drive a FRESH 0x2005→0x2006 with the probe attached** — (a) real-mouse click 새캐릭 in a fresh
  lobby while a passive probe waits, or (b) ui_explorer stop/start then jiggle-click 새캐릭 on the fresh session
  (idle-input issue should reset). Only then does a client byte patch get a justified target (EXE bytes from the
  installed binary / build tool — Ghidra export is decompiled-C only; ac16e78f `recvcap.json` = CANDIDATE, patches:[]).
- **2026-06-16 P19 — ★ DROP SITE CAPTURED LIVE (the critical unknown is answered).** Capture trick: the
  session-list burst is the client **auto-fetching** roster+sessions ~10s after lobby login (NOT a click),
  and `ui_explorer start` returns ~4s after login — so attach the passive probe (`probe_extractor_live.py
  --passive`) **immediately** after start (no screenshot/delay) and the +10s auto-burst lands in its 18s
  window. Captured result: `recv=[1784, 21280]` (both 0x2004 and the 21KB 0x2006 received), `decipher=2`,
  **extractor FUN_006130a0 returns a NON-NULL descriptor for 0x2006 (`len16=0x530a`=21258B, correct)**, but
  **classifier FUN_004b8b00 sees only 0x2004 (`op2006=0`)**; enqueue/dispatch likewise 0x2004-only. So the
  21KB 0x2006 is recv'd + deciphered + extracted successfully, then **dropped in the pump→object-build path
  (`FUN_006122c0`→`FUN_00612510`) before the classifier** — `FUN_00612510` returns NULL for opcode 0x2006
  (non-NULL for 0x2004), driving the pump's teardown branch. Likely mechanism: the lobby-message object's
  buffer (+0xc capacity) can't hold 21258B → the "too large parameter" gate (`0x004021e0`/`0x00402e30`/
  `0x00404210`) rejects it (1784B fits). **The static caps (classifier 0x5304, registration 0xffdd, recv ring
  4MB) all accommodate it — only the object-buffer/too-large gate drops it.** This is a precise, patchable
  target. **Patch-design agent (executor, in flight)** has the live verdict + the EXE on disk + capstone 5.0.7
  (which ac16e78f lacked) to RE FUN_00612510's object-build, pin the exact reject (cmp/branch + buffer-cap
  source), and design a same-length byte patch (enlarge cap or skip reject) into `tools/client_patches/recvcap.json`
  + the `logh7_build_playable_client.py` stack. **NEXT (me):** apply the patch → rebuild playable → re-capture
  with the same immediate-attach passive probe to confirm 0x2006 now reaches the classifier/dispatcher (→ FSM
  advances → session picker renders → 새캐릭→캐릭터 생성 opens). If the same gate hits 36KB 0x0321/markers,
  they unblock together. Capture procedure for handoff: `stop; start(login); IMMEDIATELY probe_extractor_live.py
  --passive` (or `start --no-login` + manual nav with the probe pre-attached).
- **2026-06-16 P20 — factory-NULL AND too-large hypotheses BOTH refuted by deeper live capture; drop pinned to
  the post-factory PARSE.** Added a factory hook to `probe_extractor_live.py` (FUN_00612510 @0x612510 entry/leave
  — the mid-pump 0x612348 hook CRASHED the client because frida's trampoline overwrote the adjacent
  `je@0x61234c` branch, so only function-boundary hooks are safe here). Two captures (immediate-attach passive,
  fresh session) show: the factory is called **2× and returns NON-NULL both times** (0x2006's object IS created),
  with **objCap=0xf784 (63364B) ≫ the 21252B payload** and objLen=0 (pre-parse). So the drop is **NOT**
  factory-NULL and **NOT** the capacity/too-large gate (cap 0xf784 is never exceeded → ac534c0b's C1/C2 too-large
  NOPs are confirmed irrelevant). Re-confirmed: recv✓(1784,21280) · decipher✓(2) · extractor✓(non-NULL,
  len16 0x530a) · factory✓(non-NULL, cap 0xf784) · **classifier reached by 0x2004 only (op2006=0)**. Therefore
  **0x2006 is dropped in the message-object PARSE step (the object's `vtable+8`), after the factory and before
  the classifier**, for content/logic reasons specific to that frame (0x2004 parses fine). The factory's
  register arg/eax reads 0x3 (a message category/family, not the opcode — the parser reads the opcode from the
  frame), so factory-level opcode tagging isn't possible. **NEXT probe:** in factory onLeave read `obj[0]`=vtable
  then `[vtable+8]`=the parse method address, hook THAT, and find where 0x2006's parse bails (the cmp/branch) —
  that is the real patch target. The capture workflow is now reliable (stop→start(login)→IMMEDIATE passive probe
  catches the +10s auto-burst; function-boundary hooks only). All server work remains green (658/658).
- **2026-06-16 P21 — drop traced to `FUN_00404610` (the message-object input-parse gate).** Captured the
  created object's vtable (0x66c0d8): dispatch=0x404180, **parse=0x404210** (vtable+8), destroy=0x4042a0,
  objCap=0xf784. Pulled the decompiled C: `FUN_00404210` (parse, mpsClientMessage32::input) calls
  `cVar1 = FUN_00404610(stream, obj+6, descriptor)`; **only if `cVar1==0`** does it run the normal
  `FUN_00610420` payload-read (→ classifier/enqueue → picker). `FUN_00404610` returns **0 only when
  `*param_3 != 0x8000` AND `stream_vtable[0x14](opcode)==0`**; otherwise it runs an alternate vtable path and
  returns **1** → `FUN_00404210` skips the read → silent drop. Live: 0x2004→`FUN_00404610` returns 0 (renders);
  0x2006→returns 1 (dropped). So the divergence is either **(A) a `0x8000` frame-marker** on the 21KB reply or
  **(B) `stream_vtable[0x14]` finding no/alt handler for 0x2006**. **Important:** if (A) and the `0x8000` is
  driven by how the server frames the 21KB 0x2006 (a length high-bit / subheader differing from the 1.7KB
  0x2004), a **server-side framing fix may exist** — ac16e78f's "no server fix" was scoped to the (refuted)
  fragmentation theory, so this marker path is worth re-examining in `logh7-envelope-0030.mjs`/`logh7-auth-server.mjs`.
  **Delegated (executor, in flight):** RE FUN_00404610's ABI + the 0x8000-marker source vs vtable[0x14] handler,
  decide server-framing vs client-patch, design the fix (server diff+failing-first test with wire 0x5304
  unchanged, OR same-length client patch via capstone) + a function-boundary live probe to confirm. Server
  remains 658/658.
- **2026-06-16 P22 — ★ DEFINITIVE REFRAME: 0x2006 is NOT dropped at transport; the transport works.** Byte-exact
  RE (aa58c7f6) + a live gate capture settle it. `message32+6` = the opcode (`ntohs`); `FUN_00404610` is a
  **parser-registry lookup**, and the "(A) 0x8000 marker" path is ruled out (neither opcode is 0x8000). Live
  `FUN_00404610` capture (onEnter opcode + onLeave `al`): **both 0x2004 and 0x2006 return `al=1`** — both are
  routed to registered inline parsers; 0x2006's is the dedicated InformationSession parser (vtable `0x66cd20`,
  maxlen `0x5304` = exactly the 0x2006 payload). So **0x2006 is received, deciphered, extracted, object-built,
  AND parsed by its dedicated parser** — the whole transport chain is healthy. (The agent's "0x2004
  not-registered→classifier" half is contradicted by the live `al=1`; the classifier seeing only 0x2004 is
  incidental, not the picker gate.) The server frames 0x2004/0x2006 **byte-identically**, so **no server fix is
  possible or needed**, and `recvcap.json`/C1/C2/factory-NULL are all **dead hypotheses**. **Net:** this
  session's transport RE conclusively proved the transport delivers 0x2006 to its parser; the empty picker is a
  **downstream** bug in the **0x2006 registered parser (0x66cd20) → session slab → select-FSM `FUN_0051a370`**
  (state 0x13, `FUN_00593cf0` slab-copy, `FUN_00593d90` gate, `FUN_005946d0` render) — the **original P16c
  frontier**, where ab367929 verified the server wire byte-correct (601 tests) yet the picker shows 0 rows.
  **NEXT:** RE how the 0x2006 parser writes our 21252B payload into the session slab and why the select-FSM
  stalls at state 0x13 / `FUN_00593cf0(2)` stays false — a client parser/slab/FSM investigation (likely a
  client-side fix), reusing the live workflow (stop→start(login)→immediate `probe_extractor_live.py --passive`;
  function-boundary hooks only). Server stays 658/658; do not patch transport (recvcap/C1/C2/lobbyfsm/NOPAD/
  brightbtn all moot/refuted).
- **2026-06-16 P23 — ★ COMPLETE causal chain mapped: dispatcher `case 0x2006` is the sole writer of the slab
  source.** Grepping the decompile, **only two functions reference `+0x359e3c`**: the dispatcher `FUN_004ba2b0`
  (writes it) and `FUN_00593cf0` (reads it). The dispatcher's `case 0x2006` (`LobbyResponseInformationSession`)
  copies **`0x14c1` dwords** from the payload into `base+0x359e3c`; `FUN_00593cf0` phase-2 copies the **same
  `0x14c1` dwords** from `+0x359e3c` into `slab[idx]` (stride 0x5304 = the 0x2006 payload). `FUN_00593cf0`
  phase-1 sends the per-idx `0x2005` request via `FUN_004b78a0(1,7,idx)` and returns false; the picker gate
  `FUN_00593d90` renders rows only when `slab+9` (count) > 0 and a row's status (`+0xe`, stride 0x14c) ∈ {1,2}.
  **So the intended path is: dispatcher case 0x2006 → `+0x359e3c` → `FUN_00593cf0` slab-copy → FSM `FUN_0051a370`
  advances → `FUN_00593d90`/`FUN_005946d0` render.** The live break: the dispatcher never tags 0x2006 (`op2006=0`)
  → `+0x359e3c` never written → `FUN_00593cf0(2)` has no data → FSM stalls at state 0x13 → empty picker. **Open
  tension:** `FUN_00404610` returns `al=1` for both 0x2004 and 0x2006 (both inline-parsed), yet 0x2004 reaches
  the dispatcher and 0x2006 doesn't — the dispatcher opcode is `param_2` ([esp+4]) but it switches on `local_3c`
  (cases mix 0x201/0x2004/0x2006…), so either 0x2006 truly isn't dispatched or `local_3c` is derived indirectly
  and my opScan mis-tagged it. **NEXT (decisive):** a function-boundary probe that either (a) reads the
  dispatcher's true switch opcode for the 0x2006 frame, or (b) detects the `+0x359e3c` write — to confirm whether
  `case 0x2006` executes. If it doesn't → client routing fix (get 0x2006 to the dispatcher); if it does but the
  FSM still stalls → FSM/slab timing. **Both are client-side** (server wire byte-correct, 658/658, no server fix).
  Dispatcher decompile is in `.omo/ghidra/export/G7MTClient/functions.jsonl` (`FUN_004ba2b0`, 116KB C).
- **2026-06-16 P24 — ★ handler divergence captured + a SERVER-fix hypothesis reopened.** Live `FUN_00404610`
  capture (read `*(param_1+0xc)` = resolved handler, + its `vtbl[0]`): **0x2004 → handler `vtbl[0]=FUN_0043fd60`**
  (→ `FUN_004ae0d0` enqueue → dispatcher case 0x2004), **0x2006 → handler `vtbl[0]=FUN_00444900`** (enqueue NOT
  reached — `FUN_004ae0d0` probe: op2004=1, **op2006=0**). So 0x2006 is parsed solely by the inline parser
  **`FUN_00444900`** (= the consumer ab367929 referenced), which does NOT feed the dispatcher/`+0x359e3c` path.
  RE of `FUN_00444900`: count@`param_1+1` (≤0x41), record **stride 0x14c** (same as picker `FUN_00593d90`), each
  record has name-length@`+7` with `if(0xd<…) → "Input_InformationSession::input" → return 0xffffffff` (bail),
  a sub-count@`+0x1b` with `if(0x41<…)` bail, plus `+0xa1`/`+0xb9` fields. **If our 0x2006 wire violates any of
  these limits (esp. a name-length > 13 — likely if Korean names are length-counted in UTF-16 BYTES), the parser
  bails mid-parse → picker stays empty → SERVER-side builder bug.** This reopens a server fix (the earlier
  "byte-correct, 601 tests" may have validated against the picker/slab consumer, not this actual inline parser
  `FUN_00444900`). **Delegated (executor, in flight):** full RE of `FUN_00444900`'s 0x14c-record field map +
  limits + write destination, byte-diff against `buildInformationSessionInner` (logh7-scenario-session.mjs), and
  if our data trips it → a server fix with failing-first tests (wire 0x5304 / stride 0x14c unchanged, 658
  regression-free). `FUN_00444900` hangs under frida → static RE only; live verification = picker render
  screenshot / `FUN_005946d0` render-hook after the fix. Server stays 658/658 until a confirmed mismatch.
- **2026-06-16 P25 — ✅✅✅ SESSION PICKER RENDERS LIVE — blocker RESOLVED (server packed-wire fix).** `ac5a0a77`
  confirmed the bug: the 0x2006 wire is a **PACKED, sequential, variable-length stream** (SEEK_CUR-proven), not
  the fixed-0x14c-stride layout our `buildInformationSessionInner` emitted; fed to `FUN_00444900` the strided
  bytes misaligned and it read `session_name_size 18 > 13` → bailed on record 0 → empty picker. Fix: rewrote
  `buildInformationSessionInner`/`writeSessionRecord`/`writePstr16` (logh7-scenario-session.mjs) to emit the
  packed sequential wire (counted strings = unit count, no NUL); added a packed-parser oracle + failing-first
  tests; corrected 2 stale comments in login-session.mjs (routing unchanged). **Suite 658→659, 0 fail; wire size
  invariant held (okInner 0x530a / payload 0x5304).** **LIVE VERIFIED (this session):** restarted with the fixed
  server, the lobby auto-burst sent the packed `0x2006 respLen 21258`, navigated to the session-select panel
  (`ui_explorer click 128 258`), and the screenshot (`.omo/work/shot-sessionpanel.png`) shows the picker with
  **TWO populated session rows** (icons + names + green selectable indicators + action button) — previously EMPTY.
  So `FUN_00444900` now parses cleanly, the slab/FSM advance, and `FUN_00593d90`/`FUN_005946d0` render the rows.
  This closes the entire multi-turn session-list investigation: the whole transport chain was healthy; the sole
  bug was the server emitting the session record in fixed-stride instead of the parser's packed format. **NEXT:**
  click a session row (memory notes ~747,260, possibly double-click) → confirm it proceeds into 새 캐릭터 작성
  (character creation), completing the 새캐릭→세션선택→캐릭터생성 flow. Capture workflow:
  stop→start(login)→wait for 0x2006 in trace→`ui_explorer click`. recvcap/C1/C2/lobbyfsm/NOPAD/brightbtn remain
  unused (the fix was server-side, wire-format only).
- **2026-06-16 P26 — ✅✅✅ END-TO-END: 새캐릭 → session picker → CHARACTER CREATION opens.** Continued the live
  flow from P25: with the picker showing 2 rows, a rapid jiggle **double-click on a session row (745,258)**
  advanced the FSM (trace burst of additional `0x2005→0x2006` slab loads, then a session connect:
  `0x0200`→`world-join`→`relay-register`→`0x0201`), and the screen advanced to a **faction-selection panel**
  (소속 진영 선택; 자유惑星同盟/Free Planets Alliance + another) — **step 1 of character creation**
  (`.omo/work/shot-dblclick.png`). So the full chain is live-proven: **새 캐릭터 작성 → populated session picker
  → select session → faction-select (char creation begins)** — exactly Task #4's goal. The earlier dead-end
  (새캐릭 → server-notice / empty panel) is gone. **Root fix = the single server-side packed-wire correction in
  `buildInformationSessionInner`** (P25); no client patch was needed (transport was healthy all along). Task #4
  core blocker RESOLVED. Remaining follow-ups (under Task #3): complete the multi-step char-creation form
  (face/name/stats per the 8-step form) end-to-end, and verify the 오리지널 캐릭터 추첨 (lottery) path. Screens:
  `.omo/work/shot-sessionpanel.png` (picker, 2 rows) and `.omo/work/shot-dblclick.png` (faction select).
- **2026-06-16 P27 — ✅ CHARACTER-CREATION FORM COMPLETES; new blocker is post-create Now Loading.** Continued
  P26 from a clean ui-explorer session (`.omo/ui-explorer/session-charcreate-20260616/`) and replaced the
  missed faction coordinates with detector-derived targets from a live screenshot: faction radios at
  `(598,316)` / `(598,432)` and `다음으로` at `(762,584)` (`charcreate-wave27-faction-hitmap-v2.json`).
  Live flow: faction select → gender → origin → name (`Wave` / `Probe`) → age/birthday → face → attributes →
  ship name (`Vega`) → final register modal. The client emitted a five-phase `0x1008` sequence and the server
  answered every phase with `0x1008` OK (`respLen=134`): phase `00` name payload, phase `01` birth/face payload,
  phase `02` attributes payload, phase `03` ship-name payload, phase `04` final register commit. After confirming
  the modal, the client immediately proceeded into post-create bootstrap: `0x0205→0x0206`, `0x0304→0x0305`,
  `0x0306→0x0307`, `0x0314→0x0315`, `0x0312→0x0313`, `0x030a→0x030b`, `0x0310→0x0311`,
  `0x030e→0x030f`, and `0x031c→0x031d`. **Net:** the multi-step character-creation form is live-proven through
  final registration and no server opcode gap appeared in the `0x1008` flow. **New frontier:** after the post-create
  `0x03xx` bootstrap the client remains on **Now Loading** for 20+ seconds with no further trace events
  (`023-charcreate-post-register-wait-30s.png`). This differs from the default-character in-world path that reaches
  later world/HUD traffic; next investigation should compare the newly-created character's post-create `0x03xx`
  state/char-id data with the known default-char path before patching. Evidence summary:
  `.omo/ulw-loop/full-revival-20260615/evidence/charcreate-summary.json`,
  `charcreate-trace-final-all.json`, `charcreate-click-confirm-register.json`, and screenshots
  `004-faction-baseline.png` through `023-charcreate-post-register-wait-30s.png`.
- **2026-06-16 P28 — ✅ server-side 0x1008 duplicate-registration bug fixed; remaining blocker is
  client post-create queue/state.** Comparing `postcreate-trace-compare.json` against the default-character
  in-world path showed the newly-created path stops after `0x031c→0x031d`, while the default path continues
  through `0x0308/0x030c/0x0300/0x0f00/0x0f02/0x0f06`. A failing replay of the live five-phase `0x1008`
  frames exposed one real server bug: the old handler treated phases `0`, `2`, `3`, and `4` as separate
  creates, producing four lobby characters and breaking the next `0x2003` list with
  `invalid lobby character-charge record count: 4`. Fix: `src/server/logh7-login-session.mjs` now treats
  phase `0` as the only authoritative create, echoes phases `1..4` with the same draft id/status, commits
  `generatedCharacterId` on phase `4`, and uses `chargedCharacterId || generatedCharacterId || LOGH_WORLD_CHAR_ID`
  for world-entry character id selection. Added `LIVE_MULTIPHASE_CREATE_HEX` coverage in
  `tests/server/logh7-login-session.test.mjs`; focused replay passed and `npm run test:server` passed `660/660`.
  Full `npm test` also passed after updating the Win32 fake in `tools/tests/test_logh7_real_client_probe.py` to
  expose the `GetSystemMetrics` and absolute-move event constants used by the current click helper: tools
  `223/223`, server `660/660`, Playwright `5/5`.
  Live QA (`.omo/ui-explorer/session-charcreate-fix-20260616`) confirmed all five phases still receive
  `0x1008` OK and the installed EXE was restored with `shaVerified=true`, but the client still stalls on
  Now Loading after `0x031c→0x031d`. Static dispatcher evidence (`dispatch-004ba2b0-create-stall.txt`) shows
  `case 0x031d` only copies the static-base body and the common tail advances the request queue only if
  `client+0x357ec0` still has entries. Next RE target: find why the create path does not build the later
  default-character world-init queue, rather than patching more `0x03xx` response content blindly.

- **2026-06-16 P29 - read-only gate probe supersedes the P28 queue hypothesis.** A live marker/world-gate probe
  against `.omo/ui-explorer/session-postcreate-probe-20260616` replayed the fixed five-phase create flow and stopped
  at the same server trace tail: `0x0205→0x0206`, `0x0304→0x0305`, `0x0306→0x0307`, `0x0314→0x0315`,
  `0x0312→0x0313`, `0x030a→0x030b`, `0x0310→0x0311`, `0x030e→0x030f`, `0x031c→0x031d`. The decisive new
  evidence is the live client state at the stall: `DAT_007cd020=7`, `client+0x35837e` (`SSGameLoginOK`) is set,
  `client+0x35837f` is still `0`, and the send ring still has one queued entry: request `0x031c`, expected
  `0x031d`, payload pointer `0`. The receive queue is empty (`recvExecCount=0`). Therefore the blocker is not yet
  "0x031d handled but no later queue was built"; it is that the server-sent `0x031d` response did not reach the
  dispatcher/common-tail match on the created-character path. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/postcreate-gate-summary.json`,
  `postcreate-live-queue-read.json`, `postcreate-live-recv-queue-read.json`, and `postcreate-probe-stop.json`.
  Next target is the receive/decode/dispatcher-admission path for this `0x031d` frame, compared against the
  default-character path where the same stage continues into `0x0308/0x030c/0x0300/0x0f00/0x0f02/0x0f06`.

- **2026-06-16 P30 - message-object probe narrows post-create 0x031d to parser input, not receive admission.**
  A temporary `MOB1` patch filtered `FUN_00404610` to created-path `0x031d` and live-replayed the full five-phase
  create form again. The server trace still stopped at `0x031c→0x031d` (`respLen=21010`, `frameBytes=21032`), but
  decoded ring evidence now shows the response did reach message-object admission: `counter=2`,
  `sitesSeen=["lookupResult","inputBefore"]`, `lookupResult.resultAl=1`, `streamLen=21010`, and
  `inputBefore.inputMethodHex=0x004142e0`. No `inputAfter` or handler record was captured. This supersedes P29's
  receive/decode suspicion for this run: the next frontier is inside or immediately after the
  `Input_ResponseStaticInformationBase` / `Input_StaticInformationBase` parser (`FUN_004142e0`), before the
  dispatcher/common-tail removes the queued `0x031c/0x031d` entry. Static decompile confirms the parser expects a
  count below `0x15f`, 0x3c-byte records, and name length <= 13, so the next patchable hypothesis must prove a
  concrete 0x031d stream/body cursor or record-format mismatch before changing server bytes. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/postcreate-031d-mob1-ring.json`,
  `postcreate-031d-message-object-patch.stdout.json`, `postcreate-031d-mob1-stop.json`, and
  `.omo/ui-explorer/session-postcreate-031d-mob1/trace.jsonl`. Cleanup restored the installed EXE SHA and left no
  `G7MTClient.exe`, `Gin7UpdateClient.exe`, or listeners on `4787/47900/47901`.

- **2026-06-16 P31 - ✅ created-character path now passes 0x031d and reaches the in-world strategic HUD.**
  The parser probe on `FUN_004142e0` first proved the count-only fix was real but incomplete: changing the outer
  StaticInformationBase count to helper-swapped `u16be` removed `countHighPath`, but the client then hit
  `nameOverPath` at record 26 because the body was still written as a destination-stride layout. Static
  `FUN_004142e0` / `FUN_004145b0` analysis showed the actual wire is a sequential parser-helper stream:
  `u32 id`, `u16 grid`, two unresolved `u16`s, `u8 name_len`, `u16be name chars`, `u8 class_`, `f32 diameter`,
  `u32` unresolved orbit slot, `u8 revolution_direction`, then two `f32`s. `src/server/logh7-info-records.mjs`
  now emits that stream and keeps the fixed 0x520c response size. Tests were updated to decode the stream rather
  than the old `base=4 + i*0x3c` wire assumption.
  Verification: focused StaticBase tests passed, focused `0x031c` login-session test passed, `node --check` passed
  for the changed JS files, and `npm run test:server` passed `660/660`. LSP diagnostics could not run because the
  TypeScript language server is not installed.
  Live QA (`.omo/ui-explorer/session-postcreate-031d-parser-stream`) replayed a new character (`Stream` / `Probe`,
  ship `Astra`) through final register. The decoded `SIB1` ring has `counter=83`,
  `sitesSeen=["normalReturn","recordNameGate"]`, with `normalReturn` at callIndex 82 after 80 static-base records.
  Server trace continued past `0x031d` into `0x0308→0x0309`, `0x030c→0x030d`, `0x0300→0x0301`,
  `0x0f00→0x0f01`, `0x0f02` plus `0x0204/0x0325/0x0323/0x0f03`, then `0x0f06→0x0f07`.
  Screenshot `021-stream-20-confirm-register.png` shows the in-world strategic HUD, not Now Loading. Cleanup
  restored the installed EXE SHA (`shaVerified=true`) and ports `4787/47900/47901` were closed. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/postcreate-031d-parser-fixed-ring.json`,
  `postcreate-031d-parser-stream-ring.json`, `postcreate-031d-parser-stream-20-confirm-register.json`, and
  `postcreate-031d-parser-stream-stop.json`.

- **2026-06-16 P32 - ✅ 0x0315 grid parser byte-order bug fixed; C001 still blocked after render build.**
  The current C001 blocker was not the ringclear patch base. A control run with
  `.omo/work/marker-fix/G7MTClient.playable.earlygrid-ringclear.exe` still stopped at `0x0314→0x0315` and never hit
  the `0x0315` dispatcher arm. A temporary `MOB1` probe for app code `0x0315` then proved the response reached
  `FUN_00404610`, lookup succeeded, and the parser entered `FUN_004134e0`, but no `inputAfter`/handler record
  appeared. Static analysis of `FUN_004134e0` found the wire bug: payload `+2` is helper-read as BE
  `rleByteCount`; the old server wrote `pairs.length` LE, so the galaxy grid count became `0x4601` (=17921) and
  tripped the `<0x1389` parser gate.
  Fix: `src/server/logh7-login-protocol.mjs` now writes the 0x0315 RLE byte length with
  `writeUInt16BE`, and the protocol/session tests assert/decode it as BE. Focused red/green passed after the
  builder fix (`99/99`), and `node --check` passed for the changed files.
  Live after-fix QA advanced the frontier: the P15 gate probe recorded two `0x0315` dispatcher-arm hits, two
  `0x0313` object-table hits, world reset/promotion, staging-to-live, marker render build, and scene build.
  Max observed values included `stageMarkerRange=1018`, `liveMarkerRange=81`, `mode=2`, and `snapshotReady=1`.
  But C001 is still not passed: the trace reached `0x0f02` plus extra
  `0x0313/0x0315/0x0325/0x0323/0x0f03`, then the client closed with `read ECONNRESET`; no `0x0f06`/HUD/clickable
  marker was observed in that patched run, and `stageClass3/liveClass3/markerValid` remained zero. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g222-be-ringclear-gate-summary.json`,
  `c001-g222-mob0315-ring.json`, `c001-g222-be-ringclear-stop.json`, and
  `.omo/ui-explorer/session-c001-g222-be-ringclear-live/trace.jsonl`. Cleanup restored the installed EXE
  (`shaVerified=true`) and left no game processes or listeners on `4787/47900/47901`.

- **2026-06-16 P33 - G223 discriminator: normal playable reaches HUD with early real grid; object table/render table is the blocker.**
  Re-ran C001 on the normal playable client (`.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`), not the
  ringclear build, with `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_WORLD_PLAYER=1`,
  `LOGH_STRAT_FLEET=1`, and `LOGH_GRID_ENTER=1`. After the BE 0x0315 fix, the old early-grid stall did **not**
  reproduce on this path: trace reached `0x0314->0x0315`, `0x0312->0x0313`, the full world-init walk,
  `0x0f02` plus extra `0x0313/0x0315/0x0325/0x0323/0x0f03`, then `0x0f06->0x0f07` and grid-enter
  `0x0b09/0x0325/0x0323/0x0b0a`. The final screenshot shows the strategic HUD alive.
  The remaining blocker is now sharper: `probe_marker_gate.py` saw `FUN_004c5350`, `FUN_004d3bd0`, and scene-build
  execute; live cells reached exactly 81 marker-range values, but object class-3 counts stayed at only
  `liveAt2c1754Class3=1` / `liveAt2c1755Class3=0` and `markerTable.valid=0`. Clicks on the minimap fleet estimate
  and the main grid produced no `0x0b01` / `0x0b07` (only periodic `0x0300->0x0301` around the first click).
  This refutes "ringclear-only close" as the main C001 blocker for normal playable and shifts the next target to
  0x0313 object-table wire/parse semantics or the marker render table's class/content lookup, not 0x0315 cell
  promotion. Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/c001-g223-playable-earlygrid-summary.json`,
  `c001-g223-playable-earlygrid-world-gate.jsonl`, click reports, and cleanup receipt
  `c001-g223-playable-earlygrid-cleanup.json` (`shaVerified=true`, ports `4787/47900/47901` closed).

- **2026-06-16 P34 - ✅ 0x0313 object-table count fixed; strategic markers render, but C001 movement is still blocked.**
  A `MOB1` probe on `0x0313` proved the parser is `FUN_00413050`: it reads byte 0 as a count (`<0x65`) and then
  helper-reads `count` sequential 3-byte object records into offsets `1+i*3`. The old server treated byte 0 as an
  unused lead byte, so the live client parsed `count=0` and never populated the intended object table. Fix:
  `buildStaticInformationGridTypeInner` now writes `payload[0]=maxObjectValue+1` while preserving filler records so
  cell value `v` still resolves to `objectTable[v]`. Focused grid/session tests passed, and the broader
  `npm run test:server` regression passed `660/660`.
  Live G225 on the normal playable client advanced the frontier: trace reached `0x0312/0x0313`, `0x0314/0x0315`,
  full world-init, `0x0f06->0x0f07`, and `0x0b09/0x0b0a`. The gate probe recorded
  `liveAt2c1755Class3=81`, `liveMarkerRange=81`, `markerTable.valid=81`, and screenshots show rendered map objects.
  PLAYER_INFO remains linked (`focusMatchesAnActiveSlot=true`); the raw unit dump shows `[count=1,pad=0,id=1]`.
  Remaining blocker: tested minimap/object/marker/bottom-slot/destination clicks produced only no trace or
  `0x0f08->0x0f09` info traffic; no `0x0b01` / `0x0b07` movement loop was observed. C001 is now blocked on
  SelectGrid/input-mode/actionable fleet command enablement, not on 0x0313/0x0315 rendering. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g225-countfix-summary.json`,
  `c001-g225-countfix-gate-retry.jsonl`, `c001-g225-player-info.json`, `c001-g225-unit-memory-dump.json`,
  `c001-g225-test-server.txt`, and `c001-g225-countfix-cleanup.json`.

- **2026-06-16 P35 - C001 post-load duty-card command injection is transport-safe, but does not open movement.**
  Added an opt-in `LOGH_DUTY_CARDS_POSTLOAD=1` path that sends `0x0305` card master data and `0x0307`
  card-command data only after post-load grid enter (`0x0f06->0x0f07`), avoiding the known world-init stall caused by
  enabling `LOGH_DUTY_CARDS=1` on the early `0x0304` walk. The focused test first failed with no post-load
  `0x0305/0x0307`, then passed after the extras were wired; `node --check`, the focused login-session test, and
  `npm run test:server` passed (`661/661`).
  Live QA (`.omo/ui-explorer/session-c001-g234-cardmove-postload`) reached the in-world HUD with the normal
  playable EXE and recorded post-load extra `0x0305`/`0x0307` deliveries (`respLen` 21008 / 58808). The client stayed
  alive, so the timing/transport is acceptable. However the lower-left command/card tabs still rendered an empty list
  (`006-left-card-tab-1-postload.png`, `007-left-card-tab-2-postload.png`), bottom-card click produced only
  `0x0f08->0x0f09`, and VK70 (`F`) produced no command traffic. The final summary has `movementNeedleCounts`
  `{"0x0b01":0,"0x0b07":0}`. C001 remains blocked on the SelectGrid/action command UI path, with the next concrete
  suspect being the live `0x0f08` card/info request currently answered by a generic one-byte `0x0f09` status object.
  Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/c001-g234-cardmove-postload/summary.json`,
  `trace-all-final.json`, click/key JSON reports, screenshots, and `stop.json` (`shaVerified=true`, ports
  `4173/4787/47900/47901` closed, no legacy game processes).

- **2026-06-16 P36 - 0x0f08-triggered card-command refresh also fails to open C001 movement.**
  Added a second opt-in discriminator on the live `0x0f08` card/info request: with `LOGH_DUTY_CARDS_POSTLOAD=1`,
  the server now preserves the normal `0x0f09` ack and then sends extra `0x0305`/`0x0307`. The red test proved
  the old path had no `extraInners`; the green test plus `node --check`, the focused login-session suite, and
  `npm run test:server` passed (`662/662`).
  Live QA (`.omo/ui-explorer/session-c001-g235-0f08-card-refresh`) confirmed the new branch fires on real client
  traffic: the mail icon emitted repeated `0x0f08` requests, each answered by `0x0f09` plus extra `0x0305` and
  `0x0307` (`respLen` 21008 / 58808). The client stayed alive and the mail UI opened normally. But after closing
  the mail window and re-clicking the lower-left tabs, the command/card list remained blank, and the final trace still
  had no `0x0b01` / `0x0b07`. This refutes "card-command tables merely need to be resent on 0x0f08" as the C001
  fix. Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/c001-g235-0f08-card-refresh/summary.json`,
  `click-mail-icon-0f08-refresh.json`, `trace-all-final.json`, screenshots, and `stop.json` (`shaVerified=true`,
  ports `4173/4787/47900/47901` closed, no legacy game processes).

- **2026-06-16 P37 - SendWarpCommand probe proves C001 is blocked before movement command construction.**
  Built a temporary SendWarp ring probe on top of the normal playable EXE, not the pristine client, and ran the safe
  full-world environment without `LOGH_STRAT_GRID_EARLY=1`, `LOGH_DUTY_CARDS=1`, or `LOGH_ROSTER_PUSH=1`. Live QA
  reached the strategic HUD through the established path (`0x0f06->0x0f07`, then
  `0x0b09/0x0325/0x0323/0x0b0a/0x1200/0x1202/0x1201`). Tested lower-left card/tabs, main-grid candidates,
  minimap candidates, right-click, and VK `0x70` (`F`). The `FUN_005737d0` SendWarp ring counter stayed `0` before
  input, after UI clicks, after grid clicks, and after all inputs.
  The live client-state dump narrows the gate: basic mode/focus/unit state is open (`gridActive=1`, `fieldMode=2`,
  `focusCharId=1`, `unitFirstId=1`), but the table searched by `FUN_004be3f0` had `count=40` and all dumped entries
  were `0x0426`; no `0x0b01` or `0x0b07` record was present. The final trace summary likewise had zero
  `0x0b01` requests and zero `0x0b07` responses. C001 is therefore not blocked by rendered markers, simple click
  coordinates, or a bad target inside SendWarp; it is blocked upstream in command/actionability grant or the mapping
  that should make action ID `0x3b` / SelectGrid available. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g236-sendwarp-probe/summary.json`,
  `sendwarp-ring-after-all.json`, `command-state.json`, `trace-summary.json`, and cleanup receipts
  `stop.json` / `cleanup-check.json` (`shaVerified=true`, target ports closed, no legacy game processes).

- **2026-06-16 P38 - Frida SelectGrid probe moves the C001 blocker upstream of SelectGrid construction.**
  Ran a bounded Frida function-boundary probe on the normal playable EXE in the safe full-world environment, with
  hooks on `FUN_00581c80` (`SelectGridFactory`), `FUN_0058fef0` (command gate), `FUN_005737d0` (`SendWarpCommand`),
  and `FUN_005751b0` (`ReceiveResult`). Frida attached cleanly and recorded `ReceiveResult` 199 times, so the hook
  path was live, but the discriminating hooks stayed at zero: no SelectGrid factory call, no command-gate call, and
  no SendWarp call.
  The tested interactions covered bottom character card, lower-left tabs, main-grid candidates, minimap candidates,
  right-click, and VK `0x70`. The final trace had 2172 events, including ordinary in-world traffic and `0x0f08`, but
  no `0x0b01` / `0x0b07`. This means C001 is not blocked inside SelectGrid cooldown/status handling; the tested UI
  path never constructs SelectGrid at all. Next target: the upstream strategic object/action handler or command-grant
  mapping that should turn an actionable selected fleet/object into action ID `0x3b` and then into the
  `0x0b01`/`0x0b07` movement loop. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g237-selectgrid-frida/summary.json`,
  `frida-summary.json`, `trace-summary.json`, `trace-all-final.json`, and cleanup receipts `stop.json` /
  `cleanup-check.json` (`shaVerified=true`, target ports closed, no legacy game or Frida processes).

- **2026-06-16 P39 - Command-row dispatcher census: SelectGrid data exists, but no command row is selected.**
  Static follow-up identified `FUN_004f93c0` as the command factory dispatcher: it calls
  `param_1 + param_2*4 + 0x1c`, so SelectGrid requires `param_2=0x2b`. Its only decompiled caller,
  `FUN_004f58c0`, hit-tests command rows and reads that u16 index from
  `clientBase+0x3416d8 + category*0x46 + 0x20 + selectedIndex*2`.
  Live G238 used the safe full-world env plus `LOGH_DUTY_CARDS_POSTLOAD=1`; trace confirmed post-load
  `0x0305`/`0x0307` extras were delivered. A live memory dump of `clientBase+0x3416d8` had guard byte `1` and
  contained SelectGrid index `0x2b` in 16 sampled category/index slots, so the loaded static command table is not
  simply missing SelectGrid.
  The UI path still never activates it: filtered Frida recorded `rowScanTotal=22933`, `rowScanOutHits=0`,
  `factoryDispatchTotal=0`, `factoryDispatchSelectGrid=0`, and `commandRowBuildTotal=0`; final globals stayed
  `selectedIndexGlobal=-1`, `categoryGlobal=-1`, `globalStaticCode=null`, `commandObj=null`. Tested bottom-card,
  tabs, grid/minimap candidates, right-click, and VK `0x70` produced no `0x0b01`/`0x0b07`. C001 is now narrowed to
  the upstream UI selection/ownership/actionability state that should populate the selected category/index and make
  `FUN_004f58c0` hit a row, not the SelectGrid factory, command gate, SendWarp command, or movement wire. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g238-command-dispatch-frida/summary.json`,
  `frida-summary.json`, `static-command-table-summary.json`, `trace-summary.json`, and cleanup receipts
  `stop.json` / `cleanup-check.json` (`shaVerified=true`, target ports closed, no legacy game or Frida processes).

- **2026-06-16 P40 - Command-menu category probe: row scans run, but no category is ever applied.**
  Static follow-up identified the category edge before row dispatch: `FUN_004fd100` drives the HUD loop,
  `FUN_004f6b00` resolves a category from the selection list, `FUN_004f5cb0(category)` applies it to the static
  command menu (`D6=category`, `D4=row count`), and only then can `FUN_004f58c0` hit a row and call
  `FUN_004f93c0(factoryIndex, category)`.
  Live G239 first reproduced why the exact full-world env matters: without `LOGH_WORLD_PLAYER=1` and related
  safe full-world flags, `0x0f02` fell back to a plain `0x0f03` and the client reset after the second `0x0300`.
  The successful run used `LOGH_WORLD_PLAYER=1`, `LOGH_STRAT_GRID=1`, `LOGH_STRAT_FLEET=1`,
  `LOGH_TACTICS_UNIT=1`, `LOGH_GRID_ENTER=1`, and `LOGH_DUTY_CARDS_POSTLOAD=1`, while keeping
  `LOGH_STRAT_GRID_EARLY=1`, `LOGH_DUTY_CARDS=1`, and `LOGH_ROSTER_PUSH=1` off.
  Post-HUD Frida lite hooks recorded a live command menu and active row scanning, but no upstream category/row
  activation: `rowScan=9828`, `rowHit=0`, `categoryResolve=0`, `categoryApply=0`, `factoryDispatch=0`,
  `selectGridDispatch=0`, `sendWarp=0`. The menu stayed `pageD3=1`, `rowCountD4=24`, `selectedD5=-1`,
  `categoryD6=-1`, so all row codes were null despite the static table guard being `1`.
  Tested bottom card, lower-left tabs, left-panel row candidates, grid/minimap candidates, and VK70; the trace
  still had no `0x0b01`/`0x0b07`. C001 is now narrowed upstream of category resolution/application: investigate
  the selection list behind `HUD+0x620/+0x624/+0x628` or the ownership/actionability state that should change
  `HUD+0xab0` and trigger `FUN_004f5cb0(category)`. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g239-command-menu-category-frida/summary.json` and
  `.debug-journal.md` G239. Cleanup restored the installed EXE (`shaVerified=true`) and left no target listeners,
  legacy game/server processes, or Frida processes.

- **2026-06-16 P41 - Selection-list gate probe: current-character action payload is empty.**
  G240 corrected the object map with direct call-site disassembly: HUD base is `0x00c9e638`, the shokumu-card
  selection-list object is `HUD+0x48c = 0x00c9eac4`, and the command-menu object is `HUD+0x130 = 0x00c9e768`.
  `FUN_004fc4a0` refreshes the selection list with `FUN_004f68f0(ECX=HUD+0x48c, payload=*(DAT_007ccffc+8))`;
  `FUN_004fd100` scans it with `FUN_004f6600`, and only when `modeF4==2` plus `HUD+0xab0` changes does it call
  `FUN_004f6b00` and then apply the resolved category to the command menu. The resolver reads
  `selectionList+0x620` count, `+0x624` selected index, and `+0x628` payload pointer.
  Live G240 used the safe full-world env with `LOGH_DUTY_CARDS_POSTLOAD=1` and kept `LOGH_DUTY_CARDS=1`,
  `LOGH_ROSTER_PUSH=1`, and `LOGH_STRAT_GRID_EARLY=1` off. Frida recorded 21,212 selection-list scans and
  two mode-set hits; right-side HUD icons toggled `modeF4` `1->2->1` and `listPage187` `1->2->1`, proving the
  relevant controls were reachable. The list remained empty anyway: `listCount188=0`, `listSelected189=-1`,
  `listPayload18a=0xf34502c`, `payloadCount270=0`, `wouldResolveCategory=null`, and `categoryResolve=0`.
  The final trace included icon-triggered `0x0f04/0x0f05`, `0x0f06/0x0f07`, `0x0f08/0x0f09`, plus repeated
  `0x0305/0x0307`, but no `0x0b01`/`0x0b07`. C001 is now narrowed to the data family that should populate
  the current-character selection-list payload at `*(DAT_007ccffc+8)+0x270` and its entries, not row hit-testing,
  SelectGrid, SendWarp, or movement wire handling. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g240-static-selection-list/summary.json` and
  `.debug-journal.md` G240. Cleanup restored the installed EXE (`shaVerified=true`) and left no target listeners,
  legacy game processes, or Frida processes.

- **2026-06-16 P42 - 0x0356 native notify fills the selection payload; C001 minimal loop is now live-proven.**
  G241 split the character-info paths correctly: `0x0323` remains the helper-swapped 730-byte response record, while
  `0x0356` is a separate 728-byte native/LE `NotifyInformationCharacter` body with `flag@0`, `characterId@0x04`,
  `seatCount@0x250`, and seat entries from `0x254`. The final safe full-world live run sent `0x0356` with
  `respLen=734`; Frida recorded `dispatcher-0356-enter=12` and `strategy-tray-update-enter=12`.
  The first native notify payload had `notifyCharId04=1`, `notifySeatCount250=1`, `notifySeatChar254=3142`, and
  `notifySeatRole258=7471209`. Client state changed from `liveSeatCount270=0` to `1`, and later selection-list
  refreshes reached `payloadCount270=1`, `listCount188` max `16`, and final `listCount188=1` / `payloadCount270=1`.
  This closes the G240 empty-current-character-selection-list blocker.
  The same fresh real-client run also satisfied the written C001 minimum in-world command loop: right-side HUD/mail
  interactions opened the visible in-world mail UI and emitted decoded `0x0f08` requests with authoritative `0x0f09`
  responses (`request0f08=5`, `response0f09=5`). Movement/SelectGrid remains a follow-up gap, not a C001 blocker:
  the final trace still has no `0x0b01`/`0x0b07`, and Frida still has `categoryResolve=0` / `menuCategoryD6=-1`.
  Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g241-seat-entry-live/summary.json`,
  `frida-notify356-le-summary.json`, `trace-summary-g241.json`, and `.debug-journal.md` G241. Cleanup restored the
  installed EXE (`shaVerified=true`) and left no target listeners, legacy game processes, or Frida processes.

- **2026-06-16 P43 - Correction: G241 does not prove the game is configured/playable.**
  User review correctly rejected the P42/C001 completion standard. The G241 run proved a useful `0x0356`
  selection-payload update and a right-side HUD/mail `0x0f08->0x0f09` loop, but that is not a strategic gameplay
  loop. The same evidence still has no `0x0b01`/`0x0b07`, `categoryResolve=0`, `menuCategoryD6=-1`, and
  `listSelected189=-1`, so SelectGrid/movement/real command activation remains blocked.
  The user also called out a separate server-data gap: star-system, planet, and building/base positions are not yet
  known from evidence. Current content has 80 systems, 281 planets, and 6 fortresses from the manual star-chart and
  canon/recovered tables, but those are not proven original server strategic-map coordinates; the adapter carries
  system/planet/fortress names, not authoritative positions, and provisional fleet/skirmish coordinates remain
  explicitly reconstructed seed data.
  ULW correction recorded C001 as blocked and checkpointed the full-revival goal as blocked. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/g242-world-data-gap.json`,
  `.omo/ulw-loop/full-revival-20260615/goals.json`, and
  `.omo/ulw-loop/full-revival-20260615/ledger.jsonl`.

- **2026-06-16 P44 - Installed-game mining rerun: base MsgDat confirmed, character name table not found.**
  Re-mined the actual installed tree from
  `E:\logh7-revival\.omo\work\logh7-installed` rather than reusing `content/`. Evidence is under
  `.omo/ulw-loop/full-revival-20260615/evidence/g244-installed-resource-mining/`.
  The install inventory has 2230 files excluding assistant `.omc`, including 42 `data/MsgDat` files,
  418 model containers, 7 face TCF atlases, 1355 `tcf.hed` slots, and 416 decodable portrait slots.
  Active installed `data/MsgDat/*.dat` is a localized/patch overlay (22 files, 9582 records, 4847 non-empty,
  mixed CP932/CP949 HFWR plus one GFWR). The base Japanese backups are `*.dat.jpbak` (20 HFWR files,
  9493 records, 4833 non-empty, CP932). Comparing the fresh `.jpbak` extraction to
  `content/client/msgdat.json` matched all 20 files and 9493 records with `diff_count=0`; only `g7sw.dat` and
  `messages_tac_0.dat` lack `.jpbak` counterparts.
  A whole-install name-density scan for 195 known Japanese/romaji names under CP932/CP949/UTF-16LE found no
  character naming table. Hits were sparse contextual strings: `グエン`, `ブラウンシュヴァイク`, and
  `ローエングラム` in `constmsg.dat.jpbak` medal/ship descriptions; `グエン` in one `messages_3.dat.jpbak`
  quote; and one EXE sample order string `帝国軍巡査隊（ラインハルト元帥）`.
  Server-default correction followed the evidence boundary: active CP949 MsgDat and IV EX Korean names are not
  treated as base VII data. Transient promoted `content/client/msgdat-installed.json` and
  `content/client/msgdat-jpbak.json` were removed; inferred catalogs use only `content/client/msgdat.json`;
  character display prefers `name`/`name_ja` before romaji; the VII `characters` DB table no longer imports
  IV EX `name_kr`/`iv_id` into default rows. Verification passed:
  `python -m unittest tools.tests.test_logh7_msgdat`, edited-module `node --check`, and focused content/session
  node tests (`70` pass, `0` fail).

- **2026-06-16 P45 - Render/interaction contract recorded.**
  Added `docs/logh7-render-interaction-contract.md` as the current server-downlink inventory. It separates
  renderable surfaces from real interaction: lobby/session/character creation, HUD admission, `0x0313/0x0315`
  strategic markers, `0x0356` current-character notify, and the byte-pinned info records are render/data surfaces;
  `0x0f08->0x0f09` is only a weak HUD/mail loop; strategic movement still requires a fresh real-client
  `0x0b01->0x0b07` loop or proven equivalent. The same doc now records what must be server-origin or explicitly
  reconstructed: original strategic coordinates, planet/building/base positions, office/room locations, room
  occupants, and action/category context. Friend-labeled portrait names can complete a useful portrait mapping if
  ingested as human-labeled provenance, but not as recovered installed/server data. Evidence: `.debug-journal.md`
  G245 and `docs/logh7-render-interaction-contract.md`.

- **2026-06-16 P46 - Correction: marker slots only; current location, posts, creation seed, and Empire fiefs recorded.**
  User review correctly pointed out that P45 still sounded too strong for strategic markers. The corrected status is:
  `0x0313/0x0315` currently prove class-3 marker slots/cells, not correct marker names, star/fortress types, or
  selected-system planet render. `byte0` is still a placeholder label/link id; `byte2` is only a faction tint.
  The server now writes authored current-location fields into the player downlink: `0x0323 spot@0x1c`,
  `spot_owner@0x20`, and `0x0325` full unit `cell@+0x0c` / `mapSection@+0x48`. Defaults are spot 1, owner 1, and
  fleet cell 2550 unless `LOGH_WORLD_SPOT_ID`, `LOGH_WORLD_SPOT_OWNER`, `LOGH_FLEET_COL`, or `LOGH_FLEET_ROW`
  override them. This is consistent server seed data, not recovered original starting-location proof.
  Position status is split: rank is parsed/stored via `0x1008 rank` and rendered through `0x0323 rank@0xd6`;
  post/duty is the seat array (`seatCount@0x250`, `{character,role}` at `0x254`) and personnel commands such as
  `0x0707 CardAppointment`. Manual org data has 58 Empire posts and 63 Alliance posts, but role enum names and
  original post occupancy remain unrecovered. Character creation currently stores id/status/name, power/blood/sex,
  face, abilities, bonus/title/rank, and current spot/owner; flagship type/kind/name are not yet persisted.
  Empire fief/nobility is confirmed as a real system from installed/base strings and manual command data:
  `叙爵`, `封土授与`, `封土直轄`, `狩猟`, noble title labels, `封土`, and central/local tax strings exist. The server
  still needs a fief ownership model and live command/apply RE before it is playable. Evidence:
  `docs/logh7-render-interaction-contract.md` and `.debug-journal.md` G246.

- **2026-06-16 P47 - Client QA correction and full record-map inventory.**
  G247 live QA separated three issues that were previously mixed together. First, the old default current-location
  push was too aggressive: default `0x0325` now stays minimal, and full unit location slots require
  `LOGH_FULL_UNIT_LOCATION=1`; early `0x0323 spot/spot_owner` now requires `LOGH_EARLY_WORLD_LOCATION=1`. The server
  still tracks authored current location for post-load/direct-record experiments, but the live-critical `0x0f02`
  spawn remains minimal by default.
  Second, font QA is a separate track. Stock/probe EXE sessions are correct for protocol/crash QA but render Korean
  as `?`; `G7MTClient.korean.exe` plus CP949 resources is required for Korean glyph QA. A short G247 font check
  confirmed the Korean EXE path renders lobby labels such as `게임 시작`, `새 캐릭터 작성`, `세션 변경`, and `게임 종료`.
  Third, current live protocol QA still does not reach strategic movement: traces observed lobby/card downlinks and
  world-init bundle downlinks (`0x0325`, `0x0323`, `0x0f03`), but no fresh run reached `0x0f06`, `0x0356`, `0x0b01`,
  or `0x0b07`.
  Added `tools/logh7_record_map.mjs`, `tests/server/logh7-record-map.test.mjs`, and
  `docs/logh7-record-map-inventory.md`. The generated machine-readable inventory is
  `.omo/ulw-loop/full-revival-20260615/evidence/g247-record-map/record-map.json`: 203 catalog records plus runtime
  companion/trace-only records, 221 total. Blocked live gaps are `0x0313`, `0x0315`, `0x0321`, `0x0b01`, and
  `0x0b07`. Verification: focused location tests passed, record-map test passed, and the installed EXE was restored
  after every UI-explorer session (`shaVerified=true`).

- **2026-06-16 P48 - Player-facing EXE runtime is staged and smoke-verified.**
  Added a compiled Windows entrypoint, `LOGH7Launcher.exe`, to the installed tree so normal play starts from an EXE
  rather than a Python QA workflow. The launcher validates `node.exe`, the separated local server runtime at
  `logh7-runtime/src/server/logh7-server.mjs`, and the canonical Korean playable client at `exe/G7MTClient.exe`;
  writes the per-user BOTHTEC install registry key; starts `serve-auth` on `127.0.0.1:47900`; then launches the
  client from the `exe` working directory. Runtime files are now split under `logh7-runtime`: server source,
  selected content, persistent `state`, `logs`, and `traces`.
  Build/stage command: `python -m tools.logh7_build_player_launcher --installed-root .omo/work/logh7-installed`.
  Final smoke verification passed: `LOGH7Launcher.exe --check`, `--server-smoke`, and `--client-smoke` all returned
  exit code 0; the client survived the 5-second smoke window; the registry install value pointed at
  `E:\logh7-revival\.omo\work\logh7-installed\`; post-smoke port `47900` was closed and no `G7MTClient.exe`
  process remained. Installed client SHA stayed canonical playable:
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`.
  Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/g251-player-launcher-runtime/summary.json`.
  This closes startup/packaging only; the real strategic gameplay frontier still needs `0x0b01->0x0b07` or an
  equivalent command loop plus recovered server-authoritative strategic/office/action-context data.

- **2026-06-16 P49 - Korean text/HUD discriminator: lobby card text fixed, in-world lower-left HUD still unresolved.**
  Current text status is not "all Korean complete." The executable/font path is unified to the canonical Korean playable
  client, and the lobby card text path is now readable: live screenshot
  `.omo/ui-explorer/session-g271-lobby-be-text-hud/shots/003-game-start.png` shows the first card name as
  `Friedrich IV` instead of mojibake/path text. That is a Roman fallback because the project still lacks an
  authoritative VII character Korean naming table. Friend-provided portrait labels can complete a useful mapping only
  if recorded as human-labeled provenance.
  Server-side record fixes now protected by tests: `0x2004` card strings are big-endian UTF-16, `0x0323` keeps numeric
  endian separate from LE name strings, `0x0f06` returns structured active `0x0f07`, and `0x0356` fills its native
  `wchar[12]` name slot at `0x2e`.
  Live QA refuted these as the lower-left HUD fix: rich post-load pushes (G272), `LOGH_ACTION_LIST_SEATS=1` (G273), and
  the new `0x0356` native-name slot (G274) all still show path-like lower-left HUD text after selecting the first card.
  Screenshots/traces are under `.omo/ui-explorer/session-g272-rich-postload-hud-text`,
  `.omo/ui-explorer/session-g273-action-seats-hud-text`, and
  `.omo/ui-explorer/session-g274-native-tray-name-hud`.
  Verification passed with the focused red/green native-name-slot test and the broad 7-file server regression
  (`187` tests, `0` failures). Next target is the lower-left card/HUD renderer's actual string source, not more blind
  edits to `0x0323` or `0x0356`.

- **2026-06-16 P50 - GDI text probe refutes GDI ANSI as the lower-left HUD source.**
  Added `tools/logh7_frida_gdi_text.py` and `tools/tests/test_logh7_frida_gdi_text.py` to hook
  `ExtTextOutA`, `TextOutA`, `DrawTextA`, and `GetTextExtentPoint32A` with G7MTClient VA backtraces while driving
  login -> stable lobby -> game start -> first card. Live v6 evidence reached the actual in-world HUD:
  `.omo/ulw-loop/full-revival-20260615/evidence/g254-gdi-text-hud/g254-first-card-v6.png` still shows the lower-left
  path/environment-like garbage, and `g254-server-trace-v6.jsonl` reached `0x2009`, `0x200a`, conn3 world-init,
  `0x0f06/0x0f07`, `0x0b09/0x0b0a`, `0x0356`, and `0x1200/0x1202/0x1201`.
  The matching GDI capture `g254-gdi-text-first-card-v6.json` had 212 events (`105` measure/draw pairs) but no long
  ASCII string samples at all; only a single slash byte `/` matched the broad path-like regex. So the visible HUD
  corruption is not being emitted through the hooked GDI ANSI text sinks. Next RE target is below/around GDI:
  DirectDraw/Direct3D surface text blits, texture/font atlas rendering, or the internal lower-left HUD string-buffer
  writers. The same run also exposed a useful QA detail: clicking `게임 시작` too early leaves a blank lobby panel even
  though `0x2003/0x2004` has arrived, so live automation must wait for the menu to stabilize before selecting cards.
  Cleanup receipt: `.omo/ulw-loop/full-revival-20260615/evidence/g254-gdi-text-hud/cleanup-g254-v6.txt`.

- **2026-06-16 P51 - Player launcher defaults now match the richer Korean live-QA path; movement still blocked.**
  The user-facing `LOGH7Launcher.exe` server environment was aligned with the current Korean/rich-data QA baseline:
  `LOGH_LOBBY_RICH_CHARACTERS=1`, `LOGH_LOBBY_EARLY_OK=1`, `LOGH_STRAT_GALAXY=1`, and
  `LOGH_POSTLOAD_RICH_CHARACTER=1` are now part of `SetServerEnv`, alongside the existing message32, grid/fleet,
  duty-card, content DB, and Korean-name flags. This closes a real packaging/runtime drift: before this change,
  Python/Frida QA could receive richer lobby/world data than a normal player starting through `LOGH7Launcher.exe`.
  Red/green proof: the installed-tree test first failed because staged `LOGH7Launcher.cs` lacked
  `LOGH_LOBBY_RICH_CHARACTERS`; after the launcher patch,
  `python -m unittest test_logh7_installed_tree.Logh7InstalledTreeTests.test_build_installed_copies_detected_install_root_and_iso_launcher`
  passed, as did `python -m py_compile tools/tests/test_logh7_installed_tree.py` and
  `ruff check --preview tools/tests/test_logh7_installed_tree.py`.
  The installed launcher was rebuilt with
  `python -m tools.logh7_build_player_launcher --installed-root .omo/work/logh7-installed`, then verified through the
  EXE surface: `.omo/work/logh7-installed/LOGH7Launcher.exe --check`, `--server-smoke`, and `--client-smoke` all
  returned exit code 0. The captured command transcript is
  `.omo/ulw-loop/full-revival-20260616/evidence/full-playability/launcher-smoke-transcript.json`; post-smoke no
  `LOGH7Launcher.exe`/`G7MTClient.exe` process remained and ports `4173`, `4787`, `47900`, and `47901` were closed.

  The actual no-argument player launcher path was also exercised, not just the smoke modes. Starting
  `.omo/work/logh7-installed/LOGH7Launcher.exe` launched `G7MTClient.exe`, accepted the automated login, reached
  lobby, clicked `게임 시작`, selected the first card, and entered the world. Evidence:
  `.omo/ulw-loop/full-revival-20260616/evidence/full-playability/launcher-live/summary.json`, screenshots under
  `.omo/ulw-loop/full-revival-20260616/evidence/full-playability/launcher-live/shots/`, and trace
  `.omo/work/logh7-installed/logh7-runtime/traces/live-trace.jsonl`. The launcher-created trace observed the rich
  downlinks required by the QA baseline: outbound `0x0356`, `0x1200`, `0x1202`, `0x1201`, `0x0305`, and `0x0307`,
  plus world-entry evidence `0x0f02`, `0x0f06->0x0f07`, `0x0b09`, and `0x0b0a`. This closes the review gap between
  Python/UI-explorer QA and the normal player EXE path for login/selection/world-entry/rich-downlink delivery. The
  live-run cleanup intentionally terminated the client/launcher after evidence collection, so its launcher log may end
  with client exit code `-1`; that is not evidence of a clean play-session shutdown.

  A fresh live UI-explorer run with the same rich env reached stable Korean lobby, character selection, world entry,
  post-load rich character data, and several in-world information interactions. Evidence:
  `.omo/ui-explorer/session-g006-launcher-rich-20260616/` and
  `.omo/ulw-loop/full-revival-20260616/evidence/full-playability/g006-live-summary.json`. Trace counts observed
  `0x0f02`, `0x0f06`, outbound `0x0f07`, `0x0356`, `0x1200`, `0x1202`, `0x1201`, and duty-card refreshes
  `0x0305/0x0307`; bottom UI interactions emitted `0x0f08->0x0f09` and `0x0f04->0x0f05`. Screenshots confirm the
  lobby Korean buttons and the first card name `Friedrich IV` render, and the mail/info UI opens with Korean labels.
  Blockers remain explicit: map left/right clicks and `F1` still emitted no `0x0b01` and no `0x0b07`; the lower-left
  in-world HUD still renders path/memory-like garbage; the character-info popup/list still has garbled row names.
  Do not paper over the popup by writing guessed names into `0x1202`: prior P9 evidence says `0x1202` must stay
  id/raw-bytes only until the full character-info routing is proven. The next RE target is the action/select-grid
  activation path that should reach `0x0b01`, plus the non-GDI HUD/name renderer.

- **2026-06-16 P52 - Marker snapshot ordering fixed with `0x0313` object preload; movement still upstream.**
  A fresh G006 live run showed the marker failure mode was not raw `0x0315` parsing: the client requests
  `0x0314` cell grid before `0x0312` object table, so the scene snapshot can promote real cells with a stale
  object table. Server fix: when `LOGH_STRAT_GRID_EARLY=1` and `LOGH_STRAT_GALAXY=1`, `0x0304->0x0305` now
  sends an extra `0x0313` object table before the first `0x0314->0x0315`; `LOGH_STRAT_GRID_OBJECT_PRELOAD=0`
  disables only this paired preload for A/B tests.

  Live proof used `.omo/ui-explorer/session-g006-object-preload-47900-20260617` with canonical playable SHA
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`. Trace order reached
  `0x0304->0x0305`, extra `0x0313`, `0x0314->0x0315`, `0x0312->0x0313`, full `0x0f02`, and post-load rich
  pushes through `0x0f06->0x0f07`. Frida marker gate
  `.omo/ui-explorer/session-g006-object-preload-47900-20260617/marker-gate-preload.jsonl` recorded
  `stageMarkerRange=81`, `liveMarkerRange=81`, `stageClass3=81`, `liveClass3=81`, and `markerTable.valid=81`.
  This reopens proper strategic marker rendering. Tested grid clicks still produced `0` inbound `0x0b01` and
  `0` outbound `0x0b07`; the next blocker is command/actionability activation, not marker rendering.

- **2026-06-17 P53 - P0-01 signup-first user flow is live-proven; strategic gameplay remains upstream.**
  The signup-first path now has real `G7MTClient.exe` evidence instead of Vite/server-only proof. A fresh task-owned
  account DB began with `p001flow` and `characterCount=0`, created through the Korean signup portal before any client
  login. The real client then logged in as `p001flow` with a redacted 8-character ASCII password, using first-key compensation only for the login
  account field; password and character fields sent exact key events. Character creation entered `Flow` / `Lee` and
  flagship `Echo`, all without compensation. The final DB dump shows one generated `Flow Lee` character under
  `p001flow` with no duplicated leading letters. Evidence:
  `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-account-db-before-client.json`,
  `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-login.json`,
  `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-create-character.json`, and
  `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-account-db-after-world.json`.

  The matching world trace includes the required create/card/world-entry path: `0x1008`, `0x2004`, `0x0204`,
  `0x0323`, `0x0356`, and `0x0f06->0x0f07`. The start receipt now records the effective safe `LOGH_*` environment
  (`LOGH_ACCOUNT_DB`, message32 lobby/SS formats, world/grid/fleet/galaxy/tactics/grid-enter/postload/content/Korean
  flags) and confirms forbidden default flags such as `LOGH_NPC_AI`, `LOGH_RELAY`, `LOGH_AUTHORITATIVE`,
  `LOGH_DUTY_CARDS`, `LOGH_ROSTER_PUSH`, and `LOGH_STRAT_GRID_EARLY` were absent. Cleanup restored the canonical
  playable SHA and left no `G7MTClient.exe` process. Evidence:
  `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-start.json`,
  `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-world-trace.json`,
  `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-cleanup.json`, and
  `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-verification.json`.

  No-bypass QA used a separate negative account DB. Duplicate portal signup returned a Korean duplicate-account
  error, missing-account socket auth produced a reject trace without redirect or registration, and wrong-password
  before/after DB counts and hash stayed unchanged. Evidence:
  `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-duplicate.json`,
  `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-missing-account-trace.json`, and
  `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-wrong-password-dbdump.json`.
  This closes only the account/signup/created-character world-entry slice. It does not close star-system coordinate
  correctness, Korean chat round-trip, lower-left HUD/name rendering, fullscreen pillarbox, or the strategic
  `0x0b01->0x0b07` command loop.

- **2026-06-17 P54 - compact BE `0x0356` reaches current-character selection payload; command activation still blocked.**
  This entry supersedes the old P42 wording that treated `0x0356` as a fixed native LE body. Current static/live
  evidence says `0x0356` is a compact stream parsed by `FUN_0042c7e0` and applied by `FUN_004c0400`; numeric wire
  fields in the compact stream are BE while embedded name strings remain UTF-16 string fields. In the live session
  `.omo/ui-explorer/session-g006-selection-hit-sweep-20260617`, the auth trace recorded
  `recordWireHeadHex=0100000001010102000000000100000000000100000000000100000001000000`,
  `recordId04Le=1`, `recordGridUnit24Le=1`, `recordGridUnit28Le=1`, and `recordSeatCount250=1`.

  Runtime proof moved the previous blocker forward: Frida saw `currentBeforeSeatCount270=0` become
  `currentAfterSeatCount270=1`, and selection refresh produced `listAfterCount188=1`,
  `selectionPayloadSeatCount270=1`, `returnValue=1`. So the current-character selection payload is no longer
  empty.

  The command blocker remains upstream of SelectGrid and upstream of command refresh. Targeted clicks across the
  left card/list, central mode buttons, right command panel, and bottom icons plus a full-window
  `mouse_event(MOVE|ABSOLUTE)` grid sweep of 1564 points produced `selectionSelected189=-1`, `hudModeF4=1`,
  `hudAb0=-1`, `commandD5=-1`, `commandD6=-1`, `commandCount620=0`, `commandRowBuffer628=null`,
  zero `FUN_004fd7a0` mode-switch events, zero `FUN_004f6b00` action-category events, zero
  `FUN_004f5cb0` command-refresh events, zero `FUN_004f93c0` command-activation events, and zero selection-row
  hit-true events. The next discriminator is no longer "fill `0x0356`"; it is the semantic row/actionability gate
  that lets `FUN_004f6600` set `selection+0x624` and then lets `FUN_004f6b00` resolve a command category.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-compact-0356-selection-hit-summary.json`,
  `.omo/ui-explorer/session-g006-selection-hit-sweep-20260617/selection_hit_probe_mouseevent_grid.jsonl`,
  `.omo/ui-explorer/session-g006-selection-hit-sweep-20260617/selection_mouseevent_grid_moves.jsonl`, and
  screenshots `032` through `046` under that session. Verification passed:
  `node --check src/server/logh7-personnel.mjs src/server/logh7-login-session.mjs src/server/logh7-auth-server.mjs`
  and `node --test tests/server/logh7-auth-server.test.mjs tests/server/logh7-login-session.test.mjs
  tests/server/logh7-personnel.test.mjs` (120/120).

- **2026-06-17 P55 - `0x0305` command-list offset corrected; runtime command table still needs a dispatch/guard fix.**
  G006 C002 follow-up separated three things that were previously mixed. First, direct runtime memory
  positive control proved the command menu itself is viable: patching category 0 at runtime
  `table+0x1e=2`, `table+0x20=0x002b`, `table+0x22=0x0041` made `FUN_004f5cb0(commandMenu, 0)`
  return success and set `rowCountD4=2`. Static cross-check then pinned why the old server layout was
  wrong: `FUN_004c8700` returns the table base, `FUN_004f5cb0` treats the per-category record as
  `table+0x0a+category*0x46`, and reads command count/factories at record `+0x14/+0x16`. Therefore raw
  `0x0305` cards must carry factory ids at `record+0x16`; widget ids `110/112` are `factory+0x43`, so
  the server must send factories `0x2b/0x2d`, not `110/112`.

  Server builders/tests were updated accordingly. Isolated byte verification now shows a one-card
  `0x0305` with `body+0x16=2`, `body+0x18=0x2b`, `body+0x1a=0x2d`, and targeted tests passed:
  `node --check src/server/logh7-info-records.mjs`,
  `node --check src/server/logh7-login-session.mjs`, and
  `node --test tests/server/logh7-info-records.test.mjs tests/server/logh7-login-session.test.mjs`.

  Live QA narrowed the remaining blocker. A normal post-load run
  `.omo/ui-explorer/session-g006-card-command-layout-fix-20260617` reached world entry, but Frida still
  found no `0x2b` row in the runtime table; post-load `0x0305/0x0307` is too late for the one-shot table.
  Direct initial populated `LOGH_DUTY_CARDS=1` in
  `.omo/ui-explorer/session-g006-duty-initial-populated-ab-20260617` still stalled after
  `0x0304->0x0305` and never requested `0x0306`. New opt-in `LOGH_DUTY_CARDS_PRELOAD=1` in
  `.omo/ui-explorer/session-g006-duty-preload-extra-20260617` did not stall: trace reached empty
  `0x0304->0x0305`, extra `0x0305/0x0307`, client `0x0306`, full world entry, and post-load pushes.
  But the runtime table remained empty for category 0 (`rowCount1e=0`, no `0x2b`), and forcing
  `FUN_004f5cb0(0)` still produced `rowCountD4=0`.

  Conclusion: the wire bytes are now correct, and preload timing is safe enough as a discriminator, but
  it is not the fix. The next discriminator is the client dispatcher/guard/copy path for `0x0305/0x0307`:
  determine whether the populated static-card body is swallowed, copied to a staging object that is not
  the command table, or overwritten by the expected empty walker response before `FUN_004f5cb0` reads it.

- **2026-06-17 P56 - `0x0305/0x0307` duty-card hypothesis rejected for the conn3 world-login path.**
  P55's direct memory positive control remains useful: if category 0's runtime table is patched by hand,
  `FUN_004f5cb0(0)` can render command rows. The server-binding conclusion changed after a corrected
  dispatcher hook. The earlier Frida hook treated `FUN_004ba2b0` as a normal cdecl call, but it is
  thiscall: ECX is the client object, `args[0]` is the application code, and `args[1]` is the body.
  With the corrected hook, the live client processed the `0x0304->0x0305` and `0x0306->0x0307` bodies
  as session/character data. Body heads began with zero/count-like bytes followed by text such as
  `Friedrich IV`, not the duty-card command builder bytes. Independent scans of the expected client
  stores found no `0x2b/0x2d` factory pair and no `0x6e/0x70` command-descriptor pair from the intended
  duty-card payload.

  Server-side comparison also separated the collision: `buildWorldDataResponseInner(0x0305/0x0307)`
  emits the world-login walker objects, while `buildStaticInformationCardInner` and the static command
  builder emit the duty-card bytes. Sending the latter as extra `0x0305/0x0307` frames is therefore a
  code-family collision, not a valid command-table preload. It can stall, be ignored, or land in the
  wrong parser family; it does not populate the command table used by `FUN_004f5cb0`.

  Server cleanup now removes the `LOGH_DUTY_CARDS_PRELOAD`/`LOGH_DUTY_CARDS_POSTLOAD` paths and keeps
  the world-login `0x0304` reply as the required empty `InformationSession` walker response. The default
  live-QA command and player launcher must not set `LOGH_DUTY_CARDS_*`. The next discriminator is not
  another `0x0305/0x0307` offset tweak; it is the real selection/actionability route: which read-model or
  command path (`0x034e/0x034f` card character, `0x0707` appointment, or a strategic `0x0bxx` path) makes
  `FUN_004f6600`, `FUN_004f6b00`, and `FUN_004f5cb0` run in the native UI.

- **2026-06-17 P57 - category selection reaches `FUN_004f5cb0`, then row count collapses to zero.**
  The final gate probe supersedes the earlier "selection setter unknown" wording. In
  `.omo/ui-explorer/session-g006-category0-final-gate-47900-20260617`, the native client reached
  `modeF4 1->2`, selected the action-list row (`listSelected189 -1->0`), resolved category `0` through
  `FUN_004f6b00`, and entered `FUN_004f5cb0(0)`. The function returned success, but command menu state
  changed from `rowCountD4=24, categoryD6=-1` to `rowCountD4=0, categoryD6=0`; no `0x0b01` followed.

  Category `1` shows the same final shape. The prior safe session
  `.omo/ui-explorer/session-g006-final-hit-gate-safe-20260617` reached `listSelected189 -1->0` and
  `FUN_004f6b00 retval=1`; a later label-pointer run stayed alive with `modeF4=3`, `categoryD6=1`, and
  `rowCountD4=0`. The one observed crash at `0x005034e9` maps to `FUN_005034d0` reading `param_1+8`;
  the filtered category-0 run logged valid label/widget targets for every write, so the crash remains a
  prior transient branch rather than the current stable blocker.

  Current discriminator: dump and trace the `FUN_004c8700()` runtime command table. `FUN_004f5cb0` reads
  each category record's command count at `record+0x14` and factories at `record+0x16`. Until that table
  is populated for the selected category, command-row hit-testing and `FUN_004f93c0(0x2b)` cannot occur.
  Evidence: `.omo/ulw-loop/evidence/g006-c002-category-apply-rowcount-zero-20260617.txt`.

- **2026-06-17 P58 - command table lifecycle: empty staging is promoted to guarded runtime.**
  The follow-up lifecycle probe ran against
  `.omo/ui-explorer/session-g006-command-table-lifecycle-47900-20260617` with the same safe full-world
  flags as P57 and without `LOGH_DUTY_CARDS*`, `LOGH_ROSTER_PUSH`, or `LOGH_STRAT_GRID_EARLY`.
  It hooked `FUN_004ba2b0`, `FUN_004c2a30`, `FUN_004c4a10`, and `FUN_004f5cb0` in one live client run.

  The live world-login `0x0305` dispatcher filled staging `clientBase+0x3e0c8c` with session/character-like
  bytes, but the static-card shape still had `count00=0` and category 0 `commandCount14=0`.
  The apparent factory words under `record+0x16` were decoded string/body bytes
  (`[104,32,73,86,0,6,21760,17152]` in this run), not usable command factories because the count byte was
  zero. The live `0x0307` dispatcher likewise left `staging307.count00=0`.

  `FUN_004c2a30` then called `FUN_004c4a10`, which copied this empty-count staging into runtime:
  `runtime305.guard00=1`, `runtime305.bodyCount08=0`, category 0 `commandCount14=0`, and
  `runtime307.count00=0`. Later `FUN_004f5cb0(0)` entered with `selectionAb0=0` and `rowCountD4=24`,
  returned success, but set `categoryD6=0` and `rowCountD4=0`; no `0x0b01` followed.

  This pins the current blocker more narrowly: the selected/category path works, but the command table source
  is empty before the one-shot promotion. The next investigation should compare the old nonzero positive-control
  bytes with this safe path, then find whether a native dispatcher, local static resource/dat file, or another
  read-model is supposed to seed `record+0x14/+0x16` before `FUN_004c4a10`.
  Evidence: `.omo/ulw-loop/evidence/g006-c002-command-table-lifecycle-20260617.txt` and raw JSONL
  `.omo/ui-explorer/session-g006-command-table-lifecycle-47900-20260617/command_table_lifecycle.jsonl`.

- **2026-06-17 P59 - positive-control proves command rows render when the table is nonzero.**
  The old direct table patch is now compared against the safe full-world lifecycle run. In
  `.omo/ui-explorer/session-g006-selection-force-nocontent-20260617/table_patch_positive_probe.jsonl`,
  the probe wrote `tableBase+0x1e=2`, `tableBase+0x20=0x002b`, and `tableBase+0x22=0x0041`.
  A direct `FUN_004f5cb0(commandMenu, 0)` call then returned `1` and produced
  `afterMenu.categoryD6=0`, `afterMenu.rowCountD4=2`, with rows `0x002b` and `0x0041`.

  The safe lifecycle run reaches the same category-0 apply path without the patch, but
  `runtime305.category0.commandCount14=0` before the call and `rowCountD4=0` after it. This proves the
  native command-menu renderer and factory IDs are viable; the missing piece is the authoritative source
  that should seed the staging command table before `FUN_004c4a10`.

  Next search target: do not re-run selection/click geometry, `0x0356`, `0x0707`, or the known-colliding
  `0x0305/0x0307` injection as a fix. Instead, locate the native dispatcher admission condition or local
  resource/dat reader that can make category records nonzero at `record+0x14/+0x16`.
  Evidence: `.omo/ulw-loop/evidence/g006-c002-command-table-positive-control-compare-20260617.txt`.

- **2026-06-17 P60 - 0x0305/0x0307 wire is zero-filled; dispatcher text is stale receive-buffer residue.**
  Added server-side response trace fields for generic world-info `0x0305/0x0307` and reran the real client in
  `.omo/ui-explorer/session-g006-wire-body-residue-47900-20260617`. The server trace shows `0x0305` body length
  `21002` and `0x0307` body length `58802`, both with count `0` and `worldInfoWireNonzeroFirst256=0`.

  The Frida dispatcher still saw a `Friedrich IV`-like tail at `param_3`, proving the earlier wording treated
  reused receive-buffer bytes as if they were server wire. Corrected interpretation: current generic walker replies
  are empty; the stale tail can still be copied into staging, but count remains zero and command rows remain absent.
  Evidence: `.omo/ulw-loop/evidence/g006-c002-wire-zero-body-residue-20260617.txt` and
  `.omo/ui-explorer/session-g006-wire-body-residue-47900-20260617/trace.jsonl`.

- **2026-06-17 P61 - raw MsgDat/static-resource scan found no authoritative command table.**
  Scanned 96 original-ish files from `.omo/work/logh7-installed` and `.omo/work/logh7-extracted`, excluding generated
  runtime/content trees. The structured `0x0305`/`0x0307` pass found many weak candidates, but they reduce to PE
  instruction bytes, MsgDat offset/text bytes, or compressed/pixel-like TCF false positives. The stricter literal
  scan for positive-control-like factories found only one `0x0041,0x002b` sequence in installed `G7Start.exe`, with no
  extracted original counterpart and no count/stride-compatible command record shape.

  Verdict: no authoritative original MsgDat/static-resource command table has been found. Continue through native
  admission/resource decoder tracing or a real-client-gated nonzero body-shape experiment, not another raw data scan.
  Evidence: `.omo/ulw-loop/evidence/g006-c002-original-static-command-table-scan-verdict-20260617.txt`.

- **2026-06-17 P62 - compact 0x0305/0x0307 preload가 runtime command table까지 도달.**
  v3 실클라 probe `.omo/ui-explorer/session-g006-command-table-preload-probe-v3-47900-20260617`는 더 좁은
  admission shape를 검증했다. 정상 empty `0x0304->0x0305` walker response는 유지하고, extra compact nonzero
  `0x0305`를 한 번 보낸 뒤, 나중의 `0x0306` request에는 compact nonzero `0x0307`을 직접 응답했다. 이 순서가
  empty walker response의 command descriptor staging overwrite를 막았다.

  서버 trace에서 정상 `0x0305`는 count 0으로 남았고, extra `0x0305`와 `0x0307`은 BE count 1 및 first 256 bytes
  nonzero 4개를 보였다. Frida는 `staging305.count00=1`, `staging305.category0.commandCount14=2`, first factories
  `0x002b/0x0041`, `staging307.count00=1`을 확인했다. `FUN_004c4a10` 뒤에는 `runtime305.guard00=1`,
  `runtime305.bodyCount08=1`, `runtime305.category0.commandCount14=2`, `runtime307.count00=1`이었다.

  따라서 반박된 것은 모든 `0x0305/0x0307` 사용이 아니라 잘못된 fixed/static-card body family와 overwrite
  timing이었다. compact body shape는 실제 클라이언트에 admission되고 one-shot promotion 뒤에도 살아남는다.
  단, playability criterion은 아직 열려 있다. 이어진 command-list click은 time sync traffic만 만들었고,
  `category-apply`는 발화하지 않았으며 inbound `0x0b01` 또는 mined equivalent도 없었다.

  증거: `.omo/ulw-loop/evidence/g006-c002-command-table-preload-v3-20260617.md`, raw Frida
  `.omo/ui-explorer/session-g006-command-table-preload-probe-v3-47900-20260617/command_table_lifecycle.jsonl`, raw trace
  `.omo/ui-explorer/session-g006-command-table-preload-probe-v3-47900-20260617/trace.jsonl`.

- **2026-06-17 P63 - v5 menu activation: table은 nonzero, 클릭 대상은 command row가 아님.**
  `.omo/ui-explorer/session-g006-command-table-menu-activation-v5-47900-20260617`에서 v3와 같은
  `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` 경로를 다시 확인했다. Frida lifecycle은 `staging305.count00=1`,
  `category0.commandCount14=2`, factory `0x002b/0x0041`, `staging307.count00=1`, 그리고
  `FUN_004c4a10` 뒤 `runtime305.guard00=1`, `bodyCount08=1`,
  `runtime305.category0.commandCount14=2`, `runtime307.count00=1`을 기록했다.

  이후 우측 메뉴 후보 클릭을 실제 client에 입력했다. `1146,948`은 우측 패널을 열고, `1146,985`는
  화면상 `1. 국가관리` 행을 클릭했다. 전역 hit probe stdout은 이 hit가 `object=0x7157f10`,
  `idB04=11`, `x=1084`, `y=97`, `w=160`, `h=16`, `returnVa=0x501dee`인 system/info-panel 행임을
  보였다. command-menu 전용 rect logger는 0 events였고, category hook은 마지막까지
  `categoryResolve=0`, `categoryApply=0`, `rowHit=0`, `menuRowCountD4=24`, `menuCategoryD6=-1`이었다.

  `modeButton24/28`이라고 보던 후보도 정정됐다. 실제 rect는 `1073..1238/875..907`과
  `1244..1401/875..907`로, 우측 상단의 `게임 중단`/`사운드 설정` 버튼이다. `662,924` 클릭은
  전략 모드 전환을 만들지 않았다. Trace에는 heartbeat `0x0300`와 서버 선푸시 `0x0b09/0x0b0a`만
  있고 inbound `0x0b01`/`0x0b07`은 없다. `direct_category_apply_probe.js`는 v5 폴더에 작성했고
  문법 검사는 통과했으나, attach 시점에는 PID `39180`이 이미 종료되어 결과가 없다.

  판정: 현재 blocker는 command table이 아니라 command UI 진입점과 row hit 경로다. 다음 반복은 월드
  진입 직후 직접 category apply를 먼저 붙이고, 그 뒤 실제 command row rect, `FUN_004f93c0(0x002b|0x0041)`,
  inbound `0x0b01` 또는 exact equivalent를 잡는다. 증거:
  `.omo/ulw-loop/evidence/g006-c002-command-menu-activation-v5-20260617.md`.

- **2026-06-17 P64 - v7 direct category apply: command rows는 생성되지만 active route에 없음.**
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617`에서 월드 진입 후
  `FUN_004f5cb0(commandMenu,0)`를 직접 호출했다. 호출은 성공했고 `rowCountD4=2`, `categoryD6=0`,
  factories `0x002b/0x0041`을 만들었다. command menu dump도 row0 `idB04=23`,
  row1 `idB04=650` object와 rect를 확인했다.

  하지만 화면에 보이는 `1. 국가관리`는 direct apply 전부터 표시되던 별도 `idB04=11`
  system/info-panel row였다. row-only hit probe에서 `1146,985` 클릭은
  `object=0x133a4f10`, rect `1084,977..1244,993`, `currentPoint=1143,982`,
  `isMenuRow=false`로 기록됐고, trace는 `0x0f08->0x0f09`만 남겼다. 이것은 전략 명령 실행이 아니다.

  `FUN_005015f0(kind=2)` 계측은 force 전후 각각 35개 hit를 기록했지만 command row pointer를 한 번도
  받지 않았다. 진단용으로 `hud.modeF4=2`, `selectionAb0=0`을 강제하고 다시
  `FUN_004f5cb0(0)`를 호출해도 rows는 active route에 붙지 않았다. 따라서 현재 blocker는 table
  admission이나 category apply가 아니라, 생성된 row object를 `0x005025f0`/`FUN_005015f0(kind=2)`
  hit-test route와 render parent/widget group에 attach하는 경로다. 다음 반복은 `FUN_004fd100`
  주변 row insertion/parent activation을 추적한다.

  증거: `.omo/ulw-loop/evidence/g006-c002-direct-category-apply-v7-20260617.md`, raw
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/direct_category_apply.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/menu_row_route_only.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/fun5015_command_row.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/fun5015_after_force_mode.jsonl`.

- **2026-06-17 P65 - v8 active gate: command row loop은 `commandMenu[0]+4`에서 막힘.**
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617`에서 v7 direct apply를 재현했다.
  `FUN_004f5cb0(commandMenu,0)` 뒤 `rowCountD4=2`, `categoryD6=0`, row0 `idB04=23`,
  row1 `idB04=650`이 다시 확인됐다. Row pointer reference scan은 durable refs가 commandMenu row slots
  `+0x30/+0x34`와 같은 메모리의 HUD-relative `+0x160/+0x164`에만 있음을 보였다.

  정적 `FUN_004f58c0`는 `*(commandMenu[0]+4) != 0`, `selectedD5 < 0`, `rowCountD4 > 0`일 때만
  command rows를 `FUN_005015f0(kind=2)`에 넘긴다. v8 `row_scan_gate_dump`는 direct apply 뒤에도
  `commandMenu.activePtr=0x0fba0e40`, `activePtr+4=0`, `rowListCount620=0`, `rowBuffer628=null`임을
  확인했다. 이것이 v7에서 row objects가 있는데도 active route에 안 들어온 즉시 원인이다.

  진단용 positive control로 `activePtr+4`를 `0->1`로 쓰자 row0과 row1이 곧바로
  `FUN_005015f0(kind=2)`에 도달했다. 다만 두 row 모두 `hit=false`였고, 같은 화면 좌표
  `1146,985`를 다시 눌러도 trace는 `0x0f08->0x0f09`뿐이었다. 따라서 C002는 아직 pending이다.
  다음 반복은 `commandMenu[0]+4`를 정상적으로 켜는 native mode/widget 경로와, 그 뒤 row hit가
  true가 되는 좌표 변환을 찾아야 한다.

  증거: `.omo/ulw-loop/evidence/g006-c002-row-active-gate-v8-20260617.md`, raw
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/row_attach_probe.jsonl`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/row_scan_gate_dump.jsonl`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/post_gate_row_hit_probe.jsonl`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/post_gate_row_hit_click_probe.jsonl`.

- **2026-06-17 P66 - v9 gate pair and command row click reach factory `0x2b`, but not SelectGrid.**
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617`에서 v8의 `+4` 단독 gate를 확장해
  실클라 command row path를 다시 검증했다. 최초 probe는 Frida가 `this.*` 대입을 거부해
  `TypeError: no setter for property`를 냈고, 최종 probe는 thread-keyed frame stack으로 수정했다.

  Direct category apply는 여전히 command rows를 만든다. v8에서 빠진 절반은 active object `+5`였다.
  native `FUN_00502ea0(activePtr,1)`와 `FUN_005024b0(activePtr,1)`를 함께 호출해 active `+4/+5=1`을
  만들자 row0/row1 route와 global rect가 잡혔다. Row0은 `(12,136)..(103,157)`, center `(57,146)`;
  row1은 `(113,136)..(204,157)`, center `(158,146)`이다.

  Row0 center 클릭은 command row를 선택해 `selectedD5=0`으로 바꿨고,
  `FUN_004f93c0(factoryIndex=43/0x2b, category=0)` 호출/반환 `1`을 기록했다. Screenshot
  `006-click-57-146.png`는 첫 명령 `워프 항행`과 한국어 도움말을 보여 주지만, 여러 command label은
  여전히 `???`로 남아 UI 한글화가 미완료임을 같이 증명한다.

  아직 전략 명령 pass가 아니다. 목표 grid click은 거리 표시(`90 LY`)와 `0x0f08->0x0f09` 정보 트래픽만
  만들었다. `0x004f93c0`, `0x00581c80`, `0x0058fef0`, `0x005737d0`, `0x004b78a0` 관찰 probe는
  `selectedD5=0`이 유지된 상태에서도 target click이 `FUN_004b78a0(arg1=0,arg2=48,arg3=0,arg4=1)`만
  탔음을 보였다. `FUN_00581c80` SelectGrid factory, `FUN_0058fef0` command gate,
  `FUN_005737d0` SendWarpCommand는 모두 0회다.

  C002는 계속 pending이다. 다음 target은 raw command table admission, direct category apply, row 좌표가
  아니라 `FUN_004f93c0(0x2b)` 이후 boundary다. Runtime factory table slot과 반환 object를 덤프해 왜
  selected row가 SelectGrid를 생성하지 않는지 확정한다.

  증거: `.omo/ulw-loop/evidence/g006-c002-gate-pair-v9-20260617.md`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/gate_pair_probe_fixed2.jsonl`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/row_center_click_probe_filtered2.jsonl`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/selectgrid_target_probe.jsonl`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/shots/006-click-57-146.png`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/shots/008-click-833-545.png`.

- **2026-06-17 P67 - v10 factory-return probe: row0 does construct SelectGrid; blocker moved after target selection.**
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617` attached the focused v10b Frida probe before
  row0 click. Runtime `slot2b=0x581c80` matched `FUN_00581c80`. Row0 center `(57,146)` entered
  `FUN_004f93c0(index=0x2b, category=0)`, called `FUN_00581c80` once with row0 object `0x113108e4`,
  returned SelectGrid object `0x544db60` vtable `0x6702b8`, and linked it as the manager current dialog.

  This corrects P66: v9 missed SelectGrid because the observer was attached after row0 click. The new blocker is
  inside the linked SelectGrid/target confirmation path, not the factory table.

  Target click `(833,545)` showed a highlighted grid and `90 LY`, but the only action path was
  `FUN_004b78a0(arg2=0x45)` returning `0`; static `FUN_004b78a0` maps that to case `0x44`,
  `0x0f08/0x0f09`. Row0 re-click, `RETURN`, and repeated target clicks did not call `FUN_0058fef0` or
  `FUN_005737d0`. Final hook counts had `selectGridFactory-enter=1`, `commandGate=0`, `sendWarpCommand=0`;
  trace had two `0x0f08->0x0f09` round-trips and no `0x0b01`/`0x0b07`.

  Screenshots also keep the UI debt visible: `워프 항행` and some Korean help strings render, but many command
  labels remain `???`, and the tooltip has placeholder-like MCP/time text.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-factory-return-v10-20260617.md`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/factory_return_probe_v10b.jsonl`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/trace.jsonl`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/shots/007-v10-target-grid.png`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/shots/008-v10-confirm-warp-button.png`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/shots/012-v10-target-click-repeat-b.png`.

- **2026-06-17 P68 - v12b SelectGrid child scan: command objects exist, but target confirm still routes to info.**
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617` reused the real canonical playable client and
  repeated the command-row path. After native category apply plus active `+4/+5`, row0 center `(57,146)` again
  entered `FUN_004f93c0(index=0x2b, category=0)` and constructed SelectGrid root `0x551db60`
  vtable `0x6702b8` as current dialog.

  The arena scan found the missing object graph: `ReceiveResult 0x551d930/0x551dd70` with
  `p28=0xb07,p2c=0xb01`, `GoReceive 0x551d9a0` slot2 `0x581570`, `SendWarpCommand 0x551d9d0`
  vtable `0x676aec` slot2 `0x5737d0`, `SelectGrid.targetRoot 0x551dac0` slot2 `0x570a10`, and
  `TargetGrid.child 0x551dae8` slot3 `0x573cd0`.

  This moves the blocker again: C002 is not missing SelectGrid objects. The target click `(833,545)` still
  selected a destination and showed `90 LY`, but the observed route was `FUN_004b78a0(arg2=0x45)` and trace
  `0x0f08->0x0f09`. The hooks saw no `FUN_0058fef0`, no `FUN_005737d0`, no `TargetGrid.child` slot3,
  no `sendGridMove`, and no `0x0b01/0x0b07`.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-selectgrid-child-v12-20260617.md`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/selectgrid_v12b_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/selectgrid_v12b_arena_scan.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/selectgrid_v12b_click_path_hooks.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/trace.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/shots/008-v12b-target-grid.png`.

- **2026-06-17 P69 - v14b positive-control: `DAT_009d2a3c=2` opens confirm and emits `0x0b01`, but payload writer is still missing.**
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617` reused the canonical playable
  client and v13b-safe transition flags. Row0 center `(57,146)` opened the warp UI, and target click
  `(833,545)` displayed `90 LY`.

  The focused v14b probe attached after target selection. Before `SelectGrid.targetRoot` slot2,
  `DAT_009d2a34=257`, `DAT_009d2a3c=1`, `DAT_009d2a40=0xffffffff`, `DAT_009d2a74=0`,
  `DAT_009d2a7c=0`. The probe wrote `DAT_009d2a3c=2` once. `FUN_00570a10` returned `3`, and the client
  opened the confirm dialog.

  Confirm click invoked `SendWarpCommand` slot2 `0x005737d0`, then `sendGridMove` `0x004b48d0`, then
  `sendCorrelator arg2=0x3b`. The server trace recorded inbound `0x0b01`. This proves that v13b was not
  blocked by a wrong interpretation of the `FUN_00570a10` branch; `DAT_009d2a3c=2` is sufficient to enter
  the send path.

  C002 is still not complete. `DAT_009d2a40` stayed `0xffffffff`, and `sendGridMove` entered with
  `arg1=0xffffffff,arg2=0,arg3=0`. The safe run intentionally did not enable `LOGH_RELAY` or
  `LOGH_AUTHORITATIVE`, so the server replied with generic `0x0b02` rather than exercising the
  command-engine `0x0b01->0x0b07` path.

  Next target: find the natural `DAT_009d2a3c` writer/state transition and the destination/target writer
  around `DAT_009d2a40` or `SendWarpCommand` fields. Do not repeat coordinate mining, command table admission,
  SelectGrid object scans, or this positive-control branch unless the payload writer changes.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-d2a3c-positive-control-v14b-20260617.md`,
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/selectgrid_v14b_force_d2a3c2_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/trace.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/shots/008-v14b-after-force-d2a3c2.png`,
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/shots/009-v14b-confirm-warp-decision.png`.

- **2026-06-18 P70 - v21-v26 writer/projection probe: left-click gate is reachable, but natural projection feeds invalid target input.**
  `session-g006-selectgrid-v20-normal-earlygrid-47900-20260617` continued from v14b without counting the
  `DAT_009d2a3c=2` positive-control as completion. Static and dynamic evidence now identify
  `DAT_009d2a30` as the state base: `DAT_009d2a34=state+0x04`, `DAT_009d2a3c=state+0x0c`,
  `DAT_009d2a40=state+0x10`.

  v21 reached the natural writer branch under a real left-click. The branch passed the phase and left-click gates and
  hit `0x004d7b13`, but the validator call used `x=0,y=0,range=5`. No `writer-validator-passed`,
  target raw write, or phase-2 write followed.

  v22 located the immediate bad input source. After `FUN_004d3580`, `0x004d7a8c` wrote
  `state+0x24=8074780 (0x007b360c)`, and `0x004d7a9c` wrote `state+0x28=0`, repeatedly. That is not a normal
  grid coordinate pair, so the next target is the projection/output representation, not another click sweep.

  v24 and v26 tried `(42,25)` only as diagnostic controls. v24 proved the state can be patched before load/push but
  still did not pass. v26 proved the call-site stack really became `(42,25,5)`, then the client died before the
  return-site hook could observe `AL`; trace ended with `socket-error read ECONNRESET`. Forced coordinate injection is
  therefore unsafe evidence, not a viable route.

  C002 remains pending. Next work must reverse `FUN_004d3580`, upstream `0x004b25a0`, mouse globals
  `0x22143dc/0x22143e0`, and `FUN_004d6310`'s expected target representation before returning to
  `DAT_009d2a3c`/`DAT_009d2a40` natural writer hunting.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-selectgrid-writer-branch-v21-v26-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-selectgrid-writer-branch-v21-v26-cleanup-20260618.txt`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v21_writer_branch_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v22_projection_writer_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v26_callsite_return_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/trace.jsonl`.

- **2026-06-18 P71 - v27 projection/camera correction: projection math is normal; current raw and focus init are stale.**
  P70의 v22 해석을 정정했다. `state+0x24=0x007b360c,state+0x28=0`은 침습적 mid-function/caller-stack
  probe에서 나온 값이라 다음 blocker로 쓰지 않는다. Historical evidence로 유지하되, function-level probe와
  정적 수식을 우선한다.

  Static evidence says `FUN_004d3540` maps grid to world with `worldX=x-49.5`, `worldZ=24.5-y`.
  `FUN_004d3580` maps world back to grid with `gridX=ftol(worldX+50.0)`, `gridY=ftol(25.0-worldZ)`.
  Therefore `FUN_004d3580` itself is not the wrong-cell source.

  The safer v20 projection probe shows the actual natural-state problem: `currentLocation.raw=0`, camera/focus remains
  near world `(-49.5, 24.5)`, and mouse positions project to `(0,0)` or `(1,0)`. A raw-only positive-control changed
  `DAT_007cd04c+0x11178` to `2539` but did not move camera/focus; projection still returned `(0,0)`.

  The next implementation discriminator is not more coordinate forcing. It is the server/client data path that should
  initialize `DAT_007cd04c+0x11178` before `FUN_004d4e90`/`FUN_004d5030` writes the camera/focus state. Candidate
  outbound families are `0x0323`, `0x0356`, `0x0f06`, and account/character profile current-location fields.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-projection-camera-v27-20260618.md`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v20_projection_strict.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v20_current_raw_positive.jsonl`,
  `.omo/ghidra/export/G7MTClient/functions.jsonl`, `.omo/f_4d6b70.c`.

- **2026-06-18 P72 - v28 current-grid raw routing: `0x0317` is not the missing `DAT_007cd04c+0x11178` writer.**
  v27의 서버/클라 데이터 경로 가설을 정적 evidence와 서버 builder inventory로 좁혔다. Binary immediate scan found
  six `0x00011178` references, all reads from `DAT_007cd04c+0x11178`: `0x004d4e9c`, `0x004d5116`,
  `0x004d6392`, `0x004d6494`, `0x004d6f79`, `0x004d8f41`. Direct global-store patterns to
  `DAT_007cd04c` were not found in the scanned forms.

  `0x0317 ResponseInformationGrid` is not the fix for this field. The native dispatcher case writes the current-grid
  dword to `clientBase+0x35f358`, proven by the single `0x35f358` code reference at `0x004babe2` in `FUN_004ba2b0`.
  That field can be useful as a probe, but it is not the same storage as `DAT_007cd04c+0x11178`.

  `FUN_004d3a40` is the strongest writer/initializer for the structure behind `DAT_007cd04c`: it starts at
  `DAT_007cd04c+8`, walks 100 cells per row, and advances by `0x0e` bytes per cell. This confirms the expanded 100x50
  grid layout. It still does not identify who writes the current raw dword at `+0x11178`.

  Server-side review agrees: `0x0313/0x0315` fill strategic grid/object tables under clientBase; `0x0323`,
  `0x0325`, `0x0356`, `0x0b09`, `0x0b0a`, and `0x0f06/0x0f07` remain plausible linkage/timing candidates, but none
  is proven to land in `DAT_007cd04c+0x11178`. The next real-client run must therefore be a watchpoint timeline across
  baseline, `LOGH_GRID_ENTER=1`, `LOGH_POSTLOAD_PLAYER_RECORD=1`, and `LOGH_POSTLOAD_RICH_CHARACTER=1`, comparing the
  field after `0x0f06`, `0x0b09`, `0x0325`, `0x0323`, `0x0356`, and `0x0b0a`.

  C002 remains pending. Do not repeat raw forcing, `0x0317` default enabling, command table work, or SelectGrid object
  existence scans as completion evidence.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-current-grid-raw-v28-20260618.md`,
  `.omo/ghidra/export/G7MTClient/functions.jsonl`, `.omo/ghidra/bin/G7MTClient.exe`,
  `src/server/logh7-login-session.mjs`, `docs/logh7-info-records-wire.md`,
  `docs/logh7-strategic-map-wire.md`.

- **2026-06-18 P73 - v29 current-grid watch baseline: stable world path still leaves current raw at zero.**
  v28 left the next step as a timing discriminator rather than a speculative server push. P73 adds the reusable tool
  for that discriminator: `tools/logh7_current_grid_watch.py`.

  The watcher attaches to an existing UI explorer session by reading `session.json` `clientPid`, or to an explicit
  `--pid`. It records JSONL snapshots for `DAT_007cd04c+0x11178`, `+0x1117c`, `+0x11180`, an expanded-grid sample at
  `+8`, and camera/focus globals. It also hooks `FUN_004d3a40`, `FUN_004d4e90`, `FUN_004d5030`, `FUN_0057bbc0`,
  `FUN_0058d140`, and `FUN_0058ee70`.

  A baseline live session then attached the watcher before login and reached the stable world path through `0x0325`,
  `0x0323`, and `0x0f06->0x0f07`. The result did not move the blocker: `DAT_007cd04c+0x11178` stayed `0`,
  `+0x1117c` stayed `0`, `+0x11180` sampled as zero, and `FUN_004d4e90` left camera/focus at
  `(-49.5, 0, 24.5)`. Hook failures were zero and the watcher recorded 2086 events.

  The next separated run enabled only `LOGH_GRID_ENTER=1`. It reached the stronger post-load path:
  `0x0f06->0x0f07` followed by `0x0b09` and `0x0b0a`. That still did not populate the native current-grid state:
  6188 watcher events kept `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero, and the captured `+8` head zero.
  `FUN_004d4e90`/`FUN_004d5030` each ran once, `FUN_0058ee70` ran 3086 enter/leave pairs, and camera/focus stayed
  `(-49.5, 0, 24.5)`.

  The following player-record variant enabled `LOGH_GRID_ENTER=1 + LOGH_POSTLOAD_PLAYER_RECORD=1`. It reached
  `0x0f06->0x0f07` followed by `0x0b09`, extra `0x0325`, extra `0x0323`, and `0x0b0a`. This also did not populate
  native current-grid state: 5750 watcher events kept `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero, and
  the captured `+8` head zero. `FUN_004d4e90`/`FUN_004d5030` each ran once, `FUN_0058ee70` ran 2867 enter/leave pairs,
  and camera/focus stayed `(-49.5, 0, 24.5)`.

  The final separated rich-character variant enabled `LOGH_GRID_ENTER=1 + LOGH_POSTLOAD_RICH_CHARACTER=1`. It reached
  `0x0f06->0x0f07` followed by `0x0b09`, extra `0x0325`, extra `0x0323`, `0x0b0a`, compact `0x0356`,
  `0x1200`, `0x1202`, and `0x1201`. This also did not populate native current-grid state: 4336 watcher events kept
  `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero, and the captured `+8` head zero.
  `FUN_004d4e90`/`FUN_004d5030` each ran once, `FUN_0058ee70` ran 2160 enter/leave pairs, and camera/focus stayed
  `(-49.5, 0, 24.5)`.

  v29 therefore refutes the separated server-delivery timing candidates in this set. The next runtime pass must not
  repeat baseline/grid-enter/player-record/rich-character server flag permutations as completion evidence; it should
  search for the `DAT_007cd04c` structure allocator/initializer/writer instead.

  Verification: focused red-first test failed on missing module, then `python -m unittest
  tools.tests.test_logh7_current_grid_watch` passed after implementation. `python tools/logh7_current_grid_watch.py
  --help`, `python -m tools.logh7_current_grid_watch --help`, and `npm run test:tools` also passed. After changing
  camera/focus sampling from integer bits to float reads, `npm run test:tools` was rerun and again reported 247 tests
  OK. Baseline cleanup restored canonical playable SHA with `shaVerified=true`; baseline server/client PIDs were gone
  and `4787/47900/47901` had no `LISTENING` rows. Grid-enter cleanup also restored canonical playable SHA with
  `shaVerified=true`; grid-enter server/client PIDs were gone and the same ports had no `LISTENING` rows. Player-record
  cleanup also restored canonical playable SHA with `shaVerified=true`; player-record server/client PIDs were gone and
  the same ports had no `LISTENING` rows. Rich-character cleanup also restored canonical playable SHA with
  `shaVerified=true`; rich-character server/client PIDs were gone and the same ports had no `LISTENING` rows.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-baseline-summary.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-baseline-trace.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-baseline-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-gridenter-summary.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-gridenter-trace.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-gridenter-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-playerrecord-summary.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-playerrecord-trace.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-playerrecord-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-richcharacter-summary.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-richcharacter-trace.json`,
  `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-richcharacter-stop.json`,
  `tools/logh7_current_grid_watch.py`, `tools/tests/test_logh7_current_grid_watch.py`.

- **2026-06-18 P74 - v30/v31 global-slot and heap-slot watch: root appears after `0x0f02`, before `0x0f06`.**
  Added two reusable Frida probes: `tools/logh7_global_slot_watch.py` and `tools/logh7_heap_slot_watch.py`.
  v30c stage2 reached `0x0f07` and proved `DAT_007cd04c` changes from null to `0xf5e7918` at
  `2026-06-18T01:42:12.139Z`, after `0x0f02` extras (`01:42:11.584Z..01:42:11.587Z`) and before `0x0f06`
  (`01:42:12.372Z`). `DAT_007cd048=1` follows at `01:42:12.327Z`. `FUN_004d3a40` enters at `01:42:12.352Z`,
  so it is post-root, not the root writer. `MemoryAccessMonitor` captured only a page read at `0x4e971a` and no writes.

  v31b stage2 reached `0x0f07` with allocator hooks active. Root `0xf5f0918` appeared at
  `2026-06-18T01:51:44.227Z`, guard became 1 at `01:51:44.687Z`, and 178 allocation events produced no root exact or
  near allocation match. v31c wide retry did not reach `0x0f07` and is recorded only as an incomplete run; cleanup was
  clean with `shaVerified=true` and no relevant process/listener leftovers.

  Current raw/list remains empty: `currentRaw11178=0`, `listCount1117c=0`, grid/list head samples zero/readable-empty.
  C002 remains pending. Next action is not another server payload variant; it is a computed writer search between
  `0x0f02` and `0x0f06`, starting with `memcpy`/`memmove`/`memset` overlap hooks for `0x007cd040..0x007cd060` and
  handler-boundary binary search.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-global-heap-slot-v30-v31-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-global-heap-slot-timeline-v30-v31-20260618.json`,
  `.omo/ulw-loop/evidence/g006-c002-global-slot-watch-v30c-stage2-summary.json`,
  `.omo/ulw-loop/evidence/g006-c002-heap-slot-watch-v31b-summary.json`,
  `.omo/ulw-loop/evidence/g006-c002-heap-slot-watch-v31c-cleanup.txt`.

- **2026-06-18 P75 - v32/v33 global page guard: `DAT_007cd04c` root writer identified.**
  Added `tools/logh7_global_page_write_watch.py` and `tools/logh7_global_page_guard_watch.py`.
  The v32 copy/fill overlap run reached `0x0f07` and saw the global root/guard transitions, but recorded zero
  `overlap-write` events for `0x007cd040..0x007cd060`.

  The v33 page-guard run reached `0x0f07` and trapped 26 writes to page `0x007cd000`. Two writes hit the watched
  target range. The root-slot write was `EIP=0x004c8a23`, `memory=0x007cd04c` at
  `2026-06-18T02:11:15.593Z`; the following poll showed `DAT_007cd04c=0xf5f1918`. Static mapping places
  `0x004c8a23` inside `FUN_004c8a10` at `*(undefined4 *)(param_1 + 4) = param_2`, where `param_1` is the global
  state object at `0x007cd048`. Therefore the root pointer writer is now identified.

  C002 remains pending. After root assignment and guard activation, `currentRaw11178=0` and `listCount1117c=0` still
  hold. The next runtime pass must snapshot `FUN_004c8a10` entry args and `FUN_004d3bd0`/`FUN_004c8bc0`/
  `FUN_004d3a40` boundaries to find the writer for `+0x11178/+0x1117c/+0x11180`, not repeat server payload
  variants as completion evidence.

  Cleanup restored canonical playable SHA with `shaVerified=true`; no game/Frida/Python watcher process and no
  `4787/47900/47901` listener remained.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-pageguard-v32-v33-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-pagewrite-v32-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-pageguard-v33-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-pageguard-v33-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-pageguard-v33-cleanup.txt`.

- **2026-06-18 P76 - v34 root initializer boundary: post-root initializers do not fill current/list.**
  Added `tools/logh7_root_init_watch.py` with focused tests. The watcher hooks `FUN_004c8a10`,
  `FUN_004d3bd0`, `FUN_004c8bc0`, `FUN_004d3a40`, `FUN_004b64c0`, and `FUN_004c4170`, then records
  caller args plus `DAT_007cd04c+0x11178/+0x1117c/+0x11180` snapshots. Red-first failed on missing module;
  implementation then passed 2 root-init tests, 12 combined watcher tests, `py_compile`, and installed Ruff.

  v34 reached `0x0f07` at `2026-06-18T02:19:43.098Z`. At `FUN_004c8a10` entry,
  `ecx=0x007cd048`, `rootParam2=0xf5ef918`, and `stackArg2=0xf34a020`. The `rootParam2` object was already
  empty for the blocker fields: `byte0=1`, `currentRaw11178=0`, `listCount1117c=0`, grid head zero. After
  `FUN_004d3bd0`, `FUN_004c8bc0`, `FUN_004c8a10` leave, and `FUN_004d3a40`, the global root still had
  `currentRaw11178=0`, `listCount1117c=0`, grid head zero.

  This moves the blocker again: the root assignment and post-root initialization boundary are not where the
  missing current/list data should be fixed. The next pass must trace the pre-assignment root object source,
  especially `FUN_004c4170`'s `FUN_004b5bb0 -> FUN_004c45f0(uVar2,2)` path and the `FUN_004b64c0` entry
  `edx` root candidate.

  Cleanup restored canonical playable SHA with `shaVerified=true`; no game/Frida/Python watcher process and no
  `4787/47900/47901` listener remained. Only `47900` TIME_WAIT rows remained.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-root-init-v34-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-wait-0f07.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-cleanup.txt`.

- **2026-06-18 P77 - v35/v36b root source discriminator: base/institution list fills, current raw stays zero.**
  v34 left the next boundary at `FUN_004c4170` and the pre-assignment root source. P77 added an opt-in server
  discriminator, `LOGH_WORLD_IMPORT_BASES=1`, which injects `0x031f ResponseInformationBase` and
  `0x0321 ResponseInformationInstitution` during `0x0f02`, before the final `0x0f03` acknowledgement.

  v35 is the safe-env baseline. It reached `0x0f06->0x0f07`, but the `0x0f02` extras were only
  `0x0313`, `0x0315`, `0x0325`, `0x0323`, `0x033b`, and `0x0f03`. At `FUN_004c4170` enter/leave, both
  base/institution source samples and copied buffers were zero. At `FUN_004c8a10` entry the root candidate was still
  `byte0=1`, `currentRaw11178=0`, and `listCount1117c=0`.

  v36b is the corrected opt-in run. The first v36 attempt was discarded because it omitted the known-safe flags. v36b
  reached `0x0f06->0x0f07` and its `0x0f02` sequence was
  `0x0204`, `0x031f`, `0x0321`, `0x0313`, `0x0315`, `0x0325`, `0x0323`, `0x033b`, `0x0f03`.
  The runtime watcher then showed nonzero base/institution source buffers before `FUN_004c4170`, nonzero copied buffers
  after it, and `rootAssign-004c8a10` with `listCount1117c=4`.

  This does not close C002. The same v36b run kept `mainState+0x126714`, `mainState+0x2b6a70`, and
  `DAT_007cd04c+0x11178` at zero. Static interpretation matches the runtime result: `FUN_004c4170` copies
  `mainState+0x3facf4/+0x3fb2f8` into strategy base/institution lists, but the current value comes from
  `mainState+0x126714`, a separate source.

  Next action: trace the writer/source for `mainState+0x126714` and prove whether it propagates through
  `FUN_004c4170 -> mainState+0x2b6a70 -> DAT_007cd04c+0x11178`. Do not repeat `0x031f/0x0321` preload as completion
  evidence.

  Verification: targeted red-first login-session test failed before implementation because `0x031f/0x0321` were absent;
  the focused test passed after implementation, then `node --test tests/server/logh7-login-session.test.mjs` passed with
  82 tests.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-root-source-v35-v36b-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v35-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v35-trace.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v36b-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v36b-trace.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v36b-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-source-v36b-cleanup.txt`,
  `src/server/logh7-login-session.mjs`, `tests/server/logh7-login-session.test.mjs`.

- **2026-06-18 P78 - v37 current-source watcher: `[mainState+8]+0x320` is zero before strategy root import.**
  P77 narrowed the blocker from base/institution import to the current/focus source. P78 extended
  `tools/logh7_root_init_watch.py` to hook `0x0048fb80` as
  `commandCreateOutfitParser-0048fb80` and to sample the source object at `mainState+8`, including
  `source+0x320`. The red-first test failed because those generated-script markers were absent; after
  implementation, the focused watcher test passed and the module stayed under the 250 pure-LOC limit.

  v37 ran the canonical playable client with safe flags plus `LOGH_WORLD_IMPORT_BASES=1`. The client reached
  the strategy screen and the full trace contains `0x0f06->0x0f07` plus post-load extras
  `0x0b09`, `0x0325`, `0x0323`, `0x0b0a`, `0x0356`, `0x1200`, `0x1202`, and `0x1201`. The screen,
  however, still showed `NO DATA` in the lower UI panels.

  The decisive runtime snapshot was at `FUN_004c4170`. Entry showed `mainState=0xf345020`,
  `currentSourcePtr8=0xf34502c`, and `currentSourceFields.currentSource320=0`. The following
  `FUN_004b5bb0` hook returned raw zero. Leave then showed `mode126710_u32=513`, `modeByte126711=2`,
  `field126714_u32=0`, `strategyCurrent2b6a70=0`, root `currentRaw11178=0`, and
  `listCount1117c=4`. Base/institution import therefore works, but the current/focus source is still zero.

  No `commandCreateOutfitParser-0048fb80-enter/leave` event occurred before this decision point, so the live
  wire order does not fill this source object's `+0x320` through `FUN_0048fb80` before `FUN_004c4170`.
  C002 remains pending. The next pass must find the native writer/parser for `mainState+8` source object
  `+0x320`; do not repeat `0x031f/0x0321` preload or server-push variants as completion evidence.

  Cleanup restored canonical playable SHA with `shaVerified=true`; no `G7MTClient.exe`, watcher PID, or
  `frida.exe` remained, and port `47900` had no LISTENING entry.

  Evidence: `.omo/ulw-loop/evidence/g006-c002-root-current-v37-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-trace-all.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-row1-first.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-cleanup.txt`,
  `.omo/ui-explorer/session-g006-root-current-v37-47900-20260618/shots/005-v37-row1-first.png`,
  `tools/logh7_root_init_watch.py`, `tools/tests/test_logh7_root_init_watch.py`.

- **2026-06-18 P79 - v38 text-parser 판별도 실패: `[mainState+8]+0x320`은 계속 0.**
  P78에는 싸게 확인할 수 있는 모호점 하나가 남아 있었다. `0x0048fb80`은 binary
  CreateOutfit parser였지만, 근처 `0x0048ffd0`은 text/INF-style parser 형태이고 canonical
  playable EXE scan에서 찾은 유일한 생성자 외부 `+0x320` byte write site를 함수 범위 안에
  포함한다. 그래서 P79는 `commandCreateOutfitTextParser-0048ffd0` hook을 추가하고 실클라를
  다시 실행했다.

  canonical playable `G7MTClient.exe`
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`를 다시 정적 스캔한 결과,
  직접 `+0x320` 참조는 정확히 7개였다: `0x0040a816`, `0x0048dea8`, `0x0048e3eb`,
  `0x0048ff92`, `0x0049086b`, `0x00490dcb`, `0x004a4cc8`. Direct reference map은
  `0x0048fb80` at vtable `0x0066d5b4`, `0x0048ffd0` at `0x0066d5b8`,
  `0x0048d860` at `0x0066d614`도 보존한다.

  v38 실클라 세션은 같은 안전 플래그와 `LOGH_WORLD_IMPORT_BASES=1`을 사용했다. 로비 카드,
  캐릭터 선택, gameplay connection, `0x0f06->0x0f07`, post-load extras
  `0x0b09`, `0x0325`, `0x0323`, `0x0b0a`, `0x0356`, `0x1200`, `0x1202`, `0x1201`까지
  도달했다. 런타임 snapshot은 import 뒤에도 `currentSource320=0`, `field126714_u32=0`,
  `strategyCurrent2b6a70=0`, root `currentRaw11178=0`, root `listCount1117c=4`를 보였다.

  `commandCreateOutfitParser-0048fb80`와 `commandCreateOutfitTextParser-0048ffd0`는 모두
  `FUN_004c4170` decision point 전에 실행되지 않았다. 따라서 현재 wire order에서 두 obvious
  CreateOutfit parser 경로는 current/focus writer가 아니다. C002는 계속 pending이다. 다음 pass는
  server push variant 반복이 아니라 `[mainState+8]` source object의 네이티브 생성/초기화,
  생성자형 write `0x0040a816`/`0x004a4cc8`, parser 외부 write `0x0049086b`를 따라가야 한다.

  정리는 canonical playable SHA를 복구했고, `G7MTClient.exe`, watcher Python, Frida helper,
  `4787/47900/47901` LISTENING entry가 남지 않았다.

  증거: `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618-watcher.stdout.txt`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-cleanup.txt`,
  `.omo/ui-explorer/session-g006-root-current-v38-47900-20260618/shots/005-v38-after-row1.png`,
  `tools/logh7_root_init_watch.py`, `tools/tests/test_logh7_root_init_watch.py`.

- **2026-06-18 P80 - v39 source identity 정정: `[mainState+8]`는 inline `\x01name` source.**
  P79 이후에는 parser를 더 붙이는 대신 `[mainState+8]` 자체의 정체성을 찍었다.
  `tools/logh7_root_init_watch.py`는 `sourceVtable`, `sourceHeadHex`, `sourceIdentityTag`,
  `retvalFields`, `mainState+8` snapshot을 추가했고, 보조 hook으로
  `candidateSourceFactoryA-0040a700`와 `candidateSourceFactoryB-004a49c0`를 붙였다.

  v39 실클라 세션은 canonical playable SHA
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`로 실행됐고,
  safe flags와 `LOGH_WORLD_IMPORT_BASES=1`을 사용했다. 요청/응답 trace는 로비,
  캐릭터 선택, gameplay connection, `0x0f06->0x0f07`, post-load
  `0x0b09/0x0325/0x0323/0x0b0a/0x0356/0x1200/0x1202/0x1201`까지 도달했다.

  핵심 snapshot은 `FUN_004c4170` entry다. `mainState=0xf344020`,
  `mainState+8=0xf344028`, `[mainState+8]=0xf34402c`였고 이 값은 `mainState+0xc`다.
  source head는 `016e616d65...`, 즉 `\x01name`로 시작했다. 따라서
  `sourceVtable=0x6d616e01`은 진짜 vtable이 아니라 inline data head로 정정한다.
  `currentSource320=0`, `FUN_004b5bb0` return 0, `field126714_u32=0`,
  `strategyCurrent2b6a70=0`, root `currentRaw11178=0`, root `listCount1117c=4`는 그대로다.

  `0x0040a700`/`0x004a49c0` factory wrapper는 설치만 되고 enter/leave 0회였다.
  `0x0048fb80`/`0x0048ffd0` parser도 계속 0회였다. 최신 blocker는
  `mainState+8 = mainState+0xc`를 쓰는 초기화 경로와 inline source `+0x320`
  non-parser writer다. C002는 pending이다.

  정리는 canonical playable SHA를 복구했고, `G7MTClient.exe`, watcher Python, Frida helper,
  `4787/47900/47901` LISTENING entry가 남지 않았다.

  증거: `.omo/ulw-loop/evidence/g006-c002-root-current-v39-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v39-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v39-trace-all.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v39-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v39-cleanup.txt`,
  `.omo/ui-explorer/session-g006-root-current-v39-47900-20260618/shots/005-v39-after-row1.png`,
  `tools/logh7_root_init_watch.py`, `tools/tests/test_logh7_root_init_watch.py`.

- **2026-06-18 P81 - v40 setter/accessor cluster 판별: `0x004b5bd0`은 `+0x320` writer가 아니다.**
  P80에서 `[mainState+8]`가 `mainState+0xc` inline `\x01name` source임을 확인했으므로,
  P81은 주변 constructor/accessor/setter cluster를 붙였다. `tools/logh7_root_init_watch.py`에는
  `mainStateConstructor-004b6000`, `sourceDirect31eSetter-004b5bd0`,
  `sourceRelated324Setter-004b5cf0`, `sourceRelated31eSetter-004b5db0`,
  `sourceRelated358Setter-004b5e80` hook을 추가했다. hook 설치 목록은 JS 배열 루프로 줄여
  pure LOC를 248로 유지했다. focused test, watcher 12-test bundle, `py_compile`, Ruff는 통과했다.

  v40 실클라 세션은 safe flags와 `LOGH_WORLD_IMPORT_BASES=1`로 실행했고, canonical playable SHA
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`를 사용했다. trace는 로비,
  캐릭터 선택, gameplay connection, `0x0f06->0x0f07`, post-load
  `0x0b09/0x0325/0x0323/0x0b0a/0x0356/0x1200/0x1202/0x1201`까지 도달했다.

  새 hook 중 `sourceDirect31eSetter-004b5bd0`만 enter/leave 각 1회 호출됐다. 이때 generic snapshot의
  `mainState=0xf34002c`는 같은 run의 `fieldImport-004c4170` source `0xf34002c`와 같았다. 그러나
  정적 의미상 이 함수는 source `+0x31e` 주변 setter이며, `currentSource320`, `field126714_u32`,
  `strategyCurrent2b6a70`, root `currentRaw11178`을 채우지 않았다. `mainStateConstructor-004b6000`과
  `sourceRelated324/31e/358` hook은 설치만 되고 live enter/leave 0회였다.

  `fieldImport-004c4170` entry/leave는 v39 blocker를 재확인했다. `[mainState+8]=0xf34002c=mainState+0xc`,
  `sourceHeadHex=016e616d65...`(`\x01name`), `currentSource320=0`, `field126714_u32=0`,
  `strategyCurrent2b6a70=0`, root `currentRaw11178=0`, root `listCount1117c=4`였다. C002는 pending이다.
  다음 pass는 서버 payload 반복이나 `0x004b5bd0` 반복이 아니라 `mainState+8` slot store,
  inline `\x01name` header init, inline source `+0x320` writer를 정적으로 먼저 찾는다.

  정리는 canonical playable SHA를 복구했고, `G7MTClient.exe`, watcher Python, Frida helper,
  `4787/47900/47901` LISTENING entry가 남지 않았다. `47900`은 `TIME_WAIT`만 남았다.

  증거: `.omo/ulw-loop/evidence/g006-c002-root-current-v40-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-trace-all.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-cleanup.txt`,
  `.omo/ui-explorer/session-g006-root-current-v40-47900-20260618/shots/005-v40-after-row1.png`,
  `tools/logh7_root_init_watch.py`, `tools/tests/test_logh7_root_init_watch.py`.

- **2026-06-18 P82 - v41 source import 판별: `source+0x320`은 optional record `+0x08`에서 온다.**
  P81 이후에는 `0x004b5bd0`을 반복하지 않고 정적으로 `0x004c2a80`/`0x004c2c80` import path를 따라갔다.
  `0x004c2c80`은 `0x00771074` `"name"`을 이용해 inline `\x01name` source를 만들고, optional
  record가 있을 때 `0x004c2f0e`의 `rep movsd`로 source `+0x318` 블록을 채운다. 따라서
  source `+0x320`은 optional record `+0x08`에서 복사된다. `0x004b5bd0`은 이어서 `+0x31e`를
  세팅하는 함수일 뿐이다.

  v41 실클라 세션은 canonical playable SHA
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`로 실행됐고, safe flags와
  `LOGH_WORLD_IMPORT_BASES=1`을 사용했다. 금지 플래그
  `LOGH_NPC_AI/LOGH_RELAY/LOGH_AUTHORITATIVE/LOGH_DUTY_CARDS/LOGH_ROSTER_PUSH/LOGH_STRAT_GRID_EARLY`는
  absent였다. trace는 로비, 캐릭터 선택, gameplay connection, `0x0f06->0x0f07`, post-load
  `0x0b09/0x0325/0x0323/0x0b0a/0x0356/0x1200/0x1202/0x1201`까지 도달했다.

  watcher 핵심 이벤트는 두 개다. `sourceImportCallsite-004b780e-hit`에서 `ecx=0xf349020`,
  `predictedSource=0xf34902c`, `mainSlot8Before=0xf34902c`였으므로 `[mainState+8]=mainState+0xc`
  store는 `0x004b780e` 이전에 이미 끝난다. `sourceOptionalCopyAfter-004c2f18-hit`에서는
  `ecxSource=0xf34902c`, `ebxOptionalRecord=0xf7633e0`, `sourceHeadHex=016e616d65...`,
  `predictedSource320=0`, `optionalRecordPlus08=0`, `source320MatchesOptional08=true`였다.

  C002는 pending이다. `+0x320` writer는 좁혔지만 현재 서버/레코드 데이터에서는 optional record
  `+0x08`이 0이라 current/focus가 채워지지 않는다. 다음 pass는 `0x004c2a80/0x004c2c80/0x004c2f18`
  반복이 아니라 optional record 생성/채움 경로, optional record `+0x08`에 들어갈 원본 nonzero 값,
  그리고 `[mainState+8] = mainState+0xc` slot writer를 추적한다.

  정리는 session stopped 상태, `G7MTClient.exe`/Frida/Python watcher 프로세스 없음,
  `4787/47900/47901` TCP entry 없음, trace copy SHA 일치로 끝났다. watcher는 17개 이벤트를 남겼지만
  요청 seconds 뒤 자동 종료하지 않아 watcher Python PID와 wrapper PowerShell PID를 수동 종료했다.
  이후 `tools/logh7_source_import_watch.py`는 wrapper/copy stack shape를 분리하도록 보강했고 focused test,
  `py_compile`, Ruff를 통과했다.

  증거: `.omo/ulw-loop/evidence/g006-c002-source-import-v41-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-trace.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-cleanup.txt`,
  `.omo/ui-explorer/session-g006-source-import-v41-47900-20260618/shots/005-v41-character-row1.png`,
  `tools/logh7_source_import_watch.py`, `tools/tests/test_logh7_source_import_watch.py`.

- **2026-06-18 P83 - v42-v45 `0x0325` parser-stream 판별: early 금지, postload 전용 안정.**
  P82 이후에는 optional record가 실제 unit table parser와 어떻게 연결되는지 보기 위해
  `FUN_004301d0` character record parser와 `FUN_00419ca0` unit table parser를 watcher에 추가했다.
  정적 disasm은 `FUN_00419ca0`이 native output에는 count를 `+0`, unit0 id를 `+4`에 쓰지만,
  wire stream에서는 count 다음 unit id를 바로 읽는다는 것을 보였다. 이 때문에 서버에는
  `wireLayout: "parser-stream"` 옵션을 추가했다.

  v42 baseline은 기존 native wire를 유지했다. 클라이언트 parser는 early `0x0325`를
  count=256, unit0 id=256, unit1 id=0으로 읽었고, early source import는 primary id=1이지만
  `primaryUnit24=0`이라 optional unit index 1/id0을 잡았다. postload character record에는
  `primaryUnit24=1`이 보였지만 early `mainState+0xc` source는 복구하지 못했다.

  v43/v44는 global `LOGH_UNIT_STREAM_WIRE=1`로 early `0x0325`까지 parser-stream wire를 적용했다.
  이때 unit parser는 count=1, unit0 id=1을 정확히 읽었지만, native exact-count branch
  `0x004bb15c -> 0x004bb179`에 들어간 뒤 real client가 ECONNRESET/창 종료로 끝났다.
  `LOGH_FULL_UNIT_LOCATION`을 제거한 v44도 같은 결과였으므로 early parser-stream은 금지한다.

  v45는 `LOGH_POSTLOAD_UNIT_STREAM_WIRE=1`만 켜고, global `LOGH_UNIT_STREAM_WIRE`와
  `LOGH_FULL_UNIT_LOCATION`은 끈 상태로 실행했다. early `0x0325`는 native-safe 형태로 남겨
  클라이언트가 전략 HUD까지 살아남았고, postload `0x0325`만 parser-stream으로 replay했다.
  postload unit parser는 count=1, unit0 id=1을 기록했고, `FUN_004c2c80` import는
  primary id=1/`primaryUnit24=1`, optional unit0 id=1/index0으로 맞았다.

  그래도 `optionalRecord+8` 자체가 0이라 source `+0x320`은 0으로 남았다. v45에서
  grid 후보 `(728,552)`는 `0x0300` time request만 만들었고, `(690,800)`과 minimap center
  `(700,985)`는 유의미한 inbound command를 만들지 않았다. `0x0b01/0x0b07`은 없다.
  또 하단 좌측에 `이미 탈퇴하셨습니다.`라는 문맥 불일치 UI 문자열이 표시됐다. 따라서 C002는
  여전히 pending이다.

  정리는 `tools.logh7_ui_explorer stop` 뒤 추가 PowerShell 점검에서 `G7MTClient.exe`/Frida/Python
  프로세스와 `4787/47900/47901` TCP entry가 모두 없음을 확인했다.

  증거: `.omo/ulw-loop/evidence/g006-c002-source-import-v45-postload-stream-minunit-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v45-postload-stream-minunit-20260618.jsonl`,
  `.omo/ui-explorer/session-g006-source-import-v45-postload-stream-minunit-47900-20260618/trace.jsonl`,
  `.omo/ui-explorer/session-g006-source-import-v45-postload-stream-minunit-47900-20260618/shots/003-v45-character-row1.png`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v45-cleanup-20260618.txt`,
  `src/server/logh7-login-protocol.mjs`, `src/server/logh7-login-session.mjs`,
  `src/server/logh7-auth-server.mjs`, `tests/server/logh7-login-protocol.test.mjs`,
  `tests/server/logh7-login-session.test.mjs`, `tools/logh7_source_import_watch.py`,
  `tools/tests/test_logh7_source_import_watch.py`.

- **2026-06-21 P84 - JSON은 초기 시드/legacy 호환, 런타임 영속성은 SQLite 기본으로 정정.**
  최신 실행 기준에서 `content/*.json`은 매뉴얼/에셋/RE에서 복구한 초기 시드와 감사 산출물이다.
  서버가 정상 런타임 상태로 삼는 파일은 `content/logh7-content.db`,
  `logh7-runtime/state/accounts.sqlite`, `logh7-runtime/state/world-state.sqlite`다.
  `createRepository()` 기본 backend는 SQLite로 바뀌었다. 이후 P86 정정으로 JSON repository backend는
  런타임 옵션에서 제거했고, JSON은 seed/import 입력에만 남긴다.
  계정 테스트와 실행 문서의 신규 경로도 `.sqlite` 기준으로 정리했다. 오래된 핸드오프의
  `.omo/work/*-accounts.json` 문구는 당시 실행 증거로만 읽고 현재 기본값으로 사용하지 않는다.

  같은 pass에서 page-101 실제 래스터 원형 별점 기준으로 성계 좌표/색상 seed를 다시 산출했고,
  `content/galaxy.json`, `content/galaxy-passable-cells.json`, `content/logh7-content.db`를 재빌드했다.
  이젤론은 server 0-index `[53,12]`, game 1-index `[54,13]`; 페잔은 `[51,38]`/`[52,39]`.
  색상은 중심 픽셀이 아니라 배경 차감 대표 disk RGB로 태양 등급 seed를 판정한다.

  실클라 함선 쪽은 `LOGH_STATIC_SHIPS=1` full 63-row `0x030b`가 아직 `0x0310` 전진을 막지만,
  `LOGH_STATIC_SHIPS_LIMIT=1`은 `0x0310 -> 0x0311` 이후 월드 init/postload까지 전진함을 확인했다.
  즉 레코드 전체 형식은 완전 오진이 아니고, 특정 row 또는 full-set field/cap 문제로 좁혀졌다.
  다음 pass는 `LOGH_STATIC_SHIPS_LIMIT` 이분 탐색으로 최초 실패 row를 찾아야 한다.

- **2026-06-21 P85 - `0x030b` 정적 함선 기본 송신은 live-safe 19-row로 고정.**
  P84 이후 full 63-row 실패를 재검증하면서 `wait-trace`의 settle 구간 누락을 배제하고
  `trace.jsonl` 전체를 기준으로 판정했다. `LOGH_STATIC_SHIPS_LIMIT=19`까지는 `0x0310/0x0f02/0x1201`
  전진이 확인됐고, `LIMIT=20`부터는 후속 전진이 끊겼다. row 20/21 단독과 특정 row skip 실험은
  통과했지만, 20개 카운트 자체가 실패하므로 현재 차단점은 특정 함선 데이터 하나가 아니라
  live client의 `0x030b` 다건 수용 경계다.

  그래서 일반 플레이 경로의 `LOGH_STATIC_SHIPS=1` 기본값은 19개로 잘랐다. `LOGH_STATIC_SHIPS_LIMIT`
  또는 `LOGH_STATIC_SHIPS_ONLY`가 있으면 RE/이분탐색을 위해 이 cap을 우회한다. 즉 함선은 보이게 하되
  full 63개는 별도 RE 과제로 남긴다. 새 테스트는 기본 19-row, `LIMIT=20` 우회, `ONLY=1,3` 우회를 고정한다.

  실클라 검증도 완료했다. `session-g018-staticships-safe-default-20260621`를 fullscreen/canonical-playable로
  띄우고 `LOGH_STATIC_SHIPS=1`만 켠 기본 경로를 실행했을 때 trace 79개 이벤트 안에 `0x030b`, `0x0310`,
  `0x0f02`, `0x1201`이 모두 남았다. `0x030b` 뒤 `0x0310 -> 0x0311`, world/grid init, postload simple
  transaction까지 전진했으므로 19-row cap은 현재 플레이 진입용으로 live-safe다. `stop` 후
  `serverAlive=false`, `clientAlive=false`, canonical playable SHA
  `15ed8a35ea3891374096b25d43878e74a6abbf97242b32ecf357ca4c577768e0` 복원을 확인했다.

  데이터 파일 원칙도 유지한다. `content/ship-stats.json` 같은 JSON은 초기 시드/감사 산출물이고,
  런타임 계정/월드 상태는 SQLite(`accounts.sqlite`, `world-state.sqlite`) 전용이다. JSON은 seed/import 입력에만 쓴다.

  증거: `src/server/logh7-login-session.mjs`, `tests/server/logh7-login-session.test.mjs`,
  `.omo/ui-explorer/session-g018-staticships-safe-default-20260621/trace.jsonl`,
  `.omo/ui-explorer/session-g018-staticships-safe-default-20260621/shots/023-world-static-ships-safe.png`,
  focused test `node --test tests/server/logh7-login-session.test.mjs --test-name-pattern "0x030a|0x030b|live-safe|bisection|parser isolation"` = 95/95 pass.

- **2026-06-21 P86 - JSON은 초기 데이터만, 계정/월드 런타임 저장은 SQLite 전용으로 강화.**
  사용자 정정대로 JSON repository/account DB 경로를 런타임 저장소에서 제거했다. `createRepository({backend:'json'})`와
  `LOGH_REPOSITORY_BACKEND=json`/`LOGH_PERSIST_BACKEND=json`은 실패해야 한다. 예전 `LOGH_SNAPSHOT_PATH=*.json`은
  저장 경로가 아니라 seed 입력으로만 해석하고, 저장은 `LOGH_SQLITE_PATH` 또는 기본
  `logh7-runtime/state/world-state.sqlite`에 한다.

  계정도 동일하다. `--account-db accounts.json`은 admin/create와 serve-auth에서 거부하고,
  레거시 계정 JSON은 `LOGH_ACCOUNT_SEED_JSON`/`--account-seed-json`으로 SQLite에 초기 import할 때만 쓴다.
  즉 유저/서버 배포물에서 mutable 파일은 `accounts.sqlite`, `world-state.sqlite`이고, JSON은 `content/*.json`,
  시나리오, 추출 감사물, seed 입력에 한정한다.
