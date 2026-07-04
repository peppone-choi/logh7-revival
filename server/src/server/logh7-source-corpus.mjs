import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_SOURCE_ROOTS_PATH = join(SERVER_ROOT, 'content', 'original-data', 'logh7-source-roots.json');

export function loadSourceRootRegistry(path = DEFAULT_SOURCE_ROOTS_PATH) {
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  validateSourceRootRegistry(registry);
  return registry;
}

export function validateSourceRootRegistry(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('source root registry must be an object');
  }
  if (registry.id !== 'logh7-source-roots') {
    throw new Error(`unexpected source root registry id: ${registry.id}`);
  }
  if (!Array.isArray(registry.roots) || registry.roots.length === 0) {
    throw new Error('source root registry must contain roots');
  }
  const ids = new Set();
  for (const root of registry.roots) {
    assertSourceRoot(root);
    if (ids.has(root.id)) {
      throw new Error(`duplicate source root id: ${root.id}`);
    }
    ids.add(root.id);
  }
  return true;
}

export function inventorySourceRoots({
  registry = loadSourceRootRegistry(),
  workspaceRoot = REPO_ROOT,
  includeFiles = false,
  includeHashes = includeFiles,
} = {}) {
  validateSourceRootRegistry(registry);
  return {
    id: `${registry.id}-inventory`,
    registryId: registry.id,
    roots: registry.roots.map((root) => inventorySourceRoot(root, { workspaceRoot, includeFiles, includeHashes })),
  };
}

function inventorySourceRoot(root, { workspaceRoot, includeFiles, includeHashes }) {
  const absolutePath = resolveRootPath(root, workspaceRoot);
  if (!existsSync(absolutePath)) {
    return {
      id: root.id,
      status: 'missing',
      path: root.path,
      absolutePath,
      provenance: root.provenance,
      use: root.use,
      fileCount: 0,
      byteCount: 0,
      extensions: {},
    };
  }

  const files = listFiles(absolutePath);
  const fileRecords = files.map((path) => buildFileRecord(path, absolutePath, includeHashes));
  const summary = {
    id: root.id,
    status: 'present',
    path: root.path,
    absolutePath,
    provenance: root.provenance,
    use: root.use,
    fileCount: fileRecords.length,
    byteCount: fileRecords.reduce((total, file) => total + file.size, 0),
    extensions: summarizeExtensions(fileRecords),
    sampleFiles: fileRecords.slice(0, 8),
  };
  if (includeFiles) {
    summary.files = fileRecords;
  }
  return summary;
}

function resolveRootPath(root, workspaceRoot) {
  if (root.relativeTo === 'repo') {
    return resolve(workspaceRoot, root.path);
  }
  if (root.relativeTo === 'server') {
    return resolve(SERVER_ROOT, root.path);
  }
  throw new Error(`${root.id} has unsupported relativeTo: ${root.relativeTo}`);
}

function listFiles(rootPath) {
  const entries = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        entries.push(path);
      }
    }
  };
  visit(rootPath);
  return entries;
}

function buildFileRecord(path, rootPath, includeHashes) {
  const stat = statSync(path);
  const record = {
    path: normalizePath(relative(rootPath, path)),
    size: stat.size,
    extension: normalizeExtension(path),
  };
  if (includeHashes) {
    record.sha1 = createHash('sha1').update(readFileSync(path)).digest('hex');
  }
  return record;
}

function summarizeExtensions(files) {
  const counts = new Map();
  for (const file of files) {
    counts.set(file.extension, (counts.get(file.extension) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeExtension(path) {
  const extension = extname(path).slice(1).toLowerCase();
  return extension.length === 0 ? '(none)' : extension;
}

function normalizePath(path) {
  return path.split('\\').join('/');
}

function assertSourceRoot(root) {
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new TypeError('source root must be an object');
  }
  for (const field of ['id', 'path', 'relativeTo', 'provenance', 'status', 'use']) {
    if (typeof root[field] !== 'string' || root[field].length === 0) {
      throw new Error(`source root missing ${field}`);
    }
  }
}
