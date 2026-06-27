/**
 * Integration test — processCommand routes every internal-affairs (内政) domain to its module, and the
 * domain states are lazily created + persist on the world-state object. Locks the G201 wiring so the
 * combat + 内政 dispatch never regresses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { processCommand } from '../../src/server/logh7-command-engine.mjs';

function rawInner(code, len) {
  const b = Buffer.alloc(2 + len);
  b.writeUInt16BE(code & 0xffff, 0);
  return b;
}

function worldWithPlayer() {
  const s = createWorldState();
  s.addPlayer({ connectionId: 1, charId: 5, powerId: 1 });
  return s;
}

test('processCommand routes personnel codes (0x0704-0x0709) to the personnel domain', () => {
  const s = worldWithPlayer();
  const d = processCommand({ state: s, connectionId: 1, innerCode: 0x0704, inner: rawInner(0x0704, 0x20) });
  // routed (not 'unknown-command'); the domain owns the decision (rank bounds etc.)
  assert.notEqual(d.reject, 'unknown-command');
  assert.ok(s._personnel, 'personnel state lazily created + cached on world-state');
});

test('processCommand routes strategy codes (0x0900-0x0906) and broadcasts', () => {
  const s = worldWithPlayer();
  const d = processCommand({ state: s, connectionId: 1, innerCode: 0x0900, inner: rawInner(0x0900, 0x1c) });
  assert.equal(d.accept, true);
  assert.ok(d.notifies.length >= 1);
  assert.ok(s._strategy);
});

test('processCommand routes logistics codes (strategic map + 0x0cxx) to the logistics domain', () => {
  const s = worldWithPlayer();
  const move = processCommand({ state: s, connectionId: 1, innerCode: 0x0b00, inner: rawInner(0x0b00, 0x40) });
  assert.equal(move.accept, true);
  assert.ok(s._logistics);
  // a 0x0cxx logistics code also routes
  const reorg = processCommand({ state: s, connectionId: 1, innerCode: 0x0c02, inner: rawInner(0x0c02, 0x310) });
  assert.notEqual(reorg.reject, 'unknown-command');
});

test('processCommand routes social codes (mail/messenger/settings) to the social domain', () => {
  const s = worldWithPlayer();
  const d = processCommand({ state: s, connectionId: 1, innerCode: 0x0f10, inner: rawInner(0x0f10, 0x75c) });
  assert.notEqual(d.reject, 'unknown-command');
  assert.ok(s._social);
});

test('non-internal-affairs unknown codes still fall through to unknown-command', () => {
  const s = worldWithPlayer();
  const d = processCommand({ state: s, connectionId: 1, innerCode: 0x1234, inner: rawInner(0x1234, 2) });
  assert.equal(d.reject, 'unknown-command');
});

test('combat codes are NOT shadowed by the internal-affairs router (still handled by combat path)', () => {
  const s = worldWithPlayer();
  s.upsertShip({ id: 101, owner: 1, faction: 1, x: 0, z: 0 });
  s.upsertShip({ id: 201, owner: 0, faction: 2, x: 5, z: 0 });
  const body = Buffer.alloc(0x98);
  body.writeUInt8(1, 12);
  body.writeUInt32LE(101, 16);
  const d = processCommand({ state: s, connectionId: 1, innerCode: 0x0406, inner: rawInner(0x0406, 0).length ? Buffer.concat([Buffer.from([0x04, 0x06]), body]) : null });
  assert.equal(d.accept, true);
  assert.equal(d.notifies[0].inner.readUInt16BE(4), 0x0426); // NotifyAttackedShip — combat path intact
});
