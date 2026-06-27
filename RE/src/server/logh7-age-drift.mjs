// 연령 효과(年齢効果) 월간 능력치 드리프트 — Phase B §B5 4.6.
// 매뉴얼상 provisional(원작 미구현 추정): 월간(30게임일)으로 능력치가 확률적으로 변동 — 젊으면 향상, 노년이면
// 쇠퇴. 임계 연령·변동 확률·폭은 매뉴얼 수치 미수록 → **SERVER DESIGN**(규칙만). 순수: rolls(능력치별 0..1)를
// 호출자가 주입해 결정론적으로 적용한다(state.rng 연동은 호출자 몫). 8능력치(PCP/MCP) 배열 대상.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const AGE_YOUNG = 30; // SERVER DESIGN: 이 미만은 향상 경향
export const AGE_OLD = 50; // SERVER DESIGN: 이 초과는 쇠퇴 경향
export const DRIFT_CHANCE = 0.1; // SERVER DESIGN: 능력치별 월간 변동 확률
export const ABILITY_MIN = 0;
export const ABILITY_MAX = 100;

/** 연령에 따른 드리프트 방향: 젊으면 +1, 전성기면 0, 노년이면 -1. */
export function ageDriftDirection(age) {
  const a = Number(age) || 0;
  if (a > 0 && a < AGE_YOUNG) return 1;
  if (a > AGE_OLD) return -1;
  return 0;
}

/**
 * 월간 연령 드리프트 적용(순수). 방향이 0이면 변화 없음. 각 능력치는 rolls[i] < DRIFT_CHANCE일 때만 ±1,
 * 0..100 클램프. rolls 미제공 시 변동 없음(보수적).
 * @param {number[]} abilities 8능력치
 * @param {number} age
 * @param {number[]} [rolls] 능력치별 0..1 난수
 * @returns {number[]} 새 능력치 배열
 */
export function applyAgeDrift(abilities = [], age = 0, rolls = []) {
  const dir = ageDriftDirection(age);
  if (dir === 0) return [...abilities];
  return abilities.map((v, i) => {
    const roll = Number(rolls[i] ?? 1);
    if (roll < DRIFT_CHANCE) return clamp((Number(v) || 0) + dir, ABILITY_MIN, ABILITY_MAX);
    return Number(v) || 0;
  });
}
