// LOGH VII data/ 전체 자산 인덱스 생성기
// 사용법: node build-assets-index.mjs <게임트리 루트> <출력 JSON 경로>
// - 이미지(bmp/tga/png/jpg): 헤더 파싱으로 해상도 기록 (파싱 실패 시 null)
// - 모델(mdx/mds): 선두 16바이트 hex 기록 (포맷 해독은 범위 밖)
// - 카테고리: data/image/<dir> 은 디렉토리명, data/model/** 은 model, data/sound/** 은 sound
import { readdirSync, statSync, openSync, readSync, closeSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2];
const outPath = process.argv[3];
if (!root || !outPath) { console.error('사용법: node build-assets-index.mjs <root> <out.json>'); process.exit(1); }
const dataDir = join(root, 'data');

// 파일 선두 바이트 읽기
function head(path, n) {
  const fd = openSync(path, 'r');
  const buf = Buffer.alloc(n);
  const got = readSync(fd, buf, 0, n, 0);
  closeSync(fd);
  return buf.subarray(0, got);
}

// BMP: 오프셋 18/22 에 width/height (int32 LE)
function dimBmp(p) {
  const b = head(p, 26);
  if (b.length < 26 || b[0] !== 0x42 || b[1] !== 0x4d) return null;
  return { w: b.readInt32LE(18), h: Math.abs(b.readInt32LE(22)) };
}
// TGA: 오프셋 12/14 에 width/height (uint16 LE)
function dimTga(p) {
  const b = head(p, 18);
  if (b.length < 18) return null;
  return { w: b.readUInt16LE(12), h: b.readUInt16LE(14) };
}
// PNG: IHDR 오프셋 16/20 (uint32 BE)
function dimPng(p) {
  const b = head(p, 24);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}
// JPG: SOF0~SOF15 마커 스캔
function dimJpg(p) {
  const b = head(p, 65536);
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd9)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

// data/ 하위 상대경로에서 카테고리 결정
function categoryOf(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts[0] === 'image') return parts.length > 1 && parts[1].includes('.') ? 'image' : (parts[1] || 'image');
  if (parts[0] === 'model') return 'model';
  if (parts[0] === 'sound') return 'sound';
  return parts[0];
}

const entries = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { walk(p); continue; }
    const rel = relative(dataDir, p).replace(/\\/g, '/');
    const ext = extname(name).toLowerCase().slice(1);
    const e = { path: 'data/' + rel, category: categoryOf(rel), ext, size: st.size };
    try {
      if (ext === 'bmp') e.dim = dimBmp(p);
      else if (ext === 'tga') e.dim = dimTga(p);
      else if (ext === 'png') e.dim = dimPng(p);
      else if (ext === 'jpg' || ext === 'jpeg') e.dim = dimJpg(p);
      else if (ext === 'mdx' || ext === 'mds') e.header16 = head(p, 16).toString('hex');
    } catch { e.dim = null; }
    entries.push(e);
  }
}
walk(dataDir);

// 집계
const byCat = {}, byExt = {};
for (const e of entries) {
  byCat[e.category] = (byCat[e.category] || 0) + 1;
  byExt[e.ext] = (byExt[e.ext] || 0) + 1;
}

const out = {
  provenance: {
    source: 'artifacts/logh7-install/<게임설치트리>/data (원본 CD Logh7.bin 설치본)',
    generator: 'tools/extract/build-assets-index.mjs',
    generatedAt: new Date().toISOString(),
    note: '이미지 해상도는 bmp/tga/png/jpg 헤더 직접 파싱; mdx/mds는 선두 16바이트 hex만 기록(포맷 미해독)',
  },
  totals: { files: entries.length, byCategory: byCat, byExt },
  entries,
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log('files:', entries.length);
console.log('byExt:', JSON.stringify(byExt));
console.log('byCategory:', JSON.stringify(byCat));
