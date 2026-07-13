// 스키마 마이그레이션 검증 — version 3 → 4 자가치유, 신규 DB version 4 생성
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { openDatabase } from '../src/infrastructure/persistence/Database.mjs';

async function freshDb() {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-schema-'));
  const dbPath = join(dir, 't.sqlite');
  return { dir, dbPath };
}

test('schema migration: version 3 DB without authority_cards_seeded upgrades to version 4', async () => {
  const { dir, dbPath } = await freshDb();
  try {
    // 1) 버전 3 DB를 수동으로 생성(authority_cards_seeded 컬럼 없음)
    const dbV3 = new DatabaseSync(dbPath);
    dbV3.exec('PRAGMA journal_mode = WAL;');
    dbV3.exec('PRAGMA foreign_keys = ON;');
    dbV3.exec(`
      CREATE TABLE schema_version (
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version(version) VALUES (3);
      CREATE TABLE characters (
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
        created_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE character_authority_cards (
        character_id INTEGER NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 15),
        kind INTEGER NOT NULL CHECK (kind BETWEEN 0 AND 299),
        spot INTEGER NOT NULL CHECK (spot BETWEEN 0 AND 4294967295),
        provenance TEXT NOT NULL CHECK (length(provenance) > 0),
        PRIMARY KEY (character_id, ordinal),
        UNIQUE (character_id, kind),
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );
    `);
    dbV3.close();

    // 2) openDatabase로 기존 DB를 열면 마이그레이션이 실행됨
    const connection = openDatabase({ dbPath });
    const { db } = connection;

    // 3) authority_cards_seeded 컬럼이 추가되었는지 확인
    const characterCols = db.prepare("PRAGMA table_info('characters')").all();
    const hasSeededCol = characterCols.some((c) => c.name === 'authority_cards_seeded');
    assert.ok(hasSeededCol, 'authority_cards_seeded column added');

    // 4) 스키마 버전이 4로 올라갔는지 확인
    const versionRow = db.prepare('SELECT version FROM schema_version').get();
    assert.equal(versionRow.version, 4, 'schema_version upgraded to 4');

    connection.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('schema migration: brand new DB created with version 4', async () => {
  const { dir, dbPath } = await freshDb();
  try {
    // openDatabase로 신규 DB를 생성
    const connection = openDatabase({ dbPath });
    const { db } = connection;

    // 스키마 버전이 4로 생성되었는지 확인
    const versionRow = db.prepare('SELECT version FROM schema_version').get();
    assert.equal(versionRow.version, 4, 'new DB created with schema_version 4');

    // authority_cards_seeded 컬럼이 이미 있는지 확인
    const characterCols = db.prepare("PRAGMA table_info('characters')").all();
    const hasSeededCol = characterCols.some((c) => c.name === 'authority_cards_seeded');
    assert.ok(hasSeededCol, 'authority_cards_seeded column present in new DB');

    connection.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('schema migration: version 3 DB with existing cards marks character as seeded', async () => {
  const { dir, dbPath } = await freshDb();
  try {
    // 1) 버전 3 DB를 수동으로 생성(카드 행 포함)
    const dbV3 = new DatabaseSync(dbPath);
    dbV3.exec('PRAGMA journal_mode = WAL;');
    dbV3.exec('PRAGMA foreign_keys = ON;');
    dbV3.exec(`
      CREATE TABLE schema_version (
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version(version) VALUES (3);
      CREATE TABLE characters (
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
        created_at INTEGER NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE character_authority_cards (
        character_id INTEGER NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 15),
        kind INTEGER NOT NULL CHECK (kind BETWEEN 0 AND 299),
        spot INTEGER NOT NULL CHECK (spot BETWEEN 0 AND 4294967295),
        provenance TEXT NOT NULL CHECK (length(provenance) > 0),
        PRIMARY KEY (character_id, ordinal),
        UNIQUE (character_id, kind),
        FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
      );
      INSERT INTO characters(account_id, created_at, updated_at) VALUES ('test-account', 1000, 2000);
      INSERT INTO character_authority_cards(character_id, ordinal, kind, spot, provenance)
        VALUES (1, 0, 10, 0, 'test-card');
    `);
    dbV3.close();

    // 2) openDatabase로 기존 DB를 열면 마이그레이션이 실행됨
    const connection = openDatabase({ dbPath });
    const { db } = connection;

    // 3) authority_cards_seeded가 1로 표시되었는지 확인(카드가 존재하기 때문)
    const charRow = db.prepare('SELECT authority_cards_seeded FROM characters WHERE id = 1').get();
    assert.equal(charRow.authority_cards_seeded, 1, 'character with existing cards marked as seeded=1');

    connection.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
