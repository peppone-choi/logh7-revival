// logh7-hangul-charset-client.test.mjs — prepareHangulCharsetClient guarded overlay
//
// guarded-patch 재사용 계약:
//   - 출력본 결정성(expectedPatchedSha256) + 원본 불변
//   - 두 번째 호출은 재적용 없이 overlay 재사용(mode='reused')
//   - sourcePath==outputPath 거부(원본 덮어쓰기 금지)

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'node:fs/promises';
import { test } from 'node:test';
import { prepareHangulCharsetClient } from '../../tools/live/prepare_hangul_charset_client.mjs';

const manifestPath = fileURLToPath(
  new URL('../content/client/logh7-hangul-charset-patch.json', import.meta.url),
);
const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const canonicalExeSha256 = '9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51';
const expectedPatchedSha256 = '18b5f53d713733b0715aa8f39ea417e5b724e621fdb75ce9e0b9c11d6c8e97e1';

function hash(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function findCanonicalExe() {
  for await (const entry of glob('artifacts/logh7-install/**/exe/g7mtclient.exe', { cwd: repoRoot })) {
    const abs = join(repoRoot, entry);
    try {
      await access(abs, constants.R_OK);
      if (hash(await readFile(abs)) === canonicalExeSha256) return abs;
    } catch {
      // 건너뜀
    }
  }
  return null;
}

test('prepareHangulCharsetClient가 결정적 overlay를 만들고 원본을 건드리지 않는다', async (t) => {
  const exePath = await findCanonicalExe();
  if (!exePath) {
    t.skip('정본 g7mtclient.exe 없음');
    return;
  }
  const srcHashBefore = hash(await readFile(exePath));
  const dir = await mkdtemp(join(tmpdir(), 'logh7-hangul-client-'));
  const out = join(dir, 'exe-hangul', 'G7MTClient.exe');

  // 최초: applied
  const first = await prepareHangulCharsetClient({ manifestPath, sourcePath: exePath, outputPath: out });
  assert.equal(first.mode, 'applied');
  assert.equal(first.sha256, expectedPatchedSha256);
  assert.equal(hash(await readFile(out)), expectedPatchedSha256);

  // 재호출: overlay 재사용(idempotent)
  const second = await prepareHangulCharsetClient({ manifestPath, sourcePath: exePath, outputPath: out });
  assert.equal(second.mode, 'reused');
  assert.equal(second.sha256, expectedPatchedSha256);

  // 원본 불변
  assert.equal(hash(await readFile(exePath)), srcHashBefore);
  assert.equal(srcHashBefore, canonicalExeSha256);
});

test('prepareHangulCharsetClient는 출력==원본이면 거부한다 (원본 덮어쓰기 금지)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'logh7-hangul-guard-'));
  const same = join(dir, 'g7mtclient.exe');
  await writeFile(same, Buffer.alloc(16));
  await assert.rejects(
    () => prepareHangulCharsetClient({ manifestPath, sourcePath: same, outputPath: same }),
    /must not refer to the same file/,
  );
});
