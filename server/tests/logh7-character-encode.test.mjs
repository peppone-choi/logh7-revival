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

// compact stream 정본: record starts at offset 1
// [u16LE id][u8 status=1][utf16BE name]…
test('encodeLobbyCharCardList stream: id/status at offset 1', () => {
  const b = body(encodeLobbyCharCardList([{ id: 0xcafe, lastname: 'Reinhard' }]));
  assert.equal(b[0], 1, 'count');
  assert.equal(b.readUInt16LE(1), 0xcafe, 'id');
  assert.equal(b[3], 1, 'status=1 selectable');
});

test('encodeLobbyCharCardList stream: name length after status', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1, lastname: 'Reinhard', firstname: '' }]));
  // name field = display "Reinhard" → units len = 8 chars + NUL = 9
  assert.equal(b[4], 9, 'name units incl NUL');
  assert.equal(b.readUInt16BE(5), 'R'.charCodeAt(0));
});

test('encodeLobbyCharCardList stream: two records count=2', () => {
  const b = body(encodeLobbyCharCardList([
    { id: 1, lastname: 'A' },
    { id: 2, lastname: 'B' },
  ]));
  assert.equal(b[0], 2);
  assert.equal(b.readUInt16LE(1), 1);
});

test('encodeLobbyCharCardList stream: empty keeps zeros after count', () => {
  const b = body(encodeLobbyCharCardList([]));
  assert.equal(b[0], 0);
  assert.equal(b[1], 0);
  assert.equal(b[2], 0);
});

// 이름 필드 유닛 간격 상수 검증 (문서 0x1c 슬롯과 별개 — stream 필드 길이 cap)
test('encodeLobbyCharCardList stream: body still 0x6dc cap', () => {
  const b = body(encodeLobbyCharCardList([{ id: 1, lastname: 'Yang', firstname: 'Wenli' }]));
  assert.equal(b.length, 0x6dc);
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
