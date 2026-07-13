import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { applyPatchManifest } from '../patch/exe-patch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_MANIFEST_PATH = resolve(
  ROOT,
  'server/content/client/logh7-strategy-ui-label-patch.json',
);
export const DEFAULT_SOURCE_PATH = resolve(
  ROOT,
  'artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe',
);
export const DEFAULT_OUTPUT_PATH = resolve(
  ROOT,
  'artifacts/logh7-install/____________s___/____/exe-strategy-ui/G7MTClient.exe',
);
const SUPPORT_FILE_NAMES = Object.freeze(['String.txt', 'window2.dat', 'window3.dat']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function readExistingHash(path) {
  try {
    return await sha256File(path);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function comparablePath(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

async function existingFileIdentity(path) {
  try {
    const [realPath, metadata] = await Promise.all([realpath(path), stat(path)]);
    return {
      realPath: comparablePath(realPath),
      device: metadata.dev,
      inode: metadata.ino,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function pathsReferToSameFile(leftPath, rightPath) {
  if (comparablePath(leftPath) === comparablePath(rightPath)) {
    return true;
  }
  const [left, right] = await Promise.all([
    existingFileIdentity(leftPath),
    existingFileIdentity(rightPath),
  ]);
  if (left === null || right === null) {
    return false;
  }
  return left.realPath === right.realPath
    || (left.device === right.device && left.inode === right.inode);
}

async function copySupportFiles(sourcePath, outputPath) {
  const copied = [];
  if (await pathsReferToSameFile(dirname(sourcePath), dirname(outputPath))) {
    return copied;
  }
  for (const name of SUPPORT_FILE_NAMES) {
    const source = resolve(dirname(sourcePath), name);
    try {
      await copyFile(source, resolve(dirname(outputPath), name));
      copied.push(name);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return copied;
}

export async function prepareStrategyUiClient({
  manifestPath = DEFAULT_MANIFEST_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
  sourcePath = DEFAULT_SOURCE_PATH,
} = {}) {
  const resolvedManifestPath = resolve(manifestPath);
  const resolvedOutputPath = resolve(outputPath);
  const resolvedSourcePath = resolve(sourcePath);
  if (await pathsReferToSameFile(resolvedSourcePath, resolvedOutputPath)) {
    throw new Error('sourcePath and outputPath must not refer to the same file');
  }
  const manifest = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  const expectedSha256 = manifest.expectedPatchedSha256?.toLowerCase();
  if (!SHA256_PATTERN.test(expectedSha256 ?? '')) {
    throw new Error('manifest expectedPatchedSha256 must be a 64-character SHA-256');
  }

  await mkdir(dirname(resolvedOutputPath), { recursive: true });
  const existingSha256 = await readExistingHash(resolvedOutputPath);
  let mode = 'reused';
  let patchCount = manifest.patches?.length ?? 0;
  if (existingSha256 !== expectedSha256) {
    const dryRun = await applyPatchManifest(
      manifest,
      resolvedSourcePath,
      resolvedOutputPath,
      { dryRun: true },
    );
    if (dryRun.sha256 !== expectedSha256) {
      throw new Error(
        `patched SHA-256 mismatch: expected ${expectedSha256}, calculated ${dryRun.sha256}`,
      );
    }
    const applied = await applyPatchManifest(manifest, resolvedSourcePath, resolvedOutputPath);
    if (applied.sha256 !== expectedSha256) {
      throw new Error(
        `patched SHA-256 mismatch: expected ${expectedSha256}, applied ${applied.sha256}`,
      );
    }
    patchCount = applied.patchCount;
    mode = 'applied';
  }

  const outputSha256 = await sha256File(resolvedOutputPath);
  if (outputSha256 !== expectedSha256) {
    throw new Error(
      `output SHA-256 mismatch: expected ${expectedSha256}, found ${outputSha256}`,
    );
  }
  const supportFiles = await copySupportFiles(resolvedSourcePath, resolvedOutputPath);
  return {
    path: resolvedOutputPath,
    sourcePath: resolvedSourcePath,
    sha256: outputSha256,
    manifestId: manifest.id ?? null,
    patchCount,
    mode,
    applied: mode === 'applied',
    reused: mode === 'reused',
    supportFiles,
  };
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
  const receipt = await prepareStrategyUiClient({
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
