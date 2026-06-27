import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeFleet, makeCharacter } from '../../src/server/logh7-entities.mjs';
import { createEntityStore, loadEntityStore } from '../../src/server/logh7-entity-store.mjs';
import { createContentPack } from '../../src/server/logh7-content-pack.mjs';
import { CANON_CONTENT } from '../../src/server/logh7-canon-content.mjs';

test('entity factories apply defaults and validate ids', () => {
  const f = makeFleet({ id: 0x01000000, nationId: 0x500 });
  assert.equal(f.kind, 'fleet');
  assert.equal(f.morale, 100);
  assert.equal(f.state, 'idle');
  const c = makeCharacter({ id: 0x1001, name: 'Reinhard', portraitIndex: 42 });
  assert.equal(c.portraitIndex, 42);
  assert.throws(() => makeFleet({ id: 0, nationId: 1 }), /nonzero/);
});

test('entity store seeds a working world from the canon content pack', () => {
  const pack = createContentPack(CANON_CONTENT);
  const store = createEntityStore().seedFromContentPack(pack);
  // counts track the pack (roster grows over time) — every canon character gets a fleet
  assert.equal(store.count('nations'), pack.nations.length);
  assert.equal(store.count('shipClasses'), pack.shipClasses.length);
  assert.equal(store.count('characters'), pack.characters.length);
  assert.equal(store.count('fleets'), pack.units.length);
  assert.equal(store.count('characters'), store.count('fleets')); // every canon char appears in-game
  // the canon flagship fleet is bound to its commander, and vice-versa
  const reinhard = store.get('characters', 0x1001);
  assert.equal(reinhard.fleetId, 0x01000000);
  const flagship = store.get('fleets', 0x01000000);
  assert.equal(flagship.commanderId, 0x1001);
  assert.equal(flagship.shipClass, 1);
});

test('entity store game queries return per-nation slices', () => {
  const pack = createContentPack(CANON_CONTENT);
  const store = createEntityStore().seedFromContentPack(pack);
  assert.equal(store.fleetsOfNation(0x500).length, pack.unitsForNation(0x500).length);
  assert.ok(store.charactersOfNation(0x500).length >= 4);
  assert.equal(store.fleetsOfNation(0x501)[0].nationId, 0x501);
});

test('entity store issues orders with constmsg-style timing', () => {
  const store = createEntityStore().seedFromContentPack(createContentPack(CANON_CONTENT));
  const order = store.issueOrder({ fleetId: 0x01000000, commandCode: 0x0400, now: 1000, cooldown: 48, duration: 0 });
  assert.equal(order.cooldownUntil, 1048);
  assert.equal(order.status, 'pending');
  assert.equal(store.get('fleets', 0x01000000).orderId, order.id);
  assert.equal(store.ordersForFleet(0x01000000).length, 1);
});

test('entity store persists and restores via JSON snapshot', () => {
  const store = createEntityStore().seedFromContentPack(createContentPack(CANON_CONTENT));
  store.update('nations', 0x500, { budget: 12345 });
  const snapshot = JSON.parse(JSON.stringify(store.toJSON()));
  const restored = loadEntityStore(snapshot);
  assert.equal(restored.count('fleets'), store.count('fleets'));
  assert.equal(restored.get('nations', 0x500).budget, 12345);
  assert.equal(restored.get('characters', 0x2001).name, 'Yang Wen-li');
});
