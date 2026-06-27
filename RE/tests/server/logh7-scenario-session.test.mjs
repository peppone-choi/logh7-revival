import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  LOBBY_RESP_INFO_SESSION_CODE,
  LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES,
  SESSION_NAME_MAX_UNITS,
  SESSION_BEGIN_DAY_MAX_UNITS,
  SESSION_POWER_COUNT,
  SESSION_SUPER_MAN_MAX_UNITS,
  SESSION_RECORD_SAFE_MAX,
  SESSION_RECORD_PARSER_CAP,
  createScenarioState,
  buildInformationSessionInner,
} from '../../src/server/logh7-scenario-session.mjs';

// Faithful oracle of the client parser FUN_00444900. The binary reads the 0x2006 body as a PACKED,
// sequential stream (every read is FUN_00610420(dst, n, 0, mode=2) = SEEK_CUR; the vtable u8/u16/u32
// readers pull the next 1/2/4 bytes off the same advancing cursor and scatter them into the in-memory
// 0x14c record). It is NOT a fixed-stride buffer. This consumes the payload exactly as the client does
// and returns the decoded records or the first gate it bails on.
function parse2006LikeClient(payload) {
  let c = 0;
  const u8 = () => payload.readUInt8(c++);
  const u16 = () => { const v = payload.readUInt16LE(c); c += 2; return v; };
  const u32 = () => { const v = payload.readUInt32LE(c); c += 4; return v; };
  const str16 = (max, label, recIdx) => {
    const n = u8();
    if (n > max) throw new Error(`bail rec${recIdx}: ${label}_size ${n} > ${max}`);
    let s = '';
    for (let i = 0; i < n; i += 1) s += String.fromCharCode(u16());
    return s;
  };
  const lead = u8();
  const count = u8();
  if (count >= 0x41) throw new Error(`bail: information count ${count} >= 0x41`);
  const recs = [];
  for (let i = 0; i < count; i += 1) {
    const sessionId = u16();
    const status = u8();
    const name = str16(0xd, 'session_name', i);
    const beginDay = str16(0x41, 'begin_day', i);
    const term = u32();
    const powers = [];
    for (let k = 0; k < 2; k += 1) {
      const id = u8();
      const d0 = u32();
      const d1 = u32();
      const d2 = u32();
      const endingCount = u8();
      if (endingCount > 1) throw new Error(`bail rec${i}: power.ending_size ${endingCount} > 1`);
      const superMen = [];
      for (let m = 0; m < endingCount; m += 1) {
        superMen.push(str16(0xd, 'super_man', i));
        u16(); u8(); u8(); u8(); u8(); u8(); u16(); u16(); u32(); u32(); u32(); // ending body scalars
      }
      powers.push({ id, d0, d1, d2, superMan: superMen[0] ?? '' });
    }
    const endingCount = u8();
    if (endingCount > 1) throw new Error(`bail rec${i}: session.ending_size ${endingCount} > 1`);
    for (let n = 0; n < endingCount; n += 1) { u16(); u16(); u32(); u32(); u32(); }
    recs.push({ sessionId, status, name, beginDay, term, powers });
  }
  return { lead, count, recs, bytesConsumed: c };
}

test('createScenarioState returns a mutable state with sane defaults', () => {
  const state = createScenarioState();
  assert.equal(state.sessionName, 'LOGH VII');
  assert.equal(state.startYear, 796);
  assert.equal(state.currentTurn, 0);
  assert.equal(state.term, 0);
  assert.equal(state.beginDay, 'UC 796'); // derived from startYear
  assert.equal(state.ending, 0);
  assert.equal(state.powers.length, 2);
  assert.deepEqual(state.powers.map((p) => p.id), [1, 2]);

  // mutable: the strategy/command engines advance the clock by direct assignment
  state.currentTurn += 1;
  state.term = 5;
  assert.equal(state.currentTurn, 1);
  assert.equal(state.term, 5);
});

test('createScenarioState honours overrides incl. powers + explicit beginDay', () => {
  const state = createScenarioState({
    sessionName: 'Amritsar',
    startYear: 799,
    beginDay: 'SE 799/05/14',
    ending: 1,
    powers: [
      { id: 1, superMan: 'Reinhard', d0: 100 },
      { id: 2, superMan: 'Yang', d1: 7 },
    ],
  });
  assert.equal(state.sessionName, 'Amritsar');
  assert.equal(state.beginDay, 'SE 799/05/14');
  assert.equal(state.ending, 1);
  assert.equal(state.powers[0].superMan, 'Reinhard');
  assert.equal(state.powers[0].d0, 100);
  assert.equal(state.powers[1].superMan, 'Yang');
});

test('the client parser FUN_00444900 decodes our 0x2006 body field-for-field (PACKED wire)', () => {
  const inner = buildInformationSessionInner(
    createScenarioState({
      sessionName: 'Iserlohn',
      beginDay: 'UC 796/01/01',
      term: 0x01020304,
      sessionId: 0x1234,
      status: 2,
      powers: [
        { id: 1, superMan: 'Reinhard', d0: 0x11111111, d1: 0x22222222, d2: 0x33333333 },
        { id: 2, superMan: 'Yang', d0: 0x44444444, d1: 0x55555555, d2: 0x66666666 },
      ],
    }),
  );
  // Must not bail and must round-trip every field exactly as the client reads them.
  const decoded = parse2006LikeClient(inner.subarray(6));
  assert.equal(decoded.lead, 0);
  assert.equal(decoded.count, 1);
  const r = decoded.recs[0];
  assert.equal(r.sessionId, 0x1234);
  assert.equal(r.status, 2);
  assert.equal(r.name, 'Iserlohn');
  assert.equal(r.beginDay, 'UC 796/01/01');
  assert.equal(r.term, 0x01020304);
  assert.equal(r.powers[0].id, 1);
  assert.equal(r.powers[0].d0, 0x11111111);
  assert.equal(r.powers[0].d1, 0x22222222);
  assert.equal(r.powers[0].d2, 0x33333333);
  assert.equal(r.powers[0].superMan, 'Reinhard');
  assert.equal(r.powers[1].id, 2);
  assert.equal(r.powers[1].superMan, 'Yang');
});

test('the client parser decodes a multi-session 0x2006 list (every row visible to the picker)', () => {
  const inner = buildInformationSessionInner({
    sessions: [
      { sessionName: 'World A', sessionId: 10, status: 1, beginDay: 'UC 796' },
      { sessionName: 'World B', sessionId: 20, status: 2, beginDay: 'UC 797' },
      { sessionName: 'World C', sessionId: 30, status: 1, beginDay: 'UC 798' },
    ],
  });
  const decoded = parse2006LikeClient(inner.subarray(6));
  assert.equal(decoded.count, 3);
  assert.deepEqual(decoded.recs.map((r) => r.sessionId), [10, 20, 30]);
  assert.deepEqual(decoded.recs.map((r) => r.name), ['World A', 'World B', 'World C']);
  assert.deepEqual(decoded.recs.map((r) => r.status), [1, 2, 1]);
  assert.deepEqual(decoded.recs.map((r) => r.beginDay), ['UC 796', 'UC 797', 'UC 798']);
});

test('a 13-char (max) session_name does not bail the client parser (no NUL inflation)', () => {
  const name = 'X'.repeat(SESSION_NAME_MAX_UNITS); // 13 units — the parser caps at <= 0xd
  const inner = buildInformationSessionInner(createScenarioState({ sessionName: name }));
  const decoded = parse2006LikeClient(inner.subarray(6));
  assert.equal(decoded.recs[0].name, name);
});

test('buildInformationSessionInner frames a fixed-size 0x2006 message32 object', () => {
  const inner = buildInformationSessionInner(createScenarioState());
  assert.equal(inner.length, 6 + LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  assert.equal(inner.readUInt32BE(0), 0); // message32 prefix
  assert.equal(inner.readUInt16BE(4), LOBBY_RESP_INFO_SESSION_CODE);

  const payload = inner.subarray(6);
  assert.equal(payload.readUInt8(0), 0); // leading raw byte
  assert.equal(payload.readUInt8(1), 1); // one record
});

test('the session-wide ending flag round-trips through the client parser (ending=1)', () => {
  const payload = buildInformationSessionInner(createScenarioState({ ending: 1 })).subarray(6);
  const decoded = parse2006LikeClient(payload);
  // ending=1 must still parse cleanly (a zero ending body is inert) and not corrupt the stream.
  assert.equal(decoded.count, 1);
  assert.equal(decoded.recs[0].name, 'LOGH VII');
});

test('a no-leader power carries ending count 0 (inert) and still parses', () => {
  const payload = buildInformationSessionInner(
    createScenarioState({ powers: [{ id: 1, superMan: '' }, { id: 2, superMan: '' }] }),
  ).subarray(6);
  const decoded = parse2006LikeClient(payload);
  assert.equal(decoded.recs[0].powers[0].superMan, '');
  assert.equal(decoded.recs[0].powers[1].superMan, '');
});

test('the safe-max number of records fits the fixed buffer and the parser decodes them all', () => {
  const sessions = Array.from({ length: SESSION_RECORD_SAFE_MAX }, (_, i) => ({
    sessionName: `S${i}`,
    sessionId: i + 1,
  }));
  const inner = buildInformationSessionInner({ sessions });
  assert.equal(inner.length, 6 + LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  const decoded = parse2006LikeClient(inner.subarray(6));
  assert.equal(decoded.count, SESSION_RECORD_SAFE_MAX);
  assert.equal(decoded.recs[SESSION_RECORD_SAFE_MAX - 1].name, `S${SESSION_RECORD_SAFE_MAX - 1}`);
  assert.ok(decoded.bytesConsumed <= LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
});

test('rejects record counts above the buffer-safe max and above the parser cap', () => {
  assert.ok(SESSION_RECORD_SAFE_MAX <= SESSION_RECORD_PARSER_CAP);
  const overSafe = Array.from({ length: SESSION_RECORD_SAFE_MAX + 1 }, (_, i) => ({ sessionId: i + 1 }));
  // Either gate may fire first depending on whether SAFE_MAX < CAP; both keep the buffer intact.
  assert.throws(() => buildInformationSessionInner({ sessions: overSafe }), /buffer-safe max|parser cap/);
  const overCap = Array.from({ length: SESSION_RECORD_PARSER_CAP + 1 }, (_, i) => ({ sessionId: i + 1 }));
  assert.throws(() => buildInformationSessionInner({ sessions: overCap }), /buffer-safe max|parser cap/);
});

test('rejects oversize session_name / begin_day / super_man', () => {
  assert.throws(
    () => buildInformationSessionInner(createScenarioState({ sessionName: 'x'.repeat(SESSION_NAME_MAX_UNITS + 1) })),
    /session_name too long/,
  );
  assert.throws(
    () => buildInformationSessionInner(createScenarioState({ beginDay: 'y'.repeat(SESSION_BEGIN_DAY_MAX_UNITS + 1) })),
    /begin_day too long/,
  );
  assert.throws(
    () => buildInformationSessionInner(createScenarioState({ powers: [{ id: 1, superMan: 'z'.repeat(SESSION_SUPER_MAN_MAX_UNITS + 1) }] })),
    /super_man too long/,
  );
});

test('exactly SESSION_POWER_COUNT (2) power sub-records are always emitted', () => {
  // pass only one power; the missing slot must still be emitted (zero-filled) so the parser reads 2.
  const payload = buildInformationSessionInner(createScenarioState({ powers: [{ id: 9, superMan: 'Solo' }] })).subarray(6);
  assert.equal(SESSION_POWER_COUNT, 2);
  const decoded = parse2006LikeClient(payload);
  assert.equal(decoded.recs[0].powers.length, 2);
  assert.equal(decoded.recs[0].powers[0].id, 9);
  assert.equal(decoded.recs[0].powers[0].superMan, 'Solo');
  assert.equal(decoded.recs[0].powers[1].id, 2); // zero-filled slot defaults id to k+1
  assert.equal(decoded.recs[0].powers[1].superMan, ''); // no leader
});

test('the parser stops at the record count and the zero tail is ignored', () => {
  const inner = buildInformationSessionInner(createScenarioState({ sessionName: 'T', powers: [] }));
  const payload = inner.subarray(6);
  const decoded = parse2006LikeClient(payload);
  assert.equal(decoded.count, 1);
  assert.equal(decoded.recs[0].name, 'T');
  // the fixed object is exactly 0x5304 and the bytes after what the parser consumed are zero pad
  assert.equal(payload.length, LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  assert.equal(payload.subarray(decoded.bytesConsumed).every((b) => b === 0), true);
});
