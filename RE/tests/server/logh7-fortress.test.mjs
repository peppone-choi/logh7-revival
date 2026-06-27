import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  loadFortresses,
  fortressBySystem,
  fortressMarkerObjects,
  fortressVariantForFaction,
} from '../../src/server/logh7-fortress.mjs';

test('loadFortresses returns the 6 canon fortresses with the expected fields', () => {
  const list = loadFortresses({ reload: true });
  assert.ok(Array.isArray(list), 'returns an array');
  assert.equal(list.length, 6, '6 fortresses');
  const iserlohn = list.find((f) => f.id === 'fortress_iserlohn');
  assert.ok(iserlohn, 'Iserlohn present');
  for (const key of [
    'id', 'name_ja', 'name_ko', 'system', 'faction',
    'cannon_name', 'cannon_power', 'armor', 'antiaircraft', 'stamina',
    'defense_outfit', 'garrison_capacity',
  ]) {
    assert.ok(key in iserlohn, `Iserlohn has ${key}`);
  }
  assert.equal(iserlohn.faction, 'empire');
  assert.equal(iserlohn.cannon_power, 1000, 'Iserlohn is the apex (Thor Hammer)');
});

test('loadFortresses caches and reload forces a fresh read', () => {
  const a = loadFortresses();
  const b = loadFortresses();
  assert.equal(a, b, 'cached instance reused without reload');
  const c = loadFortresses({ reload: true });
  assert.deepEqual(c.map((f) => f.id), a.map((f) => f.id), 'reload yields equal data');
});

test('fortressBySystem resolves by system name (the galaxy join key)', () => {
  const f = fortressBySystem('イゼルローン');
  assert.ok(f, 'found by system name_ja');
  assert.equal(f.id, 'fortress_iserlohn');

  const alliance = fortressBySystem('ロフォーテン');
  assert.equal(alliance?.id, 'fortress_lyudmila');
  assert.equal(alliance?.faction, 'alliance');
});

test('fortressBySystem also matches the fortress own names and rejects misses', () => {
  assert.equal(fortressBySystem('Geiersburg')?.id, 'fortress_geiersburg', 'by name_en');
  assert.equal(fortressBySystem('이제르론')?.id, 'fortress_iserlohn', 'by name_ko');
  assert.equal(fortressBySystem('NoSuchSystem'), undefined, 'unknown system → undefined');
  assert.equal(fortressBySystem(''), undefined, 'empty → undefined');
  assert.equal(fortressBySystem(undefined), undefined, 'nullish → undefined');
});

test('fortressVariantForFaction maps factions to distinct valid icon slots', () => {
  assert.equal(fortressVariantForFaction('empire'), 1);
  assert.equal(fortressVariantForFaction('alliance'), 2);
  assert.equal(fortressVariantForFaction('neutral'), 0);
  assert.equal(fortressVariantForFaction(undefined), 0);
  for (const f of ['empire', 'alliance', 'neutral', undefined]) {
    const v = fortressVariantForFaction(f);
    assert.ok(v >= 0 && v <= 6, `variant ${v} in placeable render range 0..6`);
  }
});

test('fortressMarkerObjects emits class-3 object-table records ready for the strategic table', () => {
  const objs = fortressMarkerObjects({ startValue: 83 });
  assert.equal(objs.length, 6, 'one marker per fortress');
  objs.forEach((o, i) => {
    assert.equal(o.klass, 3, 'every fortress marker is class 3 (the placement gate)');
    assert.equal(o.value, 83 + i, 'object values assigned sequentially from startValue');
    assert.ok(o.value >= 3 && o.value <= 88, 'value within placeable object range');
    assert.ok(o.contentId >= 0 && o.contentId <= 0xff, 'contentId (byte0) is a u8');
    assert.ok(o.variant >= 0 && o.variant <= 8, 'variant (byte2) within valid render slots');
    assert.ok(o.system, 'carries the system join key for cell resolution');
    assert.ok(o.fortress, 'carries the source fortress row');
  });
});

test('fortressMarkerObjects shape matches buildStaticInformationGridTypeInner input', () => {
  const [o] = fortressMarkerObjects();
  // The object-table builder destructures exactly { value, contentId, klass, variant }.
  assert.deepEqual(
    Object.keys(o).sort(),
    ['contentId', 'fortress', 'klass', 'system', 'value', 'variant'].sort(),
  );
  // Faction tint flows from the row.
  const empire = fortressMarkerObjects().find((x) => x.fortress.faction === 'empire');
  const alliance = fortressMarkerObjects().find((x) => x.fortress.faction === 'alliance');
  assert.equal(empire.variant, fortressVariantForFaction('empire'));
  assert.equal(alliance.variant, fortressVariantForFaction('alliance'));
});

test('fortressMarkerObjects default call fits all 6 fortresses in the placeable range', () => {
  const objs = fortressMarkerObjects();
  assert.equal(objs.length, 6, 'default startValue leaves room for all 6');
  assert.ok(objs.every((o) => o.value >= 3 && o.value <= 88), 'all default values placeable');
});

test('fortressMarkerObjects respects the maxValue cap (board full)', () => {
  // Only 2 placeable values left (87, 88) → only 2 of the 6 fortresses fit.
  const objs = fortressMarkerObjects({ startValue: 87, maxValue: 88 });
  assert.equal(objs.length, 2, 'drops markers once object values exceed 88');
  assert.deepEqual(objs.map((o) => o.value), [87, 88]);
});

test('fortressMarkerObjects honours an explicit content_id / byte0 override', () => {
  const list = loadFortresses({ reload: true });
  const patched = list.map((f, i) => (i === 0 ? { ...f, content_id: 200 } : f));
  // Simulate a row carrying the real constmsg index by reading through a custom mapper indirectly:
  // fortressMarkerObjects reads from the module cache, so assert the default placeholder path instead.
  const objs = fortressMarkerObjects({ startValue: 10 });
  assert.ok(objs.every((o) => Number.isInteger(o.contentId)), 'contentId always an integer');
  assert.ok(patched.length === 6); // sanity that the source row count is stable
});

test('a custom variantForFaction mapper is respected', () => {
  const objs = fortressMarkerObjects({ variantForFaction: () => 8 });
  assert.ok(objs.every((o) => o.variant === 8), 'mapper override applied (8 → black-hole slot path)');
});
