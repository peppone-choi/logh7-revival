// logh7-air-combat: 戦闘艇 공중전 순수 결정 검증(對艦 피해+감속 / 邀撃 격감 / 발진 物資 게이트).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAirCombat,
  canLaunchFighters,
  FIGHTER_SUPPLY_COST,
  FIGHTER_ATTACK_PER,
  FIGHTER_SLOW_FACTOR,
  INTERCEPT_LOSS,
} from '../../src/server/logh7-air-combat.mjs';

test('canLaunchFighters: 物資 10 미만 false, 이상 true', () => {
  assert.equal(canLaunchFighters(9), false);
  assert.equal(canLaunchFighters(10), true);
  assert.equal(canLaunchFighters(100), true);
  assert.equal(canLaunchFighters(undefined), false);
});

test('對艦: damage = 戦闘艇수×공격력, slowFactor<1, 발진 10물자, 戦闘艇 불변', () => {
  const r = computeAirCombat({ fighters: 10 }, { fighters: 0 }, { mode: 'anti-ship' });
  assert.equal(r.kind, 'anti-ship');
  assert.equal(r.damage, 10 * FIGHTER_ATTACK_PER);
  assert.equal(r.slowFactor, FIGHTER_SLOW_FACTOR);
  assert.ok(r.slowFactor < 1);
  assert.equal(r.supplyCost, FIGHTER_SUPPLY_COST);
  assert.equal(r.launcherFightersAfter, 10, '對艦은 戦闘艇 손실 없음');
});

test('邀撃: 양측 戦闘艇 격감(0 하한), 피해 없음', () => {
  const r = computeAirCombat({ fighters: 8 }, { fighters: 3 }, { mode: 'intercept' });
  assert.equal(r.kind, 'intercept');
  assert.equal(r.launcherFightersAfter, Math.max(0, 8 - INTERCEPT_LOSS));
  assert.equal(r.targetFightersAfter, 0, '3 - 5 → 0 하한');
  assert.equal(r.damage, undefined);
  assert.equal(r.supplyCost, FIGHTER_SUPPLY_COST);
});

test('戦闘艇 0기: 對艦 피해 0', () => {
  const r = computeAirCombat({ fighters: 0 }, { fighters: 0 });
  assert.equal(r.damage, 0);
});

test('result는 고정 1이 아니라 계산값(스텁 교체 확인)', () => {
  const a = computeAirCombat({ fighters: 5 }, {}, { mode: 'anti-ship' });
  const b = computeAirCombat({ fighters: 50 }, {}, { mode: 'anti-ship' });
  assert.notEqual(a.damage, b.damage, '戦闘艇 수에 따라 피해가 달라짐');
});
