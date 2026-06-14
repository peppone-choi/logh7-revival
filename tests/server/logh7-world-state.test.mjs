import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';

test('world state tracks players join/leave', () => {
  const s = createWorldState();
  assert.equal(s.playerCount(), 0);
  s.addPlayer({ connectionId: 6, charId: 0x01000000, powerId: 0x500 });
  s.addPlayer({ connectionId: 7, charId: 0x01000001, powerId: 0x501 });
  assert.equal(s.playerCount(), 2);
  assert.equal(s.getPlayer(6).powerId, 0x500);
  assert.ok(s.hasPlayer(7));
  s.removePlayer(6);
  assert.equal(s.playerCount(), 1);
  assert.equal(s.getPlayer(6), null);
});

test('world state upserts and moves ships authoritatively', () => {
  const s = createWorldState();
  s.upsertShip({ id: 42, owner: 6, x: 0, y: 0, z: 0, heading: 0 });
  const moved = s.moveShip(42, { x: 10, y: 20, z: 0, moveParam: 3 });
  assert.equal(moved.x, 10);
  assert.equal(moved.y, 20);
  assert.equal(s.getShip(42).x, 10);
  const turned = s.turnShip(42, { heading: 90 });
  assert.equal(turned.heading, 90);
  assert.equal(s.moveShip(999, { x: 1 }), null); // unknown ship
  assert.equal(s.turnShip(999, { heading: 1 }), null);
});

test('world state claims and releases ship ownership', () => {
  const s = createWorldState();
  s.upsertShip({ id: 1, owner: 0 });
  s.upsertShip({ id: 2, owner: 0 });
  s.claimShip(1, 6);
  s.claimShip(2, 6);
  assert.equal(s.getShip(1).owner, 6);
  assert.equal(s.getShip(2).owner, 6);
  s.releaseShipsOf(6);
  assert.equal(s.getShip(1).owner, 0);
  assert.equal(s.getShip(2).owner, 0);
  assert.equal(s.claimShip(999, 6), null);
});

test('world state appends chat log', () => {
  const s = createWorldState();
  s.appendChat({ connectionId: 6, charId: 1, text: 'hi', channel: 0, time: 0 });
  assert.equal(s.chatCount(), 1);
  assert.equal(s.listChat()[0].text, 'hi');
});

test('world state seeds strategic systems with canon ownership and supports conquest', () => {
  const s = createWorldState();
  const seeded = s.seedSystems([
    { name: 'イゼルローン', faction: 'empire', isCorridor: true, fortresses: ['イゼルローン'], planets: [] },
    { name: 'バーラト', faction: 'alliance', planets: [{ name: 'ハイネセン', orbit: 3 }] },
  ]);
  assert.equal(seeded, 2);
  assert.equal(s.systemCount(), 2);
  const barlat = s.getSystem('バーラト');
  assert.equal(barlat.owner, 'alliance');
  assert.equal(barlat.planets[0].name, 'ハイネセン');
  assert.equal(barlat.planets[0].owner, 'alliance'); // planets inherit the system's canon owner
  // conquest: ownership transfer
  s.setSystemOwner('イゼルローン', 'alliance');
  assert.equal(s.getSystem('イゼルローン').owner, 'alliance');
  assert.equal(s.setSystemOwner('nowhere', 'empire'), null);
});

test('world state computes per-faction strategic summary (nation record fields)', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'ヴァルハラ', faction: 'empire', fortresses: [], planets: [{ name: 'オーディン', orbit: 2 }, { name: 'ゾースト', orbit: 1 }] },
    { name: 'イゼルローン', faction: 'empire', fortresses: ['イゼルローン'], planets: [] },
    { name: 'バーラト', faction: 'alliance', fortresses: [], planets: [{ name: 'ハイネセン', orbit: 3 }] },
  ]);
  const sum = s.factionSummary();
  assert.equal(sum.empire.controlledSystems, 2);
  assert.equal(sum.empire.controlledPlanets, 2);     // Odin + Zoost
  assert.equal(sum.empire.controlledFortresses, 1);  // Iserlohn
  assert.equal(sum.alliance.controlledSystems, 1);
  assert.equal(sum.alliance.controlledPlanets, 1);   // Heinessen
});

test('conquering a system transfers it and all its planets to the conqueror', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'バーラト', faction: 'alliance', fortresses: [], planets: [{ name: 'ハイネセン', orbit: 3 }, { name: 'テルヌーゼン', orbit: 1 }] },
  ]);
  const taken = s.conquerSystem('バーラト', 'empire');
  assert.equal(taken.owner, 'empire');
  assert.ok(taken.planets.every((p) => p.owner === 'empire'), 'all planets transferred');
  const sum = s.factionSummary();
  assert.equal(sum.empire.controlledSystems, 1);
  assert.equal(sum.empire.controlledPlanets, 2);
  assert.equal(sum.alliance, undefined); // Alliance lost everything
  assert.equal(s.conquerSystem('nowhere', 'empire'), null);
});
