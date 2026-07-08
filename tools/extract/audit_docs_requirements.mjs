#!/usr/bin/env node
// docs/와 매뉴얼 PDF 덤프에서 구현 대상 기능 요구사항을 도메인별로 인덱싱한다.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const OUT = join(REPO_ROOT, 'server/content/generated/logh7-docs-requirements-audit.json');

const DOMAINS = [
  { id: 'login', terms: ['로그인', 'login', 'ログイン', '0x0030', 'handshake'] },
  { id: 'character', terms: ['캐릭터', 'character', 'キャラクター', '작성', '삭제', '선택', 'creation', 'delete'] },
  { id: 'lobby-world', terms: ['로비', 'lobby', 'world', '월드', '진입', 'inworld'] },
  { id: 'strategic-map', terms: ['전략', '戦略', '전략맵', 'メインビュー', '銀河マップ', '職務権限カード', 'command', 'コマンド'] },
  { id: 'tactical-battle', terms: ['전술', '戦術', '전투', 'battle', '戦闘', '함대', '艦隊', '사격', 'fire'] },
  { id: 'economy-logistics', terms: ['경제', 'economy', '생산', '보급', 'logistics', '物資', '艦艇', 'ship'] },
  { id: 'personnel-rank', terms: ['인사', '계급', 'rank', '승진', '직무', '권한', 'post', '功績'] },
  { id: 'chat-social', terms: ['채팅', 'chat', 'チャット', '全体', '同陣営', '사회', 'mail'] },
  { id: 'ui-coordinate', terms: ['UI', '좌표', 'coordinate', 'screen', '画面', 'クリック', 'button', '버튼'] },
  { id: 'localization', terms: ['한글', 'localization', 'cp949', 'font', 'String.txt', '번역', '韓国'] },
  { id: 'remaster', terms: ['remaster', '리마스터', 'upscale', 'portrait', '초상', 'visual', 'medal'] },
  { id: 'data-redecode', terms: ['데이터', '해독', 'extract', '추출', 'JSON', '정본', 'source', 'provenance'] },
  { id: 'exe-re', terms: ['EXE', 'RE', 'Ghidra', 'FUN_', '0x00', 'reverse', '디컴파일'] },
];

const REQUIREMENT_HINTS = [
  'must', '해야', '구현', '필요', '완료', 'TODO', 'todo', '남은', '미완', 'required',
  'command', 'コマンド', 'できる', '가능', '검증', 'verify', '라이브',
];

function repoPath(path) {
  return join(REPO_ROOT, path);
}

function rel(path) {
  return relative(REPO_ROOT, path).split(sep).join('/');
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

function classify(text) {
  const lower = text.toLowerCase();
  return DOMAINS
    .filter((domain) => domain.terms.some((term) => lower.includes(term.toLowerCase())))
    .map((domain) => domain.id);
}

function requirementLines(path, text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const hasHint = REQUIREMENT_HINTS.some((hint) => trimmed.toLowerCase().includes(hint.toLowerCase()));
    const hasDomain = classify(trimmed).length > 0;
    const heading = /^#{1,4}\s+/.test(trimmed);
    if (heading || (hasHint && hasDomain)) {
      out.push({
        line: index + 1,
        text: trimmed.slice(0, 240),
        domains: classify(trimmed),
      });
    }
  });
  return out.slice(0, 120);
}

function auditDoc(file) {
  const text = readFileSync(file, 'utf8');
  const reqs = requirementLines(file, text);
  return {
    path: rel(file),
    sizeBytes: statSync(file).size,
    domains: classify(`${rel(file)}\n${text}`),
    requirementLineCount: reqs.length,
    requirementLines: reqs,
  };
}

function auditManualDump(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { path: rel(file), parseOk: false, error: error.message };
  }
  const pages = Array.isArray(parsed.pages) ? parsed.pages : Array.isArray(parsed) ? parsed : [];
  const pageAudits = [];
  for (const page of pages) {
    const pageNo = page.page ?? page.pageIndex ?? page.number ?? pageAudits.length + 1;
    const text = [page.text, page.annotations, page.annots].flat().filter(Boolean).join('\n');
    const domains = classify(text);
    if (domains.length) {
      pageAudits.push({
        page: pageNo,
        domains,
        sample: text.replace(/\s+/g, ' ').slice(0, 260),
      });
    }
  }
  return {
    path: rel(file),
    parseOk: true,
    pageCount: pages.length,
    relevantPageCount: pageAudits.length,
    pages: pageAudits.slice(0, 160),
  };
}

const docFiles = walk(repoPath('docs'), (file) => /\.(?:md|json)$/i.test(file) && !file.includes(`${sep}ui-catalog${sep}`));
const docs = docFiles.map(auditDoc);
const manualDumps = walk(repoPath('.omo/work/manual-dump'), (file) => file.endsWith('.json')).map(auditManualDump);
const pdfs = walk(repoPath('docs/reference'), (file) => file.toLowerCase().endsWith('.pdf')).map((file) => ({
  path: rel(file),
  sizeBytes: statSync(file).size,
  dumpPresent: manualDumps.some((dump) => dump.path.toLowerCase().includes(file.split(/[\\/]/).pop().replace(/\.pdf$/i, '').toLowerCase())),
}));

const domainSummary = Object.fromEntries(
  DOMAINS.map((domain) => [
    domain.id,
    {
      docs: docs.filter((doc) => doc.domains.includes(domain.id)).length,
      requirementLines: docs.reduce((sum, doc) => sum + doc.requirementLines.filter((line) => line.domains.includes(domain.id)).length, 0),
      manualPages: manualDumps.reduce((sum, dump) => sum + (dump.pages || []).filter((page) => page.domains.includes(domain.id)).length, 0),
    },
  ]),
);

const audit = {
  id: 'logh7-docs-requirements-audit',
  generatedAt: new Date().toISOString(),
  policy: {
    premise: 'docs/와 공식 PDF의 모든 기능 요소를 구현 후보로 추적한다. 문서에 있다는 사실은 구현 완료 증거가 아니다.',
    implementationRule: '각 요구사항은 서버 코드, 데이터 원천, 테스트, 라이브 클라이언트 증거 중 해당 표면 증거가 생길 때 완료로 승격한다.',
  },
  summary: {
    docCount: docs.length,
    pdfCount: pdfs.length,
    manualDumpCount: manualDumps.length,
    totalRequirementLines: docs.reduce((sum, doc) => sum + doc.requirementLineCount, 0),
    domainSummary,
  },
  pdfs,
  manualDumps,
  docs,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
console.log(`wrote ${rel(OUT)}`);
console.log(JSON.stringify(audit.summary, null, 2));
