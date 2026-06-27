// logh7-operation-plan: 입안≠발령 + 타깃/유닛상한 검증(순수) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOperationPlan,
  validateOperationPlan,
  issuePlan,
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
