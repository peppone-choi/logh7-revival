# 작전(作戦) 결과정산 → 功績(achievement) 적립 배선 (2026-06-26, A5)

## 요약
이전 자율트랙5에서 `evaluateOperationOutcome`(占領/防衛/掃討 보너스 분수) + `tickOperationsIfDue` 30일 만료
정산까지 구현했으나, **"정산 결과(bonusPoints)를 실제 인물 功績에 적립"**하는 마지막 배선과 **world-state 점령
상태 공급**이 잔여였다. 이번에 그 두 갭을 닫았다.

## 적립 경로
1. **원시 연산**: `personnelState.addAchievement(charId, delta)` 추가 — 功績 비음수 가산/차감(0 미만 클램프).
   진급 5법칙 법칙1(功績)에 그대로 반영된다.
2. **발령 사령관 식별**: 작전 plan에 `commander`(발령 인물 id) 필드 부착. `processStrategy`의 MakePlan 경로가
   `operationCtx.commander`를 draft에 붙이고, 발령(issue) 시 store에 보존한다. 미주입(레거시)이면 미설정.
3. **정산 배선**: `creditOperationMerit(expired, personnelState)` — `tickOperationsIfDue`가 반환한 만료 작전
   목록의 `evaluation.bonusPoints`를 각 `plan.commander`의 功績에 `addAchievement`로 적립한다.
   - draft(미발령) 작전은 `issuedAt=null`이라 **만료 목록(expired)에 구조적으로 오르지 않음** → 적립 제외.
   - `commander` 없음 / `bonusPoints ≤ 0`(占領 실패 등)이면 건너뜀(규칙외·정보부재 보수적).

## 배선 위치
- `src/server/logh7-personnel.mjs`: `addAchievement(characterId, delta)` 신규(roster 원시 연산).
- `src/server/logh7-strategy.mjs`:
  - MakePlan 경로에 `draft.commander = operationCtx.commander` 부착.
  - `creditOperationMerit(expired, personnelState)` 신규 export(정산→적립 배선).
- `src/server/logh7-auth-server.mjs` 경제 틱(`runEconomyTickOnce`):
  - `outcomeFor(power, plan)` 콜백을 world-state 갤럭시에서 공급 — 占領/防衛 plan.target(성계명)을
    `worldState.getSystem`으로 조회, 소유가 발령 진영(power 1=empire/2=alliance)이면 `controlledByActor=1`,
    아니면 `lostToEnemy=1`(目標 1곳 모델, P2). 미상 target이면 `{}`(보너스 0, 보수적). 掃討는 불요.
  - 만료 후 `creditOperationMerit(expired, worldState._personnel)`로 사령관 功績 적립 + 트레이스(`merits`).

## 게이트/회귀
- 전체 경로는 기존 발령 게이트 `LOGH_OPERATION_ISSUE=1`(opt-in) 안에서만 동작. 게이트 off면 발령 작전이
  없어(`issuedAt=null`) 만료·적립 모두 no-op = 회귀 0.
- `commander` 미주입 레거시 호출은 적립 대상에서 빠짐 → 기존 동작 불변.

## 오라클 (tests/server/logh7-strategy.test.mjs, 신규 8건)
- ★占領 성공(Full=보너스 100) → 사령관 功績 100→200 적립.
- draft(미발령)는 만료 목록에 없어 적립 제외, 功績 불변.
- 占領 실패(보너스 0) → 적립 건너뜀, 功績 불변.
- commander 미주입(掃討 보너스 3 존재) → 적립 0(회귀 가드).
- 掃討 5격침 → 사령관 功績 +5.
- `addAchievement` 비음수 클램프 + 미상 캐릭터 null.
- MakePlan operationCtx.commander 주입 → 발령 작전에 commander 부착(LOGH_OPERATION_ISSUE=1).

## 테스트 결과
- `node --test --test-concurrency=1 tests/server/*.test.mjs`: **1180 tests / 1162 pass / 0 fail / 18 skip**
  (= 베이스라인 1154 pass + 신규 8). 무회귀 확정.
- 기본 병렬 실행에서 간헐 9 fail은 프로세스 경합(수집 953건으로 감소)에 의한 플레이키이며 재실행 시 1162
  pass/0 fail로 클린(직렬 실행도 0 fail) — 본 변경과 무관.

## 잔여
- plan.target → 성계명(문자열) 매핑이 P3(라이브 와이어 미확정). 현재 `getSystem` 조회되는 target만 占領/防衛
  보너스를 받고, 와이어상 opaque dword target은 미상 처리(보너스 0). 발령 sub-action opcode 라이브 확정 시
  target id↔성계명 해소 필요.
- `recordSweepKill` 트리거(목표 성계 400광년 내 적함 격침)의 전투 도메인→strategy 배선은 별도(현재 store API만).
