// 0x031f ResponseInformationBase compact stream 코덱.
// 바디 크기·배열 cap·필드 순서는 FUN_00414c70/FUN_004c32a0에서 확정된 P0 레이아웃이다.

export const RESP_INFO_BASE_CODE = 0x031f;
export const RESP_INFO_BASE_ELEM_BYTES = 0x180;
export const RESP_INFO_BASE_MAX = 4;
export const RESP_INFO_BASE_BYTES = 4 + RESP_INFO_BASE_MAX * RESP_INFO_BASE_ELEM_BYTES;
export const RIB_TRANSPORT_MAX = 30;
export const RIB_OUTFIT_MAX = 30;
export const RIB_BUDGETING_MAX = 6;
export const RIB_BUDGET_MAX = 5;
export const RIB_COMMODITY_MAX = 3;

function u8(value) {
  return Math.max(0, Math.min(0xff, Math.trunc(Number(value) || 0))) & 0xff;
}

function u16(value) {
  return Math.max(0, Math.min(0xffff, Math.trunc(Number(value) || 0))) & 0xffff;
}

function u32(value) {
  return Math.max(0, Math.trunc(Number(value) || 0)) >>> 0;
}

function f32(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function writeU8(body, cursor, value) {
  body.writeUInt8(u8(value), cursor);
  return cursor + 1;
}

function writeU16(body, cursor, value) {
  body.writeUInt16BE(u16(value), cursor);
  return cursor + 2;
}

function writeU32(body, cursor, value) {
  body.writeUInt32BE(u32(value), cursor);
  return cursor + 4;
}

function writeF32(body, cursor, value) {
  body.writeFloatBE(f32(value), cursor);
  return cursor + 4;
}

function writeU32Array(body, cursor, values, cap) {
  const list = Array.isArray(values) ? values.slice(0, cap) : [];
  cursor = writeU8(body, cursor, list.length);
  for (const value of list) cursor = writeU32(body, cursor, value);
  return cursor;
}

function writeU16Array(body, cursor, values, cap) {
  const list = Array.isArray(values) ? values.slice(0, cap) : [];
  cursor = writeU8(body, cursor, list.length);
  for (const value of list) cursor = writeU16(body, cursor, value);
  return cursor;
}

function writeBase(body, cursor, record = {}) {
  cursor = writeU32(body, cursor, record.id);
  cursor = writeU8(body, cursor, record.field04);
  cursor = writeU8(body, cursor, record.field05 ?? record.field09);
  cursor = writeU32(body, cursor, record.field08);
  cursor = writeU32(body, cursor, record.field0C ?? record.field0c);
  cursor = writeF32(body, cursor, record.field10);
  cursor = writeU32(body, cursor, record.field14);
  cursor = writeU32(body, cursor, record.field18);
  cursor = writeU32Array(body, cursor, record.transportSupplies, RIB_TRANSPORT_MAX);
  cursor = writeU32Array(body, cursor, record.outfitSupplies, RIB_OUTFIT_MAX);
  cursor = writeU32(body, cursor, record.field118);
  cursor = writeU32(body, cursor, record.field11C ?? record.field11c);
  cursor = writeU32(body, cursor, record.field120);
  cursor = writeU32(body, cursor, record.field124);
  cursor = writeU32(body, cursor, record.field128);
  cursor = writeU16(body, cursor, record.field12C ?? record.field12c);
  cursor = writeU16Array(body, cursor, record.budgeting, RIB_BUDGETING_MAX);
  cursor = writeU32Array(body, cursor, record.budget, RIB_BUDGET_MAX);
  cursor = writeU16(body, cursor, record.field154);
  cursor = writeU16(body, cursor, record.field156);
  cursor = writeU16(body, cursor, record.field158);
  cursor = writeU16(body, cursor, record.field15A ?? record.field15a);
  cursor = writeU32(body, cursor, record.field15C ?? record.field15c);
  cursor = writeU32(body, cursor, record.field160);
  cursor = writeU32Array(body, cursor, record.commodity, RIB_COMMODITY_MAX);
  cursor = writeF32(body, cursor, record.field174);
  cursor = writeU8(body, cursor, record.field178);
  cursor = writeU8(body, cursor, record.field179);
  cursor = writeU16(body, cursor, record.field17A ?? record.field17a);
  cursor = writeU8(body, cursor, record.field17B ?? record.field17b);
  return writeU32(body, cursor, record.field17C ?? record.field17c);
}

/** 미확정 값은 쓰지 않고 호출자가 명시한 필드만 compact stream에 기록한다. */
export function buildResponseInformationBaseInner({ bases = [] } = {}) {
  const body = Buffer.alloc(RESP_INFO_BASE_BYTES);
  const list = Array.isArray(bases) ? bases.slice(0, RESP_INFO_BASE_MAX) : [];
  let cursor = writeU8(body, 0, list.length);
  for (const record of list) cursor = writeBase(body, cursor, record);
  const inner = Buffer.alloc(6 + body.length);
  inner.writeUInt32LE(0, 0);
  inner.writeUInt16BE(RESP_INFO_BASE_CODE, 4);
  body.copy(inner, 6);
  return inner;
}
