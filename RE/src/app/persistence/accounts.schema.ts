import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Drizzle 스키마 = 기존 node:sqlite `accounts` 테이블과 **바이트/스키마 동일**해야 한다
// (source of truth: `src/server/logh7-account-registry.mjs:74-84`의 CREATE TABLE).
//   account TEXT PRIMARY KEY
//   salt    TEXT NOT NULL
//   hash    TEXT NOT NULL
//   created_at TEXT            (nullable ISO 문자열 — Drizzle timestamp 모드 금지: 포맷 보존)
//   characters_json TEXT NOT NULL DEFAULT '[]'
// 이 스키마가 레지스트리 DDL과 어긋나면 parity 테스트(table_info 동일성)가 깨진다 = drift guard.
export const accounts = sqliteTable('accounts', {
  account: text('account').primaryKey(),
  salt: text('salt').notNull(),
  hash: text('hash').notNull(),
  createdAt: text('created_at'),
  charactersJson: text('characters_json').notNull().default('[]'),
});

export type AccountRow = typeof accounts.$inferSelect;
export type AccountInsert = typeof accounts.$inferInsert;
