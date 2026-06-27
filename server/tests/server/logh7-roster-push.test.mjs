// In-world character-roster push tests (RE-corrected lobby-button gate).
//
// The lobby buttons 새 캐릭터 작성 / 오리지널 추첨 / 캐릭터 삭제 gate on the client's roster count at
// clientBase+0x554da4, filled EXCLUSIVELY by the bulk transaction 0x1200 → 0x120f → 0x1201.
// Verified against Ghidra (imagebase 0x400000):
//   - Filler FUN_004c1f10: payload { u8 count @+0x00; records @+0x04 }, stride 0x128 (296B), cap 600.
//   - Gate FUN_00597ff0: needs count≥1 AND ≥1 record with GROUP byte == 2 @record+0x00 AND
//     THRESHOLD dword ≤ ceiling @record+0x04.
// These tests pin the byte layout (record size 296, group byte offset/value, threshold offset,
// count prefix, inner codes) and that LOGH_ROSTER_PUSH=1 emits 0x1200/0x120f/0x1201 on the SS path.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  TRANSACTION_SIMPLE_DATA_BEGIN_CODE,
  TRANSACTION_SIMPLE_DATA_BEGIN_BYTES,
  TRANSACTION_SIMPLE_DATA_END_CODE,
  TRANSACTION_SIMPLE_DATA_END_BYTES,
  NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_CODE,
  NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_BYTES,
  SIMPLE_INFO_CHARACTER_ENTRY_STRIDE,
  SIMPLE_INFO_CHARACTER_ENTRY_HEADER,
  SIMPLE_INFO_CHARACTER_ENTRY_GROUP,
  SIMPLE_INFO_CHARACTER_ENTRY_MAX,
  WORLD_RESPONSE_OBJECT_SIZES,
  buildTransactionSimpleDataBeginInner,
  buildTransactionSimpleDataEndInner,
  buildNotifySimpleInformationCharacterInner,
  buildCharacterRosterTransaction,
} from '../../src/server/logh7-login-protocol.mjs';
import { createAccountStore, createLoginSession, LOGIN_PHASES } from '../../src/server/logh7-login-session.mjs';

// message32 framing: [u32 BE 0 prefix][u16 BE app code @4][LE body @6].
const innerCode = (inner) => inner.readUInt16BE(4);
const innerBody = (inner) => inner.subarray(6);

const LOBBY = { ip: '127.0.0.1', port: 47900 };
const SS_LOGIN_REQUEST_HEX = '020047494e3700570000070069006e00650069003000300000';

// Drive a session to the SS-authenticated phase (0x0020 selector 0 → 0x0200 SSLoginRequest).
function ssAuthedSession(opts = {}) {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, ...opts });
  session.markHandshakeComplete();
  session.onInnerMessage(Buffer.from('002000000000', 'hex')); // conn3 SS init (selector 0)
  session.onInnerMessage(Buffer.from(SS_LOGIN_REQUEST_HEX, 'hex')); // 0x0200 → 0x0201 (SS-login flag)
  return session;
}

// ---------- size-table coverage ----------

test('WORLD_RESPONSE_OBJECT_SIZES carries the transaction sizes (0x1200/0x120f/0x1201)', () => {
  assert.equal(WORLD_RESPONSE_OBJECT_SIZES[0x1200], TRANSACTION_SIMPLE_DATA_BEGIN_BYTES);
  assert.equal(WORLD_RESPONSE_OBJECT_SIZES[0x120f], NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_BYTES);
  assert.equal(WORLD_RESPONSE_OBJECT_SIZES[0x1201], TRANSACTION_SIMPLE_DATA_END_BYTES);
});

// ---------- transaction framing builders (0x1200 / 0x1201) ----------

test('Begin 0x1200 is message32-framed with the fixed 36-byte body, prefix 0', () => {
  const inner = buildTransactionSimpleDataBeginInner();
  assert.equal(inner.readUInt32BE(0), 0); // message32 prefix
  assert.equal(innerCode(inner), TRANSACTION_SIMPLE_DATA_BEGIN_CODE);
  assert.equal(innerCode(inner), 0x1200);
  assert.equal(innerBody(inner).length, 0x24);
});

test('End 0x1201 is message32-framed with the fixed 1-byte body', () => {
  const inner = buildTransactionSimpleDataEndInner();
  assert.equal(innerCode(inner), TRANSACTION_SIMPLE_DATA_END_CODE);
  assert.equal(innerCode(inner), 0x1201);
  assert.equal(innerBody(inner).length, 0x01);
});

// ---------- 0x120f entry builder byte layout ----------

test('0x120f entry: fixed 0x73a4 body, count prefix, record stride 296', () => {
  const inner = buildNotifySimpleInformationCharacterInner({ characters: [{ id: 271 }, { id: 195 }] });
  const body = innerBody(inner);
  assert.equal(innerCode(inner), NOTIFY_SIMPLE_INFO_CHARACTER_ENTRY_CODE);
  assert.equal(innerCode(inner), 0x120f);
  assert.equal(body.length, 0x73a4);
  assert.equal(SIMPLE_INFO_CHARACTER_ENTRY_STRIDE, 296);
  assert.equal(body.readUInt8(0), 2); // [u8 count @0]
});

test('0x120f record: GROUP byte = 2 @record+0x00 and THRESHOLD dword = 0 @record+0x04 (verified gate offsets)', () => {
  const inner = buildNotifySimpleInformationCharacterInner({ characters: [{ id: 7 }, { id: 9 }] });
  const body = innerBody(inner);
  for (let i = 0; i < 2; i += 1) {
    const off = SIMPLE_INFO_CHARACTER_ENTRY_HEADER + i * SIMPLE_INFO_CHARACTER_ENTRY_STRIDE;
    assert.equal(body.readUInt8(off + 0x00), SIMPLE_INFO_CHARACTER_ENTRY_GROUP); // GROUP byte (== 2)
    assert.equal(body.readUInt8(off + 0x00), 2);
    assert.equal(body.readUInt32LE(off + 0x04), 0); // THRESHOLD dword (≤ ceiling)
  }
});

test('0x120f record: best-effort id @record+0x08 and pascal-16 name @record+0x0c', () => {
  const inner = buildNotifySimpleInformationCharacterInner({ characters: [{ id: 271, name: 'AB' }] });
  const body = innerBody(inner);
  const off = SIMPLE_INFO_CHARACTER_ENTRY_HEADER;
  assert.equal(body.readUInt32LE(off + 0x08), 271); // id after the gate fields
  assert.equal(body.readUInt8(off + 0x0c), 2); // name length
  assert.equal(body.readUInt16LE(off + 0x0e), 'A'.charCodeAt(0));
  assert.equal(body.readUInt16LE(off + 0x10), 'B'.charCodeAt(0));
});

test('0x120f: explicit group/threshold overrides land at the verified offsets', () => {
  const inner = buildNotifySimpleInformationCharacterInner({ characters: [{ id: 1, group: 3, threshold: 5 }] });
  const off = SIMPLE_INFO_CHARACTER_ENTRY_HEADER;
  const body = innerBody(inner);
  assert.equal(body.readUInt8(off + 0x00), 3); // retried group value
  assert.equal(body.readUInt32LE(off + 0x04), 5);
});

test('0x120f: count clamps to the filler cap (600) and never overflows the fixed body', () => {
  const many = Array.from({ length: SIMPLE_INFO_CHARACTER_ENTRY_MAX + 50 }, (_, i) => ({ id: i + 1 }));
  const inner = buildNotifySimpleInformationCharacterInner({ characters: many });
  const body = innerBody(inner);
  assert.equal(body.length, 0x73a4);
  assert.equal(body.readUInt8(0), SIMPLE_INFO_CHARACTER_ENTRY_MAX & 0xff); // 600 & 0xff = 0x58
  // The fixed 0x73a4 body fits 100 records (4 + 100*296 = 29604 = 0x73a4); the builder stops at the
  // buffer edge so writes never spill past payload.length.
  assert.ok(SIMPLE_INFO_CHARACTER_ENTRY_HEADER + 100 * SIMPLE_INFO_CHARACTER_ENTRY_STRIDE <= body.length);
});

test('0x120f: empty roster yields a valid zero-count entry (count 0)', () => {
  const inner = buildNotifySimpleInformationCharacterInner({ characters: [] });
  const body = innerBody(inner);
  assert.equal(body.length, 0x73a4);
  assert.equal(body.readUInt8(0), 0);
});

// ---------- transaction assembly ----------

test('buildCharacterRosterTransaction frames [Begin, Entry, End] with codes 0x1200/0x120f/0x1201', () => {
  const frames = buildCharacterRosterTransaction({ characters: [{ id: 271 }, { id: 195 }] });
  assert.equal(frames.length, 3);
  assert.equal(innerCode(frames[0]), 0x1200);
  assert.equal(innerCode(frames[1]), 0x120f);
  assert.equal(innerCode(frames[2]), 0x1201);
  assert.equal(innerBody(frames[1]).readUInt8(0), 2); // count = 2
});

test('buildCharacterRosterTransaction emits one passing record for an empty account', () => {
  const frames = buildCharacterRosterTransaction({ characters: [] });
  assert.equal(frames.length, 3);
  const entry = innerBody(frames[1]);
  assert.equal(entry.readUInt8(0), 1); // count >= 1 so the gate (count≥1) passes
  assert.equal(entry.readUInt8(SIMPLE_INFO_CHARACTER_ENTRY_HEADER + 0x00), 2); // group=2 record
});

test('buildCharacterRosterTransaction splits a >600 roster into multiple 0x120f messages', () => {
  const list = Array.from({ length: SIMPLE_INFO_CHARACTER_ENTRY_MAX + 1 }, (_, i) => ({ id: i + 1 }));
  const frames = buildCharacterRosterTransaction({ characters: list });
  // Begin + 2 entry chunks (600 + 1) + End
  assert.equal(frames.length, 4);
  assert.equal(innerCode(frames[0]), 0x1200);
  assert.equal(innerCode(frames[1]), 0x120f);
  assert.equal(innerCode(frames[2]), 0x120f);
  assert.equal(innerCode(frames[3]), 0x1201);
});

// ---------- session injection (env-gated) ----------

test('LOGH_ROSTER_PUSH=1 emits the 0x1200/0x120f/0x1201 transaction after SSGameLoginOK (0x0206)', () => {
  const previous = process.env.LOGH_ROSTER_PUSH;
  process.env.LOGH_ROSTER_PUSH = '1';
  try {
    const session = ssAuthedSession({ characters: [{ id: 7, name: 'Yang' }] });
    assert.equal(session.phase, LOGIN_PHASES.SS_AUTHENTICATED);
    const game = session.onInnerMessage(Buffer.from('0205', 'hex')); // SSGameLoginRequest → 0x0206
    assert.equal(game.kind, 'ss-response');
    assert.equal(game.okInner.toString('hex'), '02060100'); // 0x0206 SSGameLoginOK unchanged
    assert.ok(Array.isArray(game.extraInners));
    const codes = game.extraInners.map((i) => i.readUInt16BE(4));
    assert.deepEqual(codes, [0x1200, 0x120f, 0x1201]);
    // The roster record carries the account character (id 7) and passes the gate (group 2).
    const entry = game.extraInners[1].subarray(6);
    assert.equal(entry.readUInt8(0), 1); // count
    assert.equal(entry.readUInt8(SIMPLE_INFO_CHARACTER_ENTRY_HEADER + 0x00), 2); // group byte
    assert.equal(entry.readUInt32LE(SIMPLE_INFO_CHARACTER_ENTRY_HEADER + 0x08), 7); // id
  } finally {
    if (previous === undefined) delete process.env.LOGH_ROSTER_PUSH;
    else process.env.LOGH_ROSTER_PUSH = previous;
  }
});

test('default (LOGH_ROSTER_PUSH unset) leaves the SSGameLoginOK path untouched (no roster extras)', () => {
  const previous = process.env.LOGH_ROSTER_PUSH;
  delete process.env.LOGH_ROSTER_PUSH;
  try {
    const session = ssAuthedSession({ characters: [{ id: 7 }] });
    const game = session.onInnerMessage(Buffer.from('0205', 'hex'));
    assert.equal(game.kind, 'ss-response');
    assert.equal(game.okInner.toString('hex'), '02060100');
    assert.equal(game.extraInners, undefined); // no transaction pushed by default
  } finally {
    if (previous !== undefined) process.env.LOGH_ROSTER_PUSH = previous;
  }
});
