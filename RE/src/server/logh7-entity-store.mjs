/**
 * Entity store — the authoritative repository of persistent game entities (nations, ship classes,
 * characters, star systems, bases, fleets, orders). In-memory + JSON-serializable so it can be
 * snapshotted/persisted to a DB (CQRS). Seeds an initial game world from a content pack so the
 * server boots with a working state; the command engine / strategy layer mutates it from there.
 */
import {
  ENTITY_KINDS,
  makeNation,
  makeShipClass,
  makeCharacter,
  makeStarSystem,
  makeBase,
  makeFleet,
  makeOrder,
} from './logh7-entities.mjs';

export function createEntityStore() {
  /** @type {Record<string, Map<number, any>>} */
  const collections = Object.fromEntries(ENTITY_KINDS.map((k) => [k, new Map()]));
  let nextOrderId = 1;

  const requireKind = (kind) => {
    if (!collections[kind]) {
      throw new Error(`unknown entity kind: ${kind}`);
    }
    return collections[kind];
  };

  const store = {
    // --- generic CRUD ---
    add(kind, entity) {
      requireKind(kind).set(entity.id, entity);
      return entity;
    },
    get(kind, id) {
      return requireKind(kind).get(id) ?? null;
    },
    update(kind, id, patch) {
      const entity = requireKind(kind).get(id);
      if (!entity) {
        return null;
      }
      Object.assign(entity, patch);
      return entity;
    },
    remove(kind, id) {
      return requireKind(kind).delete(id);
    },
    list(kind) {
      return [...requireKind(kind).values()];
    },
    count(kind) {
      return requireKind(kind).size;
    },

    // --- game queries ---
    fleetsOfNation(nationId) {
      return store.list('fleets').filter((f) => f.nationId === nationId);
    },
    charactersOfNation(nationId) {
      return store.list('characters').filter((c) => c.nationId === nationId);
    },
    systemsOfNation(nationId) {
      return store.list('systems').filter((s) => s.ownerNationId === nationId);
    },
    ordersForFleet(fleetId) {
      return store.list('orders').filter((o) => o.fleetId === fleetId);
    },
    nextOrderId() {
      const id = nextOrderId;
      nextOrderId += 1;
      return id;
    },

    /**
     * Seed an initial game world from a content pack. Nations/shipClasses/characters come straight
     * from the pack; each pack unit becomes a Fleet (assigned its commander + ship class). Idempotent
     * per id (re-seeding overwrites). Returns the store for chaining.
     */
    seedFromContentPack(pack) {
      for (const n of pack.nations) {
        store.add('nations', makeNation({ id: n.id, name: n.name, color: n.color, capital: n.capital ?? null, budget: n.budget ?? 0 }));
      }
      for (const c of pack.shipClasses ?? []) {
        store.add('shipClasses', makeShipClass(c));
      }
      for (const ch of pack.characters ?? []) {
        store.add('characters', makeCharacter(ch));
      }
      for (const u of pack.units) {
        store.add(
          'fleets',
          makeFleet({
            id: u.id,
            nationId: u.nationId,
            commanderId: u.commander ?? null,
            shipClass: u.shipClass ?? null,
            x: u.x,
            y: u.y,
            z: u.z,
            heading: u.heading,
          }),
        );
        // Bind the commander to the fleet they lead.
        if (u.commander != null && store.get('characters', u.commander)) {
          store.update('characters', u.commander, { fleetId: u.id });
        }
      }
      return store;
    },

    /** Issue an order against a fleet with constmsg-style timing. Returns the created order. */
    issueOrder({ fleetId, commandCode, params = {}, now = 0, cooldown = 0, duration = 0 }) {
      const order = makeOrder({
        id: store.nextOrderId(),
        fleetId,
        commandCode,
        params,
        issuedAt: now,
        cooldownUntil: now + cooldown,
        completeAt: now + duration,
      });
      store.add('orders', order);
      store.update('fleets', fleetId, { orderId: order.id });
      return order;
    },

    // --- persistence (DB snapshot) ---
    toJSON() {
      return Object.fromEntries(ENTITY_KINDS.map((k) => [k, store.list(k)]));
    },
  };

  return store;
}

/** Rebuild a store from a toJSON() snapshot (DB restore). */
export function loadEntityStore(snapshot) {
  const store = createEntityStore();
  for (const kind of ENTITY_KINDS) {
    for (const entity of snapshot?.[kind] ?? []) {
      store.add(kind, entity);
    }
  }
  return store;
}
