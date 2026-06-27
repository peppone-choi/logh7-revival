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
  buildInformationUnitRecordInner,
  SS_RESP_INFO_UNIT_BYTES,
  SS_RESP_INFO_UNIT_STRIDE,
  SS_RESP_INFO_UNIT_HEADER,
  UNIT_BOATS_MAX,
  buildStaticInformationGridInner,
  buildStaticInformationGridTypeInner,
  buildStrategicGalaxyGrid,
  strategicGalaxyCanonCell,
  parsePassableCells,
  STRATEGIC_GRID_WIDTH,
  STRATEGIC_GRID_HEIGHT,
  TERRAIN_VALUE,
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
  assert.equal(cursor, 0xba);
  cursor = writeExpectedChargeRecord(expected, cursor, {
    id: 8,
    status: 2,
    name: 'Reinhard',
    description: 'Admiral',
  });
  assert.equal(cursor, 0x14d);
  assert.equal(expected.readUInt8(0x64), 2);
  assert.equal(expected.readUInt8(0x65), 1);
  assert.equal(expected.readUInt8(0x103), 2);
  assert.equal(expected.readUInt8(0x104), 1);

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

test('buildLobbyInformationCharacterChargeInner emits charged-character detail fields', () => {
  const inner = buildLobbyInformationCharacterChargeInner({
    characters: [{
      id: 42,
      status: 1,
      name: 'Friedrich IV',
      description: 'Ready',
      power: 0x500,
      camp: 0x500,
      generated: 1,
      sex: 1,
      birthdayMonth: 1,
      birthdayDay: 10,
      state: 2,
      abilities: [72, 95, 93, 92, 111, 101, 105, 81],
      lastname: 'Friedrich IV',
      firstname: '',
      displayName: 'Friedrich IV',
    }],
  });
  const payload = inner.subarray(6);
  const detail = writeExpectedChargePrefix(Buffer.alloc(256), 1, {
    id: 42,
    status: 1,
    name: 'Friedrich IV',
    description: 'Ready',
  });

  assert.equal(payload.readUInt8(0), 1);
  assert.equal(payload.readUInt32LE(detail), 42);
  assert.equal(payload.readUInt8(detail + 4), 1); // content nation 0x500 -> client power byte
  assert.equal(payload.readUInt8(detail + 5), 1);
  assert.equal(payload.readUInt8(detail + 6), 1);
  assert.equal(payload.readUInt8(detail + 7), 1);
  assert.equal(payload.readUInt8(detail + 8), 1);
  assert.equal(payload.readUInt8(detail + 9), 10);
  assert.equal(payload.readUInt32LE(detail + 10), 0);
  assert.equal(payload.readUInt8(detail + 14), 2);
  for (let i = 0; i < 8; i += 1) {
    assert.equal(payload.readUInt16LE(detail + 15 + i * 2), [72, 95, 93, 92, 111, 101, 105, 81][i]);
  }
  let stringCursor = detail + 31;
  let parsed = readExpectedUtf16FieldBE(payload, stringCursor);
  assert.equal(parsed.value, 'Friedrich IV');
  stringCursor = parsed.next;
  parsed = readExpectedUtf16FieldBE(payload, stringCursor);
  assert.equal(parsed.value, '');
  stringCursor = parsed.next;
  parsed = readExpectedUtf16FieldBE(payload, stringCursor);
  assert.equal(parsed.value, 'Friedrich IV');
});

function writeExpectedChargeRecord(target, cursor, { id, status, name, description }) {
  cursor = writeExpectedChargePrefix(target, cursor, { id, status, name, description });
  return writeExpectedChargedCharacterDetail(target, cursor, { id, name });
}

function writeExpectedChargePrefix(target, cursor, { id, status, name, description }) {
  target.writeUInt16LE(id, cursor);
  cursor += 2;
  target.writeUInt8(status, cursor);
  cursor += 1;
  cursor = writeExpectedUtf16FieldBE(target, cursor, name);
  cursor = writeExpectedUtf16FieldBE(target, cursor, description);
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
  return cursor;
}

function writeExpectedChargedCharacterDetail(target, cursor, { id, name }) {
  target.writeUInt32LE(id, cursor);
  cursor += 4;
  target.writeUInt8(1, cursor);
  cursor += 1; // power
  target.writeUInt8(1, cursor);
  cursor += 1; // camp
  target.writeUInt8(1, cursor);
  cursor += 1; // generated
  target.writeUInt8(0, cursor);
  cursor += 1; // sex unknown
  target.writeUInt8(0, cursor);
  cursor += 1; // birthday month unknown
  target.writeUInt8(0, cursor);
  cursor += 1; // birthday day unknown
  target.writeUInt32LE(0, cursor);
  cursor += 4;
  target.writeUInt8(1, cursor);
  cursor += 1; // state
  for (let i = 0; i < 8; i += 1) {
    target.writeUInt16LE(0, cursor);
    cursor += 2;
  }
  cursor = writeExpectedUtf16FieldBE(target, cursor, name);
  cursor = writeExpectedUtf16FieldBE(target, cursor, '');
  cursor = writeExpectedUtf16FieldBE(target, cursor, name);
  return cursor;
}

function writeExpectedUtf16FieldLE(target, cursor, value) {
  const text = `${value}\0`;
  target.writeUInt8([...text].length, cursor);
  cursor += 1;
  target.write(text, cursor, 'utf16le');
  return cursor + Buffer.byteLength(text, 'utf16le');
}

function writeExpectedUtf16FieldBE(target, cursor, value) {
  const text = `${value}\0`;
  target.writeUInt8([...text].length, cursor);
  cursor += 1;
  for (const unit of [...text]) {
    target.writeUInt16BE(unit.codePointAt(0) ?? 0, cursor);
    cursor += 2;
  }
  return cursor;
}

function readExpectedUtf16FieldLE(source, cursor) {
  const units = source.readUInt8(cursor);
  let value = '';
  for (let index = 0; index < Math.max(0, units - 1); index += 1) {
    value += String.fromCharCode(source.readUInt16LE(cursor + 1 + index * 2));
  }
  return { value, next: cursor + 1 + units * 2 };
}

function readExpectedUtf16FieldBE(source, cursor) {
  const units = source.readUInt8(cursor);
  let value = '';
  for (let index = 0; index < Math.max(0, units - 1); index += 1) {
    value += String.fromCharCode(source.readUInt16BE(cursor + 1 + index * 2));
  }
  return { value, next: cursor + 1 + units * 2 };
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
    state: 2, pcp: 1200, mcp: 3400, fame: 77, money: 50000, influence: 88, stamina: 100,
    abilities: [101, 32, 93, 70, 93, 96, 74, 95], // Reinhard's recovered IV EX 8-stat block
  });
  const p2 = rec2.subarray(6);
  assert.equal(p2.readUInt32LE(0x00), 9); // id anchor
  assert.equal(p2.readUInt32LE(0x24), 0x1234); // flagship/grid-unit anchor preserved
  assert.equal(p2.readUInt8(0x04), 1); // power (faction)
  assert.equal(p2.readUInt8(0x06), 2); // state (HUD validity gate)
  assert.equal(p2.readUInt32LE(0x10), 77); // fame
  assert.equal(p2.readUInt32LE(0x1c), 42); // spot (current system)
  assert.equal(p2.readUInt8(0x64), 1); // online
  assert.equal(p2.readUInt32LE(0x50), 1200); // PCP / stat_0x50
  assert.equal(p2.readUInt32LE(0x54), 3400); // MCP / stat_0x54
  assert.equal(p2.readUInt32LE(0x68), 50000); // money
  assert.equal(p2.readUInt16LE(0x188), 101); // ability_8[0].point = 統率 (Reinhard 101)
  assert.equal(p2.readUInt16LE(0x188 + 7 * 4), 95); // ability_8[7].point = 防御
  assert.equal(p2.readUInt8(0x1a8), 88); // influence
  assert.equal(p2.readUInt8(0x1a9), 100); // 体力(stamina) @0x1a9 — 만체력 시드
  // stamina 미지정 시 0x1a9는 0(코덱은 명시값만 기록; 만체력 기본은 session 계층이 주입)
  assert.equal(buildInformationCharacterRecordInner({ characterId: 1 }).subarray(6).readUInt8(0x1a9), 0);

  // name/rank/title/face in the parentage[0] sub-record @0x80 (lastname@0x82, firstname@0x9e,
  // rank@0xd6, titlename_len@0xd8/chars@0xda, face@0xf4 — docs/logh7-info-records-wire.md parentage[])
  const rec3 = buildInformationCharacterRecordInner({
    characterId: 11, lastname: 'AB', firstname: 'C', displayName: 'ABC', rank: 10, title: '공작', face: 209,
    spotResolverBase: 70,
  });
  const p3 = rec3.subarray(6);
  assert.equal(p3.readUInt8(0x7d), 1); // parentage_len
  assert.equal(p3.readUInt8(0x80), 1); // parentage[0].truth
  assert.equal(p3.readUInt8(0x81), 2); // lastname length
  assert.equal(p3.readUInt16LE(0x82), 'A'.charCodeAt(0));
  assert.equal(p3.readUInt16LE(0x84), 'B'.charCodeAt(0));
  assert.equal(p3.readUInt8(0x9c), 1); // firstname length
  assert.equal(p3.readUInt16LE(0x9e), 'C'.charCodeAt(0));
  assert.equal(p3.readUInt8(0xb8), 3); // display_name length
  assert.equal(p3.readUInt16LE(0xba), 'A'.charCodeAt(0));
  assert.equal(p3.readUInt16LE(0xba + 2), 'B'.charCodeAt(0));
  assert.equal(p3.readUInt16LE(0xba + 4), 'C'.charCodeAt(0));
  assert.equal(p3.readUInt16LE(0xd6), 10); // rank
  assert.equal(p3.readUInt8(0xd8), 2); // titlename length (공작 = 2 UCS-2 units)
  assert.equal(p3.readUInt16LE(0xda), '공'.charCodeAt(0)); // titlename chars @0xda
  assert.equal(p3.readUInt16LE(0xda + 2), '작'.charCodeAt(0));
  assert.equal(p3.readUInt32LE(0xf4), 209); // face (portrait pool index)
  assert.equal(p3.readUInt32LE(0x100), 70); // source +0x100 -> PLAYER_INFO +0x120 spot resolver base

  // title is independent: a record with ONLY a title (no name/rank) still emits parentage[0] so the
  // 작위명 surfaces (the client skips the whole sub-record when parentage_len stays 0).
  const recTitle = buildInformationCharacterRecordInner({ characterId: 12, title: '백작' });
  const pt = recTitle.subarray(6);
  assert.equal(pt.readUInt8(0x7d), 1); // parentage_len forced by title-only
  assert.equal(pt.readUInt8(0xd8), 2); // titlename length
  assert.equal(pt.readUInt16LE(0xda), '백'.charCodeAt(0));

  // 0x0315 grid: 2x2 all type 0 -> one RLE pair run=4
  const grid = buildStaticInformationGridInner({ width: 2, height: 2 });
  assert.equal(grid.readUInt16BE(4), 0x0315);
  const gp = grid.subarray(6);
  assert.equal(gp.readUInt8(0), 2); // width
  assert.equal(gp.readUInt8(1), 2); // height
  assert.equal(gp.readUInt16BE(2), 2); // 2 rle bytes = 1 pair, helper-read BE wire
  assert.equal(gp.readUInt8(4), 4); // run = 4 cells
  assert.equal(gp.readUInt8(5), 0); // grid type 0
});

test('buildInformationCharacterRecordInner writes 0x0323 seat/card entries at raw parser offsets', () => {
  const inner = buildInformationCharacterRecordInner({
    characterId: 1,
    seatEntries: [{ character: 0x1234, role: 0x55667788 }],
  });
  // RE-verified (docs/logh7-data-structures-re.md §1/§4): count u8 @0x24c, array @0x254 stride 8,
  // entry = {id/kind u32 @+0, value/role u32 @+4}. 0x250 is the gap between count and array.
  const payload = inner.subarray(6);
  assert.equal(payload.readUInt8(0x24c), 1);
  assert.equal(payload.readUInt32LE(0x254), 0x1234);
  assert.equal(payload.readUInt32LE(0x258), 0x55667788);

  const beInner = buildInformationCharacterRecordInner({
    characterId: 1,
    wireEndian: 'be',
    seatEntries: [{ character: 0x9abc, role: 0x56789abc }],
  });
  const bePayload = beInner.subarray(6);
  assert.equal(bePayload.readUInt8(0x24c), 1);
  assert.equal(bePayload.readUInt32BE(0x254), 0x9abc);
  assert.equal(bePayload.readUInt32BE(0x258), 0x56789abc);
});

test('world player live-memory builders keep the mixed endian fields pinned', () => {
  // G011/G006 live probes: identity/link anchors on 0x0204 and early 0x0323 need BE wire bytes.
  // G256 live QA proved early 0x0325 BE reaches the exact-count path and kills the client; default
  // 0x0325 stays LE while BE remains an explicit probe/post-load experiment.
  const charId = buildSsCharacterIdResponseInner({ characterId: 209, wireEndian: 'be' });
  assert.equal(charId.readUInt32BE(6), 209, '0x0204 wire dword is BE for live client memory');

  const unit = buildInformationUnitRecordInner({ unitId: 1, unitCount: 1 });
  const unitBody = unit.subarray(6);
  assert.equal(readUnitLeU16(unitBody, 0), 1, '0x0325 default unit count is LE wire');
  assert.equal(readUnitLeU32(unitBody, 4), 1, '0x0325 default unit id is LE wire');

  const record = buildInformationCharacterRecordInner({
    characterId: 209,
    gridUnitId: 1,
    state: 2,
    pcp: 1200,
    mcp: 3400,
    money: 50000,
    abilities: [101, 32, 93, 70, 93, 96, 74, 95],
    lastname: '라인',
    displayName: '라인',
    wireEndian: 'be',
  });
  const body = record.subarray(6);
  assert.equal(body.readUInt32BE(0x00), 209, '0x0323 character id is BE');
  assert.equal(body.readUInt32BE(0x24), 1, '0x0323 unit link is BE');
  assert.equal(body.readUInt32LE(0x50), 1200, 'PCP @0x50 is LE');
  assert.equal(body.readUInt32LE(0x54), 3400, 'MCP @0x54 is LE');
  assert.equal(body.readUInt32LE(0x68), 50000, 'money @0x68 is LE');
  assert.equal(body.readUInt16LE(0x188), 101, 'ability point @0x188 is LE');
  assert.equal(body.readUInt8(0x81), 2, '0x0323 lastname length is a byte');
  assert.equal(body.readUInt16LE(0x82), '라'.charCodeAt(0), '0x0323 text stays UTF-16LE');
  assert.equal(body.readUInt16LE(0x84), '인'.charCodeAt(0), '0x0323 text stays UTF-16LE');
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
  const rleBytes = gp.readUInt16BE(2);
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
  // The client parser reads byte 0 as count, then count sequential 3-byte records.
  assert.equal(op.readUInt8(0), 6); // records 0..5; zero fillers preserve value-index mapping
  // Object table proper starts after the count; record for value v is at 1 + v*3.
  const off = 1 + 5 * 3;
  assert.equal(op.readUInt8(off), 0x42); // byte0 = content-record id
  assert.equal(op.readUInt8(off + 1), 3); // byte1 = class 3 (clickable marker)
  assert.equal(op.readUInt8(off + 2), 1); // byte2 = sprite/color variant
});

// RLE-decode a 0x0315 cell inner back into the 100x50 grid (reuses the existing decoder loop).
function decodeCellGrid(cellInner) {
  const gp = cellInner.subarray(6);
  const rleBytes = gp.readUInt16BE(2);
  const decoded = new Uint8Array(5000);
  let pos = 0;
  for (let k = 0; k < rleBytes; k += 2) {
    const run = gp.readUInt8(4 + k);
    const value = gp.readUInt8(4 + k + 1);
    decoded.fill(value, pos, pos + run);
    pos += run;
  }
  return { decoded, pos };
}

test('buildStrategicGalaxyGrid projects systems to cells and marks each class 3', () => {
  const systems = [
    { cx: 0, cy: 0, faction: 'empire', contentId: 86 },
    { cx: 100, cy: 50, faction: 'alliance', contentId: 41 },
    { cx: 50, cy: 25, faction: 'neutral', contentId: 26 },
  ];
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({ systems });
  // both inners are the fixed 5004-byte record
  assert.equal(objectInner.length, 6 + SS_RESP_STATIC_GRID_BYTES);
  assert.equal(cellInner.length, 6 + SS_RESP_STATIC_GRID_BYTES);

  const { decoded, pos } = decodeCellGrid(cellInner);
  assert.equal(pos, 5000); // sum(run) == 100*50

  const op = objectInner.subarray(6);
  assert.equal(op.readUInt8(0), 7); // highest object value is 6, so parser reads records 0..6
  // systems get object values 4..(4+n-1); klass byte must be 3 and the projected cell must hold its value.
  systems.forEach((s, index) => {
    const value = 4 + index;
    // find the cell that carries this value (the projected, collision-resolved location)
    const cellIndex = decoded.indexOf(value);
    assert.ok(cellIndex >= 0, `system ${index} value ${value} present in cell grid`);
    assert.equal(decoded[cellIndex], value);
    // object record for this value: byte1 (klass) == 3
    assert.equal(op.readUInt8(1 + value * 3), s.contentId);
    assert.equal(op.readUInt8(1 + value * 3 + 1), 3);
  });
});

test('buildStrategicGalaxyGrid uses stellar spectral class for marker variants', () => {
  const systems = ['O', 'B', 'A', 'F', 'G', 'K', 'M'].map((spectralClass, index) => ({
    cx: index,
    cy: index,
    faction: index % 2 === 0 ? 'empire' : 'alliance',
    spectralClass,
  }));
  const { objectInner } = buildStrategicGalaxyGrid({ systems });
  const objectBody = objectInner.subarray(6);

  const variants = systems.map((_, index) => objectBody.readUInt8(1 + (4 + index) * 3 + 2));
  assert.deepEqual(variants, [0, 1, 2, 3, 4, 5, 6]);
});

test('buildStrategicGalaxyGrid: 기본은 함대를 오브젝트테이블 마커로 찍지 않는다 (RE P0, 0x0325 경로)', () => {
  // docs/logh7-fleet-render-re.md §1.1: 오브젝트테이블엔 함대 클래스가 없다(byte1∈{1,3}). 함대를 klass-3
  // 으로 박으면 가짜 성계 dot로 오인 렌더되므로, 기본(fleetAsMarker 미지정)은 함대 셀을 찍지 않는다.
  const systems = [{ cx: 1, cy: 1, faction: 'empire' }];
  const { cellInner } = buildStrategicGalaxyGrid({
    systems,
    fleetCell: { col: 60, row: 30 },
    fleetValue: 3,
    fleetContentId: 0x7,
  });
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[30 * 100 + 60], 0, '함대 셀에 가짜 마커 값이 찍히지 않음(기본)');
  // 시스템 마커(value 4)는 그대로 존재.
  assert.equal(decoded.includes(4), true, '성계 마커는 정상 배치');
  assert.equal(decoded.includes(3), false, '함대 value 3 마커 없음');
});

test('buildStrategicGalaxyGrid: fleetAsMarker:true 레거시 경로는 옛 klass-3 마커를 그대로 찍는다(회귀비교용)', () => {
  const systems = [{ cx: 1, cy: 1, faction: 'empire' }];
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({
    systems,
    fleetCell: { col: 60, row: 30 },
    fleetValue: 3,
    fleetContentId: 0x7,
    fleetAsMarker: true,
  });
  const op = objectInner.subarray(6);
  assert.equal(op.readUInt8(0), 5); // records 0..4 include zero fillers, fleet value 3, system value 4
  assert.equal(op.readUInt8(1 + 3 * 3 + 1), 3); // fleet object value 3 → klass 3
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[30 * 100 + 60], 3); // fleet cell carries value 3
});

test('buildStrategicGalaxyGrid caps to <=85 systems so object values stay <=88', () => {
  // 90 synthetic systems spread across the plane; builder must slice to <=85 (values 4..88).
  const systems = Array.from({ length: 90 }, (_, i) => ({ cx: i, cy: i % 47, faction: 'neutral' }));
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({ systems });
  assert.equal(objectInner.length, 6 + SS_RESP_STATIC_GRID_BYTES); // no overflow
  assert.equal(objectInner.subarray(6).readUInt8(0), 89); // records 0..88
  const { decoded, pos } = decodeCellGrid(cellInner);
  assert.equal(pos, 5000);
  // the highest assigned value is 4 + 84 = 88 (<=88), and no value exceeds 88
  assert.equal(decoded.every((v) => v <= 88), true);
  assert.equal(decoded.includes(88), true); // the 85th system (index 84) → value 88
  assert.equal(decoded.includes(89), false); // the 86th+ systems were sliced off
});

// --- Canon 星系図 cell projection (page-101 dot grid) ---

test('strategicGalaxyCanonCell reads canonCol/canonRow and rejects out-of-range/missing', () => {
  assert.deepEqual(strategicGalaxyCanonCell({ canonCol: 86, canonRow: 25 }), { col: 86, row: 25 });
  assert.deepEqual(strategicGalaxyCanonCell({ canon_col: 12, canon_row: 21 }), { col: 12, row: 21 });
  assert.equal(strategicGalaxyCanonCell({ cx: 1, cy: 2 }), null); // no canon cell
  assert.equal(strategicGalaxyCanonCell({ canonCol: 100, canonRow: 0 }), null); // col out of 0..99
  assert.equal(strategicGalaxyCanonCell({ canonCol: 0, canonRow: 50 }), null); // row out of 0..49
});

test('parsePassableCells expands rowRangesByRow and plain pair/object lists losslessly', () => {
  const fromRanges = parsePassableCells({ rowRangesByRow: { 5: [[3, 5], [10, 10]] } });
  assert.equal(fromRanges.has('3,5'), true);
  assert.equal(fromRanges.has('4,5'), true);
  assert.equal(fromRanges.has('5,5'), true);
  assert.equal(fromRanges.has('10,5'), true);
  assert.equal(fromRanges.has('6,5'), false);
  assert.equal(fromRanges.size, 4);
  assert.equal(parsePassableCells([[1, 2], [3, 4]]).has('1,2'), true);
  assert.equal(parsePassableCells([{ col: 7, row: 8 }]).has('7,8'), true);
  assert.equal(parsePassableCells(null).size, 0);
});

test('buildStrategicGalaxyGrid places canon cells DIRECTLY (no linear warp)', () => {
  // Two faction capitals at their real page-101 dot cells. Linear normalization would have warped
  // them toward the centre; the canon path must keep them at their exact cells.
  const systems = [
    { system: 'ヴァルハラ', faction: 'empire', canonCol: 86, canonRow: 25, cx: 100, cy: 700 },
    { system: 'バーラト', faction: 'alliance', canonCol: 12, canonRow: 21, cx: 200, cy: 100 },
  ];
  const { cellInner } = buildStrategicGalaxyGrid({ systems });
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[25 * 100 + 86], 4, 'ヴァルハラ at canon cell (86,25) holds object value 4');
  assert.equal(decoded[21 * 100 + 12], 5, 'バーラト at canon cell (12,21) holds object value 5');
});

test('buildStrategicGalaxyGrid keeps systems out of non-navigable cells via the passable mask', () => {
  // A canon cell that is NOT in the mask must be nudged onto the nearest passable cell, never left in
  // black space. Mask: only (87,25) navigable near the requested (86,25).
  const passableCells = parsePassableCells({ rowRangesByRow: { 25: [[87, 90]] } });
  const systems = [{ system: 'X', faction: 'empire', canonCol: 86, canonRow: 25 }];
  const { cellInner } = buildStrategicGalaxyGrid({ systems, passableCells });
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[25 * 100 + 86], 0, 'requested (86,25) is non-navigable -> not used');
  assert.equal(decoded[25 * 100 + 87], 4, 'snapped to nearest passable cell (87,25)');
});

test('buildStrategicGalaxyGrid nudges colliding canon cells onto distinct passable cells', () => {
  // Two systems share a canon cell; the second must move to the next passable cell, not overwrite.
  const passableCells = parsePassableCells({ rowRangesByRow: { 10: [[5, 8]] } });
  const systems = [
    { system: 'A', faction: 'empire', canonCol: 5, canonRow: 10 },
    { system: 'B', faction: 'empire', canonCol: 5, canonRow: 10 },
  ];
  const { cellInner } = buildStrategicGalaxyGrid({ systems, passableCells });
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[10 * 100 + 5], 4, 'first system keeps the canon cell (5,10)');
  assert.equal(decoded[10 * 100 + 6], 5, 'second system nudged to next passable cell (6,10)');
  assert.equal(decoded.filter((v) => v === 4).length, 1);
  assert.equal(decoded.filter((v) => v === 5).length, 1);
});

test('buildStrategicGalaxyGrid snaps the fleet cell onto a navigable cell (fleetAsMarker 레거시)', () => {
  const passableCells = parsePassableCells({ rowRangesByRow: { 25: [[51, 55]] } });
  const { cellInner } = buildStrategicGalaxyGrid({
    systems: [],
    fleetCell: { col: 50, row: 25 }, // not in mask
    fleetValue: 3,
    fleetAsMarker: true,
    passableCells,
  });
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[25 * 100 + 50], 0, 'requested fleet cell (50,25) is non-navigable');
  assert.equal(decoded[25 * 100 + 51], 3, 'fleet snapped to nearest passable cell (51,25)');
});

// Oracle: the REAL content/galaxy.json + content/galaxy-passable-cells.json wiring.
test('canon galaxy oracle: capitals + corridors land on canon cells, none in non-navigable space', async () => {
  const { readFileSync } = await import('node:fs');
  const galaxy = JSON.parse(readFileSync(new URL('../../content/galaxy.json', import.meta.url), 'utf8'));
  const passableData = JSON.parse(readFileSync(new URL('../../content/galaxy-passable-cells.json', import.meta.url), 'utf8'));
  const passableCells = parsePassableCells(passableData);
  assert.ok(passableCells.size > 3000, 'passable mask recovered (~3771 cells)');

  const systems = galaxy.systems;
  assert.equal(systems.length, 80);
  // Known canon identities (P1, manual star-chart): Odin/Valhalla empire, Heinessen/Barlat alliance,
  // Fezzan neutral corridor, Iserlohn empire corridor.
  const byName = new Map(systems.map((s) => [s.system, s]));
  // 2026-06-21 page-101 별점 재추출 canon (이전 [86,25]/[12,21]은 재추출 전 stale 좌표).
  assert.deepEqual([byName.get('ヴァルハラ').canonCol, byName.get('ヴァルハラ').canonRow], [88, 25]);
  assert.deepEqual([byName.get('バーラト').canonCol, byName.get('バーラト').canonRow], [14, 20]);
  assert.equal(byName.get('フェザーン').is_corridor, 1, 'Fezzan flagged as corridor');
  assert.equal(byName.get('イゼルローン').is_corridor, 1, 'Iserlohn flagged as corridor');

  // Every canon cell is navigable.
  for (const s of systems) {
    assert.ok(passableCells.has(`${s.canonCol},${s.canonRow}`), `${s.system} canon cell is passable`);
  }

  // Build the grid the live session builds and confirm the markers land on the canon cells with no
  // marker in a non-navigable cell.
  const { cellInner } = buildStrategicGalaxyGrid({ systems, passableCells });
  const { decoded, pos } = decodeCellGrid(cellInner);
  assert.equal(pos, STRATEGIC_GRID_WIDTH * STRATEGIC_GRID_HEIGHT); // 5000 cells

  // The capital markers sit on their canon cells (first 80 systems take values 4..83 in array order).
  systems.forEach((s, index) => {
    if (index >= 85) return;
    const value = 4 + index;
    const cellIdx = s.canonRow * STRATEGIC_GRID_WIDTH + s.canonCol;
    // With the full canon mask there are no collisions, so each marker is exactly on its canon cell.
    assert.equal(decoded[cellIdx], value, `${s.system} marker on canon cell`);
  });

  // No non-zero marker may occupy a non-navigable cell.
  for (let row = 0; row < STRATEGIC_GRID_HEIGHT; row += 1) {
    for (let col = 0; col < STRATEGIC_GRID_WIDTH; col += 1) {
      const v = decoded[row * STRATEGIC_GRID_WIDTH + col];
      if (v !== 0) {
        assert.ok(passableCells.has(`${col},${row}`), `marker value ${v} at (${col},${row}) must be navigable`);
      }
    }
  }
});

// --- 지형 인코딩 (RE FUN_004d6310 항행성 게이트: byte1 ∈ {1,3}일 때만 항행 가능) ---

// 0x0313 object inner에서 objectTable[v] = {byte0,byte1,byte2}를 읽는다.
function objectRecord(objectInner, v) {
  const op = objectInner.subarray(6);
  const off = 1 + v * 3;
  return { byte0: op.readUInt8(off), byte1: op.readUInt8(off + 1), byte2: op.readUInt8(off + 2) };
}

test('terrain=false (default) keeps the legacy marker-only board: background cell value 0', () => {
  const passableCells = parsePassableCells({ rowRangesByRow: { 10: [[5, 8]] } });
  const systems = [{ system: 'A', faction: 'empire', canonCol: 5, canonRow: 10 }];
  const { cellInner } = buildStrategicGalaxyGrid({ systems, passableCells }); // terrain 없음
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[10 * 100 + 6], 0, 'passable-but-empty cell stays background 0 without terrain');
  assert.equal(decoded[0], 0, 'far background stays 0 without terrain');
});

test('terrain=true encodes 空間(1,class1 navigable)/航行不能(2,blocked)/markers(class3) byte-correctly', () => {
  // 마스크: row 10 cols 5..8 항행 가능; (5,10)에 성계 마커. 그 외 전부 항행 불가.
  const passableCells = parsePassableCells({ rowRangesByRow: { 10: [[5, 8]] } });
  const systems = [{ system: 'A', faction: 'empire', canonCol: 5, canonRow: 10, contentId: 9 }];
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({ systems, passableCells, terrain: true });
  const { decoded, pos } = decodeCellGrid(cellInner);
  assert.equal(pos, 5000, 'sum(run) == 100*50');

  // 항행 마스크 셀은 空間 = 값 1이 되고, 마커 셀만 자기 마커 값을 유지한다.
  assert.equal(decoded[10 * 100 + 6], TERRAIN_VALUE.SPACE, 'open navigable cell = value 1 (空間)');
  assert.equal(decoded[10 * 100 + 7], TERRAIN_VALUE.SPACE);
  assert.equal(decoded[10 * 100 + 5], 4, 'system marker keeps its value 4 (painted over terrain)');
  // 마스크 밖 셀은 航行不能 = 값 2.
  assert.equal(decoded[0], TERRAIN_VALUE.NON_NAVIGABLE, 'background = value 2 (航行不能)');
  assert.equal(decoded[20 * 100 + 50], TERRAIN_VALUE.NON_NAVIGABLE);

  // 항행성 게이트는 objectTable[V].byte1을 본다: SPACE=1(항행), NON_NAV=2(차단), 마커=3.
  assert.deepEqual(objectRecord(objectInner, TERRAIN_VALUE.SPACE), { byte0: 1, byte1: 1, byte2: 0 }, '空間: byte0=1 label, byte1=1 navigable');
  assert.deepEqual(objectRecord(objectInner, TERRAIN_VALUE.NON_NAVIGABLE), { byte0: 2, byte1: 2, byte2: 0 }, '航行不能: byte0=2 label, byte1=2 blocked');
  assert.equal(objectRecord(objectInner, 4).byte1, 3, 'system marker class 3 (navigable+clickable)');
  // 플라즈마 셀을 안 주면 플라즈마 오브젝트도 안 나온다.
  assert.equal(objectRecord(objectInner, TERRAIN_VALUE.PLASMA).byte1, 0, 'objectTable[0] left empty (no plasma cells)');
});

test('terrain=true with plasmaCells marks プラズマ嵐 (value 0, blocked, distinct label byte0=0)', () => {
  const passableCells = parsePassableCells({ rowRangesByRow: { 10: [[5, 9]] } });
  const plasmaCells = parsePassableCells({ rowRangesByRow: { 10: [[7, 7]] } }); // 레인 안 플라즈마 셀 1개
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({ systems: [], passableCells, terrain: true, plasmaCells });
  const { decoded } = decodeCellGrid(cellInner);
  assert.equal(decoded[10 * 100 + 6], TERRAIN_VALUE.SPACE, 'lane cell stays navigable space');
  assert.equal(decoded[10 * 100 + 7], TERRAIN_VALUE.PLASMA, 'plasma cell overrides space with value 0');
  // プラズマ嵐는 진입 불가(class ∉ {1,3})지만 자기 라벨 subId 0을 가진다.
  assert.deepEqual(objectRecord(objectInner, TERRAIN_VALUE.PLASMA), { byte0: 0, byte1: 2, byte2: 0 }, 'プラズマ嵐: byte0=0 label, byte1=2 blocked');
});

test('terrain oracle: real galaxy + real mask — every navigable cell is class 1 or 3, every other class blocks', async () => {
  const { readFileSync } = await import('node:fs');
  const galaxy = JSON.parse(readFileSync(new URL('../../content/galaxy.json', import.meta.url), 'utf8'));
  const passableData = JSON.parse(readFileSync(new URL('../../content/galaxy-passable-cells.json', import.meta.url), 'utf8'));
  const passableCells = parsePassableCells(passableData);
  const { objectInner, cellInner } = buildStrategicGalaxyGrid({
    systems: galaxy.systems,
    fleetCell: { col: 50, row: 25 },
    fleetValue: 3,
    passableCells,
    terrain: true,
  });
  const { decoded, pos } = decodeCellGrid(cellInner);
  assert.equal(pos, STRATEGIC_GRID_WIDTH * STRATEGIC_GRID_HEIGHT);

  // 항행성은 objectTable[V].byte1 ∈ {1,3}으로 결정. 게이트 결과가 마스크와 일치하는지 검증:
  // 셀은 항행 마스크 셀(空間)이거나 마커(성계/함대, 역시 마스크 위)일 때만 항행 가능하다.
  let navigable = 0;
  for (let row = 0; row < STRATEGIC_GRID_HEIGHT; row += 1) {
    for (let col = 0; col < STRATEGIC_GRID_WIDTH; col += 1) {
      const v = decoded[row * STRATEGIC_GRID_WIDTH + col];
      const cls = objectRecord(objectInner, v).byte1;
      const gateNavigable = cls === 1 || cls === 3;
      const inMask = passableCells.has(`${col},${row}`);
      assert.equal(gateNavigable, inMask, `cell (${col},${row}) value ${v} class ${cls}: navigable=${gateNavigable} must equal mask=${inMask}`);
      if (gateNavigable) navigable += 1;
    }
  }
  assert.equal(navigable, passableCells.size, 'navigable cell count equals the recovered mask size');
  // 모든 성계 마커는 항행 가능(class 3) 셀에 위치한다.
  assert.equal(objectRecord(objectInner, 4).byte1, 3);
});

// Encode a 0x1008 CommandGenerateCharacterCharge in the REAL packed wire form the live client emits
// (NUL-terminated UTF-16LE names written back-to-back; header power@0x05). Mirrors the capture decoded
// in docs/logh7-character-creation-wire.md §2.1. Returns the raw inner [u16 BE code][body].
function encodeGenerateCharacterCharge({
  requestCategory = 0,
  power = 0,
  blood = 0,
  sex = 0,
  lastname = '',
  firstname = '',
  face = 0,
  abilities = [],
  bonusPoint = 0,
  title = 0,
  rank = 0,
} = {}) {
  const inner = Buffer.alloc(2 + 0x80);
  inner.writeUInt16BE(CMD_GENERATE_CHARGE_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(requestCategory >>> 0, 0x00);
  body.writeUInt8(power & 0xff, 0x05);
  body.writeUInt8(blood & 0xff, 0x06);
  body.writeUInt8(sex & 0xff, 0x07);
  // Packed name: u8 len (real chars + 1 NUL) + pad byte, then UTF-16LE chars, then one NUL byte.
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
  // Fixed tail follows the packed firstname: face u32, ability_8[8], bonus_point, _, title, rank.
  body.writeUInt32LE(face >>> 0, off);
  for (let i = 0; i < 8; i += 1) body.writeUInt8(abilities[i] ?? 0, off + 4 + i);
  body.writeUInt8(bonusPoint & 0xff, off + 12);
  body.writeUInt8(title & 0xff, off + 14);
  body.writeUInt8(rank & 0xff, off + 15);
  return inner;
}

function readFixedPstr16(payload, lenOff, charsOff) {
  const len = payload.readUInt8(lenOff);
  let value = '';
  for (let i = 0; i < len; i += 1) value += String.fromCharCode(payload.readUInt16LE(charsOff + i * 2));
  return value;
}

function parseGenerateCharacterChargeOkWire(okInner) {
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

test('parseGenerateCharacterCharge decodes the packed create request (names, abilities, face)', () => {
  const inner = encodeGenerateCharacterCharge({
    power: 2,
    blood: 1,
    sex: 0,
    lastname: 'Yang',
    firstname: 'Wenli',
    face: 42,
    abilities: [80, 70, 99, 95, 60, 50, 40, 55],
    bonusPoint: 3,
  });

  const req = parseGenerateCharacterCharge(inner);
  assert.equal(req.power, 2);
  assert.equal(req.blood, 1);
  assert.equal(req.lastname, 'Yang');
  assert.equal(req.firstname, 'Wenli');
  assert.equal(req.face, 42);
  assert.deepEqual(req.abilities, [80, 70, 99, 95, 60, 50, 40, 55]);
  assert.equal(req.bonusPoint, 3);
});

test('parseGenerateCharacterCharge decodes the EXACT live client capture (Reinhard / Lohengramm)', () => {
  // Captured from the real unmodified client during live char-creation. Includes the 2-byte BE code
  // 1008 at the front; body = subarray(2). Names are NUL-terminated UTF-16LE; face/abilities tail = 0.
  // This is the regression case for the wire-offset misalignment bug (empty lastname rejection).
  const CAPTURE_HEX =
    '1008000000000002020009005200650069006e006800610072006400000b00' +
    '4c006f00680065006e006700720061006d006d00' +
    '00000000000000000000000000000000000000000000000000000000';
  const inner = Buffer.from(CAPTURE_HEX, 'hex');
  const req = parseGenerateCharacterCharge(inner);
  assert.equal(req.lastname, 'Reinhard');
  assert.equal(req.firstname, 'Lohengramm');
  assert.equal(req.face, 0);
  assert.equal(req.power, 2);
  assert.equal(req.blood, 2);
  assert.equal(req.sex, 0);
});

test('buildGenerateCharacterChargeOkInner returns the 128-byte client parser wire for the create record', () => {
  const requestInner = encodeGenerateCharacterCharge({
    requestCategory: 3,
    power: 2,
    blood: 3,
    sex: 1,
    lastname: 'Lee',
    firstname: 'Flow',
  });
  requestInner.subarray(2).writeUInt32LE(1, 4);
  const ok = buildGenerateCharacterChargeOkInner({
    requestInner,
    character: {
      power: 2,
      blood: 3,
      sex: 1,
      lastname: 'Lee',
      firstname: 'Flow',
      birthMonth: 1,
      birthDay: 1,
      face: 1000001,
      abilities: [41, 42, 43, 44, 45, 46, 47, 48],
      bonusPoint: 0,
      title: 2,
      rank: 4,
      createRankSubId: 0x0d,
      flagshipName: 'Echo',
      flagshipKind: 7,
      check: 1,
    },
  });
  assert.equal(ok.readUInt16BE(4), CMD_GENERATE_CHARGE_CODE);
  assert.equal(ok.length, 6 + 0x80); // client parser expands this 128-byte wire buffer into a 0x20-dword record
  const body = ok.subarray(6);
  assert.equal(body.readUInt32LE(0), 3);
  assert.equal(body.readUInt8(4), 1);
  assert.equal(body.readUInt8(5), 2); // power
  assert.equal(body.readUInt8(6), 3); // blood
  assert.equal(body.readUInt8(7), 1); // sex
  const parsed = parseGenerateCharacterChargeOkWire(ok);
  assert.equal(parsed.category, 3);
  assert.equal(parsed.status, 1);
  assert.equal(parsed.power, 2);
  assert.equal(parsed.blood, 3);
  assert.equal(parsed.sex, 1);
  assert.equal(parsed.lastname, 'Lee');
  assert.equal(parsed.firstname, 'Flow');
  assert.equal(parsed.birthMonth, 1);
  assert.equal(parsed.birthDay, 1);
  assert.equal(parsed.face, 1000001);
  assert.deepEqual(parsed.abilities, [41, 42, 43, 44, 45, 46, 47, 48]);
  assert.equal(parsed.title, 2);
  assert.equal(parsed.rank, 0x0d);
  assert.equal(parsed.flagshipName, 'Echo');
  assert.equal(parsed.flagshipKind, 7);
  assert.equal(parsed.check, 1);
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

// ===========================================================================
// A1: 0x0325 ResponseInformationUnit FULL 0x58 element (id/boats/commander/supply/cell/owner/
// faction/mapSection). WIRE-SHAPE tests prove the dual-parser-proven (P0) layout offsets; the
// DATA-SOURCE test asserts the builder fabricates NOTHING on its own (values come from the caller's
// A2 fleet entities = P3 seeds). The historic minimal form must stay byte-identical (no walk-stall).
// Element base B = payload + SS_RESP_INFO_UNIT_HEADER (4); stride SS_RESP_INFO_UNIT_STRIDE (0x58).
// ===========================================================================

test('A1 regression: minimal form (no fleets) writes only count and unit id', () => {
  // GREEN-guard: the default path (unitId/unitCount only) must not grow extra fields. Only
  // id@element[0]+0 and the count are non-zero.
  const inner = buildInformationUnitRecordInner({ unitId: 1, unitCount: 1 });
  assert.equal(inner.length, 6 + SS_RESP_INFO_UNIT_BYTES, 'fixed 52804B record + 6B header');
  const body = inner.subarray(6);
  assert.equal(readUnitLeU16(body, 0), 1, 'unit count @0');
  assert.equal(readUnitLeU32(body, SS_RESP_INFO_UNIT_HEADER + 0x00), 1, 'unit[0].id @element+0x00');
  // every byte beyond the id must remain zero (no element fields written in the minimal form)
  let nonZeroAfterId = 0;
  for (let i = SS_RESP_INFO_UNIT_HEADER + 0x04; i < body.length; i += 1) {
    if (body[i] !== 0) nonZeroAfterId += 1;
  }
  assert.equal(nonZeroAfterId, 0, 'minimal form writes nothing past unit[0].id (stub-identical)');
});

test('A1 probe-shape: count endian can be overridden while unit fields stay LE', () => {
  const inner = buildInformationUnitRecordInner({
    unitId: 1,
    unitCount: 1,
    countWireEndian: 'be',
    wireEndian: 'le',
  });
  const body = inner.subarray(6);
  assert.equal(readUnitBeU16(body, 0), 1, 'unit count follows the explicit probe endian');
  assert.equal(readUnitLeU32(body, SS_RESP_INFO_UNIT_HEADER + 0x00), 1, 'unit id remains LE-linked');
});

test('A1 parser-stream wire omits native count padding before unit id', () => {
  const inner = buildInformationUnitRecordInner({
    unitId: 1,
    unitCount: 1,
    wireLayout: 'parser-stream',
  });
  const body = inner.subarray(6);
  assert.equal(readUnitBeU16(body, 0), 1, 'parser stream count is BE before native storage');
  assert.equal(readUnitBeU32(body, 2), 1, 'unit id follows count immediately on the wire');
  assert.equal(readUnitBeU32(body, SS_RESP_INFO_UNIT_HEADER), 0x00010000, 'native-offset read shows the old pad assumption is invalid');
});

test('A1 wire-shape: full element places id/faction/commander/cell/owner at proven P0 offsets', () => {
  const inner = buildInformationUnitRecordInner({
    wireEndian: 'le',
    fleets: [{ id: 0x11223344, owner: 6, faction: 0x0500, commander: 209, cell: 2010, supply: 80, mapSection: 4, boats: [] }],
  });
  const body = inner.subarray(6);
  const B = SS_RESP_INFO_UNIT_HEADER; // element[0] base
  assert.equal(body.readUInt16LE(0), 1, 'unit count @0 == fleet count');
  assert.equal(body.readUInt32LE(B + 0x00), 0x11223344, 'id @B+0x00 (P0 anchor)');
  assert.equal(body.readUInt16LE(B + 0x04), 0x0500, 'faction @B+0x04 (u16)');
  assert.equal(body.readUInt32LE(B + 0x08), 209, 'commander @B+0x08 (u32)');
  assert.equal(body.readUInt32LE(B + 0x0c), 2010, 'cell @B+0x0c (u32)');
  assert.equal(body.readUInt32LE(B + 0x10), 6, 'owner @B+0x10 (u32)');
  assert.equal(body.readUInt32LE(B + 0x40), 80, 'spot/base resolver @B+0x40 (legacy supply fallback)');
  assert.equal(body.readUInt16LE(B + 0x48), 4, 'mapSection @B+0x48 (u16)');
});

test('A1 live-consumer: spotResolverBase overrides the legacy supply seed at B+0x40', () => {
  const inner = buildInformationUnitRecordInner({
    wireEndian: 'le',
    fleets: [{ id: 1, supply: 9999, spotResolverBase: 70 }],
  });
  const body = inner.subarray(6);
  const B = SS_RESP_INFO_UNIT_HEADER;
  assert.equal(body.readUInt32LE(B + 0x40), 70, 'FUN_004c2c80 consumes unit+0x40 as selected spot/base');
});

test('A1 wire-shape: boats list writes the troop_units count (u8 @B+0x14) + u32 id array (@B+0x18)', () => {
  const inner = buildInformationUnitRecordInner({
    wireEndian: 'le',
    fleets: [{ id: 1, boats: [101, 102, 103] }],
  });
  const body = inner.subarray(6);
  const B = SS_RESP_INFO_UNIT_HEADER;
  assert.equal(body.readUInt8(B + 0x14), 3, 'boats(troop_units) count @B+0x14');
  assert.equal(body.readUInt32LE(B + 0x18 + 0 * 4), 101, 'boats[0] @B+0x18');
  assert.equal(body.readUInt32LE(B + 0x18 + 1 * 4), 102, 'boats[1] @B+0x1c');
  assert.equal(body.readUInt32LE(B + 0x18 + 2 * 4), 103, 'boats[2] @B+0x20');
});

test('A1 wire-shape: boats list is capped at the parser limit (UNIT_BOATS_MAX = 10)', () => {
  assert.equal(UNIT_BOATS_MAX, 10);
  const boats = Array.from({ length: 14 }, (_, i) => 200 + i);
  const inner = buildInformationUnitRecordInner({ wireEndian: 'le', fleets: [{ id: 1, boats }] });
  const body = inner.subarray(6);
  const B = SS_RESP_INFO_UNIT_HEADER;
  assert.equal(body.readUInt8(B + 0x14), 10, 'count clamped to 10 (client "troop_units_size > 10")');
  assert.equal(body.readUInt32LE(B + 0x18 + 9 * 4), 209, 'boats[9] (last kept) @B+0x18+36');
  assert.equal(body.readUInt32LE(B + 0x18 + 10 * 4), 0, 'boats[10] (dropped) stays zero');
});

test('A1 wire-shape: multiple fleets are laid out at stride 0x58 (88B) each', () => {
  const inner = buildInformationUnitRecordInner({
    wireEndian: 'le',
    fleets: [{ id: 0xaa }, { id: 0xbb }, { id: 0xcc }],
  });
  const body = inner.subarray(6);
  assert.equal(SS_RESP_INFO_UNIT_STRIDE, 0x58, 'element stride is the proven 88 bytes');
  assert.equal(body.readUInt16LE(0), 3, 'unit count @0 == 3 fleets');
  assert.equal(body.readUInt32LE(SS_RESP_INFO_UNIT_HEADER + 0 * 0x58), 0xaa, 'fleet[0].id');
  assert.equal(body.readUInt32LE(SS_RESP_INFO_UNIT_HEADER + 1 * 0x58), 0xbb, 'fleet[1].id @ +0x58');
  assert.equal(body.readUInt32LE(SS_RESP_INFO_UNIT_HEADER + 2 * 0x58), 0xcc, 'fleet[2].id @ +0xb0');
});

test('A1 data-source: an empty fleet element fabricates no values (all P3 slots zero)', () => {
  // The builder must never invent boats/commander/supply on its own — values come ONLY from the
  // A2 entity passed in. A fleet with just an id leaves every other element field zero.
  const inner = buildInformationUnitRecordInner({ wireEndian: 'le', fleets: [{ id: 7 }] });
  const body = inner.subarray(6);
  const B = SS_RESP_INFO_UNIT_HEADER;
  assert.equal(body.readUInt32LE(B + 0x00), 7, 'id present');
  assert.equal(body.readUInt16LE(B + 0x04), 0, 'faction slot zero (not fabricated)');
  assert.equal(body.readUInt32LE(B + 0x08), 0, 'commander slot zero (not fabricated)');
  assert.equal(body.readUInt32LE(B + 0x0c), 0, 'cell slot zero (not fabricated)');
  assert.equal(body.readUInt32LE(B + 0x10), 0, 'owner slot zero (not fabricated)');
  assert.equal(body.readUInt8(B + 0x14), 0, 'boats count zero (not fabricated)');
  assert.equal(body.readUInt32LE(B + 0x40), 0, 'spot/base resolver slot zero (not fabricated)');
});

test('A1 wire-shape: full element supports BE wire for explicit probes', () => {
  const inner = buildInformationUnitRecordInner({
    wireEndian: 'be',
    fleets: [{ id: 0x01020304, faction: 0x0500, commander: 209, supply: 80, boats: [11] }],
  });
  const body = inner.subarray(6);
  const B = SS_RESP_INFO_UNIT_HEADER;
  assert.equal(readUnitBeU16(body, 0), 1, 'count BE');
  assert.equal(readUnitBeU32(body, B + 0x00), 0x01020304, 'id BE');
  assert.equal(readUnitBeU16(body, B + 0x04), 0x0500, 'faction BE');
  assert.equal(readUnitBeU32(body, B + 0x08), 209, 'commander BE');
  assert.equal(body.readUInt8(B + 0x14), 1, 'boats count (u8, endian-independent)');
  assert.equal(readUnitBeU32(body, B + 0x18), 11, 'boats[0] BE');
  assert.equal(readUnitBeU32(body, B + 0x40), 80, 'spot/base resolver BE');
});
