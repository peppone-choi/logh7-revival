import { getOperationPurposeById } from './logh7-operation-catalog.mjs';

export function evaluateOperationPlanDraft(catalog, request) {
  const purpose = getOperationPurposeById(catalog, request.purposeId);
  validateDraftRequest(request);

  const reasons = [];
  const gatesPassed = [];

  if (purpose.gates.enemyOnly) {
    if (request.target.enemyHoldingCount > 0 && request.target.ownHoldingCount === 0) {
      gatesPassed.push('enemy-only-target');
    } else {
      reasons.push('target-not-enemy-only');
    }
  }
  if (purpose.gates.ownHoldingRequired) {
    if (request.target.ownHoldingCount > 0) {
      gatesPassed.push('own-holding-target');
    } else {
      reasons.push('target-has-no-own-holding');
    }
  }
  if (purpose.gates.loneShipsRequired) {
    if (request.target.hasLoneShips) {
      gatesPassed.push('lone-ships-target');
    } else {
      reasons.push('target-has-no-lone-ships');
    }
  }

  if (request.existingPlanTargetSystemIdsForCard.includes(request.targetSystemId)) {
    reasons.push('duplicate-target-system-for-card');
  } else {
    gatesPassed.push('duplicate-target-clear');
  }

  if (request.participatingUnitCount > request.effectiveShipUnitCount) {
    reasons.push('participating-units-exceed-effective-total');
  } else {
    gatesPassed.push('unit-cap-ok');
  }

  if (request.newPlanLocked === true) {
    reasons.push('new-plan-locked');
  } else {
    gatesPassed.push('new-plan-not-locked');
  }

  if (reasons.length > 0) {
    return {
      status: 'blocked',
      purposeId: request.purposeId,
      targetSystemId: request.targetSystemId,
      reasons,
    };
  }

  return {
    status: 'draftable',
    purposeId: request.purposeId,
    targetSystemId: request.targetSystemId,
    gatesPassed,
  };
}

export function getOperationCostSpec(catalog) {
  if (catalog.commandPointCost.kind !== 'variable-unresolved') {
    throw new Error(`unsupported operation cost kind: ${catalog.commandPointCost.kind}`);
  }
  return {
    status: 'variable-cost-unresolved',
    variesBy: catalog.commandPointCost.variesBy,
    overallRange: catalog.commandPointCost.overallRange,
    reason: 'manual-lacks-scheduled-timing-cp-table',
  };
}

export function buildOperationRuleSet(catalog) {
  return {
    id: 'logh7-operation-rules',
    sourceCatalogId: catalog.id,
    purposeCount: catalog.purposeCount,
    fixedDurationDays: catalog.duration.durationDays,
    explicitDraftGateCount: 7,
    unresolvedCost: catalog.commandPointCost.kind === 'variable-unresolved',
    inferencePolicy: 'evaluate only manual-stated draft gates; do not infer CP formula or outcome simulation',
  };
}

function validateDraftRequest(request) {
  requireString(request.targetSystemId, 'targetSystemId');
  requireStringArray(request.existingPlanTargetSystemIdsForCard, 'existingPlanTargetSystemIdsForCard');
  requireNonNegativeInteger(request.participatingUnitCount, 'participatingUnitCount');
  requireNonNegativeInteger(request.effectiveShipUnitCount, 'effectiveShipUnitCount');
  if (!request.target || typeof request.target !== 'object') {
    throw new TypeError('target must be an object');
  }
  requireNonNegativeInteger(request.target.enemyHoldingCount, 'target.enemyHoldingCount');
  requireNonNegativeInteger(request.target.ownHoldingCount, 'target.ownHoldingCount');
  if (typeof request.target.hasLoneShips !== 'boolean') {
    throw new TypeError('target.hasLoneShips must be boolean');
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function requireStringArray(value, field) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new TypeError(`${field} must be an array of strings`);
  }
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative integer`);
  }
}
