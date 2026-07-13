// logh7-deployment-units.mjs — 초기 배치 시드 → 0x0325 유닛 레코드 입력
//
// 근거:
//   docs/logh7-init-dialog-crash-re.md — 클라 유닛 레지스트리(@0x7db3c8, stride 0xb4c, active@+0,
//     id@+4)가 activeCount=0 이면 마커/렌더오브젝트 클릭이 FUN_004c96c0 미스→FUN_004c9a80 null
//     deref 로 팅긴다. 서버가 0x0325 를 count 만 보내고 실 레코드를 안 채우는 게 원인.
//   server/src/server/logh7-world-records.mjs UNIT_ELEM (0x58B 레코드, dual-parser proven P0 레이아웃).
//   server/data/seed/initial-deployment.json — 제국12 + 동맹12 초기 함대(각 실 cell, system 해석됨).
//   server/data/seed/factions.json — powerId(제국=2, 동맹=3, character-codec 정본).
//
// 데이터 정직성: cell·faction 은 시드 정본. id 는 시드에 전역 유닛 id 가 없어(per-faction unit index
// 1..12 만 존재) 여기서 전역 유니크 키를 합성한다 — 레지스트리 키일 뿐 캐논 게임 데이터 아님.
// NPC commander/owner/boats/mapSection 은 근거 없어 0(날조 금지, 슬롯만 예약).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SEED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'seed');

// powerId (factions.json 정본, character-codec 2=제국/3=동맹). 유닛 레코드 faction 필드(@+0x04).
export const FACTION_EMPIRE = 2;
export const FACTION_ALLIANCE = 3;

// 전역 유니크 유닛 id 합성 베이스(레지스트리 키 전용). 플레이어 flagship(작은 캐릭터 id)과
// 충돌하지 않도록 높은 범위. 제국/동맹을 서로 다른 베이스로 분리해 per-faction index 충돌 방지.
export const EMPIRE_UNIT_ID_BASE = 0x1000; // 제국 함대 n → 0x1000 + n
export const ALLIANCE_UNIT_ID_BASE = 0x2000; // 동맹 함대 n → 0x2000 + n

let cache = null;

function loadJson(...rel) {
  return JSON.parse(readFileSync(join(SEED_DIR, ...rel), 'utf8'));
}

function mapFactionFleet(fleet, faction, idBase, out) {
  const list = Array.isArray(fleet) ? fleet : [];
  for (const f of list) {
    const unitNo = Number(f?.unit);
    const cell = Number(f?.cell);
    // cell 미해석(요새/미등재 지점)은 배치 좌표가 없어 스킵 — 레지스트리 엔트리는 유효 cell 만.
    if (!Number.isInteger(unitNo) || unitNo <= 0 || !Number.isInteger(cell) || cell <= 0) continue;
    out.push({
      id: (idBase + unitNo) >>> 0, // 전역 유니크 키(합성)
      cell: cell >>> 0, // 시드 정본 (row*100+col)
      faction, // 시드 정본 powerId
      owner: 0,
      commander: 0,
    });
  }
}

/**
 * 초기 배치 NPC 유닛 목록(제국+동맹 함대). 메모이즈.
 * 각 원소: { id(유니크 키), cell(정본), faction(정본), owner:0, commander:0 }.
 * @returns {Array<{id:number, cell:number, faction:number, owner:number, commander:number}>}
 */
export function getDeploymentFleetUnits() {
  if (cache) return cache;
  const dep = loadJson('initial-deployment.json');
  const out = [];
  mapFactionFleet(dep?.imperial?.fleet, FACTION_EMPIRE, EMPIRE_UNIT_ID_BASE, out);
  mapFactionFleet(dep?.alliance?.fleet, FACTION_ALLIANCE, ALLIANCE_UNIT_ID_BASE, out);
  cache = out;
  return cache;
}

/**
 * 0x0325 유닛 레코드용 전체 fleets 목록 조립: 플레이어 유닛[0] + NPC 배치 함대.
 *
 * ★플레이어는 반드시 unit[0] (id=gridUnitId). 클라 char↔unit 링크(FUN_004c2a80)가
 *   0x0323 flagship(wire@0x20→struct@0x24) == 0x0325 unit[0].id(wire@0x02→struct@0x00) 를 요구하므로 앵커 순서 고정.
 * NPC id 가 플레이어 id 와 겹치면 NPC 를 제외(플레이어 우선).
 *
 * ★player native +0x08은 이름과 달리 이 경로에서 실제 캐릭터 지휘관 ID가 아니다. FUN_004c2c80이
 *   source+0x320으로 복사하고 FUN_004c4170이 currentRaw11178로 전달한다. B53 라이브에서 +0x08=2588일 때
 *   자연 SendWarp가 성공했고, B54에서 +0x08=characterId(1)이면 currentRaw11178=1/sendWarp=0이었다.
 *   따라서 player에는 current cell을 투영하고 캐릭터 ID는 owner와 0x0323에만 둔다. NPC는 근거가 없어 0 유지.
 *
 * @param {{ unitId:number, cell?:number, characterId?:number, faction?:number, spotResolverBase?:number }} player
 * @returns {Array<{id:number, cell:number, faction:number, owner:number, commander:number, spotResolverBase?:number}>}
 */
export function buildDeploymentFleetList(player = {}) {
  const unitId = Number(player.unitId) >>> 0;
  const playerCell = Number.isInteger(player.cell) ? player.cell >>> 0 : 0;
  const playerUnit = {
    id: unitId,
    cell: playerCell,
    faction: Number.isInteger(player.faction) ? player.faction : 0,
    owner: Number.isInteger(player.characterId) ? player.characterId >>> 0 : 0,
    commander: playerCell,
    spotResolverBase: Number.isInteger(player.spotResolverBase) ? player.spotResolverBase >>> 0 : 0,
  };
  const npc = getDeploymentFleetUnits().filter((u) => u.id !== unitId);
  return [playerUnit, ...npc];
}

/** 테스트/재시드용 캐시 무효화. */
export function _resetDeploymentUnitsCache() {
  cache = null;
}
