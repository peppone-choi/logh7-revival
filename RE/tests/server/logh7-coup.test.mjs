// logh7-coup: 쿠데타 라이프사이클(叛意/謀議/説得/参加/叛乱/査閲) 상태머신 + 캐논 게이트 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCoupState,
  inspectChance,
  COUP_MIN_REBEL_UNITS,
} from '../../src/server/logh7-coup.mjs';
import { createIntelState, COUP_LOYALTY_THRESHOLD } from '../../src/server/logh7-intel.mjs';

test('叛意 declareRingleader: 모의 생성(수괴 1인 멤버) + 멱등', () => {
  const s = createCoupState();
  const { conspiracy, created } = s.declareRingleader(101, 1);
  assert.equal(created, true);
  assert.equal(conspiracy.mastermindId, 101);
  assert.equal(conspiracy.faction, 1);
  assert.ok(conspiracy.members.has(101), '수괴가 멤버');
  assert.equal(s.activeCount(), 1);
  // 멱등: 다시 선언해도 새로 안 만듦.
  const again = s.declareRingleader(101, 1);
  assert.equal(again.created, false);
  assert.equal(s.activeCount(), 1);
});

test('謀議 recruit: roll<chance면 포섭, 이미멤버/미존재/발동 거부', () => {
  const s = createCoupState();
  assert.equal(s.recruit(999, 200, { roll: 0 }).reason, 'no-conspiracy');
  s.declareRingleader(101, 1);
  const r = s.recruit(101, 200, { intel: 80, targetResistance: 0, roll: 0 });
  assert.equal(r.success, true);
  assert.ok(s.getConspiracy(101).members.has(200));
  // 이미 멤버 재포섭 거부.
  assert.equal(s.recruit(101, 200, { roll: 0 }).reason, 'already-member');
  // roll≥chance면 실패.
  assert.equal(s.recruit(101, 201, { intel: 80, roll: 1 }).success, false);
});

test('説得 persuadeUnit: 충성 임계 도달 시 반란예정 유닛 등록', () => {
  const s = createCoupState();
  const intel = createIntelState();
  s.declareRingleader(101, 1);
  // 임계 미만: willDefect=false, 등록 안 됨.
  const a = s.persuadeUnit(intel, 101, 5001, COUP_LOYALTY_THRESHOLD - 10);
  assert.equal(a.willDefect, false);
  assert.equal(s.getConspiracy(101).persuadedUnits.size, 0);
  // 임계 도달: willDefect=true, 등록됨.
  const b = s.persuadeUnit(intel, 101, 5001, 20);
  assert.equal(b.willDefect, true);
  assert.ok(b.loyalty >= COUP_LOYALTY_THRESHOLD);
  assert.ok(s.getConspiracy(101).persuadedUnits.has(5001));
});

test('参加 join: 멤버만 참가 확정(비멤버 거부)', () => {
  const s = createCoupState();
  s.declareRingleader(101, 1);
  s.recruit(101, 200, { intel: 100, roll: 0 });
  assert.equal(s.join(101, 200), true, '포섭된 멤버');
  assert.equal(s.join(101, 777), false, '비멤버는 참가 불가');
});

test('叛乱 execute: 충성유닛 분리 → 반란군, 발동 후 executed', () => {
  const s = createCoupState();
  const intel = createIntelState();
  s.declareRingleader(101, 1);
  s.recruit(101, 200, { intel: 100, roll: 0 });
  s.persuadeUnit(intel, 101, 5001, 100); // 임계 초과
  assert.equal(s.canExecute(101, { decisiveVictory: false }), true);
  const result = s.execute(101, { decisiveVictory: false, rebelFaction: 'rebel' });
  assert.ok(result, '발동 성공');
  assert.deepEqual(result.defectingUnits, [5001]);
  assert.ok(result.members.includes(101) && result.members.includes(200));
  assert.equal(result.rebelFaction, 'rebel');
  assert.equal(s.getConspiracy(101).executed, true);
  assert.equal(s.activeCount(), 0, '발동된 모의는 active 아님');
  // 재발동 불가.
  assert.equal(s.execute(101, {}), null);
});

test('叛乱 게이트: 충성유닛 부족 시 발동 불가', () => {
  const s = createCoupState();
  s.declareRingleader(101, 1);
  // 설득 없음 → persuadedUnits 0 < 최소.
  assert.equal(s.getConspiracy(101).persuadedUnits.size < COUP_MIN_REBEL_UNITS, true);
  assert.equal(s.canExecute(101, {}), false);
  assert.equal(s.execute(101, {}), null);
});

test('캐논 게이트: 완전승리 진영은 쿠데타 불가', () => {
  const s = createCoupState();
  const intel = createIntelState();
  s.declareRingleader(101, 1);
  s.persuadeUnit(intel, 101, 5001, 100);
  assert.equal(s.canExecute(101, { decisiveVictory: true }), false, '완전승리=쿠데타 불가');
  assert.equal(s.execute(101, { decisiveVictory: true }), null);
  // 완전승리 해제되면 발동 가능.
  assert.equal(s.canExecute(101, { decisiveVictory: false }), true);
});

test('査閲 inspect: 탐지 성공 시 발동 차단(모의 분쇄)', () => {
  const s = createCoupState();
  const intel = createIntelState();
  s.declareRingleader(101, 1);
  s.persuadeUnit(intel, 101, 5001, 100);
  // 탐지: roll<chance.
  const det = s.inspect(101, { inspectorIntel: 100, roll: 0 });
  assert.equal(det.detected, true);
  assert.equal(s.getConspiracy(101).detected, true);
  // 탐지된 모의는 발동 차단.
  assert.equal(s.canExecute(101, { decisiveVictory: false }), false);
  assert.equal(s.execute(101, {}), null);
});

test('inspectChance: 査閲자 情報↑ / 모의 클수록↑ (0..1)', () => {
  assert.ok(inspectChance(100, 1) > inspectChance(0, 1), '情報↑→탐지율↑');
  assert.ok(inspectChance(50, 5) > inspectChance(50, 1), '멤버 많을수록 탐지↑');
  assert.ok(inspectChance(100, 50) <= 1, '상한 1 클램프');
  assert.ok(inspectChance(0, 0) >= 0, '하한 0');
});

test('査閲 미탐지(roll≥chance)면 모의 유지', () => {
  const s = createCoupState();
  const intel = createIntelState();
  s.declareRingleader(101, 1);
  s.persuadeUnit(intel, 101, 5001, 100);
  const miss = s.inspect(101, { inspectorIntel: 10, roll: 1 });
  assert.equal(miss.detected, false);
  assert.equal(s.canExecute(101, { decisiveVictory: false }), true, '미탐지면 발동 가능 유지');
});

// --- 감사 2026-06-20: coupLoyalty 키스페이스 분리 + 탐지된 모의 포섭/설득 차단 ----------------------

test('keyspace: 유닛 설득(addUnitLoyalty)이 동번호 캐릭터 coupLoyalty를 오염시키지 않음', () => {
  const s = createCoupState();
  const intel = createIntelState();
  s.declareRingleader(5001, 1); // 캐릭터 id 5001 수괴
  s.persuadeUnit(intel, 5001, 5001, 100); // 유닛 id 5001 설득(캐릭터와 동번호)
  assert.ok(intel.getUnitLoyalty(5001) >= 100 - 1 || intel.getUnitLoyalty(5001) >= 70, '유닛 충성 누적');
  assert.equal(intel.getCoupLoyalty(5001), 0, '동번호 캐릭터 충성은 미오염(0)');
  assert.equal(intel.isCoupConduct(5001), 0, 'coup_conduct 플래그 미오염');
});

test('査閲 탐지 후: recruit/persuadeUnit 차단(모의 분쇄 일관)', () => {
  const s = createCoupState();
  const intel = createIntelState();
  s.declareRingleader(101, 1);
  s.inspect(101, { inspectorIntel: 100, roll: 0 }); // 탐지
  assert.equal(s.recruit(101, 200, { intel: 100, roll: 0 }).reason, 'detected', '탐지 후 포섭 불가');
  const p = s.persuadeUnit(intel, 101, 5001, 100);
  assert.equal(s.getConspiracy(101).persuadedUnits.has(5001), false, '탐지 후 반란예정 유닛 미등록');
  assert.equal(p.willDefect, true, '충성 자체는 올라가나(유닛 상태) 모의엔 미반영');
});
