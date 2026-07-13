// logh7-character-hangul-name.test.mjs — 이름 경로 한글 UTF-16LE 무손실 회귀
//
// 이름 와이어는 UTF-16(UCS-2) 이므로 BMP 한글(U+AC00~U+D7A3)은 무손실로 실려야 한다.
// "홍길동" = U+D64D U+AE38 U+B3D9. 이 코드포인트가 각 프레임에 정확히 나타나는지 고정한다.
//   - C→S 0x1008 packed UTF-16LE decode (실제 인바운드 이름 경로)
//   - S→C 0x1008 pstr16 BE encode
//   - S→C 0x1001 고정크기 LE 이름 필드 encode

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeGenerateCharReq,
  encodeGenerateCharOk,
  encodeResponseInfoAccount,
} from '../src/server/logh7-character-codec.mjs';

const HONG = '홍길동'; // U+D64D U+AE38 U+B3D9
const CP = [0xd64d, 0xae38, 0xb3d9];

// C→S 0x1008 inner 조립: packed UTF-16LE 이름 [u8 len(chars+1)][u8 pad][u16LE×chars][u8 NUL]
function packUtf16LE(str) {
  const chars = [...str];
  const buf = Buffer.alloc(2 + chars.length * 2 + 1);
  buf[0] = chars.length + 1; // len includes NUL
  buf[1] = 0; // pad
  for (let i = 0; i < chars.length; i += 1) buf.writeUInt16LE(chars[i].charCodeAt(0), 2 + i * 2);
  return buf; // trailing NUL byte = alloc 0
}

function buildGenerateInner(lastname, firstname) {
  const head = Buffer.from([
    0x10, 0x08, // code 0x1008 (BE)
    0x00, 0x00, 0x00, 0x00, // requestCategory
    0x00, // reserved
    0x02, // power
    0x02, // blood
    0x00, // sex
  ]);
  const tail = Buffer.alloc(16); // face(4)+ability8(8)+bonus+special+title+rank
  return Buffer.concat([head, packUtf16LE(lastname), packUtf16LE(firstname), tail]);
}

test('C→S 0x1008 packed UTF-16LE가 한글 성명을 무손실 디코드한다', () => {
  const decoded = decodeGenerateCharReq(buildGenerateInner(HONG, '동'));
  assert.equal(decoded.lastname, HONG);
  assert.deepEqual([...decoded.lastname].map((c) => c.charCodeAt(0)), CP);
  assert.equal(decoded.firstname, '동');
});

test('C→S 0x1008 → S→C 0x1008 pstr16 BE 왕복이 한글 코드포인트를 보존한다', () => {
  const decoded = decodeGenerateCharReq(buildGenerateInner(HONG, ''));
  const inner = encodeGenerateCharOk({ lastname: decoded.lastname, firstname: decoded.firstname });
  // message32: [u32 0][u16 BE 0x1008][body]. body[4] = accepted, body[5..8] head, lastname pstr16 BE @ body+8
  const body = inner.subarray(6);
  // head: requestCategory(4) accepted(1) power(1) blood(1) sex(1) → pstr16 BE lastname @ 8
  const lastLen = body[8]; // chars+1
  assert.equal(lastLen, CP.length + 1);
  const be = [];
  for (let i = 0; i < CP.length; i += 1) be.push(body.readUInt16BE(9 + i * 2));
  assert.deepEqual(be, CP);
});

test('S→C 0x1001 고정크기 LE 이름 필드가 한글을 무손실로 싣는다', () => {
  const inner = encodeResponseInfoAccount(
    { state: 1, fame: 0 },
    [{ id: 7, lastname: HONG, firstname: '동', ability8: [0, 0, 0, 0, 0, 0, 0, 0] }],
  );
  const body = inner.subarray(6); // message32 헤더 제거
  // extension_character[0] base 0x00c, lastname 필드 @ +0x22 → body 0x2e
  const nameOff = 0x00c + 0x22;
  assert.equal(body[nameOff], CP.length); // u8 len = 유효 코드유닛 수(NUL 미포함)
  const le = [];
  for (let i = 0; i < CP.length; i += 1) le.push(body.readUInt16LE(nameOff + 2 + i * 2));
  assert.deepEqual(le, CP);
});
