// logh7-galaxy-placement.mjs — 정본 갤럭시 데이터를 전략맵 0x0313 팔레트 / 0x0315 셀로 변환
//
// 근거: docs/logh7-strategic-map-placement-re.md (정통 EXE 재확정)
//   0x0313 오브젝트: 1 + v*3 에 [byte0=constmsg 0x18 라벨subId, byte1=class, byte2=variant].
//     byte1==3 만 클릭 가능한 섹터 마커로 렌더(FUN_004d3bd0), 1=항법가능 空間, 0=배경(항법불가).
//   0x0315 셀: cell = row*100 + col, 셀값 v = 팔레트 인덱스. Σrun==5000.
//   byte0 = constmsg group 0x18(=24) subId. baseId 1403 → subId = recordId-1403.
//     subId 0=プラズマ嵐,1=空間,2=航行不能, 3..88 = 실 성계명(server/content/extracted/
//     constmsg-label-catalog.json systems, アイゼンヘルツ=3 … 太陽系=88).
//   좌표: galaxy.json canonCol/canonRow (0-indexed, 0x0315 와이어 배열 좌표), 100×50.
//
// 데이터 소스(전부 정본, 날조 없음):
//   server/content/galaxy.json (85 성계: canonCol/canonRow/system/spectralClass)
//   server/content/galaxy-passable-cells.json (항법가능 셀 rowRangesByRow, 0-indexed 포함범위)
//   server/content/extracted/constmsg-label-catalog.json (그룹 0x18 성계명 subId)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');

const GRID_W = 100;
const GRID_H = 50;

// 예약 팔레트 값(터레인) — galaxy 성계는 V_SYSTEM_BASE 부터.
export const V_BACKGROUND = 0; // プラズマ嵐 배경 (klass 0 = 항법불가)
export const V_SPACE = 1; // 空間 항법가능 (klass 1)
export const V_NONNAV = 2; // 航行不能 (klass 0, 셀엔 미사용이나 라벨 보존)
const V_SYSTEM_BASE = 3;

// constmsg group 0x18 subId (byte0)
const LABEL_PLASMA = 0;
const LABEL_SPACE = 1;
const LABEL_NONNAV = 2;

// byte1 klass 게이트
const KLASS_BACKGROUND = 0;
const KLASS_SPACE = 1;
const KLASS_MARKER = 3; // ★클릭 가능한 성계 마커

// 캡(docs §2 값 예산)
const MARKER_CAP = 128; // DAT_009d1510 0x500/0x28
const PALETTE_VALUE_CAP = 100; // byte0 count u8, information_size over than 100 에러

// spectralClass O/B/A/F/G/K/M → byte2 아이콘 슬롯 0..6 (FUN_004d3bd0: 0..6 그대로, 8→블랙홀7)
const SPECTRAL_SLOT = Object.freeze({ O: 0, B: 1, A: 2, F: 3, G: 4, K: 5, M: 6 });
const SPECTRAL_UNKNOWN_VARIANT = 8; // 미상 스펙트럼 → 블랙홀 슬롯 폴백(그 외 값은 렌더 skip)

let cache = null;
let navigableCellCache = null;

function loadJson(...rel) {
  return JSON.parse(readFileSync(join(CONTENT_DIR, ...rel), 'utf8'));
}

/**
 * 정본 갤럭시 → 전략맵 배치. 메모이즈(파일 1회 로드).
 * @returns {{
 *   width:number, height:number,
 *   paletteObjects: Array<{value:number, contentId:number, klass:number, variant:number}>,
 *   systemCells: Array<{col:number, row:number, value:number, system:string}>,
 *   spaceCells: Array<{col:number, row:number, value:number}>,
 *   placed: Array<{system:string, value:number, subId:number, col:number, row:number, variant:number}>,
 *   gaps: Array<{system:string, reason:string}>,
 *   stats: {systems:number, gaps:number, spaceCells:number, paletteObjects:number, paletteCount:number, markerCount:number},
 * }}
 */
export function getStrategicGalaxyPlacement() {
  if (cache) return cache;
  cache = buildPlacement();
  return cache;
}

function buildPlacement() {
  const galaxy = loadJson('galaxy.json');
  const passable = loadJson('galaxy-passable-cells.json');
  const catalog = loadJson('extracted', 'constmsg-label-catalog.json');

  // constmsg 0x18 성계명 → subId(byte0)
  const base = catalog?.systems?.baseId;
  const nameToSubId = new Map();
  if (Number.isInteger(base) && Array.isArray(catalog.systems.entries)) {
    for (const e of catalog.systems.entries) {
      if (e && typeof e.label === 'string' && Number.isInteger(e.id)) {
        nameToSubId.set(e.label, e.id - base);
      }
    }
  }

  // 예약 터레인 팔레트 (subId 0..2 는 클라 보유 그리드-타입 라벨).
  const paletteObjects = [
    { value: V_BACKGROUND, contentId: LABEL_PLASMA, klass: KLASS_BACKGROUND, variant: 0 },
    { value: V_SPACE, contentId: LABEL_SPACE, klass: KLASS_SPACE, variant: 0 },
    { value: V_NONNAV, contentId: LABEL_NONNAV, klass: KLASS_BACKGROUND, variant: 0 },
  ];

  const systemCells = [];
  const placed = [];
  const gaps = [];
  let value = V_SYSTEM_BASE;

  const systems = Array.isArray(galaxy?.systems) ? galaxy.systems : [];
  for (const s of systems) {
    const col = s?.canonCol;
    const row = s?.canonRow;
    if (!Number.isInteger(col) || !Number.isInteger(row)
      || col < 0 || col >= GRID_W || row < 0 || row >= GRID_H) {
      gaps.push({ system: s?.system ?? '(unknown)', reason: 'no-canon-cell' });
      continue;
    }
    const subId = nameToSubId.get(s.system);
    if (!Number.isInteger(subId)) {
      gaps.push({ system: s.system, reason: 'no-constmsg-0x18-label' });
      continue;
    }
    if (placed.length >= MARKER_CAP) {
      gaps.push({ system: s.system, reason: 'marker-cap-128' });
      continue;
    }
    if (value >= PALETTE_VALUE_CAP) {
      gaps.push({ system: s.system, reason: 'palette-value-cap-100' });
      continue;
    }
    const variant = Object.prototype.hasOwnProperty.call(SPECTRAL_SLOT, s.spectralClass)
      ? SPECTRAL_SLOT[s.spectralClass]
      : SPECTRAL_UNKNOWN_VARIANT;
    paletteObjects.push({ value, contentId: subId, klass: KLASS_MARKER, variant });
    systemCells.push({ col, row, value, system: s.system });
    placed.push({ system: s.system, value, subId, col, row, variant });
    value += 1;
  }

  // 항법가능 空間 셀 — rowRangesByRow (0-indexed row, 포함범위 [a,b])
  const spaceCells = [];
  const ranges = passable?.rowRangesByRow ?? {};
  for (const [rowKey, rowRanges] of Object.entries(ranges)) {
    const row = Number(rowKey);
    if (!Number.isInteger(row) || row < 0 || row >= GRID_H || !Array.isArray(rowRanges)) continue;
    for (const pair of rowRanges) {
      if (!Array.isArray(pair) || pair.length < 2) continue;
      const a = Math.max(0, pair[0]);
      const b = Math.min(GRID_W - 1, pair[1]);
      for (let col = a; col <= b; col += 1) {
        spaceCells.push({ col, row, value: V_SPACE });
      }
    }
  }

  return {
    width: GRID_W,
    height: GRID_H,
    paletteObjects,
    systemCells,
    spaceCells,
    placed,
    gaps,
    stats: {
      systems: placed.length,
      gaps: gaps.length,
      spaceCells: spaceCells.length,
      paletteObjects: paletteObjects.length,
      paletteCount: paletteObjects.reduce((m, o) => Math.max(m, o.value), 0) + 1,
      markerCount: placed.length,
    },
  };
}

/**
 * 0x0315 셀 배열 — 항법공간(먼저) → extra(플레이어 함대 등) → 성계 마커(마지막, 항상 우선).
 * buildStaticInformationGridInner 는 뒤 셀이 앞 셀을 덮으므로 성계가 항상 렌더된다.
 * @param {Array<{col?:number,row?:number,cell?:number,value:number}>} extraCells
 */
export function getStrategicGridCells(extraCells = []) {
  const p = getStrategicGalaxyPlacement();
  const extra = Array.isArray(extraCells) ? extraCells : [];
  return [...p.spaceCells, ...extra, ...p.systemCells];
}

/**
 * 현재 0x0315로 송신하는 전략 그리드에서 항법 가능한 셀인지 확인한다.
 * 데이터의 정본 승격 판정이 아니라, 클라이언트에 보인 항법 게이트와 서버 이동 권위를 맞추는 규칙이다.
 */
export function isStrategicGridCellNavigable(cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= GRID_W * GRID_H) return false;
  if (!navigableCellCache) {
    const placement = getStrategicGalaxyPlacement();
    navigableCellCache = new Set(
      [...placement.spaceCells, ...placement.systemCells]
        .map(({ col, row }) => row * placement.width + col),
    );
  }
  return navigableCellCache.has(cell);
}

/** 0x0313 팔레트 오브젝트(터레인 3 + 성계 N). */
export function getStrategicPaletteObjects() {
  return getStrategicGalaxyPlacement().paletteObjects;
}

/** 테스트/재시드용 캐시 무효화. */
export function _resetGalaxyPlacementCache() {
  cache = null;
  navigableCellCache = null;
}
