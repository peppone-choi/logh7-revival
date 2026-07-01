/**
 * BASE FACILITIES record builder — `ResponseInformationInstitution` (0x0321, dispatcher case 0x321).
 *
 * This is the FACILITIES panel of the in-world 「基地管理」 base-management screen (施設, the UI-read
 * pair req 0x0320 → resp 0x0321). It is the SISTER record of the just-shipped logh7-base-record.mjs
 * (ResponseInformationBase 0x031f = the defense/development/ownership half): per the scope note in
 * docs/logh7-info-records-wire.md §3, the 防衛/造兵/対空/衛星 facilities are the `institution[]`
 * sub-records carried by THIS message (0x0321 → clientBase+0x3fb2f8), distinct from the 0x031f base
 * scalars. The two records are independent — do NOT merge them.
 *
 * SELF-CONTAINED (no edits to the hot-path login/transport modules; avoids parallel write-conflicts with
 * the 0x2006 fragmentation fix in flight): the only import is the framing helper `buildLobbyResponseInner`
 * from logh7-login-protocol.mjs — identical to the pattern logh7-base-record.mjs uses.
 *
 * ============================================================================================
 * WIRE EVIDENCE — direct Ghidra re-decompile (export E:/logh7-revival/.omo/ghidra/export/G7MTClient):
 *
 *   Dispatcher FUN_004ba2b0 case 0x321 (.omo/f_4ba2b0.txt L430-440): copies a FIXED 0x2379 dwords
 *   (= 0x8DE4 = 36324 bytes) from the parser-expanded inbound record `param_3` into clientBase+0x3fb2f8,
 *   REGARDLESS of the live count, with NO post-store proc. Therefore the client destination object is
 *   fixed-size 0x8DE4; the network body is the compact FUN_004167f0 parser stream, padded to that receive
 *   size so the transport/dispatcher length gate remains byte-exact.
 *
 *   World-import FUN_004c4170 (.omo/f_4c4170.txt L36-42): bulk-copies the same 0x2379 dwords from
 *   clientBase+0x3fb2f8 into the in-world strategy buffer — agrees on size.
 *
 *   Binary parser FUN_004167f0 (.omo/f_4167f0.txt) + text parser FUN_00416bd0 (.omo/f_416bd0.txt)
 *   pin the NESTED layout field-for-field (the two parsers write identical offsets — independent
 *   cross-validation). Three over-limit error strings give all three array caps:
 *     - `Input_ResponseInformationInstitution ... information_size ... over than 4`  (0x763504) → OUTER ≤ 4
 *     - `Input_InformationInstitution ... institution_size ... over than 36`         (0x7634a8) → institution[] ≤ 36
 *     - `Input_Institution ... spot_size ... over than 20`                           (0x763460) → spot[] ≤ 20
 *   Parser guards confirm the cap values: `bVar1 < 5` (≤4), `0x24 < *param_1` (≤36), `0x14 < *pbVar7` (≤20).
 *
 *   EXPANDED CLIENT DESTINATION LAYOUT (all offsets P0 — both parsers + world-import agree; zero-padded):
 *     body+0x00            u8 count (destination dword stays zero-padded; dispatcher copies dwords) [P0]
 *     element[i] base B = body + 0x04 + i*0x2378  (i in 0..3) [P0]
 *       B+0x00  u32  id / base spot-id  (parser reads E-0x04 = the per-element id first; serializer label `base=`) [P0 offset; name MEDIUM]
 *       B+0x04  u8   institution_count  (parser E+0x00, guard ≤36) [P0]
 *       B+0x08  institution[j] base J = B + 0x08 + j*0xfc  (stride 0xfc) [P0]
 *         J+0x00  u16  field00  (parser writes I-0x08, NAMELESS) [P0 offset/type; PROVISIONAL name]
 *         J+0x04  u32  field04  (parser writes I-0x04, NAMELESS) [P0 offset/type; PROVISIONAL name]
 *         J+0x08  u8   spot_count  (parser I+0x00, guard ≤20) [P0]
 *         J+0x0c  spot[k] base S = J + 0x0c + k*0xc  (stride 0xc, serializer label `spot[%d]={`) [P0]
 *           S+0x00  u16  field00  (parser L154/L114, NAMELESS) [P0 offset/type; PROVISIONAL name]
 *           S+0x04  u32  field04  (parser L165/L124, NAMELESS) [P0 offset/type; PROVISIONAL name]
 *           S+0x08  u16  background_id  (render passes spot+0x08 to bg%03d.jpg) [P0 offset/type/name]
 *   Size check: 36*0xfc=0x2370 fills B+0x08..B+0x2378 (element stride 0x2378, 0 pad); 20*0xc=0xf0 fills
 *   J+0x0c..J+0xfc (institution stride 0xfc, 0 pad); 4 + 4*0x2378 = 0x8DE4 = dispatcher copy (0 pad).
 *
 * CONFIDENCE POLICY (per task data-trust policy):
 *   - Byte LAYOUT / offsets / types / strides / array caps: **P0** (both client parsers + world-import pin). HIGH.
 *   - NAME↔offset mapping: the THREE caps (4/36/20) are each UNIQUE in the parser walk AND in the
 *     serializer label block (0x761008 `spot[%d]={`, 0x761014 `institution[%d]={`, 0x761028 `base=`,
 *     terminated by 0x761030 `_INF:ResponseInformationInstitution#`), so the array STRUCTURE maps HIGH:
 *     element id ↔ `base=`, institution[] ↔ `institution[%d]={`, spot[] ↔ `spot[%d]={`. The element-id
 *     NAME is MEDIUM (the labeled serializer is server-side: 0x761030 has NO referencing function in the
 *     export, exactly like the 0x031f base scalars). The institution/spot SCALAR fields (J+0x00/J+0x04,
 *     S+0x00/S+0x04) have no labels; S+0x08 is the spot background id. Runtime spot
 *     resolution is tested separately through FUN_004c9170 and PLAYER_INFO +0x40/+0x44; do not infer
 *     those semantics from labels alone.
 *   - Field VALUES: **P3** — never fabricated. Default 0; only what the caller supplies is written.
 * ============================================================================================
 */

import { buildLobbyResponseInner } from '../logh7-login-protocol.mjs';

// ===================================================================================================
// [L2 코덱] 와이어 레이아웃 상수는 공유 단일 지점 codec/offsets.mjs 로 이동했다(기능 무변경).
// 기존 import 경로를 보존하려고 여기서 그대로 다시 re-export 한다. CODE HIGH (dispatcher case 0x321),
// SIZE/STRIDE/CAP HIGH (parsers FUN_004167f0/FUN_00416bd0 + world-import FUN_004c4170 + 에러 문자열 일치).
// 신규 코드는 codec/offsets.mjs 를 직접 import 할 것. 상세 오프셋 주석은 offsets.mjs 참조.
// ===================================================================================================
import {
  RESP_INFO_INSTITUTION_CODE,
  RESP_INFO_INSTITUTION_ELEM_BYTES,
  RESP_INFO_INSTITUTION_MAX,
  RESP_INFO_INSTITUTION_BYTES,
  RESP_INFO_INSTITUTION_INST_ELEM_BYTES,
  RESP_INFO_INSTITUTION_INST_MAX,
  RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES,
  RESP_INFO_INSTITUTION_SPOT_MAX,
  RII_OFF_COUNT,
  RII_OFF_ELEM0,
  RII_ELEM_OFF_ID,
  RII_ELEM_OFF_INST_CNT,
  RII_ELEM_OFF_INST0,
  RII_INST_OFF_FIELD_00,
  RII_INST_OFF_FIELD_04,
  RII_INST_OFF_SPOT_CNT,
  RII_INST_OFF_SPOT0,
  RII_SPOT_OFF_FIELD_00,
  RII_SPOT_OFF_FIELD_04,
  RII_SPOT_OFF_FIELD_08,
} from './offsets.mjs';

export {
  RESP_INFO_INSTITUTION_CODE,
  RESP_INFO_INSTITUTION_ELEM_BYTES,
  RESP_INFO_INSTITUTION_MAX,
  RESP_INFO_INSTITUTION_BYTES,
  RESP_INFO_INSTITUTION_INST_ELEM_BYTES,
  RESP_INFO_INSTITUTION_INST_MAX,
  RESP_INFO_INSTITUTION_SPOT_ELEM_BYTES,
  RESP_INFO_INSTITUTION_SPOT_MAX,
  RII_OFF_COUNT,
  RII_OFF_ELEM0,
  RII_ELEM_OFF_ID,
  RII_ELEM_OFF_INST_CNT,
  RII_ELEM_OFF_INST0,
  RII_INST_OFF_FIELD_00,
  RII_INST_OFF_FIELD_04,
  RII_INST_OFF_SPOT_CNT,
  RII_INST_OFF_SPOT0,
  RII_SPOT_OFF_FIELD_00,
  RII_SPOT_OFF_FIELD_04,
  RII_SPOT_OFF_FIELD_08,
};

const clampU8 = (v) => Math.max(0, Math.min(0xff, Math.trunc(v ?? 0))) & 0xff;
const clampU16 = (v) => Math.max(0, Math.min(0xffff, Math.trunc(v ?? 0))) & 0xffff;
const clampU32 = (v) => (Math.max(0, Math.trunc(v ?? 0)) >>> 0);

/**
 * @typedef {object} SpotRecord
 * @property {number} [field00]  u16 @spot+0x00 [PROVISIONAL name; offset/type HIGH]
 * @property {number} [field04]  u32 @spot+0x04 [PROVISIONAL name; offset/type HIGH]
 * @property {number} [field08]  u16 @spot+0x08 background image id for data/image/spot/bg%03d.jpg [P0]
 */

/**
 * @typedef {object} InstitutionRecord
 * @property {number} [field00]    u16 @inst+0x00 [PROVISIONAL name; offset/type HIGH]
 * @property {number} [field04]    u32 @inst+0x04 [PROVISIONAL name; offset/type HIGH]
 * @property {SpotRecord[]} [spots] spot[≤20] @inst+0x0c (cnt u8 @inst+0x08) — `spot[%d]={` [HIGH structure]
 */

/**
 * @typedef {object} InstitutionElement
 * @property {number} [id]                  u32 @elem+0x00 — base/spot id (serializer label `base=`) [HIGH offset; name MEDIUM]
 * @property {InstitutionRecord[]} [institutions] institution[≤36] @elem+0x08 (cnt u8 @elem+0x04) — `institution[%d]={` [HIGH structure]
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

function writeStreamSpot(body, cursor, spot = {}) {
  cursor = writeStreamU16(body, cursor, spot.field00);
  cursor = writeStreamU32(body, cursor, spot.field04);
  return writeStreamU16(body, cursor, spot.field08);
}

function writeStreamInstitution(body, cursor, inst = {}) {
  cursor = writeStreamU16(body, cursor, inst.field00);
  cursor = writeStreamU32(body, cursor, inst.field04);
  const spots = Array.isArray(inst.spots) ? inst.spots.slice(0, RESP_INFO_INSTITUTION_SPOT_MAX) : [];
  cursor = writeStreamU8(body, cursor, spots.length);
  for (let k = 0; k < spots.length; k += 1) {
    cursor = writeStreamSpot(body, cursor, spots[k] ?? {});
  }
  return cursor;
}

function writeStreamElement(body, cursor, elem = {}) {
  cursor = writeStreamU32(body, cursor, elem.id);
  const insts = Array.isArray(elem.institutions)
    ? elem.institutions.slice(0, RESP_INFO_INSTITUTION_INST_MAX)
    : [];
  cursor = writeStreamU8(body, cursor, insts.length);
  for (let j = 0; j < insts.length; j += 1) {
    cursor = writeStreamInstitution(body, cursor, insts[j] ?? {});
  }
  return cursor;
}

/**
 * Build a `ResponseInformationInstitution` (0x0321) record — the base FACILITIES (施設) panel.
 *
 * The network body is the FUN_004167f0 parser-helper stream, zero-padded to the fixed 0x8DE4 receive
 * size. The client expands the stream to the dispatcher destination object: count byte, then up to four
 * 0x2378-byte outer elements. Each element holds up to 36 institutions (stride 0xfc), each holding up to
 * 20 spots (stride 0xc). All destination offsets/strides/caps are RE-pinned (P0). Field values are P3.
 *
 * @param {{ institutions?: InstitutionElement[] }} [options] outer elements (per-base facility records)
 * @returns {Buffer} message32 inner: [u32 BE 0][u16 BE 0x0321][0x8DE4-byte padded parser stream]
 */
export function buildResponseInformationInstitutionInner({ institutions = [] } = {}) {
  const inner = buildLobbyResponseInner(RESP_INFO_INSTITUTION_CODE, RESP_INFO_INSTITUTION_BYTES);
  const body = inner.subarray(6);

  const list = Array.isArray(institutions) ? institutions.slice(0, RESP_INFO_INSTITUTION_MAX) : [];
  let cursor = 0;
  cursor = writeStreamU8(body, cursor, list.length);
  for (let i = 0; i < list.length; i += 1) {
    cursor = writeStreamElement(body, cursor, list[i] ?? {});
  }
  return inner;
}

/**
 * Project a content/galaxy.json system onto an InstitutionElement. VALUES are P3: this performs only
 * SAFE, non-fabricating mapping — it sets the caller-supplied `id` and leaves the institution/spot
 * arrays EMPTY unless the caller explicitly passes them through `ctx`. It mirrors systemToBaseRecord:
 * the world-init wiring knows each base's runtime id, but the institution/spot scalar names are
 * PROVISIONAL (the labeled serializer is server-side), so blindly projecting facility JSON onto raw
 * offsets would risk writing the wrong field. Only `id` is mapped; pass `institutions` explicitly via
 * `ctx` once a live A/B check pins the facility scalars.
 *
 * @param {{ system?: string, faction?: string }} system content/galaxy.json system object (name/faction)
 * @param {{ id?: number } & Partial<InstitutionElement>} [ctx] runtime id + any explicit passthrough
 * @returns {InstitutionElement}
 */
export function systemToInstitutionRecord(system = {}, ctx = {}) {
  const { id = 0, ...passthrough } = ctx ?? {};
  // Only `id` is mapped from runtime ctx. Institution/spot arrays stay empty unless the caller threads
  // them through ctx explicitly — no fabrication from JSON onto provisional offsets.
  return { id: clampU32(id), ...passthrough };
}
