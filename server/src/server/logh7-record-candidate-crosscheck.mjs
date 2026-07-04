import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const DEFAULT_RECORD_SCAN = join(
  SERVER_ROOT,
  'content',
  'generated',
  'logh7-record-candidate-scan.json',
);
const DEFAULT_GALAXY = join(SERVER_ROOT, 'content', 'galaxy.json');
const DEFAULT_OUT = join(
  SERVER_ROOT,
  'content',
  'generated',
  'logh7-record-candidate-crosscheck.json',
);

export const LOGH7_RECORD_CANDIDATE_CROSSCHECK_DEFAULTS = {
  recordScanPath: DEFAULT_RECORD_SCAN,
  galaxyPath: DEFAULT_GALAXY,
  outPath: DEFAULT_OUT,
};

export function loadRecordCandidateScan(path = DEFAULT_RECORD_SCAN) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function loadGalaxy(path = DEFAULT_GALAXY) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function crossCheckRecordCandidates({
  recordScan = loadRecordCandidateScan(),
  galaxy = loadGalaxy(),
  workspaceRoot = REPO_ROOT,
  strongOverlapRatio = 0.65,
  ghidraFunctions = loadGhidraFunctions(workspaceRoot),
} = {}) {
  assertRecordScan(recordScan);
  const coordinateSets = buildGalaxyCoordinateSets(galaxy);
  const coordinateChecks = (recordScan.categories.systemPositions.coordinateClusters ?? [])
    .map((cluster) => checkCoordinateCluster({
      cluster,
      coordinateSets,
      ghidraFunctions,
      workspaceRoot,
      strongOverlapRatio,
    }));
  const textChecks = (recordScan.categories.systemPositions.textClusters ?? [])
    .map((cluster) => checkTextCluster(cluster, galaxy));
  const rosterTextClusters = recordScan.categories.originalCharacterRoster.textClusters ?? [];
  const abilityVectorClusters =
    recordScan.categories.originalCharacterRoster.abilityVectorClusters ?? [];

  return {
    id: 'logh7-record-candidate-crosscheck',
    status: 'checked',
    policy:
      'Cross-check only. A candidate is not canonical until parsed and confirmed against CD/manual/Ghidra/live/wire evidence.',
    inputs: {
      recordScanId: recordScan.id,
      galaxySystemCount: Array.isArray(galaxy.systems) ? galaxy.systems.length : 0,
    },
    summary: {
      coordinateCheckCount: coordinateChecks.length,
      possibleSystemPositionTableCount: coordinateChecks
        .filter((check) => check.classification === 'possible-system-position-table')
        .length,
      weakCoordinateCandidateCount: coordinateChecks
        .filter((check) => check.classification === 'weak-overlap-coordinate-candidate')
        .length,
      systemTextCheckCount: textChecks.length,
      rosterTextClusterCount: rosterTextClusters.length,
      rosterAbilityVectorClusterCount: abilityVectorClusters.length,
    },
    systemPositions: {
      canonicalStatus: 'not-promoted-cross-check-required',
      coordinateChecks,
      textChecks,
    },
    originalCharacterRoster: {
      canonicalStatus: 'not-confirmed-new-hidden-original-character-roster',
      status: rosterTextClusters.length === 0 && abilityVectorClusters.length === 0
        ? 'no-record-surface-roster-candidate'
        : 'record-surface-roster-candidates-require-parsing',
      textClusterCount: rosterTextClusters.length,
      abilityVectorClusterCount: abilityVectorClusters.length,
    },
  };
}

export function writeRecordCandidateCrossCheck(path = DEFAULT_OUT, crossCheck) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(crossCheck, null, 2)}\n`);
}

function checkCoordinateCluster({
  cluster,
  coordinateSets,
  ghidraFunctions,
  workspaceRoot,
  strongOverlapRatio,
}) {
  const pairs = readPairs(cluster, workspaceRoot);
  const uniquePairs = [...new Set(pairs.map(([x, y]) => `${x},${y}`))];
  const overlaps = coordinateSets.map((set) => {
    const matches = uniquePairs.filter((pair) => set.values.has(pair)).length;
    return {
      name: set.name,
      matches,
      candidateUniquePairs: uniquePairs.length,
      targetPairs: set.values.size,
      ratio: uniquePairs.length === 0 ? 0 : Number((matches / uniquePairs.length).toFixed(4)),
    };
  });
  const bestOverlap = overlaps.reduce((best, current) => (
    current.matches > best.matches ? current : best
  ), overlaps[0] ?? {
    name: 'none',
    matches: 0,
    candidateUniquePairs: uniquePairs.length,
    targetPairs: 0,
    ratio: 0,
  });

  const peContext = inspectPeContext(cluster, workspaceRoot);
  const ghidraContext = peContext
    ? findNearbyGhidraRefs(peContext.vaNumber, ghidraFunctions)
    : [];
  const overlapClassification = bestOverlap.ratio >= strongOverlapRatio
    ? 'possible-system-position-table'
    : 'weak-overlap-coordinate-candidate';
  const classification = classifyWithExecutableContext({
    overlapClassification,
    peContext,
    ghidraContext,
  });

  return {
    sourcePath: cluster.sourcePath,
    offset: cluster.offset,
    pairCount: cluster.pairCount,
    uniquePairCount: uniquePairs.length,
    peContext,
    ghidraContext,
    bestOverlap,
    classification,
    samplePairs: pairs.slice(0, 12),
  };
}

function readPairs(cluster, workspaceRoot) {
  const path = isAbsolute(cluster.sourcePath)
    ? resolve(cluster.sourcePath)
    : resolve(workspaceRoot, cluster.sourcePath);
  const bytes = readFileSync(path);
  const pairs = [];
  for (let index = 0; index < cluster.pairCount; index += 1) {
    const offset = cluster.offset + (index * 4);
    if (offset + 3 >= bytes.length) break;
    pairs.push([
      bytes.readUInt16LE(offset),
      bytes.readUInt16LE(offset + 2),
    ]);
  }
  return pairs;
}

function inspectPeContext(cluster, workspaceRoot) {
  const path = isAbsolute(cluster.sourcePath)
    ? resolve(cluster.sourcePath)
    : resolve(workspaceRoot, cluster.sourcePath);
  const bytes = readFileSync(path);
  if (bytes.length < 0x100 || bytes.toString('ascii', 0, 2) !== 'MZ') return null;
  const peOffset = bytes.readUInt32LE(0x3c);
  if (peOffset <= 0 || peOffset + 0x18 >= bytes.length) return null;
  if (bytes.toString('ascii', peOffset, peOffset + 4) !== 'PE\u0000\u0000') return null;
  const sectionCount = bytes.readUInt16LE(peOffset + 6);
  const optionalHeaderSize = bytes.readUInt16LE(peOffset + 20);
  const optionalHeader = peOffset + 24;
  const imageBase = bytes.readUInt32LE(optionalHeader + 28);
  const sectionOffset = optionalHeader + optionalHeaderSize;
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionOffset + (index * 40);
    const name = bytes.toString('ascii', offset, offset + 8).replace(/\u0000.*$/, '');
    const virtualSize = bytes.readUInt32LE(offset + 8);
    const virtualAddress = bytes.readUInt32LE(offset + 12);
    const rawSize = bytes.readUInt32LE(offset + 16);
    const rawPointer = bytes.readUInt32LE(offset + 20);
    if (cluster.offset >= rawPointer && cluster.offset < rawPointer + rawSize) {
      const rva = virtualAddress + (cluster.offset - rawPointer);
      const vaNumber = imageBase + rva;
      return {
        section: name,
        imageBase: hex(imageBase),
        rva: hex(rva),
        va: hex(vaNumber),
        vaNumber,
        sectionVirtualAddress: hex(virtualAddress),
        sectionVirtualSize: virtualSize,
        sectionRawPointer: hex(rawPointer),
        sectionRawSize: rawSize,
        likelyFunctionPointerTable: detectFunctionPointerTable(bytes, cluster.offset),
      };
    }
  }
  return null;
}

function detectFunctionPointerTable(bytes, offset) {
  const start = Math.max(0, offset - 34);
  const end = Math.min(bytes.length - 4, offset + 96);
  let pointerLike = 0;
  let checked = 0;
  for (let cursor = start; cursor <= end; cursor += 4) {
    const value = bytes.readUInt32LE(cursor);
    checked += 1;
    if (value >= 0x00400000 && value < 0x00800000) pointerLike += 1;
  }
  return checked >= 8 && pointerLike >= Math.floor(checked * 0.45);
}

function loadGhidraFunctions(workspaceRoot) {
  const paths = [
    join(workspaceRoot, '.omo', 'ghidra', 'export', 'G7MTClient', 'functions.jsonl'),
    join(workspaceRoot, '.omo', 'ghidra', 'export', 'G7MTClient', 'extra.jsonl'),
  ];
  const functions = [];
  for (const path of paths) {
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line);
      functions.push({
        addr: entry.addr,
        name: entry.name,
        sig: entry.sig,
        c: entry.c ?? '',
      });
    }
  }
  return functions;
}

function findNearbyGhidraRefs(vaNumber, ghidraFunctions) {
  if (!Number.isFinite(vaNumber)) return [];
  const refs = [];
  const symbolPattern = /\b(?:DAT|_DAT|PTR_FUN|PTR|LAB)_([0-9a-fA-F]{8})\b/g;
  for (const fn of ghidraFunctions) {
    const seen = new Set();
    for (const match of fn.c.matchAll(symbolPattern)) {
      const ref = Number.parseInt(match[1], 16);
      const distance = Math.abs(ref - vaNumber);
      if (distance > 0x200 || seen.has(ref)) continue;
      seen.add(ref);
      refs.push({
        functionAddr: fn.addr,
        functionName: fn.name,
        referencedVa: hex(ref),
        distance,
        snippet: snippetAround(fn.c, match.index ?? 0),
      });
    }
  }
  refs.sort((left, right) => left.distance - right.distance);
  return refs.slice(0, 12);
}

function classifyWithExecutableContext({
  overlapClassification,
  peContext,
  ghidraContext,
}) {
  const contextText = ghidraContext.map((ref) => ref.snippet).join(' ');
  if (
    peContext?.section === '.rdata'
    && (peContext.likelyFunctionPointerTable || /PTR_FUN_0066df|PTR_FUN/.test(contextText))
  ) {
    return 'rejected-function-pointer-table-false-positive';
  }
  if (/Direct3D|DisableMMX|DisablePSGP|yacc stack overflow|DAT_022293/.test(contextText)) {
    return 'rejected-runtime-parser-or-graphics-table';
  }
  return overlapClassification;
}

function checkTextCluster(cluster, galaxy) {
  const systemNames = new Set((galaxy.systems ?? []).map((system) => system.system));
  const hits = cluster.hits ?? [];
  const matchedTerms = hits
    .map((hit) => hit.term)
    .filter((term) => systemNames.has(term));
  return {
    sourcePath: cluster.sourcePath,
    uniqueTermCount: cluster.uniqueTermCount,
    matchedSystemNameCount: matchedTerms.length,
    matchedTerms,
    classification: matchedTerms.length >= 4
      ? 'system-name-text-cluster'
      : 'weak-system-text-candidate',
  };
}

function buildGalaxyCoordinateSets(galaxy) {
  const systems = galaxy.systems ?? [];
  return [
    ['canonColRow', 'canonCol', 'canonRow'],
    ['canonGameColRow', 'canonGameCol', 'canonGameRow'],
    ['canonLineMarkerColRow', 'canonLineMarkerCol', 'canonLineMarkerRow'],
  ].map(([name, xKey, yKey]) => ({
    name,
    values: new Set(systems
      .filter((system) => Number.isFinite(system[xKey]) && Number.isFinite(system[yKey]))
      .map((system) => `${system[xKey]},${system[yKey]}`)),
  }));
}

function assertRecordScan(recordScan) {
  if (!recordScan || recordScan.id !== 'logh7-record-candidate-scan') {
    throw new Error('Expected logh7-record-candidate-scan manifest');
  }
  if (!recordScan.categories?.systemPositions || !recordScan.categories?.originalCharacterRoster) {
    throw new Error('Record candidate scan manifest missing required categories');
  }
}

function hex(value) {
  return `0x${value.toString(16).padStart(8, '0')}`;
}

function snippetAround(value, index) {
  return value
    .slice(Math.max(0, index - 180), index + 260)
    .replace(/\s+/g, ' ')
    .trim();
}
