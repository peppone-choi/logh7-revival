// 영속성 포트(repository) — 인메모리 authoritative 상태를 외부 저장소로 덤프/로드하는 스왑 가능한 어댑터.
//
// 설계(플랜 A4): authoritative 진실은 인메모리(world-state/entity-store)에 있고, 이 포트는 주기/종료 시
// 스냅샷을 "기록(write-behind)"하고 부팅 시 "로드"만 한다 — 게임 서버 표준(CQRS 비동기 영속성).
// 포트는 도메인 타입을 모른다: `save(snapshot)`/`load()`로 불투명한 평범한 객체(JSON 직렬화 가능)를 다룬다.
// backend:
//   - memory   : 프로세스 내 변수 보관(테스트/휘발). 기본 fallback.
//   - sqlite   : node:sqlite 단일 스냅샷 row. 로컬 배포/운영 기본.
//   - jsonSeed : 저장소 backend가 아니라 SQLite 초기화용 읽기 전용 seed 파일.
//   - postgres : (후순위) Docker RDB. 현재는 명확한 에러로 안내.
// 나중에 Docker RDB로 갈 때 backend만 갈아끼우면 앱 레이어는 무변경(DIP).

import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const SNAPSHOT_VERSION = 1;
export const DEFAULT_JSON_SEED_SNAPSHOT_PATH = '.omo/state/world-snapshot.seed.json';
// Backward-compatible constant name for callers that still refer to the old JSON snapshot path. The file
// is now a seed input only, never a runtime write target.
export const DEFAULT_LEGACY_JSON_SNAPSHOT_PATH = DEFAULT_JSON_SEED_SNAPSHOT_PATH;
export const DEFAULT_SNAPSHOT_PATH = DEFAULT_JSON_SEED_SNAPSHOT_PATH;
export const DEFAULT_SQLITE_PATH = 'logh7-runtime/state/world-state.sqlite';

function memoryBackend() {
  let held = null;
  return {
    backend: 'memory',
    load() {
      return held;
    },
    save(snapshot) {
      held = snapshot;
    },
    close() {},
  };
}

function defaultPathForBackend(backend, path) {
  if (typeof path === 'string' && path.length > 0) return path;
  if (backend === 'sqlite') return DEFAULT_SQLITE_PATH;
  return DEFAULT_SQLITE_PATH;
}

function loadJsonSeedSnapshot(seedPath) {
  if (!seedPath || !existsSync(seedPath)) return null;
  try {
    const parsed = JSON.parse(readFileSync(seedPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function sqliteBackend(path, { seedPath = null } = {}) {
  if (!path) throw new Error("repository backend 'sqlite'은 path가 필요합니다");
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      saved_at INTEGER NOT NULL,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('snapshotVersion', String(SNAPSHOT_VERSION));
  const loadSnapshot = db.prepare('SELECT json FROM snapshots WHERE id = 1');
  const saveSnapshot = db.prepare(`
    INSERT INTO snapshots (id, version, saved_at, json, updated_at)
    VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      saved_at = excluded.saved_at,
      json = excluded.json,
      updated_at = CURRENT_TIMESTAMP
  `);
  return {
    backend: 'sqlite',
    path,
    seedPath,
    load() {
      const row = loadSnapshot.get();
      if (!row || typeof row.json !== 'string') return loadJsonSeedSnapshot(seedPath);
      try {
        return JSON.parse(row.json);
      } catch {
        return loadJsonSeedSnapshot(seedPath);
      }
    },
    save(snapshot) {
      const version = Number.isInteger(snapshot?.version) ? snapshot.version : SNAPSHOT_VERSION;
      const savedAt = Number.isFinite(snapshot?.savedAt) ? snapshot.savedAt : 0;
      saveSnapshot.run(version, savedAt, JSON.stringify(snapshot));
    },
    close() {
      db.close();
    },
  };
}

function notYetBackend(name, hint) {
  // 후순위 backend: 명확히 안내하고, 실수로 데이터를 잃지 않도록 save에서 실패시킨다.
  const fail = () => {
    throw new Error(`repository backend '${name}'은 아직 미구현입니다. ${hint}`);
  };
  return { backend: name, load: fail, save: fail, close() {} };
}

/**
 * 영속성 저장소를 만든다.
 * @param {{ backend?: 'memory'|'sqlite'|'postgres', path?: string, seedPath?: string|null }} [opts]
 * @returns {{ backend:string, load():object|null, save(snapshot:object):void, close():void }}
 */
export function createRepository({ backend = 'sqlite', path = undefined, seedPath = null } = {}) {
  const resolvedPath = defaultPathForBackend(backend, path);
  switch (backend) {
    case 'memory':
      return memoryBackend();
    case 'json':
      throw new Error("repository backend 'json'은 런타임 영속성으로 금지되었습니다. JSON은 seedPath로만 지정하세요.");
    case 'sqlite':
      return sqliteBackend(resolvedPath, { seedPath });
    case 'postgres':
      return notYetBackend('postgres', "Docker RDB 어댑터는 후순위입니다. 지금은 backend:'sqlite'을 쓰세요.");
    default:
      throw new Error(`알 수 없는 repository backend: ${backend}`);
  }
}

/**
 * 월드 스냅샷을 합성한다(버전/타임스탬프 포함). 포트가 다룰 불투명 객체.
 * @param {{ world?: object, entities?: object, savedAt?: number }} parts
 */
export function composeSnapshot({ world = null, entities = null, savedAt = 0 } = {}) {
  return { version: SNAPSHOT_VERSION, savedAt, world, entities };
}
