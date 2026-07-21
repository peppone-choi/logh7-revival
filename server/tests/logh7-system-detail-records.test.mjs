import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResponseInformationBaseInner,
  RESP_INFO_BASE_BYTES,
  RESP_INFO_BASE_MAX,
  RESP_INFO_BASE_ELEM_BYTES,
} from '../src/server/codec/base-record.mjs';
import {
  buildResponseInformationInstitutionInner,
  RESP_INFO_INSTITUTION_BYTES,
  RESP_INFO_INSTITUTION_MAX,
  RESP_INFO_INSTITUTION_ELEM_BYTES,
  RESP_INFO_INSTITUTION_INST_MAX,
  RESP_INFO_INSTITUTION_INST_ELEM_BYTES,
  RESP_INFO_INSTITUTION_SPOT_MAX,
  RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES,
} from '../src/server/codec/institution-record.mjs';
import { msg32Body, readMsg32Code } from '../src/server/logh7-world-records.mjs';

test('0x031f codec uses fixed 0x604 body: count@0 + 4×0x180 slots@+4 (owner at elem+0x04)', () => {
  assert.equal(RESP_INFO_BASE_BYTES, 0x604);
  assert.equal(RESP_INFO_BASE_ELEM_BYTES, 0x180);
  assert.equal(RESP_INFO_BASE_MAX, 4);
  const inner = buildResponseInformationBaseInner({
    bases: [1, 2, 3, 4, 5].map((id) => ({ id, field04: id + 10 })),
  });
  const body = msg32Body(inner);
  assert.equal(readMsg32Code(inner), 0x031f);
  assert.equal(body.length, 0x604);
  assert.equal(body.readUInt8(0), 4, 'outer count is capped at four');
  // element[i] @ 4 + i*0x180 — multi-byte LE (case 799 raw copy / native match)
  assert.equal(body.readUInt32LE(4), 1);
  assert.equal(body.readUInt8(4 + 0x04), 11, 'owner/state at elem+0x04');
  assert.equal(body.readUInt32LE(4 + 0x180), 2);
  assert.equal(body.readUInt8(4 + 0x180 + 0x04), 12);
  assert.equal(body.readUInt32LE(4 + 2 * 0x180), 3);
  assert.equal(body.readUInt32LE(4 + 3 * 0x180), 4);
  assert.ok(body.subarray(4 + 4 * 0x180).every((byte) => byte === 0) || body.length === 0x604);
});

test('0x031f fixed slots place array caps at RE offsets inside each 0x180 element', () => {
  const inner = buildResponseInformationBaseInner({
    bases: [{
      id: 0x01020304,
      field04: 0x02,
      transportSupplies: Array.from({ length: 31 }, (_, i) => i + 1),
      outfitSupplies: Array.from({ length: 31 }, (_, i) => i + 101),
      budgeting: Array.from({ length: 7 }, (_, i) => i + 201),
      budget: Array.from({ length: 6 }, (_, i) => i + 301),
      commodity: Array.from({ length: 4 }, (_, i) => i + 401),
    }],
  });
  const body = msg32Body(inner);
  const base = 4;
  assert.equal(body.readUInt32LE(base), 0x01020304);
  assert.equal(body.readUInt8(base + 0x04), 0x02, 'affiliation ownership byte');
  assert.equal(body.readUInt8(base + 0x20), 30, 'transport count @+0x20');
  assert.equal(body.readUInt32LE(base + 0x24), 1);
  assert.equal(body.readUInt32LE(base + 0x24 + 29 * 4), 30);
  assert.equal(body.readUInt8(base + 0x9c), 30, 'outfit count');
  assert.equal(body.readUInt8(base + 0x12e), 6, 'budgeting count');
  assert.equal(body.readUInt8(base + 0x13c), 5, 'budget count');
  assert.equal(body.readUInt8(base + 0x164), 3, 'commodity count');
});

test('0x031f LE id matches native baseId and class_@0x175 is 0..3', () => {
  const ownerOnly = buildResponseInformationBaseInner({
    bases: [{ id: 7, field04: 0x02, field174: 1.0 }],
  });
  const explicit = buildResponseInformationBaseInner({
    bases: [{ id: 8, field04: 0x03, class_: 3, field174: 1.0 }],
  });
  const oBody = msg32Body(ownerOnly);
  const eBody = msg32Body(explicit);
  const base = 4;
  assert.equal(oBody.readUInt32LE(base), 7, 'LE id for case-799 native match');
  assert.equal(oBody.readUInt8(base + 0x04), 0x02);
  // float LE 1.0 + default class 0 → +0x175 is 0 (not BE mid-byte 0x80)
  assert.equal(oBody.readUInt8(base + 0x175), 0, 'default class_ 0 (no owner invent)');
  assert.equal(eBody.readUInt8(base + 0x175), 3, 'explicit class_ written at +0x175');
  assert.equal(eBody.readUInt32LE(base), 8);
});

test('0x0321 codec preserves every P0 fixed size/stride/cap and nested BE fields', () => {
  assert.equal(RESP_INFO_INSTITUTION_BYTES, 0x8de4);
  assert.equal(RESP_INFO_INSTITUTION_ELEM_BYTES, 0x2378);
  assert.equal(RESP_INFO_INSTITUTION_MAX, 4);
  assert.equal(RESP_INFO_INSTITUTION_INST_ELEM_BYTES, 0xfc);
  assert.equal(RESP_INFO_INSTITUTION_INST_MAX, 36);
  assert.equal(RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES, 0xc);
  assert.equal(RESP_INFO_INSTITUTION_SPOT_MAX, 20);
  const spots = Array.from({ length: 21 }, (_, i) => ({
    field00: i + 1,
    field04: i + 101,
    field08: i + 201,
  }));
  const institutions = Array.from({ length: 37 }, (_, i) => ({
    field00: i + 1,
    field04: i + 1001,
    spots,
  }));
  const inner = buildResponseInformationInstitutionInner({
    institutions: [1, 2, 3, 4, 5].map((id) => ({ id, institutions })),
  });
  const body = msg32Body(inner);
  assert.equal(readMsg32Code(inner), 0x0321);
  assert.equal(body.length, 0x8de4);
  assert.equal(body.readUInt8(0), 4, 'outer count is capped at four');
  assert.equal(body.readUInt32BE(1), 1);
  assert.equal(body.readUInt8(5), 36, 'institution count is capped at 36');
  assert.equal(body.readUInt16BE(6), 1);
  assert.equal(body.readUInt32BE(8), 1001);
  assert.equal(body.readUInt8(12), 20, 'spot count is capped at 20');
  assert.equal(body.readUInt16BE(13), 1);
  assert.equal(body.readUInt32BE(15), 101);
  assert.equal(body.readUInt16BE(19), 201);
});
