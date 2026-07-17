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
import { createWorldSession } from '../src/server/logh7-world-session.mjs';
import { CODE_SS_GAME_LOGIN_REQ } from '../src/server/logh7-world-records.mjs';

function sessionLoginInner(sessionId, characterId) {
  const b = Buffer.alloc(10);
  b.writeUInt16BE(0x2009, 0); // LobbySessionLoginReq
  b.writeUInt32LE(sessionId, 2);
  b.writeUInt32LE(characterId, 6);
  return b;
}

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

// ─── LOGH7-60: reconnect idempotency — 중복 세션·중복 상태 방지 ────────────────

test('LOGH7-60: duplicate session-login for the same account keeps a single live session', () => {
  const world = createWorldSession();
  // 같은 계정/캐릭터가 두 연결로 세션 로그인해도 계정당 하나의 세션만 남아야 한다.
  world.handleSessionLogin({
    connectionId: 1,
    accountId: 'inei00',
    inner: sessionLoginInner(1, 7),
    character: { id: 7, unitId: 3, cell: 2588 },
  });
  world.handleSessionLogin({
    connectionId: 2,
    accountId: 'inei00',
    inner: sessionLoginInner(2, 7),
    character: { id: 7, unitId: 3, cell: 2588 },
  });

  const mine = world.listPlayers().filter((p) => p.accountId === 'inei00');
  assert.equal(mine.length, 1, '계정당 하나의 세션만 남는다(중복 세션 방지)');
  assert.equal(mine[0].connectionId, 2, '가장 최근 연결이 세션을 소유한다');
  assert.equal(world.getPlayer(1), null, '이전 연결의 잔여 세션은 제거된다');
});

test('LOGH7-60: enterWorld twice on the same connection is idempotent (no duplicate)', () => {
  const world = createWorldSession();
  world.seedPlayer({
    connectionId: 1,
    accountId: 'inei00',
    characterId: 7,
    unitId: 3,
    cell: 2588,
    inWorld: false,
  });
  const first = world.enterWorld({ connectionId: 1, accountId: 'inei00' });
  const second = world.enterWorld({ connectionId: 1, accountId: 'inei00' });

  assert.equal(first.player.inWorld, true);
  assert.equal(second.player.inWorld, true);
  const mine = world.listPlayers().filter((p) => p.accountId === 'inei00');
  assert.equal(mine.length, 1, '재진입이 세션을 복제하지 않는다');
  assert.equal(mine[0].unitId, 3, '재진입이 유닛을 복제하지 않는다');
});

test('LOGH7-60: reconnect keeps a single online character and a single fleet projection', async () => {
  const { runtime, dir } = await bootRuntime('logh7-recon-');
  try {
    const character = runtime.characterStore.addCharacter('inei00', {
      lastname: 'Recon',
      firstname: 'Nect',
      power: 2,
      cell: 2588,
    });
    // 로비 세션 로그인(conn1) → 월드 진입(conn1).
    runtime.worldSession.seedPlayer({
      connectionId: 1,
      accountId: 'inei00',
      characterId: character.id,
      unitId: character.unitId,
      cell: 2588,
      inWorld: false,
    });
    runtime.worldSession.handleWorldInner({
      connectionId: 1,
      accountId: 'inei00',
      inner: enterInner(),
    });

    // 접속 종료 후 새 연결로 재접속(conn2) — 중복 세션·중복 projection 을 만들지 않아야 한다.
    runtime.worldSession.handleDisconnect(1);
    const rejoined = runtime.worldSession.handleWorldInner({
      connectionId: 2,
      accountId: 'inei00',
      inner: enterInner(),
    });
    assert.equal(rejoined.kind, 'world-enter');

    const mine = runtime.worldSession.listPlayers().filter((p) => p.accountId === 'inei00');
    assert.equal(mine.length, 1, '재접속 후에도 계정당 하나의 세션');
    assert.equal(mine[0].connectionId, 2);

    const db = runtime.app.connection.db;
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM characters WHERE account_id = ? AND online = 1').get('inei00').c,
      1,
      '온라인 캐릭터는 정확히 하나',
    );
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM world_fleet WHERE character_id = ?').get(character.id).c,
      1,
      'world_fleet projection 행은 정확히 하나(중복 없음)',
    );
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});
