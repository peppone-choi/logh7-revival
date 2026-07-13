import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { link, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareStrategyUiClient } from '../../tools/live/prepare_strategy_ui_client.mjs';

const execFileAsync = promisify(execFile);
const manifestPath = fileURLToPath(
  new URL('../content/client/logh7-strategy-ui-label-patch.json', import.meta.url),
);
const helperPath = fileURLToPath(
  new URL('../../tools/live/prepare_strategy_ui_client.mjs', import.meta.url),
);

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function makeFixture() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.patches.length, 9);
  const fixtureSize = Math.max(...manifest.patches.map(
    (patch) => patch.offset + Buffer.from(patch.originalBytes, 'hex').length,
  ));
  const source = Buffer.alloc(fixtureSize);
  for (const patch of manifest.patches) {
    Buffer.from(patch.originalBytes, 'hex').copy(source, patch.offset);
  }
  const patched = Buffer.from(source);
  for (const patch of manifest.patches) {
    Buffer.from(patch.patchedBytes, 'hex').copy(patched, patch.offset);
  }

  const dir = await mkdtemp(join(tmpdir(), 'logh7-strategy-ui-client-'));
  const sourcePath = join(dir, 'exe', 'g7mtclient.exe');
  const outputPath = join(dir, 'exe-strategy-ui', 'G7MTClient.exe');
  const fixtureManifest = structuredClone(manifest);
  fixtureManifest.targetExe.sha256 = sha256(source);
  fixtureManifest.expectedPatchedSha256 = sha256(patched);
  fixtureManifest.patches = fixtureManifest.patches.map((patch) => ({
    ...patch,
    sourceExeSha256: fixtureManifest.targetExe.sha256,
  }));
  const fixtureManifestPath = join(dir, 'manifest.json');
  await mkdir(dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, source);
  await writeFile(fixtureManifestPath, `${JSON.stringify(fixtureManifest, null, 2)}\n`);
  await Promise.all([
    writeFile(join(dirname(sourcePath), 'String.txt'), 'strings'),
    writeFile(join(dirname(sourcePath), 'window2.dat'), 'window2'),
    writeFile(join(dirname(sourcePath), 'window3.dat'), 'window3'),
  ]);
  return { fixtureManifestPath, outputPath, patched, source, sourcePath };
}

test('prepareStrategyUiClient applies all guarded patches without changing the source', async () => {
  // Given: 원본 바이트와 보조 파일을 가진 희소 EXE fixture
  const fixture = await makeFixture();

  // When: 전략 UI 오버레이를 준비한다.
  const receipt = await prepareStrategyUiClient({
    manifestPath: fixture.fixtureManifestPath,
    outputPath: fixture.outputPath,
    sourcePath: fixture.sourcePath,
  });

  // Then: 원본은 보존되고 9개 패치와 보조 파일이 별도 디렉터리에 놓인다.
  assert.equal(receipt.mode, 'applied');
  assert.equal(receipt.applied, true);
  assert.equal(receipt.reused, false);
  assert.equal(receipt.patchCount, 9);
  assert.equal(receipt.sha256, sha256(fixture.patched));
  assert.deepEqual(await readFile(fixture.sourcePath), fixture.source);
  assert.deepEqual(await readFile(fixture.outputPath), fixture.patched);
  assert.equal(await readFile(join(dirname(fixture.outputPath), 'String.txt'), 'utf8'), 'strings');
  assert.equal(await readFile(join(dirname(fixture.outputPath), 'window2.dat'), 'utf8'), 'window2');
  assert.equal(await readFile(join(dirname(fixture.outputPath), 'window3.dat'), 'utf8'), 'window3');
});

test('prepareStrategyUiClient rejects an output path equal to the source without changing it', async () => {
  // Given: 출력 경로가 원본 EXE와 정확히 같은 fixture
  const fixture = await makeFixture();

  // When: 위험한 동일 경로로 오버레이 준비를 시도한다.
  const error = await prepareStrategyUiClient({
    manifestPath: fixture.fixtureManifestPath,
    outputPath: fixture.sourcePath,
    sourcePath: fixture.sourcePath,
  }).then(() => null, (reason) => reason);

  // Then: 원본 바이트를 건드리지 않고 fail closed 한다.
  assert.deepEqual(await readFile(fixture.sourcePath), fixture.source);
  assert.ok(error instanceof Error);
  assert.match(error.message, /same file/);
});

test('prepareStrategyUiClient rejects a hardlink output alias without changing the source', async () => {
  // Given: 원본 EXE와 같은 inode를 가리키는 별도 출력 경로
  const fixture = await makeFixture();
  const aliasPath = join(dirname(fixture.outputPath), 'G7MTClient.exe');
  await mkdir(dirname(aliasPath), { recursive: true });
  await link(fixture.sourcePath, aliasPath);

  // When: hardlink alias로 오버레이 준비를 시도한다.
  const error = await prepareStrategyUiClient({
    manifestPath: fixture.fixtureManifestPath,
    outputPath: aliasPath,
    sourcePath: fixture.sourcePath,
  }).then(() => null, (reason) => reason);

  // Then: 원본과 alias 모두 불변인 채 fail closed 한다.
  assert.deepEqual(await readFile(fixture.sourcePath), fixture.source);
  assert.deepEqual(await readFile(aliasPath), fixture.source);
  assert.ok(error instanceof Error);
  assert.match(error.message, /same file/);
});

test('prepareStrategyUiClient allows a distinct output in the source directory', async () => {
  // Given: 원본과 다른 파일이지만 같은 디렉터리에 놓일 출력 경로
  const fixture = await makeFixture();
  const outputPath = join(dirname(fixture.sourcePath), 'patched-g7mtclient.exe');

  // When: 합법적인 출력 경로로 오버레이를 준비한다.
  const receipt = await prepareStrategyUiClient({
    manifestPath: fixture.fixtureManifestPath,
    outputPath,
    sourcePath: fixture.sourcePath,
  });

  // Then: EXE는 생성되고 동일 support 파일 self-copy는 생략된다.
  assert.equal(receipt.mode, 'applied');
  assert.deepEqual(await readFile(outputPath), fixture.patched);
  assert.deepEqual(await readFile(fixture.sourcePath), fixture.source);
  assert.deepEqual(receipt.supportFiles, []);
});

test('prepareStrategyUiClient reuses an overlay with the pinned patched hash', async () => {
  // Given: 이미 검증된 전략 UI 오버레이
  const fixture = await makeFixture();
  await prepareStrategyUiClient({
    manifestPath: fixture.fixtureManifestPath,
    outputPath: fixture.outputPath,
    sourcePath: fixture.sourcePath,
  });

  // When: 같은 오버레이를 다시 준비한다.
  const receipt = await prepareStrategyUiClient({
    manifestPath: fixture.fixtureManifestPath,
    outputPath: fixture.outputPath,
    sourcePath: fixture.sourcePath,
  });

  // Then: 다시 패치하지 않고 검증된 파일을 재사용한다.
  assert.equal(receipt.mode, 'reused');
  assert.equal(receipt.applied, false);
  assert.equal(receipt.reused, true);
  assert.deepEqual(await readFile(fixture.outputPath), fixture.patched);
});

test('prepareStrategyUiClient rebuilds a drifted output from the unchanged source', async () => {
  // Given: 해시가 변조된 기존 오버레이
  const fixture = await makeFixture();
  await mkdir(dirname(fixture.outputPath), { recursive: true });
  await writeFile(fixture.outputPath, 'drift');

  // When: 오버레이를 다시 준비한다.
  const receipt = await prepareStrategyUiClient({
    manifestPath: fixture.fixtureManifestPath,
    outputPath: fixture.outputPath,
    sourcePath: fixture.sourcePath,
  });

  // Then: canonical fixture에서 재생성하고 기대 해시를 복원한다.
  assert.equal(receipt.mode, 'applied');
  assert.deepEqual(await readFile(fixture.outputPath), fixture.patched);
  assert.deepEqual(await readFile(fixture.sourcePath), fixture.source);
});

test('prepareStrategyUiClient fails closed when expectedPatchedSha256 is wrong', async () => {
  // Given: 결과 해시 계약이 틀린 매니페스트
  const fixture = await makeFixture();
  const manifest = JSON.parse(await readFile(fixture.fixtureManifestPath, 'utf8'));
  manifest.expectedPatchedSha256 = '0'.repeat(64);
  await writeFile(fixture.fixtureManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // When/Then: 출력 파일을 만들기 전에 실패한다.
  await assert.rejects(
    prepareStrategyUiClient({
      manifestPath: fixture.fixtureManifestPath,
      outputPath: fixture.outputPath,
      sourcePath: fixture.sourcePath,
    }),
    /patched SHA-256 mismatch/,
  );
  await assert.rejects(readFile(fixture.outputPath), /ENOENT/);
});

test('prepareStrategyUiClient CLI prints a machine-readable receipt', async () => {
  // Given: CLI에서 지정할 수 있는 희소 EXE fixture
  const fixture = await makeFixture();

  // When: helper CLI를 실행한다.
  const { stdout } = await execFileAsync(process.execPath, [
    helperPath,
    '--manifest', fixture.fixtureManifestPath,
    '--source', fixture.sourcePath,
    '--output', fixture.outputPath,
  ]);
  const receipt = JSON.parse(stdout);

  // Then: 실제 실행 파일과 검증 해시가 JSON 영수증에 기록된다.
  assert.equal(receipt.path, fixture.outputPath);
  assert.equal(receipt.sha256, sha256(fixture.patched));
  assert.equal(receipt.manifestId, 'logh7-strategy-ui-label-patch');
  assert.equal(receipt.mode, 'applied');
});
