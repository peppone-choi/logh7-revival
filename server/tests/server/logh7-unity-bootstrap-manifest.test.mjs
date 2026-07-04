import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildUnityBootstrapManifest,
  writeUnityBootstrapManifest,
} from '../../src/server/logh7-unity-bootstrap-manifest.mjs';

test('Unity bootstrap manifest locks CD-first authority and EXE oracle-only runtime policy', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-unity-bootstrap-'));
  try {
    writeJson(join(workspaceRoot, 'server/content/generated/logh7-cd-media-manifest.json'), {
      id: 'logh7-cd-media',
      media: { status: 'verified' },
      extraction: { installShieldRoot: { fileCount: 2207 } },
    });
    writeJson(join(workspaceRoot, 'server/content/generated/logh7-hidden-data-watchlist.json'), {
      id: 'logh7-hidden-data-watchlist',
      status: 'reported',
    });

    const manifest = buildUnityBootstrapManifest({ workspaceRoot });

    assert.equal(manifest.id, 'logh7-unity-bootstrap-manifest');
    assert.equal(manifest.unity.version, '6000.5.2f1');
    assert.equal(manifest.authority.source, 'verified-archive-bin-cue');
    assert.equal(manifest.runtime.originalExePolicy, 'oracle-only-not-product-runtime');
    assert.equal(manifest.canonicalPromotion.defaultState, 'suspect-until-cross-checked');
    assert.equal(manifest.remasterPacks.policy, 'optional-reversible-manifest-driven');
    assert.ok(manifest.generatedInputs.some((input) => input.id === 'logh7-cd-media'));
    assert.ok(manifest.generatedInputs.some((input) => input.id === 'logh7-runtime-boundary'));
    assert.ok(manifest.unity.streamingAssetsTarget.endsWith('client-unity/Assets/StreamingAssets/logh7/logh7-unity-bootstrap-manifest.json'));
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('Unity bootstrap manifest records missing generated inputs without promotion', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-unity-bootstrap-'));
  try {
    const manifest = buildUnityBootstrapManifest({ workspaceRoot });
    const cdMedia = manifest.generatedInputs.find((input) => input.id === 'logh7-cd-media');

    assert.equal(cdMedia.status, 'missing');
    assert.equal(cdMedia.canonicalState, 'suspect-input');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('Unity bootstrap manifest writes the server generated copy', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'logh7-unity-bootstrap-'));
  try {
    const manifest = buildUnityBootstrapManifest({ workspaceRoot });
    const outPath = join(workspaceRoot, 'server/content/generated/logh7-unity-bootstrap-manifest.json');

    writeUnityBootstrapManifest({ outPath, manifest });

    assert.equal(manifest.id, 'logh7-unity-bootstrap-manifest');
    assert.deepEqual(JSON.parse(readFileSync(outPath, 'utf8')), manifest);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
