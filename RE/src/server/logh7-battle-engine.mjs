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

// 전략모드 복귀용 modeKind (docs/logh7-proto-battle-core.md §3 FSM + FUN_004c45f0):
//   modeKind=0 → 전술 풀 활성(전투 진입), modeKind=2 → 전략 그리드 풀 활성("enter strategic").
//   전투 종결 시 서버가 0x042f를 modeKind=2로 다시 보내면 클라가 전략맵으로 돌아간다("battle ends" 경로).
export const RETURN_TO_STRATEGIC_MODE_KIND = 2;
// 降伏勧告 순수 판정(AU-2, opcode-wiring B-3). 클라 항복 opcode 부재(확정) → 전투해소 시 서버 내부판정.
import { resolveSurrender } from './logh7-surrender.mjs';

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
// FULL TACTICAL SEED — build COMPLETE per-ship participants from authoritative world-state ships so
// openBattleField emits non-empty FillShield(0x341)/FillBeamGun(0x343)/UnitShip(0x33b)/Character(0x337)
// tables. ★라이브 확정(2026-06-26): placeholder 참가자(좌표만)는 전술 데이터 불완전으로 시각 전환이
// stall한다. upsertShip은 모든 Ship에 shieldMax/shieldFill/beamgunA/fillA/beamgunB/fillB를 채우므로,
// 그 필드를 participant로 전부 전달해야 클라가 완전 전술 렌더를 구성한다(GAP A 테스트가 빌더 레벨에서 입증).
// 순수 함수: worldState ship 목록 + 자기 unitId/charId만으로 결정. 추측 P0 없음 — 모든 필드는
// world-state.upsertShip가 클래스 스탯에서 산출한 RE-확정 와이어 필드(0x341/0x343/0x33b)뿐.
// ===========================================================================

/**
 * buildBattleEntryParticipants — expand authoritative world-state ships into FULL tactical participants
 * (좌표 + 사기/혼란 + 함장 + 6방향 실드 배열 + 빔건 뱅크). 자기 유닛이 항상 첫 참가자.
 *
 * 좌표: 전술 필드는 전략 그리드와 다른 float 공간이므로 world x/z를 8배 스케일 + 중심 오프셋(+100)으로
 * 흩뿌린다(겹침 방지). y=0 평면. heading은 함선 현재 heading 유지.
 *
 * @param {{ listShips?: () => object[] }|null} worldState  authoritative world-state (listShips 제공)
 * @param {{ unitId:number, character?:number, cap?:number, center?:number, scale?:number }} self
 * @returns {{ participants: object[], characters: number[] }}
 *   participants: openBattleField participants[] (FillShield/FillBeamGun 비-제로 보장),
 *   characters: 0x337 ResponseTacticsCharacter 로스터(자기 함장 + 시드 함선 함장, 중복 제거)
 */
export function buildBattleEntryParticipants(worldState, self = {}) {
  const unitId = u32(self.unitId ?? 0);
  const cap = Math.max(1, Math.min(MAX_TACTICS_UNITS, self.cap ?? 12));
  const center = Number.isFinite(self.center) ? self.center : 100;
  const scale = Number.isFinite(self.scale) ? self.scale : 8;
  const ships = (worldState && typeof worldState.listShips === 'function')
    ? worldState.listShips().filter((s) => s && !s.destroyed)
    : [];

  // 자기 유닛은 항상 첫 참가자(anchor). world-state에 등록돼 있으면 그 실드/빔건을 쓰고, 없으면 중심에 배치.
  const ownShip = ships.find((s) => s.id === unitId) ?? null;
  const toParticipant = (s, px, pz) => ({
    shipId: s.id,
    x: px, y: 0, z: pz, heading: s.heading ?? 0,
    morale: s.morale ?? 100, confusion: 0,
    character: s.character ?? 0,
    detachmentLeader: 0, search: 0,
    // 0x341 FillShield / 0x343 FillBeamGun 와이어 필드(upsertShip가 클래스 스탯에서 채움).
    shield: s.shieldMax, fill: s.shieldFill,
    beamgunA: s.beamgunA, fillA: s.fillA, beamgunB: s.beamgunB, fillB: s.fillB,
  });

  const participants = [];
  participants.push(
    ownShip
      ? toParticipant(ownShip, center, center)
      : { shipId: unitId, x: center, y: 0, z: center, heading: 0, morale: 100, confusion: 0, character: u32(self.character ?? 0) },
  );

  for (const s of ships) {
    if (s.id === unitId || participants.length >= cap) continue;
    participants.push(toParticipant(s, ((s.x ?? 0) * scale) + center, ((s.z ?? 0) * scale) + center));
  }

  // 0x337 로스터: 참가 함선이 실은 함장 id(0 제외, 중복 제거).
  const seen = new Set();
  const characters = [];
  for (const p of participants) {
    const c = u32(p.character ?? 0);
    if (c !== 0 && !seen.has(c)) { seen.add(c); characters.push(c); }
  }

  return { participants, characters };
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

  // 3. shield arrays — read explicit shield/fill first; fall back to shieldMax/shieldFill which
  //    upsertShip populates on every Ship entity from the class stats (0x341 FillShield).
  push(
    buildTacticsInformationFillShieldInner({
      ships: participants.map((p) => ({
        id: p.shipId,
        shield: p.shield ?? p.shieldMax,
        fill: p.fill ?? p.shieldFill,
      })),
    }),
    RESPONSE_TACTICS_FILL_SHIELD_CODE,
  );

  // 4. beam-gun banks — beamgunA/fillA/beamgunB/fillB are set by upsertShip (0x343 FillBeamGun).
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

// ===========================================================================
// 降伏勧告(SURRENDER) — 서버 내부판정(AU-2). 클라엔 항복 opcode가 없으므로(opcode-wiring §B-3, high=부재
// 확정) 전투해소 경로에서 서버가 統率·표적사기로 판정한다. **보수적·게이트**: 기본 전투결과를 급변시키지
// 않고 **추가 판정 경로**로만 동작 — (1) 표적 사기가 임계 이하 && 공격측 統率이 최소치 이상일 때만 후보,
// (2) roll을 호출자가 주입(결정론). 발생 시 부수효과는 최소(접수 플래그)로 두고 클라-대면 효과는 라이브
// 검증 전제(현재 와이어 신설/브로드캐스트 없음). logh7-surrender.resolveSurrender 순수 함수를 래핑한다.
// ===========================================================================

// SERVER DESIGN 게이트(보수적): 아래를 모두 만족할 때만 항복 판정을 시도한다. 둘 다 캐논 정성("統率이 좌우",
// 사기 저하 시 항복 가능)에 맞춘 보수적 임계 — 수치 자체는 P3(미수록), 호출자가 override 가능.
export const SURRENDER_MORALE_GATE = 30; // 표적 사기 이 값 이하라야 항복 후보(온전한 적은 항복 안 함)
export const SURRENDER_MIN_LEADERSHIP = 1; // 권고 사령관 統率 최소치(0이면 시도조차 안 함)

/**
 * 전투해소 경로에서 호출하는 **추가** 항복 판정(보수적·게이트). 기본 전투(피해/격침)는 호출자가 이미 처리한
 * 뒤, 격침되지 않고 살아남은 표적에 한해 이 함수로 항복 여부를 별도 판정한다 → 기본 결과를 바꾸지 않는다.
 *
 * 보수성 요지:
 *  - 격침된 표적(destroyed)·이미 항복한 표적은 제외(중복/뒤집기 방지).
 *  - 게이트 미통과(사기>임계 or 統率<최소)면 시도 자체를 건너뛴다.
 *  - roll은 호출자가 주입(state.rng 등) → 결정론·재현. 미주입 시 roll=1(절대 수락 안 함 = 안전 기본).
 *  - 부수효과는 호출자 몫(여기선 판정 결과만 반환). 와이어/브로드캐스트는 신설하지 않는다.
 *
 * @param {{ leadership?:number }} recommender 권고측(보통 旗艦 사령관)
 * @param {{ id?:number, morale?:number, destroyed?:boolean, surrendered?:boolean }[]} targets 살아남은 적 표적들
 * @param {{ roll?: () => number, moraleGate?:number, minLeadership?:number }} [opts]
 *   roll: 0..1 난수 공급자(미지정=항상 1). moraleGate/minLeadership: 게이트 override.
 * @returns {{ surrenders: { id:number, chance:number }[], evaluated:number }}
 *   surrenders=항복 수락된 표적(id+chance), evaluated=실제 판정을 시도한 표적 수.
 */
export function resolveBattleSurrenders(recommender = {}, targets = [], opts = {}) {
  const moraleGate = Number.isFinite(opts.moraleGate) ? opts.moraleGate : SURRENDER_MORALE_GATE;
  const minLeadership = Number.isFinite(opts.minLeadership) ? opts.minLeadership : SURRENDER_MIN_LEADERSHIP;
  const roll = typeof opts.roll === 'function' ? opts.roll : () => 1; // 미주입=절대 수락 안 함(보수적 기본)
  const leadership = Number(recommender?.leadership) || 0;
  const surrenders = [];
  let evaluated = 0;

  // 統率이 최소치 미만이면 전체 시도 안 함(기본 전투결과 완전 보존).
  if (leadership < minLeadership) {
    return { surrenders, evaluated };
  }
  for (const target of targets ?? []) {
    // 게이트: 격침/이미 항복/사기 임계 초과는 제외 → 살아있고 사기 무너진 적만 후보.
    if (!target || target.destroyed || target.surrendered) {
      continue;
    }
    const morale = Number(target.morale ?? 100);
    if (morale > moraleGate) {
      continue;
    }
    evaluated += 1;
    const { accepted, chance } = resolveSurrender(recommender, target, roll());
    if (accepted) {
      surrenders.push({ id: target.id ?? 0, chance });
    }
  }
  return { surrenders, evaluated };
}

// ===========================================================================
// BATTLE CONCLUSION (크리티컬패스 STEP5) — 전투 종결: 전멸 감지 → 사상 정산 → 결과 판정 → 전략모드 복귀.
// 모두 순수 결정론 함수(roll/입력 주입). 와이어 브로드캐스트는 기존 0x042f 빌더를 재사용한다.
// "전투에 들어갈 순 있지만 절대 빠져나오지 못한다"는 갭을 닫는 코드.
// ===========================================================================

/**
 * closeBattleField — 전투 종료를 클라에 통지하는 전략모드 복귀 메시지(0x042f, modeKind=2).
 *
 * openBattleField의 짝(역연산): openBattleField가 0x042f(modeKind=0)로 전술 풀을 켜고 스폰포즈를
 * 시드했다면, 이 함수는 0x042f(modeKind=2)로 전략 그리드 풀을 다시 켠다("enter strategic",
 * docs/logh7-proto-battle-core.md §3 FSM line 226 "battle ends ... S->C 0x042f (modeKind back)").
 *
 * 생존 함선은 전략맵으로 복귀하므로 그 스폰포즈를 함께 실어 보낸다(클라가 위치를 잃지 않도록). 전투가
 * 없었거나 생존자가 없어도 빈 entry로 modeKind=2만 보내면 클라는 전술 풀을 비우고 전략맵으로 돌아간다.
 *
 * @param {{
 *   survivors?: { shipId:number, heading?:number, x?:number, z?:number, y?:number }[],
 *   anchorId?: number, tail0?: number, tail1?: number,
 *   target?: 'all'|'others',
 * }} options
 * @returns {{ inner: Buffer, code: number, target: string }}
 */
export function closeBattleField({
  survivors = [],
  anchorId = 0,
  tail0 = 0,
  tail1 = 0,
  target = 'all',
} = {}) {
  const inner = buildNotifyChangeModeInner({
    modeKind: RETURN_TO_STRATEGIC_MODE_KIND, // 2 = 전략 그리드 풀 활성("enter strategic")
    fieldOwnerId: anchorId,
    units: survivors.map((s) => ({
      shipId: s.shipId ?? s.id ?? 0,
      heading: s.heading ?? 0, x: s.x ?? 0, z: s.z ?? 0, y: s.y ?? 0,
    })),
    tail0,
    tail1,
  });
  return { inner, code: NOTIFY_CHANGE_MODE_CODE, target };
}

/**
 * tallyCasualties — 참가 함선 목록을 진영별로 정산한다(사상 정산). 순수 함수.
 *
 * 한 척의 "전멸/격침" 여부는 `destroyed` 플래그(world-state.applyDamage가 残機 소진 시 세움) 또는
 * 残機(zanki)<=0 으로 판정한다(둘 중 하나라도 참이면 격침). 목록에 없는(이미 removeShip된) 함선은
 * 격침으로 본다 — 호출자가 격침 id를 함께 넘기면 정확히 반영된다.
 *
 * @param {{
 *   ships?: { id:number, faction:(number|string), destroyed?:boolean, zanki?:number,
 *             heading?:number, x?:number, z?:number, y?:number }[],
 * }} options
 * @returns {{
 *   byFaction: Map<(number|string), { faction, total, living, destroyed,
 *     livingShips: object[], destroyedIds: number[] }>,
 *   livingFactions: (number|string)[],
 *   survivors: object[],
 *   totalLiving: number, totalDestroyed: number,
 * }}
 */
export function tallyCasualties({ ships = [] } = {}) {
  const byFaction = new Map();
  const survivors = [];
  let totalLiving = 0;
  let totalDestroyed = 0;

  for (const ship of ships) {
    if (!ship) continue;
    const faction = ship.faction ?? 0;
    if (!byFaction.has(faction)) {
      byFaction.set(faction, {
        faction, total: 0, living: 0, destroyed: 0, livingShips: [], destroyedIds: [],
      });
    }
    const bucket = byFaction.get(faction);
    bucket.total += 1;
    // 격침 판정: destroyed 플래그가 서거나, 残機(zanki)가 명시되어 0 이하이면 격침.
    const dead = ship.destroyed === true || (typeof ship.zanki === 'number' && ship.zanki <= 0);
    // 항복(降伏)한 함선은 전투에서 이탈했으므로 "생존(전투 가능)"으로 치지 않는다(3.4) — 전멸 판정·생존자
    // 목록 모두에서 제외한다. 단 격침이 아니므로 destroyedIds(격침 id)에는 넣지 않는다(접수/무력화).
    const surrendered = ship.surrendered === true;
    if (dead) {
      bucket.destroyed += 1;
      bucket.destroyedIds.push(ship.id);
      totalDestroyed += 1;
    } else if (surrendered) {
      bucket.surrendered = (bucket.surrendered ?? 0) + 1; // 무력화: 생존도 격침도 아닌 이탈
    } else {
      bucket.living += 1;
      bucket.livingShips.push(ship);
      survivors.push(ship);
      totalLiving += 1;
    }
  }

  const livingFactions = [...byFaction.values()]
    .filter((b) => b.living > 0)
    .map((b) => b.faction);

  return { byFaction, livingFactions, survivors, totalLiving, totalDestroyed };
}

/**
 * concludeBattle — 전투 종결의 결정론 정산 함수(크리티컬패스 STEP5).
 *
 * 단계: (1) 전멸 감지 — 생존 함선이 남은 진영의 수를 센다. (2) 사상 정산 — 진영별 격침/생존 집계.
 * (3) 결과 판정 — 생존 진영이 1개뿐이면 그 진영 승리(나머지 전멸), 0개이면 무승부(공멸), 2개 이상이면
 * 아직 진행 중(over=false). (4) 전략모드 복귀 — over이면 0x042f(modeKind=2) 복귀 notify를 만든다.
 *
 * 순수 함수: 입력(ships, destroyedIds, anchorId)만으로 결정되며 난수/시각/전역상태에 의존하지 않는다.
 * 와이어 브로드캐스트는 만들지 않고 notify "objects"({inner,code,target}) 배열로 반환한다(호출자가 송신).
 *
 * @param {{
 *   ships?: object[],          // 참가 함선(world-state.listShips() 또는 참가자 한정 목록)
 *   destroyedIds?: number[],   // 이미 그리드에서 제거된(removeShip) 격침 함선 id — 정산에 격침으로 포함
 *   destroyedShips?: object[], // (선택) 제거된 함선의 진영 정보까지 넘길 때(정확한 진영별 격침수)
 *   anchorId?: number,         // 복귀 notify의 field anchor(보통 전투 anchorId)
 *   target?: 'all'|'others',
 * }} options
 * @returns {{
 *   over: boolean,             // 전투 종결 여부(생존 진영 <= 1)
 *   draw: boolean,             // 공멸(생존 진영 0)
 *   winner: (number|string|null),
 *   losers: (number|string)[],
 *   livingFactions: (number|string)[],
 *   casualties: { faction, total, living, destroyed, destroyedIds:number[] }[],
 *   survivors: object[],
 *   reason: string,
 *   notifies: { inner: Buffer, code: number, target: string }[],
 * }}
 */
export function concludeBattle({
  ships = [],
  destroyedIds = [],
  destroyedShips = [],
  anchorId = 0,
  target = 'all',
} = {}) {
  // 이미 제거된 격침 함선을 정산 대상에 포함(진영 정보가 있으면 진영별로, 없으면 무진영 격침으로).
  const removedSet = new Set(destroyedIds);
  const knownRemoved = new Map(); // id -> 함선(진영 포함)
  for (const s of destroyedShips) {
    if (s && s.id != null) knownRemoved.set(s.id, s);
  }
  const phantoms = [];
  for (const id of removedSet) {
    if (ships.some((s) => s && s.id === id)) continue; // 살아있는 목록에 있으면 그쪽 판정을 따름
    const known = knownRemoved.get(id);
    phantoms.push(known
      ? { ...known, destroyed: true }
      : { id, faction: 0, destroyed: true }); // 진영 미상 격침
  }

  const tally = tallyCasualties({ ships: [...ships, ...phantoms] });
  const { byFaction, livingFactions, survivors } = tally;

  const casualties = [...byFaction.values()].map((b) => ({
    faction: b.faction,
    total: b.total,
    living: b.living,
    destroyed: b.destroyed,
    destroyedIds: b.destroyedIds.slice(),
  }));

  const over = livingFactions.length <= 1;
  const draw = livingFactions.length === 0;
  const winner = livingFactions.length === 1 ? livingFactions[0] : null;
  const losers = over
    ? casualties.map((c) => c.faction).filter((f) => f !== winner)
    : [];

  let reason;
  if (!over) {
    reason = 'ongoing'; // 두 개 이상 진영이 생존 — 전투 계속
  } else if (draw) {
    reason = 'mutual-annihilation'; // 공멸
  } else {
    reason = 'elimination'; // 한쪽 전멸 → winner 승리
  }

  const notifies = over
    ? [closeBattleField({ survivors, anchorId, target })]
    : [];

  return {
    over, draw, winner, losers, livingFactions, casualties, survivors, reason, notifies,
  };
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
