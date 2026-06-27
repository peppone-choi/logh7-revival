/**
 * Strategic-map + logistics (内政) domain tests — parsers (byte-exact offsets), builders (size/fields),
 * the self-contained state store, and the processLogistics accept/reject/notify contract. Pure /
 * synchronous: no live client. Wire layouts per docs/logh7-proto-strategic-logistics.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLogisticsState,
  processLogistics,
  parseInboundMoveBase,
  parseInboundSupplyFuel,
  parseInboundSearch,
  parseInboundTroopTransfer,
  parseInboundSwitchMode,
  parseInboundReorganization,
  parseInboundCarryingInOut,
  parseInboundMoveInstitutionSpot,
  parseInboundLogisticsHeader,
  buildEcho,
  buildNotifyMovedBaseInner,
  buildNotifySuppliedFuelInner,
  buildNotifySearchInner,
  buildNotifyLeaveOutGridInner,
  COMMAND_MOVE_BASE_CODE,
  COMMAND_SUPPLY_FUEL_CODE,
  COMMAND_SEARCH_CODE,
  COMMAND_LOAD_TROOP_CODE,
  COMMAND_UNLOAD_TROOP_CODE,
  COMMAND_SWITCH_MODE_CODE,
  COMMAND_REORGANIZATION_CODE,
  COMMAND_CARRYING_IN_OUT_CODE,
  COMMAND_COMPLETENESS_REPAIR_CODE,
  COMMAND_CARRYING_OUT_CODE,
  COMMAND_MOVE_INSTITUTION_SPOT_CODE,
  NOTIFY_MOVED_BASE_CODE,
  NOTIFY_SUPPLIED_FUEL_CODE,
  NOTIFY_SEARCH_CODE,
  NOTIFY_LEAVE_OUT_GRID_CODE,
  COMMAND_MOVE_BASE_BYTES,
  COMMAND_SUPPLY_FUEL_BYTES,
  COMMAND_SEARCH_BYTES,
  COMMAND_TROOP_TRANSFER_BYTES,
  COMMAND_SWITCH_MODE_BYTES,
  COMMAND_REORGANIZATION_BYTES,
  COMMAND_CARRYING_IN_OUT_BYTES,
  COMMAND_COMPLETENESS_REPAIR_BYTES,
  COMMAND_CARRYING_OUT_BYTES,
  COMMAND_MOVE_INSTITUTION_SPOT_BYTES,
  NOTIFY_MOVED_BASE_BYTES,
  NOTIFY_SUPPLIED_FUEL_BYTES,
  NOTIFY_SEARCH_BYTES,
  NOTIFY_LEAVE_OUT_GRID_BYTES,
  LOGISTICS_COMMAND_CODES,
} from '../../src/server/logh7-logistics.mjs';

/** Build a raw client inner: [u16 BE code][LE body]. */
function rawInner(code, body) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(code & 0xffff, 0);
  return Buffer.concat([head, body]);
}

// =====================================================================================
// PARSERS — exact body offsets
// =====================================================================================

test('parseInboundMoveBase reads seq/result/baseId@0x08/target@0x0c (32B)', () => {
  const body = Buffer.alloc(COMMAND_MOVE_BASE_BYTES);
  body.writeUInt32LE(1, 0x00);
  body.writeUInt32LE(2, 0x04);
  body.writeUInt32LE(500, 0x08); // baseId
  body.writeUInt32LE(42, 0x0c); // target cell
  body.writeUInt32LE(7, 0x10);
  const p = parseInboundMoveBase(rawInner(COMMAND_MOVE_BASE_CODE, body));
  assert.equal(p.seq, 1);
  assert.equal(p.result, 2);
  assert.equal(p.baseId, 500);
  assert.equal(p.target, 42);
  assert.equal(p.params[0], 7);
  assert.equal(parseInboundMoveBase(rawInner(COMMAND_MOVE_BASE_CODE, Buffer.alloc(8))), null);
});

test('parseInboundSupplyFuel reads targetUnitId@0x08, fuelA@0x10, fuelB@0x14 (24B)', () => {
  const body = Buffer.alloc(COMMAND_SUPPLY_FUEL_BYTES);
  body.writeUInt32LE(77, 0x08); // targetUnitId
  body.writeUInt32LE(800, 0x10); // fuelA
  body.writeUInt32LE(600, 0x14); // fuelB
  const p = parseInboundSupplyFuel(rawInner(COMMAND_SUPPLY_FUEL_CODE, body));
  assert.equal(p.targetUnitId, 77);
  assert.equal(p.fuelA, 800);
  assert.equal(p.fuelB, 600);
  assert.equal(parseInboundSupplyFuel(rawInner(COMMAND_SUPPLY_FUEL_CODE, Buffer.alloc(8))), null);
});

test('parseInboundSearch reads searcherUnitId@0x08, targetCell@0x0c, mode@0x10 (20B)', () => {
  const body = Buffer.alloc(COMMAND_SEARCH_BYTES);
  body.writeUInt32LE(33, 0x08);
  body.writeUInt32LE(1234, 0x0c);
  body.writeUInt32LE(1, 0x10);
  const p = parseInboundSearch(rawInner(COMMAND_SEARCH_CODE, body));
  assert.equal(p.searcherUnitId, 33);
  assert.equal(p.targetCell, 1234);
  assert.equal(p.mode, 1);
});

test('parseInboundTroopTransfer reads container@0x08/target@0x0c/spot@0x10/u8 count@0x14/ids@0x18 (36B)', () => {
  const body = Buffer.alloc(COMMAND_TROOP_TRANSFER_BYTES);
  body.writeUInt32LE(900, 0x08); // baseOrFleetId
  body.writeUInt32LE(901, 0x0c); // targetId
  body.writeUInt32LE(5, 0x10); // spot
  body.writeUInt8(3, 0x14); // unitCount
  body.writeUInt32LE(11, 0x18);
  body.writeUInt32LE(22, 0x1c);
  body.writeUInt32LE(33, 0x20);
  const p = parseInboundTroopTransfer(rawInner(COMMAND_LOAD_TROOP_CODE, body));
  assert.equal(p.baseOrFleetId, 900);
  assert.equal(p.targetId, 901);
  assert.equal(p.spot, 5);
  assert.equal(p.unitCount, 3);
  assert.deepEqual(p.troopUnitIds, [11, 22, 33]);
});

test('parseInboundTroopTransfer clamps unitCount to the max-3 bound', () => {
  const body = Buffer.alloc(COMMAND_TROOP_TRANSFER_BYTES);
  body.writeUInt8(99, 0x14); // over-cap
  const p = parseInboundTroopTransfer(rawInner(COMMAND_UNLOAD_TROOP_CODE, body));
  assert.equal(p.unitCount, 3);
  assert.equal(p.troopUnitIds.length, 3);
});

test('parseInboundSwitchMode reads modeKind@0x14, unit array@0x18, char array@0x13c (356B)', () => {
  const body = Buffer.alloc(COMMAND_SWITCH_MODE_BYTES);
  body.writeUInt16LE(0x0102, 0x08); // modeFlags
  body.writeUInt16LE(1, 0x14); // modeKind (encounter)
  body.writeUInt8(2, 0x16); // unitSize
  body.writeUInt32LE(101, 0x18);
  body.writeUInt32LE(202, 0x1c);
  body.writeUInt32LE(0xabc, 0x130); // scalar1
  body.writeUInt8(2, 0x138); // charSize
  body.writeUInt32LE(7001, 0x13c);
  body.writeUInt32LE(7002, 0x140);
  const p = parseInboundSwitchMode(rawInner(COMMAND_SWITCH_MODE_CODE, body));
  assert.equal(p.modeFlags, 0x0102);
  assert.equal(p.modeKind, 1);
  assert.equal(p.unitSize, 2);
  assert.deepEqual(p.unitIds, [101, 202]);
  assert.equal(p.scalar1, 0xabc);
  assert.equal(p.charSize, 2);
  assert.deepEqual(p.characterIds, [7001, 7002]);
});

test('parseInboundReorganization reads outfits + move arrays (stride 6) (784B)', () => {
  const body = Buffer.alloc(COMMAND_REORGANIZATION_BYTES);
  body.writeUInt8(1, 0x08); // flag
  body.writeUInt32LE(10, 0x0c); // srcOutfit
  body.writeUInt32LE(20, 0x10); // dstOutfit
  body.writeUInt8(2, 0x1d); // moveShipsSize
  // ship[0] @0x1e
  body.writeUInt16LE(501, 0x1e);
  body.writeUInt8(3, 0x20);
  body.writeUInt16LE(0x55, 0x22);
  // ship[1] @0x24
  body.writeUInt16LE(502, 0x24);
  body.writeUInt8(4, 0x26);
  body.writeUInt8(1, 0x270); // moveTroopsSize
  body.writeUInt16LE(701, 0x274); // troop[0]
  body.writeUInt8(2, 0x276);
  body.writeUInt32LE(0xdead, 0x30c); // trailing scalar
  const p = parseInboundReorganization(rawInner(COMMAND_REORGANIZATION_CODE, body));
  assert.equal(p.flag, 1);
  assert.equal(p.srcOutfit, 10);
  assert.equal(p.dstOutfit, 20);
  assert.equal(p.moveShipsSize, 2);
  assert.deepEqual(p.moveShips, [
    { shipId: 501, destSlot: 3, param: 0x55 },
    { shipId: 502, destSlot: 4, param: 0 },
  ]);
  assert.equal(p.moveTroopsSize, 1);
  assert.deepEqual(p.moveTroops, [{ troopId: 701, destSlot: 2, param: 0 }]);
  assert.equal(p.scalar30c, 0xdead);
});

test('parseInboundCarryingInOut reads otherPackages@0x24 + troopPackages@0x3d (stride 8) (256B)', () => {
  const body = Buffer.alloc(COMMAND_CARRYING_IN_OUT_BYTES);
  body.writeUInt32LE(11, 0x0c); // source
  body.writeUInt32LE(22, 0x10); // dest
  body.writeUInt8(1, 0x20); // otherPackagesSize
  body.writeUInt8(9, 0x24); // typeA
  body.writeUInt8(8, 0x25); // typeB
  body.writeUInt32LE(1000, 0x28); // amount
  body.writeUInt8(2, 0x3c); // troopPackagesSize
  body.writeUInt8(1, 0x3d);
  body.writeUInt8(2, 0x3e);
  body.writeUInt32LE(50, 0x41);
  body.writeUInt8(3, 0x45);
  body.writeUInt32LE(75, 0x49);
  const p = parseInboundCarryingInOut(rawInner(COMMAND_CARRYING_IN_OUT_CODE, body));
  assert.equal(p.source, 11);
  assert.equal(p.dest, 22);
  assert.deepEqual(p.otherPackages, [{ typeA: 9, typeB: 8, amount: 1000 }]);
  assert.equal(p.troopPackagesSize, 2);
  assert.equal(p.troopPackages[0].typeA, 1);
  assert.equal(p.troopPackages[0].amount, 50);
  assert.equal(p.troopPackages[1].amount, 75);
});

test('parseInboundMoveInstitutionSpot reads institutionId@0x08, newX@0x10, newY@0x14 (24B)', () => {
  const body = Buffer.alloc(COMMAND_MOVE_INSTITUTION_SPOT_BYTES);
  body.writeUInt32LE(300, 0x08);
  body.writeUInt32LE(15, 0x10);
  body.writeUInt32LE(25, 0x14);
  const p = parseInboundMoveInstitutionSpot(rawInner(COMMAND_MOVE_INSTITUTION_SPOT_CODE, body));
  assert.equal(p.institutionId, 300);
  assert.equal(p.newX, 15);
  assert.equal(p.newY, 25);
});

test('parseInboundLogisticsHeader reads the standard {seq,result,targetId} header', () => {
  const body = Buffer.alloc(COMMAND_COMPLETENESS_REPAIR_BYTES);
  body.writeUInt32LE(5, 0x00);
  body.writeUInt32LE(6, 0x04);
  body.writeUInt32LE(444, 0x08);
  const p = parseInboundLogisticsHeader(rawInner(COMMAND_COMPLETENESS_REPAIR_CODE, body), COMMAND_COMPLETENESS_REPAIR_BYTES);
  assert.equal(p.seq, 5);
  assert.equal(p.result, 6);
  assert.equal(p.targetId, 444);
  assert.equal(p.bodyLength, COMMAND_COMPLETENESS_REPAIR_BYTES);
});

// =====================================================================================
// BUILDERS — exact size + field offsets (S->C message32: code @4, payload @6)
// =====================================================================================

test('buildNotifyMovedBaseInner is 68 bytes; baseId@0x08, newX@0x10, newY@0x14, chars@0x1c', () => {
  const inner = buildNotifyMovedBaseInner({ baseId: 500, routeScalar: 7, newX: 100, newY: 200, characterIds: [1, 2, 3] });
  assert.equal(inner.readUInt16BE(4), NOTIFY_MOVED_BASE_CODE);
  const p = inner.subarray(6);
  assert.equal(p.length, NOTIFY_MOVED_BASE_BYTES);
  assert.equal(p.readUInt32LE(0x08), 500);
  assert.equal(p.readUInt16LE(0x0c), 7);
  assert.equal(p.readUInt32LE(0x10), 100);
  assert.equal(p.readUInt32LE(0x14), 200);
  assert.equal(p.readUInt8(0x18), 3); // charCount
  assert.equal(p.readUInt32LE(0x1c), 1);
  assert.equal(p.readUInt32LE(0x20), 2);
  assert.equal(p.readUInt32LE(0x24), 3);
});

test('buildNotifySuppliedFuelInner is 576 bytes; sourceId@0x08, count@0x0c, units@0x10 stride 8', () => {
  const inner = buildNotifySuppliedFuelInner({ sourceId: 9, units: [{ unitId: 77, fuelAfter: 800 }, { unitId: 88, fuelAfter: 500 }] });
  assert.equal(inner.readUInt16BE(4), NOTIFY_SUPPLIED_FUEL_CODE);
  const p = inner.subarray(6);
  assert.equal(p.length, NOTIFY_SUPPLIED_FUEL_BYTES);
  assert.equal(p.readUInt32LE(0x08), 9);
  assert.equal(p.readUInt8(0x0c), 2);
  assert.equal(p.readUInt32LE(0x10), 77);
  assert.equal(p.readUInt32LE(0x14), 800);
  assert.equal(p.readUInt32LE(0x18), 88);
  assert.equal(p.readUInt32LE(0x1c), 500);
});

test('buildNotifySearchInner is 2716 bytes; searcherId@0x08, cellCount@0x0c, SearchEnemyInfo stride 12', () => {
  const inner = buildNotifySearchInner({
    searcherId: 33,
    cells: [
      { cell: 1234, enemies: [{ factionA: 1, factionB: 0, unitId: 555 }, { factionA: 1, factionB: 0, unitId: 666 }] },
      { cell: 4321, enemies: [] },
    ],
  });
  assert.equal(inner.readUInt16BE(4), NOTIFY_SEARCH_CODE);
  const p = inner.subarray(6);
  assert.equal(p.length, NOTIFY_SEARCH_BYTES);
  assert.equal(p.readUInt32LE(0x08), 33);
  assert.equal(p.readUInt8(0x0c), 2); // cellCount
  // cell[0] @0x10
  assert.equal(p.readUInt16LE(0x10), 1234);
  assert.equal(p.readUInt8(0x12), 2); // enemyCount
  assert.equal(p.readUInt8(0x14), 1); // enemy0 factionA
  assert.equal(p.readUInt16LE(0x16), 555); // enemy0 unitId
  assert.equal(p.readUInt16LE(0x1a), 666); // enemy1 unitId @0x14+4+2
  // cell[1] @0x10 + 12 = 0x1c
  assert.equal(p.readUInt16LE(0x1c), 4321);
  assert.equal(p.readUInt8(0x1e), 0); // no enemies
});

test('buildNotifyLeaveOutGridInner is 284 bytes; count@0, ids@4 stride 4', () => {
  const inner = buildNotifyLeaveOutGridInner({ unitIds: [10, 20, 30] });
  assert.equal(inner.readUInt16BE(4), NOTIFY_LEAVE_OUT_GRID_CODE);
  const p = inner.subarray(6);
  assert.equal(p.length, NOTIFY_LEAVE_OUT_GRID_BYTES);
  assert.equal(p.readUInt8(0), 3);
  assert.equal(p.readUInt32LE(4), 10);
  assert.equal(p.readUInt32LE(8), 20);
  assert.equal(p.readUInt32LE(12), 30);
});

test('buildEcho re-wraps the raw body as message32 and patches authoritative dwords', () => {
  const body = Buffer.alloc(COMMAND_SUPPLY_FUEL_BYTES);
  body.writeUInt32LE(77, 0x08);
  body.writeUInt32LE(100, 0x10);
  const raw = rawInner(COMMAND_SUPPLY_FUEL_CODE, body);
  const echo = buildEcho(raw, [{ offset: 0x10, value: 950 }, { offset: 0x14, value: 720 }]);
  assert.equal(echo.readUInt32BE(0), 0); // message32 prefix
  assert.equal(echo.readUInt16BE(4), COMMAND_SUPPLY_FUEL_CODE);
  const p = echo.subarray(6);
  assert.equal(p.readUInt32LE(0x08), 77); // preserved
  assert.equal(p.readUInt32LE(0x10), 950); // patched fuelA
  assert.equal(p.readUInt32LE(0x14), 720); // patched fuelB
  // original buffer is NOT mutated
  assert.equal(body.readUInt32LE(0x10), 100);
});

// =====================================================================================
// STATE — self-contained store
// =====================================================================================

test('createLogisticsState.supplyFuel clamps to fleet cap and drains the source base', () => {
  const state = createLogisticsState();
  state.upsertBase({ id: 1, owner: 1, fuel: 500 });
  state.upsertFleet({ id: 77, owner: 1, fuel: 100, fuelCap: 1000, supplyCap: 1000 });
  const r = state.supplyFuel(77, { requestA: 800, requestB: 600, sourceBaseId: 1 });
  // wants to reach 800 (within cap); needs 700 from base but base only has 500 -> fleet = 100 + 500 = 600
  assert.equal(r.fuelA, 600);
  assert.equal(state.getFleet(77).fuel, 600);
  assert.equal(state.getBase(1).fuel, 0); // base drained
  assert.equal(r.fuelB, 600);
  assert.equal(state.supplyFuel(999, {}), null); // unknown fleet
});

test('createLogisticsState.transferTroops moves only ids actually held on the source side', () => {
  const state = createLogisticsState();
  state.upsertBase({ id: 1, owner: 1, troops: [11, 12, 13] });
  state.upsertFleet({ id: 2, owner: 1 });
  const moved = state.transferTroops(1, 2, [11, 13, 99], 'load');
  assert.deepEqual(moved.sort((a, b) => a - b), [11, 13]); // 99 not held -> not moved
  assert.equal(state.getFleet(2).troops.has(11), true);
  assert.equal(state.getBase(1).troops.has(11), false);
  // unload returns them
  const back = state.transferTroops(1, 2, [11], 'unload');
  assert.deepEqual(back, [11]);
  assert.equal(state.getBase(1).troops.has(11), true);
});

// =====================================================================================
// processLogistics — accept / reject / notify contract
// =====================================================================================

function supplyFuelInner({ targetUnitId, fuelA = 0, fuelB = 0 }) {
  const body = Buffer.alloc(COMMAND_SUPPLY_FUEL_BYTES);
  body.writeUInt32LE(targetUnitId >>> 0, 0x08);
  body.writeUInt32LE(fuelA >>> 0, 0x10);
  body.writeUInt32LE(fuelB >>> 0, 0x14);
  return rawInner(COMMAND_SUPPLY_FUEL_CODE, body);
}

test('processLogistics SupplyFuel: echoes 0xb02 (all) + broadcasts 0xb0c (others) with authoritative fuel', () => {
  const state = createLogisticsState();
  state.upsertBase({ id: 1, owner: 1, fuel: 5000 });
  state.upsertFleet({ id: 77, owner: 1, fuel: 0, fuelCap: 1000, supplyCap: 1000 });
  const inner = supplyFuelInner({ targetUnitId: 77, fuelA: 800, fuelB: 600 });
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_SUPPLY_FUEL_CODE, inner });
  assert.equal(d.accept, true);
  assert.equal(d.notifies.length, 2);
  // echo
  assert.equal(d.notifies[0].target, 'all');
  assert.equal(d.notifies[0].inner.readUInt16BE(4), COMMAND_SUPPLY_FUEL_CODE);
  assert.equal(d.notifies[0].inner.subarray(6).readUInt32LE(0x10), 800); // authoritative fuelA echoed
  // notify
  assert.equal(d.notifies[1].target, 'others');
  assert.equal(d.notifies[1].inner.readUInt16BE(4), NOTIFY_SUPPLIED_FUEL_CODE);
  assert.equal(d.notifies[1].inner.subarray(6).readUInt32LE(0x10), 77); // unitId
  assert.equal(d.notifies[1].inner.subarray(6).readUInt32LE(0x14), 800); // fuelAfter
  assert.equal(state.getFleet(77).fuel, 800);
});

test('processLogistics SupplyFuel: rejects firing a fleet you do not own', () => {
  const state = createLogisticsState();
  state.upsertFleet({ id: 77, owner: 2, fuel: 0 });
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_SUPPLY_FUEL_CODE, inner: supplyFuelInner({ targetUnitId: 77, fuelA: 100 }) });
  assert.equal(d.accept, false);
  assert.equal(d.reject, 'not-owner');
  assert.equal(d.notifies.length, 0);
});

test('processLogistics SupplyFuel: rejects a body that is too short', () => {
  const state = createLogisticsState();
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_SUPPLY_FUEL_CODE, inner: rawInner(COMMAND_SUPPLY_FUEL_CODE, Buffer.alloc(4)) });
  assert.equal(d.accept, false);
  assert.equal(d.reject, 'invalid-supply-fuel');
});

test('processLogistics Search: echoes 0xb03 + broadcasts 0xb0d NotifySearch revealing the searched cell', () => {
  const state = createLogisticsState();
  state.upsertFleet({ id: 33, owner: 1 });
  const body = Buffer.alloc(COMMAND_SEARCH_BYTES);
  body.writeUInt32LE(33, 0x08);
  body.writeUInt32LE(1500, 0x0c);
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_SEARCH_CODE, inner: rawInner(COMMAND_SEARCH_CODE, body) });
  assert.equal(d.accept, true);
  assert.equal(d.notifies[0].inner.readUInt16BE(4), COMMAND_SEARCH_CODE); // echo
  assert.equal(d.notifies[1].inner.readUInt16BE(4), NOTIFY_SEARCH_CODE); // recon result
  assert.equal(d.notifies[1].inner.subarray(6).readUInt32LE(0x08), 33); // searcherId
  assert.equal(d.notifies[1].inner.subarray(6).readUInt8(0x0c), 1); // 1 revealed cell
  assert.equal(d.notifies[1].inner.subarray(6).readUInt16LE(0x10), 1500); // cell index
});

test('processLogistics MoveBase: echoes 0xb00 + broadcasts 0xb0b with the destination, mutates state', () => {
  const state = createLogisticsState();
  state.upsertBase({ id: 500, owner: 1, x: 0, y: 0 });
  const body = Buffer.alloc(COMMAND_MOVE_BASE_BYTES);
  body.writeUInt32LE(500, 0x08);
  body.writeUInt32LE(42, 0x0c); // target cell
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_MOVE_BASE_CODE, inner: rawInner(COMMAND_MOVE_BASE_CODE, body) });
  assert.equal(d.accept, true);
  assert.equal(d.notifies[0].inner.readUInt16BE(4), COMMAND_MOVE_BASE_CODE);
  assert.equal(d.notifies[1].inner.readUInt16BE(4), NOTIFY_MOVED_BASE_CODE);
  assert.equal(d.notifies[1].inner.subarray(6).readUInt32LE(0x08), 500); // baseId
  assert.equal(d.notifies[1].inner.subarray(6).readUInt32LE(0x10), 42); // newX
  assert.equal(state.getBase(500).x, 42);
});

test('processLogistics LoadTroop: moves troop ids base->fleet and echoes 0xb05', () => {
  const state = createLogisticsState();
  state.upsertBase({ id: 900, owner: 1, troops: [11, 22] });
  state.upsertFleet({ id: 901, owner: 1 });
  const body = Buffer.alloc(COMMAND_TROOP_TRANSFER_BYTES);
  body.writeUInt32LE(900, 0x08); // base = container
  body.writeUInt32LE(901, 0x0c); // fleet = target
  body.writeUInt8(2, 0x14);
  body.writeUInt32LE(11, 0x18);
  body.writeUInt32LE(22, 0x1c);
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_LOAD_TROOP_CODE, inner: rawInner(COMMAND_LOAD_TROOP_CODE, body) });
  assert.equal(d.accept, true);
  assert.equal(d.direction, 'load');
  assert.deepEqual(d.moved.sort((a, b) => a - b), [11, 22]);
  assert.equal(d.notifies[0].target, 'all');
  assert.equal(d.notifies[0].inner.readUInt16BE(4), COMMAND_LOAD_TROOP_CODE);
  assert.equal(state.getFleet(901).troops.has(11), true);
});

test('processLogistics SwitchMode: echoes 0xb06 and surfaces the parsed unit/character lists', () => {
  const state = createLogisticsState();
  const body = Buffer.alloc(COMMAND_SWITCH_MODE_BYTES);
  body.writeUInt16LE(0, 0x14); // battle
  body.writeUInt8(1, 0x16);
  body.writeUInt32LE(101, 0x18);
  body.writeUInt8(1, 0x138);
  body.writeUInt32LE(7001, 0x13c);
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_SWITCH_MODE_CODE, inner: rawInner(COMMAND_SWITCH_MODE_CODE, body) });
  assert.equal(d.accept, true);
  assert.equal(d.modeKind, 0);
  assert.deepEqual(d.units, [101]);
  assert.deepEqual(d.characters, [7001]);
  assert.equal(d.notifies[0].inner.readUInt16BE(4), COMMAND_SWITCH_MODE_CODE);
});

test('processLogistics Reorganization: records the reorg + echoes 0xc02', () => {
  const state = createLogisticsState();
  const body = Buffer.alloc(COMMAND_REORGANIZATION_BYTES);
  body.writeUInt32LE(10, 0x0c);
  body.writeUInt32LE(20, 0x10);
  body.writeUInt8(1, 0x1d);
  body.writeUInt16LE(501, 0x1e);
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_REORGANIZATION_CODE, inner: rawInner(COMMAND_REORGANIZATION_CODE, body) });
  assert.equal(d.accept, true);
  assert.equal(d.moveShips.length, 1);
  assert.equal(d.notifies[0].inner.readUInt16BE(4), COMMAND_REORGANIZATION_CODE);
  assert.ok(state.log().some((e) => e.event === 'reorganize'));
});

test('processLogistics CarryingInOut: records the cargo move + echoes 0xc08', () => {
  const state = createLogisticsState();
  const body = Buffer.alloc(COMMAND_CARRYING_IN_OUT_BYTES);
  body.writeUInt32LE(11, 0x0c);
  body.writeUInt32LE(22, 0x10);
  body.writeUInt8(1, 0x20);
  body.writeUInt8(9, 0x24);
  body.writeUInt32LE(1000, 0x28);
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_CARRYING_IN_OUT_CODE, inner: rawInner(COMMAND_CARRYING_IN_OUT_CODE, body) });
  assert.equal(d.accept, true);
  assert.equal(d.otherPackages.length, 1);
  assert.equal(d.notifies[0].inner.readUInt16BE(4), COMMAND_CARRYING_IN_OUT_CODE);
  assert.ok(state.log().some((e) => e.event === 'carry'));
});

test('processLogistics MoveInstitutionSpot: byte-faithful echo of 0xe00 (client applies position)', () => {
  const state = createLogisticsState();
  const body = Buffer.alloc(COMMAND_MOVE_INSTITUTION_SPOT_BYTES);
  body.writeUInt32LE(300, 0x08);
  body.writeUInt32LE(15, 0x10);
  body.writeUInt32LE(25, 0x14);
  const d = processLogistics({ state, connectionId: 1, innerCode: COMMAND_MOVE_INSTITUTION_SPOT_CODE, inner: rawInner(COMMAND_MOVE_INSTITUTION_SPOT_CODE, body) });
  assert.equal(d.accept, true);
  assert.equal(d.institutionId, 300);
  const p = d.notifies[0].inner.subarray(6);
  assert.equal(p.readUInt32LE(0x10), 15); // newX preserved for the client applicator
  assert.equal(p.readUInt32LE(0x14), 25);
});

test('processLogistics low-confidence commands: byte-faithful echo so the dialog FSM completes', () => {
  const state = createLogisticsState();
  for (const [code, size] of [[COMMAND_COMPLETENESS_REPAIR_CODE, COMMAND_COMPLETENESS_REPAIR_BYTES], [COMMAND_CARRYING_OUT_CODE, COMMAND_CARRYING_OUT_BYTES]]) {
    const body = Buffer.alloc(size);
    body.writeUInt32LE(444, 0x08);
    const d = processLogistics({ state, connectionId: 1, innerCode: code, inner: rawInner(code, body) });
    assert.equal(d.accept, true, `code 0x${code.toString(16)} accepted`);
    assert.equal(d.partial, true);
    assert.equal(d.notifies[0].inner.readUInt16BE(4), code); // echoed back with the same code
    assert.equal(d.notifies[0].inner.subarray(6).length, size); // full byte-faithful body
  }
});

test('processLogistics rejects an unknown command code', () => {
  const state = createLogisticsState();
  const d = processLogistics({ state, connectionId: 1, innerCode: 0x9999, inner: rawInner(0x9999, Buffer.alloc(4)) });
  assert.equal(d.accept, false);
  assert.equal(d.reject, 'unknown-logistics-command');
});

test('LOGISTICS_COMMAND_CODES enumerates the routed range for the lead', () => {
  assert.ok(LOGISTICS_COMMAND_CODES.includes(COMMAND_SUPPLY_FUEL_CODE));
  assert.ok(LOGISTICS_COMMAND_CODES.includes(COMMAND_MOVE_INSTITUTION_SPOT_CODE));
  // every routed code is in the 0xb00-0xb06 strategic OR 0xc00-0xc0c logistics OR 0xe00 institution range
  for (const code of LOGISTICS_COMMAND_CODES) {
    const ok = (code >= 0x0b00 && code <= 0x0b06) || (code >= 0x0c00 && code <= 0x0c0c) || code === 0x0e00;
    assert.ok(ok, `0x${code.toString(16)} in a logistics range`);
  }
});
