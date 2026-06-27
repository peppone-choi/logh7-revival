// 계급 사다리 5법칙 비교자 + 정원캡 — Phase B §B5 4.4. (캐논 매뉴얼 p35, p266-284: P1 확정.)
//
// 진급 순서(seniority)는 5법칙을 순차 적용해 결정한다(매뉴얼 p35):
//   (1) 功績(achievement)            — 높을수록 상위.
//   (2) 爵位(peerage title)          — **帝国軍 military 트랙에만** 적용(동맹/정치가는 무시). 높은 작위 상위.
//   (3) 최고훈장순(decorations)      — 원작 훈장 **未実装**이므로 **항상 SKIP**(사다리 법칙3, [[logh7-combat-death]]
//                                       의 평가포인트와 무관). 절대 비교에 넣지 않는다.
//   (4) 影響力(influence)            — 높을수록 상위.
//   (5) 전 파라미터 합(paramSum)     — 높을수록 상위(8능력치 합).
// 軍人(military)/政治家(political) 분리 사다리이며, 작위 법칙은 軍人 트랙 + 帝国(empire)일 때만 쓴다.
//
// 정원캡(headcount, p273-284): 元帥5 / 上級大将5(제국만) / 大将10 / 中将20 / 少将40 / 准将80 / 大佐이하 무제한.
// 진급은 목표 계급의 정원이 차 있으면 막힌다(enforceHeadcount). 전부 순수 함수 — 와이어/라이브 무관.

import { normalizeFaction } from './logh7-rank-table.mjs';

/**
 * 계급별 정원캡(진영별). 키=계급 id(14=元帥 .. 9=准将), 값={empire,alliance}. ≤8(大佐 이하)은 항목 없음=무제한.
 * 上級大将(13)은 제국 전용이라 alliance=0. (매뉴얼 p273-284, P1.)
 */
export const RANK_HEADCOUNT = Object.freeze({
  14: { empire: 5, alliance: 5 }, // 元帥
  13: { empire: 5, alliance: 0 }, // 上級大将 — 제국 전용
  12: { empire: 10, alliance: 10 }, // 大将
  11: { empire: 20, alliance: 20 }, // 中将
  10: { empire: 40, alliance: 40 }, // 少将
  9: { empire: 80, alliance: 80 }, // 准将
});

/**
 * 목표 계급의 정원캡(해당 진영). 항목 없으면 Infinity(大佐 이하 무제한).
 * @param {number} rank 계급 id(1..14)
 * @param {string} faction 진영
 * @returns {number}
 */
export function headcountCap(rank, faction) {
  const f = normalizeFaction(faction) || 'empire';
  const row = RANK_HEADCOUNT[rank];
  if (!row) return Infinity;
  return Number.isFinite(row[f]) ? row[f] : Infinity;
}

/**
 * 목표 계급으로 진급 가능한가(정원캡 비교). 현재 그 계급 인원수가 캡 미만이어야 한다.
 * @param {number} rank 목표 계급 id
 * @param {string} faction 진영
 * @param {number} currentCountAtRank 현재 그 계급의 인원수
 * @returns {boolean}
 */
export function canPromoteTo(rank, faction, currentCountAtRank = 0) {
  return (Number(currentCountAtRank) || 0) < headcountCap(rank, faction);
}

// 작위(爵位) 서열 점수: 높은 작위일수록 큰 값(비교 단순화). 작위 ladder는 1=공작(최상) .. 7=평민, 0/null=무작위.
// 무작위(0/null)는 가장 낮게(=0), 작위 있으면 (8 - title)로 뒤집어 공작(1)→7, 평민(7)→1.
function titleScore(title) {
  const t = Number(title);
  if (!Number.isInteger(t) || t < 1 || t > 7) return 0; // 무작위/이름문자열 등
  return 8 - t;
}

/**
 * 5법칙 비교자(순수). a가 b보다 **상위(senior)**면 음수, 하위면 양수, 동률이면 0 — Array.sort에 그대로 쓰면
 * 상위가 앞으로 정렬된다. faction=empire & track=military일 때만 작위(법칙2)를 비교에 넣는다(법칙3은 항상 SKIP).
 * 캐릭터는 {achievement, title, influence, paramSum, abilities?}를 제공(없으면 0). abilities 배열이 있으면
 * paramSum 미지정 시 그 합을 쓴다.
 * @param {object} a
 * @param {object} b
 * @param {{ faction?: string, track?: 'military'|'political' }} [opts]
 * @returns {number}
 */
export function compareLadder(a = {}, b = {}, { faction = 'empire', track = 'military' } = {}) {
  const f = normalizeFaction(faction) || 'empire';
  const paramOf = (c) => (Number.isFinite(c.paramSum)
    ? c.paramSum
    : (Array.isArray(c.abilities) ? c.abilities.reduce((s, v) => s + (Number(v) || 0), 0) : 0));
  // (1) 功績 — 높을수록 상위.
  const ach = (Number(b.achievement) || 0) - (Number(a.achievement) || 0);
  if (ach !== 0) return ach;
  // (2) 爵位 — 帝国軍(empire & military)에만. 높은 작위 상위.
  if (f === 'empire' && track === 'military') {
    const tit = titleScore(b.title) - titleScore(a.title);
    if (tit !== 0) return tit;
  }
  // (3) 최고훈장순 — 원작 未実装 → 항상 SKIP.
  // (4) 影響力 — 높을수록 상위.
  const inf = (Number(b.influence) || 0) - (Number(a.influence) || 0);
  if (inf !== 0) return inf;
  // (5) 전 파라미터 합 — 높을수록 상위.
  return paramOf(b) - paramOf(a);
}

/**
 * 같은 계급(또는 트랙)의 캐릭터들을 5법칙으로 서열 정렬(상위가 앞). 원배열 불변(복사 정렬).
 * @param {object[]} chars
 * @param {{ faction?: string, track?: 'military'|'political' }} [opts]
 * @returns {object[]}
 */
export function sortLadder(chars = [], opts = {}) {
  return [...chars].sort((a, b) => compareLadder(a, b, opts));
}

/**
 * 자동진급 후보 산출(순수, 캐논 §5.3): 매월 각 사다리(faction×track×rank)의 **#1**(5법칙 최상위)을 다음
 * 계급으로 진급시킨다. 단 **大佐 이하**(rank ≤ maxAutoRank)만 대상이고, 목표 계급의 정원에 여유가 있어야
 * 한다(canPromoteTo). 적용(setRank·merit)은 호출자(personnel.runMonthlyPromotions) 몫 — 여기선 후보만 반환.
 * @param {object[]} chars {id, rank, faction, achievement, title, ...}
 * @param {{ maxAutoRank?: number, trackOf?: (c:object)=>('military'|'political') }} [opts]
 * @returns {Array<{ charId:number, fromRank:number, toRank:number, faction:string, track:string }>}
 */
export function autoPromoteLadders(chars = [], { maxAutoRank = 8, trackOf = () => 'military' } = {}) {
  /** @type {Map<string, {faction:string, track:string, rank:number, chars:object[]}>} */
  const groups = new Map();
  for (const c of chars) {
    const rank = Number(c.rank) || 0;
    if (rank <= 0 || rank > maxAutoRank) continue; // 大佐 이하만 자동진급(캐논)
    const faction = normalizeFaction(c.faction) || 'empire';
    const track = trackOf(c) || 'military';
    const key = `${faction}|${track}|${rank}`;
    if (!groups.has(key)) groups.set(key, { faction, track, rank, chars: [] });
    groups.get(key).chars.push(c);
  }
  const promotions = [];
  for (const g of groups.values()) {
    const top = sortLadder(g.chars, { faction: g.faction, track: g.track })[0];
    if (!top) continue;
    const toRank = g.rank + 1;
    const countAtTarget = chars.filter((c) => (Number(c.rank) || 0) === toRank && normalizeFaction(c.faction) === g.faction).length;
    if (!canPromoteTo(toRank, g.faction, countAtTarget)) continue; // 목표 계급 정원 초과면 자동진급 보류
    promotions.push({ charId: top.id, fromRank: g.rank, toRank, faction: g.faction, track: g.track });
  }
  return promotions;
}
