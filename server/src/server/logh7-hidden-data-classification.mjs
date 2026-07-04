import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_INPUT = join(SERVER_ROOT, 'content', 'generated', 'logh7-hidden-data-candidates.json');
const DEFAULT_OUT = join(SERVER_ROOT, 'content', 'generated', 'logh7-hidden-data-classification.json');

export function loadHiddenDataCandidates(path = DEFAULT_INPUT) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function classifyHiddenDataCandidates({
  manifest = loadHiddenDataCandidates(),
  workspaceRoot = REPO_ROOT,
} = {}) {
  assertCandidateManifest(manifest);

  const bufferCache = new Map();
  const records = manifest.candidates.map((candidate) => (
    classifyCandidate(candidate, workspaceRoot, bufferCache)
  ));
  const dedupGroups = buildDedupGroups(records);
  applyVisibility(records, dedupGroups);

  return {
    id: 'logh7-hidden-data-classification',
    status: records.some((record) => record.validation === 'source-missing') ? 'partial' : 'classified',
    candidateSourceId: manifest.id,
    inputCandidateCount: manifest.candidates.length,
    summary: summarize(records),
    dedupGroups,
    records,
    promotionPolicy: 'classification only; validated records are not canonical until carved, format-parsed, deduplicated against known assets, and cross-checked',
  };
}

export function writeHiddenDataClassification(path = DEFAULT_OUT, classification) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(classification, null, 2)}\n`);
}

function assertCandidateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new TypeError('hidden-data candidates manifest must be an object');
  }
  if (manifest.id !== 'logh7-hidden-data-candidates') {
    throw new Error(`hidden-data candidates manifest has unexpected id: ${manifest.id}`);
  }
  if (!Array.isArray(manifest.candidates)) {
    throw new Error('hidden-data candidates manifest must contain candidates');
  }
}

function classifyCandidate(candidate, workspaceRoot, bufferCache) {
  const absolutePath = resolveCandidatePath(candidate.sourcePath, workspaceRoot);
  const base = {
    sourceId: candidate.sourceId,
    sourceRole: candidate.sourceRole,
    sourcePath: normalizePath(relative(workspaceRoot, absolutePath)),
    signatureId: candidate.signatureId,
    offset: candidate.offset,
    validation: 'invalid',
    validationKind: 'unclassified',
    carveLength: null,
    carveSha1: null,
    dedupKey: null,
    visibility: 'unclassified',
    provenance: candidate.provenance ?? 'P0-candidate',
  };

  if (!existsSync(absolutePath)) {
    return {
      ...base,
      validation: 'source-missing',
      validationKind: 'source-missing',
      visibility: 'source-missing',
    };
  }

  const bytes = readCached(absolutePath, bufferCache);
  const offset = Number(candidate.offset);
  if (!Number.isInteger(offset) || offset < 0 || offset >= bytes.length) {
    return {
      ...base,
      validation: 'invalid',
      validationKind: 'offset-out-of-range',
    };
  }

  const validation = validateSignature(bytes, offset, candidate.signatureId);
  const record = {
    ...base,
    validation: validation.validation,
    validationKind: validation.validationKind,
    carveLength: validation.carveLength,
  };
  if (record.validation === 'validated' && record.carveLength !== null) {
    const carved = bytes.subarray(offset, offset + record.carveLength);
    record.carveSha1 = sha1(carved);
    record.dedupKey = `${record.signatureId}:sha1:${record.carveSha1}`;
  } else if (record.validation === 'validated') {
    record.dedupKey = [
      record.signatureId,
      record.validationKind,
      record.sourcePath,
      String(record.offset),
    ].join(':');
  }
  return record;
}

function validateSignature(bytes, offset, signatureId) {
  if (signatureId === 'BMP') return validateBmp(bytes, offset);
  if (signatureId === 'PDF') return validateDelimited(bytes, offset, '%PDF', '%%EOF', 'pdf-document');
  if (signatureId === 'PNG') return validatePng(bytes, offset);
  if (signatureId === 'OGG') return validateOggPage(bytes, offset);
  if (signatureId === 'RIFF') return validateSizedChunk(bytes, offset, 'RIFF', 'riff-chunk');
  if (signatureId === 'MSCF') return validateSizedChunk(bytes, offset, 'MSCF', 'cabinet-file');
  if (signatureId === 'MZ') return validateMzPe(bytes, offset);
  if (signatureId === 'PE') return validateFixed(bytes, offset, Buffer.from([0x50, 0x45, 0x00, 0x00]), 'pe-header');
  if (signatureId === 'CD001') return validateFixed(bytes, offset, Buffer.from('CD001', 'ascii'), 'iso-volume-descriptor', null);
  if (signatureId === 'MDX') return validateFixed(bytes, offset, Buffer.from('MDX', 'ascii'), 'mdx-token', null);
  return {
    validation: 'signature-only',
    validationKind: 'unknown-signature',
    carveLength: null,
  };
}

function validateBmp(bytes, offset) {
  if (!hasPrefix(bytes, offset, Buffer.from('BM', 'ascii')) || offset + 30 > bytes.length) {
    return invalid('bmp-header');
  }
  const fileSize = bytes.readUInt32LE(offset + 2);
  const pixelOffset = bytes.readUInt32LE(offset + 10);
  const dibSize = bytes.readUInt32LE(offset + 14);
  const width = bytes.readInt32LE(offset + 18);
  const height = bytes.readInt32LE(offset + 22);
  const planes = bytes.readUInt16LE(offset + 26);
  const bitsPerPixel = bytes.readUInt16LE(offset + 28);
  if (
    fileSize < 30 ||
    fileSize > bytes.length - offset ||
    pixelOffset < 14 ||
    dibSize < 12 ||
    width === 0 ||
    height === 0 ||
    planes !== 1 ||
    bitsPerPixel === 0
  ) {
    return invalid('bmp-header');
  }
  return validated('bmp-file', fileSize);
}

function validatePng(bytes, offset) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!hasPrefix(bytes, offset, signature)) return invalid('png-signature');
  const iend = bytes.indexOf(Buffer.from('IEND', 'ascii'), offset + signature.length);
  if (iend === -1 || iend + 8 > bytes.length) {
    return {
      validation: 'signature-only',
      validationKind: 'png-no-iend',
      carveLength: null,
    };
  }
  return validated('png-file', iend + 8 - offset);
}

function validateOggPage(bytes, offset) {
  if (!hasPrefix(bytes, offset, Buffer.from('OggS', 'ascii')) || offset + 27 > bytes.length) {
    return invalid('ogg-page');
  }
  const segments = bytes[offset + 26];
  if (offset + 27 + segments > bytes.length) return invalid('ogg-page');
  let pageLength = 27 + segments;
  for (let index = 0; index < segments; index += 1) {
    pageLength += bytes[offset + 27 + index];
  }
  if (pageLength <= 27 || offset + pageLength > bytes.length) return invalid('ogg-page');
  return validated('ogg-page', pageLength);
}

function validateSizedChunk(bytes, offset, asciiSignature, validationKind) {
  if (!hasPrefix(bytes, offset, Buffer.from(asciiSignature, 'ascii')) || offset + 12 > bytes.length) {
    return invalid(validationKind);
  }
  const size = bytes.readUInt32LE(offset + 8);
  if (size < 12 || size > bytes.length - offset) {
    return invalid(validationKind);
  }
  return validated(validationKind, size);
}

function validateMzPe(bytes, offset) {
  if (!hasPrefix(bytes, offset, Buffer.from('MZ', 'ascii')) || offset + 0x40 > bytes.length) {
    return invalid('mz-pe-header');
  }
  const peOffset = bytes.readUInt32LE(offset + 0x3c);
  if (peOffset < 0x40 || offset + peOffset + 4 > bytes.length) {
    return invalid('mz-pe-header');
  }
  if (!hasPrefix(bytes, offset + peOffset, Buffer.from([0x50, 0x45, 0x00, 0x00]))) {
    return invalid('mz-pe-header');
  }
  return validated('mz-pe-header', null);
}

function validateDelimited(bytes, offset, start, end, validationKind) {
  const startBytes = Buffer.from(start, 'ascii');
  const endBytes = Buffer.from(end, 'ascii');
  if (!hasPrefix(bytes, offset, startBytes)) return invalid(validationKind);
  const endOffset = bytes.indexOf(endBytes, offset + startBytes.length);
  if (endOffset === -1) {
    return {
      validation: 'signature-only',
      validationKind: `${validationKind}-unterminated`,
      carveLength: null,
    };
  }
  return validated(validationKind, endOffset + endBytes.length - offset);
}

function validateFixed(bytes, offset, signature, validationKind, carveLength = signature.length) {
  if (!hasPrefix(bytes, offset, signature)) return invalid(validationKind);
  return validated(validationKind, carveLength);
}

function buildDedupGroups(records) {
  const groups = new Map();
  for (const record of records) {
    if (record.validation !== 'validated' || !record.dedupKey) continue;
    const group = groups.get(record.dedupKey) ?? {
      key: record.dedupKey,
      signatureId: record.signatureId,
      validationKind: record.validationKind,
      carveSha1: record.carveSha1,
      count: 0,
      sourceRoles: [],
      sourcePaths: [],
      offsets: [],
    };
    group.count += 1;
    addUnique(group.sourceRoles, record.sourceRole);
    addUnique(group.sourcePaths, record.sourcePath);
    group.offsets.push(record.offset);
    groups.set(record.dedupKey, group);
  }
  return [...groups.values()].sort((left, right) => {
    const count = right.count - left.count;
    if (count !== 0) return count;
    return left.key.localeCompare(right.key);
  });
}

function applyVisibility(records, dedupGroups) {
  const groupsByKey = new Map(dedupGroups.map((group) => [group.key, group]));
  for (const record of records) {
    if (record.validation === 'source-missing') {
      record.visibility = 'source-missing';
      continue;
    }
    if (record.validation !== 'validated') {
      record.visibility = 'unvalidated';
      continue;
    }
    const group = groupsByKey.get(record.dedupKey);
    const hasExtractedCopy = group?.sourceRoles.some((role) => !isRawRole(role)) ?? false;
    if (hasExtractedCopy || !isRawRole(record.sourceRole)) {
      record.visibility = 'alreadyExtracted';
    } else {
      record.visibility = 'rawOnly';
    }
  }
}

function summarize(records) {
  const byValidation = {};
  const byVisibility = {};
  const bySignature = {};
  for (const record of records) {
    increment(byValidation, summaryKey(record.validation));
    increment(byVisibility, record.visibility);
    bySignature[record.signatureId] ??= {};
    increment(bySignature[record.signatureId], summaryKey(record.validation));
    increment(bySignature[record.signatureId], 'total');
  }
  return { byValidation, byVisibility, bySignature };
}

function resolveCandidatePath(sourcePath, workspaceRoot) {
  return isAbsolute(sourcePath) ? resolve(sourcePath) : resolve(workspaceRoot, sourcePath);
}

function readCached(path, bufferCache) {
  let bytes = bufferCache.get(path);
  if (!bytes) {
    bytes = readFileSync(path);
    bufferCache.set(path, bytes);
  }
  return bytes;
}

function hasPrefix(bytes, offset, prefix) {
  return offset + prefix.length <= bytes.length && bytes.subarray(offset, offset + prefix.length).equals(prefix);
}

function validated(validationKind, carveLength) {
  return { validation: 'validated', validationKind, carveLength };
}

function invalid(validationKind) {
  return { validation: 'invalid', validationKind, carveLength: null };
}

function isRawRole(role) {
  return role === 'raw-sector-bin' || role === 'mode2-2048-iso';
}

function increment(target, key) {
  target[key] = (target[key] ?? 0) + 1;
}

function summaryKey(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function addUnique(values, value) {
  if (!values.includes(value)) values.push(value);
}

function sha1(bytes) {
  return createHash('sha1').update(bytes).digest('hex');
}

function normalizePath(path) {
  return path.split('\\').join('/');
}

export const LOGH7_HIDDEN_DATA_CLASSIFICATION_DEFAULTS = {
  inPath: DEFAULT_INPUT,
  outPath: DEFAULT_OUT,
};
