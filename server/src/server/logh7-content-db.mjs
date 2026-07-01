/**
 * Unified LOGH VII content database loader.
 *
 * Normalizes every structured content source we recovered (manual roster, 別表 appendix tables,
 * and the galaxy recovered from gin7manualsaved.pdf star-map annotations) into a single SQLite
 * database — the authoritative content seed for the server (CQRS: this is the read-side catalog
 * that the in-memory world-state is built from).
 *
 * Sources (content/):
 *   galaxy.json                          -> star_systems, planets, fortresses
 *   roster/manual-roster.json            -> abilities, ranks, social_classes, growth_rules,
 *                                           posts (postDefinitions), roster (initial duty-card holders)
 *   manual/org-posts.json                -> posts (organization tables, authoritative)
 *   manual/strategy-commands.json        -> strategy_commands
 *   manual/unit-types-deployments.json   -> unit_types, deployments
 *   manual/ship-units.json               -> ship_classes
 *
 * Build:  node src/server/logh7-content-db.mjs build [dbPath]
 * Open:   import { loadContentDb } from './logh7-content-db.mjs'
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONTENT_DIR = resolve(HERE, '../../content');
export const DEFAULT_DB_PATH = resolve(HERE, '../../content/logh7-content.db');

const SCHEMA_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE nations (
  key TEXT PRIMARY KEY,            -- empire | alliance | neutral | corridor
  name_ja TEXT NOT NULL
);

CREATE TABLE abilities (
  id INTEGER PRIMARY KEY,
  name_ja TEXT NOT NULL,
  effect TEXT
);

CREATE TABLE ranks (
  id INTEGER PRIMARY KEY,
  ladder TEXT NOT NULL,            -- military | politician
  ordinal INTEGER NOT NULL,        -- 1 = lowest
  name_ja TEXT NOT NULL
);

CREATE TABLE social_classes (
  id INTEGER PRIMARY KEY,
  faction TEXT,
  name_ja TEXT NOT NULL
);

CREATE TABLE growth_rules (
  id INTEGER PRIMARY KEY,
  rule TEXT NOT NULL
);

CREATE TABLE star_systems (
  id INTEGER PRIMARY KEY,
  name_ja TEXT NOT NULL,
  faction TEXT,                    -- empire | alliance | corridor | neutral
  cx REAL, cy REAL,                -- map-annotation centre (topology)
  rect_x0 REAL, rect_y0 REAL, rect_x1 REAL, rect_y1 REAL,
  map_page INTEGER,
  in_iv_ex INTEGER,                -- 1 if the system also exists in LOGH IV EX
  canon_col INTEGER,
  canon_row INTEGER,
  canon_dot_x REAL,
  canon_dot_y REAL,
  canon_line_marker_x REAL,
  canon_line_marker_y REAL,
  spectral_class TEXT,
  spectral_class_source TEXT,
  spectral_class_provenance_json TEXT,
  position_authority TEXT,
  coordinate_pending INTEGER,
  name_authority TEXT,
  coordinate_source TEXT,
  planet_authority TEXT,
  note TEXT,
  is_corridor INTEGER              -- 1 if in the Iserlohn/Fezzan corridor band (geography, not ownership)
);

CREATE TABLE planets (
  id INTEGER PRIMARY KEY,
  system_id INTEGER NOT NULL REFERENCES star_systems(id),
  name_ja TEXT NOT NULL,
  orbit INTEGER NOT NULL           -- 1-based orbital slot, inner -> outer
);

CREATE TABLE fortresses (
  id INTEGER PRIMARY KEY,
  system_id INTEGER NOT NULL REFERENCES star_systems(id),
  name_ja TEXT NOT NULL
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  faction TEXT NOT NULL,
  post_ja TEXT NOT NULL,
  org_ja TEXT,
  capacity INTEGER,
  min_rank_ja TEXT,
  max_rank_ja TEXT,
  holder_kind TEXT
);

CREATE TABLE roster (
  id INTEGER PRIMARY KEY,
  faction TEXT NOT NULL,
  post_ja TEXT NOT NULL,
  holder_ja TEXT NOT NULL,
  holder_romaji TEXT,
  rank_ja TEXT,
  kind TEXT,                       -- military | politician | emperor
  unit_ja TEXT,
  is_deputy INTEGER
);

CREATE TABLE characters (
  id INTEGER PRIMARY KEY,
  name_ja TEXT NOT NULL,
  name_romaji TEXT,
  faction TEXT,
  rank_ja TEXT,
  kind TEXT,
  post_ja TEXT,
  source TEXT,                     -- manual | ivex | ...
  -- 8 innate abilities (manual schema; NOT derived from rank): PCP + MCP
  tochi INTEGER, seiji INTEGER, unei INTEGER, joho INTEGER,
  shiki INTEGER, kido INTEGER, kogeki INTEGER, bogyo INTEGER
);

-- LOGH IV EX reference (from the Korean editor db.mdb): clean id->name + faction, for cross-referencing
-- and enriching the VII roster. Stats join in by id once the .DAT decode lands.
CREATE TABLE ivex_roster (
  id INTEGER PRIMARY KEY,           -- IV EX character id (0-180)
  name_kr TEXT NOT NULL,
  faction TEXT,                     -- empire (id<100) | alliance (id>=100)
  -- real IV EX abilities decoded from the Korean save (.GIN), canon-validated
  tochi INTEGER, seiji INTEGER, joho INTEGER, kido INTEGER,
  shiki INTEGER, unei INTEGER, kogeki INTEGER, bogyo INTEGER
);
CREATE TABLE ivex_systems (
  id INTEGER PRIMARY KEY,
  name_kr TEXT NOT NULL
);
CREATE TABLE ivex_planets (
  id INTEGER PRIMARY KEY,
  system_id INTEGER,
  name_kr TEXT NOT NULL
);

CREATE TABLE strategy_commands (
  id INTEGER PRIMARY KEY,
  name_ja TEXT NOT NULL,
  category_ja TEXT,
  cost_cp INTEGER,
  wait_time TEXT,
  exec_time TEXT,
  description TEXT
);

CREATE TABLE unit_types (
  id INTEGER PRIMARY KEY,
  category_ja TEXT,
  name_ja TEXT NOT NULL,
  notes TEXT
);

CREATE TABLE ship_classes (
  id INTEGER PRIMARY KEY,
  faction TEXT NOT NULL,
  name_ja TEXT NOT NULL,
  build_time_ja TEXT,
  unit_count TEXT,
  stats TEXT,
  description TEXT
);

CREATE TABLE deployments (
  id INTEGER PRIMARY KEY,
  system_ja TEXT,
  planet_ja TEXT,
  detail TEXT
);

CREATE TABLE client_strings (
  id INTEGER PRIMARY KEY,
  file TEXT NOT NULL,              -- constmsg.dat, messages_N.dat, messages_tac_N.dat, ...
  str_id INTEGER NOT NULL,         -- in-file record id (the catalog index the protocol references)
  text TEXT
);

CREATE INDEX idx_clientstrings ON client_strings(file, str_id);
CREATE INDEX idx_planets_system ON planets(system_id);
CREATE INDEX idx_fortresses_system ON fortresses(system_id);
CREATE INDEX idx_systems_faction ON star_systems(faction);
CREATE INDEX idx_posts_faction ON posts(faction);
CREATE INDEX idx_roster_faction ON roster(faction);
`;

// Only three powers exist at game start. The "corridor" (回廊) is geography, not a nation —
// systems carry an is_corridor flag instead.
const NATIONS = [
  ['empire', '銀河帝国'],
  ['alliance', '自由惑星同盟'],
  ['neutral', 'フェザーン自治領'],
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

/**
 * Build (or rebuild) the content DB from the JSON sources.
 * @param {{ contentDir?: string, dbPath?: string }} [opts]
 * @returns {{ db: DatabaseSync, counts: Record<string, number> }}
 */
export function buildContentDb({ contentDir = DEFAULT_CONTENT_DIR, dbPath = DEFAULT_DB_PATH } = {}) {
  const db = new DatabaseSync(dbPath);
  // Idempotent rebuild: drop everything we own, then recreate.
  for (const t of ['meta', 'nations', 'abilities', 'ranks', 'social_classes', 'growth_rules',
    'planets', 'fortresses', 'star_systems', 'posts', 'roster', 'strategy_commands',
    'unit_types', 'ship_classes', 'deployments', 'client_strings', 'characters',
    'ivex_roster', 'ivex_systems', 'ivex_planets']) {
    db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
  db.exec(SCHEMA_SQL);

  const counts = {};
  db.exec('BEGIN');
  try {
    const galaxy = readJson(join(contentDir, 'galaxy.json'));
    const roster = readJson(join(contentDir, 'roster', 'manual-roster.json'));
    const orgPosts = readJson(join(contentDir, 'manual', 'org-posts.json'));
    const cmds = readJson(join(contentDir, 'manual', 'strategy-commands.json'));
    const unitsDep = readJson(join(contentDir, 'manual', 'unit-types-deployments.json'));
    const ships = readJson(join(contentDir, 'manual', 'ship-units.json'));

    // meta / provenance
    const metaIns = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    metaIns.run('built', new Date().toISOString());
    metaIns.run('galaxy_source', galaxy._source ?? '');
    metaIns.run('roster_source', roster._source ?? '');

    const nIns = db.prepare('INSERT INTO nations (key, name_ja) VALUES (?, ?)');
    for (const [k, n] of NATIONS) nIns.run(k, n);
    counts.nations = NATIONS.length;

    // reference tables (from roster file)
    const abIns = db.prepare('INSERT INTO abilities (name_ja, effect) VALUES (?, ?)');
    for (const a of roster.abilities ?? []) abIns.run(a.name_ja, a.effect ?? '');
    counts.abilities = (roster.abilities ?? []).length;

    const rkIns = db.prepare('INSERT INTO ranks (ladder, ordinal, name_ja) VALUES (?, ?, ?)');
    (roster.rankLadderMilitary ?? []).forEach((n, i) => rkIns.run('military', i + 1, n));
    (roster.rankLadderPolitician ?? []).forEach((n, i) => rkIns.run('politician', i + 1, n));
    counts.ranks = (roster.rankLadderMilitary ?? []).length + (roster.rankLadderPolitician ?? []).length;

    const scIns = db.prepare('INSERT INTO social_classes (faction, name_ja) VALUES (?, ?)');
    for (const c of roster.classes ?? []) {
      const [fac, nm] = String(c).includes(':') ? c.split(':').map((s) => s.trim()) : ['', c];
      scIns.run(fac || null, nm);
    }
    counts.social_classes = (roster.classes ?? []).length;

    const grIns = db.prepare('INSERT INTO growth_rules (rule) VALUES (?)');
    for (const g of roster.growthRules ?? []) grIns.run(g);
    counts.growth_rules = (roster.growthRules ?? []).length;

    // galaxy
    const sysIns = db.prepare(`INSERT INTO star_systems
      (name_ja, faction, cx, cy, rect_x0, rect_y0, rect_x1, rect_y1, map_page, in_iv_ex,
       canon_col, canon_row, canon_dot_x, canon_dot_y, canon_line_marker_x, canon_line_marker_y,
    spectral_class, spectral_class_source, spectral_class_provenance_json,
    position_authority, coordinate_pending, name_authority, coordinate_source, planet_authority, note, is_corridor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const plIns = db.prepare('INSERT INTO planets (system_id, name_ja, orbit) VALUES (?, ?, ?)');
    const ftIns = db.prepare('INSERT INTO fortresses (system_id, name_ja) VALUES (?, ?)');
    let nPlanets = 0; let nForts = 0;
    for (const s of galaxy.systems ?? []) {
      const r = s.rect ?? [];
      const info = sysIns.run(s.system, s.faction ?? null,
        s.cx ?? null, s.cy ?? null, r[0] ?? null, r[1] ?? null, r[2] ?? null, r[3] ?? null,
        s.page ?? null, s.in_iv_ex ? 1 : 0,
      s.canonCol ?? null, s.canonRow ?? null, s.canonDotX ?? null, s.canonDotY ?? null,
      s.canonLineMarkerX ?? null, s.canonLineMarkerY ?? null,
      s.spectralClass ?? s.starClass ?? null,
      s.spectralClassSource ?? s.starClassSource ?? null,
      s.spectralClassProvenance ? JSON.stringify(s.spectralClassProvenance) : null,
      s.positionAuthority ?? null,
      s.coordinatePending ? 1 : 0,
      s.nameAuthority ?? null,
      s.coordinateSource ?? null,
      s.planetAuthority ?? null,
      s._note ?? s.note ?? null,
      s.is_corridor ? 1 : 0);
      const sid = Number(info.lastInsertRowid);
      for (const p of s.planets ?? []) {
        if (typeof p === 'string') { plIns.run(sid, p, 0); } else { plIns.run(sid, p.name, p.orbit ?? 0); }
        nPlanets += 1;
      }
      for (const f of s.fortresses ?? []) { ftIns.run(sid, f); nForts += 1; }
    }
    counts.star_systems = (galaxy.systems ?? []).length;
    counts.planets = nPlanets;
    counts.fortresses = nForts;

    // posts (organization tables — authoritative from org-posts.json)
    const poIns = db.prepare(`INSERT INTO posts
      (faction, post_ja, org_ja, capacity, min_rank_ja, max_rank_ja, holder_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    let nPosts = 0;
    for (const fac of ['empire', 'alliance']) {
      for (const p of orgPosts[fac] ?? []) {
        poIns.run(fac, p.post_ja, p.org_ja ?? null, p.capacity ?? null,
          p.min_rank_ja ?? null, p.max_rank_ja ?? null, p.holder_kind ?? null);
        nPosts += 1;
      }
    }
    counts.posts = nPosts;

    // roster (initial duty-card holders)
    const roIns = db.prepare(`INSERT INTO roster
      (faction, post_ja, holder_ja, holder_romaji, rank_ja, kind, unit_ja, is_deputy)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    let nRoster = 0;
    for (const fac of ['empire', 'alliance']) {
      for (const e of roster[fac] ?? []) {
        roIns.run(fac, e.post_ja ?? '', e.holder_ja ?? '', e.holder_romaji ?? null,
          e.rank_ja ?? null, e.kind ?? null, e.unit_ja ?? null, e.is_deputy ? 1 : 0);
        nRoster += 1;
      }
    }
    counts.roster = nRoster;

    // strategy commands
    const cmIns = db.prepare(`INSERT INTO strategy_commands
      (name_ja, category_ja, cost_cp, wait_time, exec_time, description)
      VALUES (?, ?, ?, ?, ?, ?)`);
    for (const c of cmds.commands ?? []) {
      cmIns.run(c.name_ja, c.category_ja ?? null,
        Number.isFinite(c.cost_cp) ? c.cost_cp : null,
        String(c.wait_time ?? ''), String(c.exec_time ?? ''), c.desc ?? '');
    }
    counts.strategy_commands = (cmds.commands ?? []).length;

    // unit types
    const utIns = db.prepare('INSERT INTO unit_types (category_ja, name_ja, notes) VALUES (?, ?, ?)');
    for (const u of unitsDep.unitTypes ?? []) utIns.run(u.category_ja ?? null, u.name_ja, u.notes ?? null);
    counts.unit_types = (unitsDep.unitTypes ?? []).length;

    // deployments
    const dpIns = db.prepare('INSERT INTO deployments (system_ja, planet_ja, detail) VALUES (?, ?, ?)');
    for (const d of unitsDep.deployments ?? []) dpIns.run(d.system_ja ?? null, d.planet_ja ?? null, d.detail ?? null);
    counts.deployments = (unitsDep.deployments ?? []).length;

    // ship classes
    const shIns = db.prepare(`INSERT INTO ship_classes
      (faction, name_ja, build_time_ja, unit_count, stats, description)
      VALUES (?, ?, ?, ?, ?, ?)`);
    let nShips = 0;
    for (const fac of ['empire', 'alliance']) {
      for (const s of ships[fac] ?? []) {
        shIns.run(fac, s.name_ja, s.build_time_ja ?? null, s.unit_count ?? null, s.stats ?? null, s.desc ?? null);
        nShips += 1;
      }
    }
    counts.ship_classes = nShips;

    // client string catalogs (data/MsgDat/*.dat — constmsg = master id->name catalog, 3199 entries)
    let nStrings = 0;
    try {
      const msgdat = readJson(join(contentDir, 'client', 'msgdat.json'));
      const csIns = db.prepare('INSERT INTO client_strings (file, str_id, text) VALUES (?, ?, ?)');
      for (const [file, info] of Object.entries(msgdat.files ?? {})) {
        for (const r of info.records ?? []) { csIns.run(file, r.id, r.text ?? ''); nStrings += 1; }
      }
    } catch { /* msgdat.json optional */ }
    counts.client_strings = nStrings;

    // unified character roster (manual duty-holders + prior-game cast) with 8 innate abilities
    let nChars = 0;
    try {
      const charsFile = readJson(join(contentDir, 'roster', 'characters.json'));
      const chIns = db.prepare(`INSERT INTO characters
        (name_ja, name_romaji, faction, rank_ja, kind, post_ja, source,
         tochi, seiji, unei, joho, shiki, kido, kogeki, bogyo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const c of charsFile.characters ?? []) {
        const a = c.stats ?? {};
        chIns.run(c.name_ja, c.name_romaji ?? null, c.faction ?? null, c.rank_ja ?? null,
          c.kind ?? null, c.post_ja ?? null, c.source ?? null,
          a.tochi ?? null, a.seiji ?? null, a.unei ?? null, a.joho ?? null,
          a.shiki ?? null, a.kido ?? null, a.kogeki ?? null, a.bogyo ?? null);
        nChars += 1;
      }
    } catch { /* characters.json optional */ }
    counts.characters = nChars;

    // LOGH IV EX reference (Korean editor db.mdb) — id->name + faction for cross-ref/enrichment
    let nIvex = 0;
    try {
      const ivex = readJson(join(contentDir, 'roster', 'ivex-reference.json'));
      // prefer the stats file (real abilities from the save) for the character roster
      let statsById = new Map();
      try {
        const st = readJson(join(contentDir, 'roster', 'ivex-stats.json'));
        statsById = new Map((st.characters ?? []).map((c) => [c.id, c.stats ?? {}]));
      } catch { /* ivex-stats.json optional */ }
      const irIns = db.prepare(`INSERT INTO ivex_roster
        (id, name_kr, faction, tochi, seiji, joho, kido, shiki, unei, kogeki, bogyo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const c of ivex.characters ?? []) {
        const a = statsById.get(c.id) ?? {};
        irIns.run(c.id, c.name_kr, c.faction ?? null,
          a.tochi ?? null, a.seiji ?? null, a.joho ?? null, a.kido ?? null,
          a.shiki ?? null, a.unei ?? null, a.kogeki ?? null, a.bogyo ?? null);
        nIvex += 1;
      }
      const isIns = db.prepare('INSERT INTO ivex_systems (id, name_kr) VALUES (?, ?)');
      for (const s of ivex.systems ?? []) isIns.run(s.id, s.name_kr);
      const ipIns = db.prepare('INSERT INTO ivex_planets (id, system_id, name_kr) VALUES (?, ?, ?)');
      for (const p of ivex.planets ?? []) ipIns.run(p.id, p.system_id ?? null, p.name_kr);
    } catch { /* ivex-reference.json optional */ }
    counts.ivex_roster = nIvex;

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { db, counts };
}

/** Open an already-built content DB read-only-ish (returns the DatabaseSync handle). */
export function loadContentDb(dbPath = DEFAULT_DB_PATH) {
  return new DatabaseSync(dbPath);
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const cmd = process.argv[2] ?? 'build';
  if (cmd === 'build') {
    const dbPath = process.argv[3] ? resolve(process.argv[3]) : DEFAULT_DB_PATH;
    const { db, counts } = buildContentDb({ dbPath });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`Built content DB -> ${dbPath}`);
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(18)} ${v}`);
    console.log(`  ${'TOTAL'.padEnd(18)} ${total} rows`);
    db.close();
  } else {
    console.error(`unknown command: ${cmd} (use: build [dbPath])`);
    process.exit(1);
  }
}
