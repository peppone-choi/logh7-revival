/**
 * STATIC info-records READ MODEL — the remaining fixed-size S→C "Static-Information" record BUILDERS
 * that round out logh7-info-records.mjs. These are the immutable master tables (ship/troop/weapon/
 * power-curve specs), the per-card command-grant table, the fleet/outfit organisation records, the
 * batched-character roster, and the two outfit/ending notifies.
 *
 * This family is a PURE S→C read model: the server is the data source and there is NO client→server
 * mutation here (those codes are server replies, never client requests). Each `Request*` (responseCode-1)
 * the lead routes to a handler that calls the matching `build*Inner` and sends the result to the
 * requesting connection. `processInfoRecordsStatic()` is therefore a near-no-op kept for shape parity
 * with the command/combat engines.
 *
 * SELF-CONTAINED (avoids parallel write-conflicts with logh7-info-records / command-engine /
 * world-state): the only imports are the framing helper `buildLobbyResponseInner` and the canonical
 * 724-byte character record builder `buildInformationCharacterRecordInner` (the 0x0323 element 0x34f
 * batches) from logh7-login-protocol.mjs. No edits to existing modules.
 *
 * FRAMING (matches logh7-info-records.mjs): every record is a conn3 message32 object
 *   inner = [u32 BE 0][u16 BE code][LE body...]   (buildLobbyResponseInner(code, bodyLen))
 * so the LE body lives at inner.subarray(6) and total inner length = 6 + bodyLen. The client receive
 * factory (FUN_004b8b00) hard-sizes each code, so EVERY builder emits exactly the dispatch-declared
 * body size (zero-padded); the parser reads a leading count then `count` records of a fixed stride and
 * ignores the trailing zero pad. Bodies are little-endian; only the 2-byte inner code prefix is BE.
 *
 * WIRE EVIDENCE: docs/logh7-proto-info-records.md (§1-§5 per-message field tables + Ghidra parser/dump
 * cross-checks + the decisive `max_count × stride (+header) == dispatch size` proof),
 * docs/logh7-proto-tactics-data.md §13 (0x30b static ship spec field names), docs/logh7-info-records-wire.md
 * §2 (0x317 single dword), docs/logh7-proto-personnel-strategy.md §4.3/§4.4 (0x359 / 0x35a). Dispatch
 * sizes are the same table logh7-login-protocol.mjs encodes (0x307=0xe5b2 … 0x35a=0x434). Confidence is
 * honoured: fully-labeled records (UnitTroop/Fighters/Arms/PowerDistribution/GridOutfit/OutfitParty)
 * carry real field names; medium-confidence records (CardCommand/UnitShip/OutfitInformationUnit)
 * implement the high-confidence STRUCTURE (stride, caps, count header, pinned offsets) and leave the
 * unlabeled packed fields as generic bXX/wXX/dXX.
 *
 * STATE: createInfoRecordsStaticState() seeds the master tables from content/ship-stats.json,
 * content/character-roster.json, and content/galaxy.json where relevant, so the build* projectors have
 * real data to emit. Pure + synchronous => fully unit-testable without a live client.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildLobbyResponseInner,
  buildInformationCharacterRecordInner,
  SS_RESP_INFO_CHARACTER_RECORD_BYTES, // 0x02d4 = 724 (the 0x0323/0x34f element record)
} from './logh7-login-protocol.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(HERE, '..', '..', 'content');

// ===================================================================================================
// Message codes (docs/logh7-proto-info-records.md §0 dispatch table; 0x317/0x359/0x35a from the related
// docs). NOTE: 0x305 ResponseStaticInformationCard is already built by logh7-info-records.mjs — NOT
// re-implemented here (dup avoided per the spec).
// ===================================================================================================
export const RESP_STATIC_INFORMATION_CARD_COMMAND_CODE = 0x0307; // S->C card→command sub-records
export const RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_CODE = 0x0309; // S->C ship perf-curve table
export const RESP_STATIC_INFORMATION_UNIT_SHIP_CODE = 0x030b; // S->C per-hull master stat table
export const RESP_STATIC_INFORMATION_UNIT_TROOP_CODE = 0x030d; // S->C ground-troop class master
export const RESP_STATIC_INFORMATION_FIGHTERS_CODE = 0x030f; // S->C fighter/spartanian master
export const RESP_STATIC_INFORMATION_ARMS_CODE = 0x0311; // S->C weapon hit/spread table
export const RESP_INFORMATION_GRID_CODE = 0x0317; // S->C current grid index (single dword)
export const RESP_GRID_INFORMATION_OUTFIT_CODE = 0x032d; // S->C per-grid outfit presence
export const RESP_INFORMATION_OUTFIT_PARTY_CODE = 0x032f; // S->C full fleet composition
export const RESP_OUTFIT_INFORMATION_UNIT_CODE = 0x0331; // S->C per-unit detail in an outfit
export const RESP_CARD_CHARACTER_CODE = 0x034f; // S->C array of 724-byte character records
export const NOTIFY_INFORMATION_OUTFIT_CODE = 0x0359; // S->C compact outfit-info delta
export const NOTIFY_ENDING_CODE = 0x035a; // S->C end-of-game / ending record

// ===================================================================================================
// Dispatch-declared body sizes (the FIXED message32 object size; builders zero-pad to these). These
// match the SIZE table logh7-login-protocol.mjs encodes and the spec §0 cross-check column.
// ===================================================================================================
export const RESP_STATIC_INFORMATION_CARD_COMMAND_BYTES = 0xe5b2; // 58802 = 300*0xc4 + 2
export const RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_BYTES = 0x055c; // 1372 (fixed blob)
export const RESP_STATIC_INFORMATION_UNIT_SHIP_BYTES = 0x6d64; // 28004 = 200*0x8c + 4
export const RESP_STATIC_INFORMATION_UNIT_TROOP_BYTES = 0x0184; // 388 = 16*0x18 + 4
export const RESP_STATIC_INFORMATION_FIGHTERS_BYTES = 0x0034; // 52 = 4*0x0c + 4
export const RESP_STATIC_INFORMATION_ARMS_BYTES = 0x01b0; // 432 = 27*8*2 (fixed 2-D u16 table)
export const RESP_INFORMATION_GRID_BYTES = 0x0004; // 4 = single dword (current grid index)
export const RESP_GRID_INFORMATION_OUTFIT_BYTES = 0x0e14; // 3604 = 300*0x0c + 4
export const RESP_INFORMATION_OUTFIT_PARTY_BYTES = 0x8b04; // 35588 (single big nested record)
export const RESP_OUTFIT_INFORMATION_UNIT_BYTES = 0x1814; // 6164 = 70*0x58 + 4
export const RESP_CARD_CHARACTER_BYTES = 0xb504; // 46340 = 64*0x2d4 + 4
export const NOTIFY_INFORMATION_OUTFIT_BYTES = 0x001c; // 28 = 7 dwords
export const NOTIFY_ENDING_BYTES = 0x0434; // 1076 (end-screen payload)

// ===================================================================================================
// Strides / caps (decisive size cross-check in spec §0).
// ===================================================================================================
export const CARD_COMMAND_STRIDE = 0xc4; // 196 bytes/element (the card)
export const CARD_COMMAND_MAX = 300; // outer count cap (< 0x12d)
export const CARD_COMMAND_ENTRY_STRIDE = 8; // {id u16, packed u24, w u16, flag u8}
export const CARD_COMMAND_ENTRY_MAX = 24; // commands per card (≤ 24)

export const UNIT_SHIP_STRIDE = 0x8c; // 140 bytes/ship-class
export const UNIT_SHIP_MAX = 200; // count cap (< 0xc9)
export const UNIT_SHIP_NAME_MAX = 13; // name[≤13] wide-char

export const UNIT_TROOP_STRIDE = 0x18; // 24 bytes/troop-class
export const UNIT_TROOP_MAX = 16; // count cap (≤ 16)

export const FIGHTERS_STRIDE = 0x0c; // 12 bytes/fighter
export const FIGHTERS_MAX = 4; // count cap (≤ 4)

export const ARMS_ROWS = 27; // information_27 weapon rows
export const ARMS_COLS = 8; // hit[8] per row
export const ARMS_ROW_STRIDE = 16; // 8 u16 = 16 bytes/row

export const POWER_DIST_MOVE_LEN = 11; // move[11] float
export const POWER_DIST_WARP_LEN = 2; // warp[2] u8
export const POWER_DIST_SENSOR_LEN = 4; // sensor[4] float
export const POWER_DIST_SHIELD_ROWS = 11; // shield[11].fillup[9] float
export const POWER_DIST_SHIELD_COLS = 9;
export const POWER_DIST_BEAM_ROWS = 14; // beam[14].fillup[20] u16
export const POWER_DIST_BEAM_COLS = 20;
export const POWER_DIST_GUN_ROWS = 11; // gun[11].fillup[16] u16
export const POWER_DIST_GUN_COLS = 16;

export const GRID_OUTFIT_STRIDE = 0x0c; // 12 bytes/grid-outfit
export const GRID_OUTFIT_MAX = 300; // count cap (≤ 300)

export const OUTFIT_UNIT_STRIDE = 0x58; // 88 bytes/unit
export const OUTFIT_UNIT_MAX = 70; // count cap (≤ 70)
export const OUTFIT_UNIT_BOATS_MAX = 10; // boats per unit (≤ 10)

export const CARD_CHARACTER_STRIDE = SS_RESP_INFO_CHARACTER_RECORD_BYTES; // 724 (0x2d4) per element
export const CARD_CHARACTER_MAX = 64; // count cap (< 0x41)

// OutfitParty nested caps (spec §5c).
export const OUTFIT_PARTY_CHARACTERS_MAX = 10;
export const OUTFIT_PARTY_CHARACTER_STRIDE = 0x24; // 36 B {id u32, kind u8, rank u8, name(u8 len + u16[≤13])}
export const OUTFIT_PARTY_SHIPS_MAX = 60;
export const OUTFIT_PARTY_SHIP_STRIDE = 0x120; // 288 B {kind u16, unit_number u8, boat_number u16, units(u8 len + u32[≤70])}
export const OUTFIT_PARTY_SHIP_UNITS_MAX = 70;
export const OUTFIT_PARTY_TROOPS_MAX = 24;
export const OUTFIT_PARTY_TROOP_STRIDE = 6; // {kind u16, troop_grade u8, unit_number u16}
export const OUTFIT_PARTY_PACKAGE_MAX = 3; // other_packages[]
export const OUTFIT_PARTY_TROOP_PACKAGE_MAX = 24; // troop_packages[]
export const OUTFIT_PARTY_PACKAGE_STRIDE = 12; // {kind u8, unit_kind u16, troop_grade u8, package_number u32}

const clampU8 = (v) => Math.max(0, Math.min(0xff, Math.trunc(v ?? 0))) & 0xff;
const clampU16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(v ?? 0))) & 0xffff;
const clampU32 = (v) => (Math.max(0, Math.trunc(v ?? 0)) >>> 0);
const f32 = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Write a wide-char pascal name (u8 length + `len` u16 chars, ≤ `max`) at byte `off`. This is the exact
 * `name[≤13]` shape the family uses. Returns bytes consumed (1 + 2*len).
 */
function writeName16(buf, off, name, max = UNIT_SHIP_NAME_MAX) {
  const codes = [...String(name ?? '')].slice(0, max);
  buf.writeUInt8(codes.length, off);
  for (let i = 0; i < codes.length; i += 1) {
    buf.writeUInt16LE(codes[i].charCodeAt(0) & 0xffff, off + 1 + i * 2);
  }
  return 1 + codes.length * 2;
}

// ===================================================================================================
// 0x307 ResponseStaticInformationCardCommand — per-card command descriptor table
// ===================================================================================================
/**
 * Build ResponseStaticInformationCardCommand (0x307). Outer count u16 @0x00, up to 300 elements, each a
 * 196-byte record (stride 0xc4). Per element: card_id u16 @0x00, command_count u8 @0x02 (≤24), then an
 * inner array of 8-byte command descriptors {id u16, packed u24, w u16, flag u8} starting @0x04
 * (stride 8). Structure HIGH; packed sub-field semantics (cost/target/cooldown) unlabeled → generic.
 * Spec §1c.
 *
 * @param {{ cards?: Array<{ cardId?:number, commands?: Array<{ id?:number, packed?:number, w?:number, flag?:number }> }> }} [data]
 */
export function buildStaticInformationCardCommandInner({ cards = [] } = {}) {
  const inner = buildLobbyResponseInner(
    RESP_STATIC_INFORMATION_CARD_COMMAND_CODE, RESP_STATIC_INFORMATION_CARD_COMMAND_BYTES,
  );
  const body = inner.subarray(6);
  const list = cards.slice(0, CARD_COMMAND_MAX);
  body.writeUInt16LE(list.length & 0xffff, 0x00); // outer count u16
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    const base = 2 + i * CARD_COMMAND_STRIDE; // records start after the u16 count header
    if (base + CARD_COMMAND_STRIDE > body.length) break;
    body.writeUInt16LE(clampU16(c.cardId), base + 0x00); // card_id
    const cmds = Array.isArray(c.commands) ? c.commands.slice(0, CARD_COMMAND_ENTRY_MAX) : [];
    body.writeUInt8(cmds.length & 0xff, base + 0x02); // command_count (≤24)
    for (let j = 0; j < cmds.length; j += 1) {
      const e = cmds[j];
      const off = base + 0x04 + j * CARD_COMMAND_ENTRY_STRIDE;
      body.writeUInt16LE(clampU16(e.id), off + 0); // id u16
      // packed u24 @+2 (3 bytes LE)
      const packed = clampU32(e.packed) & 0xffffff;
      body.writeUInt8(packed & 0xff, off + 2);
      body.writeUInt8((packed >>> 8) & 0xff, off + 3);
      body.writeUInt8((packed >>> 16) & 0xff, off + 4);
      body.writeUInt16LE(clampU16(e.w), off + 5); // packedB u16
      body.writeUInt8(clampU8(e.flag), off + 7); // flag u8
    }
  }
  return inner;
}

// ===================================================================================================
// 0x309 ResponseStaticInformationPowerDistribution — global ship/weapon perf-curve table (FULLY LABELED)
// ===================================================================================================
/**
 * Build ResponseStaticInformationPowerDistribution (0x309). A single fixed 1372-byte blob (NOT a faction
 * roster) — the global recharge/fill curves the tactical sim reads (shield regen, beam charge, gun
 * reload). Field walk (dump FUN_00410690, spec §2e):
 *   move[11] float @0x00 ; warp[2] u8 @0x2c ; sensor[4] float @0x30 ;
 *   shield[11][9] float @0x40 (each a `time`) ; beam[14][20] u16 @0x1cc (each a `value`) ;
 *   gun[11][16] u16 (each a `value`) — walks out to 0x55c.
 *
 * @param {{ move?:number[], warp?:number[], sensor?:number[], shield?:number[][], beam?:number[][], gun?:number[][] }} [data]
 */
export function buildStaticInformationPowerDistributionInner({
  move = [], warp = [], sensor = [], shield = [], beam = [], gun = [],
} = {}) {
  const inner = buildLobbyResponseInner(
    RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_CODE, RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_BYTES,
  );
  const body = inner.subarray(6);
  // move[11] float @0x00
  for (let i = 0; i < POWER_DIST_MOVE_LEN; i += 1) body.writeFloatLE(f32(move[i]), 0x00 + i * 4);
  // warp[2] u8 @0x2c
  for (let i = 0; i < POWER_DIST_WARP_LEN; i += 1) body.writeUInt8(clampU8(warp[i]), 0x2c + i);
  // sensor[4] float @0x30
  for (let i = 0; i < POWER_DIST_SENSOR_LEN; i += 1) body.writeFloatLE(f32(sensor[i]), 0x30 + i * 4);
  // shield[11][9] float @0x40
  for (let r = 0; r < POWER_DIST_SHIELD_ROWS; r += 1) {
    const row = shield[r] ?? [];
    for (let c = 0; c < POWER_DIST_SHIELD_COLS; c += 1) {
      body.writeFloatLE(f32(row[c]), 0x40 + (r * POWER_DIST_SHIELD_COLS + c) * 4);
    }
  }
  // beam[14][20] u16 @0x1cc
  for (let r = 0; r < POWER_DIST_BEAM_ROWS; r += 1) {
    const row = beam[r] ?? [];
    for (let c = 0; c < POWER_DIST_BEAM_COLS; c += 1) {
      body.writeUInt16LE(clampU16(row[c]), 0x1cc + (r * POWER_DIST_BEAM_COLS + c) * 2);
    }
  }
  // gun[11][16] u16 — immediately after the beam block (beam end = 0x1cc + 14*20*2 = 0x47c)
  const GUN_OFF = 0x1cc + POWER_DIST_BEAM_ROWS * POWER_DIST_BEAM_COLS * 2;
  for (let r = 0; r < POWER_DIST_GUN_ROWS; r += 1) {
    const row = gun[r] ?? [];
    for (let c = 0; c < POWER_DIST_GUN_COLS; c += 1) {
      const off = GUN_OFF + (r * POWER_DIST_GUN_COLS + c) * 2;
      if (off + 2 > body.length) break;
      body.writeUInt16LE(clampU16(row[c]), off);
    }
  }
  return inner;
}

// ===================================================================================================
// 0x30b ResponseStaticInformationUnitShip — per-hull master stat table (THE ship spec sheet)
// ===================================================================================================
/**
 * Build ResponseStaticInformationUnitShip (0x30b). Outer count u8 @0x00, up to 200 ship-classes, each a
 * 140-byte record (stride 0x8c). Header {kind u16 @0x00, b02 u8, b03 u8, w04 u16, w06 u16}, then a
 * name[≤13] wide-char pascal string @0x0c, then the stat block. The exact economic/combat meaning of
 * each stat slot is unlabeled in the client (spec §2a, OPEN-Q 2), so high-confidence slots from the
 * static dump field names (docs/logh7-proto-tactics-data.md §13) are written at their pinned positions:
 * the two floats @0x6c (speed) and @0x74, plus the named u16/u32 stats. content/ship-stats.json maps by
 * `kind`; seedShipClasses() projects its REAL manual pools onto the named slots.
 *
 * @param {{ ships?: Array<{ kind?:number, b02?:number, b03?:number, w04?:number, w06?:number,
 *   name?:string, w44?:number, d4c?:number, speed?:number, f74?:number,
 *   armorFront?:number, armorSide?:number, armorBack?:number, shield?:number, shieldCapacity?:number,
 *   beamPower?:number, gunPower?:number, missilePower?:number, antiaircraftPower?:number,
 *   crew?:number, cost?:number, resources?:number, unitCount?:number,
 *   stats?:number[], block11?:number[] }> }} [data]
 */
export function buildStaticInformationUnitShipInner({ ships = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_STATIC_INFORMATION_UNIT_SHIP_CODE, RESP_STATIC_INFORMATION_UNIT_SHIP_BYTES);
  const body = inner.subarray(6);
  const list = ships.slice(0, UNIT_SHIP_MAX);
  body.writeUInt8(list.length & 0xff, 0x00); // outer count (u8)
  for (let i = 0; i < list.length; i += 1) {
    const s = list[i];
    const base = 4 + i * UNIT_SHIP_STRIDE; // 4-byte aligned count header (u8 + 3 pad)
    if (base + UNIT_SHIP_STRIDE > body.length) break;
    // CLIENT-CORRECT layout (docs/logh7-implementation-specs.md §2; parser FUN_004109a0 param_1=R+2,
    // store FUN_004ba2b0). The earlier layout was +4-drifted (name @0x0c, only 2 floats @0x6c/0x74) — wrong.
    body.writeUInt16LE(clampU16(s.kind), base + 0x00); // kind (ship-class id)
    body.writeUInt8(clampU8(s.b02), base + 0x02);
    body.writeUInt8(clampU8(s.b03), base + 0x03);
    body.writeUInt16LE(clampU16(s.w04), base + 0x04);
    body.writeUInt16LE(clampU16(s.w06), base + 0x06);
    // name: len u8 @R+0x08, chars u16[<=13] @R+0x0a (1-byte pad @0x09). Client reads len@param_1+6=R+8,
    // chars@param_1+8=R+0xa; bail if name_len > 13.
    const nameCodes = [...String(s.name ?? '')].slice(0, UNIT_SHIP_NAME_MAX);
    body.writeUInt8(nameCodes.length, base + 0x08);
    for (let j = 0; j < nameCodes.length; j += 1) {
      body.writeUInt16LE(nameCodes[j].charCodeAt(0) & 0xffff, base + 0x0a + j * 2);
    }
    // FOUR floats at the client-read offsets (vtable +0xc reader): speed + 3 continuous stats.
    body.writeFloatLE(f32(s.speed), base + 0x38);
    body.writeFloatLE(f32(s.f3c), base + 0x3c);
    body.writeFloatLE(f32(s.f5c), base + 0x5c);
    body.writeFloatLE(f32(s.f60), base + 0x60);
    body.writeUInt32LE(clampU32(s.d28), base + 0x28); // the one u32 stat slot
    // u16 stat slots at the EXACT client-read offsets. Fill positionally from s.stats[] (caller-exact)
    // else the named pools. Post-w06 stat SEMANTICS are MEDIUM confidence (gated LOGH_STATIC_SHIPS);
    // the OFFSETS/types are exact.
    const U16_SLOTS = [
      0x24, 0x2c, 0x2e, 0x30, 0x32, 0x34,
      0x40, 0x42, 0x44, 0x46, 0x48, 0x4a, 0x4c, 0x4e, 0x50, 0x52, 0x54,
      0x56, 0x58, 0x64, 0x66, 0x68, 0x6a, 0x6c, 0x70, 0x74, 0x78, 0x7c,
      0x80, 0x82, 0x84, 0x86, 0x88, 0x8a,
    ];
    const namedStats = [
      s.armorFront, s.armorSide, s.armorBack, s.shield,
      s.shieldCapacity, s.beamPower, s.antiaircraftPower, s.crew,
      s.cost, s.resources, s.unitCount, s.gunPower, s.missilePower,
    ];
    for (let j = 0; j < U16_SLOTS.length; j += 1) {
      const off = base + U16_SLOTS[j];
      if (off + 2 > base + UNIT_SHIP_STRIDE) break;
      const v = Array.isArray(s.stats) && s.stats[j] != null ? s.stats[j] : namedStats[j];
      body.writeUInt16LE(clampU16(v), off);
    }
  }
  return inner;
}

// ===================================================================================================
// 0x30d ResponseStaticInformationUnitTroop — ground-troop class master (FULLY LABELED, spec §2b)
// ===================================================================================================
/**
 * Build ResponseStaticInformationUnitTroop (0x30d). Outer count u8 @0x00, up to 16 troops, each a
 * 24-byte record (stride 0x18). Fully labeled (parser FUN_004121f0 + dump FUN_00412770 agree).
 *
 * @param {{ troops?: Array<{ kind?:number, type?:number, category?:number, achievement?:number,
 *   practice?:number, practiceCost?:number, resources?:number, speed?:number, offence?:number,
 *   defence?:number, tail?:number }> }} [data]
 */
export function buildStaticInformationUnitTroopInner({ troops = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_STATIC_INFORMATION_UNIT_TROOP_CODE, RESP_STATIC_INFORMATION_UNIT_TROOP_BYTES);
  const body = inner.subarray(6);
  const list = troops.slice(0, UNIT_TROOP_MAX);
  body.writeUInt8(list.length & 0xff, 0x00); // outer count (u8)
  for (let i = 0; i < list.length; i += 1) {
    const t = list[i];
    const base = 4 + i * UNIT_TROOP_STRIDE; // 4-byte aligned count header
    if (base + UNIT_TROOP_STRIDE > body.length) break;
    body.writeUInt16LE(clampU16(t.kind), base + 0x00); // s_kind_
    body.writeUInt8(clampU8(t.type), base + 0x02); // s_type_
    body.writeUInt8(clampU8(t.category), base + 0x03); // s_category_
    body.writeUInt16LE(clampU16(t.achievement), base + 0x04); // s_achievement_
    body.writeUInt16LE(clampU16(t.practice), base + 0x06); // s_practice_
    body.writeUInt16LE(clampU16(t.practiceCost), base + 0x08); // s_practice_cost_
    body.writeUInt16LE(clampU16(t.resources), base + 0x0a); // s_resources_
    body.writeFloatLE(f32(t.speed), base + 0x0c); // s_speed_
    body.writeUInt16LE(clampU16(t.offence), base + 0x10); // s_offence_
    body.writeUInt16LE(clampU16(t.defence), base + 0x12); // s_defence_
    body.writeUInt16LE(clampU16(t.tail), base + 0x14); // tail stat
  }
  return inner;
}

// ===================================================================================================
// 0x30f ResponseStaticInformationFighters — fighter/spartanian master (FULLY LABELED, spec §2c)
// ===================================================================================================
/**
 * Build ResponseStaticInformationFighters (0x30f). Outer count u8 @0x00, up to 4 fighters, each a
 * 12-byte record (stride 0x0c). Fully labeled (dump FUN_00412d70).
 *
 * @param {{ fighters?: Array<{ kind?:number, airbattle?:number, antiship?:number, defence?:number, cruising?:number }> }} [data]
 */
export function buildStaticInformationFightersInner({ fighters = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_STATIC_INFORMATION_FIGHTERS_CODE, RESP_STATIC_INFORMATION_FIGHTERS_BYTES);
  const body = inner.subarray(6);
  const list = fighters.slice(0, FIGHTERS_MAX);
  body.writeUInt8(list.length & 0xff, 0x00); // outer count (u8)
  for (let i = 0; i < list.length; i += 1) {
    const fgh = list[i];
    const base = 4 + i * FIGHTERS_STRIDE; // 4-byte aligned count header
    if (base + FIGHTERS_STRIDE > body.length) break;
    body.writeUInt16LE(clampU16(fgh.kind), base + 0x00); // s_kind_
    body.writeUInt16LE(clampU16(fgh.airbattle), base + 0x02); // s_airbattle_
    body.writeUInt16LE(clampU16(fgh.antiship), base + 0x04); // s_antiship_
    body.writeUInt16LE(clampU16(fgh.defence), base + 0x06); // s_defence_
    body.writeFloatLE(f32(fgh.cruising), base + 0x08); // s_cruising_
  }
  return inner;
}

// ===================================================================================================
// 0x311 ResponseStaticInformationArms — weapon hit/spread table (FULLY LABELED, spec §2d)
// ===================================================================================================
/**
 * Build ResponseStaticInformationArms (0x311). FIXED 2-D u16 array arms[27][8] (weapon × range/angle
 * bucket hit values), no count header: 27×8×2 = 432 = 0x1b0 exactly. Row stride 16 B (dump FUN_00412f90).
 *
 * @param {{ arms?: number[][] }} [data] arms[row][col], row<27, col<8.
 */
export function buildStaticInformationArmsInner({ arms = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_STATIC_INFORMATION_ARMS_CODE, RESP_STATIC_INFORMATION_ARMS_BYTES);
  const body = inner.subarray(6);
  for (let r = 0; r < ARMS_ROWS; r += 1) {
    const row = arms[r] ?? [];
    for (let c = 0; c < ARMS_COLS; c += 1) {
      body.writeUInt16LE(clampU16(row[c]), r * ARMS_ROW_STRIDE + c * 2);
    }
  }
  return inner;
}

// ===================================================================================================
// 0x317 ResponseInformationGrid — current grid index (single dword, spec info-records-wire §2)
// ===================================================================================================
/**
 * Build ResponseInformationGrid (0x317). A single dword = the current grid (map-cell) index the client
 * stores at clientBase+0x35f358. Dispatch size 4.
 *
 * @param {{ grid?:number }} [data]
 */
export function buildInformationGridInner({ grid = 0 } = {}) {
  const inner = buildLobbyResponseInner(RESP_INFORMATION_GRID_CODE, RESP_INFORMATION_GRID_BYTES);
  inner.subarray(6).writeUInt32LE(clampU32(grid), 0x00);
  return inner;
}

// ===================================================================================================
// 0x32d ResponseGridInformationOutfit — per-grid outfit presence (FULLY LABELED, spec §5b)
// ===================================================================================================
/**
 * Build ResponseGridInformationOutfit (0x32d). Outer count u16 @0x00, up to 300 outfits, each a 12-byte
 * record (stride 0x0c). Fully labeled (dump FUN_0041ca30): the compact "which fleets are on this
 * map-cell + their supply" list. Store global +0x367e60.
 *
 * @param {{ outfits?: Array<{ id?:number, kind?:number, power?:number, camp?:number, index?:number, supplies?:number }> }} [data]
 */
export function buildGridInformationOutfitInner({ outfits = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_GRID_INFORMATION_OUTFIT_CODE, RESP_GRID_INFORMATION_OUTFIT_BYTES);
  const body = inner.subarray(6);
  const list = outfits.slice(0, GRID_OUTFIT_MAX);
  body.writeUInt16LE(list.length & 0xffff, 0x00); // outer count u16
  for (let i = 0; i < list.length; i += 1) {
    const o = list[i];
    const base = 4 + i * GRID_OUTFIT_STRIDE; // 4-byte aligned count header (u16 + 2 pad)
    if (base + GRID_OUTFIT_STRIDE > body.length) break;
    body.writeUInt32LE(clampU32(o.id), base + 0x00); // outfit id
    body.writeUInt8(clampU8(o.kind), base + 0x04); // s_kind_
    body.writeUInt8(clampU8(o.power), base + 0x05); // s_power_
    body.writeUInt8(clampU8(o.camp), base + 0x06); // s_camp_
    body.writeUInt8(clampU8(o.index), base + 0x07); // s_index_
    body.writeUInt32LE(clampU32(o.supplies), base + 0x08); // s_supplies_
  }
  return inner;
}

// ===================================================================================================
// 0x331 ResponseOutfitInformationUnit — per-unit detail in an outfit (spec §5d)
// ===================================================================================================
/**
 * Build ResponseOutfitInformationUnit (0x331). Outer count u8 @0x00, up to 70 units, each an 88-byte
 * InformationUnit sub-record (stride 0x58). Parser FUN_0041f3d0; structure HIGH, names medium (no label
 * dump). Per element: unit_id u32 @0x00, w04 u16, b08 u8, boats_count u8 @0x10 (≤10) then boats[] u32
 * @0x14, plus a tail of d-fields + two u16 + a float @0x50. Store global +0x368c74.
 *
 * @param {{ units?: Array<{ id?:number, w04?:number, b08?:number, d04?:number, d08?:number, d0c?:number,
 *   boats?:number[], dtail?:number, b40?:number, b41?:number, w44?:number, w46?:number, d48?:number,
 *   d4c?:number, f50?:number }> }} [data]
 */
export function buildOutfitInformationUnitInner({ units = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_OUTFIT_INFORMATION_UNIT_CODE, RESP_OUTFIT_INFORMATION_UNIT_BYTES);
  const body = inner.subarray(6);
  const list = units.slice(0, OUTFIT_UNIT_MAX);
  body.writeUInt8(list.length & 0xff, 0x00); // outer count (u8)
  for (let i = 0; i < list.length; i += 1) {
    const u = list[i];
    const base = 4 + i * OUTFIT_UNIT_STRIDE; // 4-byte aligned count header
    if (base + OUTFIT_UNIT_STRIDE > body.length) break;
    body.writeUInt32LE(clampU32(u.id), base + 0x00); // unit_id
    body.writeUInt16LE(clampU16(u.w04), base + 0x04);
    body.writeUInt8(clampU8(u.b08), base + 0x08);
    body.writeUInt32LE(clampU32(u.d08), base + 0x08); // d-field (spec lists overlapping packed reads)
    body.writeUInt32LE(clampU32(u.d0c), base + 0x0c);
    const boats = Array.isArray(u.boats) ? u.boats.slice(0, OUTFIT_UNIT_BOATS_MAX) : [];
    body.writeUInt8(boats.length & 0xff, base + 0x10); // boats_count (≤10)
    for (let j = 0; j < boats.length; j += 1) {
      body.writeUInt32LE(clampU32(boats[j]), base + 0x14 + j * 4); // boats[] u32
    }
    body.writeUInt32LE(clampU32(u.dtail), base + 0x3c);
    body.writeUInt8(clampU8(u.b40), base + 0x40);
    body.writeUInt8(clampU8(u.b41), base + 0x41);
    body.writeUInt16LE(clampU16(u.w44), base + 0x44);
    body.writeUInt16LE(clampU16(u.w46), base + 0x46);
    body.writeUInt32LE(clampU32(u.d48), base + 0x48);
    body.writeUInt32LE(clampU32(u.d4c), base + 0x4c);
    body.writeFloatLE(f32(u.f50), base + 0x50);
  }
  return inner;
}

// ===================================================================================================
// 0x32f ResponseInformationOutfitParty — full fleet composition (FULLY LABELED, spec §5c)
// ===================================================================================================
/**
 * Build ResponseInformationOutfitParty (0x32f). Single big nested record (~35 KB) = the authoritative
 * complete fleet manifest: which officers command it, every ship + its inner units, ground troops,
 * supply level, and transport packages. Built with a STREAMING cursor (the arrays are length-prefixed,
 * so absolute offsets are computed sequentially per spec OPEN-Q 4 — a streaming builder reproduces them
 * exactly). Caps per spec §5c. Store global +0x35f35c.
 *
 * @param {{ outfit?:number, base?:number, mode?:number, power?:number, camp?:number, kind?:number,
 *   index?:number, characters?: Array<{ id?:number, kind?:number, rank?:number, name?:string }>,
 *   ships?: Array<{ kind?:number, unitNumber?:number, boatNumber?:number, units?:number[] }>,
 *   troops?: Array<{ kind?:number, troopGrade?:number, unitNumber?:number }>,
 *   supplies?:number, maxSupplies?:number, package?:number,
 *   otherPackages?: Array<{ kind?:number, unitKind?:number, troopGrade?:number, packageNumber?:number }>,
 *   troopPackages?: Array<{ kind?:number, unitKind?:number, troopGrade?:number, packageNumber?:number }>,
 *   transportPackageEmptySize?:number, troopTransportPackageEmptySize?:number, carrying?:number,
 *   notTogetherShips?: Array<object>, notTogetherTroops?: Array<object> }} [data]
 */
export function buildInformationOutfitPartyInner({
  outfit = 0, base = 0, mode = 0, power = 0, camp = 0, kind = 0, index = 0,
  characters = [], ships = [], troops = [],
  supplies = 0, maxSupplies = 0, package: pkg = 0,
  otherPackages = [], troopPackages = [],
  transportPackageEmptySize = 0, troopTransportPackageEmptySize = 0, carrying = 0,
  notTogetherShips = [], notTogetherTroops = [],
} = {}) {
  const inner = buildLobbyResponseInner(RESP_INFORMATION_OUTFIT_PARTY_CODE, RESP_INFORMATION_OUTFIT_PARTY_BYTES);
  const body = inner.subarray(6);
  let cur = 0;
  const u8 = (v) => { body.writeUInt8(clampU8(v), cur); cur += 1; };
  const u16 = (v) => { body.writeUInt16LE(clampU16(v), cur); cur += 2; };
  const u32 = (v) => { body.writeUInt32LE(clampU32(v), cur); cur += 4; };
  const name16 = (s, max = 13) => {
    const codes = [...String(s ?? '')].slice(0, max);
    body.writeUInt8(codes.length, cur); cur += 1;
    for (let i = 0; i < codes.length; i += 1) { body.writeUInt16LE(codes[i].charCodeAt(0) & 0xffff, cur); cur += 2; }
  };
  const arrU32 = (vals, max) => {
    const list = (Array.isArray(vals) ? vals : []).slice(0, max);
    body.writeUInt8(list.length & 0xff, cur); cur += 1;
    for (let i = 0; i < list.length; i += 1) { body.writeUInt32LE(clampU32(list[i]), cur); cur += 4; }
  };

  // header
  u32(outfit); u32(base); u8(mode); u8(power); u8(camp);
  cur += 1; // pad to 0x0c (kind u32 starts at +0x0c per spec)
  u32(kind); u32(index);

  // characters[] : u8 count (≤10), each {id u32, kind u8, rank u8, name(u8 len + u16[≤13])}
  const chars = characters.slice(0, OUTFIT_PARTY_CHARACTERS_MAX);
  u8(chars.length);
  for (const ch of chars) { u32(ch.id); u8(ch.kind); u8(ch.rank); name16(ch.name); }

  // ships[] : u8 count (≤60), each {kind u16, unit_number u8, boat_number u16, units(u8 len + u32[≤70])}
  const shipList = ships.slice(0, OUTFIT_PARTY_SHIPS_MAX);
  u8(shipList.length);
  for (const s of shipList) { u16(s.kind); u8(s.unitNumber); u16(s.boatNumber); arrU32(s.units, OUTFIT_PARTY_SHIP_UNITS_MAX); }

  // troops[] : u8 count (≤24), each {kind u16, troop_grade u8, unit_number u16}
  const troopList = troops.slice(0, OUTFIT_PARTY_TROOPS_MAX);
  u8(troopList.length);
  for (const t of troopList) { u16(t.kind); u8(t.troopGrade); u16(t.unitNumber); }

  // supplies u32, max_supplies u32, package u16
  u32(supplies); u32(maxSupplies); u16(pkg);

  // other_packages[] : u8 count (≤3), stride 12 {kind u8, unit_kind u16, troop_grade u8, package_number u32}
  const writePackages = (entries, max) => {
    const list = (Array.isArray(entries) ? entries : []).slice(0, max);
    u8(list.length);
    for (const e of list) { u8(e.kind); u16(e.unitKind); u8(e.troopGrade); u32(e.packageNumber); }
  };
  writePackages(otherPackages, OUTFIT_PARTY_PACKAGE_MAX);
  writePackages(troopPackages, OUTFIT_PARTY_TROOP_PACKAGE_MAX);

  // transport_package_empty_size u8, troop_transport_package_empty_size u8, carrying u8
  u8(transportPackageEmptySize); u8(troopTransportPackageEmptySize); u8(carrying);

  // not_together_ships[] (same shape as ships[]), not_together_troops[] (same shape as troops[])
  const ntShips = (Array.isArray(notTogetherShips) ? notTogetherShips : []).slice(0, OUTFIT_PARTY_SHIPS_MAX);
  u8(ntShips.length);
  for (const s of ntShips) { u16(s.kind); u8(s.unitNumber); u16(s.boatNumber); arrU32(s.units, OUTFIT_PARTY_SHIP_UNITS_MAX); }
  const ntTroops = (Array.isArray(notTogetherTroops) ? notTogetherTroops : []).slice(0, OUTFIT_PARTY_TROOPS_MAX);
  u8(ntTroops.length);
  for (const t of ntTroops) { u16(t.kind); u8(t.troopGrade); u16(t.unitNumber); }

  return inner; // body already zero-padded to the dispatch size by buildLobbyResponseInner
}

// ===================================================================================================
// 0x34f ResponseCardCharacter — ARRAY of the 724-byte 0x0323 character record (spec §1a)
// ===================================================================================================
/**
 * Build ResponseCardCharacter (0x34f). count u8 @0x00 (1..64), then `count` × the 724-byte 0x0323
 * character record (stride 0x2d4). The element layout is byte-for-byte the ResponseInformationCharacter
 * 0x0323 record, so we reuse the canonical builder (buildInformationCharacterRecordInner) per element
 * and copy its 724-byte payload into the array slot. This is how the server sends a batch of full
 * character sheets (a faction's personnel roster / officer pool) in one message. Store global +0x4271a8.
 *
 * @param {{ characters?: Array<Parameters<typeof buildInformationCharacterRecordInner>[0]> }} [data]
 */
export function buildCardCharacterInner({ characters = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_CARD_CHARACTER_CODE, RESP_CARD_CHARACTER_BYTES);
  const body = inner.subarray(6);
  const list = characters.slice(0, CARD_CHARACTER_MAX);
  body.writeUInt8(list.length & 0xff, 0x00); // count (1..64)
  for (let i = 0; i < list.length; i += 1) {
    const base = 4 + i * CARD_CHARACTER_STRIDE; // 4-byte aligned count header (u8 + 3 pad)
    if (base + CARD_CHARACTER_STRIDE > body.length) break;
    // The canonical 0x0323 record is a message32 inner: its 724-byte payload lives at subarray(6).
    const rec = buildInformationCharacterRecordInner(list[i] ?? {});
    rec.subarray(6, 6 + CARD_CHARACTER_STRIDE).copy(body, base);
  }
  return inner;
}

// ===================================================================================================
// 0x359 NotifyInformationOutfit — compact outfit-info delta (spec personnel-strategy §4.3)
// ===================================================================================================
/**
 * Build NotifyInformationOutfit (0x359). Recv copies 7 dwords (28 B) to &DAT_00432794 (apply
 * FUN_004c03b0): outfit id + a handful of state dwords. Sub-field labels not printed in this build —
 * confidence medium; size & apply confirmed. We expose the 7 dwords as outfit id + dwords[].
 *
 * @param {{ outfit?:number, dwords?:number[] }} [data] dwords fill dword slots 1..6.
 */
export function buildNotifyInformationOutfitInner({ outfit = 0, dwords = [] } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_INFORMATION_OUTFIT_CODE, NOTIFY_INFORMATION_OUTFIT_BYTES);
  const body = inner.subarray(6);
  body.writeUInt32LE(clampU32(outfit), 0x00); // dword[0] = outfit id
  for (let i = 0; i < 6; i += 1) {
    body.writeUInt32LE(clampU32(dwords[i]), 0x04 + i * 4); // dword[1..6]
  }
  return inner;
}

// ===================================================================================================
// 0x35a NotifyEnding — end-of-game / ending record (spec personnel-strategy §4.4)
// ===================================================================================================
/**
 * Build NotifyEnding (0x35a). 1076-byte end-screen payload deserialized field-wise into &DAT_0043caa0.
 * Low priority for the play loop; size confirmed, inner semantics are an end screen (credits/result text
 * + ids). High-confidence head fields are placed at their recv offsets; the rest is zero-padded.
 *
 * @param {{ type?:number, code2?:number, b6?:number, b7?:number, d2?:number, d4?:number, w5?:number,
 *   tail?:number[], text?:string }} [data]
 */
export function buildNotifyEndingInner({
  type = 0, code2 = 0, b6 = 0, b7 = 0, d2 = 0, d4 = 0, w5 = 0, tail = [], text = null,
} = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_ENDING_CODE, NOTIFY_ENDING_BYTES);
  const body = inner.subarray(6);
  body.writeUInt32LE(clampU32(type), 0x00); // hdr/type
  body.writeUInt16LE(clampU16(code2), 0x04); // code2
  body.writeUInt8(clampU8(b6), 0x06);
  body.writeUInt8(clampU8(b7), 0x07);
  body.writeUInt32LE(clampU32(d2), 0x08); // d2
  body.writeUInt32LE(clampU32(d4), 0x10); // d4
  body.writeUInt16LE(clampU16(w5), 0x14); // w5
  for (let i = 0; i < 4 && i < tail.length; i += 1) {
    body.writeUInt32LE(clampU32(tail[i]), 0x18 + i * 4); // d6..d9
  }
  if (text != null) {
    // text/name block @0x2a (0xd u16 chars per the recv copy)
    const codes = [...String(text)].slice(0, 0xd);
    for (let i = 0; i < codes.length; i += 1) body.writeUInt16LE(codes[i].charCodeAt(0) & 0xffff, 0x2a + i * 2);
  }
  return inner;
}

// ===================================================================================================
// STATE — the master-data store. Seeds the immutable tables from content/ where relevant so the build*
// projectors have real data. Keyed so a request handler can emit one table per request.
// ===================================================================================================

function tryReadJson(rel) {
  try {
    return JSON.parse(readFileSync(join(CONTENT_DIR, rel), 'utf8'));
  } catch {
    return null;
  }
}

const finiteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function seedManualTroopMaster(troopsDeployment) {
  const unitsByName = new Map();
  const push = (unit, sideType) => {
    if (!unit || typeof unit !== 'object') return;
    const key = String(unit.name_ja ?? unit.name_en ?? unit.name_ko ?? '');
    if (!key) return;
    const existing = unitsByName.get(key);
    if (existing && existing.sideType !== 0) return;
    unitsByName.set(key, { unit, sideType });
  };
  for (const [side, sideType] of [['empire', 1], ['alliance', 2]]) {
    const units = troopsDeployment?.troopUnits?.[side]?.units;
    if (!Array.isArray(units)) continue;
    for (const unit of units) push(unit, sideType);
  }
  return [...unitsByName.values()].slice(0, UNIT_TROOP_MAX).map(({ unit, sideType }, i) => ({
    kind: i + 1,
    type: sideType,
    category: unit.produced === false ? 1 : 0,
    achievement: 0,
    practice: finiteNumber(unit.training),
    practiceCost: finiteNumber(unit.training),
    resources: finiteNumber(unit.training),
    speed: 0,
    offence: finiteNumber(unit.groundAttack),
    defence: finiteNumber(unit.groundDefense),
    tail: unit.produced === false ? 1 : 0,
  }));
}

function playableFighterSeed() {
  // P3 playable seed. Replace by manual/client static dump via manual/static-info-masters.json.
  return [
    { kind: 1, airbattle: 70, antiship: 35, defence: 30, cruising: 100 },
    { kind: 2, airbattle: 75, antiship: 30, defence: 28, cruising: 100 },
    { kind: 3, airbattle: 40, antiship: 90, defence: 20, cruising: 80 },
    { kind: 4, airbattle: 85, antiship: 20, defence: 25, cruising: 120 },
  ];
}

function playableArmsSeed() {
  // P3 playable hit/spread table. Shape is P0; values are temporary until original static dump lands.
  return Array.from({ length: ARMS_ROWS }, (_, r) => (
    Array.from({ length: ARMS_COLS }, (_, c) => Math.max(1, Math.round((96 - r * 2) * (1 - c * 0.08))))
  ));
}

function playablePowerDistributionSeed() {
  // P3 playable curves, intentionally smooth/nonzero so tactical panels are not blank.
  return {
    move: Array.from({ length: POWER_DIST_MOVE_LEN }, (_, i) => Math.max(0.25, 1 - i * 0.05)),
    warp: [1, 1],
    sensor: [1, 1.15, 1.3, 1.45],
    shield: Array.from({ length: POWER_DIST_SHIELD_ROWS }, (_, r) => (
      Array.from({ length: POWER_DIST_SHIELD_COLS }, (_, c) => 1 + r * 0.25 + c * 0.1)
    )),
    beam: Array.from({ length: POWER_DIST_BEAM_ROWS }, (_, r) => (
      Array.from({ length: POWER_DIST_BEAM_COLS }, (_, c) => Math.max(1, 12 + r * 3 + c))
    )),
    gun: Array.from({ length: POWER_DIST_GUN_ROWS }, (_, r) => (
      Array.from({ length: POWER_DIST_GUN_COLS }, (_, c) => Math.max(1, 10 + r * 2 + c))
    )),
  };
}

/**
 * Map a content/ship-stats.json `ships[]` entry onto the 0x30b UnitShip wire fields. `kind` is a
 * positional ship-class id (1-based on load order) because the manual entries carry string codes
 * (SS75/…), not numeric ids; the named pools come straight from the REAL manual numbers (null pools
 * are written as 0). Names are truncated to the 13-wide-char cap.
 */
function shipStatToUnitShip(entry, kind) {
  const pools = entry?.pools ?? {};
  const raw = entry?._raw ?? {};
  const rawVal = (k) => (raw?.[k]?.value ?? null);
  const armor = rawVal('armor');
  const armorObject = armor && typeof armor === 'object' ? armor : null;
  return {
    kind,
    name: entry?.key ?? entry?.name ?? '',
    armorFront: armorObject ? armorObject.front : (armor ?? 0),
    armorSide: armorObject ? armorObject.side : 0,
    armorBack: armorObject ? armorObject.back : 0,
    shield: pools.defense ?? rawVal('shield_guard') ?? 0, // シールド防護値
    shieldCapacity: pools.maxShield ?? rawVal('shield_capacity') ?? 0, // シールド容量
    beamPower: pools.beamPower ?? rawVal('beam_power') ?? 0,
    gunPower: rawVal('gun_power') ?? 0,
    missilePower: rawVal('missile_power') ?? 0,
    antiaircraftPower: rawVal('antiaircraft_power') ?? 0,
    crew: rawVal('crew') ?? 0,
    cost: rawVal('repair_cost') ?? 0,
    resources: rawVal('supply_capacity') ?? 0,
    unitCount: pools.maxZanki ?? rawVal('unit_count') ?? 0,
    speed: rawVal('speed') ?? 0,
  };
}

/**
 * Create the static-info master-data store. Seeds ship-class master (0x30b) from
 * content/ship-stats.json; the rest are left empty maps/arrays the server fills as the world advances.
 * The galaxy / character roster are available to the caller via the loaded handles for grid/party seeds.
 *
 * @param {{ load?:boolean, playableSeeds?:boolean }} [opts] load=false skips content reads (for pure unit tests).
 */
export function createInfoRecordsStaticState({ load = true, playableSeeds = false } = {}) {
  const shipStats = load ? tryReadJson('ship-stats.json') : null;
  const roster = load ? tryReadJson('character-roster.json') : null;
  const troopsDeployment = load ? tryReadJson('manual/troops-deployment.json') : null;
  const staticMasters = load
    ? (tryReadJson('manual/static-info-masters.json') ?? tryReadJson('static-info-masters.json'))
    : null;

  const shipClasses = [];
  if (shipStats && Array.isArray(shipStats.ships)) {
    shipStats.ships.forEach((entry, i) => shipClasses.push(shipStatToUnitShip(entry, i + 1)));
  }
  const troops = Array.isArray(staticMasters?.troops)
    ? staticMasters.troops
    : seedManualTroopMaster(troopsDeployment);
  const fighters = Array.isArray(staticMasters?.fighters)
    ? staticMasters.fighters
    : (playableSeeds ? playableFighterSeed() : []);
  const arms = Array.isArray(staticMasters?.arms)
    ? staticMasters.arms
    : (playableSeeds ? playableArmsSeed() : []);
  const powerDistribution = staticMasters?.powerDistribution
    ?? (playableSeeds ? playablePowerDistributionSeed() : null);

  return {
    shipClasses, // [{kind, name, ...pools}] for 0x30b (seeded from REAL manual numbers)
    troops, // 0x30d ground-troop master (P1 manual troops-deployment.json or static dump)
    fighters, // 0x30f fighter master (static dump, or P3 playable seed if enabled)
    arms, // 0x311 weapon hit table (static dump, or P3 playable seed if enabled)
    powerDistribution, // 0x309 perf-curve blob (static dump, or P3 playable seed if enabled)
    cardCommands: [], // 0x307 per-card command grants
    gridOutfits: new Map(), // grid -> outfit presence list (0x32d)
    outfitUnits: new Map(), // outfitId -> per-unit detail list (0x331)
    outfitParties: new Map(), // outfitId -> full manifest (0x32f)
    currentGrid: 0, // 0x317
    roster, // raw character-roster handle (for 0x34f / outfit-party officer seeds)

    /** Project the seeded ship-class master onto the 0x30b record. */
    buildUnitShip() {
      return buildStaticInformationUnitShipInner({ ships: this.shipClasses });
    },
  };
}

// ===================================================================================================
// process() — the uniform domain entry. This family is a pure S→C READ MODEL (no inbound mutation), so
// process() accepts and emits nothing. The lead routes the REQUEST codes (responseCode-1) to a handler
// that calls the matching build*Inner and sends it to the requesting connection.
// ===================================================================================================
/**
 * @param {{ state?:object, connectionId?:number, innerCode?:number, inner?:Buffer }} ctx
 * @returns {{ accept:boolean, handled:boolean, code:number, notifies:Array<{inner:Buffer, target:'others'|'all'}> }}
 */
export function processInfoRecordsStatic({ innerCode } = {}) {
  return { accept: true, handled: false, code: innerCode, notifies: [] };
}

/** Codes this module builds (for the lead's integration map). */
export const INFO_RECORD_STATIC_CODES = Object.freeze({
  RESP_STATIC_INFORMATION_CARD_COMMAND_CODE,
  RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_CODE,
  RESP_STATIC_INFORMATION_UNIT_SHIP_CODE,
  RESP_STATIC_INFORMATION_UNIT_TROOP_CODE,
  RESP_STATIC_INFORMATION_FIGHTERS_CODE,
  RESP_STATIC_INFORMATION_ARMS_CODE,
  RESP_INFORMATION_GRID_CODE,
  RESP_GRID_INFORMATION_OUTFIT_CODE,
  RESP_INFORMATION_OUTFIT_PARTY_CODE,
  RESP_OUTFIT_INFORMATION_UNIT_CODE,
  RESP_CARD_CHARACTER_CODE,
  NOTIFY_INFORMATION_OUTFIT_CODE,
  NOTIFY_ENDING_CODE,
});

export { buildLobbyResponseInner };
