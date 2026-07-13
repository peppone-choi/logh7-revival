import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaticInformationBaseFromGalaxy,
  buildStaticInformationBaseInner,
  findStaticBaseByCell,
  getStaticBaseCatalog,
  readStaticBaseRequest,
  STATIC_BASE_BODY_BYTES,
} from '../src/server/logh7-static-base.mjs';
import { msg32Body, readMsg32Code } from '../src/server/logh7-world-records.mjs';
import { createWorldSession } from '../src/server/logh7-world-session.mjs';

function readStreamRecord(body, offset = 2) {
  const id = body.readUInt32BE(offset);
  const grid = body.readUInt16BE(offset + 4);
  const field06 = body.readUInt16BE(offset + 6);
  const field08 = body.readUInt16BE(offset + 8);
  const nameLength = body.readUInt8(offset + 10);
  let cursor = offset + 11;
  let name = '';
  for (let i = 0; i < nameLength; i += 1) {
    name += String.fromCharCode(body.readUInt16BE(cursor));
    cursor += 2;
  }
  const class_ = body.readUInt8(cursor);
  cursor += 1;
  const diameter = body.readFloatBE(cursor);
  cursor += 4;
  const revolutionRadius = body.readUInt32BE(cursor);
  cursor += 4;
  const revolutionDirection = body.readUInt8(cursor);
  cursor += 1;
  const revolutionCycle = body.readFloatBE(cursor);
  cursor += 4;
  const revolutionInitAngle = body.readFloatBE(cursor);
  cursor += 4;
  return {
    id,
    grid,
    field06,
    field08,
    name,
    class_,
    diameter,
    revolutionRadius,
    revolutionDirection,
    revolutionCycle,
    revolutionInitAngle,
    next: cursor,
  };
}

test('0x031d builder preserves fixed framing and proven stream offsets', () => {
  const inner = buildStaticInformationBaseInner({
    bases: [{
      id: 0x01020304,
      grid: 0x1234,
      name: '星系',
      class_: 7,
      diameter: 2.5,
      revolutionRadius: 0x11223344,
      revolutionDirection: 9,
      revolutionCycle: 3.5,
      revolutionInitAngle: 4.5,
    }],
  });
  assert.equal(readMsg32Code(inner), 0x031d);
  const body = msg32Body(inner);
  assert.equal(body.length, STATIC_BASE_BODY_BYTES);
  assert.equal(body.readUInt16BE(0), 1);
  const record = readStreamRecord(body);
  assert.deepEqual(record, {
    id: 0x01020304,
    grid: 0x1234,
    field06: 0,
    field08: 0,
    name: '星系',
    class_: 7,
    diameter: 2.5,
    revolutionRadius: 0x11223344,
    revolutionDirection: 9,
    revolutionCycle: 3.5,
    revolutionInitAngle: 4.5,
    next: 2 + 11 + 4 + 1 + 4 + 4 + 1 + 4 + 4,
  });
  assert.ok(body.subarray(record.next).every((byte) => byte === 0), 'padding/unknown bytes remain zero');
});

test('galaxy catalog emits deterministic system records and leaves unsupported astronomy zero', () => {
  const catalog = getStaticBaseCatalog();
  assert.equal(catalog.length, 85);
  assert.equal(catalog[0].id, 1);
  assert.equal(catalog[0].grid, 2005);
  assert.equal(catalog[0].name, 'ルンビーニ');
  assert.ok(catalog.every((record) => record.class_ === 0));
  assert.ok(catalog.every((record) => record.revolutionRadius === 0));
  const body = msg32Body(buildStaticInformationBaseFromGalaxy());
  assert.equal(body.readUInt16BE(0), 85);
  const first = readStreamRecord(body);
  assert.equal(first.id, 1);
  assert.equal(first.grid, 2005);
  assert.equal(first.name, 'ルンビーニ');
  assert.equal(first.class_, 0);
  assert.equal(first.revolutionRadius, 0);
});

test('player cell 2588 resolves to the Valhalla base id instead of the old hardcoded id 1', () => {
  const resolved = findStaticBaseByCell(2588);
  assert.equal(resolved?.id, 70);
  assert.equal(resolved?.name, 'ヴァルハラ');
});

test('031c request selector is decoded and selected system is first in deterministic catalog', () => {
  const request = Buffer.alloc(8);
  request.writeUInt16BE(0x031c, 0);
  request.writeUInt16BE(1, 2);
  request.writeUInt32LE(1406, 4);
  const selector = readStaticBaseRequest(request);
  assert.deepEqual(selector, {
    selectorStatus: 'matched',
    requestValue: 1406,
    systemId: 2,
    cell: 1406,
  });
  const body = msg32Body(buildStaticInformationBaseFromGalaxy(selector));
  const selected = readStreamRecord(body);
  assert.equal(selected.id, 2);
  assert.equal(selected.grid, 1406);
  assert.equal(selected.name, 'シロン');
});

test('selector parser distinguishes an absent selector from unmatched and malformed selectors', () => {
  const absent = Buffer.alloc(2);
  absent.writeUInt16BE(0x031e, 0);
  assert.equal(readStaticBaseRequest(absent).selectorStatus, 'absent');

  const emptyList = Buffer.alloc(4);
  emptyList.writeUInt16BE(0x031e, 0);
  emptyList.writeUInt16BE(0, 2);
  assert.equal(readStaticBaseRequest(emptyList).selectorStatus, 'absent');

  const unmatched = Buffer.alloc(8);
  unmatched.writeUInt16BE(0x031e, 0);
  unmatched.writeUInt16BE(1, 2);
  unmatched.writeUInt32LE(0x7fffffff, 4);
  assert.equal(readStaticBaseRequest(unmatched).selectorStatus, 'unmatched');

  const malformed = Buffer.alloc(4);
  malformed.writeUInt16BE(0x0320, 0);
  malformed.writeUInt16BE(1, 2);
  assert.equal(readStaticBaseRequest(malformed).selectorStatus, 'unmatched');
});

test('count-prefixed selector shape rejects trailing, truncated, and extra payload without reinterpreting offset zero', () => {
  const countZeroTrailing = Buffer.alloc(8);
  countZeroTrailing.writeUInt16BE(0x031e, 0);
  countZeroTrailing.writeUInt16BE(0, 2);
  countZeroTrailing.writeUInt32LE(0x4600, 4); // body offset 0을 BE u32로 오독하면 ID 70이 된다.
  assert.equal(readStaticBaseRequest(countZeroTrailing).selectorStatus, 'unmatched');
  assert.equal(readStaticBaseRequest(countZeroTrailing).systemId, null);

  const zeroTrailingBodyOnly = Buffer.alloc(6);
  zeroTrailingBodyOnly.writeUInt16BE(0, 0);
  zeroTrailingBodyOnly.writeUInt32LE(0, 2);
  assert.equal(readStaticBaseRequest(zeroTrailingBodyOnly).selectorStatus, 'unmatched');

  const countExceedsPayload = Buffer.alloc(8);
  countExceedsPayload.writeUInt16BE(0x031e, 0);
  countExceedsPayload.writeUInt16BE(2, 2);
  countExceedsPayload.writeUInt32LE(2, 4);
  assert.equal(readStaticBaseRequest(countExceedsPayload).selectorStatus, 'unmatched');

  const extraPayload = Buffer.alloc(9);
  extraPayload.writeUInt16BE(0x031e, 0);
  extraPayload.writeUInt16BE(1, 2);
  extraPayload.writeUInt32LE(2, 4);
  extraPayload.writeUInt8(0xff, 8);
  assert.equal(readStaticBaseRequest(extraPayload).selectorStatus, 'unmatched');
});

test('message32 envelope is recognized by zero prefix and selector opcode together', () => {
  const message32 = Buffer.alloc(12);
  message32.writeUInt32LE(0, 0);
  message32.writeUInt16BE(0x031e, 4);
  message32.writeUInt16BE(1, 6);
  message32.writeUInt32LE(2, 8);
  assert.equal(readStaticBaseRequest(message32).systemId, 2);
});

test('detail selector requests reject an exact count of five while static-base request stays uncapped', () => {
  for (const requestCode of [0x031e, 0x0320]) {
    const detailRequest = Buffer.alloc(24);
    detailRequest.writeUInt16BE(requestCode, 0);
    detailRequest.writeUInt16BE(5, 2);
    for (let i = 0; i < 5; i += 1) detailRequest.writeUInt32LE(i + 2, 4 + i * 4);
    assert.equal(readStaticBaseRequest(detailRequest).selectorStatus, 'unmatched',
      `0x${requestCode.toString(16)} count=5 exceeds the proven cap`);
  }

  const staticRequest = Buffer.alloc(24);
  staticRequest.writeUInt16BE(0x031c, 0);
  staticRequest.writeUInt16BE(5, 2);
  for (let i = 0; i < 5; i += 1) staticRequest.writeUInt32LE(i + 2, 4 + i * 4);
  assert.equal(readStaticBaseRequest(staticRequest).systemId, 2,
    '0x031c does not inherit an unproven detail-request cap');
});

test('selector ids use the proven little-endian wire shape without big-endian alias fallback', () => {
  for (const requestCode of [0x031e, 0x0320]) {
    const bigEndianAlias = Buffer.alloc(8);
    bigEndianAlias.writeUInt16BE(requestCode, 0);
    bigEndianAlias.writeUInt16BE(1, 2);
    bigEndianAlias.writeUInt32BE(2, 4);
    assert.equal(readStaticBaseRequest(bigEndianAlias).selectorStatus, 'unmatched',
      `0x${requestCode.toString(16)} must not reinterpret a LE miss as BE id 2`);
  }

  const bodyOnlyBigEndianAlias = Buffer.alloc(4);
  bodyOnlyBigEndianAlias.writeUInt32BE(2, 0);
  assert.equal(readStaticBaseRequest(bodyOnlyBigEndianAlias).selectorStatus, 'unmatched');
});

test('an exact four-byte body-only u32 remains a supported diagnostic selector shape', () => {
  const bodyOnly = Buffer.alloc(4);
  bodyOnly.writeUInt32LE(2, 0);
  assert.deepEqual(readStaticBaseRequest(bodyOnly), {
    selectorStatus: 'matched',
    requestValue: 2,
    systemId: 2,
    cell: 1406,
  });
});

test('world session routes 031c to populated 031d instead of zero walker', () => {
  const world = createWorldSession();
  const request = Buffer.alloc(8);
  request.writeUInt16BE(0x031c, 0);
  request.writeUInt16BE(1, 2);
  request.writeUInt32LE(1406, 4);
  const result = world.handleWorldInner({ connectionId: 1, accountId: 'static-base', inner: request });
  assert.equal(result.kind, 'admission');
  assert.equal(readMsg32Code(result.responses[0].inner), 0x031d);
  const body = msg32Body(result.responses[0].inner);
  assert.equal(body.length, STATIC_BASE_BODY_BYTES);
  assert.equal(body.readUInt16BE(0), 85);
  assert.equal(readStreamRecord(body).name, 'シロン');
});
