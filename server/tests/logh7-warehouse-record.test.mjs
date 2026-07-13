import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  QA_WAREHOUSE_MARKER_ENV,
  REQ_INFO_WAREHOUSE_CODE,
  RESP_INFO_WAREHOUSE_BODY_BYTES,
  RESP_INFO_WAREHOUSE_CODE,
  WAREHOUSE_SHIPS_MAX,
  WAREHOUSE_TROOPS_MAX,
  buildResponseInformationWarehouseInner,
  decodeRequestInformationWarehouse,
  isQaWarehouseMarkerEnabled,
} from '../src/server/codec/warehouse-record.mjs';
import { msg32Body, readMsg32Code } from '../src/server/logh7-world-records.mjs';

function parseWarehouseIntoClientCache(body) {
  let cursor = 0;
  const cache = Buffer.alloc(0x300);
  cache.writeUInt32LE(body.readUInt32BE(cursor), 0x00); cursor += 4;
  cache.writeUInt32LE(body.readUInt32BE(cursor), 0x04); cursor += 4;
  cache.writeUInt32LE(body.readUInt32BE(cursor), 0x08); cursor += 4;
  const shipCount = body.readUInt8(cursor); cursor += 1;
  cache.writeUInt8(shipCount, 0x0c);
  for (let i = 0; i < shipCount; i += 1) {
    const kind = body.readUInt16BE(cursor); cursor += 2;
    const unitNumber = body.readUInt8(cursor); cursor += 1;
    const boatNumber = body.readUInt16BE(cursor); cursor += 2;
    const nativeOffset = 0x0e + i * 6;
    cache.writeUInt16LE(kind, nativeOffset);
    cache.writeUInt8(unitNumber, nativeOffset + 2);
    cache.writeUInt16LE(boatNumber, nativeOffset + 4);
  }
  const troopCount = body.readUInt8(cursor); cursor += 1;
  cache.writeUInt8(troopCount, 0x260);
  for (let i = 0; i < troopCount; i += 1) {
    const kind = body.readUInt16BE(cursor); cursor += 2;
    const troopGrade = body.readUInt8(cursor); cursor += 1;
    const unitNumber = body.readUInt16BE(cursor); cursor += 2;
    const nativeOffset = 0x262 + i * 6;
    cache.writeUInt16LE(kind, nativeOffset);
    cache.writeUInt8(troopGrade, nativeOffset + 2);
    cache.writeUInt16LE(unitNumber, nativeOffset + 4);
  }
  cache.writeUInt32LE(body.readUInt32BE(cursor), 0x2f4); cursor += 4;
  cache.writeUInt32LE(body.readUInt32BE(cursor), 0x2f8); cursor += 4;
  cache.writeUInt32LE(body.readUInt32BE(cursor), 0x2fc); cursor += 4;
  return { cache, wireCursor: cursor };
}

function decodeWarehouseLikeClient(body) {
  const { cache, wireCursor } = parseWarehouseIntoClientCache(body);
  const ships = [];
  for (let i = 0; i < cache.readUInt8(0x0c); i += 1) {
    const nativeOffset = 0x0e + i * 6;
    ships.push({
      kind: cache.readUInt16LE(nativeOffset),
      unitNumber: cache.readUInt8(nativeOffset + 2),
      boatNumber: cache.readUInt16LE(nativeOffset + 4),
    });
  }
  const troops = [];
  for (let i = 0; i < cache.readUInt8(0x260); i += 1) {
    const nativeOffset = 0x262 + i * 6;
    troops.push({
      kind: cache.readUInt16LE(nativeOffset),
      troopGrade: cache.readUInt8(nativeOffset + 2),
      unitNumber: cache.readUInt16LE(nativeOffset + 4),
    });
  }
  return {
    base: cache.readUInt32LE(0x00),
    outfit: cache.readUInt32LE(0x04),
    index: cache.readUInt32LE(0x08),
    ships,
    troops,
    supplies: cache.readUInt32LE(0x2f4),
    food: cache.readUInt32LE(0x2f8),
    mineral: cache.readUInt32LE(0x2fc),
    cursor: wireCursor,
  };
}

test('0x0327 codec emits the fixed body and the client compact stream in big-endian order', () => {
  const inner = buildResponseInformationWarehouseInner({
    base: 0x01020304,
    outfit: 0x05060708,
    index: 0x090a0b0c,
    ships: [{ kind: 0x1122, unitNumber: 0x33, boatNumber: 0x4455 }],
    troops: [{ kind: 0x6677, troopGrade: 0x88, unitNumber: 0x99aa }],
    supplies: 0xbbccddee,
    food: 0x12345678,
    mineral: 0x90abcdef,
  });

  assert.equal(readMsg32Code(inner), RESP_INFO_WAREHOUSE_CODE);
  const body = msg32Body(inner);
  assert.equal(body.length, RESP_INFO_WAREHOUSE_BODY_BYTES);
  assert.deepEqual([...body.subarray(0, 4)], [0x01, 0x02, 0x03, 0x04]);
  const { cache, wireCursor } = parseWarehouseIntoClientCache(body);
  assert.equal(wireCursor, 36, 'wire is a compact stream, not the padded cache layout');
  assert.equal(cache.readUInt32LE(0x00), 0x01020304);
  assert.equal(cache.readUInt32LE(0x04), 0x05060708);
  assert.equal(cache.readUInt32LE(0x08), 0x090a0b0c);
  assert.equal(cache.readUInt8(0x0c), 1);
  assert.equal(cache.readUInt16LE(0x0e), 0x1122);
  assert.equal(cache.readUInt8(0x10), 0x33);
  assert.equal(cache.readUInt16LE(0x12), 0x4455);
  assert.equal(cache.readUInt8(0x260), 1);
  assert.equal(cache.readUInt16LE(0x262), 0x6677);
  assert.equal(cache.readUInt8(0x264), 0x88);
  assert.equal(cache.readUInt16LE(0x266), 0x99aa);
  assert.equal(cache.readUInt32LE(0x2f4), 0xbbccddee);
  assert.equal(cache.readUInt32LE(0x2f8), 0x12345678);
  assert.equal(cache.readUInt32LE(0x2fc), 0x90abcdef);
  const decoded = decodeWarehouseLikeClient(body);
  assert.deepEqual(decoded, {
    base: 0x01020304,
    outfit: 0x05060708,
    index: 0x090a0b0c,
    ships: [{ kind: 0x1122, unitNumber: 0x33, boatNumber: 0x4455 }],
    troops: [{ kind: 0x6677, troopGrade: 0x88, unitNumber: 0x99aa }],
    supplies: 0xbbccddee,
    food: 0x12345678,
    mineral: 0x90abcdef,
    cursor: 36,
  });
  assert.ok(body.subarray(decoded.cursor).every((byte) => byte === 0), 'unused fixed body stays zero');
});

test('0x0327 codec caps arrays and saturates scalar fields without wrapping', () => {
  const ships = Array.from({ length: WAREHOUSE_SHIPS_MAX + 1 }, (_, index) => ({
    kind: index === 0 ? -1 : 0x10000 + index,
    unitNumber: 0x100 + index,
    boatNumber: -index,
  }));
  const troops = Array.from({ length: WAREHOUSE_TROOPS_MAX + 1 }, (_, index) => ({
    kind: 0x10000 + index,
    troopGrade: 0x100 + index,
    unitNumber: 0x10000 + index,
  }));
  const decoded = decodeWarehouseLikeClient(msg32Body(buildResponseInformationWarehouseInner({
    base: -1,
    outfit: Number.POSITIVE_INFINITY,
    index: 0x1_0000_0000,
    ships,
    troops,
    supplies: 0x1_0000_0000,
    food: -3,
    mineral: 4.9,
  })));

  assert.equal(decoded.base, 0);
  assert.equal(decoded.outfit, 0);
  assert.equal(decoded.index, 0xffffffff);
  assert.equal(decoded.ships.length, WAREHOUSE_SHIPS_MAX);
  assert.deepEqual(decoded.ships[0], { kind: 0, unitNumber: 0xff, boatNumber: 0 });
  assert.deepEqual(decoded.ships.at(-1), { kind: 0xffff, unitNumber: 0xff, boatNumber: 0 });
  assert.equal(decoded.troops.length, WAREHOUSE_TROOPS_MAX);
  assert.deepEqual(decoded.troops.at(-1), { kind: 0xffff, troopGrade: 0xff, unitNumber: 0xffff });
  assert.equal(decoded.supplies, 0xffffffff);
  assert.equal(decoded.food, 0);
  assert.equal(decoded.mineral, 4);
});

// 0x0326 요청 body는 8바이트다(라이브 0030-decoded innerLen=10 = 코드 2B + body 8B).
// 라이브 run7 실측 바이트: base는 오프셋 0의 u32BE, outfit도 BE.
const REQ_BODY_8B = Buffer.from('0000004600000000', 'hex'); // base=70, outfit=0
const EXPECTED_8B = {
  base: 70, // u32BE @0 — run7 라이브 관측에서 catalog 조인 성공
  outfit: 0, // u32BE @4
  bodyHex: '0000004600000000',
};

test('0x0326 decoder reads the 8-byte body as BE and decodes to base=70', () => {
  // raw envelope: 0x0326 opcode + 8-byte body
  const raw = Buffer.alloc(10);
  raw.writeUInt16BE(REQ_INFO_WAREHOUSE_CODE, 0);
  REQ_BODY_8B.copy(raw, 2);
  assert.deepEqual(decodeRequestInformationWarehouse(raw), EXPECTED_8B);

  // message32 envelope: [u32 0][u16 0x0326] + 8-byte body
  const message32 = Buffer.alloc(14);
  message32.writeUInt32LE(0, 0);
  message32.writeUInt16BE(REQ_INFO_WAREHOUSE_CODE, 4);
  REQ_BODY_8B.copy(message32, 6);
  assert.deepEqual(decodeRequestInformationWarehouse(message32), EXPECTED_8B);

  // body-only: 8-byte body without envelope
  assert.deepEqual(decodeRequestInformationWarehouse(REQ_BODY_8B), EXPECTED_8B);
});

test('0x0326 decoder fail-closed on any body length other than 8', () => {
  const raw = Buffer.alloc(10);
  raw.writeUInt16BE(REQ_INFO_WAREHOUSE_CODE, 0);
  REQ_BODY_8B.copy(raw, 2);

  // 7바이트 body(raw 9B / body-only 7B)
  assert.equal(decodeRequestInformationWarehouse(raw.subarray(0, 9)), null, '7-byte body under raw envelope');
  assert.equal(decodeRequestInformationWarehouse(REQ_BODY_8B.subarray(0, 7)), null, '7-byte body-only');

  // 10바이트 body(직전 count-prefixed 가설) — 되살아나면 안 된다
  const raw10 = Buffer.alloc(12);
  raw10.writeUInt16BE(REQ_INFO_WAREHOUSE_CODE, 0);
  raw10.writeUInt16BE(1, 2);
  raw10.writeUInt32LE(70, 4);
  raw10.writeUInt32LE(9, 8);
  assert.equal(decodeRequestInformationWarehouse(raw10), null, '10-byte body under raw envelope');
  assert.equal(decodeRequestInformationWarehouse(raw10.subarray(2)), null, '10-byte body-only');

  // trailing byte / 잘린 message32 / 잘못된 opcode
  assert.equal(decodeRequestInformationWarehouse(Buffer.concat([raw, Buffer.from([0])])), null, 'trailing byte');
  const message32 = Buffer.alloc(14);
  message32.writeUInt32LE(0, 0);
  message32.writeUInt16BE(REQ_INFO_WAREHOUSE_CODE, 4);
  REQ_BODY_8B.copy(message32, 6);
  assert.equal(decodeRequestInformationWarehouse(message32.subarray(0, 13)), null, 'truncated message32 envelope');
  const wrongCode = Buffer.from(raw);
  wrongCode.writeUInt16BE(0x0328, 0);
  assert.equal(decodeRequestInformationWarehouse(wrongCode), null, 'wrong opcode');
});

// ── QA 마커 게이트 (LOGH_QA_WAREHOUSE_MARKER=1) ────────────────────────────
// 마커는 renderer FUN_0057aa90 의 필드 해석을 라이브로 확정하기 위한 positive control이며
// 제품 기본 동작이 아니다. 게이트 off = 기존 바이트 그대로, on = 마커값만 실린다.

// 게이트 off 골든 벡터: 헤더(6B) + compact BE 스트림 36B. 이후 padding은 전부 0.
const GOLDEN_INNER_PREFIX_HEX = '0000000003270102030405060708090a0b0c0111223344550166778899aabbccddee1234567890abcdef';
const GOLDEN_RECORD = {
  base: 0x01020304,
  outfit: 0x05060708,
  index: 0x090a0b0c,
  ships: [{ kind: 0x1122, unitNumber: 0x33, boatNumber: 0x4455 }],
  troops: [{ kind: 0x6677, troopGrade: 0x88, unitNumber: 0x99aa }],
  supplies: 0xbbccddee,
  food: 0x12345678,
  mineral: 0x90abcdef,
};

test('QA marker gate is off by default and leaves the encoding byte-identical', () => {
  assert.equal(isQaWarehouseMarkerEnabled({}), false, 'env 미설정이면 off');
  assert.equal(isQaWarehouseMarkerEnabled({ [QA_WAREHOUSE_MARKER_ENV]: '0' }), false);
  assert.equal(isQaWarehouseMarkerEnabled({ [QA_WAREHOUSE_MARKER_ENV]: 'true' }), false, "'1' 만 켠다");

  for (const env of [{}, { [QA_WAREHOUSE_MARKER_ENV]: '0' }]) {
    const inner = buildResponseInformationWarehouseInner(GOLDEN_RECORD, { env });
    assert.equal(inner.length, 6 + RESP_INFO_WAREHOUSE_BODY_BYTES);
    const goldenBytes = GOLDEN_INNER_PREFIX_HEX.length / 2; // 헤더 6B + compact 스트림 36B
    assert.equal(inner.subarray(0, goldenBytes).toString('hex'), GOLDEN_INNER_PREFIX_HEX);
    assert.ok(inner.subarray(goldenBytes).every((byte) => byte === 0), 'wire cursor 이후는 0 유지');
  }

  // 비어 있는 record(보수 계약: base ID만 싣고 경제·창고 스칼라는 비운다)도 마커가 새지 않는다.
  const empty = msg32Body(buildResponseInformationWarehouseInner({ base: 70 }, { env: {} }));
  assert.equal(empty.readUInt32BE(0), 70);
  assert.ok(empty.subarray(4).every((byte) => byte === 0), '게이트 off면 base 외 전부 0');
});

test('QA marker gate on carries 66 / tag 0x10=100 / tag 0x11=200 / scalar 1234 at the RE offsets', () => {
  const env = { [QA_WAREHOUSE_MARKER_ENV]: '1' };
  const inner = buildResponseInformationWarehouseInner({ base: 70, outfit: 0, index: 0 }, { env });
  const body = msg32Body(inner);

  assert.equal(readMsg32Code(inner), RESP_INFO_WAREHOUSE_CODE);
  assert.equal(body.length, RESP_INFO_WAREHOUSE_BODY_BYTES, '레코드 전체 크기 0x300 유지');
  assert.equal(body.readUInt32BE(0), 70, '마커가 base(요청 echo)를 덮지 않는다');

  // 인코딩된 wire 버퍼를 직접 읽어 단언(compact BE 스트림).
  assert.equal(body.readUInt8(12), 1, 'wire@12 재고 엔트리 수');
  assert.equal(body.readUInt16BE(13), 1, 'wire@13 엔트리 kind (u16BE)');
  assert.equal(body.readUInt8(15), 66, 'wire@15 재고 수량 = 66');
  assert.equal(body.readUInt8(18), 2, 'wire@18 카테고리 수');
  assert.equal(body.readUInt16BE(19), 0x10, 'wire@19 카테고리0 tag (u16BE)');
  assert.equal(body.readUInt16BE(22), 100, 'wire@22 카테고리0 값 (u16BE)');
  assert.equal(body.readUInt16BE(24), 0x11, 'wire@24 카테고리1 tag');
  assert.equal(body.readUInt16BE(27), 200, 'wire@27 카테고리1 값');
  assert.equal(body.readUInt32BE(29), 1234, 'wire@29 스칼라 1234 (u32BE)');

  // 클라이언트 파서를 거친 뒤 캐시(base+0x3e098c) 오프셋에서 renderer가 읽는 자리.
  const { cache } = parseWarehouseIntoClientCache(body);
  assert.equal(cache.readUInt8(0x0c), 1, 'cache +0xC 엔트리 수');
  assert.equal(cache.readUInt8(0x10), 66, 'cache +0x10 (stride 6, +0 u8) 재고 수량 합 = 66');
  assert.equal(cache.readUInt8(0x260), 2, 'cache +0x260 카테고리 수');
  assert.equal(cache.readUInt16LE(0x262), 0x10, 'cache +0x262 tag0');
  assert.equal(cache.readUInt16LE(0x266), 100, 'cache +0x266 tag0 값');
  assert.equal(cache.readUInt16LE(0x268), 0x11, 'cache +0x268 tag1 (stride 6)');
  assert.equal(cache.readUInt16LE(0x26c), 200, 'cache +0x26c tag1 값');
  assert.equal(cache.readUInt32LE(0x2f4), 1234, 'cache +0x2F4 스칼라');

  // 재고 수량의 "합"이 66 — 엔트리별로 읽히든 합산으로 읽히든 화면 기대치는 66.
  const decoded = decodeWarehouseLikeClient(body);
  assert.equal(decoded.ships.reduce((sum, ship) => sum + ship.unitNumber, 0), 66);
});

test('0x0326 decoder fail-closed with malformed/truncated request without player cell fallback', () => {
  // This matches the world-session behavior: malformed requests are not substituted with player cell
  assert.equal(decodeRequestInformationWarehouse(Buffer.alloc(0)), null, 'empty request');
  assert.equal(decodeRequestInformationWarehouse(Buffer.from([0x03, 0x26])), null, 'opcode-only');
  assert.equal(decodeRequestInformationWarehouse(Buffer.from([0x03, 0x26, 0x00, 0x01])), null, 'missing base/outfit');
});
