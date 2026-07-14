#!/usr/bin/env node
// 로그인 패널은 원본 크기로 두고, 검증된 59개 로그인 이후 1080p 패치를 준비한다.

import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { applyPatchManifest } from '../patch/exe-patch.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
export const DEFAULT_MANIFEST_PATH = resolve(
  ROOT,
  'server/content/client/logh7-1080p-client-patch.json',
);
export const DEFAULT_EXE_PATH = resolve(
  ROOT,
  'artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe',
);
export const DEFAULT_CONFIG_PATH = resolve(
  ROOT,
  'artifacts/logh7-install/____________s___/____/GraphicConfig.txt',
);

export async function prepare1080pClient({
  configPath = DEFAULT_CONFIG_PATH,
  dryRun = false,
  exePath = DEFAULT_EXE_PATH,
  manifestPath = DEFAULT_MANIFEST_PATH,
} = {}) {
  const resolvedConfigPath = resolve(configPath);
  const resolvedExePath = resolve(exePath);
  const resolvedManifestPath = resolve(manifestPath);
  const [configText, exeBuffer, manifestText] = await Promise.all([
    readFile(resolvedConfigPath, 'utf8'),
    readFile(resolvedExePath),
    readFile(resolvedManifestPath, 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);
  const sourceSha256 = manifest.targetExe?.sha256?.toLowerCase();
  const expectedSha256 = manifest.expectedPatchedSha256?.toLowerCase();
  if (!SHA256_PATTERN.test(sourceSha256 ?? '') || !SHA256_PATTERN.test(expectedSha256 ?? '')) {
    throw new Error('manifest source and expected patched SHA-256 must be 64-character hashes');
  }

  const newline = configText.includes('\r\n') ? '\r\n' : '\n';
  const configLines = configText.split(/\r?\n/);
  for (const [key, value] of [['ScreenWidth', '1920'], ['ScreenHeight', '1080']]) {
    const index = configLines.indexOf(key);
    if (index === -1) {
      throw new Error(`${key} is missing from GraphicConfig`);
    }
    if (configLines.indexOf(key, index + 1) !== -1) {
      throw new Error(`${key} appears more than once in GraphicConfig`);
    }
    if (!/^\d+$/.test(configLines[index + 1] ?? '')) {
      throw new Error(`${key} must be followed by an integer in GraphicConfig`);
    }
    configLines[index + 1] = value;
  }
  const updatedConfig = configLines.join(newline);

  const currentSha256 = createHash('sha256').update(exeBuffer).digest('hex');
  const sourceReady = currentSha256 === sourceSha256;
  const patchedReady = currentSha256 === expectedSha256;
  if (!sourceReady && !patchedReady) {
    throw new Error(
      `exe hash mismatch: expected source ${sourceSha256} or patched ${expectedSha256}, found ${currentSha256}`,
    );
  }

  if (sourceReady) {
    const validation = await applyPatchManifest(
      manifest,
      resolvedExePath,
      resolvedExePath,
      { dryRun: true },
    );
    if (validation.sha256 !== expectedSha256) {
      throw new Error(
        `patched SHA-256 mismatch: expected ${expectedSha256}, calculated ${validation.sha256}`,
      );
    }
  }

  if (dryRun) {
    return {
      path: resolvedExePath,
      configPath: resolvedConfigPath,
      sha256: expectedSha256,
      manifestId: manifest.id ?? null,
      patchCount: manifest.patches?.length ?? 0,
      mode: 'dry-run',
      applied: false,
      reused: patchedReady,
    };
  }

  if (sourceReady) {
    const applied = await applyPatchManifest(manifest, resolvedExePath);
    if (applied.sha256 !== expectedSha256) {
      throw new Error(
        `patched SHA-256 mismatch: expected ${expectedSha256}, applied ${applied.sha256}`,
      );
    }
  }

  if (updatedConfig !== configText) {
    const temporaryPath = join(
      dirname(resolvedConfigPath),
      `${basename(resolvedConfigPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryPath, updatedConfig, 'utf8');
      await rename(temporaryPath, resolvedConfigPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  return {
    path: resolvedExePath,
    configPath: resolvedConfigPath,
    sha256: expectedSha256,
    manifestId: manifest.id ?? null,
    patchCount: manifest.patches?.length ?? 0,
    mode: sourceReady ? 'applied' : 'reused',
    applied: sourceReady,
    reused: patchedReady,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      exe: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
      manifest: { type: 'string' },
    },
  });
  if (values.help) {
    process.stdout.write(
      'Usage: node tools/live/prepare_1080p_client.mjs [--dry-run] [--exe <path>] [--config <path>] [--manifest <path>]\n',
    );
    return 0;
  }
  const receipt = await prepare1080pClient({
    configPath: values.config ?? DEFAULT_CONFIG_PATH,
    dryRun: values['dry-run'],
    exePath: values.exe ?? DEFAULT_EXE_PATH,
    manifestPath: values.manifest ?? DEFAULT_MANIFEST_PATH,
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
