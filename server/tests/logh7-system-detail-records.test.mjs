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

test('0x031f codec preserves the fixed P0 body, stride, cap, and compact BE ids', () => {
  assert.equal(RESP_INFO_BASE_BYTES, 0x604);
  assert.equal(RESP_INFO_BASE_ELEM_BYTES, 0x180);
  assert.equal(RESP_INFO_BASE_MAX, 4);
  const inner = buildResponseInformationBaseInner({
    bases: [1, 2, 3, 4, 5].map((id) => ({ id })),
  });
  const body = msg32Body(inner);
  assert.equal(readMsg32Code(inner), 0x031f);
  assert.equal(body.length, 0x604);
  assert.equal(body.readUInt8(0), 4, 'outer count is capped at four');
  assert.equal(body.readUInt32BE(1), 1);
  assert.equal(body.readUInt32BE(83), 2, 'zero-valued compact element is 82 bytes');
  assert.equal(body.readUInt32BE(165), 3);
  assert.equal(body.readUInt32BE(247), 4);
  assert.ok(body.subarray(329).every((byte) => byte === 0), 'fixed tail remains zero-padded');
});

test('0x031f codec caps all five proven array shapes without changing endian', () => {
  const inner = buildResponseInformationBaseInner({
    bases: [{
      id: 0x01020304,
      transportSupplies: Array.from({ length: 31 }, (_, i) => i + 1),
      outfitSupplies: Array.from({ length: 31 }, (_, i) => i + 101),
      budgeting: Array.from({ length: 7 }, (_, i) => i + 201),
      budget: Array.from({ length: 6 }, (_, i) => i + 301),
      commodity: Array.from({ length: 4 }, (_, i) => i + 401),
    }],
  });
  const body = msg32Body(inner);
  assert.equal(body.readUInt32BE(1), 0x01020304);
  assert.equal(body.readUInt8(27), 30);
  assert.equal(body.readUInt32BE(28), 1);
  assert.equal(body.readUInt32BE(28 + 29 * 4), 30);
  assert.equal(body.readUInt8(148), 30);
  assert.equal(body.readUInt8(291), 6);
  assert.equal(body.readUInt8(304), 5);
  assert.equal(body.readUInt8(341), 3);
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
