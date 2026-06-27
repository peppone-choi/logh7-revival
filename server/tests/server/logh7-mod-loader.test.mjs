import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeById, applyModPack, applyModPacks } from '../../src/server/logh7-mod-loader.mjs';

const base = () => ({
  name: 'base',
  nations: [{ id: 0x500 }, { id: 0x501 }, { id: 0x502 }],
  characters: [
    { id: 1, name: '1', nameRomaji: 'A', abilities: [50, 50, 50, 50, 50, 50, 50, 50] },
    { id: 2, name: '2', nameRomaji: 'B', abilities: [50, 50, 50, 50, 50, 50, 50, 50] },
  ],
  units: [{ id: 0x01000000, nationId: 0x500, commander: 1 }],
  shipClasses: [{ id: 1, name: 'Flagship' }],
  systems: [{ name: 'Iserlohn', contentId: 14 }],
});

test('mergeById adds new ids and overrides existing ones', () => {
  const merged = mergeById(
    [{ id: 1, a: 1 }, { id: 2, a: 2 }],
    [{ id: 2, a: 99, b: 'x' }, { id: 3, a: 3 }],
  );
  assert.deepEqual(merged.find((e) => e.id === 2), { id: 2, a: 99, b: 'x' }, 'override merges fields');
  assert.ok(merged.find((e) => e.id === 3), 'new id appended');
  assert.equal(merged.length, 3);
});

test('mergeById honors __remove', () => {
  const merged = mergeById([{ id: 1 }, { id: 2 }], [{ id: 1, __remove: true }]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 2);
});

test('applyModPack adds a new character without touching others', () => {
  const mod = { name: 'addchar', content: { characters: [{ id: 3, name: '3', nameRomaji: 'C', abilities: new Array(8).fill(60) }] } };
  const out = applyModPack(base(), mod);
  assert.equal(out.characters.length, 3);
  assert.ok(out.characters.find((c) => c.id === 3));
  assert.deepEqual(out.appliedMods, ['addchar']);
  // base untouched
  assert.equal(base().characters.length, 2);
});

test('applyModPacks applies load order and validates against caps', () => {
  const mods = [
    { name: 'second', loadOrder: 2, content: { characters: [{ id: 1, nameRomaji: 'Z', abilities: new Array(8).fill(70) }] } },
    { name: 'first', loadOrder: 1, content: { characters: [{ id: 1, nameRomaji: 'Y', abilities: new Array(8).fill(60) }] } },
  ];
  const { data, appliedMods, validation, conflicts } = applyModPacks(base(), mods);
  assert.deepEqual(appliedMods, ['first', 'second'], 'sorted by loadOrder');
  assert.equal(data.characters.find((c) => c.id === 1).nameRomaji, 'Z', 'last load-order wins');
  assert.ok(conflicts.some((c) => c.includes('characters:1')), 'conflict on shared id reported');
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
});

test('a mod that violates a client cap fails validation (the safety net)', () => {
  const mod = { name: 'badname', content: { characters: [{ id: 4, nameRomaji: 'x'.repeat(20), abilities: new Array(8).fill(50) }] } };
  const { validation } = applyModPacks(base(), [mod]);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((e) => e.includes('nameRomaji')));
});

test('disabled mods are skipped', () => {
  const mod = { name: 'off', enabled: false, content: { characters: [{ id: 9, nameRomaji: 'Q', abilities: new Array(8).fill(50) }] } };
  const { data } = applyModPacks(base(), [mod]);
  assert.ok(!data.characters.find((c) => c.id === 9));
});
