// LOGH7 자체 MDX의 모델 로컬 TRS와 천체 모델 교차연결 계약 검증.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const SERVER_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(SERVER_ROOT, '..');
const MODELS_PATH = join(SERVER_ROOT, 'content', 'generated', 'models.json');
const CATALOG_PATH = join(SERVER_ROOT, 'content', 'generated', 'logh7-celestial-model-catalog.json');
const models = JSON.parse(readFileSync(MODELS_PATH, 'utf8'));

function readCatalog() {
  if (!existsSync(CATALOG_PATH)) return null;
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
}

function sha256Content(content) {
  return createHash('sha256').update(String(content).replace(/\r\n/g, '\n')).digest('hex');
}

function sha256(path) {
  return sha256Content(readFileSync(path, 'utf8'));
}

function buildZeroSampleMdxFixture() {
  const nodeOffset = 0x58;
  const descriptorOffset = 0x180;
  const mappingOffset = 0x1c0;
  const keyDataOffset = 0x280;
  const baseVirtualAddress = 0x10000000;
  const fixture = Buffer.alloc(0x288);

  fixture.writeUInt32LE(baseVirtualAddress + nodeOffset, 0x00);
  fixture.writeUInt32LE(1, 0x04);
  fixture.writeUInt32LE(baseVirtualAddress + descriptorOffset, 0x10);
  fixture.writeUInt32LE(1, 0x14);
  fixture.write('zero_track\0', nodeOffset, 'ascii');
  fixture.writeUInt32LE(baseVirtualAddress + mappingOffset, nodeOffset + 0x88);
  fixture.writeUInt32LE(1, nodeOffset + 0x8c);
  fixture.writeInt32LE(-1, nodeOffset + 0x90);
  fixture.writeUInt32LE(baseVirtualAddress + keyDataOffset, nodeOffset + 0x94);
  fixture.writeInt32LE(0, mappingOffset + 4);
  for (let channel = 1; channel < 9; channel += 1) {
    fixture.writeInt32LE(-1, mappingOffset + 4 + channel * 4);
  }
  fixture.writeUInt32LE(baseVirtualAddress + keyDataOffset, descriptorOffset);
  fixture.writeUInt32LE(0, descriptorOffset + 4);
  fixture.writeInt32LE(0, descriptorOffset + 8);
  return fixture;
}

test('생성물은 현재 파서와 카탈로그 생성기 해시를 고정한다', () => {
  const catalog = readCatalog();
  assert.ok(models.generator, 'models 생성기 provenance가 있어야 한다');
  assert.ok(catalog?.generator, '천체 카탈로그 생성기 provenance가 있어야 한다');
  assert.equal(models.generator.sha256, sha256(join(REPO_ROOT, 'tools', 'extract', 'mdx_parse_all.mjs')));
  assert.equal(catalog.generator.sha256, sha256(join(REPO_ROOT, 'tools', 'extract', 'build_celestial_model_catalog.mjs')));
});

test('생성기 provenance 해시는 Windows CRLF 체크아웃에서도 동일하다', () => {
  const source = readFileSync(join(REPO_ROOT, 'tools', 'extract', 'mdx_parse_all.mjs'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(sha256Content(source), sha256Content(source.replace(/\n/g, '\r\n')));
});

test('MDX 트랙 sampleCount=0은 빈 애니메이션으로 승격하지 않고 fail-closed 한다', (t) => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'logh7-mdx-zero-track-'));
  t.after(() => rmSync(tempRoot, { recursive: true, force: true }));
  const fixtureDir = join(tempRoot, 'fixture');
  const fixturePath = join(fixtureDir, 'zero_track.mdx');
  const outPath = join(tempRoot, 'models.json');
  mkdirSync(fixtureDir, { recursive: true });
  writeFileSync(fixturePath, buildZeroSampleMdxFixture());

  const result = spawnSync(process.execPath, [
    join(REPO_ROOT, 'tools', 'extract', 'mdx_parse_all.mjs'),
    '--root', tempRoot,
    '--out', outPath,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(readFileSync(outPath, 'utf8'));
  const node = parsed.files[0].nodes.find((item) => item.name === 'zero_track');
  assert.equal(parsed.files[0].transform_status, 'invalid');
  assert.equal(node.model_local_transform, null);
  assert.match(node.transform_unavailable_reason, /키 데이터 범위 오류/);
});

test('MDX/MDS 전수 노드에 부모 인덱스와 fail-closed 변환 상태가 있다', () => {
  const mdx = models.files.filter((file) => file.format_variant === 'mdx_standard');
  const mds = models.files.filter((file) => file.format_variant === 'mds_high_detail');
  assert.equal(mdx.reduce((sum, file) => sum + file.nodes.length, 0), 3590);
  assert.equal(mds.reduce((sum, file) => sum + file.nodes.length, 0), 255);

  for (const file of models.files) {
    for (const node of file.nodes) {
      assert.ok(Number.isInteger(node.parentIndex), `${file.path}#${node.index} parentIndex`);
      assert.ok(node.parentIndex === -1 || (node.parentIndex >= 0 && node.parentIndex < file.node_count), `${file.path}#${node.index} 부모 범위`);
    }
  }

  assert.ok(mds.every((file) => file.transform_status === 'variant_unsupported'));
  assert.ok(mds.every((file) => file.variantUnsupported === 'mds_high_detail'));
  assert.ok(mds.every((file) => file.nodes.every((node) => node.model_local_transform === null)));
});

test('MDX 매핑 성공/결손 파일 수는 코퍼스에서 계산되고 결손은 8개로 닫힌다', () => {
  const mdx = models.files.filter((file) => file.format_variant === 'mdx_standard');
  const unmapped = mdx.filter((file) => file.transform_status === 'unmapped');
  const mapped = mdx.filter((file) => file.transform_status === 'mapped');
  const expectedUnmapped = [
    'effect/exp_m.mdx',
    'effect/exp_s.mdx',
    'effect/m_smoke_a.mdx',
    'effect/m_smoke_b.mdx',
    'effect/repair_p.mdx',
    'effect/spark.mdx',
    'effect/supply_p.mdx',
    'strategy/test_warp.mdx',
  ];

  assert.deepEqual(unmapped.map((file) => file.path).sort(), expectedUnmapped);
  assert.equal(mapped.length + unmapped.length, mdx.length);
  assert.equal(unmapped.reduce((sum, file) => sum + file.nodes.length, 0), expectedUnmapped.length);
  assert.equal(models.counts.mapped_mdx_nodes, 3590 - expectedUnmapped.length);
  assert.ok(unmapped.every((file) => file.nodes.every((node) => node.model_local_transform === null)));
  assert.ok(mapped.every((file) => file.nodes.every((node) => node.model_local_transform !== null)));
});

test('모델 로컬 TRS는 Tx/Ty/Tz, Rx/Ry/Rz, Sx/Sy/Sz 순서와 재배치 오프셋을 보존한다', () => {
  assert.ok(models.transform_schema, '변환 스키마가 있어야 한다');
  assert.equal(models.transform_schema.coordinate_space, 'model_local');
  assert.deepEqual(models.transform_schema.channel_order, ['Tx', 'Ty', 'Tz', 'Rx', 'Ry', 'Rz', 'Sx', 'Sy', 'Sz']);
  const galaxy = models.files.find((file) => file.path === 'strategy/null_galaxy.mdx');
  const star = galaxy.nodes.find((node) => node.name === 'star_01_G');
  const transform = star.model_local_transform;
  assert.ok(transform, 'star_01_G 모델 로컬 변환이 있어야 한다');

  assert.deepEqual(transform.translation, [18.75, 0, 0.25]);
  assert.deepEqual(transform.rotation, [0, 0, 0]);
  assert.deepEqual(transform.scale, [1, 1, 1]);
  assert.deepEqual(transform.trackIndices, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(Object.hasOwn(transform, 'mappingMode'), false, 'mapping record +0을 mode로 오해하지 않는다');
  assert.equal(Object.hasOwn(transform, 'tracks'), false, '정적 노드는 TRS와 트랙 인덱스만 보존한다');

  const animated = models.files
    .flatMap((file) => file.nodes)
    .map((node) => node.model_local_transform)
    .filter((item) => item?.staticTrsStatus === 'animated');
  assert.ok(animated.length > 0, '애니메이션 노드가 있어야 한다');
  assert.ok(animated.every((item) => item.tracks.length === 9));
  assert.ok(animated.some((item) => item.tracks.some((track) => track.keyCount > 1)));
  const storedTracks = animated.flatMap((item) => item.tracks).filter((item) => item.trackIndex >= 0);
  for (const track of storedTracks) {
    assert.ok(Number.isInteger(track.descriptorOffset) && track.descriptorOffset >= 0);
    assert.ok(Number.isInteger(track.keyDataOffset) && track.keyDataOffset >= 0);
    assert.ok(track.keys.length <= models.transform_schema.key_sample_limit);
    assert.equal(track.keysTruncated, track.keyCount > track.keys.length);
  }
  assert.equal(storedTracks.reduce((sum, track) => sum + track.keyCount, 0), 582);
  assert.equal(storedTracks.reduce((sum, track) => sum + track.keys.length, 0), 582);
  assert.equal(Math.max(...storedTracks.map((track) => track.keyCount)), 7);
  assert.ok(storedTracks.every((track) => track.keysTruncated === false && track.keys.length === track.keyCount));
  assert.ok(statSync(MODELS_PATH).size < 3 * 1024 * 1024, '재생성 가능한 정적 트랙 상세를 중복 저장하지 않는다');
});

test('천체 모델 카탈로그는 시각 패밀리와 null_galaxy 정합만 연결한다', () => {
  assert.ok(existsSync(CATALOG_PATH), '천체 모델 카탈로그 생성물이 있어야 한다');
  const catalog = readCatalog();
  const familyCounts = Object.fromEntries(catalog.families.map((family) => [family.code, family.baseModelCount]));
  assert.deepEqual(familyCounts, { ds: 1, fs: 7, p: 24, y: 6 });
  assert.ok(catalog.families.every((family) => family.gameplayJoin === null));

  assert.deepEqual(catalog.nullGalaxy.counts, {
    total: 85,
    star: 79,
    blackhole: 3,
    neutronStar: 3,
    alignmentPairs: 79,
  });
  assert.deepEqual(catalog.nullGalaxy.flattening.sourceChannels, ['Tx', 'Tz']);
  assert.ok(catalog.nullGalaxy.alignment.maxResidualNorm <= 0.05);

  const star = catalog.nullGalaxy.nodes.find((node) => node.name === 'star_01_G');
  assert.deepEqual(star.modelLocalTranslation, [18.75, 0, 0.25]);
  assert.deepEqual(star.flatModelCoordinates, [18.75, 0.25]);
  assert.equal(star.system, 'ヴァルハラ');
  assert.ok(Number.isInteger(star.cell));

  const specialBodies = catalog.nullGalaxy.nodes.filter((node) => node.kind !== 'star');
  assert.ok(specialBodies.every((node) => node.system === null && node.cell === null));
  assert.doesNotMatch(JSON.stringify(catalog), /"positionStatus"\s*:\s*"not-in-mdx"/);
  assert.doesNotMatch(JSON.stringify(catalog.families), /gameplayPlanetId|fortressId|gameplayName/);
});
