import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';

test('world state tracks players join/leave', () => {
  const s = createWorldState();
  assert.equal(s.playerCount(), 0);
  s.addPlayer({ connectionId: 6, charId: 0x01000000, powerId: 0x500 });
  s.addPlayer({ connectionId: 7, charId: 0x01000001, powerId: 0x501 });
  assert.equal(s.playerCount(), 2);
  assert.equal(s.getPlayer(6).powerId, 0x500);
  assert.ok(s.hasPlayer(7));
  s.removePlayer(6);
  assert.equal(s.playerCount(), 1);
  assert.equal(s.getPlayer(6), null);
});

test('world state upserts and moves ships authoritatively', () => {
  const s = createWorldState();
  s.upsertShip({ id: 42, owner: 6, x: 0, y: 0, z: 0, heading: 0 });
  const moved = s.moveShip(42, { x: 10, y: 20, z: 0, moveParam: 3 });
  assert.equal(moved.x, 10);
  assert.equal(moved.y, 20);
  assert.equal(s.getShip(42).x, 10);
  const turned = s.turnShip(42, { heading: 90 });
  assert.equal(turned.heading, 90);
  assert.equal(s.moveShip(999, { x: 1 }), null); // unknown ship
  assert.equal(s.turnShip(999, { heading: 1 }), null);
});

test('world state claims and releases ship ownership', () => {
  const s = createWorldState();
  s.upsertShip({ id: 1, owner: 0 });
  s.upsertShip({ id: 2, owner: 0 });
  s.claimShip(1, 6);
  s.claimShip(2, 6);
  assert.equal(s.getShip(1).owner, 6);
  assert.equal(s.getShip(2).owner, 6);
  s.releaseShipsOf(6);
  assert.equal(s.getShip(1).owner, 0);
  assert.equal(s.getShip(2).owner, 0);
  assert.equal(s.claimShip(999, 6), null);
});

test('world state appends chat log', () => {
  const s = createWorldState();
  s.appendChat({ connectionId: 6, charId: 1, text: 'hi', channel: 0, time: 0 });
  assert.equal(s.chatCount(), 1);
  assert.equal(s.listChat()[0].text, 'hi');
});

test('world state seeds strategic systems with canon ownership and supports conquest', () => {
  const s = createWorldState();
  const seeded = s.seedSystems([
    { name: 'イゼルローン', faction: 'empire', isCorridor: true, fortresses: ['イゼルローン'], planets: [] },
    { name: 'バーラト', faction: 'alliance', planets: [{ name: 'ハイネセン', orbit: 3 }] },
  ]);
  assert.equal(seeded, 2);
  assert.equal(s.systemCount(), 2);
  const barlat = s.getSystem('バーラト');
  assert.equal(barlat.owner, 'alliance');
  assert.equal(barlat.planets[0].name, 'ハイネセン');
  assert.equal(barlat.planets[0].owner, 'alliance'); // planets inherit the system's canon owner
  // conquest: ownership transfer
  s.setSystemOwner('イゼルローン', 'alliance');
  assert.equal(s.getSystem('イゼルローン').owner, 'alliance');
  assert.equal(s.setSystemOwner('nowhere', 'empire'), null);
});

test('world state computes per-faction strategic summary (nation record fields)', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'ヴァルハラ', faction: 'empire', fortresses: [], planets: [{ name: 'オーディン', orbit: 2 }, { name: 'ゾースト', orbit: 1 }] },
    { name: 'イゼルローン', faction: 'empire', fortresses: ['イゼルローン'], planets: [] },
    { name: 'バーラト', faction: 'alliance', fortresses: [], planets: [{ name: 'ハイネセン', orbit: 3 }] },
  ]);
  const sum = s.factionSummary();
  assert.equal(sum.empire.controlledSystems, 2);
  assert.equal(sum.empire.controlledPlanets, 2);     // Odin + Zoost
  assert.equal(sum.empire.controlledFortresses, 1);  // Iserlohn
  assert.equal(sum.alliance.controlledSystems, 1);
  assert.equal(sum.alliance.controlledPlanets, 1);   // Heinessen
});

test('seedSystems preserves planet population and economy metadata', () => {
  const s = createWorldState();
  s.seedSystems([
    {
      name: 'バーラト',
      faction: 'alliance',
      planets: [
        {
          name: 'ハイネセン',
          orbit: 3,
          population: 54000000,
          food: 1200,
          industry: 800,
          taxBase: 54000,
          taxRate: 0.12,
          approval: 91,
          security: 88,
          habitable: true,
          inferredPosition: { x: 0.25, y: 0.5 },
        },
      ],
    },
  ]);

  const barlat = s.getSystem('バーラト');
  assert.equal(barlat.planets[0].population, 54000000);
  assert.equal(barlat.planets[0].food, 1200);
  assert.equal(barlat.planets[0].industry, 800);
  assert.equal(barlat.planets[0].taxBase, 54000);
  assert.equal(barlat.planets[0].taxRate, 0.12);
  assert.equal(barlat.planets[0].approval, 91);
  assert.equal(barlat.planets[0].security, 88);
  assert.equal(barlat.planets[0].habitable, true);
  assert.deepEqual(barlat.planets[0].inferredPosition, { x: 0.25, y: 0.5 });
  assert.equal(s.factionSummary().alliance.totalPopulation, 54000000);
});

test('conquering a system transfers it and all its planets to the conqueror', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'バーラト', faction: 'alliance', fortresses: [], planets: [{ name: 'ハイネセン', orbit: 3 }, { name: 'テルヌーゼン', orbit: 1 }] },
  ]);
  const taken = s.conquerSystem('バーラト', 'empire');
  assert.equal(taken.owner, 'empire');
  assert.ok(taken.planets.every((p) => p.owner === 'empire'), 'all planets transferred');
  const sum = s.factionSummary();
  assert.equal(sum.empire.controlledSystems, 1);
  assert.equal(sum.empire.controlledPlanets, 2);
  assert.equal(sum.alliance, undefined); // Alliance lost everything
  assert.equal(s.conquerSystem('nowhere', 'empire'), null);
});

// ===========================================================================
// GAP A: upsertShip populates 6-direction shield arrays and beam-gun fields
// so that 0x341 FillShield and 0x343 FillBeamGun wire records carry non-zero values.
// ===========================================================================
test('upsertShip: cruiser has non-zero shieldMax[6] and shieldFill[6] at full charge', () => {
  const s = createWorldState();
  const ship = s.upsertShip({ id: 1, shipClass: 'cruiser' });
  assert.ok(Array.isArray(ship.shieldMax), 'shieldMax is an array');
  assert.equal(ship.shieldMax.length, 6, 'shieldMax has 6 elements');
  assert.ok(Array.isArray(ship.shieldFill), 'shieldFill is an array');
  assert.equal(ship.shieldFill.length, 6, 'shieldFill has 6 elements');
  for (let k = 0; k < 6; k += 1) {
    assert.ok(ship.shieldMax[k] > 0, `shieldMax[${k}] non-zero`);
    assert.ok(ship.shieldFill[k] > 0, `shieldFill[${k}] non-zero`);
    assert.equal(ship.shieldMax[k], ship.shieldFill[k], `shieldFill[${k}] = shieldMax[${k}] at full charge`);
  }
  // cruiser maxShield=600, 6 dirs => perDir=100
  assert.equal(ship.shieldMax[0], 100, 'cruiser perDir shield = 100');
});

test('upsertShip: flagship has non-zero shieldMax[6] scaled from class maxShield', () => {
  const s = createWorldState();
  const ship = s.upsertShip({ id: 2, shipClass: 'flagship' });
  // flagship maxShield=1400, perDir=233 (rounded)
  assert.ok(ship.shieldMax[0] > 0, 'flagship shieldMax[0] non-zero');
  assert.equal(ship.shieldMax[0], Math.round(1400 / 6), 'flagship perDir shield');
});

test('upsertShip: beamgunA/fillA/beamgunB/fillB are non-zero and derived from beamPower', () => {
  const s = createWorldState();
  const ship = s.upsertShip({ id: 3, shipClass: 'cruiser' });
  // cruiser beamPower=220
  assert.ok(ship.beamgunA > 0, 'beamgunA non-zero');
  assert.ok(ship.fillA > 0, 'fillA non-zero');
  assert.ok(ship.beamgunB > 0, 'beamgunB non-zero');
  assert.ok(ship.fillB > 0, 'fillB non-zero');
  assert.equal(ship.beamgunA, 220, 'beamgunA = beamPower');
  assert.equal(ship.fillA, 220, 'fillA = beamPower (full charge)');
  assert.equal(ship.beamgunB, 110, 'beamgunB = beamPower/2');
  assert.equal(ship.fillB, 110, 'fillB = beamPower/2 (full charge)');
});

test('upsertShip: existing scalar shield/armor/zanki pools unaffected by new array fields', () => {
  const s = createWorldState();
  const ship = s.upsertShip({ id: 4, shipClass: 'battleship' });
  // Scalar shield still present for applyDamage
  assert.ok(typeof ship.shield === 'number', 'scalar shield is a number');
  assert.equal(ship.shield, ship.maxShield, 'scalar shield starts at maxShield');
  assert.ok(typeof ship.armor === 'number', 'armor is a number');
  assert.ok(typeof ship.zanki === 'number', 'zanki is a number');
});

// ===========================================================================
// A2: strategic fleet entity {id, owner, faction, commander, cell, boats[], supply, mapSection}
// — the authoritative source that feeds the A1 0x0325 unit-table builder.
// These tests prove the ENTITY SHAPE/behavior; the wire-layout proof lives in the login-protocol
// test. Field VALUES are P3 seeds; only the entity contract is exercised here.
// ===========================================================================
test('A2: upsertFleet creates a fleet entity with the full strategic field set', () => {
  const s = createWorldState();
  assert.equal(s.fleetCount(), 0);
  const fleet = s.upsertFleet({
    id: 1, owner: 6, faction: 0x500, commander: 209, cell: 2010,
    boats: [11, 12, 13], supply: 80, mapSection: 4,
  });
  assert.equal(fleet.id, 1);
  assert.equal(fleet.owner, 6);
  assert.equal(fleet.faction, 0x500);
  assert.equal(fleet.commander, 209);
  assert.equal(fleet.cell, 2010);
  assert.deepEqual(fleet.boats, [11, 12, 13]);
  assert.equal(fleet.supply, 80);
  assert.equal(fleet.mapSection, 4);
  assert.equal(s.fleetCount(), 1);
  assert.equal(s.getFleet(1).commander, 209);
});

test('A2: upsertFleet defaults are all zero/empty (no fabricated content)', () => {
  const s = createWorldState();
  const fleet = s.upsertFleet({ id: 7 });
  assert.equal(fleet.owner, 0);
  assert.equal(fleet.faction, 0);
  assert.equal(fleet.commander, 0);
  assert.equal(fleet.cell, 0);
  assert.deepEqual(fleet.boats, []);
  assert.equal(fleet.supply, 0);
  assert.equal(fleet.mapSection, 0);
});

test('A2: upsertFleet caps the boats list at the client troop_units parser limit (10)', () => {
  const s = createWorldState();
  const boats = Array.from({ length: 15 }, (_, i) => 100 + i);
  const fleet = s.upsertFleet({ id: 2, boats });
  assert.equal(fleet.boats.length, 10, 'boats capped at 10 (parser "troop_units_size > 10")');
  assert.deepEqual(fleet.boats, boats.slice(0, 10));
});

test('A2: listFleets / moveFleet / removeFleet manage the strategic fleet set', () => {
  const s = createWorldState();
  s.upsertFleet({ id: 1, cell: 100 });
  s.upsertFleet({ id: 2, cell: 200 });
  assert.equal(s.listFleets().length, 2);
  const moved = s.moveFleet(1, 555);
  assert.equal(moved.cell, 555);
  assert.equal(s.getFleet(1).cell, 555);
  assert.equal(s.moveFleet(999, 1), null, 'moving an unknown fleet returns null');
  assert.equal(s.removeFleet(1), true);
  assert.equal(s.getFleet(1), null);
  assert.equal(s.fleetCount(), 1);
});

test('A2: upsertFleet replaces an existing fleet with the same id', () => {
  const s = createWorldState();
  s.upsertFleet({ id: 1, cell: 100, supply: 10 });
  s.upsertFleet({ id: 1, cell: 200, supply: 90 });
  assert.equal(s.fleetCount(), 1, 'same id replaces, not appends');
  assert.equal(s.getFleet(1).cell, 200);
  assert.equal(s.getFleet(1).supply, 90);
});

// --- A7: scenario / session meta ---
test('A7: getScenarioInfo는 계약 형태를 반환하고 setScenarioInfo가 부분 갱신한다', () => {
  const s = createWorldState();
  // 기본 = 미설정
  const def = s.getScenarioInfo();
  assert.equal(def.sessionName, '');
  assert.equal(def.currentTurn, 0);
  assert.deepEqual(def.powers, []);
  s.setScenarioInfo({
    sessionName: '銀河英雄伝説VII',
    startYear: 796,
    currentTurn: 0,
    term: 0,
    ending: 0,
    powers: [
      { powerId: 0x500, faction: 'empire', superMan: 0x01000000 },
      { powerId: 0x501, faction: 'alliance', superMan: 0x01000001 },
    ],
  });
  const info = s.getScenarioInfo();
  assert.equal(info.sessionName, '銀河英雄伝説VII');
  assert.equal(info.startYear, 796);
  assert.equal(info.powers.length, 2);
  assert.equal(info.powers[0].superMan, 0x01000000);
  // 부분 갱신은 기존 필드를 보존한다
  assert.equal(s.advanceTurn(), 1);
  assert.equal(s.advanceTurn(2), 3);
  s.setScenarioInfo({ term: 5 });
  const info2 = s.getScenarioInfo();
  assert.equal(info2.term, 5);
  assert.equal(info2.sessionName, '銀河英雄伝説VII', '부분 갱신 시 sessionName 보존');
  assert.equal(info2.currentTurn, 3, '부분 갱신 시 currentTurn 보존');
  assert.equal(s.setEnding(2), 2);
  assert.equal(s.getScenarioInfo().ending, 2);
  // 반환된 powers는 복사본(결과 변경이 상태에 영향 없어야)
  info2.powers[0].superMan = 999;
  assert.equal(s.getScenarioInfo().powers[0].superMan, 0x01000000);
});

// --- A7: snapshot / restore 라운드트립 ---
test('A7: toSnapshot/restore가 fleets·scenario·systems·players를 왕복한다', () => {
  const s = createWorldState();
  s.addPlayer({ connectionId: 6, charId: 0x01000000, powerId: 0x500 });
  s.upsertFleet({ id: 1, owner: 6, faction: 'empire', commander: 3, cell: 12, boats: [9, 8], supply: 700, mapSection: 1 });
  s.seedSystems([{ name: 'ヴァルハラ', faction: 'empire', fortresses: ['x'], planets: [{ name: 'オーディン', orbit: 2 }] }]);
  s.setScenarioInfo({ sessionName: 'S', startYear: 796, currentTurn: 4, powers: [{ powerId: 1, faction: 'empire', superMan: 5 }] });
  const snap = s.toSnapshot();
  // 새 상태로 라운드트립
  const s2 = createWorldState();
  s2.restore(snap);
  assert.equal(s2.getPlayer(6).powerId, 0x500);
  assert.equal(s2.getFleet(1).supply, 700);
  assert.deepEqual(s2.getFleet(1).boats, [9, 8]);
  assert.equal(s2.getSystem('ヴァルハラ').owner, 'empire');
  assert.equal(s2.getScenarioInfo().currentTurn, 4);
  assert.equal(s2.getScenarioInfo().powers[0].superMan, 5);
  // 스냅샷은 깊은 복사: 복원 상태 변경이 스냅샷을 바꾸면 안 된다
  s2.advanceTurn();
  assert.equal(snap.scenario.currentTurn, 4, '스냅샷 scenario는 별칭 아님');
});

// --- S5: 완전승리(decisive victory) 종료 평가 ---
test('evaluateEnding: 두 진영이 성계 보유 → 진행 중(over=false)', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'A', faction: 'empire' },
    { name: 'B', faction: 'alliance' },
    { name: 'C', faction: 'neutral' }, // 페잔/중립은 교전 진영 아님
  ]);
  const r = s.evaluateEnding();
  assert.equal(r.over, false);
  assert.equal(r.winner, null);
  assert.equal(s.getScenarioInfo().ending, 0, 'ending 미설정');
});

test('evaluateEnding: 교전 진영 1개만 성계 보유 → 완전승리(over + winner + ending 마커)', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'A', faction: 'empire' },
    { name: 'B', faction: 'empire' },
    { name: 'C', faction: 'neutral' }, // 중립 성계는 승리 판정에서 제외
  ]);
  const r = s.evaluateEnding();
  assert.equal(r.over, true);
  assert.equal(r.winner, 'empire');
  assert.equal(s.getScenarioInfo().ending, 1, 'P3 결정됨 마커');
});

test('evaluateEnding: 성계 0개(시드 전) → over=false', () => {
  const s = createWorldState();
  assert.deepEqual(s.evaluateEnding(), { over: false, winner: null });
});

test('evaluateEnding: 이미 ending 설정 시 덮어쓰지 않음(idempotent)', () => {
  const s = createWorldState();
  s.seedSystems([{ name: 'A', faction: 'alliance' }]);
  s.setEnding(7); // 이미 종료 상태
  const r = s.evaluateEnding();
  assert.equal(r.over, true);
  assert.equal(r.winner, 'alliance');
  assert.equal(s.getScenarioInfo().ending, 7, '기존 ending 보존(덮어쓰기 안 함)');
});

test('evaluateEnding: 캐논 §1.6 — 어느 진영 ≤minSystems면 종료, 최다 보유 승리 (감사 2026-06-20)', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'E1', faction: 'empire' }, { name: 'E2', faction: 'empire' },
    { name: 'E3', faction: 'empire' }, { name: 'E4', faction: 'empire' }, { name: 'E5', faction: 'empire' },
    { name: 'A1', faction: 'alliance' }, { name: 'A2', faction: 'alliance' }, // alliance 2개 ≤3
  ]);
  // 기본(minSystems=0): 둘 다 성계>0이라 진행 중.
  assert.equal(s.evaluateEnding().over, false, '기본은 전멸만 종료');
  // 캐논 ≤3: alliance(2)≤3 → 종료, empire(5) 승리.
  const r = s.evaluateEnding({ minSystems: 3 });
  assert.equal(r.over, true);
  assert.equal(r.winner, 'empire');
});

test('evaluateEnding: minSystems=3이어도 양쪽 >3이면 진행 중', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'E1', faction: 'empire' }, { name: 'E2', faction: 'empire' },
    { name: 'E3', faction: 'empire' }, { name: 'E4', faction: 'empire' },
    { name: 'A1', faction: 'alliance' }, { name: 'A2', faction: 'alliance' },
    { name: 'A3', faction: 'alliance' }, { name: 'A4', faction: 'alliance' },
  ]);
  assert.equal(s.evaluateEnding({ minSystems: 3 }).over, false, '둘 다 4개>3 → 진행');
});

// --- 첩보/쿠데타 배선(coup_conduct 생산자 + 완전승리 박탈) — AU-3 / 감사 L129-131 ---
test('createWorldState: getIntelState/getCoupState가 공유 인스턴스를 노출한다', () => {
  const s = createWorldState();
  const intel = s.getIntelState();
  const coup = s.getCoupState();
  assert.ok(intel && typeof intel.addCoupLoyalty === 'function', 'intelState 인스턴스');
  assert.ok(coup && typeof coup.activeCount === 'function', 'coupState 인스턴스');
  // 같은 핸들을 반복 반환(1회 인스턴스).
  assert.equal(s.getIntelState(), intel, 'intelState 동일 핸들');
  assert.equal(s.getCoupState(), coup, 'coupState 동일 핸들');
  // 미시드 기본값(불변).
  assert.equal(intel.getCoupLoyalty(700), 0);
  assert.equal(intel.isCoupConduct(700), 0);
  assert.equal(coup.activeCount(), 0);
});

test('evaluateEnding: 진행 중 쿠데타 모의가 있으면 완전승리(完全勝利) 박탈(캐논 p78)', () => {
  const s = createWorldState();
  s.seedSystems([
    { name: 'A', faction: 'empire' },
    { name: 'B', faction: 'empire' },
    { name: 'C', faction: 'neutral' },
  ]);
  // 모의 없음 → 완전승리.
  assert.equal(s.evaluateEnding().over, true, '쿠데타 없으면 완전승리');
  // 모의 개시(수괴 선언) → 완전승리 박탈.
  const s2 = createWorldState();
  s2.seedSystems([{ name: 'A', faction: 'empire' }, { name: 'B', faction: 'empire' }]);
  s2.getCoupState().declareRingleader(101, 1);
  const r = s2.evaluateEnding();
  assert.equal(r.over, false, '진행 중 모의 → 완전승리 보류');
  assert.equal(r.winner, null, '승자 미확정');
  assert.equal(s2.getScenarioInfo().ending, 0, 'ending 마커 미설정(박탈)');
});

test('evaluateEnding: 모의가 발동(executed)돼 active=0이면 완전승리 회복', () => {
  const s = createWorldState();
  s.seedSystems([{ name: 'A', faction: 'empire' }, { name: 'B', faction: 'empire' }]);
  const coup = s.getCoupState();
  const intel = s.getIntelState();
  coup.declareRingleader(101, 1);
  coup.persuadeUnit(intel, 101, 5001, 100); // 충성 임계 초과 유닛
  assert.equal(s.evaluateEnding().over, false, '발동 전엔 박탈');
  coup.execute(101, { decisiveVictory: false, rebelFaction: 'rebel' }); // 발동 → executed
  assert.equal(coup.activeCount(), 0, '발동된 모의는 active 아님');
  const r = s.evaluateEnding();
  assert.equal(r.over, true, '발동 후 active=0 → 완전승리 회복');
  assert.equal(r.winner, 'empire');
});

// --- 전투 캐릭터 레지스트리 (戦死/降伏勧告/艦隊最大士気 사령관 데이터 출처) ---
test('upsertCharacter/getCharacter/getCharacterByFlagship: 등록·조회·기함 역인덱스', () => {
  const s = createWorldState();
  assert.equal(s.characterCount(), 0);
  const ch = s.upsertCharacter({
    id: 0x01000001, faction: 'empire', leadership: 95, rank: 14, flagship: 0x55,
    returnPlanet: 'オーディン', deathToggle: true,
  });
  assert.equal(ch.leadership, 95);
  assert.equal(ch.deathToggle, true);
  assert.equal(ch.alive, true, '기본 생존');
  assert.equal(s.getCharacter(0x01000001).rank, 14);
  // 기함 id로 사령관 역조회(戦死 판정 키).
  assert.equal(s.getCharacterByFlagship(0x55)?.id, 0x01000001);
  assert.equal(s.getCharacterByFlagship(0x99), null, '미존재 기함');
  assert.equal(s.characterCount(), 1);
  // 부분 갱신(같은 id 재등록).
  s.upsertCharacter({ id: 0x01000001, faction: 'empire', leadership: 95, flagship: 0x55, injured: true });
  assert.equal(s.getCharacter(0x01000001).injured, true);
  assert.equal(s.upsertCharacter({}), null, 'id 없으면 null');
});

test('upsertCharacter: socialClass와 fiefs를 보관한다 (작위/봉토 게이트용)', () => {
  const s = createWorldState();
  s.upsertCharacter({
    id: 7, faction: 'empire', rank: 5, title: 3,
    socialClass: 'noble', fiefs: [10, 20],
  });
  const ch = s.getCharacter(7);
  assert.equal(ch.socialClass, 'noble', '출신 계급 보관');
  assert.deepEqual(ch.fiefs, [10, 20], '봉토 목록 보관');
  assert.equal(ch.title, 3, '작위 보관');
  // upsertCharacter가 fiefs를 복사본으로 저장하므로 외부 입력 배열 변이가 영향 안 줌
  const originalFiefs = [10, 20];
  s.upsertCharacter({ id: 8, fiefs: originalFiefs });
  originalFiefs.push(30);
  assert.deepEqual(s.getCharacter(8).fiefs, [10, 20], '입력 배열 변이가 저장된 복사본에 영향 없음');
});

test('upsertCharacter: socialClass/fiefs 미지정 시 null/empty 기본값', () => {
  const s = createWorldState();
  s.upsertCharacter({ id: 8, faction: 'empire', rank: 3 });
  const ch = s.getCharacter(8);
  assert.equal(ch.socialClass, null);
  assert.equal(ch.fiefs, null);
  assert.equal(ch.title, null);
});

test('toSnapshot/restore: 캐릭터 레지스트리 왕복', () => {
  const s = createWorldState();
  s.upsertCharacter({ id: 7, faction: 'alliance', leadership: 88, flagship: 0x77, deathToggle: false });
  const snap = s.toSnapshot();
  const s2 = createWorldState();
  s2.restore(snap);
  assert.equal(s2.getCharacter(7).leadership, 88);
  assert.equal(s2.getCharacterByFlagship(0x77)?.id, 7);
});

test('toSnapshot/restore: 별칭 없음 — 저장/복원 후 변이가 스냅샷·원본을 오염시키지 않음 (감사 2026-06-20)', () => {
  const src = createWorldState();
  src.upsertShip({ id: 1, owner: 1, x: 0, z: 0 });
  src.seedSystems([{ name: 'A', faction: 'empire', planets: [{ name: 'p1' }] }]);
  const snap = src.toSnapshot();
  // 1) 저장 후 원본 변이 → 스냅샷 불변(toSnapshot 독립 복제).
  src.moveShip(1, { x: 99, z: 99 });
  assert.equal(snap.ships.find((s) => s.id === 1).x, 0, '스냅샷 ship 좌표 불변');
  // 2) 복원한 월드 변이 → 스냅샷·원본 불변(restore 독립 복제).
  const dst = createWorldState();
  dst.restore(snap);
  dst.moveShip(1, { x: 7, z: 7 });
  assert.equal(snap.ships.find((s) => s.id === 1).x, 0, '복원 변이가 스냅샷 오염 안 함');
  assert.equal(dst.getShip(1).x, 7);
  // 3) 시스템 planets 별칭 없음(conquerSystem이 planet owner를 변이해도 스냅샷 불변).
  dst.conquerSystem('A', 'alliance');
  assert.equal(snap.systems.find((s) => s.name === 'A').owner, 'empire', '스냅샷 system owner 불변');
});

test('toSnapshot/restore: 결정론 rngState 연속성 보존', () => {
  const src = createWorldState({ seed: 42 });
  src.rng(); src.rng(); // 난수열 진행
  const snap = src.toSnapshot();
  const a = src.rng();
  const dst = createWorldState({ seed: 999 }); // 다른 시드로 생성 후 복원
  dst.restore(snap);
  assert.equal(dst.rng(), a, '복원된 월드의 다음 난수가 원본 다음 난수와 동일(rngState 연속)');
});

test('runMonthlyPromotions: 大佐이하 사다리 #1 진급 + 功績=목표 평균, 高계급 미진급 (감사 2026-06-20)', () => {
  const s = createWorldState();
  s.upsertCharacter({ id: 1, faction: 'empire', rank: 5, achievement: 90 }); // 大佐 사다리 #1
  s.upsertCharacter({ id: 2, faction: 'empire', rank: 5, achievement: 30 });
  s.upsertCharacter({ id: 3, faction: 'empire', rank: 6, achievement: 50 }); // 목표(6) 평균=50
  s.upsertCharacter({ id: 9, faction: 'empire', rank: 14 }); // 元帥(>8) → 자동진급 대상 아님
  const promos = s.runMonthlyPromotions();
  assert.ok(promos.some((p) => p.charId === 1 && p.toRank === 6), '#1 → rank6');
  assert.equal(s.getCharacter(1).rank, 6);
  assert.equal(s.getCharacter(1).achievement, 50, '功績=목표 사다리 평균');
  assert.equal(s.getCharacter(2).rank, 5, '#2 유지');
  assert.equal(s.getCharacter(9).rank, 14, '元帥 유지(자동진급 ceiling 초과)');
});
