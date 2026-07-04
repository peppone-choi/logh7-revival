import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildRankPromotionCatalog,
  getRankById,
  listRanksByFaction,
  writeRankPromotionCatalog,
} from '../../src/server/logh7-rank-promotion-catalog.mjs';

test('rank promotion catalog normalizes manual rank ladder and caps', () => {
  const catalog = buildRankPromotionCatalog({ manual: fixtureManual() });

  assert.equal(catalog.id, 'logh7-rank-promotion-catalog');
  assert.equal(catalog.source.evidenceGrade, 'P1');
  assert.equal(catalog.rankCount, 4);
  assert.equal(catalog.summary.empireOnlyCount, 1);
  assert.equal(catalog.summary.autoPromoteTierCount, 1);
  assert.deepEqual(catalog.ranks.map((rank) => rank.id), [
    'marshal',
    'senior-admiral',
    'admiral',
    'colonel',
  ]);
  assert.deepEqual(catalog.ranks[1], {
    id: 'senior-admiral',
    sourceIndex: 1,
    tier: 2,
    names: { ja: 'Senior Admiral', en: 'Senior Admiral', ko: 'Senior Admiral KO' },
    empireOnly: true,
    autoPromoteTier: false,
    factionAvailability: { empire: true, alliance: false },
    headcountCapByFaction: { empire: 5, alliance: null },
    capSource: 'rank-specific',
    note: 'Alliance does not use this rank.',
  });
  assert.deepEqual(getRankById(catalog, 'colonel').headcountCapByFaction, {
    empire: 'unlimited',
    alliance: 'unlimited',
  });
  assert.deepEqual(catalog.summary.headcountCaps, {
    numericRankCount: 3,
    unlimitedRankCount: 1,
    unavailableFactionCellCount: 1,
    uncertain: true,
  });
});

test('rank promotion catalog exposes deterministic faction lookups', () => {
  const catalog = buildRankPromotionCatalog({ manual: fixtureManual() });

  assert.equal(getRankById(catalog, 'marshal').tier, 1);
  assert.deepEqual(listRanksByFaction(catalog, 'empire').map((rank) => rank.id), [
    'marshal',
    'senior-admiral',
    'admiral',
    'colonel',
  ]);
  assert.deepEqual(listRanksByFaction(catalog, 'alliance').map((rank) => rank.id), [
    'marshal',
    'admiral',
    'colonel',
  ]);
});

test('rank promotion catalog rejects duplicate normalized rank ids', () => {
  const manual = fixtureManual();
  manual.rankLadder.ranks.push({ ...manual.rankLadder.ranks[0], tier: 99 });

  assert.throws(
    () => buildRankPromotionCatalog({ manual }),
    /duplicate rank id: marshal/,
  );
});

test('rank promotion catalog writer emits generated JSON', () => {
  const catalog = buildRankPromotionCatalog({ manual: fixtureManual() });
  const out = join(mkdtempSync(join(tmpdir(), 'logh7-rank-catalog-')), 'catalog.json');

  writeRankPromotionCatalog(out, catalog);

  const written = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(written.id, 'logh7-rank-promotion-catalog');
  assert.equal(written.rankCount, 4);
});

test('real ranks promotion content smoke preserves manual uncertainty', () => {
  const catalog = buildRankPromotionCatalog();

  assert.equal(catalog.rankCount, 13);
  assert.equal(catalog.source.evidenceGrade, 'P1');
  assert.equal(catalog.summary.empireOnlyCount, 1);
  assert.equal(catalog.summary.autoPromoteTierCount, 7);
  assert.equal(catalog.summary.headcountCaps.uncertain, true);
  assert.equal(listRanksByFaction(catalog, 'alliance').length, 12);
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
          _note: 'Alliance does not use this rank.',
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
      _capUncertaintyNote: 'fixture uncertainty',
      caps: [
        { rank_ja: 'Marshal', empire: 5, alliance: 5 },
        {
          rank_ja: 'Senior Admiral',
          empire: 5,
          alliance: null,
          _note: 'Alliance does not use this rank.',
        },
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
