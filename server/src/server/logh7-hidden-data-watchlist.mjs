import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_INPUT = join(
  SERVER_ROOT,
  'content',
  'generated',
  'logh7-hidden-data-classification.json',
);
const DEFAULT_OUT = join(
  SERVER_ROOT,
  'content',
  'generated',
  'logh7-hidden-data-watchlist.json',
);

const WATCH_CATEGORIES = [
  {
    id: 'systemPositions',
    labelKo: '성계 위치',
    hiddenPathPattern:
      /galaxy|system|star|planet|strategy|grid|sstar|starmap|sector|route|coord|coordinate|position/i,
    canonicalStatus: 'not-confirmed-new-hidden-system-position-table',
    watchedPaths: [
      {
        path: 'server/content/galaxy.json',
        kind: 'current-derived-system-position-data',
      },
      {
        path: 'server/content/galaxy-raster-star-centers.json',
        kind: 'current-generated-manual-raster-star-centers',
      },
      {
        path: 'server/content/galaxy-passable-cells.json',
        kind: 'current-generated-manual-passable-mask',
      },
      {
        path: 'server/content/generated/logh7-null-galaxy-template.json',
        kind: 'generated-mdx-star-template',
      },
    ],
  },
  {
    id: 'originalCharacterRoster',
    labelKo: '오리지널 캐릭터 로스터',
    hiddenPathPattern:
      /face|portrait|character|char|roster|officer|admiral|captain|pilot|hero|person|tcf/i,
    canonicalStatus: 'not-confirmed-new-hidden-original-character-roster',
    watchedPaths: [
      {
        path: 'server/content/character-roster.json',
        kind: 'current-composite-character-roster',
      },
      {
        path: 'server/content/roster/characters.json',
        kind: 'current-composite-character-source',
      },
      {
        path: 'server/content/roster/manual-roster.json',
        kind: 'current-manual-duty-roster',
      },
      {
        path: 'server/content/roster/official-roster.json',
        kind: 'current-external-official-sample',
      },
      {
        path: 'server/content/generated/logh7-face-tcf-catalog.json',
        kind: 'generated-face-archive-catalog',
      },
      {
        path: 'server/content/generated/logh7-face-portrait-catalog.json',
        kind: 'generated-face-portrait-catalog',
      },
    ],
  },
];

export const LOGH7_HIDDEN_DATA_WATCHLIST_DEFAULTS = {
  inPath: DEFAULT_INPUT,
  outPath: DEFAULT_OUT,
};

export function loadHiddenDataClassification(path = DEFAULT_INPUT) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function buildHiddenDataWatchlist({
  classification = loadHiddenDataClassification(),
  workspaceRoot = REPO_ROOT,
  maxExamples = 20,
} = {}) {
  assertClassification(classification);

  const categories = WATCH_CATEGORIES.map((definition) => (
    buildCategoryReport(definition, classification.records, workspaceRoot, maxExamples)
  ));

  return {
    id: 'logh7-hidden-data-watchlist',
    status: 'reported',
    policy:
      'Mandatory watch report for system-position and original-character-roster data. Hidden signature hits are candidates until parsed and cross-checked.',
    inputs: {
      classificationId: classification.id,
      classificationStatus: classification.status,
      classificationRecordCount: classification.records.length,
    },
    summary: {
      categoryCount: categories.length,
      mustReportCategoryIds: categories
        .filter((category) => category.mustReport)
        .map((category) => category.id),
    },
    categories,
  };
}

export function writeHiddenDataWatchlist(path, watchlist) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(watchlist, null, 2)}\n`);
}

function buildCategoryReport(definition, records, workspaceRoot, maxExamples) {
  const hiddenHits = records.filter((record) => (
    definition.hiddenPathPattern.test(normalizePath(record.sourcePath))
  ));
  const contentFindings = definition.watchedPaths
    .filter((entry) => existsSync(join(workspaceRoot, entry.path)))
    .map((entry) => summarizeWatchedPath(workspaceRoot, entry));

  return {
    id: definition.id,
    labelKo: definition.labelKo,
    mustReport: hiddenHits.length > 0 || contentFindings.length > 0,
    canonicalStatus: definition.canonicalStatus,
    hiddenCandidateSummary: summarizeRecords(hiddenHits, maxExamples),
    contentFindings,
  };
}

function summarizeRecords(records, maxExamples) {
  const byVisibility = {};
  const bySignature = {};
  const uniquePaths = new Set();
  for (const record of records) {
    byVisibility[record.visibility] = (byVisibility[record.visibility] ?? 0) + 1;
    bySignature[record.signatureId] = (bySignature[record.signatureId] ?? 0) + 1;
    uniquePaths.add(record.sourcePath);
  }

  return {
    total: records.length,
    uniquePathCount: uniquePaths.size,
    byVisibility,
    bySignature,
    examples: [...uniquePaths].sort().slice(0, maxExamples),
  };
}

function summarizeWatchedPath(workspaceRoot, entry) {
  const absPath = join(workspaceRoot, entry.path);
  const source = JSON.parse(readFileSync(absPath, 'utf8'));
  const summary = {
    path: relative(workspaceRoot, absPath).replaceAll('\\', '/'),
    kind: entry.kind,
    keys: Object.keys(source).slice(0, 12),
  };

  const count = firstNumeric(source, [
    '_count',
    'archiveCount',
    'starCount',
    'passableCount',
  ]);
  if (count !== null) summary.count = count;
  for (const key of ['systems', 'characters', 'stars', 'archives']) {
    if (Array.isArray(source[key])) summary[`${key}Count`] = source[key].length;
  }
  if (source.totals && typeof source.totals === 'object') {
    summary.totals = source.totals;
  }
  if (source.source?.positionStatus) {
    summary.positionStatus = source.source.positionStatus;
  }
  const provenance = source._source ?? source._generated ?? source._extracted ?? source.source?.note;
  if (provenance) summary.provenance = clip(String(provenance), 360);
  return summary;
}

function firstNumeric(source, keys) {
  for (const key of keys) {
    if (Number.isFinite(source[key])) return source[key];
  }
  return null;
}

function assertClassification(classification) {
  if (!classification || classification.id !== 'logh7-hidden-data-classification') {
    throw new Error('Expected logh7-hidden-data-classification manifest');
  }
  if (!Array.isArray(classification.records)) {
    throw new Error('Hidden-data classification manifest must include records[]');
  }
}

function normalizePath(path) {
  return String(path ?? '').replaceAll('\\', '/');
}

function clip(value, length) {
  return value.length <= length ? value : `${value.slice(0, length - 3)}...`;
}
