// 연령효과 월간 드리프트 통합 — world-state.applyMonthlyAgeDrift + createStrategicSim 월간 훅 배선 검증.
// (단위 규칙은 logh7-age-drift.test.mjs, 여기선 world/sim 통합·결정론·게이트.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import { buildStrategicGraph, createStrategicSim } from '../../src/server/logh7-strategic-sim.mjs';
import { AGE_YOUNG, AGE_OLD } from '../../src/server/logh7-age-drift.mjs';
import { loadScenarioFile, loadScenarioInto } from '../../src/server/logh7-scenario.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const sum = (a) => a.reduce((x, y) => x + y, 0);
const ABIL = () => [50, 50, 50, 50, 50, 50, 50, 50];

test('applyMonthlyAgeDrift: 젊으면 향상·노년이면 쇠퇴·전성기는 불변 (시드 결정론, 다개월)', () => {
  const ws = createWorldState({ seed: 12345 });
  ws.upsertCharacter({ id: 1, abilities: ABIL(), age: AGE_YOUNG - 5 }); // 젊음 → +
  ws.upsertCharacter({ id: 2, abilities: ABIL(), age: AGE_OLD + 10 });  // 노년 → -
  ws.upsertCharacter({ id: 3, abilities: ABIL(), age: (AGE_YOUNG + AGE_OLD) / 2 }); // 전성기 → 0
  for (let m = 0; m < 120; m += 1) ws.applyMonthlyAgeDrift();
  const young = ws.getCharacter(1).abilities;
  const old = ws.getCharacter(2).abilities;
  const prime = ws.getCharacter(3).abilities;
  assert.ok(sum(young) > 400, `젊은 캐릭 능력치 향상해야: ${sum(young)}`);
  assert.ok(sum(old) < 400, `노년 캐릭 능력치 쇠퇴해야: ${sum(old)}`);
  assert.equal(sum(prime), 400, '전성기는 불변');
  // 각 능력치 0..100 클램프 유지.
  for (const v of [...young, ...old]) assert.ok(v >= 0 && v <= 100);
});

test('applyMonthlyAgeDrift: 결정론(같은 시드 → 같은 결과)', () => {
  const run = () => {
    const ws = createWorldState({ seed: 777 });
    ws.upsertCharacter({ id: 1, abilities: ABIL(), age: 22 });
    for (let m = 0; m < 24; m += 1) ws.applyMonthlyAgeDrift();
    return ws.getCharacter(1).abilities;
  };
  assert.deepEqual(run(), run());
});

test('applyMonthlyAgeDrift: abilities/age 미보유·사망 캐릭터는 건너뜀', () => {
  const ws = createWorldState({ seed: 1 });
  ws.upsertCharacter({ id: 1 }); // abilities/age 없음
  ws.upsertCharacter({ id: 2, abilities: ABIL(), age: 0 }); // age 0
  ws.upsertCharacter({ id: 3, abilities: ABIL(), age: 22, alive: false }); // 사망
  ws.upsertCharacter({ id: 4, abilities: ABIL(), age: 22 }); // 유효
  const r = ws.applyMonthlyAgeDrift();
  assert.equal(r.scanned, 1, '유효 캐릭터 1명만 스캔');
  assert.equal(ws.getCharacter(1).abilities, null);
});

test('upsertCharacter: abilities 복사(외부 배열 변형 격리) + 스냅샷/복원 보존', () => {
  const ws = createWorldState({ seed: 1 });
  const ext = ABIL();
  ws.upsertCharacter({ id: 1, abilities: ext, age: 22 });
  ext[0] = 999; // 외부 변형이 내부에 안 새는지
  assert.equal(ws.getCharacter(1).abilities[0], 50);
  // 스냅샷/복원 라운드트립.
  const snap = ws.toSnapshot();
  const ws2 = createWorldState();
  ws2.restore(snap);
  assert.deepEqual(ws2.getCharacter(1).abilities, ABIL());
  assert.equal(ws2.getCharacter(1).age, 22);
});

test('createStrategicSim: 월간 경계 틱에서만 applyMonthlyAgeDrift 발화', () => {
  const ws = createWorldState({ seed: 5 });
  ws.seedSystems([
    { name: 'A', faction: 'empire', map: { cx: 0, cy: 0 }, planets: [{ name: 'a1' }] },
    { name: 'B', faction: 'alliance', map: { cx: 10, cy: 0 }, planets: [{ name: 'b1' }] },
  ]);
  ws.upsertCharacter({ id: 1, abilities: ABIL(), age: 22 });
  const graph = buildStrategicGraph(ws.listSystems(), { kNearest: 1, maxDist: 50 });
  const sim = createStrategicSim(ws, graph, { seed: 1, ticksPerMonth: 3 });
  // 비-경계 틱: ageDrift 없음.
  assert.equal(sim.tick(1).ageDrift, undefined);
  assert.equal(sim.tick(2).ageDrift, undefined);
  // 월간 경계(3) 틱: ageDrift 발화.
  const r3 = sim.tick(3);
  assert.ok(r3.ageDrift, '월간 경계서 ageDrift 결과 존재');
  assert.equal(r3.ageDrift.scanned, 1);
});

test('createStrategicSim: 월간 경계서 runMonthlyPromotions도 호출(result.promotions)', () => {
  const ws = createWorldState({ seed: 5 });
  ws.seedSystems([
    { name: 'A', faction: 'empire', map: { cx: 0, cy: 0 }, planets: [{ name: 'a1' }] },
    { name: 'B', faction: 'alliance', map: { cx: 10, cy: 0 }, planets: [{ name: 'b1' }] },
  ]);
  ws.upsertCharacter({ id: 1, faction: 'empire', rank: 5, achievement: 90 }); // 大佐 → 진급 후보
  const graph = buildStrategicGraph(ws.listSystems(), { kNearest: 1, maxDist: 50 });
  const sim = createStrategicSim(ws, graph, { seed: 1, ticksPerMonth: 3 });
  assert.equal(sim.tick(1).promotions, undefined, '비경계 틱엔 없음');
  const r3 = sim.tick(3);
  assert.ok(Array.isArray(r3.promotions), '월간 경계서 promotions 배열');
  assert.ok(r3.promotions.some((p) => p.charId === 1), '大佐 #1 진급');
  assert.equal(ws.getCharacter(1).rank, 6);
});

test('boot 경로 통합: 캐논 시나리오 低officer 시드 → 월간 훅이 자동진급 발화', () => {
  // 부팅 시드 경로(loadScenarioInto)로 들어간 大佐이하 officer가 createStrategicSim 월간 경계에서
  // runMonthlyPromotions로 진급하는지 — 시나리오 데이터 + 월간 훅 배선의 end-to-end 고정.
  const { scenario } = loadScenarioFile(join(REPO_ROOT, 'content', 'scenarios', 'canon-801-07.json'));
  const ws = createWorldState({ seed: 5 });
  loadScenarioInto(ws, scenario); // 80성계 + 사령단 14 + 大佐이하 低officer 시드
  const graph = buildStrategicGraph(ws.listSystems(), { kNearest: 2, maxDist: 5000 });
  const sim = createStrategicSim(ws, graph, { seed: 1, ticksPerMonth: 3 });

  // 진급 전 大佐이하 인원 스냅샷.
  const lowBefore = ws.listCharacters().filter((c) => c.rank >= 1 && c.rank <= 8).length;
  assert.ok(lowBefore >= 10, `大佐이하 다수 시드: ${lowBefore}`);

  // 비-경계 틱: 진급 없음.
  assert.equal(sim.tick(1).promotions, undefined);
  assert.equal(sim.tick(2).promotions, undefined);
  // 월간 경계(3) 틱: 자동진급 발화.
  const r3 = sim.tick(3);
  assert.ok(Array.isArray(r3.promotions), '월간 경계서 promotions 배열');
  assert.ok(r3.promotions.length >= 4, `시나리오 시드로 자동진급 다수 발화: ${r3.promotions.length}`);
  // 모든 진급은 大佐이하만, 한 계급씩.
  for (const p of r3.promotions) {
    assert.ok(p.fromRank <= 8 && p.toRank === p.fromRank + 1, '大佐이하 +1 진급');
  }
});
