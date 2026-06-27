/**
 * Strategy / outfit (0x09xx) engine tests — parsers (byte offsets), builders (size + fields), the
 * in-memory state factory (plan queue + outfit registry), and the process() accept/notify contract.
 * Pure/synchronous: no live client. Wire facts: docs/logh7-proto-personnel-strategy.md §1/§3.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseInboundMakePlan,
  parseInboundWithdrawalPlan,
  parseInboundAnnouncement,
  parseInboundCreateOutfit,
  parseInboundDeleteOutfit,
  buildNotifyCreateOutfitBeginInner,
  buildNotifyCreateOutfitEndInner,
  buildNotifyDeleteOutfitInner,
  buildNotifyFinishStrategyPlanInner,
  createStrategyState,
  processStrategy,
  creditOperationMerit,
  operationIssueEnabled,
  OPERATION_DURATION_DAYS,
  OPERATION_PURPOSE,
  PLAN_STATUS,
  COMMAND_MAKE_PLAN_CODE,
  COMMAND_WITHDRAWAL_PLAN_CODE,
  COMMAND_ANNOUNCEMENT_CODE,
  COMMAND_CREATE_OUTFIT_CODE,
  COMMAND_DELETE_OUTFIT_CODE,
  COMMAND_MAKE_PLAN_BYTES,
  COMMAND_WITHDRAWAL_PLAN_BYTES,
  COMMAND_ANNOUNCEMENT_BYTES,
  NOTIFY_CREATE_OUTFIT_BEGIN_CODE,
  NOTIFY_CREATE_OUTFIT_BEGIN_BYTES,
  NOTIFY_CREATE_OUTFIT_END_CODE,
  NOTIFY_CREATE_OUTFIT_END_BYTES,
  NOTIFY_DELETE_OUTFIT_CODE,
  NOTIFY_DELETE_OUTFIT_BYTES,
  NOTIFY_FINISH_STRATEGY_PLAN_CODE,
  NOTIFY_FINISH_STRATEGY_PLAN_BYTES,
  MAX_OUTFIT_SHIPS,
  MAX_OUTFIT_TROOPS,
} from '../../src/server/logh7-strategy.mjs';
import { createPersonnelState } from '../../src/server/logh7-personnel.mjs';

// ---- framing helpers ----

/** Build a raw client->server inner: [u16 BE code][LE body]. */
function rawInner(code, body) {
  const head = Buffer.alloc(2);
  head.writeUInt16BE(code & 0xffff, 0);
  return Buffer.concat([head, body]);
}

/** Decode an S->C message32 inner: [u32 BE 0][u16 BE code][LE payload]. */
function decodeNotify(inner) {
  return {
    prefix: inner.readUInt32BE(0),
    code: inner.readUInt16BE(4),
    payload: inner.subarray(6),
  };
}

/** Build a CreateOutfit body: fixed head (0x17) + ships[] + move_troops + troops[] + tail (0x1c). */
function createOutfitBody({
  time = 0, hdr1 = 0, mode = 0, hdr3 = 0, hdr4 = 0, base = 0, kind = 0,
  ships = [], troops = [], tail = null,
} = {}) {
  const headParts = Buffer.alloc(0x17);
  headParts.writeUInt32LE(time >>> 0, 0x00);
  headParts.writeUInt32LE(hdr1 >>> 0, 0x04);
  headParts.writeUInt8(mode & 0xff, 0x08);
  headParts.writeUInt32LE(hdr3 >>> 0, 0x09);
  headParts.writeUInt32LE(hdr4 >>> 0, 0x0d);
  headParts.writeUInt32LE(base >>> 0, 0x11);
  headParts.writeUInt8(kind & 0xff, 0x15);
  headParts.writeUInt8(ships.length & 0xff, 0x16);

  const shipBuf = Buffer.alloc(ships.length * 5);
  ships.forEach((s, i) => {
    const o = i * 5;
    shipBuf.writeUInt16LE(s.kind & 0xffff, o);
    shipBuf.writeUInt8(s.unitNumber & 0xff, o + 2);
    shipBuf.writeInt16LE(s.boatNumber | 0, o + 3);
  });

  const troopCountBuf = Buffer.from([troops.length & 0xff]);
  const troopBuf = Buffer.alloc(troops.length * 5);
  troops.forEach((t, i) => {
    const o = i * 5;
    troopBuf.writeUInt16LE(t.kind & 0xffff, o);
    troopBuf.writeUInt8(t.troopGrade & 0xff, o + 2);
    troopBuf.writeInt16LE(t.unitNumber | 0, o + 3);
  });

  let tailBuf = Buffer.alloc(0);
  if (tail) {
    tailBuf = Buffer.alloc(0x1c);
    tailBuf.writeUInt32LE(tail.maxTroop >>> 0, 0);
    tailBuf.writeUInt32LE(tail.maxCrew >>> 0, 4);
    tailBuf.writeUInt32LE((tail.tailA ?? 0) >>> 0, 8);
    tailBuf.writeUInt8(tail.kind2 ?? 0, 12);
    tailBuf.writeUInt8(tail.power ?? 0, 13);
    tailBuf.writeUInt8(tail.camp ?? 0, 14);
    tailBuf.writeUInt8(tail.index ?? 0, 15);
    tailBuf.writeUInt16LE((tail.achievement ?? 0) & 0xffff, 16);
    const practice = tail.practice ?? [];
    for (let i = 0; i < 10; i += 1) tailBuf.writeUInt8(practice[i] ?? 0, 18 + i);
  }

  return Buffer.concat([headParts, shipBuf, troopCountBuf, troopBuf, tailBuf]);
}

// ============================================================================
// parsers — byte offsets
// ============================================================================

test('parseInboundMakePlan reads time/header/plan dwords (28B, 7 dwords)', () => {
  const body = Buffer.alloc(COMMAND_MAKE_PLAN_BYTES);
  body.writeUInt32LE(0x11111111, 0); // time
  body.writeUInt32LE(0x22222222, 4); // header
  body.writeUInt32LE(0x33333333, 8); // planId
  body.writeUInt32LE(0x44444444, 12); // target
  const p = parseInboundMakePlan(rawInner(COMMAND_MAKE_PLAN_CODE, body));
  assert.equal(p.time, 0x11111111);
  assert.equal(p.header, 0x22222222);
  assert.equal(p.planId, 0x33333333);
  assert.equal(p.target, 0x44444444);
  assert.equal(p.dwords.length, 7);
  assert.deepEqual(p.payload, [0x33333333, 0x44444444, 0, 0, 0]);
});

test('parseInboundMakePlan returns null when body too short', () => {
  assert.equal(parseInboundMakePlan(rawInner(COMMAND_MAKE_PLAN_CODE, Buffer.alloc(8))), null);
});

test('parseInboundWithdrawalPlan reads 6 dwords (24B), planId @8', () => {
  const body = Buffer.alloc(COMMAND_WITHDRAWAL_PLAN_BYTES);
  body.writeUInt32LE(7, 0);
  body.writeUInt32LE(9, 4);
  body.writeUInt32LE(0xabcd, 8);
  const p = parseInboundWithdrawalPlan(rawInner(COMMAND_WITHDRAWAL_PLAN_CODE, body));
  assert.equal(p.time, 7);
  assert.equal(p.header, 9);
  assert.equal(p.planId, 0xabcd);
  assert.equal(p.dwords.length, 6);
  assert.equal(parseInboundWithdrawalPlan(rawInner(COMMAND_WITHDRAWAL_PLAN_CODE, Buffer.alloc(20))), null);
});

test('parseInboundAnnouncement reads 10 dwords (40B), target @8 / message @12', () => {
  const body = Buffer.alloc(COMMAND_ANNOUNCEMENT_BYTES);
  body.writeUInt32LE(1, 0);
  body.writeUInt32LE(2, 4);
  body.writeUInt32LE(0x55, 8); // target
  body.writeUInt32LE(0x66, 12); // message
  const p = parseInboundAnnouncement(rawInner(COMMAND_ANNOUNCEMENT_CODE, body));
  assert.equal(p.target, 0x55);
  assert.equal(p.message, 0x66);
  assert.equal(p.dwords.length, 10);
  assert.equal(parseInboundAnnouncement(rawInner(COMMAND_ANNOUNCEMENT_CODE, Buffer.alloc(36))), null);
});

test('parseInboundCreateOutfit reads fixed head offsets (mode@0x08, base@0x11, kind@0x15)', () => {
  const body = createOutfitBody({ time: 0xdead, mode: 3, base: 0x500, kind: 7 });
  const p = parseInboundCreateOutfit(rawInner(COMMAND_CREATE_OUTFIT_CODE, body));
  assert.equal(p.time, 0xdead);
  assert.equal(p.mode, 3);
  assert.equal(p.base, 0x500);
  assert.equal(p.kind, 7);
  assert.equal(p.shipCount, 0);
  assert.equal(p.troopCount, 0);
});

test('parseInboundCreateOutfit reads ships[] stride 5 with SIGNED boat_number', () => {
  const ships = [
    { kind: 0x1234, unitNumber: 4, boatNumber: 10 },
    { kind: 0x0042, unitNumber: 1, boatNumber: -5 }, // negative -> i16 signed
  ];
  const body = createOutfitBody({ base: 9, ships });
  const p = parseInboundCreateOutfit(rawInner(COMMAND_CREATE_OUTFIT_CODE, body));
  assert.equal(p.shipCount, 2);
  assert.deepEqual(p.ships[0], { kind: 0x1234, unitNumber: 4, boatNumber: 10 });
  assert.deepEqual(p.ships[1], { kind: 0x0042, unitNumber: 1, boatNumber: -5 });
});

test('parseInboundCreateOutfit reads troops[] after ships, with SIGNED unit_number', () => {
  const ships = [{ kind: 1, unitNumber: 1, boatNumber: 1 }];
  const troops = [
    { kind: 0x07, troopGrade: 2, unitNumber: 3 },
    { kind: 0x08, troopGrade: 5, unitNumber: -1 },
  ];
  const body = createOutfitBody({ ships, troops });
  const p = parseInboundCreateOutfit(rawInner(COMMAND_CREATE_OUTFIT_CODE, body));
  assert.equal(p.shipCount, 1);
  assert.equal(p.troopCount, 2);
  assert.deepEqual(p.troops[0], { kind: 7, troopGrade: 2, unitNumber: 3 });
  assert.deepEqual(p.troops[1], { kind: 8, troopGrade: 5, unitNumber: -1 });
});

test('parseInboundCreateOutfit reads the tail block (max_troop/max_crew/power/camp/achievement/practice)', () => {
  const tail = {
    maxTroop: 1000, maxCrew: 2500, tailA: 0, kind2: 1, power: 4, camp: 2, index: 9,
    achievement: 0x0123, practice: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  };
  const body = createOutfitBody({ ships: [{ kind: 1, unitNumber: 1, boatNumber: 1 }], troops: [], tail });
  const p = parseInboundCreateOutfit(rawInner(COMMAND_CREATE_OUTFIT_CODE, body));
  assert.equal(p.maxTroop, 1000);
  assert.equal(p.maxCrew, 2500);
  assert.equal(p.power, 4);
  assert.equal(p.camp, 2);
  assert.equal(p.index, 9);
  assert.equal(p.achievement, 0x0123);
  assert.equal(p.practice.warp, 1);
  assert.equal(p.practice.airbattle, 10);
});

test('parseInboundCreateOutfit clamps ship/troop counts to caps and returns null when too short', () => {
  // over-cap ship count: head says 250 ships but body only has the head -> clamp + no overrun
  const body = Buffer.alloc(0x17);
  body.writeUInt8(250, 0x16);
  const p = parseInboundCreateOutfit(rawInner(COMMAND_CREATE_OUTFIT_CODE, body));
  assert.ok(p.shipCount <= MAX_OUTFIT_SHIPS);
  assert.equal(p.shipCount, 0); // no ship bytes present -> parse loop breaks
  assert.equal(parseInboundCreateOutfit(rawInner(COMMAND_CREATE_OUTFIT_CODE, Buffer.alloc(8))), null);
  assert.ok(MAX_OUTFIT_TROOPS === 24);
});

test('parseInboundDeleteOutfit reads header + first outfit id @8', () => {
  const body = Buffer.alloc(16);
  body.writeUInt32LE(0x10, 0);
  body.writeUInt32LE(0x20, 4);
  body.writeUInt32LE(0x4242, 8);
  const p = parseInboundDeleteOutfit(rawInner(COMMAND_DELETE_OUTFIT_CODE, body));
  assert.equal(p.outfitId, 0x4242);
  assert.equal(parseInboundDeleteOutfit(rawInner(COMMAND_DELETE_OUTFIT_CODE, Buffer.alloc(8))), null);
});

// ============================================================================
// builders — size + fields (S->C message32)
// ============================================================================

test('buildNotifyCreateOutfitBeginInner: code 0x904, 4B payload, body[0]=outfitId', () => {
  const inner = buildNotifyCreateOutfitBeginInner({ outfitId: 0x1234 });
  const n = decodeNotify(inner);
  assert.equal(n.code, NOTIFY_CREATE_OUTFIT_BEGIN_CODE);
  assert.equal(n.payload.length, NOTIFY_CREATE_OUTFIT_BEGIN_BYTES);
  assert.equal(n.payload.readUInt32LE(0), 0x1234);
});

test('buildNotifyCreateOutfitEndInner: code 0x905, 140B payload, body[0]=outfitId', () => {
  const inner = buildNotifyCreateOutfitEndInner({ outfitId: 0x99 });
  const n = decodeNotify(inner);
  assert.equal(n.code, NOTIFY_CREATE_OUTFIT_END_CODE);
  assert.equal(n.payload.length, NOTIFY_CREATE_OUTFIT_END_BYTES);
  assert.equal(n.payload.readUInt32LE(0), 0x99);
});

test('buildNotifyDeleteOutfitInner: code 0x907, 12B payload, body[0]=outfitId', () => {
  const inner = buildNotifyDeleteOutfitInner({ outfitId: 0x77, field1: 1, field2: 2 });
  const n = decodeNotify(inner);
  assert.equal(n.code, NOTIFY_DELETE_OUTFIT_CODE);
  assert.equal(n.payload.length, NOTIFY_DELETE_OUTFIT_BYTES);
  assert.equal(n.payload.readUInt32LE(0), 0x77);
  assert.equal(n.payload.readUInt32LE(4), 1);
  assert.equal(n.payload.readUInt32LE(8), 2);
});

test('buildNotifyFinishStrategyPlanInner: code 0x908, 16B payload, plan/result/extra', () => {
  const inner = buildNotifyFinishStrategyPlanInner({ planId: 5, result: 1, extra: 9 });
  const n = decodeNotify(inner);
  assert.equal(n.code, NOTIFY_FINISH_STRATEGY_PLAN_CODE);
  assert.equal(n.payload.length, NOTIFY_FINISH_STRATEGY_PLAN_BYTES);
  assert.equal(n.payload.readUInt32LE(0), 5);
  assert.equal(n.payload.readUInt32LE(4), 1);
  assert.equal(n.payload.readUInt32LE(8), 9);
});

// ============================================================================
// state factory — plan queue + outfit registry
// ============================================================================

test('createStrategyState: outfit registry create/alloc/delete', () => {
  const state = createStrategyState({ nextOutfitId: 0x2000 });
  const o1 = state.createOutfit({ base: 1, power: 4 });
  const o2 = state.createOutfit({ base: 2, power: 4 });
  assert.equal(o1.id, 0x2000);
  assert.equal(o2.id, 0x2001);
  assert.equal(state.outfits.size, 2);
  assert.equal(state.deleteOutfit(0x2000), true);
  assert.equal(state.deleteOutfit(0x2000), false);
  assert.equal(state.outfits.size, 1);
});

test('createStrategyState: plan queue enqueue/withdraw per faction', () => {
  const state = createStrategyState();
  state.enqueuePlan(4, { planId: 10, target: 1 });
  state.enqueuePlan(4, { planId: 11, target: 2 });
  state.enqueuePlan(2, { planId: 10, target: 5 }); // different faction, same planId
  assert.equal(state.planCount(), 3);
  const removed = state.withdrawPlan(4, 10);
  assert.equal(removed.planId, 10);
  assert.equal(state.planCount(), 2);
  assert.equal(state.withdrawPlan(4, 999), null); // no such plan
  assert.equal(state.plans.get(2).length, 1); // other faction untouched
});

// ============================================================================
// process() — accept/reject + notify contract
// ============================================================================

test('processStrategy MakePlan (0x900): enqueues + broadcasts NotifyFinishStrategyPlan to all', () => {
  const state = createStrategyState();
  const body = Buffer.alloc(COMMAND_MAKE_PLAN_BYTES);
  body.writeUInt32LE(42, 8); // planId
  body.writeUInt32LE(7, 12); // target
  const res = processStrategy({ state, connectionId: 1, innerCode: COMMAND_MAKE_PLAN_CODE, inner: rawInner(COMMAND_MAKE_PLAN_CODE, body), power: 4 });
  assert.equal(res.accept, true);
  assert.equal(res.planId, 42);
  assert.equal(state.planCount(), 1);
  assert.equal(res.notifies.length, 1);
  assert.equal(res.notifies[0].target, 'all');
  const n = decodeNotify(res.notifies[0].inner);
  assert.equal(n.code, NOTIFY_FINISH_STRATEGY_PLAN_CODE);
  assert.equal(n.payload.readUInt32LE(0), 42);
});

test('processStrategy MakePlan rejects a too-short body', () => {
  const state = createStrategyState();
  const res = processStrategy({ state, innerCode: COMMAND_MAKE_PLAN_CODE, inner: rawInner(COMMAND_MAKE_PLAN_CODE, Buffer.alloc(4)) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'invalid-make-plan');
  assert.equal(res.notifies.length, 0);
});

test('processStrategy WithdrawalPlan (0x901): dequeues a queued plan + broadcasts result=1', () => {
  const state = createStrategyState();
  state.enqueuePlan(4, { planId: 88, target: 1 });
  const body = Buffer.alloc(COMMAND_WITHDRAWAL_PLAN_BYTES);
  body.writeUInt32LE(88, 8); // planId to withdraw
  const res = processStrategy({ state, innerCode: COMMAND_WITHDRAWAL_PLAN_CODE, inner: rawInner(COMMAND_WITHDRAWAL_PLAN_CODE, body), power: 4 });
  assert.equal(res.accept, true);
  assert.equal(state.planCount(), 0);
  const n = decodeNotify(res.notifies[0].inner);
  assert.equal(n.payload.readUInt32LE(0), 88);
  assert.equal(n.payload.readUInt32LE(4), 1); // result = cancelled
});

test('processStrategy WithdrawalPlan rejects when the plan is not queued', () => {
  const state = createStrategyState();
  const body = Buffer.alloc(COMMAND_WITHDRAWAL_PLAN_BYTES);
  body.writeUInt32LE(123, 8);
  const res = processStrategy({ state, innerCode: COMMAND_WITHDRAWAL_PLAN_CODE, inner: rawInner(COMMAND_WITHDRAWAL_PLAN_CODE, body), power: 4 });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'no-such-plan');
});

test('processStrategy Announcement (0x902): accepts + broadcasts to all', () => {
  const state = createStrategyState();
  const body = Buffer.alloc(COMMAND_ANNOUNCEMENT_BYTES);
  body.writeUInt32LE(0x30, 8); // target
  body.writeUInt32LE(0x40, 12); // message
  const res = processStrategy({ state, innerCode: COMMAND_ANNOUNCEMENT_CODE, inner: rawInner(COMMAND_ANNOUNCEMENT_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(res.notifies[0].target, 'all');
  const n = decodeNotify(res.notifies[0].inner);
  assert.equal(n.code, NOTIFY_FINISH_STRATEGY_PLAN_CODE);
  assert.equal(n.payload.readUInt32LE(0), 0x30); // planId = target
  assert.equal(n.payload.readUInt32LE(8), 0x40); // extra = message
});

test('processStrategy CreateOutfit (0x903): registers outfit + emits Begin(0x904) then End(0x905)', () => {
  const state = createStrategyState({ nextOutfitId: 0x3000 });
  const body = createOutfitBody({
    base: 0x500, mode: 1,
    ships: [{ kind: 0x10, unitNumber: 2, boatNumber: 3 }],
    troops: [{ kind: 0x20, troopGrade: 1, unitNumber: -2 }],
    tail: { maxTroop: 10, maxCrew: 20, power: 4, camp: 2, index: 1, achievement: 5, practice: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  });
  const res = processStrategy({ state, connectionId: 9, innerCode: COMMAND_CREATE_OUTFIT_CODE, inner: rawInner(COMMAND_CREATE_OUTFIT_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(res.outfitId, 0x3000);
  assert.equal(state.outfits.size, 1);
  const stored = state.outfits.get(0x3000);
  assert.equal(stored.base, 0x500);
  assert.equal(stored.power, 4);
  assert.equal(stored.ships.length, 1);
  assert.equal(stored.troops.length, 1);
  assert.equal(res.notifies.length, 2);
  assert.equal(decodeNotify(res.notifies[0].inner).code, NOTIFY_CREATE_OUTFIT_BEGIN_CODE);
  assert.equal(decodeNotify(res.notifies[1].inner).code, NOTIFY_CREATE_OUTFIT_END_CODE);
  assert.equal(decodeNotify(res.notifies[0].inner).payload.readUInt32LE(0), 0x3000);
  assert.equal(decodeNotify(res.notifies[1].inner).payload.readUInt32LE(0), 0x3000);
  assert.equal(res.notifies[0].target, 'all');
});

test('processStrategy DeleteOutfit (0x906): disbands a known outfit + broadcasts NotifyDeleteOutfit', () => {
  const state = createStrategyState({ nextOutfitId: 0x4000 });
  const o = state.createOutfit({ base: 1 });
  const body = Buffer.alloc(16);
  body.writeUInt32LE(o.id, 8);
  const res = processStrategy({ state, innerCode: COMMAND_DELETE_OUTFIT_CODE, inner: rawInner(COMMAND_DELETE_OUTFIT_CODE, body) });
  assert.equal(res.accept, true);
  assert.equal(res.outfitId, o.id);
  assert.equal(state.outfits.size, 0);
  const n = decodeNotify(res.notifies[0].inner);
  assert.equal(n.code, NOTIFY_DELETE_OUTFIT_CODE);
  assert.equal(n.payload.readUInt32LE(0), o.id);
});

test('processStrategy DeleteOutfit rejects an unknown outfit id', () => {
  const state = createStrategyState();
  const body = Buffer.alloc(16);
  body.writeUInt32LE(0xbeef, 8);
  const res = processStrategy({ state, innerCode: COMMAND_DELETE_OUTFIT_CODE, inner: rawInner(COMMAND_DELETE_OUTFIT_CODE, body) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'no-such-outfit');
});

test('processStrategy rejects an unknown command code', () => {
  const state = createStrategyState();
  const res = processStrategy({ state, innerCode: 0x09ff, inner: rawInner(0x09ff, Buffer.alloc(40)) });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'unknown-strategy-command');
  assert.equal(res.notifies.length, 0);
});

// ============================================================================
// 작전계획(作戦計画) 입안/검증 파이프라인 배선 — MakePlan(0x0900) draft→validate 게이트 + 30일 lifecycle.
// 입안/검증/만료까지만; 발령(発令)은 P3 게이트(LOGH_OPERATION_ISSUE, 기본 OFF).
// ============================================================================

/** MakePlan 28B 바디(planId@8, target@12) 헬퍼. */
function makePlanBody(planId, target) {
  const body = Buffer.alloc(COMMAND_MAKE_PLAN_BYTES);
  body.writeUInt32LE(planId >>> 0, 8);
  body.writeUInt32LE(target >>> 0, 12);
  return body;
}

test('발령 게이트(operationIssueEnabled): 기본 OFF (LOGH_OPERATION_ISSUE 미설정)', () => {
  const saved = process.env.LOGH_OPERATION_ISSUE;
  delete process.env.LOGH_OPERATION_ISSUE;
  try {
    assert.equal(operationIssueEnabled(), false);
    process.env.LOGH_OPERATION_ISSUE = '0';
    assert.equal(operationIssueEnabled(), false);
    process.env.LOGH_OPERATION_ISSUE = '1';
    assert.equal(operationIssueEnabled(), true);
  } finally {
    if (saved === undefined) delete process.env.LOGH_OPERATION_ISSUE;
    else process.env.LOGH_OPERATION_ISSUE = saved;
  }
});

test('MakePlan: operationCtx 미주입 → 레거시 동작 보존(검증 게이트 통과, 큐잉)', () => {
  const state = createStrategyState();
  const res = processStrategy({
    state, connectionId: 1, innerCode: COMMAND_MAKE_PLAN_CODE,
    inner: rawInner(COMMAND_MAKE_PLAN_CODE, makePlanBody(42, 7)), power: 4,
  });
  assert.equal(res.accept, true);
  assert.equal(state.planCount(), 1, '레거시 큐잉 보존');
});

test('MakePlan: validTargets 집합 밖 타깃 → invalid-operation-plan 거부(enqueue 안 함)', () => {
  const state = createStrategyState();
  const res = processStrategy({
    state, connectionId: 1, innerCode: COMMAND_MAKE_PLAN_CODE,
    inner: rawInner(COMMAND_MAKE_PLAN_CODE, makePlanBody(50, 99)), power: 4,
    operationCtx: { validTargets: new Set([1, 2, 3]) },
  });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'invalid-operation-plan');
  assert.ok(res.errors.includes('invalid-target'));
  assert.equal(state.planCount(), 0, '검증 실패 시 enqueue 안 됨');
});

test('MakePlan: 유닛 전역 상한 초과 → over-unit-cap 거부', () => {
  const state = createStrategyState();
  const res = processStrategy({
    state, connectionId: 1, innerCode: COMMAND_MAKE_PLAN_CODE,
    inner: rawInner(COMMAND_MAKE_PLAN_CODE, makePlanBody(60, 1)), power: 4,
    operationCtx: { units: [1, 2, 3], maxUnits: 2 },
  });
  assert.equal(res.accept, false);
  assert.equal(res.reject, 'invalid-operation-plan');
  assert.ok(res.errors.includes('over-unit-cap'));
  assert.equal(state.planCount(), 0);
});

test('MakePlan: 유효 타깃 + 상한 이내 → accept + 큐잉(검증 통과)', () => {
  const state = createStrategyState();
  const res = processStrategy({
    state, connectionId: 1, innerCode: COMMAND_MAKE_PLAN_CODE,
    inner: rawInner(COMMAND_MAKE_PLAN_CODE, makePlanBody(70, 2)), power: 4,
    operationCtx: { validTargets: new Set([1, 2, 3]), units: [10, 11], maxUnits: 5 },
  });
  assert.equal(res.accept, true);
  assert.equal(res.planId, 70);
  assert.equal(state.planCount(), 1);
});

test('작전 store: 발령 게이트 OFF → draft 보관(status=draft, issuedAt=null), 만료 대상 없음', () => {
  const saved = process.env.LOGH_OPERATION_ISSUE;
  delete process.env.LOGH_OPERATION_ISSUE;
  try {
    const state = createStrategyState();
    processStrategy({
      state, connectionId: 1, innerCode: COMMAND_MAKE_PLAN_CODE,
      inner: rawInner(COMMAND_MAKE_PLAN_CODE, makePlanBody(80, 1)), power: 4,
      operationCtx: { units: [1], gameDay: 0 },
    });
    assert.equal(state.operationPlanCount(), 1);
    const entry = state.operationPlans.get(4)[0];
    assert.equal(entry.plan.status, PLAN_STATUS.DRAFT, '게이트 off면 draft 유지');
    assert.equal(entry.issuedAt, null, '발령 안 됨 → issuedAt=null');
    // 게이트 off라 lifecycle tick은 만료시키지 않음(issuedAt=null).
    const expired = state.tickOperationsIfDue({ gameDay: 9999 });
    assert.equal(expired.length, 0);
    assert.equal(state.operationPlanCount(), 1, 'draft는 만료 안 됨');
  } finally {
    if (saved === undefined) delete process.env.LOGH_OPERATION_ISSUE;
    else process.env.LOGH_OPERATION_ISSUE = saved;
  }
});

test('작전 store: 발령 게이트 ON → issued 보관 + 30일 후 자동종료', () => {
  const saved = process.env.LOGH_OPERATION_ISSUE;
  process.env.LOGH_OPERATION_ISSUE = '1';
  try {
    const state = createStrategyState();
    processStrategy({
      state, connectionId: 1, innerCode: COMMAND_MAKE_PLAN_CODE,
      inner: rawInner(COMMAND_MAKE_PLAN_CODE, makePlanBody(90, 1)), power: 4,
      operationCtx: { validTargets: new Set([1]), units: [1], gameDay: 5 },
    });
    assert.equal(state.operationPlanCount(), 1);
    const entry = state.operationPlans.get(4)[0];
    assert.equal(entry.plan.status, PLAN_STATUS.ISSUED, '게이트 on면 issued로 승격');
    assert.equal(entry.issuedAt, 5, 'gameDay에 발령');
    // 발령일+30 직전(34일)엔 만료 안 됨.
    assert.equal(state.tickOperationsIfDue({ gameDay: 5 + OPERATION_DURATION_DAYS - 1 }).length, 0);
    assert.equal(state.operationPlanCount(), 1);
    // 발령일+30(35일)에 자동종료.
    const expired = state.tickOperationsIfDue({ gameDay: 5 + OPERATION_DURATION_DAYS });
    assert.equal(expired.length, 1);
    assert.equal(expired[0].plan.id, 90);
    assert.equal(state.operationPlanCount(), 0, '만료되어 store에서 제거');
  } finally {
    if (saved === undefined) delete process.env.LOGH_OPERATION_ISSUE;
    else process.env.LOGH_OPERATION_ISSUE = saved;
  }
});

test('작전 store: 같은 planId 재보관은 덮어쓰기(중복 방지)', () => {
  const state = createStrategyState();
  state.storeOperationPlan(4, { id: 100, status: PLAN_STATUS.DRAFT }, { issuedAt: null });
  state.storeOperationPlan(4, { id: 100, status: PLAN_STATUS.ISSUED }, { issuedAt: 3 });
  assert.equal(state.operationPlanCount(), 1);
  assert.equal(state.operationPlans.get(4)[0].plan.status, PLAN_STATUS.ISSUED);
  assert.equal(state.operationPlans.get(4)[0].issuedAt, 3);
});

test('기존 plans 큐는 작전 store와 병존(불변)', () => {
  const state = createStrategyState();
  state.enqueuePlan(4, { planId: 1, target: 1 });
  state.storeOperationPlan(4, { id: 1, status: PLAN_STATUS.DRAFT }, { issuedAt: null });
  assert.equal(state.planCount(), 1, '레거시 큐 불변');
  assert.equal(state.operationPlanCount(), 1, '작전 store 별도');
});

test('掃討 격침 누적 → 30일 만료 정산에서 보너스로 환산', () => {
  const state = createStrategyState();
  state.storeOperationPlan(4, { id: 9, target: 1, purpose: OPERATION_PURPOSE.SWEEP }, { issuedAt: 0 });
  // 발령된 掃討 작전에 3건 격침 누적(발령 안 된/非掃討은 무시).
  assert.equal(state.recordSweepKill(4, { count: 1 }), 1);
  state.recordSweepKill(4, { count: 2 });
  // 만료 전에는 유지.
  assert.equal(state.tickOperationsIfDue({ gameDay: 10 }).length, 0);
  // 30일 경과 → 만료 + 결과 정산(掃討 3격침 = 보너스 3).
  const expired = state.tickOperationsIfDue({ gameDay: 0 + OPERATION_DURATION_DAYS });
  assert.equal(expired.length, 1);
  assert.equal(expired[0].evaluation.purpose, OPERATION_PURPOSE.SWEEP);
  assert.equal(expired[0].evaluation.bonusPoints, 3);
});

test('占領 만료 정산: outcomeFor 콜백으로 점령 상태 주입 → Partial', () => {
  const state = createStrategyState();
  state.storeOperationPlan(2, { id: 5, purpose: OPERATION_PURPOSE.OCCUPATION, baseBonus: 100 }, { issuedAt: 0 });
  const expired = state.tickOperationsIfDue({
    gameDay: OPERATION_DURATION_DAYS,
    outcomeFor: () => ({ targetTotal: 3, controlledByActor: 1 }),
  });
  assert.equal(expired[0].evaluation.result, 'partial');
  assert.equal(expired[0].evaluation.bonusPoints, 50);
});

test('recordSweepKill: 발령 안 된 draft 작전은 누적 대상 아님', () => {
  const state = createStrategyState();
  state.storeOperationPlan(2, { id: 7, purpose: OPERATION_PURPOSE.SWEEP }, { issuedAt: null });
  assert.equal(state.recordSweepKill(2, { count: 5 }), 0, 'draft는 누적 0');
});

// ============================================================================
// 작전 결과정산 → 功績(achievement) 적립 배선 오라클 (A5).
// ============================================================================

test('功績 적립: 占領 성공 → 발령 사령관 功績 증가(bonusPoints만큼)', () => {
  const state = createStrategyState();
  const personnel = createPersonnelState();
  personnel.addCharacter({ id: 42, achievement: 100, faction: 'empire' });
  // 발령된 占領 작전(사령관=42, 기본보너스 100).
  state.storeOperationPlan(1, {
    id: 5, target: 'Odin', purpose: OPERATION_PURPOSE.OCCUPATION, baseBonus: 100, commander: 42,
  }, { issuedAt: 0 });
  // 30일 만료 + 全목표 점령(Full=보너스 100).
  const expired = state.tickOperationsIfDue({
    gameDay: OPERATION_DURATION_DAYS,
    outcomeFor: () => ({ targetTotal: 1, controlledByActor: 1 }),
  });
  assert.equal(expired[0].evaluation.result, 'full');
  assert.equal(expired[0].evaluation.bonusPoints, 100);
  const credits = creditOperationMerit(expired, personnel);
  assert.equal(credits.length, 1);
  assert.equal(credits[0].commander, 42);
  assert.equal(credits[0].bonusPoints, 100);
  assert.equal(credits[0].applied, true);
  // ★功績이 100 → 200으로 적립됨.
  assert.equal(personnel.getCharacter(42).achievement, 200, '占領 성공→사령관 功績 +100');
});

test('功績 적립: draft(미발령)는 만료 목록에 없어 적립 제외', () => {
  const state = createStrategyState();
  const personnel = createPersonnelState();
  personnel.addCharacter({ id: 7, achievement: 50, faction: 'empire' });
  // draft(issuedAt=null) → tick에서 만료 안 됨.
  state.storeOperationPlan(1, {
    id: 9, target: 'Odin', purpose: OPERATION_PURPOSE.OCCUPATION, baseBonus: 100, commander: 7,
  }, { issuedAt: null });
  const expired = state.tickOperationsIfDue({
    gameDay: OPERATION_DURATION_DAYS,
    outcomeFor: () => ({ targetTotal: 1, controlledByActor: 1 }),
  });
  assert.equal(expired.length, 0, 'draft는 만료 안 됨');
  const credits = creditOperationMerit(expired, personnel);
  assert.equal(credits.length, 0, '적립 0');
  assert.equal(personnel.getCharacter(7).achievement, 50, 'draft 功績 불변');
});

test('功績 적립: 占領 실패(보너스 0) → 적립 건너뜀', () => {
  const state = createStrategyState();
  const personnel = createPersonnelState();
  personnel.addCharacter({ id: 3, achievement: 80, faction: 'alliance' });
  state.storeOperationPlan(2, {
    id: 1, target: 'Heinessen', purpose: OPERATION_PURPOSE.OCCUPATION, baseBonus: 100, commander: 3,
  }, { issuedAt: 0 });
  // 점령 0곳 → result=none, bonusPoints=0.
  const expired = state.tickOperationsIfDue({
    gameDay: OPERATION_DURATION_DAYS,
    outcomeFor: () => ({ targetTotal: 3, controlledByActor: 0 }),
  });
  assert.equal(expired[0].evaluation.bonusPoints, 0);
  const credits = creditOperationMerit(expired, personnel);
  assert.equal(credits.length, 0, '보너스 0은 적립 제외');
  assert.equal(personnel.getCharacter(3).achievement, 80, '실패 功績 불변');
});

test('功績 적립: commander 미주입(레거시) → 적립 대상 아님(회귀 0)', () => {
  const state = createStrategyState();
  const personnel = createPersonnelState();
  // 掃討 3격침=보너스 3이지만 commander 없음.
  state.storeOperationPlan(1, { id: 2, purpose: OPERATION_PURPOSE.SWEEP }, { issuedAt: 0 });
  state.recordSweepKill(1, { count: 3 });
  const expired = state.tickOperationsIfDue({ gameDay: OPERATION_DURATION_DAYS });
  assert.equal(expired[0].evaluation.bonusPoints, 3);
  const credits = creditOperationMerit(expired, personnel);
  assert.equal(credits.length, 0, 'commander 없으면 적립 안 함');
});

test('功績 적립: 掃討 격침 누적 → 사령관 功績에 적립', () => {
  const state = createStrategyState();
  const personnel = createPersonnelState();
  personnel.addCharacter({ id: 11, achievement: 0, faction: 'empire' });
  state.storeOperationPlan(1, { id: 4, purpose: OPERATION_PURPOSE.SWEEP, commander: 11 }, { issuedAt: 0 });
  state.recordSweepKill(1, { count: 5 });
  const expired = state.tickOperationsIfDue({ gameDay: OPERATION_DURATION_DAYS });
  const credits = creditOperationMerit(expired, personnel);
  assert.equal(credits[0].bonusPoints, 5);
  assert.equal(personnel.getCharacter(11).achievement, 5, '掃討 5격침→功績 +5');
});

test('addAchievement: 비음수 클램프(차감은 0 미만 불가)', () => {
  const personnel = createPersonnelState();
  personnel.addCharacter({ id: 1, achievement: 3 });
  personnel.addAchievement(1, -10);
  assert.equal(personnel.getCharacter(1).achievement, 0, '0 미만으로 안 내려감');
  assert.equal(personnel.addAchievement(999, 5), null, '미상 캐릭터는 null');
});

test('MakePlan: operationCtx.commander 주입 → 발령 작전에 commander 부착', () => {
  const prev = process.env.LOGH_OPERATION_ISSUE;
  process.env.LOGH_OPERATION_ISSUE = '1';
  try {
    const state = createStrategyState();
    const body = Buffer.alloc(COMMAND_MAKE_PLAN_BYTES);
    body.writeUInt32LE(0, 0); // time
    body.writeUInt32LE(0, 4); // header
    body.writeUInt32LE(77, 8); // planId
    body.writeUInt32LE(1, 12); // target
    const inner = rawInner(COMMAND_MAKE_PLAN_CODE, body);
    const res = processStrategy({
      state, connectionId: 1, innerCode: COMMAND_MAKE_PLAN_CODE, inner, power: 1,
      operationCtx: { purpose: OPERATION_PURPOSE.OCCUPATION, baseBonus: 50, commander: 42, gameDay: 0 },
    });
    assert.equal(res.accept, true);
    const list = state.operationPlans.get(1);
    assert.equal(list[0].plan.commander, 42, '발령 작전에 commander=42 부착');
    assert.equal(list[0].issuedAt, 0, '발령됨');
  } finally {
    if (prev === undefined) delete process.env.LOGH_OPERATION_ISSUE;
    else process.env.LOGH_OPERATION_ISSUE = prev;
  }
});
