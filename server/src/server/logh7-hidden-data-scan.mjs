import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_OUT = join(SERVER_ROOT, 'content', 'generated', 'logh7-hidden-data-candidates.json');
const DEFAULT_WORK_ROOT = join(REPO_ROOT, '.omo', 'work', 'logh7-cd-extract');

const SIGNATURES = [
  { id: 'CD001', label: 'CD001', bytes: Buffer.from('CD001', 'ascii') },
  { id: 'MSCF', label: 'MSCF', bytes: Buffer.from('MSCF', 'ascii') },
  { id: 'MZ', label: 'MZ', bytes: Buffer.from('MZ', 'ascii') },
  { id: 'PE', label: 'PE', bytes: Buffer.from([0x50, 0x45, 0x00, 0x00]) },
  { id: 'PNG', label: 'PNG', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
  { id: 'BMP', label: 'BMP', bytes: Buffer.from('BM', 'ascii') },
  { id: 'OGG', label: 'OGG', bytes: Buffer.from('OggS', 'ascii') },
  { id: 'PDF', label: 'PDF', bytes: Buffer.from('%PDF', 'ascii') },
  { id: 'RIFF', label: 'RIFF', bytes: Buffer.from('RIFF', 'ascii') },
  { id: 'MDX', label: 'MDX', bytes: Buffer.from('MDX', 'ascii') },
];

export function defaultHiddenDataSources({
  repoRoot = REPO_ROOT,
  workRoot = DEFAULT_WORK_ROOT,
} = {}) {
  return [
    {
      id: 'archive-raw-bin',
      role: 'raw-sector-bin',
      path: join(repoRoot, 'artifacts', 'logh7-cd', 'Logh7.bin'),
    },
    {
      id: 'converted-mode2-iso',
      role: 'mode2-2048-iso',
      path: join(workRoot, 'Logh7_mode2_2048.iso'),
    },
    {
      id: 'iso-filesystem',
      role: 'iso-filesystem-extract',
      path: join(workRoot, 'iso-root'),
    },
    {
      id: 'installshield-payload',
      role: 'installshield-extract',
      path: join(workRoot, 'installshield-root'),
    },
  ];
}

export function scanHiddenDataCandidates({
  sources = defaultHiddenDataSources(),
  workspaceRoot = REPO_ROOT,
  maxCandidatesPerSignaturePerFile = 10000,
} = {}) {
  const sourceReports = [];
  const candidates = [];

  for (const source of sources) {
    const report = inspectSource(source, workspaceRoot);
    sourceReports.push(report);
    if (report.status !== 'present') {
      continue;
    }
    for (const target of report.targets) {
      const bytes = readFileSync(target.absolutePath);
      for (const signature of SIGNATURES) {
        const offsets = findSignatureOffsets(
          bytes,
          signature.bytes,
          maxCandidatesPerSignaturePerFile,
        );
        for (const offset of offsets) {
          candidates.push({
            sourceId: source.id,
            sourceRole: source.role,
            sourcePath: target.path,
            signatureId: signature.id,
            signatureLabel: signature.label,
            offset,
            classification: 'unverified-signature-candidate',
            provenance: 'P0-candidate',
          });
        }
      }
    }
  }

  candidates.sort((left, right) => {
    const source = left.sourceId.localeCompare(right.sourceId);
    if (source !== 0) return source;
    const path = left.sourcePath.localeCompare(right.sourcePath);
    if (path !== 0) return path;
    const signature = left.signatureId.localeCompare(right.signatureId);
    if (signature !== 0) return signature;
    return left.offset - right.offset;
  });

  return {
    id: 'logh7-hidden-data-candidates',
    status: sourceReports.some((source) => source.status !== 'present') ? 'partial' : 'scanned',
    candidatePolicy: 'classification only; candidates are not canonical until carved, validated, deduplicated, and cross-checked',
    sources: sourceReports.map(({ targets, ...source }) => ({
      ...source,
      targetCount: targets?.length ?? 0,
    })),
    signatureSummary: summarizeSignatures(candidates),
    candidates,
  };
}

export function writeHiddenDataCandidates(path = DEFAULT_OUT, scan) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(scan, null, 2)}\n`);
}

function inspectSource(source, workspaceRoot) {
  const absolutePath = resolve(source.path);
  if (!existsSync(absolutePath)) {
    return {
      id: source.id,
      role: source.role,
      path: normalizePath(relative(workspaceRoot, absolutePath)),
      status: 'missing',
      targets: [],
    };
  }
  const stat = statSync(absolutePath);
  const targets = stat.isDirectory()
    ? listFiles(absolutePath, workspaceRoot)
    : [fileTarget(absolutePath, workspaceRoot)];
  return {
    id: source.id,
    role: source.role,
    path: normalizePath(relative(workspaceRoot, absolutePath)),
    status: 'present',
    kind: stat.isDirectory() ? 'directory' : 'file',
    bytes: targets.reduce((sum, target) => sum + target.size, 0),
    sha1: stat.isFile() ? hashFile(absolutePath) : undefined,
    targets,
  };
}

function listFiles(root, workspaceRoot) {
  const targets = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      targets.push(...listFiles(path, workspaceRoot));
    } else if (entry.isFile()) {
      targets.push(fileTarget(path, workspaceRoot));
    }
  }
  targets.sort((left, right) => left.path.localeCompare(right.path));
  return targets;
}

function fileTarget(path, workspaceRoot) {
  const stat = statSync(path);
  return {
    absolutePath: path,
    path: normalizePath(relative(workspaceRoot, path)),
    size: stat.size,
  };
}

function findSignatureOffsets(bytes, needle, limit) {
  const offsets = [];
  let offset = bytes.indexOf(needle, 0);
  while (offset !== -1 && offsets.length < limit) {
    offsets.push(offset);
    offset = bytes.indexOf(needle, offset + 1);
  }
  return offsets;
}

function summarizeSignatures(candidates) {
  const summary = {};
  for (const candidate of candidates) {
    summary[candidate.signatureId] ??= { count: 0 };
    summary[candidate.signatureId].count += 1;
  }
  return Object.fromEntries(
    Object.entries(summary).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function hashFile(path) {
  return createHash('sha1').update(readFileSync(path)).digest('hex');
}

function normalizePath(path) {
  return path.split('\\').join('/');
}

export const LOGH7_HIDDEN_DATA_SCAN_DEFAULTS = {
  outPath: DEFAULT_OUT,
  workRoot: DEFAULT_WORK_ROOT,
};
