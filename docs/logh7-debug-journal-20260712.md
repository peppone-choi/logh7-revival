# LOGH VII 디버그 저널 — 2026-07-12

## 이번 반복에서 닫힌 병목

- B6에서 실제 동적 좌표가 선택 행과 명령 행에 도달하고 task runner가 증가하는 것을 확인했다. 하지만 클라이언트 상주 명령 테이블은 category 0에 `0x2b`가 없어 `SelectGrid`가 생성되지 않았다.
- B7에서 서버 `0x0305/0x0307` preload가 staging descriptor까지 도달하는 것은 확인했지만, 현재 live 경로의 runtime category table count는 계속 0이었다. preload는 운영 해법으로 승격하지 않았다.
- B8에서 QA 전용 runtime table 주입(`count=2`, factories `0x2b/0x41`) 후 `FUN_004f5cb0`가 성공하고 `FUN_00581c80` SelectGrid가 생성됐다.
- B9~B12에서 `DAT_009d2a3c=2`는 SelectGrid 생성 전에는 오히려 생성을 막고, 목적지 클릭 뒤에만 확인창을 여는 상태 전환임을 고정했다.
- B13에서 좌측 확인 클릭으로 원본 클라이언트가 실제 `0x0b01`을 전송했다. 서버는 당시 33바이트 SendWarp payload를 구형 0x24 레코드로 오독해 가짜 unit ID를 거부했다.
- B14에서 raw payload를 trace에 고정했다. 현재 live 형식은 `[u16 code][31-byte sendwarp-live-v1]`이며 `routeCellCandidate`는 body `+0x16`에 있다. 목적지 writer가 실패한 경우 이 값은 `0xffff`다.
- B15~B17에서 full unit-location/focus flags만으로는 목적지 writer가 복원되지 않고 `0xffff`가 유지되는 것을 확인했다. 이는 서버 위치 seed가 아니라 클라이언트 목적지 투영/상태 writer의 잔여 병목이다.
- B18에서 명시적 QA fallback `LOGH_DEV_GRID_MOVE_FALLBACK_CELL=2115`를 켜고 실제 `0x0b01 → server move → 0x0b07` 왕복을 확인했다.

## 코드 판정

- `decodeMoveGridCommand`는 live 31-byte 형식을 별도로 보존한다. unit ownership은 payload 첫 dword가 아니라 현재 세션 player에 묶는다. 유효한 `routeCellCandidate`는 세션 소유권·0..4999 범위 검증 뒤 사용할 수 있고, `0xffff` 미해결 값만 명시적 QA fallback 또는 fail-closed로 처리한다.
- 목적지 후보가 미확정이면 기본값은 fail-closed(`unresolved grid target`)다.
- `LOGH_DEV_GRID_MOVE_FALLBACK_CELL`은 기본 OFF인 QA/개발용 우회이며 canonical 목적지 mapping으로 간주하지 않는다.
- `0x0305/0x0307` command-table preload와 Frida runtime table/geometry/confirm 강제는 진단 전용이다. 운영 서버 기본 경로에는 올리지 않았다.

## 남은 병목

1. 원본 클라이언트의 목적지 projection/state writer가 `routeCellCandidate`를 `0xffff`가 아닌 실제 cell로 채우는 조건을 복원해야 한다.
2. 유효 후보 경로는 서버 회귀와 B28에서 확인했지만, 표준 프로파일에서 목적지 writer가 항상 유효해지는지 추가 live 증거가 필요하다.
3. 이후에만 command-table data source와 client-side natural admission을 운영 기본값으로 승격한다.

## 증거

- `.omo/live-qa/m3-strategy-input-singleton-B8-20260712-201956`
- `.omo/live-qa/m3-strategy-input-singleton-B12-20260712-202704`
- `.omo/live-qa/m3-strategy-input-singleton-B13-20260712-202907`
- `.omo/live-qa/m3-strategy-input-singleton-B14-20260712-203241`
- `.omo/live-qa/m3-strategy-input-singleton-B18-20260712-204542`

## 2026-07-12 B26-B30 live loop

- B26: `LOGH_ACTION_LIST_CATEGORY=0`과 command-table preload를 함께 적용하자 명령 원점이 `(665,136)`, 선택 원점이 `(665,498)`로 복원됐고, 원본 클라이언트가 `FUN_005737d0`을 거쳐 실제 `0x0b01`을 보냈다.
- B27: `FUN_004b48d0`의 인자를 새로 계측했다. 진단 레이아웃이 맞지 않을 때 인자는 `(-1,0,0)`이고 패킷의 route 후보도 `0xffff`였다.
- B28: `LOGH_DIAG_0323_GRIDUNIT_OFFSET20=1` + `LOGH_DIAG_0325_ID_OFFSET2_BE=1` 조합에서 `FUN_004b48d0` 첫 인자 `2887`이 패킷 `body+0x16=0x0b47`과 일치했다. 서버 trace는 `cellSource=route-candidate-qa-gated`, `cell=2887`로 `0x0b07`을 보냈다.
- 서버 수정: 유효한 route 후보가 있으면 `LOGH_DEV_GRID_MOVE_FALLBACK_CELL` 없이도 처리한다. 후보가 `0xffff`인 미해결 프레임만 기존 fail-closed/fallback 규칙을 따른다.
- B29/B30: 같은 진단 조합에서도 타이밍에 따라 `(-1,0,0)`/`0xffff`가 재발했다. 따라서 진단 레이아웃은 목적지 writer를 열 수 있는 조건으로 확인됐지만, 표준 프로파일에서 자연 목적지 writer가 항상 채워진다는 증거는 아직 없다.

증거:

- `.omo/live-qa/m3-strategy-input-singleton-B26-20260712-qa-category0`
- `.omo/live-qa/m3-strategy-input-singleton-B27-20260712-qa-gridmove-hook`
- `.omo/live-qa/m3-strategy-input-singleton-B28-20260712-qa-gridmove-diag`
- `.omo/live-qa/m3-strategy-input-singleton-B29-20260712-qa-route-authoritative`
- `.omo/live-qa/m3-strategy-input-singleton-B30-20260712-qa-route-authoritative-forced`

## 2026-07-12 B31-B36 readiness/layout loop

- B31: `sendWarp` 진입 직전에 `DAT_009d2a3c`를 `0→2`로 쓰는 QA 계측을 넣었지만 `FUN_004b48d0` 인자는 여전히 `(-1,0,0)`이었다. 확인 상태의 늦은 강제만으로는 목적지 writer를 만들 수 없다.
- B32: sweep 직전에 같은 상태를 `1→2`로 고정해도 선택 후 `phase=1/mode=0`, 이동 인자 `-1`이 재현됐다. 상태값 단독이 아니라 선택 단계에서 만들어지는 target node가 필요하다.
- B33: 서버/클라이언트 모두 살아 있었지만 sweep 시작 시 `command/selection origin=(0,0)`이라 실제 명령 행을 누르지 못했다. 고정 9초 대기는 하네스 race였다.
- B34: 준비 대기 후 `command/selection origin=(665,136)/(665,498)`, `unit0Id=1`, `char0Flagship=1`을 확인하고 이동했다. `FUN_004b48d0` 첫 인자 `2887`과 packet `body+0x16=0x0b47`가 일치했고, 서버는 fallback 없이 `0x0b07(cell=2887)`을 보냈다.
- B35: 같은 준비 대기에서 기본 aligned 레이아웃은 `unit0Id=0`, `char0Flagship=0`, `-1/0xffff`를 재현했다. live client가 읽는 링크 위치는 0x0323 `body+0x20`, 0x0325 `body+0x02`임을 고정했다.
- B36: `_m2_launch.mjs`의 `LOGH_LIVE_CLIENT_LAYOUT=1` 기본 프로필로 B34의 링크 필드는 복원됐지만 한 번의 target 선택은 `-1`이었다. 따라서 남은 `-1`은 링크 레이아웃이 아니라 target node/선택 타이밍 문제로 분리된다.

수정:

- `LOGH_LIVE_CLIENT_LAYOUT=1` 프로필을 추가해 0x0323/0x0325 live 링크 오프셋을 명시적으로 선택한다. `_m2_launch.mjs`에서는 기본 활성화하고, 안정 레이아웃 비교는 `LOGH_LIVE_CLIENT_LAYOUT=0`으로 보존한다.
- `_strategy_table_probe.py`에는 `LOGH_WAIT_STRATEGY_READY=1`을 추가해 UI origin/row와 unit/flagship 링크를 관찰하고 `strategy-ready.json`에 남긴다.
- 유효 route 후보가 없을 때 서버는 계속 fail-closed이며, B34처럼 유효 후보가 있을 때만 fallback 없이 권위 이동을 처리한다.

## 2026-07-12 red/green verification

- RED: `MoveGrid` accepted a valid cell when the command omitted `accountId`; the regression now requires an authenticated principal in both the application handler and world session.
- GREEN: focused auth/world/playable/harness run passed 75/75; the complete server suite passed 297/297 with no failures, skips, or todos.
- RED: the old reconnect handoff was one process-global account plus remote address, so a second login could overwrite it. The server now keeps stage-specific one-time handoff records, rejects ambiguous same-address world handoffs, and disables stock handoff compatibility on non-loopback hosts unless `LOGH_ALLOW_INSECURE_HANDOFF=1` is explicitly set.
- GREEN: the stock three-connection handoff still reaches `0x0201`, `0x0206`, `0x0204`, `0x0325`, and `0x0323` in the playable-server test; public bind with auto-seeded development credentials is rejected by default.
- Trace hardening: login-harness raw frames are redacted by default (`LOGH_TRACE_RAW_FRAMES=1` is an explicit capped diagnostic opt-in); `LOGH_LOBBY_EARLY_OK=1` no longer emits an unauthenticated early lobby response.
- Remaining client blocker: the canonical client-side destination writer is timing/layout-sensitive and still emits `routeCellCandidate=0xffff` in B29/B30. B28 produced a valid candidate (`2887`) and the server accepted it without a fallback; standard-profile natural reliability is not yet proven.

원본 `g7mtclient.exe`는 모든 세션에서 수정하지 않았고, runtime table/state writes는 Frida QA 프로세스 안에서만 수행했다.

## 2026-07-13 B43-B46 선택·명령·이동 루프

- B43b에서 HUD mode 2와 선택 행은 생성됐지만, 명령 원점은 선택 전 `(0,0)`이었다. 자연 선택 행 클릭 뒤에만 HUD `2→3`, 명령 원점 `(665,136)`, category 1이 생성됐다.
- 하네스는 명령 좌표를 선택 전에 계산하고 있었고, QA 명령표는 category 0만 채웠다. HUD 로드 뒤 category 0·1을 함께 채우고, 선택 클릭 뒤 명령 좌표를 다시 계산하도록 RED→GREEN 테스트를 추가했다.
- B44에서 첫 재계산 명령 클릭이 factory `43`과 SelectGrid mode `1`을 열었다. 이후 명령 좌표를 더 누르면 이미 열린 목표 선택 모드에서 그 좌표가 목적지로 처리되므로, SelectGrid가 열리면 남은 명령 행을 건너뛰고 지정 목적지를 누르도록 수정했다.
- 자연 워프 확인 대화상자 클릭이 SelectGrid 강제 플래그 아래에 잘못 중첩돼 있었다. 강제 상태 변경과 자연 확인 클릭을 독립 분기로 분리했다.
- B45b에서 QA로 명령 데이터/HUD를 준비한 뒤의 사용자 입력은 모두 자연 경로로 진행됐다. 선택 행 → 명령 행 → factory `43` → SelectGrid → 목적지 → 확인을 거쳐 클라이언트가 `0x0b01`(`innerLen=33`)을 보냈고 서버가 셀 `2388`의 `0x0b07`을 반환했다.
- B28의 native 목적지 `2887 == body+0x16`과 B45b의 `2388 == body+0x16`이 독립적으로 일치했다. 따라서 live 31-byte SendWarp의 body `+0x16` 값이 `0..4999`이면 정본 목적지 셀로 승격하고 `decoded-route-cell`, `unresolved=false`로 기록한다. `0xffff`와 범위 밖 값은 기존 QA fallback 또는 기본 fail-closed를 유지한다.
- B46에서 수정된 서버를 원본 클라이언트와 다시 연결했다. Frida `gridMove=2388`, client `0x0b01`, server `0x0b07 cell=2388`, `cellSource=decoded-route-cell`, `configuredFallback=null`, `unresolved=false`가 한 실행에서 일치했다.
- 전체 서버 회귀는 `308/308` 통과했다. 원본 EXE SHA-256은 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51` 그대로이며, 실행 뒤 클라이언트와 TCP 47900 listener는 남지 않았다.

증거:

- `.omo/live-qa/m3-strategy-command-origin-B43b-post-hud-apply-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B44-staged-click-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B45b-natural-confirm-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B46-decoded-route-cell-20260713`

남은 경계:

- B46은 원본 EXE와 자연 클릭·확인 경로를 사용했지만, action-list 전송, runtime command table, HUD mode, focus cell 준비는 명시적 QA 플래그다. 다음 병목은 이 메모리 강제를 서버의 정본 `0x0305/0x0307/0x0356` 데이터와 자연 UI 상태 전이로 대체하는 것이다.

## 2026-07-13 B47-B55 자연 전략 이동 기본 경로

- B47/B48에서 `0x0305/0x0307`을 클라이언트 native stride가 아닌 compact BE cursor wire로 고치자 runtime command build, factory `43`, SelectGrid가 서버 데이터만으로 자연 생성됐다.
- B49-B50b에서 우하단 전략 HUD의 `職務権限カード`와 `同スポットキャラクター`를 확인했고, 자연 `職務権限カード` 탭 클릭으로 명령 경로에 진입했다.
- B50c의 `0x5786be` 등 네 위치만 바꾸는 가설은 확인창 표시 공급자가 아니어서 기각됐다. B50d runtime ConstMsg 추적으로 실제 visible caller `0x56f310`/`0x56f3aa`를 찾았다.
- B50e는 UI 코드만 건드리는 8바이트 패치로 HUD 탭, 전략 명령 대화상자, 실제 common dialog의 group을 `0x67→0x62`로 맞췄고 화면에서 `決定`/`取消し`를 확인했다. patched SHA-256은 `d1ef22b75e97462bc1b098848db2732fb4388e4445ab4924203671d88a3e1146`이다.
- B51에서 focus 강제 없이 `currentRaw11178=0x02000000`이 되어 `sendWarp=0`이었다. B52는 서버 `LOGH_PLAYER_FOCUS_CELL=1`만 켜도 hybrid `0x0325` 정렬 때문에 같은 실패가 유지됐다.
- 정본 `FUN_00419ca0` 실바이트 디스어셈블로 `u16 BE count` 직후 각 행을 `id u32, faction u16, field06 u8, commander/cell/owner u32, boats count/list, tail` 순으로 읽는 compact cursor 규격을 확정했다. native `0x58` stride와 padding은 wire 규격이 아니다.
- B53에서 compact `0x0325` serializer와 서버 focus env를 사용하자 Frida focus 강제 없이 unit commander/cell/current가 모두 `2588`이 됐다. `sendWarp/gridMove=[2388,0,1]`, `0x0b01→0x0b07`이 성공했다.
- B54에서 서버 focus env까지 빼자 player commander/current가 캐릭터 ID `1`로 돌아가 `sendWarp=0`이었다. native unit `+0x08`이 `FUN_004c2c80 source+0x320→FUN_004c4170→currentRaw11178`로 흐르는 초점 셀 공급자임을 분리했다.
- B55는 player commander 슬롯을 항상 playerCell로 투영하고 production의 focus env 참조를 제거했다. env/Frida force 없이 `currentRaw11178=2588`, `sendWarp/gridMove=[2388,0,1]`, `0x0b01→0x0b07`이 성공했고 서버는 `cellSource=decoded-route-cell`, `configuredFallback=null`로 처리했다.
- 관련 main 테스트는 `110/110`, worker 전체 서버 테스트는 `312/312` 통과했다. 원본 SHA-256은 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`, UI patched SHA-256은 `d1ef22b75e97462bc1b098848db2732fb4388e4445ab4924203671d88a3e1146`이며 종료 뒤 클라이언트와 TCP 47900 listener는 모두 `0`이었다.

증거:

- `.omo/live-qa/m3-strategy-command-origin-B47-wire-command-table-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B48-compact-wire-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B49-hud-label-natural-tab-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B50-hud-label-natural-tab-ready-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B50b-hud-label-natural-tab-ready-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B50c-strategy-ui-labels-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B50d-constmsg-trace-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B50e-common-dialog-labels-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B51-no-focus-force-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B52-server-focus-cell-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B53-packed-0325-no-focus-force-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B54-packed-0325-no-focus-env-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B55-default-focus-cell-no-env-20260713`

남은 경계:

- 자연 이동은 env/Frida focus 강제 없이 닫혔다. 남은 서버 보조 플래그는 `LOGH_POSTLOAD_ACTION_LIST`와 `LOGH_COMMAND_TABLE_PRELOAD_PROBE`이며, 두 데이터 경로를 운영 기본값으로 승격할 근거와 회귀 검증이 필요하다.

## 2026-07-13 B56-B59 서버 보조 환경변수 제거

### B56/B57 action-list 기본 경로

- B56 음성 대조에서는 `LOGH_POSTLOAD_ACTION_LIST` 없이도 로그인, 월드 진입, character↔unit 링크가 정상이었다. 다만 grid-init 응답이 `0x0f03`으로 끝나고 `0x0356`이 없었으며, `listCount188=0`, `payloadCount270=0`으로 30초 readiness가 실패했다.
- 이 결과로 `LOGH_POSTLOAD_ACTION_LIST`와 `includeActionList` 분기를 제거했다. 첫 grid-init의 core 마지막 `0x0f03` 직후 `0x0356`을 항상 정확히 한 번 보내고, 별도 category 진단값이 없으면 action-list의 seat character에 실제 `characterId`를 쓴다. 허용되는 tail은 `0x0f03→0x0356`뿐이다.
- B57은 같은 POSTLOAD env 미설정 조건에서 grid codes가 `…→0x0f03→0x0356`으로 끝났고, `0x0356` action-list 1회, `listCount188=1`, `payloadCount270=1`, `currentRaw11178=2588`을 확인했다. 자연 입력은 `sendWarp/gridMove=[2388,0,1]`을 만들었고, `0x0b01→0x0b07 cell=2388` 왕복이 성공했다.

### B58/B59 command-table 기본 경로

- B58 음성 대조에서는 `0x0356` action-list 1회, `listCount188=1`, `payloadCount270=1`, `ready=true`였지만, runtime `0x0305`의 category 0/1 count가 모두 `0`, runtime `0x0307` record count가 `0`이었다. 선택 뒤 command build는 한 번 호출됐으나 command row는 `0`이었고, factory, SelectGrid, SendWarp, gridMove는 모두 호출되지 않았다.
- CD, MDX, 공식 매뉴얼, 리셋 전 스냅샷 `5bd249c`를 역추적했지만 canonical card/category→factory 숫자 매핑은 찾지 못했다. `0x2b`만 P0 SelectGrid와 P1 라이브 근거가 있고, `0x41`, category `0`, card `0/1` 숫자 매핑은 P3 호환성 값이다. 따라서 이 데이터는 B48/B55에서 검증된 `live-compatible playable baseline`이며, 정본 전체 권한표가 완성됐다는 뜻이 아니다.
- `LOGH_COMMAND_TABLE_PRELOAD_PROBE` env gate와 관련 enable/preload 심볼을 제거했다. `0x0304→0x0305`는 compact BE card `0/1`을, `0x0306→0x0307`은 compact BE record `0/1`을 항상 직접 반환하며, 각 card/record의 factory 배열은 `[0x002b,0x0041]`이다.
- B59는 서버 helper env 없이 `0x0356` action-list 1회, `listCount188=1`, `payloadCount270=1`, runtime `0x0305` category 0/1 count가 각각 `2`, 첫 factory가 `43(0x2b)`, runtime `0x0307` record count가 `2`임을 확인했다. command row `2`, factory `1`, SelectGrid `1`이 자연 생성됐고, `sendWarp/gridMove=[2388,0,1]`, `0x0b01→0x0b07`이 이어졌다. 서버 판정은 `cellSource=decoded-route-cell`, `configuredFallback=null`이었고 모든 Frida force 플래그는 `false`였다.

### 검증과 증거

- worker 전체 서버 테스트는 `312/312` 통과했다. main focused 검증은 action-list 경로 `64/64`, command-table 경로 `103/103` 통과했다.
- 원본 EXE SHA-256은 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`, UI patched SHA-256은 `d1ef22b75e97462bc1b098848db2732fb4388e4445ab4924203671d88a3e1146`이다. 종료 뒤 클라이언트와 TCP 47900 listener는 모두 `0`이었다.

증거:

- `.omo/live-qa/m3-strategy-command-origin-B56-no-postload-action-list-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B57-default-action-list-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B58-no-command-table-env-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B59-no-server-helper-envs-20260713`

남은 경계:

- action-list와 command-table의 helper-env 병목은 닫혔다. 다만 baseline의 `0x41`과 card/category 숫자 매핑은 P3 호환성에 머문다. 이후 별도 최소 권한 A/B로 값을 축소·대조해야 하며, 그전에는 canonical 전체 권한표 완료를 주장하지 않는다.

## 2026-07-13 B60/B61 command-table 최소권한 A/B

### B60 — `0x2b` 단일 factory, 두 ordinal 유지

- card/record id `0/1` 두 개는 유지하되 각 command/descriptor를 `0x2b` 하나로 줄이고 `0x41`을 제거했다. 서버 helper env와 모든 Frida force를 사용하지 않은 자연 입력 대조였다.
- action/list readiness는 정상적으로 열렸다. runtime `0x0305`의 category 0/1 command count는 각각 `1`, runtime `0x0307`은 record `2`개에 각각 command count `1`과 descriptor `43(0x2b)`을 보유했다.
- 선택 뒤 command row `1`개, factory `43(0x2b)` 호출 1회, SelectGrid 호출 1회가 자연 생성됐다. `sendWarp/gridMove=[2388,0,1]`에 이어 서버에서 `0x0b01→0x0b07 cell=2388` 왕복을 확인했다.

### B61 — card id `1` 단독 전송 실패

- category 0 중복을 제거하는 가설로 card/record id `1` 하나만 보냈다. wire/runtime `0x0307`은 `recordCount=1`, 첫 record id `1`, command count `1`, descriptor `43`으로 수신됐다.
- 그러나 runtime `0x0305`는 category 0 count가 `1`, category 1 count가 `0`이었다. 클라이언트 변환은 card id가 아니라 record ordinal 순서대로 runtime category slot을 채운다.
- command build는 1회 호출됐지만 command row, factory, SelectGrid, SendWarp, gridMove는 모두 `0`이었다. 모든 force가 꺼진 상태였으므로 B61은 자연 경로 실패로 판정했다.

### 결론과 검증

- B61을 rollback하고 B60을 최종 상태로 복원했다. 두 card/record ordinal은 중복 canonical grant가 아니라 category 1 runtime slot까지 변환을 진행시키는 구조적 padding이다. 두 ordinal이 싣는 factory는 각각 `0x2b` 하나뿐이며 `0x41`은 제거된 상태다.
- focused 테스트는 `96/96`, 서버 전체 테스트는 `312/312` 통과했다.
- 원본 EXE SHA-256은 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`로 유지됐다. 종료 뒤 클라이언트 프로세스와 TCP 47900 listener는 각각 `0`이었다.

증거:

- `.omo/live-qa/m3-strategy-command-origin-B60-minimal-authority-0x2b-only-20260713`
- `.omo/live-qa/m3-strategy-command-origin-B61-category1-only-0x2b-20260713`
