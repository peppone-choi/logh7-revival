/**
 * Space-war (tactical combat) engine tests — parsers, the authoritative damage model, the wire
 * builders, and an end-to-end battle through processCommand. Pure/synchronous: no live client.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { processCommand } from '../../src/server/logh7-command-engine.mjs';
import {
  parseInboundAttack,
  parseInboundChangeMode,
  parseInboundSortie,
  computeDamage,
  resolveLandCombat,
  shipClassStats,
  DEFAULT_SHIP_STATS,
  COMMAND_SHOOT_SHIP_CODE,
  COMMAND_ATTACK_SHIP_CODE,
  COMMAND_CHANGE_MODE_CODE,
  COMMAND_SORTIE_TROOPS_CODE,
} from '../../src/server/logh7-combat-engine.mjs';
import {
  buildNotifyAttackedShipInner,
  buildNotifyChangeModeInner,
  buildNotifyFoughtInner,
  buildNotifyMoraleDownInner,
  buildNotifyMovedTroopInner,
  buildNotifyLandCombatInner,
  NOTIFY_ATTACKED_SHIP_CODE,
  NOTIFY_ATTACKED_SHIP_BYTES,
  NOTIFY_CHANGE_MODE_CODE,
  NOTIFY_CHANGE_MODE_BYTES,
  NOTIFY_MOVED_TROOP_CODE,
  NOTIFY_LAND_COMBAT_CODE,
} from '../../src/server/logh7-login-protocol.mjs';

/** Build a raw client inner: [u16 BE code][body]. */
function rawInner(code, body) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(code & 0xffff, 0);
  return Buffer.concat([head, body]);
}

/** Build a CommandShoot/Attack body (0x98=152B): unitCount @12, ids @16 stride 4, targetId @0x94. */
function attackBody(ids, { targetId = 0 } = {}) {
  const body = Buffer.alloc(0x98);
  body.writeUInt8(ids.length & 0xff, 12);
  ids.forEach((id, i) => body.writeUInt32LE(id >>> 0, 16 + i * 4));
  if (targetId) body.writeUInt32LE(targetId >>> 0, 0x94); // fixed target offset (param_2[0x25])
  return body;
}

// ---------- parsers ----------

test('parseInboundAttack reads unitCount @12 + attacker ids @16 stride 4', () => {
  const inner = rawInner(COMMAND_SHOOT_SHIP_CODE, attackBody([101, 202, 303]));
  const p = parseInboundAttack(inner);
  assert.equal(p.count, 3);
  assert.deepEqual(p.attackerIds, [101, 202, 303]);
});

test('parseInboundAttack reads the explicit target id at fixed offset 0x94', () => {
  const inner = rawInner(COMMAND_ATTACK_SHIP_CODE, attackBody([7], { targetId: 55 }));
  const p = parseInboundAttack(inner);
  assert.equal(p.attackerIds[0], 7);
  assert.equal(p.targetId, 55); // read from body @0x94, independent of unit count
});

test('parseInboundAttack clamps unit count to 32 and returns null when too short', () => {
  const body = Buffer.alloc(0x98);
  body.writeUInt8(99, 12); // over-cap
  const p = parseInboundAttack(rawInner(COMMAND_SHOOT_SHIP_CODE, body));
  assert.equal(p.count, 32);
  assert.equal(parseInboundAttack(rawInner(COMMAND_SHOOT_SHIP_CODE, Buffer.alloc(8))), null);
});

test('parseInboundChangeMode reads mode @4, leader @8, count @12, units @16', () => {
  const body = Buffer.alloc(0x98);
  body.writeUInt8(1, 4); // mode
  body.writeUInt32LE(900, 8); // leaderId
  body.writeUInt8(2, 12); // unitCount
  body.writeUInt32LE(11, 16);
  body.writeUInt32LE(22, 36);
  const p = parseInboundChangeMode(rawInner(COMMAND_CHANGE_MODE_CODE, body));
  assert.equal(p.mode, 1);
  assert.equal(p.leaderId, 900);
  assert.equal(p.count, 2);
  assert.deepEqual(p.units.map((u) => u.unitId), [11, 22]);
});

// ---------- damage model ----------

test('shipClassStats falls back to defaults and applies class overrides', () => {
  assert.deepEqual(shipClassStats('cruiser').maxArmor, 1200);
  assert.equal(shipClassStats('flagship').beamPower, 520);
  assert.deepEqual(shipClassStats('nonexistent'), DEFAULT_SHIP_STATS);
});

test('computeDamage: shield soaks first; cumulative wire values = max - current', () => {
  const attacker = { beamPower: 220 };
  const target = { shield: 600, maxShield: 600, armor: 1200, maxArmor: 1200, zanki: 1000, maxZanki: 1000, defense: 80 };
  const d = computeDamage(attacker, target, 'shoot');
  // incoming = round(220*100/180) = 122; all absorbed by shield
  assert.equal(d.shieldAfter, 478);
  assert.equal(d.armorAfter, 1200);
  assert.equal(d.zankiAfter, 1000);
  assert.equal(d.shieldDamage, 122); // 600 - 478
  assert.equal(d.armorDamage, 0);
  assert.equal(d.destroyed, false);
});

test('computeDamage: overflow past armor kills ships (zanki down) and can destroy', () => {
  const attacker = { beamPower: 5000 };
  const target = { shield: 0, maxShield: 0, armor: 10, maxArmor: 10, zanki: 1, maxZanki: 1, defense: 0, armorPerShip: 1 };
  const d = computeDamage(attacker, target, 'attack');
  assert.equal(d.armorAfter, 0);
  assert.equal(d.zankiAfter, 0);
  assert.equal(d.destroyed, true);
});

test('computeDamage kind factor: attack > fight > shoot', () => {
  const t = { shield: 0, maxShield: 0, armor: 100000, maxArmor: 100000, zanki: 1, maxZanki: 1, defense: 0 };
  const shoot = computeDamage({ beamPower: 100 }, { ...t }, 'shoot').armorDamage;
  const fight = computeDamage({ beamPower: 100 }, { ...t }, 'fight').armorDamage;
  const attack = computeDamage({ beamPower: 100 }, { ...t }, 'attack').armorDamage;
  assert.ok(attack > fight && fight > shoot, `${attack} > ${fight} > ${shoot}`);
});

// ---------- builders (exact wire offsets) ----------

test('buildNotifyAttackedShipInner lays out the 28-byte damage body', () => {
  const inner = buildNotifyAttackedShipInner({ attackerId: 5, targetId: 9, weaponType: 2, armorDamage: 100, zankiDamage: 50, shieldDamage: 200, hitLoc: 3 });
  assert.equal(inner.readUInt16BE(4), NOTIFY_ATTACKED_SHIP_CODE);
  const p = inner.subarray(6);
  assert.equal(p.length, NOTIFY_ATTACKED_SHIP_BYTES);
  assert.equal(p.readUInt32LE(4), 5); // attackerId
  assert.equal(p.readUInt8(8), 2); // weaponType
  assert.equal(p.readUInt32LE(12), 9); // targetId
  assert.equal(p.readUInt16LE(16), 100); // armorDamage
  assert.equal(p.readUInt16LE(18), 50); // zankiDamage
  assert.equal(p.readUInt8(20), 3); // hitLoc
  assert.equal(p.readUInt16LE(22), 200); // shieldDamage
});

test('buildNotifyChangeModeInner is 664 bytes with mode/leader/units', () => {
  const inner = buildNotifyChangeModeInner({ mode: 1, leaderId: 900, units: [{ unitId: 11 }, { unitId: 22 }] });
  assert.equal(inner.readUInt16BE(4), NOTIFY_CHANGE_MODE_CODE);
  const p = inner.subarray(6);
  assert.equal(p.length, NOTIFY_CHANGE_MODE_BYTES);
  assert.equal(p.readUInt8(4), 1);
  assert.equal(p.readUInt32LE(8), 900);
  assert.equal(p.readUInt8(12), 2);
  assert.equal(p.readUInt32LE(16), 11);
  assert.equal(p.readUInt32LE(36), 22);
});

test('NotifyFought / NotifyMoraleDown builders size correctly', () => {
  assert.equal(buildNotifyFoughtInner({ dword1: 7 }).subarray(6).length, 16);
  const m = buildNotifyMoraleDownInner({ shipId: 3, morale: 42 });
  assert.equal(m.subarray(6).readUInt32LE(4), 3);
  assert.equal(m.subarray(6).readUInt32LE(8), 42);
});

// ---------- processCommand: authoritative combat ----------

function battleWorld() {
  const state = createWorldState();
  state.addPlayer({ connectionId: 1, charId: 100, powerId: 1 });
  state.addPlayer({ connectionId: 2, charId: 200, powerId: 2 });
  // player 1 fleet (faction 1)
  state.upsertShip({ id: 101, owner: 1, faction: 1, shipClass: 'battleship', x: 0, y: 0, z: 0 });
  // player 2 fleet (faction 2)
  state.upsertShip({ id: 201, owner: 2, faction: 2, shipClass: 'destroyer', x: 10, y: 0, z: 0 });
  return state;
}

test('CommandShootShip resolves authoritative damage and broadcasts 0x0426 to all', () => {
  const state = battleWorld();
  const before = state.getShip(201).shield;
  const decision = processCommand({ state, connectionId: 1, innerCode: COMMAND_SHOOT_SHIP_CODE, inner: rawInner(COMMAND_SHOOT_SHIP_CODE, attackBody([101])) });
  assert.equal(decision.accept, true);
  assert.equal(decision.notifies.length, 1);
  assert.equal(decision.notifies[0].target, 'all');
  assert.equal(decision.notifies[0].inner.readUInt16BE(4), NOTIFY_ATTACKED_SHIP_CODE);
  assert.ok(state.getShip(201).shield < before, 'target shield reduced');
  assert.equal(state.battleLog().length, 1);
});

test('fire ownership: cannot fire a ship you do not own', () => {
  const state = battleWorld();
  // connection 2 tries to fire player 1 ship 101
  const decision = processCommand({ state, connectionId: 2, innerCode: COMMAND_SHOOT_SHIP_CODE, inner: rawInner(COMMAND_SHOOT_SHIP_CODE, attackBody([101])) });
  assert.equal(decision.accept, false);
  assert.equal(decision.reject, 'not-owner');
});

test('CommandChangeMode opens a battle session and broadcasts 0x042f to all', () => {
  const state = battleWorld();
  const body = Buffer.alloc(0x98);
  body.writeUInt8(0, 4); // tactical mode
  body.writeUInt8(1, 12);
  body.writeUInt32LE(101, 16);
  const decision = processCommand({ state, connectionId: 1, innerCode: COMMAND_CHANGE_MODE_CODE, inner: rawInner(COMMAND_CHANGE_MODE_CODE, body) });
  assert.equal(decision.accept, true);
  // battle-entry pushes the full setup sequence; NotifyChangeMode 0x42f is one of the steps.
  const changeMode = decision.notifies.find((n) => n.inner.readUInt16BE(4) === NOTIFY_CHANGE_MODE_CODE);
  assert.ok(changeMode, 'sequence includes NotifyChangeMode 0x42f');
  assert.equal(changeMode.target, 'all');
  assert.equal(state.isBattleActive(), true);
  assert.equal(state.getPlayer(1).mode, 0);
});

test('NotifyChangeMode seeds each participant SPAWN POSE (battle-entry grant)', () => {
  // the grant that flips the client into a controllable tactical battle: shipId@+0, heading@+4, x@+8, z@+12
  const inner = buildNotifyChangeModeInner({ modeKind: 0, fieldOwnerId: 7, units: [{ shipId: 101, heading: 1.5, x: 12.5, z: -8.25, y: 0 }] });
  const p = inner.subarray(6);
  assert.equal(p.length, NOTIFY_CHANGE_MODE_BYTES);
  assert.equal(p.readUInt8(4), 0); // modeKind
  assert.equal(p.readUInt32LE(8), 7); // fieldOwnerId anchor
  assert.equal(p.readUInt8(12), 1); // count
  assert.equal(p.readUInt32LE(16), 101); // shipId
  assert.ok(Math.abs(p.readFloatLE(20) - 1.5) < 1e-4); // heading @+4
  assert.ok(Math.abs(p.readFloatLE(24) - 12.5) < 1e-4); // x @+8
  assert.ok(Math.abs(p.readFloatLE(28) - -8.25) < 1e-4); // z @+12
});

test('CommandChangeMode pulls spawn poses from authoritative ship state', () => {
  const state = battleWorld();
  state.moveShip(101, { x: 30, y: 0, z: 40 });
  const body = Buffer.alloc(0x98);
  body.writeUInt8(1, 12);
  body.writeUInt32LE(101, 16);
  const decision = processCommand({ state, connectionId: 1, innerCode: COMMAND_CHANGE_MODE_CODE, inner: rawInner(COMMAND_CHANGE_MODE_CODE, body) });
  const changeMode = decision.notifies.find((n) => n.inner.readUInt16BE(4) === NOTIFY_CHANGE_MODE_CODE);
  const p = changeMode.inner.subarray(6);
  assert.ok(Math.abs(p.readFloatLE(24) - 30) < 1e-3); // ship 101 x seeded into spawn pose
  assert.ok(Math.abs(p.readFloatLE(28) - 40) < 1e-3); // z
});

// ---------- ground combat (地上戦) ----------

test('parseInboundSortie reads troop ids (count @0xc, ids @0x10)', () => {
  const body = Buffer.alloc(0x94);
  body.writeUInt8(2, 12);
  body.writeUInt32LE(501, 16);
  body.writeUInt32LE(502, 20);
  const p = parseInboundSortie(rawInner(COMMAND_SORTIE_TROOPS_CODE, body));
  assert.equal(p.count, 2);
  assert.deepEqual(p.troopIds, [501, 502]);
});

test('resolveLandCombat reduces defender strength and signals capture on defeat', () => {
  const strong = resolveLandCombat({ strength: 1000, morale: 120 }, { strength: 10, morale: 50, defense: 0 });
  assert.equal(strong.defeated, true);
  assert.equal(strong.result, 1);
  const ongoing = resolveLandCombat({ strength: 50, morale: 80 }, { strength: 1000, morale: 100, defense: 100 });
  assert.equal(ongoing.defeated, false);
  assert.ok(ongoing.strengthAfter < 1000);
});

test('buildNotifyMovedTroop / buildNotifyLandCombat layouts', () => {
  const mt = buildNotifyMovedTroopInner({ troopId: 7, x: 1.5, y: 0, z: 2.5 });
  assert.equal(mt.readUInt16BE(4), NOTIFY_MOVED_TROOP_CODE);
  assert.equal(mt.subarray(6).readUInt32LE(0), 7);
  assert.ok(Math.abs(mt.subarray(6).readFloatLE(4) - 1.5) < 1e-4);
  const lc = buildNotifyLandCombatInner({ unitId: 9, result: 1 });
  assert.equal(lc.readUInt16BE(4), NOTIFY_LAND_COMBAT_CODE);
  assert.equal(lc.subarray(6).readUInt32LE(0), 9);
  assert.equal(lc.subarray(6).readUInt16LE(4), 1);
});

test('END-TO-END ground combat: troops sortie and overrun the enemy garrison', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 1, charId: 1, powerId: 1 });
  state.upsertTroop({ id: 501, owner: 1, faction: 1, strength: 5000, morale: 120, x: 0, z: 0 });
  state.upsertTroop({ id: 901, owner: 0, faction: 2, strength: 300, morale: 60, defense: 20, x: 2, z: 0 });
  let rounds = 0;
  let won = false;
  while (!won && rounds < 30) {
    rounds += 1;
    const body = Buffer.alloc(0x94);
    body.writeUInt8(1, 12);
    body.writeUInt32LE(501, 16);
    const d = processCommand({ state, connectionId: 1, innerCode: COMMAND_SORTIE_TROOPS_CODE, inner: rawInner(COMMAND_SORTIE_TROOPS_CODE, body) });
    assert.equal(d.accept, true);
    if (d.results.some((r) => r.defeated)) won = true;
  }
  assert.ok(won, `garrison overrun within 30 rounds (took ${rounds})`);
  assert.equal(state.getTroop(901).defeated, true);
  assert.ok(state.battleLog().some((e) => e.event === 'land-combat'));
});

test('END-TO-END space war: a fleet fires until the enemy is destroyed', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 1, charId: 1, powerId: 1 });
  state.addPlayer({ connectionId: 2, charId: 2, powerId: 2 });
  // A strong flagship vs a fragile destroyer of the opposing faction.
  state.upsertShip({ id: 101, owner: 1, faction: 1, shipClass: 'flagship', x: 0, y: 0, z: 0 });
  state.upsertShip({ id: 201, owner: 2, faction: 2, shipClass: 'destroyer', x: 5, y: 0, z: 0 });

  let destroyed = false;
  let rounds = 0;
  while (!destroyed && rounds < 50) {
    rounds += 1;
    const decision = processCommand({ state, connectionId: 1, innerCode: COMMAND_ATTACK_SHIP_CODE, inner: rawInner(COMMAND_ATTACK_SHIP_CODE, attackBody([101])) });
    assert.equal(decision.accept, true);
    if (decision.hits.some((h) => h.destroyed)) destroyed = true;
  }
  assert.ok(destroyed, `enemy destroyed within 50 rounds (took ${rounds})`);
  assert.equal(state.getShip(201), null, 'destroyed ship removed from grid');
  assert.ok(state.battleLog().some((e) => e.destroyed), 'battle log records the kill');
  // The attacker survives (enemy destroyer never fired here).
  assert.equal(state.getShip(101).destroyed, false);
});

test('mutual battle: two fleets trade fire, damage accrues on both sides', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 1, charId: 1, powerId: 1 });
  state.addPlayer({ connectionId: 2, charId: 2, powerId: 2 });
  state.upsertShip({ id: 101, owner: 1, faction: 1, shipClass: 'cruiser', x: 0, y: 0, z: 0 });
  state.upsertShip({ id: 201, owner: 2, faction: 2, shipClass: 'cruiser', x: 8, y: 0, z: 0 });
  const s1 = state.getShip(101).shield;
  const s2 = state.getShip(201).shield;
  processCommand({ state, connectionId: 1, innerCode: COMMAND_SHOOT_SHIP_CODE, inner: rawInner(COMMAND_SHOOT_SHIP_CODE, attackBody([101])) });
  processCommand({ state, connectionId: 2, innerCode: COMMAND_SHOOT_SHIP_CODE, inner: rawInner(COMMAND_SHOOT_SHIP_CODE, attackBody([201])) });
  assert.ok(state.getShip(201).shield < s2, 'player2 fleet took damage');
  assert.ok(state.getShip(101).shield < s1, 'player1 fleet took damage');
  assert.equal(state.battleLog().length, 2);
});
