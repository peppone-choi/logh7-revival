import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildShipStatCatalog,
  getShipByKey,
  listShipsByClass,
  listShipsBySide,
  writeShipStatCatalog,
} from '../../src/server/logh7-ship-stat-catalog.mjs';

test('ship stat catalog preserves normalized evidence and missing pool gaps', () => {
  const catalog = buildShipStatCatalog({ normalized: fixtureShipStats() });

  assert.equal(catalog.id, 'logh7-ship-stat-catalog');
  assert.equal(catalog.source.evidenceGrade, 'P1-manual-plus-documented-transform');
  assert.equal(catalog.shipCount, 3);
  assert.deepEqual(catalog.poolFields, [
    'beamPower',
    'defense',
    'maxArmor',
    'maxShield',
    'maxZanki',
    'morale',
  ]);
  assert.deepEqual(catalog.summary.sideCounts, { alliance: 1, empire: 2 });
  assert.deepEqual(catalog.summary.classCounts, {
    battleship: 1,
    carrier: 1,
    destroyer: 1,
  });
  assert.deepEqual(catalog.summary.poolCoverage.maxShield, {
    presentCount: 2,
    missingCount: 1,
    min: 1500,
    max: 20000,
  });

  assert.deepEqual(catalog.ships[1], {
    key: 'Z82',
    sourceIndex: 1,
    name: 'Destroyer',
    side: 'empire',
    shipClass: 'destroyer',
    pools: {
      beamPower: 104,
      maxArmor: 19,
      maxZanki: 40,
      morale: 100,
    },
    missingPools: ['defense', 'maxShield'],
    poolCompleteness: { presentCount: 4, missingCount: 2 },
    inheritsFrom: null,
    variantModifier: null,
    raw: { armor: { confidence: 'med' } },
  });
});

test('ship stat catalog exposes deterministic lookups', () => {
  const catalog = buildShipStatCatalog({ normalized: fixtureShipStats() });

  assert.equal(getShipByKey(catalog, 'SS75').shipClass, 'battleship');
  assert.equal(getShipByKey(catalog, 'UNKNOWN'), undefined);
  assert.deepEqual(listShipsBySide(catalog, 'empire').map((ship) => ship.key), ['SS75', 'Z82']);
  assert.deepEqual(listShipsByClass(catalog, 'carrier').map((ship) => ship.key), ['A10']);
});

test('ship stat catalog rejects unsafe normalized inputs', () => {
  assert.throws(
    () => buildShipStatCatalog({ normalized: { ...fixtureShipStats(), count: 99 } }),
    /ship stats count mismatch/,
  );
  assert.throws(
    () =>
      buildShipStatCatalog({
        normalized: {
          ...fixtureShipStats(),
          ships: [fixtureShipStats().ships[0], fixtureShipStats().ships[0]],
          count: 2,
        },
      }),
    /duplicate ship key/,
  );
});

test('ship stat catalog writer emits generated JSON', () => {
  const outPath = join(mkdtempSync(join(tmpdir(), 'logh7-ship-stats-')), 'catalog.json');
  const catalog = buildShipStatCatalog({ normalized: fixtureShipStats() });

  writeShipStatCatalog(outPath, catalog);

  assert.deepEqual(JSON.parse(readFileSync(outPath, 'utf8')), catalog);
});

test('real ship stat content smoke stays evidence-bound', () => {
  const catalog = buildShipStatCatalog();

  assert.equal(catalog.shipCount, 63);
  assert.deepEqual(catalog.summary.sideCounts, { alliance: 11, empire: 52 });
  assert.equal(catalog.summary.poolCoverage.maxArmor.missingCount, 0);
  assert.equal(catalog.summary.poolCoverage.maxZanki.missingCount, 0);
  assert.equal(catalog.summary.poolCoverage.morale.min, 100);
  assert.match(catalog.source.inferencePolicy, /do not infer combat formulas/);
});

function fixtureShipStats() {
  return {
    _source: 'fixture manual ship table',
    _derivation: { transform: 'fixture documented transform' },
    _note: { what: 'fixture note' },
    count: 3,
    ships: [
      {
        key: 'SS75',
        name: 'Standard Battleship',
        side: 'empire',
        shipClass: 'battleship',
        pools: {
          beamPower: 100,
          defense: 70,
          maxArmor: 56,
          maxShield: 20000,
          maxZanki: 100,
          morale: 100,
        },
        _inherits_from: null,
        _variant_modifier: null,
        _raw: { armor: { confidence: 'none' } },
      },
      {
        key: 'Z82',
        name: 'Destroyer',
        side: 'empire',
        shipClass: 'destroyer',
        pools: {
          beamPower: 104,
          maxArmor: 19,
          maxZanki: 40,
          morale: 100,
        },
        _inherits_from: null,
        _variant_modifier: null,
        _raw: { armor: { confidence: 'med' } },
      },
      {
        key: 'A10',
        name: 'Carrier',
        side: 'alliance',
        shipClass: 'carrier',
        pools: {
          defense: 30,
          maxArmor: 30,
          maxShield: 1500,
          maxZanki: 90,
          morale: 100,
        },
        _inherits_from: 'A09',
        _variant_modifier: { defense: -5 },
        _raw: { shield_guard: { confidence: 'med' } },
      },
    ],
  };
}
