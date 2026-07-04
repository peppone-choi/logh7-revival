import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_MANUAL_PATH = join(SERVER_ROOT, 'content', 'manual', 'ranks-promotion.json');
const FACTIONS = ['empire', 'alliance'];

export function loadRanksPromotionManual(path = DEFAULT_MANUAL_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildRankPromotionCatalog({
  manual = loadRanksPromotionManual(),
  manualPath = 'server/content/manual/ranks-promotion.json',
} = {}) {
  validateManual(manual);
  const capContext = buildCapContext(manual.headcountCaps, manual.rankLadder.ranks);
  const seenRankIds = new Set();
  const ranks = manual.rankLadder.ranks.map((rank, sourceIndex) => {
    const normalized = normalizeRank(rank, sourceIndex, capContext);
    if (seenRankIds.has(normalized.id)) {
      throw new Error(`duplicate rank id: ${normalized.id}`);
    }
    seenRankIds.add(normalized.id);
    return normalized;
  });

  return {
    id: 'logh7-rank-promotion-catalog',
    source: {
      manualPath,
      source: manual._source,
      evidenceGrade: manual._grade,
      confidenceNotes: manual._confidence_notes ?? [],
      inferencePolicy:
        'normalize explicit manual rank ladder and headcount caps; preserve promotion/fame uncertainty',
    },
    rankCount: ranks.length,
    ranks,
    personnelAuthority: normalizePersonnelAuthority(manual.personnelAuthority),
    manualRules: summarizeManualRules(manual),
    summary: {
      empireOnlyCount: ranks.filter((rank) => rank.empireOnly).length,
      autoPromoteTierCount: ranks.filter((rank) => rank.autoPromoteTier).length,
      headcountCaps: summarizeHeadcountCaps(ranks, manual.headcountCaps),
    },
  };
}

export function getRankById(catalog, rankId) {
  return catalog.ranks.find((rank) => rank.id === rankId);
}

export function listRanksByFaction(catalog, faction) {
  if (!FACTIONS.includes(faction)) {
    return [];
  }
  return catalog.ranks.filter((rank) => rank.factionAvailability[faction]);
}

export function writeRankPromotionCatalog(path, catalog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

function validateManual(manual) {
  if (!manual || typeof manual !== 'object') {
    throw new TypeError('ranks promotion manual must be an object');
  }
  if (!Array.isArray(manual.rankLadder?.ranks)) {
    throw new TypeError('ranks promotion manual must include rankLadder.ranks');
  }
  if (!Array.isArray(manual.headcountCaps?.caps)) {
    throw new TypeError('ranks promotion manual must include headcountCaps.caps');
  }
}

function buildCapContext(headcountCaps, ranks) {
  const byRankJa = new Map();
  let lowerTierCap = null;
  for (const cap of headcountCaps.caps) {
    if (cap.rank_en === 'Colonel & below') {
      lowerTierCap = cap;
    } else {
      byRankJa.set(cap.rank_ja, cap);
    }
  }
  return { byRankJa, lowerTierCap, ranks };
}

function normalizeRank(rank, sourceIndex, capContext) {
  validateRank(rank, sourceIndex);
  const cap = capContext.byRankJa.get(rank.rank_ja) ?? (rank.autoPromoteTier ? capContext.lowerTierCap : null);
  const headcountCapByFaction = normalizeCapByFaction(cap);
  return {
    id: slugify(rank.rank_en),
    sourceIndex,
    tier: rank.tier,
    names: { ja: rank.rank_ja, en: rank.rank_en, ko: rank.rank_ko },
    empireOnly: rank.empireOnly === true,
    autoPromoteTier: rank.autoPromoteTier === true,
    factionAvailability: {
      empire: headcountCapByFaction.empire !== null,
      alliance: rank.empireOnly === true ? false : headcountCapByFaction.alliance !== null,
    },
    headcountCapByFaction,
    capSource: cap?.rank_en === 'Colonel & below' ? 'colonel-and-below' : cap ? 'rank-specific' : 'not-covered',
    note: rank._note ?? cap?._note ?? null,
  };
}

function validateRank(rank, sourceIndex) {
  if (!Number.isInteger(rank.tier) || rank.tier < 1) {
    throw new TypeError(`rank tier must be positive integer at index ${sourceIndex}`);
  }
  for (const field of ['rank_ja', 'rank_en', 'rank_ko']) {
    if (typeof rank[field] !== 'string' || rank[field].length === 0) {
      throw new TypeError(`rank ${field} must be non-empty string at index ${sourceIndex}`);
    }
  }
}

function normalizeCapByFaction(cap) {
  return {
    empire: normalizeCapValue(cap?.empire),
    alliance: normalizeCapValue(cap?.alliance),
  };
}

function normalizeCapValue(value) {
  if (value === 'unlimited' || value === null) {
    return value;
  }
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }
  return null;
}

function normalizePersonnelAuthority(personnelAuthority) {
  return {
    selfRankChange: personnelAuthority?.selfRankChange ?? null,
    tiers: (personnelAuthority?.tiers ?? []).map((tier, sourceIndex) => ({
      sourceIndex,
      rankBandJa: tier.rankBand_ja,
      empireAuthorityJa: tier.empireAuthority_ja,
      empireAuthorityEn: tier.empireAuthority_en,
      allianceAuthorityJa: tier.allianceAuthority_ja,
      allianceAuthorityEn: tier.allianceAuthority_en,
      uncertain: tier._uncertain === true,
      note: tier._note ?? null,
    })),
  };
}

function summarizeManualRules(manual) {
  return {
    promotionEffects: manual.promotionDemotion?.promotion?.effects ?? [],
    demotionEffects: manual.promotionDemotion?.demotion?.effects ?? [],
    autoPromotionMonthly: manual.promotionDemotion?.autoPromotionMonthly ?? null,
    famePointCost: manual.pointSystems?.famePoints?.decrease?.cost ?? null,
    famePointCostUnresolved: manual.pointSystems?.famePoints?.decrease?._uncertain === true,
    flagshipChangeUncertain: manual.flagshipChange?._uncertain === true,
    appointmentAuthorityRules: manual.appointmentAuthority?.rules ?? [],
  };
}

function summarizeHeadcountCaps(ranks, headcountCaps) {
  let numericRankCount = 0;
  let unlimitedRankCount = 0;
  let unavailableFactionCellCount = 0;
  for (const rank of ranks) {
    const caps = Object.values(rank.headcountCapByFaction);
    if (caps.some((cap) => Number.isInteger(cap))) {
      numericRankCount += 1;
    }
    if (caps.some((cap) => cap === 'unlimited')) {
      unlimitedRankCount += 1;
    }
    unavailableFactionCellCount += caps.filter((cap) => cap === null).length;
  }
  return {
    numericRankCount,
    unlimitedRankCount,
    unavailableFactionCellCount,
    uncertain: headcountCaps._uncertain === true,
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
