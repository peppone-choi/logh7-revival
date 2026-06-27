// 戦闘艇(Fighter) 공중전 — Phase B §B4 3.1. 원작 未実装(p50).
// 캐논(p50): 戦闘艇은 공격력이 낮으나 함선 표적을 감속시키고 적 戦闘艇을 격퇴한다. 발진은 정액 10 物資.
// 對艦(anti-ship): 약한 피해 + 표적 감속(slowFactor). 邀撃(intercept): 양측 戦闘艇 수가 격감.
// 공격력·slow비율·격감수는 매뉴얼에 수치 미수록 → **SERVER DESIGN**(규칙만 캐논). 순수 함수: 상태 변이
// (物資 −10·speedMul·fighters 갱신·notify)는 호출자(command-engine/battle-ops)가 한다.

export const FIGHTER_SUPPLY_COST = 10; // 캐논 p50: 발진 정액 物資
export const FIGHTER_ATTACK_PER = 2; // SERVER DESIGN: 戦闘艇 1기당 對艦 피해
export const FIGHTER_SLOW_FACTOR = 0.7; // SERVER DESIGN: 對艦 시 표적 속도 배율(<1)
export const INTERCEPT_LOSS = 5; // SERVER DESIGN: 邀撃 시 측당 戦闘艇 격감 수

/** 발진 가능 여부(物資 ≥ 정액 10). 순수. */
export function canLaunchFighters(supplies) {
  return (Number(supplies) || 0) >= FIGHTER_SUPPLY_COST;
}

/**
 * 공중전 1회 결과(순수). mode='anti-ship'면 함선 표적 피해+감속, 'intercept'면 양측 戦闘艇 격감.
 * @param {{ fighters?:number }} launcher 발진 모함(戦闘艇 보유 수)
 * @param {{ fighters?:number }} target   표적(함선이면 fighters 무관, 적 모함이면 邀撃 대상)
 * @param {{ mode?: 'anti-ship'|'intercept' }} [opts]
 */
export function computeAirCombat(launcher = {}, target = {}, { mode = 'anti-ship' } = {}) {
  const lf = Math.max(0, Math.floor(Number(launcher.fighters) || 0));
  const tf = Math.max(0, Math.floor(Number(target.fighters) || 0));
  if (mode === 'intercept') {
    return {
      kind: 'intercept',
      launcherFightersAfter: Math.max(0, lf - INTERCEPT_LOSS),
      targetFightersAfter: Math.max(0, tf - INTERCEPT_LOSS),
      supplyCost: FIGHTER_SUPPLY_COST,
    };
  }
  return {
    kind: 'anti-ship',
    damage: lf * FIGHTER_ATTACK_PER,
    slowFactor: FIGHTER_SLOW_FACTOR,
    launcherFightersAfter: lf, // 對艦 출격은 戦闘艇 손실 없음(邀撃에서만 격감)
    targetFightersAfter: tf,
    supplyCost: FIGHTER_SUPPLY_COST,
  };
}
