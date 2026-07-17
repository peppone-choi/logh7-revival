// LOGH7-59 / LOGH7-60 — 세션 수명주기 권위 반영.
//
// 방어적 복원(죽은 게임 복원·자체 서버 호환성): 권위 서버가 접속 종료를 정확히
// 기록하고(online=false 영속), 재접속이 중복 세션·중복 상태를 만들지 않도록 멱등하게
// 처리한다. 라이브 클라이언트 없이 서버 상태·DB 로만 검증한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createPlayableRuntime } from '../src/presentation/createPlayableRuntime.mjs';
import { CODE_SS_GAME_LOGIN_REQ } from '../src/server/logh7-world-records.mjs';

async function bootRuntime(prefix) {
  const dir = await mkdtemp(join(tmpdir(), prefix));
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
  return { runtime, dir };
}

function enterInner() {
  const inner = Buffer.alloc(2);
  inner.writeUInt16BE(CODE_SS_GAME_LOGIN_REQ, 0); // 0x0205
  return inner;
}

function onlineOf(runtime, characterId) {
  return runtime.app.connection.db
    .prepare('SELECT online FROM characters WHERE id = ?')
    .get(characterId).online;
}

// ─── LOGH7-59: disconnect 시 online=false 영속화 ───────────────────────────────

test('LOGH7-59: disconnect persists online=false and re-login restores online=true', async () => {
  const { runtime, dir } = await bootRuntime('logh7-disc-');
  try {
    const character = runtime.characterStore.addCharacter('inei00', {
      lastname: 'Discon',
      firstname: 'Nect',
      power: 2,
      cell: 2588,
    });
    runtime.worldSession.seedPlayer({
      connectionId: 1,
      accountId: 'inei00',
      characterId: character.id,
      unitId: character.unitId,
      cell: 2588,
      inWorld: false,
    });

    // 월드 진입 → online=1 영속.
    const entered = runtime.worldSession.handleWorldInner({
      connectionId: 1,
      accountId: 'inei00',
      inner: enterInner(),
    });
    assert.equal(entered.kind, 'world-enter');
    assert.equal(onlineOf(runtime, character.id), 1);

    // 접속 종료 → online=0 이 DB 에 영속되어야 한다(권위 서버가 종료를 기록).
    assert.equal(runtime.worldSession.handleDisconnect(1), true);
    assert.equal(onlineOf(runtime, character.id), 0, 'disconnect 는 online=false 를 영속한다');

    // 재로그인(새 연결로 재접속) → online=1 로 복원.
    const rejoined = runtime.worldSession.handleWorldInner({
      connectionId: 2,
      accountId: 'inei00',
      inner: enterInner(),
    });
    assert.equal(rejoined.kind, 'world-enter');
    assert.equal(onlineOf(runtime, character.id), 1, '재로그인은 online=true 로 복원한다');
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('LOGH7-59: disconnect of an unknown connection is a safe no-op', async () => {
  const { runtime, dir } = await bootRuntime('logh7-disc-noop-');
  try {
    assert.equal(runtime.worldSession.handleDisconnect(999), false);
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});
