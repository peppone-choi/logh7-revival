/**
 * Authoritative BATTLE-OPS engine — the remaining in-battle 0x04xx command family (maneuver siblings,
 * fleet ops, base/fortress ops) and their matching S→C Notify broadcasts.
 *
 * The LOGH VII client is a thin renderer in a tactical battle: it SENDS a maneuver/op command
 * (CommandTurnShip 0x401, CommandRepairFleet 0x413, CommandShootFortress 0x419, …) and only changes
 * its on-screen state when the SERVER broadcasts the matching Notify (NotifyTurnedShip 0x424,
 * NotifyRepairFleet 0x42d, NotifyShootFortress 0x436, …). So the server owns battle truth. This module:
 *   - parses every remaining battle command (offsets per docs/logh7-proto-battle-fleetops.md +
 *     docs/logh7-proto-battle-core.md, with the shared 3/4-dword header model),
 *   - holds a small authoritative in-battle state (per-unit repair/supply tag, morale, fleet
 *     authority, fortress position) that the commands mutate,
 *   - and supplies every S→C Notify builder (0x423/0x424 maneuver echoes, 0x42c/0x42d/0x42e/0x431/
 *     0x432/0x433/0x434/0x435/0x436/0x438/0x439/0x43a/0x43b/0x43c/0x43d/0x43e/0x3f/0x441/0x442).
 *
 * EVIDENCE (Ghidra G7MTClient, index .omo/ghidra/export/G7MTClient) — see the two spec docs for the
 * full per-field tables with vtable readers (+0x0c=f32 / +0x14=u16 / +0x1c=u32 / +0x24=u8), dispatch
 * sizes (FUN_004b8b00), and the parser/apply fns. High-confidence fields are implemented fully; the
 * spec's confidence-medium fields (single-id ops with no Input_ serializer; fixed-size notify inner
 * layouts inferred from dispatch size + the mirror command) are noted in the JSDoc and packed in the
 * documented order. NEVER invents a layout: sizes are ground-truth from WORLD_RESPONSE_OBJECT_SIZES.
 *
 * SELF-CONTAINED (does NOT edit world-state/command-engine): exports the CODES, parseInbound* /
 * buildNotify* fns, a createBattleOpsState() factory, and processBattleOps(ctx) — the validate →
 * mutate → broadcast entry the lead routes the 0x04xx range to. Pure + synchronous => unit-testable.
 *
 * INTEGRATION: route these inner codes to processBattleOps({state, connectionId, innerCode, inner}) →
 *   maneuver: 0x401 0x403 0x40a
 *   fleet ops: 0x408 0x409 0x40b 0x40c 0x40d 0x40e 0x413 0x414 0x419 0x41f 0x420 0x421 0x422
 *   base ops:  0x41a 0x41b 0x41c 0x41d 0x41e
 */

import {
  buildLobbyResponseInner,
  buildNotifyMovedShipInner,
  buildNotifyTurnedShipInner,
} from './logh7-login-protocol.mjs';

// ============================================================================================
// CODES — C->S commands (docs §1-6) and S->C notifies (docs §7). Sizes annotated from the
// dispatch table WORLD_RESPONSE_OBJECT_SIZES (FUN_004b8b00 ground truth).
// ============================================================================================

// --- maneuver siblings of CommandMoveShip 0x400 (battle-core §4-6) ---
export const COMMAND_TURN_SHIP_CODE = 0x0401; // body 0x114, parser FUN_004bef70; 8B/unit {id,f32}
export const COMMAND_REVERSE_SHIP_CODE = 0x0403; // body 0x114, relay (TurnShip shape)
export const COMMAND_STOP_CODE = 0x040a; // body 0x114, relay (TurnShip shape)

// --- fleet ops (fleetops §2-6) ---
export const COMMAND_SUGGESTION_CODE = 0x0408; // body 0x18 (header+3 dwords), medium
export const COMMAND_ENCOURAGE_FLAGSHIP_CODE = 0x0409; // body 0x10 (header + flagshipId), medium
export const COMMAND_ADMISSION_CODE = 0x040b; // body 0x94, 4-dword header + target_size + ids
export const COMMAND_CONTROL_CODE = 0x040c; // body 0x20, per-ship subsystem power profile
export const COMMAND_FILE_FLEET_CODE = 0x040d; // body 0x294, stride-20 move entries + flag
export const COMMAND_AIR_BATTLE_CODE = 0x040e; // body 0x98, id-list (SortieTroops shape)
export const COMMAND_REPAIR_FLEET_CODE = 0x0413; // body 0x14, {target,source}
export const COMMAND_SUPPLY_FLEET_CODE = 0x0414; // body 0x14, {target,source}
export const COMMAND_SHOOT_FORTRESS_CODE = 0x0419; // body 0x14, {fortressId, f32 angle}
export const COMMAND_MOVE_FORTRESS_CODE = 0x041f; // body 0x1a4, fortress path
export const COMMAND_CHANGE_AUTHORITY_CODE = 0x0420; // body 0x94, ids@0x10 + newCommander@0x90
export const COMMAND_MISSION_CODE = 0x0421; // body 0x98, ids@0x10 + flags + target@0x94
export const COMMAND_EMERGENCY_SUPPLY_CODE = 0x0422; // body 0x14, {targetId, source/amount}

// --- base ops (fleetops §4; share the 0x94 target_size shape / 0x10 single-id shape) ---
export const COMMAND_ADMISSION_BASE_CODE = 0x041a; // body 0x94, base admission
export const COMMAND_REPAIR_BASE_CODE = 0x041b; // body 0x94, base repair
export const COMMAND_SUPPLY_BASE_CODE = 0x041c; // body 0x94, base supply
export const COMMAND_ENCOURAGE_BASE_CODE = 0x041d; // body 0x10, base encourage
export const COMMAND_STOP_BASE_CODE = 0x041e; // body 0x10, base stop

// --- S->C notifies (sizes = dispatch ground truth) ---
export const NOTIFY_MOVED_SHIP_CODE = 0x0423; // 0x1c — reused for Stop (position halt)
export const NOTIFY_TURNED_SHIP_CODE = 0x0424; // 0x0c — Turn/Reverse echo
export const NOTIFY_ENCOURAGE_FLAGSHIP_CODE = 0x042c; // 0xfc, Input FUN_004a7260 (HIGH)
export const NOTIFY_REPAIR_FLEET_CODE = 0x042d; // 0x10
export const NOTIFY_SUPPLY_FLEET_CODE = 0x042e; // 0x10
export const NOTIFY_AIR_BATTLE_CODE = 0x0428; // 0x18
export const NOTIFY_TACTICS_CHIEF_COMMANDER_CODE = 0x0431; // 0x08
export const NOTIFY_ENCOURAGE_BASE_CODE = 0x0432; // 0xfc (shares 0x42c shape)
export const NOTIFY_REPAIR_BASE_CODE = 0x0433; // 0x10
export const NOTIFY_SUPPLY_BASE_CODE = 0x0434; // 0x10
export const NOTIFY_MOVED_FORTRESS_CODE = 0x0435; // 0x14
export const NOTIFY_SHOOT_FORTRESS_CODE = 0x0436; // 0x8c, Input FUN_004a8c10 (HIGH)
export const NOTIFY_EMERGENCY_SUPPLY_BASE_CODE = 0x0438; // 0x10
export const NOTIFY_CHANGED_AUTHORITY_CODE = 0x0439; // 0x88, Input FUN_004a94d0 (HIGH)
export const NOTIFY_CHARACTER_ACHIEVEMENT_CODE = 0x043a; // 0x0c (功績)
export const NOTIFY_OUTFIT_ACHIEVEMENT_CODE = 0x043b; // 0x0c
export const NOTIFY_MISSION_RESULT_CODE = 0x043c; // 0x10
export const NOTIFY_CONFUSION_UNIT_CODE = 0x043d; // 0x08
export const NOTIFY_CONFUSION_RECOVERED_UNIT_CODE = 0x043e; // 0x08
export const NOTIFY_SHOOT_BASE_CODE = 0x043f; // 0x10
export const NOTIFY_BLACK_HOLE_SUCTION_CODE = 0x0441; // 0x04
export const NOTIFY_FINISH_OCCUPATION_CODE = 0x0442; // 0x08

// --- caps / shared header geometry ---
export const MAX_BATTLE_UNITS = 32; // "unit_size over than 32" guard (<0x21)
export const MAX_ENCOURAGE_UNITS = 61; // NotifyEncourageFlagship bound (<0x3e)
const HEADER_3DWORD = 0x10; // time@0, wait@4, field8@8, count@0xc, ids@0x10
const ID_STRIDE = 4;
const TURN_ENTRY_STRIDE = 8; // {u32 shipId; f32 heading}

// ============================================================================================
// PARSER HELPERS
// ============================================================================================

/** Read a u32[] of `count` ids from `body` at `off` (stride 4); stops cleanly at buffer end. */
function readU32Array(body, off, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const at = off + i * ID_STRIDE;
    if (at + 4 > body.length) {
      break;
    }
    out.push(body.readUInt32LE(at));
  }
  return out;
}

/** Read the shared 3-dword header {time, wait, field8} from a body. */
function readHeader(body) {
  return { time: body.readUInt32LE(0x00), wait: body.readUInt32LE(0x04), field8: body.readUInt32LE(0x08) };
}

// ============================================================================================
// PARSERS (C->S). All bodies LE; inner = [u16 BE code][body] → parse body = inner.subarray(2).
// ============================================================================================

/**
 * Parse the TurnShip-family body shape (0x401 Turn / 0x403 Reverse / 0x40a Stop — battle-core §4-6).
 * Body 0x114: header(12) + u8 unitCount@0x0c + entries@0x10 stride 8 {u32 shipId; f32 heading} +
 * trailing f32 turnParam@0x110. Confidence: Turn HIGH (parser FUN_0049b040); Reverse/Stop medium-high
 * (same dispatch size + "over than 32" guard; client relays). Returns null if too short.
 */
export function parseInboundTurn(inner) {
  const body = inner.subarray(2);
  if (body.length < HEADER_3DWORD) {
    return null;
  }
  const count = Math.min(body.readUInt8(0x0c), MAX_BATTLE_UNITS);
  const units = [];
  for (let i = 0; i < count; i += 1) {
    const off = HEADER_3DWORD + i * TURN_ENTRY_STRIDE;
    if (off + 8 > body.length) {
      break;
    }
    units.push({ shipId: body.readUInt32LE(off), heading: body.readFloatLE(off + 4) });
  }
  const turnParam = body.length >= 0x114 ? body.readFloatLE(0x110) : 0;
  return { ...readHeader(body), count, units, turnParam };
}

/**
 * Parse CommandRepairFleet 0x413 / CommandSupplyFleet 0x414 (fleetops §2; parsers FUN_004c13a0 /
 * FUN_004c14a0). Body 0x14: header(12) + u32 targetUnitId@0x0c (param_2[3]) + u32 sourceUnitId@0x10
 * (param_2[4]). On apply the client records who is servicing whom (tag 2=repair / 1=supply). Null if short.
 */
export function parseInboundRepairSupply(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x14) {
    return null;
  }
  return { ...readHeader(body), targetUnitId: body.readUInt32LE(0x0c), sourceUnitId: body.readUInt32LE(0x10) };
}

/**
 * Parse CommandEmergencySupply 0x422 (fleetops §2, medium). Body 0x14: header(12) + targetId@0x0c +
 * source/amount@0x10. No dedicated parser (single-id request); layout inferred from the 0x14 size + the
 * repair/supply sibling. Null if short.
 */
export function parseInboundEmergencySupply(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x14) {
    return null;
  }
  return { ...readHeader(body), targetId: body.readUInt32LE(0x0c), amount: body.readUInt32LE(0x10) };
}

/**
 * Parse CommandEncourageFlagship 0x409 (fleetops §3, medium). Body 0x10: header(12) + flagshipId@0x0c.
 * Single-target morale boost. No dedicated parser; layout from the 0x10 dispatch size. Null if short.
 */
export function parseInboundEncourageFlagship(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x10) {
    return null;
  }
  return { ...readHeader(body), flagshipId: body.readUInt32LE(0x0c) };
}

/**
 * Parse CommandStopBase 0x41e / CommandEncourageBase 0x41d (base ops, medium). Body 0x10: header(12) +
 * baseId@0x0c (single-id base op, same shape as EncourageFlagship). Null if short.
 */
export function parseInboundBaseSingle(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x10) {
    return null;
  }
  return { ...readHeader(body), baseId: body.readUInt32LE(0x0c) };
}

/**
 * Parse CommandSuggestion 0x408 (fleetops §3, medium). Body 0x18: header(12) + 3 dwords (targetId,
 * suggestionType, arg). No count loop / Input_ serializer; layout from the 0x18 dispatch size. Null if short.
 */
export function parseInboundSuggestion(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x18) {
    return null;
  }
  return {
    ...readHeader(body),
    targetId: body.readUInt32LE(0x0c),
    suggestionType: body.readUInt32LE(0x10),
    arg: body.readUInt32LE(0x14),
  };
}

/**
 * Parse CommandControl 0x40c (fleetops §3; text serializer FUN_00495b70, full field names — HIGH).
 * Per-ship subsystem power/damage-control profile. Body 0x20: header(12) + u32 unit@0x0c + u16
 * condenser@0x10 + u8 beam@0x12 + u8 aux@0x13 + u8 shield[6]@0x14 + u8 engine@0x1a + u8 warp@0x1b +
 * u8 sensor@0x1c. Null if short.
 */
export function parseInboundControl(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x1d) {
    return null;
  }
  const shield = [];
  for (let i = 0; i < 6; i += 1) {
    shield.push(body.readUInt8(0x14 + i));
  }
  return {
    ...readHeader(body),
    unit: body.readUInt32LE(0x0c),
    condenser: body.readUInt16LE(0x10),
    beam: body.readUInt8(0x12),
    aux: body.readUInt8(0x13),
    shield,
    engine: body.readUInt8(0x1a),
    warp: body.readUInt8(0x1b),
    sensor: body.readUInt8(0x1c),
  };
}

/**
 * Parse CommandAdmission 0x40b + base variants 0x41a/0x41b/0x41c (fleetops §4; Input FUN_0049e340 —
 * HIGH). 4-dword header. Body 0x94: time@0x00, wait@0x04, field8@0x08, targetId@0x0c, u8
 * target_size@0x10, then unitIds[]@0x14 stride 4. Null if short.
 */
export function parseInboundAdmission(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x14) {
    return null;
  }
  const count = Math.min(body.readUInt8(0x10), MAX_BATTLE_UNITS);
  return { ...readHeader(body), targetId: body.readUInt32LE(0x0c), count, unitIds: readU32Array(body, 0x14, count) };
}

/**
 * Parse CommandAirBattle 0x40e (fleetops §1 SortieTroops family; parser FUN_004be8c0). Body 0x98:
 * header(12) + u8 unitCount@0x0c + unitIds[]@0x10 stride 4. Null if short.
 */
export function parseInboundIdList(inner) {
  const body = inner.subarray(2);
  if (body.length < HEADER_3DWORD) {
    return null;
  }
  const count = Math.min(body.readUInt8(0x0c), MAX_BATTLE_UNITS);
  return { ...readHeader(body), count, unitIds: readU32Array(body, HEADER_3DWORD, count) };
}

/**
 * Parse CommandShootFortress 0x419 (fleetops §5; parser FUN_004bfa10 — HIGH). Body 0x14: header(12) +
 * u32 fortressId@0x0c (base table) + f32 angle@0x10 (fire heading, radians; client builds a beam
 * endpoint via sin/cos). Null if short.
 */
export function parseInboundShootFortress(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x14) {
    return null;
  }
  return { ...readHeader(body), fortressId: body.readUInt32LE(0x0c), angle: body.readFloatLE(0x10) };
}

/**
 * Parse CommandMoveFortress 0x41f (fleetops §5; Input FUN_004a35b0 — HIGH). Body 0x1a4: header(12) +
 * u32 fortressId@0x0c + f32 x0@0x10 + f32 y0@0x14 + f32 z0@0x18 + u32 param@0x1c + u8
 * waypointCount@0x20 + waypoints[]@0x28 stride 12 {f32 x,y,z}. Null if short.
 */
export function parseInboundMoveFortress(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x28) {
    return null;
  }
  const count = Math.min(body.readUInt8(0x20), MAX_BATTLE_UNITS);
  const waypoints = [];
  for (let i = 0; i < count; i += 1) {
    const off = 0x28 + i * 12;
    if (off + 12 > body.length) {
      break;
    }
    waypoints.push({ x: body.readFloatLE(off), y: body.readFloatLE(off + 4), z: body.readFloatLE(off + 8) });
  }
  return {
    ...readHeader(body),
    fortressId: body.readUInt32LE(0x0c),
    x0: body.readFloatLE(0x10),
    y0: body.readFloatLE(0x14),
    z0: body.readFloatLE(0x18),
    param: body.readUInt32LE(0x1c),
    count,
    waypoints,
  };
}

/**
 * Parse CommandChangeAuthority 0x420 (fleetops §6; Input FUN_004a3d60 — HIGH). Body 0x94: header(12) +
 * u8 unitCount@0x0c + unitIds[]@0x10 stride 4 (max 32 → 0x90) + u32 newCommanderId@0x90. Null if short.
 */
export function parseInboundChangeAuthority(inner) {
  const body = inner.subarray(2);
  if (body.length < HEADER_3DWORD) {
    return null;
  }
  const count = Math.min(body.readUInt8(0x0c), MAX_BATTLE_UNITS);
  const unitIds = readU32Array(body, HEADER_3DWORD, count);
  const newCommanderId = body.length >= 0x94 ? body.readUInt32LE(0x90) : 0;
  return { ...readHeader(body), count, unitIds, newCommanderId };
}

/**
 * Parse CommandMission 0x421 (fleetops §6; Input FUN_004a4250 — HIGH). Body 0x98: header(12) + u8
 * unitCount@0x0c + unitIds[]@0x10 stride 4 (→0x90) + u8 flagA@0x90 + u8 flagB@0x91 + u32
 * missionTarget@0x94. Null if short.
 */
export function parseInboundMission(inner) {
  const body = inner.subarray(2);
  if (body.length < HEADER_3DWORD) {
    return null;
  }
  const count = Math.min(body.readUInt8(0x0c), MAX_BATTLE_UNITS);
  const unitIds = readU32Array(body, HEADER_3DWORD, count);
  const flagA = body.length >= 0x91 ? body.readUInt8(0x90) : 0;
  const flagB = body.length >= 0x92 ? body.readUInt8(0x91) : 0;
  const missionTarget = body.length >= 0x98 ? body.readUInt32LE(0x94) : 0;
  return { ...readHeader(body), count, unitIds, flagA, flagB, missionTarget };
}

/**
 * Parse CommandFileFleet 0x40d (fleetops §4; Input FUN_0049ec60 — HIGH). Re-form a fleet: body 0x294,
 * header(12) + u8 positionCount@0x0c + entries@0x10 stride 20 {u32 shipId; f32 heading; f32 x; f32 z;
 * f32 y} (identical to MoveShip entry) + u32 flag@0x290 (0=clear formation, 1=engage). Null if short.
 */
export function parseInboundFileFleet(inner) {
  const body = inner.subarray(2);
  if (body.length < HEADER_3DWORD) {
    return null;
  }
  const count = Math.min(body.readUInt8(0x0c), MAX_BATTLE_UNITS);
  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const off = HEADER_3DWORD + i * 20;
    if (off + 20 > body.length) {
      break;
    }
    entries.push({
      shipId: body.readUInt32LE(off),
      heading: body.readFloatLE(off + 4),
      x: body.readFloatLE(off + 8),
      z: body.readFloatLE(off + 12),
      y: body.readFloatLE(off + 16),
    });
  }
  const flag = body.length >= 0x294 ? body.readUInt32LE(0x290) : 0;
  return { ...readHeader(body), count, entries, flag };
}

// ============================================================================================
// NOTIFY BUILDERS (S->C). buildLobbyResponseInner(code, bytes) → [u32 0][u16 BE code][LE payload];
// write into inner.subarray(6). Sizes are dispatch ground truth (WORLD_RESPONSE_OBJECT_SIZES).
// ============================================================================================

/**
 * NotifyEncourageFlagship 0x42c (0xfc, Input FUN_004a7260 — HIGH). Morale boost broadcast. Body:
 * u8 unitCount@0x00 (≤61) + unitIds[]@0x04 stride 4 + s16 morale@0xf8 (label "move_morale"). The
 * 0x432 NotifyEncourageBase shares this exact shape.
 */
export function buildNotifyEncourageFlagshipInner({ unitIds = [], morale = 0, code = NOTIFY_ENCOURAGE_FLAGSHIP_CODE } = {}) {
  const inner = buildLobbyResponseInner(code, 0xfc);
  const p = inner.subarray(6);
  const count = Math.min(unitIds.length, MAX_ENCOURAGE_UNITS);
  p.writeUInt8(count, 0x00);
  for (let i = 0; i < count; i += 1) {
    p.writeUInt32LE(unitIds[i] >>> 0, 0x04 + i * 4);
  }
  p.writeInt16LE(Math.max(-0x8000, Math.min(0x7fff, Math.round(morale))), 0xf8);
  return inner;
}

/** NotifyEncourageBase 0x432 (0xfc, shares 0x42c shape). */
export function buildNotifyEncourageBaseInner(opts = {}) {
  return buildNotifyEncourageFlagshipInner({ ...opts, code: NOTIFY_ENCOURAGE_BASE_CODE });
}

/**
 * NotifyRepairFleet 0x42d / NotifySupplyFleet 0x42e / NotifyRepairBase 0x433 / NotifySupplyBase 0x434 /
 * NotifyEmergencySupplyBase 0x438 — all 0x10 (16B), medium. Body: [u32 targetId][u32 sourceId]
 * [u32 amount/result][u32 _] (layout from dispatch size + the apply that records target/source).
 */
function buildServiceNotifyInner(code, { targetId = 0, sourceId = 0, amount = 0 } = {}) {
  const inner = buildLobbyResponseInner(code, 0x10);
  const p = inner.subarray(6);
  p.writeUInt32LE(targetId >>> 0, 0x00);
  p.writeUInt32LE(sourceId >>> 0, 0x04);
  p.writeUInt32LE(amount >>> 0, 0x08);
  return inner;
}
export function buildNotifyRepairFleetInner(opts = {}) {
  return buildServiceNotifyInner(NOTIFY_REPAIR_FLEET_CODE, opts);
}
export function buildNotifySupplyFleetInner(opts = {}) {
  return buildServiceNotifyInner(NOTIFY_SUPPLY_FLEET_CODE, opts);
}
export function buildNotifyRepairBaseInner(opts = {}) {
  return buildServiceNotifyInner(NOTIFY_REPAIR_BASE_CODE, opts);
}
export function buildNotifySupplyBaseInner(opts = {}) {
  return buildServiceNotifyInner(NOTIFY_SUPPLY_BASE_CODE, opts);
}
export function buildNotifyEmergencySupplyBaseInner({ baseId = 0, unitId = 0, amount = 0 } = {}) {
  // fleetops §2: [u32 baseId][u32 unitId][u32 amount][u32 _].
  return buildServiceNotifyInner(NOTIFY_EMERGENCY_SUPPLY_BASE_CODE, { targetId: baseId, sourceId: unitId, amount });
}

/**
 * NotifyShootFortress 0x436 (0x8c, Input FUN_004a8c10 — HIGH). Body: u32 fortressId@0x00 + u32
 * arg@0x04 (angle/target mirror) + u8 hitCount@0x08 (≤32) + targetIds[]@0x0c stride 4.
 */
export function buildNotifyShootFortressInner({ fortressId = 0, arg = 0, targetIds = [] } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_SHOOT_FORTRESS_CODE, 0x8c);
  const p = inner.subarray(6);
  p.writeUInt32LE(fortressId >>> 0, 0x00);
  p.writeUInt32LE(arg >>> 0, 0x04);
  const count = Math.min(targetIds.length, MAX_BATTLE_UNITS);
  p.writeUInt8(count, 0x08);
  for (let i = 0; i < count; i += 1) {
    p.writeUInt32LE(targetIds[i] >>> 0, 0x0c + i * 4);
  }
  return inner;
}

/**
 * NotifyShootBase 0x43f (0x10, medium). Base-fire variant: [u32 baseId][u32 arg][u32 targetId][u32 _]
 * (inferred from the 0x10 dispatch size + ShootFortress mirror; single primary target).
 */
export function buildNotifyShootBaseInner({ baseId = 0, arg = 0, targetId = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_SHOOT_BASE_CODE, 0x10);
  const p = inner.subarray(6);
  p.writeUInt32LE(baseId >>> 0, 0x00);
  p.writeUInt32LE(arg >>> 0, 0x04);
  p.writeUInt32LE(targetId >>> 0, 0x08);
  return inner;
}

/**
 * NotifyMovedFortress 0x435 (0x14, medium). Body: [u32 fortressId][f32 x][f32 y][f32 z] (same coord
 * space as NotifyMovedShip; layout from dispatch size).
 */
export function buildNotifyMovedFortressInner({ fortressId = 0, x = 0, y = 0, z = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_MOVED_FORTRESS_CODE, 0x14);
  const p = inner.subarray(6);
  p.writeUInt32LE(fortressId >>> 0, 0x00);
  p.writeFloatLE(x, 0x04);
  p.writeFloatLE(y, 0x08);
  p.writeFloatLE(z, 0x0c);
  return inner;
}

/**
 * NotifyChangedAuthority 0x439 (0x88, Input FUN_004a94d0 — HIGH). Mirror of CommandChangeAuthority with
 * the commander moved to the front. Body: u32 newCommanderId@0x00 + u8 unitCount@0x04 (≤32) +
 * unitIds[]@0x08 stride 4.
 */
export function buildNotifyChangedAuthorityInner({ newCommanderId = 0, unitIds = [] } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_CHANGED_AUTHORITY_CODE, 0x88);
  const p = inner.subarray(6);
  p.writeUInt32LE(newCommanderId >>> 0, 0x00);
  const count = Math.min(unitIds.length, MAX_BATTLE_UNITS);
  p.writeUInt8(count, 0x04);
  for (let i = 0; i < count; i += 1) {
    p.writeUInt32LE(unitIds[i] >>> 0, 0x08 + i * 4);
  }
  return inner;
}

/**
 * NotifyAirBattle 0x428 (0x18, 6 dwords). Air/strike-craft engagement result. Body packed in 6 dwords:
 * [u32 attackerId][u32 targetId][u32 result][u32 a][u32 b][u32 c] (medium; size = dispatch ground truth).
 */
export function buildNotifyAirBattleInner({ attackerId = 0, targetId = 0, result = 0, a = 0, b = 0, c = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_AIR_BATTLE_CODE, 0x18);
  const p = inner.subarray(6);
  p.writeUInt32LE(attackerId >>> 0, 0x00);
  p.writeUInt32LE(targetId >>> 0, 0x04);
  p.writeUInt32LE(result >>> 0, 0x08);
  p.writeUInt32LE(a >>> 0, 0x0c);
  p.writeUInt32LE(b >>> 0, 0x10);
  p.writeUInt32LE(c >>> 0, 0x14);
  return inner;
}

/**
 * NotifyMissionResult 0x43c (0x10, medium). Body: [u32 unitId][u32 missionId][u32 result][u32 _].
 */
export function buildNotifyMissionResultInner({ unitId = 0, missionId = 0, result = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_MISSION_RESULT_CODE, 0x10);
  const p = inner.subarray(6);
  p.writeUInt32LE(unitId >>> 0, 0x00);
  p.writeUInt32LE(missionId >>> 0, 0x04);
  p.writeUInt32LE(result >>> 0, 0x08);
  return inner;
}

/** NotifyFinishOccupation 0x442 (8B, medium). Body: [u32 baseId][u32 newOwner]. */
export function buildNotifyFinishOccupationInner({ baseId = 0, newOwner = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_FINISH_OCCUPATION_CODE, 0x08);
  const p = inner.subarray(6);
  p.writeUInt32LE(baseId >>> 0, 0x00);
  p.writeUInt32LE(newOwner >>> 0, 0x04);
  return inner;
}

/** NotifyTacticsChiefCommander 0x431 (8B, server-driven). Body: [u32 charId][u32 unitId]. */
export function buildNotifyTacticsChiefCommanderInner({ charId = 0, unitId = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_TACTICS_CHIEF_COMMANDER_CODE, 0x08);
  const p = inner.subarray(6);
  p.writeUInt32LE(charId >>> 0, 0x00);
  p.writeUInt32LE(unitId >>> 0, 0x04);
  return inner;
}

/**
 * NotifyCharacterAchievement 0x43a / NotifyOutfitAchievement 0x43b (0xc, server-driven, 功績). Body:
 * [u32 id][u32 kind][u32 value].
 */
function buildAchievementNotifyInner(code, { id = 0, kind = 0, value = 0 } = {}) {
  const inner = buildLobbyResponseInner(code, 0x0c);
  const p = inner.subarray(6);
  p.writeUInt32LE(id >>> 0, 0x00);
  p.writeUInt32LE(kind >>> 0, 0x04);
  p.writeUInt32LE(value >>> 0, 0x08);
  return inner;
}
export function buildNotifyCharacterAchievementInner(opts = {}) {
  return buildAchievementNotifyInner(NOTIFY_CHARACTER_ACHIEVEMENT_CODE, opts);
}
export function buildNotifyOutfitAchievementInner(opts = {}) {
  return buildAchievementNotifyInner(NOTIFY_OUTFIT_ACHIEVEMENT_CODE, opts);
}

/**
 * NotifyConfusionUnit 0x43d / NotifyConfusionRecoveredUnit 0x43e (8B, server-driven). A unit enters /
 * leaves a confusion (混乱) state. Body: [u32 unitId][u32 param].
 */
function buildConfusionNotifyInner(code, { unitId = 0, param = 0 } = {}) {
  const inner = buildLobbyResponseInner(code, 0x08);
  const p = inner.subarray(6);
  p.writeUInt32LE(unitId >>> 0, 0x00);
  p.writeUInt32LE(param >>> 0, 0x04);
  return inner;
}
export function buildNotifyConfusionUnitInner(opts = {}) {
  return buildConfusionNotifyInner(NOTIFY_CONFUSION_UNIT_CODE, opts);
}
export function buildNotifyConfusionRecoveredUnitInner(opts = {}) {
  return buildConfusionNotifyInner(NOTIFY_CONFUSION_RECOVERED_UNIT_CODE, opts);
}

/** NotifyBlackHoleSuction 0x441 (4B, server-driven). Body: [u32 unitId] (the unit being pulled in). */
export function buildNotifyBlackHoleSuctionInner({ unitId = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_BLACK_HOLE_SUCTION_CODE, 0x04);
  inner.subarray(6).writeUInt32LE(unitId >>> 0, 0x00);
  return inner;
}

// ============================================================================================
// STATE — small authoritative in-battle state the commands mutate.
// ============================================================================================

/**
 * @typedef {{ id:number, owner:number, repairTag:number, supplier:number, morale:number,
 *   commander:number, x:number, y:number, z:number, control:object|null }} BattleUnit
 * @typedef {{ id:number, owner:number, x:number, y:number, z:number, owner_? :number }} BattleFortress
 */

/** Create an empty authoritative battle-ops state (per-unit/fortress service + morale + authority). */
export function createBattleOpsState() {
  /** @type {Map<number, BattleUnit>} */
  const units = new Map();
  /** @type {Map<number, BattleFortress>} */
  const fortresses = new Map();
  /** @type {Map<number, object>} */
  const bases = new Map();

  function getOrAddUnit(id, owner = 0) {
    const key = id >>> 0;
    let u = units.get(key);
    if (!u) {
      u = { id: key, owner, repairTag: 0, supplier: 0, morale: 100, commander: 0, x: 0, y: 0, z: 0, control: null };
      units.set(key, u);
    }
    return u;
  }

  return {
    units,
    fortresses,
    bases,

    addUnit({ id, owner = 0, morale = 100, commander = 0 }) {
      const u = getOrAddUnit(id, owner);
      u.owner = owner;
      u.morale = morale;
      u.commander = commander;
      return u;
    },
    getUnit(id) {
      return units.get(id >>> 0) ?? null;
    },
    getOrAddUnit,

    addFortress({ id, owner = 0, x = 0, y = 0, z = 0 }) {
      const f = { id: id >>> 0, owner, x, y, z };
      fortresses.set(f.id, f);
      return f;
    },
    getFortress(id) {
      return fortresses.get(id >>> 0) ?? null;
    },

    addBase({ id, owner = 0 }) {
      const b = { id: id >>> 0, owner, morale: 100, occupiedBy: 0 };
      bases.set(b.id, b);
      return b;
    },
    getBase(id) {
      return bases.get(id >>> 0) ?? null;
    },
  };
}

// ============================================================================================
// process() — validate → mutate → broadcast. The lead routes the 0x04xx range here.
// ============================================================================================

/** Ownership: a connection may command id only when unknown, neutral (owner 0), or owned by it. */
function ownsUnit(state, id, connectionId) {
  const u = state.getUnit(id);
  return !u || u.owner === 0 || u.owner === connectionId;
}
function ownsFortress(state, id, connectionId) {
  const f = state.getFortress(id);
  return !f || f.owner === 0 || f.owner === connectionId;
}
function ownsBase(state, id, connectionId) {
  const b = state.getBase(id);
  return !b || b.owner === 0 || b.owner === connectionId;
}

const reject = (reason) => ({ accept: false, reject: reason, notifies: [] });

/**
 * Process an inbound battle-ops command from `connectionId`. Validates ownership, mutates the
 * authoritative battle state, and returns the S→C notifies every observer renders.
 *
 * @param {{ state: ReturnType<createBattleOpsState>, connectionId: number, innerCode: number, inner: Buffer }} args
 * @returns {{ accept: boolean, reject?: string, notifies: { inner: Buffer, target: 'others'|'all' }[] }}
 */
export function processBattleOps({ state, connectionId, innerCode, inner }) {
  switch (innerCode) {
    // --- maneuver: Turn / Reverse → NotifyTurnedShip 0x424 per unit ---
    case COMMAND_TURN_SHIP_CODE:
    case COMMAND_REVERSE_SHIP_CODE: {
      const cmd = parseInboundTurn(inner);
      if (!cmd) {
        return reject('invalid-turn');
      }
      const notifies = [];
      for (const u of cmd.units) {
        if (!ownsUnit(state, u.shipId, connectionId)) {
          return reject('not-owner');
        }
        const unit = state.getOrAddUnit(u.shipId, connectionId);
        unit.heading = u.heading;
        notifies.push({ inner: buildNotifyTurnedShipInner({ shipId: u.shipId }), target: 'all' });
      }
      return { accept: true, kind: innerCode === COMMAND_TURN_SHIP_CODE ? 'turn' : 'reverse', notifies };
    }

    // --- maneuver: Stop → NotifyMovedShip 0x423 (position halt) per unit ---
    case COMMAND_STOP_CODE: {
      const cmd = parseInboundTurn(inner);
      if (!cmd) {
        return reject('invalid-stop');
      }
      const notifies = [];
      for (const u of cmd.units) {
        if (!ownsUnit(state, u.shipId, connectionId)) {
          return reject('not-owner');
        }
        const unit = state.getOrAddUnit(u.shipId, connectionId);
        // Stop = halt at the current authoritative pose (clear move state).
        notifies.push({
          inner: buildNotifyMovedShipInner({ shipId: u.shipId, x: unit.x, y: unit.y, z: unit.z, moveParam: 0 }),
          target: 'all',
        });
      }
      return { accept: true, kind: 'stop', notifies };
    }

    // --- FileFleet: re-form a fleet (move each ship) → NotifyMovedShip per ship ---
    case COMMAND_FILE_FLEET_CODE: {
      const cmd = parseInboundFileFleet(inner);
      if (!cmd) {
        return reject('invalid-file-fleet');
      }
      const notifies = [];
      for (const e of cmd.entries) {
        if (!ownsUnit(state, e.shipId, connectionId)) {
          return reject('not-owner');
        }
        const unit = state.getOrAddUnit(e.shipId, connectionId);
        unit.x = e.x;
        unit.y = e.y;
        unit.z = e.z;
        unit.heading = e.heading;
        notifies.push({ inner: buildNotifyMovedShipInner({ shipId: e.shipId, x: e.x, y: e.y, z: e.z }), target: 'all' });
      }
      return { accept: true, flag: cmd.flag, notifies };
    }

    // --- Repair / Supply fleet → 0x42d / 0x42e ---
    case COMMAND_REPAIR_FLEET_CODE:
    case COMMAND_SUPPLY_FLEET_CODE: {
      const cmd = parseInboundRepairSupply(inner);
      if (!cmd) {
        return reject('invalid-repair-supply');
      }
      if (!ownsUnit(state, cmd.targetUnitId, connectionId)) {
        return reject('not-owner');
      }
      const isRepair = innerCode === COMMAND_REPAIR_FLEET_CODE;
      const unit = state.getOrAddUnit(cmd.targetUnitId, connectionId);
      unit.repairTag = isRepair ? 2 : 1; // matches client tag (entity+0x5c4)
      unit.supplier = cmd.sourceUnitId;
      const build = isRepair ? buildNotifyRepairFleetInner : buildNotifySupplyFleetInner;
      return {
        accept: true,
        kind: isRepair ? 'repair' : 'supply',
        notifies: [{ inner: build({ targetId: cmd.targetUnitId, sourceId: cmd.sourceUnitId, amount: 0 }), target: 'all' }],
      };
    }

    // --- Repair / Supply base → 0x433 / 0x434 ---
    case COMMAND_REPAIR_BASE_CODE:
    case COMMAND_SUPPLY_BASE_CODE: {
      const cmd = parseInboundAdmission(inner);
      if (!cmd) {
        return reject('invalid-base-service');
      }
      if (!ownsBase(state, cmd.targetId, connectionId)) {
        return reject('not-owner');
      }
      const isRepair = innerCode === COMMAND_REPAIR_BASE_CODE;
      const build = isRepair ? buildNotifyRepairBaseInner : buildNotifySupplyBaseInner;
      return {
        accept: true,
        kind: isRepair ? 'repair-base' : 'supply-base',
        notifies: [{ inner: build({ targetId: cmd.targetId, sourceId: cmd.unitIds[0] ?? 0, amount: 0 }), target: 'all' }],
      };
    }

    // --- Admission (dock units into a base/fortress); no dedicated notify of its own ---
    case COMMAND_ADMISSION_CODE:
    case COMMAND_ADMISSION_BASE_CODE: {
      const cmd = parseInboundAdmission(inner);
      if (!cmd) {
        return reject('invalid-admission');
      }
      // Dock each admitted unit onto the target; broadcast a repair-base-style service ack (medium).
      const notifies = [
        { inner: buildNotifyRepairBaseInner({ targetId: cmd.targetId, sourceId: cmd.unitIds[0] ?? 0, amount: 0 }), target: 'all' },
      ];
      return { accept: true, target: cmd.targetId, admitted: cmd.unitIds, notifies };
    }

    // --- EmergencySupply → 0x438 ---
    case COMMAND_EMERGENCY_SUPPLY_CODE: {
      const cmd = parseInboundEmergencySupply(inner);
      if (!cmd) {
        return reject('invalid-emergency-supply');
      }
      if (!ownsUnit(state, cmd.targetId, connectionId)) {
        return reject('not-owner');
      }
      return {
        accept: true,
        notifies: [{ inner: buildNotifyEmergencySupplyBaseInner({ baseId: cmd.targetId, unitId: 0, amount: cmd.amount }), target: 'all' }],
      };
    }

    // --- EncourageFlagship → 0x42c (raise morale) ---
    case COMMAND_ENCOURAGE_FLAGSHIP_CODE: {
      const cmd = parseInboundEncourageFlagship(inner);
      if (!cmd) {
        return reject('invalid-encourage');
      }
      if (!ownsUnit(state, cmd.flagshipId, connectionId)) {
        return reject('not-owner');
      }
      const unit = state.getOrAddUnit(cmd.flagshipId, connectionId);
      const delta = 10;
      unit.morale = Math.min(0x7fff, unit.morale + delta);
      return {
        accept: true,
        notifies: [{ inner: buildNotifyEncourageFlagshipInner({ unitIds: [cmd.flagshipId], morale: delta }), target: 'all' }],
      };
    }

    // --- EncourageBase → 0x432 ---
    case COMMAND_ENCOURAGE_BASE_CODE: {
      const cmd = parseInboundBaseSingle(inner);
      if (!cmd) {
        return reject('invalid-encourage-base');
      }
      if (!ownsBase(state, cmd.baseId, connectionId)) {
        return reject('not-owner');
      }
      const delta = 10;
      const base = state.getBase(cmd.baseId);
      if (base) {
        base.morale = Math.min(0x7fff, base.morale + delta);
      }
      return {
        accept: true,
        notifies: [{ inner: buildNotifyEncourageBaseInner({ unitIds: [cmd.baseId], morale: delta }), target: 'all' }],
      };
    }

    // --- StopBase → echo a NotifyMovedFortress at the base's current pose (halt) ---
    case COMMAND_STOP_BASE_CODE: {
      const cmd = parseInboundBaseSingle(inner);
      if (!cmd) {
        return reject('invalid-stop-base');
      }
      if (!ownsBase(state, cmd.baseId, connectionId)) {
        return reject('not-owner');
      }
      return { accept: true, kind: 'stop-base', baseId: cmd.baseId, notifies: [] };
    }

    // --- Suggestion (tactical order to allied/AI unit); no dedicated notify ---
    case COMMAND_SUGGESTION_CODE: {
      const cmd = parseInboundSuggestion(inner);
      if (!cmd) {
        return reject('invalid-suggestion');
      }
      return { accept: true, target: cmd.targetId, suggestionType: cmd.suggestionType, notifies: [] };
    }

    // --- Control (per-ship subsystem power profile); effects surface via combat notifies ---
    case COMMAND_CONTROL_CODE: {
      const cmd = parseInboundControl(inner);
      if (!cmd) {
        return reject('invalid-control');
      }
      if (!ownsUnit(state, cmd.unit, connectionId)) {
        return reject('not-owner');
      }
      const unit = state.getOrAddUnit(cmd.unit, connectionId);
      unit.control = {
        condenser: cmd.condenser, beam: cmd.beam, aux: cmd.aux, shield: cmd.shield,
        engine: cmd.engine, warp: cmd.warp, sensor: cmd.sensor,
      };
      return { accept: true, unit: cmd.unit, notifies: [] };
    }

    // --- AirBattle → 0x428 ---
    case COMMAND_AIR_BATTLE_CODE: {
      const cmd = parseInboundIdList(inner);
      if (!cmd) {
        return reject('invalid-air-battle');
      }
      const attackerId = cmd.unitIds[0] ?? 0;
      if (attackerId && !ownsUnit(state, attackerId, connectionId)) {
        return reject('not-owner');
      }
      return {
        accept: true,
        notifies: [{ inner: buildNotifyAirBattleInner({ attackerId, targetId: cmd.unitIds[1] ?? 0, result: 1 }), target: 'all' }],
      };
    }

    // --- ShootFortress → 0x436 (+ 0x43f base variant) ---
    case COMMAND_SHOOT_FORTRESS_CODE: {
      const cmd = parseInboundShootFortress(inner);
      if (!cmd) {
        return reject('invalid-shoot-fortress');
      }
      if (!ownsFortress(state, cmd.fortressId, connectionId)) {
        return reject('not-owner');
      }
      // angle is reinterpreted as a u32 arg on the wire (the notify echoes the command angle bits).
      const argBuf = Buffer.alloc(4);
      argBuf.writeFloatLE(cmd.angle, 0);
      const arg = argBuf.readUInt32LE(0);
      return {
        accept: true,
        fortressId: cmd.fortressId,
        notifies: [{ inner: buildNotifyShootFortressInner({ fortressId: cmd.fortressId, arg, targetIds: [] }), target: 'all' }],
      };
    }

    // --- MoveFortress → 0x435 (move to the final waypoint) ---
    case COMMAND_MOVE_FORTRESS_CODE: {
      const cmd = parseInboundMoveFortress(inner);
      if (!cmd) {
        return reject('invalid-move-fortress');
      }
      if (!ownsFortress(state, cmd.fortressId, connectionId)) {
        return reject('not-owner');
      }
      const last = cmd.waypoints[cmd.waypoints.length - 1] ?? { x: cmd.x0, y: cmd.y0, z: cmd.z0 };
      const f = state.getFortress(cmd.fortressId);
      if (f) {
        f.x = last.x;
        f.y = last.y;
        f.z = last.z;
      }
      return {
        accept: true,
        fortressId: cmd.fortressId,
        notifies: [{ inner: buildNotifyMovedFortressInner({ fortressId: cmd.fortressId, x: last.x, y: last.y, z: last.z }), target: 'all' }],
      };
    }

    // --- ChangeAuthority → 0x439 ---
    case COMMAND_CHANGE_AUTHORITY_CODE: {
      const cmd = parseInboundChangeAuthority(inner);
      if (!cmd) {
        return reject('invalid-change-authority');
      }
      for (const id of cmd.unitIds) {
        if (!ownsUnit(state, id, connectionId)) {
          return reject('not-owner');
        }
      }
      for (const id of cmd.unitIds) {
        state.getOrAddUnit(id, connectionId).commander = cmd.newCommanderId;
      }
      return {
        accept: true,
        newCommanderId: cmd.newCommanderId,
        notifies: [{ inner: buildNotifyChangedAuthorityInner({ newCommanderId: cmd.newCommanderId, unitIds: cmd.unitIds }), target: 'all' }],
      };
    }

    // --- Mission → 0x43c (+ 0x442 when an occupation completes) ---
    case COMMAND_MISSION_CODE: {
      const cmd = parseInboundMission(inner);
      if (!cmd) {
        return reject('invalid-mission');
      }
      for (const id of cmd.unitIds) {
        if (!ownsUnit(state, id, connectionId)) {
          return reject('not-owner');
        }
      }
      const notifies = cmd.unitIds.map((unitId) => ({
        inner: buildNotifyMissionResultInner({ unitId, missionId: cmd.missionTarget, result: 1 }),
        target: 'all',
      }));
      // An occupation-type mission (flagA marks it) finishing transfers the target base's ownership.
      if (cmd.flagA && cmd.missionTarget) {
        const base = state.getBase(cmd.missionTarget);
        if (base) {
          base.occupiedBy = connectionId;
        }
        notifies.push({
          inner: buildNotifyFinishOccupationInner({ baseId: cmd.missionTarget, newOwner: connectionId }),
          target: 'all',
        });
      }
      return { accept: true, missionTarget: cmd.missionTarget, notifies };
    }

    default:
      return reject('unknown-battle-op');
  }
}

// Re-export framing helper passthrough so a caller can build a generic record if needed.
export { buildLobbyResponseInner };
