// 정적 세계 시드 로더 — server/data/seed/*.json → 참조 카탈로그 테이블 (멱등)
//
// 멱등성: 각 카탈로그를 INSERT OR REPLACE 로 적재(재실행 시 동일 상태).
//   추가로 seed-manifest.json 의 generatedAt 을 마커로 기록해, 변경 없으면 스킵.
// provenance: 각 카탈로그의 provenance/generatedAt/행수를 seed_provenance 에 보존.
// 데이터 무변조: JSON 을 읽어 컬럼에 매핑만 한다(값 재계산·보정 없음).

import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SEED_DIR = join(HERE, '..', '..', '..', 'data', 'seed');
// 외부 작성 NPC 드롭인 파일명. 없으면 캐논 99만 로드(에러 아님).
export const NPC_FILE = 'npc-characters.json';

const MANIFEST_MARKER = '_manifest';

function readJson(seedDir, file) {
  return JSON.parse(readFileSync(join(seedDir, file), 'utf8'));
}

// NPC 드롭인 파일의 내용 해시(없으면 'none'). 마커에 섞어 파일 변경 시 재적재를 유발.
function npcFingerprint(npcPath) {
  if (!npcPath || !existsSync(npcPath)) return 'none';
  return createHash('sha256').update(readFileSync(npcPath)).digest('hex').slice(0, 16);
}

const COUNT_TABLES = [
  'galaxy_systems',
  'ships',
  'fortresses',
  'factions',
  'rank_table',
  'abilities',
  'initial_deployment',
  'canon_characters',
];

function readCounts(db) {
  const counts = {};
  for (const table of COUNT_TABLES) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c;
  }
  return counts;
}

/**
 * 정적 세계 시드를 DB 에 적재한다.
 * @param {{ db: import('node:sqlite').DatabaseSync }} connection openDatabase() 결과
 * @param {string} [seedDir] 시드 JSON 디렉터리 (기본 server/data/seed)
 * @param {boolean} [force] manifest 변경 여부와 무관하게 재적재
 * @param {{ debug?: Function }} [logger]
 * @returns {{ skipped: boolean, generatedAt: string, counts: Record<string, number> }}
 */
export function loadWorldSeed({
  connection,
  seedDir = DEFAULT_SEED_DIR,
  npcPath = join(seedDir, NPC_FILE),
  force = false,
  logger,
} = {}) {
  const { db } = connection;
  const manifest = readJson(seedDir, 'seed-manifest.json');
  const generatedAt = String(manifest.generatedAt ?? '');
  // 멱등 마커: 매니페스트 생성시각 + NPC 드롭인 파일 지문. NPC 파일이 나중에
  // 추가/변경되면 마커가 달라져 자동 재적재된다.
  const marker = `${generatedAt}|npc:${npcFingerprint(npcPath)}`;

  const existing = db
    .prepare('SELECT generated_at FROM seed_provenance WHERE catalog = ?')
    .get(MANIFEST_MARKER);
  if (!force && existing && existing.generated_at === marker) {
    return { skipped: true, generatedAt, counts: readCounts(db) };
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    loadGalaxy(db, seedDir);
    loadShips(db, seedDir);
    loadFortresses(db, seedDir);
    loadFactions(db, seedDir);
    loadRanks(db, seedDir);
    loadAbilities(db, seedDir);
    loadInitialDeployment(db, seedDir);
    loadCanonCharacters(db, seedDir);
    loadNpcCharacters(db, npcPath);

    const now = Date.now();
    db.prepare(
      `INSERT INTO seed_provenance(catalog, source_file, provenance, generated_at, row_count, loaded_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(catalog) DO UPDATE SET
         source_file=excluded.source_file,
         provenance=excluded.provenance,
         generated_at=excluded.generated_at,
         row_count=excluded.row_count,
         loaded_at=excluded.loaded_at`,
    ).run(MANIFEST_MARKER, 'seed-manifest.json', String(manifest.note ?? ''), marker, 0, now);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const counts = readCounts(db);
  logger?.debug?.('world seed loaded', counts);
  return { skipped: false, generatedAt, counts };
}

function recordProvenance(db, catalog, file, catalogDoc, rowCount) {
  db.prepare(
    `INSERT INTO seed_provenance(catalog, source_file, provenance, generated_at, row_count, loaded_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(catalog) DO UPDATE SET
       source_file=excluded.source_file,
       provenance=excluded.provenance,
       generated_at=excluded.generated_at,
       row_count=excluded.row_count,
       loaded_at=excluded.loaded_at`,
  ).run(
    catalog,
    file,
    String(catalogDoc.provenance ?? ''),
    String(catalogDoc.generatedAt ?? ''),
    rowCount,
    Date.now(),
  );
}

function loadGalaxy(db, seedDir) {
  const doc = readJson(seedDir, 'galaxy-systems.json');
  const stmt = db.prepare(
    `INSERT INTO galaxy_systems(
       system_name, faction, is_corridor, canon_col, canon_row, cell,
       canon_game_col, canon_game_row, spectral_class, planets_json, fortresses_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(system_name) DO UPDATE SET
       faction=excluded.faction, is_corridor=excluded.is_corridor,
       canon_col=excluded.canon_col, canon_row=excluded.canon_row, cell=excluded.cell,
       canon_game_col=excluded.canon_game_col, canon_game_row=excluded.canon_game_row,
       spectral_class=excluded.spectral_class, planets_json=excluded.planets_json,
       fortresses_json=excluded.fortresses_json`,
  );
  for (const s of doc.systems) {
    stmt.run(
      s.system,
      s.faction ?? null,
      s.isCorridor ? 1 : 0,
      s.canonCol ?? null,
      s.canonRow ?? null,
      s.cell ?? null,
      s.canonGameCol ?? null,
      s.canonGameRow ?? null,
      s.spectralClass ?? null,
      JSON.stringify(s.planets ?? []),
      JSON.stringify(s.fortresses ?? []),
    );
  }
  recordProvenance(db, 'galaxy-systems.json', 'galaxy-systems.json', doc, doc.systems.length);
}

function loadShips(db, seedDir) {
  const doc = readJson(seedDir, 'ships.json');
  const stmt = db.prepare(
    `INSERT INTO ships(ship_key, name, side, ship_class, pools_json)
     VALUES (?,?,?,?,?)
     ON CONFLICT(ship_key) DO UPDATE SET
       name=excluded.name, side=excluded.side,
       ship_class=excluded.ship_class, pools_json=excluded.pools_json`,
  );
  for (const s of doc.ships) {
    stmt.run(s.key, s.name ?? null, s.side ?? null, s.shipClass ?? null, JSON.stringify(s.pools ?? {}));
  }
  recordProvenance(db, 'ships.json', 'ships.json', doc, doc.ships.length);
}

function loadFortresses(db, seedDir) {
  const doc = readJson(seedDir, 'fortresses.json');
  const stmt = db.prepare(
    `INSERT INTO fortresses(
       id, name_ja, name_ko, name_en, system, faction, cannon_name, cannon_power,
       armor, antiaircraft, stamina, defense_outfit, garrison_capacity, data_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       name_ja=excluded.name_ja, name_ko=excluded.name_ko, name_en=excluded.name_en,
       system=excluded.system, faction=excluded.faction, cannon_name=excluded.cannon_name,
       cannon_power=excluded.cannon_power, armor=excluded.armor, antiaircraft=excluded.antiaircraft,
       stamina=excluded.stamina, defense_outfit=excluded.defense_outfit,
       garrison_capacity=excluded.garrison_capacity, data_json=excluded.data_json`,
  );
  for (const f of doc.fortresses) {
    stmt.run(
      f.id,
      f.name_ja ?? null,
      f.name_ko ?? null,
      f.name_en ?? null,
      f.system ?? null,
      f.faction ?? null,
      f.cannon_name ?? null,
      f.cannon_power ?? null,
      f.armor ?? null,
      f.antiaircraft ?? null,
      f.stamina ?? null,
      f.defense_outfit ?? null,
      f.garrison_capacity ?? null,
      JSON.stringify(f),
    );
  }
  recordProvenance(db, 'fortresses.json', 'fortresses.json', doc, doc.fortresses.length);
}

function loadFactions(db, seedDir) {
  const doc = readJson(seedDir, 'factions.json');
  const stmt = db.prepare(
    `INSERT INTO factions(
       id, power_id, name_ja, name_ko, name_en, color_rgb_json, dynasty, flags_json, note
     ) VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       power_id=excluded.power_id, name_ja=excluded.name_ja, name_ko=excluded.name_ko,
       name_en=excluded.name_en, color_rgb_json=excluded.color_rgb_json,
       dynasty=excluded.dynasty, flags_json=excluded.flags_json, note=excluded.note`,
  );
  for (const f of doc.factions) {
    stmt.run(
      f.id,
      f.powerId ?? null,
      f.name_ja ?? null,
      f.name_ko ?? null,
      f.name_en ?? null,
      JSON.stringify(f.colorRgb ?? null),
      f.dynasty ?? null,
      JSON.stringify(f.flags ?? []),
      f.note ?? null,
    );
  }
  recordProvenance(db, 'factions.json', 'factions.json', doc, doc.factions.length);
}

function loadRanks(db, seedDir) {
  const doc = readJson(seedDir, 'rank-table.json');
  const stmt = db.prepare(
    `INSERT INTO rank_table(code, ja, ko, tier, confidence)
     VALUES (?,?,?,?,?)
     ON CONFLICT(code) DO UPDATE SET
       ja=excluded.ja, ko=excluded.ko, tier=excluded.tier, confidence=excluded.confidence`,
  );
  for (const r of doc.ranks) {
    stmt.run(r.code, r.ja ?? null, r.ko ?? null, r.tier ?? null, r.confidence ?? null);
  }
  recordProvenance(db, 'rank-table.json', 'rank-table.json', doc, doc.ranks.length);
}

function loadAbilities(db, seedDir) {
  const doc = readJson(seedDir, 'ability-schema.json');
  const stmt = db.prepare(
    `INSERT INTO abilities(order_index, ability_key, ja, ko)
     VALUES (?,?,?,?)
     ON CONFLICT(order_index) DO UPDATE SET
       ability_key=excluded.ability_key, ja=excluded.ja, ko=excluded.ko`,
  );
  doc.order.forEach((key, index) => {
    stmt.run(index, key, doc.ja?.[key] ?? null, doc.ko?.[key] ?? null);
  });
  recordProvenance(db, 'ability-schema.json', 'ability-schema.json', doc, doc.order.length);
}

function loadInitialDeployment(db, seedDir) {
  const doc = readJson(seedDir, 'initial-deployment.json');
  const stmt = db.prepare(
    `INSERT INTO initial_deployment(faction, unit, system, planet, cell)
     VALUES (?,?,?,?,?)
     ON CONFLICT(faction, unit) DO UPDATE SET
       system=excluded.system, planet=excluded.planet, cell=excluded.cell`,
  );
  let total = 0;
  for (const [faction, key] of [['empire', 'imperial'], ['alliance', 'alliance']]) {
    const group = doc[key];
    if (!group?.fleet) continue;
    for (const u of group.fleet) {
      stmt.run(faction, u.unit, u.system ?? null, u.planet ?? null, u.cell ?? null);
      total += 1;
    }
  }
  recordProvenance(db, 'initial-deployment.json', 'initial-deployment.json', doc, total);
}

function loadCanonCharacters(db, seedDir) {
  const doc = readJson(seedDir, 'characters.json');
  const stmt = db.prepare(
    `INSERT INTO canon_characters(
       id, faction, power_id, kind, sex, name_ja, name_romaji, name_kr,
       lastname, firstname, rank_code, post, face, ability8_json, unit, flagship, data_json
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       faction=excluded.faction, power_id=excluded.power_id, kind=excluded.kind, sex=excluded.sex,
       name_ja=excluded.name_ja, name_romaji=excluded.name_romaji, name_kr=excluded.name_kr,
       lastname=excluded.lastname, firstname=excluded.firstname, rank_code=excluded.rank_code,
       post=excluded.post, face=excluded.face, ability8_json=excluded.ability8_json,
       unit=excluded.unit, flagship=excluded.flagship, data_json=excluded.data_json`,
  );
  for (const c of doc.characters) {
    stmt.run(
      c.id,
      c.faction ?? null,
      c.powerId ?? null,
      c.kind ?? null,
      c.sex ?? null,
      c.name_ja ?? null,
      c.name_romaji ?? null,
      c.name_kr ?? null,
      c.lastname ?? null,
      c.firstname ?? null,
      c.rankCode ?? null,
      c.post ?? null,
      c.face ?? null,
      JSON.stringify(c.ability8 ?? null),
      c.unit ?? null,
      c.flagship ?? null,
      JSON.stringify(c),
    );
  }
  recordProvenance(db, 'characters.json', 'characters.json', doc, doc.characters.length);
}
