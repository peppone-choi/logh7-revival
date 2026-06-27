/**
 * Galactic Empire peerage (작위) + fief (봉토) model — a real shipped game system (recovered from the
 * client constmsg: title ladder group 0x03, descriptions 0x06, grant/revoke commands group 0x00/0x12;
 * see content/manual/imperial-titles.json, docs RE). The revival server had no title/fief logic; this
 * adds the authoritative rules as a pure, testable module. Wire into logh7-command-engine for the
 * 작위 수여 / 봉토 수여 / 봉토 직할 commands; income feeds NotifyBaseParameter.
 *
 * Provenance: the title ladder + privileges are P1/P2 (shipped constmsg vocabulary + manual rules).
 * Numeric income/tax tuning is P3 (no original-server numbers) — expose via defines, not as canon data.
 */
import { readFileSync } from 'node:fs';

let TITLES = null;
function data() {
  if (TITLES) return TITLES;
  try {
    TITLES = JSON.parse(readFileSync(new URL('../../content/manual/imperial-titles.json', import.meta.url), 'utf8'));
  } catch {
    TITLES = { titleLadder: [], fief: {}, commands: [] };
  }
  return TITLES;
}

/** The hereditary title ladder, rank 1 (Duke) .. 7 (Commoner). */
export function titleLadder() {
  return (data().titleLadder ?? []).map((t) => ({ ...t }));
}

/** Title rank by name (공작=1 .. 남작=5, 제국기사=6, 평민=7); null if unknown. */
export function titleRank(name) {
  const t = (data().titleLadder ?? []).find((x) => x.name_ko === name || x.name_en === name);
  return t ? t.rank : null;
}

/**
 * Resolve a title to its display name (작위명) for the 0x0323/0x0356 character record `titlename`.
 * Accepts either a ladder rank number (1=공작 .. 7=평민, matching the 0x1008 create form's `title`
 * byte) or an already-resolved name string. Returns '' when the title is the bare commoner (rank 7,
 * which carries no displayed peerage name) or when the input is unknown — so a caller can write a
 * length-0 titlename without a guard. `lang` is 'ko' | 'en' (default 'ko', matching the client locale).
 *
 * @param {number|string|null|undefined} title
 * @param {{ lang?: ('ko'|'en') }} [opts]
 * @returns {string}
 */
export function titleName(title, { lang = 'ko' } = {}) {
  if (title == null) return '';
  const ladder = data().titleLadder ?? [];
  let entry = null;
  if (typeof title === 'number' || /^\d+$/.test(String(title))) {
    const rank = Number(title);
    if (rank <= 0) return ''; // 0 = no title (untitled / not yet ennobled)
    entry = ladder.find((x) => x.rank === rank) ?? null;
  } else {
    const key = String(title);
    entry = ladder.find((x) => x.name_ko === key || x.name_en === key) ?? null;
    if (!entry) return key; // already a display string we don't recognise — pass it through verbatim
  }
  if (!entry) return '';
  // The bare commoner (평민, rank 7) is not a displayed peerage title; render it as empty.
  if (entry.rank >= 7) return '';
  const field = lang === 'en' ? 'name_en' : 'name_ko';
  return String(entry[field] ?? entry.name_ko ?? '');
}

/** A noble of this title may hold a fief? (Baron 남작 rank 5 and above, i.e. rank <= 5.) */
export function canHoldFief(title) {
  const r = typeof title === 'number' ? title : titleRank(title);
  return Number.isInteger(r) && r >= 1 && r <= 5;
}

const DEFAULT_TUNING = Object.freeze({ taxRatePct: 20, tariffRatePct: 10, baseIncomePerFief: 1000 });

/**
 * Validate a 작위 수여 (grant title) action. Gate (manual): noble birth + a minimum rank.
 * @returns {{ ok:boolean, reason?:string }}
 */
export function validateGrantTitle({ target, newTitle, minMilitaryRank = 1 } = {}) {
  if (!target) return { ok: false, reason: 'no target' };
  if (target.socialClass != null && target.socialClass === 'commoner') {
    return { ok: false, reason: '귀족 출신이 아님 (commoner cannot receive a title)' };
  }
  if (titleRank(newTitle) == null) return { ok: false, reason: `unknown title ${newTitle}` };
  if (Number.isInteger(target.rankId) && target.rankId < minMilitaryRank) {
    return { ok: false, reason: '계급 미달 (rank too low for a title)' };
  }
  return { ok: true };
}

/**
 * Validate a 봉토 수여 (grant fief) action. Gate: target holds a Baron-or-higher title; the fief is an
 * ownable planet/fortress.
 */
export function validateGrantFief({ target, base } = {}) {
  if (!target) return { ok: false, reason: 'no target' };
  if (!canHoldFief(target.title ?? target.titleRank)) {
    return { ok: false, reason: '남작 이상 작위 필요 (fief requires Baron+ title)' };
  }
  if (!base || base.id == null) return { ok: false, reason: 'no base/planet selected as fief' };
  if (base.owner != null && base.owner !== 0) return { ok: false, reason: '이미 다른 영주의 봉토 (base already owned)' };
  return { ok: true };
}

/**
 * Fief income for a lord = sum over their fiefs of (base economy * taxRate). P3 tuning via `tuning`
 * (overridable by a mod's defines). Returns the per-tick income the lord receives.
 */
export function fiefIncome(fiefs = [], tuning = {}) {
  const t = { ...DEFAULT_TUNING, ...tuning };
  let income = 0;
  for (const f of fiefs) {
    const econ = Number.isFinite(f?.economy) ? f.economy : t.baseIncomePerFief;
    const rate = Number.isFinite(f?.taxRatePct) ? f.taxRatePct : t.taxRatePct;
    income += Math.round((econ * rate) / 100);
  }
  return income;
}

/** Apply a fief grant to a base + a lord (pure): returns the updated {base, lord}. */
export function applyGrantFief(base, lord) {
  return {
    base: { ...base, owner: lord.id, isFief: true },
    lord: { ...lord, fiefs: [...(lord.fiefs ?? []), base.id] },
  };
}

/** Revoke a fief back to direct (帝室直轄) control: clears base ownership, removes from the lord. */
export function applyRevokeFief(base, lord) {
  return {
    base: { ...base, owner: 0, isFief: false },
    lord: { ...lord, fiefs: (lord.fiefs ?? []).filter((id) => id !== base.id) },
  };
}

export const IMPERIAL_TITLE_TUNING_DEFAULTS = DEFAULT_TUNING;
