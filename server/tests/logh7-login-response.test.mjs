import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  KEYSETUP_INNER_CODE,
  REDIRECT_INNER_CODE,
  buildRedirectInner,
  buildLoginResponseFrames,
  ipToRedirectU32,
} from '../src/server/logh7-login-response.mjs';
import { build0030Body, parse0030Body, readInnerCode, deframe0030, frame0030 } from '../src/server/logh7-envelope-0030.mjs';
import {
  decryptBuffer,
  encryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from '../src/server/logh7-child-codec.mjs';
import { buildTransportFrame, createFrameStreamParser } from '../src/server/logh7-frame-stream.mjs';
import { createLoginHarnessServer } from '../src/server/logh7-login-harness-server.mjs';

const TRANSPORT_KEY = Buffer.from('7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d', 'hex');
const DECIPHER_KEY = Buffer.from('5859', 'hex');
// 실클라가 보내는 GIN7 자격증명 inner (account "inei00", password "dummy"). 기존 하네스 테스트와 동일.
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

// 0x0030 프레임(code 0x0030)의 암호화 body 를 지정 키로 복호해 봉투 파싱.
function decode0030Frame(frame, key, tables) {
  assert.equal(frame.code, 0x0030);
  const decoded = decryptBuffer(frame.body, expandChildCodecKey(key, tables));
  return parse0030Body(decoded);
}

async function readFrames(socket, count) {
  const parser = createFrameStreamParser();
  const collected = [];
  while (collected.length < count) {
    const [chunk] = await once(socket, 'data');
    collected.push(...parser.push(chunk));
  }
  return collected;
}

test('ipToRedirectU32 octet-packs low byte first (matches client %d.%d.%d.%d)', () => {
  // 127.0.0.1 -> octet0(127) 하위바이트, octet3(1) 상위바이트 -> 0x0100007f
  assert.equal(ipToRedirectU32('127.0.0.1'), 0x0100007f);
  assert.equal(ipToRedirectU32('0.0.0.0'), 0);
  assert.throws(() => ipToRedirectU32('256.0.0.1'));
  assert.throws(() => ipToRedirectU32('127.0.0'));
  for (const invalidIp of [
    '127..0.1',
    '1e2.0.0.1',
    ' 127.0.0.1',
    '127.0.0.1 ',
    '+127.0.0.1',
    '0x7f.0.0.1',
    '127.00.0.1',
    '127.01.0.1',
  ]) {
    assert.throws(() => ipToRedirectU32(invalidIp), /invalid canonical IPv4 address/);
  }
});

test('buildRedirectInner reproduces the proven 127.0.0.1:47900 redirect frame', () => {
  const inner = buildRedirectInner();
  assert.equal(readInnerCode(inner), REDIRECT_INNER_CODE);
  // IP@8 (BE u32), port@12 (BE u16) — RE 근거 REDIRECT_IP_OFFSET/REDIRECT_PORT_OFFSET
  assert.equal(inner.readUInt32BE(8), 0x0100007f);
  assert.equal(inner.readUInt16BE(12), 47900);
});

test('buildRedirectInner patches ip/port/token', () => {
  const inner = buildRedirectInner({ ip: '10.20.30.40', port: 12345, token: 0xdeadbeef });
  assert.equal(inner.readUInt32BE(8), ipToRedirectU32('10.20.30.40'));
  assert.equal(inner.readUInt16BE(12), 12345);
  assert.equal(inner.readUInt32BE(16), 0xdeadbeef);
  assert.throws(() => buildRedirectInner({ port: 70000 }));
});

test('buildLoginResponseFrames emits keysetup(0x0031)+redirect(0x7001) pair (g134 proven shape)', () => {
  const tables = loadChildCodecTables();
  const decodedBody = build0030Body({ id: 7, inner: CREDENTIAL_INNER });
  const redirectInner = buildRedirectInner();
  const { keysetupFrame, redirectFrame, gin7KeyHex } = buildLoginResponseFrames({
    tables,
    decipherKey: DECIPHER_KEY,
    decodedBody,
    redirectInner,
  });

  // keysetup 프레임: decipherKey 로 복호. inner 코드만 0x0031 로 교체, 나머지 blob 은 자격증명 그대로.
  const keysetupFrameParsed = deframe0030(keysetupFrame);
  const keysetup = decode0030Frame({ code: keysetupFrameParsed.code, body: keysetupFrameParsed.encBody }, DECIPHER_KEY, tables);
  assert.equal(keysetup.id, 7);
  assert.equal(readInnerCode(keysetup.inner), KEYSETUP_INNER_CODE);
  // keysetup inner 의 코드 뒤 blob == 자격증명 inner 의 코드 뒤 blob (GIN7...)
  assert.deepEqual(keysetup.inner.subarray(2), CREDENTIAL_INNER.subarray(2));

  // redirect 프레임: 방금 설치된 gin7Key(자격증명 inner 코드 이후 전체)로 복호.
  const gin7Key = Buffer.from(CREDENTIAL_INNER.subarray(2));
  assert.equal(gin7KeyHex, gin7Key.toString('hex'));
  const redirectFrameParsed = deframe0030(redirectFrame);
  const redirect = decode0030Frame({ code: redirectFrameParsed.code, body: redirectFrameParsed.encBody }, gin7Key, tables);
  assert.equal(redirect.id, 7);
  assert.equal(readInnerCode(redirect.inner), REDIRECT_INNER_CODE);
  assert.equal(redirect.inner.readUInt32BE(8), 0x0100007f);
  assert.equal(redirect.inner.readUInt16BE(12), 47900);
});

test('login harness replies to a decoded GIN7 credential with the keysetup+redirect pair', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-loginresp-'));
  const tracePath = join(tempDir, 'login.jsonl');
  const harness = createLoginHarnessServer({ port: 0, host: '127.0.0.1', tracePath, logger: null });
  let socket = null;

  try {
    const baseTables = loadChildCodecTables();
    const transportTables = expandChildCodecKey(TRANSPORT_KEY, baseTables);
    const phase1Key = Buffer.from('1fa2510d2ebd6ac9278d0fd939d1168d', 'hex');
    const phase1Frame = buildPhase1Frame({ phase1Key, sequence: 1, tables: transportTables });
    const body = build0030Body({ id: 1, inner: CREDENTIAL_INNER });
    const encrypted0030 = frame0030(encryptBuffer(pad8(body), expandChildCodecKey(phase1Key, baseTables)));

    await harness.listen();
    socket = net.createConnection(harness.address());
    await once(socket, 'connect');
    socket.write(phase1Frame);
    await readFrames(socket, 1); // phase3 (0x0035)
    socket.write(encrypted0030);

    // 서버가 keysetup+redirect 2 프레임을 회신해야 한다.
    const [keysetupFrame, redirectFrame] = await readFrames(socket, 2);

    const keysetup = decode0030Frame(keysetupFrame, DECIPHER_KEY, baseTables);
    assert.equal(keysetup.id, 1);
    assert.equal(readInnerCode(keysetup.inner), KEYSETUP_INNER_CODE);

    const gin7Key = Buffer.from(CREDENTIAL_INNER.subarray(2));
    const redirect = decode0030Frame(redirectFrame, gin7Key, baseTables);
    assert.equal(redirect.id, 1);
    assert.equal(readInnerCode(redirect.inner), REDIRECT_INNER_CODE);
    assert.equal(redirect.inner.readUInt16BE(12), 47900);

    socket.end();
    await once(socket, 'close');
    await harness.close();

    const traceLines = (await readFile(tracePath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
    const decoded = traceLines.find((line) => line.event === '0030-decoded');
    assert.equal(decoded.innerCodeHex, '0x7000');
    const sent = traceLines.find((line) => line.event === 'login-response-sent');
    assert.ok(sent, 'login-response-sent trace expected');
    assert.equal(sent.gin7KeyHex, undefined, 'credential key must not be logged by default');
    assert.equal(sent.gin7KeyBytes, gin7Key.length);
    assert.equal(sent.gin7KeyRedacted, true);
  } finally {
    socket?.destroy();
    await harness.close().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
});
