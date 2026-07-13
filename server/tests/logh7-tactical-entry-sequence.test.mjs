import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESPONSE_NOTIFY_TACTICS_CODE,
  RESPONSE_TACTICS_UNIT_SHIP_CODE,
  NOTIFY_TACTICS_BODY_BYTES,
  UNIT_SHIP_RECORD_BYTES,
  buildNotifyTacticsInner,
} from '../src/server/codec/tactical-position-records.mjs';
import { buildTacticalEntrySequenceInners } from '../src/server/codec/tactical-entry-sequence.mjs';
import { createWorldSession } from '../src/server/logh7-world-session.mjs';
import {
  CODE_INFO_UNIT,
  CODE_INFO_CHARACTER,
  CODE_INFO_UNIT_WIRE_HEADER,
} from '../src/server/logh7-world-records.mjs';

function codeOf(inner) {
  assert.equal(inner.readUInt32LE(0), 0, 'message32 LE prefix');
  return inner.readUInt16BE(4);
}

// 0x0325 wire(cursor-packed BE)에서 유닛 id 목록만 디코드한다(회귀가드 cross-match용).
function decodeUnitIds(inner) {
  const body = inner.subarray(6);
  const count = body.readUInt16BE(0);
  const ids = [];
  let cursor = CODE_INFO_UNIT_WIRE_HEADER;
  for (let i = 0; i < count; i += 1) {
    ids.push(body.readUInt32BE(cursor)); cursor += 4; // id
    cursor += 2; // faction
    cursor += 1; // native +0x06
    cursor += 4; // commander
    cursor += 4; // cell
    cursor += 4; // owner
    const boatsCount = body.readUInt8(cursor); cursor += 1;
    cursor += boatsCount * 4; // boats[]
    cursor += 4; // spotResolverBase
    cursor += 2; // +0x44/+0x45
    cursor += 2; // +0x46
    cursor += 2; // mapSection
    cursor += 4; // +0x4c
    cursor += 4; // +0x50
    cursor += 4; // +0x54
  }
  return ids;
}

// 0x033b wire(count u16 BE @0, 레코드 @+4 stride 52, id u32 BE @+0)에서 유닛 id 목록.
function decodeTacticsShipIds(inner) {
  const body = inner.subarray(6);
  const count = body.readUInt16BE(0);
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(body.readUInt32BE(4 + i * UNIT_SHIP_RECORD_BYTES));
  }
  return ids;
}

// 완료기준 1: 0x0f1f arm = 8B body, code BE@+4==0x0f1f, arg0로 payload[0] 결정.
test('0x0f1f arm inner: 8B body, code BE@+4, arg0=1이면 payload[0]==0x01', () => {
  const armOn = buildNotifyTacticsInner({ arg0: 1 });
  assert.equal(armOn.readUInt16BE(4), RESPONSE_NOTIFY_TACTICS_CODE, 'code BE@+4 == 0x0f1f');
  const bodyOn = armOn.subarray(6);
  assert.equal(bodyOn.length, NOTIFY_TACTICS_BODY_BYTES, '8B body');
  assert.equal(bodyOn.length, 8, '정확히 8바이트');
  assert.equal(bodyOn.readUInt8(0), 0x01, 'arg0=1 → payload[0]==0x01');

  const armOff = buildNotifyTacticsInner({ arg0: 0 });
  const bodyOff = armOff.subarray(6);
  assert.equal(bodyOff.readUInt8(0), 0x00, 'arg0=0 → payload[0]==0x00');
  assert.equal(bodyOff.length, 8, 'arg0=0도 8바이트');
});

// 완료기준 2: 시퀀스 순서 = 로스터(0x0325→0x0323) → 0x033b → 말미 0x0f1f.
test('전술 진입 시퀀스 순서: 0x0325 → 0x0323 → 0x033b → 말미 0x0f1f', () => {
  const inners = buildTacticalEntrySequenceInners({
    units: [
      { id: 0x1001, character: 1, faction: 2, cell: 2588 },
      { id: 0x1002, character: 0, faction: 2, cell: 2589 },
    ],
  });
  const codes = inners.map(codeOf);
  assert.equal(codes[0], CODE_INFO_UNIT, '첫 메시지 = 0x0325');
  // character>0 인 유닛(1개)만 0x0323 방출
  assert.equal(codes[1], CODE_INFO_CHARACTER, '두 번째 = 0x0323');
  assert.equal(codes[2], RESPONSE_TACTICS_UNIT_SHIP_CODE, '세 번째 = 0x033b');
  assert.equal(codes[codes.length - 1], RESPONSE_NOTIFY_TACTICS_CODE, '말미 = 0x0f1f');
  // 0x033b 가 0x0325 뒤, 0x0f1f 앞
  assert.ok(codes.indexOf(CODE_INFO_UNIT) < codes.indexOf(RESPONSE_TACTICS_UNIT_SHIP_CODE));
  assert.ok(codes.indexOf(RESPONSE_TACTICS_UNIT_SHIP_CODE) < codes.indexOf(RESPONSE_NOTIFY_TACTICS_CODE));
});

// 완료기준 3: 0x033b 레코드당 52B + 각 unitId가 동반 0x0325 unitId와 일치(스킵방지 회귀가드).
test('0x033b 레코드 52B, unitId가 동반 0x0325 unitId와 일치', () => {
  const units = [
    { id: 0x1001, character: 1 },
    { id: 0x1002, character: 0 },
    { id: 0x2003, character: 0 },
  ];
  const inners = buildTacticalEntrySequenceInners({ units });
  const unitMsg = inners.find((m) => codeOf(m) === CODE_INFO_UNIT);
  const tacticsMsg = inners.find((m) => codeOf(m) === RESPONSE_TACTICS_UNIT_SHIP_CODE);

  assert.equal(UNIT_SHIP_RECORD_BYTES, 52, '0x033b 레코드 stride == 52B');
  const unitIds = decodeUnitIds(unitMsg);
  const shipIds = decodeTacticsShipIds(tacticsMsg);
  assert.deepEqual(shipIds, unitIds, '0x033b unitId == 0x0325 unitId (순서·값)');
  assert.deepEqual(shipIds, units.map((u) => u.id), '로스터 id 그대로');
});

// 완료기준 4: off-default 불변 — 게이트 미설정 시 world-enter 응답에 전술 inner 0건.
test('off-default: 게이트 미설정 시 world-enter 에 전술 inner(0x033b/0x0f1f) 0건', () => {
  const world = createWorldSession(); // tacticalEntry 기본 off
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, inWorld: false });
  const { emits } = world.enterWorld({ connectionId: 1 });
  const codes = emits.map(codeOf);
  assert.equal(codes.filter((c) => c === RESPONSE_TACTICS_UNIT_SHIP_CODE).length, 0, '0x033b 0건');
  assert.equal(codes.filter((c) => c === RESPONSE_NOTIFY_TACTICS_CODE).length, 0, '0x0f1f 0건');
});

test('게이트 on: world-enter 말미에 0x033b + 0x0f1f(arm) 방출', () => {
  const world = createWorldSession({ tacticalEntry: true });
  world.seedPlayer({ connectionId: 1, characterId: 5, unitId: 8, cell: 2588, inWorld: false });
  const { emits } = world.enterWorld({ connectionId: 1 });
  const codes = emits.map(codeOf);
  assert.ok(codes.includes(RESPONSE_TACTICS_UNIT_SHIP_CODE), '0x033b 방출');
  assert.equal(codes[codes.length - 1], RESPONSE_NOTIFY_TACTICS_CODE, '말미 0x0f1f arm');
  // 0x0f1f arm=1 확인
  const arm = emits[emits.length - 1];
  assert.equal(arm.subarray(6).readUInt8(0), 0x01, 'arm payload[0]==1');
});

test('id=0 유닛은 스킵방지 가드로 거부', () => {
  assert.throws(
    () => buildTacticalEntrySequenceInners({ units: [{ id: 0, character: 1 }] }),
    /positive id/,
  );
});
