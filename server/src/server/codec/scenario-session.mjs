/**
 * LobbyResponseInformationSession (0x2006) packed builder — 5bd249c 정본 이식.
 * FUN_00444900 SEEK_CUR packed stream + 0x5304 body.
 */
// 0x2006 세션 데이터가 광고하는 오리지널 추첨(0x1006) 후보 id 풀을 재수출한다.
// 단일 진실원은 logh7-original-candidates.mjs. 0x1006 핸들러와 동일 풀을 공유하므로
// 클라가 되돌려 보내는 char_id 가 서버 후보 id 와 정합한다.
// (주의: 0x2006 packed 스트림 내 후보 캐릭터의 정확한 필드/stride(0x14c)는 RE 미확정
//  — docs/logh7-m2-character-creation-flow.md §6. 따라서 id 정합은 이 공유 풀로
//  서버측에서 강제한다. 잠정 후보 데이터는 정본 아님.)
export { ORIGINAL_CANDIDATE_IDS } from '../logh7-original-candidates.mjs';

export const LOBBY_RESP_INFO_SESSION_CODE = 0x2006;
export const LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES = 0x5304;
export const SESSION_NAME_MAX_UNITS = 13;
export const SESSION_BEGIN_DAY_MAX_UNITS = 65;
export const SESSION_POWER_COUNT = 2;
export const SESSION_SUPER_MAN_MAX_UNITS = 13;
export const SESSION_RECORD_PARSER_CAP = 64;

function buildLobbyResponseInner(code, payloadLength = 0) {
  const body = Buffer.alloc(Math.max(0, payloadLength));
  const out = Buffer.alloc(6 + body.length);
  out.writeUInt32LE(0, 0);
  out.writeUInt16BE(code & 0xffff, 4);
  body.copy(out, 6);
  return out;
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

/**
 * 세션 문자열: [u8 unitCount][u16 BE × units] (NUL 미포함).
 * 라이브 정본(2026-07-01): sessionId/scalar 는 LE, 텍스트 code unit 은 BE.
 * 전부 LE 이면 피커 행이 비고, 전부 BE 이면 0x2009 selectedSessionId 가 어긋남.
 */
function writePstr16(payload, cursor, str, maxUnits) {
  const units = [...String(str ?? '')].slice(0, maxUnits);
  let c = cursor;
  payload.writeUInt8(units.length, c); c += 1;
  for (let i = 0; i < units.length; i += 1) {
    payload.writeUInt16BE(units[i].codePointAt(0) & 0xffff, c); c += 2;
  }
  return c;
}

function writeSessionRecord(payload, cursor, rec) {
  let c = cursor;
  payload.writeUInt16LE(rec.sessionId, c); c += 2;
  payload.writeUInt8(rec.status, c); c += 1;
  c = writePstr16(payload, c, rec.name, SESSION_NAME_MAX_UNITS);
  c = writePstr16(payload, c, rec.beginDay, SESSION_BEGIN_DAY_MAX_UNITS);
  payload.writeUInt32LE(rec.term, c); c += 4;
  for (let k = 0; k < SESSION_POWER_COUNT; k += 1) {
    const p = rec.powers[k] ?? { id: k + 1, superMan: '', d0: 0, d1: 0, d2: 0 };
    payload.writeUInt8(clampU8(p.id), c); c += 1;
    payload.writeUInt32LE(clampU32(p.d0), c); c += 4;
    payload.writeUInt32LE(clampU32(p.d1), c); c += 4;
    payload.writeUInt32LE(clampU32(p.d2), c); c += 4;
    const hasLeader = [...String(p.superMan)].length > 0;
    payload.writeUInt8(hasLeader ? 1 : 0, c); c += 1;
    if (hasLeader) {
      c = writePstr16(payload, c, p.superMan, SESSION_SUPER_MAN_MAX_UNITS);
      c += 2 + 1 + 1 + 1 + 1 + 1 + 2 + 2 + 4 + 4 + 4;
    }
  }
  payload.writeUInt8(rec.ending, c); c += 1;
  if (rec.ending) c += 2 + 2 + 4 + 4 + 4;
  return c;
}

function validateRecord(s, index) {
  const state = s && typeof s === 'object' ? s : {};
  const sessionId = clampU16(state.sessionId ?? index + 1);
  const status = clampU8(state.status ?? 1);
  const name = String(state.sessionName ?? state.name ?? 'LOGH7');
  if ([...name].length > SESSION_NAME_MAX_UNITS) {
    throw new Error(`session_name too long: ${name}`);
  }
  const beginDay = String(state.beginDay ?? state.begin_day ?? state.description ?? 'UC796');
  if ([...beginDay].length > SESSION_BEGIN_DAY_MAX_UNITS) {
    throw new Error('begin_day too long');
  }
  const term = clampU32(state.term ?? 0);
  const ending = clampU8(state.ending ?? 0) === 0 ? 0 : 1;
  const powersIn = Array.isArray(state.powers) ? state.powers : [];
  const powers = [0, 1].map((k) => {
    const p = powersIn[k] ?? {};
    return {
      id: clampU8(p.id ?? k + 1),
      superMan: p.superMan != null ? String(p.superMan) : '',
      d0: clampU32(p.d0 ?? 0),
      d1: clampU32(p.d1 ?? 0),
      d2: clampU32(p.d2 ?? 0),
    };
  });
  return { sessionId, status, name, beginDay, term, ending, powers };
}

export function buildInformationSessionInner(stateOrOptions = {}) {
  const sessions = stateOrOptions && Array.isArray(stateOrOptions.sessions)
    ? stateOrOptions.sessions
    : [stateOrOptions];
  const records = sessions.map((s, i) => validateRecord(s, i));
  if (records.length > SESSION_RECORD_PARSER_CAP) {
    throw new Error(`invalid session record count: ${records.length}`);
  }
  const inner = buildLobbyResponseInner(LOBBY_RESP_INFO_SESSION_CODE, LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  const payload = inner.subarray(6);
  payload.writeUInt8(0, 0);
  payload.writeUInt8(records.length, 1);
  let cursor = 2;
  for (const r of records) cursor = writeSessionRecord(payload, cursor, r);
  return inner;
}
