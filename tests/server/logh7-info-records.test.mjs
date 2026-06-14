/**
 * 内政 read-model record builders — tests. Each builder must emit EXACTLY the dispatch-declared body
 * size (the client receive-object factory hard-sizes every code), write the leading count, and place
 * key fields at their spec'd offsets. Body is little-endian at inner.subarray(6); the 2-byte inner code
 * prefix is big-endian. Evidence: docs/logh7-proto-info-records.md. Pure/synchronous — no live client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStaticInformationCardInner,
  buildStaticInformationBaseInner,
  buildInformationInstitutionInner,
  buildInformationWarehouseInner,
  buildInformationPackageInner,
  buildInformationOutfitInner,
  createInfoRecordsState,
  processInfoRecords,
  RESP_STATIC_INFORMATION_CARD_CODE,
  RESP_STATIC_INFORMATION_BASE_CODE,
  RESP_INFORMATION_INSTITUTION_CODE,
  RESP_INFORMATION_WAREHOUSE_CODE,
  RESP_INFORMATION_PACKAGE_CODE,
  RESP_INFORMATION_OUTFIT_CODE,
  RESP_STATIC_INFORMATION_CARD_BYTES,
  RESP_STATIC_INFORMATION_BASE_BYTES,
  RESP_INFORMATION_INSTITUTION_BYTES,
  RESP_INFORMATION_WAREHOUSE_BYTES,
  RESP_INFORMATION_PACKAGE_BYTES,
  RESP_INFORMATION_OUTFIT_BYTES,
  CARD_STRIDE,
  CARD_MAX,
  CARD_COMMAND_MAX,
  INSTITUTION_BASE_STRIDE,
  INSTITUTION_STRIDE,
  INSTITUTION_SPOT_STRIDE,
  OUTFIT_STRIDE,
  OUTFIT_MAX,
  STATIC_BASE_STRIDE,
} from '../../src/server/logh7-info-records.mjs';

/** Assert the message32 framing: [u32 BE 0][u16 BE code][body of bodyLen]; return the LE body view. */
function framedBody(inner, code, bodyLen) {
  assert.equal(inner.readUInt32BE(0), 0, 'message32 prefix dword is 0');
  assert.equal(inner.readUInt16BE(4), code, 'inner code (big-endian) matches');
  assert.equal(inner.length, 6 + bodyLen, 'total inner length = 6 + dispatch body size');
  return inner.subarray(6);
}

// ---------------------------------------------------------------------------
// 0x305 ResponseStaticInformationCard
// ---------------------------------------------------------------------------
test('Card: exact 0x520a body, count u16 @0, stride 0x46, fields + command list', () => {
  const inner = buildStaticInformationCardInner({
    cards: [
      { id: 0x1234, b02: 7, b03: 9, w08: 0xabcd, w20: 0x55aa, commands: [0x11, 0x22, 0x33] },
      { id: 0x4321, b04: 1, b05: 2 },
    ],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_CARD_CODE, RESP_STATIC_INFORMATION_CARD_BYTES);
  assert.equal(RESP_STATIC_INFORMATION_CARD_BYTES, 0x520a);
  assert.equal(CARD_MAX * CARD_STRIDE + 2, RESP_STATIC_INFORMATION_CARD_BYTES, 'size cross-check: 300*70+2');
  assert.equal(body.readUInt16LE(0x00), 2, 'outer count u16');

  // card[0] at body offset 2
  const c0 = 2;
  assert.equal(body.readUInt16LE(c0 + 0x00), 0x1234, 'card_id');
  assert.equal(body.readUInt8(c0 + 0x02), 7, 'b02');
  assert.equal(body.readUInt8(c0 + 0x03), 9, 'b03');
  assert.equal(body.readUInt16LE(c0 + 0x08), 0xabcd, 'w08');
  assert.equal(body.readUInt16LE(c0 + 0x20), 0x55aa, 'w20');
  assert.equal(body.readUInt8(c0 + 0x24), 3, 'command_count');
  assert.equal(body.readUInt16LE(c0 + 0x26), 0x11, 'commands[0]');
  assert.equal(body.readUInt16LE(c0 + 0x26 + 4), 0x33, 'commands[2]');

  // card[1] at the next stride
  const c1 = 2 + CARD_STRIDE;
  assert.equal(body.readUInt16LE(c1 + 0x00), 0x4321, 'card[1] id at stride 0x46');
  assert.equal(body.readUInt8(c1 + 0x04), 1, 'card[1] b04');
  assert.equal(body.readUInt8(c1 + 0x05), 2, 'card[1] b05');
});

test('Card: command list and card count are capped to 24 / 300', () => {
  const commands = Array.from({ length: 40 }, (_, i) => i + 1);
  const inner = buildStaticInformationCardInner({
    cards: [{ id: 1, commands }, ...Array.from({ length: 350 }, (_, i) => ({ id: i + 2 }))],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_CARD_CODE, RESP_STATIC_INFORMATION_CARD_BYTES);
  assert.equal(body.readUInt16LE(0x00), CARD_MAX, 'card count capped at 300');
  assert.equal(body.readUInt8(2 + 0x24), CARD_COMMAND_MAX, 'command_count capped at 24');
});

// ---------------------------------------------------------------------------
// 0x31d ResponseStaticInformationBase
// ---------------------------------------------------------------------------
test('StaticBase: exact 0x520c body, u8 count @0, stride 0x3c, id/grid/name', () => {
  const inner = buildStaticInformationBaseInner({
    bases: [
      { id: 42, grid: 7, name: 'Odin', class_: 3, diameter: 12000, revolutionRadius: 1.5, revolutionDirection: 1 },
      { id: 43, grid: 8, name: 'Heinessen' },
    ],
  });
  const body = framedBody(inner, RESP_STATIC_INFORMATION_BASE_CODE, RESP_STATIC_INFORMATION_BASE_BYTES);
  assert.equal(RESP_STATIC_INFORMATION_BASE_BYTES, 0x520c);
  assert.equal(body.readUInt8(0x00), 2, 'u8 outer count');

  const b0 = 4; // 4-byte aligned header
  assert.equal(body.readUInt32LE(b0 + 0x00), 42, 'system id');
  assert.equal(body.readUInt32LE(b0 + 0x04), 7, 'grid (map cell)');
  assert.equal(body.readFloatLE(b0 + 0x08), 12000, 'diameter float');
  assert.ok(Math.abs(body.readFloatLE(b0 + 0x0c) - 1.5) < 1e-6, 'revolution_radius float');
  // name[<=13]: u8 len + u16 chars at +0x10
  assert.equal(body.readUInt8(b0 + 0x10), 4, 'name length');
  assert.equal(body.readUInt16LE(b0 + 0x11), 'O'.charCodeAt(0), 'name[0]');
  assert.equal(body.readUInt8(b0 + 0x2c), 3, 'class_');
  assert.equal(body.readUInt8(b0 + 0x38), 1, 'revolution_direction');

  const b1 = 4 + STATIC_BASE_STRIDE;
  assert.equal(body.readUInt32LE(b1 + 0x00), 43, 'base[1] id at stride 0x3c');
  assert.equal(body.readUInt8(b1 + 0x10), 'Heinessen'.length, 'base[1] name length');
});

// ---------------------------------------------------------------------------
// 0x321 ResponseInformationInstitution (3-level nested)
// ---------------------------------------------------------------------------
test('Institution: exact 0x8de4 body, nested base/institution/spot counts + offsets', () => {
  const inner = buildInformationInstitutionInner({
    bases: [
      {
        id: 100,
        institutions: [
          { kind: 5, d04: 0xdeadbeef, spots: [{ w04: 0x1111, d08: 0x22223333 }] },
          { kind: 6, d04: 1 },
        ],
      },
    ],
  });
  const body = framedBody(inner, RESP_INFORMATION_INSTITUTION_CODE, RESP_INFORMATION_INSTITUTION_BYTES);
  assert.equal(4 * INSTITUTION_BASE_STRIDE + 4, RESP_INFORMATION_INSTITUTION_BYTES, 'size cross-check 4*0x2378+4');
  assert.equal(body.readUInt8(0x00), 1, 'outer base count u8');

  const baseOff = 4;
  assert.equal(body.readUInt32LE(baseOff + 0x00), 100, 'base id');
  assert.equal(body.readUInt8(baseOff + 0x08), 2, 'institution_count');

  const instOff = baseOff + 0x0c;
  assert.equal(body.readUInt16LE(instOff + 0x00), 5, 'institution[0] kind');
  assert.equal(body.readUInt32LE(instOff + 0x04), 0xdeadbeef, 'institution[0] d04');
  assert.equal(body.readUInt8(instOff + 0x08), 1, 'institution[0] spot_count');

  const spotOff = instOff + 0x0c;
  assert.equal(body.readUInt16LE(spotOff + 0x04), 0x1111, 'spot[0] w04');
  assert.equal(body.readUInt32LE(spotOff + 0x08), 0x22223333, 'spot[0] d08');

  // institution[1] at the next institution stride
  const inst1 = instOff + INSTITUTION_STRIDE;
  assert.equal(body.readUInt16LE(inst1 + 0x00), 6, 'institution[1] kind at stride 0xfc');
});

test('Institution: caps bases≤4, institutions≤36, spots≤21', () => {
  const spots = Array.from({ length: 30 }, () => ({ w04: 1 }));
  const insts = Array.from({ length: 50 }, () => ({ kind: 1, spots }));
  const bases = Array.from({ length: 10 }, (_, i) => ({ id: i, institutions: insts }));
  const inner = buildInformationInstitutionInner({ bases });
  const body = framedBody(inner, RESP_INFORMATION_INSTITUTION_CODE, RESP_INFORMATION_INSTITUTION_BYTES);
  assert.equal(body.readUInt8(0x00), 4, 'base count capped at 4');
  assert.equal(body.readUInt8(4 + 0x08), 36, 'institution_count capped at 36');
  assert.equal(body.readUInt8(4 + 0x0c + 0x08), 21, 'spot_count capped at 21');
  assert.equal(INSTITUTION_SPOT_STRIDE, 0x0c);
});

// ---------------------------------------------------------------------------
// 0x327 ResponseInformationWarehouse (fully labeled)
// ---------------------------------------------------------------------------
test('Warehouse: exact 0x300 body, supplies/food/mineral + ships/troops arrays', () => {
  const inner = buildInformationWarehouseInner({
    base: 7, outfit: 8, index: 9, supplies: 5000, food: 6000, mineral: 7000,
    ships: [{ kind: 0x1001, unitNumber: 12, boatNumber: 0x2002 }],
    troops: [{ kind: 0x3003, troopGrade: 2, unitNumber: 0x4004 }],
  });
  const body = framedBody(inner, RESP_INFORMATION_WAREHOUSE_CODE, RESP_INFORMATION_WAREHOUSE_BYTES);
  assert.equal(RESP_INFORMATION_WAREHOUSE_BYTES, 0x300);
  assert.equal(body.readUInt32LE(0x00), 7, 's_base_');
  assert.equal(body.readUInt32LE(0x04), 8, 's_outfit_');
  assert.equal(body.readUInt32LE(0x08), 9, 's_index_');
  assert.equal(body.readUInt8(0x0c), 1, 'ships_count');
  assert.equal(body.readUInt16LE(0x10), 0x1001, 'ships[0].kind');
  assert.equal(body.readUInt8(0x12), 12, 'ships[0].unit_number');
  assert.equal(body.readUInt16LE(0x13), 0x2002, 'ships[0].boat_number');
  assert.equal(body.readUInt8(0x260), 1, 'troops_count @0x260');
  assert.equal(body.readUInt16LE(0x264), 0x3003, 'troops[0].kind');
  assert.equal(body.readUInt8(0x266), 2, 'troops[0].troop_grade');
  assert.equal(body.readUInt16LE(0x267), 0x4004, 'troops[0].unit_number');
  assert.equal(body.readUInt32LE(0x2f4), 5000, 's_supplies_');
  assert.equal(body.readUInt32LE(0x2f8), 6000, 's_food_');
  assert.equal(body.readUInt32LE(0x2fc), 7000, 's_mineral_ (record ends 0x300)');
});

// ---------------------------------------------------------------------------
// 0x329 ResponseInformationPackage (fully labeled)
// ---------------------------------------------------------------------------
test('Package: exact 0x154 body, base/target + other/troop package arrays @stride 12', () => {
  const inner = buildInformationPackageInner({
    base: 11, targetBase: 22,
    otherPackages: [{ kind: 1, unitKind: 0x5005, troopGrade: 3, packageNumber: 0x12345678 }],
    troopPackages: [{ kind: 2, unitKind: 0x6006, troopGrade: 4, packageNumber: 0x9abcdef0 }],
  });
  const body = framedBody(inner, RESP_INFORMATION_PACKAGE_CODE, RESP_INFORMATION_PACKAGE_BYTES);
  assert.equal(RESP_INFORMATION_PACKAGE_BYTES, 0x154);
  assert.equal(body.readUInt32LE(0x00), 11, 's_base_');
  assert.equal(body.readUInt32LE(0x04), 22, 's_target_base_');
  assert.equal(body.readUInt8(0x08), 1, 'other_package_count');
  // other_package[0] @0x0c: {kind u8, unit_kind u16, troop_grade u8, package_number u32}
  assert.equal(body.readUInt8(0x0c + 0), 1, 'other[0].kind');
  assert.equal(body.readUInt16LE(0x0c + 1), 0x5005, 'other[0].unit_kind');
  assert.equal(body.readUInt8(0x0c + 3), 3, 'other[0].troop_grade');
  assert.equal(body.readUInt32LE(0x0c + 4), 0x12345678, 'other[0].package_number');
  assert.equal(body.readUInt8(0x30), 1, 'troop_package_count @0x30');
  assert.equal(body.readUInt8(0x34 + 0), 2, 'troop[0].kind');
  assert.equal(body.readUInt16LE(0x34 + 1), 0x6006, 'troop[0].unit_kind');
  assert.equal(body.readUInt32LE(0x34 + 4), 0x9abcdef0, 'troop[0].package_number');
});

// ---------------------------------------------------------------------------
// 0x32b ResponseInformationOutfit (fully labeled)
// ---------------------------------------------------------------------------
test('Outfit: exact 0xaf4 body, count u8 @0, stride 0x1c, id + 10 practice_* levels', () => {
  const inner = buildInformationOutfitInner({
    outfits: [
      {
        id: 0xcafe, kind: 1, power: 2, camp: 3, index: 4, achievement: 0x1000, strategyId: 0x99,
        practice: {
          warp: 1, speed: 2, command: 3, offence: 4, defence: 5,
          antiaircraft: 6, search: 7, deception: 8, landbattle: 9, airbattle: 10,
        },
      },
      { id: 0xbeef, kind: 9 },
    ],
  });
  const body = framedBody(inner, RESP_INFORMATION_OUTFIT_CODE, RESP_INFORMATION_OUTFIT_BYTES);
  assert.equal(OUTFIT_MAX * OUTFIT_STRIDE + 4, RESP_INFORMATION_OUTFIT_BYTES, 'size cross-check 100*0x1c+4');
  assert.equal(body.readUInt8(0x00), 2, 'outer count u8');

  const o0 = 4;
  assert.equal(body.readUInt32LE(o0 + 0x00), 0xcafe, 'outfit id');
  assert.equal(body.readUInt8(o0 + 0x04), 1, 's_kind_');
  assert.equal(body.readUInt8(o0 + 0x05), 2, 's_power_');
  assert.equal(body.readUInt8(o0 + 0x06), 3, 's_camp_');
  assert.equal(body.readUInt8(o0 + 0x07), 4, 's_index_');
  assert.equal(body.readUInt16LE(o0 + 0x08), 0x1000, 's_achievement_');
  assert.equal(body.readUInt32LE(o0 + 0x0c), 0x99, 's_strategy_id_');
  // 10 practice_* bytes contiguous at +0x10..+0x19
  assert.equal(body.readUInt8(o0 + 0x10), 1, 'practice_warp');
  assert.equal(body.readUInt8(o0 + 0x14), 5, 'practice_defence');
  assert.equal(body.readUInt8(o0 + 0x19), 10, 'practice_airbattle');

  const o1 = 4 + OUTFIT_STRIDE;
  assert.equal(body.readUInt32LE(o1 + 0x00), 0xbeef, 'outfit[1] id at stride 0x1c');
  assert.equal(body.readUInt8(o1 + 0x04), 9, 'outfit[1] kind');
});

// ---------------------------------------------------------------------------
// empty bodies + state + process() contract
// ---------------------------------------------------------------------------
test('empty inputs still emit a full zero-padded record of the dispatch size', () => {
  const checks = [
    [buildStaticInformationCardInner(), RESP_STATIC_INFORMATION_CARD_CODE, RESP_STATIC_INFORMATION_CARD_BYTES],
    [buildStaticInformationBaseInner(), RESP_STATIC_INFORMATION_BASE_CODE, RESP_STATIC_INFORMATION_BASE_BYTES],
    [buildInformationInstitutionInner(), RESP_INFORMATION_INSTITUTION_CODE, RESP_INFORMATION_INSTITUTION_BYTES],
    [buildInformationWarehouseInner(), RESP_INFORMATION_WAREHOUSE_CODE, RESP_INFORMATION_WAREHOUSE_BYTES],
    [buildInformationPackageInner(), RESP_INFORMATION_PACKAGE_CODE, RESP_INFORMATION_PACKAGE_BYTES],
    [buildInformationOutfitInner(), RESP_INFORMATION_OUTFIT_CODE, RESP_INFORMATION_OUTFIT_BYTES],
  ];
  for (const [inner, code, bytes] of checks) {
    const body = framedBody(inner, code, bytes);
    // count header reads 0 (u8 or u16, both start with a 0 byte)
    assert.equal(body.readUInt8(0), 0, `code 0x${code.toString(16)} empty count = 0`);
  }
});

test('createInfoRecordsState returns the economy stores', () => {
  const state = createInfoRecordsState();
  assert.ok(Array.isArray(state.cards));
  assert.ok(Array.isArray(state.staticBases));
  assert.ok(state.institutions instanceof Map);
  assert.ok(state.warehouses instanceof Map);
  assert.ok(state.packages instanceof Map);
  assert.ok(state.outfits instanceof Map);
});

test('processInfoRecords accepts without notifies (pure read model, no inbound mutation)', () => {
  const state = createInfoRecordsState();
  const decision = processInfoRecords({ state, connectionId: 'c1', innerCode: 0x0305, inner: Buffer.alloc(8) });
  assert.equal(decision.accept, true);
  assert.deepEqual(decision.notifies, []);
  assert.equal(decision.reject, undefined);
});
