import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLoginHarnessServer } from '../src/server/logh7-login-harness-server.mjs';
import { buildTransportFrame, createFrameStreamParser } from '../src/server/logh7-frame-stream.mjs';
import { decryptBuffer, encryptBuffer, expandChildCodecKey, loadChildCodecTables } from '../src/server/logh7-child-codec.mjs';
import { build0030Body, frame0030 } from '../src/server/logh7-envelope-0030.mjs';

const TRANSPORT_KEY = Buffer.from('7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d', 'hex');
const DECIPHER_KEY = Buffer.from('5859', 'hex');

function fold16(value) {
  return ((value >>> 16) ^ value) & 0xffff;
}

function checksum(data) {
  let value = 0;
  let offset = 0;
  for (; offset + 4 <= data.length; offset += 4) {
    value = (value ^ data.readUInt32LE(offset)) >>> 0;
  }
  for (; offset < data.length; offset += 1) {
    value = (value ^ data[offset]) >>> 0;
  }
  return fold16(value);
}

function pad8(data) {
  const paddedLength = data.length % 8 === 0 ? data.length : data.length + (8 - (data.length % 8));
  const padded = Buffer.alloc(paddedLength);
  data.copy(padded);
  return padded;
}

function buildPhase1Frame({ phase1Key, sequence, tables }) {
  const body = Buffer.alloc(2 + phase1Key.length + 4);
  body.writeUInt16BE(phase1Key.length, 0);
  phase1Key.copy(body, 2);
  body.writeUInt32BE(sequence, 2 + phase1Key.length);
  const decoded = Buffer.alloc(body.length + 2);
  decoded.writeUInt16BE(checksum(body), 0);
  body.copy(decoded, 2);
  return buildTransportFrame(0x0034, encryptBuffer(pad8(decoded), tables));
}

function parsePhase3Body(decoded) {
  let cursor = 2;
  const encipherLen = decoded.readUInt16BE(cursor);
  cursor += 2;
  const encipherKey = decoded.subarray(cursor, cursor + encipherLen);
  cursor += encipherLen;
  const decipherLen = decoded.readUInt16BE(cursor);
  cursor += 2;
  const decipherKey = decoded.subarray(cursor, cursor + decipherLen);
  cursor += decipherLen;
  const sequence = decoded.readUInt32BE(cursor);
  cursor += 4;
  assert.equal(decoded.readUInt16BE(0), checksum(decoded.subarray(2, cursor)));
  return { encipherKey, decipherKey, sequence };
}

async function readOneFrame(socket) {
  const parser = createFrameStreamParser();
  for (;;) {
    const [chunk] = await once(socket, 'data');
    const frames = parser.push(chunk);
    if (frames.length > 0) return frames[0];
  }
}

test('login harness replies to split 0x0034 with 0x0035 and writes JSONL trace', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-harness-'));
  const tracePath = join(tempDir, 'login.jsonl');
  const tables = loadChildCodecTables();
  const transportTables = expandChildCodecKey(TRANSPORT_KEY, tables);
  const phase1Key = Buffer.from('47494e3700010000', 'hex');
  const phase1Frame = buildPhase1Frame({ phase1Key, sequence: 0x10203040, tables: transportTables });
  const harness = createLoginHarnessServer({
    port: 0,
    host: '127.0.0.1',
    tracePath,
    logger: null,
    tables,
  });
  let socket = null;

  try {
    await harness.listen();
    socket = net.createConnection(harness.address());
    await once(socket, 'connect');

    socket.write(phase1Frame.subarray(0, 5));
    socket.write(phase1Frame.subarray(5));

    const response = await readOneFrame(socket);
    assert.equal(response.code, 0x0035);
    const phase3 = parsePhase3Body(decryptBuffer(response.body, transportTables));
    assert.deepEqual(phase3.encipherKey, phase1Key);
    assert.deepEqual(phase3.decipherKey, DECIPHER_KEY);
    assert.equal(phase3.sequence, 0x10203040);

    socket.end();
    await once(socket, 'close');
    await harness.close();

    const traceLines = (await readFile(tracePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(
      traceLines.map((line) => line.event),
      ['connection-opened', 'frame-received', 'phase3-sent', 'peer-fin', 'connection-closed'],
    );
    assert.equal(traceLines[1].codeHex, '0x0034');
    assert.equal(traceLines[2].codeHex, '0x0035');
    assert.equal(traceLines[2].mode, 'replayed');
    assert.equal(traceLines[2].transportKeySource, 'legacy-default');
    assert.equal(traceLines[2].decipherKeySource, 'legacy-default');
    assert.equal(traceLines[2].phase1KeyBytes, phase1Key.length);
  } finally {
    socket?.destroy();
    await harness.close().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('0x0036 and 0x0030 are traced without forced 0x0030 decode', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-harness-'));
  const tracePath = join(tempDir, 'login.jsonl');
  const harness = createLoginHarnessServer({ port: 0, host: '127.0.0.1', tracePath, logger: null });
  let socket = null;

  try {
    await harness.listen();
    socket = net.createConnection(harness.address());
    await once(socket, 'connect');
    socket.write(Buffer.concat([
      buildTransportFrame(0x0036, Buffer.from('001122334455', 'hex')),
      buildTransportFrame(0x0030, Buffer.from('aabbccddeeff', 'hex')),
    ]));
    socket.end();
    await once(socket, 'close');
    await harness.close();

    const traceLines = (await readFile(tracePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const received = traceLines.filter((line) => line.event === 'frame-received');
    assert.deepEqual(received.map((line) => line.codeHex), ['0x0036', '0x0030']);
    assert.equal(received[1].rawFrameHex.endsWith('aabbccddeeff'), true);
    assert.equal(traceLines.some((line) => line.event === '0030-decoded'), false);
    assert.equal(traceLines.some((line) => line.event === '0030-decode-skipped'), true);
  } finally {
    socket?.destroy();
    await harness.close().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('0x0030 login credential is decoded after phase1 key setup', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-harness-'));
  const tracePath = join(tempDir, 'login.jsonl');
  const harness = createLoginHarnessServer({ port: 0, host: '127.0.0.1', tracePath, logger: null });
  let socket = null;

  try {
    const baseTables = loadChildCodecTables();
    const transportTables = expandChildCodecKey(TRANSPORT_KEY, baseTables);
    const phase1Key = Buffer.from('1fa2510d2ebd6ac9278d0fd939d1168d', 'hex');
    const phase1Frame = buildPhase1Frame({ phase1Key, sequence: 1, tables: transportTables });
    const inner = Buffer.from(
      '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000',
      'hex',
    );
    const body = build0030Body({ id: 1, inner });
    const encrypted0030 = frame0030(encryptBuffer(pad8(body), expandChildCodecKey(phase1Key, baseTables)));

    await harness.listen();
    socket = net.createConnection(harness.address());
    await once(socket, 'connect');
    socket.write(phase1Frame);
    await readOneFrame(socket);
    socket.write(encrypted0030);
    socket.end();
    await once(socket, 'close');
    await harness.close();

    const traceLines = (await readFile(tracePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const decoded = traceLines.find((line) => line.event === '0030-decoded');
    assert.equal(decoded.innerCodeHex, '0x7000');
    assert.equal(decoded.id, 1);
    assert.equal(decoded.credential.magic, 'GIN7');
    assert.equal(decoded.credential.account, 'inei00');
    assert.equal(decoded.credential.passwordRedacted, true);
  } finally {
    socket?.destroy();
    await harness.close().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
});
