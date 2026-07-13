// 전술 위치/천체 wire 코덱. 이 모듈은 권위 battle state를 만들거나 자동 방출하지 않는다.
// 후속 통합점은 권위 battle state → domainXzToWireXyz → 각 message32 빌더 → 월드 세션 push다.

export const RESPONSE_TACTICS_UNIT_SHIP_CODE = 0x033b;
export const RESPONSE_TACTICS_BASE_CODE = 0x0345;
export const RESPONSE_INFORMATION_OBSTACLE_CODE = 0x0347;
export const RESPONSE_POSITION_UNIT_CODE = 0x0349;
export const RESPONSE_POSITION_BASE_CODE = 0x034b;

export const UNIT_SHIP_DISPATCH_BYTES = 0x79e4;
export const BASE_DISPATCH_BYTES = 0x0204;
export const OBSTACLE_DISPATCH_BYTES = 0x01d8;
export const POSITION_UNIT_DISPATCH_BYTES = 0x2ee4;
export const POSITION_BASE_DISPATCH_BYTES = 0x0044;

export const UNIT_SHIP_RECORD_BYTES = 0x34;
export const BASE_RECORD_BYTES = 0x20;
export const POSITION_UNIT_RECORD_BYTES = 0x14;
export const POSITION_BASE_RECORD_BYTES = 0x10;

export const MAX_TACTICS_UNITS = 600;
export const MAX_TACTICS_BASES = 16;
export const MAX_POSITION_BASES = 4;

export const OBSTACLE_SECTION_LAYOUT = Object.freeze({
  blackholes: Object.freeze({ countOffset: 0x04, recordOffset: 0x08, stride: 0x10, cap: 1 }),
  asteroidBelts: Object.freeze({ countOffset: 0x18, recordOffset: 0x1c, stride: 0x10, cap: 1 }),
  gasClouds: Object.freeze({ countOffset: 0x2c, recordOffset: 0x30, stride: 0x1c, cap: 10 }),
  abnormalGravities: Object.freeze({ countOffset: 0x148, recordOffset: 0x14c, stride: 0x10, cap: 1 }),
  circles: Object.freeze({ countOffset: 0x15c, recordOffset: 0x160, stride: 0x18, cap: 5 }),
});

const F32_MAX = 3.4028234663852886e38;

function finiteNumber(value) {
  try {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  } catch {
    return 0;
  }
}

function f32(value) {
  const number = finiteNumber(value);
  return Math.abs(number) <= F32_MAX ? number : 0;
}

function uint(value, max) {
  const number = finiteNumber(value);
  return Math.max(0, Math.min(max, Math.trunc(number)));
}

const u8 = (value) => uint(value, 0xff);
const u16 = (value) => uint(value, 0xffff);
const u32 = (value) => uint(value, 0xffffffff);

function i8(value) {
  const number = finiteNumber(value);
  return Math.max(-0x80, Math.min(0x7f, Math.trunc(number)));
}

function asRecord(value) {
  return value != null && typeof value === 'object' ? value : {};
}

function cappedRecords(value, cap) {
  return Array.isArray(value) ? value.slice(0, cap) : [];
}

function buildMsg32Inner(code, body) {
  const inner = Buffer.alloc(6 + body.length);
  inner.writeUInt32LE(0, 0);
  inner.writeUInt16BE(code, 4);
  body.copy(inner, 6);
  return inner;
}

function writeU8(body, offset, value) {
  body.writeUInt8(u8(value), offset);
}

function writeI8(body, offset, value) {
  body.writeInt8(i8(value), offset);
}

function writeU16(body, offset, value) {
  body.writeUInt16BE(u16(value), offset);
}

function writeU32(body, offset, value) {
  body.writeUInt32BE(u32(value), offset);
}

function writeF32(body, offset, value) {
  body.writeFloatBE(f32(value), offset);
}

/**
 * 도메인의 XZ 평면 좌표를 클라이언트 wire XYZ 축으로 바꾸는 유일한 경계다.
 * 각 빌더는 이미 변환된 wire x/y/z만 받으며 내부에서 축을 다시 바꾸지 않는다.
 */
export function domainXzToWireXyz(position = {}) {
  const source = asRecord(position);
  return {
    x: f32(source.x),
    y: f32(source.z),
    z: f32(source.y ?? 0),
  };
}

/** 0x033b: 함선별 전술 상태. +0x18은 반드시 f32 direction이다. */
export function buildTacticsInformationUnitShipInner({ ships = [] } = {}) {
  const records = cappedRecords(ships, MAX_TACTICS_UNITS);
  const body = Buffer.alloc(UNIT_SHIP_DISPATCH_BYTES);
  writeU16(body, 0, records.length);

  for (let index = 0; index < records.length; index += 1) {
    const ship = asRecord(records[index]);
    const offset = 4 + index * UNIT_SHIP_RECORD_BYTES;
    writeU32(body, offset + 0x00, ship.id);
    writeI8(body, offset + 0x04, ship.morale);
    writeU8(body, offset + 0x05, ship.confusion);
    writeU32(body, offset + 0x08, ship.character);
    writeF32(body, offset + 0x0c, ship.x);
    writeF32(body, offset + 0x10, ship.y);
    writeF32(body, offset + 0x14, ship.z);
    writeF32(body, offset + 0x18, ship.direction);
    writeU32(body, offset + 0x1c, ship.detachmentLeader);
    writeF32(body, offset + 0x20, ship.detachmentX);
    writeF32(body, offset + 0x24, ship.detachmentY);
    writeF32(body, offset + 0x28, ship.detachmentZ);
    writeF32(body, offset + 0x2c, ship.detachmentDirection);
    writeU8(body, offset + 0x30, ship.search);
  }

  return buildMsg32Inner(RESPONSE_TACTICS_UNIT_SHIP_CODE, body);
}

/** 0x0345: 요새/기지 전술 상태. */
export function buildTacticsInformationBaseInner({ bases = [] } = {}) {
  const records = cappedRecords(bases, MAX_TACTICS_BASES);
  const body = Buffer.alloc(BASE_DISPATCH_BYTES);
  writeU8(body, 0, records.length);

  for (let index = 0; index < records.length; index += 1) {
    const base = asRecord(records[index]);
    const offset = 4 + index * BASE_RECORD_BYTES;
    writeU32(body, offset + 0x00, base.id);
    writeF32(body, offset + 0x04, base.x);
    writeF32(body, offset + 0x08, base.y);
    writeF32(body, offset + 0x0c, base.z);
    writeU32(body, offset + 0x10, base.antiaircraft);
    writeU16(body, offset + 0x14, base.cannonAngle);
    writeU32(body, offset + 0x18, base.cannonStart);
    writeU16(body, offset + 0x1c, base.stamina);
  }

  return buildMsg32Inner(RESPONSE_TACTICS_BASE_CODE, body);
}

/** 0x0349: 전술 유닛의 주 권위 위치 read model. */
export function buildResponsePositionUnitInner({ units = [] } = {}) {
  const records = cappedRecords(units, MAX_TACTICS_UNITS);
  const body = Buffer.alloc(POSITION_UNIT_DISPATCH_BYTES);
  writeU16(body, 0, records.length);

  for (let index = 0; index < records.length; index += 1) {
    const unit = asRecord(records[index]);
    const offset = 4 + index * POSITION_UNIT_RECORD_BYTES;
    writeU32(body, offset + 0x00, unit.id);
    writeF32(body, offset + 0x04, unit.x);
    writeF32(body, offset + 0x08, unit.y);
    writeF32(body, offset + 0x0c, unit.z);
    writeF32(body, offset + 0x10, unit.direction);
  }

  return buildMsg32Inner(RESPONSE_POSITION_UNIT_CODE, body);
}

/**
 * 0x034b: 기지 위치 debug/telemetry 표면이다.
 * 주 권위 위치는 0x0345를 사용하며 이 레코드로 대체하지 않는다.
 */
export function buildResponsePositionBaseInner({ bases = [] } = {}) {
  const records = cappedRecords(bases, MAX_POSITION_BASES);
  const body = Buffer.alloc(POSITION_BASE_DISPATCH_BYTES);
  writeU8(body, 0, records.length);

  for (let index = 0; index < records.length; index += 1) {
    const base = asRecord(records[index]);
    const offset = 4 + index * POSITION_BASE_RECORD_BYTES;
    writeU32(body, offset + 0x00, base.id);
    writeF32(body, offset + 0x04, base.x);
    writeF32(body, offset + 0x08, base.y);
    writeF32(body, offset + 0x0c, base.z);
  }

  return buildMsg32Inner(RESPONSE_POSITION_BASE_CODE, body);
}

function writeObstacleCommon(body, offset, obstacle) {
  writeU32(body, offset + 0x00, obstacle.id);
  writeU8(body, offset + 0x04, obstacle.kind);
  writeU16(body, offset + 0x06, obstacle.modelFile);
}

function writeObstacleSection(body, sectionName, records, writer) {
  const layout = OBSTACLE_SECTION_LAYOUT[sectionName];
  const list = cappedRecords(records, layout.cap);
  writeU8(body, layout.countOffset, list.length);
  for (let index = 0; index < list.length; index += 1) {
    const obstacle = asRecord(list[index]);
    const offset = layout.recordOffset + index * layout.stride;
    writeObstacleCommon(body, offset, obstacle);
    writer(body, offset, obstacle);
  }
}

/** 0x0347: grid와 다섯 고정 hazard 섹션. 가변 cursor 포맷으로 직렬화하지 않는다. */
export function buildInformationObstacleInner({
  grid = 0,
  blackholes = [],
  asteroidBelts = [],
  gasClouds = [],
  abnormalGravities = [],
  circles = [],
} = {}) {
  const body = Buffer.alloc(OBSTACLE_DISPATCH_BYTES);
  writeU32(body, 0x00, grid);

  writeObstacleSection(body, 'blackholes', blackholes, (target, offset, obstacle) => {
    writeF32(target, offset + 0x08, obstacle.maxSuctionSpeed);
    writeF32(target, offset + 0x0c, obstacle.radius);
  });
  writeObstacleSection(body, 'asteroidBelts', asteroidBelts, (target, offset, obstacle) => {
    writeF32(target, offset + 0x08, obstacle.radius);
    writeF32(target, offset + 0x0c, obstacle.range);
  });
  writeObstacleSection(body, 'gasClouds', gasClouds, (target, offset, obstacle) => {
    writeF32(target, offset + 0x08, obstacle.revolutionRadius);
    writeU32(target, offset + 0x0c, obstacle.revolutionCycle);
    writeU8(target, offset + 0x10, obstacle.revolutionDirection);
    writeF32(target, offset + 0x14, obstacle.revolutionInitAngle);
    writeF32(target, offset + 0x18, obstacle.radius);
  });
  writeObstacleSection(body, 'abnormalGravities', abnormalGravities, (target, offset, obstacle) => {
    writeF32(target, offset + 0x08, obstacle.gravityUpRange);
    writeF32(target, offset + 0x0c, obstacle.gravityDownRange);
  });
  writeObstacleSection(body, 'circles', circles, (target, offset, obstacle) => {
    writeF32(target, offset + 0x08, obstacle.x);
    writeF32(target, offset + 0x0c, obstacle.y);
    writeF32(target, offset + 0x10, obstacle.z);
    writeF32(target, offset + 0x14, obstacle.radius);
  });

  return buildMsg32Inner(RESPONSE_INFORMATION_OBSTACLE_CODE, body);
}
