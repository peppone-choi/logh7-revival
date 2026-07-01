import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openContentSource } from '../../src/server/logh7-content-source.mjs';
import { buildContentPackDataFromSource } from '../../src/server/logh7-content-adapter.mjs';
import { createContentPack } from '../../src/server/logh7-content-pack.mjs';
import {
  WORLD_CONTENT_OPCODE_CONTRACT,
  buildWorldContentExposure,
  validateWorldContentExposure,
} from '../../src/server/logh7-world-content-exposure.mjs';

const readJson = (relativeUrl) => JSON.parse(readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), 'utf8'));

function loadContentPack() {
  const source = openContentSource({ build: true });
  try {
    return createContentPack(buildContentPackDataFromSource(source));
  } finally {
    source.close();
  }
}

test('world content exposure ties galaxy, planets, economy, and special bodies to consumed opcodes', () => {
  const pack = loadContentPack();
  const exposure = buildWorldContentExposure({
    pack,
    galaxyDoc: readJson('../../content/galaxy.json'),
    planetEconomyDoc: readJson('../../content/planet-economy.json'),
  });

  assert.deepEqual(validateWorldContentExposure(exposure), []);
assert.deepEqual(WORLD_CONTENT_OPCODE_CONTRACT.map((entry) => [entry.request, entry.response]), [
  [0x0304, 0x0305],
  [0x0306, 0x0307],
  [0x0312, 0x0313],
  [0x0314, 0x0315],
[0x031e, 0x031f],
[0x0320, 0x0321],
[0x0322, 0x0323],
[0x0324, 0x0325],
[0x0326, 0x0327],
[0x0328, 0x0329],
[0x032a, 0x032b],
[0x032e, 0x032f],
  [0x034e, 0x034f],
]);
assert.equal(WORLD_CONTENT_OPCODE_CONTRACT.find((entry) => entry.response === 0x0305).status, 'known-builder-not-default');
assert.deepEqual(
  WORLD_CONTENT_OPCODE_CONTRACT
    .find((entry) => entry.response === 0x0305)
    .nativeFactoryBranches
    .map((entry) => [entry.factoryIdHex, entry.followupInnerCodeHex]),
  [
    ['0x0019', '0x0903'],
    ['0x003f', '0x0c02'],
    ['0x0040', '0x0c05'],
  ],
);
assert.deepEqual(
  exposure.opcodeContract
    .find((entry) => entry.response === 0x0305)
    .nativeFactoryBranches
    .map((entry) => [entry.factoryIdHex, entry.consumer]),
  [
    ['0x0019', 'FUN_005312b0'],
    ['0x003f', 'FUN_005312b0'],
    ['0x0040', 'FUN_005312b0'],
  ],
);
assert.equal(WORLD_CONTENT_OPCODE_CONTRACT.find((entry) => entry.response === 0x0307).contentGaps[0], 'canonical command descriptor packed fields not fully recovered');
assert.deepEqual(exposure.consumersByDataset.systems.map((entry) => [entry.request, entry.response]), [
    [0x0312, 0x0313],
    [0x0314, 0x0315],
    [0x031e, 0x031f],
    [0x0320, 0x0321],
    [0x0326, 0x0327],
    [0x0328, 0x0329],
  ]);
assert.deepEqual(exposure.consumersByDataset.planets.map((entry) => [entry.request, entry.response]), [
[0x031e, 0x031f],
[0x0320, 0x0321],
[0x0326, 0x0327],
[0x0328, 0x0329],
]);
assert.deepEqual(exposure.consumersByDataset.characters.map((entry) => [entry.request, entry.response]), [
[0x0322, 0x0323],
[0x032e, 0x032f],
[0x034e, 0x034f],
]);
assert.deepEqual(exposure.consumersByDataset.units.map((entry) => [entry.request, entry.response]), [
[0x0324, 0x0325],
[0x032a, 0x032b],
[0x032e, 0x032f],
]);
assert.deepEqual(exposure.opcodeContract.find((entry) => entry.request === 0x034e).commandTargetReasons, [
'0x034e-card-character',
]);
assert.deepEqual(exposure.targetProducersByKind.base.map((entry) => entry.request), [
0x031e,
0x0320,
0x0326,
0x0328,
]);
assert.deepEqual(exposure.targetProducersByKind.gridCell.map((entry) => entry.request), [
0x0314,
]);
assert.deepEqual(exposure.targetProducersByKind.character.map((entry) => entry.request), [
0x0322,
0x032e,
0x034e,
]);
assert.deepEqual(exposure.targetProducersByKind.outfit.map((entry) => entry.request), [
0x0324,
0x032a,
0x032e,
]);
assert.equal(exposure.targetProducersByKind.package.at(-1).request, 0x032e);
assert.deepEqual(exposure.consumersByDataset.specialBodies.map((entry) => [entry.request, entry.response]), [
    [0x0312, 0x0313],
    [0x0314, 0x0315],
  ]);
  assert.equal(exposure.systems.packCount, 85);
  assert.equal(exposure.systems.coordinateConfirmedCount, 80);
  assert.equal(exposure.systems.coordinatePendingCount, 5);
  assert.equal(exposure.strategicGrid.width, 100);
  assert.equal(exposure.strategicGrid.height, 50);
  assert.equal(exposure.strategicGrid.decodedCellCount, 5000);
  assert.equal(exposure.strategicGrid.markerCount, 80);
  assert.deepEqual(exposure.strategicGrid.missingMarkers, []);
  assert.deepEqual(exposure.strategicGrid.mismatchedObjectRecords, []);
  assert.equal(exposure.planets.packCount, 300);
  assert.equal(exposure.planets.galaxyJsonCount, 300);
  assert.equal(exposure.planets.economyCount, 300);
  assert.deepEqual(exposure.planets.missingEconomySystems, []);
  assert.equal(exposure.specialBodies.blackHoleCount, 3);
  assert.equal(exposure.specialBodies.neutronStarCount, 3);
});

test('world content exposure validator catches weak or disconnected content', () => {
  const errors = validateWorldContentExposure({
    systems: { packCount: 85, coordinateConfirmedCount: 79 },
    strategicGrid: { width: 100, height: 50, decodedCellCount: 4999, markerCount: 78, missingMarkers: [{ name: 'X' }] },
    planets: { packCount: 299, economyCount: 0, missingEconomySystems: ['Y'] },
    specialBodies: { blackHoleCount: 2, neutronStarCount: 4 },
  });
  assert.ok(errors.includes('systems-coordinate-count:79'));
  assert.ok(errors.includes('grid-decoded-cells:4999'));
  assert.ok(errors.includes('grid-missing-markers'));
  assert.ok(errors.includes('planet-pack-count:299'));
  assert.ok(errors.includes('planet-economy-count:0'));
  assert.ok(errors.includes('black-hole-count:2'));
  assert.ok(errors.includes('neutron-star-count:4'));
});
