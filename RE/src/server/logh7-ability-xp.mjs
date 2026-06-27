// CP→능력치 XP 성장 — Phase B §B3.
// 캐논: 커맨드 실행으로 소비한 CP가 능력치 XP로 누적되어 100 XP마다 능력치 +1(나머지는 carry). 代用(2배 대납)
// 으로 실행한 커맨드는 XP 미적립. XP_PER_LEVEL=100·代用 제외는 캐논(매뉴얼); "quantum당 +1"의 quantum 정의
// (=소비 CP 1단위)와 어느 능력치에 적립할지 매핑은 **SERVER DESIGN**. 순수: 상태 변이는 호출자.

export const XP_PER_LEVEL = 100; // 캐논: 100 XP → 능력치 +1
export const ABILITY_CAP = 100; // 능력치 상한

/**
 * 커맨드 1회의 CP 소비로 능력치 XP를 적립하고 레벨업을 정산(순수).
 * @param {{ xp?:number, stat?:number, cpSpent?:number, substitution?:boolean }} opts
 *   xp=현재 누적 XP(0..99), stat=현재 능력치, cpSpent=이번에 소비한 CP, substitution=代用 여부
 * @returns {{ xp:number, stat:number, leveled:number }} 갱신된 누적 XP·능력치·이번에 오른 단계 수
 */
export function gainAbilityXp({ xp = 0, stat = 0, cpSpent = 0, substitution = false } = {}) {
  const cp = Number(cpSpent) || 0;
  if (substitution || cp <= 0) {
    return { xp: Number(xp) || 0, stat: Number(stat) || 0, leveled: 0 };
  }
  const curStat = Math.min(ABILITY_CAP, Math.max(0, Number(stat) || 0));
  if (curStat >= ABILITY_CAP) {
    return { xp: 0, stat: ABILITY_CAP, leveled: 0 }; // 이미 캡 → 적립 의미 없음
  }
  const total = (Number(xp) || 0) + cp; // quantum(=CP 1)당 +1 XP
  const rawLevels = Math.floor(total / XP_PER_LEVEL);
  const newStat = Math.min(ABILITY_CAP, curStat + rawLevels);
  const leveled = newStat - curStat;
  // 캡에 도달하면 잔여 XP 폐기(더 오를 곳 없음), 아니면 나머지 carry.
  const remXp = newStat >= ABILITY_CAP ? 0 : total % XP_PER_LEVEL;
  return { xp: remXp, stat: newStat, leveled };
}
