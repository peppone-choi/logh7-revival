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

test('0x0326 decoder accepts only the exact two-u32 little-endian request shape', () => {
  const raw = Buffer.alloc(10);
  raw.writeUInt16BE(REQ_INFO_WAREHOUSE_CODE, 0);
  raw.writeUInt32LE(70, 2);
  raw.writeUInt32LE(9, 6);
  assert.deepEqual(decodeRequestInformationWarehouse(raw), { base: 70, outfit: 9 });

  const message32 = Buffer.alloc(14);
  message32.writeUInt32LE(0, 0);
  message32.writeUInt16BE(REQ_INFO_WAREHOUSE_CODE, 4);
  message32.writeUInt32LE(70, 6);
  message32.writeUInt32LE(9, 10);
  assert.deepEqual(decodeRequestInformationWarehouse(message32), { base: 70, outfit: 9 });

  const bodyOnly = Buffer.alloc(8);
  bodyOnly.writeUInt32LE(70, 0);
  bodyOnly.writeUInt32LE(9, 4);
  assert.deepEqual(decodeRequestInformationWarehouse(bodyOnly), { base: 70, outfit: 9 });

  assert.equal(decodeRequestInformationWarehouse(raw.subarray(0, 9)), null, 'truncated request');
  assert.equal(decodeRequestInformationWarehouse(raw.subarray(0, 8)), null,
    'truncated raw envelope cannot alias the eight-byte body-only diagnostic shape');
  assert.equal(decodeRequestInformationWarehouse(Buffer.concat([raw, Buffer.from([0])])), null, 'trailing byte');
  assert.equal(decodeRequestInformationWarehouse(message32.subarray(0, 8)), null,
    'truncated message32 envelope cannot alias the eight-byte body-only diagnostic shape');
  const wrongCode = Buffer.from(raw);
  wrongCode.writeUInt16BE(0x0328, 0);
  assert.equal(decodeRequestInformationWarehouse(wrongCode), null, 'wrong opcode');
});
