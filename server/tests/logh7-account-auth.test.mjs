import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  verifyGin7Login,
  loadAccountRegistry,
} from '../src/server/logh7-account-auth.mjs';
import {
  SAMPLE_CREDENTIAL_INNER,
  buildBadPasswordCredentialInner,
  runLoginRoundtripWithFailClosed,
  runLoginSuccessPath,
  runMpActionTwice,
  runLoginWorldMpSequence,
} from '../src/server/logh7-playable-pipeline.mjs';
import { LOGIN_NG_INNER_CODE } from '../src/server/logh7-login-response.mjs';

test('verifyGin7Login accepts seeded inei00/dummy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-acc-'));
  const path = join(dir, 'accounts.json');
  await writeFile(path, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
  const ok = verifyGin7Login(SAMPLE_CREDENTIAL_INNER, path);
  assert.equal(ok.ok, true);
  assert.equal(ok.account, 'inei00');
  await rm(dir, { recursive: true, force: true });
});

test('verifyGin7Login fail-closed on wrong password and malformed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-acc2-'));
  const path = join(dir, 'accounts.json');
  await writeFile(path, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
  const bad = verifyGin7Login(buildBadPasswordCredentialInner(), path);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'invalid-credentials');
  const mal = verifyGin7Login(Buffer.from('00ff', 'hex'), path);
  assert.equal(mal.ok, false);
  assert.equal(mal.reason, 'malformed-credential');
  await rm(dir, { recursive: true, force: true });
});

test('runLoginRoundtripWithFailClosed: success + bad password + malformed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-acc3-'));
  const path = join(dir, 'accounts.json');
  await writeFile(path, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
  const r = runLoginRoundtripWithFailClosed({ accountsPath: path });
  assert.equal(r.ok, true);
  assert.equal(r.success.ok, true);
  assert.equal(r.success.keysetupInnerCode, 0x0031);
  assert.equal(r.success.redirectInnerCode, 0x7001);
  assert.equal(r.badPassword.ok, false);
  assert.equal(r.badPassword.failClosed, true);
  assert.equal(r.badPassword.loginNg.innerCode, LOGIN_NG_INNER_CODE);
  assert.equal(r.malformed.ok, false);
  assert.equal(r.malformed.failClosed, true);
  await rm(dir, { recursive: true, force: true });
});

test('runLoginWorldMpSequence works with explicit store path (no undefined crash)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-pipe-'));
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(accountsPath, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
  // storePath omitted → must not crash (uses DEFAULT or isolation)
  const fixtureChar = {
    power: 1,
    lastname: 'Fixture',
    firstname: 'One',
    face: 1,
    rank: 0x0d,
  };
  const r = runLoginWorldMpSequence({
    storePath: join(dir, 'chars.json'),
    accountsPath,
    moveCell: 2599,
    seedCharacter: fixtureChar,
  });
  assert.equal(r.ok, true);
  assert.equal(r.move.cell, 2599);
  // also no-arg storePath with isolationPath — 명시 시드만 허용
  const r2 = runLoginWorldMpSequence({
    accountsPath,
    isolationPath: true,
    moveCell: 2600,
    seedCharacter: fixtureChar,
  });
  assert.equal(r2.ok, true);
  await rm(dir, { recursive: true, force: true });
});

test('runMpActionTwice produces two consistent runs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-mp2-'));
  const accountsPath = join(dir, 'accounts.json');
  const storePath = join(dir, 'chars.json');
  await writeFile(accountsPath, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
  const r = runMpActionTwice({
    cells: [2701, 2702],
    storePath,
    accountsPath,
    seedCharacter: {
      power: 1,
      lastname: 'Fixture',
      firstname: 'One',
      face: 1,
      rank: 0x0d,
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.runs.length, 2);
  assert.equal(r.runs[0].moveCell, 2701);
  assert.equal(r.runs[1].moveCell, 2702);
  assert.equal(r.runs[0].notifyBytes, r.runs[1].notifyBytes);
  await rm(dir, { recursive: true, force: true });
});
