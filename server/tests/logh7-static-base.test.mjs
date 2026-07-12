import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStaticInformationBaseFromGalaxy,
  buildStaticInformationBaseInner,
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

test('031c request selector is decoded and selected system is first in deterministic catalog', () => {
  const request = Buffer.alloc(8);
  request.writeUInt16BE(0x031c, 0);
  request.writeUInt16BE(1, 2);
  request.writeUInt32LE(1406, 4);
  const selector = readStaticBaseRequest(request);
  assert.deepEqual(selector, { requestValue: 1406, systemId: 2, cell: 1406 });
  const body = msg32Body(buildStaticInformationBaseFromGalaxy(selector));
  const selected = readStreamRecord(body);
  assert.equal(selected.id, 2);
  assert.equal(selected.grid, 1406);
  assert.equal(selected.name, 'シロン');
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
