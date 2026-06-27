/**
 * [L2 코덱 레이어] Phase A2 — 순수 와이어 코덱 모듈.
 * 이 파일은 logh7-simple-info.mjs에서 "기능 무변경"으로 이동된 순수 build*Inner 코덱이다.
 * (바이트 오프셋/stride/size/로직 1비트도 변경 없음, 단 import 경로만 ../ 로 한 단계 상향.)
 * 기존 import 경로 보존: 원래 위치 src/server/logh7-simple-info.mjs 가 이 모듈을 그대로 re-export 한다.
 *
 * Authoritative simple-info DELTA BROADCAST layer (0x1200–0x120f) — the periodic STATE-SYNC pump.
 *
 * This is the mechanism the LOGH VII authoritative server uses to keep every connected client's
 * in-world model consistent. The server pushes a `TransactionSimpleDataBegin` (0x1200) that resets
 * the client's delta accumulators, then a stream of `NotifySimpleInformation*` deltas (each APPENDS
 * up to its per-message cap of fixed-stride records to the matching client buffer), then a
 * `TransactionSimpleDataEnd` (0x1201) that commits/flips the display buffers. It is SERVER-PUSH only:
 * there is no inbound command, so this module exports builders + a transaction wrapper, NOT a
 * process() entry. Pure + synchronous => fully unit-testable without a live client.
 *
 * FRAMING (docs/logh7-proto-social-account.md §2, docs/logh7-moveship-wire.md):
 *   - These are S→C conn3 messages. Each is built with `buildLobbyResponseInner(code, fixedSize)`
 *     which yields [u32 0][u16 BE code][LE body]; the LE body is at `inner.subarray(6)`. The body
 *     size is FIXED (the client's receive-object factory FUN_004b8b00 allocates a fixed buffer per
 *     code — mirrored in WORLD_RESPONSE_OBJECT_SIZES) and zero-padded; the client stops reading after
 *     `count` records.
 *   - Universal record framing of every 0x12xx Notify body:
 *         [ u8 count ][ pad to header size ][ record[0] ] … [ record[count-1] ]
 *     Header = 4 bytes for most records (count u8 @0, 3 pad), 2 bytes for the small-record ones
 *     (0x1207/0x1208/0x120b/0x120d), 1 byte for 0x1209 Rank. Bodies are little-endian.
 *
 * EVIDENCE (Ghidra G7MTClient, index .omo/ghidra/export/G7MTClient):
 *   - FUN_004c1dd0 (0x1200 Begin) zeroes 15 accumulator counters; FUN_004c1e50 (0x1201 End) commits.
 *   - Per-code apply copy loops pin each record STRIDE (HIGH confidence): Character 0x120 (FUN_004c1e80),
 *     Outfit 0x2c (FUN_004c1fa0), Base 0x24 (FUN_004c2040), Grid 4 (FUN_004c25b0), Strategy 8
 *     (FUN_004c20d0), Unit 8 (FUN_004c2250), Card 0xc (FUN_004c2150), Rank 2 (FUN_004c21e0),
 *     RankingCharacter 0x128 (FUN_004c22d0), CompletenessSupplyOutfit 0x34 (FUN_004c2360),
 *     CardAvailableOutfitSeat 0x30 (FUN_004c23f0), CardAvailableBaseSeat 0x14 (FUN_004c2480),
 *     OrderSuggestCharacter 0xb6c (FUN_004c2510), CharacterEntry 0x128 (FUN_004c1f10).
 *   - Per-RECORD FIELD meanings are low/medium confidence (need the UI reader). This module fills the
 *     HIGH-confidence first dword (id) and leaves the rest as caller-supplied bytes/fields, never
 *     inventing a layout. See docs/logh7-proto-social-account.md §2a / §8.
 */

import { buildLobbyResponseInner } from '../logh7-login-protocol.mjs';

// ---- transaction framing codes (0x1200 / 0x1201) ----
export const TRANSACTION_SIMPLE_DATA_BEGIN_CODE = 0x1200; // S->C reset accumulators (FUN_004c1dd0)
export const TRANSACTION_SIMPLE_DATA_BEGIN_BYTES = 0x24; // 36 (fixed body)
export const TRANSACTION_SIMPLE_DATA_END_CODE = 0x1201; // S->C commit/flip (FUN_004c1e50)
export const TRANSACTION_SIMPLE_DATA_END_BYTES = 0x01; // 1 (fixed body)

// ---- delta notify codes (0x1202 – 0x120f) ----
export const NOTIFY_SIMPLE_INFO_CHARACTER_CODE = 0x1202;
export const NOTIFY_SIMPLE_INFO_OUTFIT_CODE = 0x1203;
export const NOTIFY_SIMPLE_INFO_BASE_CODE = 0x1204;
export const NOTIFY_SIMPLE_INFO_GRID_CODE = 0x1205;
export const NOTIFY_SIMPLE_INFO_STRATEGY_CODE = 0x1206;
export const NOTIFY_SIMPLE_INFO_UNIT_CODE = 0x1207;
export const NOTIFY_SIMPLE_INFO_CARD_CODE = 0x1208;
export const NOTIFY_SIMPLE_INFO_RANK_CODE = 0x1209;
export const NOTIFY_SIMPLE_INFO_RANKING_CHARACTER_CODE = 0x120a;
export const NOTIFY_SIMPLE_INFO_COMPLETENESS_SUPPLY_OUTFIT_CODE = 0x120b;
export const NOTIFY_SIMPLE_INFO_CARD_AVAILABLE_OUTFIT_SEAT_CODE = 0x120c;
export const NOTIFY_SIMPLE_INFO_CARD_AVAILABLE_BASE_SEAT_CODE = 0x120d;
export const NOTIFY_SIMPLE_INFO_ORDER_SUGGEST_CHARACTER_CODE = 0x120e;
export const NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_CODE = 0x120f;

/**
 * Per-code delta spec (docs/logh7-proto-social-account.md §2, all HIGH confidence on size/stride/hdr).
 *   code     — wire message code
 *   body     — FIXED body size (= WORLD_RESPONSE_OBJECT_SIZES[code]); zero-padded by the builder
 *   hdr      — header bytes before record[0] (count u8 @0 + pad)
 *   stride   — record byte size (the client's copy-loop stride)
 *   perMsg   — largest record `count` that fits the fixed body buffer
 *   bufMax   — client's while(counter<N) cap across the whole Begin/End transaction
 *   safeMax  — min(perMsg, bufMax): the safe per-message count (open question #4)
 * Size arithmetic cross-checked: hdr + perMsg*stride ≤ body for every row.
 */
export const SIMPLE_INFO_SPECS = Object.freeze({
  character: { code: NOTIFY_SIMPLE_INFO_CHARACTER_CODE, body: 0xe104, hdr: 4, stride: 0x120, perMsg: 200, bufMax: 2000 },
  outfit: { code: NOTIFY_SIMPLE_INFO_OUTFIT_CODE, body: 0x2264, hdr: 4, stride: 0x2c, perMsg: 200, bufMax: 300 },
  base: { code: NOTIFY_SIMPLE_INFO_BASE_CODE, body: 0x1c24, hdr: 4, stride: 0x24, perMsg: 200, bufMax: 400 },
  grid: { code: NOTIFY_SIMPLE_INFO_GRID_CODE, body: 0x324, hdr: 4, stride: 4, perMsg: 200, bufMax: 180 },
  strategy: { code: NOTIFY_SIMPLE_INFO_STRATEGY_CODE, body: 0x644, hdr: 4, stride: 8, perMsg: 200, bufMax: 100 },
  unit: { code: NOTIFY_SIMPLE_INFO_UNIT_CODE, body: 0x12c4, hdr: 2, stride: 8, perMsg: 600, bufMax: 2000 },
  card: { code: NOTIFY_SIMPLE_INFO_CARD_CODE, body: 0xe14, hdr: 2, stride: 0xc, perMsg: 300, bufMax: 300 },
  rank: { code: NOTIFY_SIMPLE_INFO_RANK_CODE, body: 0x2b, hdr: 1, stride: 2, perMsg: 21, bufMax: 21 },
  rankingCharacter: { code: NOTIFY_SIMPLE_INFO_RANKING_CHARACTER_CODE, body: 0x73a4, hdr: 4, stride: 0x128, perMsg: 100, bufMax: 100 },
  completenessSupplyOutfit: { code: NOTIFY_SIMPLE_INFO_COMPLETENESS_SUPPLY_OUTFIT_CODE, body: 0x3cf4, hdr: 2, stride: 0x34, perMsg: 300, bufMax: 100 },
  cardAvailableOutfitSeat: { code: NOTIFY_SIMPLE_INFO_CARD_AVAILABLE_OUTFIT_SEAT_CODE, body: 0x21c4, hdr: 4, stride: 0x30, perMsg: 180, bufMax: 100 },
  cardAvailableBaseSeat: { code: NOTIFY_SIMPLE_INFO_CARD_AVAILABLE_BASE_SEAT_CODE, body: 0x2ee4, hdr: 2, stride: 0x14, perMsg: 600, bufMax: 300 },
  orderSuggestCharacter: { code: NOTIFY_SIMPLE_INFO_ORDER_SUGGEST_CHARACTER_CODE, body: 0x723c, hdr: 4, stride: 0xb6c, perMsg: 10, bufMax: 200 },
  characterEntry: { code: NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_CODE, body: 0x73a4, hdr: 4, stride: 0x128, perMsg: 100, bufMax: 600 },
});

/** The safe per-message record count for a kind = min(perMsg buffer fit, client while-cap). */
export function simpleInfoSafeMax(kind) {
  const spec = SIMPLE_INFO_SPECS[kind];
  if (!spec) {
    throw new Error(`unknown simple-info kind: ${kind}`);
  }
  return Math.min(spec.perMsg, spec.bufMax);
}

/**
 * Build the in-memory simple-info delta accumulator for one push cycle. The authoritative world tick
 * stages records here (one array per kind), then `buildSimpleInfoTransaction(state.drain())` emits the
 * Begin..deltas..End frame. This is a SERVER-PUSH accumulator (no inbound command), so there is no
 * connection-keyed state — one instance per pending broadcast.
 */
export function createSimpleInfoState() {
  /** @type {Record<string, Array<object>>} */
  const records = {};
  for (const kind of Object.keys(SIMPLE_INFO_SPECS)) {
    records[kind] = [];
  }
  return {
    records,
    /** Stage one or more records of `kind` for the next push. */
    add(kind, recordOrList) {
      if (!(kind in records)) {
        throw new Error(`unknown simple-info kind: ${kind}`);
      }
      const list = Array.isArray(recordOrList) ? recordOrList : [recordOrList];
      for (const r of list) {
        records[kind].push(r);
      }
      return this;
    },
    /** True when nothing is staged (an empty transaction is still valid: Begin + End, no deltas). */
    isEmpty() {
      return Object.values(records).every((list) => list.length === 0);
    },
    /** Snapshot the staged records and reset the accumulator (returns the snapshot for the wrapper). */
    drain() {
      const snapshot = {};
      for (const kind of Object.keys(records)) {
        snapshot[kind] = records[kind];
        records[kind] = [];
      }
      return snapshot;
    },
  };
}

/** 0x1200 TransactionSimpleDataBegin — resets the client's delta accumulators (FUN_004c1dd0). */
export function buildTransactionSimpleDataBeginInner() {
  return buildLobbyResponseInner(TRANSACTION_SIMPLE_DATA_BEGIN_CODE, TRANSACTION_SIMPLE_DATA_BEGIN_BYTES);
}

/** 0x1201 TransactionSimpleDataEnd — commits/flips the display buffers (FUN_004c1e50). */
export function buildTransactionSimpleDataEndInner() {
  return buildLobbyResponseInner(TRANSACTION_SIMPLE_DATA_END_CODE, TRANSACTION_SIMPLE_DATA_END_BYTES);
}

/**
 * Core delta builder: write `[u8 count][pad to hdr][record×count]` into the fixed-size body for `kind`.
 * Each record is written by `writeRecord(payload, recordOffset, record, index)` which the kind-specific
 * builders supply. `count` is clamped to the kind's safe per-message max (never overflows the buffer).
 * Returns the framed inner ([u32 0][u16 BE code][body]).
 */
function buildSimpleInfoDelta(kind, records, writeRecord) {
  const spec = SIMPLE_INFO_SPECS[kind];
  const max = simpleInfoSafeMax(kind);
  const count = Math.min(records.length, max);
  const inner = buildLobbyResponseInner(spec.code, spec.body);
  const payload = inner.subarray(6);
  payload.writeUInt8(count & 0xff, 0); // count u8 @0 (header), rest of header stays zero pad
  for (let i = 0; i < count; i += 1) {
    const off = spec.hdr + i * spec.stride;
    if (off + spec.stride > payload.length) {
      break; // never write past the fixed buffer
    }
    writeRecord(payload, off, records[i], i);
  }
  return inner;
}

// First dword of every record is (almost certainly) the entity id — the only HIGH-confidence field.
// The remaining record bytes are caller-supplied (raw `bytes` Buffer, or kind-specific named fields)
// so the server can carry real payloads without this module inventing a field map.
const writeIdAndBytes = (idKey) => (payload, off, record, stride) => {
  payload.writeUInt32LE(((record?.[idKey] ?? record?.id ?? 0) >>> 0), off);
  if (record?.bytes && Buffer.isBuffer(record.bytes)) {
    record.bytes.copy(payload, off + 4, 0, Math.min(record.bytes.length, stride - 4));
  }
};

/**
 * 0x1202 NotifySimpleInformationCharacter — 288-byte character deltas (packed form of the 724-byte
 * 0x0323 record). HIGH conf: first dword = character_id. The UI reader uses this id plus filter fields
 * and resolves display details through the full character path; there is no proven 0x1202 display-name
 * field. Remaining bytes are carried only when caller supplies raw, evidence-backed `bytes`.
 * `records` = [{ characterId|id, bytes? }]. Evidence: §2 (stride 0x120, FUN_004c1e80).
 */
export function buildNotifySimpleInfoCharacterInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.character.stride;
  const writeCharacterIdAndBytes = writeIdAndBytes('characterId');
  return buildSimpleInfoDelta('character', records, (p, off, r) => writeCharacterIdAndBytes(p, off, r, stride));
}

/**
 * 0x1203 NotifySimpleInformationOutfit — 44-byte fleet/squadron (艦隊/部隊) deltas. First dword = outfit id.
 * `records` = [{ outfitId|id, bytes? }]. Evidence: §2 (stride 0x2c, FUN_004c1fa0).
 */
export function buildNotifySimpleInfoOutfitInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.outfit.stride;
  return buildSimpleInfoDelta('outfit', records, (p, off, r) => writeIdAndBytes('outfitId')(p, off, r, stride));
}

/**
 * 0x1204 NotifySimpleInformationBase — 36-byte planet/base economy deltas. First dword = base id.
 * `records` = [{ baseId|id, bytes? }]. Evidence: §2 (stride 0x24, FUN_004c2040).
 */
export function buildNotifySimpleInfoBaseInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.base.stride;
  return buildSimpleInfoDelta('base', records, (p, off, r) => writeIdAndBytes('baseId')(p, off, r, stride));
}

/**
 * 0x1205 NotifySimpleInformationGrid — one u32 per cell (packed grid ownership/visibility bitfield).
 * `records` = [{ value }] (or raw numbers). Evidence: §2 (stride 4, FUN_004c25b0).
 */
export function buildNotifySimpleInfoGridInner(records = []) {
  return buildSimpleInfoDelta('grid', records, (p, off, r) => {
    const v = typeof r === 'number' ? r : (r?.value ?? r?.id ?? 0);
    p.writeUInt32LE(v >>> 0, off);
  });
}

/**
 * 0x1206 NotifySimpleInformationStrategy — [u32 a][u32 b] per record (likely planId/targetGrid + state).
 * `records` = [{ a, b }]. Evidence: §2 (stride 8, FUN_004c20d0).
 */
export function buildNotifySimpleInfoStrategyInner(records = []) {
  return buildSimpleInfoDelta('strategy', records, (p, off, r) => {
    p.writeUInt32LE((r?.a ?? r?.id ?? 0) >>> 0, off);
    p.writeUInt32LE((r?.b ?? r?.state ?? 0) >>> 0, off + 4);
  });
}

/**
 * 0x1207 NotifySimpleInformationUnit — [u32 unitId][u32 status] per record (2-byte header). First dword
 * = unit id, second = packed status/strength. `records` = [{ unitId|id, status }]. Evidence: §2
 * (stride 8, hdr 2, FUN_004c2250).
 */
export function buildNotifySimpleInfoUnitInner(records = []) {
  return buildSimpleInfoDelta('unit', records, (p, off, r) => {
    p.writeUInt32LE((r?.unitId ?? r?.id ?? 0) >>> 0, off);
    p.writeUInt32LE((r?.status ?? 0) >>> 0, off + 4);
  });
}

/**
 * 0x1208 NotifySimpleInformationCard — [u32 cardId][u32 charId][u32 seat] personnel-card (人事) delta
 * (2-byte header). `records` = [{ cardId|id, charId, seat }]. Evidence: §2 (stride 0xc, hdr 2, FUN_004c2150).
 */
export function buildNotifySimpleInfoCardInner(records = []) {
  return buildSimpleInfoDelta('card', records, (p, off, r) => {
    p.writeUInt32LE((r?.cardId ?? r?.id ?? 0) >>> 0, off);
    p.writeUInt32LE((r?.charId ?? 0) >>> 0, off + 4);
    p.writeUInt32LE((r?.seat ?? 0) >>> 0, off + 8);
  });
}

/**
 * 0x1209 NotifySimpleInformationRank — u16 rank/promotion value per record (1-byte header).
 * `records` = [{ value }] (or raw numbers). Evidence: §2 (stride 2, hdr 1, FUN_004c21e0).
 */
export function buildNotifySimpleInfoRankInner(records = []) {
  return buildSimpleInfoDelta('rank', records, (p, off, r) => {
    const v = typeof r === 'number' ? r : (r?.value ?? r?.id ?? 0);
    p.writeUInt16LE(v & 0xffff, off);
  });
}

/**
 * 0x120a NotifySimpleInformationRankingCharacter — 296-byte ranking-row deltas (same stride as a
 * CharacterEntry row). First dword = character id. `records` = [{ characterId|id, bytes? }].
 * Evidence: §2 (stride 0x128, FUN_004c22d0).
 */
export function buildNotifySimpleInfoRankingCharacterInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.rankingCharacter.stride;
  return buildSimpleInfoDelta('rankingCharacter', records, (p, off, r) => writeIdAndBytes('characterId')(p, off, r, stride));
}

/**
 * 0x120b NotifySimpleInformationCompletenessSupplyOutfit — 52-byte supply-completeness deltas
 * (2-byte header). First dword = outfit id. `records` = [{ outfitId|id, bytes? }]. Evidence: §2
 * (stride 0x34, hdr 2, FUN_004c2360).
 */
export function buildNotifySimpleInfoCompletenessSupplyOutfitInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.completenessSupplyOutfit.stride;
  return buildSimpleInfoDelta('completenessSupplyOutfit', records, (p, off, r) => writeIdAndBytes('outfitId')(p, off, r, stride));
}

/**
 * 0x120c NotifySimpleInformationCardAvailableOutfitSeat — 48-byte deltas. First dword = card/seat id.
 * `records` = [{ id, bytes? }]. Evidence: §2 (stride 0x30, FUN_004c23f0).
 */
export function buildNotifySimpleInfoCardAvailableOutfitSeatInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.cardAvailableOutfitSeat.stride;
  return buildSimpleInfoDelta('cardAvailableOutfitSeat', records, (p, off, r) => writeIdAndBytes('id')(p, off, r, stride));
}

/**
 * 0x120d NotifySimpleInformationCardAvailableBaseSeat — 20-byte deltas (10×u16, 2-byte header). First
 * dword = id. `records` = [{ id, bytes? }]. Evidence: §2 note (stride 0x14, hdr 2, FUN_004c2480).
 */
export function buildNotifySimpleInfoCardAvailableBaseSeatInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.cardAvailableBaseSeat.stride;
  return buildSimpleInfoDelta('cardAvailableBaseSeat', records, (p, off, r) => writeIdAndBytes('id')(p, off, r, stride));
}

/**
 * 0x120e NotifySimpleInformationOrderSuggestCharacter — 2924-byte order/suggestion package per
 * character (the largest record). First dword = character id. `records` = [{ characterId|id, bytes? }].
 * Evidence: §2 (stride 0xb6c, FUN_004c2510).
 */
export function buildNotifySimpleInfoOrderSuggestCharacterInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.orderSuggestCharacter.stride;
  return buildSimpleInfoDelta('orderSuggestCharacter', records, (p, off, r) => writeIdAndBytes('characterId')(p, off, r, stride));
}

/**
 * 0x120f NotifySimpleInformationCharacterEntry — 296-byte character-entry-state deltas (same stride
 * as a ranking row). First dword = character id. `records` = [{ characterId|id, bytes? }]. Evidence:
 * §2 (stride 0x128, FUN_004c1f10).
 */
export function buildNotifySimpleInfoCharacterEntryInner(records = []) {
  const stride = SIMPLE_INFO_SPECS.characterEntry.stride;
  return buildSimpleInfoDelta('characterEntry', records, (p, off, r) => writeIdAndBytes('characterId')(p, off, r, stride));
}

/** kind -> builder dispatch table (used by the transaction wrapper to emit deltas in canonical order). */
const DELTA_BUILDERS = Object.freeze({
  character: buildNotifySimpleInfoCharacterInner,
  outfit: buildNotifySimpleInfoOutfitInner,
  base: buildNotifySimpleInfoBaseInner,
  grid: buildNotifySimpleInfoGridInner,
  strategy: buildNotifySimpleInfoStrategyInner,
  unit: buildNotifySimpleInfoUnitInner,
  card: buildNotifySimpleInfoCardInner,
  rank: buildNotifySimpleInfoRankInner,
  rankingCharacter: buildNotifySimpleInfoRankingCharacterInner,
  completenessSupplyOutfit: buildNotifySimpleInfoCompletenessSupplyOutfitInner,
  cardAvailableOutfitSeat: buildNotifySimpleInfoCardAvailableOutfitSeatInner,
  cardAvailableBaseSeat: buildNotifySimpleInfoCardAvailableBaseSeatInner,
  orderSuggestCharacter: buildNotifySimpleInfoOrderSuggestCharacterInner,
  characterEntry: buildNotifySimpleInfoCharacterEntryInner,
});

/** Canonical delta ordering (low code first) so the wrapped frame is deterministic. */
export const SIMPLE_INFO_KINDS = Object.freeze(Object.keys(SIMPLE_INFO_SPECS));

/**
 * Wrap a set of staged delta records into one Begin..deltas..End transaction. `records` is a
 * `{ kind: [record, ...], ... }` map (the shape `createSimpleInfoState().drain()` returns). For each
 * kind, the records are SPLIT across multiple Notify messages when they exceed the kind's safe
 * per-message cap (so the client never logs `SimpleInformation<X>_MAXSIZE over`). Returns the ordered
 * array of framed inner buffers: [Begin, ...deltas, End]. An empty `records` yields just [Begin, End].
 *
 * @param {Record<string, Array<object>>} [records]
 * @returns {Buffer[]} ordered framed inners to broadcast in sequence
 */
export function buildSimpleInfoTransaction(records = {}) {
  const frames = [buildTransactionSimpleDataBeginInner()];
  for (const kind of SIMPLE_INFO_KINDS) {
    const list = records[kind];
    if (!Array.isArray(list) || list.length === 0) {
      continue;
    }
    const max = simpleInfoSafeMax(kind);
    const build = DELTA_BUILDERS[kind];
    // Split into chunks of at most `max` records — each chunk is one Notify message inside the txn.
    for (let i = 0; i < list.length; i += max) {
      frames.push(build(list.slice(i, i + max)));
    }
  }
  frames.push(buildTransactionSimpleDataEndInner());
  return frames;
}
