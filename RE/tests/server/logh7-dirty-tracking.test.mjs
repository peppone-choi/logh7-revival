// 더티-트래킹(revision) 정확성·속도 증명. 사용자 지시: "게임에 적당한 서버 구조에서 하이버네이트 같은
// 정확성을 보여줘. 단, 처리속도나 다른 속도들도 빨라야해."
//   - 정확성(Hibernate): 권위적 상태를 바꾸는 모든 mutator가 revision을 올린다 = 변경을 절대 놓치지 않는다.
//     새 mutator를 추가해도 팩토리 자동 래핑이 잡으므로 "추적 누락 → 무저장(데이터 손실)"이 구조적으로 불가능.
//   - 속도: 순수 reader는 revision을 안 올린다 → 유휴 서버의 더티-게이트가 직렬화/디스크쓰기를 O(1)로 건너뛴다.
// (실제 saveSnapshot 2단 게이트의 통합 증명은 logh7-auth-server.test.mjs의 "유휴 flush는 직렬화조차 건너뛴다".)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { createEconomyState } from '../../src/server/logh7-economy.mjs';

// 소스(logh7-world-state.mjs)의 READERS 화이트리스트와 동일해야 한다 — 어긋나면 아래 두 테스트가 서로
// 반대 방향으로 실패하므로 분류 드리프트가 CI에서 즉시 잡힌다(reader 누락=속도 테스트 실패, mutator 오분류=정확성 실패).
const WORLD_READERS = new Set([
  'revision',
  'getPlayer', 'hasPlayer', 'listPlayers', 'playerCount',
  'getShip', 'listShips', 'listLivingShips', 'pickTarget',
  'getTroop', 'listTroops', 'pickTroopTarget',
  'getSystem', 'listSystems', 'systemCount', 'factionSummary',
  'getFleet', 'listFleets', 'fleetCount',
  'getCharacter', 'getCharacterByFlagship', 'listCharacters', 'characterCount',
  'getIntelState', 'getCoupState',
  'isBattleActive', 'battleLog',
  'getScenarioInfo',
  'chatCount', 'listChat',
  'gameClock', 'gameDayOf', 'gameMonthOf',
  'toSnapshot',
]);

test('정확성: 권위적 상태를 바꾸는 모든 메서드(비-reader)가 revision을 올린다 = 변경 무손실', () => {
  // 래퍼는 fn 실행 전에 revision을 올리므로, 인자 부족으로 throw해도 "호출되면 더티로 표시된다"는
  // 불변식이 성립한다. 이 스윕은 READERS에 없는 모든 메서드가 빠짐없이 래핑됐음(=누락된 mutator 없음)을 증명한다.
  const w = createWorldState();
  let covered = 0;
  for (const name of Object.keys(w)) {
    if (typeof w[name] !== 'function' || WORLD_READERS.has(name)) continue;
    const before = w.revision();
    try { w[name](); } catch { /* 임의 무인자 호출의 throw는 무방 — 래퍼가 먼저 bump */ }
    assert.ok(w.revision() > before, `mutator ${name}() 호출은 revision을 올려야 한다(추적 누락 불가)`);
    covered += 1;
  }
  assert.ok(covered >= 25, `충분한 수의 mutator가 추적돼야 한다(실제=${covered})`);
});

test('속도: 순수 reader는 revision을 올리지 않는다 → 유휴 더티-게이트가 O(1)로 작동', () => {
  const w = createWorldState();
  w.addPlayer({ connectionId: 1, charId: 10, powerId: 1280 });
  w.upsertShip({ id: 100, owner: 1, faction: 1 });
  w.upsertFleet({ id: 10, owner: 1, faction: 'empire', cell: 5 });
  const baseline = w.revision();
  for (let i = 0; i < 2000; i += 1) {
    w.listPlayers(); w.listShips(); w.listFleets(); w.getPlayer(1); w.getShip(100);
    w.playerCount(); w.fleetCount(); w.factionSummary(); w.toSnapshot(); w.gameClock();
    w.listChat(); w.chatCount(); w.isBattleActive(); w.getScenarioInfo(); w.listSystems();
    w.listCharacters(); w.characterCount(); w.getIntelState(); w.getCoupState();
  }
  assert.equal(w.revision(), baseline, 'reader를 수천 번 호출해도 revision은 불변이어야 한다(유휴 게이트 안전)');
});

test('정확성: 실제 변이는 revision 증가 + 스냅샷에 반영, 변이 사이 reader는 무변화', () => {
  const w = createWorldState();
  const r0 = w.revision();
  w.addPlayer({ connectionId: 7, charId: 70, powerId: 1281 });
  const r1 = w.revision();
  assert.ok(r1 > r0, 'addPlayer 후 revision 증가');
  // 변이와 변이 사이의 reader는 revision을 건드리지 않아야 한다(게이트가 헛 직렬화를 안 하도록)
  w.listPlayers(); w.toSnapshot();
  assert.equal(w.revision(), r1, '변이 사이 reader는 revision 불변');
  w.upsertShip({ id: 200, owner: 7, faction: 3 });
  const r2 = w.revision();
  assert.ok(r2 > r1, 'upsertShip 후 revision 증가');
  // 실제 내용이 스냅샷에 반영됐는지 = 더티 신호가 진짜 변경과 일치
  const snap = w.toSnapshot();
  assert.equal(snap.players.length, 1);
  assert.equal(snap.ships.length, 1);
  assert.equal(snap.players[0].connectionId, 7);
  assert.equal(snap.ships[0].id, 200);
});

test('정확성: rng()는 reader가 아니라 mutator로 계측된다(seed 월드 rngState 영속 연속성)', () => {
  // seed를 주면 rng()가 rngState(스냅샷에 포함되는 영속 상태)를 전진시키므로, 더티로 표시돼야 한다.
  const w = createWorldState({ seed: 12345 });
  const before = w.revision();
  const snapBefore = w.toSnapshot().rngState;
  w.rng();
  assert.ok(w.revision() > before, 'rng()는 revision을 올려야 한다');
  assert.notEqual(w.toSnapshot().rngState, snapBefore, 'seed 월드에서 rng()는 rngState를 전진시킨다(영속 대상)');
});

const ECONOMY_READERS = new Set(['revision', 'getPlanet', 'listPlanets', 'treasuryOf', 'lastTickDay', 'toSnapshot']);

test('정확성(economy): 모든 비-reader가 revision을 올린다, reader는 불변', () => {
  const e = createEconomyState();
  let covered = 0;
  for (const name of Object.keys(e)) {
    if (typeof e[name] !== 'function' || ECONOMY_READERS.has(name)) continue;
    const before = e.revision();
    try { e[name](); } catch { /* 무인자 throw 무방 */ }
    assert.ok(e.revision() > before, `economy mutator ${name}()는 revision을 올려야 한다`);
    covered += 1;
  }
  assert.ok(covered >= 7, `충분한 economy mutator가 추적돼야 한다(실제=${covered})`);

  // reader 불변
  e.registerPlanet('p1', { faction: 'empire', taxBase: 100 });
  const base = e.revision();
  for (let i = 0; i < 2000; i += 1) { e.getPlanet('p1'); e.listPlanets(); e.treasuryOf('empire'); e.toSnapshot(); e.lastTickDay(); }
  assert.equal(e.revision(), base, 'economy reader는 revision 불변');
});

test('속도: 큰 월드에서도 reader 호출은 revision 변동(=직렬화 트리거)을 만들지 않는다', () => {
  // 유휴 비용이 월드 크기와 무관함의 핵심 전제: 5000개 엔티티가 있어도 reader는 revision을 안 올린다.
  const w = createWorldState();
  for (let i = 0; i < 5000; i += 1) w.upsertShip({ id: i, owner: 1, faction: (i % 2) + 1 });
  const settled = w.revision();
  for (let i = 0; i < 1000; i += 1) { w.listLivingShips(); w.factionSummary(); w.playerCount(); }
  assert.equal(w.revision(), settled, '대형 월드에서도 reader는 revision을 올리지 않는다(유휴 게이트 = O(1))');
});
