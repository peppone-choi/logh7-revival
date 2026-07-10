#!/usr/bin/env node
// LOGH VII — DB 시드 정본 조립기
// 기존 정본 소스(server/content/**)를 읽어 서버 영속층이 시드할 형태로 정규화,
// server/data/seed/*.json 으로 방출한다. 기존 파일은 덮지 않는다(전부 새 파일).
//
// 근거(provenance)는 각 레코드/카탈로그에 병기한다. 추측 값은 confidence 라벨로 표시.
//
// 스키마 근거:
//  - 캐릭터 와이어: server/src/server/logh7-character-codec.mjs decodeGenerateCharReq/encodeGenerateCharOk
//    { power(진영id 2=제국/3=동맹), blood, sex, lastname, firstname, face(u32),
//      ability8[8], bonusPoint, specialAbilityNum, title, rank(u8 constmsg g5 subid) }
//  - 계급: constmsg group 5 (baseId 477, count 21). 少尉=0x0d=13 (codec 주석 확정 앵커).
//  - ability8 순서: character-roster _stat_keys = 統率/政治/運用/情報/指揮/機動/攻撃/防御
//  - 전략 그리드: 100×50 = 5000셀(0x0315 static grid). cell = canonRow*100 + canonCol.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const CONTENT = path.join(ROOT, 'server', 'content');
const OUT = path.join(ROOT, 'server', 'data', 'seed');
fs.mkdirSync(OUT, { recursive: true });

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const write = (name, obj) => {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  return { name, path: p, bytes: fs.statSync(p).size };
};

const GRID_W = 100, GRID_H = 50;
const now = new Date().toISOString();
const emitted = [];

// ─── 1. 계급 테이블 (constmsg group 5) ──────────────────────────────────────
// 앵커: 0-7 samples 순차 + 13(少尉, codec) + 18-20 samples 말미. 8-12/14-17 캐논 사다리 보간.
const RANK_TABLE = [
  { code: 0, ja: '皇帝', ko: '황제', tier: 'sovereign', confidence: 'confirmed' },
  { code: 1, ja: '政治家', ko: '정치가', tier: 'civil', confidence: 'confirmed' },
  { code: 2, ja: '元帥', ko: '원수', tier: 'officer', confidence: 'confirmed' },
  { code: 3, ja: '上級大将', ko: '상급대장', tier: 'officer', confidence: 'confirmed' },
  { code: 4, ja: '大将', ko: '대장', tier: 'officer', confidence: 'confirmed' },
  { code: 5, ja: '中将', ko: '중장', tier: 'officer', confidence: 'confirmed' },
  { code: 6, ja: '少将', ko: '소장', tier: 'officer', confidence: 'confirmed' },
  { code: 7, ja: '准将', ko: '준장', tier: 'officer', confidence: 'confirmed' },
  { code: 8, ja: '大佐', ko: '대령', tier: 'officer', confidence: 'inferred-canon-ladder' },
  { code: 9, ja: '中佐', ko: '중령', tier: 'officer', confidence: 'inferred-canon-ladder' },
  { code: 10, ja: '少佐', ko: '소령', tier: 'officer', confidence: 'inferred-canon-ladder' },
  { code: 11, ja: '大尉', ko: '대위', tier: 'officer', confidence: 'inferred-canon-ladder' },
  { code: 12, ja: '中尉', ko: '중위', tier: 'officer', confidence: 'inferred-canon-ladder' },
  { code: 13, ja: '少尉', ko: '소위', tier: 'officer', confidence: 'confirmed' },
  { code: 14, ja: '准尉', ko: '준위', tier: 'officer', confidence: 'inferred-canon-ladder' },
  { code: 15, ja: '曹長', ko: '상사', tier: 'nco', confidence: 'inferred-canon-ladder' },
  { code: 16, ja: '軍曹', ko: '중사', tier: 'nco', confidence: 'inferred-canon-ladder' },
  { code: 17, ja: '伍長', ko: '하사', tier: 'nco', confidence: 'inferred-canon-ladder' },
  { code: 18, ja: '上等兵', ko: '상병', tier: 'enlisted', confidence: 'confirmed' },
  { code: 19, ja: '一等兵', ko: '일등병', tier: 'enlisted', confidence: 'confirmed' },
  { code: 20, ja: '二等兵', ko: '이등병', tier: 'enlisted', confidence: 'confirmed' },
];
const rankByJa = new Map(RANK_TABLE.map((r) => [r.ja, r.code]));
emitted.push(write('rank-table.json', {
  id: 'logh7-rank-table',
  generatedAt: now,
  provenance: 'constmsg group 5 (baseId 477, count 21); 少尉=0x0d 앵커 = logh7-character-codec.mjs',
  wireField: 'character rank (u8, constmsg g5 subid)',
  note: '8-12/14-17 subid는 samples 미포함 → 캐논 군사 계급 사다리로 보간(confidence=inferred-canon-ladder).',
  ranks: RANK_TABLE,
}));

// ─── 2. 능력치 스키마 (ability8) ────────────────────────────────────────────
const ABILITY8 = ['tochi', 'seiji', 'unei', 'joho', 'shiki', 'kido', 'kogeki', 'bogyo'];
emitted.push(write('ability-schema.json', {
  id: 'logh7-ability-schema',
  generatedAt: now,
  provenance: 'character-roster.json _stat_keys / _stat_key_meaning_ja',
  order: ABILITY8,
  ja: { tochi: '統率', seiji: '政治', unei: '運用', joho: '情報', shiki: '指揮', kido: '機動', kogeki: '攻撃', bogyo: '防御' },
  ko: { tochi: '통솔', seiji: '정치', unei: '운용', joho: '정보', shiki: '지휘', kido: '기동', kogeki: '공격', bogyo: '방어' },
  wireField: 'character ability8[0..7] (u8 each)',
  confidence: 'order-inferred',
  note: 'ability8[i] ↔ 위 순서 매핑은 roster 문서 순서 기준. [CW]§2.1 캡처 대조로 최종 확정 필요(GAP).',
}));

// ─── 3. 세력/가문 카탈로그 (authored — 캐논 + power id) ──────────────────────
// power id: codec 주석 "2=제국, 3=동맹". 나머지(페잔/중립)는 게임 내 진영 id 미확정(GAP).
const FACTIONS = {
  id: 'logh7-factions',
  generatedAt: now,
  provenance: 'authored — 캐논(원작/매뉴얼) + power id는 logh7-character-codec.mjs(2=제국,3=동맹)',
  confidence: 'authored-canon',
  factions: [
    { id: 'empire', powerId: 2, name_ja: '銀河帝国', name_ko: '은하제국', name_en: 'Galactic Empire',
      colorRgb: [180, 30, 30], dynasty: 'goldenbaum', flags: ['playable', 'major'],
      note: 'ゴールデンバウム王朝. 로엔그람 왕조 이전 캐논 시점.' },
    { id: 'alliance', powerId: 3, name_ja: '自由惑星同盟', name_ko: '자유행성동맹', name_en: 'Free Planets Alliance',
      colorRgb: [40, 80, 180], dynasty: null, flags: ['playable', 'major'] },
    { id: 'phezzan', powerId: null, name_ja: 'フェザーン自治領', name_ko: '페잔 자치령', name_en: 'Phezzan Dominion',
      colorRgb: [180, 150, 40], dynasty: null, flags: ['minor', 'merchant'],
      note: 'power id 미확정(GAP) — 캐릭터 로스터에 페잔 소속 인물 없음. 갤럭시엔 neutral 1성계.' },
  ],
  nobleHouses: {
    confidence: 'gap',
    note: '골덴바움 귀족가문(브라운슈바이크·리텐하임·리히텐라데 등) 개별 가문 엔티티는 미분리. '
        + '로스터에 인물은 있으나 가문 소속(branch) 필드가 전부 null → 가문 카탈로그는 GAP.',
    known: [],
  },
};
emitted.push(write('factions.json', FACTIONS));

// ─── 4. 캐릭터 시드 (99 canon, 와이어-ready) ────────────────────────────────
const roster = readJson(path.join(CONTENT, 'character-roster.json'));
const factionToPower = { empire: 2, alliance: 3 };
function splitName(nameJa) {
  // LOGH 관례: 이름・(폰)・성. '・' 있으면 첫 토큰=given, 나머지=family.
  if (nameJa && nameJa.includes('・')) {
    const i = nameJa.indexOf('・');
    return { firstname: nameJa.slice(0, i), lastname: nameJa.slice(i + 1), split: 'dot-heuristic' };
  }
  // 단일 토큰 → 성으로 취급(HUD 표시명). 와이어는 lastname 비어있지 않으면 OK.
  return { firstname: '', lastname: nameJa || '', split: 'single-token-as-family' };
}
const chars = roster.characters.map((c) => {
  const { firstname, lastname, split } = splitName(c.name_ja);
  const ability8 = c.stats && c.stats_known
    ? ABILITY8.map((k) => c.stats[k] ?? 0)
    : null;
  let rankCode = c.rank != null ? (rankByJa.get(c.rank) ?? null) : null;
  if (rankCode == null) {
    if (c.kind === 'emperor') rankCode = 0;      // 皇帝
    else if (c.kind === 'politician') rankCode = 1; // 政治家
    // military + rank null → 미상(서버 기본값 위임), null 유지
  }
  return {
    id: c.id,
    faction: c.faction,
    powerId: factionToPower[c.faction] ?? null,
    kind: c.kind,
    sex: 0, // 로스터에 성별 필드 없음 — 캐논 전원 남성 가정(GAP: 여성 인물 별도 확인)
    name_ja: c.name_ja,
    name_romaji: c.name_romaji,
    name_kr: c.name_kr,
    lastname, firstname, nameSplit: split,
    rankJa: c.rank, rankCode,
    post: c.post,
    face: c.face_number ?? null,
    faceConfidence: c.face_number != null ? 'roster' : 'gap',
    ability8,
    abilityKeys: ABILITY8,
    statsKnown: !!(c.stats && c.stats_known),
    flagship: c.flagship ?? null,
    unit: c.unit ?? null,
    bio_ja: c.bio_ja ?? null,
    source: c.source,
  };
});
emitted.push(write('characters.json', {
  id: 'logh7-characters-seed',
  generatedAt: now,
  provenance: 'server/content/character-roster.json (gin7 매뉴얼 로스터 + 공식 로스터 face/stats)',
  scope: '캐논 명명 인물 로스터. NPC 정의의 근간 — 각 인물이 게임 내 제독/정치가 NPC.',
  wireSchema: 'logh7-character-codec.mjs (power/blood/sex/lastname/firstname/face/ability8/rank/title)',
  counts: {
    total: chars.length,
    withStats: chars.filter((c) => c.statsKnown).length,
    withFace: chars.filter((c) => c.face != null).length,
    withRankCode: chars.filter((c) => c.rankCode != null).length,
    empire: chars.filter((c) => c.faction === 'empire').length,
    alliance: chars.filter((c) => c.faction === 'alliance').length,
  },
  gaps: [
    'sex 필드 없음(전원 男 가정)',
    'face 없는 인물 87/99',
    'name 분할은 heuristic(nameSplit 라벨 참조)',
    'blood/title/bonusPoint/specialAbilityNum/birth 미보유 → 서버 기본값',
  ],
  characters: chars,
}));

// ─── 5. 갤럭시 성계 시드 (85, cell 부여) ─────────────────────────────────────
const galaxy = readJson(path.join(CONTENT, 'galaxy.json'));
const systems = galaxy.systems.map((s) => {
  const col = s.canonCol, row = s.canonRow;
  const cell = Number.isInteger(row) && Number.isInteger(col) ? row * GRID_W + col : null;
  return {
    system: s.system,
    faction: s.faction,
    isCorridor: !!s.is_corridor,
    canonCol: col, canonRow: row, cell,
    canonGameCol: s.canonGameCol, canonGameRow: s.canonGameRow,
    spectralClass: s.spectralClass ?? null,
    planets: (s.planets || []).map((p) => ({ name: p.name, orbit: p.orbit })),
    fortresses: s.fortresses || [],
  };
});
emitted.push(write('galaxy-systems.json', {
  id: 'logh7-galaxy-systems-seed',
  generatedAt: now,
  provenance: 'server/content/galaxy.json (좌표 정본: null_galaxy.mdx + 매뉴얼 성도 교차검증)',
  grid: { width: GRID_W, height: GRID_H, cellFormula: 'cell = canonRow*100 + canonCol (0-indexed, 0x0315 5000셀 배열)' },
  counts: {
    total: systems.length,
    withCell: systems.filter((s) => s.cell != null).length,
    empire: systems.filter((s) => s.faction === 'empire').length,
    alliance: systems.filter((s) => s.faction === 'alliance').length,
    neutral: systems.filter((s) => s.faction === 'neutral').length,
    corridors: systems.filter((s) => s.isCorridor).length,
  },
  systems,
}));

// ─── 6. 함선/유닛 시드 (63) ─────────────────────────────────────────────────
const shipStats = readJson(path.join(CONTENT, 'ship-stats.json'));
const ships = shipStats.ships.map((s) => ({
  key: s.key, name: s.name, side: s.side, shipClass: s.shipClass, pools: s.pools,
}));
emitted.push(write('ships.json', {
  id: 'logh7-ships-seed',
  generatedAt: now,
  provenance: 'server/content/ship-stats.json (매뉴얼 함선표 OCR 파생, pools=wire 유닛 스탯)',
  counts: { total: ships.length,
    empire: ships.filter((s) => s.side === 'empire').length,
    alliance: ships.filter((s) => s.side === 'alliance').length },
  note: '0x0325 유닛 포맷 정합은 wire-engineer/re-ui-entities 확정 대기. pools 필드는 와이어 스탯 후보.',
  ships,
}));

// ─── 7. 요새/기지 시드 (6) ──────────────────────────────────────────────────
const fortresses = readJson(path.join(CONTENT, 'fortresses.json'));
emitted.push(write('fortresses.json', {
  id: 'logh7-fortresses-seed',
  generatedAt: now,
  provenance: 'server/content/fortresses.json (매뉴얼 + 캐논 authored)',
  counts: { total: fortresses.fortresses.length },
  fortresses: fortresses.fortresses,
}));

// ─── 8. 초기 배치 시나리오 시드 (system→cell 해석) ──────────────────────────
const deploy = readJson(path.join(CONTENT, 'initial-deployment.json'));
const sysCell = new Map(systems.filter((s) => s.cell != null).map((s) => [s.system, s.cell]));
function resolveDeploy(list) {
  return (list || []).map((d) => ({ ...d, cell: sysCell.get(d.system) ?? null }));
}
emitted.push(write('initial-deployment.json', {
  id: 'logh7-initial-deployment-seed',
  generatedAt: now,
  provenance: 'server/content/initial-deployment.json (EXE 추출 시나리오 시작 배치) + cell은 galaxy-systems 해석',
  imperial: { fleet: resolveDeploy(deploy.imperial?.fleet), patrol: deploy.imperial?.patrol ?? [] },
  alliance: { fleet: resolveDeploy(deploy.alliance?.fleet), patrol: deploy.alliance?.patrol ?? [] },
  note: 'fleet[].cell=null 은 요새/추가행성 등 galaxy.json 미등재 지점(system→cell 해석 실패).',
}));

// ─── 9. 시드 매니페스트 (커버리지 표) ───────────────────────────────────────
emitted.push(write('seed-manifest.json', {
  id: 'logh7-db-seed-manifest',
  generatedAt: now,
  builder: 'server/tools/build-db-seed.mjs',
  catalogs: emitted.map((e) => ({ file: e.name, bytes: e.bytes })),
  serverSchemaToday: 'accounts, characters, world_fleet, domain_events (Database.mjs) — 갤럭시/함선/요새 미시드',
  note: '이 시드셋은 서버 영속층이 아직 소비하지 않는 정본 카탈로그. server-dev 시드 로더 배선 대기.',
}));

console.log('emitted seeds:');
for (const e of emitted) console.log(`  ${e.name.padEnd(28)} ${(e.bytes/1024).toFixed(1)}KB`);
