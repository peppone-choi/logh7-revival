import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const manifestPath = fileURLToPath(
  new URL('../content/client/logh7-1080p-client-patch.json', import.meta.url),
);
const helperUrl = new URL('../../tools/live/prepare_1080p_client.mjs', import.meta.url);
const sourceSha256 = '5bdd64f1f9a8cca93f5b1002291d6a2c7e8f5ce555b062b8cb48337b96277d89';
const finalSha256 = '825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22';

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

function graphicConfig(width = 1024, height = 768) {
  return [
    'EasyGraphicConfigFile',
    'PleaseSetLevels0-3',
    '(*//',
    'UnitModelLevel', '2',
    'StarsModelLevel', '2',
    'ModelTextureLevel', '2',
    'BGTextureLevel', '2',
    'EffectTextureLevel', '2',
    'ScreenWidth', String(width),
    'ScreenHeight', String(height),
    'ScreenRefreshRate', '0',
    'ScreenBit', '0',
    'EffectLV', '0',
    'BGM Volume', '100',
    'SE Volume', '100',
    'StrategyBGM', '3',
    'TacticsBGM', '5',
    '',
  ].join('\r\n');
}

async function makeFixture(manifest) {
  const fixture = buildFixture(manifest);
  const dir = await mkdtemp(join(tmpdir(), 'logh7-1080p-client-'));
  const exePath = join(dir, 'exe', 'g7mtclient.exe');
  const configPath = join(dir, 'GraphicConfig.txt');
  const fixtureManifestPath = join(dir, 'manifest.json');
  const fixtureManifest = structuredClone(manifest);
  fixtureManifest.targetExe.sha256 = sha256(fixture.source);
  fixtureManifest.expectedPatchedSha256 = sha256(fixture.patched);
  fixtureManifest.patches = fixtureManifest.patches.map((patch) => ({
    ...patch,
    sourceExeSha256: fixtureManifest.targetExe.sha256,
  }));
  await import('node:fs/promises').then(({ mkdir }) => mkdir(dirname(exePath), { recursive: true }));
  await Promise.all([
    writeFile(exePath, fixture.source),
    writeFile(configPath, graphicConfig()),
    writeFile(fixtureManifestPath, `${JSON.stringify(fixtureManifest, null, 2)}\n`),
  ]);
  return { ...fixture, configPath, dir, exePath, fixtureManifestPath };
}

test('1080p manifest keeps the original login panel and patches only post-login layouts', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.id, 'logh7-1080p-client-patch');
  assert.equal(manifest.targetExe.sha256, sourceSha256);
  assert.equal(manifest.expectedPatchedSha256, finalSha256);
  assert.deepEqual(manifest.resolutionBoundary, {
    loginClientArea: '644x484-original',
    postLoginClientArea: '1920x1080-native',
  });
  assert.deepEqual(manifest.provenance.descriptors, [
    'RE/tools/client_patches/lobby-res.json',
    'RE/tools/client_patches/lobby-native-layout-v2.json',
    'RE/tools/client_patches/charsel-recenter.json',
  ]);
  assert.equal(manifest.patches.length, 59);
  assert.ok(manifest.patches.every((patch) => patch.sourceExeSha256 === sourceSha256));
  assert.deepEqual(
    Object.fromEntries(['lobby-res', 'lobby-native-layout-v2', 'charsel-recenter'].map((prefix) => [
      prefix,
      manifest.patches.filter((patch) => patch.id.startsWith(`${prefix}-`)).length,
    ])),
    { 'lobby-res': 8, 'lobby-native-layout-v2': 13, 'charsel-recenter': 38 },
  );
  assert.ok(manifest.patches.every((patch) => !patch.id.startsWith('login-native-layout-')));

  const byOffset = new Map(manifest.patches.map((patch) => [patch.offset, patch]));
  assert.equal(byOffset.has(0x11a50a), false, '로그인 높이 패치는 배포하면 안 된다');
  assert.equal(byOffset.has(0x11a51c), false, '로그인 너비 패치는 배포하면 안 된다');
  assert.equal(byOffset.get(0x11a73b).patchedBytes, '6838040000');
  assert.equal(byOffset.get(0x11a740).patchedBytes, '6880070000');
  assert.equal(byOffset.get(0x11e94e).patchedBytes, 'c74424305c020000');
  assert.equal(byOffset.has(0xea4e3), false, '진단용 X→Y scaler 패치는 배포하면 안 된다');
  assert.equal(byOffset.has(0xea1c6), false, '18pt 글꼴 패치는 별도 후속 범위다');
});

test('prepare1080pClient patches the EXE in place, updates world resolution, and reuses it', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fixture = await makeFixture(manifest);
  const { prepare1080pClient } = await import(helperUrl);

  const applied = await prepare1080pClient({
    configPath: fixture.configPath,
    exePath: fixture.exePath,
    manifestPath: fixture.fixtureManifestPath,
  });
  assert.equal(applied.mode, 'applied');
  assert.equal(applied.patchCount, 59);
  assert.deepEqual(await readFile(fixture.exePath), fixture.patched);
  assert.match(await readFile(fixture.configPath, 'utf8'), /ScreenWidth\r?\n1920\r?\nScreenHeight\r?\n1080/);

  const reused = await prepare1080pClient({
    configPath: fixture.configPath,
    exePath: fixture.exePath,
    manifestPath: fixture.fixtureManifestPath,
  });
  assert.equal(reused.mode, 'reused');
  assert.deepEqual((await readdir(fixture.dir)).sort(), ['GraphicConfig.txt', 'exe', 'manifest.json']);
});

test('prepare1080pClient dry-run changes neither product file', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fixture = await makeFixture(manifest);
  const { prepare1080pClient } = await import(helperUrl);

  const receipt = await prepare1080pClient({
    configPath: fixture.configPath,
    dryRun: true,
    exePath: fixture.exePath,
    manifestPath: fixture.fixtureManifestPath,
  });
  assert.equal(receipt.mode, 'dry-run');
  assert.deepEqual(await readFile(fixture.exePath), fixture.source);
  assert.equal(await readFile(fixture.configPath, 'utf8'), graphicConfig());
});

test('prepare1080pClient fails closed on an unknown EXE hash before changing GraphicConfig', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fixture = await makeFixture(manifest);
  fixture.source[0] ^= 0xff;
  await writeFile(fixture.exePath, fixture.source);
  const { prepare1080pClient } = await import(helperUrl);

  await assert.rejects(
    prepare1080pClient({
      configPath: fixture.configPath,
      exePath: fixture.exePath,
      manifestPath: fixture.fixtureManifestPath,
    }),
    /exe hash mismatch/,
  );
  assert.deepEqual(await readFile(fixture.exePath), fixture.source);
  assert.equal(await readFile(fixture.configPath, 'utf8'), graphicConfig());
});

test('prepare1080pClient rejects a malformed GraphicConfig before changing the EXE', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const fixture = await makeFixture(manifest);
  await writeFile(fixture.configPath, 'EasyGraphicConfigFile\r\nScreenWidth\r\n1024\r\n');
  const { prepare1080pClient } = await import(helperUrl);

  await assert.rejects(
    prepare1080pClient({
      configPath: fixture.configPath,
      exePath: fixture.exePath,
      manifestPath: fixture.fixtureManifestPath,
    }),
    /ScreenHeight/,
  );
  assert.deepEqual(await readFile(fixture.exePath), fixture.source);
});

test('prepare 1080p CLI prints usage for --help', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(helperUrl), '--help'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.equal(result.stderr, '');
});
