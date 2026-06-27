/**
 * Authoritative in-world game state (the body of "실질적 멀티플레이 서버").
 *
 * The LOGH VII client is a thin renderer: it SENDS Command* and only applies an effect when the
 * server broadcasts the matching Notify*. So the server, not the client, owns the truth. This
 * module is that truth for a single shared world — the in-memory authoritative state the command
 * engine validates against and mutates. Persistence (DB) is a separate async concern (CQRS, see
 * the server-data-architecture memory note); this layer is pure in-memory and synchronous so it
 * stays trivially unit-testable.
 *
 * Scope (incremental): players (who is in the world), ships (the controllable units in a tactical
 * grid, keyed by the client's grid-slot ship id, WITH combat stats), a chat log, the strategic
 * galaxy, and per-player tactical battle mode. Fleets/bases/economy grow as more Command* handlers
 * are reverse-engineered and added to the engine.
 */

import { shipClassStats } from './logh7-combat-engine.mjs';
import { createGameClock } from './logh7-game-clock.mjs';
import { resolveFlagshipDestroyed } from './logh7-combat-death.mjs';
import { applyAgeDrift } from './logh7-age-drift.mjs';
import { autoPromoteLadders } from './logh7-rank-ladder.mjs';
import { createIntelState } from './logh7-intel.mjs';
import { createCoupState } from './logh7-coup.mjs';

/** @typedef {{ connectionId: number, charId: number, powerId: number, mode: number }} Player */
/**
 * @typedef {{ id:number, owner:number, faction:number, shipClass:string, x:number, y:number, z:number,
 *   heading:number, state:number, maxArmor:number, armor:number, maxZanki:number, zanki:number,
 *   maxShield:number, shield:number, beamPower:number, defense:number, morale:number, destroyed:boolean,
 *   shieldMax:number[], shieldFill:number[],
 *   beamgunA:number, fillA:number, beamgunB:number, fillB:number }} Ship
 */
/**
 * @typedef {{ id:number, owner:number, faction:number, commander:number, cell:number,
 *   boats:number[], supply:number, mapSection:number }} Fleet
 *
 * A strategic fleet entity — the authoritative state that feeds the 0x0325 ResponseInformationUnit
 * record (the 0x58/88-byte unit-table element, wire layout P0; see docs/logh7-strategic-map-wire.md
 * and login-protocol.mjs buildInformationUnitRecordInner). `id` matches the char record flagship@0x24
 * grid-unit id; `boats` is the troop_units list (≤10 sub-unit/ship ids in the fleet); `cell` is the
 * strategic sector-grid cell (row*100+col); `mapSection` is the strategic field/region the fleet sits in.
 * Field VALUES (boats/commander/supply) are P3 reconstructed seeds unless sourced from proven data —
 * only the wire LAYOUT they feed is P0.
 */

export function createWorldState({ clockStartMs = 0, seed = null } = {}) {
  // 게임 클록(24×, 공용 인프라). 영속성으로 startMs를 보존해 재시작 후에도 게임 시간이 이어진다.
  let clock = createGameClock({ startMs: clockStartMs });
  // 권위적 난수원(降伏勧告 성공판정 등 확률 규칙). seed 주어지면 결정론(mulberry32, 테스트/재현),
  // 없으면 Math.random(라이브). 서버 권위적 상태이므로 클라/와이어와 무관.
  let rngState = (seed ?? 0) >>> 0;
  const rng = seed == null
    ? () => Math.random()
    : () => {
      rngState = (rngState + 0x6d2b79f5) >>> 0;
      let t = rngState;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  /** @type {Map<number, Player>} connectionId -> player */
  const players = new Map();
  /** @type {Map<number, Ship>} shipId -> ship (the grid-slot key the client uses, G166) */
  const ships = new Map();
  /** @type {Map<number, object>} troopId -> ground unit (地上戦 sortied troops) */
  const troops = new Map();
  /** @type {{ connectionId: number, charId: number, text: string, channel: number, time: number }[]} */
  const chatLog = [];
  /** @type {Map<string, object>} systemName -> strategic system state (owner/planets) */
  const systems = new Map();
  /** @type {Map<number, Fleet>} fleetId -> strategic fleet entity (feeds 0x0325 unit table, A1/A2) */
  const fleets = new Map();
  /**
   * 전투-관련 캐릭터 레지스트리(charId -> 캐릭터). 권위적 전투 해소(戦死/降伏勧告/艦隊最大士気)가 함선의
   * 사령관 統率·계급·전사토글·帰還惑星을 조회하는 단일 출처. ⚠️ logh7-personnel.mjs는 인사-커맨드(임면/진급)
   * 도메인 전용 별도 state이며, 본 레지스트리는 그와 별개의 "라이브 전투 캐릭터 상태"다(rank 필드 일부 중복 —
   * 향후 통합 후보). flagship(char+0x24)으로 함선↔캐릭터를 잇는다(0x0325 world-entry 바인딩과 동일 키).
   * @type {Map<number, {id:number, faction:string, leadership:number, rank:number, flagship:number,
   *   returnPlanet:(string|number|null), birthplace:(string|number|null), deathToggle:boolean,
   *   alive:boolean, injured:boolean}>}
   */
  const characters = new Map();
  // 첩보/쿠데타(諜報·叛乱) 권위적 상태 — coup_conduct 표시필드 생산자(0x0356 스트림 시드)와 완전승리 게이트
  // (evaluateEnding의 activeCoups 박탈)가 참조하는 공유 인스턴스. intelState=캐릭터별 叛乱忠誠度 누적 +
  // isCoupConduct 파생, coupState=수괴 모의(叛意/謀議/説得/叛乱) 라이프사이클. 순수 모듈(logh7-intel/coup.mjs)을
  // world에 1회 인스턴스만 한다 — 누적/조회는 전부 그 순수 모듈 책임(재작성 없음, 배선만).
  const intelState = createIntelState();
  const coupState = createCoupState();
  /** @type {{ active:boolean, mode:number, participants:Set<number>, log:object[] }} tactical battle */
  const battle = { active: false, mode: 0, participants: new Set(), log: [] };
  /**
   * 시나리오/세션 메타(A7). 캐논 시작은 801-07이지만 기본은 비어 있고 loadScenarioInto/setScenarioInfo로
   * 채운다. 0x2006 세션레코드(세션명)·턴/연도 진행·종료(엔딩)·진영별 원수(superMan) 게이트의 단일 출처.
   * @type {{ sessionName:string, startYear:number, currentTurn:number, term:number,
   *   ending:number, powers:{ powerId:number, faction:string, superMan:number }[] }}
   */
  let scenario = {
    sessionName: '',
    startYear: 0,
    currentTurn: 0,
    term: 0,
    ending: 0,
    powers: [],
  };

  // 진영별 전략 요약(支配惑星/要塞/総人口/艦艇数) — factionSummary()와 evaluateEnding()가 공유하는 closure.
  // (world-state는 익명 return이라 메서드 간 호출은 this 대신 이 closure를 쓴다 — 코드베이스 정합성.)
  const computeFactionSummary = () => {
    const acc = {};
    const bump = (f) => (acc[f] ??= { faction: f, controlledSystems: 0, controlledPlanets: 0, controlledFortresses: 0, totalPopulation: 0, shipCount: 0 });
    for (const sys of systems.values()) {
      const a = bump(sys.owner);
      a.controlledSystems += 1;
      a.controlledFortresses += sys.fortresses.length;
      for (const p of sys.planets) {
        bump(p.owner).controlledPlanets += 1;
        bump(p.owner).totalPopulation += p.population || 0;
      }
    }
    return acc;
  };

  // 더티-트래킹 리비전 — Hibernate 바이트코드 인핸스먼트(엔티티 setter 자동 계측)의 JS 대응. 권위적 상태를
  // 바꾸는 모든 mutator 호출마다 +1 되는 단조 카운터. 영속성 더티-게이트(saveSnapshot)가 "직전 영속화 이후
  // 변이가 있었나"를 O(1)로 판정해, 무변경이면 직렬화(toSnapshot)조차 생략하게 한다. 인메모리 전용(스냅샷 제외).
  let revision = 0;

  const api = {
    /** 더티-트래킹 리비전(영속성 게이트용). mutator 1회당 +1, 순수 reader 호출엔 불변. 인메모리 전용. */
    revision() { return revision; },

    // --- players ---
    addPlayer({ connectionId, charId = 0, powerId = 0, mode = 2 }) {
      const player = { connectionId, charId, powerId, mode };
      players.set(connectionId, player);
      return player;
    },
    removePlayer(connectionId) {
      return players.delete(connectionId);
    },
    getPlayer(connectionId) {
      return players.get(connectionId) ?? null;
    },
    hasPlayer(connectionId) {
      return players.has(connectionId);
    },
    listPlayers() {
      return [...players.values()];
    },
    playerCount() {
      return players.size;
    },

    // --- ships (tactical grid units) ---
    /**
     * Create/replace a ship in the authoritative grid. `owner` is the connectionId that controls it,
     * `faction` the side it fights for (combat targets the opposing faction). Combat pools (armor /
     * zanki 残機 / shield) default from the ship class (logh7-combat-engine) unless overridden. Used
     * when the tactical pool is populated (server-fed unit table, G196) or a unit spawns into battle.
     */
    upsertShip({ id, owner = 0, faction = 0, shipClass = 'cruiser', x = 0, y = 0, z = 0, heading = 0, state = 0, stats } = {}) {
      const base = shipClassStats(shipClass);
      const s = { ...base, ...(stats ?? {}) };
      // Per-direction shield arrays (0x341 FillShield wire fields): 6 facings, each initialised to
      // maxShield (the class cap divided evenly) at full charge. beamgunA/B map to the two beam banks
      // the 0x343 FillBeamGun record carries; fillA/fillB start at full capacity.
      const perDirShield = Math.round(s.maxShield / 6);
      const shieldMax = Array.from({ length: 6 }, () => perDirShield);
      const shieldFill = Array.from({ length: 6 }, () => perDirShield);
      const beamgunA = s.beamPower;
      const fillA = s.beamPower;
      const beamgunB = Math.round(s.beamPower / 2);
      const fillB = Math.round(s.beamPower / 2);
      const ship = {
        id, owner, faction, shipClass, x, y, z, heading, state,
        maxArmor: s.maxArmor, armor: s.maxArmor,
        maxZanki: s.maxZanki, zanki: s.maxZanki,
        maxShield: s.maxShield, shield: s.maxShield,
        beamPower: s.beamPower, defense: s.defense, morale: s.morale,
        destroyed: false,
        shieldMax, shieldFill, beamgunA, fillA, beamgunB, fillB,
      };
      ships.set(id, ship);
      return ship;
    },
    getShip(id) {
      return ships.get(id) ?? null;
    },
    /** Assign a ship's controlling owner (a connectionId). Returns the ship, or null if unknown. */
    claimShip(id, owner) {
      const ship = ships.get(id);
      if (!ship) {
        return null;
      }
      ship.owner = owner;
      return ship;
    },
    /** Release every ship owned by `owner` back to neutral (owner 0). Used when a player leaves. */
    releaseShipsOf(owner) {
      for (const ship of ships.values()) {
        if (ship.owner === owner) {
          ship.owner = 0;
        }
      }
    },
    listShips() {
      return [...ships.values()];
    },
    /** Apply an authoritative position move. Returns the updated ship, or null if it does not exist. */
    moveShip(id, { x, y, z, moveParam = 0, state }) {
      const ship = ships.get(id);
      if (!ship) {
        return null;
      }
      if (typeof x === 'number') ship.x = x;
      if (typeof y === 'number') ship.y = y;
      if (typeof z === 'number') ship.z = z;
      if (typeof moveParam === 'number') ship.moveParam = moveParam;
      if (typeof state === 'number') ship.state = state;
      return ship;
    },
    /** Apply an authoritative heading change. Returns the updated ship, or null if it does not exist. */
    turnShip(id, { heading, field0 = 0, field2 = 0 }) {
      const ship = ships.get(id);
      if (!ship) {
        return null;
      }
      if (typeof heading === 'number') ship.heading = heading;
      ship.turnField0 = field0;
      ship.turnField2 = field2;
      return ship;
    },

    // --- combat (space war) ---
    /**
     * Apply authoritative damage to a ship's combat pools. `pools` carries the POST-hit current values
     * (shieldAfter/armorAfter/zankiAfter, as computed by logh7-combat-engine.computeDamage). Marks the
     * ship destroyed when zanki and armor are both depleted. Returns { ship, destroyed } or null.
     */
    applyDamage(id, { shieldAfter, armorAfter, zankiAfter } = {}) {
      const ship = ships.get(id);
      if (!ship) {
        return null;
      }
      if (typeof shieldAfter === 'number') ship.shield = Math.max(0, shieldAfter);
      if (typeof armorAfter === 'number') ship.armor = Math.max(0, armorAfter);
      if (typeof zankiAfter === 'number') ship.zanki = Math.max(0, zankiAfter);
      ship.destroyed = ship.zanki <= 0; // hull (残機) depleted = ship lost
      return { ship, destroyed: ship.destroyed };
    },
    /** Remove a destroyed ship from the grid. Returns true if a ship was removed. */
    removeShip(id) {
      return ships.delete(id);
    },
    /** Living ships (not destroyed). */
    listLivingShips() {
      return [...ships.values()].filter((s) => !s.destroyed);
    },
    /**
     * Pick an authoritative target for an attacker: the nearest LIVING ship of a different faction.
     * Returns the target ship, or null if none. (The fire commands carry only the attacker ids; the
     * server resolves who is hit — anti-cheat authoritative.)
     */
    pickTarget(attackerId) {
      const attacker = ships.get(attackerId);
      if (!attacker) {
        return null;
      }
      let best = null;
      let bestDist = Infinity;
      for (const s of ships.values()) {
        // 항복(surrendered)한 함선은 무력화 상태 → 더는 표적이 되지 않는다(降伏勧告 효과, 3.4).
        if (s.id === attackerId || s.destroyed || s.surrendered || s.faction === attacker.faction) {
          continue;
        }
        const dx = s.x - attacker.x;
        const dy = s.y - attacker.y;
        const dz = s.z - attacker.z;
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist < bestDist) {
          bestDist = dist;
          best = s;
        }
      }
      return best;
    },
    /** Reduce a ship's morale (NotifyMoraleDown 0x440). Returns the ship or null. */
    lowerMorale(id, amount = 10) {
      const ship = ships.get(id);
      if (!ship) {
        return null;
      }
      ship.morale = Math.max(0, ship.morale - Math.max(0, amount));
      return ship;
    },
    /**
     * 함선을 항복(무력화) 상태로 만든다(降伏勧告 수락, 3.4). 격침이 아닌 비폭력 무력화: surrendered=true +
     * 사기 0. 이후 pickTarget이 표적에서 제외하고 NPC AI도 행동을 건너뛴다(전투 이탈). 함선은 전장에 남되
     * 전투엔 참여하지 않는다(접수/무력화 — 클라 항복 opcode 부재라 제거 대신 inert화, 클라싱크 이슈 회피).
     */
    markSurrendered(id) {
      const ship = ships.get(id);
      if (!ship) {
        return null;
      }
      ship.surrendered = true;
      ship.morale = 0;
      return ship;
    },
    /** 권위적 난수(0..1). 確率 규칙(降伏勧告 등)에서 사용 — seed 시 결정론, 아니면 Math.random. */
    rng() {
      return rng();
    },

    // --- tactical battle session ---
    /** Open a tactical battle (CommandChangeMode/grid-enter). `mode` mirrors the client stance byte. */
    openBattle({ mode = 0 } = {}) {
      battle.active = true;
      battle.mode = mode;
      return battle;
    },
    closeBattle() {
      battle.active = false;
      battle.participants.clear();
      return battle;
    },
    isBattleActive() {
      return battle.active;
    },
    joinBattle(connectionId) {
      battle.participants.add(connectionId);
      return battle.participants.size;
    },
    /** Append a combat event to the battle log (fire/damage/destruction) for replay/analysis. */
    logCombat(entry) {
      battle.log.push(entry);
      return entry;
    },
    battleLog() {
      return [...battle.log];
    },

    // --- 시나리오 / 세션 (A7): 턴·연도·종료·진영별 원수 ---
    /**
     * 시나리오/세션 메타를 부분 갱신한다(주어진 필드만 덮어쓰고 나머지는 유지). loadScenarioInto가
     * 시작 상태를 시드한 뒤 sessionName/startYear 등을 채울 때, 또는 턴 진행 중 갱신할 때 쓴다.
     */
    setScenarioInfo({ sessionName, startYear, currentTurn, term, ending, powers } = {}) {
      scenario = {
        sessionName: sessionName ?? scenario.sessionName,
        startYear: typeof startYear === 'number' ? startYear : scenario.startYear,
        currentTurn: typeof currentTurn === 'number' ? currentTurn : scenario.currentTurn,
        term: typeof term === 'number' ? term : scenario.term,
        ending: typeof ending === 'number' ? ending : scenario.ending,
        powers: Array.isArray(powers)
          ? powers.map((p) => ({ powerId: p.powerId ?? 0, faction: p.faction ?? 'neutral', superMan: p.superMan ?? 0 }))
          : scenario.powers,
      };
      return scenario;
    },
    /**
     * 현재 시나리오/세션 메타. 계약 형태:
     * {sessionName,startYear,currentTurn,term,ending,powers:[{powerId,faction,superMan}]}.
     */
    getScenarioInfo() {
      return {
        sessionName: scenario.sessionName,
        startYear: scenario.startYear,
        currentTurn: scenario.currentTurn,
        term: scenario.term,
        ending: scenario.ending,
        powers: scenario.powers.map((p) => ({ ...p })),
      };
    },
    /** 턴을 1(또는 n) 진행시키고 갱신된 currentTurn을 반환(권위적 시간 틱의 최소 훅). */
    advanceTurn(n = 1) {
      scenario.currentTurn += n;
      return scenario.currentTurn;
    },
    /** 종료 상태(승패/엔딩 코드)를 설정. */
    setEnding(ending) {
      scenario.ending = ending | 0;
      return scenario.ending;
    },
    /** Set a player's current mode byte (0 = tactical/battle, 2 = strategic — client+0x126711). */
    setPlayerMode(connectionId, mode) {
      const player = players.get(connectionId);
      if (!player) {
        return null;
      }
      player.mode = mode;
      return player;
    },

    // --- ground combat (地上戦): troops sortied onto a planet surface ---
    upsertTroop({ id, owner = 0, faction = 0, strength = 100, morale = 100, defense = 30, x = 0, y = 0, z = 0, landed = false } = {}) {
      const troop = { id, owner, faction, strength, maxStrength: strength, morale, defense, x, y, z, landed, defeated: false };
      troops.set(id, troop);
      return troop;
    },
    getTroop(id) {
      return troops.get(id) ?? null;
    },
    listTroops() {
      return [...troops.values()];
    },
    /** Mark a troop sortied (landed on the surface). Returns the troop or null. */
    sortieTroop(id, { x, y, z } = {}) {
      const troop = troops.get(id);
      if (!troop) {
        return null;
      }
      troop.landed = true;
      if (typeof x === 'number') troop.x = x;
      if (typeof y === 'number') troop.y = y;
      if (typeof z === 'number') troop.z = z;
      return troop;
    },
    /** Nearest living enemy-faction troop to `attackerId` (ground target resolution). */
    pickTroopTarget(attackerId) {
      const attacker = troops.get(attackerId);
      if (!attacker) {
        return null;
      }
      let best = null;
      let bestDist = Infinity;
      for (const t of troops.values()) {
        if (t.id === attackerId || t.defeated || t.faction === attacker.faction) {
          continue;
        }
        const dx = t.x - attacker.x;
        const dz = t.z - attacker.z;
        const dist = dx * dx + dz * dz;
        if (dist < bestDist) {
          bestDist = dist;
          best = t;
        }
      }
      return best;
    },
    /** Apply a ground-combat result to a defender troop. Returns { troop, defeated } or null. */
    applyLandCombat(defenderId, { strengthAfter, moraleAfter } = {}) {
      const troop = troops.get(defenderId);
      if (!troop) {
        return null;
      }
      if (typeof strengthAfter === 'number') troop.strength = Math.max(0, strengthAfter);
      if (typeof moraleAfter === 'number') troop.morale = Math.max(0, moraleAfter);
      troop.defeated = troop.strength <= 0;
      return { troop, defeated: troop.defeated };
    },

    // --- galaxy (strategic systems: ownership + planets) ---
    /** Seed the strategic map from a content pack's systems (each starts owned by its canon faction). */
    seedSystems(packSystems = []) {
      for (const s of packSystems) {
        systems.set(s.name, {
          name: s.name,
          owner: s.faction ?? 'neutral',
          isCorridor: Boolean(s.isCorridor),
          map: s.map ?? null,
          fortresses: Array.isArray(s.fortresses) ? s.fortresses.slice() : [],
          planets: (s.planets ?? []).map((p) => ({
            ...p,
            name: p.name,
            orbit: p.orbit ?? 0,
            inferredPosition: p.inferredPosition ?? null,
            owner: p.owner ?? s.faction ?? 'neutral',
            population: p.population ?? 0,
          })),
        });
      }
      return systems.size;
    },
    getSystem(name) {
      return systems.get(name) ?? null;
    },
    /** Set only a system's controlling faction (e.g. a contested flip). Null if unknown. */
    setSystemOwner(name, owner) {
      const sys = systems.get(name);
      if (!sys) {
        return null;
      }
      sys.owner = owner;
      return sys;
    },
    /**
     * Conquer a system: transfer the system AND every planet in it to the conqueror (full occupation).
     * Returns the updated system, or null if unknown. This is the strategic effect of taking a system.
     */
    conquerSystem(name, owner) {
      const sys = systems.get(name);
      if (!sys) {
        return null;
      }
      sys.owner = owner;
      for (const p of sys.planets) {
        p.owner = owner;
      }
      return sys;
    },
    listSystems() {
      return [...systems.values()];
    },
    systemCount() {
      return systems.size;
    },
    /**
     * Per-faction strategic summary computed from the galaxy + ship state — the nation-record fields
     * the client renders (constmsg: 支配惑星 controlledPlanets / 支配要塞 controlledFortresses /
     * 総人口 totalPopulation / 艦艇数 shipCount). Keyed by faction.
     */
    factionSummary() {
      // ships are keyed by owner connectionId, not faction; count is reported separately per faction
      // via the player table when available. Here we expose the galaxy-derived fields.
      return computeFactionSummary();
    },

    /**
     * 결정적 승리(完全勝利) 평가 — 교전 진영 중 성계를 보유한 진영이 정확히 1개면 그 진영의 완전승리.
     * 매뉴얼의 "完全勝利 시 쿠데타 불가" 게이트가 참조하는 종료 상태. neutralFactions(페잔/중립/미소유)는
     * 교전 진영에서 제외한다. 결정되면(아직 ending 미설정 시) scenario.ending=1(P3 "결정됨" 마커 — 캐논
     * 종료코드는 미확정이라 진영별 코드를 날조하지 않고 generic 마커만 세운다)로 표시하고 winner를 반환한다.
     * @param {{ neutralFactions?: Array<string|number> }} [opts]
     * @returns {{ over: boolean, winner: (string|number|null) }}
     */
    evaluateEnding({ neutralFactions = ['neutral', 0, '0', ''], minSystems = 0 } = {}) {
      const neutral = new Set(neutralFactions);
      const summary = computeFactionSummary();
      const belligerents = Object.values(summary)
        .filter((f) => f.controlledSystems > 0 && !neutral.has(f.faction));
      let over = false;
      let winner = null;
      if (belligerents.length === 1) {
        // 교전 진영이 1개만 성계 보유(나머지 전멸) → 완전승리.
        over = true;
        winner = belligerents[0].faction;
      } else if (belligerents.length >= 2 && minSystems > 0) {
        // 캐논 §1.6: 어느 교전 진영의 지배 성계(首都 포함)가 ≤minSystems로 떨어지면 세션 종료, 최다 보유
        // 진영 승리. minSystems는 호출자가 갤럭시 규모에 맞춰 준다(전략틱=3 캐논, 소규모 테스트=0=전멸만).
        const sorted = [...belligerents].sort((a, b) => b.controlledSystems - a.controlledSystems);
        if (sorted[sorted.length - 1].controlledSystems <= minSystems) {
          over = true;
          winner = sorted[0].faction;
        }
      }
      // 캐논 게이트(매뉴얼 p78 "no coup at session end" / 감사 L129 인과 정정): 진행 중인 쿠데타 모의가
      // 하나라도 있으면 完全勝利(세션 종료)를 박탈한다. 인과는 "완전승리→쿠데타 불가"가 아니라
      // "쿠데타 진행 중→완전승리 보류"(canStartCoup의 잘못된 decisiveVictory 게이트를 여기로 이주). coupState는
      // createWorldState가 1회 인스턴스 — activeCount()>0이면 over를 취소(승자 미확정으로 되돌림).
      if (over && coupState.activeCount() > 0) {
        over = false;
        winner = null;
      }
      if (over && scenario.ending === 0) {
        scenario.ending = 1; // P3 generic "decided" 마커(캐논 종료코드 미확정 → 진영코드 날조 금지)
      }
      return { over, winner };
    },

    // --- strategic fleets (sector-map units; feed the 0x0325 ResponseInformationUnit table, A1/A2) ---
    /**
     * Create/replace a strategic fleet entity. This is the authoritative source for the 0x58-byte
     * unit-table element the client renders on the sector map (A1 builder reads these fields). `id`
     * must equal the owning character record's flagship/grid-unit id (char@0x24) so the client's
     * world-entry binding (FUN_004c2a80) links PLAYER_INFO to this fleet. `boats` is the fleet's
     * troop_units list (≤10 sub-unit ids); excess entries are dropped to the client's parser cap.
     * Data VALUES are P3 seeds unless proven; the WIRE shape they fill is P0.
     */
    upsertFleet({ id, owner = 0, faction = 0, commander = 0, cell = 0, boats = [], supply = 0, mapSection = 0 } = {}) {
      const fleet = {
        id,
        owner,
        faction,
        commander,
        cell,
        boats: Array.isArray(boats) ? boats.slice(0, 10) : [],
        supply,
        mapSection,
      };
      fleets.set(id, fleet);
      return fleet;
    },
    getFleet(id) {
      return fleets.get(id) ?? null;
    },
    listFleets() {
      return [...fleets.values()];
    },
    fleetCount() {
      return fleets.size;
    },
    /** Move a fleet to a new strategic cell. Returns the updated fleet, or null if unknown. */
    moveFleet(id, cell) {
      const fleet = fleets.get(id);
      if (!fleet) {
        return null;
      }
      fleet.cell = cell;
      return fleet;
    },
    removeFleet(id) {
      return fleets.delete(id);
    },

    // --- 전투 캐릭터 레지스트리 (戦死/降伏勧告/艦隊最大士気 해소의 사령관 데이터 출처) ---
    /**
     * 캐릭터를 등록/갱신한다(주어진 필드만 반영, 나머지 기본). leadership=統率(PCP index0). flagship=기함
     * 함선 id(char+0x24). returnPlanet/birthplace=帰還惑星(戦死 워프 목적지). deathToggle=戦死 옵트인.
     * alive/injured는 전투 해소가 갱신하는 런타임 상태.
     */
    upsertCharacter({ id, faction = 'neutral', leadership = 0, rank = 0, flagship = 0, returnPlanet = null, birthplace = null, deathToggle = false, alive = true, injured = false, abilities = null, age = 0, achievement = 0, title = null, socialClass = null, fiefs = null } = {}) {
      if (id == null) return null;
      const ch = {
        id, faction, leadership, rank, flagship, returnPlanet, birthplace,
        deathToggle: Boolean(deathToggle), alive: Boolean(alive), injured: Boolean(injured),
        // 연령효과(年齢効果) 월간 드리프트의 입력. abilities=8능력치(PCP/MCP, content/character-roster.json),
        // age=연령. 둘 다 있으면 applyMonthlyAgeDrift가 매월 능력치를 ±확률 변동시킨다(없으면 no-op).
        abilities: Array.isArray(abilities) ? abilities.map((v) => Number(v) || 0) : null,
        age: Number(age) || 0,
        // 계급사다리(5법칙) 입력 — runMonthlyPromotions(자동진급)이 사용. achievement=功績, title=작위(爵位).
        achievement: Number(achievement) || 0,
        title,
        // 작위 수여 게이트(validateGrantTitle)용 출신 계급 + 봉토 추적. personnelState.addCharacter()와
        // 동일 필드명으로 world-state↔personnel-state 시드 일관성 유지.
        socialClass: socialClass ?? null,
        fiefs: Array.isArray(fiefs) ? [...fiefs] : null,
      };
      characters.set(id, ch);
      return ch;
    },
    getCharacter(id) {
      return characters.get(id) ?? null;
    },
    /** 함선 id로 그 함선을 기함으로 둔 캐릭터(사령관)를 찾는다 — 戦死 판정의 함선↔캐릭터 역인덱스. */
    getCharacterByFlagship(shipId) {
      const sid = shipId >>> 0;
      for (const ch of characters.values()) {
        if ((ch.flagship >>> 0) === sid) return ch;
      }
      return null;
    },
    listCharacters() {
      return [...characters.values()];
    },
    characterCount() {
      return characters.size;
    },

    // --- 첩보/쿠데타 상태 접근자(諜報·叛乱) ---
    // 공유 인스턴스 핸들. coup_conduct 생산자(personnel 0x0356 빌더)·완전승리 박탈(evaluateEnding)·전략틱
    // 충성 누적(addCoupLoyalty)이 같은 인스턴스를 본다. 인스턴스만 노출하고 누적/판정 로직은 순수 모듈에 위임.
    getIntelState() {
      return intelState;
    },
    getCoupState() {
      return coupState;
    },
    /**
     * 月間(30게임일) 연령효과 드리프트를 전 캐릭터에 적용한다(Phase B §B5 4.6, age-drift 모듈). abilities(8능력치)
     * + age를 가진 살아있는 캐릭터만 대상: 젊으면 향상·노년이면 쇠퇴 경향으로 능력치별 확률 변동(권위적 rng 구동).
     * abilities/age 미보유 캐릭터는 건너뜀(no-op) → 시나리오가 능력치를 시드하지 않아도 안전. 무유저 갤럭시에서
     * createStrategicSim이 월간 경계마다 호출(시간이 흐르면 인물도 성장/쇠퇴). 변동된 캐릭터 수를 반환.
     * @returns {{ drifted:number, scanned:number }}
     */
    applyMonthlyAgeDrift() {
      let drifted = 0;
      let scanned = 0;
      for (const ch of characters.values()) {
        if (!ch.alive) continue;
        if (!Array.isArray(ch.abilities) || ch.abilities.length === 0 || !ch.age) continue;
        scanned += 1;
        const rolls = ch.abilities.map(() => rng());
        const next = applyAgeDrift(ch.abilities, ch.age, rolls);
        if (next.some((v, i) => v !== ch.abilities[i])) drifted += 1;
        ch.abilities = next;
      }
      return { drifted, scanned };
    },
    /**
     * 月間 자동진급(캐논 §5.3): 각 사다리(faction×track×rank, 大佐이하)의 5법칙 #1을 다음 계급으로(목표 정원
     * 여유 시). autoPromoteLadders(rank-ladder, sortLadder 기반)로 후보 산출 후 적용 — rank↑ + 功績=목표 사다리
     * 평균(캐논, 수동진급 →0과 구분). 살아있는 캐릭터만. 무유저 갤럭시에서 createStrategicSim 월간 훅이 호출하면
     * 시나리오로 시드된 사령관단이 시간이 흐르며 진급한다(age 불필요 — abilities/功績만으로 서열). 진급 목록 반환.
     * @returns {Array<{charId:number, fromRank:number, toRank:number}>}
     */
    runMonthlyPromotions({ maxAutoRank = 8, trackOf } = {}) {
      const all = [...characters.values()].filter((c) => c.alive);
      const promotions = autoPromoteLadders(all, { maxAutoRank, trackOf: trackOf ?? (() => 'military') });
      for (const p of promotions) {
        const ch = characters.get(p.charId);
        if (!ch) continue;
        const peers = all.filter((c) => (Number(c.rank) || 0) === p.toRank && c.faction === ch.faction);
        ch.achievement = peers.length
          ? Math.round(peers.reduce((s, c) => s + (Number(c.achievement) || 0), 0) / peers.length)
          : 0;
        ch.rank = p.toRank;
      }
      return promotions.map((p) => ({ charId: p.charId, fromRank: p.fromRank, toRank: p.toRank }));
    },
    /**
     * 격침된 함선이 어떤 캐릭터의 旗艦이면 戦死(戦闘死) 규칙을 적용하고 캐릭터 런타임 상태(alive/injured)를
     * 갱신한다(3.2). 旗艦이 아니면 null. command-engine(플레이어 명령)·npc-ai(자율 전투) 양쪽이 격침 분기에서
     * 호출 → 戦死가 모든 전투 경로에서 일관 적용된다. 함선 제거(removeShip)는 호출자 몫(전술 그리드 이탈).
     * @returns {{ charId:number, outcome:'injured'|'killed', warpTo?:any, evalAward?:number }|null}
     */
    resolveFlagshipLoss(shipId) {
      const sid = shipId >>> 0;
      let ch = null;
      for (const c of characters.values()) {
        if ((c.flagship >>> 0) === sid) { ch = c; break; }
      }
      if (!ch) return null;
      const result = resolveFlagshipDestroyed({
        deathToggle: ch.deathToggle,
        rank: ch.rank,
        faction: ch.faction,
        returnPlanet: ch.returnPlanet,
        birthplace: ch.birthplace,
      });
      ch.alive = result.alive; // 런타임 상태 갱신(저장된 캐릭터 객체 변이)
      ch.injured = result.injured;
      return {
        charId: ch.id,
        outcome: result.outcome,
        ...(result.outcome === 'injured' ? { warpTo: result.warpTo } : { evalAward: result.evalAward }),
      };
    },

    // --- chat ---
    appendChat(entry) {
      chatLog.push(entry);
      return entry;
    },
    chatCount() {
      return chatLog.length;
    },
    listChat() {
      return [...chatLog];
    },

    // --- 게임 클록 (24× 공용 인프라) ---
    gameClock() {
      return clock;
    },
    gameDayOf(nowMs) {
      return clock.gameDayOf(nowMs);
    },
    gameMonthOf(nowMs) {
      return clock.gameMonthOf(nowMs);
    },

    // --- 영속성 (DB 스냅샷) ---
    // 인메모리 authoritative 상태를 JSON 직렬화 가능한 평범한 스냅샷으로 덤프한다(영속성 포트가 DB로 기록).
    // Map은 값 배열로, Set(battle.participants)은 배열로 변환한다. 동적 전역 상태만 담는다(콘텐츠 시드 아님).
    toSnapshot() {
      // 엔티티를 복제해 스냅샷이 라이브 객체를 별칭(alias)하지 않게 한다 — 이전엔 얕은 배열복사라 저장 후
      // moveShip/conquerSystem 등 in-place 변이가 보관된 스냅샷(메모리 backend)을 오염시켰다. 스칼라 엔티티는
      // 얕은복사로 충분, characters.abilities·systems.planets/fortresses 등 변이되는 중첩배열은 복제한다.
      return {
        clockStartMs: clock.startMs, // 게임 시간 기준점(재시작 후 시간 연속성)
        rngState, // 결정론 시드 월드의 난수열 연속성(seed 없으면 미사용 — 무해)
        players: [...players.values()].map((p) => ({ ...p })),
        ships: [...ships.values()].map((s) => ({ ...s })),
        troops: [...troops.values()].map((t) => ({ ...t })),
        fleets: [...fleets.values()].map((f) => ({ ...f })),
        characters: [...characters.values()].map((ch) => ({ ...ch, abilities: Array.isArray(ch.abilities) ? [...ch.abilities] : ch.abilities })),
        systems: [...systems.entries()].map(([name, state]) => ({
          name, ...state,
          planets: (state.planets ?? []).map((p) => ({ ...p })),
          fortresses: [...(state.fortresses ?? [])],
        })),
        chatLog: [...chatLog],
        battle: { active: battle.active, mode: battle.mode, participants: [...battle.participants], log: [...battle.log] },
        scenario: { ...scenario, powers: scenario.powers.map((p) => ({ ...p })) }, // A7 세션/턴 메타
      };
    },
    // 스냅샷에서 상태를 복원한다(부팅 시 DB 로드). 현재 상태를 비우고 스냅샷으로 채운다.
    restore(snapshot = {}) {
      if (snapshot.clockStartMs != null) clock = createGameClock({ startMs: snapshot.clockStartMs });
      if (snapshot.rngState != null) rngState = snapshot.rngState >>> 0; // 결정론 난수열 연속성 복원
      players.clear(); ships.clear(); troops.clear(); fleets.clear(); systems.clear(); characters.clear();
      chatLog.length = 0;
      // 스냅샷 객체를 복제해 저장 — 복원된 월드의 in-place 변이가 원본 스냅샷/다른 월드를 오염시키지 않게 한다.
      for (const p of snapshot.players ?? []) players.set(p.connectionId, { ...p });
      for (const s of snapshot.ships ?? []) ships.set(s.id, { ...s });
      for (const t of snapshot.troops ?? []) troops.set(t.id, { ...t });
      for (const f of snapshot.fleets ?? []) fleets.set(f.id, { ...f });
      for (const ch of snapshot.characters ?? []) characters.set(ch.id, { ...ch, abilities: Array.isArray(ch.abilities) ? [...ch.abilities] : ch.abilities });
      for (const sys of snapshot.systems ?? []) {
        const { name, ...state } = sys;
        systems.set(name, { ...state, planets: (state.planets ?? []).map((p) => ({ ...p })), fortresses: [...(state.fortresses ?? [])] });
      }
      for (const c of snapshot.chatLog ?? []) chatLog.push(c);
      const b = snapshot.battle ?? {};
      battle.active = Boolean(b.active);
      battle.mode = b.mode ?? 0;
      battle.participants = new Set(b.participants ?? []);
      battle.log = [...(b.log ?? [])];
      const sc = snapshot.scenario ?? {};
      scenario = {
        sessionName: sc.sessionName ?? '',
        startYear: sc.startYear ?? 0,
        currentTurn: sc.currentTurn ?? 0,
        term: sc.term ?? 0,
        ending: sc.ending ?? 0,
        powers: Array.isArray(sc.powers) ? sc.powers.map((p) => ({ ...p })) : [],
      };
    },
  };

  // mutator 자동 계측 — reader 화이트리스트에 없는 모든 메서드를 래핑해, 호출 시 revision을 1 올린다.
  // ★Hibernate 인핸스먼트 원리: 새 mutator를 추가해도 자동 추적된다(누락 불가 = 데이터 무손실). reader
  //   분류를 빠뜨리면 그 메서드가 mutator로 취급돼 과다저장(느려질 뿐, 정확성은 유지 = safe-failure 방향).
  //   rng()는 seed 월드에서 rngState(영속 대상)를 전진시키므로 일부러 reader에서 제외 → mutator로 계측한다.
  //   메서드는 closure만 쓰고 this를 안 쓰지만(파일 상단 주석), 만일에 대비해 apply(api)로 수신자를 보존한다.
  const READERS = new Set([
    'revision',
    'getPlayer', 'hasPlayer', 'listPlayers', 'playerCount',
    'getShip', 'listShips', 'listLivingShips', 'pickTarget',
    'getTroop', 'listTroops', 'pickTroopTarget',
    'getSystem', 'listSystems', 'systemCount', 'factionSummary',
    'getFleet', 'listFleets', 'fleetCount',
    'getCharacter', 'getCharacterByFlagship', 'listCharacters', 'characterCount',
    'getIntelState', 'getCoupState',
    'isBattleActive', 'battleLog',
    'getScenarioInfo',
    'chatCount', 'listChat',
    'gameClock', 'gameDayOf', 'gameMonthOf',
    'toSnapshot',
  ]);
  for (const [name, fn] of Object.entries(api)) {
    if (typeof fn !== 'function' || READERS.has(name)) continue;
    api[name] = (...args) => { revision += 1; return fn.apply(api, args); };
  }
  return api;
}
