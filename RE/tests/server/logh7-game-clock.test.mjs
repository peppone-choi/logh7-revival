// logh7-game-clock: 24× 게임 클록(공용 인프라) + world-state 통합/영속 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGameClock,
  gameDaysCrossed,
  REAL_MS_PER_GAME_DAY,
  GAME_DAYS_PER_MONTH,
} from '../../src/server/logh7-game-clock.mjs';
import { createWorldState } from '../../src/server/logh7-world-state.mjs';

const DAY = REAL_MS_PER_GAME_DAY;

test('상수: 24× → 1게임일=3,600,000ms, 1개월=30게임일 (CONFIRMED)', () => {
  assert.equal(REAL_MS_PER_GAME_DAY, 3_600_000);
  assert.equal(GAME_DAYS_PER_MONTH, 30);
});

test('gameDayOf: startMs에서 0, 하루 경과마다 +1, 이전은 0 클램프', () => {
  const clock = createGameClock({ startMs: 1000 });
  assert.equal(clock.gameDayOf(1000), 0);
  assert.equal(clock.gameDayOf(1000 + DAY - 1), 0, '하루 직전은 아직 0');
  assert.equal(clock.gameDayOf(1000 + DAY), 1);
  assert.equal(clock.gameDayOf(1000 + 5 * DAY), 5);
  assert.equal(clock.gameDayOf(0), 0, 'startMs 이전은 0 클램프');
});

test('gameMonthOf: 30게임일 = 1개월', () => {
  const clock = createGameClock({ startMs: 0 });
  assert.equal(clock.gameMonthOf(29 * DAY), 0);
  assert.equal(clock.gameMonthOf(30 * DAY), 1);
  assert.equal(clock.gameMonthOf(60 * DAY), 2);
});

test('gameDaysCrossed: prevDay→now 사이 새 경계 수(틱 1일 1회 보장)', () => {
  const clock = createGameClock({ startMs: 0 });
  assert.equal(gameDaysCrossed(clock, 2, 5 * DAY), 3);
  assert.equal(gameDaysCrossed(clock, 5, 5 * DAY + 10), 0, '같은 날 안에선 0');
  assert.equal(gameDaysCrossed(clock, 5, 3 * DAY), 0, '뒤로 가도 음수 아님');
});

test('잘못된 realMsPerGameDay는 기본값으로 폴백', () => {
  const clock = createGameClock({ startMs: 0, realMsPerGameDay: 0 });
  assert.equal(clock.realMsPerGameDay, REAL_MS_PER_GAME_DAY);
});

test('world-state 게임클록: gameDayOf 노출 + clockStartMs 스냅샷 보존', () => {
  const ws = createWorldState({ clockStartMs: 5000 });
  assert.equal(ws.gameDayOf(5000), 0);
  assert.equal(ws.gameDayOf(5000 + 3 * DAY), 3);
  assert.equal(ws.gameMonthOf(5000 + 30 * DAY), 1);

  // 스냅샷에 기준점 포함 → 복원 후 게임 시간 연속.
  const snap = ws.toSnapshot();
  assert.equal(snap.clockStartMs, 5000);
  const ws2 = createWorldState(); // 다른 기준점(0)으로 시작
  ws2.restore(snap);
  assert.equal(ws2.gameDayOf(5000 + 3 * DAY), 3, '복원된 기준점으로 동일 게임일');
});
