/**
 * STATIC info-records builders — tests. Each builder must emit EXACTLY the dispatch-declared body size
 * (the client receive-object factory hard-sizes every code), write the leading count where applicable,
 * and place key fields at their spec'd offsets. Body is little-endian at inner.subarray(6); the 2-byte
 * inner code prefix is big-endian. Evidence: docs/logh7-proto-info-records.md (+ tactics-data §13,
 * info-records-wire §2, personnel-strategy §4.3/§4.4). Pure/synchronous — no live client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStaticInformationCardCommandInner,
  buildStaticInformationPowerDistributionInner,
  buildStaticInformationUnitShipInner,
  buildStaticInformationUnitTroopInner,
  buildStaticInformationFightersInner,
  buildStaticInformationArmsInner,
  buildInformationGridInner,
  buildGridInformationOutfitInner,
  buildOutfitInformationUnitInner,
  buildInformationOutfitPartyInner,
  buildCardCharacterInner,
  buildNotifyInformationOutfitInner,
  buildNotifyEndingInner,
  createInfoRecordsStaticState,
  processInfoRecordsStatic,
  INFO_RECORD_STATIC_CODES,
  RESP_STATIC_INFORMATION_CARD_COMMAND_CODE,
  RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_CODE,
  RESP_STATIC_INFORMATION_UNIT_SHIP_CODE,
  RESP_STATIC_INFORMATION_UNIT_TROOP_CODE,
  RESP_STATIC_INFORMATION_FIGHTERS_CODE,
  RESP_STATIC_INFORMATION_ARMS_CODE,
  RESP_INFORMATION_GRID_CODE,
  RESP_GRID_INFORMATION_OUTFIT_CODE,
  RESP_INFORMATION_OUTFIT_PARTY_CODE,
  RESP_OUTFIT_INFORMATION_UNIT_CODE,
  RESP_CARD_CHARACTER_CODE,
  NOTIFY_INFORMATION_OUTFIT_CODE,
  NOTIFY_ENDING_CODE,
  RESP_STATIC_INFORMATION_CARD_COMMAND_BYTES,
  RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_BYTES,
  RESP_STATIC_INFORMATION_UNIT_SHIP_BYTES,
  RESP_STATIC_INFORMATION_UNIT_TROOP_BYTES,
  RESP_STATIC_INFORMATION_FIGHTERS_BYTES,
  RESP_STATIC_INFORMATION_ARMS_BYTES,
  RESP_INFORMATION_GRID_BYTES,
  RESP_GRID_INFORMATION_OUTFIT_BYTES,
  RESP_INFORMATION_OUTFIT_PARTY_BYTES,
  RESP_OUTFIT_INFORMATION_UNIT_BYTES,
  RESP_CARD_CHARACTER_BYTES,
  NOTIFY_INFORMATION_OUTFIT_BYTES,
  NOTIFY_ENDING_BYTES,
  CARD_COMMAND_STRIDE,
  CARD_COMMAND_MAX,
  CARD_COMMAND_ENTRY_MAX,
  UNIT_SHIP_STRIDE,
  UNIT_SHIP_MAX,
  UNIT_TROOP_STRIDE,
  UNIT_TROOP_MAX,
  FIGHTERS_STRIDE,
  FIGHTERS_MAX,
  ARMS_ROWS,
  ARMS_COLS,
  ARMS_ROW_STRIDE,
  GRID_OUTFIT_STRIDE,
  GRID_OUTFIT_MAX,
  OUTFIT_UNIT_STRIDE,
  OUTFIT_UNIT_MAX,
  OUTFIT_UNIT_BOATS_MAX,
  CARD_CHARACTER_STRIDE,
  CARD_CHARACTER_MAX,
} from '../../src/server/logh7-info-records-static.mjs';

/** Assert the message32 framing: [u32 BE 0][u16 BE code][body of bodyLen]; return the LE body view. */
function framedBody(inner, code, bodyLen) {
  assert.equal(inner.readUInt32BE(0), 0, 'message32 prefix dword is 0');
  assert.equal(inner.readUInt16BE(4), code, 'inner code (big-endian) matches');
  assert.equal(inner.length, 6 + bodyLen, 'total inner length = 6 + dispatch body size');
  return inner.subarray(6);
}

// ---------------------------------------------------------------------------
// 0x307 ResponseStaticInformationCardCommand
// ---------------------------------------------------------------------------
test('CardCommand: exact 0xe5b2 body, count u16 @0, stride 0xc4, inner 8-byte command descriptors', () => {
  const inner = buildStaticInformationCardCommandInner({
    cards: [
      { cardId: 0x1234, commands: [{ id: 0x0a, packed: 0x123456, w: 0xbeef, flag: 0x7 }, { id: 0x0b }] },
      { cardId: 0x4321 },
    ],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_CARD_COMMAND_CODE, RESP_STATIC_INFORMATION_CARD_COMMAND_BYTES);
  assert.equal(CARD_COMMAND_MAX * CARD_COMMAND_STRIDE + 2, RESP_STATIC_INFORMATION_CARD_COMMAND_BYTES, 'size cross-check 300*196+2');
  assert.equal(body.readUInt16LE(0x00), 2, 'outer count u16');

  const c0 = 2;
  assert.equal(body.readUInt16LE(c0 + 0x00), 0x1234, 'card_id');
  assert.equal(body.readUInt8(c0 + 0x02), 2, 'command_count');
  // command[0] {id u16, packed u24, w u16, flag u8} at +0x04
  const e0 = c0 + 0x04;
  assert.equal(body.readUInt16LE(e0 + 0), 0x0a, 'cmd[0].id');
  assert.equal(body.readUInt8(e0 + 2) | (body.readUInt8(e0 + 3) << 8) | (body.readUInt8(e0 + 4) << 16), 0x123456, 'cmd[0].packed u24');
  assert.equal(body.readUInt16LE(e0 + 5), 0xbeef, 'cmd[0].w');
  assert.equal(body.readUInt8(e0 + 7), 0x7, 'cmd[0].flag');
  assert.equal(body.readUInt16LE(e0 + 8), 0x0b, 'cmd[1].id at stride 8');

  // card[1] at next stride
  assert.equal(body.readUInt16LE(c0 + CARD_COMMAND_STRIDE), 0x4321, 'card[1] id at stride 0xc4');
});

test('CardCommand: card + command counts capped (300 / 24)', () => {
  const commands = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));
  const inner = buildStaticInformationCardCommandInner({
    cards: [{ cardId: 1, commands }, ...Array.from({ length: 350 }, (_, i) => ({ cardId: i + 2 }))],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_CARD_COMMAND_CODE, RESP_STATIC_INFORMATION_CARD_COMMAND_BYTES);
  assert.equal(body.readUInt16LE(0x00), CARD_COMMAND_MAX, 'card count capped at 300');
  assert.equal(body.readUInt8(2 + 0x02), CARD_COMMAND_ENTRY_MAX, 'command_count capped at 24');
});

// ---------------------------------------------------------------------------
// 0x309 ResponseStaticInformationPowerDistribution
// ---------------------------------------------------------------------------
test('PowerDistribution: exact 0x55c blob, move/warp/sensor/shield/beam/gun regions', () => {
  const inner = buildStaticInformationPowerDistributionInner({
    move: Array.from({ length: 11 }, (_, i) => i + 0.5),
    warp: [3, 9],
    sensor: [1.5, 2.5, 3.5, 4.5],
    shield: [Array.from({ length: 9 }, (_, i) => i + 100.0)],
    beam: [Array.from({ length: 20 }, (_, i) => i + 1)],
    gun: [Array.from({ length: 16 }, (_, i) => i + 50)],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_CODE, RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_BYTES);
  assert.equal(RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_BYTES, 0x55c);
  assert.equal(body.readFloatLE(0x00), 0.5, 'move[0] float @0x00');
  assert.equal(body.readFloatLE(0x28), 10.5, 'move[10] float @0x28');
  assert.equal(body.readUInt8(0x2c), 3, 'warp[0] u8 @0x2c');
  assert.equal(body.readUInt8(0x2d), 9, 'warp[1] u8 @0x2d');
  assert.equal(body.readFloatLE(0x30), 1.5, 'sensor[0] float @0x30');
  assert.equal(body.readFloatLE(0x40), 100.0, 'shield[0][0] float @0x40');
  assert.equal(body.readUInt16LE(0x1cc), 1, 'beam[0][0] u16 @0x1cc');
  // gun block begins right after beam (0x1cc + 14*20*2 = 0x3fc); 11*16 u16 then runs to 0x55c exactly.
  assert.equal(body.readUInt16LE(0x3fc), 50, 'gun[0][0] u16 @0x3fc');
  assert.equal(0x3fc + 11 * 16 * 2, RESP_STATIC_INFORMATION_POWER_DISTRIBUTION_BYTES, 'gun block walks out to 0x55c');
});

// ---------------------------------------------------------------------------
// 0x30b ResponseStaticInformationUnitShip
// ---------------------------------------------------------------------------
test('UnitShip: exact 0x6d64 body, count u8 @0, stride 0x8c, kind+name+floats+named stats', () => {
  const inner = buildStaticInformationUnitShipInner({
    ships: [
      {
        kind: 0x2a, name: 'SS75', shieldCapacity: 20000, beamPower: 100, speed: 5600.0, f3c: 12.5,
        armorFront: 390, shield: 70, unitCount: 100,
      },
      { kind: 0x2b, name: 'PK86' },
    ],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_UNIT_SHIP_CODE, RESP_STATIC_INFORMATION_UNIT_SHIP_BYTES);
  assert.equal(UNIT_SHIP_MAX * UNIT_SHIP_STRIDE + 4, RESP_STATIC_INFORMATION_UNIT_SHIP_BYTES, 'size cross-check 200*140+4');
  assert.equal(body.readUInt8(0x00), 2, 'outer count u8');

  const s0 = 4; // 4-byte aligned count header
  // CLIENT-CORRECT offsets (FUN_004109a0 param_1=R+2; docs/logh7-implementation-specs.md §2):
  // name_len @R+0x08, name chars @R+0x0a; FOUR floats @R+0x38/0x3c/0x5c/0x60; u16 stat slots per U16_SLOTS.
  assert.equal(body.readUInt16LE(s0 + 0x00), 0x2a, 'kind');
  assert.equal(body.readUInt8(s0 + 0x08), 4, 'name_len for "SS75" @R+0x08');
  assert.equal(body.readUInt16LE(s0 + 0x0a), 'S'.charCodeAt(0), 'name[0] wide char @R+0x0a');
  assert.equal(body.readFloatLE(s0 + 0x38), 5600.0, 'speed float @R+0x38');
  assert.equal(body.readFloatLE(s0 + 0x3c), 12.5, 'f3c float @R+0x3c');
  // named stats map to U16_SLOTS positionally: [armorFront@0x24, armorSide@0x2c, armorBack@0x2e,
  // shield@0x30, shieldCapacity@0x32, beamPower@0x34, aa@0x40, crew@0x42, cost@0x44, resources@0x46, unitCount@0x48]
  assert.equal(body.readUInt16LE(s0 + 0x24), 390, 'armorFront @R+0x24');
  assert.equal(body.readUInt16LE(s0 + 0x30), 70, 'shield @R+0x30');
  assert.equal(body.readUInt16LE(s0 + 0x32), 20000, 'shieldCapacity @R+0x32');
  assert.equal(body.readUInt16LE(s0 + 0x34), 100, 'beamPower @R+0x34');
  assert.equal(body.readUInt16LE(s0 + 0x48), 100, 'unitCount @R+0x48');

  const s1 = 4 + UNIT_SHIP_STRIDE;
  assert.equal(body.readUInt16LE(s1 + 0x00), 0x2b, 'ship[1] kind at stride 0x8c');
});

test('UnitShip: count capped at 200', () => {
  const inner = buildStaticInformationUnitShipInner({
    ships: Array.from({ length: 250 }, (_, i) => ({ kind: i + 1 })),
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_UNIT_SHIP_CODE, RESP_STATIC_INFORMATION_UNIT_SHIP_BYTES);
  assert.equal(body.readUInt8(0x00), UNIT_SHIP_MAX & 0xff, 'count capped at 200');
});

// ---------------------------------------------------------------------------
// 0x30d ResponseStaticInformationUnitTroop (FULLY LABELED)
// ---------------------------------------------------------------------------
test('UnitTroop: exact 0x184 body, count u8 @0, stride 0x18, labeled fields', () => {
  const inner = buildStaticInformationUnitTroopInner({
    troops: [
      { kind: 5, type: 1, category: 2, achievement: 300, practice: 7, practiceCost: 9, resources: 11, speed: 3.5, offence: 80, defence: 60, tail: 0x1111 },
    ],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_UNIT_TROOP_CODE, RESP_STATIC_INFORMATION_UNIT_TROOP_BYTES);
  assert.equal(UNIT_TROOP_MAX * UNIT_TROOP_STRIDE + 4, RESP_STATIC_INFORMATION_UNIT_TROOP_BYTES, 'size cross-check 16*24+4');
  assert.equal(body.readUInt8(0x00), 1, 'count');
  const t0 = 4;
  assert.equal(body.readUInt16LE(t0 + 0x00), 5, 'kind');
  assert.equal(body.readUInt8(t0 + 0x02), 1, 'type');
  assert.equal(body.readUInt8(t0 + 0x03), 2, 'category');
  assert.equal(body.readUInt16LE(t0 + 0x04), 300, 'achievement');
  assert.equal(body.readUInt16LE(t0 + 0x06), 7, 'practice');
  assert.equal(body.readUInt16LE(t0 + 0x08), 9, 'practice_cost');
  assert.equal(body.readUInt16LE(t0 + 0x0a), 11, 'resources');
  assert.equal(body.readFloatLE(t0 + 0x0c), 3.5, 'speed float');
  assert.equal(body.readUInt16LE(t0 + 0x10), 80, 'offence');
  assert.equal(body.readUInt16LE(t0 + 0x12), 60, 'defence');
  assert.equal(body.readUInt16LE(t0 + 0x14), 0x1111, 'tail');
});

// ---------------------------------------------------------------------------
// 0x30f ResponseStaticInformationFighters (FULLY LABELED)
// ---------------------------------------------------------------------------
test('Fighters: exact 0x34 body, count u8 @0, stride 0x0c, labeled fields', () => {
  const inner = buildStaticInformationFightersInner({
    fighters: [{ kind: 1, airbattle: 90, antiship: 70, defence: 40, cruising: 8.25 }],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_FIGHTERS_CODE, RESP_STATIC_INFORMATION_FIGHTERS_BYTES);
  assert.equal(FIGHTERS_MAX * FIGHTERS_STRIDE + 4, RESP_STATIC_INFORMATION_FIGHTERS_BYTES, 'size cross-check 4*12+4');
  assert.equal(body.readUInt8(0x00), 1, 'count');
  const f0 = 4;
  assert.equal(body.readUInt16LE(f0 + 0x00), 1, 'kind');
  assert.equal(body.readUInt16LE(f0 + 0x02), 90, 'airbattle');
  assert.equal(body.readUInt16LE(f0 + 0x04), 70, 'antiship');
  assert.equal(body.readUInt16LE(f0 + 0x06), 40, 'defence');
  assert.equal(body.readFloatLE(f0 + 0x08), 8.25, 'cruising float');
});

// ---------------------------------------------------------------------------
// 0x311 ResponseStaticInformationArms (FIXED 27x8 u16)
// ---------------------------------------------------------------------------
test('Arms: exact 0x1b0 body, fixed 27x8 u16 table, row stride 16', () => {
  const arms = Array.from({ length: ARMS_ROWS }, (_, r) => Array.from({ length: ARMS_COLS }, (_, c) => r * 100 + c));
  const inner = buildStaticInformationArmsInner({ arms });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_ARMS_CODE, RESP_STATIC_INFORMATION_ARMS_BYTES);
  assert.equal(ARMS_ROWS * ARMS_COLS * 2, RESP_STATIC_INFORMATION_ARMS_BYTES, 'size cross-check 27*8*2');
  assert.equal(body.readUInt16LE(0), 0, 'arms[0][0]');
  assert.equal(body.readUInt16LE(7 * 2), 7, 'arms[0][7]');
  assert.equal(body.readUInt16LE(ARMS_ROW_STRIDE), 100, 'arms[1][0] at row stride 16');
  assert.equal(body.readUInt16LE(26 * ARMS_ROW_STRIDE + 7 * 2), 2607, 'arms[26][7] last cell');
});

// ---------------------------------------------------------------------------
// 0x317 ResponseInformationGrid (single dword)
// ---------------------------------------------------------------------------
test('InformationGrid: exact 4-byte body = current grid index', () => {
  const inner = buildInformationGridInner({ grid: 0xdeadbeef });
  const body = framedBody(inner, RESP_INFORMATION_GRID_CODE, RESP_INFORMATION_GRID_BYTES);
  assert.equal(RESP_INFORMATION_GRID_BYTES, 4);
  assert.equal(body.readUInt32LE(0x00), 0xdeadbeef, 'current grid index');
});

// ---------------------------------------------------------------------------
// 0x32d ResponseGridInformationOutfit (FULLY LABELED)
// ---------------------------------------------------------------------------
test('GridInformationOutfit: exact 0xe14 body, count u16 @0, stride 0x0c, labeled fields', () => {
  const inner = buildGridInformationOutfitInner({
    outfits: [{ id: 0x12345678, kind: 3, power: 1, camp: 2, index: 9, supplies: 999 }],
  });
  const body = framedBody(inner, RESP_GRID_INFORMATION_OUTFIT_CODE, RESP_GRID_INFORMATION_OUTFIT_BYTES);
  assert.equal(GRID_OUTFIT_MAX * GRID_OUTFIT_STRIDE + 4, RESP_GRID_INFORMATION_OUTFIT_BYTES, 'size cross-check 300*12+4');
  assert.equal(body.readUInt16LE(0x00), 1, 'outer count u16');
  const g0 = 4;
  assert.equal(body.readUInt32LE(g0 + 0x00), 0x12345678, 'outfit id');
  assert.equal(body.readUInt8(g0 + 0x04), 3, 'kind');
  assert.equal(body.readUInt8(g0 + 0x05), 1, 'power');
  assert.equal(body.readUInt8(g0 + 0x06), 2, 'camp');
  assert.equal(body.readUInt8(g0 + 0x07), 9, 'index');
  assert.equal(body.readUInt32LE(g0 + 0x08), 999, 'supplies');
});

// ---------------------------------------------------------------------------
// 0x331 ResponseOutfitInformationUnit
// ---------------------------------------------------------------------------
test('OutfitInformationUnit: exact 0x1814 body, count u8 @0, stride 0x58, unit_id + boats[] + float tail', () => {
  const inner = buildOutfitInformationUnitInner({
    units: [{ id: 0xaabbccdd, w04: 0x1122, boats: [11, 22, 33], f50: 7.5 }],
  });
  const body = framedBody(inner, RESP_OUTFIT_INFORMATION_UNIT_CODE, RESP_OUTFIT_INFORMATION_UNIT_BYTES);
  assert.equal(OUTFIT_UNIT_MAX * OUTFIT_UNIT_STRIDE + 4, RESP_OUTFIT_INFORMATION_UNIT_BYTES, 'size cross-check 70*88+4');
  assert.equal(body.readUInt8(0x00), 1, 'count');
  const u0 = 4;
  assert.equal(body.readUInt32LE(u0 + 0x00), 0xaabbccdd, 'unit_id');
  assert.equal(body.readUInt16LE(u0 + 0x04), 0x1122, 'w04');
  assert.equal(body.readUInt8(u0 + 0x10), 3, 'boats_count');
  assert.equal(body.readUInt32LE(u0 + 0x14), 11, 'boats[0]');
  assert.equal(body.readUInt32LE(u0 + 0x14 + 8), 33, 'boats[2]');
  assert.equal(body.readFloatLE(u0 + 0x50), 7.5, 'f50 float tail');
});

test('OutfitInformationUnit: boats capped at 10', () => {
  const inner = buildOutfitInformationUnitInner({
    units: [{ id: 1, boats: Array.from({ length: 20 }, (_, i) => i + 1) }],
  });
  const body = framedBody(inner, RESP_OUTFIT_INFORMATION_UNIT_CODE, RESP_OUTFIT_INFORMATION_UNIT_BYTES);
  assert.equal(body.readUInt8(4 + 0x10), OUTFIT_UNIT_BOATS_MAX, 'boats_count capped at 10');
});

// ---------------------------------------------------------------------------
// 0x32f ResponseInformationOutfitParty (streaming nested record)
// ---------------------------------------------------------------------------
test('OutfitParty: exact 0x8b04 body, streamed header + nested arrays', () => {
  const inner = buildInformationOutfitPartyInner({
    outfit: 0x1001, base: 0x2002, mode: 1, power: 2, camp: 3, kind: 0x4004, index: 0x5005,
    characters: [{ id: 0x9001, kind: 1, rank: 7, name: 'Reinhard' }],
    ships: [{ kind: 0x2a, unitNumber: 4, boatNumber: 12, units: [101, 102] }],
    troops: [{ kind: 0x10, troopGrade: 2, unitNumber: 99 }],
    supplies: 5000, maxSupplies: 8000, package: 3,
  });
  const body = framedBody(inner, RESP_INFORMATION_OUTFIT_PARTY_CODE, RESP_INFORMATION_OUTFIT_PARTY_BYTES);
  assert.equal(RESP_INFORMATION_OUTFIT_PARTY_BYTES, 0x8b04);
  // header
  assert.equal(body.readUInt32LE(0x00), 0x1001, 'outfit');
  assert.equal(body.readUInt32LE(0x04), 0x2002, 'base');
  assert.equal(body.readUInt8(0x08), 1, 'mode');
  assert.equal(body.readUInt8(0x09), 2, 'power');
  assert.equal(body.readUInt8(0x0a), 3, 'camp');
  assert.equal(body.readUInt32LE(0x0c), 0x4004, 'kind @0x0c');
  assert.equal(body.readUInt32LE(0x10), 0x5005, 'index @0x10');
  // characters[] : count u8 @0x14, then {id u32, kind u8, rank u8, name}
  assert.equal(body.readUInt8(0x14), 1, 'characters_count');
  let cur = 0x15;
  assert.equal(body.readUInt32LE(cur), 0x9001, 'char.id'); cur += 4;
  assert.equal(body.readUInt8(cur), 1, 'char.kind'); cur += 1;
  assert.equal(body.readUInt8(cur), 7, 'char.rank'); cur += 1;
  const nameLen = body.readUInt8(cur); cur += 1;
  assert.equal(nameLen, 'Reinhard'.length, 'char.name len');
  assert.equal(body.readUInt16LE(cur), 'R'.charCodeAt(0), 'char.name[0]');
  cur += nameLen * 2;
  // ships[] : count u8
  assert.equal(body.readUInt8(cur), 1, 'ships_count'); cur += 1;
  assert.equal(body.readUInt16LE(cur), 0x2a, 'ship.kind'); cur += 2;
  assert.equal(body.readUInt8(cur), 4, 'ship.unit_number'); cur += 1;
  assert.equal(body.readUInt16LE(cur), 12, 'ship.boat_number'); cur += 2;
  const unitsLen = body.readUInt8(cur); cur += 1;
  assert.equal(unitsLen, 2, 'ship.units len');
  assert.equal(body.readUInt32LE(cur), 101, 'ship.units[0]'); cur += unitsLen * 4;
  // troops[]
  assert.equal(body.readUInt8(cur), 1, 'troops_count'); cur += 1;
  assert.equal(body.readUInt16LE(cur), 0x10, 'troop.kind'); cur += 2;
  assert.equal(body.readUInt8(cur), 2, 'troop.grade'); cur += 1;
  assert.equal(body.readUInt16LE(cur), 99, 'troop.unit_number'); cur += 2;
  // supplies / max_supplies / package
  assert.equal(body.readUInt32LE(cur), 5000, 'supplies'); cur += 4;
  assert.equal(body.readUInt32LE(cur), 8000, 'max_supplies'); cur += 4;
  assert.equal(body.readUInt16LE(cur), 3, 'package'); cur += 2;
});

test('OutfitParty: max caps do not overflow the dispatch buffer', () => {
  const ship = { kind: 1, unitNumber: 1, boatNumber: 1, units: Array.from({ length: 70 }, (_, i) => i) };
  const inner = buildInformationOutfitPartyInner({
    characters: Array.from({ length: 20 }, (_, i) => ({ id: i, name: 'AAAAAAAAAAAAA' })),
    ships: Array.from({ length: 80 }, () => ship),
    troops: Array.from({ length: 40 }, () => ({ kind: 1 })),
    otherPackages: Array.from({ length: 10 }, () => ({ kind: 1 })),
    troopPackages: Array.from({ length: 40 }, () => ({ kind: 1 })),
    notTogetherShips: Array.from({ length: 80 }, () => ship),
    notTogetherTroops: Array.from({ length: 40 }, () => ({ kind: 1 })),
  });
  // Should not throw and must be exactly the dispatch size.
  framedBody(inner, RESP_INFORMATION_OUTFIT_PARTY_CODE, RESP_INFORMATION_OUTFIT_PARTY_BYTES);
});

// ---------------------------------------------------------------------------
// 0x34f ResponseCardCharacter (array of 724-byte 0x0323 records)
// ---------------------------------------------------------------------------
test('CardCharacter: exact 0xb504 body, count u8 @0, stride 0x2d4, reuses 0x0323 element layout', () => {
  const inner = buildCardCharacterInner({
    characters: [
      { characterId: 0x1111, power: 1, lastname: 'Yang', firstname: 'Wenli', rank: 5, face: 0x0323 },
      { characterId: 0x2222 },
    ],
  });
  const body = framedBody(inner, RESP_CARD_CHARACTER_CODE, RESP_CARD_CHARACTER_BYTES);
  assert.equal(CARD_CHARACTER_MAX * CARD_CHARACTER_STRIDE + 4, RESP_CARD_CHARACTER_BYTES, 'size cross-check 64*724+4');
  assert.equal(CARD_CHARACTER_STRIDE, 0x2d4, 'element stride 724');
  assert.equal(body.readUInt8(0x00), 2, 'count');
  // element[0] = the 0x0323 record; id@0x00, power@0x04, face in parentage[0] @0x80+0x74
  const e0 = 4;
  assert.equal(body.readUInt32LE(e0 + 0x00), 0x1111, 'char[0] id @element+0x00');
  assert.equal(body.readUInt8(e0 + 0x04), 1, 'char[0] power @+0x04');
  assert.equal(body.readUInt32LE(e0 + 0x80 + 0x74), 0x0323, 'char[0] face @parentage[0]+0x74');
  // element[1] at the next stride
  const e1 = 4 + CARD_CHARACTER_STRIDE;
  assert.equal(body.readUInt32LE(e1 + 0x00), 0x2222, 'char[1] id at stride 0x2d4');
});

test('CardCharacter: count capped at 64', () => {
  const inner = buildCardCharacterInner({
    characters: Array.from({ length: 100 }, (_, i) => ({ characterId: i + 1 })),
  });
  const body = framedBody(inner, RESP_CARD_CHARACTER_CODE, RESP_CARD_CHARACTER_BYTES);
  assert.equal(body.readUInt8(0x00), CARD_CHARACTER_MAX, 'count capped at 64');
});

// ---------------------------------------------------------------------------
// 0x359 NotifyInformationOutfit (28 B = 7 dwords)
// ---------------------------------------------------------------------------
test('NotifyInformationOutfit: exact 0x1c body, outfit id + 6 state dwords', () => {
  const inner = buildNotifyInformationOutfitInner({ outfit: 0x4242, dwords: [10, 20, 30, 40, 50, 60] });
  const body = framedBody(inner, NOTIFY_INFORMATION_OUTFIT_CODE, NOTIFY_INFORMATION_OUTFIT_BYTES);
  assert.equal(NOTIFY_INFORMATION_OUTFIT_BYTES, 28, '7 dwords');
  assert.equal(body.readUInt32LE(0x00), 0x4242, 'outfit id');
  assert.equal(body.readUInt32LE(0x04), 10, 'dword[1]');
  assert.equal(body.readUInt32LE(0x18), 60, 'dword[6]');
});

// ---------------------------------------------------------------------------
// 0x35a NotifyEnding (1076 B)
// ---------------------------------------------------------------------------
test('NotifyEnding: exact 0x434 body, head fields at recv offsets + text block', () => {
  const inner = buildNotifyEndingInner({
    type: 0x7, code2: 0x55, b6: 1, b7: 2, d2: 0x1234, d4: 0x5678, w5: 0x99, tail: [1, 2, 3, 4], text: 'END',
  });
  const body = framedBody(inner, NOTIFY_ENDING_CODE, NOTIFY_ENDING_BYTES);
  assert.equal(NOTIFY_ENDING_BYTES, 1076);
  assert.equal(body.readUInt32LE(0x00), 0x7, 'type');
  assert.equal(body.readUInt16LE(0x04), 0x55, 'code2');
  assert.equal(body.readUInt8(0x06), 1, 'b6');
  assert.equal(body.readUInt8(0x07), 2, 'b7');
  assert.equal(body.readUInt32LE(0x08), 0x1234, 'd2');
  assert.equal(body.readUInt32LE(0x10), 0x5678, 'd4');
  assert.equal(body.readUInt16LE(0x14), 0x99, 'w5');
  assert.equal(body.readUInt32LE(0x18), 1, 'tail d6');
  assert.equal(body.readUInt32LE(0x18 + 12), 4, 'tail d9');
  assert.equal(body.readUInt16LE(0x2a), 'E'.charCodeAt(0), 'text block @0x2a');
});

// ---------------------------------------------------------------------------
// State + process()
// ---------------------------------------------------------------------------
test('createInfoRecordsStaticState seeds ship classes from content/ship-stats.json with REAL pools', () => {
  const state = createInfoRecordsStaticState();
  assert.ok(Array.isArray(state.shipClasses), 'shipClasses array');
  assert.ok(state.shipClasses.length > 0, 'seeded at least one ship class from content');
  // First entry should be the SS75 standard battleship (key SS75) with its REAL pools mapped.
  const first = state.shipClasses[0];
  assert.equal(first.kind, 1, 'kind is positional 1-based id');
  assert.equal(first.name, 'SS75', 'name from content key');
  assert.equal(first.shieldCapacity, 20000, 'REAL shield_capacity pool');
  assert.equal(first.beamPower, 100, 'REAL beamPower pool');
  const splitArmor = state.shipClasses.find((ship) => ship.name === 'A78c');
  assert.equal(splitArmor.armorFront, 15, 'split armor front maps to a numeric slot');
  assert.equal(splitArmor.armorSide, 10, 'split armor side maps to a numeric slot');
  assert.equal(splitArmor.armorBack, 5, 'split armor back maps to a numeric slot');
  // buildUnitShip() projects them onto a valid 0x30b record.
  const inner = state.buildUnitShip();
  const body = framedBody(inner, RESP_STATIC_INFORMATION_UNIT_SHIP_CODE, RESP_STATIC_INFORMATION_UNIT_SHIP_BYTES);
  assert.equal(body.readUInt8(0x00), Math.min(state.shipClasses.length, UNIT_SHIP_MAX) & 0xff, 'count = seeded ships');
  assert.equal(body.readUInt16LE(4 + 0x00), 1, 'ship[0].kind = 1');
  assert.equal(body.readUInt16LE(4 + 0x32), 20000, 'ship[0] shieldCapacity slot @R+0x32 (client-correct U16_SLOTS)');
});

test('createInfoRecordsStaticState(load:false) is empty (pure)', () => {
  const state = createInfoRecordsStaticState({ load: false });
  assert.equal(state.shipClasses.length, 0, 'no content read when load:false');
  assert.equal(state.currentGrid, 0);
});

test('processInfoRecordsStatic is a read-model no-op (accept, no notifies)', () => {
  const r = processInfoRecordsStatic({ innerCode: RESP_CARD_CHARACTER_CODE });
  assert.equal(r.accept, true);
  assert.equal(r.handled, false);
  assert.equal(r.notifies.length, 0);
  assert.equal(r.code, RESP_CARD_CHARACTER_CODE);
});

test('INFO_RECORD_STATIC_CODES exposes the builder code map', () => {
  assert.equal(INFO_RECORD_STATIC_CODES.RESP_CARD_CHARACTER_CODE, 0x034f);
  assert.equal(INFO_RECORD_STATIC_CODES.RESP_STATIC_INFORMATION_UNIT_SHIP_CODE, 0x030b);
  assert.equal(INFO_RECORD_STATIC_CODES.NOTIFY_ENDING_CODE, 0x035a);
});
