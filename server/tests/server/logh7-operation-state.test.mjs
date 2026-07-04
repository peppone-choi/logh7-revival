import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOperationCatalog } from '../../src/server/logh7-operation-catalog.mjs';
import { draftOperationPlan } from '../../src/server/logh7-operation-state.mjs';

function emptyState(overrides = {}) {
  return {
    nextOperationPlanSequence: 1,
    operationPlans: [],
    ...overrides,
  };
}

function occupationDraft(overrides = {}) {
  return {
    authorityId: 'imperial-general-staff',
    factionId: 'imperial',
    operationCardId: 'card-amritsar-front',
    purposeId: 'occupation',
    targetSystemId: 'amritsar',
    participatingUnitIds: ['fleet-001', 'fleet-002'],
    effectiveShipUnitIds: ['fleet-001', 'fleet-002', 'fleet-003'],
    target: { enemyHoldingCount: 2, ownHoldingCount: 0, hasLoneShips: false },
    createdTurn: 42,
    ...overrides,
  };
}

test('operation state reducer appends a planned operation when explicit gates pass', () => {
  const catalog = buildOperationCatalog();
  const state = emptyState();

  const result = draftOperationPlan(catalog, state, occupationDraft());

  assert.equal(result.status, 'drafted');
  assert.deepEqual(state.operationPlans, []);
  assert.equal(result.state.nextOperationPlanSequence, 2);
  assert.deepEqual(result.decision, {
    status: 'draftable',
    purposeId: 'occupation',
    targetSystemId: 'amritsar',
    gatesPassed: ['enemy-only-target', 'duplicate-target-clear', 'unit-cap-ok', 'new-plan-not-locked'],
  });
  assert.deepEqual(result.state.operationPlans, [
    {
      id: 'operation-plan-0001',
      sequence: 1,
      status: 'planned',
      authorityId: 'imperial-general-staff',
      factionId: 'imperial',
      operationCardId: 'card-amritsar-front',
      purposeId: 'occupation',
      targetSystemId: 'amritsar',
      participatingUnitIds: ['fleet-001', 'fleet-002'],
      durationDays: 30,
      commandPointCost: {
        status: 'variable-cost-unresolved',
        overallRange: { minCp: 10, maxCp: 1280, raw: '10-1280 CP' },
      },
      gatesPassed: ['enemy-only-target', 'duplicate-target-clear', 'unit-cap-ok', 'new-plan-not-locked'],
      createdTurn: 42,
      source: {
        catalogId: 'logh7-operation-catalog',
        ruleSetId: 'logh7-operation-rules',
      },
    },
  ]);
});

test('operation state reducer blocks duplicate target for the same authority card without changing state', () => {
  const catalog = buildOperationCatalog();
  const state = emptyState({
    nextOperationPlanSequence: 7,
    operationPlans: [
      {
        id: 'operation-plan-0006',
        sequence: 6,
        status: 'planned',
        authorityId: 'imperial-general-staff',
        factionId: 'imperial',
        operationCardId: 'card-amritsar-front',
        purposeId: 'occupation',
        targetSystemId: 'amritsar',
        participatingUnitIds: ['fleet-001'],
      },
    ],
  });

  const result = draftOperationPlan(catalog, state, occupationDraft());

  assert.equal(result.status, 'blocked');
  assert.equal(result.state, state);
  assert.deepEqual(result.decision, {
    status: 'blocked',
    purposeId: 'occupation',
    targetSystemId: 'amritsar',
    reasons: ['duplicate-target-system-for-card'],
  });
});

test('operation state reducer blocks lockout and unit-cap violations without changing state', () => {
  const catalog = buildOperationCatalog();
  const state = emptyState();

  const result = draftOperationPlan(catalog, state, occupationDraft({
    participatingUnitIds: ['fleet-001', 'fleet-002', 'fleet-003'],
    effectiveShipUnitIds: ['fleet-001'],
    newPlanLocked: true,
  }));

  assert.equal(result.status, 'blocked');
  assert.equal(result.state, state);
  assert.deepEqual(result.decision, {
    status: 'blocked',
    purposeId: 'occupation',
    targetSystemId: 'amritsar',
    reasons: ['participating-units-exceed-effective-total', 'new-plan-locked'],
  });
});
