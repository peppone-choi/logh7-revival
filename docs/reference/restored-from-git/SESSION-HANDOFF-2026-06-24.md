# LOGH VII Revival — Session Handoff (2026-06-24)

> 이전 핸드오프 `docs/SESSION-HANDOFF-2026-06-23.md`에서 이어짐. 이어진 작업: **C002 우회 `/grid` 채팅 폼백 구현·검증, 병렬 조사 에이전트 3종 가동.**

## 🟢 2026-06-24 성과

| 항목 | 상태 |
|---|---|
| C002 우회 | `server/src/server/logh7-command-engine.mjs`에 `/grid <cell>` 채팅 명령 폼백 구현. `CommandGridChat 0x0f1c` 텍스트가 `/grid <숫자>`면 플레이어 함대를 `state.moveFleet()`로 이동시키고 `0x0b07 NotifyMovedGrid`를 전체 클라이언트에 브로드캐스트. |
| 테스트 | `server/tests/server/logh7-command-engine.test.mjs`에 `/grid` fallback 테스트 추가. **서버 전체 1058/1058 PASS**. |
| 라이브 시도 | `G7MTClient.autologin-bootstrap-emp1.exe`로 월드진입 성공(전략맵+HUD 렌더). 채팅 UI 단축키(Enter, /, Y)·하드웨어 키 이벤트(`keybd_event`)·패널 클릭으로 `0x0f1c`를 본냉하지 못함 — 기존 C002 입력 레이어 한계와 동일. |
| 임시 도구 | `tools/grid_chat_type_probe.py` 작성 — 하드웨어 키 주입용. |
| 문서 | `docs/logh7-c002-grid-chat-fallback-2026-06-24.md`, `memory/logh7-c002-grid-chat-fallback-2026-06-24.md` 작성. |
| 병렬 조사 | 3개 서브에이전트 모두 완료: ①`docs/logh7-chat-input-re-2026-06-24.md`, ②`docs/logh7-planet-duty-survey-2026-06-24.md`, ③`docs/logh7-remaster-target-list-2026-06-24.md`. |
| 채팅 입력 RE | `FUN_004b78a0` case 0x78 → `CommandGridChat 0x0f1c`, gate `0x35837e`. 문자열 `[TAB] Chat Focus ON,OFF`로 **Tab 키**가 채팅 포커스 토글 가능성 확인(라이브 미검증). |
| 행성/직무카드 서베이 | 와이어/도메인/MsgDat은 대부분 구현됨. **시설 내 장소/집무실명 89개 한글 번역을 `content/localization/constmsg-ko.json`에 batch 추가**, playable client 재빌드+배포, 서버테스트 1145 PASS. 직무카드 텍스처는 설치본에 존재, playable 배포 필요. 모두 C002 라이브 검증 대기. |
| 리마스터 실행 | `tools/logh7_remaster_hud_tga.py`로 20종 HUD/UI 텍스처 2배 업스케일 오버레이 생성(`.omo/work/remaster/hud-overlay/data/image`). 라이브 드롭인 검증 예정. |
| 라이브 시도(추가) | `.omo/ui-explorer/tab-chat-test-20260624`, `.omo/ui-explorer/sendinput-probe-20260624`, `.omo/ui-explorer/autologin-foreground-20260624` 세션: 포그라운드 유지 시 스플래시 통과→로그인 화면까지 진입. `ui_explorer` click/keybd_event, `SendInput`(`login_sendinput_probe.py`), `autologin-bootstrap-emp1.exe` 모두 **입력 레이어/스플래시 진행 실패** → 서버 접속 불가. 증거: DirectInput/`GetAsyncKeyState` 폧링 + `SetForegroundWindow` 반환값 미확인이 복합 원인. |
| 리마스터 배포 | dgVoodoo 워터마크 off(`python -m tools.logh7_dgvoodoo_nowatermark --deploy`). 2배 업스케일 HUD 텍스처 20종을 `.omo/work/logh7-installed/data/image`에 드롭인. |
| 직무카드 텍스처 | `data/image/shokumu_card/*.tga`는 설치본에 이미 존재; 별도 배포 불필요. |

## 🔴 남은 프런티어

1. **C002 실제 종결**: Tab 키 채팅 입력 경로 라이브 검증, 또는 전략 명령 서브시스템 구성을 RE/라이브로 풀어야 함. (라이브는 로그인 입력 레이어 게이트에 막혀 있음)
2. **로그인 입력 레이어**: `ui_explorer`/SendInput/autologin-bootstrap 모두 현재 환경에서 실패. 실제 물리 입력 대조 또는 DirectInput 수준 주입(Interception driver 등) 필요.
3. **자유로운 맵 전환**: `0x0b07` 클라이언트 소비 라이브 측정 미완.
4. **HUD/UI/이미지/모델 리마스터**: P0 항목은 이미 패치 스택에 포함; 라이브 드롭인 검증 대기. dgVoodoo 워터마크+업스케일 HUD 텍스처 배포 완료.
5. **String.txt 한글 번역**: 128줄 오버레이 외 대부분 일본어; 전체 번역 소스 확보는 별도 대규모 작업.

## 다음 즉시 작업

1. **로그인 게이트 돌파**: `pydirectinput` 또는 Interception driver 기반 로그인 폼 주입 프로브.
2. **Tab 채팅 입력 라이브 검증**: 로그인 통과 후 전략맵에서 `/grid 8700` end-to-end.
3. **String.txt 전체 번역 소스 탐색**: 기존 한국판 리소스/팬 번역/AI 번역 워크플로우 검토.

## 참고

- canonical playable SHA: `992dc7e2` (정정 2026-06-25). 이전 기재 `c1523a5e`는 stale — playable 매니페스트 outSha256·`tools/logh7_client_exe.py:23` PLAYABLE_CLIENT_SHA256·설치본 `G7MTClient.exe` 모두 `992dc7e2`로 일치. 증거: 워크플로 `w62bxbk5a` login-flow.
- autologin 변종: `.omo/work/logh7-installed/exe/G7MTClient.autologin-bootstrap-emp1.exe`.
- git: non-git 상태.
