import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createWorldRelay,
  isRelayCommandCode,
  RELAY_COMMAND_CODES,
} from '../../src/server/logh7-world-relay.mjs';

test('isRelayCommandCode recognizes in-world commands (chat + move)', () => {
  assert.equal(isRelayCommandCode(0x0f1c), true); // CommandGridChat
  assert.equal(isRelayCommandCode(0x0400), true); // CommandMoveShip (tactical)
  assert.equal(isRelayCommandCode(0x0b01), true); // CommandMoveGrid (strategic fleet move)
  assert.equal(isRelayCommandCode(0x2000), false); // lobby login, not in-world
  assert.equal(isRelayCommandCode(0x0f00), false); // RequestWorldInitialize, not a relay command
  assert.ok(RELAY_COMMAND_CODES.has(0x0f1c));
});

test('relay broadcasts an inner to every connection except the sender', () => {
  const relay = createWorldRelay();
  const received = { 1: [], 2: [], 3: [] };
  relay.register(1, (inner) => received[1].push(inner));
  relay.register(2, (inner) => received[2].push(inner));
  relay.register(3, (inner) => received[3].push(inner));
  assert.equal(relay.size(), 3);

  const chat = Buffer.from('00000000' + '0f1c' + 'deadbeef', 'hex');
  const delivered = relay.broadcast(1, chat);

  assert.equal(delivered, 2); // sent to 2 and 3, not back to 1
  assert.equal(received[1].length, 0);
  assert.equal(received[2].length, 1);
  assert.equal(received[3].length, 1);
  assert.equal(received[2][0].toString('hex'), chat.toString('hex'));
});

test('relay unregister stops delivery; a throwing recipient does not block others', () => {
  const relay = createWorldRelay();
  const got2 = [];
  relay.register(1, () => {});
  relay.register(2, (inner) => got2.push(inner));
  relay.register(3, () => {
    throw new Error('socket gone');
  });

  relay.unregister(1);
  assert.equal(relay.has(1), false);
  assert.equal(relay.size(), 2);

  const delivered = relay.broadcast(99, Buffer.from('0f1c', 'hex')); // sender not registered
  // connection 3 throws (skipped), connection 2 still receives.
  assert.equal(delivered, 1);
  assert.equal(got2.length, 1);
});

test('relay with a single client delivers to nobody (no echo to self)', () => {
  const relay = createWorldRelay();
  let count = 0;
  relay.register(7, () => {
    count += 1;
  });
  const delivered = relay.broadcast(7, Buffer.from('0f1c', 'hex'));
  assert.equal(delivered, 0);
  assert.equal(count, 0);
});
