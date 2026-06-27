/**
 * NPC AI tests — character-stat-driven autonomous behavior for unowned canon commanders.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { behaviorProfile, decideShipAction, runNpcTick } from '../../src/server/logh7-npc-ai.mjs';

test('behaviorProfile: aggressive (high 攻撃) engages from further out than a cautious (high 防御) one', () => {
  const aggressive = behaviorProfile({ kogeki: 120, bogyo: 20, shiki: 90, kido: 90 });
  const cautious = behaviorProfile({ kogeki: 30, bogyo: 120, shiki: 60, kido: 40 });
  assert.ok(aggressive.fireRangeSq > cautious.fireRangeSq, 'aggressive engages from further');
  assert.ok(cautious.retreatBelow > aggressive.retreatBelow, 'cautious retreats earlier');
  assert.ok(aggressive.moveStep > cautious.moveStep, 'higher 機動 = faster close');
});

test('decideShipAction: fire in range, close when far, retreat when crippled', () => {
  const state = createWorldState();
  state.upsertShip({ id: 1, owner: 0, faction: 1, shipClass: 'cruiser', x: 0, z: 0 });
  state.upsertShip({ id: 2, owner: 0, faction: 2, shipClass: 'cruiser', x: 10, z: 0 });
  const ship = state.getShip(1);
  const prof = behaviorProfile({ kogeki: 100, bogyo: 60, shiki: 80, kido: 80 });
  assert.equal(decideShipAction(state, ship, prof).action, 'fire'); // target at dist 10, in range

  state.moveShip(2, { x: 5000, z: 0 }); // far away
  assert.equal(decideShipAction(state, ship, prof).action, 'move');

  state.moveShip(2, { x: 10, z: 0 });
  state.getShip(1).zanki = 1; // crippled
  assert.equal(decideShipAction(state, ship, prof).action, 'retreat');
});

test('runNpcTick: NPC ships fire at the enemy faction and broadcast NotifyAttackedShip', () => {
  const state = createWorldState();
  // NPC fleet (owner 0, faction 1) vs enemy (owner 0, faction 2), close together
  state.upsertShip({ id: 1, owner: 0, faction: 1, shipClass: 'battleship', x: 0, z: 0 });
  state.upsertShip({ id: 2, owner: 0, faction: 2, shipClass: 'destroyer', x: 5, z: 0 });
  const before = state.getShip(2).shield;
  const { notifies, actions } = runNpcTick(state, {});
  assert.ok(actions.some((a) => a.action === 'fire'), 'an NPC fired');
  assert.ok(notifies.length >= 1 && notifies[0].target === 'all');
  assert.ok(state.getShip(2).shield < before, 'enemy took damage from NPC fire');
});

test('runNpcTick ignores player-owned ships (only NPC-held act)', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 7 });
  state.upsertShip({ id: 1, owner: 7, faction: 1, shipClass: 'cruiser', x: 0, z: 0 }); // player-owned
  state.upsertShip({ id: 2, owner: 0, faction: 2, shipClass: 'cruiser', x: 5, z: 0 }); // NPC enemy
  const before = state.getShip(1).shield;
  runNpcTick(state, {});
  // ship 2 (NPC) fires at ship 1 (player) — player ship takes damage, but ship 1 itself never acts as NPC
  assert.ok(state.getShip(1).shield <= before);
});

test('character personality drives the fleet: aggressive NPC destroys a weak enemy over ticks', () => {
  const state = createWorldState();
  state.upsertShip({ id: 1, owner: 0, faction: 1, shipClass: 'flagship', x: 0, z: 0 });
  state.upsertShip({ id: 2, owner: 0, faction: 2, shipClass: 'destroyer', x: 3, z: 0 });
  const profileByFaction = { 1: behaviorProfile({ kogeki: 120, shiki: 110, bogyo: 40, kido: 90 }) };
  let ticks = 0;
  while (state.getShip(2) && ticks < 40) {
    runNpcTick(state, { profileByFaction });
    ticks += 1;
  }
  assert.equal(state.getShip(2), null, `aggressive NPC destroyed the enemy (in ${ticks} ticks)`);
  assert.ok(state.battleLog().some((e) => e.event === 'npc-fire'));
});

test('runNpcTick: NPC 사령관 旗艦 격침 시 戦死 적용(world-state 공용 경로) — 플레이어 전투와 일관', () => {
  const state = createWorldState();
  // 공격 NPC(faction 1) + 표적 NPC 기함(faction 2, 한 방에 격침되는 약체) + 그 기함의 사령관(deathToggle true).
  state.upsertShip({ id: 1, owner: 0, faction: 1, shipClass: 'battleship', x: 0, z: 0 });
  state.upsertShip({ id: 2, owner: 0, faction: 2, shipClass: 'cruiser', x: 5, z: 0, stats: { maxShield: 0, maxArmor: 0, maxZanki: 1, defense: 0 } });
  state.upsertCharacter({ id: 0xA01, faction: 'alliance', rank: 14, flagship: 2, deathToggle: true });
  const prof = behaviorProfile({ kogeki: 120, bogyo: 60, shiki: 90, kido: 80 });
  let killed = false;
  for (let i = 0; i < 4 && state.getShip(2); i += 1) {
    const { actions } = runNpcTick(state, { profileByFaction: { 1: prof, 2: prof } });
    if (actions.some((a) => a.flagshipLoss?.charId === 0xA01)) killed = true;
  }
  assert.equal(killed, true, 'NPC 기함 격침 → 戦死 flagshipLoss 액션');
  assert.equal(state.getCharacter(0xA01).alive, false, 'NPC 사령관 사망(자율 전투에서도 戦死 적용)');
});
