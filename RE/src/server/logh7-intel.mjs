// 첩보·쿠데타 — Phase B §B6.
// 캐논: 첩보(잠입/정보/사보타주/선동/침입) 성공률은 情報 능력이 좌우. 쿠데타는 叛乱忠誠度가 임계를 넘고,
// 해당 진영이 "완전승리(decisive victory)"가 아닐 때만 가능(완전승리 시 쿠데타 불가 게이트). 성공률 곡선·
// 누적 폭·임계는 매뉴얼 수치 미수록 → **SERVER DESIGN**(규칙만 캐논). 순수: roll/delta를 호출자가 주입.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);

export const COUP_LOYALTY_MAX = 100;
export const COUP_LOYALTY_THRESHOLD = 70; // SERVER DESIGN: 이 이상이어야 쿠데타 가능
// SERVER DESIGN 가중치: 기본 성공률 + 情報 기여 − 치안 저항.
export const ESPIONAGE_BASE = 0.3;
export const ESPIONAGE_INTEL_WEIGHT = 0.6;
export const ESPIONAGE_SECURITY_WEIGHT = 0.4;

/**
 * 첩보 성공 확률(0..1). 情報(0..100) 높을수록↑, 표적 治安(0..100) 높을수록↓.
 * @param {number} intel 잠입자 情報 능력
 * @param {number} [targetSecurity] 표적 治安維持率
 */
export function espionageChance(intel, targetSecurity = 0) {
  const i = clamp01((Number(intel) || 0) / 100);
  const sec = clamp01((Number(targetSecurity) || 0) / 100);
  return clamp01(ESPIONAGE_BASE + ESPIONAGE_INTEL_WEIGHT * i - ESPIONAGE_SECURITY_WEIGHT * sec);
}

/** 첩보 판정(순수). roll(0..1) 호출자 주입 → 재현 가능. */
export function resolveEspionage(intel, targetSecurity, roll = 1) {
  const chance = espionageChance(intel, targetSecurity);
  return { success: roll < chance, chance };
}

/** 叛乱忠誠度 누적(叛意/謀議/説得 등으로 ±), 0..MAX 클램프. */
export function applyCoupLoyalty(current, delta) {
  return clamp((Number(current) || 0) + (Number(delta) || 0), 0, COUP_LOYALTY_MAX);
}

/**
 * 쿠데타 개시 가능 여부: 叛乱忠誠度 ≥ 임계(순수 충성 게이트).
 *
 * ⚠️ 인과 정정(감사 2026-06-20 L129): 이전엔 `if(decisiveVictory)return false`로 완전승리 진영의 쿠데타를
 * 여기서 막았으나, 캐논(p78)의 인과는 "완전승리→쿠데타 불가"가 아니라 "쿠데타 진행 중→완전승리(세션 종료)
 * 보류"다. 따라서 decisiveVictory 게이트는 세션-종료 측(world-state.evaluateEnding의 activeCoups 박탈)으로
 * 이주했고, 본 함수는 충성 임계만 본다. 런타임에 "이 진영이 이미 완전승리라 쿠데타 무의미"를 표시해야 하는
 * 소비처(coup.canExecute / isCoupConduct)는 자기 측에서 명시적으로 decisiveVictory를 검사한다(아래 isCoupConduct).
 * @param {{ loyalty?:number }} state
 */
export function canStartCoup({ loyalty = 0 } = {}) {
  return (Number(loyalty) || 0) >= COUP_LOYALTY_THRESHOLD;
}

// ---------------------------------------------------------------------------------------------------
// 첩보/쿠데타 상태 — 캐릭터별 叛乱忠誠度(coup-loyalty) 누적 소스. 순수 모듈 자체엔 상태가 없었으므로
// (AU-3, opcode-wiring B-2) 표시필드 시드를 위한 최소 상태 컨테이너를 둔다. 클라 opcode 부재/미확정이라
// (logh7-opcode-wiring §C-2/C-3) 와이어 배선이 아닌 **서버 내부 누적값**만 보관 → personnel 빌더가
// 옵셔널로 읽어 0x0356 coup_conduct·0x0358 rebellion 표시필드에 시드(읽지 않으면 기본 0, 동작 불변).
// ---------------------------------------------------------------------------------------------------

/**
 * 첩보/쿠데타 상태 생성. 캐릭터 id별 叛乱忠誠度(0..MAX)와 유닛 id별 反乱 표시값(0..255)을 누적한다.
 * 모두 순수 누적이며 클라 발신 없이 서버가 채운다. 비어 있으면 모든 조회가 0을 돌려준다(기본 불변).
 */
export function createIntelState() {
  /** @type {Map<number, number>} 캐릭터 id → 叛乱忠誠度(coup-loyalty). isCoupConduct 표시필드 시드용. */
  const coupLoyalty = new Map();
  /** @type {Map<number, number>} 유닛(부대) id → 叛乱忠誠度. 説得(persuadeUnit) 대상 — 캐릭터 키스페이스와
   * 분리(이전엔 둘이 같은 coupLoyalty Map을 공유해 유닛id==캐릭터id 충돌 시 coup_conduct 플래그 오염). */
  const unitLoyalty = new Map();
  /** @type {Map<number, number>} 유닛(outfit) id → rebellion 표시값 */
  const rebellion = new Map();

  return {
    coupLoyalty,
    unitLoyalty,
    rebellion,

    /** 캐릭터의 叛乱忠誠度를 delta만큼 누적(0..MAX 클램프). 누적 후 값 반환. */
    addCoupLoyalty(characterId, delta) {
      const key = characterId >>> 0;
      const next = applyCoupLoyalty(coupLoyalty.get(key) ?? 0, delta);
      coupLoyalty.set(key, next);
      return next;
    },

    /** 캐릭터의 叛乱忠誠度 조회(미시드=0). */
    getCoupLoyalty(characterId) {
      return coupLoyalty.get(characterId >>> 0) ?? 0;
    },

    /** 유닛(부대)의 叛乱忠誠度를 delta만큼 누적(0..MAX). 説得(coup.persuadeUnit)이 사용 — 캐릭터 키와 별개. */
    addUnitLoyalty(unitId, delta) {
      const key = unitId >>> 0;
      const next = applyCoupLoyalty(unitLoyalty.get(key) ?? 0, delta);
      unitLoyalty.set(key, next);
      return next;
    },

    /** 유닛의 叛乱忠誠度 조회(미시드=0). */
    getUnitLoyalty(unitId) {
      return unitLoyalty.get(unitId >>> 0) ?? 0;
    },

    /**
     * 캐릭터가 쿠데타 모의 상태(叛意)인지: 叛乱忠誠度 ≥ 임계(canStartCoup) && 완전승리 아님.
     * coup_conduct 표시값 시드에 쓰는 파생값(현재는 0/1 플래그로만 노출). decisiveVictory(완전승리) 게이트는
     * canStartCoup에서 빠졌으므로(인과 정정) 표시-시점에 여기서 명시 검사한다 — 완전승리 진영이면 표시 0
     * (쿠데타 표시 무의미). 누적/임계 판정은 순수 canStartCoup, 완전승리 표시 게이트는 소비처(여기) 책임.
     */
    isCoupConduct(characterId, { decisiveVictory = false } = {}) {
      if (decisiveVictory) return 0; // 완전승리 진영: coup_conduct 표시 게이트(표시 무의미)
      return canStartCoup({ loyalty: this.getCoupLoyalty(characterId) }) ? 1 : 0;
    },

    /** 유닛 rebellion 표시값 설정(0..255 클램프). */
    setRebellion(unitId, value) {
      const v = clamp(Number(value) || 0, 0, 0xff);
      rebellion.set(unitId >>> 0, v);
      return v;
    },

    /** 유닛 rebellion 표시값 조회(미시드=0). */
    getRebellion(unitId) {
      return rebellion.get(unitId >>> 0) ?? 0;
    },
  };
}
