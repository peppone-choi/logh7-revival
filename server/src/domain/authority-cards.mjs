// 권한카드 도메인 계약. 클라이언트 runtime slot은 card kind 숫자를 ordinal로 직접 사용한다.

export const MAX_AUTHORITY_CARDS = 16;
export const MAX_RUNTIME_CARD_KIND = 299;
export const PERSONAL_CARD_KIND = 0;
export const NORMAL_EMPIRE_CAPTAIN_CARD_KIND = 59;
export const NORMAL_ALLIANCE_CAPTAIN_CARD_KIND = 195;
export const CAPTAIN_NAVIGATION_COMMAND_FACTORY_IDS = Object.freeze([0x002b, 0x002d]);

const NORMAL_CAPTAIN_CARD_KINDS = Object.freeze([
  NORMAL_EMPIRE_CAPTAIN_CARD_KIND,
  NORMAL_ALLIANCE_CAPTAIN_CARD_KIND,
]);

// P0 constmsg group3 숫자 조인이 정상 제국/동맹 함장 kind 59/195를 식별한다.
// P1 공식 매뉴얼의 함장 카드 설명과 전략 UI는 워프/성계 내 항행을 함장 카드 권한으로 묶는다.
const PROVENANCE = Object.freeze({
  PERSONAL: 'constmsg-group3:p0-personal',
  EMPIRE_CAPTAIN: 'p0-constmsg-group3+p1-manual:normal-empire-captain',
  ALLIANCE_CAPTAIN: 'p0-constmsg-group3+p1-manual:normal-alliance-captain',
});

// grant 가 허용하는 kind. P0/P1 근거가 있는 보편 카드만 — 반란 variant(123/257)와
// factory 계열(0x41/0x43)은 camp 근거가 없어 제외한다.
export const GRANTABLE_CARD_KINDS = Object.freeze([
  PERSONAL_CARD_KIND,
  NORMAL_EMPIRE_CAPTAIN_CARD_KIND,
  NORMAL_ALLIANCE_CAPTAIN_CARD_KIND,
]);

const GRANTABLE_CARD_PROVENANCE = Object.freeze({
  [PERSONAL_CARD_KIND]: PROVENANCE.PERSONAL,
  [NORMAL_EMPIRE_CAPTAIN_CARD_KIND]: PROVENANCE.EMPIRE_CAPTAIN,
  [NORMAL_ALLIANCE_CAPTAIN_CARD_KIND]: PROVENANCE.ALLIANCE_CAPTAIN,
});

function seededCard(ordinal, kind, provenance) {
  return { ordinal, kind, spot: 0, provenance };
}

/** P0/P1로 확인된 보편 카드만 시드한다. 반란군 variant는 camp 근거가 없어 제외한다. */
export function seedAuthorityCardsForPower(power) {
  const cards = [seededCard(0, PERSONAL_CARD_KIND, PROVENANCE.PERSONAL)];
  if (power === 2) {
    cards.push(seededCard(1, NORMAL_EMPIRE_CAPTAIN_CARD_KIND, PROVENANCE.EMPIRE_CAPTAIN));
  } else if (power === 3) {
    cards.push(seededCard(1, NORMAL_ALLIANCE_CAPTAIN_CARD_KIND, PROVENANCE.ALLIANCE_CAPTAIN));
  }
  return cards;
}

function requireInteger(value, message, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(message);
  }
  return value;
}

/** 영속/세션 경계에서 카드 배열을 한 번 정규화한다. null만 personal fallback이다. */
export function normalizeAuthorityCards(cards, { fallbackToPersonal = true } = {}) {
  if (cards == null) {
    return fallbackToPersonal ? seedAuthorityCardsForPower(null) : [];
  }
  if (!Array.isArray(cards)) throw new TypeError('authorityCards must be an array');
  if (cards.length > MAX_AUTHORITY_CARDS) {
    throw new RangeError(`at most ${MAX_AUTHORITY_CARDS} authority cards are allowed`);
  }

  const ordinals = new Set();
  const kinds = new Set();
  const normalized = cards.map((card, index) => {
    if (card == null || typeof card !== 'object') {
      throw new TypeError(`authorityCards[${index}] must be an object`);
    }
    const ordinal = requireInteger(
      card.ordinal ?? index,
      `authorityCards[${index}].ordinal must be an integer from 0 to 15`,
      0,
      MAX_AUTHORITY_CARDS - 1,
    );
    const kind = requireInteger(
      card.kind,
      `authorityCards[${index}].kind must be an integer from 0 to ${MAX_RUNTIME_CARD_KIND}`,
      0,
      MAX_RUNTIME_CARD_KIND,
    );
    const spot = requireInteger(
      card.spot ?? 0,
      `authorityCards[${index}].spot must be an unsigned 32-bit integer`,
      0,
      0xffffffff,
    );
    const provenance = String(card.provenance ?? '').trim();
    if (!provenance) throw new TypeError(`authorityCards[${index}].provenance is required`);
    if (ordinals.has(ordinal)) throw new RangeError(`duplicate authority card ordinal ${ordinal}`);
    if (kinds.has(kind)) throw new RangeError(`duplicate authority card kind ${kind}`);
    ordinals.add(ordinal);
    kinds.add(kind);
    return { ordinal, kind, spot, provenance };
  });
  normalized.sort((left, right) => left.ordinal - right.ordinal);
  return normalized;
}

/**
 * seed 와 revoke 를 가르는 단일 게이트. 카드 배열이 들어오는 모든 경계
 * (엔티티 생성 / JSON store 로드-백필 / store.addCharacter)는 이 함수를 통과한다.
 *
 * - `undefined`/`null` (필드 부재) → power 별 canonical grant 를 시드한다.
 * - `[]` (명시적 빈 배열)          → 의도적 revoke. 카드 없음을 그대로 유지한다.
 */
export function resolveAuthorityCards(cards, power) {
  if (cards == null) {
    return normalizeAuthorityCards(seedAuthorityCardsForPower(power));
  }
  return normalizeAuthorityCards(cards);
}

/** 승인된 kind 를 부여한다. 이미 있으면 무변화(멱등). ordinal 은 뒤에 이어붙인다. */
export function grantAuthorityCard(cards, kind, { spot = 0 } = {}) {
  if (!GRANTABLE_CARD_KINDS.includes(kind)) {
    throw new RangeError(`authority card kind ${kind} is not grantable`);
  }
  const current = normalizeAuthorityCards(cards, { fallbackToPersonal: false });
  if (current.some((card) => card.kind === kind)) return current;
  const granted = [
    ...current,
    {
      ordinal: current.length,
      kind,
      spot: requireInteger(spot, 'spot must be an unsigned 32-bit integer', 0, 0xffffffff),
      provenance: GRANTABLE_CARD_PROVENANCE[kind],
    },
  ];
  return normalizeAuthorityCards(granted, { fallbackToPersonal: false });
}

/** kind 를 회수하고 남은 카드의 ordinal 을 0..n-1 로 재압축한다. 없는 kind 면 무변화. */
export function revokeAuthorityCard(cards, kind) {
  const current = normalizeAuthorityCards(cards, { fallbackToPersonal: false });
  const remaining = current.filter((card) => card.kind !== kind);
  if (remaining.length === current.length) return current;
  return normalizeAuthorityCards(
    remaining.map((card, index) => ({ ...card, ordinal: index })),
    { fallbackToPersonal: false },
  );
}

/** 0305/0307용 0..maxKind 행. 검증된 항행 명령은 정상 함장 kind 59/195에만 둔다. */
export function buildAuthorityCommandRows(authorityCards) {
  const cards = normalizeAuthorityCards(authorityCards);
  if (cards.length === 0) return [];
  const kinds = new Set(cards.map((card) => card.kind));
  const maxKind = Math.max(...kinds);
  return Array.from({ length: maxKind + 1 }, (_, id) => ({
    id,
    commands: kinds.has(id) && NORMAL_CAPTAIN_CARD_KINDS.includes(id)
      ? [...CAPTAIN_NAVIGATION_COMMAND_FACTORY_IDS]
      : [],
  }));
}

/**
 * LOGH7-62: 확정된 함장 항행 command factory id 여부. 정본이 확인한 id(0x2b/0x2d)만 true.
 * 미확인 id(예: 0x4f=79)는 false — 어떤 카드로도 승인되지 않는다.
 */
export function isCaptainNavigationCommand(commandId) {
  return CAPTAIN_NAVIGATION_COMMAND_FACTORY_IDS.includes(commandId);
}

/**
 * LOGH7-62: 항행 command 권한 게이트(fail-closed 단일 진입점).
 *
 * 반환 `{ allowed, reason }`:
 *   - 미확인 command(확정 factory id 아님)   → { allowed:false, reason:'unknown-command' }
 *   - 확정 command 이나 카드 권한 부재        → { allowed:false, reason:'no-authority' }
 *   - 확정 command 이고 카드가 부여함          → { allowed:true,  reason:null }
 *
 * 미확인 command 는 카드 보유 여부와 무관하게 항상 거부한다(조용한 실행·크래시 금지).
 */
export function authorizeNavigationCommand(authorityCards, commandId) {
  if (!isCaptainNavigationCommand(commandId)) {
    return { allowed: false, reason: 'unknown-command' };
  }
  const granted = buildAuthorityCommandRows(authorityCards)
    .some((row) => row.commands.includes(commandId));
  return granted
    ? { allowed: true, reason: null }
    : { allowed: false, reason: 'no-authority' };
}
