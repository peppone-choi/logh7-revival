// build-strategy-command-catalog.mjs
// 81 전략명령 카탈로그 생성기 (extract-miner 파이프라인, 하드코딩 금지 원칙 준수).
//
// 입력(정본):
//   - server/content/manual/strategy-commands.json  (_source: gin7 별표 戦略コマンド一覧表, P1)
//       → 81개 명령의 name_ja / category_ja / cost_cp / wait_time / exec_time / desc 의 단일 정본.
//   - server/content/manual/cards-cp-orgs.json       (gin7 pp.26-29, P1)
//       → 職務権限カード 메커니즘, 커맨드군↔카드타입, CP 풀(PCP/MCP) 규칙.
//   - docs/reference/legacy-evidence/logh7-post-permissions.md (P0/P1/P3 혼합)
//       → 81명령 역인덱스: 발령 직무(post), 게이트 provenance(RE/MAN/INF), 와이어 opcode 계열.
//   - server/src/domain/authority-cards.mjs (P0 라이브 B71 + P1)
//       → factory id 0x2b(ワープ航行)/0x2d(星系内航行) 확정 매핑.
//
// 출력: server/content/generated/logh7-strategy-command-catalog.json
//
// 정본이 아닌 필드(cp_pool 그룹추론, 미확정 factory id, 발령직무 대부분)는 provenance 태그로
// 명시 표기한다(P1/P0/MAN/INF/unresolved). 추측으로 승격하지 않는다.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANUAL = join(HERE, '..', 'content', 'manual');
const OUT = join(HERE, '..', 'content', 'generated', 'logh7-strategy-command-catalog.json');

const strategyCommands = JSON.parse(readFileSync(join(MANUAL, 'strategy-commands.json'), 'utf8'));

// ─────────────────────────────────────────────────────────────────────────────
// 커맨드군(카테고리) 메타 — cards-cp-orgs.json command_groups(P1 p.27) +
// post-permissions.md §3 와이어 계열. cp_pool 은 P1 매뉴얼이 명령별 표로 열거하지
// 않으므로 그룹 단위 추론(INF)이다.
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_META = {
  作戦コマンド: {
    key: 'STR',
    card_type_ja: '艦長カード',
    gloss_en: 'Operations',
    shared_by_all: true, // 모든 캐릭터가 艦長 카드 보유 (manual p.26, P1)
    wire_family: '0x0400-0x041e (battle-ops)',
    wire_family_prov: 'P0/P1 post-permissions §3',
    cp_pool: 'MCP',
    cp_pool_prov: 'INF-group', // 그룹 추론: 군사 성격 → 軍事CP
    default_issuer_scope: 'any',
    default_gate_prov: 'INF',
  },
  個人コマンド: {
    key: 'IND',
    card_type_ja: '個人カード',
    gloss_en: 'Personal',
    shared_by_all: true,
    wire_family: '0x12 action-menu / move opcodes',
    wire_family_prov: 'P1 post-permissions §3',
    cp_pool: null,
    cp_pool_prov: 'unresolved', // 개인 명령의 풀 귀속은 매뉴얼 표에 없음
    default_issuer_scope: 'any',
    default_gate_prov: 'MAN',
  },
  指揮コマンド: {
    key: 'CMD',
    card_type_ja: '指揮系職務権限カード',
    gloss_en: 'Command',
    shared_by_all: false,
    wire_family: '0x0900-0x0906 (strategy)',
    wire_family_prov: 'P0/P1 post-permissions §3',
    cp_pool: 'MCP',
    cp_pool_prov: 'INF-group',
    default_issuer_scope: 'post',
    default_gate_prov: 'MAN',
  },
  兵站コマンド: {
    key: 'LOG',
    card_type_ja: '艦隊司令官カード',
    gloss_en: 'Logistics',
    shared_by_all: false,
    wire_family: '0x0b00-0x0c0c (logistics)',
    wire_family_prov: 'P0/P1 post-permissions §3',
    cp_pool: 'MCP',
    cp_pool_prov: 'INF-group',
    default_issuer_scope: 'post',
    default_gate_prov: 'INF',
  },
  人事コマンド: {
    key: 'PER',
    card_type_ja: '人事系職務権限カード',
    gloss_en: 'Personnel',
    shared_by_all: false,
    wire_family: '0x0704-0x0709 (personnel)',
    wire_family_prov: 'P0 post-permissions §3 (server gates: ownership+rank-bounds only)',
    cp_pool: 'PCP',
    cp_pool_prov: 'INF-group',
    default_issuer_scope: 'post',
    default_gate_prov: 'MAN',
  },
  政治コマンド: {
    key: 'POL',
    card_type_ja: '国家中枢職務権限カード',
    gloss_en: 'Political',
    // 매뉴얼 커맨드군 명칭은 政略コマンド群(p.27); 별표 카테고리 라벨은 政治コマンド.
    group_name_ja: '政略コマンド群',
    shared_by_all: false,
    wire_family: '0x12 action-menu rec 860-871',
    wire_family_prov: 'P1 post-permissions §3 (전용 서버 도메인 미분리)',
    cp_pool: 'PCP',
    cp_pool_prov: 'INF-group',
    default_issuer_scope: 'post',
    default_gate_prov: 'MAN',
  },
  諜報コマンド: {
    key: 'INT',
    card_type_ja: '諜報系職務権限カード',
    gloss_en: 'Intelligence',
    shared_by_all: false,
    wire_family: '0x12 action-menu rec 918-931',
    wire_family_prov: 'P1 post-permissions §3',
    cp_pool: 'PCP',
    cp_pool_prov: 'INF-group',
    default_issuer_scope: 'post',
    default_gate_prov: 'MAN',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// 명령별 오버레이 — name_ja 키. post-permissions.md §3 역인덱스에서 근거가 있는
// 항목만 채운다. 없는 항목은 그룹 기본값을 쓴다(추측 금지).
// ─────────────────────────────────────────────────────────────────────────────
const OVERLAY = {
  // 作戦 — factory id 는 authority-cards.mjs P0(B71 라이브) 확정.
  ワープ航行: { factory_id: 0x2b, factory_id_prov: 'P0-RE(B71 live)+P1-manual', gate_prov: 'RE-ownership' },
  星系内航行: { factory_id: 0x2d, factory_id_prov: 'P0-RE(B71 live)+P1-manual', gate_prov: 'RE-ownership' },
  陸戦隊出撃: { gate_prov: 'RE (0x0421-family sortie, ownership)' },
  陸戦隊撤収: { gate_prov: 'RE (0x0421-family sortie, ownership)' },

  // 個人 — 士官学교 전용 / 특수 락.
  受講: { venue_ja: '士官学校', venue_prov: 'P1-manual-desc' },
  兵棋演習: { venue_ja: '士官学校', venue_prov: 'P1-manual-desc' },
  退役: { cooldown: { locks_command_ja: '志願', game_days: 30, prov: 'P1-manual-desc' } },
  志願: { effect_note: 'rank→少佐, flagship→戦艦', effect_prov: 'P1-manual-desc' },
  叛意: { tags: ['coup'] },
  謀議: { tags: ['coup'] },
  説得: { tags: ['coup'] },
  叛乱: { tags: ['coup'] },
  参加: { tags: ['coup'] },

  // 指揮 — 제안(策定)형 + 가변 CP. issuer 는 작전카드 보유 직무(MAN).
  作戦計画: { is_proposal: true, cp_variable: true, cp_range: [10, 1280], issuer_posts: ['統帥本部総長', '統合作戦本部長', '宇宙艦隊司令長官'], issuer_posts_prov: 'MAN' },
  作戦撤回: { is_proposal: true, cp_variable: true, cp_range: [5, 320], issuer_posts: ['統帥本部総長', '統合作戦本部長', '宇宙艦隊司令長官'], issuer_posts_prov: 'MAN' },
  発令: { is_proposal: true, cp_variable: true, cp_range: [1, 320], issuer_posts: ['統帥本部総長', '統合作戦本部長', '宇宙艦隊司令長官'], issuer_posts_prov: 'MAN' },
  部隊結成: { gate_prov: 'RE (0x0903 CreateOutfit)' },
  部隊解散: { gate_prov: 'RE (0x0906 DeleteOutfit)' },
  講義: { venue_ja: '士官学校', venue_prov: 'P1-manual-desc', issuer_posts: ['士官学校長', '士官学校教官'], issuer_posts_prov: 'MAN' },
  輸送計画: { issuer_posts: ['輸送艦隊司令官', '後方勤務本部長'], issuer_posts_prov: 'MAN' },
  輸送中止: { issuer_posts: ['輸送艦隊司令官', '後方勤務本部長'], issuer_posts_prov: 'MAN' },

  // 兵站 — 함대 지휘 직무.
  完全修理: { issuer_posts: ['艦隊司令官', '要塞司令官'], issuer_posts_prov: 'MAN' },
  完全補給: { issuer_posts: ['艦隊司令官', '要塞司令官'], issuer_posts_prov: 'MAN' },
  再編成: { issuer_posts: ['艦隊司令官', '要塞司令官'], issuer_posts_prov: 'MAN' },
  補充: { issuer_posts: ['艦隊司令官', '要塞司令官'], issuer_posts_prov: 'MAN' },
  搬出入: { issuer_posts: ['艦隊司令官', '要塞司令官'], issuer_posts_prov: 'MAN' },
  割当: { issuer_posts: ['艦隊司令官', '要塞司令官'], issuer_posts_prov: 'MAN' },

  // 人事 — 서버는 ownership+rank(1..14)만 게이트(P0), 직무 게이트는 MAN.
  昇進: { gate_prov: 'RE 0x0704 rank≤14; post=MAN', issuer_posts: ['軍務尚書', '人事部長'], issuer_posts_prov: 'MAN' },
  抜擢: { gate_prov: 'RE 0x0705; post=MAN', issuer_posts: ['軍務尚書', '人事部長'], issuer_posts_prov: 'MAN' },
  降等: { gate_prov: 'RE 0x0706; post=MAN', issuer_posts: ['軍務尚書', '人事部長'], issuer_posts_prov: 'MAN' },
  叙爵: { issuer_posts: ['皇帝', '帝国宰相'], issuer_posts_prov: 'MAN' },
  叙勲: { issuer_posts: ['人事部長', '軍務尚書'], issuer_posts_prov: 'MAN' },
  任命: { gate_prov: 'RE 0x0707 CardAppointment; appointer=MAN(chain)' },
  罷免: { gate_prov: 'RE 0x0708 CardDismisal; appointer=MAN(chain)' },
  辞任: { gate_prov: 'RE 0x0709 CardResignation (self)', issuer_scope: 'self' },
  封土授与: { issuer_posts: ['皇帝', '帝国宰相'], issuer_posts_prov: 'MAN' },
  封土直轄: { issuer_posts: ['皇帝', '帝国宰相'], issuer_posts_prov: 'MAN' },

  // 政治 — 국가 중추 직무.
  夜会: { issuer_scope: 'noble-or-politician', issuer_posts_prov: 'MAN' },
  狩猟: { requires_fief: true, requires_fief_prov: 'P1-manual-desc', issuer_scope: 'noble-or-politician' },
  会談: { issuer_scope: 'noble-or-politician' },
  談話: { issuer_scope: 'noble-or-politician' },
  国家目標: { is_proposal: true, issuer_posts: ['皇帝', '帝国宰相', '議長'], issuer_posts_prov: 'MAN' },
  納入率変更: { issuer_posts: ['財務尚書', '財政委員長'], issuer_posts_prov: 'MAN' },
  関税率変更: { issuer_posts: ['財務尚書', '財政委員長'], issuer_posts_prov: 'MAN' },
  処断: { issuer_posts: ['内務尚書', '司法尚書', '法秩序委員長', '人事部長'], issuer_posts_prov: 'MAN' },
  外交: { target_faction: 'phezzan', issuer_posts: ['フェザーン駐在弁務官', '自治領主'], issuer_posts_prov: 'MAN' },
  統治目標: { is_proposal: true, issuer_posts: ['惑星総督', '知事'], issuer_posts_prov: 'MAN' },

  // 諜報 — 헌병/사법 계열 + 첩보관(간첩).
  一斉捜索: { issuer_posts: ['憲兵総監', '憲兵司令官'], issuer_posts_prov: 'MAN' },
  逮捕許可: { issuer_posts: ['内務尚書', '司法尚書', '法秩序委員長'], issuer_posts_prov: 'MAN' },
  執行命令: { issuer_posts: ['内務尚書', '司法尚書', '法秩序委員長'], issuer_posts_prov: 'MAN' },
  査閲: { issuer_posts: ['査閲部長'], issuer_posts_prov: 'MAN' },
  襲撃: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
  監視: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
  潜入工作: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
  脱出工作: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
  情報工作: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
  破壊工作: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
  煽動工作: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
  侵入工作: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
  帰還工作: { issuer_posts: ['諜報官'], issuer_posts_prov: 'MAN', tags: ['espionage'] },
};

// ─────────────────────────────────────────────────────────────────────────────
// 조립
// ─────────────────────────────────────────────────────────────────────────────
const categoryCounter = new Map();
const commands = strategyCommands.commands.map((src) => {
  const meta = CATEGORY_META[src.category_ja];
  if (!meta) throw new Error(`unknown category: ${src.category_ja}`);
  const seq = (categoryCounter.get(meta.key) ?? 0) + 1;
  categoryCounter.set(meta.key, seq);
  const slug = `${meta.key}_${String(seq).padStart(2, '0')}`;
  const ov = OVERLAY[src.name_ja] ?? {};

  return {
    slug,
    name_ja: src.name_ja,
    category_ja: src.category_ja,
    category_key: meta.key,
    // ── CP / 타이밍 (P1 매뉴얼 별표) ──
    cost_cp: src.cost_cp,
    cp_variable: ov.cp_variable ?? false,
    cp_range: ov.cp_range ?? null,
    cp_pool: meta.cp_pool,
    cp_pool_prov: meta.cp_pool_prov,
    wait_time: src.wait_time,
    exec_time: src.exec_time,
    cp_timing_prov: 'P1-manual (strategy-commands.json 별표)',
    // ── 권한 게이트 ──
    required_card_ja: meta.card_type_ja,
    required_card_prov: 'P1-manual-p26 (커맨드군→카드타입)',
    shared_by_all_characters: meta.shared_by_all,
    issuer_scope: ov.issuer_scope ?? meta.default_issuer_scope,
    issuer_posts: ov.issuer_posts ?? [],
    issuer_posts_prov: ov.issuer_posts ?? null ? (ov.issuer_posts_prov ?? 'MAN') : (meta.shared_by_all ? 'P1 (universal card)' : 'unresolved'),
    required_rank: null, // 명령별 최소 계급은 별표에 없음 — 직무 계급요건은 org-posts.json 소관
    required_rank_prov: 'unresolved',
    faction: 'both', // 별표는 진영 구분 없이 공통. 진영 특이는 target_faction 로 표기.
    faction_prov: 'P1-manual (별표 공통)',
    target_faction: ov.target_faction ?? null,
    venue_ja: ov.venue_ja ?? null,
    venue_prov: ov.venue_ja ? ov.venue_prov : null,
    requires_fief: ov.requires_fief ?? false,
    cooldown: ov.cooldown ?? null,
    is_proposal: ov.is_proposal ?? false,
    // ── 와이어 / 구현 ──
    factory_id: ov.factory_id ?? null,
    factory_id_prov: ov.factory_id != null ? ov.factory_id_prov : 'unresolved',
    wire_family: meta.wire_family,
    wire_family_prov: meta.wire_family_prov,
    gate_provenance: ov.gate_prov ?? meta.default_gate_prov,
    effect_note: ov.effect_note ?? null,
    tags: ov.tags ?? [],
    desc_ja: src.desc,
    sources: [
      'server/content/manual/strategy-commands.json (P1 별표)',
      'docs/reference/legacy-evidence/logh7-post-permissions.md §3',
      'server/content/manual/cards-cp-orgs.json (P1 pp.26-27)',
    ],
  };
});

const catalog = {
  _schema: 'logh7-strategy-command-catalog@1',
  _generated_by: 'server/tools/build-strategy-command-catalog.mjs',
  _purpose:
    'gin7 별표 戦略コマンド一覧表의 81 전략명령을 권한 메타데이터(카드/직무/CP/진영/쿨다운/제안)와 함께 정본화한 카탈로그. '
    + 'strategy-commands.json(P1)을 CP/타이밍 단일 정본으로 삼고, post-permissions.md 역인덱스로 발령직무/게이트를 오버레이한다.',
  _provenance_legend: {
    'P0': 'RE-confirmed (client decompile 또는 authoritative server 코드에서 강제되는 게이트)',
    'P1': 'official manual / in-game canon (gin7 매뉴얼 또는 constmsg 문자열)',
    'P2': 'manual candidate (P1 텍스트가 강하게 함의하나 명시 grant 아님)',
    'P3': 'inferred design reading (원본 아님)',
    'RE': 'server/client 체크가 존재',
    'MAN': '매뉴얼이 보유자/장소를 명시',
    'INF': '커맨드군→카드 규칙으로부터의 추론',
    'INF-group': '그룹 단위 추론(명령별 정본 표 없음)',
    'unresolved': '정본 근거 미확보 — 다음 배치 과제',
  },
  _sources: [
    { file: 'server/content/manual/strategy-commands.json', grade: 'P1', gives: '81 명령 name/category/CP/타이밍/desc 단일 정본' },
    { file: 'server/content/manual/cards-cp-orgs.json', grade: 'P1', gives: '職務権限カード 메커니즘, 커맨드군↔카드, CP 풀 규칙 (pp.26-29)' },
    { file: 'docs/reference/legacy-evidence/logh7-post-permissions.md', grade: 'P0/P1/P3', gives: '81명령 역인덱스: 발령직무, 게이트 provenance, 와이어 계열' },
    { file: 'server/src/domain/authority-cards.mjs', grade: 'P0/P1', gives: 'factory id 0x2b/0x2d 확정 (B71 라이브)' },
  ],
  _counts: {
    total: commands.length,
    by_category: Object.fromEntries([...categoryCounter.entries()]),
    factory_id_resolved: commands.filter((c) => c.factory_id != null).length,
    factory_id_unresolved: commands.filter((c) => c.factory_id == null).length,
  },
  _category_meta: Object.fromEntries(
    Object.entries(CATEGORY_META).map(([name_ja, m]) => [
      m.key,
      {
        name_ja,
        group_name_ja: m.group_name_ja ?? name_ja.replace('コマンド', 'コマンド群'),
        gloss_en: m.gloss_en,
        card_type_ja: m.card_type_ja,
        shared_by_all_characters: m.shared_by_all,
        wire_family: m.wire_family,
        cp_pool: m.cp_pool,
        cp_pool_prov: m.cp_pool_prov,
      },
    ]),
  ),
  commands,
};

writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
process.stdout.write(
  `wrote ${OUT}\n  total=${catalog._counts.total} `
  + `by_category=${JSON.stringify(catalog._counts.by_category)} `
  + `factory_resolved=${catalog._counts.factory_id_resolved}\n`,
);
