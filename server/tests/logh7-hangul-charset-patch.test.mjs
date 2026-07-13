// logh7-hangul-charset-patch.test.mjs — 한글 charset exe-patch 검증
//
// 검증 계약:
//   (a) 정본 EXE에 적용 시 0xAEDEB/0xB0B97가 정확히 6a81로 바뀌고 다른 바이트 불변
//   (b) 잘못된 원본 해시면 fail-closed (적용 거부)
//   (c) 출력본이 결정적(expectedPatchedSha256) + 재적용 idempotent
//   (d) 원본 파일 불변 (별도 출력본에만 기록)
//
// 실제 정본 EXE가 있으면 그 바이트로, 없으면 희소 fixture로 계약을 검증한다.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import { test } from 'node:test';
import {
  applyPatchManifest,
  rollbackPatchManifest,
  validatePatchManifest,
} from '../../tools/patch/exe-patch.mjs';

const manifestPath = fileURLToPath(
  new URL('../content/client/logh7-hangul-charset-patch.json', import.meta.url),
);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const canonicalExeSha256 = '9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51';
const expectedPatchedSha256 = '18b5f53d713733b0715aa8f39ea417e5b724e621fdb75ce9e0b9c11d6c8e97e1';

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

// 정본 EXE 경로 탐색(있으면). pathHints 기준 glob, 없으면 null.
async function findCanonicalExe() {
  for await (const entry of glob('artifacts/logh7-install/**/exe/g7mtclient.exe', { cwd: repoRoot })) {
    const abs = join(repoRoot, entry);
    try {
      await access(abs, constants.R_OK);
      const buf = await readFile(abs);
      if (hash(buf) === canonicalExeSha256) return abs;
    } catch {
      // 접근 불가 → 건너뜀
    }
  }
  return null;
}

// 정본 EXE가 없을 때 쓰는 희소 fixture: 두 오프셋에만 6a80을 심은 버퍼.
function buildSparseFixture(manifest) {
  const size = Math.max(
    ...manifest.patches.map((p) => p.offset + Buffer.from(p.originalBytes, 'hex').length),
  );
  const buf = Buffer.alloc(size);
  for (const p of manifest.patches) {
    Buffer.from(p.originalBytes, 'hex').copy(buf, p.offset);
  }
  return buf;
}

test('한글 charset 매니페스트가 정본 해시에 고정된 2바이트 guarded 패치를 담는다', async () => {
  const manifest = await readJson(manifestPath);
  assert.equal(manifest.id, 'logh7-hangul-charset-patch');
  assert.deepEqual(manifest.targetExe, {
    name: 'g7mtclient.exe',
    sha256: canonicalExeSha256,
    imageBase: 4194304,
    size: 3956736,
    pathHints: ['artifacts/logh7-install/**/exe/g7mtclient.exe'],
    note: manifest.targetExe.note,
  });
  assert.equal(manifest.expectedPatchedSha256, expectedPatchedSha256);
  const contract = manifest.patches.map((p) => ({
    id: p.id,
    sourceExeSha256: p.sourceExeSha256,
    addressKind: p.addressKind,
    offset: p.offset,
    originalBytes: p.originalBytes,
    patchedBytes: p.patchedBytes,
    rollbackBytes: p.rollbackBytes,
  }));
  assert.deepEqual(contract, [
    {
      id: 'hangul-charset-A',
      sourceExeSha256: canonicalExeSha256,
      addressKind: 'offset',
      offset: 0xaedeb,
      originalBytes: '6a80',
      patchedBytes: '6a81',
      rollbackBytes: '6a80',
    },
    {
      id: 'hangul-charset-B',
      sourceExeSha256: canonicalExeSha256,
      addressKind: 'offset',
      offset: 0xb0b97,
      originalBytes: '6a80',
      patchedBytes: '6a81',
      rollbackBytes: '6a80',
    },
  ]);
  // 모든 reason은 한글 근거 문장이어야 한다.
  for (const p of manifest.patches) assert.match(p.reason, /[가-힣]/u);
});

test('잘못된 원본 해시면 fail-closed로 적용을 거부한다 (b)', async () => {
  const manifest = await readJson(manifestPath);
  const dir = await mkdtemp(join(tmpdir(), 'logh7-hangul-badhash-'));
  // 오프셋 바이트는 맞지만 해시가 다른 버퍼 → 해시 게이트에서 거부돼야 한다.
  const wrong = buildSparseFixture(manifest);
  wrong[0] = wrong[0] ^ 0xff; // 해시만 어긋나게
  const wrongPath = join(dir, 'wrong.exe');
  await writeFile(wrongPath, wrong);
  await assert.rejects(
    () => applyPatchManifest(manifest, wrongPath, join(dir, 'out.exe')),
    /source exe hash mismatch/,
  );
});

test('희소 fixture로 apply→rollback 왕복 + 재적용 idempotent (a,c,d)', async () => {
  const manifest = await readJson(manifestPath);
  const fixture = buildSparseFixture(manifest);
  const fixtureHash = hash(fixture);
  // fixture 해시로 게이트 재조정(엔진 계약만 검증, 바이트 변환은 동일).
  const fx = structuredClone(manifest);
  fx.targetExe.sha256 = fixtureHash;
  fx.patches = fx.patches.map((p) => ({ ...p, sourceExeSha256: fixtureHash }));

  const dir = await mkdtemp(join(tmpdir(), 'logh7-hangul-roundtrip-'));
  const src = join(dir, 'source.exe');
  const out1 = join(dir, 'patched1.exe');
  const out2 = join(dir, 'patched2.exe');
  const restored = join(dir, 'restored.exe');
  await writeFile(src, fixture);

  // (d) 원본 불변: apply는 별도 출력본에만 쓴다.
  const srcHashBefore = hash(await readFile(src));
  await applyPatchManifest(fx, src, out1);
  assert.equal(hash(await readFile(src)), srcHashBefore, '원본 파일이 변경되면 안 된다');

  const patched1 = await readFile(out1);
  // (a) 두 오프셋만 6a81로 바뀌고 나머지 바이트 불변
  assert.equal(patched1.subarray(0xaedeb, 0xaedeb + 2).toString('hex'), '6a81');
  assert.equal(patched1.subarray(0xb0b97, 0xb0b97 + 2).toString('hex'), '6a81');
  const diff = [];
  for (let i = 0; i < fixture.length; i += 1) {
    if (fixture[i] !== patched1[i]) diff.push(i);
  }
  assert.deepEqual(diff, [0xaedec, 0xb0b98], '오직 두 charset 바이트만 바뀌어야 한다');

  // (c) 재적용 idempotent: 같은 소스에 다시 적용해도 동일한 출력.
  await applyPatchManifest(fx, src, out2);
  assert.equal(hash(await readFile(out2)), hash(patched1));

  // rollback → 원본 fixture로 완전 복원(되돌림 가능)
  await rollbackPatchManifest(fx, out1, restored);
  assert.equal(hash(await readFile(restored)), fixtureHash);
});

// 정본 EXE가 있으면 실바이트로 결정적 출력 해시를 못박는다(원본 불변 포함).
test('정본 EXE에 적용 시 출력본 sha256이 expectedPatchedSha256과 일치 (있을 때만)', async (t) => {
  const exePath = await findCanonicalExe();
  if (!exePath) {
    t.skip('정본 g7mtclient.exe 없음 — 희소 fixture 계약으로 충분');
    return;
  }
  // validate는 원본 해시 게이트와 originalBytes(6a80)를 확인한다.
  const report = await validatePatchManifest(manifestPath, exePath);
  assert.equal(report.patchCount, 2);

  const srcHashBefore = hash(await readFile(exePath));
  const dir = await mkdtemp(join(tmpdir(), 'logh7-hangul-real-'));
  const out = join(dir, 'g7mtclient.hangul.exe');
  const applyReport = await applyPatchManifest(manifestPath, exePath, out);
  assert.equal(applyReport.sha256, expectedPatchedSha256);
  assert.equal(hash(await readFile(out)), expectedPatchedSha256);
  // (d) 정본 원본은 절대 불변
  assert.equal(hash(await readFile(exePath)), srcHashBefore);
  assert.equal(srcHashBefore, canonicalExeSha256);
});
