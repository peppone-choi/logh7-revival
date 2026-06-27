// logh7-ability-xp: CP→능력치 XP 성장(100→+1 carry, 代用 제외, 캡) 순수 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gainAbilityXp, XP_PER_LEVEL, ABILITY_CAP } from '../../src/server/logh7-ability-xp.mjs';

test('100 XP마다 능력치 +1, 나머지 carry', () => {
  assert.deepEqual(gainAbilityXp({ xp: 0, stat: 50, cpSpent: XP_PER_LEVEL }), { xp: 0, stat: 51, leveled: 1 });
  assert.deepEqual(gainAbilityXp({ xp: 0, stat: 50, cpSpent: 250 }), { xp: 50, stat: 52, leveled: 2 });
  assert.deepEqual(gainAbilityXp({ xp: 80, stat: 50, cpSpent: 30 }), { xp: 10, stat: 51, leveled: 1 }, 'carry 누적');
});

test('代用(substitution)은 XP 미적립', () => {
  assert.deepEqual(gainAbilityXp({ xp: 50, stat: 50, cpSpent: 200, substitution: true }), { xp: 50, stat: 50, leveled: 0 });
});

test('cpSpent 0 → 변화 없음', () => {
  assert.deepEqual(gainAbilityXp({ xp: 30, stat: 50, cpSpent: 0 }), { xp: 30, stat: 50, leveled: 0 });
});

test('능력치 캡(100)에서 잔여 XP 폐기 + 오버플로 없음', () => {
  const r = gainAbilityXp({ xp: 0, stat: 99, cpSpent: 1000 });
  assert.equal(r.stat, ABILITY_CAP, '100 초과 안 함');
  assert.equal(r.leveled, 1, '99→100 한 단계만');
  assert.equal(r.xp, 0, '캡 도달 시 잔여 폐기');
  assert.deepEqual(gainAbilityXp({ xp: 0, stat: ABILITY_CAP, cpSpent: 500 }), { xp: 0, stat: ABILITY_CAP, leveled: 0 }, '이미 캡');
});

test('레벨업 없는 누적', () => {
  assert.deepEqual(gainAbilityXp({ xp: 20, stat: 40, cpSpent: 30 }), { xp: 50, stat: 40, leveled: 0 });
});
