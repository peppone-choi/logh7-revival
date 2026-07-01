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
  buildCardAppointmentInner,
  buildNotifyCardLossInner,
  buildNotifyCardLossMovedSpotInner,
  buildNotifyChangeFlagShipInner,
  buildNotifyInformationCharacterInner,
  decodeNotifyInformationCharacterStream,
  createPersonnelState,
  processPersonnel,
  COMMAND_RANK_UP_CODE,
  COMMAND_SPECIALLY_RANK_UP_CODE,
  COMMAND_RANK_DOWN_CODE,
  COMMAND_CARD_APPOINTMENT_CODE,
  COMMAND_CARD_DISMISAL_CODE,
  COMMAND_CARD_RESIGNATION_CODE,
  COMMAND_GRANT_TITLE_CODE,
  COMMAND_GRANT_FIEF_CODE,
  COMMAND_REVOKE_FIEF_CODE,
  parseInboundGrantTitle,
  parseInboundGrantFief,
  COMMAND_CARD_APPOINTMENT_BYTES,
  NOTIFY_CARD_LOSS_CODE,
  NOTIFY_CARD_LOSS_MOVED_SPOT_CODE,
  NOTIFY_INFORMATION_CHARACTER_CODE,
  NOTIFY_CHANGE_FLAGSHIP_CODE,
  NOTIFY_CARD_LOSS_BYTES,
  NOTIFY_CARD_LOSS_MOVED_SPOT_BYTES,
  NOTIFY_INFORMATION_CHARACTER_BYTES,
  NOTIFY_CHANGE_FLAGSHIP_BYTES,
  MAX_RANK,
  MAX_SEATS_PER_OUTFIT,
} from '../../src/server/logh7-personnel.mjs';
import { createIntelState, COUP_LOYALTY_THRESHOLD } from '../../src/server/logh7-intel.mjs';

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

function decodeNotifyCharacterObject(inner) {
  const { code, payload } = decodeMessage32(inner);
  assert.equal(code, NOTIFY_INFORMATION_CHARACTER_CODE);
  const decoded = decodeNotifyInformationCharacterStream(payload);
  assert.ok(decoded);
  assert.equal(decoded.trailing, 0);
  return decoded.object;
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

test('buildCardAppointmentInner: 40B message32 receive form appends card@0x18 into outfit@0x10', () => {
  const inner = buildCardAppointmentInner({
    time: 7,
    actor: 3,
    targetOutfit: 42,
    cardCharacter: 0x10000,
    seatRole: 5,
    chiefSpot: 99,
    tail: 11,
  });
  const { prefix, code, payload: body } = decodeMessage32(inner);
  assert.equal(prefix, 0);
  assert.equal(code, COMMAND_CARD_APPOINTMENT_CODE);
  assert.equal(body.length, COMMAND_CARD_APPOINTMENT_BYTES);
  assert.equal(body.readUInt32LE(0x00), 7);
  assert.equal(body.readUInt32LE(0x04), 3);
  assert.equal(body.readUInt32LE(0x10), 42);
  assert.equal(body.readUInt32LE(0x18), 0x10000);
  assert.equal(body.readUInt32LE(0x1c), 5);
  assert.equal(body.readUInt32LE(0x20), 99);
  assert.equal(body.readUInt32LE(0x24), 11);
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

test('buildNotifyInformationCharacterInner: compact message32 0x356 expands to the 728B native object', () => {
  const inner = buildNotifyInformationCharacterInner({
    characterId: 1001, gridUnitId: 222, power: 1, spot: 80, spotOwner: 7,
    abilities: [90, 80, 70, 60, 50, 40, 30, 20], rank: 9, title: '공작', face: 0x0323,
    lastname: 'Reinhard', firstname: 'Lohengramm', spotResolverBase: 80,
    seatEntries: [{ character: 1001, role: 2 }], influence: 88, stamina: 100, together: 1,
  });
  const { code, payload } = decodeMessage32(inner);
  assert.equal(code, NOTIFY_INFORMATION_CHARACTER_CODE);
  assert.ok(payload.length < NOTIFY_INFORMATION_CHARACTER_BYTES);
  const decoded = decodeNotifyInformationCharacterStream(payload);
  assert.ok(decoded);
  assert.equal(decoded.consumed, payload.length);
  assert.equal(decoded.trailing, 0);
  const object = decoded.object;
  assert.equal(object.length, NOTIFY_INFORMATION_CHARACTER_BYTES);
  assert.equal(object.readUInt8(0x00), 1); // valid/record flag
  assert.equal(object.readUInt32LE(0x04), 1001); // character id
  assert.equal(object.readUInt8(0x08), 1); // faction/power
  assert.equal(object.readUInt32LE(0x0c), 80); // spot/system
  assert.equal(object.readUInt32LE(0x1c), 80); // return_base mirrors spot
  assert.equal(object.readUInt32LE(0x20), 80); // current spot mirror
  assert.equal(object.readUInt32LE(0x24), 7); // spot owner
  assert.equal(object.readUInt32LE(0x28), 222); // grid unit id
  assert.equal(object.readUInt16LE(0x2e), 'R'.charCodeAt(0)); // native tray-name wchar[0]
  assert.equal(object.readUInt16LE(0x18c), 90); // ability[0] = 統率
  assert.equal(object.readUInt16LE(0x18c + 7 * 4), 20); // ability[7] = 防御
  assert.equal(object.readUInt8(0x1ac), 88); // influence(影響力)
  assert.equal(object.readUInt8(0x1ad), 100); // 体力(stamina) — 만체력 시드
  assert.equal(object.readUInt8(0x2d4), 1); // together compact tail -> PLAYER_INFO+0x2f4
  assert.equal(object.readUInt8(0x81), 1); // parentage count
  assert.equal(object.readUInt8(0x85), 'Reinhard'.length);
  assert.equal(object.readUInt16LE(0x85 + 0x55), 9); // rank
  // titlename (작위명): len @ base+0x57 (=0xdc), chars @ base+0x59 (=0xde) in the expanded native object.
  assert.equal(object.readUInt8(0x85 + 0x57), 2); // titlename length (공작)
  assert.equal(object.readUInt16LE(0x85 + 0x59), '공'.charCodeAt(0));
  assert.equal(object.readUInt16LE(0x85 + 0x59 + 2), '작'.charCodeAt(0));
  assert.equal(object.readUInt32LE(0x85 + 0x73), 0x0323); // face
  assert.equal(object.readUInt32LE(0x85 + 0x7b), 80); // expands to source +0x100 -> PLAYER_INFO +0x120
  assert.equal(object.readUInt8(0x250), 1); // action-list seat count
  assert.equal(object.readUInt16LE(0x254), 1001 & 0xffff); // seat[0].kind/card low word
  assert.equal(object.readUInt32LE(0x258), 2); // seat[0].role
});

test('AU-3 buildNotifyInformationCharacterInner: coupConduct 미지정이면 0x4c=0(기본 불변)', () => {
  const inner = buildNotifyInformationCharacterInner({ characterId: 1001, gridUnitId: 1 });
  const { payload } = decodeMessage32(inner);
  const decoded = decodeNotifyInformationCharacterStream(payload);
  assert.ok(decoded);
  // coup_conduct는 stream에서 strategy 다음 위치 → 확장 native object @0x4c. 미지정=0 그대로.
  assert.equal(decoded.object.readUInt32LE(0x4c), 0, 'coup_conduct 기본 0');
});

test('AU-3 buildNotifyInformationCharacterInner: coupConduct 시드값이 native @0x4c에 반영', () => {
  const inner = buildNotifyInformationCharacterInner({ characterId: 1001, gridUnitId: 1, coupConduct: 1 });
  const { payload } = decodeMessage32(inner);
  const decoded = decodeNotifyInformationCharacterStream(payload);
  assert.ok(decoded);
  assert.equal(decoded.object.readUInt32LE(0x4c), 1, 'coup_conduct=1 시드');
  // strategy(@0x48)는 여전히 0 — coup_conduct만 채워짐(오프셋 보존 확인).
  assert.equal(decoded.object.readUInt32LE(0x48), 0, 'strategy 불변');
});

test('buildNotifyInformationCharacterInner writes compact seat entries for live conn3 delta pushes', () => {
  const inner = buildNotifyInformationCharacterInner({
    characterId: 209,
    gridUnitId: 1,
    seatEntries: [{ character: 209, role: 0 }],
  });
  const { code, payload } = decodeMessage32(inner);
  assert.equal(code, NOTIFY_INFORMATION_CHARACTER_CODE);
  assert.ok(payload.length < NOTIFY_INFORMATION_CHARACTER_BYTES);
  const decoded = decodeNotifyInformationCharacterStream(payload);
  assert.ok(decoded);
  assert.equal(decoded.trailing, 0);
  const object = decoded.object;
  assert.equal(object.readUInt8(0x00), 1);
  assert.equal(object.readUInt32LE(0x04), 209);
  assert.equal(object.readUInt32LE(0x24), 1);
  assert.equal(object.readUInt32LE(0x28), 1);
  assert.equal(object.readUInt8(0x250), 1);
  assert.equal(object.readUInt16LE(0x254), 209);
  assert.equal(object.readUInt32LE(0x258), 0);
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

test('processPersonnel RankUp: a promotion preserves the held peerage title (작위명) in the 0x356 delta', () => {
  const state = createPersonnelState();
  // title=1 = 공작 (ladder rank, logh7-imperial-titles.mjs). setTitle de-orphans imperial-titles into
  // the personnel broadcast path: the promotion delta must re-emit the titlename, not clear it.
  state.addCharacter({ id: 202, rank: 5, owner: 1, title: 1 });
  assert.equal(state.getCharacter(202).title, 1);
  const body = Buffer.alloc(0x24);
  body.writeUInt8(8, 0x10); // target_rank
  body.writeUInt32LE(0x12, 0x18); // move_spot
  body.writeUInt8(1, 0x1c); // move_character_size
  body.writeUInt32LE(202, 0x20); // move_character[0]
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_UP_CODE, inner: rawInner(COMMAND_RANK_UP_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getCharacter(202).rank, 8);
  const object = decodeNotifyCharacterObject(r.notifies[0].inner);
  assert.equal(object.readUInt16LE(0x85 + 0x55), 8); // new rank
  assert.equal(object.readUInt8(0x85 + 0x57), 2); // titlename length = 공작 (2 units), NOT cleared
  assert.equal(object.readUInt16LE(0x85 + 0x59), '공'.charCodeAt(0));
});

test('createPersonnelState setTitle: grants/clears the peerage title on a roster character', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 303, rank: 5, owner: 1 });
  assert.equal(state.getCharacter(303).title, null); // untitled by default
  assert.equal(state.setTitle(303, 3).title, 3); // 백작
  assert.equal(state.getCharacter(303).title, 3);
  assert.equal(state.setTitle(303, null).title, null); // revoke
  assert.equal(state.setTitle(404, 1), null); // unknown char
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
  assert.equal(decodeNotifyCharacterObject(r.notifies[0].inner).readUInt32LE(0x04), 700);
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
  assert.equal(decodeNotifyCharacterObject(r.notifies[0].inner).readUInt32LE(0x04), 500);
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

test('processPersonnel RankUp: 정원캡(§B5 4.4) — 실 진영 목표계급 정원이 차면 rank-full reject', () => {
  const state = createPersonnelState();
  // 元帥(14) 정원 = 제국 5. 이미 제국 元帥 5명 + 진급 대상 1명(현재 大将13).
  for (let i = 0; i < 5; i += 1) state.addCharacter({ id: 500 + i, rank: 14, owner: 1, faction: 'empire' });
  state.addCharacter({ id: 600, rank: 13, owner: 1, faction: 'empire' });
  const body = Buffer.alloc(0x24);
  body.writeUInt8(14, 0x10); // target_rank = 元帥
  body.writeUInt8(1, 0x1c);
  body.writeUInt32LE(600, 0x20); // 진급 대상
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_UP_CODE, inner: rawInner(COMMAND_RANK_UP_CODE, body) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'rank-full', '元帥 정원 5 찼으면 6번째 진급 거부');
  assert.equal(state.getCharacter(600).rank, 13, '진급 미적용');
});

test('processPersonnel RankUp: 정원 미달이면 진급 허용 / 중립·미지정 진영은 캡 없음', () => {
  const state = createPersonnelState();
  // 제국 元帥 4명 → 5번째 진급 허용.
  for (let i = 0; i < 4; i += 1) state.addCharacter({ id: 700 + i, rank: 14, owner: 1, faction: 'empire' });
  state.addCharacter({ id: 800, rank: 13, owner: 1, faction: 'empire' });
  const body = Buffer.alloc(0x24);
  body.writeUInt8(14, 0x10);
  body.writeUInt8(1, 0x1c);
  body.writeUInt32LE(800, 0x20);
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_UP_CODE, inner: rawInner(COMMAND_RANK_UP_CODE, body) });
  assert.equal(r.accept, true, '5번째는 정원 내 → 허용');
  assert.equal(state.getCharacter(800).rank, 14);

  // 진영 미지정(faction null) 캐릭터는 정원캡 무관(중립은 사다리 정원에 안 들어감).
  const s2 = createPersonnelState();
  for (let i = 0; i < 9; i += 1) s2.addCharacter({ id: 900 + i, rank: 14, owner: 1 }); // faction 없음
  s2.addCharacter({ id: 999, rank: 13, owner: 1 });
  const body2 = Buffer.alloc(0x24);
  body2.writeUInt8(14, 0x10);
  body2.writeUInt8(1, 0x1c);
  body2.writeUInt32LE(999, 0x20);
  const r2 = processPersonnel({ state: s2, connectionId: 1, innerCode: COMMAND_RANK_UP_CODE, inner: rawInner(COMMAND_RANK_UP_CODE, body2) });
  assert.equal(r2.accept, true, '진영 미지정 → 캡 없음');
});

// --- 캐논 §5.6 merit 리셋 + 정원캡/소유권 게이트 + countAtRank null (감사 2026-06-20) ----------------

test('processPersonnel RankUp: 진급 시 功績→0 (캐논 §5.6)', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 101, rank: 5, owner: 1, achievement: 500 });
  const body = Buffer.alloc(0x24);
  body.writeUInt8(8, 0x10); // target_rank (大佐, 무제한)
  body.writeUInt32LE(0x12, 0x18); // move_spot
  body.writeUInt8(1, 0x1c); // move_character_size
  body.writeUInt32LE(101, 0x20); // move_character[0]
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_UP_CODE, inner: rawInner(COMMAND_RANK_UP_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getCharacter(101).achievement, 0);
});

test('processPersonnel RankDown: 강등 시 功績→100 (캐논 §5.6)', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 101, rank: 8, owner: 1, achievement: 0 });
  const body = Buffer.alloc(0x2c);
  body.writeUInt8(5, 0x10); // target_rank
  body.writeUInt32LE(101, 0x14); // target_character
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_DOWN_CODE, inner: rawInner(COMMAND_RANK_DOWN_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getCharacter(101).achievement, 100);
});

test('processPersonnel SpeciallyRankUp: 정원캡 초과 시 rank-full 거부(抜擢도 캡 적용)', () => {
  const state = createPersonnelState();
  for (let i = 0; i < 5; i += 1) state.addCharacter({ id: 200 + i, rank: 14, owner: 1, faction: 'empire' }); // 元帥 정원(5) 채움
  state.addCharacter({ id: 999, rank: 13, owner: 1, faction: 'empire' });
  const body = Buffer.alloc(0x28);
  body.writeUInt32LE(999, 0x10); // target_character
  body.writeUInt8(14, 0x14); // goto_rank 元帥
  body.writeUInt16LE(0, 0x1c); // down_achievement_size 0
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_SPECIALLY_RANK_UP_CODE, inner: rawInner(COMMAND_SPECIALLY_RANK_UP_CODE, body) });
  assert.equal(r.accept, false);
  assert.equal(r.reject, 'rank-full');
});

test('processPersonnel SpeciallyRankUp: 타진영(다른 연결) 펀더 功績은 차감 안 함', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 999, rank: 5, owner: 1, faction: 'empire' });
  state.addCharacter({ id: 11, owner: 1, achievement: 100 }); // 내 펀더
  state.addCharacter({ id: 12, owner: 2, achievement: 100 }); // 적 펀더(다른 연결 소유)
  const body = Buffer.alloc(0x30);
  body.writeUInt32LE(999, 0x10);
  body.writeUInt8(6, 0x14); // goto_rank (무제한)
  body.writeUInt16LE(2, 0x1c); // down_achievement_size 2
  body.writeUInt32LE(11, 0x20); body.writeUInt32LE(50, 0x24);
  body.writeUInt32LE(12, 0x28); body.writeUInt32LE(50, 0x2c);
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_SPECIALLY_RANK_UP_CODE, inner: rawInner(COMMAND_SPECIALLY_RANK_UP_CODE, body) });
  assert.equal(r.accept, true);
  assert.equal(state.getCharacter(11).achievement, 50, '내 펀더 차감');
  assert.equal(state.getCharacter(12).achievement, 100, '적 펀더 미차감');
});

test('countAtRank: excludeId 생략 시 id 0 캐릭터도 카운트(footgun 픽스)', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 0, rank: 14, faction: 'empire' });
  state.addCharacter({ id: 1, rank: 14, faction: 'empire' });
  assert.equal(state.countAtRank(14, 'empire'), 2, 'id 0 포함');
  assert.equal(state.countAtRank(14, 'empire', 0), 1, 'excludeId 0이면 id 0만 제외');
});

test('runMonthlyPromotions: 사다리 #1 진급 + 功績을 목표 사다리 평균으로 (캐논 §5.3, 감사 2026-06-20)', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 1, rank: 5, faction: 'empire', achievement: 90 }); // 大佐 사다리 #1
  state.addCharacter({ id: 2, rank: 5, faction: 'empire', achievement: 30 });
  state.addCharacter({ id: 3, rank: 6, faction: 'empire', achievement: 40 }); // 목표(6) 사다리 평균=40
  const promos = state.runMonthlyPromotions();
  assert.ok(promos.some((p) => p.charId === 1 && p.toRank === 6), '#1 → rank6 진급');
  assert.equal(state.getCharacter(1).rank, 6);
  assert.equal(state.getCharacter(1).achievement, 40, '자동진급자 功績=목표 사다리 평균');
  assert.equal(state.getCharacter(2).rank, 5, '#2는 그대로');
});

// =================================================================================================
// 작위(叙爵) / 봉토(封土授与·封土直轄) GRANT 어댑터 — imperial-titles.mjs 순수모듈을 명령엔진에 라우팅.
// 와이어 오프셋(titlename @0x0356 parentage+0x57, base owner @0x031f elem+0x04)은 RE 확정; opcode는 P3.
// =================================================================================================

test('parseInboundGrantTitle reads new_title u8@0x10, target_character u32@0x14', () => {
  const body = Buffer.alloc(0x18);
  body.writeUInt32LE(0x11223344, 0x00); // time
  body.writeUInt8(3, 0x10); // new_title (백작)
  body.writeUInt32LE(909, 0x14); // target_character
  const p = parseInboundGrantTitle(rawInner(COMMAND_GRANT_TITLE_CODE, body));
  assert.equal(p.time, 0x11223344);
  assert.equal(p.newTitle, 3);
  assert.equal(p.targetCharacter, 909);
  assert.equal(parseInboundGrantTitle(rawInner(COMMAND_GRANT_TITLE_CODE, Buffer.alloc(8))), null);
});

test('parseInboundGrantFief reads target_character u32@0x10, base_id u32@0x14', () => {
  const body = Buffer.alloc(0x18);
  body.writeUInt32LE(700, 0x10); // target_character (lord)
  body.writeUInt32LE(55, 0x14); // base_id
  const p = parseInboundGrantFief(rawInner(COMMAND_GRANT_FIEF_CODE, body));
  assert.equal(p.targetCharacter, 700);
  assert.equal(p.baseId, 55);
  assert.equal(parseInboundGrantFief(rawInner(COMMAND_GRANT_FIEF_CODE, Buffer.alloc(8))), null);
});

/** Build a GrantTitle 0x070c body: new_title u8@0x10, target_character u32@0x14. */
function grantTitleBody(newTitle, targetCharacter) {
  const body = Buffer.alloc(0x18);
  body.writeUInt8(newTitle, 0x10);
  body.writeUInt32LE(targetCharacter, 0x14);
  return body;
}

/** Build a GrantFief/RevokeFief body: target_character u32@0x10, base_id u32@0x14. */
function fiefBody(targetCharacter, baseId) {
  const body = Buffer.alloc(0x18);
  body.writeUInt32LE(targetCharacter, 0x10);
  body.writeUInt32LE(baseId, 0x14);
  return body;
}

test('processPersonnel GrantTitle: sets the title, broadcasts 0x356 carrying the 작위명 (rank preserved)', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 909, rank: 9, owner: 1, faction: 'empire', socialClass: 'noble' });
  const r = processPersonnel({
    state, connectionId: 1, innerCode: COMMAND_GRANT_TITLE_CODE,
    inner: rawInner(COMMAND_GRANT_TITLE_CODE, grantTitleBody(1, 909)), // 1 = 공작
  });
  assert.equal(r.accept, true);
  assert.equal(state.getCharacter(909).title, 1);
  assert.equal(r.notifies.length, 1);
  assert.equal(r.notifies[0].target, 'all');
  const object = decodeNotifyCharacterObject(r.notifies[0].inner);
  // titlename(작위명) length @ base+0x57 (=0xdc), chars @ base+0x59. 공작 = 2 wide chars.
  assert.equal(object.readUInt8(0x85 + 0x57), 2, 'titlename = 공작');
  assert.equal(object.readUInt16LE(0x85 + 0x59), '공'.charCodeAt(0));
  assert.equal(object.readUInt16LE(0x85 + 0x55), 9, 'rank preserved (작위 델타가 계급을 0으로 안 덮음)');
});

test('processPersonnel GrantTitle: rejects a commoner, an alliance char, an unknown title, and a foreign owner', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 1, rank: 5, owner: 1, faction: 'empire', socialClass: 'commoner' });
  state.addCharacter({ id: 2, rank: 5, owner: 1, faction: 'alliance', socialClass: 'noble' });
  state.addCharacter({ id: 3, rank: 5, owner: 2, faction: 'empire', socialClass: 'noble' }); // owned by conn 2
  const commoner = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_GRANT_TITLE_CODE, inner: rawInner(COMMAND_GRANT_TITLE_CODE, grantTitleBody(1, 1)) });
  assert.equal(commoner.accept, false);
  assert.equal(commoner.reject, 'title-gate');
  const alliance = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_GRANT_TITLE_CODE, inner: rawInner(COMMAND_GRANT_TITLE_CODE, grantTitleBody(1, 2)) });
  assert.equal(alliance.accept, false);
  assert.equal(alliance.reject, 'alliance-has-no-title');
  const foreign = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_GRANT_TITLE_CODE, inner: rawInner(COMMAND_GRANT_TITLE_CODE, grantTitleBody(1, 3)) });
  assert.equal(foreign.accept, false);
  assert.equal(foreign.reject, 'not-owner');
});

test('processPersonnel GrantFief: requires Baron+ title + unowned base; sets base owner + lord fiefs + income', () => {
  const state = createPersonnelState();
  // lord holds 백작 (ladder 3, Baron-or-higher → canHoldFief). seed a free fief base with economy.
  state.addCharacter({ id: 700, rank: 11, owner: 1, faction: 'empire', socialClass: 'noble', title: 3 });
  state.addBase({ id: 55, owner: 0, economy: 1000, taxRatePct: 20 });
  const r = processPersonnel({
    state, connectionId: 1, innerCode: COMMAND_GRANT_FIEF_CODE,
    inner: rawInner(COMMAND_GRANT_FIEF_CODE, fiefBody(700, 55)),
  });
  assert.equal(r.accept, true);
  assert.equal(state.getBase(55).owner, 700, 'base owner = lord');
  assert.deepEqual(state.getCharacter(700).fiefs, [55], 'lord gains the fief');
  assert.equal(r.income, 200, 'fiefIncome = economy*taxRate/100 = 1000*20% = 200');
  // notify[0] = 영주 캐릭터 델타(spot_owner@0x20 = lord id). notify[1] = 봉토 base 0x031f.
  assert.equal(r.notifies.length, 2);
  const lordObj = decodeNotifyCharacterObject(r.notifies[0].inner);
  assert.equal(lordObj.readUInt32LE(0x24), 700, 'spot_owner = lord id');
  const { code, body } = decodeBare(r.notifies[1].inner.subarray(4)); // strip message32 [u32 0] prefix
  assert.equal(code, 0x031f, '봉토 base record = ResponseInformationBase');
  // 스트림: count u8 @0, element id u32 @1, field04(owner) u8 @5.
  assert.equal(body.readUInt8(0), 1, '1 base in record');
  assert.equal(body.readUInt32BE(1), 55, 'base id');
  assert.equal(body.readUInt8(5), 700 & 0xff, 'base owner candidate (elem+0x04) = lord id low byte');
});

test('processPersonnel GrantFief: rejects a knight (제국기사, below Baron) and an already-owned base', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 700, rank: 11, owner: 1, faction: 'empire', socialClass: 'noble', title: 6 }); // 제국기사
  state.addBase({ id: 55, owner: 0, economy: 1000 });
  const knight = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_GRANT_FIEF_CODE, inner: rawInner(COMMAND_GRANT_FIEF_CODE, fiefBody(700, 55)) });
  assert.equal(knight.accept, false);
  assert.equal(knight.reject, 'fief-gate');

  state.addCharacter({ id: 701, rank: 11, owner: 1, faction: 'empire', socialClass: 'noble', title: 3 });
  state.setBaseOwner(55, 999); // already someone's fief
  const taken = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_GRANT_FIEF_CODE, inner: rawInner(COMMAND_GRANT_FIEF_CODE, fiefBody(701, 55)) });
  assert.equal(taken.accept, false);
  assert.equal(taken.reject, 'fief-gate', 'base already owned → validateGrantFief rejects');
});

test('processPersonnel RevokeFief: 直轄 환수 clears base owner + removes from lord; rejects non-lord fief', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 700, rank: 11, owner: 1, faction: 'empire', socialClass: 'noble', title: 3 });
  state.addBase({ id: 55, owner: 0, economy: 1000, taxRatePct: 20 });
  // grant first
  processPersonnel({ state, connectionId: 1, innerCode: COMMAND_GRANT_FIEF_CODE, inner: rawInner(COMMAND_GRANT_FIEF_CODE, fiefBody(700, 55)) });
  assert.equal(state.getBase(55).owner, 700);
  // 直轄(revoke) by the lord
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_REVOKE_FIEF_CODE, inner: rawInner(COMMAND_REVOKE_FIEF_CODE, fiefBody(700, 55)) });
  assert.equal(r.accept, true);
  assert.equal(state.getBase(55).owner, 0, '直轄(owner 0)');
  assert.deepEqual(state.getCharacter(700).fiefs, [], 'lord loses the fief');
  assert.equal(r.income, 0, 'no fiefs left → income 0');
  const lordObj = decodeNotifyCharacterObject(r.notifies[0].inner);
  assert.equal(lordObj.readUInt32LE(0x24), 0, 'spot_owner cleared on revoke');

  // revoking a base this lord does not hold → rejected.
  state.addBase({ id: 56, owner: 888 });
  const notMine = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_REVOKE_FIEF_CODE, inner: rawInner(COMMAND_REVOKE_FIEF_CODE, fiefBody(700, 56)) });
  assert.equal(notMine.accept, false);
  assert.equal(notMine.reject, 'not-lords-fief');
});

// --- coup_conduct 생산자 배선(AU-3 / opcode-wiring B-2): processPersonnel가 intelState를 받으면 0x0356
//     스트림의 coup_conduct(@0x4c)를 isCoupConduct로 시드한다. 미배선이면 0(기존 동작 불변). -----------------

test('coup_conduct 배선: intelState 임계 충성 시 RankDown 0x356의 @0x4c=1', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 700, rank: 9, owner: 1 });
  const intelState = createIntelState();
  intelState.addCoupLoyalty(700, COUP_LOYALTY_THRESHOLD); // 임계 도달 → isCoupConduct=1
  const body = Buffer.alloc(0x28);
  body.writeUInt8(3, 0x10); // target_rank
  body.writeUInt32LE(700, 0x14); // target_character
  body.writeUInt32LE(0x55, 0x20); // move_spot
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_DOWN_CODE, inner: rawInner(COMMAND_RANK_DOWN_CODE, body), intelState });
  assert.equal(r.accept, true);
  const obj = decodeNotifyCharacterObject(r.notifies[0].inner);
  assert.equal(obj.readUInt32LE(0x04), 700);
  assert.equal(obj.readUInt32LE(0x4c), 1, '임계 충성 → coup_conduct=1 시드');
});

test('coup_conduct 배선: 임계 미만 충성은 @0x4c=0', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 700, rank: 9, owner: 1 });
  const intelState = createIntelState();
  intelState.addCoupLoyalty(700, COUP_LOYALTY_THRESHOLD - 1); // 임계 미만 → isCoupConduct=0
  const body = Buffer.alloc(0x28);
  body.writeUInt8(3, 0x10);
  body.writeUInt32LE(700, 0x14);
  body.writeUInt32LE(0x55, 0x20);
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_DOWN_CODE, inner: rawInner(COMMAND_RANK_DOWN_CODE, body), intelState });
  assert.equal(decodeNotifyCharacterObject(r.notifies[0].inner).readUInt32LE(0x4c), 0, '임계 미만 → 0');
});

test('coup_conduct 배선: intelState 미지정이면 @0x4c=0(기존 동작 불변)', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 700, rank: 9, owner: 1 });
  const body = Buffer.alloc(0x28);
  body.writeUInt8(3, 0x10);
  body.writeUInt32LE(700, 0x14);
  body.writeUInt32LE(0x55, 0x20);
  // intelState 미전달 — coupConduct=null → 빌더 0 처리.
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_DOWN_CODE, inner: rawInner(COMMAND_RANK_DOWN_CODE, body) });
  assert.equal(decodeNotifyCharacterObject(r.notifies[0].inner).readUInt32LE(0x4c), 0, '미배선 0(불변)');
});

test('coup_conduct 배선: decisiveVictory(완전승리)면 충성 임계여도 @0x4c=0(표시 게이트)', () => {
  const state = createPersonnelState();
  state.addCharacter({ id: 700, rank: 9, owner: 1 });
  const intelState = createIntelState();
  intelState.addCoupLoyalty(700, COUP_LOYALTY_THRESHOLD);
  const body = Buffer.alloc(0x28);
  body.writeUInt8(3, 0x10);
  body.writeUInt32LE(700, 0x14);
  body.writeUInt32LE(0x55, 0x20);
  const r = processPersonnel({ state, connectionId: 1, innerCode: COMMAND_RANK_DOWN_CODE, inner: rawInner(COMMAND_RANK_DOWN_CODE, body), intelState, decisiveVictory: true });
  assert.equal(decodeNotifyCharacterObject(r.notifies[0].inner).readUInt32LE(0x4c), 0, '완전승리 게이트 → 0');
});
