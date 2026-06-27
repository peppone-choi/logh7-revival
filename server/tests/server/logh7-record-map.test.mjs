import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildRecordMapInventory } from '../../tools/logh7_record_map.mjs';

test('record map inventory covers every catalog message and merges live trace counts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'logh7-record-map-'));
  const trace = path.join(dir, 'trace.jsonl');
  await writeFile(
    trace,
    [
      JSON.stringify({ event: 'login-message', innerCodeHex: '0x0f02' }),
      JSON.stringify({ event: 'extra-inner-sent', respInnerCodeHex: '0x0323' }),
      JSON.stringify({ event: 'extra-inner-sent', respInnerCodeHex: '0x0325' }),
      '',
    ].join('\n'),
    'utf8',
  );

  const inventory = await buildRecordMapInventory({ traceFiles: [trace], scanUiExplorer: false });
  assert.equal(inventory.catalogTotal, 203);
  assert.ok(inventory.total >= 203);
  assert.equal(inventory.records.length, inventory.total);

  const character = inventory.records.find((record) => record.code === '0x0323');
  assert.ok(character);
  assert.equal(character.surface, 'character-info');
  assert.equal(character.liveTrace.outbound, 1);
  assert.match(character.classification, /observed|mapped/);

  const unit = inventory.records.find((record) => record.code === '0x0325');
  assert.ok(unit);
  assert.equal(unit.renderState, 'working-but-timing-sensitive');
  assert.ok(unit.notes.some((note) => note.includes('Full location slots are opt-in')));

  const move = inventory.records.find((record) => record.code === '0x0b01');
  assert.ok(move);
  assert.equal(move.classification, 'blocked-live-gap');
  assert.equal(move.interactionState, 'blocked');

  const gridInit = inventory.records.find((record) => record.code === '0x0f02');
  assert.ok(gridInit);
  assert.equal(gridInit.catalogSource, 'runtime-companion');
  assert.equal(gridInit.classification, 'observed-client-request');
});
