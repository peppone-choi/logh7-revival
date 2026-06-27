import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { startLogh7AuthServer } from '../../src/server/logh7-auth-server.mjs';
import { createAccountStore } from '../../src/server/logh7-login-session.mjs';

const CLIENT_EXE = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
const HAS_EXE = existsSync(CLIENT_EXE);
const TRANSPORT_KEY = Buffer.from('7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d', 'hex');
const DECIPHER_KEY = Buffer.from('5859', 'hex');

// Start a server with a controlled env snapshot, returning a restore() to undo env mutations.
async function startWith(env) {
  const keys = ['LOGH_RELAY', 'LOGH_AUTHORITATIVE', 'LOGH_NPC_AI', 'LOGH_CONTENT_DB'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0, // ephemeral
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  const restore = () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  return { server, restore };
}

test('NPC AI is OFF by default (opt-in)', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const { server, restore } = await startWith({ LOGH_RELAY: undefined, LOGH_AUTHORITATIVE: undefined, LOGH_NPC_AI: undefined });
  try {
    assert.equal(server.npcAiEnabled, false);
    assert.deepEqual(server.npcTickOnce(), { notifies: [], actions: [] }); // disabled -> no-op
  } finally {
    await server.close();
    restore();
  }
});

test('NPC AI requires authoritative: LOGH_NPC_AI=1 alone (no relay/authoritative) stays off', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const { server, restore } = await startWith({ LOGH_RELAY: undefined, LOGH_AUTHORITATIVE: undefined, LOGH_NPC_AI: '1' });
  try {
    assert.equal(server.npcAiEnabled, false);
  } finally {
    await server.close();
    restore();
  }
});

test('NPC AI enabled (relay+authoritative+npc): tick is a no-op with no in-world players, server closes cleanly', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const { server, restore } = await startWith({ LOGH_RELAY: '1', LOGH_AUTHORITATIVE: '1', LOGH_NPC_AI: '1' });
  try {
    assert.equal(server.npcAiEnabled, true);
    // No relay-registered (in-world) connection yet -> the tick broadcasts to nobody and mutates nothing.
    const result = server.npcTickOnce();
    assert.deepEqual(result, { notifies: [], actions: [] });
  } finally {
    await server.close(); // must clear the interval; if it leaked, the test runner would hang here/after
    restore();
  }
});
