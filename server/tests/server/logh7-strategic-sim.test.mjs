import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createWorldState } from '../../src/server/logh7-world-state.mjs';
import {
  buildStrategicGraph,
  buildCanonGraph,
  seedStrategicFleets,
  strategicTick,
  resolveStrategicBattle,
  decideStrategicOrder,
  systemNameToCell,
  createStrategicSim,
  mulberry32,
  shouldBroadcastTick,
  STRAT_FLEET_BASE,
  DEFAULT_CAPITALS,
  FACTION_WIRE,
} from '../../src/server/logh7-strategic-sim.mjs';

// --- fixtures --------------------------------------------------------------------------------------------

const GALAXY = JSON.parse(readFileSync(new URL('../../content/galaxy.json', import.meta.url), 'utf8'));

/** Seed a world-state from the recovered galaxy (same shape the auth-server feeds seedSystems). */
function seededWorld() {
  const ws = createWorldState();
  ws.seedSystems(
    GALAXY.systems.map((s) => ({
      name: s.system,
      faction: s.faction,
      isCorridor: s.is_corridor,
      map: typeof s.cx === 'number' && typeof s.cy === 'number' ? { cx: s.cx, cy: s.cy } : null,
      planets: s.planets,
    })),
  );
  return ws;
}

/** A tiny hand-built 4-system graph for isolated decision/move tests (deterministic, no galaxy.json). */
function miniWorld() {
  const ws = createWorldState();
  ws.seedSystems([
    { name: 'A', faction: 'empire', map: { cx: 0, cy: 0 }, planets: [{ name: 'a1' }] },
    { name: 'B', faction: 'empire', map: { cx: 10, cy: 0 }, planets: [{ name: 'b1' }] },
    { name: 'N', faction: 'neutral', map: { cx: 20, cy: 0 }, planets: [{ name: 'n1' }] },
    { name: 'E', faction: 'alliance', map: { cx: 30, cy: 0 }, planets: [{ name: 'e1' }] },
  ]);
  const graph = buildStrategicGraph(ws.listSystems(), { kNearest: 2, maxDist: 25 });
  return { ws, graph };
}

const STUB_ROSTER = [
  { faction: 'empire', stats_known: true, name_romaji: 'Imp1', stats: { tochi: 100, shiki: 90, kido: 80, kogeki: 110, bogyo: 40 } },
  { faction: 'empire', stats_known: true, name_romaji: 'Imp2', stats: { tochi: 80, shiki: 70, kido: 60, kogeki: 60, bogyo: 90 } },
  { faction: 'alliance', stats_known: true, name_romaji: 'All1', stats: { tochi: 95, shiki: 85, kido: 70, kogeki: 100, bogyo: 50 } },
  { faction: 'alliance', stats_known: true, name_romaji: 'All2', stats: { tochi: 60, shiki: 40, kido: 40, kogeki: 40, bogyo: 95 } },
];

// --- mulberry32 ------------------------------------------------------------------------------------------

test('mulberry32 is deterministic and in [0,1)', () => {
  const a = mulberry32(123);
  const b = mulberry32(123);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) {
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
  // different seed → different stream
  const c = mulberry32(124);
  assert.notEqual(c(), seqA[0]);
});

// --- buildStrategicGraph ---------------------------------------------------------------------------------

test('graph is symmetric and covers every galaxy node', () => {
  const ws = seededWorld();
  const graph = buildStrategicGraph(ws.listSystems());
  assert.equal(graph.nodes.size, GALAXY.systems.length);
  // symmetry: a ∈ N(b) ⇔ b ∈ N(a)
  for (const [a, nbs] of graph.neighbors) {
    for (const b of nbs) {
      assert.ok((graph.neighbors.get(b) ?? []).includes(a), `edge ${a}->${b} not mirrored`);
    }
  }
  // every node has at least one neighbour (galaxy is dense enough at default maxDist)
  for (const nbs of graph.neighbors.values()) {
    assert.ok(nbs.length >= 1);
  }
});

test('graph build is deterministic and isolated (no-coord) nodes stay safe', () => {
  const ws = createWorldState();
  ws.seedSystems([
    { name: 'A', faction: 'empire', map: { cx: 0, cy: 0 }, planets: [] },
    { name: 'B', faction: 'empire', map: { cx: 5, cy: 0 }, planets: [] },
    { name: 'Lost', faction: 'neutral', map: null, planets: [] }, // no cx/cy → isolated
  ]);
  const g1 = buildStrategicGraph(ws.listSystems(), { kNearest: 2, maxDist: 50 });
  const g2 = buildStrategicGraph(ws.listSystems(), { kNearest: 2, maxDist: 50 });
  assert.deepEqual([...g1.neighbors.entries()], [...g2.neighbors.entries()]);
  assert.deepEqual(g1.neighbors.get('Lost'), []); // isolated, no edges
  assert.ok(g1.neighbors.get('A').includes('B'));
});

test('corridor systems get extended reach', () => {
  const ws = createWorldState();
  ws.seedSystems([
    { name: 'C', faction: 'empire', isCorridor: true, map: { cx: 0, cy: 0 }, planets: [] },
    { name: 'P', faction: 'empire', isCorridor: false, map: { cx: 0, cy: 0 }, planets: [] },
    { name: 'Far', faction: 'alliance', map: { cx: 0, cy: 140 }, planets: [] }, // beyond maxDist 120, within 120*1.5
  ]);
  const g = buildStrategicGraph(ws.listSystems(), { kNearest: 4, maxDist: 120, corridorScale: 1.5 });
  assert.ok(g.neighbors.get('C').includes('Far'), 'corridor C should reach Far (180 reach)');
  // P (non-corridor) only reaches Far if symmetrised from C, so check the directed intent via distance
  assert.equal(Math.round(g.distance('C', 'Far')), 140);
});

// --- seedStrategicFleets ---------------------------------------------------------------------------------

test('seeds fleetsPerFaction fleets per faction with collision-free ids in the strat block', () => {
  const ws = seededWorld();
  const graph = buildStrategicGraph(ws.listSystems());
  const { fleets, byFaction } = seedStrategicFleets(ws, graph, { seed: 1, fleetsPerFaction: 6 });
  assert.equal(fleets.length, 12);
  assert.equal(byFaction.get('empire').length, 6);
  assert.equal(byFaction.get('alliance').length, 6);
  // ids unique and inside the strat block
  const ids = new Set(fleets.map((f) => f.id));
  assert.equal(ids.size, 12);
  for (const id of ids) {
    assert.ok(id >= STRAT_FLEET_BASE && id < STRAT_FLEET_BASE + 0x1000, `id 0x${id.toString(16)} out of strat block`);
  }
  // world-state wire entities created too, with numeric faction
  assert.equal(ws.fleetCount(), 12);
  const anyEmpire = byFaction.get('empire')[0];
  assert.equal(ws.getFleet(anyEmpire.id).faction, FACTION_WIRE.empire);
});

test('commanders are canon faction-matched officers with a behavior profile', () => {
  const ws = miniWorld().ws;
  const graph = buildStrategicGraph(ws.listSystems(), { kNearest: 2, maxDist: 25 });
  const { byFaction } = seedStrategicFleets(ws, graph, { seed: 1, fleetsPerFaction: 2, roster: STUB_ROSTER, factions: ['empire', 'alliance'] });
  const emp = byFaction.get('empire');
  assert.equal(emp.length, 2);
  // strongest tochi first (Imp1 tochi100 > Imp2 tochi80)
  assert.equal(emp[0].commanderName, 'Imp1');
  // behavior profile derived from stats (kogeki 110 → high aggression)
  assert.ok(emp[0].profile.aggression > emp[1].profile.aggression);
  assert.ok(typeof emp[0].profile.command === 'number');
});

test('resolveCapital falls back deterministically when capital name absent', () => {
  const ws = createWorldState();
  // empire systems but NO ヴァルハラ — fallback should be highest-degree empire node
  ws.seedSystems([
    { name: 'Hub', faction: 'empire', map: { cx: 0, cy: 0 }, planets: [] },
    { name: 'Spoke1', faction: 'empire', map: { cx: 5, cy: 0 }, planets: [] },
    { name: 'Spoke2', faction: 'empire', map: { cx: 0, cy: 5 }, planets: [] },
    { name: 'Enemy', faction: 'alliance', map: { cx: 100, cy: 100 }, planets: [] },
  ]);
  const graph = buildStrategicGraph(ws.listSystems(), { kNearest: 3, maxDist: 50 });
  const { capitals } = seedStrategicFleets(ws, graph, { seed: 1, fleetsPerFaction: 2, roster: STUB_ROSTER, factions: ['empire'] });
  // a fallback was chosen from the empire nodes (not the literal DEFAULT_CAPITALS.empire which is absent)
  assert.ok(['Hub', 'Spoke1', 'Spoke2'].includes(capitals.empire));
});

// --- systemNameToCell ------------------------------------------------------------------------------------

test('systemNameToCell is deterministic and unknown → 0', () => {
  const ws = seededWorld();
  const graph = buildStrategicGraph(ws.listSystems());
  const name = [...graph.nodes.keys()][0];
  assert.equal(systemNameToCell(name, graph), systemNameToCell(name, graph));
  assert.equal(systemNameToCell('___no_such_system___', graph), 0);
});

// --- resolveStrategicBattle ------------------------------------------------------------------------------

test('stronger + higher command fleet wins and loser strength collapses', () => {
  const rng = mulberry32(7);
  const strong = { strength: 2000, profile: { command: 0.9, aggression: 0.8, caution: 0.3 } };
  const weak = { strength: 800, profile: { command: 0.3, aggression: 0.3, caution: 0.3 } };
  const r = resolveStrategicBattle(strong, weak, rng);
  assert.equal(r.winner, strong);
  assert.ok(weak.strength < 800, 'loser strength reduced');
  assert.ok(strong.strength <= 2000, 'winner takes some losses');
  assert.ok(strong.strength >= 1, 'winner survives');
});

test('battle is deterministic for a fixed seed', () => {
  const mk = () => ({ a: { strength: 1500, profile: { command: 0.6, aggression: 0.5, caution: 0.4 } }, d: { strength: 1400, profile: { command: 0.55, aggression: 0.5, caution: 0.4 } } });
  const run = () => { const { a, d } = mk(); const r = resolveStrategicBattle(a, d, mulberry32(99)); return [r.winner === a, a.strength, d.strength]; };
  assert.deepEqual(run(), run());
});

// --- decideStrategicOrder --------------------------------------------------------------------------------

test('decideStrategicOrder advances onto an undefended enemy/neutral neighbour', () => {
  const { ws, graph } = miniWorld();
  // fleet at B (empire) — neighbours include N (neutral) and via reach maybe E (alliance)
  const fleet = {
    id: STRAT_FLEET_BASE, faction: 'empire', system: 'B', homeSystem: 'A', strength: 1000, supply: 600,
    stats: { tochi: 90 }, profile: { aggression: 0.8, caution: 0.2, command: 0.6, retreatBelow: 0.2 },
  };
  const simState = { fleetsById: new Map([[fleet.id, fleet]]), baseSeed: 1 };
  const decision = decideStrategicOrder(fleet, ws, graph, simState, mulberry32(1));
  assert.equal(decision.order, 'advance');
  assert.ok(['N', 'E'].includes(decision.target), `unexpected target ${decision.target}`);
});

test('decideStrategicOrder reinforces when crippled', () => {
  const { ws, graph } = miniWorld();
  const fleet = {
    id: STRAT_FLEET_BASE, faction: 'empire', system: 'B', homeSystem: 'A', strength: 50, supply: 600,
    stats: { tochi: 90 }, profile: { aggression: 0.5, caution: 0.5, command: 0.5, retreatBelow: 0.2 },
  };
  const simState = { fleetsById: new Map([[fleet.id, fleet]]), baseSeed: 1 };
  const decision = decideStrategicOrder(fleet, ws, graph, simState, mulberry32(1));
  assert.equal(decision.order, 'reinforce');
});

test('decideStrategicOrder holds in a rear system (no enemy/neutral neighbour)', () => {
  const ws = createWorldState();
  ws.seedSystems([
    { name: 'A', faction: 'empire', map: { cx: 0, cy: 0 }, planets: [] },
    { name: 'B', faction: 'empire', map: { cx: 5, cy: 0 }, planets: [] },
  ]);
  const graph = buildStrategicGraph(ws.listSystems(), { kNearest: 1, maxDist: 50 });
  const fleet = {
    id: STRAT_FLEET_BASE, faction: 'empire', system: 'A', homeSystem: 'A', strength: 1000, supply: 600,
    stats: { tochi: 90 }, profile: { aggression: 0.5, caution: 0.5, command: 0.5, retreatBelow: 0.2 },
  };
  const simState = { fleetsById: new Map([[fleet.id, fleet]]), baseSeed: 1 };
  const decision = decideStrategicOrder(fleet, ws, graph, simState, mulberry32(1));
  assert.equal(decision.order, 'hold');
});

// --- strategicTick: adjacency, ownership, determinism --------------------------------------------------

test('advance onto an undefended neutral conquers it via world-state (adjacency-constrained)', () => {
  const { ws, graph } = miniWorld();
  // single empire fleet on B; N is a neutral neighbour, A/B empire-owned.
  const { fleets } = seedStrategicFleets(ws, graph, { seed: 1, fleetsPerFaction: 1, roster: STUB_ROSTER, factions: ['empire'] });
  // force the fleet onto B so N is reachable, with aggressive profile.
  const fleet = fleets[0];
  fleet.system = 'B';
  fleet.profile = { ...fleet.profile, aggression: 0.95, caution: 0.1, retreatBelow: 0.1 };
  const simState = { fleetsById: new Map([[fleet.id, fleet]]), baseSeed: 1 };
  const before = ws.getSystem('N').owner;
  assert.equal(before, 'neutral');
  // run until the fleet reaches and conquers N (it must MOVE there first; adjacency-limited so it cannot
  // jump straight to the far alliance system E without passing through).
  let conqueredN = false;
  const visited = new Set();
  for (let t = 1; t <= 20 && !conqueredN; t += 1) {
    const r = strategicTick(ws, graph, simState, { seed: 1, tickNo: t });
    for (const c of r.conquests) {
      visited.add(c.system);
      if (c.system === 'N') conqueredN = true;
    }
    // adjacency constraint: every move is between graph neighbours
    for (const mv of r.moves) {
      assert.ok((graph.neighbors.get(mv.from) ?? []).includes(mv.to), `illegal jump ${mv.from}->${mv.to}`);
    }
  }
  assert.ok(visited.has('N') || ws.getSystem('N').owner === 'empire', 'neutral N eventually conquered');
});

test('strategicTick is fully deterministic for a fixed seed (galaxy scale)', () => {
  const run = () => {
    const ws = seededWorld();
    const graph = buildStrategicGraph(ws.listSystems());
    const sim = createStrategicSim(ws, graph, { seed: 4242 });
    const trace = [];
    for (let t = 1; t <= 12; t += 1) {
      const r = sim.tick(t);
      trace.push([
        r.moves.map((m) => `${m.fleetId}:${m.from}>${m.to}`).join('|'),
        r.conquests.map((c) => `${c.system}=${c.to}`).join(','),
        r.battles.length,
      ].join('#'));
    }
    // final ownership snapshot
    const owners = {};
    for (const s of ws.listSystems()) owners[s.owner] = (owners[s.owner] ?? 0) + 1;
    return { trace: trace.join('\n'), owners };
  };
  const a = run();
  const b = run();
  assert.equal(a.trace, b.trace, 'tick sequence must be reproducible');
  assert.deepEqual(a.owners, b.owners, 'final ownership must be reproducible');
});

test('strategicTick advances the war with ZERO connected players (worldRelay-independent)', () => {
  // No relay / no players involved at all — the sim is pure world-state. Ownership must shift over time.
  const ws = seededWorld();
  const graph = buildStrategicGraph(ws.listSystems());
  const sim = createStrategicSim(ws, graph, { seed: 1 });
  const initialEmpire = ws.listSystems().filter((s) => s.owner === 'empire').length;
  let anyConquest = false;
  for (let t = 1; t <= 15; t += 1) {
    const r = sim.tick(t);
    if (r.conquests.length) anyConquest = true;
  }
  assert.ok(anyConquest, 'simulation must produce ownership changes without any player');
  const finalEmpire = ws.listSystems().filter((s) => s.owner === 'empire').length;
  assert.notEqual(finalEmpire, initialEmpire, 'territory balance must change over 15 ticks');
});

test('DEFAULT_CAPITALS reference the recovered galaxy systems', () => {
  const names = new Set(GALAXY.systems.map((s) => s.system));
  assert.ok(names.has(DEFAULT_CAPITALS.empire), 'empire capital present in galaxy');
  assert.ok(names.has(DEFAULT_CAPITALS.alliance), 'alliance capital present in galaxy');
});

test('seedStrategicFleets: commander charId가 진영 간 충돌하지 않음(전역 유일, 감사 2026-06-20)', () => {
  const { ws, graph } = miniWorld();
  const { byFaction } = seedStrategicFleets(ws, graph, { seed: 1, fleetsPerFaction: 2, roster: STUB_ROSTER, factions: ['empire', 'alliance'] });
  const empIds = byFaction.get('empire').map((f) => f.commander);
  const allIds = byFaction.get('alliance').map((f) => f.commander);
  const overlap = empIds.filter((id) => allIds.includes(id));
  assert.equal(overlap.length, 0, `empire/alliance commander id 충돌 없음: ${empIds} vs ${allIds}`);
});

// --- shouldBroadcastTick (auth-server broadcast gate, PURE) --------------------------------------------

test('shouldBroadcastTick: zero players never broadcasts (worldRelay-independence)', () => {
  // even a tick full of moves/conquests emits nothing when nobody is in-world.
  assert.equal(shouldBroadcastTick(0, { moves: [{}], conquests: [{}] }), false);
  assert.equal(shouldBroadcastTick(0, { moves: [], conquests: [] }), false);
});

test('shouldBroadcastTick: players present broadcasts only on a visible change (move/conquest)', () => {
  // visible delta on the 0x0325 unit table → re-push.
  assert.equal(shouldBroadcastTick(1, { moves: [{}], conquests: [] }), true);
  assert.equal(shouldBroadcastTick(2, { moves: [], conquests: [{}] }), true);
  assert.equal(shouldBroadcastTick(1, { moves: [{}], conquests: [{}] }), true);
});

test('shouldBroadcastTick: players present but no visible change → no broadcast (battle/reinforce/hold only)', () => {
  // battles alone don't move/conquer (strength isn't on the unit record) → silent.
  assert.equal(shouldBroadcastTick(1, { moves: [], conquests: [], battles: [{}], reinforcements: [{}] }), false);
  assert.equal(shouldBroadcastTick(3, { moves: [], conquests: [] }), false);
});

test('shouldBroadcastTick: null/undefined result is safe', () => {
  assert.equal(shouldBroadcastTick(5, null), false);
  assert.equal(shouldBroadcastTick(5, undefined), false);
  assert.equal(shouldBroadcastTick(5, {}), false);
});

// --- buildCanonGraph: canon corridor topology fed into the sim graph interface ----------------------------

const ADJACENCY = JSON.parse(readFileSync(new URL('../../content/galaxy-adjacency.json', import.meta.url), 'utf8'));

test('buildCanonGraph: same {nodes,neighbors,distance} interface, every system is a node', () => {
  const g = buildCanonGraph(GALAXY.systems, ADJACENCY);
  assert.equal(g.nodes.size, GALAXY.systems.length);
  assert.ok(g.neighbors instanceof Map);
  assert.equal(typeof g.distance, 'function');
  // distance reuses euclidean from cx/cy (same as buildStrategicGraph)
  const a = GALAXY.systems[0].system;
  const b = g.neighbors.get(a)[0];
  assert.ok(g.distance(a, b) > 0 && Number.isFinite(g.distance(a, b)));
});

test('buildCanonGraph: graph is fully connected (corridors bridge the two faction clusters)', () => {
  const g = buildCanonGraph(GALAXY.systems, ADJACENCY);
  const start = [...g.nodes.keys()][0];
  const seen = new Set([start]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) for (const nb of g.neighbors.get(cur) ?? []) {
      if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
    }
    frontier = next;
  }
  assert.equal(seen.size, g.nodes.size, 'every system reachable — no stranded subcluster');
});

test('buildCanonGraph: cross-faction edges exist ONLY through corridor systems (canon chokepoints)', () => {
  const g = buildCanonGraph(GALAXY.systems, ADJACENCY);
  let illegal = 0;
  let crossViaCorridor = 0;
  for (const [a, nbs] of g.neighbors) for (const b of nbs) {
    const na = g.nodes.get(a);
    const nb = g.nodes.get(b);
    if (na.faction !== nb.faction && na.faction !== 'neutral' && nb.faction !== 'neutral') {
      if (na.isCorridor || nb.isCorridor) crossViaCorridor += 1;
      else illegal += 1;
    }
  }
  assert.equal(illegal, 0, 'no cross-faction edge bypasses a corridor');
  assert.ok(crossViaCorridor > 0, 'corridors actually connect the factions');
});

test('buildCanonGraph: neighbors are symmetric and self-free', () => {
  const g = buildCanonGraph(GALAXY.systems, ADJACENCY);
  for (const [a, nbs] of g.neighbors) {
    assert.ok(!nbs.includes(a), `${a} has no self-edge`);
    for (const b of nbs) {
      assert.ok((g.neighbors.get(b) ?? []).includes(a), `edge ${a}-${b} is symmetric`);
    }
  }
});

test('buildCanonGraph: falls back to euclidean graph when canon adjacency is missing', () => {
  const g = buildCanonGraph(GALAXY.systems, null);
  assert.equal(g.nodes.size, GALAXY.systems.length);
  // euclidean fallback still produces a usable (non-empty) neighbor topology
  assert.ok([...g.neighbors.values()].some((nbs) => nbs.length > 0));
});
