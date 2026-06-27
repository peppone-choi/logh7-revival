import { mkdirSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { accounts } from './accounts.schema.js';

// 계정 영속화의 Drizzle(better-sqlite3) 백엔드.
// 기존 node:sqlite 구현(`src/server/logh7-account-registry.mjs`의 loadSqliteAccountRecords/
// persistSqliteAccountRecords)의 **드롭인 패리티 대체**를 목표로 한다. 같은 파일·테이블·pragma·
// write semantics(전체 DELETE 후 bulk INSERT, 업서트 아님)·characters_json 직렬화를 그대로 재현해
// "node:sqlite 경로는 패리티 확인까지 폴백 유지"(마이그레이션 계획 Phase 1) 게이트를 닫는다.
//
// 본 슬라이스에서는 레지스트리에 *배선하지 않는다*(기본 경로=node:sqlite 유지 → `npm start`·1069 불변).
// 라이브 스왑은 패리티가 신뢰되는 다음 슬라이스에서 한다.

/** account registry 영속화는 SQLite만 허용(JSON은 seed 전용) — 레지스트리와 동일 규칙. */
function isAccountSqlitePath(persistPath: string): boolean {
  return /\.(sqlite|sqlite3|db)$/iu.test(persistPath);
}

function requireAccountSqlitePath(persistPath: string): void {
  if (!isAccountSqlitePath(String(persistPath ?? ''))) {
    throw new Error('account registry persistence must use SQLite (*.sqlite, *.sqlite3, *.db); JSON is seed-only');
  }
}

// 아래 두 헬퍼는 `logh7-account-registry.mjs:88-98,173-177`을 미러한다(코어 무수정 유지).
// 어긋나면 parity 테스트(cross-read 동일성)가 즉시 깨지므로 drift는 자동 검출된다.
function parseCharactersJson(raw: unknown): unknown[] {
  if (typeof raw !== 'string' || raw.length === 0) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function profileRecords(record: AccountRecordInput): unknown[] {
  const arrays = [record?.characters, record?.profileSummaries, record?.characterSummaries].filter(
    (value): value is unknown[] => Array.isArray(value),
  );
  return arrays.find((profiles) => profiles.length > 0) ?? arrays[0] ?? [];
}

export interface AccountRecord {
  account: string;
  salt: string;
  hash: string;
  createdAt: string | null;
  characters: unknown[];
}

export interface AccountRecordInput {
  account: string;
  salt: string;
  hash: string;
  createdAt?: string | null;
  characters?: unknown[];
  profileSummaries?: unknown[];
  characterSummaries?: unknown[];
}

// 레지스트리 openAccountSqlite와 동일: DELETE 저널(=stray -wal/-shm 없음)·NORMAL sync·동일 DDL.
function openDrizzleAccountsDb(persistPath: string): { sqlite: Database.Database; db: ReturnType<typeof drizzle> } {
  requireAccountSqlitePath(persistPath);
  const resolved = path.resolve(persistPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const sqlite = new Database(resolved);
  sqlite.pragma('journal_mode = DELETE');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      account TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at TEXT,
      characters_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
  return { sqlite, db: drizzle(sqlite) };
}

/** node:sqlite loadAccountRecords의 Drizzle 등가물. 반환 shape 동일: {account,salt,hash,createdAt,characters}. */
export function loadAccountRecordsDrizzle(persistPath: string): AccountRecord[] {
  requireAccountSqlitePath(persistPath);
  const { sqlite, db } = openDrizzleAccountsDb(persistPath);
  try {
    const rows = db
      .select({
        account: accounts.account,
        salt: accounts.salt,
        hash: accounts.hash,
        createdAt: accounts.createdAt,
        charactersJson: accounts.charactersJson,
      })
      .from(accounts)
      .orderBy(accounts.account)
      .all();
    return rows.map((row) => ({
      account: row.account,
      salt: row.salt,
      hash: row.hash,
      createdAt: row.createdAt ?? null,
      characters: parseCharactersJson(row.charactersJson),
    }));
  } finally {
    sqlite.close();
  }
}

/** node:sqlite persistAccountRecords의 Drizzle 등가물. BEGIN IMMEDIATE→DELETE→bulk INSERT(업서트 아님). */
export function persistAccountRecordsDrizzle(persistPath: string, records: AccountRecordInput[]): void {
  requireAccountSqlitePath(persistPath);
  const { sqlite, db } = openDrizzleAccountsDb(persistPath);
  try {
    // 레지스트리와 동일하게 전체 truncate 후 재삽입을 한 트랜잭션으로 처리한다.
    // behavior:'immediate' = 레지스트리의 `BEGIN IMMEDIATE`와 동일한 잠금 의미.
    db.transaction(
      (tx) => {
        tx.delete(accounts).run();
        for (const record of records) {
          tx
            .insert(accounts)
            .values({
              account: record.account,
              salt: record.salt,
              hash: record.hash,
              createdAt: record.createdAt ?? null,
              charactersJson: JSON.stringify(profileRecords(record)),
            })
            .run();
        }
      },
      { behavior: 'immediate' },
    );
  } finally {
    sqlite.close();
  }
}
