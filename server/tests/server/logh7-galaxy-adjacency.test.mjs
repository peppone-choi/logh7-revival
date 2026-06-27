/**
 * Galaxy adjacency / corridor graph tests.
 *
 * Two layers:
 *  - synthetic oracle graphs (tiny hand-built system lists) to pin the algorithm's exact behaviour:
 *    same-faction proximity, corridor cross-faction bridging, KMIN floor, navigable exclusion,
 *    undirected symmetry, determinism, dedup/self-edge rejection, helper functions.
 *  - the real content/galaxy.json, asserting the design's verified invariants: single connected
 *    component (80/80), the cross-faction edges restricted to the canon Iserlohn/Feyzan corridors,
 *    no isolated nodes, and JS<->generated-file parity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  buildAdjacency,
  neighborsOf,
  areAdjacent,
} from '../../src/server/logh7-galaxy-adjacency.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

function loadGalaxy() {
  return JSON.parse(readFileSync(join(REPO, 'content', 'galaxy.json'), 'utf-8'));
}
function loadAdjacencyFile() {
  return JSON.parse(readFileSync(join(REPO, 'content', 'galaxy-adjacency.json'), 'utf-8'));
}

// --- synthetic oracle --------------------------------------------------------

// A 1-D line of systems so distances are exact integers.
const sys = (system, faction, cx, extra = {}) => ({ system, faction, cx, cy: 0, ...extra });

test('same-faction proximity: links within radius, not beyond', () => {
  const systems = [
    sys('A', 'empire', 0),
    sys('B', 'empire', 30), // 30 <= 45 -> linked to A
    sys('C', 'empire', 100), // far from both, only KMIN floor will reach it
  ];
  const { adjacency } = buildAdjacency(systems, { radius: 45, corridorRadius: 60, kMin: 0 });
  assert.deepEqual(neighborsOf({ adjacency }, 'A'), ['B']);
  assert.deepEqual(neighborsOf({ adjacency }, 'C'), []); // 70 from B > radius, kMin=0
});

test('undirected symmetry: every edge appears on both endpoints with equal dist', () => {
  const galaxy = loadGalaxy();
  const { adjacency } = buildAdjacency(galaxy.systems);
  for (const [name, edges] of Object.entries(adjacency)) {
    for (const e of edges) {
      const back = adjacency[e.system].find((x) => x.system === name);
      assert.ok(back, `edge ${name}->${e.system} has no reverse`);
      assert.equal(back.dist, e.dist, `asymmetric dist on ${name}<->${e.system}`);
      assert.equal(back.corridor, e.corridor, `asymmetric corridor flag on ${name}<->${e.system}`);
    }
  }
});

test('no self-edges, no duplicate neighbors', () => {
  const galaxy = loadGalaxy();
  const { adjacency } = buildAdjacency(galaxy.systems);
  for (const [name, edges] of Object.entries(adjacency)) {
    const names = edges.map((e) => e.system);
    assert.ok(!names.includes(name), `${name} links to itself`);
    assert.equal(new Set(names).size, names.length, `${name} has duplicate neighbors`);
  }
});

test('corridor bridges cross faction lines; non-corridor proximity does not', () => {
  // E1(empire) and A1(alliance) are 50 apart (> radius 45) but a corridor sits between them.
  const systems = [
    sys('E1', 'empire', 0),
    sys('GATE', 'empire', 25, { is_corridor: 1 }), // corridor node
    sys('A1', 'alliance', 50),
    sys('A2', 'alliance', 80), // far alliance node, distinct cluster
  ];
  const { adjacency } = buildAdjacency(systems, { radius: 45, corridorRadius: 60, kMin: 0 });
  // GATE (corridor) bridges to the alliance side within corridorRadius (50<=60), crossing factions.
  assert.ok(areAdjacent({ adjacency }, 'GATE', 'A1'), 'corridor should bridge to alliance A1');
  const gateEdge = adjacency.GATE.find((e) => e.system === 'A1');
  assert.equal(gateEdge.corridor, true, 'cross-faction corridor edge flagged corridor');
  // E1<->A1 are 50 apart and NEITHER is a corridor -> no direct cross-faction edge.
  assert.equal(areAdjacent({ adjacency }, 'E1', 'A1'), false, 'non-corridor must not cross factions');
});

test('cross-faction edges exist ONLY through corridor nodes', () => {
  const galaxy = loadGalaxy();
  const { adjacency } = buildAdjacency(galaxy.systems);
  const facOf = new Map(galaxy.systems.map((s) => [s.system, s.faction]));
  const corridorOf = new Map(galaxy.systems.map((s) => [s.system, Boolean(s.is_corridor)]));
  for (const [name, edges] of Object.entries(adjacency)) {
    for (const e of edges) {
      if (facOf.get(name) !== facOf.get(e.system)) {
        assert.ok(
          corridorOf.get(name) || corridorOf.get(e.system),
          `cross-faction edge ${name}<->${e.system} without a corridor endpoint`,
        );
        assert.equal(e.corridor, true, `cross-faction edge ${name}<->${e.system} not flagged corridor`);
      }
    }
  }
});

test('KMIN floor connects far same-faction nodes; KMIN<3 strands a subcluster (design invariant)', () => {
  const galaxy = loadGalaxy();
  const countComponents = (adjacency) => {
    const seen = new Set();
    let comps = 0;
    for (const start of Object.keys(adjacency)) {
      if (seen.has(start)) continue;
      comps += 1;
      const stack = [start];
      while (stack.length) {
        const x = stack.pop();
        if (seen.has(x)) continue;
        seen.add(x);
        for (const e of adjacency[x]) if (!seen.has(e.system)) stack.push(e.system);
      }
    }
    return comps;
  };
  const k3 = buildAdjacency(galaxy.systems, { kMin: 3 });
  assert.equal(countComponents(k3.adjacency), 1, 'KMIN=3 must yield a single connected galaxy');
  const k2 = buildAdjacency(galaxy.systems, { kMin: 2 });
  assert.ok(countComponents(k2.adjacency) > 1, 'KMIN=2 must fragment (justifies KMIN=3 default)');
});

test('navigable:false excludes a node entirely (no edges anywhere)', () => {
  const systems = [
    sys('A', 'empire', 0),
    sys('B', 'empire', 20),
    sys('DEAD', 'empire', 10, { navigable: false }), // sits between A and B but is unnavigable
  ];
  const { adjacency } = buildAdjacency(systems, { radius: 45, kMin: 3 });
  assert.ok(!('DEAD' in adjacency), 'unnavigable node must not appear in the graph');
  assert.ok(!neighborsOf({ adjacency }, 'A').includes('DEAD'));
  assert.ok(!neighborsOf({ adjacency }, 'B').includes('DEAD'));
  // A and B still link to each other normally.
  assert.ok(areAdjacent({ adjacency }, 'A', 'B'));
});

test('custom navigableKey is honoured', () => {
  const systems = [
    sys('A', 'empire', 0),
    sys('B', 'empire', 20, { passable: false }),
  ];
  const { adjacency } = buildAdjacency(systems, { navigableKey: 'passable' });
  assert.ok(!('B' in adjacency));
});

test('neighbor arrays are sorted by ascending dist (deterministic)', () => {
  const galaxy = loadGalaxy();
  const { adjacency } = buildAdjacency(galaxy.systems);
  for (const edges of Object.values(adjacency)) {
    for (let i = 1; i < edges.length; i += 1) {
      assert.ok(edges[i - 1].dist <= edges[i].dist, 'neighbors not sorted by dist');
    }
  }
});

test('determinism: same input twice -> identical output', () => {
  const galaxy = loadGalaxy();
  const a = JSON.stringify(buildAdjacency(galaxy.systems));
  const b = JSON.stringify(buildAdjacency(galaxy.systems));
  assert.equal(a, b);
});

test('duplicate system names are rejected (name is the graph key)', () => {
  assert.throws(
    () => buildAdjacency([sys('X', 'empire', 0), sys('X', 'empire', 10)]),
    /duplicate system name/,
  );
});

test('non-array input rejected', () => {
  assert.throws(() => buildAdjacency(null), TypeError);
});

// --- helpers contract --------------------------------------------------------

test('neighborsOf / areAdjacent accept a full result OR a bare map OR the loaded file', () => {
  const galaxy = loadGalaxy();
  const result = buildAdjacency(galaxy.systems);
  const bareMap = result.adjacency;
  const file = loadAdjacencyFile();
  for (const form of [result, bareMap, file]) {
    assert.ok(areAdjacent(form, 'イゼルローン', 'ヴァンフリート'), 'corridor neighbor expected');
    assert.ok(neighborsOf(form, 'イゼルローン').includes('ヴァンフリート'));
  }
  // self is never adjacent; unknowns return empty / false.
  assert.equal(areAdjacent(result, 'イゼルローン', 'イゼルローン'), false);
  assert.deepEqual(neighborsOf(result, 'NOPE_NOT_A_SYSTEM'), []);
  assert.equal(areAdjacent(result, 'NOPE', 'ALSO_NOPE'), false);
});

// --- real-data invariants (design verification) ------------------------------

test('content/galaxy.json -> single connected component, no isolated nodes', () => {
  const galaxy = loadGalaxy();
  const { adjacency, meta } = buildAdjacency(galaxy.systems);
  assert.equal(meta.nodes, 80);
  const isolated = Object.values(adjacency).filter((e) => e.length === 0);
  assert.equal(isolated.length, 0, 'no isolated systems allowed');
  // degrees within the design-verified envelope.
  const degs = Object.values(adjacency).map((e) => e.length);
  assert.ok(Math.min(...degs) >= 2, 'min degree >= 2');
  assert.ok(Math.max(...degs) <= 6, 'max degree <= 6');
});

test('content/galaxy.json -> cross-faction edges are exactly the canon corridors', () => {
  const galaxy = loadGalaxy();
  const { adjacency } = buildAdjacency(galaxy.systems);
  const facOf = new Map(galaxy.systems.map((s) => [s.system, s.faction]));
  const cross = new Set();
  for (const [name, edges] of Object.entries(adjacency)) {
    for (const e of edges) {
      if (facOf.get(name) !== facOf.get(e.system)) {
        cross.add([name, e.system].sort().join('|'));
      }
    }
  }
  const expected = new Set([
    ['アイゼンヘルツ', 'フェザーン'].sort().join('|'), // Feyzan corridor -> empire
    ['フェザーン', 'ポレヴィト'].sort().join('|'), // Feyzan corridor -> alliance
    ['アルトミュール', 'イゼルローン'].sort().join('|'), // Iserlohn corridor
    ['イゼルローン', 'ヴァンフリート'].sort().join('|'), // Iserlohn corridor
  ]);
  assert.deepEqual([...cross].sort(), [...expected].sort());
});

test('generated content/galaxy-adjacency.json matches a fresh build (parity)', () => {
  const galaxy = loadGalaxy();
  const built = buildAdjacency(galaxy.systems);
  const file = loadAdjacencyFile();
  assert.deepEqual(file.adjacency, built.adjacency, 'committed file is stale — re-run logh7_galaxy_adjacency.py');
});
