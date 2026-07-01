// 쿠데타(叛乱) 라이프사이클 — Phase B §B6. logh7-intel.mjs의 프리미티브(叛乱忠誠도 누적·canStartCoup
// 게이트·espionage roll) 위에 캐논 개인/첩보 커맨드 6종의 상태머신을 얹는다.
//
// 캐논(매뉴얼 p69-70 個人, p73-74 諜報, p78 결정승리 게이트, p321 정규군/반란군 분리):
//   叛意 Coup Ringleader (CP640) — 수괴가 되어 모의(conspiracy)를 개시
//   謀議 Conspiracy       (CP640) — 같은 spot 인물을 모의에 포섭(성공률=情報 좌우)
//   説得 Persuade         (CP640) — 자기 유닛의 叛乱忠誠度↑(나중에 반란군으로 이탈)
//   参加 Join Coup        (CP160) — 포섭된 추종자가 참가 확정
//   叛乱 Execute Coup     (CP640) — 발동 → 충성 임계 넘은 유닛이 반란군(별 진영)으로 분리
//   査閲 Inspection       (CP160) — 모의 징후 탐지(査閲자 情報 vs 모의 은폐)
//
// 게이트(캐논): "완전승리(decisive victory) 진영에선 쿠데타 불가"(p78 결정승리 조건 "no coup at session end").
// 수치(성공률 곡선·포섭난도·탐지난도·발동 최소 충성유닛수)는 매뉴얼 미수록 → **SERVER DESIGN**(규칙만 캐논).
// 순수 모듈: 모든 확률 판정의 roll(0..1)을 호출자가 주입 → 재현 가능(intel.mjs와 동일 규약).

import {
  COUP_LOYALTY_THRESHOLD,
  espionageChance,
  applyCoupLoyalty,
  canStartCoup,
} from './logh7-intel.mjs';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);

// SERVER DESIGN: 발동에 필요한 "충성 임계 넘은 유닛" 최소 수(혼자선 쿠데타 불가).
export const COUP_MIN_REBEL_UNITS = 1;
// SERVER DESIGN: 査閲 탐지 기본 난도 — 모의가 클수록(멤버 많을수록) 탐지 쉬움(은폐 어려움).
export const INSPECT_BASE = 0.25;
export const INSPECT_INTEL_WEIGHT = 0.6;
export const INSPECT_SIZE_WEIGHT = 0.08; // 멤버 1명당 탐지율 가산

/**
 * 査閲(탐지) 성공 확률(0..1). 査閲자 情報 높을수록↑, 모의 멤버 많을수록(은폐 어려워)↑.
 * @param {number} inspectorIntel 査閲자 情報 능력(0..100)
 * @param {number} memberCount 모의 멤버 수(수괴 포함)
 */
export function inspectChance(inspectorIntel, memberCount = 1) {
  const i = clamp01((Number(inspectorIntel) || 0) / 100);
  const size = Math.max(0, (Number(memberCount) || 0));
  return clamp01(INSPECT_BASE + INSPECT_INTEL_WEIGHT * i + INSPECT_SIZE_WEIGHT * size);
}

/**
 * 쿠데타 모의/실행 상태. 수괴(mastermind) id별 conspiracy를 보관한다. 순수 누적이며 클라 발신 없이
 * 서버가 채운다(클라 opcode 미확정 — logh7-intel.mjs 주석 참조). 叛乱忠誠도 자체는 intelState에 위임.
 *
 * conspiracy 형태:
 *   { mastermindId, faction, members:Set<charId>, persuadedUnits:Set<unitId>, detected:boolean, executed:boolean }
 */
export function createCoupState() {
  /** @type {Map<number, {mastermindId:number, faction:(number|string), members:Set<number>, persuadedUnits:Set<number>, detected:boolean, executed:boolean}>} */
  const conspiracies = new Map();

  const norm = (id) => id >>> 0;

  return {
    conspiracies,

    /** 모의 조회(없으면 null). */
    getConspiracy(mastermindId) {
      return conspiracies.get(norm(mastermindId)) ?? null;
    },

    /** 진행 중(미발동) 모의 수. */
    activeCount() {
      let n = 0;
      for (const c of conspiracies.values()) if (!c.executed) n += 1;
      return n;
    },

    /**
     * 叛意 — 수괴 선언. 이미 수괴면 기존 conspiracy 반환(멱등). 새로 만들면 멤버=수괴 1인.
     * @returns {{conspiracy:object, created:boolean}}
     */
    declareRingleader(mastermindId, faction = 0) {
      const key = norm(mastermindId);
      const existing = conspiracies.get(key);
      if (existing) return { conspiracy: existing, created: false };
      const conspiracy = {
        mastermindId: key,
        faction,
        members: new Set([key]),
        persuadedUnits: new Set(),
        detected: false,
        executed: false,
      };
      conspiracies.set(key, conspiracy);
      return { conspiracy, created: true };
    },

    /**
     * 謀議 — 같은 spot 인물 포섭(성공률=情報 좌우, espionageChance 재사용). roll<chance면 멤버 추가.
     * 발동/미존재/이미멤버면 실패. (같은-spot 검증은 호출자 책임 — 순수 모듈은 id만 받는다.)
     * @param {number} mastermindId 수괴
     * @param {number} recruitId 포섭 대상
     * @param {{intel?:number, targetResistance?:number, roll?:number}} opts intel=수괴 情報, targetResistance=대상 충성(저항)
     * @returns {{success:boolean, chance:number, reason?:string}}
     */
    recruit(mastermindId, recruitId, { intel = 0, targetResistance = 0, roll = 1 } = {}) {
      const c = conspiracies.get(norm(mastermindId));
      if (!c) return { success: false, chance: 0, reason: 'no-conspiracy' };
      if (c.executed) return { success: false, chance: 0, reason: 'already-executed' };
      if (c.detected) return { success: false, chance: 0, reason: 'detected' }; // 査閲로 분쇄된 모의는 포섭 불가
      const rid = norm(recruitId);
      if (c.members.has(rid)) return { success: false, chance: 0, reason: 'already-member' };
      const chance = espionageChance(intel, targetResistance);
      if (roll < chance) {
        c.members.add(rid);
        return { success: true, chance };
      }
      return { success: false, chance, reason: 'roll-failed' };
    },

    /**
     * 参加 — 포섭(멤버)된 추종자의 참가 확정. 멤버가 아니면 거부(임의 참가 불가, 謀議 선행 필요).
     * 현재 모델에선 멤버집합이 곧 참가자라 멱등 true를 주되, 비멤버는 false.
     */
    join(mastermindId, followerId) {
      const c = conspiracies.get(norm(mastermindId));
      if (!c || c.executed) return false;
      return c.members.has(norm(followerId));
    },

    /**
     * 説得 — 유닛의 叛乱忠誠도↑(intelState에 위임) + 임계 도달 시 모의의 반란예정 유닛에 등록.
     * @param {ReturnType<import('./logh7-intel.mjs').createIntelState>} intelState
     * @param {number} mastermindId 수괴
     * @param {number} unitId 설득 대상 유닛(자기 부대)
     * @param {number} delta 충성 증가폭
     * @returns {{loyalty:number, willDefect:boolean}}
     */
    persuadeUnit(intelState, mastermindId, unitId, delta) {
      const c = conspiracies.get(norm(mastermindId));
      // 유닛 키스페이스(addUnitLoyalty)에 누적 — 캐릭터 coupLoyalty와 분리(동번호 충돌 시 coup_conduct 오염 방지).
      const loyalty = intelState.addUnitLoyalty(unitId, delta);
      const willDefect = loyalty >= COUP_LOYALTY_THRESHOLD;
      // 査閲로 탐지(detected)된 모의엔 반란예정 유닛을 더 등록하지 않는다(분쇄 일관).
      if (c && !c.executed && !c.detected && willDefect) c.persuadedUnits.add(norm(unitId));
      return { loyalty, willDefect };
    },

    /**
     * 叛乱 발동 가능 여부: 모의 존재·미발동·미탐지, 충성 임계 넘은 유닛 ≥ 최소수, 완전승리 아님(캐논 게이트).
     * @param {number} mastermindId
     * @param {{decisiveVictory?:boolean}} opts
     */
    canExecute(mastermindId, { decisiveVictory = false } = {}) {
      const c = conspiracies.get(norm(mastermindId));
      if (!c || c.executed) return false;
      if (c.detected) return false; // 탐지된 모의는 발동 차단(査閲로 분쇄)
      if (c.persuadedUnits.size < COUP_MIN_REBEL_UNITS) return false;
      // 완전승리 게이트는 canStartCoup에서 빠졌으므로(인과 정정, intel.mjs 참조) 발동-시점에 명시 검사한다.
      if (decisiveVictory) return false; // 완전승리 진영에선 발동 불가(캐논 p78)
      // intel.canStartCoup 충성 게이트: 충성 임계 통과 유닛 존재(persuadedUnits≥최소).
      return canStartCoup({ loyalty: COUP_LOYALTY_THRESHOLD });
    },

    /**
     * 叛乱 — 발동. 충성 임계 넘은 유닛이 반란군(별 진영)으로 이탈. 발동 후 conspiracy.executed=true.
     * @param {number} mastermindId
     * @param {{decisiveVictory?:boolean, rebelFaction?:(number|string)}} opts
     * @returns {{rebelFaction:(number|string), defectingUnits:number[], members:number[]}|null} 불가 시 null
     */
    execute(mastermindId, { decisiveVictory = false, rebelFaction = 'rebel' } = {}) {
      if (!this.canExecute(mastermindId, { decisiveVictory })) return null;
      const c = conspiracies.get(norm(mastermindId));
      c.executed = true;
      return {
        rebelFaction,
        defectingUnits: [...c.persuadedUnits],
        members: [...c.members],
      };
    },

    /**
     * 査閲 — 모의 징후 탐지(査閲자 情報 vs 모의 크기). roll<inspectChance면 detected=true(발동 차단).
     * @param {number} mastermindId 탐지 대상 모의
     * @param {{inspectorIntel?:number, roll?:number}} opts
     * @returns {{detected:boolean, chance:number, reason?:string}}
     */
    inspect(mastermindId, { inspectorIntel = 0, roll = 1 } = {}) {
      const c = conspiracies.get(norm(mastermindId));
      if (!c) return { detected: false, chance: 0, reason: 'no-conspiracy' };
      if (c.executed) return { detected: false, chance: 0, reason: 'already-executed' };
      if (c.detected) return { detected: true, chance: 1, reason: 'already-detected' };
      const chance = inspectChance(inspectorIntel, c.members.size);
      if (roll < chance) {
        c.detected = true;
        return { detected: true, chance };
      }
      return { detected: false, chance, reason: 'roll-failed' };
    },
    toSnapshot() {
      return {
        conspiracies: [...conspiracies.values()].map((c) => ({
          ...c,
          members: [...c.members],
          persuadedUnits: [...c.persuadedUnits],
        })),
      };
    },
    restore(snapshot = {}) {
      conspiracies.clear();
      for (const row of snapshot.conspiracies ?? []) {
        const mastermindId = norm(row.mastermindId);
        conspiracies.set(mastermindId, {
          ...row,
          mastermindId,
          members: new Set(Array.isArray(row.members) ? row.members.map(norm) : []),
          persuadedUnits: new Set(Array.isArray(row.persuadedUnits) ? row.persuadedUnits.map(norm) : []),
          detected: Boolean(row.detected),
          executed: Boolean(row.executed),
        });
      }
      return this;
    },
  };
}
