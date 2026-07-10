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
  CODE_RESP_TIME,
  CODE_WORLD_INIT_OK,
  CODE_INFO_UNIT,
  CODE_NOTIFY_ENTER_GRID_BEGIN,
  CODE_NOTIFY_ENTER_GRID_END,
  CODE_GRID_INIT_OK,
  CODE_REQ_STATIC_GRID,
  buildWorldReadyPushInners,
  isAdmissionRequestCode,
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

test('enterWorld encodes real seed character from characterStore into 0x0323 (crash fix)', () => {
  // 전략맵 크래시 해소: 0x0323 이 빈 스텁이 아니라 characterStore 의 실 시드 캐릭터여야
  // 클라 오브젝트 테이블(clientBase+0xc)이 채워지고 focus lookup 이 성공한다.
  const characterStore = {
    getCharacters: (acct) =>
      acct === 'inei00'
        ? [{
            id: 7,
            power: 2,
            lastname: 'Reinhard',
            firstname: 'Lohengramm',
            face: 3,
            rank: 0x20,
            ability8: [90, 85, 80, 75, 70, 65, 60, 55],
          }]
        : [],
  };
  const world = createWorldSession({ characterStore });
  world.seedPlayer({ connectionId: 1, accountId: 'inei00', characterId: 7, unitId: 8, inWorld: false });
  const { emits } = world.enterWorld({ connectionId: 1, accountId: 'inei00' });
  const charRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  assert.ok(charRec, '0x0323 present');
  const body = msg32Body(charRec);
  // 정본 aligned BE: id@0x00 BE, power@0x04 u8.
  assert.equal(body.readUInt32BE(0x00), 7, 'real characterId from store');
  assert.equal(body.readUInt8(0x04), 2, 'real power/faction from store (not 0 stub)');
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

// ─── 월드 진입 후 어드미션 핸드셰이크 (NOW LOADING 해제) ────────────────────────
// 근거: docs/reference/restored-from-git/logh7-inworld-progress.md P27/P29 라이브 트레이스.
// 8종 월드레코드 수신 후 클라가 0x0304(2B, 페이로드 없음)를 보낸다. 이전엔
// handleWorldInner 가 라우팅 안 해 "알 수 없는 코드 0x0304" → NOW LOADING 영구 정지.

test('handleWorldInner routes admission 0x0304 → empty 0x0305 walker', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0304, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0304 must be routed (not null)');
  assert.equal(result.kind, 'admission');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0305);
  assert.deepEqual(result.responses[0].targets, [1]);
  assert.equal(result.responses[0].isMsg32, true);
});

test('handleWorldInner routes admission 0x0306 → 0x0307', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0306, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0306 must be routed');
  assert.equal(result.kind, 'admission');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0307);
});

test('handleWorldInner routes 0x0314 → 0x0315 first (fixed 5004B framing)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0314, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0314 must be routed');
  // 문서(logh7-render-interaction-contract L179): 고정 5004B [u8 w][u8 h][u16LE rle]...
  // reactive 0x0315 가 항상 첫 응답(뒤에 world-ready push 가 이어짐 — 아래 복원 테스트에서 전체 검증).
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0315);
  assert.equal(msg32Body(result.responses[0].inner).length, 0x138c);
});

test('handleWorldInner routes admission 0x0312 → 0x0313 (grid-type object table, count=0)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0312, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0312 must be routed');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0313);
  // 문서(L178): 고정 5004B; payload[0]=count. 실 섹터그리드 타입(플라스마 폭풍/공간/항행불능) = count 3.
  const body = msg32Body(result.responses[0].inner);
  assert.equal(body.length, 0x138c);
  assert.equal(body.readUInt8(0), 3, 'real sector grid-type palette (0..2 terrain labels)');
  // klass(byte @ 1+value*3 +1) 은 0(비클릭) — 팬텀 클릭 마커(klass 3) 금지.
  assert.equal(body.readUInt8(1 + 0 * 3 + 1), 0, 'grid-type value 0 is non-clickable (klass 0)');
});

test('handleWorldInner admission works with message32-framed request too', () => {
  // 클라 재구성 경로: message32 [u32LE 0][u16BE code][body]
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(6);
  req.writeUInt32LE(0, 0);
  req.writeUInt16BE(0x0304, 4);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0305);
});

// ─── static-info 완주 후 월드-init 핸드셰이크 (0x0300 / 0x0f00) ────────────────
// 근거: docs/reference/restored-from-git/logh7-inworld-progress.md P28/P30 라이브 트레이스
// (static-info 완주 후 0x0308→0x0309, 0x030c→0x030d, 0x0300→0x0301, 0x0f00→0x0f01, 0x0f02 push;
//  strategic HUD 도달). 이전엔 0x0300 이 handleWorldInner 분기 없음 → lobby 로 새어 "알 수 없는
//  코드" → 클라가 0x0301 응답 무한 대기(NOW LOADING 정지).

test('handleWorldInner routes 0x0300 RequestResponseTime → 0x0301 ResponseTime', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0300, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0300 must be routed (not null — else it leaks to lobby)');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), CODE_RESP_TIME);
  // 0x0301 body = 4B LE start time (buildResponseTimeInner 재사용)
  assert.equal(msg32Body(result.responses[0].inner).length, 4);
  assert.deepEqual(result.responses[0].targets, [1]);
  assert.equal(result.responses[0].isMsg32, true);
});

test('handleWorldInner routes 0x0300 when message32-framed too', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(6);
  req.writeUInt32LE(0, 0);
  req.writeUInt16BE(0x0300, 4);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result);
  assert.equal(readMsg32Code(result.responses[0].inner), CODE_RESP_TIME);
});

test('isAdmissionRequestCode(0x0300) is true so playable-server routes it to world (not lobby)', () => {
  assert.equal(isAdmissionRequestCode(0x0300), true);
});

test('handleWorldInner routes 0x0f00 RequestWorldInitialize → 0x0f01 WorldInitialize OK (status=1)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f00, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0f00 must be routed');
  assert.equal(readMsg32Code(result.responses[0].inner), CODE_WORLD_INIT_OK);
  // WORLD_OK_STATUS_CODES: status=1 필수 (client+0x35f356)
  assert.equal(msg32Body(result.responses[0].inner).readUInt8(0), 1);
});

test('isAdmissionRequestCode(0x0f00) is true (world-init handshake routes to world)', () => {
  assert.equal(isAdmissionRequestCode(0x0f00), true);
});

// ─── 0x0f02 RequestGridInitialize → plain 0x0f03 (스폰 push 는 0x0314 로 복원) ─────
// 회귀 복원(2cc17beb): world-ready 스폰 push 는 0x0f02 가 아니라 0x0314 에서 방출한다.
// e5d825e8 이 push 를 0x0f02 로 이동하자 클라가 0x0314 에서 0x0f03 을 못 받아 0x0f02 를 아예
// 보내지 않고 정지했다(회귀). 이동을 되돌려 0x0f02 는 순수 ack(plain 0x0f03)만 돌려준다.

test('handleWorldInner 0x0f02 returns plain 0x0f03 (spawn push restored to 0x0314)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f02, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0f02 must be routed (not null — else it leaks to lobby, NOW LOADING stall)');
  assert.equal(result.kind, 'admission');
  assert.equal(result.responses.length, 1, '0x0f02 emits only the ack (no spawn burst)');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0f03);
  assert.equal(msg32Body(result.responses[0].inner).readUInt8(0), 1, '0x0f03 status=1');
});

test('handleWorldInner 0x0f02 without in-world player also returns plain 0x0f03', () => {
  const world = createWorldSession();
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f02, 0);
  const result = world.handleWorldInner({ connectionId: 9, accountId: 'z', inner: req });
  assert.ok(result, '0x0f02 still routed even without player');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0f03);
});

test('handleWorldInner routes 0x0f02 when message32-framed too', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
  const req = Buffer.alloc(6);
  req.writeUInt32LE(0, 0);
  req.writeUInt16BE(0x0f02, 4);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0f03, '0x0f02 → plain 0x0f03');
});

test('isAdmissionRequestCode(0x0f02) is true so playable-server routes it to world (not lobby)', () => {
  assert.equal(isAdmissionRequestCode(0x0f02), true);
});

test('handleWorldInner still returns null for a genuinely unknown code', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x7abc, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.equal(result, null);
});

test('reconnect: enterWorld on a new connectionId rebinds session player by account', () => {
  // 실클라는 월드 진입 시 로비 소켓(conn2)을 닫고 새 소켓(conn3)으로 재접속한다.
  // handleSessionLogin 은 플레이어를 conn2 에 등록했지만 enterWorld 는 conn3 에서 온다.
  // account 기준으로 세션 플레이어를 찾아 현재 connectionId 로 재바인딩해야 한다.
  const world = createWorldSession();
  const req = Buffer.alloc(10);
  req.writeUInt16BE(0x2009, 0);
  req.writeUInt32LE(1, 2);
  req.writeUInt32LE(7, 6);
  world.handleSessionLogin({
    connectionId: 2,
    accountId: 'inei00',
    inner: req,
    character: { id: 7, unitId: 3, cell: 2588 },
  });
  // conn2 는 닫혔고 conn3 으로 0x0205/enterWorld 도착 — account 로 재바인딩
  const req205 = Buffer.alloc(2);
  req205.writeUInt16BE(CODE_SS_GAME_LOGIN_REQ, 0);
  const result = world.handleWorldInner({ connectionId: 3, accountId: 'inei00', inner: req205 });
  assert.equal(result.kind, 'world-enter');
  assert.equal(result.player.connectionId, 3);
  assert.equal(result.player.characterId, 7);
  assert.equal(result.player.inWorld, true);
  // 플레이어 맵도 conn3 으로 이동, conn2 는 비워짐
  assert.equal(world.getPlayer(3)?.characterId, 7);
  assert.equal(world.getPlayer(2), null);
});

test('reconnect guard: unknown account on new connection still refuses synthetic character', () => {
  const world = createWorldSession();
  const req = Buffer.alloc(10);
  req.writeUInt16BE(0x2009, 0);
  req.writeUInt32LE(1, 2);
  req.writeUInt32LE(7, 6);
  world.handleSessionLogin({
    connectionId: 2,
    accountId: 'inei00',
    inner: req,
    character: { id: 7, unitId: 3, cell: 2588 },
  });
  // 미상 account 의 새 연결은 재바인딩 대상 없음 → 예외 유지
  assert.throws(
    () => world.enterWorld({ connectionId: 9, accountId: 'ghost99' }),
    /no session player/,
  );
  // account 자체가 미상(null)이면 여전히 거부
  assert.throws(
    () => world.enterWorld({ connectionId: 9 }),
    /no session player/,
  );
});

test('reconnect guard: create-pending account cannot enter world on rebind', () => {
  // account 는 알지만 실제 캐릭터 없이 create-pending 만 등록된 경우 월드 진입 거부.
  const world = createWorldSession();
  const short = Buffer.alloc(4);
  short.writeUInt16BE(0x2009, 0);
  short.writeUInt16LE(1, 2);
  world.handleSessionLogin({
    connectionId: 2,
    accountId: 'inei00',
    inner: short,
    character: null,
  });
  assert.throws(
    () => world.enterWorld({ connectionId: 3, accountId: 'inei00' }),
    /create-pending/,
  );
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

// ─── 월드-ready push 시퀀스 (NOW LOADING 해제) ─────────────────────────────────
// 근거: docs/logh7-loop-state.md "M3 블로커 해법 발견: 서버가 world-ready 시퀀스를 PUSH해야"
//   + docs/reference/restored-from-git/logh7-live-world-entry-2026-06-23.md:9 성공 트레이스
//   + docs/reference/legacy-evidence/logh7-render-interaction-contract.md:102 grid-enter 계약.
// 클라가 0x0304/0x0306/0x0314 3요청 후 NOW LOADING 에서 정지 → 서버가 그리드진입+월드초기화를
// 능동 push 해야 해제. 계약(render-contract L102): "0x0b09/0x0b0a grid-enter begin/end,
//   with 0x0325/0x0323 refreshed between begin/end". 즉 0x0325(유닛)와 0x0323(캐릭터 refresh)는
//   반드시 begin/end 괄호 **사이**에 온다 — 유닛/오브젝트 테이블 갱신이 begin/end 안에서 일어나야
//   그리드가 플레이어 유닛을 배치. 클라 0x0314(→0x0315) 직후 순서:
//   0x0b09(begin) → 0x0325(유닛) + 0x0323(캐릭터 refresh) → 0x0b0a(end, 렌더 트리거) → 0x0f03(GridInit OK).
// 순서 엄수: 0x0f03(월드초기화)는 반드시 0x0b0a 이후 (render-contract: 조기 push 크래시).

test('buildWorldReadyPushInners pushes 0x0325×1 + 0x0323×1 inside 0x0b09/0x0b0a with flagship↔unit alignment', () => {
  // M3 수정 확정(docs/logh7-loop-state.md "0x0323 flagship(+0x24)=0x0325 unit id(+0x04) 정합"):
  // 클라 FUN_004c2a80 는 선택 char 의 flagship(+0x24)을 unit id(+0x04)와 링크해 플레이어 오브젝트를
  // 빌드한다. 링크가 성립하면 오브젝트 테이블(clientBase+0xc)이 채워져 NOW LOADING 이 해제된다.
  // 이전 P7 ×2 재전송은 정합이 아니라 타이밍 추측이었고 중복 스텁을 만든다 — 각 레코드 정확히 1회로
  // 되돌리되 정합(flagship==unit id)과 count≥1 을 계약으로 고정한다.
  const inners = buildWorldReadyPushInners({ unitId: 8, unitCell: 2588, commander: 5 });
  const codes = inners.map((i) => readMsg32Code(i));
  // 계약 순서(render-contract L102): begin → 0x0325(유닛) + 0x0323(캐릭터) → end → grid-init OK.
  assert.deepEqual(codes, [
    CODE_NOTIFY_ENTER_GRID_BEGIN,
    CODE_INFO_UNIT,
    CODE_INFO_CHARACTER,
    CODE_NOTIFY_ENTER_GRID_END,
    CODE_GRID_INIT_OK,
  ]);
  const iBegin = codes.indexOf(CODE_NOTIFY_ENTER_GRID_BEGIN);
  const iEnd = codes.indexOf(CODE_NOTIFY_ENTER_GRID_END);
  const iInit = codes.indexOf(CODE_GRID_INIT_OK);
  // 각 정확히 1회 (×2 아님 — 중복 스텁 방지)
  assert.equal(codes.filter((c) => c === CODE_INFO_UNIT).length, 1, '0x0325 exactly once');
  assert.equal(codes.filter((c) => c === CODE_INFO_CHARACTER).length, 1, '0x0323 exactly once');
  for (let i = 0; i < codes.length; i += 1) {
    if (codes[i] === CODE_INFO_UNIT || codes[i] === CODE_INFO_CHARACTER) {
      assert.ok(i > iBegin && i < iEnd, `refresh @${i} must sit between begin/end`);
    }
  }
  assert.ok(iInit > iEnd, '0x0f03 world-init must come AFTER 0x0b0a (early push crashes)');
  // ★정합(정본 aligned BE): 0x0323 flagship(body+0x24 BE) == 0x0325 unit[0].id(body+0x04 BE) AND count≥1.
  const unitRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  const charRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_CHARACTER);
  const unitBody = msg32Body(unitRec);
  const charBody = msg32Body(charRec);
  assert.ok(unitBody.readUInt16BE(0x00) >= 1, '0x0325 count ≥ 1 (unit array non-empty)');
  assert.equal(unitBody.readUInt32BE(0x04), 8, 'unit[0].id(+0x04 BE) = real fleet id');
  assert.equal(
    charBody.readUInt32BE(0x24),
    unitBody.readUInt32BE(0x04),
    'char flagship(+0x24 BE) must equal unit[0].id(+0x04 BE) — client char→flagship→unit link',
  );
});

test('buildWorldReadyPushInners without commander still pushes 0x0325×1 (no char record)', () => {
  const inners = buildWorldReadyPushInners({ unitId: 8, unitCell: 2588, commander: 0 });
  const codes = inners.map((i) => readMsg32Code(i));
  assert.equal(codes.filter((c) => c === CODE_INFO_UNIT).length, 1, '0x0325 exactly once w/o commander');
  assert.equal(codes.filter((c) => c === CODE_INFO_CHARACTER).length, 0, '0x0323 requires commander>0');
});

test('buildWorldReadyPushInners early-grid (LOGH_STRAT_GRID_EARLY) prepends real 0x0313 before begin', () => {
  const inners = buildWorldReadyPushInners({ unitId: 8, commander: 5, includeEarlyGridType: true });
  const codes = inners.map((i) => readMsg32Code(i));
  assert.equal(codes[0], 0x0313, 'early 0x0313 grid-type comes first (before 0x0b09)');
  assert.ok(codes.indexOf(0x0313) < codes.indexOf(CODE_NOTIFY_ENTER_GRID_BEGIN), 'grid-type before begin');
  const gridType = inners[0];
  assert.equal(msg32Body(gridType).length, 0x138c);
  assert.ok(msg32Body(gridType).readUInt8(0) > 0, 'early grid-type carries real palette (count>0)');
});

test('buildWorldReadyPushInners requires a real unitId (no synthetic id)', () => {
  assert.throws(() => buildWorldReadyPushInners({ unitId: 0 }));
});

// 0x0315 RLE body(고정 5004B: [u8 w][u8 h][u16LE rleLen][(runLen,cellType)…])를 5000셀 배열로 디코드.
function decodeStaticGrid(body) {
  const w = body.readUInt8(0);
  const h = body.readUInt8(1);
  const rleLen = body.readUInt16LE(2);
  const cells = [];
  let off = 4;
  const end = 4 + rleLen;
  while (off + 1 < end && cells.length < w * h) {
    const run = body.readUInt8(off);
    const value = body.readUInt8(off + 1);
    off += 2;
    for (let i = 0; i < run; i += 1) cells.push(value);
  }
  return { w, h, cells };
}

test('handleWorldInner 0x0314 restores world-ready push (2cc17beb) with player-fleet cell in 0x0315', () => {
  // 회귀 복원: e5d825e8 이 push 를 0x0f02 로 옮겨 0x0314 가 bare 0x0315 만 돌려주자 클라가 0x0f02 를
  // 안 보내고 정지했다. push 를 0x0314 로 되돌려 진행을 복원 + reactive 0x0315 에 플레이어 함대 cell 배치.
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(CODE_REQ_STATIC_GRID, 0); // 0x0314
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0314 must be routed');
  assert.equal(result.kind, 'admission-world-ready');
  const codes = result.responses.map((r) => readMsg32Code(r.inner));
  // reactive 0x0315(플레이어 cell) → begin → 0x0325 유닛 → 0x0323 캐릭터 → end → 0x0f03.
  assert.deepEqual(codes, [
    0x0315,
    CODE_NOTIFY_ENTER_GRID_BEGIN,
    CODE_INFO_UNIT,
    CODE_INFO_CHARACTER,
    CODE_NOTIFY_ENTER_GRID_END,
    CODE_GRID_INIT_OK,
  ], 'world-ready push restored at 0x0314 (0x0f03 present so client advances to 0x0f02)');
  // ★그리드 cell 비어있지 않음: 플레이어 함대 cell(2588 → col 88,row 25)이 SPACE(1)로 배치.
  const gridBody = msg32Body(result.responses[0].inner);
  assert.equal(gridBody.length, 0x138c);
  const grid = decodeStaticGrid(gridBody);
  assert.equal(grid.cells.length, 5000, 'ΣrunLen == 100*50 (full coverage, no crash)');
  assert.equal(grid.cells[2588], 1, 'player fleet cell placed = SPACE(1), not empty board');
  assert.equal(grid.cells.filter((v) => v !== 0).length, 1, 'exactly one placed cell');
  for (const r of result.responses) {
    assert.deepEqual(r.targets, [1]);
    assert.equal(r.isMsg32, true);
  }
});

test('handleWorldInner 0x0314 without in-world player falls back to bare empty 0x0315 (no crash)', () => {
  const world = createWorldSession();
  const req = Buffer.alloc(2);
  req.writeUInt16BE(CODE_REQ_STATIC_GRID, 0);
  const result = world.handleWorldInner({ connectionId: 9, accountId: 'z', inner: req });
  assert.ok(result, '0x0314 still routed even without player');
  const codes = result.responses.map((r) => readMsg32Code(r.inner));
  assert.deepEqual(codes, [0x0315], 'no player → bare reactive 0x0315 only');
  const grid = decodeStaticGrid(msg32Body(result.responses[0].inner));
  assert.equal(grid.cells.filter((v) => v !== 0).length, 0, 'empty board fallback');
});
