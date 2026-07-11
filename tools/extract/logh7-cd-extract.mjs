// LOGH VII CD 정본 추출기 (ISO9660/Joliet + MODE2/2352 디코드 + 커버리지 원장)
//
// 소스: artifacts/logh7-cd/Logh7.bin (MODE2/2352 원 섹터) + Logh7.cue.
// 원칙: 범위 밖 extent·디렉터리 순환·경로 탈출은 fail-closed. 파생물은 provenance 라벨링.
// 섹터 사용자 데이터는 정확히 +24..+2072 (Form1) 이며 sync/mode/form/subheader를 검증한다.

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { validatePinnedTool, runPinnedTool } from './logh7-cd-toolchain.mjs';

const SECTOR_BYTES = 2352;
const USER_BYTES = 2048;
const SYSTEM_AREA_SECTORS = 16;

// ── CUE ─────────────────────────────────────────────────────────────────────

// 단일 TRACK 01 MODE2/2352 CUE만 허용한다. 그 외(다중 트랙·다른 모드·경로 탈출)는 거부.
export function parseCue(text) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const fileLine = lines.find((line) => line.startsWith('FILE '));
  if (!fileLine) throw new Error('CUE missing FILE directive');
  const fileMatch = fileLine.match(/^FILE\s+"([^"]+)"\s+(\w+)/i);
  if (!fileMatch) throw new Error('CUE FILE directive malformed');
  const binFile = fileMatch[1];
  if (binFile.includes('..') || binFile.includes('/') || binFile.includes('\\') || isAbsolute(binFile)) {
    throw new Error(`CUE FILE path escape/relative rejected: ${binFile}`);
  }

  const trackLines = lines.filter((line) => /^TRACK\s+/i.test(line));
  if (trackLines.length !== 1) {
    throw new Error(`CUE must declare a single TRACK, found ${trackLines.length}`);
  }
  const trackMatch = trackLines[0].match(/^TRACK\s+(\d+)\s+(\S+)/i);
  if (!trackMatch) throw new Error('CUE TRACK directive malformed');
  const trackNumber = Number(trackMatch[1]);
  const mode = trackMatch[2].toUpperCase();
  if (mode !== 'MODE2/2352') throw new Error(`CUE track must be MODE2/2352, found ${mode}`);

  const indexLine = lines.find((line) => /^INDEX\s+01\s+/i.test(line));
  let indexLba = 0;
  if (indexLine) {
    const msf = indexLine.match(/(\d+):(\d+):(\d+)/);
    if (msf) {
      indexLba = Number(msf[1]) * 4500 + Number(msf[2]) * 75 + Number(msf[3]);
    }
  }

  return { binFile, trackNumber, mode, sectorSize: SECTOR_BYTES, indexLba };
}

// ── MODE2/2352 → 2048 사용자 데이터 ──────────────────────────────────────────

// Form1 섹터의 사용자 데이터(+24..+2072)를 반환. sync/mode/form/subheader 위반은 던진다.
export function mode2Form1UserData(sector) {
  if (sector.length !== SECTOR_BYTES) {
    throw new Error(`MODE2 sector must be 2352 bytes, got ${sector.length} (length)`);
  }
  // 12바이트 sync: 00 FF*10 00
  if (sector[0] !== 0x00 || sector[11] !== 0x00) throw new Error('MODE2 sector sync marker invalid');
  for (let index = 1; index <= 10; index += 1) {
    if (sector[index] !== 0xff) throw new Error('MODE2 sector sync marker invalid');
  }
  // 헤더 mode 바이트(+15)는 MODE2
  if (sector[15] !== 0x02) throw new Error('MODE2 sector mode byte is not 2 (mode)');
  // subheader 이중화(+16..+20 == +20..+24)
  for (let index = 0; index < 4; index += 1) {
    if (sector[16 + index] !== sector[20 + index]) throw new Error('MODE2 subheader copies mismatch (subheader)');
  }
  // submode form 비트(0x20) → Form2. Form1만 허용.
  if ((sector[18] & 0x20) !== 0) throw new Error('MODE2 sector is Form2, expected Form1');
  return Buffer.from(sector.subarray(24, 24 + USER_BYTES));
}

// MODE2/2352 BIN을 논리 ISO(2048/섹터)로 변환. 비정렬·잘림·섹터별 위반은 fail-closed.
export function convertMode2BinToIso(bin) {
  if (bin.length % SECTOR_BYTES !== 0) {
    throw new Error(`MODE2 bin length ${bin.length} not 2352-aligned (truncated/align)`);
  }
  const sectorCount = bin.length / SECTOR_BYTES;
  const iso = Buffer.alloc(sectorCount * USER_BYTES);
  for (let index = 0; index < sectorCount; index += 1) {
    const sector = bin.subarray(index * SECTOR_BYTES, (index + 1) * SECTOR_BYTES);
    let user;
    try {
      user = mode2Form1UserData(sector);
    } catch (error) {
      throw new Error(`sector ${index}: ${error.message}`);
    }
    user.copy(iso, index * USER_BYTES);
  }
  return iso;
}

// ── ISO9660 / Joliet 워크 ─────────────────────────────────────────────────────

function readBothEndian32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function decodeName(identifier, joliet) {
  if (joliet) {
    let name = '';
    for (let index = 0; index + 1 < identifier.length; index += 2) {
      name += String.fromCharCode(identifier.readUInt16BE(index));
    }
    return name;
  }
  return identifier.toString('ascii');
}

function stripVersion(name) {
  const semi = name.indexOf(';');
  return semi >= 0 ? name.slice(0, semi) : name;
}

function findVolumeDescriptor(iso, wantType) {
  const totalSectors = Math.floor(iso.length / USER_BYTES);
  for (let lba = SYSTEM_AREA_SECTORS; lba < totalSectors; lba += 1) {
    const base = lba * USER_BYTES;
    const type = iso[base];
    const magic = iso.subarray(base + 1, base + 6).toString('ascii');
    if (magic !== 'CD001') throw new Error('ISO volume descriptor CD001 magic missing');
    if (type === 255) break; // terminator
    if (type === wantType) return { lba, base };
  }
  throw new Error(`ISO volume descriptor type ${wantType} not found`);
}

// 하나의 디렉터리 extent에서 레코드들을 파싱. '.'(0x00)/'..'(0x01)은 건너뛴다.
function parseDirectoryRecords(iso, dirLba, dirSize, joliet) {
  const entries = [];
  const end = dirLba * USER_BYTES + dirSize;
  let cursor = dirLba * USER_BYTES;
  while (cursor < end) {
    const len = iso[cursor];
    if (len === 0) {
      // 섹터 경계까지 패딩 스킵
      const nextSector = Math.floor((cursor + USER_BYTES) / USER_BYTES) * USER_BYTES;
      if (nextSector <= cursor) break;
      cursor = nextSector;
      continue;
    }
    const record = iso.subarray(cursor, cursor + len);
    const extentLba = readBothEndian32LE(record, 2);
    const size = readBothEndian32LE(record, 10);
    const flags = record[25];
    const nameLen = record[32];
    const identifier = record.subarray(33, 33 + nameLen);
    cursor += len;

    if (nameLen === 1 && (identifier[0] === 0x00 || identifier[0] === 0x01)) continue; // '.' , '..'

    const rawName = stripVersion(decodeName(identifier, joliet));
    if (rawName.includes('/') || rawName.includes('\\') || rawName === '..' || rawName === '.' || rawName.includes(sep)) {
      throw new Error(`ISO record name path escape/separator rejected: ${JSON.stringify(rawName)}`);
    }
    entries.push({ name: rawName, extentLba, size, directory: (flags & 0x02) !== 0 });
  }
  return entries;
}

// PVD(primary) 또는 SVD(joliet) 트리를 재귀 워크. 범위 밖 extent·순환은 fail-closed.
export function walkIso9660(iso, { tree = 'primary' } = {}) {
  const totalSectors = Math.floor(iso.length / USER_BYTES);
  const joliet = tree === 'joliet';
  const { base } = findVolumeDescriptor(iso, joliet ? 2 : 1);

  const volumeSpaceSize = readBothEndian32LE(iso, base + 80);
  const logicalBlockSize = iso.readUInt16LE(base + 128);
  const escapeSequences = joliet ? iso.subarray(base + 88, base + 91).toString('ascii') : '';

  const rootRecord = iso.subarray(base + 156, base + 156 + iso[base + 156]);
  const rootLba = readBothEndian32LE(rootRecord, 2);
  const rootSize = readBothEndian32LE(rootRecord, 10);

  const files = [];
  const dirExtents = [];
  const visited = new Set();

  function assertExtentInRange(extentLba, size, label) {
    const endByte = extentLba * USER_BYTES + size;
    if (extentLba < 0 || endByte > totalSectors * USER_BYTES) {
      throw new Error(`ISO extent out of range (${label}): lba=${extentLba} size=${size}`);
    }
  }

  function walk(lba, size, prefix) {
    if (visited.has(lba)) throw new Error(`ISO directory cycle/recursive reference at lba=${lba}`);
    visited.add(lba);
    assertExtentInRange(lba, size, `dir ${prefix || '/'}`);
    dirExtents.push({ path: prefix ? `${prefix}/` : '/', lba, size, kind: 'dir' });
    const records = parseDirectoryRecords(iso, lba, size, joliet);
    for (const entry of records) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      assertExtentInRange(entry.extentLba, entry.size, path);
      if (entry.directory) {
        walk(entry.extentLba, entry.size, path);
      } else {
        const start = entry.extentLba * USER_BYTES;
        const data = Buffer.from(iso.subarray(start, start + entry.size));
        files.push({ path, extentLba: entry.extentLba, size: entry.size, data });
      }
    }
  }

  walk(rootLba, rootSize, '');
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  return {
    descriptor: { type: joliet ? 2 : 1, volumeSpaceSize, logicalBlockSize, escapeSequences },
    root: { lba: rootLba, size: rootSize },
    files,
    dirExtents,
  };
}

// ── 커버리지 원장 (반개구간 [start,end)) ─────────────────────────────────────

export function buildCoverageLedger({ totalBytes, ranges }) {
  if (!Number.isInteger(totalBytes) || totalBytes < 0) {
    throw new Error('coverage range: totalBytes must be a non-negative integer');
  }
  const norm = ranges.map((range) => {
    if (!Number.isInteger(range.start) || range.start < 0) {
      throw new Error(`coverage range start invalid: ${range.path}`);
    }
    if (!Number.isInteger(range.end) || range.end < range.start) {
      throw new Error(`coverage range end before start: ${range.path}`);
    }
    if (range.end > totalBytes) {
      throw new Error(`coverage range exceeds total: ${range.path}`);
    }
    return { path: range.path, start: range.start, end: range.end, bytes: range.end - range.start };
  });

  const classifiedBytes = norm.reduce((sum, range) => sum + range.bytes, 0);

  const coords = new Set([0, totalBytes]);
  for (const range of norm) {
    coords.add(range.start);
    coords.add(range.end);
  }
  const points = [...coords].filter((value) => value >= 0 && value <= totalBytes).sort((a, b) => a - b);

  let uniqueCoveredBytes = 0;
  let overlapBytes = 0;
  const gaps = [];
  const overlaps = [];

  const sameSet = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (end <= start) continue;
    const covering = norm.filter((range) => range.start <= start && range.end >= end);
    const length = end - start;
    if (covering.length === 0) {
      const last = gaps[gaps.length - 1];
      if (last && last.end === start) last.end = end;
      else gaps.push({ start, end });
    } else {
      uniqueCoveredBytes += length;
      if (covering.length >= 2) {
        overlapBytes += length;
        const paths = [...new Set(covering.map((range) => range.path))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        const last = overlaps[overlaps.length - 1];
        if (last && last.end === start && sameSet(last.paths, paths)) last.end = end;
        else overlaps.push({ start, end, paths });
      }
    }
  }

  const gapBytes = totalBytes - uniqueCoveredBytes;

  return {
    totalBytes,
    classifiedBytes,
    uniqueCoveredBytes,
    gapBytes,
    overlapBytes,
    complete: gapBytes === 0,
    ranges: norm
      .slice()
      .sort((a, b) => a.start - b.start || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    gaps: gaps.map((gap) => ({ start: gap.start, end: gap.end, bytes: gap.end - gap.start })),
    overlaps: overlaps.map((overlap) => ({
      start: overlap.start,
      end: overlap.end,
      bytes: overlap.end - overlap.start,
      paths: overlap.paths,
    })),
  };
}

// ── ISO 볼륨 섹터 분류 (커버리지 입력 구성) ──────────────────────────────────

// 전 볼륨을 [시스템영역·볼륨기술자·디렉터리 extent·파일 extent·미할당]으로 분류.
// 미할당(unallocated) 구간이 곧 "파일시스템에 안 잡히는 숨은 데이터 후보"다.
function classifyIsoSectors(iso, primary) {
  const totalSectors = Math.floor(iso.length / USER_BYTES);
  const totalBytes = totalSectors * USER_BYTES;
  const ranges = [];

  ranges.push({ path: '[SYSTEM_AREA]', start: 0, end: SYSTEM_AREA_SECTORS * USER_BYTES });

  // 볼륨 기술자 + 종결자
  for (let lba = SYSTEM_AREA_SECTORS; lba < totalSectors; lba += 1) {
    const base = lba * USER_BYTES;
    const type = iso[base];
    const magic = iso.subarray(base + 1, base + 6).toString('ascii');
    if (magic !== 'CD001') break;
    ranges.push({ path: `[VOLUME_DESCRIPTOR:${type}]`, start: base, end: base + USER_BYTES });
    if (type === 255) break;
  }

  for (const dir of primary.dirExtents) {
    ranges.push({ path: `[DIR]${dir.path}`, start: dir.lba * USER_BYTES, end: dir.lba * USER_BYTES + Math.max(dir.size, USER_BYTES) });
  }
  for (const file of primary.files) {
    // extent는 섹터 단위 점유. 파일 크기가 섹터 배수가 아니면 다음 섹터 경계까지 점유로 본다.
    const occupied = Math.ceil(file.size / USER_BYTES) * USER_BYTES || USER_BYTES;
    ranges.push({ path: file.path, start: file.extentLba * USER_BYTES, end: file.extentLba * USER_BYTES + occupied });
  }

  return { totalBytes, ranges };
}

// 겹침 없이 정렬된 커버 구간에서 미할당(gap) 구간 목록을 계산 (숨은 데이터 후보).
function computeUnallocated(totalBytes, ranges) {
  const sorted = ranges
    .map((range) => ({ start: range.start, end: range.end }))
    .sort((a, b) => a.start - b.start);
  const gaps = [];
  let cursor = 0;
  for (const range of sorted) {
    if (range.start > cursor) gaps.push({ start: cursor, end: range.start, bytes: range.start - cursor });
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < totalBytes) gaps.push({ start: cursor, end: totalBytes, bytes: totalBytes - cursor });
  return gaps;
}

// ── 정본 추출 파이프라인 ──────────────────────────────────────────────────────

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// CD 전수 추출 오케스트레이션. 실패 시 최종 evidence(manifest/coverage/extraction)를 하나도 남기지 않는다.
export async function runCdExtraction(options) {
  const {
    projectRoot,
    cuePath,
    outputDir,
    evidenceDir,
    sourcePins,
    toolchain,
    documents,
  } = options;

  // 1) CUE 파싱 + 소스 핀 검증
  const cueText = await readFile(cuePath, 'utf8');
  const cue = parseCue(cueText);
  const cueSha = sha256(Buffer.from(cueText, 'ascii'));
  if (sourcePins?.cueSha256 && cueSha !== sourcePins.cueSha256) {
    throw new Error('CUE sha256 mismatch against source pin');
  }
  const binPath = join(dirname(cuePath), cue.binFile);
  const bin = await readFile(binPath);
  const binSha = sha256(bin);
  if (sourcePins?.binSha256 && binSha !== sourcePins.binSha256) {
    throw new Error('BIN sha256 mismatch against source pin');
  }

  // 2) MODE2 → ISO 변환 + 트리 워크
  const iso = convertMode2BinToIso(bin);
  const primary = walkIso9660(iso, { tree: 'primary' });
  let joliet = null;
  try {
    joliet = walkIso9660(iso, { tree: 'joliet' });
  } catch {
    joliet = null;
  }

  const rawSectorCount = bin.length / SECTOR_BYTES;

  // 3) pinned unshield 검증 — 도구 사본이 틀리면 CAB에 손대기 전에 중단
  await validatePinnedTool(toolchain.unshield); // 실패(ENOENT/sha/version) 시 여기서 중단

  // 4) 문서(docs) 완비 검증 — fail-closed. CAB 추출보다 먼저 판정해 문서 결손이 CAB 오류에 가려지지 않게 한다.
  let documentsSummary = null;
  if (documents) {
    const expected = documents.expectedPaths ?? [];
    const officialPdf = documents.officialPdfPaths ?? [];
    const found = [];
    for (const relPath of expected) {
      if (await pathExists(join(documents.root, relPath))) found.push(relPath);
    }
    const officialFound = [];
    for (const relPath of officialPdf) {
      if (await pathExists(join(documents.root, relPath))) officialFound.push(relPath);
    }
    if (found.length !== expected.length) {
      throw new Error(`documents incomplete: found ${found.length}/${expected.length} (missing)`);
    }
    if (officialFound.length !== officialPdf.length) {
      throw new Error(`official PDF documents incomplete: ${officialFound.length}/${officialPdf.length} (PDF missing)`);
    }
    const paths = expected.slice().sort((a, b) => a.localeCompare(b, 'en'));
    documentsSummary = {
      expectedCount: expected.length,
      foundCount: found.length,
      officialPdfExpectedCount: officialPdf.length,
      officialPdfFoundCount: officialFound.length,
      paths,
    };
  }

  // 5) InstallShield CAB 재추출 (pinned unshield)
  const cabExtractDir = join(outputDir, 'installshield');
  await rm(cabExtractDir, { recursive: true, force: true });
  await mkdir(cabExtractDir, { recursive: true });

  const cabFile = primary.files.find((file) => /\.cab$/i.test(file.path));
  const installShieldPaths = [];
  if (cabFile) {
    const cabPath = join(outputDir, 'cab', cabFile.path.split('/').pop());
    await mkdir(dirname(cabPath), { recursive: true });
    await writeFile(cabPath, cabFile.data);
    const run = await runPinnedTool(toolchain.unshield, ['-d', cabExtractDir, 'x', cabPath]);
    if (run.exitCode !== 0) {
      throw new Error(`unshield exited with code ${run.exitCode} (exit)`);
    }
    const extracted = await collectFiles(cabExtractDir);
    for (const relPath of extracted) {
      if (relPath.includes('post-install-')) continue; // 후속 설치 오염 배제
      installShieldPaths.push(relPath);
    }
    installShieldPaths.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  // 6) 커버리지 (raw 무손실 검증 + iso 전 볼륨 분류)
  const rawCoverage = buildCoverageLedger({
    totalBytes: bin.length,
    ranges: [{ path: '[MODE2_SECTORS]', start: 0, end: bin.length }],
  });
  const isoClass = classifyIsoSectors(iso, primary);
  const unallocated = computeUnallocated(isoClass.totalBytes, isoClass.ranges);
  const isoRangesFilled = isoClass.ranges.concat(
    unallocated.map((gap) => ({ path: '[UNALLOCATED]', start: gap.start, end: gap.end })),
  );
  const isoCoverage = buildCoverageLedger({ totalBytes: isoClass.totalBytes, ranges: isoRangesFilled });

  // 6) 추출물 기록 + 정본 카탈로그 (모든 검증 통과 후에만 evidence 기록)
  const isoRootDir = join(outputDir, 'iso-root');
  await rm(isoRootDir, { recursive: true, force: true });
  await mkdir(isoRootDir, { recursive: true });
  for (const file of primary.files) {
    const target = join(isoRootDir, ...file.path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.data);
  }

  const extraction = {
    schemaVersion: 1,
    iso: {
      files: primary.files.map((file) => ({
        path: file.path,
        extentLba: file.extentLba,
        size: file.size,
        sha256: sha256(file.data),
      })),
      joliet: joliet
        ? joliet.files.map((file) => ({ path: file.path, extentLba: file.extentLba, size: file.size, sha256: sha256(file.data) }))
        : [],
    },
    installShield: { paths: installShieldPaths },
    unallocated,
  };

  const coverage = { raw: rawCoverage, iso: isoCoverage, unallocated };

  const manifest = {
    schemaVersion: 1,
    source: { bin: { sha256: binSha }, cue: { sha256: cueSha } },
    media: { rawSectorCount },
    iso: { logicalBytes: rawSectorCount * USER_BYTES, fileCount: primary.files.length },
    installShield: { fileCount: installShieldPaths.length, paths: installShieldPaths },
    documents: documentsSummary ?? { expectedCount: 0, foundCount: 0, officialPdfExpectedCount: 0, officialPdfFoundCount: 0, paths: [] },
    coverage: {
      raw: { gapBytes: rawCoverage.gapBytes, overlapBytes: rawCoverage.overlapBytes, totalBytes: rawCoverage.totalBytes },
      iso: { gapBytes: isoCoverage.gapBytes, overlapBytes: isoCoverage.overlapBytes, totalBytes: isoCoverage.totalBytes },
    },
  };

  await mkdir(evidenceDir, { recursive: true });
  await writeFile(join(evidenceDir, 'coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`);
  await writeFile(join(evidenceDir, 'extraction.json'), `${JSON.stringify(extraction, null, 2)}\n`);
  await writeFile(join(evidenceDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { manifest, coverage, extraction, primary, joliet };
}

// 디렉터리를 재귀 순회해 posix 상대경로 목록을 반환.
async function collectFiles(root) {
  const { readdir } = await import('node:fs/promises');
  const results = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else results.push(relative(root, full).split(sep).join('/'));
    }
  }
  await walk(root);
  return results;
}

export { classifyIsoSectors, computeUnallocated };
export const constants = { SECTOR_BYTES, USER_BYTES, SYSTEM_AREA_SECTORS };
