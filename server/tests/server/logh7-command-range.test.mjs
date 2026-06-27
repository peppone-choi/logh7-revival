// logh7-command-range: 커맨드 레인지 서클 충전(시작지연/指揮 속도/상한/리셋) 순수 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  commandRangeRadius,
  fillTimeMs,
  resetCommandRange,
  RANGE_MAX,
  FILL_MS_FAST,
  FILL_MS_SLOW,
} from '../../src/server/logh7-command-range.mjs';

test('fillTimeMs: 指揮 높을수록 만충 빠름(시간 짧음)', () => {
  assert.equal(fillTimeMs(100), FILL_MS_FAST);
  assert.equal(fillTimeMs(0), FILL_MS_SLOW);
  assert.ok(fillTimeMs(80) < fillTimeMs(20));
});

test('시작 지연 동안 반경 0', () => {
  assert.equal(commandRangeRadius({ elapsedMs: 1000, commandAbility: 50, startupMs: 3000 }), 0);
  assert.equal(commandRangeRadius({ elapsedMs: 3000, commandAbility: 50, startupMs: 3000 }), 0, '지연 경계');
});

test('지연 후 선형 충전 → 만충 시점에 상한', () => {
  const startup = 2000;
  const ability = 100; // fill = FILL_MS_FAST
  const atFull = commandRangeRadius({ elapsedMs: startup + FILL_MS_FAST, commandAbility: ability, startupMs: startup });
  assert.equal(atFull, RANGE_MAX, '만충 시점 상한');
  const beyond = commandRangeRadius({ elapsedMs: startup + FILL_MS_FAST * 5, commandAbility: ability, startupMs: startup });
  assert.equal(beyond, RANGE_MAX, '상한 초과 안 함');
  const half = commandRangeRadius({ elapsedMs: startup + FILL_MS_FAST / 2, commandAbility: ability, startupMs: startup });
  assert.ok(half > 0 && half < RANGE_MAX, '중간은 부분 충전');
});

test('指揮 높을수록 같은 시간에 더 큰 반경', () => {
  const t = 6000;
  const lo = commandRangeRadius({ elapsedMs: t, commandAbility: 10, startupMs: 0 });
  const hi = commandRangeRadius({ elapsedMs: t, commandAbility: 90, startupMs: 0 });
  assert.ok(hi > lo, `指揮 90 > 指揮 10: ${hi} > ${lo}`);
});

test('resetCommandRange → 0', () => {
  assert.equal(resetCommandRange(), 0);
});
