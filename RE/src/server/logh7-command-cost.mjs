// 커맨드 CP 비용/타이밍 + 가용성 판정 — Phase B §B3.
// 캐논: 각 커맨드는 {CP비용, 실행대기, 실행소요}를 가지며(content/manual/strategy-commands.json, P1 추출),
// CP가 0이면 비용 우회(zero-cost), 代用(substitution)은 2배 비용. 표는 캐논, 規則(per-command cost·
// zero-cost bypass·2× 代用)도 캐논. 순수 판정 함수 + 얇은 캐시 로더.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const COMMAND_TABLE_PATH = fileURLToPath(
  new URL('../../content/manual/strategy-commands.json', import.meta.url),
);

let cached = null;

/** 78-커맨드 표 로드(이름 인덱스 포함). 기본 경로는 캐시. */
export function loadCommandTable(path = COMMAND_TABLE_PATH) {
  if (cached && path === COMMAND_TABLE_PATH) return cached;
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const commands = Array.isArray(data.commands) ? data.commands : [];
  const byName = new Map(commands.map((c) => [c.name_ja, c]));
  const table = { commands, byName };
  if (path === COMMAND_TABLE_PATH) cached = table;
  return table;
}

/** 일본어 커맨드명으로 표 엔트리 조회(없으면 null). */
export function lookupCommand(table, nameJa) {
  return table?.byName?.get(nameJa) ?? null;
}

/** 표 엔트리 → {cp, wait, exec} 정규화. wait/exec는 "8G時間"·범위 문자열일 수 있어 선두 정수만. */
export function commandTiming(entry) {
  const num = (v) => {
    const n = parseInt(String(v ?? ''), 10);
    return Number.isFinite(n) ? n : 0;
  };
  return { cp: Number(entry?.cost_cp) || 0, wait: num(entry?.wait_time), exec: num(entry?.exec_time) };
}

/** 실효 CP 비용: 0이면 우회(0), 代用이면 2배. */
export function effectiveCpCost(baseCp, { substitution = false } = {}) {
  const cp = Number(baseCp) || 0;
  if (cp <= 0) return 0; // zero-cost bypass
  return substitution ? cp * 2 : cp; // 2× substitution(代用)
}

/** CP 풀이 (실효)비용을 감당하는가. */
export function canAfford(pool, baseCp, { substitution = false } = {}) {
  return (Number(pool) || 0) >= effectiveCpCost(baseCp, { substitution });
}
