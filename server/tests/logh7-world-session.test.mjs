import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWorldSession } from '../src/server/logh7-world-session.mjs';
import {
  CODE_NOTIFY_MOVED_GRID,
  CODE_INFO_CHARACTER,
  CODE_LOBBY_SESSION_LOGIN_OK,
  CODE_SS_GAME_LOGIN_REQ,
  CODE_SS_GAME_LOGIN_OK,
  CODE_SS_CHARACTER_ID,
  readMsg32Code,
  msg32Body,
} from '../src/server/logh7-world-records.mjs';
import {
  runLoginSuccessPath,
  runLoginWorldMpSequence,
  SAMPLE_CREDENTIAL_INNER,
} from '../src/server/logh7-playable-pipeline.mjs';
import { parseGin7CredentialInner } from '../src/server/logh7-gin7-credential.mjs';

test('enterWorld emits character/unit records and marks inWorld', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: false });
  const { emits, codes, player } = world.enterWorld({ connectionId: 1 });
  assert.equal(player.inWorld, true);
  assert.ok(codes.includes(CODE_INFO_CHARACTER));
  assert.ok(emits.length >= 4);
  assert.equal(world.getPlayer(1).inWorld, true);
});

test('0x2009 create-pending (no character) returns 0x200a without inventing char', () => {
  const world = createWorldSession();
  const short = Buffer.alloc(4);
  short.writeUInt16BE(0x2009, 0);
  short.writeUInt16LE(1, 2);
  const login = world.handleSessionLogin({
    connectionId: 3,
    accountId: 'inei00',
    inner: short,
    character: null,
  });
  assert.equal(login.createPending, true);
  assert.equal(login.player.characterId, 0);
  assert.equal(login.player.sessionId, 1);
  // 생성 경로: message32 [u32 0][u16BE 0x200a][body]
  assert.equal(login.responseIsMsg32, true);
  assert.equal(login.responseInner.readUInt32LE(0), 0);
  assert.equal(login.responseInner.readUInt16BE(4), 0x200a);
  assert.throws(
    () => world.enterWorld({ connectionId: 3 }),
    /create-pending/,
  );
});

test('existing-character session login returns 0x200a as message32 (not raw)', () => {
  // M3: mps 트랜스포트는 인바운드 앱 메시지를 message32 유닛으로만 받는다.
  // raw 0x200a 는 recv 콜백 도달 전 드롭 → 클라가 리다이렉트를 못 받아 침묵.
  const world = createWorldSession();
  const req = Buffer.alloc(10);
  req.writeUInt16BE(0x2009, 0);
  req.writeUInt32LE(1, 2);
  req.writeUInt32LE(7, 6);
  const login = world.handleSessionLogin({
    connectionId: 1,
    accountId: 'inei00',
    inner: req,
    character: { id: 7, unitId: 3, cell: 2588 },
  });
  assert.equal(login.createPending, false);
  assert.equal(login.responseIsMsg32, true);
  // message32: [u32LE 0][u16BE 0x200a][body]
  assert.equal(login.responseInner.readUInt32LE(0), 0);
  assert.equal(login.responseInner.readUInt16BE(4), CODE_LOBBY_SESSION_LOGIN_OK);
});

test('0x0205 SSGameLoginRequest batch emits 0x0206 before 0x0204', () => {
  // M3: recv 필터가 0x0206(0x35837e) 미세팅 시 0x0204 를 드롭 → 0x0205 재트리거.
  // 월드 진입 배치에서 0x0206 이 0x0204·나머지 레코드보다 먼저여야 한다.
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: false });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(CODE_SS_GAME_LOGIN_REQ, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.equal(result.kind, 'world-enter');
  const codes = result.responses.map((r) => readMsg32Code(r.inner));
  const i206 = codes.indexOf(CODE_SS_GAME_LOGIN_OK);
  const i204 = codes.indexOf(CODE_SS_CHARACTER_ID);
  assert.ok(i206 >= 0, '0x0206 present in batch');
  assert.ok(i204 >= 0, '0x0204 present in batch');
  assert.ok(i206 < i204, `0x0206 (@${i206}) must precede 0x0204 (@${i204})`);
});

test('authoritative move updates cell and notifies both sessions', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 1, unitId: 1, cell: 2588, inWorld: true });
  world.seedPlayer({ connectionId: 2, characterId: 2, unitId: 2, cell: 100, inWorld: true });

  const moveInner = Buffer.alloc(10);
  moveInner.writeUInt16BE(0x0b01, 0);
  moveInner.writeUInt32LE(1, 2);
  moveInner.writeUInt32LE(2597, 6);

  const result = world.handleMoveCommand({ connectionId: 1, inner: moveInner });
  assert.equal(result.cell, 2597);
  assert.equal(world.getPlayer(1).cell, 2597);
  assert.equal(world.getPlayer(2).cell, 100); // observer unchanged
  assert.ok(result.recipients.includes(1));
  assert.ok(result.recipients.includes(2));
  assert.equal(readMsg32Code(result.notify), CODE_NOTIFY_MOVED_GRID);
  assert.equal(msg32Body(result.notify).readUInt32LE(0x14), 1);
  assert.equal(msg32Body(result.notify).readUInt32LE(0x18), 2597);
});

test('move rejects when not in world', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 1, unitId: 1, inWorld: false });
  const moveInner = Buffer.alloc(10);
  moveInner.writeUInt16BE(0x0b01, 0);
  moveInner.writeUInt32LE(1, 2);
  moveInner.writeUInt32LE(1, 6);
  assert.throws(() => world.handleMoveCommand({ connectionId: 1, inner: moveInner }), /not in world/);
});

test('chat broadcasts to dual in-world sessions', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 1, unitId: 1, inWorld: true });
  world.seedPlayer({ connectionId: 2, characterId: 2, unitId: 2, inWorld: true });
  const chatRaw = Buffer.alloc(2 + 0x8c);
  chatRaw.writeUInt16BE(0x0f1c, 0);
  chatRaw.writeUInt32LE(0, 2);
  chatRaw.writeUInt32LE(0, 6);
  chatRaw.writeUInt8(0, 10);
  chatRaw.writeUInt8(2, 11); // msgLen
  chatRaw.writeUInt16LE('O'.charCodeAt(0), 12);
  chatRaw.writeUInt16LE('K'.charCodeAt(0), 14);
  const result = world.handleChatCommand({ connectionId: 1, inner: chatRaw });
  assert.equal(result.text, 'OK');
  assert.deepEqual(result.recipients.sort(), [1, 2]);
});

test('shipped login-success path decodes keysetup 0x0031 and redirect 0x7001', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-login-'));
  const { writeFile } = await import('node:fs/promises');
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(accountsPath, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
  try {
    const result = runLoginSuccessPath({ accountsPath });
    assert.equal(result.ok, true);
    assert.equal(result.keysetupInnerCode, 0x0031);
    assert.equal(result.redirectInnerCode, 0x7001);
    const cred = parseGin7CredentialInner(SAMPLE_CREDENTIAL_INNER);
    assert.equal(result.account, cred.account);
    assert.ok(result.gin7KeyHex.length > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('full login→roster→world→move pipeline (shipped codecs) dual-session', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-pipe-'));
  try {
    const { writeFile } = await import('node:fs/promises');
    const accountsPath = join(dir, 'accounts.json');
    await writeFile(accountsPath, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
    const result = runLoginWorldMpSequence({
      storePath: join(dir, 'chars.json'),
      accountsPath,
      moveCell: 2600,
      dualSessions: true,
      seedCharacter: {
        power: 1,
        lastname: 'Fixture',
        firstname: 'One',
        face: 1,
        rank: 0x0d,
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.login.redirectInnerCode, 0x7001);
    assert.ok(result.worldEntryCodes.includes(0x0323));
    assert.ok(result.worldEntryCodes.includes(0x0325));
    assert.equal(result.move.cell, 2600);
    assert.ok(result.move.recipients.includes(2));
    assert.equal(result.move.notifyBytes, 0x244);
    const mover = result.players.find((p) => p.connectionId === 1);
    assert.equal(mover.cell, 2600);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
