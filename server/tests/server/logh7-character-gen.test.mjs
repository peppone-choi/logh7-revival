import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateCharacter, generateRoster, registerCanon, isCanon, NAMED_CANON } from '../../src/server/logh7-character-gen.mjs';

test('named canon characters use sourced stats, not generated', () => {
  const reinhard = generateCharacter({ id: 0x1001 });
  assert.equal(reinhard.name, 'Reinhard von Lohengramm');
  assert.equal(reinhard.tactics, 98);
  assert.equal(reinhard.canon, true);
  assert.equal(reinhard.portraitIndex, NAMED_CANON[0x1001].portraitIndex);
});

test('generic character generation is deterministic (same id -> same stats)', () => {
  const a = generateCharacter({ id: 0x9abcdef, nationId: 0x500, rank: 'Captain', role: 'cruiser' });
  const b = generateCharacter({ id: 0x9abcdef, nationId: 0x500, rank: 'Captain', role: 'cruiser' });
  assert.deepEqual(a, b);
  assert.equal(a.canon, false);
  assert.ok(a.command >= 1 && a.command <= 100);
});

test('different ids of the same rank still differ (jitter)', () => {
  const a = generateCharacter({ id: 1000, rank: 'Admiral', role: 'flagship' });
  const b = generateCharacter({ id: 1001, rank: 'Admiral', role: 'flagship' });
  assert.notDeepEqual([a.command, a.tactics, a.operations], [b.command, b.tactics, b.operations]);
});

test('higher rank yields higher innate floor', () => {
  const ensign = generateCharacter({ id: 5000, rank: 'Ensign', role: 'battleship' });
  const marshal = generateCharacter({ id: 5000, rank: 'Marshal', role: 'battleship' });
  assert.ok(marshal.command > ensign.command);
});

test('registerCanon makes a previously-generated id a custom-statted character', () => {
  const id = 0x4abc01;
  assert.equal(isCanon(id), false);
  assert.equal(generateCharacter({ id }).canon, false);
  registerCanon([{ id, name: 'Bernhard von Schneider', nationId: 0x501, rank: 'Captain', command: 79, tactics: 86, operations: 81, portraitIndex: 30 }]);
  assert.equal(isCanon(id), true);
  const c = generateCharacter({ id });
  assert.equal(c.canon, true);
  assert.equal(c.name, 'Bernhard von Schneider');
  assert.equal(c.tactics, 86);
});

test('generateRoster produces N deterministically-statted officers', () => {
  const roster = generateRoster({ nationId: 0x500, count: 50, startId: 0x30000 });
  assert.equal(roster.length, 50);
  assert.ok(roster.every((c) => c.nationId === 0x500 && !c.canon));
  // re-generating yields identical stats (persistable without storing every value)
  const again = generateRoster({ nationId: 0x500, count: 50, startId: 0x30000 });
  assert.deepEqual(roster, again);
});
