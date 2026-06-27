/**
 * Warehouse / Package logistics record builders — tests.
 *
 * The "基地管理" base-management 보급창고/수송 (warehouse / transport) panels. Two SMALL fixed-frame
 * S→C read-model records (no client factory drop involved → wiring goes live immediately):
 *   - ResponseInformationWarehouse 0x0327 (0x300 = 768B) — base stockpile: supplies/food/mineral +
 *     reserve ships[]/troops[]. Dispatcher FUN_004ba2b0 case 0x327 copies 0xc0 dwords (768B) into
 *     clientBase+0x3e098c. Layout pinned by parser FUN_0041a870 + dump serializer FUN_0041aff0.
 *   - ResponseInformationPackage 0x0329 (0x154 = 340B) — in-transit transfer manifest:
 *     other_package[] + troop_package[]. Dispatcher case 0x329 copies 0x55 dwords (340B) into
 *     clientBase+0x36a488. Layout pinned by parser FUN_0041b280 + dump serializer FUN_0041b990.
 *
 * Body is little-endian at inner.subarray(6); only the 2-byte inner code prefix is big-endian. The doc
 * "contradiction" (proto-info-records §4a byte offsets 0x2f4/0x2f8/0x2fc vs character-record-wire.md
 * `param_1[0xbd]/[0xbe]/[0xbf]`) is RESOLVED: param_1 is a u32* so [0xbd]=byte 0x2f4, [0xbe]=0x2f8,
 * [0xbf]=0x2fc — they AGREE; there was never a real contradiction. Confirmed against the binary parser
 * (`(*+0x1c)(iStack_10 + 0x2f4 / +0x2f8 / +0x2fc)`).
 *
 * RED-first: written before the module ships (the import below fails until logh7-warehouse-record.mjs exists).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResponseInformationWarehouseInner,
  buildResponseInformationPackageInner,
  systemToWarehouseRecord,
  RESP_INFO_WAREHOUSE_CODE,
  RESP_INFO_WAREHOUSE_BYTES,
  RESP_INFO_WAREHOUSE_SHIPS_MAX,
  RESP_INFO_WAREHOUSE_TROOPS_MAX,
  RW_OFF_BASE,
  RW_OFF_OUTFIT,
  RW_OFF_INDEX,
  RW_OFF_SHIPS_CNT,
  RW_OFF_SHIPS0,
  RW_SHIP_STRIDE,
  RW_SHIP_OFF_KIND,
  RW_SHIP_OFF_UNIT_NUMBER,
  RW_SHIP_OFF_BOAT_NUMBER,
  RW_OFF_TROOPS_CNT,
  RW_OFF_TROOPS0,
  RW_TROOP_STRIDE,
  RW_TROOP_OFF_KIND,
  RW_TROOP_OFF_TROOP_GRADE,
  RW_TROOP_OFF_UNIT_NUMBER,
  RW_OFF_SUPPLIES,
  RW_OFF_FOOD,
  RW_OFF_MINERAL,
  RESP_INFO_PACKAGE_CODE,
  RESP_INFO_PACKAGE_BYTES,
  RESP_INFO_PACKAGE_OTHER_MAX,
  RESP_INFO_PACKAGE_TROOP_MAX,
  RP_OFF_BASE,
  RP_OFF_TARGET_BASE,
  RP_OFF_OTHER_CNT,
  RP_OFF_OTHER0,
  RP_PKG_STRIDE,
  RP_PKG_OFF_KIND,
  RP_PKG_OFF_UNIT_KIND,
  RP_PKG_OFF_TROOP_GRADE,
  RP_PKG_OFF_PACKAGE_NUMBER,
  RP_OFF_TROOP_CNT,
  RP_OFF_TROOP0,
} from '../../src/server/logh7-warehouse-record.mjs';

/** Assert the message32 framing: [u32 BE 0][u16 BE code][body of bodyLen]; return the LE body view. */
function framedBody(inner, code, bodyLen) {
  assert.equal(inner.readUInt32BE(0), 0, 'message32 prefix dword is 0');
  assert.equal(inner.readUInt16BE(4), code, 'inner code (big-endian) matches');
  assert.equal(inner.length, 6 + bodyLen, 'total inner length = 6 + dispatch body size');
  return inner.subarray(6);
}

// ===========================================================================
// Warehouse 0x0327 — constants & framing
// ===========================================================================
test('warehouse constants match the RE-pinned dispatcher copy size (0xc0 dw = 0x300 fixed body) and caps', () => {
  assert.equal(RESP_INFO_WAREHOUSE_CODE, 0x0327, 'inner code is 0x0327 (dispatcher case 0x327)');
  assert.equal(RESP_INFO_WAREHOUSE_BYTES, 0x300, 'fixed body 0x300 = 768B (0xc0 dwords copied)');
  assert.equal(RESP_INFO_WAREHOUSE_SHIPS_MAX, 99, 'ships cap 99 (parser guard < 100)');
  assert.equal(RESP_INFO_WAREHOUSE_TROOPS_MAX, 24, 'troops cap 24 (parser guard < 0x19)');
  // pinned offsets (parser FUN_0041a870 / dump FUN_0041aff0)
  assert.equal(RW_OFF_BASE, 0x00);
  assert.equal(RW_OFF_OUTFIT, 0x04);
  assert.equal(RW_OFF_INDEX, 0x08);
  assert.equal(RW_OFF_SHIPS_CNT, 0x0c);
  assert.equal(RW_OFF_SHIPS0, 0x0e, 'ships[0] base (parser reads kind at cursor-2 = 0x0e)');
  assert.equal(RW_SHIP_STRIDE, 6);
  assert.equal(RW_OFF_TROOPS_CNT, 0x260);
  assert.equal(RW_OFF_TROOPS0, 0x262, 'troops[0] base (parser reads kind at cursor-2 = 0x262)');
  assert.equal(RW_TROOP_STRIDE, 6);
  assert.equal(RW_OFF_SUPPLIES, 0x2f4, 'supplies @ 0x2f4 = param_1[0xbd]');
  assert.equal(RW_OFF_FOOD, 0x2f8, 'food @ 0x2f8 = param_1[0xbe]');
  assert.equal(RW_OFF_MINERAL, 0x2fc, 'mineral @ 0x2fc = param_1[0xbf]');
});

test('warehouse builds the framed 0x300 body with correct code', () => {
  const inner = buildResponseInformationWarehouseInner({});
  framedBody(inner, RESP_INFO_WAREHOUSE_CODE, RESP_INFO_WAREHOUSE_BYTES);
});

test('warehouse default body is all zero (no fabrication)', () => {
  const body = framedBody(buildResponseInformationWarehouseInner({}), RESP_INFO_WAREHOUSE_CODE, RESP_INFO_WAREHOUSE_BYTES);
  assert.ok(body.every((b) => b === 0), 'empty warehouse → all-zero body');
});

test('warehouse writes scalars at the pinned offsets (LE)', () => {
  const body = framedBody(
    buildResponseInformationWarehouseInner({
      base: 0x11223344,
      outfit: 0x55667788,
      index: 0x99aabbcc,
      supplies: 1234,
      food: 5678,
      mineral: 9012,
    }),
    RESP_INFO_WAREHOUSE_CODE,
    RESP_INFO_WAREHOUSE_BYTES,
  );
  assert.equal(body.readUInt32LE(RW_OFF_BASE), 0x11223344);
  assert.equal(body.readUInt32LE(RW_OFF_OUTFIT), 0x55667788);
  assert.equal(body.readUInt32LE(RW_OFF_INDEX), 0x99aabbcc);
  assert.equal(body.readUInt32LE(RW_OFF_SUPPLIES), 1234);
  assert.equal(body.readUInt32LE(RW_OFF_FOOD), 5678);
  assert.equal(body.readUInt32LE(RW_OFF_MINERAL), 9012);
});

test('warehouse writes ships[] (count u8 + stride-6 entries) at pinned offsets', () => {
  const body = framedBody(
    buildResponseInformationWarehouseInner({
      ships: [
        { kind: 0x0102, unitNumber: 0x03, boatNumber: 0x0405 },
        { kind: 0x1112, unitNumber: 0x13, boatNumber: 0x1415 },
      ],
    }),
    RESP_INFO_WAREHOUSE_CODE,
    RESP_INFO_WAREHOUSE_BYTES,
  );
  assert.equal(body.readUInt8(RW_OFF_SHIPS_CNT), 2, 'ships_count u8 @ 0x0c');
  // entry 0
  assert.equal(body.readUInt16LE(RW_OFF_SHIPS0 + 0 * RW_SHIP_STRIDE + RW_SHIP_OFF_KIND), 0x0102);
  assert.equal(body.readUInt8(RW_OFF_SHIPS0 + 0 * RW_SHIP_STRIDE + RW_SHIP_OFF_UNIT_NUMBER), 0x03);
  assert.equal(body.readUInt16LE(RW_OFF_SHIPS0 + 0 * RW_SHIP_STRIDE + RW_SHIP_OFF_BOAT_NUMBER), 0x0405);
  // entry 1
  assert.equal(body.readUInt16LE(RW_OFF_SHIPS0 + 1 * RW_SHIP_STRIDE + RW_SHIP_OFF_KIND), 0x1112);
  assert.equal(body.readUInt8(RW_OFF_SHIPS0 + 1 * RW_SHIP_STRIDE + RW_SHIP_OFF_UNIT_NUMBER), 0x13);
  assert.equal(body.readUInt16LE(RW_OFF_SHIPS0 + 1 * RW_SHIP_STRIDE + RW_SHIP_OFF_BOAT_NUMBER), 0x1415);
});

test('warehouse writes troops[] at the pinned 0x260/0x262 offsets', () => {
  const body = framedBody(
    buildResponseInformationWarehouseInner({
      troops: [{ kind: 0x2122, troopGrade: 0x23, unitNumber: 0x2425 }],
    }),
    RESP_INFO_WAREHOUSE_CODE,
    RESP_INFO_WAREHOUSE_BYTES,
  );
  assert.equal(body.readUInt8(RW_OFF_TROOPS_CNT), 1, 'troops_count u8 @ 0x260');
  assert.equal(body.readUInt16LE(RW_OFF_TROOPS0 + RW_TROOP_OFF_KIND), 0x2122);
  assert.equal(body.readUInt8(RW_OFF_TROOPS0 + RW_TROOP_OFF_TROOP_GRADE), 0x23);
  assert.equal(body.readUInt16LE(RW_OFF_TROOPS0 + RW_TROOP_OFF_UNIT_NUMBER), 0x2425);
});

test('warehouse caps ships[] at 99 and troops[] at 24 (never overflow / never write past 0x300)', () => {
  const body = framedBody(
    buildResponseInformationWarehouseInner({
      ships: Array.from({ length: 200 }, (_, i) => ({ kind: i + 1 })),
      troops: Array.from({ length: 200 }, (_, i) => ({ kind: i + 1 })),
    }),
    RESP_INFO_WAREHOUSE_CODE,
    RESP_INFO_WAREHOUSE_BYTES,
  );
  assert.equal(body.readUInt8(RW_OFF_SHIPS_CNT), RESP_INFO_WAREHOUSE_SHIPS_MAX, 'ships clamped to 99');
  assert.equal(body.readUInt8(RW_OFF_TROOPS_CNT), RESP_INFO_WAREHOUSE_TROOPS_MAX, 'troops clamped to 24');
  // last ship entry must end at or before troops_count (0x260)
  const lastShipEnd = RW_OFF_SHIPS0 + (RESP_INFO_WAREHOUSE_SHIPS_MAX - 1) * RW_SHIP_STRIDE + RW_SHIP_STRIDE;
  assert.ok(lastShipEnd <= RW_OFF_TROOPS_CNT, 'ships region fits before troops_count');
  // last troop entry must end at or before supplies (0x2f4)
  const lastTroopEnd = RW_OFF_TROOPS0 + (RESP_INFO_WAREHOUSE_TROOPS_MAX - 1) * RW_TROOP_STRIDE + RW_TROOP_STRIDE;
  assert.ok(lastTroopEnd <= RW_OFF_SUPPLIES, 'troops region fits before supplies');
});

// ===========================================================================
// Package 0x0329 — constants & framing
// ===========================================================================
test('package constants match the RE-pinned dispatcher copy size (0x55 dw = 0x154 fixed body) and caps', () => {
  assert.equal(RESP_INFO_PACKAGE_CODE, 0x0329, 'inner code is 0x0329 (dispatcher case 0x329)');
  assert.equal(RESP_INFO_PACKAGE_BYTES, 0x154, 'fixed body 0x154 = 340B (0x55 dwords copied)');
  assert.equal(RESP_INFO_PACKAGE_OTHER_MAX, 3, 'other_package cap 3 (parser guard < 4)');
  assert.equal(RESP_INFO_PACKAGE_TROOP_MAX, 24, 'troop_package cap 24 (parser guard < 0x19)');
  // pinned offsets (parser FUN_0041b280 / dump FUN_0041b990)
  assert.equal(RP_OFF_BASE, 0x00);
  assert.equal(RP_OFF_TARGET_BASE, 0x04);
  assert.equal(RP_OFF_OTHER_CNT, 0x08);
  assert.equal(RP_OFF_OTHER0, 0x0c, 'other_package[0] base (parser reads kind at cursor-2 = 0x0c)');
  assert.equal(RP_PKG_STRIDE, 12);
  assert.equal(RP_OFF_TROOP_CNT, 0x30);
  assert.equal(RP_OFF_TROOP0, 0x34, 'troop_package[0] base (parser reads kind at cursor-2 = 0x34)');
});

test('package builds the framed 0x154 body with correct code', () => {
  const inner = buildResponseInformationPackageInner({});
  framedBody(inner, RESP_INFO_PACKAGE_CODE, RESP_INFO_PACKAGE_BYTES);
});

test('package default body is all zero (no fabrication)', () => {
  const body = framedBody(buildResponseInformationPackageInner({}), RESP_INFO_PACKAGE_CODE, RESP_INFO_PACKAGE_BYTES);
  assert.ok(body.every((b) => b === 0), 'empty package → all-zero body');
});

test('package writes base/target_base scalars at the pinned offsets (LE)', () => {
  const body = framedBody(
    buildResponseInformationPackageInner({ base: 0xdeadbeef, targetBase: 0x12345678 }),
    RESP_INFO_PACKAGE_CODE,
    RESP_INFO_PACKAGE_BYTES,
  );
  assert.equal(body.readUInt32LE(RP_OFF_BASE), 0xdeadbeef);
  assert.equal(body.readUInt32LE(RP_OFF_TARGET_BASE), 0x12345678);
});

test('package writes other_package[] (stride-12 entries) at pinned offsets', () => {
  const body = framedBody(
    buildResponseInformationPackageInner({
      otherPackages: [
        { kind: 0x01, unitKind: 0x0203, troopGrade: 0x04, packageNumber: 0x05060708 },
        { kind: 0x11, unitKind: 0x1213, troopGrade: 0x14, packageNumber: 0x15161718 },
      ],
    }),
    RESP_INFO_PACKAGE_CODE,
    RESP_INFO_PACKAGE_BYTES,
  );
  assert.equal(body.readUInt8(RP_OFF_OTHER_CNT), 2, 'other_package_count u8 @ 0x08');
  // entry 0
  assert.equal(body.readUInt8(RP_OFF_OTHER0 + 0 * RP_PKG_STRIDE + RP_PKG_OFF_KIND), 0x01);
  assert.equal(body.readUInt16LE(RP_OFF_OTHER0 + 0 * RP_PKG_STRIDE + RP_PKG_OFF_UNIT_KIND), 0x0203);
  assert.equal(body.readUInt8(RP_OFF_OTHER0 + 0 * RP_PKG_STRIDE + RP_PKG_OFF_TROOP_GRADE), 0x04);
  assert.equal(body.readUInt32LE(RP_OFF_OTHER0 + 0 * RP_PKG_STRIDE + RP_PKG_OFF_PACKAGE_NUMBER), 0x05060708);
  // entry 1
  assert.equal(body.readUInt8(RP_OFF_OTHER0 + 1 * RP_PKG_STRIDE + RP_PKG_OFF_KIND), 0x11);
  assert.equal(body.readUInt16LE(RP_OFF_OTHER0 + 1 * RP_PKG_STRIDE + RP_PKG_OFF_UNIT_KIND), 0x1213);
  assert.equal(body.readUInt8(RP_OFF_OTHER0 + 1 * RP_PKG_STRIDE + RP_PKG_OFF_TROOP_GRADE), 0x14);
  assert.equal(body.readUInt32LE(RP_OFF_OTHER0 + 1 * RP_PKG_STRIDE + RP_PKG_OFF_PACKAGE_NUMBER), 0x15161718);
});

test('package writes troop_package[] at the pinned 0x30/0x34 offsets', () => {
  const body = framedBody(
    buildResponseInformationPackageInner({
      troopPackages: [{ kind: 0x21, unitKind: 0x2223, troopGrade: 0x24, packageNumber: 0x25262728 }],
    }),
    RESP_INFO_PACKAGE_CODE,
    RESP_INFO_PACKAGE_BYTES,
  );
  assert.equal(body.readUInt8(RP_OFF_TROOP_CNT), 1, 'troop_package_count u8 @ 0x30');
  assert.equal(body.readUInt8(RP_OFF_TROOP0 + RP_PKG_OFF_KIND), 0x21);
  assert.equal(body.readUInt16LE(RP_OFF_TROOP0 + RP_PKG_OFF_UNIT_KIND), 0x2223);
  assert.equal(body.readUInt8(RP_OFF_TROOP0 + RP_PKG_OFF_TROOP_GRADE), 0x24);
  assert.equal(body.readUInt32LE(RP_OFF_TROOP0 + RP_PKG_OFF_PACKAGE_NUMBER), 0x25262728);
});

test('package caps other_package[] at 3 and troop_package[] at 24 (never write past 0x154)', () => {
  const body = framedBody(
    buildResponseInformationPackageInner({
      otherPackages: Array.from({ length: 50 }, (_, i) => ({ kind: i + 1 })),
      troopPackages: Array.from({ length: 50 }, (_, i) => ({ kind: i + 1 })),
    }),
    RESP_INFO_PACKAGE_CODE,
    RESP_INFO_PACKAGE_BYTES,
  );
  assert.equal(body.readUInt8(RP_OFF_OTHER_CNT), RESP_INFO_PACKAGE_OTHER_MAX, 'other_package clamped to 3');
  assert.equal(body.readUInt8(RP_OFF_TROOP_CNT), RESP_INFO_PACKAGE_TROOP_MAX, 'troop_package clamped to 24');
  const lastOtherEnd = RP_OFF_OTHER0 + (RESP_INFO_PACKAGE_OTHER_MAX - 1) * RP_PKG_STRIDE + RP_PKG_STRIDE;
  assert.ok(lastOtherEnd <= RP_OFF_TROOP_CNT, 'other_package region fits before troop_package_count');
  const lastTroopEnd = RP_OFF_TROOP0 + (RESP_INFO_PACKAGE_TROOP_MAX - 1) * RP_PKG_STRIDE + RP_PKG_STRIDE;
  assert.ok(lastTroopEnd <= RESP_INFO_PACKAGE_BYTES, 'troop_package region fits within 0x154 body');
});

// ===========================================================================
// systemToWarehouseRecord — conservative P3 projection (only runtime id, no fabrication)
// ===========================================================================
test('systemToWarehouseRecord maps only the supplied id and never fabricates economy values', () => {
  const rec = systemToWarehouseRecord({ system: 'Odin', faction: 'empire' }, { base: 42 });
  assert.equal(rec.base, 42, 'base id mapped from ctx');
  assert.equal(rec.supplies ?? 0, 0, 'supplies stays 0 unless explicitly supplied');
  assert.equal(rec.food ?? 0, 0, 'food stays 0');
  assert.equal(rec.mineral ?? 0, 0, 'mineral stays 0');
  assert.deepEqual(rec.ships ?? [], [], 'ships stays empty');
  // explicit passthrough is honored
  const rec2 = systemToWarehouseRecord({}, { base: 7, supplies: 100 });
  assert.equal(rec2.base, 7);
  assert.equal(rec2.supplies, 100, 'explicit ctx value passes through');
});
