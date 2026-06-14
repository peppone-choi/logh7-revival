import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import { test } from 'node:test';

import {
  childCodecDecode,
  childCodecEncode,
  childCodecKeySchedule,
  extractChildCodecStaticTables,
} from '../../src/server/logh7-codec.mjs';
import { build0030Body, compute0030Checksum, parse0030Body } from '../../src/server/logh7-envelope-0030.mjs';
import {
  buildEncrypted0030Frame,
  buildLobbyLoginOkPayload,
  buildRedirectReply,
  selectLobbyLoginOkKey,
  startLogh7AuthServer,
  takeTransportFrames,
} from '../../src/server/logh7-auth-server.mjs';
import { createAccountStore } from '../../src/server/logh7-login-session.mjs';
import { LOGIN_INNER_CODE, REDIRECT_INNER_CODE, buildLobbyLoginOkInner } from '../../src/server/logh7-login-protocol.mjs';

const CLIENT_EXE = path.resolve('.omo/work/logh7-installed/exe/G7MTClient.exe');
const HAS_EXE = existsSync(CLIENT_EXE);
const TRANSPORT_KEY = Buffer.from('7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d', 'hex');
const DECIPHER_KEY = Buffer.from('5859', 'hex'); // "XY"
const LOGIN_INNER = Buffer.from('700047494e370001000000070069006e006500690030003000000600640075006d006d00790000', 'hex');

function buildLoginBody() {
  return build0030Body({ id: 1, innerPayload: LOGIN_INNER });
}

function buildClient0030Frame(tables, encipherKey, id, innerPayload) {
  const body = build0030Body({ id, innerPayload });
  const encoded = childCodecEncode(childCodecKeySchedule(tables, encipherKey), body);
  const frame = Buffer.alloc(4 + encoded.length);
  frame.writeUInt16BE(2 + encoded.length, 0);
  frame.writeUInt16BE(0x0030, 2);
  encoded.copy(frame, 4);
  return frame;
}

test('buildRedirectReply yields a keysetup frame (inner 0x31) and a GIN7-keyed redirect (inner 0x7001)', { skip: !HAS_EXE && 'client exe not present' }, () => {
  const tables = extractChildCodecStaticTables(CLIENT_EXE);
  const decodedBody = buildLoginBody();
  const reply = buildRedirectReply({
    tables,
    decipherKey: DECIPHER_KEY,
    decodedBody,
    redirectInner: Buffer.from('70010000000000000100007fbb1c0000000100000000', 'hex'),
  });
  // keysetup frame decodes with decipherKey -> inner code forced to 0x31
  const keysetupBody = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), reply.keysetupFrame.subarray(4));
  const keysetupParsed = parse0030Body(keysetupBody);
  assert.equal(keysetupParsed.valid, true);
  assert.equal(keysetupParsed.innerPayload.readUInt16BE(0), 0x0031);

  // redirect frame decodes with the GIN7 blob key (login inner minus its 2-byte code)
  const gin7Key = LOGIN_INNER.subarray(2);
  assert.equal(reply.gin7KeyHex, gin7Key.toString('hex'));
  const redirectBody = childCodecDecode(childCodecKeySchedule(tables, gin7Key), reply.redirectFrame.subarray(4));
  const redirectParsed = parse0030Body(redirectBody);
  assert.equal(redirectParsed.valid, true);
  assert.equal(redirectParsed.innerPayload.readUInt16BE(0), REDIRECT_INNER_CODE);
});

test('lobby login OK defaults to decipherKey with conn2 subheader', { skip: !HAS_EXE && 'client exe not present' }, () => {
  const tables = extractChildCodecStaticTables(CLIENT_EXE);
  const phase1Key = Buffer.from('fd65d384aeeab9b8a783a8fed72f32f7', 'hex');
  const parsedInnerPayload = Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex');
  const selected = selectLobbyLoginOkKey({
    mode: undefined,
    parsedInnerPayload,
    decipherKey: DECIPHER_KEY,
    phase1Key,
  });

  assert.equal(selected.keyMode, 'decipher');
  assert.deepEqual(selected.key, DECIPHER_KEY);

  const frame = buildEncrypted0030Frame({
    tables,
    key: selected.key,
    body: build0030Body({ id: 3, innerPayload: buildLobbyLoginOkInner({ status: 0 }) }),
    subheaderLen: 4,
  });
  assert.equal(frame.readUInt16BE(0), 22);
  assert.equal(frame.readUInt16BE(6), 0x0030);
  assert.equal(frame.length, 24);

  const decodedWithDecipher = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), frame.subarray(8));
  const parsedWithDecipher = parse0030Body(decodedWithDecipher);
  assert.equal(parsedWithDecipher.valid, true);
  assert.equal(parsedWithDecipher.id, 3);
  assert.equal(parsedWithDecipher.innerPayload.readUInt16BE(0), 0x2001);

  const decodedWithPhase1 = childCodecDecode(childCodecKeySchedule(tables, phase1Key), frame.subarray(8));
  const parsedWithPhase1 = parse0030Body(decodedWithPhase1);
  assert.notEqual(parsedWithPhase1.valid, true);
});

test('lobby login OK key selection keeps explicit probe overrides', () => {
  const phase1Key = Buffer.from('fd65d384aeeab9b8a783a8fed72f32f7', 'hex');
  const parsedInnerPayload = Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex');

  const phase1 = selectLobbyLoginOkKey({
    mode: 'phase1',
    parsedInnerPayload,
    decipherKey: DECIPHER_KEY,
    phase1Key,
  });
  assert.equal(phase1.keyMode, 'phase1');
  assert.deepEqual(phase1.key, phase1Key);

  const gin7 = selectLobbyLoginOkKey({
    mode: 'gin7',
    parsedInnerPayload,
    decipherKey: DECIPHER_KEY,
    phase1Key,
  });
  assert.equal(gin7.keyMode, 'gin7');
  assert.equal(gin7.key.toString('hex'), parsedInnerPayload.subarray(2).toString('hex'));
});

test('lobby login OK payload can use conn2 message32 framing as an opt-in probe', () => {
  const raw = buildLobbyLoginOkPayload({ status: 0, format: undefined });
  assert.equal(raw.okFormat, 'raw');
  assert.equal(raw.okInner.toString('hex'), '20010000');

  const message32 = buildLobbyLoginOkPayload({ status: 0, format: 'message32' });
  assert.equal(message32.okFormat, 'message32');
  assert.equal(message32.okInner.toString('hex'), '000000002001000000');
});

// Build a valid phase1 (0x0034) request frame the way the real client would, so the
// server's buildPhase3ResponseFromPhase1Request can decode our chosen encipherKey.
function buildPhase1RequestFrame(tables, encipherKey, sequence) {
  const body = Buffer.alloc(2 + encipherKey.length + 4);
  body.writeUInt16BE(encipherKey.length, 0);
  encipherKey.copy(body, 2);
  body.writeUInt32BE(sequence, 2 + encipherKey.length);
  const decoded = Buffer.alloc(body.length + 2);
  decoded.writeUInt16BE(compute0030Checksum(body), 0);
  body.copy(decoded, 2);
  const encoded = childCodecEncode(childCodecKeySchedule(tables, TRANSPORT_KEY), decoded);
  const frame = Buffer.alloc(4 + encoded.length);
  frame.writeUInt16BE(2 + encoded.length, 0);
  frame.writeUInt16BE(0x0034, 2);
  encoded.copy(frame, 4);
  return frame;
}

test('auth server drives a simulated client through handshake -> login -> redirect', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = extractChildCodecStaticTables(CLIENT_EXE);
  const encipherKey = Buffer.from('4ee698865ce45e2bc5e5ec149511d551', 'hex'); // real captured encipherKey
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const received = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentLogin = false;
      const received0030 = [];
      const timer = setTimeout(() => reject(new Error('timed out waiting for redirect reply')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          if (code === 0x0035 && !sentLogin) {
            sentLogin = true;
            // client encodes its login 0x0030 with the encipherKey it chose
            const body = build0030Body({ id: 1, innerPayload: LOGIN_INNER });
            const encoded = childCodecEncode(childCodecKeySchedule(tables, encipherKey), body);
            const loginFrame = Buffer.alloc(4 + encoded.length);
            loginFrame.writeUInt16BE(2 + encoded.length, 0);
            loginFrame.writeUInt16BE(0x0030, 2);
            encoded.copy(loginFrame, 4);
            socket.write(loginFrame);
          } else if (code === 0x0030 && sentLogin) {
            // first 0x0030 reply is the keysetup; collect both, then resolve on the 2nd
            if (!received0030.length) {
              received0030.push(frame);
            } else {
              received0030.push(frame);
              clearTimeout(timer);
              socket.destroy();
              resolve(received0030);
            }
          }
        }
      });
      socket.on('error', reject);
    });
    assert.equal(received.length, 2, 'server should send keysetup + redirect frames');
    // verify the 2nd (redirect) frame decodes with the GIN7 key to inner 0x7001
    const gin7Key = LOGIN_INNER.subarray(2);
    const redirectBody = childCodecDecode(childCodecKeySchedule(tables, gin7Key), received[1].subarray(4));
    const redirectParsed = parse0030Body(redirectBody);
    assert.equal(redirectParsed.valid, true);
    assert.equal(redirectParsed.innerPayload.readUInt16BE(0), REDIRECT_INNER_CODE);
    assert.equal(redirectParsed.innerPayload.readUInt16BE(12), 47900);
    // sanity: login inner is the GIN7 credential
    assert.equal(LOGIN_INNER.readUInt16BE(0), LOGIN_INNER_CODE);
  } finally {
    await server.close();
  }
});

test('lobby follow-up responses keep the conn2 0x0030 subheader', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = extractChildCodecStaticTables(CLIENT_EXE);
  const encipherKey = Buffer.from('484a8fd202f545cc0460ef485c332ac5', 'hex');
  const previousFormat = process.env.LOGH_LOBBY_OK_FORMAT;
  process.env.LOGH_LOBBY_OK_FORMAT = 'message32';
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    characters: [{ id: 9 }],
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const followUpFrame = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentLobbyLogin = false;
      let sentCharacterCharge = false;
      const timer = setTimeout(() => reject(new Error('timed out waiting for 0x2004 follow-up')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn2Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentLobbyLogin) {
            sentLobbyLogin = true;
            socket.write(
              Buffer.concat([
                buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000001', 'hex')),
                buildClient0030Frame(
                  tables,
                  encipherKey,
                  2,
                  Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex'),
                ),
              ]),
            );
          } else if (conn2Code === 0x0030 && !sentCharacterCharge) {
            const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), frame.subarray(8));
            const parsed = parse0030Body(decoded);
            assert.equal(parsed.valid, true);
            assert.equal(parsed.innerPayload.toString('hex'), '000000002001000000');
            sentCharacterCharge = true;
            socket.write(buildClient0030Frame(tables, encipherKey, 3, Buffer.from('2003', 'hex')));
          } else if (sentCharacterCharge) {
            clearTimeout(timer);
            socket.destroy();
            resolve(frame);
          }
        }
      });
      socket.on('error', reject);
    });

    assert.equal(followUpFrame.readUInt16BE(0), 0x06f6);
    assert.equal(followUpFrame.length, 0x06f8);
    assert.equal(followUpFrame.readUInt16BE(2), 0);
    assert.equal(followUpFrame.readUInt16BE(6), 0x0030);
    const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), followUpFrame.subarray(8));
    const parsed = parse0030Body(decoded);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.id, 4);
    assert.equal(parsed.innerPayload.length, 0x06e2);
    assert.equal(parsed.innerPayload.readUInt32BE(0), 0);
    assert.equal(parsed.innerPayload.readUInt16BE(4), 0x2004);
    const payload = parsed.innerPayload.subarray(6);
    assert.equal(payload.length, 0x06dc);
    assert.equal(payload.readUInt8(0), 1);
    assert.equal(payload.readUInt16LE(1), 9);
  } finally {
    if (previousFormat === undefined) {
      delete process.env.LOGH_LOBBY_OK_FORMAT;
    } else {
      process.env.LOGH_LOBBY_OK_FORMAT = previousFormat;
    }
    await server.close();
  }
});

test('auth server answers conn3 app-level 0x0200 with message32 SSLoginOK 0x0201 by default', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = extractChildCodecStaticTables(CLIENT_EXE);
  const encipherKey = Buffer.from('e9f4c6fd936819948eb614a2567c72ce', 'hex');
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const ssLoginOkFrame = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentSsLogin = false;
      const timer = setTimeout(() => reject(new Error('timed out waiting for 0x0201 SSLoginOK')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn3Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentSsLogin) {
            sentSsLogin = true;
            socket.write(
              Buffer.concat([
                buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000000', 'hex')),
                buildClient0030Frame(
                  tables,
                  encipherKey,
                  2,
                  Buffer.from('020047494e3700570000070069006e00650069003000300000', 'hex'),
                ),
              ]),
            );
          } else if (conn3Code === 0x0030) {
            clearTimeout(timer);
            socket.destroy();
            resolve(frame);
          }
        }
      });
      socket.on('error', reject);
    });

    assert.equal(ssLoginOkFrame.readUInt16BE(2), 0);
    assert.equal(ssLoginOkFrame.readUInt16BE(6), 0x0030);
    const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), ssLoginOkFrame.subarray(8));
    const parsed = parse0030Body(decoded);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.id, 3);
    // G138 PROVEN default: message32 wrap [u32 0][u16 0x0201][u8 status]
    assert.equal(parsed.innerPayload.toString('hex'), '00000000020101');
    assert.equal(parsed.innerPayload.readUInt16BE(4), 0x0201);
  } finally {
    await server.close();
  }
});

test('auth server keeps the legacy raw conn3 0x0201 reachable via LOGH_SS_FORMAT=raw (A/B)', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const tables = extractChildCodecStaticTables(CLIENT_EXE);
  const encipherKey = Buffer.from('e9f4c6fd936819948eb614a2567c72ce', 'hex');
  const previousFormat = process.env.LOGH_SS_FORMAT;
  process.env.LOGH_SS_FORMAT = 'raw';
  const server = await startLogh7AuthServer({
    host: '127.0.0.1',
    port: 0,
    clientExe: CLIENT_EXE,
    transportKey: TRANSPORT_KEY,
    decipherKey: DECIPHER_KEY,
    lobby: { ip: '127.0.0.1', port: 47900 },
    accountStore: createAccountStore({ acceptAnyGin7: true }),
  });
  try {
    const ssLoginOkFrame = await new Promise((resolve, reject) => {
      const socket = connect(server.port, '127.0.0.1');
      let buffer = Buffer.alloc(0);
      let sentSsLogin = false;
      const timer = setTimeout(() => reject(new Error('timed out waiting for message32 0x0201')), 4000);
      socket.on('connect', () => socket.write(buildPhase1RequestFrame(tables, encipherKey, 1)));
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, remaining } = takeTransportFrames(buffer);
        buffer = Buffer.from(remaining);
        for (const frame of frames) {
          const code = frame.readUInt16BE(2);
          const conn3Code = frame.length >= 8 ? frame.readUInt16BE(6) : 0;
          if (code === 0x0035 && !sentSsLogin) {
            sentSsLogin = true;
            socket.write(
              Buffer.concat([
                buildClient0030Frame(tables, encipherKey, 1, Buffer.from('002000000000', 'hex')),
                buildClient0030Frame(
                  tables,
                  encipherKey,
                  2,
                  Buffer.from('020047494e3700570000070069006e00650069003000300000', 'hex'),
                ),
              ]),
            );
          } else if (conn3Code === 0x0030) {
            clearTimeout(timer);
            socket.destroy();
            resolve(frame);
          }
        }
      });
      socket.on('error', reject);
    });

    const decoded = childCodecDecode(childCodecKeySchedule(tables, DECIPHER_KEY), ssLoginOkFrame.subarray(8));
    const parsed = parse0030Body(decoded);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.innerPayload.toString('hex'), '02010100');
    assert.equal(parsed.innerPayload.readUInt16BE(0), 0x0201);
  } finally {
    if (previousFormat === undefined) {
      delete process.env.LOGH_SS_FORMAT;
    } else {
      process.env.LOGH_SS_FORMAT = previousFormat;
    }
    await server.close();
  }
});

test('auth server boots with LOGH_CONTENT_DB=1 (world seeded from the recovered content DB)', { skip: !HAS_EXE && 'client exe not present' }, async () => {
  const previous = process.env.LOGH_CONTENT_DB;
  process.env.LOGH_CONTENT_DB = '1';
  let server;
  try {
    // building the DB-driven content pack (galaxy/roster/units) must validate and not throw on boot
    server = await startLogh7AuthServer({
      host: '127.0.0.1',
      port: 0,
      clientExe: CLIENT_EXE,
      transportKey: TRANSPORT_KEY,
      decipherKey: DECIPHER_KEY,
      lobby: { ip: '127.0.0.1', port: 47900 },
      accountStore: createAccountStore({ acceptAnyGin7: true }),
    });
    assert.ok(server.port > 0, 'server bound with the recovered content pack');
  } finally {
    if (previous === undefined) {
      delete process.env.LOGH_CONTENT_DB;
    } else {
      process.env.LOGH_CONTENT_DB = previous;
    }
    if (server) await server.close();
  }
});
