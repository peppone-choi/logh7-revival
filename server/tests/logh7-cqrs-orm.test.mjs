import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGameApplication } from '../src/application/GameApplication.mjs';
import { createPlayableRuntime } from '../src/presentation/createPlayableRuntime.mjs';
import { writeFile } from 'node:fs/promises';

test('CQRS+ORM: create account/character, enter world, move grid with flush', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-orm-'));
  const dbPath = join(dir, 't.sqlite');
  const app = createGameApplication({ dbPath });
  try {
    await app.dispatchCommand({
      type: 'EnsureDevAccount',
      accountId: 'inei00',
      password: 'dummy',
    });
    const auth = await app.dispatchCommand({
      type: 'AuthenticateAccount',
      accountId: 'inei00',
      password: 'dummy',
    });
    assert.equal(auth.ok, true);

    const bad = await app.dispatchCommand({
      type: 'AuthenticateAccount',
      accountId: 'inei00',
      password: 'wrong',
    });
    assert.equal(bad.ok, false);

    const created = await app.dispatchCommand({
      type: 'CreateCharacter',
      accountId: 'inei00',
      lastname: 'Test',
      firstname: 'Pilot',
      face: 1,
      power: 1,
    });
    assert.equal(created.ok, true);
    assert.ok(created.character.id >= 1);

    const list = await app.dispatchQuery({
      type: 'GetAccountCharacters',
      accountId: 'inei00',
    });
    assert.equal(list.characters.length, 1);

    const entered = await app.dispatchCommand({
      type: 'EnterWorld',
      accountId: 'inei00',
      characterId: created.character.id,
    });
    assert.equal(entered.ok, true);
    assert.ok(entered.unitId);

    const moved = await app.dispatchCommand({
      type: 'MoveGrid',
      accountId: 'inei00',
      characterId: created.character.id,
      unitId: entered.unitId,
      cell: 2597,
    });
    assert.equal(moved.cell, 2597);
    await assert.rejects(
      app.dispatchCommand({
        type: 'MoveGrid',
        accountId: 'intruder',
        characterId: created.character.id,
        unitId: entered.unitId,
        cell: 2598,
      }),
      /character not owned/,
    );
    await assert.rejects(
      app.dispatchCommand({
        type: 'MoveGrid',
        characterId: created.character.id,
        unitId: entered.unitId,
        cell: 2598,
      }),
      /account required/,
    );
    await assert.rejects(
      app.dispatchCommand({
        type: 'MoveGrid',
        accountId: 'inei00',
        characterId: created.character.id,
        unitId: entered.unitId,
        cell: 5000,
      }),
      /invalid grid cell/,
    );

    // 재오픈 후 영속 확인 (Hibernate급 flush 검증)
    app.close();
    const app2 = createGameApplication({ dbPath });
    try {
      const again = await app2.dispatchQuery({
        type: 'GetCharacter',
        characterId: created.character.id,
      });
      assert.equal(again.character.cell, 2597);
      assert.equal(again.character.online, true);
    } finally {
      app2.close();
    }
  } finally {
    try { app.close(); } catch { /* already closed */ }
    await rm(dir, { recursive: true, force: true });
  }
});

test('character store adapter works for lobby codec path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-orm2-'));
  const dbPath = join(dir, 't.sqlite');
  const app = createGameApplication({ dbPath });
  try {
    app.ensureAccount({ accountId: 'p1', password: 'x' });
    const store = app.createCharacterStoreAdapter();
    assert.deepEqual(store.getCharacters('p1'), []);
    const c = store.addCharacter('p1', {
      lastname: 'A',
      firstname: 'B',
      face: 2,
      power: 1,
      rank: 0x0d,
    });
    assert.ok(c.id);
    assert.equal(store.getCharacters('p1').length, 1);
    assert.equal(store.deleteCharacter('p1', c.id), true);
    assert.equal(store.getCharacters('p1').length, 0);
  } finally {
    app.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable runtime boots with ORM store on ephemeral port', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-rt-'));
  const dbPath = join(dir, 't.sqlite');
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(accountsPath, JSON.stringify({
    accounts: [{ accountId: 'inei00', password: 'dummy' }],
  }), 'utf8');
  const runtime = createPlayableRuntime({
    port: 0,
    host: '127.0.0.1',
    dbPath,
    accountsPath,
    logger: { debug() {} },
  });
  try {
    await runtime.listen();
    const addr = runtime.address();
    assert.ok(addr.port > 0);
    const chars = runtime.characterStore.getCharacters('inei00');
    assert.ok(Array.isArray(chars));
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable runtime world move persists through SQLite runtime recreation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-rt-move-'));
  const dbPath = join(dir, 't.sqlite');
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(accountsPath, JSON.stringify({
    accounts: [{ accountId: 'inei00', password: 'dummy' }],
  }), 'utf8');
  let runtime = createPlayableRuntime({
    port: 0,
    host: '127.0.0.1',
    dbPath,
    accountsPath,
    logger: { debug() {} },
  });
  try {
    const character = runtime.characterStore.addCharacter('inei00', {
      lastname: 'Runtime',
      firstname: 'Move',
      power: 1,
      cell: 2588,
    });
    runtime.worldSession.seedPlayer({
      connectionId: 1,
      accountId: 'inei00',
      characterId: character.id,
      unitId: character.unitId,
      cell: 2588,
      inWorld: true,
    });
    const moveInner = Buffer.alloc(10);
    moveInner.writeUInt16BE(0x0b01, 0);
    moveInner.writeUInt32LE(character.unitId, 2);
    moveInner.writeUInt32LE(2597, 6);

    runtime.worldSession.handleMoveCommand({
      connectionId: 1,
      accountId: 'inei00',
      inner: moveInner,
    });

    assert.equal(runtime.characterStore.getCharacters('inei00')[0].cell, 2597);
    await runtime.close();
    runtime = createPlayableRuntime({
      port: 0,
      host: '127.0.0.1',
      dbPath,
      accountsPath,
      logger: { debug() {} },
    });
    assert.equal(runtime.characterStore.getCharacters('inei00')[0].cell, 2597);
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});
