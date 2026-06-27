// logh7-command-cost: CP 가용성/2배 代用/0코스트 우회 + 78커맨드 표 조회 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveCpCost,
  canAfford,
  loadCommandTable,
  lookupCommand,
  commandTiming,
} from '../../src/server/logh7-command-cost.mjs';

test('effectiveCpCost: 0 우회, 일반, 2배 代用', () => {
  assert.equal(effectiveCpCost(0), 0, 'zero-cost bypass');
  assert.equal(effectiveCpCost(40), 40);
  assert.equal(effectiveCpCost(40, { substitution: true }), 80, '代用 2배');
  assert.equal(effectiveCpCost(0, { substitution: true }), 0, '0은 代用이어도 0');
});

test('canAfford: 풀 vs 실효비용', () => {
  assert.equal(canAfford(50, 40), true);
  assert.equal(canAfford(50, 40, { substitution: true }), false, '대용 80 > 50');
  assert.equal(canAfford(80, 40, { substitution: true }), true);
  assert.equal(canAfford(0, 0), true, '0코스트는 항상 가능');
});

test('표 로드 + 조회: ワープ航行 = cost_cp 40 (P1 추출)', () => {
  const table = loadCommandTable();
  assert.ok(table.commands.length >= 50, '78커맨드 표 로드');
  const warp = lookupCommand(table, 'ワープ航行');
  assert.ok(warp, 'ワープ航行 존재');
  assert.equal(commandTiming(warp).cp, 40);
  assert.equal(lookupCommand(table, '없는커맨드'), null);
});
