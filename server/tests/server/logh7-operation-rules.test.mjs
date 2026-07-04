import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOperationCatalog } from '../../src/server/logh7-operation-catalog.mjs';
import {
  buildOperationRuleSet,
  evaluateOperationPlanDraft,
  getOperationCostSpec,
} from '../../src/server/logh7-operation-rules.mjs';

test('operation draft rules admit targets that satisfy explicit manual gates', () => {
  const catalog = buildOperationCatalog();

  assert.deepEqual(
    evaluateOperationPlanDraft(catalog, {
      purposeId: 'occupation',
      targetSystemId: 'amritsar',
      existingPlanTargetSystemIdsForCard: [],
      participatingUnitCount: 12,
      effectiveShipUnitCount: 30,
      target: { enemyHoldingCount: 3, ownHoldingCount: 0, hasLoneShips: false },
    }),
    {
      status: 'draftable',
      purposeId: 'occupation',
      targetSystemId: 'amritsar',
      gatesPassed: ['enemy-only-target', 'duplicate-target-clear', 'unit-cap-ok', 'new-plan-not-locked'],
    },
  );
});

test('operation draft rules block explicit target gate violations', () => {
  const catalog = buildOperationCatalog();

  assert.deepEqual(
    evaluateOperationPlanDraft(catalog, {
      purposeId: 'occupation',
      targetSystemId: 'iserlohn',
      existingPlanTargetSystemIdsForCard: [],
      participatingUnitCount: 8,
      effectiveShipUnitCount: 30,
      target: { enemyHoldingCount: 2, ownHoldingCount: 1, hasLoneShips: false },
    }),
    {
      status: 'blocked',
      purposeId: 'occupation',
      targetSystemId: 'iserlohn',
      reasons: ['target-not-enemy-only'],
    },
  );

  assert.deepEqual(
    evaluateOperationPlanDraft(catalog, {
      purposeId: 'defense',
      targetSystemId: 'empty-grid',
      existingPlanTargetSystemIdsForCard: [],
      participatingUnitCount: 8,
      effectiveShipUnitCount: 30,
      target: { enemyHoldingCount: 0, ownHoldingCount: 0, hasLoneShips: false },
    }).reasons,
    ['target-has-no-own-holding'],
  );

  assert.deepEqual(
    evaluateOperationPlanDraft(catalog, {
      purposeId: 'sweep',
      targetSystemId: 'vermillion',
      existingPlanTargetSystemIdsForCard: [],
      participatingUnitCount: 8,
      effectiveShipUnitCount: 30,
      target: { enemyHoldingCount: 1, ownHoldingCount: 0, hasLoneShips: false },
    }).reasons,
    ['target-has-no-lone-ships'],
  );
});

test('operation draft rules enforce duplicate target, unit cap, and lockout gates', () => {
  const catalog = buildOperationCatalog();

  assert.deepEqual(
    evaluateOperationPlanDraft(catalog, {
      purposeId: 'sweep',
      targetSystemId: 'amritsar',
      existingPlanTargetSystemIdsForCard: ['amritsar'],
      participatingUnitCount: 31,
      effectiveShipUnitCount: 30,
      newPlanLocked: true,
      target: { enemyHoldingCount: 0, ownHoldingCount: 0, hasLoneShips: true },
    }),
    {
      status: 'blocked',
      purposeId: 'sweep',
      targetSystemId: 'amritsar',
      reasons: ['duplicate-target-system-for-card', 'participating-units-exceed-effective-total', 'new-plan-locked'],
    },
  );
});

test('operation cost spec preserves unresolved manual CP formula', () => {
  const catalog = buildOperationCatalog();

  assert.deepEqual(getOperationCostSpec(catalog), {
    status: 'variable-cost-unresolved',
    variesBy: '発動予定時期 (scheduled activation timing)',
    overallRange: { minCp: 10, maxCp: 1280, raw: '10-1280 CP' },
    reason: 'manual-lacks-scheduled-timing-cp-table',
  });
});

test('operation rule set summarizes explicit gate coverage', () => {
  const catalog = buildOperationCatalog();

  assert.deepEqual(buildOperationRuleSet(catalog), {
    id: 'logh7-operation-rules',
    sourceCatalogId: 'logh7-operation-catalog',
    purposeCount: 3,
    fixedDurationDays: 30,
    explicitDraftGateCount: 7,
    unresolvedCost: true,
    inferencePolicy: 'evaluate only manual-stated draft gates; do not infer CP formula or outcome simulation',
  });
});

test('operation draft rules fail closed for unknown ids and invalid counts', () => {
  const catalog = buildOperationCatalog();

  assert.throws(
    () => evaluateOperationPlanDraft(catalog, {
      purposeId: 'missing',
      targetSystemId: 'amritsar',
      existingPlanTargetSystemIdsForCard: [],
      participatingUnitCount: 1,
      effectiveShipUnitCount: 2,
      target: { enemyHoldingCount: 1, ownHoldingCount: 0, hasLoneShips: false },
    }),
    /unknown operation purpose id: missing/,
  );
  assert.throws(
    () => evaluateOperationPlanDraft(catalog, {
      purposeId: 'occupation',
      targetSystemId: 'amritsar',
      existingPlanTargetSystemIdsForCard: [],
      participatingUnitCount: -1,
      effectiveShipUnitCount: 2,
      target: { enemyHoldingCount: 1, ownHoldingCount: 0, hasLoneShips: false },
    }),
    /participatingUnitCount must be a non-negative integer/,
  );
});
