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
} from '../src/server/logh7-world-records.mjs';

function decodeInformationUnitsLikeFun419ca0(body) {
  const count = body.readUInt16BE(0);
  const rows = [];
  let cursor = 2;
  for (let index = 0; index < count; index += 1) {
    const wireStart = cursor;
    const id = body.readUInt32BE(cursor); cursor += 4;
    const faction = body.readUInt16BE(cursor); cursor += 2;
    cursor += 1; // native +0x06
    const commander = body.readUInt32BE(cursor); cursor += 4;
    const cell = body.readUInt32BE(cursor); cursor += 4;
    const owner = body.readUInt32BE(cursor); cursor += 4;
    const boatsCount = body.readUInt8(cursor); cursor += 1;
    assert.ok(boatsCount <= 10, `row ${index} boats count cap`);
    const boats = [];
    for (let boatIndex = 0; boatIndex < boatsCount; boatIndex += 1) {
      boats.push(body.readUInt32BE(cursor));
      cursor += 4;
    }
    const spotResolverBase = body.readUInt32BE(cursor); cursor += 4;
    cursor += 1 + 1 + 2;
    const mapSection = body.readUInt16BE(cursor); cursor += 2;
    cursor += 4 + 4 + 4;
    rows.push({
      wireStart,
      wireEnd: cursor,
      id,
      faction,
      commander,
      cell,
      owner,
      boats,
      spotResolverBase,
      mapSection,
    });
  }
  return { count, rows, cursor };
}

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

test('buildDeploymentFleetList: env와 무관하게 player native +0x08은 cell이고 NPC commander는 0이다', () => {
  const previous = process.env.LOGH_PLAYER_FOCUS_CELL;
  const bodies = [];
  try {
    for (const value of [undefined, '0', '1']) {
      if (value === undefined) delete process.env.LOGH_PLAYER_FOCUS_CELL;
      else process.env.LOGH_PLAYER_FOCUS_CELL = value;
      const fleets = buildDeploymentFleetList({
        unitId: 7,
        cell: 2588,
        characterId: 42,
        faction: FACTION_ALLIANCE,
      });
      const label = `LOGH_PLAYER_FOCUS_CELL=${value ?? 'unset'}`;
      assert.equal(fleets[0].commander, 2588, `${label}: player current-cell source`);
      assert.equal(fleets[0].cell, 2588, `${label}: player location`);
      assert.equal(fleets[0].owner, 42, `${label}: character identity stays in owner`);
      assert.ok(fleets.slice(1).every((fleet) => fleet.commander === 0), `${label}: NPC commander remains unknown/zero`);

      const body = msg32Body(buildInformationUnitInner({ unitId: 7, fleets }));
      const decoded = decodeInformationUnitsLikeFun419ca0(body);
      assert.equal(decoded.rows[0].commander, 2588, `${label}: serialized native +0x08`);
      assert.equal(decoded.rows[0].cell, 2588, `${label}: serialized native +0x0c`);
      bodies.push(body);
    }
    assert.deepEqual(bodies[1], bodies[0], 'env=0 cannot change 0x0325 bytes');
    assert.deepEqual(bodies[2], bodies[0], 'env=1 cannot change 0x0325 bytes');
  } finally {
    if (previous === undefined) delete process.env.LOGH_PLAYER_FOCUS_CELL;
    else process.env.LOGH_PLAYER_FOCUS_CELL = previous;
  }
});

test('0x0325 full form: 고정 52804B에서 전체 함대를 compact cursor로 연속 디코드한다', () => {
  const fleets = buildDeploymentFleetList({ unitId: 5, cell: 100, characterId: 9, faction: FACTION_ALLIANCE });
  const inner = buildInformationUnitInner({ unitId: 5, fleets });
  assert.equal(readMsg32Code(inner), CODE_INFO_UNIT);
  const body = msg32Body(inner);
  const decoded = decodeInformationUnitsLikeFun419ca0(body);
  assert.equal(body.length, CODE_INFO_UNIT_BYTES, '고정 52804B 유지');
  assert.equal(body.readUInt16BE(0), fleets.length, 'count BE == fleets 수');
  // unit[0] = 플레이어 (앵커: flagship 링크)
  assert.equal(decoded.rows[0].id, 5, 'decoded unit[0].id == unitId');
  assert.equal(decoded.rows[0].cell, 100, 'decoded unit[0].cell');
  // unit[1] = 첫 NPC: id/cell/faction이 클라이언트 cursor 모델에서 정확히 복원된다.
  const npc0 = fleets[1];
  assert.equal(decoded.rows[1].id, npc0.id, 'decoded unit[1].id');
  assert.equal(decoded.rows[1].cell, npc0.cell, 'decoded unit[1].cell');
  assert.equal(decoded.rows[1].faction, npc0.faction, 'decoded unit[1].faction');
  assert.equal(decoded.rows[1].wireStart, decoded.rows[0].wireEnd, 'NPC row starts at the prior row cursor');
  // 마지막 NPC도 고정 body 안에서 동일 cursor 계약으로 복원된다.
  const last = fleets.length - 1;
  assert.ok(decoded.cursor <= body.length, '전 레코드 버퍼 내');
  assert.equal(decoded.rows[last].id, fleets[last].id, '마지막 decoded unit.id');
});

test('0x0325 minimal form도 full parser가 소비할 한 행 전체를 compact wire로 보낸다', () => {
  const inner = buildInformationUnitInner({ unitId: 5, unitCount: 1, cell: 2588 });
  const body = msg32Body(inner);
  const decoded = decodeInformationUnitsLikeFun419ca0(body);
  assert.equal(body.length, CODE_INFO_UNIT_BYTES);
  assert.equal(body.readUInt16BE(0), 1, 'count=1 (BE)');
  assert.deepEqual(
    {
      id: decoded.rows[0].id,
      faction: decoded.rows[0].faction,
      commander: decoded.rows[0].commander,
      cell: decoded.rows[0].cell,
      owner: decoded.rows[0].owner,
    },
    { id: 5, faction: 0, commander: 0, cell: 2588, owner: 0 },
  );
  assert.equal(decoded.rows[0].wireStart, 2);
  assert.equal(decoded.rows[0].wireEnd, 44);
});

test('world-enter fleets: 0x0325 unit[0].id == gridUnitId (flagship 링크 유지) + N>1 레코드', () => {
  const fleets = buildDeploymentFleetList({ unitId: 7, cell: 2588, characterId: 42, faction: FACTION_EMPIRE });
  const emits = buildWorldEntryInners({ characterId: 42, gridUnitId: 7, power: 2, spot: 1, fleets });
  const unitRec = emits.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  const ub = msg32Body(unitRec);
  const decoded = decodeInformationUnitsLikeFun419ca0(ub);
  assert.equal(decoded.count, fleets.length, 'count > 1 (레지스트리 충전, BE)');
  assert.equal(decoded.rows[0].id, 7, 'decoded unit[0].id == gridUnitId (링크 앵커)');
});

test('grid-init spawn fleets: 0x0325 가 N개 실 레코드로 레지스트리 충전', () => {
  const fleets = buildDeploymentFleetList({ unitId: 3, cell: 1253, characterId: 11, faction: FACTION_EMPIRE });
  const inners = buildGridInitializeSpawnInners({ characterId: 11, unitId: 3, unitCell: 1253, power: 2, fleets });
  const unitRec = inners.find((i) => readMsg32Code(i) === CODE_INFO_UNIT);
  assert.ok(unitRec, '0x0325 present in grid-init spawn');
  const ub = msg32Body(unitRec);
  const decoded = decodeInformationUnitsLikeFun419ca0(ub);
  assert.equal(decoded.count, fleets.length, 'spawn count == fleets 수 (BE)');
  assert.equal(decoded.rows[0].id, 3, 'decoded unit[0].id == unitId');
});
