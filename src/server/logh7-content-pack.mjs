/**
 * Server-side content pack — the game DATA we must author because the original LOGH VII server
 * (and its world data) is gone (logh7-cd-extract-integrity / "MMO client, server data lost").
 *
 * Everything custom-able is DATA here, not code: nations/powers, the units that spawn, their
 * ownership and start positions. The server loads a content pack and turns it into the wire
 * messages the client expects (e.g. the 0x33b tactical unit table, G196). This is what makes
 * "custom nations / custom scenarios" a config concern: edit the pack, not the server.
 *
 * Power-add reality (logh7-custom-nation-feasibility): the faction catalog is server-authoritative
 * up to ~600, so adding/replacing nations is data-driven (a 3rd *playable belligerent* additionally
 * needs a client session patch, out of scope for the pack). Validation here mirrors the client's
 * accepted ranges so a bad pack fails fast on the server instead of at the client.
 */
import { buildResponseTacticsInformationInner } from './logh7-login-protocol.mjs';

export const MAX_NATIONS = 64; // InformationSessionPower parser accepts a power-count byte < 0x41 (G-nation)
export const MAX_TACTICS_UNITS = 600; // faction-DB count warns above ~600 (G-nation)

/** A baseline playable scenario so the server has authoritative data out of the box. */
export const DEFAULT_CONTENT = {
  name: 'skirmish',
  nations: [
    { id: 0x500, name: 'Galactic Empire', color: 0, budget: 100000 },
    { id: 0x501, name: 'Free Planets Alliance', color: 1, budget: 100000 },
  ],
  units: [
    { id: 0x01000000, nationId: 0x500, controllable: true, x: 0, y: 0, z: 0, heading: 0 },
    { id: 0x01000001, nationId: 0x501, controllable: true, x: 120, y: 0, z: 0, heading: 0 },
  ],
};

/**
 * Validate + normalize a content pack and return it with accessors. Throws on a structurally
 * invalid pack (the server should refuse to start on bad data rather than feed the client garbage).
 * @param {{ name?: string, nations?: any[], units?: any[] }} data
 */
export function createContentPack(data = DEFAULT_CONTENT) {
  const name = String(data.name ?? 'unnamed');
  const nations = Array.isArray(data.nations) ? data.nations : [];
  const units = Array.isArray(data.units) ? data.units : [];

  if (nations.length === 0) {
    throw new Error('content pack has no nations');
  }
  if (nations.length > MAX_NATIONS) {
    throw new Error(`content pack has ${nations.length} nations; client accepts at most ${MAX_NATIONS}`);
  }
  if (units.length > MAX_TACTICS_UNITS) {
    throw new Error(`content pack has ${units.length} units; client faction DB caps at ~${MAX_TACTICS_UNITS}`);
  }

  const nationIds = new Set();
  const normNations = nations.map((n, i) => {
    if (!Number.isInteger(n.id)) {
      throw new Error(`nation[${i}] has a non-integer id`);
    }
    if (nationIds.has(n.id)) {
      throw new Error(`duplicate nation id 0x${n.id.toString(16)}`);
    }
    nationIds.add(n.id);
    return {
      id: n.id,
      name: String(n.name ?? `Power ${n.id}`),
      color: Number.isInteger(n.color) ? n.color : 0,
      budget: Number.isInteger(n.budget) ? n.budget : 0,
      capital: n.capital !== undefined ? String(n.capital) : null,
    };
  });

  const shipClasses = Array.isArray(data.shipClasses) ? data.shipClasses : [];
  const characters = Array.isArray(data.characters) ? data.characters : [];

  const shipClassIds = new Set();
  const normShipClasses = shipClasses.map((c, i) => {
    if (!Number.isInteger(c.id)) {
      throw new Error(`shipClass[${i}] has a non-integer id`);
    }
    if (shipClassIds.has(c.id)) {
      throw new Error(`duplicate shipClass id ${c.id}`);
    }
    shipClassIds.add(c.id);
    if (c.nationId !== undefined && !nationIds.has(c.nationId)) {
      throw new Error(`shipClass[${i}] references unknown nationId 0x${(c.nationId).toString(16)}`);
    }
    return {
      id: c.id,
      name: String(c.name ?? `Class ${c.id}`),
      nationId: c.nationId ?? null,
      role: String(c.role ?? 'battleship'),
      hp: Number(c.hp ?? 1000),
      attack: Number(c.attack ?? 100),
      defense: Number(c.defense ?? 100),
      speed: Number(c.speed ?? 10),
    };
  });

  const characterIds = new Set();
  const normCharacters = characters.map((ch, i) => {
    if (!Number.isInteger(ch.id)) {
      throw new Error(`character[${i}] has a non-integer id`);
    }
    if (characterIds.has(ch.id)) {
      throw new Error(`duplicate character id 0x${ch.id.toString(16)}`);
    }
    characterIds.add(ch.id);
    if (ch.nationId !== undefined && !nationIds.has(ch.nationId)) {
      throw new Error(`character[${i}] references unknown nationId 0x${(ch.nationId).toString(16)}`);
    }
    return {
      id: ch.id,
      name: String(ch.name ?? `Character ${ch.id}`),
      nameRomaji: ch.nameRomaji != null ? String(ch.nameRomaji) : null,
      nationId: ch.nationId ?? null,
      rank: String(ch.rank ?? 'Officer'),
      command: Number(ch.command ?? 50),
      tactics: Number(ch.tactics ?? 50),
      operations: Number(ch.operations ?? 50),
      // full 8-ability block (for the 0x0323 ability_8 wire field), preserved if supplied
      abilities: Array.isArray(ch.abilities) ? ch.abilities.slice(0, 8).map((v) => Number(v) || 0) : null,
      // portrait/face id (Face/*.tcf global index → the 0x0323 record's face field @0xf4)
      portraitIndex: Number.isInteger(ch.portraitIndex) ? ch.portraitIndex : null,
    };
  });

  const unitIds = new Set();
  const normUnits = units.map((u, i) => {
    if (!Number.isInteger(u.id) || u.id === 0) {
      throw new Error(`unit[${i}] has a missing/zero id (client rejects unitId 0)`);
    }
    if (unitIds.has(u.id)) {
      throw new Error(`duplicate unit id 0x${u.id.toString(16)}`);
    }
    unitIds.add(u.id);
    if (!nationIds.has(u.nationId)) {
      throw new Error(`unit[${i}] references unknown nationId 0x${(u.nationId ?? 0).toString(16)}`);
    }
    if (u.shipClass !== undefined && u.shipClass !== null && !shipClassIds.has(u.shipClass)) {
      throw new Error(`unit[${i}] references unknown shipClass ${u.shipClass}`);
    }
    if (u.commander !== undefined && u.commander !== null && !characterIds.has(u.commander)) {
      throw new Error(`unit[${i}] references unknown commander 0x${(u.commander).toString(16)}`);
    }
    return {
      id: u.id,
      nationId: u.nationId,
      shipClass: u.shipClass ?? null,
      commander: u.commander ?? null,
      controllable: u.controllable !== false,
      x: Number(u.x ?? 0),
      y: Number(u.y ?? 0),
      z: Number(u.z ?? 0),
      heading: Number(u.heading ?? 0),
    };
  });

  // Optional galaxy passthrough: the recovered star systems (with planets/fortresses). Light
  // normalization — the strategic map travels with the pack so the world has one content source.
  const systemsIn = Array.isArray(data.systems) ? data.systems : [];
  const normSystems = systemsIn.map((s, i) => ({
    name: String(s.name_ja ?? s.name ?? `System ${i}`),
    faction: s.faction ?? null,
    isCorridor: Boolean(s.is_corridor ?? s.isCorridor),
    planets: Array.isArray(s.planets)
      ? s.planets.map((p) => (typeof p === 'string' ? { name: p, orbit: 0 } : { name: p.name_ja ?? p.name, orbit: p.orbit ?? 0 }))
      : [],
    fortresses: Array.isArray(s.fortresses) ? s.fortresses.map(String) : [],
  }));

  return {
    name,
    nations: normNations,
    shipClasses: normShipClasses,
    characters: normCharacters,
    units: normUnits,
    systems: normSystems,
    systemByName(n) {
      return normSystems.find((s) => s.name === n) ?? null;
    },
    nationById(id) {
      return normNations.find((n) => n.id === id) ?? null;
    },
    shipClassById(id) {
      return normShipClasses.find((c) => c.id === id) ?? null;
    },
    characterById(id) {
      return normCharacters.find((c) => c.id === id) ?? null;
    },
    charactersForNation(nationId) {
      return normCharacters.filter((c) => c.nationId === nationId);
    },
    shipClassesForNation(nationId) {
      return normShipClasses.filter((c) => c.nationId === nationId);
    },
    unitsForNation(nationId) {
      return normUnits.filter((u) => u.nationId === nationId);
    },
    /** Map content units to the shape buildResponseTacticsInformationInner expects (G196 0x33b). */
    toTacticsUnits() {
      return normUnits.map((u) => ({
        unitId: u.id,
        controllable: u.controllable ? 1 : 0,
        mapSection: u.id, // start by matching the unit's own id against the faction DB (G196)
        x: u.x,
        y: u.y,
        z: u.z,
        heading: u.heading,
      }));
    },
    /** Build the 0x33b tactical unit-table inner that seeds the client's tactical pool from this pack. */
    buildTacticsUnitTableInner() {
      return buildResponseTacticsInformationInner({ units: this.toTacticsUnits() });
    },
  };
}
