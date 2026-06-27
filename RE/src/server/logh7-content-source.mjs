/**
 * Content source — the server's read-side API over the unified content DB (logh7-content-db.mjs).
 *
 * This is the bridge between the recovered data (galaxy, roster, ship classes, commands, the client
 * constmsg catalog) and the authoritative world: world-init/world-state ask this layer for content
 * instead of hard-coded tables. Backed by node:sqlite; builds an in-memory DB on demand so tests and
 * fresh checkouts work without a prebuilt .db file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildContentDb, loadContentDb, DEFAULT_DB_PATH, DEFAULT_CONTENT_DIR } from './logh7-content-db.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NAMES_DIR = join(HERE, '..', '..', 'content', 'names');

function loadPlanetEconomyMap(contentDir) {
  const map = new Map();
  try {
    const doc = JSON.parse(readFileSync(join(contentDir, 'planet-economy.json'), 'utf8'));
    for (const system of Array.isArray(doc?.systems) ? doc.systems : []) {
      if (typeof system?.system === 'string' && Array.isArray(system.planets)) {
        map.set(system.system, system.planets);
      }
    }
  } catch {
    return map;
  }
  return map;
}

function populationFromMillions(value) {
  const populationM = Number(value);
  return Number.isFinite(populationM) ? Math.max(0, Math.trunc(populationM * 1_000_000)) : 0;
}

function mergePlanetEconomy(planet, economy) {
  if (!economy) return planet;
  return {
    ...planet,
    population_M: Number(economy.population_M ?? 0),
    population: populationFromMillions(economy.population_M),
    food: Number(economy.food ?? 0),
    industry: Number(economy.industry ?? 0),
    habitable: Boolean(economy.habitable),
  };
}

function planetEconomyByName(rows) {
  return new Map(rows.map((row) => [row.name, row]));
}

/**
 * Load a {jp, romaji, ko, source, confidence}[] KO-name file into a jp→ko Map. The recovered galaxy
 * uses Japanese (name_ja) as its key everywhere (galaxy.json `system`/planet `name` → DB name_ja); these
 * sidecar files (content/names/systems-ko.json + planets-ko.json) carry the Korean rendering keyed by the
 * exact same jp string, so the lookup is a raw-string match (the two files are byte-identical in the jp
 * column — verified 80/80 systems + 281/281 planets). Missing/garbled file degrades to an empty map.
 * @returns {Map<string,string>} jp → ko
 */
function loadKoNameMap(file) {
  const map = new Map();
  try {
    const rows = JSON.parse(readFileSync(join(NAMES_DIR, file), 'utf8'));
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (r && typeof r.jp === 'string' && typeof r.ko === 'string' && r.ko) map.set(r.jp, r.ko);
      }
    }
  } catch {
    /* no KO sidecar — systems/planets keep name_ja only */
  }
  return map;
}

/**
 * Open a content source.
 * @param {{ dbPath?: string, contentDir?: string, build?: boolean }} [opts]
 *   build: force a fresh in-memory build from the JSON sources (default when the .db is absent).
 */
export function openContentSource({ dbPath = DEFAULT_DB_PATH, contentDir = DEFAULT_CONTENT_DIR, build } = {}) {
  let db;
  if (build || !existsSync(dbPath)) {
    ({ db } = buildContentDb({ contentDir, dbPath: ':memory:' }));
  } else {
    db = loadContentDb(dbPath);
  }
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);

  // KO name sidecars (content/names/*-ko.json), keyed by the same name_ja string. Loaded once per
  // source; additive — systems/planets gain a `name_ko` field and a getKoName(name_ja) lookup, name_ja
  // is always preserved as the fallback.
  const systemKoByJa = loadKoNameMap('systems-ko.json');
  const planetKoByJa = loadKoNameMap('planets-ko.json');
  const planetEconomyBySystem = loadPlanetEconomyMap(contentDir);
  const withKo = (rows, systemName) => {
    const economyByName = planetEconomyByName(planetEconomyBySystem.get(systemName) ?? []);
    return rows.map((r) => mergePlanetEconomy(
      { ...r, name_ko: planetKoByJa.get(r.name_ja) ?? null },
      economyByName.get(r.name_ja),
    ));
  };

  return {
    db,
    close: () => db.close(),

    /** KO rendering for a system's name_ja (null if no high-confidence KO mapping). */
    getSystemKoName(nameJa) { return systemKoByJa.get(nameJa) ?? null; },
    /** KO rendering for a planet's name_ja (null if none). */
    getPlanetKoName(nameJa) { return planetKoByJa.get(nameJa) ?? null; },

    /** Star systems, optionally filtered by faction; each with planets (orbit-ordered) + fortresses. */
    listSystems({ faction } = {}) {
      const rows = faction
        ? all('SELECT * FROM star_systems WHERE faction = ? ORDER BY id', faction)
        : all('SELECT * FROM star_systems ORDER BY id');
      return rows.map((s) => ({
        ...s,
        name_ko: systemKoByJa.get(s.name_ja) ?? null,
        planets: withKo(all('SELECT name_ja, orbit FROM planets WHERE system_id = ? ORDER BY orbit', s.id), s.name_ja),
        fortresses: all('SELECT name_ja FROM fortresses WHERE system_id = ?', s.id).map((f) => f.name_ja),
      }));
    },
    getSystem(nameJa) {
      const s = one('SELECT * FROM star_systems WHERE name_ja = ?', nameJa);
      if (!s) return null;
      return {
        ...s,
        name_ko: systemKoByJa.get(s.name_ja) ?? null,
        planets: withKo(all('SELECT name_ja, orbit FROM planets WHERE system_id = ? ORDER BY orbit', s.id), s.name_ja),
        fortresses: all('SELECT name_ja FROM fortresses WHERE system_id = ?', s.id).map((f) => f.name_ja),
      };
    },

    /** Initial duty-card holders (the named principals), optionally by faction. */
    listRoster({ faction } = {}) {
      return faction
        ? all('SELECT * FROM roster WHERE faction = ? ORDER BY id', faction)
        : all('SELECT * FROM roster ORDER BY id');
    },
    /** Full character roster with 8 innate abilities, optionally by faction. */
    listCharacters({ faction } = {}) {
      return faction
        ? all('SELECT * FROM characters WHERE faction = ? ORDER BY id', faction)
        : all('SELECT * FROM characters ORDER BY id');
    },
    getCharacter(nameJa) { return one('SELECT * FROM characters WHERE name_ja = ?', nameJa); },

    /** LOGH IV EX reference roster (Korean editor db.mdb) — id/name_kr/faction, optionally by faction. */
    listIvexRoster({ faction } = {}) {
      return faction
        ? all('SELECT * FROM ivex_roster WHERE faction = ? ORDER BY id', faction)
        : all('SELECT * FROM ivex_roster ORDER BY id');
    },

    /** Assignable post definitions (capacity / rank range), optionally by faction. */
    listPosts({ faction } = {}) {
      return faction
        ? all('SELECT * FROM posts WHERE faction = ? ORDER BY id', faction)
        : all('SELECT * FROM posts ORDER BY id');
    },

    listShipClasses({ faction } = {}) {
      return faction
        ? all('SELECT * FROM ship_classes WHERE faction = ? ORDER BY id', faction)
        : all('SELECT * FROM ship_classes ORDER BY id');
    },
    listStrategyCommands() { return all('SELECT * FROM strategy_commands ORDER BY id'); },
    listUnitTypes() { return all('SELECT * FROM unit_types ORDER BY id'); },
    listAbilities() { return all('SELECT * FROM abilities ORDER BY id'); },
    rankLadder(ladder = 'military') {
      return all('SELECT name_ja FROM ranks WHERE ladder = ? ORDER BY ordinal', ladder).map((r) => r.name_ja);
    },

    /** Look up a client constmsg / message string by file + in-file id (the catalog index). */
    clientString(file, strId) {
      const r = one('SELECT text FROM client_strings WHERE file = ? AND str_id = ?', file, strId);
      return r ? r.text : null;
    },
    constmsg(strId) { return this.clientString('constmsg.dat', strId); },

    counts() {
      const t = ['nations', 'star_systems', 'planets', 'fortresses', 'characters', 'roster', 'posts',
        'ship_classes', 'strategy_commands', 'unit_types', 'client_strings'];
      return Object.fromEntries(t.map((n) => [n, one(`SELECT COUNT(*) c FROM ${n}`).c]));
    },
  };
}
