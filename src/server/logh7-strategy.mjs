/**
 * Authoritative STRATEGY / OUTFIT (内政 strategy-side) engine — the 0x09xx family.
 *
 * Self-contained module (no edits to command-engine / world-state / login-protocol). It owns:
 *   - a per-faction STRATEGY PLAN QUEUE (CommandMakePlan 0x900 enqueues, CommandWithdrawalPlan 0x901
 *     dequeues, CommandAnnouncement 0x902 posts an order), resolved with NotifyFinishStrategyPlan 0x908,
 *   - an OUTFIT (fleet organisation) REGISTRY (CommandCreateOutfit 0x903 instantiates a new outfit,
 *     CommandDeleteOutfit 0x906 disbands), announced with NotifyCreateOutfitBegin/End 0x904/0x905 and
 *     NotifyDeleteOutfit 0x907.
 *
 * FRAMING (matches the combat work):
 *   - C->S inner = [u16 BE code][LE body]; parsers read inner.subarray(2).
 *   - S->C inner is built via buildLobbyResponseInner(code, byteLen) (message32: [u32 BE 0][u16 BE code]
 *     [LE payload]); the LE payload starts at inner.subarray(6).
 *
 * WIRE EVIDENCE: docs/logh7-proto-personnel-strategy.md §1 (dispatch sizes), §3 (0x09xx layouts),
 * §3.4 (CreateOutfit field table), §3.6 (Begin/End/Finish). Static RE of G7MTClient.exe (Ghidra index
 * .omo/ghidra/export/G7MTClient). Bodies are little-endian. Confidence flags honoured: MakePlan /
 * WithdrawalPlan / Announcement sub-field splits are confidence-MEDIUM (sizes + shared header confirmed),
 * DeleteOutfit inner id table is confidence-LOW (ceiling + apply confirmed) — those parsers extract the
 * high-confidence header dwords and surface the rest as raw payload rather than inventing a layout.
 *
 * Pure + synchronous => fully unit-testable without a live client.
 */
import {
  buildLobbyResponseInner,
} from './logh7-login-protocol.mjs';

// ---- message codes (command tray PTR @0x768704, dispatch sizer FUN_004b8b00) ----
export const COMMAND_MAKE_PLAN_CODE = 0x0900; // C->S CommandMakePlan        (body 0x1c = 28B, 7 dwords)
export const COMMAND_WITHDRAWAL_PLAN_CODE = 0x0901; // C->S CommandWithdrawalPlan  (body 0x18 = 24B, 6 dwords)
export const COMMAND_ANNOUNCEMENT_CODE = 0x0902; // C->S CommandAnnouncement    (body 0x28 = 40B, 10 dwords)
export const COMMAND_CREATE_OUTFIT_CODE = 0x0903; // C->S CommandCreateOutfit    (body ≤0x324, get_length)
export const NOTIFY_CREATE_OUTFIT_BEGIN_CODE = 0x0904; // S->C NotifyCreateOutfitBegin (body 4B, body[0]=new id)
export const NOTIFY_CREATE_OUTFIT_END_CODE = 0x0905; // S->C NotifyCreateOutfitEnd   (dispatch 0x8c=140B; body[0]=new id)
export const COMMAND_DELETE_OUTFIT_CODE = 0x0906; // C->S CommandDeleteOutfit    (body ≤0x2b94; id table, conf-LOW)
export const NOTIFY_DELETE_OUTFIT_CODE = 0x0907; // S->C NotifyDeleteOutfit      (paired with 0x906)
export const NOTIFY_FINISH_STRATEGY_PLAN_CODE = 0x0908; // S->C NotifyFinishStrategyPlan (body 0x10; body[0..2] used)

// ---- dispatch sizes (ground truth, FUN_004b8b00 / FUN_004ba2b0 dword copies) ----
export const COMMAND_MAKE_PLAN_BYTES = 0x1c; // 28
export const COMMAND_WITHDRAWAL_PLAN_BYTES = 0x18; // 24
export const COMMAND_ANNOUNCEMENT_BYTES = 0x28; // 40
export const NOTIFY_CREATE_OUTFIT_BEGIN_BYTES = 0x04; // body[0] = outfit id (stashed at 0x4348f8)
export const NOTIFY_CREATE_OUTFIT_END_BYTES = 0x8c; // 140 (client consumes only body[0] -> 0x4348fc)
export const NOTIFY_DELETE_OUTFIT_BYTES = 0x0c; // 12; mirror the 0x43a/0x43b 3-dword notify shape
export const NOTIFY_FINISH_STRATEGY_PLAN_BYTES = 0x10; // 16 (apply FUN_004bfcd0 reads body[0..2])

// ---- CreateOutfit (0x903) structural caps + strides (get_length FUN_0048d860) ----
export const MAX_OUTFIT_SHIPS = 99; // ships u8 ≤ 99
export const MAX_OUTFIT_TROOPS = 24; // troops u8 ≤ 24
const SHIP_ENTRY_STRIDE = 5; // wire: {u16 kind, u8 unit_number, i16 boat_number}
const TROOP_ENTRY_STRIDE = 5; // wire: {u16 kind, u8 troop_grade, i16 unit_number}
const CREATE_OUTFIT_TAIL_BYTES = 0x1c; // get_length trailing block (max_troop..practice_airbattle)

// CreateOutfit fixed-head offsets (docs §3.4):
//   0x00 u32 time, 0x04 u32 hdr1, 0x08 u8 mode, 0x09 u32 hdr3, 0x0d u32 hdr4,
//   0x11 u32 base, 0x15 u8 kind, 0x16 u8 move_ships, 0x17 ships[]...
const CO_TIME = 0x00;
const CO_HDR1 = 0x04;
const CO_MODE = 0x08;
const CO_HDR3 = 0x09;
const CO_HDR4 = 0x0d;
const CO_BASE = 0x11;
const CO_KIND = 0x15;
const CO_SHIP_COUNT = 0x16;
const CO_SHIPS = 0x17;
const CREATE_OUTFIT_HEAD_BYTES = CO_SHIPS; // 0x17 — fixed head before the ships[] array

const i16 = (v) => {
  const n = Math.round(v) & 0xffff;
  return n >= 0x8000 ? n - 0x10000 : n;
};

// ============================================================================
// Inbound parsers (C->S). Raw inner = [u16 BE code][LE body]; read body = inner.subarray(2).
// ============================================================================

/**
 * Parse CommandMakePlan 0x900 (28B / 7 dwords) — queue a strategy plan. The body is built from the
 * strategy command tray (FUN_00492520, no per-field printer on that path), so only the shared command
 * header is high-confidence: dword0 = time, dword1 = hdr/context (actor/session). The remaining 5 dwords
 * carry the plan payload (plan id + target). We surface the high-confidence split and pass the payload
 * dwords through verbatim. Confidence MEDIUM on the sub-field split; 28B + header shape are CONFIRMED.
 * Returns null if too short.
 */
export function parseInboundMakePlan(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_MAKE_PLAN_BYTES) {
    return null;
  }
  const dwords = [];
  for (let i = 0; i < 7; i += 1) dwords.push(body.readUInt32LE(i * 4));
  return {
    time: dwords[0],
    header: dwords[1],
    planId: dwords[2], // first plan-payload dword (conf-medium label)
    target: dwords[3], // second plan-payload dword (conf-medium label)
    payload: dwords.slice(2), // raw plan dwords (verbatim, no invented split)
    dwords,
  };
}

/**
 * Parse CommandWithdrawalPlan 0x901 (24B / 6 dwords) — cancel/withdraw a queued plan. Shared header
 * (time @0, context @4) + the plan id to withdraw. Confidence MEDIUM on sub-fields; 24B CONFIRMED.
 * Returns null if too short.
 */
export function parseInboundWithdrawalPlan(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_WITHDRAWAL_PLAN_BYTES) {
    return null;
  }
  const dwords = [];
  for (let i = 0; i < 6; i += 1) dwords.push(body.readUInt32LE(i * 4));
  return {
    time: dwords[0],
    header: dwords[1],
    planId: dwords[2], // the plan id being withdrawn (conf-medium label)
    payload: dwords.slice(2),
    dwords,
  };
}

/**
 * Parse CommandAnnouncement 0x902 (40B / 10 dwords) — post an order/announcement. Shared header +
 * announcement payload (target + message/code). Confidence MEDIUM on sub-fields; 40B CONFIRMED.
 * Returns null if too short.
 */
export function parseInboundAnnouncement(inner) {
  const body = inner.subarray(2);
  if (body.length < COMMAND_ANNOUNCEMENT_BYTES) {
    return null;
  }
  const dwords = [];
  for (let i = 0; i < 10; i += 1) dwords.push(body.readUInt32LE(i * 4));
  return {
    time: dwords[0],
    header: dwords[1],
    target: dwords[2], // announcement target (conf-medium label)
    message: dwords[3], // message/code id (conf-medium label)
    payload: dwords.slice(2),
    dwords,
  };
}

/**
 * Parse CommandCreateOutfit 0x903 (deepest, get_length FUN_0048d860 =
 * 0x17 + ships*5 + 1 + troops*5 + 0x1c). Fixed head + ships[] + troops[] + a stat/practice tail.
 *
 * Wire (docs §3.4, LE):
 *   0x00 u32 time, 0x04 u32 hdr1, 0x08 u8 mode, 0x09 u32 hdr3, 0x0d u32 hdr4,
 *   0x11 u32 base, 0x15 u8 kind, 0x16 u8 move_ships,
 *   0x17 ships[move_ships] stride 5: {u16 kind, u8 unit_number, i16 boat_number},
 *   then u8 move_troops, troops[move_troops] stride 5: {u16 kind, u8 troop_grade, i16 unit_number},
 *   then tail (0x1c): u32 max_troop, u32 max_crew, u32 tailA, u8 kind2, u8 power, u8 camp, u8 index,
 *                     u16 achievement, u8 practice_warp..practice_airbattle (10 proficiencies).
 *
 * ship/troop counts are clamped to their caps (99 / 24). i16 fields (boat_number / troop unit_number)
 * are decoded SIGNED. The tail is parsed best-effort: it is only fully present when the body carries the
 * full serialized length; partial bodies surface the head + arrays and leave tail fields null/0.
 * Returns null if too short for the fixed head.
 */
export function parseInboundCreateOutfit(inner) {
  const body = inner.subarray(2);
  if (body.length < CREATE_OUTFIT_HEAD_BYTES) {
    return null;
  }
  const time = body.readUInt32LE(CO_TIME);
  const hdr1 = body.readUInt32LE(CO_HDR1);
  const mode = body.readUInt8(CO_MODE);
  const hdr3 = body.readUInt32LE(CO_HDR3);
  const hdr4 = body.readUInt32LE(CO_HDR4);
  const base = body.readUInt32LE(CO_BASE);
  const kind = body.readUInt8(CO_KIND);
  const shipCount = Math.min(body.readUInt8(CO_SHIP_COUNT), MAX_OUTFIT_SHIPS);

  const ships = [];
  let off = CO_SHIPS;
  for (let i = 0; i < shipCount; i += 1) {
    if (off + SHIP_ENTRY_STRIDE > body.length) {
      break;
    }
    ships.push({
      kind: body.readUInt16LE(off),
      unitNumber: body.readUInt8(off + 2),
      boatNumber: i16(body.readInt16LE(off + 3)), // signed i16
    });
    off += SHIP_ENTRY_STRIDE;
  }

  // move_troops u8, then troops[] stride 5.
  let troopCount = 0;
  const troops = [];
  if (off < body.length) {
    troopCount = Math.min(body.readUInt8(off), MAX_OUTFIT_TROOPS);
    off += 1;
    for (let i = 0; i < troopCount; i += 1) {
      if (off + TROOP_ENTRY_STRIDE > body.length) {
        break;
      }
      troops.push({
        kind: body.readUInt16LE(off),
        troopGrade: body.readUInt8(off + 2),
        unitNumber: i16(body.readInt16LE(off + 3)), // signed i16
      });
      off += TROOP_ENTRY_STRIDE;
    }
  }

  // Tail block (0x1c). Present only when the full serialized body is supplied.
  const tail = {
    maxTroop: null,
    maxCrew: null,
    tailA: null,
    kind2: null,
    power: null,
    camp: null,
    index: null,
    achievement: null,
    practice: null,
  };
  if (off + CREATE_OUTFIT_TAIL_BYTES <= body.length) {
    tail.maxTroop = body.readUInt32LE(off);
    tail.maxCrew = body.readUInt32LE(off + 4);
    tail.tailA = body.readUInt32LE(off + 8);
    tail.kind2 = body.readUInt8(off + 12);
    tail.power = body.readUInt8(off + 13);
    tail.camp = body.readUInt8(off + 14);
    tail.index = body.readUInt8(off + 15);
    tail.achievement = body.readUInt16LE(off + 16);
    // 10 contiguous practice proficiency bytes @ off+18..off+27.
    const practiceNames = [
      'warp', 'speed', 'command', 'offence', 'defence',
      'antiaircraft', 'search', 'deception', 'landbattle', 'airbattle',
    ];
    tail.practice = {};
    for (let i = 0; i < practiceNames.length; i += 1) {
      const pOff = off + 18 + i;
      tail.practice[practiceNames[i]] = pOff < body.length ? body.readUInt8(pOff) : 0;
    }
  }

  return {
    time, hdr1, mode, hdr3, hdr4, base, kind,
    shipCount: ships.length, ships,
    troopCount: troops.length, troops,
    ...tail,
  };
}

/**
 * Parse CommandDeleteOutfit 0x906 — disband outfit(s). Inner id-list layout is confidence-LOW (the
 * 11156B ceiling + apply FUN_004c5700 are known; the id/disposition table was NOT field-printed). We
 * extract the high-confidence shared header (time @0, context @4) and the FIRST outfit id (@8, the most
 * common single-disband case) and surface the rest as a raw `payload` view rather than inventing a table
 * layout. Returns null if too short for the header. Refine with a live capture before strict validation.
 */
export function parseInboundDeleteOutfit(inner) {
  const body = inner.subarray(2);
  if (body.length < 12) {
    return null;
  }
  return {
    time: body.readUInt32LE(0),
    header: body.readUInt32LE(4),
    outfitId: body.readUInt32LE(8), // first/primary outfit id (single-disband case)
    payload: body.subarray(8), // raw id/disposition region (conf-low layout)
  };
}

// ============================================================================
// Outbound builders (S->C). buildLobbyResponseInner -> message32; LE payload at inner.subarray(6).
// ============================================================================

/** 0x904 NotifyCreateOutfitBegin (4B): body[0] = the outfit id being created (client stashes 0x4348f8). */
export function buildNotifyCreateOutfitBeginInner({ outfitId = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_CREATE_OUTFIT_BEGIN_CODE, NOTIFY_CREATE_OUTFIT_BEGIN_BYTES);
  inner.subarray(6).writeUInt32LE(outfitId >>> 0, 0);
  return inner;
}

/**
 * 0x905 NotifyCreateOutfitEnd (dispatch 140B; this client build consumes only body[0] = the new outfit
 * id -> 0x4348fc). The full 140-byte record likely mirrors the outfit-info struct (confidence MEDIUM on
 * the unused tail); we fill the high-confidence id and zero-pad to the dispatch size.
 */
export function buildNotifyCreateOutfitEndInner({ outfitId = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_CREATE_OUTFIT_END_CODE, NOTIFY_CREATE_OUTFIT_END_BYTES);
  inner.subarray(6).writeUInt32LE(outfitId >>> 0, 0);
  return inner;
}

/**
 * 0x907 NotifyDeleteOutfit (12B / 3 dwords) — outfit removed. Paired with CommandDeleteOutfit 0x906; the
 * exact field-print for this notify is not in the doc, so we follow the project's 3-dword notify shape
 * ({id, ...}) — body[0] = the disbanded outfit id. Confidence MEDIUM on the trailing dwords.
 */
export function buildNotifyDeleteOutfitInner({ outfitId = 0, field1 = 0, field2 = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_DELETE_OUTFIT_CODE, NOTIFY_DELETE_OUTFIT_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(outfitId >>> 0, 0);
  p.writeUInt32LE(field1 >>> 0, 4);
  p.writeUInt32LE(field2 >>> 0, 8);
  return inner;
}

/**
 * 0x908 NotifyFinishStrategyPlan (16B; apply FUN_004bfcd0 reads body[0..2]) — a queued plan resolved.
 * body[0] = plan id, body[1] = result/state, body[2] = extra. (4th dword present for the 16B size.)
 */
export function buildNotifyFinishStrategyPlanInner({ planId = 0, result = 0, extra = 0 } = {}) {
  const inner = buildLobbyResponseInner(NOTIFY_FINISH_STRATEGY_PLAN_CODE, NOTIFY_FINISH_STRATEGY_PLAN_BYTES);
  const p = inner.subarray(6);
  p.writeUInt32LE(planId >>> 0, 0);
  p.writeUInt32LE(result >>> 0, 4);
  p.writeUInt32LE(extra >>> 0, 8);
  return inner;
}

// ============================================================================
// In-memory authoritative state.
// ============================================================================

/**
 * Create the strategy domain's in-memory state: a per-faction strategy PLAN QUEUE and an OUTFIT REGISTRY.
 * `nextOutfitId` allocates fresh outfit ids (defaults to 0x1000 to avoid colliding with low world ids).
 * @param {{ nextOutfitId?: number }} [options]
 */
export function createStrategyState({ nextOutfitId = 0x1000 } = {}) {
  return {
    /** @type {Map<number, { id:number, base:number, power:number, camp:number, owner:number, ships:object[], troops:object[], practice:object|null, achievement:number }>} */
    outfits: new Map(),
    /** plan queue keyed by faction/power; each entry { planId, target, owner }. */
    plans: new Map(), // power -> Array<plan>
    _nextOutfitId: nextOutfitId >>> 0,

    /** Allocate a fresh outfit id. */
    allocOutfitId() {
      const id = this._nextOutfitId;
      this._nextOutfitId = (this._nextOutfitId + 1) >>> 0;
      return id;
    },

    /** Register a new outfit; returns the stored record. */
    createOutfit(record) {
      const id = record.id ?? this.allocOutfitId();
      const outfit = { ...record, id }; // resolved id overrides any record.id
      this.outfits.set(id, outfit);
      return outfit;
    },

    /** Remove an outfit by id; returns true if it existed. */
    deleteOutfit(id) {
      return this.outfits.delete(id);
    },

    /** Enqueue a strategy plan under its owning faction/power. Returns the queued plan. */
    enqueuePlan(power, plan) {
      const key = power >>> 0;
      if (!this.plans.has(key)) {
        this.plans.set(key, []);
      }
      this.plans.get(key).push(plan);
      return plan;
    },

    /** Remove the first matching plan (by planId) from a faction's queue; returns the removed plan or null. */
    withdrawPlan(power, planId) {
      const key = power >>> 0;
      const queue = this.plans.get(key);
      if (!queue) {
        return null;
      }
      const idx = queue.findIndex((p) => p.planId === planId);
      if (idx < 0) {
        return null;
      }
      const [removed] = queue.splice(idx, 1);
      return removed;
    },

    /** Total queued plans across all factions (for tests / introspection). */
    planCount() {
      let n = 0;
      for (const q of this.plans.values()) n += q.length;
      return n;
    },
  };
}

// ============================================================================
// process() entry — the domain dispatcher.
// ============================================================================

/**
 * Process an inbound strategy/outfit command (0x0900-0x0906) from `connectionId`.
 *
 * Contract (matches command-engine): returns
 *   { accept, reject?, notifies: [{ inner, target: 'others'|'all' }] }.
 * The lead routes inner codes 0x0900..0x0906 to this fn (see integrationNote) and broadcasts each
 * notify per target. `power` (faction id) is taken from ctx when known; defaults to 0 (single-faction).
 *
 * @param {{ state: ReturnType<typeof createStrategyState>, connectionId?: number, innerCode: number,
 *           inner: Buffer, power?: number }} args
 */
export function processStrategy({ state, connectionId = 0, innerCode, inner, power = 0 }) {
  switch (innerCode) {
    case COMMAND_MAKE_PLAN_CODE: {
      const parsed = parseInboundMakePlan(inner);
      if (!parsed) {
        return { accept: false, reject: 'invalid-make-plan', notifies: [] };
      }
      state.enqueuePlan(power, { planId: parsed.planId, target: parsed.target, owner: connectionId });
      // Plan resolution is broadcast as NotifyFinishStrategyPlan; a queued plan that resolves
      // immediately (e.g. an instant order) is acked to everyone so all clients refresh their tray.
      const notify = buildNotifyFinishStrategyPlanInner({ planId: parsed.planId, result: 0, extra: parsed.target });
      return { accept: true, planId: parsed.planId, notifies: [{ inner: notify, target: 'all' }] };
    }

    case COMMAND_WITHDRAWAL_PLAN_CODE: {
      const parsed = parseInboundWithdrawalPlan(inner);
      if (!parsed) {
        return { accept: false, reject: 'invalid-withdrawal-plan', notifies: [] };
      }
      const removed = state.withdrawPlan(power, parsed.planId);
      if (!removed) {
        return { accept: false, reject: 'no-such-plan', notifies: [] };
      }
      // A withdrawal resolves the plan with a cancelled result (result=1) so all trays drop it.
      const notify = buildNotifyFinishStrategyPlanInner({ planId: parsed.planId, result: 1 });
      return { accept: true, planId: parsed.planId, notifies: [{ inner: notify, target: 'all' }] };
    }

    case COMMAND_ANNOUNCEMENT_CODE: {
      const parsed = parseInboundAnnouncement(inner);
      if (!parsed) {
        return { accept: false, reject: 'invalid-announcement', notifies: [] };
      }
      // An announcement posts an order to everyone; surfaced as a resolved plan carrying the message.
      const notify = buildNotifyFinishStrategyPlanInner({ planId: parsed.target, result: 0, extra: parsed.message });
      return { accept: true, target: parsed.target, notifies: [{ inner: notify, target: 'all' }] };
    }

    case COMMAND_CREATE_OUTFIT_CODE: {
      const parsed = parseInboundCreateOutfit(inner);
      if (!parsed) {
        return { accept: false, reject: 'invalid-create-outfit', notifies: [] };
      }
      const outfit = state.createOutfit({
        base: parsed.base,
        power: parsed.power ?? 0,
        camp: parsed.camp ?? 0,
        owner: connectionId,
        ships: parsed.ships,
        troops: parsed.troops,
        practice: parsed.practice,
        achievement: parsed.achievement ?? 0,
      });
      // Begin -> End -> info: the client renders the new fleet only after End (it stashes body[0]).
      return {
        accept: true,
        outfitId: outfit.id,
        notifies: [
          { inner: buildNotifyCreateOutfitBeginInner({ outfitId: outfit.id }), target: 'all' },
          { inner: buildNotifyCreateOutfitEndInner({ outfitId: outfit.id }), target: 'all' },
        ],
      };
    }

    case COMMAND_DELETE_OUTFIT_CODE: {
      const parsed = parseInboundDeleteOutfit(inner);
      if (!parsed) {
        return { accept: false, reject: 'invalid-delete-outfit', notifies: [] };
      }
      const existed = state.deleteOutfit(parsed.outfitId);
      if (!existed) {
        return { accept: false, reject: 'no-such-outfit', notifies: [] };
      }
      const notify = buildNotifyDeleteOutfitInner({ outfitId: parsed.outfitId });
      return { accept: true, outfitId: parsed.outfitId, notifies: [{ inner: notify, target: 'all' }] };
    }

    default:
      return { accept: false, reject: 'unknown-strategy-command', notifies: [] };
  }
}
