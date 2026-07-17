import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGameApplication } from '../src/application/GameApplication.mjs';
import { createPlayableRuntime } from '../src/presentation/createPlayableRuntime.mjs';
import { isStrategicGridCellNavigable } from '../src/server/logh7-galaxy-placement.mjs';
import {
  CODE_INFO_CHARACTER,
  CODE_INFO_UNIT,
  CODE_INFO_UNIT_WIRE_HEADER,
  CODE_NOTIFY_MOVED_GRID,
  buildSsCharacterIdInner,
  msg32Body,
  readMsg32Code,
} from '../src/server/logh7-world-records.mjs';
import {
  RESPONSE_TACTICS_UNIT_SHIP_CODE,
  RESPONSE_NOTIFY_TACTICS_CODE,
  UNIT_SHIP_RECORD_BYTES,
} from '../src/server/codec/tactical-position-records.mjs';
import { writeFile } from 'node:fs/promises';

test('CQRS+ORM: create account/character, enter world, move grid with flush', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-orm-'));
  const dbPath = join(dir, 't.sqlite');
  const app = createGameApplication({ dbPath, isGridCellNavigable: isStrategicGridCellNavigable });
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

    await assert.rejects(
      app.dispatchCommand({
        type: 'MoveGrid',
        accountId: 'inei00',
        characterId: created.character.id,
        unitId: entered.unitId,
        cell: 2597,
      }),
      /warp authority required/,
    );
    assert.deepEqual(
      { ...app.connection.db.prepare(`
        SELECT characters.cell AS characterCell,
               world_fleet.cell AS fleetCell,
               characters.online AS online,
               (SELECT COUNT(*) FROM domain_events WHERE type = 'GridMoved') AS gridMovedCount
        FROM characters
        JOIN world_fleet ON world_fleet.character_id = characters.id
        WHERE characters.id = ?
      `).get(created.character.id) },
      { characterCell: 0, fleetCell: 0, online: 1, gridMovedCount: 0 },
    );

    await app.dispatchCommand({
      type: 'GrantAuthorityCard',
      characterId: created.character.id,
      kind: 59,
    });
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

test('playable runtime caps the 63-row SQLite catalog to the live-safe 19-row 0x030b prefix', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-rt-ships-'));
  const dbPath = join(dir, 't.sqlite');
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(accountsPath, JSON.stringify({ accounts: [] }), 'utf8');
  const runtime = createPlayableRuntime({ dbPath, accountsPath, logger: { debug() {} } });
  try {
    // Given: production runtime이 시드한 WorldCatalog.getShips() 정본 63행.
    assert.equal(runtime.app.worldCatalog.getShips().length, 63);
    const request = Buffer.alloc(2);
    request.writeUInt16BE(0x030a, 0);

    // When
    const result = runtime.worldSession.handleWorldInner({ connectionId: 1, accountId: 'a', inner: request });
    const body = msg32Body(result.responses[0].inner);

    // Then: 라이브 안전 prefix 19행이며 undefined4* + 1의 4바이트 헤더와 stride를 보존한다.
    assert.equal(body.length, 0x6d64);
    assert.equal(body.readUInt8(0), 19);
    assert.equal(body.readUInt16LE(4), 1);
    assert.equal(body.readUInt16LE(4 + 0x06), 0);
    assert.equal(body.readUInt8(4 + 0x08), 3);
    assert.equal(body.subarray(4 + 0x0a, 4 + 0x10).toString('utf16le'), 'A72');
    assert.equal(body.readUInt16LE(4 + 0x8c), 2);
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable runtime routes world enter and wire move through CQRS/UoW', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-rt-move-'));
  const dbPath = join(dir, 't.sqlite');
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(accountsPath, JSON.stringify({
    accounts: [{ accountId: 'inei00', password: 'dummy' }],
  }), 'utf8');
  const previousLiveClientLayout = process.env.LOGH_LIVE_CLIENT_LAYOUT;
  delete process.env.LOGH_LIVE_CLIENT_LAYOUT;
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
    const enterInner = Buffer.alloc(2);
    enterInner.writeUInt16BE(0x0205, 0);
    const entered = runtime.worldSession.handleWorldInner({
      connectionId: 1,
      accountId: 'inei00',
      inner: enterInner,
    });
    assert.equal(entered.kind, 'world-enter');
    const characterInfo = entered.responses.find(
      ({ inner }) => readMsg32Code(inner) === CODE_INFO_CHARACTER,
    );
    assert.ok(characterInfo);
    assert.equal(msg32Body(characterInfo.inner).readUInt32BE(0x20), character.unitId);
    assert.equal(
      runtime.app.connection.db.prepare('SELECT online FROM characters WHERE id = ?').get(character.id).online,
      1,
    );

    const moveInner = Buffer.alloc(10);
    moveInner.writeUInt16BE(0x0b01, 0);
    moveInner.writeUInt32LE(character.unitId, 2);
    moveInner.writeUInt32LE(2597, 6);

    const moved = runtime.worldSession.handleWorldInner({
      connectionId: 1,
      accountId: 'inei00',
      inner: moveInner,
    });
    assert.equal(moved.kind, 'move');
    assert.deepEqual(
      moved.responses.map(({ inner }) => readMsg32Code(inner)),
      [CODE_NOTIFY_MOVED_GRID],
    );
    assert.deepEqual(moved.responses.map(({ targets }) => targets), [[1]]);
    const selfId = msg32Body(buildSsCharacterIdInner({ characterId: character.id }));
    assert.deepEqual(msg32Body(moved.responses[0].inner).subarray(4, 8), selfId);
    assert.equal(runtime.characterStore.getCharacters('inei00')[0].cell, 2597);
    assert.equal(
      runtime.app.connection.db.prepare("SELECT COUNT(*) AS count FROM domain_events WHERE type = 'GridMoved'").get().count,
      1,
    );
    assert.equal(
      runtime.worldSession.getPlayer(1).authorityCards.some((card) => card.kind === 59),
      true,
    );

    const assertMoveRejectedWithoutMutation = (accountId, unitId, cell, error) => {
      const moveEventCount = runtime.worldSession.getEventLog().filter((event) => event.type === 'move').length;
      const invalid = Buffer.alloc(10);
      invalid.writeUInt16BE(0x0b01, 0);
      invalid.writeUInt32LE(unitId, 2);
      invalid.writeUInt32LE(cell, 6);
      assert.throws(
        () => runtime.worldSession.handleWorldInner({ connectionId: 1, accountId, inner: invalid }),
        error,
      );
      assert.equal(runtime.characterStore.getCharacters('inei00')[0].cell, 2597);
      assert.equal(
        runtime.app.connection.db.prepare("SELECT COUNT(*) AS count FROM domain_events WHERE type = 'GridMoved'").get().count,
        1,
      );
      assert.equal(runtime.worldSession.getPlayer(1).cell, 2597);
      assert.equal(
        runtime.worldSession.getEventLog().filter((event) => event.type === 'move').length,
        moveEventCount,
        '거부된 이동은 브로드캐스트 응답을 만드는 세션 move 이벤트를 남기지 않는다',
      );
    };

    assertMoveRejectedWithoutMutation('intruder', character.unitId, 2598, /account not owned/);
    assertMoveRejectedWithoutMutation('inei00', character.unitId + 1, 2598, /unit .* not owned|unit not owned/);
    assertMoveRejectedWithoutMutation('inei00', character.unitId, 0, /grid cell not navigable/);

    runtime.app.dispatchCommandSync({
      type: 'RevokeAuthorityCard',
      characterId: character.id,
      kind: 59,
    });
    assert.equal(
      runtime.characterStore.getCharacters('inei00')[0].authorityCards.some((card) => card.kind === 59),
      false,
    );
    assert.equal(
      runtime.worldSession.getPlayer(1).authorityCards.some((card) => card.kind === 59),
      true,
      '세션 캐시는 회수 전 kind 59를 유지한다',
    );
    const revokedMoveInner = Buffer.from(moveInner);
    revokedMoveInner.writeUInt32LE(2598, 6);
    const db = runtime.app.connection.db;
    const beforeCharacterCell = db.prepare('SELECT cell FROM characters WHERE id = ?').get(character.id).cell;
    const beforeFleetCell = db.prepare('SELECT cell FROM world_fleet WHERE character_id = ?').get(character.id).cell;
    const beforeGridMovedCount = db.prepare("SELECT COUNT(*) AS count FROM domain_events WHERE type = 'GridMoved'").get().count;
    const beforeSessionMoveCount = runtime.worldSession.getEventLog().filter((event) => event.type === 'move').length;
    let rejectedResult;
    assert.throws(
      () => {
        rejectedResult = runtime.worldSession.handleWorldInner({
          connectionId: 1,
          accountId: 'inei00',
          inner: revokedMoveInner,
        });
      },
      /warp authority required/,
    );
    assert.equal(rejectedResult, undefined, '거부된 요청은 response/broadcast 결과를 반환하지 않는다');
    assert.equal(db.prepare('SELECT cell FROM characters WHERE id = ?').get(character.id).cell, beforeCharacterCell);
    assert.equal(db.prepare('SELECT cell FROM world_fleet WHERE character_id = ?').get(character.id).cell, beforeFleetCell);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM domain_events WHERE type = 'GridMoved'").get().count,
      beforeGridMovedCount,
    );
    assert.equal(runtime.worldSession.getPlayer(1).cell, 2597);
    assert.equal(
      runtime.worldSession.getEventLog().filter((event) => event.type === 'move').length,
      beforeSessionMoveCount,
    );

    runtime.app.connection.db.prepare('UPDATE characters SET online = 0 WHERE id = ?').run(character.id);
    assertMoveRejectedWithoutMutation('inei00', character.unitId, 2598, /not in world/);

    await runtime.close();
    process.env.LOGH_LIVE_CLIENT_LAYOUT = '0';
    runtime = createPlayableRuntime({
      port: 0,
      host: '127.0.0.1',
      dbPath,
      accountsPath,
      logger: { debug() {} },
    });
    assert.equal(process.env.LOGH_LIVE_CLIENT_LAYOUT, '0');
    assert.equal(runtime.characterStore.getCharacters('inei00')[0].cell, 2597);
    assert.equal(
      runtime.app.connection.db.prepare("SELECT COUNT(*) AS count FROM domain_events WHERE type = 'GridMoved'").get().count,
      1,
    );
  } finally {
    await runtime.close();
    if (previousLiveClientLayout === undefined) delete process.env.LOGH_LIVE_CLIENT_LAYOUT;
    else process.env.LOGH_LIVE_CLIENT_LAYOUT = previousLiveClientLayout;
    await rm(dir, { recursive: true, force: true });
  }
});

// LOGH7-58 유닛 스테이징: production runtime(createPlayableRuntime)이 실제로 전술 진입
// 시퀀스를 방출해야 한다. 라이브 진단(2026-07-17)으로 확정: 실행 서버는 tacticalEntry 게이트가
// off라 world-enter에서 0x0325 레지스트리만 보내고 0x033b(전술 함선 상태)/0x0f1f(전술 arm)를
// 한 번도 보내지 않았다 → 클라 FSM이 state 2로 진행 못 함(DAT_009d2fa8 null). 이 테스트는 실
// 유저 경로가 그 시퀀스를 방출하고, 0x033b unitId가 동반 0x0325 roster와 일치함을 고정한다.
function decodeUnitRosterIds(inner) {
  const body = msg32Body(inner);
  const count = body.readUInt16BE(0);
  const ids = [];
  let cursor = CODE_INFO_UNIT_WIRE_HEADER;
  for (let i = 0; i < count; i += 1) {
    ids.push(body.readUInt32BE(cursor)); cursor += 4;
    cursor += 2 + 1 + 4 + 4 + 4; // faction,+0x06,commander,cell,owner
    const boats = body.readUInt8(cursor); cursor += 1;
    cursor += boats * 4;
    cursor += 4 + 2 + 2 + 2 + 4 + 4 + 4; // spot,+44/45,+46,mapSection,+4c,+50,+54
  }
  return ids;
}
function decodeTacticsShipIds(inner) {
  const body = msg32Body(inner);
  const count = body.readUInt16BE(0);
  const ids = [];
  for (let i = 0; i < count; i += 1) ids.push(body.readUInt32BE(4 + i * UNIT_SHIP_RECORD_BYTES));
  return ids;
}

test('production runtime emits tactical entry sequence (0x033b + 0x0f1f arm) with matched roster', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-rt-tactical-'));
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
    const character = runtime.characterStore.addCharacter('inei00', {
      lastname: 'Tactic',
      firstname: 'Entry',
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
    const enterInner = Buffer.alloc(2);
    enterInner.writeUInt16BE(0x0205, 0);
    const entered = runtime.worldSession.handleWorldInner({
      connectionId: 1,
      accountId: 'inei00',
      inner: enterInner,
    });
    assert.equal(entered.kind, 'world-enter');
    const codes = entered.responses.map(({ inner }) => readMsg32Code(inner));

    // 전술 함선 상태(0x033b)와 전술 arm(0x0f1f)이 방출된다.
    assert.ok(codes.includes(RESPONSE_TACTICS_UNIT_SHIP_CODE), `world-enter missing 0x033b: ${codes.map((c) => c.toString(16))}`);
    assert.equal(codes[codes.length - 1], RESPONSE_NOTIFY_TACTICS_CODE, 'world-enter 말미 = 0x0f1f arm');

    // 0x0f1f arm payload[0] == 1 (FSM state 2 arm).
    const armInner = entered.responses[entered.responses.length - 1].inner;
    assert.equal(msg32Body(armInner).readUInt8(0), 0x01, 'arm payload[0]==1');

    // 스킵방지 회귀가드: 0x033b unitId가 동반 0x0325 roster와 정확히 일치(값·순서).
    const tacticsInner = entered.responses.find(({ inner }) => readMsg32Code(inner) === RESPONSE_TACTICS_UNIT_SHIP_CODE).inner;
    const unitInners = entered.responses.filter(({ inner }) => readMsg32Code(inner) === CODE_INFO_UNIT);
    const shipIds = decodeTacticsShipIds(tacticsInner);
    const rosterIds = decodeUnitRosterIds(unitInners[unitInners.length - 1].inner);
    assert.deepEqual(shipIds, rosterIds, '0x033b unitId == 0x0325 roster (매칭 가드)');
    // roster는 플레이어 unit[0] + NPC 배치 함대로 비어있지 않다.
    assert.ok(shipIds.length > 1, `roster 비어있지 않음(플레이어+NPC): ${shipIds.length}`);
    assert.equal(shipIds[0], character.unitId, '플레이어가 roster unit[0]');
  } finally {
    await runtime.close();
    await rm(dir, { recursive: true, force: true });
  }
});
