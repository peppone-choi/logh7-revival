import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import * as adminModule from '../../src/server/logh7-admin.mjs';
import {
  adminCreate,
  adminDelete,
  adminUnlock,
  adminList,
  adminExists,
  runAdminCommand,
} from '../../src/server/logh7-admin.mjs';
import { createAccountRegistry, loadAccountRecords } from '../../src/server/logh7-account-registry.mjs';
import { createAccountStore } from '../../src/server/logh7-login-session.mjs';
import { buildGin7Credential } from '../../src/server/logh7-login-protocol.mjs';

function freshDb() {
  return freshSqliteDb();
}

function freshLegacyJsonSeed() {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-admin-'));
  return { dir, db: path.join(dir, 'accounts.sqlite'), seed: path.join(dir, 'accounts.seed.json') };
}

function freshSqliteDb() {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-admin-'));
  return { dir, db: path.join(dir, 'accounts.sqlite') };
}

function readStoredRegistry(db) {
  return { accounts: loadAccountRecords(db) };
}

function readStoredRegistryText(db) {
  return `${JSON.stringify(readStoredRegistry(db), null, 2)}\n`;
}

test('adminCreate rejects JSON as a runtime account DB', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-admin-'));
  const db = path.join(dir, 'accounts.json');
  try {
    const result = adminCreate(db, 'inei00', 'dummy');
    assert.equal(result.ok, false);
    assert.match(result.reason, /SQLite/);
    assert.equal(existsSync(db), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adminCreate can provision the SQLite account DB used by server deployments', () => {
  const { dir, db } = freshSqliteDb();
  try {
    const result = adminCreate(db, 'sqlite-admin', 'dummy');
    assert.equal(result.ok, true);
    const rawDb = new DatabaseSync(db);
    try {
      const row = rawDb.prepare('SELECT account, created_at AS createdAt FROM accounts WHERE account = ?')
        .get('sqlite-admin');
      assert.equal(row.account, 'sqlite-admin');
      assert.equal(typeof row.createdAt, 'string');
    } finally {
      rawDb.close();
    }

    assert.equal(adminExists(db, 'sqlite-admin'), true);
    assert.deepEqual(adminList(db).map((record) => record.account), ['sqlite-admin']);
    const store = createAccountStore({
      acceptAnyGin7: false,
      allowRegister: false,
      registry: createAccountRegistry({ persistPath: db }),
    });
    assert.equal(store.authenticate(buildGin7Credential({ account: 'sqlite-admin', password: 'dummy' })).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('out-of-band created account AUTHENTICATES with the same GIN7 blob the real client sends', () => {
  const { dir, db } = freshDb();
  try {
    // 1) Provision the account out of band (as the CLI / signup portal does).
    assert.equal(adminCreate(db, 'inei00', 'dummy').ok, true);

    // 2) Reload the persisted store exactly as the running auth server does (allowRegister:false so it
    //    must VERIFY, not register-on-first-sight).
    const store = createAccountStore({
      acceptAnyGin7: false,
      allowRegister: false,
      registry: createAccountRegistry({ persistPath: db }),
    });

    // 3) Present the byte-exact credential blob the real client would build for the same id/password.
    const credential = buildGin7Credential({ account: 'inei00', password: 'dummy' });
    const auth = store.authenticate(credential);
    assert.equal(auth.ok, true, 'created account must authenticate via the encoder blob');
    assert.equal(auth.account, 'inei00');
    assert.equal(auth.matchedBy, 'password');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a wrong password for an existing account is rejected (hash is password-bound)', () => {
  const { dir, db } = freshDb();
  try {
    assert.equal(adminCreate(db, 'inei00', 'dummy').ok, true);
    const store = createAccountStore({
      acceptAnyGin7: false,
      allowRegister: false,
      registry: createAccountRegistry({ persistPath: db }),
    });
    const wrong = buildGin7Credential({ account: 'inei00', password: 'WRONG' });
    const auth = store.authenticate(wrong);
    assert.equal(auth.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adminCreate refuses a duplicate account id', () => {
  const { dir, db } = freshDb();
  try {
    assert.equal(adminCreate(db, 'dup', 'pw').ok, true);
    const second = adminCreate(db, 'dup', 'pw');
    assert.equal(second.ok, false);
    assert.match(second.reason, /already exists/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adminDelete removes an account and adminExists tracks presence', () => {
  const { dir, db } = freshDb();
  try {
    adminCreate(db, 'gone', 'pw');
    assert.equal(adminExists(db, 'gone'), true);
    const del = adminDelete(db, 'gone');
    assert.equal(del.ok, true);
    assert.equal(adminExists(db, 'gone'), false);
    assert.equal(adminDelete(db, 'gone').ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adminList returns created account ids', () => {
  const { dir, db } = freshDb();
  try {
    adminCreate(db, 'alpha', 'pw');
    adminCreate(db, 'bravo', 'pw');
    const ids = adminList(db).map((r) => r.account).sort();
    assert.deepEqual(ids, ['alpha', 'bravo']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('strict signup admin list and dump redact account secrets', () => {
  const { dir, db } = freshDb();
  const lines = [];
  const io = { out: (s) => lines.push(s), err: (s) => lines.push(`ERR:${s}`) };
  try {
    // Given: an out-of-band created account in the shared auth registry DB.
    assert.equal(adminCreate(db, 'p001flow', 'FlowPw17').ok, true);
    const storedText = readStoredRegistryText(db);
    const stored = readStoredRegistry(db);
    assert.equal(typeof stored.accounts[0].salt, 'string');
    assert.equal(typeof stored.accounts[0].hash, 'string');
    assert.equal(storedText.includes('FlowPw17'), false);

    // When: operators inspect the registry through list/dump surfaces.
    const listed = adminList(db);
    assert.equal(typeof adminModule.adminDump, 'function');
    const dumped = adminModule.adminDump(db);
    const exitCode = runAdminCommand(['dump', '--account-db', db], io);
    const cliDump = JSON.parse(lines.join('\n'));

    // Then: account metadata is visible, while salts and hashes are explicitly redacted.
    assert.deepEqual(Object.keys(listed[0]).sort(), ['account', 'characterCount', 'characters', 'createdAt']);
    assert.deepEqual(dumped.accounts[0], {
      account: 'p001flow',
      createdAt: stored.accounts[0].createdAt,
      characters: [],
      characterCount: 0,
    });
    assert.equal(exitCode, 0);
    assert.deepEqual(cliDump, dumped);
    assert.equal(JSON.stringify(dumped).includes(stored.accounts[0].hash), false);
    assert.equal(JSON.stringify(dumped).includes(stored.accounts[0].salt), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adminCreate rejects passwords the real client login field cannot submit', () => {
  const { dir, db } = freshDb();
  try {
    const tooLong = adminCreate(db, 'p001flow', 'FlowPw17!');
    assert.deepEqual(tooLong, {
      ok: false,
      reason: 'password must be 1-8 printable ASCII characters without surrounding spaces',
    });

    const nonAscii = adminCreate(db, 'p001flow', '비밀번호');
    assert.deepEqual(nonAscii, {
      ok: false,
      reason: 'password must be 1-8 printable ASCII characters without surrounding spaces',
    });

    const trailingSpace = adminCreate(db, 'p001flow', 'dummy ');
    assert.deepEqual(trailingSpace, {
      ok: false,
      reason: 'password must be 1-8 printable ASCII characters without surrounding spaces',
    });

    const stored = readStoredRegistry(db);
    assert.deepEqual(stored.accounts, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('admin dump redacts secrets and shows account character summaries', () => {
  const { dir, db } = freshDb();
  try {
    assert.equal(adminCreate(db, 'p001flow', 'FlowPw17').ok, true);
    const registry = createAccountRegistry({ persistPath: db });

    const saved = registry.addProfileCharacter('p001flow', {
      characterId: 99,
      name: 'Lee',
      displayName: 'Lee Flow',
      lastname: 'Lee',
      firstname: 'Flow',
      faction: 'empire',
      power: 1,
      blood: 2,
      sex: 1,
      face: 1000005,
      abilities: [90, 80, 70, 60, 95, 88, 92, 70],
      rank: 3,
      spot: 4,
      spotOwner: 1,
      password: 'must-not-persist',
      rawCredentialHex: 'deadbeef',
    });

    const storedText = readStoredRegistryText(db);
    assert.equal(storedText.includes('FlowPw17'), false);
    assert.equal(storedText.includes('must-not-persist'), false);
    assert.equal(storedText.includes('deadbeef'), false);

    const listed = adminList(db);
    const dumped = adminModule.adminDump(db);
    const account = dumped.accounts.find((record) => record.account === 'p001flow');
    assert.ok(account);
    assert.equal('hash' in account, false);
    assert.equal('salt' in account, false);
    assert.equal(account.characterCount, 1);
    assert.deepEqual(listed[0].characters, [{
      characterId: 99,
      name: 'Lee',
      displayName: 'Lee Flow',
      lastname: 'Lee',
      firstname: 'Flow',
      faction: 'empire',
      power: 1,
      rank: 3,
      spot: 4,
      spotOwner: 1,
      createdAt: saved.createdAt,
    }]);
    assert.deepEqual(account.characters, listed[0].characters);
    assert.equal(JSON.stringify(dumped).includes(storedText.match(/"hash": "([^"]+)"/)?.[1] ?? 'missing'), false);
    assert.equal(JSON.stringify(dumped).includes(storedText.match(/"salt": "([^"]+)"/)?.[1] ?? 'missing'), false);
    assert.equal('abilities' in account.characters[0], false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('registry imports legacy JSON profileSummaries as seed and admin dump exposes only character summaries', () => {
  const { dir, db, seed } = freshLegacyJsonSeed();
  const createdAt = '2026-06-17T00:00:00.000Z';
  try {
    writeFileSync(seed, `${JSON.stringify({
      accounts: [{
        account: 'legacy-profile',
        salt: 'salt-secret',
        hash: 'hash-secret',
        createdAt,
        profileSummaries: [{
          characterId: 42,
          name: 'Yang',
          displayName: 'Yang Wen-li',
          lastname: 'Yang',
          firstname: 'Wen-li',
          faction: 'alliance',
          power: 2,
          rank: 4,
          spot: 5,
          spotOwner: 2,
          createdAt,
          password: 'must-not-leak',
          credential: 'credential-secret',
        }],
      }, {
        account: 'legacy-character',
        salt: 'salt-character-secret',
        hash: 'hash-character-secret',
        createdAt,
        characterSummaries: [{
          characterId: 43,
          name: 'Mittermeyer',
          displayName: 'Wolfgang Mittermeyer',
          lastname: 'Mittermeyer',
          firstname: 'Wolfgang',
          faction: 'empire',
          power: 1,
          rank: 5,
          spot: 6,
          spotOwner: 1,
          createdAt,
          rawCredential: 'raw-secret',
          credentialHex: 'credential-hex-secret',
        }],
      }],
    }, null, 2)}\n`);

    const reloaded = createAccountRegistry({ persistPath: db, seedPath: seed });
    assert.deepEqual(reloaded.getProfileCharacters('legacy-profile'), [{
      characterId: 42,
      name: 'Yang',
      displayName: 'Yang Wen-li',
      lastname: 'Yang',
      firstname: 'Wen-li',
      faction: 'alliance',
      power: 2,
      blood: 0,
      sex: 0,
      face: 0,
      abilities: [0, 0, 0, 0, 0, 0, 0, 0],
      rank: 4,
      spot: 5,
      spotOwner: 2,
      createdAt,
    }]);
    assert.deepEqual(reloaded.getProfileCharacters('legacy-character'), [{
      characterId: 43,
      name: 'Mittermeyer',
      displayName: 'Wolfgang Mittermeyer',
      lastname: 'Mittermeyer',
      firstname: 'Wolfgang',
      faction: 'empire',
      power: 1,
      blood: 0,
      sex: 0,
      face: 0,
      abilities: [0, 0, 0, 0, 0, 0, 0, 0],
      rank: 5,
      spot: 6,
      spotOwner: 1,
      createdAt,
    }]);

    const listed = adminList(db);
    const dumped = adminModule.adminDump(db);
    const dumpedJson = JSON.stringify(dumped);
    for (const marker of [
      'salt-secret',
      'hash-secret',
      'must-not-leak',
      'credential-secret',
      'salt-character-secret',
      'hash-character-secret',
      'raw-secret',
      'credential-hex-secret',
    ]) {
      assert.equal(dumpedJson.includes(marker), false);
    }
    const listedProfile = listed.find((record) => record.account === 'legacy-profile');
    const listedCharacter = listed.find((record) => record.account === 'legacy-character');
    const dumpedProfile = dumped.accounts.find((record) => record.account === 'legacy-profile');
    const dumpedCharacter = dumped.accounts.find((record) => record.account === 'legacy-character');
    assert.equal('profileSummaries' in dumpedProfile, false);
    assert.equal('characterSummaries' in dumpedCharacter, false);
    assert.deepEqual(dumpedProfile, {
      account: 'legacy-profile',
      createdAt,
      characters: [{
        characterId: 42,
        name: 'Yang',
        displayName: 'Yang Wen-li',
        lastname: 'Yang',
        firstname: 'Wen-li',
        faction: 'alliance',
        power: 2,
        rank: 4,
        spot: 5,
        spotOwner: 2,
        createdAt,
      }],
      characterCount: 1,
    });
    assert.deepEqual(dumpedCharacter, {
      account: 'legacy-character',
      createdAt,
      characters: [{
        characterId: 43,
        name: 'Mittermeyer',
        displayName: 'Wolfgang Mittermeyer',
        lastname: 'Mittermeyer',
        firstname: 'Wolfgang',
        faction: 'empire',
        power: 1,
        rank: 5,
        spot: 6,
        spotOwner: 1,
        createdAt,
      }],
      characterCount: 1,
    });
    assert.deepEqual(listedProfile.characters, dumpedProfile.characters);
    assert.deepEqual(listedCharacter.characters, dumpedCharacter.characters);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('adminUnlock validates the account exists and is a clean no-op on the persisted file', () => {
  const { dir, db } = freshDb();
  try {
    adminCreate(db, 'locked', 'pw');
    const ok = adminUnlock(db, 'locked');
    assert.equal(ok.ok, true);
    assert.equal(adminUnlock(db, 'missing').ok, false);
    // unlock must not corrupt the stored credential — it still authenticates afterwards.
    const store = createAccountStore({
      acceptAnyGin7: false,
      allowRegister: false,
      registry: createAccountRegistry({ persistPath: db }),
    });
    assert.equal(store.authenticate(buildGin7Credential({ account: 'locked', password: 'pw' })).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runAdminCommand drives create/exists/delete through the dispatcher', () => {
  const { dir, db } = freshDb();
  const lines = [];
  const io = { out: (s) => lines.push(s), err: (s) => lines.push(`ERR:${s}`), stdin: 'pw' };
  try {
    assert.equal(runAdminCommand(['create', 'cli', '--password-stdin', '--account-db', db], io), 0);
    assert.equal(runAdminCommand(['exists', 'cli', '--account-db', db], io), 0);
    assert.equal(runAdminCommand(['exists', 'nope', '--account-db', db], io), 1);
    assert.equal(runAdminCommand(['delete', 'cli', '--account-db', db], io), 0);
    assert.equal(runAdminCommand(['exists', 'cli', '--account-db', db], io), 1);
    assert.equal(runAdminCommand([], io), 1); // missing subcommand
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runAdminCommand rejects positional create passwords to avoid argv exposure', () => {
  const { dir, db } = freshDb();
  const lines = [];
  const io = { out: (s) => lines.push(s), err: (s) => lines.push(`ERR:${s}`) };
  try {
    assert.equal(runAdminCommand(['create', 'argv-user', 'pw', '--account-db', db], io), 1);
    assert.equal(runAdminCommand(['exists', 'argv-user', '--account-db', db], io), 1);
    assert.equal(lines.some((line) => line.includes('password must be provided via --password-stdin')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runAdminCommand creates accounts from stdin without password argv exposure', () => {
  const { dir, db } = freshDb();
  const lines = [];
  const io = { out: (s) => lines.push(s), err: (s) => lines.push(`ERR:${s}`), stdin: 'pw' };
  try {
    const argv = ['create', 'stdin-user', '--password-stdin', '--account-db', db];

    assert.equal(argv.includes('pw'), false);
    assert.equal(runAdminCommand(argv, io), 0);
    assert.equal(runAdminCommand(['exists', 'stdin-user', '--account-db', db], io), 0);
    assert.equal(lines.some((line) => line.includes('pw')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runAdminCommand rejects passwords with accidental surrounding spaces', () => {
  const { dir, db } = freshDb();
  const lines = [];
  const io = { out: (s) => lines.push(s), err: (s) => lines.push(`ERR:${s}`), stdin: 'dummy ' };
  try {
    const argv = ['create', 'space-user', '--password-stdin', '--account-db', db];

    assert.equal(runAdminCommand(argv, io), 1);
    assert.equal(runAdminCommand(['exists', 'space-user', '--account-db', db], io), 1);
    assert.equal(
      lines.some((line) => line.includes('password must be 1-8 printable ASCII characters without surrounding spaces')),
      true,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
