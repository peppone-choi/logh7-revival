// stat-tables.json 검증 스크립트 (일회용)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const install = 'E:/logh7-revival/artifacts/logh7-install';
// mojibake 디렉토리명 해석: tcf.hed가 실제로 존재하는 게임루트를 탐색
let gameRoot = null;
for (const d1 of fs.readdirSync(install)) {
  const p1 = path.join(install, d1);
  if (!fs.statSync(p1).isDirectory()) continue;
  if (fs.existsSync(path.join(p1, 'data/image/face/tcf.hed'))) { gameRoot = p1; break; }
  for (const d2 of fs.readdirSync(p1)) {
    const p2 = path.join(p1, d2);
    if (fs.statSync(p2).isDirectory() && fs.existsSync(path.join(p2, 'data/image/face/tcf.hed'))) { gameRoot = p2; break; }
  }
  if (gameRoot) break;
}
if (!gameRoot) { console.log(JSON.stringify({fatal:'gameRoot not found'})); process.exit(1); }

const cat = JSON.parse(fs.readFileSync('E:/logh7-revival/server/content/generated/stat-tables.json','utf8'));
const sha1 = b => crypto.createHash('sha1').update(b).digest('hex');
const issues = [];
const results = {};

// entries 카운트: tables 항목 수
results.entries = cat.tables.length;

// --- 1) tcf.hed ---
const hedCat = cat.tables.find(t => t.file === 'data/image/face/tcf.hed');
const hedBuf = fs.readFileSync(path.join(gameRoot, 'data/image/face/tcf.hed'));
const hedSlots = hedBuf.length / 8;
let used = 0; const slots = [];
for (let i = 0; i < hedSlots; i++) {
  const off = hedBuf.readUInt32LE(i*8), sz = hedBuf.readUInt32LE(i*8+4);
  slots.push([off, sz]);
  if (sz > 0) used++;
}
results.hed = {
  sizeBytes: hedBuf.length, sizeMatch: hedBuf.length === hedCat.sizeBytes,
  sha1Match: sha1(hedBuf) === hedCat.sha1,
  slotCount: hedSlots, slotMatch: hedSlots === hedCat.slotCount,
  used, usedMatch: used === hedCat.usedSlotCount,
  sampleSlot1: slots[1], // 카탈로그 sampleSlots[0]: index1 offset50 size6162
};
if (!results.hed.sizeMatch) issues.push('tcf.hed size mismatch');
if (!results.hed.sha1Match) issues.push('tcf.hed sha1 mismatch');
if (!results.hed.slotMatch) issues.push(`tcf.hed slotCount actual=${hedSlots} cat=${hedCat.slotCount}`);
if (!results.hed.usedMatch) issues.push(`tcf.hed usedSlots actual=${used} cat=${hedCat.usedSlotCount}`);
if (slots[1][0] !== 50 || slots[1][1] !== 6162) issues.push(`tcf.hed slot1 actual=${slots[1]} cat=[50,6162]`);

// --- 2) gem.tcf 워크 디코드 ---
const gemCat = cat.tables.find(t => t.file === 'data/image/face/gem.tcf');
const gemBuf = fs.readFileSync(path.join(gameRoot, 'data/image/face/gem.tcf'));
let pos = 50, count = 0, dims = {}, ok = true, firstHdr = null;
while (pos + 18 <= gemBuf.length) {
  const w = gemBuf.readUInt16LE(pos+12), h = gemBuf.readUInt16LE(pos+14), bpp = gemBuf.readUInt16LE(pos+16);
  if (bpp !== 8 || w === 0 || w > 512 || h === 0 || h > 512) { ok = false; break; }
  if (!firstHdr) firstHdr = {w,h,bpp};
  dims[`${w}x${h}`] = (dims[`${w}x${h}`]||0)+1;
  count++;
  pos += 18 + 1024 + w*h;
}
results.gem = {
  sizeBytes: gemBuf.length, sizeMatch: gemBuf.length === gemCat.sizeBytes,
  sha1Match: sha1(gemBuf) === gemCat.sha1,
  walkClean: ok, imageCount: count, countMatch: count === gemCat.imageCount,
  trailing: gemBuf.length - pos, firstHdr, dims,
};
if (!results.gem.sha1Match) issues.push('gem.tcf sha1 mismatch');
if (!results.gem.countMatch) issues.push(`gem.tcf imageCount actual=${count} cat=${gemCat.imageCount}`);
if (results.gem.trailing !== 0) issues.push(`gem.tcf trailing=${results.gem.trailing}`);
const dimStr = JSON.stringify(dims), catDimStr = JSON.stringify(gemCat.dimensionHistogram);
if (dimStr !== catDimStr) issues.push(`gem.tcf dims actual=${dimStr} cat=${catDimStr}`);

// hed 사용슬롯 669 vs 7개 tcf 이미지 총합 교차검증
const tcfTotal = cat.tables.filter(t=>t.format==='tcf-portrait-archive').reduce((a,t)=>a+t.imageCount,0);
results.tcfTotal = tcfTotal;
if (tcfTotal !== used) issues.push(`tcf total ${tcfTotal} != hed used ${used}`);

// --- 3) _catalog.vix TLV 파싱 ---
const vixCat = cat.tables.find(t => t.file === 'data/image/icon_kj/_catalog.vix');
const vixBuf = fs.readFileSync(path.join(gameRoot, 'data/image/icon_kj/_catalog.vix'));
let vp = 0, entries = [], cur = null, jpegs = 0, resync = 0;
while (vp + 6 <= vixBuf.length) {
  const tag = vixBuf.readUInt16LE(vp), len = vixBuf.readUInt32LE(vp+2);
  if (len > vixBuf.length - vp - 6 || tag > 0x100) { vp++; resync++; continue; }
  const payload = vixBuf.subarray(vp+6, vp+6+len);
  if (tag === 3) { cur = { name: payload.toString('latin1').replace(/\0+$/,'') }; entries.push(cur); }
  else if (cur && tag === 9 && len >= 12) { cur.width = payload.readUInt32LE(0); cur.height = payload.readUInt32LE(4); cur.bpp = payload.readUInt32LE(8); }
  else if (cur && tag === 0x0b && len >= 7) { cur.mtime = `${payload.readUInt16LE(0)}-${String(payload[2]).padStart(2,'0')}-${String(payload[3]).padStart(2,'0')}`; }
  else if (cur && tag === 0x0c && len >= 4) { cur.fileSize = payload.readUInt32LE(0); }
  else if (cur && tag === 0x0d) { cur.thumbJpegBytes = len; if (payload[0]===0xff && payload[1]===0xd8) jpegs++; }
  vp += 6 + len;
}
const first = entries[0] || {};
results.vix = {
  sizeBytes: vixBuf.length, sizeMatch: vixBuf.length === vixCat.sizeBytes,
  sha1Match: sha1(vixBuf) === vixCat.sha1,
  entryCount: entries.length, countMatch: entries.length === vixCat.entryCount,
  validJpegs: jpegs, first,
};
if (!results.vix.sha1Match) issues.push('_catalog.vix sha1 mismatch');
if (!results.vix.countMatch) issues.push(`vix entries actual=${entries.length} cat=${vixCat.entryCount}`);
const cs = vixCat.sampleEntries[0];
if (first.name !== cs.name || first.width !== cs.width || first.height !== cs.height || first.bpp !== cs.bpp || first.fileSize !== cs.fileSize || first.thumbJpegBytes !== cs.thumbJpegBytes)
  issues.push(`vix first entry mismatch actual=${JSON.stringify(first)} cat=${JSON.stringify(cs)}`);

// vix가 가리키는 실제 tga 파일 교차검증 (com_saishou.tga fileSize=956)
const tgaPath = path.join(gameRoot, 'data/image/icon_kj/com_saishou.tga');
if (fs.existsSync(tgaPath)) {
  const st = fs.statSync(tgaPath);
  results.tgaCross = { exists: true, size: st.size, sizeMatch: st.size === cs.fileSize };
  if (st.size !== cs.fileSize) issues.push(`com_saishou.tga on-disk size=${st.size} vix says ${cs.fileSize}`);
} else {
  results.tgaCross = { exists: false };
}

// allNames 대비 실제 디렉토리 tga 존재율
const iconDir = path.join(gameRoot, 'data/image/icon_kj');
const onDisk = new Set(fs.readdirSync(iconDir).map(s=>s.toLowerCase()));
const missing = vixCat.allNames.filter(n => !onDisk.has(n.toLowerCase()));
results.vixNamesMissingOnDisk = missing.length;

console.log(JSON.stringify({ gameRoot, results, issues }, null, 1));
