/**
 * Content source — the server's read-side API over the unified content DB (logh7-content-db.mjs).
 *
 * This is the bridge between the recovered data (galaxy, roster, ship classes, commands, the client
 * constmsg catalog) and the authoritative world: world-init/world-state ask this layer for content
 * instead of hard-coded tables. Backed by node:sqlite; builds an in-memory DB on demand so tests and
 * fresh checkouts work without a prebuilt .db file.
 */
import { existsSync } from 'node:fs';
import { buildContentDb, loadContentDb, DEFAULT_DB_PATH, DEFAULT_CONTENT_DIR } from './logh7-content-db.mjs';

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

  return {
    db,
    close: () => db.close(),

    /** Star systems, optionally filtered by faction; each with planets (orbit-ordered) + fortresses. */
    listSystems({ faction } = {}) {
      const rows = faction
        ? all('SELECT * FROM star_systems WHERE faction = ? ORDER BY id', faction)
        : all('SELECT * FROM star_systems ORDER BY id');
      return rows.map((s) => ({
        ...s,
        planets: all('SELECT name_ja, orbit FROM planets WHERE system_id = ? ORDER BY orbit', s.id),
        fortresses: all('SELECT name_ja FROM fortresses WHERE system_id = ?', s.id).map((f) => f.name_ja),
      }));
    },
    getSystem(nameJa) {
      const s = one('SELECT * FROM star_systems WHERE name_ja = ?', nameJa);
      if (!s) return null;
      return {
        ...s,
        planets: all('SELECT name_ja, orbit FROM planets WHERE system_id = ? ORDER BY orbit', s.id),
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
