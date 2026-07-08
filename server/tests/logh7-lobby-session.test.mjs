// logh7-lobby-session.test.mjs — 로비 세션 inner 메시지 라우팅 테스트

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { handleLobbyInner } from '../src/server/logh7-lobby-session.mjs';
import { createCharacterStore } from '../src/server/logh7-character-store.mjs';
import {
  CODE_REQ_INFO_ACCOUNT,
  CODE_RESP_INFO_ACCOUNT,
  CODE_REQ_CHAR_ENTRY_STATE,
  CODE_RESP_CHAR_ENTRY_STATE,
  CODE_CMD_ORIGINAL_CHARGE,
  CODE_CMD_EXTENSION_CHARGE,
  CODE_CMD_GENERATE_CHARGE,
  CODE_LOBBY_CMD_DELETE_CHAR,
  encodeGenerateCharOk,
  decodeGenerateCharReq,
} from '../src/server/logh7-character-codec.mjs';

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function makeTmpStore() {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-sess-'));
  return createCharacterStore(join(dir, 'chars.json'));
}

/** C→S inner: [u16 BE code][body] */
function makeInner(code, body = Buffer.alloc(0)) {
  const buf = Buffer.allocUnsafe(2 + body.length);
  buf.writeUInt16BE(code, 0);
  body.copy(buf, 2);
  return buf;
}

/** S→C message32 inner에서 code 읽기: [u32 LE 0][u16 BE code][body] */
function readResponseCode(resp) {
  assert.ok(resp instanceof Buffer, 'response must be Buffer');
  assert.ok(resp.length >= 6, `response too short: ${resp.length}`);
  assert.equal(resp.readUInt32LE(0), 0, 'message32 prefix[0:4] must be 0');
  return resp.readUInt16BE(4);
}

function responseBody(resp) {
  return resp.subarray(6);
}

// ─── 0x1000 RequestInformationAccount → 0x1001 ───────────────────────────────

test('0x1000 → 0x1001 응답 반환', () => {
  const store = makeTmpStore();
  const inner = makeInner(CODE_REQ_INFO_ACCOUNT);
  const resp = handleLobbyInner(inner, 'acc1', store);
  assert.equal(readResponseCode(resp), CODE_RESP_INFO_ACCOUNT);
});

test('0x1001 body는 0x1c0 bytes (stub)', () => {
  const store = makeTmpStore();
  const inner = makeInner(CODE_REQ_INFO_ACCOUNT);
  const resp = handleLobbyInner(inner, 'acc1', store);
  // [TODO-1001] 레이아웃 미확정 — 크기만 검증
  assert.equal(responseBody(resp).length, 0x1c0);
});

// ─── 0x1004 RequestCharEntryState → 0x1005 ───────────────────────────────────

test('0x1004 → 0x1005 응답 반환', () => {
  const store = makeTmpStore();
  const inner = makeInner(CODE_REQ_CHAR_ENTRY_STATE);
  const resp = handleLobbyInner(inner, 'acc1', store);
  assert.equal(readResponseCode(resp), CODE_RESP_CHAR_ENTRY_STATE);
});

test('0x1005 body는 0x20 bytes (stub)', () => {
  const store = makeTmpStore();
  const inner = makeInner(CODE_REQ_CHAR_ENTRY_STATE);
  const resp = handleLobbyInner(inner, 'acc1', store);
  // [TODO-1005] 레이아웃 미확정 — 크기만 검증
  assert.equal(responseBody(resp).length, 0x20);
});

// ─── 0x1008 캐릭터 생성 왕복 ─────────────────────────────────────────────────

// 실클라 캡처 벡터 (codec 테스트에서 동일 사용)
// Reinhard/Lohengramm, power=2(제국), blood=2, sex=0
const REINHARD_INNER = Buffer.from(
  '1008' +        // code
  '00000000' +    // requestCategory=0
  '00' +          // reserved
  '02' +          // power=2
  '02' +          // blood=2
  '00' +          // sex=0
  '09' + '00' +   // lastname len=9, pad
  '520065006900' + '6e006800610072006400' + '00' + // "Reinhard" UTF-16LE + NUL
  '0b' + '00' +   // firstname len=11, pad
  '4c006f006800' + '65006e006700720061006d006d00' + '00' + // "Lohengramm" + NUL
  '00000000' +    // face=0
  '0000000000000000000000000000000000000000' + // ability8=zeros (8×4=32hex pairs... let me recalculate)
  '0000' +        // bonusPoint
  '00' +          // specialAbilityNum
  '00' +          // title
  '00',           // rank
  'hex'
);

// ability8은 8개 u8 = 8 bytes = 16 hex chars
// let me build the correct Reinhard inner properly in the test
function makeReinhard() {
  // [u16 BE 0x1008][body]
  // body layout (from codec): reqCat(4)+reserved(1)+power(1)+blood(1)+sex(1)+
  //   lastname packed utf16LE + firstname packed utf16LE +
  //   face(u32 LE, 4) + ability8(8) + bonusPoint(u16 LE) + specialAbilityNum(u8) +
  //   title(u8) + rank(u8)
  const nameLen = 2 + 8 * 2 + 1; // len(1)+pad(1)+chars+NUL = 20 bytes for "Reinhard"
  const fnLen = 2 + 10 * 2 + 1;  // 23 bytes for "Lohengramm"
  const bodySize = 4 + 1 + 1 + 1 + 1 + nameLen + fnLen + 4 + 8 + 2 + 1 + 1 + 1;
  const body = Buffer.alloc(bodySize);
  let c = 0;
  body.writeUInt32LE(0, c); c += 4; // requestCategory
  body[c++] = 0; // reserved
  body[c++] = 2; // power
  body[c++] = 2; // blood
  body[c++] = 0; // sex
  // lastname "Reinhard" packed utf16LE
  const ln = 'Reinhard';
  body[c++] = ln.length + 1; // len incl NUL
  body[c++] = 0;             // pad
  for (const ch of ln) { body.writeUInt16LE(ch.charCodeAt(0), c); c += 2; }
  body[c++] = 0; // NUL
  // firstname "Lohengramm"
  const fn = 'Lohengramm';
  body[c++] = fn.length + 1;
  body[c++] = 0;
  for (const ch of fn) { body.writeUInt16LE(ch.charCodeAt(0), c); c += 2; }
  body[c++] = 0; // NUL
  // face u32 LE
  body.writeUInt32LE(0, c); c += 4;
  // ability8: 8 bytes zeros already
  c += 8;
  // bonusPoint u16 LE
  body.writeUInt16LE(0, c); c += 2;
  // specialAbilityNum
  body[c++] = 0;
  // title
  body[c++] = 0;
  // rank
  body[c++] = 0;

  const inner = Buffer.allocUnsafe(2 + body.length);
  inner.writeUInt16BE(CODE_CMD_GENERATE_CHARGE, 0);
  body.copy(inner, 2);
  return inner;
}

test('0x1008 캐릭터 생성 → 0x1008 OK 응답 반환', () => {
  const store = makeTmpStore();
  const inner = makeReinhard();
  const resp = handleLobbyInner(inner, 'acc1', store);
  assert.equal(readResponseCode(resp), CODE_CMD_GENERATE_CHARGE);
});

test('0x1008 생성 후 store에 캐릭터 영속', () => {
  const store = makeTmpStore();
  const inner = makeReinhard();
  handleLobbyInner(inner, 'acc1', store);
  const chars = store.getCharacters('acc1');
  assert.equal(chars.length, 1);
  assert.equal(chars[0].lastname, 'Reinhard');
  assert.equal(chars[0].firstname, 'Lohengramm');
  assert.equal(chars[0].power, 2);
});

// ─── 0x2008 캐릭터 삭제 ────────────────────────────────────────────────────────

test('0x2008 삭제 → 0x2008 OK 응답 반환', () => {
  const store = makeTmpStore();
  const rec = store.addCharacter('acc1', { lastname: 'Yang' });

  const body = Buffer.allocUnsafe(4);
  body.writeUInt32LE(rec.id, 0);
  const inner = makeInner(CODE_LOBBY_CMD_DELETE_CHAR, body);
  const resp = handleLobbyInner(inner, 'acc1', store);
  assert.equal(readResponseCode(resp), CODE_LOBBY_CMD_DELETE_CHAR);
});

test('0x2008 삭제 후 store에서 제거됨', () => {
  const store = makeTmpStore();
  const rec = store.addCharacter('acc1', { lastname: 'Yang' });

  const body = Buffer.allocUnsafe(4);
  body.writeUInt32LE(rec.id, 0);
  const inner = makeInner(CODE_LOBBY_CMD_DELETE_CHAR, body);
  handleLobbyInner(inner, 'acc1', store);
  assert.equal(store.getCharacters('acc1').length, 0);
});

// ─── 0x1006 CommandOriginalCharacterCharge ────────────────────────────────────

test('0x1006 → 0x1006 echo 응답 반환', () => {
  const store = makeTmpStore();
  // body: 6 dwords = 24 bytes
  const body = Buffer.alloc(24);
  body.writeUInt32LE(42, 0); // charId=42 (추정)
  const inner = makeInner(CODE_CMD_ORIGINAL_CHARGE, body);
  const resp = handleLobbyInner(inner, 'acc1', store);
  assert.equal(readResponseCode(resp), CODE_CMD_ORIGINAL_CHARGE);
});

// ─── 0x1007 CommandExtensionCharacterCharge ───────────────────────────────────

test('0x1007 → 0x1007 echo 응답 반환', () => {
  const store = makeTmpStore();
  // body: [u8 count=1][u32 LE charId]
  const body = Buffer.alloc(5);
  body[0] = 1;
  body.writeUInt32LE(7, 1);
  const inner = makeInner(CODE_CMD_EXTENSION_CHARGE, body);
  const resp = handleLobbyInner(inner, 'acc1', store);
  assert.equal(readResponseCode(resp), CODE_CMD_EXTENSION_CHARGE);
});

// ─── 가드: 잘못된 코드 ────────────────────────────────────────────────────────

test('알 수 없는 코드 → RangeError throw', () => {
  const store = makeTmpStore();
  const inner = makeInner(0xdead);
  assert.throws(
    () => handleLobbyInner(inner, 'acc1', store),
    RangeError
  );
});

// ─── 가드: 짧은 body ──────────────────────────────────────────────────────────

test('0x1008 body 너무 짧음 → RangeError throw', () => {
  const store = makeTmpStore();
  const inner = makeInner(CODE_CMD_GENERATE_CHARGE, Buffer.alloc(5)); // < 0x12
  assert.throws(
    () => handleLobbyInner(inner, 'acc1', store),
    RangeError
  );
});

test('0x2008 body 없음 → RangeError throw', () => {
  const store = makeTmpStore();
  const inner = makeInner(CODE_LOBBY_CMD_DELETE_CHAR, Buffer.alloc(0)); // < 4
  assert.throws(
    () => handleLobbyInner(inner, 'acc1', store),
    RangeError
  );
});

// ─── 왕복: 생성→조회→삭제 ─────────────────────────────────────────────────────

test('생성→조회→삭제 왕복 영속 정합성', () => {
  const store = makeTmpStore();

  // 생성
  handleLobbyInner(makeReinhard(), 'acc1', store);
  const after1 = store.getCharacters('acc1');
  assert.equal(after1.length, 1);

  // 삭제
  const charId = after1[0].id;
  const delBody = Buffer.allocUnsafe(4);
  delBody.writeUInt32LE(charId, 0);
  handleLobbyInner(makeInner(CODE_LOBBY_CMD_DELETE_CHAR, delBody), 'acc1', store);

  assert.equal(store.getCharacters('acc1').length, 0);
});
