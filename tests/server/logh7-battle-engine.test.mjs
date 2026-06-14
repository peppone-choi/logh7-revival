/**
 * Tactical battle-setup data + LIVE BATTLE-ENTRY orchestration tests — RECORD builders (packed wire
 * count header + stride + field offsets) and the openBattleField() ordered notify sequence (codes/order).
 * Pure / synchronous: no live client. Wire layouts per docs/logh7-proto-tactics-data.md + battle-core.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildResponsePositionUnitInner,
  buildTacticsInformationUnitShipInner,
  buildTacticsInformationFillShieldInner,
  buildTacticsInformationFillBeamGunInner,
  buildTacticsCharacterInner,
  buildTacticsInformationCorpsInner,
  buildTacticsInformationBaseInner,
  buildResponsePositionBaseInner,
  buildInformationObstacleInner,
  buildNotifyTacticsInner,
  buildNotifyTacticsChiefCommanderInner,
  openBattleField,
  RESPONSE_TACTICS_CHARACTER_CODE,
  RESPONSE_TACTICS_UNIT_SHIP_CODE,
  RESPONSE_TACTICS_CORPS_CODE,
  RESPONSE_TACTICS_FILL_SHIELD_CODE,
  RESPONSE_TACTICS_FILL_BEAMGUN_CODE,
  RESPONSE_TACTICS_BASE_CODE,
  RESPONSE_INFORMATION_OBSTACLE_CODE,
  RESPONSE_POSITION_UNIT_CODE,
  RESPONSE_POSITION_BASE_CODE,
  NOTIFY_TACTICS_CODE,
  NOTIFY_TACTICS_CHIEF_COMMANDER_CODE,
  NOTIFY_CHANGE_MODE_CODE,
  UNIT_SHIP_RECORD_BYTES,
  CORPS_RECORD_BYTES,
  FILL_SHIELD_RECORD_BYTES,
  FILL_BEAMGUN_RECORD_BYTES,
  TACTICS_CHARACTER_RECORD_BYTES,
  BASE_RECORD_BYTES,
  POSITION_UNIT_RECORD_BYTES,
  POSITION_BASE_RECORD_BYTES,
  MAX_TACTICS_UNITS,
  MAX_TACTICS_BASES,
  MAX_POSITION_BASES,
  BATTLE_SETUP_CODES,
} from '../../src/server/logh7-battle-engine.mjs';

// ── framing helpers ──────────────────────────────────────────────────────────
/** message32 inner = [u32 0 prefix][u16 BE code][LE payload]. Returns { code, payload }. */
function unwrapMessage32(inner) {
  assert.equal(inner.readUInt32BE(0), 0, 'message32 prefix must be 0');
  return { code: inner.readUInt16BE(4), payload: inner.subarray(6) };
}
/** lobby-response inner is also message32 framed; payload starts at byte 6. */
function payloadOf(inner) {
  return unwrapMessage32(inner).payload;
}

// ===========================================================================
// 0x349 ResponsePositionUnit — 20B record (id + xyz + heading), u16 count.
// ===========================================================================
test('buildResponsePositionUnitInner: u16 count + 20B packed records, exact field offsets', () => {
  const units = [
    { id: 0x1001, x: 100.5, y: 0, z: -250.25, heading: 1.5 },
    { shipId: 0x1002, x: -50, y: 1, z: 75, heading: -0.75 },
  ];
  const inner = buildResponsePositionUnitInner({ units });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_POSITION_UNIT_CODE);
  assert.equal(payload.readUInt16LE(0), 2, 'u16 count header');
  assert.equal(POSITION_UNIT_RECORD_BYTES, 20);
  assert.equal(payload.length, 2 + 2 * 20, 'packed body = 2 + count*20 (not zero-padded)');

  // record 0
  let o = 2;
  assert.equal(payload.readUInt32LE(o), 0x1001);
  assert.ok(Math.abs(payload.readFloatLE(o + 4) - 100.5) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 8) - 0) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 12) - -250.25) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 16) - 1.5) < 1e-4);
  // record 1 (shipId alias)
  o = 2 + 20;
  assert.equal(payload.readUInt32LE(o), 0x1002);
  assert.ok(Math.abs(payload.readFloatLE(o + 16) - -0.75) < 1e-4);
});

// ===========================================================================
// 0x33b ResponseTacticsInformationUnitShip — 47B record, u16 count.
// ===========================================================================
test('buildTacticsInformationUnitShipInner: 47B packed record, all field offsets', () => {
  const ships = [{
    id: 0x2001, morale: 88, confusion: 3, character: 0x55,
    x: 10.5, y: 0, z: 20.25, direction: 2.0,
    detachmentLeader: 0x2000, detX: 11, detY: 0, detZ: 21, detachmentDirection: 1.0, search: 1,
  }];
  const inner = buildTacticsInformationUnitShipInner({ ships });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_TACTICS_UNIT_SHIP_CODE);
  assert.equal(UNIT_SHIP_RECORD_BYTES, 47);
  assert.equal(payload.readUInt16LE(0), 1);
  assert.equal(payload.length, 2 + 47);

  const o = 2;
  assert.equal(payload.readUInt32LE(o + 0x00), 0x2001);
  assert.equal(payload.readUInt8(o + 0x04), 88);
  assert.equal(payload.readUInt8(o + 0x05), 3);
  assert.equal(payload.readUInt32LE(o + 0x06), 0x55);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x0a) - 10.5) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x0e) - 0) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x12) - 20.25) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x16) - 2.0) < 1e-4);
  assert.equal(payload.readUInt32LE(o + 0x1a), 0x2000);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x1e) - 11) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x22) - 0) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x26) - 21) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x2a) - 1.0) < 1e-4);
  assert.equal(payload.readUInt8(o + 0x2e), 1);
});

// ===========================================================================
// 0x341 ResponseTacticsInformationFillShield — 40B record (u32 id, u32[6], u16[6]), u16 count.
// ===========================================================================
test('buildTacticsInformationFillShieldInner: 40B record, shield[6] u32 + fill[6] u16', () => {
  const ships = [{
    id: 0x3001,
    shield: [10, 20, 30, 40, 50, 60],
    fill: [1, 2, 3, 4, 5, 6],
  }];
  const inner = buildTacticsInformationFillShieldInner({ ships });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_TACTICS_FILL_SHIELD_CODE);
  assert.equal(FILL_SHIELD_RECORD_BYTES, 40);
  assert.equal(payload.readUInt16LE(0), 1);
  assert.equal(payload.length, 2 + 40);

  const o = 2;
  assert.equal(payload.readUInt32LE(o), 0x3001);
  for (let k = 0; k < 6; k += 1) {
    assert.equal(payload.readUInt32LE(o + 4 + k * 4), (k + 1) * 10, `shield[${k}]`);
  }
  for (let k = 0; k < 6; k += 1) {
    assert.equal(payload.readUInt16LE(o + 0x1c + k * 2), k + 1, `fill[${k}]`);
  }
});

// ===========================================================================
// 0x343 ResponseTacticsInformationFillBeamGun — 16B record ((u32,u16)×2), u16 count.
// ===========================================================================
test('buildTacticsInformationFillBeamGunInner: 16B record, two (value,fill) banks', () => {
  const ships = [{ id: 0x4001, beamgunA: 500, fillA: 100, beamgunB: 250, fillB: 50 }];
  const inner = buildTacticsInformationFillBeamGunInner({ ships });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_TACTICS_FILL_BEAMGUN_CODE);
  assert.equal(FILL_BEAMGUN_RECORD_BYTES, 16);
  assert.equal(payload.readUInt16LE(0), 1);
  assert.equal(payload.length, 2 + 16);

  const o = 2;
  assert.equal(payload.readUInt32LE(o + 0x00), 0x4001);
  assert.equal(payload.readUInt32LE(o + 0x04), 500);
  assert.equal(payload.readUInt16LE(o + 0x08), 100);
  assert.equal(payload.readUInt32LE(o + 0x0a), 250);
  assert.equal(payload.readUInt16LE(o + 0x0e), 50);
});

// ===========================================================================
// 0x337 ResponseTacticsCharacter — [u16 field0][u16 count][u32 id × count].
// ===========================================================================
test('buildTacticsCharacterInner: 4B header (field0,count) + u32 ids, accepts numbers and objects', () => {
  const inner = buildTacticsCharacterInner({ characters: [0xaa, { id: 0xbb }, { characterId: 0xcc }], field0: 7 });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_TACTICS_CHARACTER_CODE);
  assert.equal(TACTICS_CHARACTER_RECORD_BYTES, 4);
  assert.equal(payload.readUInt16LE(0), 7, 'field0');
  assert.equal(payload.readUInt16LE(2), 3, 'count');
  assert.equal(payload.length, 4 + 3 * 4);
  assert.equal(payload.readUInt32LE(4), 0xaa);
  assert.equal(payload.readUInt32LE(8), 0xbb);
  assert.equal(payload.readUInt32LE(12), 0xcc);
});

// ===========================================================================
// 0x33f ResponseTacticsInformationCorps — 55B record, u16 count.
// ===========================================================================
test('buildTacticsInformationCorpsInner: 55B record header + per-facing arrays', () => {
  const corps = [{
    id: 0x5001, morale: 90, confusion: 1, character: 0x77, direction: 1.25, flag: 2,
    byte6a: [1, 2, 3, 4, 5, 6], word2: [11, 22], wordA: [100, 200, 300, 400, 500, 600],
    wordB: [7, 8, 9, 10, 11, 12],
  }];
  const inner = buildTacticsInformationCorpsInner({ corps });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_TACTICS_CORPS_CODE);
  assert.equal(CORPS_RECORD_BYTES, 55);
  assert.equal(payload.readUInt16LE(0), 1);
  assert.equal(payload.length, 2 + 55);

  const o = 2;
  assert.equal(payload.readUInt32LE(o + 0x00), 0x5001);
  assert.equal(payload.readUInt8(o + 0x04), 90);
  assert.equal(payload.readUInt8(o + 0x05), 1);
  assert.equal(payload.readUInt32LE(o + 0x06), 0x77);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x0a) - 1.25) < 1e-4);
  assert.equal(payload.readUInt8(o + 0x0e), 2);
  for (let k = 0; k < 6; k += 1) assert.equal(payload.readUInt8(o + 0x0f + k), k + 1);
  assert.equal(payload.readUInt16LE(o + 0x15), 11);
  assert.equal(payload.readUInt16LE(o + 0x17), 22);
  for (let k = 0; k < 6; k += 1) assert.equal(payload.readUInt16LE(o + 0x19 + k * 2), (k + 1) * 100);
  for (let k = 0; k < 6; k += 1) assert.equal(payload.readUInt16LE(o + 0x25 + k * 2), 7 + k);
});

// ===========================================================================
// 0x345 ResponseTacticsInformationBase — u8 count + 8B header, 28B record.
// ===========================================================================
test('buildTacticsInformationBaseInner: u8 count + 8B header, 28B record', () => {
  const bases = [{ id: 0x6001, x: 1.5, y: 0, z: 2.5, u32a: 1000, u16a: 5, u32b: 2000, u16b: 6 }];
  const inner = buildTacticsInformationBaseInner({ bases });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_TACTICS_BASE_CODE);
  assert.equal(BASE_RECORD_BYTES, 28);
  assert.equal(payload.readUInt8(0), 1, 'u8 count');
  assert.equal(payload.length, 8 + 28, '8B header + record');

  const o = 8;
  assert.equal(payload.readUInt32LE(o + 0x00), 0x6001);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x04) - 1.5) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x08) - 0) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 0x0c) - 2.5) < 1e-4);
  assert.equal(payload.readUInt32LE(o + 0x10), 1000);
  assert.equal(payload.readUInt16LE(o + 0x14), 5);
  assert.equal(payload.readUInt32LE(o + 0x16), 2000);
  assert.equal(payload.readUInt16LE(o + 0x1a), 6);
});

// ===========================================================================
// 0x34b ResponsePositionBase — u8 count + 8B header, 16B record.
// ===========================================================================
test('buildResponsePositionBaseInner: u8 count + 8B header, 16B record', () => {
  const bases = [{ id: 0x7001, x: 5, y: 0, z: 6 }, { id: 0x7002, x: 7, y: 0, z: 8 }];
  const inner = buildResponsePositionBaseInner({ bases });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_POSITION_BASE_CODE);
  assert.equal(POSITION_BASE_RECORD_BYTES, 16);
  assert.equal(payload.readUInt8(0), 2);
  assert.equal(payload.length, 8 + 2 * 16);
  assert.equal(payload.readUInt32LE(8), 0x7001);
  assert.ok(Math.abs(payload.readFloatLE(8 + 4) - 5) < 1e-4);
  assert.equal(payload.readUInt32LE(8 + 16), 0x7002);
});

// ===========================================================================
// 0x347 InformationObstacle — five count-prefixed sub-tables.
// ===========================================================================
test('buildInformationObstacleInner: five [u8 count] sub-tables, correct record sizes', () => {
  const inner = buildInformationObstacleInner({
    circle: [{ id: 1, flag: 1, word: 2, a: 3.5, b: 4.5 }],
    abnormalGravity: [],
    gasCloud: [{ id: 2, flag: 1, word: 3, a: 1.0, id2: 9, flag2: 2, c: 5.0, d: 6.0 }],
    asteroidBelt: [],
    blackhole: [{ id: 3, flag: 1, word: 4, x: 1, y: 2, z: 3, r: 100 }],
  });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, RESPONSE_INFORMATION_OBSTACLE_CODE);

  // section 1 circle: [count=1][15B]
  let o = 0;
  assert.equal(payload.readUInt8(o), 1);
  o += 1;
  assert.equal(payload.readUInt32LE(o), 1);
  assert.equal(payload.readUInt8(o + 4), 1);
  assert.equal(payload.readUInt16LE(o + 5), 2);
  assert.ok(Math.abs(payload.readFloatLE(o + 7) - 3.5) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(o + 11) - 4.5) < 1e-4);
  o += 15;
  // section 2 abnormalGravity: [count=0]
  assert.equal(payload.readUInt8(o), 0);
  o += 1;
  // section 3 gasCloud: [count=1][24B]
  assert.equal(payload.readUInt8(o), 1);
  o += 1;
  assert.equal(payload.readUInt32LE(o), 2);
  assert.equal(payload.readUInt32LE(o + 11), 9, 'gascloud id2');
  assert.ok(Math.abs(payload.readFloatLE(o + 20) - 6.0) < 1e-4, 'gascloud d');
  o += 24;
  // section 4 asteroidBelt: [count=0]
  assert.equal(payload.readUInt8(o), 0);
  o += 1;
  // section 5 blackhole: [count=1][23B]
  assert.equal(payload.readUInt8(o), 1);
  o += 1;
  assert.equal(payload.readUInt32LE(o), 3);
  assert.ok(Math.abs(payload.readFloatLE(o + 19) - 100) < 1e-4, 'blackhole r');
  o += 23;
  assert.equal(payload.length, o, 'total payload = sum of five packed sub-tables');
});

// ===========================================================================
// 0x0f1f NotifyTactics + 0x431 NotifyTacticsChiefCommander — 8B each.
// ===========================================================================
test('buildNotifyTacticsInner: 8B body (arg0, arg1)', () => {
  const inner = buildNotifyTacticsInner({ arg0: 0xdead, arg1: 0xbeef });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, NOTIFY_TACTICS_CODE);
  assert.equal(payload.length, 8);
  assert.equal(payload.readUInt32LE(0), 0xdead);
  assert.equal(payload.readUInt32LE(4), 0xbeef);
});

test('buildNotifyTacticsChiefCommanderInner: 8B body (sideOrUnitId, character)', () => {
  const inner = buildNotifyTacticsChiefCommanderInner({ sideOrUnitId: 0x10, character: 0x99 });
  const { code, payload } = unwrapMessage32(inner);
  assert.equal(code, NOTIFY_TACTICS_CHIEF_COMMANDER_CODE);
  assert.equal(payload.length, 8);
  assert.equal(payload.readUInt32LE(0), 0x10);
  assert.equal(payload.readUInt32LE(4), 0x99);
});

// ===========================================================================
// Caps — counts clamp to the proven maxima.
// ===========================================================================
test('record builders clamp counts to caps', () => {
  const manyUnits = Array.from({ length: MAX_TACTICS_UNITS + 50 }, (_, i) => ({ id: i }));
  const posInner = payloadOf(buildResponsePositionUnitInner({ units: manyUnits }));
  assert.equal(posInner.readUInt16LE(0), MAX_TACTICS_UNITS);

  const manyBases = Array.from({ length: MAX_TACTICS_BASES + 10 }, (_, i) => ({ id: i }));
  const baseInner = payloadOf(buildTacticsInformationBaseInner({ bases: manyBases }));
  assert.equal(baseInner.readUInt8(0), MAX_TACTICS_BASES);

  const manyPosBases = Array.from({ length: MAX_POSITION_BASES + 10 }, (_, i) => ({ id: i }));
  const posBaseInner = payloadOf(buildResponsePositionBaseInner({ bases: manyPosBases }));
  assert.equal(posBaseInner.readUInt8(0), MAX_POSITION_BASES);
});

// ===========================================================================
// openBattleField — the ordered notify sequence (the LIVE BATTLE-ENTRY push).
// ===========================================================================
test('openBattleField: minimal participants -> exact ordered codes (no optional tables)', () => {
  const seq = openBattleField({
    participants: [
      { shipId: 0x1001, x: 100, y: 0, z: 200, heading: 1.0 },
      { shipId: 0x1002, x: -100, y: 0, z: -200, heading: -1.0 },
    ],
    anchorId: 0x1001,
    fieldId: 0x42,
    modeKind: 0,
  });
  const codes = seq.map((s) => s.code);
  assert.deepEqual(codes, [
    RESPONSE_POSITION_UNIT_CODE,    // 0x349 — place ships first
    RESPONSE_TACTICS_UNIT_SHIP_CODE, // 0x33b
    RESPONSE_TACTICS_FILL_SHIELD_CODE, // 0x341
    RESPONSE_TACTICS_FILL_BEAMGUN_CODE, // 0x343
    NOTIFY_CHANGE_MODE_CODE,        // 0x42f — mode-transition grant
    NOTIFY_TACTICS_CODE,            // 0x0f1f — begin space-war (last)
  ]);
  // every entry carries a framed inner and a target.
  for (const step of seq) {
    assert.ok(Buffer.isBuffer(step.inner));
    assert.equal(step.inner.readUInt16BE(4), step.code, 'inner code matches step code');
    assert.equal(step.target, 'all');
  }
});

test('openBattleField: full setup -> all optional tables inserted in spec order, 0x42f then 0x0f1f last', () => {
  const seq = openBattleField({
    participants: [{ shipId: 0x1001, x: 1, y: 0, z: 2, heading: 0.5, character: 0x55 }],
    anchorId: 0x1001,
    fieldId: 0x42,
    modeKind: 0,
    characters: [0x55, 0x56],
    corps: [{ id: 0x5001, morale: 90 }],
    bases: [{ id: 0x6001, x: 3, y: 0, z: 4 }],
    obstacles: { circle: [{ id: 1, a: 1, b: 2 }] },
  });
  const codes = seq.map((s) => s.code);
  assert.deepEqual(codes, [
    RESPONSE_POSITION_UNIT_CODE,        // 0x349
    RESPONSE_TACTICS_UNIT_SHIP_CODE,    // 0x33b
    RESPONSE_TACTICS_FILL_SHIELD_CODE,  // 0x341
    RESPONSE_TACTICS_FILL_BEAMGUN_CODE, // 0x343
    RESPONSE_TACTICS_CHARACTER_CODE,    // 0x337
    RESPONSE_TACTICS_CORPS_CODE,        // 0x33f
    RESPONSE_TACTICS_BASE_CODE,         // 0x345
    RESPONSE_INFORMATION_OBSTACLE_CODE, // 0x347
    RESPONSE_POSITION_BASE_CODE,        // 0x34b
    NOTIFY_CHANGE_MODE_CODE,            // 0x42f
    NOTIFY_TACTICS_CODE,                // 0x0f1f
  ]);
  // 0x42f must precede 0x0f1f, and 0x0f1f is the final step.
  assert.equal(codes[codes.length - 1], NOTIFY_TACTICS_CODE);
  assert.ok(codes.indexOf(NOTIFY_CHANGE_MODE_CODE) < codes.indexOf(NOTIFY_TACTICS_CODE));
});

test('openBattleField: NotifyChangeMode 0x42f carries every participant spawn pose', () => {
  const participants = [
    { shipId: 0xa1, x: 11, y: 0, z: 22, heading: 0.25 },
    { shipId: 0xa2, x: 33, y: 0, z: 44, heading: -0.5 },
  ];
  const seq = openBattleField({ participants, anchorId: 0xa1, modeKind: 0 });
  const changeMode = seq.find((s) => s.code === NOTIFY_CHANGE_MODE_CODE);
  assert.ok(changeMode);
  const p = changeMode.inner.subarray(6); // NotifyChangeMode body
  assert.equal(p.readUInt8(0x0c), 2, 'unitCount in NotifyChangeMode');
  // entry 0: shipId @0x10, heading @0x14, x @0x18, z @0x1c
  assert.equal(p.readUInt32LE(0x10), 0xa1);
  assert.ok(Math.abs(p.readFloatLE(0x14) - 0.25) < 1e-4, 'heading');
  assert.ok(Math.abs(p.readFloatLE(0x18) - 11) < 1e-4, 'x');
  assert.ok(Math.abs(p.readFloatLE(0x1c) - 22) < 1e-4, 'z');
});

test('openBattleField: position table places ships from world-state participants', () => {
  const seq = openBattleField({
    participants: [{ shipId: 0xb1, x: 7.5, y: 0, z: -3.25, heading: 2.0 }],
  });
  const pos = seq.find((s) => s.code === RESPONSE_POSITION_UNIT_CODE);
  const payload = pos.inner.subarray(6);
  assert.equal(payload.readUInt16LE(0), 1);
  assert.equal(payload.readUInt32LE(2), 0xb1);
  assert.ok(Math.abs(payload.readFloatLE(2 + 4) - 7.5) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(2 + 12) - -3.25) < 1e-4);
  assert.ok(Math.abs(payload.readFloatLE(2 + 16) - 2.0) < 1e-4);
});

test('BATTLE_SETUP_CODES exposes the emitted S->C codes', () => {
  for (const c of [
    RESPONSE_POSITION_UNIT_CODE, RESPONSE_TACTICS_UNIT_SHIP_CODE, RESPONSE_TACTICS_FILL_SHIELD_CODE,
    RESPONSE_TACTICS_FILL_BEAMGUN_CODE, NOTIFY_CHANGE_MODE_CODE, NOTIFY_TACTICS_CODE,
  ]) {
    assert.ok(BATTLE_SETUP_CODES.includes(c), `BATTLE_SETUP_CODES includes 0x${c.toString(16)}`);
  }
});
