import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  catalogMdxDirectory,
  parseMdxHeader,
  parseMdxNodeNames,
} from '../../src/server/logh7-mdx-catalog.mjs';

test('MDX parser reads header pairs and stride-based node names', () => {
  const bytes = buildMdxFixture(['star_01_G', 'star_02_O', 'star_03_F']);

  assert.deepEqual(parseMdxHeader(bytes).slice(0, 2), [
    { slot: 0, pointer: 0x1e300a0, count: 3 },
    { slot: 1, pointer: 0x1e30370, count: 3 },
  ]);
  assert.deepEqual(parseMdxNodeNames(bytes, 3), [
    { index: 0, offset: 0x58, name: 'star_01_G' },
    { index: 1, offset: 0x140, name: 'star_02_O' },
    { index: 2, offset: 0x228, name: 'star_03_F' },
  ]);
});

test('MDX catalog walks model root and summarizes categories', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-mdx-catalog-'));
  try {
    const mdxRoot = join(workspaceRoot, 'data', 'model');
    mkdirSync(join(mdxRoot, 'strategy'), { recursive: true });
    mkdirSync(join(mdxRoot, 'Effect'), { recursive: true });
    writeFileSync(join(mdxRoot, 'strategy', 'Null_galaxy.mdx'), buildMdxFixture(['star_01_G']));
    writeFileSync(join(mdxRoot, 'Effect', 'beam.mdx'), buildMdxFixture(['beam02:Layer1 (1)']));

    const catalog = catalogMdxDirectory({ mdxRoot, workspaceRoot });

    assert.equal(catalog.status, 'present');
    assert.equal(catalog.fileCount, 2);
    assert.deepEqual(catalog.categories, { Effect: 1, strategy: 1 });
    assert.deepEqual(
      catalog.files.map((file) => file.path),
      ['Effect/beam.mdx', 'strategy/Null_galaxy.mdx'],
    );
    assert.equal(catalog.files[1].nodeNames[0].name, 'star_01_G');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('MDX catalog reports a missing root without throwing', () => {
  const catalog = catalogMdxDirectory({ mdxRoot: 'missing-mdx-root' });

  assert.equal(catalog.status, 'missing');
  assert.equal(catalog.fileCount, 0);
  assert.deepEqual(catalog.files, []);
});

function buildMdxFixture(names) {
  const bytes = Buffer.alloc(0x58 + names.length * 0xe8 + 32);
  const headerPairs = [
    [0x1e300a0, names.length],
    [0x1e30370, names.length],
  ];
  for (let slot = 0; slot < 10; slot += 1) {
    const [pointer, count] = headerPairs[slot] ?? [0, 0];
    bytes.writeUInt32LE(pointer, slot * 8);
    bytes.writeUInt32LE(count, slot * 8 + 4);
  }
  names.forEach((name, index) => {
    bytes.write(name, 0x58 + index * 0xe8, 'ascii');
  });
  return bytes;
}
