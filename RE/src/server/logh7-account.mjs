/**
 * Authoritative ACCOUNT / CHARACTER-ENTITLEMENT domain (0x1001–0x1007) + the social remainder
 * builders (mail-address roster 0x0f05, messenger roster 0x0f07, mail-transfer Begin/End framing
 * 0x0f08/0x0f09, the canonical SpotChat 0x0f1d record).
 *
 * The LOGH VII client keeps a per-account "card" the server fills on world entry: who you are, how
 * many characters you own, your charge/billing state and entitlements (ResponseInformationAccount
 * 0x1001), the roster of un-chartered / available character slots you may charge (ResponseUnChargeCharacter
 * 0x1003), and which character you currently have "entered"/in-play (ResponseCharacterEntryState
 * 0x1005). The client then issues two charge commands the server must validate against the account's
 * entitlement table: CommandOriginalCharacterCharge 0x1006 (select/charge a canon "original"
 * character) and CommandExtensionCharacterCharge 0x1007 (charge an extra/extension slot). On a valid
 * charge the server mutates the active-character state and replies 0x1005 + 0x1001. (The CREATE flow —
 * CommandGenerateCharacterCharge 0x1008 — already lives in logh7-login-protocol.mjs and is NOT
 * duplicated here.)
 *
 * SELF-CONTAINED: exports its own message CODES + body sizes, the S->C record builders
 * (build*Inner), the C->S parsers (parseInbound*), a createAccountState() in-memory entitlement table
 * factory, and a processAccount(ctx) entry returning the standard
 *   { accept, reject?, notifies: [{ inner, target }] }
 * decision the lead wires into the command engine. It only imports the framing helper
 * buildLobbyResponseInner from logh7-login-protocol.mjs; it does NOT touch the command-engine /
 * world-state / login-protocol internals, and does NOT redefine the 0x1008 create flow.
 *
 * WIRE EVIDENCE: docs/logh7-proto-social-account.md (§5 account/character master table, §1 size table,
 * §6a/§6b mail+messenger rosters, §3 chat). All body sizes mirror WORLD_RESPONSE_OBJECT_SIZES
 * (FUN_004b8b00 receive-object factory) and the FUN_004ba2b0 apply dword-copy counts:
 *   0x1001 = 0x1c0 (448, 0x70 dw), 0x1003 = 0xfa4 (4004, 0x3e9 dw), 0x1005 = 0x20 (32, 8 dw),
 *   0x1006 = 0x18 (24, 6 dw), 0x1007 = 8 (2 dw); 0x0f05 = 0x7214 (29204), 0x0f07 = 0x74cc (29900),
 *   0x0f08 = 0x128 (296), 0x0f09 = 1, 0x0f1d = 0x8c (140).
 * Bodies are LITTLE-ENDIAN; only the 2-byte inner code prefix is big-endian. Chat text is UTF-16LE.
 *
 * Field-level semantics inside the account card / roster rows are MEDIUM/LOW confidence (the per-field
 * meaning needs the account-UI reader, out of scope for a single static pass — docs §5/§8). We pin the
 * HIGH-confidence anchors (sizes; id/count/state at the top of each record) and zero-fill the rest so
 * the world-load sequence is satisfied byte-faithfully; richer fields can be layered in later.
 *
 * Pure + synchronous ⇒ fully unit-testable without a live client.
 */

import { buildLobbyResponseInner } from './logh7-login-protocol.mjs';

// ---------------------------------------------------------------------------
// Message codes (docs/logh7-proto-social-account.md §5 + §1 master table)
// ---------------------------------------------------------------------------

// --- account / character entitlement (0x1001–0x1007) ---
export const RESPONSE_INFORMATION_ACCOUNT_CODE = 0x1001; // S->C account card
export const RESPONSE_UNCHARGE_CHARACTER_CODE = 0x1003; // S->C available/un-chartered roster
export const RESPONSE_CHARACTER_ENTRY_STATE_CODE = 0x1005; // S->C active-character entry state
export const COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE = 0x1006; // C->S charge a canon character
export const COMMAND_EXTENSION_CHARACTER_CHARGE_CODE = 0x1007; // C->S charge an extension slot
// 0x1008 CommandGenerateCharacterCharge (CREATE) lives in logh7-login-protocol.mjs (DONE) — not here.

// --- social remainder builders ---
export const RESPONSE_MAIL_ADDRESS_CODE = 0x0f05; // S->C mail-address book bulk push
export const RESPONSE_MESSENGER_STATUS_CODE = 0x0f07; // S->C messenger/presence roster push
export const TRANSACTION_MAIL_BEGIN_CODE = 0x0f08; // S->C mail xfer begin
export const TRANSACTION_MAIL_STATUS_CODE = 0x0f09; // S->C 1-byte transfer status
export const COMMAND_SPOT_CHAT_CODE = 0x0f1d; // bidir spot chat (canonical record builder)

// --- fixed body sizes (FUN_004b8b00 receive-object factory / FUN_004ba2b0 copy counts) ---
export const RESPONSE_INFORMATION_ACCOUNT_BYTES = 0x1c0; // 448 (0x70 dw)
export const RESPONSE_UNCHARGE_CHARACTER_BYTES = 0xfa4; // 4004 (0x3e9 dw)
export const RESPONSE_CHARACTER_ENTRY_STATE_BYTES = 0x20; // 32 (8 dw)
export const COMMAND_ORIGINAL_CHARACTER_CHARGE_BYTES = 0x18; // 24 (6 dw)
export const COMMAND_EXTENSION_CHARACTER_CHARGE_BYTES = 0x08; // 8 (2 dw)
export const RESPONSE_MAIL_ADDRESS_BYTES = 0x7214; // 29204
export const RESPONSE_MESSENGER_STATUS_BYTES = 0x74cc; // 29900
export const TRANSACTION_MAIL_BEGIN_BYTES = 0x128; // 296
export const TRANSACTION_MAIL_STATUS_BYTES = 0x01; // 1
export const SPOT_CHAT_BYTES = 0x8c; // 140

// Roster row strides (HIGH confidence — from the §1 buffer-size arithmetic). The account-side roster
// records are not pinned per-field; we expose a documented row stride so a fixed [u16 count][rows]
// roster fits the buffer and the count anchor is honest.
export const MAX_CHAT_TEXT = 65; // FUN_004be6f0 copies msgLen UTF-16 units, capped ≤ 0x41 (65)

// ---------------------------------------------------------------------------
// UTF-16LE pascal-ish text helper (the chat wire form: [u8 len][u16 chars])
// ---------------------------------------------------------------------------

/** Write a UTF-16LE string: length byte at `lenOff`, code units at `charsOff` (clamped to `max`). */
function writeWideText(payload, text, lenOff, charsOff, max = MAX_CHAT_TEXT) {
  const chars = Array.from(String(text)).slice(0, max);
  payload.writeUInt8(chars.length, lenOff);
  for (let i = 0; i < chars.length; i += 1) {
    payload.writeUInt16LE(chars[i].charCodeAt(0) & 0xffff, charsOff + i * 2);
  }
}

// ===========================================================================
// 1. ACCOUNT CARD — ResponseInformationAccount 0x1001 (docs §5, 448 B / 0x70 dw)
// ===========================================================================

/**
 * Build a ResponseInformationAccount (0x1001, 448 B) — the per-account card the server sends on world
 * entry (copied to clientBase+0x3584a4, distinct from the selected-char id buffer at 0x3584a0). The
 * card holds account-level data: id, name, owned-character count, charge/billing state, entitlements.
 * Per-field semantics are MEDIUM confidence (no account-UI reader); we pin the HIGH-confidence anchors:
 *   @0x00 u32 accountId, @0x04 u32 ownedCharacterCount, @0x08 u32 chargeState (billing/entitlement),
 *   @0x0c u32 maxCharacters (slot cap), @0x10 u8[?] name (UTF-16LE pascal: len@0x10, chars@0x12).
 * The remainder is zero-filled. message32-framed via buildLobbyResponseInner; payload = subarray(6).
 */
export function buildResponseInformationAccountInner({
  accountId = 0,
  name = '',
  ownedCharacterCount = 0,
  chargeState = 0,
  maxCharacters = 0,
} = {}) {
  const inner = buildLobbyResponseInner(RESPONSE_INFORMATION_ACCOUNT_CODE, RESPONSE_INFORMATION_ACCOUNT_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(accountId >>> 0, 0x00);
  payload.writeUInt32LE(ownedCharacterCount >>> 0, 0x04);
  payload.writeUInt32LE(chargeState >>> 0, 0x08);
  payload.writeUInt32LE(maxCharacters >>> 0, 0x0c);
  writeWideText(payload, name, 0x10, 0x12, 32);
  return inner;
}

// ===========================================================================
// 2. UN-CHARGE ROSTER — ResponseUnChargeCharacter 0x1003 (docs §5, 4004 B / 0x3e9 dw)
// ===========================================================================

// The available-slot roster is a list of character ids the account MAY charge/activate. With a u16
// count header and a documented 4-byte row (one character id per slot) the 4004-byte buffer holds up
// to floor((4004-2)/4) = 1000 ids — far more than any real roster. Per-field row meaning beyond the id
// is MEDIUM/LOW (docs §5); we honor the count anchor and the id column.
export const UNCHARGE_ROW_STRIDE = 4; // one u32 character id per available slot (documented stride)
export const UNCHARGE_HEADER = 2; // [u16 count]
export const MAX_UNCHARGE_ROWS = Math.floor((RESPONSE_UNCHARGE_CHARACTER_BYTES - UNCHARGE_HEADER) / UNCHARGE_ROW_STRIDE);

/**
 * Build a ResponseUnChargeCharacter (0x1003, 4004 B) — the roster of available/un-chartered character
 * ids the account may charge. Layout (HIGH confidence on the count anchor; row meaning MEDIUM):
 *   @0x00 u16 count, then `count` u32 character ids @0x02 stride 4.
 * `available` is the list of character ids; it is clamped to the buffer capacity. The remainder is
 * zero-filled. message32-framed.
 */
export function buildResponseUnChargeCharacterInner({ available = [] } = {}) {
  const inner = buildLobbyResponseInner(RESPONSE_UNCHARGE_CHARACTER_CODE, RESPONSE_UNCHARGE_CHARACTER_BYTES);
  const payload = inner.subarray(6);
  const ids = Array.from(available).slice(0, MAX_UNCHARGE_ROWS);
  payload.writeUInt16LE(ids.length & 0xffff, 0x00);
  for (let i = 0; i < ids.length; i += 1) {
    payload.writeUInt32LE((ids[i] ?? 0) >>> 0, UNCHARGE_HEADER + i * UNCHARGE_ROW_STRIDE);
  }
  return inner;
}

// ===========================================================================
// 3. ENTRY STATE — ResponseCharacterEntryState 0x1005 (docs §5, 32 B / 8 dw)
// ===========================================================================

/**
 * Build a ResponseCharacterEntryState (0x1005, 32 B / 8 dwords) — the active-character entry-state
 * block (copied to clientBase+0x359608). Tells the client which character the account currently has
 * "entered"/in-play plus availability flags. HIGH-confidence anchors (id/state at the top of the
 * 8-dword block; remaining dwords are availability flags, MEDIUM):
 *   @0x00 u32 activeCharacterId, @0x04 u32 entered (1 = in-play), @0x08 u32 availableSlots,
 *   @0x0c u32 ownedCount, @0x10..@0x1c u32[4] flags (zero-filled unless supplied).
 * message32-framed.
 */
export function buildResponseCharacterEntryStateInner({
  activeCharacterId = 0,
  entered = 0,
  availableSlots = 0,
  ownedCount = 0,
  flags = [],
} = {}) {
  const inner = buildLobbyResponseInner(RESPONSE_CHARACTER_ENTRY_STATE_CODE, RESPONSE_CHARACTER_ENTRY_STATE_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(activeCharacterId >>> 0, 0x00);
  payload.writeUInt32LE((entered ? 1 : entered >>> 0) >>> 0, 0x04);
  payload.writeUInt32LE(availableSlots >>> 0, 0x08);
  payload.writeUInt32LE(ownedCount >>> 0, 0x0c);
  for (let i = 0; i < 4; i += 1) {
    payload.writeUInt32LE((flags[i] ?? 0) >>> 0, 0x10 + i * 4);
  }
  return inner;
}

// ===========================================================================
// 4. CHARGE COMMANDS — CommandOriginalCharacterCharge 0x1006 / ExtensionCharacterCharge 0x1007 (docs §5)
// ===========================================================================

/**
 * Parse an inbound CommandOriginalCharacterCharge (0x1006, 24 B / 6 dwords). Selects/charges a canon
 * ("original") character into the account; apply FUN_004be760 raises UI event 0x1006. Raw inner =
 * [u16 BE code][body]. HIGH-confidence anchor: the target character id at the top of the 6-dword
 * command. Layout (per §5; trailing dwords are context/aux, MEDIUM):
 *   @0x00 u32 characterId, @0x04 u32 aux1, @0x08 u32 aux2, @0x0c..@0x14 u32[3] aux. Null if short.
 */
export function parseInboundOriginalCharacterCharge(inner) {
  const body = inner.subarray(2);
  if (body.length < 4) {
    return null;
  }
  const dwords = [];
  for (let i = 0; i + 4 <= body.length && i < COMMAND_ORIGINAL_CHARACTER_CHARGE_BYTES; i += 4) {
    dwords.push(body.readUInt32LE(i));
  }
  return { characterId: body.readUInt32LE(0x00), dwords };
}

/**
 * Parse an inbound CommandExtensionCharacterCharge (0x1007, 8 B / 2 dwords). Charges an extension/extra
 * character slot; apply FUN_004be780. Layout (§5): @0x00 u32 slotId/charId, @0x04 u32 aux. Null if short.
 */
export function parseInboundExtensionCharacterCharge(inner) {
  const body = inner.subarray(2);
  if (body.length < 8) {
    return null;
  }
  return { slotId: body.readUInt32LE(0x00), aux: body.readUInt32LE(0x04) };
}

// ===========================================================================
// 5. SOCIAL REMAINDER BUILDERS — 0x0f05 / 0x0f07 / 0x0f08 / 0x0f09 / 0x0f1d (docs §6a/§6b/§3)
// ===========================================================================

/**
 * Build a ResponseInformationMailAddress (0x0f05, 29204 B) — the bulk mail-address book (the player's
 * known mail/messenger contacts), copied whole to clientBase+0x448808; the apply FUN_005266e0 is a
 * stub ⇒ the UI reads the buffer directly. Internal layout is MEDIUM (docs §6a) — likely
 * `[u16 count][address record × N]`. We honor a HIGH-confidence count anchor @0x00 (u16) and a
 * documented row column (one contact char-id per row, stride 4 @0x02). Zero-fill otherwise so the
 * world-load sequence is satisfied with an honest (possibly empty) contact list. message32-framed.
 */
export function buildResponseMailAddressInner({ contacts = [] } = {}) {
  const inner = buildLobbyResponseInner(RESPONSE_MAIL_ADDRESS_CODE, RESPONSE_MAIL_ADDRESS_BYTES);
  const payload = inner.subarray(6);
  const ids = Array.from(contacts).slice(0, Math.floor((RESPONSE_MAIL_ADDRESS_BYTES - 2) / 4));
  payload.writeUInt16LE(ids.length & 0xffff, 0x00);
  for (let i = 0; i < ids.length; i += 1) {
    payload.writeUInt32LE((ids[i] ?? 0) >>> 0, 2 + i * 4);
  }
  return inner;
}

/**
 * Build a ResponseInformationMessengerStatus (0x0f07, 29900 B) — the presence roster (online/offline/
 * away of all the player's messenger contacts), pushed on login + on any contact presence change.
 * Internal layout MEDIUM/LOW (docs §6b); we honor a HIGH-confidence count anchor @0x00 (u16) and a
 * documented row of `[u32 charId][u32 status]` (stride 8 @0x02). `entries` = [{ charId, status }].
 * Zero-fill otherwise. message32-framed.
 */
export function buildResponseMessengerStatusInner({ entries = [] } = {}) {
  const inner = buildLobbyResponseInner(RESPONSE_MESSENGER_STATUS_CODE, RESPONSE_MESSENGER_STATUS_BYTES);
  const payload = inner.subarray(6);
  const rows = Array.from(entries).slice(0, Math.floor((RESPONSE_MESSENGER_STATUS_BYTES - 2) / 8));
  payload.writeUInt16LE(rows.length & 0xffff, 0x00);
  for (let i = 0; i < rows.length; i += 1) {
    const off = 2 + i * 8;
    payload.writeUInt32LE((rows[i]?.charId ?? 0) >>> 0, off);
    payload.writeUInt32LE((rows[i]?.status ?? 0) >>> 0, off + 4);
  }
  return inner;
}

/**
 * Build a TransactionInformationMailBegin (0x0f08, 296 B) — the mail-transfer "begin" framing message
 * the server sends to open a mail delivery sequence (followed by mail records, then a 1-byte status).
 * HIGH-confidence anchor: a count/handle of the transfer at the top. Layout (§6, MEDIUM beyond head):
 *   @0x00 u32 transferId, @0x04 u32 mailCount. Zero-fill otherwise. message32-framed.
 */
export function buildTransactionMailBeginInner({ transferId = 0, mailCount = 0 } = {}) {
  const inner = buildLobbyResponseInner(TRANSACTION_MAIL_BEGIN_CODE, TRANSACTION_MAIL_BEGIN_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(transferId >>> 0, 0x00);
  payload.writeUInt32LE(mailCount >>> 0, 0x04);
  return inner;
}

/**
 * Build a TransactionInformationMail status (0x0f09, 1 B) — the 1-byte transfer status marker the
 * client copies as the mail-transfer state (e.g. 1 = ok/continue). The §1 table assigns 0x0f0a to the
 * END record (a full 1884-B mail body) and 0x0f09 to the 1-byte status; this builder is the 0x0f09
 * status. message32-framed; single body byte.
 */
export function buildTransactionMailStatusInner({ status = 1 } = {}) {
  const inner = buildLobbyResponseInner(TRANSACTION_MAIL_STATUS_CODE, TRANSACTION_MAIL_STATUS_BYTES);
  inner.subarray(6).writeUInt8(status & 0xff, 0);
  return inner;
}

/**
 * Build the canonical CommandSpotChat (0x0f1d, 140 B) record in the RECEIVE form the other clients
 * render (case 0xf1d → FUN_004be680 → FUN_004be6f0(text@+10, msgLen@+8, ctx@+4)). 140-byte payload:
 *   [u32 time @0][u32 spot @4][u8 msgLen @8][u16[] message @10] (≤65 chars, UTF-16LE).
 * (GridChat 0x0f1c puts msgLen @9 and a castType byte @8; SpotChat dropped the castType, so msgLen is
 * @8 and the message starts @10.) This is the canonical spot-chat builder (the combat-engine also
 * references 0x0f1d, but this is the authoritative spot-chat record). message32-framed.
 */
export function buildCommandSpotChatInner({ text = '', spot = 0, time = 0 } = {}) {
  const inner = buildLobbyResponseInner(COMMAND_SPOT_CHAT_CODE, SPOT_CHAT_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt32LE(time >>> 0, 0);
  payload.writeUInt32LE(spot >>> 0, 4);
  writeWideText(payload, text, 8, 10, MAX_CHAT_TEXT);
  return inner;
}

// ===========================================================================
// 6. STATE — the authoritative per-account entitlement table
// ===========================================================================

/**
 * Create the in-memory account entitlement table. Keyed by connectionId (the caller's stable
 * per-connection key). Each account tracks: accountId, name, the set of OWNED character ids, the set
 * of AVAILABLE (un-chartered, chargeable) character ids, an extensionSlots count + entitlement cap,
 * billing/charge state, and the currently-active (entered) character id.
 */
export function createAccountState() {
  /**
   * @type {Map<number, {
   *   connectionId:number, accountId:number, name:string,
   *   owned:Set<number>, available:Set<number>,
   *   extensionSlots:number, maxExtensionSlots:number,
   *   chargeState:number, activeCharacterId:number,
   * }>}
   */
  const accounts = new Map();

  function ensure(connectionId) {
    let a = accounts.get(connectionId);
    if (!a) {
      a = {
        connectionId,
        accountId: 0,
        name: '',
        owned: new Set(),
        available: new Set(),
        extensionSlots: 0,
        maxExtensionSlots: 0,
        chargeState: 0,
        activeCharacterId: 0,
      };
      accounts.set(connectionId, a);
    }
    return a;
  }

  return {
    accounts,

    /** Register/refresh an account on world entry. `available`/`owned` seed the entitlement table. */
    join(connectionId, { accountId = 0, name = '', owned = [], available = [], maxExtensionSlots = 0, chargeState = 0 } = {}) {
      const a = ensure(connectionId);
      if (accountId) a.accountId = accountId >>> 0;
      if (name) a.name = String(name);
      for (const id of owned) a.owned.add(id >>> 0);
      for (const id of available) a.available.add(id >>> 0);
      if (maxExtensionSlots) a.maxExtensionSlots = maxExtensionSlots >>> 0;
      if (chargeState) a.chargeState = chargeState >>> 0;
      return a;
    },
    leave(connectionId) {
      accounts.delete(connectionId);
    },
    get(connectionId) {
      return accounts.get(connectionId);
    },
    has(connectionId) {
      return accounts.has(connectionId);
    },

    /**
     * Charge an "original" (canon) character: it must be in the account's AVAILABLE set (or AVAILABLE
     * is empty = open roster). On success it moves to OWNED + becomes the active-character, and is
     * removed from AVAILABLE. Returns { ok, reason?, account }.
     */
    chargeOriginal(connectionId, characterId) {
      const a = accounts.get(connectionId);
      if (!a) return { ok: false, reason: 'not-in-world' };
      const cid = characterId >>> 0;
      if (a.available.size > 0 && !a.available.has(cid)) {
        return { ok: false, reason: 'not-available' };
      }
      a.available.delete(cid);
      a.owned.add(cid);
      a.activeCharacterId = cid;
      return { ok: true, account: a };
    },

    /**
     * Charge an extension/extra slot: the account must have an extension entitlement (extensionSlots <
     * maxExtensionSlots; maxExtensionSlots 0 = unlimited/test). On success increments extensionSlots.
     * Returns { ok, reason?, account }.
     */
    chargeExtension(connectionId, slotId) {
      const a = accounts.get(connectionId);
      if (!a) return { ok: false, reason: 'not-in-world' };
      if (a.maxExtensionSlots > 0 && a.extensionSlots >= a.maxExtensionSlots) {
        return { ok: false, reason: 'no-entitlement' };
      }
      a.extensionSlots += 1;
      if (slotId) a.owned.add(slotId >>> 0);
      return { ok: true, account: a };
    },

    /** Snapshot the account-card fields (for buildResponseInformationAccountInner). */
    accountCard(connectionId) {
      const a = accounts.get(connectionId);
      if (!a) return null;
      return {
        accountId: a.accountId,
        name: a.name,
        ownedCharacterCount: a.owned.size,
        chargeState: a.chargeState,
        maxCharacters: a.maxExtensionSlots,
      };
    },

    /** Snapshot the entry-state fields (for buildResponseCharacterEntryStateInner). */
    entryState(connectionId) {
      const a = accounts.get(connectionId);
      if (!a) return null;
      return {
        activeCharacterId: a.activeCharacterId,
        entered: a.activeCharacterId ? 1 : 0,
        availableSlots: a.available.size,
        ownedCount: a.owned.size,
      };
    },

    /** Snapshot the available roster ids (for buildResponseUnChargeCharacterInner). */
    availableRoster(connectionId) {
      const a = accounts.get(connectionId);
      return a ? [...a.available] : [];
    },
  };
}

// ===========================================================================
// 7. process(ctx) — the domain entry the lead wires into the command engine
// ===========================================================================

/** Codes this domain owns for INBOUND C->S processing (the charge commands). */
export const ACCOUNT_COMMAND_CODES = new Set([
  COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE,
  COMMAND_EXTENSION_CHARACTER_CHARGE_CODE,
]);

/** @returns true if `innerCode` is an inbound account charge command owned by this domain. */
export function isAccountCommandCode(innerCode) {
  return ACCOUNT_COMMAND_CODES.has(innerCode);
}

/**
 * Build the standard world-entry account triplet a client expects after login: the available roster
 * (0x1003), the entry state (0x1005), and the account card (0x1001). Returns an array of
 * { inner, target:'self' } notifies. Use on world entry (the lead routes 'self' to the joining
 * connection only).
 */
export function buildAccountEntrySequence(state, connectionId) {
  const card = state.accountCard(connectionId) ?? {};
  const entry = state.entryState(connectionId) ?? {};
  const available = state.availableRoster(connectionId);
  return [
    { inner: buildResponseUnChargeCharacterInner({ available }), target: 'self' },
    { inner: buildResponseCharacterEntryStateInner(entry), target: 'self' },
    { inner: buildResponseInformationAccountInner(card), target: 'self' },
  ];
}

/**
 * Process an inbound account charge command from `connectionId`.
 *
 * Contract (matches logh7-command-engine / processSocial): returns
 *   { accept: boolean, reject?: string, notifies: [{ inner: Buffer, target: 'self'|'others'|'all' }] }.
 * On a valid charge the server mutates the active-character state and replies 0x1005 (entry state) +
 * 0x1001 (account card) to the SELF connection (docs §5/§7 step 3). Charge commands are private (no
 * broadcast). The caller frames + routes the 'self' notifies back to the originating connection.
 *
 * @param {{ state: ReturnType<createAccountState>, connectionId: number, innerCode: number, inner: Buffer }} args
 */
export function processAccount({ state, connectionId, innerCode, inner }) {
  const account = state.get(connectionId);
  if (!account) {
    return { accept: false, reject: 'not-in-world', notifies: [] };
  }

  // --- CommandOriginalCharacterCharge 0x1006 ---
  if (innerCode === COMMAND_ORIGINAL_CHARACTER_CHARGE_CODE) {
    const parsed = parseInboundOriginalCharacterCharge(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-original-charge', notifies: [] };
    }
    const result = state.chargeOriginal(connectionId, parsed.characterId);
    if (!result.ok) {
      return { accept: false, reject: result.reason, notifies: [] };
    }
    return {
      accept: true,
      characterId: parsed.characterId,
      notifies: [
        { inner: buildResponseCharacterEntryStateInner(state.entryState(connectionId)), target: 'self' },
        { inner: buildResponseInformationAccountInner(state.accountCard(connectionId)), target: 'self' },
      ],
    };
  }

  // --- CommandExtensionCharacterCharge 0x1007 ---
  if (innerCode === COMMAND_EXTENSION_CHARACTER_CHARGE_CODE) {
    const parsed = parseInboundExtensionCharacterCharge(inner);
    if (!parsed) {
      return { accept: false, reject: 'invalid-extension-charge', notifies: [] };
    }
    const result = state.chargeExtension(connectionId, parsed.slotId);
    if (!result.ok) {
      return { accept: false, reject: result.reason, notifies: [] };
    }
    return {
      accept: true,
      slotId: parsed.slotId,
      notifies: [
        { inner: buildResponseCharacterEntryStateInner(state.entryState(connectionId)), target: 'self' },
        { inner: buildResponseInformationAccountInner(state.accountCard(connectionId)), target: 'self' },
      ],
    };
  }

  return { accept: false, reject: 'unknown-account-command', notifies: [] };
}

// Re-export the framing helper passthrough so a caller can build a generic lobby record if needed.
export { buildLobbyResponseInner };
