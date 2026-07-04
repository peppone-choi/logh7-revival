import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MANUAL_PATH = join(SERVER_ROOT, 'content', 'manual', 'operations.json');

const PURPOSE_IDS_BY_NAME = new Map([
  ['占領', 'occupation'],
  ['防衛', 'defense'],
  ['掃討', 'sweep'],
]);

export function loadManualOperations(path = DEFAULT_MANUAL_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildOperationCatalog({
  manual = loadManualOperations(),
  manualPath = 'server/content/manual/operations.json',
} = {}) {
  validateManual(manual);

  const purposes = manual.operationPurposes.map(normalizePurpose);
  const planFields = manual.planFields.map(normalizePlanField);
  const restrictions = manual.planningRestrictions.map(normalizeRestriction);
  const duration = normalizeDuration(manual.issuingOrders.duration);
  const results = manual.operationResults.map(normalizeResult);
  const commandPointCost = normalizeCommandPointCost(manual.commandPointCost);

  return {
    id: 'logh7-operation-catalog',
    source: {
      path: manualPath,
      source: manual._source,
      evidenceGrade: manual._grade,
      confidenceNotes: manual._confidence_notes ?? [],
    },
    purposeCount: purposes.length,
    purposeIds: purposes.map((purpose) => purpose.id),
    purposes,
    planFieldCount: planFields.length,
    planFields,
    planningEffect: {
      bonusOnTopOfNormalMerit: Boolean(manual.planningEffect.bonusOnTopOfNormalMerit),
      description: manual.planningEffect.description ?? null,
    },
    commandPointCost,
    restrictions,
    duration,
    results,
    summary: {
      purposeCount: purposes.length,
      planFieldCount: planFields.length,
      restrictionCount: restrictions.length,
      resultPurposeCount: results.length,
      operationDurationDays: duration.durationDays,
      hasUnresolvedCpFormula: commandPointCost.kind === 'variable-unresolved',
    },
  };
}

export function getOperationPurposeById(catalog, purposeId) {
  const purpose = catalog.purposes.find((entry) => entry.id === purposeId);
  if (!purpose) {
    throw new Error(`unknown operation purpose id: ${purposeId}`);
  }
  return purpose;
}

export function writeOperationCatalog(path, catalog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

function validateManual(manual) {
  if (!manual || typeof manual !== 'object') {
    throw new TypeError('operation manual must be an object');
  }
  if (manual._grade !== 'P1') {
    throw new Error(`operation manual evidence grade must be P1: ${manual._grade}`);
  }
  if (!Array.isArray(manual.operationPurposes) || manual.operationPurposes.length !== 3) {
    throw new Error('operation manual must define exactly 3 purposes');
  }
  for (const key of ['planFields', 'planningRestrictions', 'operationResults']) {
    if (!Array.isArray(manual[key]) || manual[key].length === 0) {
      throw new Error(`operation manual missing non-empty array: ${key}`);
    }
  }
  if (!manual.commandPointCost || typeof manual.commandPointCost !== 'object') {
    throw new Error('operation manual missing commandPointCost');
  }
  if (!manual.issuingOrders?.duration || typeof manual.issuingOrders.duration !== 'object') {
    throw new Error('operation manual missing issuingOrders.duration');
  }
}

function normalizePurpose(raw) {
  const id = PURPOSE_IDS_BY_NAME.get(raw.ja);
  if (!id) {
    throw new Error(`unknown operation purpose name: ${raw.ja}`);
  }
  return {
    id,
    nameJa: requireString(raw.ja, 'operation purpose ja'),
    nameEn: requireString(raw.en, 'operation purpose en'),
    nameKo: requireString(raw.ko, 'operation purpose ko'),
    description: requireString(raw.description, 'operation purpose description'),
    targetConstraint: requireString(raw.targetConstraint, 'operation purpose targetConstraint'),
    gates: {
      enemyOnly: Boolean(raw.targetMustBeEnemyOnly),
      ownHoldingRequired: Boolean(raw.targetMustHaveOwnHolding),
      loneShipsRequired: Boolean(raw.targetOnlyLoneShips),
      anySystem: Boolean(raw.targetAnySystem),
    },
  };
}

function normalizePlanField(raw, index) {
  return {
    id: `field-${String(index + 1).padStart(2, '0')}`,
    nameJa: requireString(raw.ja, 'plan field ja'),
    nameEn: requireString(raw.en, 'plan field en'),
    nameKo: requireString(raw.ko, 'plan field ko'),
    note: requireString(raw.note, 'plan field note'),
    affectsCommandPointCost: Boolean(raw.affectsCommandPointCost),
  };
}

function normalizeRestriction(raw, index) {
  return {
    id: `restriction-${String(index + 1).padStart(2, '0')}`,
    nameJa: requireString(raw.ja, 'restriction ja'),
    nameEn: requireString(raw.en, 'restriction en'),
    rule: requireString(raw.rule, 'restriction rule'),
  };
}

function normalizeCommandPointCost(raw) {
  const range = requireString(raw.overallRangeFromSection10, 'overall CP range').match(/^(\d+)-(\d+) CP$/);
  if (!range) {
    throw new Error(`unsupported operation CP range: ${raw.overallRangeFromSection10}`);
  }
  return {
    kind: 'variable-unresolved',
    variesBy: requireString(raw.variesBy, 'operation CP variesBy'),
    numericTable: raw.numericTable ?? null,
    overallRange: {
      minCp: Number(range[1]),
      maxCp: Number(range[2]),
      raw: raw.overallRangeFromSection10,
    },
    uncertain: Boolean(raw._uncertain),
    note: requireString(raw.note, 'operation CP note'),
  };
}

function normalizeDuration(raw) {
  if (!Number.isInteger(raw.durationDays) || raw.durationDays <= 0) {
    throw new Error(`operation durationDays must be positive integer: ${raw.durationDays}`);
  }
  return {
    durationDays: raw.durationDays,
    earlyWithdrawalCommand: {
      nameJa: requireString(raw.earlyWithdrawalCommand?.ja, 'early withdrawal ja'),
      nameEn: requireString(raw.earlyWithdrawalCommand?.en, 'early withdrawal en'),
    },
  };
}

function normalizeResult(raw) {
  return {
    purposeId: PURPOSE_IDS_BY_NAME.get(raw.ja) ?? raw.en.toLowerCase(),
    nameJa: requireString(raw.ja, 'operation result ja'),
    nameEn: requireString(raw.en, 'operation result en'),
    evaluationTiming: raw.evaluationTiming ?? null,
    outcomes: raw.outcomes.map((outcome) => ({
      condition: outcome.condition ?? null,
      conditionJa: outcome.conditionJa ?? null,
      bonus: outcome.bonus ?? null,
      bonusFraction: outcome.bonusFraction ?? null,
      uncertain: Boolean(outcome._uncertain),
    })),
  };
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`operation catalog missing string field: ${field}`);
  }
  return value;
}
