// logh7-operation-plan: 입안≠발령 + 타깃/유닛상한 검증(순수) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOperationPlan,
  validateOperationPlan,
  issuePlan,
  evaluateOperationOutcome,
  OPERATION_PURPOSE,
  SWEEP_RANGE_LY,
  PLAN_STATUS,
} from '../../src/server/logh7-operation-plan.mjs';

test('createOperationPlan: draft 상태로 입안', () => {
  const p = createOperationPlan({ id: 1, target: 'X', units: [10, 11] });
  assert.equal(p.status, PLAN_STATUS.DRAFT);
  assert.deepEqual(p.units, [10, 11]);
});

test('validateOperationPlan: 타깃 없음/유닛 없음/상한 초과 에러', () => {
  assert.deepEqual(validateOperationPlan({ target: null, units: [1] }).errors, ['no-target']);
  assert.deepEqual(validateOperationPlan({ target: 'X', units: [] }).errors, ['no-units']);
  assert.deepEqual(validateOperationPlan({ target: 'X', units: [1, 2, 3] }, { maxUnits: 2 }).errors, ['over-unit-cap']);
  assert.equal(validateOperationPlan({ target: 'X', units: [1] }).valid, true);
});

test('validateOperationPlan: validTargets 집합 밖 → invalid-target', () => {
  const valid = new Set(['A', 'B']);
  assert.deepEqual(validateOperationPlan({ target: 'C', units: [1] }, { validTargets: valid }).errors, ['invalid-target']);
  assert.equal(validateOperationPlan({ target: 'A', units: [1] }, { validTargets: valid }).valid, true);
});

test('issuePlan: 검증 통과 → issued 사본, 원본 불변', () => {
  const draft = createOperationPlan({ id: 1, target: 'A', units: [1, 2] });
  const r = issuePlan(draft, {});
  assert.equal(r.issued, true);
  assert.equal(r.plan.status, PLAN_STATUS.ISSUED);
  assert.equal(draft.status, PLAN_STATUS.DRAFT, '원본은 draft 유지(불변)');
});

test('issuePlan: 검증 실패 → 발령 거부 + 에러', () => {
  const bad = createOperationPlan({ id: 2, target: null, units: [] });
  const r = issuePlan(bad, {});
  assert.equal(r.issued, false);
  assert.ok(r.errors.includes('no-target') && r.errors.includes('no-units'));
});

test('issuePlan: 이미 발령된 계획 재발령 거부', () => {
  const issued = { id: 3, target: 'A', units: [1], status: PLAN_STATUS.ISSUED };
  assert.deepEqual(issuePlan(issued, {}), { issued: false, plan: issued, errors: ['already-issued'] });
});

// ── 작전 결과 정산(매뉴얼 pp.38-40 operations.json operationResults) ──────────────────────────────

test('상수: 掃討 사거리 = 400광년(operations.json rangeLightYears)', () => {
  assert.equal(SWEEP_RANGE_LY, 400);
});

test('占領: 목표 전부 지배 → Full(보너스 분수 1.0, base 전액)', () => {
  const plan = { purpose: OPERATION_PURPOSE.OCCUPATION, baseBonus: 100 };
  const r = evaluateOperationOutcome(plan, { targetTotal: 3, controlledByActor: 3 });
  assert.equal(r.result, 'full');
  assert.equal(r.bonusFraction, 1.0);
  assert.equal(r.bonusPoints, 100);
});

test('占領: 최소 1개 지배 → Partial(~50%)', () => {
  const plan = { purpose: OPERATION_PURPOSE.OCCUPATION, baseBonus: 100 };
  const r = evaluateOperationOutcome(plan, { targetTotal: 3, controlledByActor: 1 });
  assert.equal(r.result, 'partial');
  assert.equal(r.bonusFraction, 0.5);
  assert.equal(r.bonusPoints, 50);
});

test('占領: 0개 지배 → none(보너스 없음)', () => {
  const plan = { purpose: OPERATION_PURPOSE.OCCUPATION, baseBonus: 100 };
  const r = evaluateOperationOutcome(plan, { targetTotal: 3, controlledByActor: 0 });
  assert.equal(r.result, 'none');
  assert.equal(r.bonusPoints, 0);
});

test('防衛: 전부 자진영 유지(상실 0) → Full', () => {
  const plan = { purpose: OPERATION_PURPOSE.DEFENSE, baseBonus: 80 };
  const r = evaluateOperationOutcome(plan, { targetTotal: 4, lostToEnemy: 0 });
  assert.equal(r.result, 'full');
  assert.equal(r.bonusPoints, 80);
});

test('防衛: 1개 이상 적에 점령(일부 상실) → Partial(~50%)', () => {
  const plan = { purpose: OPERATION_PURPOSE.DEFENSE, baseBonus: 80 };
  const r = evaluateOperationOutcome(plan, { targetTotal: 4, lostToEnemy: 1 });
  assert.equal(r.result, 'partial');
  assert.equal(r.bonusPoints, 40);
});

test('防衛: 전부 상실 → none', () => {
  const plan = { purpose: OPERATION_PURPOSE.DEFENSE, baseBonus: 80 };
  const r = evaluateOperationOutcome(plan, { targetTotal: 4, lostToEnemy: 4 });
  assert.equal(r.result, 'none');
  assert.equal(r.bonusPoints, 0);
});

test('掃討: 격침 수 × +1 보너스 누적', () => {
  const plan = { purpose: OPERATION_PURPOSE.SWEEP };
  assert.equal(evaluateOperationOutcome(plan, { sweepKills: 7 }).bonusPoints, 7);
  assert.equal(evaluateOperationOutcome(plan, { sweepKills: 7 }).result, 'full');
  assert.equal(evaluateOperationOutcome(plan, { sweepKills: 0 }).result, 'none');
});

test('목적 미지정 → 보너스 없음(규칙 외)', () => {
  assert.equal(evaluateOperationOutcome({}, { targetTotal: 3, controlledByActor: 3 }).bonusPoints, 0);
});
