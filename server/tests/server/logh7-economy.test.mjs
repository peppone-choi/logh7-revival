// logh7-economy: 세수 공식(P3) + 30일틱 국고 누적 + 국고 차감 + 영속 검증.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEconomyState,
  computePlanetTax,
  ensureEconomyPlanetsFromSystems,
  seedEconomyFromSystems,
  ECONOMY_TUNING,
} from '../../src/server/logh7-economy.mjs';

test('computePlanetTax: 세율↑ → 세수 단조증가', () => {
  const base = { taxBase: 1000, approval: 100 };
  const lo = computePlanetTax({ ...base, taxRate: 0.05 });
  const hi = computePlanetTax({ ...base, taxRate: 0.2 });
  assert.ok(hi > lo, `세율 높으면 세수 증가: ${hi} > ${lo}`);
});

test('computePlanetTax: 지지율 0%는 하한 계수(<100%일 때보다 낮음)', () => {
  const p = { taxBase: 1000, taxRate: 0.1 };
  const full = computePlanetTax({ ...p, approval: 100 });
  const none = computePlanetTax({ ...p, approval: 0 });
  assert.ok(none < full, '지지 0% 세수 < 지지 100% 세수');
  // 지지 0% 계수 = approvalTaxFloor (statup 統率 중립 50 기준).
  assert.ok(none > 0, '하한이 0이 아니라 floor 계수');
});

test('computePlanetTax: 統率 높으면 세수 배수', () => {
  const p = { taxBase: 1000, taxRate: 0.1, approval: 100 };
  const lowLead = computePlanetTax(p, { leadership: 0 });
  const highLead = computePlanetTax(p, { leadership: 100 });
  assert.ok(highLead > lowLead, `統率 100 세수 > 統率 0 세수: ${highLead} > ${lowLead}`);
});

test('runEconomyTick: 국고 적립 = 자국 행성 세수 합', () => {
  const eco = createEconomyState();
  eco.registerPlanet('p1', { faction: 'empire', taxBase: 1000, taxRate: 0.1, approval: 100 });
  eco.registerPlanet('p2', { faction: 'empire', taxBase: 2000, taxRate: 0.1, approval: 100 });
  eco.registerPlanet('a1', { faction: 'alliance', taxBase: 1500, taxRate: 0.1, approval: 100 });

  const { revenueByFaction } = eco.runEconomyTick({ gameDay: 30 });
  assert.equal(eco.treasuryOf('empire'), revenueByFaction.empire, '제국 국고 = 제국 세수 합');
  assert.equal(eco.treasuryOf('alliance'), revenueByFaction.alliance);
  assert.ok(revenueByFaction.empire > revenueByFaction.alliance, '제국(3000 base) > 동맹(1500)');
  assert.equal(eco.lastTickDay(), 30);
});

test('treasury: spendTreasury 충분→차감, 부족→거부', () => {
  const eco = createEconomyState();
  eco.registerPlanet('p1', { faction: 'empire', taxBase: 10000, taxRate: 0.5, approval: 100 });
  eco.runEconomyTick({ gameDay: 30 });
  const before = eco.treasuryOf('empire');
  assert.ok(before > 0);
  assert.equal(eco.spendTreasury('empire', before + 1), false, '잔액 초과는 거부');
  assert.equal(eco.treasuryOf('empire'), before, '거부 시 미차감');
  assert.equal(eco.spendTreasury('empire', 100), true);
  assert.equal(eco.treasuryOf('empire'), before - 100);
});

test('runEconomyTick: N회 결정론(같은 입력 → 같은 누적)', () => {
  const build = () => {
    const e = createEconomyState();
    e.registerPlanet('p1', { faction: 'empire', taxBase: 1000, taxRate: 0.1, approval: 80 });
    return e;
  };
  const a = build();
  const b = build();
  for (let d = 30; d <= 90; d += 30) { a.runEconomyTick({ gameDay: d }); b.runEconomyTick({ gameDay: d }); }
  assert.deepEqual(a.toSnapshot(), b.toSnapshot(), '결정론');
});

test('지지/치안 baseline(50) 회귀', () => {
  const eco = createEconomyState();
  eco.registerPlanet('hi', { faction: 'empire', taxBase: 100, taxRate: 0.1, approval: 100, security: 100 });
  eco.runEconomyTick({ gameDay: 30 });
  const p = eco.getPlanet('hi');
  assert.ok(p.approval < 100, '높은 지지는 50 방향으로 하락');
  assert.ok(p.security < 100, '높은 치안도 회귀');
});

test('seedEconomyFromSystems: 성계→행성 진영별 등록 + 세원 산출', () => {
  const eco = createEconomyState();
  const systems = [
    { faction: 'empire', planets: [{ name: '오딘', population_M: 100, industry: 10 }, { name: '발할라', population_M: 50, industry: 5 }] },
    { faction: 'alliance', planets: [{ name: '하이네센', population_M: 80, industry: 8 }] },
    { faction: 'neutral', planets: [] },
  ];
  const n = seedEconomyFromSystems(eco, systems);
  assert.equal(n, 3, '행성 3개 등록');
  assert.equal(eco.getPlanet('오딘').faction, 'empire');
  assert.equal(eco.getPlanet('오딘').taxBase, 100 + 10 * 4, 'P3 세원 = pop + industry*4');
  // 시드 후 틱 → 진영 국고에 세수 적립.
  const { revenueByFaction } = eco.runEconomyTick({ gameDay: 30 });
  assert.ok(revenueByFaction.empire > revenueByFaction.alliance, '제국(2행성 더 큰 세원) > 동맹');
  assert.equal(eco.treasuryOf('empire'), revenueByFaction.empire);
});

test('ensureEconomyPlanetsFromSystems: 복원 경제값은 보존하고 누락 콘텐츠 행성만 추가', () => {
  const eco = createEconomyState();
  eco.registerPlanet('old', {
    faction: 'empire',
    taxBase: 999,
    taxRate: 0.33,
    approval: 44,
    security: 55,
    system: 'Odin',
  });

  const result = ensureEconomyPlanetsFromSystems(eco, [
    { name: 'Odin', faction: 'empire', planets: [{ id: 'old', population: 1 }, { id: 'new', population: 2 }] },
  ]);

  assert.deepEqual(result, { total: 2, added: 1 });
  assert.equal(eco.listPlanets().length, 2);
  assert.equal(eco.getPlanet('old').taxBase, 999, 'restored tax base preserved');
  assert.equal(eco.getPlanet('old').taxRate, 0.33, 'restored tax rate preserved');
  assert.equal(eco.getPlanet('old').approval, 44, 'restored approval preserved');
  assert.equal(eco.getPlanet('new').system, 'Odin');
});

test('tickIfDue: 30일 경계에서만 1회 틱(중복적립 방지)', () => {
  const eco = createEconomyState();
  eco.registerPlanet('p1', { faction: 'empire', taxBase: 1000, taxRate: 0.1, approval: 100 });
  // 첫 호출(day 0): 주기 0 진입 → 틱.
  assert.notEqual(eco.tickIfDue({ gameDay: 0 }), null);
  const after0 = eco.treasuryOf('empire');
  assert.ok(after0 > 0);
  // 같은 주기 내(day 1, 29): 미틱(국고 불변).
  assert.equal(eco.tickIfDue({ gameDay: 1 }), null);
  assert.equal(eco.tickIfDue({ gameDay: 29 }), null);
  assert.equal(eco.treasuryOf('empire'), after0, '같은 달엔 중복적립 없음');
  // 다음 주기(day 30): 틱.
  assert.notEqual(eco.tickIfDue({ gameDay: 30 }), null);
  assert.ok(eco.treasuryOf('empire') > after0, '새 달에 추가 적립');
  // day 90으로 점프해도 1회만(여러 주기 건너뛰어도 적립 1회 — 호출자가 매 틱 부른다는 전제).
  const before90 = eco.treasuryOf('empire');
  assert.notEqual(eco.tickIfDue({ gameDay: 90 }), null);
  assert.ok(eco.treasuryOf('empire') > before90);
});

test('adjustApproval/adjustSecurity: 델타 적용 + 0..MAX 클램프, 미지 행성 null', () => {
  const eco = createEconomyState();
  eco.registerPlanet('p1', { faction: 'empire', approval: 50, security: 50 });
  // 分列行進: +支持率
  assert.equal(eco.adjustApproval('p1', 20), 70);
  // 상한 클램프
  assert.equal(eco.adjustApproval('p1', 100), 100);
  // 하한 클램프
  assert.equal(eco.adjustApproval('p1', -1000), 0);
  // 警戒出動: +治安
  assert.equal(eco.adjustSecurity('p1', 30), 80);
  assert.equal(eco.adjustSecurity('p1', -1000), 0);
  // 미지 행성
  assert.equal(eco.adjustApproval('nope', 10), null);
  assert.equal(eco.adjustSecurity('nope', 10), null);
});

test('武力鎮圧 패턴: 治安+ 와 支持率- 동시(핸들러가 둘 다 호출)', () => {
  const eco = createEconomyState();
  eco.registerPlanet('p1', { faction: 'empire', approval: 60, security: 40 });
  eco.adjustSecurity('p1', 15); // 치안↑
  eco.adjustApproval('p1', -15); // 지지율↓
  assert.equal(eco.getPlanet('p1').security, 55);
  assert.equal(eco.getPlanet('p1').approval, 45);
});

test('영속: toSnapshot/restore 라운드트립', () => {
  const eco = createEconomyState();
  eco.registerPlanet('p1', { faction: 'empire', taxBase: 1000, taxRate: 0.1 });
  eco.runEconomyTick({ gameDay: 30 });
  const snap = eco.toSnapshot();
  const eco2 = createEconomyState();
  eco2.restore(snap);
  assert.equal(eco2.treasuryOf('empire'), eco.treasuryOf('empire'));
  assert.deepEqual(eco2.toSnapshot(), snap);
});

// --- 감사 2026-06-20: approval 결측 NaN 방어 + addTreasury 가드 + 정복 동기(setSystemOwner) -----------

test('computePlanetTax: approval 결측이어도 NaN 아닌 유한값(Number.isFinite 방어)', () => {
  const tax = computePlanetTax({ taxBase: 1000, taxRate: 0.1 }); // approval 미지정
  assert.ok(Number.isFinite(tax), `유한값이어야: ${tax}`);
  assert.ok(tax > 0, '기본 approval(max)로 양의 세수');
  // 명시 approval=100과 동일(기본값이 approvalMax이므로).
  assert.equal(tax, computePlanetTax({ taxBase: 1000, taxRate: 0.1, approval: 100 }));
});

test('addTreasury: 음수/NaN은 무시(spendTreasury와 대칭)', () => {
  const e = createEconomyState();
  e.addTreasury('empire', 100);
  assert.equal(e.treasuryOf('empire'), 100);
  e.addTreasury('empire', -50); // 무시
  assert.equal(e.treasuryOf('empire'), 100);
  e.addTreasury('empire', NaN); // 무시
  assert.equal(e.treasuryOf('empire'), 100);
  e.addTreasury('empire', 25); // 정상
  assert.equal(e.treasuryOf('empire'), 125);
});

test('setSystemOwner: 정복 후 그 성계 세수가 새 진영 국고로 적립(이전엔 상실 진영에 계속 적립)', () => {
  const e = createEconomyState();
  seedEconomyFromSystems(e, [
    { name: 'Odin', faction: 'empire', planets: [{ name: 'odin1', population: 100 }, { name: 'odin2', population: 50 }] },
  ]);
  // 정복: Odin이 alliance로 넘어감.
  const changed = e.setSystemOwner('Odin', 'alliance');
  assert.equal(changed, 2, 'Odin의 두 행성 모두 갱신');
  const r = e.runEconomyTick({ gameDay: 30 });
  assert.ok((r.revenueByFaction.alliance ?? 0) > 0, '세수가 alliance로');
  assert.equal(r.revenueByFaction.empire ?? 0, 0, 'empire엔 세수 없음(소유 상실)');
});

test('economy 스냅샷: system 필드 + 국고 라운드트립 보존', () => {
  const e = createEconomyState();
  seedEconomyFromSystems(e, [{ name: 'Odin', faction: 'empire', planets: [{ name: 'odin1', population: 100 }] }]);
  e.addTreasury('empire', 500);
  const snap = e.toSnapshot();
  const e2 = createEconomyState();
  e2.restore(snap);
  assert.equal(e2.treasuryOf('empire'), 500);
  assert.equal(e2.getPlanet('odin1').system, 'Odin', 'system 필드 보존');
  // 복원 후 정복 동기도 동작.
  assert.equal(e2.setSystemOwner('Odin', 'alliance'), 1);
});
