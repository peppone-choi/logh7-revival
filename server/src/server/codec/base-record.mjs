// 0x031f ResponseInformationBase — 고정 바디 0x604 (count dword + 4×0x180).
//
// 근거: docs/reference/legacy-evidence/logh7-info-records-wire.md §2
//   dispatcher case 799가 0x181 dword를 clientBase+0x3facf4 로 **raw 복사** (엔디안 스왑 없음).
//   world-import FUN_004c32a0: count = *(u8*)(body+0), element[i] = body+4 + i*0x180.
//   FUN_0057aa90 매칭: *(int*)(elem+0) == selectedBaseId  (네이티브 LE int 비교)
//
// → multi-byte 필드는 **LE** 로 써야 매칭·스칼라가 산다.
//   (과거 BE id 는 LE 해석 시 0x07000000 이 되어 id=7 매칭 실패 → 패널 전부 NO DATA)
//
// 과거 compact 스트림(cursor 연속 쓰기)은 element 시작을 body+1 로 밀어
// 소속 바이트가 클라 elem+0x04 에 안 닿아 "성계 소속 없음"처럼 보였다.

export const RESP_INFO_BASE_CODE = 0x031f;
export const RESP_INFO_BASE_ELEM_BYTES = 0x180;
export const RESP_INFO_BASE_MAX = 4;
export const RESP_INFO_BASE_COUNT_BYTES = 4;
export const RESP_INFO_BASE_BYTES = RESP_INFO_BASE_COUNT_BYTES
  + RESP_INFO_BASE_MAX * RESP_INFO_BASE_ELEM_BYTES; // 0x604
export const RIB_TRANSPORT_MAX = 30;
export const RIB_OUTFIT_MAX = 30;
export const RIB_BUDGETING_MAX = 6;
export const RIB_BUDGET_MAX = 5;
export const RIB_COMMODITY_MAX = 3;

/** dest/element 내 오프셋 (wire = body+4+i*0x180 + off) */
export const RIB_OFF = Object.freeze({
  ID: 0x00,
  OWNER: 0x04, // field04 — 소속 후보 0x02 동맹 / 0x03 제국
  STATE: 0x05, // field05
  FIELD08: 0x08,
  FIELD0C: 0x0c,
  FIELD10: 0x10, // f32
  FIELD14: 0x14,
  FIELD18: 0x18,
  TRANSPORT_CNT: 0x20,
  TRANSPORT: 0x24, // u32[≤30]
  OUTFIT_CNT: 0x9c,
  OUTFIT: 0xa0,
  FIELD118: 0x118,
  FIELD11C: 0x11c,
  FIELD120: 0x120,
  FIELD124: 0x124,
  FIELD128: 0x128,
  FIELD12C: 0x12c,
  BUDGETING_CNT: 0x12e,
  BUDGETING: 0x130, // u16[≤6]
  BUDGET_CNT: 0x13c,
  BUDGET: 0x140, // u32[≤5]
  FIELD154: 0x154,
  FIELD156: 0x156,
  FIELD158: 0x158,
  FIELD15A: 0x15a,
  FIELD15C: 0x15c,
  FIELD160: 0x160,
  COMMODITY_CNT: 0x164,
  COMMODITY: 0x168, // u32[≤3]
  FIELD174: 0x174, // f32 (wire doc price_index candidate; overlaps +0x175)
  // FUN_0057aa90 switch(*(u8*)(elem+0x175)) → group 0x5f template idx 0..3
  CLASS: 0x175,
  FIELD178: 0x178,
  FIELD179: 0x179,
  FIELD17A: 0x17a,
  FIELD17B: 0x17c, // note: wire doc +0x17c u8
  FIELD17C: 0x180, // trailer — past end of 0x180, do not write
});

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

function writeElem(body, base, record = {}) {
  // id: case 799 raw 복사 → LE native int 로 매칭 (FUN_0057aa90 *piVar15 == baseId)
  body.writeUInt32LE(u32(record.id), base + RIB_OFF.ID);
  body.writeUInt8(u8(record.field04), base + RIB_OFF.OWNER);
  body.writeUInt8(u8(record.field05 ?? record.field09 ?? 0), base + RIB_OFF.STATE);
  body.writeUInt32LE(u32(record.field08), base + RIB_OFF.FIELD08);
  body.writeUInt32LE(u32(record.field0C ?? record.field0c), base + RIB_OFF.FIELD0C);
  body.writeFloatLE(f32(record.field10), base + RIB_OFF.FIELD10);
  body.writeUInt32LE(u32(record.field14), base + RIB_OFF.FIELD14);
  body.writeUInt32LE(u32(record.field18), base + RIB_OFF.FIELD18);

  const transport = Array.isArray(record.transportSupplies)
    ? record.transportSupplies.slice(0, RIB_TRANSPORT_MAX) : [];
  body.writeUInt8(transport.length & 0xff, base + RIB_OFF.TRANSPORT_CNT);
  for (let i = 0; i < transport.length; i += 1) {
    body.writeUInt32LE(u32(transport[i]), base + RIB_OFF.TRANSPORT + i * 4);
  }

  const outfit = Array.isArray(record.outfitSupplies)
    ? record.outfitSupplies.slice(0, RIB_OUTFIT_MAX) : [];
  body.writeUInt8(outfit.length & 0xff, base + RIB_OFF.OUTFIT_CNT);
  for (let i = 0; i < outfit.length; i += 1) {
    body.writeUInt32LE(u32(outfit[i]), base + RIB_OFF.OUTFIT + i * 4);
  }

  body.writeUInt32LE(u32(record.field118), base + RIB_OFF.FIELD118);
  body.writeUInt32LE(u32(record.field11C ?? record.field11c), base + RIB_OFF.FIELD11C);
  body.writeUInt32LE(u32(record.field120), base + RIB_OFF.FIELD120);
  body.writeUInt32LE(u32(record.field124), base + RIB_OFF.FIELD124);
  body.writeUInt32LE(u32(record.field128), base + RIB_OFF.FIELD128);
  body.writeUInt16LE(u16(record.field12C ?? record.field12c), base + RIB_OFF.FIELD12C);

  const budgeting = Array.isArray(record.budgeting)
    ? record.budgeting.slice(0, RIB_BUDGETING_MAX) : [];
  body.writeUInt8(budgeting.length & 0xff, base + RIB_OFF.BUDGETING_CNT);
  for (let i = 0; i < budgeting.length; i += 1) {
    body.writeUInt16LE(u16(budgeting[i]), base + RIB_OFF.BUDGETING + i * 2);
  }

  const budget = Array.isArray(record.budget)
    ? record.budget.slice(0, RIB_BUDGET_MAX) : [];
  body.writeUInt8(budget.length & 0xff, base + RIB_OFF.BUDGET_CNT);
  for (let i = 0; i < budget.length; i += 1) {
    body.writeUInt32LE(u32(budget[i]), base + RIB_OFF.BUDGET + i * 4);
  }

  body.writeUInt16LE(u16(record.field154), base + RIB_OFF.FIELD154);
  body.writeUInt16LE(u16(record.field156), base + RIB_OFF.FIELD156);
  body.writeUInt16LE(u16(record.field158), base + RIB_OFF.FIELD158);
  body.writeUInt16LE(u16(record.field15A ?? record.field15a), base + RIB_OFF.FIELD15A);
  body.writeUInt32LE(u32(record.field15C ?? record.field15c), base + RIB_OFF.FIELD15C);
  body.writeUInt32LE(u32(record.field160), base + RIB_OFF.FIELD160);

  const commodity = Array.isArray(record.commodity)
    ? record.commodity.slice(0, RIB_COMMODITY_MAX) : [];
  body.writeUInt8(commodity.length & 0xff, base + RIB_OFF.COMMODITY_CNT);
  for (let i = 0; i < commodity.length; i += 1) {
    body.writeUInt32LE(u32(commodity[i]), base + RIB_OFF.COMMODITY + i * 4);
  }

  // f32 LE: 1.0 → 00 00 80 3f 이라 +0x175=0. BE 1.0(3f800000)은 +0x175=0x80 으로 switch 붕괴.
  body.writeFloatLE(f32(record.field174 ?? 0), base + RIB_OFF.FIELD174);
  // class_@+0x175: explicit 만. 없으면 0 (float LE 와 정합).
  {
    const klass = record.class_ ?? record.field175 ?? record.territoryClass;
    const v = (klass != null && klass !== '' && Number.isFinite(Number(klass)))
      ? u8(klass) % 4
      : 0;
    body.writeUInt8(v, base + RIB_OFF.CLASS);
  }
  body.writeUInt8(u8(record.field178), base + RIB_OFF.FIELD178);
  body.writeUInt8(u8(record.field179), base + RIB_OFF.FIELD179);
  body.writeUInt16LE(u16(record.field17A ?? record.field17a), base + RIB_OFF.FIELD17A);
  body.writeUInt8(u8(record.field17B ?? record.field17b), base + RIB_OFF.FIELD17B);
}

/**
 * 고정 0x604 바디. count는 body+0 의 u8(dword 하위 바이트), 슬롯은 body+4 부터 0x180 stride.
 */
export function buildResponseInformationBaseInner({ bases = [] } = {}) {
  const body = Buffer.alloc(RESP_INFO_BASE_BYTES);
  const list = Array.isArray(bases) ? bases.slice(0, RESP_INFO_BASE_MAX) : [];
  body.writeUInt8(list.length & 0xff, 0);
  for (let i = 0; i < list.length; i += 1) {
    writeElem(body, RESP_INFO_BASE_COUNT_BYTES + i * RESP_INFO_BASE_ELEM_BYTES, list[i]);
  }
  const inner = Buffer.alloc(6 + body.length);
  inner.writeUInt32LE(0, 0);
  inner.writeUInt16BE(RESP_INFO_BASE_CODE, 4);
  body.copy(inner, 6);
  return inner;
}
