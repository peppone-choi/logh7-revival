/**
 * Persistent server-side game entities — the mutable state the replacement server owns and saves.
 * Each factory returns a plain JSON-serializable object with conservative defaults so the entity
 * store can persist/restore it (CQRS: in-memory authoritative now, async DB later). Wire shapes must
 * be client-proven; domain defaults remain seed data until direct RE or shipped data proves them.
 */

/** A power/faction. budget/supplies/fame are the mutable economy+politics the strategy layer drives. */
export function makeNation({ id, name = `Power ${id}`, color = 0, capital = null, budget = 0, supplies = 0, fame = 0 }) {
  if (!Number.isInteger(id)) throw new Error('nation requires an integer id');
  return { kind: 'nation', id, name, color, capital, budget, supplies, fame };
}

/** A commander (admiral). Stats drive future combat resolution; fleetId is the current assignment. */
export function makeCharacter({
  id,
  name = `Character ${id}`,
  nationId = null,
  rank = 'Officer',
  command = 50,
  tactics = 50,
  operations = 50,
  fame = 0,
  fleetId = null,
  status = 'active', // active | reserve | captured | dead
  portraitIndex = 0, // index into the client's Face/*.tcf portrait set (tcf.hed, ~1355 slots)
}) {
  if (!Number.isInteger(id)) throw new Error('character requires an integer id');
  return { kind: 'character', id, name, nationId, rank, command, tactics, operations, fame, fleetId, status, portraitIndex };
}

/** Static ship-class definition (from the content pack / model roster). */
export function makeShipClass({ id, name = `Class ${id}`, nationId = null, role = 'battleship', hp = 1000, attack = 100, defense = 100, speed = 10 }) {
  if (!Number.isInteger(id)) throw new Error('shipClass requires an integer id');
  return { kind: 'shipClass', id, name, nationId, role, hp, attack, defense, speed };
}

/** A fleet/unit — the controllable game piece. Carries both strategic (systemId) and tactical (x,y,z) position. */
export function makeFleet({
  id,
  nationId,
  commanderId = null,
  name = `Fleet ${id}`,
  shipClass = null,
  shipCount = 1,
  systemId = null,
  x = 0,
  y = 0,
  z = 0,
  heading = 0,
  morale = 100,
  fuel = 100,
  supply = 100,
  state = 'idle', // idle | moving | combat | docked
  orderId = null,
}) {
  if (!Number.isInteger(id) || id === 0) throw new Error('fleet requires a nonzero integer id');
  return {
    kind: 'fleet',
    id,
    nationId,
    commanderId,
    name,
    shipClass,
    shipCount,
    systemId,
    x,
    y,
    z,
    heading,
    morale,
    fuel,
    supply,
    state,
    orderId,
  };
}

/** A star system on the strategic map. */
export function makeStarSystem({ id, name = `System ${id}`, x = 0, y = 0, ownerNationId = null, production = 0 }) {
  if (!Number.isInteger(id)) throw new Error('starSystem requires an integer id');
  return { kind: 'starSystem', id, name, x, y, ownerNationId, production };
}

/** A base or fortress garrisoning a system. */
export function makeBase({ id, name = `Base ${id}`, systemId = null, ownerNationId = null, type = 'base', garrison = 0 }) {
  if (!Number.isInteger(id)) throw new Error('base requires an integer id');
  return { kind: 'base', id, name, systemId, ownerNationId, type, garrison };
}

/**
 * A pending order — an issued command with the constmsg.dat timing: cooldownUntil = 実行待機時間
 * (the fleet can't be re-ordered until then), completeAt = 実行所要時間 (when the effect resolves).
 */
export function makeOrder({ id, fleetId, commandCode, params = {}, issuedAt = 0, cooldownUntil = 0, completeAt = 0, status = 'pending' }) {
  if (!Number.isInteger(id)) throw new Error('order requires an integer id');
  return { kind: 'order', id, fleetId, commandCode, params, issuedAt, cooldownUntil, completeAt, status };
}

/** The collections an entity store holds, in dependency order (nations first). */
export const ENTITY_KINDS = ['nations', 'shipClasses', 'characters', 'systems', 'bases', 'fleets', 'orders'];
