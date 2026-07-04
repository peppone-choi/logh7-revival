import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_SHIP_STATS_PATH = join(SERVER_ROOT, 'content', 'ship-stats.json');

const SHIP_POOL_FIELDS = [
  'beamPower',
  'defense',
  'maxArmor',
  'maxShield',
  'maxZanki',
  'morale',
];

export function loadShipStats(path = DEFAULT_SHIP_STATS_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildShipStatCatalog({
  normalized = loadShipStats(),
  normalizedPath = 'server/content/ship-stats.json',
} = {}) {
  validateShipStats(normalized);

  const seenKeys = new Set();
  const ships = normalized.ships.map((ship, index) => {
    validateShipRecord(ship, index);
    if (seenKeys.has(ship.key)) {
      throw new Error(`duplicate ship key: ${ship.key}`);
    }
    seenKeys.add(ship.key);
    return normalizeShip(ship, index);
  });

  return {
    id: 'logh7-ship-stat-catalog',
    source: {
      normalizedPath,
      source: normalized._source,
      derivation: normalized._derivation ?? null,
      note: normalized._note ?? null,
      evidenceGrade: 'P1-manual-plus-documented-transform',
      inferencePolicy:
        'preserve normalized ship pools and raw evidence; do not infer combat formulas or fill missing pool fields',
    },
    poolFields: [...SHIP_POOL_FIELDS],
    shipCount: ships.length,
    summary: summarizeShips(ships),
    ships,
  };
}

export function getShipByKey(catalog, key) {
  return catalog.ships.find((ship) => ship.key === key);
}

export function listShipsBySide(catalog, side) {
  return catalog.ships.filter((ship) => ship.side === side);
}

export function listShipsByClass(catalog, shipClass) {
  return catalog.ships.filter((ship) => ship.shipClass === shipClass);
}

export function writeShipStatCatalog(path, catalog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}

export function getShipPoolFields() {
  return [...SHIP_POOL_FIELDS];
}

function validateShipStats(normalized) {
  if (!normalized || typeof normalized !== 'object') {
    throw new TypeError('ship stats must be object');
  }
  if (!Array.isArray(normalized.ships)) {
    throw new TypeError('ship stats missing ships array');
  }
  if (normalized.count !== normalized.ships.length) {
    throw new Error(`ship stats count mismatch: ${normalized.count} != ${normalized.ships.length}`);
  }
}

function validateShipRecord(ship, index) {
  if (!ship || typeof ship !== 'object') {
    throw new TypeError(`ship stat row must be object: ${index}`);
  }
  for (const key of ['key', 'name', 'side', 'shipClass']) {
    if (typeof ship[key] !== 'string' || ship[key].length === 0) {
      throw new TypeError(`ship stat row missing string field ${key}: ${index}`);
    }
  }
  if (!ship.pools || typeof ship.pools !== 'object' || Array.isArray(ship.pools)) {
    throw new TypeError(`ship stat row missing pools object: ${ship.key}`);
  }
  for (const key of Object.keys(ship.pools)) {
    if (!SHIP_POOL_FIELDS.includes(key)) {
      throw new Error(`unknown ship pool field: ${key}`);
    }
    if (ship.pools[key] !== null && !Number.isFinite(ship.pools[key])) {
      throw new TypeError(`ship pool must be finite number: ${ship.key}.${key}`);
    }
  }
}

function normalizeShip(ship, sourceIndex) {
  const pools = {};
  const missingPools = [];
  for (const field of SHIP_POOL_FIELDS) {
    if (Number.isFinite(ship.pools[field])) {
      pools[field] = ship.pools[field];
    } else {
      missingPools.push(field);
    }
  }
  return {
    key: ship.key,
    sourceIndex,
    name: ship.name,
    side: ship.side,
    shipClass: ship.shipClass,
    pools,
    missingPools,
    poolCompleteness: {
      presentCount: SHIP_POOL_FIELDS.length - missingPools.length,
      missingCount: missingPools.length,
    },
    inheritsFrom: ship._inherits_from ?? null,
    variantModifier: ship._variant_modifier ?? null,
    raw: ship._raw ?? null,
  };
}

function summarizeShips(ships) {
  return {
    sideCounts: countBy(ships, (ship) => ship.side),
    classCounts: countBy(ships, (ship) => ship.shipClass),
    poolCoverage: summarizePoolCoverage(ships),
  };
}

function countBy(values, keyOf) {
  const counts = new Map();
  for (const value of values) {
    const key = keyOf(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function summarizePoolCoverage(ships) {
  const coverage = {};
  for (const field of SHIP_POOL_FIELDS) {
    const values = ships
      .map((ship) => ship.pools[field])
      .filter((value) => Number.isFinite(value));
    coverage[field] = {
      presentCount: values.length,
      missingCount: ships.length - values.length,
      min: values.length > 0 ? Math.min(...values) : null,
      max: values.length > 0 ? Math.max(...values) : null,
    };
  }
  return coverage;
}
