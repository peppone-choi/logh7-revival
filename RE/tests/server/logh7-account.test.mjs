/**
 * Account / character-entitlement domain tests (Lane D) — the S->C record builders
 * (ResponseInformationAccount 0x1001, ResponseUnChargeCharacter 0x1003, ResponseCharacterEntryState
 * 0x1005), the social remainder builders (mail-address roster 0x0f05, messenger roster 0x0f07,
 * mail-transfer Begin 0x0f08 / status 0x0f09, canonical SpotChat 0x0f1d), the C->S charge parsers
 * (0x1006 / 0x1007), and the processAccount() validate→mutate→reply contract.
 *
 * Wire facts asserted against docs/logh7-proto-social-account.md §5/§1/§6/§3 and the fixed sizes in
 * WORLD_RESPONSE_OBJECT_SIZES (FUN_004b8b00). Pure/synchronous: no live client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  // codes
  RESPONSE_INFORMATION_ACCOUNT_CODE,
  RESPONSE_UNCHARGE_CHARACTER_CODE,
  RESPONSE_CHARACTER_ENTRY_STATE_CODE,
  COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE,
  COMMAND_EXTENSION_CHARACTER_CHARGE_CODE,
  RESPONSE_MAIL_ADDRESS_CODE,
  RESPONSE_MESSENGER_STATUS_CODE,
  TRANSACTION_MAIL_BEGIN_CODE,
  TRANSACTION_MAIL_STATUS_CODE,
  COMMAND_SPOT_CHAT_CODE,
  // sizes
  RESPONSE_INFORMATION_ACCOUNT_BYTES,
  RESPONSE_UNCHARGE_CHARACTER_BYTES,
  RESPONSE_CHARACTER_ENTRY_STATE_BYTES,
  COMMAND_ORIGINAL_CHARACTER_CHARGE_BYTES,
  COMMAND_EXTENSION_CHARACTER_CHARGE_BYTES,
  RESPONSE_MAIL_ADDRESS_BYTES,
  RESPONSE_MESSENGER_STATUS_BYTES,
  TRANSACTION_MAIL_BEGIN_BYTES,
  TRANSACTION_MAIL_STATUS_BYTES,
  SPOT_CHAT_BYTES,
  MAX_UNCHARGE_ROWS,
  MAX_CHAT_TEXT,
  // builders
  buildResponseInformationAccountInner,
  buildResponseUnChargeCharacterInner,
  buildResponseCharacterEntryStateInner,
  buildResponseMailAddressInner,
  buildResponseMessengerStatusInner,
  buildTransactionMailBeginInner,
  buildTransactionMailStatusInner,
  buildCommandSpotChatInner,
  // parsers
  parseInboundOriginalCharacterCharge,
  parseInboundExtensionCharacterCharge,
  // state + process
  createAccountState,
  processAccount,
  isAccountCommandCode,
  ACCOUNT_COMMAND_CODES,
  buildAccountEntrySequence,
} from '../../src/server/logh7-account.mjs';

// Mirror of the framing: buildLobbyResponseInner => [u32 0][u16 BE code][LE payload]. So inner length
// = 6 + bodySize, the code is BE @4, and subarray(6) is the LE payload.
function assertRecord(inner, code, bodySize) {
  assert.equal(inner.length, 6 + bodySize, `inner length for code 0x${code.toString(16)}`);
  assert.equal(inner.readUInt32BE(0), 0, 'message32 prefix is zero');
  assert.equal(inner.readUInt16BE(4), code, `BE code @4 = 0x${code.toString(16)}`);
}

/** Build a raw C->S inner [u16 BE code][LE body] for the charge parsers. */
function makeInner(code, body) {
  const inner = Buffer.alloc(2 + body.length);
  inner.writeUInt16BE(code & 0xffff, 0);
  body.copy(inner, 2);
  return inner;
}

// ---------------------------------------------------------------------------
// 1. Body-size fidelity (every size mirrors WORLD_RESPONSE_OBJECT_SIZES / FUN_004b8b00)
// ---------------------------------------------------------------------------

test('account/social record sizes match the dispatch table', () => {
  assert.equal(RESPONSE_INFORMATION_ACCOUNT_BYTES, 0x1c0);
  assert.equal(RESPONSE_UNCHARGE_CHARACTER_BYTES, 0xfa4);
  assert.equal(RESPONSE_CHARACTER_ENTRY_STATE_BYTES, 0x20);
  assert.equal(COMMAND_ORIGINAL_CHARACTER_CHARGE_BYTES, 0x18);
  assert.equal(COMMAND_EXTENSION_CHARACTER_CHARGE_BYTES, 0x08);
  assert.equal(RESPONSE_MAIL_ADDRESS_BYTES, 0x7214);
  assert.equal(RESPONSE_MESSENGER_STATUS_BYTES, 0x74cc);
  assert.equal(TRANSACTION_MAIL_BEGIN_BYTES, 0x128);
  assert.equal(TRANSACTION_MAIL_STATUS_BYTES, 1);
  assert.equal(SPOT_CHAT_BYTES, 0x8c);
});

// ---------------------------------------------------------------------------
// 2. ResponseInformationAccount 0x1001
// ---------------------------------------------------------------------------

test('buildResponseInformationAccountInner frames + pins the account-card anchors', () => {
  const inner = buildResponseInformationAccountInner({
    accountId: 0x1234,
    name: 'ADMIRAL',
    ownedCharacterCount: 3,
    chargeState: 2,
    maxCharacters: 8,
  });
  assertRecord(inner, RESPONSE_INFORMATION_ACCOUNT_CODE, RESPONSE_INFORMATION_ACCOUNT_BYTES);
  const p = inner.subarray(6);
  assert.equal(p.readUInt32LE(0x00), 0x1234);
  assert.equal(p.readUInt32LE(0x04), 3);
  assert.equal(p.readUInt32LE(0x08), 2);
  assert.equal(p.readUInt32LE(0x0c), 8);
  // name = UTF-16LE pascal (len@0x10, chars@0x12)
  assert.equal(p.readUInt8(0x10), 'ADMIRAL'.length);
  assert.equal(p.readUInt16LE(0x12), 'A'.charCodeAt(0));
});

test('buildResponseInformationAccountInner defaults produce a zero card of the right size', () => {
  const inner = buildResponseInformationAccountInner();
  assertRecord(inner, RESPONSE_INFORMATION_ACCOUNT_CODE, RESPONSE_INFORMATION_ACCOUNT_BYTES);
  assert.equal(inner.subarray(6).readUInt32LE(0), 0);
});

// ---------------------------------------------------------------------------
// 3. ResponseUnChargeCharacter 0x1003
// ---------------------------------------------------------------------------

test('buildResponseUnChargeCharacterInner writes [u16 count][u32 ids]', () => {
  const inner = buildResponseUnChargeCharacterInner({ available: [0x1001, 0x1002, 0x1003] });
  assertRecord(inner, RESPONSE_UNCHARGE_CHARACTER_CODE, RESPONSE_UNCHARGE_CHARACTER_BYTES);
  const p = inner.subarray(6);
  assert.equal(p.readUInt16LE(0), 3);
  assert.equal(p.readUInt32LE(2), 0x1001);
  assert.equal(p.readUInt32LE(6), 0x1002);
  assert.equal(p.readUInt32LE(10), 0x1003);
});

test('buildResponseUnChargeCharacterInner clamps to the buffer capacity', () => {
  const big = Array.from({ length: MAX_UNCHARGE_ROWS + 50 }, (_, i) => i + 1);
  const inner = buildResponseUnChargeCharacterInner({ available: big });
  assertRecord(inner, RESPONSE_UNCHARGE_CHARACTER_CODE, RESPONSE_UNCHARGE_CHARACTER_BYTES);
  assert.equal(inner.subarray(6).readUInt16LE(0), MAX_UNCHARGE_ROWS);
});

// ---------------------------------------------------------------------------
// 4. ResponseCharacterEntryState 0x1005
// ---------------------------------------------------------------------------

test('buildResponseCharacterEntryStateInner pins the 8-dword entry block', () => {
  const inner = buildResponseCharacterEntryStateInner({
    activeCharacterId: 0x1001,
    entered: 1,
    availableSlots: 5,
    ownedCount: 2,
    flags: [9, 8, 7, 6],
  });
  assertRecord(inner, RESPONSE_CHARACTER_ENTRY_STATE_CODE, RESPONSE_CHARACTER_ENTRY_STATE_BYTES);
  const p = inner.subarray(6);
  assert.equal(p.readUInt32LE(0x00), 0x1001);
  assert.equal(p.readUInt32LE(0x04), 1);
  assert.equal(p.readUInt32LE(0x08), 5);
  assert.equal(p.readUInt32LE(0x0c), 2);
  assert.equal(p.readUInt32LE(0x10), 9);
  assert.equal(p.readUInt32LE(0x1c), 6);
});

// ---------------------------------------------------------------------------
// 5. Charge parsers (0x1006 / 0x1007)
// ---------------------------------------------------------------------------

test('parseInboundOriginalCharacterCharge reads the target char id + 6 dwords', () => {
  const body = Buffer.alloc(COMMAND_ORIGINAL_CHARACTER_CHARGE_BYTES);
  body.writeUInt32LE(0x1001, 0x00);
  body.writeUInt32LE(0xaa, 0x04);
  body.writeUInt32LE(0xbb, 0x14);
  const parsed = parseInboundOriginalCharacterCharge(makeInner(COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE, body));
  assert.equal(parsed.characterId, 0x1001);
  assert.equal(parsed.dwords.length, 6);
  assert.equal(parsed.dwords[1], 0xaa);
  assert.equal(parsed.dwords[5], 0xbb);
});

test('parseInboundOriginalCharacterCharge rejects a too-short body', () => {
  assert.equal(parseInboundOriginalCharacterCharge(makeInner(COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE, Buffer.alloc(2))), null);
});

test('parseInboundExtensionCharacterCharge reads slotId + aux (2 dwords)', () => {
  const body = Buffer.alloc(COMMAND_EXTENSION_CHARACTER_CHARGE_BYTES);
  body.writeUInt32LE(0x2002, 0x00);
  body.writeUInt32LE(0x42, 0x04);
  const parsed = parseInboundExtensionCharacterCharge(makeInner(COMMAND_EXTENSION_CHARACTER_CHARGE_CODE, body));
  assert.deepEqual(parsed, { slotId: 0x2002, aux: 0x42 });
});

test('parseInboundExtensionCharacterCharge rejects a too-short body', () => {
  assert.equal(parseInboundExtensionCharacterCharge(makeInner(COMMAND_EXTENSION_CHARACTER_CHARGE_CODE, Buffer.alloc(4))), null);
});

// ---------------------------------------------------------------------------
// 6. Social remainder builders (0x0f05 / 0x0f07 / 0x0f08 / 0x0f09 / 0x0f1d)
// ---------------------------------------------------------------------------

test('buildResponseMailAddressInner frames + writes the contact count/ids', () => {
  const inner = buildResponseMailAddressInner({ contacts: [11, 22] });
  assertRecord(inner, RESPONSE_MAIL_ADDRESS_CODE, RESPONSE_MAIL_ADDRESS_BYTES);
  const p = inner.subarray(6);
  assert.equal(p.readUInt16LE(0), 2);
  assert.equal(p.readUInt32LE(2), 11);
  assert.equal(p.readUInt32LE(6), 22);
});

test('buildResponseMessengerStatusInner frames + writes [charId,status] rows', () => {
  const inner = buildResponseMessengerStatusInner({ entries: [{ charId: 0x1001, status: 1 }, { charId: 0x1002, status: 2 }] });
  assertRecord(inner, RESPONSE_MESSENGER_STATUS_CODE, RESPONSE_MESSENGER_STATUS_BYTES);
  const p = inner.subarray(6);
  assert.equal(p.readUInt16LE(0), 2);
  assert.equal(p.readUInt32LE(2), 0x1001);
  assert.equal(p.readUInt32LE(6), 1);
  assert.equal(p.readUInt32LE(10), 0x1002);
  assert.equal(p.readUInt32LE(14), 2);
});

test('buildTransactionMailBeginInner frames the begin header', () => {
  const inner = buildTransactionMailBeginInner({ transferId: 7, mailCount: 4 });
  assertRecord(inner, TRANSACTION_MAIL_BEGIN_CODE, TRANSACTION_MAIL_BEGIN_BYTES);
  assert.equal(inner.subarray(6).readUInt32LE(0), 7);
  assert.equal(inner.subarray(6).readUInt32LE(4), 4);
});

test('buildTransactionMailStatusInner is a single status byte', () => {
  const inner = buildTransactionMailStatusInner({ status: 1 });
  assertRecord(inner, TRANSACTION_MAIL_STATUS_CODE, TRANSACTION_MAIL_STATUS_BYTES);
  assert.equal(inner.subarray(6).readUInt8(0), 1);
});

test('buildCommandSpotChatInner emits the 140B receive form (msgLen@8, msg@10)', () => {
  const inner = buildCommandSpotChatInner({ text: 'hi', spot: 3, time: 99 });
  assertRecord(inner, COMMAND_SPOT_CHAT_CODE, SPOT_CHAT_BYTES);
  const p = inner.subarray(6);
  assert.equal(p.readUInt32LE(0), 99);
  assert.equal(p.readUInt32LE(4), 3);
  assert.equal(p.readUInt8(8), 2); // msgLen
  assert.equal(p.readUInt16LE(10), 'h'.charCodeAt(0));
  assert.equal(p.readUInt16LE(12), 'i'.charCodeAt(0));
});

test('buildCommandSpotChatInner clamps text to MAX_CHAT_TEXT', () => {
  const inner = buildCommandSpotChatInner({ text: 'x'.repeat(200) });
  assert.equal(inner.subarray(6).readUInt8(8), MAX_CHAT_TEXT);
});

// ---------------------------------------------------------------------------
// 7. State factory
// ---------------------------------------------------------------------------

test('createAccountState join/leave/snapshots track the entitlement table', () => {
  const state = createAccountState();
  state.join(1, { accountId: 0x99, name: 'X', owned: [0x1001], available: [0x1002, 0x1003], maxExtensionSlots: 2 });
  assert.ok(state.has(1));
  assert.deepEqual(state.availableRoster(1).sort(), [0x1002, 0x1003]);
  const card = state.accountCard(1);
  assert.equal(card.accountId, 0x99);
  assert.equal(card.ownedCharacterCount, 1);
  assert.equal(card.maxCharacters, 2);
  state.leave(1);
  assert.equal(state.has(1), false);
});

test('chargeOriginal moves an available char to owned + active, rejects unavailable', () => {
  const state = createAccountState();
  // Seed TWO available chars so the roster stays non-empty after the first charge — otherwise an empty
  // available set is treated as an OPEN roster (any char allowed) by design.
  state.join(1, { available: [0x1002, 0x1004] });
  const ok = state.chargeOriginal(1, 0x1002);
  assert.equal(ok.ok, true);
  assert.equal(state.entryState(1).activeCharacterId, 0x1002);
  assert.deepEqual(state.availableRoster(1), [0x1004]);
  const bad = state.chargeOriginal(1, 0x9999);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'not-available');
});

test('chargeExtension respects the entitlement cap', () => {
  const state = createAccountState();
  state.join(1, { maxExtensionSlots: 1 });
  assert.equal(state.chargeExtension(1, 0x10).ok, true);
  const second = state.chargeExtension(1, 0x11);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'no-entitlement');
});

// ---------------------------------------------------------------------------
// 8. process contract (0x1006 / 0x1007 → reply 0x1005 + 0x1001)
// ---------------------------------------------------------------------------

test('isAccountCommandCode + ACCOUNT_COMMAND_CODES cover the two charge commands only', () => {
  assert.equal(isAccountCommandCode(COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE), true);
  assert.equal(isAccountCommandCode(COMMAND_EXTENSION_CHARACTER_CHARGE_CODE), true);
  assert.equal(isAccountCommandCode(0x1008), false); // 0x1008 (CREATE) is owned by login-protocol
  assert.equal(ACCOUNT_COMMAND_CODES.size, 2);
});

test('processAccount rejects a command from a connection not in world', () => {
  const state = createAccountState();
  const body = Buffer.alloc(COMMAND_ORIGINAL_CHARACTER_CHARGE_BYTES);
  body.writeUInt32LE(0x1001, 0);
  const res = processAccount({ state, connectionId: 7, innerCode: COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE, inner: makeInner(COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE, body) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'not-in-world');
  assert.deepEqual(res.notifies, []);
});

test('processAccount 0x1006 charges then replies 0x1005 + 0x1001 to self', () => {
  const state = createAccountState();
  state.join(1, { accountId: 0x55, available: [0x1001] });
  const body = Buffer.alloc(COMMAND_ORIGINAL_CHARACTER_CHARGE_BYTES);
  body.writeUInt32LE(0x1001, 0);
  const res = processAccount({ state, connectionId: 1, innerCode: COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE, inner: makeInner(COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(res.characterId, 0x1001);
  assert.equal(res.notifies.length, 2);
  assert.equal(res.notifies[0].target, 'self');
  assertRecord(res.notifies[0].inner, RESPONSE_CHARACTER_ENTRY_STATE_CODE, RESPONSE_CHARACTER_ENTRY_STATE_BYTES);
  assertRecord(res.notifies[1].inner, RESPONSE_INFORMATION_ACCOUNT_CODE, RESPONSE_INFORMATION_ACCOUNT_BYTES);
  // the entry-state reply reflects the now-active char
  assert.equal(res.notifies[0].inner.subarray(6).readUInt32LE(0x00), 0x1001);
  // mutated state: active char set
  assert.equal(state.entryState(1).activeCharacterId, 0x1001);
});

test('processAccount 0x1006 rejects an unavailable character', () => {
  const state = createAccountState();
  state.join(1, { available: [0x1001] });
  const body = Buffer.alloc(COMMAND_ORIGINAL_CHARACTER_CHARGE_BYTES);
  body.writeUInt32LE(0x9999, 0);
  const res = processAccount({ state, connectionId: 1, innerCode: COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE, inner: makeInner(COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE, body) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'not-available');
});

test('processAccount 0x1007 charges an extension then replies 0x1005 + 0x1001', () => {
  const state = createAccountState();
  state.join(1, { maxExtensionSlots: 1 });
  const body = Buffer.alloc(COMMAND_EXTENSION_CHARACTER_CHARGE_BYTES);
  body.writeUInt32LE(0x2002, 0);
  const res = processAccount({ state, connectionId: 1, innerCode: COMMAND_EXTENSION_CHARACTER_CHARGE_CODE, inner: makeInner(COMMAND_EXTENSION_CHARACTER_CHARGE_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(res.slotId, 0x2002);
  assert.equal(res.notifies.length, 2);
  assertRecord(res.notifies[0].inner, RESPONSE_CHARACTER_ENTRY_STATE_CODE, RESPONSE_CHARACTER_ENTRY_STATE_BYTES);
  assertRecord(res.notifies[1].inner, RESPONSE_INFORMATION_ACCOUNT_CODE, RESPONSE_INFORMATION_ACCOUNT_BYTES);
});

test('processAccount 0x1007 rejects when the entitlement is exhausted', () => {
  const state = createAccountState();
  state.join(1, { maxExtensionSlots: 1 });
  state.chargeExtension(1, 0x10);
  const body = Buffer.alloc(COMMAND_EXTENSION_CHARACTER_CHARGE_BYTES);
  const res = processAccount({ state, connectionId: 1, innerCode: COMMAND_EXTENSION_CHARACTER_CHARGE_CODE, inner: makeInner(COMMAND_EXTENSION_CHARACTER_CHARGE_CODE, body) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'no-entitlement');
});

test('processAccount rejects an unknown code', () => {
  const state = createAccountState();
  state.join(1, {});
  const res = processAccount({ state, connectionId: 1, innerCode: 0x1008, inner: makeInner(0x1008, Buffer.alloc(8)) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'unknown-account-command');
});

// ---------------------------------------------------------------------------
// 9. world-entry sequence
// ---------------------------------------------------------------------------

test('buildAccountEntrySequence emits 0x1003 + 0x1005 + 0x1001 to self', () => {
  const state = createAccountState();
  state.join(1, { accountId: 0x77, available: [0x1001, 0x1002] });
  const seq = buildAccountEntrySequence(state, 1);
  assert.equal(seq.length, 3);
  assert.ok(seq.every((n) => n.target === 'self'));
  assertRecord(seq[0].inner, RESPONSE_UNCHARGE_CHARACTER_CODE, RESPONSE_UNCHARGE_CHARACTER_BYTES);
  assertRecord(seq[1].inner, RESPONSE_CHARACTER_ENTRY_STATE_CODE, RESPONSE_CHARACTER_ENTRY_STATE_BYTES);
  assertRecord(seq[2].inner, RESPONSE_INFORMATION_ACCOUNT_CODE, RESPONSE_INFORMATION_ACCOUNT_BYTES);
  // the roster reply carries both available ids
  assert.equal(seq[0].inner.subarray(6).readUInt16LE(0), 2);
});
