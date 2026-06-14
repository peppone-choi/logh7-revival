/**
 * Social-domain tests — chat (SpotChat 0xf1d / SpotUnicastChat 0xf1e), mail (send/read/delete +
 * order-suggest), messenger (presence/IM/address book), settings (0xf16–0xf1b), and the
 * processSocial() accept/notify contract. Pure/synchronous: no live client.
 *
 * Wire facts asserted against docs/logh7-proto-social-account.md §3/§4/§6 and the fixed sizes in
 * WORLD_RESPONSE_OBJECT_SIZES (FUN_004b8b00).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  // codes
  COMMAND_SPOT_CHAT_CODE,
  COMMAND_SPOT_UNICAST_CHAT_CODE,
  COMMAND_SEND_MAIL_CODE,
  COMMAND_READ_MAIL_CODE,
  COMMAND_DELETE_MAIL_CODE,
  COMMAND_ORDER_SUGGEST_MAIL_CODE,
  COMMAND_MESSENGER_STATUS_CODE,
  COMMAND_MESSENGER_CODE,
  COMMAND_EXCHANGE_MAIL_ADDRESS_CODE,
  COMMAND_DELETE_MAIL_ADDRESS_CODE,
  COMMAND_SET_TOGETHER_CODE,
  COMMAND_SET_OFFLINE_DIRECTION_CODE,
  COMMAND_SET_RETURN_BASE_CODE,
  COMMAND_SET_WILL_MESSAGE_CODE,
  TRANSACTION_MAIL_END_CODE,
  NOTIFY_COMMAND_MAIL_CODE,
  SPOT_CHAT_BYTES,
  SPOT_UNICAST_CHAT_BYTES,
  SEND_MAIL_BYTES,
  NOTIFY_COMMAND_MAIL_BYTES,
  MESSENGER_BYTES,
  SET_TOGETHER_BYTES,
  MAX_CHAT_TEXT,
  // parsers
  parseInboundSpotChat,
  parseInboundSpotUnicastChat,
  parseInboundSendMail,
  parseInboundMailRef,
  parseInboundOrderMail,
  parseInboundMessengerStatus,
  parseInboundMessenger,
  parseInboundAddressCommand,
  parseInboundSetting,
  // builders
  buildCommandSpotChatInner,
  buildCommandSpotUnicastChatInner,
  buildMailRecordInner,
  buildMailStatusInner,
  buildNotifyCommandMailInner,
  buildMessengerInner,
  // state + process
  createSocialState,
  processSocial,
  isSocialCommandCode,
  SOCIAL_COMMAND_CODES,
} from '../../src/server/logh7-social.mjs';

// --- helpers ---------------------------------------------------------------

/** Raw client inner: [u16 BE code][body]. */
function rawInner(code, body) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(code & 0xffff, 0);
  return Buffer.concat([head, body]);
}

/** Encode a UTF-16LE string into `buf` at `charsOff`, length byte at `lenOff`. */
function putWide(buf, text, lenOff, charsOff) {
  const chars = Array.from(text);
  buf.writeUInt8(chars.length, lenOff);
  chars.forEach((c, i) => buf.writeUInt16LE(c.charCodeAt(0) & 0xffff, charsOff + i * 2));
}

/** The LE payload of an S->C inner sits after the 6-byte message32 prefix ([u32 0][u16 BE code]). */
function payloadOf(inner) {
  return inner.subarray(6);
}
function codeOf(inner) {
  return inner.readUInt16BE(4); // BE app code at offset 4 of the message32 wrapper
}

// ===========================================================================
// 1. CHAT parsers + builders (docs §3)
// ===========================================================================

test('parseInboundSpotChat reads time@0, spot@4, msgLen@8, message@10 (UTF-16LE)', () => {
  const body = Buffer.alloc(SPOT_CHAT_BYTES);
  body.writeUInt32LE(0x11223344, 0); // time
  body.writeUInt32LE(7, 4); // spot
  putWide(body, '안녕hi', 8, 10);
  const p = parseInboundSpotChat(rawInner(COMMAND_SPOT_CHAT_CODE, body));
  assert.equal(p.time, 0x11223344);
  assert.equal(p.spot, 7);
  assert.equal(p.msgLen, 4);
  assert.equal(p.text, '안녕hi');
});

test('parseInboundSpotChat returns null when too short', () => {
  assert.equal(parseInboundSpotChat(rawInner(COMMAND_SPOT_CHAT_CODE, Buffer.alloc(8))), null);
});

test('parseInboundSpotUnicastChat reads targetId@8, msgLen@0xc, message@0xe', () => {
  const body = Buffer.alloc(SPOT_UNICAST_CHAT_BYTES);
  body.writeUInt32LE(0xa0a0, 0); // time
  body.writeUInt32LE(0xb0b0, 4); // ctx
  body.writeUInt32LE(4242, 8); // targetId
  putWide(body, 'psst', 0x0c, 0x0e);
  const p = parseInboundSpotUnicastChat(rawInner(COMMAND_SPOT_UNICAST_CHAT_CODE, body));
  assert.equal(p.time, 0xa0a0);
  assert.equal(p.ctx, 0xb0b0);
  assert.equal(p.targetId, 4242);
  assert.equal(p.msgLen, 4);
  assert.equal(p.text, 'psst');
});

test('buildCommandSpotChatInner builds a 140-byte body, fields at the documented offsets', () => {
  const inner = buildCommandSpotChatInner({ text: 'hello', spot: 9, time: 0x55 });
  assert.equal(codeOf(inner), COMMAND_SPOT_CHAT_CODE);
  const p = payloadOf(inner);
  assert.equal(p.length, SPOT_CHAT_BYTES);
  assert.equal(p.readUInt32LE(0), 0x55); // time
  assert.equal(p.readUInt32LE(4), 9); // spot
  assert.equal(p.readUInt8(8), 5); // msgLen
  assert.equal(p.readUInt16LE(10), 'h'.charCodeAt(0)); // first wide char
  // round-trips through the parser
  assert.equal(parseInboundSpotChat(rawInner(COMMAND_SPOT_CHAT_CODE, Buffer.from(p))).text, 'hello');
});

test('buildCommandSpotUnicastChatInner builds 144 bytes with targetId@8, msg@0xe', () => {
  const inner = buildCommandSpotUnicastChatInner({ text: 'yo', ctx: 3, targetId: 77, time: 1 });
  assert.equal(codeOf(inner), COMMAND_SPOT_UNICAST_CHAT_CODE);
  const p = payloadOf(inner);
  assert.equal(p.length, SPOT_UNICAST_CHAT_BYTES);
  assert.equal(p.readUInt32LE(8), 77); // targetId
  assert.equal(p.readUInt8(0x0c), 2); // msgLen
  assert.equal(p.readUInt16LE(0x0e), 'y'.charCodeAt(0));
});

test('chat builders clamp message to MAX_CHAT_TEXT (65) wide chars', () => {
  const long = 'x'.repeat(200);
  const p = payloadOf(buildCommandSpotChatInner({ text: long }));
  assert.equal(p.readUInt8(8), MAX_CHAT_TEXT);
});

// ===========================================================================
// 2. MAIL parsers + builders (docs §6c–§6e)
// ===========================================================================

test('parseInboundSendMail reads recipientId@0, category@4, and keeps the raw 1884B record', () => {
  const body = Buffer.alloc(SEND_MAIL_BYTES);
  body.writeUInt32LE(555, 0); // recipientId
  body.writeUInt32LE(2, 4); // category
  putWide(body, 'subject', 8, 10);
  const p = parseInboundSendMail(rawInner(COMMAND_SEND_MAIL_CODE, body));
  assert.equal(p.recipientId, 555);
  assert.equal(p.category, 2);
  assert.equal(p.text, 'subject');
  assert.equal(p.raw.length, SEND_MAIL_BYTES);
});

test('parseInboundMailRef reads mailId@0 and index@4 (read/delete share the 300B shape)', () => {
  const body = Buffer.alloc(0x12c);
  body.writeUInt32LE(99, 0);
  body.writeUInt32LE(3, 4);
  const p = parseInboundMailRef(rawInner(COMMAND_READ_MAIL_CODE, body));
  assert.equal(p.mailId, 99);
  assert.equal(p.index, 3);
});

test('parseInboundOrderMail reads targetId@0, orderId@4', () => {
  const body = Buffer.alloc(0x264);
  body.writeUInt32LE(11, 0);
  body.writeUInt32LE(42, 4);
  const p = parseInboundOrderMail(rawInner(COMMAND_ORDER_SUGGEST_MAIL_CODE, body));
  assert.equal(p.targetId, 11);
  assert.equal(p.orderId, 42);
});

test('buildMailRecordInner builds a 1884B TransactionMailEnd, copies raw faithfully', () => {
  const raw = Buffer.alloc(SEND_MAIL_BYTES);
  raw.writeUInt32LE(0xdead, 0);
  raw.writeUInt32LE(0xbeef, 4);
  const inner = buildMailRecordInner({ raw });
  assert.equal(codeOf(inner), TRANSACTION_MAIL_END_CODE);
  const p = payloadOf(inner);
  assert.equal(p.length, SEND_MAIL_BYTES);
  assert.equal(p.readUInt32LE(0), 0xdead);
  assert.equal(p.readUInt32LE(4), 0xbeef);
});

test('buildMailStatusInner is a 1-byte status body', () => {
  const inner = buildMailStatusInner({ status: 1 });
  assert.equal(payloadOf(inner).length, 1);
  assert.equal(payloadOf(inner).readUInt8(0), 1);
});

test('buildNotifyCommandMailInner builds a 604B notify with targetId@0, senderId@4, orderId@8', () => {
  const inner = buildNotifyCommandMailInner({ targetId: 1, senderId: 2, orderId: 3, text: 'go' });
  assert.equal(codeOf(inner), NOTIFY_COMMAND_MAIL_CODE);
  const p = payloadOf(inner);
  assert.equal(p.length, NOTIFY_COMMAND_MAIL_BYTES);
  assert.equal(p.readUInt32LE(0), 1);
  assert.equal(p.readUInt32LE(4), 2);
  assert.equal(p.readUInt32LE(8), 3);
  assert.equal(p.readUInt8(0x0c), 2); // msgLen
});

// ===========================================================================
// 3. MESSENGER + address book parsers/builders (docs §6f)
// ===========================================================================

test('parseInboundMessengerStatus reads charId@0, status@4', () => {
  const body = Buffer.alloc(0x128);
  body.writeUInt32LE(7, 0);
  body.writeUInt32LE(2, 4); // away
  const p = parseInboundMessengerStatus(rawInner(COMMAND_MESSENGER_STATUS_CODE, body));
  assert.equal(p.charId, 7);
  assert.equal(p.status, 2);
});

test('parseInboundMessenger reads fromId@0, toId@4, wide text@10', () => {
  const body = Buffer.alloc(MESSENGER_BYTES);
  body.writeUInt32LE(1, 0);
  body.writeUInt32LE(2, 4);
  putWide(body, 'hey', 8, 10);
  const p = parseInboundMessenger(rawInner(COMMAND_MESSENGER_CODE, body));
  assert.equal(p.fromId, 1);
  assert.equal(p.toId, 2);
  assert.equal(p.text, 'hey');
});

test('buildMessengerInner builds a 1324B body, copies raw faithfully', () => {
  const raw = Buffer.alloc(MESSENGER_BYTES);
  raw.writeUInt32LE(0xcafe, 0);
  const inner = buildMessengerInner({ raw });
  assert.equal(codeOf(inner), COMMAND_MESSENGER_CODE);
  assert.equal(payloadOf(inner).length, MESSENGER_BYTES);
  assert.equal(payloadOf(inner).readUInt32LE(0), 0xcafe);
});

test('parseInboundAddressCommand reads ownerId@0, contactId@4', () => {
  const body = Buffer.alloc(0x24c);
  body.writeUInt32LE(10, 0);
  body.writeUInt32LE(20, 4);
  const p = parseInboundAddressCommand(rawInner(COMMAND_EXCHANGE_MAIL_ADDRESS_CODE, body));
  assert.equal(p.ownerId, 10);
  assert.equal(p.contactId, 20);
});

// ===========================================================================
// 4. SETTINGS parsers (docs §4)
// ===========================================================================

test('parseInboundSetting SetTogether (0xf16) reads charId@4, flag@8', () => {
  const body = Buffer.alloc(SET_TOGETHER_BYTES);
  body.writeUInt32LE(303, 4);
  body.writeUInt8(1, 8);
  const p = parseInboundSetting(rawInner(COMMAND_SET_TOGETHER_CODE, body));
  assert.equal(p.code, COMMAND_SET_TOGETHER_CODE);
  assert.equal(p.charId, 303);
  assert.equal(p.flag, 1);
});

test('parseInboundSetting SetOfflineDirection (0xf18) preserves ack id @4 + 4 dwords', () => {
  const body = Buffer.alloc(0x10);
  body.writeUInt32LE(1, 0);
  body.writeUInt32LE(0xACE, 4); // ack id echo
  body.writeUInt32LE(3, 8);
  body.writeUInt32LE(4, 12);
  const p = parseInboundSetting(rawInner(COMMAND_SET_OFFLINE_DIRECTION_CODE, body));
  assert.equal(p.ackId, 0xACE);
  assert.deepEqual(p.values, [1, 0xACE, 3, 4]);
});

test('parseInboundSetting SetReturnBase (0xf1a) reads 3 dwords', () => {
  const body = Buffer.alloc(0xc);
  body.writeUInt32LE(8, 8); // baseId
  const p = parseInboundSetting(rawInner(COMMAND_SET_RETURN_BASE_CODE, body));
  assert.deepEqual(p.values, [0, 0, 8]);
});

test('parseInboundSetting SetWillMessage (0xf17) reads charId@0 + wide text', () => {
  const body = Buffer.alloc(0x8c);
  body.writeUInt32LE(5, 0);
  putWide(body, 'farewell', 4, 6);
  const p = parseInboundSetting(rawInner(COMMAND_SET_WILL_MESSAGE_CODE, body));
  assert.equal(p.charId, 5);
  assert.equal(p.text, 'farewell');
});

test('parseInboundSetting returns null for a non-setting code', () => {
  assert.equal(parseInboundSetting(rawInner(0x0400, Buffer.alloc(16))), null);
});

// ===========================================================================
// 5. STATE factory
// ===========================================================================

test('createSocialState: join indexes charId->conn, mailbox store/read/delete, contacts, presence', () => {
  const s = createSocialState();
  s.join(1, 1001);
  s.join(2, 2002);
  assert.equal(s.connectionOfChar(2002), 2);
  // mailbox
  const m = s.storeMail(2, { text: 'hi' });
  assert.equal(s.getInbox(2).length, 1);
  assert.equal(s.markRead(2, m.id), true);
  assert.equal(s.getInbox(2)[0].read, true);
  assert.equal(s.deleteMail(2, m.id), true);
  assert.equal(s.getInbox(2).length, 0);
  assert.equal(s.deleteMail(2, m.id), false);
  // contacts
  assert.equal(s.addContact(1, 2002), true);
  assert.equal(s.addContact(1, 2002), false); // dup
  assert.deepEqual(s.getContacts(1), [2002]);
  assert.equal(s.removeContact(1, 2002), true);
  // presence
  assert.equal(s.setPresence(1, 2), 2);
  assert.equal(s.getPresence(1), 2);
  // leave clears the char index
  s.leave(2);
  assert.equal(s.connectionOfChar(2002), undefined);
});

// ===========================================================================
// 6. processSocial() accept / notify contract
// ===========================================================================

function freshState() {
  const s = createSocialState();
  s.join(1, 1001); // sender
  s.join(2, 2002); // recipient/target
  return s;
}

test('processSocial rejects when the connection is not in the social state', () => {
  const s = createSocialState();
  const r = processSocial({ state: s, connectionId: 99, innerCode: COMMAND_SPOT_CHAT_CODE, inner: rawInner(COMMAND_SPOT_CHAT_CODE, Buffer.alloc(140)) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'not-in-world');
});

test('processSocial SpotChat 0xf1d broadcasts to others', () => {
  const s = freshState();
  const body = Buffer.alloc(SPOT_CHAT_BYTES);
  body.writeUInt32LE(5, 4); // spot
  putWide(body, 'team!', 8, 10);
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_SPOT_CHAT_CODE, inner: rawInner(COMMAND_SPOT_CHAT_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.notifies.length, 1);
  assert.equal(r.notifies[0].target, 'others');
  assert.equal(codeOf(r.notifies[0].inner), COMMAND_SPOT_CHAT_CODE);
});

test('processSocial SpotChat rejects empty message', () => {
  const s = freshState();
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_SPOT_CHAT_CODE, inner: rawInner(COMMAND_SPOT_CHAT_CODE, Buffer.alloc(SPOT_CHAT_BYTES)) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'empty-chat');
});

test('processSocial SpotUnicastChat 0xf1e whispers to the target connection only', () => {
  const s = freshState();
  const body = Buffer.alloc(SPOT_UNICAST_CHAT_BYTES);
  body.writeUInt32LE(2002, 8); // targetId == char 2 (conn 2)
  putWide(body, 'secret', 0x0c, 0x0e);
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_SPOT_UNICAST_CHAT_CODE, inner: rawInner(COMMAND_SPOT_UNICAST_CHAT_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.delivered, true);
  assert.equal(r.targetConnectionId, 2);
  assert.equal(r.notifies[0].targetConnectionId, 2);
  assert.equal(codeOf(r.notifies[0].inner), COMMAND_SPOT_UNICAST_CHAT_CODE);
});

test('processSocial SpotUnicastChat to an offline target accepts with no delivery', () => {
  const s = freshState();
  const body = Buffer.alloc(SPOT_UNICAST_CHAT_BYTES);
  body.writeUInt32LE(9999, 8); // unknown char
  putWide(body, 'hi', 0x0c, 0x0e);
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_SPOT_UNICAST_CHAT_CODE, inner: rawInner(COMMAND_SPOT_UNICAST_CHAT_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.delivered, false);
  assert.equal(r.notifies.length, 0);
});

test('processSocial SendMail 0xf10 stores + delivers when recipient is online', () => {
  const s = freshState();
  const body = Buffer.alloc(SEND_MAIL_BYTES);
  body.writeUInt32LE(2002, 0); // recipient char == conn 2
  putWide(body, 'orders', 8, 10);
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_SEND_MAIL_CODE, inner: rawInner(COMMAND_SEND_MAIL_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.delivered, true);
  assert.equal(s.getInbox(2).length, 1); // stored in the recipient connection's box
  assert.equal(r.notifies[0].targetConnectionId, 2);
  assert.equal(codeOf(r.notifies[0].inner), TRANSACTION_MAIL_END_CODE);
});

test('processSocial SendMail to offline recipient stores by char id, no delivery', () => {
  const s = freshState();
  const body = Buffer.alloc(SEND_MAIL_BYTES);
  body.writeUInt32LE(7777, 0); // offline char
  putWide(body, 'later', 8, 10);
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_SEND_MAIL_CODE, inner: rawInner(COMMAND_SEND_MAIL_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.delivered, false);
  assert.equal(s.getInbox(7777).length, 1); // stored keyed by char id for later login
  assert.equal(r.notifies.length, 0);
});

test('processSocial ReadMail/DeleteMail mutate the mailbox', () => {
  const s = freshState();
  const m = s.storeMail(1, { text: 'x' });
  const readBody = Buffer.alloc(0x12c);
  readBody.writeUInt32LE(m.id, 0);
  let r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_READ_MAIL_CODE, inner: rawInner(COMMAND_READ_MAIL_CODE, readBody) });
  assert.equal(r.accept, true);
  assert.equal(s.getInbox(1)[0].read, true);
  r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_DELETE_MAIL_CODE, inner: rawInner(COMMAND_DELETE_MAIL_CODE, readBody) });
  assert.equal(r.accept, true);
  assert.equal(s.getInbox(1).length, 0);
});

test('processSocial ReadMail of a non-existent mail rejects', () => {
  const s = freshState();
  const body = Buffer.alloc(0x12c);
  body.writeUInt32LE(404, 0);
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_READ_MAIL_CODE, inner: rawInner(COMMAND_READ_MAIL_CODE, body) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'no-such-mail');
});

test('processSocial OrderSuggestMail 0xf13 notifies the target with NotifyCommandMail 0xf15', () => {
  const s = freshState();
  const body = Buffer.alloc(0x264);
  body.writeUInt32LE(2002, 0); // target char == conn 2
  body.writeUInt32LE(42, 4); // orderId
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_ORDER_SUGGEST_MAIL_CODE, inner: rawInner(COMMAND_ORDER_SUGGEST_MAIL_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.targetConnectionId, 2);
  assert.equal(codeOf(r.notifies[0].inner), NOTIFY_COMMAND_MAIL_CODE);
});

test('processSocial MessengerStatus 0xf0d sets presence', () => {
  const s = freshState();
  const body = Buffer.alloc(0x128);
  body.writeUInt32LE(1001, 0);
  body.writeUInt32LE(3, 4); // busy
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_MESSENGER_STATUS_CODE, inner: rawInner(COMMAND_MESSENGER_STATUS_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(s.getPresence(1), 3);
});

test('processSocial Messenger 0xf0f relays the IM to the peer connection', () => {
  const s = freshState();
  const body = Buffer.alloc(MESSENGER_BYTES);
  body.writeUInt32LE(1001, 0);
  body.writeUInt32LE(2002, 4); // to char == conn 2
  putWide(body, 'ping', 8, 10);
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_MESSENGER_CODE, inner: rawInner(COMMAND_MESSENGER_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.targetConnectionId, 2);
  assert.equal(codeOf(r.notifies[0].inner), COMMAND_MESSENGER_CODE);
});

test('processSocial address book exchange 0xf0b / delete 0xf0c mutate contacts', () => {
  const s = freshState();
  const body = Buffer.alloc(0x24c);
  body.writeUInt32LE(1001, 0);
  body.writeUInt32LE(2002, 4);
  let r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_EXCHANGE_MAIL_ADDRESS_CODE, inner: rawInner(COMMAND_EXCHANGE_MAIL_ADDRESS_CODE, body) });
  assert.equal(r.accept, true);
  assert.deepEqual(s.getContacts(1), [2002]);
  const delBody = Buffer.alloc(0x124);
  delBody.writeUInt32LE(1001, 0);
  delBody.writeUInt32LE(2002, 4);
  r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_DELETE_MAIL_ADDRESS_CODE, inner: rawInner(COMMAND_DELETE_MAIL_ADDRESS_CODE, delBody) });
  assert.equal(r.accept, true);
  assert.deepEqual(s.getContacts(1), []);
});

test('processSocial SetTogether 0xf16 applies + broadcasts the group flag to others', () => {
  const s = freshState();
  const body = Buffer.alloc(SET_TOGETHER_BYTES);
  body.writeUInt32LE(1001, 4); // charId
  body.writeUInt8(1, 8); // flag
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_SET_TOGETHER_CODE, inner: rawInner(COMMAND_SET_TOGETHER_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.notifies.length, 1);
  assert.equal(r.notifies[0].target, 'others');
  assert.equal(codeOf(r.notifies[0].inner), COMMAND_SET_TOGETHER_CODE);
  assert.deepEqual(s.getSettings(1).together, { charId: 1001, flag: 1 });
});

test('processSocial SetOfflineDirection 0xf18 applies privately (no broadcast), keeps ack id', () => {
  const s = freshState();
  const body = Buffer.alloc(0x10);
  body.writeUInt32LE(0xACE, 4); // ack id
  body.writeUInt32LE(2, 8);
  const r = processSocial({ state: s, connectionId: 1, innerCode: COMMAND_SET_OFFLINE_DIRECTION_CODE, inner: rawInner(COMMAND_SET_OFFLINE_DIRECTION_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(r.ackId, 0xACE);
  assert.equal(r.notifies.length, 0); // private setting
  assert.deepEqual(s.getSettings(1).offlineDirection, [0, 0xACE, 2, 0]);
});

test('processSocial rejects an unknown code', () => {
  const s = freshState();
  const r = processSocial({ state: s, connectionId: 1, innerCode: 0x0400, inner: rawInner(0x0400, Buffer.alloc(16)) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'unknown-social-command');
});

// ===========================================================================
// 7. routing helpers
// ===========================================================================

test('isSocialCommandCode owns the social range and not combat codes', () => {
  assert.equal(isSocialCommandCode(COMMAND_SPOT_CHAT_CODE), true);
  assert.equal(isSocialCommandCode(COMMAND_SET_TOGETHER_CODE), true);
  assert.equal(isSocialCommandCode(COMMAND_MESSENGER_CODE), true);
  assert.equal(isSocialCommandCode(0x0400), false); // CommandMoveShip — combat domain
  assert.equal(isSocialCommandCode(0x0f1c), false); // GridChat is the command-engine's, not ours
  assert.ok(SOCIAL_COMMAND_CODES.has(COMMAND_DELETE_MAIL_CODE));
});
