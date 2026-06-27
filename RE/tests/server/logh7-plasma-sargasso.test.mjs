import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  generatePlasmaCells,
  countPassableComponents,
  isPassableConnected,
  parsePassableCells,
  buildStrategicGalaxyGrid,
  TERRAIN_VALUE,
} from '../../src/server/logh7-login-protocol.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

// 0x0313 object inner에서 objectTable[v] = {byte0,byte1,byte2}를 읽는다.
function objectRecord(objectInner, v) {
  const op = objectInner.subarray(6);
  const off = 1 + v * 3;
  return { byte0: op.readUInt8(off), byte1: op.readUInt8(off + 1), byte2: op.readUInt8(off + 2) };
}

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

// 실 캐논 데이터를 한 번만 로드한다(절차 생성의 oracle 입력).
function loadGalaxyInputs() {
  const passableData = readJson('../../content/galaxy-passable-cells.json');
  const passable = parsePassableCells(passableData);
  const galaxy = readJson('../../content/galaxy.json');
  const systemCells = galaxy.systems
    .map((s) => [Number(s.canonCol), Number(s.canonRow)])
    .filter(([c, r]) => Number.isInteger(c) && Number.isInteger(r))
    .map(([c, r]) => `${c},${r}`);
  // 제국 88,25(2588) · 동맹 14,20(2014) — login-session FACTION_CAPITAL와 동일.
  const capitalCells = ['88,25', '14,20'];
  const corridorRows = passableData?._method?.oneCellCorridorRows ?? [12, 38];
  return { passable, systemCells, capitalCells, corridorRows };
}

// --- (a) 절차적 プラズマ嵐 생성 ---

test('plasma generation is deterministic: same seed -> identical cell set', () => {
  const { passable, systemCells, capitalCells, corridorRows } = loadGalaxyInputs();
  const opts = { passable, systemCells, capitalCells, corridorRows, seed: 0x10791, minCount: 12, maxCount: 24 };
  const a = generatePlasmaCells(opts);
  const b = generatePlasmaCells(opts);
  assert.deepEqual([...a].sort(), [...b].sort(), 'same seed reproduces the same plasma cells');
  // 다른 seed는 다른 셀(절차적·랜덤 확인).
  const c = generatePlasmaCells({ ...opts, seed: 4242 });
  assert.notDeepEqual([...a].sort(), [...c].sort(), 'a different seed produces a different layout');
});

test('plasma cell count stays in the designed band (12..24)', () => {
  const { passable, systemCells, capitalCells, corridorRows } = loadGalaxyInputs();
  // 여러 seed에서 개수 밴드를 확인(연결성 제약으로 일부 후보가 빠질 수 있어도 밴드 유지).
  for (const seed of [1, 7, 0x10791, 99991, 0xdeadbeef]) {
    const cells = generatePlasmaCells({ passable, systemCells, capitalCells, corridorRows, seed, minCount: 12, maxCount: 24 });
    assert.ok(cells.size >= 12 && cells.size <= 24, `seed ${seed}: ${cells.size} in 12..24`);
  }
});

test('plasma cells avoid corridors, the 80 system cells, and the faction capitals', () => {
  const { passable, systemCells, capitalCells, corridorRows } = loadGalaxyInputs();
  const cells = generatePlasmaCells({ passable, systemCells, capitalCells, corridorRows, seed: 0x10791 });
  const sysSet = new Set(systemCells);
  const capSet = new Set(capitalCells);
  const corridorRowSet = new Set(corridorRows.map(Number));
  assert.ok(cells.size > 0, 'at least one plasma cell was placed');
  for (const key of cells) {
    const [col, row] = key.split(',').map(Number);
    assert.ok(passable.has(key), `${key} stays inside the navigable mask`);
    assert.ok(!sysSet.has(key), `${key} does not overlap a system cell`);
    assert.ok(!capSet.has(key), `${key} does not overlap a capital cell`);
    assert.ok(!corridorRowSet.has(row), `${key} is not on a corridor row (${[...corridorRowSet]})`);
  }
});

test('plasma cells preserve connectivity: no region is sealed off (component count never grows)', () => {
  const { passable, systemCells, capitalCells, corridorRows } = loadGalaxyInputs();
  const base = countPassableComponents(passable, new Set());
  for (const seed of [1, 0x10791, 31337]) {
    const cells = generatePlasmaCells({ passable, systemCells, capitalCells, corridorRows, seed });
    const after = countPassableComponents(passable, cells);
    assert.ok(after <= base, `seed ${seed}: components after (${after}) <= base (${base})`);
  }
});

test('generatePlasmaCells degrades gracefully on empty / missing input', () => {
  assert.equal(generatePlasmaCells({ passable: new Set() }).size, 0);
  assert.equal(generatePlasmaCells({}).size, 0);
  assert.equal(generatePlasmaCells({ passable: null }).size, 0);
});

test('connectivity helpers: a synthetic single-component mask is connected; a cut breaks it', () => {
  // 한 줄(1행) 통로: 가운데 셀을 막으면 두 조각으로 갈라진다.
  const lane = parsePassableCells({ rowRangesByRow: { 5: [[0, 4]] } }); // (0..4, 5)
  assert.equal(countPassableComponents(lane, new Set()), 1);
  assert.equal(isPassableConnected(lane), true);
  const cut = new Set(['2,5']);
  assert.equal(countPassableComponents(lane, cut), 2, 'cutting the middle splits into 2 components');
  assert.equal(isPassableConnected(lane, cut), false);
});

test('generatePlasmaCells refuses a cell that would seal a region (synthetic chokepoint)', () => {
  // 두 방을 1셀 통로로 잇는 마스크. 통로 셀은 막으면 연결요소가 늘어 채택되지 않아야 한다.
  const mask = parsePassableCells({
    rowRangesByRow: {
      0: [[0, 2]],
      1: [[1, 1]], // chokepoint (1,1)
      2: [[0, 2]],
    },
  });
  // count를 충분히 크게 줘 모든 후보를 시도하게 한다.
  const cells = generatePlasmaCells({ passable: mask, seed: 5, count: 100 });
  assert.ok(!cells.has('1,1'), 'the lone chokepoint is never chosen');
  // 통로를 제외해도 연결요소가 늘지 않는다.
  assert.ok(countPassableComponents(mask, cells) <= countPassableComponents(mask, new Set()));
});

// --- (b) サルガッソ distinct label/value ---

test('terrain=true with sargassoCells marks サルガッソ (value 89, blocked, distinct from plasma)', () => {
  const passableCells = parsePassableCells({ rowRangesByRow: { 10: [[5, 9]] } });
  const sargassoCells = parsePassableCells({ rowRangesByRow: { 10: [[8, 8]] } }); // 레인 안 사르가소 1셀
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({ systems: [], passableCells, terrain: true, sargassoCells });
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[10 * 100 + 6], TERRAIN_VALUE.SPACE, 'lane cell stays navigable space');
  assert.equal(decoded[10 * 100 + 8], TERRAIN_VALUE.SARGASSO, 'sargasso cell overrides space with value 89');
  // サルガッソ는 진입 불가(class ∉ {1,3}) — distinct 오브젝트 값 89, 라벨 subId 2(P3, 航行不能 재사용).
  assert.equal(TERRAIN_VALUE.SARGASSO, 89);
  assert.deepEqual(objectRecord(objectInner, TERRAIN_VALUE.SARGASSO), { byte0: 2, byte1: 2, byte2: 0 }, 'サルガッソ: byte0=2 label, byte1=2 blocked');
  // 플라즈마 오브젝트(값 0)는 플라즈마 셀이 없으면 비어 있어야 한다(사르가소와 별개).
  assert.equal(objectRecord(objectInner, TERRAIN_VALUE.PLASMA).byte1, 0, 'plasma object stays empty (no plasma cells)');
});

test('plasma and sargasso coexist as distinct object records and distinct cell values', () => {
  const passableCells = parsePassableCells({ rowRangesByRow: { 10: [[1, 9]] } });
  const plasmaCells = parsePassableCells({ rowRangesByRow: { 10: [[3, 3]] } });
  const sargassoCells = parsePassableCells({ rowRangesByRow: { 10: [[7, 7]] } });
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({ systems: [], passableCells, terrain: true, plasmaCells, sargassoCells });
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[10 * 100 + 3], TERRAIN_VALUE.PLASMA, 'plasma cell = value 0');
  assert.equal(decoded[10 * 100 + 7], TERRAIN_VALUE.SARGASSO, 'sargasso cell = value 89');
  assert.notEqual(TERRAIN_VALUE.PLASMA, TERRAIN_VALUE.SARGASSO, 'plasma and sargasso are distinct wire values');
  // 두 지형 모두 진입불가지만 서로 다른 오브젝트 레코드.
  assert.deepEqual(objectRecord(objectInner, TERRAIN_VALUE.PLASMA), { byte0: 0, byte1: 2, byte2: 0 });
  assert.deepEqual(objectRecord(objectInner, TERRAIN_VALUE.SARGASSO), { byte0: 2, byte1: 2, byte2: 0 });
});

// --- 통합: 실 갤럭시 + 절차 플라즈마 + 사르가소 (stratTerrainEnabled 게이트 내 동작) ---

test('integration oracle: real galaxy + procedural plasma + sargasso satisfies the navigability gate', () => {
  const { passable, systemCells, capitalCells, corridorRows } = loadGalaxyInputs();
  const galaxy = readJson('../../content/galaxy.json');
  const plasma = generatePlasmaCells({ passable, systemCells, capitalCells, corridorRows, seed: 0x10791 });
  // 사르가소: 회랑(row12) 인근 비회랑 항행셀 고정 1셀(테스트 oracle용).
  const sargasso = new Set(['40,11']);
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({
    systems: galaxy.systems,
    fleetCell: { col: 50, row: 25 },
    fleetValue: 3,
    passableCells: passable,
    terrain: true,
    plasmaCells: plasma,
    sargassoCells: sargasso,
  });
  const { decoded, pos } = decodeCellGrid(cellInner);
  assert.equal(pos, 100 * 50);

  // 항행성 게이트(objectTable[V].byte1 ∈ {1,3})는 마스크에서 플라즈마/사르가소를 뺀 집합과 일치해야 한다.
  const blocked = new Set([...plasma, ...sargasso]);
  let navigable = 0;
  for (let row = 0; row < 50; row += 1) {
    for (let col = 0; col < 100; col += 1) {
      const v = decoded[row * 100 + col];
      const cls = objectRecord(objectInner, v).byte1;
      const gateNavigable = cls === 1 || cls === 3;
      const key = `${col},${row}`;
      const expectNavigable = passable.has(key) && !blocked.has(key);
      assert.equal(gateNavigable, expectNavigable, `cell (${col},${row}) value ${v} class ${cls}`);
      if (gateNavigable) navigable += 1;
    }
  }
  assert.equal(navigable, passable.size - blocked.size, 'navigable count = mask minus blocked terrain');
  // 플라즈마·사르가소 둘 다 별도 차단 오브젝트로 존재.
  assert.equal(objectRecord(objectInner, TERRAIN_VALUE.PLASMA).byte1, 2);
  assert.equal(objectRecord(objectInner, TERRAIN_VALUE.SARGASSO).byte1, 2);
});
