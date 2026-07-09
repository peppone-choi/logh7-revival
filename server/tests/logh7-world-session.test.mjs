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
  assert.equal(body.readUInt32LE(0x00), 7, 'real characterId from store');
  assert.equal(body.readUInt8(0x04), 2, 'real power/faction from store (not 0 stub)');
  assert.equal(body.readUInt16LE(0x188), 90, 'real ability[0] from store');
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

test('handleWorldInner routes admission 0x0314 → 0x0315 (empty static grid)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0314, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0314 must be routed');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0315);
  // 문서(logh7-render-interaction-contract L179): 고정 5004B [u8 w][u8 h][u16BE rle]...
  // 비-empty 0x0315 는 world-init walk 를 멈춘다(P1) → 어드미션 재요청엔 empty grid.
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
  // 문서(L178): 고정 5004B; payload[0]=count. empty = count 0.
  const body = msg32Body(result.responses[0].inner);
  assert.equal(body.length, 0x138c);
  assert.equal(body.readUInt8(0), 0);
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

// ─── 0x0f02 → 0x0f03 (GridInitialize) ─────────────────────────────────────────
// 라이브 정정: 문서는 0x0f02 를 서버 push 로 기술했으나 실측상 클라가 0x0f02 를
// 요청으로 보낸다. 근거:
//   docs/logh7-loop-state.md P28/P30: static-info→0x0300→0x0f00→0x0f02(→0x0f03)→…
//   docs/reference/restored-from-git/logh7-inworld-progress.md L869 "0x0f02 fell back
//     to a plain 0x0f03", L716 "0x0f02 plus 0x0204/0x0325/0x0323/0x0f03".
// 응답은 기존 빌더 buildGridInitOkInner (status=1, WORLD_OK_STATUS_CODES, client+0x35f357).
// 페이로드는 최소(plain 0x0f03) — 조기 rich 0x0f02 주입은 회귀 위험(render-contract L27/L124).

test('handleWorldInner routes 0x0f02 RequestGridInitialize → 0x0f03 GridInitialize OK (status=1)', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(2);
  req.writeUInt16BE(0x0f02, 0);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result, '0x0f02 must be routed (not null — else it leaks to lobby, NOW LOADING stall)');
  assert.equal(result.kind, 'admission');
  assert.equal(result.responses.length, 1);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0f03);
  // plain 0x0f03: status=1 (WORLD_OK_STATUS_CODES 필수), 1B body
  assert.equal(msg32Body(result.responses[0].inner).length, 1);
  assert.equal(msg32Body(result.responses[0].inner).readUInt8(0), 1);
  assert.deepEqual(result.responses[0].targets, [1]);
  assert.equal(result.responses[0].isMsg32, true);
});

test('handleWorldInner routes 0x0f02 when message32-framed too', () => {
  const world = createWorldSession();
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: true });
  const req = Buffer.alloc(6);
  req.writeUInt32LE(0, 0);
  req.writeUInt16BE(0x0f02, 4);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'a', inner: req });
  assert.ok(result);
  assert.equal(readMsg32Code(result.responses[0].inner), 0x0f03);
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
