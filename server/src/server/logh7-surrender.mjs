// 降伏勧告(Surrender recommendation) — Phase B §B4 3.4.
// 캐논(p14-15): 성공률은 사령관 統率(PCP index0)이 좌우. 성공 시 적 유닛은 격침이 아니라 전투 이탈/접수(무력화).
// 統率→성공률 곡선·표적 사기 가중치는 매뉴얼 수치 미수록 → **SERVER DESIGN**(규칙만 캐논). 순수 함수:
// 실제 faction 전환/제거 + 점령측 평가포인트는 호출자(command-engine)가 한다. rng는 roll로 주입(재현성).

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// SERVER DESIGN 가중치: 統率과 표적 사기약화를 반반 반영.
export const SURRENDER_LEADERSHIP_WEIGHT = 0.5;
export const SURRENDER_MORALE_WEIGHT = 0.5;

/**
 * 항복 성공 확률(0..1). 統率(0..100) 높을수록↑, 표적 사기(0..100) 낮을수록↑.
 * @param {number} leadership 권고 사령관 統率
 * @param {{ morale?:number }} [target] 표적(사기; 기본 100=온전)
 */
export function surrenderChance(leadership, target = {}) {
  const lead = clamp01((Number(leadership) || 0) / 100);
  const morale = Math.max(0, Math.min(100, Number(target.morale ?? 100)));
  const moraleWeakness = 1 - morale / 100; // 사기 낮을수록 큼
  return clamp01(SURRENDER_LEADERSHIP_WEIGHT * lead + SURRENDER_MORALE_WEIGHT * moraleWeakness);
}

/**
 * 항복 권고 판정(순수). roll(0..1)을 호출자가 주입(state.rng) → 재현 가능.
 * @param {{ leadership?:number }} recommender 권고자(旗艦 사령관)
 * @param {{ morale?:number }} target 표적 유닛
 * @param {number} roll 0..1 난수
 * @returns {{ accepted:boolean, chance:number }}
 */
export function resolveSurrender(recommender = {}, target = {}, roll = 1) {
  const chance = surrenderChance(recommender.leadership, target);
  return { accepted: roll < chance, chance };
}
