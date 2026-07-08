#!/usr/bin/env node
// LOGH VII 데이터 재해독 감사: 기존 JSON을 신뢰하지 않고 원천/증거/재생성 가능성만 분류한다.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const OUT = join(REPO_ROOT, 'server/content/generated/logh7-data-decode-audit.json');
const GENERATED_ID = 'logh7-data-decode-audit';

const SOURCE_ROOTS = [
  { id: 'archive-cd-bin', path: 'artifacts/logh7-cd/Logh7.bin', kind: 'archive-cd-image' },
  { id: 'archive-cd-cue', path: 'artifacts/logh7-cd/Logh7.cue', kind: 'archive-cd-cue' },
  { id: 'archive-cd-iso', path: 'artifacts/logh7-cd/Logh7.iso', kind: 'mounted-or-converted-cd-image' },
  { id: 'install-data', path: 'artifacts/logh7-install/____________s___/____/data', kind: 'installed-game-data-tree' },
  { id: 'client-exe', path: 'artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe', kind: 'installed-client-exe' },
  { id: 'launcher-exe', path: 'artifacts/logh7-install/____________s___/____/bootfirst.exe', kind: 'installed-launcher-exe' },
  { id: 'updater-exe', path: 'artifacts/logh7-install/____________s___/____/gin7updateclient.exe', kind: 'installed-updater-exe' },
  { id: 'official-patch', path: 'artifacts/official-patch-staging/bin/G7UPD040514.wayback.exe', kind: 'official-patch-exe' },
  { id: 'manual-pdfs', path: 'docs/reference', kind: 'official-manual-pdf-directory' },
];

const TRUST_REVIEW_PATTERNS = [
  'server/content/generated',
  'server/content/extracted',
  'server/content/roster',
  'server/content/manual',
];

const FEATURE_GATES = [
  {
    id: 'login-transport',
    label: '로그인 transport 0x0030',
    serverEvidence: ['server/src/server/logh7-envelope-0030.mjs'],
    docs: ['docs/reference/legacy-evidence/logh7-0030-protocol.md'],
  },
  {
    id: 'docs-pdf-requirements',
    label: 'docs/PDF 전체 요구사항 인덱스',
    serverEvidence: [],
    docs: [
      'docs/logh7-requirements-current.md',
      'docs/logh7-architecture-operations-current.md',
      'docs/reference/gin7manual.pdf',
      'docs/reference/gin7manual-cd-original.pdf',
      'server/content/generated/logh7-docs-requirements-audit.json',
    ],
  },
  {
    id: 'exe-full-re',
    label: 'G7MTClient.exe 전체 기능 RE 커버리지',
    serverEvidence: [],
    docs: [
      'artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe',
      '.omo/re-galaxy/functions.tsv',
      'docs/reference/legacy-evidence/RE/logh7-exe-function-audit-2026-06-30.md',
      'server/content/generated/logh7-exe-re-coverage-audit.json',
    ],
  },
  {
    id: 'ui-coordinate-calibration',
    label: 'UI 좌표/클릭/화면 캘리브레이션',
    serverEvidence: [],
    docs: [
      'docs/reference/legacy-evidence/logh7-ui-coordinate-map.md',
      'docs/reference/legacy-evidence/logh7-original-ui-reference-2026-06-23.md',
      'server/content/generated/logh7-ui-coordinate-audit.json',
    ],
  },
  {
    id: 'character-create-delete-select',
    label: '캐릭터 작성/삭제/오리지널 캐릭터 선택',
    serverEvidence: [],
    docs: [
      'docs/reference/legacy-evidence/logh7-character-creation-wire.md',
      'docs/reference/legacy-evidence/logh7-character-record-wire.md',
      'docs/reference/legacy-evidence/logh7-character-creation-research.md',
    ],
  },
  {
    id: 'strategic-map-commands',
    label: '전략맵과 전략 커맨드',
    serverEvidence: [],
    docs: [
      'docs/reference/legacy-evidence/logh7-strategic-map-wire.md',
      'docs/reference/legacy-evidence/logh7-strategic-input-wire.md',
      'docs/reference/legacy-evidence/logh7-opcode-reference-2026-06-28.md',
    ],
  },
  {
    id: 'tactical-map-battle',
    label: '전술맵/전투/함대 작전',
    serverEvidence: [],
    docs: [
      'docs/reference/legacy-evidence/logh7-proto-battle-core.md',
      'docs/reference/legacy-evidence/logh7-proto-battle-fire.md',
      'docs/reference/legacy-evidence/logh7-proto-battle-fleetops.md',
      'docs/reference/legacy-evidence/logh7-tactical-seed-2026-06-26.md',
    ],
  },
  {
    id: 'chat-social',
    label: '채팅/사회/계정 상호작용',
    serverEvidence: [],
    docs: [
      'docs/reference/legacy-evidence/logh7-chat-input-re-2026-06-24.md',
      'docs/reference/legacy-evidence/logh7-proto-social-account.md',
    ],
  },
  {
    id: 'korean-localization',
    label: '한글화/폰트/리소스 문자열',
    serverEvidence: [],
    docs: [
      'docs/reference/legacy-evidence/logh7-korean-client-hunt.md',
      'docs/reference/legacy-evidence/logh7-korean-name-input-re-2026-06-27.md',
      'docs/reference/legacy-evidence/logh7-localization-audit.md',
      'docs/reference/legacy-evidence/logh7-string-txt-index.md',
    ],
  },
  {
    id: 'remaster-assets',
    label: '리마스터링 자산 파이프라인',
    serverEvidence: [],
    docs: [
      'docs/reference/legacy-evidence/logh7-original-ui-reference-2026-06-23.md',
      'docs/reference/legacy-evidence/logh7-reference-visual-catalog-2026-06-25.md',
      'docs/reference/legacy-evidence/logh7-original-data-survey-2026-06-12.md',
      'docs/reference/remaster-art/logh7-medal-emblem-mining-2026-07-03.md',
      'server/content/generated/logh7-remaster-provenance-manifest.json',
    ],
  },
  {
    id: 'world-data',
    label: '월드 데이터/경제/인사/군수',
    serverEvidence: [],
    docs: [
      'docs/reference/legacy-evidence/logh7-world-data-mining-status.md',
      'docs/reference/legacy-evidence/logh7-proto-strategic-logistics.md',
      'docs/reference/legacy-evidence/logh7-proto-personnel-strategy.md',
    ],
  },
];

function repoPath(path) {
  return join(REPO_ROOT, path);
}

function toRepoRelative(path) {
  return relative(REPO_ROOT, path).split(sep).join('/');
}

function walkFiles(root, predicate = () => true) {
  const out = [];
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (predicate(full)) {
        out.push(full);
      }
    }
  }
  return out.sort();
}

function summarizeDirectory(root) {
  const files = walkFiles(root);
  const byExt = {};
  let totalBytes = 0;
  for (const file of files) {
    const st = statSync(file);
    totalBytes += st.size;
    const ext = extname(file).toLowerCase() || '<none>';
    byExt[ext] = (byExt[ext] || 0) + 1;
  }
  return { fileCount: files.length, totalBytes, byExt };
}

function hashFile(path, algo = 'sha256') {
  return new Promise((resolveHash, reject) => {
    const hash = createHash(algo);
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function inspectSourceRoot(source) {
  const full = repoPath(source.path);
  if (!existsSync(full)) return { ...source, exists: false };
  const st = statSync(full);
  if (st.isDirectory()) {
    return { ...source, exists: true, type: 'directory', ...summarizeDirectory(full) };
  }
  return {
    ...source,
    exists: true,
    type: 'file',
    sizeBytes: st.size,
    sha256: await hashFile(full),
  };
}

function collectKeysAndStrings(value, keys = new Set(), strings = [], depth = 0) {
  if (depth > 8 || value == null) return { keys, strings };
  if (typeof value === 'string') {
    strings.push(value);
    return { keys, strings };
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 5000)) collectKeysAndStrings(item, keys, strings, depth + 1);
    return { keys, strings };
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.add(key);
      collectKeysAndStrings(child, keys, strings, depth + 1);
    }
  }
  return { keys, strings };
}

function normalizeRef(raw) {
  let ref = raw.trim();
  ref = ref.replace(/^file:\/\//, '');
  ref = ref.replace(/^['"`<]+|['"`>),.;]+$/g, '');
  ref = ref.replace(/:[0-9]+(?::[0-9]+)?$/, '');
  ref = ref.replaceAll('\\', '/');
  if (ref.startsWith('/e/logh7-revival/')) ref = ref.slice('/e/logh7-revival/'.length);
  if (/^[A-Za-z]:\//.test(ref)) {
    const normalizedRoot = REPO_ROOT.replaceAll('\\', '/').toLowerCase();
    if (!ref.toLowerCase().startsWith(normalizedRoot)) return null;
    ref = ref.slice(REPO_ROOT.length).replace(/^\/+/, '');
  }
  return ref;
}

function extractPathRefs(strings) {
  const refs = new Set();
  const extPattern = /\.(?:json|md|pdf|png|jpg|jpeg|bmp|tga|tcf|hed|dat|txt|mjs|py|exe|bin|cue|iso|mdx|mds)\b/i;
  for (const s of strings) {
    if (/^https?:\/\//i.test(s)) continue;
    const candidates = s.split(/\s+/).flatMap((part) => part.split(/[(),]/));
    for (const part of candidates) {
      if (!part) continue;
      if (!part.includes('/') && !part.includes('\\') && !extPattern.test(part)) continue;
      if (!/^(?:\.omo|artifacts|docs|server|tools|content|data|E:|\/e\/logh7-revival)/i.test(part) && !extPattern.test(part)) {
        continue;
      }
      const normalized = normalizeRef(part);
      if (normalized) refs.add(normalized);
    }
  }
  return [...refs].sort();
}

const PATH_ALIASES = [
  ['.omo/work/logh7-installed/', 'artifacts/logh7-install/____________s___/____/'],
  ['.omo/work/logh7-cd-extract/installshield-root/', 'artifacts/logh7-install/'],
  ['.omo/work/logh7-cd-extract/Logh7_mode2_2048.iso', 'artifacts/logh7-cd/Logh7.iso'],
];

function pathCandidates(ref) {
  const candidates = [ref];
  for (const [from, to] of PATH_ALIASES) {
    if (ref === from) candidates.push(to);
    if (ref.startsWith(from)) candidates.push(`${to}${ref.slice(from.length)}`);
  }
  return [...new Set(candidates)];
}

function resolveRefPath(ref) {
  if (ref.startsWith('data/')) return repoPath(`artifacts/logh7-install/____________s___/____/${ref}`);
  if (ref.startsWith('content/')) return repoPath(`server/${ref}`);
  return repoPath(ref);
}

function pathRefStatus(ref) {
  const candidates = pathCandidates(ref);
  for (const candidate of candidates) {
    const full = resolveRefPath(candidate);
    if (existsSync(full)) {
      return { ref, exists: true, resolvedAs: toRepoRelative(full), matchedRef: candidate };
    }
  }
  const full = resolveRefPath(ref);
  return { ref, exists: false, resolvedAs: toRepoRelative(full), candidateRefs: candidates.slice(1) };
}

function classifyContentPath(rel) {
  const parts = rel.split('/');
  if (parts[2]) return parts.slice(0, 3).join('/');
  return dirname(rel).split(sep).join('/');
}

function auditJsonFile(file) {
  const rel = toRepoRelative(file);
  const text = readFileSync(file, 'utf8');
  const base = {
    path: rel,
    category: classifyContentPath(rel),
    sizeBytes: statSync(file).size,
  };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ...base, parseOk: false, error: error.message, trust: 'parse-error' };
  }

  const { keys, strings } = collectKeysAndStrings(parsed);
  const keyList = [...keys].sort();
  const evidenceKeys = keyList.filter((key) => /source|provenance|evidence|sha|md5|hash|generator|generated|method|layout|manual|pdf|mdx|exe|origin|status|canonical/i.test(key));
  const pathRefs = extractPathRefs(strings).map(pathRefStatus);
  const brokenRefs = pathRefs.filter((ref) => !ref.exists);
  const hasStrongHash = keyList.some((key) => /sha|md5|hash/i.test(key));
  const hasEvidence = evidenceKeys.length > 0;

  let trust = 'needs-redecode';
  if (rel.includes('/manual/')) trust = 'manual-derived-review';
  if (hasEvidence && brokenRefs.length === 0) trust = hasStrongHash ? 'source-hash-backed' : 'source-described';
  if (brokenRefs.length > 0) trust = 'broken-reference-review';
  if (rel.includes('/generated/')) trust = trust === 'source-hash-backed' ? 'generated-source-hash-backed' : `generated-${trust}`;
  if (rel.includes('/extracted/')) trust = trust === 'source-hash-backed' ? 'extracted-source-hash-backed' : `extracted-${trust}`;

  return {
    ...base,
    parseOk: true,
    topLevelType: Array.isArray(parsed) ? 'array' : typeof parsed,
    topLevelCount: Array.isArray(parsed) ? parsed.length : (parsed && typeof parsed === 'object' ? Object.keys(parsed).length : null),
    evidenceKeyCount: evidenceKeys.length,
    evidenceKeys: evidenceKeys.slice(0, 30),
    pathRefCount: pathRefs.length,
    brokenPathRefCount: brokenRefs.length,
    samplePathRefs: pathRefs.slice(0, 12),
    brokenPathRefs: brokenRefs.slice(0, 20),
    trust,
  };
}

function inspectExtractor(file) {
  const rel = toRepoRelative(file);
  const text = readFileSync(file, 'utf8');
  const pathMatches = [...text.matchAll(/(?:server\/content|artifacts|docs\/reference|data\/)[A-Za-z0-9_.\/\-]+/g)].map((m) => m[0]);
  return {
    path: rel,
    sizeBytes: statSync(file).size,
    mentionedPaths: [...new Set(pathMatches)].sort().slice(0, 40),
  };
}

function countBy(items, key) {
  const out = {};
  for (const item of items) {
    const value = typeof key === 'function' ? key(item) : item[key];
    out[value] = (out[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

function featureGateStatus(gate) {
  const docs = gate.docs.map((doc) => ({ path: doc, exists: existsSync(repoPath(doc)) }));
  const serverEvidence = gate.serverEvidence.map((file) => ({ path: file, exists: existsSync(repoPath(file)) }));
  return {
    ...gate,
    docs,
    serverEvidence,
    implementationStatus: serverEvidence.some((item) => item.exists) ? 'partial-code-present' : 'not-implemented',
    evidenceStatus: docs.every((item) => item.exists) ? 'docs-present' : 'docs-missing',
  };
}

const sourceRoots = await Promise.all(SOURCE_ROOTS.map(inspectSourceRoot));
const contentFiles = walkFiles(repoPath('server/content'), (file) => file.endsWith('.json') && toRepoRelative(file) !== 'server/content/generated/logh7-data-decode-audit.json');
const jsonAudits = contentFiles.map(auditJsonFile);
const extractorFiles = walkFiles(repoPath('tools/extract'), (file) => /\.(?:mjs|py)$/i.test(file)).map(inspectExtractor);

const needsReview = jsonAudits
  .filter((item) => item.trust.includes('needs-redecode') || item.trust.includes('broken-reference') || !item.parseOk)
  .sort((a, b) => b.brokenPathRefCount - a.brokenPathRefCount || a.path.localeCompare(b.path));

const audit = {
  id: GENERATED_ID,
  generatedAt: new Date().toISOString(),
  policy: {
    premise: '기존 JSON은 정본으로 신뢰하지 않는다. 원천 파일, 해시, 재생성 스크립트, 증거 문서가 확인된 항목만 다음 구현 입력으로 승격한다.',
    output: '이 파일은 재해독 작업 큐와 증거 결손을 만들기 위한 감사 산출물이다. 게임 런타임 정본 데이터가 아니다.',
  },
  sourceRoots,
  jsonSummary: {
    total: jsonAudits.length,
    parseErrors: jsonAudits.filter((item) => !item.parseOk).length,
    withEvidenceKeys: jsonAudits.filter((item) => item.evidenceKeyCount > 0).length,
    withBrokenPathRefs: jsonAudits.filter((item) => item.brokenPathRefCount > 0).length,
    byCategory: countBy(jsonAudits, 'category'),
    byTrust: countBy(jsonAudits, 'trust'),
  },
  extractorSummary: {
    total: extractorFiles.length,
    files: extractorFiles,
  },
  featureGates: FEATURE_GATES.map(featureGateStatus),
  reviewQueue: needsReview.slice(0, 60),
  allJson: jsonAudits,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(`wrote ${toRepoRelative(OUT)}`);
console.log(JSON.stringify(audit.jsonSummary, null, 2));
