import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createCommandTargetPool,
  ensureCommandExecutionTargets,
} from '../../src/server/logh7-command-targets.mjs';
import { createStrategyState } from '../../src/server/logh7-strategy.mjs';

test('command target pool seeds default command execution targets on demand', () => {
  const pool = createCommandTargetPool();
  const snapshot = ensureCommandExecutionTargets(pool, {
    baseId: 7,
    characterId: 11,
    unitId: 13,
    power: 2,
    planetId: 31,
    facilityId: 3101,
    facilityKind: 2,
    spotId: 3401,
    spotKind: 3,
    supplies: 9000,
  }, 'test-demand');

  assert.equal(snapshot.baseId, 7);
  assert.equal(snapshot.characters[0].id, 11);
  assert.equal(snapshot.outfits[0].id, 13);
  assert.equal(snapshot.outfits[0].power, 2);
  assert.equal(snapshot.facilities[0].id, 3101);
  assert.equal(snapshot.facilities[0].planetId, 31);
  assert.equal(snapshot.facilities[0].kind, 2);
  assert.equal(snapshot.spots[0].id, 3401);
  assert.equal(snapshot.spots[0].facilityId, 3101);
  assert.equal(snapshot.spots[0].planetId, 31);
  assert.equal(snapshot.spots[0].kind, 3);
  assert.ok(snapshot.ships.length > 0);
  assert.ok(snapshot.troops.length > 0);
  assert.ok(snapshot.gridCells.length > 0);
  assert.ok(snapshot.facilities.length > 0);
  assert.ok(snapshot.spots.length > 0);
  assert.ok(snapshot.fighters.length > 0);
  assert.ok(snapshot.weapons.length > 0);
  assert.ok(snapshot.operationPlans.length > 0);
  assert.ok(snapshot.posts.length > 0);
  assert.ok(snapshot.ranks.length > 0);
  assert.ok(snapshot.powers.length > 0);
  assert.equal(snapshot.supplies, 9000);
  assert.equal(snapshot.food, 3000);
  assert.equal(snapshot.mineral, 2000);
});

test('command target pool merges facility and spot targets and exposes ids', () => {
  const pool = createCommandTargetPool({
    facilities: [{ id: 31, planetId: 4, kind: 2, name: 'Dock' }],
    spots: [{ id: 34, planetId: 4, facilityId: 31, kind: 1, label: 'Hangar' }],
  });

  pool.merge({
    facilities: [
      { id: 31, planetId: 4, kind: 2, name: 'Duplicate Dock' },
      { id: 32, planetId: 4, kind: 3, name: 'Factory' },
    ],
    spots: [
      { id: 34, planetId: 4, facilityId: 31, kind: 1, label: 'Duplicate Hangar' },
      { id: 35, planetId: 4, facilityId: 32, kind: 2, label: 'Internal Port' },
    ],
  }, 'test-facility-spot-merge');

  const snapshot = pool.snapshot();
  assert.deepEqual(snapshot.facilities.map((entry) => entry.id), [31, 32]);
  assert.deepEqual(snapshot.spots.map((entry) => entry.id), [34, 35]);

  const ids = pool.validTargetIds();
  assert.equal(ids.has(31), true);
  assert.equal(ids.has(34), true);
  assert.equal(ids.has(35), true);
});

test('strategy outfit lifecycle registers and removes command targets', () => {
  const pool = createCommandTargetPool();
  const state = createStrategyState({ nextOutfitId: 0x5000, targetPool: pool });

  const outfit = state.createOutfit({
    base: 3,
    power: 4,
    ships: [{ kind: 2, unitNumber: 1, boatNumber: 30 }],
    troops: [{ kind: 1, troopGrade: 0, unitNumber: 6 }],
  });
  let snapshot = pool.snapshot();
  assert.equal(outfit.id, 0x5000);
  assert.equal(snapshot.baseId, 3);
  assert.equal(snapshot.outfits[0].id, 0x5000);
  assert.equal(snapshot.ships[0].kind, 2);
  assert.equal(snapshot.troops[0].unitNumber, 6);

  assert.equal(state.deleteOutfit(outfit.id), true);
  snapshot = pool.snapshot();
  assert.equal(snapshot.outfits.some((entry) => entry.id === outfit.id), false);
});
