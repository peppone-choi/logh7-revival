// logh7-character-codec.test.mjs — 캐릭터 코덱 TDD 테스트
//
// 테스트 전략:
//   1. 실클라 캡처 벡터 (Reinhard/Lohengramm) — [CW]§2.1 그대로 바이트 일치
//   2. encode→decode 왕복 (내부 정합성)
//   3. 필드 경계 가드 (이름 길이 cap, body 트런케이션)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CODE_CMD_GENERATE_CHARGE,
  CODE_LOBBY_CMD_DELETE_CHAR,
  CODE_LOBBY_REQ_INFO_CHAR,
  CODE_REQ_INFO_ACCOUNT,
  CODE_CMD_EXTENSION_CHARGE,
  CODE_CMD_ORIGINAL_CHARGE,
  decodeGenerateCharReq,
  encodeGenerateCharOk,
  decodeLobbyDeleteCharReq,
  encodeLobbyDeleteCharOk,
  decodeLobbyReqInfoChar,
  decodeReqInfoAccount,
  decodeExtensionCharReq,
  encodeExtensionCharOk,
  decodeOriginalCharReq,
  encodeOriginalCharOk,
  readCharMsgCode,
  NAME_MAX_CHARS,
} from '../src/server/logh7-character-codec.mjs';

// ─── 실클라 캡처 벡터 ─────────────────────────────────────────────────────────
// 근거: [CW]§2.1 "실클라 캡처 ground truth (2026-06-15)"
// lastname="Reinhard" (8 chars), firstname="Lohengramm" (10 chars),
// power=2(제국), blood=2, sex=0, face=0, ability8=all-0, rank=0
//
// inner = [u16 BE 1008][body]:
//   code:            10 08
//   requestCategory: 00 00 00 00
//   reserved:        00
//   power:           02
//   blood:           02
//   sex:             00
//   lastname_len:    09  (8 chars + NUL)
//   pad:             00
//   Reinhard UTF-16LE: 52 00 65 00 69 00 6e 00 68 00 61 00 72 00 64 00
//   NUL:             00
//   firstname_len:   0b  (10 chars + NUL)
//   pad:             00
//   Lohengramm UTF-16LE: 4c 00 6f 00 68 00 65 00 6e 00 67 00 72 00 61 00 6d 00 6d 00
//   NUL:             00
//   face:            00 00 00 00
//   ability8:        00 × 8
//   bonusPoint:      00
//   specialAbilityNum: 00
//   title:           00
//   rank:            00
const CAPTURE_INNER_HEX =
  '1008' +          // code
  '00000000' +      // requestCategory=0
  '00' +            // reserved
  '02' +            // power=2
  '02' +            // blood=2
  '00' +            // sex=0
  '09' +            // lastname_len=9
  '00' +            // pad
  '5200650069006e006800610072006400' + // "Reinhard"
  '00' +            // NUL
  '0b' +            // firstname_len=11
  '00' +            // pad
  '4c006f00680065006e006700720061006d006d00' + // "Lohengramm"
  '00' +            // NUL
  '00000000' +      // face=0
  '0000000000000000' + // ability8 all-0
  '00' +            // bonusPoint
  '00' +            // specialAbilityNum
  '00' +            // title
  '00';             // rank

// ─── §1 코드 상수 ─────────────────────────────────────────────────────────────

test('메시지 코드 상수 — Account 패밀리 base=0x1000', () => {
  // 근거: [CW]§1 PTR_s_RequestInformationAccount_0075ecb4 (9 entries, idx+0x1000)
  assert.equal(CODE_CMD_GENERATE_CHARGE, 0x1008);
  assert.equal(CODE_CMD_EXTENSION_CHARGE, 0x1007);
  assert.equal(CODE_CMD_ORIGINAL_CHARGE, 0x1006);
  assert.equal(CODE_REQ_INFO_ACCOUNT, 0x1000);
});

test('메시지 코드 상수 — Lobby 패밀리 base=0x2000', () => {
  // 근거: [CW]§1 PTR_s_LobbyLoginRequest_00765cb8 (12 entries, idx+0x2000)
  assert.equal(CODE_LOBBY_CMD_DELETE_CHAR, 0x2008);
  assert.equal(CODE_LOBBY_REQ_INFO_CHAR, 0x2003);
});

// ─── §2 0x1008 디코드 — 실클라 캡처 벡터 ──────────────────────────────────────

test('decodeGenerateCharReq — 실클라 캡처 벡터 (Reinhard/Lohengramm)', () => {
  const inner = Buffer.from(CAPTURE_INNER_HEX, 'hex');
  const result = decodeGenerateCharReq(inner);

  assert.equal(result.requestCategory, 0);
  assert.equal(result.power, 2,   'power=2(제국)');
  assert.equal(result.blood, 2,   'blood=2');
  assert.equal(result.sex, 0,     'sex=0');
  assert.equal(result.lastname, 'Reinhard');
  assert.equal(result.firstname, 'Lohengramm');
  assert.equal(result.face, 0);
  assert.deepEqual(result.ability8, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(result.bonusPoint, 0);
  assert.equal(result.specialAbilityNum, 0);
  assert.equal(result.title, 0);
  assert.equal(result.rank, 0);
});

test('decodeGenerateCharReq — code 불일치 시 throw', () => {
  const badCode = Buffer.from('1007000000', 'hex');
  assert.throws(() => decodeGenerateCharReq(badCode), /inner code/);
});

test('decodeGenerateCharReq — body 너무 짧으면 throw', () => {
  // code(2) + requestCategory(4) + 5 = 11 bytes (< 최솟값)
  const short = Buffer.concat([
    Buffer.from([0x10, 0x08]),
    Buffer.alloc(9),
  ]);
  assert.throws(() => decodeGenerateCharReq(short), /truncated|short|overrun/);
});

test('decodeGenerateCharReq — 이름 길이 cap (>13) throw', () => {
  // lastname_len=15 (14 chars) > NAME_MAX_CHARS=13 → throw
  const buf = Buffer.alloc(100);
  buf.writeUInt16BE(0x1008, 0);
  // body[0x04]=00 reserved, [0x05]=02 power, [0x06]=02 blood, [0x07]=00 sex
  buf[7] = 0x02; // power at body[5]=inner[7]
  buf[9] = 0x02; // blood at body[6]
  buf[10] = 0x0f; // lastname_len = 15 (14 chars) at body[8]=inner[10]
  assert.throws(() => decodeGenerateCharReq(buf), /max|length|over/i);
});

// ─── §3 0x1008 인코드 ─────────────────────────────────────────────────────────

test('encodeGenerateCharOk — message32 래퍼 형식 확인', () => {
  const inner = encodeGenerateCharOk({ lastname: 'Yang', firstname: 'Wenli' });
  // message32: [u32 LE 0][u16 BE code][128-byte body]
  assert.equal(inner.readUInt32LE(0), 0,       'u32 prefix = 0');
  assert.equal(inner.readUInt16BE(4), 0x1008,  'code = 0x1008');
  assert.equal(inner.length, 6 + 128,          'inner = 134 bytes');
});

test('encodeGenerateCharOk — body에 이름 쓰임 (pstr16 BE 검증)', () => {
  const inner = encodeGenerateCharOk({ lastname: 'A', firstname: 'BC' });
  const body = inner.subarray(6); // message32 prefix 제거
  // body[0x00-0x07]: requestCategory(4) + accepted+power+blood+sex(4) = 8 bytes
  // body[0x08]: lastname pstr16 BE: len=2 (1 char + NUL), then u16 BE 'A'=0x0041
  assert.equal(body[8], 2, 'lastname len=2 (1 char + NUL)');
  assert.equal(body.readUInt16BE(9), 0x0041, "'A' as u16 BE");
  // firstname start = 8 + 1 + 1*2 = 11
  const firstnameOff = 8 + 1 + 1 * 2;
  assert.equal(body[firstnameOff], 3, 'firstname len=3 (2 chars + NUL)');
  assert.equal(body.readUInt16BE(firstnameOff + 1), 0x0042, "'B' as u16 BE");
  assert.equal(body.readUInt16BE(firstnameOff + 3), 0x0043, "'C' as u16 BE");
});

test('encodeGenerateCharOk — check byte @ 0x7c', () => {
  const inner = encodeGenerateCharOk({ check: 0xab });
  const body = inner.subarray(6);
  assert.equal(body[0x7c], 0xab, 'check at fixed offset 0x7c');
  assert.equal(body.length, 128, 'body = 128 bytes');
});

test('encodeGenerateCharOk — rank 기본값 0x0d (소위)', () => {
  // 근거: [CW]§2.2 "server default is 0x0d=소위"
  const inner = encodeGenerateCharOk({});
  const body = inner.subarray(6);
  // rank 위치: header(8) + lastname(1 for len=0) + firstname(1 for len=0)
  //            + createUnknown44(4) + birth(2) + face(4) + ability8(8)
  //            + bonusPoint(1) + specialAbilityNum(1) + title(1) = rank at cursor
  // 빈 이름의 pstr16: len=0 → 1 byte
  const rankOff = 8 + 1 + 1 + 4 + 2 + 4 + 8 + 1 + 1 + 1;
  assert.equal(body[rankOff], 0x0d, 'rank default = 0x0d');
});

test('encodeGenerateCharOk — 이름 >13자 throw', () => {
  assert.throws(
    () => encodeGenerateCharOk({ lastname: 'A'.repeat(14) }),
    /exceeds/
  );
});

// ─── §4 0x2008 LobbyCommandDeleteCharacter ────────────────────────────────

test('decodeLobbyDeleteCharReq — characterId 정상 디코드', () => {
  // 근거: [CD] "RE-확정 형태 [u16 BE 0x2008][u32 LE characterId]"
  const inner = Buffer.alloc(6);
  inner.writeUInt16BE(0x2008, 0);
  inner.writeUInt32LE(42, 2);
  const result = decodeLobbyDeleteCharReq(inner);
  assert.equal(result.characterId, 42);
});

test('decodeLobbyDeleteCharReq — code 불일치 throw', () => {
  const inner = Buffer.alloc(6);
  inner.writeUInt16BE(0x2009, 0); // 잘못된 코드
  assert.throws(() => decodeLobbyDeleteCharReq(inner), /inner code/);
});

test('decodeLobbyDeleteCharReq — body 짧으면 throw', () => {
  const inner = Buffer.from([0x20, 0x08, 0x00]); // body=1 byte, < 4
  assert.throws(() => decodeLobbyDeleteCharReq(inner), /short/);
});

test('decodeLobbyDeleteCharReq — characterId 왕복 (encode→decode)', () => {
  const charId = 0xdeadbeef >>> 0;
  const inner = encodeLobbyDeleteCharOk({ characterId: charId });
  // S→C message32: [u32 0][u16 code][body]
  assert.equal(inner.readUInt32LE(0), 0);
  assert.equal(inner.readUInt16BE(4), 0x2008);
  // body의 첫 4바이트 = charId LE (미확정 구현이지만 왕복 내부 정합성 확인)
  const bodyCharId = inner.readUInt32LE(6);
  assert.equal(bodyCharId, charId);
});

// ─── §5 빈 요청 디코드 ────────────────────────────────────────────────────────

test('decodeLobbyReqInfoChar — code 검증 후 빈 객체 반환', () => {
  const inner = Buffer.from([0x20, 0x03]); // code=0x2003, body 없음
  const result = decodeLobbyReqInfoChar(inner);
  assert.deepEqual(result, {});
});

test('decodeLobbyReqInfoChar — 잘못된 code throw', () => {
  const inner = Buffer.from([0x20, 0x04]); // 0x2004 ≠ 0x2003
  assert.throws(() => decodeLobbyReqInfoChar(inner), /inner code/);
});

test('decodeReqInfoAccount — code 검증 후 빈 객체 반환', () => {
  const inner = Buffer.from([0x10, 0x00]); // code=0x1000
  const result = decodeReqInfoAccount(inner);
  assert.deepEqual(result, {});
});

// ─── §6 0x1007 CommandExtensionCharacterCharge ────────────────────────────

test('decodeExtensionCharReq — count=1, charId 정상 파싱', () => {
  const inner = Buffer.alloc(7);
  inner.writeUInt16BE(0x1007, 0); // code
  inner[2] = 1;                   // count=1
  inner.writeUInt32LE(99, 3);     // charId=99
  const result = decodeExtensionCharReq(inner);
  assert.equal(result.count, 1);
  assert.deepEqual(result.charIds, [99]);
});

test('decodeExtensionCharReq — count=0', () => {
  const inner = Buffer.from([0x10, 0x07, 0x00]); // count=0
  const result = decodeExtensionCharReq(inner);
  assert.equal(result.count, 0);
  assert.deepEqual(result.charIds, []);
});

test('encodeExtensionCharOk — message32 래퍼 + body 8 bytes', () => {
  // 근거: [SA] case 0x1007 → store 2 dwords (8 bytes)
  const inner = encodeExtensionCharOk({ count: 1, accepted: 1 });
  assert.equal(inner.readUInt32LE(0), 0);
  assert.equal(inner.readUInt16BE(4), 0x1007);
  assert.equal(inner.length, 6 + 8, 'inner = 14 bytes (6 header + 8 body)');
});

// ─── §7 0x1006 CommandOriginalCharacterCharge ─────────────────────────────

test('decodeOriginalCharReq — 6 dwords 파싱', () => {
  // 근거: [SA] case 0x1006 → store 6 dwords (24 bytes)
  const inner = Buffer.alloc(26);
  inner.writeUInt16BE(0x1006, 0);
  inner.writeUInt32LE(77, 2); // first dword = charId(추정)
  const result = decodeOriginalCharReq(inner);
  assert.equal(result.charId, 77);
  assert.equal(result.raw.length, 6);
});

test('decodeOriginalCharReq — body < 24 bytes throw', () => {
  const inner = Buffer.alloc(10);
  inner.writeUInt16BE(0x1006, 0);
  assert.throws(() => decodeOriginalCharReq(inner), /short/);
});

test('encodeOriginalCharOk — message32 래퍼 + body 24 bytes', () => {
  const inner = encodeOriginalCharOk({ charId: 5 });
  assert.equal(inner.readUInt32LE(0), 0);
  assert.equal(inner.readUInt16BE(4), 0x1006);
  assert.equal(inner.length, 6 + 24, 'inner = 30 bytes (6 header + 24 body)');
  assert.equal(inner.readUInt32LE(6), 5, 'charId echo');
});

// ─── §8 readCharMsgCode ───────────────────────────────────────────────────

test('readCharMsgCode — C→S inner (isMsg32=false)', () => {
  const inner = Buffer.from([0x10, 0x08, 0xaa, 0xbb]);
  assert.equal(readCharMsgCode(inner, false), 0x1008);
});

test('readCharMsgCode — S→C message32 (isMsg32=true)', () => {
  const inner = encodeGenerateCharOk({});
  assert.equal(readCharMsgCode(inner, true), 0x1008);
});

// ─── §9 내부 정합성 — decodeGenerateCharReq 왕복 가능성 확인 ──────────────────
// (C→S와 S→C는 포맷이 달라 완전 왕복 불가; encode→body 쓰기 순서 정합성만 확인)

test('encodeGenerateCharOk — face(u32 BE) / ability8 / rank 순서 확인', () => {
  const inner = encodeGenerateCharOk({
    power: 3, blood: 1, sex: 1,
    lastname: 'Y', firstname: 'W',
    face: 0x12345678,
    ability8: [10, 20, 30, 40, 50, 60, 70, 80],
    bonusPoint: 5,
    rank: 0x0d,
  });
  const body = inner.subarray(6);
  // header: requestCategory(4)+accepted+power+blood+sex(4) = 8
  assert.equal(body[5], 3, 'power=3 at body[5]');
  assert.equal(body[6], 1, 'blood=1 at body[6]');
  assert.equal(body[7], 1, 'sex=1 at body[7]');
  // pstr16 BE: lastname 'Y'(1 char) → len=2, 1×u16=2 bytes → total 3 bytes
  //            firstname 'W'(1 char) → len=2, 1×u16=2 bytes → total 3 bytes
  // cursor after lastname+firstname = 8+3+3=14
  // createUnknown44(4) + birth(2) = 6 bytes → cursor=20
  // face at cursor=20
  const faceCursor = 8 + 3 + 3 + 4 + 2;
  assert.equal(body.readUInt32BE(faceCursor), 0x12345678, 'face u32 BE');
  // ability8 at faceCursor+4=24
  const ab8Start = faceCursor + 4;
  assert.deepEqual(Array.from(body.subarray(ab8Start, ab8Start + 8)), [10, 20, 30, 40, 50, 60, 70, 80]);
  // bonusPoint at ab8Start+8
  assert.equal(body[ab8Start + 8], 5, 'bonusPoint=5');
});

test('decodeGenerateCharReq — 빈 이름 처리 (len=1)', () => {
  // 빈 이름: lastname_len=1(NUL만), firstname_len=1(NUL만)
  const body = Buffer.alloc(50);
  body.writeUInt16BE(0x1008, 0); // code
  // requestCategory=0: body[0..3]=0
  body[7] = 1; // power at inner[7] = body[5] - 아니, inner[7]=body[7-2=5]...
  // inner = [code(2)][body]
  // body[0x00-0x03]: requestCategory
  // body[0x04]: reserved
  // body[0x05]: power
  // body[0x06]: blood
  // body[0x07]: sex
  // body[0x08]: lastname_len
  // So inner[2+0x05] = inner[7] = power
  body[2 + 0x05] = 2; // power=2 (inner offset 7)
  body[2 + 0x06] = 2; // blood=2
  body[2 + 0x08] = 1; // lastname_len=1 (0 chars, NUL only)
  // nextOffset after lastname: 0x08+2+0*2+1 = 0x0b? No:
  // readPackedUtf16LE(body_part, 0x08): len=1 → realChars=0 → charsStart=0x08+2=0x0a
  // nextOffset = 0x0a + 0*2 + 1 = 0x0b
  // body_part = inner.subarray(2)
  body[2 + 0x0b] = 1; // firstname_len=1 at body_part[0x0b]
  // nextOffset after firstname: 0x0b+2+0+1=0x0e
  // tail at body_part[0x0e]: face(4)+ability8(8)+bonus+special+title+rank = 16 bytes
  // remaining space = 50-2-0x0e = 50-16 = 34 bytes ≥ 16 ✓
  const inner = body;
  const result = decodeGenerateCharReq(inner);
  assert.equal(result.lastname, '');
  assert.equal(result.firstname, '');
  assert.equal(result.power, 2);
});
