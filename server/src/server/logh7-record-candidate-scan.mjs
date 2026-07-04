import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_WORK_ROOT = join(REPO_ROOT, '.omo', 'work', 'logh7-cd-extract');
const DEFAULT_OUT = join(
  SERVER_ROOT,
  'content',
  'generated',
  'logh7-record-candidate-scan.json',
);

const MEDIA_EXTENSIONS = new Set([
  '.bmp',
  '.gif',
  '.jpg',
  '.jpeg',
  '.mdx',
  '.ogg',
  '.pdf',
  '.png',
  '.tcf',
  '.tga',
  '.wav',
]);

const RECORD_SURFACE_EXTENSIONS = new Set([
  '',
  '.bin',
  '.cfg',
  '.dat',
  '.dll',
  '.exe',
  '.hed',
  '.ini',
  '.mds',
  '.msg',
  '.txt',
  '.vix',
]);

export const LOGH7_RECORD_CANDIDATE_SCAN_DEFAULTS = {
  outPath: DEFAULT_OUT,
  sourceRoots: [
    {
      id: 'installshield-root',
      role: 'installshield-payload',
      path: join(DEFAULT_WORK_ROOT, 'installshield-root'),
    },
    {
      id: 'iso-root',
      role: 'iso-filesystem',
      path: join(DEFAULT_WORK_ROOT, 'iso-root'),
    },
  ],
};

export function scanRecordCandidates({
  sourceRoots = LOGH7_RECORD_CANDIDATE_SCAN_DEFAULTS.sourceRoots,
  workspaceRoot = REPO_ROOT,
  seeds = loadDefaultSeeds(workspaceRoot),
  maxFileBytes = 8 * 1024 * 1024,
  minCoordinatePairs = 40,
  minRosterTermHits = 4,
  minSystemTermHits = 4,
  scanAbilityVectors = false,
} = {}) {
  const reports = sourceRoots.map((source) => inspectRoot(source, workspaceRoot));
  const scannedFiles = [];
  let excludedMediaFiles = 0;
  let skippedLargeFiles = 0;

  for (const report of reports) {
    for (const file of report.files ?? []) {
      const ext = extname(file.path).toLowerCase();
      if (MEDIA_EXTENSIONS.has(ext)) {
        excludedMediaFiles += 1;
        continue;
      }
      if (!RECORD_SURFACE_EXTENSIONS.has(ext)) continue;
      if (file.size > maxFileBytes) {
        skippedLargeFiles += 1;
        continue;
      }
      scannedFiles.push(file);
    }
  }

  const coordinateClusters = [];
  const systemTextClusters = [];
  const rosterTextClusters = [];
  const abilityVectorClusters = [];

  for (const file of scannedFiles) {
    const bytes = readFileSync(resolve(workspaceRoot, file.path));
    coordinateClusters.push(
      ...findCoordinateClusters(bytes, file.path, minCoordinatePairs),
    );
    if (scanAbilityVectors) {
      abilityVectorClusters.push(...findAbilityVectorClusters(bytes, file.path));
    }

    const decoded = decodeSearchText(bytes);
    const systemTerms = findTermHits(decoded, seeds.systemTerms, minSystemTermHits);
    if (systemTerms) {
      systemTextClusters.push({
        sourcePath: file.path,
        evidenceGrade: 'P0-heuristic-text-candidate',
        ...systemTerms,
      });
    }
    const characterTerms = findTermHits(
      decoded,
      seeds.characterTerms,
      minRosterTermHits,
    );
    if (characterTerms) {
      rosterTextClusters.push({
        sourcePath: file.path,
        evidenceGrade: 'P0-heuristic-text-candidate',
        ...characterTerms,
      });
    }
  }

  return {
    id: 'logh7-record-candidate-scan',
    status: reports.some((report) => report.status === 'missing') ? 'partial' : 'scanned',
    policy:
      'Byte/text record candidates only. These are not canonical until format parsed and cross-checked against CD/manual/Ghidra/live/wire evidence.',
    sources: reports.map(({ files, ...report }) => ({
      ...report,
      fileCount: files?.length ?? 0,
    })),
    summary: {
      scannedFiles: scannedFiles.length,
      excludedMediaFiles,
      skippedLargeFiles,
      coordinateClusterCount: coordinateClusters.length,
      systemTextClusterCount: systemTextClusters.length,
      rosterTextClusterCount: rosterTextClusters.length,
      abilityVectorClusterCount: abilityVectorClusters.length,
    },
    categories: {
      systemPositions: {
        labelKo: '성계 위치',
        canonicalStatus: 'not-confirmed-new-hidden-system-position-table',
        coordinateClusters,
        textClusters: systemTextClusters,
      },
      originalCharacterRoster: {
        labelKo: '오리지널 캐릭터 로스터',
        canonicalStatus: 'not-confirmed-new-hidden-original-character-roster',
        textClusters: rosterTextClusters,
        abilityVectorClusters,
      },
    },
  };
}

export function writeRecordCandidateScan(path = DEFAULT_OUT, scan) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(scan, null, 2)}\n`);
}

function inspectRoot(source, workspaceRoot) {
  const absolutePath = isAbsolute(source.path)
    ? resolve(source.path)
    : resolve(workspaceRoot, source.path);
  const report = {
    id: source.id,
    role: source.role,
    path: normalizePath(relative(workspaceRoot, absolutePath)),
  };

  let stat;
  try {
    stat = statSync(absolutePath);
  } catch {
    return {
      ...report,
      status: 'missing',
      files: [],
    };
  }

  if (stat.isDirectory()) {
    const files = listFiles(absolutePath, workspaceRoot);
    return {
      ...report,
      status: 'present',
      kind: 'directory',
      files,
    };
  }

  if (stat.isFile()) {
    return {
      ...report,
      status: 'present',
      kind: 'file',
      files: [fileReport(absolutePath, workspaceRoot)],
    };
  }

  return {
    ...report,
    status: 'unsupported',
    kind: 'other',
    files: [],
  };
}

function listFiles(root, workspaceRoot) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(path, workspaceRoot));
    } else if (entry.isFile()) {
      files.push(fileReport(path, workspaceRoot));
    }
  }
  return files;
}

function fileReport(path, workspaceRoot) {
  const stat = statSync(path);
  return {
    path: normalizePath(relative(workspaceRoot, path)),
    size: stat.size,
  };
}

function findCoordinateClusters(bytes, sourcePath, minPairs) {
  const clusters = [];
  for (const alignment of [0, 1, 2, 3]) {
    let runStart = null;
    let runPairs = [];
    for (let offset = alignment; offset + 3 < bytes.length; offset += 4) {
      const x = bytes.readUInt16LE(offset);
      const y = bytes.readUInt16LE(offset + 2);
      if (isGridCoordinate(x, y)) {
        if (runStart === null) runStart = offset;
        runPairs.push([x, y]);
      } else {
        pushCoordinateRun(clusters, sourcePath, alignment, runStart, runPairs, minPairs);
        runStart = null;
        runPairs = [];
      }
    }
    pushCoordinateRun(clusters, sourcePath, alignment, runStart, runPairs, minPairs);
  }
  return clusters;
}

function pushCoordinateRun(clusters, sourcePath, alignment, runStart, runPairs, minPairs) {
  if (runStart === null || runPairs.length < minPairs) return;
  const unique = new Set(runPairs.map(([x, y]) => `${x},${y}`));
  if (unique.size < Math.floor(runPairs.length * 0.65)) return;
  const xRange = range(runPairs.map(([x]) => x));
  const yRange = range(runPairs.map(([, y]) => y));
  if (xRange.max - xRange.min < 10 || yRange.max - yRange.min < 8) return;
  clusters.push({
    sourcePath,
    offset: runStart,
    alignment,
    pairCount: runPairs.length,
    uniquePairCount: unique.size,
    xRange,
    yRange,
    samplePairs: runPairs.slice(0, 12),
    evidenceGrade: 'P0-heuristic-coordinate-candidate',
  });
}

function isGridCoordinate(x, y) {
  return x >= 0 && x <= 100 && y >= 0 && y <= 50;
}

function findAbilityVectorClusters(bytes, sourcePath) {
  const clusters = [];
  let runStart = null;
  let vectorCount = 0;
  for (let offset = 0; offset + 7 < bytes.length; offset += 8) {
    const vector = [...bytes.subarray(offset, offset + 8)];
    if (vector.every((value) => value >= 1 && value <= 200) && variance(vector) >= 20) {
      if (runStart === null) runStart = offset;
      vectorCount += 1;
    } else {
      pushAbilityRun(clusters, sourcePath, runStart, vectorCount);
      runStart = null;
      vectorCount = 0;
    }
  }
  pushAbilityRun(clusters, sourcePath, runStart, vectorCount);
  return clusters;
}

function pushAbilityRun(clusters, sourcePath, runStart, vectorCount) {
  if (runStart === null || vectorCount < 8) return;
  clusters.push({
    sourcePath,
    offset: runStart,
    vectorCount,
    evidenceGrade: 'P0-heuristic-ability-vector-candidate',
  });
}

function decodeSearchText(bytes) {
  const limited = bytes.length > 2 * 1024 * 1024 ? bytes.subarray(0, 2 * 1024 * 1024) : bytes;
  return [
    limited.toString('utf8'),
    limited.toString('latin1'),
    new TextDecoder('shift_jis').decode(limited),
  ].join('\n');
}

function findTermHits(text, terms, minimum) {
  const hits = [];
  for (const term of terms) {
    if (term.length < 3) continue;
    const index = text.indexOf(term);
    if (index >= 0) {
      hits.push({
        term,
        index,
        context: clip(text.slice(Math.max(0, index - 40), index + term.length + 40), 140),
      });
    }
  }
  if (hits.length < minimum) return null;
  return {
    uniqueTermCount: hits.length,
    hits: hits.slice(0, 20),
  };
}

function loadDefaultSeeds(workspaceRoot) {
  return {
    systemTerms: loadTerms(join(workspaceRoot, 'server', 'content', 'galaxy.json'), [
      'name',
      'name_ja',
      'nameJa',
    ]),
    characterTerms: loadTerms(
      join(workspaceRoot, 'server', 'content', 'character-roster.json'),
      ['name_ja', 'name_romaji', 'name_kr'],
    ),
  };
}

function loadTerms(path, keys) {
  let json;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
  const terms = new Set();
  collectTerms(json, keys, terms);
  return [...terms].filter((term) => term.length >= 3).sort();
}

function collectTerms(value, keys, terms) {
  if (Array.isArray(value)) {
    for (const item of value) collectTerms(item, keys, terms);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (keys.includes(key) && typeof child === 'string') {
        const normalized = child.trim();
        if (normalized) terms.add(normalized);
      }
      collectTerms(child, keys, terms);
    }
  }
}

function range(values) {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function variance(values) {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
}

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function clip(value, length) {
  const singleLine = value.replaceAll(/\s+/g, ' ').trim();
  return singleLine.length <= length ? singleLine : `${singleLine.slice(0, length - 3)}...`;
}
