import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  SESSION_BEGIN_DAY_MAX_UNITS,
  SESSION_NAME_MAX_UNITS,
  SESSION_RECORD_PARSER_CAP,
  SESSION_SUPER_MAN_MAX_UNITS,
} from './codec/scenario-session.mjs';

export const DEFAULT_SESSION_SQLITE_PATH = 'logh7-runtime/state/lobby-sessions.sqlite';

export const DEFAULT_SESSION_RECORDS = Object.freeze([
  {
    sessionId: 1,
    sessionName: '이제르론 서버',
    status: 1,
    beginDay: 'UC 796',
    powers: [{ id: 1, superMan: '라인하르트' }, { id: 2, superMan: '양 웬리' }],
  },
]);

function ucs2Len(value) {
  return [...String(value ?? '')].length;
}

export function isSessionSqlitePath(persistPath) {
  return /\.(sqlite|sqlite3|db)$/iu.test(String(persistPath ?? ''));
}

function requireSessionSqlitePath(persistPath) {
  if (!isSessionSqlitePath(persistPath)) {
    throw new Error('session registry persistence must use SQLite (*.sqlite, *.sqlite3, *.db)');
  }
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizePowers(powers) {
  const source = Array.isArray(powers) ? powers : [];
  const normalized = source.slice(0, 2).map((power, index) => {
    const item = power && typeof power === 'object' ? power : {};
    const superMan = String(item.superMan ?? item.superman ?? item.leader ?? '');
    if (ucs2Len(superMan) > SESSION_SUPER_MAN_MAX_UNITS) {
      throw new Error(`session power leader is too long (max ${SESSION_SUPER_MAN_MAX_UNITS})`);
    }
    return {
      id: clampInt(item.id, index + 1, 0, 0xff),
      superMan,
      d0: clampInt(item.d0, 0, 0, 0xffffffff),
      d1: clampInt(item.d1, 0, 0, 0xffffffff),
      d2: clampInt(item.d2, 0, 0, 0xffffffff),
    };
  });
  while (normalized.length < 2) {
    normalized.push({ id: normalized.length + 1, superMan: '', d0: 0, d1: 0, d2: 0 });
  }
  return normalized;
}

function normalizeWorldEndpoint(world) {
  const item = world && typeof world === 'object' ? world : {};
  const out = {};
  if (typeof item.ip === 'string' && item.ip.length > 0) out.ip = item.ip;
  if (Number.isInteger(Number(item.port))) out.port = Number(item.port);
  if (item.token !== undefined && item.token !== null && Number.isInteger(Number(item.token))) out.token = Number(item.token);
  return out;
}

export function normalizeSessionRecord(session, index = 0) {
  const item = session && typeof session === 'object' ? session : {};
  const sessionId = clampInt(item.sessionId ?? item.id, index + 1, 1, 0xffff);
  const sessionName = String(item.sessionName ?? item.name ?? `Session ${sessionId}`);
  if (ucs2Len(sessionName) > SESSION_NAME_MAX_UNITS) {
    throw new Error(`session name is too long (max ${SESSION_NAME_MAX_UNITS})`);
  }
  const beginDay = String(item.beginDay ?? item.begin_day ?? item.description ?? 'UC 796');
  if (ucs2Len(beginDay) > SESSION_BEGIN_DAY_MAX_UNITS) {
    throw new Error(`session beginDay is too long (max ${SESSION_BEGIN_DAY_MAX_UNITS})`);
  }
  return {
    sessionId,
    sessionName,
    status: clampInt(item.status, 1, 0, 0xff),
    beginDay,
    term: clampInt(item.term, 0, 0, 0xffffffff),
    ending: clampInt(item.ending, 0, 0, 1),
    powers: normalizePowers(item.powers),
    world: normalizeWorldEndpoint(item.world),
  };
}

function serializeSession(record) {
  return {
    sessionId: record.sessionId,
    sessionName: record.sessionName,
    status: record.status,
    beginDay: record.beginDay,
    term: record.term,
    ending: record.ending,
    powers: record.powers.map((power) => ({ ...power })),
    world: { ...record.world },
  };
}

function openSessionSqlite(persistPath) {
  requireSessionSqlitePath(persistPath);
  const resolved = path.resolve(persistPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS lobby_sessions (
      session_id INTEGER PRIMARY KEY,
      session_name TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 1,
      begin_day TEXT NOT NULL DEFAULT 'UC 796',
      term INTEGER NOT NULL DEFAULT 0,
      ending INTEGER NOT NULL DEFAULT 0,
      powers_json TEXT NOT NULL DEFAULT '[]',
      world_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT,
      updated_at TEXT
    );
  `);
  return db;
}

function parseJsonObject(raw, fallback) {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function loadSessionRecords(persistPath) {
  const db = openSessionSqlite(persistPath);
  try {
    return db.prepare(`
      SELECT session_id AS sessionId, session_name AS sessionName, status, begin_day AS beginDay,
             term, ending, powers_json AS powersJson, world_json AS worldJson
      FROM lobby_sessions
      ORDER BY session_id
    `).all().map((row, index) => normalizeSessionRecord({
      sessionId: row.sessionId,
      sessionName: row.sessionName,
      status: row.status,
      beginDay: row.beginDay,
      term: row.term,
      ending: row.ending,
      powers: parseJsonObject(row.powersJson, []),
      world: parseJsonObject(row.worldJson, {}),
    }, index));
  } finally {
    db.close();
  }
}

export function persistSessionRecords(persistPath, records) {
  const db = openSessionSqlite(persistPath);
  let inTransaction = false;
  try {
    const insert = db.prepare(`
      INSERT INTO lobby_sessions (
        session_id, session_name, status, begin_day, term, ending, powers_json, world_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM lobby_sessions WHERE session_id = ?), CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
    `);
    db.exec('BEGIN IMMEDIATE');
    inTransaction = true;
    db.exec('DELETE FROM lobby_sessions');
    for (const record of records) {
      insert.run(
        record.sessionId,
        record.sessionName,
        record.status,
        record.beginDay,
        record.term,
        record.ending,
        JSON.stringify(record.powers),
        JSON.stringify(record.world),
        record.sessionId,
      );
    }
    db.exec('COMMIT');
    inTransaction = false;
  } catch (error) {
    if (inTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}

export function createSessionRegistry({
  persistPath = null,
  sessions = DEFAULT_SESSION_RECORDS,
} = {}) {
  const persisted = persistPath ? loadSessionRecords(persistPath) : [];
  const source = persisted.length > 0 ? persisted : sessions;
  const byId = new Map();
  for (const [index, record] of source.entries()) {
    const normalized = normalizeSessionRecord(record, index);
    byId.set(normalized.sessionId, normalized);
  }
  if (byId.size > SESSION_RECORD_PARSER_CAP) {
    throw new Error(`session catalog exceeds parser cap ${SESSION_RECORD_PARSER_CAP}`);
  }

  function persist() {
    if (!persistPath) return;
    persistSessionRecords(persistPath, [...byId.values()].sort((a, b) => a.sessionId - b.sessionId));
  }

  if (persistPath && persisted.length === 0) persist();

  return {
    get persistPath() {
      return persistPath;
    },
    listSessions() {
      return [...byId.values()]
        .sort((a, b) => a.sessionId - b.sessionId)
        .map(serializeSession);
    },
    getSession(sessionId) {
      const record = byId.get(Number(sessionId));
      return record ? serializeSession(record) : null;
    },
    upsertSession(record) {
      const normalized = normalizeSessionRecord(record, byId.size);
      const existed = byId.has(normalized.sessionId);
      byId.set(normalized.sessionId, normalized);
      if (byId.size > SESSION_RECORD_PARSER_CAP) {
        byId.delete(normalized.sessionId);
        throw new Error(`session catalog exceeds parser cap ${SESSION_RECORD_PARSER_CAP}`);
      }
      persist();
      return { ...serializeSession(normalized), existed };
    },
    deleteSession(sessionId) {
      const id = Number(sessionId);
      const removed = byId.delete(id);
      if (removed) persist();
      return removed;
    },
    setStatus(sessionId, status) {
      const id = Number(sessionId);
      const current = byId.get(id);
      if (!current) return null;
      const next = { ...current, status: clampInt(status, current.status, 0, 0xff) };
      byId.set(id, next);
      persist();
      return serializeSession(next);
    },
  };
}
