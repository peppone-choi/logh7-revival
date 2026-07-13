// SQLite 연결 + 스키마 마이그레이션 (node:sqlite DatabaseSync)
// Hibernate DataSource 역할.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { seedAuthorityCardsForPower } from '../../domain/authority-cards.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = join(HERE, '..', '..', '..', 'data', 'logh7.sqlite');

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  power INTEGER NOT NULL DEFAULT 1,
  blood INTEGER NOT NULL DEFAULT 0,
  sex INTEGER NOT NULL DEFAULT 0,
  lastname TEXT NOT NULL DEFAULT '',
  firstname TEXT NOT NULL DEFAULT '',
  face INTEGER NOT NULL DEFAULT 1,
  rank INTEGER NOT NULL DEFAULT 13,
  unit_id INTEGER,
  cell INTEGER NOT NULL DEFAULT 2588,
  online INTEGER NOT NULL DEFAULT 0,
  ability8_json TEXT,
  -- 1 = 권한카드 계약이 이미 적용된 캐릭터. 카드 0장이어도 재시드하지 않는다(의도적 revoke 보존).
  authority_cards_seeded INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_account ON characters(account_id);
CREATE TABLE IF NOT EXISTS character_authority_cards (
  character_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 15),
  kind INTEGER NOT NULL CHECK (kind BETWEEN 0 AND 299),
  spot INTEGER NOT NULL CHECK (spot BETWEEN 0 AND 4294967295),
  provenance TEXT NOT NULL CHECK (length(provenance) > 0),
  PRIMARY KEY (character_id, ordinal),
  UNIQUE (character_id, kind),
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_authority_cards_character
  ON character_authority_cards(character_id, ordinal);
CREATE TABLE IF NOT EXISTS world_fleet (
  unit_id INTEGER PRIMARY KEY,
  character_id INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  cell INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS domain_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ── 정적 세계 참조 카탈로그 (읽기 전용 시드; 플레이어 상태와 분리) ──────────
-- 시드 소스: server/data/seed/*.json (extract-miner 정본). WorldSeedLoader 가 멱등 적재.
CREATE TABLE IF NOT EXISTS galaxy_systems (
  system_name TEXT PRIMARY KEY,
  faction TEXT,
  is_corridor INTEGER NOT NULL DEFAULT 0,
  canon_col INTEGER,
  canon_row INTEGER,
  cell INTEGER,
  canon_game_col INTEGER,
  canon_game_row INTEGER,
  spectral_class TEXT,
  planets_json TEXT,
  fortresses_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_galaxy_cell ON galaxy_systems(cell);

CREATE TABLE IF NOT EXISTS ships (
  ship_key TEXT PRIMARY KEY,
  name TEXT,
  side TEXT,
  ship_class TEXT,
  pools_json TEXT
);

CREATE TABLE IF NOT EXISTS fortresses (
  id TEXT PRIMARY KEY,
  name_ja TEXT,
  name_ko TEXT,
  name_en TEXT,
  system TEXT,
  faction TEXT,
  cannon_name TEXT,
  cannon_power INTEGER,
  armor INTEGER,
  antiaircraft INTEGER,
  stamina INTEGER,
  defense_outfit INTEGER,
  garrison_capacity INTEGER,
  data_json TEXT
);

CREATE TABLE IF NOT EXISTS factions (
  id TEXT PRIMARY KEY,
  power_id INTEGER,
  name_ja TEXT,
  name_ko TEXT,
  name_en TEXT,
  color_rgb_json TEXT,
  dynasty TEXT,
  flags_json TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS rank_table (
  code INTEGER PRIMARY KEY,
  ja TEXT,
  ko TEXT,
  tier TEXT,
  confidence TEXT
);

CREATE TABLE IF NOT EXISTS abilities (
  order_index INTEGER PRIMARY KEY,
  ability_key TEXT NOT NULL,
  ja TEXT,
  ko TEXT
);

-- 시나리오 시작 배치 (제국12 + 동맹12). cell 은 galaxy_systems 와 공유 소스.
CREATE TABLE IF NOT EXISTS initial_deployment (
  faction TEXT NOT NULL,
  unit INTEGER NOT NULL,
  system TEXT,
  planet TEXT,
  cell INTEGER,
  PRIMARY KEY (faction, unit)
);

-- NPC 정의(캐논 99 + 외부 작성 무명 슬롯). id 로 캐논/외부 범위 분리(캐논=slug, 외부=npc-*).
-- source 로 출처 구분: 'canon'(server/data/seed/characters.json) | 'external'(npc-characters.json).
CREATE TABLE IF NOT EXISTS canon_characters (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'canon',
  faction TEXT,
  power_id INTEGER,
  kind TEXT,
  sex INTEGER,
  name_ja TEXT,
  name_romaji TEXT,
  name_kr TEXT,
  lastname TEXT,
  firstname TEXT,
  rank_code INTEGER,
  post TEXT,
  face INTEGER,
  ability8_json TEXT,
  unit INTEGER,
  flagship TEXT,
  data_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_canon_characters_source ON canon_characters(source);

-- 시드 provenance/멱등 추적 (정본 출처·생성시각·행수 보존)
CREATE TABLE IF NOT EXISTS seed_provenance (
  catalog TEXT PRIMARY KEY,
  source_file TEXT,
  provenance TEXT,
  generated_at TEXT,
  row_count INTEGER,
  loaded_at INTEGER
);
`;

/**
 * SQLite 트랜잭션 헬퍼. node:sqlite(DatabaseSync)는 전용 API가 없어 BEGIN/COMMIT/ROLLBACK 을 직접 쓴다.
 * 중간 실패 시 부분 쓰기가 남지 않도록 모든 다중행 쓰기는 이 헬퍼를 통과시킨다.
 */
export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/**
 * @param {{ dbPath?: string }} [options]
 * @returns {{ db: DatabaseSync, path: string, close: () => void, exec: (sql:string)=>void, prepare: (sql:string)=>any }}
 */
export function openDatabase({ dbPath = DEFAULT_DB_PATH } = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(MIGRATIONS);
  // 구 DB 보정: characters.authority_cards_seeded 컬럼이 없으면 추가하고,
  // 이미 카드 행을 가진 캐릭터는 seeded=1 로 표시한다(재시드 대상에서 제외).
  const characterCols = db.prepare("PRAGMA table_info('characters')").all();
  if (characterCols.length > 0 && !characterCols.some((c) => c.name === 'authority_cards_seeded')) {
    db.exec('ALTER TABLE characters ADD COLUMN authority_cards_seeded INTEGER NOT NULL DEFAULT 0');
    db.exec(`
      UPDATE characters SET authority_cards_seeded = 1
      WHERE EXISTS (SELECT 1 FROM character_authority_cards a WHERE a.character_id = characters.id)
    `);
    // 스키마 업그레이드 완료 — version 3 → 4
    db.prepare('UPDATE schema_version SET version = 4 WHERE version < 4').run();
  }
  // 구 DB 보정(컬럼 재추가 후): 기존 카드가 있지만 아직 seeded=0으로 표시된 캐릭터들을 정리한다.
  // (컬럼 추가 단계에서 표시되지 않은 경우 대비)
  db.exec(`
    UPDATE characters SET authority_cards_seeded = 1
    WHERE authority_cards_seeded = 0
    AND EXISTS (SELECT 1 FROM character_authority_cards a WHERE a.character_id = characters.id)
  `);
  // 카드 테이블이 없던 구 DB의 캐릭터만 P0/P1 정본으로 보정한다.
  // seeded=1 인 캐릭터는 카드 0장이어도 건드리지 않는다 — 명시적 revoke 를 부활시키지 않기 위해.
  // 백필은 all-or-nothing: 한 캐릭터의 카드가 실패하면 전체를 롤백한다.
  const legacyCharacters = db.prepare(`
    SELECT id, power FROM characters WHERE authority_cards_seeded = 0 ORDER BY id
  `).all();
  if (legacyCharacters.length > 0) {
    try {
      withTransaction(db, () => {
        const insertAuthorityCard = db.prepare(`
          INSERT INTO character_authority_cards(character_id, ordinal, kind, spot, provenance)
          VALUES (?, ?, ?, ?, ?)
        `);
        const markSeeded = db.prepare('UPDATE characters SET authority_cards_seeded = 1 WHERE id = ?');
        for (const character of legacyCharacters) {
          for (const card of seedAuthorityCardsForPower(character.power)) {
            insertAuthorityCard.run(
              character.id,
              card.ordinal,
              card.kind,
              card.spot,
              card.provenance,
            );
          }
          markSeeded.run(character.id);
        }
      });
    } catch (error) {
      // 백필 실패로 openDatabase 가 실패하면 연결도 닫는다(핸들 누수 방지).
      db.close();
      throw error;
    }
  }
  // 기존 DB 보정: canon_characters.source 컬럼이 없으면 추가 (구 스키마 → NPC 수용).
  const canonCols = db.prepare("PRAGMA table_info('canon_characters')").all();
  if (canonCols.length > 0 && !canonCols.some((c) => c.name === 'source')) {
    db.exec("ALTER TABLE canon_characters ADD COLUMN source TEXT NOT NULL DEFAULT 'canon'");
    db.exec('CREATE INDEX IF NOT EXISTS idx_canon_characters_source ON canon_characters(source)');
  }
  const row = db.prepare('SELECT COUNT(*) AS c FROM schema_version').get();
  if (!row || row.c === 0) {
    db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(4);
  } else {
    db.prepare('UPDATE schema_version SET version = 4 WHERE version < 4').run();
  }
  return {
    db,
    path: dbPath,
    close() {
      db.close();
    },
    exec(sql) {
      db.exec(sql);
    },
    prepare(sql) {
      return db.prepare(sql);
    },
  };
}
