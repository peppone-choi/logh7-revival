// logh7-scenario: 시나리오 검증 + world 시드 배선(실 createWorldState) 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateScenario, loadScenarioInto, loadScenarioFile } from '../../src/server/logh7-scenario.mjs';
import { createWorldState } from '../../src/server/logh7-world-state.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('validateScenario: name 필수, 컬렉션 배열, 엔티티 id 필수', () => {
  assert.equal(validateScenario(null).valid, false);
  assert.deepEqual(validateScenario({}).errors, ['no-name']);
  assert.equal(validateScenario({ name: 'x' }).valid, true);
  assert.deepEqual(validateScenario({ name: 'x', ships: 'nope' }).errors, ['ships-not-array']);
  assert.deepEqual(validateScenario({ name: 'x', ships: [{ id: 1 }, { owner: 2 }] }).errors, ['ships-missing-id']);
  assert.deepEqual(validateScenario({ name: 'x', systems: [{ faction: 'empire' }] }).errors, ['systems-missing-name']);
  assert.deepEqual(validateScenario({ name: 'x', clockStartMs: 'soon' }).errors, ['bad-clock']);
});

test('loadScenarioInto: 검증 실패면 적용 없음', () => {
  const world = createWorldState();
  const r = loadScenarioInto(world, { ships: [{ id: 1 }] }); // name 없음
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['no-name']);
  assert.equal(world.listShips().length, 0, '거부 시 미시드');
});

test('loadScenarioInto: 성계/함선/함대/지상부대를 실 world에 시드', () => {
  const world = createWorldState();
  const scenario = {
    name: 'test-801-07',
    clockStartMs: 12345,
    systems: [{ name: '오딘', faction: 'empire', planets: [{ name: '오딘' }] }],
    ships: [
      { id: 101, owner: 1, faction: 1, shipClass: 'cruiser' },
      { id: 102, owner: 1, faction: 1, shipClass: 'destroyer' },
    ],
    fleets: [{ id: 201, owner: 1, faction: 1, commander: 5, cell: 40 }],
    troops: [{ id: 301, owner: 1, faction: 1, strength: 100 }],
  };
  const r = loadScenarioInto(world, scenario);
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { systems: 1, ships: 2, fleets: 1, troops: 1 });
  assert.equal(r.clockStartMs, 12345, '클록 기준점은 메타로 노출(호출자가 createWorldState에 사용)');
  // 실제 world에 들어갔는지 게터로 확인.
  assert.equal(world.listShips().length, 2);
  assert.equal(world.getShip(101).shipClass, 'cruiser');
  assert.equal(world.getFleet(201).commander, 5);
  assert.equal(world.getTroop(301).strength, 100);
  assert.equal(world.getSystem('오딘').owner, 'empire'); // seedSystems는 faction을 owner로 저장
});

test('loadScenarioInto: 빈 컬렉션은 0 시드(에러 아님)', () => {
  const world = createWorldState();
  const r = loadScenarioInto(world, { name: 'empty' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.counts, { systems: 0, ships: 0, fleets: 0, troops: 0 });
  assert.equal(r.clockStartMs, null);
});

test('loadScenarioFile: 없는 파일/깨진 파일은 throw 없이 에러 보고', () => {
  assert.deepEqual(loadScenarioFile('').errors, ['file-not-found']);
  assert.deepEqual(loadScenarioFile(join(REPO_ROOT, 'nope.json')).errors, ['file-not-found']);
});

test('loadScenarioFile: 출하 예제 시나리오를 읽어 검증+실 world 시드', () => {
  const path = join(REPO_ROOT, 'content', 'scenarios', 'example-skirmish.json');
  const { scenario, errors } = loadScenarioFile(path);
  assert.deepEqual(errors, [], '예제 시나리오는 유효');
  assert.equal(scenario.name, 'example-skirmish');
  const world = createWorldState({ clockStartMs: scenario.clockStartMs ?? 0 });
  const r = loadScenarioInto(world, scenario);
  assert.equal(r.ok, true);
  assert.equal(r.counts.systems, 2);
  assert.equal(r.counts.fleets, 2);
  assert.equal(r.counts.ships, 2);
  assert.equal(world.getFleet(1001).faction, 1);
  assert.equal(world.getSystem('하이네센').owner, 'alliance');
});

test('loadScenarioInto: 시나리오 메타(sessionName/startYear/powers)를 world A7에 기록', () => {
  const world = createWorldState();
  loadScenarioInto(world, {
    name: 'meta-test',
    sessionName: '銀河英雄伝説VII',
    startYear: 801,
    powers: [{ powerId: 0x500, faction: 'empire', superMan: 0x01000000 }],
  });
  const info = world.getScenarioInfo();
  assert.equal(info.sessionName, '銀河英雄伝説VII');
  assert.equal(info.startYear, 801);
  assert.equal(info.powers[0].superMan, 0x01000000);
});

test('validateScenario/loadScenarioInto: characters 컬렉션 검증 + 전투 레지스트리 시드', () => {
  // characters는 일급 컬렉션 — 배열 검증 + id 필수.
  assert.deepEqual(validateScenario({ name: 'x', characters: 'nope' }).errors, ['characters-not-array']);
  assert.deepEqual(validateScenario({ name: 'x', characters: [{ leadership: 9 }] }).errors, ['characters-missing-id']);
  const world = createWorldState();
  const r = loadScenarioInto(world, {
    name: 'chars',
    characters: [
      { id: 0x01000001, faction: 'empire', leadership: 95, flagship: 0x55, deathToggle: true },
      { id: 0x01000002, faction: 'alliance', leadership: 90, flagship: 0x66 },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.counts.characters, 2);
  assert.equal(world.getCharacter(0x01000001).leadership, 95);
  assert.equal(world.getCharacterByFlagship(0x66)?.id, 0x01000002);
});

test('loadScenarioInto: 메타 없는 시나리오는 A7을 건드리지 않는다(기본값 유지)', () => {
  const world = createWorldState();
  loadScenarioInto(world, { name: 'no-meta', systems: [{ name: 'x', faction: 'empire' }] });
  assert.equal(world.getScenarioInfo().sessionName, '');
  assert.equal(world.getScenarioInfo().startYear, 0);
});

test('loadScenarioFile: 캐논 801-07 시작 시나리오가 유효+실 world 시드(출하 기본)', () => {
  // 출하 캐논 시나리오(매뉴얼 p75 초기배치 기반)가 로더로 정상 부팅되는지 고정.
  const path = join(REPO_ROOT, 'content', 'scenarios', 'canon-801-07.json');
  const { scenario, errors } = loadScenarioFile(path);
  assert.deepEqual(errors, [], '캐논 801-07 시나리오는 유효');
  assert.equal(scenario.name, 'canon-801-07');
  const world = createWorldState({ clockStartMs: scenario.clockStartMs ?? 0 });
  const r = loadScenarioInto(world, scenario);
  assert.equal(r.ok, true);
  // 캐논 규모: 80성계 + 제국12/동맹12 함대 + 기함 + 지상부대.
  assert.equal(r.counts.systems, 80, '갤럭시 80성계');
  assert.equal(r.counts.fleets, 24, '양 진영 12+12 함대');
  assert.ok(r.counts.ships >= 24, '기함 24+');
  assert.ok(r.counts.troops >= 100, '지상부대 시드');
  // A7: 출하 시나리오가 세션/연도 메타를 world에 기록(매뉴얼 p72 宇宙暦801).
  assert.equal(world.getScenarioInfo().startYear, 801, '캐논 시작 연도 801');
  assert.ok(world.getScenarioInfo().sessionName.length > 0, '세션명 기록됨');
  // §B5: 캐논 사령관(고계급 14명) + 大佐이하 低officer(17명)가 전투 캐릭터 레지스트리에 시드.
  // 高계급 14 = 戦死/항복 사령관 + 기함 링크. 低officer = 자동진급(runMonthlyPromotions) 사다리 발화 전제.
  assert.equal(r.counts.characters, 31, '사령관 14 + 大佐이하 低officer 17 = 31명 시드');
  const reinhard = world.getCharacter(4097);
  assert.ok(reinhard, '라인하르트 시드됨');
  assert.equal(reinhard.leadership, 100, '統率 100');
  assert.ok(reinhard.flagship > 0, '기함 링크');
  // getCharacterByFlagship으로 기함 함선에서 사령관 역조회(戦死 판정 키).
  assert.equal(world.getCharacterByFlagship(reinhard.flagship)?.id, 4097);
});

test('canon-801-07: 大佐이하 低officer 시드가 자동진급(runMonthlyPromotions) 사다리를 발화시킨다', () => {
  // P0-02/G 인접 — 自動進級 dormant 해소. 大佐이하 다수 시드 → autoPromoteLadders 그룹(faction|track|rank)이
  // 형성 → 월간 훅 runMonthlyPromotions가 매월 각 사다리 #1을 진급. (게이트 LOGH_STRAT_SIM은 발화 트리거만
  // 좌우하고 순수 로직은 게이트 무관 — 여기선 로직 자체를 고정.)
  const path = join(REPO_ROOT, 'content', 'scenarios', 'canon-801-07.json');
  const { scenario } = loadScenarioFile(path);
  const world = createWorldState({ seed: 1 });
  loadScenarioInto(world, scenario);

  // 大佐이하(rank ≤ 8) 시드가 ≥2명 그룹을 여러 개 만든다(사다리 형성의 전제).
  const low = world.listCharacters().filter((c) => c.rank >= 1 && c.rank <= 8);
  assert.ok(low.length >= 10, `大佐이하 officer 다수 시드: ${low.length}`);
  const groups = new Map();
  for (const c of low) {
    const key = `${c.faction}|${c.rank}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const multiGroups = [...groups.values()].filter((n) => n >= 2).length;
  assert.ok(multiGroups >= 4, `≥2명 사다리 그룹이 다수 형성: ${multiGroups}`);

  // 월간 자동진급 1회 → 각 그룹 #1이 진급(이전엔 大佐이하 0~1명이라 후보 0 = dormant).
  const promos = world.runMonthlyPromotions();
  assert.ok(promos.length >= 4, `자동진급 발화(≥4건): ${promos.length}`);
  // 진급은 大佐이하(fromRank ≤ 8)만 + 한 계급씩(+1).
  for (const p of promos) {
    assert.ok(p.fromRank >= 1 && p.fromRank <= 8, `大佐이하만 진급: from ${p.fromRank}`);
    assert.equal(p.toRank, p.fromRank + 1, '한 계급씩 진급');
    assert.equal(world.getCharacter(p.charId).rank, p.toRank, '월드에 진급 반영');
  }

  // キルヒアイス named anchor(P2, 少佐/rank6 alliance)는 자기 사다리 5법칙 #1(功績 최상위)이라 진급된다.
  const kircheis = scenario.characters.find((c) => c._named === 'キルヒアイス');
  assert.ok(kircheis, 'キルヒアイス named anchor가 시나리오에 존재');
  assert.ok(promos.some((p) => p.charId === kircheis.id), 'キルヒアイス가 少佐 사다리 #1로 진급');
});
