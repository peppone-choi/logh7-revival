// 캐논 콘텐츠 일관성 가드 — 출하 시나리오(canon-801-07)의 엔티티 참조 무결성을 고정한다.
// commander 배정 도구(tools/logh7_assign_canon_commanders.mjs)나 갤럭시/로스터 데이터가 드리프트하면
// 본 가드가 잡는다(orphan 참조·진영 불일치·규모 변화). 데이터 무결성은 라이브 무관(순수 검증).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scenario = JSON.parse(readFileSync(join(REPO, 'content', 'scenarios', 'canon-801-07.json'), 'utf8'));

const NATION_TO_NUM = { empire: 1, alliance: 2 };

// 캐논 시나리오의 character는 두 코호트로 나뉜다:
//   (1) 사령관(commander) — flagship 함선 링크 보유(高계급 14명). 戦死/항복 판정·함대 지휘의 데이터 출처.
//   (2) 大佐이하 低officer — flagship 없음(자동진급 사다리 시드 풀, runMonthlyPromotions 발화용).
// flagship/진영매칭 무결성 가드는 (1) 사령관에만 적용한다(低officer는 함선 미연결이 정상).
const COMMANDERS = scenario.characters.filter((c) => c.flagship);
const LOW_OFFICERS = scenario.characters.filter((c) => !c.flagship);

test('canon-801-07: 캐논 규모(80성계 / 24함대 / 24기함 / 14사령관 + 大佐이하 低officer) 고정', () => {
  assert.equal(scenario.systems.length, 80, '갤럭시 80성계');
  assert.equal(scenario.fleets.length, 24, '제국12+동맹12 함대');
  assert.equal(scenario.ships.length, 24, '기함 24');
  assert.equal(COMMANDERS.length, 14, '기함 보유 사령관 14명(복구 로스터)');
  // 大佐이하 低officer 풀(자동진급 사다리 발화 전제, flagship 없음). 다수 시드되어야 사다리 그룹이 형성된다.
  assert.ok(LOW_OFFICERS.length >= 10, `大佐이하 低officer 다수 시드: ${LOW_OFFICERS.length}`);
  for (const c of LOW_OFFICERS) {
    assert.ok(c.rank >= 1 && c.rank <= 8, `低officer는 大佐이하: ${c.id}=${c.rank}`);
    assert.ok(!('flagship' in c), `低officer는 함선 미연결: ${c.id}`);
  }
});

test('canon-801-07: 모든 사령관(flagship 보유)의 flagship이 실존 함선 id를 가리킨다(orphan 0)', () => {
  const shipIds = new Set(scenario.ships.map((s) => s.id));
  const orphans = COMMANDERS.filter((c) => !shipIds.has(c.flagship));
  assert.deepEqual(orphans.map((c) => c.id), [], 'flagship orphan 없음');
});

test('canon-801-07: 모든 fleet.commander(비0)가 실존 character id를 가리킨다(orphan 0)', () => {
  const charIds = new Set(scenario.characters.map((c) => c.id));
  const orphans = scenario.fleets.filter((f) => f.commander && !charIds.has(f.commander));
  assert.deepEqual(orphans.map((f) => f.id), [], 'commander orphan 없음');
});

test('canon-801-07: 모든 ship._fleet이 실존 fleet id를 가리킨다(orphan 0)', () => {
  const fleetIds = new Set(scenario.fleets.map((f) => f.id));
  const orphans = scenario.ships.filter((s) => s._fleet && !fleetIds.has(s._fleet));
  assert.deepEqual(orphans.map((s) => s.id), [], 'ship._fleet orphan 없음');
});

test('canon-801-07: 사령관 진영과 그 기함 함선 진영이 일치(empire=1/alliance=2)', () => {
  const shipFaction = new Map(scenario.ships.map((s) => [s.id, s.faction]));
  const mismatched = COMMANDERS.filter((c) => shipFaction.get(c.flagship) !== NATION_TO_NUM[c.faction]);
  assert.deepEqual(mismatched.map((c) => c.id), [], 'char↔flagship 진영 일치');
});

test('canon-801-07: 모든 character 공통 필드(id/leadership/rank/faction) 유효', () => {
  // id/계급/진영/統率 범위는 사령관·低officer 모두에 적용(전 코호트 공통 무결성).
  for (const c of scenario.characters) {
    assert.ok(Number.isInteger(c.id) && c.id > 0, `char id 유효: ${c.id}`);
    assert.ok(c.leadership >= 0 && c.leadership <= 120, `統率 범위: ${c.id}=${c.leadership}`);
    assert.ok(c.rank >= 1 && c.rank <= 14, `계급 범위: ${c.id}=${c.rank}`);
    assert.ok(['empire', 'alliance'].includes(c.faction), `진영: ${c.id}=${c.faction}`);
  }
  // id 중복 없음(低officer 블록이 기존 사령단과 충돌하지 않아야 멱등 upsert가 안전).
  const ids = scenario.characters.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, 'character id 중복 없음');
});

test('canon-801-07: 각 fleet은 정확히 하나의 기함 함선(_fleet)을 갖는다(1:1)', () => {
  // 사령관 배정은 함대의 lead ship(_fleet 일치 첫 함선)을 flagship으로 쓴다 — 함대당 기함 1척 전제 확인.
  const shipsPerFleet = new Map();
  for (const s of scenario.ships) {
    if (s._fleet) shipsPerFleet.set(s._fleet, (shipsPerFleet.get(s._fleet) ?? 0) + 1);
  }
  for (const f of scenario.fleets) {
    assert.equal(shipsPerFleet.get(f.id) ?? 0, 1, `fleet ${f.id}는 기함 1척`);
  }
});
