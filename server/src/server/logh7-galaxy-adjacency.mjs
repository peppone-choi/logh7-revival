/**
 * Galaxy adjacency / corridor graph generator (strategic routing layer).
 *
 * The strategic galaxy in content/galaxy.json is a flat list of 80 star systems with screen-space
 * coordinates (cx/cy from the manual star chart) and an `is_corridor` flag. It has NO neighbor/edge
 * structure: nothing tells a fleet which systems it may sail to next. This module derives that
 * adjacency graph deterministically from geometry + the canon corridor topology, so a future
 * strategic-sim layer (gated behind LOGH_STRAT_SIM) can restrict fleet movement to adjacent systems
 * and reproduce the original chokepoints (Iserlohn / Feyzan).
 *
 * Why a corridor pass: the two factions' star clusters are spatially separated — pure proximity
 * edges (R=45) produce ZERO cross-faction links, leaving the empire and alliance halves permanently
 * disconnected. The canon corridors (is_corridor systems) are the only natural bridges, so we allow
 * an edge to cross faction lines ONLY when one endpoint is a corridor system and the two are within
 * CORRIDOR_RADIUS. That reproduces the strategic truth: you cannot reach the enemy half except
 * through Iserlohn or Feyzan.
 *
 * The graph keys systems by their `system` string (the Japanese name). That name is the only stable
 * id in galaxy.json — there is no numeric id — and it is already the join key used across the
 * codebase (world-state.seedSystems, content-db name_ja, base-record joins). neighborIds are arrays
 * of those names.
 *
 * Everything here is a pure function: no I/O, no timers, no worldRelay/network dependency. Fixed
 * input -> fixed output (oracle-testable). The build step that writes content/galaxy-adjacency.json
 * lives in tools/logh7_galaxy_adjacency.py (or this module's writer can be invoked offline).
 *
 * Data grade: the geometry (proximity edges) is P0 (derived from extracted cx/cy). The corridor
 * bridge topology (which systems the corridors connect) is P1 canon, validated against the data:
 * the only cross-faction edges produced are アルトミュール↔イゼルローン, ヴァンフリート↔イゼルローン
 * (Iserlohn corridor) and フェザーン↔ポレヴィト, フェザーン↔アイゼンヘルツ (Feyzan corridor). The
 * KMIN same-faction floor is a P2 connectivity heuristic (prevents far-flung systems from being
 * stranded); KMIN=3 is required — KMIN<3 strands an 11-node distant alliance subcluster.
 */

const DEFAULT_OPTS = Object.freeze({
  radius: 45.0,
  corridorRadius: 60.0,
  kMin: 3,
  navigableKey: 'navigable',
});

const round1 = (n) => Math.round(n * 10) / 10;

function distance(a, b) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

/**
 * Build the undirected adjacency graph for the strategic galaxy.
 *
 * @param {Array<{system:string, faction:string, cx:number, cy:number, is_corridor?:number}>} systems
 *   The galaxy.json `.systems` array. Each entry must have a string `system`, numeric cx/cy, and a
 *   faction; `is_corridor` (truthy) marks a corridor node. A node is excluded entirely when
 *   `system[navigableKey] === false` (future Task#2 navigable plumbing) — such a node gets no edges.
 * @param {object} [opts]
 * @param {number} [opts.radius=45]          same-faction proximity edge threshold
 * @param {number} [opts.corridorRadius=60]  corridor bridge edge threshold (the only cross-faction path)
 * @param {number} [opts.kMin=3]             same-faction nearest-neighbor floor (anti-fragmentation)
 * @param {string} [opts.navigableKey='navigable']  per-system key; `=== false` excludes the node
 * @returns {{ meta:{radius:number,corridorRadius:number,kMin:number,generated:boolean,nodes:number},
 *   adjacency: Record<string, Array<{system:string, dist:number, corridor:boolean}>> }}
 *   `adjacency[name]` is the neighbor list sorted by ascending dist (deterministic), no self-edges,
 *   no duplicates. `corridor` is true when the edge involved a corridor node (a routing chokepoint).
 */
export function buildAdjacency(systems, opts = {}) {
  const { radius, corridorRadius, kMin, navigableKey } = { ...DEFAULT_OPTS, ...opts };

  if (!Array.isArray(systems)) {
    throw new TypeError('buildAdjacency: systems must be an array');
  }

  // Only navigable, positioned nodes participate. `navigable:false` (when present) excludes a node
  // entirely so it ends up with an empty neighbor list (unreachable) — the "non-navigable principal"
  // handling. Absence of the key means navigable (default true).
  // 좌표 미확정 성계(coordinatePending; cx/cy가 유한수가 아님)는 위치가 없어 거리(edge)를 만들 수 없다 —
  // 좌표를 지어내는 대신 그래프에서 아예 제외한다(그렇지 않으면 NaN 거리로 고립 노드가 되어 connectivity
  // 불변식을 깬다). 캐논 로스터는 85지만 항행 그래프는 좌표확정 80개 위에서만 성립한다.
  const hasPosition = (s) => s.cx != null && s.cy != null
    && Number.isFinite(Number(s.cx))
    && Number.isFinite(Number(s.cy));
  const nodes = systems.filter((s) => s && s[navigableKey] !== false && s.coordinatePending !== true && hasPosition(s));

  const byName = new Map();
  const adjacency = new Map();
  for (const s of nodes) {
    const name = s.system;
    if (typeof name !== 'string' || name.length === 0) {
      throw new TypeError('buildAdjacency: each system needs a non-empty string `system`');
    }
    if (byName.has(name)) {
      throw new Error(`buildAdjacency: duplicate system name "${name}" — system name must be unique (graph key)`);
    }
    byName.set(name, s);
    adjacency.set(name, new Map()); // name -> { dist, corridor }
  }

  const link = (aName, bName, dist, corridor) => {
    if (aName === bName) return;
    const a = adjacency.get(aName);
    const b = adjacency.get(bName);
    if (!a || !b) return;
    // Keep an edge's corridor flag sticky: once a corridor-bridge edge, always a corridor edge.
    const prevA = a.get(bName);
    a.set(bName, { dist, corridor: corridor || (prevA ? prevA.corridor : false) });
    const prevB = b.get(aName);
    b.set(aName, { dist, corridor: corridor || (prevB ? prevB.corridor : false) });
  };

  // --- step 1: same-faction proximity edges + corridor cross-faction bridges ---
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const d = distance(a, b);
      const isCorridorEdge = Boolean(a.is_corridor || b.is_corridor);
      if (a.faction === b.faction && d <= radius) {
        link(a.system, b.system, round1(d), isCorridorEdge);
      } else if (isCorridorEdge && d <= corridorRadius) {
        // Corridors are the ONLY way an edge may cross faction lines (canon chokepoints). This also
        // captures same-faction corridor links (e.g. corridor->corridor inside one cluster).
        link(a.system, b.system, round1(d), true);
      }
    }
  }

  // --- step 2: same-faction K-nearest floor (anti-fragmentation; never forces cross-faction) ---
  for (const a of nodes) {
    const same = nodes
      .filter((s) => s !== a && s.faction === a.faction)
      .map((s) => ({ s, d: distance(a, s) }))
      .sort((p, q) => p.d - q.d || p.s.system.localeCompare(q.s.system));
    for (let k = 0; k < kMin && k < same.length; k += 1) {
      const { s, d } = same[k];
      const isCorridorEdge = Boolean(a.is_corridor || s.is_corridor);
      link(a.system, s.system, round1(d), isCorridorEdge);
    }
  }

  // --- materialize: deterministic neighbor arrays (dist asc, then name asc) ---
  const out = {};
  for (const [name, edges] of adjacency) {
    out[name] = [...edges.entries()]
      .map(([system, e]) => ({ system, dist: e.dist, corridor: e.corridor }))
      .sort((p, q) => p.dist - q.dist || p.system.localeCompare(q.system));
  }

  return {
    meta: {
      radius,
      corridorRadius,
      kMin,
      generated: false,
      nodes: nodes.length,
    },
    adjacency: out,
  };
}

/**
 * Accept either a full buildAdjacency result `{ adjacency: {...} }` or a bare adjacency map.
 * @param {object} adjacency
 * @returns {Record<string, Array<{system:string, dist:number, corridor:boolean}>>}
 */
function asMap(adjacency) {
  if (adjacency && typeof adjacency === 'object' && adjacency.adjacency && typeof adjacency.adjacency === 'object') {
    return adjacency.adjacency;
  }
  return adjacency || {};
}

/**
 * Routing helper: the neighbor system names of `name` (empty array if unknown/isolated).
 * @param {object} adjacency  buildAdjacency result, bare map, or loaded galaxy-adjacency.json
 * @param {string} name
 * @returns {string[]}
 */
export function neighborsOf(adjacency, name) {
  const map = asMap(adjacency);
  const edges = map[name];
  if (!Array.isArray(edges)) return [];
  return edges.map((e) => e.system);
}

/**
 * Routing helper: whether two systems share an edge (undirected). False for unknown names or self.
 * @param {object} adjacency
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function areAdjacent(adjacency, a, b) {
  if (a === b) return false;
  return neighborsOf(adjacency, a).includes(b);
}
