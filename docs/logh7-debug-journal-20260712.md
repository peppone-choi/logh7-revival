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
