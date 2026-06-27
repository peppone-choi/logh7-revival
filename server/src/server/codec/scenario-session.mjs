/**
 * Scenario / Session world-state + the `LobbyResponseInformationSession` (0x2006) wire builder.
 *
 * WHAT THIS ADDS. The codebase had no turn / date / victory state and only a *partial* session-list
 * builder (`buildLobbyInformationSessionInner` in logh7-login-protocol.mjs) that writes a simplified
 * sequential record (session_id + status + name + a "description" string laid back-to-back from payload
 * offset 2). That simplified form does NOT match the FIXED-stride layout the real client parser expects:
 * it puts a free-form "description" where the parser reads `begin_day`, and it never wires `term`,
 * the per-power `super_man` (faction leader name), or the `ending` flag at their binary-evidenced
 * offsets. This module is the PARALLEL, authoritative implementation — a mutable scenario/world-clock
 * state plus a builder that lays every field at the offset the parser `FUN_00444900` actually reads.
 * It does NOT edit the existing partial builder (kept for back-compat with its byte-pinned test).
 *
 * SELF-CONTAINED (avoids parallel write-conflicts with the hot-path login files): the only import is the
 * framing helper `buildLobbyResponseInner` from logh7-login-protocol.mjs.
 *
 * FRAMING (matches the rest of the repo): every record is a conn3/lobby message32 object
 *   inner = [u32 BE 0][u16 BE code][LE body...]   (buildLobbyResponseInner(code, bodyLen))
 * so the LE body lives at inner.subarray(6); total inner length = 6 + bodyLen. The client receive-object
 * factory hard-sizes 0x2006 to LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES (0x5304); this builder emits exactly
 * that size, zero-padded, and the parser reads a leading byte + count then `count` fixed-stride records
 * and ignores the trailing zero pad. Bodies are little-endian; only the 2-byte inner code is big-endian.
 *
 * WIRE EVIDENCE — binary parser `FUN_00444900` (`Input_LobbyResponseInformationSession::input_from_stream`,
 * the per-element body is `Input_InformationSession`), with the canonical error strings:
 *   - `LobbyResponseInformationSession … information_size … over than 64`  -> count cap < 0x41
 *   - `Input_InformationSession … session_name_size … over than 13`        -> name cap < 0xe
 *   - `Input_InformationSession … begin_day_size … over than 65`           -> begin_day cap < 0x42
 *   - `Input_InformationSession … ending_size … over than 1`               -> session ending count < 2
 *   - `Input_InformationSessionPower … ending_size … over than 1`          -> per-power ending count < 2
 *   - `Input_InformationSessionPowerEnding … super_man_size … over than 13`-> leader-name cap < 0xe
 *
 * WIRE SHAPE — RE-VERIFIED 2026-06-16 against the live binary (`G7MTClient.playable.exe`, base 0x400000).
 * Every read in `FUN_00444900` is `FUN_00610420(dst, n, 0, mode=2)` where mode 2 = SEEK_CUR (`FUN_006104b0`
 * resolves it to `cursor += offset`, then advances `cursor += n`), and the vtable readers `*(stream+0x1c)`
 * =u32 / `+0x20`=u16 / `+0x24`=u8 pull the next 1/2/4 bytes off the SAME advancing cursor. The wire is
 * therefore a PACKED, variable-length, sequential stream — NOT a fixed 0x14c-stride buffer. The 0x14c
 * stride and the per-field `R±off` values describe the *in-memory* destination record `param_1` the parser
 * scatters decoded values into; they are destination offsets, not wire offsets. (Earlier this module laid
 * the body at the 0x14c strides, which made the parser bail at `session_name_size > 13` on the first record
 * → the session-select picker showed 0 rows. See the failing-first oracle in the test file.)
 *
 * PACKED wire layout (little-endian; per record, read back-to-back from the cursor):
 *   [u8 lead=0][u8 count<0x41]                                            -- header
 *   per record:
 *     [u16 session_id][u8 status]                                         -- id + selectable flag (1|2)
 *     [u8 name_len<=0xd][u16 × name_len]                                  -- session_name (UTF-16LE units)
 *     [u8 begin_day_len<=0x41][u16 × begin_day_len]                       -- begin_day (UTF-16LE units)
 *     [u32 term]
 *     2 × power: [u8 id][u32 d0][u32 d1][u32 d2][u8 pend<2]               -- per-power scalars
 *                pend × { [u8 super_man_len<=0xd][u16 × len]              -- leader name
 *                         [u16][u8][u8][u8][u8][u16][u16][u32][u32][u32] }-- ending body (UNPINNED-SEMANTICS, 0)
 *     [u8 ending<2]  ending × { [u16][u16][u32][u32][u32] }               -- session ending body (UNPINNED, 0)
 * Counted strings carry the UNIT count (NOT a NUL-terminated count): the parser reads exactly `len` u16
 * units, so a 13-unit name fits the <=0xd cap; appending a NUL would inflate the count past the cap.
 *
 * Pure + synchronous => fully unit-testable without a live client.
 */

import { buildLobbyResponseInner } from '../logh7-login-protocol.mjs';

// ---- message code + fixed dispatch size (mirror of the login-protocol constants; re-declared here so
//      this module stays import-light and self-describing) ----
export const LOBBY_RESP_INFO_SESSION_CODE = 0x2006; // S->C LobbyResponseInformationSession
export const LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES = 0x5304; // 21252 — FUN_004b8b00 receive-object size

// ---- record geometry (all from FUN_00444900) ----
// NOTE: 0x14c is the *in-memory* InformationSession stride (the destination record `param_1` the parser
// scatters into); it is exported for tools that model that struct. The ON-WIRE body is PACKED/sequential
// (see header), so the wire size of a record is variable. Kept for back-compat with the struct model.
export const SESSION_RECORD_STRIDE = 0x14c; // 332 bytes / in-memory InformationSession element
export const SESSION_RECORDS_BASE = 7; // R0 of the in-memory struct (lead@0, count@1, R0@7)
export const SESSION_NAME_MAX_UNITS = 13; // session_name cap (< 0xe)
export const SESSION_BEGIN_DAY_MAX_UNITS = 65; // begin_day cap (< 0x42)
export const SESSION_POWER_COUNT = 2; // the parser loops exactly 2 InformationSessionPower entries
export const SESSION_POWER_STRIDE = 0x48; // 72 bytes / in-memory power sub-record
export const SESSION_POWER_BASE = 0xb9; // rel. to in-memory record base R: first power sub-record @R+0xb9
export const SESSION_SUPER_MAN_MAX_UNITS = 13; // per-power super_man (faction-leader name) cap (< 0xe)
export const SESSION_ENDING_MAX = 1; // session ending count cap (< 2)
export const SESSION_RECORD_PARSER_CAP = 64; // the parser's own count gate (< 0x41)
// Worst-case PACKED record size (all strings at max, both powers carry a leader+ending body, session
// ending present). Used to bound how many records fit the fixed 0x5304 buffer without overrun.
const PWR_FIXED_BYTES = 1 + 4 + 4 + 4 + 1; // id + d0 + d1 + d2 + pend
const PWR_ENDING_BODY_BYTES = 2 + 1 + 1 + 1 + 1 + 1 + 2 + 2 + 4 + 4 + 4; // ending scalars after super_man
const PWR_MAX_BYTES = PWR_FIXED_BYTES + (1 + SESSION_SUPER_MAN_MAX_UNITS * 2) + PWR_ENDING_BODY_BYTES;
const RECORD_MAX_WIRE_BYTES =
  2 + 1 + // session_id + status
  (1 + SESSION_NAME_MAX_UNITS * 2) + // session_name
  (1 + SESSION_BEGIN_DAY_MAX_UNITS * 2) + // begin_day
  4 + // term
  SESSION_POWER_COUNT * PWR_MAX_BYTES + // 2 powers
  1 + (2 + 2 + 4 + 4 + 4); // session ending count + one ending body
// 2 header bytes (lead + count) precede the records inside the 0x5304 payload.
export const SESSION_RECORD_SAFE_MAX = Math.min(
  SESSION_RECORD_PARSER_CAP,
  Math.floor((LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES - 2) / RECORD_MAX_WIRE_BYTES),
);

/**
 * @typedef {Object} ScenarioPower
 * @property {number} id power/faction id (e.g. 1 = Empire, 2 = Alliance)
 * @property {string} [superMan] faction-leader (盟主/superMan) display name, ≤13 units
 * @property {number} [d0] UNPINNED-SEMANTICS per-power u32 (score/treasury candidate)
 * @property {number} [d1] UNPINNED-SEMANTICS per-power u32
 * @property {number} [d2] UNPINNED-SEMANTICS per-power u32
 */

/**
 * @typedef {Object} ScenarioState
 * @property {string} sessionName world/scenario name (≤13 units)
 * @property {number} startYear in-fiction start year (e.g. 796 UC / 487 IC); drives `beginDay` text
 * @property {number} currentTurn monotonic world turn counter
 * @property {number} term world term / phase counter (wire field `term`, R+0xa1)
 * @property {string} beginDay free-form begin-day / calendar string (≤65 units, wire field `begin_day`)
 * @property {number} ending session-wide ending flag (0 = ongoing, 1 = ended; cap 1)
 * @property {number} sessionId wire session id (u16)
 * @property {number} status record status/metadata byte (1|2 = selectable)
 * @property {ScenarioPower[]} powers exactly-2 power slots (extra ignored, missing zero-filled)
 */

/**
 * Create a mutable scenario / world-clock state. This is the single authoritative source the world-init
 * path reads to emit `LobbyResponseInformationSession` and to advance the clock. All fields are plain and
 * directly mutable by the command/strategy engines (e.g. `state.currentTurn += 1` on end-of-turn).
 *
 * @param {{ sessionName?: string, startYear?: number, currentTurn?: number, term?: number,
 *   beginDay?: string, ending?: number, sessionId?: number, status?: number,
 *   powers?: ScenarioPower[] }} [options]
 * @returns {ScenarioState}
 */
export function createScenarioState({
  sessionName = 'LOGH VII',
  startYear = 796,
  currentTurn = 0,
  term = 0,
  beginDay = null,
  ending = 0,
  sessionId = 1,
  status = 1,
  powers = null,
} = {}) {
  const resolvedPowers = Array.isArray(powers) && powers.length > 0
    ? powers.map((p, i) => normalizePower(p, i))
    : [
        { id: 1, superMan: '', d0: 0, d1: 0, d2: 0 }, // slot 0 — Empire by convention
        { id: 2, superMan: '', d0: 0, d1: 0, d2: 0 }, // slot 1 — Alliance by convention
      ];
  return {
    sessionName: String(sessionName),
    startYear: Number.isInteger(startYear) ? startYear : 796,
    currentTurn: Number.isInteger(currentTurn) ? currentTurn : 0,
    term: Number.isInteger(term) ? term : 0,
    // Default the begin_day text from startYear so a fresh world has a non-empty calendar string.
    beginDay: beginDay != null ? String(beginDay) : `UC ${startYear}`,
    ending: clampU8(ending) === 0 ? 0 : 1,
    sessionId: clampU16(sessionId),
    status: clampU8(status),
    powers: resolvedPowers,
  };
}

function normalizePower(p, index) {
  const obj = p && typeof p === 'object' ? p : {};
  return {
    id: clampU8(obj.id ?? index + 1),
    superMan: obj.superMan != null ? String(obj.superMan) : '',
    d0: clampU32(obj.d0 ?? 0),
    d1: clampU32(obj.d1 ?? 0),
    d2: clampU32(obj.d2 ?? 0),
  };
}

/**
 * Build the `LobbyResponseInformationSession` (0x2006) wire record from a scenario state (or an explicit
 * list of session records). The output is the FIXED 0x5304-byte message32 object the client parser
 * `FUN_00444900` consumes: a leading raw byte, a u8 record count, then `count` fixed-stride (0x14c)
 * InformationSession elements, each laid at the binary-evidenced offsets. Zero-padded to the dispatch size.
 *
 * Single-state form: pass the `state` from {@link createScenarioState}; one record is emitted from it.
 * Multi-session form: pass `{ sessions: [stateLike, …] }` to list several joinable worlds (the lobby
 * session-select screen). Each session-like object accepts the same fields as a ScenarioState; the
 * `status` byte (1|2) makes a record selectable (client gate FUN_00593d90).
 *
 * @param {ScenarioState | { sessions?: Array<Partial<ScenarioState>> }} stateOrOptions
 * @returns {Buffer} framed inner (length 6 + 0x5304)
 */
export function buildInformationSessionInner(stateOrOptions = {}) {
  const records = resolveSessionRecords(stateOrOptions);
  if (records.length > SESSION_RECORD_PARSER_CAP) {
    throw new Error(`invalid session record count: ${records.length} (parser cap ${SESSION_RECORD_PARSER_CAP})`);
  }
  if (records.length > SESSION_RECORD_SAFE_MAX) {
    // Beyond the safe max the fixed 0x5304 buffer cannot hold every PACKED record without overrun.
    throw new Error(`session record count ${records.length} exceeds buffer-safe max ${SESSION_RECORD_SAFE_MAX}`);
  }

  const inner = buildLobbyResponseInner(LOBBY_RESP_INFO_SESSION_CODE, LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt8(0, 0); // raw leading byte the parser consumes before the count (FUN_00610420(dst,1,0,2))
  payload.writeUInt8(records.length, 1); // record count (cap < 0x41)

  // PACKED, sequential body — the parser reads every field off one advancing cursor (SEEK_CUR). The fixed
  // 0x5304 buffer is zero-padded after the last record; the parser stops at `count` and ignores the tail.
  let cursor = 2;
  for (let i = 0; i < records.length; i += 1) {
    cursor = writeSessionRecord(payload, cursor, records[i]);
  }
  return inner;
}

/** Normalize the input into a list of validated session records (1 from a state, or N from `sessions`). */
function resolveSessionRecords(stateOrOptions) {
  const sessions = stateOrOptions && Array.isArray(stateOrOptions.sessions) ? stateOrOptions.sessions : null;
  const source = sessions ?? [stateOrOptions];
  return source.map((s, i) => validateRecord(s, i));
}

function validateRecord(s, index) {
  const state = s && typeof s === 'object' ? s : {};
  const sessionId = clampU16(state.sessionId ?? index + 1);
  if (sessionId < 0 || sessionId > 0xffff) {
    throw new Error(`invalid session id at index ${index}: ${state.sessionId}`);
  }
  const status = clampU8(state.status ?? 1);
  const name = String(state.sessionName ?? state.name ?? 'LOGH VII');
  if ([...name].length > SESSION_NAME_MAX_UNITS) {
    throw new Error(`session_name too long at index ${index}: ${name} (max ${SESSION_NAME_MAX_UNITS})`);
  }
  const startYear = Number.isInteger(state.startYear) ? state.startYear : 796;
  const beginDay = String(state.beginDay ?? state.begin_day ?? `UC ${startYear}`);
  if ([...beginDay].length > SESSION_BEGIN_DAY_MAX_UNITS) {
    throw new Error(`begin_day too long at index ${index} (max ${SESSION_BEGIN_DAY_MAX_UNITS})`);
  }
  const term = clampU32(state.term ?? 0);
  const ending = clampU8(state.ending ?? 0) === 0 ? 0 : 1;
  const powers = Array.isArray(state.powers) ? state.powers.map((p, k) => normalizePower(p, k)) : [];
  for (const p of powers.slice(0, SESSION_POWER_COUNT)) {
    if ([...p.superMan].length > SESSION_SUPER_MAN_MAX_UNITS) {
      throw new Error(`super_man too long at index ${index} (max ${SESSION_SUPER_MAN_MAX_UNITS})`);
    }
  }
  return { sessionId, status, name, beginDay, term, ending, powers };
}

/**
 * Write one PACKED InformationSession element starting at `cursor` in the LE payload, returning the new
 * cursor. The byte order mirrors the parser's sequential reads exactly (see header).
 */
function writeSessionRecord(payload, cursor, rec) {
  let c = cursor;
  payload.writeUInt16LE(rec.sessionId, c); c += 2; // session_id u16
  payload.writeUInt8(rec.status, c); c += 1; // status / selectable flag (1|2)
  c = writePstr16(payload, c, rec.name, SESSION_NAME_MAX_UNITS); // session_name
  c = writePstr16(payload, c, rec.beginDay, SESSION_BEGIN_DAY_MAX_UNITS); // begin_day
  payload.writeUInt32LE(rec.term, c); c += 4; // term

  // exactly-2 InformationSessionPower sub-records (zero-filled scalars when missing)
  for (let k = 0; k < SESSION_POWER_COUNT; k += 1) {
    const p = rec.powers[k] ?? { id: k + 1, superMan: '', d0: 0, d1: 0, d2: 0 };
    payload.writeUInt8(clampU8(p.id), c); c += 1; // power id
    payload.writeUInt32LE(clampU32(p.d0), c); c += 4; // UNPINNED-SEMANTICS u32
    payload.writeUInt32LE(clampU32(p.d1), c); c += 4; // UNPINNED-SEMANTICS u32
    payload.writeUInt32LE(clampU32(p.d2), c); c += 4; // UNPINNED-SEMANTICS u32
    // per-power ending count: emit 1 ending sub-record iff super_man is present, so the leader name is
    // actually carried (the InformationSessionPowerEnding.super_man string is the head of the ending body).
    const hasLeader = [...String(p.superMan)].length > 0;
    payload.writeUInt8(hasLeader ? 1 : 0, c); c += 1; // per-power ending count (< 2)
    if (hasLeader) {
      c = writePstr16(payload, c, p.superMan, SESSION_SUPER_MAN_MAX_UNITS); // super_man
      // ending body scalars (u16, u8, u8, u8, u8, u8, u16, u16, u32, u32, u32) are UNPINNED-SEMANTICS and
      // left zero — the parser reads them but a zero ending body is inert. 23 bytes.
      c += 2 + 1 + 1 + 1 + 1 + 1 + 2 + 2 + 4 + 4 + 4;
    }
  }

  // session-wide ending flag (top-level): count 0|1; a single (zero) ending body follows when set.
  payload.writeUInt8(rec.ending, c); c += 1;
  if (rec.ending) {
    // ending-entry scalars (u16, u16, u32, u32, u32) UNPINNED-SEMANTICS / zero = inert "ended" marker.
    c += 2 + 2 + 4 + 4 + 4;
  }
  return c;
}

/**
 * Write a u8-length-prefixed UTF-16LE pascal string at `cursor`: [u8 unitCount][u16 chars]; returns the
 * advanced cursor. The length is the UNIT count (no NUL) — the parser reads exactly `len` u16 units.
 */
function writePstr16(payload, cursor, str, maxUnits) {
  const units = [...String(str ?? '')].slice(0, maxUnits);
  let c = cursor;
  payload.writeUInt8(units.length, c); c += 1;
  for (let i = 0; i < units.length; i += 1) {
    payload.writeUInt16LE(units[i].codePointAt(0) & 0xffff, c); c += 2;
  }
  return c;
}

function clampU8(v) {
  const n = Number(v) | 0;
  return n < 0 ? 0 : n > 0xff ? 0xff : n;
}

function clampU16(v) {
  const n = Number(v) | 0;
  return n < 0 ? 0 : n > 0xffff ? 0xffff : n;
}

function clampU32(v) {
  return (Number(v) >>> 0) & 0xffffffff;
}
