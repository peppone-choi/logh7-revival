// logh7-deployment-units.test.mjs — 0x0325 유닛 레지스트리 충전(빈 레지스트리 크래시 해소).
//
// 근거: docs/logh7-init-dialog-crash-re.md (레지스트리 activeCount=0 → 마커 클릭 null-deref).
//   UNIT_ELEM 레이아웃(0x58B, dual-parser proven P0), initial-deployment.json(제국12+동맹12).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getDeploymentFleetUnits,
  buildDeploymentFleetList,
  _resetDeploymentUnitsCache,
  FACTION_EMPIRE,
  FACTION_ALLIANCE,
} from '../src/server/logh7-deployment-units.mjs';
import {
  buildInformationUnitInner,
  buildWorldEntryInners,
  buildGridInitializeSpawnInners,
  msg32Body,
  readMsg32Code,
  CODE_INFO_UNIT,
  CODE_INFO_UNIT_BYTES,
  CODE_INFO_UNIT_HEADER,
  CODE_INFO_UNIT_STRIDE,
  UNIT_ELEM,
} from '../src/server/logh7-world-records.mjs';

const unitBase = (i) => CODE_INFO_UNIT_HEADER + i * CODE_INFO_UNIT_STRIDE;

test('getDeploymentFleetUnits: 제국12+동맹12 실 유닛, 유효 cell, 유니크 id', () => {
  _resetDeploymentUnitsCache();
  const units = getDeploymentFleetUnits();
  assert.equal(units.length, 24, '제국12 + 동맹12 = 24 NPC 함대');
  const empire = units.filter((u) => u.faction === FACTION_EMPIRE);
  const alliance = units.filter((u) => u.faction === FACTION_ALLIANCE);
  assert.equal(empire.length, 12);
  assert.equal(alliance.length, 12);
  // 전부 유효 cell (레지스트리 active 조건 — 0 cell 은 배치좌표 없어 제외됨)
  for (const u of units) {
    assert.ok(Number.isInteger(u.cell) && u.cell > 0, `unit ${u.id} 유효 cell`);
    assert.ok(Number.isInteger(u.id) && u.id > 0, `unit ${u.id} 유효 id`);
  }
  // id 전역 유니크 (레지스트리 키 충돌 없음)
  const ids = new Set(units.map((u) => u.id));
  assert.equal(ids.size, units.length, 'id 충돌 없음');
});

test('buildDeploymentFleetList: 플레이어 unit[0] 앵커 + NPC, id 충돌 제외', () => {
  _resetDeploymentUnitsCache();
  const list = buildDeploymentFleetList({ unitId: 7, cell: 2588, characterId: 42, faction: FACTION_EMPIRE });
  assert.equal(list[0].id, 7, '플레이어가 반드시 unit[0] (flagship 링크 앵커)');
  assert.equal(list[0].cell, 2588);
  assert.equal(list[0].faction, FACTION_EMPIRE);
  assert.equal(list.length, 25, '플레이어 1 + NPC 24');
  // 유니크 id 전체
  const ids = new Set(list.map((u) => u.id));
  assert.equal(ids.size, list.length, '플레이어 포함 id 유니크');
});

test('0x0325 full form: 고정 52804B, count LE == fleets 수, unit[0].id == 앵커', () => {
  const fleets = buildDeploymentFleetList({ unitId: 5, cell: 100, characterId: 9, faction: FACTION_ALLIANCE });
  const inner = buildInformationUnitInner({ unitId: 5, fleets });
  assert.equal(readMsg32Code(inner), CODE_INFO_UNIT);
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_INFO_UNIT_BYTES, '고정 52804B 유지');
  assert.equal(body.readUInt16LE(0), fleets.length, 'count LE == fleets 수 (클라 case 0x325 LE 리드)');
  // unit[0] = 플레이어 (앵커: flagship 링크)
  assert.equal(body.readUInt32BE(unitBase(0) + UNIT_ELEM.ID), 5, 'unit[0].id BE @ +0x04 == unitId');
  assert.equal(body.readUInt32BE(unitBase(0) + UNIT_ELEM.CELL), 100, 'unit[0].cell');
  // unit[1] = 첫 NPC: id/cell/faction 이 레코드 오프셋에 정확히 실림 (active 조건)
  const npc0 = fleets[1];
  assert.equal(body.readUInt32BE(unitBase(1) + UNIT_ELEM.ID), npc0.id, 'unit[1].id BE');
  assert.equal(body.readUInt32BE(unitBase(1) + UNIT_ELEM.CELL), npc0.cell, 'unit[1].cell BE');
  assert.equal(body.readUInt16BE(unitBase(1) + UNIT_ELEM.FACTION), npc0.faction, 'unit[1].faction BE');
  // 마지막 NPC 도 버퍼 안에 있음(24+1=25 records < 600 cap, 52804/0x58≈599)
  const last = fleets.length - 1;
  assert.ok(unitBase(last) + CODE_INFO_UNIT_STRIDE <= body.length, '전 레코드 버퍼 내');
  assert.equal(body.readUInt32BE(unitBase(last) + UNIT_ELEM.ID), fleets[last].id, '마지막 unit.id 방출');
});

test('0x0325 minimal form 회귀: fleets 미지정 시 count+id 만 (byte-identical)', () => {
  const inner = buildInformationUnitInner({ unitId: 5, unitCount: 1, cell: 2588 });
  const body = msg32Body(inner);
  assert.equal(body.length, CODE_INFO_UNIT_BYTES);
  assert.equal(body.readUInt16LE(0), 1, 'count=1 (LE)');
  assert.equal(body.readUInt32BE(4), 5, 'unit[0].id=5');
  // 여분 필드 0 (minimal 은 cell/faction 미방출)
  assert.equal(body.readUInt32BE(unitBase(0) + UNIT_ELEM.CELL), 0, 'minimal: cell 미방출');
  assert.equal(body.readUInt16BE(unitBase(0) + UNIT_ELEM.FACTION), 0, 'minimal: faction 미방출');
});

test('world-enter fleets: 0x0325 unit[0].id == gridUnitId (flagship 링크 유지) + N>1 레코드', () => {
  const fleets = buildDeploymentFleetList({ unitId: 7, cell: 2588, characterId: 42, faction: FACTION_EMPIRE });
  const emits = buildWorldEntryInners({ characterId: 42, gridUnitId: 7, power: 2, spot: 1, fleets });
  const unitRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  const ub = msg32Body(unitRec);
  assert.equal(ub.readUInt16LE(0), fleets.length, 'count > 1 (레지스트리 충전, LE)');
  assert.equal(ub.readUInt32BE(4), 7, 'unit[0].id BE == gridUnitId (링크 앵커)');
});

test('grid-init spawn fleets: 0x0325 가 N개 실 레코드로 레지스트리 충전', () => {
  const fleets = buildDeploymentFleetList({ unitId: 3, cell: 1253, characterId: 11, faction: FACTION_EMPIRE });
  const inners = buildGridInitializeSpawnInners({ characterId: 11, unitId: 3, unitCell: 1253, power: 2, fleets });
  const unitRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  assert.ok(unitRec, '0x0325 present in grid-init spawn');
  const ub = msg32Body(unitRec);
  assert.equal(ub.readUInt16LE(0), fleets.length, 'spawn count == fleets 수 (LE)');
  assert.equal(ub.readUInt32BE(4), 3, 'unit[0].id == unitId');
});
