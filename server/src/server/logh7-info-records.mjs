/**
 * 内政 (internal-affairs) READ-MODEL record BUILDERS — the fixed-size S→C "Information" objects the
 * client renders on its economy / personnel / fleet-organisation screens. This is a pure read model:
 * the server is the data source and there is NO client→server mutation in this family (mutations come
 * from the Command* families 0x4xx/0x9xx/0xbxx/0xcxx which then make the server re-emit the relevant
 * record here). So `processInfoRecords()` is intentionally a near-no-op (accept, no notifies); the real
 * surface is the `build<Record>Inner(data)` builders + a `createInfoRecordsState` economy store.
 *
 * Self-contained by design (avoids parallel write-conflicts with logh7-command-engine.mjs etc.): the
 * only import is the framing helper `buildLobbyResponseInner` from logh7-login-protocol.mjs.
 *
 * FRAMING (matches the rest of the codebase): every record is a conn3 message32 object
 *   inner = [u32 BE 0][u16 BE code][LE body...]   (buildLobbyResponseInner(code, bodyLen))
 * so the LE body lives at inner.subarray(6) and total inner length = 6 + bodyLen. The client's
 * receive-object factory (FUN_004b8b00) hard-sizes each code, so EVERY builder emits exactly the
 * dispatch-declared body size (zero-padded); the parser reads a leading count then `count` records of
 * a fixed stride and ignores the trailing zero pad.
 *
 * WIRE EVIDENCE: docs/logh7-proto-info-records.md (per-message field tables + Ghidra parser/dump
 * cross-checks + the decisive `max_count × stride (+header) == dispatch size` proof). Bodies are
 * little-endian; only the 2-byte inner code prefix is big-endian. Confidence flags are honoured below:
 * fully-labeled records (Warehouse/Package/Outfit/StaticBase) carry real field names; the
 * medium-confidence records (Card/Institution) implement the high-confidence STRUCTURE (stride, caps,
 * count header, pinned offsets) and leave the unlabeled packed bytes as generic `bXX`/`wXX` fields.
 *
 * Pure + synchronous => fully unit-testable without a live client.
 */

import { buildLobbyResponseInner } from './logh7-login-protocol.mjs';

// ---- message codes (docs/logh7-proto-info-records.md §0 dispatch table) ----
// Static-card 0x0305 is a parser/builder candidate only. Current live conn3
// 0x0304->0x0305 generic replies are zero-filled; the prior dispatcher tail with
// "Friedrich IV"-like text was stale receive-buffer residue, not server wire proof.
export const RESP_STATIC_INFORMATION_CARD_CODE = 0x0305; // S->C ResponseStaticInformationCard candidate
export const RESP_STATIC_INFORMATION_BASE_CODE = 0x031d; // S->C ResponseStaticInformationBase
export const RESP_INFORMATION_BASE_CODE = 0x031f;
export const RESP_INFORMATION_INSTITUTION_CODE = 0x0321; // S->C ResponseInformationInstitution
export const RESP_INFORMATION_WAREHOUSE_CODE = 0x0327; // S->C ResponseInformationWarehouse
export const RESP_INFORMATION_PACKAGE_CODE = 0x0329; // S->C ResponseInformationPackage
export const RESP_INFORMATION_OUTFIT_CODE = 0x032b; // S->C ResponseInformationOutfit

// ---- dispatch-declared body sizes (the FIXED message32 object size; builders zero-pad to these) ----
export const RESP_STATIC_INFORMATION_CARD_BYTES = 0x520a; // 21002 = 300*0x46 + 2
export const RESP_STATIC_INFORMATION_BASE_BYTES = 0x520c; // 21004 = 0x1483 dw store (immutable astronomy)
export const RESP_INFORMATION_BASE_BYTES = 0x0604;
export const RESP_INFORMATION_INSTITUTION_BYTES = 0x8de4; // 36324 = 4*0x2378 + 4
export const RESP_INFORMATION_WAREHOUSE_BYTES = 0x0300; // 768 (single record, fully labeled)
export const RESP_INFORMATION_PACKAGE_BYTES = 0x0154; // 340 (single record, fully labeled)
export const RESP_INFORMATION_OUTFIT_BYTES = 0x0af4; // 2804 = 100*0x1c + 4

// ---- strides / caps (decisive size cross-check in the spec §0) ----
export const CARD_STRIDE = 0x46; // 70 bytes/card
export const CARD_MAX = 300; // count cap (< 0x12d)
export const CARD_COMMAND_MAX = 24; // per-card command factory list cap (≤ 24)
export const INSTITUTION_BASE_STRIDE = 0x2378; // 9080 bytes/base
export const INSTITUTION_BASE_MAX = 4; // outer base cap (< 5)
export const INSTITUTION_STRIDE = 0xfc; // 252 bytes/institution
export const INSTITUTION_MAX = 36; // institutions per base (< 0x25)
export const INSTITUTION_SPOT_STRIDE = 0x0c; // 12 bytes/spot
export const INSTITUTION_SPOT_MAX = 21; // spots per institution (< 0x15)
export const WAREHOUSE_SHIPS_MAX = 99; // ships[] cap
export const WAREHOUSE_SHIP_STRIDE = 6; // {kind u16, unit_number u8, boat_number u16}
export const WAREHOUSE_TROOPS_MAX = 24; // troops[] cap
export const WAREHOUSE_TROOP_STRIDE = 6; // {kind u16, troop_grade u8, unit_number u16}
export const PACKAGE_OTHER_MAX = 3; // other_package[] cap
export const PACKAGE_TROOP_MAX = 24; // troop_package[] cap
export const PACKAGE_ENTRY_STRIDE = 12; // {kind u8, unit_kind u16, troop_grade u8, package_number u32}
export const OUTFIT_STRIDE = 0x1c; // 28 bytes/outfit
export const OUTFIT_MAX = 100; // count cap (≤ 100)
export const STATIC_BASE_STRIDE = 0x3c; // 60-byte destination stride used by FUN_004142e0
export const STATIC_BASE_MAX = 80; // strategic systems (galaxy = 80 systems); fits in 0x520c
export const INFORMATION_BASE_STRIDE = 0x180;
export const INFORMATION_BASE_MAX = 4;
export const NAME_MAX_UNITS = 13; // name[<=13] wide-char cap shared across the family

const clampU8 = (v) => Math.max(0, Math.min(0xff, Math.trunc(v ?? 0))) & 0xff;
const clampU16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(v ?? 0))) & 0xffff;
const clampU32 = (v) => (Math.max(0, Math.trunc(v ?? 0)) >>> 0);

/**
 * Write a wide-char pascal name (u8 length + `len` u16 chars, ≤13) at byte `off` in `buf`. This is the
 * exact `name[<=13]` shape the family uses (cap error `… name_size over than 13`). Returns the byte
 * length consumed (1 + 2*len) so a streaming builder can advance.
 */
function writeName16(buf, off, name) {
  const codes = [...String(name ?? '')].slice(0, NAME_MAX_UNITS);
  buf.writeUInt8(codes.length, off);
  for (let i = 0; i < codes.length; i += 1) {
    buf.writeUInt16LE(codes[i].charCodeAt(0) & 0xffff, off + 1 + i * 2);
  }
  return 1 + codes.length * 2;
}

// ---------------------------------------------------------------------------
// 0x305 ResponseStaticInformationCard — card master / command-grant table
// ---------------------------------------------------------------------------
/**
 * Build ResponseStaticInformationCard (0x305). Outer count u16 @0x00, up to 300 cards, each a 70-byte
 * record (stride 0x46). Structure HIGH confidence; the small packed bytes are unlabeled in the client
 * (medium) so we expose them as generic fields. The live command menu does not read widget ids here:
 * `FUN_004f5cb0` reads a u8 command count at record+0x14 and u16 factory ids at record+0x16; the
 * rendered widget id is `factory + 0x43`. The old +0x24/+0x26 interpretation was a Ghidra type-offset
 * artifact and leaves category 0 with rowCount=0 in the real client.
 *
 * @param {{ cards?: Array<{ id?:number, b02?:number, b03?:number, b04?:number, b05?:number,
 *   w06?:number, w08?:number, b0a?:number, b0b?:number, b0c?:number, w0e?:number, b10?:number,
 *   w12?:number, commands?:number[] }> }} [data]
 */
export function buildStaticInformationCardInner({ cards = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_STATIC_INFORMATION_CARD_CODE, RESP_STATIC_INFORMATION_CARD_BYTES);
  const body = inner.subarray(6);
  const list = cards.slice(0, CARD_MAX);
  body.writeUInt16LE(list.length & 0xffff, 0x00); // outer count
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    const base = 2 + i * CARD_STRIDE; // records start right after the u16 count header
    if (base + CARD_STRIDE > body.length) break;
    body.writeUInt16LE(clampU16(c.id), base + 0x00); // card_id / index
    body.writeUInt8(clampU8(c.b02), base + 0x02);
    body.writeUInt8(clampU8(c.b03), base + 0x03);
    body.writeUInt8(clampU8(c.b04), base + 0x04);
    body.writeUInt8(clampU8(c.b05), base + 0x05);
    body.writeUInt16LE(clampU16(c.w06), base + 0x06);
    body.writeUInt16LE(clampU16(c.w08), base + 0x08);
    body.writeUInt8(clampU8(c.b0a), base + 0x0a);
    body.writeUInt8(clampU8(c.b0b), base + 0x0b);
    body.writeUInt8(clampU8(c.b0c), base + 0x0c);
    body.writeUInt16LE(clampU16(c.w0e), base + 0x0e);
    body.writeUInt8(clampU8(c.b10), base + 0x10);
    body.writeUInt16LE(clampU16(c.w12), base + 0x12);
    const commands = Array.isArray(c.commands) ? c.commands.slice(0, CARD_COMMAND_MAX) : [];
    body.writeUInt8(commands.length & 0xff, base + 0x14); // command_count (≤24)
    for (let j = 0; j < commands.length; j += 1) {
      body.writeUInt16LE(clampU16(commands[j]), base + 0x16 + j * 2); // command factory ids
    }
  }
  return inner;
}

// ---------------------------------------------------------------------------
// 0x31d ResponseStaticInformationBase — immutable astronomy + system name
// ---------------------------------------------------------------------------
/**
 * Korean-name gate. When LOGH_KO_NAMES=1 the system/base NAME field prefers the recovered Korean
 * rendering (`name_ko`, from content/names/systems-ko.json via the content source) and falls back to the
 * Japanese `name`; default (flag unset) keeps the original Japanese name. The 0x31d parser-helper stream
 * encoding is unchanged either way, so this only swaps the SOURCE string, never the encoding.
 */
const koNamesEnabled = () => process.env.LOGH_KO_NAMES === '1';

/** Pick the wire NAME for a base record: KO when gated-on and present, else the Japanese name. */
function preferBaseName(b) {
  if (koNamesEnabled() && b && b.name_ko) return b.name_ko;
  return b ? b.name : undefined;
}

/**
 * Build ResponseStaticInformationBase (0x31d). The immutable per-system master (name + orbital
 * astronomy). Static parser FUN_004142e0 uses stride 0x3c (60B); the dispatcher copies 0x1483 dwords
 * (size 0x520c). Outer count is a parser-helper u16be at 0x00. The labeled-but-offset-unresolved field set (spec §2 + the
 * FUN_004145b0 layout note: id, 3 numeric, name[13]@count, class_ @+0x11, a float @+0x12) is laid out
 * here at its high-confidence positions; remaining stride bytes are zero-padded.
 *
 * NAME source: `name` is the Japanese system name; optional `name_ko` is the Korean rendering. With
 * LOGH_KO_NAMES=1 the Korean name is emitted when present (else Japanese). Encoding is unchanged.
 *
 * @param {{ bases?: Array<{ id?:number, grid?:number, class_?:number, klass?:number, name?:string,
 *   name_ko?:string, diameter?:number, revolutionRadius?:number, revolutionCycle?:number,
 *   revolutionDirection?:number, revolutionInitAngle?:number }> }} [data]
 */
export function buildStaticInformationBaseInner({ bases = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_STATIC_INFORMATION_BASE_CODE, RESP_STATIC_INFORMATION_BASE_BYTES);
  const body = inner.subarray(6);
  const list = bases.slice(0, STATIC_BASE_MAX);
  let cursor = 0;
  body.writeUInt16BE(list.length & 0xffff, cursor);
  cursor += 2;
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    const name = [...String(preferBaseName(b) ?? '')].slice(0, NAME_MAX_UNITS);
    body.writeUInt32BE(clampU32(b.id), cursor); // dest +0x00: system id
    cursor += 4;
    body.writeUInt16BE(clampU16(b.grid), cursor); // dest +0x04: grid/map-cell id
    cursor += 2;
    body.writeUInt16BE(clampU16(b.w06 ?? b.field06), cursor); // dest +0x06: unresolved short slot
    cursor += 2;
    body.writeUInt16BE(clampU16(b.w08 ?? b.field08), cursor); // dest +0x08: unresolved short slot
    cursor += 2;
    body.writeUInt8(name.length, cursor); // dest +0x0a: name length, cap checked by client <= 13
    cursor += 1;
    for (let j = 0; j < name.length; j += 1) {
      body.writeUInt16BE(name[j].charCodeAt(0) & 0xffff, cursor); // dest +0x0c: name chars
      cursor += 2;
    }
    body.writeUInt8(clampU8(b.class_ ?? b.klass), cursor); // dest +0x26: class_
    cursor += 1;
    body.writeFloatBE(Number.isFinite(b.diameter) ? b.diameter : 0, cursor); // dest +0x28
    cursor += 4;
    body.writeUInt32BE(clampU32(b.u2c ?? b.revolutionRadius), cursor); // dest +0x2c: unresolved orbit slot
    cursor += 4;
    body.writeUInt8(clampU8(b.revolutionDirection), cursor); // dest +0x30
    cursor += 1;
    body.writeFloatBE(Number.isFinite(b.revolutionCycle) ? b.revolutionCycle : 0, cursor); // dest +0x34
    cursor += 4;
    body.writeFloatBE(Number.isFinite(b.revolutionInitAngle) ? b.revolutionInitAngle : 0, cursor); // dest +0x38
    cursor += 4;
  }
  return inner;
}

// DEPRECATED: superseded by buildResponseInformationBaseInner in logh7-base-record.mjs (RE-confirmed
// byte-exact 0x031f layout from parser FUN_00414c70, with the five supply/budget arrays mapped). This
// shallow builder writes only id/b04/b05/u120/b175; the live 0x031e→0x031f handler now uses the new
// module. Kept only for its existing tests — prefer logh7-base-record.mjs for any new use.
export function buildInformationBaseInner({ bases = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_INFORMATION_BASE_CODE, RESP_INFORMATION_BASE_BYTES);
  const body = inner.subarray(6);
  const list = bases.slice(0, INFORMATION_BASE_MAX);
  body.writeUInt8(list.length & 0xff, 0x00);
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    const base = 4 + i * INFORMATION_BASE_STRIDE;
    if (base + INFORMATION_BASE_STRIDE > body.length) break;
    const raw = Buffer.isBuffer(b.raw) ? b.raw : Buffer.isBuffer(b.bytes) ? b.bytes : null;
    if (raw) raw.copy(body, base, 0, Math.min(raw.length, INFORMATION_BASE_STRIDE));
    body.writeUInt32LE(clampU32(b.id), base + 0x00);
    body.writeUInt8(clampU8(b.b04 ?? b.class_ ?? b.klass), base + 0x04);
    body.writeUInt8(clampU8(b.b05 ?? b.state), base + 0x05);
    body.writeUInt32LE(clampU32(b.u120), base + 0x120);
    body.writeUInt8(clampU8(b.b175), base + 0x175);
  }
  return inner;
}

// ---------------------------------------------------------------------------
// 0x321 ResponseInformationInstitution — facilities (防衛/造兵/対空/衛星) per base
// ---------------------------------------------------------------------------
/**
 * Build ResponseInformationInstitution (0x321). 3-level nested: outer count u8 @0x00 (max 4 bases,
 * stride 0x2378); each base has count u8 @0x08 (max 36 institutions, stride 0xfc); each institution has
 * count u8 @0x08 (max 21 spots, stride 0xc). Pinned offsets per spec §3 (structure HIGH; the u32
 * level/hp/production sub-fields are positionally pinned but unlabeled). Store global +0x3fb2f8.
 *
 * @param {{ bases?: Array<{ id?:number, institutions?: Array<{ kind?:number, d04?:number,
 *   spots?: Array<{ w00?:number, w04?:number, d08?:number }> }> }> }} [data]
 */
// DEPRECATED + KNOWN BUG: this builder mis-places the nested institution fields (+4/−4 off the
// parser-pinned positions, confirmed via FUN_004167f0/FUN_00416bd0). Superseded by
// buildResponseInformationInstitutionInner in logh7-institution-record.mjs (byte-exact:
// inst_count@elem+0x04, institution[0]@elem+0x08, spot[0]@institution+0x0c). The live 0x0320→0x0321
// handler now uses the new module. Do NOT use this for wire output; kept only for its existing tests.
export function buildInformationInstitutionInner({ bases = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_INFORMATION_INSTITUTION_CODE, RESP_INFORMATION_INSTITUTION_BYTES);
  const body = inner.subarray(6);
  const list = bases.slice(0, INSTITUTION_BASE_MAX);
  body.writeUInt8(list.length & 0xff, 0x00); // outer base count (u8)
  for (let i = 0; i < list.length; i += 1) {
    const b = list[i];
    const baseOff = 4 + i * INSTITUTION_BASE_STRIDE; // 4-byte aligned count header
    if (baseOff + INSTITUTION_BASE_STRIDE > body.length) break;
    body.writeUInt32LE(clampU32(b.id), baseOff + 0x00); // base id
    const insts = Array.isArray(b.institutions) ? b.institutions.slice(0, INSTITUTION_MAX) : [];
    body.writeUInt8(insts.length & 0xff, baseOff + 0x08); // institution_count (≤36)
    for (let j = 0; j < insts.length; j += 1) {
      const inst = insts[j];
      const instOff = baseOff + 0x0c + j * INSTITUTION_STRIDE; // institution array starts after the base header
      if (instOff + INSTITUTION_STRIDE > body.length) break;
      body.writeUInt16LE(clampU16(inst.kind), instOff + 0x00); // facility kind (防衛/造兵/対空/衛星)
      body.writeUInt32LE(clampU32(inst.d04), instOff + 0x04); // level / hp / production (unlabeled)
      const spots = Array.isArray(inst.spots) ? inst.spots.slice(0, INSTITUTION_SPOT_MAX) : [];
      body.writeUInt8(spots.length & 0xff, instOff + 0x08); // spot_count (≤21)
      for (let k = 0; k < spots.length; k += 1) {
        const s = spots[k];
        const spotOff = instOff + 0x0c + k * INSTITUTION_SPOT_STRIDE;
        if (spotOff + INSTITUTION_SPOT_STRIDE > body.length) break;
        // spot record (stride 0xc = 12B): the parser's pinned reads are +0x04 u16 and +0x08 u32. The
        // spec also lists a "+0x0c u16" read, but +0x0c == the next spot's +0x00 (the 12-byte stride
        // wraps), so it is the leading field of spot[k+1], not a field inside spot[k]. We therefore
        // write only the two in-record fields here; `w0c`/`w00` (the leading u16 of THIS spot) is at
        // +0x00 and folds into the previous element's tail — kept addressable via `w00`.
        body.writeUInt16LE(clampU16(s.w00), spotOff + 0x00);
        body.writeUInt16LE(clampU16(s.w04), spotOff + 0x04);
        body.writeUInt32LE(clampU32(s.d08), spotOff + 0x08);
      }
    }
  }
  return inner;
}

// ---------------------------------------------------------------------------
// 0x327 ResponseInformationWarehouse — base stockpile (FULLY LABELED, spec §4a)
// ---------------------------------------------------------------------------
/**
 * Build ResponseInformationWarehouse (0x327). Single fixed 768-byte record. Fully labeled
 * (dump FUN_0041aff0). supplies/food/mineral are the stored resources; ships[]/troops[] the parked
 * reserve units.
 *
 * @param {{ base?:number, outfit?:number, index?:number, supplies?:number, food?:number,
 *   mineral?:number, ships?: Array<{ kind?:number, unitNumber?:number, boatNumber?:number }>,
 *   troops?: Array<{ kind?:number, troopGrade?:number, unitNumber?:number }> }} [data]
 */
export function buildInformationWarehouseInner({
  base = 0, outfit = 0, index = 0, supplies = 0, food = 0, mineral = 0, ships = [], troops = [],
} = {}) {
  const inner = buildLobbyResponseInner(RESP_INFORMATION_WAREHOUSE_CODE, RESP_INFORMATION_WAREHOUSE_BYTES);
  const body = inner.subarray(6);
  body.writeUInt32LE(clampU32(base), 0x00); // s_base_
  body.writeUInt32LE(clampU32(outfit), 0x04); // s_outfit_
  body.writeUInt32LE(clampU32(index), 0x08); // s_index_
  const shipList = ships.slice(0, WAREHOUSE_SHIPS_MAX);
  body.writeUInt8(shipList.length & 0xff, 0x0c); // ships_count (≤99)
  for (let i = 0; i < shipList.length; i += 1) {
    const s = shipList[i];
    const off = 0x10 + i * WAREHOUSE_SHIP_STRIDE;
    body.writeUInt16LE(clampU16(s.kind), off + 0); // kind u16
    body.writeUInt8(clampU8(s.unitNumber), off + 2); // unit_number u8
    body.writeUInt16LE(clampU16(s.boatNumber), off + 3); // boat_number u16
  }
  const troopList = troops.slice(0, WAREHOUSE_TROOPS_MAX);
  body.writeUInt8(troopList.length & 0xff, 0x260); // troops_count (≤24) @param_1[0x98]
  for (let i = 0; i < troopList.length; i += 1) {
    const t = troopList[i];
    const off = 0x264 + i * WAREHOUSE_TROOP_STRIDE;
    body.writeUInt16LE(clampU16(t.kind), off + 0); // kind u16
    body.writeUInt8(clampU8(t.troopGrade), off + 2); // troop_grade u8
    body.writeUInt16LE(clampU16(t.unitNumber), off + 3); // unit_number u16
  }
  body.writeUInt32LE(clampU32(supplies), 0x2f4); // s_supplies_ (param_1[0xbd])
  body.writeUInt32LE(clampU32(food), 0x2f8); // s_food_ (param_1[0xbe])
  body.writeUInt32LE(clampU32(mineral), 0x2fc); // s_mineral_ (param_1[0xbf]) — record ends 0x300
  return inner;
}

// ---------------------------------------------------------------------------
// 0x329 ResponseInformationPackage — transfer manifest (FULLY LABELED, spec §4b)
// ---------------------------------------------------------------------------
/**
 * Build ResponseInformationPackage (0x329). Single fixed 340-byte record (dump FUN_0041b990). The
 * in-transit logistics package being shipped base→target_base. other_package[] (≤3) and
 * troop_package[] (≤24) share the same 12-byte entry {kind u8, unit_kind u16, troop_grade u8,
 * package_number u32}.
 *
 * @param {{ base?:number, targetBase?:number,
 *   otherPackages?: Array<{ kind?:number, unitKind?:number, troopGrade?:number, packageNumber?:number }>,
 *   troopPackages?: Array<{ kind?:number, unitKind?:number, troopGrade?:number, packageNumber?:number }> }} [data]
 */
export function buildInformationPackageInner({ base = 0, targetBase = 0, otherPackages = [], troopPackages = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_INFORMATION_PACKAGE_CODE, RESP_INFORMATION_PACKAGE_BYTES);
  const body = inner.subarray(6);
  body.writeUInt32LE(clampU32(base), 0x00); // s_base_ (source)
  body.writeUInt32LE(clampU32(targetBase), 0x04); // s_target_base_ (destination)
  const writeEntries = (entries, countOff, arrayOff, max) => {
    const list = entries.slice(0, max);
    body.writeUInt8(list.length & 0xff, countOff);
    for (let i = 0; i < list.length; i += 1) {
      const e = list[i];
      const off = arrayOff + i * PACKAGE_ENTRY_STRIDE;
      body.writeUInt8(clampU8(e.kind), off + 0); // kind u8
      body.writeUInt16LE(clampU16(e.unitKind), off + 1); // unit_kind u16
      body.writeUInt8(clampU8(e.troopGrade), off + 3); // troop_grade u8
      body.writeUInt32LE(clampU32(e.packageNumber), off + 4); // package_number u32
    }
  };
  writeEntries(otherPackages, 0x08, 0x0c, PACKAGE_OTHER_MAX); // other_package[] (≤3)
  writeEntries(troopPackages, 0x30, 0x34, PACKAGE_TROOP_MAX); // troop_package[] (≤24) @param_1[0xc]
  return inner;
}

// ---------------------------------------------------------------------------
// 0x32b ResponseInformationOutfit — fleet roster summary (FULLY LABELED, spec §5a)
// ---------------------------------------------------------------------------
/**
 * Build ResponseInformationOutfit (0x32b). Outer count u8 @0x00, up to 100 outfits, each 28 bytes
 * (stride 0x1c). Fully labeled (dump FUN_0041c330). The 10 practice_* are the fleet's trained-skill
 * levels (the 内政 personnel/training screen). Store global +0x3dfe98.
 *
 * @param {{ outfits?: Array<{ id?:number, kind?:number, power?:number, camp?:number, index?:number,
 *   achievement?:number, strategyId?:number, practice?:{ warp?:number, speed?:number, command?:number,
 *   offence?:number, defence?:number, antiaircraft?:number, search?:number, deception?:number,
 *   landbattle?:number, airbattle?:number } }> }} [data]
 */
export function buildInformationOutfitInner({ outfits = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_INFORMATION_OUTFIT_CODE, RESP_INFORMATION_OUTFIT_BYTES);
  const body = inner.subarray(6);
  const list = outfits.slice(0, OUTFIT_MAX);
  body.writeUInt8(list.length & 0xff, 0x00); // outer count (u8)
  for (let i = 0; i < list.length; i += 1) {
    const o = list[i];
    const base = 4 + i * OUTFIT_STRIDE; // 4-byte aligned count header
    if (base + OUTFIT_STRIDE > body.length) break;
    const p = o.practice ?? {};
    body.writeUInt32LE(clampU32(o.id), base + 0x00); // outfit id
    body.writeUInt8(clampU8(o.kind), base + 0x04); // s_kind_
    body.writeUInt8(clampU8(o.power), base + 0x05); // s_power_ (陣営)
    body.writeUInt8(clampU8(o.camp), base + 0x06); // s_camp_
    body.writeUInt8(clampU8(o.index), base + 0x07); // s_index_
    body.writeUInt16LE(clampU16(o.achievement), base + 0x08); // s_achievement_
    body.writeUInt32LE(clampU32(o.strategyId), base + 0x0c); // s_strategy_id_
    body.writeUInt8(clampU8(p.warp), base + 0x10); // practice_warp
    body.writeUInt8(clampU8(p.speed), base + 0x11); // practice_speed
    body.writeUInt8(clampU8(p.command), base + 0x12); // practice_command
    body.writeUInt8(clampU8(p.offence), base + 0x13); // practice_offence
    body.writeUInt8(clampU8(p.defence), base + 0x14); // practice_defence
    body.writeUInt8(clampU8(p.antiaircraft), base + 0x15); // practice_antiaircraft
    body.writeUInt8(clampU8(p.search), base + 0x16); // practice_search
    body.writeUInt8(clampU8(p.deception), base + 0x17); // practice_deception
    body.writeUInt8(clampU8(p.landbattle), base + 0x18); // practice_landbattle
    body.writeUInt8(clampU8(p.airbattle), base + 0x19); // practice_airbattle
  }
  return inner;
}

// ---------------------------------------------------------------------------
// In-memory economy state + process() entry
// ---------------------------------------------------------------------------
/**
 * Create the in-memory 内政 read-model store. The server populates these maps as the world advances;
 * the build* functions above project them onto the wire. Keyed by base/outfit id so a Command* mutation
 * can update one entry and the server re-emits just the affected record.
 */
export function createInfoRecordsState() {
  return {
    cards: [], // card master (rarely changes)
    staticBases: [], // immutable astronomy (set once at world-load)
    informationBases: new Map(),
    institutions: new Map(), // baseId -> { id, institutions: [...] }
    warehouses: new Map(), // baseId -> warehouse record
    packages: new Map(), // baseId -> in-transit package record
    outfits: new Map(), // outfitId -> outfit summary record
  };
}

/**
 * process() entry for the info-records domain. This family is a pure S→C READ MODEL — there is no
 * client→server message in the 0x305/0x31d/0x321/0x327/0x329/0x32b range (those codes are server
 * replies, never client requests). So process() accepts (it does not own any inbound command) and
 * emits no notifies. It exists to satisfy the uniform domain contract; the lead routes the REQUEST
 * codes (0x304/0x320/0x326/0x328/0x32a, i.e. responseCode-1) to a server handler that calls the
 * matching build*Inner and sends it to the requesting connection. Kept for shape-parity with the
 * combat/command engines.
 *
 * @param {{ state:object, connectionId:string, innerCode:number, inner:Buffer }} ctx
 * @returns {{ accept:boolean, reject?:string, notifies:Array<{inner:Buffer, target:'others'|'all'}> }}
 */
export function processInfoRecords({ innerCode } = {}) {
  // No inbound mutation in this read-model family; never reject, never broadcast.
  return { accept: true, handled: false, code: innerCode, notifies: [] };
}

/** Codes this module builds (for the lead's integration map). */
export const INFO_RECORD_CODES = Object.freeze({
  RESP_STATIC_INFORMATION_CARD_CODE,
  RESP_STATIC_INFORMATION_BASE_CODE,
  RESP_INFORMATION_BASE_CODE,
  RESP_INFORMATION_INSTITUTION_CODE,
  RESP_INFORMATION_WAREHOUSE_CODE,
  RESP_INFORMATION_PACKAGE_CODE,
  RESP_INFORMATION_OUTFIT_CODE,
});
