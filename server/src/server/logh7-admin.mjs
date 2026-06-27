// CLI admin operations for the persistent account registry (회원가입 운영 도구).
//
// These commands operate on the SAME persisted account store the running auth server uses
// (createAccountRegistry({ persistPath })): SQLite only. Legacy JSON may be imported as seed data by
// the registry layer, but admin commands never use JSON as a live account DB.
// `create` REUSES createAccountRegistry.register so the scrypt hashing is never reimplemented — the
// account id + password are turned into the byte-exact GIN7 credential blob (buildGin7Credential)
// and that blob is what gets hashed, so the real client logging in with the same id/password
// presents the identical blob and authenticates.
//
// The running server loads the store on startup and re-persists on each registration; a CLI write
// while the server runs is picked up the next time the server restarts (the in-memory registry is
// the live authority). For provisioning before launch (the intended external-signup workflow) the
// CLI and server simply share the file.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createAccountRegistry,
  isAccountSqlitePath,
  loadAccountRecords,
  persistAccountRecords,
} from './logh7-account-registry.mjs';
import { summarizeAccountCharacterProfile } from './logh7-account-profile.mjs';
import { buildGin7Credential } from './logh7-gin7-credential.mjs';

const CLIENT_PASSWORD_MAX = 8;
const SECRET_FIELDS = new Set([
  'credential',
  'credentialHex',
  'hash',
  'password',
  'passwordHash',
  'rawCredential',
  'rawCredentialHex',
  'salt',
  'secret',
]);

function accountDbPathError(dbPath) {
  return isAccountSqlitePath(String(dbPath ?? ''))
    ? null
    : 'account DB must be SQLite (*.sqlite, *.sqlite3, *.db); JSON is seed-only';
}

function assertAccountDbPath(dbPath) {
  const reason = accountDbPathError(dbPath);
  if (reason !== null) throw new Error(reason);
}

export function isClientLoginPassword(password) {
  return typeof password === 'string' &&
    password.length > 0 &&
    password.length <= CLIENT_PASSWORD_MAX &&
    password.trim() === password &&
    /^[\x20-\x7e]+$/.test(password);
}

function readStore(dbPath) {
  assertAccountDbPath(dbPath);
  return { accounts: loadAccountRecords(dbPath) };
}

function writeStore(dbPath, store) {
  assertAccountDbPath(dbPath);
  persistAccountRecords(dbPath, store.accounts);
}

/**
 * Create an account out-of-band so the real client can later log in with the same id/password.
 * Reuses createAccountRegistry.register (scrypt) on the byte-exact GIN7 credential blob.
 * @returns {{ ok: true, account: string } | { ok: false, reason: string }}
 */
export function adminCreate(dbPath, account, password) {
  const pathReason = accountDbPathError(dbPath);
  if (pathReason !== null) {
    return { ok: false, reason: pathReason };
  }
  if (typeof account !== 'string' || account.length === 0) {
    return { ok: false, reason: 'account id is required' };
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, reason: 'password is required' };
  }
  if (!isClientLoginPassword(password)) {
    return { ok: false, reason: 'password must be 1-8 printable ASCII characters without surrounding spaces' };
  }
  const registry = createAccountRegistry({ persistPath: path.resolve(dbPath) });
  if (registry.has(account)) {
    return { ok: false, reason: `account already exists: ${account}` };
  }
  const credential = buildGin7Credential({ account, password });
  try {
    registry.register(account, credential, { createdAt: new Date().toISOString() });
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  return { ok: true, account };
}

/**
 * Delete an account from the persisted store.
 * @returns {{ ok: true, account: string } | { ok: false, reason: string }}
 */
export function adminDelete(dbPath, account) {
  const pathReason = accountDbPathError(dbPath);
  if (pathReason !== null) {
    return { ok: false, reason: pathReason };
  }
  const store = readStore(dbPath);
  const before = store.accounts.length;
  store.accounts = store.accounts.filter((record) => record?.account !== account);
  if (store.accounts.length === before) {
    return { ok: false, reason: `no such account: ${account}` };
  }
  writeStore(dbPath, store);
  return { ok: true, account };
}

/**
 * Clear lockout state for an account. The lockout (consecutive-failure window) is held in-memory by
 * the running registry and is NOT part of the persisted SQLite store, so on the file it is a no-op: any live
 * lockout self-clears after the registry's lockoutMs window. This command validates the account
 * exists and strips any stray lockout field a future format might add.
 * @returns {{ ok: true, account: string, note: string } | { ok: false, reason: string }}
 */
export function adminUnlock(dbPath, account) {
  const pathReason = accountDbPathError(dbPath);
  if (pathReason !== null) {
    return { ok: false, reason: pathReason };
  }
  const store = readStore(dbPath);
  const record = store.accounts.find((entry) => entry?.account === account);
  if (!record) {
    return { ok: false, reason: `no such account: ${account}` };
  }
  let changed = false;
  for (const key of ['lockoutUntil', 'failedAttempts']) {
    if (key in record) {
      delete record[key];
      changed = true;
    }
  }
  if (changed) {
    writeStore(dbPath, store);
  }
  return {
    ok: true,
    account,
    note: 'lockout is in-memory only; a live server clears it after lockoutMs (default 60s) or on restart',
  };
}

/** List all account ids (with createdAt) in the persisted store. */
export function adminList(dbPath) {
  const store = readStore(dbPath);
  const listRecord = (record) => {
    const characters = safeCharacterSummaries(record);
    return {
      account: record?.account ?? '',
      createdAt: record?.createdAt ?? null,
      characterCount: characters.length,
      characters,
    };
  };
  return store.accounts.map(listRecord);
}

function accountProfileRecords(record) {
  const arrays = [record?.characters, record?.profileSummaries, record?.characterSummaries]
    .filter(Array.isArray);
  return arrays.find((profiles) => profiles.length > 0) ?? arrays[0] ?? [];
}

function safeCharacterSummaries(record) {
  return accountProfileRecords(record)
    .map(summarizeAccountCharacterProfile)
    .filter((character) => character.characterId > 0);
}

function redactAccountRecord(record) {
  const redacted = {};
  for (const [key, value] of Object.entries(record ?? {})) {
    if (key === 'characters' || key === 'profileSummaries' || key === 'characterSummaries') {
      continue;
    } else if (SECRET_FIELDS.has(key)) {
      continue;
    } else {
      redacted[key] = value;
    }
  }
  redacted.characters = safeCharacterSummaries(record);
  redacted.characterCount = redacted.characters.length;
  return redacted;
}

/** Dump the persisted store with secret-bearing fields explicitly redacted. */
export function adminDump(dbPath) {
  const store = readStore(dbPath);
  return { accounts: store.accounts.map(redactAccountRecord) };
}

/** Whether an account exists in the persisted store. */
export function adminExists(dbPath, account) {
  return readStore(dbPath).accounts.some((record) => record?.account === account);
}

/**
 * Dispatch an admin subcommand. Returns a process exit code; prints results to the given streams.
 * @param {string[]} argv  the args AFTER `admin` (e.g. ['create', 'id', '--password-stdin', '--account-db', 'x.json'])
 * @param {{ out?: (s: string) => void, err?: (s: string) => void, stdin?: string }} [io]
 */
export function runAdminCommand(argv, { out = console.log, err = console.error, stdin = undefined } = {}) {
  const rest = [];
  let dbPath = process.env.LOGH_ACCOUNT_DB ?? null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--account-db') {
      dbPath = argv[i + 1];
      i += 1;
    } else {
      rest.push(argv[i]);
    }
  }
  const [sub, ...args] = rest;
  if (!sub) {
    err('usage: logh7-server.mjs admin <create|delete|unlock|list|dump|exists> [args] --account-db <path>');
    return 1;
  }
  if (!dbPath) {
    err('admin commands require --account-db <path> (or LOGH_ACCOUNT_DB)');
    return 1;
  }
  const pathReason = accountDbPathError(dbPath);
  if (pathReason !== null) {
    err(`admin commands require SQLite --account-db: ${pathReason}`);
    return 1;
  }

  if (sub === 'create') {
    const createArgs = [];
    let passwordStdin = false;
    for (const arg of args) {
      if (arg === '--password-stdin') {
        passwordStdin = true;
      } else {
        createArgs.push(arg);
      }
    }
    const [account] = createArgs;
    if (!passwordStdin || createArgs.length !== 1) {
      err('create failed: password must be provided via --password-stdin');
      return 1;
    }
    const password = readPasswordFromStdin(stdin);
    const result = adminCreate(dbPath, account, password);
    if (!result.ok) {
      err(`create failed: ${result.reason}`);
      return 1;
    }
    out(`created account: ${result.account}`);
    return 0;
  }
  if (sub === 'delete') {
    const [account] = args;
    const result = adminDelete(dbPath, account);
    if (!result.ok) {
      err(`delete failed: ${result.reason}`);
      return 1;
    }
    out(`deleted account: ${result.account}`);
    return 0;
  }
  if (sub === 'unlock') {
    const [account] = args;
    const result = adminUnlock(dbPath, account);
    if (!result.ok) {
      err(`unlock failed: ${result.reason}`);
      return 1;
    }
    out(`unlocked account: ${result.account} (${result.note})`);
    return 0;
  }
  if (sub === 'list') {
    const accounts = adminList(dbPath);
    if (accounts.length === 0) {
      out('(no accounts)');
      return 0;
    }
    for (const record of accounts) {
      const summaries = record.characters.map((character) => `#${character.characterId} ${character.displayName || character.name}`.trim());
      out(`${record.account}\t${record.createdAt ?? ''}\tcharacters=${record.characterCount}${summaries.length > 0 ? `\t${summaries.join(', ')}` : ''}`);
    }
    return 0;
  }
  if (sub === 'dump') {
    out(JSON.stringify(adminDump(dbPath), null, 2));
    return 0;
  }
  if (sub === 'exists') {
    const [account] = args;
    const present = adminExists(dbPath, account);
    out(present ? `exists: ${account}` : `missing: ${account}`);
    return present ? 0 : 1;
  }
  err(`unknown admin command: ${sub}`);
  return 1;
}

function readPasswordFromStdin(stdin) {
  const raw = stdin === undefined ? readFileSync(0, 'utf8') : stdin;
  return raw.replace(/\r?\n$/, '');
}
