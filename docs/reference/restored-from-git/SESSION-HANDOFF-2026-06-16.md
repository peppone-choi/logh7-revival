# LOGH VII — Session Handoff for Codex (2026-06-16)

> Continuation handoff after a long autonomous session. **Headline: the session-list → character-creation
> blocker is RESOLVED and live-verified.** Read this top-to-bottom, then resume from **§7 NEXT**.
> Prior handoffs: `docs/SESSION-HANDOFF-2026-06-15.md`, `-live.md`. Progress log: `docs/logh7-inworld-progress.md`
> entries **P17–P26** (most recent, authoritative). Memory: `…/memory/logh7-playable-client-build-2026-06-15.md`
> (정정1–7) + `MEMORY.md` top line.

---

## 1. ★ HEADLINE — session-list blocker RESOLVED (server packed-wire fix)

**Symptom (was):** 새 캐릭터 작성 → "서버 공지" → **empty session-select panel** (0 rows) → dead end.

**Root cause (confirmed, after refuting 6 wrong hypotheses live):** the **transport was healthy all along.**
0x2006 (LobbyResponseInformationSession, 21258B payload / 0x530a frame) is received, deciphered, extracted,
object-built, and handed to its **registered inline parser `FUN_00444900`** (handler vtbl[0]; vtbl 0x66cd78).
That parser expects a **PACKED, sequential, variable-length wire** (one advancing cursor; SEEK_CUR proven).
Our server emitted the session records in a **fixed 0x14c-stride layout** instead → the parser read misaligned
bytes → `session_name_size 18 > 13` → **bailed on record 0** → empty picker.

**Fix (server-side, wire-format only — NO client patch):** rewrote `buildInformationSessionInner` /
`writeSessionRecord` / `writePstr16` in `src/server/logh7-scenario-session.mjs` to emit the **packed sequential
wire** the parser actually consumes (counted strings = unit count, no NUL terminator). Total payload size stays
`0x5304` (frame `0x530a`) so the dispatch-size table is unaffected.

**Live verification (this session):** restart with the fixed server → 새캐릭 → **session picker renders 2 rows**
(`.omo/work/shot-sessionpanel.png`) → double-click a row → `0x0200`/world-join/`0x0201` session connect →
**faction-select panel (은하제국 / 자유행성동맹) = character creation step 1** (`.omo/work/shot-dblclick.png`).
The dead-end is gone; 새캐릭 now proceeds into character creation. **Task #4 resolved.**

Server test suite: **659/659, 0 fail.**

---

## 2. The packed 0x2006 wire (as the client parser `FUN_00444900` reads it)

`[u8 lead][u8 count(<0x41)]`, then `count` records, each PACKED sequentially (NOT fixed-stride):
- `[u16 session_id][u8 status(1|2 = selectable)]`
- `[u8 name_len(≤0xd)][u16×len name (UTF-16LE units, no NUL)]`
- `[u8 begin_day_len(≤0x41)][u16×len begin_day]`
- `[u32 term]`
- 2× power: `[u8 id][u32 d0][u32 d1][u32 d2][u8 pend(<2)]`; pend× `[u8 super_man_len(≤0xd)][u16×len][u16][u8×4][u8][u16][u16][u32][u32][u32]`
- `[u8 ending(<2)]`; ending× `[u16][u16][u32][u32][u32]`

Counted strings carry the **unit count** (the parser reads exactly `len` u16 units). Korean names are 1 unit/char
so ≤13 chars is safe. The per-power `d0/d1/d2` and ending-body scalars are **UNPINNED semantics** (emitted as 0).
Full field map + the parser RE are in `docs/logh7-proto-info-records.md` and progress-log P25/P26.

---

## 3. Files changed this session

**Session-list fix (the headline):**
- `src/server/logh7-scenario-session.mjs` — `buildInformationSessionInner` rewritten to PACKED sequential wire.
- `tests/server/logh7-scenario-session.test.mjs` — added a faithful packed-parser oracle + failing-first tests.
- `src/server/logh7-login-session.mjs` — only 2 stale comments corrected; **routing unchanged** (already calls the builder).
- `tests/server/logh7-login-session.test.mjs` — converted 2 strided assertions to the packed oracle.

**Base-management info-records (byte-correct, P0 layout / P3 values; all wired as explicit UI-read handlers):**
- `src/server/logh7-base-record.mjs` (NEW) — `0x031f ResponseInformationBase` (economy/defense), fixed 0x604.
- `src/server/logh7-institution-record.mjs` (NEW) — `0x0321 ResponseInformationInstitution` (facilities), fixed 0x8de4. **Fixed the pre-existing +4/−4 nested-offset bug** in the old `buildInformationInstitutionInner`.
- `src/server/logh7-warehouse-record.mjs` (NEW) — `0x0327 Warehouse` (768B) + `0x0329 Package` (340B).
- `src/server/logh7-login-session.mjs` — 0x031e→0x031f, 0x0320→0x0321 swapped to the byte-correct builders; new 0x0326→0x0327, 0x0328→0x0329 handlers (all UI-read, not world-init inline).
- `src/server/logh7-info-records.mjs` — deprecation comments on the old superseded builders (+the +4/−4 bug note).
- Docs: `docs/logh7-info-records-wire.md` (§2 0x031f, §2a 0x0321), `docs/logh7-proto-info-records.md` (§4c).

**Note:** `0x0321` is a 36KB frame; it goes through the same FUN_004ba2b0 dispatcher case path (not the inline
parser), so it is unaffected by the packed-wire issue — but its live render was not separately verified.

---

## 4. RE map — the lobby receive pipeline (all client VAs, base 0x400000, no ASLR)

```
ws2_32 recv → FUN_006130a0 (frame extractor / decipher iterator; 0x31 = cipher rekey, NOT a fragment marker)
  → blowfish FUN_00614460 (decipher)
  → FUN_006122c0 (recv pump loop): obj = FUN_00612510 (per-conn factory, [conn+0x10] vtbl+8)
       → FUN_00404210 (mpsClientMessage32::input, = obj vtbl[2]); reads u32@+0x50, u16 opcode@+6
          → FUN_00404610 (per-opcode handler lookup via parseSystem.vtbl[0x14]):
               handler FOUND → inline-dispatch handler.vtbl[0], return al=1   ← 0x2006 (FUN_00444900) and 0x2004 (FUN_0043fd60)
               NOT found     → return al=0 → caller body-reads + classifier path
  0x2004 handler FUN_0043fd60 → … → FUN_004ae0d0 (enqueue) → FUN_004b8b00 (classifier op→size) → FUN_004b8850 (enqueue) → FUN_004ba2b0 (dispatcher; case 0x2004 → base+0x35975c, case 0x2006 → base+0x359e3c)
  0x2006 handler FUN_00444900 → parses the PACKED session stream directly into its record buffer (the picker reads it)
```

Picker FSM: `FUN_0051a370` (states 0x13/0x14/0x2d) → `FUN_00593cf0` (slab copy from `DAT_007ccffc+0x359e3c`,
stride 0x5304/idx; phase-1 sends `0x2005 var=idx` via `FUN_004b78a0(1,7,idx)`) → `FUN_00593d90` (picker gate:
count@slab+9>0, row status@+0xe ∈ {1,2}, stride 0x14c) → `FUN_005946d0` (render). With the packed fix, the FSM
advances (multiple 0x2005→0x2006 slab loads) and the rows render.

**Dead hypotheses (do NOT revisit):** server 0x0030 fragmentation; a static recv buffer cap (client max single
msg = 0xf000 = 61KB; 0x2006 fits); factory `FUN_00612510` returning NULL (it returns non-NULL); the "too large"
gate at 0x404254/0x402e7f (object cap is 0xf784 ≫ payload — `recvcap.json` C1/C2 are proven no-ops). The
`lobbyfsm` (0x4b8ae8), `NOPAD`, `brightbtn`, and `recvcap` client patches are all unused/refuted — **do not enable.**

---

## 5. RUN / live-capture workflow (reliable — established this session)

```
# 1) restart with the fixed server (the server process must be restarted to pick up .mjs changes)
python -m tools.logh7_ui_explorer stop
python -m tools.logh7_ui_explorer start --port 47900 \
  --env LOGH_RELAY=1 --env LOGH_AUTHORITATIVE=1 --env LOGH_CONTENT_DB=1 \
  --env LOGH_ACCOUNT_DB=.omo/work/e2e-accounts.json \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_SS_FORMAT=message32 \
  --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_KO_NAMES=1
# 2) the session-list 0x2006 auto-burst fires ~10s after lobby login (NOT a click).
#    Poll trace.jsonl for "0x2006" before navigating.
# 3) navigate (window 1024x768 at screen -2,-2; lobby button centers via brightness scan):
python -m tools.logh7_ui_explorer click 128 258     # 새 캐릭터 작성 (게임시작~200 / 새캐릭~258 / 추첨~312)
#    then double-click a session row (~745,258) to enter faction-select.
```
- **frida caveats:** function-boundary hooks only. Mid-function hooks near a branch CRASH the client (e.g.
  0x612348 overwrote the adjacent `je`). **Small functions hang frida** (FUN_00444900, FUN_00593cf0,
  FUN_00444900-class). Probe: `.omo/work/probe_extractor_live.py` (`--passive` = attach + 18s collect; attach
  IMMEDIATELY after `start` to catch the +10s auto-burst). RE harness: `.omo/work/recvcap_re/lghdis.py` (capstone PE map).
- `ui_explorer start` now selects the canonical playable EXE by default. Use `--patched-exe` only for a probe
  build and `--lobby-unblock-patch` only for the older one-off lobby-unblock experiment.
- `ui_explorer stop` restores and verifies the EXE SHA that was installed when `start` began. After G248 this is
  canonical playable SHA `1f7fad43...`, not vanilla SHA `2848be76...`. Always stop when done.
- GOTCHAS (unchanged): do NOT set `LOGH_DUTY_CARDS=1` / `LOGH_ROSTER_PUSH=1` / `LOGH_STRAT_GRID_EARLY=1` (all stall).

---

## 6. Current live state (where the flow stopped)

새캐릭 → session picker (2 rows) → double-click → **faction-select** (소속할 세력: 은하제국 / 자유행성동맹, with a
다음으로 button). My faction-radio + 다음으로 clicks (~618,317 / ~700,581) **missed** (screen unchanged, no new
trace) — the radio/Next coordinates need refinement (re-detect via a brightness/region scan on the right panel;
the panel is at screen x≈540–1010, y≈40–640). Screens: `.omo/work/cc-01-faction.png`, `cc-02-afternext.png`.

---

## 7. ★ NEXT (resume here)

1. **Finish the character-creation form (Task #3).** From faction-select, nail the radio + 다음으로 coordinates
   (detect them, don't estimate), then walk the multi-step form: faction → face picker → name entry (0x1008,
   already implemented per prior handoffs) → ability/stat allocation → confirm/create. **Drive each step and
   watch `trace.jsonl`** — that is the efficient way to find the next server gap (like the packed-wire one).
   For each new request opcode the client sends, confirm the server handles it (else it dead-ends).
2. **Verify the 오리지널 캐릭터 추첨 (lottery) path** (lobby button ~y=312) — it likely shares the session-select,
   so the packed-wire fix may have unblocked it too; confirm live.
3. **In-world strategic map markers** — a SEPARATE frontier (client-side render pipeline), documented in
   progress-log P5/P6/P8/P14; needs an invasive client binary patch (not a server fix). Lower priority than
   finishing char-creation.
4. **0x0321 (36KB facilities) live render** — wired + byte-correct + tested, but not live-verified; check the
   시설 panel renders once a base is reachable.

---

## 8. Constraints (carry forward)

- Respond to the user in **Korean** (user preference).
- **Document on success** (the user repeatedly asked) — append to `docs/logh7-inworld-progress.md` + update memory.
- Server wire for 0x2006 = **0x5304 payload invariant**; the fix was format-only.
- Do NOT re-enable `lobbyfsm` / `NOPAD` / `brightbtn` / `recvcap` (all refuted). Do NOT touch the playable patch
  stack beyond `menufix`+`dlgfix` (DEFAULT_STACK).
- **No fabricated content** — info-record layouts are P0 (binary-pinned); values are P3 (default 0, only what a
  caller supplies). Unpinned fields stay 0, documented as such.
- Server tests must stay green (**659/659**); add failing-first tests for any new server behavior.
- frida: function-boundary hooks only; FUN_00444900-class small functions hang.

---

## 9. Quick verification (sanity for the next session)

```
node --test tests/server/*.test.mjs     # expect 659 pass, 0 fail
node --check src/server/logh7-scenario-session.mjs
```

---

## 10. Addendum — C001 frontier after post-load duty-card test

Later same-day C001 runs advanced beyond this handoff's original §7 state. Current authoritative status is now in
`docs/logh7-inworld-progress.md` P34/P35 and `.debug-journal.md` G225/G234.

- Strategic markers now render with the normal playable client after the `0x0313` count fix: live probes saw
  `liveAt2c1755Class3=81`, `liveMarkerRange=81`, and `markerTable.valid=81`.
- Do **not** enable `LOGH_STRAT_GRID_EARLY=1`, `LOGH_DUTY_CARDS=1`, or `LOGH_ROSTER_PUSH=1` during normal live
  starts. The safe C001 live env uses post-load grid enter and, only for the card-command experiment,
  `LOGH_DUTY_CARDS_POSTLOAD=1`.
- `LOGH_DUTY_CARDS_POSTLOAD=1` successfully delivered late `0x0305`/`0x0307` card-command tables after
  `0x0f06->0x0f07` without crashing or stalling, but the lower-left command list stayed blank and no `0x0b01` /
  `0x0b07` was emitted.
- Follow-up g235 also tested the `0x0f08` request itself: the server now, under the same opt-in flag, answers
  `0x0f08` with `0x0f09` and then re-sends `0x0305/0x0307`. Live traffic confirmed the extras go out and the client
  stays alive, but the command list still stays blank and no `0x0b01` / `0x0b07` appears.
- The next concrete C001 suspect is no longer simple card-table timing. Investigate a deeper client-side
  command-mode/actionability gate, or a different data family that grants/opens `FUN_00581c80` SelectGrid before
  destination clicks can send `0x0b01`.
- Follow-up g236 patched the normal playable EXE with a SendWarp ring at `FUN_005737d0` and proved the tested
  clicks never reach movement command construction: ring counter stayed `0` before input, after lower-left UI clicks,
  after main-grid clicks, and after minimap/right-click/F-key inputs. The live command-state table had `count=40`,
  all dumped codes `0x0426`, and no `0x0b01` / `0x0b07`, while mode/focus/unit gates were open
  (`gridActive=1`, `fieldMode=2`, `focusCharId=1`, `unitFirstId=1`). Next target: the data/handler that populates
  the `FUN_004be3f0(0x0b01)` table or maps card/action command data into direct action ID `0x3b` / SelectGrid.
  Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/c001-g236-sendwarp-probe/summary.json` and
  `.debug-journal.md` G236.
- Follow-up g237 attached Frida function-boundary hooks to `FUN_00581c80` (`SelectGridFactory`), `FUN_0058fef0`
  (command gate), `FUN_005737d0` (`SendWarpCommand`), and `FUN_005751b0` (`ReceiveResult`). The hook path was live
  (`ReceiveResult` recorded 199 calls), but tested bottom-card/tab/main-grid/minimap/right-click/VK70 inputs produced
  `SelectGridFactory=0`, `commandGate=0`, and `SendWarpCommand=0`. The final trace had 2172 events, including
  `0x0f08`, but no `0x0b01` / `0x0b07`. This moves the C001 blocker upstream of SelectGrid construction: investigate
  strategic object/action handler selection, ownership/actionability, or command-grant mapping before action ID `0x3b`
  rather than SelectGrid cooldown or SendWarp target-state logic. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g237-selectgrid-frida/summary.json` and `.debug-journal.md`
  G237. Cleanup restored the installed EXE (`shaVerified=true`) and left no target listeners, legacy game processes,
  or Frida processes.
- Follow-up g238 moved the frontier one step earlier. Static RE identified `FUN_004f93c0` as the command factory
  dispatcher and `FUN_004f58c0` as its only decompiled caller; SelectGrid requires factory index `0x2b` read from
  `clientBase+0x3416d8 + category*0x46 + 0x20 + selectedIndex*2`. Live memory proved the loaded command table exists
  and contains `0x2b` (16 sampled category/index hits, guard byte `1`), while Frida proved the UI never selects or
  dispatches a command row: `rowScanTotal=22933`, `rowScanOutHits=0`, `factoryDispatchTotal=0`,
  `factoryDispatchSelectGrid=0`, `commandRowBuildTotal=0`, with `selectedIndexGlobal=-1`, `categoryGlobal=-1`,
  `commandObj=null`. Trace included post-load `0x0305`/`0x0307` extras and `0x0f08`, but no `0x0b01`/`0x0b07`.
  Next target: upstream UI selection/ownership/actionability state that populates `DAT_00c9eabc`/`DAT_00c9eac0` and
  command rows for the focused fleet/object. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g238-command-dispatch-frida/summary.json` and
  `.debug-journal.md` G238. Cleanup restored the installed EXE (`shaVerified=true`) and left no target listeners,
  legacy game processes, or Frida processes.
- Follow-up g239 moved the frontier upstream of command category application. Static RE identified
  `FUN_004f6b00` as the category resolver and `FUN_004f5cb0(category)` as the command-menu category/apply path
  that must set menu `D6` before `FUN_004f58c0` can map a row to `FUN_004f93c0`. Live probes also reconfirmed the
  exact safe full-world env needed for this frontier: include `LOGH_WORLD_PLAYER=1`, `LOGH_STRAT_GRID=1`,
  `LOGH_STRAT_FLEET=1`, `LOGH_TACTICS_UNIT=1`, `LOGH_GRID_ENTER=1`, and optionally
  `LOGH_DUTY_CARDS_POSTLOAD=1`; keep `LOGH_STRAT_GRID_EARLY=1`, `LOGH_DUTY_CARDS=1`, and
  `LOGH_ROSTER_PUSH=1` off. In the successful post-HUD Frida run, the command menu was active with
  `rowCountD4=24`, but `categoryD6=-1`; focused bottom-card/tab/left-panel/grid/minimap/VK70 inputs produced
  `rowScan=9828`, `rowHit=0`, `categoryResolve=0`, `categoryApply=0`, `factoryDispatch=0`,
  `selectGridDispatch=0`, and `sendWarp=0`. Trace still had no `0x0b01`/`0x0b07`. Next target:
  the selection list behind `HUD+0x620/+0x624/+0x628` or the ownership/actionability state that should change
  `HUD+0xab0` and trigger `FUN_004f5cb0(category)`. Evidence:
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g239-command-menu-category-frida/summary.json` and
  `.debug-journal.md` G239. Cleanup restored the installed EXE (`shaVerified=true`) and left no target listeners,
  legacy game/server processes, or Frida processes.
- Follow-up g240 corrected the object map and moved the frontier to an empty current-character selection-list
  payload. Direct disassembly shows HUD base `0x00c9e638`, selection-list object `HUD+0x48c = 0x00c9eac4`,
  and command-menu object `HUD+0x130 = 0x00c9e768`. `FUN_004fc4a0` refreshes the selection list via
  `FUN_004f68f0(ECX=HUD+0x48c, payload=*(DAT_007ccffc+8))`; `FUN_004fd100` scans it with `FUN_004f6600` and
  calls `FUN_004f6b00` only after `modeF4==2` and `HUD+0xab0` changes. `FUN_004f6b00` reads
  `selectionList+0x620` count, `+0x624` selected index, and `+0x628` payload pointer. Live G240 used the same
  safe full-world env, including `LOGH_DUTY_CARDS_POSTLOAD=1`, while keeping `LOGH_DUTY_CARDS=1`,
  `LOGH_ROSTER_PUSH=1`, and `LOGH_STRAT_GRID_EARLY=1` off. Post-HUD Frida recorded
  `listScan=21212`, `modeSet=2`, and successful `modeF4` `1->2->1` / `listPage187` `1->2->1` toggles, but
  the list stayed empty: `listCount188=0`, `listSelected189=-1`, `listPayload18a=0xf34502c`,
  `payloadCount270=0`, `wouldResolveCategory=null`, `categoryResolve=0`. Trace included icon-triggered
  `0x0f04/0x0f05`, `0x0f06/0x0f07`, `0x0f08/0x0f09`, and repeated `0x0305/0x0307`, but no
  `0x0b01`/`0x0b07`. Next target: the server/client data family that should populate
  `*(DAT_007ccffc+8)+0x270` and the selection-list entries consumed by `FUN_004f68f0` / `FUN_004f6b00`.
  Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/c001-g240-static-selection-list/summary.json` and
  `.debug-journal.md` G240. Cleanup restored the installed EXE (`shaVerified=true`) and left no target listeners,
  legacy game/server processes, or Frida processes.

Quick verification now:

```bash
node --check src/server/logh7-login-session.mjs
node --test tests/server/logh7-login-session.test.mjs
npm run test:server   # after g235 0x0f08 refresh test: 662 pass, 0 fail
```

## 11. Addendum - G241 closes the C001 minimum loop

Later same-day G241 supersedes the G240 "empty current-character selection-list payload" blocker for the written
C001 criterion.

- Server-side fix: keep `0x0323` as the helper-swapped 730-byte information-character response, but send `0x0356`
  as its own 728-byte native/LE `NotifyInformationCharacter` payload. The live payload has `flag@0`,
  `characterId@0x04`, `seatCount@0x250`, and seat entries at `0x254`.
- Final live run: `.omo/ui-explorer/session-c001-g241-notify356-le-live`, evidence under
  `.omo/ulw-loop/full-revival-20260615/evidence/c001-g241-seat-entry-live/`. Safe flags remained:
  `LOGH_WORLD_PLAYER=1`, `LOGH_STRAT_GRID=1`, `LOGH_STRAT_FLEET=1`, `LOGH_TACTICS_UNIT=1`,
  `LOGH_GRID_ENTER=1`, `LOGH_DUTY_CARDS_POSTLOAD=1`; forbidden `LOGH_DUTY_CARDS=1`,
  `LOGH_ROSTER_PUSH=1`, and `LOGH_STRAT_GRID_EARLY=1` stayed off.
- Frida proof: `0x0356` was dispatched/applied (`dispatcher-0356-enter=12`, `strategy-tray-update-enter=12`), with
  `notifyCharId04=1`, `notifySeatCount250=1`, `notifySeatChar254=3142`, `notifySeatRole258=7471209`. The client
  live slot changed to `liveSeatCount270=1`; later list refreshes reached `payloadCount270=1`, `listCount188` max
  `16`, final `listCount188=1` / `payloadCount270=1`.
- C001 status: pass for the written minimum "visible/clickable world interaction" loop. Right-side HUD/mail
  interactions opened the in-world mail UI and emitted decoded `0x0f08` requests with authoritative `0x0f09`
  responses (`request0f08=5`, `response0f09=5`). Cleanup is verified in `stop-g241-notify356-le.json`
  (`shaVerified=true`) and `cleanup-check-g241.json` (target ports/processes empty).
- Remaining follow-up: SelectGrid/movement remains unproven and should stay in the manual-command backlog:
  final trace still has no `0x0b01`/`0x0b07`, and Frida still has `categoryResolve=0` / `menuCategoryD6=-1`.
  Do not reopen C001 solely for movement unless the criterion is deliberately tightened.

Updated verification:

```bash
node --check src/server/logh7-personnel.mjs
node --check src/server/logh7-login-session.mjs
npm run test:server   # after g241 notify split: 664 pass, 0 fail
```

## 12. Addendum - G242 correction: C001 is blocked again

User review after G241 rejected the "minimum loop" standard as too weak. Treat §11 as historical evidence, not as
the current done state.

- `0x0356` native/LE notify remains useful evidence: it filled the current-character selection payload/list.
- The `0x0f08->0x0f09` mail/HUD loop is not a real strategic gameplay loop. It does not prove SelectGrid,
  movement, or command activation.
- G241 still has no `0x0b01`/`0x0b07`, with `categoryResolve=0`, `menuCategoryD6=-1`, and `listSelected189=-1`.
- Core world data is also incomplete: the repo has 80 systems, 281 planets, and 6 fortresses from manual/recovered
  content, but not evidence-backed original server positions for star systems, planets, or buildings/bases.
  Current adapters carry names/orbits/fortress membership, while fleet/skirmish positions remain provisional seeds.
- ULW state was corrected through the CLI: full-revival `G001/C001` is now `blocked`, and the goal checkpoint is
  `blocked`. Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/g242-world-data-gap.json`,
  `.omo/ulw-loop/full-revival-20260615/goals.json`, `.omo/ulw-loop/full-revival-20260615/ledger.jsonl`.

Next C001 pass must require both:
- a fresh real-client strategic command loop (`0x0b01->0x0b07` or a proven equivalent command/response), not only
  mail/status traffic;
- a provenance dump showing how systems/planets/building positions are recovered and wired into server responses.

## 13. Addendum - G244 installed-game mining and character-name table status

The installed-game mining pass was rerun from the actual install tree, not from `content/`.

- Install root: `E:\logh7-revival\.omo\work\logh7-installed`, from
  `HKCU:\SOFTWARE\BOTHTEC\銀河英雄伝説VII\1.0\Install`.
- Fresh evidence root:
  `.omo/ulw-loop/full-revival-20260615/evidence/g244-installed-resource-mining/`.
- Installed tree inventory, excluding assistant `.omc`: 2230 files. Major families: 42 `data/MsgDat` files,
  418 model containers (`406` `.mdx`, `12` `.mds`), 7 face TCF atlases, 1355 `tcf.hed` slots, 416 decodable
  portrait slots.
- Active installed `data/MsgDat/*.dat` is a localized/patch overlay, not base Japanese data. It decodes as
  CP932/CP949 HFWR plus one GFWR file: 22 files, 9582 records, 4847 non-empty.
- Base Japanese MsgDat is in `*.dat.jpbak`: 20 HFWR files, 9493 records, 4833 non-empty, all CP932 after the
  parser scoring fix.
- `content/client/msgdat.json` was compared against the fresh Japanese backup extraction: 20 matched files,
  9493 matched records, `diff_count=0`. The only content files with no `.jpbak` counterpart are `g7sw.dat` and
  `messages_tac_0.dat`.
- Character naming table status: not found. A full installed-tree scan for 195 known Japanese/romaji names across
  non-image/non-audio files under CP932, CP949, and UTF-16LE found only sparse contextual hits:
  `constmsg.dat.jpbak` has `グエン`, `ブラウンシュヴァイク`, and `ローエングラム` inside medal/ship descriptions;
  `messages_3.dat.jpbak` has `グエン` in a quote; `G7MTClient.exe` / `_probe*.exe` have one sample order string
  `帝国軍巡査隊（ラインハルト元帥）`. This is not a character-name/roster table.
- Server-default correction: do not use the active CP949 installed MsgDat or IV EX Korean names as base VII data.
  The transient `content/client/msgdat-installed.json` and `content/client/msgdat-jpbak.json` were removed.
  `buildInferredCatalogs()` now reads default catalog ids only from `content/client/msgdat.json`; VII default
  character display now prefers `name` / `name_ja`, with romaji only as fallback; IV EX `name_kr` / `iv_id`
  no longer enrich the VII `characters` DB table.

Verification after this correction:

```bash
python -m unittest tools.tests.test_logh7_msgdat
node --check src/server/logh7-inferred-content.mjs
node --check src/server/logh7-content-adapter.mjs
node --check src/server/logh7-content-pack.mjs
node --check src/server/logh7-content-db.mjs
node --test tests/server/logh7-content-adapter.test.mjs tests/server/logh7-content-pack.test.mjs tests/server/logh7-content-db.test.mjs tests/server/logh7-login-session.test.mjs
```

Result: Python MsgDat tests passed; edited server modules syntax-check; focused node tests passed
(`70` tests, `0` failures).

Current honest state: installed resources provide base strings, models, face atlases, portraits, and schema-like
catalogs. They still do not provide a full character naming table or original server-authoritative strategic
coordinates, building/base positions, room occupancy, or action-context tables.

## 14. Addendum - G245 render/interaction server contract

Use `docs/logh7-render-interaction-contract.md` as the current inventory for what the real client can render, what
is only weakly interactive, and what data the server must still provide.

- Render/data-proven surfaces include lobby/session/character creation, in-world HUD admission, `0x0313/0x0315`
  strategic marker slots, static base/system `0x031d`, current-character `0x0356`, and several byte-pinned info
  record builders (`0x031f`, `0x0321`, `0x0327`, `0x0329`). Do not overclaim marker visual correctness:
  `byte0` is still a placeholder label/link id and `byte2` is only a faction tint, so names and star/fortress types
  are not properly rendered yet.
- Do not count `0x0f08->0x0f09` mail/HUD traffic as a strategic gameplay loop. The next movement pass still needs a
  real-client `0x0b01->0x0b07` loop or a proven equivalent authoritative command/response.
- Office/room status remains a server-data gap. `0x0321` can carry facility/spot records, but original office
  positions, occupants, and action contexts are not recovered.
- Planet status remains a server-data gap. The repo has system/planet names and orbit order, but planet names/count
  and economy are not wired into a stable live selected-system/planet render path.
- Current player location is now represented in server downlink, but it is authored seed data, not recovered original
  server state. `0x0323` carries `spot@0x1c` and `spot_owner@0x20`; `0x0325` full unit records carry
  `cell@+0x0c` from `LOGH_FLEET_ROW*100+LOGH_FLEET_COL` and `mapSection@+0x48` from the spot id. Defaults are
  `spot=1`, `owner=1`, `fleet cell=2550`.
- Rank/position split: rank is a character field (`0x0323` parentage `rank@0xd6` and create `0x1008 rank`);
  duty/post is the seat array (`seatCount@0x250`, `{character, role}` entries) plus personnel commands such as
  `0x0707 CardAppointment`. Role enum names and original post occupancy remain unrecovered.
- Empire fief/nobility system is confirmed by installed/base strings and manual command data: `叙爵`, `封土授与`,
  `封土直轄`, `狩猟`, noble title labels, `封土`, and local/central tax strings. The server still lacks an
  authoritative fief ownership table and live command/apply loop.
- Character naming remains unresolved from installed resources. Friend-provided portrait labels should be added as
  human-labeled provenance and then wired into `0x0323`/`0x034f`, not treated as recovered base VII data.

## 15. Addendum - G247 client QA, font track, and record-map inventory

Latest correction after fresh client QA:

- Current player location is still tracked by the server, but the live-critical `0x0f02` spawn now stays minimal by
  default. Full `0x0325` unit location slots require `LOGH_FULL_UNIT_LOCATION=1`; early `0x0323 spot@0x1c` /
  `spot_owner@0x20` requires `LOGH_EARLY_WORLD_LOCATION=1`. Post-load/direct-record experiments can still carry
  authored location fields. Treat P46's default-location wording as superseded by this addendum.
- Fresh QA with message32 framing reached lobby cards and world-init bundle sends, but still did not reach `0x0f06`,
  `0x0356`, `0x0b01`, or `0x0b07`. The key traces are under `.omo/ui-explorer/session-g247-*`.
- Font/text QA is a separate track from protocol QA. The stock/probe EXE path can show Korean text as `?`. Korean
  glyph QA must use `.omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe` plus CP949 resources. A short G247 check
  confirmed the Korean EXE renders lobby menu labels in Korean.
- New record-map inventory:
  - Tool: `tools/logh7_record_map.mjs`
  - Test: `tests/server/logh7-record-map.test.mjs`
  - Human summary: `docs/logh7-record-map-inventory.md`
  - JSON output: `.omo/ulw-loop/full-revival-20260615/evidence/g247-record-map/record-map.json`
- Latest inventory totals: 203 catalog records, 221 total after runtime companion/trace-only request codes. Blocked
  live gaps: `0x0313`, `0x0315`, `0x0321`, `0x0b01`, `0x0b07`.

## 16. Addendum - G248 executable unification and fresh user-flow QA

- Installed `.omo/work/logh7-installed/exe/G7MTClient.exe` is now unified to the canonical Korean playable EXE:
  SHA `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`. The Korean base remains
  `466725e2220726a4b5274b99e7b85fbdbef222cb424386638405d2cc7e23aa66`.
- `tools.logh7_ui_explorer` now defaults to canonical playable mode without requiring `--patched-exe`; stop
  verifies the session-start SHA instead of hardcoding vanilla `2848be76...`.
- Fresh existing-character QA:
  - Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/g248-canonical-playable/summary.json`
  - Korean lobby labels render and `게임 시작` opens character select.
  - First character reaches strategic HUD with `0x0f02` and `0x0f06` observed.
  - Server post-load pushes are present in the trace: `0x0b09`, `0x0325`, `0x0323`, `0x0b0a`, `0x0356`,
    `0x1200`, `0x1202`, `0x1201`, plus duty cards `0x0305/0x0307`.
  - Still missing as client-origin interaction: `0x0f08`, `0x0b01`, `0x0b07`.
  - Visible data gaps remain: character card name/stat labels are partly wrong, and HUD still shows
    `NO DATA`/withdrawn-like text in some panels. Treat these as data/downlink mapping gaps, not executable/font
    selection gaps.
- Fresh new-character QA:
  - `새 캐릭터 작성` opens session select; session row opens faction select; `다음으로` advances to gender, origin,
    and finally name-input screen.
  - Session-select labels still show Japanese/misaligned text in places.
- Cleanup: both G248 UI explorer sessions stopped with `shaVerified=true`, restored kind `canonical-playable`, and
  ports `4173`, `4787`, `47900`, `47901` closed.

Previous G247 verification commands:

```bash
node --test tests/server/logh7-login-session.test.mjs --test-name-pattern "early 0x0f02|early 0x0323|full current location"
node --test tests/server/logh7-record-map.test.mjs
node tools/logh7_record_map.mjs --out .omo/ulw-loop/full-revival-20260615/evidence/g247-record-map/record-map.json
```

## 17. Addendum - G251 player-facing launcher EXE and separated local runtime

The installed tree now has a normal player-facing executable path. Use:

```text
E:\logh7-revival\.omo\work\logh7-installed\LOGH7Launcher.exe
```

This is no longer a Python QA-tool entrypoint. `LOGH7Launcher.exe` is a compiled Windows launcher
that validates Node.js and the installed files, writes the per-user BOTHTEC install registry key,
starts the separated local server runtime, and then launches the canonical Korean playable client:

- client: `exe/G7MTClient.exe`
- server: `logh7-runtime/src/server/logh7-server.mjs`
- content: `logh7-runtime/content`
- state/logs/traces: `logh7-runtime/{state,logs,traces}`

The local server command is `serve-auth` on `127.0.0.1:47900` with the safe full-world environment:
`LOGH_LOBBY_OK_FORMAT=message32`, `LOGH_SS_FORMAT=message32`, `LOGH_WORLD_PLAYER=1`,
`LOGH_STRAT_GRID=1`, `LOGH_STRAT_FLEET=1`, `LOGH_TACTICS_UNIT=1`, `LOGH_GRID_ENTER=1`,
`LOGH_DUTY_CARDS_POSTLOAD=1`, `LOGH_CONTENT_DB=1`, and `LOGH_KO_NAMES=1`.

Build/stage command:

```bash
python -m tools.logh7_build_player_launcher --installed-root .omo/work/logh7-installed
```

Verification:

- `LOGH7Launcher.exe --check` passed.
- `LOGH7Launcher.exe --server-smoke` passed; server log showed the authoritative login server
  listening on `127.0.0.1:47900`.
- `LOGH7Launcher.exe --client-smoke` passed; launcher log showed `G7MTClient.exe` started and
  survived 5 seconds.
- Registry check confirmed `HKCU\Software\BOTHTEC\銀河英雄伝説VII\1.0\Install` points at
  `E:\logh7-revival\.omo\work\logh7-installed\`.
- Post-smoke cleanup had port `47900` closed and no `G7MTClient.exe` process running.
- Evidence: `.omo/ulw-loop/full-revival-20260615/evidence/g251-player-launcher-runtime/summary.json`

Boundary: G251 closes the executable/startup/runtime-packaging gap only. It does not close the
real strategic gameplay frontier: movement/command activation still needs a fresh real-client
`0x0b01->0x0b07` loop or a proven equivalent, and original server-authoritative system/planet,
building/base, office/room, and action-context data remain unrecovered.

## 18. Addendum - G253 Korean text and lower-left HUD discriminator

User requirement added on 2026-06-16: all visible text must be Korean-localized and render normally. Do not report the
game as text-complete yet.

What is now fixed/protected:

- The canonical playable EXE remains the Korean-capable runtime. G272/G273/G274 cleanup receipts all restored client SHA
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c` with `shaVerified=true`.
- `0x2004` lobby character-card text is now in the endian/order the client consumes. Evidence:
  `.omo/ui-explorer/session-g271-lobby-be-text-hud/shots/003-game-start.png` shows readable `Friedrich IV`.
- `0x0323` is pinned as mixed layout: numeric fields follow the world/helper endian, but parentage/name strings are LE.
- `0x0f06` now returns a structured active `0x0f07` messenger-status row instead of generic world-data bytes.
- `0x0356 NotifyInformationCharacter` now writes its native name field at `wchar[12] @0x2e`. The focused test first
  failed with `0 !== 82`, then passed after filling the slot.

What was refuted:

- Rich post-load pushes did not fix the lower-left in-world HUD. G272 still showed path-like text after `0x0f06->0x0f07`
  and pushes `0x0b09`, `0x0325`, `0x0323`, `0x0b0a`, `0x0356`, `0x1200`, `0x1202`, `0x1201`.
- `LOGH_ACTION_LIST_SEATS=1` did not fix it. G273 still showed the same lower-left path/memory text.
- Filling the `0x0356` native name field did not fix it. G274 still showed the same symptom in
  `.omo/ui-explorer/session-g274-native-tray-name-hud/shots/003-select-first-card.png`.

Verification commands that passed:

```bash
node --test --test-name-pattern "buildNotifyInformationCharacterInner: 728B|native LE seat entries|post-load 0x0f06|character simple-info" tests/server/logh7-personnel.test.mjs tests/server/logh7-login-session.test.mjs
node --test tests/server/logh7-auth-server.test.mjs tests/server/logh7-login-protocol.test.mjs tests/server/logh7-login-session.test.mjs tests/server/logh7-content-adapter.test.mjs tests/server/logh7-content-pack.test.mjs tests/server/logh7-simple-info.test.mjs tests/server/logh7-personnel.test.mjs
```

The broad server subset ended at `187` tests, `0` failures.

Next RE target:

- Trace the lower-left card/HUD renderer and its exact string source after card selection. The remaining symptom is not a
  generic font or EXE problem; it is likely a missing/wrong current-card detail buffer, UI pointer/table, or
  server-origin detail record not yet identified.
- Korean naming is still incomplete. The installed-game mining did not reveal a dense VII character naming table.
  Friend-labeled portrait-name data can be ingested as human-labeled provenance and then wired into `0x0323`/`0x034f`,
  but it must not be mislabeled as recovered installed/server data.

## 19. Addendum - G254 GDI text probe result

Added a focused Frida probe:

```bash
python -m tools.logh7_frida_gdi_text --scenario first-card --seconds 4 --sample-limit 1600 \
  --out .omo/ulw-loop/full-revival-20260615/evidence/g254-gdi-text-hud/g254-gdi-text-first-card-v6.json \
  --trace-out .omo/ulw-loop/full-revival-20260615/evidence/g254-gdi-text-hud/g254-server-trace-v6.jsonl \
  --shot-out .omo/ulw-loop/full-revival-20260615/evidence/g254-gdi-text-hud/g254-first-card-v6.png
```

What it does:

- Starts `serve-auth`, spawns the installed canonical playable client under Frida, logs in, waits for the lobby menu to
  stabilize, clicks `게임 시작`, selects the top card at `650,315`, then captures the HUD.
- Hooks `ExtTextOutA`, `TextOutA`, `DrawTextA`, and `GetTextExtentPoint32A`.
- Emits text bytes plus a short G7MTClient VA backtrace for each sampled GDI ANSI text call.

Live result:

- `g254-first-card-v6.png` shows the same lower-left HUD garbage after selecting the first card.
- `g254-server-trace-v6.jsonl` reached `0x2009 -> 0x200a`, conn3, world-init, `0x0f06 -> 0x0f07`,
  `0x0b09 -> 0x0b0a`, `0x0356`, and `0x1200/0x1202/0x1201`.
- `g254-gdi-text-first-card-v6.json` captured 212 GDI events (`105` `GetTextExtentPoint32A` and `105`
  `ExtTextOutA`) but no long ASCII samples. The only broad path-like match was the single slash byte `/`.

Conclusion:

- The visible lower-left path/environment-like garbage is not being emitted through the hooked GDI ANSI text sinks.
- Stop treating this as a generic codepage/font/GDI issue. Next hook target should be the lower-level renderer path:
  DirectDraw/Direct3D surface text blits, texture/font atlas rendering, or internal lower-left HUD string-buffer writers.

Automation note:

- A too-early `게임 시작` click leaves a blank lobby panel even after `0x2003/0x2004` arrives. The new probe waits for
  the menu to stabilize before clicking. The control session `.omo/ui-explorer/session-g254-gdi-control` proved that
  a second click after stabilization renders the card list and that `650,315` enters the world.

Verification:

```bash
python -m unittest tools.tests.test_logh7_frida_gdi_text
python -m py_compile tools/logh7_frida_gdi_text.py tools/tests/test_logh7_frida_gdi_text.py
ruff check --preview tools/logh7_frida_gdi_text.py tools/tests/test_logh7_frida_gdi_text.py
```

Cleanup:

- Receipt: `.omo/ulw-loop/full-revival-20260615/evidence/g254-gdi-text-hud/cleanup-g254-v6.txt`
- No game processes remained.
- No `4173`, `4787`, `47900`, or `47901` LISTENING sockets remained.
- Installed client SHA remained canonical playable:
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`.

## 20. Addendum - G006/P51 launcher-rich defaults and fresh full-playability QA

User requirement added on 2026-06-16: normal play must start from the EXE, not from a Python-only test path, and the
EXE path must carry the same Korean/rich world data that live QA uses.

Change made:

- `tools/launcher/LOGH7Launcher.cs` now starts `serve-auth` with these additional default flags:
  `LOGH_LOBBY_RICH_CHARACTERS=1`, `LOGH_LOBBY_EARLY_OK=1`, `LOGH_STRAT_GALAXY=1`, and
  `LOGH_POSTLOAD_RICH_CHARACTER=1`.
- This fixes runtime drift where Frida/Python QA could receive richer lobby/world data than a player starting
  `.omo/work/logh7-installed/LOGH7Launcher.exe`.
- `tools/tests/test_logh7_installed_tree.py` now guards those flags in the staged launcher source.

Verification:

```bash
python -m unittest test_logh7_installed_tree.Logh7InstalledTreeTests.test_build_installed_copies_detected_install_root_and_iso_launcher
python -m py_compile tools/tests/test_logh7_installed_tree.py
ruff check --preview tools/tests/test_logh7_installed_tree.py
python -m tools.logh7_build_player_launcher --installed-root .omo/work/logh7-installed
.omo/work/logh7-installed/LOGH7Launcher.exe --check
.omo/work/logh7-installed/LOGH7Launcher.exe --server-smoke
.omo/work/logh7-installed/LOGH7Launcher.exe --client-smoke
```

All returned exit code 0. The launcher log showed `G7MTClient.exe` started and survived the smoke window; after cleanup
no `LOGH7Launcher.exe`/`G7MTClient.exe` process remained and ports `4173`, `4787`, `47900`, and `47901` were closed.
The captured smoke transcript is
`.omo/ulw-loop/full-revival-20260616/evidence/full-playability/launcher-smoke-transcript.json`. Ruff LSP still needs
`ruff server --preview` configuration, but CLI `ruff check --preview` passed.

Actual EXE live-run evidence:

- Launcher: `.omo/work/logh7-installed/LOGH7Launcher.exe`
- Summary: `.omo/ulw-loop/full-revival-20260616/evidence/full-playability/launcher-live/summary.json`
- Screenshots: `.omo/ulw-loop/full-revival-20260616/evidence/full-playability/launcher-live/shots/`
- Trace: `.omo/work/logh7-installed/logh7-runtime/traces/live-trace.jsonl`
- The no-argument launcher path started `G7MTClient.exe`, accepted automated login, reached lobby, clicked
  `게임 시작`, selected the first card, and entered the world.
- The launcher-created trace observed outbound rich downlinks `0x0356`, `0x1200`, `0x1202`, `0x1201`, `0x0305`,
  and `0x0307`, plus world-entry records `0x0f02`, `0x0f06->0x0f07`, `0x0b09`, and `0x0b0a`.
- Cleanup after evidence collection was forced by terminating the client/launcher; the important invariant is that
  the evidence trace exists and no stale process/socket is allowed to remain after the cleanup check. Do not treat the
  live-run `client exited with code -1` log tail as a clean session shutdown.

Fresh live QA:

- Session: `.omo/ui-explorer/session-g006-launcher-rich-20260616`
- Summary: `.omo/ulw-loop/full-revival-20260616/evidence/full-playability/g006-live-summary.json`
- Record map: `.omo/ulw-loop/full-revival-20260616/evidence/full-playability/g006-live-record-map.json`
- The run reached Korean lobby, character select, first-card world entry, `0x0f02`, `0x0f06->0x0f07`,
  `0x0b09/0x0b0a`, `0x0325`, `0x0323`, `0x0356`, `0x1200/0x1202/0x1201`, `0x0305/0x0307`, and in-world
  info interactions `0x0f08->0x0f09` plus `0x0f04->0x0f05`.
- Screenshots confirm Korean lobby buttons, first-card name `Friedrich IV`, world view, mail/info menus, and a
  character-info popup.

Still blocked:

- Strategic movement/command activation is not solved. The same run observed `0` inbound `0x0b01` and `0` outbound
  `0x0b07` after map left-click, map right-click, and `F1`.
- The lower-left in-world HUD still renders path/memory-like garbage.
- The character-info popup/list row name is still garbled. Do not fake this by synthesizing display names into
  `0x1202`; P9 evidence says the correct route is through full character-info routing/raw bytes, not guessed
  simple-info name fields.

Next concrete RE target:

- Trace the action/select-grid activation path that should apply a command category and emit `0x0b01`, then confirm
  the server `0x0b07` broadcaster with the real client.
- In parallel, trace the non-GDI lower-left HUD/name renderer: DirectDraw/Direct3D surface text blits, texture/font
  atlas text, or internal HUD string-buffer writers.

## 21. Addendum - 2026-06-16 `0x1008` create wire fix and DB/backend/client contract

Root cause fixed:

- `0x1008 OK` is a 128-byte packed parser stream consumed by `FUN_004066f0`, not a raw fixed-memory record and not
  an id/status tuple.
- Sending the old fixed-record shape corrupted the create-complete card and produced bad labels such as
  `통일`/`황제`.
- The server now emits the packed stream: LE `request_category`, byte status/power/blood/sex, BE pstr16 names,
  BE u32 face/tail fields, ability bytes, rank suffix, flagship fields, and the trailing check byte.

Live QA:

- Empire session: `.omo/ui-explorer/session-g008-create-wirefix-empire-20260616`
  - Final card screenshot: `shots/029-create-final-card.png`
  - Confirmed `제국`, `평민`, `Flow Lee소위`, flagship `Echo`.
  - Registered character reached the world: `shots/034-after-world-load-wait.png`.
  - Trace observed `0x0f02`, `0x0f06->0x0f07`, `0x0b09`, `0x0325`, `0x0323`, `0x0b0a`, `0x0356`,
    `0x1200/0x1202/0x1201`, `0x0305`, and `0x0307`.
- Alliance session: `.omo/ui-explorer/session-g010-create-wirefix-alliance-20260616`
  - Origin screenshot: `shots/010-alliance-origin-default.png`
  - Final card screenshot: `shots/023-alliance-final-card.png`
  - Confirmed C->S `0x1008` begins with `power=3`, `blood=3`; final card rendered `동맹`, `시민`,
    `Wenli Yang소위`, flagship `Hyperion`.

New contract doc:

- `docs/logh7-db-backend-client-contract.md` now fixes the DB/backend/client boundary.
- DB rows are content seeds only. Backend runtime state owns current location, selected character, office/fief/battle
  state, and session-ending rules.
- Client downlinks must always go through parser-specific builders (`0x1008`, `0x2004`, `0x0323`, `0x0325`,
  `0x0313/0x0315`, `0x0321`, tactical notifies). Raw DB/JSON is forbidden at the client boundary.
- G251 follow-up fixed the strategic marker label-id bridge: `0x0313.byte0` now uses constmsg group-0x18 sub ids
  merged from the original JP catalog and recovered KO overlay layout (`イゼルローン=14`, `ルンビーニ=86`), and
  `npm run test:server` passes 680/680. This does not solve star/fortress type sprites or click->`0x0b01`.

Still blocked:

- Strategic movement is still not solved: no live inbound `0x0b01`, so `0x0b07` cannot be validated end-to-end.
- Lower-left in-world HUD still can render path/memory-like garbage. Do not fake this through guessed `0x1202`
  display-name fields; trace the actual HUD string source or supply proven full character bytes.

## 22. Addendum - 2026-06-16 strategic marker preload fix

Root cause fixed:

- The client asks `0x0314` (cell grid) before `0x0312` (object table) during the world-init walk. A scene snapshot in
  that gap promotes real cells but stale object records, so markers fail even though the server did send the grid.
- When `LOGH_STRAT_GRID_EARLY=1` and `LOGH_STRAT_GALAXY=1`, the server now sends an extra `0x0313` object table after
  `0x0304->0x0305`, before the first `0x0314->0x0315`. `LOGH_STRAT_GRID_OBJECT_PRELOAD=0` is the explicit A/B off
  switch.

Live QA:

- Session: `.omo/ui-explorer/session-g006-object-preload-47900-20260617`
- Canonical playable SHA: `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`
- Trace reached `0x0304->0x0305`, extra `0x0313`, `0x0314->0x0315`, `0x0312->0x0313`, full `0x0f02`, and
  post-load rich pushes through `0x0f06->0x0f07`, `0x0b09/0x0325/0x0323/0x0b0a`, `0x0356`, `0x1200/0x1202/0x1201`,
  and `0x0305/0x0307`.
- Frida marker gate:
  `.omo/ui-explorer/session-g006-object-preload-47900-20260617/marker-gate-preload.jsonl` recorded
  `stageMarkerRange=81`, `liveMarkerRange=81`, `stageClass3=81`, `liveClass3=81`, and `markerTable.valid=81`.

Still blocked:

- Grid clicks still emitted no inbound `0x0b01` and no outbound `0x0b07`. Movement is now blocked upstream in
  command/actionability activation, not in marker rendering.
