import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import {
  COMMAND_GRID_CHAT_CODE,
  NOTIFY_MOVED_SHIP_CODE,
  NOTIFY_TURNED_SHIP_CODE,
  buildNotifyMovedShipInner,
} from '../../src/server/logh7-login-protocol.mjs';
import {
  COMMAND_MOVE_SHIP_CODE,
  COMMAND_MOVE_GRID_CODE,
  MAX_MOVE_UNITS,
  applyShipMove,
  applyShipTurn,
  parseInboundChat,
  parseInboundMoveGrid,
  parseInboundMoveShip,
  processCommand,
} from '../../src/server/logh7-command-engine.mjs';

// Build an inbound CommandMoveGrid: [u16 BE code][3 hdr dwords][u32 unitId @0x0c][u32 destCell @0x10].
function makeInboundMoveGrid(unitId, destCell) {
  const inner = Buffer.alloc(2 + 0x24); // 36-byte body
  inner.writeUInt16BE(COMMAND_MOVE_GRID_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(unitId >>> 0, 0x0c);
  body.writeUInt32LE(destCell >>> 0, 0x10);
  return inner;
}

// Build an inbound CommandMoveShip: [u16 BE code][body] with count @12 and unit ids @16 stride 20.
// Optional per-id poses set the target floats (heading @+4, x @+8, z @+12, y @+16).
function makeInboundMoveShip(unitIds, poses = []) {
  const inner = Buffer.alloc(2 + 0x41c); // 1052-byte body
  inner.writeUInt16BE(COMMAND_MOVE_SHIP_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt8(unitIds.length, 12);
  unitIds.forEach((id, i) => {
    const off = 16 + i * 20;
    body.writeUInt32LE(id >>> 0, off);
    const pose = poses[i];
    if (pose) {
      body.writeFloatLE(pose.heading ?? 0, off + 4);
      body.writeFloatLE(pose.x ?? 0, off + 8);
      body.writeFloatLE(pose.z ?? 0, off + 12);
      body.writeFloatLE(pose.y ?? 0, off + 16);
    }
  });
  return inner;
}

// Build an inbound CommandGridChat in the client SEND form: [u16 BE code][u32 0][u32 time][u8 cast][u8 len][wchars].
function makeInboundChat(text, { time = 0, cast = 0 } = {}) {
  const chars = [...String(text)];
  const inner = Buffer.alloc(2 + 0x8c);
  inner.writeUInt16BE(COMMAND_GRID_CHAT_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(time >>> 0, 4);
  body.writeUInt8(cast & 0xff, 8);
  body.writeUInt8(chars.length, 9);
  chars.forEach((c, i) => body.writeUInt16LE(c.charCodeAt(0) & 0xffff, 10 + i * 2));
  return inner;
}

test('parseInboundChat decodes client send-form chat', () => {
  const parsed = parseInboundChat(makeInboundChat('HELLO', { time: 123, cast: 2 }));
  assert.equal(parsed.text, 'HELLO');
  assert.equal(parsed.time, 123);
  assert.equal(parsed.castType, 2);
  assert.equal(parsed.msgLen, 5);
});

test('processCommand chat: accepts, logs, and notifies others with a canonical chat', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 0x01000000 });
  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_GRID_CHAT_CODE,
    inner: makeInboundChat('GG', { cast: 1 }),
  });
  assert.equal(result.accept, true);
  assert.equal(result.notifies.length, 1);
  assert.equal(result.notifies[0].target, 'others');
  assert.equal(result.notifies[0].inner.readUInt16BE(4), COMMAND_GRID_CHAT_CODE);
  assert.equal(state.chatCount(), 1);
  assert.equal(state.listChat()[0].text, 'GG');
});

test('processCommand rejects a command from a connection that is not in the world', () => {
  const state = createWorldState();
  const result = processCommand({
    state,
    connectionId: 99,
    innerCode: COMMAND_GRID_CHAT_CODE,
    inner: makeInboundChat('hi'),
  });
  assert.equal(result.accept, false);
  assert.equal(result.reject, 'not-in-world');
  assert.equal(result.notifies.length, 0);
});

test('processCommand rejects empty chat and unknown commands', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  assert.equal(processCommand({ state, connectionId: 6, innerCode: COMMAND_GRID_CHAT_CODE, inner: makeInboundChat('') }).reject, 'empty-chat');
  const unknown = Buffer.alloc(4);
  unknown.writeUInt16BE(0x1234, 0);
  assert.equal(processCommand({ state, connectionId: 6, innerCode: 0x1234, inner: unknown }).reject, 'unknown-command');
});

test('parseInboundMoveShip extracts count, ship ids, and per-unit target poses', () => {
  const move = parseInboundMoveShip(
    makeInboundMoveShip(
      [0x01000000, 0x01000001],
      [
        { x: 10, z: 20, y: 0, heading: 1.5 },
        { x: -5, z: 7, y: 0, heading: 0 },
      ],
    ),
  );
  assert.equal(move.count, 2);
  assert.deepEqual(move.unitIds, [0x01000000, 0x01000001]);
  assert.equal(move.units[0].x, 10);
  assert.equal(move.units[0].z, 20);
  assert.ok(Math.abs(move.units[0].heading - 1.5) < 1e-6);
  assert.equal(move.units[1].x, -5);
});

test('processCommand move: parses targets and emits authoritative NotifyMovedShip 0x0423', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.upsertShip({ id: 0x01000000, owner: 6 });
  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_MOVE_SHIP_CODE,
    inner: makeInboundMoveShip([0x01000000], [{ x: 42, z: 24, y: 0, heading: 0 }]),
  });
  assert.equal(result.accept, true);
  assert.deepEqual(result.units, [0x01000000]);
  assert.equal(result.notifies[0].target, 'others');
  // Authoritative 0x0423, not the relayed raw command; code lands at offset 4 (after the 6-byte
  // [u32 0][u16 code] envelope buildLobbyResponseInner emits).
  assert.equal(result.notifies[0].inner.readUInt16BE(4), NOTIFY_MOVED_SHIP_CODE);
  // The server applied the parsed target to authoritative world state.
  assert.equal(state.getShip(0x01000000).x, 42);
  assert.equal(state.getShip(0x01000000).z, 24);
});

test('processCommand move: emits a NotifyTurnedShip 0x0424 when the command carries a heading', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.upsertShip({ id: 0x01000000, owner: 6 });
  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_MOVE_SHIP_CODE,
    inner: makeInboundMoveShip([0x01000000], [{ x: 1, z: 2, y: 0, heading: 2.0 }]),
  });
  assert.equal(result.accept, true);
  const codes = result.notifies.map((n) => n.inner.readUInt16BE(4));
  assert.ok(codes.includes(NOTIFY_MOVED_SHIP_CODE));
  assert.ok(codes.includes(NOTIFY_TURNED_SHIP_CODE));
});

test('processCommand move: rejects an empty or oversized move (client bound 1..32)', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  assert.equal(
    processCommand({ state, connectionId: 6, innerCode: COMMAND_MOVE_SHIP_CODE, inner: makeInboundMoveShip([]) }).reject,
    'invalid-move',
  );
  const tooMany = Array.from({ length: MAX_MOVE_UNITS + 1 }, (_, i) => i + 1);
  assert.equal(
    processCommand({ state, connectionId: 6, innerCode: COMMAND_MOVE_SHIP_CODE, inner: makeInboundMoveShip(tooMany) }).reject,
    'invalid-move',
  );
});

test('processCommand move: rejects commanding a ship owned by another player (anti-cheat)', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.addPlayer({ connectionId: 7, charId: 2 });
  state.upsertShip({ id: 0x01000000, owner: 7 });
  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_MOVE_SHIP_CODE,
    inner: makeInboundMoveShip([0x01000000]),
  });
  assert.equal(result.accept, false);
  assert.equal(result.reject, 'not-owner');
});

test('processCommand move: allows commanding your own (or neutral) ship', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.upsertShip({ id: 0x01000000, owner: 6 });
  state.upsertShip({ id: 0x01000002, owner: 0 }); // neutral
  assert.equal(processCommand({ state, connectionId: 6, innerCode: COMMAND_MOVE_SHIP_CODE, inner: makeInboundMoveShip([0x01000000]) }).accept, true);
  assert.equal(processCommand({ state, connectionId: 6, innerCode: COMMAND_MOVE_SHIP_CODE, inner: makeInboundMoveShip([0x01000002]) }).accept, true);
});

test('parseInboundMoveGrid extracts unitId and destination cell', () => {
  const move = parseInboundMoveGrid(makeInboundMoveGrid(0x01000005, 1234));
  assert.equal(move.unitId, 0x01000005);
  assert.equal(move.destCell, 1234);
});

test('processCommand grid-move: emits authoritative NotifyMovedGrid 0x0b07 to ALL clients', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.upsertShip({ id: 0x01000005, owner: 6 });
  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_MOVE_GRID_CODE,
    inner: makeInboundMoveGrid(0x01000005, 2550),
  });
  assert.equal(result.accept, true);
  assert.deepEqual(result.units, [0x01000005]);
  assert.equal(result.notifies.length, 1);
  // 0x0b07 to ALL so the mover's own fleet relocates too; code lands at offset 4 (after the envelope).
  assert.equal(result.notifies[0].target, 'all');
  assert.equal(result.notifies[0].inner.readUInt16BE(4), 0x0b07);
  // unitCount @ payload+0x12 (envelope is 6 bytes), first unit @ payload+0x14.
  assert.equal(result.notifies[0].inner.readUInt8(6 + 0x12), 1);
  assert.equal(result.notifies[0].inner.readUInt32LE(6 + 0x14), 0x01000005);
  assert.equal(result.notifies[0].inner.readUInt32LE(6 + 0x14 + 4), 2550);
});

test('processCommand grid-move: rejects moving a fleet owned by another player', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.addPlayer({ connectionId: 7, charId: 2 });
  state.upsertShip({ id: 0x01000005, owner: 7 });
  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_MOVE_GRID_CODE,
    inner: makeInboundMoveGrid(0x01000005, 10),
  });
  assert.equal(result.accept, false);
  assert.equal(result.reject, 'not-owner');
});

test('applyShipMove/applyShipTurn mutate state and emit notifies', () => {
  const state = createWorldState();
  state.upsertShip({ id: 7, owner: 6 });
  const moveInner = applyShipMove(state, { shipId: 7, x: 5, y: 6, z: 7 });
  assert.ok(moveInner);
  assert.equal(moveInner.readUInt16BE(4), buildNotifyMovedShipInner({ shipId: 7 }).readUInt16BE(4));
  assert.equal(state.getShip(7).x, 5);
  const turnInner = applyShipTurn(state, { shipId: 7, heading: 45 });
  assert.ok(turnInner);
  assert.equal(state.getShip(7).heading, 45);
  assert.equal(applyShipMove(state, { shipId: 404, x: 1 }), null); // unknown ship
});
