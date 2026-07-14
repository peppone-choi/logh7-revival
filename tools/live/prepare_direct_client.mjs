import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { applyPatchManifest } from '../patch/exe-patch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const DEFAULT_MANIFEST_PATH = resolve(
  ROOT,
  'server/content/client/logh7-direct-client-patch.json',
);
export const DEFAULT_EXE_PATH = resolve(
  ROOT,
  'artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe',
);

async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export async function prepareDirectClient({
  manifestPath = DEFAULT_MANIFEST_PATH,
  exePath = DEFAULT_EXE_PATH,
  dryRun = false,
} = {}) {
  const resolvedManifestPath = resolve(manifestPath);
  const resolvedExePath = resolve(exePath);
  const manifest = JSON.parse(await readFile(resolvedManifestPath, 'utf8'));
  const sourceSha256 = manifest.targetExe?.sha256?.toLowerCase();
  const expectedSha256 = manifest.expectedPatchedSha256?.toLowerCase();
  if (!SHA256_PATTERN.test(sourceSha256 ?? '') || !SHA256_PATTERN.test(expectedSha256 ?? '')) {
    throw new Error('manifest source and expected patched SHA-256 must be 64-character hashes');
  }

  const currentSha256 = await sha256File(resolvedExePath);
  if (currentSha256 === expectedSha256) {
    return {
      path: resolvedExePath,
      sha256: currentSha256,
      manifestId: manifest.id ?? null,
      patchCount: manifest.patches?.length ?? 0,
      mode: 'reused',
      applied: false,
      reused: true,
    };
  }
  if (currentSha256 !== sourceSha256) {
    throw new Error(
      `exe hash mismatch: expected source ${sourceSha256} or patched ${expectedSha256}, found ${currentSha256}`,
    );
  }

  const report = await applyPatchManifest(
    manifest,
    resolvedExePath,
    resolvedExePath,
    { dryRun: true },
  );
  if (report.sha256 !== expectedSha256) {
    throw new Error(`patched SHA-256 mismatch: expected ${expectedSha256}, calculated ${report.sha256}`);
  }
  if (dryRun) {
    return {
      path: resolvedExePath,
      sha256: report.sha256,
      manifestId: manifest.id ?? null,
      patchCount: report.patchCount,
      mode: 'dry-run',
      applied: false,
      reused: false,
    };
  }

  const applied = await applyPatchManifest(manifest, resolvedExePath);
  if (applied.sha256 !== expectedSha256) {
    throw new Error(`patched SHA-256 mismatch: expected ${expectedSha256}, applied ${applied.sha256}`);
  }
  return {
    path: resolvedExePath,
    sha256: applied.sha256,
    manifestId: manifest.id ?? null,
    patchCount: applied.patchCount,
    mode: 'applied',
    applied: true,
    reused: false,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      exe: { type: 'string' },
      manifest: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const receipt = await prepareDirectClient({
    manifestPath: values.manifest ?? DEFAULT_MANIFEST_PATH,
    exePath: values.exe ?? DEFAULT_EXE_PATH,
    dryRun: values['dry-run'],
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
