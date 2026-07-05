#!/usr/bin/env node
// logh7_stat_tables_catalog.mjs — data/ 트리의 msgdat 외 바이너리 테이블 전수 카탈로그
// 출력: server/content/generated/stat-tables.json
// 포맷 지식 출처: git 5bd249c server/src/server/logh7-tcf-portrait-catalog.mjs (TCF 18B 헤더+1024B BGRA 팔레트+8bpp)
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const GAME_ROOT = 'E:/logh7-revival/artifacts/logh7-install/____________s___/____';
const OUT_DIR = 'E:/logh7-revival/server/content/generated';
const OUT = join(OUT_DIR, 'stat-tables.json');

const sha1 = (b) => createHash('sha1').update(b).digest('hex');
const rel = (p) => p; // provenance는 게임루트 상대경로 문자열로 직접 기입

// ---------- tcf.hed: 8바이트 슬롯(offset u32LE, size u32LE) ----------
function parseTcfHed(path) {
  const b = readFileSync(join(GAME_ROOT, path));
  const slots = [];
  for (let i = 0; i + 8 <= b.length; i += 8) {
    slots.push({ index: i / 8, offset: b.readUInt32LE(i), size: b.readUInt32LE(i + 4) });
  }
  const used = slots.filter((s) => s.size > 0);
  const sizeHist = {};
  for (const s of used) sizeHist[s.size] = (sizeHist[s.size] || 0) + 1;
  return {
    file: rel(path), format: 'tcf-hed-slot-table',
    provenance: { source: path, layout: '8바이트 슬롯 배열: offset u32LE @+0, size u32LE @+4', knowledgeFrom: 'git 5bd249c logh7-tcf-portrait-catalog.mjs' },
    sizeBytes: b.length, sha1: sha1(b),
    slotCount: slots.length, usedSlotCount: used.length,
    sizeHistogram: sizeHist,
    sampleSlots: used.slice(0, 5),
  };
}

// ---------- .tcf: 이미지 순차 워크 (18B 헤더: w u16@12, h u16@14, bpp u16@16; 1024B 팔레트; w*h 인덱스) ----------
function parseTcfArchive(path) {
  const b = readFileSync(join(GAME_ROOT, path));
  const images = [];
  let off = 0;
  // 파일 선두에 아카이브 헤더가 있을 수 있어 첫 유효 이미지 지점을 탐색(최대 256B)
  const validAt = (o) => {
    if (o + 18 > b.length) return false;
    const w = b.readUInt16LE(o + 12), h = b.readUInt16LE(o + 14), bpp = b.readUInt16LE(o + 16);
    return bpp === 8 && w > 0 && w <= 512 && h > 0 && h <= 512 && o + 18 + 1024 + w * h <= b.length;
  };
  let start = -1;
  for (let o = 0; o < Math.min(256, b.length); o++) if (validAt(o)) { start = o; break; }
  if (start < 0) return { file: rel(path), format: 'unknown', sizeBytes: b.length, sha1: sha1(b), notes: 'TCF 이미지 헤더 미검출', headHex: b.subarray(0, 32).toString('hex') };
  off = start;
  const dims = {};
  while (validAt(off)) {
    const w = b.readUInt16LE(off + 12), h = b.readUInt16LE(off + 14);
    images.push({ offset: off, width: w, height: h });
    dims[`${w}x${h}`] = (dims[`${w}x${h}`] || 0) + 1;
    off += 18 + 1024 + w * h;
  }
  return {
    file: rel(path), format: 'tcf-portrait-archive',
    provenance: { source: path, layout: '이미지 연접: 18B 헤더(w u16@+12, h u16@+14, bpp u16@+16, bpp=8) + 1024B BGRA 팔레트 + bottom-up 8bit 인덱스', knowledgeFrom: 'git 5bd249c logh7-tcf-portrait-catalog.mjs' },
    sizeBytes: b.length, sha1: sha1(b),
    firstImageOffset: start, imageCount: images.length,
    dimensionHistogram: dims,
    trailingBytes: b.length - off,
    sampleImages: images.slice(0, 3),
  };
}

// ---------- _catalog.vix: TLV 레코드 (tag u16LE + len u32LE + payload) — ViX 이미지뷰어 썸네일 캐시 ----------
function parseVix(path) {
  const b = readFileSync(join(GAME_ROOT, path));
  const entries = [];
  let cur = null;
  let o = 0, resyncs = 0, jpegs = 0;
  while (o + 6 <= b.length) {
    const tag = b.readUInt16LE(o), len = b.readUInt32LE(o + 2);
    if (tag === 0 || tag > 0x40 || len > b.length - o - 6) { o += 1; resyncs += 1; continue; }
    const data = b.subarray(o + 6, o + 6 + len);
    if (tag === 3) { // 파일명 (NUL 종단)
      if (cur) entries.push(cur);
      cur = { name: data.toString('latin1').replace(/\0+$/, '') };
    } else if (cur && tag === 9 && len >= 12) { // 원본 이미지 치수 (w,h,bpp u32LE)
      cur.width = data.readUInt32LE(0); cur.height = data.readUInt32LE(4); cur.bpp = data.readUInt32LE(8);
    } else if (cur && tag === 0x0c && len === 4) { // 원본 파일 크기
      cur.fileSize = data.readUInt32LE(0);
    } else if (cur && tag === 0x0b && len === 7) { // 타임스탬프 (year u16LE, mo, day, ?, hh, mm, ss)
      cur.mtime = `${data.readUInt16LE(0)}-${String(data[2]).padStart(2, '0')}-${String(data[3]).padStart(2, '0')} ${data[4]}:${data[5]}:${data[6]}`;
    } else if (cur && tag === 0x0d) { // 내장 JPEG 썸네일
      cur.thumbJpegBytes = len; jpegs += 1;
    }
    o += 6 + len;
  }
  if (cur) entries.push(cur);
  return {
    file: rel(path), format: 'vix-thumbnail-cache',
    provenance: { source: path, layout: 'TLV: tag u16LE + len u32LE + payload. tag3=파일명, tag9=치수(w,h,bpp u32LE), tag0x0b=수정시각(7B), tag0x0c=파일크기, tag0x0d=JPEG 썸네일', judgment: 'ViX(일본산 이미지 뷰어) 썸네일 캐시 — 개발 잔재물, 게임 스탯 테이블 아님' },
    sizeBytes: b.length, sha1: sha1(b),
    entryCount: entries.length, jpegThumbCount: jpegs, resyncBytes: resyncs,
    sampleEntries: entries.slice(0, 5),
    allNames: entries.map((e) => e.name),
  };
}

// ---------- 기타: thumbs.db / .mds ----------
function stubFile(path, format, notes, headBytes = 32) {
  const b = readFileSync(join(GAME_ROOT, path));
  return { file: rel(path), format, sizeBytes: b.length, sha1: sha1(b), notes, headHex: b.subarray(0, headBytes).toString('hex') };
}

function listMds() {
  const out = [];
  for (const grp of ['fp', 'ge']) {
    const dir = join(GAME_ROOT, 'data/model/ship', grp);
    for (const f of readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.mds')).sort()) {
      const p = `data/model/ship/${grp}/${f}`;
      const b = readFileSync(join(GAME_ROOT, p));
      // 헤더: (포인터,카운트) u32 페어 11개(포인터는 직렬화된 인메모리 주소, base≈0x018700a0) 후 0x58에 "XX###:Layer1" 이름
      const name = b.subarray(0x58, 0x78).toString('latin1').replace(/\0+$/, '');
      out.push({ file: p, format: 'mds-ship-model', sizeBytes: b.length, sha1: sha1(b), layerName: name });
    }
  }
  return out;
}

const catalog = {
  id: 'logh7-stat-tables-catalog',
  generatedAt: new Date().toISOString(),
  gameRoot: 'artifacts/logh7-install/____________s___/____',
  scopeNote: 'data/ 트리에서 msgdat/*.dat 제외 전 바이너리 테이블. bmp/tga/jpg/png/wav/ogg/mdx는 자산으로 별도 트랙.',
  tables: [
    parseTcfHed('data/image/face/tcf.hed'),
    ...['gaf.tcf', 'gam.tcf', 'gef.tcf', 'gem.tcf', 'o.tcf', 'oam.tcf', 'oem.tcf'].map((n) => parseTcfArchive(`data/image/face/${n}`)),
    parseVix('data/image/icon_kj/_catalog.vix'),
    stubFile('data/image/lens/thumbs.db', 'ole-compound-thumbnail-cache', 'Windows 탐색기 Thumbs.db(매직 d0cf11e0) — 개발 잔재물, 게임 데이터 아님'),
    { group: 'data/model/ship/**/*.mds', format: 'mds-ship-model', notes: '직렬화된 인메모리 구조(포인터/카운트 u32 페어 11개, 포인터 base≈0x018700a0) + 0x58에 "EM###/FM###:Layer1" 레이어명. 지오메트리 상세는 unknown — 스탯 테이블 아님(메시).', files: listMds() },
  ],
  excludedInventory: {
    msgdat: '25개 .dat (constmsg/messages_*/g7sw) — msgdat 트랙에서 별도 처리',
    assetCounts: { bmp: 993, tga: 661, mdx: 406, jpg: 45, png: 16, wav: 13, mds: 12, ogg: 7, tcf: 7 },
  },
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
const total = catalog.tables.length;
console.log(`wrote ${OUT}: ${total} table entries`);
for (const t of catalog.tables) console.log('-', t.file || t.group, '=>', t.format, t.imageCount !== undefined ? `images=${t.imageCount}` : t.entryCount !== undefined ? `entries=${t.entryCount}` : t.usedSlotCount !== undefined ? `slots=${t.usedSlotCount}/${t.slotCount}` : t.files ? `files=${t.files.length}` : '');
