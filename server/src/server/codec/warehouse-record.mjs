// 0x0326 RequestInformationWarehouse / 0x0327 ResponseInformationWarehouse 코덱.
// 응답 body는 고정 0x300바이트지만 FUN_0041a870은 필드를 compact cursor로 읽어
// 0x300바이트 native cache의 별도 offset에 저장한다. 따라서 wire에는 cache padding을 쓰지 않는다.

export const REQ_INFO_WAREHOUSE_CODE = 0x0326;
// 0030-decoded innerLen=10 은 inner 전체(코드 2B + body 8B)다 → 요청 body 는 8바이트.
export const REQ_INFO_WAREHOUSE_BODY_BYTES = 0x08;
export const RESP_INFO_WAREHOUSE_CODE = 0x0327;
export const RESP_INFO_WAREHOUSE_BODY_BYTES = 0x300;
export const WAREHOUSE_SHIPS_MAX = 99;
export const WAREHOUSE_TROOPS_MAX = 24;

function clampInteger(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(number)));
}

function writeU8(body, cursor, value) {
  body.writeUInt8(clampInteger(value, 0xff), cursor);
  return cursor + 1;
}

function writeU16(body, cursor, value) {
  body.writeUInt16BE(clampInteger(value, 0xffff), cursor);
  return cursor + 2;
}

function writeU32(body, cursor, value) {
  body.writeUInt32BE(clampInteger(value, 0xffffffff), cursor);
  return cursor + 4;
}

/**
 * 클라이언트 송신 serializer(0x40c2d0)의 8바이트 요청 body를 읽는다.
 * 라이브 run7 관측(0030-decoded innerLen=10): 요청 body는 8바이트, base는 오프셋 0의 u32BE.
 * raw/message32/body-only 외의 길이는 selector alias를 막기 위해 fail-closed 한다.
 */
export function decodeRequestInformationWarehouse(input) {
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) return null;
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  let bodyOffset;
  const hasMessage32Envelope = buf.length >= 6
    && buf.readUInt32LE(0) === 0
    && buf.readUInt16BE(4) === REQ_INFO_WAREHOUSE_CODE;
  const hasRawEnvelope = buf.length >= 2 && buf.readUInt16BE(0) === REQ_INFO_WAREHOUSE_CODE;
  if (hasMessage32Envelope) {
    if (buf.length !== 6 + REQ_INFO_WAREHOUSE_BODY_BYTES) return null;
    bodyOffset = 6;
  } else if (hasRawEnvelope) {
    if (buf.length !== 2 + REQ_INFO_WAREHOUSE_BODY_BYTES) return null;
    bodyOffset = 2;
  } else if (buf.length === REQ_INFO_WAREHOUSE_BODY_BYTES) {
    bodyOffset = 0;
  } else {
    return null;
  }
  const body = buf.subarray(bodyOffset, bodyOffset + REQ_INFO_WAREHOUSE_BODY_BYTES);
  return {
    // base: 오프셋 0의 u32BE. run7 라이브 관측에서 u32BE 읽기만이 catalog 조인에 성공(base=70).
    // outfit: 같은 wire record에서 base가 BE이므로 outfit도 BE가 맞다 (실측 바이트 0x00는 엔디안 구분 불가, 일관성 근거).
    base: body.readUInt32BE(0),
    outfit: body.readUInt32BE(4),
    bodyHex: body.toString('hex'),
  };
}

/**
 * 0x0327 고정 프레임 안에 client parser가 소비하는 compact BE stream을 기록한다.
 * 확인되지 않은 값은 호출자가 생략할 수 있으며 Buffer.alloc의 0으로 유지된다.
 */
export function buildResponseInformationWarehouseInner(record = {}) {
  const body = Buffer.alloc(RESP_INFO_WAREHOUSE_BODY_BYTES);
  const source = record && typeof record === 'object' ? record : {};
  const ships = Array.isArray(source.ships)
    ? source.ships.slice(0, WAREHOUSE_SHIPS_MAX)
    : [];
  const troops = Array.isArray(source.troops)
    ? source.troops.slice(0, WAREHOUSE_TROOPS_MAX)
    : [];

  let cursor = 0;
  cursor = writeU32(body, cursor, source.base);
  cursor = writeU32(body, cursor, source.outfit);
  cursor = writeU32(body, cursor, source.index);
  cursor = writeU8(body, cursor, ships.length);
  for (const ship of ships) {
    cursor = writeU16(body, cursor, ship?.kind);
    cursor = writeU8(body, cursor, ship?.unitNumber);
    cursor = writeU16(body, cursor, ship?.boatNumber);
  }
  cursor = writeU8(body, cursor, troops.length);
  for (const troop of troops) {
    cursor = writeU16(body, cursor, troop?.kind);
    cursor = writeU8(body, cursor, troop?.troopGrade);
    cursor = writeU16(body, cursor, troop?.unitNumber);
  }
  cursor = writeU32(body, cursor, source.supplies);
  cursor = writeU32(body, cursor, source.food);
  writeU32(body, cursor, source.mineral);

  const inner = Buffer.alloc(6 + body.length);
  inner.writeUInt32LE(0, 0);
  inner.writeUInt16BE(RESP_INFO_WAREHOUSE_CODE, 4);
  body.copy(inner, 6);
  return inner;
}
