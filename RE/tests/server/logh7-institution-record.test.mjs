/**
 * ResponseInformationInstitution (0x0321) base-facilities record builder — tests.
 *
 * This is the FACILITIES (施設) panel of the in-world 「基地管理」 base-management screen (UI-read pair
 * req 0x0320 → resp 0x0321). It is the SISTER of logh7-base-record.mjs (ResponseInformationBase 0x031f):
 * per docs/logh7-info-records-wire.md §3 the 防衛/造兵/対空/衛星 facilities are the institution[]
 * sub-records carried here.
 *
 * The dispatcher (FUN_004ba2b0 case 0x321) ALWAYS copies a FIXED 0x2379 dwords (= 0x8DE4 = 36324 bytes)
 * from the parser-expanded inbound record into clientBase+0x3fb2f8 regardless of count. The on-wire body
 * is the compact FUN_004167f0 parser stream, padded to the 0x8DE4 receive size; tests expand that stream
 * into the native client object before asserting offsets. Expanded shape: count byte @ body+0, then 4 OUTER
 * element slots of stride 0x2378 @ body+4. Each element holds up to 36 institutions (stride 0xfc); each
 * institution holds up to 20 spots (stride 0xc). Wire numeric fields are big-endian; expanded native fields
 * are little-endian. Evidence: parsers FUN_004167f0 (binary) + FUN_00416bd0 (text) + world-import
 * FUN_004c4170, all byte-agreeing.
 * Pure/synchronous — no live client.
 *
 * RED-first: written before the module ships (the import below fails until logh7-institution-record.mjs exists).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResponseInformationInstitutionInner,
  systemToInstitutionRecord,
  RESP_INFO_INSTITUTION_CODE,
  RESP_INFO_INSTITUTION_BYTES,
  RESP_INFO_INSTITUTION_ELEM_BYTES,
  RESP_INFO_INSTITUTION_MAX,
  RESP_INFO_INSTITUTION_INST_ELEM_BYTES,
  RESP_INFO_INSTITUTION_INST_MAX,
  RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES,
  RESP_INFO_INSTITUTION_SPOT_MAX,
  RII_OFF_COUNT,
  RII_OFF_ELEM0,
  RII_ELEM_OFF_ID,
  RII_ELEM_OFF_INST_CNT,
  RII_ELEM_OFF_INST0,
  RII_INST_OFF_FIELD_00,
  RII_INST_OFF_FIELD_04,
  RII_INST_OFF_SPOT_CNT,
  RII_INST_OFF_SPOT0,
  RII_SPOT_OFF_FIELD_00,
  RII_SPOT_OFF_FIELD_04,
  RII_SPOT_OFF_FIELD_08,
} from '../../src/server/logh7-institution-record.mjs';
import { expandResponseInformationInstitutionWire } from './logh7-rii-wire-test-helpers.mjs';

/** Assert message32 framing, then expand the compact parser stream to the client's native object shape. */
function framedBody(inner, code, bodyLen) {
  assert.equal(inner.readUInt32BE(0), 0, 'message32 prefix dword is 0');
  assert.equal(inner.readUInt16BE(4), code, 'inner code (big-endian) matches');
  assert.equal(inner.length, 6 + bodyLen, 'total inner length = 6 + dispatch body size');
  return expandResponseInformationInstitutionWire(inner.subarray(6));
}

// ---------------------------------------------------------------------------
// Constants & framing
// ---------------------------------------------------------------------------
test('constants match the RE-pinned dispatcher copy size (0x2379 dw = 0x8DE4 fixed body) and caps', () => {
  assert.equal(RESP_INFO_INSTITUTION_CODE, 0x0321, 'inner code is 0x0321 (case 0x321)');
  assert.equal(RESP_INFO_INSTITUTION_ELEM_BYTES, 0x2378, 'outer element stride 0x2378 = 9080B');
  assert.equal(RESP_INFO_INSTITUTION_MAX, 4, 'max 4 outer elements (error: information_size over than 4)');
  assert.equal(RESP_INFO_INSTITUTION_INST_ELEM_BYTES, 0xfc, 'institution stride 0xfc = 252B');
  assert.equal(RESP_INFO_INSTITUTION_INST_MAX, 36, 'max 36 institutions (error: institution_size over than 36)');
  assert.equal(RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES, 0xc, 'spot stride 0xc = 12B');
  assert.equal(RESP_INFO_INSTITUTION_SPOT_MAX, 20, 'max 20 spots (error: spot_size over than 20)');
  // dispatcher copies 0x2379 dwords = 0x8DE4 bytes = count dword + 4 element slots of 0x2378.
  assert.equal(RESP_INFO_INSTITUTION_BYTES, 0x8de4, 'fixed body = 0x8DE4 = 36324 = 4 + 4*0x2378');
  assert.equal(
    RESP_INFO_INSTITUTION_BYTES,
    4 + RESP_INFO_INSTITUTION_MAX * RESP_INFO_INSTITUTION_ELEM_BYTES,
    'size cross-check',
  );
  // nested regions are byte-exact (zero padding)
  assert.equal(
    RII_ELEM_OFF_INST0 + RESP_INFO_INSTITUTION_INST_MAX * RESP_INFO_INSTITUTION_INST_ELEM_BYTES,
    RESP_INFO_INSTITUTION_ELEM_BYTES,
    'institution region fills the outer element (0x08 + 36*0xfc = 0x2378)',
  );
  assert.equal(
    RII_INST_OFF_SPOT0 + RESP_INFO_INSTITUTION_SPOT_MAX * RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES,
    RESP_INFO_INSTITUTION_INST_ELEM_BYTES,
    'spot region fills the institution (0x0c + 20*0xc = 0xfc)',
  );
  assert.equal(RII_OFF_COUNT, 0x00, 'count at body+0');
  assert.equal(RII_OFF_ELEM0, 0x04, 'element[0] at body+4 (count dword occupies body+0..3)');
});

test('empty record: fixed 0x8DE4 body, count 0, all-zero (no fabricated values)', () => {
  const inner = buildResponseInformationInstitutionInner({ institutions: [] });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  assert.equal(body.length, 0x8de4, 'body view is exactly 0x8DE4 bytes');
  assert.equal(body.readUInt32LE(RII_OFF_COUNT), 0, 'count dword is 0');
  assert.ok(body.every((b) => b === 0), 'empty record body is fully zeroed (P3: default 0)');
});

test('count 0 via no-arg call still yields the fixed body', () => {
  const inner = buildResponseInformationInstitutionInner();
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  assert.equal(body.readUInt32LE(RII_OFF_COUNT), 0, 'count 0');
});

test('wire body is the compact FUN_004167f0 parser stream, not the expanded memory object', () => {
  const inner = buildResponseInformationInstitutionInner({
    institutions: [{ id: 0x11223344 }, { id: 0x55667788 }],
  });
  const wire = inner.subarray(6);
  assert.equal(wire.readUInt8(0), 2, 'wire count is one byte');
  assert.equal(wire.readUInt32BE(1), 0x11223344, 'element[0].id follows count immediately');
  assert.equal(wire.readUInt8(5), 0, 'element[0].institution_count follows id immediately');
  assert.equal(wire.readUInt32BE(6), 0x55667788, 'element[1].id follows compact element[0]');
  assert.equal(wire.readUInt8(10), 0, 'element[1].institution_count follows id immediately');
});

// ---------------------------------------------------------------------------
// Outer element layout
// ---------------------------------------------------------------------------
test('single element: count=1, id @elem+0x00, institution_count @elem+0x04', () => {
  const inner = buildResponseInformationInstitutionInner({
    institutions: [{ id: 0xdeadbeef, institutions: [{ field00: 1, field04: 2 }, {}] }],
  });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  assert.equal(body.readUInt32LE(RII_OFF_COUNT), 1, 'outer count is 1');
  const e0 = RII_OFF_ELEM0;
  assert.equal(RII_ELEM_OFF_ID, 0x00, 'id offset 0x00');
  assert.equal(RII_ELEM_OFF_INST_CNT, 0x04, 'institution count offset 0x04');
  assert.equal(RII_ELEM_OFF_INST0, 0x08, 'institution[0] offset 0x08');
  assert.equal(body.readUInt32LE(e0 + RII_ELEM_OFF_ID), 0xdeadbeef, 'id u32 @elem+0x00');
  assert.equal(body.readUInt8(e0 + RII_ELEM_OFF_INST_CNT), 2, 'institution_count u8 @elem+0x04');
});

// ---------------------------------------------------------------------------
// Institution sub-record layout
// ---------------------------------------------------------------------------
test('institution sub-record: field00 u16 @+0x00, field04 u32 @+0x04, spot_count u8 @+0x08', () => {
  const inner = buildResponseInformationInstitutionInner({
    institutions: [{
      id: 7,
      institutions: [
        { field00: 0x1234, field04: 0xaabbccdd, spots: [{ field00: 0x55, field04: 0x66, field08: 0x77 }] },
        { field00: 0x4321, field04: 0x11223344, spots: [] },
      ],
    }],
  });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  const e0 = RII_OFF_ELEM0;
  const j0 = e0 + RII_ELEM_OFF_INST0; // institution[0]
  const j1 = j0 + RESP_INFO_INSTITUTION_INST_ELEM_BYTES; // institution[1]

  assert.equal(body.readUInt16LE(j0 + RII_INST_OFF_FIELD_00), 0x1234, 'inst[0].field00 u16 @+0x00');
  assert.equal(body.readUInt32LE(j0 + RII_INST_OFF_FIELD_04), 0xaabbccdd, 'inst[0].field04 u32 @+0x04');
  assert.equal(body.readUInt8(j0 + RII_INST_OFF_SPOT_CNT), 1, 'inst[0].spot_count u8 @+0x08');

  assert.equal(body.readUInt16LE(j1 + RII_INST_OFF_FIELD_00), 0x4321, 'inst[1].field00 u16 @+0x00 (stride 0xfc isolation)');
  assert.equal(body.readUInt32LE(j1 + RII_INST_OFF_FIELD_04), 0x11223344, 'inst[1].field04 u32 @+0x04');
  assert.equal(body.readUInt8(j1 + RII_INST_OFF_SPOT_CNT), 0, 'inst[1].spot_count u8 @+0x08 = 0');
});

// ---------------------------------------------------------------------------
// Spot sub-record layout
// ---------------------------------------------------------------------------
test('spot sub-record: field00 u16 @+0x00, field04 u32 @+0x04, field08 u16 @+0x08, stride 0xc', () => {
  const inner = buildResponseInformationInstitutionInner({
    institutions: [{
      institutions: [{
        spots: [
          { field00: 0x0a0b, field04: 0x0c0d0e0f, field08: 0x1011 },
          { field00: 0x2122, field04: 0x23242526, field08: 0x2728 },
        ],
      }],
    }],
  });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  const j0 = RII_OFF_ELEM0 + RII_ELEM_OFF_INST0;
  const s0 = j0 + RII_INST_OFF_SPOT0; // spot[0]
  const s1 = s0 + RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES; // spot[1]

  assert.equal(body.readUInt8(j0 + RII_INST_OFF_SPOT_CNT), 2, 'spot_count is 2');
  assert.equal(body.readUInt16LE(s0 + RII_SPOT_OFF_FIELD_00), 0x0a0b, 'spot[0].field00 u16 @+0x00');
  assert.equal(body.readUInt32LE(s0 + RII_SPOT_OFF_FIELD_04), 0x0c0d0e0f, 'spot[0].field04 u32 @+0x04');
  assert.equal(body.readUInt16LE(s0 + RII_SPOT_OFF_FIELD_08), 0x1011, 'spot[0].field08 u16 @+0x08');
  assert.equal(body.readUInt16LE(s1 + RII_SPOT_OFF_FIELD_00), 0x2122, 'spot[1].field00 u16 (stride 0xc isolation)');
  assert.equal(body.readUInt32LE(s1 + RII_SPOT_OFF_FIELD_04), 0x23242526, 'spot[1].field04 u32');
  assert.equal(body.readUInt16LE(s1 + RII_SPOT_OFF_FIELD_08), 0x2728, 'spot[1].field08 u16');
});

// ---------------------------------------------------------------------------
// Cap enforcement (the three over-limit guards)
// ---------------------------------------------------------------------------
test('outer count > 4 truncates to max 4 (dispatcher information_size over than 4 guard)', () => {
  const inner = buildResponseInformationInstitutionInner({
    institutions: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }],
  });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  assert.equal(body.readUInt32LE(RII_OFF_COUNT), 4, 'outer count clamped to 4');
  const e3 = RII_OFF_ELEM0 + 3 * RESP_INFO_INSTITUTION_ELEM_BYTES;
  assert.equal(body.readUInt32LE(e3 + RII_ELEM_OFF_ID), 4, 'element[3] id = 4 (last kept)');
});

test('institution count > 36 truncates to max 36 (institution_size over than 36 guard)', () => {
  const insts = Array.from({ length: 50 }, (_, i) => ({ field04: i + 1 })); // 50 > 36
  const inner = buildResponseInformationInstitutionInner({ institutions: [{ id: 1, institutions: insts }] });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  const e0 = RII_OFF_ELEM0;
  assert.equal(body.readUInt8(e0 + RII_ELEM_OFF_INST_CNT), 36, 'institution_count clamped to 36');
  const jLast = e0 + RII_ELEM_OFF_INST0 + 35 * RESP_INFO_INSTITUTION_INST_ELEM_BYTES;
  assert.equal(body.readUInt32LE(jLast + RII_INST_OFF_FIELD_04), 36, 'institution[35].field04 is the 36th (value 36)');
});

test('spot count > 20 truncates to max 20 (spot_size over than 20 guard)', () => {
  const spots = Array.from({ length: 30 }, (_, i) => ({ field04: i + 1 })); // 30 > 20
  const inner = buildResponseInformationInstitutionInner({
    institutions: [{ id: 1, institutions: [{ spots }] }],
  });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  const j0 = RII_OFF_ELEM0 + RII_ELEM_OFF_INST0;
  assert.equal(body.readUInt8(j0 + RII_INST_OFF_SPOT_CNT), 20, 'spot_count clamped to 20');
  const sLast = j0 + RII_INST_OFF_SPOT0 + 19 * RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES;
  assert.equal(body.readUInt32LE(sLast + RII_SPOT_OFF_FIELD_04), 20, 'spot[19].field04 is the 20th (value 20)');
});

// ---------------------------------------------------------------------------
// Edge cases & isolation
// ---------------------------------------------------------------------------
test('count 4 (max): four element slots populated, stride 0x2378 isolation', () => {
  const inner = buildResponseInformationInstitutionInner({
    institutions: [{ id: 0x11 }, { id: 0x22 }, { id: 0x33 }, { id: 0x44 }],
  });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  assert.equal(body.readUInt32LE(RII_OFF_COUNT), 4, 'count 4');
  for (let i = 0; i < 4; i += 1) {
    const e = RII_OFF_ELEM0 + i * RESP_INFO_INSTITUTION_ELEM_BYTES;
    assert.equal(body.readUInt32LE(e + RII_ELEM_OFF_ID), 0x11 * (i + 1), `element[${i}] id`);
  }
});

test('unused element slots are zeroed when count < 4', () => {
  const inner = buildResponseInformationInstitutionInner({ institutions: [{ id: 0x1234 }] });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  const slot1plus = body.subarray(RII_OFF_ELEM0 + RESP_INFO_INSTITUTION_ELEM_BYTES, RESP_INFO_INSTITUTION_BYTES);
  assert.ok(slot1plus.every((b) => b === 0), 'element slots 1..3 are zero');
});

test('institution with 0 spots: spot_count 0, spot region zeroed', () => {
  const inner = buildResponseInformationInstitutionInner({
    institutions: [{ id: 1, institutions: [{ field00: 9, field04: 9, spots: [] }] }],
  });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  const j0 = RII_OFF_ELEM0 + RII_ELEM_OFF_INST0;
  assert.equal(body.readUInt8(j0 + RII_INST_OFF_SPOT_CNT), 0, 'spot_count 0');
  const spotRegion = body.subarray(j0 + RII_INST_OFF_SPOT0, j0 + RESP_INFO_INSTITUTION_INST_ELEM_BYTES);
  assert.ok(spotRegion.every((b) => b === 0), 'spot region is zeroed');
});

// ---------------------------------------------------------------------------
// systemToInstitutionRecord projection (values P3 — safe mappings only)
// ---------------------------------------------------------------------------
test('systemToInstitutionRecord: maps id only, no fabricated institutions/spots', () => {
  const rec = systemToInstitutionRecord({ system: 'ルンビーニ', faction: 'alliance' }, { id: 42 });
  assert.equal(rec.id, 42, 'caller-supplied base id is used');
  assert.ok(!rec.institutions || rec.institutions.length === 0, 'institutions default empty (P3)');
  const inner = buildResponseInformationInstitutionInner({ institutions: [rec] });
  const body = framedBody(inner, RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  assert.equal(body.readUInt32LE(RII_OFF_COUNT), 1, 'projected record yields count 1');
  assert.equal(body.readUInt32LE(RII_OFF_ELEM0 + RII_ELEM_OFF_ID), 42, 'id round-trips');
  assert.equal(body.readUInt8(RII_OFF_ELEM0 + RII_ELEM_OFF_INST_CNT), 0, 'institution_count 0 (no fabrication)');
});
