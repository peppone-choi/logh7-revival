import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_MDX_ROOT = join(REPO_ROOT, '.omo', 'work', 'logh7-installed', 'data', 'model');
const NODE_NAME_OFFSET = 0x58;
const NODE_STRIDE = 0xe8;
const HEADER_PAIR_COUNT = 10;
const HEADER_PAIR_SIZE = 8;

export function catalogMdxDirectory({ mdxRoot = DEFAULT_MDX_ROOT, workspaceRoot = REPO_ROOT } = {}) {
  const absoluteRoot = resolve(mdxRoot);
  if (!existsSync(absoluteRoot)) {
    return {
      id: 'logh7-mdx-catalog',
      sourceRoot: normalizePath(relative(workspaceRoot, absoluteRoot)),
      status: 'missing',
      fileCount: 0,
      files: [],
      categories: {},
    };
  }

  const files = listMdxFiles(absoluteRoot).map((path) => parseMdxFile(path, absoluteRoot));
  return {
    id: 'logh7-mdx-catalog',
    sourceRoot: normalizePath(relative(workspaceRoot, absoluteRoot)),
    status: 'present',
    fileCount: files.length,
    files,
    categories: summarizeCategories(files),
  };
}

export function parseMdxFile(path, mdxRoot = dirname(path)) {
  const bytes = readFileSync(path);
  const header = parseMdxHeader(bytes);
  const nodeNames = parseMdxNodeNames(bytes, header[0]?.count ?? 0);
  return {
    path: normalizePath(relative(mdxRoot, path)),
    size: bytes.length,
    sha1: createHash('sha1').update(bytes).digest('hex'),
    category: inferMdxCategory(path, mdxRoot),
    header,
    nodeNames,
  };
}

export function parseMdxHeader(bytes) {
  if (bytes.length < HEADER_PAIR_COUNT * HEADER_PAIR_SIZE) {
    throw new Error('MDX file too small for header');
  }
  const header = [];
  for (let slot = 0; slot < HEADER_PAIR_COUNT; slot += 1) {
    const offset = slot * HEADER_PAIR_SIZE;
    header.push({
      slot,
      pointer: bytes.readUInt32LE(offset),
      count: bytes.readUInt32LE(offset + 4),
    });
  }
  return header;
}

export function parseMdxNodeNames(bytes, count) {
  const names = [];
  for (let index = 0; index < count; index += 1) {
    const offset = NODE_NAME_OFFSET + index * NODE_STRIDE;
    if (offset >= bytes.length) {
      break;
    }
    const name = readAsciiCString(bytes, offset, 96);
    if (name.length > 0) {
      names.push({ index, offset, name });
    }
  }
  return names;
}

export function writeMdxCatalog(path, catalog) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

function listMdxFiles(root) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && path.toLowerCase().endsWith('.mdx')) {
        files.push(path);
      }
    }
  };
  visit(root);
  return files;
}

function readAsciiCString(bytes, offset, maxLength) {
  let end = offset;
  while (end < bytes.length && end < offset + maxLength && bytes[end] !== 0) {
    end += 1;
  }
  return bytes.subarray(offset, end).toString('ascii').replace(/[^\x20-\x7e]/g, '').trim();
}

function inferMdxCategory(path, mdxRoot) {
  const relativePath = normalizePath(relative(mdxRoot, path));
  const slash = relativePath.indexOf('/');
  return slash === -1 ? '(root)' : relativePath.slice(0, slash);
}

function summarizeCategories(files) {
  const counts = new Map();
  for (const file of files) {
    counts.set(file.category, (counts.get(file.category) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function normalizePath(path) {
  return path.split('\\').join('/');
}
