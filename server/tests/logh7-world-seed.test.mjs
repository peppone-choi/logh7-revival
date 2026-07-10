// 정적 세계 시드 로더 검증 — 스키마 확장·멱등·provenance·카탈로그 조회
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openDatabase } from '../src/infrastructure/persistence/Database.mjs';
import {
  loadWorldSeed,
  DEFAULT_SEED_DIR,
} from '../src/infrastructure/persistence/WorldSeedLoader.mjs';
import { createWorldCatalog } from '../src/infrastructure/persistence/WorldCatalog.mjs';
import { createGameApplication } from '../src/application/GameApplication.mjs';

async function freshDb() {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-seed-'));
  const dbPath = join(dir, 't.sqlite');
  const connection = openDatabase({ dbPath });
  return { dir, dbPath, connection };
}

test('world seed: loads static catalogs with canonical counts', async () => {
  const { dir, connection } = await freshDb();
  try {
    const result = loadWorldSeed({ connection, seedDir: DEFAULT_SEED_DIR });
    assert.equal(result.skipped, false);
    const c = result.counts;
    assert.equal(c.galaxy_systems, 85, 'galaxy systems');
    assert.equal(c.ships, 63, 'ships');
    assert.equal(c.fortresses, 6, 'fortresses');
    assert.equal(c.factions, 3, 'factions');
    assert.equal(c.rank_table, 21, 'ranks');
    assert.equal(c.abilities, 8, 'abilities');
    assert.equal(c.canon_characters, 99, 'canon characters');
    assert.equal(c.initial_deployment, 24, 'initial deployment (12 empire + 12 alliance)');
  } finally {
    connection.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('world seed: cell 2588 anchors to ヴァルハラ; catalog reads join map', async () => {
  const { dir, connection } = await freshDb();
  try {
    loadWorldSeed({ connection, seedDir: DEFAULT_SEED_DIR });
    const catalog = createWorldCatalog(connection);

    const valhalla = catalog.getSystemByCell(2588);
    assert.ok(valhalla, 'system at cell 2588 exists');
    assert.equal(valhalla.system_name, 'ヴァルハラ');

    const systems = catalog.getGalaxySystems();
    assert.equal(systems.length, 85);

    const ships = catalog.getShips();
    assert.equal(ships.length, 63);
    // pools_json must be preserved as parseable stat block
    const ss75 = ships.find((s) => s.ship_key === 'SS75');
    assert.ok(ss75);
    assert.equal(typeof ss75.pools.maxArmor, 'number');

    const dep = catalog.getInitialDeployment();
    assert.equal(dep.length, 24);
    const impUnit1 = dep.find((d) => d.faction === 'empire' && d.unit === 1);
    assert.equal(impUnit1.cell, 2588, 'imperial flagship deploys at Valhalla cell');

    // initial deployment cells must resolve against galaxy_systems (shared source)
    const deployedCells = dep.filter((d) => d.cell != null).map((d) => d.cell);
    const known = new Set(systems.map((s) => s.cell));
    for (const cell of deployedCells) {
      assert.ok(known.has(cell), `deployment cell ${cell} present in galaxy_systems`);
    }
  } finally {
    connection.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('world seed: rerun is idempotent and preserves provenance', async () => {
  const { dir, connection } = await freshDb();
  try {
    const first = loadWorldSeed({ connection, seedDir: DEFAULT_SEED_DIR });
    assert.equal(first.skipped, false);

    const second = loadWorldSeed({ connection, seedDir: DEFAULT_SEED_DIR });
    assert.equal(second.skipped, true, 'unchanged manifest skips reload');
    assert.deepEqual(second.counts, first.counts, 'counts stable across reruns');

    const forced = loadWorldSeed({ connection, seedDir: DEFAULT_SEED_DIR, force: true });
    assert.equal(forced.skipped, false, 'force reloads');
    assert.deepEqual(forced.counts, first.counts, 'force reload yields identical counts');

    const catalog = createWorldCatalog(connection);
    const prov = catalog.getProvenance();
    const galaxyProv = prov.find((p) => p.catalog === 'galaxy-systems.json');
    assert.ok(galaxyProv, 'galaxy provenance row exists');
    assert.match(galaxyProv.provenance, /galaxy\.json/);
    assert.equal(galaxyProv.row_count, 85);
  } finally {
    connection.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('world seed: GameApplication boots with static world and exposes catalog', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-seedapp-'));
  const dbPath = join(dir, 't.sqlite');
  const app = createGameApplication({ dbPath });
  try {
    const counts = app.worldCatalog.counts();
    assert.equal(counts.galaxy_systems, 85);
    assert.equal(counts.canon_characters, 99);

    const q = await app.dispatchQuery({ type: 'GetGalaxySystems' });
    assert.equal(q.systems.length, 85);

    const dep = await app.dispatchQuery({ type: 'GetInitialDeployment' });
    assert.equal(dep.deployment.length, 24);

    // reopen — seed loader must not duplicate on second boot
    app.close();
    const app2 = createGameApplication({ dbPath });
    try {
      assert.equal(app2.worldCatalog.counts().galaxy_systems, 85);
    } finally {
      app2.close();
    }
  } finally {
    try { app.close(); } catch { /* already closed */ }
    await rm(dir, { recursive: true, force: true });
  }
});
