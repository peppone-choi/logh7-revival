import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  REQ_INFO_OUTFIT_PARTY_CODE,
  RESP_INFO_OUTFIT_PARTY_CODE,
  RESP_INFO_OUTFIT_PARTY_BODY_BYTES,
  OUTFIT_PARTY_CHARACTERS_MAX,
  OUTFIT_PARTY_CHARACTER_NAME_MAX,
  OUTFIT_PARTY_SHIPS_MAX,
  OUTFIT_PARTY_SHIP_UNITS_MAX,
  OUTFIT_PARTY_TROOPS_MAX,
  OUTFIT_PARTY_OTHER_PACKAGES_MAX,
  OUTFIT_PARTY_TROOP_PACKAGES_MAX,
  OUTFIT_PARTY_NOT_TOGETHER_SHIPS_MAX,
  OUTFIT_PARTY_NOT_TOGETHER_TROOPS_MAX,
  buildResponseInformationOutfitPartyInner,
} from '../src/server/codec/outfit-party-record.mjs';
import { msg32Body, readMsg32Code } from '../src/server/logh7-world-records.mjs';

// 클라 파서(FUN_0041e…) 모델: 응답 body는 compact BE 스트림이다(형제 0x0327 warehouse 와 동일
// 규약, 라이브 base=u32BE 확정). u16/u32 는 BE, name 은 u8 len + u16BE[≤13]. 고정 프레임의
// 스트림 커서 이후 바이트는 전부 0.
function decodeOutfitPartyLikeClient(body) {
  let cursor = 0;
  const u8 = () => { const v = body.readUInt8(cursor); cursor += 1; return v; };
  const u16 = () => { const v = body.readUInt16BE(cursor); cursor += 2; return v; };
  const u32 = () => { const v = body.readUInt32BE(cursor); cursor += 4; return v; };
  const pstr16 = () => {
    const len = u8();
    let s = '';
    for (let i = 0; i < len; i += 1) s += String.fromCharCode(u16());
    return s;
  };
  const record = {};
  record.outfit = u32();
  record.base = u32();
  record.mode = u8();
  record.power = u8();
  record.camp = u8();
  record.kind = u32();
  record.index = u32();
  record.characters = [];
  const charCount = u8();
  for (let i = 0; i < charCount; i += 1) {
    record.characters.push({ id: u32(), kind: u8(), rank: u8(), displayName: pstr16() });
  }
  const readShips = () => {
    const list = [];
    const count = u8();
    for (let i = 0; i < count; i += 1) {
      const ship = { kind: u16(), unitNumber: u8(), boatNumber: u16(), units: [] };
      const unitCount = u8();
      for (let j = 0; j < unitCount; j += 1) ship.units.push(u32());
      list.push(ship);
    }
    return list;
  };
  const readTroops = () => {
    const list = [];
    const count = u8();
    for (let i = 0; i < count; i += 1) {
      list.push({ kind: u16(), troopGrade: u8(), unitNumber: u16() });
    }
    return list;
  };
  const readPackages = () => {
    const list = [];
    const count = u8();
    for (let i = 0; i < count; i += 1) {
      list.push({ kind: u8(), unitKind: u16(), troopGrade: u8(), packageNumber: u32() });
    }
    return list;
  };
  record.ships = readShips();
  record.troops = readTroops();
  record.supplies = u32();
  record.maxSupplies = u32();
  record.package = u16();
  record.otherPackages = readPackages();
  record.troopPackages = readPackages();
  record.transportPackageEmptySize = u8();
  record.troopTransportPackageEmptySize = u8();
  record.carrying = u8();
  record.notTogetherShips = readShips();
  record.notTogetherTroops = readTroops();
  record.cursor = cursor;
  return record;
}

test('codes are the RE-confirmed request/response pair and the fixed body size', () => {
  assert.equal(REQ_INFO_OUTFIT_PARTY_CODE, 0x032e);
  assert.equal(RESP_INFO_OUTFIT_PARTY_CODE, 0x032f);
  assert.equal(RESP_INFO_OUTFIT_PARTY_BODY_BYTES, 0x8b04); // 35588
});

test('0x032f builder emits the fixed 35588B frame and round-trips a full nested record', () => {
  const record = {
    outfit: 0x01020304,
    base: 0x05060708,
    mode: 0x11,
    power: 0x22,
    camp: 0x33,
    kind: 0x090a0b0c,
    index: 0x0d0e0f10,
    characters: [
      { id: 0x44556677, kind: 0x59, rank: 0x07, displayName: 'Reinhard' },
      { id: 0x8899aabb, kind: 0xc3, rank: 0x02, displayName: 'Kircheis' },
    ],
    ships: [
      { kind: 0x1234, unitNumber: 0x56, boatNumber: 0x789a, units: [0x11111111, 0x22222222] },
    ],
    troops: [{ kind: 0x2468, troopGrade: 0x9, unitNumber: 0xace0 }],
    supplies: 0x0000cafe,
    maxSupplies: 0x0000feed,
    package: 0xbeef,
    otherPackages: [{ kind: 0x1, unitKind: 0x1122, troopGrade: 0x3, packageNumber: 0x44556677 }],
    troopPackages: [{ kind: 0x2, unitKind: 0x3344, troopGrade: 0x5, packageNumber: 0x8899aabb }],
    transportPackageEmptySize: 0x0a,
    troopTransportPackageEmptySize: 0x0b,
    carrying: 0x0c,
    notTogetherShips: [{ kind: 0x4321, unitNumber: 0x65, boatNumber: 0xa987, units: [0x33333333] }],
    notTogetherTroops: [{ kind: 0x8642, troopGrade: 0x1, unitNumber: 0x0eca }],
  };

  const inner = buildResponseInformationOutfitPartyInner(record);
  assert.equal(readMsg32Code(inner), RESP_INFO_OUTFIT_PARTY_CODE);
  const body = msg32Body(inner);
  assert.equal(body.length, RESP_INFO_OUTFIT_PARTY_BODY_BYTES, 'body must be exactly 35588B');

  // 헤더 첫 필드가 BE 로 실렸는지 원바이트로 확인 (라이브 base=u32BE 규약).
  assert.deepEqual([...body.subarray(0, 4)], [0x01, 0x02, 0x03, 0x04], 'outfit is u32BE @0');
  assert.deepEqual([...body.subarray(4, 8)], [0x05, 0x06, 0x07, 0x08], 'base is u32BE @4');

  const decoded = decodeOutfitPartyLikeClient(body);
  assert.equal(decoded.outfit, 0x01020304);
  assert.equal(decoded.base, 0x05060708);
  assert.equal(decoded.mode, 0x11);
  assert.equal(decoded.power, 0x22);
  assert.equal(decoded.camp, 0x33);
  assert.equal(decoded.kind, 0x090a0b0c);
  assert.equal(decoded.index, 0x0d0e0f10);
  assert.deepEqual(decoded.characters, [
    { id: 0x44556677, kind: 0x59, rank: 0x07, displayName: 'Reinhard' },
    { id: 0x8899aabb, kind: 0xc3, rank: 0x02, displayName: 'Kircheis' },
  ]);
  assert.deepEqual(decoded.ships, [
    { kind: 0x1234, unitNumber: 0x56, boatNumber: 0x789a, units: [0x11111111, 0x22222222] },
  ]);
  assert.deepEqual(decoded.troops, [{ kind: 0x2468, troopGrade: 0x9, unitNumber: 0xace0 }]);
  assert.equal(decoded.supplies, 0x0000cafe);
  assert.equal(decoded.maxSupplies, 0x0000feed);
  assert.equal(decoded.package, 0xbeef);
  assert.deepEqual(decoded.otherPackages, [
    { kind: 0x1, unitKind: 0x1122, troopGrade: 0x3, packageNumber: 0x44556677 },
  ]);
  assert.deepEqual(decoded.troopPackages, [
    { kind: 0x2, unitKind: 0x3344, troopGrade: 0x5, packageNumber: 0x8899aabb },
  ]);
  assert.equal(decoded.transportPackageEmptySize, 0x0a);
  assert.equal(decoded.troopTransportPackageEmptySize, 0x0b);
  assert.equal(decoded.carrying, 0x0c);
  assert.deepEqual(decoded.notTogetherShips, [
    { kind: 0x4321, unitNumber: 0x65, boatNumber: 0xa987, units: [0x33333333] },
  ]);
  assert.deepEqual(decoded.notTogetherTroops, [{ kind: 0x8642, troopGrade: 0x1, unitNumber: 0x0eca }]);

  // compact 스트림 이후는 전부 0 (고정 프레임 padding).
  assert.ok(body.subarray(decoded.cursor).every((byte) => byte === 0), 'padding after cursor stays zero');
});

test('empty record yields a valid zero-count frame (member list empty, not garbage)', () => {
  const inner = buildResponseInformationOutfitPartyInner({});
  const body = msg32Body(inner);
  assert.equal(readMsg32Code(inner), RESP_INFO_OUTFIT_PARTY_CODE);
  assert.equal(body.length, RESP_INFO_OUTFIT_PARTY_BODY_BYTES);
  const decoded = decodeOutfitPartyLikeClient(body);
  assert.equal(decoded.outfit, 0);
  assert.equal(decoded.characters.length, 0);
  assert.equal(decoded.ships.length, 0);
  assert.equal(decoded.troops.length, 0);
  assert.equal(decoded.otherPackages.length, 0);
  assert.equal(decoded.troopPackages.length, 0);
  assert.equal(decoded.notTogetherShips.length, 0);
  assert.equal(decoded.notTogetherTroops.length, 0);
  // 최소 compact 크기 = 헤더 스칼라 19B(outfit4+base4+mode1+power1+camp1+kind4+index4)
  //   + chars_count1 + ships_count1 + troops_count1 + supplies4+maxSupplies4+package2
  //   + other_count1 + troop_count1 + transport3 + nt_ships_count1 + nt_troops_count1 = 39B.
  assert.equal(decoded.cursor, 39);
});

test('the member-list projection (single real officer) renders one character row', () => {
  const inner = buildResponseInformationOutfitPartyInner({
    outfit: 1001,
    base: 70,
    power: 1,
    camp: 1,
    characters: [{ id: 5001, kind: 0, rank: 3, displayName: 'Yang Wen-li' }],
  });
  const decoded = decodeOutfitPartyLikeClient(msg32Body(inner));
  assert.equal(decoded.characters.length, 1, 'member list has exactly one row');
  assert.deepEqual(decoded.characters[0], { id: 5001, kind: 0, rank: 3, displayName: 'Yang Wen-li' });
});

test('caps clamp every array and name without overflowing the fixed frame', () => {
  const bigName = 'ABCDEFGHIJKLMNOPQRST'; // 20 chars, cap 13
  const record = {
    characters: Array.from({ length: OUTFIT_PARTY_CHARACTERS_MAX + 5 }, (_, i) => ({
      id: i + 1, kind: 1, rank: 1, displayName: bigName,
    })),
    ships: Array.from({ length: OUTFIT_PARTY_SHIPS_MAX + 5 }, (_, i) => ({
      kind: i, unitNumber: 1, boatNumber: 2,
      units: Array.from({ length: OUTFIT_PARTY_SHIP_UNITS_MAX + 5 }, (_, j) => j + 1),
    })),
    troops: Array.from({ length: OUTFIT_PARTY_TROOPS_MAX + 5 }, (_, i) => ({
      kind: i, troopGrade: 1, unitNumber: 2,
    })),
    otherPackages: Array.from({ length: OUTFIT_PARTY_OTHER_PACKAGES_MAX + 5 }, () => ({
      kind: 1, unitKind: 2, troopGrade: 3, packageNumber: 4,
    })),
    troopPackages: Array.from({ length: OUTFIT_PARTY_TROOP_PACKAGES_MAX + 5 }, () => ({
      kind: 1, unitKind: 2, troopGrade: 3, packageNumber: 4,
    })),
    notTogetherShips: Array.from({ length: OUTFIT_PARTY_NOT_TOGETHER_SHIPS_MAX + 5 }, (_, i) => ({
      kind: i, unitNumber: 1, boatNumber: 2,
      units: Array.from({ length: OUTFIT_PARTY_SHIP_UNITS_MAX + 5 }, (_, j) => j + 1),
    })),
    notTogetherTroops: Array.from({ length: OUTFIT_PARTY_NOT_TOGETHER_TROOPS_MAX + 5 }, (_, i) => ({
      kind: i, troopGrade: 1, unitNumber: 2,
    })),
  };
  const body = msg32Body(buildResponseInformationOutfitPartyInner(record));
  assert.equal(body.length, RESP_INFO_OUTFIT_PARTY_BODY_BYTES, 'still fits the fixed frame');
  const decoded = decodeOutfitPartyLikeClient(body);
  assert.equal(decoded.characters.length, OUTFIT_PARTY_CHARACTERS_MAX);
  assert.equal(decoded.characters[0].displayName.length, OUTFIT_PARTY_CHARACTER_NAME_MAX);
  assert.equal(decoded.ships.length, OUTFIT_PARTY_SHIPS_MAX);
  assert.equal(decoded.ships[0].units.length, OUTFIT_PARTY_SHIP_UNITS_MAX);
  assert.equal(decoded.troops.length, OUTFIT_PARTY_TROOPS_MAX);
  assert.equal(decoded.otherPackages.length, OUTFIT_PARTY_OTHER_PACKAGES_MAX);
  assert.equal(decoded.troopPackages.length, OUTFIT_PARTY_TROOP_PACKAGES_MAX);
  assert.equal(decoded.notTogetherShips.length, OUTFIT_PARTY_NOT_TOGETHER_SHIPS_MAX);
  assert.equal(decoded.notTogetherTroops.length, OUTFIT_PARTY_NOT_TOGETHER_TROOPS_MAX);
  assert.ok(body.subarray(decoded.cursor).every((byte) => byte === 0));
});

test('scalar fields saturate at their width without wrapping and reject non-finite', () => {
  const decoded = decodeOutfitPartyLikeClient(msg32Body(buildResponseInformationOutfitPartyInner({
    outfit: 0x1_0000_0000,
    base: -1,
    mode: 0x100,
    power: Number.POSITIVE_INFINITY,
    camp: -3,
    kind: 4.9,
    index: Number.NaN,
    supplies: 0x1_0000_0000,
    package: 0x1_0000,
    characters: [{ id: -1, kind: 0x100, rank: 0x1ff, displayName: '' }],
  })));
  assert.equal(decoded.outfit, 0xffffffff, 'over-u32 saturates to max (no wrap into next field)');
  assert.equal(decoded.base, 0, 'negative clamps to 0');
  assert.equal(decoded.mode, 0xff, 'over-u8 saturates to 0xff');
  assert.equal(decoded.power, 0, 'Infinity -> 0');
  assert.equal(decoded.camp, 0, 'negative -> 0');
  assert.equal(decoded.kind, 4, 'float truncates');
  assert.equal(decoded.index, 0, 'NaN -> 0');
  assert.equal(decoded.supplies, 0xffffffff, 'over-u32 saturates');
  assert.equal(decoded.package, 0xffff, 'over-u16 saturates');
  assert.deepEqual(decoded.characters[0], { id: 0, kind: 0xff, rank: 0xff, displayName: '' });
});
