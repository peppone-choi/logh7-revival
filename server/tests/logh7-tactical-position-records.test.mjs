import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_DISPATCH_BYTES,
  MAX_POSITION_BASES,
  MAX_TACTICS_BASES,
  MAX_TACTICS_UNITS,
  OBSTACLE_DISPATCH_BYTES,
  OBSTACLE_SECTION_LAYOUT,
  POSITION_BASE_DISPATCH_BYTES,
  POSITION_UNIT_DISPATCH_BYTES,
  RESPONSE_INFORMATION_OBSTACLE_CODE,
  RESPONSE_POSITION_BASE_CODE,
  RESPONSE_POSITION_UNIT_CODE,
  RESPONSE_TACTICS_BASE_CODE,
  RESPONSE_TACTICS_UNIT_SHIP_CODE,
  UNIT_SHIP_DISPATCH_BYTES,
  buildInformationObstacleInner,
  buildResponsePositionBaseInner,
  buildResponsePositionUnitInner,
  buildTacticsInformationBaseInner,
  buildTacticsInformationUnitShipInner,
  domainXzToWireXyz,
} from '../src/server/codec/tactical-position-records.mjs';

function bodyOf(inner, expectedCode, expectedBytes) {
  assert.equal(inner.readUInt32LE(0), 0, 'message32 prefix');
  assert.equal(inner.readUInt16BE(4), expectedCode, 'message32 code');
  const body = inner.subarray(6);
  assert.equal(body.length, expectedBytes, 'fixed receive body length');
  return body;
}

test('domain XZ 평면 좌표를 wire XYZ로 한 번만 변환한다', () => {
  assert.deepEqual(
    domainXzToWireXyz({ x: 84, y: 0, z: 116 }),
    { x: 84, y: 116, z: 0 },
  );
  assert.deepEqual(
    domainXzToWireXyz({ x: Number.NaN, y: Number.POSITIVE_INFINITY, z: Number.NEGATIVE_INFINITY }),
    { x: 0, y: 0, z: 0 },
    'non-finite domain coordinates fail closed to zero',
  );
});

test('0x033b는 fixed 0x79e4 body와 direction f32 @+0x18을 기록한다', () => {
  const ships = Array.from({ length: MAX_TACTICS_UNITS + 1 }, (_, index) => (index === 0 ? {
    id: 0x01020304,
    morale: -7,
    confusion: 0x22,
    character: 0x11223344,
    x: 84,
    y: 116,
    z: 0,
    direction: 1.5,
    heading: 91,
    anchorId: 0xaabbccdd,
    detachmentLeader: 0x55667788,
    detachmentX: -3.25,
    detachmentY: 4.5,
    detachmentZ: 5.75,
    detachmentDirection: -0.5,
    search: 0x33,
  } : (index === 1
    ? { id: 2, heading: 91, anchorId: 0xaabbccdd }
    : { id: index + 1 })));
  const body = bodyOf(buildTacticsInformationUnitShipInner({
    ships,
  }), RESPONSE_TACTICS_UNIT_SHIP_CODE, UNIT_SHIP_DISPATCH_BYTES);

  assert.equal(body.readUInt16BE(0), MAX_TACTICS_UNITS);
  assert.deepEqual([...body.subarray(2, 4)], [0, 0], 'count padding stays zero');
  assert.deepEqual([...body.subarray(4, 8)], [1, 2, 3, 4], 'id is big-endian');
  assert.equal(body.readInt8(8), -7, 'morale is signed i8');
  assert.equal(body[9], 0x22);
  assert.deepEqual([...body.subarray(10, 12)], [0, 0], 'record padding stays zero');
  assert.equal(body.readUInt32BE(0x0c), 0x11223344);
  assert.equal(body.readFloatBE(0x10), 84);
  assert.equal(body.readFloatBE(0x14), 116);
  assert.equal(body.readFloatBE(0x18), 0);
  assert.equal(body.readFloatBE(0x1c), 1.5, '+0x18 is direction, never anchorId/heading');
  assert.equal(body.readUInt32BE(0x20), 0x55667788);
  assert.equal(body.readFloatBE(0x24), -3.25);
  assert.equal(body.readFloatBE(0x28), 4.5);
  assert.equal(body.readFloatBE(0x2c), 5.75);
  assert.equal(body.readFloatBE(0x30), -0.5);
  assert.equal(body[0x34], 0x33);
  assert.ok(body.subarray(0x35, 0x38).every((value) => value === 0), 'record tail padding stays zero');
  assert.equal(
    body.readFloatBE(4 + 0x34 + 0x18),
    0,
    'heading/anchorId만 있는 레코드는 wire direction으로 승격하지 않는다',
  );
  assert.equal(body.readUInt32BE(4 + (MAX_TACTICS_UNITS - 1) * 0x34), MAX_TACTICS_UNITS);
});

test('0x0345는 base 16개 cap과 exact 0x20 stride를 지킨다', () => {
  const bases = Array.from({ length: MAX_TACTICS_BASES + 2 }, (_, index) => ({
    id: index === 0 ? 0x01020304 : index + 1,
    x: index === 0 ? 1.25 : index,
    y: index === 0 ? -2.5 : index,
    z: index === 0 ? 3.75 : index,
    antiaircraft: index === 0 ? 0x11223344 : index,
    cannonAngle: index === 0 ? 0x5566 : index,
    cannonStart: index === 0 ? 0x778899aa : index,
    stamina: index === 0 ? 0xbbcc : index,
  }));
  const body = bodyOf(
    buildTacticsInformationBaseInner({ bases }),
    RESPONSE_TACTICS_BASE_CODE,
    BASE_DISPATCH_BYTES,
  );

  assert.equal(body.readUInt8(0), MAX_TACTICS_BASES);
  assert.deepEqual([...body.subarray(1, 4)], [0, 0, 0]);
  assert.deepEqual([...body.subarray(4, 8)], [1, 2, 3, 4]);
  assert.equal(body.readFloatBE(0x08), 1.25);
  assert.equal(body.readFloatBE(0x0c), -2.5);
  assert.equal(body.readFloatBE(0x10), 3.75);
  assert.equal(body.readUInt32BE(0x14), 0x11223344);
  assert.equal(body.readUInt16BE(0x18), 0x5566);
  assert.deepEqual([...body.subarray(0x1a, 0x1c)], [0, 0]);
  assert.equal(body.readUInt32BE(0x1c), 0x778899aa);
  assert.equal(body.readUInt16BE(0x20), 0xbbcc);
  assert.deepEqual([...body.subarray(0x22, 0x24)], [0, 0]);
  assert.equal(body.readUInt32BE(4 + (MAX_TACTICS_BASES - 1) * 0x20), MAX_TACTICS_BASES);
});

test('0x0349는 fixed 0x2ee4 body의 wire x/y/z/direction을 그대로 기록한다', () => {
  const units = Array.from({ length: MAX_TACTICS_UNITS + 1 }, (_, index) => (index === 0 ? {
    id: 0x11223344,
    x: 84,
    y: 116,
    z: 0,
    direction: -1.25,
    heading: 99,
  } : (index === 1 ? { id: 2, heading: 99 } : {
    id: index + 1,
    x: index,
    y: index,
    z: index,
    direction: index,
  })));
  const body = bodyOf(
    buildResponsePositionUnitInner({ units }),
    RESPONSE_POSITION_UNIT_CODE,
    POSITION_UNIT_DISPATCH_BYTES,
  );

  assert.equal(body.readUInt16BE(0), MAX_TACTICS_UNITS);
  assert.deepEqual([...body.subarray(2, 4)], [0, 0]);
  assert.equal(body.readUInt32BE(4), 0x11223344);
  assert.equal(body.readFloatBE(8), 84);
  assert.equal(body.readFloatBE(0x0c), 116);
  assert.equal(body.readFloatBE(0x10), 0);
  assert.equal(body.readFloatBE(0x14), -1.25, 'direction is not read from heading');
  assert.equal(body.readFloatBE(4 + 0x14 + 0x10), 0, 'heading-only record stays zero');
  assert.equal(body.readUInt32BE(4 + (MAX_TACTICS_UNITS - 1) * 0x14), MAX_TACTICS_UNITS);
});

test('0x034b debug/telemetry base position은 4개 cap과 exact 0x10 stride를 지킨다', () => {
  const bases = Array.from({ length: MAX_POSITION_BASES + 1 }, (_, index) => ({
    id: index === 0 ? 0x01020304 : index + 1,
    x: index === 0 ? 84 : index,
    y: index === 0 ? 116 : index,
    z: index === 0 ? 0 : index,
  }));
  const body = bodyOf(
    buildResponsePositionBaseInner({ bases }),
    RESPONSE_POSITION_BASE_CODE,
    POSITION_BASE_DISPATCH_BYTES,
  );

  assert.equal(body.readUInt8(0), MAX_POSITION_BASES);
  assert.deepEqual([...body.subarray(1, 4)], [0, 0, 0]);
  assert.deepEqual([...body.subarray(4, 8)], [1, 2, 3, 4]);
  assert.equal(body.readFloatBE(8), 84);
  assert.equal(body.readFloatBE(0x0c), 116);
  assert.equal(body.readFloatBE(0x10), 0);
  assert.equal(body.readUInt32BE(4 + (MAX_POSITION_BASES - 1) * 0x10), MAX_POSITION_BASES);
});

test('0x0347은 다섯 obstacle 섹션의 고정 경계와 필드 오프셋을 지킨다', () => {
  const body = bodyOf(buildInformationObstacleInner({
    grid: 0x01020304,
    blackholes: [{
      id: 0x11121314,
      kind: 0x15,
      modelFile: 0x1617,
      maxSuctionSpeed: 1.25,
      radius: 2.5,
    }],
    asteroidBelts: [{
      id: 0x21222324,
      kind: 0x25,
      modelFile: 0x2627,
      radius: 3.5,
      range: 4.5,
    }],
    gasClouds: [{
      id: 0x31323334,
      kind: 0x35,
      modelFile: 0x3637,
      revolutionRadius: 5.5,
      revolutionCycle: 0x41424344,
      revolutionDirection: 0x45,
      revolutionInitAngle: 6.5,
      radius: 7.5,
    }],
    abnormalGravities: [{
      id: 0x51525354,
      kind: 0x55,
      modelFile: 0x5657,
      gravityUpRange: 8.5,
      gravityDownRange: 9.5,
    }],
    circles: [{
      id: 0x61626364,
      kind: 0x65,
      modelFile: 0x6667,
      x: 84,
      y: 116,
      z: 0,
      radius: 10.5,
    }],
  }), RESPONSE_INFORMATION_OBSTACLE_CODE, OBSTACLE_DISPATCH_BYTES);

  assert.deepEqual(OBSTACLE_SECTION_LAYOUT, {
    blackholes: { countOffset: 0x04, recordOffset: 0x08, stride: 0x10, cap: 1 },
    asteroidBelts: { countOffset: 0x18, recordOffset: 0x1c, stride: 0x10, cap: 1 },
    gasClouds: { countOffset: 0x2c, recordOffset: 0x30, stride: 0x1c, cap: 10 },
    abnormalGravities: { countOffset: 0x148, recordOffset: 0x14c, stride: 0x10, cap: 1 },
    circles: { countOffset: 0x15c, recordOffset: 0x160, stride: 0x18, cap: 5 },
  });
  assert.equal(body.readUInt32BE(0), 0x01020304);

  assert.equal(body[0x04], 1);
  assert.deepEqual([...body.subarray(0x05, 0x08)], [0, 0, 0]);
  assert.equal(body.readUInt32BE(0x08), 0x11121314);
  assert.equal(body[0x0c], 0x15);
  assert.equal(body[0x0d], 0);
  assert.equal(body.readUInt16BE(0x0e), 0x1617);
  assert.equal(body.readFloatBE(0x10), 1.25);
  assert.equal(body.readFloatBE(0x14), 2.5);

  assert.equal(body[0x18], 1);
  assert.equal(body.readUInt32BE(0x1c), 0x21222324);
  assert.equal(body.readFloatBE(0x24), 3.5);
  assert.equal(body.readFloatBE(0x28), 4.5);

  assert.equal(body[0x2c], 1);
  assert.equal(body.readUInt32BE(0x30), 0x31323334);
  assert.equal(body.readFloatBE(0x38), 5.5);
  assert.equal(body.readUInt32BE(0x3c), 0x41424344);
  assert.equal(body[0x40], 0x45);
  assert.deepEqual([...body.subarray(0x41, 0x44)], [0, 0, 0]);
  assert.equal(body.readFloatBE(0x44), 6.5);
  assert.equal(body.readFloatBE(0x48), 7.5);

  assert.equal(body[0x148], 1);
  assert.equal(body.readUInt32BE(0x14c), 0x51525354);
  assert.equal(body.readFloatBE(0x154), 8.5);
  assert.equal(body.readFloatBE(0x158), 9.5);

  assert.equal(body[0x15c], 1);
  assert.equal(body.readUInt32BE(0x160), 0x61626364);
  assert.equal(body.readFloatBE(0x168), 84);
  assert.equal(body.readFloatBE(0x16c), 116);
  assert.equal(body.readFloatBE(0x170), 0);
  assert.equal(body.readFloatBE(0x174), 10.5);
});

test('0x0347 section cap과 numeric fail-closed가 다음 section을 침범하지 않는다', () => {
  const many = (count) => Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    kind: index + 1,
    modelFile: index + 1,
    maxSuctionSpeed: index + 1,
    radius: index + 1,
    range: index + 1,
    revolutionRadius: index + 1,
    revolutionCycle: index + 1,
    revolutionDirection: index + 1,
    revolutionInitAngle: index + 1,
    gravityUpRange: index + 1,
    gravityDownRange: index + 1,
    x: index + 1,
    y: index + 1,
    z: index + 1,
  }));
  const body = bodyOf(buildInformationObstacleInner({
    grid: Number.NaN,
    blackholes: [{ id: -1, kind: Number.POSITIVE_INFINITY, modelFile: 0x1ffff, radius: Number.NaN }],
    asteroidBelts: many(2),
    gasClouds: many(11),
    abnormalGravities: many(2),
    circles: many(6),
  }), RESPONSE_INFORMATION_OBSTACLE_CODE, OBSTACLE_DISPATCH_BYTES);

  assert.equal(body.readUInt32BE(0), 0);
  assert.equal(body.readUInt32BE(0x08), 0);
  assert.equal(body[0x0c], 0);
  assert.equal(body.readUInt16BE(0x0e), 0xffff, 'finite integer range uses the current clamp convention');
  assert.equal(body.readFloatBE(0x14), 0);
  assert.equal(body[0x18], 1);
  assert.equal(body[0x2c], 10);
  assert.equal(body.readUInt32BE(0x30 + 9 * 0x1c), 10, 'last gas record ends at the section boundary');
  assert.equal(body[0x148], 1);
  assert.equal(body[0x15c], 5);
  assert.equal(body.readUInt32BE(0x160 + 4 * 0x18), 5);
});
