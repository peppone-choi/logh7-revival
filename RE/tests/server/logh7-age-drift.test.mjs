// logh7-age-drift: 연령 효과 월간 능력치 드리프트(방향 + rolls 주입 결정론) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ageDriftDirection,
  applyAgeDrift,
  AGE_YOUNG,
  AGE_OLD,
  DRIFT_CHANCE,
} from '../../src/server/logh7-age-drift.mjs';

test('ageDriftDirection: 젊으면 +1, 전성기 0, 노년 -1', () => {
  assert.equal(ageDriftDirection(AGE_YOUNG - 5), 1);
  assert.equal(ageDriftDirection((AGE_YOUNG + AGE_OLD) / 2), 0);
  assert.equal(ageDriftDirection(AGE_OLD + 5), -1);
});

test('applyAgeDrift: 방향 0(전성기)면 변화 없음', () => {
  const abil = [50, 60, 70, 40, 55, 65, 45, 50];
  assert.deepEqual(applyAgeDrift(abil, 40, abil.map(() => 0)), abil);
});

test('applyAgeDrift: 젊음 + roll<chance → +1, roll>=chance → 불변', () => {
  const abil = [50, 50, 50];
  const rolls = [0, 1, 0]; // 0<chance(향상), 1>=chance(불변), 0<chance(향상)
  assert.deepEqual(applyAgeDrift(abil, 20, rolls), [51, 50, 51]);
});

test('applyAgeDrift: 노년 → -1 (roll<chance)', () => {
  assert.deepEqual(applyAgeDrift([50, 50], AGE_OLD + 10, [0, 0]), [49, 49]);
});

test('applyAgeDrift: 0..100 클램프', () => {
  assert.deepEqual(applyAgeDrift([100], 20, [0]), [100], '상한 100 초과 안 함');
  assert.deepEqual(applyAgeDrift([0], AGE_OLD + 10, [0]), [0], '하한 0 미만 안 함');
});

test('applyAgeDrift: rolls 미제공 → 변동 없음(보수적)', () => {
  const abil = [50, 60];
  assert.deepEqual(applyAgeDrift(abil, 20), abil);
});

test('결정론: 같은 rolls → 같은 결과', () => {
  const a = applyAgeDrift([50, 50, 50], 60, [0.05, 0.5, 0.05]);
  const b = applyAgeDrift([50, 50, 50], 60, [0.05, 0.5, 0.05]);
  assert.deepEqual(a, b);
});
