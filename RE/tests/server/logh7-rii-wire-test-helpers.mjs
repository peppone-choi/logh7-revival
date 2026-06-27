import assert from 'node:assert/strict';

import {
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

function requireBytes(payload, cursor, size, label) {
  assert.ok(cursor + size <= payload.length, `${label} is present in 0x0321 parser stream`);
}

function readU8(payload, cursor, label) {
  requireBytes(payload, cursor, 1, label);
  return [payload.readUInt8(cursor), cursor + 1];
}

function readU16(payload, cursor, label) {
  requireBytes(payload, cursor, 2, label);
  return [payload.readUInt16BE(cursor), cursor + 2];
}

function readU32(payload, cursor, label) {
  requireBytes(payload, cursor, 4, label);
  return [payload.readUInt32BE(cursor), cursor + 4];
}

function copyU8(payload, cursor, expanded, offset, label) {
  const [value, next] = readU8(payload, cursor, label);
  expanded.writeUInt8(value, offset);
  return next;
}

function copyU16(payload, cursor, expanded, offset, label) {
  const [value, next] = readU16(payload, cursor, label);
  expanded.writeUInt16LE(value, offset);
  return next;
}

function copyU32(payload, cursor, expanded, offset, label) {
  const [value, next] = readU32(payload, cursor, label);
  expanded.writeUInt32LE(value, offset);
  return next;
}

function expandSpot(payload, cursor, expanded, base, label) {
  cursor = copyU16(payload, cursor, expanded, base + RII_SPOT_OFF_FIELD_00, `${label}.field00`);
  cursor = copyU32(payload, cursor, expanded, base + RII_SPOT_OFF_FIELD_04, `${label}.field04`);
  return copyU16(payload, cursor, expanded, base + RII_SPOT_OFF_FIELD_08, `${label}.field08`);
}

function expandInstitution(payload, cursor, expanded, base, label) {
  cursor = copyU16(payload, cursor, expanded, base + RII_INST_OFF_FIELD_00, `${label}.field00`);
  cursor = copyU32(payload, cursor, expanded, base + RII_INST_OFF_FIELD_04, `${label}.field04`);
  const [spotCount, afterSpotCount] = readU8(payload, cursor, `${label}.spot_count`);
  assert.ok(spotCount <= RESP_INFO_INSTITUTION_SPOT_MAX, `${label}.spot_count <= ${RESP_INFO_INSTITUTION_SPOT_MAX}`);
  expanded.writeUInt8(spotCount, base + RII_INST_OFF_SPOT_CNT);
  cursor = afterSpotCount;
  for (let k = 0; k < spotCount; k += 1) {
    cursor = expandSpot(
      payload,
      cursor,
      expanded,
      base + RII_INST_OFF_SPOT0 + k * RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES,
      `${label}.spot[${k}]`,
    );
  }
  return cursor;
}

function expandElement(payload, cursor, expanded, base, index) {
  cursor = copyU32(payload, cursor, expanded, base + RII_ELEM_OFF_ID, `institutionBase[${index}].id`);
  const [institutionCount, afterInstitutionCount] = readU8(payload, cursor, `institutionBase[${index}].institution_count`);
  assert.ok(
    institutionCount <= RESP_INFO_INSTITUTION_INST_MAX,
    `institutionBase[${index}].institution_count <= ${RESP_INFO_INSTITUTION_INST_MAX}`,
  );
  expanded.writeUInt8(institutionCount, base + RII_ELEM_OFF_INST_CNT);
  cursor = afterInstitutionCount;
  for (let j = 0; j < institutionCount; j += 1) {
    cursor = expandInstitution(
      payload,
      cursor,
      expanded,
      base + RII_ELEM_OFF_INST0 + j * RESP_INFO_INSTITUTION_INST_ELEM_BYTES,
      `institutionBase[${index}].institution[${j}]`,
    );
  }
  return cursor;
}

export function expandResponseInformationInstitutionWire(payload) {
  assert.equal(payload.length, RESP_INFO_INSTITUTION_BYTES, '0x0321 wire body is fixed-size padded');
  const expanded = Buffer.alloc(RESP_INFO_INSTITUTION_BYTES);
  const [count, afterCount] = readU8(payload, 0, 'institution base count');
  assert.ok(count <= RESP_INFO_INSTITUTION_MAX, `institution base count <= ${RESP_INFO_INSTITUTION_MAX}`);
  expanded.writeUInt8(count, RII_OFF_COUNT);
  let cursor = afterCount;
  for (let i = 0; i < count; i += 1) {
    cursor = expandElement(payload, cursor, expanded, RII_OFF_ELEM0 + i * RESP_INFO_INSTITUTION_ELEM_BYTES, i);
  }
  return expanded;
}
