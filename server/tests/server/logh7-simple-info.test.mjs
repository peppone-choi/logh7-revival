/**
 * Simple-info delta broadcast (0x1200–0x120f) tests — the periodic STATE-SYNC pump. Verifies the
 * transaction framing (Begin..deltas..End), every delta builder's fixed body size + header + record
 * stride/fields, the safe per-message clamp, the multi-message split, and the createSimpleInfoState
 * accumulator. Server-push only (no process()): pure/synchronous, no live client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSimpleInfoState,
  simpleInfoSafeMax,
  buildSimpleInfoTransaction,
  buildTransactionSimpleDataBeginInner,
  buildTransactionSimpleDataEndInner,
  buildNotifySimpleInfoCharacterInner,
  buildNotifySimpleInfoOutfitInner,
  buildNotifySimpleInfoBaseInner,
  buildNotifySimpleInfoGridInner,
  buildNotifySimpleInfoStrategyInner,
  buildNotifySimpleInfoUnitInner,
  buildNotifySimpleInfoCardInner,
  buildNotifySimpleInfoRankInner,
  buildNotifySimpleInfoRankingCharacterInner,
  buildNotifySimpleInfoCompletenessSupplyOutfitInner,
  buildNotifySimpleInfoCardAvailableOutfitSeatInner,
  buildNotifySimpleInfoCardAvailableBaseSeatInner,
  buildNotifySimpleInfoOrderSuggestCharacterInner,
  buildNotifySimpleInfoCharacterEntryInner,
  SIMPLE_INFO_SPECS,
  SIMPLE_INFO_KINDS,
  TRANSACTION_SIMPLE_DATA_BEGIN_CODE,
  TRANSACTION_SIMPLE_DATA_BEGIN_BYTES,
  TRANSACTION_SIMPLE_DATA_END_CODE,
  TRANSACTION_SIMPLE_DATA_END_BYTES,
  NOTIFY_SIMPLE_INFO_CHARACTER_CODE,
  NOTIFY_SIMPLE_INFO_OUTFIT_CODE,
  NOTIFY_SIMPLE_INFO_BASE_CODE,
  NOTIFY_SIMPLE_INFO_GRID_CODE,
  NOTIFY_SIMPLE_INFO_STRATEGY_CODE,
  NOTIFY_SIMPLE_INFO_UNIT_CODE,
  NOTIFY_SIMPLE_INFO_CARD_CODE,
  NOTIFY_SIMPLE_INFO_RANK_CODE,
  NOTIFY_SIMPLE_INFO_RANKING_CHARACTER_CODE,
  NOTIFY_SIMPLE_INFO_COMPLETENESS_SUPPLY_OUTFIT_CODE,
  NOTIFY_SIMPLE_INFO_CARD_AVAILABLE_OUTFIT_SEAT_CODE,
  NOTIFY_SIMPLE_INFO_CARD_AVAILABLE_BASE_SEAT_CODE,
  NOTIFY_SIMPLE_INFO_ORDER_SUGGEST_CHARACTER_CODE,
  NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_CODE,
} from '../../src/server/logh7-simple-info.mjs';

// Framing helpers: S->C inner = [u32 0][u16 BE code][LE body]; body is inner.subarray(6).
const innerCode = (inner) => inner.readUInt16BE(4); // u16 BE app code @4 (after the u32 0 prefix)
const innerBody = (inner) => inner.subarray(6); // LE body region
const innerPrefix = (inner) => inner.readUInt32BE(0); // message32 prefix (must be 0)

// ---------- spec self-consistency (size arithmetic from §2) ----------

test('every spec body fits header + perMsg*stride (no buffer overrun)', () => {
  for (const [kind, s] of Object.entries(SIMPLE_INFO_SPECS)) {
    assert.ok(s.hdr + s.perMsg * s.stride <= s.body, `${kind}: hdr+perMsg*stride exceeds body`);
  }
});

test('safeMax = min(perMsg, bufMax) and clamps the overflow cases from §2 open-question #4', () => {
  assert.equal(simpleInfoSafeMax('grid'), 180); // perMsg 200 vs bufMax 180 -> 180
  assert.equal(simpleInfoSafeMax('strategy'), 100); // 200 vs 100 -> 100
  assert.equal(simpleInfoSafeMax('completenessSupplyOutfit'), 100); // 300 vs 100 -> 100
  assert.equal(simpleInfoSafeMax('cardAvailableOutfitSeat'), 100); // 180 vs 100 -> 100
  assert.equal(simpleInfoSafeMax('cardAvailableBaseSeat'), 300); // 600 vs 300 -> 300
  assert.equal(simpleInfoSafeMax('character'), 200); // 200 vs 2000 -> 200
});

test('simpleInfoSafeMax throws on an unknown kind', () => {
  assert.throws(() => simpleInfoSafeMax('bogus'), /unknown simple-info kind/);
});

// ---------- transaction framing builders (0x1200 / 0x1201) ----------

test('Begin 0x1200 is framed message32 with the fixed 36-byte body, prefix 0', () => {
  const inner = buildTransactionSimpleDataBeginInner();
  assert.equal(innerPrefix(inner), 0);
  assert.equal(innerCode(inner), TRANSACTION_SIMPLE_DATA_BEGIN_CODE);
  assert.equal(innerBody(inner).length, TRANSACTION_SIMPLE_DATA_BEGIN_BYTES);
  assert.equal(innerBody(inner).length, 0x24);
});

test('End 0x1201 is framed message32 with the fixed 1-byte body', () => {
  const inner = buildTransactionSimpleDataEndInner();
  assert.equal(innerCode(inner), TRANSACTION_SIMPLE_DATA_END_CODE);
  assert.equal(innerBody(inner).length, TRANSACTION_SIMPLE_DATA_END_BYTES);
  assert.equal(innerBody(inner).length, 1);
});

// ---------- per-delta builders: fixed size, code, header count, record fields ----------

test('Character 0x1202: fixed 0xe104 body, count@0, first dword = characterId, bytes payload @+4', () => {
  const extra = Buffer.alloc(SIMPLE_INFO_SPECS.character.stride - 4, 0xab);
  const inner = buildNotifySimpleInfoCharacterInner([{ characterId: 0x11223344, bytes: extra }, { id: 9 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_CHARACTER_CODE);
  assert.equal(body.length, 0xe104);
  assert.equal(body.readUInt8(0), 2); // count (4-byte header)
  assert.equal(body.readUInt32LE(4), 0x11223344); // record[0] id @ hdr=4
  assert.equal(body.readUInt8(4 + 4), 0xab); // bytes payload starts at +4 within the record
  assert.equal(body.readUInt32LE(4 + 0x120), 9); // record[1] id @ hdr + stride
});

test('Character 0x1202 does not synthesize names from provisional roster fields', () => {
  const inner = buildNotifySimpleInfoCharacterInner([{ characterId: 0x1122, displayName: 'Yang Wenli' }]);
  const body = innerBody(inner);
  const row = SIMPLE_INFO_SPECS.character.hdr;

  assert.equal(body.readUInt32LE(row), 0x1122);
  assert.equal(body.readUInt8(row + 0x81), 0);
  assert.equal(body.readUInt16LE(row + 0x82), 0);
  assert.equal(body.readUInt8(row + 0xb8), 0);
  assert.equal(body.readUInt16LE(row + 0xba), 0);
});

test('Character 0x1202 preserves caller-supplied raw bytes without interpreting subfields', () => {
  const raw = Buffer.alloc(SIMPLE_INFO_SPECS.character.stride - 4, 0);
  raw.writeUInt8(0x7d, 0x81 - 4);
  raw.writeUInt16LE(0x1234, 0x82 - 4);
  raw.writeUInt8(0x7e, 0xb8 - 4);
  raw.writeUInt16LE(0x5678, 0xba - 4);
  const inner = buildNotifySimpleInfoCharacterInner([{ id: 1, bytes: raw }, { id: 2 }]);
  const body = innerBody(inner);
  const first = SIMPLE_INFO_SPECS.character.hdr;
  const second = first + SIMPLE_INFO_SPECS.character.stride;

  assert.equal(body.length, 0xe104);
  assert.equal(body.readUInt8(0), 2);
  assert.equal(body.readUInt8(first + 0x81), 0x7d);
  assert.equal(body.readUInt16LE(first + 0x82), 0x1234);
  assert.equal(body.readUInt8(first + 0xb8), 0x7e);
  assert.equal(body.readUInt16LE(first + 0xba), 0x5678);
  assert.equal(body.readUInt8(second + 0x81), 0);
  assert.equal(body.readUInt16LE(second + 0x82), 0);
  assert.equal(body.readUInt8(second + 0xb8), 0);
  assert.equal(body.readUInt16LE(second + 0xba), 0);
});

test('Outfit 0x1203: fixed 0x2264 body, stride 0x2c, count@0, first dword = outfitId', () => {
  const inner = buildNotifySimpleInfoOutfitInner([{ outfitId: 5 }, { id: 6 }, { id: 7 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_OUTFIT_CODE);
  assert.equal(body.length, 0x2264);
  assert.equal(body.readUInt8(0), 3);
  assert.equal(body.readUInt32LE(4), 5);
  assert.equal(body.readUInt32LE(4 + 0x2c), 6);
  assert.equal(body.readUInt32LE(4 + 0x2c * 2), 7);
});

test('Base 0x1204: fixed 0x1c24 body, stride 0x24, first dword = baseId', () => {
  const inner = buildNotifySimpleInfoBaseInner([{ baseId: 42 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_BASE_CODE);
  assert.equal(body.length, 0x1c24);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(4), 42);
});

test('Grid 0x1205: fixed 0x324 body, stride 4, one u32 per cell (accepts raw numbers)', () => {
  const inner = buildNotifySimpleInfoGridInner([0xdeadbeef, { value: 0x01020304 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_GRID_CODE);
  assert.equal(body.length, 0x324);
  assert.equal(body.readUInt8(0), 2);
  assert.equal(body.readUInt32LE(4), 0xdeadbeef);
  assert.equal(body.readUInt32LE(8), 0x01020304);
});

test('Strategy 0x1206: fixed 0x644 body, [u32 a][u32 b] per record', () => {
  const inner = buildNotifySimpleInfoStrategyInner([{ a: 11, b: 22 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_STRATEGY_CODE);
  assert.equal(body.length, 0x644);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(4), 11);
  assert.equal(body.readUInt32LE(8), 22);
});

test('Unit 0x1207: fixed 0x12c4 body, 2-byte header, [u32 unitId][u32 status]', () => {
  const inner = buildNotifySimpleInfoUnitInner([{ unitId: 100, status: 7 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_UNIT_CODE);
  assert.equal(body.length, 0x12c4);
  assert.equal(body.readUInt8(0), 1);
  // 2-byte header => record[0] starts at offset 2
  assert.equal(body.readUInt32LE(2), 100);
  assert.equal(body.readUInt32LE(6), 7);
});

test('Card 0x1208: fixed 0xe14 body, 2-byte header, [u32 cardId][u32 charId][u32 seat]', () => {
  const inner = buildNotifySimpleInfoCardInner([{ cardId: 3, charId: 9, seat: 1 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_CARD_CODE);
  assert.equal(body.length, 0xe14);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(2), 3);
  assert.equal(body.readUInt32LE(6), 9);
  assert.equal(body.readUInt32LE(10), 1);
});

test('Rank 0x1209: fixed 0x2b body, 1-byte header, u16 per record (accepts raw numbers)', () => {
  const inner = buildNotifySimpleInfoRankInner([0x1234, { value: 0x00ff }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_RANK_CODE);
  assert.equal(body.length, 0x2b);
  assert.equal(body.readUInt8(0), 2);
  // 1-byte header => record[0] @ offset 1, record[1] @ offset 3
  assert.equal(body.readUInt16LE(1), 0x1234);
  assert.equal(body.readUInt16LE(3), 0x00ff);
});

test('RankingCharacter 0x120a: fixed 0x73a4 body, stride 0x128, first dword = characterId', () => {
  const inner = buildNotifySimpleInfoRankingCharacterInner([{ characterId: 77 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_RANKING_CHARACTER_CODE);
  assert.equal(body.length, 0x73a4);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(4), 77);
});

test('CompletenessSupplyOutfit 0x120b: fixed 0x3cf4 body, 2-byte header, stride 0x34', () => {
  const inner = buildNotifySimpleInfoCompletenessSupplyOutfitInner([{ outfitId: 8 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_COMPLETENESS_SUPPLY_OUTFIT_CODE);
  assert.equal(body.length, 0x3cf4);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(2), 8); // 2-byte header
});

test('CardAvailableOutfitSeat 0x120c: fixed 0x21c4 body, 4-byte header, stride 0x30', () => {
  const inner = buildNotifySimpleInfoCardAvailableOutfitSeatInner([{ id: 12 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_CARD_AVAILABLE_OUTFIT_SEAT_CODE);
  assert.equal(body.length, 0x21c4);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(4), 12);
});

test('CardAvailableBaseSeat 0x120d: fixed 0x2ee4 body, 2-byte header, stride 0x14', () => {
  const inner = buildNotifySimpleInfoCardAvailableBaseSeatInner([{ id: 13 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_CARD_AVAILABLE_BASE_SEAT_CODE);
  assert.equal(body.length, 0x2ee4);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(2), 13); // 2-byte header
});

test('OrderSuggestCharacter 0x120e: fixed 0x723c body, stride 0xb6c, first dword = characterId', () => {
  const inner = buildNotifySimpleInfoOrderSuggestCharacterInner([{ characterId: 314 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_ORDER_SUGGEST_CHARACTER_CODE);
  assert.equal(body.length, 0x723c);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(4), 314);
});

test('CharacterEntry 0x120f: fixed 0x73a4 body, stride 0x128, first dword = characterId', () => {
  const inner = buildNotifySimpleInfoCharacterEntryInner([{ characterId: 271 }]);
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_CODE);
  assert.equal(body.length, 0x73a4);
  assert.equal(body.readUInt8(0), 1);
  assert.equal(body.readUInt32LE(4), 271);
});

// ---------- count clamping (never overflow the fixed buffer) ----------

test('a delta clamps count to the kind safe-max and never overflows the fixed body', () => {
  // Rank: safeMax 21. Send 50 -> count must be 21, body still exactly 0x2b.
  const records = Array.from({ length: 50 }, (_, i) => ({ value: i }));
  const inner = buildNotifySimpleInfoRankInner(records);
  const body = innerBody(inner);
  assert.equal(body.length, 0x2b);
  assert.equal(body.readUInt8(0), 21); // clamped to safeMax
});

test('empty record list yields a valid zero-count delta of the full fixed size', () => {
  const inner = buildNotifySimpleInfoBaseInner([]);
  const body = innerBody(inner);
  assert.equal(body.length, 0x1c24);
  assert.equal(body.readUInt8(0), 0);
});

// ---------- createSimpleInfoState accumulator ----------

test('createSimpleInfoState stages, reports empty, and drains records per kind', () => {
  const state = createSimpleInfoState();
  assert.equal(state.isEmpty(), true);
  state.add('base', { baseId: 1 });
  state.add('character', [{ characterId: 2 }, { characterId: 3 }]);
  assert.equal(state.isEmpty(), false);
  const drained = state.drain();
  assert.deepEqual(drained.base, [{ baseId: 1 }]);
  assert.equal(drained.character.length, 2);
  // drain resets the accumulator
  assert.equal(state.isEmpty(), true);
});

test('createSimpleInfoState.add throws on an unknown kind', () => {
  const state = createSimpleInfoState();
  assert.throws(() => state.add('bogus', {}), /unknown simple-info kind/);
});

// ---------- buildSimpleInfoTransaction: Begin .. deltas .. End ----------

test('an empty transaction is exactly [Begin, End]', () => {
  const frames = buildSimpleInfoTransaction({});
  assert.equal(frames.length, 2);
  assert.equal(innerCode(frames[0]), TRANSACTION_SIMPLE_DATA_BEGIN_CODE);
  assert.equal(innerCode(frames[1]), TRANSACTION_SIMPLE_DATA_END_CODE);
});

test('transaction wraps deltas in canonical (low-code-first) order between Begin and End', () => {
  // Stage out of order; the wrapper must still emit base(0x1204) before card(0x1208).
  const frames = buildSimpleInfoTransaction({
    card: [{ cardId: 1, charId: 2, seat: 3 }],
    base: [{ baseId: 9 }],
  });
  assert.equal(frames.length, 4); // Begin + base + card + End
  assert.equal(innerCode(frames[0]), TRANSACTION_SIMPLE_DATA_BEGIN_CODE);
  assert.equal(innerCode(frames[1]), NOTIFY_SIMPLE_INFO_BASE_CODE);
  assert.equal(innerCode(frames[2]), NOTIFY_SIMPLE_INFO_CARD_CODE);
  assert.equal(innerCode(frames[3]), TRANSACTION_SIMPLE_DATA_END_CODE);
});

test('transaction integrates with createSimpleInfoState.drain()', () => {
  const state = createSimpleInfoState();
  state.add('unit', { unitId: 5, status: 1 });
  const frames = buildSimpleInfoTransaction(state.drain());
  assert.equal(frames.length, 3); // Begin + unit + End
  assert.equal(innerCode(frames[1]), NOTIFY_SIMPLE_INFO_UNIT_CODE);
  assert.equal(innerBody(frames[1]).readUInt32LE(2), 5); // unit id, 2-byte header
});

test('transaction SPLITS a kind across multiple Notify messages when it exceeds the safe per-message cap', () => {
  // Rank safeMax is 21; 45 records -> ceil(45/21) = 3 Notify messages.
  const records = Array.from({ length: 45 }, (_, i) => ({ value: i }));
  const frames = buildSimpleInfoTransaction({ rank: records });
  // Begin + 3 rank deltas + End
  assert.equal(frames.length, 5);
  assert.equal(innerCode(frames[0]), TRANSACTION_SIMPLE_DATA_BEGIN_CODE);
  assert.equal(innerCode(frames[1]), NOTIFY_SIMPLE_INFO_RANK_CODE);
  assert.equal(innerCode(frames[2]), NOTIFY_SIMPLE_INFO_RANK_CODE);
  assert.equal(innerCode(frames[3]), NOTIFY_SIMPLE_INFO_RANK_CODE);
  assert.equal(innerCode(frames[4]), TRANSACTION_SIMPLE_DATA_END_CODE);
  // counts per chunk: 21, 21, 3
  assert.equal(innerBody(frames[1]).readUInt8(0), 21);
  assert.equal(innerBody(frames[2]).readUInt8(0), 21);
  assert.equal(innerBody(frames[3]).readUInt8(0), 3);
  // the split preserves record ORDER: chunk 2 record[0] == global record[21]
  assert.equal(innerBody(frames[2]).readUInt16LE(1), 21);
  assert.equal(innerBody(frames[3]).readUInt16LE(1), 42);
});

test('SIMPLE_INFO_KINDS is the low-code-first key order of SIMPLE_INFO_SPECS', () => {
  const codes = SIMPLE_INFO_KINDS.map((k) => SIMPLE_INFO_SPECS[k].code);
  const sorted = [...codes].sort((a, b) => a - b);
  assert.deepEqual(codes, sorted);
});
