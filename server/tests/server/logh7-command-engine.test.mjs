import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import {
  COMMAND_GRID_CHAT_CODE,
  NOTIFY_MOVED_GRID_CODE,
  NOTIFY_MOVED_SHIP_CODE,
  NOTIFY_TURNED_SHIP_CODE,
  NOTIFY_CHANGE_MODE_CODE,
  buildNotifyMovedShipInner,
} from '../../src/server/logh7-login-protocol.mjs';
import { COMMAND_FIGHT_CODE } from '../../src/server/logh7-combat-engine.mjs';
import { RETURN_TO_STRATEGIC_MODE_KIND } from '../../src/server/logh7-battle-engine.mjs';
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
  seedPersonnelFromWorldState,
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

// Build an inbound CommandGridChat in the client SEND form: [u16 BE code][u32 0][u32 LE time][u8 cast][u8 len][LE wchars].
// Body multibyte fields are LITTLE-endian to match the real client (FUN_004be6f0 LE memcpy) and the server's
// own receive-form builder buildCommandGridChatInner — a prior BE fixture hid the GridChat byte-swap bug
// because low-ASCII chars round-trip under either endianness; Korean (≥0x100) only round-trips under LE.
function makeInboundChat(text, { time = 0, cast = 0 } = {}) {
  const chars = [...String(text)];
  const inner = Buffer.alloc(2 + 0x8c);
  inner.writeUInt16BE(COMMAND_GRID_CHAT_CODE, 0); // code header is BE transport
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

test('parseInboundChat decodes Korean (UTF-16LE wire) without mojibake — GridChat endianness fix (audit 2026-06-28)', () => {
  // The client serializes the message as UTF-16LE; a BE read byte-swaps every char (e.g. 안 0xC548 -> 0x48C5).
  // This test fails under the prior readUInt16BE parser and passes only with the LE fix, matching the SpotChat
  // sibling and the server's own buildCommandGridChatInner (LE). time/cast also LE.
  const msg = '안녕하세요 은하제국';
  const parsed = parseInboundChat(makeInboundChat(msg, { time: 0x12345678, cast: 1 }));
  assert.equal(parsed.text, msg, '한글 메시지가 깨지지 않고 왕복');
  assert.equal(parsed.time, 0x12345678, 'time도 LE로 일관');
  assert.equal(parsed.castType, 1);
  assert.equal(parsed.msgLen, [...msg].length);
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
  assert.equal(state.commandLogCount(), 1);
  const commandLog = state.listCommandLog()[0];
  assert.equal(commandLog.seq, 1);
  assert.equal(commandLog.connectionId, 6);
  assert.equal(commandLog.innerCode, COMMAND_GRID_CHAT_CODE);
  assert.equal(commandLog.accept, true);
  assert.equal(commandLog.reject, null);
  assert.deepEqual(commandLog.units, []);
  assert.equal(commandLog.effect, 'grid-chat');
  assert.equal(commandLog.debug.text, 'GG');
});

test('processCommand /grid chat fallback moves fleet and emits 0x0b07 NotifyMovedGrid', () => {
  const state = createWorldState();
  const charId = 0x0100_0001;
  state.addPlayer({ connectionId: 6, charId });
  state.upsertFleet({ id: charId, cell: 1000 });

  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_GRID_CHAT_CODE,
    inner: makeInboundChat('/grid 2700', { cast: 0 }),
  });

  assert.equal(result.accept, true);
  assert.equal(result.reject, undefined);
  assert.deepEqual(result.units, [charId]);
  assert.equal(result.notifies.length, 1);
  assert.equal(result.notifies[0].target, 'all');
  assert.equal(result.notifies[0].inner.readUInt16BE(4), NOTIFY_MOVED_GRID_CODE);
  assert.equal(state.getFleet(charId).cell, 2700);
  assert.equal(state.commandLogCount(), 1);
  assert.deepEqual(state.listCommandLog()[0], {
    seq: 1,
    connectionId: 6,
    innerCode: COMMAND_GRID_CHAT_CODE,
    accept: true,
    reject: null,
    units: [charId],
    effect: 'grid-chat-fleet-move',
    debug: { destCell: 2700, source: 'chat-fallback' },
  });
});

test('processCommand /grid chat fallback falls back to only fleet when char id mismatch', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 0x9999 });
  state.upsertFleet({ id: 0x0100_0002, cell: 500 });

  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_GRID_CHAT_CODE,
    inner: makeInboundChat('/grid 1234'),
  });

  assert.equal(result.accept, true);
  assert.equal(state.getFleet(0x0100_0002).cell, 1234);
  assert.equal(result.notifies[0].inner.readUInt16BE(4), NOTIFY_MOVED_GRID_CODE);
});

test('processCommand /grid chat fallback rejects when no fleet exists', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });

  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_GRID_CHAT_CODE,
    inner: makeInboundChat('/grid 9999'),
  });

  assert.equal(result.accept, false);
  assert.equal(result.reject, 'no-fleet');
  assert.equal(result.notifies.length, 0);
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
  const result = processCommand({ state, connectionId: 6, innerCode: 0x1234, inner: unknown });
  assert.equal(result.reject, 'unknown-command');
  assert.equal(state.commandLogCount(), 2);
  assert.deepEqual(state.listCommandLog()[1], {
    seq: 2,
    connectionId: 6,
    innerCode: 0x1234,
    accept: false,
    reject: 'unknown-command',
    units: [],
    effect: null,
  });
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
  assert.equal(move.format, 'legacy-grid-dwords');
  assert.equal(move.unitId, 0x01000005);
  assert.equal(move.destCell, 1234);
});

test('parseInboundMoveGrid classifies live SendWarp coordinate payload diagnostic-only', () => {
  const move = parseInboundMoveGrid(
    Buffer.from('0b01033500880335008800000001000003350098ffffffff09b95d000000000005', 'hex'),
  );

  assert.equal(move.format, 'sendwarp-live-v1');
  assert.equal(move.unresolved, true);
  assert.equal(move.unitId, null);
  assert.equal(move.destCell, null);
  assert.deepEqual(move.fields.coord0, { x: 0x0335, y: 0x0088 });
  assert.deepEqual(move.fields.coord1, { x: 0x0335, y: 0x0088 });
  assert.equal(move.fields.actorOrSequence, 1);
  assert.deepEqual(move.fields.commandCoord, { x: 0x0335, y: 0x0098 });
  assert.equal(move.fields.routeCellCandidate, 0x09b9);
  assert.equal(move.fields.routeCellCandidateHex, '0x09b9');
  assert.equal(move.fields.routeTailWord, 0x5d00);
  assert.equal(move.fields.terminalByte, 5);
});

test('parseInboundMoveGrid keeps current live SendWarp candidate fields without promoting them', () => {
  const move = parseInboundMoveGrid(
    Buffer.from('0b01033500880335008800000001000003350098ffffffff09b977000000000005', 'hex'),
  );

  assert.equal(move.format, 'sendwarp-live-v1');
  assert.equal(move.unresolved, true);
  assert.equal(move.unitId, null);
  assert.equal(move.destCell, null);
  assert.equal(move.fields.routeCellCandidate, 0x09b9);
  assert.equal(move.fields.routeTailWord, 0x7700);
  assert.equal(move.fields.terminalByte, 5);
});

test('parseInboundMoveGrid exposes target-dependent live SendWarp candidates', () => {
  const samples = [
    {
      target: [1100, 455],
      raw: '0b01033500880335008800000001000003350098ffffffff09b977000000000005',
      routeCellCandidate: 0x09b9,
      routeTailWord: 0x7700,
    },
    {
      target: [1300, 500],
      raw: '0b01033500880335008800000001000003350098ffffffff0a1f79000000000005',
      routeCellCandidate: 0x0a1f,
      routeTailWord: 0x7900,
    },
    {
      target: [900, 600],
      raw: '0b01033500880335008800000001000003350098ffffffff0a1b82000000000005',
      routeCellCandidate: 0x0a1b,
      routeTailWord: 0x8200,
    },
  ];

  for (const sample of samples) {
    const move = parseInboundMoveGrid(Buffer.from(sample.raw, 'hex'));
    assert.equal(move.format, 'sendwarp-live-v1', `target ${sample.target.join(',')}`);
    assert.equal(move.unitId, null);
    assert.equal(move.destCell, null);
    assert.equal(move.unresolved, true);
    assert.equal(move.fields.routeCellCandidate, sample.routeCellCandidate);
    assert.equal(move.fields.routeTailWord, sample.routeTailWord);
  }
});

test('processCommand grid-move: ACKs 0x0b01 to self and broadcasts NotifyMovedGrid 0x0b07 to ALL clients', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.upsertShip({ id: 0x01000005, owner: 6 });
  state.upsertFleet({ id: 0x01000005, owner: 1, cell: 1000 });
  const rawMove = makeInboundMoveGrid(0x01000005, 2550);
  const result = processCommand({
    state,
    connectionId: 6,
    innerCode: COMMAND_MOVE_GRID_CODE,
    inner: rawMove,
  });
  assert.equal(result.accept, true);
  assert.deepEqual(result.units, [0x01000005]);
  assert.equal(result.notifies.length, 2);
  // 0x0b01 ACK only to the mover; SelectGrid waits for this event even though the consumer is a stub.
  assert.equal(result.notifies[0].target, 'self');
  assert.equal(result.notifies[0].inner.readUInt16BE(4), COMMAND_MOVE_GRID_CODE);
  assert.deepEqual(result.notifies[0].inner.subarray(6), rawMove.subarray(2));
  // 0x0b07 to ALL so the mover's own fleet relocates too; code lands at offset 4 (after the envelope).
  assert.equal(result.notifies[1].target, 'all');
  assert.equal(result.notifies[1].inner.readUInt16BE(4), 0x0b07);
  // unitCount @ payload+0x12 (envelope is 6 bytes), first unit @ payload+0x14.
  assert.equal(result.notifies[1].inner.readUInt8(6 + 0x12), 1);
  assert.equal(result.notifies[1].inner.readUInt32LE(6 + 0x14), 0x01000005);
  assert.equal(result.notifies[1].inner.readUInt32LE(6 + 0x14 + 4), 2550);
  assert.equal(state.getFleet(0x01000005).cell, 2550);
  assert.equal(state.commandLogCount(), 1);
  assert.deepEqual(state.listCommandLog()[0], {
    seq: 1,
    connectionId: 6,
    innerCode: COMMAND_MOVE_GRID_CODE,
    accept: true,
    reject: null,
    units: [0x01000005],
    effect: 'fleet-grid-move',
    debug: {
      unitId: 0x01000005,
      unitIdHex: '0x01000005',
      destCell: 2550,
      destCellHex: '0x000009f6',
      hadFleet: true,
      parsed: result.debug.parsed,
    },
  });
  assert.deepEqual(result.debug, state.listCommandLog()[0].debug);
});

test('processCommand grid-move: dev fallback maps live coordinate payload to player-side fleet', () => {
  const prev = process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
  process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL = '2115';
  try {
    const state = createWorldState();
    state.addPlayer({ connectionId: 3, charId: 3, powerId: 0x501 });
    state.upsertFleet({ id: 1001, owner: 1, faction: 1, commander: 4097, cell: 2686 });
    const liveInner = Buffer.from(
      '0b01033500880335008800000001000003350098ffffffff09b95d000000000005',
      'hex',
    );

    const result = processCommand({
      state,
      connectionId: 3,
      innerCode: COMMAND_MOVE_GRID_CODE,
      inner: liveInner,
    });

    assert.equal(result.accept, true);
    assert.deepEqual(result.units, [1001]);
assert.equal(state.getFleet(1001).cell, 0x09b9);
assert.equal(result.notifies[1].inner.readUInt32LE(6 + 0x14), 1001);
assert.equal(result.notifies[1].inner.readUInt32LE(6 + 0x14 + 4), 0x09b9);
assert.equal(result.debug.hadFleet, true);
assert.equal(result.debug.destCell, 0x09b9);
assert.equal(result.debug.fallback.source, 'LOGH_DEV_GRID_MOVE_FALLBACK_CELL:routeCellCandidate');
assert.equal(result.debug.fallback.configuredFallbackCell, 2115);
assert.equal(result.debug.parsed.format, 'sendwarp-live-v1');
    assert.equal(result.debug.parsed.unresolved, true);
    assert.equal(result.debug.fallback.originalUnitId, null);
    assert.equal(result.debug.fallback.originalDestCell, null);
    assert.equal(result.debug.fallback.parsed.format, 'sendwarp-live-v1');
  } finally {
    if (prev === undefined) delete process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL;
    else process.env.LOGH_DEV_GRID_MOVE_FALLBACK_CELL = prev;
  }
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

// ===========================================================================
// STEP5 wiring — fire/fight 커맨드가 마지막 적을 격침하면 처리 결과에 전략모드 복귀(0x042f modeKind=2)가
// 붙고 전투 세션이 닫힌다. concludeBattle 순수함수 자체는 battle-engine 테스트가 검증; 여기선 배선만 확인.
// ===========================================================================

// CommandFight 0x0407 인바운드: [u16 BE code][body], count @12, attacker id 배열 @16(stride 4).
function makeInboundFight(attackerIds) {
  const inner = Buffer.alloc(2 + 0x24);
  inner.writeUInt16BE(COMMAND_FIGHT_CODE, 0);
  const body = inner.subarray(2);
  body.writeUInt8(attackerIds.length, 12);
  attackerIds.forEach((id, i) => body.writeUInt32LE(id >>> 0, 16 + i * 4));
  return inner;
}

test('processCommand fight: 마지막 적 격침 시 0x042f(modeKind=2) 복귀 notify + 전투 종료', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });
  state.joinBattle(6);
  state.upsertShip({ id: 100, owner: 6, faction: 1 });                 // 플레이어(생존)
  state.upsertShip({                                                    // 적(한 방에 격침)
    id: 200, owner: 7, faction: 2,
    stats: { maxShield: 0, maxArmor: 0, maxZanki: 1, defense: 0 },
  });
  assert.equal(state.isBattleActive(), true);

  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: makeInboundFight([100]) });
  assert.equal(res.accept, true);
  assert.ok(!state.getShip(200), '격침 적은 removeShip됨');

  // 마지막 적이 사라졌으니 전략모드 복귀 notify가 정확히 하나 붙어야 한다.
  const back = res.notifies.filter((n) => n.inner.readUInt16BE(4) === NOTIFY_CHANGE_MODE_CODE);
  assert.equal(back.length, 1, '0x042f 전략복귀 notify 1개');
  assert.equal(back[0].inner.subarray(6).readUInt8(0x04), RETURN_TO_STRATEGIC_MODE_KIND, 'modeKind=2');
  assert.equal(state.isBattleActive(), false, '전투 세션이 닫혔다');
});

test('processCommand fight: 적이 남아있으면(전투 계속) 복귀 notify 없음', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });
  state.upsertShip({ id: 100, owner: 6, faction: 1 });
  state.upsertShip({ id: 200, owner: 7, faction: 2 });                  // 튼튼한 적(한 방에 안 죽음)
  state.upsertShip({ id: 201, owner: 7, faction: 2 });

  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: makeInboundFight([100]) });
  assert.equal(res.accept, true);
  const back = res.notifies.filter((n) => n.inner.readUInt16BE(4) === NOTIFY_CHANGE_MODE_CODE);
  assert.equal(back.length, 0, '적 생존 → 복귀 notify 없음');
  assert.equal(state.isBattleActive(), true, '전투 계속');
});

test('processCommand fight: 전투 비활성이면 종결 판정을 건너뛴다(no-op)', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  // openBattle 호출 안 함 → isBattleActive()=false
  state.upsertShip({ id: 100, owner: 6, faction: 1 });
  state.upsertShip({ id: 200, owner: 7, faction: 2, stats: { maxShield: 0, maxArmor: 0, maxZanki: 1, defense: 0 } });
  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: makeInboundFight([100]) });
  assert.equal(res.accept, true);
  const back = res.notifies.filter((n) => n.inner.readUInt16BE(4) === NOTIFY_CHANGE_MODE_CODE);
  assert.equal(back.length, 0, '전투 비활성 → 종결 notify 없음');
});

// ===========================================================================
// 戦死(combat-death) 배선 — 격침된 함선이 캐릭터 旗艦이면 負傷워프 vs 사망 처리(3.2).
// char-registry(getCharacterByFlagship)로 함선↔사령관을 잇는다. 旗艦 아니면 평소대로 removeShip만.
// ===========================================================================
test('processCommand fight: 旗艦 격침 + deathToggle false → 負傷(injured) + 캐릭터 생존', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });
  // 적 旗艦: 한 방에 격침되는 약한 함선 + 그 함선을 기함으로 둔 캐릭터(deathToggle false=기본).
  state.upsertShip({ id: 100, owner: 6, faction: 1 });
  state.upsertShip({ id: 0x200, owner: 7, faction: 2, stats: { maxShield: 0, maxArmor: 0, maxZanki: 1, defense: 0 } });
  state.upsertCharacter({ id: 0x01000009, faction: 'alliance', rank: 12, flagship: 0x200, returnPlanet: 'ハイネセン', deathToggle: false });
  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: makeInboundFight([100]) });
  assert.equal(res.accept, true);
  assert.ok(res.casualties?.length === 1, '旗艦 격침 → casualty 1건');
  assert.equal(res.casualties[0].outcome, 'injured');
  assert.equal(res.casualties[0].warpTo, 'ハイネセン', '帰還惑星으로 워프');
  // 캐릭터는 생존(부상), 함선은 전장에서 제거.
  assert.equal(state.getCharacter(0x01000009).alive, true);
  assert.equal(state.getCharacter(0x01000009).injured, true);
  assert.ok(!state.getShip(0x200), '함선은 전술 그리드에서 제거');
});

test('processCommand fight: 旗艦 격침 + deathToggle true & rank≥准将 → 사망 + 평가포인트', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });
  state.upsertShip({ id: 100, owner: 6, faction: 1 });
  state.upsertShip({ id: 0x201, owner: 7, faction: 2, stats: { maxShield: 0, maxArmor: 0, maxZanki: 1, defense: 0 } });
  state.upsertCharacter({ id: 0x0100000a, faction: 'alliance', rank: 14, flagship: 0x201, deathToggle: true });
  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: makeInboundFight([100]) });
  assert.equal(res.casualties[0].outcome, 'killed');
  assert.ok(res.casualties[0].evalAward > 0, '准将+ 사망 → 평가포인트');
  assert.equal(state.getCharacter(0x0100000a).alive, false, '사망');
});

test('processCommand fight: 일반 함선(旗艦 아님) 격침은 戦死 처리 없음', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });
  state.upsertShip({ id: 100, owner: 6, faction: 1 });
  state.upsertShip({ id: 0x202, owner: 7, faction: 2, stats: { maxShield: 0, maxArmor: 0, maxZanki: 1, defense: 0 } });
  // 캐릭터 없음 → getCharacterByFlagship null → casualties 없음.
  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: makeInboundFight([100]) });
  assert.equal(res.accept, true);
  assert.equal(res.casualties, undefined, '旗艦 아니면 casualties 필드 없음');
});

// ===========================================================================
// 降伏勧告(surrender) 배선 — 교전 후 살아남은 저사기 적에게 공격측 기함 사령관 統率로 항복 권고(3.4).
// 서버 내부판정(클라 opcode 부재): 수락 시 markSurrendered(무력화, 격침 아님). roll=state.rng(seed 결정론).
// ===========================================================================
test('processCommand fight: 高統率 사령관 + 저사기 생존 적 → 항복(무력화), 격침 아님', () => {
  const state = createWorldState({ seed: 1 }); // 결정론 rng
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });
  state.upsertShip({ id: 100, owner: 6, faction: 1 }); // 플레이어 기함
  state.upsertCharacter({ id: 0x900, faction: 'empire', leadership: 100, flagship: 100 }); // 統率 100
  // 적: 튼튼해서 한 방엔 안 죽지만 사기 1(전투 후 0 → chance 1.0).
  state.upsertShip({ id: 0x300, owner: 7, faction: 2, stats: { morale: 1 } });
  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: makeInboundFight([100]) });
  assert.equal(res.accept, true);
  assert.ok(res.surrendered?.includes(0x300), '저사기 적이 항복 수락');
  assert.equal(state.getShip(0x300).surrendered, true, '무력화 플래그');
  assert.equal(state.getShip(0x300).morale, 0);
  assert.ok(state.getShip(0x300), '격침이 아니라 전장에 남음(무력화)');
  // 무력화된 적은 더는 표적이 되지 않는다.
  assert.equal(state.pickTarget(100), null, '항복 적은 pickTarget 제외');
});

test('processCommand fight: 사령관 統率 0(또는 旗艦 아님)이면 항복 권고 안 함', () => {
  const state = createWorldState({ seed: 1 });
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.openBattle({ mode: 0 });
  state.upsertShip({ id: 100, owner: 6, faction: 1 }); // 캐릭터 미등록 → getCharacterByFlagship null
  state.upsertShip({ id: 0x301, owner: 7, faction: 2, stats: { morale: 1 } });
  const res = processCommand({ state, connectionId: 6, innerCode: COMMAND_FIGHT_CODE, inner: makeInboundFight([100]) });
  assert.equal(res.accept, true);
  assert.equal(res.surrendered, undefined, '旗艦 사령관 없음 → 항복 없음');
  assert.ok(!state.getShip(0x301).surrendered);
});

test('worldState rng: seed 동일 → 결정론(재현)', () => {
  const a = createWorldState({ seed: 42 });
  const b = createWorldState({ seed: 42 });
  const seqA = [a.rng(), a.rng(), a.rng()];
  const seqB = [b.rng(), b.rng(), b.rng()];
  assert.deepEqual(seqA, seqB, '같은 seed → 같은 수열');
  assert.ok(seqA.every((v) => v >= 0 && v < 1), '0..1 범위');
});

// --- canCommand 게이트(저사기/혼란 지휘불가, 캐논 p442) + 地上戦 반격피해 (감사 2026-06-20) -----------

test('processCommand move: 저사기 함선은 지휘불가로 거부(low-morale-uncommandable)', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.upsertShip({ id: 0x01000000, owner: 6 });
  state.getShip(0x01000000).morale = 10; // 임계(20) 미만
  const result = processCommand({
    state, connectionId: 6, innerCode: COMMAND_MOVE_SHIP_CODE,
    inner: makeInboundMoveShip([0x01000000], [{ x: 1, z: 2, y: 0, heading: 0 }]),
  });
  assert.equal(result.accept, false);
  assert.equal(result.reject, 'low-morale-uncommandable');
});

test('processCommand move: 정상 사기 함선은 수락(게이트가 정상 명령은 안 막음)', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 1 });
  state.upsertShip({ id: 0x01000000, owner: 6 });
  state.getShip(0x01000000).morale = 100;
  const result = processCommand({
    state, connectionId: 6, innerCode: COMMAND_MOVE_SHIP_CODE,
    inner: makeInboundMoveShip([0x01000000], [{ x: 1, z: 2, y: 0, heading: 0 }]),
  });
  assert.equal(result.accept, true);
});

test('seedPersonnelFromWorldState: 월드진입 시 worldState 캐릭터를 personnelState에 시드한다', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 7, charId: 42 });
  state.upsertCharacter({
    id: 42, faction: 'empire', rank: 5, achievement: 80,
    title: 3, socialClass: 'noble', fiefs: [10, 20],
  });
  const seeded = seedPersonnelFromWorldState({ state });
  assert.equal(seeded, true, '시드 성공');
  const personnel = state._personnel;
  assert.ok(personnel, 'personnelState 생성됨');
  const ch = personnel.getCharacter(42);
  assert.ok(ch, '캐릭터 42가 personnel 로스터에 있음');
  assert.equal(ch.rank, 5, '계급 보존');
  assert.equal(ch.achievement, 80, '功績 보존');
  assert.equal(ch.title, 3, '작위 보존');
  assert.equal(ch.faction, 'empire', '진영 보존');
  assert.equal(ch.socialClass, 'noble', '출신 계급 보존');
  assert.deepEqual(ch.fiefs, [10, 20], '봉토 보존');
  assert.equal(ch.owner, 7, 'owner=connectionId');
});

test('seedPersonnelFromWorldState: 캐릭터 없으면 no-op(false)', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 7, charId: 42 });
  // worldState에 캐릭터 42를 등록하지 않음
  const seeded = seedPersonnelFromWorldState({ state });
  assert.equal(seeded, false, '시드 실패(캐릭터 없음)');
});

test('seedPersonnelFromWorldState: 플레이어 없으면 false', () => {
  const state = createWorldState();
  const seeded = seedPersonnelFromWorldState({ state });
  assert.equal(seeded, false, '플레이어 없음');
});

test('processCommand strategy route creates shared command target pool', () => {
  const state = createWorldState();
  state.addPlayer({ connectionId: 6, charId: 11, powerId: 4 });
  const inner = Buffer.alloc(2 + 0x1c);
  inner.writeUInt16BE(0x0900, 0);
  const body = inner.subarray(2);
  body.writeUInt32LE(0x50, 8);
  body.writeUInt32LE(0x07, 12);

  const result = processCommand({ state, connectionId: 6, innerCode: 0x0900, inner });

  assert.equal(result.accept, true);
  assert.ok(state._commandTargets);
  assert.equal(state._strategy.targets, state._commandTargets);
  const snapshot = state._commandTargets.snapshot();
  assert.equal(snapshot.characters[0].id, 11);
  assert.ok(snapshot.outfits.length > 0);
  assert.equal(state.commandLogCount(), 1);
  assert.deepEqual(state.listCommandLog()[0], {
    seq: 1,
    connectionId: 6,
    innerCode: 0x0900,
    accept: true,
    reject: null,
    units: [],
    effect: 'strategy-command',
  });
});
