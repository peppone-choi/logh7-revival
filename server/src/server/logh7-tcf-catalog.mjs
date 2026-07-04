import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_FACE_ROOT = join(REPO_ROOT, '.omo', 'work', 'logh7-installed', 'data', 'image', 'Face');
const TCF_MAGIC = 'badacabe';
const TCF_HEADER_BYTES = 18;
const HED_SLOT_SIZE = 8;

export function catalogTcfFaceDirectory({ faceRoot = DEFAULT_FACE_ROOT, workspaceRoot = REPO_ROOT } = {}) {
  const absoluteRoot = resolve(faceRoot);
  if (!existsSync(absoluteRoot)) {
    return {
      id: 'logh7-face-tcf-catalog',
      sourceRoot: normalizePath(relative(workspaceRoot, absoluteRoot)),
      status: 'missing',
      archives: [],
      hed: null,
    };
  }

  const archives = listCurrentTcfArchives(absoluteRoot).map((path) => parseTcfArchive(path, absoluteRoot));
  const hedPath = join(absoluteRoot, 'tcf.hed');
  return {
    id: 'logh7-face-tcf-catalog',
    sourceRoot: normalizePath(relative(workspaceRoot, absoluteRoot)),
    status: 'present',
    archiveCount: archives.length,
    archives,
    archiveGroups: summarizeArchiveGroups(archives),
    hed: existsSync(hedPath) ? parseTcfHed(hedPath, absoluteRoot) : null,
  };
}

export function parseTcfArchive(path, faceRoot = dirname(path)) {
  const bytes = readFileSync(path);
  const name = basename(path);
  return {
    path: normalizePath(relative(faceRoot, path)),
    name,
    group: inferArchiveGroup(name),
    size: bytes.length,
    sha1: createHash('sha1').update(bytes).digest('hex'),
    magic: bytes.subarray(0, 4).toString('hex'),
    headerHex: bytes.subarray(0, Math.min(TCF_HEADER_BYTES, bytes.length)).toString('hex'),
    magicOk: bytes.subarray(0, 4).toString('hex') === TCF_MAGIC,
  };
}

export function parseTcfHed(path, faceRoot = dirname(path)) {
  const bytes = readFileSync(path);
  const slots = [];
  for (let index = 0; index + HED_SLOT_SIZE <= bytes.length; index += HED_SLOT_SIZE) {
    slots.push({
      index: index / HED_SLOT_SIZE,
      offset: bytes.readUInt32LE(index),
      size: bytes.readUInt32LE(index + 4),
    });
  }
  const usedSlots = slots.filter((slot) => slot.size > 0);
  return {
    path: normalizePath(relative(faceRoot, path)),
    size: bytes.length,
    sha1: createHash('sha1').update(bytes).digest('hex'),
    slotCount: slots.length,
    usedSlotCount: usedSlots.length,
    zeroSlotCount: slots.length - usedSlots.length,
    firstUsedSlots: usedSlots.slice(0, 12),
    sizeHistogram: summarizeSlotSizes(usedSlots),
  };
}

export function writeTcfFaceCatalog(path, catalog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

function listCurrentTcfArchives(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.tcf'))
    .map((entry) => join(root, entry.name))
    .sort((left, right) => basename(left).localeCompare(basename(right)));
}

function inferArchiveGroup(name) {
  const first = name[0]?.toLowerCase();
  if (first === 'o') {
    return 'O-group-canon';
  }
  if (first === 'g') {
    return 'G-group-player';
  }
  return 'unknown';
}

function summarizeArchiveGroups(archives) {
  const counts = new Map();
  for (const archive of archives) {
    counts.set(archive.group, (counts.get(archive.group) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function summarizeSlotSizes(slots) {
  const counts = new Map();
  for (const slot of slots) {
    counts.set(String(slot.size), (counts.get(String(slot.size)) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => Number(left) - Number(right)));
}

function normalizePath(path) {
  return path.split('\\').join('/');
}
