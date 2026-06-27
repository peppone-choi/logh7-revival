// logh7-surrender: 降伏勧告 성공률(統率↑/표적사기↓) + roll 판정(재현성) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { surrenderChance, resolveSurrender } from '../../src/server/logh7-surrender.mjs';

test('surrenderChance: 統率 높을수록 성공률↑ (0..1)', () => {
  const lo = surrenderChance(0, { morale: 100 });
  const hi = surrenderChance(100, { morale: 100 });
  assert.ok(hi > lo, `統率 100 > 統率 0: ${hi} > ${lo}`);
  assert.ok(lo >= 0 && hi <= 1, '0..1 범위');
});

test('surrenderChance: 표적 사기 낮을수록 성공률↑', () => {
  const fresh = surrenderChance(50, { morale: 100 });
  const broken = surrenderChance(50, { morale: 0 });
  assert.ok(broken > fresh, `사기 0 > 사기 100: ${broken} > ${fresh}`);
});

test('surrenderChance: 統率 100 + 표적 사기 0 → 1.0(최대)', () => {
  assert.equal(surrenderChance(100, { morale: 0 }), 1);
  assert.equal(surrenderChance(0, { morale: 100 }), 0);
});

test('resolveSurrender: roll < chance → 수락, ≥ → 거부 (rng 주입 재현)', () => {
  const recommender = { leadership: 80 };
  const target = { morale: 20 };
  const { chance } = resolveSurrender(recommender, target, 1);
  assert.ok(chance > 0 && chance < 1);
  assert.equal(resolveSurrender(recommender, target, chance - 0.01).accepted, true, 'roll<chance 수락');
  assert.equal(resolveSurrender(recommender, target, chance + 0.01).accepted, false, 'roll>=chance 거부');
});

test('resolveSurrender: 같은 입력+roll → 같은 결과(결정론)', () => {
  const a = resolveSurrender({ leadership: 60 }, { morale: 50 }, 0.3);
  const b = resolveSurrender({ leadership: 60 }, { morale: 50 }, 0.3);
  assert.deepEqual(a, b);
});
