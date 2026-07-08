// logh7-character-encode.test.mjs — 고정크기 S→C 인코더 TDD 테스트
//
// 대상:
//   encodeResponseInfoAccount  → 0x1001, 448B (0x1c0)
//   encodeLobbyCharCardList    → 0x2004, 1756B (0x6dc)
//
// 근거 문서: docs/reference/legacy-evidence/logh7-character-creation-wire.md §8

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeResponseInfoAccount,
  encodeLobbyCharCardList,
  RESP_INFO_ACCOUNT_SIZE,
  LOBBY_CHAR_CARD_LIST_SIZE,
  CODE_RESP_INFO_ACCOUNT,
  CODE_LOBBY_RESP_INFO_CHAR,
  NAME_MAX_CHARS,
  MAX_ENTRY_CHARS,
  MAX_EXTENSION_CHARS,
} from '../src/server/logh7-character-codec.mjs';

// ─── 공통 헬퍼 ──────────────────────────────────────────────────────────────

/** message32 inner에서 code 읽기: [u32 LE 0][u16 BE code][body] */
function readCode(msg32) {
  assert.equal(msg32.readUInt32LE(0), 0, 'message32 prefix u32=0');
  return msg32.readUInt16BE(4);
}

function body(msg32) {
  return msg32.subarray(6);
}

// ─── §1 encodeResponseInfoAccount — 0x1001, 448B ────────────────────────────

test('encodeResponseInfoAccount: message32 code=0x1001', () => {
  const msg = encodeResponseInfoAccount();
  assert.equal(readCode(msg), CODE_RESP_INFO_ACCOUNT);
});

test('encodeResponseInfoAccount: body 정확히 448B (0x1c0)', () => {
  const msg = encodeResponseInfoAccount();
  assert.equal(body(msg).length, RESP_INFO_ACCOUNT_SIZE);
  assert.equal(RESP_INFO_ACCOUNT_SIZE, 0x1c0);
});

test('encodeResponseInfoAccount: 빈 chars → extension_count=0, entry_count=0', () => {
  const b = body(encodeResponseInfoAccount({}, []));
  assert.equal(b[0x008], 0, 'extension_count=0');
  assert.equal(b[0x1a8], 0, 'entry_count=0');
});

test('encodeResponseInfoAccount: state/fame 헤더', () => {
  const b = body(encodeResponseInfoAccount({ state: 3, fame: 0xdeadbeef }, []));
  assert.equal(b[0x000], 3,           'state@0x000');
  assert.equal(b.readUInt32LE(0x004), 0xdeadbeef >>> 0, 'fame@0x004 u32 LE');
});

// 캐릭터 1개 extension_character 레코드 검증
test('encodeResponseInfoAccount: extension_character[0] — sid, face @오프셋', () => {
  const chars = [{ id: 42, face: 0x12345678, power: 2, rank: 0x0d }];
  const b = body(encodeResponseInfoAccount({}, chars));
  assert.equal(b[0x008], 1, 'extension_count=1');
  // record base = 0x00c + 0*0xcc = 0x00c
  assert.equal(b.readUInt32LE(0x00c + 0x00), 42,          'sid@+0x00');
  assert.equal(b[0x00c + 0x04], 2,                         'power@+0x04');
  assert.equal(b[0x00c + 0xaf], 0x0d,                      'rank@+0xaf');
  assert.equal(b.readUInt32LE(0x00c + 0xb0), 0x12345678,   'face@+0xb0');
});

// 이름 슬롯 26B(u16[13]) 검증: 슬롯 시작은 field+2 (u8 len + u8 pad 이후)
test('encodeResponseInfoAccount: lastname 필드 28B 레이아웃 (u8 len + u8 pad + u16[13])', () => {
  const chars = [{ id: 1, lastname: 'Yang' }];
  const b = body(encodeResponseInfoAccount({}, chars));
  const fieldOff = 0x00c + 0x22; // lastname @ +0x22
  assert.equal(b[fieldOff],     4,      'len=4');
  assert.equal(b[fieldOff + 1], 0,      'pad=0');
  // u16[0] = 'Y' = 0x0059 LE
  assert.equal(b.readUInt16LE(fieldOff + 2), 'Y'.charCodeAt(0), "'Y' u16 LE");
  assert.equal(b.readUInt16LE(fieldOff + 4), 'a'.charCodeAt(0), "'a' u16 LE");
  // 슬롯 전체 = 26B: b[fieldOff+2 .. fieldOff+27]
  assert.equal(fieldOff + 2 + 26, 0x00c + 0x22 + 28, '다음 필드 시작 = +0x3e');
});

// +0x22 lastname → +0x3e firstname 간격 = 0x1c = 28
test('encodeResponseInfoAccount: 이름 필드 오프셋 간격 각 0x1c=28', () => {
  const nameOffsets = [0x22, 0x3e, 0x5a, 0x76, 0x92]; // 5개 이름 필드 (record-relative)
  for (let i = 0; i < nameOffsets.length - 1; i++) {
    assert.equal(nameOffsets[i + 1] - nameOffsets[i], 0x1c,
      `간격 [${i}→${i+1}] = 0x1c`);
  }
  // blood가 basename+0xae에 오는지
  assert.equal(0x92 + 0x1c, 0xae, 'flagship 끝 + 간격 = blood 오프셋');
});

// entry_count + committed ids
test('encodeResponseInfoAccount: entry_count + committed ids (tail)', () => {
  const chars = [{ id: 10 }, { id: 20 }, { id: 30 }];
  const b = body(encodeResponseInfoAccount({}, chars));
  assert.equal(b[0x1a8], 3, 'entry_count=3');
  assert.equal(b.readUInt32LE(0x1ac),      10, 'committed id[0]');
  assert.equal(b.readUInt32LE(0x1ac + 4),  20, 'committed id[1]');
  assert.equal(b.readUInt32LE(0x1ac + 8),  30, 'committed id[2]');
});

// MAX_ENTRY_CHARS cap
test('encodeResponseInfoAccount: entry_count ≤ MAX_ENTRY_CHARS(5) 클램핑', () => {
  const chars = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
  const b = body(encodeResponseInfoAccount({}, chars));
  assert.equal(b[0x1a8], MAX_ENTRY_CHARS, `entry_count clamped to ${MAX_ENTRY_CHARS}`);
});

// MAX_EXTENSION_CHARS cap
test('encodeResponseInfoAccount: extension_count ≤ MAX_EXTENSION_CHARS(2) 클램핑', () => {
  const chars = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
  const b = body(encodeResponseInfoAccount({}, chars));
  assert.equal(b[0x008], MAX_EXTENSION_CHARS, 'extension_count clamped to 2');
});

// 두 번째 extension_character 레코드 (stride 0xcc)
test('encodeResponseInfoAccount: extension_character[1] stride=0xcc', () => {
  const chars = [{ id: 1, face: 0xaabbccdd }, { id: 2, face: 0x11223344 }];
  const b = body(encodeResponseInfoAccount({}, chars));
  const rec0 = 0x00c + 0 * 0xcc;
  const rec1 = 0x00c + 1 * 0xcc;
  assert.equal(b.readUInt32LE(rec0 + 0xb0), 0xaabbccdd, 'rec0.face');
  assert.equal(b.readUInt32LE(rec1 + 0xb0), 0x11223344, 'rec1.face');
});

// ability8 오프셋 (+0x12)
test('encodeResponseInfoAccount: ability8 @+0x12 (u16[8])', () => {
  const chars = [{ id: 1, ability8: [10, 20, 30, 40, 50, 60, 70, 80] }];
  const b = body(encodeResponseInfoAccount({}, chars));
  const base = 0x00c + 0x12;
  for (let j = 0; j < 8; j++) {
    assert.equal(b.readUInt16LE(base + j * 2), (j + 1) * 10, `ability[${j}]`);
  }
});

// 0x1c0 tail 경계 검증
test('encodeResponseInfoAccount: 0x1ac+5*4 = 0x1c0 (body boundary)', () => {
  assert.equal(0x1ac + MAX_ENTRY_CHARS * 4, 0x1c0, 'tail end = body size');
});

// ─── §2 encodeLobbyCharCardList — 0x2004, 1756B ──────────────────────────────

test('encodeLobbyCharCardList: message32 code=0x2004', () => {
  const msg = encodeLobbyCharCardList([]);
  assert.equal(readCode(msg), CODE_LOBBY_RESP_INFO_CHAR);
});

test('encodeLobbyCharCardList: body 정확히 1756B (0x6dc)', () => {
  const msg = encodeLobbyCharCardList([]);
  assert.equal(body(msg).length, LOBBY_CHAR_CARD_LIST_SIZE);
  assert.equal(LOBBY_CHAR_CARD_LIST_SIZE, 0x6dc);
});

test('encodeLobbyCharCardList: 빈 chars → information_count=0', () => {
  const b = body(encodeLobbyCharCardList([]));
  assert.equal(b[0x000], 0, 'information_count=0');
});

test('encodeLobbyCharCardList: information_count=1 설정됨', () => {
  const b = body(encodeLobbyCharCardList([{ id: 7 }]));
  assert.equal(b[0x000], 1, 'information_count=1');
});

// charged_character_count @ record+0x2a1
test('encodeLobbyCharCardList: charged_character_count@0x2a1=1', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1 }]));
  const recBase = 0x004 + 0 * 0x36c;
  assert.equal(b[recBase + 0x2a1], 1, 'charged_character_count=1');
});

// ChargedCharacter sid @ record+0x2a4
test('encodeLobbyCharCardList: ChargedCharacter sid@record+0x2a4', () => {
  const b = body(encodeLobbyCharCardList([{ id: 0xcafe }]));
  const recBase = 0x004;
  assert.equal(b.readUInt32LE(recBase + 0x2a4 + 0x00), 0xcafe, 'sid');
});

// face @ record+0x354 (= card+0xb0)
test('encodeLobbyCharCardList: face@record+0x354 (card+0xb0)', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1, face: 0x87654321 }]));
  const recBase = 0x004;
  assert.equal(b.readUInt32LE(recBase + 0x354), 0x87654321, 'face');
});

// 서버세이프 status 바이트 검증 [UNCONFIRMED 기본값]
test('encodeLobbyCharCardList: status byte @ card+0x04 = 1 (서버세이프 기본값, 미확정)', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1 }]));
  const recBase = 0x004;
  const cb = recBase + 0x2a4;
  // 미확정: +0x04가 status 바이트라는 가정. RE 추가 확인 필요.
  assert.equal(b[cb + 0x04], 1, 'status 추정값=1');
  // 나머지 5바이트 = 0
  for (let i = 1; i < 6; i++) {
    assert.equal(b[cb + 0x04 + i], 0, `status 나머지 u8[${i}]=0`);
  }
});

// lastname 이름 필드 @record+0x2c6 (= card+0x22)
test('encodeLobbyCharCardList: lastname 슬롯 @record+0x2c6', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1, lastname: 'Reinhard' }]));
  const recBase = 0x004;
  const fieldOff = recBase + 0x2c6; // = recBase + 0x2a4 + 0x22
  assert.equal(b[fieldOff],     8,      'len=8');
  assert.equal(b[fieldOff + 1], 0,      'pad=0');
  assert.equal(b.readUInt16LE(fieldOff + 2), 'R'.charCodeAt(0), "'R' u16 LE");
});

// 이름 필드 오프셋 간격 검증 (0x2004에서도 0x1c=28)
test('encodeLobbyCharCardList: 이름 필드 오프셋 간격 0x1c=28 (0x2c6→0x2e2→...)', () => {
  const nameAbsOffsets = [0x2c6, 0x2e2, 0x2fe, 0x31a, 0x336]; // record-relative
  for (let i = 0; i < nameAbsOffsets.length - 1; i++) {
    assert.equal(nameAbsOffsets[i + 1] - nameAbsOffsets[i], 0x1c,
      `간격 [${i}→${i+1}]`);
  }
  assert.equal(0x336 + 0x1c, 0x352, 'flagship 끝+0x1c = blood 오프셋 0x352');
});

// blood/rank @ record+0x352/0x353
test('encodeLobbyCharCardList: blood@0x352, rank@0x353', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1, blood: 3, rank: 0x0d }]));
  const recBase = 0x004;
  assert.equal(b[recBase + 0x352], 3,    'blood');
  assert.equal(b[recBase + 0x353], 0x0d, 'rank');
});

// record 경계: recBase + 0x36c 이후는 0 (두 번째 record 없을 때)
test('encodeLobbyCharCardList: information_count=1 시 두 번째 레코드 영역 zero', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1 }]));
  const secondRecStart = 0x004 + 0x36c;
  // information_count=1이므로 두 번째 레코드는 zero-filled
  assert.equal(b[secondRecStart], 0, '두 번째 레코드 zero');
});

// 두 번째 InformationCharacterCharge (stride 0x36c)
test('encodeLobbyCharCardList: InformationCharacterCharge[1] stride=0x36c', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1, face: 0xaaaa }, { id: 2, face: 0xbbbb }]));
  const rec0Base = 0x004 + 0 * 0x36c;
  const rec1Base = 0x004 + 1 * 0x36c;
  assert.equal(b.readUInt32LE(rec0Base + 0x2a4 + 0xb0), 0xaaaa, 'rec0.face');
  assert.equal(b.readUInt32LE(rec1Base + 0x2a4 + 0xb0), 0xbbbb, 'rec1.face');
});

// ─── §3 lobby session 통합: 0x1001 핸들러 결과 검증 ─────────────────────────
// (lobby-session.test.mjs의 기존 테스트가 크기만 검증했으므로
//  여기서 핵심 오프셋도 추가 검증)

import { handleLobbyInner } from '../src/server/logh7-lobby-session.mjs';
import { createCharacterStore } from '../src/server/logh7-character-store.mjs';
import { CODE_REQ_INFO_ACCOUNT } from '../src/server/logh7-character-codec.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeTmpStore() {
  const dir = mkdtempSync(join(tmpdir(), 'logh7-enc-'));
  return createCharacterStore(join(dir, 'chars.json'));
}

test('lobby 0x1000→0x1001: body 448B + 핵심 오프셋 (캐릭터 1개)', () => {
  const store = makeTmpStore();
  const rec = store.addCharacter('acc1', {
    lastname: 'Yang', firstname: 'Wenli',
    power: 3, rank: 5, face: 0x99, blood: 1,
  });

  const reqInner = Buffer.allocUnsafe(2);
  reqInner.writeUInt16BE(CODE_REQ_INFO_ACCOUNT, 0);
  const resp = handleLobbyInner(reqInner, 'acc1', store);

  // message32 래퍼
  assert.equal(resp.readUInt32LE(0), 0, 'prefix u32=0');
  assert.equal(resp.readUInt16BE(4), CODE_RESP_INFO_ACCOUNT, 'code=0x1001');

  const b = resp.subarray(6);
  assert.equal(b.length, 0x1c0, 'body=448B');
  assert.equal(b[0x008], 1, 'extension_count=1');

  const recOff = 0x00c; // record[0]
  assert.equal(b.readUInt32LE(recOff + 0x00), rec.id, 'sid');
  assert.equal(b[recOff + 0x04], 3,   'power');
  assert.equal(b[recOff + 0xaf], 5,   'rank');
  assert.equal(b[recOff + 0xae], 1,   'blood');
  assert.equal(b.readUInt32LE(recOff + 0xb0), 0x99, 'face');

  // lastname 슬롯 len
  assert.equal(b[recOff + 0x22], 'Yang'.length, 'lastname len');

  // entry_count + committed id
  assert.equal(b[0x1a8], 1,     'entry_count=1');
  assert.equal(b.readUInt32LE(0x1ac), rec.id, 'committed id[0]');
});
