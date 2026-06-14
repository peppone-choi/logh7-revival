/**
 * Authoritative in-world command engine — the "승인 / 거부 → 상태 갱신 → Notify 브로드캐스트" core.
 *
 * The relay (logh7-world-relay) blindly rebroadcasts a client's command frame to the others. This
 * engine replaces that with authority: an inbound Command* is parsed, validated against the
 * authoritative world state, applied to that state, and turned into the canonical Notify* the
 * other clients render. The server — not the client — decides whether an action is legal and what
 * its effect is.
 *
 * processCommand returns a decision: { accept, reject?, notifies: [{ inner, target }] } where
 *   target = 'others' (everyone except the actor) | 'all' (including the actor).
 * The caller (auth-server) frames each notify inner and broadcasts per target.
 *
 * Implemented authoritatively now: chat (0x0f1c / 0x0f1d). Movement codes (0x0400 CommandMoveShip,
 * 0x0402, 0xb01 CommandMoveGrid) are validated-then-relayed for now (their 1052-byte wire parse,
 * FUN_004be8f0, is not fully reversed yet); applyShipMove/applyShipTurn provide the authoritative
 * path the move handler will switch to once that parse lands. Everything here is pure + synchronous
 * so it is fully unit-testable without a live client.
 */
import {
  COMMAND_GRID_CHAT_CODE,
  buildCommandGridChatInner,
  buildNotifyMovedGridInner,
  buildNotifyMovedShipInner,
  buildNotifyTurnedShipInner,
  buildNotifyAttackedShipInner,
  buildNotifyChangeModeInner,
  buildNotifyMoraleDownInner,
  buildNotifyMovedTroopInner,
  buildNotifyLandCombatInner,
  buildNotifySortieInner,
} from './logh7-login-protocol.mjs';
import {
  COMMAND_WARP_SHIP_CODE,
  COMMAND_ATTACK_SHIP_CODE,
  COMMAND_SHOOT_SHIP_CODE,
  COMMAND_FIGHT_CODE,
  COMMAND_CHANGE_MODE_CODE,
  COMMAND_SORTIE_TROOPS_CODE,
  COMMAND_ATTACK_TROOP_CODE,
  parseInboundAttack,
  parseInboundChangeMode,
  parseInboundSortie,
  computeDamage,
  resolveLandCombat,
} from './logh7-combat-engine.mjs';
// --- internal affairs (内政) domain processors (self-contained modules, each with its own state) ---
import { createPersonnelState, processPersonnel } from './logh7-personnel.mjs';
import { createStrategyState, processStrategy } from './logh7-strategy.mjs';
import { createLogisticsState, processLogistics, LOGISTICS_COMMAND_CODES } from './logh7-logistics.mjs';
import { createSocialState, processSocial, isSocialCommandCode } from './logh7-social.mjs';
import { createBattleOpsState, processBattleOps } from './logh7-battle-ops.mjs';
import { createAccountState, processAccount, isAccountCommandCode } from './logh7-account.mjs';
import { openBattleField } from './logh7-battle-engine.mjs';

const PERSONNEL_CODE_LO = 0x0704;
const PERSONNEL_CODE_HI = 0x0709;
const STRATEGY_CODE_LO = 0x0900;
const STRATEGY_CODE_HI = 0x0906;
// LOGISTICS_COMMAND_CODES is exported as an array; normalize to a Set for O(1) membership.
const LOGISTICS_CODE_SET = new Set(LOGISTICS_COMMAND_CODES);
// Battle-ops C->S codes (maneuver siblings + fleet/base ops) routed to processBattleOps.
const BATTLE_OPS_CODE_SET = new Set([
  0x0401, 0x0403, 0x040a, // TurnShip / ReverseShip / Stop
  0x0408, 0x0409, 0x040b, 0x040c, 0x040d, 0x040e, 0x0413, 0x0414, 0x0419, 0x041f, 0x0420, 0x0421, 0x0422, // fleet ops
  0x041a, 0x041b, 0x041c, 0x041d, 0x041e, // base ops
]);

/**
 * Route an inbound 内政 (internal-affairs) command to its domain processor. Each domain keeps its OWN
 * in-memory state, lazily created and cached on the world-state object (so it persists across calls
 * without coupling createWorldState to every domain). Returns the domain decision, or null if `innerCode`
 * is not an internal-affairs command (so processCommand falls through to its combat/chat/move handlers).
 */
function routeInternalAffairs({ state, player, connectionId, innerCode, inner }) {
  if (innerCode >= PERSONNEL_CODE_LO && innerCode <= PERSONNEL_CODE_HI) {
    state._personnel ??= createPersonnelState();
    return processPersonnel({ state: state._personnel, connectionId, innerCode, inner });
  }
  if (innerCode >= STRATEGY_CODE_LO && innerCode <= STRATEGY_CODE_HI) {
    state._strategy ??= createStrategyState();
    return processStrategy({ state: state._strategy, connectionId, innerCode, inner, power: player.powerId ?? 0 });
  }
  if (LOGISTICS_CODE_SET.has(innerCode)) {
    state._logistics ??= createLogisticsState();
    return processLogistics({ state: state._logistics, connectionId, innerCode, inner });
  }
  if (isSocialCommandCode(innerCode)) {
    state._social ??= createSocialState();
    state._social.join?.(connectionId, player.charId);
    return processSocial({ state: state._social, connectionId, innerCode, inner });
  }
  if (BATTLE_OPS_CODE_SET.has(innerCode)) {
    state._battleOps ??= createBattleOpsState();
    return processBattleOps({ state: state._battleOps, connectionId, innerCode, inner });
  }
  if (isAccountCommandCode(innerCode)) {
    state._account ??= createAccountState();
    state._account.join?.(connectionId, { accountId: player.charId });
    return processAccount({ state: state._account, connectionId, innerCode, inner });
  }
  return null;
}

export const COMMAND_SPOT_CHAT_CODE = 0x0f1d;
export const COMMAND_MOVE_SHIP_CODE = 0x0400;
export const COMMAND_PARALLEL_MOVE_SHIP_CODE = 0x0402;
export const COMMAND_MOVE_GRID_CODE = 0x0b01;

export const MAX_CHAT_TEXT = 65; // FUN_004b5600 caps the wide-char message at 0x41
export const MAX_MOVE_UNITS = 32; // Input_CommandMoveShip errors if unit/to_position size "over than 32"

// Trailing move params live at fixed body offsets (independent of unitCount, since the 1052B body is
// fixed-size with zero padding). Decoded from FUN_004be8f0/FUN_004bf4c0 — see docs/logh7-moveship-wire.md.
const MOVE_SPEED_OFF = 0x290; // f32 move speed scalar (param_2[0xa4])
const MOVE_ARRIVAL_HEADING_OFF = 0x294; // f32 final facing on arrival (param_2[0xa5])
const MOVE_FORMATION_COUNT_OFF = 0x298; // u8 formation member count - 1 (param_2[0xa6])
const MOVE_FORMATION_OFFSETS_OFF = 0x29c; // f32[3] table, stride 12 (param_2+0xa7)
const MOVE_UNIT_STRIDE = 20; // 5 dwords per unit entry @16

const finiteOr = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);

/**
 * Fully parse an inbound CommandMoveShip (0x0400) / CommandParallelMoveShip (0x0402) — FUN_004be8f0 /
 * FUN_004bf320, byte-identical except the move-kind tag. The raw inner is [u16 BE code][body]; the
 * 1052-byte body (little-endian) is: unit count = byte @12, then a unit-entry array @16 (stride 20B /
 * 5 dwords): [u32 shipId][f32 heading][f32 targetX][f32 targetZ][f32 targetY]. Trailing fixed fields:
 * f32 speed @0x290, f32 arrivalHeading @0x294, u8 formationCount @0x298, f32[3] formationOffsets
 * @0x29c. Coordinates are continuous world floats on the XZ plane (same space as NotifyMovedShip
 * 0x0423) — no grid quantization. Returns null if too short. `unitIds` is kept for back-compat.
 * Evidence: docs/logh7-moveship-wire.md (FUN_004c8110 per-unit field map, FUN_004bf4c0 commit).
 */
export function parseInboundMoveShip(inner) {
  const body = inner.subarray(2);
  if (body.length < 16) {
    return null;
  }
  const count = body.readUInt8(12);
  const unitIds = [];
  const units = [];
  for (let i = 0; i < count; i += 1) {
    const off = 16 + i * MOVE_UNIT_STRIDE;
    if (off + 4 > body.length) {
      break;
    }
    const shipId = body.readUInt32LE(off);
    unitIds.push(shipId);
    // Target floats only present when the full 20-byte entry fits (real 1052B body); for a truncated
    // test/probe body that carries ids only, default the pose to the origin so the command still parses.
    const hasPose = off + MOVE_UNIT_STRIDE <= body.length;
    units.push({
      shipId,
      heading: hasPose ? finiteOr(body.readFloatLE(off + 4)) : 0,
      x: hasPose ? finiteOr(body.readFloatLE(off + 8)) : 0,
      z: hasPose ? finiteOr(body.readFloatLE(off + 12)) : 0,
      y: hasPose ? finiteOr(body.readFloatLE(off + 16)) : 0,
    });
  }
  const hasTrailer = body.length >= MOVE_FORMATION_OFFSETS_OFF;
  const speed = hasTrailer ? finiteOr(body.readFloatLE(MOVE_SPEED_OFF)) : 0;
  const arrivalHeading = hasTrailer ? finiteOr(body.readFloatLE(MOVE_ARRIVAL_HEADING_OFF)) : 0;
  const formationCount = hasTrailer ? body.readUInt8(MOVE_FORMATION_COUNT_OFF) : 0;
  const formationOffsets = [];
  for (let i = 0; i < formationCount; i += 1) {
    const off = MOVE_FORMATION_OFFSETS_OFF + i * 12;
    if (off + 12 > body.length) {
      break;
    }
    formationOffsets.push({
      dx: finiteOr(body.readFloatLE(off)),
      dz: finiteOr(body.readFloatLE(off + 8)),
    });
  }
  return { count, unitIds, units, speed, arrivalHeading, formation: { count: formationCount, offsets: formationOffsets } };
}

/**
 * Parse an inbound CommandMoveGrid (0x0b01, 36B / 9 dwords). The raw inner is [u16 BE code][body];
 * the body is 3 header dwords then [u32 unitId @0x0c][u32 destCell @0x10] (inferred — the send-side
 * builder is unsymbolized; the consumer FUN_004bea90 is an empty stub). Returns null if too short.
 * Evidence: docs/logh7-strategic-input-wire.md §2.
 */
export function parseInboundMoveGrid(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x14) {
    return null;
  }
  return { unitId: body.readUInt32LE(0x0c), destCell: body.readUInt32LE(0x10) };
}

/**
 * Parse an inbound CommandGridChat/CommandSpotChat inner (client SEND form, G193): the raw inner is
 * [u16 BE code][u32 0][u32 time][u8 castType][u8 msgLen][wide chars]. Returns the decoded message.
 */
export function parseInboundChat(inner) {
  // inner[0..1] = code (BE), body starts at +2.
  const body = inner.subarray(2);
  if (body.length < 10) {
    return null;
  }
  const time = body.readUInt32LE(4);
  const castType = body.readUInt8(8);
  const msgLen = body.readUInt8(9);
  const available = Math.max(0, Math.floor((body.length - 10) / 2));
  const count = Math.min(msgLen, available, MAX_CHAT_TEXT);
  let text = '';
  for (let i = 0; i < count; i += 1) {
    text += String.fromCharCode(body.readUInt16LE(10 + i * 2));
  }
  return { time, castType, msgLen, text };
}

/** Authoritative ship move: mutate state and produce a NotifyMovedShip inner. Null if no such ship. */
export function applyShipMove(state, { shipId, x = 0, y = 0, z = 0, moveParam = 0, stateByte = 0xff }) {
  const ship = state.moveShip(shipId, { x, y, z, moveParam, state: stateByte < 0 ? undefined : stateByte });
  if (!ship) {
    return null;
  }
  return buildNotifyMovedShipInner({ shipId, x, y, z, moveParam, stateByte });
}

/** Authoritative ship turn: mutate state and produce a NotifyTurnedShip inner. Null if no such ship. */
export function applyShipTurn(state, { shipId, heading = 0, field0 = 0, field2 = 0 }) {
  const ship = state.turnShip(shipId, { heading, field0, field2 });
  if (!ship) {
    return null;
  }
  return buildNotifyTurnedShipInner({ shipId, field0, field2 });
}

/**
 * Process an inbound in-world command from `connectionId`.
 * @param {{ state: ReturnType<import('./logh7-world-state.mjs').createWorldState>, connectionId: number, innerCode: number, inner: Buffer }} args
 * @returns {{ accept: boolean, reject?: string, notifies: { inner: Buffer, target: 'others'|'all' }[] }}
 */
export function processCommand({ state, connectionId, innerCode, inner }) {
  const player = state.getPlayer(connectionId);
  if (!player) {
    return { accept: false, reject: 'not-in-world', notifies: [] };
  }

  if (innerCode === COMMAND_GRID_CHAT_CODE || innerCode === COMMAND_SPOT_CHAT_CODE) {
    const parsed = parseInboundChat(inner);
    if (!parsed || parsed.text.length === 0) {
      return { accept: false, reject: 'empty-chat', notifies: [] };
    }
    if (parsed.msgLen > MAX_CHAT_TEXT) {
      return { accept: false, reject: 'chat-too-long', notifies: [] };
    }
    state.appendChat({
      connectionId,
      charId: player.charId,
      text: parsed.text,
      channel: parsed.castType,
      time: parsed.time,
    });
    // Build the canonical receive-form chat the other clients render (sanitized, server-attributed).
    const notify = buildCommandGridChatInner({
      text: parsed.text,
      channel: parsed.castType,
      time: parsed.time,
      castType: parsed.castType,
    });
    return { accept: true, notifies: [{ inner: notify, target: 'others' }] };
  }

  if (innerCode === COMMAND_MOVE_SHIP_CODE || innerCode === COMMAND_PARALLEL_MOVE_SHIP_CODE) {
    // Full authoritative move (FUN_004be8f0 fully reversed — docs/logh7-moveship-wire.md): parse the
    // per-unit target poses, validate against the client's own bound (1..32 units), enforce ownership,
    // apply to authoritative world state, and emit the canonical NotifyMovedShip 0x0423 (+ 0x0424 when
    // facing changes) the OTHER clients render. The server — not the relayed raw command — decides each
    // ship's final position, so positions stay consistent and a forged command can't move a foreign ship.
    const move = parseInboundMoveShip(inner);
    if (!move || move.count === 0 || move.count > MAX_MOVE_UNITS) {
      return { accept: false, reject: 'invalid-move', notifies: [] };
    }
    // Anti-cheat ownership: you may only command ships you own. A ship the server does not know about
    // is allowed (ownership not seeded for it); a known ship owned by someone else is rejected. owner
    // 0 = neutral/unassigned (allowed).
    for (const unitId of move.unitIds) {
      const ship = state.getShip(unitId);
      if (ship && ship.owner !== 0 && ship.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
    }
    // Build authoritative notifies from the parsed targets. The coordinate space is identical to
    // 0x0423 (continuous world floats, XZ plane) so the parsed (x,y,z) feed the notify directly.
    const notifies = [];
    for (const unit of move.units) {
      // Apply to state when the ship is known; otherwise still propagate the move (in-world ships are
      // not always pre-seeded). moveParam carries the speed scalar so clients interpolate correctly.
      const moveParam = Math.max(0, Math.round(move.speed)) & 0xffffffff;
      const moved =
        applyShipMove(state, { shipId: unit.shipId, x: unit.x, y: unit.y, z: unit.z, moveParam }) ??
        buildNotifyMovedShipInner({ shipId: unit.shipId, x: unit.x, y: unit.y, z: unit.z, moveParam });
      notifies.push({ inner: moved, target: 'others' });
      // Emit a turn only when the command carries a non-zero heading change.
      if (Number.isFinite(unit.heading) && unit.heading !== 0) {
        const turned =
          applyShipTurn(state, { shipId: unit.shipId, heading: unit.heading }) ??
          buildNotifyTurnedShipInner({ shipId: unit.shipId });
        notifies.push({ inner: turned, target: 'others' });
      }
    }
    return { accept: true, units: move.unitIds, notifies };
  }

  if (innerCode === COMMAND_MOVE_GRID_CODE) {
    // Strategic fleet move (0x0b01, 36B/9 dwords): the player orders a fleet to a destination cell.
    // Authoritative path (docs/logh7-strategic-input-wire.md): parse [hdr 3 dwords][u32 unitId @0x0c]
    // [u32 destCell @0x10], enforce ownership, then broadcast the canonical NotifyMovedGrid 0x0b07 to
    // ALL in-world clients (including the mover, so their own fleet visibly relocates). The 0x0b01
    // consumer FUN_004bea90 is an empty stub, so the server-built 0x0b07 — not a relayed echo — is
    // what actually moves the fleet on every client.
    const move = parseInboundMoveGrid(inner);
    if (!move) {
      return { accept: false, reject: 'invalid-grid-move', notifies: [] };
    }
    const ship = state.getShip(move.unitId);
    if (ship && ship.owner !== 0 && ship.owner !== connectionId) {
      return { accept: false, reject: 'not-owner', notifies: [] };
    }
    const notify = buildNotifyMovedGridInner({ units: [{ unitId: move.unitId, cell: move.destCell }] });
    return { accept: true, units: [move.unitId], notifies: [{ inner: notify, target: 'all' }] };
  }

  if (innerCode === COMMAND_ATTACK_SHIP_CODE || innerCode === COMMAND_SHOOT_SHIP_CODE) {
    // SPACE WAR — authoritative fire resolution. The client SENDS its selected attacker ships
    // (CommandShootShip 0x406 = beam volley, CommandAttackShip 0x405 = sustained) and only renders
    // damage when the server broadcasts NotifyAttackedShip 0x426. So the server: validates ownership,
    // picks each attacker's target (nearest enemy-faction living ship), computes authoritative damage
    // (logh7-combat-engine.computeDamage), mutates the target, and broadcasts the canonical 0x0426 to
    // ALL in-world clients (incl. the attacker, who must see the hit). Destroyed ships are logged +
    // removed. A forged command can only fire ships the connection owns.
    const parsed = parseInboundAttack(inner);
    if (!parsed || parsed.count === 0) {
      return { accept: false, reject: 'invalid-attack', notifies: [] };
    }
    const kind = innerCode === COMMAND_SHOOT_SHIP_CODE ? 'shoot' : 'attack';
    const notifies = [];
    const hits = [];
    for (const attackerId of parsed.attackerIds) {
      const attacker = state.getShip(attackerId);
      // Ownership: you may only fire ships you own (owner 0 = neutral/unseeded, allowed for tests).
      if (attacker && attacker.owner !== 0 && attacker.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // Explicit target if the command carried one and it is a valid living enemy; else auto-pick.
      let target = parsed.targetId ? state.getShip(parsed.targetId) : null;
      if (!target || target.destroyed || (attacker && target.faction === attacker.faction)) {
        target = state.pickTarget(attackerId);
      }
      if (!attacker || !target) {
        continue; // nothing to shoot at (no seeded ships / no enemy) — accepted, no effect
      }
      const dmg = computeDamage(attacker, target, kind);
      state.applyDamage(target.id, dmg);
      state.logCombat({ event: 'attacked', kind, attackerId, targetId: target.id, ...dmg });
      hits.push({ attackerId, targetId: target.id, destroyed: dmg.destroyed });
      notifies.push({
        inner: buildNotifyAttackedShipInner({
          attackerId,
          targetId: target.id,
          weaponType: parsed.weaponType & 0xff,
          armorDamage: dmg.armorDamage,
          zankiDamage: dmg.zankiDamage,
          shieldDamage: dmg.shieldDamage,
          hitLoc: dmg.hitLoc,
        }),
        target: 'all',
      });
      if (dmg.destroyed) {
        state.removeShip(target.id);
      }
    }
    return { accept: true, hits, notifies };
  }

  if (innerCode === COMMAND_CHANGE_MODE_CODE) {
    // Fleet stance / formation change (and tactical-battle entry marker). Parse the mode + the units,
    // record the player's mode + open a battle session, then broadcast the canonical NotifyChangeMode
    // 0x042f to ALL clients (apply FUN_004c1c30 re-stances every listed unit on each client).
    const parsed = parseInboundChangeMode(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-change-mode', notifies: [] };
    }
    state.setPlayerMode(connectionId, parsed.mode);
    state.openBattle({ mode: parsed.mode });
    state.joinBattle(connectionId);
    // LIVE BATTLE-ENTRY GRANT: push the full battle-setup sequence (openBattleField) — place ships
    // (0x349) -> tactics stats (0x33b/0x341/0x343) -> NotifyChangeMode 0x42f spawn poses (flips the
    // client tactical pool on) -> NotifyTactics 0x0f1f (begin). Participants + poses come from the
    // authoritative world state. This is the message the original server used to make the client a
    // controllable tactical battle (docs/logh7-proto-battle-core.md §3 FSM).
    const participants = parsed.units.map((u) => {
      const ship = state.getShip(u.unitId);
      return {
        shipId: u.unitId,
        heading: ship?.heading ?? 0, x: ship?.x ?? 0, z: ship?.z ?? 0, y: ship?.y ?? 0,
        maxShield: ship?.maxShield, shield: ship?.shield, beamPower: ship?.beamPower, morale: ship?.morale,
      };
    });
    const steps = openBattleField({ participants, anchorId: parsed.leaderId, modeKind: parsed.mode });
    const notifies = steps.map((s) => ({ inner: s.inner, target: s.target ?? 'all' }));
    return { accept: true, mode: parsed.mode, notifies };
  }

  if (innerCode === COMMAND_WARP_SHIP_CODE) {
    // Tactical warp jump: same body shape as fire (attacker id array). Without the full 0x0425
    // NotifyWarpedShip layout pinned, treat warp as an authoritative reposition acknowledged via the
    // move notify so other clients still see the jump (placeholder until 0x0425 is fully reversed).
    const parsed = parseInboundAttack(inner);
    if (!parsed || parsed.count === 0) {
      return { accept: false, reject: 'invalid-warp', notifies: [] };
    }
    const notifies = [];
    for (const shipId of parsed.attackerIds) {
      const ship = state.getShip(shipId);
      if (ship && ship.owner !== 0 && ship.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      const moved =
        applyShipMove(state, { shipId, x: ship?.x ?? 0, y: ship?.y ?? 0, z: ship?.z ?? 0 }) ??
        buildNotifyMovedShipInner({ shipId });
      notifies.push({ inner: moved, target: 'others' });
    }
    return { accept: true, units: parsed.attackerIds, notifies };
  }

  if (innerCode === COMMAND_FIGHT_CODE) {
    // Auto-resolved melee/engagement: each side trades fire until one breaks. Resolve as a single
    // exchange between the player's first ship and the nearest enemy, broadcasting the damage notify.
    const parsed = parseInboundAttack(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-fight', notifies: [] };
    }
    const notifies = [];
    for (const attackerId of parsed.attackerIds) {
      const attacker = state.getShip(attackerId);
      if (attacker && attacker.owner !== 0 && attacker.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      const target = state.pickTarget(attackerId);
      if (!attacker || !target) {
        continue;
      }
      const dmg = computeDamage(attacker, target, 'fight');
      state.applyDamage(target.id, dmg);
      state.lowerMorale(target.id, 15);
      state.logCombat({ event: 'fought', attackerId, targetId: target.id, ...dmg });
      notifies.push({ inner: buildNotifyAttackedShipInner({ attackerId, targetId: target.id, armorDamage: dmg.armorDamage, zankiDamage: dmg.zankiDamage, shieldDamage: dmg.shieldDamage, hitLoc: dmg.hitLoc }), target: 'all' });
      notifies.push({ inner: buildNotifyMoraleDownInner({ shipId: target.id, morale: target.morale }), target: 'all' });
      if (dmg.destroyed) {
        state.removeShip(target.id);
      }
    }
    return { accept: true, notifies };
  }

  if (innerCode === COMMAND_SORTIE_TROOPS_CODE || innerCode === COMMAND_ATTACK_TROOP_CODE) {
    // GROUND COMBAT (地上戦): the player sorties troops onto a planet surface; each engages the nearest
    // enemy troop. Server resolves the ground exchange (resolveLandCombat) and broadcasts the canonical
    // NotifySortie 0x437 + NotifyMovedTroop 0x429 + NotifyLandCombat 0x42a to all clients.
    const parsed = parseInboundSortie(inner);
    if (!parsed || parsed.count === 0) {
      return { accept: false, reject: 'invalid-sortie', notifies: [] };
    }
    const notifies = [];
    const results = [];
    for (const troopId of parsed.troopIds) {
      const troop = state.getTroop(troopId);
      if (troop && troop.owner !== 0 && troop.owner !== connectionId) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      if (!troop) {
        continue;
      }
      state.sortieTroop(troopId, {});
      notifies.push({ inner: buildNotifySortieInner({ unitId: troopId }), target: 'all' });
      notifies.push({ inner: buildNotifyMovedTroopInner({ troopId, x: troop.x, y: troop.y, z: troop.z }), target: 'all' });
      const enemy = state.pickTroopTarget(troopId);
      if (enemy) {
        const r = resolveLandCombat(troop, enemy);
        state.applyLandCombat(enemy.id, { strengthAfter: r.strengthAfter, moraleAfter: r.moraleAfter });
        state.logCombat({ event: 'land-combat', attackerId: troopId, defenderId: enemy.id, dealt: r.dealt, defeated: r.defeated });
        results.push({ attackerId: troopId, defenderId: enemy.id, defeated: r.defeated });
        notifies.push({ inner: buildNotifyLandCombatInner({ unitId: enemy.id, result: r.result }), target: 'all' });
      }
    }
    return { accept: true, results, notifies };
  }

  // Internal-affairs (内政) — personnel / strategy / logistics / social. Routed last so the combat,
  // chat and move handlers above keep their existing fast paths (e.g. CommandGridChat/SpotChat).
  const internalAffairs = routeInternalAffairs({ state, player, connectionId, innerCode, inner });
  if (internalAffairs) {
    return internalAffairs;
  }

  return { accept: false, reject: 'unknown-command', notifies: [] };
}
