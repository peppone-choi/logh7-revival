import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRankPromotionCatalog } from '../../src/server/logh7-rank-promotion-catalog.mjs';
import {
  buildRankPromotionRuleSet,
  evaluateRankHeadcount,
} from '../../src/server/logh7-rank-promotion-rules.mjs';

test('rank headcount rule opens numeric cap slots', () => {
  const catalog = buildRankPromotionCatalog({ manual: fixtureManual() });

  assert.deepEqual(
    evaluateRankHeadcount(catalog, {
      rankId: 'marshal',
      faction: 'empire',
      currentCount: 4,
    }),
    {
      status: 'cap-open',
      rankId: 'marshal',
      faction: 'empire',
      currentCount: 4,
      cap: 5,
      availableSlots: 1,
      capUncertain: true,
      reason: 'manual-rank-headcount-cap-not-yet-full',
    },
  );
});

test('rank headcount rule blocks full numeric caps', () => {
  const catalog = buildRankPromotionCatalog({ manual: fixtureManual() });

  assert.equal(
    evaluateRankHeadcount(catalog, {
      rankId: 'marshal',
      faction: 'alliance',
      currentCount: 5,
    }).status,
    'cap-full',
  );
});

test('rank headcount rule preserves unlimited colonel-below cap', () => {
  const catalog = buildRankPromotionCatalog({ manual: fixtureManual() });

  assert.deepEqual(
    evaluateRankHeadcount(catalog, {
      rankId: 'colonel',
      faction: 'empire',
      currentCount: 500,
    }),
    {
      status: 'unlimited',
      rankId: 'colonel',
      faction: 'empire',
      currentCount: 500,
      cap: 'unlimited',
      availableSlots: null,
      capUncertain: true,
      reason: 'manual-rank-headcount-cap-unlimited',
    },
  );
});

test('rank headcount rule fails closed for unavailable and unknown inputs', () => {
  const catalog = buildRankPromotionCatalog({ manual: fixtureManual() });

  assert.equal(
    evaluateRankHeadcount(catalog, {
      rankId: 'senior-admiral',
      faction: 'alliance',
      currentCount: 0,
    }).status,
    'rank-unavailable',
  );
  assert.equal(
    evaluateRankHeadcount(catalog, {
      rankId: 'missing-rank',
      faction: 'empire',
      currentCount: 0,
    }).status,
    'unknown-rank',
  );
  assert.equal(
    evaluateRankHeadcount(catalog, {
      rankId: 'marshal',
      faction: 'neutral',
      currentCount: 0,
    }).status,
    'unknown-faction',
  );
});

test('rank promotion rule set summarizes manual cap scope', () => {
  const catalog = buildRankPromotionCatalog({ manual: fixtureManual() });

  assert.deepEqual(buildRankPromotionRuleSet(catalog), {
    id: 'logh7-rank-promotion-rules',
    sourceCatalogId: 'logh7-rank-promotion-catalog',
    rankCount: 4,
    inferencePolicy: 'evaluate explicit manual headcount caps only; do not infer promotion formulas or fame costs',
    headcountCaps: {
      numericRankCount: 3,
      unlimitedRankCount: 1,
      unavailableFactionCellCount: 1,
      uncertain: true,
    },
  });
});

function fixtureManual() {
  return {
    _source: 'fixture manual',
    _grade: 'P1',
    _confidence_notes: ['fixture'],
    rankLadder: {
      ranks: [
        { tier: 1, rank_ja: 'Marshal', rank_en: 'Marshal', rank_ko: 'Marshal KO' },
        {
          tier: 2,
          rank_ja: 'Senior Admiral',
          rank_en: 'Senior Admiral',
          rank_ko: 'Senior Admiral KO',
          empireOnly: true,
        },
        { tier: 3, rank_ja: 'Admiral', rank_en: 'Admiral', rank_ko: 'Admiral KO' },
        {
          tier: 7,
          rank_ja: 'Colonel',
          rank_en: 'Colonel',
          rank_ko: 'Colonel KO',
          autoPromoteTier: true,
        },
      ],
    },
    headcountCaps: {
      _uncertain: true,
      caps: [
        { rank_ja: 'Marshal', empire: 5, alliance: 5 },
        { rank_ja: 'Senior Admiral', empire: 5, alliance: null },
        { rank_ja: 'Admiral', empire: 10, alliance: 10 },
        {
          rank_ja: 'Colonel & below',
          rank_en: 'Colonel & below',
          empire: 'unlimited',
          alliance: 'unlimited',
        },
      ],
    },
    personnelAuthority: { selfRankChange: 'proposal', tiers: [] },
    promotionDemotion: {},
    pointSystems: {},
    flagshipChange: {},
    appointmentAuthority: {},
  };
}
