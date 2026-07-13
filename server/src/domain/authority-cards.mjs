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
