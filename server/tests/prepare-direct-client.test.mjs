import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { applyPatchManifest } from '../../tools/patch/exe-patch.mjs';
import { prepareDirectClient } from '../../tools/live/prepare_direct_client.mjs';

const manifestPath = fileURLToPath(
  new URL('../content/client/logh7-direct-client-patch.json', import.meta.url),
);
const installedExePath = fileURLToPath(
  new URL('../../artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe', import.meta.url),
);
const sourceSha256 = '24d79d90e1618309f05932156787e5a140d5f6d57ce008f6c09b00360da3ab3b';
const finalSha256 = '5bdd64f1f9a8cca93f5b1002291d6a2c7e8f5ce555b062b8cb48337b96277d89';

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function buildFixture(manifest) {
  const size = Math.max(...manifest.patches.map(
    (patch) => patch.offset + Buffer.from(patch.originalBytes, 'hex').length,
  ));
  const source = Buffer.alloc(size);
  for (const patch of manifest.patches) {
    Buffer.from(patch.originalBytes, 'hex').copy(source, patch.offset);
  }
  const patched = Buffer.from(source);
  for (const patch of manifest.patches) {
    Buffer.from(patch.patchedBytes, 'hex').copy(patched, patch.offset);
  }
  return { patched, source };
}

test('direct client manifest pins the 10 guarded post-resource patches', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.id, 'logh7-direct-client-patch');
  assert.equal(manifest.targetExe.sha256, sourceSha256);
  assert.equal(manifest.expectedPatchedSha256, finalSha256);
  assert.equal(manifest.patches.length, 10);
  assert.ok(manifest.patches.every((patch) => patch.sourceExeSha256 === sourceSha256));
  assert.deepEqual(manifest.patches.map((patch) => ({
    id: patch.id,
    offset: patch.offset,
    originalBytes: patch.originalBytes,
    patchedBytes: patch.patchedBytes,
  })), [
    { id: 'strategy-hud-right-tab-member-list-label', offset: 0xfcdb5, originalBytes: '6a65b900742102e84f520200', patchedBytes: '83c404b890525d0090909090' },
    { id: 'strategy-hud-left-tab-label-group', offset: 0xfce7f, originalBytes: '6a65b900742102e885510200', patchedBytes: '6a60b900742102e885510200' },
    { id: 'common-dialog-confirm-label-group', offset: 0x16f304, originalBytes: '6a67b900742102e8002dfbff', patchedBytes: '6a62b900742102e8002dfbff' },
    { id: 'common-dialog-cancel-label-group', offset: 0x16f39a, originalBytes: '6a67b90074210289442430e8662cfbff', patchedBytes: '6a62b90074210289442430e8662cfbff' },
    { id: 'strategy-command-ui-confirm-label-group', offset: 0x1786be, originalBytes: '6a67b900742102e84699faff', patchedBytes: '6a62b900742102e84699faff' },
    { id: 'strategy-command-ui-cancel-label-group', offset: 0x17875c, originalBytes: '6a67b900742102e8a898faff', patchedBytes: '6a62b900742102e8a898faff' },
    { id: 'strategy-command-ui-remaining-count-label-group', offset: 0x1787fb, originalBytes: '6a67b900742102e80998faff', patchedBytes: '6a62b900742102e80998faff' },
    { id: 'strategy-command-ui-minimum-rank-label-group', offset: 0x178a23, originalBytes: '6a67b900742102e8e195faff', patchedBytes: '6a62b900742102e8e195faff' },
    { id: 'strategy-hud-member-list-label-data', offset: 0x1d5290, originalBytes: 'cccccccccccccccccccccccccccccc', patchedBytes: '83818393836f815b838a8358836700' },
    { id: 'direct-hangul-menu-mode', offset: 0x241bc0, originalBytes: '1e', patchedBytes: '1f' },
  ]);
  assert.match(manifest.patches.at(-1).reason, /FUN_00641b90/);
  assert.match(manifest.patches.at(-1).reason, /0x641BC0/);
  assert.match(manifest.patches.at(-1).reason, /0x241BC0/);
  assert.match(manifest.patches.at(-1).reason, /win\.ini/);
  assert.match(manifest.patches.at(-1).reason, /직접 실행/);
});

test('prepareDirectClient patches the requested EXE in place and reuses the final hash', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fixture = buildFixture(manifest);
  const dir = await mkdtemp(join(tmpdir(), 'logh7-direct-client-'));
  const exePath = join(dir, 'g7mtclient.exe');
  const fixtureManifestPath = join(dir, 'manifest.json');
  const fixtureManifest = structuredClone(manifest);
  fixtureManifest.targetExe.sha256 = sha256(fixture.source);
  fixtureManifest.expectedPatchedSha256 = sha256(fixture.patched);
  fixtureManifest.patches = fixtureManifest.patches.map((patch) => ({
    ...patch,
    sourceExeSha256: fixtureManifest.targetExe.sha256,
  }));
  await writeFile(exePath, fixture.source);
  await writeFile(fixtureManifestPath, `${JSON.stringify(fixtureManifest, null, 2)}\n`);

  const applied = await prepareDirectClient({ manifestPath: fixtureManifestPath, exePath });
  assert.equal(applied.mode, 'applied');
  assert.equal(applied.path, exePath);
  assert.equal(applied.patchCount, 10);
  assert.deepEqual(await readFile(exePath), fixture.patched);

  const reused = await prepareDirectClient({ manifestPath: fixtureManifestPath, exePath });
  assert.equal(reused.mode, 'reused');
  assert.equal(reused.sha256, sha256(fixture.patched));
  assert.deepEqual(await readFile(exePath), fixture.patched);
});

test('prepareDirectClient fails closed on an unknown EXE hash', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fixture = buildFixture(manifest);
  fixture.source[0] ^= 0xff;
  const dir = await mkdtemp(join(tmpdir(), 'logh7-direct-client-bad-'));
  const exePath = join(dir, 'g7mtclient.exe');
  await writeFile(exePath, fixture.source);

  await assert.rejects(
    prepareDirectClient({ manifestPath, exePath }),
    /exe hash mismatch/,
  );
  assert.deepEqual(await readFile(exePath), fixture.source);
});

test('installed post-resource EXE dry-run produces the pinned final hash when present', async (t) => {
  try {
    await access(installedExePath, constants.R_OK);
  } catch {
    t.skip('installed g7mtclient.exe is unavailable');
    return;
  }
  const current = await readFile(installedExePath);
  if (sha256(current) !== sourceSha256) {
    t.skip('installed g7mtclient.exe is not the post-resource source build');
    return;
  }
  const report = await applyPatchManifest(manifestPath, installedExePath, installedExePath, {
    dryRun: true,
  });
  assert.equal(report.patchCount, 10);
  assert.equal(report.sha256, finalSha256);
  assert.equal(sha256(await readFile(installedExePath)), sourceSha256);
});
