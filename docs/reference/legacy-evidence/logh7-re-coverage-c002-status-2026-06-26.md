# 클라 RE 커버리지 + C002(전략 명령) 임계경로 현황 (2026-06-26)

근거: `docs/logh7-function-re-coverage-matrix.md`, `logh7-c002-mechanism-complete-2026-06-23.md`,
`logh7-game-state-change-re-2026-06-25.md`, `logh7-completion-matrix-2026-06-25.md`, 그리고
deep-RE 원장 `.omo/re-audit/functions/G7MTClient/ledger.json` 실측 교차확인.

## 1. G7MTClient deep-RE 커버리지 현황 (P1)

| 바이너리 | total | re_target | deep-RE | re_target대비 | total대비 |
|---|---:|---:|---:|---:|---:|
| G7MTClient (게임 본체) | 13800 | 6089 | **349** | 5.7% | 2.5% |
| BootFirst | 78 | 69 | 69 | 100.0% | 88.5% |
| G7Start (런처) | 1723 | 988 | 289 | 29.3% | 16.8% |
| Gin7UpdateClient (런처) | 2453 | 1405 | 310 | 22.1% | 12.6% |
| setup | 431 | 345 | 0 | 0.0% | 0.0% |
| **합계** | **18485** | **8896** | **1017** | **11.4%** | **5.5%** |

- **lightdoc baseline = 18485/18485 (100%)**: 전 함수 한 줄 자동문서(목적/규약/매개변수수/필드오프셋), 누락 0.
- deep-RE는 게임플레이 레버리지 순. strategic 서브시스템 re_target 404개가 임계경로 핵심.
- "클라 RE 커버리지" 가중 완성도는 ~15%(`logh7-completion-matrix-2026-06-25.md` 기준).

## 2. C002 임계경로 6-레이어 + 함수별 deep-RE 상태 (P0-decompile 체인, P1 상태)

원장 실측: 체인 함수 중 deep-RE 완료(원장 등재)와 lightdoc-only(미등재)를 구분.

| # | 레이어 | 핵심 함수 | deep-RE? |
|---|---|---|---|
| 1 | 패널 위젯 구성(씬셋업) | FUN_0054e570→FUN_004ff3c0→FUN_004fc4e0→**FUN_004f6040** | 부분(FUN_004fc4e0 ✓, 나머지 ✗) |
| 2 | catGate 전이 | **FUN_004fd7a0** / FUN_004fd100 | ✓ 완료 |
| 3 | officer 데이터 채움 | **FUN_004fc4a0** / FUN_004f68f0 | 부분(FUN_004fc4a0 ✓, FUN_004f68f0 ✗) |
| 4 | 함대선택(unit-list) | **FUN_004f6680** / FUN_004f6600 / FUN_004f58c0 | ✗ 전부 미완 |
| 5 | 명령메뉴 build | **FUN_004f5cb0**(클라 내장 카탈로그) | ✓ 완료 |
| 6 | 명령 row dispatch→0x0b01 | **FUN_004f93c0**→**FUN_005737d0**(SendWarpCommand)→FUN_004b78a0 | ✗ 미완 |

### C002 deep-RE 미완 함수 = **9개** (matrix "RE 9함수 deep 미완"과 정확 일치, 원장 0-hit 확인)
`FUN_005737d0` `FUN_004f93c0` `FUN_004f58c0` `FUN_004f6680` `FUN_004f6040`
`FUN_0054e570` `FUN_004ff3c0` `FUN_004f68f0` `FUN_004f6600`
(이미 deep 완료: FUN_004fc4e0·FUN_004fd7a0·FUN_004fd100·FUN_004f5cb0·FUN_004fc4a0·FUN_0050d230·FUN_004ba2b0·FUN_004fef90 등)

## 3. C002 클릭경로 현 결론 (전수 배제, P0)

- 0x0b01 단일 송신 step = **FUN_005737d0**(SendWarpCommand) → FUN_004b48d0 → FUN_004b78a0(1, 0x3b=GRID).
  인스턴스화 = FUN_004f93c0 ← FUN_004f58c0(명령 row 클릭) ← 명령메뉴(0x65/+0x130).
- **입력 2종(마우스·키보드) + 합성 force 4종(case0·event9·+0xb01·+0xb02·+0xb00) 전부 라이브 0x0b01=0.**
  - case0/event-9 seed task = **수신확인 전용**(vtable FUN_005751b0, 송신코드 0개) → 강제해도 송신 불가.
  - +0xb01/+0xb02 latch 강제(541k회) → SendWarpCommand 미인스턴스화(latch ≠ dispatch 경로).
  - 선택은 +0xb00(FUN_005015f0 case2, set점 0x0050801b); 전략 widget이 latch loop에 **미등록**.
- **상류 단일 근본**: 전략-명령 패널 위젯(0x67 unit-list)이 autologin/revival 월드서 **미구성**
  (빌더 FUN_004f6040 미실행 → catGate 직접구동 시 garbage 역참조 크래시 @0x687fa80, live19).
- **∴ C002 종결 = 단발 force/click/key가 아니라 6-레이어 서브시스템 구성/구동 구현**(다중 사이클).
  함수RE·전 layer 라이브 측정·전 force 배제는 100% 완결, 남은 건 순수 구현.

## 4. 상태전환 메커니즘: C002 클릭 vs 서버푸시 (2축 분리, P0)

`logh7-game-state-change-re-2026-06-25.md` 결정적 결론: 상태전환은 **분리된 2축**이며 C002는 한 축일 뿐.
- **AXIS 1 씬 KIND**(로그인↔월드↔패널): 전환자 FUN_0054e570, 호출처는 FSM FUN_004b68f0 **단 하나**.
  → **어떤 와이어 핸들러도 안 씀 = 서버푸시 불가**. 로컬 invoke(Frida/code-cave)로만.
- **AXIS 2 로드-트리거**(전략↔전술 모드): **서버푸시 가능**.
- **C002(클릭)와 로드-트리거(상태전환)는 decoupled** → 수십 사이클 C002만 두드린 게 정체 원인.

## 5. "막히면 우회" 가능한 서버푸시 경로 (P0 RE, 라이브 일부 확정)

| 옵코드 | 핸들러 | 효과 | 게이트 | 클릭불요? |
|---|---|---|---|---|
| **0x0f1f** NotifyTactics | FUN_004c1b20 | 전략→전술 로드-arm(+0x357e8c=2, +0x357e88=0x3f800000) | +0x2a58f8≠0, payload byte0=1 | ✓ |
| **0x0b07** NotifyMovedGrid | FUN_004bee20 | 가시 마커 이동(C002 우회 이동) | +0x2a58f8≠0(grid-active) | ✓ 라이브확정 |
| **0x0b0a** NotifyEnterGridEnd | StrategySequence | 시퀀스 시작(*DAT_007ccffc=1,+4=1) | byte0≠0, mode==2 | ✓ |
| **0x0b09** NotifyEnterGridBegin | — | 0xb0a 분기 선택(+0x4376ec) | — | ✓ |
| **0x42f** NotifyChangeMode | FUN_004c1c30 | unit plot/패널 출현(★mode byte 미변경) | +0x126718≠0 | △ 부분(전환 미완) |

- **레버 선택**: 라이브 `worldbase+0x3579cc` 1-watch → 0이면 0x0f1f, 아니면 0xb09+0xb0a.
- **권고 우회 순**: ① 0x0f1f(byte0=1) 푸시로 최소 가시 전환 → ② 0xb09+0xb0a → ③ 0xb07(마커 이동).
- ⚠️ 정정: 서버코드 주석 "0x42f modeKind→mode grant"는 **디스어셈블 반증**(FUN_004c1c30이 FUN_004c45f0 0회 호출). 0x42f로 mode 전환 불가.

## 6. 다음 RE 타겟

1. **C002 9함수 deep-RE 웨이브**(워크플로): 우선순위 = ① FUN_004f6040(패널 위젯 빌더, 상류근본)
   → ② FUN_004f6680/FUN_004f6600/FUN_004f58c0(unit-list populate/선택) → ③ FUN_004f93c0/FUN_005737d0(dispatch).
2. **FUN_0054e570→FUN_004ff3c0 씬셋업 경로**가 autologin 월드서 패널을 구성하는 조건/트리거 RE
   (현재 미실행 = 상류 근본). FUN_004f68f0 officer-row 데이터 소스 RE.
3. **0x0325 네이티브 756B 레이아웃 RE** → officer 필드(0x24c/0x250) 서버 배선(선택 데이터 선결).
4. 라이브 `worldbase+0x3579cc` watchpoint로 0x0f1f/0xb09 레버 결정 후 서버푸시 우회 라이브 검증.

> 주의: 본 문서의 모든 함수/오프셋은 P0-decompile(디스어셈블 확정) 또는 라이브 측정 근거.
> 미구현 서브시스템 동작은 추측이 아니라 "미구성/미측정"으로 명시. P0 승격은 디컴파일/라이브 확정분만.
