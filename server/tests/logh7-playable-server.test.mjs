import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
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
  } finally {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('playable server boots twice and serves login+world+move sequence', async () => {
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
      characterStore: store,
      tables,
      transportKey: TRANSPORT_KEY,
      decipherKey: DECIPHER_KEY,
    });
    await server.listen();
    const { port } = server.address();
    const socket = net.connect({ host: '127.0.0.1', port });
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
    const lobbyBody = decryptBuffer(lobbyOkFrames[0].body, expandChildCodecKey(DECIPHER_KEY, tables));
    const lobbyParsed = parse0030Body(lobbyBody);
    assert.equal(readInnerCode(lobbyParsed.inner), 0x2001);

    // session login 0x2009 → world entry push
    const sessionReq = Buffer.alloc(10);
    sessionReq.writeUInt16BE(0x2009, 0);
    sessionReq.writeUInt32LE(1, 2);
    sessionReq.writeUInt32LE(1, 6);
    socket.write(build0030Transport({ phase1Key, id: 3, inner: sessionReq, tables }));
    // expect: 0x200a + world emits (0x0204/323/325/301/f01/f03/315/206) = 9
    const worldFrames = await readFrames(socket, 9, 8000);
    assert.ok(worldFrames.length >= 9, `boot ${boot} world frames ${worldFrames.length}`);

    const decodedCodes = [];
    for (const fr of worldFrames) {
      const body = decryptBuffer(fr.body, expandChildCodecKey(DECIPHER_KEY, tables));
      const parsed = parse0030Body(body);
      // raw or message32
      let code;
      if (parsed.inner.length >= 6 && parsed.inner.readUInt32LE(0) === 0) {
        code = parsed.inner.readUInt16BE(4);
      } else {
        code = readInnerCode(parsed.inner);
      }
      decodedCodes.push(code);
    }
    assert.ok(decodedCodes.includes(0x200a), `boot ${boot} missing 0x200a: ${decodedCodes.map((c) => c.toString(16))}`);
    assert.ok(decodedCodes.includes(0x0323), `boot ${boot} missing 0x0323`);
    assert.ok(decodedCodes.includes(0x0325), `boot ${boot} missing 0x0325`);
    assert.ok(decodedCodes.includes(0x0206), `boot ${boot} missing 0x0206`);

    // move 0x0b01
    const player = server.worldSession.getPlayer(1);
    assert.ok(player && player.inWorld, `boot ${boot} player in world`);
    const moveInner = Buffer.alloc(10);
    moveInner.writeUInt16BE(0x0b01, 0);
    moveInner.writeUInt32LE(player.unitId, 2);
    moveInner.writeUInt32LE(2700 + boot, 6);
    socket.write(build0030Transport({ phase1Key, id: 4, inner: moveInner, tables }));
    const moveFrames = await readFrames(socket, 1, 3000);
    const moveBody = decryptBuffer(moveFrames[0].body, expandChildCodecKey(DECIPHER_KEY, tables));
    const moveParsed = parse0030Body(moveBody);
    assert.equal(moveParsed.inner.readUInt16BE(4), 0x0b07);
    assert.equal(server.worldSession.getPlayer(1).cell, 2700 + boot);

    results.push({
      boot,
      port,
      loginReplies: loginReplies.length,
      worldCodes: decodedCodes.map((c) => `0x${c.toString(16)}`),
      moveCell: server.worldSession.getPlayer(1).cell,
    });
    socket.end();
    await server.close();
  }

  assert.equal(results.length, 2);
  assert.equal(results[0].moveCell, 2701);
  assert.equal(results[1].moveCell, 2702);
  await rm(dir, { recursive: true, force: true });
});
