// 작전계획(作戦計画) — Phase B §B3.
// 캐논: 입안(draft)과 발령(発令/issue)은 별개 단계. 발령 시 타깃 유효성 + 전역 유닛 상한 검증을 통과해야
// 한다(부대에 속한 전 유닛 분의 여유 필요). 30일 결과·소탕(掃討) 보너스는 틱에서 정산. 단계 분리·타깃검증·
// 유닛상한은 規則 캐논, 상한값·보너스 수치는 호출자/SERVER DESIGN. 순수: 상태는 반환값으로만(불변).

export const PLAN_STATUS = Object.freeze({ DRAFT: 'draft', ISSUED: 'issued' });

/** 작전계획 입안(draft 상태). */
export function createOperationPlan({ id = null, target = null, units = [] } = {}) {
  return { id, target, units: [...units], status: PLAN_STATUS.DRAFT };
}

/**
 * 발령 전 검증(순수). 타깃 존재·유효, 유닛 1+개, 전역 유닛 상한 이내.
 * @param {{ target:any, units:any[] }} plan
 * @param {{ validTargets?: Set|null, maxUnits?: number }} [ctx]
 * @returns {{ valid:boolean, errors:string[] }}
 */
export function validateOperationPlan(plan = {}, { validTargets = null, maxUnits = Infinity } = {}) {
  const errors = [];
  const units = Array.isArray(plan.units) ? plan.units : [];
  if (plan.target === null || plan.target === undefined) errors.push('no-target');
  else if (validTargets instanceof Set && !validTargets.has(plan.target)) errors.push('invalid-target');
  if (units.length === 0) errors.push('no-units');
  if (units.length > maxUnits) errors.push('over-unit-cap');
  return { valid: errors.length === 0, errors };
}

/**
 * 작전계획 발령(순수). 이미 발령됨/검증 실패면 발령 거부(상태 그대로). 성공 시 status=issued 사본 반환.
 * @returns {{ issued:boolean, plan:object, errors:string[] }}
 */
export function issuePlan(plan, ctx = {}) {
  if (!plan || plan.status === PLAN_STATUS.ISSUED) {
    return { issued: false, plan, errors: ['already-issued'] };
  }
  const { valid, errors } = validateOperationPlan(plan, ctx);
  if (!valid) return { issued: false, plan, errors };
  return { issued: true, plan: { ...plan, status: PLAN_STATUS.ISSUED }, errors: [] };
}

// ============================================================================
// 작전 목적(作戦目的) + 결과 정산(매뉴얼 pp.38-40 / operations.json, P1 規則 + P2 보너스 수치).
// 캐논 3종: 占領(점령)/防衛(방위)/掃討(소탕). 占領·防衛는 발령 후 30일 시점에 결과 평가(全목표=Full, 1+개=Partial
// ~50%). 掃討는 30일 윈도우 동안 목표 성계 400광년 내 적함 격침마다 +1 보너스 누적. 보너스 분수(1.0/0.5/+1)는
// operations.json _grade P1·partial fraction은 _uncertain(P2 "約50%"). 순수: 상태 변경 없이 정산값만 반환.
// ============================================================================

/** 작전 목적 캐논 3종(operations.json operationPurposes). */
export const OPERATION_PURPOSE = Object.freeze({
  OCCUPATION: 'occupation', // 占領
  DEFENSE: 'defense', // 防衛
  SWEEP: 'sweep', // 掃討
});

// 占領/防衛 결과 보너스 분수(매뉴얼 pp.39-40). full=계획 base 보너스 전액, partial=約50%(_uncertain P2).
const BONUS_FULL = 1.0;
const BONUS_PARTIAL = 0.5; // P2 _uncertain: OCR "約50%"
// 掃討 격침당 보너스 증분 + 유효 사거리(operations.json 掃討 outcome, P2 _uncertain).
const SWEEP_BONUS_PER_KILL = 1; // +1 / 격침 (P2)
export const SWEEP_RANGE_LY = 400; // 목표 성계 400광년(OCR '兆年'=光年 오독, digest §7 P2)

/**
 * 발령된 작전의 30일 시점 결과를 평가한다(순수). 占領/防衛만 30일-후 평가 대상이며 掃討는 윈도우 중 누적이라
 * 여기서는 누적된 sweepKills를 보너스로 환산한다.
 *
 * 占領: 목표 성계 내 행성/요새를 전부 지배하면 Full, 최소 1개면 Partial(~50%), 0이면 보너스 없음.
 * 防衛: 목표 성계 내 전부를 자진영 유지하면 Full, 1개라도 적에 점령당하면 Partial(~50%), 전부 상실 시 보너스 없음.
 * 掃討: 윈도우 동안 격침 적함 수 × +1.
 *
 * @param {{ purpose:string, baseBonus?:number }} plan 발령된 작전(purpose 필수, baseBonus=계획 기본 보너스)
 * @param {{ targetTotal?:number, controlledByActor?:number, lostToEnemy?:number, sweepKills?:number }} [outcome]
 *        targetTotal: 목표 성계 내 행성/요새 총수. controlledByActor: 작전 발령 진영이 지배 중인 수(占領).
 *        lostToEnemy: 적에 점령당한 수(防衛). sweepKills: 윈도우 내 격침 적함 수(掃討).
 * @returns {{ purpose:string, result:'full'|'partial'|'none', bonusFraction:number, bonusPoints:number, _grade:string }}
 */
export function evaluateOperationOutcome(plan = {}, outcome = {}) {
  const purpose = plan.purpose ?? null;
  const baseBonus = Number.isFinite(plan.baseBonus) ? plan.baseBonus : 0;
  const total = Number.isFinite(outcome.targetTotal) ? outcome.targetTotal : 0;

  if (purpose === OPERATION_PURPOSE.SWEEP) {
    const kills = Number.isFinite(outcome.sweepKills) ? Math.max(0, outcome.sweepKills) : 0;
    return {
      purpose,
      result: kills > 0 ? 'full' : 'none',
      bonusFraction: 1.0,
      bonusPoints: kills * SWEEP_BONUS_PER_KILL,
      _grade: 'P2',
    };
  }

  if (purpose === OPERATION_PURPOSE.OCCUPATION) {
    const got = Number.isFinite(outcome.controlledByActor) ? Math.max(0, outcome.controlledByActor) : 0;
    let result = 'none';
    let frac = 0;
    if (total > 0 && got >= total) { result = 'full'; frac = BONUS_FULL; }
    else if (got >= 1) { result = 'partial'; frac = BONUS_PARTIAL; }
    return { purpose, result, bonusFraction: frac, bonusPoints: baseBonus * frac, _grade: 'P2' };
  }

  if (purpose === OPERATION_PURPOSE.DEFENSE) {
    const lost = Number.isFinite(outcome.lostToEnemy) ? Math.max(0, outcome.lostToEnemy) : 0;
    let result = 'none';
    let frac = 0;
    if (lost === 0 && total > 0) { result = 'full'; frac = BONUS_FULL; }
    else if (lost < total) { result = 'partial'; frac = BONUS_PARTIAL; } // 일부 상실=목표 1+ 유지
    return { purpose, result, bonusFraction: frac, bonusPoints: baseBonus * frac, _grade: 'P2' };
  }

  // 목적 미지정/미상: 보너스 없음(규칙 외).
  return { purpose, result: 'none', bonusFraction: 0, bonusPoints: 0, _grade: 'P2' };
}
