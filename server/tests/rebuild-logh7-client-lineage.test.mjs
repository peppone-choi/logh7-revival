import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  DEFAULT_PATHS,
  PRODUCTION_CONTRACT,
  rebuildLogh7ClientLineage,
} from '../../tools/live/rebuild_logh7_client_lineage.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LIVE_QA_MODULE = resolve(ROOT, 'tools/live/logh7_wine_live_qa.py');
const EXE_PATCH_TOOL = resolve(ROOT, 'tools/patch/exe-patch.mjs');
const BUNDLED_PYTHON = '/Users/apple/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(path) {
  return sha256(await readFile(path));
}

async function findPython() {
  const candidates = [process.env.LOGH7_TEST_PYTHON, BUNDLED_PYTHON, '/usr/bin/python3']
    .filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate, fsConstants.X_OK);
      return realpath(candidate);
    } catch {
      // 다음 절대 경로 후보를 확인한다.
    }
  }
  return null;
}

function makePeFixture() {
  const buffer = Buffer.alloc(1024);
  buffer.write('MZ', 0, 'ascii');
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.write('PE\0\0', 0x80, 'binary');
  buffer.writeUInt32LE(0x40779eb8, 0x88);
  buffer.writeUInt16LE(0xe0, 0x94);
  buffer.writeUInt16LE(0x10b, 0x98);
  buffer.writeUInt32LE(0x400000, 0x98 + 28);
  for (const [offset, byte] of [[0x180, 0xaa], [0x181, 0xbb], [0x182, 0xcc], [0x183, 0xdd], [0x184, 0xee]]) {
    buffer[offset] = byte;
  }
  return buffer;
}

function replaceByte(buffer, offset, value) {
  const output = Buffer.from(buffer);
  output[offset] = value;
  return output;
}

function oneByteManifest({ id, source, output, offset, original, patched }) {
  const sourceSha256 = sha256(source);
  return {
    id,
    schemaVersion: 1,
    targetExe: { name: 'G7MTClient.exe', sha256: sourceSha256, imageBase: 0x400000 },
    expectedPatchedSha256: sha256(output),
    patches: [{
      id: `${id}-patch`,
      sourceExeSha256: sourceSha256,
      addressKind: 'offset',
      offset,
      originalBytes: original.toString(16).padStart(2, '0'),
      patchedBytes: patched.toString(16).padStart(2, '0'),
      rollbackBytes: original.toString(16).padStart(2, '0'),
      reason: '합성 계보 fixture',
    }],
  };
}

const FAKE_RESOURCE_PATCHER = String.raw`#!/usr/bin/env python3
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
sub = parser.add_subparsers(dest="command", required=True)
patch = sub.add_parser("patch")
patch.add_argument("--exe", required=True)
patch.add_argument("--out", required=True)
patch.add_argument("--map", required=True)
patch.add_argument("--expect-sha256", required=True)
args = parser.parse_args()

source = Path(args.exe)
output = Path(args.out)
spec = json.loads(Path(args.map).read_text(encoding="utf-8"))
raw = bytearray(source.read_bytes())
source_sha = hashlib.sha256(raw).hexdigest()
if source_sha != args.expect_sha256.lower():
    raise SystemExit("source hash mismatch")
offset = int(spec["offset"])
if raw[offset] != int(spec["original"]):
    raise SystemExit("source byte mismatch")
raw[offset] = int(spec["patched"])
output.write_bytes(raw)
if spec.get("mode") == "exit-after-write":
    raise SystemExit(7)
output_sha = hashlib.sha256(raw).hexdigest()
print(json.dumps({
    "sourceSha256": source_sha,
    "outputSha256": output_sha,
    "applied": 1,
    "skippedMismatch": 0,
    "verifiedPresent": 1,
    "verifyOk": True,
}))
`;

async function createFixture(t, { resourceMode = 'ok' } = {}) {
  const pythonPath = await findPython();
  if (!pythonPath) {
    t.skip('absolute Python interpreter is unavailable');
    return null;
  }
  const root = await mkdtemp(join(tmpdir(), 'logh7-lineage-test-'));
  t.after(() => rm(root, { force: true, recursive: true }));
  const source = makePeFixture();
  const loopback = replaceByte(source, 0x180, 0x11);
  const canonical = replaceByte(loopback, 0x181, 0x22);
  const resources = replaceByte(canonical, 0x182, 0x33);
  const direct = replaceByte(resources, 0x183, 0x44);
  const highResolution = replaceByte(direct, 0x184, 0x55);
  const sourcePath = join(root, 'source.exe');
  const patcherPath = join(root, 'fake_rsrc_patch.py');
  const mapPath = join(root, 'resource-map.json');
  const manifestPaths = {
    loopbackManifestPath: join(root, 'loopback.json'),
    canonicalManifestPath: join(root, 'canonical.json'),
    directManifestPath: join(root, 'direct.json'),
    highResolutionManifestPath: join(root, '1080p.json'),
  };
  const manifests = {
    loopbackManifestPath: oneByteManifest({ id: 'loopback', source, output: loopback, offset: 0x180, original: 0xaa, patched: 0x11 }),
    canonicalManifestPath: oneByteManifest({ id: 'canonical', source: loopback, output: canonical, offset: 0x181, original: 0xbb, patched: 0x22 }),
    directManifestPath: oneByteManifest({ id: 'direct', source: resources, output: direct, offset: 0x183, original: 0xdd, patched: 0x44 }),
    highResolutionManifestPath: oneByteManifest({ id: '1080p', source: direct, output: highResolution, offset: 0x184, original: 0xee, patched: 0x55 }),
  };
  await Promise.all([
    writeFile(sourcePath, source),
    writeFile(patcherPath, FAKE_RESOURCE_PATCHER, { mode: 0o755 }),
    writeFile(mapPath, `${JSON.stringify({ offset: 0x182, original: 0xcc, patched: 0x33, mode: resourceMode })}\n`),
    ...Object.entries(manifestPaths).map(([key, path]) => writeFile(path, `${JSON.stringify(manifests[key], null, 2)}\n`)),
  ]);
  return {
    root,
    pythonPath,
    sourcePath,
    outputRoot: join(root, 'lineage-output'),
    patcherPath,
    mapPath,
    manifestPaths,
    source,
    final: highResolution,
  };
}

async function buildOptions(fixture) {
  const loopback = replaceByte(fixture.source, 0x180, 0x11);
  const canonical = replaceByte(loopback, 0x181, 0x22);
  const resources = replaceByte(canonical, 0x182, 0x33);
  const direct = replaceByte(resources, 0x183, 0x44);
  return {
    sourcePath: fixture.sourcePath,
    outputRoot: fixture.outputRoot,
    pythonPath: fixture.pythonPath,
    ...fixture.manifestPaths,
    resourcePatcherPath: fixture.patcherPath,
    resourceMapPath: fixture.mapPath,
    sourceSha256: sha256(fixture.source),
    loopbackOutputSha256: sha256(loopback),
    canonicalOutputSha256: sha256(canonical),
    resourceOutputSha256: sha256(resources),
    directOutputSha256: sha256(direct),
    finalSha256: sha256(fixture.final),
    loopbackPatchCount: 1,
    canonicalPatchCount: 1,
    resourcePatchCount: 1,
    directPatchCount: 1,
    highResolutionPatchCount: 1,
    expectedExePatchToolSha256: await sha256File(EXE_PATCH_TOOL),
    expectedResourcePatcherSha256: await sha256File(fixture.patcherPath),
    expectedResourceMapSha256: await sha256File(fixture.mapPath),
  };
}

test('production manifests pin bd192 → 2848 → 9c97 with the strict 13-byte loopback signature', async () => {
  const loopback = JSON.parse(await readFile(DEFAULT_PATHS.loopbackManifestPath, 'utf8'));
  const canonical = JSON.parse(await readFile(DEFAULT_PATHS.canonicalManifestPath, 'utf8'));
  assert.equal(loopback.targetExe.sha256, PRODUCTION_CONTRACT.sourceSha256);
  assert.equal(loopback.expectedPatchedSha256, '2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345');
  assert.equal(loopback.patches.length, 1);
  assert.deepEqual(loopback.patches[0], {
    id: 'login-server-ip-loopback',
    sourceExeSha256: PRODUCTION_CONTRACT.sourceSha256,
    addressKind: 'offset',
    offset: 0x36ee3c,
    virtualAddressHex: '0x0076ee3c',
    originalBytes: Buffer.from('202.8.80.179\0', 'ascii').toString('hex'),
    patchedBytes: Buffer.from('127.0.0.1\0\0\0\0', 'ascii').toString('hex'),
    rollbackBytes: Buffer.from('202.8.80.179\0', 'ascii').toString('hex'),
    reason: loopback.patches[0].reason,
  });
  assert.equal(canonical.targetExe.sha256, loopback.expectedPatchedSha256);
  assert.equal(canonical.expectedPatchedSha256, '9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51');
  assert.equal(canonical.patches.length, 6);
  assert.ok(canonical.patches.every((patch) => patch.sourceExeSha256 === canonical.targetExe.sha256));
});

test('synthetic full chain creates a P0-consumable external manifest and distinct rollback artifacts', async (t) => {
  const fixture = await createFixture(t);
  if (!fixture) return;
  const result = await rebuildLogh7ClientLineage(await buildOptions(fixture));
  assert.equal(result.status, 'complete');
  assert.equal(result.canonicalSha256, sha256(fixture.source));
  assert.equal(result.workingSha256, sha256(fixture.final));
  assert.equal(result.stageCount, 5);
  assert.deepEqual(result.patchCounts, {
    'loopback-login-server': 1,
    'canonical-six-patches': 1,
    'hardcoded-ui-ko-resources': 1,
    'direct-client': 1,
    'post-login-1080p': 1,
  });

  const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));
  assert.equal(manifest.sentinel, 'LOGH7-WINE-LINEAGE-V1');
  assert.equal(manifest.lineageStatus, 'complete');
  assert.equal(manifest.project, 'logh7-revival');
  assert.equal(manifest.canonical.readOnly, true);
  assert.equal(manifest.working.workingCopy, true);
  assert.equal(manifest.working.peTimestamp, 0x40779eb8);
  assert.equal(manifest.working.imageBase, 0x400000);
  assert.ok(manifest.working.sentinels.length >= 6);
  assert.ok(manifest.stages.every((stage) => [
    stage.output.path,
    stage.receipt.path,
    stage.backup.path,
    stage.rollback.path,
  ].every((path) => path.startsWith(`${result.outputRoot}/`))));

  const artifactPaths = new Set([manifest.canonical.path, manifest.working.path]);
  let previous = manifest.canonical.sha256;
  for (const stage of manifest.stages) {
    assert.equal(stage.inputSha256, previous);
    previous = stage.outputSha256;
    for (const artifact of [stage.output, stage.receipt, stage.backup, stage.rollback]) {
      assert.equal(artifactPaths.has(artifact.path), false, `artifact path reused: ${artifact.path}`);
      artifactPaths.add(artifact.path);
      assert.equal(await sha256File(artifact.path), artifact.sha256);
    }
    assert.equal(stage.backup.sha256, stage.inputSha256);
    assert.equal(stage.rollback.sha256, stage.inputSha256);
  }
  assert.equal(previous, manifest.working.sha256);
  assert.equal((await stat(manifest.canonical.path)).mode & 0o222, 0);
  assert.notEqual((await stat(manifest.canonical.path)).ino, (await stat(manifest.working.path)).ino);

  const validatorScript = [
    'import json, sys',
    'from pathlib import Path',
    `sys.path.insert(0, ${JSON.stringify(dirname(LIVE_QA_MODULE))})`,
    'import logh7_wine_live_qa as qa',
    'blockers = []',
    'files = []',
    `result = qa.validate_lineage(Path(${JSON.stringify(result.manifestPath)}), Path(${JSON.stringify(result.workingPath)}), blockers, files)`,
    'print(json.dumps({"complete": result["complete"], "blockers": [b.code for b in blockers]}))',
  ].join('\n');
  const validation = spawnSync(fixture.pythonPath, ['-c', validatorScript], { encoding: 'utf8' });
  assert.equal(validation.status, 0, validation.stderr);
  assert.deepEqual(JSON.parse(validation.stdout), { complete: true, blockers: [] });
});

test('existing output and repository-internal output are refused without mutation', async (t) => {
  const fixture = await createFixture(t);
  if (!fixture) return;
  await mkdir(fixture.outputRoot);
  const marker = join(fixture.outputRoot, 'keep.txt');
  await writeFile(marker, 'keep');
  await assert.rejects(
    rebuildLogh7ClientLineage(await buildOptions(fixture)),
    /already exists; overwrite\/reuse is forbidden/,
  );
  assert.equal(await readFile(marker, 'utf8'), 'keep');

  const repoOutput = resolve(ROOT, '.lineage-output-must-not-exist');
  await assert.rejects(
    rebuildLogh7ClientLineage({ ...await buildOptions(fixture), outputRoot: repoOutput }),
    /outside the repository/,
  );
  await assert.rejects(access(repoOutput), /ENOENT/);
});

test('mid-chain resource failure leaves no promoted or temporary output', async (t) => {
  const fixture = await createFixture(t, { resourceMode: 'exit-after-write' });
  if (!fixture) return;
  await assert.rejects(rebuildLogh7ClientLineage(await buildOptions(fixture)));
  await assert.rejects(access(fixture.outputRoot), /ENOENT/);
  const leaked = (await readdir(fixture.root)).filter((name) => name.startsWith('.lineage-output.building-'));
  assert.deepEqual(leaked, []);
  assert.equal(await sha256File(fixture.sourcePath), sha256(fixture.source));
});

test('unknown source hash fails closed before staging', async (t) => {
  const fixture = await createFixture(t);
  if (!fixture) return;
  const changed = Buffer.from(fixture.source);
  changed[0x190] ^= 0xff;
  await writeFile(fixture.sourcePath, changed);
  await assert.rejects(rebuildLogh7ClientLineage(await buildOptions(fixture)), /source hash mismatch/);
  await assert.rejects(access(fixture.outputRoot), /ENOENT/);
  const leaked = (await readdir(fixture.root)).filter((name) => name.includes('.building-'));
  assert.deepEqual(leaked, []);
});

test('relative paths and pinned tool drift are rejected before staging', async (t) => {
  const fixture = await createFixture(t);
  if (!fixture) return;
  const options = await buildOptions(fixture);
  await assert.rejects(
    rebuildLogh7ClientLineage({ ...options, sourcePath: 'source.exe' }),
    /sourcePath must be an absolute path/,
  );
  await assert.rejects(
    rebuildLogh7ClientLineage({ ...options, outputRoot: 'lineage-output' }),
    /outputRoot must be an absolute path/,
  );
  await assert.rejects(
    rebuildLogh7ClientLineage({ ...options, pythonPath: 'python3' }),
    /pythonPath must be an absolute path/,
  );
  await assert.rejects(
    rebuildLogh7ClientLineage({ ...options, expectedResourcePatcherSha256: '0'.repeat(64) }),
    /resource patcher tool hash mismatch/,
  );
  await assert.rejects(access(fixture.outputRoot), /ENOENT/);
  const leaked = (await readdir(fixture.root)).filter((name) => name.includes('.building-'));
  assert.deepEqual(leaked, []);
});

test('real bd192 source rebuild is opt-in and never writes inside the repository', {
  skip: process.env.LOGH7_LINEAGE_INTEGRATION !== '1',
}, async (t) => {
  const pythonPath = await findPython();
  if (!pythonPath) return t.skip('absolute Python interpreter is unavailable');
  const sourcePath = resolve(ROOT, '.omo/re-galaxy/g7mtclient.exe');
  try {
    await access(sourcePath, fsConstants.R_OK);
  } catch {
    return t.skip('bd192 source is unavailable');
  }
  if (await sha256File(sourcePath) !== PRODUCTION_CONTRACT.sourceSha256) {
    return t.skip('available source is not the bd192 build');
  }
  const externalRoot = await mkdtemp(join(tmpdir(), 'logh7-lineage-integration-'));
  t.after(() => rm(externalRoot, { force: true, recursive: true }));
  const result = await rebuildLogh7ClientLineage({
    sourcePath,
    outputRoot: join(externalRoot, 'lineage'),
    pythonPath,
  });
  assert.equal(result.workingSha256, PRODUCTION_CONTRACT.finalSha256);
  assert.deepEqual(result.patchCounts, {
    'loopback-login-server': 1,
    'canonical-six-patches': 6,
    'hardcoded-ui-ko-resources': 136,
    'direct-client': 10,
    'post-login-1080p': 59,
  });
});
