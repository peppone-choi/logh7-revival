/**
 * Internal-affairs PERSONNEL (人事 / cards) engine tests — the six command parsers' offsets, the four
 * S→C notify builders' size/fields, and the processPersonnel() validate/accept/notify contract.
 * Pure/synchronous: no live client. Wire layouts per docs/logh7-proto-personnel-strategy.md §2/§4.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseInboundRankUp,
  parseInboundSpeciallyRankUp,
  parseInboundRankDown,
  parseInboundCardAppointment,
  parseInboundCardDismisal,
  parseInboundCardResignation,
  buildNotifyCardLossInner,
  buildNotifyCardLossMovedSpotInner,
  buildNotifyChangeFlagShipInner,
  buildNotifyInformationCharacterInner,
  createPersonnelState,
  processPersonnel,
  COMMAND_RANK_UP_CODE,
  COMMAND_SPECIALLY_RANK_UP_CODE,
  COMMAND_RANK_DOWN_CODE,
  COMMAND_CARD_APPOINTMENT_CODE,
  COMMAND_CARD_DISMISAL_CODE,
  COMMAND_CARD_RESIGNATION_CODE,
  NOTIFY_CARD_LOSS_CODE,
  NOTIFY_CARD_LOSS_MOVED_SPOT_CODE,
  NOTIFY_INFORMATION_CHARACTER_CODE,
  NOTIFY_CHANGE_FLAGSHIP_CODE,
  NOTIFY_CARD_LOSS_BYTES,
  NOTIFY_CARD_LOSS_MOVED_SPOT_BYTES,
  NOTIFY_CHANGE_FLAGSHIP_BYTES,
  MAX_RANK,
  MAX_SEATS_PER_OUTFIT,
} from '../../src/server/logh7-personnel.mjs';

/** Build a raw client inner: [u16 BE code][body]. */
function rawInner(code, body) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(code & 0xffff, 0);
  return Buffer.concat([head, body]);
}

/** Decode the message32 receive form [u32 0][u16 BE code][LE payload] a builder returns. */
function decodeMessage32(inner) {
  return { prefix: inner.readUInt32BE(0), code: inner.readUInt16BE(4), payload: inner.subarray(6) };
}

/** Decode a bare receive form [u16 BE code][LE body]. */
function decodeBare(inner) {
  return { code: inner.readUInt16BE(0), body: inner.subarray(2) };
}

// =================================================================================================
// PARSERS — offsets
// =================================================================================================

test('parseInboundRankUp reads target_rank@0x10, achievement@0x14, move_spot@0x18, move_character[]@0x20', () => {
  const body = Buffer.alloc(0x20 + 2 * 4);
  body.writeUInt32LE(0x11223344, 0x00); // time
  body.writeUInt8(7, 0x10); // target_rank
  body.writeUInt32LE(900, 0x14); // achievement
  body.writeUInt32LE(0xabcd, 0x18); // move_spot
  body.writeUInt8(2, 0x1c); // move_character_size
  body.writeUInt32LE(101, 0x20);
  body.writeUInt32LE(202, 0x24);
  const p = parseInboundRankUp(rawInner(COMMAND_RANK_UP_CODE, body));
  assert.equal(p.time, 0x11223344);
  assert.equal(p.targetRank, 7);
  assert.equal(p.achievement, 900);
  assert.equal(p.moveSpot, 0xabcd);
  assert.deepEqual(p.moveCharacters, [101, 202]);
  assert.equal(parseInboundRankUp(rawInner(COMMAND_RANK_UP_CODE, Buffer.alloc(8))), null);
});

test('parseInboundSpeciallyRankUp reads target_character@0x10, goto_rank@0x14, down_achievement[]@0x20 stride 8', () => {
  const body = Buffer.alloc(0x20 + 2 * 8 + 5 + 1 * 4);
  body.writeUInt32LE(500, 0x10); // target_character
  body.writeUInt8(9, 0x14); // target_goto_rank
  body.writeUInt32LE(1234, 0x18); // achievement
  body.writeUInt16LE(2, 0x1c); // down_achievement_character_size
  body.writeUInt32LE(11, 0x20); body.writeUInt32LE(50, 0x24); // entry 0 {character,achievement}
  body.writeUInt32LE(12, 0x28); body.writeUInt32LE(60, 0x2c); // entry 1
  const off = 0x30;
  body.writeUInt32LE(0x777, off); // move_spot
  body.writeUInt8(1, off + 4); // move_character_size
  body.writeUInt32LE(303, off + 5); // move_character[0]
  const p = parseInboundSpeciallyRankUp(rawInner(COMMAND_SPECIALLY_RANK_UP_CODE, body));
  assert.equal(p.targetCharacter, 500);
  assert.equal(p.targetGotoRank, 9);
  assert.equal(p.achievement, 1234);
  assert.deepEqual(p.downAchievement, [{ character: 11, achievement: 50 }, { character: 12, achievement: 60 }]);
  assert.equal(p.moveSpot, 0x777);
  assert.deepEqual(p.moveCharacters, [303]);
});

test('parseInboundRankDown reads target_rank@0x10, target_character@0x14, move_spot@0x20, move_character[]@0x28', () => {
  const body = Buffer.alloc(0x28 + 1 * 4);
  body.writeUInt8(3, 0x10); // target_rank
  body.writeUInt32LE(700, 0x14); // target_character
  body.writeUInt32LE(40, 0x18); // exec_character_achievement
  body.writeUInt32LE(20, 0x1c); // rankchanged_character_achievement
  body.writeUInt32LE(0x55, 0x20); // move_spot
  body.writeUInt8(1, 0x24); // move_character_size
  body.writeUInt32LE(808, 0x28);
  const p = parseInboundRankDown(rawInner(COMMAND_RANK_DOWN_CODE, body));
  assert.equal(p.targetRank, 3);
  assert.equal(p.targetCharacter, 700);
  assert.equal(p.execAchievement, 40);
  assert.equal(p.achievement, 20);
  assert.equal(p.moveSpot, 0x55);
  assert.deepEqual(p.moveCharacters, [808]);
});

test('parseInboundCardAppointment reads target_outfit@0x10, card@0x18, seat_role@0x1c, chief_spot@0x20 (40B)', () => {
  const body = Buffer.alloc(40);
  body.writeUInt32LE(0xdeadbeef, 0x00); // time
  body.writeUInt32LE(42, 0x10); // target_outfit
  body.writeUInt32LE(1001, 0x18); // card_character
  body.writeUInt32LE(3, 0x1c); // seat_role
  body.writeUInt32LE(0x99, 0x20); // chief_spot
  const p = parseInboundCardAppointment(rawInner(COMMAND_CARD_APPOINTMENT_CODE, body));
  assert.equal(p.time, 0xdeadbeef);
  assert.equal(p.targetOutfit, 42);
  assert.equal(p.cardCharacter, 1001);
  assert.equal(p.seatRole, 3);
  assert.equal(p.chiefSpot, 0x99);
  assert.equal(parseInboundCardAppointment(rawInner(COMMAND_CARD_APPOINTMENT_CODE, Buffer.alloc(8))), null);
});

test('parseInboundCardDismisal reads target_character@0x10, card@0x14, move_spot@0x18, move_character[]@0x20', () => {
  const body = Buffer.alloc(0x20 + 2 * 4);
  body.writeUInt32LE(1001, 0x10); // target_character
  body.writeUInt32LE(77, 0x14); // card
  body.writeUInt32LE(0x12, 0x18); // move_spot
  body.writeUInt8(2, 0x1c); // move_character_size
  body.writeUInt32LE(1, 0x20); body.writeUInt32LE(2, 0x24);
  const p = parseInboundCardDismisal(rawInner(COMMAND_CARD_DISMISAL_CODE, body));
  assert.equal(p.targetCharacter, 1001);
  assert.equal(p.card, 77);
  assert.equal(p.moveSpot, 0x12);
  assert.deepEqual(p.moveCharacters, [1, 2]);
});

test('parseInboundCardResignation reads card@0x10, move_spot@0x14, move_character[]@0x1c', () => {
  const body = Buffer.alloc(0x1c + 1 * 4);
  body.writeUInt32LE(88, 0x10); // card
  body.writeUInt32LE(0x34, 0x14); // move_spot
  body.writeUInt8(1, 0x18); // move_character_size
  body.writeUInt32LE(909, 0x1c);
  const p = parseInboundCardResignation(rawInner(COMMAND_CARD_RESIGNATION_CODE, body));
  assert.equal(p.card, 88);
  assert.equal(p.moveSpot, 0x34);
  assert.deepEqual(p.moveCharacters, [909]);
});

// =================================================================================================
// BUILDERS — size + fields
// =================================================================================================

test('buildNotifyCardLossInner: 12B body, owner@0x04, silent@0x08, card_id u16@0x0a (bare receive form)', () => {
  const inner = buildNotifyCardLossInner({ owner: 5, cardId: 0x1234, silent: false, time: 9 });
  const { code, body } = decodeBare(inner);
  assert.equal(code, NOTIFY_CARD_LOSS_CODE);
  assert.equal(body.length, NOTIFY_CARD_LOSS_BYTES);
  assert.equal(body.readUInt32LE(0x00), 9); // time
  assert.equal(body.readUInt32LE(0x04), 5); // owner
  assert.equal(body.readUInt8(0x08), 0); // silent=false -> plays sound
  assert.equal(body.readUInt16LE(0x0a), 0x1234); // card_id
  assert.equal(buildNotifyCardLossInner({ silent: true }).subarray(2).readUInt8(0x08), 1);
});

test('buildNotifyCardLossMovedSpotInner: 16B body, owner@0x04, spotX@0x08, spotY@0x0c', () => {
  const inner = buildNotifyCardLossMovedSpotInner({ owner: 6, spotX: 100, spotY: 200, time: 3 });
  const { code, body } = decodeBare(inner);
  assert.equal(code, NOTIFY_CARD_LOSS_MOVED_SPOT_CODE);
  assert.equal(body.length, NOTIFY_CARD_LOSS_MOVED_SPOT_BYTES);
  assert.equal(body.readUInt32LE(0x00), 3);
  assert.equal(body.readUInt32LE(0x04), 6);
  assert.equal(body.readUInt32LE(0x08), 100);
  assert.equal(body.readUInt32LE(0x0c), 200);
});

test('buildNotifyChangeFlagShipInner: 92B message32 record, character@0x00, kind@0x08, outfit@0x10, boarding_ship@0x14, troop_units@0x18', () => {
  const inner = buildNotifyChangeFlagShipInner({
    character: 1001, kind: 7, mode: 2, grid: 80, outfit: 42, boardingShip: 5005, troopUnits: 4,
    base: 33, moraleMax: 100, rebellion: 0, damaged: 2, destroyed: 1, supplies: 9000, mobilization: 3,
    cruising: 1.5,
  });
  const { prefix, code, payload } = decodeMessage32(inner);
  assert.equal(prefix, 0);
  assert.equal(code, NOTIFY_CHANGE_FLAGSHIP_CODE);
  assert.equal(payload.length, NOTIFY_CHANGE_FLAGSHIP_BYTES);
  assert.equal(payload.readUInt32LE(0x00), 1001); // character
  assert.equal(payload.readUInt16LE(0x08), 7); // kind
  assert.equal(payload.readUInt8(0x0a), 2); // mode
  assert.equal(payload.readUInt32LE(0x0c), 80); // grid
  assert.equal(payload.readUInt32LE(0x10), 42); // outfit
  assert.equal(payload.readUInt32LE(0x14), 5005); // boarding_ship
  assert.equal(payload.readUInt8(0x18), 4); // troop_units
  assert.equal(payload.readUInt32LE(0x1c), 33); // base
  assert.equal(payload.readUInt8(0x20), 100); // morale_max
  assert.equal(payload.readUInt16LE(0x22), 2); // damaged
  assert.equal(payload.readUInt16LE(0x24), 1); // destroyed
  assert.equal(payload.readUInt32LE(0x28), 9000); // supplies
  assert.equal(payload.readUInt32LE(0x2c), 3); // mobilization
  assert.ok(Math.abs(payload.readFloatLE(0x30) - 1.5) < 1e-6); // cruising (float)
});

test('buildNotifyInformationCharacterInner: 724B message32, code 0x356, reuses the 0x0323 field stream (id@0x00, faction@0x04, spot@0x1c, ability_8@0x188)', () => {
  const inner = buildNotifyInformationCharacterInner({
    characterId: 1001, power: 1, spot: 80, abilities: [90, 80, 70, 60, 50, 40, 30, 20], rank: 9, face: 0x0323,
    lastname: 'Reinhard', firstname: 'Lohengramm',
  });
  const { code, payload } = decodeMessage32(inner);
  assert.equal(code, NOTIFY_INFORMATION_CHARACTER_CODE);
  assert.equal(payload.length, 0x02d4); // 724 — same record size as 0x0323
  assert.equal(payload.readUInt32LE(0x00), 1001); // character id
  assert.equal(payload.readUInt8(0x04), 1); // faction/power
  assert.equal(payload.readUInt32LE(0x1c), 80); // spot/system
  assert.equal(payload.readUInt16LE(0x188), 90); // ability[0] = 統率
  assert.equal(payload.readUInt16LE(0x188 + 7 * 4), 20); // ability[7] = 防御
  // parentage[0] sub-record @0x80: lastname @0x81/0x82, rank @0xd6, face @0xf4.
  assert.equal(payload.readUInt8(0x80 + 0x01), 'Reinhard'.length);
  assert.equal(payload.readUInt16LE(0x80 + 0x56), 9); // rank
  assert.equal(payload.readUInt32LE(0x80 + 0x74), 0x0323); // face
});

// =================================================================================================
// STATE
// =================================================================================================

test('createPersonnelState: seat append caps at 16 and removeCard finds the holding outfit', () => {
  const state = createPersonnelState();
  state.addOutfit({ id: 42, owner: 1 });
  for (let i = 0; i < MAX_SEATS_PER_OUTFIT; i += 1) {
    assert.ok(state.appointCard(42, { character: 1000 + i, role: 0 }));
  }
  assert.equal(state.appointCard(42, { character: 9999 }), null); // 17th seat rejected
  const removed = state.removeCard(1005);
  assert.equal(removed.outfit.id, 42);
  assert.equal(state.getOutfit(42).seats.length, MAX_SEATS_PER_OUTFIT - 1);
});

// =================================================================================================
// process() — accept/notify contract + validation
// =================================================================================================

test('processPersonnel CardAppointment: appoints the card, broadcasts 0x356 + 0x358 to all', () => {
  const state = createPersonnelState();
  state.addOutfit({ id: 42, owner: 1 });
  state.addCharacter({ id: 1001, rank: 5, owner: 1 });
  const body = Buffer.alloc(40);
  body.writeUInt32LE(42, 0x10); // target_outfit
  body.writeUInt32LE(1001, 0x18); // card_character
  body.writeUInt32LE(2, 0x1c); // seat_role
  body.writeUInt32LE(0x77, 0x20); // chief_spot
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_CARD_APPOINTMENT_CODE, inner: rawInner(COMMAND_CARD_APPOINTMENT_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getOutfit(42).seats.length, 1);
  assert.deepEqual(state.getOutfit(42).seats[0], { character: 1001, role: 2 });
  assert.equal(r.notifies.length, 2);
  assert.equal(r.notifies[0].target, 'all');
  assert.equal(decodeMessage32(r.notifies[0].inner).code, NOTIFY_INFORMATION_CHARACTER_CODE);
  assert.equal(decodeMessage32(r.notifies[1].inner).code, NOTIFY_CHANGE_FLAGSHIP_CODE);
});

test('processPersonnel CardAppointment: rejects when actor does not own the outfit', () => {
  const state = createPersonnelState();
  state.addOutfit({ id: 42, owner: 2 }); // owned by connection 2
  const body = Buffer.alloc(40);
  body.writeUInt32LE(42, 0x10);
  body.writeUInt32LE(1001, 0x18);
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_CARD_APPOINTMENT_CODE, inner: rawInner(COMMAND_CARD_APPOINTMENT_CODE, body) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'not-owner');
});

test('processPersonnel CardAppointment: rejects when the seat array is full (16)', () => {
  const state = createPersonnelState();
  state.addOutfit({ id: 42, owner: 1 });
  for (let i = 0; i < MAX_SEATS_PER_OUTFIT; i += 1) state.appointCard(42, { character: 2000 + i });
  const body = Buffer.alloc(40);
  body.writeUInt32LE(42, 0x10);
  body.writeUInt32LE(1001, 0x18);
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_CARD_APPOINTMENT_CODE, inner: rawInner(COMMAND_CARD_APPOINTMENT_CODE, body) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'seat-full');
});

test('processPersonnel CardDismisal: removes the seat + broadcasts NotifyCardLoss (0x70a) and NotifyCardLossMovedSpot (0x70b) when spot moves', () => {
  const state = createPersonnelState();
  state.addOutfit({ id: 42, owner: 1 });
  state.addCharacter({ id: 1001, rank: 5, owner: 1 });
  state.appointCard(42, { character: 1001, role: 0 });
  const body = Buffer.alloc(0x20);
  body.writeUInt32LE(1001, 0x10); // target_character
  body.writeUInt32LE(1001, 0x14); // card
  body.writeUInt32LE(0x55, 0x18); // move_spot (non-zero -> moved-spot notify)
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_CARD_DISMISAL_CODE, inner: rawInner(COMMAND_CARD_DISMISAL_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getOutfit(42).seats.length, 0); // card removed
  assert.equal(state.getCharacter(1001).spot, 0x55); // relocated
  assert.equal(decodeBare(r.notifies[0].inner).code, NOTIFY_CARD_LOSS_CODE);
  assert.equal(decodeBare(r.notifies[0].inner).body.readUInt32LE(0x04), 1); // owner = outfit owner
  assert.equal(decodeBare(r.notifies[0].inner).body.readUInt16LE(0x0a), 1001 & 0xffff); // card id
  assert.equal(decodeBare(r.notifies[1].inner).code, NOTIFY_CARD_LOSS_MOVED_SPOT_CODE);
  assert.equal(decodeBare(r.notifies[1].inner).body.readUInt32LE(0x08), 0x55); // new spotX
});

test('processPersonnel CardResignation: removes the seat by `card` id; no moved-spot notify when move_spot=0', () => {
  const state = createPersonnelState();
  state.addOutfit({ id: 42, owner: 1 });
  state.addCharacter({ id: 88, owner: 1 });
  state.appointCard(42, { character: 88 });
  const body = Buffer.alloc(0x1c);
  body.writeUInt32LE(88, 0x10); // card
  body.writeUInt32LE(0, 0x14); // move_spot = 0
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_CARD_RESIGNATION_CODE, inner: rawInner(COMMAND_CARD_RESIGNATION_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getOutfit(42).seats.length, 0);
  assert.equal(r.notifies.length, 1); // only NotifyCardLoss
  assert.equal(decodeBare(r.notifies[0].inner).code, NOTIFY_CARD_LOSS_CODE);
});

test('processPersonnel RankUp: applies rank to move_character[0], broadcasts 0x356, rejects out-of-bounds rank', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 101, rank: 5, owner: 1 });
  const body = Buffer.alloc(0x20 + 4);
  body.writeUInt8(8, 0x10); // target_rank
  body.writeUInt32LE(0x12, 0x18); // move_spot
  body.writeUInt8(1, 0x1c); // move_character_size
  body.writeUInt32LE(101, 0x20); // move_character[0] = promoted char
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_UP_CODE, inner: rawInner(COMMAND_RANK_UP_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getCharacter(101).rank, 8);
  assert.equal(state.getCharacter(101).spot, 0x12);
  assert.equal(decodeMessage32(r.notifies[0].inner).code, NOTIFY_INFORMATION_CHARACTER_CODE);

  const bad = Buffer.alloc(0x1d);
  bad.writeUInt8(MAX_RANK + 1, 0x10); // out of bounds
  const rb = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_UP_CODE, inner: rawInner(COMMAND_RANK_UP_CODE, bad) });
  assert.equal(rb.accept, false);
  assert.equal(rb.reject, 'rank-out-of-bounds');
});

test('processPersonnel RankDown: demotes target_character, broadcasts 0x356', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 700, rank: 9, owner: 1 });
  const body = Buffer.alloc(0x28);
  body.writeUInt8(3, 0x10); // target_rank
  body.writeUInt32LE(700, 0x14); // target_character
  body.writeUInt32LE(0x55, 0x20); // move_spot
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_DOWN_CODE, inner: rawInner(COMMAND_RANK_DOWN_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getCharacter(700).rank, 3);
  assert.equal(decodeMessage32(r.notifies[0].inner).code, NOTIFY_INFORMATION_CHARACTER_CODE);
  assert.equal(decodeMessage32(r.notifies[0].inner).payload.readUInt32LE(0x00), 700);
});

test('processPersonnel SpeciallyRankUp: debits funder achievement, sets goto rank, broadcasts target + each funder', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 500, rank: 6, owner: 1 });
  state.addCharacter({ id: 11, rank: 4, owner: 1, achievement: 100 });
  state.addCharacter({ id: 12, rank: 4, owner: 1, achievement: 80 });
  const body = Buffer.alloc(0x30 + 5);
  body.writeUInt32LE(500, 0x10); // target_character
  body.writeUInt8(10, 0x14); // target_goto_rank
  body.writeUInt16LE(2, 0x1c); // down count
  body.writeUInt32LE(11, 0x20); body.writeUInt32LE(50, 0x24); // funder 0 spends 50
  body.writeUInt32LE(12, 0x28); body.writeUInt32LE(30, 0x2c); // funder 1 spends 30
  body.writeUInt32LE(0x99, 0x30); // move_spot
  body.writeUInt8(0, 0x34); // move_character_size
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_SPECIALLY_RANK_UP_CODE, inner: rawInner(COMMAND_SPECIALLY_RANK_UP_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getCharacter(500).rank, 10);
  assert.equal(state.getCharacter(11).achievement, 50); // 100-50
  assert.equal(state.getCharacter(12).achievement, 50); // 80-30
  // 1 target notify + 2 funder notifies
  assert.equal(r.notifies.length, 3);
  assert.equal(decodeMessage32(r.notifies[0].inner).payload.readUInt32LE(0x00), 500);
});

test('processPersonnel: rejects unknown command code', () => {
  const state = createPersonnelState();
  const r = processPersonnel({ state, connectionId: 1, innerCode: 0x9999, inner: rawInner(0x9999, Buffer.alloc(40)) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'unknown-personnel-command');
});

test('processPersonnel RankDown: rejects when actor does not own the target character', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 700, rank: 9, owner: 2 }); // owned by connection 2
  const body = Buffer.alloc(0x28);
  body.writeUInt8(3, 0x10);
  body.writeUInt32LE(700, 0x14);
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_DOWN_CODE, inner: rawInner(COMMAND_RANK_DOWN_CODE, body) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'not-owner');
});
