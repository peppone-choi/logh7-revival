// 전략명령 카탈로그 도메인 — 권한 게이트 검증 골격.
//
// 데이터 정본: server/content/generated/logh7-strategy-command-catalog.json
//   (생성기 server/tools/build-strategy-command-catalog.mjs, 근거 strategy-commands.json 별표 P1).
//
// 이 모듈은 명령별 권한 게이트(진영/계급/직무·카드/CP/장소/봉토)의 골격만 제공한다.
// 각 명령의 실제 게임로직(result)은 다음 배치이며 executeStrategyCommand 는 스텁이다.
// 미확정 정본(factory id 대부분, 명령별 계급요건)은 카탈로그 provenance 를 그대로 노출한다.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATALOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'content',
  'generated',
  'logh7-strategy-command-catalog.json',
);

let cached = null;

/** 카탈로그 JSON 을 1회 로드해 slug 인덱스와 함께 캐시한다. */
export function loadStrategyCommandCatalog() {
  if (cached) return cached;
  const parsed = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const bySlug = new Map(parsed.commands.map((cmd) => [cmd.slug, cmd]));
  const byNameJa = new Map(parsed.commands.map((cmd) => [cmd.name_ja, cmd]));
  cached = { ...parsed, bySlug, byNameJa };
  return cached;
}

export function listStrategyCommands() {
  return loadStrategyCommandCatalog().commands;
}

export function getStrategyCommand(ref) {
  const catalog = loadStrategyCommandCatalog();
  return catalog.bySlug.get(ref) ?? catalog.byNameJa.get(ref) ?? null;
}

// 거부 사유 코드 — 안정 식별자.
export const DENY = Object.freeze({
  UNKNOWN_COMMAND: 'unknown-command',
  WRONG_FACTION: 'wrong-faction',
  INSUFFICIENT_RANK: 'insufficient-rank',
  NO_AUTHORITY: 'no-authority',
  INSUFFICIENT_CP: 'insufficient-cp',
  WRONG_VENUE: 'wrong-venue',
  NO_FIEF: 'no-fief',
});

// 진영 코드: 2=제국, 3=동맹.
const FACTION_BY_POWER = Object.freeze({ 2: 'empire', 3: 'alliance' });

function cpCost(command) {
  if (command.cp_variable && Array.isArray(command.cp_range)) return command.cp_range[0];
  return command.cost_cp > 0 ? command.cost_cp : 0;
}

function poolBalance(actor, pool) {
  if (pool === 'PCP') return Number(actor?.pcp ?? 0);
  if (pool === 'MCP') return Number(actor?.mcp ?? 0);
  return null; // pool 미확정 → CP 게이트 생략
}

function holdsAuthority(actor, command) {
  // 골격 규칙: 보편 카드 명령은 누구나, self 액션은 본인, 그 외는
  // 액터가 (a) 해당 카드군을 보유하거나 (b) 발령직무 중 하나를 맡고 있으면 통과.
  if (command.shared_by_all_characters) return true;
  if (command.issuer_scope === 'self') return true;
  const cardGroups = Array.isArray(actor?.cardGroups) ? actor.cardGroups : [];
  if (cardGroups.includes(command.category_key)) return true;
  const posts = Array.isArray(actor?.posts) ? actor.posts : [];
  if (command.issuer_posts.some((p) => posts.includes(p))) return true;
  return false;
}

/**
 * 명령 권한 게이트 검증(골격). actor 는 다음 형태를 기대한다:
 *   { power, rank, posts:[postJa], cardGroups:[categoryKey], pcp, mcp, atVenue, hasFief }
 * 반환: { allowed, denies:[code], command } — 실제 실행은 하지 않는다.
 *
 * options.enforceAuthority=false 면 직무·카드 게이트를 경고로만 처리한다(정본 미완 구간용).
 */
export function authorizeStrategyCommand(ref, actor = {}, options = {}) {
  const { enforceAuthority = true } = options;
  const command = typeof ref === 'object' && ref?.slug ? ref : getStrategyCommand(ref);
  if (!command) return { allowed: false, denies: [DENY.UNKNOWN_COMMAND], command: null };

  const denies = [];
  const warnings = [];

  // 1. 진영. 별표 명령은 대부분 both; target_faction 은 대상이지 발령 제약이 아니다.
  if (command.faction !== 'both') {
    const faction = FACTION_BY_POWER[actor?.power];
    if (faction !== command.faction) denies.push(DENY.WRONG_FACTION);
  }

  // 2. 계급. 명령별 최소 계급은 정본 미확보(required_rank=null) → 값이 있을 때만 게이트.
  if (Number.isInteger(command.required_rank)) {
    if (!Number.isInteger(actor?.rank) || actor.rank < command.required_rank) {
      denies.push(DENY.INSUFFICIENT_RANK);
    }
  }

  // 3. 직무/카드 권한.
  if (!holdsAuthority(actor, command)) {
    if (enforceAuthority) denies.push(DENY.NO_AUTHORITY);
    else warnings.push(DENY.NO_AUTHORITY);
  }

  // 4. CP. 풀 미확정이면 생략(unresolved).
  const cost = cpCost(command);
  const balance = poolBalance(actor, command.cp_pool);
  if (cost > 0 && balance != null && balance < cost) denies.push(DENY.INSUFFICIENT_CP);

  // 5. 장소(士官学校 등).
  if (command.venue_ja && actor?.atVenue !== command.venue_ja) denies.push(DENY.WRONG_VENUE);

  // 6. 봉토 요건(狩猟).
  if (command.requires_fief && !actor?.hasFief) denies.push(DENY.NO_FIEF);

  return { allowed: denies.length === 0, denies, warnings, command };
}

/**
 * 명령 실행 — 다음 배치 스텁. 게임로직(부대 이동/인사/정치 효과)은 미구현이다.
 * 권한 게이트를 먼저 통과시키고, 통과분은 not-implemented 상태를 반환한다.
 */
export function executeStrategyCommand(ref, actor = {}, params = {}, options = {}) {
  const verdict = authorizeStrategyCommand(ref, actor, options);
  if (!verdict.allowed) {
    return { status: 'denied', denies: verdict.denies, slug: verdict.command?.slug ?? null };
  }
  return {
    status: 'not-implemented',
    slug: verdict.command.slug,
    name_ja: verdict.command.name_ja,
    note: '권한 게이트 통과. result 로직은 다음 배치(command result)에서 구현.',
    params,
  };
}
