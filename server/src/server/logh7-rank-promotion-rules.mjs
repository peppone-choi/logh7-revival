import { getRankById } from './logh7-rank-promotion-catalog.mjs';

const FACTIONS = ['empire', 'alliance'];

export function buildRankPromotionRuleSet(catalog) {
  return {
    id: 'logh7-rank-promotion-rules',
    sourceCatalogId: catalog.id,
    rankCount: catalog.rankCount,
    inferencePolicy:
      'evaluate explicit manual headcount caps only; do not infer promotion formulas or fame costs',
    headcountCaps: catalog.summary.headcountCaps,
  };
}

export function evaluateRankHeadcount(catalog, { rankId, faction, currentCount }) {
  assertNonEmptyString('rankId', rankId);
  assertNonEmptyString('faction', faction);
  if (!Number.isInteger(currentCount) || currentCount < 0) {
    throw new TypeError('currentCount must be non-negative integer');
  }

  const rank = getRankById(catalog, rankId);
  if (!rank) {
    return {
      status: 'unknown-rank',
      rankId,
      faction,
      currentCount,
      cap: null,
      availableSlots: null,
      capUncertain: catalog.summary.headcountCaps.uncertain,
      reason: 'rank-not-in-promotion-catalog',
    };
  }
  if (!FACTIONS.includes(faction)) {
    return {
      status: 'unknown-faction',
      rankId,
      faction,
      currentCount,
      cap: null,
      availableSlots: null,
      capUncertain: catalog.summary.headcountCaps.uncertain,
      reason: 'faction-not-supported-by-rank-catalog',
    };
  }

  const cap = rank.headcountCapByFaction[faction];
  if (cap === null || rank.factionAvailability[faction] !== true) {
    return {
      status: 'rank-unavailable',
      rankId,
      faction,
      currentCount,
      cap,
      availableSlots: null,
      capUncertain: catalog.summary.headcountCaps.uncertain,
      reason: 'manual-rank-unavailable-for-faction',
    };
  }
  if (cap === 'unlimited') {
    return {
      status: 'unlimited',
      rankId,
      faction,
      currentCount,
      cap,
      availableSlots: null,
      capUncertain: catalog.summary.headcountCaps.uncertain,
      reason: 'manual-rank-headcount-cap-unlimited',
    };
  }
  const availableSlots = Math.max(0, cap - currentCount);
  return {
    status: availableSlots > 0 ? 'cap-open' : 'cap-full',
    rankId,
    faction,
    currentCount,
    cap,
    availableSlots,
    capUncertain: catalog.summary.headcountCaps.uncertain,
    reason:
      availableSlots > 0
        ? 'manual-rank-headcount-cap-not-yet-full'
        : 'manual-rank-headcount-cap-full',
  };
}

function assertNonEmptyString(name, value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${name} must be non-empty string`);
  }
}
