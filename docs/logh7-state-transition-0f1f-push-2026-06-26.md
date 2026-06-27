# 0x0f1f 상태전환 서버푸시 readiness (2026-06-26)

AXIS2(로드-트리거, 서버푸시 가능) 트랙. 근거: `docs/logh7-game-state-change-re-2026-06-25.md`.
C002(AXIS1 씬KIND/event-9 클릭확정)와 decoupled — 0x0f1f는 클릭/패치/Frida 없이 전략↔전술 전환을 arm한다.

## 1. 0x0f1f 빌더 현황
- 이미 존재: `buildNotifyTacticsInner({ arg0, arg1 })` (`server/src/server/logh7-battle-engine.mjs:439`).
  - `buildLobbyResponseInner(0x0f1f, 8)` → message32 inner `[u32 BE 0][u16 BE 0x0f1f][arg0 LE@+6][arg1 LE@+10]`, 8B body.
- `openBattleField`(전술 진입 시퀀스 11단계)의 마지막 단계로 이미 와이어링됨(`logh7-battle-engine.mjs:592`).
- 새로 추가한 것: **빌더 자체는 추가 불필요(RE 확정 byte-correct).** 깨끗한 단독 lever만 신설.

## 2. byte-correct 증거 (RE 확정)
클라 파서 `FUN_004c1b20(param_1, param_2)` (redex `RE/tools/logh7_redex.py func 004c1b20`):
- `param_2` = 0x0f1f payload 포인터(=arg0). `*param_2 == '\x01'` = **arg0 byte0==1**.
- 게이트 `param_1[0x2a58f8] != 0`(전략맵 활성) 위에서 byte0==1이면:
  `+0x357e8c=2`(전술 arm)·`+0x357e84=0`·**`+0x357e88=0x3f800000`(1.0f)**·`*param_1=1`·`+4=1`.
  byte0≠1이면 `+0x357e8c=0`(전략 복귀). (`param_1[0x3579cc]!=0` 선분기는 다른 stage latch 경로.)
- 따라서 `buildNotifyTacticsInner({ arg0: 1 })` → payload `01 00 00 00 00 00 00 00` = load-arm 정확 적중.
- 오라클 테스트(신규): payload[0]==0x01, 길이==8, arg0 LE==1 / arg0=0이면 payload[0]==0x00.

## 3. lever 게이트명 (off-default, 무회귀)
`server/src/server/logh7-login-session.mjs`:
- `LOGH_STATE_TRANSITION_PROBE=1` — 월드 도달(grid-enter) 후 0x0f1f(arg0 byte0=1) 1회 지연 푸시.
- `LOGH_STATE_TRANSITION_DELAY_MS`(기본 9000) — 전략 씬 렌더 후 푸시(즉시 푸시는 렌더 파손, battle probe 교훈).
- `LOGH_STATE_TRANSITION_ARG0`(기본 1=전술 arm, 0=전략 복귀) / `LOGH_STATE_TRANSITION_ARG1`(기본 0).
- ★상호배타: `deferredBattleInners` 필드를 battle/fleet-move probe와 공유 → 그 둘이 **모두 OFF일 때만** 적용.
- 기본 OFF. 추측 데이터 P0 승격 없음(레이아웃은 RE 확정만).

## 4. server 테스트 결과
`cd server && node --test tests/server/*.test.mjs` → **1132 pass / 0 fail** (skip 18).
기존 1130 baseline + 신규 0x0f1f 오라클 2건(load-arm byte0=1, 전략복귀 byte0=0). 게이트 OFF 기본이라 무회귀.

## 5. 라이브 검증 대기 항목 (P1)
- `LOGH_STATE_TRANSITION_PROBE=1`로 월드 진입 후 0x0f1f 푸시 → 라이브 `worldbase+0x357e88`==0x3f800000 / `+0x357e8c`==2 / `+0x126711` 변화 관측 = 최소 가시 전환 확인.
- 레버 선택 게이트: 라이브 `worldbase+0x3579cc` 1-watch. 0이면 0x0f1f, 아니면 0xb09+0xb0a(`LOGH_STRAT_SEQ_START`).
- `FUN_004ff3c0`(kind2 월드씬) "stars만 전환불가" 증상이 이 arm으로 풀리는지 trace.
- 전술 데이터 완전성: 0x0f1f arm만으로 전환 stall 시 `openBattleField` 전술 풀(LOGH_BATTLE_ENTRY_PROBE) 병행 필요 여부.
