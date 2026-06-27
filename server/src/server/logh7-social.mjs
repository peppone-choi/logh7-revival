/**
 * Authoritative SOCIAL domain — mail / messenger / settings / spot-chat (0x0f0b–0x0f1e).
 *
 * The LOGH VII client carries a whole social layer on top of the combat/내정 core: in-game mail
 * (compose / read / delete + the order-suggest mail subsystem), a messenger (presence roster + 1:1
 * IM sessions + an address book), per-character play settings (group toggle, offline standing orders,
 * supply priority, return base, will message, private tax rate), and two more chat scopes that are
 * siblings of the already-done GridChat 0x0f1c — SpotChat 0x0f1d (broadcast to a spot/grid) and
 * SpotUnicastChat 0x0f1e (whisper to one character). The client both SENDS these (its UI builds the
 * body) and ACCEPTS them back on conn3 (the FUN_004ba2b0 apply path), so for the relayed forms the
 * server's job is: validate → store/apply → rebroadcast the SAME byte layout (identical in both
 * directions). This module owns that authority for the social domain.
 *
 * SELF-CONTAINED: it exports its own message CODES, parse/build functions (parseInbound*, buildNotify*,
 * build*Record), a createSocialState() in-memory factory, and a processSocial(ctx) entry that returns the
 * standard { accept, reject?, notifies: [{ inner, target }] } decision the lead wires into the command
 * engine. It only imports the framing helpers (buildLobbyResponseInner / buildMpsClientMessage32Inner)
 * from logh7-login-protocol.mjs; it does NOT touch the command-engine / world-state / login-protocol.
 *
 * WIRE EVIDENCE: docs/logh7-proto-social-account.md (§3 chat, §4 settings, §6 mail/messenger) — all
 * sizes mirror WORLD_RESPONSE_OBJECT_SIZES (FUN_004b8b00) and the FUN_004ba2b0 apply copy-counts.
 * Bodies are LITTLE-ENDIAN; only the 2-byte inner code prefix is big-endian. Chat text is UTF-16LE.
 *
 * Pure + synchronous ⇒ fully unit-testable without a live client.
 */

import { buildLobbyResponseInner } from './logh7-login-protocol.mjs';

// ---------------------------------------------------------------------------
// Message codes (docs/logh7-proto-social-account.md §1 master table)
// ---------------------------------------------------------------------------

// --- address book / messenger (0xf0b–0xf0f) ---
export const COMMAND_EXCHANGE_MAIL_ADDRESS_CODE = 0x0f0b; // 0x24c (588)
export const COMMAND_DELETE_MAIL_ADDRESS_CODE = 0x0f0c; // 0x124 (292)
export const COMMAND_MESSENGER_STATUS_CODE = 0x0f0d; // 0x128 (296) — set own presence
export const COMMAND_MESSENGER_CONNECTION_CODE = 0x0f0e; // 0x250 (592) — open/accept 1:1 session
export const COMMAND_MESSENGER_CODE = 0x0f0f; // 0x52c (1324) — live IM payload (text ≤512)

// --- mail (0xf08–0xf15) ---
export const TRANSACTION_MAIL_BEGIN_CODE = 0x0f08; // 0x128 (296) S->C mail xfer begin
export const TRANSACTION_MAIL_STATUS_CODE = 0x0f09; // 1 byte S->C status
export const TRANSACTION_MAIL_END_CODE = 0x0f0a; // 0x75c (1884) S->C mail xfer end (== a mail record)
export const COMMAND_SEND_MAIL_CODE = 0x0f10; // 0x75c (1884) C->S send a mail
export const COMMAND_READ_MAIL_CODE = 0x0f11; // 0x12c (300) C->S read a mail by id
export const COMMAND_DELETE_MAIL_CODE = 0x0f12; // 0x12c (300) C->S delete a mail by id
export const COMMAND_ORDER_SUGGEST_MAIL_CODE = 0x0f13; // 0x264 (612) C->S compose an order/suggestion
export const COMMAND_REPLY_ORDER_SUGGEST_MAIL_CODE = 0x0f14; // 0x25c (604) C->S reply to order mail
export const NOTIFY_COMMAND_MAIL_CODE = 0x0f15; // 0x25c (604) S->C order-mail arrived notify

// --- settings (0xf16–0xf1b) ---
export const COMMAND_SET_TOGETHER_CODE = 0x0f16; // 0xc (12)
export const COMMAND_SET_WILL_MESSAGE_CODE = 0x0f17; // 0x8c (140)
export const COMMAND_SET_OFFLINE_DIRECTION_CODE = 0x0f18; // 0x10 (16)
export const COMMAND_SET_UNIT_DISTRIBUTE_PRIORITY_CODE = 0x0f19; // 0x10 (16)
export const COMMAND_SET_RETURN_BASE_CODE = 0x0f1a; // 0xc (12)
export const COMMAND_SET_PRIVATE_ACCOUNT_RATE_CODE = 0x0f1b; // 0xc (12)

// --- chat scopes (siblings of GridChat 0x0f1c) ---
export const COMMAND_SPOT_CHAT_CODE = 0x0f1d; // 0x8c (140) bidir — broadcast to the sender's spot
export const COMMAND_SPOT_UNICAST_CHAT_CODE = 0x0f1e; // 0x90 (144) bidir — whisper to targetId

// --- S->C roster pushes ---
export const RESPONSE_MAIL_ADDRESS_CODE = 0x0f05; // 0x7214 (29204) address book bulk push
export const RESPONSE_MESSENGER_STATUS_CODE = 0x0f07; // 0x74cc (29900) presence roster push

// --- fixed body sizes (FUN_004b8b00 receive-object factory) ---
export const SPOT_CHAT_BYTES = 0x8c; // 140
export const SPOT_UNICAST_CHAT_BYTES = 0x90; // 144
export const SEND_MAIL_BYTES = 0x75c; // 1884 (== TransactionMailEnd 0xf0a)
export const READ_MAIL_BYTES = 0x12c; // 300
export const NOTIFY_COMMAND_MAIL_BYTES = 0x25c; // 604
export const MESSENGER_BYTES = 0x52c; // 1324
export const SET_TOGETHER_BYTES = 0x0c; // 12

// ---------------------------------------------------------------------------
// Limits (client guards)
// ---------------------------------------------------------------------------
export const MAX_CHAT_TEXT = 65; // FUN_004be6f0 copies msgLen UTF-16 units, capped ≤ 0x41 (65)
export const MAX_MESSENGER_TEXT = 256; // Input/Output_CommandMessenger: "over than 512" bytes ⇒ ≤256 u16 chars
export const MAX_MAIL_TEXT = 512; // generous compose-body cap (the bulk of the 1884B record)
export const MAILBOX_CAP = 120; // 캐논 §2.4(p16): 메일함 상한 — 가득 차면 신규 배달 차단
export const ADDRESSBOOK_CAP = 100; // 캐논 §2.4: 주소록(名刺) 상한

// ---------------------------------------------------------------------------
// UTF-16LE pascal-ish text helpers (the chat wire form: [u8 len][u16 chars])
// ---------------------------------------------------------------------------

/** Read up to `max` UTF-16LE code units starting at `charsOff`, length byte at `lenOff`. */
function readWideText(body, lenOff, charsOff, max = MAX_CHAT_TEXT) {
  if (lenOff >= body.length) {
    return '';
  }
  const available = Math.max(0, Math.floor((body.length - charsOff) / 2));
  const len = Math.min(body.readUInt8(lenOff), available, max);
  let text = '';
  for (let i = 0; i < len; i += 1) {
    text += String.fromCharCode(body.readUInt16LE(charsOff + i * 2));
  }
  return text;
}

/** Write a UTF-16LE string: length byte at `lenOff`, code units at `charsOff` (clamped to `max`). */
function writeWideText(payload, text, lenOff, charsOff, max = MAX_CHAT_TEXT) {
  const chars = Array.from(String(text)).slice(0, max);
  payload.writeUInt8(chars.length, lenOff);
  for (let i = 0; i < chars.length; i += 1) {
    payload.writeUInt16LE(chars[i].charCodeAt(0) & 0xffff, charsOff + i * 2);
  }
}

// ===========================================================================
// 1. CHAT — SpotChat 0x0f1d / SpotUnicastChat 0x0f1e (docs §3)
// ===========================================================================

/**
 * Parse an inbound CommandSpotChat (0x0f1d). Raw inner = [u16 BE code][body]; body (140B) per §3:
 *   [u32 sender/time @0][u32 ctx/spot @4][u8 msgLen @8][? @9][u16[] message @10] (≤65 chars).
 * (GridChat puts a castType byte @8 and msgLen @9; SpotChat dropped the castType, so msgLen is @8.)
 * Returns { time, spot, msgLen, text } or null if too short.
 */
export function parseInboundSpotChat(inner) {
  const body = inner.subarray(2);
  if (body.length < 10) {
    return null;
  }
  const time = body.readUInt32LE(0);
  const spot = body.readUInt32LE(4);
  const msgLen = body.readUInt8(8);
  const text = readWideText(body, 8, 10, MAX_CHAT_TEXT);
  return { time, spot, msgLen, text };
}

/**
 * Parse an inbound CommandSpotUnicastChat (0x0f1e). Body (144B) per §3:
 *   [u32 sender/time @0][u32 ctx @4][u32 targetId @8][u8 msgLen @0xc][? @0xd][u16[] message @0xe].
 * The extra targetCharId dword pushes msgLen to @0xc and the message to @0xe.
 * Returns { time, ctx, targetId, msgLen, text } or null if too short.
 */
export function parseInboundSpotUnicastChat(inner) {
  const body = inner.subarray(2);
  if (body.length < 14) {
    return null;
  }
  const time = body.readUInt32LE(0);
  const ctx = body.readUInt32LE(4);
  const targetId = body.readUInt32LE(8);
  const msgLen = body.readUInt8(0x0c);
  const text = readWideText(body, 0x0c, 0x0e, MAX_CHAT_TEXT);
  return { time, ctx, targetId, msgLen, text };
}

/**
 * Build a CommandSpotChat (0x0f1d) inner in the RECEIVE form the other clients render (case 0xf1d ->
 * FUN_004be680 -> FUN_004be6f0(text@+10, msgLen@+8, ctx@+4)). 140-byte payload:
 *   [u32 time @0][u32 spot @4][u8 msgLen @8][u16[] message @10] (≤65 chars, UTF-16LE).
 */
export function buildCommandSpotChatInner({ text = '', spot = 0, time = 0 } = {}) {
  const inner = buildLobbyResponseInner(COMMAND_SPOT_CHAT_CODE, SPOT_CHAT_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(time >>> 0, 0);
  payload.writeUInt32LE(spot >>> 0, 4);
  writeWideText(payload, text, 8, 10, MAX_CHAT_TEXT);
  return inner;
}

/**
 * Build a CommandSpotUnicastChat (0x0f1e) inner in the RECEIVE form (case 0xf1e -> FUN_004be6a0 ->
 * FUN_004be6f0(text@+0xe, msgLen@+0xc, ctx@+4)). 144-byte payload:
 *   [u32 time @0][u32 ctx @4][u32 targetId @8][u8 msgLen @0xc][u16[] message @0xe] (≤65 chars).
 */
export function buildCommandSpotUnicastChatInner({ text = '', ctx = 0, targetId = 0, time = 0 } = {}) {
  const inner = buildLobbyResponseInner(COMMAND_SPOT_UNICAST_CHAT_CODE, SPOT_UNICAST_CHAT_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(time >>> 0, 0);
  payload.writeUInt32LE(ctx >>> 0, 4);
  payload.writeUInt32LE(targetId >>> 0, 8);
  writeWideText(payload, text, 0x0c, 0x0e, MAX_CHAT_TEXT);
  return inner;
}

// ===========================================================================
// 2. MAIL — CommandSendMail 0xf10 / ReadMail 0xf11 / DeleteMail 0xf12 (docs §6c–§6d)
// ===========================================================================

/**
 * Parse an inbound CommandSendMail (0x0f10, 1884B). The full per-field compose layout needs the
 * compose-UI writer (docs §6c: Med/Low), but the high-confidence anchors are: recipient char-id near
 * the TOP of the envelope (@0), and a UTF-16LE subject/body that follows. We pin recipientId @0 and
 * a sender/category dword @4, then best-effort read a wide-text body whose length byte is @8.
 * The full 1884-byte record is preserved verbatim in `raw` so the server can store+forward it
 * byte-faithfully (the receive form 0xf0a is the same size/shape). Returns null if too short.
 */
export function parseInboundSendMail(inner) {
  const body = inner.subarray(2);
  if (body.length < 12) {
    return null;
  }
  const recipientId = body.readUInt32LE(0);
  const category = body.readUInt32LE(4);
  // Best-effort body text (length byte @8, UTF-16LE @10) — the compose-UI exact offsets are Med/Low,
  // so we only surface a preview; the authoritative store keeps the full raw record.
  const text = readWideText(body, 8, 10, MAX_MAIL_TEXT);
  return { recipientId, category, text, raw: Buffer.from(body) };
}

/**
 * Parse an inbound CommandReadMail (0x0f11) / CommandDeleteMail (0x0f12) — same 300B shape. Body per
 * §6d: [u32 mailId @0][…flags/index…]. We surface mailId @0 and a secondary index @4. Returns null
 * if too short.
 */
export function parseInboundMailRef(inner) {
  const body = inner.subarray(2);
  if (body.length < 4) {
    return null;
  }
  return { mailId: body.readUInt32LE(0), index: body.length >= 8 ? body.readUInt32LE(4) : 0 };
}

/**
 * Build a TransactionMailEnd (0x0f0a, 1884B) record — the S->C form a recipient receives a delivered
 * mail in (same size/shape as CommandSendMail 0xf10). If `raw` (the verbatim 1884B send body) is
 * supplied it is copied through faithfully; otherwise the high-confidence anchors are stamped.
 */
export function buildMailRecordInner({ raw = null, recipientId = 0, senderId = 0, text = '' } = {}) {
  const inner = buildLobbyResponseInner(TRANSACTION_MAIL_END_CODE, SEND_MAIL_BYTES);
  const payload = inner.subarray(6);
  if (raw && raw.length) {
    raw.copy(payload, 0, 0, Math.min(raw.length, payload.length));
    return inner;
  }
  payload.writeUInt32LE(recipientId >>> 0, 0);
  payload.writeUInt32LE(senderId >>> 0, 4);
  writeWideText(payload, text, 8, 10, MAX_MAIL_TEXT);
  return inner;
}

/**
 * Build a TransactionMailStatus (0x0f09, 1 byte) — the S->C status marker (e.g. delivered=1). The
 * client copies the single body byte as the transfer status.
 */
export function buildMailStatusInner({ status = 1 } = {}) {
  const inner = buildLobbyResponseInner(TRANSACTION_MAIL_STATUS_CODE, 1);
  inner.subarray(6).writeUInt8(status & 0xff, 0);
  return inner;
}

// ===========================================================================
// 3. ORDER-SUGGEST MAIL — 0xf13 / 0xf14 / 0xf15 (docs §6e)
// ===========================================================================

/**
 * Parse an inbound CommandOrderSuggestMail (0x0f13, 612B) / CommandReplyOrderSuggestMail (0x0f14,
 * 604B). Both carry a target character id at the top + a body; the order subsystem is "a superior
 * issuing orders, a subordinate replying". High-confidence anchors: targetId @0, orderId/category @4.
 * Returns { targetId, orderId, text, raw } or null if too short.
 */
export function parseInboundOrderMail(inner) {
  const body = inner.subarray(2);
  if (body.length < 8) {
    return null;
  }
  return {
    targetId: body.readUInt32LE(0),
    orderId: body.readUInt32LE(4),
    text: readWideText(body, 8, 10, MAX_MAIL_TEXT),
    raw: Buffer.from(body),
  };
}

/**
 * Build a NotifyCommandMail (0x0f15, 604B) — the S->C notify pushed to the target that an order-mail
 * arrived (apply FUN_004c07e0, struct 0x4871ec, copies 0x97 dwords). Anchors: targetId @0, senderId
 * @4, orderId @8; optional wide-text note @0xe.
 */
export function buildNotifyCommandMailInner({ targetId = 0, senderId = 0, orderId = 0, text = '' } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_COMMAND_MAIL_CODE, NOTIFY_COMMAND_MAIL_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(targetId >>> 0, 0);
  payload.writeUInt32LE(senderId >>> 0, 4);
  payload.writeUInt32LE(orderId >>> 0, 8);
  writeWideText(payload, text, 0x0c, 0x0e, MAX_MAIL_TEXT);
  return inner;
}

// ===========================================================================
// 4. MESSENGER — status 0xf0d / connection 0xf0e / IM 0xf0f, address book 0xf0b/0xf0c (docs §6f)
// ===========================================================================

/**
 * Parse an inbound CommandMessengerStatus (0x0f0d, 296B) — set own presence. Body: [u32 charId @0]
 * [u32 status @4] where status ∈ {0 offline, 1 online, 2 away, 3 busy}. Returns null if too short.
 */
export function parseInboundMessengerStatus(inner) {
  const body = inner.subarray(2);
  if (body.length < 8) {
    return null;
  }
  return { charId: body.readUInt32LE(0), status: body.readUInt32LE(4) };
}

/**
 * Parse an inbound CommandMessenger (0x0f0f, 1324B) — a live IM payload. The text field is
 * bounds-checked ≤512 bytes (Input/Output_CommandMessenger "over than 512"), i.e. ≤256 UTF-16 units.
 * Anchors: fromId @0, toId @4, then a wide-text message (len @8, chars @10). Returns null if short.
 */
export function parseInboundMessenger(inner) {
  const body = inner.subarray(2);
  if (body.length < 12) {
    return null;
  }
  return {
    fromId: body.readUInt32LE(0),
    toId: body.readUInt32LE(4),
    text: readWideText(body, 8, 10, MAX_MESSENGER_TEXT),
    raw: Buffer.from(body),
  };
}

/**
 * Build a CommandMessenger (0x0f0f, 1324B) relay inner — the IM as the peer receives it. If `raw`
 * (the verbatim send body) is supplied it is copied through; otherwise the anchors + text are stamped.
 */
export function buildMessengerInner({ raw = null, fromId = 0, toId = 0, text = '' } = {}) {
  const inner = buildLobbyResponseInner(COMMAND_MESSENGER_CODE, MESSENGER_BYTES);
  const payload = inner.subarray(6);
  if (raw && raw.length) {
    raw.copy(payload, 0, 0, Math.min(raw.length, payload.length));
    return inner;
  }
  payload.writeUInt32LE(fromId >>> 0, 0);
  payload.writeUInt32LE(toId >>> 0, 4);
  writeWideText(payload, text, 8, 10, MAX_MESSENGER_TEXT);
  return inner;
}

/**
 * Parse an inbound CommandExchangeMailAddress (0x0f0b, 588B) / CommandDeleteMailAddress (0x0f0c,
 * 292B) — add/remove a contact. Anchors: ownerId @0, contactId @4. Returns null if too short.
 */
export function parseInboundAddressCommand(inner) {
  const body = inner.subarray(2);
  if (body.length < 8) {
    return null;
  }
  return { ownerId: body.readUInt32LE(0), contactId: body.readUInt32LE(4) };
}

// ===========================================================================
// 5. SETTINGS — 0xf16–0xf1b (docs §4)
// ===========================================================================

/**
 * Parse a settings command (0x0f16–0x0f1b). Each is a small fixed-size C->S write whose apply copies
 * the body into the player's settings struct. We decode the high-confidence layouts (§4):
 *   0xf16 SetTogether (12B):        [u32 @0][u32 charId @4][u8 flag @8]  ⇒ { charId, flag }
 *   0xf18 SetOfflineDirection (16B):[u32 @0][u32 ackId @4][u32 @8][u32 @0xc] ⇒ { ackId, values[4] }
 *   0xf19 SetUnitDistributePriority(16B): 4 dwords (@4 = ackId echo) ⇒ { ackId, values[4] }
 *   0xf1a SetReturnBase (12B):      [u32 @0][u32 @4][u32 baseId @8] ⇒ { values[3] }
 *   0xf1b SetPrivateAccountRate(12B):[u32 @0][u32 @4][u32 rate @8] ⇒ { values[3] }
 *   0xf17 SetWillMessage (140B):    [u32 charId @0][…wide text…] ⇒ { charId, text }
 * Returns { code, ...fields } or null if too short for the code's body.
 */
export function parseInboundSetting(inner) {
  const code = inner.readUInt16BE(0);
  const body = inner.subarray(2);
  switch (code) {
    case COMMAND_SET_TOGETHER_CODE: {
      if (body.length < 9) return null;
      return { code, charId: body.readUInt32LE(4), flag: body.readUInt8(8) };
    }
    case COMMAND_SET_WILL_MESSAGE_CODE: {
      if (body.length < 6) return null;
      return { code, charId: body.readUInt32LE(0), text: readWideText(body, 4, 6, MAX_CHAT_TEXT) };
    }
    case COMMAND_SET_OFFLINE_DIRECTION_CODE:
    case COMMAND_SET_UNIT_DISTRIBUTE_PRIORITY_CODE: {
      if (body.length < 16) return null;
      // body dword 1 (@4) is an ack/result id the client echoes; preserve it.
      const values = [body.readUInt32LE(0), body.readUInt32LE(4), body.readUInt32LE(8), body.readUInt32LE(12)];
      return { code, ackId: values[1], values };
    }
    case COMMAND_SET_RETURN_BASE_CODE:
    case COMMAND_SET_PRIVATE_ACCOUNT_RATE_CODE: {
      if (body.length < 12) return null;
      const values = [body.readUInt32LE(0), body.readUInt32LE(4), body.readUInt32LE(8)];
      return { code, values };
    }
    default:
      return null;
  }
}

const SETTING_CODES = new Set([
  COMMAND_SET_TOGETHER_CODE,
  COMMAND_SET_WILL_MESSAGE_CODE,
  COMMAND_SET_OFFLINE_DIRECTION_CODE,
  COMMAND_SET_UNIT_DISTRIBUTE_PRIORITY_CODE,
  COMMAND_SET_RETURN_BASE_CODE,
  COMMAND_SET_PRIVATE_ACCOUNT_RATE_CODE,
]);

/** Apply a parsed setting into a player's settings record (mutates + returns it). */
function applySetting(settings, parsed) {
  switch (parsed.code) {
    case COMMAND_SET_TOGETHER_CODE:
      settings.together = { charId: parsed.charId, flag: parsed.flag };
      break;
    case COMMAND_SET_WILL_MESSAGE_CODE:
      settings.willMessage = parsed.text;
      break;
    case COMMAND_SET_OFFLINE_DIRECTION_CODE:
      settings.offlineDirection = parsed.values;
      settings.offlineDirectionAck = parsed.ackId;
      break;
    case COMMAND_SET_UNIT_DISTRIBUTE_PRIORITY_CODE:
      settings.unitDistributePriority = parsed.values;
      settings.unitDistributePriorityAck = parsed.ackId;
      break;
    case COMMAND_SET_RETURN_BASE_CODE:
      settings.returnBase = parsed.values[2];
      break;
    case COMMAND_SET_PRIVATE_ACCOUNT_RATE_CODE:
      settings.privateAccountRate = parsed.values[2];
      break;
    default:
      break;
  }
  return settings;
}

// ===========================================================================
// 6. STATE — per-player mailbox + settings + messenger presence
// ===========================================================================

/**
 * Create the in-memory social state for the domain. Keyed by connectionId (the caller's stable
 * per-connection key). Each player has: an inbox (array of stored mail records), settings (the §4
 * writes), a messenger presence value, a contact set (address book), and a charId→connectionId index
 * so unicast/whisper/mail delivery can resolve a target character to its live connection.
 */
export function createSocialState() {
  /** @type {Map<number, { connectionId:number, charId:number, inbox:object[], settings:object, presence:number, contacts:Set<number> }>} */
  const players = new Map();
  /** @type {Map<number, number>} charId -> connectionId (for target resolution) */
  const charIndex = new Map();
  let nextMailId = 1;

  function ensure(connectionId) {
    let p = players.get(connectionId);
    if (!p) {
      p = { connectionId, charId: 0, inbox: [], settings: {}, presence: 0, contacts: new Set() };
      players.set(connectionId, p);
    }
    return p;
  }

  return {
    /** Register/refresh a connection's character id (so deliveries can resolve a target char to a conn). */
    join(connectionId, charId = 0) {
      const p = ensure(connectionId);
      if (charId) {
        p.charId = charId;
        charIndex.set(charId, connectionId);
      }
      return p;
    },
    leave(connectionId) {
      const p = players.get(connectionId);
      if (p && p.charId) {
        charIndex.delete(p.charId);
      }
      players.delete(connectionId);
    },
    get(connectionId) {
      return players.get(connectionId);
    },
    has(connectionId) {
      return players.has(connectionId);
    },
    /** Resolve a target character id to its live connection id (or undefined). */
    connectionOfChar(charId) {
      return charIndex.get(charId);
    },
    /** Store a mail record into the recipient connection's inbox; returns the stored record. */
    storeMail(connectionId, record) {
      const p = ensure(connectionId);
      if (p.inbox.length >= MAILBOX_CAP) return null; // 캐논 §2.4: 메일함 가득(120) → 배달 차단(null)
      const mail = { id: nextMailId, read: false, ...record };
      nextMailId += 1;
      p.inbox.push(mail);
      return mail;
    },
    getInbox(connectionId) {
      return players.get(connectionId)?.inbox ?? [];
    },
    /** Mark a mail read by id; returns true if found. */
    markRead(connectionId, mailId) {
      const mail = players.get(connectionId)?.inbox.find((m) => m.id === mailId);
      if (!mail) return false;
      mail.read = true;
      return true;
    },
    /** Delete a mail by id; returns true if removed. */
    deleteMail(connectionId, mailId) {
      const p = players.get(connectionId);
      if (!p) return false;
      const i = p.inbox.findIndex((m) => m.id === mailId);
      if (i < 0) return false;
      p.inbox.splice(i, 1);
      return true;
    },
    /** Set + return the player's settings (applying a parsed setting command). */
    applySetting(connectionId, parsed) {
      const p = ensure(connectionId);
      return applySetting(p.settings, parsed);
    },
    getSettings(connectionId) {
      return players.get(connectionId)?.settings;
    },
    /** Set the player's messenger presence; returns the value. */
    setPresence(connectionId, status) {
      const p = ensure(connectionId);
      p.presence = status >>> 0;
      return p.presence;
    },
    getPresence(connectionId) {
      return players.get(connectionId)?.presence ?? 0;
    },
    /** Add a contact to the address book; returns true if newly added. */
    addContact(connectionId, contactId) {
      const p = ensure(connectionId);
      if (p.contacts.has(contactId)) return false;
      if (p.contacts.size >= ADDRESSBOOK_CAP) return false; // 캐논 §2.4: 주소록 상한(100)
      p.contacts.add(contactId);
      return true;
    },
    /** Remove a contact; returns true if removed. */
    removeContact(connectionId, contactId) {
      const p = players.get(connectionId);
      if (!p) return false;
      return p.contacts.delete(contactId);
    },
    /** 亡命(defection) 시 주소록 전체 삭제(캐논 §2.4: 망명은 주소록을 비운다). 삭제된 연락처 수 반환. */
    clearContacts(connectionId) {
      const p = players.get(connectionId);
      if (!p) return 0;
      const n = p.contacts.size;
      p.contacts.clear();
      return n;
    },
    getContacts(connectionId) {
      return [...(players.get(connectionId)?.contacts ?? [])];
    },
    size() {
      return players.size;
    },
  };
}

// ===========================================================================
// 7. process(ctx) — the domain entry the lead wires into the command engine
// ===========================================================================

/** Codes this domain owns (the lead routes inbound inners in this set to processSocial). */
export const SOCIAL_COMMAND_CODES = new Set([
  COMMAND_SPOT_CHAT_CODE,
  COMMAND_SPOT_UNICAST_CHAT_CODE,
  COMMAND_SEND_MAIL_CODE,
  COMMAND_READ_MAIL_CODE,
  COMMAND_DELETE_MAIL_CODE,
  COMMAND_ORDER_SUGGEST_MAIL_CODE,
  COMMAND_REPLY_ORDER_SUGGEST_MAIL_CODE,
  COMMAND_MESSENGER_STATUS_CODE,
  COMMAND_MESSENGER_CONNECTION_CODE,
  COMMAND_MESSENGER_CODE,
  COMMAND_EXCHANGE_MAIL_ADDRESS_CODE,
  COMMAND_DELETE_MAIL_ADDRESS_CODE,
  COMMAND_SET_TOGETHER_CODE,
  COMMAND_SET_WILL_MESSAGE_CODE,
  COMMAND_SET_OFFLINE_DIRECTION_CODE,
  COMMAND_SET_UNIT_DISTRIBUTE_PRIORITY_CODE,
  COMMAND_SET_RETURN_BASE_CODE,
  COMMAND_SET_PRIVATE_ACCOUNT_RATE_CODE,
]);

/** @returns true if `innerCode` is owned by the social domain. */
export function isSocialCommandCode(innerCode) {
  return SOCIAL_COMMAND_CODES.has(innerCode);
}

/**
 * Process an inbound social-domain command from `connectionId`.
 *
 * Contract (matches logh7-command-engine processCommand): returns
 *   { accept: boolean, reject?: string, notifies: [{ inner: Buffer, target: 'others'|'all' }] }.
 * For a private/whisper delivery the notify carries `targetConnectionId` so the caller can route it to
 * exactly one connection (target stays 'others' as a fallback scope). The caller frames + broadcasts.
 *
 * @param {{ state: ReturnType<createSocialState>, connectionId: number, innerCode: number, inner: Buffer }} args
 */
export function processSocial({ state, connectionId, innerCode, inner }) {
  const player = state.get(connectionId);
  if (!player) {
    return { accept: false, reject: 'not-in-world', notifies: [] };
  }

  // --- chat: SpotChat 0xf1d (broadcast to the sender's spot) ---
  if (innerCode === COMMAND_SPOT_CHAT_CODE) {
    const parsed = parseInboundSpotChat(inner);
    if (!parsed || parsed.text.length === 0) {
      return { accept: false, reject: 'empty-chat', notifies: [] };
    }
    if (parsed.msgLen > MAX_CHAT_TEXT) {
      return { accept: false, reject: 'chat-too-long', notifies: [] };
    }
    const notify = buildCommandSpotChatInner({ text: parsed.text, spot: parsed.spot, time: parsed.time });
    return { accept: true, scope: parsed.spot, notifies: [{ inner: notify, target: 'others' }] };
  }

  // --- chat: SpotUnicastChat 0xf1e (whisper to one character) ---
  if (innerCode === COMMAND_SPOT_UNICAST_CHAT_CODE) {
    const parsed = parseInboundSpotUnicastChat(inner);
    if (!parsed || parsed.text.length === 0) {
      return { accept: false, reject: 'empty-chat', notifies: [] };
    }
    if (parsed.msgLen > MAX_CHAT_TEXT) {
      return { accept: false, reject: 'chat-too-long', notifies: [] };
    }
    const targetConn = state.connectionOfChar(parsed.targetId);
    const notify = buildCommandSpotUnicastChatInner({
      text: parsed.text,
      ctx: parsed.ctx,
      targetId: parsed.targetId,
      time: parsed.time,
    });
    // Whisper: deliver to exactly the target connection if it's online; else accept with no delivery.
    if (targetConn === undefined) {
      return { accept: true, delivered: false, notifies: [] };
    }
    return {
      accept: true,
      delivered: true,
      targetConnectionId: targetConn,
      notifies: [{ inner: notify, target: 'others', targetConnectionId: targetConn }],
    };
  }

  // --- mail: send 0xf10 ---
  if (innerCode === COMMAND_SEND_MAIL_CODE) {
    const parsed = parseInboundSendMail(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-mail', notifies: [] };
    }
    const targetConn = state.connectionOfChar(parsed.recipientId);
    // Always store the mail for the recipient (so it's in their box on next login); deliver live if online.
    const recipientKey = targetConn ?? parsed.recipientId; // store keyed by conn when online, else by char id
    const mail = state.storeMail(recipientKey, {
      senderConnectionId: connectionId,
      senderCharId: player.charId,
      recipientCharId: parsed.recipientId,
      text: parsed.text,
      raw: parsed.raw,
    });
    // 수신함이 가득(캐논 §2.4: 120)이면 배달 차단(bounce) — 발신자에겐 수락하되 미배달로 알린다.
    if (!mail) {
      return { accept: true, delivered: false, reason: 'mailbox-full', notifies: [] };
    }
    const notifies = [];
    if (targetConn !== undefined) {
      // Deliver: push the mail record (TransactionMailEnd 0xf0a) + a status to the recipient connection.
      notifies.push({
        inner: buildMailRecordInner({ raw: parsed.raw, recipientId: parsed.recipientId, senderId: player.charId }),
        target: 'others',
        targetConnectionId: targetConn,
      });
    }
    return { accept: true, mailId: mail.id, delivered: targetConn !== undefined, notifies };
  }

  // --- mail: read 0xf11 / delete 0xf12 ---
  if (innerCode === COMMAND_READ_MAIL_CODE || innerCode === COMMAND_DELETE_MAIL_CODE) {
    const parsed = parseInboundMailRef(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-mail-ref', notifies: [] };
    }
    const ok =
      innerCode === COMMAND_READ_MAIL_CODE
        ? state.markRead(connectionId, parsed.mailId)
        : state.deleteMail(connectionId, parsed.mailId);
    if (!ok) {
      return { accept: false, reject: 'no-such-mail', notifies: [] };
    }
    return { accept: true, mailId: parsed.mailId, notifies: [] };
  }

  // --- order-suggest mail: 0xf13 compose / 0xf14 reply ---
  if (innerCode === COMMAND_ORDER_SUGGEST_MAIL_CODE || innerCode === COMMAND_REPLY_ORDER_SUGGEST_MAIL_CODE) {
    const parsed = parseInboundOrderMail(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-order-mail', notifies: [] };
    }
    const targetConn = state.connectionOfChar(parsed.targetId);
    const notify = buildNotifyCommandMailInner({
      targetId: parsed.targetId,
      senderId: player.charId,
      orderId: parsed.orderId,
      text: parsed.text,
    });
    if (targetConn === undefined) {
      return { accept: true, delivered: false, notifies: [] };
    }
    return {
      accept: true,
      delivered: true,
      targetConnectionId: targetConn,
      notifies: [{ inner: notify, target: 'others', targetConnectionId: targetConn }],
    };
  }

  // --- messenger: presence 0xf0d ---
  if (innerCode === COMMAND_MESSENGER_STATUS_CODE) {
    const parsed = parseInboundMessengerStatus(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-messenger-status', notifies: [] };
    }
    state.setPresence(connectionId, parsed.status);
    // Presence change is broadcast so contacts' rosters update (the relay re-pushes the same code).
    return { accept: true, presence: parsed.status, notifies: [] };
  }

  // --- messenger: live IM 0xf0f (relay to the peer), connection open 0xf0e ---
  if (innerCode === COMMAND_MESSENGER_CODE) {
    const parsed = parseInboundMessenger(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-messenger', notifies: [] };
    }
    const targetConn = state.connectionOfChar(parsed.toId);
    const notify = buildMessengerInner({ raw: parsed.raw, fromId: player.charId, toId: parsed.toId });
    if (targetConn === undefined) {
      return { accept: true, delivered: false, notifies: [] };
    }
    return {
      accept: true,
      delivered: true,
      targetConnectionId: targetConn,
      notifies: [{ inner: notify, target: 'others', targetConnectionId: targetConn }],
    };
  }
  if (innerCode === COMMAND_MESSENGER_CONNECTION_CODE) {
    // Open/accept a 1:1 session — accept (session bookkeeping is a no-op until live IM flows).
    return { accept: true, notifies: [] };
  }

  // --- address book: exchange 0xf0b / delete 0xf0c ---
  if (innerCode === COMMAND_EXCHANGE_MAIL_ADDRESS_CODE || innerCode === COMMAND_DELETE_MAIL_ADDRESS_CODE) {
    const parsed = parseInboundAddressCommand(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-address', notifies: [] };
    }
    if (innerCode === COMMAND_EXCHANGE_MAIL_ADDRESS_CODE) {
      state.addContact(connectionId, parsed.contactId);
    } else {
      state.removeContact(connectionId, parsed.contactId);
    }
    return { accept: true, contactId: parsed.contactId, notifies: [] };
  }

  // --- settings: 0xf16–0xf1b ---
  if (SETTING_CODES.has(innerCode)) {
    const parsed = parseInboundSetting(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-setting', notifies: [] };
    }
    state.applySetting(connectionId, parsed);
    // SetTogether (0xf16) affects others (a presence/group toggle) → broadcast the same body so peers
    // see the grouping flag flip; the other settings are private (no broadcast).
    if (innerCode === COMMAND_SET_TOGETHER_CODE) {
      const echo = buildLobbyResponseInner(COMMAND_SET_TOGETHER_CODE, SET_TOGETHER_BYTES);
      const payload = echo.subarray(6);
      payload.writeUInt32LE((parsed.charId ?? 0) >>> 0, 4);
      payload.writeUInt8(parsed.flag & 0xff, 8);
      return { accept: true, setting: innerCode, notifies: [{ inner: echo, target: 'others' }] };
    }
    return { accept: true, setting: innerCode, ackId: parsed.ackId, notifies: [] };
  }

  return { accept: false, reject: 'unknown-social-command', notifies: [] };
}
