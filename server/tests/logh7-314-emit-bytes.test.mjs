// logh7-314-emit-bytes.test.mjs — 라이브 정지 재현: 0x0304→0x0306→0x0314 연속 워크의
// 최종 소켓 바이트를 단일 프레임 파서로 파싱해 0x0315 가 0x0305/0x0307 과 동일 구조로
// 도달하는지 바이트 레벨로 대조한다.
//
// 왜 새 테스트인가: 기존 통합 테스트는 (a) 0x0306→0x0307(58802B) 을 0x0314 직전에 보내는
// 라이브 워크 순서를 재현하지 않고, (b) readFrames 가 호출마다 새 파서를 만들어 부분 프레임을
// 버려 cross-frame desync 를 못 잡는다. 라이브 실측은 "0x323→0x325→0x305→0x307 후 0x315
// 미도달, recv 큐 empty" — 즉 앞선 프레임(특히 대형 0x0307)이 남긴 desync 로 0x0315 프레임이
// 밀렸을 가능성. 이 테스트는 실 서버 트랜스포트가 내보내는 raw 바이트를 하나의 파서로 소진해
// 각 프레임의 [u16BE len][0x0030][subheader][enc]→decrypt→[checksum][id][innerLen][inner]→
// [msg32 code, body] 를 검증하고, len 필드가 실제 바이트수와 정확히 일치하는지(=클라 트랜스포트
// 재프레이밍 정합) 잠근다.

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
  return buildTransportFrame(0x0030, encryptBuffer(pad8(body), expandChildCodecKey(phase1Key, tables)));
}

// 단일 지속 파서로 소켓 스트림을 소진하는 수집기. 부분 프레임을 절대 버리지 않아
// 실클라 트랜스포트 재프레이밍과 동일하게 cross-frame desync 를 그대로 노출한다.
function createCollector(socket) {
  const parser = createFrameStreamParser();
  const frames = [];
  let waiters = [];
  const pump = () => { for (const w of waiters.splice(0)) w(); };
  socket.on('data', (chunk) => { frames.push(...parser.push(chunk)); pump(); });
  return {
    frames,
    get bufferedBytes() { return parser.bufferedBytes; },
    // 최소 count 프레임이 쌓일 때까지 대기(단일 파서라 누적).
    async waitFor(count, timeoutMs = 8000) {
      const deadline = Date.now() + timeoutMs;
      while (frames.length < count) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) {
          throw new Error(`timeout: wanted ${count} frames, got ${frames.length} (buffered ${parser.bufferedBytes}B)`);
        }
        await Promise.race([
          new Promise((res) => waiters.push(res)),
          new Promise((_, rej) => setTimeout(() => rej(new Error('data timeout')), remaining)),
        ]).catch((e) => { if (frames.length < count) throw e; });
      }
      return frames.slice(0, count);
    },
  };
}

// 트랜스포트 프레임 → message32 { code, bodyLen, id }.
function decodeFrame(fr, tables) {
  // playable-server 월드/어드미션 프레임은 로비 subheader(4)로 감긴다:
  //   [u16BE len][4B zero subheader][u16BE 0x0030][enc].  transport 코드워드는 offset 6.
  //   (로그인 conn1 프레임은 subheader 0 → 코드워드 offset 2. 여기서는 subheader4 만 온다.)
  assert.equal(fr.raw.readUInt16BE(6), 0x0030, `0x0030 codeword must sit at offset 6 (subheader4), got 0x${fr.raw.readUInt16BE(6).toString(16)}`);
  assert.equal(fr.length, fr.raw.length - 2, 'len 필드 == 실제 프레임 바이트수-2 (self-delimiting)');
  // enc body 는 subheader 이후 = fr.body(offset 4~) 에서 다시 4 바이트 뒤.
  const enc = fr.body.subarray(4);
  const dec = decryptBuffer(enc, expandChildCodecKey(DECIPHER_KEY, tables));
  const parsed = parse0030Body(dec); // checksum 검증 포함 (실패 시 throw)
  const inner = parsed.inner;
  const isMsg32 = inner.length >= 6 && inner.readUInt32LE(0) === 0;
  const code = isMsg32 ? inner.readUInt16BE(4) : readInnerCode(inner);
  const bodyLen = isMsg32 ? inner.length - 6 : inner.length - 2;
  return { code, bodyLen, id: parsed.id, innerLen: parsed.innerLen };
}

test('live walk bytes: 0x0304→0x0306→0x0314 consecutive emits well-framed 0x0305/0x0307/0x0315 (single parser, no desync)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-314-'));
  const tables = loadChildCodecTables();
  const store = createCharacterStore(join(dir, 'chars.json'));
  store.addCharacter('inei00', {
    power: 1, lastname: 'Test', firstname: 'Pilot', face: 1, rank: 0x0d,
  });
  const server = createPlayableServer({
    port: 0, host: '127.0.0.1', characterStore: store, tables,
    transportKey: TRANSPORT_KEY, decipherKey: DECIPHER_KEY,
  });
  await server.listen();
  const { port } = server.address();
  const socket = net.connect({ host: '127.0.0.1', port });
  await once(socket, 'connect');
  const collector = createCollector(socket);

  try {
    const phase1Key = Buffer.from('11223344556677889900aabbccddeeff', 'hex');
    socket.write(buildPhase1Frame({ phase1Key, sequence: 1, tables }));
    // phase3(0x0035)
    await collector.waitFor(1);

    // login → keysetup+redirect (2)
    socket.write(build0030Transport({ phase1Key, id: 1, inner: CREDENTIAL_INNER, tables }));
    await collector.waitFor(3);

    // lobby login 0x2000 → 0x2001 (1)
    const lobbyLogin = Buffer.from('200047494e3700040000070069006e00650069003000300000', 'hex');
    socket.write(build0030Transport({ phase1Key, id: 2, inner: lobbyLogin, tables }));
    await collector.waitFor(4);

    // session login 0x2009 → 0x200a (1)
    const sessionReq = Buffer.alloc(10);
    sessionReq.writeUInt16BE(0x2009, 0);
    sessionReq.writeUInt32LE(1, 2);
    sessionReq.writeUInt32LE(1, 6);
    socket.write(build0030Transport({ phase1Key, id: 3, inner: sessionReq, tables }));
    await collector.waitFor(5);

    // game login 0x0200 → 0x0201 (1)
    const gameLogin = Buffer.from('020047494e370057', 'hex');
    socket.write(build0030Transport({ phase1Key, id: 4, inner: gameLogin, tables }));
    await collector.waitFor(6);

    // 0x0205 → world burst 0x0206/0x0204/0x0323/0x0325 (4)
    const gameLoginReq = Buffer.alloc(2);
    gameLoginReq.writeUInt16BE(0x0205, 0);
    socket.write(build0030Transport({ phase1Key, id: 5, inner: gameLoginReq, tables }));
    const preAdmission = await collector.waitFor(10, 10000);
    const baseCount = preAdmission.length; // 10 프레임 (phase3 + 2 login + 2001 + 200a + 0201 + 4 world)

    // ─── 라이브 워크 재현: 0x0304, 0x0306, 0x0314 를 연속 전송(응답 사이 대기 없이) ───
    // 실클라 워크는 0x0305 팝 후 0x0306, 0x0307 팝 후 0x0314 를 보내지만, 서버 emit 바이트의
    // 정합성 검증에는 3요청을 몰아 보내도 동일하다(서버는 요청별로 독립 프레임을 write). 핵심은
    // 응답 3프레임을 단일 파서가 desync 없이 [0x0305,0x0307,0x0315] 로 잘라내는지.
    for (const [id, code] of [[0x1a, 0x0304], [0x1b, 0x0306], [0x1c, 0x0314]]) {
      const req = Buffer.alloc(2);
      req.writeUInt16BE(code, 0);
      socket.write(build0030Transport({ phase1Key, id, inner: req, tables }));
    }
    const all = await collector.waitFor(baseCount + 3, 12000);
    const admission = all.slice(baseCount, baseCount + 3).map((fr) => decodeFrame(fr, tables));

    // ★핵심 대조: 3응답이 정확히 [0x0305, 0x0307, 0x0315] 코드로, 각 클라 고정크기 테이블
    //   바디(0x520a / 0xe5b2 / 0x138c)로 도달. 0x0315 가 0x0305/0x0307 과 동일 구조여야 한다.
    assert.deepEqual(
      admission.map((a) => a.code),
      [0x0305, 0x0307, 0x0315],
      `admission codes must be [0x0305,0x0307,0x0315], got [${admission.map((a) => '0x' + a.code.toString(16)).join(',')}]`,
    );
    assert.equal(admission[0].bodyLen, 0x520a, '0x0305 body 21002B (client fixed-size table)');
    assert.equal(admission[1].bodyLen, 0xe5b2, '0x0307 body 58802B (client fixed-size table) — desync 발원 후보');
    assert.equal(admission[2].bodyLen, 0x138c, '0x0315 body 5004B (client fixed-size table)');

    // 파서 잔여 바이트 0 — 3프레임이 스트림을 정확히 소진(트레일링/부족 바이트 없음 = 프레이밍 정합).
    assert.equal(collector.bufferedBytes, 0, 'no leftover bytes after 3 admission frames (frame boundaries exact)');

    // reply id 단조 증가(요청 id 재사용/역행 없음 — 클라 decrypt 시퀀스 게이트 정합).
    assert.ok(admission[0].id < admission[1].id, 'reply id monotonic 0x0305 < 0x0307');
    assert.ok(admission[1].id < admission[2].id, 'reply id monotonic 0x0307 < 0x0315');
  } finally {
    socket.destroy();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
