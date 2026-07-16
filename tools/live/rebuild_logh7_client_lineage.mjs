#!/usr/bin/env node
// proprietary EXE를 저장소 밖에서만 재구성하고 Wine P0가 검증할 계보 영수증을 만든다.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import {
  applyPatchManifest,
  rollbackPatchManifest,
} from '../patch/exe-patch.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const THIS_TOOL_PATH = fileURLToPath(import.meta.url);
const EXE_PATCH_TOOL_PATH = resolve(ROOT, 'tools/patch/exe-patch.mjs');
const SHA256_RE = /^[0-9a-f]{64}$/;

export const DEFAULT_PATHS = Object.freeze({
  loopbackManifestPath: resolve(ROOT, 'server/content/client/logh7-loopback-client-patch.json'),
  canonicalManifestPath: resolve(ROOT, 'server/content/client/logh7-canonical-client-patch.json'),
  resourcePatcherPath: resolve(ROOT, 'tools/patch/logh7_rsrc_patch.py'),
  resourceMapPath: resolve(ROOT, 'server/content/localization/hardcoded-ui-ko.json'),
  directManifestPath: resolve(ROOT, 'server/content/client/logh7-direct-client-patch.json'),
  highResolutionManifestPath: resolve(ROOT, 'server/content/client/logh7-1080p-client-patch.json'),
});

export const PRODUCTION_CONTRACT = Object.freeze({
  sourceSha256: 'bd19263c10decc3d58373165a82d42a9267868400d407da87d5f4f4109ab6e16',
  loopbackOutputSha256: '2848be76a7662e25159353463bdfd8ff2f270ac5845ef4cea62983443c155345',
  canonicalOutputSha256: '9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51',
  resourceOutputSha256: '24d79d90e1618309f05932156787e5a140d5f6d57ce008f6c09b00360da3ab3b',
  resourcePatchCount: 136,
  loopbackPatchCount: 1,
  canonicalPatchCount: 6,
  directPatchCount: 10,
  highResolutionPatchCount: 59,
  exePatchToolSha256: '80f72f3bc646903e3592ac122e56d29feb806da0016dc898b07b31789e418b99',
  resourcePatcherSha256: 'ee82a50869e1682d8e311afba3efa1a9eb25c72a42436052b9e957046c9099a8',
  resourceMapSha256: '8a3ddbea67c7b2b2624f76292ebe51973c4edd27cb541f12aa535bfdc5038933',
  directOutputSha256: '5bdd64f1f9a8cca93f5b1002291d6a2c7e8f5ce555b062b8cb48337b96277d89',
  finalSha256: '825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22',
});

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

function requireSha256(value, label) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (!SHA256_RE.test(normalized)) {
    throw new Error(`${label} must be a 64-character lowercase SHA-256`);
  }
  return normalized;
}

function requireAbsolute(value, label) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error(`${label} must be an absolute path`);
  }
  return value;
}

function isWithin(path, parent) {
  return path === parent || path.startsWith(`${parent}${sep}`);
}

async function existingAbsoluteFile(rawPath, label, { executable = false } = {}) {
  requireAbsolute(rawPath, label);
  const path = await realpath(rawPath);
  const info = await stat(path);
  if (!info.isFile()) throw new Error(`${label} must resolve to a regular file: ${path}`);
  if (executable) {
    await access(path, fsConstants.X_OK).catch(() => {
      throw new Error(`${label} must be executable: ${path}`);
    });
  }
  return path;
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function resolveFreshExternalRoot(rawOutputRoot, repoRoot) {
  requireAbsolute(rawOutputRoot, 'outputRoot');
  const requested = resolve(rawOutputRoot);
  const parent = await realpath(dirname(requested));
  const outputRoot = join(parent, basename(requested));
  if (isWithin(outputRoot, repoRoot)) {
    throw new Error(`outputRoot must be outside the repository: ${outputRoot}`);
  }
  if (await pathExists(outputRoot)) {
    throw new Error(`outputRoot already exists; overwrite/reuse is forbidden: ${outputRoot}`);
  }
  return outputRoot;
}

async function readJsonObject(path, label) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value;
}

async function inspectPatchManifest(path, label) {
  const manifest = await readJsonObject(path, label);
  const inputSha256 = requireSha256(manifest.targetExe?.sha256, `${label}.targetExe.sha256`);
  const outputSha256 = requireSha256(manifest.expectedPatchedSha256, `${label}.expectedPatchedSha256`);
  if (!Array.isArray(manifest.patches) || manifest.patches.length === 0) {
    throw new Error(`${label}.patches must be a non-empty array`);
  }
  for (const [index, patch] of manifest.patches.entries()) {
    if (patch?.sourceExeSha256?.toLowerCase() !== inputSha256) {
      throw new Error(`${label}.patches[${index}].sourceExeSha256 does not match targetExe`);
    }
    if (patch.addressKind !== 'offset' || !Number.isInteger(patch.offset) || patch.offset < 0) {
      throw new Error(`${label}.patches[${index}] must use a non-negative file offset`);
    }
    const patchedBytes = Buffer.from(patch.patchedBytes ?? '', 'hex');
    if (patchedBytes.length === 0 || patchedBytes.toString('hex') !== patch.patchedBytes?.toLowerCase()) {
      throw new Error(`${label}.patches[${index}].patchedBytes must be non-empty even-length hex`);
    }
  }
  return {
    id: manifest.id ?? label,
    inputSha256,
    manifest,
    outputSha256,
    patchCount: manifest.patches.length,
    path,
    sha256: await sha256File(path),
  };
}

function inspectPe(buffer) {
  if (buffer.length < 0x40 || buffer.subarray(0, 2).toString('ascii') !== 'MZ') {
    throw new Error('client is missing the MZ header');
  }
  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 56 > buffer.length || buffer.subarray(peOffset, peOffset + 4).toString('hex') !== '50450000') {
    throw new Error('client is missing the PE signature');
  }
  const timestamp = buffer.readUInt32LE(peOffset + 8);
  const optionalOffset = peOffset + 24;
  const optionalMagic = buffer.readUInt16LE(optionalOffset);
  let imageBase;
  if (optionalMagic === 0x10b) imageBase = buffer.readUInt32LE(optionalOffset + 28);
  else if (optionalMagic === 0x20b) imageBase = Number(buffer.readBigUInt64LE(optionalOffset + 24));
  else throw new Error(`unsupported PE optional-header magic 0x${optionalMagic.toString(16)}`);
  return { imageBase, optionalMagic, timestamp };
}

async function copyAndVerify(source, destination, expectedSha256, mode = null) {
  if (await pathExists(destination)) throw new Error(`destination already exists: ${destination}`);
  await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
  if (mode !== null) await chmod(destination, mode);
  const actualSha256 = await sha256File(destination);
  if (actualSha256 !== expectedSha256) {
    throw new Error(`copied file hash mismatch at ${destination}: expected ${expectedSha256}, found ${actualSha256}`);
  }
  return { path: destination, sha256: actualSha256, size: (await stat(destination)).size };
}

function finalPathFor(stagingRoot, outputRoot, path) {
  const rel = relative(stagingRoot, path);
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`internal path escaped staging root: ${path}`);
  }
  return join(outputRoot, rel);
}

async function writeJson(path, value) {
  if (await pathExists(path)) throw new Error(`JSON destination already exists: ${path}`);
  await writeFile(path, jsonBytes(value), { flag: 'wx', mode: 0o444 });
  return sha256File(path);
}

function assertStageChain(stages, canonicalSha256, workingSha256) {
  let previous = canonicalSha256;
  for (const stage of stages) {
    if (stage.inputSha256 !== previous) {
      throw new Error(`stage chain is broken before ${stage.id}`);
    }
    previous = stage.outputSha256;
  }
  if (previous !== workingSha256) throw new Error('final stage does not match the working client');
}

function collectSentinels(finalBuffer, patchStages) {
  const sentinels = [];
  const ranges = [];
  for (const stage of patchStages) {
    for (const patch of stage.manifest.patches) {
      const expected = Buffer.from(patch.patchedBytes, 'hex');
      const end = patch.offset + expected.length;
      if (end > finalBuffer.length) throw new Error(`final sentinel exceeds file: ${stage.id}/${patch.id}`);
      const actual = finalBuffer.subarray(patch.offset, end);
      if (!actual.equals(expected)) {
        throw new Error(`final sentinel mismatch: ${stage.id}/${patch.id}`);
      }
      for (const range of ranges) {
        if (patch.offset < range.end && end > range.offset) {
          throw new Error(`final sentinel ranges overlap: ${range.id} and ${stage.id}/${patch.id}`);
        }
      }
      ranges.push({ end, id: `${stage.id}/${patch.id}`, offset: patch.offset });
      sentinels.push({
        hex: actual.toString('hex'),
        id: `${stage.id}/${patch.id}`,
        offset: patch.offset,
        sha256: sha256Bytes(actual),
      });
    }
  }
  for (const [id, offset] of [['file-head', 0], ['file-tail', Math.max(0, finalBuffer.length - 16)]]) {
    const bytes = finalBuffer.subarray(offset, Math.min(finalBuffer.length, offset + 16));
    sentinels.push({ hex: bytes.toString('hex'), id, offset, sha256: sha256Bytes(bytes) });
  }
  return sentinels.sort((left, right) => left.offset - right.offset || left.id.localeCompare(right.id));
}

function parseResourceReport(stdout, expectedInputSha256, expectedOutputSha256, expectedPatchCount) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`resource patcher did not emit one JSON object: ${error.message}`);
  }
  if (report.sourceSha256?.toLowerCase() !== expectedInputSha256) {
    throw new Error('resource patcher sourceSha256 mismatch');
  }
  if (report.outputSha256?.toLowerCase() !== expectedOutputSha256) {
    throw new Error('resource patcher outputSha256 mismatch');
  }
  if (report.applied !== expectedPatchCount || report.verifiedPresent !== expectedPatchCount) {
    throw new Error(`resource patch count mismatch: expected ${expectedPatchCount}, got ${report.applied}/${report.verifiedPresent}`);
  }
  if (report.skippedMismatch !== 0 || report.verifyOk !== true) {
    throw new Error('resource patcher did not close all source guards');
  }
  return report;
}

export async function rebuildLogh7ClientLineage({
  sourcePath: rawSourcePath,
  outputRoot: rawOutputRoot,
  pythonPath: rawPythonPath,
  loopbackManifestPath: rawLoopbackManifestPath = DEFAULT_PATHS.loopbackManifestPath,
  canonicalManifestPath: rawCanonicalManifestPath = DEFAULT_PATHS.canonicalManifestPath,
  resourcePatcherPath: rawResourcePatcherPath = DEFAULT_PATHS.resourcePatcherPath,
  resourceMapPath: rawResourceMapPath = DEFAULT_PATHS.resourceMapPath,
  directManifestPath: rawDirectManifestPath = DEFAULT_PATHS.directManifestPath,
  highResolutionManifestPath: rawHighResolutionManifestPath = DEFAULT_PATHS.highResolutionManifestPath,
  sourceSha256 = PRODUCTION_CONTRACT.sourceSha256,
  loopbackOutputSha256 = PRODUCTION_CONTRACT.loopbackOutputSha256,
  canonicalOutputSha256 = PRODUCTION_CONTRACT.canonicalOutputSha256,
  resourceOutputSha256 = PRODUCTION_CONTRACT.resourceOutputSha256,
  resourcePatchCount = PRODUCTION_CONTRACT.resourcePatchCount,
  loopbackPatchCount = PRODUCTION_CONTRACT.loopbackPatchCount,
  canonicalPatchCount = PRODUCTION_CONTRACT.canonicalPatchCount,
  directPatchCount = PRODUCTION_CONTRACT.directPatchCount,
  highResolutionPatchCount = PRODUCTION_CONTRACT.highResolutionPatchCount,
  directOutputSha256 = PRODUCTION_CONTRACT.directOutputSha256,
  finalSha256 = PRODUCTION_CONTRACT.finalSha256,
  expectedExePatchToolSha256 = PRODUCTION_CONTRACT.exePatchToolSha256,
  expectedResourcePatcherSha256 = PRODUCTION_CONTRACT.resourcePatcherSha256,
  expectedResourceMapSha256 = PRODUCTION_CONTRACT.resourceMapSha256,
} = {}) {
  const repoRoot = await realpath(ROOT);
  const sourcePath = await existingAbsoluteFile(rawSourcePath, 'sourcePath');
  const pythonPath = await existingAbsoluteFile(rawPythonPath, 'pythonPath', { executable: true });
  const outputRoot = await resolveFreshExternalRoot(rawOutputRoot, repoRoot);
  const loopbackManifestPath = await existingAbsoluteFile(rawLoopbackManifestPath, 'loopbackManifestPath');
  const canonicalManifestPath = await existingAbsoluteFile(rawCanonicalManifestPath, 'canonicalManifestPath');
  const resourcePatcherPath = await existingAbsoluteFile(rawResourcePatcherPath, 'resourcePatcherPath');
  const resourceMapPath = await existingAbsoluteFile(rawResourceMapPath, 'resourceMapPath');
  const directManifestPath = await existingAbsoluteFile(rawDirectManifestPath, 'directManifestPath');
  const highResolutionManifestPath = await existingAbsoluteFile(rawHighResolutionManifestPath, 'highResolutionManifestPath');

  const expectedExeTool = requireSha256(expectedExePatchToolSha256, 'expectedExePatchToolSha256');
  const expectedResourceTool = requireSha256(expectedResourcePatcherSha256, 'expectedResourcePatcherSha256');
  const expectedMap = requireSha256(expectedResourceMapSha256, 'expectedResourceMapSha256');
  const expectedSource = requireSha256(sourceSha256, 'sourceSha256');
  const expectedLoopbackOutput = requireSha256(loopbackOutputSha256, 'loopbackOutputSha256');
  const expectedCanonicalOutput = requireSha256(canonicalOutputSha256, 'canonicalOutputSha256');
  const expectedResourceOutput = requireSha256(resourceOutputSha256, 'resourceOutputSha256');
  const expectedDirectOutput = requireSha256(directOutputSha256, 'directOutputSha256');
  const expectedFinal = requireSha256(finalSha256, 'finalSha256');
  for (const [label, count] of Object.entries({
    loopbackPatchCount,
    canonicalPatchCount,
    resourcePatchCount,
    directPatchCount,
    highResolutionPatchCount,
  })) {
    if (!Number.isInteger(count) || count <= 0) throw new Error(`${label} must be a positive integer`);
  }

  const [exePatchToolSha256, resourcePatcherSha256, resourceMapSha256, pythonSha256, builderSha256] = await Promise.all([
    sha256File(EXE_PATCH_TOOL_PATH),
    sha256File(resourcePatcherPath),
    sha256File(resourceMapPath),
    sha256File(pythonPath),
    sha256File(THIS_TOOL_PATH),
  ]);
  if (exePatchToolSha256 !== expectedExeTool) throw new Error('exe-patch tool hash mismatch');
  if (resourcePatcherSha256 !== expectedResourceTool) throw new Error('resource patcher tool hash mismatch');
  if (resourceMapSha256 !== expectedMap) throw new Error('resource map hash mismatch');

  const patchStages = await Promise.all([
    inspectPatchManifest(loopbackManifestPath, 'loopback manifest'),
    inspectPatchManifest(canonicalManifestPath, 'canonical manifest'),
    inspectPatchManifest(directManifestPath, 'direct manifest'),
    inspectPatchManifest(highResolutionManifestPath, '1080p manifest'),
  ]);
  const [loopbackStage, canonicalStage, directStage, highResolutionStage] = patchStages;
  if (loopbackStage.inputSha256 !== expectedSource) throw new Error('loopback manifest source contract mismatch');
  if (loopbackStage.outputSha256 !== expectedLoopbackOutput) throw new Error('loopback manifest output contract mismatch');
  if (canonicalStage.outputSha256 !== expectedCanonicalOutput) throw new Error('canonical manifest output contract mismatch');
  if (directStage.outputSha256 !== expectedDirectOutput) throw new Error('direct manifest output contract mismatch');
  if (highResolutionStage.outputSha256 !== expectedFinal) throw new Error('1080p manifest output contract mismatch');
  for (const [label, actual, expected] of [
    ['loopback', loopbackStage.patchCount, loopbackPatchCount],
    ['canonical', canonicalStage.patchCount, canonicalPatchCount],
    ['direct', directStage.patchCount, directPatchCount],
    ['1080p', highResolutionStage.patchCount, highResolutionPatchCount],
  ]) {
    if (actual !== expected) throw new Error(`${label} manifest patch count mismatch: expected ${expected}, found ${actual}`);
  }
  const actualSourceSha256 = await sha256File(sourcePath);
  if (actualSourceSha256 !== expectedSource) throw new Error(`source hash mismatch: expected ${expectedSource}`);
  if (canonicalStage.inputSha256 !== loopbackStage.outputSha256) throw new Error('loopback → canonical manifest chain mismatch');
  if (expectedResourceOutput !== directStage.inputSha256) throw new Error('resource → direct manifest chain mismatch');
  if (highResolutionStage.inputSha256 !== directStage.outputSha256) throw new Error('direct → 1080p manifest chain mismatch');

  const stagingRoot = await mkdtemp(join(dirname(outputRoot), `.${basename(outputRoot)}.building-`));
  let promoted = false;
  try {
    const canonicalDir = join(stagingRoot, 'canonical');
    const stagesDir = join(stagingRoot, 'stages');
    const workingDir = join(stagingRoot, 'working');
    await Promise.all([
      mkdir(canonicalDir, { recursive: true }),
      mkdir(stagesDir, { recursive: true }),
      mkdir(workingDir, { recursive: true }),
    ]);

    const canonicalPath = join(canonicalDir, 'G7MTClient.exe');
    const canonicalArtifact = await copyAndVerify(sourcePath, canonicalPath, loopbackStage.inputSha256, 0o444);
    const canonicalPe = inspectPe(await readFile(canonicalPath));
    let currentPath = canonicalPath;
    let currentSha256 = canonicalArtifact.sha256;
    const lineageStages = [];

    const runManifestStage = async (sequence, id, contract) => {
      if (currentSha256 !== contract.inputSha256) throw new Error(`${id} input hash chain mismatch`);
      const stageDir = join(stagesDir, `${String(sequence).padStart(2, '0')}-${id}`);
      await mkdir(stageDir);
      const backupPath = join(stageDir, 'input-backup.exe');
      const outputPath = join(stageDir, 'output.exe');
      const rollbackPath = join(stageDir, 'rollback.exe');
      const receiptPath = join(stageDir, 'receipt.json');
      const backup = await copyAndVerify(currentPath, backupPath, contract.inputSha256, 0o444);
      const report = await applyPatchManifest(contract.path, currentPath, outputPath);
      if (report.patchCount !== contract.patchCount) throw new Error(`${id} patch count mismatch`);
      const outputSha256 = await sha256File(outputPath);
      if (report.sha256 !== contract.outputSha256 || outputSha256 !== contract.outputSha256) {
        throw new Error(`${id} output hash mismatch`);
      }
      const rollbackReport = await rollbackPatchManifest(contract.path, outputPath, rollbackPath);
      if (rollbackReport.patchCount !== contract.patchCount || rollbackReport.sha256 !== contract.inputSha256) {
        throw new Error(`${id} rollback report mismatch`);
      }
      const rollbackSha256 = await sha256File(rollbackPath);
      if (rollbackSha256 !== contract.inputSha256) throw new Error(`${id} rollback hash mismatch`);
      await chmod(rollbackPath, 0o444);

      const receipt = {
        schemaVersion: 1,
        project: 'logh7-revival',
        status: 'complete',
        stageId: id,
        kind: 'guarded-fixed-bytes',
        input: { path: finalPathFor(stagingRoot, outputRoot, currentPath), sha256: currentSha256 },
        output: { path: finalPathFor(stagingRoot, outputRoot, outputPath), sha256: outputSha256 },
        backup: { path: finalPathFor(stagingRoot, outputRoot, backupPath), sha256: backup.sha256 },
        rollback: { path: finalPathFor(stagingRoot, outputRoot, rollbackPath), sha256: rollbackSha256 },
        patch: {
          count: report.patchCount,
          manifestId: contract.id,
          manifestPath: contract.path,
          manifestSha256: contract.sha256,
        },
        tool: { path: EXE_PATCH_TOOL_PATH, sha256: exePatchToolSha256 },
      };
      const receiptSha256 = await writeJson(receiptPath, receipt);
      lineageStages.push({
        id,
        inputSha256: currentSha256,
        outputSha256,
        patchCount: report.patchCount,
        tool: { path: EXE_PATCH_TOOL_PATH, sha256: exePatchToolSha256 },
        output: { path: finalPathFor(stagingRoot, outputRoot, outputPath), sha256: outputSha256 },
        receipt: { path: finalPathFor(stagingRoot, outputRoot, receiptPath), sha256: receiptSha256 },
        backup: { path: finalPathFor(stagingRoot, outputRoot, backupPath), sha256: backup.sha256 },
        rollback: { path: finalPathFor(stagingRoot, outputRoot, rollbackPath), sha256: rollbackSha256 },
      });
      currentPath = outputPath;
      currentSha256 = outputSha256;
    };

    const runResourceStage = async (sequence) => {
      const id = 'hardcoded-ui-ko-resources';
      if (currentSha256 !== canonicalStage.outputSha256) throw new Error(`${id} input hash chain mismatch`);
      const stageDir = join(stagesDir, `${String(sequence).padStart(2, '0')}-${id}`);
      await mkdir(stageDir);
      const backupPath = join(stageDir, 'input-backup.exe');
      const outputPath = join(stageDir, 'output.exe');
      const rollbackPath = join(stageDir, 'rollback.exe');
      const receiptPath = join(stageDir, 'receipt.json');
      const backup = await copyAndVerify(currentPath, backupPath, currentSha256, 0o444);
      const { stdout, stderr } = await execFileAsync(pythonPath, [
        resourcePatcherPath,
        'patch',
        '--exe', currentPath,
        '--out', outputPath,
        '--map', resourceMapPath,
        '--expect-sha256', currentSha256,
      ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      const patcherReport = parseResourceReport(stdout, currentSha256, expectedResourceOutput, resourcePatchCount);
      const outputSha256 = await sha256File(outputPath);
      if (outputSha256 !== expectedResourceOutput) throw new Error(`${id} output file hash mismatch`);
      const rollback = await copyAndVerify(backupPath, rollbackPath, currentSha256, 0o444);
      const receipt = {
        schemaVersion: 1,
        project: 'logh7-revival',
        status: 'complete',
        stageId: id,
        kind: 'pe-resource-rebuild',
        input: { path: finalPathFor(stagingRoot, outputRoot, currentPath), sha256: currentSha256 },
        output: { path: finalPathFor(stagingRoot, outputRoot, outputPath), sha256: outputSha256 },
        backup: { path: finalPathFor(stagingRoot, outputRoot, backupPath), sha256: backup.sha256 },
        rollback: { path: finalPathFor(stagingRoot, outputRoot, rollbackPath), sha256: rollback.sha256 },
        patch: {
          count: patcherReport.applied,
          mapPath: resourceMapPath,
          mapSha256: resourceMapSha256,
          verifiedPresent: patcherReport.verifiedPresent,
        },
        tool: { path: resourcePatcherPath, sha256: resourcePatcherSha256 },
        interpreter: { path: pythonPath, sha256: pythonSha256 },
        stderrSha256: sha256Bytes(Buffer.from(stderr, 'utf8')),
      };
      const receiptSha256 = await writeJson(receiptPath, receipt);
      lineageStages.push({
        id,
        inputSha256: currentSha256,
        outputSha256,
        patchCount: patcherReport.applied,
        tool: { path: resourcePatcherPath, sha256: resourcePatcherSha256 },
        output: { path: finalPathFor(stagingRoot, outputRoot, outputPath), sha256: outputSha256 },
        receipt: { path: finalPathFor(stagingRoot, outputRoot, receiptPath), sha256: receiptSha256 },
        backup: { path: finalPathFor(stagingRoot, outputRoot, backupPath), sha256: backup.sha256 },
        rollback: { path: finalPathFor(stagingRoot, outputRoot, rollbackPath), sha256: rollback.sha256 },
      });
      currentPath = outputPath;
      currentSha256 = outputSha256;
    };

    await runManifestStage(1, 'loopback-login-server', loopbackStage);
    await runManifestStage(2, 'canonical-six-patches', canonicalStage);
    await runResourceStage(3);
    await runManifestStage(4, 'direct-client', directStage);
    await runManifestStage(5, 'post-login-1080p', highResolutionStage);

    const workingPath = join(workingDir, 'G7MTClient.exe');
    const workingArtifact = await copyAndVerify(currentPath, workingPath, highResolutionStage.outputSha256, 0o644);
    const workingBuffer = await readFile(workingPath);
    const workingPe = inspectPe(workingBuffer);
    const sentinels = collectSentinels(workingBuffer, patchStages);
    assertStageChain(lineageStages, canonicalArtifact.sha256, workingArtifact.sha256);

    const manifestPath = join(stagingRoot, 'client-lineage.json');
    const finalManifestPath = join(outputRoot, 'client-lineage.json');
    const lineageManifest = {
      schemaVersion: 1,
      project: 'logh7-revival',
      sentinel: 'LOGH7-WINE-LINEAGE-V1',
      lineageStatus: 'complete',
      proprietaryArtifactPolicy: 'external-only-never-commit',
      source: {
        path: sourcePath,
        sha256: canonicalArtifact.sha256,
        copiedWithoutMutation: true,
      },
      canonical: {
        path: finalPathFor(stagingRoot, outputRoot, canonicalPath),
        sha256: canonicalArtifact.sha256,
        size: canonicalArtifact.size,
        readOnly: true,
        peTimestamp: canonicalPe.timestamp,
        imageBase: canonicalPe.imageBase,
      },
      working: {
        path: finalPathFor(stagingRoot, outputRoot, workingPath),
        sha256: workingArtifact.sha256,
        size: workingArtifact.size,
        workingCopy: true,
        peTimestamp: workingPe.timestamp,
        imageBase: workingPe.imageBase,
        sentinels,
        sentinelSetSha256: sha256Bytes(jsonBytes(sentinels)),
      },
      stages: lineageStages,
      builder: {
        path: THIS_TOOL_PATH,
        sha256: builderSha256,
        python: { path: pythonPath, sha256: pythonSha256 },
        exePatchTool: { path: EXE_PATCH_TOOL_PATH, sha256: exePatchToolSha256 },
        resourcePatcher: { path: resourcePatcherPath, sha256: resourcePatcherSha256 },
        resourceMap: { path: resourceMapPath, sha256: resourceMapSha256 },
      },
    };
    const manifestSha256 = await writeJson(manifestPath, lineageManifest);
    if (await pathExists(outputRoot)) throw new Error('outputRoot appeared during build; promotion refused');
    await rename(stagingRoot, outputRoot);
    promoted = true;
    return {
      status: 'complete',
      outputRoot,
      manifestPath: finalManifestPath,
      manifestSha256,
      canonicalSha256: canonicalArtifact.sha256,
      workingPath: lineageManifest.working.path,
      workingSha256: workingArtifact.sha256,
      stageCount: lineageStages.length,
      patchCounts: Object.fromEntries(lineageStages.map((stage) => [stage.id, stage.patchCount])),
    };
  } finally {
    if (!promoted) await rm(stagingRoot, { force: true, recursive: true });
  }
}

export async function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: 'string' },
      'output-root': { type: 'string' },
      python: { type: 'string' },
      'resource-patcher': { type: 'string' },
      'resource-map': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help) {
    process.stdout.write([
      'Usage: rebuild_logh7_client_lineage.mjs --source <absolute G7MTClient.exe> --output-root <absolute external new directory> --python <absolute python>',
      '',
      'The output root must not exist and must be outside the repository. Existing outputs and in-place mutation are always refused.',
    ].join('\n') + '\n');
    return 0;
  }
  const result = await rebuildLogh7ClientLineage({
    sourcePath: values.source,
    outputRoot: values['output-root'],
    pythonPath: values.python,
    resourcePatcherPath: values['resource-patcher'] ?? DEFAULT_PATHS.resourcePatcherPath,
    resourceMapPath: values['resource-map'] ?? DEFAULT_PATHS.resourceMapPath,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
