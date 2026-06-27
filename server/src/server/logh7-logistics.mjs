/**
 * Authoritative strategic-map + logistics (内政 logistics/兵站) domain — SELF-CONTAINED module.
 *
 * The LOGH VII client is a thin renderer of strategic-sector logistics actions: it SENDS a
 * Command* (move a base, supply fuel to a fleet, search/recon a sector, load/unload troops,
 * reorganize a fleet, transfer cargo) and the server owns the truth — it validates the action,
 * mutates the authoritative base/fleet stockpiles, ECHOES the command back (the client's modal
 * dialog FSM matches on the echo) and BROADCASTS the matching Notify* so every observer updates.
 *
 * This module is intentionally self-contained so it can be developed without write-conflicting on
 * logh7-command-engine.mjs / logh7-world-state.mjs / logh7-login-protocol.mjs. It exports:
 *   - the message CODES (0xb00..0xb0d strategic, 0xc00..0xc0c logistics),
 *   - parseInbound* parsers (byte-exact, from the spec field tables),
 *   - buildNotify* / build*Record builders (exact size/fields),
 *   - createLogisticsState() — the in-memory base-fuel/supply + fleet-supply store,
 *   - processLogistics(ctx) — the accept/reject/notify decision entry.
 * It only imports the framing helpers (buildLobbyResponseInner / buildMpsClientMessage32Inner)
 * from logh7-login-protocol.mjs.
 *
 * FRAMING (matches the combat work):
 *   - C->S inner = [u16 BE code][LE body]; the parser strips the 2-byte code (inner.subarray(2)).
 *   - S->C inner = buildLobbyResponseInner(code, bytes) => [u32 0 prefix][u16 BE code][LE payload];
 *     the payload is inner.subarray(6). For an ECHO we re-wrap the original C->S body as message32.
 *   - All bodies are LITTLE-ENDIAN; only the 2-byte code prefix is big-endian.
 *
 * EVIDENCE: docs/logh7-proto-strategic-logistics.md (Ghidra G7MTClient static RE; every field cites a
 * function address). High-confidence messages (full Input_ parser) are implemented field-by-field;
 * low-confidence ones (size proven, layout partial) implement the proven header and note the rest.
 *
 * Pure + synchronous => fully unit-testable without a live client.
 */

import {
  buildLobbyResponseInner,
  buildMpsClientMessage32Inner,
} from './logh7-login-protocol.mjs';

// ---------------------------------------------------------------------------
// Message codes (docs/logh7-proto-strategic-logistics.md §A.0 / §B.0)
// ---------------------------------------------------------------------------

// Strategic-map ops (0x0bxx). 0xb01/0xb07/0xb09/0xb0a are owned by the strategic-input work; this
// domain implements the logistics-flavoured ones (move base, supply fuel, search, load/unload, switch).
export const COMMAND_MOVE_BASE_CODE = 0x0b00; // C->S, echoed (32B)
export const COMMAND_SUPPLY_FUEL_CODE = 0x0b02; // C->S, echoed (24B) -> NotifySuppliedFuel 0xb0c
export const COMMAND_SEARCH_CODE = 0x0b03; // C->S, echoed (20B) -> NotifySearch 0xb0d
export const COMMAND_UNLOAD_TROOP_CODE = 0x0b04; // C->S, echoed (36B)
export const COMMAND_LOAD_TROOP_CODE = 0x0b05; // C->S, echoed (36B)
export const COMMAND_SWITCH_MODE_CODE = 0x0b06; // C->S, echoed (356B)

export const NOTIFY_LEAVE_OUT_GRID_CODE = 0x0b08; // S->C (284B)
export const NOTIFY_MOVED_BASE_CODE = 0x0b0b; // S->C (68B)
export const NOTIFY_SUPPLIED_FUEL_CODE = 0x0b0c; // S->C (576B)
export const NOTIFY_SEARCH_CODE = 0x0b0d; // S->C (2716B)

// Logistics / organization (0x0cxx).
export const COMMAND_COMPLETENESS_REPAIR_CODE = 0x0c00; // C->S, echoed (860B)
export const COMMAND_COMPLETENESS_SUPPLY_CODE = 0x0c01; // C->S, echoed (804B)
export const COMMAND_REORGANIZATION_CODE = 0x0c02; // C->S, echoed (784B)
export const COMMAND_SUPPLEMENT_CODE = 0x0c05; // C->S, echoed (40540B)
export const COMMAND_CARRYING_IN_OUT_CODE = 0x0c08; // C->S, echoed (256B)
export const COMMAND_ASSIGNMENT_CODE = 0x0c0b; // C->S, echoed (2268B)
export const COMMAND_CARRYING_OUT_CODE = 0x0c0c; // C->S, echoed (32B)

// Institutions (0x0exx) — the one proven applicator is MoveInstitutionSpot.
export const COMMAND_MOVE_INSTITUTION_SPOT_CODE = 0x0e00; // C->S, echoed (24B)

// ---------------------------------------------------------------------------
// Wire sizes (proven from FUN_004b8b00 size table; cited in the spec §A.0/§B.0/§C.1).
// ---------------------------------------------------------------------------
export const COMMAND_MOVE_BASE_BYTES = 0x20; // 32
export const COMMAND_SUPPLY_FUEL_BYTES = 0x18; // 24
export const COMMAND_SEARCH_BYTES = 0x14; // 20
export const COMMAND_TROOP_TRANSFER_BYTES = 0x24; // 36 (Load == Unload layout)
export const COMMAND_SWITCH_MODE_BYTES = 0x164; // 356
export const NOTIFY_LEAVE_OUT_GRID_BYTES = 0x11c; // 284
export const NOTIFY_MOVED_BASE_BYTES = 0x44; // 68
export const NOTIFY_SUPPLIED_FUEL_BYTES = 0x240; // 576
export const NOTIFY_SEARCH_BYTES = 0xa9c; // 2716
export const COMMAND_REORGANIZATION_BYTES = 0x310; // 784
export const COMMAND_CARRYING_IN_OUT_BYTES = 0x100; // 256
export const COMMAND_COMPLETENESS_REPAIR_BYTES = 0x35c; // 860
export const COMMAND_COMPLETENESS_SUPPLY_BYTES = 0x324; // 804
export const COMMAND_SUPPLEMENT_BYTES = 0x9e5c; // 40540
export const COMMAND_ASSIGNMENT_BYTES = 0x8dc; // 2268
export const COMMAND_CARRYING_OUT_BYTES = 0x20; // 32
export const COMMAND_MOVE_INSTITUTION_SPOT_BYTES = 0x18; // 24

// ---------------------------------------------------------------------------
// Array bounds (proven from the Output_*::get_length "over than N" error strings, spec §A/§B).
// ---------------------------------------------------------------------------
export const MAX_TROOP_TRANSFER_UNITS = 3; // Load/Unload: "unload_unit_size over than 3"
export const MAX_SWITCH_MODE_UNITS = 70; // "unit_size over than 70"
export const MAX_SWITCH_MODE_CHARACTERS = 10; // "move_character_size over than 10"
export const MAX_LEAVE_OUT_UNITS = 70; // NotifyLeaveOutGrid: unit_size < 0x47
export const MAX_MOVED_BASE_CHARACTERS = 10; // NotifyMovedBase: move_character_size < 0xb
export const MAX_SUPPLIED_UNITS = 70; // NotifySuppliedFuel: unit_size < 0x47
export const MAX_SEARCH_CELLS = 225; // NotifySearch: search_info_size < 0xe2 (225)
export const MAX_SEARCH_ENEMIES = 2; // SearchEnemyInfo: about_unit_size <= 2
export const MAX_REORG_SHIPS = 99; // Reorganization: move_ships <= 99
export const MAX_REORG_TROOPS = 24; // Reorganization: move_troops <= 24
export const MAX_CARRY_OTHER_PACKAGES = 3; // CarryingInOut: move_other_packages <= 3
export const MAX_CARRY_TROOP_PACKAGES = 24; // CarryingInOut: move_troop_packages <= 24

const u32 = (v) => (v >>> 0);

// ===========================================================================
// PARSERS (C->S). Raw inner = [u16 BE code][LE body]; offsets below are INTO THE BODY.
// ===========================================================================

/**
 * Parse 0xb00 CommandMoveBase — 32B (spec §A.1). C->S only (no compiled Input_); the layout past 0x08
 * is inferred from the sibling NotifyMovedBase 0xb0b. Header dwords 0x00/0x04 are the seq/result pair
 * the client uses for dialog-FSM matching. Returns null if too short.
 *   @0x00 u32 seq  @0x04 u32 result  @0x08 u32 baseId  @0x0c u32 target  @0x10..0x1c u32 params
 */
export function parseInboundMoveBase(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_MOVE_BASE_BYTES) {
    return null;
  }
  return {
    seq: body.readUInt32LE(0x00),
    result: body.readUInt32LE(0x04),
    baseId: body.readUInt32LE(0x08),
    target: body.readUInt32LE(0x0c),
    params: [body.readUInt32LE(0x10), body.readUInt32LE(0x14), body.readUInt32LE(0x18), body.readUInt32LE(0x1c)],
  };
}

/**
 * Parse 0xb02 CommandSupplyFuel — 24B (spec §A.2, HIGH VALUE). The echo ACK FUN_004c02f0 proves
 * @0x08 targetUnitId, @0x10 fuelA (-> playerInfo+0x74), @0x14 fuelB (-> playerInfo+0x78). The command
 * carries the REQUESTED post-transfer fuel scalars; the server recomputes authoritative values and
 * echoes them back. Returns null if too short.
 */
export function parseInboundSupplyFuel(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_SUPPLY_FUEL_BYTES) {
    return null;
  }
  return {
    seq: body.readUInt32LE(0x00),
    result: body.readUInt32LE(0x04),
    targetUnitId: body.readUInt32LE(0x08),
    fuelA: body.readUInt32LE(0x10),
    fuelB: body.readUInt32LE(0x14),
  };
}

/**
 * Parse 0xb03 CommandSearch — 20B (spec §A.3, HIGH VALUE recon). C->S only; @0x08 searcherUnitId is
 * the proven family-id slot; @0x0c targetCell/range and @0x10 mode are inferred. Returns null if short.
 */
export function parseInboundSearch(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_SEARCH_BYTES) {
    return null;
  }
  return {
    seq: body.readUInt32LE(0x00),
    result: body.readUInt32LE(0x04),
    searcherUnitId: body.readUInt32LE(0x08),
    targetCell: body.readUInt32LE(0x0c),
    mode: body.readUInt32LE(0x10),
  };
}

/**
 * Parse 0xb04 CommandUnloadTroop / 0xb05 CommandLoadTroop — 36B, byte-identical (spec §A.4, PROVEN
 * full parser FUN_00449e20 / FUN_0044a350). Stream order:
 *   @0x00 u32 seq  @0x04 u32 dword1  @0x08 u32 baseOrFleetId  @0x0c u32 targetId  @0x10 u32 spot
 *   @0x14 u8 unitCount (max 3)  @0x18 u32[unitCount] troopUnitIds (stride 4).
 * Returns null if too short. The unused id slots stay zero (fixed 36B body).
 */
export function parseInboundTroopTransfer(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_TROOP_TRANSFER_BYTES) {
    return null;
  }
  const unitCount = Math.min(body.readUInt8(0x14), MAX_TROOP_TRANSFER_UNITS);
  const troopUnitIds = [];
  for (let i = 0; i < unitCount; i += 1) {
    troopUnitIds.push(body.readUInt32LE(0x18 + i * 4));
  }
  return {
    seq: body.readUInt32LE(0x00),
    dword1: body.readUInt32LE(0x04),
    baseOrFleetId: body.readUInt32LE(0x08),
    targetId: body.readUInt32LE(0x0c),
    spot: body.readUInt32LE(0x10),
    unitCount,
    troopUnitIds,
  };
}

/**
 * Parse 0xb06 CommandSwitchMode — 356B (spec §A.5, PROVEN full parser FUN_0044a880). The
 * strategic<->tactical transition carrying the participating units + characters:
 *   @0x00 u32 seq  @0x04 u32 dword1  @0x08 u16 modeFlags  @0x0c u32 spot1  @0x10 u32 spot2
 *   @0x14 u16 modeKind (0 battle / 1 encounter / 2 strategic)  @0x16 u8 unitSize (max 70)
 *   @0x18 u32[unitSize] unitIds (stride 4)  @0x130 u32 scalar1  @0x134 u32 scalar2
 *   @0x138 u8 charSize (max 10)  @0x13c u32[charSize] characterIds (stride 4).
 * Returns null if too short.
 */
export function parseInboundSwitchMode(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_SWITCH_MODE_BYTES) {
    return null;
  }
  const unitSize = Math.min(body.readUInt8(0x16), MAX_SWITCH_MODE_UNITS);
  const unitIds = [];
  for (let i = 0; i < unitSize; i += 1) {
    unitIds.push(body.readUInt32LE(0x18 + i * 4));
  }
  const charSize = Math.min(body.readUInt8(0x138), MAX_SWITCH_MODE_CHARACTERS);
  const characterIds = [];
  for (let i = 0; i < charSize; i += 1) {
    characterIds.push(body.readUInt32LE(0x13c + i * 4));
  }
  return {
    seq: body.readUInt32LE(0x00),
    dword1: body.readUInt32LE(0x04),
    modeFlags: body.readUInt16LE(0x08),
    spot1: body.readUInt32LE(0x0c),
    spot2: body.readUInt32LE(0x10),
    modeKind: body.readUInt16LE(0x14),
    unitSize,
    unitIds,
    scalar1: body.readUInt32LE(0x130),
    scalar2: body.readUInt32LE(0x134),
    charSize,
    characterIds,
  };
}

/**
 * Parse 0xc02 CommandReorganization — 784B (spec §B.1, PROVEN full parser FUN_00555eb0). The core
 * 編成 internal-affairs action: reassign ships/troops between outfits/fleets.
 *   @0x08 u8 flag  @0x0c u32 srcOutfit  @0x10 u32 dstOutfit  @0x14 u32 spot  @0x18 u32 param
 *   @0x1c u8 subFlag  @0x1d u8 moveShipsSize (max 99)  @0x1e moveShips[stride 6]
 *   @0x270 u8 moveTroopsSize (max 24)  @0x274 moveTroops[stride 6]  @0x304/0x308/0x30c trailing scalars.
 * moveShips elem = { u16 shipId @+0, u8 destSlot @+2, u16 param @+4 }; moveTroops same shape.
 * Returns null if too short.
 */
export function parseInboundReorganization(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_REORGANIZATION_BYTES) {
    return null;
  }
  const moveShipsSize = Math.min(body.readUInt8(0x1d), MAX_REORG_SHIPS);
  const moveShips = [];
  for (let i = 0; i < moveShipsSize; i += 1) {
    const off = 0x1e + i * 6;
    moveShips.push({
      shipId: body.readUInt16LE(off),
      destSlot: body.readUInt8(off + 2),
      param: body.readUInt16LE(off + 4),
    });
  }
  const moveTroopsSize = Math.min(body.readUInt8(0x270), MAX_REORG_TROOPS);
  const moveTroops = [];
  for (let i = 0; i < moveTroopsSize; i += 1) {
    const off = 0x274 + i * 6;
    moveTroops.push({
      troopId: body.readUInt16LE(off),
      destSlot: body.readUInt8(off + 2),
      param: body.readUInt16LE(off + 4),
    });
  }
  return {
    seq: body.readUInt32LE(0x00),
    dword1: body.readUInt32LE(0x04),
    flag: body.readUInt8(0x08),
    srcOutfit: body.readUInt32LE(0x0c),
    dstOutfit: body.readUInt32LE(0x10),
    spot: body.readUInt32LE(0x14),
    param: body.readUInt32LE(0x18),
    subFlag: body.readUInt8(0x1c),
    moveShipsSize,
    moveShips,
    moveTroopsSize,
    moveTroops,
    scalar304: body.readUInt32LE(0x304),
    scalar308: body.readUInt32LE(0x308),
    scalar30c: body.readUInt32LE(0x30c),
  };
}

/**
 * Parse 0xc08 CommandCarryingInOut — 256B (spec §B.2, PROVEN full parser FUN_005580a0). Package/cargo
 * transfer between a source and dest spot:
 *   @0x0c u32 source  @0x10 u32 dest  @0x14 u32 spot  @0x18 u8 flag  @0x1c u32 param
 *   @0x20 u8 otherPackagesSize (max 3)  @0x24 otherPackages[stride 8]
 *   @0x3c u8 troopPackagesSize (max 24)  @0x3d troopPackages[stride 8].
 * Package elem = { u8 typeA @+0, u8 typeB @+1, u32 amount @+4 }. Returns null if too short.
 */
export function parseInboundCarryingInOut(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_CARRYING_IN_OUT_BYTES) {
    return null;
  }
  const readPackages = (countOff, baseOff, max) => {
    const size = Math.min(body.readUInt8(countOff), max);
    const list = [];
    for (let i = 0; i < size; i += 1) {
      const off = baseOff + i * 8;
      list.push({
        typeA: body.readUInt8(off),
        typeB: body.readUInt8(off + 1),
        amount: body.readUInt32LE(off + 4),
      });
    }
    return { size, list };
  };
  const other = readPackages(0x20, 0x24, MAX_CARRY_OTHER_PACKAGES);
  const troop = readPackages(0x3c, 0x3d, MAX_CARRY_TROOP_PACKAGES);
  return {
    dword0: body.readUInt32LE(0x00),
    dword1: body.readUInt32LE(0x04),
    dword2: body.readUInt32LE(0x08),
    source: body.readUInt32LE(0x0c),
    dest: body.readUInt32LE(0x10),
    spot: body.readUInt32LE(0x14),
    flag: body.readUInt8(0x18),
    param: body.readUInt32LE(0x1c),
    otherPackagesSize: other.size,
    otherPackages: other.list,
    troopPackagesSize: troop.size,
    troopPackages: troop.list,
  };
}

/**
 * Parse 0xe00 CommandMoveInstitutionSpot — 24B (spec §C.1). The echo applicator FUN_004beaa0 proves
 * @0x08 institutionId, @0x10 newX (-> playerInfo+0x40), @0x14 newY (-> playerInfo+0x44). Returns null
 * if too short.
 */
export function parseInboundMoveInstitutionSpot(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_MOVE_INSTITUTION_SPOT_BYTES) {
    return null;
  }
  return {
    seq: body.readUInt32LE(0x00),
    result: body.readUInt32LE(0x04),
    institutionId: body.readUInt32LE(0x08),
    param: body.readUInt32LE(0x0c),
    newX: body.readUInt32LE(0x10),
    newY: body.readUInt32LE(0x14),
  };
}

/**
 * Parse the proven header-only of the low-confidence logistics commands (0xc00/0xc01/0xc0b/0xc05/
 * 0xc0c, spec §B.3/§B.4/§B.5/§B.6). Only the standard {seq, result, targetId} header is field-pinned;
 * the per-element arrays are bounds-proven but not offset-proven, so the body is preserved verbatim for
 * a byte-faithful echo. Returns null if the body is shorter than the proven size for that code.
 */
export function parseInboundLogisticsHeader(inner, expectedBytes) {
  const body = inner.subarray(2);
  if (body.length < Math.min(0x0c, expectedBytes)) {
    return null;
  }
  return {
    seq: body.readUInt32LE(0x00),
    result: body.length >= 0x08 ? body.readUInt32LE(0x04) : 0,
    targetId: body.length >= 0x0c ? body.readUInt32LE(0x08) : 0,
    bodyLength: body.length,
  };
}

// ===========================================================================
// BUILDERS (S->C). All produce a message32 inner; the LE payload is inner.subarray(6).
// ===========================================================================

/**
 * Echo a C->S command back to the actor as a message32-wrapped S->C inner: re-wrap the original raw
 * body under [u32 0][u16 BE code]. Optionally patch authoritative result dwords in (e.g. SupplyFuel's
 * recomputed fuel scalars) before echoing. `patch` = [{ offset, value (u32) }]. The echo ACKs the
 * client's modal dialog FSM AND applies the authoritative result client-side.
 */
export function buildEcho(rawInner, patch = []) {
  const code = rawInner.readUInt16BE(0);
  const payload = Buffer.from(rawInner.subarray(2)); // copy so we never mutate the caller's buffer
  for (const { offset, value } of patch) {
    if (offset >= 0 && offset + 4 <= payload.length) {
      payload.writeUInt32LE(u32(value), offset);
    }
  }
  return buildMpsClientMessage32Inner({ code, payload });
}

/**
 * 0xb0b NotifyMovedBase — 68B (spec §A.8, PROVEN). Broadcast a base/fortress relocation. Apply
 * FUN_004bee60 writes newX->playerInfo+0x40, newY->playerInfo+0x44.
 *   @0x08 u32 baseId  @0x0c u16 routeScalar  @0x10 u32 newX  @0x14 u32 newY
 *   @0x18 u8 charCount (max 10)  @0x1c u32[charCount] characterIds (stride 4).
 */
export function buildNotifyMovedBaseInner({ baseId = 0, routeScalar = 0, newX = 0, newY = 0, characterIds = [], seq = 0, dword1 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_MOVED_BASE_CODE, NOTIFY_MOVED_BASE_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(u32(seq), 0x00);
  p.writeUInt32LE(u32(dword1), 0x04);
  p.writeUInt32LE(u32(baseId), 0x08);
  p.writeUInt16LE(routeScalar & 0xffff, 0x0c);
  p.writeUInt32LE(u32(newX), 0x10);
  p.writeUInt32LE(u32(newY), 0x14);
  const count = Math.min(characterIds.length, MAX_MOVED_BASE_CHARACTERS);
  p.writeUInt8(count & 0xff, 0x18);
  for (let i = 0; i < count; i += 1) {
    p.writeUInt32LE(u32(characterIds[i]), 0x1c + i * 4);
  }
  return inner;
}

/**
 * 0xb0c NotifySuppliedFuel — 576B (spec §A.9, PROVEN). Broadcast the per-fleet post-supply fuel so all
 * observers update.
 *   @0x08 u32 sourceId  @0x0c u8 unitCount (max 70)  @0x10 struct[unitCount] stride 8:
 *     { u32 unitId @+0, u32 fuelAfter @+4 }.
 * `units` = [{ unitId, fuelAfter }].
 */
export function buildNotifySuppliedFuelInner({ sourceId = 0, units = [], seq = 0, dword1 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_SUPPLIED_FUEL_CODE, NOTIFY_SUPPLIED_FUEL_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(u32(seq), 0x00);
  p.writeUInt32LE(u32(dword1), 0x04);
  p.writeUInt32LE(u32(sourceId), 0x08);
  const count = Math.min(units.length, MAX_SUPPLIED_UNITS);
  p.writeUInt8(count & 0xff, 0x0c);
  for (let i = 0; i < count; i += 1) {
    const off = 0x10 + i * 8;
    p.writeUInt32LE(u32(units[i].unitId), off);
    p.writeUInt32LE(u32(units[i].fuelAfter), off + 4);
  }
  return inner;
}

/**
 * 0xb0d NotifySearch — 2716B (spec §A.10, PROVEN). The strategic fog-of-war / recon result.
 *   @0x08 u32 searcherId  @0x0c u8 cellCount (max 225)  @0x10 struct[cellCount] stride 12 (SearchEnemyInfo):
 *     { u16 cell @+0, u8 enemyCount (max 2) @+2, enemies[enemyCount] @+4 stride 4 }
 *   enemy elem = { u8 factionA @+0, u8 factionB @+1, u16 unitId @+2 }.
 * `cells` = [{ cell, enemies: [{ factionA, factionB, unitId }] }].
 */
export function buildNotifySearchInner({ searcherId = 0, cells = [], seq = 0, dword1 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_SEARCH_CODE, NOTIFY_SEARCH_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(u32(seq), 0x00);
  p.writeUInt32LE(u32(dword1), 0x04);
  p.writeUInt32LE(u32(searcherId), 0x08);
  const cellCount = Math.min(cells.length, MAX_SEARCH_CELLS);
  p.writeUInt8(cellCount & 0xff, 0x0c);
  for (let i = 0; i < cellCount; i += 1) {
    const base = 0x10 + i * 12;
    const cell = cells[i];
    p.writeUInt16LE(cell.cell & 0xffff, base);
    const enemies = cell.enemies ?? [];
    const enemyCount = Math.min(enemies.length, MAX_SEARCH_ENEMIES);
    p.writeUInt8(enemyCount & 0xff, base + 2);
    for (let j = 0; j < enemyCount; j += 1) {
      const eoff = base + 4 + j * 4;
      p.writeUInt8((enemies[j].factionA ?? 0) & 0xff, eoff);
      p.writeUInt8((enemies[j].factionB ?? 0) & 0xff, eoff + 1);
      p.writeUInt16LE((enemies[j].unitId ?? 0) & 0xffff, eoff + 2);
    }
  }
  return inner;
}

/**
 * 0xb08 NotifyLeaveOutGrid — 284B (spec §A.6, PROVEN). Broadcast when fleets warp out / leave the
 * observed sector (despawn). Body = [u8 unitCount (max 70) @0][u32 unitIds[] @4 stride 4].
 */
export function buildNotifyLeaveOutGridInner({ unitIds = [] } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_LEAVE_OUT_GRID_CODE, NOTIFY_LEAVE_OUT_GRID_BYTES);
  const p = inner.subarray(6);
  const count = Math.min(unitIds.length, MAX_LEAVE_OUT_UNITS);
  p.writeUInt8(count & 0xff, 0x00);
  for (let i = 0; i < count; i += 1) {
    p.writeUInt32LE(u32(unitIds[i]), 0x04 + i * 4);
  }
  return inner;
}

// ===========================================================================
// STATE — self-contained in-memory base-fuel/supply + fleet-supply store.
// ===========================================================================

/**
 * Create the logistics domain state: base/fortress stockpiles (fuel + supply), per-fleet supply, and
 * a transfer log. Pure in-memory authoritative store; the lead wires DB persistence separately.
 *
 *   bases:  id -> { id, owner, fuel, supply, x, y, troops:Set<troopId> }
 *   fleets: id -> { id, owner, faction, fuel, fuelCap, supply, supplyCap, troops:Set<troopId> }
 */
export function createLogisticsState() {
  const bases = new Map();
  const fleets = new Map();
  const log = [];

  function upsertBase({ id, owner = 0, fuel = 0, supply = 0, x = 0, y = 0, troops = [] } = {}) {
    const base = { id, owner, fuel, supply, x, y, troops: new Set(troops) };
    bases.set(id, base);
    return base;
  }
  function upsertFleet({ id, owner = 0, faction = 0, fuel = 0, fuelCap = 1000, supply = 0, supplyCap = 1000, troops = [] } = {}) {
    const fleet = { id, owner, faction, fuel, fuelCap, supply, supplyCap, troops: new Set(troops) };
    fleets.set(id, fleet);
    return fleet;
  }

  return {
    upsertBase,
    upsertFleet,
    getBase: (id) => bases.get(id) ?? null,
    getFleet: (id) => fleets.get(id) ?? null,

    /**
     * Authoritative fuel transfer: clamp the requested top-up to the fleet's capacity and the source
     * base's available fuel (when a source is known). Returns the post-transfer {fuelA, fuelB} the echo
     * carries, or null when the fleet is unknown. `requestA/requestB` are the client-requested scalars.
     */
    supplyFuel(fleetId, { requestA = 0, requestB = 0, sourceBaseId = null } = {}) {
      const fleet = fleets.get(fleetId);
      if (!fleet) {
        return null;
      }
      const source = sourceBaseId != null ? bases.get(sourceBaseId) : null;
      // The fleet may not exceed its fuel cap; the base cannot give more than it holds.
      const wantA = Math.max(0, requestA);
      let grantA = Math.min(wantA, fleet.fuelCap);
      if (source) {
        const fromBase = Math.max(0, grantA - fleet.fuel);
        const available = Math.max(0, source.fuel);
        const actuallyFromBase = Math.min(fromBase, available);
        grantA = fleet.fuel + actuallyFromBase;
        source.fuel = Math.max(0, source.fuel - actuallyFromBase);
      }
      fleet.fuel = grantA;
      const grantB = Math.min(Math.max(0, requestB), fleet.supplyCap);
      fleet.supply = grantB;
      log.push({ event: 'supply-fuel', fleetId, fuelA: grantA, fuelB: grantB, sourceBaseId });
      return { fuelA: grantA, fuelB: grantB };
    },

    /**
     * Move troop units between a base garrison and a fleet's transports. `direction` 'load' moves
     * troopIds from the base into the fleet; 'unload' moves them from the fleet to the base. Only ids
     * actually held on the source side move. Returns the list of ids that moved (may be empty).
     */
    transferTroops(baseId, fleetId, troopIds, direction = 'load') {
      const base = bases.get(baseId);
      const fleet = fleets.get(fleetId);
      if (!base || !fleet) {
        return [];
      }
      const moved = [];
      for (const tid of troopIds) {
        const from = direction === 'load' ? base.troops : fleet.troops;
        const to = direction === 'load' ? fleet.troops : base.troops;
        if (from.has(tid)) {
          from.delete(tid);
          to.add(tid);
          moved.push(tid);
        }
      }
      log.push({ event: 'troop-transfer', baseId, fleetId, direction, moved });
      return moved;
    },

    /** Relocate a base/fortress to (x,y). Returns the base or null if unknown. */
    moveBase(baseId, { x = 0, y = 0 } = {}) {
      const base = bases.get(baseId);
      if (!base) {
        return null;
      }
      base.x = x;
      base.y = y;
      log.push({ event: 'move-base', baseId, x, y });
      return base;
    },

    /** Record a fleet/troop reorganization (move ships/troops between outfits). */
    reorganize({ srcOutfit, dstOutfit, moveShips = [], moveTroops = [] } = {}) {
      log.push({ event: 'reorganize', srcOutfit, dstOutfit, ships: moveShips.length, troops: moveTroops.length });
      return { ships: moveShips.length, troops: moveTroops.length };
    },

    /** Record a cargo/package transfer (CarryingInOut). */
    carry({ source, dest, otherPackages = [], troopPackages = [] } = {}) {
      log.push({ event: 'carry', source, dest, other: otherPackages.length, troop: troopPackages.length });
      return { other: otherPackages.length, troop: troopPackages.length };
    },

    log: () => log.slice(),
  };
}

// ===========================================================================
// process() — the accept/reject/notify decision entry.
// ===========================================================================

/**
 * Process an inbound strategic-logistics command from `connectionId`.
 *
 * Ownership rule (matches the combat engine): a known base/fleet whose owner is neither 0
 * (neutral/unseeded) nor the connection is rejected with 'not-owner'. Unknown/unseeded ids are
 * allowed (the world is not always pre-populated). Every accepted command is ECHOED back to the
 * actor (target 'all' includes the actor so the dialog FSM ACKs) and, where a notify exists, the
 * matching Notify* is broadcast to observers.
 *
 * @param {{ state: ReturnType<typeof createLogisticsState>, connectionId: number, innerCode: number, inner: Buffer }} args
 * @returns {{ accept: boolean, reject?: string, notifies: { inner: Buffer, target: 'others'|'all' }[] }}
 */
export function processLogistics({ state, connectionId, innerCode, inner }) {
  switch (innerCode) {
    case COMMAND_SUPPLY_FUEL_CODE: {
      const cmd = parseInboundSupplyFuel(inner);
      if (!cmd) {
        return reject('invalid-supply-fuel');
      }
      const fleet = state.getFleet(cmd.targetUnitId);
      if (fleet && fleet.owner !== 0 && fleet.owner !== connectionId) {
        return reject('not-owner');
      }
      // Authoritative recompute (clamp to caps / source stock). If the fleet is unseeded we honour the
      // requested values so the dialog FSM still completes.
      const result = state.supplyFuel(cmd.targetUnitId, { requestA: cmd.fuelA, requestB: cmd.fuelB })
        ?? { fuelA: cmd.fuelA, fuelB: cmd.fuelB };
      // Echo 0xb02 with the authoritative fuel patched at @0x10/@0x14 (client writes playerInfo+0x74/+0x78).
      const echo = buildEcho(inner, [
        { offset: 0x10, value: result.fuelA },
        { offset: 0x14, value: result.fuelB },
      ]);
      // Broadcast 0xb0c NotifySuppliedFuel so all observers see the new fuel level.
      const notify = buildNotifySuppliedFuelInner({
        sourceId: 0,
        units: [{ unitId: cmd.targetUnitId, fuelAfter: result.fuelA }],
      });
      return {
        accept: true,
        result,
        notifies: [
          { inner: echo, target: 'all' },
          { inner: notify, target: 'others' },
        ],
      };
    }

    case COMMAND_SEARCH_CODE: {
      const cmd = parseInboundSearch(inner);
      if (!cmd) {
        return reject('invalid-search');
      }
      const fleet = state.getFleet(cmd.searcherUnitId);
      if (fleet && fleet.owner !== 0 && fleet.owner !== connectionId) {
        return reject('not-owner');
      }
      // Echo 0xb03 (release dialog) + broadcast 0xb0d NotifySearch with the scan result. With no live
      // fog model seeded here, the searched cell is revealed with no detected enemies (empty recon);
      // the lead's world layer supplies real revealed cells/enemies.
      const echo = buildEcho(inner);
      const notify = buildNotifySearchInner({
        searcherId: cmd.searcherUnitId,
        cells: [{ cell: cmd.targetCell & 0xffff, enemies: [] }],
      });
      return {
        accept: true,
        notifies: [
          { inner: echo, target: 'all' },
          { inner: notify, target: 'others' },
        ],
      };
    }

    case COMMAND_MOVE_BASE_CODE: {
      const cmd = parseInboundMoveBase(inner);
      if (!cmd) {
        return reject('invalid-move-base');
      }
      const base = state.getBase(cmd.baseId);
      if (base && base.owner !== 0 && base.owner !== connectionId) {
        return reject('not-owner');
      }
      // The command's @0x0c target is a destination cell id; treat it as the new position anchor for
      // the authoritative move (x = target, y = 0) absent a richer destination model.
      state.moveBase(cmd.baseId, { x: cmd.target, y: 0 });
      const echo = buildEcho(inner);
      // Broadcast 0xb0b NotifyMovedBase with the authoritative destination to all observers.
      const notify = buildNotifyMovedBaseInner({ baseId: cmd.baseId, newX: cmd.target, newY: 0 });
      return {
        accept: true,
        notifies: [
          { inner: echo, target: 'all' },
          { inner: notify, target: 'others' },
        ],
      };
    }

    case COMMAND_LOAD_TROOP_CODE:
    case COMMAND_UNLOAD_TROOP_CODE: {
      const cmd = parseInboundTroopTransfer(inner);
      if (!cmd) {
        return reject('invalid-troop-transfer');
      }
      // baseOrFleetId is the container being (un)loaded; targetId is the other side.
      const direction = innerCode === COMMAND_LOAD_TROOP_CODE ? 'load' : 'unload';
      // Resolve which id is the base and which is the fleet by lookup (either order is valid on wire).
      const a = cmd.baseOrFleetId;
      const b = cmd.targetId;
      const baseId = state.getBase(a) ? a : (state.getBase(b) ? b : a);
      const fleetId = state.getFleet(a) ? a : (state.getFleet(b) ? b : b);
      const fleet = state.getFleet(fleetId);
      if (fleet && fleet.owner !== 0 && fleet.owner !== connectionId) {
        return reject('not-owner');
      }
      const moved = state.transferTroops(baseId, fleetId, cmd.troopUnitIds, direction);
      const echo = buildEcho(inner);
      return { accept: true, direction, moved, notifies: [{ inner: echo, target: 'all' }] };
    }

    case COMMAND_SWITCH_MODE_CODE: {
      const cmd = parseInboundSwitchMode(inner);
      if (!cmd) {
        return reject('invalid-switch-mode');
      }
      // Authoritative gate for entering tactical combat: echo the command (the client's mode FSM ACKs);
      // the tactical-field setup + 0x033b/0x0349 streaming is owned by the combat/tactics layer.
      const echo = buildEcho(inner);
      return { accept: true, modeKind: cmd.modeKind, units: cmd.unitIds, characters: cmd.characterIds, notifies: [{ inner: echo, target: 'all' }] };
    }

    case COMMAND_REORGANIZATION_CODE: {
      const cmd = parseInboundReorganization(inner);
      if (!cmd) {
        return reject('invalid-reorganization');
      }
      state.reorganize({ srcOutfit: cmd.srcOutfit, dstOutfit: cmd.dstOutfit, moveShips: cmd.moveShips, moveTroops: cmd.moveTroops });
      const echo = buildEcho(inner);
      return { accept: true, moveShips: cmd.moveShips, moveTroops: cmd.moveTroops, notifies: [{ inner: echo, target: 'all' }] };
    }

    case COMMAND_CARRYING_IN_OUT_CODE: {
      const cmd = parseInboundCarryingInOut(inner);
      if (!cmd) {
        return reject('invalid-carrying');
      }
      state.carry({ source: cmd.source, dest: cmd.dest, otherPackages: cmd.otherPackages, troopPackages: cmd.troopPackages });
      const echo = buildEcho(inner);
      return { accept: true, otherPackages: cmd.otherPackages, troopPackages: cmd.troopPackages, notifies: [{ inner: echo, target: 'all' }] };
    }

    case COMMAND_MOVE_INSTITUTION_SPOT_CODE: {
      const cmd = parseInboundMoveInstitutionSpot(inner);
      if (!cmd) {
        return reject('invalid-move-institution');
      }
      // Echo 0xe00 with the new position; the client applies it via the PLAYER_INFO position applicator
      // (FUN_004beaa0 writes newX->+0x40, newY->+0x44). The command already carries the dest, so a
      // byte-faithful echo applies correctly client-side.
      const echo = buildEcho(inner);
      return { accept: true, institutionId: cmd.institutionId, notifies: [{ inner: echo, target: 'all' }] };
    }

    // Low-confidence logistics commands (sizes proven, per-field layouts partial): echo byte-faithfully
    // so the client's modal dialog FSM completes. The lead decodes the remaining Input_/Output_ before
    // authoritative state mutation. (spec §B.3/§B.4/§B.5/§B.6)
    case COMMAND_COMPLETENESS_REPAIR_CODE:
    case COMMAND_COMPLETENESS_SUPPLY_CODE:
    case COMMAND_ASSIGNMENT_CODE:
    case COMMAND_SUPPLEMENT_CODE:
    case COMMAND_CARRYING_OUT_CODE: {
      const expected = LOGISTICS_COMMAND_BYTES[innerCode];
      const hdr = parseInboundLogisticsHeader(inner, expected);
      if (!hdr) {
        return reject('invalid-logistics-header');
      }
      const echo = buildEcho(inner);
      return { accept: true, partial: true, header: hdr, notifies: [{ inner: echo, target: 'all' }] };
    }

    default:
      return reject('unknown-logistics-command');
  }
}

function reject(reason) {
  return { accept: false, reject: reason, notifies: [] };
}

/** Proven wire sizes for the low-confidence echo-only commands (used by parseInboundLogisticsHeader). */
export const LOGISTICS_COMMAND_BYTES = Object.freeze({
  [COMMAND_COMPLETENESS_REPAIR_CODE]: COMMAND_COMPLETENESS_REPAIR_BYTES,
  [COMMAND_COMPLETENESS_SUPPLY_CODE]: COMMAND_COMPLETENESS_SUPPLY_BYTES,
  [COMMAND_ASSIGNMENT_CODE]: COMMAND_ASSIGNMENT_BYTES,
  [COMMAND_SUPPLEMENT_CODE]: COMMAND_SUPPLEMENT_BYTES,
  [COMMAND_CARRYING_OUT_CODE]: COMMAND_CARRYING_OUT_BYTES,
});

/** The inner-code range this domain's process() handles (for the lead's command-engine routing). */
export const LOGISTICS_COMMAND_CODES = Object.freeze([
  COMMAND_MOVE_BASE_CODE,
  COMMAND_SUPPLY_FUEL_CODE,
  COMMAND_SEARCH_CODE,
  COMMAND_UNLOAD_TROOP_CODE,
  COMMAND_LOAD_TROOP_CODE,
  COMMAND_SWITCH_MODE_CODE,
  COMMAND_COMPLETENESS_REPAIR_CODE,
  COMMAND_COMPLETENESS_SUPPLY_CODE,
  COMMAND_REORGANIZATION_CODE,
  COMMAND_SUPPLEMENT_CODE,
  COMMAND_CARRYING_IN_OUT_CODE,
  COMMAND_ASSIGNMENT_CODE,
  COMMAND_CARRYING_OUT_CODE,
  COMMAND_MOVE_INSTITUTION_SPOT_CODE,
]);
