// Persistent account registry for real signup (회원가입).
//
// The legacy createAccountStore is an accept-any-GIN7 skeleton: any well-formed credential passes and
// the password is never checked. This module adds an out-of-band signup registry:
//   * register(account, secret) — bind an account label to a salted scrypt hash of its credential blob,
//     refusing duplicates (username already taken) and enforcing a global account cap,
//   * verify(account, secret)   — timing-safe check with a per-account failed-attempt lockout,
//   * dummyVerify(secret)       — equal-cost no-op hash for the missing-account path (anti-enumeration),
//   * SQLite persistence so accounts survive restarts.
//
// Legacy JSON is accepted only as a seed/import file. It is never a runtime account database.
//
// The "secret" is the raw GIN7 credential blob bytes (innerPayload). We deliberately hash the whole blob
// rather than the decoded password: the GIN7 password field uses an asymmetric/partly-LE encoding
// (parseGin7Credential keeps only the account label), but the blob is deterministic per (account,
// password), which is exactly what the existing exact-match auth path already relies on. Hashing it is
// encoding-agnostic and upgrades the verbatim-hex comparison to a salted, non-reversible hash.
//
// THREAT MODEL: this is a hobby revival of a defunct online game. The default --account-db path is
// strict: accounts must be created out of band by admin/signup tooling before the client logs in.
// A Trust-On-First-Use compatibility switch can still be enabled explicitly for old local captures.
// The hardening here (lockout, account cap, anti-enumeration) is defense-in-depth, not a substitute
// for keeping the registry file private.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  cloneAccountCharacterProfile,
  normalizeAccountCharacterProfile,
  profileCharacterId,
} from './logh7-account-profile.mjs';

const SALT_BYTES = 16;
const HASH_BYTES = 32;
const SCRYPT_COST = 16384; // N (CPU/memory cost). Standard interactive parameter.
const DUMMY_SALT_HEX = '00'.repeat(SALT_BYTES); // fixed salt for equal-cost dummy hashing

export const ACCOUNT_LABEL_MAX = 32;

/** Reject empty, over-long, or non-printable account labels (also blocks JSON/Map key abuse). */
export function isValidAccountLabel(label) {
  return typeof label === 'string' && label.length > 0 && label.length <= ACCOUNT_LABEL_MAX &&
    /^[\x20-\x7e]+$/.test(label) && label !== '__proto__';
}

function hashSecret(secret, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return scryptSync(secret, salt, HASH_BYTES, { N: SCRYPT_COST }).toString('hex');
}

function toBuffer(secret) {
  if (Buffer.isBuffer(secret)) return secret;
  if (typeof secret === 'string') return Buffer.from(secret, 'utf8');
  throw new TypeError('account secret must be a Buffer or string');
}

export function isAccountSqlitePath(persistPath) {
  return /\.(sqlite|sqlite3|db)$/iu.test(persistPath);
}

function requireAccountSqlitePath(persistPath) {
  if (!isAccountSqlitePath(String(persistPath ?? ''))) {
    throw new Error('account registry persistence must use SQLite (*.sqlite, *.sqlite3, *.db); JSON is seed-only');
  }
}

function openAccountSqlite(persistPath) {
  requireAccountSqlitePath(persistPath);
  const resolved = path.resolve(persistPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec(`
    PRAGMA journal_mode = DELETE;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS accounts (
      account TEXT PRIMARY KEY,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL,
      created_at TEXT,
      characters_json TEXT NOT NULL DEFAULT '[]'
    );
  `);
  return db;
}

function parseCharactersJson(raw) {
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

export function loadAccountSeedRecords(seedPath) {
  if (!seedPath) return [];
  try {
    const raw = readFileSync(seedPath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data?.accounts) ? data.accounts : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

function loadSqliteAccountRecords(persistPath) {
  const db = openAccountSqlite(persistPath);
  try {
    return db.prepare(`
      SELECT account, salt, hash, created_at AS createdAt, characters_json AS charactersJson
      FROM accounts
      ORDER BY account
    `).all().map((row) => ({
      account: row.account,
      salt: row.salt,
      hash: row.hash,
      createdAt: row.createdAt ?? null,
      characters: parseCharactersJson(row.charactersJson),
    }));
  } finally {
    db.close();
  }
}

export function loadAccountRecords(persistPath) {
  requireAccountSqlitePath(persistPath);
  return loadSqliteAccountRecords(persistPath);
}

function persistSqliteAccountRecords(persistPath, records) {
  const db = openAccountSqlite(persistPath);
  let inTransaction = false;
  try {
    const insert = db.prepare(`
      INSERT INTO accounts (account, salt, hash, created_at, characters_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    db.exec('BEGIN IMMEDIATE');
    inTransaction = true;
    db.exec('DELETE FROM accounts');
    for (const record of records) {
      insert.run(
        record.account,
        record.salt,
        record.hash,
        record.createdAt ?? null,
        JSON.stringify(profileRecords(record)),
      );
    }
    db.exec('COMMIT');
    inTransaction = false;
  } catch (error) {
    if (inTransaction) {
      db.exec('ROLLBACK');
    }
    throw error;
  } finally {
    db.close();
  }
}

export function persistAccountRecords(persistPath, records) {
  requireAccountSqlitePath(persistPath);
  persistSqliteAccountRecords(persistPath, records);
}

function profileRecords(record) {
  const arrays = [record?.characters, record?.profileSummaries, record?.characterSummaries]
    .filter(Array.isArray);
  return arrays.find((profiles) => profiles.length > 0) ?? arrays[0] ?? [];
}

function normalizeProfileRecord(character) {
  try {
    return normalizeAccountCharacterProfile(character, { createdAt: character?.createdAt });
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   persistPath?: string|null,
 *   seedPath?: string|null,     // legacy JSON import, read once before in-memory accounts
 *   accounts?: Array<{account:string, salt:string, hash:string, createdAt?:string, characters?:object[]}>,
 *   maxAccounts?: number,        // global registration cap (DoS guard)
 *   maxFailedAttempts?: number,  // consecutive bad verifies before lockout
 *   lockoutMs?: number,          // lockout window
 *   now?: () => number,          // injectable clock (tests)
 * }} [options]
 */
export function createAccountRegistry({
  persistPath = null,
  seedPath = null,
  accounts = [],
  maxAccounts = 50000,
  maxFailedAttempts = 10,
  lockoutMs = 60000,
  now = () => Date.now(),
} = {}) {
  /** @type {Map<string, {account:string, salt:string, hash:string, createdAt:string|null, characters:Array<object>}>} */
  const byAccount = new Map();
  /** @type {Map<string, {fails:number, until:number}>} per-account failed-attempt state */
  const attempts = new Map();
  const seedRecords = loadAccountSeedRecords(seedPath);
  const persistedRecords = persistPath ? loadAccountRecords(persistPath) : [];
  const seed = [
    ...seedRecords,
    ...persistedRecords,
    ...accounts,
  ];
  for (const record of seed) {
    if (record && typeof record.account === 'string') {
      byAccount.set(record.account, {
        account: record.account,
        salt: record.salt,
        hash: record.hash,
        createdAt: record.createdAt ?? null,
        characters: profileRecords(record).map(normalizeProfileRecord).filter(Boolean),
      });
    }
  }
  if (persistPath && seedRecords.length > 0) {
    persistAccountRecords(persistPath, [...byAccount.values()]);
  }

  function persist() {
    if (!persistPath) return;
    persistAccountRecords(persistPath, [...byAccount.values()]);
  }

  return {
    get size() {
      return byAccount.size;
    },
    has(account) {
      return byAccount.has(account);
    },
    getAccount(account) {
      const r = byAccount.get(account);
      return r ? { account: r.account, createdAt: r.createdAt } : null;
    },
    /**
     * Register a new account. Throws ACCOUNT_EXISTS (dupe), ACCOUNT_LIMIT (cap), or on invalid label.
     * @param {string} account
     * @param {Buffer|string} secret credential blob (or string secret)
     * @param {{ createdAt?: string }} [meta]
     */
    register(account, secret, { createdAt = null } = {}) {
      if (!isValidAccountLabel(account)) {
        throw new Error(`invalid account label: ${JSON.stringify(account)}`);
      }
      if (byAccount.has(account)) {
        const error = new Error(`account already exists: ${account}`);
        error.code = 'ACCOUNT_EXISTS';
        throw error;
      }
      if (byAccount.size >= maxAccounts) {
        const error = new Error(`account limit reached (${maxAccounts})`);
        error.code = 'ACCOUNT_LIMIT';
        throw error;
      }
      const saltHex = randomBytes(SALT_BYTES).toString('hex');
      const hash = hashSecret(toBuffer(secret), saltHex);
      const record = { account, salt: saltHex, hash, createdAt, characters: [] };
      byAccount.set(account, record);
      persist();
      return { account, createdAt };
    },
    /**
     * Verify a presented credential against the stored hash (timing-safe), with a per-account
     * consecutive-failure lockout.
     * @returns {{ ok: true } | { ok: false, reason: 'no-such-account'|'bad-credentials'|'rate-limited' }}
     */
    verify(account, secret) {
      const record = byAccount.get(account);
      if (!record) {
        return { ok: false, reason: 'no-such-account' };
      }
      const state = attempts.get(account);
      if (state && state.until > now()) {
        return { ok: false, reason: 'rate-limited' };
      }
      const candidate = Buffer.from(hashSecret(toBuffer(secret), record.salt), 'hex');
      const stored = Buffer.from(record.hash, 'hex');
      if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) {
        const fails = (state?.until > now() ? state.fails : (state?.fails ?? 0)) + 1;
        attempts.set(account, { fails, until: fails >= maxFailedAttempts ? now() + lockoutMs : 0 });
        return { ok: false, reason: 'bad-credentials' };
      }
      attempts.delete(account); // success resets the counter
      return { ok: true };
    },
    /** Equal-cost throwaway hash so a missing/invalid account spends the same CPU as a real verify. */
    dummyVerify(secret) {
      hashSecret(toBuffer(secret), DUMMY_SALT_HEX);
      return { ok: false, reason: 'no-such-account' };
    },
    /**
     * Return sanitized generated-character profiles for an account.
     * @param {string} account
     * @returns {Array<ReturnType<typeof normalizeAccountCharacterProfile>>}
     */
    getProfileCharacters(account) {
      const record = byAccount.get(account);
      return record ? record.characters.map(cloneAccountCharacterProfile) : [];
    },
    /**
     * Upsert one generated-character profile under an existing account.
     * @param {string} account
     * @param {object} character
     * @returns {ReturnType<typeof normalizeAccountCharacterProfile>}
     */
    addProfileCharacter(account, character) {
      const record = byAccount.get(account);
      if (!record) {
        const error = new Error(`no such account: ${account}`);
        error.code = 'NO_SUCH_ACCOUNT';
        throw error;
      }
      const existing = record.characters.find((entry) => entry.characterId === profileCharacterId(character));
      const profile = normalizeAccountCharacterProfile(character, {
        createdAt: character?.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
      });
      record.characters = [
        ...record.characters.filter((entry) => entry.characterId !== profile.characterId),
        profile,
      ];
      persist();
      return cloneAccountCharacterProfile(profile);
    },
    /**
     * 계정 로스터에서 캐릭터 프로필 한 개를 영속적으로 제거한다(로비 캐릭 삭제 0x2008).
     * 제거에 성공하면 true, 대상이 없으면 false. 영속(persist)은 실제로 무언가 지웠을 때만 수행한다.
     * @param {string} account
     * @param {number} characterId
     * @returns {boolean}
     */
    removeProfileCharacter(account, characterId) {
      const record = byAccount.get(account);
      const targetId = profileCharacterId({ characterId });
      if (!record || targetId <= 0) return false;
      const next = record.characters.filter((entry) => entry.characterId !== targetId);
      if (next.length === record.characters.length) return false; // 삭제할 대상 없음
      record.characters = next;
      persist();
      return true;
    },
  };
}
