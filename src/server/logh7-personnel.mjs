/**
 * Authoritative internal-affairs PERSONNEL (人事 / cards) engine — the
 * "appoint / dismiss / promote / demote → validate → mutate roster → broadcast notify" core.
 *
 * The LOGH VII client is a thin renderer for personnel actions: it SENDS a personnel command
 * (CommandRankUp 0x704 / CommandSpeciallyRankUp 0x705 / CommandRankDown 0x706 /
 * CommandCardAppointment 0x707 / CommandCardDismisal 0x708 / CommandCardResignation 0x709) and
 * only mutates its own card/seat tables when the server broadcasts the matching S→C record:
 * NotifyCardLoss 0x70a (remove a card from a seat array), NotifyCardLossMovedSpot 0x70b (card lost
 * + spot relocation), NotifyInformationCharacter 0x356 (full character delta), and
 * NotifyChangeFlagShip 0x358 (the outfit's live state record). So the SERVER owns the personnel
 * roster, the per-outfit seat tables, and the rank ladder. This module:
 *   - parses the six personnel commands (offsets per docs/logh7-proto-personnel-strategy.md §2),
 *   - validates rank bounds + seat ownership/capacity against an in-memory roster,
 *   - mutates that roster,
 *   - and supplies the S→C notify builders (0x70a/0x70b/0x356/0x358).
 *
 * EVIDENCE (Ghidra G7MTClient, index .omo/ghidra/export/G7MTClient) — see the spec doc for the full
 * per-field tables with vtable readers (FUN_006105b0=u8 / 00610600=u16 / 00610650=u32 / 006106f0=i16),
 * the get_length formulas, and the apply fns (CardAppointment apply FUN_004c5580 appends an 8-byte
 * seat entry {card id, role} to unit+0x274 and bumps unit+0x270; NotifyCardLoss apply FUN_004c0670
 * removes it; NotifyCardLossMovedSpot apply FUN_004c0790 writes the new spot at unit+0x40/+0x44).
 *
 * SELF-CONTAINED: exports the message CODES, parseInbound* / buildNotify* / build*Record functions,
 * a createPersonnelState factory, and a processPersonnel(ctx) entry. The lead wires the 0x704..0x709
 * range to processPersonnel in logh7-command-engine.mjs. Pure + synchronous => fully unit-testable.
 */

import { buildLobbyResponseInner, buildMpsClientMessage32Inner } from './logh7-login-protocol.mjs';

// ---- personnel (人事 / cards) message codes (docs/logh7-proto-personnel-strategy.md §1 dispatch table) ----
export const COMMAND_RANK_UP_CODE = 0x0704; // C->S CommandRankUp          (≤160B, get_length 0x1a + count*4)
export const COMMAND_SPECIALLY_RANK_UP_CODE = 0x0705; // C->S CommandSpeciallyRankUp  (≤16168B)
export const COMMAND_RANK_DOWN_CODE = 0x0706; // C->S CommandRankDown        (≤168B, 0x1d + count*4)
export const COMMAND_CARD_APPOINTMENT_CODE = 0x0707; // C->S CommandCardAppointment (40B fixed, apply FUN_004c5580)
export const COMMAND_CARD_DISMISAL_CODE = 0x0708; // C->S CommandCardDismisal    (≤160B, 0x1d + count*4)
export const COMMAND_CARD_RESIGNATION_CODE = 0x0709; // C->S CommandCardResignation (≤156B)

export const NOTIFY_CARD_LOSS_CODE = 0x070a; // S->C NotifyCardLoss            (12B: owner, silent, u16 card)
export const NOTIFY_CARD_LOSS_MOVED_SPOT_CODE = 0x070b; // S->C NotifyCardLossMovedSpot   (16B: owner, x, y)
export const NOTIFY_INFORMATION_CHARACTER_CODE = 0x0356; // S->C NotifyInformationCharacter (728B char delta)
export const NOTIFY_CHANGE_FLAGSHIP_CODE = 0x0358; // S->C NotifyChangeFlagShip      (92B outfit-state record)

// Wire sizes (S->C records) — dispatch ceilings from FUN_004b8b00 / recv dword copies in FUN_004ba2b0.
export const NOTIFY_CARD_LOSS_BYTES = 12; // recv copies 3 dwords to &DAT_004327b0
export const NOTIFY_CARD_LOSS_MOVED_SPOT_BYTES = 16; // recv copies 4 dwords to &DAT_004327bc
export const NOTIFY_CHANGE_FLAGSHIP_BYTES = 0x5c; // 92 — recv copies 0x17 dwords to &DAT_004332d0

// Rank ladder bounds (LOGH VII has 14 ranks; spec §2 "1..14 rank ladder"). gin7 manual = 14 階級.
export const MIN_RANK = 1;
export const MAX_RANK = 14;
// Seat array cap: CardAppointment apply caps unit+0x270 at 0x10 (16 cards per outfit). spec §2.4.
export const MAX_SEATS_PER_OUTFIT = 16;
// move_character[] refresh-id array is bounded at 32 (u8 count, loop bound). spec §2.1.
export const MAX_MOVE_CHARACTERS = 32;
// down_achievement_character[] is bounded at 2000 (u16 count, 0x7d0). spec §2.2.
export const MAX_DOWN_ACHIEVEMENT = 2000;

// Shared personnel command header: 4 dwords (time + 3 header/context dwords). spec §2.
const PERSONNEL_HEADER = 0x10;

/** Read a u32[] of `count` ids from `body` at `off` (stride 4); stops at buffer end. */
function readU32Array(body, off, count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const at = off + i * 4;
    if (at + 4 > body.length) {
      break;
    }
    out.push(body.readUInt32LE(at));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// PARSERS (C->S). All bodies little-endian; inner = [u16 BE code][body], so parse body=inner.subarray(2).
// ---------------------------------------------------------------------------------------------------

/**
 * Parse CommandRankUp 0x704 (spec §2.1, parser FUN_0043c150, get_length 0x1a + count*4). Promote a
 * card by merit. Body: time@0x00, hdr1..3@0x04..0x0c, target_rank u8@0x10, achievement u32@0x14,
 * move_spot u32@0x18, move_character_size u8@0x1c, move_character[] u32 @0x20 stride 4. Null if short.
 */
export function parseInboundRankUp(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x1d) {
    return null;
  }
  const targetRank = body.readUInt8(0x10);
  const achievement = body.readUInt32LE(0x14);
  const moveSpot = body.readUInt32LE(0x18);
  const moveCount = Math.min(body.readUInt8(0x1c), MAX_MOVE_CHARACTERS);
  const moveCharacters = readU32Array(body, 0x20, moveCount);
  return { time: body.readUInt32LE(0x00), targetRank, achievement, moveSpot, moveCharacters };
}

/**
 * Parse CommandSpeciallyRankUp 0x705 (spec §2.2, parser FUN_0043c710, get_length
 * 0x1b + downAch*8 + 5 + moveChar*4). Mass/special promotion funded by spending other chars'
 * achievement. Body: time@0x00, hdr1..3, target_character u32@0x10, target_goto_rank u8@0x14,
 * achievement u32@0x18, down_achievement_character_size u16@0x1c, down_achievement_character[]
 * {u32 character,u32 achievement} @0x20 stride 8, then move_spot u32, move_character_size u8,
 * move_character[] u32. Null if short.
 */
export function parseInboundSpeciallyRankUp(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x1e) {
    return null;
  }
  const targetCharacter = body.readUInt32LE(0x10);
  const targetGotoRank = body.readUInt8(0x14);
  const achievement = body.readUInt32LE(0x18);
  const downCount = Math.min(body.readUInt16LE(0x1c), MAX_DOWN_ACHIEVEMENT);
  const downAchievement = [];
  let off = 0x20;
  for (let i = 0; i < downCount; i += 1) {
    if (off + 8 > body.length) {
      break;
    }
    downAchievement.push({ character: body.readUInt32LE(off), achievement: body.readUInt32LE(off + 4) });
    off += 8;
  }
  // trailing move_spot (u32) + move_character_size (u8) + move_character[] (u32), present iff body long enough.
  let moveSpot = 0;
  let moveCharacters = [];
  if (off + 5 <= body.length) {
    moveSpot = body.readUInt32LE(off);
    const moveCount = Math.min(body.readUInt8(off + 4), MAX_MOVE_CHARACTERS);
    moveCharacters = readU32Array(body, off + 5, moveCount);
  }
  return { time: body.readUInt32LE(0x00), targetCharacter, targetGotoRank, achievement, downAchievement, moveSpot, moveCharacters };
}

/**
 * Parse CommandRankDown 0x706 (spec §2.3, parser FUN_0043d080, get_length 0x1d + count*4). Demote a
 * card. Body: time@0x00, hdr1..3, target_rank u8@0x10, target_character u32@0x14,
 * exec_character_achievement u32@0x18, rankchanged_character_achievement u32@0x1c, move_spot u32@0x20,
 * move_character_size u8@0x24, move_character[] u32 @0x28 stride 4. Null if short.
 */
export function parseInboundRankDown(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x25) {
    return null;
  }
  const targetRank = body.readUInt8(0x10);
  const targetCharacter = body.readUInt32LE(0x14);
  const execAchievement = body.readUInt32LE(0x18);
  const achievement = body.readUInt32LE(0x1c);
  const moveSpot = body.readUInt32LE(0x20);
  const moveCount = Math.min(body.readUInt8(0x24), MAX_MOVE_CHARACTERS);
  const moveCharacters = readU32Array(body, 0x28, moveCount);
  return { time: body.readUInt32LE(0x00), targetRank, targetCharacter, execAchievement, achievement, moveSpot, moveCharacters };
}

/**
 * Parse CommandCardAppointment 0x707 (spec §2.4, 40B fixed, apply FUN_004c5580 — highest playability).
 * Appoint a card to a seat. Body: time@0x00, hdr1..3@0x04..0x0c, target_outfit u32@0x10, hdr4 u32@0x14,
 * card_character u32@0x18, seat_role u32@0x1c, chief_spot u32@0x20, tail u32@0x24. Null if short.
 */
export function parseInboundCardAppointment(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x24) {
    return null;
  }
  return {
    time: body.readUInt32LE(0x00),
    targetOutfit: body.readUInt32LE(0x10),
    cardCharacter: body.readUInt32LE(0x18),
    seatRole: body.readUInt32LE(0x1c),
    chiefSpot: body.readUInt32LE(0x20),
  };
}

/**
 * Parse CommandCardDismisal 0x708 (spec §2.5, parser FUN_0043da60, get_length 0x1d + count*4). Dismiss
 * a card from a seat. Body: time@0x00, hdr1..3, target_character u32@0x10, card u32@0x14, move_spot
 * u32@0x18, move_character_size u8@0x1c, move_character[] u32 @0x20 stride 4. Null if short.
 */
export function parseInboundCardDismisal(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x1d) {
    return null;
  }
  const targetCharacter = body.readUInt32LE(0x10);
  const card = body.readUInt32LE(0x14);
  const moveSpot = body.readUInt32LE(0x18);
  const moveCount = Math.min(body.readUInt8(0x1c), MAX_MOVE_CHARACTERS);
  const moveCharacters = readU32Array(body, 0x20, moveCount);
  return { time: body.readUInt32LE(0x00), targetCharacter, card, moveSpot, moveCharacters };
}

/**
 * Parse CommandCardResignation 0x709 (spec §2.6, parser FUN_0043e020, get_length FUN_0043b820).
 * Voluntary resignation. Body: time@0x00, hdr1..3, card u32@0x10, move_spot u32@0x14,
 * move_character_size u8@0x18, move_character[] u32 @0x1c stride 4. Null if short.
 */
export function parseInboundCardResignation(inner) {
  const body = inner.subarray(2);
  if (body.length < 0x19) {
    return null;
  }
  const card = body.readUInt32LE(0x10);
  const moveSpot = body.readUInt32LE(0x14);
  const moveCount = Math.min(body.readUInt8(0x18), MAX_MOVE_CHARACTERS);
  const moveCharacters = readU32Array(body, 0x1c, moveCount);
  return { time: body.readUInt32LE(0x00), card, moveSpot, moveCharacters };
}

// ---------------------------------------------------------------------------------------------------
// BUILDERS (S->C). 0x70a/0x70b are bare [u16 BE code][LE body] receive records (the dispatch copies
// raw dwords); 0x356/0x358 are message32-wrapped objects (like the lobby/conn3 replies). Per spec §2.7,
// §2.8, §4.1, §4.2.
// ---------------------------------------------------------------------------------------------------

/**
 * Build NotifyCardLoss 0x70a (spec §2.7, 12B, apply FUN_004c0670). Removes a card from the seat array
 * `unit+0x274` of every unit whose owner == `owner`. Body: hdr/time u32@0x00, owner u32@0x04, silent
 * u8@0x08 (0 = play UI sound), card_id u16@0x0a. Receive form = bare [u16 BE code][LE 12B body].
 */
export function buildNotifyCardLossInner({ owner = 0, cardId = 0, silent = false, time = 0 } = {}) {
  const inner = Buffer.alloc(2 + NOTIFY_CARD_LOSS_BYTES);
  inner.writeUInt16BE(NOTIFY_CARD_LOSS_CODE & 0xffff, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(time >>> 0, 0x00);
  body.writeUInt32LE(owner >>> 0, 0x04);
  body.writeUInt8(silent ? 1 : 0, 0x08);
  body.writeUInt16LE(cardId & 0xffff, 0x0a);
  return inner;
}

/**
 * Build NotifyCardLossMovedSpot 0x70b (spec §2.8, 16B, apply FUN_004c0790). Updates the matched unit's
 * position pair (unit+0x40/+0x44) — the card's seat relocated. Body: hdr/time u32@0x00, owner u32@0x04,
 * spot_x_or_a u32@0x08, spot_y_or_b u32@0x0c. Receive form = bare [u16 BE code][LE 16B body].
 */
export function buildNotifyCardLossMovedSpotInner({ owner = 0, spotX = 0, spotY = 0, time = 0 } = {}) {
  const inner = Buffer.alloc(2 + NOTIFY_CARD_LOSS_MOVED_SPOT_BYTES);
  inner.writeUInt16BE(NOTIFY_CARD_LOSS_MOVED_SPOT_CODE & 0xffff, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(time >>> 0, 0x00);
  body.writeUInt32LE(owner >>> 0, 0x04);
  body.writeUInt32LE(spotX >>> 0, 0x08);
  body.writeUInt32LE(spotY >>> 0, 0x0c);
  return inner;
}

/**
 * Build NotifyChangeFlagShip 0x358 (spec §4.2, 92B, recv copies 0x17 dwords to &DAT_004332d0, apply
 * FUN_005266e0). Despite the name this carries the outfit's live combat/logistics state. Wire order
 * (printer FUN_0042f930): character u32@0x00, hdr1 u32@0x04, kind u16@0x08, mode u8@0x0a, grid u32@0x0c,
 * outfit u32@0x10, boarding_ship u32@0x14, troop_units u8@0x18, then base/morale/rebellion/damaged/
 * destroyed/supplies/mobilization/cruising. The trailing field byte offsets after troop_units depend on
 * the in-memory troop array stride (spec open-question §6, confidence medium); we pack them contiguously
 * from 0x1c in the printed order so the high-confidence head (char..boarding_ship..troop_units) is exact.
 * message32-wrapped (S->C conn3 record).
 */
export function buildNotifyChangeFlagShipInner({
  character = 0, kind = 0, mode = 0, grid = 0, outfit = 0, boardingShip = 0, troopUnits = 0,
  base = 0, moraleMax = 0, rebellion = 0, damaged = 0, destroyed = 0, supplies = 0, mobilization = 0,
  cruising = 0,
} = {}) {
  const body = Buffer.alloc(NOTIFY_CHANGE_FLAGSHIP_BYTES);
  body.writeUInt32LE(character >>> 0, 0x00);
  body.writeUInt16LE(kind & 0xffff, 0x08);
  body.writeUInt8(mode & 0xff, 0x0a);
  body.writeUInt32LE(grid >>> 0, 0x0c);
  body.writeUInt32LE(outfit >>> 0, 0x10);
  body.writeUInt32LE(boardingShip >>> 0, 0x14);
  body.writeUInt8(troopUnits & 0xff, 0x18);
  // trailing logistics block (contiguous after troop_units; confidence-medium byte offsets per spec §6).
  body.writeUInt32LE(base >>> 0, 0x1c);
  body.writeUInt8(moraleMax & 0xff, 0x20);
  body.writeUInt8(rebellion & 0xff, 0x21);
  body.writeUInt16LE(damaged & 0xffff, 0x22);
  body.writeUInt16LE(destroyed & 0xffff, 0x24);
  body.writeUInt32LE(supplies >>> 0, 0x28);
  body.writeUInt32LE(mobilization >>> 0, 0x2c);
  body.writeFloatLE(cruising, 0x30);
  return buildMpsClientMessage32Inner({ code: NOTIFY_CHANGE_FLAGSHIP_CODE, payload: body });
}

/**
 * Build NotifyInformationCharacter 0x356 (spec §4.1, 728B). The body field-stream is IDENTICAL to the
 * 0x0323 ResponseInformationCharacter record (recv case 0x356 deserializes the same fields, then calls
 * FUN_004c0400 = g_StrategyCommandTray.Update — a single-character delta push). So we reuse the exact
 * 0x0323 body layout (id@0x00, faction@0x04, spot@0x1c, flagship/grid-unit@0x24, ability_8@0x188, name/
 * rank/face in the parentage[0] sub-record @0x80) and only swap the message code to 0x356. message32-
 * wrapped. The dispatch ceiling is 0x2d8 (728); the 0x0323 record is 0x02d4 (724) — both placeable.
 */
export function buildNotifyInformationCharacterInner({
  characterId = 1, gridUnitId = 0, power = null, spot = null, spotOwner = null, abilities = null,
  online = false, lastname = null, firstname = null, rank = null, face = null,
} = {}) {
  // The 0x0323 body layout is the high-confidence proven record; we emit the same bytes under code 0x356.
  const RECORD_BYTES = 0x02d4; // SS_RESP_INFO_CHARACTER_RECORD_BYTES (724) — same field stream as 0x0323.
  const payload = Buffer.alloc(RECORD_BYTES);
  payload.writeUInt32LE(characterId >>> 0, 0x00);
  payload.writeUInt32LE(gridUnitId >>> 0, 0x24);
  if (Number.isInteger(power)) payload.writeUInt8(power & 0xff, 0x04);
  if (Number.isInteger(spot)) payload.writeUInt32LE(spot >>> 0, 0x1c);
  if (Number.isInteger(spotOwner)) payload.writeUInt32LE(spotOwner >>> 0, 0x20);
  if (online) payload.writeUInt8(1, 0x64);
  if (Array.isArray(abilities)) {
    for (let i = 0; i < 8 && i < abilities.length; i += 1) {
      payload.writeUInt16LE((abilities[i] ?? 0) & 0xffff, 0x188 + i * 4);
    }
  }
  const P0 = 0x80;
  const writePstr16 = (str, lenOff, charsOff) => {
    const codes = [...String(str)].slice(0, 13);
    payload.writeUInt8(codes.length, lenOff);
    for (let i = 0; i < codes.length; i += 1) payload.writeUInt16LE(codes[i].charCodeAt(0) & 0xffff, charsOff + i * 2);
  };
  if (lastname != null) writePstr16(lastname, P0 + 0x01, P0 + 0x02);
  if (firstname != null) writePstr16(firstname, P0 + 0x1c, P0 + 0x1e);
  if (Number.isInteger(rank)) payload.writeUInt16LE(rank & 0xffff, P0 + 0x56);
  if (Number.isInteger(face)) payload.writeUInt32LE(face >>> 0, P0 + 0x74);
  return buildMpsClientMessage32Inner({ code: NOTIFY_INFORMATION_CHARACTER_CODE, payload });
}

// ---------------------------------------------------------------------------------------------------
// STATE — the authoritative personnel roster: characters (rank/spot/owner/achievement) and outfits
// (per-outfit seat array + chief). createPersonnelState() builds an empty roster; helpers seed/query/
// mutate it. process() validates against it.
// ---------------------------------------------------------------------------------------------------

/**
 * @typedef {{ id:number, rank:number, spot:number, owner:number, achievement:number }} PersonnelChar
 * @typedef {{ id:number, owner:number, chief:number, seats:{ character:number, role:number }[] }} Outfit
 */

/** Create an empty authoritative personnel roster. */
export function createPersonnelState() {
  /** @type {Map<number, PersonnelChar>} */
  const characters = new Map();
  /** @type {Map<number, Outfit>} */
  const outfits = new Map();

  return {
    characters,
    outfits,

    /** Seed/replace a character. owner 0 = neutral (any connection may command it). */
    addCharacter({ id, rank = MIN_RANK, spot = 0, owner = 0, achievement = 0 }) {
      const ch = { id: id >>> 0, rank, spot, owner, achievement };
      characters.set(ch.id, ch);
      return ch;
    },
    getCharacter(id) {
      return characters.get(id >>> 0) ?? null;
    },

    /** Seed/replace an outfit (unit) with an empty seat array. */
    addOutfit({ id, owner = 0, chief = 0 }) {
      const outfit = { id: id >>> 0, owner, chief, seats: [] };
      outfits.set(outfit.id, outfit);
      return outfit;
    },
    getOutfit(id) {
      return outfits.get(id >>> 0) ?? null;
    },

    /** Append a card to an outfit's seat array (cap MAX_SEATS_PER_OUTFIT). Returns the seat or null. */
    appointCard(outfitId, { character, role = 0, chief = null }) {
      const outfit = outfits.get(outfitId >>> 0);
      if (!outfit || outfit.seats.length >= MAX_SEATS_PER_OUTFIT) {
        return null;
      }
      const seat = { character: character >>> 0, role: role >>> 0 };
      outfit.seats.push(seat);
      if (chief != null) {
        outfit.chief = chief >>> 0;
      }
      return seat;
    },

    /**
     * Remove a card (by character id) from whichever outfit holds it. Returns { outfit, owner } of the
     * outfit it was removed from, or null when the card is not seated anywhere.
     */
    removeCard(characterId) {
      const cid = characterId >>> 0;
      for (const outfit of outfits.values()) {
        const idx = outfit.seats.findIndex((s) => s.character === cid);
        if (idx >= 0) {
          outfit.seats.splice(idx, 1);
          return { outfit, owner: outfit.owner };
        }
      }
      return null;
    },

    /** Set a character's rank + (optionally) spot. Returns the char or null if unknown. */
    setRank(characterId, rank, spot = null) {
      const ch = characters.get(characterId >>> 0);
      if (!ch) {
        return null;
      }
      ch.rank = rank;
      if (spot != null) {
        ch.spot = spot >>> 0;
      }
      return ch;
    },

    /** Move a character to a spot. Returns the char or null. */
    moveSpot(characterId, spot) {
      const ch = characters.get(characterId >>> 0);
      if (!ch) {
        return null;
      }
      ch.spot = spot >>> 0;
      return ch;
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// process() — the validate → mutate → broadcast entry the lead routes 0x0704..0x0709 to.
// ---------------------------------------------------------------------------------------------------

const rankInBounds = (rank) => Number.isInteger(rank) && rank >= MIN_RANK && rank <= MAX_RANK;

/**
 * Ownership check: a connection may command character `id` only when the char is unknown (not seeded),
 * neutral (owner 0), or owned by this connection. Mirrors the combat-engine ownership guard.
 */
function ownsCharacter(state, characterId, connectionId) {
  const ch = state.getCharacter(characterId);
  return !ch || ch.owner === 0 || ch.owner === connectionId;
}

function ownsOutfit(state, outfitId, connectionId) {
  const outfit = state.getOutfit(outfitId);
  return !outfit || outfit.owner === 0 || outfit.owner === connectionId;
}

/**
 * Process an inbound personnel command from `connectionId`. Validates (rank bounds, seat ownership +
 * capacity), mutates the authoritative roster, and returns the S→C notifies the other/all clients
 * render.
 *
 * @param {{ state: ReturnType<createPersonnelState>, connectionId: number, innerCode: number, inner: Buffer }} args
 * @returns {{ accept: boolean, reject?: string, notifies: { inner: Buffer, target: 'others'|'all' }[] }}
 */
export function processPersonnel({ state, connectionId, innerCode, inner }) {
  switch (innerCode) {
    case COMMAND_CARD_APPOINTMENT_CODE: {
      // APPOINT a card into a seat (mirror client apply FUN_004c5580: append {card,role} to seat array,
      // set chief). Validate the actor owns the target outfit and the seat array isn't full (≤16).
      const cmd = parseInboundCardAppointment(inner);
      if (!cmd) {
        return { accept: false, reject: 'invalid-card-appointment', notifies: [] };
      }
      if (!ownsOutfit(state, cmd.targetOutfit, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // Auto-seed an outfit so a forged/unseeded id still has a roster home (owner = actor).
      if (!state.getOutfit(cmd.targetOutfit)) {
        state.addOutfit({ id: cmd.targetOutfit, owner: connectionId });
      }
      const seat = state.appointCard(cmd.targetOutfit, {
        character: cmd.cardCharacter, role: cmd.seatRole, chief: cmd.chiefSpot,
      });
      if (!seat) {
        return { accept: false, reject: 'seat-full', notifies: [] };
      }
      state.moveSpot(cmd.cardCharacter, cmd.chiefSpot);
      // Broadcast the updated character (0x356) + the outfit's live state (0x358) to ALL viewers.
      const ch = state.getCharacter(cmd.cardCharacter);
      return {
        accept: true,
        outfit: cmd.targetOutfit,
        notifies: [
          {
            inner: buildNotifyInformationCharacterInner({
              characterId: cmd.cardCharacter, spot: cmd.chiefSpot, rank: ch?.rank ?? null,
            }),
            target: 'all',
          },
          {
            inner: buildNotifyChangeFlagShipInner({
              outfit: cmd.targetOutfit, character: cmd.chiefSpot, troopUnits: state.getOutfit(cmd.targetOutfit).seats.length,
            }),
            target: 'all',
          },
        ],
      };
    }

    case COMMAND_CARD_DISMISAL_CODE:
    case COMMAND_CARD_RESIGNATION_CODE: {
      // DISMISS (0x708) / RESIGN (0x709): remove the card from its seat, relocate the char to move_spot.
      // Broadcast NotifyCardLoss (0x70a) so every holder shifts it out of the seat array; if the spot
      // also moved, NotifyCardLossMovedSpot (0x70b).
      const cmd =
        innerCode === COMMAND_CARD_DISMISAL_CODE ? parseInboundCardDismisal(inner) : parseInboundCardResignation(inner);
      if (!cmd) {
        return { accept: false, reject: innerCode === COMMAND_CARD_DISMISAL_CODE ? 'invalid-card-dismisal' : 'invalid-card-resignation', notifies: [] };
      }
      // The card id to vacate: dismissal carries both target_character + card; resignation only `card`.
      const characterId = innerCode === COMMAND_CARD_DISMISAL_CODE ? cmd.targetCharacter : cmd.card;
      if (!ownsCharacter(state, characterId, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      const removed = state.removeCard(characterId);
      state.moveSpot(characterId, cmd.moveSpot);
      const owner = removed?.owner ?? 0;
      const notifies = [
        {
          inner: buildNotifyCardLossInner({ owner, cardId: characterId & 0xffff, silent: false, time: cmd.time }),
          target: 'all',
        },
      ];
      if (cmd.moveSpot) {
        notifies.push({
          inner: buildNotifyCardLossMovedSpotInner({ owner, spotX: cmd.moveSpot, spotY: 0, time: cmd.time }),
          target: 'all',
        });
      }
      return { accept: true, character: characterId, notifies };
    }

    case COMMAND_RANK_UP_CODE: {
      // PROMOTE by merit: validate the new rank is on the ladder (1..14), apply rank + spot move,
      // broadcast the updated character (0x356). move_character[] = the extra ids to re-push.
      const cmd = parseInboundRankUp(inner);
      if (!cmd) {
        return { accept: false, reject: 'invalid-rank-up', notifies: [] };
      }
      if (!rankInBounds(cmd.targetRank)) {
        return { accept: false, reject: 'rank-out-of-bounds', notifies: [] };
      }
      // The promoted char is the first refresh id (move_character[0]); fall back to none.
      const targetId = cmd.moveCharacters[0] ?? 0;
      if (targetId && !ownsCharacter(state, targetId, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      if (targetId) {
        state.setRank(targetId, cmd.targetRank, cmd.moveSpot);
      }
      const notifies = buildCharacterRefreshNotifies(state, cmd.moveCharacters, { rank: cmd.targetRank, spot: cmd.moveSpot });
      return { accept: true, targetRank: cmd.targetRank, notifies };
    }

    case COMMAND_RANK_DOWN_CODE: {
      // DEMOTE: validate rank ladder, apply to target_character, broadcast 0x356.
      const cmd = parseInboundRankDown(inner);
      if (!cmd) {
        return { accept: false, reject: 'invalid-rank-down', notifies: [] };
      }
      if (!rankInBounds(cmd.targetRank)) {
        return { accept: false, reject: 'rank-out-of-bounds', notifies: [] };
      }
      if (!ownsCharacter(state, cmd.targetCharacter, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      state.setRank(cmd.targetCharacter, cmd.targetRank, cmd.moveSpot);
      const notifies = [
        {
          inner: buildNotifyInformationCharacterInner({
            characterId: cmd.targetCharacter, rank: cmd.targetRank, spot: cmd.moveSpot,
          }),
          target: 'all',
        },
      ];
      return { accept: true, targetCharacter: cmd.targetCharacter, targetRank: cmd.targetRank, notifies };
    }

    case COMMAND_SPECIALLY_RANK_UP_CODE: {
      // SPECIAL/mass promotion funded by spending other chars' achievement. Validate the jump rank,
      // debit each down_achievement entry, set the promoted char's rank, broadcast 0x356 for the target
      // (+ each debited char so their merit display updates).
      const cmd = parseInboundSpeciallyRankUp(inner);
      if (!cmd) {
        return { accept: false, reject: 'invalid-specially-rank-up', notifies: [] };
      }
      if (!rankInBounds(cmd.targetGotoRank)) {
        return { accept: false, reject: 'rank-out-of-bounds', notifies: [] };
      }
      if (!ownsCharacter(state, cmd.targetCharacter, connectionId)) {
        return { accept: false, reject: 'not-owner', notifies: [] };
      }
      // Debit each funder's achievement (clamped at 0).
      for (const entry of cmd.downAchievement) {
        const ch = state.getCharacter(entry.character);
        if (ch) {
          ch.achievement = Math.max(0, ch.achievement - entry.achievement);
        }
      }
      state.setRank(cmd.targetCharacter, cmd.targetGotoRank, cmd.moveSpot || null);
      const notifies = [
        {
          inner: buildNotifyInformationCharacterInner({
            characterId: cmd.targetCharacter, rank: cmd.targetGotoRank, spot: cmd.moveSpot || null,
          }),
          target: 'all',
        },
      ];
      for (const entry of cmd.downAchievement) {
        notifies.push({
          inner: buildNotifyInformationCharacterInner({ characterId: entry.character }),
          target: 'all',
        });
      }
      return { accept: true, targetCharacter: cmd.targetCharacter, targetRank: cmd.targetGotoRank, notifies };
    }

    default:
      return { accept: false, reject: 'unknown-personnel-command', notifies: [] };
  }
}

/**
 * Build one 0x356 NotifyInformationCharacter per id in `moveCharacters` (the refresh list). The first
 * id is the action's primary target and receives the new rank/spot; the rest are plain re-pushes.
 */
function buildCharacterRefreshNotifies(state, moveCharacters, { rank = null, spot = null } = {}) {
  const notifies = [];
  moveCharacters.forEach((id, i) => {
    const ch = state.getCharacter(id);
    notifies.push({
      inner: buildNotifyInformationCharacterInner({
        characterId: id,
        rank: i === 0 ? rank : ch?.rank ?? null,
        spot: i === 0 ? spot : ch?.spot ?? null,
      }),
      target: 'all',
    });
  });
  return notifies;
}

// Re-export framing helper passthroughs so a caller can build a generic lobby record if needed.
export { buildLobbyResponseInner };
