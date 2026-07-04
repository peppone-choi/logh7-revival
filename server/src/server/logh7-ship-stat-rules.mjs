import { getShipByKey } from './logh7-ship-stat-catalog.mjs';

export function buildShipStatRuleSet(catalog) {
  return {
    id: 'logh7-ship-stat-rules',
    sourceCatalogId: catalog.id,
    shipCount: catalog.shipCount,
    poolFields: [...catalog.poolFields],
    inferencePolicy:
      'require explicit normalized pool values; do not infer missing pools or combat formulas',
  };
}

export function evaluateShipPoolRequirements(catalog, shipKey, { requiredPools }) {
  assertRequiredPools(catalog, requiredPools);
  const ship = getShipByKey(catalog, shipKey);
  if (!ship) {
    return {
      status: 'unknown-ship',
      shipKey,
      requiredPools: [...requiredPools],
      reason: 'ship-key-not-in-catalog',
    };
  }

  const missingPools = requiredPools.filter((pool) => !Number.isFinite(ship.pools[pool]));
  if (missingPools.length > 0) {
    return {
      status: 'missing-pools',
      shipKey,
      shipName: ship.name,
      requiredPools: [...requiredPools],
      missingPools,
      availablePools: Object.keys(ship.pools),
      reason: 'manual-source-gap',
    };
  }

  return {
    status: 'ready',
    shipKey,
    shipName: ship.name,
    requiredPools: [...requiredPools],
    pools: Object.fromEntries(requiredPools.map((pool) => [pool, ship.pools[pool]])),
  };
}

function assertRequiredPools(catalog, requiredPools) {
  if (!Array.isArray(requiredPools) || requiredPools.length === 0) {
    throw new TypeError('requiredPools must be non-empty array');
  }
  for (const pool of requiredPools) {
    if (typeof pool !== 'string' || pool.length === 0) {
      throw new TypeError('required pool must be non-empty string');
    }
    if (!catalog.poolFields.includes(pool)) {
      throw new Error(`unknown required ship pool: ${pool}`);
    }
  }
}
