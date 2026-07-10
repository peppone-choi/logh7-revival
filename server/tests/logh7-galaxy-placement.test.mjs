// logh7-galaxy-placement.test.mjs — 정본 갤럭시 → 전략맵 배치 계약 검증
//
// 근거: docs/logh7-strategic-map-placement-re.md
//   0x0313: 1+v*3 [byte0=constmsg0x18 subId, byte1=class, byte2=variant], byte1==3=마커.
//   0x0315: [u8 w][u8 h][u16BE rleLen][run,value…], Σrun==5000, 5004B.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  getStrategicGalaxyPlacement,
  getStrategicGridCells,
  getStrategicPaletteObjects,
  V_SPACE,
  V_BACKGROUND,
} from '../src/server/logh7-galaxy-placement.mjs';
import {
  buildStaticInformationGridTypeInner,
  buildStaticInformationGridInner,
  msg32Body,
  readMsg32Code,
  CODE_STATIC_GRID_TYPE,
  CODE_STATIC_GRID,
  CODE_STATIC_GRID_BYTES,
} from '../src/server/logh7-world-records.mjs';

const CONTENT = join(dirname(fileURLToPath(import.meta.url)), '..', 'content');
const galaxy = JSON.parse(readFileSync(join(CONTENT, 'galaxy.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(CONTENT, 'extracted', 'constmsg-label-catalog.json'), 'utf8'));

// 0x0315 RLE 디코더 (클라 FUN_004abbb0 미러) — [u8 w][u8 h][u16BE len][run,value…]
function decodeGrid(body) {
  const w = body.readUInt8(0);
  const h = body.readUInt8(1);
  const rleLen = body.readUInt16BE(2); // ★BE
  const grid = new Uint8Array(w * h);
  let pos = 0;
  let off = 4;
  let sumRun = 0;
  const end = 4 + rleLen;
  while (off + 1 < end) {
    const run = body.readUInt8(off);
    const val = body.readUInt8(off + 1);
    off += 2;
    if (run === 0) break;
    sumRun += run;
    for (let i = 0; i < run && pos < grid.length; i += 1) grid[pos++] = val;
  }
  return { w, h, rleLen, grid, sumRun };
}

test('placement: 85 성계 전부 배치, 갭 0, 마커/팔레트 캡 준수', () => {
  const p = getStrategicGalaxyPlacement();
  assert.equal(p.width, 100);
  assert.equal(p.height, 50);
  assert.equal(p.stats.systems, galaxy.systems.length, '모든 galaxy 성계가 배치돼야');
  assert.equal(p.stats.gaps, 0, '갭(누락) 없어야');
  assert.ok(p.stats.markerCount <= 128, `마커 ≤128 (실제 ${p.stats.markerCount})`);
  assert.ok(p.stats.paletteCount <= 100, `팔레트 값 count ≤100 (실제 ${p.stats.paletteCount})`);
  assert.ok(p.stats.paletteCount < 0x65, 'count byte < 0x65(101) 게이트');
});

test('palette: 터레인 0/1/2 + 성계는 전부 klass=3, 예약값 klass 정확', () => {
  const p = getStrategicGalaxyPlacement();
  const byVal = new Map(p.paletteObjects.map((o) => [o.value, o]));
  assert.equal(byVal.get(V_BACKGROUND).klass, 0, '배경 0 = 항법불가 klass0');
  assert.equal(byVal.get(V_SPACE).klass, 1, '空間 1 = 항법가능 klass1');
  const markers = p.paletteObjects.filter((o) => o.klass === 3);
  assert.equal(markers.length, galaxy.systems.length, '성계 마커 수 == 성계 수');
  for (const m of markers) {
    assert.ok(m.variant <= 6 || m.variant === 8, `byte2 유효 {0..6,8} (실제 ${m.variant})`);
    assert.ok(m.contentId >= 3, `성계 라벨 subId≥3 (실제 ${m.contentId})`);
  }
  // 고유 value (같은 값 두 성계 → 이름 충돌)
  const vals = markers.map((m) => m.value);
  assert.equal(new Set(vals).size, vals.length, '성계 value 고유');
});

test('byte0 = constmsg 0x18 subId (アイゼンヘルツ=3 실측 대조)', () => {
  const p = getStrategicGalaxyPlacement();
  const base = catalog.systems.baseId;
  const nameToSub = new Map(catalog.systems.entries.map((e) => [e.label, e.id - base]));
  for (const rec of p.placed) {
    assert.equal(rec.subId, nameToSub.get(rec.system), `${rec.system} subId 정합`);
  }
  const eisen = p.placed.find((r) => r.system === 'アイゼンヘルツ');
  if (eisen) assert.equal(eisen.subId, 3, 'アイゼンヘルツ = subId 3');
});

test('cells: 성계 셀이 canonRow*100+canonCol, 팔레트 값 왕복', () => {
  const p = getStrategicGalaxyPlacement();
  const byVal = new Map(p.paletteObjects.map((o) => [o.value, o]));
  for (const c of p.systemCells) {
    const gal = galaxy.systems.find((s) => s.system === c.system);
    assert.equal(c.col, gal.canonCol);
    assert.equal(c.row, gal.canonRow);
    // objectTable[value] 가 klass=3 마커여야
    assert.equal(byVal.get(c.value).klass, 3, `${c.system} 셀값→마커`);
  }
  // 항법공간 셀은 전부 value=1
  for (const c of p.spaceCells) assert.equal(c.value, V_SPACE);
});

test('0x0315 인코딩: 5004B, w/h, rleLen BE, Σrun==5000, 성계 셀 정확', () => {
  const p = getStrategicGalaxyPlacement();
  const cells = getStrategicGridCells();
  const inner = buildStaticInformationGridInner({ cells });
  assert.equal(readMsg32Code(inner), CODE_STATIC_GRID);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_STATIC_GRID_BYTES, '고정 5004B');
  const dec = decodeGrid(body);
  assert.equal(dec.w, 100);
  assert.equal(dec.h, 50);
  assert.equal(dec.sumRun, 5000, 'Σrun 불변식 5000');
  // 성계 셀이 디코드 그리드에서 그 성계 value 를 가리키는지
  for (const c of p.systemCells) {
    assert.equal(dec.grid[c.row * 100 + c.col], c.value, `${c.system} 셀 배치`);
  }
  // 최소 하나의 항법공간(1) 셀 존재
  assert.ok(dec.grid.includes(V_SPACE), '항법공간 셀 존재');
});

test('0x0315 rleLen 필드가 BE 로 기록됨 (LE 오독 방지)', () => {
  const inner = buildStaticInformationGridInner({ cells: getStrategicGridCells() });
  const body = msg32Body(inner);
  const be = body.readUInt16BE(2);
  assert.ok(be > 0 && be < 0x1389, `rleLen BE 유효범위 0<c<5001 (실제 ${be})`);
});

test('0x0313 인코딩: 5004B, count=max(v)+1, 1+v*3 에 [subId,3,variant]', () => {
  const objects = getStrategicPaletteObjects();
  const inner = buildStaticInformationGridTypeInner({ objects });
  assert.equal(readMsg32Code(inner), CODE_STATIC_GRID_TYPE);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_STATIC_GRID_BYTES, '고정 5004B');
  const count = body.readUInt8(0);
  const maxV = objects.reduce((m, o) => Math.max(m, o.value), 0);
  assert.equal(count, maxV + 1);
  assert.ok(count < 0x65, 'count<101');
  for (const o of objects) {
    const off = 1 + o.value * 3;
    assert.equal(body.readUInt8(off), o.contentId & 0xff, `v${o.value} byte0`);
    assert.equal(body.readUInt8(off + 1), o.klass & 0xff, `v${o.value} byte1(klass)`);
    assert.equal(body.readUInt8(off + 2), o.variant & 0xff, `v${o.value} byte2`);
  }
});
