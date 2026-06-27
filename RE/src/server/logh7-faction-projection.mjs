// 진영(faction) 함대색 서버 투영 — RE 확정 색결정 바이트만 투영하는 순수 헬퍼.
//
// ── RE 확정(2026-06-26, redex 교차검증) ────────────────────────────────────────
// 섹터맵 유닛 렌더러 FUN_004ef0d0이 함대 마커의 아/적 색을 결정한다. 색결정은 **0x0325 함대의
// faction/owner 필드가 아니라** 함대 사령관 캐릭터의 표시테이블(0x9ec stride char-table @clientBase+4)
// 엔트리의 **바이트 +0xa·+0xb** 비교다:
//
//   iVar8  = FUN_004b5b80();                              // 로컬 플레이어 캐릭터 id
//   iVar9  = FUN_004c7fc0(table, iVar8, 1);               // 로컬 플레이어 char-table 엔트리
//   iVar10 = FUN_004c7cd0(table, *(param_2 + 4), 1, ...); // 이 유닛 사령관(param_2+4=commander id)의 엔트리
//   if (iVar10 == 0) return;                              // ★사령관 엔트리 없으면 마커 자체를 안 그린다
//   if (iVar9[+0xa] != iVar10[+0xa] || iVar9[+0xb] != iVar10[+0xb])
//        flag |= 0x1000;   // ENEMY 색
//   else flag |= 0x800;    // FRIENDLY 색
//
// char-table 엔트리(stride 0x9ec, id @+4)의 +0xa/+0xb는 dispatcher case 0x323이 0x0323 캐릭터
// 레코드를 테이블에 적재할 때 채운다. 0x0323 레코드의 power 바이트(@0x04, 陣営/faction)가 이 비교
// 바이트의 권위 출처다(메모리: 0x0325 commander id → char_table 0x0323 power → +0xa/+0xb 동등성=색).
//
// ★투영 함의(이 모듈이 닫는 갭):
//   1. 0x0325 함대를 클라에 push할 때, 그 함대의 **사령관 0x0323 레코드도 같이 push**해야 한다.
//      안 하면 수신 클라의 char-table에 사령관 엔트리가 없어 iVar10==0 → 함대 마커가 아예 안 그려진다.
//   2. 각 함대 사령관의 0x0323 power가 진영별로 distinct해야(제국=1·동맹=2) 아군(같은 power)과
//      적군(다른 power)이 +0xa/+0xb 비교에서 갈려 서로 다른 색으로 렌더된다.
//
// 추측 데이터 P0 승격 금지: 여기서 쓰는 필드는 0x0323 power(@0x04, RE 확정)뿐. 0x34f CardCharacter
// 빌더는 쓰지 않는다(메모리 금지). 와이어 레이아웃은 기존 buildInformationCharacterRecordInner 무변경.

/**
 * 진영 키(또는 power 바이트)를 클라 power 바이트로 정규화한다(제국=1·동맹=2·그 외=3).
 * 이 값이 0x0323 레코드 @0x04로 나가 char-table +0xa/+0xb 색비교의 권위 출처가 된다.
 * @param {string|number|null|undefined} faction
 * @returns {number} 1=제국, 2=동맹, 3=중립/페잔/미상
 */
export function factionPowerByte(faction) {
  if (Number.isInteger(faction)) {
    // 이미 power 바이트면 1/2만 통과, 그 외는 3으로 떨어뜨린다(중립 합류).
    if (faction === 1 || faction === 2) return faction;
    return 3;
  }
  const s = typeof faction === 'string' ? faction.trim().toLowerCase() : '';
  if (s === 'empire' || s === 'imperial' || s === '제국' || s === '帝国') return 1;
  if (s === 'alliance' || s === 'fpa' || s === '동맹' || s === '同盟') return 2;
  return 3; // neutral/phezzan/unknown
}

/**
 * 함대 사령관의 power 바이트를 worldState에서 해석한다. 우선순위:
 *   1) 사령관 캐릭터(getCharacter)의 faction/power → factionPowerByte
 *   2) 함대 자체의 faction(이미 power 바이트로 시드된 경우) → factionPowerByte
 * 둘 다 없으면 3(중립). 색비교는 동등성만 보므로 일관된 매핑이면 충분하다.
 * @param {{ commander?:number, faction?:number|string }} fleet
 * @param {{ getCharacter?: (id:number)=>any }} worldState
 * @returns {number}
 */
export function fleetCommanderPowerByte(fleet, worldState) {
  if (!fleet) return 3;
  const commanderId = Number(fleet.commander) || 0;
  if (commanderId && worldState && typeof worldState.getCharacter === 'function') {
    const ch = worldState.getCharacter(commanderId);
    if (ch) return factionPowerByte(ch.faction ?? ch.power ?? ch.worldPower);
  }
  // 함대 faction이 power 바이트(1/2)로 시드돼 있으면 그것을 권위로(seedPlayerCharacter 경로).
  if (fleet.faction != null) return factionPowerByte(fleet.faction);
  return 3;
}

/**
 * 푸시되는 0x0325 함대 목록에 동반시킬 사령관 0x0323 레코드 입력을 합성한다(색결정 바이트 동반 투영).
 * 각 함대의 distinct 사령관 id마다 1개 레코드 입력을 만들며, characterId=commander id,
 * gridUnitId=fleet.id(0x0323[9]=grid-unit 바인딩), power=사령관 power 바이트(색결정 출처).
 * 호출부가 이 입력들을 buildInformationCharacterRecordInner로 빌드해 함대 inner와 같은 프레임/시퀀스로
 * 수신 클라에 push하면, 클라 char-table에 사령관 엔트리(+0xa/+0xb)가 생겨 마커가 그려지고 색이 갈린다.
 *
 * @param {Array<{ id:number, commander?:number, faction?:number|string }>} fleets
 * @param {{ getCharacter?: (id:number)=>any }} worldState
 * @param {(id:number)=>(string|null)} [displayNameOf] 사령관 표시명 해석기(옵션, HUD 폴백 방지용)
 * @returns {Array<{ characterId:number, gridUnitId:number, power:number, lastname?:string, displayName?:string }>}
 */
export function projectFleetCommanderRecords(fleets, worldState, displayNameOf = null) {
  const list = Array.isArray(fleets) ? fleets : [];
  const seen = new Set();
  const out = [];
  for (const fleet of list) {
    const commanderId = Number(fleet?.commander) || 0;
    if (!commanderId || seen.has(commanderId)) continue;
    seen.add(commanderId);
    const power = fleetCommanderPowerByte(fleet, worldState);
    const rec = {
      characterId: commanderId,
      gridUnitId: Number(fleet.id) || 0,
      power,
      camp: power, // 0x0323 @0x05 camp 바이트도 진영과 일치시켜 HUD 정합 유지.
    };
    const name = typeof displayNameOf === 'function' ? displayNameOf(commanderId) : null;
    if (name) {
      rec.lastname = name;
      rec.displayName = name;
    }
    out.push(rec);
  }
  return out;
}
