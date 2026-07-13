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

// ── QA 마커 (제품 경로 아님) ────────────────────────────────────────────────
// 목적: 성계 상세 renderer FUN_0057aa90(VA 0x57aa90)가 창고 캐시(base+0x3e098c, 0x300B)에서
// 읽는 필드의 엔디안·tag 의미를 라이브 화면 관측으로 확정하기 위한 positive control.
// 자연 데이터와 겹치지 않는 구별값을 실어 보내고, 화면 어느 자리에 뜨는지로 해석을 검증한다.
// 반드시 환경변수 LOGH_QA_WAREHOUSE_MARKER=1 게이트 뒤에서만 동작한다. 기본은 바이트 단위로 무변경.
export const QA_WAREHOUSE_MARKER_ENV = 'LOGH_QA_WAREHOUSE_MARKER';

// 마커 값은 이전 실험/라이브 기대치와 묶여 있다. 임의로 바꾸지 말 것.
// - 재고 합 66  : 캐시 +0xC(u8 엔트리 수) / +0x10 stride 6 / +0(u8 수량). 엔트리 1개에 66을 실어
//                 "엔트리별 수량"으로 읽히든 "합계"로 읽히든 화면에 66이 뜨게 한다.
// - 카테고리 tag: 캐시 +0x260(u8 카테고리 수) / +0x262 stride 6 / +0(u16 tag) / +4(u16 값).
//                 tag 0x10 → 100, tag 0x11 → 200.
// - 스칼라 1234 : 캐시 +0x2F4(u32).
export const QA_WAREHOUSE_MARKER_RECORD = Object.freeze({
  ships: Object.freeze([
    // wire ship 엔트리 = 캐시 +0x0e{kind u16} +0x10{unitNumber u8} +0x12{boatNumber u16}.
    // renderer가 읽는 "수량"은 +0x10 의 u8 → unitNumber 슬롯에 66.
    Object.freeze({ kind: 1, unitNumber: 66, boatNumber: 0 }),
  ]),
  troops: Object.freeze([
    // wire troop 엔트리 = 캐시 +0x262{kind u16=tag} +0x264{troopGrade u8} +0x266{unitNumber u16=값}.
    Object.freeze({ kind: 0x10, troopGrade: 0, unitNumber: 100 }),
    Object.freeze({ kind: 0x11, troopGrade: 0, unitNumber: 200 }),
  ]),
  supplies: 1234,
});

/** 게이트는 호출 시점에 읽는다(테스트에서 토글 가능). '1'일 때만 켜진다. */
export function isQaWarehouseMarkerEnabled(env = process.env) {
  return env?.[QA_WAREHOUSE_MARKER_ENV] === '1';
}

function clampInteger(value, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(number)));
}

// ── 엔디안 가정 (단일 지점) ────────────────────────────────────────────────
// 0x0327 응답 body는 fixed compact big-endian 스트림이다.
// 근거: B71 라이브에서 body 첫 4바이트 00000046 = base 70 으로 관측(u32BE).
// QA 마커 필드도 같은 규약을 따른다. 라이브에서 BE가 반증되면 아래 writeU16/writeU32
// 두 함수의 writeUInt*BE 만 LE로 뒤집으면 된다(다른 곳에 엔디안 분기 없음).
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
export function buildResponseInformationWarehouseInner(record = {}, options = {}) {
  const body = Buffer.alloc(RESP_INFO_WAREHOUSE_BODY_BYTES);
  const base = record && typeof record === 'object' ? record : {};
  // QA 마커 게이트가 켜졌을 때만 base/outfit/index 는 그대로 두고 재고·카테고리·스칼라를 마커값으로 덮는다.
  // 게이트가 꺼진 기본 경로에서는 record 를 손대지 않는다 → 기존 바이트와 완전 동일.
  const markerEnabled = isQaWarehouseMarkerEnabled(options.env ?? process.env);
  const source = markerEnabled ? { ...base, ...QA_WAREHOUSE_MARKER_RECORD } : base;
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
