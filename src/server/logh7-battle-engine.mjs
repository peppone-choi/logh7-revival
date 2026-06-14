/**
 * Authoritative tactical battle-setup data layer + LIVE BATTLE-ENTRY orchestration — SELF-CONTAINED.
 *
 * This is the path that flips a client from the strategic map into a *controllable tactical battle*:
 * the server pushes a set of S->C read-model RECORD tables (per-unit positions, per-ship combat stats,
 * shield/beam fill arrays, character roster, corps, bases, obstacles), then the authoritative
 * NotifyChangeMode 0x42f (seeds every ship's spawn pose + activates the tactical pool), then
 * NotifyTactics 0x0f1f (the "begin space-war" signal). The exact ordered push is `openBattleField()`.
 *
 * The LOGH VII client is a thin renderer here: it only RECEIVES these tables and re-expands the packed
 * wire records into its padded in-memory structs. So the server is the source of truth for every battle
 * stat, position, shield/beam charge and obstacle.
 *
 * ── FRAMING (matches logh7-combat-engine / the 内政 modules) ──────────────────────────────────────────
 *   - C->S inner = [u16 BE code][LE body]; a parser strips the 2-byte code (inner.subarray(2)).
 *   - S->C inner = buildLobbyResponseInner(code, bytes) => [u32 0 prefix][u16 BE code][LE payload];
 *     the LE payload is inner.subarray(6). All bodies LITTLE-ENDIAN; only the 2-byte code prefix is BE.
 *   - Record-array messages are emitted **PACKED** ([u16 count][packed records], NOT zero-padded to the
 *     dispatch struct size): the client's Input_*::input_from_stream advances by exactly the packed sizes
 *     and re-expands into its padded struct (docs/logh7-proto-tactics-data.md §0). We therefore allocate a
 *     payload of the exact packed length, not the dispatch cap.
 *
 * ── WIRE LAYOUTS (Ghidra G7MTClient static RE) ───────────────────────────────────────────────────────
 *   docs/logh7-proto-tactics-data.md  — §1 UnitShip 0x33b, §2 TacticsCharacter 0x337,
 *     §3 FillShield 0x341, §4 FillBeamGun 0x343, §5 Corps 0x33f, §6 Base 0x345, §7 PositionUnit 0x349 /
 *     PositionBase 0x34b, §8 Obstacle 0x347, §9 NotifyTactics 0x0f1f, §10 NotifyTacticsChiefCommander 0x431.
 *   docs/logh7-proto-battle-core.md   — §2 NotifyChangeMode 0x42f (the mode-transition grant), §3 FSM.
 * High-confidence fields are implemented byte-for-byte; medium/low ones are written from the proven
 * getter widths with the meaning noted (NEVER an invented layout).
 *
 * Pure + synchronous => fully unit-testable without a live client.
 */

import {
  buildLobbyResponseInner,
  buildMpsClientMessage32Inner,
  buildNotifyChangeModeInner,
  NOTIFY_CHANGE_MODE_CODE,
} from './logh7-login-protocol.mjs';

// ---------------------------------------------------------------------------
// Message codes (docs/logh7-proto-tactics-data.md §0 dispatch table + §1-§10).
// ---------------------------------------------------------------------------
export const RESPONSE_TACTICS_CHARACTER_CODE = 0x0337; // S->C roster of battle commanders
export const RESPONSE_TACTICS_UNIT_SHIP_CODE = 0x033b; // S->C per-ship live battle state ★
export const RESPONSE_TACTICS_CORPS_CODE = 0x033f; // S->C corps morale + per-facing shield aggregate
export const RESPONSE_TACTICS_FILL_SHIELD_CODE = 0x0341; // S->C per-ship 6-direction shield arrays ★
export const RESPONSE_TACTICS_FILL_BEAMGUN_CODE = 0x0343; // S->C per-ship beam-gun banks ★
export const RESPONSE_TACTICS_BASE_CODE = 0x0345; // S->C fortress/base battle entries
export const RESPONSE_INFORMATION_OBSTACLE_CODE = 0x0347; // S->C battlefield hazards (5 sub-tables)
export const RESPONSE_POSITION_UNIT_CODE = 0x0349; // S->C per-unit battle position (id+xyz+heading) ★
export const RESPONSE_POSITION_BASE_CODE = 0x034b; // S->C base battle positions
export const NOTIFY_TACTICS_CODE = 0x0f1f; // S->C "enter space-war" trigger (8B)
export const NOTIFY_TACTICS_CHIEF_COMMANDER_CODE = 0x0431; // S->C battle chief-commander change (8B)

// Re-export the mode-transition grant code (lives in logh7-login-protocol) for callers.
export { NOTIFY_CHANGE_MODE_CODE };

// Command codes that GRANT battle entry (the lead calls openBattleField on these; see integrationNote).
export const COMMAND_CHANGE_MODE_CODE = 0x0411; // C->S CommandChangeMode (per-ship tactical engage)
export const COMMAND_SWITCH_MODE_CODE = 0x0b06; // C->S CommandSwitchMode (strategic<->tactical switch)

// ---------------------------------------------------------------------------
// Dispatch struct sizes (proven from FUN_004b8b00; = 4 + MAXCOUNT × struct_stride). These are the
// client's RECEIVE-BUFFER caps, NOT the wire body length (we emit packed). Kept for reference/assert.
// ---------------------------------------------------------------------------
export const UNIT_SHIP_DISPATCH_BYTES = 0x79e4; // 31204 = 4 + 600×52
export const CORPS_DISPATCH_BYTES = 0x8ca4; // 36004 = 4 + 600×60
export const FILL_SHIELD_DISPATCH_BYTES = 0x5dc4; // 24004 = 4 + 600×40
export const FILL_BEAMGUN_DISPATCH_BYTES = 0x2ee4; // 12004 = 4 + 600×20
export const TACTICS_CHARACTER_DISPATCH_BYTES = 0x0964; // 2404 = 4 + 600×4
export const BASE_DISPATCH_BYTES = 0x0204; // 516 = 4 + 16×32
export const POSITION_UNIT_DISPATCH_BYTES = 0x2ee4; // 12004 = 4 + 600×20
export const POSITION_BASE_DISPATCH_BYTES = 0x0044; // 68 = 4 + 4×16
export const OBSTACLE_DISPATCH_BYTES = 0x01d8; // 472 (sum of 5 sub-tables)
export const NOTIFY_TACTICS_BYTES = 8; // 0x0f1f consumes 8 bytes (2 dwords)
export const NOTIFY_TACTICS_CHIEF_COMMANDER_BYTES = 8; // 0x431 consumes 8 bytes (2 dwords)

// ---------------------------------------------------------------------------
// Packed wire record strides (the bytes the server actually serializes per record).
// ---------------------------------------------------------------------------
export const UNIT_SHIP_RECORD_BYTES = 47; // §1: u32 id, u8 morale, u8 confusion, u32 character, 3×vec3 f32 + 2 dir f32, u8 search
export const CORPS_RECORD_BYTES = 55; // §5: u32 id, u8 morale, u8 confusion, u32 character, f32 dir, u8 flag, u8[6], u16[2], u16[6], u16[6]
export const FILL_SHIELD_RECORD_BYTES = 40; // §3: u32 id, u32[6] shield, u16[6] fill
export const FILL_BEAMGUN_RECORD_BYTES = 16; // §4: u32 id, (u32 val,u16 fill)×2
export const TACTICS_CHARACTER_RECORD_BYTES = 4; // §2: u32 character_id
export const BASE_RECORD_BYTES = 28; // §6: u32 id, f32 x/y/z, u32, u16, u32, u16
export const POSITION_UNIT_RECORD_BYTES = 20; // §7a: u32 id, f32 x/y/z, f32 heading
export const POSITION_BASE_RECORD_BYTES = 16; // §7b: u32 id, f32 x/y/z

// ---------------------------------------------------------------------------
// Array caps (proven from the "over than N" error strings, §0 + §6/§7b/§8).
// ---------------------------------------------------------------------------
export const MAX_TACTICS_UNITS = 600; // UnitShip/Corps/FillShield/FillBeamGun/PositionUnit/Character < 0x259
export const MAX_TACTICS_BASES = 16; // ResponseTacticsInformationBase < 0x11
export const MAX_POSITION_BASES = 4; // ResponsePositionBase < 5
export const MAX_OBSTACLE_CIRCLE = 5;
export const MAX_OBSTACLE_ABNORMAL_GRAVITY = 1;
export const MAX_OBSTACLE_GAS_CLOUD = 10;
export const MAX_OBSTACLE_ASTEROID_BELT = 1;
export const MAX_OBSTACLE_BLACKHOLE = 5; // error string says ≤1, loop bounds <6 (medium); cap at loop bound

const u32 = (v) => (v >>> 0) & 0xffffffff;
const u16 = (v) => Math.max(0, Math.min(0xffff, Math.round(v))) & 0xffff;
const u8 = (v) => Math.max(0, Math.min(0xff, Math.round(v))) & 0xff;
const f32 = (v) => (Number.isFinite(v) ? v : 0);

/**
 * Build a PACKED record-array message: a fresh message32 inner whose LE payload is
 * [u16 count][count × recordBytes]. `writeRecord(view, off, rec, index)` fills one packed record into the
 * payload view at `off`. We size the payload exactly (2 + count×recordBytes) — NOT the dispatch cap —
 * because the client deserializes only `count` packed records (docs §0).
 */
function buildPackedU16Count(code, records, recordBytes, writeRecord, maxCount) {
  const count = Math.min(records.length, maxCount);
  const payload = Buffer.alloc(2 + count * recordBytes);
  payload.writeUInt16LE(count, 0);
  for (let i = 0; i < count; i += 1) {
    writeRecord(payload, 2 + i * recordBytes, records[i], i);
  }
  return buildMpsClientMessage32Inner({ code, payload });
}

/**
 * Build a PACKED record-array message with a u8 count + 3 pad bytes (8-byte header: the struct starts at
 * +8). Used by the base tables (§6/§7b) whose count is a u8. Payload = [u8 count][3 pad][4 pad][records].
 * The records begin at offset 8 (the parser reads the struct base at param_1+8).
 */
function buildPackedU8CountBase(code, records, recordBytes, writeRecord, maxCount) {
  const count = Math.min(records.length, maxCount);
  const payload = Buffer.alloc(8 + count * recordBytes);
  payload.writeUInt8(count, 0); // [u8 count][3 pad][4 pad] = 8-byte header
  for (let i = 0; i < count; i += 1) {
    writeRecord(payload, 8 + i * recordBytes, records[i], i);
  }
  return buildMpsClientMessage32Inner({ code, payload });
}

// ===========================================================================
// S->C RECORD BUILDERS (battle-setup read model). Offsets are INTO each packed record.
// ===========================================================================

/**
 * 0x349 ResponsePositionUnit — per-unit battle position (id + xyz + heading). THE minimum to place ships
 * on the tactical field (§7a, all HIGH confidence; same float space as NotifyMovedShip 0x423).
 * Record (20B): u32 id @0, f32 x @4, f32 y @8, f32 z @0xc, f32 heading @0x10.
 * `units` = [{ id|shipId, x, y, z, heading }]. Body = [u16 count][20B × count].
 */
export function buildResponsePositionUnitInner({ units = [] } = {}) {
  return buildPackedU16Count(
    RESPONSE_POSITION_UNIT_CODE,
    units,
    POSITION_UNIT_RECORD_BYTES,
    (p, off, u) => {
      p.writeUInt32LE(u32(u.id ?? u.shipId ?? 0), off);
      p.writeFloatLE(f32(u.x ?? 0), off + 4);
      p.writeFloatLE(f32(u.y ?? 0), off + 8);
      p.writeFloatLE(f32(u.z ?? 0), off + 0xc);
      p.writeFloatLE(f32(u.heading ?? 0), off + 0x10);
    },
    MAX_TACTICS_UNITS,
  );
}

/**
 * 0x33b ResponseTacticsInformationUnitShip — per-ship live battle stats (§1). HIGH on id/morale/confusion/
 * character/direction/detachment_leader/detachment_direction/search; MED on the three f32 vec3 groups
 * (inferred position vs other vec3). Static combat scalars (durability/beam/shield-cap) live in 0x30b /
 * content/ship-stats.json — NOT here; this carries live per-instance state.
 * Record (47B): u32 id @0, u8 morale @4, u8 confusion @5, u32 character @6, f32 x @0xa, f32 y @0xe,
 *   f32 z @0x12, f32 direction @0x16, u32 detachment_leader @0x1a, f32 det_x @0x1e, f32 det_y @0x22,
 *   f32 det_z @0x26, f32 detachment_direction @0x2a, u8 search @0x2e.
 * `ships` = [{ id|shipId, morale, confusion, character, x, y, z, direction|heading, detachmentLeader,
 *   detX, detY, detZ, detachmentDirection, search }].
 */
export function buildTacticsInformationUnitShipInner({ ships = [] } = {}) {
  return buildPackedU16Count(
    RESPONSE_TACTICS_UNIT_SHIP_CODE,
    ships,
    UNIT_SHIP_RECORD_BYTES,
    (p, off, s) => {
      p.writeUInt32LE(u32(s.id ?? s.shipId ?? 0), off);
      p.writeUInt8(u8(s.morale ?? 100), off + 4);
      p.writeUInt8(u8(s.confusion ?? 0), off + 5);
      p.writeUInt32LE(u32(s.character ?? 0), off + 6);
      p.writeFloatLE(f32(s.x ?? 0), off + 0xa);
      p.writeFloatLE(f32(s.y ?? 0), off + 0xe);
      p.writeFloatLE(f32(s.z ?? 0), off + 0x12);
      p.writeFloatLE(f32(s.direction ?? s.heading ?? 0), off + 0x16);
      p.writeUInt32LE(u32(s.detachmentLeader ?? 0), off + 0x1a);
      p.writeFloatLE(f32(s.detX ?? s.x ?? 0), off + 0x1e);
      p.writeFloatLE(f32(s.detY ?? s.y ?? 0), off + 0x22);
      p.writeFloatLE(f32(s.detZ ?? s.z ?? 0), off + 0x26);
      p.writeFloatLE(f32(s.detachmentDirection ?? s.direction ?? s.heading ?? 0), off + 0x2a);
      p.writeUInt8(u8(s.search ?? 0), off + 0x2e);
    },
    MAX_TACTICS_UNITS,
  );
}

/**
 * 0x341 ResponseTacticsInformationFillShield — per-ship live 6-direction shield arrays (§3). HIGH on
 * id/shield[6]; MED-HIGH on fill[6]. Feeds the damage model: a beam hits a facing, depletes fill[facing],
 * then armor/durability.
 * Record (40B): u32 id @0, u32 shield[6] @4 (stride 4), u16 fill[6] @0x1c (stride 2).
 * `ships` = [{ id|shipId, shield:[6], fill:[6] }]. Missing entries default to 0.
 */
export function buildTacticsInformationFillShieldInner({ ships = [] } = {}) {
  return buildPackedU16Count(
    RESPONSE_TACTICS_FILL_SHIELD_CODE,
    ships,
    FILL_SHIELD_RECORD_BYTES,
    (p, off, s) => {
      p.writeUInt32LE(u32(s.id ?? s.shipId ?? 0), off);
      const shield = s.shield ?? [];
      for (let k = 0; k < 6; k += 1) {
        p.writeUInt32LE(u32(shield[k] ?? 0), off + 4 + k * 4);
      }
      const fill = s.fill ?? [];
      for (let k = 0; k < 6; k += 1) {
        p.writeUInt16LE(u16(fill[k] ?? 0), off + 0x1c + k * 2);
      }
    },
    MAX_TACTICS_UNITS,
  );
}

/**
 * 0x343 ResponseTacticsInformationFillBeamGun — per-ship beam-gun banks + cooldown/charge (§4). MED on
 * the bank split (which is main vs secondary). The fill gates the 0x405/0x406 fire commands.
 * Record (16B): u32 id @0, u32 beamgunA @4, u16 fillA @8, u32 beamgunB @0xa, u16 fillB @0xe.
 * `ships` = [{ id|shipId, beamgunA, fillA, beamgunB, fillB }].
 */
export function buildTacticsInformationFillBeamGunInner({ ships = [] } = {}) {
  return buildPackedU16Count(
    RESPONSE_TACTICS_FILL_BEAMGUN_CODE,
    ships,
    FILL_BEAMGUN_RECORD_BYTES,
    (p, off, s) => {
      p.writeUInt32LE(u32(s.id ?? s.shipId ?? 0), off);
      p.writeUInt32LE(u32(s.beamgunA ?? 0), off + 4);
      p.writeUInt16LE(u16(s.fillA ?? 0), off + 8);
      p.writeUInt32LE(u32(s.beamgunB ?? 0), off + 0xa);
      p.writeUInt16LE(u16(s.fillB ?? 0), off + 0xe);
    },
    MAX_TACTICS_UNITS,
  );
}

/**
 * 0x337 ResponseTacticsCharacter — the roster of commanders present in the battle (§2, HIGH). The body
 * has a 4-byte header ([u16 field0][u16 count]) then count × u32 character_id.
 * `characters` = [characterId, ...] (numbers) or [{ id|characterId }]. `field0` defaults 0.
 */
export function buildTacticsCharacterInner({ characters = [], field0 = 0 } = {}) {
  const count = Math.min(characters.length, MAX_TACTICS_UNITS);
  const payload = Buffer.alloc(4 + count * TACTICS_CHARACTER_RECORD_BYTES);
  payload.writeUInt16LE(u16(field0), 0);
  payload.writeUInt16LE(count, 2);
  for (let i = 0; i < count; i += 1) {
    const c = characters[i];
    const id = typeof c === 'number' ? c : (c?.id ?? c?.characterId ?? 0);
    payload.writeUInt32LE(u32(id), 4 + i * TACTICS_CHARACTER_RECORD_BYTES);
  }
  return buildMpsClientMessage32Inner({ code: RESPONSE_TACTICS_CHARACTER_CODE, payload });
}

/**
 * 0x33f ResponseTacticsInformationCorps — corps morale/confusion + per-facing shield/armor aggregates
 * (§5). HIGH on id/morale/confusion/character; MED on direction; LOW on the trailing per-facing arrays
 * (exact split not separately indexed — treat as aggregate per-facing state, pin with a capture).
 * Record (55B): u32 id @0, u8 morale @4, u8 confusion @5, u32 character @6, f32 direction @0xa,
 *   u8 flag @0xe, u8 byte6a[6] @0xf, u16 word2[2] @0x15, u16 wordA[6] @0x19, u16 wordB[6] @0x25.
 * `corps` = [{ id, morale, confusion, character, direction, flag, byte6a:[6], word2:[2], wordA:[6], wordB:[6] }].
 */
export function buildTacticsInformationCorpsInner({ corps = [] } = {}) {
  return buildPackedU16Count(
    RESPONSE_TACTICS_CORPS_CODE,
    corps,
    CORPS_RECORD_BYTES,
    (p, off, c) => {
      p.writeUInt32LE(u32(c.id ?? 0), off);
      p.writeUInt8(u8(c.morale ?? 100), off + 4);
      p.writeUInt8(u8(c.confusion ?? 0), off + 5);
      p.writeUInt32LE(u32(c.character ?? 0), off + 6);
      p.writeFloatLE(f32(c.direction ?? 0), off + 0xa);
      p.writeUInt8(u8(c.flag ?? 0), off + 0xe);
      const byte6a = c.byte6a ?? [];
      for (let k = 0; k < 6; k += 1) {
        p.writeUInt8(u8(byte6a[k] ?? 0), off + 0xf + k);
      }
      const word2 = c.word2 ?? [];
      for (let k = 0; k < 2; k += 1) {
        p.writeUInt16LE(u16(word2[k] ?? 0), off + 0x15 + k * 2);
      }
      const wordA = c.wordA ?? [];
      for (let k = 0; k < 6; k += 1) {
        p.writeUInt16LE(u16(wordA[k] ?? 0), off + 0x19 + k * 2);
      }
      const wordB = c.wordB ?? [];
      for (let k = 0; k < 6; k += 1) {
        p.writeUInt16LE(u16(wordB[k] ?? 0), off + 0x25 + k * 2);
      }
    },
    MAX_TACTICS_UNITS,
  );
}

/**
 * 0x345 ResponseTacticsInformationBase — fortress/base battle entries (§6). Count is a u8 (max 16); the
 * 8-byte header precedes the records. HIGH on id/xyz; MED/LOW on the four trailing params.
 * Record (28B): u32 id @0, f32 x @4, f32 y @8, f32 z @0xc, u32 u32a @0x10, u16 u16a @0x14,
 *   u32 u32b @0x16, u16 u16b @0x1a.
 * `bases` = [{ id, x, y, z, u32a, u16a, u32b, u16b }].
 */
export function buildTacticsInformationBaseInner({ bases = [] } = {}) {
  return buildPackedU8CountBase(
    RESPONSE_TACTICS_BASE_CODE,
    bases,
    BASE_RECORD_BYTES,
    (p, off, b) => {
      p.writeUInt32LE(u32(b.id ?? 0), off);
      p.writeFloatLE(f32(b.x ?? 0), off + 4);
      p.writeFloatLE(f32(b.y ?? 0), off + 8);
      p.writeFloatLE(f32(b.z ?? 0), off + 0xc);
      p.writeUInt32LE(u32(b.u32a ?? 0), off + 0x10);
      p.writeUInt16LE(u16(b.u16a ?? 0), off + 0x14);
      p.writeUInt32LE(u32(b.u32b ?? 0), off + 0x16);
      p.writeUInt16LE(u16(b.u16b ?? 0), off + 0x1a);
    },
    MAX_TACTICS_BASES,
  );
}

/**
 * 0x34b ResponsePositionBase — base battle positions (§7b). Count u8 (max 4), 8-byte header. HIGH.
 * Record (16B): u32 id @0, f32 x @4, f32 y @8, f32 z @0xc.
 * `bases` = [{ id, x, y, z }].
 */
export function buildResponsePositionBaseInner({ bases = [] } = {}) {
  return buildPackedU8CountBase(
    RESPONSE_POSITION_BASE_CODE,
    bases,
    POSITION_BASE_RECORD_BYTES,
    (p, off, b) => {
      p.writeUInt32LE(u32(b.id ?? 0), off);
      p.writeFloatLE(f32(b.x ?? 0), off + 4);
      p.writeFloatLE(f32(b.y ?? 0), off + 8);
      p.writeFloatLE(f32(b.z ?? 0), off + 0xc);
    },
    MAX_POSITION_BASES,
  );
}

/**
 * 0x347 InformationObstacle — static battlefield hazards (§8): FIVE sequential count-prefixed sub-tables,
 * each [u8 count] then records. Section record shapes (wire order):
 *   circle/abnormalgravity/asteroidbelt: u32 id, u8 flag, u16 word, f32 a, f32 b  (15B)
 *   gascloud:  u32 id, u8 flag, u16 word, f32 a, u32 id2, u8 flag2, f32 c, f32 d  (24B)
 *   blackhole: u32 id, u8 flag, u16 word, f32 x, f32 y, f32 z, f32 r             (23B)
 * The blackhole cap is MED (string says ≤1, loop bounds <6 reading 5 floats). Field TYPES are solid.
 * `obstacles` = { circle:[], abnormalGravity:[], gasCloud:[], asteroidBelt:[], blackhole:[] }, elements:
 *   small  = { id, flag, word, a, b }
 *   gas    = { id, flag, word, a, id2, flag2, c, d }
 *   bh     = { id, flag, word, x, y, z, r }
 */
export function buildInformationObstacleInner(obstacles = {}) {
  const circle = (obstacles.circle ?? []).slice(0, MAX_OBSTACLE_CIRCLE);
  const grav = (obstacles.abnormalGravity ?? []).slice(0, MAX_OBSTACLE_ABNORMAL_GRAVITY);
  const gas = (obstacles.gasCloud ?? []).slice(0, MAX_OBSTACLE_GAS_CLOUD);
  const belt = (obstacles.asteroidBelt ?? []).slice(0, MAX_OBSTACLE_ASTEROID_BELT);
  const bh = (obstacles.blackhole ?? []).slice(0, MAX_OBSTACLE_BLACKHOLE);

  const SMALL = 15;
  const GAS = 24;
  const BH = 23;
  const total =
    1 + circle.length * SMALL +
    1 + grav.length * SMALL +
    1 + gas.length * GAS +
    1 + belt.length * SMALL +
    1 + bh.length * BH;
  const payload = Buffer.alloc(total);
  let o = 0;

  const writeSmall = (rec) => {
    payload.writeUInt32LE(u32(rec.id ?? 0), o);
    payload.writeUInt8(u8(rec.flag ?? 0), o + 4);
    payload.writeUInt16LE(u16(rec.word ?? 0), o + 5);
    payload.writeFloatLE(f32(rec.a ?? 0), o + 7);
    payload.writeFloatLE(f32(rec.b ?? 0), o + 11);
    o += SMALL;
  };
  const writeSection = (arr, writer) => {
    payload.writeUInt8(arr.length & 0xff, o);
    o += 1;
    for (const rec of arr) writer(rec);
  };

  writeSection(circle, writeSmall);
  writeSection(grav, writeSmall);
  writeSection(gas, (rec) => {
    payload.writeUInt32LE(u32(rec.id ?? 0), o);
    payload.writeUInt8(u8(rec.flag ?? 0), o + 4);
    payload.writeUInt16LE(u16(rec.word ?? 0), o + 5);
    payload.writeFloatLE(f32(rec.a ?? 0), o + 7);
    payload.writeUInt32LE(u32(rec.id2 ?? 0), o + 11);
    payload.writeUInt8(u8(rec.flag2 ?? 0), o + 15);
    payload.writeFloatLE(f32(rec.c ?? 0), o + 16);
    payload.writeFloatLE(f32(rec.d ?? 0), o + 20);
    o += GAS;
  });
  writeSection(belt, writeSmall);
  writeSection(bh, (rec) => {
    payload.writeUInt32LE(u32(rec.id ?? 0), o);
    payload.writeUInt8(u8(rec.flag ?? 0), o + 4);
    payload.writeUInt16LE(u16(rec.word ?? 0), o + 5);
    payload.writeFloatLE(f32(rec.x ?? 0), o + 7);
    payload.writeFloatLE(f32(rec.y ?? 0), o + 11);
    payload.writeFloatLE(f32(rec.z ?? 0), o + 15);
    payload.writeFloatLE(f32(rec.r ?? 0), o + 19);
    o += BH;
  });

  return buildMpsClientMessage32Inner({ code: RESPONSE_INFORMATION_OBSTACLE_CODE, payload });
}

/**
 * 0x0f1f NotifyTactics — the "enter space-war" trigger (§9, 8B). Byte0 of arg0 selects the battle setup
 * branch (FUN_004c1b20: ==1 → state 2 else 0). arg0 MED (battle id/mode), arg1 LOW (side/phase).
 */
export function buildNotifyTacticsInner({ arg0 = 0, arg1 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_TACTICS_CODE, NOTIFY_TACTICS_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(u32(arg0), 0);
  p.writeUInt32LE(u32(arg1), 4);
  return inner;
}

/**
 * 0x431 NotifyTacticsChiefCommander — assign/announce the battle chief commander (§10, 8B). Pure
 * broadcast pair (sideOrUnitId, characterId). MED.
 */
export function buildNotifyTacticsChiefCommanderInner({ sideOrUnitId = 0, character = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_TACTICS_CHIEF_COMMANDER_CODE, NOTIFY_TACTICS_CHIEF_COMMANDER_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(u32(sideOrUnitId), 0);
  p.writeUInt32LE(u32(character), 4);
  return inner;
}

// ===========================================================================
// ORCHESTRATION — the exact ordered S->C push that flips clients into a controllable tactical battle.
// ===========================================================================

/**
 * openBattleField — build the ordered notify sequence that places ships + flips clients into a
 * controllable tactical battle (docs/logh7-proto-battle-core.md §3 FSM + tactics-data §11).
 *
 * Order (each present table is included; absent ones are skipped):
 *   1. 0x349 ResponsePositionUnit            — place every ship (id + xyz + heading)  ★ minimum to place
 *   2. 0x33b ResponseTacticsInformationUnitShip — live per-ship battle state
 *   3. 0x341 ResponseTacticsInformationFillShield — per-ship 6-direction shield arrays
 *   4. 0x343 ResponseTacticsInformationFillBeamGun — per-ship beam-gun banks
 *   5. 0x337 ResponseTacticsCharacter        — commander roster (if any)
 *   6. 0x33f ResponseTacticsInformationCorps  — corps aggregates (if any)
 *   7. 0x345 ResponseTacticsInformationBase   — fortress/base entries (if any)
 *   8. 0x347 InformationObstacle              — battlefield hazards (if any)
 *   9. 0x34b ResponsePositionBase             — base positions (if any)
 *  10. 0x42f NotifyChangeMode                 — THE mode-transition grant (seeds spawn poses + activates
 *                                               the tactical pool); modeKind 0 = normal tactical engage
 *  11. 0x0f1f NotifyTactics                   — the "begin space-war" signal (last)
 *
 * @param {{
 *   participants: { shipId:number, x?:number, y?:number, z?:number, heading?:number,
 *                   morale?:number, confusion?:number, character?:number, search?:number,
 *                   detachmentLeader?:number, shield?:number[], fill?:number[],
 *                   beamgunA?:number, fillA?:number, beamgunB?:number, fillB?:number }[],
 *   anchorId?: number, fieldId?: number, modeKind?: number,
 *   characters?: number[], corps?: object[], bases?: object[], obstacles?: object,
 *   tacticsArg0?: number, tacticsArg1?: number, tail0?: number, tail1?: number,
 *   target?: 'all'|'others'
 * }} options
 * @returns {{ inner: Buffer, code: number, target: string }[]} the ordered push.
 */
export function openBattleField({
  participants = [],
  anchorId = 0,
  fieldId = 0,
  modeKind = 0,
  characters = [],
  corps = [],
  bases = [],
  obstacles = null,
  tacticsArg0,
  tacticsArg1 = 0,
  tail0 = 0,
  tail1 = 0,
  target = 'all',
} = {}) {
  const out = [];
  const push = (inner, code) => out.push({ inner, code, target });

  // 1. positions — the minimum to place ships on the field.
  push(
    buildResponsePositionUnitInner({
      units: participants.map((p) => ({
        id: p.shipId, x: p.x, y: p.y, z: p.z, heading: p.heading,
      })),
    }),
    RESPONSE_POSITION_UNIT_CODE,
  );

  // 2. live per-ship battle stats.
  push(
    buildTacticsInformationUnitShipInner({
      ships: participants.map((p) => ({
        id: p.shipId, morale: p.morale, confusion: p.confusion, character: p.character,
        x: p.x, y: p.y, z: p.z, direction: p.heading, detachmentLeader: p.detachmentLeader,
        detachmentDirection: p.heading, search: p.search,
      })),
    }),
    RESPONSE_TACTICS_UNIT_SHIP_CODE,
  );

  // 3. shield arrays.
  push(
    buildTacticsInformationFillShieldInner({
      ships: participants.map((p) => ({ id: p.shipId, shield: p.shield, fill: p.fill })),
    }),
    RESPONSE_TACTICS_FILL_SHIELD_CODE,
  );

  // 4. beam-gun banks.
  push(
    buildTacticsInformationFillBeamGunInner({
      ships: participants.map((p) => ({
        id: p.shipId, beamgunA: p.beamgunA, fillA: p.fillA, beamgunB: p.beamgunB, fillB: p.fillB,
      })),
    }),
    RESPONSE_TACTICS_FILL_BEAMGUN_CODE,
  );

  // 5-9. optional read-model tables (only when present).
  if (characters.length > 0) {
    push(buildTacticsCharacterInner({ characters }), RESPONSE_TACTICS_CHARACTER_CODE);
  }
  if (corps.length > 0) {
    push(buildTacticsInformationCorpsInner({ corps }), RESPONSE_TACTICS_CORPS_CODE);
  }
  if (bases.length > 0) {
    push(buildTacticsInformationBaseInner({ bases }), RESPONSE_TACTICS_BASE_CODE);
  }
  if (obstacles) {
    push(buildInformationObstacleInner(obstacles), RESPONSE_INFORMATION_OBSTACLE_CODE);
  }
  if (bases.length > 0) {
    push(
      buildResponsePositionBaseInner({ bases: bases.map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z })) }),
      RESPONSE_POSITION_BASE_CODE,
    );
  }

  // 10. NotifyChangeMode 0x42f — THE authoritative mode-transition grant (seed poses + activate pool).
  push(
    buildNotifyChangeModeInner({
      modeKind,
      fieldOwnerId: anchorId || fieldId,
      units: participants.map((p) => ({
        shipId: p.shipId, heading: p.heading ?? 0, x: p.x ?? 0, z: p.z ?? 0, y: p.y ?? 0,
      })),
      tail0,
      tail1,
    }),
    NOTIFY_CHANGE_MODE_CODE,
  );

  // 11. NotifyTactics 0x0f1f — the "begin space-war" signal (last).
  push(
    buildNotifyTacticsInner({ arg0: tacticsArg0 ?? fieldId, arg1: tacticsArg1 }),
    NOTIFY_TACTICS_CODE,
  );

  return out;
}

/** The S->C codes this domain emits (for the lead's routing/registration). */
export const BATTLE_SETUP_CODES = Object.freeze([
  RESPONSE_POSITION_UNIT_CODE,
  RESPONSE_TACTICS_UNIT_SHIP_CODE,
  RESPONSE_TACTICS_FILL_SHIELD_CODE,
  RESPONSE_TACTICS_FILL_BEAMGUN_CODE,
  RESPONSE_TACTICS_CHARACTER_CODE,
  RESPONSE_TACTICS_CORPS_CODE,
  RESPONSE_TACTICS_BASE_CODE,
  RESPONSE_INFORMATION_OBSTACLE_CODE,
  RESPONSE_POSITION_BASE_CODE,
  NOTIFY_CHANGE_MODE_CODE,
  NOTIFY_TACTICS_CODE,
  NOTIFY_TACTICS_CHIEF_COMMANDER_CODE,
]);
