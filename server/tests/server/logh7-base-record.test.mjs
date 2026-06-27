/**
 * ResponseInformationBase (0x031f) dynamic base defense/development/ownership record builder — tests.
 *
 * This is the DEFENSE/DEVELOPMENT/OWNERSHIP half of the base panel (critical-path STEP 6 「基地管理」).
 * It is the sibling of logh7-base-economy.mjs (NotifyBaseParameter 0x0337 = the ECONOMY half). The two
 * records are independent: 0x0337 carries 人口/食料/治安..., 0x031f carries the 防衛/開発/補給/予算 array
 * fields plus ownership candidates.
 *
 * The dispatcher (FUN_004ba2b0 case 799) ultimately sees a FIXED 0x181 dwords (= 0x604 = 1540 bytes)
 * object at clientBase+0x3facf4. The network body is not that expanded object directly: it is the
 * FUN_00414c70 parser-helper stream, zero-padded to 0x604. These tests decode that stream into the
 * same expanded memory layout before checking offsets, so the server cannot accidentally rely on the
 * old raw-expanded-body shortcut again. Evidence: docs/logh7-info-records-wire.md §2 and .omo/f_414c70.txt.
 *
 * RED-first: written before the module exists (the import below fails until logh7-base-record.mjs ships).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResponseInformationBaseInner,
  systemToBaseRecord,
  economyBaseRecord,
  RESP_INFO_BASE_CODE,
  RESP_INFO_BASE_BYTES,
  RESP_INFO_BASE_ELEM_BYTES,
  RESP_INFO_BASE_MAX,
  RIB_OFF_COUNT,
  RIB_OFF_ELEM0,
  RIB_ELEM_OFF_ID,
  RIB_ELEM_OFF_FIELD_04,
  RIB_ELEM_OFF_FIELD_08,
  RIB_ELEM_OFF_FIELD_09,
  RIB_ELEM_OFF_FIELD_10,
  RIB_ELEM_OFF_FIELD_174,
  RIB_ELEM_OFF_TRANSPORT_CNT,
  RIB_ELEM_OFF_TRANSPORT,
  RIB_ELEM_OFF_OUTFIT_CNT,
  RIB_ELEM_OFF_OUTFIT,
  RIB_ELEM_OFF_BUDGETING_CNT,
  RIB_ELEM_OFF_BUDGETING,
  RIB_ELEM_OFF_BUDGET_CNT,
  RIB_ELEM_OFF_BUDGET,
  RIB_ELEM_OFF_COMMODITY_CNT,
  RIB_ELEM_OFF_COMMODITY,
  RIB_TRANSPORT_MAX,
  RIB_OUTFIT_MAX,
  RIB_BUDGETING_MAX,
  RIB_BUDGET_MAX,
  RIB_COMMODITY_MAX,
} from '../../src/server/logh7-base-record.mjs';

import { expandResponseInformationBaseWire } from './logh7-rib-wire-test-helpers.mjs';

function framedRawBody(inner, code, bodyLen) {
  assert.equal(inner.readUInt32BE(0), 0, 'message32 prefix dword is 0');
  assert.equal(inner.readUInt16BE(4), code, 'inner code (big-endian) matches');
  assert.equal(inner.length, 6 + bodyLen, 'total inner length = 6 + dispatch body size');
  return inner.subarray(6);
}

function framedBody(inner, code, bodyLen) {
  return expandResponseInformationBaseWire(framedRawBody(inner, code, bodyLen));
}

// ---------------------------------------------------------------------------
// Constants & framing
// ---------------------------------------------------------------------------
test('constants match the RE-pinned dispatcher copy size (0x181 dw = 0x604 fixed body)', () => {
  assert.equal(RESP_INFO_BASE_CODE, 0x031f, 'inner code is 0x031f (case 799)');
  assert.equal(RESP_INFO_BASE_ELEM_BYTES, 0x180, 'element stride 0x180 = 384B');
  assert.equal(RESP_INFO_BASE_MAX, 4, 'max 4 elements (error string: information_size over than 4)');
  // dispatcher copies 0x181 dwords = 0x604 bytes = 1 count dword + 4 element slots of 0x180.
  assert.equal(RESP_INFO_BASE_BYTES, 0x604, 'fixed body = 0x604 = 4 + 4*0x180');
  assert.equal(RESP_INFO_BASE_BYTES, 4 + RESP_INFO_BASE_MAX * RESP_INFO_BASE_ELEM_BYTES, 'size cross-check');
  assert.equal(RIB_OFF_COUNT, 0x00, 'count at body+0');
  assert.equal(RIB_OFF_ELEM0, 0x04, 'element[0] at body+4 (count dword occupies body+0..3)');
});

test('raw wire is parser-helper stream, not the expanded 0x180-stride object', () => {
  const inner = buildResponseInformationBaseInner({
    bases: [{ id: 70, field04: 1 }, { id: 1, field04: 2 }],
  });
  const raw = framedRawBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  assert.equal(raw.readUInt8(0), 2, 'raw stream count byte');
  assert.equal(raw.readUInt32BE(1), 70, 'elem[0] id follows count immediately as BE u32');
  assert.notEqual(raw.readUInt32LE(4 + RESP_INFO_BASE_ELEM_BYTES), 1, 'elem[1] is not at expanded stride in raw wire');

  const body = expandResponseInformationBaseWire(raw);
  assert.equal(body.readUInt32LE(RIB_OFF_ELEM0), 70, 'expanded elem[0] id');
  assert.equal(body.readUInt32LE(RIB_OFF_ELEM0 + RESP_INFO_BASE_ELEM_BYTES), 1, 'expanded elem[1] id');
});

test('empty record: fixed 0x604 body, count 0, all-zero (no fabricated values)', () => {
  const inner = buildResponseInformationBaseInner({ bases: [] });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  assert.equal(body.length, 0x604, 'body view is exactly 0x604 bytes');
  assert.equal(body.readUInt32LE(RIB_OFF_COUNT), 0, 'count dword is 0');
  assert.ok(body.every((b) => b === 0), 'empty record body is fully zeroed (P3: default 0)');
});

test('count 0 via no-arg call still yields the fixed body', () => {
  const inner = buildResponseInformationBaseInner();
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  assert.equal(body.readUInt32LE(RIB_OFF_COUNT), 0, 'count 0');
});

// ---------------------------------------------------------------------------
// Element layout & offsets
// ---------------------------------------------------------------------------
test('single base: count=1, scalar id + pinned scalars at element offsets', () => {
  const inner = buildResponseInformationBaseInner({
    bases: [{ id: 0xdeadbeef, field04: 0x44, field05: 0x99, field08: 0x11223344 }],
  });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  assert.equal(body.readUInt32LE(RIB_OFF_COUNT), 1, 'count is 1');
  const e0 = RIB_OFF_ELEM0;
  assert.equal(RIB_ELEM_OFF_ID, 0x00, 'id offset 0x00 (world-import match key)');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_ID), 0xdeadbeef, 'id u32 @elem+0x00');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_FIELD_04), 0x44, 'field04 u8 @elem+0x04');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_FIELD_09), 0x99, 'field05 u8 @elem+0x05');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_FIELD_08), 0x11223344, 'field08 u32 @elem+0x08');
});

test('array cross-mapping: transport@+0x20, outfit@+0x9c, budgeting@+0x12c u16, budget@+0x13c, commodity@+0x164', () => {
  const inner = buildResponseInformationBaseInner({
    bases: [{
      transportSupplies: [10, 20, 30],
      outfitSupplies: [40, 50],
      budgeting: [1, 2, 3, 4],
      budget: [100, 200],
      commodity: [7, 8, 9],
    }],
  });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  const e0 = RIB_OFF_ELEM0;

  // offset constants are the RE-pinned values
  assert.equal(RIB_ELEM_OFF_TRANSPORT_CNT, 0x1c);
  assert.equal(RIB_ELEM_OFF_TRANSPORT, 0x20);
  assert.equal(RIB_ELEM_OFF_OUTFIT_CNT, 0x98);
  assert.equal(RIB_ELEM_OFF_OUTFIT, 0x9c);
  assert.equal(RIB_ELEM_OFF_BUDGETING_CNT, 0x12a);
  assert.equal(RIB_ELEM_OFF_BUDGETING, 0x12c);
  assert.equal(RIB_ELEM_OFF_BUDGET_CNT, 0x138);
  assert.equal(RIB_ELEM_OFF_BUDGET, 0x13c);
  assert.equal(RIB_ELEM_OFF_COMMODITY_CNT, 0x160);
  assert.equal(RIB_ELEM_OFF_COMMODITY, 0x164);

  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_TRANSPORT_CNT), 3, 'transport count');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_TRANSPORT), 10, 'transport[0]');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_TRANSPORT + 8), 30, 'transport[2]');

  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_OUTFIT_CNT), 2, 'outfit count');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_OUTFIT), 40, 'outfit[0]');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_OUTFIT + 4), 50, 'outfit[1]');

  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_BUDGETING_CNT), 4, 'budgeting count');
  assert.equal(body.readUInt16LE(e0 + RIB_ELEM_OFF_BUDGETING), 1, 'budgeting[0] u16');
  assert.equal(body.readUInt16LE(e0 + RIB_ELEM_OFF_BUDGETING + 6), 4, 'budgeting[3] u16');

  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_BUDGET_CNT), 2, 'budget count');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_BUDGET), 100, 'budget[0]');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_BUDGET + 4), 200, 'budget[1]');

  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_COMMODITY_CNT), 3, 'commodity count');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_COMMODITY), 7, 'commodity[0]');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_COMMODITY + 8), 9, 'commodity[2]');
});

test('array caps enforced (>cap truncates): transport/outfit≤30, budgeting≤6, budget≤5, commodity≤3', () => {
  assert.equal(RIB_TRANSPORT_MAX, 30);
  assert.equal(RIB_OUTFIT_MAX, 30);
  assert.equal(RIB_BUDGETING_MAX, 6);
  assert.equal(RIB_BUDGET_MAX, 5);
  assert.equal(RIB_COMMODITY_MAX, 3);

  const inner = buildResponseInformationBaseInner({
    bases: [{
      transportSupplies: Array.from({ length: 40 }, (_, i) => i + 1), // 40 > 30
      outfitSupplies: Array.from({ length: 35 }, (_, i) => i + 1),    // 35 > 30
      budgeting: [1, 2, 3, 4, 5, 6, 7, 8],                            // 8 > 6
      budget: [1, 2, 3, 4, 5, 6, 7],                                  // 7 > 5
      commodity: [1, 2, 3, 4, 5],                                     // 5 > 3
    }],
  });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  const e0 = RIB_OFF_ELEM0;

  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_TRANSPORT_CNT), 30, 'transport count clamped to 30');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_TRANSPORT + 29 * 4), 30, 'transport[29] is the 30th element (value 30)');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_OUTFIT_CNT), 30, 'outfit count clamped to 30');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_BUDGETING_CNT), 6, 'budgeting count clamped to 6');
  assert.equal(body.readUInt16LE(e0 + RIB_ELEM_OFF_BUDGETING + 5 * 2), 6, 'budgeting[5] is the 6th element (value 6)');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_BUDGET_CNT), 5, 'budget count clamped to 5');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_BUDGET + 4 * 4), 5, 'budget[4] is the 5th element (value 5)');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_COMMODITY_CNT), 3, 'commodity count clamped to 3');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_COMMODITY + 2 * 4), 3, 'commodity[2] is the 3rd element (value 3)');
});

test('count 4 (max): four element slots populated, stride 0x180 isolation', () => {
  const inner = buildResponseInformationBaseInner({
    bases: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
  });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  assert.equal(body.readUInt32LE(RIB_OFF_COUNT), 4, 'count 4');
  for (let i = 0; i < 4; i += 1) {
    const e = RIB_OFF_ELEM0 + i * RESP_INFO_BASE_ELEM_BYTES;
    assert.equal(body.readUInt32LE(e + RIB_ELEM_OFF_ID), i + 1, `element[${i}] id`);
  }
});

test('count > 4 truncates to max 4 (matches dispatcher information_size over than 4 guard)', () => {
  const inner = buildResponseInformationBaseInner({
    bases: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }],
  });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  assert.equal(body.readUInt32LE(RIB_OFF_COUNT), 4, 'count clamped to 4');
  // only 4 slots exist; the 5th/6th are dropped (body is fixed 0x604).
  const e3 = RIB_OFF_ELEM0 + 3 * RESP_INFO_BASE_ELEM_BYTES;
  assert.equal(body.readUInt32LE(e3 + RIB_ELEM_OFF_ID), 4, 'element[3] id = 4 (last kept)');
});

test('unused element slots are zeroed when count < 4', () => {
  const inner = buildResponseInformationBaseInner({ bases: [{ id: 0x1234 }] });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  // slots 1..3 must be entirely zero
  const slot1 = body.subarray(RIB_OFF_ELEM0 + RESP_INFO_BASE_ELEM_BYTES, RESP_INFO_BASE_BYTES);
  assert.ok(slot1.every((b) => b === 0), 'element slots 1..3 are zero');
});

// ---------------------------------------------------------------------------
// systemToBaseRecord projection (values P3 — safe mappings only)
// ---------------------------------------------------------------------------
test('systemToBaseRecord: maps id/availability default 0, no fabricated values', () => {
  const rec = systemToBaseRecord({ system: 'ルンビーニ', faction: 'alliance' }, { id: 42 });
  assert.equal(rec.id, 42, 'caller-supplied base id is used');
  // no value fabrication: arrays empty / scalars 0 unless caller provided
  assert.ok(!rec.budget || rec.budget.length === 0, 'budget defaults empty (P3)');
  const inner = buildResponseInformationBaseInner({ bases: [rec] });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  assert.equal(body.readUInt32LE(RIB_OFF_COUNT), 1, 'projected record yields count 1');
  assert.equal(body.readUInt32LE(RIB_OFF_ELEM0 + RIB_ELEM_OFF_ID), 42, 'id round-trips');
});

// ---------------------------------------------------------------------------
// economyBaseRecord — planet roll-up into the five P0 arrays only (scalars stay 0)
// ---------------------------------------------------------------------------
test('economyBaseRecord: returns null when there are no planets (caller falls back)', () => {
  assert.equal(economyBaseRecord(null, { id: 5 }), null, 'null planets → null');
  assert.equal(economyBaseRecord([], { id: 5 }), null, 'empty planets → null');
});

test('economyBaseRecord: rolls planets into budget/commodity/budgeting arrays only (P0 offsets)', () => {
  const planets = [
    { industry: 74, habitable: false, orbit: 1 },
    { industry: 250, habitable: true, orbit: 2 },
    { industry: 308, habitable: true, orbit: 3 },
  ];
  const rec = economyBaseRecord(planets, { id: 7, field04: 2 });
  assert.equal(rec.id, 7, 'caller id threaded');
  assert.equal(rec.field04, 2, 'caller owner candidate preserved (passthrough)');
  assert.deepEqual(rec.budget, [74 + 250 + 308], 'budget[0] = Σ industry (production proxy, P3)');
  assert.deepEqual(rec.commodity, [2], 'commodity[0] = habitable planet count');
  assert.deepEqual(rec.budgeting, [3], 'budgeting[0] = planet count');

  // Serialize and confirm the values land at the RE-pinned (P0) array offsets, scalars stay 0.
  const inner = buildResponseInformationBaseInner({ bases: [rec] });
  const body = framedBody(inner, RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  const e0 = RIB_OFF_ELEM0;
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_ID), 7, 'id @elem+0x00');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_FIELD_04), 2, 'owner candidate @elem+0x04');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_BUDGET_CNT), 1, 'budget cnt @+0x138');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_BUDGET), 632, 'budget[0] @+0x13c');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_COMMODITY_CNT), 1, 'commodity cnt @+0x160');
  assert.equal(body.readUInt32LE(e0 + RIB_ELEM_OFF_COMMODITY), 2, 'commodity[0] @+0x164');
  assert.equal(body.readUInt8(e0 + RIB_ELEM_OFF_BUDGETING_CNT), 1, 'budgeting cnt @+0x12a');
  assert.equal(body.readUInt16LE(e0 + RIB_ELEM_OFF_BUDGETING), 3, 'budgeting[0] @+0x12c');
  // scalars at the PROVISIONAL float offsets remain 0 (no fabrication).
  assert.equal(body.readFloatLE(e0 + RIB_ELEM_OFF_FIELD_10), 0, 'availability_ratio candidate stays 0 (PROVISIONAL)');
  assert.equal(body.readFloatLE(e0 + RIB_ELEM_OFF_FIELD_174), 0, 'price_index candidate stays 0 (PROVISIONAL)');
});
