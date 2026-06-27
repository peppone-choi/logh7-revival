// logh7-morale: 統率 기반 艦隊最大士気 상한 + 저사기/혼란 지휘불가 판정(순수) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fleetMaxMorale,
  canCommand,
  clampMoraleToMax,
  MORALE_MAX,
  MORALE_FLOOR_CAP,
  LOW_MORALE_THRESHOLD,
} from '../../src/server/logh7-morale.mjs';

test('fleetMaxMorale: 統率 0→FLOOR_CAP, 100→MAX, 단조증가', () => {
  assert.equal(fleetMaxMorale(0), MORALE_FLOOR_CAP);
  assert.equal(fleetMaxMorale(100), MORALE_MAX);
  assert.ok(fleetMaxMorale(70) > fleetMaxMorale(30), '統率 높을수록 상한↑');
  assert.ok(fleetMaxMorale(-5) === MORALE_FLOOR_CAP && fleetMaxMorale(999) === MORALE_MAX, '범위 클램프');
});

test('clampMoraleToMax: 상한 초과 못함, 하한 0', () => {
  assert.equal(clampMoraleToMax(120, 80), 80, '상한 80 초과 불가');
  assert.equal(clampMoraleToMax(-10, 80), 0, '하한 0');
  assert.equal(clampMoraleToMax(50, 80), 50);
});

test('canCommand: 사기≥임계 && 混乱0 → true', () => {
  assert.equal(canCommand({ morale: 100, confusion: 0 }), true);
  assert.equal(canCommand({ morale: LOW_MORALE_THRESHOLD, confusion: 0 }), true, '임계값은 지휘 가능');
});

test('canCommand: 저사기 또는 혼란 → false', () => {
  assert.equal(canCommand({ morale: LOW_MORALE_THRESHOLD - 1, confusion: 0 }), false, '임계 미만 지휘불가');
  assert.equal(canCommand({ morale: 100, confusion: 1 }), false, '혼란 시 지휘불가');
  assert.equal(canCommand({}), true, '기본(사기 MAX·혼란0)은 지휘 가능');
});
