#!/usr/bin/env python3
"""Build the galaxy adjacency / corridor graph from content/galaxy.json.

Mirror of src/server/logh7-galaxy-adjacency.mjs buildAdjacency (kept byte-compatible so the JS
loader and this extractor agree). Reads the 80-system star chart (cx/cy + is_corridor) and emits
content/galaxy-adjacency.json: a deterministic undirected neighbor graph used by the future strategic
routing layer (fleets may only move to adjacent systems; cross-faction travel only via the canon
Iserlohn/Feyzan corridors).

Algorithm (3 steps; see the .mjs for the rationale):
  1. same-faction edge when dist <= RADIUS; corridor bridge edge when either endpoint is a corridor
     and dist <= CORRIDOR_RADIUS (the only way an edge may cross faction lines).
  2. same-faction K-nearest floor (KMIN) to prevent stranded subclusters (never forces cross-faction).
  3. nodes with navigable == False are excluded entirely (empty neighbor list).

Node key = the `system` string (Japanese name) — the only stable id and the codebase-wide join key.

Usage:
  python tools/logh7_galaxy_adjacency.py            # write content/galaxy-adjacency.json
  python tools/logh7_galaxy_adjacency.py --check     # build + print stats, do not write
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GALAXY_PATH = REPO_ROOT / "content" / "galaxy.json"
OUT_PATH = REPO_ROOT / "content" / "galaxy-adjacency.json"

RADIUS = 45.0
CORRIDOR_RADIUS = 60.0
KMIN = 3
NAVIGABLE_KEY = "navigable"


def _round1(n: float) -> float:
    return round(n * 10) / 10


def _dist(a: dict, b: dict) -> float:
    return math.hypot(a["cx"] - b["cx"], a["cy"] - b["cy"])


def build_adjacency(
    systems: list[dict],
    radius: float = RADIUS,
    corridor_radius: float = CORRIDOR_RADIUS,
    kmin: int = KMIN,
    navigable_key: str = NAVIGABLE_KEY,
) -> dict:
    nodes = [s for s in systems if s.get(navigable_key, True) is not False]

    adjacency: dict[str, dict[str, dict]] = {}
    for s in nodes:
        name = s["system"]
        if not isinstance(name, str) or not name:
            raise ValueError("each system needs a non-empty string `system`")
        if name in adjacency:
            raise ValueError(f'duplicate system name "{name}" — system name must be unique (graph key)')
        adjacency[name] = {}

    def link(a_name: str, b_name: str, dist: float, corridor: bool) -> None:
        if a_name == b_name:
            return
        prev_a = adjacency[a_name].get(b_name)
        adjacency[a_name][b_name] = {
            "dist": dist,
            "corridor": corridor or (prev_a["corridor"] if prev_a else False),
        }
        prev_b = adjacency[b_name].get(a_name)
        adjacency[b_name][a_name] = {
            "dist": dist,
            "corridor": corridor or (prev_b["corridor"] if prev_b else False),
        }

    # step 1: same-faction proximity + corridor cross-faction bridges
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            a, b = nodes[i], nodes[j]
            d = _dist(a, b)
            is_corridor_edge = bool(a.get("is_corridor") or b.get("is_corridor"))
            if a["faction"] == b["faction"] and d <= radius:
                link(a["system"], b["system"], _round1(d), is_corridor_edge)
            elif is_corridor_edge and d <= corridor_radius:
                link(a["system"], b["system"], _round1(d), True)

    # step 2: same-faction K-nearest floor
    for a in nodes:
        same = sorted(
            (s for s in nodes if s is not a and s["faction"] == a["faction"]),
            key=lambda s: (_dist(a, s), s["system"]),
        )
        for s in same[:kmin]:
            is_corridor_edge = bool(a.get("is_corridor") or s.get("is_corridor"))
            link(a["system"], s["system"], _round1(_dist(a, s)), is_corridor_edge)

    out: dict[str, list[dict]] = {}
    for name, edges in adjacency.items():
        out[name] = sorted(
            ({"system": n, "dist": e["dist"], "corridor": e["corridor"]} for n, e in edges.items()),
            key=lambda e: (e["dist"], e["system"]),
        )

    return {
        "_source": "galaxy.json cx/cy + is_corridor",
        "_generated": "tools/logh7_galaxy_adjacency.py",
        "_params": {"radius": radius, "corridorRadius": corridor_radius, "kMin": kmin},
        "meta": {
            "radius": radius,
            "corridorRadius": corridor_radius,
            "kMin": kmin,
            "generated": True,
            "nodes": len(nodes),
        },
        "adjacency": out,
    }


def _stats(result: dict, systems: list[dict]) -> dict:
    adj = result["adjacency"]
    fac = {s["system"]: s["faction"] for s in systems}
    # connected components (undirected BFS)
    seen: set[str] = set()
    components = 0
    for n in adj:
        if n in seen:
            continue
        components += 1
        stack = [n]
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            stack.extend(e["system"] for e in adj[x] if e["system"] not in seen)
    degs = [len(v) for v in adj.values()]
    cross = set()
    for i, edges in adj.items():
        for e in edges:
            j = e["system"]
            if fac.get(i) != fac.get(j):
                cross.add(tuple(sorted((i, j))))
    return {
        "nodes": len(adj),
        "components": components,
        "degree_min": min(degs) if degs else 0,
        "degree_mean": round(sum(degs) / len(degs), 2) if degs else 0,
        "degree_max": max(degs) if degs else 0,
        "isolated": sum(1 for v in adj.values() if not v),
        "cross_faction_edges": sorted(cross),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build galaxy adjacency/corridor graph.")
    parser.add_argument("--galaxy", type=Path, default=GALAXY_PATH)
    parser.add_argument("--out", type=Path, default=OUT_PATH)
    parser.add_argument("--check", action="store_true", help="build + print stats, do not write")
    args = parser.parse_args(argv)

    # 콘솔이 cp949 등 비유니코드여도 일본어 성계명을 안전하게 출력 (파일 쓰기는 항상 UTF-8).
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    except (AttributeError, ValueError):
        pass

    galaxy = json.loads(args.galaxy.read_text(encoding="utf-8"))
    systems = galaxy["systems"]
    result = build_adjacency(systems)
    stats = _stats(result, systems)

    if args.check:
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        return 0

    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    tmp = args.out.with_suffix(args.out.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, args.out)
    print(json.dumps({"wrote": str(args.out), **stats}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
