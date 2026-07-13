// prepare_hangul_charset_client.mjs — 한글 charset 패치 적용본 준비(guarded overlay)
//
// prepareStrategyUiClient의 guarded-patch 코어를 그대로 재사용한다:
//   - expectedPatchedSha256 게이트(출력본 결정성)
//   - sourcePath==outputPath / 하드링크 별칭 거부(원본 절대 덮어쓰기 금지)
//   - 기존 출력본이 pinned 해시면 재적용 없이 재사용(idempotent overlay)
//   - String.txt/window*.dat 지원파일을 출력 디렉터리에 동반 복사
// Hangul 전용은 기본 경로(매니페스트/출력)뿐이므로 로직 중복 없이 위임한다.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { prepareStrategyUiClient } from './prepare_strategy_ui_client.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_MANIFEST_PATH = resolve(
  ROOT,
  'server/content/client/logh7-hangul-charset-patch.json',
);
export const DEFAULT_SOURCE_PATH = resolve(
  ROOT,
  'artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe',
);
export const DEFAULT_OUTPUT_PATH = resolve(
  ROOT,
  'artifacts/logh7-install/____________s___/____/exe-hangul/G7MTClient.exe',
);

export async function prepareHangulCharsetClient({
  manifestPath = DEFAULT_MANIFEST_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
  sourcePath = DEFAULT_SOURCE_PATH,
} = {}) {
  return prepareStrategyUiClient({ manifestPath, outputPath, sourcePath });
}

export async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      manifest: { type: 'string' },
      output: { type: 'string' },
      source: { type: 'string' },
    },
  });
  const receipt = await prepareHangulCharsetClient({
    manifestPath: values.manifest ?? DEFAULT_MANIFEST_PATH,
    outputPath: values.output ?? DEFAULT_OUTPUT_PATH,
    sourcePath: values.source ?? DEFAULT_SOURCE_PATH,
  });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
