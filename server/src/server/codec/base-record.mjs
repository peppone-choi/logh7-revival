/**
 * [L2 코덱 레이어] 순수 와이어 코덱 모듈 — `ResponseInformationBase` (0x031f, dispatcher case 799).
 *
 * 이 파일은 logh7-base-record.mjs 에서 "기능 무변경"으로 이동된 순수 build*Inner 코덱이다.
 * (바이트 오프셋/stride/size/로직 1비트도 변경 없음, import 경로만 ../ 로 한 단계 상향.) node:fs 의존이
 * 전혀 없는 순수 모듈이며, content/planet-economy.json 을 읽는 fs 콘텐츠 로더는 상위 shim
 * logh7-base-record.mjs 에 남아 있다(단방향: loader → codec). 의존 역전 금지.
 *
 * 기존 import 경로 보존: 원래 위치 src/server/logh7-base-record.mjs 가 이 모듈을 그대로 re-export 한다.
 *
 * 와이어 레이아웃 상수(RESP_INFO_BASE_*·RIB_*)는 기지관리(基地管理) 0x32x 패밀리와 같은 단일 지점
 * codec/offsets.mjs 로 합류했다(institution/warehouse가 거기 두는 것과 일관). 이 파일은 그 상수를
 * import 해 다시 re-export 하므로 기존 import 표면은 100% 유지된다.
 *
 * ============================================================================================
 * SYSTEM / BASE DEFENSE+DEVELOPMENT record builder — `ResponseInformationBase` (0x031f, case 799).
 *
 * This is the DEFENSE / DEVELOPMENT / OWNERSHIP half of the in-world 「基地管理」 panel (critical-path
 * STEP 6). It is the sibling of logh7-base-economy.mjs (NotifyBaseParameter 0x0337 = the ECONOMY half:
 * 人口/食料/治安/思想/宗教/支持率). The two records are INDEPENDENT and carry different fields — do NOT
 * merge them. 0x031f carries the supply/budget arrays (transport/outfit/budget/budgeting/commodity),
 * defense scalars, and the owner/state candidate bytes (elem+0x04/+0x05).
 *
 * WIRE EVIDENCE — docs/logh7-info-records-wire.md §2 + direct Ghidra re-confirmation:
 *   - Dispatcher FUN_004ba2b0 case 799 (.omo/f_4ba2b0.txt L419-428): copies a FIXED 0x181 dwords
 *     (= 0x604 = 1540 bytes) from the inbound record `param_3` into clientBase+0x3facf4, REGARDLESS of
 *     the live element count. The wire body is therefore fixed-size/padded to 0x604, but its live prefix is
 *     a parser-helper STREAM. The parser expands that stream to this destination object:
 *         body+0x00  count byte (max 4; following bytes are padding after expansion)
 *         body+0x04  element[0]  (stride 0x180)
 *         body+0x184 element[1]
 *         body+0x304 element[2]
 *         body+0x484 element[3]   → ends at 0x604
 *     This matches the world-import FUN_004c32a0 which reads count at
 *     `*(byte*)(param_1+0x3facf4)` (= body+0) and element[0] at `param_1+0x3facf8` (= body+4), advancing
 *     `iVar16*0x180`. Element+0x00 is the u32 id used as the match key (`*puVar7 == uVar12`); element
 *     +0x04/+0x05 are read as the owner/state candidate bytes (`local_34d`/`local_34e`).
 *   - Parser FUN_00414c70 (.omo/f_414c70.txt): walks the 0x180 element; the array CAP guards are pinned
 *     here directly — `if (0x1e < cnt)` → transport@+0x1c and outfit@+0x98 (cap 30), `if (6 < cnt)` →
 *     budgeting@+0x12a (cap 6), `if (5 < cnt)` → budget@+0x138 (cap 5), `if (3 < cnt)` → commodity@+0x160
 *     (cap 3). Over-limit string `Input_ResponseInformationBase information_size over than 4` (@0x763404)
 *     confirms the 4-element max. The wire BODY is a parser-helper STREAM padded to RESP_INFO_BASE_BYTES;
 *     the message-object parser expands it into this fixed 0x604 destination object before dispatch.
 *
 * CONFIDENCE POLICY (per task data-trust policy):
 *   - Byte LAYOUT / offsets / types / array caps: **P0** (client parser pins). HIGH.
 *   - Field VALUES: **P3** — never fabricated. Default 0; only what the caller supplies is written.
 *   - NAME↔offset mapping: the five arrays are cross-mapped HIGH via their UNIQUE sizes (the array-cap
 *     anchor: only one [30]/[30]/[6]/[5]/[3] each in both the parser and the named-field set). Scalars
 *     keep their RE-pinned byte offset but PROVISIONAL names (the labeled serializer is server-side and
 *     its absolute offsets are not derivable from the client export). See per-field JSDoc below.
 * ============================================================================================
 */

import { buildLobbyResponseInner } from '../logh7-login-protocol.mjs';

// ===================================================================================================
// [L2 코덱] 와이어 레이아웃 상수는 공유 단일 지점 codec/offsets.mjs 로 이동했다(기능 무변경; 기지관리
// 0x32x 패밀리와 일관). 기존 import 경로를 보존하려고 여기서 그대로 다시 re-export 한다. CODE HIGH
// (dispatcher case 799), SIZE/STRIDE/CAP HIGH (parser FUN_00414c70 + world-import FUN_004c32a0 일치).
// 신규 코드는 codec/offsets.mjs 를 직접 import 할 것. 상세 오프셋 주석은 offsets.mjs 참조.
// ===================================================================================================
import {
  RESP_INFO_BASE_CODE,
  RESP_INFO_BASE_ELEM_BYTES,
  RESP_INFO_BASE_MAX,
  RESP_INFO_BASE_BYTES,
  RIB_OFF_COUNT,
  RIB_OFF_ELEM0,
  RIB_ELEM_OFF_ID,
  RIB_ELEM_OFF_FIELD_04,
  RIB_ELEM_OFF_FIELD_08,
  RIB_ELEM_OFF_FIELD_09,
  RIB_ELEM_OFF_FIELD_0C,
  RIB_ELEM_OFF_FIELD_10,
  RIB_ELEM_OFF_FIELD_14,
  RIB_ELEM_OFF_FIELD_18,
  RIB_ELEM_OFF_FIELD_1C,
  RIB_ELEM_OFF_TRANSPORT_CNT,
  RIB_ELEM_OFF_TRANSPORT,
  RIB_ELEM_OFF_OUTFIT_CNT,
  RIB_ELEM_OFF_OUTFIT,
  RIB_ELEM_OFF_FIELD_118,
  RIB_ELEM_OFF_FIELD_11C,
  RIB_ELEM_OFF_FIELD_120,
  RIB_ELEM_OFF_FIELD_124,
  RIB_ELEM_OFF_FIELD_128,
  RIB_ELEM_OFF_FIELD_12C,
  RIB_ELEM_OFF_BUDGETING_CNT,
  RIB_ELEM_OFF_BUDGETING,
  RIB_ELEM_OFF_BUDGET_CNT,
  RIB_ELEM_OFF_BUDGET,
  RIB_ELEM_OFF_FIELD_154,
  RIB_ELEM_OFF_FIELD_156,
  RIB_ELEM_OFF_FIELD_158,
  RIB_ELEM_OFF_FIELD_15A,
  RIB_ELEM_OFF_FIELD_15C,
  RIB_ELEM_OFF_FIELD_160,
  RIB_ELEM_OFF_COMMODITY_CNT,
  RIB_ELEM_OFF_COMMODITY,
  RIB_ELEM_OFF_FIELD_174,
  RIB_ELEM_OFF_FIELD_178,
  RIB_ELEM_OFF_FIELD_179,
  RIB_ELEM_OFF_FIELD_17A,
  RIB_ELEM_OFF_FIELD_17B,
  RIB_ELEM_OFF_FIELD_17C,
  RIB_TRANSPORT_MAX,
  RIB_OUTFIT_MAX,
  RIB_BUDGETING_MAX,
  RIB_BUDGET_MAX,
  RIB_COMMODITY_MAX,
} from './offsets.mjs';

export {
  RESP_INFO_BASE_CODE,
  RESP_INFO_BASE_ELEM_BYTES,
  RESP_INFO_BASE_MAX,
  RESP_INFO_BASE_BYTES,
  RIB_OFF_COUNT,
  RIB_OFF_ELEM0,
  RIB_ELEM_OFF_ID,
  RIB_ELEM_OFF_FIELD_04,
  RIB_ELEM_OFF_FIELD_08,
  RIB_ELEM_OFF_FIELD_09,
  RIB_ELEM_OFF_FIELD_0C,
  RIB_ELEM_OFF_FIELD_10,
  RIB_ELEM_OFF_FIELD_14,
  RIB_ELEM_OFF_FIELD_18,
  RIB_ELEM_OFF_FIELD_1C,
  RIB_ELEM_OFF_TRANSPORT_CNT,
  RIB_ELEM_OFF_TRANSPORT,
  RIB_ELEM_OFF_OUTFIT_CNT,
  RIB_ELEM_OFF_OUTFIT,
  RIB_ELEM_OFF_FIELD_118,
  RIB_ELEM_OFF_FIELD_11C,
  RIB_ELEM_OFF_FIELD_120,
  RIB_ELEM_OFF_FIELD_124,
  RIB_ELEM_OFF_FIELD_128,
  RIB_ELEM_OFF_FIELD_12C,
  RIB_ELEM_OFF_BUDGETING_CNT,
  RIB_ELEM_OFF_BUDGETING,
  RIB_ELEM_OFF_BUDGET_CNT,
  RIB_ELEM_OFF_BUDGET,
  RIB_ELEM_OFF_FIELD_154,
  RIB_ELEM_OFF_FIELD_156,
  RIB_ELEM_OFF_FIELD_158,
  RIB_ELEM_OFF_FIELD_15A,
  RIB_ELEM_OFF_FIELD_15C,
  RIB_ELEM_OFF_FIELD_160,
  RIB_ELEM_OFF_COMMODITY_CNT,
  RIB_ELEM_OFF_COMMODITY,
  RIB_ELEM_OFF_FIELD_174,
  RIB_ELEM_OFF_FIELD_178,
  RIB_ELEM_OFF_FIELD_179,
  RIB_ELEM_OFF_FIELD_17A,
  RIB_ELEM_OFF_FIELD_17B,
  RIB_ELEM_OFF_FIELD_17C,
  RIB_TRANSPORT_MAX,
  RIB_OUTFIT_MAX,
  RIB_BUDGETING_MAX,
  RIB_BUDGET_MAX,
  RIB_COMMODITY_MAX,
};

const clampU8 = (v) => Math.max(0, Math.min(0xff, Math.trunc(v ?? 0))) & 0xff;
const clampU16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(v ?? 0))) & 0xffff;
const clampU32 = (v) => (Math.max(0, Math.trunc(v ?? 0)) >>> 0);
const clampF32 = (v) => (Number.isFinite(v) ? Number(v) : 0);

/**
 * @typedef {object} BaseRecord
 * @property {number} [id]              u32 @elem+0x00 — base/system id (world-import match key) [HIGH name]
 * @property {number} [field04]         u8  @elem+0x04 — owner/state candidate (world-import local_34d) [PROVISIONAL]
 * @property {number} [field05]         u8  @elem+0x05 — owner/state candidate (world-import local_34e) [PROVISIONAL]
 * @property {number} [field08]         u32 @elem+0x08 [PROVISIONAL]
 * @property {number} [field0C]         u32 @elem+0x0c [PROVISIONAL]
 * @property {number} [field10]         f32 @elem+0x10 — availability_ratio candidate [PROVISIONAL]
 * @property {number} [field14]         u32 @elem+0x14 [PROVISIONAL]
 * @property {number} [field18]         u32 @elem+0x18 [PROVISIONAL]
 * @property {number[]} [transportSupplies] u32[≤30] @elem+0x20 (cnt u8 @+0x1c) — transport_supplies [HIGH]
 * @property {number[]} [outfitSupplies]    u32[≤30] @elem+0x9c (cnt u8 @+0x98) — outfit_supplies [HIGH]
 * @property {number} [field118]        u32 @elem+0x114 [PROVISIONAL]
 * @property {number} [field11C]        u32 @elem+0x118 [PROVISIONAL]
 * @property {number} [field120]        u32 @elem+0x11c [PROVISIONAL]
 * @property {number} [field124]        u32 @elem+0x120 [PROVISIONAL]
 * @property {number} [field128]        u32 @elem+0x124 [PROVISIONAL]
 * @property {number} [field12C]        u16 @elem+0x128 [PROVISIONAL]
 * @property {number[]} [budgeting]     u16[≤6]  @elem+0x12c (cnt u8 @+0x12a) — budgeting [HIGH]
 * @property {number[]} [budget]        u32[≤5]  @elem+0x13c (cnt u8 @+0x138) — budget [HIGH]
 * @property {number} [field154]        u16 @elem+0x150 [PROVISIONAL]
 * @property {number} [field156]        u16 @elem+0x152 [PROVISIONAL]
 * @property {number} [field158]        u16 @elem+0x154 [PROVISIONAL]
 * @property {number} [field15A]        u16 @elem+0x156 [PROVISIONAL]
 * @property {number} [field15C]        u32 @elem+0x158 [PROVISIONAL]
 * @property {number} [field160]        u32 @elem+0x15c [PROVISIONAL]
 * @property {number[]} [commodity]     u32[≤3]  @elem+0x164 (cnt u8 @+0x160) — commodity [HIGH]
 * @property {number} [field174]        f32 @elem+0x170 — price_index candidate [PROVISIONAL]
 * @property {number} [field178]        u8  @elem+0x174 [PROVISIONAL]
 * @property {number} [field179]        u8  @elem+0x175 [PROVISIONAL]
 * @property {number} [field17A]        u16 @elem+0x176 [PROVISIONAL]
 * @property {number} [field17B]        u8  @elem+0x178 [PROVISIONAL]
 * @property {number} [field17C]        u32 @elem+0x17c [PROVISIONAL]
 */

function writeStreamU8(body, cursor, value) {
  body.writeUInt8(clampU8(value), cursor);
  return cursor + 1;
}

function writeStreamU16(body, cursor, value) {
  body.writeUInt16BE(clampU16(value), cursor);
  return cursor + 2;
}

function writeStreamU32(body, cursor, value) {
  body.writeUInt32BE(clampU32(value), cursor);
  return cursor + 4;
}

function writeStreamF32(body, cursor, value) {
  body.writeFloatBE(clampF32(value), cursor);
  return cursor + 4;
}

function writeStreamU32Array(body, cursor, list, cap) {
  const arr = Array.isArray(list) ? list.slice(0, cap) : [];
  cursor = writeStreamU8(body, cursor, arr.length);
  for (let i = 0; i < arr.length; i += 1) cursor = writeStreamU32(body, cursor, arr[i]);
  return cursor;
}

function writeStreamU16Array(body, cursor, list, cap) {
  const arr = Array.isArray(list) ? list.slice(0, cap) : [];
  cursor = writeStreamU8(body, cursor, arr.length);
  for (let i = 0; i < arr.length; i += 1) cursor = writeStreamU16(body, cursor, arr[i]);
  return cursor;
}

function writeStreamElement(body, cursor, rec = {}) {
  cursor = writeStreamU32(body, cursor, rec.id);
  cursor = writeStreamU8(body, cursor, rec.field04);
  cursor = writeStreamU8(body, cursor, rec.field05 ?? rec.field09);
  cursor = writeStreamU32(body, cursor, rec.field08);
  cursor = writeStreamU32(body, cursor, rec.field0C ?? rec.field0c);
  cursor = writeStreamF32(body, cursor, rec.field10);
  cursor = writeStreamU32(body, cursor, rec.field14);
  cursor = writeStreamU32(body, cursor, rec.field18);
  cursor = writeStreamU32Array(body, cursor, rec.transportSupplies, RIB_TRANSPORT_MAX);
  cursor = writeStreamU32Array(body, cursor, rec.outfitSupplies, RIB_OUTFIT_MAX);
  cursor = writeStreamU32(body, cursor, rec.field118);
  cursor = writeStreamU32(body, cursor, rec.field11C ?? rec.field11c);
  cursor = writeStreamU32(body, cursor, rec.field120);
  cursor = writeStreamU32(body, cursor, rec.field124);
  cursor = writeStreamU32(body, cursor, rec.field128);
  cursor = writeStreamU16(body, cursor, rec.field12C ?? rec.field12c);
  cursor = writeStreamU16Array(body, cursor, rec.budgeting, RIB_BUDGETING_MAX);
  cursor = writeStreamU32Array(body, cursor, rec.budget, RIB_BUDGET_MAX);
  cursor = writeStreamU16(body, cursor, rec.field154);
  cursor = writeStreamU16(body, cursor, rec.field156);
  cursor = writeStreamU16(body, cursor, rec.field158);
  cursor = writeStreamU16(body, cursor, rec.field15A ?? rec.field15a);
  cursor = writeStreamU32(body, cursor, rec.field15C ?? rec.field15c);
  cursor = writeStreamU32(body, cursor, rec.field160);
  cursor = writeStreamU32Array(body, cursor, rec.commodity, RIB_COMMODITY_MAX);
  cursor = writeStreamF32(body, cursor, rec.field174);
  cursor = writeStreamU8(body, cursor, rec.field178);
  cursor = writeStreamU8(body, cursor, rec.field179);
  cursor = writeStreamU16(body, cursor, rec.field17A ?? rec.field17a);
  cursor = writeStreamU8(body, cursor, rec.field17B ?? rec.field17b);
  return writeStreamU32(body, cursor, rec.field17C ?? rec.field17c);
}

/**
 * Build a `ResponseInformationBase` (0x031f) record — the base defense/development/ownership panel.
 *
 * The network body is the FUN_00414c70 parser-helper stream, zero-padded to the fixed 0x604 receive size.
 * The client expands that stream to the dispatcher destination object: count byte, then up to four
 * 0x180-byte elements. All destination offsets are RE-pinned (P0). Field values are P3 — every field
 * defaults 0 and only what the caller supplies is written.
 *
 * @param {{ bases?: BaseRecord[] }} [options]
 * @returns {Buffer} message32 inner: [u32 BE 0][u16 BE 0x031f][0x604-byte padded parser stream]
 */
export function buildResponseInformationBaseInner({ bases = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_INFO_BASE_CODE, RESP_INFO_BASE_BYTES);
  const body = inner.subarray(6);
  const list = Array.isArray(bases) ? bases.slice(0, RESP_INFO_BASE_MAX) : [];
  let cursor = 0;
  body.writeUInt8(list.length & 0xff, cursor);
  cursor += 1;
  for (let i = 0; i < list.length; i += 1) {
    cursor = writeStreamElement(body, cursor, list[i] ?? {});
  }
  return inner;
}

/**
 * Project a content/galaxy.json system (+ optional planet-economy context) onto a BaseRecord. VALUES are
 * P3: this performs only SAFE, non-fabricating mappings — it sets the caller-supplied `id` and leaves
 * every economy/defense field at 0 unless the caller explicitly passes it through `ctx`. It exists so the
 * world-init wiring (which knows each base's runtime id) can build a record without inventing numbers.
 *
 * Why so conservative: the 0x031f scalar names are PROVISIONAL (the labeled serializer is server-side and
 * its absolute offsets are unresolved), so blindly mapping galaxy/economy JSON onto raw offsets would risk
 * writing the wrong field. Only the `id` is mapped here; pass arrays/scalars explicitly via `ctx` once a
 * live A/B check pins them.
 *
 * @param {{ system?: string, faction?: string }} system content/galaxy.json system object (name/faction)
 * @param {{ id?: number } & Partial<BaseRecord>} [ctx] runtime id + any explicitly-pinned passthrough fields
 * @returns {BaseRecord}
 */
export function systemToBaseRecord(system = {}, ctx = {}) {
  const { id = 0, ...passthrough } = ctx ?? {};
  // Only `id` is mapped from runtime ctx. All economy/defense fields stay default (0/empty) unless the
  // caller explicitly threads them through ctx — no fabrication from JSON onto provisional offsets.
  return { id: clampU32(id), ...passthrough };
}

/**
 * Project a system's planets onto a BaseRecord, populating ONLY the five HIGH-confidence (P0 byte-offset)
 * arrays of the 0x031f element. Scalars (population/food/approval/…) are deliberately left at 0 because
 * their absolute byte offsets are PROVISIONAL (the labeled `_INF` serializer is server-side and its offsets
 * are not derivable from the client export — docs/logh7-info-records-wire.md §2). Writing aggregate numbers
 * to an unconfirmed scalar offset risks corrupting the panel, so this projection is array-only.
 *
 * VALUE provenance (the byte LAYOUT is P0; only the numbers below are graded):
 *   - budget[0]    = Σ planet.industry  — production-budget PROXY (no dedicated slot). [P3 proxy]
 *   - commodity[0] = # habitable planets — habitability roll-up.                       [P3]
 *   - budgeting[0] = # planets in the system.                                          [P3]
 *   The source magnitudes (industry/habitable/orbit) come from content/planet-economy.json which is itself
 *   procedural [P3] (281 planets, not IV-EX/manual canon). No scalar economy field is fabricated.
 *
 * Returns null when there is no economy context (no planets), so callers can fall back to the plain
 * id+owner seed unchanged.
 *
 * @param {Array<object>} planets planet rows ({ population_M, food, industry, habitable, orbit })
 * @param {{ id?: number } & Partial<BaseRecord>} [ctx] runtime id + any explicit passthrough overrides
 * @returns {BaseRecord|null}
 */
export function economyBaseRecord(planets, ctx = {}) {
  const rows = Array.isArray(planets) ? planets.filter((p) => p && typeof p === 'object') : [];
  if (rows.length === 0) return null;
  const { id = 0, ...passthrough } = ctx ?? {};
  const industryTotal = rows.reduce((sum, p) => sum + (Number(p.industry) || 0), 0);
  const habitableCount = rows.reduce((n, p) => n + (p.habitable ? 1 : 0), 0);
  // Array-only injection: every value lands in a HIGH-offset (P0) array slot. Caller passthrough wins so a
  // future live-pinned scalar can be threaded in explicitly without changing this helper.
  return {
    id: clampU32(id),
    budget: [clampU32(industryTotal)], // budget[0] @expanded elem+0x13c [P0 layout; value P3 proxy]
    commodity: [clampU32(habitableCount)], // commodity[0] @expanded elem+0x164 [P0 layout; value P3]
    budgeting: [clampU16(rows.length)], // budgeting[0] @expanded elem+0x12c [P0 layout; value P3]
    ...passthrough,
  };
}
