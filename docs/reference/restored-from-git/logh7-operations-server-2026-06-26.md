# 작전(作戦/operations) 서버 구현 — 2026-06-26

소스: `server/content/manual/operations.json` (gin7 manual pp.38-40, `_grade` P1 規則 / P2 보너스 수치).
대상 모듈: `src/server/logh7-operation-plan.mjs`(순수 도메인), `src/server/logh7-strategy.mjs`(store/틱 배선).

## 1. 캐논 작전 데이터 (operations.json)

- **작전 목적 3종**: 占領(occupation) / 防衛(defense) / 掃討(sweep).
- **계획 필드**: 작전목적, 목표성계, 참가 함정 유닛 수(상한), 발동 예정 시기(CP 비용 좌우).
- **발령(発令)**: 입안 부서 ≠ 발령 부서(양 진영 공통). 발령은 참가 유닛 확정.
- **개시**: 발령 유닛이 목표 성계 도달 시점 = 작전 시작.
- **지속**: 발령 후 30 게임내일, 또는 作戦撤回(withdrawal) 즉시 종료.
- **결과 보너스(매뉴얼 pp.39-40, P2)**:
  - 占領: 목표 성계 전 행성/요새 지배 → Full(base 전액). 최소 1개 → Partial(~50%, _uncertain).
  - 防衛: 전부 자진영 유지(상실 0) → Full. 1+ 적에 상실 → Partial(~50%).
  - 掃討: 목표 성계 400광년 내 적함 격침마다 +1 보너스(30일 윈도우 누적). 사거리 OCR '兆年'=光年 오독, digest §7로 400ly 확정.

## 2. 기구현 vs 신규

**기구현(이전 세션)** — `logh7-operation-plan.mjs` + `logh7-strategy.mjs`:
- `createOperationPlan`/`validateOperationPlan`/`issuePlan` (입안≠발령, 타깃·유닛상한 검증).
- 작전 store(`operationPlans` Map, status·issuedAt 보존), `storeOperationPlan`, `operationPlanCount`.
- 30일 만료 제거 `tickOperationsIfDue`(만료 대상 제거만, **보너스는 명시적 스텁**).
- 발령 게이트 `LOGH_OPERATION_ISSUE`(opt-in, off-default), 0x0900 MakePlan 입안 배선.

**신규(이번 세션)** — 스텁이던 **작전 목적 + 결과 정산** 구현:
- `OPERATION_PURPOSE`{occupation/defense/sweep} 상수, `SWEEP_RANGE_LY=400`.
- `evaluateOperationOutcome(plan, outcome)` 순수 함수: 占領/防衛 full/partial(1.0/0.5)·none, 掃討 격침×+1. 보너스 분수·points 반환(`_grade:'P2'`).
- `state.recordSweepKill(power,{count})`: 발령된 掃討 작전에만 격침 누적(draft·非掃討 무시, 사거리 필터는 호출자가 SWEEP_RANGE_LY로 사전 적용 가정).
- `tickOperationsIfDue`에 `outcomeFor(power,plan)` 콜백 + `evaluation` 정산 결과 부착(占領/防衛 점령상태는 world-state 주입, 掃討는 누적 sweepKills 사용).
- 0x0900 MakePlan 배선에 `operationCtx.purpose`/`baseBonus` → 작전 레코드 부착(미주입 시 보너스 0 보수 처리, 회귀 0).

## 3. 구현 위치

- `src/server/logh7-operation-plan.mjs`: `OPERATION_PURPOSE`, `SWEEP_RANGE_LY`, `evaluateOperationOutcome` (issuePlan 아래 신규 블록).
- `src/server/logh7-strategy.mjs`: import 확장 + 재노출, `storeOperationPlan`(outcome 누적기), `recordSweepKill`, `tickOperationsIfDue`(evaluation), MakePlan purpose/baseBonus 부착.

## 4. 오라클(테스트)

- `tests/server/logh7-operation-plan.test.mjs`: 占領 full/partial/none, 防衛 full/partial(전부상실)/none, 掃討 격침×+1, 목적 미지정 0, SWEEP_RANGE_LY=400.
- `tests/server/logh7-strategy.test.mjs`: 掃討 격침 누적→30일 만료 정산 보너스 환산, 占領 만료 outcomeFor 콜백 Partial, recordSweepKill draft 제외.

## 5. 테스트 결과

`cd server && node --test tests/server/*.test.mjs` → **1170 tests / 1152 pass / 0 fail / 18 skip** (이전 1158/1140/0/18, +12 신규, 무회귀).

## 6. 잔여

- 보너스 분수(partial ~50%)·掃討 per-kill 증분은 **P2 _uncertain**(OCR/digest) — 라이브로 P0 승격 불가.
- 결과 정산→실제 功績(merit) 적립 배선(personnel/rank-ladder 연결)은 미배선(`evaluation.bonusPoints` 반환까지). world-state 점령 상태 → outcomeFor 공급도 메인 배선 대기.
- 발령 전용 sub-action opcode 라이브 미확정(`LOGH_OPERATION_ISSUE` off-default 유지). CP 비용 numeric table 부재(P3).
