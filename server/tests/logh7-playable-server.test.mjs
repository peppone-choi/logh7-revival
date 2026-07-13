import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

import { createPlayableServer } from '../src/server/logh7-playable-server.mjs';
import {
  encryptBuffer,
  decryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from '../src/server/logh7-child-codec.mjs';
import { buildTransportFrame, createFrameStreamParser } from '../src/server/logh7-frame-stream.mjs';
import { build0030Body, parse0030Body, readInnerCode } from '../src/server/logh7-envelope-0030.mjs';
import { createCharacterStore } from '../src/server/logh7-character-store.mjs';

const TRANSPORT_KEY = Buffer.from('7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d', 'hex');
const DECIPHER_KEY = Buffer.from('5859', 'hex');
const CREDENTIAL_INNER = Buffer.from(
  '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000',
  'hex',
);

function fold16(value) {
  return ((value >>> 16) ^ value) & 0xffff;
}
function checksum(data) {
  let value = 0;
  let offset = 0;
  for (; offset + 4 <= data.length; offset += 4) value = (value ^ data.readUInt32LE(offset)) >>> 0;
  for (; offset < data.length; offset += 1) value = (value ^ data[offset]) >>> 0;
  return fold16(value);
}
function pad8(data) {
  const n = data.length % 8 === 0 ? data.length : data.length + (8 - (data.length % 8));
  const out = Buffer.alloc(n);
  data.copy(out);
  return out;
}

function buildPhase1Frame({ phase1Key, sequence, tables }) {
  const body = Buffer.alloc(2 + phase1Key.length + 4);
  body.writeUInt16BE(phase1Key.length, 0);
  phase1Key.copy(body, 2);
  body.writeUInt32BE(sequence, 2 + phase1Key.length);
  const decoded = Buffer.alloc(body.length + 2);
  decoded.writeUInt16BE(checksum(body), 0);
  body.copy(decoded, 2);
  return buildTransportFrame(0x0034, encryptBuffer(pad8(decoded), expandChildCodecKey(TRANSPORT_KEY, tables)));
}

function build0030Transport({ phase1Key, id, inner, tables }) {
  const body = build0030Body({ id, inner });
  return buildTransportFrame(
    0x0030,
    encryptBuffer(pad8(body), expandChildCodecKey(phase1Key, tables)),
  );
}

async function readFrames(socket, count, timeoutMs = 3000) {
  const parser = createFrameStreamParser();
  const collected = [];
  const deadline = Date.now() + timeoutMs;
  while (collected.length < count) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`timeout waiting for ${count} frames, got ${collected.length}`);
    const chunk = await Promise.race([
      once(socket, 'data').then(([c]) => c),
      new Promise((_, rej) => setTimeout(() => rej(new Error('socket data timeout')), remaining)),
    ]);
    collected.push(...parser.push(chunk));
  }
  return collected;
}

test('playable server: handshake + GIN7 login returns keysetup+redirect', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-ps-'));
  const tables = loadChildCodecTables();
  const store = createCharacterStore(join(dir, 'chars.json'));
  const server = createPlayableServer({
    port: 0,
    host: '127.0.0.1',
    tracePath: join(dir, 'trace.jsonl'),
    characterStore: store,
    tables,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
  });
  await server.listen();
  const { port } = server.address();
  try {
    const socket = net.connect({ host: '127.0.0.1', port });
    await once(socket, 'connect');
    const phase1Key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    socket.write(buildPhase1Frame({ phase1Key, sequence: 1, tables }));
    const [phase3] = await readFrames(socket, 1);
    assert.equal(phase3.code, 0x0035);

    socket.write(build0030Transport({
      phase1Key,
      id: 1,
      inner: CREDENTIAL_INNER,
      tables,
    }));
    const replies = await readFrames(socket, 2);
    assert.equal(replies.length, 2);
    // decrypt keysetup with decipherKey
    const ksBody = decryptBuffer(replies[0].body, expandChildCodecKey(DECIPHER_KEY, tables));
    const ksParsed = parse0030Body(ksBody);
    assert.equal(readInnerCode(ksParsed.inner), 0x0031);
    socket.end();
    await once(socket, 'close');
    const traceLines = (await readFile(join(dir, 'trace.jsonl'), 'utf8'))
      .trim().split('\n').map((line) => JSON.parse(line));
    const loginSent = traceLines.find((line) => line.event === 'login-response-sent');
    assert.equal(loginSent.gin7KeyHex, undefined);
    assert.equal(loginSent.gin7KeyRedacted, true);
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable server rejects a fresh connection that sends 0x2000 without authenticated handoff', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-ps-auth-'));
  const tracePath = join(dir, 'trace.jsonl');
  const server = createPlayableServer({
    port: 0,
    host: '127.0.0.1',
    tracePath,
    tables: loadChildCodecTables(),
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
  });
  let socket = null;
  try {
    await server.listen();
    socket = net.connect(server.address());
    await once(socket, 'connect');
    const phase1Key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    socket.write(buildPhase1Frame({ phase1Key, sequence: 1, tables: loadChildCodecTables() }));
    await readFrames(socket, 1);
    const lobbyLogin = Buffer.from(
      '200047494e3700040000070069006e00650069003000300000',
      'hex',
    );
    socket.write(build0030Transport({
      phase1Key,
      id: 1,
      inner: lobbyLogin,
      tables: loadChildCodecTables(),
    }));
    await once(socket, 'close');
    const lines = (await readFile(tracePath, 'utf8'))
      .trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines.some((line) => line.event === 'auth-required' && line.innerCodeHex === '0x2000'), true);
    assert.equal(lines.some((line) => line.event === 'lobby-login-ok-sent'), false);
  } finally {
    socket?.destroy();
    await server.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable server refuses a public bind without an explicit accounts file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-ps-public-'));
  try {
    assert.throws(
      () => createPlayableServer({
        port: 0,
        host: '0.0.0.0',
        accountsPath: join(dir, 'missing-accounts.json'),
      }),
      /accounts file required/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable server refuses known development credentials on a public bind', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-ps-public-dev-'));
  const accountsPath = join(dir, 'accounts.json');
  await writeFile(accountsPath, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'dummy' }] }), 'utf8');
  try {
    assert.throws(
      () => createPlayableServer({ port: 0, host: '0.0.0.0', accountsPath }),
      /known development credentials/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable server disables stock handoff on a public bind without an explicit opt-in', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-ps-public-handoff-'));
  const accountsPath = join(dir, 'accounts.json');
  const tracePath = join(dir, 'trace.jsonl');
  await writeFile(accountsPath, JSON.stringify({ accounts: [{ accountId: 'inei00', password: 'strong-password' }] }), 'utf8');
  const server = createPlayableServer({
    port: 0,
    host: '0.0.0.0',
    accountsPath,
    tracePath,
    tables: loadChildCodecTables(),
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
  });
  let socket = null;
  try {
    await server.listen();
    socket = net.connect({ host: '127.0.0.1', port: server.address().port });
    await once(socket, 'connect');
    const phase1Key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    socket.write(buildPhase1Frame({ phase1Key, sequence: 1, tables: loadChildCodecTables() }));
    await readFrames(socket, 1);
    socket.write(build0030Transport({
      phase1Key,
      id: 1,
      inner: Buffer.from('020047494e370057', 'hex'),
      tables: loadChildCodecTables(),
    }));
    await once(socket, 'close');
    const traceLines = (await readFile(tracePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(traceLines.some((line) => line.event === 'auth-required' && line.innerCodeHex === '0x0200'), true);
    assert.equal(traceLines.some((line) => line.event === 'ss-login-ok-sent'), false);
  } finally {
    socket?.destroy();
    await server.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable server preserves the authenticated account across the stock three-connection handoff', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-ps-handoff-'));
  const tables = loadChildCodecTables();
  const store = createCharacterStore(join(dir, 'chars.json'));
  store.addCharacter('inei00', { power: 1, lastname: 'Test', firstname: 'Pilot', face: 1, rank: 0x0d });
  const server = createPlayableServer({
    port: 0,
    host: '127.0.0.1',
    tracePath: join(dir, 'trace.jsonl'),
    characterStore: store,
    tables,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
  });
  const sockets = [];
  const connectAndPhase = async (phase1Key, sequence) => {
    const socket = net.connect(server.address());
    sockets.push(socket);
    await once(socket, 'connect');
    socket.write(buildPhase1Frame({ phase1Key, sequence, tables }));
    await readFrames(socket, 1);
    return socket;
  };
  try {
    await server.listen();
    const phase1Key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const first = await connectAndPhase(phase1Key, 1);
    first.write(build0030Transport({ phase1Key, id: 1, inner: CREDENTIAL_INNER, tables }));
    await readFrames(first, 2);
    first.end();
    await once(first, 'close');

    const lobbyLogin = Buffer.from(
      '200047494e3700040000070069006e00650069003000300000',
      'hex',
    );
    const second = await connectAndPhase(phase1Key, 2);
    second.write(build0030Transport({ phase1Key, id: 2, inner: lobbyLogin, tables }));
    const [lobbyFrame] = await readFrames(second, 1);
    const lobbyBody = decryptBuffer(lobbyFrame.body.subarray(4), expandChildCodecKey(DECIPHER_KEY, tables));
    assert.equal(parse0030Body(lobbyBody).inner.readUInt16BE(4), 0x2001);
    const sessionReq = Buffer.alloc(10);
    sessionReq.writeUInt16BE(0x2009, 0);
    sessionReq.writeUInt32LE(1, 2);
    sessionReq.writeUInt32LE(1, 6);
    second.write(build0030Transport({ phase1Key, id: 3, inner: sessionReq, tables }));
    await readFrames(second, 1);
    second.end();
    await once(second, 'close');

    const third = await connectAndPhase(phase1Key, 3);
    third.write(build0030Transport({ phase1Key, id: 3, inner: Buffer.from('020047494e370057', 'hex'), tables }));
    const [ssOk] = await readFrames(third, 1);
    const ssBody = decryptBuffer(ssOk.body.subarray(4), expandChildCodecKey(DECIPHER_KEY, tables));
    assert.equal(parse0030Body(ssBody).inner.readUInt16BE(4), 0x0201);
    const worldReq = Buffer.alloc(2);
    worldReq.writeUInt16BE(0x0205, 0);
    third.write(build0030Transport({ phase1Key, id: 4, inner: worldReq, tables }));
    const worldFrames = await readFrames(third, 4, 4000);
    assert.equal(worldFrames.length, 4);
    third.end();
    await once(third, 'close');
  } finally {
    for (const socket of sockets) socket.destroy();
    await server.close().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable server boots twice and serves login+world+move sequence', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-ps2-'));
  const tables = loadChildCodecTables();
  const results = [];

  for (let boot = 1; boot <= 2; boot += 1) {
    const store = createCharacterStore(join(dir, `chars-${boot}.json`));
    store.addCharacter('inei00', {
      power: 1,
      lastname: 'Test',
      firstname: 'Pilot',
      face: 1,
      rank: 0x0d,
    });
    const server = createPlayableServer({
      port: 0,
      host: '127.0.0.1',
      tracePath: join(dir, `trace-${boot}.jsonl`),
      characterStore: store,
      tables,
      transportKey: TRANSPORT_KEY,
      decipherKey: DECIPHER_KEY,
    });
    await server.listen();
    const { port } = server.address();
    const socket = net.connect({ host: '127.0.0.1', port });
    // ★어서션 실패 시에도 서버/소켓을 반드시 닫는다 — 미정리 시 리스너 핸들이 남아
    //   node --test 자식 프로세스가 영원히 종료하지 않는다(스위트 행/좀비 러너의 원인).
    t.after(() => { socket.destroy(); return server.close().catch(() => {}); });
    await once(socket, 'connect');
    const phase1Key = Buffer.from('11223344556677889900aabbccddeeff', 'hex');
    socket.write(buildPhase1Frame({ phase1Key, sequence: boot, tables }));
    await readFrames(socket, 1);

    // login credential
    socket.write(build0030Transport({ phase1Key, id: 1, inner: CREDENTIAL_INNER, tables }));
    const loginReplies = await readFrames(socket, 2);
    assert.equal(loginReplies.length, 2);

    // lobby login 0x2000 (minimal GIN7 v4 LE account "inei00")
    // [u16BE 0x2000][GIN7][u16BE ver=4][u16BE flags=0][u16LE units=7][UTF16LE inei00\0]
    const lobbyLogin = Buffer.from(
      '200047494e3700040000070069006e00650069003000300000',
      'hex',
    );
    socket.write(build0030Transport({ phase1Key, id: 2, inner: lobbyLogin, tables }));
    const lobbyOkFrames = await readFrames(socket, 1);
    const lobbyBody = decryptBuffer(lobbyOkFrames[0].body.subarray(4), expandChildCodecKey(DECIPHER_KEY, tables));
    const lobbyParsed = parse0030Body(lobbyBody);
    // Server sends message32 format: [u32LE 0][u16BE 0x2001][status+pad]
    assert.equal(lobbyParsed.inner.readUInt16BE(4), 0x2001);

    // session login 0x2009 → 0x200a 리다이렉트만 (월드 진입은 0x200 GameLogin 에서).
    // RE 확정: 0x2009 인라인 월드 푸시는 씬 전환을 유발 못 함. 클라는 0x200a 후
    // 같은 소켓으로 0x200 GameLogin 을 보내고, 그 응답 0x201 이 씬 게이트다.
    const sessionReq = Buffer.alloc(10);
    sessionReq.writeUInt16BE(0x2009, 0);
    sessionReq.writeUInt32LE(1, 2);
    sessionReq.writeUInt32LE(1, 6);
    socket.write(build0030Transport({ phase1Key, id: 3, inner: sessionReq, tables }));
    const redirectFrames = await readFrames(socket, 1, 4000);
    const decodeInnerCode = (fr) => {
      const body = decryptBuffer(fr.body.subarray(4), expandChildCodecKey(DECIPHER_KEY, tables));
      const parsed = parse0030Body(body);
      if (parsed.inner.length >= 6 && parsed.inner.readUInt32LE(0) === 0) {
        return parsed.inner.readUInt16BE(4);
      }
      return readInnerCode(parsed.inner);
    };
    assert.equal(decodeInnerCode(redirectFrames[0]), 0x200a, `boot ${boot} expected 0x200a redirect only`);

    // 0x200 GameLogin (SS 게임로그인): 응답은 0x201 SSLoginOK 하나뿐 (씬 FSM 게이트).
    // 월드레코드는 클라가 이어 보내는 0x205 SSGameLoginRequest 응답에서 흐른다 (RE 재조정).
    // inner: [u16BE 0x0200]["GIN7"][u16 0x0057 'W'] (RE: LG 로그인과 동일 포맷; 핸들러는 코드만 소비)
    const gameLogin = Buffer.from('020047494e370057', 'hex');
    socket.write(build0030Transport({ phase1Key, id: 4, inner: gameLogin, tables }));
    const loginOkFrames = await readFrames(socket, 1, 4000);
    assert.equal(decodeInnerCode(loginOkFrames[0]), 0x0201, `boot ${boot} 0x201 SSLoginOK only`);

    // 0x205 SSGameLoginRequest → 0x206 SSGameLoginOK(0x35837e) + unsolicited 테이블 채움 4종.
    // ★0x206 이 0x204·나머지 레코드보다 먼저 (recv 필터: 0x206 미세팅 시 0x204 드롭+0x205 재트리거).
    //
    // ★send-ring reactive화 (docs/logh7-loop-state.md "M3 정지 확정: request-response send-ring
    // 상관 실패"): 실클라 로더는 엄격한 요청-응답 send-ring 파이프라인 — 요청 1개 송신 →
    // 매칭 응답이 ring 엔트리 pop → 다음 요청. 예전 배치는 0x0301/0x0f01/0x0f03/0x0315 를 클라가
    // 요청하기 전에 pre-push 해 ring 이 안 비워지고 로더가 NOW LOADING 에서 정지했다. 이제
    // world-enter 배치는 unsolicited 4종(0x0206/0x0204/0x0323/0x0325)만 push 하고,
    // 요청-응답 4종은 클라 후속 요청에 reactive 로 응답한다(아래 send-ring 검증).
    const gameLoginReq = Buffer.alloc(2);
    gameLoginReq.writeUInt16BE(0x0205, 0);
    socket.write(build0030Transport({ phase1Key, id: 5, inner: gameLoginReq, tables }));
    // expect: world emits (0x206/0x204/0x323/0x325) = 4 (pre-push 요청-응답 코드 제거)
    const worldFrames = await readFrames(socket, 4, 8000);
    assert.ok(worldFrames.length >= 4, `boot ${boot} world frames ${worldFrames.length}`);

    const decodedCodes = worldFrames.map(decodeInnerCode);
    const idx206 = decodedCodes.indexOf(0x0206);
    const idx204 = decodedCodes.indexOf(0x0204);
    const idx323 = decodedCodes.indexOf(0x0323);
    // ★월드 파이프라인 게이트: 0x206 SSGameLoginOK 가 첫 프레임, 0x204·레코드보다 먼저
    assert.equal(idx206, 0, `boot ${boot} 0x206 must be first: ${decodedCodes.map((c) => c.toString(16))}`);
    assert.ok(idx204 > idx206, `boot ${boot} 0x204 after 0x206`);
    assert.ok(idx323 > idx206, `boot ${boot} world records after 0x206`);
    assert.ok(decodedCodes.includes(0x0325), `boot ${boot} missing 0x0325`);
    // 요청-응답 코드는 배치에 pre-push 되면 안 된다 (ring 미배수 → 정지)
    for (const banned of [0x0301, 0x0f01, 0x0f03, 0x0315]) {
      assert.ok(
        !decodedCodes.includes(banned),
        `boot ${boot} world-enter must not pre-push 0x${banned.toString(16)}`,
      );
    }

    // 어드미션 핸드셰이크: 월드 진입 후 클라가 0x0304(2B, 페이로드 없음)를 보낸다.
    // 서버가 0x0305 를 안 주면 클라는 NOW LOADING 에서 정지. 전체 트랜스포트 경유로 검증.
    const admissionReq = Buffer.alloc(2);
    admissionReq.writeUInt16BE(0x0304, 0);
    socket.write(build0030Transport({ phase1Key, id: 55, inner: admissionReq, tables }));
    const admissionFrames = await readFrames(socket, 1, 4000);
    assert.equal(
      decodeInnerCode(admissionFrames[0]),
      0x0305,
      `boot ${boot} admission 0x0304 must yield 0x0305`,
    );

    // ★send-ring 순차 검증: 클라가 요청-응답을 하나씩 요청 → 매칭 응답이 ring 배수.
    //   0x0300→0x0301, 0x0f00→0x0f01 (각 단일 프레임). 0x0f02 는 옛 G164 정본대로 스폰 버스트를
    //   방출하므로 아래에서 별도 검증한다(0x0f00 이 0x0f02 보다 먼저여야 count 복구 순서가 성립).
    let reactiveId = 56;
    for (const [reqCode, respCode] of [
      [0x0300, 0x0301],
      [0x0f00, 0x0f01],
    ]) {
      const req = Buffer.alloc(2);
      req.writeUInt16BE(reqCode, 0);
      socket.write(build0030Transport({ phase1Key, id: reactiveId, inner: req, tables }));
      reactiveId += 1;
      const frames = await readFrames(socket, 1, 4000);
      assert.equal(
        decodeInnerCode(frames[0]),
        respCode,
        `boot ${boot} send-ring 0x${reqCode.toString(16)} must yield 0x${respCode.toString(16)}`,
      );
    }

    // ★단일 파서로 프레임을 code 목표까지 순차 수집(부분 프레임 손실 없이 소켓 스트림 소진).
    //   readFrames 는 반환 시 내부 파서(부분 프레임 잔여)를 버리므로, 대용량 버스트를 쪼갠
    //   readFrames(1) 뒤 새 파서로 이어 읽으면 프레이밍이 어긋난다. 여기선 하나의 파서로
    //   목표 코드(예: 0x0f03=push 종료)까지 읽어 그 문제를 피한다.
    const collectUntilCode = async (wantCode, timeoutMs = 10000) => {
      const parser = createFrameStreamParser();
      const deadline = Date.now() + timeoutMs;
      const out = [];
      for (;;) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`timeout waiting for 0x${wantCode.toString(16)} (got ${out.length})`);
        const chunk = await Promise.race([
          once(socket, 'data').then(([c]) => c),
          new Promise((_, rej) => setTimeout(() => rej(new Error('socket data timeout')), remaining)),
        ]);
        for (const fr of parser.push(chunk)) {
          out.push(fr);
          if (decodeInnerCode(fr) === wantCode) return out;
        }
      }
    };

    const decodeInnerBody = (fr) => {
      const dec = decryptBuffer(fr.body.subarray(4), expandChildCodecKey(DECIPHER_KEY, tables));
      return parse0030Body(dec).inner.subarray(6); // message32 body (skip [u32 0][u16 code])
    };

    // 0x0314 RequestStaticInformationGrid → static-info(0x0315)만. world-ready push/0x0f03 없음.
    //   ★월드-init 핸드셰이크 복원: 0x0314 에 0x0f03 을 실으면 클라가 0x0f00→0x0f02 를 건너뛰고
    //   NOW LOADING 에 정지한다. 스폰은 클라가 스스로 밟는 0x0f02 로 이동(아래).
    //   reactive 0x0315 는 플레이어 함대 cell 한 칸을 SPACE 로 채운다(빈 보드 아님).
    const gridReq = Buffer.alloc(2);
    gridReq.writeUInt16BE(0x0314, 0);
    socket.write(build0030Transport({ phase1Key, id: reactiveId, inner: gridReq, tables }));
    reactiveId += 1;
    const [gridFrame] = await readFrames(socket, 1, 4000);
    assert.equal(decodeInnerCode(gridFrame), 0x0315, `boot ${boot} 0x0314 → single static-info 0x0315`);
    const staticGridBody = decodeInnerBody(gridFrame);
    assert.equal(staticGridBody.length, 0x138c, `boot ${boot} 0x0315 fixed 5004B`);
    let staticPlaced = 0;
    for (let off = 4, rEnd = 4 + staticGridBody.readUInt16BE(2); off + 1 < rEnd; off += 2) {
      if (staticGridBody.readUInt8(off + 1) !== 0) staticPlaced += staticGridBody.readUInt8(off);
    }
    assert.ok(staticPlaced >= 1, `boot ${boot} 0x0314 0x0315 must place ≥1 player fleet cell (not empty board)`);

    // 0x0f02 RequestGridInitialize → 스폰 버스트(G164): [0x0204 + 0x0325 + 0x0323] → grid extras
    //   (0x0313 + 0x0315) → 0x0f03(맨 마지막). 직전 0x0f01 world-init reset 이 char count 를 0 으로
    //   지웠으므로 0x0323 을 재전송해 count 를 1 로 복구하고, 0x0f03 이 gridInitialized 를 flip 해 렌더를
    //   트리거한다. 0x0325(~58KB) 대용량 버스트라 단일 파서로 0x0f03(버스트 종료)까지 수집한다.
    const gridInitReq = Buffer.alloc(2);
    gridInitReq.writeUInt16BE(0x0f02, 0);
    socket.write(build0030Transport({ phase1Key, id: reactiveId, inner: gridInitReq, tables }));
    reactiveId += 1;
    const pushFrames = await collectUntilCode(0x0f03, 10000);
    const pushCodes = pushFrames.map(decodeInnerCode);
    // 순서: 0x0204(선두) → 0x0325 → 0x0323 → … → 0x0f03(맨 마지막, 각 1회).
    assert.equal(pushCodes[0], 0x0204, `boot ${boot} 0x0f02 spawn burst must start with 0x0204`);
    assert.equal(pushCodes[pushCodes.length - 1], 0x0f03, `boot ${boot} 0x0f03 must be LAST`);
    assert.equal(pushCodes.filter((c) => c === 0x0f03).length, 1, `boot ${boot} 0x0f03 exactly once`);
    assert.equal(pushCodes.filter((c) => c === 0x0325).length, 1, `boot ${boot} 0x0325 exactly once`);
    assert.equal(pushCodes.filter((c) => c === 0x0323).length, 1, `boot ${boot} 0x0323 exactly once`);
    // 0x0325 unit gate 가 0x0323(count 복구)보다 먼저.
    assert.ok(
      pushCodes.indexOf(0x0325) < pushCodes.indexOf(0x0323),
      `boot ${boot} 0x0325 must precede 0x0323`,
    );
    // ★정합(TCP 레벨): FUN_00419ca0 wire cursor는 u16 BE count 직후 body+0x02에서
    //   첫 unit id를 u32 BE로 읽는다. native destination의 +0x04 pad/offset을 wire에 적용하지 않는다.
    const unitBody = decodeInnerBody(pushFrames.find((fr) => decodeInnerCode(fr) === 0x0325));
    const charBody = decodeInnerBody(pushFrames.find((fr) => decodeInnerCode(fr) === 0x0323));
    assert.ok(unitBody.readUInt16BE(0x00) >= 1, `boot ${boot} 0x0325 count ≥ 1 (BE)`);
    assert.equal(
      charBody.readUInt32BE(0x24),
      unitBody.readUInt32BE(0x02),
      `boot ${boot} char flagship(+0x24 BE) must equal compact unit[0].id(+0x02 BE)`,
    );

    // move 0x0b01 (push 완전 소진 후이므로 소켓은 move 응답만 남는다)
    const player = server.worldSession.getPlayer(1);
    assert.ok(player && player.inWorld, `boot ${boot} player in world`);
    const moveInner = Buffer.alloc(10);
    moveInner.writeUInt16BE(0x0b01, 0);
    moveInner.writeUInt32LE(player.unitId, 2);
    moveInner.writeUInt32LE(2700 + boot, 6);
    socket.write(build0030Transport({ phase1Key, id: 6, inner: moveInner, tables }));
    const [moveFrame] = await collectUntilCode(0x0b07, 6000);
    const moveBody = decryptBuffer(moveFrame.body.subarray(4), expandChildCodecKey(DECIPHER_KEY, tables));
    const moveParsed = parse0030Body(moveBody);
    assert.equal(moveParsed.inner.readUInt16BE(4), 0x0b07);
    assert.equal(server.worldSession.getPlayer(1).cell, 2700 + boot);
    const compactMoveCell = server.worldSession.getPlayer(1).cell;

    const previousFallback = process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
    process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL = '2115';
    try {
      const liveMoveInner = Buffer.from(
        '0b0100600de10000001900000001000003350098ffffffffffff62000000000005',
        'hex',
      );
      socket.write(build0030Transport({ phase1Key, id: 7, inner: liveMoveInner, tables }));
      const [liveMoveFrame] = await collectUntilCode(0x0b07, 6000);
      const liveMoveBody = decryptBuffer(
        liveMoveFrame.body.subarray(4),
        expandChildCodecKey(DECIPHER_KEY, tables),
      );
      assert.equal(parse0030Body(liveMoveBody).inner.readUInt16BE(4), 0x0b07);
      assert.equal(server.worldSession.getPlayer(1).cell, 2115);
      const traceLines = (await readFile(join(dir, `trace-${boot}.jsonl`), 'utf8'))
        .trim().split('\n').map((line) => JSON.parse(line));
      const moveTrace = traceLines.filter((line) => line.event === 'world-response-sent' && line.kind === 'move').at(-1);
      assert.equal(moveTrace.cell, 2115);
      assert.equal(moveTrace.cellSource, 'configured-fallback-qa-gated');
      assert.equal(moveTrace.unresolved, true);
    } finally {
      if (previousFallback === undefined) delete process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
      else process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL = previousFallback;
    }

    const previousRouteFallback = process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
    delete process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
    try {
      const routeMoveInner = Buffer.from(
        '0b0100000b47054f477000000001000012c13020000000000b4700000000000005',
        'hex',
      );
      socket.write(build0030Transport({ phase1Key, id: 8, inner: routeMoveInner, tables }));
      const [routeMoveFrame] = await collectUntilCode(0x0b07, 6000);
      const routeMoveBody = decryptBuffer(
        routeMoveFrame.body.subarray(4),
        expandChildCodecKey(DECIPHER_KEY, tables),
      );
      assert.equal(parse0030Body(routeMoveBody).inner.readUInt16BE(4), 0x0b07);
      assert.equal(server.worldSession.getPlayer(1).cell, 2887);
      const traceLines = (await readFile(join(dir, `trace-${boot}.jsonl`), 'utf8'))
        .trim().split('\n').map((line) => JSON.parse(line));
      const routeMoveTrace = traceLines.filter((line) => line.event === 'world-response-sent' && line.kind === 'move').at(-1);
      assert.equal(routeMoveTrace.cell, 2887);
      assert.equal(routeMoveTrace.cellSource, 'decoded-route-cell');
      assert.equal(routeMoveTrace.configuredFallback, null);
      assert.equal(routeMoveTrace.unresolved, false);
    } finally {
      if (previousRouteFallback === undefined) delete process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
      else process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL = previousRouteFallback;
    }

    results.push({
      boot,
      port,
      loginReplies: loginReplies.length,
      worldCodes: decodedCodes.map((c) => `0x${c.toString(16)}`),
      moveCell: compactMoveCell,
      liveMoveCell: server.worldSession.getPlayer(1).cell,
    });
    socket.end();
    await server.close();
  }

  assert.equal(results.length, 2);
  assert.equal(results[0].moveCell, 2701);
  assert.equal(results[1].moveCell, 2702);
  assert.equal(results[0].liveMoveCell, 2887);
  assert.equal(results[1].liveMoveCell, 2887);
  await rm(dir, { recursive: true, force: true });
});
