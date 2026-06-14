import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { loadRosterRecords, loadRosterJson, loadRosterDir } from '../../src/server/logh7-roster-loader.mjs';
import { isCanon, generateCharacter } from '../../src/server/logh7-character-gen.mjs';

const ROSTER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../content/roster');

test('loadRosterRecords registers sourced characters (data, not code)', () => {
  assert.equal(isCanon(0x51001), false);
  loadRosterRecords([{ id: 0x51001, name: 'Test Admiral', nationId: 0x500, rank: 'Admiral', command: 81, tactics: 83, operations: 79, portraitIndex: 99 }]);
  assert.equal(isCanon(0x51001), true);
  const c = generateCharacter({ id: 0x51001 });
  assert.equal(c.name, 'Test Admiral');
  assert.equal(c.command, 81);
  assert.equal(c.portraitIndex, 99);
});

test('loadRosterJson accepts {characters:[...]} or a bare array, and rejects bad records', () => {
  loadRosterJson(JSON.stringify({ characters: [{ id: 0x51002, name: 'A', nationId: 0x500 }] }));
  assert.equal(isCanon(0x51002), true);
  loadRosterJson(JSON.stringify([{ id: 0x51003, name: 'B', nationId: 0x500 }]));
  assert.equal(isCanon(0x51003), true);
  assert.throws(() => loadRosterJson(JSON.stringify([{ name: 'no id' }])), /integer id/);
});

test('loadRosterDir loads the shipped canon-extra roster file', () => {
  const { files, total } = loadRosterDir(ROSTER_DIR);
  assert.ok(files.includes('canon-extra.json'));
  assert.ok(total > 0);
  // a character from the file is now canon with its sourced stats
  assert.equal(isCanon(4112), true); // Ernest Mecklinger
  assert.equal(generateCharacter({ id: 4114 }).name, 'Adalbert von Fahrenheit');
  assert.equal(generateCharacter({ id: 4114 }).canon, true);
  // the in-code NAMED_CANON principals are untouched (no id collision)
  assert.equal(generateCharacter({ id: 0x1001 }).name, 'Reinhard von Lohengramm');
});
