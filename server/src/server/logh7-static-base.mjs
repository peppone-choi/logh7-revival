// 0x031d ResponseStaticInformationBase 빌더.
//
// 근거:
//   docs/reference/legacy-evidence/logh7-info-records-wire.md §2
//   docs/reference/legacy-evidence/logh7-strategic-output-fields.md B19
//   docs/logh7-strategic-map-placement-re.md §5
//
// 0x031d의 body는 이미 확장된 0x3c 목적지 레코드 배열이 아니다. 앞의 u16 count 뒤에
// 각 레코드가 순차 필드로 이어지는 parser-helper stream이며 클라이언트가 이를 +0x3c
// stride 목적지로 확장한다. 따라서 이름 길이에 따라 다음 레코드의 wire offset이 달라진다.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMsg32Inner } from './logh7-world-records.mjs';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');

export const STATIC_BASE_CODE = 0x031d;
export const STATIC_BASE_BODY_BYTES = 0x520c;
export const STATIC_BASE_STREAM_COUNT_BYTES = 2;
export const STATIC_BASE_MAX = 350;
export const STATIC_BASE_NAME_MAX_UNITS = 13;
export const STATIC_BASE_DEST_STRIDE = 0x3c;

export const STATIC_BASE_DEST_OFFSETS = Object.freeze({
  ID: 0x00,
  GRID: 0x04,
  FIELD06: 0x06,
  FIELD08: 0x08,
  NAME_LENGTH: 0x0a,
  NAME: 0x0c,
  CLASS: 0x26,
  DIAMETER: 0x28,
  REVOLUTION_RADIUS: 0x2c,
  REVOLUTION_DIRECTION: 0x30,
  REVOLUTION_CYCLE: 0x34,
  REVOLUTION_INIT_ANGLE: 0x38,
});

let galaxyCache;
let catalogCache;

function loadGalaxy() {
  if (!galaxyCache) {
    galaxyCache = JSON.parse(readFileSync(join(CONTENT_DIR, 'galaxy.json'), 'utf8'));
  }
  return galaxyCache;
}

function u32(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n >>> 0 : 0;
}

function u16(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n & 0xffff : 0;
}

function u8(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n & 0xff : 0;
}

function finiteFloat(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function systemCell(system) {
  if (Number.isInteger(system?.cell) && system.cell >= 0 && system.cell < 5000) {
    return system.cell;
  }
  if (Number.isInteger(system?.canonCol) && Number.isInteger(system?.canonRow)
    && system.canonCol >= 0 && system.canonCol < 100
    && system.canonRow >= 0 && system.canonRow < 50) {
    return system.canonRow * 100 + system.canonCol;
  }
  return 0;
}

/**
 * galaxy.json에서 0x031d에 사용할 시스템 정적 레코드를 만든다.
 *
 * 원본 서버의 별도 숫자 ID는 복구되지 않았으므로 DB seed의 삽입 순서와 동일한
 * 1-based catalog id를 사용한다. 이는 서버 내부의 안정적인 키이며 원본 ID라고
 * 주장하지 않는다. 이름·셀만 galaxy.json에서 직접 가져오고 class/천문 값은 근거가
 * 없어 0으로 둔다.
 */
export function getStaticBaseCatalog() {
  if (catalogCache) return catalogCache;
  const systems = Array.isArray(loadGalaxy()?.systems) ? loadGalaxy().systems : [];
  catalogCache = Object.freeze(systems.map((system, index) => Object.freeze({
    id: Number.isInteger(system?.id) && system.id > 0 ? system.id : index + 1,
    grid: systemCell(system),
    name: String(system?.system ?? ''),
    class_: 0,
    diameter: 0,
    revolutionRadius: 0,
    revolutionDirection: 0,
    revolutionCycle: 0,
    revolutionInitAngle: 0,
    sourceIndex: index,
  })));
  return catalogCache;
}

function catalogMatch(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  const catalog = getStaticBaseCatalog();
  return catalog.find((record) => record.id === n || record.grid === n) ?? null;
}

/**
 * 0x031c 요청에서 첫 번째 id/cell 후보를 읽는다.
 * 라이브 요청은 길이 접두가 있는 [u16 count][u32 id…] 형태였고, 일부 진단 도구는
 * body에 u32만 넣었다. 두 형태를 모두 읽되 catalog에 실제로 매칭되는 endian을 우선한다.
 */
export function readStaticBaseRequest(innerOrBody) {
  const buf = Buffer.isBuffer(innerOrBody) ? innerOrBody : Buffer.from(innerOrBody ?? []);
  let body = buf;
  if (buf.length >= 6 && buf.readUInt32LE(0) === 0) {
    body = buf.subarray(6);
  } else if (buf.length >= 2 && buf.readUInt16BE(0) === 0x031c) {
    body = buf.subarray(2);
  }
  const candidates = [];
  if (body.length >= 6) {
    candidates.push(body.readUInt32LE(2), body.readUInt32BE(2));
  }
  if (body.length >= 4) {
    candidates.push(body.readUInt32LE(0), body.readUInt32BE(0));
  }
  for (const candidate of candidates) {
    const match = catalogMatch(candidate);
    if (match) return { requestValue: candidate, systemId: match.id, cell: match.grid };
  }
  return { requestValue: null, systemId: null, cell: null };
}

function orderCatalog({ systemId = null, cell = null } = {}) {
  const catalog = getStaticBaseCatalog();
  const target = catalog.find((record) => (
    (Number.isInteger(systemId) && record.id === systemId)
    || (Number.isInteger(cell) && record.grid === cell)
  ));
  if (!target) return catalog;
  return [target, ...catalog.filter((record) => record !== target)];
}

function writeStaticBaseRecord(body, cursor, record) {
  const name = Array.from(String(record?.name ?? '')).slice(0, STATIC_BASE_NAME_MAX_UNITS);
  const required = 55;
  if (cursor + required > body.length) return null;
  body.writeUInt32BE(u32(record?.id), cursor);
  cursor += 4;
  body.writeUInt16BE(u16(record?.grid), cursor);
  cursor += 2;
  body.writeUInt16BE(u16(record?.field06), cursor);
  cursor += 2;
  body.writeUInt16BE(u16(record?.field08), cursor);
  cursor += 2;
  body.writeUInt8(name.length, cursor);
  cursor += 1;
  for (const char of name) {
    body.writeUInt16BE(char.charCodeAt(0) & 0xffff, cursor);
    cursor += 2;
  }
  body.writeUInt8(u8(record?.class_ ?? record?.klass), cursor);
  cursor += 1;
  body.writeFloatBE(finiteFloat(record?.diameter), cursor);
  cursor += 4;
  body.writeUInt32BE(u32(record?.revolutionRadius), cursor);
  cursor += 4;
  body.writeUInt8(u8(record?.revolutionDirection), cursor);
  cursor += 1;
  body.writeFloatBE(finiteFloat(record?.revolutionCycle), cursor);
  cursor += 4;
  body.writeFloatBE(finiteFloat(record?.revolutionInitAngle), cursor);
  cursor += 4;
  return cursor;
}

/**
 * 0x031d ResponseStaticInformationBase. Unknown fields remain zero; body framing is always 0x520c.
 */
export function buildStaticInformationBaseInner({ bases = [] } = {}) {
  const body = Buffer.alloc(STATIC_BASE_BODY_BYTES);
  const list = Array.isArray(bases) ? bases.slice(0, STATIC_BASE_MAX) : [];
  body.writeUInt16BE(list.length, 0);
  let cursor = STATIC_BASE_STREAM_COUNT_BYTES;
  let written = 0;
  for (const record of list) {
    const next = writeStaticBaseRecord(body, cursor, record);
    if (next == null) break;
    cursor = next;
    written += 1;
  }
  if (written !== list.length) body.writeUInt16BE(written, 0);
  return buildMsg32Inner(STATIC_BASE_CODE, body);
}

/**
 * 0x031c 요청에 대한 정적 시스템 응답. 선택값은 첫 레코드로 안정적으로 우선하고,
 * 나머지는 항상 동일한 source-order 전체 시스템 catalog를 전송한다.
 */
export function buildStaticInformationBaseFromGalaxy({ systemId = null, cell = null } = {}) {
  return buildStaticInformationBaseInner({ bases: orderCatalog({ systemId, cell }) });
}

export function _resetStaticBaseCache() {
  galaxyCache = undefined;
  catalogCache = undefined;
}
