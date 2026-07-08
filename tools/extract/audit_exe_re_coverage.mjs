#!/usr/bin/env node
// G7MTClient.exe 전체 기능 RE 커버리지 감사.
// 함수 전체를 이미 해석했다고 주장하지 않고, 현재 함수 목록과 RE 문서 커버리지를 대조한다.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const OUT = join(REPO_ROOT, 'server/content/generated/logh7-exe-re-coverage-audit.json');

const EXE = 'artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe';
const FUNCTION_TSV = '.omo/re-galaxy/functions.tsv';
const DECOMP = '.omo/re-galaxy/galaxy-decomp.c';

const DOMAINS = [
  { id: 'transport-login', terms: ['0030', '0034', '0035', '0036', 'login', 'ログイン', 'handshake', 'cipher', 'key'] },
  { id: 'character-lobby', terms: ['character', 'キャラクター', 'lobby', 'ロビー', 'delete', 'creation', 'record'] },
  { id: 'strategic-map', terms: ['strategic', 'strategy', '戦略', 'map', '0b07', '0b0a', 'c002', 'SelectGrid'] },
  { id: 'tactical-battle', terms: ['tactical', 'battle', '戦闘', 'mode0', '033b', 'fire', 'fleet'] },
  { id: 'chat-social', terms: ['chat', 'チャット', 'social', 'account', 'mail', 'message'] },
  { id: 'ui-rendering', terms: ['ui', 'display', 'render', 'GDI', 'TextOut', 'DrawText', 'coordinate', 'panel'] },
  { id: 'data-structures', terms: ['structure', 'record', 'table', 'dat', 'MsgDat', 'constmsg'] },
  { id: 'assets-models', terms: ['model', 'mdx', 'mds', 'texture', 'asset', 'galaxy'] },
  { id: 'localization-font', terms: ['korean', '한글', 'font', 'String.txt', 'cp949', 'rsrc'] },
  { id: 'remaster-visual', terms: ['remaster', 'visual', 'portrait', 'upscale', 'ui-catalog'] },
];

function repoPath(path) {
  return join(REPO_ROOT, path);
}

function rel(path) {
  return relative(REPO_ROOT, path).split(sep).join('/');
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function walk(root, predicate = () => true) {
  const out = [];
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (predicate(full)) out.push(full);
    }
  }
  return out.sort();
}

function readFunctions() {
  const full = repoPath(FUNCTION_TSV);
  if (!existsSync(full)) return [];
  return readFileSync(full, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [address, name, sizeRaw] = line.split('\t');
      return { address, name, sizeBytes: Number(sizeRaw) || 0 };
    });
}

function readDocs() {
  return walk(repoPath('docs/reference/legacy-evidence'), (file) => /\.(?:md|json)$/i.test(file)).map((file) => {
    const text = readFileSync(file, 'utf8');
    const addresses = [...new Set([...text.matchAll(/\b(?:FUN_)?00[4-7][0-9a-f]{5}\b|0x00[4-7][0-9a-f]{5}\b/gi)].map((m) => m[0]))].sort();
    const lower = `${rel(file)}\n${text}`.toLowerCase();
    const domains = DOMAINS.filter((domain) => domain.terms.some((term) => lower.includes(term.toLowerCase()))).map((d) => d.id);
    return {
      path: rel(file),
      sizeBytes: statSync(file).size,
      addressCount: addresses.length,
      sampleAddresses: addresses.slice(0, 30),
      domains,
    };
  });
}

function classifyFunction(fn, docs) {
  const hits = docs.filter((doc) =>
    doc.sampleAddresses.includes(fn.address) ||
    doc.sampleAddresses.includes(fn.address.replace(/^0x/, 'FUN_00')) ||
    doc.sampleAddresses.includes(fn.name),
  );
  return {
    ...fn,
    docHitCount: hits.length,
    docs: hits.slice(0, 8).map((doc) => doc.path),
  };
}

const exeFull = repoPath(EXE);
const functions = readFunctions();
const docs = readDocs();
const classified = functions.map((fn) => classifyFunction(fn, docs));
const covered = classified.filter((fn) => fn.docHitCount > 0);
const uncovered = classified.filter((fn) => fn.docHitCount === 0);

const domainDocs = Object.fromEntries(
  DOMAINS.map((domain) => [
    domain.id,
    docs.filter((doc) => doc.domains.includes(domain.id)).map((doc) => doc.path),
  ]),
);

const audit = {
  id: 'logh7-exe-re-coverage-audit',
  generatedAt: new Date().toISOString(),
  policy: {
    premise: 'EXE 모든 기능 RE는 함수/도메인 단위로 추적한다. 문서명 또는 과거 결론만으로 구현 완료를 주장하지 않는다.',
    promotionRule: '서버 구현으로 승격하려면 함수 주소, 디컴파일/라이브 경로, wire/data 소비자, 테스트 또는 라이브 증거가 필요하다.',
  },
  exe: existsSync(exeFull)
    ? { path: EXE, exists: true, sizeBytes: statSync(exeFull).size, sha256: sha256(exeFull) }
    : { path: EXE, exists: false },
  sourceArtifacts: [
    { path: FUNCTION_TSV, exists: existsSync(repoPath(FUNCTION_TSV)) },
    { path: DECOMP, exists: existsSync(repoPath(DECOMP)) },
  ],
  summary: {
    functionCount: functions.length,
    documentedFunctionCount: covered.length,
    undocumentedFunctionCount: uncovered.length,
    reDocCount: docs.length,
    reDocsWithAddresses: docs.filter((doc) => doc.addressCount > 0).length,
    domainsWithDocs: Object.fromEntries(Object.entries(domainDocs).map(([id, items]) => [id, items.length])),
  },
  domainDocs,
  topUndocumentedBySize: uncovered.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 80),
  docs,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(`wrote ${rel(OUT)}`);
console.log(JSON.stringify(audit.summary, null, 2));
