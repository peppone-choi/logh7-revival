#!/usr/bin/env node
// LOGH VII UI 좌표 감사: 좌표 숫자를 정본으로 승격하지 않고 원천/라이브 증거 유무를 분리한다.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const OUT = join(REPO_ROOT, 'server/content/generated/logh7-ui-coordinate-audit.json');

const SOURCES = [
  { path: 'docs/reference/legacy-evidence/logh7-ui-coordinate-map.md', grade: 'legacy-live-doc' },
  { path: 'docs/reference/legacy-evidence/logh7-original-ui-reference-2026-06-23.md', grade: 'visual-reference-doc' },
  { path: 'docs/reference/legacy-evidence/logh7-lobby-char-delete-2026-06-26.md', grade: 'legacy-live-doc' },
  { path: 'server/content/manual/strategy-screen-layout.json', grade: 'manual-derived-layout' },
  { path: 'server/content/manual/strategy-ui-panels.json', grade: 'manual-derived-layout' },
  { path: 'server/content/generated/logh7-ui-scene-catalog.json', grade: 'generated-scene-catalog' },
  { path: 'server/content/generated/logh7-original-ui-image-manifest.json', grade: 'generated-visual-manifest' },
  { path: 'server/content/generated/logh7-ui-scene-remaster-gameplay-boundary.json', grade: 'remaster-boundary' },
];

function repoPath(path) {
  return join(REPO_ROOT, path);
}

function rel(path) {
  return relative(REPO_ROOT, path).split(sep).join('/');
}

function normalizeRef(raw) {
  let ref = raw.replace(/^['"`(<]+|['"`)>.,;:]+$/g, '').replaceAll('\\', '/');
  if (ref.startsWith('/e/logh7-revival/')) ref = ref.slice('/e/logh7-revival/'.length);
  if (/^[A-Za-z]:\//.test(ref)) {
    const root = REPO_ROOT.replaceAll('\\', '/').toLowerCase();
    if (!ref.toLowerCase().startsWith(root)) return null;
    ref = ref.slice(REPO_ROOT.length).replace(/^\/+/, '');
  }
  return ref;
}

function refExists(ref) {
  const normalized = normalizeRef(ref);
  if (!normalized) return { ref, exists: false };
  if (normalized.startsWith('shots/')) {
    const candidates = [
      repoPath(normalized),
      repoPath(`.omo/ui-explorer/${normalized}`),
    ];
    return { ref: normalized, exists: candidates.some(existsSync), candidates: candidates.map(rel) };
  }
  const full = repoPath(normalized);
  return { ref: normalized, exists: existsSync(full), candidates: [rel(full)] };
}

function collectJsonNumbers(value, path = [], out = []) {
  if (value == null) return out;
  if (typeof value === 'number') {
    const key = path[path.length - 1] || '';
    if (/^(x|y|w|h|left|top|right|bottom|width|height|row|col|screen|page|index)$/i.test(key)) {
      out.push({ path: path.join('.'), value });
    }
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length >= 2 && value.length <= 4 && value.every((item) => typeof item === 'number')) {
      out.push({ path: path.join('.'), value });
    }
    value.forEach((item, index) => collectJsonNumbers(item, path.concat(String(index)), out));
    return out;
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => collectJsonNumbers(child, path.concat(key), out));
  }
  return out;
}

function collectStringRefs(text) {
  const refs = new Set();
  for (const match of text.matchAll(/(?:\.omo|docs|server|tools|shots|artifacts)[A-Za-z0-9_./\\-]+\.(?:png|jpg|jpeg|json|md|txt)/g)) {
    refs.add(match[0]);
  }
  return [...refs].sort().map(refExists);
}

function collectTextCoordinates(text) {
  const out = [];
  const patterns = [
    /\((\d{2,4})\s*,\s*(\d{2,4})\)/g,
    /\b(?:x|left)\s*[:=]\s*(\d{2,4})\b[\s\S]{0,20}\b(?:y|top)\s*[:=]\s*(\d{2,4})\b/gi,
    /\b(\d{2,4})\s*x\s*(\d{2,4})\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      out.push({ raw: match[0], values: [Number(match[1]), Number(match[2])] });
    }
  }
  return out;
}

function auditSource(source) {
  const full = repoPath(source.path);
  if (!existsSync(full)) return { ...source, exists: false };
  const text = readFileSync(full, 'utf8');
  const st = statSync(full);
  let jsonCoordinates = [];
  if (source.path.endsWith('.json')) {
    try {
      jsonCoordinates = collectJsonNumbers(JSON.parse(text)).slice(0, 200);
    } catch (error) {
      return { ...source, exists: true, parseOk: false, error: error.message };
    }
  }
  const textCoordinates = collectTextCoordinates(text).slice(0, 200);
  const refs = collectStringRefs(text);
  const brokenRefs = refs.filter((item) => !item.exists);
  return {
    ...source,
    exists: true,
    parseOk: true,
    sizeBytes: st.size,
    coordinateCandidateCount: jsonCoordinates.length + textCoordinates.length,
    jsonCoordinates,
    textCoordinates,
    evidenceRefCount: refs.length,
    brokenEvidenceRefCount: brokenRefs.length,
    refs: refs.slice(0, 40),
    brokenRefs: brokenRefs.slice(0, 40),
    caution:
      source.grade.includes('manual')
        ? 'manual layout describes UI roles; do not use as click coordinate without live calibration'
        : 'legacy coordinate requires matching EXE hash, window mode, resolution, and screenshot proof before use',
  };
}

function listUiCatalogImages() {
  const root = repoPath('docs/reference/ui-catalog');
  if (!existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(?:png|jpg|jpeg|bmp)$/i.test(entry.name)) out.push(rel(full));
    }
  }
  return out.sort();
}

const sources = SOURCES.map(auditSource);
const audit = {
  id: 'logh7-ui-coordinate-audit',
  generatedAt: new Date().toISOString(),
  policy: {
    premise: 'UI 좌표는 창 위치/해상도/EXE 해시/패치 상태에 묶인다. 숫자만 있으면 정본이 아니다.',
    promotionRule: '좌표 승격은 스크린샷 또는 라이브 캡처, EXE 해시, 창 모드, 클릭 대상 결과가 함께 있을 때만 한다.',
  },
  summary: {
    sourceCount: sources.length,
    missingSources: sources.filter((item) => !item.exists).map((item) => item.path),
    coordinateCandidateCount: sources.reduce((sum, item) => sum + (item.coordinateCandidateCount || 0), 0),
    brokenEvidenceRefCount: sources.reduce((sum, item) => sum + (item.brokenEvidenceRefCount || 0), 0),
    uiCatalogImageCount: listUiCatalogImages().length,
  },
  sources,
  uiCatalogImages: listUiCatalogImages().slice(0, 200),
  nextLiveQaChecklist: [
    'record EXE sha256 before UI coordinate capture',
    'record window mode and client rectangle',
    'capture screenshot before click',
    'click center and edge cases for each target',
    'capture screenshot/log after click to prove target result',
    'store coordinates only with source screenshot/session id',
  ],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(`wrote ${rel(OUT)}`);
console.log(JSON.stringify(audit.summary, null, 2));
