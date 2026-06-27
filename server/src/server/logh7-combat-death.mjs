// 전사(戦死) 처리 — Phase B §B4 3.2. 원작 戦闘死는 未実装(p52): 旗艦 격침의 기본은 負傷+帰還惑星 즉시 워프,
// 플레이어가 戦死 토글을 켜면 사망(准将+ 계급별 평가포인트, §5.2). 사망 시 세션 재등록 제한(§1.4)은 별도.
//
// 평가포인트 테이블·계수는 매뉴얼에 수치 미수록 → **SERVER DESIGN**(규칙만 캐논: "准将 이상 사망 시 평가포인트").
// 帰還惑星 미지정 시 出身地(birthplace) fallback은 캐논(p14 게임설정 Return Planet). 이 모듈은 순수 결정
// 함수만 제공하고, 실제 상태 변이(injured/alive 세팅·旗艦 제거/재생성·워프 notify)는 호출자(command-engine)가 한다.

import { rankId } from './logh7-rank-table.mjs';

// 准将(이상)부터 사망 평가포인트 지급, 계급이 높을수록 가중. SERVER DESIGN.
export const DEATH_AWARD_BASE = 100;

/**
 * 계급별 사망 평가포인트. 准将(empire id 9 / alliance id 10) 미만은 0. 진영-로컬 계급(rank-table)으로 floor 해석.
 * @param {number} rankValue 캐릭터의 계급 id(1..14, 진영 로컬)
 * @param {'empire'|'alliance'} [faction]
 */
export function rankDeathAward(rankValue, faction = 'empire') {
  // rankId가 미스 시 NaN/null을 줄 수 있어 정수만 채택, 아니면 准将 기본 id(제국9/동맹10)로 폴백.
  const resolved = rankId('准将', { faction });
  const floor = Number.isInteger(resolved) ? resolved : (faction === 'alliance' ? 10 : 9);
  if (!Number.isInteger(rankValue) || rankValue < floor) return 0;
  return DEATH_AWARD_BASE * (rankValue - floor + 1);
}

/**
 * 旗艦 격침 결과를 결정한다(상태 변이는 호출자 몫).
 *   - deathToggle false(기본): 負傷 + 帰還惑星(없으면 出身地) 워프, 생존 유지.
 *   - deathToggle true: 사망, 准将+면 평가포인트 지급, 旗艦 제거.
 * @param {{ deathToggle?:boolean, rank?:number, faction?:'empire'|'alliance',
 *           returnPlanet?:string|number|null, birthplace?:string|number|null }} opts
 */
export function resolveFlagshipDestroyed({
  deathToggle = false,
  rank = 0,
  faction = 'empire',
  returnPlanet = null,
  birthplace = null,
} = {}) {
  if (!deathToggle) {
    return {
      outcome: 'injured',
      alive: true,
      injured: true,
      warpTo: returnPlanet ?? birthplace ?? null,
    };
  }
  return {
    outcome: 'killed',
    alive: false,
    injured: false,
    evalAward: rankDeathAward(rank, faction),
  };
}
