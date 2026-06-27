/**
 * WAREHOUSE / PACKAGE logistics record builders — `ResponseInformationWarehouse` (0x0327, dispatcher
 * case 0x327) + `ResponseInformationPackage` (0x0329, dispatcher case 0x329).
 *
 * These are the 보급창고/수송 (warehouse / transport) panels of the in-world 「基地管理」 base-management
 * screen. They are the SIBLING records of the just-shipped logh7-base-record.mjs (0x031f defense/dev) and
 * logh7-institution-record.mjs (0x0321 facilities): per docs/logh7-proto-info-records.md §4, the warehouse
 * carries the base STOCKPILE (supplies/food/mineral + reserve ships[]/troops[]) and the package carries the
 * in-transit TRANSFER manifest (base→target_base other_package[]/troop_package[]). The records are
 * independent — do NOT merge them.
 *
 * Both are SMALL fixed frames (768B / 340B) with NO client factory drop, so wiring goes live immediately.
 *
 * SELF-CONTAINED (no edits to the hot-path login/transport modules): the only import is the framing helper
 * `buildLobbyResponseInner` from logh7-login-protocol.mjs — identical to the pattern logh7-base-record.mjs /
 * logh7-institution-record.mjs use.
 *
 * ============================================================================================
 * WIRE EVIDENCE — direct Ghidra re-decompile (export E:/logh7-revival/.omo/ghidra/export/G7MTClient;
 * query tool tools/logh7_redex.py). Three-way pin per record (dispatcher copy count + binary parser +
 * dump-label serializer all agree):
 *
 *   WAREHOUSE 0x0327 (param_1 is u32*, so dump's `param_1[N]` = byte offset N*4):
 *     - Dispatcher FUN_004ba2b0 case 0x327: copies a FIXED 0xc0 (192) dwords = 0x300 = 768 bytes into
 *       clientBase+0x3e098c, REGARDLESS of count → on-wire body is a fixed 0x300 structure.
 *     - Binary parser FUN_0041a870 pins every offset:
 *         (*+0x1c)(param_1+0)   → u32 base   @ 0x00   (dump s_base_,   param_1[0])
 *         (*+0x1c)(param_1+4)   → u32 outfit @ 0x04   (dump s_outfit_, param_1[1])
 *         (*+0x1c)(param_1+8)   → u32 index  @ 0x08   (dump s_index_,  param_1[2])
 *         (*+0x24)(param_1+0xc) → u8 ships_count @ 0x0c, guard `bVar3 < 100` → cap 99
 *         ships[] loop iVar6 = param_1+0x10, stride 6, reads:
 *             (*+0x20)(iVar6-2)        → u16 kind        @ entry+0 (0x0e for entry0)
 *             FUN_00610420(iVar6,1,..) → u8  unit_number @ entry+2 (0x10 for entry0)
 *             (*+0x20)(iVar6+2)        → u16 boat_number @ entry+4 (0x12 for entry0)
 *         (*+0x24)(param_1+0x260) → u8 troops_count @ 0x260, guard `< 0x19` → cap 24
 *         troops[] loop iVar6 = +0x264, stride 6, reads:
 *             (*+0x20)(iVar6-2) → u16 kind        @ entry+0 (0x262 for entry0)
 *             FUN_00610420      → u8  troop_grade @ entry+2 (0x264 for entry0)
 *             (*+0x20)(iVar6+2) → u16 unit_number @ entry+4 (0x266 for entry0)
 *         (*+0x1c)(+0x2f4/+0x2f8/+0x2fc) → u32 supplies/food/mineral (record ends 0x300)
 *     - Dump serializer FUN_0041aff0 confirms labels: s_base_/s_outfit_/s_index_, ships[%d]
 *       {kind,unit_number,boat_number}, troops[%d] {kind,troop_grade,unit_number} @ param_1[0x98],
 *       s_supplies_ param_1[0xbd], s_food_ param_1[0xbe], s_mineral_ param_1[0xbf].
 *
 *   DOC CONTRADICTION RESOLVED: docs/logh7-character-record-wire.md L52 lists supplies/food/mineral at
 *   `0xbd/0xbe/0xbf` and docs/logh7-implementation-roadmap.md L198 lists `0x2f4/0x2f8/0x2fc`. These AGREE:
 *   0xbd/0xbe/0xbf are u32-ARRAY indices (param_1 is u32*), so byte offsets are 0xbd*4=0x2f4, 0xbe*4=0x2f8,
 *   0xbf*4=0x2fc. The binary parser reads them as `iStack_10 + 0x2f4 / +0x2f8 / +0x2fc` (byte offsets) —
 *   confirming 0x2f4/0x2f8/0x2fc. There was never a real contradiction, only two notations for one layout.
 *
 *   PACKAGE 0x0329 (param_1 is undefined1*; the dump's `puVar2` is a u16* cursor):
 *     - Dispatcher FUN_004ba2b0 case 0x329: copies a FIXED 0x55 (85) dwords = 0x154 = 340 bytes into
 *       clientBase+0x36a488, REGARDLESS of count → on-wire body is a fixed 0x154 structure.
 *     - Binary parser FUN_0041b280 pins every offset:
 *         (*+0x1c)(param_1+0) → u32 base        @ 0x00 (dump s_base_)
 *         (*+0x1c)(param_1+4) → u32 target_base @ 0x04 (dump s_target_base_)
 *         (*+0x24)(param_1+8) → u8 other_package_count @ 0x08, guard `bVar3 < 4` → cap 3
 *         other_package[] loop puVar6 = param_1+0xe, stride 0xc (12), reads:
 *             FUN_00610420(puVar6-2,1,..) → u8  kind           @ entry+0 (0x0c for entry0)
 *             (*+0x20)(puVar6)            → u16 unit_kind      @ entry+2 (0x0e for entry0)
 *             FUN_00610420(puVar6+2,1,..) → u8  troop_grade    @ entry+4 (0x10 for entry0)
 *             (*+0x1c)(puVar6+6)         → u32 package_number @ entry+8 (0x14 for entry0)
 *         (*+0x24)(param_1+0x30) → u8 troop_package_count @ 0x30, guard `< 0x19` → cap 24
 *         troop_package[] loop param_1+0x36, stride 0xc, same 4-field shape (kind @ 0x34 for entry0)
 *     - Dump serializer FUN_0041b990 confirms labels: s_base_/s_target_base_, other_package[%d]@param_1[2]
 *       and troop_package[%d]@param_1[0xc], each {kind u8, unit_kind u16, troop_grade u8, package_number u32}.
 *     - Size check: troop_package base 0x34 + 24*0xc (0x120) = 0x154 = dispatcher copy. ✓ Exact, zero pad.
 *
 * CONFIDENCE POLICY (per task data-trust policy):
 *   - Byte LAYOUT / offsets / types / strides / array caps: **P0** (dispatcher + parser + dump serializer
 *     all agree byte-exact). HIGH.
 *   - NAME↔offset mapping: HIGH for ALL fields — both records have a compiled-in dump-label serializer
 *     (FUN_0041aff0 / FUN_0041b990) naming every field, cross-validated against the binary parser. No
 *     provisional fieldNN names are needed here (unlike the unlabeled 0x031f/0x0321 scalars).
 *   - Field VALUES: **P3** — never fabricated. Default 0; only what the caller supplies is written.
 * ============================================================================================
 */

import { buildLobbyResponseInner } from '../logh7-login-protocol.mjs';

// ===================================================================================================
// [L2 코덱] 와이어 레이아웃 상수는 공유 단일 지점 codec/offsets.mjs 로 이동했다(기능 무변경).
// 기존 import 경로를 보존하려고 여기서 그대로 다시 re-export 한다. WAREHOUSE 0x0327 / PACKAGE 0x0329
// 모두 ALL HIGH (dispatcher copy count + binary parser + dump-label serializer 일치). 상세 오프셋
// 주석은 offsets.mjs 참조. 신규 코드는 codec/offsets.mjs 를 직접 import 할 것.
// ===================================================================================================
import {
  RESP_INFO_WAREHOUSE_CODE,
  RESP_INFO_WAREHOUSE_BYTES,
  RW_OFF_BASE,
  RW_OFF_OUTFIT,
  RW_OFF_INDEX,
  RW_OFF_SHIPS_CNT,
  RW_OFF_SHIPS0,
  RW_SHIP_STRIDE,
  RW_SHIP_OFF_KIND,
  RW_SHIP_OFF_UNIT_NUMBER,
  RW_SHIP_OFF_BOAT_NUMBER,
  RESP_INFO_WAREHOUSE_SHIPS_MAX,
  RW_OFF_TROOPS_CNT,
  RW_OFF_TROOPS0,
  RW_TROOP_STRIDE,
  RW_TROOP_OFF_KIND,
  RW_TROOP_OFF_TROOP_GRADE,
  RW_TROOP_OFF_UNIT_NUMBER,
  RESP_INFO_WAREHOUSE_TROOPS_MAX,
  RW_OFF_SUPPLIES,
  RW_OFF_FOOD,
  RW_OFF_MINERAL,
  RESP_INFO_PACKAGE_CODE,
  RESP_INFO_PACKAGE_BYTES,
  RP_OFF_BASE,
  RP_OFF_TARGET_BASE,
  RP_OFF_OTHER_CNT,
  RP_OFF_OTHER0,
  RP_PKG_STRIDE,
  RP_PKG_OFF_KIND,
  RP_PKG_OFF_UNIT_KIND,
  RP_PKG_OFF_TROOP_GRADE,
  RP_PKG_OFF_PACKAGE_NUMBER,
  RESP_INFO_PACKAGE_OTHER_MAX,
  RP_OFF_TROOP_CNT,
  RP_OFF_TROOP0,
  RESP_INFO_PACKAGE_TROOP_MAX,
} from './offsets.mjs';

export {
  RESP_INFO_WAREHOUSE_CODE,
  RESP_INFO_WAREHOUSE_BYTES,
  RW_OFF_BASE,
  RW_OFF_OUTFIT,
  RW_OFF_INDEX,
  RW_OFF_SHIPS_CNT,
  RW_OFF_SHIPS0,
  RW_SHIP_STRIDE,
  RW_SHIP_OFF_KIND,
  RW_SHIP_OFF_UNIT_NUMBER,
  RW_SHIP_OFF_BOAT_NUMBER,
  RESP_INFO_WAREHOUSE_SHIPS_MAX,
  RW_OFF_TROOPS_CNT,
  RW_OFF_TROOPS0,
  RW_TROOP_STRIDE,
  RW_TROOP_OFF_KIND,
  RW_TROOP_OFF_TROOP_GRADE,
  RW_TROOP_OFF_UNIT_NUMBER,
  RESP_INFO_WAREHOUSE_TROOPS_MAX,
  RW_OFF_SUPPLIES,
  RW_OFF_FOOD,
  RW_OFF_MINERAL,
  RESP_INFO_PACKAGE_CODE,
  RESP_INFO_PACKAGE_BYTES,
  RP_OFF_BASE,
  RP_OFF_TARGET_BASE,
  RP_OFF_OTHER_CNT,
  RP_OFF_OTHER0,
  RP_PKG_STRIDE,
  RP_PKG_OFF_KIND,
  RP_PKG_OFF_UNIT_KIND,
  RP_PKG_OFF_TROOP_GRADE,
  RP_PKG_OFF_PACKAGE_NUMBER,
  RESP_INFO_PACKAGE_OTHER_MAX,
  RP_OFF_TROOP_CNT,
  RP_OFF_TROOP0,
  RESP_INFO_PACKAGE_TROOP_MAX,
};

const clampU8 = (v) => Math.max(0, Math.min(0xff, Math.trunc(v ?? 0))) & 0xff;
const clampU16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(v ?? 0))) & 0xffff;
const clampU32 = (v) => (Math.max(0, Math.trunc(v ?? 0)) >>> 0);

/**
 * @typedef {object} WarehouseShip
 * @property {number} [kind]        u16 @entry+0x00 — ship-class id (s_kind_) [HIGH]
 * @property {number} [unitNumber]  u8  @entry+0x02 — reserve unit number (s_unit_number_) [HIGH]
 * @property {number} [boatNumber]  u16 @entry+0x04 — boat/complement number (s_boat_number_) [HIGH]
 */

/**
 * @typedef {object} WarehouseTroop
 * @property {number} [kind]        u16 @entry+0x00 — troop-class id (s_kind_) [HIGH]
 * @property {number} [troopGrade]  u8  @entry+0x02 — troop grade (s_troop_grade_) [HIGH]
 * @property {number} [unitNumber]  u16 @entry+0x04 — reserve unit number (s_unit_number_) [HIGH]
 */

/**
 * @typedef {object} WarehouseRecord
 * @property {number} [base]    u32 @0x00 — base id (s_base_) [HIGH]
 * @property {number} [outfit]  u32 @0x04 — outfit id (s_outfit_) [HIGH]
 * @property {number} [index]   u32 @0x08 — record index (s_index_) [HIGH]
 * @property {WarehouseShip[]} [ships]   ships[≤99] @0x0e (cnt u8 @0x0c) — reserve ships (s_ships[%d]) [HIGH]
 * @property {WarehouseTroop[]} [troops] troops[≤24] @0x262 (cnt u8 @0x260) — reserve troops (s_troops[%d]) [HIGH]
 * @property {number} [supplies] u32 @0x2f4 — stored supplies (s_supplies_) [HIGH]
 * @property {number} [food]     u32 @0x2f8 — stored food (s_food_) [HIGH]
 * @property {number} [mineral]  u32 @0x2fc — stored mineral (s_mineral_) [HIGH]
 */

/**
 * Build a `ResponseInformationWarehouse` (0x0327) record — the base STOCKPILE panel.
 *
 * The body is the FIXED 0x300-byte structure the dispatcher always copies (case 0x327, 0xc0 dwords). At
 * most 99 ships and 24 troops are written; extras are dropped, unused bytes stay zero (buildLobbyResponseInner
 * zero-pads). All offsets/strides/caps are RE-pinned (P0). Field values are P3 — every field defaults 0 and
 * only what the caller supplies is written (no fabrication).
 *
 * @param {WarehouseRecord} [record]
 * @returns {Buffer} message32 inner: [u32 BE 0][u16 BE 0x0327][0x300-byte LE body]
 */
export function buildResponseInformationWarehouseInner({
  base = 0,
  outfit = 0,
  index = 0,
  ships = [],
  troops = [],
  supplies = 0,
  food = 0,
  mineral = 0,
} = {}) {
  const inner = buildLobbyResponseInner(RESP_INFO_WAREHOUSE_CODE, RESP_INFO_WAREHOUSE_BYTES);
  const body = inner.subarray(6);

  body.writeUInt32LE(clampU32(base), RW_OFF_BASE); // 0x00 [HIGH]
  body.writeUInt32LE(clampU32(outfit), RW_OFF_OUTFIT); // 0x04 [HIGH]
  body.writeUInt32LE(clampU32(index), RW_OFF_INDEX); // 0x08 [HIGH]

  const shipList = (Array.isArray(ships) ? ships : []).slice(0, RESP_INFO_WAREHOUSE_SHIPS_MAX);
  body.writeUInt8(shipList.length & 0xff, RW_OFF_SHIPS_CNT); // 0x0c u8 ships_count
  for (let i = 0; i < shipList.length; i += 1) {
    const e = shipList[i] ?? {};
    const eb = RW_OFF_SHIPS0 + i * RW_SHIP_STRIDE;
    body.writeUInt16LE(clampU16(e.kind), eb + RW_SHIP_OFF_KIND);
    body.writeUInt8(clampU8(e.unitNumber), eb + RW_SHIP_OFF_UNIT_NUMBER);
    body.writeUInt16LE(clampU16(e.boatNumber), eb + RW_SHIP_OFF_BOAT_NUMBER);
  }

  const troopList = (Array.isArray(troops) ? troops : []).slice(0, RESP_INFO_WAREHOUSE_TROOPS_MAX);
  body.writeUInt8(troopList.length & 0xff, RW_OFF_TROOPS_CNT); // 0x260 u8 troops_count
  for (let i = 0; i < troopList.length; i += 1) {
    const e = troopList[i] ?? {};
    const eb = RW_OFF_TROOPS0 + i * RW_TROOP_STRIDE;
    body.writeUInt16LE(clampU16(e.kind), eb + RW_TROOP_OFF_KIND);
    body.writeUInt8(clampU8(e.troopGrade), eb + RW_TROOP_OFF_TROOP_GRADE);
    body.writeUInt16LE(clampU16(e.unitNumber), eb + RW_TROOP_OFF_UNIT_NUMBER);
  }

  body.writeUInt32LE(clampU32(supplies), RW_OFF_SUPPLIES); // 0x2f4 [HIGH]
  body.writeUInt32LE(clampU32(food), RW_OFF_FOOD); // 0x2f8 [HIGH]
  body.writeUInt32LE(clampU32(mineral), RW_OFF_MINERAL); // 0x2fc [HIGH]
  return inner;
}

/**
 * @typedef {object} PackageEntry
 * @property {number} [kind]          u8  @entry+0x00 — package kind (s_kind_) [HIGH]
 * @property {number} [unitKind]      u16 @entry+0x02 — ship/troop class being shipped (s_unit_kind_) [HIGH]
 * @property {number} [troopGrade]    u8  @entry+0x04 — troop grade (s_troop_grade_) [HIGH]
 * @property {number} [packageNumber] u32 @entry+0x08 — package quantity / id (s_package_number_) [HIGH]
 */

/**
 * @typedef {object} PackageRecord
 * @property {number} [base]        u32 @0x00 — source base id (s_base_) [HIGH]
 * @property {number} [targetBase]  u32 @0x04 — destination base id (s_target_base_) [HIGH]
 * @property {PackageEntry[]} [otherPackages] other_package[≤3] @0x0c (cnt u8 @0x08) — (s_other_package[%d]) [HIGH]
 * @property {PackageEntry[]} [troopPackages] troop_package[≤24] @0x34 (cnt u8 @0x30) — (s_troop_package[%d]) [HIGH]
 */

/** Write one capped count(u8)+package-array block (stride 12: kind u8, unit_kind u16, troop_grade u8,
 *  package_number u32) into `body`. Unused slots stay 0. */
function writePackageArray(body, cntOff, valOff, list, cap) {
  const arr = (Array.isArray(list) ? list : []).slice(0, cap);
  body.writeUInt8(arr.length & 0xff, cntOff);
  for (let i = 0; i < arr.length; i += 1) {
    const e = arr[i] ?? {};
    const eb = valOff + i * RP_PKG_STRIDE;
    body.writeUInt8(clampU8(e.kind), eb + RP_PKG_OFF_KIND);
    body.writeUInt16LE(clampU16(e.unitKind), eb + RP_PKG_OFF_UNIT_KIND);
    body.writeUInt8(clampU8(e.troopGrade), eb + RP_PKG_OFF_TROOP_GRADE);
    body.writeUInt32LE(clampU32(e.packageNumber), eb + RP_PKG_OFF_PACKAGE_NUMBER);
  }
}

/**
 * Build a `ResponseInformationPackage` (0x0329) record — the in-transit TRANSFER manifest panel.
 *
 * The body is the FIXED 0x154-byte structure the dispatcher always copies (case 0x329, 0x55 dwords). At
 * most 3 other-packages and 24 troop-packages are written; extras are dropped, unused bytes stay zero
 * (buildLobbyResponseInner zero-pads). All offsets/strides/caps are RE-pinned (P0). Field values are P3 —
 * every field defaults 0 and only what the caller supplies is written (no fabrication).
 *
 * @param {PackageRecord} [record]
 * @returns {Buffer} message32 inner: [u32 BE 0][u16 BE 0x0329][0x154-byte LE body]
 */
export function buildResponseInformationPackageInner({
  base = 0,
  targetBase = 0,
  otherPackages = [],
  troopPackages = [],
} = {}) {
  const inner = buildLobbyResponseInner(RESP_INFO_PACKAGE_CODE, RESP_INFO_PACKAGE_BYTES);
  const body = inner.subarray(6);

  body.writeUInt32LE(clampU32(base), RP_OFF_BASE); // 0x00 [HIGH]
  body.writeUInt32LE(clampU32(targetBase), RP_OFF_TARGET_BASE); // 0x04 [HIGH]

  writePackageArray(body, RP_OFF_OTHER_CNT, RP_OFF_OTHER0, otherPackages, RESP_INFO_PACKAGE_OTHER_MAX); // 0x08/0x0c
  writePackageArray(body, RP_OFF_TROOP_CNT, RP_OFF_TROOP0, troopPackages, RESP_INFO_PACKAGE_TROOP_MAX); // 0x30/0x34
  return inner;
}

/**
 * Project a content/galaxy.json system onto a WarehouseRecord. VALUES are P3: this performs only SAFE,
 * non-fabricating mapping — it sets the caller-supplied `base` (runtime id) and leaves every economy field
 * (supplies/food/mineral) and the ships/troops arrays at their defaults unless the caller explicitly threads
 * them through `ctx`. It mirrors systemToBaseRecord / systemToInstitutionRecord: the world-init wiring knows
 * each base's runtime id, but blindly projecting galaxy JSON onto the stock fields would invent numbers, so
 * only the id is mapped; pass supplies/food/mineral/ships/troops explicitly via `ctx` once seeded.
 *
 * @param {{ system?: string, faction?: string }} system content/galaxy.json system object (name/faction)
 * @param {{ base?: number } & Partial<WarehouseRecord>} [ctx] runtime base id + any explicit passthrough
 * @returns {WarehouseRecord}
 */
export function systemToWarehouseRecord(system = {}, ctx = {}) {
  const { base = 0, ...passthrough } = ctx ?? {};
  // Only `base` is mapped from runtime ctx. All stock/economy fields stay default unless the caller threads
  // them through ctx explicitly — no fabrication from JSON onto the labeled offsets.
  return { base: clampU32(base), ...passthrough };
}
