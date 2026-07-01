import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  createSessionRegistry,
  DEFAULT_SESSION_RECORDS,
  loadSessionRecords,
} from '../../src/server/logh7-session-registry.mjs';

test('session registry persists operator-defined session names and routes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-session-registry-'));
  const db = path.join(dir, 'sessions.sqlite');
  try {
    const registry = createSessionRegistry({ persistPath: db });
    assert.equal(registry.listSessions().length, DEFAULT_SESSION_RECORDS.length);

    const created = registry.upsertSession({
      sessionId: 7,
      sessionName: 'Operator War',
      status: 1,
      beginDay: 'UC 802',
      powers: [{ id: 1, superMan: 'Reinhard' }, { id: 2, superMan: 'Yang' }],
      world: { ip: '10.7.0.1', port: 48007, token: 77 },
    });

    assert.equal(created.existed, false);
    assert.equal(created.sessionName, 'Operator War');
    assert.equal(created.world.port, 48007);
    assert.equal(loadSessionRecords(db).some((session) => session.sessionId === 7), true);

    const reloaded = createSessionRegistry({ persistPath: db });
    assert.equal(reloaded.getSession(7).sessionName, 'Operator War');
    assert.equal(reloaded.getSession(7).world.token, 77);

    const closed = reloaded.setStatus(7, 0);
    assert.equal(closed.status, 0);
    assert.equal(createSessionRegistry({ persistPath: db }).getSession(7).status, 0);

    assert.equal(reloaded.deleteSession(7), true);
    assert.equal(createSessionRegistry({ persistPath: db }).getSession(7), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('session registry validates client string caps before serving 0x2006', () => {
  assert.throws(
    () => createSessionRegistry({ sessions: [{ sessionId: 1, sessionName: 'abcdefghijklmn' }] }),
    /session name is too long/,
  );
  assert.throws(
    () => createSessionRegistry({ sessions: [{ sessionId: 1, beginDay: 'x'.repeat(66) }] }),
    /session beginDay is too long/,
  );
});
