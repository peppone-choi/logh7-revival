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

/** @typedef {{ connectionId: number, charId: number, powerId: number, mode: number }} Player */
/**
 * @typedef {{ id:number, owner:number, faction:number, shipClass:string, x:number, y:number, z:number,
 *   heading:number, state:number, maxArmor:number, armor:number, maxZanki:number, zanki:number,
 *   maxShield:number, shield:number, beamPower:number, defense:number, morale:number, destroyed:boolean }} Ship
 */

export function createWorldState() {
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
  /** @type {{ active:boolean, mode:number, participants:Set<number>, log:object[] }} tactical battle */
  const battle = { active: false, mode: 0, participants: new Set(), log: [] };

  return {
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
      const ship = {
        id, owner, faction, shipClass, x, y, z, heading, state,
        maxArmor: s.maxArmor, armor: s.maxArmor,
        maxZanki: s.maxZanki, zanki: s.maxZanki,
        maxShield: s.maxShield, shield: s.maxShield,
        beamPower: s.beamPower, defense: s.defense, morale: s.morale,
        destroyed: false,
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
        if (s.id === attackerId || s.destroyed || s.faction === attacker.faction) {
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
          fortresses: Array.isArray(s.fortresses) ? s.fortresses.slice() : [],
          planets: (s.planets ?? []).map((p) => ({
            name: p.name, orbit: p.orbit ?? 0, owner: s.faction ?? 'neutral', population: 0,
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
      // ships are keyed by owner connectionId, not faction; count is reported separately per faction
      // via the player table when available. Here we expose the galaxy-derived fields.
      return acc;
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
  };
}
