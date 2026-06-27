/**
 * Battle-ops engine tests — the remaining in-battle 0x04xx commands' parser offsets, every S→C Notify
 * builder's dispatch size + field layout, and the processBattleOps() validate/accept/notify contract.
 * Pure/synchronous: no live client. Wire layouts per docs/logh7-proto-battle-fleetops.md +
 * docs/logh7-proto-battle-core.md. Sizes cross-checked against WORLD_RESPONSE_OBJECT_SIZES ground truth.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseInboundTurn,
  parseInboundRepairSupply,
  parseInboundEmergencySupply,
  parseInboundEncourageFlagship,
  parseInboundBaseSingle,
  parseInboundSuggestion,
  parseInboundControl,
  parseInboundAdmission,
  parseInboundIdList,
  parseInboundShootFortress,
  parseInboundMoveFortress,
  parseInboundChangeAuthority,
  parseInboundMission,
  parseInboundFileFleet,
  buildNotifyEncourageFlagshipInner,
  buildNotifyEncourageBaseInner,
  buildNotifyRepairFleetInner,
  buildNotifySupplyFleetInner,
  buildNotifyRepairBaseInner,
  buildNotifySupplyBaseInner,
  buildNotifyEmergencySupplyBaseInner,
  buildNotifyShootFortressInner,
  buildNotifyShootBaseInner,
  buildNotifyMovedFortressInner,
  buildNotifyChangedAuthorityInner,
  buildNotifyAirBattleInner,
  buildNotifyMissionResultInner,
  buildNotifyFinishOccupationInner,
  buildNotifyTacticsChiefCommanderInner,
  buildNotifyCharacterAchievementInner,
  buildNotifyOutfitAchievementInner,
  buildNotifyConfusionUnitInner,
  buildNotifyConfusionRecoveredUnitInner,
  buildNotifyBlackHoleSuctionInner,
  createBattleOpsState,
  processBattleOps,
  COMMAND_TURN_SHIP_CODE,
  COMMAND_REVERSE_SHIP_CODE,
  COMMAND_STOP_CODE,
  COMMAND_REPAIR_FLEET_CODE,
  COMMAND_SUPPLY_FLEET_CODE,
  COMMAND_EMERGENCY_SUPPLY_CODE,
  COMMAND_ENCOURAGE_FLAGSHIP_CODE,
  COMMAND_ENCOURAGE_BASE_CODE,
  COMMAND_STOP_BASE_CODE,
  COMMAND_SUGGESTION_CODE,
  COMMAND_CONTROL_CODE,
  COMMAND_ADMISSION_CODE,
  COMMAND_REPAIR_BASE_CODE,
  COMMAND_AIR_BATTLE_CODE,
  COMMAND_SHOOT_FORTRESS_CODE,
  COMMAND_MOVE_FORTRESS_CODE,
  COMMAND_CHANGE_AUTHORITY_CODE,
  COMMAND_MISSION_CODE,
  COMMAND_FILE_FLEET_CODE,
  NOTIFY_ENCOURAGE_FLAGSHIP_CODE,
  NOTIFY_ENCOURAGE_BASE_CODE,
  NOTIFY_REPAIR_FLEET_CODE,
  NOTIFY_SUPPLY_FLEET_CODE,
  NOTIFY_REPAIR_BASE_CODE,
  NOTIFY_SUPPLY_BASE_CODE,
  NOTIFY_EMERGENCY_SUPPLY_BASE_CODE,
  NOTIFY_SHOOT_FORTRESS_CODE,
  NOTIFY_SHOOT_BASE_CODE,
  NOTIFY_MOVED_FORTRESS_CODE,
  NOTIFY_CHANGED_AUTHORITY_CODE,
  NOTIFY_AIR_BATTLE_CODE,
  NOTIFY_MISSION_RESULT_CODE,
  NOTIFY_FINISH_OCCUPATION_CODE,
  NOTIFY_TACTICS_CHIEF_COMMANDER_CODE,
  NOTIFY_CHARACTER_ACHIEVEMENT_CODE,
  NOTIFY_OUTFIT_ACHIEVEMENT_CODE,
  NOTIFY_CONFUSION_UNIT_CODE,
  NOTIFY_CONFUSION_RECOVERED_UNIT_CODE,
  NOTIFY_BLACK_HOLE_SUCTION_CODE,
  NOTIFY_TURNED_SHIP_CODE,
  NOTIFY_MOVED_SHIP_CODE,
} from '../../src/server/logh7-battle-ops.mjs';

import { WORLD_RESPONSE_OBJECT_SIZES } from '../../src/server/logh7-login-protocol.mjs';

/** Build a raw client inner: [u16 BE code][body]. */
function rawInner(code, body) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(code & 0xffff, 0);
  return Buffer.concat([head, body]);
}

/** Decode the message32 receive form [u32 0][u16 BE code][LE payload] every builder returns. */
function decode(inner) {
  return { prefix: inner.readUInt32BE(0), code: inner.readUInt16BE(4), payload: inner.subarray(6) };
}

/** Write the shared 3-dword header into a body for parser tests. */
function writeHeader(body, time = 0x11111111, wait = 0x22222222, field8 = 0x33333333) {
  body.writeUInt32LE(time, 0x00);
  body.writeUInt32LE(wait, 0x04);
  body.writeUInt32LE(field8, 0x08);
}

// =================================================================================================
// PARSERS — offsets
// =================================================================================================

test('parseInboundTurn reads count@0x0c, 8B entries {id,heading}@0x10, turnParam@0x110', () => {
  const body = Buffer.alloc(0x114);
  writeHeader(body);
  body.writeUInt8(2, 0x0c);
  body.writeUInt32LE(501, 0x10);
  body.writeFloatLE(1.5, 0x14);
  body.writeUInt32LE(502, 0x18);
  body.writeFloatLE(-2.0, 0x1c);
  body.writeFloatLE(0.25, 0x110);
  const p = parseInboundTurn(rawInner(COMMAND_TURN_SHIP_CODE, body));
  assert.equal(p.time, 0x11111111);
  assert.equal(p.count, 2);
  assert.deepEqual(p.units.map((u) => u.shipId), [501, 502]);
  assert.ok(Math.abs(p.units[0].heading - 1.5) < 1e-6);
  assert.ok(Math.abs(p.units[1].heading + 2.0) < 1e-6);
  assert.ok(Math.abs(p.turnParam - 0.25) < 1e-6);
  assert.equal(parseInboundTurn(rawInner(COMMAND_TURN_SHIP_CODE, Buffer.alloc(4))), null);
});

test('parseInboundTurn clamps count to 32', () => {
  const body = Buffer.alloc(0x114);
  body.writeUInt8(99, 0x0c);
  const p = parseInboundTurn(rawInner(COMMAND_REVERSE_SHIP_CODE, body));
  assert.equal(p.count, 32);
});

test('parseInboundRepairSupply reads target@0x0c, source@0x10', () => {
  const body = Buffer.alloc(0x14);
  writeHeader(body);
  body.writeUInt32LE(700, 0x0c);
  body.writeUInt32LE(800, 0x10);
  const p = parseInboundRepairSupply(rawInner(COMMAND_REPAIR_FLEET_CODE, body));
  assert.equal(p.targetUnitId, 700);
  assert.equal(p.sourceUnitId, 800);
  assert.equal(parseInboundRepairSupply(rawInner(COMMAND_REPAIR_FLEET_CODE, Buffer.alloc(8))), null);
});

test('parseInboundEmergencySupply reads targetId@0x0c, amount@0x10', () => {
  const body = Buffer.alloc(0x14);
  body.writeUInt32LE(701, 0x0c);
  body.writeUInt32LE(55, 0x10);
  const p = parseInboundEmergencySupply(rawInner(COMMAND_EMERGENCY_SUPPLY_CODE, body));
  assert.equal(p.targetId, 701);
  assert.equal(p.amount, 55);
});

test('parseInboundEncourageFlagship reads flagshipId@0x0c', () => {
  const body = Buffer.alloc(0x10);
  body.writeUInt32LE(909, 0x0c);
  const p = parseInboundEncourageFlagship(rawInner(COMMAND_ENCOURAGE_FLAGSHIP_CODE, body));
  assert.equal(p.flagshipId, 909);
  assert.equal(parseInboundEncourageFlagship(rawInner(COMMAND_ENCOURAGE_FLAGSHIP_CODE, Buffer.alloc(4))), null);
});

test('parseInboundBaseSingle reads baseId@0x0c', () => {
  const body = Buffer.alloc(0x10);
  body.writeUInt32LE(42, 0x0c);
  const p = parseInboundBaseSingle(rawInner(COMMAND_STOP_BASE_CODE, body));
  assert.equal(p.baseId, 42);
});

test('parseInboundSuggestion reads target/type/arg @0x0c/0x10/0x14', () => {
  const body = Buffer.alloc(0x18);
  body.writeUInt32LE(11, 0x0c);
  body.writeUInt32LE(3, 0x10);
  body.writeUInt32LE(99, 0x14);
  const p = parseInboundSuggestion(rawInner(COMMAND_SUGGESTION_CODE, body));
  assert.deepEqual([p.targetId, p.suggestionType, p.arg], [11, 3, 99]);
});

test('parseInboundControl reads unit/condenser/beam/shield[6]/engine/warp/sensor', () => {
  const body = Buffer.alloc(0x20);
  writeHeader(body);
  body.writeUInt32LE(0x1234, 0x0c); // unit
  body.writeUInt16LE(0x0abc, 0x10); // condenser
  body.writeUInt8(7, 0x12); // beam
  body.writeUInt8(8, 0x13); // aux
  for (let i = 0; i < 6; i += 1) body.writeUInt8(10 + i, 0x14 + i); // shield[6]
  body.writeUInt8(3, 0x1a); // engine
  body.writeUInt8(4, 0x1b); // warp
  body.writeUInt8(5, 0x1c); // sensor
  const p = parseInboundControl(rawInner(COMMAND_CONTROL_CODE, body));
  assert.equal(p.unit, 0x1234);
  assert.equal(p.condenser, 0x0abc);
  assert.equal(p.beam, 7);
  assert.equal(p.aux, 8);
  assert.deepEqual(p.shield, [10, 11, 12, 13, 14, 15]);
  assert.deepEqual([p.engine, p.warp, p.sensor], [3, 4, 5]);
});

test('parseInboundAdmission reads 4-dword header targetId@0x0c, target_size@0x10, ids@0x14', () => {
  const body = Buffer.alloc(0x94);
  writeHeader(body);
  body.writeUInt32LE(0x500, 0x0c); // targetId
  body.writeUInt8(3, 0x10); // target_size
  body.writeUInt32LE(1, 0x14);
  body.writeUInt32LE(2, 0x18);
  body.writeUInt32LE(3, 0x1c);
  const p = parseInboundAdmission(rawInner(COMMAND_ADMISSION_CODE, body));
  assert.equal(p.targetId, 0x500);
  assert.equal(p.count, 3);
  assert.deepEqual(p.unitIds, [1, 2, 3]);
});

test('parseInboundIdList reads count@0x0c, ids@0x10', () => {
  const body = Buffer.alloc(0x98);
  body.writeUInt8(2, 0x0c);
  body.writeUInt32LE(71, 0x10);
  body.writeUInt32LE(72, 0x14);
  const p = parseInboundIdList(rawInner(COMMAND_AIR_BATTLE_CODE, body));
  assert.deepEqual(p.unitIds, [71, 72]);
});

test('parseInboundShootFortress reads fortressId@0x0c, angle f32@0x10', () => {
  const body = Buffer.alloc(0x14);
  writeHeader(body);
  body.writeUInt32LE(5, 0x0c);
  body.writeFloatLE(0.75, 0x10);
  const p = parseInboundShootFortress(rawInner(COMMAND_SHOOT_FORTRESS_CODE, body));
  assert.equal(p.fortressId, 5);
  assert.ok(Math.abs(p.angle - 0.75) < 1e-6);
});

test('parseInboundMoveFortress reads fortressId@0x0c, start xyz, waypointCount@0x20, waypoints@0x28', () => {
  const body = Buffer.alloc(0x1a4);
  writeHeader(body);
  body.writeUInt32LE(9, 0x0c);
  body.writeFloatLE(1.0, 0x10);
  body.writeFloatLE(2.0, 0x14);
  body.writeFloatLE(3.0, 0x18);
  body.writeUInt32LE(0xaa, 0x1c); // param
  body.writeUInt8(2, 0x20); // waypoint count
  body.writeFloatLE(10, 0x28); body.writeFloatLE(11, 0x2c); body.writeFloatLE(12, 0x30);
  body.writeFloatLE(20, 0x34); body.writeFloatLE(21, 0x38); body.writeFloatLE(22, 0x3c);
  const p = parseInboundMoveFortress(rawInner(COMMAND_MOVE_FORTRESS_CODE, body));
  assert.equal(p.fortressId, 9);
  assert.equal(p.param, 0xaa);
  assert.equal(p.count, 2);
  assert.deepEqual(p.waypoints[0], { x: 10, y: 11, z: 12 });
  assert.deepEqual(p.waypoints[1], { x: 20, y: 21, z: 22 });
});

test('parseInboundChangeAuthority reads ids@0x10 then newCommanderId@0x90', () => {
  const body = Buffer.alloc(0x94);
  writeHeader(body);
  body.writeUInt8(2, 0x0c);
  body.writeUInt32LE(301, 0x10);
  body.writeUInt32LE(302, 0x14);
  body.writeUInt32LE(0xc0de, 0x90);
  const p = parseInboundChangeAuthority(rawInner(COMMAND_CHANGE_AUTHORITY_CODE, body));
  assert.deepEqual(p.unitIds, [301, 302]);
  assert.equal(p.newCommanderId, 0xc0de);
});

test('parseInboundMission reads ids@0x10, flagA@0x90, flagB@0x91, missionTarget@0x94', () => {
  const body = Buffer.alloc(0x98);
  writeHeader(body);
  body.writeUInt8(1, 0x0c);
  body.writeUInt32LE(401, 0x10);
  body.writeUInt8(1, 0x90); // flagA (occupation)
  body.writeUInt8(2, 0x91); // flagB
  body.writeUInt32LE(0xbeef, 0x94); // missionTarget
  const p = parseInboundMission(rawInner(COMMAND_MISSION_CODE, body));
  assert.deepEqual(p.unitIds, [401]);
  assert.equal(p.flagA, 1);
  assert.equal(p.flagB, 2);
  assert.equal(p.missionTarget, 0xbeef);
});

test('parseInboundFileFleet reads 20B move entries@0x10, flag@0x290', () => {
  const body = Buffer.alloc(0x294);
  writeHeader(body);
  body.writeUInt8(1, 0x0c);
  body.writeUInt32LE(601, 0x10); // shipId
  body.writeFloatLE(0.5, 0x14); // heading
  body.writeFloatLE(100, 0x18); // x
  body.writeFloatLE(200, 0x1c); // z
  body.writeFloatLE(0, 0x20); // y
  body.writeUInt32LE(1, 0x290); // flag = engage
  const p = parseInboundFileFleet(rawInner(COMMAND_FILE_FLEET_CODE, body));
  assert.equal(p.count, 1);
  assert.equal(p.entries[0].shipId, 601);
  assert.ok(Math.abs(p.entries[0].x - 100) < 1e-4);
  assert.ok(Math.abs(p.entries[0].z - 200) < 1e-4);
  assert.equal(p.flag, 1);
});

// =================================================================================================
// NOTIFY BUILDERS — dispatch size + framing + fields
// =================================================================================================

test('every notify builder emits the message32 frame at the dispatch ground-truth size', () => {
  const cases = [
    [buildNotifyEncourageFlagshipInner({ unitIds: [1], morale: 5 }), NOTIFY_ENCOURAGE_FLAGSHIP_CODE],
    [buildNotifyEncourageBaseInner({ unitIds: [1], morale: 5 }), NOTIFY_ENCOURAGE_BASE_CODE],
    [buildNotifyRepairFleetInner({ targetId: 1, sourceId: 2 }), NOTIFY_REPAIR_FLEET_CODE],
    [buildNotifySupplyFleetInner({ targetId: 1, sourceId: 2 }), NOTIFY_SUPPLY_FLEET_CODE],
    [buildNotifyRepairBaseInner({ targetId: 1 }), NOTIFY_REPAIR_BASE_CODE],
    [buildNotifySupplyBaseInner({ targetId: 1 }), NOTIFY_SUPPLY_BASE_CODE],
    [buildNotifyEmergencySupplyBaseInner({ baseId: 1, unitId: 2, amount: 3 }), NOTIFY_EMERGENCY_SUPPLY_BASE_CODE],
    [buildNotifyShootFortressInner({ fortressId: 1, arg: 2, targetIds: [3, 4] }), NOTIFY_SHOOT_FORTRESS_CODE],
    [buildNotifyShootBaseInner({ baseId: 1, targetId: 2 }), NOTIFY_SHOOT_BASE_CODE],
    [buildNotifyMovedFortressInner({ fortressId: 1, x: 1, y: 2, z: 3 }), NOTIFY_MOVED_FORTRESS_CODE],
    [buildNotifyChangedAuthorityInner({ newCommanderId: 9, unitIds: [1, 2] }), NOTIFY_CHANGED_AUTHORITY_CODE],
    [buildNotifyAirBattleInner({ attackerId: 1, targetId: 2 }), NOTIFY_AIR_BATTLE_CODE],
    [buildNotifyMissionResultInner({ unitId: 1, missionId: 2, result: 1 }), NOTIFY_MISSION_RESULT_CODE],
    [buildNotifyFinishOccupationInner({ baseId: 1, newOwner: 2 }), NOTIFY_FINISH_OCCUPATION_CODE],
    [buildNotifyTacticsChiefCommanderInner({ charId: 1, unitId: 2 }), NOTIFY_TACTICS_CHIEF_COMMANDER_CODE],
    [buildNotifyCharacterAchievementInner({ id: 1, kind: 2, value: 3 }), NOTIFY_CHARACTER_ACHIEVEMENT_CODE],
    [buildNotifyOutfitAchievementInner({ id: 1, kind: 2, value: 3 }), NOTIFY_OUTFIT_ACHIEVEMENT_CODE],
    [buildNotifyConfusionUnitInner({ unitId: 1 }), NOTIFY_CONFUSION_UNIT_CODE],
    [buildNotifyConfusionRecoveredUnitInner({ unitId: 1 }), NOTIFY_CONFUSION_RECOVERED_UNIT_CODE],
    [buildNotifyBlackHoleSuctionInner({ unitId: 1 }), NOTIFY_BLACK_HOLE_SUCTION_CODE],
  ];
  // 0x42d/0x42e route via a shared dispatch `goto` group (size 0x10) and are NOT enumerated
  // individually in WORLD_RESPONSE_OBJECT_SIZES; the spec (fleetops §7) fixes them at 16B.
  const SHARED_GROUP_16B = new Set([NOTIFY_REPAIR_FLEET_CODE, NOTIFY_SUPPLY_FLEET_CODE]);
  for (const [inner, code] of cases) {
    const d = decode(inner);
    assert.equal(d.prefix, 0, `code 0x${code.toString(16)} prefix`);
    assert.equal(d.code, code, `code 0x${code.toString(16)} mismatch`);
    const expectedSize = WORLD_RESPONSE_OBJECT_SIZES[code] ?? (SHARED_GROUP_16B.has(code) ? 0x10 : undefined);
    assert.equal(expectedSize !== undefined, true, `code 0x${code.toString(16)} has a known size`);
    assert.equal(d.payload.length, expectedSize, `code 0x${code.toString(16)} size`);
  }
});

test('buildNotifyEncourageFlagship packs count@0x00, ids@0x04, move_morale s16@0xf8', () => {
  const p = decode(buildNotifyEncourageFlagshipInner({ unitIds: [11, 22, 33], morale: -7 })).payload;
  assert.equal(p.readUInt8(0x00), 3);
  assert.equal(p.readUInt32LE(0x04), 11);
  assert.equal(p.readUInt32LE(0x08), 22);
  assert.equal(p.readUInt32LE(0x0c), 33);
  assert.equal(p.readInt16LE(0xf8), -7);
});

test('buildNotifyShootFortress packs fortressId/arg/hitCount/targetIds', () => {
  const p = decode(buildNotifyShootFortressInner({ fortressId: 5, arg: 0xabcd, targetIds: [100, 200] })).payload;
  assert.equal(p.readUInt32LE(0x00), 5);
  assert.equal(p.readUInt32LE(0x04), 0xabcd);
  assert.equal(p.readUInt8(0x08), 2);
  assert.equal(p.readUInt32LE(0x0c), 100);
  assert.equal(p.readUInt32LE(0x10), 200);
});

test('buildNotifyChangedAuthority puts commander@0x00 then count@0x04 then ids@0x08', () => {
  const p = decode(buildNotifyChangedAuthorityInner({ newCommanderId: 0xc0de, unitIds: [7, 8] })).payload;
  assert.equal(p.readUInt32LE(0x00), 0xc0de);
  assert.equal(p.readUInt8(0x04), 2);
  assert.equal(p.readUInt32LE(0x08), 7);
  assert.equal(p.readUInt32LE(0x0c), 8);
});

test('buildNotifyMovedFortress packs fortressId@0x00 + xyz floats', () => {
  const p = decode(buildNotifyMovedFortressInner({ fortressId: 3, x: 1.5, y: 2.5, z: 3.5 })).payload;
  assert.equal(p.readUInt32LE(0x00), 3);
  assert.ok(Math.abs(p.readFloatLE(0x04) - 1.5) < 1e-6);
  assert.ok(Math.abs(p.readFloatLE(0x08) - 2.5) < 1e-6);
  assert.ok(Math.abs(p.readFloatLE(0x0c) - 3.5) < 1e-6);
});

// =================================================================================================
// processBattleOps — validate / mutate / broadcast
// =================================================================================================

function turnBody(units) {
  const body = Buffer.alloc(0x114);
  body.writeUInt8(units.length, 0x0c);
  units.forEach((u, i) => {
    body.writeUInt32LE(u.shipId, 0x10 + i * 8);
    body.writeFloatLE(u.heading ?? 0, 0x14 + i * 8);
  });
  return body;
}

test('processBattleOps Turn → NotifyTurnedShip 0x424 per owned unit', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 501, owner: 1 });
  const res = processBattleOps({
    state, connectionId: 1, innerCode: COMMAND_TURN_SHIP_CODE,
    inner: rawInner(COMMAND_TURN_SHIP_CODE, turnBody([{ shipId: 501, heading: 1.2 }])),
  });
  assert.equal(res.accept, true);
  assert.equal(res.notifies.length, 1);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_TURNED_SHIP_CODE);
});

test('processBattleOps rejects a unit owned by another connection', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 501, owner: 2 });
  const res = processBattleOps({
    state, connectionId: 1, innerCode: COMMAND_TURN_SHIP_CODE,
    inner: rawInner(COMMAND_TURN_SHIP_CODE, turnBody([{ shipId: 501 }])),
  });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'not-owner');
});

test('processBattleOps Stop → NotifyMovedShip 0x423 halt at current pose', () => {
  const state = createBattleOpsState();
  const u = state.addUnit({ id: 7, owner: 1 });
  u.x = 50; u.y = 0; u.z = 60;
  const res = processBattleOps({
    state, connectionId: 1, innerCode: COMMAND_STOP_CODE,
    inner: rawInner(COMMAND_STOP_CODE, turnBody([{ shipId: 7 }])),
  });
  assert.equal(res.accept, true);
  const d = decode(res.notifies[0].inner);
  assert.equal(d.code, NOTIFY_MOVED_SHIP_CODE);
});

test('processBattleOps RepairFleet tags the target (2) and records supplier', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 700, owner: 1 });
  const body = Buffer.alloc(0x14);
  body.writeUInt32LE(700, 0x0c);
  body.writeUInt32LE(800, 0x10);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_REPAIR_FLEET_CODE, inner: rawInner(COMMAND_REPAIR_FLEET_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(state.getUnit(700).repairTag, 2);
  assert.equal(state.getUnit(700).supplier, 800);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_REPAIR_FLEET_CODE);
});

test('processBattleOps SupplyFleet tags the target (1)', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 700, owner: 1 });
  const body = Buffer.alloc(0x14);
  body.writeUInt32LE(700, 0x0c);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_SUPPLY_FLEET_CODE, inner: rawInner(COMMAND_SUPPLY_FLEET_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(state.getUnit(700).repairTag, 1);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_SUPPLY_FLEET_CODE);
});

test('processBattleOps EncourageFlagship raises morale toward 艦隊最大士気 and broadcasts 0x42c', () => {
  const state = createBattleOpsState();
  // 사기 50(상한 100 미만) → 격려가 +10으로 60까지 회복(3.3 캐논: 상한 내에서 회복).
  state.addUnit({ id: 909, owner: 1, morale: 50 });
  const body = Buffer.alloc(0x10);
  body.writeUInt32LE(909, 0x0c);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_ENCOURAGE_FLAGSHIP_CODE, inner: rawInner(COMMAND_ENCOURAGE_FLAGSHIP_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(state.getUnit(909).morale, 60);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_ENCOURAGE_FLAGSHIP_CODE);
});

test('processBattleOps EncourageFlagship: 艦隊最大士気(maxMorale) 상한을 넘지 못한다 (3.3, 0x7fff 과허용 제거)', () => {
  const state = createBattleOpsState();
  // 統率 0 사령관 → maxMorale=fleetMaxMorale(0)=50. 사기 48에서 격려해도 50 상한.
  state.addUnit({ id: 910, owner: 1, morale: 48, leadership: 0 });
  assert.equal(state.getUnit(910).maxMorale, 50, '統率0 → 상한 50(MORALE_FLOOR_CAP)');
  const body = Buffer.alloc(0x10);
  body.writeUInt32LE(910, 0x0c);
  processBattleOps({ state, connectionId: 1, innerCode: COMMAND_ENCOURAGE_FLAGSHIP_CODE, inner: rawInner(COMMAND_ENCOURAGE_FLAGSHIP_CODE, body) });
  assert.equal(state.getUnit(910).morale, 50, '48+10=58이지만 상한 50으로 clamp');
  // 高統率(100) 사령관 → 상한 100, 초기 사기도 상한으로 clamp.
  state.addUnit({ id: 911, owner: 1, morale: 200, leadership: 100 });
  assert.equal(state.getUnit(911).maxMorale, 100, '統率100 → 상한 MORALE_MAX');
  assert.equal(state.getUnit(911).morale, 100, '초기 사기도 상한으로 clamp(200→100)');
});

test('processBattleOps EncourageBase raises base morale and broadcasts 0x432', () => {
  const state = createBattleOpsState();
  state.addBase({ id: 3, owner: 1 });
  const body = Buffer.alloc(0x10);
  body.writeUInt32LE(3, 0x0c);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_ENCOURAGE_BASE_CODE, inner: rawInner(COMMAND_ENCOURAGE_BASE_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(state.getBase(3).morale, 110);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_ENCOURAGE_BASE_CODE);
});

test('processBattleOps Control stores the per-ship subsystem profile, no notify', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 0x1234, owner: 1 });
  const body = Buffer.alloc(0x20);
  body.writeUInt32LE(0x1234, 0x0c);
  body.writeUInt16LE(50, 0x10);
  body.writeUInt8(9, 0x12);
  for (let i = 0; i < 6; i += 1) body.writeUInt8(i, 0x14 + i);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_CONTROL_CODE, inner: rawInner(COMMAND_CONTROL_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(res.notifies.length, 0);
  assert.equal(state.getUnit(0x1234).control.condenser, 50);
  assert.equal(state.getUnit(0x1234).control.beam, 9);
});

test('processBattleOps ShootFortress broadcasts 0x436 with the angle bits echoed', () => {
  const state = createBattleOpsState();
  state.addFortress({ id: 5, owner: 1 });
  const body = Buffer.alloc(0x14);
  body.writeUInt32LE(5, 0x0c);
  body.writeFloatLE(0.5, 0x10);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_SHOOT_FORTRESS_CODE, inner: rawInner(COMMAND_SHOOT_FORTRESS_CODE, body) });
  assert.equal(res.accept, true);
  const p = decode(res.notifies[0].inner).payload;
  assert.equal(p.readUInt32LE(0x00), 5);
  const expected = Buffer.alloc(4); expected.writeFloatLE(0.5, 0); // angle bits
  assert.equal(p.readUInt32LE(0x04), expected.readUInt32LE(0));
});

test('processBattleOps MoveFortress moves to the final waypoint and broadcasts 0x435', () => {
  const state = createBattleOpsState();
  state.addFortress({ id: 9, owner: 1 });
  const body = Buffer.alloc(0x1a4);
  body.writeUInt32LE(9, 0x0c);
  body.writeUInt8(2, 0x20);
  body.writeFloatLE(10, 0x28); body.writeFloatLE(0, 0x2c); body.writeFloatLE(12, 0x30);
  body.writeFloatLE(99, 0x34); body.writeFloatLE(0, 0x38); body.writeFloatLE(88, 0x3c);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_MOVE_FORTRESS_CODE, inner: rawInner(COMMAND_MOVE_FORTRESS_CODE, body) });
  assert.equal(res.accept, true);
  assert.ok(Math.abs(state.getFortress(9).x - 99) < 1e-4);
  assert.ok(Math.abs(state.getFortress(9).z - 88) < 1e-4);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_MOVED_FORTRESS_CODE);
});

test('processBattleOps ChangeAuthority sets commander on each unit and broadcasts 0x439', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 301, owner: 1 });
  state.addUnit({ id: 302, owner: 1 });
  const body = Buffer.alloc(0x94);
  body.writeUInt8(2, 0x0c);
  body.writeUInt32LE(301, 0x10);
  body.writeUInt32LE(302, 0x14);
  body.writeUInt32LE(0xc0de, 0x90);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_CHANGE_AUTHORITY_CODE, inner: rawInner(COMMAND_CHANGE_AUTHORITY_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(state.getUnit(301).commander, 0xc0de);
  assert.equal(state.getUnit(302).commander, 0xc0de);
  const p = decode(res.notifies[0].inner).payload;
  assert.equal(p.readUInt32LE(0x00), 0xc0de);
  assert.equal(p.readUInt8(0x04), 2);
});

test('processBattleOps Mission with occupation flag emits 0x43c per unit + 0x442', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 401, owner: 1 });
  state.addBase({ id: 0xbeef, owner: 0 });
  const body = Buffer.alloc(0x98);
  body.writeUInt8(1, 0x0c);
  body.writeUInt32LE(401, 0x10);
  body.writeUInt8(1, 0x90); // flagA = occupation
  body.writeUInt32LE(0xbeef, 0x94);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_MISSION_CODE, inner: rawInner(COMMAND_MISSION_CODE, body) });
  assert.equal(res.accept, true);
  const codes = res.notifies.map((n) => decode(n.inner).code);
  assert.ok(codes.includes(NOTIFY_MISSION_RESULT_CODE));
  assert.ok(codes.includes(NOTIFY_FINISH_OCCUPATION_CODE));
  assert.equal(state.getBase(0xbeef).occupiedBy, 1);
});

function airBattleBody(ids) {
  const body = Buffer.alloc(0x98);
  body.writeUInt8(ids.length, 0x0c);
  ids.forEach((id, i) => body.writeUInt32LE(id, 0x10 + i * 4));
  return body;
}

test('processBattleOps AirBattle broadcasts 0x428', () => {
  const state = createBattleOpsState();
  // AU-1: 발진 게이트 통과를 위해 物資 시드(≥10). 戦闘艇 5기.
  state.addUnit({ id: 71, owner: 1, supplies: 50, fighters: 5 });
  state.addUnit({ id: 72, owner: 2 });
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_AIR_BATTLE_CODE, inner: rawInner(COMMAND_AIR_BATTLE_CODE, airBattleBody([71, 72])) });
  assert.equal(res.accept, true);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_AIR_BATTLE_CODE);
});

test('AU-1 AirBattle: 物資<10 발진 실패 → result 0, 상태 불변(보수적 게이트)', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 71, owner: 1, supplies: 9, fighters: 5 }); // 정액 10 미만
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_AIR_BATTLE_CODE, inner: rawInner(COMMAND_AIR_BATTLE_CODE, airBattleBody([71, 72])) });
  assert.equal(res.accept, true);
  assert.equal(res.launched, false);
  const p = decode(res.notifies[0].inner).payload;
  assert.equal(p.readUInt32LE(0x08), 0, 'result=0(발진 실패)');
  assert.equal(state.getUnit(71).supplies, 9, '物資 불변');
  assert.equal(state.getUnit(71).fighters, 5, '戦闘艇 불변');
});

test('AU-1 AirBattle: 對艦 발진 시 result=damage(스텁 1 아님), 物資 10 차감, 戦闘艇 보존', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 71, owner: 1, supplies: 30, fighters: 10 });
  state.addUnit({ id: 72, owner: 2, fighters: 4 });
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_AIR_BATTLE_CODE, inner: rawInner(COMMAND_AIR_BATTLE_CODE, airBattleBody([71, 72])) });
  assert.equal(res.accept, true);
  assert.equal(res.launched, true);
  assert.equal(res.mode, 'anti-ship');
  const p = decode(res.notifies[0].inner).payload;
  // 對艦 피해 = fighters(10) × FIGHTER_ATTACK_PER(2) = 20 → result/a 에 반영(스텁 1 아님)
  assert.equal(p.readUInt32LE(0x08), 20, 'result=damage');
  assert.equal(p.readUInt32LE(0x0c), 20, 'a=damage');
  assert.equal(state.getUnit(71).supplies, 20, '物資 30-10');
  assert.equal(state.getUnit(71).fighters, 10, '對艦은 발진측 戦闘艇 손실 없음');
});

test('AU-1 AirBattle: 戦闘艇 수에 따라 result(damage)가 달라짐(엔진 연결 확인)', () => {
  const mk = (fighters) => {
    const state = createBattleOpsState();
    state.addUnit({ id: 71, owner: 1, supplies: 50, fighters });
    const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_AIR_BATTLE_CODE, inner: rawInner(COMMAND_AIR_BATTLE_CODE, airBattleBody([71, 0])) });
    return decode(res.notifies[0].inner).payload.readUInt32LE(0x08);
  };
  assert.notEqual(mk(5), mk(50), '戦闘艇 5기 vs 50기 피해 상이');
});

test('AU-1 AirBattle: 다른 연결 소유 발진함은 not-owner 거부(기존 게이트 유지)', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 71, owner: 2, supplies: 50, fighters: 5 });
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_AIR_BATTLE_CODE, inner: rawInner(COMMAND_AIR_BATTLE_CODE, airBattleBody([71, 72])) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'not-owner');
});

test('processBattleOps FileFleet moves each ship and broadcasts 0x423 per ship', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 601, owner: 1 });
  const body = Buffer.alloc(0x294);
  body.writeUInt8(1, 0x0c);
  body.writeUInt32LE(601, 0x10);
  body.writeFloatLE(0.5, 0x14);
  body.writeFloatLE(100, 0x18);
  body.writeFloatLE(200, 0x1c);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_FILE_FLEET_CODE, inner: rawInner(COMMAND_FILE_FLEET_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_MOVED_SHIP_CODE);
  assert.ok(Math.abs(state.getUnit(601).x - 100) < 1e-4);
});

test('processBattleOps EmergencySupply broadcasts 0x438', () => {
  const state = createBattleOpsState();
  state.addUnit({ id: 701, owner: 1 });
  const body = Buffer.alloc(0x14);
  body.writeUInt32LE(701, 0x0c);
  body.writeUInt32LE(33, 0x10);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_EMERGENCY_SUPPLY_CODE, inner: rawInner(COMMAND_EMERGENCY_SUPPLY_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_EMERGENCY_SUPPLY_BASE_CODE);
});

test('processBattleOps Suggestion accepts with no broadcast', () => {
  const state = createBattleOpsState();
  const body = Buffer.alloc(0x18);
  body.writeUInt32LE(11, 0x0c);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_SUGGESTION_CODE, inner: rawInner(COMMAND_SUGGESTION_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(res.notifies.length, 0);
});

test('processBattleOps RepairBase validates base ownership and broadcasts 0x433', () => {
  const state = createBattleOpsState();
  state.addBase({ id: 0x500, owner: 1 });
  const body = Buffer.alloc(0x94);
  body.writeUInt32LE(0x500, 0x0c);
  body.writeUInt8(1, 0x10);
  body.writeUInt32LE(42, 0x14);
  const res = processBattleOps({ state, connectionId: 1, innerCode: COMMAND_REPAIR_BASE_CODE, inner: rawInner(COMMAND_REPAIR_BASE_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(decode(res.notifies[0].inner).code, NOTIFY_REPAIR_BASE_CODE);
});

test('processBattleOps unknown code rejects', () => {
  const res = processBattleOps({ state: createBattleOpsState(), connectionId: 1, innerCode: 0x9999, inner: rawInner(0x9999, Buffer.alloc(0x20)) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'unknown-battle-op');
});
