import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GIN7_MAGIC,
  LOGIN_INNER_CODE,
  LOBBY_RESP_INFO_CHARACTER_CHARGE_CODE,
  LOBBY_RESP_INFO_CHARACTER_CHARGE_PAYLOAD_BYTES,
  LOBBY_RESP_INFO_SESSION_CODE,
  LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES,
  LOBBY_SESSION_LOGIN_OK_CODE,
  SS_GAME_LOGIN_OK_CODE,
  SS_LOGIN_OK_CODE,
  REDIRECT_INNER_CODE,
  buildLobbyInformationCharacterChargeInner,
  buildLobbyInformationSessionInner,
  buildLobbyResponseInner,
  buildLobbySessionLoginOkMessage32Inner,
  buildMpsClientMessage32Inner,
  wrapRawInnerAsMessage32,
  buildRedirectInner,
  buildSsGameLoginOkInner,
  buildSsGameLoginOkMessage32Inner,
  buildSsLoginOkInner,
  buildSsLoginOkMessage32Inner,
  buildResponseTimeInner,
  buildSsCharacterIdResponseInner,
  buildInformationCharacterRecordInner,
  buildStaticInformationGridInner,
  buildStaticInformationGridTypeInner,
  buildNotifyMovedGridInner,
  parseGenerateCharacterCharge,
  buildGenerateCharacterChargeOkInner,
  CMD_GENERATE_CHARGE_CODE,
  SS_RESP_STATIC_GRID_TYPE_CODE,
  SS_RESP_STATIC_GRID_BYTES,
  NOTIFY_MOVED_GRID_CODE,
  buildWorldDataResponseInner,
  buildWorldInformationSessionInner,
  buildWorldInformationCharacterInner,
  buildNotifyTurnedShipInner,
  buildNotifyMovedShipInner,
  buildNotifyEnterGridBeginInner,
  buildNotifyEnterGridEndInner,
  buildCommandGridChatInner,
  buildResponseTacticsInformationInner,
  SS_RESP_TACTICS_INFO_CODE,
  SS_RESP_TACTICS_INFO_BYTES,
  TACTICS_UNIT_ENTRY_STRIDE,
  COMMAND_GRID_CHAT_CODE,
  NOTIFY_MOVED_SHIP_CODE,
  NOTIFY_TURNED_SHIP_CODE,
  NOTIFY_ENTER_GRID_BEGIN_CODE,
  NOTIFY_ENTER_GRID_END_CODE,
  selectSsResponseInner,
  SS_RESP_INFO_SESSION_CODE,
  SS_RESP_INFO_SESSION_PAYLOAD_BYTES,
  SS_RESP_INFO_CHARACTER_CODE,
  SS_RESP_INFO_CHARACTER_PAYLOAD_BYTES,
  ipToRedirectU32,
  isLoginCredentialInner,
  parseGin7Credential,
  readInnerCode,
} from '../../src/server/logh7-login-protocol.mjs';

// Real captured inner payloads (docs/claude-handoff-2026-06-10.md G136).
const REAL_LOGIN_INNER_HEX =
  '700047494e370001000000070069006e006500690030003000000600640075006d006d00790000';
const KNOWN_GOOD_REDIRECT_HEX = '70010000000000000100007fbb1c0000000100000000';

test('readInnerCode reads the BE u16 inner code', () => {
  assert.equal(readInnerCode(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex')), LOGIN_INNER_CODE);
  assert.equal(readInnerCode(Buffer.from('0020', 'hex')), 0x0020);
  assert.equal(readInnerCode(Buffer.alloc(1)), null);
});

test('isLoginCredentialInner recognizes the GIN7 credential', () => {
  const inner = Buffer.from(REAL_LOGIN_INNER_HEX, 'hex');
  assert.equal(isLoginCredentialInner(inner), true);
  assert.equal(inner.toString('ascii', 2, 6), GIN7_MAGIC);
  // lobby join (inner 0x0020) is not a login credential
  assert.equal(isLoginCredentialInner(Buffer.from('002000000001', 'hex')), false);
});

test('parseGin7Credential extracts the account label from the real blob', () => {
  const parsed = parseGin7Credential(Buffer.from(REAL_LOGIN_INNER_HEX, 'hex'));
  assert.equal(parsed.code, LOGIN_INNER_CODE);
  assert.equal(parsed.accountLabel, 'inei00');
  assert.equal(parsed.rawHex, REAL_LOGIN_INNER_HEX);
});

test('ipToRedirectU32 packs octets little-end-first (matches "%d.%d.%d.%d" parser)', () => {
  assert.equal(ipToRedirectU32('127.0.0.1'), 0x0100007f);
  assert.equal(ipToRedirectU32('0.0.0.0'), 0);
  assert.throws(() => ipToRedirectU32('256.0.0.1'));
  assert.throws(() => ipToRedirectU32('127.0.0'));
});

test('buildRedirectInner default reproduces the proven-working redirect bytes', () => {
  const inner = buildRedirectInner();
  assert.equal(inner.toString('hex'), KNOWN_GOOD_REDIRECT_HEX);
  assert.equal(readInnerCode(inner), REDIRECT_INNER_CODE);
});

test('buildRedirectInner patches IP and port', () => {
  const inner = buildRedirectInner({ ip: '10.20.30.40', port: 50000 });
  assert.equal(inner.readUInt16BE(0), REDIRECT_INNER_CODE);
  assert.equal(inner.readUInt32BE(8), ipToRedirectU32('10.20.30.40'));
  assert.equal(inner.readUInt16BE(12), 50000);
});

test('buildRedirectInner rejects invalid port', () => {
  assert.throws(() => buildRedirectInner({ port: 70000 }));
});

test('buildMpsClientMessage32Inner wraps a 16-bit app code after a 32-bit prefix', () => {
  const inner = buildMpsClientMessage32Inner({
    code: 0x2001,
    prefix: 0,
    payload: Buffer.from('0000', 'hex'),
  });

  assert.equal(inner.toString('hex'), '0000000020010000');
  assert.equal(readInnerCode(inner), 0x0000);
  assert.equal(inner.readUInt16BE(4), 0x2001);
});

test('buildLobbyResponseInner uses conn2 message32 framing', () => {
  const empty = buildLobbyResponseInner(0x2004, 0);
  assert.equal(empty.toString('hex'), '000000002004');
  assert.equal(readInnerCode(empty), 0x0000);
  assert.equal(empty.readUInt16BE(4), 0x2004);

  const session = buildLobbyResponseInner(LOBBY_RESP_INFO_SESSION_CODE, LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  assert.equal(session.length, 6 + LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  assert.equal(session.readUInt16BE(4), LOBBY_RESP_INFO_SESSION_CODE);
});

test('buildLobbyInformationSessionInner emits one named session record', () => {
  const inner = buildLobbyInformationSessionInner();
  const payload = inner.subarray(6);

  assert.equal(inner.length, 6 + LOBBY_RESP_INFO_SESSION_PAYLOAD_BYTES);
  assert.equal(inner.readUInt16BE(4), LOBBY_RESP_INFO_SESSION_CODE);
  assert.equal(payload.readUInt8(0), 0); // raw leading byte
  assert.equal(payload.readUInt8(1), 1); // record count
  assert.equal(
    payload.subarray(0, 45).toString('hex'),
    '000101000105540065007300740000000e43006f006400650078002000530065007300730069006f006e000000',
  );
  assert.equal(payload.subarray(45).every((byte) => byte === 0), true);
  assert.throws(() => buildLobbyInformationSessionInner({ recordCount: 0x41 }));
});

test('buildLobbyInformationCharacterChargeInner emits an empty dynamic character list by default', () => {
  const inner = buildLobbyInformationCharacterChargeInner();
  const payload = inner.subarray(6);

  assert.equal(inner.length, 6 + LOBBY_RESP_INFO_CHARACTER_CHARGE_PAYLOAD_BYTES);
  assert.equal(inner.readUInt16BE(4), LOBBY_RESP_INFO_CHARACTER_CHARGE_CODE);
  assert.equal(payload.length, LOBBY_RESP_INFO_CHARACTER_CHARGE_PAYLOAD_BYTES);
  assert.equal(payload.readUInt8(0), 0);
  assert.equal(payload.subarray(1).every((byte) => byte === 0), true);
});

test('buildLobbyInformationCharacterChargeInner emits selectable character records', () => {
  const inner = buildLobbyInformationCharacterChargeInner({
    characters: [{ id: 7 }, { characterId: 8, status: 2, name: 'Reinhard', description: 'Admiral' }],
  });
  const payload = inner.subarray(6);
  const expected = Buffer.alloc(LOBBY_RESP_INFO_CHARACTER_CHARGE_PAYLOAD_BYTES);
  expected.writeUInt8(2, 0);
  let cursor = writeExpectedChargeRecord(expected, 1, {
    id: 7,
    status: 1,
    name: 'Character 7',
    description: 'Character 7 ready',
  });
  assert.equal(cursor, 0x91);
  cursor = writeExpectedChargeRecord(expected, cursor, {
    id: 8,
    status: 2,
    name: 'Reinhard',
    description: 'Admiral',
  });
  assert.equal(cursor, 0x107);
  assert.equal(expected.readUInt8(0x64), 2);
  assert.equal(expected.readUInt8(0x65), 1);
  assert.equal(expected.readUInt8(0xda), 2);
  assert.equal(expected.readUInt8(0xdb), 1);

  assert.equal(inner.readUInt16BE(4), LOBBY_RESP_INFO_CHARACTER_CHARGE_CODE);
  assert.deepEqual(payload, expected);
  assert.throws(() => buildLobbyInformationCharacterChargeInner({ characters: [{ id: 1 }, { id: 2 }, { id: 3 }] }));
  assert.throws(() => buildLobbyInformationCharacterChargeInner({ characters: [{ id: 0 }] }));
  assert.throws(() => buildLobbyInformationCharacterChargeInner({ characters: [{ id: 1, status: 3 }] }));
  assert.throws(() =>
    buildLobbyInformationCharacterChargeInner({ characters: [{ id: 1, name: 'NameThatIsTooLong' }] }),
  );
  assert.throws(() =>
    buildLobbyInformationCharacterChargeInner({ characters: [{ id: 1, description: 'x'.repeat(65) }] }),
  );
  assert.throws(() => buildLobbyInformationCharacterChargeInner({ characters: '1' }));
});

function writeExpectedChargeRecord(target, cursor, { id, status, name, description }) {
  target.writeUInt16LE(id, cursor);
  cursor += 2;
  target.writeUInt8(status, cursor);
  cursor += 1;
  cursor = writeExpectedUtf16Field(target, cursor, name);
  cursor = writeExpectedUtf16Field(target, cursor, description);
  cursor += 4; // +0xa8 dword
  for (let index = 0; index < 2; index += 1) {
    cursor += 1; // power status
    cursor += 12; // three dwords
    cursor += 1; // nested power count
  }
  cursor += 1; // +0x13c count
  cursor += 1; // +0x150 count
  target.writeUInt8(2, cursor);
  cursor += 1; // +0x2a0 card kind
  target.writeUInt8(1, cursor);
  cursor += 1; // +0x2a1 charged-character detail count / selectable gate
  return cursor + 43; // one zero-filled charged-character detail block
}

function writeExpectedUtf16Field(target, cursor, value) {
  const text = `${value}\0`;
  target.writeUInt8([...text].length, cursor);
  cursor += 1;
  target.write(text, cursor, 'utf16le');
  return cursor + Buffer.byteLength(text, 'utf16le');
}

test('buildLobbySessionLoginOkMessage32Inner wraps the world endpoint payload', () => {
  const inner = buildLobbySessionLoginOkMessage32Inner({ ip: '127.0.0.1', port: 47950, token: 0x11223344 });
  assert.equal(inner.length, 18);
  assert.equal(inner.readUInt16BE(4), LOBBY_SESSION_LOGIN_OK_CODE);
  assert.equal(inner.readUInt32BE(6), 0x0100007f);
  assert.equal(inner.readUInt16BE(10), 47950);
  assert.equal(inner.readUInt16BE(12), 0);
  assert.equal(inner.readUInt32BE(14), 0x11223344);
});

test('buildSsLoginOkInner and buildSsGameLoginOkInner emit raw conn3 SS status replies', () => {
  const loginOk = buildSsLoginOkInner();
  assert.equal(loginOk.toString('hex'), '02010100');
  assert.equal(readInnerCode(loginOk), SS_LOGIN_OK_CODE);
  assert.equal(loginOk.readUInt8(2), 1);

  const gameLoginOk = buildSsGameLoginOkInner({ status: 2 });
  assert.equal(gameLoginOk.toString('hex'), '02060200');
  assert.equal(readInnerCode(gameLoginOk), SS_GAME_LOGIN_OK_CODE);
  assert.equal(gameLoginOk.readUInt8(2), 2);
});

test('SS replies have a conn2-style message32 form for the G138 receive-path probe', () => {
  // [u32 BE prefix=0][u16 BE appCode][u8 status]
  const loginOk = buildSsLoginOkMessage32Inner();
  assert.equal(loginOk.toString('hex'), '00000000020101');
  assert.equal(loginOk.readUInt32BE(0), 0);
  assert.equal(loginOk.readUInt16BE(4), SS_LOGIN_OK_CODE);
  assert.equal(loginOk.readUInt8(6), 1);

  const gameOk = buildSsGameLoginOkMessage32Inner({ status: 2 });
  assert.equal(gameOk.toString('hex'), '00000000020602');
  assert.equal(gameOk.readUInt16BE(4), SS_GAME_LOGIN_OK_CODE);
  assert.equal(gameOk.readUInt8(6), 2);
});

test('world *_OK responses carry status byte 1, data objects stay count 0 (G144)', () => {
  // 0x0f01 ResponseWorldInitialize_OK / 0x0f03 ResponseGridInitialize_OK -> init flags = body[0]
  const worldOk = buildWorldDataResponseInner(0x0f01);
  assert.equal(worldOk.readUInt16BE(4), 0x0f01);
  assert.equal(worldOk.readUInt8(6), 1);
  const gridOk = buildWorldDataResponseInner(0x0f03);
  assert.equal(gridOk.readUInt8(6), 1);
  // a data object (InformationSession 0x0305) keeps a leading count of 0
  const data = buildWorldDataResponseInner(0x0305);
  assert.equal(data.readUInt16BE(4), 0x0305);
  assert.equal(data.readUInt8(6), 0);
});

test('G145 world-build crash-fix builders carry the matching char id', () => {
  // 0x0204 SSCharacterIDResponce -> client+0x3584a0 = char id
  const charId = buildSsCharacterIdResponseInner({ characterId: 7 });
  assert.equal(charId.readUInt16BE(4), 0x0204);
  assert.equal(charId.readUInt32LE(6), 7);

  // 0x0323 ResponseInformationCharacter: 724-byte record, [0..3] = char id (matched)
  const rec = buildInformationCharacterRecordInner({ characterId: 7 });
  assert.equal(rec.length, 6 + 0x02d4);
  assert.equal(rec.readUInt16BE(4), 0x0323);
  assert.equal(rec.readUInt32LE(6), 7); // record[0] compared to client+0x3584a0

  // enriched record: real fields at the binary-evidenced 0x0323 offsets (docs/logh7-info-records-wire.md)
  const rec2 = buildInformationCharacterRecordInner({
    characterId: 9, gridUnitId: 0x1234, power: 1, spot: 42, spotOwner: 1, online: true,
    abilities: [101, 32, 93, 70, 93, 96, 74, 95], // Reinhard's recovered IV EX 8-stat block
  });
  const p2 = rec2.subarray(6);
  assert.equal(p2.readUInt32LE(0x00), 9); // id anchor
  assert.equal(p2.readUInt32LE(0x24), 0x1234); // flagship/grid-unit anchor preserved
  assert.equal(p2.readUInt8(0x04), 1); // power (faction)
  assert.equal(p2.readUInt32LE(0x1c), 42); // spot (current system)
  assert.equal(p2.readUInt8(0x64), 1); // online
  assert.equal(p2.readUInt16LE(0x188), 101); // ability_8[0].point = 統率 (Reinhard 101)
  assert.equal(p2.readUInt16LE(0x188 + 7 * 4), 95); // ability_8[7].point = 防御

  // name/rank/face in the parentage[0] sub-record @0x80 (lastname@0x82, firstname@0x9e, rank@0xd6, face@0xf4)
  const rec3 = buildInformationCharacterRecordInner({
    characterId: 11, lastname: 'AB', firstname: 'C', rank: 10, face: 209,
  });
  const p3 = rec3.subarray(6);
  assert.equal(p3.readUInt8(0x81), 2); // lastname length
  assert.equal(p3.readUInt16LE(0x82), 'A'.charCodeAt(0));
  assert.equal(p3.readUInt16LE(0x84), 'B'.charCodeAt(0));
  assert.equal(p3.readUInt8(0x9c), 1); // firstname length
  assert.equal(p3.readUInt16LE(0x9e), 'C'.charCodeAt(0));
  assert.equal(p3.readUInt16LE(0xd6), 10); // rank
  assert.equal(p3.readUInt32LE(0xf4), 209); // face (portrait pool index)

  // 0x0315 grid: 2x2 all type 0 -> one RLE pair run=4
  const grid = buildStaticInformationGridInner({ width: 2, height: 2 });
  assert.equal(grid.readUInt16BE(4), 0x0315);
  const gp = grid.subarray(6);
  assert.equal(gp.readUInt8(0), 2); // width
  assert.equal(gp.readUInt8(1), 2); // height
  assert.equal(gp.readUInt16LE(2), 2); // 2 rle bytes = 1 pair
  assert.equal(gp.readUInt8(4), 4); // run = 4 cells
  assert.equal(gp.readUInt8(5), 0); // grid type 0
});

test('buildStaticInformationGridInner places a fleet cell and pads to the fixed 5004-byte record', () => {
  // 100x50 board with one object value 5 at cell (col=10,row=20). The decoder validates sum(run)==5000,
  // so the runs must be: [pos*5 of 0] ... [1 of 5] ... [rest of 0], total 5000.
  const grid = buildStaticInformationGridInner({ width: 100, height: 50, cells: [{ col: 10, row: 20, value: 5 }] });
  assert.equal(grid.readUInt16BE(4), 0x0315);
  assert.equal(grid.length, 6 + SS_RESP_STATIC_GRID_BYTES); // fixed 5004-byte record (zero-padded)
  const gp = grid.subarray(6);
  assert.equal(gp.readUInt8(0), 100); // width
  assert.equal(gp.readUInt8(1), 50); // height
  // Decode the RLE back and confirm sum(run)==5000 and the placed cell holds value 5.
  const rleBytes = gp.readUInt16LE(2);
  const decoded = new Uint8Array(5000);
  let pos = 0;
  for (let k = 0; k < rleBytes; k += 2) {
    const run = gp.readUInt8(4 + k);
    const value = gp.readUInt8(4 + k + 1);
    decoded.fill(value, pos, pos + run);
    pos += run;
  }
  assert.equal(pos, 5000); // sum(run) == w*h
  assert.equal(decoded[20 * 100 + 10], 5); // the fleet cell carries object value 5
});

test('buildStaticInformationGridTypeInner lays object records so cell value v -> objectTable[v]', () => {
  // Object value 5 = a clickable fleet marker (class 3), content id 0x42, variant 1.
  const obj = buildStaticInformationGridTypeInner({ objects: [{ value: 5, contentId: 0x42, klass: 3, variant: 1 }] });
  assert.equal(obj.readUInt16BE(4), SS_RESP_STATIC_GRID_TYPE_CODE); // 0x0313
  assert.equal(obj.length, 6 + SS_RESP_STATIC_GRID_BYTES); // fixed 5004-byte record
  const op = obj.subarray(6);
  // Object table proper starts 1 byte in; record for value v is at 1 + v*3.
  const off = 1 + 5 * 3;
  assert.equal(op.readUInt8(off), 0x42); // byte0 = content-record id
  assert.equal(op.readUInt8(off + 1), 3); // byte1 = class 3 (clickable marker)
  assert.equal(op.readUInt8(off + 2), 1); // byte2 = sprite/color variant
});

test('parseGenerateCharacterCharge decodes the create request (names, abilities, face)', () => {
  const inner = Buffer.alloc(2 + 0x80);
  inner.writeUInt16BE(CMD_GENERATE_CHARGE_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(0, 0x00); // request_category
  body.writeUInt8(2, 0x08); // power (faction)
  body.writeUInt8(1, 0x09); // blood
  body.writeUInt8(0, 0x0a); // sex
  const last = 'Yang';
  body.writeUInt8(last.length, 0x0b);
  [...last].forEach((ch, i) => body.writeUInt16LE(ch.charCodeAt(0), 0x0c + i * 2));
  const first = 'Wenli';
  body.writeUInt8(first.length, 0x26);
  [...first].forEach((ch, i) => body.writeUInt16LE(ch.charCodeAt(0), 0x28 + i * 2));
  body.writeUInt32LE(42, 0x4c); // face
  [80, 70, 99, 95, 60, 50, 40, 55].forEach((v, i) => body.writeUInt8(v, 0x50 + i));
  body.writeUInt8(3, 0x58); // bonus_point

  const req = parseGenerateCharacterCharge(inner);
  assert.equal(req.power, 2);
  assert.equal(req.blood, 1);
  assert.equal(req.lastname, 'Yang');
  assert.equal(req.firstname, 'Wenli');
  assert.equal(req.face, 42);
  assert.deepEqual(req.abilities, [80, 70, 99, 95, 60, 50, 40, 55]);
  assert.equal(req.bonusPoint, 3);
});

test('buildGenerateCharacterChargeOkInner echoes 0x1008 with the new id and success status', () => {
  const ok = buildGenerateCharacterChargeOkInner({ characterId: 0x2a, status: 1 });
  assert.equal(ok.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
  assert.equal(ok.length, 6 + 0x80); // 0x20-dword (128-byte) record
  assert.equal(ok.readUInt32LE(6), 0x2a); // new character id
  assert.equal(ok.readUInt32LE(10), 1); // status
});

test('buildNotifyMovedGridInner builds a 0x0b07 strategic move with a stride-8 unit array', () => {
  const inner = buildNotifyMovedGridInner({ units: [{ unitId: 0x01000007, cell: 2550 }] });
  assert.equal(inner.readUInt16BE(4), NOTIFY_MOVED_GRID_CODE); // 0x0b07
  const p = inner.subarray(6);
  assert.equal(p.length, 0x244); // 580-byte fixed body
  assert.equal(p.readUInt8(0x12), 1); // unitCount
  assert.equal(p.readUInt32LE(0x14), 0x01000007); // unit[0].unitId
  assert.equal(p.readUInt32LE(0x18), 2550); // unit[0].cell
});

test('buildResponseTimeInner returns a non-zero message32 ResponseTime (G143 world-clock)', () => {
  const inner = buildResponseTimeInner();
  // [u32 BE prefix 0][u16 BE 0x0301][u32 LE serverTime]
  assert.equal(inner.readUInt32BE(0), 0);
  assert.equal(inner.readUInt16BE(4), 0x0301);
  assert.notEqual(inner.readUInt32LE(6), 0);
  assert.equal(buildResponseTimeInner({ serverTime: 0x12345678 }).readUInt32LE(6), 0x12345678);
});

test('world Information replies are message32 objects of the FUN_004b8b00 sizes (G138 next gate)', () => {
  const session = buildWorldInformationSessionInner();
  assert.equal(session.length, 6 + SS_RESP_INFO_SESSION_PAYLOAD_BYTES); // 0x520a
  assert.equal(session.readUInt32BE(0), 0); // message32 prefix
  assert.equal(session.readUInt16BE(4), SS_RESP_INFO_SESSION_CODE); // 0x0305
  assert.equal(session.readUInt8(6), 0); // leading count -> empty world

  const character = buildWorldInformationCharacterInner();
  assert.equal(character.length, 6 + SS_RESP_INFO_CHARACTER_PAYLOAD_BYTES); // 0xe5b2
  assert.equal(character.readUInt16BE(4), SS_RESP_INFO_CHARACTER_CODE); // 0x0307
  assert.equal(character.subarray(6).every((byte) => byte === 0), true);
});

test('selectSsResponseInner keeps raw by default and rewraps on message32', () => {
  const raw = buildSsLoginOkInner({ status: 1 });
  const asRaw = selectSsResponseInner({ rawOkInner: raw, format: undefined });
  assert.equal(asRaw.ssFormat, 'raw');
  assert.equal(asRaw.okInner, raw);

  const asMessage32 = selectSsResponseInner({ rawOkInner: raw, format: 'message32' });
  assert.equal(asMessage32.ssFormat, 'message32');
  assert.equal(asMessage32.okInner.toString('hex'), '00000000020101');
  assert.equal(asMessage32.okInner.readUInt16BE(4), SS_LOGIN_OK_CODE);
});

test('buildNotifyTurnedShipInner builds a 12-byte 0x0424 with shipId at dword1', () => {
  const inner = buildNotifyTurnedShipInner({ shipId: 7, field0: 0x11, field2: 0x22 });
  assert.equal(inner.readUInt32BE(0), 0); // message32 leading zero
  assert.equal(inner.readUInt16BE(4), NOTIFY_TURNED_SHIP_CODE);
  const payload = inner.subarray(6);
  assert.equal(payload.length, 0x0c);
  assert.equal(payload.readUInt32LE(0), 0x11); // field0
  assert.equal(payload.readUInt32LE(4), 7); // shipId
  assert.equal(payload.readUInt32LE(8), 0x22); // field2
});

test('buildNotifyMovedShipInner builds a 28-byte 0x0423 with shipId + float position', () => {
  const inner = buildNotifyMovedShipInner({ shipId: 7, x: 1.5, y: -2, z: 3, moveParam: 5 });
  assert.equal(inner.readUInt16BE(4), NOTIFY_MOVED_SHIP_CODE);
  const payload = inner.subarray(6);
  assert.equal(payload.length, 0x1c);
  assert.equal(payload.readUInt32LE(4), 7); // shipId
  assert.equal(payload.readUInt32LE(8), 5); // moveParam
  assert.equal(payload.readFloatLE(12), 1.5); // x
  assert.equal(payload.readFloatLE(16), -2); // y
  assert.equal(payload.readFloatLE(20), 3); // z
  assert.equal(payload.readUInt8(24), 0xff); // stateByte default (<0 => position move)
});

test('wrapRawInnerAsMessage32 converts a raw client command inner to message32 for relay', () => {
  // Client->server in-world command is raw [u16 BE code][payload]; the relay must deliver it to
  // other clients as message32 [u32 0][u16 BE code][payload] (the conn3 server->client form).
  const rawChat = Buffer.concat([
    Buffer.from('0f1c', 'hex'), // CommandGridChat code (BE) at offset 0
    Buffer.from('00000001cafebabe', 'hex'), // payload
  ]);
  const wrapped = wrapRawInnerAsMessage32(rawChat);
  assert.equal(wrapped.readUInt32BE(0), 0); // message32 leading zero
  assert.equal(wrapped.readUInt16BE(4), 0x0f1c); // code preserved at offset 4
  assert.equal(wrapped.subarray(6).toString('hex'), '00000001cafebabe'); // payload intact
  assert.equal(wrapped.length, 6 + 8);
});

test('buildCommandGridChatInner builds a 140-byte 0x0f1c chat (msgLen + wide chars)', () => {
  const inner = buildCommandGridChatInner({ text: 'HI', channel: 7 });
  assert.equal(inner.readUInt16BE(4), COMMAND_GRID_CHAT_CODE);
  const payload = inner.subarray(6);
  assert.equal(payload.length, 0x8c); // 140
  assert.equal(payload.readUInt32LE(4), 7); // channel
  assert.equal(payload.readUInt8(9), 2); // msgLen = 'HI'.length
  assert.equal(payload.readUInt16LE(10), 'H'.charCodeAt(0)); // wide char H
  assert.equal(payload.readUInt16LE(12), 'I'.charCodeAt(0)); // wide char I
});

test('buildResponseTacticsInformationInner builds a 0x33b tactical unit table (count + 52B entries)', () => {
  const inner = buildResponseTacticsInformationInner({
    units: [{ unitId: 0x01000000, controllable: 1, mapSection: 0x01000000, x: 1.5, y: 2.5, z: 3.5, heading: 0.25 }],
  });
  assert.equal(inner.readUInt16BE(4), SS_RESP_TACTICS_INFO_CODE);
  const body = inner.subarray(6);
  assert.equal(body.length, SS_RESP_TACTICS_INFO_BYTES); // fixed 0x79e4 = 31204
  assert.equal(body.readUInt16LE(0), 1); // count
  const base = 4; // entry[0] at body+4 (clientBase+0x4271ac)
  assert.equal(body.readUInt32LE(base + 0), 0x01000000); // unitId
  assert.equal(body.readUInt32LE(base + 4), 1); // controllable
  assert.equal(body.readUInt32LE(base + 8), 0x01000000); // mapSection
  assert.equal(body.readFloatLE(base + 12), 1.5); // x
  assert.equal(body.readFloatLE(base + 16), 2.5); // y
  assert.equal(body.readFloatLE(base + 20), 3.5); // z
  assert.equal(body.readFloatLE(base + 24), 0.25); // heading
});

test('buildResponseTacticsInformationInner defaults mapSection to unitId and emits one entry by default', () => {
  const inner = buildResponseTacticsInformationInner({ units: [{ unitId: 7 }] });
  const body = inner.subarray(6);
  assert.equal(body.readUInt16LE(0), 1);
  assert.equal(body.readUInt32LE(4 + 0), 7); // unitId
  assert.equal(body.readUInt32LE(4 + 4), 1); // controllable default 1
  assert.equal(body.readUInt32LE(4 + 8), 7); // mapSection defaults to unitId
  // a second entry sits exactly one stride later
  const two = buildResponseTacticsInformationInner({ units: [{ unitId: 7 }, { unitId: 9 }] });
  assert.equal(two.subarray(6).readUInt16LE(0), 2);
  assert.equal(two.subarray(6).readUInt32LE(4 + TACTICS_UNIT_ENTRY_STRIDE), 9); // entry[1].unitId
});

test('buildNotifyEnterGridBegin/End build 1-byte 0xb09/0xb0a notifies', () => {
  const begin = buildNotifyEnterGridBeginInner({ value: 1 });
  assert.equal(begin.readUInt16BE(4), NOTIFY_ENTER_GRID_BEGIN_CODE);
  assert.equal(begin.subarray(6).length, 1);
  assert.equal(begin.subarray(6).readUInt8(0), 1);
  const end = buildNotifyEnterGridEndInner({ value: 1 });
  assert.equal(end.readUInt16BE(4), NOTIFY_ENTER_GRID_END_CODE);
  assert.equal(end.subarray(6).readUInt8(0), 1);
});
