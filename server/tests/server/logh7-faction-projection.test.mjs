// 진영(faction) 함대색 서버 투영 오라클 — RE 확정 색결정 바이트(0x0323 power @0x04, char-table +0xa/+0xb의
// 출처)가 함대별 사령관 진영에 맞게 투영되는지 검증한다.
//
// RE(redex 2026-06-26): 섹터맵 렌더러 FUN_004ef0d0이 유닛 사령관(param_2+4)의 char-table 엔트리 +0xa/+0xb를
// 로컬 플레이어 엔트리와 비교 — 다르면 ENEMY 색(flag|0x1000), 같으면 FRIENDLY(flag|0x800). 사령관 엔트리가
// 없으면(iVar10==0) 마커 자체를 안 그린다. char-table +0xa/+0xb의 권위 출처 = 0x0323 레코드 power 바이트(@0x04).
// 따라서 서버 오라클은 (1)함대 push에 사령관 0x0323 레코드가 동반되고 (2)그 power가 진영별로 distinct함을 단언한다.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  factionPowerByte,
  fleetCommanderPowerByte,
  projectFleetCommanderRecords,
} from '../../src/server/logh7-faction-projection.mjs';
import { buildInformationCharacterRecordInner } from '../../src/server/logh7-login-protocol.mjs';
import { createWorldState } from '../../src/server/logh7-world-state.mjs';

// 0x0323 레코드 inner에서 power 바이트(@payload+0x04, 색결정 출처)를 디코드한다.
function decodePowerByte(inner) {
  assert.equal(inner.readUInt16BE(4), 0x0323, '0x0323 ResponseInformationCharacter 코드');
  return inner.subarray(6).readUInt8(0x04);
}
function decodeCharId(inner) {
  // characterId @payload+0x00 (wireEndian 'be').
  return inner.subarray(6).readUInt32BE(0x00);
}
function decodeGridUnitId(inner) {
  // gridUnitId @payload+0x24 (wireEndian 'be').
  return inner.subarray(6).readUInt32BE(0x24);
}

test('factionPowerByte: 진영 키/바이트를 클라 power 바이트로 정규화(제국=1·동맹=2·그 외=3)', () => {
  assert.equal(factionPowerByte('empire'), 1);
  assert.equal(factionPowerByte('alliance'), 2);
  assert.equal(factionPowerByte('제국'), 1);
  assert.equal(factionPowerByte('동맹'), 2);
  assert.equal(factionPowerByte('neutral'), 3);
  assert.equal(factionPowerByte('phezzan'), 3);
  assert.equal(factionPowerByte(1), 1, '이미 power 바이트면 통과');
  assert.equal(factionPowerByte(2), 2);
  assert.equal(factionPowerByte(0), 3, '미상 → 중립');
  assert.equal(factionPowerByte(null), 3);
});

test('fleetCommanderPowerByte: 사령관 캐릭터 진영을 worldState에서 해석(없으면 함대 faction 폴백)', () => {
  const worldState = createWorldState();
  worldState.upsertCharacter({ id: 101, faction: 'empire' });
  worldState.upsertCharacter({ id: 202, faction: 'alliance' });

  // 1) 사령관 캐릭터 진영이 권위.
  assert.equal(fleetCommanderPowerByte({ commander: 101, faction: 99 }, worldState), 1, '제국 사령관 → 1');
  assert.equal(fleetCommanderPowerByte({ commander: 202, faction: 99 }, worldState), 2, '동맹 사령관 → 2');
  // 2) 사령관 캐릭터가 없으면 함대 faction 바이트로 폴백.
  assert.equal(fleetCommanderPowerByte({ commander: 999, faction: 2 }, worldState), 2, '미등록 사령관 → 함대 faction');
  // 3) 둘 다 없으면 중립.
  assert.equal(fleetCommanderPowerByte({ commander: 0 }, worldState), 3);
});

test('★오라클: 아군(제국) vs 적군(동맹) 함대 사령관이 distinct 색결정 바이트를 갖는다', () => {
  const worldState = createWorldState();
  worldState.upsertCharacter({ id: 101, faction: 'empire' });   // 아군 사령관
  worldState.upsertCharacter({ id: 202, faction: 'alliance' }); // 적군 사령관

  const fleets = [
    { id: 0xa001, commander: 101, faction: 1 }, // 제국 함대
    { id: 0xb002, commander: 202, faction: 2 }, // 동맹 함대
  ];
  const projected = projectFleetCommanderRecords(fleets, worldState);
  assert.equal(projected.length, 2, '함대마다 사령관 레코드 1개');

  // 빌더로 실제 0x0323 inner를 만들어 power 바이트(@0x04, char-table +0xa/+0xb 출처)를 디코드.
  const inners = projected.map((r) => buildInformationCharacterRecordInner({ ...r, wireEndian: 'be' }));
  const byId = new Map(inners.map((inner) => [decodeCharId(inner), inner]));

  const empirePower = decodePowerByte(byId.get(101));
  const alliancePower = decodePowerByte(byId.get(202));
  assert.equal(empirePower, 1, '제국 사령관 0x0323 power=1');
  assert.equal(alliancePower, 2, '동맹 사령관 0x0323 power=2');
  // ★핵심 단언: 진영이 다르면 색결정 바이트가 distinct → 클라가 +0xa/+0xb 비교에서 아/적 색을 가른다.
  assert.notEqual(empirePower, alliancePower, '아군 vs 적군 함대 = 다른 색결정 바이트');

  // 같은 진영(제국 2함대)이면 색결정 바이트가 동일 → 둘 다 아군색.
  worldState.upsertCharacter({ id: 102, faction: 'empire' });
  const sameFaction = projectFleetCommanderRecords(
    [{ id: 0xa001, commander: 101, faction: 1 }, { id: 0xa003, commander: 102, faction: 1 }],
    worldState,
  ).map((r) => buildInformationCharacterRecordInner({ ...r, wireEndian: 'be' }));
  assert.equal(decodePowerByte(sameFaction[0]), decodePowerByte(sameFaction[1]), '같은 진영 = 같은 색결정 바이트');
});

test('투영 레코드는 gridUnitId=fleet.id로 0x0323[9] grid-unit 바인딩을 유지한다', () => {
  const worldState = createWorldState();
  worldState.upsertCharacter({ id: 101, faction: 'empire' });
  const [rec] = projectFleetCommanderRecords([{ id: 0xa001, commander: 101, faction: 1 }], worldState);
  const inner = buildInformationCharacterRecordInner({ ...rec, wireEndian: 'be' });
  assert.equal(decodeCharId(inner), 101, 'characterId=commander id');
  assert.equal(decodeGridUnitId(inner), 0xa001, 'gridUnitId=fleet.id(char+0x24 바인딩)');
});

test('중복 사령관·미등록 사령관은 distinct id만 1회씩 투영(중복 push 방지)', () => {
  const worldState = createWorldState();
  worldState.upsertCharacter({ id: 101, faction: 'empire' });
  const records = projectFleetCommanderRecords(
    [
      { id: 1, commander: 101, faction: 1 },
      { id: 2, commander: 101, faction: 1 }, // 같은 사령관 중복
      { id: 3, commander: 0 },               // 사령관 없음 → 건너뜀
    ],
    worldState,
  );
  assert.equal(records.length, 1, 'distinct 사령관 1명만');
  assert.equal(records[0].characterId, 101);
});
