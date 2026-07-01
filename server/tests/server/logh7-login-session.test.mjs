import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { createAccountStore, createLoginSession, LOGIN_PHASES } from '../../src/server/logh7-login-session.mjs';
import { createAccountRegistry, loadAccountRecords } from '../../src/server/logh7-account-registry.mjs';
import {
  buildGin7Credential,
  CMD_GENERATE_CHARGE_CODE,
  CMD_ORIGINAL_CHARGE_CODE,
  LOBBY_CMD_DELETE_CHARACTER_CODE,
  LOBBY_REQ_INFO_CHARACTER_CHARGE_CODE,
  LOBBY_SESSION_ANNOUNCE_NOTIFY_CODE,
  REQ_INFO_ACCOUNT_CODE,
  REQ_UNCHARGE_CHARACTER_CODE,
  REQ_CHARACTER_ENTRY_STATE_CODE,
  REQ_INFO_CHARACTER_CODE,
  SS_RESP_INFO_UNIT_HEADER,
} from '../../src/server/logh7-login-protocol.mjs';
import { createContentPack } from '../../src/server/logh7-content-pack.mjs';
import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { SESSION_RECORDS_BASE } from '../../src/server/logh7-scenario-session.mjs';
import {
  decodeNotifyInformationCharacterStream,
  NOTIFY_INFORMATION_CHARACTER_BYTES,
} from '../../src/server/logh7-personnel.mjs';
import { devCommandCategoryCards } from '../../src/server/logh7-dev-command-cards.mjs';
import { decodeStaticInformationCardMenuFields } from '../../src/server/logh7-info-records.mjs';
import {
  RESP_INFO_BASE_ELEM_BYTES,
  RIB_OFF_ELEM0,
  RIB_ELEM_OFF_ID,
  RIB_ELEM_OFF_FIELD_04,
  RIB_ELEM_OFF_BUDGETING_CNT,
  RIB_ELEM_OFF_BUDGETING,
  RIB_ELEM_OFF_BUDGET_CNT,
  RIB_ELEM_OFF_BUDGET,
  RIB_ELEM_OFF_COMMODITY_CNT,
  RIB_ELEM_OFF_COMMODITY,
  RIB_ELEM_OFF_FIELD_10,
  RIB_ELEM_OFF_FIELD_179,
} from '../../src/server/logh7-base-record.mjs';
import {
  NBP_OFF_POPULATION,
  NBP_OFF_FOOD,
  NOTIFY_BASE_PARAMETER_CODE,
} from '../../src/server/logh7-base-economy.mjs';
import { expandResponseInformationBaseWire } from './logh7-rib-wire-test-helpers.mjs';
import { expandResponseInformationInstitutionWire } from './logh7-rii-wire-test-helpers.mjs';

// A minimal canon content pack for the lottery/info-panel lanes: 2 named characters with abilities +
// portrait so 0x1003/0x1006/0x0323 carry real data.
function makeContentPack() {
  return createContentPack({
    name: 'test-canon',
    nations: [{ id: 1, name: 'Empire' }],
    characters: [
      { id: 209, name: 'Reinhard', nameRomaji: 'Reinhard', nationId: 1, abilities: [99, 98, 97, 96, 95, 94, 93, 92], portraitIndex: 209, title: 1 },
      { id: 195, name: 'Mittermeyer', nameRomaji: 'Mittermeyer', nationId: 1, abilities: [88, 87, 86, 85, 84, 83, 82, 81], portraitIndex: 195 },
    ],
  });
}

function makeGalaxyContentPack() {
  return createContentPack({
    name: 'test-galaxy',
    nations: [{ id: 1, name: 'Alliance' }],
    systems: [
      {
        name_ja: 'ルンビーニ',
        name_ko: '룬비니',
        faction: 'alliance',
        planets: [{ name_ja: 'バクタプール', name_ko: '박타푸르', orbit: 1 }],
      },
      {
        name_ja: 'イゼルローン',
        name_ko: '이젤론',
        faction: 'empire',
        fortresses: ['イゼルローン要塞'],
      },
    ],
  });
}

function makeValhallaGalaxyContentPack() {
  const systems = Array.from({ length: 70 }, (_, index) => ({
    name_ja: `System ${index + 1}`,
    faction: index < 35 ? 'alliance' : 'empire',
  }));
  systems[0] = {
    name_ja: 'ルンビーニ',
    name_ko: '룬비니',
    faction: 'alliance',
    planets: [{ name_ja: 'バクタプール', name_ko: '박타푸르', orbit: 1 }],
  };
  systems[69] = {
    name_ja: 'ヴァルハラ',
    name_ko: '발할라',
    faction: 'empire',
    planets: [
      { name_ja: 'ゾースト', orbit: 1 },
      { name_ja: 'オーディン', orbit: 2 },
      { name_ja: 'トゥール', orbit: 3 },
      { name_ja: 'ヴァルグリンド', orbit: 4 },
    ],
  };
  return createContentPack({
    name: 'test-valhalla-galaxy',
    nations: [{ id: 1, name: 'Empire' }],
    systems,
  });
}

function makeEightySystemGalaxyContentPack() {
  const systems = Array.from({ length: 80 }, (_, index) => ({
    name_ja: `System ${index + 1}`,
    faction: index < 35 ? 'alliance' : 'empire',
  }));
  systems[0] = {
    name_ja: 'ルンビーニ',
    name_ko: '룬비니',
    faction: 'alliance',
    planets: [{ name_ja: 'バクタプール', name_ko: '박타푸르', orbit: 1 }],
  };
  systems[69] = {
    name_ja: 'ヴァルハラ',
    name_ko: '발할라',
    faction: 'empire',
    planets: [
      { name_ja: 'ゾースト', orbit: 1 },
      { name_ja: 'オーディン', orbit: 2 },
      { name_ja: 'トゥール', orbit: 3 },
      { name_ja: 'ヴァルグリンド', orbit: 4 },
    ],
  };
  systems[79] = {
    name_ja: 'ヴォルムスガウ',
    name_ko: '웜스가우',
    faction: 'empire',
  };
  return createContentPack({
    name: 'test-80-system-galaxy',
    nations: [{ id: 1, name: 'Empire' }],
    systems,
  });
}

// Build a raw inbound inner [u16 BE code][body]. Used for the account-family request codes whose body
// is empty (roster priming) and the 0x1006 charge whose body is [u32 LE charId ...].
function makeInner(code, body = Buffer.alloc(0)) {
  const inner = Buffer.alloc(2 + body.length);
  inner.writeUInt16BE(code, 0);
  body.copy(inner, 2);
  return inner;
}

function readPstr16(payload, lenOff, charsOff) {
  const len = payload.readUInt8(lenOff);
  let value = '';
  for (let i = 0; i < len; i += 1) value += String.fromCharCode(payload.readUInt16LE(charsOff + i * 2));
  return value;
}

function readUnitBeU16(buffer, offset) {
  return buffer.readUInt16BE(offset);
}

function readUnitBeU32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function readUnitLeU16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readUnitLeU32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function ribOffset(index, elementOffset) {
  return RIB_OFF_ELEM0 + index * RESP_INFO_BASE_ELEM_BYTES + elementOffset;
}

function expandedRibBody(inner) {
  return expandResponseInformationBaseWire(inner.subarray(6));
}

function expandedRiiBody(inner) {
  return expandResponseInformationInstitutionWire(inner.subarray(6));
}

function strategicObjectVariantHistogram(inner, { startValue = 4, count = 80 } = {}) {
  const body = inner.subarray(6);
  const histogram = {};
  for (let index = 0; index < count; index += 1) {
    const value = startValue + index;
    const variant = body.readUInt8(1 + value * 3 + 2);
    histogram[variant] = (histogram[variant] ?? 0) + 1;
  }
  return histogram;
}

function strategicObjectVariant(inner, value) {
  return inner.subarray(6).readUInt8(1 + value * 3 + 2);
}

function appInnerCode(inner) {
  return inner.length >= 6 && inner.readUInt16BE(0) === 0 ? inner.readUInt16BE(4) : inner.readUInt16BE(0);
}

function stripPostloadCommandCards(codes) {
  return codes.filter((code) => code !== 0x0305);
}

function decodeNotifyCharacterDelta(inner) {
  const decoded = decodeNotifyInformationCharacterStream(inner.subarray(6));
  assert.ok(decoded);
  assert.equal(decoded.trailing, 0);
  assert.equal(decoded.object.length, NOTIFY_INFORMATION_CHARACTER_BYTES);
  return decoded.object;
}

function parseGenerateOk(okInner) {
  const body = okInner.subarray(6);
  let cursor = 0;
  const u8 = () => body.readUInt8(cursor++);
  const u16be = () => {
    const value = body.readUInt16BE(cursor);
    cursor += 2;
    return value;
  };
  const u32le = () => {
    const value = body.readUInt32LE(cursor);
    cursor += 4;
    return value;
  };
  const u32be = () => {
    const value = body.readUInt32BE(cursor);
    cursor += 4;
    return value;
  };
  const pstr16be = () => {
    const len = u8();
    let value = '';
    for (let i = 0; i < len; i += 1) {
      const code = u16be();
      if (code !== 0) value += String.fromCharCode(code);
    }
    return value;
  };
  const category = u32le();
  const status = u8();
  const power = u8();
  const blood = u8();
  const sex = u8();
  const lastname = pstr16be();
  const firstname = pstr16be();
  const createUnknown44 = u32be();
  const birthMonth = u8();
  const birthDay = u8();
  const face = u32be();
  const abilities = Array.from({ length: 8 }, () => u8());
  const bonusPoint = u8();
  const specialAbilityNum = u8();
  const title = u8();
  const rank = u8();
  const flagshipType = u8();
  const flagshipKind = u16be();
  const flagshipName = pstr16be();
  const check = cursor < body.length ? u8() : 0;
  return {
    category,
    status,
    power,
    blood,
    sex,
    lastname,
    firstname,
    createUnknown44,
    birthMonth,
    birthDay,
    face,
    abilities,
    bonusPoint,
    specialAbilityNum,
    title,
    rank,
    flagshipType,
    flagshipKind,
    flagshipName,
    check,
  };
}

function assertMessengerStatusRow(inner, charId, status = 1) {
  assert.equal(inner.readUInt16BE(4), 0x0f07);
  const payload = inner.subarray(6);
  assert.equal(payload.readUInt16LE(0), 1);
  assert.equal(payload.readUInt32LE(2), charId);
  assert.equal(payload.readUInt32LE(6), status);
}

// Faithful oracle of the client parser FUN_00444900 (PACKED, sequential SEEK_CUR stream — NOT fixed
// 0x14c stride; see logh7-scenario-session.mjs header). Returns the decoded session rows the picker sees.
function parse2006SessionList(payload) {
  let c = 0;
  const u8 = () => payload.readUInt8(c++);
  const u16 = () => { const v = payload.readUInt16LE(c); c += 2; return v; };
  const u32 = () => { const v = payload.readUInt32LE(c); c += 4; return v; };
  const str16 = (max) => { const n = u8(); let s = ''; for (let i = 0; i < n; i += 1) s += String.fromCharCode(u16()); if (n > max) throw new Error(`str_size ${n} > ${max}`); return s; };
  const lead = u8();
  const count = u8();
  const recs = [];
  for (let i = 0; i < count; i += 1) {
    const sessionId = u16();
    const status = u8();
    const name = str16(0xd);
    const beginDay = str16(0x41);
    u32(); // term
    for (let k = 0; k < 2; k += 1) {
      u8(); u32(); u32(); u32();
      const pend = u8();
      for (let m = 0; m < pend; m += 1) { str16(0xd); u16(); u8(); u8(); u8(); u8(); u8(); u16(); u16(); u32(); u32(); u32(); }
    }
    const ending = u8();
    for (let n = 0; n < ending; n += 1) { u16(); u16(); u32(); u32(); u32(); }
    recs.push({ sessionId, status, name, beginDay });
  }
  return { lead, count, recs };
}

// Drive a session up to the lobby-authenticated phase (post 0x0020 + 0x2000).
function lobbyAuthedSession(opts = {}) {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, ...opts });
  session.markHandshakeComplete();
  session.onInnerMessage(Buffer.from('002000000001', 'hex'));
  session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
  return session;
}

function strictLobbyAuthedSession(db, { account = 'p001flow', password = 'FlowPw17!', ...sessionOpts } = {}) {
  const store = createAccountStore({
    acceptAnyGin7: false,
    allowRegister: false,
    registry: createAccountRegistry({ persistPath: db }),
  });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [], ...sessionOpts });
  const login = session.onInnerMessage(buildGin7Credential({ account, password }));
  assert.equal(login.kind, 'redirect');
  session.onInnerMessage(Buffer.from('002000000001', 'hex'));
  session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
  return session;
}

function strictBoundLobbySession(db, { account = 'p001flow' } = {}) {
  const store = createAccountStore({
    acceptAnyGin7: false,
    allowRegister: false,
    registry: createAccountRegistry({ persistPath: db }),
  });
  const session = createLoginSession({
    accountStore: store,
    lobby: LOBBY,
    characters: [],
    boundAccount: account,
  });
  session.markHandshakeComplete();
  session.onInnerMessage(Buffer.from('002000000001', 'hex'));
  session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
  return session;
}

function firstLobbyCharacterId(session) {
  const list = session.onInnerMessage(Buffer.from('2003', 'hex'));
  assert.equal(list.kind, 'lobby-response');
  assert.equal(list.okInner.readUInt16BE(4), 0x2004);
  const payload = list.okInner.subarray(6);
  assert.ok(payload.readUInt8(0) >= 1);
  return payload.readUInt16LE(1);
}

// 0x2004 카드 목록은 컴팩트 순차 스트림이다(클라 0x0043fd60이 소비하며 0x36c 스트라이드 목적지로 복사).
// 레코드는 고정 스트라이드가 아니라 직전 레코드가 소비한 바이트 바로 뒤에서 시작하므로, 각 레코드의
// id를 얻으려면 스트림을 빌더와 동일하게 워크해야 한다. id(u16LE)·status(u8)·길이접두 UTF16 name/description
// 두 필드·게이트 프리픽스(0x22)·card_kind(1)·detail_count(1)·detail 블록(고정 31B + 길이접두 UTF16 3필드).
function lobbyCardIds(session) {
  const list = session.onInnerMessage(Buffer.from('2003', 'hex'));
  assert.equal(list.kind, 'lobby-response');
  assert.equal(list.okInner.readUInt16BE(4), 0x2004);
  const payload = list.okInner.subarray(6);
  const count = payload.readUInt8(0);
  // 길이접두(u8 = 문자수+NUL) UTF-16 필드 1개를 건너뛰고 다음 커서를 돌려준다.
  const skipUtf16Field = (cursor) => cursor + 1 + payload.readUInt8(cursor) * 2;
  const ids = [];
  let cursor = 0x01; // 첫 레코드 스트림 오프셋
  for (let i = 0; i < count; i += 1) {
    ids.push(payload.readUInt16LE(cursor));
    cursor += 2; // id
    cursor += 1; // status
    cursor = skipUtf16Field(cursor); // name
    cursor = skipUtf16Field(cursor); // description
    cursor += 0x22; // gate prefix
    cursor += 1; // card_kind
    cursor += 1; // detail_count
    cursor += 31; // detail 고정부(id4+power1+camp1+gen1+sex1+bMon1+bDay1+reserved4+state1+ability16)
    cursor = skipUtf16Field(cursor); // detail lastname
    cursor = skipUtf16Field(cursor); // detail firstname
    cursor = skipUtf16Field(cursor); // detail displayName
  }
  return ids;
}

// Build an inbound CommandGenerateCharacterCharge (0x1008): [u16 BE code][body] in the REAL packed
// wire form the live client emits — header power@0x05, then NUL-terminated UTF-16LE names written
// back-to-back (length byte = real chars + 1 NUL), then the fixed face/ability tail. Re-derived from
// a live "Reinhard"/"Lohengramm" capture; see docs/logh7-character-creation-wire.md §2.1.
// face defaults to a G-group slot (gem/5 = 1000005) — the only kind the creation picker can emit;
// O-group faces are canon-reserved and rejected by the authoritative create gate.
function makeGenerateCharacterCharge({ lastname = 'Reuenthal', firstname = 'Oskar', power = 1, blood = 0, abilities = [], face = 1000005, title = 0, rank = 0 } = {}) {
  const inner = Buffer.alloc(2 + 0x80);
  inner.writeUInt16BE(CMD_GENERATE_CHARGE_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(0, 0x00); // request_category
  body.writeUInt8(power, 0x05);
  body.writeUInt8(blood, 0x06); // origin/bloodline (drives the house-rule ability seed)
  let off = 0x08;
  const writeName = (name) => {
    const chars = [...name];
    body.writeUInt8(chars.length + 1, off); // length INCLUDES the NUL terminator
    const charsStart = off + 2;
    chars.forEach((ch, i) => body.writeUInt16LE(ch.charCodeAt(0), charsStart + i * 2));
    off = charsStart + chars.length * 2 + 1; // +1: next len byte sits on the terminator's low byte
  };
  writeName(lastname);
  writeName(firstname);
  body.writeUInt32LE(face, off); // face (G-group composite by default)
  for (let i = 0; i < 8; i += 1) body.writeUInt8(abilities[i] ?? 0, off + 4 + i);
  // 작위/계급 바이트(login-protocol: title=u8At(tail+14), rank=u8At(tail+15)). 기본 0(미설정).
  body.writeUInt8(title & 0xff, off + 14);
  body.writeUInt8(rank & 0xff, off + 15);
  return inner;
}

const LIVE_MULTIPHASE_CREATE_HEX = [
  '1008000000000003030005005700610076006500000600500072006f006200650000000000000000000000000000000000000000000000000000000000',
  '100801000000010000000000000000120101000f42410000000000000000000000000000000000',
  '100802000000000000000000000000000000000000000000000000000000000000000000000000',
  '10080300000001000000000000000000000000000000000000000000000000000000000000050056006500670061000000',
  '100804000000010000000000000000000000000000000000000000000000000000000000000001',
];

const REAL_LOGIN_INNER_HEX =
  '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000';
const LOBBY = { ip: '127.0.0.1', port: 47900 };
const SS_LOGIN_REQUEST_HEX = '020047494e3700570000070069006e00650069003000300000';

test('account store authenticates an exact registered credential', () => {
  const store = createAccountStore({
    accounts: [{ account: 'inei00', credentialHex: REAL_LOGIN_INNER_HEX }],
    acceptAnyGin7: false,
  });
  const result = store.authenticate(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  assert.deepEqual(result, { ok: true, account: 'inei00', matchedBy: 'credential' });
});

test('account store rejects unknown credential when acceptAnyGin7 is off', () => {
  const store = createAccountStore({ accounts: [], acceptAnyGin7: false });
  const result = store.authenticate(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  assert.equal(result.ok, false);
});

test('strict signup missing account and wrong password share generic failure without registration', () => {
  // Given: an out-of-band registry with exactly one provisioned account.
  const registry = createAccountRegistry();
  registry.register('strict-user', buildGin7Credential({ account: 'strict-user', password: 'RightPass!17' }));
  const store = createAccountStore({ acceptAnyGin7: false, allowRegister: false, registry });

  // When: a missing account and an existing account with a wrong password try to log in.
  const missing = store.authenticate(buildGin7Credential({ account: 'missing-user', password: 'RightPass!17' }));
  const wrongPassword = store.authenticate(buildGin7Credential({ account: 'strict-user', password: 'WrongPass!17' }));

  // Then: neither path succeeds, both expose the same client-facing failure, and no account is created.
  assert.deepEqual(missing, { ok: false, reason: 'authentication failed' });
  assert.deepEqual(wrongPassword, { ok: false, reason: 'authentication failed' });
  assert.equal(registry.has('missing-user'), false);
  assert.equal(registry.size, 1);
});

test('strict signup first login does not register unless compatibility registration is enabled', () => {
  // Given: a persistent-registry store in strict mode.
  const registry = createAccountRegistry();
  const store = createAccountStore({ acceptAnyGin7: false, allowRegister: false, registry });

  // When: a first login arrives for an unprovisioned account.
  const result = store.authenticate(buildGin7Credential({ account: 'new-user', password: 'FlowPw17!' }));

  // Then: it is rejected and the registry remains empty.
  assert.deepEqual(result, { ok: false, reason: 'authentication failed' });
  assert.equal(registry.has('new-user'), false);
  assert.equal(registry.size, 0);
});

test('strict signup missing account and wrong password both reject without 0x7001 redirect', () => {
  // Given: a strict account registry with one known account and two fresh login sessions.
  const registry = createAccountRegistry();
  registry.register('strict-user', buildGin7Credential({ account: 'strict-user', password: 'RightPass!17' }));
  const store = createAccountStore({ acceptAnyGin7: false, allowRegister: false, registry });
  const makeSession = () => {
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    return session;
  };

  // When: missing-account and wrong-password credentials enter the client-facing login path.
  const missing = makeSession().onInnerMessage(buildGin7Credential({ account: 'missing-user', password: 'RightPass!17' }));
  const wrongPassword = makeSession().onInnerMessage(
    buildGin7Credential({ account: 'strict-user', password: 'WrongPass!17' }),
  );

  // Then: both outcomes are the same generic rejection and neither carries a success redirect frame.
  assert.deepEqual(missing, { kind: 'reject', reason: 'authentication failed' });
  assert.deepEqual(wrongPassword, { kind: 'reject', reason: 'authentication failed' });
  assert.equal('redirectInner' in missing, false);
  assert.equal('redirectInner' in wrongPassword, false);
});

test('compatibility first login registration remains opt-in', () => {
  // Given: the explicit legacy compatibility mode.
  const registry = createAccountRegistry();
  const store = createAccountStore({ acceptAnyGin7: false, allowRegister: true, registry });

  // When: a first login arrives for an unprovisioned account.
  const result = store.authenticate(buildGin7Credential({ account: 'compat-user', password: 'FlowPw17!' }));

  // Then: only this opt-in path creates the registry record.
  assert.deepEqual(result, { ok: true, account: 'compat-user', matchedBy: 'registered' });
  assert.equal(registry.has('compat-user'), true);
  assert.equal(registry.size, 1);
});

test('account store accepts any GIN7 credential in skeleton mode', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const result = store.authenticate(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  assert.equal(result.ok, true);
  assert.equal(result.account, 'inei00');
  assert.equal(result.matchedBy, 'gin7-any');
});

test('account store rejects a non-credential inner', () => {
  const store = createAccountStore();
  assert.equal(store.authenticate(Buffer.from('002000000001', 'hex')).ok, false);
});

test('login session drives connected -> handshake -> redirected', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY });
  assert.equal(session.phase, LOGIN_PHASES.CONNECTED);
  session.markHandshakeComplete();
  assert.equal(session.phase, LOGIN_PHASES.HANDSHAKE_COMPLETE);

  const action = session.onInnerMessage(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  assert.equal(action.kind, 'redirect');
  assert.equal(action.account, 'inei00');
  assert.equal(session.phase, LOGIN_PHASES.REDIRECTED);
  // redirect inner targets the configured lobby
  assert.equal(action.redirectInner.readUInt16BE(0), 0x7001);
  assert.equal(action.redirectInner.readUInt16BE(12), 47900);
});

test('login session ignores an unrelated inner and further input after redirect', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY });
  session.markHandshakeComplete();

  // an inner that is neither the GIN7 login nor a lobby code is ignored
  const ignored = session.onInnerMessage(Buffer.from('009900000001', 'hex'));
  assert.equal(ignored.kind, 'ignore');
  assert.equal(session.phase, LOGIN_PHASES.HANDSHAKE_COMPLETE);

  session.onInnerMessage(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  const afterRedirect = session.onInnerMessage(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  assert.equal(afterRedirect.kind, 'ignore');
});

const LOBBY_LOGIN_REQUEST_HEX = '200047494e3700040000070069006e00650069003000300000';

test('login session handles the lobby flow: 0x0020 silent -> 0x2000 LobbyLoginOK (0x2001)', () => {
  // RE wicdkooh5: inner 0x7001 is inert on the lobby session; the advance is gated on the success
  // flag set ONLY by the inner-0x2001 consumer. So 0x2000 must be answered with 0x2001 (status 0).
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY });
  session.markHandshakeComplete();

  const init = session.onInnerMessage(Buffer.from('002000000001', 'hex'));
  assert.equal(init.kind, 'lobby-init-silent');
  assert.equal(session.phase, LOGIN_PHASES.LOBBY);

  const lobbyLogin = session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
  assert.equal(lobbyLogin.kind, 'lobby-login-ok');
  assert.equal(lobbyLogin.okInner.readUInt16BE(0), 0x2001);
  assert.equal(lobbyLogin.okInner.readUInt16BE(2), 0); // status 0 = OK
  assert.equal(lobbyLogin.okInner.length, 4);
  assert.equal(lobbyLogin.extraInners, undefined);
  assert.equal(session.phase, LOGIN_PHASES.LOBBY_AUTHENTICATED);
});

test('login session attaches a configured announcement push to 0x2000 LobbyLoginOK', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, announcementText: 'WELCOME' });
  session.markHandshakeComplete();

  const lobbyLogin = session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));

  assert.equal(lobbyLogin.kind, 'lobby-login-ok');
  assert.equal(lobbyLogin.okInner.readUInt16BE(0), 0x2001);
  assert.equal(Array.isArray(lobbyLogin.extraInners), true);
  assert.equal(lobbyLogin.extraInners.length, 1);
  const announce = lobbyLogin.extraInners[0];
  assert.equal(announce.readUInt32BE(0), 0);
  assert.equal(announce.readUInt16BE(4), LOBBY_SESSION_ANNOUNCE_NOTIFY_CODE);
  assert.equal(announce.subarray(6, 13).toString('latin1'), 'WELCOME');
  assert.equal(announce.readUInt8(13), 0);
});

test('login session sends a configured announcement once across early and normal LobbyLoginOK', () => {
  const previous = process.env.LOGH_LOBBY_EARLY_OK;
  process.env.LOGH_LOBBY_EARLY_OK = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, announcementText: 'WELCOME' });
    session.markHandshakeComplete();

    const early = session.onInnerMessage(Buffer.from('002000000001', 'hex'));
    assert.equal(early.kind, 'lobby-login-ok');
    assert.equal(early.extraInners, undefined);

    const normal = session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
    assert.equal(normal.kind, 'lobby-login-ok');
    assert.equal(normal.extraInners?.length, 1);
    assert.equal(normal.extraInners[0].readUInt16BE(4), LOBBY_SESSION_ANNOUNCE_NOTIFY_CODE);
  } finally {
    if (previous === undefined) {
      delete process.env.LOGH_LOBBY_EARLY_OK;
    } else {
      process.env.LOGH_LOBBY_EARLY_OK = previous;
    }
  }
});

test('login session redirects to the world server on 0x2009 -> 0x200a with the world endpoint', () => {
  // RE wicdkooh5: the lobby->world handoff is inner 0x200a (paired reply to client 0x2009), carrying
  // the world IP/port; consumer 0x4bdc2e populates +0x35f144 and the FSM connects conn3 there.
  const store = createAccountStore({ acceptAnyGin7: true });
  const WORLD = { ip: '127.0.0.1', port: 47950, token: 0x11223344 };
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, world: WORLD });
  session.markHandshakeComplete();
  session.onInnerMessage(Buffer.from('002000000001', 'hex'));
  session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));

  // 0x2009 LobbySessionLoginRequest -> 0x200a world redirect
  const worldRedirect = session.onInnerMessage(Buffer.from('200900000001', 'hex'));
  assert.equal(worldRedirect.kind, 'lobby-response');
  const inner = worldRedirect.okInner;
  assert.equal(inner.readUInt16BE(0), 0x0000); // mpsClientMessage32 prefix high word
  assert.equal(inner.readUInt16BE(4), 0x200a);
  assert.equal(inner.length, 18);
  assert.equal(inner.readUInt32BE(6), 0x0100007f); // 127.0.0.1, octet-low-first
  assert.equal(inner.readUInt16BE(10), 47950); // world port
  assert.equal(inner.readUInt16BE(12), 0); // pad
  assert.equal(inner.readUInt32BE(14), 0x11223344); // token
});

test('login session answers 0x2003 with selectable 0x2004 character-charge ids', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [{ id: 7 }] });
  session.markHandshakeComplete();
  session.onInnerMessage(Buffer.from('002000000001', 'hex'));
  session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));

  const characterCharge = session.onInnerMessage(Buffer.from('2003', 'hex'));

  assert.equal(characterCharge.kind, 'lobby-response');
  assert.equal(characterCharge.okInner.length, 0x6e2);
  assert.equal(characterCharge.okInner.readUInt32BE(0), 0);
  assert.equal(characterCharge.okInner.readUInt16BE(4), 0x2004);
  const payload = characterCharge.okInner.subarray(6);
  assert.equal(payload.length, 0x6dc);
  assert.equal(payload.readUInt8(0), 1);
  assert.equal(payload.readUInt16LE(1), 7);
  assert.equal(payload.readUInt8(0x64), 2);
  assert.equal(payload.readUInt8(0x65), 1);
  assert.equal(payload.readUInt8(0x2a0), 0);
  assert.equal(payload.readUInt8(0x2a1), 0);
});

test('login session answers the LIVE 0x2005 variant 02/01 with the PACKED 0x2006 layout the parser reads', () => {
  // REGRESSION (live, 2026-06-15): the session-select row (screen 747,260) renders 0 rows. The live
  // client sends 0x2005 with a sub-arg byte (200502 then 200501); the real parser FUN_00444900 reads
  // the body as a PACKED, sequential SEEK_CUR stream (RE-verified 2026-06-16) — NOT a fixed 0x14c stride.
  // The variant path MUST use that packed layout so the picker can parse >= 1 selectable record.
  const session = lobbyAuthedSession({
    sessions: [
      { sessionId: 1, name: 'Amritsar', status: 1, beginDay: 'UC 796' },
      { sessionId: 2, name: 'Vermilion', status: 1, beginDay: 'UC 799' },
    ],
  });

  for (const variantHex of ['200502', '200501']) {
    const reply = session.onInnerMessage(Buffer.from(variantHex, 'hex'));
    assert.equal(reply.kind, 'lobby-response');
    assert.equal(reply.okInner.length, 0x530a); // fixed 0x2006 message32 object
    assert.equal(reply.okInner.readUInt16BE(4), 0x2006);
    const payload = reply.okInner.subarray(6);
    const decoded = parse2006SessionList(payload);
    assert.equal(decoded.lead, 0);
    assert.ok(decoded.count >= 1, `${variantHex} must carry >= 1 session record`);
    assert.equal(decoded.recs[0].sessionId, 1);
    assert.equal(decoded.recs[0].status, 1); // selectable (1|2)
    assert.equal(decoded.recs[0].name, 'Amritsar');
    assert.equal(decoded.recs[0].beginDay, 'UC 796');
  }
});

test('login session answers 0x2005 with a named 0x2006 session list', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY });
  session.markHandshakeComplete();
  session.onInnerMessage(Buffer.from('002000000001', 'hex'));
  session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));

  const sessionList = session.onInnerMessage(Buffer.from('2005', 'hex'));

  assert.equal(sessionList.kind, 'lobby-response');
  assert.equal(sessionList.okInner.length, 0x530a);
  assert.equal(sessionList.okInner.readUInt32BE(0), 0);
  assert.equal(sessionList.okInner.readUInt16BE(4), 0x2006);
  const payload = sessionList.okInner.subarray(6);
  assert.equal(payload.length, 0x5304);
  const decoded = parse2006SessionList(payload);
  assert.equal(decoded.lead, 0); // raw leading byte
  assert.equal(decoded.count, 1); // record count
  assert.equal(decoded.recs[0].sessionId, 1);
  assert.equal(decoded.recs[0].status, 1);
  assert.equal(decoded.recs[0].name, 'LOGH VII');
  assert.equal(decoded.recs[0].beginDay, 'UC 796');
});

test('login session 0x2005 still emits the legacy packed 0x2006 layout under the explicit compact A/B knob', () => {
  // The OLD packed shape is proven WRONG against the live parser (it caused 0 rows on the default path),
  // but the LOGH_LOBBY_SESSION_LAYOUT=compact knob keeps it reachable for instrumentation/A-B. Pin its
  // packed byte layout here (session_id @payload+2, NUL-terminated names back-to-back) under that env.
  const previous = process.env.LOGH_LOBBY_SESSION_LAYOUT;
  process.env.LOGH_LOBBY_SESSION_LAYOUT = 'compact';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({
      accountStore: store,
      lobby: LOBBY,
      sessions: [
        { sessionId: 1, name: 'Amritsar', status: 1, beginDay: 'UC 796' },
        { sessionId: 2, name: 'Vermilion', status: 1, beginDay: 'UC 799' },
      ],
    });
    session.markHandshakeComplete();
    session.onInnerMessage(Buffer.from('002000000001', 'hex'));
    session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));

    const sessionList = session.onInnerMessage(Buffer.from('200502', 'hex'));

    assert.equal(sessionList.kind, 'lobby-response');
    assert.equal(sessionList.okInner.length, 0x530a);
    assert.equal(sessionList.okInner.readUInt32BE(0), 0);
    assert.equal(sessionList.okInner.readUInt16BE(4), 0x2006);
    const payload = sessionList.okInner.subarray(6);
    assert.equal(payload.readUInt8(0), 0); // raw leading byte
    assert.equal(payload.readUInt8(1), 1); // compact selector-02 keeps only the current session
    assert.equal(payload.readUInt16LE(2), 1);
    assert.equal(payload.readUInt8(4), 1);
    assert.equal(readPstr16(payload, 5, 6), 'Amritsar\0');
    const beginDayLenOff = 6 + payload.readUInt8(5) * 2;
    assert.equal(readPstr16(payload, beginDayLenOff, beginDayLenOff + 1), 'UC 796\0');
    assert.notEqual(payload.readUInt16LE(SESSION_RECORDS_BASE - 3), 1);

    const catalog = session.onInnerMessage(Buffer.from('200501', 'hex'));
    const catalogPayload = catalog.okInner.subarray(6);
    assert.equal(catalogPayload.readUInt8(1), 2); // selector-01 keeps the compact catalog
    const secondRecord = beginDayLenOff + 1 + catalogPayload.readUInt8(beginDayLenOff) * 2;
    assert.equal(catalogPayload.readUInt16LE(secondRecord), 2);
  } finally {
    if (previous === undefined) {
      delete process.env.LOGH_LOBBY_SESSION_LAYOUT;
    } else {
      process.env.LOGH_LOBBY_SESSION_LAYOUT = previous;
    }
  }
});

test('login session 0x2009 world redirect falls back to the lobby endpoint when world is unset', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY });
  session.markHandshakeComplete();
  session.onInnerMessage(Buffer.from('002000000001', 'hex'));
  session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
  const worldRedirect = session.onInnerMessage(Buffer.from('200900000001', 'hex'));
  assert.equal(worldRedirect.okInner.readUInt16BE(4), 0x200a);
  assert.equal(worldRedirect.okInner.readUInt16BE(10), 47900); // falls back to lobby port
});

test('login session answers conn3 0x0200 SSLoginRequest with 0x0201 SSLoginOK', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY });
  session.markHandshakeComplete();

  const init = session.onInnerMessage(Buffer.from('002000000000', 'hex'));
  assert.equal(init.kind, 'ss-init-silent');
  assert.equal(session.phase, LOGIN_PHASES.SS);

  const loginOk = session.onInnerMessage(Buffer.from(SS_LOGIN_REQUEST_HEX, 'hex'));
  assert.equal(loginOk.kind, 'ss-response');
  assert.equal(loginOk.okInner.toString('hex'), '02010100');
  assert.equal(session.phase, LOGIN_PHASES.SS_AUTHENTICATED);

  const gameLoginOk = session.onInnerMessage(Buffer.from('0205', 'hex'));
  assert.equal(gameLoginOk.kind, 'ss-response');
  assert.equal(gameLoginOk.okInner.toString('hex'), '02060100');
});

test('login session lobby flow keeps the legacy 0x7001 redirect reachable via env (A/B)', () => {
  const previous = process.env.LOGH_LOBBY_REPLY;
  process.env.LOGH_LOBBY_REPLY = 'redirect7001';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    session.onInnerMessage(Buffer.from('002000000001', 'hex'));
    const lobbyLogin = session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
    assert.equal(lobbyLogin.kind, 'lobby-redirect');
    assert.equal(lobbyLogin.redirectInner.readUInt16BE(0), 0x7001);
    assert.equal(session.phase, LOGIN_PHASES.LOBBY_AUTHENTICATED);
  } finally {
    if (previous === undefined) {
      delete process.env.LOGH_LOBBY_REPLY;
    } else {
      process.env.LOGH_LOBBY_REPLY = previous;
    }
  }
});

test('login session pushes the player spawn on 0x0f02 GridInitialize before the 0x0f03 ack (LOGH_WORLD_PLAYER)', () => {
  // G164 timing fix: the world-init reset fires at 0x0f01 (zeroes client+0x36a5dc), so the spawn
  // is injected on RequestGridInitialize (0x0f02) — after that reset, before the HUD render. okInner
  // = 0x0204 selected char id, then 0x0325 unit table + 0x0323 record, then the 0x0f03 ack LAST so
  // grid-init's rebuild (FUN_004c2a80) places the player into PLAYER_INFO before the first render.
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    // okInner = 0x0204 selected char id (BE 1 at payload offset 0)
    assert.equal(action.okInner.readUInt16BE(4), 0x0204);
    assert.equal(action.okInner.readUInt32BE(6), 1);
    // extras in order: dynamic base/facility sources, 0x0325 unit table, 0x0323 record,
    // then the 0x0f03 GridInitialize_OK LAST.
    assert.equal(Array.isArray(action.extraInners), true);
    assert.deepEqual(action.extraInners.map(appInnerCode), [0x031f, 0x0321, 0x0325, 0x0323, 0x0f03]);
    const unitTable = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unitTable);
    assert.equal(unitTable.length, 6 + 0xce44);
    assert.equal(readUnitLeU16(unitTable.subarray(6), 0), 1); // unit count, default live-safe LE wire
    assert.equal(readUnitLeU32(unitTable.subarray(6), 4), 1); // unit[0].id
    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    assert.equal(character.length, 6 + 0x02d4);
    assert.equal(character.readUInt32BE(6), 1); // record[0] = char id
    const characterBody = character.subarray(6);
    assert.equal(characterBody.readUInt32BE(0x24), 1); // record[9] = unit id
    assert.equal(characterBody.readUInt8(0x7d), 1); // valid parentage/name, no stale HUD string source
    assert.equal(characterBody.readUInt8(0x81), 'Character 1'.length);
    assert.equal(characterBody.readUInt16LE(0x82), 'C'.charCodeAt(0));
    assert.equal(characterBody.readUInt8(0x24c), 0); // 0x0323 card/seat count (RE: FUN_00417390)
    assert.equal(characterBody.readUInt8(0x250), 0); // live-safe default: no experimental seat/card slots
    assert.equal(characterBody.readUInt32BE(0x254), 0);
    assert.equal(action.extraInners.at(-1).readUInt16BE(4), 0x0f03); // GridInitialize_OK LAST
    assert.equal(action.extraInners.at(-1).subarray(6).readUInt8(0), 1); // status 1

    const repeat = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(repeat.kind, 'lobby-response');
    assert.equal(repeat.okInner.readUInt16BE(4), 0x0f03);
    assert.equal(repeat.extraInners, undefined);
  } finally {
    if (previous === undefined) {
      delete process.env.LOGH_WORLD_PLAYER;
    } else {
      process.env.LOGH_WORLD_PLAYER = previous;
    }
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

// 캐논 NPC 위계 시드(LOGH_SEED_CANON_NPCS=1): 월드 진입 0x0f02 시 플레이어 외 캐논 NPC를 권위적 0x0323
// 레코드로 채워, 클라 HUD가 외톨이 플레이어를 "황제"로 폴백하지 못하게 한다. (a) 최상위 칭호(황제)를 가진
// NPC가 ≥1개, (b) 갓 생성한 플레이어는 작위 없음 + 신참 계급(3/4), (c) 각 0x0323 레코드 바이트 길이 불변.
test('login session 0x0f02 synth fallback player carries non-zero HUD stats when canon id 1 exists', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const contentPack = createContentPack({
      name: 'fallback-canon',
      nations: [{ id: 1, name: 'Empire' }],
      characters: [
        { id: 1, name: 'CanonSovereign', nameRomaji: 'CanonSovereign', nationId: 1, title: 9, abilities: [99, 99, 99, 99, 99, 99, 99, 99] },
      ],
    });
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [], contentPack });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(makeInner(0x0f02));
    assert.equal(action.kind, 'lobby-response');
    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    const body = character.subarray(6);
    const ability = (i) => body.readUInt16LE(0x188 + i * 4);
    assert.equal(body.readUInt32BE(0), 1, 'fallback keeps the requested player id');
    assert.equal(ability(0), 50, 'synthetic fallback carries the complete default tochi seed');
    assert.equal(ability(1), 50, 'synthetic fallback carries the complete default seiji seed');
    assert.equal(ability(3), 50, 'synthetic fallback carries the complete default joho seed');
    assert.equal(body.readUInt8(0x1a9), 100, 'synthetic fallback carries full stamina');
    assert.equal(body.readUInt8(0x2d0), 1, 'synthetic fallback carries together/HUD party flag');
    assert.equal(body.readUInt8(0x24c), 0, 'early fallback 0x0323 still keeps card/seat count closed');
    assert.equal(body.readUInt8(0x250), 0, '0x0323 gap remains clear');
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session keeps second 0x0f02 ack-only when NotifyTactics probe is enabled', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevNotifyTactics = process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const first = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(first.kind, 'lobby-response');
    assert.equal(first.okInner.readUInt16BE(4), 0x0204);
    assert.deepEqual(first.extraInners.map(appInnerCode), [0x031f, 0x0321, 0x0325, 0x0323, 0x0f03]);

    const reseed = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(reseed.kind, 'lobby-response');
    assert.equal(reseed.okInner.readUInt16BE(4), 0x0f03);
    assert.equal(reseed.extraInners, undefined);

    const repeat = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(repeat.kind, 'lobby-response');
    assert.equal(repeat.okInner.readUInt16BE(4), 0x0f03);
    assert.equal(repeat.extraInners, undefined);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevNotifyTactics === undefined) delete process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
    else process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS = prevNotifyTactics;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session keeps second 0x0f02 ack-only when battle-entry probe is enabled', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevNotifyTactics = process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  const prevDeferTables = process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
  delete process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
  delete process.env.LOGH_ACTION_LIST_SEATS;
  delete process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const first = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(first.kind, 'lobby-response');
    assert.equal(first.okInner.readUInt16BE(4), 0x0204);
    assert.deepEqual(first.extraInners.map(appInnerCode), [0x031f, 0x0321, 0x0325, 0x0323, 0x0f03]);

    const reseed = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(reseed.kind, 'lobby-response');
    assert.equal(reseed.okInner.readUInt16BE(4), 0x0f03);
    assert.equal(reseed.extraInners, undefined);

    const repeat = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(repeat.kind, 'lobby-response');
    assert.equal(repeat.okInner.readUInt16BE(4), 0x0f03);
    assert.equal(repeat.extraInners, undefined);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevNotifyTactics === undefined) delete process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
    else process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS = prevNotifyTactics;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
    if (prevDeferTables === undefined) delete process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
    else process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = prevDeferTables;
  }
});

test('LOGH_DIAG_PLAYER returns a trace event on 0x0f02 without doing transport-layer IO', () => {
  const previousPlayer = process.env.LOGH_WORLD_PLAYER;
  const previousDiag = process.env.LOGH_DIAG_PLAYER;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_DIAG_PLAYER = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(makeInner(0x0f02));

    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x0204);
    assert.equal(action.extraInners.at(-1).readUInt16BE(4), 0x0f03);
    assert.equal(Array.isArray(action.traceEvents), true);
    assert.equal(action.traceEvents.length, 1);
    assert.equal(action.traceEvents[0].event, 'diag-player-record');
    assert.equal(action.traceEvents[0].charId, 1);
    assert.equal(action.traceEvents[0].hasRealPlayerChar, false);
    assert.equal(action.traceEvents[0].playerName, null);
  } finally {
    if (previousPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previousPlayer;
    if (previousDiag === undefined) delete process.env.LOGH_DIAG_PLAYER;
    else process.env.LOGH_DIAG_PLAYER = previousDiag;
  }
});

function makeCanonNpcContentPack() {
  return createContentPack({
    name: 'test-canon-npcs',
    nations: [{ id: 0x500, name: 'Empire' }, { id: 0x501, name: 'Alliance' }],
    characters: [
      // 제국 元帥(wireRank 14) — 시드 측이 최상위 군주로 "황제" 스탬프 대상이 됨.
      { id: 0x500, name: 'Sovereign', nameRomaji: 'Sovereign', nationId: 0x500, faction: 'empire', postJa: '宇宙艦隊司令長官', wireRank: 14, gender: 'male', portraitIndex: 209, faceCode: 0, abilities: [99, 98, 97, 96, 95, 94, 93, 92] },
      // 제국 大将(wireRank 12)
      { id: 0x501, name: 'EmpireGeneral', nameRomaji: 'EmpireGeneral', nationId: 0x500, faction: 'empire', postJa: '艦隊司令官', wireRank: 12, gender: 'male', portraitIndex: 195, faceCode: 1, abilities: [88, 87, 86, 85, 84, 83, 82, 81] },
      // 동맹 大将(wireRank 12)
      { id: 0x502, name: 'AllianceGeneral', nameRomaji: 'AllianceGeneral', nationId: 0x501, faction: 'alliance', postJa: '宇宙艦隊総参謀長', wireRank: 12, gender: 'male', portraitIndex: 100, faceCode: 100000, abilities: [80, 79, 78, 77, 76, 75, 74, 73] },
    ],
  });
}

test('월드 진입 0x0f02: 캐논 NPC 위계 시드(LOGH_SEED_CANON_NPCS=1)가 ≥1개 황제 칭호 NPC와 distinct 0x0323을 채운다', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevSeed = process.env.LOGH_SEED_CANON_NPCS;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_SEED_CANON_NPCS = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeCanonNpcContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    // 0x0323 레코드가 플레이어 1개 + 시드 NPC 3개 = 4개(>1).
    const records = action.extraInners.filter((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(records.length > 1, `expected >1 0x0323 records, got ${records.length}`);
    assert.equal(records.length, 4);
    // (c) 모든 0x0323 레코드는 동일 고정 바이트 길이(와이어 레이아웃 불변).
    for (const rec of records) assert.equal(rec.length, 6 + 0x02d4);
    // distinct id: 플레이어(1) + NPC(0x500/0x501/0x502).
    const ids = records.map((rec) => rec.readUInt32BE(6)).sort((a, b) => a - b);
    assert.deepEqual(ids, [1, 0x500, 0x501, 0x502]);
    // (a) 서버가 합성 최상위 칭호 "황제"를 titlename(@0xd8 len, @0xda chars)에 넣지 않는다.
    const readTitlename = (rec) => {
      const body = rec.subarray(6);
      const len = body.readUInt8(0xd8);
      let s = '';
      for (let i = 0; i < len; i += 1) s += String.fromCharCode(body.readUInt16LE(0xda + i * 2));
      return s;
    };
    const emperors = records.filter((rec) => readTitlename(rec) === '황제');
    assert.equal(emperors.length, 0, 'server must not synthesize a 황제 title NPC');
    // distinct face(@0xf4): 임시 O군 코드가 NPC마다 다르다.
    const npcFaces = records
      .filter((rec) => rec.readUInt32BE(6) !== 1)
      .map((rec) => rec.subarray(6).readUInt32LE(0xf4)); // face@0xf4 writeRecordU32=LE
    assert.equal(new Set(npcFaces).size, npcFaces.length, 'NPC face codes must be distinct');
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER; else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevSeed === undefined) delete process.env.LOGH_SEED_CANON_NPCS; else process.env.LOGH_SEED_CANON_NPCS = prevSeed;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS; else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

// 캐논 NPC 시드 정제(2026-06-26): ①rank 클램프(유효 사다리 1..14 밖 값 차단) ②캐논명 unmask는
// 매뉴얼 문서화 인물(manualDocumented=P1)만 — 비문서화(추측명)는 익명 마스크('Character N')로 폴백
// (추측명 P0 승격 금지). 와이어 레이아웃 불변(레코드 바이트 길이 동일).
function makeRankClampContentPack() {
  return createContentPack({
    name: 'test-canon-npc-refine',
    nations: [{ id: 0x500, name: 'Empire' }, { id: 0x501, name: 'Alliance' }],
    characters: [
      // 매뉴얼 문서화 인물: 캐논명이 노출돼야 한다. wireRank=99(범위 밖)는 14로 클램프돼야 한다.
      { id: 0x510, name: 'Reinhard', nameRomaji: 'Reinhard', nationId: 0x500, faction: 'empire', postJa: '艦隊司令官', manualDocumented: true, wireRank: 99, gender: 'male', portraitIndex: 209, faceCode: 0, abilities: [99, 98, 97, 96, 95, 94, 93, 92] },
      // 비문서화(추측) 인물: 캐논명 노출 금지 → 'Character N' 마스크. wireRank=0(미설정)은 클램프 0(계급 없음) 유지.
      { id: 0x511, name: 'GuessedName', nameRomaji: 'GuessedName', nationId: 0x501, faction: 'alliance', postJa: '副司令官', manualDocumented: false, wireRank: 0, gender: 'male', portraitIndex: 100, faceCode: 100000, abilities: [50, 50, 50, 50, 50, 50, 50, 50] },
    ],
  });
}

test('캐논 NPC 시드 정제: rank 클램프(1..14) + 캐논명 unmask는 매뉴얼 문서화 인물만(추측명 마스크)', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevSeed = process.env.LOGH_SEED_CANON_NPCS;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_SEED_CANON_NPCS = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeRankClampContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    const records = action.extraInners.filter((inner) => inner.readUInt16BE(4) === 0x0323);
    // 와이어 레이아웃 불변: 모든 0x0323 레코드 동일 고정 바이트 길이.
    for (const rec of records) assert.equal(rec.length, 6 + 0x02d4);
    const byId = new Map(records.map((rec) => [rec.readUInt32BE(6), rec.subarray(6)]));
    // 표시명(lastname @0x81 len / @0x82 chars, UTF-16LE).
    const readLastname = (body) => {
      const len = body.readUInt8(0x81);
      let s = '';
      for (let i = 0; i < len; i += 1) s += String.fromCharCode(body.readUInt16LE(0x82 + i * 2));
      return s;
    };
    const empire = byId.get(0x510);
    const alliance = byId.get(0x511);
    assert.ok(empire && alliance, 'both seeded NPCs present');
    // ① rank 클램프: wireRank=99 → 14(RANK_MAX)로 클램프(@0xd6, writeRecordU16=LE).
    assert.equal(empire.readUInt16LE(0xd6), 2, 'out-of-range wireRank must clamp to marshal subId 2');
    // wireRank=0(미설정)은 0(계급 없음) 유지.
    assert.equal(alliance.readUInt16LE(0xd6), 0, 'rank 0 (unset) stays 0');
    // ② unmask: 매뉴얼 문서화 인물은 캐논명 노출.
    assert.equal(readLastname(empire), 'Reinhard', 'manual-documented NPC exposes canon name');
    // 비문서화(추측) 인물은 익명 마스크(추측명 P0 승격 금지).
    // 익명 마스크 'Character 1297'(0x511=1297). 와이어 이름 필드는 13유닛 캡이라 마지막 자가 잘려 'Character 129'.
    assert.equal(readLastname(alliance), 'Character 129', 'non-documented NPC masked as Character N (13-unit cap)');
    // 캐논명이 아님을 명확히(추측명 P0 승격 금지 확인).
    assert.ok(!readLastname(alliance).includes('Guessed'), 'guessed canon name must not leak into the wire name field');
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER; else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevSeed === undefined) delete process.env.LOGH_SEED_CANON_NPCS; else process.env.LOGH_SEED_CANON_NPCS = prevSeed;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS; else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('갓 생성한 플레이어는 작위 없음(공작 시도 차단) + 신참 계급(少尉=3/4)이며 절대 황제/공작이 아니다', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
  session.markHandshakeComplete();
  // 작위 바이트=1(공작 시도), 계급 바이트=0(미설정) → 서버가 작위 0(없음), 계급 initialCharacterRankId(제국=3)로 클램프.
  const created = session.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Junior', firstname: 'Officer', power: 1, title: 1, rank: 0 }));
  assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
  const createdId = firstLobbyCharacterId(session);
  // 0x0322 정보 카드 요청 → 0x0323 레코드(title=characterTitleName, rank=characterRankId)로 검사.
  const reqBody = Buffer.alloc(2 + 6);
  reqBody.writeUInt16BE(REQ_INFO_CHARACTER_CODE, 0);
  reqBody.writeUInt16LE(1, 2); // count
  reqBody.writeUInt32LE(createdId, 4); // char id
  const info = session.onInnerMessage(reqBody);
  assert.equal(info.kind, 'lobby-response');
  const body = info.okInner.subarray(6);
  // (b) 신참 계급: 제국 少尉 = 3 (initialCharacterRankId(power=1)), 동맹이면 4. 0x0322 경로는 LE 와이어.
  assert.equal(body.readUInt16LE(0xd6), 0x0d, `junior rank subId expected 13, got ${body.readUInt16LE(0xd6)}`);
  // (b) 작위 없음: titlename 길이 0(공작 시도가 0으로 클램프됨 → 작위명 미렌더). 절대 공작/황제 아님.
  assert.equal(body.readUInt8(0xd8), 0, 'created player must have no peerage titlename');
});

test('DEFECT 1: 충돌하는 캐논 id가 있어도 월드진입 0x0323 플레이어는 생성 캐릭(황제 아님)이다', () => {
  // 근본: 생성 캐릭 id는 lobby max+1(신규 계정이면 1)이라 캐논 contentPack char id와 충돌한다.
  // activeCharacterRecord는 contentPack 우선이라, 수정 전엔 생성한 플레이어가 같은 id의 캐논 인물에 가려져
  // HUD가 캐논(예: 황제 칭호)으로 그려졌다. playerRecord가 생성/로비 레코드를 충돌 캐논보다 우선해야 한다.
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  process.env.LOGH_WORLD_PLAYER = '1';
  try {
    // 캐논 char id 1 = 'CanonSovereign'(고작위) — 신규 계정의 첫 생성 캐릭이 받는 id와 충돌.
    const contentPack = createContentPack({
      name: 'collision-canon',
      nations: [{ id: 1, name: 'Empire' }],
      characters: [
        { id: 1, name: 'CanonSovereign', nameRomaji: 'CanonSovereign', nationId: 1, title: 9, abilities: [99, 99, 99, 99, 99, 99, 99, 99], portraitIndex: 1 },
      ],
    });
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [], contentPack });
    session.markHandshakeComplete();
    const created = session.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Lohengram', firstname: 'Reinhard', power: 1 }));
    assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
    const createdId = firstLobbyCharacterId(session);
    assert.equal(createdId, 1, '신규 생성 캐릭은 캐논 id 1과 충돌하는 id 1을 받는다');

    const action = session.onInnerMessage(makeInner(0x0f02));
    const playerCard = (action.extraInners || []).find((i) => i.readUInt16BE(4) === 0x0323);
    assert.ok(playerCard, '월드진입이 0x0323 플레이어 레코드를 푸시');
    const body = playerCard.subarray(6);
    const len = body.readUInt8(0x81);
    let lastname = '';
    for (let i = 0; i < len; i += 1) lastname += String.fromCharCode(body.readUInt16LE(0x82 + i * 2));
    const ability = (i) => body.readUInt16LE(0x188 + i * 4);
    assert.equal(ability(0), 48, 'initial world-entry player card carries created tochi seed');
    assert.equal(ability(1), 55, 'initial world-entry player card carries created seiji seed');
    assert.equal(ability(3), 50, 'initial world-entry player card carries created joho seed');
    assert.equal(body.readUInt8(0x1a9), 100, 'initial world-entry player card carries full stamina');
    assert.equal(body.readUInt8(0x2d0), 1, 'initial world-entry player card carries together/HUD party flag');
    assert.equal(lastname, 'Lohengram', `월드진입 플레이어는 생성 캐릭이어야 한다(충돌 캐논 아님), got "${lastname}"`);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER; else process.env.LOGH_WORLD_PLAYER = prevPlayer;
  }
});

test('DEFECT 1 (라이브 시나리오): conn3 월드 세션이 계정 프로필의 생성 캐릭으로 플레이어를 해석한다(황제 아님)', () => {
  // 라이브 재현: 캐릭 생성(0x1008)은 로비(conn2) 세션에서 일어나고, 월드 진입(0x0f02)은 별개의 conn3 세션
  // 인스턴스에서 일어난다. 두 세션은 같은 계정/레지스트리를 공유하므로 conn3는 loadAccountProfileCharacters로
  // 생성 캐릭을 다시 로드해야 한다. 그 캐릭 id가 캐논 contentPack char id와 충돌해도 월드진입 0x0323 플레이어는
  // 생성 캐릭(Lohengram)이어야 한다 — 캐논(황제)이 아니라. (단일세션 테스트가 못 잡는 분리-세션 핸드오프 경로.)
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  process.env.LOGH_WORLD_PLAYER = '1';
  try {
    const contentPack = createContentPack({
      name: 'collide-canon',
      nations: [{ id: 1, name: 'Empire' }],
      characters: [
        { id: 1, name: 'CanonSovereign', nameRomaji: 'CanonSovereign', nationId: 1, title: 9, abilities: [99, 99, 99, 99, 99, 99, 99, 99], portraitIndex: 1 },
      ],
    });
    // 라이브와 동일: 공유 인메모리 스토어(acceptAnyGin7, no DB), 두 세션이 GIN7 로그인으로 같은 계정에 바인딩.
    const store = createAccountStore({ acceptAnyGin7: true });
    const cred = { account: 'p001flow', password: 'FlowPw17!' };

    // conn2(로비): GIN7 로그인(계정 생성) → 로비 로그인 → 캐릭 생성(프로필에 적립).
    const lobby = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [], contentPack });
    lobby.onInnerMessage(buildGin7Credential(cred));
    lobby.onInnerMessage(Buffer.from('002000000001', 'hex'));
    lobby.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
    const created = lobby.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Lohengram', firstname: 'Reinhard', power: 1 }));
    assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);

    // conn3(월드): 별개 세션 인스턴스, 같은 스토어. GIN7 로그인(같은 계정) → 프로필 로드 → 월드 진입.
    const world = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [], contentPack });
    world.onInnerMessage(buildGin7Credential(cred));
    world.onInnerMessage(Buffer.from('002000000001', 'hex'));
    world.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));
    const action = world.onInnerMessage(makeInner(0x0f02));
    const playerCard = (action.extraInners || []).find((i) => i.readUInt16BE(4) === 0x0323);
    assert.ok(playerCard, '월드진입이 0x0323 플레이어 레코드를 푸시');
    const body = playerCard.subarray(6);
    const len = body.readUInt8(0x81);
    let lastname = '';
    for (let i = 0; i < len; i += 1) lastname += String.fromCharCode(body.readUInt16LE(0x82 + i * 2));
    const ability = (i) => body.readUInt16LE(0x188 + i * 4);
    assert.equal(ability(0), 48, 'conn3 initial world-entry player card carries created tochi seed');
    assert.equal(ability(1), 55, 'conn3 initial world-entry player card carries created seiji seed');
    assert.equal(ability(3), 50, 'conn3 initial world-entry player card carries created joho seed');
    assert.equal(body.readUInt8(0x1a9), 100, 'conn3 initial world-entry player card carries full stamina');
    assert.equal(body.readUInt8(0x2d0), 1, 'conn3 initial world-entry player card carries together/HUD party flag');
    assert.equal(lastname, 'Lohengram', `conn3 월드 플레이어는 생성 캐릭이어야 한다(황제/캐논 아님), got "${lastname}"`);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER; else process.env.LOGH_WORLD_PLAYER = prevPlayer;
  }
});

// 멀티플레이(2:2) distinct 함대 키: 계정 로스터 없이 같은 머신 4클라가 worldState.upsertFleet에 모두
// 같은 fleet id(worldUnitId 기본 1)를 써 마커가 1개로 붕괴하던 회귀를 막는다. connectionId별로
// worldPlayerInfo().unitId(= upsertFleet id == 0x0325 그리드-유닛 바인딩 키)가 distinct여야 한다.
test('멀티플레이 distinct unit: LOGH_MP_VISIBILITY=1이면 connectionId별 worldPlayerInfo().unitId가 distinct(같은 fleet 덮어쓰기 방지)', () => {
  const prevMp = process.env.LOGH_MP_VISIBILITY;
  const prevUnit = process.env.LOGH_WORLD_UNIT_ID;
  delete process.env.LOGH_WORLD_UNIT_ID; // base=1 기본
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    // OFF: connectionId가 달라도 unitId는 base(1) — 단일클라 월드로드(1107 그린) 경로 불변.
    process.env.LOGH_MP_VISIBILITY = '0';
    assert.equal(createLoginSession({ accountStore: store, lobby: LOBBY, connectionId: 10 }).worldPlayerInfo().unitId, 1);
    assert.equal(createLoginSession({ accountStore: store, lobby: LOBBY, connectionId: 20 }).worldPlayerInfo().unitId, 1);
    // ON: connectionId별로 distinct(base + connectionId).
    process.env.LOGH_MP_VISIBILITY = '1';
    const on10 = createLoginSession({ accountStore: store, lobby: LOBBY, connectionId: 10 });
    const on20 = createLoginSession({ accountStore: store, lobby: LOBBY, connectionId: 20 });
    assert.equal(on10.worldPlayerInfo().unitId, 11);
    assert.equal(on20.worldPlayerInfo().unitId, 21);
    assert.notEqual(on10.worldPlayerInfo().unitId, on20.worldPlayerInfo().unitId, '두 연결의 함대 id가 distinct');
    // connectionId 0(미전달/레거시)이면 ON이어도 base로 폴백(안전).
    assert.equal(createLoginSession({ accountStore: store, lobby: LOBBY }).worldPlayerInfo().unitId, 1);
  } finally {
    if (prevMp === undefined) delete process.env.LOGH_MP_VISIBILITY;
    else process.env.LOGH_MP_VISIBILITY = prevMp;
    if (prevUnit === undefined) delete process.env.LOGH_WORLD_UNIT_ID;
    else process.env.LOGH_WORLD_UNIT_ID = prevUnit;
  }
});

test('login session preloads dynamic base and facility sources on 0x0f02 before the 0x0f03 ack', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  const prevGalaxy = process.env.LOGH_STRAT_GALAXY;
  const prevFleet = process.env.LOGH_STRAT_FLEET;
  const prevGrid = process.env.LOGH_STRAT_GRID;
  const prevTactics = process.env.LOGH_TACTICS_UNIT;
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_WORLD_IMPORT_BASES;
  delete process.env.LOGH_STRAT_GALAXY;
  delete process.env.LOGH_STRAT_FLEET;
  delete process.env.LOGH_STRAT_GRID;
  delete process.env.LOGH_TACTICS_UNIT;
  process.env.LOGH_BASE_ECONOMY = '0'; // 0x0337 off for this structural test
  try {
    const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x0f02));
    assert.equal(action.kind, 'lobby-response');
    const codes = action.extraInners.map(appInnerCode);
    assert.deepEqual(codes, [0x031f, 0x0321, 0x0325, 0x0323, 0x0f03]);

    const baseBody = expandedRibBody(action.extraInners[0]);
    assert.equal(baseBody.readUInt8(0), 3);
    assert.equal(baseBody.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 1);
    assert.equal(baseBody.readUInt8(ribOffset(0, RIB_ELEM_OFF_FIELD_04)), 2, 'ルンビーニ owner = alliance(2)');
    assert.equal(baseBody.readUInt32LE(ribOffset(2, RIB_ELEM_OFF_ID)), 1001, 'derived planet base is included');

    const institutionBody = expandedRiiBody(action.extraInners[1]);
    assert.equal(institutionBody.readUInt8(0), 3);
    assert.equal(institutionBody.readUInt32LE(4), 1);
    assert.equal(institutionBody.readUInt8(0x08), 1);
    assert.equal(institutionBody.readUInt32LE(0x237c), 2);
    assert.equal(institutionBody.readUInt8(0x2380), 1);
    assert.equal(institutionBody.readUInt32LE(0x46f4), 1001, 'facility elem[2] follows derived planet base');
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES;
    else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
    if (prevGalaxy === undefined) delete process.env.LOGH_STRAT_GALAXY;
    else process.env.LOGH_STRAT_GALAXY = prevGalaxy;
    if (prevFleet === undefined) delete process.env.LOGH_STRAT_FLEET;
    else process.env.LOGH_STRAT_FLEET = prevFleet;
    if (prevGrid === undefined) delete process.env.LOGH_STRAT_GRID;
    else process.env.LOGH_STRAT_GRID = prevGrid;
    if (prevTactics === undefined) delete process.env.LOGH_TACTICS_UNIT;
    else process.env.LOGH_TACTICS_UNIT = prevTactics;
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
  }
});

test('login session pushes 0x031d static base names at world-entry under LOGH_WORLD_IMPORT_STATIC_BASE=1 (DEFECT 2: 스폿 불명)', () => {
  // 행성/기지 패널(FUN_0057aa90)은 이름을 0x031d로 채워지는 정적 테이블에서 읽는데, 기본 월드-임포트 PUSH엔
  // 0x031d가 없어 0x031c PULL 전에 패널이 읽히면 "스폿 불명"이 된다. 이 게이트가 0x031d를 가장 먼저 푸시한다.
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  const prevStatic = process.env.LOGH_WORLD_IMPORT_STATIC_BASE;
  const prevGalaxy = process.env.LOGH_STRAT_GALAXY;
  const prevFleet = process.env.LOGH_STRAT_FLEET;
  const prevGrid = process.env.LOGH_STRAT_GRID;
  const prevTactics = process.env.LOGH_TACTICS_UNIT;
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_WORLD_IMPORT_BASES;
  process.env.LOGH_WORLD_IMPORT_STATIC_BASE = '1';
  delete process.env.LOGH_STRAT_GALAXY;
  delete process.env.LOGH_STRAT_FLEET;
  delete process.env.LOGH_STRAT_GRID;
  delete process.env.LOGH_TACTICS_UNIT;
  process.env.LOGH_BASE_ECONOMY = '0';
  try {
    const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x0f02));
    assert.equal(action.kind, 'lobby-response');
    const codes = action.extraInners.map(appInnerCode);
    // 0x031d static base (name table) now leads the world-import push (default OFF leaves it absent).
    assert.equal(codes[0], 0x031d, '0x031d static base pushed FIRST at world entry');
    assert.deepEqual(codes, [0x031d, 0x031f, 0x0321, 0x0325, 0x0323, 0x0f03]);
    const staticBase = action.extraInners[0];
    assert.equal(staticBase.readUInt16BE(4), 0x031d);
    // Real builder output (staticBaseListForSpot — the same record set the 0x031c PULL is tested to fill with
    // system+planet names), not the walker's all-zero stub: substantial payload with nonzero base content.
    const body = staticBase.subarray(6);
    assert.ok(body.length >= 0x500, 'static base carries the full base-record payload');
    assert.ok(body.some((b) => b !== 0), 'static base body is real data, not a zero-fill stub');
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER; else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES; else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
    if (prevStatic === undefined) delete process.env.LOGH_WORLD_IMPORT_STATIC_BASE; else process.env.LOGH_WORLD_IMPORT_STATIC_BASE = prevStatic;
    if (prevGalaxy === undefined) delete process.env.LOGH_STRAT_GALAXY; else process.env.LOGH_STRAT_GALAXY = prevGalaxy;
    if (prevFleet === undefined) delete process.env.LOGH_STRAT_FLEET; else process.env.LOGH_STRAT_FLEET = prevFleet;
    if (prevGrid === undefined) delete process.env.LOGH_STRAT_GRID; else process.env.LOGH_STRAT_GRID = prevGrid;
    if (prevTactics === undefined) delete process.env.LOGH_TACTICS_UNIT; else process.env.LOGH_TACTICS_UNIT = prevTactics;
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY; else process.env.LOGH_BASE_ECONOMY = prevEconomy;
  }
});

test('login session 0x0f02 world-import 0x031f carries economy arrays by DEFAULT (M2-1 라이브 승격)', () => {
  // M2-1: LOGH_BASE_ECONOMY 미설정(기본)에서 PUSH(world-import@0x0f02) 경로가 다섯 P0 경제 배열을
  // 자동으로 싣는지 — 월드진입 직후 기지관리 패널이 NO DATA 대신 실수치를 갖게 하는 주 경로를 검증한다.
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_WORLD_IMPORT_BASES;
  delete process.env.LOGH_BASE_ECONOMY; // 기본(미설정) = 라이브 기본 경로
  try {
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 1 }],
      contentPack: makeValhallaGalaxyContentPack(),
    });
    const action = session.onInnerMessage(makeInner(0x0f02));
    assert.equal(action.kind, 'lobby-response');
    const base = action.extraInners.find((inner) => appInnerCode(inner) === 0x031f);
    assert.ok(base, '0x031f is pushed on world import');
    const payload = expandedRibBody(base);
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 70, 'elem[0] is the active Valhalla/Odin spot');
    // 기본 ON: 다섯 P0 배열이 채워져야 한다(승격 회귀 가드).
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_BUDGET_CNT)), 1, 'budget roll-up present by default');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_BUDGET)), 11207, 'budget[0] = Valhalla Σ industry by default');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_COMMODITY_CNT)), 1, 'commodity roll-up present by default');
    assert.equal(payload.readUInt16LE(ribOffset(0, RIB_ELEM_OFF_BUDGETING)), 4, 'budgeting[0] = planet count by default');
    // 스칼라(PROVISIONAL)는 0 유지 — 0x0337 담당(충돌 금지).
    assert.equal(payload.readFloatLE(ribOffset(0, RIB_ELEM_OFF_FIELD_10)), 0, 'scalar economy fields stay 0 (handled by 0x0337)');
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES;
    else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
  }
});

test('login session preloads the active spot 0x031f base record on 0x0f02 world import', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_BASE_ECONOMY = '1';
  delete process.env.LOGH_WORLD_IMPORT_BASES;
  try {
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 1 }],
      contentPack: makeValhallaGalaxyContentPack(),
    });
    const action = session.onInnerMessage(makeInner(0x0f02));
    assert.equal(action.kind, 'lobby-response');
    const base = action.extraInners.find((inner) => appInnerCode(inner) === 0x031f);
    assert.ok(base);
    const payload = expandedRibBody(base);
    assert.equal(payload.readUInt8(0), 4, '0x031f carries four records max');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 70, 'elem[0] is the active Valhalla/Odin spot');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_BUDGET_CNT)), 1, 'Valhalla budget roll-up present');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_BUDGET)), 11207, 'budget[0] = Valhalla Σ industry');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_COMMODITY_CNT)), 1, 'Valhalla commodity roll-up present');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_COMMODITY)), 3, 'commodity[0] = habitable planet count');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_BUDGETING_CNT)), 1, 'Valhalla budgeting roll-up present');
    assert.equal(payload.readUInt16LE(ribOffset(0, RIB_ELEM_OFF_BUDGETING)), 4, 'budgeting[0] = planet count');
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES;
    else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
  }
});

test('login session preloads the active spot and default selected system in 0x031f world import', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  const prevSelected = process.env.LOGH_SELECTED_BASE_ID;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_WORLD_IMPORT_BASES;
  delete process.env.LOGH_SELECTED_BASE_ID;
  try {
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 1 }],
      contentPack: makeEightySystemGalaxyContentPack(),
    });
    const action = session.onInnerMessage(makeInner(0x0f02));
    assert.equal(action.kind, 'lobby-response');
    const base = action.extraInners.find((inner) => appInnerCode(inner) === 0x031f);
    assert.ok(base);
    const payload = expandedRibBody(base);
    assert.equal(payload.readUInt8(0), 4, '0x031f remains capped at four records');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 70, 'elem[0] is the player capital/current spot');
    assert.equal(payload.readUInt32LE(ribOffset(1, RIB_ELEM_OFF_ID)), 80, 'elem[1] is the client default selected system');
    assert.equal(payload.readUInt32LE(ribOffset(2, RIB_ELEM_OFF_ID)), 70001, 'elem[2] is Valhalla planet orbit 1');
    assert.equal(payload.readUInt32LE(ribOffset(3, RIB_ELEM_OFF_ID)), 70002, 'elem[3] is Valhalla planet orbit 2');

    const facility = action.extraInners.find((inner) => appInnerCode(inner) === 0x0321);
    assert.ok(facility);
    const facilityPayload = expandedRiiBody(facility);
    assert.equal(facilityPayload.readUInt8(0), 4, '0x0321 mirrors the preloaded base id set');
    assert.equal(facilityPayload.readUInt32LE(4), 70, 'facility elem[0] follows active spot');
    assert.equal(facilityPayload.readUInt32LE(0x237c), 80, 'facility elem[1] follows selected system');
    assert.equal(facilityPayload.readUInt32LE(0x46f4), 70001, 'facility elem[2] follows Valhalla planet orbit 1');
    assert.equal(facilityPayload.readUInt32LE(0x6a6c), 70002, 'facility elem[3] follows Valhalla planet orbit 2');
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES;
    else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
    if (prevSelected === undefined) delete process.env.LOGH_SELECTED_BASE_ID;
    else process.env.LOGH_SELECTED_BASE_ID = prevSelected;
  }
});

test('login session can disable dynamic base and facility preloads for old 0x0f02 comparisons', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_IMPORT_BASES = '0';
  try {
    const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x0f02));
    assert.equal(action.kind, 'lobby-response');
    assert.deepEqual(action.extraInners.map(appInnerCode), [0x0325, 0x0323, 0x0f03]);
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES;
    else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
  }
});

test('login session can opt into early 0x0323 action-list seat fields', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_ACTION_LIST_SEATS = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    const body = character.subarray(6);
    // 0x0323 card count is at 0x24c (RE: FUN_00417390); array @0x254 stride 8 (docs/logh7-data-structures-re.md §4)
    assert.equal(body.readUInt8(0x24c), 1);
    assert.equal(body.readUInt32BE(0x254), 1);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session keeps early 0x0f02 location records minimal by default', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevSpot = process.env.LOGH_WORLD_SPOT_ID;
  const prevOwner = process.env.LOGH_WORLD_SPOT_OWNER;
  const prevFleetCol = process.env.LOGH_FLEET_COL;
  const prevFleetRow = process.env.LOGH_FLEET_ROW;
  const prevFullUnitLocation = process.env.LOGH_FULL_UNIT_LOCATION;
  const prevEarlyWorldLocation = process.env.LOGH_EARLY_WORLD_LOCATION;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_SPOT_ID = '42';
  process.env.LOGH_WORLD_SPOT_OWNER = '7';
  process.env.LOGH_FLEET_COL = '12';
  process.env.LOGH_FLEET_ROW = '34';
  delete process.env.LOGH_FULL_UNIT_LOCATION;
  delete process.env.LOGH_EARLY_WORLD_LOCATION;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');

    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit);
    const unitBody = unit.subarray(6);
    assert.equal(readUnitLeU16(unitBody, 0), 1);
    assert.equal(readUnitLeU32(unitBody, 4), 1);
    assert.equal(unitBody.readUInt16LE(0x08), 0); // live-safe default: no P3 unit slots
    assert.equal(unitBody.readUInt32LE(0x0c), 0);
    assert.equal(unitBody.readUInt32LE(0x10), 0);
    assert.equal(unitBody.readUInt32LE(0x14), 0);
    assert.equal(unitBody.readUInt16LE(0x4c), 0);

    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    const body = character.subarray(6);
    assert.equal(body.readUInt32BE(0x1c), 0); // live-safe early spawn: no current spot yet
    assert.equal(body.readUInt32BE(0x20), 0); // no spot_owner until post-load/direct record
    assert.equal(body.readUInt32BE(0x24), 1); // flagship/grid-unit link preserved
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevSpot === undefined) delete process.env.LOGH_WORLD_SPOT_ID;
    else process.env.LOGH_WORLD_SPOT_ID = prevSpot;
    if (prevOwner === undefined) delete process.env.LOGH_WORLD_SPOT_OWNER;
    else process.env.LOGH_WORLD_SPOT_OWNER = prevOwner;
    if (prevFleetCol === undefined) delete process.env.LOGH_FLEET_COL;
    else process.env.LOGH_FLEET_COL = prevFleetCol;
    if (prevFleetRow === undefined) delete process.env.LOGH_FLEET_ROW;
    else process.env.LOGH_FLEET_ROW = prevFleetRow;
    if (prevFullUnitLocation === undefined) delete process.env.LOGH_FULL_UNIT_LOCATION;
    else process.env.LOGH_FULL_UNIT_LOCATION = prevFullUnitLocation;
    if (prevEarlyWorldLocation === undefined) delete process.env.LOGH_EARLY_WORLD_LOCATION;
    else process.env.LOGH_EARLY_WORLD_LOCATION = prevEarlyWorldLocation;
  }
});

test('login session can opt into early 0x0323 current location fields', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevSpot = process.env.LOGH_WORLD_SPOT_ID;
  const prevOwner = process.env.LOGH_WORLD_SPOT_OWNER;
  const prevEarlyWorldLocation = process.env.LOGH_EARLY_WORLD_LOCATION;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_SPOT_ID = '42';
  process.env.LOGH_WORLD_SPOT_OWNER = '7';
  process.env.LOGH_EARLY_WORLD_LOCATION = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    const body = character.subarray(6);
    assert.equal(body.readUInt32BE(0x1c), 42);
    assert.equal(body.readUInt32BE(0x20), 7);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevSpot === undefined) delete process.env.LOGH_WORLD_SPOT_ID;
    else process.env.LOGH_WORLD_SPOT_ID = prevSpot;
    if (prevOwner === undefined) delete process.env.LOGH_WORLD_SPOT_OWNER;
    else process.env.LOGH_WORLD_SPOT_OWNER = prevOwner;
    if (prevEarlyWorldLocation === undefined) delete process.env.LOGH_EARLY_WORLD_LOCATION;
    else process.env.LOGH_EARLY_WORLD_LOCATION = prevEarlyWorldLocation;
  }
});

test('login session maps recovered nation ids to client power bytes in 0x0323', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevWorldChar = process.env.LOGH_WORLD_CHAR_ID;
  const prevSpot = process.env.LOGH_WORLD_SPOT_ID;
  const prevOwner = process.env.LOGH_WORLD_SPOT_OWNER;
  const prevEarlyWorldLocation = process.env.LOGH_EARLY_WORLD_LOCATION;
  delete process.env.LOGH_WORLD_SPOT_ID;
  delete process.env.LOGH_WORLD_SPOT_OWNER;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_EARLY_WORLD_LOCATION = '1';
  try {
    const contentPack = createContentPack({
      name: 'recovered-nation-id-test',
      nations: [
        { id: 0x500, name: 'Galactic Empire' },
        { id: 0x501, name: 'Free Planets Alliance' },
      ],
      characters: [
        { id: 209, name: 'ラインハルト', nameRomaji: 'Reinhard', nationId: 0x500, abilities: [1, 2, 3, 4, 5, 6, 7, 8] },
      ],
    });
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    const body = character.subarray(6);
    assert.equal(body.readUInt8(0x04), 1, 'empire nationId 0x500 maps to client power byte 1');
    assert.equal(body.readUInt8(0x05), 1, 'camp mirrors the client power byte');
    assert.equal(body.readUInt32BE(0x1c), 70, 'empire characters default to the Valhalla/Odin spot');
    assert.equal(body.readUInt32BE(0x20), 1, 'spot owner uses the client power byte by default');
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevWorldChar === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldChar;
    if (prevSpot === undefined) delete process.env.LOGH_WORLD_SPOT_ID;
    else process.env.LOGH_WORLD_SPOT_ID = prevSpot;
    if (prevOwner === undefined) delete process.env.LOGH_WORLD_SPOT_OWNER;
    else process.env.LOGH_WORLD_SPOT_OWNER = prevOwner;
    if (prevEarlyWorldLocation === undefined) delete process.env.LOGH_EARLY_WORLD_LOCATION;
    else process.env.LOGH_EARLY_WORLD_LOCATION = prevEarlyWorldLocation;
  }
});

test('login session can opt into full current location fields in 0x0325', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevSpot = process.env.LOGH_WORLD_SPOT_ID;
  const prevOwner = process.env.LOGH_WORLD_SPOT_OWNER;
  const prevFleetCol = process.env.LOGH_FLEET_COL;
  const prevFleetRow = process.env.LOGH_FLEET_ROW;
  const prevFullUnitLocation = process.env.LOGH_FULL_UNIT_LOCATION;
  const prevUnitStreamWire = process.env.LOGH_UNIT_STREAM_WIRE;
  const prevPostloadUnitStreamWire = process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
  const prevPostloadUnitEndian = process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_SPOT_ID = '42';
  process.env.LOGH_WORLD_SPOT_OWNER = '7';
  process.env.LOGH_FLEET_COL = '12';
  process.env.LOGH_FLEET_ROW = '34';
  process.env.LOGH_FULL_UNIT_LOCATION = '1';
  delete process.env.LOGH_UNIT_STREAM_WIRE;
  delete process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
  delete process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');

    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit);
    const unitBody = unit.subarray(6);
    assert.equal(readUnitLeU16(unitBody, 0), 1);
    assert.equal(readUnitLeU32(unitBody, 4), 1);
    assert.equal(readUnitLeU16(unitBody, 0x08), 7); // unit faction/side slot
    assert.equal(readUnitLeU32(unitBody, 0x0c), 1); // unit commander
    assert.equal(readUnitLeU32(unitBody, 0x10), 3412); // row*100+col
    assert.equal(readUnitLeU32(unitBody, 0x14), 7); // unit owner
    assert.equal(readUnitLeU32(unitBody, 0x44), 42); // spot/base resolver consumed by FUN_004c2c80
    assert.equal(readUnitLeU16(unitBody, 0x4c), 42); // mapSection/current spot
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevSpot === undefined) delete process.env.LOGH_WORLD_SPOT_ID;
    else process.env.LOGH_WORLD_SPOT_ID = prevSpot;
    if (prevOwner === undefined) delete process.env.LOGH_WORLD_SPOT_OWNER;
    else process.env.LOGH_WORLD_SPOT_OWNER = prevOwner;
    if (prevFleetCol === undefined) delete process.env.LOGH_FLEET_COL;
    else process.env.LOGH_FLEET_COL = prevFleetCol;
    if (prevFleetRow === undefined) delete process.env.LOGH_FLEET_ROW;
    else process.env.LOGH_FLEET_ROW = prevFleetRow;
    if (prevFullUnitLocation === undefined) delete process.env.LOGH_FULL_UNIT_LOCATION;
    else process.env.LOGH_FULL_UNIT_LOCATION = prevFullUnitLocation;
    if (prevUnitStreamWire === undefined) delete process.env.LOGH_UNIT_STREAM_WIRE;
    else process.env.LOGH_UNIT_STREAM_WIRE = prevUnitStreamWire;
    if (prevPostloadUnitStreamWire === undefined) delete process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
    else process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE = prevPostloadUnitStreamWire;
    if (prevPostloadUnitEndian === undefined) delete process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
    else process.env.LOGH_POSTLOAD_UNIT_ENDIAN = prevPostloadUnitEndian;
  }
});

test('0x0325 officer 배선: worldState 함대의 boats(배속 사관)+commander를 unit 레코드에 투영', () => {
  // officer 필드 = troop_units 배열(이중 파서 FUN_00419ca0/FUN_00419fd0 확정: count u8 @B+0x14, u32[] @B+0x18,
  // cap 10) + 사령관 슬롯(B+0x08). 권위 출처는 worldState 함대 엔티티(upsertFleet)뿐 — 엔티티가 boats/commander를
  // 가지면 그 실제 값을 와이어로 투영하고, 없으면 절대 날조하지 않는다(아래 별도 단언).
  const prev = {
    player: process.env.LOGH_WORLD_PLAYER,
    char: process.env.LOGH_WORLD_CHAR_ID,
    unit: process.env.LOGH_WORLD_UNIT_ID,
    full: process.env.LOGH_FULL_UNIT_LOCATION,
    focus: process.env.LOGH_PLAYER_FOCUS_CELL,
  };
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '777';
  process.env.LOGH_WORLD_UNIT_ID = '4660'; // 0x1234 = 그리드-유닛 id == 함대 엔티티 키
  process.env.LOGH_FULL_UNIT_LOCATION = '1';
  delete process.env.LOGH_PLAYER_FOCUS_CELL;
  try {
    const worldState = createWorldState();
    // 함대 엔티티에 실제 배속 사관(officer) ids + 사령관을 둔다.
    worldState.upsertFleet({ id: 4660, commander: 909, boats: [101, 102, 103] });
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, worldState });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit, '0x0325 unit 레코드 존재');
    const body = unit.subarray(6);
    const B = 4; // 와이어 element base (헤더 4바이트 뒤)
    assert.equal(readUnitLeU32(body, B + 0x00), 4660, 'unit id 앵커');
    assert.equal(readUnitLeU32(body, B + 0x08), 909, 'commander = worldState 함대 사령관');
    assert.equal(body.readUInt8(B + 0x14), 3, 'officer(troop_units) count @B+0x14');
    assert.equal(readUnitLeU32(body, B + 0x18 + 0 * 4), 101, 'officer[0] @B+0x18');
    assert.equal(readUnitLeU32(body, B + 0x18 + 1 * 4), 102, 'officer[1] @B+0x1c');
    assert.equal(readUnitLeU32(body, B + 0x18 + 2 * 4), 103, 'officer[2] @B+0x20');
  } finally {
    for (const [k, v] of [['LOGH_WORLD_PLAYER', prev.player], ['LOGH_WORLD_CHAR_ID', prev.char], ['LOGH_WORLD_UNIT_ID', prev.unit], ['LOGH_FULL_UNIT_LOCATION', prev.full], ['LOGH_PLAYER_FOCUS_CELL', prev.focus]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('0x0325 officer 배선: worldState 함대 엔티티가 없으면 officer 필드를 날조하지 않는다(빈 배열)', () => {
  // 권위 데이터(함대 엔티티) 부재 시 boats=0·commander=characterId 기본 — P3 날조 금지.
  const prev = {
    player: process.env.LOGH_WORLD_PLAYER,
    unit: process.env.LOGH_WORLD_UNIT_ID,
    full: process.env.LOGH_FULL_UNIT_LOCATION,
  };
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_UNIT_ID = '4660';
  process.env.LOGH_FULL_UNIT_LOCATION = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY }); // worldState 미주입
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit);
    const body = unit.subarray(6);
    assert.equal(body.readUInt8(4 + 0x14), 0, 'officer count 0(날조 없음)');
    assert.equal(readUnitLeU32(body, 4 + 0x18), 0, 'officer[0] 슬롯 0');
  } finally {
    for (const [k, v] of [['LOGH_WORLD_PLAYER', prev.player], ['LOGH_WORLD_UNIT_ID', prev.unit], ['LOGH_FULL_UNIT_LOCATION', prev.full]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('own-fleet 렌더 배선: LOGH_PLAYER_FOCUS_CELL 게이트가 0x0325 commander 슬롯(B+0x08)에 cell을 시드한다', () => {
  // own-fleet 스프라이트/패널 렌더(case0 FUN_0058d140)는 own_cell *(DAT_007cd04c+0x11178)을 읽어 배치하고,
  // strat-camera-focus EXE 패치는 *(source+0x320)==0 일 때만 own_cell을 (하드코딩) 수도셀로 쓴다. RE 확정:
  // source = *(DAT_007ccffc+8)(활성 char ptr), source+0x320 == unit element COMMANDER 슬롯(B+0x08).
  // 즉 서버가 FOCUS_CELL 게이트로 COMMANDER 슬롯에 진영-인지 cell(row*100+col)을 실으면 패치 게이트가
  // FALSE가 되어 하드코딩 수도셀을 덮지 않고 서버의 진영별 cell이 own_cell로 흐른다(동맹 14,20 정합).
  // 게이트 OFF(기본)면 COMMANDER=charId — 기존 월드진입 바이트 불변(1107 그린 경로). docs/logh7-ownfleet-render-fix-2026-06-26.md.
  const prev = {
    player: process.env.LOGH_WORLD_PLAYER,
    char: process.env.LOGH_WORLD_CHAR_ID,
    unit: process.env.LOGH_WORLD_UNIT_ID,
    full: process.env.LOGH_FULL_UNIT_LOCATION,
    focus: process.env.LOGH_PLAYER_FOCUS_CELL,
    col: process.env.LOGH_FLEET_COL,
    row: process.env.LOGH_FLEET_ROW,
    unitStream: process.env.LOGH_UNIT_STREAM_WIRE,
    postloadUnitStream: process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE,
    postloadUnitEndian: process.env.LOGH_POSTLOAD_UNIT_ENDIAN,
  };
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '777';
  process.env.LOGH_WORLD_UNIT_ID = '4660';
  process.env.LOGH_FULL_UNIT_LOCATION = '1';
  process.env.LOGH_FLEET_COL = '14';
  process.env.LOGH_FLEET_ROW = '20';
  delete process.env.LOGH_UNIT_STREAM_WIRE;
  delete process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
  delete process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
  const readUnit = (action) => {
    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit, '0x0325 unit 레코드 존재');
    return unit.subarray(6);
  };
  try {
    // 게이트 ON: COMMANDER 슬롯(B+0x08) = cellId(row*100+col = 2014), CELL 슬롯(B+0x0c)도 동일 cellId.
    process.env.LOGH_PLAYER_FOCUS_CELL = '1';
    {
      const store = createAccountStore({ acceptAnyGin7: true });
      const session = createLoginSession({ accountStore: store, lobby: LOBBY });
      session.markHandshakeComplete();
      const body = readUnit(session.onInnerMessage(Buffer.from('0f02', 'hex')));
      assert.equal(readUnitLeU32(body, 4 + 0x00), 4660, 'unit id 앵커 불변');
      assert.equal(readUnitLeU32(body, 4 + 0x08), 2014, 'FOCUS_CELL ON: COMMANDER(source+0x320)=cellId(20*100+14)');
      assert.equal(readUnitLeU32(body, 4 + 0x0c), 2014, 'CELL 슬롯도 동일 cellId');
    }
    // 게이트 OFF(기본): COMMANDER = charId(777) — 기존 바이트 불변.
    delete process.env.LOGH_PLAYER_FOCUS_CELL;
    {
      const store = createAccountStore({ acceptAnyGin7: true });
      const session = createLoginSession({ accountStore: store, lobby: LOBBY });
      session.markHandshakeComplete();
      const body = readUnit(session.onInnerMessage(Buffer.from('0f02', 'hex')));
      assert.equal(readUnitLeU32(body, 4 + 0x08), 777, 'FOCUS_CELL OFF(기본): COMMANDER=charId(1107 그린 불변)');
      assert.equal(readUnitLeU32(body, 4 + 0x0c), 2014, 'CELL 슬롯은 게이트 무관하게 진영 cellId');
    }
  } finally {
    for (const [k, v] of [
      ['LOGH_WORLD_PLAYER', prev.player], ['LOGH_WORLD_CHAR_ID', prev.char], ['LOGH_WORLD_UNIT_ID', prev.unit],
      ['LOGH_FULL_UNIT_LOCATION', prev.full], ['LOGH_PLAYER_FOCUS_CELL', prev.focus],
      ['LOGH_FLEET_COL', prev.col], ['LOGH_FLEET_ROW', prev.row],
      ['LOGH_UNIT_STREAM_WIRE', prev.unitStream], ['LOGH_POSTLOAD_UNIT_STREAM_WIRE', prev.postloadUnitStream],
      ['LOGH_POSTLOAD_UNIT_ENDIAN', prev.postloadUnitEndian],
    ]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('login session keeps the 0x0f02 spawn record minimal for a content-backed original character', () => {
  // G215/G011: live charId=209 dies before 0x0f06 when rich 0x0323 data is injected during the
  // tight 0x0f02 world-init window. The early spawn only needs id + unit linkage; names, portrait,
  // ability, and HUD fields are resent after mode==2 on the 0x0f06 path. The unit linkage is a
  // compact local slot, not the canon character id; using 209 as a unit slot dies before 0x0f06.
  // Action-list seat/card slots stay opt-in because live QA tied them to HUD string corruption risk.
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x0204);
    assert.equal(action.okInner.readUInt32BE(6), 209);
    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit);
    const unitBody = unit.subarray(6);
    assert.equal(readUnitLeU16(unitBody, 0), 1);
    assert.equal(readUnitLeU32(unitBody, 4), 1);
    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    const body = character.subarray(6);
    assert.equal(body.readUInt32BE(0x00), 209);
    assert.equal(body.readUInt32BE(0x24), 1);
    assert.equal(body.readUInt8(0x250), 0);
    assert.equal(body.readUInt32BE(0x254), 0);
    assert.equal(body.readUInt32BE(0x258), 0);
    assert.equal(body.readUInt8(0x06), 0);
    assert.equal(body.readUInt32LE(0x50), 0);
    assert.equal(body.readUInt32LE(0x54), 0);
    assert.equal(body.readUInt8(0x7d), 1);
    assert.ok(body.readUInt8(0x81) > 0);
    assert.ok(body.readUInt8(0xb8) > 0);
    assert.equal(body.readUInt32LE(0xf4), 0);
    for (let i = 0; i < 8; i += 1) {
      assert.equal(body.readUInt16LE(0x188 + i * 4), 0);
    }
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session keeps post-load grid enter character records minimal by default', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assertMessengerStatusRow(action.okInner, 209);
    assert.deepEqual(stripPostloadCommandCards(action.extraInners.map((inner) => inner.readUInt16BE(4))), [0x0b09, 0x0b0a]);
    assert.equal(action.extraInners.map(appInnerCode).includes(0x0305), true);
    assert.equal(action.extraInners[0].subarray(6).readUInt8(0), 0);
    assert.equal(action.extraInners[1].subarray(6).readUInt8(0), 0);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
  }
});

test('login session answers the plain 0x0f06 messenger-status request with the active character row', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  delete process.env.LOGH_GRID_ENTER;
  process.env.LOGH_WORLD_CHAR_ID = '209';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assertMessengerStatusRow(action.okInner, 209);
    assert.equal(action.extraInners, undefined);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
  }
});

test('login session can opt into post-load grid enter player record replay', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assertMessengerStatusRow(action.okInner, 209);
    assert.deepEqual(stripPostloadCommandCards(action.extraInners.map((inner) => inner.readUInt16BE(4))), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a]);
    assert.equal(action.extraInners[0].subarray(6).readUInt8(0), 0);
    assert.equal(action.extraInners[4].subarray(6).readUInt8(0), 0);

    const selected = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0204);
    assert.ok(selected);
    assert.equal(selected.readUInt32BE(6), 209, 'post-load selected character id stays BE for live memory');

    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit);
    const unitBody = unit.subarray(6);
    assert.equal(readUnitLeU16(unitBody, 0), 1);
    assert.equal(readUnitLeU32(unitBody, 4), 1);

    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    const body = character.subarray(6);
    assert.equal(body.readUInt32BE(0x00), 209);
    assert.equal(body.readUInt32BE(0x24), 1);
    assert.equal(body.readUInt8(0x250), 0);
    assert.equal(body.readUInt32BE(0x254), 0);
    assert.equal(body.readUInt8(0x7d), 0);
    assert.equal(body.readUInt8(0x81), 0);
    assert.equal(body.readUInt8(0xb8), 0);
    for (let i = 0; i < 8; i += 1) {
      assert.equal(body.readUInt16BE(0x188 + i * 4), 0);
    }
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session can opt into a server-driven tactical battle-entry probe (LOGH_BATTLE_ENTRY_PROBE)', () => {
  // 서버-주도 전술맵 진입 probe: grid-enter 직후 openBattleField 시퀀스(0x349 위치→0x33b/0x341/0x343
  // 전술상태→0x42f NotifyChangeMode→0x0f1f NotifyTactics)를 extraInners 끝에 덧붙인다. 0x42f는 Notify라
  // 클라 입력 없이 서버가 전술 풀을 켤 수 있다(0x0b01 입력블로커 우회). 기본 OFF는 별도 테스트가 보장.
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevNotifyTactics = process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
  delete process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assertMessengerStatusRow(action.okInner, 209);
    // grid-enter extraInners stay the proven-safe player records ONLY (battle sequence is NOT inlined —
    // live-confirmed it breaks the strategic render when injected mid-load).
    const codes = action.extraInners.map((inner) => inner.readUInt16BE(4));
  assert.deepEqual(stripPostloadCommandCards(codes), [
    0x0b09, 0x0204, 0x0325, 0x0323,
    0x0325, 0x0323, 0x0349, 0x033b, 0x0341, 0x0337, 0x0345, 0x034b,
    0x0b0a, 0x0317,
  ]);
  const selector = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0317);
  assert.ok(selector, '0x0317 grid selector is emitted with battle-entry probe');
  assert.equal(selector.subarray(6).readUInt32LE(0), 0x00010000, '0x0317 byte[2] arms tactical field import');
    // The battle-entry sequence is carried as a DEFERRED push the server fires after the strategic
    // scene renders (≥0 ms). ★갭2 해소 (2026-06-26): 0x33b 전술 유닛이 클라 populator FUN_004c32a0에서
    // cross-match되도록, 배틀 참가 전원의 0x325 유닛테이블 + 0x323 캐릭레코드를 시퀀스 앞에 prepend한다:
    // 0x325 unit-table -> 0x323 char-record(s) -> 0x349 position -> 0x33b/0x341/0x343 tactics
    // -> 0x0337 roster -> 0x42f NotifyChangeMode -> 0x0f1f.
    assert.ok(Array.isArray(action.deferredBattleInners), 'deferredBattleInners present');
    const battleCodes = action.deferredBattleInners.map((inner) => inner.readUInt16BE(4));
  assert.deepEqual(battleCodes, [0x042f]);
    // ★cross-match 보장 오라클: 0x325 유닛테이블 첫 엔트리 id == 0x33b 첫 유닛 id == own unit id(1).
    const rosterUnit = action.extraInners.filter((inner) => inner.readUInt16BE(4) === 0x0325).at(-1);
    assert.ok(rosterUnit, '0x325 roster unit-table prepended');
    // 0x325 full-element 폼: count u16 LE @0, element[0].id @ header offset. id가 own unit(1)과 일치해야
    // 클라가 0x33b 유닛(stride 0x58 id 매칭)을 스킵하지 않는다.
    const tacticsUnit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x033b);
    assert.ok(tacticsUnit, '0x33b tactics unit table present');
    // 0x323 캐릭 레코드가 ≥1개여서 클라 +0x36a5dc char-count 게이트가 0이 아니다.
    const rosterChars = action.extraInners.filter((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(rosterChars.length >= 1, '≥1 0x323 char record so the populator char-count gate is non-zero');
    assert.equal(typeof action.deferredBattleDelayMs, 'number');
    // 0x42f NotifyChangeMode + 0x349 ResponsePositionUnit must carry the player's own unit (id == 1 here).
    const position = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0349);
    assert.ok(position, 'ResponsePositionUnit 0x349 present');
assert.equal(position.subarray(6).readUInt16BE(0), 1); // fixed table count == 1 participant
assert.equal(position.subarray(6).readUInt32BE(4), 1); // participant id == own unit id
    // 0x0337 roster carries the player's own commander (non-zero charId) — full seed, not coords-only.
    const roster = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0337);
    assert.ok(roster, 'ResponseTacticsCharacter 0x0337 present (commander roster)');
assert.ok(roster.subarray(6).readUInt16BE(2) >= 1, 'roster has ≥1 commander');
    // ★0x0f1f NotifyTactics arg0 byte0 == 1: FUN_004c1b20 tactical-engage branch (sets +0x357e8c=2).
    // Without this the client takes the strategic-return (else) branch and the tactical pool never arms.
    const tactics = action.deferredBattleInners.find((inner) => inner.readUInt16BE(4) === 0x0f1f);
    assert.equal(tactics, undefined, 'NotifyTactics 0x0f1f omitted by default');
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevNotifyTactics === undefined) delete process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
    else process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS = prevNotifyTactics;
  }
});

test('login session can explicitly opt into NotifyTactics battle-entry probe', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevNotifyTactics = process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
  process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const battleCodes = (action.deferredBattleInners ?? [])
      .map((inner) => inner.readUInt16BE(4))
      .filter((code) => [0x042f, 0x0f1f].includes(code));
    assert.deepEqual(battleCodes, [0x042f, 0x0f1f]);
    const tactics = action.deferredBattleInners.find((inner) => inner.readUInt16BE(4) === 0x0f1f);
    assert.equal(tactics.subarray(6).readUInt8(0), 1, '0x0f1f arg0 byte0 == 1 (tactical engage)');
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevNotifyTactics === undefined) delete process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
    else process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS = prevNotifyTactics;
  }
});

test('login session can limit battle-entry probe steps for live crash bisection', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevStepLimit = process.env.LOGH_BATTLE_ENTRY_STEP_LIMIT;
  const prevStepCodes = process.env.LOGH_BATTLE_ENTRY_CODES;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
  process.env.LOGH_BATTLE_ENTRY_STEP_LIMIT = '3';
  delete process.env.LOGH_BATTLE_ENTRY_CODES;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const battleCodes = [
      ...(action.extraInners ?? []),
      ...(action.deferredBattleInners ?? []),
    ]
      .map((inner) => inner.readUInt16BE(4))
.filter((code) => [0x0349, 0x033b, 0x0341, 0x0337, 0x042f, 0x0f1f].includes(code));
    assert.deepEqual(battleCodes, [0x0349, 0x033b, 0x0341]);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevStepLimit === undefined) delete process.env.LOGH_BATTLE_ENTRY_STEP_LIMIT;
    else process.env.LOGH_BATTLE_ENTRY_STEP_LIMIT = prevStepLimit;
    if (prevStepCodes === undefined) delete process.env.LOGH_BATTLE_ENTRY_CODES;
    else process.env.LOGH_BATTLE_ENTRY_CODES = prevStepCodes;
  }
});

test('login session accepts LOGH_BATTLE_ENTRY_STEP_CODES as battle-entry code alias', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevCodes = process.env.LOGH_BATTLE_ENTRY_CODES;
  const prevStepCodes = process.env.LOGH_BATTLE_ENTRY_STEP_CODES;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
  delete process.env.LOGH_BATTLE_ENTRY_CODES;
  process.env.LOGH_BATTLE_ENTRY_STEP_CODES = '0x0349,0x033b';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const battleCodes = [
      ...(action.extraInners ?? []),
      ...(action.deferredBattleInners ?? []),
    ]
      .map((inner) => inner.readUInt16BE(4))
      .filter((code) => [0x0349, 0x0345, 0x033b, 0x0341, 0x0337, 0x042f, 0x0f1f].includes(code));
    assert.deepEqual(battleCodes, [0x0349, 0x0345, 0x033b]);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevCodes === undefined) delete process.env.LOGH_BATTLE_ENTRY_CODES;
    else process.env.LOGH_BATTLE_ENTRY_CODES = prevCodes;
    if (prevStepCodes === undefined) delete process.env.LOGH_BATTLE_ENTRY_STEP_CODES;
    else process.env.LOGH_BATTLE_ENTRY_STEP_CODES = prevStepCodes;
  }
});

test('battle-entry tactical preseed links UnitShip rows to active character and fleet cell', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevPlayerFocusCell = process.env.LOGH_PLAYER_FOCUS_CELL;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevDeferTables = process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
  const prevCodes = process.env.LOGH_BATTLE_ENTRY_CODES;
  const prevStepCodes = process.env.LOGH_BATTLE_ENTRY_STEP_CODES;
  const prevPostloadUnitStreamWire = process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
  const prevPostloadUnitEndian = process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  process.env.LOGH_PLAYER_FOCUS_CELL = '1';
  process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
  process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = '1';
  process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE = '1';
  process.env.LOGH_POSTLOAD_UNIT_ENDIAN = 'be';
  delete process.env.LOGH_BATTLE_ENTRY_CODES;
  process.env.LOGH_BATTLE_ENTRY_STEP_CODES = '0x033b,0x034b,0x042f';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const inners = [
      ...(action.extraInners ?? []),
      ...(action.deferredBattleInners ?? []),
    ];
    const unitTables = inners.filter((inner) => appInnerCode(inner) === 0x0325);
    assert.ok(unitTables.length >= 2, 'grid-enter plus tactical preseed 0x0325 records exist');
    const unitBody = unitTables.at(-1).subarray(6);
    const unitBase = SS_RESP_INFO_UNIT_HEADER;
    assert.equal(readUnitLeU16(unitBody, 0), 1, 'tactical 0x0325 keeps native LE count even if parser-stream env is set');
    assert.equal(readUnitLeU32(unitBody, unitBase + 0x00), 1, '0x0325 id matches tactical ship id');
    assert.equal(readUnitLeU32(unitBody, unitBase + 0x08), 2588, '0x0325 focus-cell slot is nonzero');
    assert.equal(readUnitLeU32(unitBody, unitBase + 0x0c), 2588, '0x0325 cell is usable by FUN_004c32a0 spot lookup');
    assert.equal(readUnitLeU32(unitBody, unitBase + 0x10), 1, '0x0325 owner follows active character power');
    const characterBody = inners.filter((inner) => appInnerCode(inner) === 0x0323).at(-1).subarray(6);
    assert.equal(characterBody.readUInt32BE(0), 209, '0x0323 active character id');
    assert.equal(characterBody.readUInt32BE(0x24), 1, '0x0323 flagship/gridUnitId links 0x0325 id');
    assert.equal(characterBody.readUInt8(0x04), 1, '0x0323 power survives tactical replay');
    assert.equal(characterBody.readUInt8(0x05), 1, '0x0323 camp survives tactical replay');
    const tactics = inners.find((inner) => appInnerCode(inner) === 0x033b);
    assert.ok(tactics, '0x033b UnitShip table emitted');
  const tacticsBody = tactics.subarray(6);
  assert.equal(tacticsBody.readUInt16BE(0), 1, '0x033b count');
  assert.equal(tacticsBody.readUInt32BE(4), 1, '0x033b id matches 0x0325 id');
  assert.equal(tacticsBody.readUInt32BE(4 + 0x08), 209, '0x033b character key matches 0x0323 id');
  const baseInfo = inners.find((inner) => appInnerCode(inner) === 0x0345);
  const basePosition = inners.find((inner) => appInnerCode(inner) === 0x034b);
  const changeMode = inners.find((inner) => appInnerCode(inner) === 0x042f);
  assert.ok(baseInfo, '0x0345 base table emitted');
  assert.ok(basePosition, '0x034b base position table emitted');
  assert.ok(changeMode, '0x042f NotifyChangeMode emitted');
  const baseId = baseInfo.subarray(6).readUInt32BE(4);
  assert.equal(baseId, 3, '0x0345 base id follows fleet home content id');
  assert.equal(basePosition.subarray(6).readUInt32BE(4), baseId, '0x034b base id matches 0x0345');
  assert.equal(changeMode.subarray(6).readUInt32LE(0x08), baseId, '0x042f fieldOwnerId matches tactical base id');
} finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevPlayerFocusCell === undefined) delete process.env.LOGH_PLAYER_FOCUS_CELL;
    else process.env.LOGH_PLAYER_FOCUS_CELL = prevPlayerFocusCell;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevDeferTables === undefined) delete process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
    else process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = prevDeferTables;
    if (prevCodes === undefined) delete process.env.LOGH_BATTLE_ENTRY_CODES;
    else process.env.LOGH_BATTLE_ENTRY_CODES = prevCodes;
    if (prevStepCodes === undefined) delete process.env.LOGH_BATTLE_ENTRY_STEP_CODES;
    else process.env.LOGH_BATTLE_ENTRY_STEP_CODES = prevStepCodes;
    if (prevPostloadUnitStreamWire === undefined) delete process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
    else process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE = prevPostloadUnitStreamWire;
    if (prevPostloadUnitEndian === undefined) delete process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
    else process.env.LOGH_POSTLOAD_UNIT_ENDIAN = prevPostloadUnitEndian;
  }
});

test('login session can opt into a server-driven fleet move probe (LOGH_FLEET_MOVE_PROBE)', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevWorldUnitId = process.env.LOGH_WORLD_UNIT_ID;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevBattleProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevFleetProbe = process.env.LOGH_FLEET_MOVE_PROBE;
  const prevFleetRebuildProbe = process.env.LOGH_FLEET_MOVE_REBUILD_PROBE;
  const prevFleetDelay = process.env.LOGH_FLEET_MOVE_DELAY_MS;
  const prevFleetDelta = process.env.LOGH_FLEET_MOVE_DELTA;
  const prevStateProbe = process.env.LOGH_STATE_TRANSITION_PROBE;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_WORLD_UNIT_ID = '77';
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  delete process.env.LOGH_BATTLE_ENTRY_PROBE;
  process.env.LOGH_FLEET_MOVE_PROBE = '1';
  delete process.env.LOGH_FLEET_MOVE_REBUILD_PROBE;
  process.env.LOGH_FLEET_MOVE_DELAY_MS = '1234';
  process.env.LOGH_FLEET_MOVE_DELTA = '9';
  process.env.LOGH_STATE_TRANSITION_PROBE = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assertMessengerStatusRow(action.okInner, 209);
    assert.deepEqual(stripPostloadCommandCards(action.extraInners.map((inner) => inner.readUInt16BE(4))), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a]);
    assert.equal(action.deferredBattleDelayMs, 1234);
    assert.ok(Array.isArray(action.deferredBattleInners), 'deferred fleet-move push is present');
    assert.equal(action.deferredBattleInners.length, 1, 'fleet-move probe owns the deferred push slot');

    const move = action.deferredBattleInners[0];
    assert.equal(move.readUInt16BE(4), 0x0b07);
    assert.equal(move.length, 6 + 0x244);
    const payload = move.subarray(6);
    assert.equal(payload.readUInt8(0x12), 1, 'one moved unit');
    assert.equal(payload.readUInt32LE(0x14), 77, 'moved unit id comes from LOGH_WORLD_UNIT_ID');
    assert.equal(payload.readUInt32LE(0x18), 2597, 'default empire cell 2588 plus LOGH_FLEET_MOVE_DELTA');
    assert.equal(action.deferredBattleInners.some((inner) => inner.readUInt16BE(4) === 0x0f1f), false);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevWorldUnitId === undefined) delete process.env.LOGH_WORLD_UNIT_ID;
    else process.env.LOGH_WORLD_UNIT_ID = prevWorldUnitId;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevBattleProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevBattleProbe;
    if (prevFleetProbe === undefined) delete process.env.LOGH_FLEET_MOVE_PROBE;
    else process.env.LOGH_FLEET_MOVE_PROBE = prevFleetProbe;
    if (prevFleetRebuildProbe === undefined) delete process.env.LOGH_FLEET_MOVE_REBUILD_PROBE;
    else process.env.LOGH_FLEET_MOVE_REBUILD_PROBE = prevFleetRebuildProbe;
    if (prevFleetDelay === undefined) delete process.env.LOGH_FLEET_MOVE_DELAY_MS;
    else process.env.LOGH_FLEET_MOVE_DELAY_MS = prevFleetDelay;
    if (prevFleetDelta === undefined) delete process.env.LOGH_FLEET_MOVE_DELTA;
    else process.env.LOGH_FLEET_MOVE_DELTA = prevFleetDelta;
    if (prevStateProbe === undefined) delete process.env.LOGH_STATE_TRANSITION_PROBE;
    else process.env.LOGH_STATE_TRANSITION_PROBE = prevStateProbe;
  }
});

test('login session can append a rebuild candidate to the fleet move probe (LOGH_FLEET_MOVE_REBUILD_PROBE)', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevWorldUnitId = process.env.LOGH_WORLD_UNIT_ID;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevFullUnitLocation = process.env.LOGH_FULL_UNIT_LOCATION;
  const prevBattleProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevFleetProbe = process.env.LOGH_FLEET_MOVE_PROBE;
  const prevFleetRebuildProbe = process.env.LOGH_FLEET_MOVE_REBUILD_PROBE;
  const prevFleetDelay = process.env.LOGH_FLEET_MOVE_DELAY_MS;
  const prevFleetDelta = process.env.LOGH_FLEET_MOVE_DELTA;
  const prevStateProbe = process.env.LOGH_STATE_TRANSITION_PROBE;
  const prevPlayerFocusCell = process.env.LOGH_PLAYER_FOCUS_CELL;
  const prevPostloadUnitEndian = process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
  const prevUnitStreamWire = process.env.LOGH_UNIT_STREAM_WIRE;
  const prevPostloadUnitStreamWire = process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_WORLD_UNIT_ID = '77';
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  delete process.env.LOGH_FULL_UNIT_LOCATION;
  delete process.env.LOGH_BATTLE_ENTRY_PROBE;
  process.env.LOGH_FLEET_MOVE_PROBE = '1';
  process.env.LOGH_FLEET_MOVE_REBUILD_PROBE = '1';
  process.env.LOGH_FLEET_MOVE_DELAY_MS = '1234';
  process.env.LOGH_FLEET_MOVE_DELTA = '9';
  process.env.LOGH_STATE_TRANSITION_PROBE = '1';
  delete process.env.LOGH_PLAYER_FOCUS_CELL;
  delete process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
  delete process.env.LOGH_UNIT_STREAM_WIRE;
  delete process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assertMessengerStatusRow(action.okInner, 209);
    assert.deepEqual(stripPostloadCommandCards(action.extraInners.map((inner) => inner.readUInt16BE(4))), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a]);
    assert.equal(action.deferredBattleDelayMs, 1234);
    assert.deepEqual(action.deferredBattleInners.map(appInnerCode), [0x0b07, 0x0325, 0x0b0a]);

    const movePayload = action.deferredBattleInners[0].subarray(6);
    assert.equal(movePayload.readUInt8(0x12), 1, 'one moved unit');
    assert.equal(movePayload.readUInt32LE(0x14), 77, 'moved unit id comes from LOGH_WORLD_UNIT_ID');
    assert.equal(movePayload.readUInt32LE(0x18), 2597, 'default empire cell 2588 plus LOGH_FLEET_MOVE_DELTA');

    const unitBody = action.deferredBattleInners[1].subarray(6);
    assert.equal(readUnitLeU16(unitBody, 0), 1, 'rebuild candidate replays one full unit');
    assert.equal(readUnitLeU32(unitBody, 4 + 0x00), 77, '0x0325 unit id follows the moved unit');
    assert.equal(readUnitLeU32(unitBody, 4 + 0x08), 209, 'commander remains the active character by default');
    assert.equal(readUnitLeU32(unitBody, 4 + 0x0c), 2597, '0x0325 cell is updated to the move destination');
    assert.equal(readUnitLeU32(unitBody, 4 + 0x10), 1, 'owner/faction remains the imperial player side');
    assert.equal(action.deferredBattleInners[2].subarray(6).readUInt8(0), 0, '0x0b0a runs the strategic no-reset rebuild path');
    assert.equal(action.deferredBattleInners.some((inner) => inner.readUInt16BE(4) === 0x0f1f), false);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevWorldUnitId === undefined) delete process.env.LOGH_WORLD_UNIT_ID;
    else process.env.LOGH_WORLD_UNIT_ID = prevWorldUnitId;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevFullUnitLocation === undefined) delete process.env.LOGH_FULL_UNIT_LOCATION;
    else process.env.LOGH_FULL_UNIT_LOCATION = prevFullUnitLocation;
    if (prevBattleProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevBattleProbe;
    if (prevFleetProbe === undefined) delete process.env.LOGH_FLEET_MOVE_PROBE;
    else process.env.LOGH_FLEET_MOVE_PROBE = prevFleetProbe;
    if (prevFleetRebuildProbe === undefined) delete process.env.LOGH_FLEET_MOVE_REBUILD_PROBE;
    else process.env.LOGH_FLEET_MOVE_REBUILD_PROBE = prevFleetRebuildProbe;
    if (prevFleetDelay === undefined) delete process.env.LOGH_FLEET_MOVE_DELAY_MS;
    else process.env.LOGH_FLEET_MOVE_DELAY_MS = prevFleetDelay;
    if (prevFleetDelta === undefined) delete process.env.LOGH_FLEET_MOVE_DELTA;
    else process.env.LOGH_FLEET_MOVE_DELTA = prevFleetDelta;
    if (prevStateProbe === undefined) delete process.env.LOGH_STATE_TRANSITION_PROBE;
    else process.env.LOGH_STATE_TRANSITION_PROBE = prevStateProbe;
    if (prevPlayerFocusCell === undefined) delete process.env.LOGH_PLAYER_FOCUS_CELL;
    else process.env.LOGH_PLAYER_FOCUS_CELL = prevPlayerFocusCell;
    if (prevPostloadUnitEndian === undefined) delete process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
    else process.env.LOGH_POSTLOAD_UNIT_ENDIAN = prevPostloadUnitEndian;
    if (prevUnitStreamWire === undefined) delete process.env.LOGH_UNIT_STREAM_WIRE;
    else process.env.LOGH_UNIT_STREAM_WIRE = prevUnitStreamWire;
    if (prevPostloadUnitStreamWire === undefined) delete process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
    else process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE = prevPostloadUnitStreamWire;
  }
});

test('login session leaves grid-enter records untouched when the battle-entry probe is off (default)', () => {
  // 기본 OFF 회귀가드: probe 미설정 시 extraInners는 grid-enter 레코드만(전술 시퀀스 없음) → 1069 보존.
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  delete process.env.LOGH_BATTLE_ENTRY_PROBE;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    const codes = action.extraInners.map((inner) => inner.readUInt16BE(4));
    assert.deepEqual(stripPostloadCommandCards(codes), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a]);
    assert.ok(!codes.includes(0x042f), 'no NotifyChangeMode when probe off');
    assert.equal(action.deferredBattleInners, undefined, 'no deferred battle push when probe off');
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
  }
});

test('login session keeps post-load tactical 0x0325 native LE when BE endian env is set', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevPostloadUnitEndian = process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  process.env.LOGH_POSTLOAD_UNIT_ENDIAN = 'be';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assert.deepEqual(stripPostloadCommandCards(action.extraInners.map((inner) => inner.readUInt16BE(4))), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a]);

    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit);
    const unitBody = unit.subarray(6);
    assert.equal(readUnitLeU16(unitBody, 0), 1);
    assert.equal(readUnitLeU32(unitBody, 4), 1);
    assert.notEqual(readUnitBeU16(unitBody, 0), 1);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevPostloadUnitEndian === undefined) delete process.env.LOGH_POSTLOAD_UNIT_ENDIAN;
    else process.env.LOGH_POSTLOAD_UNIT_ENDIAN = prevPostloadUnitEndian;
  }
});

test('login session keeps tactical 0x0325 native LE when parser-stream env is set', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevUnitStreamWire = process.env.LOGH_UNIT_STREAM_WIRE;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  process.env.LOGH_UNIT_STREAM_WIRE = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assert.deepEqual(stripPostloadCommandCards(action.extraInners.map((inner) => inner.readUInt16BE(4))), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a]);

    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit);
    const unitBody = unit.subarray(6);
    assert.equal(readUnitLeU16(unitBody, 0), 1);
    assert.equal(readUnitLeU32(unitBody, 4), 1);
    assert.notEqual(readUnitBeU16(unitBody, 0), 1);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevUnitStreamWire === undefined) delete process.env.LOGH_UNIT_STREAM_WIRE;
    else process.env.LOGH_UNIT_STREAM_WIRE = prevUnitStreamWire;
  }
});

test('login session keeps post-load tactical 0x0325 native LE when parser-stream replay is requested', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevUnitStreamWire = process.env.LOGH_UNIT_STREAM_WIRE;
  const prevPostloadUnitStreamWire = process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
  delete process.env.LOGH_UNIT_STREAM_WIRE;
  process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const unit = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0325);
    assert.ok(unit);
    const unitBody = unit.subarray(6);
    assert.equal(readUnitLeU16(unitBody, 0), 1);
    assert.equal(readUnitLeU32(unitBody, 4), 1);
    assert.notEqual(readUnitBeU16(unitBody, 0), 1);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevUnitStreamWire === undefined) delete process.env.LOGH_UNIT_STREAM_WIRE;
    else process.env.LOGH_UNIT_STREAM_WIRE = prevUnitStreamWire;
    if (prevPostloadUnitStreamWire === undefined) delete process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE;
    else process.env.LOGH_POSTLOAD_UNIT_STREAM_WIRE = prevPostloadUnitStreamWire;
  }
});

test('login session keeps simple-info disabled by default on the post-load 0x0f06 tick', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevPostloadSimpleInfo = process.env.LOGH_POSTLOAD_SIMPLE_INFO;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  delete process.env.LOGH_POSTLOAD_SIMPLE_INFO;
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assertMessengerStatusRow(action.okInner, 209);
    const codes = action.extraInners.map((inner) => inner.readUInt16BE(4));
    assert.deepEqual(stripPostloadCommandCards(codes), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a, 0x0356]);
    assert.equal(action.extraInners[0].subarray(6).readUInt8(0), 0);
    assert.equal(action.extraInners[4].subarray(6).readUInt8(0), 0);

    const fullCharacter = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(fullCharacter);
    const fullBody = fullCharacter.subarray(6);
    assert.equal(fullBody.readUInt32BE(0x00), 209);
    assert.equal(fullBody.readUInt32BE(0x1c), 70, '0x0323 spot remains Valhalla/Odin on post-load');
    assert.equal(fullBody.readUInt32BE(0x20), 1, '0x0323 spot owner remains the client power byte');
    assert.equal(fullBody.readUInt32BE(0x24), 1);
    assert.equal(fullBody.readUInt8(0x250), 0);
    assert.equal(fullBody.readUInt32BE(0x254), 0);
    assert.equal(fullBody.readUInt32BE(0x258), 0);
    assert.equal(fullBody.readUInt8(0x06), 2);
    assert.equal(fullBody.readUInt32LE(0x50), 1200);
    assert.equal(fullBody.readUInt32LE(0x54), 1200);
    assert.equal(fullBody.readUInt32LE(0x68), 50000);
    assert.equal(fullBody.readUInt32LE(0x100), 70, '0x0323 parentage resolver base feeds PLAYER_INFO+0x120');
    assert.ok(fullBody.readUInt8(0x1a8) > 0);
    assert.equal(readPstr16(fullBody, 0xb8, 0xba), 'Reinhard');
    assert.equal(fullBody.readUInt8(0xd8), 0, 'world HUD record must not replace the name slot with titlename');

    const characterDelta = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0356);
    assert.ok(characterDelta);
    assert.ok(characterDelta.subarray(6).length < 0x02d8);
    const deltaBody = decodeNotifyCharacterDelta(characterDelta);
    assert.equal(deltaBody.readUInt8(0x00), 1);
    assert.equal(deltaBody.readUInt32LE(0x04), 209);
    assert.equal(deltaBody.readUInt32LE(0x0c), 70, '0x0356 spot matches the 0x0323 spot');
    assert.equal(deltaBody.readUInt32LE(0x1c), 70, '0x0356 return_base matches the current spot');
    assert.equal(deltaBody.readUInt32LE(0x20), 70, '0x0356 current spot mirror is not zeroed');
    assert.equal(deltaBody.readUInt32LE(0x24), 1);
    assert.equal(deltaBody.readUInt32LE(0x100), 70, '0x0356 parentage resolver base feeds PLAYER_INFO+0x120');
    assert.equal(deltaBody.readUInt8(0x250), 0);
    assert.equal(deltaBody.readUInt32LE(0x254), 0);
    assert.equal(deltaBody.readUInt32LE(0x258), 0);
    assert.equal(readPstr16(deltaBody, 0xbc, 0xbe), 'Reinhard');
    assert.equal(deltaBody.readUInt8(0xdc), 0, 'post-load HUD delta must not send peerage/post text as titlename');
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevPostloadSimpleInfo === undefined) delete process.env.LOGH_POSTLOAD_SIMPLE_INFO;
    else process.env.LOGH_POSTLOAD_SIMPLE_INFO = prevPostloadSimpleInfo;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session can opt into character simple-info ids on the post-load 0x0f06 tick', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevPostloadSimpleInfo = process.env.LOGH_POSTLOAD_SIMPLE_INFO;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  process.env.LOGH_POSTLOAD_SIMPLE_INFO = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const codes = action.extraInners.map((inner) => inner.readUInt16BE(4));
    assert.deepEqual(stripPostloadCommandCards(codes), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a, 0x0356, 0x1200, 0x1202, 0x1201]);

    const characterInfo = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x1202);
    assert.ok(characterInfo);
    const body = characterInfo.subarray(6);
    const row = 4;
    assert.equal(body.readUInt8(0), 2);
    assert.equal(body.readUInt32LE(row), 209);
    assert.equal(body.readUInt8(row + 0x81), 0);
    assert.equal(body.readUInt16LE(row + 0x82), 0);
    assert.equal(body.readUInt8(row + 0xb8), 0);
    assert.equal(body.readUInt16LE(row + 0xba), 0);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevPostloadSimpleInfo === undefined) delete process.env.LOGH_POSTLOAD_SIMPLE_INFO;
    else process.env.LOGH_POSTLOAD_SIMPLE_INFO = prevPostloadSimpleInfo;
  }
});

test('login session can default action-list seats only on the post-load rich path', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevPostloadSeats = process.env.LOGH_POSTLOAD_ACTION_LIST_SEATS;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '209';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  process.env.LOGH_POSTLOAD_ACTION_LIST_SEATS = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const earlySession = createLoginSession({
      accountStore: createAccountStore({ acceptAnyGin7: true }),
      lobby: LOBBY,
      contentPack: makeContentPack(),
    });
    earlySession.markHandshakeComplete();
    const early = earlySession.onInnerMessage(Buffer.from('0f02', 'hex'));
    const earlyCharacter = early.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(earlyCharacter);
    const earlyBody = earlyCharacter.subarray(6);
    assert.equal(earlyBody.readUInt8(0x24c), 0, '초기 0x0323은 좌석/card 슬롯을 열지 않음');
    assert.equal(earlyBody.readUInt8(0x250), 0);

    const postloadSession = createLoginSession({
      accountStore: createAccountStore({ acceptAnyGin7: true }),
      lobby: LOBBY,
      contentPack: makeContentPack(),
    });
    postloadSession.markHandshakeComplete();
    const postload = postloadSession.onInnerMessage(Buffer.from('0f06', 'hex'));
    const fullCharacter = postload.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(fullCharacter);
    const fullBody = fullCharacter.subarray(6);
    assert.equal(fullBody.readUInt8(0x24c), 1);
    assert.equal(fullBody.readUInt32BE(0x254), 209);
    assert.equal(fullBody.readUInt32BE(0x258), 0);

    const characterDelta = decodeNotifyCharacterDelta(postload.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0356));
    assert.equal(characterDelta.readUInt8(0x250), 1);
    assert.equal(characterDelta.readUInt16LE(0x254), 209);
    assert.equal(characterDelta.readUInt32LE(0x258), 0);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevWorldPlayer;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevPostloadSeats === undefined) delete process.env.LOGH_POSTLOAD_ACTION_LIST_SEATS;
    else process.env.LOGH_POSTLOAD_ACTION_LIST_SEATS = prevPostloadSeats;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session post-load grid enter does not reuse 0x0305/0x0307 for duty cards', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assertMessengerStatusRow(action.okInner, 1);
    const codes = action.extraInners.map((inner) => inner.readUInt16BE(4));
    assert.deepEqual(stripPostloadCommandCards(codes), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a, 0x0356]);
    assert.equal(action.extraInners[0].subarray(6).readUInt8(0), 0);
    assert.equal(action.extraInners[4].subarray(6).readUInt8(0), 0);

    const characterDelta = decodeNotifyCharacterDelta(action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0356));
    assert.equal(characterDelta.readUInt8(0x250), 0);
    assert.equal(characterDelta.readUInt16LE(0x254), 0);
    assert.equal(codes.includes(0x0305), true);
    assert.equal(codes.includes(0x0307), false);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS;
    else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session can seed post-load action-list category zero for SelectGrid activation tests', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevCategory = process.env.LOGH_ACTION_LIST_CATEGORY;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  process.env.LOGH_ACTION_LIST_CATEGORY = '0';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');

    const fullCharacter = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323).subarray(6);
    // 0x0323 card count @0x24c (RE FUN_00417390); the 0x0356 delta below keeps count @0x250 (its own parser)
    assert.equal(fullCharacter.readUInt8(0x24c), 1);
    assert.equal(fullCharacter.readUInt32BE(0x254), 0x10000);
    assert.equal(fullCharacter.readUInt16BE(0x256), 0);
    assert.equal(fullCharacter.readUInt32BE(0x258), 0);

    const characterDelta = decodeNotifyCharacterDelta(action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0356));
    assert.equal(characterDelta.readUInt8(0x250), 1);
    assert.equal(characterDelta.readUInt16LE(0x254), 0);
    assert.equal(characterDelta.readUInt16LE(0x254), 0);
    assert.equal(characterDelta.readUInt32LE(0x258), 0);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevCategory === undefined) delete process.env.LOGH_ACTION_LIST_CATEGORY;
    else process.env.LOGH_ACTION_LIST_CATEGORY = prevCategory;
  }
});

test('login session can append experimental category-zero 0x0707 appointment candidate bytes', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevCategory = process.env.LOGH_ACTION_LIST_CATEGORY;
  const prevAppointment = process.env.LOGH_ACTION_LIST_APPOINTMENT;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  process.env.LOGH_ACTION_LIST_CATEGORY = '0';
  process.env.LOGH_ACTION_LIST_APPOINTMENT = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, contentPack: makeContentPack() });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(action.kind, 'lobby-response');

    const codes = action.extraInners.map(appInnerCode);
    assert.deepEqual(stripPostloadCommandCards(codes), [0x0b09, 0x0204, 0x0325, 0x0323, 0x0b0a, 0x0356, 0x0707]);
    const appointment = action.extraInners.find((inner) => appInnerCode(inner) === 0x0707);
    assert.equal(appointment.readUInt16BE(4), 0x0707);
    assert.equal(appointment.length, 46);
    const body = appointment.subarray(6);
    assert.equal(body.readUInt32LE(0x10), 1); // target outfit/unit id
    assert.equal(body.readUInt32LE(0x18), 0x10000); // low u16 category 0, non-zero dword
    assert.equal(body.readUInt32LE(0x1c), 0);
    assert.equal(body.readUInt32LE(0x20), 1); // current spot/chief field
    // This asserts the opt-in wire candidate only. G006 C002 live QA showed this post-load
    // injection did not reach the native dispatcher/apply path in the real client.
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevCategory === undefined) delete process.env.LOGH_ACTION_LIST_CATEGORY;
    else process.env.LOGH_ACTION_LIST_CATEGORY = prevCategory;
    if (prevAppointment === undefined) delete process.env.LOGH_ACTION_LIST_APPOINTMENT;
    else process.env.LOGH_ACTION_LIST_APPOINTMENT = prevAppointment;
  }
});

test('login session creates a new character on 0x1008 and the new card appears in the 0x2004 list', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
  session.markHandshakeComplete();

  // Create: CommandGenerateCharacterCharge -> 0x1008 OK with the client create parser stream.
  const created = session.onInnerMessage(
    makeGenerateCharacterCharge({ lastname: 'Reuenthal', firstname: 'Oskar', power: 1, abilities: [90, 80, 70, 60, 95, 88, 92, 70] }),
  );
  assert.equal(created.kind, 'lobby-response');
  assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE); // echo 0x1008
  const createdBody = created.okInner.subarray(6);
  assert.equal(createdBody.readUInt32LE(0), 0);
  assert.equal(createdBody.readUInt8(4), 1);
  const createdParsed = parseGenerateOk(created.okInner);
  assert.equal(createdParsed.lastname, 'Reuenthal');
  assert.equal(createdParsed.rank, 0x0d);

  // The next card-list request must now include the created character (count went 0 -> 1).
  const list = session.onInnerMessage(Buffer.from('2003', 'hex'));
  assert.equal(list.kind, 'lobby-response');
  assert.equal(list.okInner.readUInt16BE(4), 0x2004);
  // The compact card stream encodes a leading record count; with one created char it must be >= 1.
  assert.ok(list.okInner.subarray(6).readUInt8(0) >= 1);
});

test('login session commits the live five-phase 0x1008 create only once and uses it for world entry', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  process.env.LOGH_WORLD_PLAYER = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
    session.markHandshakeComplete();

    const replies = LIVE_MULTIPHASE_CREATE_HEX.map((hex) => session.onInnerMessage(Buffer.from(hex, 'hex')));
    const finalOk = replies.at(-1).okInner;
    const finalBody = finalOk.subarray(6);
    assert.equal(finalBody.readUInt8(4), 1);
    const finalParsed = parseGenerateOk(finalOk);
    assert.equal(finalParsed.lastname, 'Wave');
    assert.equal(finalParsed.firstname, 'Probe');
    assert.equal(finalParsed.face, 1000001);
    assert.equal(finalParsed.rank, 0x0d);

    const list = session.onInnerMessage(Buffer.from('2003', 'hex'));
    assert.equal(list.kind, 'lobby-response');
    assert.equal(list.okInner.readUInt16BE(4), 0x2004);
    assert.equal(list.okInner.subarray(6).readUInt8(0), 1);
    const createdId = list.okInner.subarray(6).readUInt16LE(1);
    assert.ok(createdId > 0);

    const spawn = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(spawn.kind, 'lobby-response');
    assert.equal(spawn.okInner.readUInt16BE(4), 0x0204);
    assert.equal(spawn.okInner.readUInt32BE(6), createdId);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
  }
});

test('login session keeps generated character fields in post-load 0x0356 refresh', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevKoNames = process.env.LOGH_KO_NAMES;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  process.env.LOGH_KO_NAMES = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
    session.markHandshakeComplete();

    const created = session.onInnerMessage(
      makeGenerateCharacterCharge({ lastname: 'Lee', firstname: 'Flow', power: 2, blood: 2 }),
    );
    assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
    const createdId = firstLobbyCharacterId(session);
    assert.ok(createdId > 0);

    const final = session.onInnerMessage(Buffer.from('100804000000010000000000000000000000000000000000000000000000000000000000000001', 'hex'));
    assert.equal(final.okInner.subarray(6).readUInt32LE(0), 4);
    assert.equal(final.okInner.subarray(6).readUInt8(4), 1);

    const postload = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(postload.kind, 'lobby-response');
    assertMessengerStatusRow(postload.okInner, createdId);

    const fullCharacter = postload.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(fullCharacter);
    const fullBody = fullCharacter.subarray(6);
    assert.equal(fullBody.readUInt32BE(0x00), createdId);
    assert.equal(readPstr16(fullBody, 0x81, 0x82), 'Lee');
    assert.equal(readPstr16(fullBody, 0xb8, 0xba), 'Lee');
    assert.equal(fullBody.readUInt16LE(0xd6), 0x0d); // constmsg group-5 subId: 소위
    assert.ok(fullBody.readUInt16LE(0x188) > 0);

    const characterDelta = postload.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0356);
    assert.ok(characterDelta);
    const deltaBody = decodeNotifyCharacterDelta(characterDelta);
    assert.equal(deltaBody.readUInt32LE(0x04), createdId);
    assert.equal(readPstr16(deltaBody, 0x85, 0x86), 'Lee');
    assert.equal(readPstr16(deltaBody, 0xbc, 0xbe), 'Lee');
    assert.equal(deltaBody.readUInt16LE(0xda), 0x0d); // same rank subId in 0x0356 refresh
    assert.ok(deltaBody.readUInt16LE(0x18c) > 0);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevKoNames === undefined) delete process.env.LOGH_KO_NAMES;
    else process.env.LOGH_KO_NAMES = prevKoNames;
  }
});

test('login session maps raw rank ids to constmsg group-5 rank subIds', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  const prevWorldPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevWorldCharId = process.env.LOGH_WORLD_CHAR_ID;
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({
      accountStore: store,
      lobby: LOBBY,
      characters: [{
        id: 1,
        name: 'Raw',
        displayName: 'Raw Rank',
        lastname: 'Raw',
        firstname: 'Rank',
        faction: 'empire',
        power: 1,
        worldPower: 1,
        camp: 1,
        rank: 100,
        spot: 70,
        spotOwner: 1,
        abilities: [50, 50, 50, 50, 50, 50, 50, 50],
        stamina: 100,
      }],
    });
    session.markHandshakeComplete();

    const world = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    const worldCharacter = world.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(worldCharacter);
    assert.equal(worldCharacter.subarray(6).readUInt16LE(0xd6), 2);

    const postload = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    const fullCharacter = postload.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(fullCharacter);
    assert.equal(fullCharacter.subarray(6).readUInt16LE(0xd6), 2);

    const characterDelta = postload.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0356);
    assert.ok(characterDelta);
    assert.equal(decodeNotifyCharacterDelta(characterDelta).readUInt16LE(0xda), 2);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    if (prevWorldPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevWorldPlayer;
    if (prevWorldCharId === undefined) delete process.env.LOGH_WORLD_CHAR_ID;
    else process.env.LOGH_WORLD_CHAR_ID = prevWorldCharId;
  }
});

test('login session persists generated character and reloads profile characters by account', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-profile-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    createAccountRegistry({ persistPath: db })
      .register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));

    const firstSession = strictLobbyAuthedSession(db);
    const created = firstSession.onInnerMessage(
      makeGenerateCharacterCharge({
        lastname: 'Lee',
        firstname: 'Flow',
        power: 1,
        blood: 2,
        abilities: [90, 80, 70, 60, 95, 88, 92, 70],
      }),
    );
    assert.equal(created.kind, 'lobby-response');
    assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
    const createdId = firstLobbyCharacterId(firstSession);
    assert.ok(createdId > 0);

    const persisted = { accounts: loadAccountRecords(db) };
    assert.equal(persisted.accounts[0].characters.length, 1);
    assert.deepEqual(persisted.accounts[0].characters[0], {
      characterId: createdId,
      name: 'Lee',
      displayName: 'Lee Flow',
      lastname: 'Lee',
    firstname: 'Flow',
    faction: 'empire',
    power: 1,
    worldPower: 1,
    createPower: 1,
    camp: 1,
    blood: 2,
    sex: 0,
    face: 1000005,
    abilities: [90, 80, 70, 60, 95, 88, 92, 70],
    rank: 3,
    createRankSubId: 13,
    state: 2,
    fame: 1,
    pcp: 1200,
    mcp: 1200,
    money: 50000,
    influence: 1,
    stamina: 100,
    title: 0,
    bonusPoint: 0,
    specialAbilityNum: 0,
    birthMonth: 1,
    birthDay: 1,
    birthYear: 767,
    ageYears: 18,
    spot: 70,
    spotOwner: 1,
    together: 1,
    status: 1,
    generated: 1,
    check: 1,
    createdAt: persisted.accounts[0].characters[0].createdAt,
  });
    assert.equal(typeof persisted.accounts[0].characters[0].createdAt, 'string');
    assert.equal(JSON.stringify(persisted).includes('FlowPw17!'), false);

    const reloadedSession = strictLobbyAuthedSession(db);
    const reloadedList = reloadedSession.onInnerMessage(Buffer.from('2003', 'hex'));
    assert.equal(reloadedList.kind, 'lobby-response');
    assert.equal(reloadedList.okInner.readUInt16BE(4), 0x2004);
    assert.equal(reloadedList.okInner.subarray(6).readUInt8(0), 1);
    assert.equal(reloadedList.okInner.subarray(6).readUInt16LE(1), createdId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login session persists 0x1008 profile under the bound authenticated account', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-bound-profile-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    createAccountRegistry({ persistPath: db })
      .register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));

    const session = strictBoundLobbySession(db, { account: 'p001flow' });
    const created = session.onInnerMessage(
      makeGenerateCharacterCharge({
        lastname: 'Bound',
        firstname: 'Flow',
        power: 2,
        blood: 1,
        abilities: [42, 43, 44, 45, 46, 47, 48, 49],
      }),
    );

    assert.equal(created.kind, 'lobby-response');
    assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
    const createdId = firstLobbyCharacterId(session);
    const persisted = { accounts: loadAccountRecords(db) };
    assert.equal(persisted.accounts[0].account, 'p001flow');
    assert.equal(persisted.accounts[0].characters.length, 1);
    assert.equal(persisted.accounts[0].characters[0].characterId, createdId);
    assert.equal(persisted.accounts[0].characters[0].lastname, 'Bound');
    assert.equal(persisted.accounts[0].characters[0].firstname, 'Flow');
    assert.equal(JSON.stringify(persisted).includes('FlowPw17!'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 근본 회귀(2026-06-25 사용자 보고 "캐릭 생성은 됐는데 전략맵 들어가면 예전에 억지로 만든 캐릭 그대로야"):
// 캐릭 생성(0x1008)을 처리한 로비 세션과 월드 진입(0x0f02)을 처리하는 conn3 세션은 별개 인스턴스라,
// 월드 세션은 시작 시 계정 프로필을 다시 로드한다. 이전 구현은 프로필의 *첫(가장 오래된)* 캐릭을 활성으로
// 골라 방금 만든 캐릭이 아니라 옛 캐릭이 스폰됐다. 이 테스트는 한 계정에 캐릭 2개(옛것→새것)를 만들고,
// 새 bound 월드 세션이 0x0f02에서 *가장 최근* 캐릭의 id/이름을 0x0323 플레이어 레코드로 내보내는지 확인한다.
test('월드 진입 0x0f02: 새 세션은 가장 최근 생성한 캐릭(옛 캐릭 아님)을 활성 0x0323으로 스폰한다', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevSeats = process.env.LOGH_ACTION_LIST_SEATS;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_ACTION_LIST_SEATS;
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-newest-active-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    createAccountRegistry({ persistPath: db })
      .register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));

    // (1) 로비 세션에서 옛 캐릭 → 새 캐릭 순으로 2개 생성(프로필에 영속).
    const lobby = strictLobbyAuthedSession(db, { account: 'p001flow', password: 'FlowPw17!' });
    lobby.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Old', firstname: 'One', power: 1 }));
    const oldId = firstLobbyCharacterId(lobby);
    lobby.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'New', firstname: 'Two', power: 1 }));
    const cardIds = lobbyCardIds(lobby);
    const newId = cardIds.find((id) => id !== oldId);
    assert.ok(oldId > 0 && newId > 0 && newId !== oldId, `distinct ids: old=${oldId} new=${newId}`);
    assert.equal(loadAccountRecords(db)[0].characters.length, 2);

    // (2) 별개의 bound 월드 세션(conn3 대역)을 시작 → 프로필을 다시 로드한다.
    const worldSession = strictBoundLobbySession(db, { account: 'p001flow' });
    const action = worldSession.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');

    // (3) 활성 선택 char id(0x0204)와 월드 진입 0x0323 플레이어 레코드가 *새* 캐릭이어야 한다.
    assert.equal(action.okInner.readUInt16BE(4), 0x0204);
    assert.equal(action.okInner.readUInt32BE(6), newId); // 옛 캐릭(oldId) 아님
    const character = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    assert.ok(character);
    assert.equal(character.readUInt32BE(6), newId); // record[0] = char id = 새 캐릭
    assert.notEqual(character.readUInt32BE(6), oldId);
    // 0x0323 이름(parentage @0x81 len, @0x82 chars)이 새 캐릭의 표시명이어야 한다("New ...").
    const body = character.subarray(6);
    const nameLen = body.readUInt8(0x81);
    let name = '';
    for (let i = 0; i < nameLen; i += 1) name += String.fromCharCode(body.readUInt16LE(0x82 + i * 2));
    assert.equal(name.startsWith('New'), true, `expected newest char name, got "${name}"`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER; else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevSeats === undefined) delete process.env.LOGH_ACTION_LIST_SEATS; else process.env.LOGH_ACTION_LIST_SEATS = prevSeats;
  }
});

test('login session relogin reuses generated character from live five-phase p001flow profile before new 0x1008', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-relogin-profile-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    createAccountRegistry({ persistPath: db })
      .register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));

    const firstSession = strictLobbyAuthedSession(db, { account: 'p001flow', password: 'FlowPw17!' });
    const createReplies = LIVE_MULTIPHASE_CREATE_HEX.map((hex) => firstSession.onInnerMessage(Buffer.from(hex, 'hex')));
    const created = createReplies.at(-1);
    assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
    assert.equal(created.trace.account, 'p001flow');
    assert.equal(created.trace.requestCategory, 4);
    assert.equal(created.trace.createAccepted, true);
    assert.equal(parseGenerateOk(created.okInner).lastname, 'Wave');
    assert.equal(parseGenerateOk(created.okInner).firstname, 'Probe');
    const createdId = firstLobbyCharacterId(firstSession);
    assert.equal(created.trace.characterId, createdId);
    assert.equal(created.trace.profileKey, `p001flow:${createdId}`);

    const persisted = { accounts: loadAccountRecords(db) };
    assert.equal(persisted.accounts[0].account, 'p001flow');
    assert.equal(persisted.accounts[0].characters.length, 1);
    assert.equal(persisted.accounts[0].characters[0].characterId, createdId);
    assert.equal(JSON.stringify(persisted).includes('FlowPw17!'), false);

    const reloadedSession = strictLobbyAuthedSession(db, { account: 'p001flow', password: 'FlowPw17!' });
    const reloadedList = reloadedSession.onInnerMessage(Buffer.from('2003', 'hex'));
    assert.equal(reloadedList.kind, 'lobby-response');
    assert.equal(reloadedList.okInner.readUInt16BE(4), 0x2004);
    assert.deepEqual(lobbyCardIds(reloadedSession), [createdId]);
    assert.deepEqual(reloadedList.trace.characterIds, [createdId]);
    assert.deepEqual(reloadedList.trace.profileKeys, [`p001flow:${createdId}`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login session trace account metadata correlates 0x1008 0x2004 0x0204 0x0323 and 0x0356', () => {
  const prevWorldPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevPostloadRich = process.env.LOGH_POSTLOAD_RICH_CHARACTER;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_GRID_ENTER = '1';
  process.env.LOGH_POSTLOAD_RICH_CHARACTER = '1';
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-trace-profile-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    createAccountRegistry({ persistPath: db })
      .register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));

    const session = strictBoundLobbySession(db, { account: 'p001flow' });
    const createReplies = LIVE_MULTIPHASE_CREATE_HEX.map((hex) => session.onInnerMessage(Buffer.from(hex, 'hex')));
    const createFinal = createReplies.at(-1);
    assert.equal(createFinal.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
    const createdId = createFinal.trace.characterId;
    const profileKey = `p001flow:${createdId}`;
    assert.ok(createdId > 0);
    assert.deepEqual(createFinal.trace, {
      account: 'p001flow',
      requestCategory: 4,
      createAccepted: true,
      characterId: createdId,
      profileKey,
    });

    const list = session.onInnerMessage(Buffer.from('2003', 'hex'));
    assert.equal(list.okInner.readUInt16BE(4), 0x2004);
    assert.equal(list.trace.account, 'p001flow');
    assert.deepEqual(list.trace.characterIds, [createdId]);
    assert.deepEqual(list.trace.profileKeys, [profileKey]);

    const spawn = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(spawn.okInner.readUInt16BE(4), 0x0204);
    assert.equal(spawn.trace.account, 'p001flow');
    assert.equal(spawn.trace.characterId, createdId);
    assert.equal(spawn.trace.profileKey, profileKey);
    assert.ok(spawn.extraInners.some((inner) => inner.readUInt16BE(4) === 0x0323));

    const postload = session.onInnerMessage(Buffer.from('0f06', 'hex'));
    assert.equal(postload.trace.account, 'p001flow');
    assert.equal(postload.trace.characterId, createdId);
    assert.equal(postload.trace.profileKey, profileKey);
    const postload323 = postload.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0323);
    const postload356 = postload.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0356);
    assert.ok(postload323);
    assert.ok(postload356);
    // 体力(stamina) 시드 회귀가드: 생성 캐릭의 postload 0x0323 레코드 0x1a9 == 만체력(100), 0이 아님.
    assert.equal(postload323.subarray(6).readUInt8(0x1a9), 100);
    // 0x0356 델타도 stamina 만체력을 실어보낸다(compact stream → native object 0x1ad). 디코드로 확인.
    assert.equal(decodeNotifyCharacterDelta(postload356).readUInt8(0x1ad), 100);
  } finally {
    if (prevWorldPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevWorldPlayer;
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevPostloadRich === undefined) delete process.env.LOGH_POSTLOAD_RICH_CHARACTER;
    else process.env.LOGH_POSTLOAD_RICH_CHARACTER = prevPostloadRich;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login session account isolated character cards only expose the bound account profile', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-isolated-profile-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    const registry = createAccountRegistry({ persistPath: db });
    registry.register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));
    registry.register('p002flow', buildGin7Credential({ account: 'p002flow', password: 'OtherPw18' }));

    const firstAccount = strictBoundLobbySession(db, { account: 'p001flow' });
    const created = firstAccount.onInnerMessage(
      makeGenerateCharacterCharge({ lastname: 'Private', firstname: 'One', power: 1 }),
    );
    assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
    const firstAccountCards = lobbyCardIds(firstAccount);
    assert.equal(firstAccountCards.length, 1);

    const secondAccount = strictBoundLobbySession(db, { account: 'p002flow' });
    assert.deepEqual(lobbyCardIds(secondAccount), []);

    const firstAccountRelogin = strictBoundLobbySession(db, { account: 'p001flow' });
    assert.deepEqual(lobbyCardIds(firstAccountRelogin), firstAccountCards);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login session registers the EXACT live capture (Reinhard / Lohengramm) with status 1', () => {
  // Regression for the wire-offset misalignment bug: the real unmodified client sent this 0x1008
  // for an English-named character and the buggy parser read an empty lastname, so the handler
  // rejected it (status 0). With the corrected packed parse the handler must accept it (status 1)
  // and surface the new card. CAPTURE_HEX = raw inner [u16 BE 1008][packed body], face/abilities = 0.
  const CAPTURE_HEX =
    '1008000000000002020009005200650069006e006800610072006400000b00' +
    '4c006f00680065006e006700720061006d006d00' +
    '00000000000000000000000000000000000000000000000000000000';
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
  session.markHandshakeComplete();

  const created = session.onInnerMessage(Buffer.from(CAPTURE_HEX, 'hex'));
  assert.equal(created.kind, 'lobby-response');
  assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE); // echo 0x1008
  const createdBody = created.okInner.subarray(6);
  assert.equal(createdBody.readUInt8(4), 1);
  assert.equal(parseGenerateOk(created.okInner).lastname, 'Reinhard');

  // The new English-named card must now appear in the 0x2004 list.
  const list = session.onInnerMessage(Buffer.from('2003', 'hex'));
  assert.equal(list.okInner.readUInt16BE(4), 0x2004);
  assert.ok(list.okInner.subarray(6).readUInt8(0) >= 1);
});

test('login session rejects 0x1008 character creation when the account is at its entry cap', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  // Seed MAX_ENTRY_CHARACTERS (5) existing characters so a new create is over the cap.
  const seeded = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, status: 1, name: `C${i}` }));
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: seeded });
  session.markHandshakeComplete();
  const result = session.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Mittermeyer' }));
  assert.equal(result.kind, 'lobby-response');
  assert.equal(result.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
  assert.equal(result.okInner.subarray(6).readUInt8(4), 0);
});

test('login session rejects 0x1008 creation that submits an O-group (canon-reserved) face', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
  session.markHandshakeComplete();
  // face 7 = oem (O-group), which the creation picker can never offer — must be rejected.
  const result = session.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Yang', face: 7 }));
  assert.equal(result.kind, 'lobby-response');
  assert.equal(result.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
  assert.equal(result.okInner.subarray(6).readUInt8(4), 0);
});

test('login session seeds the house-rule ability BASE on a 0x1008 create with all-zero (기준 0) abilities', () => {
  // The live creation FORM sends all 8 abilities = 0 (the "기준 0" bug — the base is a client-local
  // widget default the server can't feed). On 0x1008 the server stamps the deterministic origin seed
  // (content/roster/ability-seed.json: BASE 40 + per-origin modifiers) so the created character's
  // 0x0323 record carries non-zero canon-shaped stats. 帝国 제국기사 (power 1, blood 1): shiki 52.
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
  session.markHandshakeComplete();
  const created = session.onInnerMessage(
    makeGenerateCharacterCharge({ lastname: 'Reuenthal', power: 1, blood: 1, abilities: [] }),
  );
  assert.equal(created.okInner.subarray(6).readUInt8(4), 1);
  const newId = firstLobbyCharacterId(session);

  // Read the created character's info card (0x0322 -> 0x0323): the ability block @0x188 must carry the
  // seeded BASE (shiki 52), NOT the all-zero the form submitted. ability_8 = u16 LE per stat @ 0x188.
  const reqBody = Buffer.alloc(6);
  reqBody.writeUInt16LE(1, 0); // count
  reqBody.writeUInt32LE(newId, 2); // selected char id
  const card = session.onInnerMessage(makeInner(REQ_INFO_CHARACTER_CODE, reqBody));
  assert.equal(card.kind, 'lobby-response');
  assert.equal(card.okInner.readUInt16BE(4), 0x0323);
  const record = card.okInner.subarray(6);
  // ability_8 @0x188: 8 entries of {point u16, experience u16}; point is the stat value.
  const ability = (i) => record.readUInt16LE(0x188 + i * 4);
  assert.equal(ability(0), 40); // tochi BASE
  assert.equal(ability(4), 52); // shiki = 40 + 12 (제국기사)
  assert.equal(ability(6), 48); // kogeki = 40 + 8
  assert.equal(record.readUInt8(0x2d0), 1); // together default survives generated character persistence
  // 体力(stamina) @0x1a9: 생성 캐릭이 체력 0 게이지로 표시되던 버그 수정 — 만체력으로 시드.
  assert.equal(record.readUInt8(0x1a9), 100); // STAMINA_FULL (만체력)
});

test('login session 0x1008 keeps the player-submitted abilities when the form sent real stats', () => {
  // When the form sends non-zero abilities (a future client patch, or a non-bugged build) those WIN —
  // the seed only fills the all-zero "기준 0" case. Verify the submitted stats survive to the 0x0323 card.
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
  session.markHandshakeComplete();
  const submitted = [90, 80, 70, 60, 95, 88, 92, 70];
  const created = session.onInnerMessage(
    makeGenerateCharacterCharge({ lastname: 'Reuenthal', power: 1, blood: 1, abilities: submitted }),
  );
  assert.equal(created.okInner.subarray(6).readUInt8(4), 1);
  const newId = firstLobbyCharacterId(session);
  const reqBody = Buffer.alloc(6);
  reqBody.writeUInt16LE(1, 0);
  reqBody.writeUInt32LE(newId, 2);
  const card = session.onInnerMessage(makeInner(REQ_INFO_CHARACTER_CODE, reqBody));
  const record = card.okInner.subarray(6);
  assert.equal(record.readUInt16LE(0x188 + 0 * 4), 90); // tochi (submitted, not seeded)
  assert.equal(record.readUInt16LE(0x188 + 4 * 4), 95); // shiki (submitted, not seeded)
});

test('login session 0x0f02 places a navigable SPACE fleet cell on the sector map (LOGH_STRAT_FLEET)', () => {
  // G200→FR(2026-06-19): LOGH_STRAT_FLEET=1 폴백은 0x0313 오브젝트테이블 + 0x0315 셀그리드를 prepend해
  // 함대 셀을 둔다. docs/logh7-fleet-render-re.md §1.1 P0에 따라 함대를 klass-3 마커로 박지 않고(가짜 성계
  // dot 오인), SPACE(byte1=1, 항행 가능·마커 없음)로 둔다 — 함대 렌더/선택은 0x0325 unit 경로가 담당.
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevFleet = process.env.LOGH_STRAT_FLEET;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_STRAT_FLEET = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    const codes = action.extraInners.map((inner) => inner.readUInt16BE(4));
    // The fleet object table + cell grid still arrive before the unit table / record / 0x0f03 ack.
    assert.ok(codes.indexOf(0x0313) < codes.indexOf(0x0325)); // object table (SPACE record, navigable)
    assert.ok(codes.indexOf(0x0315) < codes.indexOf(0x0325)); // cell grid placing the fleet SPACE cell
    assert.ok(codes.includes(0x0325)); // unit table still present (실제 함대 렌더 경로)
    assert.ok(codes.includes(0x0323)); // character record still present
    assert.equal(codes[codes.length - 1], 0x0f03); // GridInitialize_OK stays LAST
    // 함대 셀은 SPACE(value 1) — 항행 가능(byte1=1), 가짜 성계 마커(klass 3) 아님.
    const objTable = action.extraInners.find((inner) => inner.readUInt16BE(4) === 0x0313).subarray(6);
    assert.equal(objTable.readUInt8(0), 2); // parser count covers records 0..1 (SPACE value 1)
    assert.equal(objTable.readUInt8(1 + 1 * 3 + 1), 1); // value 1 record byte1 = class 1 (SPACE/navigable)
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevFleet === undefined) delete process.env.LOGH_STRAT_FLEET;
    else process.env.LOGH_STRAT_FLEET = prevFleet;
  }
});

test('login session 0x0f02 stays a plain 0x0f03 ack when LOGH_WORLD_PLAYER is off', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  delete process.env.LOGH_WORLD_PLAYER;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x0f03); // plain ack, no spawn
    assert.equal(action.extraInners, undefined);
  } finally {
    if (previous !== undefined) {
      process.env.LOGH_WORLD_PLAYER = previous;
    }
  }
});

test('login session answers 0x0314 RequestStaticInformationGrid with the REAL galaxy grid (LOGH_STRAT_GRID_EARLY)', () => {
  // G210/G210b: this early-grid path is gated behind LOGH_STRAT_GRID_EARLY because a NON-EMPTY 0x0315 at
  // 0x0314 STALLS the live world-init walk (the real fix is a client-side guard-clear; see login-session
  // comment). The test exercises the server response shape with the gate enabled.
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevGalaxy = process.env.LOGH_STRAT_GALAXY;
  const prevEarly = process.env.LOGH_STRAT_GRID_EARLY;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_STRAT_GALAXY = '1';
  process.env.LOGH_STRAT_GRID_EARLY = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0314', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x0315); // cell grid is the OK reply
    assert.equal(action.okInner.length, 6 + 0x138c); // fixed 5004-byte record
    assert.equal(action.extraInners, undefined); // single real-data frame (the extra 0x0313 stalled the walk)
    // The cell grid decodes to the 80 systems + 1 fleet (non-empty, NOT the empty walker grid).
const payload = action.okInner.subarray(6);
assert.equal(payload.readUInt8(0), 100); // w
assert.equal(payload.readUInt8(1), 50); // h
assert.ok(payload.readUInt16BE(2) > 0); // rleCount non-zero (helper-read BE wire)
assert.ok(session.commandTargetSnapshot().gridCells.length > 0);
} finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevGalaxy === undefined) delete process.env.LOGH_STRAT_GALAXY;
    else process.env.LOGH_STRAT_GALAXY = prevGalaxy;
    if (prevEarly === undefined) delete process.env.LOGH_STRAT_GRID_EARLY;
    else process.env.LOGH_STRAT_GRID_EARLY = prevEarly;
  }
});

test('login session can preload static-card command tables after the 0x0304 empty walker probe', () => {
  const previous = process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE;
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevGalaxy = process.env.LOGH_STRAT_GALAXY;
  const prevEarly = process.env.LOGH_STRAT_GRID_EARLY;
  const prevPreload = process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD;
  process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE = '1';
  delete process.env.LOGH_WORLD_PLAYER;
  delete process.env.LOGH_STRAT_GALAXY;
  delete process.env.LOGH_STRAT_GRID_EARLY;
  delete process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0304', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x0305);
    // 2026-06-21: 채운 0x305 카드를 walker okInner로 **직접** 보낸다(빈 walker 제거 — 라이브 dump상
    // 빈 walker가 staging을 차지해 명령행이 0이었음). cardBody = okInner. object-table 프리로드 플래그가
    // off라 extraInners는 비어 있음. 포맷 = canonical LE record-relative; helper below keeps
    // record+0x14 / record+0x16 distinct from body offsets.
    assert.ok(!action.extraInners || action.extraInners.length === 0);
const cardBody = action.okInner.subarray(6);
const devCards = devCommandCategoryCards();
assert.equal(cardBody.readUInt16LE(0x00), devCards.length); // one dev card per manual command category
assert.equal(cardBody.readUInt16LE(0x02), 0); // card_id (record base=2, +0x00) = COMMAND_TABLE_PRELOAD_CARD_ID
assert.equal(cardBody.readUInt8(0x16), devCards[0].commands.length); // command_count (record+0x14)
assert.equal(cardBody.readUInt16LE(0x18), 0x002b); // factory id0 (record+0x16)
assert.equal(cardBody.readUInt16LE(0x1a), 0x0041); // factory id1
const menu = decodeStaticInformationCardMenuFields(action.okInner, 0);
assert.equal(menu.consumer, 'FUN_004f5cb0');
assert.equal(menu.recordCommandCountOffset, 0x14);
assert.equal(menu.recordFactoryIdsOffset, 0x16);
assert.equal(menu.bodyCommandCountOffset, 0x16);
assert.equal(menu.bodyFactoryIdsOffset, 0x18);
assert.deepEqual(menu.factoryIds.slice(0, 2), [0x002b, 0x0041]);
assert.deepEqual(menu.widgetIds.slice(0, 2), [0x002b + 0x43, 0x0041 + 0x43]);

const commandAction = session.onInnerMessage(Buffer.from('0306', 'hex'));
assert.equal(commandAction.kind, 'lobby-response');
assert.equal(commandAction.okInner.readUInt16BE(4), 0x0307);
    // 0x307 canonical: count LE@0x00, record base=2 {card_id LE@+0, command_count u8@+0x02,
    // descriptors @+0x04 stride 8: id LE@+0}. → id0@0x06, id1@0x0e.
const commandBody = commandAction.okInner.subarray(6);
assert.equal(commandBody.readUInt16LE(0x00), devCards.length); // outer count
assert.equal(commandBody.readUInt16LE(0x02), 0); // card_id
assert.equal(commandBody.readUInt8(0x04), devCards[0].commands.length); // command_count
assert.equal(commandBody.readUInt16LE(0x06), 0x002b); // descriptor0 id
assert.equal(commandBody.readUInt16LE(0x0e), 0x0041); // descriptor1 id
  } finally {
    if (previous === undefined) delete process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE;
    else process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE = previous;
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevGalaxy === undefined) delete process.env.LOGH_STRAT_GALAXY;
    else process.env.LOGH_STRAT_GALAXY = prevGalaxy;
    if (prevEarly === undefined) delete process.env.LOGH_STRAT_GRID_EARLY;
    else process.env.LOGH_STRAT_GRID_EARLY = prevEarly;
    if (prevPreload === undefined) delete process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD;
    else process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD = prevPreload;
  }
});

test('login session preloads the strategic object table before the first early grid-cell request', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevGalaxy = process.env.LOGH_STRAT_GALAXY;
  const prevEarly = process.env.LOGH_STRAT_GRID_EARLY;
  const prevPreload = process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD;
  const prevCommandProbe = process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_STRAT_GALAXY = '1';
  process.env.LOGH_STRAT_GRID_EARLY = '1';
  delete process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD;
  delete process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0304', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x0305); // keep the world-init walker reply
    assert.equal(action.extraInners?.length, 1);
    assert.equal(action.extraInners[0].readUInt16BE(4), 0x0313); // preload object table before 0x0314

    const objTable = action.extraInners[0].subarray(6);
    assert.ok(objTable.readUInt8(0) > 4);
    assert.equal(objTable.readUInt8(1 + 4 * 3 + 1), 3); // first system marker is class 3
    assert.deepEqual(
      strategicObjectVariantHistogram(action.extraInners[0]),
      { 1: 8, 2: 4, 3: 3, 4: 32, 5: 23, 6: 10 },
    );
    assert.equal(strategicObjectVariant(action.extraInners[0], 44), 4); // Fezzan: G-class raster-dot color.
    assert.equal(strategicObjectVariant(action.extraInners[0], 73), 4); // Valhalla: G-class raster-dot color.
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevGalaxy === undefined) delete process.env.LOGH_STRAT_GALAXY;
    else process.env.LOGH_STRAT_GALAXY = prevGalaxy;
    if (prevEarly === undefined) delete process.env.LOGH_STRAT_GRID_EARLY;
    else process.env.LOGH_STRAT_GRID_EARLY = prevEarly;
    if (prevPreload === undefined) delete process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD;
    else process.env.LOGH_STRAT_GRID_OBJECT_PRELOAD = prevPreload;
    if (prevCommandProbe === undefined) delete process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE;
    else process.env.LOGH_COMMAND_TABLE_PRELOAD_PROBE = prevCommandProbe;
  }
});

test('login session answers 0x0312 RequestStaticInformationGridType with the object table (LOGH_STRAT_GRID_EARLY)', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevGalaxy = process.env.LOGH_STRAT_GALAXY;
  const prevEarly = process.env.LOGH_STRAT_GRID_EARLY;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_STRAT_GALAXY = '1';
  process.env.LOGH_STRAT_GRID_EARLY = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0312', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x0313); // object table is the OK reply
    assert.equal(action.extraInners, undefined); // single real-data frame (the extra 0x0315 stalled the walk)
    // Object table carries class-3 markers (systems). Spot-check the first system value (4).
    const objTable = action.okInner.subarray(6);
    assert.ok(objTable.readUInt8(0) > 4); // parser count includes the first system value
    assert.equal(objTable.readUInt8(1 + 4 * 3 + 1), 3); // objectTable[4].byte1 = class 3
    assert.deepEqual(
      strategicObjectVariantHistogram(action.okInner),
      { 1: 8, 2: 4, 3: 3, 4: 32, 5: 23, 6: 10 },
    );
    assert.equal(strategicObjectVariant(action.okInner, 44), 4); // Fezzan: G-class raster-dot color.
    assert.equal(strategicObjectVariant(action.okInner, 73), 4); // Valhalla: G-class raster-dot color.
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevGalaxy === undefined) delete process.env.LOGH_STRAT_GALAXY;
    else process.env.LOGH_STRAT_GALAXY = prevGalaxy;
    if (prevEarly === undefined) delete process.env.LOGH_STRAT_GRID_EARLY;
    else process.env.LOGH_STRAT_GRID_EARLY = prevEarly;
  }
});

test('login session does not replay the strategic grid on 0x0f02 when early grid already owns it', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevGalaxy = process.env.LOGH_STRAT_GALAXY;
  const prevGrid = process.env.LOGH_STRAT_GRID;
  const prevEarly = process.env.LOGH_STRAT_GRID_EARLY;
  const prevFleet = process.env.LOGH_STRAT_FLEET;
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_STRAT_GALAXY = '1';
  process.env.LOGH_STRAT_GRID = '1';
  process.env.LOGH_STRAT_GRID_EARLY = '1';
  process.env.LOGH_STRAT_FLEET = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    const codes = action.extraInners.map(appInnerCode);
    assert.deepEqual(codes, [0x031f, 0x0321, 0x0325, 0x0323, 0x0f03]);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevGalaxy === undefined) delete process.env.LOGH_STRAT_GALAXY;
    else process.env.LOGH_STRAT_GALAXY = prevGalaxy;
    if (prevGrid === undefined) delete process.env.LOGH_STRAT_GRID;
    else process.env.LOGH_STRAT_GRID = prevGrid;
    if (prevEarly === undefined) delete process.env.LOGH_STRAT_GRID_EARLY;
    else process.env.LOGH_STRAT_GRID_EARLY = prevEarly;
    if (prevFleet === undefined) delete process.env.LOGH_STRAT_FLEET;
    else process.env.LOGH_STRAT_FLEET = prevFleet;
  }
});

test('login session 0x0314 stays the empty walker grid when LOGH_STRAT_GALAXY is off', () => {
  const prevPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevGalaxy = process.env.LOGH_STRAT_GALAXY;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_STRAT_GALAXY;
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0314', 'hex'));
    // Falls through to the generic walker: 0x0314 -> empty 0x0315, no real-grid extraInners.
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x0315);
    assert.equal(action.extraInners, undefined);
  } finally {
    if (prevPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevPlayer;
    if (prevGalaxy !== undefined) process.env.LOGH_STRAT_GALAXY = prevGalaxy;
  }
});

test('login session rejects unknown credential when store enforces matching', () => {
  const store = createAccountStore({ acceptAnyGin7: false });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY });
  session.markHandshakeComplete();
  const action = session.onInnerMessage(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  assert.equal(action.kind, 'reject');
  assert.equal(session.phase, LOGIN_PHASES.REJECTED);
});

// ── 새 캐릭터 작성 / 오리지널 추첨 roster priming (workflow wndew4jop) ──────────────────────────────────

test('login session answers 0x1002 RequestUnChargeCharacter with a NON-empty 0x1003 roster (the gate)', () => {
  // The roster gate FUN_00597ff0 bounces the scene to back-state 0x29 on count 0. With existing chars
  // the available roster must be non-empty; the count anchor (u16 @0) must be >= 1.
  const session = lobbyAuthedSession({ characters: [{ id: 7 }, { id: 9 }] });
  const action = session.onInnerMessage(makeInner(REQ_UNCHARGE_CHARACTER_CODE));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x1003); // ResponseUnChargeCharacter
  const payload = action.okInner.subarray(6);
  assert.equal(payload.length, 0xfa4);
  const count = payload.readUInt16LE(0);
  assert.ok(count >= 1, 'roster must be non-empty to pass the client gate');
  assert.equal(payload.readUInt32LE(2), 7); // first owned id
});

test('login session answers 0x1002 with a non-empty roster even for a brand-new (empty) account', () => {
  // Fresh account, no content pack: the placeholder id keeps the screen painting + creation reachable.
  const session = lobbyAuthedSession({ characters: [] });
  const action = session.onInnerMessage(makeInner(REQ_UNCHARGE_CHARACTER_CODE));
  assert.equal(action.okInner.readUInt16BE(4), 0x1003);
  assert.ok(action.okInner.subarray(6).readUInt16LE(0) >= 1);
});

test('login session seeds the 0x1003 roster with canon lottery candidates from the content pack', () => {
  const session = lobbyAuthedSession({ characters: [], contentPack: makeContentPack() });
  const action = session.onInnerMessage(makeInner(REQ_UNCHARGE_CHARACTER_CODE));
  const payload = action.okInner.subarray(6);
  const count = payload.readUInt16LE(0);
  assert.ok(count >= 2, 'both canon candidate ids should be offered');
  const ids = [];
  for (let i = 0; i < count; i += 1) ids.push(payload.readUInt32LE(2 + i * 4));
  assert.ok(ids.includes(209) && ids.includes(195));
});

test('login session answers 0x1000 RequestInformationAccount (0x1001) with owned count + slot cap', () => {
  const session = lobbyAuthedSession({ characters: [{ id: 1 }, { id: 2 }] });
  const action = session.onInnerMessage(makeInner(REQ_INFO_ACCOUNT_CODE));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x1001);
  const payload = action.okInner.subarray(6);
  assert.equal(payload.length, 0x1c0);
  assert.equal(payload.readUInt32LE(0x04), 2); // ownedCharacterCount
  assert.equal(payload.readUInt32LE(0x0c), 5); // maxCharacters = MAX_ENTRY_CHARACTERS
});

test('login session answers 0x1004 RequestCharacterEntryState (0x1005) with availableSlots', () => {
  const session = lobbyAuthedSession({ characters: [{ id: 1 }] });
  const action = session.onInnerMessage(makeInner(REQ_CHARACTER_ENTRY_STATE_CODE));
  assert.equal(action.okInner.readUInt16BE(4), 0x1005);
  const payload = action.okInner.subarray(6);
  assert.equal(payload.length, 0x20);
  assert.equal(payload.readUInt32LE(0x00), 0); // activeCharacterId
  assert.equal(payload.readUInt32LE(0x08), 4); // availableSlots = 5 - 1
  assert.equal(payload.readUInt32LE(0x0c), 1); // ownedCount
});

test('login session 0x1006 charges an offered candidate and echoes a success 0x1006 OK', () => {
  const session = lobbyAuthedSession({ characters: [], contentPack: makeContentPack() });
  // Prime the candidate set (the screen issues 0x1002 first).
  session.onInnerMessage(makeInner(REQ_UNCHARGE_CHARACTER_CODE));
  const body = Buffer.alloc(4);
  body.writeUInt32LE(209, 0); // charge Reinhard (an offered candidate)
  const action = session.onInnerMessage(makeInner(CMD_ORIGINAL_CHARGE_CODE, body));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x1006);
  assert.equal(action.okInner.length, 6 + 0x18);
  assert.equal(action.okInner.readUInt32LE(6), 209); // dword0 = charged id
  assert.equal(action.okInner.readUInt32LE(10), 1); // dword1 = success marker (ORIGINAL CHARGE OK!!)
});

test('login session 0x1006 rejects an id NOT in the offered candidate set (MISSTAKE)', () => {
  const session = lobbyAuthedSession({ characters: [], contentPack: makeContentPack() });
  session.onInnerMessage(makeInner(REQ_UNCHARGE_CHARACTER_CODE));
  const body = Buffer.alloc(4);
  body.writeUInt32LE(999999, 0); // not a candidate
  const action = session.onInnerMessage(makeInner(CMD_ORIGINAL_CHARGE_CODE, body));
  assert.equal(action.okInner.readUInt16BE(4), 0x1006);
  assert.equal(action.okInner.readUInt32LE(10), 0); // success marker 0 = MISSTAKE
});

// ── 세션 변경 (session change, workflow wndew4jop) ─────────────────────────────────────────────────

test('login session 0x2005 returns >= 2 selectable sessions when the sessions catalog is supplied', () => {
  const session = lobbyAuthedSession({
    sessions: [
      { sessionId: 1, name: 'Alpha', status: 1 },
      { sessionId: 2, name: 'Beta', status: 1 },
    ],
  });
  const action = session.onInnerMessage(Buffer.from('2005', 'hex'));
  assert.equal(action.okInner.readUInt16BE(4), 0x2006);
  const payload = action.okInner.subarray(6);
  const decoded = parse2006SessionList(payload);
  assert.equal(decoded.lead, 0); // raw lead byte
  assert.equal(decoded.count, 2); // record count
  // PACKED InformationSession parser layout (sequential, SEEK_CUR).
  assert.equal(decoded.recs[0].sessionId, 1);
  assert.equal(decoded.recs[0].status, 1); // selectable
  assert.equal(decoded.recs[0].name, 'Alpha');
  assert.equal(decoded.recs[1].sessionId, 2);
  assert.equal(decoded.recs[1].name, 'Beta');
});

test('login session 0x2009 maps a selected session id to its distinct world via worldBySession', () => {
  const session = lobbyAuthedSession({
    world: { ip: '127.0.0.1', port: 47900, token: 0 },
    worldBySession: { 2: { ip: '10.0.0.2', port: 48000, token: 0xdeadbeef } },
  });
  // RE 2026-06-28: 0x2009 body size is 2; body = [u16 LE sessionId @+2], selecting session 2.
  const body = Buffer.from('20090200', 'hex');
  const action = session.onInnerMessage(body);
  assert.equal(action.okInner.readUInt16BE(4), 0x200a);
  assert.equal(action.okInner.readUInt32BE(6), 0x0200000a); // 10.0.0.2 octet-low-first
  assert.equal(action.okInner.readUInt16BE(10), 48000); // session 2 world port
  assert.equal(action.okInner.readUInt32BE(14), 0xdeadbeef); // session 2 token
  assert.equal(action.trace.selectedSessionId, 2);
  assert.equal(action.trace.resolvedSessionId, 2);
  assert.equal(action.trace.sessionAccepted, true);
});

test('login session 0x2009 persists the selected session id on the account registry', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-selected-session-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    const registry = createAccountRegistry({ persistPath: db });
    registry.register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));
    const session = strictLobbyAuthedSession(db, {
      sessions: [
        { sessionId: 1, name: 'Alpha', status: 1 },
        { sessionId: 2, name: 'Beta', status: 1 },
      ],
    });

    const action = session.onInnerMessage(Buffer.from('20090200', 'hex'));

    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.trace.selectedSessionId, 2);
    assert.equal(action.trace.resolvedSessionId, 2);
    assert.equal(action.trace.sessionAccepted, true);
    assert.equal(loadAccountRecords(db)[0].selectedSessionId, 2);
    assert.equal(createAccountRegistry({ persistPath: db }).getSelectedSession('p001flow'), 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── info-panels: character card (workflow w2xh1y4z6) ──────────────────────────────────────────────

test('login session 0x2009 persists only existing open session ids', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-selected-session-valid-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    const registry = createAccountRegistry({ persistPath: db });
    registry.register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));
    const store = createAccountStore({
      acceptAnyGin7: false,
      allowRegister: false,
      registry,
    });
    const session = createLoginSession({
      accountStore: store,
      lobby: LOBBY,
      world: { ip: '127.0.0.1', port: 47900, token: 0 },
      worldBySession: {
        1: { ip: '10.0.0.1', port: 47001, token: 0x11111111 },
        2: { ip: '10.0.0.2', port: 47002, token: 0x22222222 },
        9: { ip: '10.0.0.9', port: 47009, token: 0x99999999 },
      },
      characters: [],
      sessions: [
        { sessionId: 1, name: 'Open', status: 1 },
        { sessionId: 2, name: 'Closed', status: 0 },
      ],
    });
    const login = session.onInnerMessage(buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));
    assert.equal(login.kind, 'redirect');
    session.onInnerMessage(Buffer.from('002000000001', 'hex'));
    session.onInnerMessage(Buffer.from(LOBBY_LOGIN_REQUEST_HEX, 'hex'));

    const closed = session.onInnerMessage(Buffer.from('20090200', 'hex'));
    assert.equal(closed.kind, 'lobby-response');
    assert.equal(closed.trace.selectedSessionId, 2);
    assert.equal(closed.trace.resolvedSessionId, 1);
    assert.equal(closed.trace.sessionAccepted, false);
    assert.equal(closed.trace.sessionReject, 'closed-session');
    assert.equal(closed.okInner.readUInt32BE(6), 0x0100000a);
    assert.equal(closed.okInner.readUInt16BE(10), 47001);
    assert.equal(closed.okInner.readUInt32BE(14), 0x11111111);
    assert.equal(loadAccountRecords(db)[0].selectedSessionId, 1, 'closed session is not persisted');

    const missing = session.onInnerMessage(Buffer.from('20090900', 'hex'));
    assert.equal(missing.kind, 'lobby-response');
    assert.equal(missing.trace.selectedSessionId, 9);
    assert.equal(missing.trace.resolvedSessionId, 1);
    assert.equal(missing.trace.sessionAccepted, false);
    assert.equal(missing.trace.sessionReject, 'missing-session');
    assert.equal(missing.okInner.readUInt32BE(6), 0x0100000a);
    assert.equal(missing.okInner.readUInt16BE(10), 47001);
    assert.equal(missing.okInner.readUInt32BE(14), 0x11111111);
    assert.equal(loadAccountRecords(db)[0].selectedSessionId, 1, 'missing session is not persisted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('login session 0x0322 RequestInformationCharacter returns a populated 0x0323 card', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  // request body = [u16 count][u32 id]; request char 195 (Mittermeyer).
  const body = Buffer.alloc(6);
  body.writeUInt16LE(1, 0);
  body.writeUInt32LE(195, 2);
  const action = session.onInnerMessage(makeInner(REQ_INFO_CHARACTER_CODE, body));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x0323);
  assert.equal(action.okInner.length, 6 + 0x02d4);
  // record[0] must echo the requested id (client compares it at client+0x3584a0).
  assert.equal(action.okInner.readUInt32LE(6), 195);
  assert.equal(action.okInner.readUInt8(6 + 0x7d), 1);
  assert.equal(action.okInner.readUInt8(6 + 0x80), 1);
  assert.equal(action.okInner.readUInt8(6 + 0xb8), 11);
  assert.equal(action.okInner.readUInt16LE(6 + 0xba), 'M'.charCodeAt(0));
  assert.equal(action.okInner.readUInt16LE(6 + 0xba + 10 * 2), 'r'.charCodeAt(0));
  assert.ok(session.commandTargetSnapshot().characters.some((entry) => entry.id === 195));
});

test('login session 0x0322 still answers (zeroed-but-sized) when the id is unknown to the pack', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  const body = Buffer.alloc(6);
  body.writeUInt16LE(1, 0);
  body.writeUInt32LE(424242, 2);
  const action = session.onInnerMessage(makeInner(REQ_INFO_CHARACTER_CODE, body));
  assert.equal(action.okInner.readUInt16BE(4), 0x0323);
  assert.equal(action.okInner.readUInt32LE(6), 424242); // id still echoed so the panel keys to it
});

// Build a length-prefixed id-list request body [u16 count][u32 id × count] (the in-game info-panel shape).
function makeIdListBody(ids = []) {
  const body = Buffer.alloc(2 + ids.length * 4);
  body.writeUInt16LE(ids.length, 0);
  ids.forEach((id, i) => body.writeUInt32LE(id >>> 0, 2 + i * 4));
  return body;
}

function readStaticBaseStreamRecord(payload, index = 0) {
  let cursor = 2;
  for (let i = 0; i <= index; i += 1) {
    const id = payload.readUInt32BE(cursor);
    cursor += 4;
    const grid = payload.readUInt16BE(cursor);
    cursor += 2;
    cursor += 4; // two unresolved u16 parser-helper slots
    const nameLen = payload.readUInt8(cursor);
    cursor += 1;
    let name = '';
    for (let j = 0; j < nameLen; j += 1) {
      name += String.fromCharCode(payload.readUInt16BE(cursor));
      cursor += 2;
    }
    const class_ = payload.readUInt8(cursor);
    if (i === index) return { id, grid, name, class_ };
    cursor += 18; // class byte + f32 + u32 + direction byte + f32 + f32
  }
  throw new RangeError(`StaticBase record index out of range: ${index}`);
}

test('login session 0x031c RequestStaticInformationBase returns populated 0x031d systems with KO gate', () => {
  const prev = process.env.LOGH_KO_NAMES;
  process.env.LOGH_KO_NAMES = '1';
  try {
    const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x031c, makeIdListBody([])));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x031d);
    assert.equal(action.okInner.length, 6 + 0x520c);
    const payload = action.okInner.subarray(6);
    assert.equal(payload.readUInt16BE(0), 3, 'current system + current planet + remaining system');
    const first = readStaticBaseStreamRecord(payload, 0);
    assert.equal(first.id, 1, 'first system id');
    assert.equal(first.name.length, 3, 'KO name length for 룬비니');
    assert.equal(first.name[0], '룬');
    assert.equal(first.class_, 1, 'system static class');
    const planet = readStaticBaseStreamRecord(payload, 1);
    assert.equal(planet.id, 1001, 'derived planet id = systemId*1000+orbit');
    assert.equal(planet.name, '박타푸르', 'planet KO name is present in 0x031d');
    assert.equal(planet.class_, 3, 'planet static class');
    const fortressAction = session.onInnerMessage(makeInner(0x031c, makeIdListBody([2])));
    const fortressPayload = fortressAction.okInner.subarray(6);
    assert.equal(fortressPayload.readUInt16BE(0), 3, 'requested fortress system + fortress + remaining system');
    const fortress = readStaticBaseStreamRecord(fortressPayload, 1);
    assert.equal(fortress.id, 2900, 'derived fortress id = systemId*1000+900+index');
    assert.equal(fortress.class_, 2, 'fortress static class');
  } finally {
    if (prev === undefined) delete process.env.LOGH_KO_NAMES;
    else process.env.LOGH_KO_NAMES = prev;
  }
});

test('login session LOGH_PLANET_BASE_RECORDS=0 keeps 0x031d legacy system-only records', () => {
  const prev = process.env.LOGH_PLANET_BASE_RECORDS;
  process.env.LOGH_PLANET_BASE_RECORDS = '0';
  try {
    const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x031c, makeIdListBody([])));
    assert.equal(action.kind, 'lobby-response');
    const payload = action.okInner.subarray(6);
    assert.equal(payload.readUInt16BE(0), 2, 'legacy path emits only the two systems');
    assert.equal(readStaticBaseStreamRecord(payload, 0).id, 1);
    assert.equal(readStaticBaseStreamRecord(payload, 1).id, 2);
  } finally {
    if (prev === undefined) delete process.env.LOGH_PLANET_BASE_RECORDS;
    else process.env.LOGH_PLANET_BASE_RECORDS = prev;
  }
});

test('login session 0x031e RequestInformationBase returns populated 0x031f dynamic base records', () => {
  // M2-1 라이브 승격: LOGH_BASE_ECONOMY 가 미설정(기본)이면 이제 경제 배열이 ON 으로 채워진다.
  // env 미설정 = 라이브 기본 경로를 검증한다(명시 토글 없이).
  const prev = process.env.LOGH_BASE_ECONOMY;
  delete process.env.LOGH_BASE_ECONOMY;
  try {
    const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x031e, makeIdListBody([])));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x031f);
    assert.equal(action.okInner.length, 6 + 0x0604);
    const payload = expandedRibBody(action.okInner);
    assert.equal(payload.readUInt8(0), 3, 'system + selected system + planet by default');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 1);
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_FIELD_04)), 2, 'ルンビーニ owner = alliance(2)');
    assert.equal(payload.readUInt32LE(ribOffset(1, RIB_ELEM_OFF_ID)), 2);
    assert.equal(payload.readUInt8(ribOffset(1, RIB_ELEM_OFF_FIELD_04)), 3, 'イゼルローン owner = empire(3)');
    assert.equal(payload.readUInt32LE(ribOffset(2, RIB_ELEM_OFF_ID)), 1001, 'elem[2] is the derived planet base');
    assert.equal(payload.readUInt8(ribOffset(2, RIB_ELEM_OFF_FIELD_04)), 2, 'planet owner follows its parent system');
    assert.equal(payload.readUInt8(ribOffset(2, RIB_ELEM_OFF_FIELD_179)), 2, 'planet panel type byte');
    // 기본 ON(승격): elem[0]=ルンビーニ(id 1)는 planet-economy.json 의 3행성으로 다섯 P0 배열을 싣는다.
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_BUDGET_CNT)), 1, 'budget cnt 1 by default (LOGH_BASE_ECONOMY now ON)');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_BUDGET)), 632, 'budget[0] = Σ industry (P3 proxy) by default');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_COMMODITY_CNT)), 1, 'commodity cnt 1 by default');
    assert.equal(payload.readUInt16LE(ribOffset(0, RIB_ELEM_OFF_BUDGETING)), 3, 'budgeting[0] = planet count by default');
    // 스칼라(PROVISIONAL)는 기본 ON 에서도 0 유지 — 인구/식료는 0x0337 담당(충돌 금지).
    assert.equal(payload.readFloatLE(ribOffset(0, RIB_ELEM_OFF_FIELD_10)), 0, 'availability_ratio candidate stays 0 (scalar offsets PROVISIONAL)');
  } finally {
    if (prev === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prev;
  }
});

test('login session 0x031e LOGH_BASE_ECONOMY=0 escape hatch keeps the legacy id+owner-only seed', () => {
  // 명시적 OFF(escape hatch): 회귀 비교용으로 다섯 경제 배열이 비어야(count 0) 한다.
  const prev = process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_BASE_ECONOMY = '0';
  try {
    const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x031e, makeIdListBody([])));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x031f);
    assert.equal(action.okInner.length, 6 + 0x0604);
    const payload = expandedRibBody(action.okInner);
    assert.equal(payload.readUInt8(0), 3, 'planet base records stay present when only economy is disabled');
    // id+owner 후보는 그대로(회귀 가드).
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 1);
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_FIELD_04)), 2, 'ルンビーニ owner = alliance(2)');
    // Gate OFF(명시 '0'): 경제 배열이 비어야(count 0) 한다 — proven byte-exact 베이스라인.
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_BUDGET_CNT)), 0, 'budget cnt 0 when LOGH_BASE_ECONOMY=0');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_COMMODITY_CNT)), 0, 'commodity cnt 0 when LOGH_BASE_ECONOMY=0');
  } finally {
    if (prev === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prev;
  }
});

test('login session 0x031e enriches 0x031f with economy arrays when LOGH_BASE_ECONOMY=1', () => {
  const prev = process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_BASE_ECONOMY = '1';
  try {
    const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x031e, makeIdListBody([])));
    assert.equal(action.okInner.readUInt16BE(4), 0x031f);
    assert.equal(action.okInner.length, 6 + 0x0604, 'body size still fixed 0x604');
    const payload = expandedRibBody(action.okInner);
    assert.equal(payload.readUInt8(0), 3, 'system + selected system + planet');
    // elem[0] = ルンビーニ (id 1): content/planet-economy.json has 3 planets, Σindustry=632, 2 habitable.
    // id + owner candidate unchanged (no regression of the proven fields).
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 1, 'elem[0] id still 1');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_FIELD_04)), 2, 'elem[0] owner = alliance(2)');
    // The five P0 arrays now carry the planet roll-up (HIGH offsets).
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_BUDGET_CNT)), 1, 'budget cnt 1');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_BUDGET)), 632, 'budget[0] = Σ industry (P3 proxy)');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_COMMODITY_CNT)), 1, 'commodity cnt 1');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_COMMODITY)), 2, 'commodity[0] = habitable count');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_BUDGETING_CNT)), 1, 'budgeting cnt 1');
    assert.equal(payload.readUInt16LE(ribOffset(0, RIB_ELEM_OFF_BUDGETING)), 3, 'budgeting[0] = planet count');
    // PROVISIONAL scalar offsets stay 0 (no fabrication).
    assert.equal(payload.readFloatLE(ribOffset(0, RIB_ELEM_OFF_FIELD_10)), 0, 'availability_ratio candidate stays 0');
    // elem[1] = イゼルローン (id 2): no economy planets → falls back to owner-only seed (arrays empty).
    assert.equal(payload.readUInt32LE(ribOffset(1, RIB_ELEM_OFF_ID)), 2, 'elem[1] id still 2');
    assert.equal(payload.readUInt8(ribOffset(1, RIB_ELEM_OFF_BUDGET_CNT)), 0, 'elem[1] budget cnt 0 (no economy join)');
    assert.equal(payload.readUInt32LE(ribOffset(2, RIB_ELEM_OFF_ID)), 1001, 'elem[2] is the derived planet base');
    assert.equal(payload.readUInt8(ribOffset(2, RIB_ELEM_OFF_FIELD_179)), 2, 'elem[2] panel type = planet');
  } finally {
    if (prev === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prev;
  }
});

test('login session 0x031e surfaces the requested base id as elem[0] (request-id matching)', () => {
  const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
  // Request base id 2 specifically; it must be reordered to elem[0].
  const action = session.onInnerMessage(makeInner(0x031e, makeIdListBody([2])));
  assert.equal(action.okInner.readUInt16BE(4), 0x031f);
  const payload = expandedRibBody(action.okInner);
  assert.equal(payload.readUInt8(0), 3, 'requested system + fortress + remaining system');
  assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 2, 'elem[0] is the requested id 2');
  assert.equal(payload.readUInt32LE(ribOffset(1, RIB_ELEM_OFF_ID)), 2900, 'elem[1] is the derived fortress base');
  assert.equal(payload.readUInt8(ribOffset(1, RIB_ELEM_OFF_FIELD_179)), 1, 'fortress panel type byte');
});

test('login session 0x031e can answer a derived planet base id directly', () => {
  const session = lobbyAuthedSession({ contentPack: makeGalaxyContentPack() });
  const action = session.onInnerMessage(makeInner(0x031e, makeIdListBody([1001])));
  assert.equal(action.okInner.readUInt16BE(4), 0x031f);
  const payload = expandedRibBody(action.okInner);
  assert.equal(payload.readUInt8(0), 3, 'derived planet + parent system + remaining system');
  assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 1001, 'elem[0] is the requested planet id');
  assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_FIELD_04)), 2, 'planet owner follows parent');
  assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_FIELD_179)), 2, 'planet panel type byte');
  assert.equal(session.commandTargetSnapshot().baseId, 1001);
});

test('login session does not fabricate planet base records for a planetless system', () => {
  const session = lobbyAuthedSession({ contentPack: makeEightySystemGalaxyContentPack() });
  const staticAction = session.onInnerMessage(makeInner(0x031c, makeIdListBody([80])));
  assert.equal(staticAction.okInner.readUInt16BE(4), 0x031d);
  const staticPayload = staticAction.okInner.subarray(6);
  assert.equal(staticPayload.readUInt16BE(0), 80, 'no extra derived planet/fortress records beyond the 80 systems');
  assert.equal(readStaticBaseStreamRecord(staticPayload, 0).id, 80, 'requested planetless system stays first');
  assert.equal(readStaticBaseStreamRecord(staticPayload, 1).id, 1, 'remaining rows are real systems, not fabricated planets');

  const dynamicAction = session.onInnerMessage(makeInner(0x031e, makeIdListBody([80])));
  assert.equal(dynamicAction.okInner.readUInt16BE(4), 0x031f);
  const dynamicPayload = expandedRibBody(dynamicAction.okInner);
  assert.equal(dynamicPayload.readUInt8(0), 4, '0x031f still fills from real systems up to the cap');
  assert.equal(dynamicPayload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 80, 'requested planetless system stays first');
  for (let i = 0; i < dynamicPayload.readUInt8(0); i += 1) {
    assert.notEqual(dynamicPayload.readUInt32LE(ribOffset(i, RIB_ELEM_OFF_ID)), 80001, 'no synthetic orbit-1 planet id');
  }
});

test('login session 0x031e can answer an active far spot such as Valhalla id 70', () => {
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_BASE_ECONOMY = '1';
  try {
    const session = lobbyAuthedSession({ contentPack: makeValhallaGalaxyContentPack() });
    const action = session.onInnerMessage(makeInner(0x031e, makeIdListBody([70])));
    assert.equal(action.okInner.readUInt16BE(4), 0x031f);
    const payload = expandedRibBody(action.okInner);
    assert.equal(payload.readUInt8(0), 4, '0x031f remains capped at four records');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_ID)), 70, 'elem[0] is the requested far spot id 70');
    assert.equal(payload.readUInt32LE(ribOffset(1, RIB_ELEM_OFF_ID)), 70001, 'elem[1] is Valhalla planet orbit 1');
    assert.equal(payload.readUInt32LE(ribOffset(2, RIB_ELEM_OFF_ID)), 70002, 'elem[2] is Valhalla planet orbit 2');
    assert.equal(payload.readUInt8(ribOffset(1, RIB_ELEM_OFF_FIELD_179)), 2, 'derived Valhalla base is typed as planet');
    assert.equal(payload.readUInt8(ribOffset(0, RIB_ELEM_OFF_BUDGET_CNT)), 1, 'requested far spot has planet/economy roll-up');
    assert.equal(payload.readUInt32LE(ribOffset(0, RIB_ELEM_OFF_BUDGET)), 11207, 'Valhalla Σ industry is present');
    assert.equal(payload.readUInt16LE(ribOffset(0, RIB_ELEM_OFF_BUDGETING)), 4, 'Valhalla planet count is present');
  } finally {
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
  }
});

test('login session 0x034e RequestCardCharacter returns a populated 0x034f roster (≥1 record)', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  const action = session.onInnerMessage(makeInner(0x034e, makeIdListBody([209])));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x034f); // ResponseCardCharacter
  assert.equal(action.okInner.length, 6 + 0xb504); // dispatch-sized 0x034f object
  const payload = action.okInner.subarray(6);
  assert.equal(payload.readUInt8(0), 2); // count = 2 canon characters in the pack
  // first 724-byte record's id (record[0]) must be the first seeded character id (209 Reinhard).
  assert.equal(payload.readUInt32LE(4), 209);
  const targets = session.commandTargetSnapshot();
  assert.ok(targets.characters.some((entry) => entry.id === 209));
});

test('login session 0x034e writes the recovered display name, not only the romaji fallback', () => {
  const contentPack = createContentPack({
    name: 'jp-name-test',
    nations: [{ id: 1, name: 'Empire' }],
    characters: [
      { id: 209, name: 'ラインハルト', nameRomaji: 'Reinhard', nationId: 1, abilities: [1, 2, 3, 4, 5, 6, 7, 8] },
    ],
  });
  const session = lobbyAuthedSession({ contentPack });
  const action = session.onInnerMessage(makeInner(0x034e, makeIdListBody([209])));
  const payload = action.okInner.subarray(6);
  const firstRecord = 4;
  assert.equal(readPstr16(payload, firstRecord + 0x81, firstRecord + 0x82), 'ラインハルト');
  assert.notEqual(readPstr16(payload, firstRecord + 0x81, firstRecord + 0x82), 'Reinhard');
});

test('login session 0x034e uses Korean names when LOGH_KO_NAMES=1 and falls back to romaji safely', () => {
  const prev = process.env.LOGH_KO_NAMES;
  process.env.LOGH_KO_NAMES = '1';
  try {
    const koreanPack = createContentPack({
      name: 'ko-name-test',
      nations: [{ id: 1, name: 'Empire' }],
      characters: [
        { id: 209, name: 'ラインハルト', nameRomaji: 'Reinhard', name_ko: '라인하르트', nationId: 1 },
      ],
    });
    const koreanAction = lobbyAuthedSession({ contentPack: koreanPack })
      .onInnerMessage(makeInner(0x034e, makeIdListBody([209])));
    assert.equal(readPstr16(koreanAction.okInner.subarray(6), 4 + 0x81, 4 + 0x82), '라인하르트');

    const fallbackPack = createContentPack({
      name: 'ko-fallback-test',
      nations: [{ id: 1, name: 'Empire' }],
      characters: [{ id: 209, name: 'ラインハルト', nameRomaji: 'Reinhard', nationId: 1 }],
    });
    const fallbackAction = lobbyAuthedSession({ contentPack: fallbackPack })
      .onInnerMessage(makeInner(0x034e, makeIdListBody([209])));
    assert.equal(readPstr16(fallbackAction.okInner.subarray(6), 4 + 0x81, 4 + 0x82), 'Reinhard');
  } finally {
    if (prev === undefined) delete process.env.LOGH_KO_NAMES;
    else process.env.LOGH_KO_NAMES = prev;
  }
});

test('login session 0x034e seeds one minimal card when the pack has no characters', () => {
  const session = lobbyAuthedSession(); // no content pack
  const action = session.onInnerMessage(makeInner(0x034e, makeIdListBody([])));
  assert.equal(action.okInner.readUInt16BE(4), 0x034f);
  assert.ok(action.okInner.subarray(6).readUInt8(0) >= 1); // never empty (count >= 1)
});

test('login session 0x034e does not expose numeric placeholder names in card roster', () => {
  const contentPack = createContentPack({
    name: 'masked-name-card-test',
    nations: [{ id: 1, name: 'Empire' }],
    characters: [{ id: 4097, name: '1', nameRomaji: '1', nationId: 1, faction: 'empire' }],
  });
  const action = lobbyAuthedSession({ contentPack })
    .onInnerMessage(makeInner(0x034e, makeIdListBody([4097])));
  const payload = action.okInner.subarray(6);
  assert.equal(payload.readUInt8(0), 1);
  assert.equal(payload.readUInt32LE(4), 4097);
  assert.equal(readPstr16(payload, 4 + 0x81, 4 + 0x82), 'Officer 4097');
});

test('login session 0x032a RequestInformationOutfit returns a non-empty 0x032b outfit summary', () => {
  // content pack with a unit so the outfit list is seeded from real fleets.
  const pack = createContentPack({
    name: 'outfit-test',
    nations: [{ id: 1, name: 'Empire' }],
    units: [{ id: 0x01000000, nationId: 1, x: 0, y: 0, z: 0, heading: 0 }],
  });
  const session = lobbyAuthedSession({ contentPack: pack });
  const action = session.onInnerMessage(makeInner(0x032a, makeIdListBody([])));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x032b); // ResponseInformationOutfit
  assert.equal(action.okInner.length, 6 + 0x0af4);
  assert.ok(action.okInner.subarray(6).readUInt8(0) >= 1); // outer count (u8) >= 1
  const targets = session.commandTargetSnapshot();
  assert.ok(targets.outfits.some((outfit) => outfit.id === 0x01000000));
  assert.ok(targets.ships.some((ship) => ship.units.includes(0x01000000)));
});

test('login session 0x032e RequestInformationOutfitParty returns a 0x032f manifest keyed to the id', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  const action = session.onInnerMessage(makeInner(0x032e, makeIdListBody([209])));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x032f); // ResponseInformationOutfitParty
  assert.equal(action.okInner.length, 6 + 0x8b04);
  assert.equal(action.okInner.subarray(6).readUInt32LE(0), 209); // outfit id @0x00 echoes the request
});

test('login session 0x0324 RequestInformationUnit returns a 0x0325 unit table with count 1', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  const action = session.onInnerMessage(makeInner(0x0324, makeIdListBody([42])));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x0325); // ResponseInformationUnit
  assert.equal(action.okInner.length, 6 + 0xce44);
  const payload = action.okInner.subarray(6);
  assert.equal(readUnitLeU16(payload, 0), 1); // unitCount = 1
  assert.equal(readUnitLeU32(payload, 4), 42); // unit[0].id = requested id
  const targets = session.commandTargetSnapshot();
  assert.ok(targets.outfits.some((outfit) => outfit.id === 42));
  assert.ok(targets.ships.some((ship) => ship.units.includes(42)));
});

test('login session 0x033a RequestTacticsInformationUnitShip returns non-empty 0x033b table', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  const action = session.onInnerMessage(makeInner(0x033a, makeIdListBody([])));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x033b);
  assert.equal(action.okInner.length, 6 + 0x79e4);
  const payload = action.okInner.subarray(6);
assert.equal(payload.readUInt16BE(0), 1);
assert.equal(payload.readUInt16BE(2), 0);
assert.equal(payload.readUInt32BE(4), 1);
assert.equal(payload.readUInt8(4 + 0x04), 100);
assert.equal(payload.readUInt32BE(4 + 0x18), 1);
});

test('login session tactical read-model requests return position and shield tables', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });

  const position = session.onInnerMessage(makeInner(0x0348, makeIdListBody([])));
  assert.equal(position.kind, 'lobby-response');
  assert.equal(position.okInner.readUInt16BE(4), 0x0349);
  assert.equal(position.okInner.length, 6 + 0x2ee4);
assert.equal(position.okInner.subarray(6).readUInt16BE(0), 1);
assert.equal(position.okInner.subarray(6).readUInt32BE(4), 1);

  const shield = session.onInnerMessage(makeInner(0x0340, makeIdListBody([])));
  assert.equal(shield.kind, 'lobby-response');
  assert.equal(shield.okInner.readUInt16BE(4), 0x0341);
  assert.equal(shield.okInner.length, 6 + 0x5dc4);
  assert.equal(shield.okInner.subarray(6).readUInt16BE(0), 1);
  assert.equal(shield.okInner.subarray(6).readUInt32BE(4), 1);

  const basePosition = session.onInnerMessage(makeInner(0x034a, makeIdListBody([])));
  assert.equal(basePosition.kind, 'lobby-response');
  assert.equal(basePosition.okInner.readUInt16BE(4), 0x034b);
  assert.equal(basePosition.okInner.length, 6 + 0x44);
  assert.equal(basePosition.okInner.subarray(6).readUInt8(0), 1);
  assert.equal(basePosition.okInner.subarray(6).readUInt32BE(4), 3);
});

test('login session bundles remaining tactical read-model steps after first natural 0x0348 request when probe gates are enabled', () => {
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevDeferTables = process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
  const prevNotifyTactics = process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
  try {
    process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
    process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = '1';
    delete process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
    const session = lobbyAuthedSession({ contentPack: makeContentPack() });

  const first = session.onInnerMessage(makeInner(0x0348, makeIdListBody([])));
  assert.equal(first.kind, 'lobby-response');
  assert.equal(appInnerCode(first.okInner), 0x0349);
  assert.deepEqual(first.extraInners.map(appInnerCode), [0x033b, 0x0341, 0x0337, 0x0345, 0x034b, 0x042f]);

    const second = session.onInnerMessage(makeInner(0x0348, makeIdListBody([])));
    assert.equal(second.kind, 'lobby-response');
    assert.equal(appInnerCode(second.okInner), 0x0349);
    assert.equal(second.extraInners, undefined);
  } finally {
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevDeferTables === undefined) delete process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
    else process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = prevDeferTables;
    if (prevNotifyTactics === undefined) delete process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS;
    else process.env.LOGH_BATTLE_ENTRY_NOTIFY_TACTICS = prevNotifyTactics;
  }
});

test('login session does not duplicate primed tactical setup tables in deferred battle entry', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevDeferTables = process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
  try {
    process.env.LOGH_GRID_ENTER = '1';
    process.env.LOGH_WORLD_PLAYER = '1';
    process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
    process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
    process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = '1';

    const session = lobbyAuthedSession({ contentPack: makeContentPack() });
    const world = session.onInnerMessage(makeInner(0x0f02));
  assert.deepEqual(
    world.extraInners
      .filter((inner) => [0x0325, 0x0349, 0x033b, 0x0341, 0x0337].includes(appInnerCode(inner)))
      .map(appInnerCode),
    [0x0325, 0x0325, 0x033b, 0x0341, 0x0337, 0x0349],
  );

    const postload = session.onInnerMessage(makeInner(0x0f06));
    assert.deepEqual(postload.deferredBattleInners.map(appInnerCode), [0x042f]);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevWorldPlayer;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevDeferTables === undefined) delete process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
    else process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = prevDeferTables;
  }
});

test('login session schedules battle-entry probe only once per post-load session', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevDeferTables = process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
  try {
    process.env.LOGH_GRID_ENTER = '1';
    process.env.LOGH_WORLD_PLAYER = '1';
    process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
    process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
    process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = '1';

    const session = lobbyAuthedSession({ contentPack: makeContentPack() });
    const first = session.onInnerMessage(makeInner(0x0f06));
    assert.equal(first.deferredBattleInners.map(appInnerCode).includes(0x042f), true);

    const second = session.onInnerMessage(makeInner(0x0f06));
    assert.equal(second.deferredBattleInners, undefined);
    assert.equal(
      (second.extraInners ?? []).some((inner) => [0x033b, 0x0341, 0x0337, 0x0349, 0x042f].includes(appInnerCode(inner))),
      false,
    );
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevWorldPlayer;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevDeferTables === undefined) delete process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
    else process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = prevDeferTables;
  }
});

test('login session defers grid-end after tactical mode flip when requested', () => {
  const prevGridEnter = process.env.LOGH_GRID_ENTER;
  const prevWorldPlayer = process.env.LOGH_WORLD_PLAYER;
  const prevPostloadPlayer = process.env.LOGH_POSTLOAD_PLAYER_RECORD;
  const prevProbe = process.env.LOGH_BATTLE_ENTRY_PROBE;
  const prevCodes = process.env.LOGH_BATTLE_ENTRY_CODES;
  const prevDeferTables = process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
  const prevDeferGridEnd = process.env.LOGH_BATTLE_ENTRY_DEFER_GRID_END;
  try {
    process.env.LOGH_GRID_ENTER = '1';
    process.env.LOGH_WORLD_PLAYER = '1';
    process.env.LOGH_POSTLOAD_PLAYER_RECORD = '1';
    process.env.LOGH_BATTLE_ENTRY_PROBE = '1';
    process.env.LOGH_BATTLE_ENTRY_CODES = '0x0349,0x033b,0x0341,0x042f';
    delete process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
    process.env.LOGH_BATTLE_ENTRY_DEFER_GRID_END = '1';

    const session = lobbyAuthedSession({ contentPack: makeContentPack() });
    const postload = session.onInnerMessage(makeInner(0x0f06));

    assert.equal(postload.kind, 'lobby-response');
    assert.equal(postload.extraInners.some((inner) => appInnerCode(inner) === 0x0b0a), false);
    assert.deepEqual(
      postload.extraInners
        .filter((inner) => [0x0349, 0x033b, 0x0341].includes(appInnerCode(inner)))
        .map(appInnerCode),
      [0x0349, 0x033b, 0x0341],
    );
    assert.deepEqual(postload.deferredBattleInners.map(appInnerCode), [0x042f, 0x0b0a]);
  } finally {
    if (prevGridEnter === undefined) delete process.env.LOGH_GRID_ENTER;
    else process.env.LOGH_GRID_ENTER = prevGridEnter;
    if (prevWorldPlayer === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = prevWorldPlayer;
    if (prevPostloadPlayer === undefined) delete process.env.LOGH_POSTLOAD_PLAYER_RECORD;
    else process.env.LOGH_POSTLOAD_PLAYER_RECORD = prevPostloadPlayer;
    if (prevProbe === undefined) delete process.env.LOGH_BATTLE_ENTRY_PROBE;
    else process.env.LOGH_BATTLE_ENTRY_PROBE = prevProbe;
    if (prevCodes === undefined) delete process.env.LOGH_BATTLE_ENTRY_CODES;
    else process.env.LOGH_BATTLE_ENTRY_CODES = prevCodes;
    if (prevDeferTables === undefined) delete process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES;
    else process.env.LOGH_BATTLE_ENTRY_DEFER_TABLES = prevDeferTables;
    if (prevDeferGridEnd === undefined) delete process.env.LOGH_BATTLE_ENTRY_DEFER_GRID_END;
    else process.env.LOGH_BATTLE_ENTRY_DEFER_GRID_END = prevDeferGridEnd;
  }
});

test('login session 0x0320 RequestInformationInstitution returns a non-empty 0x0321 facility table', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  const action = session.onInnerMessage(makeInner(0x0320, makeIdListBody([7])));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x0321); // ResponseInformationInstitution
  assert.equal(action.okInner.length, 6 + 0x8de4);
  const payload = expandedRiiBody(action.okInner);
  assert.equal(payload.readUInt8(0), 1); // outer base count (u8) = 1
  assert.equal(payload.readUInt32LE(4), 7); // base id @0x04 = requested id
  assert.equal(session.commandTargetSnapshot().baseId, 7);
  // Nested-offset lock (regression guard for the legacy +4/−4 bug): the byte-exact builder places the
  // institution_count at elem+0x04 (body+0x08), institution[0] at elem+0x08 (body+0x0c), and spot[0] at
  // inst+0x0c (body+0x18) — matching the client parser pins (logh7-institution-record.mjs).
  assert.equal(payload.readUInt8(0x08), 1); // institution_count @elem+0x04 = body+0x08
  assert.equal(payload.readUInt16LE(0x0c), 0x10); // institution[0].field00 kind used by FUN_004c9170 spot resolver
  assert.equal(payload.readUInt32LE(0x10), 1); // institution[0].field04 (u32) @inst+0x04 = body+0x10
  assert.equal(payload.readUInt8(0x14), 1); // spot_count @inst+0x08 = body+0x14
  assert.equal(payload.readUInt16LE(0x18), 1); // spot[0].field00 (u16) @spot+0x00 = body+0x18
  assert.equal(payload.readUInt32LE(0x1c), 7); // spot[0].field04 matches the requested base/spot key
  assert.equal(payload.readUInt16LE(0x20), 1); // spot[0].field08 (u16) @spot+0x08 = body+0x20
});

test('login session 0x0320 uses inferred institution and office-room catalog ids from the content pack', () => {
  const contentPack = createContentPack({
    name: 'facility-test',
    nations: [{ id: 1, name: 'Empire' }],
    institutions: [{ id: 17, name: '皇宮', nameCatalogId: 2256 }],
    rooms: [{ id: 83, name: '皇帝執務室', nameCatalogId: 2332 }],
  });
  const session = lobbyAuthedSession({ contentPack });
  const action = session.onInnerMessage(makeInner(0x0320, makeIdListBody([7])));
  const payload = expandedRiiBody(action.okInner);
  assert.equal(payload.readUInt8(0), 1);
  assert.equal(payload.readUInt32LE(4), 7);
  assert.equal(payload.readUInt8(0x08), 1);
  assert.equal(payload.readUInt16LE(0x0c), 0x10);
  assert.equal(payload.readUInt32LE(0x10), 17);
  assert.equal(payload.readUInt8(0x14), 1);
  assert.equal(payload.readUInt16LE(0x18), 2332);
  assert.equal(payload.readUInt32LE(0x1c), 7);
});

test('login session 0x0326 RequestInformationWarehouse returns a 0x0327 stockpile keyed to the base id', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  const action = session.onInnerMessage(makeInner(0x0326, makeIdListBody([7])));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x0327); // ResponseInformationWarehouse
  assert.equal(action.okInner.length, 6 + 0x300); // fixed 0x300 body (dispatcher copies 0xc0 dwords)
  const payload = action.okInner.subarray(6);
  assert.equal(payload.readUInt32LE(0x00), 7); // base id @0x00 = requested id
  // economy stays 0 (P3 — no fabrication): supplies/food/mineral @ 0x2f4/0x2f8/0x2fc
  assert.equal(payload.readUInt32LE(0x2f4), 5000); // playable target-pool supplies
  assert.equal(payload.readUInt32LE(0x2f8), 3000); // playable target-pool food
  assert.equal(payload.readUInt32LE(0x2fc), 2000); // playable target-pool mineral
  assert.ok(payload.readUInt8(0x0c) > 0); // ships_count target candidates
  assert.ok(payload.readUInt8(0x260) > 0); // troops_count target candidates
  const targets = session.commandTargetSnapshot();
  assert.equal(targets.baseId, 7);
  assert.ok(targets.ships.length > 0);
  assert.ok(targets.troops.length > 0);
});

test('login session 0x0328 RequestInformationPackage returns a 0x0329 transfer manifest keyed to the base id', () => {
  const session = lobbyAuthedSession({ contentPack: makeContentPack() });
  const action = session.onInnerMessage(makeInner(0x0328, makeIdListBody([7])));
  assert.equal(action.kind, 'lobby-response');
  assert.equal(action.okInner.readUInt16BE(4), 0x0329); // ResponseInformationPackage
  assert.equal(action.okInner.length, 6 + 0x154); // fixed 0x154 body (dispatcher copies 0x55 dwords)
  const payload = action.okInner.subarray(6);
  assert.equal(payload.readUInt32LE(0x00), 7); // source base id @0x00 = requested id
  assert.equal(payload.readUInt32LE(0x04), 3); // target_base fallback first real strategic object
  assert.ok(payload.readUInt8(0x08) > 0); // other_package_count target candidates
  assert.ok(payload.readUInt8(0x30) > 0); // troop_package_count target candidates
  const targets = session.commandTargetSnapshot();
  assert.equal(targets.baseId, 7);
  assert.ok(targets.otherPackages.length > 0);
  assert.ok(targets.troopPackages.length > 0);
});

// 0x030a → 0x030b ResponseStaticInformationUnitShip (함선마스터, M2-2). Reads a ship record from the wire:
// count u8 @0x00; record base = 4 + i*0x8c; kind u16 @base+0x00; name_len u8 @base+0x08; chars u16 @base+0x0a.
function readUnitShipRecord(payload, index = 0) {
  const base = 4 + index * 0x8c;
  const nameLen = payload.readUInt8(base + 0x08);
  let name = '';
  for (let j = 0; j < nameLen; j += 1) name += String.fromCharCode(payload.readUInt16LE(base + 0x0a + j * 2));
  return { kind: payload.readUInt16LE(base + 0x00), nameLen, name };
}

test('login session static master requests expose troops, fighters, arms, and power curves when gated on', () => {
  const prev = {
    troops: process.env.LOGH_STATIC_TROOPS,
    fighters: process.env.LOGH_STATIC_FIGHTERS,
    arms: process.env.LOGH_STATIC_ARMS,
    power: process.env.LOGH_STATIC_POWER_DISTRIBUTION,
    playableSeed: process.env.LOGH_STATIC_MASTER_PLAYABLE_SEED,
  };
  process.env.LOGH_STATIC_TROOPS = '1';
  process.env.LOGH_STATIC_FIGHTERS = '1';
  process.env.LOGH_STATIC_ARMS = '1';
  process.env.LOGH_STATIC_POWER_DISTRIBUTION = '1';
  process.env.LOGH_STATIC_MASTER_PLAYABLE_SEED = '1';
  try {
    const session = lobbyAuthedSession({ contentPack: makeContentPack() });

    const troop = session.onInnerMessage(makeInner(0x030c, makeIdListBody([])));
    assert.equal(troop.kind, 'lobby-response');
    assert.equal(troop.okInner.readUInt16BE(4), 0x030d);
    assert.ok(troop.okInner.subarray(6).readUInt8(0x00) >= 6, 'manual troop classes delivered');
    assert.equal(troop.okInner.subarray(6).readUInt16LE(4 + 0x08), 60, 'manual light-infantry training cost delivered');

    const fighters = session.onInnerMessage(makeInner(0x030e, makeIdListBody([])));
    assert.equal(fighters.okInner.readUInt16BE(4), 0x030f);
    assert.equal(fighters.okInner.subarray(6).readUInt8(0x00), 4, 'fighter master exposes four client slots');

    const arms = session.onInnerMessage(makeInner(0x0310, makeIdListBody([])));
    assert.equal(arms.okInner.readUInt16BE(4), 0x0311);
    assert.ok(arms.okInner.subarray(6).readUInt16LE(0x00) > 0, 'arms table is populated');

    const power = session.onInnerMessage(makeInner(0x0308, makeIdListBody([])));
    assert.equal(power.okInner.readUInt16BE(4), 0x0309);
    assert.ok(power.okInner.subarray(6).readFloatLE(0x00) > 0, 'power distribution curve is populated');
  } finally {
    if (prev.troops === undefined) delete process.env.LOGH_STATIC_TROOPS;
    else process.env.LOGH_STATIC_TROOPS = prev.troops;
    if (prev.fighters === undefined) delete process.env.LOGH_STATIC_FIGHTERS;
    else process.env.LOGH_STATIC_FIGHTERS = prev.fighters;
    if (prev.arms === undefined) delete process.env.LOGH_STATIC_ARMS;
    else process.env.LOGH_STATIC_ARMS = prev.arms;
    if (prev.power === undefined) delete process.env.LOGH_STATIC_POWER_DISTRIBUTION;
    else process.env.LOGH_STATIC_POWER_DISTRIBUTION = prev.power;
    if (prev.playableSeed === undefined) delete process.env.LOGH_STATIC_MASTER_PLAYABLE_SEED;
    else process.env.LOGH_STATIC_MASTER_PLAYABLE_SEED = prev.playableSeed;
  }
});

test('login session 0x030a RequestStaticInformationUnitShip emits the live-safe 0x030b master when LOGH_STATIC_SHIPS=1', () => {
  const prev = process.env.LOGH_STATIC_SHIPS;
  process.env.LOGH_STATIC_SHIPS = '1';
  try {
    const session = lobbyAuthedSession({ contentPack: makeContentPack() });
    const action = session.onInnerMessage(makeInner(0x030a, makeIdListBody([])));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x030b); // ResponseStaticInformationUnitShip
    assert.equal(action.okInner.length, 6 + 0x6d64); // fixed 0x6d64 body = 200*0x8c + 4 (dispatch size)
    const payload = action.okInner.subarray(6);
    const count = payload.readUInt8(0x00);
    assert.equal(count, 19, 'default live-safe cap avoids the client-side count>=20 stall');
    assert.ok(count < 0xc9, 'count under the 200 cap the parser bounds-checks');
    // Byte-exact first record: kind is the 1-based load-order id; name is the manual key string (≤13 wide).
    const rec0 = readUnitShipRecord(payload, 0);
    assert.equal(rec0.kind, 1, 'first ship-class id (1-based)');
    assert.ok(rec0.nameLen >= 1 && rec0.nameLen <= 13, 'name length within the 13-wide-char parser cap');
    assert.equal(rec0.name, 'SS75', 'first hull is the SS75 standard battleship key');
  } finally {
    if (prev === undefined) delete process.env.LOGH_STATIC_SHIPS;
    else process.env.LOGH_STATIC_SHIPS = prev;
  }
});

test('login session 0x030a LIMIT can intentionally exceed the live-safe 0x030b cap for RE bisection', () => {
  const prev = {
    staticShips: process.env.LOGH_STATIC_SHIPS,
    limit: process.env.LOGH_STATIC_SHIPS_LIMIT,
    only: process.env.LOGH_STATIC_SHIPS_ONLY,
  };
  process.env.LOGH_STATIC_SHIPS = '1';
  process.env.LOGH_STATIC_SHIPS_LIMIT = '20';
  delete process.env.LOGH_STATIC_SHIPS_ONLY;
  try {
    const session = lobbyAuthedSession({ contentPack: makeContentPack() });
    const action = session.onInnerMessage(makeInner(0x030a, makeIdListBody([])));
    assert.equal(action.okInner.subarray(6).readUInt8(0x00), 20);
  } finally {
    if (prev.staticShips === undefined) delete process.env.LOGH_STATIC_SHIPS;
    else process.env.LOGH_STATIC_SHIPS = prev.staticShips;
    if (prev.limit === undefined) delete process.env.LOGH_STATIC_SHIPS_LIMIT;
    else process.env.LOGH_STATIC_SHIPS_LIMIT = prev.limit;
    if (prev.only === undefined) delete process.env.LOGH_STATIC_SHIPS_ONLY;
    else process.env.LOGH_STATIC_SHIPS_ONLY = prev.only;
  }
});

test('login session 0x030a can limit the populated 0x030b master for live parser bisection', () => {
  const prev = {
    staticShips: process.env.LOGH_STATIC_SHIPS,
    limit: process.env.LOGH_STATIC_SHIPS_LIMIT,
  };
  process.env.LOGH_STATIC_SHIPS = '1';
  process.env.LOGH_STATIC_SHIPS_LIMIT = '1';
  try {
    const session = lobbyAuthedSession({ contentPack: makeContentPack() });
    const action = session.onInnerMessage(makeInner(0x030a, makeIdListBody([])));
    const payload = action.okInner.subarray(6);
    assert.equal(payload.readUInt8(0x00), 1, 'limited live probe emits one ship master row');
    assert.equal(readUnitShipRecord(payload, 0).name, 'SS75');
  } finally {
    if (prev.staticShips === undefined) delete process.env.LOGH_STATIC_SHIPS;
    else process.env.LOGH_STATIC_SHIPS = prev.staticShips;
    if (prev.limit === undefined) delete process.env.LOGH_STATIC_SHIPS_LIMIT;
    else process.env.LOGH_STATIC_SHIPS_LIMIT = prev.limit;
  }
});

test('login session 0x030a can select explicit 1-indexed 0x030b rows for live parser isolation', () => {
  const prev = {
    staticShips: process.env.LOGH_STATIC_SHIPS,
    limit: process.env.LOGH_STATIC_SHIPS_LIMIT,
    only: process.env.LOGH_STATIC_SHIPS_ONLY,
  };
  process.env.LOGH_STATIC_SHIPS = '1';
  delete process.env.LOGH_STATIC_SHIPS_LIMIT;
  process.env.LOGH_STATIC_SHIPS_ONLY = '1,3';
  try {
    const session = lobbyAuthedSession({ contentPack: makeContentPack() });
    const action = session.onInnerMessage(makeInner(0x030a, makeIdListBody([])));
    const payload = action.okInner.subarray(6);
    assert.equal(payload.readUInt8(0x00), 2, 'explicit live probe emits the selected rows only');
    assert.deepEqual(
      [readUnitShipRecord(payload, 0).kind, readUnitShipRecord(payload, 1).kind],
      [1, 3],
    );
    assert.deepEqual(
      [readUnitShipRecord(payload, 0).name, readUnitShipRecord(payload, 1).name],
      ['SS75', 'SK80'],
    );
  } finally {
    if (prev.staticShips === undefined) delete process.env.LOGH_STATIC_SHIPS;
    else process.env.LOGH_STATIC_SHIPS = prev.staticShips;
    if (prev.limit === undefined) delete process.env.LOGH_STATIC_SHIPS_LIMIT;
    else process.env.LOGH_STATIC_SHIPS_LIMIT = prev.limit;
    if (prev.only === undefined) delete process.env.LOGH_STATIC_SHIPS_ONLY;
    else process.env.LOGH_STATIC_SHIPS_ONLY = prev.only;
  }
});

test('login session 0x030a falls through to the zero-fill 0x030b walker when LOGH_STATIC_SHIPS is unset', () => {
  const prev = process.env.LOGH_STATIC_SHIPS;
  delete process.env.LOGH_STATIC_SHIPS;
  try {
    const session = lobbyAuthedSession({ contentPack: makeContentPack() });
    const action = session.onInnerMessage(makeInner(0x030a, makeIdListBody([])));
    assert.equal(action.kind, 'lobby-response');
    // Gate OFF (default): the generic walker answers the size-correct empty 0x030b (request+1), so the
    // proven world-init path is unchanged. code 0x030b, same fixed size, but count == 0 (empty master).
    assert.equal(action.okInner.readUInt16BE(4), 0x030b);
    assert.equal(action.okInner.length, 6 + 0x6d64);
    assert.equal(action.okInner.subarray(6).readUInt8(0x00), 0, 'empty master when the gate is off');
  } finally {
    if (prev !== undefined) process.env.LOGH_STATIC_SHIPS = prev;
  }
});

test('login session 0x0f08 exposes grid ship count plus grid/system ownership records', () => {
  const prev = {
    col: process.env.LOGH_FLEET_COL,
    row: process.env.LOGH_FLEET_ROW,
  };
  process.env.LOGH_FLEET_COL = '88';
  process.env.LOGH_FLEET_ROW = '25';
  try {
    const worldState = createWorldState();
    worldState.upsertFleet({
      id: 0x1234,
      owner: 3,
      faction: 1,
      commander: 1,
      cell: 2588,
      boats: [0x20, 0x21, 0x22],
      supply: 77,
      mapSection: 70,
    });
    const session = lobbyAuthedSession({
      worldState,
      contentPack: makeValhallaGalaxyContentPack(),
      characters: [{ id: 1, faction: 'empire', spot: 70, spotOwner: 1 }],
    });
    const action = session.onInnerMessage(makeInner(0x0f08, Buffer.from('0000000100000000', 'hex')));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(appInnerCode(action.okInner), 0x0f09);
    assert.equal(action.okInner.subarray(6).readUInt8(0), 1);

    const codes = action.extraInners.map(appInnerCode);
  assert.ok(codes.includes(0x0325), 'unit table returned for panel target');
  assert.ok(codes.includes(0x034f), 'card character roster returned for panel target');
  assert.ok(codes.includes(0x032d), 'grid outfit presence returned for panel target');
  const cardInner = action.extraInners.find((inner) => appInnerCode(inner) === 0x034f);
  assert.ok(cardInner, '0x034f payload is present');
  assert.ok(cardInner.subarray(6).readUInt8(0) >= 1, '0x034f roster is not empty');
  assert.equal(action.trace.infoPanel.targetBaseId, 70);
    assert.equal(action.trace.infoPanel.systemId, 70);
    assert.equal(action.trace.infoPanel.gridCell, 2588);
    assert.equal(action.trace.infoPanel.gridShipCount, 3);
    assert.equal(action.trace.infoPanel.gridOwner, 3);
    assert.equal(action.trace.infoPanel.gridFaction, 'empire');
    assert.equal(action.trace.infoPanel.systemOwner, 3);
    assert.equal(action.trace.infoPanel.systemFaction, 'empire');
    assert.equal(action.trace.infoPanel.gridOutfitCount, 1);

    const unit = action.extraInners.find((inner) => appInnerCode(inner) === 0x0325);
    const unitBody = unit.subarray(6);
    const B = SS_RESP_INFO_UNIT_HEADER;
    assert.equal(unitBody.readUInt16LE(0), 1, 'one fleet in 0x0325');
    assert.equal(unitBody.readUInt32LE(B + 0x00), 0x1234, 'fleet id in 0x0325');
    assert.equal(unitBody.readUInt16LE(B + 0x04), 1, 'fleet faction remains client power empire=1');
    assert.equal(unitBody.readUInt32LE(B + 0x0c), 2588, 'fleet cell in 0x0325');
    assert.equal(unitBody.readUInt32LE(B + 0x10), 3, 'fleet owner/base owner empire=3');
    assert.equal(unitBody.readUInt8(B + 0x14), 3, 'boats count in 0x0325');

    const gridOutfit = action.extraInners.find((inner) => appInnerCode(inner) === 0x032d);
    const gridBody = gridOutfit.subarray(6);
    assert.equal(gridBody.readUInt16LE(0), 1, 'one grid outfit row');
    assert.equal(gridBody.readUInt32LE(4), 0x1234, 'grid outfit id');
    assert.equal(gridBody.readUInt8(9), 3, 'grid outfit power/base-owner byte');
    assert.equal(gridBody.readUInt32LE(12), 77, 'grid outfit supplies');
  } finally {
    if (prev.col === undefined) delete process.env.LOGH_FLEET_COL;
    else process.env.LOGH_FLEET_COL = prev.col;
    if (prev.row === undefined) delete process.env.LOGH_FLEET_ROW;
    else process.env.LOGH_FLEET_ROW = prev.row;
  }
});

test('login session 0x0f02: worldState 주어지면 플레이어 캐릭터를 전투 레지스트리에 시드(戦死 flagship 링크)', () => {
  // 월드진입 시 플레이어 본인 캐릭터(charId)를 worldState.upsertCharacter로 시드 — flagship=unitId(0x0325
  // grid-unit id) 링크로 戦死(旗艦 격침) 판정이 플레이어 기함을 인식한다. leadership=abilities[0](統率).
  const prev = {
    player: process.env.LOGH_WORLD_PLAYER,
    char: process.env.LOGH_WORLD_CHAR_ID,
    unit: process.env.LOGH_WORLD_UNIT_ID,
  };
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '305419896'; // 0x12345678
  process.env.LOGH_WORLD_UNIT_ID = '4660'; // 0x1234 = 기함 grid-unit id
  try {
    const worldState = createWorldState();
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({
      accountStore: store,
      lobby: LOBBY,
      worldState,
      characters: [{ id: 0x12345678, faction: 'empire', abilities: [95, 80, 70, 60, 50, 40, 30, 20] }],
    });
    session.markHandshakeComplete();
    session.onInnerMessage(Buffer.from('0f02', 'hex'));
    const ch = worldState.getCharacter(0x12345678);
    assert.ok(ch, '플레이어 캐릭터가 레지스트리에 시드됨');
    assert.equal(ch.flagship, 0x1234, 'flagship = unitId(0x0325 grid-unit) 링크');
    assert.equal(ch.leadership, 95, 'leadership = abilities[0](統率)');
    assert.equal(ch.faction, 'empire');
    // 戦死 역인덱스: flagship id로 사령관을 되찾는다.
    assert.equal(worldState.getCharacterByFlagship(0x1234)?.id, 0x12345678);
  } finally {
    for (const [k, v] of [['LOGH_WORLD_PLAYER', prev.player], ['LOGH_WORLD_CHAR_ID', prev.char], ['LOGH_WORLD_UNIT_ID', prev.unit]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('C1 멀티플레이: LOGH_MP_VISIBILITY=1이면 0x0f02 월드진입이 플레이어 함대를 worldState.upsertFleet로 등록', () => {
  // 멀티플레이 함대 가시성(2:2): 게이트 ON이면 월드진입 시 플레이어 함대를 공유 worldState에 등록해
  // 다른 클라가 0x0325로 본다. id=unitId(=char+0x24, 0x0325 바인딩 키)·commander=charId·faction=req.power
  // 유래 클라 power 바이트(empire=1). cell=focus cell. 게이트 OFF면 함대 미등록(아래 별도 테스트).
  const prev = {
    player: process.env.LOGH_WORLD_PLAYER,
    char: process.env.LOGH_WORLD_CHAR_ID,
    unit: process.env.LOGH_WORLD_UNIT_ID,
    mp: process.env.LOGH_MP_VISIBILITY,
  };
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '305419896'; // 0x12345678
  process.env.LOGH_WORLD_UNIT_ID = '4660'; // 0x1234
  process.env.LOGH_MP_VISIBILITY = '1';
  try {
    const worldState = createWorldState();
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({
      accountStore: store,
      lobby: LOBBY,
      worldState,
      characters: [{ id: 0x12345678, faction: 'empire', abilities: [95, 80, 70, 60, 50, 40, 30, 20] }],
    });
    session.markHandshakeComplete();
    session.onInnerMessage(Buffer.from('0f02', 'hex'));
    // 캐릭터 시드는 게이트 무관(기존 동작) — 함대는 게이트 ON에서만 등록.
    assert.ok(worldState.getCharacter(0x12345678), '캐릭터 시드는 그대로');
    const fleet = worldState.getFleet(0x1234);
    assert.ok(fleet, '게이트 ON: 플레이어 함대가 worldState에 등록됨');
    assert.equal(fleet.id, 0x1234, '함대 id = unitId(0x0325 바인딩 키)');
    assert.equal(fleet.commander, 0x12345678, 'commander = charId');
    assert.equal(fleet.faction, 1, 'faction = req.power 유래 클라 power 바이트(empire=1)');
    assert.equal(worldState.fleetCount(), 1);
    // worldPlayerInfo() 접근자가 같은 권위 정보를 노출(auth-server C2/C3가 소비).
    const info = session.worldPlayerInfo();
    assert.equal(info.unitId, 0x1234);
    assert.equal(info.charId, 0x12345678);
    assert.equal(info.power, 1);
    assert.equal(info.cell, fleet.cell);
  } finally {
    for (const [k, v] of [
      ['LOGH_WORLD_PLAYER', prev.player], ['LOGH_WORLD_CHAR_ID', prev.char],
      ['LOGH_WORLD_UNIT_ID', prev.unit], ['LOGH_MP_VISIBILITY', prev.mp],
    ]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('C1 멀티플레이: 게이트 OFF면 함대 미등록(캐릭터 시드만, 1107 그린 경로 불변)', () => {
  const prev = {
    player: process.env.LOGH_WORLD_PLAYER,
    char: process.env.LOGH_WORLD_CHAR_ID,
    unit: process.env.LOGH_WORLD_UNIT_ID,
    mp: process.env.LOGH_MP_VISIBILITY,
  };
  process.env.LOGH_WORLD_PLAYER = '1';
  process.env.LOGH_WORLD_CHAR_ID = '305419896';
  process.env.LOGH_WORLD_UNIT_ID = '4660';
  delete process.env.LOGH_MP_VISIBILITY; // 게이트 OFF
  try {
    const worldState = createWorldState();
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({
      accountStore: store,
      lobby: LOBBY,
      worldState,
      characters: [{ id: 0x12345678, faction: 'empire', abilities: [95, 80, 70, 60, 50, 40, 30, 20] }],
    });
    session.markHandshakeComplete();
    session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.ok(worldState.getCharacter(0x12345678), '캐릭터 시드는 게이트 무관으로 그대로');
    assert.equal(worldState.fleetCount(), 0, '게이트 OFF: 함대 미등록(기존 동작 불변)');
  } finally {
    for (const [k, v] of [
      ['LOGH_WORLD_PLAYER', prev.player], ['LOGH_WORLD_CHAR_ID', prev.char],
      ['LOGH_WORLD_UNIT_ID', prev.unit], ['LOGH_MP_VISIBILITY', prev.mp],
    ]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('login session 0x0f02: worldState 없으면 시드 생략(무영향, 기존 동작 보존)', () => {
  const prev = process.env.LOGH_WORLD_PLAYER;
  process.env.LOGH_WORLD_PLAYER = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY }); // worldState 없음
    session.markHandshakeComplete();
    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response', 'worldState 없어도 0x0f02 정상 처리');
  } finally {
    if (prev === undefined) delete process.env.LOGH_WORLD_PLAYER; else process.env.LOGH_WORLD_PLAYER = prev;
  }
});

// ---------------------------------------------------------------------------
// NotifyBaseParameter (0x0337) emit tests — 기지관리 경제 패널 人口/食料/治安/思想/宗教/支持率
// ---------------------------------------------------------------------------

test('login session PUSH(world-import@0x0f02) does not emit provisional 0x0337 by default', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  const prevNotify = process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_WORLD_IMPORT_BASES;
  delete process.env.LOGH_BASE_ECONOMY; // 기본 ON
  delete process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
  try {
    // Valhalla(발할라) system (spot 70) has 4 planets in planet-economy.json
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 70 }],
      contentPack: makeValhallaGalaxyContentPack(),
    });
    const action = session.onInnerMessage(makeInner(0x0f02));
    assert.equal(action.kind, 'lobby-response');
    const codes = action.extraInners.map(appInnerCode);
    // 0x0337 (823) must be present between 0x0321 and 0x0325
    assert.ok(!codes.includes(0x0337), '0x0337 is ResponseTacticsCharacter in the client and stays off by default');
    return;

    const nbp = action.extraInners.find((inner) => appInnerCode(inner) === 0x0337);
    assert.ok(nbp);
    assert.equal(nbp.readUInt16BE(4), NOTIFY_BASE_PARAMETER_CODE);
    const body = nbp.subarray(6);
    // population@0x28 and food@0x40 are CONFIRMED anchors
    // Valhalla first planet (ゾースト): population_M=121 → 121,000,000 people, food=160
    assert.equal(body.readUInt32LE(NBP_OFF_POPULATION), 121000000, 'Valhalla first planet population_M 121 → people u32');
    assert.equal(body.readUInt32LE(NBP_OFF_FOOD), 160, 'Valhalla first planet food');
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES;
    else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
    if (prevNotify === undefined) delete process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
    else process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = prevNotify;
  }
});

test('login session PULL(0x031e->0x031f) does not emit provisional 0x0337 by default', () => {
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  const prevNotify = process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
  delete process.env.LOGH_BASE_ECONOMY; // 기본 ON
  delete process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
  try {
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 70 }],
      contentPack: makeValhallaGalaxyContentPack(),
    });
    // 0x031e RequestInformationBase with wantId=70 (Valhalla/Odin)
    const reqBody = Buffer.alloc(6);
    reqBody.writeUInt16LE(1, 0); // count = 1
    reqBody.writeUInt32LE(70, 2); // id = 70
    const inner = Buffer.concat([Buffer.from('031e', 'hex'), reqBody]);
    const action = session.onInnerMessage(inner);
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x031f);
    assert.equal(action.extraInners, undefined, '0x0337 extraInner omitted by default');
    return;
    // 0x0337 must be present as extraInner
    assert.ok(Array.isArray(action.extraInners), 'extraInners array present');
    assert.equal(action.extraInners.length, 1);
    assert.equal(action.extraInners[0].readUInt16BE(4), NOTIFY_BASE_PARAMETER_CODE);

    const body = action.extraInners[0].subarray(6);
    // Valhalla first planet (ゾースト): population_M=121, food=160
    assert.equal(body.readUInt32LE(NBP_OFF_POPULATION), 121000000, 'PULL path population@0x28');
    assert.equal(body.readUInt32LE(NBP_OFF_FOOD), 160, 'PULL path food@0x40');
  } finally {
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
    if (prevNotify === undefined) delete process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
    else process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = prevNotify;
  }
});

test('login session PUSH emits provisional 0x0337 only when explicitly opted in', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  const prevNotify = process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_WORLD_IMPORT_BASES;
  delete process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = '1';
  try {
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 70 }],
      contentPack: makeValhallaGalaxyContentPack(),
    });
    const action = session.onInnerMessage(makeInner(0x0f02));
    const nbp = action.extraInners.find((inner) => appInnerCode(inner) === 0x0337);
    assert.ok(nbp, 'explicit provisional notify gate emits 0x0337 diagnostic record');
    assert.equal(nbp.readUInt16BE(4), NOTIFY_BASE_PARAMETER_CODE);
    const body = nbp.subarray(6);
    assert.equal(body.readUInt32LE(NBP_OFF_POPULATION), 121000000);
    assert.equal(body.readUInt32LE(NBP_OFF_FOOD), 160);
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES;
    else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
    if (prevNotify === undefined) delete process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
    else process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = prevNotify;
  }
});

test('login session PULL emits provisional 0x0337 only when explicitly opted in', () => {
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  const prevNotify = process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
  delete process.env.LOGH_BASE_ECONOMY;
  process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = '1';
  try {
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 70 }],
      contentPack: makeValhallaGalaxyContentPack(),
    });
    const reqBody = Buffer.alloc(6);
    reqBody.writeUInt16LE(1, 0);
    reqBody.writeUInt32LE(70, 2);
    const action = session.onInnerMessage(Buffer.concat([Buffer.from('031e', 'hex'), reqBody]));
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.okInner.readUInt16BE(4), 0x031f);
    assert.ok(Array.isArray(action.extraInners), 'explicit provisional notify gate emits an extra inner');
    assert.equal(action.extraInners[0].readUInt16BE(4), NOTIFY_BASE_PARAMETER_CODE);
    const body = action.extraInners[0].subarray(6);
    assert.equal(body.readUInt32LE(NBP_OFF_POPULATION), 121000000);
    assert.equal(body.readUInt32LE(NBP_OFF_FOOD), 160);
  } finally {
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
    if (prevNotify === undefined) delete process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
    else process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = prevNotify;
  }
});

test('login session 0x0337 is suppressed when LOGH_BASE_ECONOMY=0', () => {
  const previous = process.env.LOGH_WORLD_PLAYER;
  const prevImport = process.env.LOGH_WORLD_IMPORT_BASES;
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  const prevNotify = process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
  process.env.LOGH_WORLD_PLAYER = '1';
  delete process.env.LOGH_WORLD_IMPORT_BASES;
  process.env.LOGH_BASE_ECONOMY = '0';
  process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = '1';
  try {
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 70 }],
      contentPack: makeValhallaGalaxyContentPack(),
    });
    const action = session.onInnerMessage(makeInner(0x0f02));
    const codes = action.extraInners.map(appInnerCode);
    assert.ok(!codes.includes(0x0337), '0x0337 suppressed when base economy is OFF');
  } finally {
    if (previous === undefined) delete process.env.LOGH_WORLD_PLAYER;
    else process.env.LOGH_WORLD_PLAYER = previous;
    if (prevImport === undefined) delete process.env.LOGH_WORLD_IMPORT_BASES;
    else process.env.LOGH_WORLD_IMPORT_BASES = prevImport;
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
    if (prevNotify === undefined) delete process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
    else process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = prevNotify;
  }
});

test('login session PULL 0x0337 is suppressed when LOGH_BASE_ECONOMY=0', () => {
  const prevEconomy = process.env.LOGH_BASE_ECONOMY;
  const prevNotify = process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
  process.env.LOGH_BASE_ECONOMY = '0';
  process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = '1';
  try {
    const session = lobbyAuthedSession({
      characters: [{ id: 1, faction: 'empire', spot: 70 }],
      contentPack: makeValhallaGalaxyContentPack(),
    });
    const reqBody = Buffer.alloc(6);
    reqBody.writeUInt16LE(1, 0);
    reqBody.writeUInt32LE(70, 2);
    const inner = Buffer.concat([Buffer.from('031e', 'hex'), reqBody]);
    const action = session.onInnerMessage(inner);
    assert.equal(action.kind, 'lobby-response');
    assert.equal(action.extraInners, undefined, 'no extraInners when base economy OFF');
  } finally {
    if (prevEconomy === undefined) delete process.env.LOGH_BASE_ECONOMY;
    else process.env.LOGH_BASE_ECONOMY = prevEconomy;
    if (prevNotify === undefined) delete process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY;
    else process.env.LOGH_PROVISIONAL_BASE_PARAMETER_NOTIFY = prevNotify;
  }
});

// ── 캐릭터 삭제 (LobbyCommandDeleteCharacter 0x2008) ──────────────────────────────────────────────
// 클라 빌더 FUN_0043f070(RE 확인)이 단일 필드 session_id(=캐릭 id)를 [u32 LE]로 보낸다. 와이어 바디를
// 그 형태로 만든다: [u16 BE code][u32 LE characterId].
function makeDeleteCharacter(characterId) {
  const inner = Buffer.alloc(2 + 4);
  inner.writeUInt16BE(LOBBY_CMD_DELETE_CHARACTER_CODE, 0);
  inner.writeUInt32LE(characterId >>> 0, 2);
  return inner;
}

// 오라클 1: 캐릭 삭제가 로비 카드 목록과 계정 프로필(영속) 둘 다에서 제거한다.
test('lobby 0x2008 캐릭 삭제: 로비 카드 + 영속 프로필 둘 다에서 제거된다', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-delete-char-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    createAccountRegistry({ persistPath: db })
      .register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));

    const session = strictLobbyAuthedSession(db, { account: 'p001flow', password: 'FlowPw17!' });
    session.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Reinhard', firstname: 'Lohengramm', power: 1 }));
    const delId = firstLobbyCharacterId(session);
    assert.equal(loadAccountRecords(db)[0].characters.length, 1);

    const del = session.onInnerMessage(makeDeleteCharacter(delId));
    assert.equal(del.kind, 'lobby-response');
    assert.equal(del.okInner.readUInt16BE(4), LOBBY_CMD_DELETE_CHARACTER_CODE);
    assert.equal(del.trace.deletedCharacterId, delId);

    // 로비 카드 목록에 사라졌다.
    assert.deepEqual(lobbyCardIds(session), []);
    // 영속 프로필에서도 제거됐다(재로그인 부활 방지의 핵심).
    assert.equal(loadAccountRecords(db)[0].characters.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 오라클 2: 삭제 후 재로그인하면 옛 캐릭이 부활하지 않는다(프로필 영속 제거 검증).
test('lobby 0x2008 캐릭 삭제: 재로그인해도 삭제한 캐릭이 부활하지 않는다', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-delete-relogin-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    createAccountRegistry({ persistPath: db })
      .register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));

    const first = strictLobbyAuthedSession(db, { account: 'p001flow', password: 'FlowPw17!' });
    first.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Reinhard', firstname: 'Lohengramm', power: 1 }));
    const delId = firstLobbyCharacterId(first);
    first.onInnerMessage(makeDeleteCharacter(delId));
    assert.equal(loadAccountRecords(db)[0].characters.length, 0);

    // 별개 세션으로 재로그인 → 프로필을 다시 로드해도 빈 로스터여야 한다.
    const reloaded = strictLobbyAuthedSession(db, { account: 'p001flow', password: 'FlowPw17!' });
    assert.deepEqual(lobbyCardIds(reloaded), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 오라클 3(사용자 "Reinhard 삭제→새로"): 삭제 후 재생성은 distinct(새 id, 옛 id 재사용 안 함, 새 이름).
test('lobby 0x2008 캐릭 삭제 후 재생성: distinct id(옛 id 재사용 안 함)와 새 이름', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-delete-recreate-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    createAccountRegistry({ persistPath: db })
      .register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));

    const session = strictLobbyAuthedSession(db, { account: 'p001flow', password: 'FlowPw17!' });
    session.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Reinhard', firstname: 'Lohengramm', power: 1 }));
    const oldId = firstLobbyCharacterId(session);
    session.onInnerMessage(makeDeleteCharacter(oldId));

    // 재생성: 새 id가 발급돼야 하고(옛 id 재사용 금지), 카드는 새 캐릭 하나뿐.
    session.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Yang', firstname: 'Wenli', power: 2 }));
    const cards = lobbyCardIds(session);
    assert.equal(cards.length, 1, '재생성 후 로스터에는 한 캐릭만 남는다');
    const newId = cards[0];
    assert.ok(newId > 0 && newId !== oldId, `distinct ids: old=${oldId} new=${newId}`);

    // 영속 프로필도 새 캐릭 하나(옛 id 없음).
    const persisted = loadAccountRecords(db)[0].characters;
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].characterId, newId);
    assert.equal(persisted[0].lastname, 'Yang');
    assert.notEqual(persisted[0].characterId, oldId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 오라클 4(레지스트리 단위): removeProfileCharacter는 대상이 있으면 영속 제거+true, 없으면 false.
test('account registry removeProfileCharacter: 영속 제거 + 멱등(없으면 false)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'logh7-registry-remove-'));
  const db = path.join(dir, 'accounts.sqlite');
  try {
    const registry = createAccountRegistry({ persistPath: db });
    registry.register('p001flow', buildGin7Credential({ account: 'p001flow', password: 'FlowPw17!' }));
    registry.addProfileCharacter('p001flow', { characterId: 7, lastname: 'Reinhard', firstname: 'L' });
    assert.equal(registry.getProfileCharacters('p001flow').length, 1);

    assert.equal(registry.removeProfileCharacter('p001flow', 7), true);
    assert.equal(registry.getProfileCharacters('p001flow').length, 0);
    assert.equal(loadAccountRecords(db)[0].characters.length, 0); // 영속 반영
    // 멱등: 두 번째 삭제는 false(이미 없음), 미존재 계정도 false.
    assert.equal(registry.removeProfileCharacter('p001flow', 7), false);
    assert.equal(registry.removeProfileCharacter('nosuch', 7), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
