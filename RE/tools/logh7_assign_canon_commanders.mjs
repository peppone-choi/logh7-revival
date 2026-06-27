// 캐논 사령관 배정 도구 — content/scenarios/canon-801-07.json의 함대(commander=0)에 복구된 로스터
// 캐릭터를 배정하고 characters[] 배열을 채운다. combat-gaps(戦死/降伏勧告/艦隊最大士気)가 canon 월드의
// NPC 사령관에서 가동되도록 하는 capstone 데이터 조인.
//
// 데이터 등급: 캐릭터(이름/능력/계급)는 캐논(P1, content-pack 로스터). 캐릭터↔함대 **페어링은 P3 시드**
//   (시나리오가 이미 "commander…P3 안전시드"라 명시). 진영만 일치시키고 1:1로 배정(중복 flagship 방지),
//   로스터보다 많은 함대는 commander=0(무명) 유지. flagship=함대의 lead ship(_fleet 일치 첫 함선) →
//   char+0x24 == unit.id RE 바인딩 키와 일치(getCharacterByFlagship).
//
// 실행: node tools/logh7_assign_canon_commanders.mjs  (canon-801-07.json을 제자리 갱신)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContentPack } from '../src/server/logh7-content-pack.mjs';
import { CANON_CONTENT } from '../src/server/logh7-canon-content.mjs';
import { rankId } from '../src/server/logh7-rank-table.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCEN_PATH = join(REPO, 'content', 'scenarios', 'canon-801-07.json');

// 진영 매핑: 로스터 nationId(1280/1281) + 시나리오 fleet.faction(1/2) → 정규 진영명.
const NATION_TO_FACTION = { 1280: 'empire', 1281: 'alliance' };
const SCEN_FACTION = { 1: 'empire', 2: 'alliance' };

export function assignCanonCommanders(scenario, rosterChars) {
  const ships = Array.isArray(scenario.ships) ? scenario.ships : [];
  const fleets = Array.isArray(scenario.fleets) ? scenario.fleets : [];
  // 함대별 lead ship(= flagship): _fleet가 그 함대를 가리키는 첫 함선.
  const flagshipOf = (fleetId) => ships.find((s) => Number(s._fleet) === Number(fleetId)) ?? null;

  // 진영별 로스터 큐(command 내림차순 — 統率 높은 사령관이 먼저 배정).
  const byFaction = { empire: [], alliance: [] };
  for (const ch of rosterChars) {
    const f = NATION_TO_FACTION[ch.nationId];
    if (f) byFaction[f].push(ch);
  }
  for (const f of Object.keys(byFaction)) {
    byFaction[f].sort((a, b) => (Number(b.command) || 0) - (Number(a.command) || 0));
  }

  const characters = [];
  const usedFlagships = new Set();
  for (const fleet of fleets) {
    const faction = SCEN_FACTION[fleet.faction] ?? null;
    if (!faction || !byFaction[faction]?.length) continue; // 무명 함대(commander 0 유지)
    const flagship = flagshipOf(fleet.id);
    if (!flagship || usedFlagships.has(flagship.id)) continue;
    const ch = byFaction[faction].shift(); // 1:1 배정(소진)
    if (!ch) continue;
    usedFlagships.add(flagship.id);
    const r = rankId(ch.rank, { faction });
    fleet.commander = ch.id;
    characters.push({
      id: ch.id,
      faction,
      leadership: Number(ch.command) || 0, // 統率(PCP index0)
      rank: r?.id ?? 0,
      flagship: flagship.id, // char+0x24 == unit.id (RE 월드진입 바인딩)
      returnPlanet: fleet._hq_planet ?? null, // 帰還惑星 = HQ 행성(戦死 워프)
      deathToggle: false,
    });
  }
  scenario.characters = characters;
  return { scenario, assigned: characters.length };
}

// CLI 실행(직접 호출 시에만 파일 갱신; import 시엔 함수만 노출).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const scenario = JSON.parse(readFileSync(SCEN_PATH, 'utf8'));
  const pack = createContentPack(CANON_CONTENT);
  const { assigned } = assignCanonCommanders(scenario, pack.characters ?? []);
  writeFileSync(SCEN_PATH, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');
  console.log(`canon-801-07: ${assigned}명 사령관 배정(characters[]) + fleet.commander 갱신.`);
}
