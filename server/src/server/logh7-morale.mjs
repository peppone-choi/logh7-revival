// 艦隊最大士気 + 저사기 지휘불가 — Phase B §B4 3.3.
// 캐논(p14-15): 統率(PCP index0)이 艦隊最大士気와 降伏勧告 성공률을 좌우. (p47-48) 저사기/混乱 유닛은 지휘불가.
// 상한 곡선·저사기 임계는 매뉴얼 수치 미수록 → **SERVER DESIGN**(규칙만 캐논). 순수 함수만 제공:
// 지휘 게이트를 기존 명령 경로(ChangeMode/Authority/Encourage)에 실제 적용하는 통합은 회귀 위험이 커
// 별도 증분으로 보류한다(여기선 판정 함수만).

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const MORALE_MAX = 100;
export const MORALE_FLOOR_CAP = 50; // SERVER DESIGN: 統率 0이어도 보장되는 최저 사기 상한
export const LOW_MORALE_THRESHOLD = 20; // SERVER DESIGN: 이 미만은 지휘불가

/**
 * 사령관 統率에 따른 艦隊最大士気 상한. 統率 0→FLOOR_CAP, 100→MORALE_MAX (선형, SERVER DESIGN).
 * @param {number} leadership 0..100
 */
export function fleetMaxMorale(leadership) {
  const lead = clamp(Number(leadership) || 0, 0, 100);
  return Math.round(MORALE_FLOOR_CAP + (MORALE_MAX - MORALE_FLOOR_CAP) * (lead / 100));
}

/** 사기 상승 시 상한(maxMorale)으로 clamp, 하한 0. (EncourageFlagship의 0x7fff clamp를 대체할 순수 헬퍼.) */
export function clampMoraleToMax(morale, maxMorale = MORALE_MAX) {
  return clamp(Number(morale) || 0, 0, Number.isFinite(maxMorale) ? maxMorale : MORALE_MAX);
}

/**
 * 유닛 지휘 가능 여부: 사기 ≥ 임계 && 混乱 0. 저사기/혼란이면 false(명령 거부 또는 skip 대상).
 * @param {{ morale?:number, confusion?:number }} unit
 */
export function canCommand(unit = {}) {
  const morale = Number(unit.morale ?? MORALE_MAX);
  const confusion = Number(unit.confusion ?? 0);
  return morale >= LOW_MORALE_THRESHOLD && confusion === 0;
}
