# LOGH VII 클라이언트 상태 저널

매 라이브 테스트마다 1엔트리 기록 (사용자 규칙). 최신이 위.

---

## 2026-07-07 17:02 — 로그인 하네스 라이브 검증 **성공** (Phase 3 게이트 PASS)

- **목표**: 앞선 입력레이어 블로커 해소 후 원본 클라 → 하네스(47900) 로그인 성공 라이브 검증.
- **블로커 근본원인 확정·수정**: ui_explorer 하드웨어 텍스트 경로(SendInput+KEYEVENTF_UNICODE)가 `sent:0`으로 실패. 진단 결과 `_INPUT` 구조체 union 패딩이 24바이트(sizeof=32)여서 Windows가 기대하는 cbSize=40과 불일치 → SendInput이 ERROR_INVALID_PARAMETER(87)로 거부. `tools/logh7_ui_explorer.py`의 `_pad`를 `c_byte*32`(sizeof=40)로 수정. (mouse_event/keybd_event는 이 구조체를 안 써서 정상이었음 → 텍스트만 실패.) 수정 후 `sent:12`(6자×2이벤트)로 정상, ID/PW 필드에 텍스트 실착.
- **입력 시퀀스**(전부 하드웨어): ID필드 클릭 → `--hw --text test01` → hw TAB → hw BACKSPACE×3 → `--hw --text pass99` → hw ENTER.
- **서버 트레이스 증거**(login-hw-20260707/trace.jsonl):
  - conn1: 0x0034 keysetup 수신 → phase3(0x0035) → 0x0030 transport → inner **0x7000 GIN7 자격증명 디코드**(magic GIN7, account="test01", ver1) → **login-response-sent**(keysetup 0x0031 + redirect 0x7001) → peer-fin.
  - conn2: 클라가 **redirect를 따라 재접속** → keysetup 재핸드셰이크 → inner **0x0020**(로비 핸드셰이크) → inner **0x2000**(로비 메시지 패밀리)까지 진행 후 정지.
  - netstat: 8467↔47900 ESTABLISHED 확인.
- **판정**: 로그인 완전 성공 라이브 검증. 클라가 로그인 화면 통과·자격증명 제출·응답 수신·redirect 추종·로비 프로토콜 개시까지 함. 로비 서버 미구현이라 로비 핸드셰이크는 무응답으로 정지(=DO-NOT 범위, 정상 기대치). 클라 화면은 로그인 화면 유지.
- **증거 파일**: `.omo/live-qa/login-hw-20260707/trace.jsonl`, `harness-stdout.log`, `ui-session/shots/20260707-170202-both-filled.png`(양 필드 입력), `20260707-170256-post-login.png`.
- **정리**: 검증 PID만 종료(클라 34424, 하네스 9584). 47900 해제.
- **후속**: 다음 게이트 = 로비 서버(inner 0x0020/0x2000 핸들러) 구현 → server-dev 라우팅. ui_explorer 구조체 수정은 향후 모든 하드웨어 텍스트 입력에 적용됨.

---

## 2026-07-07 16:41 — 로그인 하네스 라이브 어태치 (Phase 3 게이트)

- **목표**: 원본 클라이언트를 신규 로그인 하네스 서버(47900)에 붙여 로그인 성공 라이브 검증.
- **서버**: `tools/live/logh7_login_harness_launch.mjs`(신규 얇은 기동 래퍼, 코덱/응답 로직 무수정) 로 `createLoginHarnessServer`를 127.0.0.1:47900 리슨. netstat LISTENING(node PID 13320) 확인.
- **클라이언트**: `artifacts\logh7-install\...\exe\g7mtclient.exe` 를 ui_explorer로 기동 → **로그인 화면 풀 렌더 성공**(은하영웅전설 VII 스플래시+ID/PW 입력폼). 이전 사이클 우려(Smart App Control 차단, D3D8/dgVoodoo 사이드카 부재)는 이번엔 **재현 안 됨** — 사이드카 없이 정상 렌더.
- **결과**: **로그인 폼 제출 실패 = 입력레이어 블로커**. ID 필드에는 텍스트 입력 성공(기본 포커스). 그러나 PW 필드에 포커스를 못 줌 — PW 박스 클릭 시 필드별 도움말 말풍선 팝업이 뜨고, 모든 WM_CHAR 텍스트가 ID 필드로만 누적. PostMessage TAB/ENTER 게임 미반영. 4회 시도 동패턴 → Blocked-Loop.
- **증거**: `.omo/live-qa/login-20260707-161752/` (harness-stdout.log, ui-session4/shots/20260707-164135-minimal-pattern.png). `trace.jsonl` **미생성**(프레임 0 수신) — netstat도 ESTABLISHED 없이 LISTENING만 → 클라가 자격증명 미제출로 47900 연결 자체를 안 함이 증거.
- **판정**: Phase 3 클라-어태치(기동+렌더) 증명 완료. 서버측 로그인 응답 경로는 프레임 미수신으로 라이브 미검증(서버 결함 아님, 입력레이어 탓 클라가 송신 못함).
- **정리**: 검증 PID만 종료(클라 38420, 하네스 13320). 47900 해제 확인.
- **다음 스텝**: 입력레이어 우회 — ui_explorer에 하드웨어 키입력(keybd_event, 과거 in-world 입력 돌파에 검증됨) 경로 추가, 또는 PW 필드 하드웨어 클릭 좌표 재탐색 후 keybd_event 타이핑. re-analyst에 폼 포커스/탭 순서 RE 브리프 라우팅.
