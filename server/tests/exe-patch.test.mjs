import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { test } from 'node:test';
import {
  applyPatchManifest,
  rollbackPatchManifest,
  validatePatchManifest,
} from '../../tools/patch/exe-patch.mjs';

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../../tools/patch/exe-patch.mjs', import.meta.url));

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function makeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-exe-patch-'));
  const exePath = join(dir, 'fixture.exe');
  const buffer = Buffer.from([0xaa, 0xbb, 0x10, 0x20, 0xcc, 0xdd]);
  await writeFile(exePath, buffer);
  return { dir, exePath, buffer };
}

function baseManifest(buffer, overrides = {}) {
  const sourceExeSha256 = overrides.sourceExeSha256 ?? hash(buffer);
  return {
    id: 'fixture-manifest',
    schemaVersion: 1,
    targetExe: {
      name: 'fixture.exe',
      sha256: overrides.targetSha256 ?? sourceExeSha256,
      imageBase: null,
    },
    patches: [
      {
        id: 'patch-1',
        sourceExeSha256,
        addressKind: 'offset',
        offset: 2,
        originalBytes: overrides.originalBytes ?? '1020',
        patchedBytes: overrides.patchedBytes ?? '3344',
        rollbackBytes: overrides.rollbackBytes ?? '1020',
        reason: 'fixture patch',
      },
    ],
  };
}

test('validate rejects a source hash mismatch', async () => {
  const { exePath, buffer } = await makeFixture();
  await assert.rejects(
    () => validatePatchManifest(baseManifest(buffer, { targetSha256: '00' }), exePath),
    /source exe hash mismatch/,
  );
});

test('validate rejects an original-byte mismatch', async () => {
  const { exePath, buffer } = await makeFixture();
  const manifest = baseManifest(buffer, { originalBytes: '1122' });
  await assert.rejects(
    () => validatePatchManifest(manifest, exePath),
    /originalBytes mismatch/,
  );
});

test('validate rejects same-length violations', async () => {
  const { exePath, buffer } = await makeFixture();
  const manifest = baseManifest(buffer, { patchedBytes: '334455' });
  await assert.rejects(
    () => validatePatchManifest(manifest, exePath),
    /must have the same length/,
  );
});

test('dry-run validate does not touch the file', async () => {
  const { exePath, buffer } = await makeFixture();
  const manifest = baseManifest(buffer);
  const before = await readFile(exePath);
  const report = await validatePatchManifest(manifest, exePath, { dryRun: true });
  const after = await readFile(exePath);
  assert.equal(report.mode, 'dry-run');
  assert.equal(after.toString('hex'), before.toString('hex'));
});

test('CLI validate dry-run works end to end', async () => {
  const { exePath, buffer } = await makeFixture();
  const manifest = baseManifest(buffer);
  const manifestPath = join(await mkdtemp(join(tmpdir(), 'logh7-manifest-')), 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const { stdout } = await execFileAsync(process.execPath, [cliPath, 'validate', '--manifest', manifestPath, '--exe', exePath, '--dry-run'], {
    encoding: 'utf8',
  });
  assert.match(stdout, /validated 1 patch/);
});

test('apply and rollback round-trip a temp copy', async () => {
  const { exePath, buffer } = await makeFixture();
  const manifest = baseManifest(buffer);
  const dir = await mkdtemp(join(tmpdir(), 'logh7-roundtrip-'));
  const patchedPath = join(dir, 'patched.exe');
  const rolledBackPath = join(dir, 'rolled-back.exe');

  const applyReport = await applyPatchManifest(manifest, exePath, patchedPath);
  assert.equal(applyReport.patchCount, 1);
  assert.equal((await readFile(patchedPath)).toString('hex'), 'aabb3344ccdd');

  const rollbackReport = await rollbackPatchManifest(manifest, patchedPath, rolledBackPath);
  assert.equal(rollbackReport.patchCount, 1);
  assert.equal((await readFile(rolledBackPath)).toString('hex'), buffer.toString('hex'));
});

test('원자 쓰기가 기존 파일을 먼저 삭제하지 않는다', async () => {
  const source = await readFile(cliPath, 'utf8');
  const start = source.indexOf('async function writeFileAtomic(');
  const end = source.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source.slice(start, end), /unlink\(filePath\)/);
});

test('Windows rename 교체 성공 시 기존 파일만 남는다', async () => {
  const { dir, exePath, buffer } = await makeFixture();
  await applyPatchManifest(baseManifest(buffer), exePath);
  assert.equal((await readFile(exePath)).toString('hex'), 'aabb3344ccdd');
  assert.deepEqual(await readdir(dir), ['fixture.exe']);
});

test('Windows rename 교체 실패 시 원본을 보존하고 temp를 지운다', {
  skip: process.platform !== 'win32',
}, async () => {
  const { dir, exePath, buffer } = await makeFixture();
  await chmod(exePath, 0o444);
  try {
    await assert.rejects(() => applyPatchManifest(baseManifest(buffer), exePath), /EPERM/);
    assert.equal((await readFile(exePath)).toString('hex'), buffer.toString('hex'));
    assert.deepEqual(await readdir(dir), ['fixture.exe']);
  } finally {
    await chmod(exePath, 0o666);
  }
});
