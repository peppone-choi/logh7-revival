import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

test('manual star extraction rejects annotation line markers as canon dots', () => {
  const raw = readJson('.omo/work/galaxy-extract/page101-raw.json');
  const canon = readJson('.omo/work/galaxy-extract/canon-positions.json');

  assert.equal(raw.accepted.star_dot.length, 80, 'actual colored star markers must be inventoried');
  assert.ok(
    raw.rejected.drawings.some((drawing) => drawing.classification === 'annotation_marker'),
    'annotation marker source must not be accepted as canon dot',
  );
  assert.doesNotMatch(
    canon._method.star_dot ?? canon._method.dot_pairing ?? '',
    /line-marker|7\.8pt/i,
    'annotation marker source must not be accepted as canon dot',
  );
});

test('content/galaxy.json uses actual star-dot canon cells, not label marker centers', () => {
  const galaxy = readJson('content/galaxy.json');
  const systems = galaxy.systems;
  const byName = new Map(systems.map((system) => [system.system, system]));
  const iserlohn = byName.get('イゼルローン');

  assert.equal(systems.length, 80);
  assert.deepEqual(
    [iserlohn.canonCol, iserlohn.canonRow],
    [53, 12],
    'Iserlohn wire cell must come from the red/orange raster dot, not the cyan corridor edge',
  );
  assert.deepEqual([iserlohn.canonGameCol, iserlohn.canonGameRow], [54, 13], 'game grid coordinates are 1-indexed');
  assert.deepEqual([iserlohn.canonPixelX, iserlohn.canonPixelY], [420.601, 199.236], 'raster dot center is preserved');
  assert.deepEqual(iserlohn.canonColorRgb, [184, 92, 55], 'background-subtracted warm disk color is preserved');
  assert.equal(iserlohn.spectralClass, 'K', 'warm orange/red dot maps to a provisional K-class marker');
  assert.equal(iserlohn.canonLineMarkerRow, 14, 'old annotation marker row preserved only as provenance');
  assert.match(galaxy._source, /black inner line markers rejected/);

  const cells = systems.map((system) => `${system.canonCol},${system.canonRow}`);
  assert.equal(new Set(cells).size, 80, 'actual star cells stay unique');
  for (const system of systems) {
    assert.ok(Number.isInteger(system.canonCol) && system.canonCol >= 0 && system.canonCol < 100);
    assert.ok(Number.isInteger(system.canonRow) && system.canonRow >= 0 && system.canonRow < 50);
  }
});

test('passable mask includes recovered star cells and removes stale Iserlohn line-marker corridor cell', () => {
  const galaxy = readJson('content/galaxy.json');
  const passable = readJson('content/galaxy-passable-cells.json');
  const ranges = passable.rowRangesByRow;
  const hasCell = (col, row) => (ranges[String(row)] ?? []).some(([lo, hi]) => lo <= col && col <= hi);
  const iserlohn = galaxy.systems.find((system) => system.system === 'イゼルローン');

  for (const system of galaxy.systems) {
    assert.ok(hasCell(system.canonCol, system.canonRow), `${system.system} actual star cell is passable`);
  }
  assert.ok(hasCell(53, 12), 'Iserlohn red/orange dot cell is passable');
  assert.notDeepEqual([iserlohn.canonCol, iserlohn.canonRow], [51, 12], 'old cyan corridor edge cell is not the Iserlohn marker');
  assert.equal(hasCell(51, 12), true, 'old cyan corridor edge cell remains passable only as the one-cell corridor floor');
  assert.equal(hasCell(51, 14), false, 'stale Iserlohn annotation line-marker cell is not corridor');
});

test('passable mask keeps the central corridors one cell high', () => {
  const passable = readJson('content/galaxy-passable-cells.json');
  const ranges = passable.rowRangesByRow;
  const hasCell = (col, row) => (ranges[String(row)] ?? []).some(([lo, hi]) => lo <= col && col <= hi);

  assert.deepEqual(passable._method.centralGapClosedCols, [48, 57]);
  assert.deepEqual(passable._method.oneCellCorridorRows, [12, 38]);
  // 페잔(フェザーン) 마커 예외(2026-06-23 사용자 결정 "페잔만 한 칸 위로, 회랑 불변 완화"):
  // 페잔은 중앙갭 안(col 51)이라 회랑행에만 놓일 수 있는데, 마커를 한 칸 위(row 37)로 올리되 회랑(row 38)은
  // 유지하기로 해, (51,37)을 단일 예외로 개방한다. 나머지 갭 셀은 여전히 회랑행(12,38)에서만 통항한다.
  const phezzanMarkerException = (col, row) => col === 51 && row === 37;
  for (let row = 0; row < 50; row += 1) {
    for (let col = 48; col <= 57; col += 1) {
      const expectedOpen = row === 12 || row === 38 || phezzanMarkerException(col, row);
      assert.equal(hasCell(col, row), expectedOpen, `central gap cell (${col},${row}) one-cell corridor state`);
    }
  }
});

test('strategic grid dump proves terrain-enabled 0x0315 contains recovered star cells', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'logh7-grid-dump-'));
  const out = join(tmp, 'grid.json');
  const tool = fileURLToPath(new URL('../../tools/logh7_dump_strategic_grid.mjs', import.meta.url));

  execFileSync(process.execPath, [tool, '--terrain', '--out', out], { stdio: 'pipe' });
  const dump = readJson(out);

  assert.equal(dump.width, 100);
  assert.equal(dump.height, 50);
  assert.equal(dump.rleDecodedCells, 5000);
  assert.equal(dump.systemMarkers, 80);
  assert.equal(dump.markerCells, 80);
  assert.deepEqual(dump.keySystems.iserlohn.cell, [53, 12]);
  assert.deepEqual(dump.keySystems.iserlohn.canonCell, [53, 12]);
  assert.deepEqual(dump.keySystems.iserlohn.gameCell, [54, 13]);
  assert.equal(dump.keySystems.iserlohn.spectralClass, 'K');
  assert.equal(dump.keySystems.iserlohn.passable, true);
  assert.equal(dump.markerOutsidePassable, 0);
  assert.deepEqual(dump.markerOutsidePassableSystems, []);
  assert.deepEqual(dump.duplicateMarkerCells, []);
  assert.equal(dump.invariants.readyForTerrainLiveSmoke, true);
  assert.ok(dump.terrain.space > 0, 'passable cells should be encoded as SPACE/class-1 cells');
  assert.ok(dump.terrain.nonNavigable > 0, 'void cells should be encoded as blocked cells');
});
