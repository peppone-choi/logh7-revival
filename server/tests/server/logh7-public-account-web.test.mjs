import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createAccountRegistry, loadAccountRecords } from '../../src/server/logh7-account-registry.mjs';
import { buildGin7Credential } from '../../src/server/logh7-gin7-credential.mjs';
import { startPublicAccountWeb } from '../../src/server/logh7-public-account-web.mjs';
import { createSessionRegistry } from '../../src/server/logh7-session-registry.mjs';

test('public signup creates a real client-login account and selects Iserlohn session', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'logh7-public-signup-'));
  const accountDb = path.join(root, 'accounts.sqlite');
  const sessionDb = path.join(root, 'sessions.sqlite');
  const registry = createAccountRegistry({ persistPath: accountDb });
  const sessionRegistry = createSessionRegistry({ persistPath: sessionDb });
  const web = await startPublicAccountWeb({
    host: '127.0.0.1',
    port: 0,
    registry,
    sessionRegistry,
  });
  try {
    const sessions = await fetch(`${web.url.replace('/signup', '')}/api/sessions`).then((r) => r.json());
    assert.deepEqual(sessions.sessions.map((s) => s.sessionName), ['이제르론 서버']);

    const signupResponse = await fetch(`${web.url.replace('/signup', '')}/api/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'public01', password: 'pw123' }),
    });
    assert.equal(signupResponse.status, 201);
    const signup = await signupResponse.json();
    assert.equal(signup.ok, true);
    assert.equal(signup.selectedSessionId, 1);
    assert.equal(signup.loginReady, true);

    const credential = buildGin7Credential({ account: 'public01', password: 'pw123' });
    assert.deepEqual(registry.verify('public01', credential), { ok: true });
    assert.equal(registry.getSelectedSession('public01'), 1);
    assert.deepEqual(loadAccountRecords(accountDb).map((record) => record.account), ['public01']);

    const loginResponse = await fetch(`${web.url.replace('/signup', '')}/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'public01', password: 'pw123' }),
    });
    assert.equal(loginResponse.status, 200);
    assert.equal((await loginResponse.json()).ok, true);
  } finally {
    await web.close();
    await rm(root, { recursive: true, force: true });
  }
});
