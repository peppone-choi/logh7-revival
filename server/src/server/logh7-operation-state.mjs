import { evaluateOperationPlanDraft } from './logh7-operation-rules.mjs';

export function draftOperationPlan(catalog, state, request) {
  validateState(state);
  validateStateDraftRequest(request);

  const existingPlanTargetSystemIdsForCard = state.operationPlans
    .filter((plan) => (
      plan.authorityId === request.authorityId
      && plan.operationCardId === request.operationCardId
    ))
    .map((plan) => plan.targetSystemId);

  const decision = evaluateOperationPlanDraft(catalog, {
    purposeId: request.purposeId,
    targetSystemId: request.targetSystemId,
    existingPlanTargetSystemIdsForCard,
    participatingUnitCount: request.participatingUnitIds.length,
    effectiveShipUnitCount: request.effectiveShipUnitIds.length,
    target: request.target,
    newPlanLocked: request.newPlanLocked === true,
  });

  if (decision.status === 'blocked') {
    return { status: 'blocked', state, decision };
  }

  const sequence = state.nextOperationPlanSequence;
  const plan = {
    id: formatPlanId(sequence),
    sequence,
    status: 'planned',
    authorityId: request.authorityId,
    factionId: request.factionId,
    operationCardId: request.operationCardId,
    purposeId: request.purposeId,
    targetSystemId: request.targetSystemId,
    participatingUnitIds: [...request.participatingUnitIds],
    durationDays: catalog.duration.durationDays,
    commandPointCost: unresolvedCommandPointCost(catalog),
    gatesPassed: [...decision.gatesPassed],
    createdTurn: request.createdTurn ?? null,
    source: {
      catalogId: catalog.id,
      ruleSetId: 'logh7-operation-rules',
    },
  };

  return {
    status: 'drafted',
    state: {
      ...state,
      nextOperationPlanSequence: sequence + 1,
      operationPlans: [...state.operationPlans, plan],
    },
    decision,
    plan,
  };
}

function unresolvedCommandPointCost(catalog) {
  if (catalog.commandPointCost.kind !== 'variable-unresolved') {
    throw new Error(`unsupported operation command point cost kind: ${catalog.commandPointCost.kind}`);
  }
  return {
    status: 'variable-cost-unresolved',
    overallRange: { ...catalog.commandPointCost.overallRange },
  };
}

function formatPlanId(sequence) {
  return `operation-plan-${String(sequence).padStart(4, '0')}`;
}

function validateState(state) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('state must be an object');
  }
  if (!Number.isInteger(state.nextOperationPlanSequence) || state.nextOperationPlanSequence < 1) {
    throw new TypeError('nextOperationPlanSequence must be positive integer');
  }
  if (!Array.isArray(state.operationPlans)) {
    throw new TypeError('operationPlans must be an array');
  }
}

function validateStateDraftRequest(request) {
  requireString(request.authorityId, 'authorityId');
  requireString(request.factionId, 'factionId');
  requireString(request.operationCardId, 'operationCardId');
  requireString(request.purposeId, 'purposeId');
  requireString(request.targetSystemId, 'targetSystemId');
  requireStringArray(request.participatingUnitIds, 'participatingUnitIds');
  requireStringArray(request.effectiveShipUnitIds, 'effectiveShipUnitIds');
  if (!request.target || typeof request.target !== 'object') {
    throw new TypeError('target must be an object');
  }
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${field} must be non-empty string`);
  }
}

function requireStringArray(value, field) {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string' && entry.length > 0)) {
    throw new TypeError(`${field} must be an array of non-empty strings`);
  }
}
