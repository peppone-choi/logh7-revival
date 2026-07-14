#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HEX_RE = /^[0-9a-fA-F]+$/;
const DEFAULT_MANIFEST = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'server',
  'content',
  'generated',
  'logh7-exe-patch-manifest.json',
);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toHex(buffer) {
  return Buffer.from(buffer).toString('hex');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function parseHexBytes(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty hex string`);
  }
  if (value.length % 2 !== 0 || !HEX_RE.test(value)) {
    throw new Error(`${label} must contain an even number of hex characters`);
  }
  return Buffer.from(value, 'hex');
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function resolvePatchOffset(patch, manifest, index) {
  const kind = patch.addressKind;
  if (kind === 'offset') {
    return requireInteger(patch.offset, `patches[${index}].offset`);
  }

  if (kind === 'rva') {
    return requireInteger(patch.rva, `patches[${index}].rva`);
  }

  if (kind === 'va') {
    const imageBase = patch.imageBase ?? manifest.targetExe?.imageBase;
    if (!Number.isInteger(imageBase) || imageBase < 0) {
      throw new Error(`patches[${index}].imageBase must be set for va patches`);
    }
    const va = requireInteger(patch.va, `patches[${index}].va`);
    if (va < imageBase) {
      throw new Error(`patches[${index}].va must be >= imageBase`);
    }
    return va - imageBase;
  }

  throw new Error(`patches[${index}].addressKind must be offset, rva, or va`);
}

function normalizeManifest(manifest, manifestPath = '<memory>') {
  if (!isObject(manifest)) {
    throw new Error(`manifest at ${manifestPath} must be an object`);
  }

  const schemaVersion = requireInteger(manifest.schemaVersion, 'schemaVersion');
  if (schemaVersion !== 1) {
    throw new Error('schemaVersion must be 1');
  }

  if (!isObject(manifest.targetExe)) {
    throw new Error('targetExe must be an object');
  }

  const targetExe = {
    name: requireString(manifest.targetExe.name, 'targetExe.name'),
    sha256: requireString(manifest.targetExe.sha256, 'targetExe.sha256').toLowerCase(),
    imageBase: manifest.targetExe.imageBase ?? null,
    pathHints: Array.isArray(manifest.targetExe.pathHints) ? manifest.targetExe.pathHints.slice() : [],
  };

  if (targetExe.imageBase !== null && (!Number.isInteger(targetExe.imageBase) || targetExe.imageBase < 0)) {
    throw new Error('targetExe.imageBase must be a non-negative integer or null');
  }

  const patches = Array.isArray(manifest.patches) ? manifest.patches.slice() : [];
  const normalizedPatches = patches.map((patch, index) => {
    if (!isObject(patch)) {
      throw new Error(`patches[${index}] must be an object`);
    }

    const sourceExeSha256 = requireString(patch.sourceExeSha256, `patches[${index}].sourceExeSha256`).toLowerCase();
    const originalBytes = parseHexBytes(patch.originalBytes, `patches[${index}].originalBytes`);
    const patchedBytes = parseHexBytes(patch.patchedBytes, `patches[${index}].patchedBytes`);
    const rollbackBytes = parseHexBytes(patch.rollbackBytes, `patches[${index}].rollbackBytes`);
    if (originalBytes.length !== patchedBytes.length || originalBytes.length !== rollbackBytes.length) {
      throw new Error(`patches[${index}] originalBytes, patchedBytes, and rollbackBytes must have the same length`);
    }

    const addressKind = requireString(patch.addressKind, `patches[${index}].addressKind`);
    const offset = resolvePatchOffset(patch, manifest, index);
    const reason = requireString(patch.reason, `patches[${index}].reason`);
    const id = requireString(patch.id, `patches[${index}].id`);

    return {
      id,
      sourceExeSha256,
      addressKind,
      offset,
      originalBytes,
      patchedBytes,
      rollbackBytes,
      reason,
    };
  });

  const sorted = normalizedPatches
    .map((patch, index) => ({ patch, index }))
    .sort((a, b) => a.patch.offset - b.patch.offset || a.index - b.index);

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].patch;
    const cur = sorted[i].patch;
    const prevEnd = prev.offset + prev.originalBytes.length;
    if (cur.offset < prevEnd) {
      throw new Error(`patches[${sorted[i].index}] overlaps a previous patch`);
    }
  }

  return {
    ...manifest,
    schemaVersion,
    targetExe,
    patches: normalizedPatches,
  };
}

async function loadManifest(manifestPath) {
  const text = await readFile(manifestPath, 'utf8');
  return normalizeManifest(JSON.parse(text), manifestPath);
}

function validatePatchBuffer(buffer, patch, fieldName, index) {
  const expected = patch[fieldName];
  const actual = buffer.subarray(patch.offset, patch.offset + expected.length);
  if (!actual.equals(expected)) {
    throw new Error(
      `patches[${index}] ${fieldName} mismatch at offset 0x${patch.offset.toString(16)}: expected ${toHex(expected)}, found ${toHex(actual)}`,
    );
  }
}

async function inspectManifest(manifest, exePath, { fieldName = 'originalBytes', checkHash = true } = {}) {
  const exeBuffer = await readFile(exePath);
  const fileHash = sha256(exeBuffer);
  if (checkHash) {
    if (fileHash !== manifest.targetExe.sha256) {
      throw new Error(`source exe hash mismatch: expected ${manifest.targetExe.sha256}, found ${fileHash}`);
    }

    for (const patch of manifest.patches) {
      if (patch.sourceExeSha256 !== manifest.targetExe.sha256) {
        throw new Error(`patch ${patch.id} sourceExeSha256 must match targetExe.sha256`);
      }
    }
  }

  for (let index = 0; index < manifest.patches.length; index += 1) {
    const patch = manifest.patches[index];
    const expected = patch[fieldName];
    const end = patch.offset + expected.length;
    if (end > exeBuffer.length) {
      throw new Error(`patches[${index}] extends past the end of the file`);
    }
    validatePatchBuffer(exeBuffer, patch, fieldName, index);
  }

  return { exeBuffer, fileHash };
}

async function writeFileAtomic(filePath, buffer) {
  const tmpPath = join(dirname(filePath), `${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(tmpPath, buffer);
  try {
    await rename(tmpPath, filePath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}

export async function validatePatchManifest(manifestOrPath, exePath, { dryRun = false } = {}) {
  const manifest = typeof manifestOrPath === 'string' ? await loadManifest(manifestOrPath) : normalizeManifest(manifestOrPath);
  await inspectManifest(manifest, exePath, { fieldName: 'originalBytes' });
  return {
    mode: dryRun ? 'dry-run' : 'validate',
    manifestId: manifest.id ?? null,
    targetExe: manifest.targetExe.name,
    patchCount: manifest.patches.length,
  };
}

export async function applyPatchManifest(manifestOrPath, exePath, outputPath = exePath, { dryRun = false } = {}) {
  const manifest = typeof manifestOrPath === 'string' ? await loadManifest(manifestOrPath) : normalizeManifest(manifestOrPath);
  const { exeBuffer } = await inspectManifest(manifest, exePath, { fieldName: 'originalBytes' });
  const patched = Buffer.from(exeBuffer);

  for (const patch of manifest.patches) {
    patch.patchedBytes.copy(patched, patch.offset);
  }

  if (!dryRun) {
    await writeFileAtomic(outputPath, patched);
  }

  return {
    mode: dryRun ? 'dry-run-apply' : 'apply',
    manifestId: manifest.id ?? null,
    targetExe: manifest.targetExe.name,
    patchCount: manifest.patches.length,
    outputPath,
    sha256: sha256(patched),
  };
}

export async function rollbackPatchManifest(manifestOrPath, exePath, outputPath = exePath, { dryRun = false } = {}) {
  const manifest = typeof manifestOrPath === 'string' ? await loadManifest(manifestOrPath) : normalizeManifest(manifestOrPath);
  const { exeBuffer } = await inspectManifest(manifest, exePath, { fieldName: 'patchedBytes', checkHash: false });
  const restored = Buffer.from(exeBuffer);

  for (const patch of manifest.patches) {
    patch.rollbackBytes.copy(restored, patch.offset);
  }

  if (!dryRun) {
    await writeFileAtomic(outputPath, restored);
  }

  return {
    mode: dryRun ? 'dry-run-rollback' : 'rollback',
    manifestId: manifest.id ?? null,
    targetExe: manifest.targetExe.name,
    patchCount: manifest.patches.length,
    outputPath,
    sha256: sha256(restored),
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      manifest: { type: 'string', short: 'm' },
      exe: { type: 'string', short: 'e' },
      output: { type: 'string', short: 'o' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  const command = positionals[0];
  const manifestPath = resolve(values.manifest ?? DEFAULT_MANIFEST);
  const exePath = values.exe ? resolve(values.exe) : null;
  const outputPath = values.output ? resolve(values.output) : null;
  const dryRun = Boolean(values['dry-run']);

  if (values.help || !command) {
    process.stdout.write([
      'Usage:',
      '  exe-patch.mjs validate --manifest <manifest.json> --exe <source.exe> [--dry-run]',
      '  exe-patch.mjs apply --manifest <manifest.json> --exe <source.exe> [--output <patched.exe>] [--dry-run]',
      '  exe-patch.mjs rollback --manifest <manifest.json> --exe <patched.exe> [--output <restored.exe>] [--dry-run]',
    ].join('\n') + '\n');
    return 0;
  }

  if (!exePath) {
    throw new Error('--exe is required');
  }

  if (command === 'validate') {
    const report = await validatePatchManifest(manifestPath, exePath, { dryRun });
    process.stdout.write(`validated ${report.patchCount} patch(es) against ${report.targetExe}\n`);
    return 0;
  }

  if (command === 'apply') {
    const report = await applyPatchManifest(manifestPath, exePath, outputPath ?? exePath, { dryRun });
    process.stdout.write(`${dryRun ? 'dry-run applied' : 'applied'} ${report.patchCount} patch(es) to ${report.outputPath}\n`);
    return 0;
  }

  if (command === 'rollback') {
    const report = await rollbackPatchManifest(manifestPath, exePath, outputPath ?? exePath, { dryRun });
    process.stdout.write(`${dryRun ? 'dry-run rolled back' : 'rolled back'} ${report.patchCount} patch(es) to ${report.outputPath}\n`);
    return 0;
  }

  throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
