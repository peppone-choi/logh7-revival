// 내정·경제 (Phase B §B1). 원작 経済는 未実装이라 대조할 원본이 없고, 매뉴얼은 정성 서술만 한다
// (税金으로 행정·군사비 충당, 統率(PCP)이 徵税額·政府支持率에 영향 — p9/p14-15). 따라서 세금/지지/치안
// 공식의 계수는 전부 **P3 튜닝상수**(아래 ECONOMY_TUNING)로 명시하고, 게임클록(24×) 위 30일틱으로 누적한다.
// 와이어 노출(0x031f/0x0337 패널)은 별도 — 본 모듈은 서버 내부 상태만 다룬다(라이브 불필요).
//
// 게임클록은 economy 전용이 아니라 world-state 공용 인프라([[logh7-game-clock]])를 재사용한다. 본 모듈은
// "하루 1회" 게이팅을 직접 하지 않고, 호출자가 gameDaysCrossed로 경계를 잡아 runEconomyTick을 호출한다.

import { GAME_DAYS_PER_MONTH } from './logh7-game-clock.mjs';

// --- P3 튜닝상수 (캐논 수치 없음 — 게임플레이 밸런스용, byte/원본 단정 금지) ---
export const ECONOMY_TUNING = Object.freeze({
  defaultTaxRate: 0.1, // 기본 세율(0..1)
  approvalMax: 100, // 政府支持率 상한(0..100)
  securityMax: 100, // 治安維持率 상한
  influenceMax: 100,
  // 지지율→징세 계수: 지지 0%면 0.5배, 100%면 1.0배 (선형). P3.
  approvalTaxFloor: 0.5,
  // 統率(0..100?)→징세 계수: 統率 0이면 0.8배, 100이면 1.2배. P3.
  leadershipTaxFloor: 0.8,
  leadershipTaxCeil: 1.2,
  leadershipScale: 100,
  // 지지/치안 baseline 회귀(30일틱마다 50 방향으로 이동하는 양). P3.
  meanReversion: 2,
});

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * 행성 1개의 30일 세수. P3 공식: floor(taxBase × taxRate × approvalFactor × leadershipFactor).
 * @param {{ taxBase:number, taxRate:number, approval:number }} planet
 * @param {{ leadership?:number }} [ctx] 담당관 統率(요직). 없으면 중립 50.
 */
export function computePlanetTax(planet, { leadership = 50 } = {}) {
  const t = ECONOMY_TUNING;
  const taxBase = Math.max(0, Number(planet.taxBase) || 0);
  const taxRate = clamp(Number(planet.taxRate) || 0, 0, 1);
  // approval 결측 방어: Number(undefined)=NaN인데 ??는 NaN을 못 거르므로(NaN??x===NaN) Number.isFinite로
  // 분기한다. 이전엔 approval 없는 행성에서 세수 전체가 NaN→국고 오염되던 버그.
  const ap = Number(planet.approval);
  const approval = clamp(Number.isFinite(ap) ? ap : t.approvalMax, 0, t.approvalMax);
  // 지지율 0..100 → 계수 floor..1.0
  const approvalFactor = t.approvalTaxFloor + (1 - t.approvalTaxFloor) * (approval / t.approvalMax);
  // 統率 → 계수 floor..ceil
  const lead = clamp(Number(leadership) || 0, 0, t.leadershipScale);
  const leadershipFactor = t.leadershipTaxFloor + (t.leadershipTaxCeil - t.leadershipTaxFloor) * (lead / t.leadershipScale);
  return Math.floor(taxBase * taxRate * approvalFactor * leadershipFactor);
}

/**
 * 경제 상태 — 행성별 경제 필드 + 진영별 국고(treasury). 인메모리 authoritative, JSON 직렬화 가능.
 */
export function createEconomyState() {
  /** @type {Map<string|number, {id:any, faction:string, taxBase:number, taxRate:number, approval:number, security:number, revenue:number, aid:number}>} */
  const planets = new Map();
  /** @type {Map<string, {treasury:number}>} faction -> 국고 */
  const nations = new Map();
  let lastTickDay = -1;

  const nationOf = (faction) => {
    if (!nations.has(faction)) nations.set(faction, { treasury: 0 });
    return nations.get(faction);
  };

  // 더티-트래킹 리비전 — world-state와 동일 원리(Hibernate 자동 계측의 JS 대응). 경제 상태(국고/세수/지지/
  // 치안)를 바꾸는 모든 mutator 호출마다 +1. 영속성 더티-게이트가 world+economy 리비전을 합성키로 O(1) 판정.
  let revision = 0;

  const state = {
    /** 더티-트래킹 리비전(영속성 게이트용). mutator 1회당 +1, 순수 reader 호출엔 불변. */
    revision() { return revision; },
    registerPlanet(id, { faction = 'neutral', taxBase = 0, taxRate = ECONOMY_TUNING.defaultTaxRate, approval = ECONOMY_TUNING.approvalMax, security = ECONOMY_TUNING.securityMax, system = null } = {}) {
      // system = 소속 성계 이름(정복 동기화의 setSystemOwner 키). 행성-키 파생에 의존하지 않게 명시 저장.
      const planet = { id, system, faction, taxBase, taxRate, approval, security, revenue: 0, aid: 0 };
      planets.set(id, planet);
      nationOf(faction);
      return planet;
    },
    getPlanet(id) {
      return planets.get(id) ?? null;
    },
    listPlanets() {
      return [...planets.values()];
    },
    treasuryOf(faction) {
      return nationOf(faction).treasury;
    },
    addTreasury(faction, amount) {
      // 음수/NaN/비유한 입력 방어(spendTreasury와 대칭). 음수 분배는 별도 의미라 여기서 막는다.
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < 0) return nationOf(faction).treasury;
      nationOf(faction).treasury += amt;
      return nationOf(faction).treasury;
    },
    /** 행성 소유 진영 변경(정복 동기화 — conquerSystem 후 세수가 새 진영에 적립되도록). 미지 행성=null. */
    setPlanetOwner(planetId, faction) {
      const p = planets.get(planetId);
      if (!p) return null;
      p.faction = String(faction);
      nationOf(p.faction); // 새 진영 국고 보장
      return p;
    },
    /** 성계 정복 동기화: 그 성계의 모든 행성 소유 진영을 갱신. 갱신된 행성 수 반환. */
    setSystemOwner(systemName, faction) {
      let n = 0;
      const f = String(faction);
      for (const p of planets.values()) {
        if (p.system === systemName) { p.faction = f; n += 1; }
      }
      if (n > 0) nationOf(f);
      return n;
    },
    /** 국고에서 차감(분배/원조 등). 잔액 부족이면 false(미차감). */
    spendTreasury(faction, amount) {
      const n = nationOf(faction);
      if (amount < 0 || n.treasury < amount) return false;
      n.treasury -= amount;
      return true;
    },

    // --- 정치 효과(政府支持率/治安維持率 델타) — Phase B §1.2/1.3 ---
    // 分列行進(+支持率)·武力鎮圧(+治安/−支持率)·演説(+支持率)·煽動工作(−支持率)·警戒出動(+治安) 등
    // 커맨드 핸들러가 호출. delta 크기는 P3(ECONOMY_TUNING), 0..MAX 클램프. 알 수 없는 행성이면 null.
    adjustApproval(planetId, delta) {
      const p = planets.get(planetId);
      if (!p) return null;
      p.approval = clamp((Number(p.approval) || 0) + (Number(delta) || 0), 0, ECONOMY_TUNING.approvalMax);
      return p.approval;
    },
    adjustSecurity(planetId, delta) {
      const p = planets.get(planetId);
      if (!p) return null;
      p.security = clamp((Number(p.security) || 0) + (Number(delta) || 0), 0, ECONOMY_TUNING.securityMax);
      return p.security;
    },

    /**
     * 30일 경제틱 1회: 각 행성 세수 산정→해당 진영 국고 적립, 지지/치안 baseline 회귀.
     * 하루-1회 게이팅은 호출자(gameDaysCrossed)가 한다. `leadershipByFaction`은 요직 담당관 統率(P3).
     * @returns {{ gameDay:number, revenueByFaction:Record<string,number> }}
     */
    runEconomyTick({ gameDay = 0, leadershipByFaction = {} } = {}) {
      const revenueByFaction = {};
      for (const planet of planets.values()) {
        const revenue = computePlanetTax(planet, { leadership: leadershipByFaction[planet.faction] });
        planet.revenue = revenue;
        nationOf(planet.faction).treasury += revenue;
        revenueByFaction[planet.faction] = (revenueByFaction[planet.faction] ?? 0) + revenue;
        // 지지/치안 baseline(50) 방향 회귀(P3).
        const mid = ECONOMY_TUNING.approvalMax / 2;
        planet.approval += planet.approval > mid ? -ECONOMY_TUNING.meanReversion : planet.approval < mid ? ECONOMY_TUNING.meanReversion : 0;
        const smid = ECONOMY_TUNING.securityMax / 2;
        planet.security += planet.security > smid ? -ECONOMY_TUNING.meanReversion : planet.security < smid ? ECONOMY_TUNING.meanReversion : 0;
      }
      lastTickDay = gameDay;
      return { gameDay, revenueByFaction };
    },
    lastTickDay() {
      return lastTickDay;
    },
    /**
     * 게임일이 새 주기(기본 30일)로 넘어갔을 때만 1회 틱(중복적립 방지). auth-server가 게임클록 day로
     * 매 틱 호출하면, 30게임일 경계에서만 실제 세금/국고 적립이 일어난다. 넘김 없으면 null.
     * @param {{ gameDay?:number, periodDays?:number, leadershipByFaction?:object }} [opts]
     */
    tickIfDue({ gameDay = 0, periodDays = GAME_DAYS_PER_MONTH, leadershipByFaction = {} } = {}) {
      const prevPeriod = Math.floor(lastTickDay / periodDays); // lastTickDay -1 → -1
      const curPeriod = Math.floor(gameDay / periodDays);
      if (curPeriod <= prevPeriod) return null;
      return state.runEconomyTick({ gameDay, leadershipByFaction });
    },

    // --- 영속성 ---
    toSnapshot() {
      return { planets: [...planets.values()], nations: [...nations.entries()].map(([faction, n]) => ({ faction, ...n })), lastTickDay };
    },
    restore(snapshot = {}) {
      planets.clear();
      nations.clear();
      for (const p of snapshot.planets ?? []) planets.set(p.id, p);
      for (const n of snapshot.nations ?? []) nations.set(n.faction, { treasury: n.treasury ?? 0 });
      lastTickDay = snapshot.lastTickDay ?? -1;
    },
  };

  // mutator 자동 계측 — reader 화이트리스트에 없는 모든 메서드를 래핑해 호출 시 revision을 1 올린다(누락 불가).
  const READERS = new Set(['revision', 'getPlanet', 'listPlanets', 'treasuryOf', 'lastTickDay', 'toSnapshot']);
  for (const [name, fn] of Object.entries(state)) {
    if (typeof fn !== 'function' || READERS.has(name)) continue;
    state[name] = (...args) => { revision += 1; return fn.apply(state, args); };
  }
  return state;
}

/**
 * 전략 시스템(성계) 목록에서 경제 상태를 시드한다. 각 성계의 행성을 진영별로 등록하고,
 * 세원(taxBase)을 행성 인구/산업에서 산출한다(P3 공식: population + industry*가중). 라이브 불필요.
 * @param {object} economyState createEconomyState()
 * @param {Array<{faction?:string, owner?:string|number, planets?:Array<object>}>} systems
 * @param {(p:object)=>number} [taxBaseOf] 행성→세원 산출(기본 P3)
 */
export function seedEconomyFromSystems(economyState, systems = [], taxBaseOf = defaultTaxBaseOf) {
  let count = 0;
  for (const system of systems) {
    const faction = String(system.faction ?? system.owner ?? 'neutral');
    const systemName = system.name ?? null;
    for (const planet of Array.isArray(system.planets) ? system.planets : []) {
      const id = planet.id ?? planet.name ?? `${faction}:${count}`;
      economyState.registerPlanet(id, { faction, taxBase: taxBaseOf(planet), system: systemName });
      count += 1;
    }
  }
  return count;
}

// P3 세원 산출: 인구(백만) + 산업*4. 캐논 공식 없음(매뉴얼 정성서술만) → 튜닝 가능.
function defaultTaxBaseOf(planet) {
  const pop = Number(planet.population_M ?? planet.population ?? planet.pop ?? 0) || 0;
  const ind = Number(planet.industry ?? planet.industrial ?? 0) || 0;
  return Math.max(0, Math.round(pop + ind * 4));
}

export { GAME_DAYS_PER_MONTH };
