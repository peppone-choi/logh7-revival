// 0x0321 ResponseInformationInstitution compact stream 코덱.
// 외부/시설/spot의 크기·stride·cap은 FUN_004167f0/FUN_00416bd0에서 확정된 P0 레이아웃이다.

export const RESP_INFO_INSTITUTION_CODE = 0x0321;
export const RESP_INFO_INSTITUTION_ELEM_BYTES = 0x2378;
export const RESP_INFO_INSTITUTION_MAX = 4;
export const RESP_INFO_INSTITUTION_BYTES = 4
  + RESP_INFO_INSTITUTION_MAX * RESP_INFO_INSTITUTION_ELEM_BYTES;
export const RESP_INFO_INSTITUTION_INST_ELEM_BYTES = 0xfc;
export const RESP_INFO_INSTITUTION_INST_MAX = 36;
export const RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES = 0xc;
export const RESP_INFO_INSTITUTION_SPOT_MAX = 20;

function u8(value) {
  return Math.max(0, Math.min(0xff, Math.trunc(Number(value) || 0))) & 0xff;
}

function u16(value) {
  return Math.max(0, Math.min(0xffff, Math.trunc(Number(value) || 0))) & 0xffff;
}

function u32(value) {
  return Math.max(0, Math.trunc(Number(value) || 0)) >>> 0;
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

function writeSpot(body, cursor, spot = {}) {
  cursor = writeU16(body, cursor, spot.field00);
  cursor = writeU32(body, cursor, spot.field04);
  return writeU16(body, cursor, spot.field08);
}

function writeInstitution(body, cursor, institution = {}) {
  cursor = writeU16(body, cursor, institution.field00);
  cursor = writeU32(body, cursor, institution.field04);
  const spots = Array.isArray(institution.spots)
    ? institution.spots.slice(0, RESP_INFO_INSTITUTION_SPOT_MAX)
    : [];
  cursor = writeU8(body, cursor, spots.length);
  for (const spot of spots) cursor = writeSpot(body, cursor, spot);
  return cursor;
}

function writeBase(body, cursor, record = {}) {
  cursor = writeU32(body, cursor, record.id);
  const institutions = Array.isArray(record.institutions)
    ? record.institutions.slice(0, RESP_INFO_INSTITUTION_INST_MAX)
    : [];
  cursor = writeU8(body, cursor, institutions.length);
  for (const institution of institutions) cursor = writeInstitution(body, cursor, institution);
  return cursor;
}

/** 미확정 시설 값은 합성하지 않고 base id와 명시된 하위 레코드만 기록한다. */
export function buildResponseInformationInstitutionInner({ institutions = [] } = {}) {
  const body = Buffer.alloc(RESP_INFO_INSTITUTION_BYTES);
  const list = Array.isArray(institutions)
    ? institutions.slice(0, RESP_INFO_INSTITUTION_MAX)
    : [];
  let cursor = writeU8(body, 0, list.length);
  for (const record of list) cursor = writeBase(body, cursor, record);
  const inner = Buffer.alloc(6 + body.length);
  inner.writeUInt32LE(0, 0);
  inner.writeUInt16BE(RESP_INFO_INSTITUTION_CODE, 4);
  body.copy(inner, 6);
  return inner;
}
