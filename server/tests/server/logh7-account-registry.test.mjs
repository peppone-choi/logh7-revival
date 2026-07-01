import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync, existsSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  createAccountRegistry,
  isValidAccountLabel,
  loadAccountRecords,
} from '../../src/server/logh7-account-registry.mjs';
import { createAccountStore } from '../../src/server/logh7-login-session.mjs';

// A valid GIN7 login credential blob (account 'inei00', password 'dummy').
const REAL_LOGIN_INNER_HEX =
  '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000';
const blob = () => Buffer.from(REAL_LOGIN_INNER_HEX, 'hex');
// Same shape, different password bytes (flip a byte in the password region) = wrong credential.
function wrongBlob() {
  const b = blob();
  b[b.length - 4] ^= 0xff; // mutate a password-field byte
  return b;
}

let tmpCounter = 0;
function tmpDb() {
  tmpCounter += 1;
  return join(tmpdir(), `logh7-acct-${process.pid}-${tmpCounter}.sqlite`);
}

function tmpSqliteDb() {
  tmpCounter += 1;
  return join(tmpdir(), `logh7-acct-${process.pid}-${tmpCounter}.sqlite`);
}

test('register binds an account and verify accepts the same secret', () => {
  const reg = createAccountRegistry();
  assert.equal(reg.size, 0);
  reg.register('alice', blob());
  assert.equal(reg.size, 1);
  assert.equal(reg.has('alice'), true);
  assert.deepEqual(reg.verify('alice', blob()), { ok: true });
});

test('verify rejects a wrong secret and an unknown account', () => {
  const reg = createAccountRegistry();
  reg.register('bob', blob());
  assert.equal(reg.verify('bob', wrongBlob()).ok, false);
  assert.equal(reg.verify('bob', wrongBlob()).reason, 'bad-credentials');
  assert.equal(reg.verify('nobody', blob()).reason, 'no-such-account');
});

test('register refuses a duplicate account (dedupe / username taken)', () => {
  const reg = createAccountRegistry();
  reg.register('carol', blob());
  assert.throws(() => reg.register('carol', blob()), /already exists/);
  assert.equal(reg.size, 1);
});

test('register rejects an empty account label', () => {
  const reg = createAccountRegistry();
  assert.throws(() => reg.register('', blob()), /invalid account label/);
});

test('the stored hash is salted (no plaintext, per-account salt)', () => {
  const db = tmpDb();
  try {
    const reg = createAccountRegistry({ persistPath: db });
    reg.register('dave', blob());
    const rawDb = new DatabaseSync(db);
    try {
      const rec = rawDb.prepare('SELECT salt, hash FROM accounts WHERE account = ?').get('dave');
      assert.ok(rec.salt && rec.hash);
      assert.notEqual(rec.hash, REAL_LOGIN_INNER_HEX); // no verbatim credential persisted
    } finally {
      rawDb.close();
    }
  } finally {
    rmSync(db, { force: true });
  }
});

test('persistence round-trips across registry instances', () => {
  const db = tmpDb();
  try {
    const reg1 = createAccountRegistry({ persistPath: db });
    reg1.register('erin', blob());
    assert.ok(existsSync(db));
    const reg2 = createAccountRegistry({ persistPath: db }); // fresh instance loads from disk
    assert.equal(reg2.has('erin'), true);
    assert.deepEqual(reg2.verify('erin', blob()), { ok: true });
    assert.equal(reg2.verify('erin', wrongBlob()).ok, false);
  } finally {
    rmSync(db, { force: true });
  }
});

test('JSON account seed imports into SQLite and is not a runtime JSON DB', () => {
  const db = tmpSqliteDb();
  const seed = join(tmpdir(), `logh7-acct-seed-${process.pid}-${tmpCounter}.json`);
  try {
    writeFileSync(seed, `${JSON.stringify({
      accounts: [{
        account: 'seed-user',
        salt: '00'.repeat(16),
        hash: '11'.repeat(32),
        createdAt: '2026-06-21T00:00:00.000Z',
      }],
    })}\n`, 'utf8');
    const reg1 = createAccountRegistry({ persistPath: db, seedPath: seed });
    assert.equal(reg1.has('seed-user'), true);
    assert.ok(existsSync(db));
    assert.deepEqual(loadAccountRecords(db).map((record) => record.account), ['seed-user']);
    assert.throws(() => createAccountRegistry({ persistPath: seed }), /JSON is seed-only/);
  } finally {
    rmSync(db, { force: true });
    rmSync(`${db}-shm`, { force: true });
    rmSync(`${db}-wal`, { force: true });
    rmSync(seed, { force: true });
  }
});

test('account store with a registry registers on first login then verifies thereafter', () => {
  const store = createAccountStore({
    acceptAnyGin7: false,
    allowRegister: true,
    registry: createAccountRegistry(),
  });
  const first = store.authenticate(blob());
  assert.deepEqual(first, { ok: true, account: 'inei00', matchedBy: 'registered' });
  const second = store.authenticate(blob());
  assert.deepEqual(second, { ok: true, account: 'inei00', matchedBy: 'password' });
  const wrong = store.authenticate(wrongBlob());
  assert.equal(wrong.ok, false); // same account label, wrong password -> rejected
});

test('account store with a registry but no allowRegister rejects unknown accounts', () => {
  const store = createAccountStore({
    acceptAnyGin7: false,
    allowRegister: false,
    registry: createAccountRegistry(),
  });
  const result = store.authenticate(blob());
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'authentication failed'); // generic (anti-enumeration)
});

test('failure reasons are generic and identical for missing account vs wrong password', () => {
  const store = createAccountStore({ acceptAnyGin7: false, allowRegister: true, registry: createAccountRegistry() });
  store.authenticate(blob()); // register inei00
  const wrong = store.authenticate(wrongBlob()); // same label, wrong password -> bad-credentials
  const store2 = createAccountStore({ acceptAnyGin7: false, allowRegister: false, registry: createAccountRegistry() });
  const missing = store2.authenticate(blob()); // unknown account
  assert.equal(wrong.reason, 'authentication failed');
  assert.equal(missing.reason, 'authentication failed');
});

test('isValidAccountLabel rejects empty / over-long / non-printable / __proto__', () => {
  assert.equal(isValidAccountLabel('inei00'), true);
  assert.equal(isValidAccountLabel(''), false);
  assert.equal(isValidAccountLabel('a'.repeat(33)), false);
  assert.equal(isValidAccountLabel('bad\x01ctrl'), false);
  assert.equal(isValidAccountLabel('__proto__'), false);
});

test('register enforces a global account cap (DoS guard)', () => {
  const reg = createAccountRegistry({ maxAccounts: 1 });
  reg.register('first', blob());
  assert.throws(() => reg.register('second', blob()), /account limit/);
});

test('verify locks an account after repeated failures, then unlocks after the window', () => {
  let clock = 1000;
  const reg = createAccountRegistry({ maxFailedAttempts: 3, lockoutMs: 5000, now: () => clock });
  reg.register('frank', blob());
  for (let i = 0; i < 3; i += 1) assert.equal(reg.verify('frank', wrongBlob()).reason, 'bad-credentials');
  assert.equal(reg.verify('frank', blob()).reason, 'rate-limited'); // locked even with correct password
  clock += 5001; // window elapses
  assert.deepEqual(reg.verify('frank', blob()), { ok: true }); // unlocked + correct
});

test('store registration stamps createdAt', () => {
  const reg = createAccountRegistry();
  const store = createAccountStore({ acceptAnyGin7: false, allowRegister: true, registry: reg });
  store.authenticate(blob());
  const rec = reg.getAccount('inei00');
  assert.ok(rec && typeof rec.createdAt === 'string' && rec.createdAt.length > 0);
});

test('profile characters heal missing required display fields for lobby cards', () => {
  const reg = createAccountRegistry();
  reg.register('profile-user', blob());

  const profile = reg.addProfileCharacter('profile-user', {
    id: 1,
    name: '신참',
    displayName: '신참',
    lastname: '신참',
    firstname: '',
    ageYears: 0,
    birthMonth: 0,
    birthDay: 0,
    birthYear: 0,
  });

  assert.equal(profile.name, '신참사관');
  assert.equal(profile.displayName, '신참사관');
  assert.equal(profile.lastname, '신참');
  assert.equal(profile.firstname, '사관');
  assert.equal(profile.ageYears, 18);
  assert.equal(profile.birthMonth, 1);
  assert.equal(profile.birthDay, 1);
  assert.equal(profile.birthYear, 767);
});

test('legacy accept-any-GIN7 store is unaffected (no registry)', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  assert.deepEqual(store.authenticate(blob()), { ok: true, account: 'inei00', matchedBy: 'gin7-any' });
});
