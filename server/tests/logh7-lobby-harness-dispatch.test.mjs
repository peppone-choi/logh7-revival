// conn2(로비) 디스패치 통합 테스트 — createLoginHarnessServer 배선 검증.
//
// 목표(라이브 근거: .omo/live-qa/login-hw-20260707/trace.jsonl conn2):
//   로그인 성공 후 클라가 로비 서버로 재접속 → 재핸드셰이크(0x0034/0x0035) →
//   inner 0x0020(무응답) → 0x2000(→0x2001) → 0x1000(→0x1001 448B 로스터).
//   이전 하네스는 0x2000 무응답 → ~2분 후 ECONNRESET. 이 테스트가 그 회귀를 가둔다.
//
// 실측 inner 레이아웃은 logh7-lobby-login.mjs 도크스트링(trace conn2 복호)에서 가져온다.
// 라이브 rawFrameHex 는 클라 phase1Key 로 암호화돼 있어 재현 불가 → 자체 핸드셰이크로
// 서버에 알려진 phase1Key 를 설치한 뒤 동일 inner 를 그 키로 암호화해 주입한다.

import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createLoginHarnessServer } from '../src/server/logh7-login-harness-server.mjs';
import { buildTransportFrame, createFrameStreamParser } from '../src/server/logh7-frame-stream.mjs';
import { decryptBuffer, encryptBuffer, expandChildCodecKey, loadChildCodecTables } from '../src/server/logh7-child-codec.mjs';
import { build0030Body, frame0030, parse0030Body } from '../src/server/logh7-envelope-0030.mjs';
import { createCharacterStore } from '../src/server/logh7-character-store.mjs';

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

// phase1Key 로 암호화된 0x0030 프레임(inner 봉투) 조립.
function build0030Frame({ id, inner, phase1Key, tables }) {
  const body = build0030Body({ id, inner });
  return frame0030(encryptBuffer(pad8(body), expandChildCodecKey(phase1Key, tables)));
}

// DECIPHER_KEY 로 복호해 0x0030 inner 를 꺼낸다(S→C 응답 검증).
// 로비는 subheaderLen=4이므로 parseTransportFrame이 잘못된 위치에서 code를 읽는다.
// raw frame: [u16BE len][u16BE 0][u16BE 0][u16BE 0x0030][enc] (lobi subheaderLen=4)
// parseTransportFrame: code = raw.readUInt16BE(2) = 0 (subheader!), body = raw.subarray(4)
// frame.body: [u16BE 0][u16BE 0x0030][enc] (offset 4부터)
// 실제 enc는 frame.body[4:]부터 (u16BE 0 + u16BE 0x0030 = 4 bytes를 건너뜀)
function decodeResponseInner(frame, tables) {
  const encBody = frame.body.subarray(4); // skip subheader padding (u16BE 0) + code (u16BE 0x0030)
  const decoded = decryptBuffer(encBody, expandChildCodecKey(DECIPHER_KEY, tables));
  return parse0030Body(decoded).inner;
}

// 실측 conn2 inner (logh7-lobby-login.mjs 도크스트링 근거)
function inner0x0020() {
  const buf = Buffer.alloc(6);
  buf.writeUInt16BE(0x0020, 0);
  buf.writeUInt32BE(1, 2); // selector=1 (로비 세션)
  return buf;
}

function inner0x2000(account) {
  const units = account.length + 1; // 마지막 NUL 포함
  const acc = Buffer.alloc(units * 2);
  for (let i = 0; i < account.length; i += 1) acc.writeUInt16LE(account.charCodeAt(i), i * 2);
  const head = Buffer.alloc(12);
  head.writeUInt16BE(0x2000, 0);
  head.write('GIN7', 2, 'ascii');
  head.writeUInt16BE(4, 6); // version=4 (BE)
  head.writeUInt16BE(0, 8); // flags
  head.writeUInt16LE(units, 10); // accountUnits (LE)
  return Buffer.concat([head, acc]);
}

function inner0x1000() {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(0x1000, 0); // RequestInformationAccount (body 없음)
  return buf;
}

async function readFrames(socket, count) {
  const parser = createFrameStreamParser();
  const out = [];
  while (out.length < count) {
    const [chunk] = await once(socket, 'data');
    for (const f of parser.push(chunk)) out.push(f);
  }
  return out;
}

test('conn2 lobby dispatch: 0x0020 무응답, 0x2000→0x2001, 0x1000→0x1001(448B)', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'logh7-lobby-'));
  const tracePath = join(tempDir, 'lobby.jsonl');
  const baseTables = loadChildCodecTables();
  const transportTables = expandChildCodecKey(TRANSPORT_KEY, baseTables);
  const phase1Key = Buffer.from('1fa2510d2ebd6ac9278d0fd939d1168d', 'hex');

  const harness = createLoginHarnessServer({
    port: 0,
    host: '127.0.0.1',
    tracePath,
    logger: null,
    tables: baseTables,
    characterStore: createCharacterStore(join(tempDir, 'chars.json')),
  });
  let socket = null;

  try {
    await harness.listen();
    socket = net.createConnection(harness.address());
    await once(socket, 'connect');

    // 1) phase1 핸드셰이크 → 서버에 phase1Key 설치 (0x0035 응답 1프레임 소비)
    socket.write(buildPhase1Frame({ phase1Key, sequence: 1, tables: transportTables }));
    await readFrames(socket, 1);

    // 2) conn2 inner 3종을 순서대로 주입 (0x0020, 0x2000, 0x1000)
    socket.write(build0030Frame({ id: 1, inner: inner0x0020(), phase1Key, tables: baseTables }));
    socket.write(build0030Frame({ id: 1, inner: inner0x2000('test01'), phase1Key, tables: baseTables }));
    socket.write(build0030Frame({ id: 1, inner: inner0x1000(), phase1Key, tables: baseTables }));

    // 0x0020 이 무응답이면 첫 응답=0x2001, 둘째=0x1001. (총 2프레임)
    const [resp2001, resp1001] = await readFrames(socket, 2);

    // 0x2001 LobbyLoginOK: message32 format [u32LE 0][u16BE 0x2001][status...]
    const inner2001 = decodeResponseInner(resp2001, baseTables);
    assert.equal(inner2001.readUInt32LE(0), 0);
    assert.equal(inner2001.readUInt16BE(4), 0x2001);
    assert.equal(inner2001.length, 9); // message32 header + 1 byte status + 2 bytes pad
    assert.equal(inner2001[6], 0); // status OK

    // 0x1001 ResponseInformationAccount: message32 [u32LE 0][u16BE 0x1001][448B body]
    const inner1001 = decodeResponseInner(resp1001, baseTables);
    assert.equal(inner1001.readUInt32LE(0), 0);
    assert.equal(inner1001.readUInt16BE(4), 0x1001);
    assert.equal(inner1001.length, 6 + 448); // message32 header + 448B fixed body

    socket.end();
    await once(socket, 'close');
    await harness.close();
  } finally {
    socket?.destroy();
    await harness.close().catch(() => {});
    await rm(tempDir, { recursive: true, force: true });
  }
});
