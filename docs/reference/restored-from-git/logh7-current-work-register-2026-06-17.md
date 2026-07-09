# LOGH VII 현재 작업 등록부

작성일: 2026-06-17 KST

이 문서는 지금 해야 할 일을 한 곳에 고정한다. 기준은 “테스트가 돈다”가 아니라 실제 `G7MTClient.exe`로 회원가입, 캐릭터 생성, 접속, 로비, 월드 렌더, 전략 상호작용이 관측되는 것이다. Vite/React 표면은 데모 인증 화면일 뿐이며 게임 클라이언트로 취급하지 않는다.

## 2026-06-20 최신 오버라이드

이 파일은 2026-06-17부터 이어진 역사적 작업 등록부다. 현재 C002/G006 상태는
`docs/SESSION-HANDOFF-2026-06-20.md`, `docs/logh7-strategic-input-wire.md` §1.2.1,
`docs/logh7-master-roadmap-2026-06-20.md`, `.omo/ulw-loop/evidence/g006-c002-command-admission-re-20260620.md`를 우선한다.
최신 playable EXE SHA는 `7922ac365d219b3419e8c769dc4364d0cfd8a9e94578cb98f04c04bb0634ef7f`이다 (2026-06-21: strat-camera-focus cave=제국 수도 ヴァルハラ 셀 2588 갱신; 이전 `15ed8a35…`).
`rowCountD4=0`, `DAT_009d2a3c`, `source+0x320`, `DAT_009d2a3c=2` positive-control 루프는 역사적
증거로 보존하되, 새 작업은 HUD selection row/category/command-row admission 스냅샷에서 시작한다.

2026-06-21 추가 정정: `tools/logh7_hud_admission_watch.py`가 HUD admission 경계를 read-only Frida hook과
field watch로 추적한다. 실클라 세션 `.omo/ui-explorer/session-g006-c002-hud-admission-watch-20260621a/`에서
`FUN_004fd100`, `FUN_004f6600`, `FUN_004f58c0`는 매 프레임 실행됐고, `hud+0xab0`과
`selectionList+0x189*4`가 같은 주소라는 alias를 확인했다. 그러나 `FUN_004fd7a0(mode=2)`,
`FUN_004f6b00`, `FUN_004f5cb0`, `FUN_004f93c0`, `FUN_00581c80`은 0회였고 field write도 없었다.
command row 24개와 row0 rect는 존재하지만 `*commandMenu+4/+5` active gate가 0이라 row hit/dispatch가
진입하지 않는다. C002는 fail 유지다. 다음 RE 표적은 `*commandMenu+4/+5` writer와
`FUN_004fd100` 내부 input/event condition에서 `FUN_004fd7a0(2, 1)`로 들어가는 분기다.
증거: `.omo/ulw-loop/evidence/g006-c002-hud-admission-watch-20260621.md`.

2026-06-21 후속 hit-test run: 같은 watcher에 `FUN_005015f0` hook을 추가했다. 실클라 세션
`.omo/ui-explorer/session-g006-c002-hit-test-watch-20260621b/`에서 `hudTarget14-mode2-primary`,
`hudTarget28-mode2-fallback`, `selection-primary-0`, `selection-secondary-0` 모두 native return low byte가
`0`이었다. 따라서 현재 C002 blocker는 command row 좌표가 아니라 `FUN_005015f0` 입력/포커스 조건이
mode 전환 후보와 selection row를 false로 판정하는 상태다. 다음 표적은 `FUN_005024a0`,
`FUN_005025c0`, `FUN_005025f0`, `FUN_0050c180`, `FUN_00501d60`이다. 정적 RE 기준
`FUN_005024a0`은 object `+5`, `FUN_005025c0`은 object `+0x15` gate를 본다. watcher는 다음 live run에서
HUD mode target별 `+4/+5/+8/+15/+18/+1b`, event queue count, rect를 남기도록 보강됐다.

2026-06-21c/d 추가 판정: read-only 세션
`.omo/ui-explorer/session-g006-c002-mode-target-state-20260621c/`에서 `FUN_005015f0` leaf 18,630회를
캡처했고 `retvalLow8`은 전부 `0`이었다. 네 mode target 모두 `valid08=1`, rect 존재, event queue `0`인
상태에서 `gate05=0`으로 고정됐다. fallback target은 `flag15=1`이었으므로 즉시 실패 조건은
`FUN_005024a0`이 읽는 object `+5` gate다. 명시 debug 옵션으로 `hudTarget24 +5`만 1로 강제한
세션 `.omo/ui-explorer/session-g006-c002-force-gate-20260621d/`는 `0x0b01/0x0b07` 없이
`read ECONNRESET`으로 끝났으므로 단일 byte force는 해결책이 아니다. 다음 표적은 `FUN_005024b0(1)`을
정상 호출하는 owner path와 주변 상태, 특히 `FUN_004fc4e0 -> FUN_004fd7a0(1,0)` 초기화 이후
`FUN_004fd100`의 mode-entry 조건이다. 증거:
`.omo/ulw-loop/evidence/g006-c002-input-gate-classification-20260621d.md`.

2026-06-21e 정적 정정: 위의 "object `+5` gate" 표현은 `FUN_005015f0`의 첫 predicate에 대해
부정확했다. 디스어셈블리 기준 `FUN_005015f0`는 `ecx`를 `esi`에 저장한 뒤 `FUN_005024a0`을
`ecx=esi`로 호출하므로, 즉시 실패 조건은 target pointer가 아니라 `thisEcx+5`다. target pointer는
그 다음 `FUN_005025c0`에서 `target+0x15`로 검사된다. watcher는 이제 `inputHitTest-leave-005015f0`에
`thisState`를 남기고, non-default force도 `thisEcx+5`만 건드린다. 같은 날 live 재시도
`.omo/ui-explorer/session-g006-c002-this-gate-20260621e/`는 starfield에서 멈춰 전략 HUD에 도달하지
못했고 trace도 `scenario-seed`/`economy-seed`뿐이라 gate 증거로 쓰지 않는다. 다음 실행은 먼저
전략 HUD 진입을 확인한 뒤 `thisState.gate05`를 판별한다. 증거:
`.omo/ulw-loop/evidence/g006-c002-this-gate-static-correction-20260621e.md`.

2026-06-21f live 정정: starfield 재발의 직접 원인은 `login-commandline-bootstrap` EXE가
`127.0.0.1:47900`으로 고정 접속하는데 `ui_explorer start --port 47912`를 허용한 것이었다.
`tools/logh7_ui_explorer.py`는 이제 commandline bootstrap + non-47900 조합을 즉시 거부한다.
47900으로 재실행한 세션 `.omo/ui-explorer/session-g006-c002-this-gate-live-20260621f-port47900/`는
전략 HUD까지 도달했고 terrain/star label도 보였다. read-only watcher는 `FUN_005015f0` 22,487회를
캡처했으며 전부 `retvalLow8=0`이었다. 단, `thisState.gate05`는 17,737회가 1이므로 “this gate가
전부 0”은 아니다. selection row hit-test의 ECX는 디스어셈블리 기준 `selectionList[0]`이고,
해당 `+5`가 0이라 `listSelected189=-1`이 유지된다. `hudModeF4`도 전 구간 1이고 `hudModeSet`은
0회였으므로 `FUN_004fd7a0(2,1)` mode transition이 자연 발생하지 않았다. 상단 mode-target 후보
좌표 클릭은 `0x0f08->0x0f09` 정보 경로만 만들었고 `0x0b01/0x0b07`은 없다. 다음 표적은 서버 payload가
아니라 `FUN_004fd100`의 `HUD+0x24/+0x28` mode activation hit-test와 mouse/cursor input 조건이다.
증거: `.omo/ulw-loop/evidence/g006-c002-this-gate-live-20260621f.md`.

2026-06-21g 라이브 판별(★gate05 가설 반증): 정적 RE로 `FUN_00501ed0`=keyed 이벤트 큐 dequeue, `FUN_00501e30`=enqueue 규명 후, 확장 와치(`logh7_hud_mode_activation_watch.py`에 `gateB00`=`*(target+0xb00)`·이벤트 큐 전체 덤프·`hasMode2Event` 추가)로 라이브 측정. mode-entry `FUN_005015f0(2,…)` 438회×4타깃 전부 `retvalLow8=0`, `FUN_004fd7a0` 0회. **`this+5` gate05는 항상 1(통과) — v37~v61f가 쫓던 gate05/this+5=0 블로커 가설은 틀렸다.** 실제 차단: 이벤트 큐 `count=0`·`hasMode2Event=false`(클릭해도) → path(a) dequeue 실패가 1차 게이트; fallback은 Primary `*(target+0x15)=0`, Fallback `*(target+0xb00)=0`로 차단. 클릭은 카메라 팬만 만들고 code-2를 큐에 안 넣음 → 진짜 크럭스=**입력→`FUN_00501e30(2, HUD+0x14/0x28,…)` 라우팅**(어느 화면 버튼/입력이 트리거인가). 증거: `.omo/ulw-loop/evidence/g006-c002-live-discriminator-20260621.jsonl`(6060줄), `docs/logh7-loop-state.md` 2026-06-21 라이브 사이클.

루프 운영 방식은 `docs/logh7-loop-engineering.md`와 `docs/logh7-loop-state.md`를 따른다. 다음 작업자는 이 문서만 읽고 시작하지 말고, 루프 상태 파일의 첫 번째 `next` 항목을 선택해 한 사이클만 진행한 뒤 상태 파일을 갱신한다.

## 1. 현재 판정

- 현재 저장소는 서버, 콘텐츠/패키징 도구, 실제 클라이언트 설치 트리, Vite 데모가 함께 있는 모노레포다.
- 플레이어가 쓰는 표면은 `.omo/work/logh7-installed/LOGH7Launcher.exe`와 `.omo/work/logh7-installed/exe/G7MTClient.exe`다.
- 설치본 클라이언트는 최신 오버라이드의 canonical Korean playable EXE SHA를 기준으로 다룬다. 2026-06-17 당시 SHA
  `e75486ef762787448d91e38a612103f6d11691833c36a6bcb30d13a9cbdb2366`은 역사적 실행 증거로만 보존한다. 당시 빌드는 `menufix + dlgfix + earlygrid-ringclear` 스택이며,
  `LOGH_STRAT_GRID_EARLY=1` 기본 실행의 전제 조건이다.
- `LOGH_LOBBY_OK_FORMAT=message32`, `LOGH_SS_FORMAT=message32`, `LOGH_WORLD_PLAYER=1` 계열의 안전 플래그 조합으로 로비와 월드 진입은 재현된다.
- `LOGH_NPC_AI=1`, `LOGH_RELAY=1`, 과도한 early/preload 플래그를 한 번에 켜면 월드 진입 후 `ECONNRESET`/클라이언트 종료가 재현될 수 있다. 기본 검증 플래그로 쓰지 않는다.
- 기존 “최소 루프” 기준은 폐기한다. `0x0f08->0x0f09` 메일/HUD 트래픽은 전략 게임플레이가 아니다.
- 2026-06-17 P0-01은 실제 `G7MTClient.exe` 증거로 완료됐다. 회원가입 포털이 먼저 `p001flow` 계정을 만들었고, 같은 계정으로 로그인해 `Flow Lee` 캐릭터 생성, 로비 카드 downlink, 월드 진입 trace, cleanup SHA 복구까지 확인했다. 증거는 `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-account-db-after-world.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-world-trace.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-cleanup.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-verification.json`에 있다.
- 같은 날 no-bypass 검증도 통과했다. 중복 회원가입은 한국어 오류로 거절됐고, 미가입 계정은 redirect 없이 `reject` trace만 남겼으며, wrong password 전후 DB count/hash가 유지됐다. 증거는 `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-duplicate.json`, `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-missing-account-trace.json`, `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-wrong-password-dbdump.json`에 있다.
- P0-02는 아직 닫지 않는다. 2026-06-17 실클라 런에서 `0x0313/0x0315` staging/live marker table 81개는 확인됐지만, `ルンビーニ`/`イゼルローン` minimap navigation/render label 좌표 판정은 raw PDF annotation 좌표를 그대로 투영한 오류라 철회했다. 새 판정은 `docs/logh7-coordinate-provenance.md`와 `.omo/evidence/task-3-p0-02-coordinate-evidence-provenance.json`을 따른다.
- P0-02의 중간 blocker는 좌표 재투영이 아니라 `FUN_004c8700()` runtime command table population이었다. compact BE `0x0356`은 실클라 current-character slot과 selection payload count를 1로 만들었고, final gate에서는 선택/범주 적용까지 통과했다. 하지만 `FUN_004f5cb0(category)` 뒤 `rowCountD4=0`으로 접히며 `0x0b01/0x0b07`이 없었다. 이후 v10 정정으로 현재 blocker는 SelectGrid 생성 이후 target/confirm 경계로 이동했다. 증거는 `.omo/ulw-loop/evidence/g006-c002-compact-0356-selection-hit-summary.json`, `.omo/ulw-loop/evidence/g006-c002-category-apply-rowcount-zero-20260617.txt`, `.omo/ulw-loop/evidence/g006-c002-factory-return-v10-20260617.md`를 따른다.
- 2026-06-17 추가 정정: `0x0305/0x0307`은 같은 숫자를 쓰는 문서/정적 후보가 있어도, 현재 conn3 월드 로그인 generic `0x0304->0x0305`, `0x0306->0x0307` 기본 응답에서는 직무/명령 카드가 아니다. 다만 뒤의 wire/body residue 계측으로 초기 Frida `FUN_004ba2b0` thiscall 훅의 `Friedrich IV`류 body head는 서버 wire가 아니라 재사용 수신 버퍼 tail로 정정됐다. extra로 넣은 직무카드 builder byte는 디스패처에서 의도한 command table로 처리되지 않았고, 서버 기본/런처 기본에서 `LOGH_DUTY_CARDS_*` 계열은 제거한다. 정정 요약과 검증 목록은 `.omo/ulw-loop/evidence/g006-c002-duty-card-collision-correction-20260617.txt`와 `.omo/ulw-loop/evidence/g006-c002-wire-zero-body-residue-20260617.txt`에 고정했다.
- 2026-06-17 추가 판정: `0x0707` appointment 주입도 현재는 해결책이 아니다. `LOGH_ACTION_LIST_APPOINTMENT=1`은 서버 trace에 S->C `0x0707`을 남겼지만, 선부착 Frida 훅에서 `dispatcher-0707-enter`, `find-unit-*`, `appointment-apply-*`가 전혀 없었다. 이 항목의 “selection setter” 추정은 뒤의 final gate 계측으로 정정됐고, 증거는 `.omo/ulw-loop/evidence/g006-c002-category-retarget-and-0707-rebuttal-20260617.txt`에 보존한다.
- 2026-06-17 final gate 정정: 최신 blocker는 selection setter가 아니다. 범주 0 실클라 final 세션에서 `listSelected189 -1->0`, `FUN_004f6b00 retval=0`, `FUN_004f5cb0(0)` 호출/반환 `1`까지 갔지만 `rowCountD4 24->0`으로 접혔다. 범주 1도 prior safe 세션에서 `listSelected189 -1->0`, `FUN_004f6b00 retval=1`까지 갔고, 재실행 snapshot은 `categoryD6=1,rowCountD4=0`이었다. 다음 blocker는 `FUN_004c8700()` runtime command table의 `record+0x14` row count와 `record+0x16` factory list population이다. 증거는 `.omo/ulw-loop/evidence/g006-c002-category-apply-rowcount-zero-20260617.txt`를 따른다.
- 2026-06-17 command table lifecycle 정정: safe full-world 실클라 세션에서 live `0x0305/0x0307` dispatcher는 staging table에 문자열성 세션/캐릭터 바디를 복사했지만 `count00=0`, category0 `commandCount14=0`이었다. `FUN_004c2a30 -> FUN_004c4a10`은 이 빈 count를 runtime `+0x3416d8/+0x3468ea`로 승격하고 guard를 1로 세웠다. `FUN_004f5cb0(0)` 직전 runtime category0도 `commandCount14=0`이라 `rowCountD4=0`이 맞다. 다음 blocker는 `0x0305/0x0307` 재주입이 아니라 command table을 실제로 nonzero로 만드는 네이티브/resource 경로다. 증거는 `.omo/ulw-loop/evidence/g006-c002-command-table-lifecycle-20260617.txt`와 `.omo/ui-explorer/session-g006-command-table-lifecycle-47900-20260617/command_table_lifecycle.jsonl`를 따른다.
- 2026-06-17 positive-control 비교 정정: runtime table에 `tableBase+0x1e=2`, `+0x20=0x002b`, `+0x22=0x0041`를 쓰면 같은 `FUN_004f5cb0(commandMenu,0)` 호출이 `rowCountD4=2`와 command rows `0x002b/0x0041`을 만든다. safe path는 같은 위치가 `commandCount14=0`으로 남는다. 따라서 native UI row 생성은 유효하고, 다음 blocker는 `FUN_004c4a10` 이전 staging source다. 증거는 `.omo/ulw-loop/evidence/g006-c002-command-table-positive-control-compare-20260617.txt`를 따른다.
- 2026-06-17 wire/body residue 정정: 서버 trace 계측을 추가한 뒤 같은 실클라 세션에서 `0x0305` wire body 21002B와 `0x0307` wire body 58802B의 앞 256B가 모두 0이고 count도 0임을 확인했다. 같은 순간 Frida dispatcher `param_3`에는 `Friedrich IV`류 문자열 tail이 보였으므로, 이전 "실제 body가 세션/캐릭터 문자열" 표현은 wire 증거가 아니라 수신 객체 잔여 바이트로 정정한다. 다음 blocker는 stale tail 해석이 아니라 nonzero staging source admission이다. 증거는 `.omo/ulw-loop/evidence/g006-c002-wire-zero-body-residue-20260617.txt`와 `.omo/ui-explorer/session-g006-wire-body-residue-47900-20260617/trace.jsonl`를 따른다.
- 2026-06-17 원본 static command table raw scan: 설치/추출 트리의 MsgDat, Face TCF, window dat, EXE 후보 96개를 구조/literal 두 방식으로 스캔했지만 authoritative 원본 command table은 발견하지 못했다. 구조 후보는 raw-byte false positive로 판정했고, positive-control형 literal `0x0041,0x002b` 1건은 설치 트리 `G7Start.exe`에만 있어 원본 게임 클라 staging source로 인정하지 않는다. 다음은 raw MsgDat 재반복이 아니라 네이티브 admission/resource decoder 또는 정확한 nonzero body shape다. 증거는 `.omo/ulw-loop/evidence/g006-c002-original-static-command-table-scan-verdict-20260617.txt`를 따른다.
- 2026-06-17 v9 정정: 직접 category apply와 active object `+4/+5=1` 조합으로 command row hit 좌표는 잡혔다. row0 center `(57,146)` 클릭은 `selectedD5=0`과 `FUN_004f93c0(factoryIndex=0x2b, category=0)` 호출/반환 `1`까지 갔고 화면에는 `워프 항행` 명령 설명이 보였다. 그러나 목표 grid click은 `FUN_00581c80` SelectGrid, `FUN_0058fef0` command gate, `FUN_005737d0` SendWarpCommand 모두 0회였고 `FUN_004b78a0(arg2=48)` 및 `0x0f08->0x0f09` 정보 트래픽만 남겼다. 따라서 최신 blocker는 row 좌표가 아니라 `FUN_004f93c0(0x2b)`가 실제 SelectGrid factory로 이어지지 않는 factory/handler boundary다. 증거는 `.omo/ulw-loop/evidence/g006-c002-gate-pair-v9-20260617.md`를 따른다.
- 2026-06-17 v10 정정: v9의 최신 blocker 표현을 다시 고친다. v10b는 row0 클릭 전에 `0x004f93c0`, `0x00581c80`, `0x0058fef0`, `0x005737d0`, `0x004b78a0`을 붙였고, runtime `slot2b=0x581c80` 및 row0 click -> `FUN_00581c80` 1회 호출을 확인했다. `FUN_004f93c0(0x2b)`는 SelectGrid object `0x544db60` vtable `0x6702b8`을 만들고 manager current dialog에 연결한다. 최신 blocker는 SelectGrid 생성 이후 target/confirm 경로다. target click `(833,545)`은 `FUN_004b78a0(arg2=0x45)`를 타며 정적 case `0x44`에 의해 `0x0f08/0x0f09` 정보 경로로 빠지고, `FUN_0058fef0` command gate와 `FUN_005737d0` SendWarpCommand는 0회다. 증거는 `.omo/ulw-loop/evidence/g006-c002-factory-return-v10-20260617.md`를 따른다.
- 2026-06-17 v13b 정정: target/confirm 반복 실험은 더 이상 입력 좌표 문제가 아니다. v13b는 row0 `(57,146)`에서 warp target UI를 열고 target `(833,545)`에서 `90 LY`를 표시했다. 이 상태에서 `DAT_009d2a34=257`, `DAT_009d2a3c=1`, `DAT_009d2a40=0xffffffff`, `selectedD5=0`이고 `FUN_00570a10`은 return `1`만 반복했다. `ENTER`는 `FUN_004b78a0(arg1=1,arg2=0x45,...)`와 `0x0f08->0x0f09` 정보 경로였고, `SPACE`/right-click은 명령을 만들지 않았다. `0x00573cd0`, `0x005737d0`, `0x004b48d0`, `0x0b01/0x0b07`은 없다. 최신 blocker는 `DAT_009d2a3c`를 `2/3`으로 전이시키는 writer/state transition 또는 그 positive-control이다. 증거는 `.omo/ulw-loop/evidence/g006-c002-target-confirm-v13b-20260617.md`를 따른다.
- 2026-06-17 v14b 정정: `DAT_009d2a3c=2` positive-control은 실제 confirm branch를 연다. target `(833,545)`로 `90 LY`가 표시된 상태에서 단발 주입하자 `FUN_00570a10`이 return `3`을 냈고 확인창, `FUN_005737d0`, `FUN_004b48d0`, inbound `0x0b01`이 이어졌다. 그러나 `DAT_009d2a40=0xffffffff`, `sendGridMove(arg1=0xffffffff,arg2=0,arg3=0)`라서 유효 목적지/대상 writer는 아직 미확인이다. 이번 safe run은 `LOGH_RELAY`/`LOGH_AUTHORITATIVE`를 끈 상태라 generic `0x0b02`가 응답됐고, `0x0b07` 권위 루프 검증은 아직 아니다. 증거는 `.omo/ulw-loop/evidence/g006-c002-d2a3c-positive-control-v14b-20260617.md`를 따른다.
- 2026-06-18 v35/v36b 정정: `LOGH_WORLD_IMPORT_BASES=1`은 `0x0f02` 뒤 `0x031f` base와 `0x0321` institution을 `0x0f03` 전에 추가하는 C002 판별용 opt-in이다. v36b는 실제 `G7MTClient.exe`에서 `FUN_004c4170` source/copy buffers와 `DAT_007cd04c+0x1117c` list count 4를 만들었지만, `mainState+0x126714`, `mainState+0x2b6a70`, `DAT_007cd04c+0x11178` current raw는 계속 0이었다. 따라서 완료가 아니라 다음 blocker를 current/focus writer로 좁힌 증거다. 증거는 `.omo/ulw-loop/evidence/g006-c002-root-source-v35-v36b-20260618.md`를 따른다.
- 2026-06-18 v37 정정: `FUN_004c45f0`의 current/focus 입력은 `FUN_004b5bb0([mainState+8])`, 즉 live source object의 `+0x320`이다. v37 실클라 watcher는 `currentSourcePtr8=0xf34502c`, `currentSource320=0`, `FUN_004b5bb0` return 0을 확인했고, 같은 경계 전 `FUN_0048fb80` parser 호출은 없었다. 전략 화면은 진입했지만 하단 UI는 `NO DATA`였으므로 C002는 계속 pending이다. 다음 blocker는 서버 push 변형이 아니라 `mainState+8` source object `+0x320` writer/parser다. 증거는 `.omo/ulw-loop/evidence/g006-c002-root-current-v37-20260618.md`를 따른다.
- 2026-06-18 v38 정정: canonical playable EXE에서 `+0x320` 직접 참조 7개를 재스캔했고, `FUN_0048fb80` binary parser에 더해 `FUN_0048ffd0` text/adjacent parser도 watcher에 추가했다. 실클라 v38은 `0x0f06->0x0f07`과 post-load extras까지 도달했지만 두 parser hook 모두 0회였고, `currentSource320=0`, `field126714_u32=0`, root `currentRaw11178=0`, `listCount1117c=4`로 남았다. 다음 blocker는 parser payload가 아니라 `[mainState+8]` source object의 네이티브 생성/초기화 또는 parser 외부 `+0x320` writer다. 증거는 `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.md`를 따른다.
- 2026-06-18 v39 정정: `[mainState+8]`는 별도 heap CreateOutfit 객체가 아니라 `mainState+0xc` inline source/header다. `sourceHeadHex`는 `016e616d65...`, 즉 `\x01name`로 시작했고 `sourceVtable=0x6d616e01`은 vtable이 아니라 data head였다. `currentSource320=0`, `FUN_004b5bb0` return 0, `field126714_u32=0`, `strategyCurrent2b6a70=0`, root `currentRaw11178=0`, `listCount1117c=4`로 남았다. 추가 후보 `0x0040a700`/`0x004a49c0` factory wrapper와 parser `0x0048fb80`/`0x0048ffd0`는 모두 live enter/leave 0회였다. 다음 blocker는 `mainState+8 = mainState+0xc` writer와 inline source `+0x320` non-parser writer다. 증거는 `.omo/ulw-loop/evidence/g006-c002-root-current-v39-20260618.md`를 따른다.

- 2026-06-18 v40 정정: constructor/setter/accessor cluster를 붙였고 `sourceDirect31eSetter-004b5bd0`만 live enter/leave 각 1회였다. 이때 generic snapshot의 `mainState=0xf34002c`는 같은 run의 `fieldImport-004c4170` source `0xf34002c`와 같지만, 정적 의미상 `+0x31e` 주변 setter라 `currentSource320`이나 root current를 채우지 않았다. `mainStateConstructor-004b6000`, `sourceRelated324Setter-004b5cf0`, `sourceRelated31eSetter-004b5db0`, `sourceRelated358Setter-004b5e80`는 설치만 되고 0회였다. `fieldImport`는 계속 `mainState=0xf340020`, `[mainState+8]=0xf34002c=mainState+0xc`, `sourceHeadHex=016e616d65...`, `currentSource320=0`, `field126714_u32=0`, `strategyCurrent2b6a70=0`, root `currentRaw11178=0`, root `listCount1117c=4`를 보였다. 다음 blocker는 `mainState+8` slot store, inline `\\x01name` header init, inline source `+0x320` writer다. 증거는 `.omo/ulw-loop/evidence/g006-c002-root-current-v40-20260618.md`를 따른다.

- 2026-06-18 v42-v45 정정: `0x0325` unit table wire layout은 early와 postload를 분리해야 한다. `FUN_00419ca0` parser는 wire stream에서 count 뒤 unit id를 바로 읽지만, early `0x0f02`에 parser-stream을 전역 적용하면 exact-count branch `0x004bb15c -> 0x004bb179` 이후 ECONNRESET/클라이언트 종료가 난다. `LOGH_POSTLOAD_UNIT_STREAM_WIRE=1`만 켠 v45는 전략 HUD를 유지했고 postload import가 primary id=1/`primaryUnit24=1`, optional unit0 id=1/index0으로 맞았다. 하지만 `optionalRecord+8=0`, 자연 클릭 `0x0b01/0x0b07` 미발생, 하단 `이미 탈퇴하셨습니다.` 오문맥 UI 메시지가 남아 C002는 pending이다. 증거는 `.omo/ulw-loop/evidence/g006-c002-source-import-v45-postload-stream-minunit-20260618.md`를 따른다.

- 2026-06-18 루프 운영 정정: 모든 새 사이클은 선택 항목의 RE 프리패스로 시작한다.
  관련 manual/PDF, 설치 DB, MsgDat/TCF/MDX, EXE 소비 함수, 직전 trace/스크린샷을 먼저
  대조하고 나서 구현한다. 또한 `build-installed`는 더 이상 추출 원본 EXE만 패치해
  배포하지 않고, `earlygrid-ringclear`가 포함된 playable client를 최종 `exe/G7MTClient.exe`로
  배포/검증해야 한다.
- 2026-06-18 항성 타입 정정: `model-galaxy-stars.json`에는 O=2, B=5가 있어 고온/청색 계열이 하나뿐이라는 판정은 틀렸다. 서버가 세력 fallback `byte2`만 내보내던 문제를 고쳐 content pack과 실제 `LOGH_STRAT_GALAXY=1` login-session raw fallback 모두에 `model_node_order_provisional` 분광형을 싣고, 전략 grid marker variant를 `O/B/A/F/G/K/M -> 0..6`, unknown -> `8`로 만든다. 이 연결은 렌더용 임시 연결이며 이름별 원본 서버 확정 데이터가 아니다. absent spectral field는 legacy faction fallback을 유지한다. 검증은 `node --test tests/server/logh7-content-pack.test.mjs tests/server/logh7-login-session.test.mjs tests/server/logh7-login-protocol.test.mjs tests/server/logh7-strategic-grid-provenance.test.mjs` 및 `npm run test:server`.
- 2026-06-18 v52 실클라 정정: 실제 화면에서도 미니맵 이동 후 `베큘라`는 주황/황색, `발할라`는 청색/청록 계열로 보였으므로 항성 색은 단일 파란 fallback이 아니다. 그러나 보이는 항성 클릭은 아직 C002 완료가 아니다. `FUN_004d3580`은 world vector를 grid X/Y로 모두 쓰는 정상 변환 함수지만, star-click branch에서는 `state.p24ProjX=0x007b360c`, `p28ProjY=25/23`으로 남아 `FUN_004d6310=-256`이 되고, root current/list `DAT_007cd04c+0x11178/+0x1117c`는 0, command `selectedD5/categoryD6`는 -1이다. 다음은 클릭 반복이 아니라 current/list writer, `p24ProjX` source/caller local, action-state writer를 찾는다. 증거는 `.omo/ulw-loop/evidence/g006-c002-selectgrid-upstream-v52-20260618.md`를 따른다.
- 2026-06-18 v53 정적 보강: 항성 타입은 `model-galaxy-stars.json` 분포 `O=2,B=5,A=7,F=8,G=19,K=17,M=21` 및 `fs_glow_000..006` 다색 텍스처 기준으로 "파란 항성 하나뿐"이 아니다. 단, 성계명별 등급은 아직 `model_node_order_provisional`이라 이름별 원본 확정값으로 주장하지 않는다. 직접 절대 참조 스캔에서 `DAT_007cd04c`, `DAT_009d2a30`, `DAT_00c9eabc`, `DAT_00c9eac0` write는 0건이고, `0x004d7a6c..0x004d7b13` callsite는 `FUN_004d3580` xOut/yOut을 `state+0x24/+0x28`에 복사하는 정상 경로다. 따라서 다음은 클릭 한정 runtime local/source watcher와 optional record `+0x08` writer/origin 추적이다. `이미 탈퇴하셨습니다.` HUD 문구는 별도 UI 메시지 source blocker로 유지한다. 증거는 `.omo/ulw-loop/evidence/g006-c002-selectgrid-source-static-v53-20260618.md`를 따른다.
- 2026-06-18 v54 런타임 보강: `FUN_004d3580` entry hook은 Frida prologue/stack 관측에 취약하므로 폐기한다. 새 watcher는 X writepoint `0x004d359c`와 Y pre-write `0x004d35a6`을 쓴다. `0x004d35aa/35ac` 직접 훅은 Frida가 거부했다. 실클라에서 `발할라` 클릭은 world `(35.59025955200195,0,2.466439723968506)` -> grid `(85,22)`, `베큘라` 클릭은 world `(29.58106231689453,0,4.468449592590332)` -> grid `(79,20)`으로 변환됐다. 그러나 서버 trace는 heartbeat/info 경로만 남겼고 `0x0b01/0x0b07`은 없다. C002는 pending이며, 다음은 grid cell이 target table/current/list/action state로 연결되지 않는 이유를 추적한다. 증거는 `.omo/ulw-loop/evidence/g006-c002-selectgrid-v54-runtime-20260618.md`를 따른다.
- 2026-06-18 v55 클릭 상관관계 보강: `tools/logh7_selectgrid_click_correlation_watch.py`를 추가해 한 click id 안에서 world projection, `FUN_004d3580` writepoint, validator callsite, current/list, command 상태를 묶는다. `발할라` 클릭 `(1179,448)`은 writepoint path에서 grid `(85,22)`를 만들었지만 실제 validator 분기는 `0x004d7bba`였고 push 값은 `sp00=0x007b361c`, `sp04=22`, `sp08=0xffffffff`였다. `FUN_004d6310=-256`, pass branch `0x004d7bc3` 0회, `DAT_007cd04c+0x11178/+0x1117c=0/0`, `selectedD5/categoryD6=-1/-1`로 남아 C002는 pending이다. 정적 disasm상 다음 fresh run은 `0x004d7a80/8c/9c/aa9` state-copy 직후 `projectionStack/projectorWriteArgs`를 수집해야 한다. 증거는 `.omo/ulw-loop/evidence/g006-c002-selectgrid-v55-click-correlation-20260618.md`를 따른다.
- 2026-06-18 v56 copy-state 보강: 항성 데이터는 `O=2,B=5,A=7,F=8,G=19,K=17,M=21`이며 O/B만 7개라 "파란색 하나"가 아니다. 실클라 화면에서도 `베큘라`는 주황/황색, `발할라`는 청색/청록으로 보였다. `발할라` 중심 클릭 `(723,545)`은 `FUN_004d3580` writepoint에서 grid `(87,25)`를 만들었지만, `projection-state-written-after-004d7aa9=1` 시점의 state와 실제 `0x004d7bba` validator callsite는 X를 `0x007b361c`, Y를 `25`로 들고 있었다. `FUN_004d6310=-256`, 자연 `0x0b01/0x0b07` 없음. 다음은 같은 항성 클릭 반복이 아니라 `0x004d7a80` 전후 `sp70` source/caller local writer다. 증거는 `.omo/ulw-loop/evidence/g006-c002-selectgrid-v56-copy-state-20260618.md`와 `.omo/ulw-loop/evidence/g006-c002-selectgrid-click-correlation-v56-long-20260618.jsonl`를 따른다.
- 2026-06-18 v57-v60 정정: v56의 `state+0x24=0x007b361c`는 `0x004d7a7b` call-instruction Frida hook이 만든 trampoline 오염으로 재분류한다. return-gated `0x004d3581` watcher는 28회 모두 `returnAddress=0x004d7a80`, `xOutPtr=[esp+0x70]=0x19fc98`, X write target `0x19fc98`, copy-state X `87/88/89/90`, Y `25`를 보였다. validator 근처 `0x004d7bba/0x004d7bb8/0x004d6310` Frida hook도 클라이언트를 perturb/crash하므로 제거한다. 정적 `FUN_004d6310`상 v59의 `selectedCell=(87,25), object1=3, range=-1`은 통과 경로다. Frida 없는 v60 자연 클릭은 `발할라` 셀 하이라이트와 클라이언트 생존을 보였지만 trace는 `0x0300->0x0301`뿐이고 `0x0b01/0x0b07`은 없다. 다음 blocker는 projection/validator가 아니라 하이라이트된 선택 이후 command/action state 전이다. 증거는 `.omo/ulw-loop/evidence/g006-c002-selectgrid-v57-v60-return-gated-20260618.md`를 따른다.
- 2026-06-18 항성 타입/발할라 표기 재확인: `O=2,B=5,A=7,F=8,G=19,K=17,M=21,unassigned=1`이므로 "파란 항성 하나"는 계속 기각한다. 현재 content pack의 `ヴァルハラ`는 임시 `model_node_order_provisional` 기준 `B`, `byte2=1`이다. 이는 이름별 원본 확정 등급이 아니다. 화면/`constmsg`는 `발할라`인데 sidecar 일부가 `발하라`라서 `content/names/systems-ko.json`과 `content/roster/ivex-reference.json`을 `발할라`로 통일하고 회귀 테스트에 추가했다. 증거는 `.omo/ulw-loop/evidence/g006-star-type-ko-valhalla-20260618.md`를 따른다.
- 2026-06-18 v61 실클라 스냅샷 보강: 실제 로그인/캐릭터 선택/월드 진입 뒤 미니맵 클릭으로 초기 `0/0` 검은 화면에서 항성 지도로 이동했다. 같은 세션에서 `알타이르` 적색, `트라바흐`/`베루라` 계열 황색/주황, `발할라` 청색/청록이 보였으므로 "파란 항성 하나"는 화면 기준으로도 기각한다. `발할라` 클릭 후 스냅샷은 `selected=(87,25)`, `selectedCell.cellValue=73`, `object=(17,3,1)`, `camera=(37.5,0,-0.5)`였지만 `selectedD5/categoryD6=-1/-1`, `listCount188=0`, trace `0x0b01/0x0b07` 없음으로 남았다. C002 blocker는 계속 하이라이트 이후 command/action state 연결이다. 증거는 `.omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot-v61-20260618.md`와 `.omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot-v61-20260618.jsonl`를 따른다.
- 2026-06-18 v61 추가 RE/상호작용 보강: `tools/logh7_disasm_range.py`의 xref 스캔으로 `DAT_00c9eabc/eac0` direct write 0건, root `+0x11178/+0x1117c/+0x11180` direct displacement write 0건을 확인했다. 하단 우측 정보 아이콘과 캐릭터 행 클릭은 `0x0f06->0x0f07` 재동기화와 extra data 전송을 만들지만 `0x0b01/0x0b07`은 만들지 않는다. 열린 패널은 `접속하고 싶은 캐릭터를 선택해 주세요.`, `NO DATA`, `???`를 보여 UI 문맥/한글화 미완료 증거로 고정한다. 다음은 항성 클릭 반복이 아니라 UI/root action container population 경계다. 증거는 `.omo/ulw-loop/evidence/g006-c002-selectgrid-snapshot-v61-20260618.md`를 따른다.

## 2. 완료 기준

다음이 모두 실제 클라이언트로 관측되어야 한다.

1. 사용자가 회원가입부터 진행하고, 서버에 계정 이름이 남는다.
2. 같은 계정으로 로그인하고 캐릭터를 만든다.
3. 만든 캐릭터가 로비/세션/월드 진입에 사용된다.
4. 성계, 행성, 요새, 함대 위치가 출처와 함께 복원되고 클라이언트 렌더 위치가 맞는다.
5. UI 문구가 상황에 맞는 한국어로 보이며, 부적절한 영어/일본어/깨진 문자열이 남지 않는다.
6. 채팅과 사용자 입력 한글이 깨지지 않는다.
7. 로비와 월드는 시스템 해상도 기준 네이티브 UI 배치와 텍스처 재배치를 한다. 4:3/필러박스는 진단용 레거시 경로로만 유지한다.
8. 실제 전략 명령 루프가 관측된다. 최소 기준은 `0x0b01->0x0b07` 또는 동등성이 입증된 권위 서버 명령/응답이며, 스크린샷과 아웃바운드 명령 트레이스가 함께 있어야 한다.
9. 클라이언트, DLL, 데이터 파일의 RE 커버리지가 문서화되어 어떤 파일이 완료/미완료인지 바로 판단된다.

## 3. 즉시 작업 순서

### A. 안전 실행 기준 고정

- 실행 전 `tools.logh7_ui_explorer stop`으로 남은 세션을 정리한다.
- `.omo/work/logh7-installed/exe/G7MTClient.exe` SHA가 canonical playable 값인지 확인한다.
- `LOGH7Launcher.exe --check`, `--server-smoke`, `--client-smoke`를 먼저 통과시킨다.
- 실제 클라이언트 QA는 아래 계열을 기본값으로 시작한다.

```powershell
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<name> start --port 47900 `
  --env LOGH_ACCOUNT_DB=.omo/work/e2e-accounts.json `
  --env LOGH_LOBBY_OK_FORMAT=message32 `
  --env LOGH_LOBBY_RICH_CHARACTERS=1 `
  --env LOGH_LOBBY_EARLY_OK=1 `
  --env LOGH_SS_FORMAT=message32 `
  --env LOGH_WORLD_PLAYER=1 `
  --env LOGH_STRAT_GRID=1 `
  --env LOGH_STRAT_FLEET=1 `
  --env LOGH_STRAT_GALAXY=1 `
  --env LOGH_TACTICS_UNIT=1 `
  --env LOGH_GRID_ENTER=1 `
  --env LOGH_POSTLOAD_RICH_CHARACTER=1 `
  --env LOGH_CONTENT_DB=1 `
  --env LOGH_KO_NAMES=1 `
  --settle 5.0
```

### B. 회원가입부터 유저 흐름 완성

상태: 2026-06-17 기준 완료. 완료는 회원가입/계정/캐릭터/월드 진입 범위만 뜻한다. 성계 좌표, UI/채팅 전면 한글화, 전략 명령 루프, 풀스크린 필러, 전체 RE 행렬은 아래 C-G 항목으로 계속 남는다.

- 서버의 계정 DB를 단일 진입점으로 정한다. 기본 검증 DB는 `.omo/work/e2e-accounts.json`이다.
- 회원가입 포털과 런처가 모두 한국어여야 한다.
- 신규 계정 이름, 비밀번호, 생성 캐릭터 id/name/faction이 서버 상태에 남아야 한다.
- 같은 계정으로 재로그인했을 때 생성 캐릭터가 로비 카드와 월드 진입에 재사용되어야 한다.
- 성공 증거는 계정 DB 덤프, 로비 스크린샷, 캐릭터 생성 단계별 스크린샷, 월드 진입 트레이스다.
- 실제 완료 증거:
  - 가입 전후 DB: `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-account-db-before-client.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-account-db-after-world.json`
  - 시작 안전 플래그와 canonical client: `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-start.json`
  - 실제 로그인/생성 입력: `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-login.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-create-character.json`
  - 로비/월드 trace와 cleanup: `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-lobby-card-shot.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-world-trace.json`, `.omo/evidence/task-9-logh7-p0-01-signup-user-flow-cleanup.json`
  - no-bypass: `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-negative-tests.txt`, `.omo/evidence/task-10-logh7-p0-01-signup-user-flow-missing-account-trace.json`

### B-1. 오리지널 캐릭터 원본성 판정

상태: 2026-06-17 기준 “설치본 내 joined roster 미발견”으로 고정한다. 자세한 판정은 `docs/logh7-character-origin-data-mining-status.md`를 따른다.

- 설치본 `G7MTClient.exe`, `MsgDat`, `Face/*.tcf`, `tcf.hed`에서 이름, 능력치, 포트레잇 번호가 결합된 원본 로스터 표는 발견되지 않았다.
- 클라이언트에는 `0x0323`/`0x034f`/`0x0356` character record layout과 포트레잇 atlas가 있다. 이름/능력치/얼굴 결합값은 서버에서 내려오는 record로 보는 것이 현재 증거와 맞다.
- 공식 face-number anchor는 12개만 권위 데이터로 취급한다. 나머지 `characters.json`, `character-roster.json`, `ability-seed.json`, deterministic face assignment는 부활 서버용 mixed-provenance 데이터다.
- 증거: `.omo/ulw-loop/evidence/g006-character-origin-data-mining-summary.json`, `.omo/ulw-loop/evidence/g006-character-origin-known-name-scan.json`, `.omo/ulw-loop/evidence/g006-character-origin-no-roster-verifier.txt`.

### C. 성계 위치 섞임 바로잡기

현재 핵심 문제는 “데이터가 있다”가 아니라 “원본 좌표와 클라이언트 렌더 좌표가 같은가”다.

- `content/galaxy.json`의 80 성계/281 행성/6 요새는 기본 출처가 수동/문서 기반이다. 원본 서버 권위 좌표로 과장하지 않는다.
- 2026-06-17 재마이닝 기준, 성계 marker `byte0`은 `constmsg` group `0x18` sub-ID로 복원되어 `イゼルローン=14`, `ルンビーニ=86`처럼 확인된다. 다만 요새/함대/특수 천체 marker와 `byte2` 시각 의미는 아직 별도 검증이 필요하다.
- 2026-06-18 재판정 기준, 항성 분광형은 `Null_galaxy.mdx`의 `star_<NN>_<spectralClass>` 79개 노드에서 복원된다. O/B/A/F/G/K/M 분포는 2/5/7/8/19/17/21이며, content pack에는 `model_node_order_provisional`로만 들어간다. 이름별 직접 링크는 아직 미발견이므로 문서/화면에서 원본 서버 확정값처럼 표현하지 않는다.
- `0x0313` object table과 `0x0315` sector grid는 스냅샷 타이밍이 중요하다. 빈 grid가 먼저 들어가면 `FUN_004c5350` run-once guard가 빈 staging을 live table로 고정한다.
- 해야 할 일:
  - manual/PDF 좌표, 설치 데이터, MDX/모델, 라이브 메모리의 좌표 후보를 계속 분리해 관리한다. 현재 표는 `docs/logh7-world-data-mining-status.md`와 `.omo/ulw-loop/evidence/g006-world-data-mining-source-shape.json`에 있다.
  - 2026-06-17 2차 재판정은 `docs/logh7-coordinate-provenance.md`를 따른다. 매뉴얼 PDF 101쪽 annotation on/off 렌더 차분 결과, PDF 저장 rect는 `displayX=842-pdfCy`, `displayY=pdfCx`로 렌더 아이콘에 맞고, 서버가 실제로 쓰는 `content/galaxy.json` 정규화 좌표는 `displayX=contentCy`, `displayY=contentCx`로 변환해야 한다. 새 기대값은 `ルンビーニ` cell `(2,21)`, `イゼルローン` cell `(51,13)`, `シロン` cell `(3,15)`, `フェザーン` cell `(49,38)`이다.
  - corrected-cell 실클라 런은 canonical playable EXE로 로그인/월드 진입, `0x0313/0x0315`, `0x0323`, `0x0356`, `0x0f06->0x0f07`를 재현했다. `ルンビーニ (2,21)` / `イゼルローン (51,13)` 및 패널 후보 클릭은 `0x0300` 또는 무트레이스에 머물렀고, `0x0b01/0x0b07`은 발생하지 않았다. 증거: `.omo/ulw-loop/evidence/g006-redatamine-manual-20260617/corrected-client-trace-summary.json`.
  - G006 C002 재계측 기준, `0x0356`은 728B native LE 고정 레코드가 아니라 compact stream이며 wire 숫자 필드는 BE다. 이 경로는 current-character payload를 채우지만 row selected/category/command refresh를 만들지는 못했다.
  - `0x0305/0x0307` 직무카드 주입 가설은 현재 conn3 월드 로그인 generic 기본 경로에서 반박됐다. 단, 초기 Frida body 문자열은 실제 wire가 아니라 stale receive-buffer tail로 정정됐다. 이 숫자들의 정적 read-model 후보 문서는 “후보/별도 경로”로 보존하고, 서버 기본 경로에는 zero-filled walker 외 값을 무근거로 연결하지 않는다. 정정 증거는 `.omo/ulw-loop/evidence/g006-c002-duty-card-collision-correction-20260617.txt`와 `.omo/ulw-loop/evidence/g006-c002-wire-zero-body-residue-20260617.txt`를 따른다.
  - 다음은 seat/category 의미보다 먼저 command table source를 RE한다. 범주 0/1 모두 선택 커밋과 category resolver는 통과했지만 `FUN_004c4a10`이 commandCount 0인 staging을 runtime guard=1로 확정해 `FUN_004f5cb0(category)` 뒤 `rowCountD4=0`이 된다. Positive-control은 같은 native UI 경로가 `record+0x14=2`, `record+0x16={0x002b,0x0041}`이면 행을 만든다는 것을 보였고, raw MsgDat/static scan은 authoritative table을 찾지 못했다. 따라서 실제로 `record+0x14/+0x16`을 채우는 `0x0305/0x0307` nonzero admission shape, `0x034e/0x034f` 카드 캐릭터 read-model, `0x0b01` 전략 이동 명령 계열, 또는 resource decoder/native writer를 찾는다. `0x0707`은 opt-in 후보 바이트일 뿐 client-apply 성공으로 계산하지 않는다.
  - 요새/함대/특수 천체별 constmsg 인덱스와 `byte2` 시각 의미를 복원해 성계 marker와 같은 수준으로 만든다.
  - `0x0313/0x0315` 전송 순서와 스냅샷 guard를 계측해 빈 grid가 먼저 승격되는 경로를 막는다.
  - `LOGH_WORLD_IMPORT_BASES=1`은 base/institution list source 판별에는 통과했지만 current raw를 채우지 못했다. 같은 preload를 성공 증거로 반복하지 말고, v40 기준 `mainState+8` slot store, inline `\\x01name` header init, 그 source의 `+0x320` writer를 찾는다. `0x004b5bd0`은 live `+0x31e` 신호로만 취급하고 완료 증거로 반복하지 않는다.
- v52 기준 실제 보이는 항성 클릭도 아직 유효 명령을 만들지 못한다. `베큘라`/`발할라`의 색상/라벨 렌더는 확인했지만, validator 인자 X가 `0x007b360c` 센티널로 남는다. 다음은 `DAT_007cd04c+0x11178/+0x1117c` writer와 `state.p24ProjX` source를 찾는다.
  - v53 기준 정적 projection callsite는 정상으로 정정했다. 같은 항성 클릭 반복보다 `FUN_004d3580` entry/leave, `0x004d7a80/8c/9c/b13` local/state 값, optional record `+0x08` writer/origin을 우선한다.
  - v54 기준 `FUN_004d3580` entry/leave hook은 쓰지 않는다. click-gated writepoint watcher가 `발할라=(85,22)`, `베큘라=(79,20)` projection을 확인했으므로 다음은 projection 재증명이 아니라 `FUN_004d6310` validator, root current/list, `DAT_007cd04c+0x11178/+0x1117c`, `selectedD5/categoryD6`를 같은 click event id로 묶어 추적한다.
  - v56 기준 projection 재증명도 끝났다. click-gated state-copy watcher가 `발할라` 중심 클릭을 writepoint grid `(87,25)`로 잡았지만, `0x004d7aa9` 직후 `state+0x24`는 `0x007b361c`로 바뀌어 lower validator가 `(0x007b361c,25,-1)`을 검사한다. 다음은 `0x004d7a80` 전후 `sp70` source/caller local writer를 찾는다.
  - v57-v60 기준 위 v56의 `0x007b361c` 판정은 unsafe call-instruction Frida hook artifact로 정정한다. `0x004d7a7b`와 validator 근처 `0x004d7bba/0x004d7bb8/0x004d6310` Frida hook은 쓰지 않는다. return-gated `0x004d3581` watcher에서 projection/copy-state는 정상 X/Y이고, 자연 `발할라` 클릭은 셀 하이라이트와 클라이언트 생존을 보였다. 남은 문제는 자연 클릭 후 command/action state 또는 `0x0b01`이 생성되지 않는 후속 UI 상태 전이다.
  - 요새, 블랙홀, NPC 함대 마커를 별도 객체로 넣고 실제 아이콘/좌표를 검증한다.
  - 성계 하나를 선택했을 때 `0x031d/0x031f`와 행성 정보가 같이 들어와 이름/궤도/경제 패널이 맞는지 확인한다.

### D. UI/채팅 한글화

- 모든 사용자 표시 문구는 한국어로 통일한다. 영어 상태 메시지, 일본어 원문, UI에 맞지 않는 설명문을 남기지 않는다.
- 클라이언트 쪽은 CP949 + HANGEUL charset 패치가 현재 제품급 1차 경로다. UTF-8 직접 포팅은 A/W API shim이 준비될 때까지 별도 트랙으로 둔다.
- 채팅은 전송 인코딩, 서버 보관 인코딩, 클라이언트 표시 인코딩을 분리해 검증한다.
- 해야 할 일:
  - `String.txt`, `MsgDat/*.dat`, 회원가입 포털, 런처, 서버 오류/상태 메시지를 전수 검색한다.
  - 채팅 입력 “한글 테스트/안녕하세요/은하제국”이 왕복 후 깨지지 않는지 실제 클라이언트 두 개 또는 동등한 송수신 하네스로 확인한다.
  - UI 영역에 맞지 않는 문장형 도움말이나 디버그 메시지는 짧은 한국어 UI 문구로 바꾼다.

### E. 실제 상호작용 루프

- 월드가 보이는 것만으로 완료하지 않는다.
- 클릭 가능한 전략 객체가 렌더되고, 클릭 후 클라이언트가 명령을 보내며, 서버 상태가 바뀌고, 다시 클라이언트 화면에 반영되어야 한다.
- 우선 루프:
  - 성계/함대 마커 렌더 확인
  - 함대 또는 성계 선택
  - 실제 command/category resolver가 참조하는 read-model 또는 appointment 경로 확인
  - selection row가 `selected != -1`이 되고 `FUN_004f6b00`/`FUN_004f5cb0`가 호출된 뒤에도 `rowCountD4=0`이 되는 table population 조건 확인
  - `FUN_004c4a10` 이전 staging과 `FUN_004c8700()` runtime category record의 `+0x14/+0x16` 값 및 writer/resource 확인
  - command row `0x2b` 클릭이 만든 SelectGrid object와 child command objects가 존재한다는 v10/v12b 판정을 반복하지 않고, v14b positive-control이 `DAT_009d2a3c=2`에서 confirm branch와 inbound `0x0b01`을 연다는 판정을 출발점으로 삼기
  - `DAT_009d2a3c`를 자연 입력에서 `1->2`로 전이시키는 writer/state transition 확인
  - `DAT_009d2a40` 또는 SendWarpCommand 목적지/대상 필드 writer 확인. v14b의 `sendGridMove(arg1=0xffffffff,arg2=0,arg3=0)`은 유효 명령 payload가 아니라는 점을 유지하기
  - target click/Enter가 `FUN_004b78a0(arg2=0x45) -> 0x0f08/0x0f09` 정보 경로로 빠진다는 v13b 판정을 유지하고, 같은 입력 반복으로 시간을 쓰지 않기
  - 유효 payload로 `0x0b01` 계열 명령 송신 확인
  - 그 뒤에만 `LOGH_RELAY=1`/`LOGH_AUTHORITATIVE=1`로 서버 응답 `0x0b07` 또는 동등 응답 확인
  - 위치/선택/패널 변화 스크린샷 확인

### F. 로비/월드 네이티브 해상도 리마스터

- 목표는 전체 화면을 쓰면서 시스템 해상도 기준으로 UI 좌표와 텍스처를 재배치하는 것이다. 4:3 렌더 비율 보존과 좌우 필러는 더 이상 최종 UX가 아니라 늘어짐 원인 격리용 진단 경로다.
- dgVoodoo2 D3D8 경로를 기본으로 한다.
- 설정 기준:
  - `ScalingMode = centered_ar`
  - `KeepWindowAspectRatio = true`
  - `FullscreenAttributes = fake`
  - 게임의 1024x768 모드 전환이 모니터 전체 스트레치를 유발하지 않게 `Resolution`/`AppControlledScreenMode`를 재검토한다.
- 현재 작업 PC 해상도 조건은 진단 입력일 뿐이다. 최종 확인은 16:9/16:10/4:3 각각에서 네이티브 배치가 늘어지지 않고, 레터박스 없이 실제 화면을 쓰는지로 판단한다.

### G. 전체 RE 문서화

주먹구구식 탐색을 멈추기 위해 모든 대상 파일을 커버리지 행렬로 관리한다.

- 클라이언트 EXE:
  - `G7MTClient.exe`
  - `G7Start.exe`
  - `Gin7UpdateClient.exe`
- DLL:
  - 설치 트리 DLL
  - dgVoodoo 배치 DLL
  - 시스템 의존 DLL 목록
- 데이터:
  - `data/MsgDat/*.dat`
  - `String.txt`
  - `data/model/**/*.mdx`, `.mds`
  - `data/image/**/*.tcf`, `tcf.hed`
  - scenario/session/base/planet/ship 관련 파일

각 항목은 다음 필드를 가진다.

| 필드 | 의미 |
|---|---|
| 파일 | 실제 경로 |
| 해시/크기 | drift 감지용 |
| 포맷 | PE/HFWR/GFWR/MDX/TCF 등 |
| 파서 | 재현 가능한 도구 |
| 클라이언트 소비자 | 함수/VA/메시지 코드 |
| 서버 사용처 | builder/handler/state |
| 증거 등급 | P0/P1/P2/P3 |
| UI QA | 스크린샷/트레이스 |
| 상태 | 완료/부분/미해결 |

### H. 서버/클라이언트 레포 분리

레포 분리는 위 핵심 표면이 고정된 뒤 한다. 지금 상태에서 무작정 나누면 데모 Vite, 실제 클라이언트, 서버, RE 도구 경계가 다시 섞인다.

- 서버 레포 후보:
  - `src/server/`
  - 서버 테스트
  - 콘텐츠 어댑터 중 서버 런타임에 필요한 JSON
  - 프로토콜 문서 중 서버 운용에 필요한 것
- 클라이언트/패키징 레포 후보:
  - 런처
  - 클라이언트 패치/배포 도구
  - 설치 트리 생성/한글화/패키징 도구
  - 클라이언트 QA 도구
- 공통 RE 문서는 어느 쪽에도 복사본을 만들지 말고, 분리 전 소유권을 정한다.

## 4. 반복 루프

모든 작업은 아래 순서로 반복한다.

1. 문서/코드/바이너리 증거를 먼저 읽는다.
2. 실패를 재현하는 실제 클라이언트 QA 또는 RED 테스트를 만든다.
3. 최소 수정한다.
4. 서버 단위 테스트와 문법 검사를 돌린다.
5. 실제 클라이언트로 회원가입 또는 해당 UI 흐름을 다시 탄다.
6. 스크린샷, trace, DB 덤프, EXE SHA 복구 여부를 남긴다.
7. 문서의 상태를 완료/부분/미해결로 갱신한다.

## 5. 금지 사항

- Vite 화면을 게임 클라이언트 검증으로 계산하지 않는다.
- `0x0f08->0x0f09` 메일/HUD 왕복을 전략 플레이로 계산하지 않는다.
- P2/P3 콘텐츠를 원본 서버 데이터라고 쓰지 않는다.
- 깨진 한글을 “폰트 문제”로 단정하지 않는다. 문자열 원천, 코드페이지, wire record, UI 버퍼를 분리해서 본다.
- 클라이언트 EXE 패치 실험 후 SHA 원복 검증 없이 다음 실행으로 넘어가지 않는다.
- `.debug-journal.md`류 RE 장부는 append-only로 다룬다.

## 6. 2026-06-17 루프 추가 기록

- G006 C002 command-table preload v3 probe는 실제 `G7MTClient.exe`에서 compact nonzero `0x0305/0x0307`
  admission이 가능함을 확인했다.
- 서버 probe는 `0x0304`의 정상 empty `0x0305`를 유지하면서 extra `0x0305`를 전송하고, `0x0306`에는
  populated `0x0307`을 직접 응답한다. 이 순서가 empty `0x0307` overwrite를 막았다.
- Frida 결과는 `staging305.count00=1`, `category0.commandCount14=2`, factory `0x002b/0x0041`,
  `staging307.count00=1`을 보였고, `FUN_004c4a10` 이후 runtime도 같은 nonzero 상태가 됐다.
- 아직 완료가 아니다. 같은 세션에서 bottom-right 명령 리스트 클릭은 time sync만 만들었고
  `category-apply` hook, inbound `0x0b01`, mined equivalent command는 없었다.
- 다음 루프는 raw scan 반복이 아니라 nonzero runtime command table 상태에서 실제 menu apply, row hit,
  command dispatcher, `0x0b01` 또는 동등 wire를 추적한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-command-table-preload-v3-20260617.md`,
  `.omo/ui-explorer/session-g006-command-table-preload-probe-v3-47900-20260617/command_table_lifecycle.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-preload-probe-v3-47900-20260617/trace.jsonl`.

### 2026-06-17 루프 추가 기록 v5

- `session-g006-command-table-menu-activation-v5-47900-20260617`에서도 compact nonzero `0x0305/0x0307`는
  `runtime305.category0.commandCount14=2`, factory `0x002b/0x0041`, `runtime307.count00=1`로 승격됐다.
- 실패 지점은 table admission이 아니라 UI 진입점이다. `1146,948`은 우측 시스템 패널을 열고,
  `1146,985`는 화면상 `1. 국가관리` 행을 맞혔다. hit probe stdout 기준 이 대상은 `idB04=11`,
  global-ish rect `x=1084,y=97,w=160,h=16`인 system/info-panel 행이지 `FUN_004f5cb0` command row가 아니다.
- `modeButton24/28` 후보도 전략 모드 버튼이 아니라 우측 상단 `게임 중단`/`사운드 설정` 버튼이었다.
  probe rect는 각각 `1073..1238/875..907`, `1244..1401/875..907`이다.
- category hook은 마지막까지 `categoryResolve=0`, `categoryApply=0`, `rowHit=0`이었고 trace에는
  `0x0300` heartbeat와 서버 선푸시 `0x0b09/0x0b0a`만 남았다. inbound `0x0b01`/`0x0b07`은 없다.
- `direct_category_apply_probe.js`는 작성 후 `node --check`를 통과했지만, attach 시점에는 client PID가 이미
  종료되어 결과를 얻지 못했다. 다음 루프는 월드 진입 직후 이 probe를 먼저 붙인다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-command-menu-activation-v5-20260617.md`,
  `.omo/ui-explorer/session-g006-command-table-menu-activation-v5-47900-20260617/command_table_lifecycle.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-menu-activation-v5-47900-20260617/category0_0356_apply.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-menu-activation-v5-47900-20260617/trace.jsonl`.

### 2026-06-17 루프 추가 기록 v7

- `session-g006-command-table-direct-apply-v7-47900-20260617`에서 직접
  `FUN_004f5cb0(commandMenu,0)` 호출을 월드 진입 직후 수행했다. 결과는 `rowCountD4=2`,
  `categoryD6=0`, factories `0x002b/0x0041`로 positive control과 일치했다.
- command row object 자체도 존재했다. dump 기준 row0은 `idB04=23`, rect `(12,136,91,21)`,
  row1은 `idB04=650`, rect `(113,136,91,21)`이다. 다만 HUD는 apply 직후에도
  `modeF4=1`, `selectionAb0=-1`이었다.
- 화면상 `1. 국가관리`는 direct apply 전부터 보인 별도 system/info-panel row였다. `1146,985`
  클릭 hit-route는 `object=0x133a4f10`, `idB04=11`, rect `1084,977..1244,993`,
  `isMenuRow=false`로 확정됐고 trace는 `0x0f08->0x0f09`만 남겼다. 이것은 전략 명령 루프가 아니다.
- `FUN_005015f0(kind=2)`는 force 전/후 각각 35개 hit를 기록했지만 command row pointer는 0회였다.
  `modeF4=2`, `selectionAb0=0` 강제 후에도 rows는 active hit-test route에 붙지 않았다.
- 판정: table admission, category apply, row object 생성은 통과했다. 현재 blocker는 command row object를
  `0x005025f0`/`FUN_005015f0(kind=2)` active route와 render parent/widget group에 넣는 attach 경로다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-direct-category-apply-v7-20260617.md`,
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/direct_category_apply.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/command_menu_object_dump.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/menu_row_route_only.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/fun5015_command_row.jsonl`,
  `.omo/ui-explorer/session-g006-command-table-direct-apply-v7-47900-20260617/fun5015_after_force_mode.jsonl`.

### 2026-06-17 루프 추가 기록 v8

- `session-g006-row-attach-v8-47900-20260617`에서 v7의 direct apply를 다시 수행했다.
  `rowCountD4=2`, `categoryD6=0`, row0 `idB04=23`, row1 `idB04=650`은 재현됐다.
- row pointer reference scan은 durable refs가 `commandMenu+0x30/+0x34`와 같은 메모리의
  `hud+0x160/+0x164`에만 있음을 보였다. process-wide scan의 row1 refs는 `0x118000..` 범위의
  stack/log scratch성 임시 참조로 보이며 active widget tree 근거가 아니다.
- 정적 `FUN_004f58c0` gate와 대조해 핵심 blocker를 좁혔다. `row_scan_gate_dump`는
  `commandMenu.activePtr=0x0fba0e40`, `activePtr+4=0`, `rowListCount620=0`, `rowBuffer628=null`을
  확인했다. 따라서 row scan 함수가 호출되어도 내부 row loop가 열리지 않는다.
- 진단용으로 `activePtr+4`를 `0->1`로 쓰자 row0/row1이 `FUN_005015f0(kind=2)`에 도달했다.
  하지만 둘 다 `hit=false`였고, `1146,985` 재클릭도 `0x0f08->0x0f09`만 만들었다.
- 판정: 다음 blocker는 command table도 direct apply도 아니다. `commandMenu[0]+4`를 정상적으로 켜는
  native mode/widget 경로와, 그 이후 command row hit 좌표 변환을 찾아야 한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-row-active-gate-v8-20260617.md`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/row_attach_probe.jsonl`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/row_scan_gate_dump.jsonl`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/enable_command_menu_gate_probe.jsonl`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/post_gate_row_hit_probe.jsonl`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/post_gate_row_hit_click_probe.jsonl`,
  `.omo/ui-explorer/session-g006-row-attach-v8-47900-20260617/trace.jsonl`.

### 2026-06-17 루프 추가 기록 v9

- `session-g006-active-gate-v9-47900-20260617`에서 v8의 `+4` 단독 gate를 확장했다.
  `FUN_00502ea0(activePtr,1)`와 `FUN_005024b0(activePtr,1)`를 함께 호출해 active object
  `+4/+5=1`을 만들자 row0/row1 route와 global rect가 잡혔다.
- row0 rect는 `(12,136)..(103,157)`, center `(57,146)`이고 row1 rect는
  `(113,136)..(204,157)`, center `(158,146)`이다. row0 center 클릭은 `selectedD5=0`으로
  바뀌며 `FUN_004f93c0(factoryIndex=43/0x2b, category=0)`를 호출했고 반환값은 `1`이었다.
- 화면은 row0을 `워프 항행` 명령으로 보여 주고 “임의의 그리드로 이동” 설명을 표시했다.
  동시에 다른 명령 라벨 다수는 여전히 `???`로 보여 UI 한글화/문자열 매핑 작업이 남아 있음을
  확인했다.
- 목표 grid 클릭은 거리 표시(`90 LY`)와 `0x0f08->0x0f09` 정보 트래픽만 만들었다.
  관찰 전용 probe에서 `FUN_00581c80` SelectGrid factory, `FUN_0058fef0` command gate,
  `FUN_005737d0` SendWarpCommand는 모두 0회였고, 유일한 send path는
  `FUN_004b78a0(arg1=0,arg2=48,arg3=0,arg4=1)`이었다.
- 판정: C002는 계속 pending이다. v9는 row admission/좌표 문제를 넘어섰지만,
  `FUN_004f93c0(0x2b)`가 실제 SelectGrid factory로 이어지지 않는 새 경계를 남겼다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-gate-pair-v9-20260617.md`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/gate_pair_probe_fixed2.jsonl`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/row_center_click_probe_filtered2.jsonl`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/selectgrid_target_probe.jsonl`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/shots/006-click-57-146.png`,
  `.omo/ui-explorer/session-g006-active-gate-v9-47900-20260617/shots/008-click-833-545.png`.

### 2026-06-17 루프 추가 기록 v10

- `session-g006-factory-return-v10-47900-20260617`에서 v9의 observer timing 문제를 정정했다.
  v10b는 row0 클릭 전에 `0x004f93c0`, `0x00581c80`, `0x0058fef0`, `0x005737d0`,
  `0x004b78a0`을 모두 붙였다.
- runtime `factoryTable=0xc9e2e0`, `slot2b=0x581c80`, `selectGridFactory=0x581c80`로,
  slot `0x2b`는 실제 `FUN_00581c80`이었다.
- row0 center `(57,146)` 클릭은 `FUN_004f93c0(index=43/0x2b, category=0)`에서
  `FUN_00581c80(arg1=0x113108e4,arg2=0xc9e768)`를 1회 호출했다. 반환 object는
  `0x544db60`, vtable `0x6702b8`이고, dispatcher 이후 manager current dialog에 연결됐다.
- 목표 grid click `(833,545)`은 화면에 선택 target과 `90 LY`를 보여 줬지만,
  `FUN_004b78a0(arg2=0x45)`만 탔다. 정적 `FUN_004b78a0` case `0x44` 매핑상 이것은
  `0x0f08/0x0f09` 정보 경로다.
- row0 재클릭, `RETURN`, target 반복 클릭까지 확인했지만 `FUN_0058fef0` command gate와
  `FUN_005737d0` SendWarpCommand는 0회였고, trace에도 inbound `0x0b01`/outbound `0x0b07`은 없다.
- UI는 아직 완성되지 않았다. `워프 항행`과 일부 도움말은 한국어로 보이지만, command label 다수가
  `???`이고 tooltip의 MCP/time 문구도 placeholder처럼 보인다.
- 판정: C002는 계속 pending이다. 다음 루프는 factory slot이나 row admission이 아니라 SelectGrid object
  `0x544db60`의 vtable/child pointers `+0x40/+0x44/+0x48/+0x4c`가 target/confirm을 어디로 라우팅하는지
  hook한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-factory-return-v10-20260617.md`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/factory_return_probe_v10b.jsonl`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/trace.jsonl`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/shots/007-v10-target-grid.png`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/shots/008-v10-confirm-warp-button.png`,
  `.omo/ui-explorer/session-g006-factory-return-v10-47900-20260617/shots/012-v10-target-click-repeat-b.png`.

### 2026-06-17 루프 추가 기록 v12b

- `session-g006-selectgrid-v12b-47900-20260617`에서 v10의 다음 과제였던 SelectGrid child/command-object
  존재 여부를 실클라로 확인했다. row0 center `(57,146)` 클릭은 다시
  `FUN_004f93c0(index=0x2b, category=0)`에서 `FUN_00581c80`을 호출했고, current dialog는
  SelectGrid root `0x551db60` vtable `0x6702b8`이 됐다.
- Arena scan은 `ReceiveResult 0x551d930/0x551dd70(p28=0xb07,p2c=0xb01)`,
  `GoReceive 0x551d9a0(slot2=0x581570)`, `SendWarpCommand 0x551d9d0(vtable 0x676aec,
  slot2=0x5737d0)`, `SelectGrid.targetRoot 0x551dac0(slot2=0x570a10)`,
  `TargetGrid.child 0x551dae8(slot3=0x573cd0)`를 찾았다. 즉 “객체가 없다”가 아니라
  “객체는 있으나 target/confirm 이벤트가 그 slot으로 들어가지 않는다”가 현재 판정이다.
- target click `(833,545)`은 화면상 target과 `90 LY`를 표시했지만, trace는 두 차례
  `0x0f08->0x0f09`만 남겼다. Frida에서 확인된 실제 경로도 `FUN_004b78a0(arg2=0x45)`이며,
  `FUN_0058fef0`, `FUN_005737d0`, `TargetGrid.child slot3 0x573cd0`, `sendGridMove 0x004b48d0`,
  inbound `0x0b01`, outbound `0x0b07`은 없었다.
- 판정: C002는 계속 pending이다. 다음 루프는 좌표/command table/direct apply/active gate/factory slot/object scan
  반복이 아니라 `FUN_00570a10`, `FUN_00573cd0`, `FUN_005737d0`, `FUN_005751b0` 주변의
  target-confirm 조건과 실제 confirm 입력 경로를 분리한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-selectgrid-child-v12-20260617.md`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/selectgrid_v12b_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/selectgrid_v12b_arena_scan.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/selectgrid_v12b_click_path_hooks.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/trace.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/shots/007-v12b-row0-center-after-probe.png`,
  `.omo/ui-explorer/session-g006-selectgrid-v12b-47900-20260617/shots/008-v12b-target-grid.png`.

### 2026-06-17 루프 추가 기록 v14b

- `session-g006-selectgrid-v14-positive-control-47900-20260617`에서 v13b의 `DAT_009d2a3c=1` blocker를
  positive-control로 분리했다. target click `(833,545)`은 v13b처럼 `90 LY` 상태를 만들었고,
  그 뒤 Frida가 `DAT_009d2a3c=2`를 단발 주입했다.
- 주입 전 값은 `DAT_009d2a34=257`, `DAT_009d2a3c=1`, `DAT_009d2a40=0xffffffff`,
  `DAT_009d2a74=0`, `DAT_009d2a7c=0`이었다. 주입 뒤 `FUN_00570a10`은 return `3`을 냈고,
  확인창이 열렸다. Confirm click은 `SendWarpCommand` slot2 `0x005737d0`, `sendGridMove`
  `0x004b48d0`, `sendCorrelator arg2=0x3b`으로 이어졌다.
- 서버 trace는 inbound `0x0b01`을 기록했다. 다만 이번 safe run은 `LOGH_RELAY`와
  `LOGH_AUTHORITATIVE`를 의도적으로 켜지 않았으므로 응답은 generic `0x0b02`였다. 이것은
  command engine의 `0x0b01->0x0b07` 구현 부재가 아니라, relay/authoritative path 미사용이다.
- 아직 완료가 아니다. `DAT_009d2a40`은 계속 `0xffffffff`였고 `sendGridMove` 인자는
  `arg1=0xffffffff,arg2=0,arg3=0`이었다. 따라서 최신 blocker는 자연 `DAT_009d2a3c` writer와
  유효 목적지/대상 writer다. 유효 payload를 잡은 뒤에만 `LOGH_RELAY=1`/`LOGH_AUTHORITATIVE=1`로
  `0x0b07` end-to-end를 검증한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-d2a3c-positive-control-v14b-20260617.md`,
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/selectgrid_v14b_force_d2a3c2_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/trace.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/shots/008-v14b-after-force-d2a3c2.png`,
  `.omo/ui-explorer/session-g006-selectgrid-v14-positive-control-47900-20260617/shots/009-v14b-confirm-warp-decision.png`.

### 2026-06-18 루프 추가 기록 v21-v26

- `session-g006-selectgrid-v20-normal-earlygrid-47900-20260617`에서 v14b 이후의 자연 writer/state transition을
  다시 분해했다. `DAT_009d2a30`은 state base이고, `DAT_009d2a34=state+0x04`,
  `DAT_009d2a3c=state+0x0c`, `DAT_009d2a40=state+0x10`이다.
- v21은 left-click writer branch가 실제로 도달 가능함을 확인했다. `0x004d7acc` phase gate와
  `0x004d7afc` left flag gate를 지나 `writerBranch-validator-call-004d7b13`이 1회 발생했다. 하지만
  자연 validator 인자는 `x=0,y=0,range=5`였고, `writerBranch-validator-passed`, target raw write,
  phase-2 write는 없었다.
- v22는 projection writer가 활성이라는 점과 동시에 잘못된 값을 넣고 있다는 점을 보였다.
  `0x004d7a7b -> FUN_004d3580` 뒤 `0x004d7a8c/0x004d7a9c`가
  `state+0x24=8074780 (0x007b360c)`, `state+0x28=0`을 반복해서 썼다.
- v23은 너무 늦은 `0x004d7b13` patch라 validator 인자를 바꾸지 못했고, v24는 `0x004d7b05`에서
  `(42,25)`를 미리 넣었지만 pass/target/phase2가 없었다. v25 function-entry hook은 return address와
  stack 해석이 섞였으므로 판정 근거로 쓰지 않는다.
- v26 call-site hook은 forced `(42,25,5)`가 실제 `0x004d7b13` stack argument로 들어간 것을 확인했지만,
  return-site `0x004d7b18`에 도달하기 전 클라이언트가 죽었고 trace는 `socket-error read ECONNRESET`을
  남겼다. 따라서 forced coordinate 주입은 안전한 진행 경로가 아니라 실패 증거다.
- 다음 루프는 `FUN_004d3580`과 upstream `0x004b25a0`, mouse globals `0x22143dc/0x22143e0`, 그리고
  `FUN_004d6310`의 기대 target 표현을 정적으로 먼저 확정한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-selectgrid-writer-branch-v21-v26-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-selectgrid-writer-branch-v21-v26-cleanup-20260618.txt`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v21_writer_branch_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v22_projection_writer_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v26_callsite_return_probe.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/trace.jsonl`.

### 2026-06-18 루프 추가 기록 v27

- v21-v26 결론을 정정했다. v22의 `state+0x24=0x007b360c,state+0x28=0`은 mid-function/caller-stack 계측에
  의존하므로 다음 주 blocker로 삼지 않는다. 해당 관측은 역사적 증거로 유지하되, safer function-level
  projection probe와 정적 수식이 우선한다.
- 정적 기준으로 `FUN_004d3540`은 grid-to-world, `FUN_004d3580`은 world-to-grid 역변환이다.
  핵심 수식은 `gridX=ftol(worldX+50.0)`, `gridY=ftol(25.0-worldZ)`이며 `0x005ff374`는 x87 `ftol` helper다.
- v20 strict projection probe는 자연 세션에서 `DAT_007cd04c+0x11178`이 raw `0`, camera/focus가
  `(-49.5,24.5)` top-left에 남아 있음을 보였다. 그래서 mouse `(830,542)`는 `(1,0)`,
  `(717,546)`은 `(0,0)`으로 투영된다.
- raw-only positive-control은 `DAT_007cd04c+0x11178`을 `2539`로 바꿨지만 다음 projection은 계속 `(0,0)`이었다.
  즉 raw force는 validator reference만 바꾸고 camera/focus를 움직이지 않는다.
- 다음 작업은 서버 outbound `0x0323`/`0x0356`/`0x0f06`/account-character profile 중 어떤 필드가 native
  `DAT_007cd04c+0x11178`과 `FUN_004d4e90`/`FUN_004d5030` focus writer를 초기화해야 하는지 찾는 것이다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-projection-camera-v27-20260618.md`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v20_projection_strict.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-v20-normal-earlygrid-47900-20260617/selectgrid_v20_current_raw_positive.jsonl`,
  `.omo/ghidra/export/G7MTClient/functions.jsonl`, `.omo/f_4d6b70.c`.

### 2026-06-18 루프 추가 기록 v28

- v27의 "현재 위치 raw와 focus 초기화 경로"를 클라이언트 정적/서버 outbound 양쪽에서 다시 대조했다.
- 바이너리 immediate scan 기준 `0x00011178` 참조는 6개뿐이며 모두 `DAT_007cd04c+0x11178` read다.
  직접 store 패턴 `a3/c705/890d/8915 4c d0 7c 00`은 0회였다.
- `0x0317 ResponseInformationGrid`는 단일 current grid dword record이지만, `FUN_004ba2b0` case `0x0317`의
  landing field가 `clientBase+0x35f358`으로 확인됐다. 따라서 `0x0317`을
  `DAT_007cd04c+0x11178` writer나 fix로 취급하지 않는다.
- `FUN_004d3a40`은 `pbVar10 = DAT_007cd04c+8`에서 시작해 100x50 grid를 돌며 `0x0e` stride로 이동한다.
  이것은 `DAT_007cd04c` 확장맵 구조의 writer/initializer 후보지만, `+0x11178` 자체를 쓰는 증거는 아니다.
- `FUN_004d4e90`, `FUN_004d5030`, `FUN_004d6310`, `FUN_0057bbc0`, `FUN_0058d140`, `FUN_0058ee70`은
  현재 증거상 consumer/read path다. `+0x1117c`는 count, `+0x11180`은 `0x60` stride list base로 읽힌다.
- 서버 구현상 `0x0313/0x0315`는 clientBase 전략 grid/object table, `0x0323`/`0x0325`/`0x0356`/
  `0x0b09`/`0x0b0a`는 위치/링크 후보이지만 `DAT_007cd04c+0x11178` 직접 fill 증거는 없다.
- 다음 런타임은 speculative default push가 아니라 watchpoint/timeline이다. baseline, `LOGH_GRID_ENTER=1`,
  `LOGH_POSTLOAD_PLAYER_RECORD=1`, `LOGH_POSTLOAD_RICH_CHARACTER=1`을 분리하고 `0x0f06`, `0x0b09`,
  `0x0325`, `0x0323`, `0x0356`, `0x0b0a` 직후 `DAT_007cd04c+0x11178`과 camera/focus writer 호출을
  동시에 덤프한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-current-grid-raw-v28-20260618.md`,
  `.omo/ghidra/export/G7MTClient/functions.jsonl`, `.omo/ghidra/bin/G7MTClient.exe`,
  `src/server/logh7-login-session.mjs`, `docs/logh7-info-records-wire.md`,
  `docs/logh7-strategic-map-wire.md`.

### 2026-06-18 루프 추가 기록 v29

- v28 watchpoint/timeline을 반복 실행할 수 있도록 `tools/logh7_current_grid_watch.py`와
  `tools/tests/test_logh7_current_grid_watch.py`를 추가했다.
- 새 도구는 UI explorer 세션의 `session.json`에서 `clientPid`를 읽거나 `--pid`로 받은 프로세스에 Frida를
  attach하고, `DAT_007cd04c+0x11178/+0x1117c/+0x11180/+8`, camera/focus globals, `FUN_004d3a40`,
  `FUN_004d4e90`, `FUN_004d5030`, `FUN_0057bbc0`, `FUN_0058d140`, `FUN_0058ee70` 진입/복귀를 JSONL로
  기록한다.
- 이 도구는 관측 전용이다. `DAT_007cd04c+0x11178`을 force하지 않고, `0x0317`을 fix로 취급하지 않으며,
  candidate packet family를 writer라고 주장하지 않는다. camera/focus globals는 float로 읽도록 수정했다.
- 검증: red-first focused test가 모듈 부재로 실패한 뒤, 구현 후 `python -m unittest
  tools.tests.test_logh7_current_grid_watch`가 통과했다. `python tools/logh7_current_grid_watch.py --help`와
  `python -m tools.logh7_current_grid_watch --help`도 통과했다. 전체 Python 도구 테스트 `npm run test:tools`는
  247개 통과.
- baseline 실클라 run을 로그인 전 attach로 실행했다. Trace는 `0x0325`, `0x0323`, `0x0f06->0x0f07`까지
  도달했지만 watcher summary는 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero sample,
  `FUN_004d4e90` 후 camera/focus `(-49.5,0,24.5)`를 기록했다. hook failure는 0, watcher event는 2086개다.
- baseline cleanup은 `shaVerified=true`, baseline server/client PID 종료, `4787/47900/47901` LISTENING 없음이다.
  float 수정 뒤 `npm run test:tools`는 다시 247개 통과.
- `LOGH_GRID_ENTER=1` 실클라 run도 로그인 전 attach로 실행했다. Trace는 `0x0f06->0x0f07` 뒤 `0x0b09`,
  `0x0b0a`까지 도달했지만 watcher summary는 6188 event 전체에서 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`,
  `+0x11180` zero sample, `+8` zero sample을 기록했다. `FUN_004d4e90`/`FUN_004d5030`은 각각 1회,
  `FUN_0058ee70`은 3086회 enter/leave였고 camera/focus는 `(-49.5,0,24.5)` 그대로다.
- grid-enter cleanup은 `shaVerified=true`, grid-enter server/client PID 종료, `4787/47900/47901` LISTENING 없음이다.
- `LOGH_GRID_ENTER=1 + LOGH_POSTLOAD_PLAYER_RECORD=1` 실클라 run도 로그인 전 attach로 실행했다. Trace는
  `0x0f06->0x0f07` 뒤 `0x0b09`, 추가 `0x0325`, 추가 `0x0323`, `0x0b0a`까지 도달했지만 watcher summary는
  5750 event 전체에서 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`, `+0x11180` zero sample, `+8` zero sample을
  기록했다. `FUN_004d4e90`/`FUN_004d5030`은 각각 1회, `FUN_0058ee70`은 2867회 enter/leave였고
  camera/focus는 `(-49.5,0,24.5)` 그대로다.
- player-record cleanup은 `shaVerified=true`, player-record server/client PID 종료, `4787/47900/47901`
  LISTENING 없음이다.
- `LOGH_GRID_ENTER=1 + LOGH_POSTLOAD_RICH_CHARACTER=1` 실클라 run도 로그인 전 attach로 실행했다. Trace는
  `0x0f06->0x0f07` 뒤 `0x0b09`, 추가 `0x0325`, 추가 `0x0323`, `0x0b0a`, compact `0x0356`, `0x1200`,
  `0x1202`, `0x1201`까지 도달했지만 watcher summary는 4336 event 전체에서 `DAT_007cd04c+0x11178=0`,
  `+0x1117c=0`, `+0x11180` zero sample, `+8` zero sample을 기록했다. `FUN_004d4e90`/`FUN_004d5030`은
  각각 1회, `FUN_0058ee70`은 2160회 enter/leave였고 camera/focus는 `(-49.5,0,24.5)` 그대로다.
- rich-character cleanup은 `shaVerified=true`, rich-character server/client PID 종료, `4787/47900/47901`
  LISTENING 없음이다.
- v29 분리 server-delivery 후보는 모두 current raw/list를 채우지 못했다. 다음 실클라 작업은 같은 서버 플래그
  반복이 아니라 `DAT_007cd04c` 구조의 allocator/initializer/writer 정적/런타임 탐색이다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-current-grid-watch-v29-20260618.md`,
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

### 2026-06-18 루프 추가 기록 v30-v31

- `tools/logh7_global_slot_watch.py`와 `tools/tests/test_logh7_global_slot_watch.py`를 추가했다. 이 도구는
  Frida `MemoryAccessMonitor`, `DAT_007cd04c/DAT_007cd048` polling, `FUN_004e8540`, `FUN_004c8a90`,
  `FUN_004d3a40`, `FUN_004d6b70`, `FUN_004fef90` hook snapshot을 결합한다.
- v30/v30b는 로그인/로비 상태에서 멈춘 불완전 시도라 completion evidence로 쓰지 않는다. v30c stage2는 safe env에서
  `게임 시작` 뒤 캐릭터 row를 클릭해 `0x0f07`까지 도달했다.
- v30c stage2 핵심 타임라인: `0x0f02`는 `2026-06-18T01:42:11.578Z`, `0x0325/0x0323/0x0f03` extra는
  `01:42:11.584Z..01:42:11.587Z`, root `DAT_007cd04c=0xf5e7918`은 `01:42:12.139Z`, guard
  `DAT_007cd048=1`은 `01:42:12.327Z`, `FUN_004d3a40` 진입은 `01:42:12.352Z`, `0x0f06`은
  `01:42:12.372Z`다. 따라서 `FUN_004d3a40`은 root writer가 아니라 root 생성 뒤 consumer/initializer다.
- v30c의 `MemoryAccessMonitor`는 watched page에서 `0x4e971a` read 1회만 잡았고 write는 0회다. polling으로는
  null->non-null transition을 봤으므로, page monitor만으로 writer를 찾지 못했다.
- `tools/logh7_heap_slot_watch.py`와 `tools/tests/test_logh7_heap_slot_watch.py`를 추가했다. 이 도구는
  `FUN_00648d42`, `_malloc` wrapper `0x005ffab7`, `__nh_malloc` `0x005ffac9`, HeapAlloc wrappers
  `0x005ffaf5/0x005ffc34`, `kernel32!HeapAlloc`, `kernel32!VirtualAlloc`을 hook하고 root slot을 polling한다.
- v31b stage2는 `0x0f07`까지 도달했고 178개 allocation event를 기록했지만, root `0xf5f0918` exact match와
  near match가 모두 0이었다. root는 `2026-06-18T01:51:44.227Z`, guard는 `01:51:44.687Z`에 나타났다.
- v31c wide retry는 `0x0f07`에 도달하지 못했다(`matched=false`, `seen=19`). row click 당시 UI가 lobby/server notice
  상태였으므로 incomplete scenario로 분류한다. cleanup은 canonical playable SHA `shaVerified=true`, 게임/Frida/Python
  watcher 프로세스 없음, `4787/47900/47901` listener 없음이다.
- 검증: `python -m unittest tools.tests.test_logh7_global_slot_watch tools.tests.test_logh7_heap_slot_watch
  tools.tests.test_logh7_current_grid_watch`는 6개 통과, `py_compile` 통과, installed `ruff` 통과.
- C002는 pending이다. 다음 discriminator는 더 많은 서버 push가 아니라 `0x0f02->0x0f06` 사이 computed writer 탐색이다.
  우선 `memcpy`/`memmove`/`memset` overlap hook을 `0x007cd040..0x007cd060`에 걸고, 동시에 world-init handler boundary를
  binary search한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-global-heap-slot-v30-v31-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-global-heap-slot-timeline-v30-v31-20260618.json`,
  `.omo/ulw-loop/evidence/g006-c002-global-slot-watch-v30c-stage2-summary.json`,
  `.omo/ulw-loop/evidence/g006-c002-heap-slot-watch-v31b-summary.json`,
  `.omo/ulw-loop/evidence/g006-c002-heap-slot-watch-v31c-cleanup.txt`,
  `tools/logh7_global_slot_watch.py`, `tools/logh7_heap_slot_watch.py`.

### 2026-06-18 루프 추가 기록 v32-v33

- v30/v31의 다음 판별로 `tools/logh7_global_page_write_watch.py`와
  `tools/logh7_global_page_guard_watch.py`를 추가했다.
- v32 copy/fill overlap watcher는 safe env에서 `0x0f07`까지 도달했고
  `DAT_007cd04c=0xf5e7918`, `DAT_007cd048=1` 변화를 확인했지만, 감시 범위
  `0x007cd040..0x007cd060`에 대한 `overlap-write`는 0개였다.
- v33 page-guard watcher는 `0x007cd000` page write fault 26개를 기록했고, 감시 범위 target hit 2개를
  잡았다. 루트 슬롯 write는 `2026-06-18T02:11:15.593Z`의
  `EIP=0x004c8a23`, `memory=0x007cd04c`였고, 다음 poll에서
  `DAT_007cd04c=0xf5f1918`이 보였다.
- `0x004c8a23`은 `FUN_004c8a10` 내부 `*(undefined4 *)(param_1 + 4) = param_2` 대입이다.
  fault 시점의 `param_1`은 `0x007cd048` 전역 상태 객체이므로, 이 명령이 `DAT_007cd04c`
  root pointer writer다.
- 두 번째 target hit `0x004c8bd0 -> 0x007cd050`은 `FUN_004c8bc0`의 후속 field/table 초기화다.
  root writer가 아니라 root 대입 뒤 인접 슬롯 초기화로 분류한다.
- root writer는 찾았지만 C002는 아직 pending이다. root 대입 뒤에도 `currentRaw11178=0`,
  `listCount1117c=0`이었고, guard가 `1`이 된 뒤에도 native current-grid/list가 채워졌다는 증거가 없다.
- 다음 작업은 `FUN_004c8a10` entry args와 `param_2` 출처, `FUN_004d3bd0`/`FUN_004c8bc0`/
  `FUN_004d3a40` 전후 root field snapshot을 잡아 `+0x11178/+0x1117c/+0x11180` writer를 찾는 것이다.
  native root contents가 확인되기 전에는 서버 payload 변형 반복을 완료 증거로 세지 않는다.
- v33 cleanup은 canonical playable SHA `shaVerified=true`, 게임/Frida/Python watcher 프로세스 없음,
  `4787/47900/47901` listener 없음이었다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-pageguard-v32-v33-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-pagewrite-v32-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-pageguard-v33-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-pageguard-v33-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-pageguard-v33-cleanup.txt`,
  `tools/logh7_global_page_write_watch.py`,
  `tools/logh7_global_page_guard_watch.py`.

### 2026-06-18 루프 추가 기록 v34

- `tools/logh7_root_init_watch.py`와 `tools/tests/test_logh7_root_init_watch.py`를 추가했다. 이 도구는
  `FUN_004c8a10`, `FUN_004d3bd0`, `FUN_004c8bc0`, `FUN_004d3a40`, `FUN_004b64c0`,
  `FUN_004c4170` entry/leave에서 root fields, caller args, `DAT_007c1b4c+0x2a418` snapshot을 남긴다.
- red-first test는 모듈 부재로 실패했고, 구현 후 root-init 단독 2 tests OK, watcher 묶음 12 tests OK,
  `py_compile` OK, installed Ruff OK였다. `tools/logh7_root_init_watch.py` pure LOC는 182다.
- v34 safe 실클라 run은 `0x0f07`을 `2026-06-18T02:19:43.098Z`에 도달했고 watcher event 22개를
  기록했다.
- `FUN_004c8a10` entry에서 `ecx=0x007cd048`, `rootParam2=0xf5ef918`, `stackArg2=0xf34a020`이었다.
  이때 `rootParam2Fields`는 이미 `byte0=1`, `currentRaw11178=0`, `listCount1117c=0`, grid head zero였다.
- `FUN_004d3bd0` entry/leave, `FUN_004c8bc0` entry/leave, `FUN_004d3a40` entry/leave 모두
  `currentRaw11178=0`, `listCount1117c=0`, grid head zero를 유지했다. `FUN_004c8a10` leave에서 guard는
  1이 됐지만 current/list는 채워지지 않았다.
- 따라서 root pointer writer와 post-root initializer 경계는 더 이상 blocker가 아니다. 남은 blocker는
  `FUN_004c8a10`에 전달되는 `rootParam2` 객체가 이미 empty 상태로 들어오는 이유와, 그 객체가 원래 어디서
  채워져야 하는지다.
- 다음 판별은 `FUN_004c4170` 내부 `FUN_004b5bb0 -> FUN_004c45f0(uVar2,2)` 경계, 그리고
  `FUN_004b64c0` entry의 `edx` root candidate를 잡은 즉시 root object page/range guard를 거는 것이다.
- v34 cleanup은 canonical playable SHA `shaVerified=true`, 게임/Frida/Python watcher 프로세스 없음,
  `4787/47900/47901` listener 없음이었다. `47900` TIME_WAIT만 남았다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-root-init-v34-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-wait-0f07.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-init-v34-cleanup.txt`,
  `tools/logh7_root_init_watch.py`,
  `tools/tests/test_logh7_root_init_watch.py`.

### 2026-06-18 루프 추가 기록 v37

- `tools/logh7_root_init_watch.py`를 확장해 `0x0048fb80`
  `commandCreateOutfitParser-0048fb80` hook과 `mainState+8` source sampler를 추가했다.
  `mainStateFields`는 이제 `currentSourcePtr8`과 `currentSourceFields.source+0x31c/+0x31d/+0x31e/+0x319/+0x31a/+0x31b/+0x320/+0x321`을 남긴다.
- red-first test는 generated JS에 `0x0048fb80`, `currentSourcePtr8`, `currentSource320`,
  `commandCreateOutfitParser-0048fb80`이 없어 실패했다. 구현 후
  `python -m unittest tools.tests.test_logh7_root_init_watch`가 2 tests OK였고,
  watcher pure LOC는 233으로 유지했다.
- v37 실클라 세션은 canonical playable SHA
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`로 실행했다. safe flags와
  `LOGH_WORLD_IMPORT_BASES=1`을 함께 켰고, forbidden flags
  `LOGH_NPC_AI/LOGH_RELAY/LOGH_AUTHORITATIVE/LOGH_DUTY_CARDS/LOGH_ROSTER_PUSH/LOGH_STRAT_GRID_EARLY`는
  absent였다.
- 서버 trace는 로비 `0x2004/0x2006`, 캐릭터 선택 뒤 새 gameplay connection, `0x0f06->0x0f07`,
  post-load `0x0b09`, `0x0325`, `0x0323`, `0x0b0a`, `0x0356`, `0x1200`, `0x1202`, `0x1201`까지
  도달했다. `wait-trace --code 0x0f07` 사후 호출의 `matched=false`는 이미 이동한 trace offset 뒤만 본
  결과이며, row-click/전체 trace에는 `0x0f07`이 있다.
- 핵심 watcher 결과: `FUN_004c4170` entry에서 `mainState=0xf345020`,
  `currentSourcePtr8=0xf34502c`, `currentSourceFields.currentSource320=0`이었다.
  이어진 `FUN_004b5bb0` return도 0이고, `FUN_004c4170` leave에서
  `mode126710_u32=513`, `modeByte126711=2`, `field126714_u32=0`,
  `strategyCurrent2b6a70=0`, root `currentRaw11178=0`, `listCount1117c=4`였다.
- 같은 watcher run에서 `commandCreateOutfitParser-0048fb80-enter/leave`는 없었다. 따라서 현재 wire order에서
  `mainState+8` source object의 `+0x320`이 `FUN_0048fb80`으로 채워진다는 가설은 반박된다.
- 화면은 전략 화면까지 진입했지만 하단 패널은 `NO DATA`로 남았다. C002는 pending이다. 다음은
  `mainState+8` source object `+0x320` writer/parser를 정적/런타임으로 추적한다.
- cleanup은 `shaVerified=true`, `G7MTClient.exe` 없음, watcher PID 없음, `frida.exe` 없음,
  `47900` LISTENING 없음이었다. `47900` TIME_WAIT만 남았다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-root-current-v37-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-trace-all.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-row1-first.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-stop.json`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v37-cleanup.txt`,
  `.omo/ui-explorer/session-g006-root-current-v37-47900-20260618/shots/005-v37-row1-first.png`,
  `tools/logh7_root_init_watch.py`,
  `tools/tests/test_logh7_root_init_watch.py`.

### 2026-06-18 루프 추가 기록 v38

- canonical playable `G7MTClient.exe` SHA
  `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`에서 `+0x320`
  memory displacement 참조를 다시 스캔했다. 참조는 7개뿐이다:
  `0x0040a816`, `0x0048dea8`, `0x0048e3eb`, `0x0048ff92`, `0x0049086b`,
  `0x00490dcb`, `0x004a4cc8`.
- 정적/direct reference 대조로 `0x0048fb80`은 CreateOutfit binary parser, `0x0048ffd0`은 인접
  text/INF-style parser body로 분리했다. `0x0048ffd0` 자체가 정답이라는 뜻은 아니지만, 그 함수 범위에는
  생성자 외부 `+0x320` byte write site `0x0049086b`가 있어 가벼운 부정 판별점으로 볼 가치가 있었다.
- `tools/logh7_root_init_watch.py`에
  `commandCreateOutfitTextParser-0048ffd0` hook을 추가했다. red-first test는 generated JS에
  `0x0048ffd0`과 label이 없어 실패했고, 구현 뒤 `python -m unittest tools.tests.test_logh7_root_init_watch`가
  2 tests OK였다. 이어 watcher 관련 unittest 12개, `py_compile`, standalone `ruff check`도 통과했다.
- v38 실클라 세션은 안전 플래그와 `LOGH_WORLD_IMPORT_BASES=1`만 사용했다. 금지 플래그
  `LOGH_NPC_AI`, `LOGH_RELAY`, `LOGH_AUTHORITATIVE`, `LOGH_DUTY_CARDS`, `LOGH_ROSTER_PUSH`,
  `LOGH_STRAT_GRID_EARLY`는 없었다. trace는 로비, 캐릭터 선택, gameplay connection,
  `0x0f06->0x0f07`, post-load `0x0b09/0x0325/0x0323/0x0b0a/0x0356/0x1200/0x1202/0x1201`까지 도달했다.
- 핵심 런타임 결과는 v37과 같은 실패 양상이다. `fieldImport-004c4170-enter`에서
  `currentSourcePtr8=0xf34002c`, `currentSourceFields.currentSource320=0`,
  `field126714_u32=0`, `strategyCurrent2b6a70=0`, root `currentRaw11178=0`,
  root `listCount1117c=0`이었다. leave에서는 `mode126710_u32=513`,
  `field126714_u32=0`, `strategyCurrent2b6a70=0`, root `currentRaw11178=0`,
  root `listCount1117c=4`였다.
- `commandCreateOutfitParser-0048fb80-enter/leave`와
  `commandCreateOutfitTextParser-0048ffd0-enter/leave`는 모두 0회였다. 따라서 현재 wire order에서
  `[mainState+8]+0x320`은 두 CreateOutfit parser 후보로 채워지지 않는다.
- C002는 pending이다. 다음 실행은 서버 payload를 늘리는 것이 아니라 `[mainState+8]` source object가
  만들어지는 생성자/vtable 설정 경로와 `0x0049086b` 같은 parser 외부 `+0x320` writer가 실제 live source에
  닿는지 판별한다.
- 정리는 canonical SHA 복구, `G7MTClient.exe` 없음, watcher Python 없음, Frida helper 없음,
  `4787/47900/47901` LISTENING 없음으로 끝났다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-20260618-watcher.stdout.txt`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v38-cleanup.txt`,
  `.omo/ui-explorer/session-g006-root-current-v38-47900-20260618/shots/005-v38-after-row1.png`,
  `tools/logh7_root_init_watch.py`,
  `tools/tests/test_logh7_root_init_watch.py`.

### 2026-06-18 루프 추가 기록 v39-v41

- v39는 `[mainState+8]` 자체의 정체를 정정했다. live `fieldImport-004c4170` entry에서
  `[mainState+8]=mainState+0xc`였고 source head는 `016e616d65...`(`\x01name`)였다.
  따라서 이전의 `sourceVtable=0x6d616e01` 해석은 vtable이 아니라 inline data head다.
  `currentSource320=0`, `field126714_u32=0`, `strategyCurrent2b6a70=0`,
  root `currentRaw11178=0`, `listCount1117c=4`였고 factory/parser hook은 0회였다.
- v40은 주변 constructor/setter/accessor cluster를 붙였지만, live 1회 호출된
  `0x004b5bd0`은 source `+0x31e` setter일 뿐 `+0x320` writer가 아니었다.
  `0x004b6000`, `0x004b5cf0`, `0x004b5db0`, `0x004b5e80`은 attach 이후 0회였다.
- v41은 `0x004c2a80` wrapper와 `0x004c2c80` import/copy path를 따라 source `+0x320`
  출처를 좁혔다. `0x004c2c80`은 `0x00771074` `"name"`을 이용해 inline `\x01name`
  source를 만들고, optional record가 있을 때 source `+0x318` 블록을 복사한다.
  이 복사 때문에 source `+0x320`은 optional record `+0x08`에서 온다.
- v41 watcher는 `sourceImportCallsite-004b780e-hit`에서
  `[mainState+8]=mainState+0xc`가 `0x004b780e` 이전에 이미 성립함을 보였다.
  `sourceOptionalCopyAfter-004c2f18-hit`에서는 `source320MatchesOptional08=true`,
  `predictedSource320=0`, `optionalRecordPlus08=0`, `sourceHeadHex=016e616d65...`였다.
- C002는 계속 pending이다. 다음 pass는 `0x0048fb80`, `0x0048ffd0`, factory wrapper,
  `0x004b5bd0`, `0x004c2a80/0x004c2c80/0x004c2f18` 반복이 아니라 optional record
  생성/채움 경로와 optional record `+0x08`의 원본 nonzero 기대값, 그리고
  `[mainState+8] = mainState+0xc` slot writer를 추적한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-root-current-v39-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-root-current-v40-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-20260618.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-trace.jsonl`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v41-cleanup.txt`,
  `tools/logh7_source_import_watch.py`,
  `tools/tests/test_logh7_source_import_watch.py`.

### 2026-06-18 루프 추가 기록 v42-v45

- `tools/logh7_source_import_watch.py`는 `FUN_004301d0` character record parser,
  `FUN_00419ca0` unit table parser, `primaryUnit24`, unit parser count/id snapshot을 기록하도록
  보강했다.
- 정적 disasm상 `FUN_00419ca0`은 native output에서는 count를 `+0`, unit0 id를 `+4`에 두지만
  wire stream에서는 count 뒤 unit id를 바로 읽는다. 서버 builder에는 이를 위해
  `wireLayout: "parser-stream"` 옵션을 추가했다.
- v42 baseline은 early native `0x0325`가 parser에서 count=256/unit0=256으로 읽히고,
  early source import가 optional unit index 1/id0으로 빗나간다는 것을 확인했다.
- v43/v44는 `LOGH_UNIT_STREAM_WIRE=1`을 early까지 전역 적용했다. unit parser는
  count=1/unit0=1을 정확히 읽었지만 exact-count branch `0x004bb15c -> 0x004bb179`로
  진입한 뒤 클라이언트가 ECONNRESET으로 종료됐다. `LOGH_FULL_UNIT_LOCATION` 유무와 무관했다.
- v45는 `LOGH_POSTLOAD_UNIT_STREAM_WIRE=1`만 켜고 global parser-stream과 full-unit-location을
  껐다. early native-safe `0x0325`는 유지했고, postload `0x0325`만 parser-stream으로
  replay했다. 결과적으로 전략 HUD는 안정적으로 유지됐고 postload source import는 primary id=1,
  `primaryUnit24=1`, optional unit0 id=1, optionalUnitIndex=0으로 맞았다.
- v45에서도 `optionalRecord+8`은 0이라 `source+0x320`은 0으로 남았다. grid 후보 클릭은
  `0x0300` heartbeat 또는 무반응뿐이었고 inbound `0x0b01`/outbound `0x0b07`은 없다.
- 화면 하단 좌측에 `이미 탈퇴하셨습니다.`가 보여 UI 메시지/한글화 매핑이 아직 오문맥임도
  확인했다.
- 판정: C002는 pending이다. 다음 pass는 early parser-stream 반복이나 `0x0325` wire layout
  재실험이 아니라 실제 클릭 가능한 object/camera/grid cell 경로, UI 메시지 source, postload
  optionalRecord `+0x08` writer를 추적한다.
- 증거: `.omo/ulw-loop/evidence/g006-c002-source-import-v45-postload-stream-minunit-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v45-postload-stream-minunit-20260618.jsonl`,
  `.omo/ui-explorer/session-g006-source-import-v45-postload-stream-minunit-47900-20260618/trace.jsonl`,
  `.omo/ui-explorer/session-g006-source-import-v45-postload-stream-minunit-47900-20260618/shots/003-v45-character-row1.png`,
  `.omo/ulw-loop/evidence/g006-c002-source-import-v45-cleanup-20260618.txt`,
  `src/server/logh7-login-protocol.mjs`,
  `src/server/logh7-login-session.mjs`,
  `src/server/logh7-auth-server.mjs`,
  `tests/server/logh7-login-protocol.test.mjs`,
  `tests/server/logh7-login-session.test.mjs`,
  `tools/logh7_source_import_watch.py`,
  `tools/tests/test_logh7_source_import_watch.py`.

### 2026-06-18 루프 추가 기록 v48-v50

- 매뉴얼 PDF와 설치 DB를 다시 대조했다. 성계 좌표의 기준은 원서버 좌표가 아니라
  `.omo/work/gin7manual/gin7manual.pdf` 101쪽 전략성계도 주석 투영이며,
  `content/galaxy.json`의 서버 표시 좌표는 `displayX=contentCy`, `displayY=contentCx`로
  확정한다. 재잠금된 대표 cell은 `イゼルローン (51,13)`, `ルンビーニ (2,21)`,
  `シロン (3,15)`, `フェザーン (49,38)`이다.
- 설치/런타임 콘텐츠 DB는 성계 80개, 행성 281개, 요새 6개를 제공한다. 행성은 절대 좌표가
  아니라 매뉴얼/DB의 궤도순으로 성계 안에 붙인다. 예: `ルンビーニ` contentId 86은 KO
  `룬비니`이고 행성은 orbit 1 `バグタプール`/`바구타푸루`, orbit 2 `カライヤ`/`카라이야`,
  orbit 3 `バドガオン`/`바도가온`이다. `イゼルローン`은 contentId 14 요새로 고정한다.
- 항성 등급과 특수 천체는 아직 성계명에 권위 있게 join되지 않았다.
  `content/extracted/model-galaxy-stars.json`에는 star node 79개와 등급 histogram
  `G19/O2/F8/A7/B5/M21/K17`, 특수 body `bh_01..03`, `ns_01..03`가 있지만,
  named system과의 직접 매핑은 미확정이다. 따라서 서버 grid에는 이름/위치/행성 궤도순만
  권위 데이터로 넣고, 항성 등급은 추정 라벨로 승격하지 않는다.
- canonical playable EXE stack을 `menufix + dlgfix + earlygrid-ringclear`로 승격했다.
  새 SHA는 `e75486ef762787448d91e38a612103f6d11691833c36a6bcb30d13a9cbdb2366`이고,
  `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`,
  `.omo/work/logh7-installed/exe/G7MTClient.exe`,
  `.omo/work/logh7-installed/exe/G7MTClient.exe.uiexplorer`가 같은 SHA다.
  런처도 기본으로 `LOGH_STRAT_GRID_EARLY=1`을 넘긴다.
- v48/v49는 새 playable로 로비/캐릭터/월드까지 갔지만 `0x0f03` 직후 ECONNRESET으로
  닫혔다. 원인은 early grid가 이미 live table을 소유한 상태에서 `0x0f02` 이후 서버가
  `0x0313/0x0315`를 다시 보내는 duplicate replay였다. red-first 회귀 테스트는 실제로
  `[0x0313,0x0315,0x0325,0x0323,0x0f03]` 중복을 잡았고, 서버는
  `LOGH_STRAT_GALAXY=1 && LOGH_STRAT_GRID_EARLY=1`일 때 late galaxy/grid replay를
  생략하도록 고쳤다.
- v50은 같은 조합으로 실제 클라이언트가 살아남았다. 로비, 게임 시작, 첫 캐릭터 진입 뒤
  `0x0f03`까지 도달했고 `clientAlive=true`, `hwndValid=true`였다. 미니맵 우측 클릭 후
  `.omo/ui-explorer/session-g006-manual-grid-v50-fixed-47900-20260618/shots/008-v50-minimap-right.png`
  에서 푸른 항성 마커와 한국어 라벨 `베큘라`, `발할라`가 보였다. trace에는
  `0x0f06 -> 0x0f07 -> 0x0b09/0x0b0a` grid-enter notify가 남았다.
- v50에서 `발할라` 중심 좌표의 좌클릭/우클릭은 아직 native inbound `0x0b01`을 만들지
  못했고, 우클릭은 `0x0300/0x0301` heartbeat에 머물렀다. 따라서 “항성은 보이고 이름은 붙음,
  grid-enter notify는 도달함”까지 완료이며, C002의 남은 일은 click hit-test와 native
  command writer(`0x0b01 -> 0x0b07`) 경로다.
- 회귀 테스트: `python -m unittest tools.tests.test_logh7_client_exe
  tools.tests.test_logh7_ui_explorer tools.tests.test_logh7_installed_tree`는 15 tests OK.
  `node --test tests/server/logh7-content-adapter.test.mjs
  tests/server/logh7-strategic-grid-provenance.test.mjs
  tests/server/logh7-login-session.test.mjs tests/server/logh7-command-engine.test.mjs`는
  104 tests OK. 추가로 `node --test tests/server/logh7-login-session.test.mjs`는
  85 tests OK로 duplicate replay suppression을 재확인했다.
- 증거: `.omo/ulw-loop/evidence/manual-pdf-coordinate-recheck-20260617/page101-transform-fit-to-annotation-icons.json`,
  `.omo/ulw-loop/evidence/g006-playable-ringclear-build-20260618.json`,
  `.omo/ui-explorer/session-g006-manual-grid-v48-47900-20260618/trace.jsonl`,
  `.omo/ui-explorer/session-g006-manual-grid-v49-minimal-47900-20260618/trace.jsonl`,
  `.omo/ui-explorer/session-g006-manual-grid-v50-fixed-47900-20260618/trace.jsonl`,
  `.omo/ui-explorer/session-g006-manual-grid-v50-fixed-47900-20260618/shots/006-v50-world-entry.png`,
  `.omo/ui-explorer/session-g006-manual-grid-v50-fixed-47900-20260618/shots/008-v50-minimap-right.png`,
  `tools/logh7_build_playable_client.py`, `tools/launcher/LOGH7Launcher.cs`,
  `src/server/logh7-login-session.mjs`, `tests/server/logh7-login-session.test.mjs`,
  `tests/server/logh7-strategic-grid-provenance.test.mjs`,
  `tests/server/logh7-content-adapter.test.mjs`.

### 2026-06-18 루프 추가 기록 v51

- `tools/logh7_selectgrid_state_watch.py`와
  `tools/tests/test_logh7_selectgrid_state_watch.py`를 추가했다. 새 watcher는 실제
  `G7MTClient.exe`에 Frida로 붙어 SelectGrid state(`DAT_009d2a30`), mouse globals
  `0x022143dc/0x022143e0`, projection writer `0x004d7a7b..0x004d7aa9`,
  target validator `0x004d6310`, target root/send path `0x00570a10/0x005737d0/0x004b48d0`을
  관찰한다. 첫 red check는 모듈 부재로 실패했고, 구현 뒤
  `python -m unittest tools.tests.test_logh7_selectgrid_state_watch`, `python -m py_compile`,
  그리고 기존 current/source watcher 포함 6 tests가 OK였다. watcher 파일은 throttling 후
  246 nonblank/non-comment LOC다.
- strict `LOGH_ACCOUNT_DB=.omo/work/e2e-accounts.json` run은 현재 DB가 `inei00`만 가지고
  자동 로그인 client가 `ginei00/dummy`를 보내므로 정상 reject됐다. C002 클릭 증거는 v50과
  같은 accept-any GIN7 조합으로 재현했다.
- v51 실제 클라이언트는 canonical playable SHA
  `e75486ef762787448d91e38a612103f6d11691833c36a6bcb30d13a9cbdb2366`로 로비, 첫 캐릭터,
  월드에 진입했고 trace는 v50처럼 `0x0f06 -> 0x0f07 -> 0x0b09/0x0b0a`까지 도달했다.
  `.omo/ui-explorer/session-g006-selectgrid-state-v51-47900-20260618/shots/014-v51-minimap-right.png`
  에서 `베큘라`, `발할라`가 보였고, 이후 화면에는 `니플헤임`도 보였다.
- `발할라` 중심 `(724,550)` 좌클릭은 `0x0f08 -> 0x0f09` 정보 경로로 빠졌고,
  우클릭은 무트레이스였다. `니플헤임` 좌클릭도 native `0x0b01`을 만들지 않았다.
- throttled watcher
  `.omo/ulw-loop/evidence/g006-c002-selectgrid-state-v51-throttled-20260618.jsonl`은
  hook 19개 설치/실패 0개, 총 248 events를 기록했다. `발할라`와 `니플헤임` 클릭 모두
  projection path `0x004d7a7b/80/8c/9c/a9`와 `writerBranch-state-check-004d7acc`까지
  도달했다. 그러나 `FUN_004d6310` validator 인자는 `발할라`에서
  `x=8074780 (0x007b360c), y=23, range=0xffffffff`, `니플헤임`에서
  `x=8074780 (0x007b360c), y=19, range=0xffffffff`였고 둘 다 `retval=-256`으로 탈락했다.
- 같은 watcher에서 `DAT_007cd04c+0x11178=0`, `+0x1117c=0`,
  `DAT_009d2a3c=0`, `DAT_009d2a40=0xffffffff`, `selectedD5=-1`임을 확인했다.
  따라서 현재 blocker는 항성 렌더/라벨/클릭 도달 부재가 아니라 `sp70 -> state+0x24`
  upstream writer가 X grid 값을 못 주고 pointer-like `0x007b360c`을 validator X로
  흘리는 문제다.
- 다음 루프는 같은 star click 반복, `(42,25)` 강제 좌표, `DAT_009d2a3c=2` positive-control,
  raw-only current-location force를 반복하지 않는다. 바로 `0x004d7a7b` 직전 stack `sp70`
  writer, `FUN_004b25a0` world output, `DAT_007cd04c+0x11178/+0x1117c` source writer를
  정적/런타임 양쪽에서 추적한다.
- 증거:
  `.omo/ulw-loop/evidence/g006-c002-selectgrid-state-v51-20260618.md`,
  `.omo/ulw-loop/evidence/g006-c002-selectgrid-state-v51-throttled-20260618.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-state-v51-47900-20260618/trace.jsonl`,
  `.omo/ui-explorer/session-g006-selectgrid-state-v51-47900-20260618/shots/014-v51-minimap-right.png`,
  `.omo/ui-explorer/session-g006-selectgrid-state-v51-47900-20260618/shots/018-v51-throttled-click-valhalla-center.png`,
  `tools/logh7_selectgrid_state_watch.py`,
  `tools/tests/test_logh7_selectgrid_state_watch.py`.

### 2026-06-21 작업 등록 - G006 C002 mode activation watcher

- 목적: broad input gate forcing을 중단하고, 실제 HUD mode activation hit-test가 어디까지 자연 도달하는지
  return-site 단위로 판별한다.
- 추가 파일:
  - `tools/logh7_hud_mode_activation_watch.py`
  - `tools/tests/test_logh7_hud_mode_activation_watch.py`
- 검증:
  - `python -m unittest tools.tests.test_logh7_hud_mode_activation_watch` => 2 tests OK.
  - `python -m py_compile tools\logh7_hud_mode_activation_watch.py tools\tests\test_logh7_hud_mode_activation_watch.py` => OK.
  - `python tools/logh7_hud_mode_activation_watch.py --help` => OK.
  - `python -m unittest tools.tests.test_logh7_hud_mode_activation_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_ui_explorer` => 20 tests OK.
- 실제 세션:
  - `.omo/ui-explorer/session-g006-c002-mode-activation-20260621g/`
  - port `47900`, canonical playable SHA `15ed8a35...`, 전략 HUD 도달.
  - screenshot: `.omo/ui-explorer/session-g006-c002-mode-activation-20260621g/shots/002-before-mode-activation-watch.png`
- 판정:
  - `FUN_004fd100`의 네 mode activation return site는 모두 자연 호출된다.
  - 각 site는 267회씩 관찰됐고, `FUN_005015f0` low byte는 모두 0이다.
  - 네 mode target 모두 `gate05=0`; `hudModeSet=0`; `selectionSelected189=-1`;
    `commandSelectedD5=-1`; `commandCategoryD6=-1`.
  - trace에는 입력 후 `0x0300/0x0301` heartbeat만 남고 `0x0b01`/`0x0b07`은 없다.
- 다음 할 일:
  - `FUN_004fd7a0` 또는 동등 mode transition이 `HUD+0x14/+0x18/+0x24/+0x28` 대상에
    `FUN_005024b0(1)` 같은 활성화를 거는 위치를 찾는다.
  - 서버 payload 변형, 직접 `+5` forcing, 같은 좌표 반복 클릭은 이번 증거로 반복 금지한다.
- 증거:
  - `.omo/ulw-loop/evidence/g006-c002-mode-activation-watch-20260621g.md`
  - `.omo/ulw-loop/evidence/g006-c002-mode-activation-watch-20260621g.jsonl`
  - `.omo/ui-explorer/session-g006-c002-mode-activation-20260621g/trace.jsonl`

### 2026-06-21 작업 등록 - G006 C002 HUD mode lifecycle static index

- 목적: v61 live watcher가 확인한 네 mode activation hit-test 실패를 서버 payload 문제가 아니라
  HUD mode object lifecycle 문제로 좁히고, 다음 live hook target을 고정한다.
- 추가 파일:
  - `tools/logh7_hud_mode_lifecycle.py`
  - `tools/tests/test_logh7_hud_mode_lifecycle.py`
- 검증:
  - `python -m py_compile tools\logh7_hud_mode_lifecycle.py tools\tests\test_logh7_hud_mode_lifecycle.py` => OK.
  - `python -m unittest tools.tests.test_logh7_hud_mode_lifecycle tools.tests.test_logh7_hud_mode_activation_watch tools.tests.test_logh7_hud_admission_watch tools.tests.test_logh7_ui_explorer` => 22 tests OK.
  - `python -m tools.logh7_hud_mode_lifecycle .omo\work\logh7-installed\exe\G7MTClient.exe --out .omo\ulw-loop\evidence\g006-c002-hud-mode-lifecycle-static-20260621h.json` => OK.
- 판정:
  - `FUN_004fd100`의 네 hit-test는 `HUD+0x14/+0x18/+0x28/+0x24`에 대한
    pre-activation 검사다.
  - 성공 branch만 `FUN_004fd7a0(2/4/6,1)`로 들어간다.
  - `FUN_004fd7a0`은 `DAT_006703c0` mode table을 읽고, active row에서는
    `FUN_005024b0(1)`로 owner gate를 켠다.
  - 따라서 C002는 여전히 fail이며 다음 live 작업은 `FUN_004fc4e0`, `FUN_004fc4a0`,
    `FUN_004fd560`, `FUN_004fd7a0`, `FUN_005024b0` lifecycle hook이다.
- 증거:
  - `.omo/ulw-loop/evidence/g006-c002-hud-mode-lifecycle-static-20260621h.md`
  - `.omo/ulw-loop/evidence/g006-c002-hud-mode-lifecycle-static-20260621h.json`
