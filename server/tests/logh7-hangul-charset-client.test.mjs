// logh7-hangul-charset-client.test.mjs — 한글 charset 원본 EXE 제자리 패치 회귀

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  prepareHangulCharsetClient,
  runCli,
} from '../../tools/live/prepare_hangul_charset_client.mjs';

const canonicalManifestPath = fileURLToPath(
  new URL('../content/client/logh7-hangul-charset-patch.json', import.meta.url),
);

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function buildSparseFixture(manifest) {
  const size = Math.max(
    ...manifest.patches.map((patch) => patch.offset + Buffer.from(patch.originalBytes, 'hex').length),
  );
  const fixture = Buffer.alloc(size);
  for (const patch of manifest.patches) {
    Buffer.from(patch.originalBytes, 'hex').copy(fixture, patch.offset);
  }
  return fixture;
}

test('prepareHangulCharsetClient는 CP949 자산 확인 후에만 제자리 패치하고 재사용한다', async () => {
  const manifest = JSON.parse(await readFile(canonicalManifestPath, 'utf8'));
  const fixture = buildSparseFixture(manifest);
  const fixtureHash = hash(fixture);
  const patchedFixture = Buffer.from(fixture);
  for (const patch of manifest.patches) {
    Buffer.from(patch.patchedBytes, 'hex').copy(patchedFixture, patch.offset);
  }
  manifest.targetExe.sha256 = fixtureHash;
  manifest.expectedPatchedSha256 = hash(patchedFixture);
  manifest.patches = manifest.patches.map((patch) => ({
    ...patch,
    sourceExeSha256: fixtureHash,
  }));

  const dir = await mkdtemp(join(tmpdir(), 'logh7-hangul-in-place-'));
  const exePath = join(dir, 'g7mtclient.exe');
  const manifestPath = join(dir, 'manifest.json');
  await writeFile(exePath, fixture);
  await writeFile(manifestPath, JSON.stringify(manifest));

  await assert.rejects(
    runCli(['--manifest', manifestPath, '--exe', exePath]),
    /--cp949-assets/,
  );
  assert.deepEqual(await readFile(exePath), fixture);

  const first = await prepareHangulCharsetClient({
    manifestPath,
    sourcePath: exePath,
    cp949AssetsReady: true,
  });
  assert.equal(first.mode, 'applied');
  assert.equal(first.path, exePath);
  assert.equal(hash(await readFile(exePath)), manifest.expectedPatchedSha256);

  const second = await prepareHangulCharsetClient({
    manifestPath,
    sourcePath: exePath,
    cp949AssetsReady: true,
  });
  assert.equal(second.mode, 'reused');
  assert.equal(second.path, exePath);
  assert.equal(hash(await readFile(exePath)), manifest.expectedPatchedSha256);
});
