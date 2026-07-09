# M1 C002 라이브 검증 시도 기록 (2026-06-24)

## 목적
`c002-force-scene-setup.json` 패치를 적용한 autologin EXE로 실제 클라이언트에서 unit-list 위젯 0x67 생성 및 `0x0b01/0x0b07` 루프를 라이브 검증.

## 준비
- EXE 빌드:
  - `.omo/work/G7MTClient.m1-c002.exe` (c002 + lobby-res + lobby-native-layout)
  - `.omo/work/G7MTClient.autologin.emp1.m1-c002.exe` (autologin emp1 + c002)
  - `.omo/work/logh7-installed/exe/G7MTClient.autologin.emp1.c002-setup.exe` (autologin emp1 + c002-setup, live3-auto 계보)
- 도구: `tools/logh7_ui_explorer.py`, `tools/logh7_c002_cmdmenu_probe.py`
- 스크립트: `.omo/ui-explorer/m1-c002-ps/run_m1_direct.ps1`

## 시도 1-5: `ui_explorer` 경로 (요약)
- `ui_explorer`를 통한 5가지 조합 모두 로그인/스플래시 단계 정체. `cmd_obj_DAT_00c9e638=0`, trace에 0x7000 등 없음.
- 결론: `ui_explorer`의 `CLIENT_EXE` 복사/detached spawn 방식이 autologin 부트스트랩/D3D8 스플래시 진행을 막음.

## 시도 6: PowerShell 직접 실행 + `c002-setup.exe`
- 명령: `.omo/ui-explorer/m1-c002-ps/run_m1_direct.ps1`
- 서버: `node src/server/logh7-server.mjs serve-auth --host 127.0.0.1 --port 47900 --trace trace.jsonl`
- EXE: `.omo/work/logh7-installed/exe/G7MTClient.autologin.emp1.c002-setup.exe`를 `exe/G7MTClient.exe`로 임시 복사 후 직접 실행.
- 포그라운드: PowerShell C# `SetForegroundWindow` 90초 반복 유지.
- 환경(핵심):
  - `LOGH_WORLD_PLAYER=1`
  - `LOGH_STRAT_GALAXY=1`
  - `LOGH_GRID_ENTER=1`
  - `LOGH_LOBBY_EARLY_OK=1`
  - `LOGH_LOBBY_OK_FORMAT=message32`
  - `LOGH_SS_FORMAT=message32`
  - `LOGH_POSTLOAD_PLAYER_RECORD=1`
  - `LOGH_STRAT_GRID_EARLY=1`
  - `LOGH_STRAT_TERRAIN=1`
  - `LOGH_FULL_UNIT_LOCATION=1`
  - `LOGH_ACCEPT_ANY_GIN7=1`
- 결과: 클라이언트가 47900에 연결, 로그인 성공, 월드 진입(trace 79줄). `0x7000`→`0x2000/2009`→`0x0020`→`0x0200/0201`→`0x0304..031c/031d`→`0x0308/030c/0300/0f00/0f02`→`0x0204/031f/0321/0337/0325/0323/0f03`→`0x0300/0f06/0f07`→`0x0b09/0204/0325/0323/0b0a/0356`.
- probe(35초 시점):
  - `cmd_obj_DAT_00c9e638=0x140d4ce8` (명령 메뉴 객체 존재)
  - `rowCount_350=0`
  - `selectedD5_354=0`
  - `factory_nonzero=6`
  - `taskList_count_c9e2e0_14=2`
- 분석: C002 patch로 unit-list/명령메뉴 객체는 생성되지만, 명령 행(rowCount)이 0이라 `0x0b01` dispatch 게이트는 열리지 않음.

## 시도 7: `LOGH_ACTION_LIST_CATEGORY=0` + `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` 추가
- 환경에 `LOGH_ACTION_LIST_CATEGORY=0`, `LOGH_POSTLOAD_ACTION_LIST_SEATS=1` 추가.
- 결과: `0x0356` `recordSeatCount250=1` 확인, 그러나 `rowCount_350=0`, `0x0b01/0x0b07` 없음.
- 분석: action-list seat 채움이 명령 메뉴 rowCount를 자동으로 채우지 않음. command table 자체가 비어 있거나 카테고리 축이 맞지 않음.

## 시도 8: `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` 추가
- 환경에 `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1` 추가(0x0305/0x0307에 카드/명령 factory id preload).
- 결과: `rowCount_350=0`, `0x0b01/0x0b07` 없음.
- 분석: preload probe 단독으로는 현재 경로에서 명령 행을 렌더하지 못함. G006 v12b에서 rowCountD4>0이 나왔던 것은 `LOGH_COMMAND_TABLE_PRELOAD_PROBE` 외에 direct `FUN_004f5cb0(commandMenu,0)` 호출과 native active gate pair 조작이 함께 필요했음.

## 현재 판정
- C002 patch EXE(`c002-setup.exe`)는 바이트검증 통과, PowerShell 직접 실행으로 월드 진입 성공.
- `cmd_obj_DAT_00c9e638 != 0` → unit-list/명령메뉴 위젯 객체는 생성됨.
- **자연 `0x0b01` 송신은 아직 발생하지 않음**. rowCount=0이 핵심 블로커.
- M1 완료 기준 #3/#4/#5/#6은 미충족.

## 다음 행동
- command table이 실제로 채워지는 서버 조합 탐색: `LOGH_WORLD_IMPORT_BASES=1`, `LOGH_BASE_ECONOMY=1`, `LOGH_EARLY_WORLD_LOCATION=1`, `LOGH_ACTION_LIST_APPOINTMENT=1`, `LOGH_DUTY_CARDS_POSTLOAD=1` 등 G006 후속 조합 시도.
- `tools/logh7_c002_cmdmenu_probe.py`를 월드 진입 직후(0x0f06/0x0f07 이후)와 post-load extras 직후 두 시점에서 측정.
- 필요 시 `0x0b07` 응답을 서버 `commandOkResponses`에 미리 구성해, 0x0b01이 발생하는 즉시 trace 쌍을 포착.
