import assert from 'node:assert/strict';

import {
  RESP_INFO_BASE_BYTES,
  RESP_INFO_BASE_ELEM_BYTES,
  RESP_INFO_BASE_MAX,
  RIB_OFF_COUNT,
  RIB_OFF_ELEM0,
  RIB_ELEM_OFF_ID,
  RIB_ELEM_OFF_FIELD_04,
  RIB_ELEM_OFF_FIELD_08,
  RIB_ELEM_OFF_FIELD_09,
  RIB_ELEM_OFF_FIELD_0C,
  RIB_ELEM_OFF_FIELD_10,
  RIB_ELEM_OFF_FIELD_14,
  RIB_ELEM_OFF_FIELD_18,
  RIB_ELEM_OFF_TRANSPORT_CNT,
  RIB_ELEM_OFF_TRANSPORT,
  RIB_ELEM_OFF_OUTFIT_CNT,
  RIB_ELEM_OFF_OUTFIT,
  RIB_ELEM_OFF_FIELD_118,
  RIB_ELEM_OFF_FIELD_11C,
  RIB_ELEM_OFF_FIELD_120,
  RIB_ELEM_OFF_FIELD_124,
  RIB_ELEM_OFF_FIELD_128,
  RIB_ELEM_OFF_FIELD_12C,
  RIB_ELEM_OFF_BUDGETING_CNT,
  RIB_ELEM_OFF_BUDGETING,
  RIB_ELEM_OFF_BUDGET_CNT,
  RIB_ELEM_OFF_BUDGET,
  RIB_ELEM_OFF_FIELD_154,
  RIB_ELEM_OFF_FIELD_156,
  RIB_ELEM_OFF_FIELD_158,
  RIB_ELEM_OFF_FIELD_15A,
  RIB_ELEM_OFF_FIELD_15C,
  RIB_ELEM_OFF_FIELD_160,
  RIB_ELEM_OFF_COMMODITY_CNT,
  RIB_ELEM_OFF_COMMODITY,
  RIB_ELEM_OFF_FIELD_174,
  RIB_ELEM_OFF_FIELD_178,
  RIB_ELEM_OFF_FIELD_179,
  RIB_ELEM_OFF_FIELD_17A,
  RIB_ELEM_OFF_FIELD_17B,
  RIB_ELEM_OFF_FIELD_17C,
  RIB_TRANSPORT_MAX,
  RIB_OUTFIT_MAX,
  RIB_BUDGETING_MAX,
  RIB_BUDGET_MAX,
  RIB_COMMODITY_MAX,
} from '../../src/server/logh7-base-record.mjs';

function requireBytes(payload, cursor, size, label) {
  assert.ok(cursor + size <= payload.length, `${label} is present in 0x031f parser stream`);
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

function readF32(payload, cursor, label) {
  requireBytes(payload, cursor, 4, label);
  return [payload.readFloatBE(cursor), cursor + 4];
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

function copyF32(payload, cursor, expanded, offset, label) {
  const [value, next] = readF32(payload, cursor, label);
  expanded.writeFloatLE(value, offset);
  return next;
}

function copyU32Array(payload, cursor, expanded, countOffset, valueOffset, cap, label) {
  const [count, afterCount] = readU8(payload, cursor, `${label} count`);
  assert.ok(count <= cap, `${label} count <= ${cap}`);
  expanded.writeUInt8(count, countOffset);
  cursor = afterCount;
  for (let i = 0; i < count; i += 1) {
    cursor = copyU32(payload, cursor, expanded, valueOffset + i * 4, `${label}[${i}]`);
  }
  return cursor;
}

function copyU16Array(payload, cursor, expanded, countOffset, valueOffset, cap, label) {
  const [count, afterCount] = readU8(payload, cursor, `${label} count`);
  assert.ok(count <= cap, `${label} count <= ${cap}`);
  expanded.writeUInt8(count, countOffset);
  cursor = afterCount;
  for (let i = 0; i < count; i += 1) {
    cursor = copyU16(payload, cursor, expanded, valueOffset + i * 2, `${label}[${i}]`);
  }
  return cursor;
}

function expandElement(payload, cursor, expanded, base, index) {
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_ID, `base[${index}].id`);
  cursor = copyU8(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_04, `base[${index}].field04`);
  cursor = copyU8(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_09, `base[${index}].field05`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_08, `base[${index}].field08`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_0C, `base[${index}].field0c`);
  cursor = copyF32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_10, `base[${index}].field10`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_14, `base[${index}].field14`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_18, `base[${index}].field18`);
  cursor = copyU32Array(payload, cursor, expanded, base + RIB_ELEM_OFF_TRANSPORT_CNT, base + RIB_ELEM_OFF_TRANSPORT, RIB_TRANSPORT_MAX, `base[${index}].transport`);
  cursor = copyU32Array(payload, cursor, expanded, base + RIB_ELEM_OFF_OUTFIT_CNT, base + RIB_ELEM_OFF_OUTFIT, RIB_OUTFIT_MAX, `base[${index}].outfit`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_118, `base[${index}].field118`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_11C, `base[${index}].field11c`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_120, `base[${index}].field120`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_124, `base[${index}].field124`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_128, `base[${index}].field128`);
  cursor = copyU16(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_12C, `base[${index}].field12c`);
  cursor = copyU16Array(payload, cursor, expanded, base + RIB_ELEM_OFF_BUDGETING_CNT, base + RIB_ELEM_OFF_BUDGETING, RIB_BUDGETING_MAX, `base[${index}].budgeting`);
  cursor = copyU32Array(payload, cursor, expanded, base + RIB_ELEM_OFF_BUDGET_CNT, base + RIB_ELEM_OFF_BUDGET, RIB_BUDGET_MAX, `base[${index}].budget`);
  cursor = copyU16(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_154, `base[${index}].field154`);
  cursor = copyU16(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_156, `base[${index}].field156`);
  cursor = copyU16(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_158, `base[${index}].field158`);
  cursor = copyU16(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_15A, `base[${index}].field15a`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_15C, `base[${index}].field15c`);
  cursor = copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_160, `base[${index}].field160`);
  cursor = copyU32Array(payload, cursor, expanded, base + RIB_ELEM_OFF_COMMODITY_CNT, base + RIB_ELEM_OFF_COMMODITY, RIB_COMMODITY_MAX, `base[${index}].commodity`);
  cursor = copyF32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_174, `base[${index}].field174`);
  cursor = copyU8(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_178, `base[${index}].field178`);
  cursor = copyU8(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_179, `base[${index}].field179`);
  cursor = copyU16(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_17A, `base[${index}].field17a`);
  cursor = copyU8(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_17B, `base[${index}].field17b`);
  return copyU32(payload, cursor, expanded, base + RIB_ELEM_OFF_FIELD_17C, `base[${index}].field17c`);
}

export function expandResponseInformationBaseWire(payload) {
  assert.equal(payload.length, RESP_INFO_BASE_BYTES, '0x031f wire body is fixed-size padded');
  const expanded = Buffer.alloc(RESP_INFO_BASE_BYTES);
  const [count, afterCount] = readU8(payload, 0, 'base count');
  assert.ok(count <= RESP_INFO_BASE_MAX, `base count <= ${RESP_INFO_BASE_MAX}`);
  expanded.writeUInt8(count, RIB_OFF_COUNT);
  let cursor = afterCount;
  for (let i = 0; i < count; i += 1) {
    const base = RIB_OFF_ELEM0 + i * RESP_INFO_BASE_ELEM_BYTES;
    cursor = expandElement(payload, cursor, expanded, base, i);
  }
  return expanded;
}
