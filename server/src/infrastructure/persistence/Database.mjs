// SQLite 연결 + 스키마 마이그레이션 (node:sqlite DatabaseSync)
// Hibernate DataSource 역할.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

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
  created_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_characters_account ON characters(account_id);
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
`;

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
  const row = db.prepare('SELECT COUNT(*) AS c FROM schema_version').get();
  if (!row || row.c === 0) {
    db.prepare('INSERT INTO schema_version(version) VALUES (?)').run(1);
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
