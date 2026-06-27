import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ABILITY_COLUMNS,
  seedAbilities,
  abilitiesAreUnseeded,
  resolveCreatedAbilities,
} from '../../src/server/logh7-ability-seed.mjs';

// Column index helpers so the assertions read by ability name, not by magic index.
const col = (name) => ABILITY_COLUMNS.indexOf(name);

test('ability columns are the canonical PCP+MCP order', () => {
  assert.deepEqual(ABILITY_COLUMNS, ['tochi', 'seiji', 'unei', 'joho', 'shiki', 'kido', 'kogeki', 'bogyo']);
});

test('帝国 귀족 (blood 0) seeds seiji 55 = BASE 40 + 15', () => {
  const a = seedAbilities({ power: 1, blood: 0 });
  assert.equal(a[col('seiji')], 55); // 40 + 15
  assert.equal(a[col('joho')], 50); // 40 + 10
  assert.equal(a[col('tochi')], 48); // 40 + 8
  assert.equal(a[col('unei')], 40); // BASE only
});

test('帝国 제국기사 (blood 1) seeds shiki 52 = BASE 40 + 12', () => {
  const a = seedAbilities({ power: 1, blood: 1 });
  assert.equal(a[col('shiki')], 52); // 40 + 12
  assert.equal(a[col('kido')], 50); // 40 + 10
  assert.equal(a[col('bogyo')], 50); // 40 + 10
  assert.equal(a[col('kogeki')], 48); // 40 + 8
});

test('同盟 시민 (power 2, blood 0) seeds seiji/unei 50, joho 48', () => {
  const a = seedAbilities({ power: 2, blood: 0 });
  assert.equal(a[col('seiji')], 50); // 40 + 10
  assert.equal(a[col('unei')], 50); // 40 + 10
  assert.equal(a[col('joho')], 48); // 40 + 8
});

test('同盟 망명자 (power 2, blood 1) seeds joho 55, shiki 48', () => {
  const a = seedAbilities({ power: 2, blood: 1 });
  assert.equal(a[col('joho')], 55); // 40 + 15
  assert.equal(a[col('shiki')], 48); // 40 + 8
});

test('every seeded ability stays clamped within 0-100', () => {
  // Exhaustively over the known origins: no modifier can push BASE 40 outside [0, 100].
  for (const power of [0, 1, 2]) {
    for (const blood of [0, 1, 2, 3]) {
      for (const v of seedAbilities({ power, blood })) {
        assert.ok(v >= 0 && v <= 100, `ability ${v} out of [0,100] for power=${power} blood=${blood}`);
      }
    }
  }
});

test('an unrecognized origin seeds BASE-only (all 40)', () => {
  const a = seedAbilities({ power: 9, blood: 9 });
  assert.deepEqual(a, [40, 40, 40, 40, 40, 40, 40, 40]);
});

test('abilitiesAreUnseeded detects missing / empty / all-zero arrays', () => {
  assert.equal(abilitiesAreUnseeded(null), true);
  assert.equal(abilitiesAreUnseeded([]), true);
  assert.equal(abilitiesAreUnseeded([0, 0, 0, 0, 0, 0, 0, 0]), true);
  assert.equal(abilitiesAreUnseeded([0, 0, 1, 0]), false);
});

test('resolveCreatedAbilities keeps player-submitted stats when any is non-zero', () => {
  const submitted = [90, 80, 70, 60, 95, 88, 92, 70];
  assert.deepEqual(resolveCreatedAbilities({ abilities: submitted, power: 1, blood: 1 }), submitted);
});

test('resolveCreatedAbilities seeds the house-rule BASE when the form sent all-zero (기준 0)', () => {
  // 帝国 제국기사 with the live "기준 0" form: server stamps the origin seed instead of all-zero.
  const a = resolveCreatedAbilities({ abilities: [0, 0, 0, 0, 0, 0, 0, 0], power: 1, blood: 1 });
  assert.equal(a[col('shiki')], 52);
  assert.equal(a[col('kogeki')], 48);
});
