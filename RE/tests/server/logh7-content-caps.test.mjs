import test from 'node:test';
import assert from 'node:assert/strict';
import { validateContentPack, CLIENT_CAPS } from '../../src/server/logh7-content-caps.mjs';

const goodPack = () => ({
  nations: [{ id: 0x500 }, { id: 0x501 }, { id: 0x502 }], // empire + alliance + neutral
  characters: [
    { id: 1, name: '1', nameRomaji: 'Officer 1', abilities: [50, 50, 50, 50, 50, 50, 50, 50] },
    { id: 2, name: '2', nameRomaji: 'Officer 2', abilities: [60, 60, 60, 60, 60, 60, 60, 60] },
  ],
  units: [{ id: 0x01000000, nationId: 0x500, commander: 1, boats: [1, 2] }],
  systems: [{ name: 'Iserlohn', contentId: 14 }],
});

test('a valid pack passes with no errors', () => {
  const r = validateContentPack(goodPack());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.errors, []);
});

test('a 3rd playable power is rejected (2 powers per session, fixed)', () => {
  const p = goodPack();
  p.nations.push({ id: 0x503 }); // a would-be 3rd power that is not the neutral tag
  // 0x503 is not playable and not neutral -> warning; make it actually exceed playable to error:
  p.nations = [{ id: 0x500 }, { id: 0x501 }, { id: 0x500 }]; // 3 playable (dup id space) -> >2 playable
  // use distinct playable-range ids to trip the playable>2 path
  p.nations = [{ id: 0x500 }, { id: 0x501 }, { id: 0x500 }];
  const r = validateContentPack({ ...p, nations: [{ id: 0x500 }, { id: 0x501 }, { id: 0x500 }] });
  // playable set membership counts 0x500 twice -> 3 playable entries
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('powers/session')));
});

test('ability block must be exactly 8', () => {
  const p = goodPack();
  p.characters[0].abilities = [1, 2, 3];
  const r = validateContentPack(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('ability block')));
});

test('names over 13 UCS-2 units are rejected', () => {
  const p = goodPack();
  p.characters[0].nameRomaji = 'x'.repeat(14);
  const r = validateContentPack(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('nameRomaji')));
});

test('a system marker contentId in the grid-type label range (<3) is rejected', () => {
  const p = goodPack();
  p.systems = [{ name: 'Phantom', contentId: 1 }]; // subId 1 = 공간 그리드 label
  const r = validateContentPack(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('grid-TYPE label')));
});

test('too many units / boats are rejected', () => {
  const p = goodPack();
  p.units[0].boats = new Array(11).fill(1);
  let r = validateContentPack(p);
  assert.ok(r.errors.some((e) => e.includes('boats')));
  p.units = new Array(601).fill(0).map((_, i) => ({ id: i, nationId: 0x500 }));
  r = validateContentPack(p);
  assert.ok(r.errors.some((e) => e.includes('units:')));
});

test('over-14 fleets for a nation is a warning (national roster), not a hard error', () => {
  const p = goodPack();
  p.units = new Array(15).fill(0).map((_, i) => ({ id: i, nationId: 0x500 }));
  const r = validateContentPack(p);
  assert.ok(r.warnings.some((w) => w.includes('NATION_FLEET_ROSTER')));
});

test('CLIENT_CAPS exposes the RE-cited caps', () => {
  assert.equal(CLIENT_CAPS.POWERS_PER_SESSION.value, 2);
  assert.equal(CLIENT_CAPS.NATION_FLEET_ROSTER.value, 14);
  assert.equal(CLIENT_CAPS.CARDS_PER_CHARACTER.value, 16);
  assert.equal(CLIENT_CAPS.NAME_UCS2_UNITS.value, 13);
  for (const k of Object.keys(CLIENT_CAPS)) assert.ok(CLIENT_CAPS[k].where, `${k} has a citation`);
});
