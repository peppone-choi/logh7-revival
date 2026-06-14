// Persistent account registry for real signup (회원가입).
//
// The legacy createAccountStore is an accept-any-GIN7 skeleton: any well-formed credential passes and
// the password is never checked. This module adds genuine registration:
//   * register(account, secret) — bind an account label to a salted scrypt hash of its credential blob,
//     refusing duplicates (username already taken) and enforcing a global account cap,
//   * verify(account, secret)   — timing-safe check with a per-account failed-attempt lockout,
//   * dummyVerify(secret)       — equal-cost no-op hash for the missing-account path (anti-enumeration),
//   * optional JSON-file persistence (0600) so accounts survive restarts.
//
// The "secret" is the raw GIN7 credential blob bytes (innerPayload). We deliberately hash the whole blob
// rather than the decoded password: the GIN7 password field uses an asymmetric/partly-LE encoding
// (parseGin7Credential keeps only the account label), but the blob is deterministic per (account,
// password), which is exactly what the existing exact-match auth path already relies on. Hashing it is
// encoding-agnostic and upgrades the verbatim-hex comparison to a salted, non-reversible hash.
//
// THREAT MODEL: this is a hobby revival of a defunct online game. Registration is Trust-On-First-Use
// (the client has no separate signup opcode — first GIN7 login binds the label), so --account-db mode
// is only safe on a trusted LAN. The hardening here (lockout, account cap, anti-enumeration) is
// defense-in-depth, not a substitute for an out-of-band signup channel.

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

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

function loadPersisted(persistPath) {
  try {
    const raw = readFileSync(persistPath, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data?.accounts) ? data.accounts : [];
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * @param {{
 *   persistPath?: string|null,
 *   accounts?: Array<{account:string, salt:string, hash:string, createdAt?:string}>,
 *   maxAccounts?: number,        // global registration cap (DoS guard)
 *   maxFailedAttempts?: number,  // consecutive bad verifies before lockout
 *   lockoutMs?: number,          // lockout window
 *   now?: () => number,          // injectable clock (tests)
 * }} [options]
 */
export function createAccountRegistry({
  persistPath = null,
  accounts = [],
  maxAccounts = 50000,
  maxFailedAttempts = 10,
  lockoutMs = 60000,
  now = () => Date.now(),
} = {}) {
  /** @type {Map<string, {account:string, salt:string, hash:string, createdAt:string|null}>} */
  const byAccount = new Map();
  /** @type {Map<string, {fails:number, until:number}>} per-account failed-attempt state */
  const attempts = new Map();
  const seed = persistPath ? [...loadPersisted(persistPath), ...accounts] : accounts;
  for (const record of seed) {
    if (record && typeof record.account === 'string') {
      byAccount.set(record.account, {
        account: record.account,
        salt: record.salt,
        hash: record.hash,
        createdAt: record.createdAt ?? null,
      });
    }
  }

  function persist() {
    if (!persistPath) return;
    mkdirSync(path.dirname(path.resolve(persistPath)), { recursive: true });
    const tmp = `${persistPath}.tmp`;
    // mode 0600: credential hashes are salted but should not be world-readable.
    writeFileSync(tmp, `${JSON.stringify({ accounts: [...byAccount.values()] }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, persistPath); // atomic replace so a crash mid-write can't corrupt the store
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
      const record = { account, salt: saltHex, hash, createdAt };
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
  };
}
