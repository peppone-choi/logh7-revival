// 첩보(諜報) 공작 라이프사이클 — Phase B §B6. logh7-intel.mjs의 espionage roll 위에 캐논 諜報 커맨드의
// 두 상태머신(체포 매트릭스 + 침투 공작) + 단발 공작(선동/습격/수색/감시)을 얹는다.
//
// 캐논(매뉴얼 p73-74 諜報):
//   一斉捜索 Mass Search   (CP160) — 인물의 소재(body)를 탐색
//   逮捕許可 Arrest Auth    (CP800) — 자기진영 인물을 체포리스트에 등재
//   執行命令 Enforce Order  (CP800) — 체포리스트 인물에 대한 체포권한 위임
//   逮捕命令 Arrest Order   (CP160) — 같은-spot/같은-부대 표적을 체포(권한+동소 필요)
//   襲撃   Raid           (CP160) — 같은-spot 적진영 인물 습격
//   監視   Surveillance   (CP160) — 지속 감시(탐지될 때까지)
//   潜入工作 Infiltration   (CP160) — 시설 spot에 잠입
//   脱出工作 Escape         (CP160) — 잠입 spot 탈출
//   情報工作 Intel Op       (CP160) — 시설 정보 절취 → 본국
//   破壊工作 Sabotage       (CP160) — 잠입 시설에 시한폭탄
//   煽動工作 Agitation      (CP160) — 표적 政府支持率↓
// (査閲 Inspection은 쿠데타 탐지라 logh7-coup.mjs에 둠.)
//
// 성공률은 情報 능력이 좌우(espionageChance 재사용), 실패하면 발각(detected)된다. 누적폭/임계는 매뉴얼
// 미수록 → **SERVER DESIGN**. 순수 모듈: 모든 roll(0..1)을 호출자가 주입(intel.mjs와 동일 규약).

import { espionageChance } from './logh7-intel.mjs';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// SERVER DESIGN: 煽動工作 기본 支持率 감소폭(情報 비례 가산).
export const AGITATION_BASE_DROP = 5;
export const AGITATION_INTEL_DROP = 15; // 情報 100 시 추가 감소

/**
 * 첩보 공작 상태. 진영별 체포리스트/권한, 구금자, 잠입 에이전트, 감시를 보관한다. 순수 누적이며
 * 클라 발신 없이 서버가 채운다(클라 opcode 미확정 — logh7-intel.mjs 주석 참조).
 */
export function createEspionageState() {
  /** @type {Map<(number|string), Set<number>>} 진영 → 체포리스트(charId 집합) */
  const arrestList = new Map();
  /** @type {Map<(number|string), Set<number>>} 진영 → 체포권한 위임받은 집행자(charId) */
  const enforcers = new Map();
  /** @type {Map<number, {faction:(number|string)}>} 구금된 charId → 정보 */
  const detained = new Map();
  /** @type {Map<number, {facility:(number|string), planted:boolean}>} 잠입 에이전트 charId → 상태 */
  const infiltrations = new Map();
  /** @type {Map<number, number>} 감시자 charId → 표적 charId */
  const surveillance = new Map();
  /** @type {Set<number>} 一斉捜索으로 소재가 파악된 표적 charId (逮捕命令 동소 판정의 선행 단계) */
  const located = new Set();
  /** @type {Map<number, {body:(number|string)}>} 侵入工作으로 적 body(인물/부대)에 진입한 에이전트 charId */
  const intrusions = new Map();

  const norm = (id) => id >>> 0;
  const setFor = (map, faction) => {
    let s = map.get(faction);
    if (!s) { s = new Set(); map.set(faction, s); }
    return s;
  };

  return {
    arrestList, enforcers, detained, infiltrations, surveillance, located, intrusions,

    // ---- 체포 매트릭스 (逮捕許可 → 執行命令 → 逮捕命令) ----

    /** 逮捕許可 — 자기진영 인물을 체포리스트에 등재(멱등). */
    authorizeArrest(faction, charId) {
      setFor(arrestList, faction).add(norm(charId));
      return true;
    },

    /** 체포리스트에 있나. */
    isArrestListed(faction, charId) {
      return setFor(arrestList, faction).has(norm(charId));
    },

    /** 執行命令 — 집행자에게 체포권한 위임(멱등). */
    delegateEnforcement(faction, enforcerId) {
      setFor(enforcers, faction).add(norm(enforcerId));
      return true;
    },

    /** 집행자가 체포권한을 가졌나. */
    hasEnforcementAuthority(faction, enforcerId) {
      return setFor(enforcers, faction).has(norm(enforcerId));
    },

    /**
     * 逮捕命令 — 표적 체포. 조건: 표적이 체포리스트 등재 && 집행자가 권한 보유 && 동소(coLocated).
     * 성공 시 detained 등록.
     * @returns {{arrested:boolean, reason?:string}}
     */
    arrestOrder(faction, enforcerId, targetId, { coLocated = false } = {}) {
      if (!this.isArrestListed(faction, targetId)) return { arrested: false, reason: 'not-listed' };
      if (!this.hasEnforcementAuthority(faction, enforcerId)) return { arrested: false, reason: 'no-authority' };
      if (!coLocated) return { arrested: false, reason: 'not-co-located' };
      detained.set(norm(targetId), { faction });
      return { arrested: true };
    },

    /** 구금 여부. */
    isDetained(charId) {
      return detained.has(norm(charId));
    },

    /** 처단/석방 등으로 구금 해제. */
    release(charId) {
      return detained.delete(norm(charId));
    },

    // ---- 침투 공작 라이프사이클 (潜入 → 情報/破壊/煽動 → 脱出) ----

    /**
     * 潜入工作 — 시설 spot 잠입. 성공률=情報 vs 시설 治安. 실패=발각.
     * @returns {{success:boolean, detected:boolean, chance:number}}
     */
    infiltrate(agentId, facility, { intel = 0, security = 0, roll = 1 } = {}) {
      const chance = espionageChance(intel, security);
      const success = roll < chance;
      if (success) infiltrations.set(norm(agentId), { facility, planted: false });
      return { success, detected: !success, chance };
    },

    /** 잠입 중인가. */
    isInfiltrated(agentId) {
      return infiltrations.has(norm(agentId));
    },

    /**
     * 情報工作 — 잠입 시설 정보 절취. 잠입 필요. 실패 시 발각(잠입 해제).
     * @returns {{success:boolean, detected:boolean, chance:number, reason?:string}}
     */
    intelOp(agentId, { intel = 0, security = 0, roll = 1 } = {}) {
      const inf = infiltrations.get(norm(agentId));
      if (!inf) return { success: false, detected: false, chance: 0, reason: 'not-infiltrated' };
      const chance = espionageChance(intel, security);
      const success = roll < chance;
      if (!success) infiltrations.delete(norm(agentId));
      return { success, detected: !success, chance };
    },

    /**
     * 破壊工作 — 잠입 시설에 시한폭탄. 잠입 필요. 성공 시 planted=true. 실패 시 발각(잠입 해제).
     * @returns {{success:boolean, detected:boolean, chance:number, reason?:string}}
     */
    sabotage(agentId, { intel = 0, security = 0, roll = 1 } = {}) {
      const inf = infiltrations.get(norm(agentId));
      if (!inf) return { success: false, detected: false, chance: 0, reason: 'not-infiltrated' };
      const chance = espionageChance(intel, security);
      const success = roll < chance;
      if (success) inf.planted = true;
      else infiltrations.delete(norm(agentId));
      return { success, detected: !success, chance };
    },

    /**
     * 脱出工作 — 잠입 spot 탈출. 성공 시 잠입 해제. 실패=발각(여전히 해제, 단 detected).
     * @returns {{success:boolean, detected:boolean, chance:number, reason?:string}}
     */
    escape(agentId, { intel = 0, security = 0, roll = 1 } = {}) {
      if (!infiltrations.has(norm(agentId))) return { success: false, detected: false, chance: 0, reason: 'not-infiltrated' };
      const chance = espionageChance(intel, security);
      const success = roll < chance;
      infiltrations.delete(norm(agentId)); // 성공이든 발각이든 spot에서 빠짐
      return { success, detected: !success, chance };
    },

    // ---- 단발 공작 ----

    /**
     * 煽動工作 — 표적 政府支持率↓. 감소폭=기본+情報 비례(SERVER DESIGN). 새 支持率 반환(0..100).
     * @returns {{support:number, drop:number}}
     */
    agitate(currentSupport, { intel = 0 } = {}) {
      const i = clamp((Number(intel) || 0) / 100, 0, 1);
      const drop = AGITATION_BASE_DROP + AGITATION_INTEL_DROP * i;
      const support = clamp((Number(currentSupport) || 0) - drop, 0, 100);
      return { support, drop };
    },

    /** 監視 — 지속 감시 등록. */
    surveil(watcherId, targetId) {
      surveillance.set(norm(watcherId), norm(targetId));
      return true;
    },

    /** 감시 중인 표적(없으면 null). */
    surveilTarget(watcherId) {
      const t = surveillance.get(norm(watcherId));
      return t === undefined ? null : t;
    },

    /** 監視 해제(탐지 시 등). */
    unsurveil(watcherId) {
      return surveillance.delete(norm(watcherId));
    },

    /**
     * 襲撃 — 같은-spot 적진영 인물 습격. 성공률=습격자 情報(저항=표적 情報). 실패=발각.
     * @returns {{success:boolean, detected:boolean, chance:number}}
     */
    raid(agentId, targetId, { intel = 0, targetResistance = 0, roll = 1 } = {}) {
      const chance = espionageChance(intel, targetResistance);
      const success = roll < chance;
      return { success, detected: !success, chance };
    },

    // ---- 탐색/침입/귀환 (一斉捜索 / 侵入工作 / 帰還工作) ----

    /**
     * 一斉捜索 — 인물 소재(body) 탐색. 성공 시 located에 등록(逮捕命令의 동소 판정 선행 단계).
     * 성공률=탐색자 情報 vs 표적 은폐. @returns {{found:boolean, chance:number}}
     */
    massSearch(targetId, { searcherIntel = 0, concealment = 0, roll = 1 } = {}) {
      const chance = espionageChance(searcherIntel, concealment);
      const found = roll < chance;
      if (found) located.add(norm(targetId));
      return { found, chance };
    },
    /** 一斉捜索으로 소재가 파악됐나(동소 판정에 활용). */
    isLocated(targetId) {
      return located.has(norm(targetId));
    },

    /**
     * 侵入工作 — 적 body(인물/부대)에 진입(잠입의 인물 대상 변형). 성공 시 intrusions 등록(그 표적과 동소가
     * 되어 襲撃/감시 등 후속 가능). 실패=발각. @returns {{success:boolean, detected:boolean, chance:number}}
     */
    intrusion(agentId, bodyId, { intel = 0, security = 0, roll = 1 } = {}) {
      const chance = espionageChance(intel, security);
      const success = roll < chance;
      if (success) intrusions.set(norm(agentId), { body: bodyId });
      return { success, detected: !success, chance };
    },
    /** 에이전트가 적 body에 진입 중인가. */
    isIntruded(agentId) {
      return intrusions.has(norm(agentId));
    },

    /**
     * 帰還工作 — 잠입/침입 에이전트를 본국으로 송환(脱出의 본국행 변형). 잠입·침입 상태를 모두 해제한다.
     * 성공률=情報. 실패해도 본국행은 하되 발각. 둘 다 아니면(상태 없음) reason. @returns {{success, detected, chance, reason?}}
     */
    returnOp(agentId, { intel = 0, security = 0, roll = 1 } = {}) {
      const a = norm(agentId);
      if (!infiltrations.has(a) && !intrusions.has(a)) return { success: false, detected: false, chance: 0, reason: 'not-deployed' };
      const chance = espionageChance(intel, security);
      const success = roll < chance;
      infiltrations.delete(a);
      intrusions.delete(a);
      return { success, detected: !success, chance };
    },
  };
}
