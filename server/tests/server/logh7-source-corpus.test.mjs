import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inventorySourceRoots,
  loadSourceRootRegistry,
  validateSourceRootRegistry,
} from '../../src/server/logh7-source-corpus.mjs';

test('source root registry names current evidence roots', () => {
  const registry = loadSourceRootRegistry();

	assert.equal(registry.id, 'logh7-source-roots');
	assert.ok(registry.roots.some((root) => root.id === 'archive-org-original-media'));
	assert.ok(registry.roots.some((root) => root.id === 'cd-extract-iso-filesystem'));
	assert.ok(registry.roots.some((root) => root.id === 'cd-extract-installshield-payload'));
	assert.ok(registry.roots.some((root) => root.id === 'installed-game-data'));
	assert.ok(registry.roots.some((root) => root.id === 'ghidra-evidence'));
});

test('source root registry rejects duplicate root ids', () => {
  assert.throws(
    () => validateSourceRootRegistry({
      id: 'logh7-source-roots',
      roots: [
        sourceRoot({ id: 'same', path: 'a' }),
        sourceRoot({ id: 'same', path: 'b' }),
      ],
    }),
    /duplicate source root id/,
  );
});

test('source inventory reports present and missing roots deterministically', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-source-corpus-'));
  try {
    mkdirSync(join(workspaceRoot, 'assets', 'nested'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'assets', 'A.MDX'), 'model', 'utf8');
    writeFileSync(join(workspaceRoot, 'assets', 'nested', 'Ship.TGA'), 'texture', 'utf8');

    const inventory = inventorySourceRoots({
      workspaceRoot,
      includeFiles: true,
      registry: {
        id: 'logh7-source-roots',
        roots: [
          sourceRoot({ id: 'assets', path: 'assets' }),
          sourceRoot({ id: 'missing', path: 'missing' }),
        ],
      },
    });

    const assets = inventory.roots.find((root) => root.id === 'assets');
    assert.equal(assets.status, 'present');
    assert.equal(assets.fileCount, 2);
    assert.deepEqual(assets.extensions, { mdx: 1, tga: 1 });
    assert.deepEqual(
      assets.files.map((file) => file.path),
      ['A.MDX', 'nested/Ship.TGA'],
    );
    assert.match(assets.files[0].sha1, /^[0-9a-f]{40}$/);

    const missing = inventory.roots.find((root) => root.id === 'missing');
    assert.equal(missing.status, 'missing');
    assert.equal(missing.fileCount, 0);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function sourceRoot(overrides = {}) {
  return {
    id: 'root',
    path: 'root',
    relativeTo: 'repo',
    provenance: 'P0-test',
    status: 'test',
    use: 'test fixture',
    ...overrides,
  };
}
