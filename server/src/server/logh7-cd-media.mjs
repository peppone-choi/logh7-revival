import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadOriginalSourceProvenance } from './logh7-source-provenance.mjs';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_MEDIA_ROOT = join(REPO_ROOT, 'artifacts', 'logh7-cd');
const DEFAULT_WORK_ROOT = join(REPO_ROOT, '.omo', 'work', 'logh7-cd-extract');
const DEFAULT_GENERATED_MANIFEST = join(
  SERVER_ROOT,
  'content',
  'generated',
  'logh7-cd-media-manifest.json',
);
const MODE2_SECTOR_BYTES = 2352;
const MODE2_USER_DATA_OFFSET = 24;
const ISO_USER_DATA_BYTES = 2048;

export function buildArchiveFileRecord(name, bytes) {
  return {
    name,
    size: bytes.length,
    md5: digest(bytes, 'md5'),
    sha1: digest(bytes, 'sha1'),
  };
}

export function extractCdMedia({
  mediaRoot = DEFAULT_MEDIA_ROOT,
  workRoot = DEFAULT_WORK_ROOT,
  generatedManifestPath,
  provenance = loadOriginalSourceProvenance(),
  workspaceRoot = REPO_ROOT,
} = {}) {
  mkdirSync(workRoot, { recursive: true });

  const media = verifyArchiveMedia({ mediaRoot, provenance, workspaceRoot });
  const bin = media.files.find((file) => extname(file.name).toLowerCase() === '.bin');
  let iso = {
    status: 'blocked',
    reason: 'verified-bin-missing',
  };

  if (media.status === 'verified' && bin) {
    const binBase = basename(bin.name, extname(bin.name));
    const isoPath = join(workRoot, `${binBase}_mode2_2048.iso`);
    iso = convertMode2BinToIso({
      binPath: join(mediaRoot, bin.name),
      isoPath,
      workspaceRoot,
    });
  }

  const extraction = {
    isoRoot: inspectDirectory(join(workRoot, 'iso-root'), workspaceRoot),
    installshieldRoot: inspectDirectory(join(workRoot, 'installshield-root'), workspaceRoot),
  };

  const manifest = {
    id: 'logh7-cd-media',
    sourceId: provenance.id,
    sourceUrl: provenance.sourceUrl,
    mediaRoot: normalizePath(relative(workspaceRoot, resolve(mediaRoot))),
    workRoot: normalizePath(relative(workspaceRoot, resolve(workRoot))),
    media,
    iso,
    extraction,
    canonicalPromotion: canonicalPromotionStatus(media, iso),
  };

  writeCdMediaManifest(join(workRoot, 'logh7-cd-media-manifest.json'), manifest);
  if (generatedManifestPath) {
    writeCdMediaManifest(generatedManifestPath, manifest);
  }
  return manifest;
}

export function verifyArchiveMedia({
  mediaRoot = DEFAULT_MEDIA_ROOT,
  provenance = loadOriginalSourceProvenance(),
  workspaceRoot = REPO_ROOT,
} = {}) {
  const files = provenance.files.map((expected) => {
    const path = join(mediaRoot, expected.name);
    if (!existsSync(path)) {
      return {
        name: expected.name,
        path: normalizePath(relative(workspaceRoot, path)),
        status: 'missing',
        expected,
      };
    }
    const bytes = readFileSync(path);
    const actual = buildArchiveFileRecord(expected.name, bytes);
    const mismatches = [];
    for (const field of ['size', 'md5', 'sha1']) {
      if (actual[field] !== expected[field]) {
        mismatches.push(field);
      }
    }
    return {
      name: expected.name,
      path: normalizePath(relative(workspaceRoot, path)),
      status: mismatches.length === 0 ? 'verified' : 'mismatch',
      expected,
      actual,
      mismatches,
    };
  });

  let status = 'verified';
  if (files.some((file) => file.status === 'missing')) {
    status = 'source-missing';
  } else if (files.some((file) => file.status === 'mismatch')) {
    status = 'hash-mismatch';
  }

  return { status, files };
}

export function convertMode2BinToIso({
  binPath,
  isoPath,
  workspaceRoot = REPO_ROOT,
} = {}) {
  const raw = readFileSync(binPath);
  if (raw.length % MODE2_SECTOR_BYTES !== 0) {
    throw new Error(`MODE2 BIN size must be a multiple of 2352 bytes: ${raw.length}`);
  }
  const sectors = raw.length / MODE2_SECTOR_BYTES;
  const iso = Buffer.alloc(sectors * ISO_USER_DATA_BYTES);
  for (let sector = 0; sector < sectors; sector += 1) {
    const rawOffset = sector * MODE2_SECTOR_BYTES + MODE2_USER_DATA_OFFSET;
    const isoOffset = sector * ISO_USER_DATA_BYTES;
    raw.copy(iso, isoOffset, rawOffset, rawOffset + ISO_USER_DATA_BYTES);
  }
  mkdirSync(dirname(isoPath), { recursive: true });
  writeFileSync(isoPath, iso);
  return {
    status: 'converted',
    path: normalizePath(relative(workspaceRoot, isoPath)),
    sectors,
    inputBytes: raw.length,
    outputBytes: iso.length,
    sha1: digest(iso, 'sha1'),
  };
}

export function writeCdMediaManifest(path = DEFAULT_GENERATED_MANIFEST, manifest) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function inspectDirectory(path, workspaceRoot) {
  if (!existsSync(path)) {
    return {
      status: 'missing',
      path: normalizePath(relative(workspaceRoot, path)),
      fileCount: 0,
      totalBytes: 0,
    };
  }
  const files = listFiles(path);
  return {
    status: 'present',
    path: normalizePath(relative(workspaceRoot, path)),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + statSync(file).size, 0),
  };
}

function canonicalPromotionStatus(media, iso) {
  if (media.status === 'source-missing') {
    return {
      status: 'blocked-pending-source',
      reason: 'original Archive BIN/CUE missing locally',
    };
  }
  if (media.status !== 'verified') {
    return {
      status: 'blocked-hash-mismatch',
      reason: 'local media does not match pinned Archive metadata',
    };
  }
  if (iso.status !== 'converted') {
    return {
      status: 'blocked-pending-extraction',
      reason: 'MODE2 conversion did not produce an ISO payload',
    };
  }
  return {
    status: 'blocked-pending-crosscheck',
    reason: 'CD-derived data is source evidence, not canonical game data until family-specific cross-checks pass',
  };
}

function listFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function digest(bytes, algorithm) {
  return createHash(algorithm).update(bytes).digest('hex');
}

function normalizePath(path) {
  return path.split('\\').join('/');
}

export const LOGH7_CD_MEDIA_DEFAULTS = {
  generatedManifestPath: DEFAULT_GENERATED_MANIFEST,
  mediaRoot: DEFAULT_MEDIA_ROOT,
  workRoot: DEFAULT_WORK_ROOT,
};
