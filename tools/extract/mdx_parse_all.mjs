// LOGH7 .mdx/.mds 전수 파서 (2단계 해독)
// 포맷: LOGH7 자체 포맷 — 직렬화된 C++ 씬그래프 메모리 이미지 (Blizzard MDX 아님, 리틀엔디안)
// 근거: git 5bd249c server/src/server/logh7-mdx-catalog.mjs (0x58/0xE8 노드워크) +
//       docs/reference/legacy-evidence/logh7-model-data-extraction.md + tools/extract/mdx_recon.py 정찰 결과
// 사용: node tools/extract/mdx_parse_all.mjs [--root <model dir>] [--out <models.json>]
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const HEADER_PAIR_COUNT = 10; // (ptr,count) 디스크립터 10쌍 @0x00
const NODE_STRIDE = 0xe8;     // 노드 디렉토리 레코드 크기
const DEFAULT_NODE_DIR = 0x58; // 대부분의 파일에서 노드 디렉토리 시작 오프셋

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const ROOT = getArg('--root', 'E:/logh7-revival/artifacts/logh7-install/____________s___/____/data/model');
const OUT = getArg('--out', 'E:/logh7-revival/server/content/generated/models.json');

// cp932 디코더 (임베디드 소스경로에 일본어 디렉토리명 포함)
let sjisDecoder = null;
try { sjisDecoder = new TextDecoder('shift_jis'); } catch { /* ICU 미지원이면 latin1 폴백 */ }

function listModelFiles(root) {
  const out = [];
  const visit = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(dir, e.name);
      if (e.isDirectory()) visit(p);
      else if (/\.(mdx|mds)$/i.test(e.name)) out.push(p);
    }
  };
  visit(root);
  return out;
}

function parseHeader(buf) {
  const pairs = [];
  for (let s = 0; s < HEADER_PAIR_COUNT; s++) {
    pairs.push({ slot: s, stale_ptr: buf.readUInt32LE(s * 8), count: buf.readUInt32LE(s * 8 + 4) });
  }
  return pairs;
}

// 노드명 유효성: 선두가 인쇄가능 ASCII이고 NUL 종단 문자열이 식별자 형태
function readCString(buf, off, max = 96) {
  let end = off;
  while (end < buf.length && end < off + max && buf[end] !== 0) end++;
  return buf.subarray(off, end).toString('latin1');
}
function isPlausibleName(s) {
  return s.length >= 1 && s.length <= 64 && /^[\x21-\x7e][\x20-\x7e]*$/.test(s);
}

// 노드 디렉토리 시작 오프셋 결정: 0x58 우선, 실패 시 pair0 stale ptr 하위워드에서 유도(0xa0-0x58=0x48 보정), 그래도 실패면 스캔
function findNodeDirStart(buf, nodeCount) {
  const candidates = [DEFAULT_NODE_DIR];
  const low = buf.readUInt32LE(0) & 0xffff;
  if (low >= 0x48) candidates.push(low - 0x48); // 정상파일 하위워드 0xa0 → 0x58 관계에서 유도
  candidates.push(low); // 유도식이 틀릴 경우 대비
  for (const c of candidates) {
    if (c + NODE_STRIDE > buf.length) continue;
    const n0 = readCString(buf, c);
    const n1 = nodeCount > 1 && c + NODE_STRIDE < buf.length ? readCString(buf, c + NODE_STRIDE) : null;
    if (isPlausibleName(n0) && (n1 === null || isPlausibleName(n1) || n1.length === 0)) return { start: c, method: c === DEFAULT_NODE_DIR ? 'default_0x58' : 'derived_from_pair0_ptr' };
  }
  // 최후: 파일 앞 0x400 바이트에서 stride 정합 스캔
  for (let c = 0x50; c < Math.min(0x400, buf.length - NODE_STRIDE); c += 4) {
    const n0 = readCString(buf, c);
    if (!isPlausibleName(n0)) continue;
    if (nodeCount <= 1) return { start: c, method: 'scan' };
    const n1 = readCString(buf, c + NODE_STRIDE);
    if (isPlausibleName(n1) || n1.length === 0) return { start: c, method: 'scan' };
  }
  return null;
}

function parseNodes(buf, start, count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const off = start + i * NODE_STRIDE;
    if (off + 1 > buf.length) break;
    const name = readCString(buf, off);
    nodes.push({ index: i, offset: off, name: isPlausibleName(name) ? name : null });
  }
  return nodes;
}

// 임베디드 소스경로 추출: cp932 허용 바이트 시퀀스를 스티칭 후 확장자 필터
function extractSourceRefs(buf) {
  const lwo = new Set(); const images = new Set();
  let start = -1;
  const flush = (end) => {
    if (start === -1) return;
    if (end - start >= 6) {
      const raw = buf.subarray(start, end);
      let s;
      if (sjisDecoder) { try { s = sjisDecoder.decode(raw); } catch { s = raw.toString('latin1'); } }
      else s = raw.toString('latin1');
      const m = s.match(/(?:[A-Za-z]:)?[^\x00"<>|]*?\.(lwo|bmp|tga|png|jpg|dds)\b/gi);
      if (m) for (const ref of m) {
        if (/\.lwo$/i.test(ref)) lwo.add(ref); else images.add(ref);
      }
    }
    start = -1;
  };
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    // ASCII 인쇄가능 + cp932 리드/트레일 바이트 대역 허용
    const ok = (b >= 0x20 && b <= 0x7e) || (b >= 0x81 && b <= 0xfc);
    if (ok) { if (start === -1) start = i; }
    else flush(i);
  }
  flush(buf.length);
  return { lwo: [...lwo].sort(), images: [...images].sort() };
}

// 노드명 규약 분류 (docs 규약: ENGINE/GUN/BEAM/LASER/MISSILE/RAILGUN/FF|FR|FL|RR|RL_NN=하드포인트,
// '<obj>:LayerN'=메시, star_NN_분광형/bh_NN/ns_NN=갤럭시 천체)
function classifyNode(name) {
  if (name === null) return 'unreadable';
  if (/^(ENGINE|GUN|BEAM|LASER|MISSILE|RAILGUN)_?\d+/i.test(name)) return 'hardpoint_weapon_or_engine';
  if (/^(FF|FR|FL|RR|RL)_?\d+/i.test(name)) return 'hardpoint_position';
  if (/^star_\d+/i.test(name)) return 'galaxy_star';
  if (/^bh_\d+/i.test(name)) return 'galaxy_blackhole';
  if (/^ns_\d+/i.test(name)) return 'galaxy_neutron_star';
  if (/:Layer\d+/i.test(name)) return 'mesh_layer';
  return 'other';
}

const files = listModelFiles(ROOT);
const records = []; const failures = [];
for (const path of files) {
  const rel = relative(ROOT, path).split('\\').join('/');
  try {
    const buf = readFileSync(path);
    if (buf.length < HEADER_PAIR_COUNT * 8) throw new Error(`파일이 헤더보다 작음 (${buf.length}B)`);
    const header = parseHeader(buf);
    const nodeCount = header[0].count; // pair0 count = 씬그래프 노드 수 (샘플 검증 근거)
    const dir = findNodeDirStart(buf, nodeCount);
    let nodes = []; let nodeDirInfo = null; let warn = null;
    if (dir) {
      nodes = parseNodes(buf, dir.start, nodeCount);
      nodeDirInfo = { start: dir.start, method: dir.method };
      const bad = nodes.filter((n) => n.name === null).length;
      if (bad > 0) warn = `노드 ${bad}/${nodes.length}개 이름 판독 실패`;
    } else {
      warn = '노드 디렉토리 시작 오프셋 미발견 — 노드 목록 생략';
    }
    const refs = extractSourceRefs(buf);
    const nodeSummary = {};
    for (const n of nodes) {
      const c = classifyNode(n.name);
      nodeSummary[c] = (nodeSummary[c] ?? 0) + 1;
    }
    records.push({
      path: rel,
      format_variant: rel.toLowerCase().endsWith('.mds') ? 'mds_high_detail' : 'mdx_standard',
      size: buf.length,
      sha1: createHash('sha1').update(buf).digest('hex'),
      category: rel.includes('/') ? rel.slice(0, rel.indexOf('/')) : '(root)',
      header_pairs: header.map((p) => ({ slot: p.slot, count: p.count, unknown_stale_ptr: p.stale_ptr })),
      node_count: nodeCount,
      node_directory: nodeDirInfo,
      node_class_summary: nodeSummary,
      nodes: nodes.map((n) => ({ index: n.index, name: n.name, class: classifyNode(n.name) })),
      source_lwo_refs: refs.lwo,
      texture_refs: refs.images,
      warning: warn,
    });
  } catch (err) {
    failures.push({ path: rel, error: String(err.message ?? err) });
  }
}

const out = {
  id: 'logh7-models',
  generatedAt: new Date().toISOString(),
  sourceRoot: ROOT,
  format: 'LOGH7 자체 포맷: 직렬화된 C++ 씬그래프 메모리 이미지 (LightWave .lwo 익스포트 산물, 리틀엔디안). 헤더=(stale ptr,count)x10, 노드 디렉토리 stride 0xE8. 좌표 하드코딩 없음(logh7-mdx-no-hardcoded-coords).',
  counts: {
    total_files: files.length,
    parsed: records.length,
    failed: failures.length,
    mdx: records.filter((r) => r.format_variant === 'mdx_standard').length,
    mds: records.filter((r) => r.format_variant === 'mds_high_detail').length,
    total_nodes: records.reduce((a, r) => a + r.nodes.length, 0),
    unique_lwo_sources: new Set(records.flatMap((r) => r.source_lwo_refs)).size,
    unique_texture_refs: new Set(records.flatMap((r) => r.texture_refs)).size,
  },
  failures,
  files: records,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`, 'utf8');
console.log(JSON.stringify({ out: OUT, ...out.counts }, null, 2));
