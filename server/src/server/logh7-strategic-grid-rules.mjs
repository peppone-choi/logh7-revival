import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_PASSABLE_PATH = join(SERVER_ROOT, 'content', 'galaxy-passable-cells.json');
const DEFAULT_TERRAIN_MANUAL_PATH = join(SERVER_ROOT, 'content', 'manual', 'terrain-navigability.json');

export function loadStrategicPassableCells(path = DEFAULT_PASSABLE_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadTerrainNavigabilityManual(path = DEFAULT_TERRAIN_MANUAL_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildStrategicGridRuleSet({
  passableCells = loadStrategicPassableCells(),
  terrainManual = loadTerrainNavigabilityManual(),
} = {}) {
  const unitCap = findRestriction(terrainManual, 'unit_count_cap').max_units_per_faction_per_grid;
  const factionCap = findRestriction(terrainManual, 'faction_count_cap').max_factions_per_grid;
  const terrainRestriction = findRestriction(terrainManual, 'terrain');

  return {
    id: 'logh7-strategic-grid-rules',
    source: {
      passableMask: passableCells._source,
      terrainManual: terrainManual._source,
      terrainManualGrade: terrainManual._grade,
      inferencePolicy: 'use passable mask and manual entry gates only; do not infer warp fuel cost',
    },
    grid: {
      width: passableCells._grid.width,
      height: passableCells._grid.height,
    },
    passableCellCount: passableCells._count,
    rowRangesByRow: passableCells.rowRangesByRow,
    limits: {
      maxUnitsPerFactionPerGrid: unitCap,
      maxFactionsPerGrid: factionCap,
    },
    terrain: {
      impassableObstacleCount: terrainRestriction.impassable_terrain.length,
      obstaclePolicy: 'plasma-storm-or-sargasso-space',
    },
  };
}

export function isPassableGridCell(rules, { col, row }) {
  if (!isInBounds(rules, { col, row })) {
    return false;
  }
  const ranges = rules.rowRangesByRow[String(row)] ?? [];
  return ranges.some(([startCol, endCol]) => col >= startCol && col <= endCol);
}

export function evaluateStrategicGridEntry(rules, request) {
  const target = request.target;
  const baseBlocked = evaluateTargetMask(rules, target);
  if (baseBlocked) {
    return baseBlocked;
  }
  assertNonNegativeInteger('movingUnitCount', request.movingUnitCount);
  assertNonNegativeInteger('sameFactionUnitsInGrid', request.sameFactionUnitsInGrid);
  assertNonNegativeInteger('existingFactionCount', request.existingFactionCount);

  if (request.terrainObstaclePresent) {
    return {
      status: 'blocked',
      reason: 'terrain-obstacle',
      target,
      obstaclePolicy: rules.terrain.obstaclePolicy,
    };
  }

  const resultingFactionUnitsInGrid = request.sameFactionUnitsInGrid + request.movingUnitCount;
  if (resultingFactionUnitsInGrid > rules.limits.maxUnitsPerFactionPerGrid) {
    return {
      status: 'blocked',
      reason: 'unit-count-cap',
      target,
      maxUnitsPerFactionPerGrid: rules.limits.maxUnitsPerFactionPerGrid,
      sameFactionUnitsInGrid: request.sameFactionUnitsInGrid,
      movingUnitCount: request.movingUnitCount,
    };
  }

  const resultingFactionCount = request.existingFactionCount + (request.enteringFactionAlreadyPresent ? 0 : 1);
  if (resultingFactionCount > rules.limits.maxFactionsPerGrid) {
    return {
      status: 'blocked',
      reason: 'faction-count-cap',
      target,
      maxFactionsPerGrid: rules.limits.maxFactionsPerGrid,
      existingFactionCount: request.existingFactionCount,
    };
  }

  if (isLoneFlagshipBlocked(request)) {
    return {
      status: 'blocked',
      reason: 'lone-flagship-restriction',
      target,
    };
  }

  return {
    status: 'enterable',
    target,
    movingUnitCount: request.movingUnitCount,
    resultingFactionUnitsInGrid,
    resultingFactionCount,
  };
}

function evaluateTargetMask(rules, target) {
  if (!isInBounds(rules, target)) {
    return { status: 'blocked', reason: 'out-of-bounds', target };
  }
  if (!isPassableGridCell(rules, target)) {
    return { status: 'blocked', reason: 'non-passable-grid', target };
  }
  return null;
}

function isInBounds(rules, { col, row }) {
  return Number.isInteger(col)
    && Number.isInteger(row)
    && col >= 0
    && row >= 0
    && col < rules.grid.width
    && row < rules.grid.height;
}

function isLoneFlagshipBlocked(request) {
  if (!request.isLoneFlagship || !request.targetIsStarSystemGrid) {
    return false;
  }
  if (request.friendlyFleetPresent && request.tacticalGameInProgress) {
    return false;
  }
  return request.enemyNonLoneUnitsPresent || request.enemyPlanetOrFortressPresent;
}

function findRestriction(terrainManual, id) {
  const restriction = terrainManual.navigability_gate?.restrictions?.find((candidate) => candidate.id === id);
  if (!restriction) {
    throw new Error(`terrain navigability manual missing restriction: ${id}`);
  }
  return restriction;
}

function assertNonNegativeInteger(name, value) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
}
