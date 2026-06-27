// 게임 클록 — 공용 인프라(Phase B 키스톤).
//
// 캐논: 실시간 24배. 1실시간초 = 24게임초 → 1게임일(86,400게임초) = 3,600실시간초 = 1실시간시간.
// 즉 realMsPerGameDay = 3,600,000ms. 30게임일 = 1개월(功績·진급·경제 30일틱 집계 주기).
// 출처: docs/logh7-manual-canon.md (p10 24×, p46, p36 30일) — 24×·30일은 CONFIRMED.
//
// economy 30일틱, operations 작전 30일, CP 회복, 진급 30일 평가가 모두 이 단일 클록을 공유한다
// (도메인별 클록을 만들지 말 것). 순수/결정론: nowMs를 호출자가 주입한다(내부에서 Date.now() 안 씀)
// → 테스트가 시간 진행을 결정론적으로 제어 가능.

export const REAL_MS_PER_GAME_DAY = 3_600_000; // CONFIRMED (24× 실시간)
export const GAME_DAYS_PER_MONTH = 30; // CONFIRMED

/**
 * 게임 클록을 만든다. `startMs`는 게임일 0의 실시간 기준점(부팅 시각 등). 영속성으로 보존되어 재시작 후에도
 * 게임 시간이 이어진다.
 * @param {{ startMs?: number, realMsPerGameDay?: number }} [opts]
 */
export function createGameClock({ startMs = 0, realMsPerGameDay = REAL_MS_PER_GAME_DAY } = {}) {
  const perDay = realMsPerGameDay > 0 ? realMsPerGameDay : REAL_MS_PER_GAME_DAY;
  return {
    startMs,
    realMsPerGameDay: perDay,
    /** 절대 게임일(0부터). startMs 이전이면 0으로 클램프. */
    gameDayOf(nowMs) {
      const days = Math.floor((nowMs - startMs) / perDay);
      return days > 0 ? days : 0;
    },
    /** 절대 게임월(0부터). */
    gameMonthOf(nowMs) {
      return Math.floor(this.gameDayOf(nowMs) / GAME_DAYS_PER_MONTH);
    },
  };
}

/**
 * prevDay에서 nowMs 시점까지 새로 넘은 게임일 경계 수(틱 루프가 "하루 1회"를 보장하는 데 사용).
 * 예: prevDay=2, 현재 게임일=5 → 3. 음수 없음.
 * @param {{ gameDayOf(nowMs:number):number }} clock
 * @param {number} prevDay
 * @param {number} nowMs
 */
export function gameDaysCrossed(clock, prevDay, nowMs) {
  const current = clock.gameDayOf(nowMs);
  return current > prevDay ? current - prevDay : 0;
}
