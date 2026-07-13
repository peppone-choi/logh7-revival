import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQ_INFO_WAREHOUSE_CODE,
  RESP_INFO_WAREHOUSE_BODY_BYTES,
  RESP_INFO_WAREHOUSE_CODE,
  WAREHOUSE_SHIPS_MAX,
  WAREHOUSE_TROOPS_MAX,
  buildResponseInformationWarehouseInner,
  decodeRequestInformationWarehouse,
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

test('0x0326 decoder fail-closed with malformed/truncated request without player cell fallback', () => {
  // This matches the world-session behavior: malformed requests are not substituted with player cell
  assert.equal(decodeRequestInformationWarehouse(Buffer.alloc(0)), null, 'empty request');
  assert.equal(decodeRequestInformationWarehouse(Buffer.from([0x03, 0x26])), null, 'opcode-only');
  assert.equal(decodeRequestInformationWarehouse(Buffer.from([0x03, 0x26, 0x00, 0x01])), null, 'missing base/outfit');
});
