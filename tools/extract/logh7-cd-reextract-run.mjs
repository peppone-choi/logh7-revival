#!/usr/bin/env node
// LOGH VII CD 전수 재추출 드라이버 — Logh7.bin에서 직접(기존 iso 변환본 불신) 파일시스템을 복원한다.
//
// 산출물:
//   artifacts/logh7-cd/iso-root-v2/                      — 전 파일 재추출
//   server/content/generated/logh7-cd-extract-catalog.json — 정본 카탈로그(파일별 sha256/크기/extent + 커버리지)
//
// 커버리지: 전 볼륨 섹터를 [시스템영역/볼륨기술자/경로테이블/디렉터리/파일/미할당]으로 분류.
// 미할당(gap) 구간 = 파일시스템이 참조하지 않는 섹터 = 숨은 데이터 후보.

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  buildCoverageLedger,
  convertMode2BinToIso,
  parseCue,
  walkIso9660,
  constants,
} from './logh7-cd-extract.mjs';

const { SECTOR_BYTES, USER_BYTES, SYSTEM_AREA_SECTORS } = constants;

const PROJECT_ROOT = process.env.LOGH7_ROOT ?? 'E:/logh7-revival';
const CD_DIR = join(PROJECT_ROOT, 'artifacts', 'logh7-cd');
const OUT_ROOT = join(CD_DIR, 'iso-root-v2');
const CATALOG = join(PROJECT_ROOT, 'server', 'content', 'generated', 'logh7-cd-extract-catalog.json');

const digest = (algo, buffer) => createHash(algo).update(buffer).digest('hex');

function readBothEndian32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

// 볼륨 기술자 목록 (시스템 영역 직후부터 종결자까지)
function listVolumeDescriptors(iso) {
  const descriptors = [];
  const totalSectors = Math.floor(iso.length / USER_BYTES);
  for (let lba = SYSTEM_AREA_SECTORS; lba < totalSectors; lba += 1) {
    const base = lba * USER_BYTES;
    if (iso.subarray(base + 1, base + 6).toString('ascii') !== 'CD001') break;
    const type = iso[base];
    descriptors.push({ lba, type });
    if (type === 255) break;
  }
  return descriptors;
}

// PVD/SVD의 경로 테이블 extent (L/M 양쪽)
function pathTableRanges(iso, descriptorLba) {
  const base = descriptorLba * USER_BYTES;
  const size = readBothEndian32(iso, base + 132);
  if (size === 0) return [];
  const ranges = [];
  for (const [offset, label] of [[140, 'L'], [148, 'M']]) {
    const lba = label === 'L' ? iso.readUInt32LE(base + offset) : iso.readUInt32BE(base + offset);
    if (lba === 0) continue;
    const occupied = Math.ceil(size / USER_BYTES) * USER_BYTES;
    ranges.push({ path: `[PATH_TABLE:${label}@vd${descriptorLba}]`, start: lba * USER_BYTES, end: lba * USER_BYTES + occupied });
  }
  return ranges;
}

function extentRange(path, extentLba, size) {
  const occupied = size === 0 ? 0 : Math.ceil(size / USER_BYTES) * USER_BYTES;
  return { path, start: extentLba * USER_BYTES, end: extentLba * USER_BYTES + occupied };
}

async function main() {
  const cueText = await readFile(join(CD_DIR, 'Logh7.cue'), 'utf8');
  const cue = parseCue(cueText);
  console.log(`[cue] ${cue.binFile} track=${cue.trackNumber} mode=${cue.mode} indexLba=${cue.indexLba}`);

  const bin = await readFile(join(CD_DIR, cue.binFile));
  const binMd5 = digest('md5', bin);
  const binSha256 = digest('sha256', bin);
  console.log(`[bin] bytes=${bin.length} sectors=${bin.length / SECTOR_BYTES} md5=${binMd5}`);
  if (binMd5 !== 'bf87c6a8cb068f05625737377a07b09d') {
    throw new Error(`Logh7.bin md5 mismatch: ${binMd5}`);
  }

  const iso = convertMode2BinToIso(bin);
  const isoSha256 = digest('sha256', iso);
  const totalSectors = iso.length / USER_BYTES;
  console.log(`[iso] logicalBytes=${iso.length} sectors=${totalSectors} sha256=${isoSha256}`);

  // 과거 변환본(Logh7.iso)과 바이트 동일성 대조 — bin→iso 변환 오류 여부 판정
  let legacyIso = null;
  try {
    const legacy = await readFile(join(CD_DIR, 'Logh7.iso'));
    legacyIso = {
      bytes: legacy.length,
      sha256: digest('sha256', legacy),
      identicalToFreshConversion: legacy.length === iso.length && legacy.equals(iso),
    };
    console.log(`[legacy iso] bytes=${legacy.length} identical=${legacyIso.identicalToFreshConversion}`);
  } catch {
    console.log('[legacy iso] absent');
  }

  const primary = walkIso9660(iso, { tree: 'primary' });
  let joliet = null;
  try {
    joliet = walkIso9660(iso, { tree: 'joliet' });
  } catch (error) {
    console.log(`[joliet] absent: ${error.message}`);
  }
  console.log(`[primary] files=${primary.files.length} dirs=${primary.dirExtents.length}`);
  if (joliet) console.log(`[joliet] files=${joliet.files.length} dirs=${joliet.dirExtents.length} escape=${joliet.descriptor.escapeSequences}`);

  // 정본 트리: Joliet(원 유니코드 이름) 우선, 없으면 PVD
  const canonical = joliet ?? primary;
  const canonicalTree = joliet ? 'joliet' : 'primary';

  // 전 파일 재추출
  await rm(OUT_ROOT, { recursive: true, force: true });
  await mkdir(OUT_ROOT, { recursive: true });
  const files = [];
  for (const file of canonical.files) {
    const target = join(OUT_ROOT, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.data);
    files.push({
      path: file.path,
      size: file.size,
      extentLba: file.extentLba,
      extentByteStart: file.extentLba * USER_BYTES,
      occupiedSectors: file.size === 0 ? 0 : Math.ceil(file.size / USER_BYTES),
      sha256: digest('sha256', file.data),
      md5: digest('md5', file.data),
    });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  console.log(`[extract] wrote ${files.length} files to ${OUT_ROOT}`);

  // ── 커버리지: 전 볼륨 섹터 분류 ────────────────────────────────────────────
  const ranges = [];
  ranges.push({ path: '[SYSTEM_AREA]', start: 0, end: SYSTEM_AREA_SECTORS * USER_BYTES });
  const descriptors = listVolumeDescriptors(iso);
  for (const descriptor of descriptors) {
    ranges.push({
      path: `[VOLUME_DESCRIPTOR:${descriptor.type}@${descriptor.lba}]`,
      start: descriptor.lba * USER_BYTES,
      end: (descriptor.lba + 1) * USER_BYTES,
    });
    if (descriptor.type === 1 || descriptor.type === 2) {
      ranges.push(...pathTableRanges(iso, descriptor.lba));
    }
  }

  // 두 트리의 디렉터리/파일 extent를 모두 참조로 인정 (Joliet은 동일 데이터 extent를 별칭한다)
  const seenExtent = new Set();
  const addExtent = (label, lba, size) => {
    const key = `${lba}:${size}`;
    if (seenExtent.has(key)) return; // 트리 간 동일 extent 별칭은 한 번만 계상
    seenExtent.add(key);
    const range = extentRange(label, lba, size);
    if (range.end > range.start) ranges.push(range);
  };
  for (const tree of [primary, joliet].filter(Boolean)) {
    for (const dir of tree.dirExtents) addExtent(`[DIR]${dir.path}`, dir.lba, Math.max(dir.size, USER_BYTES));
    for (const file of tree.files) addExtent(file.path, file.extentLba, file.size);
  }

  const totalBytes = totalSectors * USER_BYTES;
  const structural = buildCoverageLedger({ totalBytes, ranges });

  // 미할당(gap) = 파일시스템 미참조 섹터 = 숨은 데이터 후보
  const gapSectors = structural.gaps.map((gap) => ({
    startLba: gap.start / USER_BYTES,
    endLba: gap.end / USER_BYTES,
    sectors: gap.bytes / USER_BYTES,
    bytes: gap.bytes,
    nonZero: !isZeroRegion(iso, gap.start, gap.end),
  }));

  console.log(`[coverage] total=${totalBytes}B/${totalSectors}sec covered=${structural.uniqueCoveredBytes}B gap=${structural.gapBytes}B (${structural.gapBytes / USER_BYTES} sec) overlap=${structural.overlapBytes}B`);
  const nonZeroGaps = gapSectors.filter((gap) => gap.nonZero);
  console.log(`[coverage] gap regions=${gapSectors.length}, non-zero(=hidden data candidates)=${nonZeroGaps.length}`);
  for (const gap of nonZeroGaps.slice(0, 20)) {
    console.log(`  HIDDEN? lba ${gap.startLba}..${gap.endLba} (${gap.sectors} sectors, ${gap.bytes}B)`);
  }
  if (structural.overlaps.length) {
    console.log(`[coverage] overlaps=${structural.overlaps.length} (first 10)`);
    for (const overlap of structural.overlaps.slice(0, 10)) {
      console.log(`  OVERLAP lba ${overlap.start / USER_BYTES}..${overlap.end / USER_BYTES} paths=${overlap.paths.join(', ')}`);
    }
  }

  const catalog = {
    schemaVersion: 1,
    provenance: {
      extractor: 'tools/extract/logh7-cd-extract.mjs',
      driver: 'tools/extract/logh7-cd-reextract-run.mjs',
      source: {
        bin: { file: 'artifacts/logh7-cd/Logh7.bin', bytes: bin.length, md5: binMd5, sha256: binSha256 },
        cue: { file: 'artifacts/logh7-cd/Logh7.cue', sha256: digest('sha256', Buffer.from(cueText, 'ascii')), track: cue },
      },
      derivedIso: { logicalBytes: iso.length, sectors: totalSectors, sha256: isoSha256 },
      legacyIso,
      extractedAt: new Date().toISOString(),
      outputDir: 'artifacts/logh7-cd/iso-root-v2',
      canonicalTree,
    },
    volume: {
      descriptors: descriptors.map((descriptor) => ({ lba: descriptor.lba, type: descriptor.type })),
      primaryFileCount: primary.files.length,
      jolietFileCount: joliet ? joliet.files.length : 0,
    },
    files,
    primaryTreeFiles: primary.files.map((file) => ({ path: file.path, size: file.size, extentLba: file.extentLba })),
    coverage: {
      totalBytes: structural.totalBytes,
      totalSectors,
      classifiedBytes: structural.classifiedBytes,
      uniqueCoveredBytes: structural.uniqueCoveredBytes,
      coveredSectors: structural.uniqueCoveredBytes / USER_BYTES,
      gapBytes: structural.gapBytes,
      gapSectors: structural.gapBytes / USER_BYTES,
      overlapBytes: structural.overlapBytes,
      complete: structural.complete,
      gaps: gapSectors,
      overlaps: structural.overlaps,
    },
  };

  await mkdir(dirname(CATALOG), { recursive: true });
  await writeFile(CATALOG, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`[catalog] ${CATALOG}`);
}

function isZeroRegion(buffer, start, end) {
  for (let index = start; index < end; index += 1) {
    if (buffer[index] !== 0) return false;
  }
  return true;
}

await main();
