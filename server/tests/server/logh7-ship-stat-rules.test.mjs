import assert from 'node:assert/strict';
import test from 'node:test';

import { buildShipStatCatalog } from '../../src/server/logh7-ship-stat-catalog.mjs';
import {
  buildShipStatRuleSet,
  evaluateShipPoolRequirements,
} from '../../src/server/logh7-ship-stat-rules.mjs';

test('ship stat pool rule returns ready only when required pools are present', () => {
  const catalog = buildShipStatCatalog({ normalized: fixtureShipStats() });

  assert.deepEqual(
    evaluateShipPoolRequirements(catalog, 'SS75', {
      requiredPools: ['maxArmor', 'maxZanki', 'morale'],
    }),
    {
      status: 'ready',
      shipKey: 'SS75',
      shipName: 'Standard Battleship',
      requiredPools: ['maxArmor', 'maxZanki', 'morale'],
      pools: { maxArmor: 56, maxZanki: 100, morale: 100 },
    },
  );
});

test('ship stat pool rule refuses to infer missing manual-derived pools', () => {
  const catalog = buildShipStatCatalog({ normalized: fixtureShipStats() });

  assert.deepEqual(
    evaluateShipPoolRequirements(catalog, 'Z82', {
      requiredPools: ['maxShield', 'defense'],
    }),
    {
      status: 'missing-pools',
      shipKey: 'Z82',
      shipName: 'Destroyer',
      requiredPools: ['maxShield', 'defense'],
      missingPools: ['maxShield', 'defense'],
      availablePools: ['beamPower', 'maxArmor', 'maxZanki', 'morale'],
      reason: 'manual-source-gap',
    },
  );
});

test('ship stat pool rule fails closed for unknown ships and invalid requests', () => {
  const catalog = buildShipStatCatalog({ normalized: fixtureShipStats() });

  assert.deepEqual(
    evaluateShipPoolRequirements(catalog, 'UNKNOWN', { requiredPools: ['maxArmor'] }),
    {
      status: 'unknown-ship',
      shipKey: 'UNKNOWN',
      requiredPools: ['maxArmor'],
      reason: 'ship-key-not-in-catalog',
    },
  );
  assert.throws(
    () => evaluateShipPoolRequirements(catalog, 'SS75', { requiredPools: [] }),
    /requiredPools must be non-empty array/,
  );
  assert.throws(
    () => evaluateShipPoolRequirements(catalog, 'SS75', { requiredPools: ['unknownPool'] }),
    /unknown required ship pool/,
  );
});

test('ship stat rule set summarizes evidence without combat formula inference', () => {
  const catalog = buildShipStatCatalog({ normalized: fixtureShipStats() });

  assert.deepEqual(buildShipStatRuleSet(catalog), {
    id: 'logh7-ship-stat-rules',
    sourceCatalogId: 'logh7-ship-stat-catalog',
    shipCount: 2,
    poolFields: ['beamPower', 'defense', 'maxArmor', 'maxShield', 'maxZanki', 'morale'],
    inferencePolicy:
      'require explicit normalized pool values; do not infer missing pools or combat formulas',
  });
});

function fixtureShipStats() {
  return {
    _source: 'fixture manual ship table',
    _derivation: { transform: 'fixture documented transform' },
    _note: { what: 'fixture note' },
    count: 2,
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
    ],
  };
}
