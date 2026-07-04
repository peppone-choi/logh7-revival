import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildMedalMiningCatalog,
  writeMedalMiningCatalog,
} from '../../src/server/logh7-medal-catalog.mjs';

test('medal mining catalog ties all 52 medals to original names and image pool', () => {
  const catalog = buildMedalMiningCatalog();

  assert.equal(catalog.id, 'logh7-medal-mining-catalog');
  assert.equal(catalog.summary.medalCount, 52);
  assert.deepEqual(catalog.summary.sourceIdRange, [767, 818]);
  assert.equal(catalog.summary.japaneseMsgDatRecordCount, 52);
  assert.equal(catalog.summary.localizedDatTableRecordCount, 52);
  assert.deepEqual(catalog.summary.factions.empire, {
    count: 26,
    idRange: [767, 792],
    bitRange: [0, 25],
  });
  assert.deepEqual(catalog.summary.factions.alliance, {
    count: 26,
    idRange: [793, 818],
    bitRange: [26, 51],
  });

  assert.equal(catalog.summary.originalIconPool.stemCount, 15);
  assert.equal(catalog.summary.originalIconPool.pngCount, 15);
  assert.equal(catalog.summary.originalIconPool.tgaCount, 15);
  assert.equal(
    catalog.summary.generationPolicy.imperialMedals,
    'do-not-generate-while-original-m_f001-m_f015-icon-pool-exists',
  );

  const first = catalog.medals[0];
  assert.equal(first.names.ja, '大双頭鷲勲章');
  assert.equal(first.names.ko, '대쌍두독수리훈장');
  assert.equal(first.source.roster.nameJaMatchesMsgDat, true);
  assert.equal(first.source.roster.nameKoMatchesLocalizedTable, true);
  assert.equal(first.originalAsset.status, 'original-icon-pool-present');
  assert.equal(first.originalAsset.files.length, 2);
  assert(first.originalAsset.files.every((asset) => asset.image.width === 80));
  assert(first.originalAsset.files.every((asset) => asset.image.height === 80));

  // client-unity/ (and its ArtSource reference images) was permanently removed 2026-07-04 (G070);
  // the imperial emblem reference now reports missing rather than a live sha256/dimensions read.
  assert.equal(catalog.imperialEmblem.exists, false);
});

test('medal mining catalog can be written as a generated artifact', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'logh7-medals-'));
  const out = join(tmp, 'catalog.json');

  writeMedalMiningCatalog(out, buildMedalMiningCatalog());

  const written = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(written.summary.medalCount, 52);
  assert.equal(written.medals.at(-1).names.ja, '参謀記章');
});
