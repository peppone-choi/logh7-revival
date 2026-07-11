import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const EXTRACTOR_URL = new URL('../../tools/extract/logh7-cd-extract.mjs', import.meta.url);
const TOOLCHAIN_URL = new URL('../../tools/extract/logh7-cd-toolchain.mjs', import.meta.url);
const SECTOR_BYTES = 2352;
const USER_BYTES = 2048;

let extractorPromise;
let toolchainPromise;

function extractorApi() {
  extractorPromise ??= import(EXTRACTOR_URL.href);
  return extractorPromise;
}

function toolchainApi() {
  toolchainPromise ??= import(TOOLCHAIN_URL.href);
  return toolchainPromise;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function posixPath(root, path) {
  return relative(root, path).split(sep).join('/');
}

function writeBothEndian16(buffer, offset, value) {
  buffer.writeUInt16LE(value, offset);
  buffer.writeUInt16BE(value, offset + 2);
}

function writeBothEndian32(buffer, offset, value) {
  buffer.writeUInt32LE(value, offset);
  buffer.writeUInt32BE(value, offset + 4);
}

function jolietName(name) {
  const result = Buffer.alloc(name.length * 2);
  for (let index = 0; index < name.length; index += 1) {
    result.writeUInt16BE(name.charCodeAt(index), index * 2);
  }
  return result;
}

function directoryRecord({ extentLba, size, name, directory = false, joliet = false }) {
  const identifier = Buffer.isBuffer(name)
    ? name
    : joliet
      ? jolietName(name)
      : Buffer.from(name, 'ascii');
  const padding = identifier.length % 2 === 0 ? 1 : 0;
  const record = Buffer.alloc(33 + identifier.length + padding);
  record[0] = record.length;
  record[1] = 0;
  writeBothEndian32(record, 2, extentLba);
  writeBothEndian32(record, 10, size);
  record.set([126, 1, 1, 0, 0, 0, 0], 18);
  record[25] = directory ? 0x02 : 0x00;
  writeBothEndian16(record, 28, 1);
  record[32] = identifier.length;
  identifier.copy(record, 33);
  return record;
}

function writeDirectory(iso, lba, records) {
  let cursor = lba * USER_BYTES;
  for (const record of records) {
    record.copy(iso, cursor);
    cursor += record.length;
  }
}

function writeVolumeDescriptor(iso, {
  lba,
  type,
  rootLba,
  blocks,
  joliet = false,
}) {
  const descriptor = iso.subarray(lba * USER_BYTES, (lba + 1) * USER_BYTES);
  descriptor[0] = type;
  descriptor.write('CD001', 1, 'ascii');
  descriptor[6] = 1;
  descriptor.write(joliet ? 'LOGH7_JOLIET' : 'LOGH7_TEST', 40, 'ascii');
  writeBothEndian32(descriptor, 80, blocks);
  writeBothEndian16(descriptor, 120, 1);
  writeBothEndian16(descriptor, 124, 1);
  writeBothEndian16(descriptor, 128, USER_BYTES);
  if (joliet) Buffer.from('%/E', 'ascii').copy(descriptor, 88);
  directoryRecord({
    extentLba: rootLba,
    size: USER_BYTES,
    name: Buffer.from([0]),
    directory: true,
  }).copy(descriptor, 156);
}

function makeMinimalIso({
  primaryFileName = 'README.TXT;1',
  docsCycle = false,
  cabPayload = Buffer.from(JSON.stringify({
    files: {
      'data/MsgDat/constmsg.dat': 'Y29uc3Q=',
      'exe/G7MTClient.exe': 'Y2xpZW50',
      'update.ini': 'W3VwZGF0ZV0=',
    },
  })),
} = {}) {
  const blocks = 32;
  const iso = Buffer.alloc(blocks * USER_BYTES);
  const readme = Buffer.from('LOGH VII\n');
  const manual = Buffer.from('%PDF-test');
  const unicode = Buffer.from('Joliet payload');
  const primaryRootLba = 20;
  const jolietRootLba = 21;
  const readmeLba = 22;
  const cabLba = 23;
  const docsLba = 24;
  const manualLba = 25;
  const unicodeLba = 26;

  writeVolumeDescriptor(iso, {
    lba: 16,
    type: 1,
    rootLba: primaryRootLba,
    blocks,
  });
  writeVolumeDescriptor(iso, {
    lba: 17,
    type: 2,
    rootLba: jolietRootLba,
    blocks,
    joliet: true,
  });
  const terminator = iso.subarray(18 * USER_BYTES, 19 * USER_BYTES);
  terminator[0] = 255;
  terminator.write('CD001', 1, 'ascii');
  terminator[6] = 1;

  const dot = directoryRecord({
    extentLba: primaryRootLba,
    size: USER_BYTES,
    name: Buffer.from([0]),
    directory: true,
  });
  const dotdot = directoryRecord({
    extentLba: primaryRootLba,
    size: USER_BYTES,
    name: Buffer.from([1]),
    directory: true,
  });
  const primaryFile = directoryRecord({
    extentLba: readmeLba,
    size: readme.length,
    name: primaryFileName,
  });
  const cabRecord = directoryRecord({
    extentLba: cabLba,
    size: cabPayload.length,
    name: 'DATA1.CAB;1',
  });
  const docsRecord = directoryRecord({
    extentLba: docsLba,
    size: USER_BYTES,
    name: 'DOCS',
    directory: true,
  });
  writeDirectory(iso, primaryRootLba, [dot, dotdot, primaryFile, cabRecord, docsRecord]);

  const docsRecords = [
    directoryRecord({
      extentLba: docsLba,
      size: USER_BYTES,
      name: Buffer.from([0]),
      directory: true,
    }),
    directoryRecord({
      extentLba: primaryRootLba,
      size: USER_BYTES,
      name: Buffer.from([1]),
      directory: true,
    }),
    directoryRecord({
      extentLba: manualLba,
      size: manual.length,
      name: 'MANUAL.PDF;1',
    }),
  ];
  if (docsCycle) {
    docsRecords.push(directoryRecord({
      extentLba: docsLba,
      size: USER_BYTES,
      name: 'LOOP',
      directory: true,
    }));
  }
  writeDirectory(iso, docsLba, docsRecords);

  const jolietDot = directoryRecord({
    extentLba: jolietRootLba,
    size: USER_BYTES,
    name: Buffer.from([0]),
    directory: true,
  });
  const jolietDotdot = directoryRecord({
    extentLba: jolietRootLba,
    size: USER_BYTES,
    name: Buffer.from([1]),
    directory: true,
  });
  const jolietFile = directoryRecord({
    extentLba: unicodeLba,
    size: unicode.length,
    name: '설명.TXT;1',
    joliet: true,
  });
  writeDirectory(iso, jolietRootLba, [jolietDot, jolietDotdot, jolietFile]);

  readme.copy(iso, readmeLba * USER_BYTES);
  cabPayload.copy(iso, cabLba * USER_BYTES);
  manual.copy(iso, manualLba * USER_BYTES);
  unicode.copy(iso, unicodeLba * USER_BYTES);

  return {
    iso,
    blocks,
    primaryFileRecordOffset: primaryRootLba * USER_BYTES + dot.length + dotdot.length,
    payloads: { readme, cabPayload, manual, unicode },
  };
}

function makeMode2Sector(payload, { form2 = false } = {}) {
  assert.equal(payload.length, USER_BYTES);
  const sector = Buffer.alloc(SECTOR_BYTES);
  sector[0] = 0x00;
  sector.fill(0xff, 1, 11);
  sector[11] = 0x00;
  sector[15] = 0x02;
  const subheader = Buffer.from([0x00, 0x00, form2 ? 0x28 : 0x08, 0x00]);
  subheader.copy(sector, 16);
  subheader.copy(sector, 20);
  payload.copy(sector, 24);
  return sector;
}

function isoToMode2Bin(iso) {
  assert.equal(iso.length % USER_BYTES, 0);
  const sectors = [];
  for (let offset = 0; offset < iso.length; offset += USER_BYTES) {
    sectors.push(makeMode2Sector(iso.subarray(offset, offset + USER_BYTES)));
  }
  return Buffer.concat(sectors);
}

async function makeDocsFixture(root) {
  const paths = [];
  for (let index = 0; index < 409; index += 1) {
    const path = join(root, 'notes', `doc-${String(index).padStart(3, '0')}.md`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `document ${index}\n`);
    paths.push(posixPath(root, path));
  }
  const pdfNames = [
    'gin7manual.pdf',
    'gin7manual-alt.pdf',
    'gin7manual-cd-original.pdf',
    'gin7manual-saved-starchart.pdf',
    'manual_saved.pdf',
  ];
  for (const name of pdfNames) {
    const path = join(root, 'reference', name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(`%PDF-${name}`));
    paths.push(posixPath(root, path));
  }
  paths.sort((left, right) => left.localeCompare(right, 'en'));
  return {
    expectedPaths: paths,
    officialPdfPaths: pdfNames.map((name) => `reference/${name}`).sort(),
  };
}

async function makeFakeUnshield(root) {
  const path = join(root, 'unshield-fixture.mjs');
  const source = String.raw`
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

if (process.argv[2] === '--version') {
  console.log('unshield-fixture 1.0.0');
  process.exit(0);
}

const outputIndex = process.argv.indexOf('-d');
const extractIndex = process.argv.indexOf('x');
if (outputIndex < 0 || extractIndex < 0) process.exit(64);
const outputRoot = resolve(process.argv[outputIndex + 1]);
const cabPath = process.argv[extractIndex + 1];
const payload = JSON.parse(await readFile(cabPath, 'utf8'));
let written = 0;
for (const [relativePath, base64] of Object.entries(payload.files ?? {})) {
  const target = resolve(outputRoot, relativePath);
  if (target !== outputRoot && !target.startsWith(outputRoot + sep)) process.exit(65);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(base64, 'base64'));
  written += 1;
  if (payload.failAfterFirst && written === 1) process.exit(9);
}
console.log(JSON.stringify({ written }));
`;
  await writeFile(path, source, 'utf8');
  return {
    path,
    sha256: sha256(Buffer.from(source)),
    expectedVersion: 'unshield-fixture 1.0.0',
    versionArgs: ['--version'],
    launcher: process.execPath,
  };
}

async function makeExtractionFixture({ failingCab = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'logh7-cd-red-'));
  const sourceRoot = join(root, 'artifacts', 'logh7-cd');
  const docsRoot = join(root, 'docs');
  const cabPayload = Buffer.from(JSON.stringify({
    failAfterFirst: failingCab,
    files: {
      'data/MsgDat/constmsg.dat': 'Y29uc3Q=',
      'exe/G7MTClient.exe': 'Y2xpZW50',
      'update.ini': 'W3VwZGF0ZV0=',
    },
  }));
  const { iso } = makeMinimalIso({ cabPayload });
  const bin = isoToMode2Bin(iso);
  const cueText = 'FILE "Logh7.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n';
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(join(sourceRoot, 'Logh7.bin'), bin);
  await writeFile(join(sourceRoot, 'Logh7.cue'), cueText, 'ascii');
  const documents = await makeDocsFixture(docsRoot);
  const unshield = await makeFakeUnshield(root);

  // 후속 설치 파일이 섞인 트리는 정본 추출 입력으로 사용되면 안 된다.
  const contaminated = join(root, 'artifacts', 'logh7-install');
  await mkdir(contaminated, { recursive: true });
  for (let index = 0; index < 11; index += 1) {
    await writeFile(join(contaminated, `post-install-${index}.dat`), 'contamination');
  }

  return {
    root,
    cuePath: join(sourceRoot, 'Logh7.cue'),
    bin,
    cueText,
    docsRoot,
    documents,
    unshield,
  };
}

function extractionOptions(fixture, runName) {
  return {
    projectRoot: fixture.root,
    cuePath: fixture.cuePath,
    outputDir: join(fixture.root, runName, 'out'),
    evidenceDir: join(fixture.root, runName, 'evidence'),
    sourcePins: {
      binSha256: sha256(fixture.bin),
      cueSha256: sha256(Buffer.from(fixture.cueText, 'ascii')),
    },
    toolchain: { unshield: fixture.unshield },
    documents: {
      root: fixture.docsRoot,
      expectedPaths: fixture.documents.expectedPaths,
      officialPdfPaths: fixture.documents.officialPdfPaths,
    },
  };
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('raw iso fixture: MODE2/2352와 PVD/Joliet 최소 구조 자체 점검', () => {
  const { iso, blocks } = makeMinimalIso();
  const bin = isoToMode2Bin(iso);
  assert.equal(iso.length, blocks * USER_BYTES);
  assert.equal(bin.length, blocks * SECTOR_BYTES);
  assert.equal(iso.subarray(16 * USER_BYTES + 1, 16 * USER_BYTES + 6).toString('ascii'), 'CD001');
  assert.equal(iso.subarray(17 * USER_BYTES + 88, 17 * USER_BYTES + 91).toString('ascii'), '%/E');
  assert.deepEqual(bin.subarray(24, 24 + USER_BYTES), iso.subarray(0, USER_BYTES));
});

test('cab unshield docs fixture: 414/414 문서와 5/5 PDF 및 실행 도구 자체 점검', async () => {
  const fixture = await makeExtractionFixture();
  try {
    assert.equal(fixture.documents.expectedPaths.length, 414);
    assert.equal(fixture.documents.officialPdfPaths.length, 5);
    const { stdout } = await execFileAsync(process.execPath, [fixture.unshield.path, '--version']);
    assert.equal(stdout.trim(), fixture.unshield.expectedVersion);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('raw parseCue: 단일 TRACK 01 MODE2/2352 CUE만 허용한다', async () => {
  const { parseCue } = await extractorApi();
  assert.deepEqual(parseCue(
    'FILE "Logh7.bin" BINARY\n  TRACK 01 MODE2/2352\n    INDEX 01 00:00:00\n',
  ), {
    binFile: 'Logh7.bin',
    trackNumber: 1,
    mode: 'MODE2/2352',
    sectorSize: 2352,
    indexLba: 0,
  });
});

test('raw corrupt missing: CUE 다중 트랙·잘못된 모드·누락·경로 탈출을 거부한다', async () => {
  const { parseCue } = await extractorApi();
  assert.throws(() => parseCue('FILE "x.bin" BINARY\n  TRACK 01 MODE1/2352\n'), /MODE2\/2352/i);
  assert.throws(() => parseCue('FILE "x.bin" BINARY\n  TRACK 01 MODE2/2352\n  TRACK 02 AUDIO\n'), /single|track/i);
  assert.throws(() => parseCue('TRACK 01 MODE2/2352\n'), /FILE|missing/i);
  assert.throws(() => parseCue('FILE "../x.bin" BINARY\n  TRACK 01 MODE2/2352\n'), /escape|relative|path/i);
});

test('raw corrupt: Form1 user data는 정확히 +24..+2072이고 sync/mode/form/subheader를 검증한다', async () => {
  const { mode2Form1UserData } = await extractorApi();
  const payload = Buffer.alloc(USER_BYTES);
  for (let index = 0; index < payload.length; index += 1) payload[index] = index & 0xff;
  const sector = makeMode2Sector(payload);
  assert.deepEqual(mode2Form1UserData(sector), payload);

  const badSync = Buffer.from(sector);
  badSync[1] = 0x00;
  assert.throws(() => mode2Form1UserData(badSync), /sync/i);
  const badMode = Buffer.from(sector);
  badMode[15] = 0x01;
  assert.throws(() => mode2Form1UserData(badMode), /mode/i);
  const badSubheader = Buffer.from(sector);
  badSubheader[20] ^= 0x01;
  assert.throws(() => mode2Form1UserData(badSubheader), /subheader/i);
  assert.throws(() => mode2Form1UserData(makeMode2Sector(payload, { form2: true })), /form.?1/i);
  assert.throws(() => mode2Form1UserData(sector.subarray(0, SECTOR_BYTES - 1)), /2352|length/i);
});

test('raw iso corrupt: MODE2 BIN 변환은 전 섹터를 보존하고 비정렬·잘림을 거부한다', async () => {
  const { convertMode2BinToIso } = await extractorApi();
  const { iso } = makeMinimalIso();
  const bin = isoToMode2Bin(iso);
  assert.deepEqual(convertMode2BinToIso(bin), iso);
  assert.throws(() => convertMode2BinToIso(bin.subarray(0, bin.length - 1)), /2352|align|trunc/i);
  const corrupt = Buffer.from(bin);
  corrupt[SECTOR_BYTES + 15] = 1;
  assert.throws(() => convertMode2BinToIso(corrupt), /sector 1|mode/i);
});

test('iso joliet: PVD 트리와 %/E Joliet UCS-2BE 경로를 정확히 걷는다', async () => {
  const { walkIso9660 } = await extractorApi();
  const { iso, payloads } = makeMinimalIso();
  const primary = walkIso9660(iso, { tree: 'primary' });
  assert.deepEqual(primary.files.map(({ path }) => path), [
    'DATA1.CAB',
    'DOCS/MANUAL.PDF',
    'README.TXT',
  ]);
  assert.deepEqual(primary.files.find(({ path }) => path === 'README.TXT').data, payloads.readme);

  const joliet = walkIso9660(iso, { tree: 'joliet' });
  assert.equal(joliet.descriptor.escapeSequences, '%/E');
  assert.deepEqual(joliet.files.map(({ path }) => path), ['설명.TXT']);
  assert.deepEqual(joliet.files[0].data, payloads.unicode);
});

test('iso corrupt: 범위 밖 extent·디렉터리 순환·경로 탈출을 fail-closed 한다', async () => {
  const { walkIso9660 } = await extractorApi();
  const extentFixture = makeMinimalIso();
  writeBothEndian32(extentFixture.iso, extentFixture.primaryFileRecordOffset + 2, extentFixture.blocks + 1);
  assert.throws(() => walkIso9660(extentFixture.iso, { tree: 'primary' }), /extent|range/i);
  assert.throws(() => walkIso9660(makeMinimalIso({ docsCycle: true }).iso, { tree: 'primary' }), /cycle|recursive/i);
  assert.throws(
    () => walkIso9660(makeMinimalIso({ primaryFileName: '../X.;1' }).iso, { tree: 'primary' }),
    /escape|separator|path/i,
  );
});

test('coverage: 합계·gap·overlap을 반개구간 기준으로 재현한다', async () => {
  const { buildCoverageLedger } = await extractorApi();
  const complete = buildCoverageLedger({
    totalBytes: 12,
    ranges: [
      { path: 'b', start: 4, end: 12 },
      { path: 'a', start: 0, end: 4 },
    ],
  });
  assert.deepEqual(complete, {
    totalBytes: 12,
    classifiedBytes: 12,
    uniqueCoveredBytes: 12,
    gapBytes: 0,
    overlapBytes: 0,
    complete: true,
    ranges: [
      { path: 'a', start: 0, end: 4, bytes: 4 },
      { path: 'b', start: 4, end: 12, bytes: 8 },
    ],
    gaps: [],
    overlaps: [],
  });
  const gap = buildCoverageLedger({ totalBytes: 8, ranges: [{ path: 'a', start: 0, end: 3 }, { path: 'b', start: 4, end: 8 }] });
  assert.equal(gap.gapBytes, 1);
  assert.deepEqual(gap.gaps, [{ start: 3, end: 4, bytes: 1 }]);
  const overlap = buildCoverageLedger({ totalBytes: 8, ranges: [{ path: 'a', start: 0, end: 5 }, { path: 'b', start: 4, end: 8 }] });
  assert.equal(overlap.overlapBytes, 1);
  assert.deepEqual(overlap.overlaps, [{ start: 4, end: 5, bytes: 1, paths: ['a', 'b'] }]);
});

test('coverage corrupt: 음수·역전·전체 범위 밖 구간을 거부한다', async () => {
  const { buildCoverageLedger } = await extractorApi();
  assert.throws(() => buildCoverageLedger({ totalBytes: 8, ranges: [{ path: 'x', start: -1, end: 2 }] }), /range|start/i);
  assert.throws(() => buildCoverageLedger({ totalBytes: 8, ranges: [{ path: 'x', start: 4, end: 3 }] }), /range|end/i);
  assert.throws(() => buildCoverageLedger({ totalBytes: 8, ranges: [{ path: 'x', start: 0, end: 9 }] }), /range|total/i);
});

test('unshield missing corrupt: pinned tool은 파일 SHA256과 버전을 모두 맞춰야 실행된다', async () => {
  const { validatePinnedTool, runPinnedTool } = await toolchainApi();
  const root = await mkdtemp(join(tmpdir(), 'logh7-tool-red-'));
  try {
    const tool = await makeFakeUnshield(root);
    const receipt = await validatePinnedTool(tool);
    assert.equal(receipt.status, 'verified');
    assert.equal(receipt.sha256, tool.sha256);
    assert.equal(receipt.version, tool.expectedVersion);
    const run = await runPinnedTool(tool, ['--version']);
    assert.equal(run.exitCode, 0);
    assert.equal(run.stdout.trim(), tool.expectedVersion);

    await assert.rejects(() => validatePinnedTool({ ...tool, sha256: '0'.repeat(64) }), /sha-?256|hash/i);
    await assert.rejects(() => validatePinnedTool({ ...tool, expectedVersion: 'unshield-fixture 9.9.9' }), /version/i);
    await assert.rejects(() => validatePinnedTool({ ...tool, path: join(root, 'missing-unshield') }), /missing|ENOENT/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cab unshield determinism docs: 두 clean run manifest는 time-free·정렬·동일하고 414/414·5/5를 기록한다', async () => {
  const { runCdExtraction } = await extractorApi();
  const fixture = await makeExtractionFixture();
  try {
    const firstOptions = extractionOptions(fixture, 'run-a');
    const secondOptions = extractionOptions(fixture, 'run-b');
    await runCdExtraction(firstOptions);
    await runCdExtraction(secondOptions);
    const firstBytes = await readFile(join(firstOptions.evidenceDir, 'manifest.json'));
    const secondBytes = await readFile(join(secondOptions.evidenceDir, 'manifest.json'));
    assert.deepEqual(secondBytes, firstBytes);
    const manifest = JSON.parse(firstBytes);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.source.bin.sha256, firstOptions.sourcePins.binSha256);
    assert.equal(manifest.source.cue.sha256, firstOptions.sourcePins.cueSha256);
    assert.equal(manifest.media.rawSectorCount, fixture.bin.length / SECTOR_BYTES);
    assert.equal(manifest.iso.logicalBytes, fixture.bin.length / SECTOR_BYTES * USER_BYTES);
    assert.equal(manifest.iso.fileCount, 3);
    assert.equal(manifest.installShield.fileCount, 3);
    assert.deepEqual(manifest.installShield.paths, [
      'data/MsgDat/constmsg.dat',
      'exe/G7MTClient.exe',
      'update.ini',
    ]);
    assert.equal(manifest.installShield.paths.some((path) => path.includes('post-install-')), false);
    assert.equal(manifest.documents.expectedCount, 414);
    assert.equal(manifest.documents.foundCount, 414);
    assert.equal(manifest.documents.officialPdfExpectedCount, 5);
    assert.equal(manifest.documents.officialPdfFoundCount, 5);
    assert.deepEqual(manifest.documents.paths, fixture.documents.expectedPaths);
    assert.equal(manifest.coverage.raw.gapBytes, 0);
    assert.equal(manifest.coverage.raw.overlapBytes, 0);
    assert.equal(manifest.coverage.iso.gapBytes, 0);
    assert.equal(manifest.coverage.iso.overlapBytes, 0);
    assert.equal('generatedAt' in manifest, false);
    assert.doesNotMatch(firstBytes.toString('utf8'), /createdAt|updatedAt|timestamp/i);
    assert.equal(await pathExists(join(firstOptions.evidenceDir, 'coverage.json')), true);
    assert.equal(await pathExists(join(firstOptions.evidenceDir, 'extraction.json')), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('cab unshield corrupt missing docs: 실패 시 최종 manifest를 하나도 남기지 않는다', async () => {
  const { runCdExtraction } = await extractorApi();
  const fixture = await makeExtractionFixture({ failingCab: true });
  try {
    const options = extractionOptions(fixture, 'failed-run');
    await assert.rejects(() => runCdExtraction(options), /unshield|exit|9/i);
    assert.equal(await pathExists(join(options.evidenceDir, 'manifest.json')), false);
    assert.equal(await pathExists(join(options.evidenceDir, 'coverage.json')), false);
    assert.equal(await pathExists(join(options.evidenceDir, 'extraction.json')), false);

    const missingDocOptions = extractionOptions(fixture, 'missing-doc-run');
    await rm(join(fixture.docsRoot, fixture.documents.officialPdfPaths[0]), { force: true });
    await assert.rejects(() => runCdExtraction(missingDocOptions), /document|missing|414|PDF/i);
    assert.equal(await pathExists(join(missingDocOptions.evidenceDir, 'manifest.json')), false);

    const missingToolOptions = extractionOptions(fixture, 'missing-tool-run');
    missingToolOptions.toolchain.unshield = { ...fixture.unshield, path: join(fixture.root, 'missing-unshield') };
    await assert.rejects(() => runCdExtraction(missingToolOptions), /unshield|missing|ENOENT/i);
    assert.equal(await pathExists(join(missingToolOptions.evidenceDir, 'manifest.json')), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
