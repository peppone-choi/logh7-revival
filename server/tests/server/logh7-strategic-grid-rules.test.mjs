import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildStrategicGridRuleSet,
  evaluateStrategicGridEntry,
  isPassableGridCell,
} from '../../src/server/logh7-strategic-grid-rules.mjs';

test('strategic grid rules classify passable mask cells', () => {
  const rules = fixtureRules();

  assert.equal(rules.id, 'logh7-strategic-grid-rules');
  assert.equal(rules.grid.width, 6);
  assert.equal(rules.grid.height, 4);
  assert.equal(rules.passableCellCount, 8);
  assert.equal(isPassableGridCell(rules, { col: 1, row: 1 }), true);
  assert.equal(isPassableGridCell(rules, { col: 3, row: 1 }), false);
  assert.equal(isPassableGridCell(rules, { col: 6, row: 1 }), false);
});

test('strategic grid entry blocks non-passable and out-of-bounds cells', () => {
  const rules = fixtureRules();

  assert.deepEqual(baseEntry(rules, { target: { col: 3, row: 1 } }), {
    status: 'blocked',
    reason: 'non-passable-grid',
    target: { col: 3, row: 1 },
  });
  assert.deepEqual(baseEntry(rules, { target: { col: -1, row: 1 } }), {
    status: 'blocked',
    reason: 'out-of-bounds',
    target: { col: -1, row: 1 },
  });
});

test('strategic grid entry enforces manual unit and faction caps', () => {
  const rules = fixtureRules();

  assert.deepEqual(baseEntry(rules, { sameFactionUnitsInGrid: 299, movingUnitCount: 2 }), {
    status: 'blocked',
    reason: 'unit-count-cap',
    target: { col: 1, row: 1 },
    maxUnitsPerFactionPerGrid: 300,
    sameFactionUnitsInGrid: 299,
    movingUnitCount: 2,
  });
  assert.deepEqual(baseEntry(rules, { existingFactionCount: 2, enteringFactionAlreadyPresent: false }), {
    status: 'blocked',
    reason: 'faction-count-cap',
    target: { col: 1, row: 1 },
    maxFactionsPerGrid: 2,
    existingFactionCount: 2,
  });
});

test('strategic grid entry enforces terrain obstacle and lone flagship manual gates', () => {
  const rules = fixtureRules();

  assert.deepEqual(baseEntry(rules, { terrainObstaclePresent: true }), {
    status: 'blocked',
    reason: 'terrain-obstacle',
    target: { col: 1, row: 1 },
    obstaclePolicy: 'plasma-storm-or-sargasso-space',
  });
  assert.deepEqual(baseEntry(rules, {
    isLoneFlagship: true,
    targetIsStarSystemGrid: true,
    enemyNonLoneUnitsPresent: true,
  }), {
    status: 'blocked',
    reason: 'lone-flagship-restriction',
    target: { col: 1, row: 1 },
  });
  assert.equal(baseEntry(rules, {
    isLoneFlagship: true,
    targetIsStarSystemGrid: true,
    enemyNonLoneUnitsPresent: true,
    friendlyFleetPresent: true,
    tacticalGameInProgress: true,
  }).status, 'enterable');
});

test('strategic grid entry returns enterable only after all gates pass', () => {
  const rules = fixtureRules();

  assert.deepEqual(baseEntry(rules), {
    status: 'enterable',
    target: { col: 1, row: 1 },
    movingUnitCount: 12,
    resultingFactionUnitsInGrid: 112,
    resultingFactionCount: 2,
  });
});

function baseEntry(rules, overrides = {}) {
  return evaluateStrategicGridEntry(rules, {
    target: { col: 1, row: 1 },
    movingUnitCount: 12,
    sameFactionUnitsInGrid: 100,
    existingFactionCount: 1,
    enteringFactionAlreadyPresent: false,
    terrainObstaclePresent: false,
    isLoneFlagship: false,
    targetIsStarSystemGrid: false,
    enemyNonLoneUnitsPresent: false,
    enemyPlanetOrFortressPresent: false,
    friendlyFleetPresent: false,
    tacticalGameInProgress: false,
    ...overrides,
  });
}

function fixtureRules() {
  return buildStrategicGridRuleSet({
    passableCells: {
      _source: 'fixture passable mask',
      _grid: { width: 6, height: 4 },
      _count: 8,
      rowRangesByRow: {
        1: [[1, 2], [4, 4]],
        2: [[1, 5]],
      },
    },
    terrainManual: {
      _source: 'fixture manual pp30-32',
      _grade: 'P1',
      navigability_gate: {
        restrictions: [
          { id: 'unit_count_cap', max_units_per_faction_per_grid: 300 },
          { id: 'faction_count_cap', max_factions_per_grid: 2 },
          { id: 'lone_flagship' },
          {
            id: 'terrain',
            impassable_terrain: [
              { en: 'plasma storm', impassable: true },
              { en: 'Sargasso space', impassable: true },
            ],
          },
        ],
      },
    },
  });
}
