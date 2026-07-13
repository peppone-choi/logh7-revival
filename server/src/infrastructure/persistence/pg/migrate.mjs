// migrate — 최소 순번 SQL 마이그레이션 러너 (스텁, 미배선)
//
// server/migrations/NNNN_*.sql 을 순서대로 1회씩 적용하고 schema_migrations 에
// 기록한다. 이미 적용된 version 은 건너뛴다(멱등, 롤포워드 전용).
// 아직 부팅 경로에 연결되지 않음 — 다음 배치에서 DATABASE_URL 설정 시 호출.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(HERE, '..', '..', '..', '..', 'migrations');

const FILE_RE = /^(\d{4})_.*\.sql$/;

/** migrations 디렉터리에서 순번·경로 목록을 오름차순으로 읽는다. */
export function listMigrations(dir = MIGRATIONS_DIR) {
  return readdirSync(dir)
    .map((name) => {
      const m = FILE_RE.exec(name);
      return m ? { version: Number(m[1]), name, path: join(dir, name) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.version - b.version);
}

/**
 * 미적용 마이그레이션을 순서대로 적용한다.
 * @param {import('./PgConnection.mjs').PgConnection} connection
 * @param {string} [dir]
 * @returns {Promise<number[]>} 이번에 적용한 version 목록
 */
export async function runMigrations(connection, dir = MIGRATIONS_DIR) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       applied_at BIGINT  NOT NULL
     )`,
  );
  const { rows } = await connection.query('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => Number(r.version)));

  const pending = listMigrations(dir).filter((m) => !applied.has(m.version));
  const done = [];
  for (const migration of pending) {
    const sql = readFileSync(migration.path, 'utf8');
    await connection.transaction(async (client) => {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations(version, applied_at) VALUES ($1, $2)',
        [migration.version, Date.now()],
      );
    });
    done.push(migration.version);
  }
  return done;
}
