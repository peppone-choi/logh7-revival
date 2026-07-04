# LOGH VII C002 Admission Discriminator - 2026-06-28

> 2026-06-29 playable-route update: standard live/playable profile now sets `LOGH_ACTION_LIST_CATEGORY=0` and `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` so the delivered action-list seat points at the temporary category-0 command table. This is a P3 shim to unblock interaction and must be replaced by recovered canon card/factory-id mapping. Static object masters are also exposed in the standard profile (`LOGH_STATIC_SHIPS/TROOPS/FIGHTERS/ARMS/POWER_DISTRIBUTION=1`); troop/ship data has manual provenance, fighter/arms/power fallback values remain playable seeds unless `manual/static-info-masters.json` is recovered.

## Scope

This note records the canonical-playable live check that separated the remaining C002 blocker from the already-proven `0x0356` and slot `0x67` paths.

- Session: `RE/.omo/ui-explorer/c002-admission-discriminator-98ca-20260628`
- Game EXE: installed `RE/.omo/work/logh7-installed/exe/G7MTClient.exe`
- Source playable: `RE/.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`
- Canonical SHA256: `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`
- Preseed: off. `LOGH_PRESEED_PLAYER_CHAR` was not used.

## Live Path

The session used the official installed game EXE path and natural character creation.

- Env included `LOGH_ACCEPT_ANY_GIN7=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, `LOGH_GRID_ENTER=1`.
- Natural create-character generated character `2`.
- World entry reached `0x0204`, `0x0325`, `0x0b0a`, `0x0356`.
- `0x0356` was `compact-0356`, `recordId04Le=2`, `recordGridUnit24Le=1`, `recordGridUnit28Le=1`.

## Evidence Files

- Trace: `RE/.omo/ui-explorer/c002-admission-discriminator-98ca-20260628/trace.jsonl`
- SelectGrid snapshots: `RE/.omo/ui-explorer/c002-admission-discriminator-98ca-20260628/selectgrid-snapshot.jsonl`
- SelectGrid state watcher: `RE/.omo/ui-explorer/c002-admission-discriminator-98ca-20260628/selectgrid-state.jsonl`
- HUD admission watcher: `RE/.omo/ui-explorer/c002-admission-discriminator-98ca-20260628/hud-admission.jsonl`
- Screenshots: `RE/.omo/ui-explorer/c002-admission-discriminator-98ca-20260628/shots/`

## Findings

The trace contains two `0x0f08 -> 0x0f09` pairs and no `0x0b01`.

Every before/after click snapshot kept the same inactive selection state:

- `fieldMode126711=2`
- `focusChar3584a0=2`
- `unitCount41a364=1`
- `command.rowCountD4=24`
- `command.selectedD5=-1`
- `command.categoryD6=-1`
- `selection.listCount188=0`
- `selection.payloadCount270=0`
- `selection.payloadCount270U8=0`
- `selection.rows=[]`

`hud-admission.jsonl` recorded:

- `hudGate-enter/leave-004fd100`: 256 each
- `selectionHitTest-enter/leave-004f6600`: 256 each
- `commandRowHit-enter/leave-004f58c0`: 256 each
- `inputHitTest-leave-005015f0`: 22451
- No runtime `selectionImport`, `commandBuild`, `factoryDispatch`, or `selectGridFactory` calls.

`selectgrid-state.jsonl` recorded two `sendCorrelator-004b78a0` entries:

- Both had `arg2=48`, hexadecimal `0x30`.
- Correction from the later raw selector sweep: movement is selector `0x003b`
  and case index `0x003a`, not selector `0x003a`.
- Therefore the observed clicks reached an info-style send path, not the C002 grid-move send path.

## Tooling Update

`RE/tools/logh7_selectgrid_state_watch.py` now emits `dispatchCaseInfo(arg2)` on send-path entries.

- `0x30`: labelled `case30-observed-info-path`; live C002 clicks correlated this with `0x0f08/0x0f09`, not `0x0b01`.
- `0x3a`: now labelled `case3a-non-c002-selector`, request `0x0412`.
- `0x3b`: now labelled `case3b-grid-move`, request `0x0b01`, response `0x0b07`.

Verification:

- `cd RE; python -m py_compile tools/logh7_selectgrid_state_watch.py`
- `cd RE; python -m unittest tools.tests.test_logh7_selectgrid_state_watch` = 2/2 PASS

## Current Conclusion

C002 is blocked after the server has already supplied rich character data and after the HUD/unit-list slot exists. The missing transition is the client-side admission/import from populated unit-list/HUD state into active selection and the SelectGrid command factory.

Next RE targets:

- `FUN_004f68f0` selection import
- `FUN_004f5cb0` command build
- `FUN_004f93c0` factory dispatch
- `FUN_00581c80` SelectGrid factory
- The caller/condition that should connect `FUN_004f6600` and `FUN_004f58c0` to those functions

## Session Closure

The live session was stopped with `ui_explorer stop`.

- `shaVerified:true`
- Restored SHA: `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`
- No residual `G7MTClient` or `node` process was present.
- No `47900` listener was present.

## Follow-up: Postload Action-list Seats Run

Session `.omo/ui-explorer/c002-postload-seats-98ca-20260628` tested the missing lever from the first discriminator run:

- Added `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`.
- Kept `LOGH_POSTLOAD_RICH_CHARACTER=1`.
- Kept preseed off and used natural create-character flow.
- Created character `2` (`TEST S028 / FLAG`).
- Used installed `RE/.omo/work/logh7-installed/exe/G7MTClient.exe`, canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.

This run proves the `PLAYER_INFO+0x270` hypothesis:

- `0x0356 compact-0356` carried `recordSeatCount250=1`, `recordSeatChar254=2`, `recordSeatRole258=0`.
- SelectGrid snapshot before clicks showed `listCount188=1`.
- The same snapshot showed `payloadCount270=1` and `currentPayloadCount270=1`.
- One selection row existed under slot `0x67`.

RE correction:

- `FUN_004f68f0` stores the incoming PLAYER_INFO pointer at selection-list `+0x18a`.
- It then reads `*(payload+0x270)` and writes that value into `selectionList[0x188]`.
- Therefore slot `0x67` can exist while active list count is zero when post-load seat entries are absent.

The next wall is not data fill. It is UI admission:

- Trace after click probes had `0x0b01=0`, `0x0b07=0`, `0x0f08=5`, `0x0f09=5`.
- `listSelected189` stayed `-1`.
- `command.selectedD5` and `command.categoryD6` stayed `-1`.
- `command.activeGate04=0`, `activeGate05=0`, while `rowCountD4=24`.
- `logh7_hud_admission_watch.py` recorded no `command-row-*` target hits.
- `FUN_004f58c0` explains this: command rows are only scanned when `*(activeCommandRoot+4) != 0`; live active root `+4` was `0`.

Tooling/server note:

- `server/src/server/logh7-auth-server.mjs` now logs `recordSeatCount24c` for fixed `0x0323` records.
- Keep `recordSeatCount250` for compatibility, but interpret it only as the `0x0356` native-object count when `recordWire=compact-0356`.
- Verification: `cd server; node --test tests/server/logh7-login-session.test.mjs tests/server/logh7-server.test.mjs` = 146/146 PASS.

Closure:

- `ui_explorer stop` returned `shaVerified:true`.
- Installed and overlay game EXEs both matched SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
- No `G7MTClient`, no session `node`, and no `47900` listener remained.

## Follow-up: Gate Writer Instrumentation

After the postload seat run, the remaining question was narrowed to two live gates:

- Why `FUN_005015f0(2)` returns false for the populated `selection-primary-0` / `selection-secondary-0` row.
- Why `command.activeGate04` remains `0` even though `rowCountD4=24`.

RE recheck:

- `FUN_005015f0` tests target `+8`, event queue `FUN_00501ed0`, controller `+5`, target `+0x15`, geometry `FUN_005025f0`, occlusion/peer gates, then event-specific gates such as target `+0xb00` for event 2.
- `FUN_00502ea0` writes object/root `+4`.
- `FUN_005024b0` writes controller `+5`.
- `FUN_005024e0` writes target `+0x15`.

Tooling update:

- `RE/tools/logh7_hud_hit_test_gate_watch.py` now classifies selection rows and command rows, not only HUD mode targets.
- It logs selection and command summaries around each hit-test event.
- It hooks `FUN_00502ea0` and `FUN_005024e0` to capture caller VA, target, requested value, and before/after gate state.

Verification:

- `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py`
- `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` = 10/10 PASS

Next live discriminator:

- Use canonical installed EXE SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`.
- Keep preseed off unless explicitly diagnosing.
- Include `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`.
- Attach `logh7_hud_admission_watch.py`, `logh7_hud_hit_test_gate_watch.py`, and `logh7_hud_event_queue_watch.py`.
- Click the known row and command areas; pass condition is either `listSelected189` changes, `command.activeGate04` opens, or the watcher proves the exact gate that refuses the click.

## Follow-up: Canonical Gate-writer Live Result

Session `.omo/ui-explorer/c002-gate-writers-98ca-20260628` executed that discriminator with the installed canonical game EXE, SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, no preseed env, and `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`.

Data fill remained good:

- `0x0356 compact-0356` was sent once.
- `selectgrid-snapshot.jsonl` showed `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`.
- `selection.listCount188=1`, `payloadCount270=1`, `payloadCount270U8=1`.
- One primary/secondary selection row existed, and command `rowCountD4=24`.

Click result:

- Final trace counts: `0x0f08=4`, `0x0f09=4`, `0x0b01=0`, `0x0b07=0`.
- Clicks exercised own cell, selection-list candidate, command oval/rows, red planet, and empty grid.

Watcher result:

- `logh7_hud_hit_test_gate_watch.py`: `selection-primary-0=249`, `selection-secondary-0=249`; `inputHitTest-gate-005015f0` returned `retvalLow8=0` for all 3478 samples; `selectionChanges=0`, `commandChanges=0`.
- `logh7_hud_admission_watch.py`: `selectionHitTest` returned `1` for all 249 leave samples, but `commandRowHit` returned `0` for all 249 leave samples.
- `logh7_hud_event_queue_watch.py`: dequeue codes stayed in non-move polling/event paths (`2`, `9`, `11`, `13`); the only enqueue entries were event code `22`, not SelectGrid movement.

Current conclusion:

- The lower-level selection row detector can see the row.
- The higher-level input gate still refuses the event before `listSelected189` changes.
- Command rows are still blocked by command root inactivity (`activeGate04=0`) despite a populated command table.
- Next RE target is the bridge between `selectionHitTest` success and `FUN_005015f0`/event queue acceptance, plus the caller that should flip command root `+4`.

## Follow-up: Controller Gate Refinement

Existing live evidence was re-parsed before starting another client run.

Source:

- `.omo/ui-explorer/c002-gate-writers-98ca-20260628/hud-hit-test-gates.jsonl`

Static RE/raw-byte recheck:

- `FUN_005015f0` event kind `2` checks target `+8`, queued-event fast path, controller `+5`, target `+0x15`, geometry `FUN_005025f0`, occlusion/peer gates, then event-specific gates such as target `+0xb00`.
- The event-2 `target+0xb00` check is visible in canonical disassembly around VA `0x005018cd`.
- `FUN_004f6600` is `void`; the real selection success evidence is the write to `selectionList+0x624` / `listSelected189`.

Live-log refinement:

- `selection-primary-0` and `selection-secondary-0` produced 498 total `FUN_005015f0(2, row, ...)` samples.
- All 498 returned `retvalLow8=0`.
- Row state in those samples was `valid08=1`, `flag15=1`, `gateB00=0`, `gateB01=0`, `gateB02=0`.
- The controlling object state was `controllerGate05=0` in every sample.
- No nested `FUN_005025f0`, `FUN_0050c180`, or `FUN_00501d60` records appeared for those selection rows.

Conclusion:

- The current first proven rejection point is controller `+5 == 0`, before geometry/occlusion and before the final `row+0xb00` check.
- `row+0xb00` is still important, but it is not yet proven to be the first failing gate because the row never reaches that branch in the observed samples.

Tooling update:

- `RE/tools/logh7_hud_hit_test_gate_watch.py` now records row event queue keys and `hasEvent2`/`hasEvent9`/`hasEvent0b`.
- It hooks `FUN_00507f20` as `interactionLatchLoop-enter/leave-00507f20`, logging controller state, target row state, selection/command summaries, input globals, and `+0xb00/+0xb01/+0xb02` before/after.

Verification:

- `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` PASS.
- `cd RE; python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` = 10/10 PASS.

Next live discriminator:

- If selection rows never enter `FUN_00507f20`, they are not registered in the latch update loop.
- If they enter `FUN_00507f20` but controller `+5` / row `+0xb00` remains closed, the failure is inside the latch/event globals path.
- If `listSelected189` changes, move immediately to command root `+4` and SelectGrid `0x0b01`.

## Follow-up: C002 Latch Live Result

Session `.omo/ui-explorer/c002-latch-loop-98ca-20260628` ran the next discriminator on the installed canonical game EXE, SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, without `LOGH_PRESEED_PLAYER_CHAR`.

Data fill proof:

- Trace sent `0x0356 compact-0356` once after `0x0f02`/postload.
- Snapshot `selectgrid-snapshot-world.json` showed `fieldMode126711=2`, `gridActive126710=1`, `worldActive2a58f8=65537`.
- `selection.listCount188=1`, `payloadCount270=1`, `payloadCount270U8=1`.
- One primary/secondary selection row existed; command `rowCountD4=24`.

Watcher proof:

- `hud-hit-test-gates-live.jsonl`: `selection-primary-0=135`, `selection-secondary-0=135` `FUN_005015f0` samples.
- Every selection sample had `gate05=0`, `flag15=1`, empty event keys, `hasEvent2=false`, and `retvalLow8=0`.
- `hud-admission-live.jsonl`: `listSelected189=-1`, `command.selectedD5=-1`, `command.categoryD6=-1`.
- `hud-event-queue-live.jsonl`: dequeue codes stayed `2/9/11/13`; the only enqueue was event code `22`, not SelectGrid move.
- Trace still had `0x0b01=0`, `0x0b07=0`.

Runtime caveat:

- After the first selection-row click the client process closed before the remaining command-click sequence could run. The watcher sessions still completed with cleanup errors `[]`, and `ui_explorer stop` restored/verified the canonical SHA.

Updated conclusion:

- Selection rows are registered enough to be classified and passed to `FUN_005015f0`.
- The observed failing surface remains the closed event/controller path: no row event key for event 2, no selection success write to `listSelected189`, and no command-root activation.
- Next RE target is the producer that should call `FUN_00501e30`/`FUN_005024b0` or otherwise populate row event keys/controller `+5`, followed by the command root `+4` producer (`FUN_00502ea0` path).

## Follow-up: Root Gate Live Result

Session `.omo/ui-explorer/c002-rootgate-98ca-20260628` repeated the discriminator on the installed canonical game EXE, SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`, without `LOGH_PRESEED_PLAYER_CHAR`.

Environment:

- `LOGH_POSTLOAD_RICH_CHARACTER=1`
- `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`
- `LOGH_STRAT_GALAXY=1`
- `LOGH_STRAT_GRID_EARLY=1`
- `LOGH_STRAT_TERRAIN=1`
- `LOGH_WORLD_PLAYER=1`
- `LOGH_FULL_UNIT_LOCATION=1`
- `LOGH_GRID_ENTER=1`

Data fill stayed confirmed:

- Natural create-character flow created character `2`.
- Trace reached `0x0204`, `0x0325`, `0x0b0a`, and `0x0356 compact-0356`.
- `0x0356` carried `recordSeatCount250=1`, `recordSeatChar254=2`, `recordSeatRole258=0`.
- `selectgrid-snapshot-rootgate.jsonl` showed `selection.listPage187=1`, `selection.listCount188=1`, `payloadCount270=1`, `currentPayloadCount270=1`, one primary/secondary selection row, and `command.rowCountD4=24`.

Root/input gate proof:

- `logh7_hud_hit_test_gate_watch.py` produced 18,623 events.
- Selection row samples totalled 1102.
- All `FUN_005015f0(2, selection-row, ...)` samples returned `retvalLow8=0`.
- The sampled selection root/controller was closed: `rootState.gate04=0`, `rootState.gate05=0`.
- Row target `flag15=1`, so the row itself was enabled.
- Event keys were empty: no queued event `2`, `9`, or `0xb` for the row path.
- No `selectionImportApply`, `selectionTabApply`, `commandTabApply`, or `hudModeSet` hook fired while the watcher was attached.

Click result:

- Selection-row click produced `0x0f08 -> 0x0f09`, not `0x0b01`.
- Command-row click produced no movement request.
- No `0x0b07` response appeared.

Current discriminator result:

- The active selection data is now filled.
- The visible row is enabled and reaches the hit-test gate.
- The selection/root controller is closed, so the event-pulse path never promotes the click into `listSelected189`.
- Command root activation remains downstream of the missing selection success.
- The next live run should attach before or during the first `0x0356` import to catch the first `FUN_004f68f0 -> FUN_004f6680` timing, then follow `FUN_005024b0`/`FUN_00502ea0`/`FUN_00507f20` writers.

## Follow-up: Early-root Timing Result

Session `.omo/ui-explorer/c002-earlyroot-98ca-20260628` attached the lifecycle watcher before game-start/card-entry, still using the installed canonical game EXE and canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. `LOGH_PRESEED_PLAYER_CHAR` was not used.

Watcher/tooling update:

- `logh7_hud_hit_test_gate_watch.py` now has `--lifecycle-only` and `--max-events`.
- Lifecycle-only mode keeps root/import/tab/mode writer hooks but skips noisy hit-test/geometry hooks, so it can be attached in the lobby.
- The same watcher now logs `FUN_00506280`, `FUN_004fc4a0`, `FUN_004fd100`, `selection-root`, and `payload+0x270` state.
- Verification: `cd RE; python -m py_compile tools/logh7_hud_hit_test_gate_watch.py` and `python -m unittest tools.tests.test_logh7_hud_hit_test_gate_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_hud_event_queue_watch` passed 11/11.

Live result:

- Trace reached `0x0356 compact-0356` with one post-load seat entry.
- Snapshot showed `fieldMode126711=2`, `gridActive126710=1`, `selection.listCount188=1`, `payloadCount270=1`, one primary/secondary row, and `command.rowCountD4=24`.
- The selection root opened through `FUN_00506280` at returnVa `0x004f658f`; `FUN_00502ea0`/`FUN_005024b0` opened root `+4/+5` to `1/1`.
- Immediately after that, `FUN_004f6680(1)` closed the same root back to `0/0`.
- Later `0x0356 -> FUN_004fc4a0 -> FUN_004f68f0` imports filled/kept list count `1`, but continued to call `FUN_004f6680(1)` with the root closed.

Static reconciliation:

- `DAT_0066f130 + tab*0x208` in the canonical EXE has tab0 first dword `0xffffffff`, tab1 first dword `0xffffffff`, tab2 first dword `0x00000000`, tab3 first dword `0x00000000`.
- `FUN_004f6680` closes root `+4/+5` when that first dword is `-1`.
- The live requested tab was `1`, so the close is now explained by the static table.
- `FUN_004fd7a0` live requested mode `1`; the static mode2 branch would call a valid tab `2` or `3`.

Updated discriminator:

- C002 is not missing `0x0356`, slot `0x67`, or `PLAYER_INFO+0x270`.
- It is also no longer just a post-world attach blind spot: the root does open, then invalid tab `1` closes it.
- `LOGH_ACTION_LIST_CATEGORY` / `LOGH_ACTION_LIST_SEATS` / `LOGH_POSTLOAD_ACTION_LIST_SEATS` are real server payload levers, but they are not yet proven to change the client tab/mode request. Use them only as documented A/B discriminators.
- Next pass should prove what natural condition makes `FUN_004fd7a0` request mode/tab `2` or `3`, or why the post-load path remains stuck on tab `1`.

## Follow-up: Mode2 / Valid-tab Static RE

Redex re-read of `FUN_004fd7a0`, `FUN_004fd100`, `FUN_004fc4a0`, and `FUN_004fd560` refined the target after the early-root live result.

Key findings:

- `FUN_004fd7a0` first writes the requested mode into `HUD+0xf4`.
- It then unconditionally calls `FUN_004f59e0(1)` and `FUN_004f6680(1)`, which explains the live tab1 close.
- Only the `HUD+0xf4 == 2` branch calls `FUN_004f6680(3 - bVar9)`, selecting valid tab `2` or `3`.
- `bVar9` is derived from the current context object at `*(DAT_0150c250 + HUD) + 0x28`, so tab2-vs-tab3 depends on client context, not directly on the server seat count.
- `FUN_004fc4a0` replays the previous `HUD+0xf4` after `0x0356` import; it does not choose mode2 by itself.
- `FUN_004fd100` is the natural per-frame mode-entry path: `HUD+0x14` event2 hit calls `FUN_004fd7a0(2,1)`, and `HUD+0x28` can also return to mode2 when current mode is 1.

Updated next live target:

- Instrument HUD mode targets `HUD+0x14` and `HUD+0x28`, not only selection rows.
- Capture `valid08`, controller `+5`, target `+0x15`, event queue keys, `+0xb00`, and writer callers.
- The desired natural transition is `FUN_004fd7a0(2,1)` followed by `FUN_004f6680(2/3)`.
- `LOGH_ACTION_LIST_CATEGORY` remains only an A/B discriminator unless it produces that transition in trace.

## Follow-up: Mode-target / Event22 Live Result

Session `.omo/ui-explorer/c002-mode2-target-98ca-20260628` kept the installed canonical game EXE path and canonical playable SHA `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`. `LOGH_PRESEED_PLAYER_CHAR` was not used.

Live setup:

- Env included `LOGH_POSTLOAD_RICH_CHARACTER=1`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1`, `LOGH_STRAT_GALAXY=1`, `LOGH_STRAT_GRID_EARLY=1`, `LOGH_STRAT_TERRAIN=1`, `LOGH_WORLD_PLAYER=1`, `LOGH_FULL_UNIT_LOCATION=1`, and `LOGH_GRID_ENTER=1`.
- Mode probe after world entry showed `selector_35f35a=0`, `mode_byte_126711=2`, `selectedChar_3584a0=1`, `own_cell_11178=2588`.
- Trace included `0x0356 compact-0356` with `recordSeatCount250=1`, `recordSeatKind254=1`, `recordSeatChar254=1`, `recordSeatRole258=0`.
- Snapshot showed `selection.listCount188=1`, `payloadCount270=1`, `currentPayloadCount270=1`, one primary/secondary row, and `command.rowCountD4=24`.

Watcher result:

- `hudMode2Primary` and `hudMode4Primary` were valid but invisible/disabled.
- `hudMode2Fallback` and `hudMode6Fallback` were visible/enabled.
- Two watcher passes completed: `hud-hit-test-mode2-targets.jsonl` with 29,563 events and `hud-hit-test-visible-objects.jsonl` with 33,747 events.
- Both passes saw thousands of dequeue/hit-test samples but only one enqueue each.
- The enqueue was `FUN_00501e30` event code `22` (`0x16`), `returnVa=0x00517d2d`, target role `[]`, not a mode/selection/command target.
- No watched target queued event `2`, `9`, or `0xb`.

Click result:

- Mode fallback clicks and visible map object clicks produced `0x0f08 -> 0x0f09`.
- Central system, fleet panels, logical command row, and red system clicks produced no movement request.
- Final trace counts for movement remained `0x0b01=0`, `0x0b07=0`; `0x0f08/0x0f09` appeared three times.

Static reconciliation:

- Redex/subagent confirmed `0x00517d2d` is inside `FUN_00517cd0`, the local event wrapper that calls `FUN_00501e30(0x16, ...)`.
- Direct callers include `FUN_004c2620 -> FUN_00517cd0(0x0f08, ...)` and `FUN_004c2660 -> FUN_00517cd0(0x0f09, ...)`.
- Therefore this live run hit the known info/mail/domain wrapper path, not SelectGrid.
- The movement path remains `FUN_005737d0 -> FUN_004b48d0 -> FUN_004b78a0(arg2 selector 0x3b -> case index 0x3a) -> 0x0b01`.

Updated discriminator:

- `0x0356`, `PLAYER_INFO+0x270`, the selection row, and mode2 field state are all present.
- Natural map/system/fallback clicks still do not produce the SelectGrid event sequence.
- `0x0f09` is a one-byte generic/status reply in the current server path and should not be treated as command unlock.
- The next evidence target is either event22 payload decoding (`payloadBytes34`) or the older positive-control command-row/SelectGrid flow that reaches `FUN_00581c80` and then stalls before `FUN_005737d0`.

## Follow-up: Live-Deferred Static Recheck

After the user deferred live verification to the end, the C002 path was rechecked
without launching the game.

- `FUN_00581c80` still constructs the SelectGrid command object tree. It creates
  `SelectGrid`, `TARGET_GRID`, `TARGET_BASE_GRID`, `SendWarpCommand`,
  `GoReceive`, and `ReceiveResult`; the ReceiveResult node stores response
  `0x0b07` and request `0x0b01`.
- `FUN_005737d0` remains the command execution node. It resolves the selected
  target/grid, then calls `FUN_004b48d0(...)` on the grid-confirm branch.
- `FUN_004b78a0` maps selector `0x003b` / case index `0x003a` to request
  `0x0b01` and response `0x0b07`. This keeps the movement chain as
  `FUN_00581c80 -> FUN_005737d0 -> FUN_004b48d0 -> FUN_004b78a0 selector 0x003b`.
- `FUN_00517cd0` was re-read because recent live clicks only enqueued event
  `22`. It builds a local `0x34`-byte payload and calls
  `FUN_00501e30(0x16, FUN_00502780(0,0), local_34)`. Its direct callers wrap
  many domain/status codes, including `0x0f08`, `0x0f09`, and `0x0b07`.
  Therefore event22 remains a status/domain wrapper observation, not a
  user-originated SelectGrid send.
- The existing `RE/tools/logh7_hud_hit_test_gate_watch.py` already captures
  `payloadBytes34`, and event22 is already sufficiently classified for the next
  decision. The next live target should be the command-row positive-control path
  that reaches `FUN_00581c80`, not another generic event22/map-click run.

## Follow-up: DAT_009d2a3c/40 Static Boundary

Read-only subagent review and a fresh redex grep agree with the older
`docs/logh7-movemode-re.md` correction:

- `grep DAT_009d2a3c` and `grep DAT_009d2a40` find only `FUN_00570a10`.
- In `FUN_00570a10`, `DAT_009d2a3c == 2` copies `DAT_009d2a40` into
  `widget+0x34`, clears `widget+0x44`, calls `FUN_00517db0()`, and returns `3`.
- Therefore the client-side direct writer for `state+0x0c`/`state+0x10` is still
  absent. Treat `DAT_009d2a3c`/`DAT_009d2a40` as a consumed result channel, not
  as the natural UI transition itself.
- 2026-06-28 static scanner update: `RE/tools/logh7_disasm_range.py` now supports
  `--xref-range`, `--access`, `--all-functions`, function-context output, simple
  tracked-register candidates, and `rep movs*` destination candidates. Running it
  on `0x009d2a30:+0x50` found direct writer candidates inside the same state block:
  `FUN_004f9600` clears `state+0x44/0x4c`, `FUN_005751b0` writes `state+0x44/0x4c`
  during `0xb01/0xb07` receive/result handling, and `FUN_0058ee70` writes
  `state+0x3e`. The important new candidate is `FUN_005751b0`: it is the
  `0x0b07` result-node vtable path already seen in older C002 notes and sets
  `DAT_009d2a7c` through `0 -> 2 -> 4` style states around `0xb01/0xb07`.
- The remaining missing static target before the next live run is narrower:
  identify who sets `state+0x0c`/`state+0x10`, and hook `FUN_005751b0` plus
  `FUN_004f9600` in the next positive-control run to verify whether the valid
  destination state reaches `FUN_005737d0` and a real `0x0b01/0x0b07` loop.

## Follow-up: Outbound Opcode Spine

Static RE tooling now makes the send-side C002 route inspectable without
manually re-reading `FUN_004b78a0` each session.

- `RE/tools/logh7_outbound_request_dispatch.py` indexes the full
  `FUN_004b78a0` selector jump table at `0x004b864c`.
- `RE/tools/logh7_opcode_index.py` joins that outbound selector map with the
  tracked inbound-response dispatcher, transport dispatcher, and message-family
  metadata. The pipeline command is:
  `cd RE; python tools/logh7_pipeline.py opcode-index .omo\ghidra\bin\G7MTClient.exe --out .omo\ghidra\opcode-index.json`.
- The generated `c002Route` pins SelectGrid movement as selector `0x003b`,
  case index `0x003a`, target VA `0x004b7ed0`, request `0x0b01`, paired
  response `0x0b07`, state gate `client+0x35837e`.
- Coverage is explicit in the index: 128 outbound selector routes, 7 tracked
  inbound responses, 9 tracked transport routes, and 3 message families.
  Full inbound case enumeration remains pending.

This changes the next RE question from "what sends `0x0b01`?" to "which natural
UI/caller path reaches selector `0x003b`, and why current admission never gets
there?"

## Follow-up: Outbound Callsite Map

The `FUN_004b78a0` callsite-to-selector map is now static tool output, not a
manual redex note.

- `RE/tools/logh7_opcode_index.py` now scans direct raw x86
  `call 0x004b78a0` sites and reads the latest immediate `push` arguments before
  the call. This resolves mode, selector, payload operand, caller function, and
  request/response route.
- Generated coverage from `.omo\ghidra\opcode-index.json`: 105 outbound
  callsites, 103 selector-resolved callsites.
- C002 callsite is exactly `FUN_004b48d0 @ 0x004b490e`, newest pushes
  `1`, `0x3b`, `eax`; that is queued mode, selector `0x003b`, payload `eax`,
  request `0x0b01`, paired response `0x0b07`.
- The nearby historical confusion is now pinned: `FUN_004b4600 @ 0x004b4642`
  pushes selector `0x003a`, but that resolves to request `0x0412`, not C002.
- `RE/tools/logh7_selectgrid_state_watch.py` labels were corrected accordingly:
  `0x30` is the observed info path, `0x3a` is a non-C002 selector, and `0x3b`
  is the SelectGrid movement route.

Verification:

- `cd RE; python -m py_compile tools\logh7_opcode_index.py tools\logh7_outbound_request_dispatch.py tools\logh7_pipeline.py`
- `cd RE; python -m unittest tools.tests.test_logh7_opcode_index` = 6/6 PASS
- `cd RE; python tools\logh7_pipeline.py opcode-index .omo\ghidra\bin\G7MTClient.exe --out .omo\ghidra\opcode-index.json`

## Follow-up: Standard Seats and Widget Gate Split - 2026-06-29

Session `.omo/ui-explorer/codex-c002-force-20260629` promoted
`LOGH_POSTLOAD_ACTION_LIST_SEATS=1` from opt-in diagnostic to standard playable
env. With no explicit env override and preseed off, world entry reached
`0x0204`, `0x0325`, `0x0323`, `0x0b0a`, `0x0356`; the post-load `0x0323`
carried `recordSeatCount24c=1`, and `0x0356` carried `recordSeatCount250=1`.

SelectGrid snapshot `standard-seats-world-entry` proves H1 is now standard:
- `selection.listCount188=1`
- `selection.payloadCount270=1`
- `selection.currentPayloadCount270=1`
- `command.rowCountD4=24`

Remaining blocker is not missing seat/action-list data. H3/H2/H5 still fail:
- `hudModeF4=1`, `hudAb0=-1`, `hudState14e0=1`
- `selection.listSelected189=-1`
- `command.activeGate04=0`, `command.activeGate05=0`
- `command.selectedD5=-1`, `command.categoryD6=-1`

Read-only watcher session `.omo/ui-explorer/codex-goal-live-20260629` showed
natural clicks never reached `categoryResolve`, `commandBuild`,
`factoryDispatch`, or `outboundRequest`. Classified `FUN_005015f0` samples:
- mode target fallback rows: controller `+5=1`, target `+5=0`, `+0xb00=0`,
  no event keys, return 0
- selection row: controller `+5=0`, target `+5=0`, `+0xb00=0`, no event key
  2, return 0

Force A/B with `logh7_hud_admission_watch.py --force-interaction-this-gate`
opened the selection controller `+5` once, but the target remained unregistered:
- `selectionHitTest` wrapper returned 1, but post-state stayed
  `listSelected189=-1`, `selectedD5=-1`, `categoryD6=-1`
- read-only hit-test still saw row `target+5=0`, `gateB00=0`,
  `hasEvent2=false`, return 0
- no `categoryResolve`, `commandBuild`, `factoryDispatch`, or outbound
  `FUN_004b78a0` selector `0x3b`

Bridge positive-control session `.omo/ui-explorer/codex-c002-bridge-20260629`
confirmed the current forced click still falls into the wrong route:
`logh7_c002_bridge_pc.py --seconds 8 --cx 965 --cy 552` produced
`sendWarpN=0`, `b78aN=1`, `b78aOps: { "48": 1 }`. Server trace contained no
client-originated `0x0b01`. This matches the existing `0x30` info-path
classification, not SelectGrid movement selector `0x3b`.

Next target is the client widget activation producer, not additional server
seat data: identify why the selection row and HUD mode widgets are never
registered with target `+5`, event key 2, and `+0xb00`, or build a narrow
runtime/client patch that activates those widgets without forcing the wrong
selector route.
