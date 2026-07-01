export const COMMAND_TARGET_POOL_PROVENANCE = 'P3/server-designed/dev-only';

const DEFAULT_RESOURCES = Object.freeze({ supplies: 5000, food: 3000, mineral: 2000 });

const ARRAY_SPECS = Object.freeze({
  characters: { keys: ['id'], cap: 300 },
  outfits: { keys: ['id'], cap: 100 },
  ships: { keys: ['kind', 'unitNumber', 'boatNumber'], cap: 99 },
  troops: { keys: ['kind', 'troopGrade', 'unitNumber'], cap: 24 },
  otherPackages: { keys: ['kind', 'unitKind', 'troopGrade', 'packageNumber'], cap: 8 },
  troopPackages: { keys: ['kind', 'unitKind', 'troopGrade', 'packageNumber'], cap: 24 },
  systems: { keys: ['id'], cap: 128 },
  planets: { keys: ['id', 'systemId'], cap: 512 },
  facilities: { keys: ['id', 'planetId', 'kind'], cap: 512 },
  spots: { keys: ['id', 'planetId', 'facilityId', 'kind'], cap: 512 },
  celestials: { keys: ['id', 'systemId', 'kind'], cap: 64 },
  gridCells: { keys: ['cell'], cap: 64 },
  fighters: { keys: ['kind', 'unitNumber'], cap: 24 },
  weapons: { keys: ['kind', 'slot'], cap: 24 },
  operationPlans: { keys: ['id'], cap: 16 },
  posts: { keys: ['id'], cap: 64 },
  ranks: { keys: ['id'], cap: 32 },
  powers: { keys: ['id'], cap: 8 },
});

const finitePositive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
};

const finiteNonNegative = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
};

const clone = (value) => ({ ...(value ?? {}) });

const stableKey = (entry = {}, fields = []) => fields.map((field) => Number(entry[field]) || 0).join(':');

function mergeUnique(target, incoming, keyFields, cap = Infinity) {
  if (!Array.isArray(incoming)) return;
  const seen = new Set(target.map((entry) => stableKey(entry, keyFields)));
  for (const raw of incoming) {
    if (!raw || target.length >= cap) continue;
    const entry = clone(raw);
    const key = stableKey(entry, keyFields);
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(entry);
  }
}

function normalizeArray(seed, key) {
  return Array.isArray(seed?.[key]) ? seed[key].map(clone) : [];
}

export function normalizeCommandTargets(seed = {}) {
  const baseId = finitePositive(seed.baseId ?? seed.base);
  const normalized = {
    provenance: seed.provenance ?? COMMAND_TARGET_POOL_PROVENANCE,
    ...(baseId != null ? { baseId } : {}),
    supplies: finiteNonNegative(seed.supplies) ?? DEFAULT_RESOURCES.supplies,
    food: finiteNonNegative(seed.food) ?? DEFAULT_RESOURCES.food,
    mineral: finiteNonNegative(seed.mineral) ?? DEFAULT_RESOURCES.mineral,
  };
  for (const key of Object.keys(ARRAY_SPECS)) {
    normalized[key] = normalizeArray(seed, key);
  }
  return normalized;
}

export function createCommandTargetPool(initialSeed = {}) {
  const state = normalizeCommandTargets(initialSeed);
  const history = [];

  const snapshot = () => ({
    provenance: state.provenance,
    ...(state.baseId != null ? { baseId: state.baseId } : {}),
    ...Object.fromEntries(Object.keys(ARRAY_SPECS).map((key) => [key, state[key].map(clone)])),
    supplies: state.supplies,
    food: state.food,
    mineral: state.mineral,
  });

  const merge = (seed = {}, reason = 'merge') => {
    const incoming = normalizeCommandTargets(seed);
    if (incoming.baseId != null) state.baseId = incoming.baseId;
    for (const [key, spec] of Object.entries(ARRAY_SPECS)) {
      mergeUnique(state[key], incoming[key], spec.keys, spec.cap);
    }
    state.supplies = Math.max(state.supplies, incoming.supplies);
    state.food = Math.max(state.food, incoming.food);
    state.mineral = Math.max(state.mineral, incoming.mineral);
    history.push({
      reason,
      baseId: state.baseId ?? 0,
      ...Object.fromEntries(Object.keys(ARRAY_SPECS).map((key) => [key, state[key].length])),
    });
    return snapshot();
  };

  const ensure = (kind, fallback = {}, reason = `ensure:${kind}`) => {
    switch (kind) {
      case 'base': {
        if (state.baseId == null) state.baseId = finitePositive(fallback.id ?? fallback.baseId ?? fallback.base) ?? 1;
        break;
      }
      case 'character': {
        if (state.characters.length === 0) {
          state.characters.push({
            id: finitePositive(fallback.id ?? fallback.characterId) ?? 1,
            kind: Number(fallback.kind) || 0,
            rank: Number(fallback.rank) || 0,
            name: fallback.name ?? 'Player',
          });
        }
        break;
      }
      case 'outfit': {
        if (state.outfits.length === 0) {
          state.outfits.push({
            id: finitePositive(fallback.id ?? fallback.outfitId) ?? 1,
            power: Number(fallback.power) || 0,
            index: Number(fallback.index) || 0,
          });
        }
        break;
      }
      case 'ship': {
        if (state.ships.length === 0) {
          state.ships.push({
            kind: finitePositive(fallback.kind) ?? 1,
            unitNumber: finitePositive(fallback.unitNumber) ?? 1,
            boatNumber: finitePositive(fallback.boatNumber) ?? 100,
            units: Array.isArray(fallback.units) ? [...fallback.units] : [],
          });
        }
        break;
      }
      case 'troop': {
        if (state.troops.length === 0) {
          state.troops.push({
            kind: finitePositive(fallback.kind) ?? 1,
            troopGrade: Number(fallback.troopGrade) || 0,
            unitNumber: finitePositive(fallback.unitNumber) ?? 12,
          });
        }
        break;
      }
      case 'package': {
        if (state.otherPackages.length === 0) {
          state.otherPackages.push({
            kind: finitePositive(fallback.kind) ?? 1,
            unitKind: finitePositive(fallback.unitKind ?? fallback.kind) ?? 1,
            troopGrade: Number(fallback.troopGrade) || 0,
            packageNumber: finitePositive(fallback.packageNumber) ?? 1,
          });
        }
        break;
      }
    case 'gridCell': {
      if (state.gridCells.length === 0) {
        state.gridCells.push({
          cell: finiteNonNegative(fallback.cell ?? fallback.grid ?? fallback.destCell) ?? 2588,
          systemId: finitePositive(fallback.systemId) ?? 1,
            label: fallback.label ?? 'home-cell',
          });
      }
      break;
    }
    case 'facility': {
      if (state.facilities.length === 0) {
        state.facilities.push({
          id: finitePositive(fallback.id ?? fallback.facilityId) ?? 1,
          planetId: finitePositive(fallback.planetId ?? fallback.planet) ?? 1,
          systemId: finitePositive(fallback.systemId) ?? 1,
          kind: finitePositive(fallback.kind ?? fallback.facilityKind) ?? 1,
          name: fallback.name ?? 'Facility',
        });
      }
      break;
    }
    case 'spot': {
      if (state.spots.length === 0) {
        state.spots.push({
          id: finitePositive(fallback.id ?? fallback.spotId) ?? 1,
          facilityId: finitePositive(fallback.facilityId) ?? finitePositive(state.facilities[0]?.id) ?? 1,
          planetId: finitePositive(fallback.planetId ?? fallback.planet) ?? finitePositive(state.facilities[0]?.planetId) ?? 1,
          kind: finitePositive(fallback.kind ?? fallback.spotKind) ?? 1,
          label: fallback.label ?? 'internal-spot',
        });
      }
      break;
    }
    case 'fighter': {
      if (state.fighters.length === 0) {
        state.fighters.push({
            kind: finitePositive(fallback.kind ?? fallback.fighterKind) ?? 1,
            unitNumber: finitePositive(fallback.unitNumber) ?? 12,
            boatNumber: finitePositive(fallback.boatNumber) ?? 48,
          });
        }
        break;
      }
      case 'weapon': {
        if (state.weapons.length === 0) {
          state.weapons.push({
            kind: finitePositive(fallback.kind ?? fallback.weaponKind) ?? 1,
            slot: finiteNonNegative(fallback.slot) ?? 0,
            power: finitePositive(fallback.power) ?? 100,
          });
        }
        break;
      }
      case 'operationPlan': {
        if (state.operationPlans.length === 0) {
          state.operationPlans.push({
            id: finitePositive(fallback.id ?? fallback.planId) ?? 1,
            target: fallback.target ?? fallback.cell ?? 'home-cell',
            units: Array.isArray(fallback.units) ? [...fallback.units] : [],
          });
        }
        break;
      }
      case 'post': {
        if (state.posts.length === 0) {
          state.posts.push({
            id: finitePositive(fallback.id ?? fallback.postId) ?? 1,
            name: fallback.name ?? 'Command Post',
            capacity: finitePositive(fallback.capacity) ?? 1,
          });
        }
        break;
      }
      case 'rank': {
        if (state.ranks.length === 0) {
          state.ranks.push({
            id: finitePositive(fallback.id ?? fallback.rankId) ?? 1,
            name: fallback.name ?? 'Rank',
          });
        }
        break;
      }
      case 'power': {
        if (state.powers.length === 0) {
          state.powers.push({
            id: finitePositive(fallback.id ?? fallback.powerId) ?? 1,
            name: fallback.name ?? 'Power',
          });
        }
        break;
      }
      case 'resources': {
        state.supplies = Math.max(state.supplies, finitePositive(fallback.supplies) ?? DEFAULT_RESOURCES.supplies);
        state.food = Math.max(state.food, finitePositive(fallback.food) ?? DEFAULT_RESOURCES.food);
        state.mineral = Math.max(state.mineral, finitePositive(fallback.mineral) ?? DEFAULT_RESOURCES.mineral);
        break;
      }
      default:
        break;
    }
    history.push({ reason, kind, baseId: state.baseId ?? 0 });
    return snapshot();
  };

  const registerOutfit = (outfit = {}, reason = 'register-outfit') => merge({
    baseId: finitePositive(outfit.base),
    outfits: [{ id: outfit.id, power: outfit.power, index: outfit.index ?? 0 }],
    ships: outfit.ships ?? [],
    troops: outfit.troops ?? [],
  }, reason);

  const removeOutfit = (id, reason = 'remove-outfit') => {
    const targetId = finitePositive(id);
    if (targetId == null) return false;
    const before = state.outfits.length;
    state.outfits = state.outfits.filter((entry) => finitePositive(entry.id) !== targetId);
    const removed = state.outfits.length !== before;
    history.push({ reason, kind: 'outfit', id: targetId, removed });
    return removed;
  };

  const validTargetIds = () => {
    const ids = new Set();
    if (state.baseId != null) ids.add(state.baseId);
    for (const entry of state.characters) if (finitePositive(entry.id) != null) ids.add(finitePositive(entry.id));
    for (const entry of state.outfits) if (finitePositive(entry.id) != null) ids.add(finitePositive(entry.id));
    for (const entry of state.facilities) if (finitePositive(entry.id) != null) ids.add(finitePositive(entry.id));
    for (const entry of state.spots) if (finitePositive(entry.id) != null) ids.add(finitePositive(entry.id));
    for (const entry of state.gridCells) if (finiteNonNegative(entry.cell) != null) ids.add(finiteNonNegative(entry.cell));
    return ids;
  };

  merge(initialSeed, 'initial');

  return {
    merge,
    ensure,
    snapshot,
    registerOutfit,
    removeOutfit,
    validTargetIds,
    history: () => history.map(clone),
  };
}

export function ensureCommandExecutionTargets(pool, fallback = {}, reason = 'command-execution') {
  if (!pool || typeof pool.ensure !== 'function') return normalizeCommandTargets(fallback);
  pool.ensure('base', { id: fallback.baseId ?? fallback.base }, `${reason}:base`);
  pool.ensure('character', { id: fallback.characterId, name: fallback.characterName }, `${reason}:character`);
  pool.ensure('outfit', { id: fallback.outfitId ?? fallback.unitId, power: fallback.power }, `${reason}:outfit`);
  pool.ensure('ship', { kind: fallback.shipKind, units: fallback.unitId != null ? [fallback.unitId] : [] }, `${reason}:ship`);
  pool.ensure('troop', { kind: fallback.troopKind }, `${reason}:troop`);
  pool.ensure('package', { kind: fallback.packageKind }, `${reason}:package`);
  pool.ensure('gridCell', { cell: fallback.cell ?? fallback.grid ?? fallback.destCell, systemId: fallback.systemId }, `${reason}:gridCell`);
  pool.ensure('facility', { id: fallback.facilityId, planetId: fallback.planetId, systemId: fallback.systemId, kind: fallback.facilityKind, name: fallback.facilityName }, `${reason}:facility`);
  pool.ensure('spot', { id: fallback.spotId, facilityId: fallback.facilityId, planetId: fallback.planetId, kind: fallback.spotKind, label: fallback.spotLabel }, `${reason}:spot`);
  pool.ensure('fighter', { kind: fallback.fighterKind }, `${reason}:fighter`);
  pool.ensure('weapon', { kind: fallback.weaponKind, slot: fallback.weaponSlot }, `${reason}:weapon`);
  pool.ensure('operationPlan', { id: fallback.planId, target: fallback.planTarget, units: fallback.unitId != null ? [fallback.unitId] : [] }, `${reason}:operationPlan`);
  pool.ensure('post', { id: fallback.postId, name: fallback.postName }, `${reason}:post`);
  pool.ensure('rank', { id: fallback.rankId, name: fallback.rankName }, `${reason}:rank`);
  pool.ensure('power', { id: fallback.powerId ?? fallback.power, name: fallback.powerName }, `${reason}:power`);
  pool.ensure('resources', fallback, `${reason}:resources`);
  return pool.snapshot();
}
