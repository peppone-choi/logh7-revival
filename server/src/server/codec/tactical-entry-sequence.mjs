// tactical-entry-sequence.mjs — 전술 진입 시퀀스 방출기 (순수 함수)
//
// 원본 클라가 전술 장면에 들어가려면 월드진입 후 다음 순서의 inner 메시지를 받아야 한다:
//   1. 0x0325 ResponseInformationUnit  — 참가 유닛 로스터(레지스트리 충전)
//   2. 0x0323 ResponseInformationCharacter — 참가 캐릭터(지휘관) 로스터, 유닛당 char>0 이면 1장
//   3. 0x033b TacticsInformationUnitShip — 유닛별 전술 상태/중심 위치레코드(레코드당 52B)
//   4. 0x0f1f NotifyTactics(arg0=1)     — 전술 arm(말미)
//
// ★스킵방지 회귀가드: 클라는 0x033b 각 unitId가 동반 0x0325 unitId와 일치해야 그 유닛을
//   렌더한다(미매칭은 스킵 → 전환 정체). 이 방출기는 0x0325와 0x033b를 동일 units 배열로
//   같은 순서로 생성해 일치를 보장하고, id 없는(0) 유닛은 거부해 스킵을 원천 차단한다.
//
// 새 바이트 포맷을 창작하지 않는다 — 기존 코덱/빌더만 조합한다. 위치 등 미확정 필드는 0.

import {
  buildInformationUnitInner,
  buildInformationCharacterInner,
} from '../logh7-world-records.mjs';
import { buildTacticsInformationUnitShipInner, buildNotifyTacticsInner } from './tactical-position-records.mjs';

/**
 * 전술 진입 시퀀스 방출기.
 *
 * @param {{ units?: Array<{
 *   id:number, character?:number, faction?:number, commander?:number, cell?:number,
 *   owner?:number, boats?:number[], spotResolverBase?:number, mapSection?:number,
 *   morale?:number, confusion?:number, x?:number, y?:number, z?:number, direction?:number,
 *   power?:number, lastname?:string, firstname?:string, face?:number, rank?:number,
 *   abilities?:number[]|null,
 * }> }} params
 * @returns {Buffer[]} inner 메시지 리스트 [0x0325, 0x0323…, 0x033b, 0x0f1f]
 */
export function buildTacticalEntrySequenceInners({ units = [] } = {}) {
  const roster = Array.isArray(units) ? units : [];
  // id 없는(0) 유닛은 클라가 스킵하므로 거부 — 방출 전에 검증(스킵 원천 차단).
  for (const unit of roster) {
    const id = Number(unit?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('tactical entry roster: every unit requires a positive id (client skips id=0)');
    }
  }

  const inners = [];

  // 1. 0x0325 유닛 로스터 (레지스트리 충전). 참가 유닛 순서 그대로.
  inners.push(
    buildInformationUnitInner({
      fleets: roster.map((u) => ({
        id: u.id,
        faction: u.faction ?? 0,
        commander: u.commander ?? 0,
        cell: u.cell ?? 0,
        owner: u.owner ?? 0,
        boats: Array.isArray(u.boats) ? u.boats : [],
        spotResolverBase: u.spotResolverBase ?? 0,
        mapSection: u.mapSection ?? 0,
      })),
    }),
  );

  // 2. 0x0323 캐릭터(지휘관) 로스터. character>0 인 유닛만 1장씩.
  for (const u of roster) {
    const characterId = Number(u.character);
    if (!Number.isInteger(characterId) || characterId <= 0) continue;
    inners.push(
      buildInformationCharacterInner({
        characterId,
        gridUnitId: u.id, // char↔unit 링크 앵커(0x0325 unit[0].id와 일치)
        power: Number.isInteger(u.power) ? u.power : null,
        lastname: u.lastname ?? null,
        firstname: u.firstname ?? null,
        face: Number.isInteger(u.face) ? u.face : null,
        rank: Number.isInteger(u.rank) ? u.rank : null,
        abilities: Array.isArray(u.abilities) ? u.abilities : null,
      }),
    );
  }

  // 3. 0x033b 전술 유닛 상태/중심 위치. 0x0325와 동일 units → unitId 일치 보장.
  //    위치(x/y/z/direction) 등 미확정은 0 유지(날조 금지) — arm 후 battle 엔진이 채운다.
  inners.push(
    buildTacticsInformationUnitShipInner({
      ships: roster.map((u) => ({
        id: u.id,
        morale: u.morale ?? 0,
        confusion: u.confusion ?? 0,
        character: u.character ?? 0,
        x: u.x ?? 0,
        y: u.y ?? 0,
        z: u.z ?? 0,
        direction: u.direction ?? 0,
      })),
    }),
  );

  // 4. 0x0f1f NotifyTactics(arg0=1) — 전술 arm(말미).
  inners.push(buildNotifyTacticsInner({ arg0: 1 }));

  return inners;
}
