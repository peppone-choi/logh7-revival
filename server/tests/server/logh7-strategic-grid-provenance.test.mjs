import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openContentSource } from '../../src/server/logh7-content-source.mjs';
import { buildContentPackDataFromSource } from '../../src/server/logh7-content-adapter.mjs';
import { createContentPack } from '../../src/server/logh7-content-pack.mjs';
import { buildStrategicGalaxyGrid, SS_RESP_STATIC_GRID_BYTES } from '../../src/server/logh7-login-protocol.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function decodeCellGrid(cellInner) {
  const body = cellInner.subarray(6);
  const decoded = new Uint8Array(100 * 50);
  const rleBytes = body.readUInt16BE(2);
  let pos = 0;
  for (let offset = 0; offset < rleBytes; offset += 2) {
    const run = body.readUInt8(4 + offset);
    const value = body.readUInt8(5 + offset);
    decoded.fill(value, pos, pos + run);
    pos += run;
  }
  return { decoded, pos };
}

test('strategic grid provenance keeps system marker byte0 on recovered constmsg group 0x18 ids', () => {
  // Given: the recovered content pack that feeds the current strategic galaxy grid.
  const source = openContentSource({ build: true });
  try {
    const pack = createContentPack(buildContentPackDataFromSource(source));
    // Roster = 85 canon systems (constmsg group-0x18 authority); 좌표확정 부분집합 = 80 plotted manual dots.
    // 좌표 미확정 5개(sub 13/32/34/52/75)는 map==null → grid 마커를 받지 않으므로 좌표확정 셀/byte0 단언은
    // 이 80개 부분집합에만 적용한다(map?.cx로 null 안전 접근).
    const systems = pack.systems.map((system) => ({
      cx: system.map?.cx ?? null,
      cy: system.map?.cy ?? null,
      canonCol: system.map?.canonCol ?? null,
      canonRow: system.map?.canonRow ?? null,
      page: system.map?.page ?? null,
      faction: system.faction,
      contentId: system.contentId,
      spectralClass: system.spectralClass,
    }));
    const coordinateConfirmed = pack.systems.filter((system) => system.map != null);

    // When: the server builds the 0x0313 object table and 0x0315 cell grid.
    const { objectInner, cellInner } = buildStrategicGalaxyGrid({
      systems,
      fleetCell: { col: 50, row: 25 },
      fleetValue: 3,
      fleetContentId: 1,
    });
    const objectBody = objectInner.subarray(6);
    const { decoded, pos } = decodeCellGrid(cellInner);

    // Then: no system falls back to index&0xff and every emitted marker resolves through byte0.
    const missing = pack.systems.filter((system) => !Number.isInteger(system.contentId));
    assert.deepEqual(missing.map((system) => system.name), []);
    // 로스터는 85, 좌표확정(plotted dot) 부분집합은 80.
    assert.equal(pack.systems.length, 85);
    assert.equal(coordinateConfirmed.length, 80);
    assert.equal(objectInner.length, 6 + SS_RESP_STATIC_GRID_BYTES);
    assert.equal(cellInner.length, 6 + SS_RESP_STATIC_GRID_BYTES);
    assert.equal(objectBody.readUInt8(0), 84); // records 0..83: systems 4..83 (값 3 함대 마커는 기본 미배치)
    assert.equal(pos, 100 * 50);
    // FR(2026-06-19): 함대를 klass-3 마커로 박지 않으므로 마커 셀 = 좌표확정 80 성계뿐(이전 81 = 80+함대).
    // 좌표 미확정 5개는 grid에서 제외되어 마커 수는 여전히 80(85가 아님).
    assert.equal([...decoded].filter((value) => value >= 3 && value <= 88).length, 80);

    // byte0/cell/class 단언은 grid에 들어간 좌표확정 80개에만. 이들은 galaxy.json 앞쪽 80개라 filtered-list
    // 인덱스 = pack 인덱스(value = 4 + index)가 그대로 성립한다.
    coordinateConfirmed.forEach((system, index) => {
      const value = 4 + index;
      const cellIndex = decoded.indexOf(value);
      assert.notEqual(cellIndex, -1, `${system.name} value ${value} is present in 0x0315`);
      const objectOffset = 1 + value * 3;
      assert.equal(objectBody.readUInt8(objectOffset), system.contentId, `${system.name} byte0`);
      assert.equal(objectBody.readUInt8(objectOffset + 1), 3, `${system.name} class gate`);
    });
    const variantHistogram = {};
    coordinateConfirmed.forEach((system, index) => {
      const variant = objectBody.readUInt8(1 + (4 + index) * 3 + 2);
      variantHistogram[variant] = (variantHistogram[variant] ?? 0) + 1;
      assert.equal(system.provenance.spectralClass.authority, 'manual_star_chart_pixel_color');
      if (system.name === 'イゼルローン') {
        assert.equal(system.spectralClass, 'K');
      }
    });
    assert.deepEqual(variantHistogram, { 1: 8, 2: 4, 3: 3, 4: 32, 5: 23, 6: 10 });

    const assertSystemCell = (name, expected) => {
      const index = coordinateConfirmed.findIndex((system) => system.name === name);
      assert.notEqual(index, -1, `${name} exists in coordinate-confirmed subset`);
      const value = 4 + index;
      const cellIndex = decoded.indexOf(value);
      assert.equal(cellIndex, expected.row * 100 + expected.col, `${name} projected cell`);
    };

    assertSystemCell('イゼルローン', { col: 53, row: 12 });
    assertSystemCell('ルンビーニ', { col: 5, row: 20 });
    assertSystemCell('シロン', { col: 6, row: 14 });
    assertSystemCell('フェザーン', { col: 51, row: 37 }); // 페잔 마커 한 칸 위로(2026-06-23 사용자 결정); 회랑 통항은 row38 유지

    const lumbini = pack.systemByName('ルンビーニ');
    const iserlohn = pack.systemByName('イゼルローン');
    const valhalla = pack.systemByName('ヴァルハラ');
    assert.equal(lumbini.contentId, 86);
    assert.equal(lumbini.nameKo, '룬비니');
    assert.equal(valhalla.nameKo, '발할라');
    assert.equal(valhalla.spectralClass, 'G');
    assert.equal(valhalla.provenance.spectralClass.authority, 'manual_star_chart_pixel_color');
    assert.deepEqual(
      lumbini.planets.map((planet) => [planet.name, planet.nameKo, planet.orbit]),
      [
        ['バクタプール', '바구타푸루', 1],
        ['カライヤ', '카라이야', 2],
        ['バドガオン', '바도가온', 3],
      ],
    );
    assert.equal(iserlohn.contentId, 14);
    assert.ok(iserlohn.fortresses.includes('イゼルローン'));
  } finally {
    source.close();
  }
});

test('strategic coordinate provenance stays marked as manual projection, not original server state', () => {
  // Given: the content pack keeps source labels for map and planet positions.
  const source = openContentSource({ build: true });
  try {
    const pack = createContentPack(buildContentPackDataFromSource(source));
    const firstSystem = pack.systems[0];

    // When: callers inspect the coordinate source used for the strategic grid.
    // 좌표확정 성계만 map.source를 갖는다; 좌표 미확정 5개는 map==null(좌표 출처 없음 = 추측 금지를 명시).
    const mapped = pack.systems.filter((system) => system.map != null);
    const sourceLabels = new Set(mapped.map((system) => system.map.source));

    // Then: the coordinate contract remains explicit about provenance.
    assert.equal(mapped.length, 80);
    assert.equal(pack.systems.filter((system) => system.map == null).length, 5);
    assert.deepEqual([...sourceLabels], ['content/galaxy.json manual star-chart annotations']);
    assert.equal(firstSystem.planets[0].inferredPosition.source, 'content/galaxy.json orbit order, deterministic local polar slots');
  } finally {
    source.close();
  }
});

test('world data mining shape keeps star classes provenance-marked, not authoritative', () => {
  const galaxy = readJson('content/galaxy.json');
  const stars = readJson('content/extracted/model-galaxy-stars.json');
  const modelPlanets = readJson('content/extracted/model-planets.json');
  const schema = readJson('content/client/schema.json');
  const economy = readJson('content/planet-economy.json');
  const source = openContentSource({ build: true });

  try {
    const pack = createContentPack(buildContentPackDataFromSource(source));
    const systems = galaxy.systems ?? [];
    const planetCount = systems.reduce((count, system) => count + (system.planets ?? []).length, 0);
    const fortressCount = systems.reduce((count, system) => count + (system.fortresses ?? []).length, 0);
    // 좌표확정 부분집합(plotted dot 보유) vs 좌표 미확정(coordinatePending) 분리.
    const plotted = systems.filter((s) => s.positionAuthority !== 'MINIMAP_P3_VIRTUAL_OVERLAY');
    const virtual = systems.filter((s) => s.positionAuthority === 'MINIMAP_P3_VIRTUAL_OVERLAY');

    assert.match(galaxy._source, /special Text annotations \(80 system labels; cx\/cy only\)/);
    // Canon cell provenance: cx/cy stay manual annotations; canonCol/canonRow come from raster dot centers.
    assert.match(galaxy._source, /raster star-dot centers/);
    // _source는 이제 85캐논/80좌표확정 부분집합 관계를 명시한다.
    assert.match(galaxy._source, /80 systems have P1 manual\/raster coordinates/);
    assert.match(galaxy._source, /MINIMAP_P3_VIRTUAL_OVERLAY grid coordinates/);
    assert.match(galaxy._source, /not original server\/manual data/);
    // 로스터 = 85 캐논 성계, 좌표확정 = 80, 좌표 미확정 = 5(constmsg group-0x18 sub 13/32/34/52/75).
    assert.equal(systems.length, 85);
    assert.equal(plotted.length, 80);
    assert.equal(virtual.length, 5);
    assert.deepEqual(virtual.map((s) => s.contentId).sort((a, b) => a - b), [13, 32, 34, 52, 75]);
    // 좌표 미확정 성계는 좌표 필드를 절대 지어내지 않는다(전부 null) + 식별 플래그를 갖는다.
    for (const s of virtual) {
      assert.equal(s.coordinatePending, false);
      assert.equal(s.positionAuthority, 'MINIMAP_P3_VIRTUAL_OVERLAY');
      assert.equal(s.nameAuthority, 'constmsg-group-0x18-P0');
      assert.equal(s.planetAuthority, 'P3_VIRTUAL_DESIGN');
      assert.ok(Number.isInteger(s.canonCol) && s.canonCol >= 0 && s.canonCol < 100, `${s.system} P3 canonCol in bounds`);
      assert.ok(Number.isInteger(s.canonRow) && s.canonRow >= 0 && s.canonRow < 50, `${s.system} P3 canonRow in bounds`);
      assert.equal(s.cx, null, `${s.system} cx stays null: no manual annotation`);
      assert.equal(s.cy, null, `${s.system} cy stays null: no manual annotation`);
      assert.equal(s.spectralClassProvenance.authority, 'P3_VIRTUAL_DESIGN');
      assert.equal(s.spectralClassProvenance.originalServerData, false);
    }
    assert.equal(planetCount, 300);
    assert.equal(fortressCount, 6);
    // 좌표확정 80개만 in-bounds canon cell + 중복 없음(항행 가능 100x50 섹터 셀).
    const canonCells = systems.map((s) => [s.canonCol, s.canonRow]);
    for (const [col, row] of canonCells) {
      assert.ok(Number.isInteger(col) && col >= 0 && col < 100, `canonCol ${col} in 0..99`);
      assert.ok(Number.isInteger(row) && row >= 0 && row < 50, `canonRow ${row} in 0..49`);
    }
    assert.equal(new Set(canonCells.map(([c, r]) => `${c},${r}`)).size, 85, 'no duplicate playable cells');

    assert.equal(stars._source, 'data/model/strategy/Null_galaxy.mdx star_<NN>_<spectralClass> scene-graph nodes');
    assert.match(stars._note, /NOT necessarily galaxy\.json system order/);
    assert.equal(stars.stars.length, 79);
    assert.deepEqual(stars.spectral_histogram, { G: 19, O: 2, F: 8, A: 7, B: 5, M: 21, K: 17 });
    assert.deepEqual(stars.special_bodies, ['bh_01', 'bh_02', 'bh_03', 'ns_01', 'ns_02', 'ns_03']);

    // 좌표 미확정 5개는 spectralClass 입력이 없다(좌표·항성색 매뉴얼 dot 부재) → spectral 단언은 좌표확정
    // 80개 부분집합에만 적용한다.
    const spectralConfirmed = pack.systems.filter((system) => system.map != null);
    assert.equal(spectralConfirmed.length, 80);
    const spectralHistogram = spectralConfirmed.reduce((histogram, system) => {
      const key = system.spectralClass ?? 'unassigned';
      histogram[key] = (histogram[key] ?? 0) + 1;
      return histogram;
    }, {});
    assert.deepEqual(spectralHistogram, { K: 23, G: 32, M: 10, F: 3, B: 8, A: 4 });
    assert.equal(spectralConfirmed.filter((system) => ['A', 'B'].includes(system.spectralClass)).length, 12);
    assert.equal(spectralConfirmed.at(-1).spectralClass, 'K');
    assert.equal(pack.systems[0].provenance.spectralClass.originalServerData, false);
    assert.equal(pack.systems[0].provenance.spectralClass.authority, 'manual_star_chart_pixel_color');
    assert.match(pack.systems[0].provenance.spectralClass.note, /exact original server stellar class is still unrecovered/);

    const virtualPackSystems = pack.systems.filter((system) => system.positionAuthority === 'MINIMAP_P3_VIRTUAL_OVERLAY');
    assert.equal(virtualPackSystems.length, 5);
    for (const system of virtualPackSystems) {
      assert.equal(system.provenance.position.authority, 'MINIMAP_P3_VIRTUAL_OVERLAY');
      assert.equal(system.provenance.position.originalServerData, false);
      assert.equal(system.provenance.spectralClass.authority, 'P3_VIRTUAL_DESIGN');
      assert.equal(system.provenance.spectralClass.originalServerData, false);
      assert.equal(system.planetAuthority, 'P3_VIRTUAL_DESIGN');
      assert.deepEqual([...new Set(system.planets.map((planet) => planet.authority))], ['P3_VIRTUAL_DESIGN']);
    }

    assert.equal(modelPlanets.length, 107);
    assert.equal(schema.facilities.length, 152);
    assert.equal(schema.planet_record.length, 221);
    assert.equal(schema.nation_record.length, 92);
    assert.ok(schema.nation_record.includes('Gクラス恒星'));
    assert.ok(schema.facilities.includes('宇宙艦隊司令部'));

    assert.match(economy._purpose, /procedural planet economy/);
    assert.match(economy._method, /deterministic per-planet seed/);
  } finally {
    source.close();
  }
});
