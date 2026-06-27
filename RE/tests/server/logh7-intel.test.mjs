// logh7-intel: 첩보 성공률(情報↑/치안↓) + 쿠데타 叛乱忠誠度/완전승리 게이트(순수) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  espionageChance,
  resolveEspionage,
  applyCoupLoyalty,
  canStartCoup,
  createIntelState,
  COUP_LOYALTY_THRESHOLD,
  COUP_LOYALTY_MAX,
} from '../../src/server/logh7-intel.mjs';

test('espionageChance: 情報 높을수록↑, 치안 높을수록↓ (0..1)', () => {
  assert.ok(espionageChance(100, 0) > espionageChance(0, 0), '情報↑→성공률↑');
  assert.ok(espionageChance(50, 0) > espionageChance(50, 100), '치안↑→성공률↓');
  assert.ok(Math.abs(espionageChance(100, 0) - 0.9) < 1e-9, '情報100·치안0 ≈ 0.9');
  assert.ok(espionageChance(0, 100) >= 0, '하한 0 클램프');
});

test('resolveEspionage: roll<chance → 성공, 재현', () => {
  const { chance } = resolveEspionage(60, 30, 1);
  assert.equal(resolveEspionage(60, 30, chance - 0.01).success, true);
  assert.equal(resolveEspionage(60, 30, chance + 0.01).success, false);
  assert.deepEqual(resolveEspionage(60, 30, 0.2), resolveEspionage(60, 30, 0.2), '결정론');
});

test('applyCoupLoyalty: 누적 + 0..MAX 클램프', () => {
  assert.equal(applyCoupLoyalty(50, 30), 80);
  assert.equal(applyCoupLoyalty(90, 50), COUP_LOYALTY_MAX, '상한');
  assert.equal(applyCoupLoyalty(10, -50), 0, '하한');
});

test('canStartCoup: 임계 이상 → true(순수 충성 게이트, decisiveVictory 무관)', () => {
  // 인과 정정(감사 2026-06-20 L129): decisiveVictory 게이트는 evaluateEnding(세션 종료)로 이주했고
  // canStartCoup은 충성 임계만 본다. 완전승리 진영 표시 게이트는 isCoupConduct/coup.canExecute가 자체 검사.
  assert.equal(canStartCoup({ loyalty: COUP_LOYALTY_THRESHOLD }), true);
  assert.equal(canStartCoup({ loyalty: COUP_LOYALTY_THRESHOLD - 1 }), false, '임계 미만');
  // decisiveVictory 인자는 더는 게이트가 아니다 — 임계만 넘으면 true(완전승리여도 충성 자체는 임계 통과).
  assert.equal(canStartCoup({ loyalty: 100, decisiveVictory: true }), true, 'decisiveVictory 무시(충성 임계만)');
  assert.equal(canStartCoup({}), false, '기본 0');
});

// ── AU-3 createIntelState — coup-loyalty/rebellion 누적 소스(표시필드 시드용) ──
test('createIntelState: 미시드 조회는 전부 0(기본 불변)', () => {
  const s = createIntelState();
  assert.equal(s.getCoupLoyalty(1001), 0);
  assert.equal(s.getRebellion(42), 0);
  assert.equal(s.isCoupConduct(1001), 0);
});

test('createIntelState addCoupLoyalty: 누적 + 0..MAX 클램프', () => {
  const s = createIntelState();
  assert.equal(s.addCoupLoyalty(1001, 50), 50);
  assert.equal(s.addCoupLoyalty(1001, 60), COUP_LOYALTY_MAX, '상한');
  assert.equal(s.getCoupLoyalty(1001), COUP_LOYALTY_MAX);
});

test('createIntelState isCoupConduct: 임계 이상이면 1, 완전승리면 0(게이트)', () => {
  const s = createIntelState();
  s.addCoupLoyalty(1001, COUP_LOYALTY_THRESHOLD);
  assert.equal(s.isCoupConduct(1001), 1, '임계 이상');
  assert.equal(s.isCoupConduct(1001, { decisiveVictory: true }), 0, '완전승리 게이트');
  assert.equal(s.isCoupConduct(2002), 0, '미시드 0');
});

test('createIntelState setRebellion/getRebellion: 0..255 클램프', () => {
  const s = createIntelState();
  assert.equal(s.setRebellion(42, 5), 5);
  assert.equal(s.getRebellion(42), 5);
  assert.equal(s.setRebellion(42, 999), 0xff, '상한 255');
  assert.equal(s.setRebellion(42, -1), 0, '하한 0');
});
