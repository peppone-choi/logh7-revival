/**
 * NPC AI — autonomous behavior for the canon characters the player does NOT control.
 *
 * Most of LOGH VII's ~97 named officers are NPCs: they command fleets and must act on their own, in
 * character. This module turns a commander's REAL ability stats (from content/character-roster.json:
 * 統率tochi/政治seiji/運用unei/情報joho/指揮shiki/機動kido/攻撃kogeki/防御bogyo) into a behavior profile,
 * then drives that commander's ships each server tick: close on the enemy, open fire in range, or pull
 * back when the fleet is crippled. It reuses the authoritative combat engine + world state, so an NPC
 * fleet fights by exactly the same rules a player does (and produces the same Notify* the clients render).
 *
 * Pure + synchronous (deterministic given the state + an explicit tick seed) → fully unit-testable.
 */

import { computeDamage } from './logh7-combat-engine.mjs';
import {
  buildNotifyAttackedShipInner,
  buildNotifyMovedShipInner,
  buildNotifyTurnedShipInner,
} from './logh7-login-protocol.mjs';

// LOGH_COMBAT_LEADERSHIP=1: 자율(NPC) 사격에도 사령관 統率 변조를 대칭 적용(플레이어 전투와 동일 규칙).
// command-engine.commandModifierOpts와 동일 로직 — npc-ai↔command-engine 결합 회피 위해 6줄 복제. 기본 off →
// NPC 전투 밸런스 불변. 統率은 P3 설계 확장(캐논 효과는 士気/降伏)임은 computeDamage 주석 참조.
const combatLeadershipEnabled = () => process.env.LOGH_COMBAT_LEADERSHIP === '1';
const commandModifierOpts = (state, attackerId, targetId) => {
  if (!combatLeadershipEnabled() || typeof state.getCharacterByFlagship !== 'function') {
    return undefined;
  }
  const attackerCmdr = state.getCharacterByFlagship(attackerId);
  const targetCmdr = state.getCharacterByFlagship(targetId);
  return { attackerCommand: attackerCmdr?.leadership ?? 0, targetCommand: targetCmdr?.leadership ?? 0 };
};

/**
 * Derive a behavior profile from a commander character's 8 abilities (0..~120 each). Personality emerges
 * from the real stats: an aggressive high-攻撃 officer (e.g. Bittenfeld) charges and fires early; a
 * cautious high-防御 officer holds and retreats sooner; high-指揮 improves accuracy/damage; high-機動
 * lets the fleet reposition faster.
 * @param {{ kogeki?:number, bogyo?:number, shiki?:number, kido?:number, tochi?:number }} stats
 */
export function behaviorProfile(stats = {}) {
  const n = (v, d = 80) => (Number.isFinite(v) ? v : d);
  const aggression = n(stats.kogeki) / 120; // 0..~1 — fire/pursuit eagerness
  const caution = n(stats.bogyo) / 120; // 0..~1 — retreat threshold
  const command = n(stats.shiki) / 120; // 0..~1 — damage/accuracy multiplier
  const mobility = n(stats.kido) / 120; // 0..~1 — move step per tick
  return {
    aggression,
    caution,
    command,
    mobility,
    // fire when the target is within this squared distance; bolder commanders engage from further out.
    fireRangeSq: (60 + aggression * 140) ** 2,
    // retreat when fleet integrity (current zanki/maxZanki) drops below this; cautious commanders bail earlier.
    retreatBelow: 0.15 + caution * 0.35,
    // per-tick move step (world units); mobile commanders close faster.
    moveStep: 8 + mobility * 22,
    // damage multiplier applied to this commander's fire (command skill).
    damageMul: 0.8 + command * 0.5,
  };
}

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * Decide one NPC ship's action given the world. Returns { action, targetId?, x?, z?, heading? }.
 * action ∈ 'fire' | 'move' | 'retreat' | 'hold'.
 */
export function decideShipAction(state, ship, profile) {
  const target = state.pickTarget(ship.id);
  const integrity = ship.maxZanki > 0 ? ship.zanki / ship.maxZanki : 1;
  if (!target) {
    return { action: 'hold' };
  }
  // crippled → retreat away from the nearest enemy.
  if (integrity <= profile.retreatBelow) {
    const dx = ship.x - target.x;
    const dz = ship.z - target.z;
    const len = Math.hypot(dx, dz) || 1;
    return {
      action: 'retreat',
      x: ship.x + (dx / len) * profile.moveStep,
      z: ship.z + (dz / len) * profile.moveStep,
      heading: Math.atan2(dx, dz),
    };
  }
  // in range → fire.
  if (dist2(ship, target) <= profile.fireRangeSq) {
    return { action: 'fire', targetId: target.id };
  }
  // else close on the target.
  const dx = target.x - ship.x;
  const dz = target.z - ship.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    action: 'move',
    x: ship.x + (dx / len) * profile.moveStep,
    z: ship.z + (dz / len) * profile.moveStep,
    heading: Math.atan2(dx, dz),
  };
}

/**
 * Run one NPC tick: every NPC-controlled ship (owner === 0 here means server/NPC-held; faction != 0 so it
 * has a side to fight for) acts per its commander's profile. Mutates authoritative state and returns the
 * Notify* inners to broadcast to all clients, plus a structured action log.
 *
 * @param {object} state world state (createWorldState)
 * @param {{ profileByFaction?: Record<number, ReturnType<typeof behaviorProfile>>, defaultProfile?: object }} opts
 *   profileByFaction lets each faction's NPC fleet inherit its commander's personality.
 * @returns {{ notifies: {inner:Buffer,target:'all'}[], actions: object[] }}
 */
export function runNpcTick(state, { profileByFaction = {}, defaultProfile } = {}) {
  const fallback = defaultProfile ?? behaviorProfile({});
  const notifies = [];
  const actions = [];
  for (const ship of state.listShips()) {
    if (ship.destroyed || ship.surrendered || ship.owner !== 0 || ship.faction === 0) {
      continue; // only NPC-held (owner 0), faction-aligned, non-surrendered ships act autonomously
    }
    const profile = profileByFaction[ship.faction] ?? fallback;
    const decision = decideShipAction(state, ship, profile);
    actions.push({ shipId: ship.id, ...decision });
    if (decision.action === 'fire') {
      const target = state.getShip(decision.targetId);
      if (!target) continue;
      const dmg = computeDamage({ ...ship, beamPower: Math.round(ship.beamPower * profile.damageMul) }, target, 'shoot', commandModifierOpts(state, ship.id, target.id));
      state.applyDamage(target.id, dmg);
      state.logCombat({ event: 'npc-fire', attackerId: ship.id, targetId: target.id, ...dmg });
      notifies.push({ inner: buildNotifyAttackedShipInner({ attackerId: ship.id, targetId: target.id, armorDamage: dmg.armorDamage, zankiDamage: dmg.zankiDamage, shieldDamage: dmg.shieldDamage, hitLoc: dmg.hitLoc }), target: 'all' });
      if (dmg.destroyed) {
        // 戦死(3.2): 격침된 함선이 NPC 사령관의 旗艦이면 負傷/사망 처리(world-state 공용 경로 — 플레이어
        // 전투와 일관). 자율 전투에서도 캐논 사령관의 생사가 갱신된다(전사한 NPC 사령관 = roster 반영).
        const loss = typeof state.resolveFlagshipLoss === 'function' ? state.resolveFlagshipLoss(target.id) : null;
        if (loss) actions.push({ shipId: ship.id, killed: target.id, flagshipLoss: loss });
        state.removeShip(target.id);
      }
    } else if (decision.action === 'move' || decision.action === 'retreat') {
      state.moveShip(ship.id, { x: decision.x, y: ship.y, z: decision.z });
      if (typeof decision.heading === 'number') state.turnShip(ship.id, { heading: decision.heading });
      notifies.push({ inner: buildNotifyMovedShipInner({ shipId: ship.id, x: decision.x, y: ship.y, z: decision.z }), target: 'all' });
      if (typeof decision.heading === 'number') {
        notifies.push({ inner: buildNotifyTurnedShipInner({ shipId: ship.id }), target: 'all' });
      }
    }
  }
  return { notifies, actions };
}
