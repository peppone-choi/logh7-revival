// 영속성 라운드트립 — world-state.toSnapshot()/restore()가 모든 동적 상태 타입을 손실 없이 왕복하는지
// 포괄 검증(재시작 후 영속 = Phase A4 목표 + 이번 세션 신규 상태: characters/scenario/surrendered/battle).
// 누락 필드(snapshot/restore 한쪽만 다룬 상태)를 잡는 계약 고정 테스트.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';

function buildRichWorld() {
  const w = createWorldState({ clockStartMs: 123456, seed: 9 });
  // players
  w.addPlayer({ connectionId: 6, charId: 0x01000001, powerId: 0x500, mode: 2 });
  // ships(평범 + 항복 + 격침되지 않은 손상)
  w.upsertShip({ id: 100, owner: 6, faction: 1, shipClass: 'battleship', x: 10, y: 0, z: 20, heading: 1 });
  w.upsertShip({ id: 200, owner: 7, faction: 2, shipClass: 'cruiser' });
  w.markSurrendered(200); // surrendered 플래그
  // troops
  w.upsertTroop({ id: 300, owner: 6, faction: 1, strength: 80, morale: 90 });
  // systems(+ planets/owner)
  w.seedSystems([{ name: 'ヴァルハラ', faction: 'empire', fortresses: ['イゼルローン'], planets: [{ name: 'オーディン', orbit: 1 }] }]);
  // fleets(+ boats)
  w.upsertFleet({ id: 1001, owner: 6, faction: 'empire', commander: 0x01000001, cell: 42, boats: [9, 8, 7], supply: 700, mapSection: 1 });
  // characters(+ alive/injured/deathToggle/flagship)
  w.upsertCharacter({ id: 0x01000001, faction: 'empire', leadership: 95, rank: 14, flagship: 100, returnPlanet: 'オーディン', deathToggle: true, injured: true });
  // scenario meta(A7)
  w.setScenarioInfo({ sessionName: 'S801', startYear: 801, currentTurn: 3, term: 2, powers: [{ powerId: 1, faction: 'empire', superMan: 5 }] });
  w.setEnding(0);
  // battle session(active + participants + log)
  w.openBattle({ mode: 1 });
  w.joinBattle(6);
  w.logCombat({ event: 'attacked', attackerId: 100, targetId: 200 });
  // chat
  w.appendChat({ connectionId: 6, charId: 1, text: 'GG', channel: 0, time: 1 });
  return w;
}

test('persistence: 풍부한 월드 상태 전체가 toSnapshot→restore로 손실 없이 왕복', () => {
  const src = buildRichWorld();
  const snap = src.toSnapshot();
  const dst = createWorldState();
  dst.restore(snap);

  // players
  assert.equal(dst.getPlayer(6).powerId, 0x500);
  assert.equal(dst.getPlayer(6).charId, 0x01000001);
  // ships(+ surrendered 플래그 round-trip)
  assert.equal(dst.getShip(100).x, 10);
  assert.equal(dst.getShip(100).faction, 1);
  assert.equal(dst.getShip(200).surrendered, true, '항복 플래그 왕복');
  // troops
  assert.equal(dst.getTroop(300).strength, 80);
  // systems(+ planets/owner/fortresses)
  const sys = dst.getSystem('ヴァルハラ');
  assert.equal(sys.owner, 'empire');
  assert.equal(sys.planets[0].name, 'オーディン');
  assert.deepEqual(sys.fortresses, ['イゼルローン']);
  // fleets(+ boats 배열)
  assert.equal(dst.getFleet(1001).supply, 700);
  assert.deepEqual(dst.getFleet(1001).boats, [9, 8, 7]);
  // characters(+ alive/injured/flagship)
  const ch = dst.getCharacter(0x01000001);
  assert.equal(ch.leadership, 95);
  assert.equal(ch.flagship, 100);
  assert.equal(ch.deathToggle, true);
  assert.equal(ch.injured, true);
  assert.equal(dst.getCharacterByFlagship(100)?.id, 0x01000001, '기함 역인덱스 복원');
  // scenario meta(A7)
  const info = dst.getScenarioInfo();
  assert.equal(info.sessionName, 'S801');
  assert.equal(info.startYear, 801);
  assert.equal(info.currentTurn, 3);
  assert.equal(info.powers[0].superMan, 5);
  // battle session(active/mode/participants/log)
  assert.equal(dst.isBattleActive(), true, '전투 세션 active 복원');
  assert.equal(dst.battleLog().length, 1, '전투 로그 복원');
  // chat + clock
  assert.equal(dst.listChat()[0].text, 'GG');
  assert.equal(dst.gameClock().startMs, 123456, '게임 클록 기준점 복원(시간 연속성)');
});

test('persistence: restore는 깊은 복사 — 복원 상태 변경이 원 스냅샷을 오염시키지 않음', () => {
  const src = buildRichWorld();
  const snap = src.toSnapshot();
  const dst = createWorldState();
  dst.restore(snap);
  // 복원본을 변경.
  dst.advanceTurn();
  dst.upsertCharacter({ id: 0x01000001, faction: 'empire', leadership: 1, flagship: 100 });
  // 원 스냅샷의 scenario는 별칭이 아니어야(deep copy).
  assert.equal(snap.scenario.currentTurn, 3, '스냅샷 scenario 비오염');
  // 원 src도 영향 없어야(독립 인스턴스).
  assert.equal(src.getScenarioInfo().currentTurn, 3, '원 world 비오염');
  assert.equal(src.getCharacter(0x01000001).leadership, 95);
});

test('persistence: 빈 월드 round-trip(기본값 안전)', () => {
  const w = createWorldState();
  const dst = createWorldState();
  dst.restore(w.toSnapshot());
  assert.equal(dst.listShips().length, 0);
  assert.equal(dst.characterCount(), 0);
  assert.equal(dst.getScenarioInfo().sessionName, '');
  assert.equal(dst.isBattleActive(), false);
});
