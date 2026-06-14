import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAccountStore, createLoginSession, LOGIN_PHASES } from '../../src/server/logh7-login-session.mjs';
import {
  CMD_GENERATE_CHARGE_CODE,
  LOBBY_REQ_INFO_CHARACTER_CHARGE_CODE,
} from '../../src/server/logh7-login-protocol.mjs';

// Build an inbound CommandGenerateCharacterCharge (0x1008): [u16 BE code][body]. Names = u8 len then
// one u16 per char (lastname len@0x0b name@0x0c; firstname len@0x26 name@0x28); abilities @0x50.
// face defaults to a G-group slot (gem/5 = 1000005) — the only kind the creation picker can emit;
// O-group faces are canon-reserved and rejected by the authoritative create gate.
function makeGenerateCharacterCharge({ lastname = 'Reuenthal', firstname = 'Oskar', power = 1, abilities = [], face = 1000005 } = {}) {
  const inner = Buffer.alloc(2 + 0x80);
  inner.writeUInt16BE(CMD_GENERATE_CHARGE_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(0, 0x00); // request_category
  body.writeUInt8(power, 0x08);
  body.writeUInt8(lastname.length, 0x0b);
  [...lastname].forEach((ch, i) => body.writeUInt16LE(ch.charCodeAt(0), 0x0c + i * 2));
  body.writeUInt8(firstname.length, 0x26);
  [...firstname].forEach((ch, i) => body.writeUInt16LE(ch.charCodeAt(0), 0x28 + i * 2));
  body.writeUInt32LE(face, 0x4c); // face (G-group composite by default)
  for (let i = 0; i < 8; i += 1) body.writeUInt8(abilities[i] ?? 0, 0x50 + i);
  return inner;
}

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
  assert.equal(session.phase, LOGIN_PHASES.LOBBY_AUTHENTICATED);
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
  assert.equal(payload.readUInt8(0), 0); // raw leading byte
  assert.equal(payload.readUInt8(1), 1); // record count
  assert.equal(
    payload.subarray(0, 45).toString('hex'),
    '000101000105540065007300740000000e43006f006400650078002000530065007300730069006f006e000000',
  );
  assert.equal(payload.subarray(45).every((byte) => byte === 0), true);
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
  process.env.LOGH_WORLD_PLAYER = '1';
  try {
    const store = createAccountStore({ acceptAnyGin7: true });
    const session = createLoginSession({ accountStore: store, lobby: LOBBY });
    session.markHandshakeComplete();

    const action = session.onInnerMessage(Buffer.from('0f02', 'hex'));
    assert.equal(action.kind, 'lobby-response');
    // okInner = 0x0204 selected char id (LE 1 at payload offset 0)
    assert.equal(action.okInner.readUInt16BE(4), 0x0204);
    assert.equal(action.okInner.readUInt32LE(6), 1);
    // extras in order: 0x0325 unit table, 0x0323 record, then the 0x0f03 GridInitialize_OK LAST.
    assert.equal(Array.isArray(action.extraInners), true);
    assert.equal(action.extraInners.length, 3);
    assert.equal(action.extraInners[0].readUInt16BE(4), 0x0325);
    assert.equal(action.extraInners[0].length, 6 + 0xce44);
    assert.equal(action.extraInners[0].subarray(6).readUInt16LE(0), 1); // unit count
    assert.equal(action.extraInners[0].subarray(6).readUInt32LE(4), 1); // unit[0].id
    assert.equal(action.extraInners[1].readUInt16BE(4), 0x0323);
    assert.equal(action.extraInners[1].length, 6 + 0x02d4);
    assert.equal(action.extraInners[1].readUInt32LE(6), 1); // record[0] = char id
    assert.equal(action.extraInners[1].subarray(6).readUInt32LE(0x24), 1); // record[9] = unit id
    assert.equal(action.extraInners[2].readUInt16BE(4), 0x0f03); // GridInitialize_OK LAST
    assert.equal(action.extraInners[2].subarray(6).readUInt8(0), 1); // status 1
  } finally {
    if (previous === undefined) {
      delete process.env.LOGH_WORLD_PLAYER;
    } else {
      process.env.LOGH_WORLD_PLAYER = previous;
    }
  }
});

test('login session creates a new character on 0x1008 and the new card appears in the 0x2004 list', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
  session.markHandshakeComplete();

  // Create: CommandGenerateCharacterCharge -> 0x1008 OK with a fresh id and success status 1.
  const created = session.onInnerMessage(
    makeGenerateCharacterCharge({ lastname: 'Reuenthal', firstname: 'Oskar', power: 1, abilities: [90, 80, 70, 60, 95, 88, 92, 70] }),
  );
  assert.equal(created.kind, 'lobby-response');
  assert.equal(created.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE); // echo 0x1008
  const newId = created.okInner.readUInt32LE(6);
  assert.ok(newId >= 1);
  assert.equal(created.okInner.readUInt32LE(10), 1); // status 1 = success

  // The next card-list request must now include the created character (count went 0 -> 1).
  const list = session.onInnerMessage(Buffer.from('2003', 'hex'));
  assert.equal(list.kind, 'lobby-response');
  assert.equal(list.okInner.readUInt16BE(4), 0x2004);
  // The compact card stream encodes a leading record count; with one created char it must be >= 1.
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
  assert.equal(result.okInner.readUInt32LE(10), 0); // status 0 = rejected (over entry cap)
});

test('login session rejects 0x1008 creation that submits an O-group (canon-reserved) face', () => {
  const store = createAccountStore({ acceptAnyGin7: true });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY, characters: [] });
  session.markHandshakeComplete();
  // face 7 = oem (O-group), which the creation picker can never offer — must be rejected.
  const result = session.onInnerMessage(makeGenerateCharacterCharge({ lastname: 'Yang', face: 7 }));
  assert.equal(result.kind, 'lobby-response');
  assert.equal(result.okInner.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
  assert.equal(result.okInner.readUInt32LE(10), 0); // status 0 = rejected (canon face)
});

test('login session 0x0f02 places a clickable fleet object on the sector map (LOGH_STRAT_FLEET)', () => {
  // G200: with LOGH_STRAT_FLEET=1 the 0x0f02 push prepends the strategic object table (0x0313) + the
  // cell grid (0x0315) placing the fleet's object value at its cell — the click→0x0b01 enablement gate.
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
    // The fleet object table + cell grid lead, before the unit table / record / 0x0f03 ack.
    assert.equal(codes[0], 0x0313); // object table (class-3 fleet marker)
    assert.equal(codes[1], 0x0315); // cell grid placing the fleet object value
    assert.ok(codes.includes(0x0325)); // unit table still present
    assert.ok(codes.includes(0x0323)); // character record still present
    assert.equal(codes[codes.length - 1], 0x0f03); // GridInitialize_OK stays LAST
    // The object record for the placed value carries class 3 (clickable marker).
    const objTable = action.extraInners[0].subarray(6);
    const fleetValue = Number(process.env.LOGH_FLEET_OBJECT_VALUE ?? '3');
    assert.equal(objTable.readUInt8(1 + fleetValue * 3 + 1), 3); // byte1 = class 3
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

test('login session rejects unknown credential when store enforces matching', () => {
  const store = createAccountStore({ acceptAnyGin7: false });
  const session = createLoginSession({ accountStore: store, lobby: LOBBY });
  session.markHandshakeComplete();
  const action = session.onInnerMessage(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  assert.equal(action.kind, 'reject');
  assert.equal(session.phase, LOGIN_PHASES.REJECTED);
});
