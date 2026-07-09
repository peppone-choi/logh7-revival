// logh7-lobby-login.test.mjs — 로비 진입 핸드셰이크(0x0020 / 0x2000 → 0x2001) 코덱 테스트
//
// 근거 데이터: .omo/live-qa/login-hw-20260707/trace.jsonl conn2 실측 프레임.
//   - 0x0034 phase1 프레임에서 phase1Key(encipherKey)를 복원하고,
//   - 그 키로 0x0030 봉투를 복호해 inner 0x0020 / 0x2000 을 실제로 디코드한다.
//   - 0x2001 LobbyLoginOK 응답 프레임을 만들고 다시 복호해 왕복 검증한다.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decryptBuffer,
  expandChildCodecKey,
  loadChildCodecTables,
} from '../src/server/logh7-child-codec.mjs';
import {
  deframe0030,
  parse0030Body,
  readInnerCode,
  unwrap0030Frame,
} from '../src/server/logh7-envelope-0030.mjs';
import {
  CODE_LOBBY_SESSION_INIT,
  CODE_LOBBY_LOGIN_REQUEST,
  CODE_LOBBY_LOGIN_OK,
  decodeLobbySessionInit,
  decodeLobbyLoginRequest,
  buildLobbyLoginOkInner,
  buildLobbyLoginOkMessage32Inner,
  buildLobbyLoginOkFrame,
} from '../src/server/logh7-lobby-login.mjs';
import { handleLobbyInner } from '../src/server/logh7-lobby-session.mjs';

// ─── 라이브 트레이스 실측 상수(conn2) ─────────────────────────────────────────
const LEGACY_TRANSPORT_KEY = Buffer.from(
  '7b41344331333734382d303135392d346335342d414542332d3144363835373537363142337d',
  'hex',
);
const LEGACY_DECIPHER_KEY = Buffer.from('5859', 'hex');

// conn2 handshake / lobby frames (trace.jsonl rawFrameHex)
const PHASE1_FRAME_0034 = Buffer.from('001a00349b4595f8b8ab02d57aa2facbb11e0691df1e6cc0f191d0f3', 'hex');
const FRAME_0020 = Buffer.from('00120030b31d38bab06cb8bbb27f87228de90d41', 'hex');
const FRAME_2000 = Buffer.from(
  '002a00308473d390b5cd7edf085369325f1abf312374faad996c230e9654df07b30dc515cf6ec37a3783e112',
  'hex',
);

const tables = loadChildCodecTables();

// phase1(0x0034) 프레임에서 클라의 encipherKey(=서버측 phase1Key)를 복원한다.
function recoverPhase1Key(phase1Frame) {
  const schedule = expandChildCodecKey(LEGACY_TRANSPORT_KEY, tables);
  const decoded = decryptBuffer(phase1Frame.subarray(4), schedule);
  const keyLen = decoded.readUInt16BE(2);
  return Buffer.from(decoded.subarray(4, 4 + keyLen));
}

// 클라 전송 0x0030 프레임을 phase1Key 로 복호해 inner 를 뽑는다.
function decodeClientInner(frame, phase1Key) {
  const { encBody } = deframe0030(frame);
  const body = decryptBuffer(encBody, expandChildCodecKey(phase1Key, tables));
  const parsed = parse0030Body(body);
  return { id: parsed.id, inner: parsed.inner };
}

// ─── 실측 프레임 디코드 ────────────────────────────────────────────────────────

test('conn2 phase1(0x0034)에서 phase1Key 16바이트 복원', () => {
  const key = recoverPhase1Key(PHASE1_FRAME_0034);
  assert.equal(key.length, 16);
  assert.equal(key.toString('hex'), '873d2830f290ba1f7552d100a0a49f8d');
});

test('실측 0x0020 프레임 → LobbySessionInit(selector=1)', () => {
  const key = recoverPhase1Key(PHASE1_FRAME_0034);
  const { inner } = decodeClientInner(FRAME_0020, key);
  assert.equal(readInnerCode(inner), CODE_LOBBY_SESSION_INIT);
  const decoded = decodeLobbySessionInit(inner);
  assert.equal(decoded.code, CODE_LOBBY_SESSION_INIT);
  assert.equal(decoded.selector, 1); // selector!=0 → 로비 세션(무응답)
});

test('실측 0x2000 프레임 → LobbyLoginRequest(GIN7 v4 LE, account="test01")', () => {
  const key = recoverPhase1Key(PHASE1_FRAME_0034);
  const { inner } = decodeClientInner(FRAME_2000, key);
  assert.equal(readInnerCode(inner), CODE_LOBBY_LOGIN_REQUEST);
  const cred = decodeLobbyLoginRequest(inner);
  assert.equal(cred.magic, 'GIN7');
  assert.equal(cred.version, 4); // ★conn1 로그인은 version 1(BE), conn2 로비는 version 4(LE)
  assert.equal(cred.flags, 0);
  assert.equal(cred.accountUnits, 7); // LE
  assert.equal(cred.account, 'test01');
});

// ─── 0x2001 응답 조립 + 왕복 ──────────────────────────────────────────────────

test('buildLobbyLoginOkInner → raw [u16BE 0x2001][u16BE 0]', () => {
  const inner = buildLobbyLoginOkInner({ status: 0 });
  assert.equal(inner.length, 4);
  assert.equal(inner.readUInt16BE(0), CODE_LOBBY_LOGIN_OK);
  assert.equal(inner.readUInt16BE(2), 0);
  // message32 래핑이 아님을 확인(prefix가 0x0000이 아니라 코드가 offset 0에 위치).
  assert.equal(inner.toString('hex'), '20010000');
});

test('buildLobbyLoginOkFrame subheader4 decrypts to message32 0x2001', () => {
  const { id } = decodeClientInner(FRAME_2000, recoverPhase1Key(PHASE1_FRAME_0034));
  const frame = buildLobbyLoginOkFrame({
    id,
    decipherKey: LEGACY_DECIPHER_KEY,
    tables,
    format: 'message32',
    subheaderLen: 4,
  });
  const { subheaderLen, encBody } = unwrap0030Frame(frame);
  assert.equal(subheaderLen, 4);
  const body = decryptBuffer(encBody, expandChildCodecKey(LEGACY_DECIPHER_KEY, tables));
  // pad8 가능 — parse0030Body 가 innerLen 으로 자름
  const parsed = parse0030Body(body);
  assert.equal(parsed.id, id);
  // message32: [u32 0][u16 BE 0x2001][status...]
  assert.equal(parsed.inner.readUInt32LE(0), 0);
  assert.equal(parsed.inner.readUInt16BE(4), CODE_LOBBY_LOGIN_OK);
  assert.equal(parsed.inner[6], 0);
});

// ─── handleLobbyInner 라우팅 ──────────────────────────────────────────────────

test('handleLobbyInner: 0x0020 → null(무응답)', () => {
  const key = recoverPhase1Key(PHASE1_FRAME_0034);
  const { inner } = decodeClientInner(FRAME_0020, key);
  assert.equal(handleLobbyInner(inner, 'test01', null), null);
});

test('handleLobbyInner: 0x2000 → message32 0x2001 LobbyLoginOK', () => {
  const key = recoverPhase1Key(PHASE1_FRAME_0034);
  const { inner } = decodeClientInner(FRAME_2000, key);
  const resp = handleLobbyInner(inner, 'test01', null);
  assert.ok(Buffer.isBuffer(resp));
  const expect = buildLobbyLoginOkMessage32Inner({ status: 0 });
  assert.equal(resp.toString('hex'), expect.toString('hex'));
  assert.equal(resp.readUInt16BE(4), CODE_LOBBY_LOGIN_OK);
});
