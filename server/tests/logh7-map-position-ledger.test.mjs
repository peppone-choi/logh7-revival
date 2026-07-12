import test from 'node:test';
import assert from 'node:assert/strict';
import { getMapPositionLedger, _resetMapPositionLedgerCache } from '../src/server/logh7-map-position-ledger.mjs';

test('ledger exposes canonical system cells and orbit-only planets', () => {
  _resetMapPositionLedgerCache();
  const ledger = getMapPositionLedger();
  assert.equal(ledger.systems.length, 85);
  assert.equal(ledger.systems.filter((s) => s.cell !== null).length, 85);
  const planets = ledger.systems.flatMap((s) => s.planets);
  assert.equal(planets.length, 300);
  assert.ok(planets.every((p) => p.cell === null && p.orbit >= 1));
});

test('fortresses inherit their system cell without inventing planet coordinates', () => {
  const ledger = getMapPositionLedger();
  const fortresses = ledger.systems.flatMap((s) => s.fortresses);
  assert.equal(fortresses.length, 6);
  assert.ok(fortresses.every((f) => f.cell !== null && f.cellStatus === 'inherits-system-cell'));
});

test('special celestial bodies retain visual coordinates but no unverified cell', () => {
  const ledger = getMapPositionLedger();
  assert.equal(ledger.specialBodies.length, 6);
  assert.ok(ledger.specialBodies.every((b) => b.cell === null && b.cellStatus === 'unverified'));
  assert.equal(ledger.tactical.participantPose.stride, 0x14);
});
