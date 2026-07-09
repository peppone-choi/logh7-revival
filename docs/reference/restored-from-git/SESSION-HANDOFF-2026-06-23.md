# LOGH VII Revival — Session Handoff (2026-06-23)

> **★ MP 서버 오픈까지의 전체 로드맵·현황 = `docs/logh7-mp-roadmap-2026-06-23.md`(먼저 정독).** Workflow 8도메인 조사·합성·적대검증 산출. 핵심: **C002는 데모/관전 MP엔 불필요(서버푸시 우회)·유저 기원 인터랙티브 MP엔 필수**. 마일스톤 M0→M1(strict인증+0x0b07 클라적용 라이브측정+관전데모)→M2(진영2:2+소속투영+cross-client 유저이동)→M-final(패키징). RE 커버리지 동기화: G7MTClient **294/6089(4.8%)**, 합계 962/8896(10.8%), lightdoc 100%.

> 이전 핸드오프 `docs/SESSION-HANDOFF-2026-06-21.md`에서 이어짐. 이 세션은 **함수 전수 RE 캠페인 착수 + 라이브 월드진입 해결 + C002 키스톤 완전 규명**이 핵심.
> 데이터 등급 P0(클라/와이어 확정)·P1(매뉴얼)·P2(IV-EX)·P3(절차). 서버 `npm run test:server` **1137 green**.

## 🟢 이 세션 성과 (목표 7요구 대비)

| 요구 | 상태 |
|---|---|
| ①클라 RE | deep-RE **945/8896 함수** + lightdoc 18,485(전함수 baseline) + 와이어 양방향 옵코드맵(수신 FUN_004ba2b0 169행+송신 FUN_004b78a0) + LOGH7Launcher.exe .NET 전수 디컴파일. 도구 `tools/logh7_func_{triage,lightdoc,ledger_sync,coverage_report,wave_doc}.py`, 워크플로 `.claude/workflows/logh7-func-re-wave.js`. 행렬 `docs/logh7-function-re-coverage-matrix.md`. |
| ②수신 데이터 검증 | **바이트레벨 0x0323 15/15 필드**(`tools/logh7_decode_0323_verify.mjs`, oracle 1137 pass) + 라이브(클라 730B 수신+초상화 렌더). |
| ③서버 송신 생성 | 바이트정확 빌더 + 서버푸시 라이브(맵전환·직무카드). |
| ④소비 레코드·메소드 추적 | 디스패처 169옵코드 + 라이브 Frida ecx 캡처(enqueue/consume/latch). |
| ⑤자유로운 맵 전환 | 서버푸시 openBattleField(0x42f/0x0f1f) 실행+클라 수신·전환UI 응답. **풀 전술맵 렌더 미완(C002+전술시드 deep-RE).** |
| ⑥직무카드 | 서버푸시 로스터(0x1200~0x120f) 수신. **패널 오픈 미완(C002 게이트).** |
| ⑦커맨드 | **C002 게이트(0x0b01 미발신). 함수RE·경로배제 100% 완결, 구현 잔여.** |
| 리마스터 | 런타임(lanczos/MSAA/16x aniso/maxLOD 라이브) + **에셋 HUD 20텍스처 라이브 드롭인**(`tools/logh7_remaster_hud_tga.py`). 생성형=AI도구 부재. |
| 라이브 월드진입 | **해결**: autologin 변종 + 포그라운드 유지(#8 근본=포그라운드 의존 스플래시). `docs/logh7-live-world-entry-2026-06-23.md`. |

## 🔴 C002 = ⑤⑥⑦의 단일 게이트 (완전 규명, 구현 잔여)

전체 매핑 `docs/logh7-c002-mechanism-complete-2026-06-23.md`. **함수RE 100% + 5종 우회경로 전수 라이브 배제 완료:**
- 마우스 클릭·**키보드**(텍스트위젯 전용)·case0 강제(수신확인 노드만)·+0xb01 강제(541k회)·+0xb02 — **전부 0x0b01=0**.
- **0x0b01 송신 체인(확정)**: 함대선택(+0xb00 latch, set점 0x0050801b, 마우스 좌클릭안정/우클릭) → 명령메뉴 빌더(FUN_004f5cb0, rowCount>0) → 명령 row 클릭(FUN_004f58c0, FUN_005015f0(2)) → FUN_004f93c0(SendWarpCommand 인스턴스화) → FUN_004f90d0 task runner → **FUN_005737d0 → FUN_004b78a0(0x3b=0x0b01)**.
- **★60+사이클 헛클릭 근본**: "별/그리드 셀 클릭"=SelectGrid 타깃조회일 뿐, 진짜 트리거=**명령 메뉴 row 클릭**. case0/event-9는 수신확인 노드만 seed(송신코드 0)라 forcing이 항상 b01=0.
- **★단일 근본**: 전략 게임플레이 서브시스템(함대마커 렌더→선택 latch→명령메뉴)이 revival서 end-to-end 미작동. mode2 라이브: rowCount=0(명령메뉴 빈), 클릭이 함대선택 안 함.

### C002 종결 = 전략-명령 서브시스템 6-레이어 구성 (완전 layer 지도, 9 에이전트·19 세션 전수 확정)
**근본: 전략-명령 서브시스템 전체가 autologin/revival 월드서 미구성·미초기화.** 단발 force/click/key/직접call 8종 전부 라이브 0x0b01=0(각 레이어 구동→다음 미초기화 레이어 노출).
```
1 패널 위젯 구성 (FUN_0054e570→FUN_004ff3c0→FUN_004f6040, widget 0x67)  ✗ 미실행 ← 상류 근본
2 catGate 전이 (FUN_004fd7a0, +0xf4=2)                                  ✓ 직접구동됨(live19), 1 없으면 크래시
3 officer 데이터 (FUN_004fc4a0/FUN_004f68f0, PLAYER_INFO+0x270)          ✗ 0x0325 0x24c 미기록(wire 88B vs 네이티브 756B 불일치)
4 함대선택 (FUN_004f6600, +0x624)                                       ✗ 1+3 선결
5 명령메뉴 build (FUN_004f5cb0, 클라 내장 카탈로그)                      ✗ 4 선결
6 명령 row dispatch (FUN_004f93c0→FUN_005737d0→FUN_004b78a0 0x0b01)     ✗ 5 선결
```
**구현 순서**: ①씬-셋업 패널 구성(FUN_0054e570→FUN_004ff3c0)이 autologin 월드서 왜 미실행인지 RE → 자연 트리거(or positive-control 직접구동 FUN_004f6040). ②**0x0325 네이티브 756B unit record 레이아웃 RE**(현 88B stride builder가 officer 필드 0x24c/0x250 미커버 — wire 재확정 선결) → 서버 officer 배선. ③catGate→선택→메뉴→dispatch 직접구동 positive-control로 레이어별 검증 → 라이브 0x0b01. 완전 map `docs/logh7-c002-mechanism-complete-2026-06-23.md`. 도구 `tools/logh7_c002_{base,enqueue_trace,mode,cmdmenu,bridge,catgate,catgate_force,widget,drive}_probe/pc.py`. **무리한 단발 forcing 금지(8종 배제 라이브 확정) — 서브시스템 구성이 정답.**

## 라이브 절차 (재현, logh7-live)
1. `taskkill //IM node.exe //F; taskkill //IM G7MTClient.exe //F`
2. `python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> start --port 47900 --patched-exe .omo/work/logh7-installed/exe/G7MTClient.autologin.emp1.exe --no-login --env LOGH_*`(env=launcher SetServerEnv 세트 + LOGH_PLAYER_FOCUS_CELL=1)
3. **PowerShell SetForegroundWindow ~35초 유지**(스플래시 통과 필수 — #8 근본).
4. probe/click → trace 0x0b01 확인.
5. **`stop`으로 SHA 복원 필수**(shaVerified:true 확인).

## 다음 즉시 작업
1. **C002 구현 1단계: 함대마커 클릭가능 widget RE+fix**(서브에이전트 다각). 2. 함수 RE 웨이브3(`startBatch=128`, `.claude/workflows/logh7-func-re-wave.js`). 3. G7Start/Gin7/setup 잔여 바이너리.
- canonical playable SHA c1523a5e(부트스트랩 OFF). autologin 변종(emp1/emp2/all1/all2)=라이브 테스트용. git=non-git(필요시 git init).
