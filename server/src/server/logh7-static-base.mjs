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

// P3 임시 천문 스케일(캐논 diameter 부재). 라이브 검은 구 완화용 placeholder — provenance 명시.
const P3_STAR_DIAMETER = 2.5;
const P3_ORBIT_RADIUS_STEP = 12;
const P3_ORBIT_CYCLE = 120;

export const STATIC_BASE_CODE = 0x031d;
export const STATIC_BASE_BODY_BYTES = 0x520c;
export const STATIC_BASE_STREAM_COUNT_BYTES = 2;
export const STATIC_BASE_MAX = 350;
export const STATIC_BASE_NAME_MAX_UNITS = 13;
export const STATIC_BASE_DEST_STRIDE = 0x3c;
const STATIC_BASE_SELECTOR_REQUEST_CODES = new Set([0x031c, 0x031e, 0x0320]);
const DETAIL_BASE_SELECTOR_REQUEST_CODES = new Set([0x031e, 0x0320]);
const DETAIL_BASE_SELECTOR_MAX = 4;

// spectralClass(O/B/A/F/G/K/M) → class_ u8. 0x031d의 항성구 렌더는 index 0을 검은/빈
// 항성 sentinel로 쓴다(populated 레코드라도 class_=0이면 검게 그려지는 라이브 증상이 근거).
// 따라서 실 스펙트럼은 1..7로 투영(순서 보존: O 가장 뜨거움 → M 가장 차가움)해 어떤 실
// 성계도 검게 남지 않게 한다. 이는 0x0313 맵 아이콘 테이블(0-based 0..6, logh7-galaxy-
// placement.mjs SPECTRAL_SLOT)과는 별개 테이블이라 오프셋이 1 밀린다.
// 정확한 색상↔인덱스 대응은 MEDIUM 신뢰도 — 라이브 QA로 확정 필요. 미상/무데이터는 0.
const SPECTRAL_CLASS_INDEX = Object.freeze({ O: 1, B: 2, A: 3, F: 4, G: 5, K: 6, M: 7 });

/** 스펙트럼 문자를 0x031d class_ 인덱스(1..7)로. 미상/무데이터는 0(검은 유지). */
export function spectralClassToIndex(spectralClass) {
  if (typeof spectralClass !== 'string') return 0;
  return Object.prototype.hasOwnProperty.call(SPECTRAL_CLASS_INDEX, spectralClass)
    ? SPECTRAL_CLASS_INDEX[spectralClass]
    : 0;
}

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
 * 1-based catalog id를 사용한다. 이름·셀·class_(spectralClass 투영)는 galaxy.json에서 가져온다.
 * diameter/revolution: 캐논 부재 → 2026-07-21 사용자 승인 **P3 임시 스케일**.
 * 소속(陣営) UI: 0x031f element+0x04 (고정 0x180 슬롯) — compact 스트림이면 소속 누락.
 */
export function getStaticBaseCatalog() {
  if (catalogCache) return catalogCache;
  const systems = Array.isArray(loadGalaxy()?.systems) ? loadGalaxy().systems : [];
  catalogCache = Object.freeze(systems.map((system, index) => {
    const planets = Array.isArray(system?.planets) ? system.planets : [];
    const n = planets.length;
    const firstOrbit = Number(planets[0]?.orbit) > 0 ? Number(planets[0].orbit) : 1;
    const faction = (system?.faction === 'empire' || system?.faction === 'alliance'
      || system?.faction === 'neutral')
      ? system.faction
      : null;
    return Object.freeze({
      id: Number.isInteger(system?.id) && system.id > 0 ? system.id : index + 1,
      grid: systemCell(system),
      name: String(system?.system ?? ''),
      class_: spectralClassToIndex(system?.spectralClass),
      diameter: P3_STAR_DIAMETER,
      revolutionRadius: Math.max(1, n) * P3_ORBIT_RADIUS_STEP,
      revolutionDirection: 1,
      revolutionCycle: P3_ORBIT_CYCLE,
      revolutionInitAngle: (firstOrbit - 1) * 0.7,
      planetCount: n,
      planetNames: Object.freeze(planets.map((p) => String(p?.name ?? '')).filter(Boolean)),
      faction,
      sourceIndex: index,
      _astronomyProvenance: 'p3-temporary-astronomy',
    });
  }));
  return catalogCache;
}

/** 0x031f 소속 바이트. 0x02=동맹, 0x03=제국. 중립/미상=0. */
export function factionToBaseOwnership(faction) {
  if (faction === 'alliance') return 0x02;
  if (faction === 'empire') return 0x03;
  return 0;
}

let economyCache;

function loadPlanetEconomy() {
  if (economyCache !== undefined) return economyCache;
  try {
    economyCache = JSON.parse(readFileSync(join(CONTENT_DIR, 'planet-economy.json'), 'utf8'));
  } catch {
    economyCache = null;
  }
  return economyCache;
}

function economyForSystemName(systemName) {
  const eco = loadPlanetEconomy();
  const list = Array.isArray(eco?.systems) ? eco.systems : [];
  return list.find((row) => row && row.system === systemName) ?? null;
}

/**
 * 0x031f 레코드: field04 소속(galaxy.faction) + planet-economy.json P3 임시 경제.
 */
export function buildInformationBaseRecordFromStatic(selected) {
  if (!selected || !(Number.isInteger(selected.id) && selected.id > 0)) return null;
  const ownership = factionToBaseOwnership(selected.faction);
  const eco = economyForSystemName(selected.name);
  const planets = Array.isArray(eco?.planets) ? eco.planets : [];
  let pop = 0;
  let food = 0;
  let industry = 0;
  for (const planet of planets) {
    pop += Number(planet?.population_M) > 0 ? Number(planet.population_M) : 0;
    food += Number(planet?.food) > 0 ? Number(planet.food) : 0;
    industry += Number(planet?.industry) > 0 ? Number(planet.industry) : 0;
  }
  const population = Math.min(0xffffffff, Math.trunc(pop * 10000));
  const foodU = Math.min(0xffffffff, Math.trunc(food));
  const indU = Math.min(0xffffffff, Math.trunc(industry));
  return {
    id: selected.id,
    field04: ownership,
    field05: 0,
    field08: population,
    field14: foodU,
    field18: indU,
    commodity: [foodU, indU, Math.trunc((foodU + indU) / 2)],
    budget: [
      Math.trunc(population / 100),
      foodU,
      indU,
      Math.trunc(pop),
      Math.trunc((food + industry) / 2),
    ],
    budgeting: [10, 20, 15, 15, 20, 20],
    field154: Math.min(0xffff, Math.trunc(pop)),
    field156: Math.min(0xffff, foodU),
    field158: Math.min(0xffff, indU),
    field174: 1.0,
    _provenance: 'p3-temporary-economy:planet-economy.json',
  };
}

export function _resetPlanetEconomyCache() {
  economyCache = undefined;
}

function catalogMatch(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  const catalog = getStaticBaseCatalog();
  return catalog.find((record) => record.id === n || record.grid === n) ?? null;
}

/** system id를 우선하고, 없으면 전략맵 cell로 같은 정적 base 레코드를 찾는다. */
export function findStaticBase({ systemId = null, cell = null } = {}) {
  const catalog = getStaticBaseCatalog();
  if (Number.isInteger(systemId) && systemId > 0) {
    const byId = catalog.find((record) => record.id === systemId);
    if (byId) return byId;
  }
  if (Number.isInteger(cell) && cell >= 0) {
    return catalog.find((record) => record.grid === cell) ?? null;
  }
  return null;
}

/** 플레이어 위치를 상세 레코드의 base id로 조인하는 명시적 cell lookup. */
export function findStaticBaseByCell(cell) {
  return findStaticBase({ cell });
}

/**
 * 0x031c 요청에서 첫 번째 id/cell 후보를 읽는다.
 * 라이브 요청은 길이 접두가 있는 [u16 count][u32 id…] 형태였고, 일부 진단 도구는
 * body에 u32만 넣었다. 두 형태 모두 검증된 little-endian selector ID로만 읽는다.
 */
export function readStaticBaseRequest(innerOrBody) {
  const buf = Buffer.isBuffer(innerOrBody) ? innerOrBody : Buffer.from(innerOrBody ?? []);
  let body = buf;
  let hasEnvelope = false;
  let requestCode = null;
  if (buf.length >= 6
    && buf.readUInt32LE(0) === 0
    && STATIC_BASE_SELECTOR_REQUEST_CODES.has(buf.readUInt16BE(4))) {
    requestCode = buf.readUInt16BE(4);
    body = buf.subarray(6);
    hasEnvelope = true;
  } else if (buf.length >= 2 && STATIC_BASE_SELECTOR_REQUEST_CODES.has(buf.readUInt16BE(0))) {
    requestCode = buf.readUInt16BE(0);
    body = buf.subarray(2);
    hasEnvelope = true;
  }
  const candidates = [];
  let selectorStatus = 'unmatched';
  if (body.length === 0) {
    selectorStatus = 'absent';
  } else if (!hasEnvelope && body.length === 4) {
    // 일부 진단 도구가 전달하는 명확한 body-only u32 shape만 별도로 허용한다.
    candidates.push(body.readUInt32LE(0));
  } else if (body.length >= 2) {
    const count = body.readUInt16BE(0);
    const expectedLength = 2 + count * 4;
    const exceedsRequestCap = DETAIL_BASE_SELECTOR_REQUEST_CODES.has(requestCode)
      && count > DETAIL_BASE_SELECTOR_MAX;
    if (count === 0 && body.length === expectedLength) {
      selectorStatus = 'absent';
    } else if (count > 0 && body.length === expectedLength && !exceedsRequestCap) {
      // count-prefixed shape는 첫 selector만 읽고 offset 0을 독립 u32로 재해석하지 않는다.
      candidates.push(body.readUInt32LE(2));
    }
  }
  for (const candidate of candidates) {
    const match = catalogMatch(candidate);
    if (match) {
      return {
        selectorStatus: 'matched',
        requestValue: candidate,
        systemId: match.id,
        cell: match.grid,
      };
    }
  }
  // 나머지 짧거나 길이가 맞지 않거나 catalog에 없는 body는 명시적 오류로 보존한다.
  // 세션 계층은 unmatched를 플레이어 cell로 대체하지 않는다.
  return {
    selectorStatus,
    requestValue: candidates[0] ?? null,
    systemId: null,
    cell: null,
  };
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
  economyCache = undefined;
}
