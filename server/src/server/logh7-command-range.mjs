// 커맨드 레인지 서클 — Phase B §B3.
// 캐논(p47-48): 전술 지휘 자원으로, 시간에 따라 충전되어 상한에 도달하며 충전 속도는 指揮(command) 능력이
// 좌우한다. 시작 시 0–20초의 지연(startup)이 있고, 커맨드를 발령하면 0으로 리셋된다. 상한·충전 속도·시작지연
// 의 구체 수치는 매뉴얼 미수록 → **SERVER DESIGN**(규칙만 캐논). 순수: elapsedMs를 호출자가 준다.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const RANGE_MAX = 100; // 서클 반경 상한(SERVER DESIGN 단위)
export const STARTUP_MAX_MS = 20000; // 시작 지연 상한 0–20초(캐논 범위)
export const FILL_MS_FAST = 5000; // 指揮 100일 때 만충 시간(SERVER DESIGN)
export const FILL_MS_SLOW = 20000; // 指揮 0일 때 만충 시간(SERVER DESIGN)

/** 指揮 능력(0..100)에 따른 만충 시간(ms). 指揮 높을수록 짧다(빠름). */
export function fillTimeMs(commandAbility) {
  const a = clamp((Number(commandAbility) || 0) / 100, 0, 1);
  return FILL_MS_SLOW + (FILL_MS_FAST - FILL_MS_SLOW) * a; // 0→SLOW, 100→FAST
}

/**
 * 경과 시간 기준 현재 서클 반경(순수). 시작지연 동안 0, 이후 指揮 기반 속도로 선형 충전, 상한 클램프.
 * @param {{ elapsedMs?:number, commandAbility?:number, startupMs?:number, max?:number }} opts
 */
export function commandRangeRadius({ elapsedMs = 0, commandAbility = 0, startupMs = 0, max = RANGE_MAX } = {}) {
  const startup = clamp(Number(startupMs) || 0, 0, STARTUP_MAX_MS);
  const active = (Number(elapsedMs) || 0) - startup;
  if (active <= 0) return 0; // 시작 지연 중
  const fill = fillTimeMs(commandAbility);
  return clamp((active / fill) * max, 0, max);
}

/** 커맨드 발령 시 서클 리셋(0). */
export function resetCommandRange() {
  return 0;
}
