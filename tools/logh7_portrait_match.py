"""Deterministic portrait identification for LOGH VII — NO AI vision, NO hallucination.

Identity is assigned ONLY by pixel cross-correlation (NCC) of a KEYED reference portrait
(e.g. an official gineiden.com chara/NNN.jpg whose name is known from the archived
st_char.html) against every decoded tcf face slot. A match is ACCEPTED only when it is both
strong AND discriminating:

    accept  <=>  best_ncc >= NCC_MIN (0.85)  AND  best_ncc - second_ncc >= GAP_MIN (0.10)

This is the criterion that separated Yang (0.918, gap 0.19 -> ACCEPT) from Schoenkopp
(0.60, gap ~0.00 -> REJECT) in the surviving-ground-truth test. Everything below threshold is
reported as "unconfirmed", never guessed. The prior AI's canon-face-registry.json conflated the
official chara number with the tcf slot index (chara 206 == Yang, but Yang's face is tcf slot
274) — this tool exists to replace that slop with evidence.

Reference portraits must be the SAME artwork lineage as the in-game atlas (official site crops
work; anime/wiki art does not and must not be used — different art defeats pixel matching).

Usage:
  python3 tools/logh7_portrait_match.py rank   --ref R.jpg --portraits DIR     # rank one ref
  python3 tools/logh7_portrait_match.py verify --refs refs.json --portraits DIR --out out.json
    refs.json = {"<name>": {"ref": "path/to/official.jpg", "chara": <official_num|null>}}
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

import numpy as np
from PIL import Image

NCC_MIN = 0.85
GAP_MIN = 0.10
SIZE = (64, 80)


def _gray(path: str, size=SIZE) -> np.ndarray:
    return np.asarray(Image.open(path).convert("L").resize(size), dtype=np.float64)


def _ncc(a: np.ndarray, b: np.ndarray) -> float:
    a = a - a.mean()
    b = b - b.mean()
    d = float(np.sqrt((a * a).sum() * (b * b).sum()))
    return float((a * b).sum() / d) if d else 0.0


def load_atlas(portraits_dir: str) -> dict[int, np.ndarray]:
    out: dict[int, np.ndarray] = {}
    for p in glob.glob(os.path.join(portraits_dir, "*.png")):
        m = re.search(r"(\d+)", os.path.basename(p))
        if m:
            out[int(m.group(1))] = _gray(p)
    return out


def rank(ref_path: str, atlas: dict[int, np.ndarray]) -> list[tuple[int, float]]:
    ref = _gray(ref_path)
    reff = ref[:, ::-1]  # the official crop may be mirrored vs the atlas
    scores = {idx: max(_ncc(ref, img), _ncc(reff, img)) for idx, img in atlas.items()}
    return sorted(scores.items(), key=lambda kv: -kv[1])


def classify(ranked: list[tuple[int, float]]) -> dict:
    if not ranked:
        return {"verdict": "no-atlas"}
    (slot, best), gap = ranked[0], (ranked[0][1] - (ranked[1][1] if len(ranked) > 1 else 0.0))
    accept = best >= NCC_MIN and gap >= GAP_MIN
    return {
        "verdict": "confirmed" if accept else "unconfirmed",
        "tcf_slot": slot if accept else None,
        "best_ncc": round(best, 4),
        "runner_up_ncc": round(ranked[1][1], 4) if len(ranked) > 1 else None,
        "gap": round(gap, 4),
        "top5": [[i, round(s, 4)] for i, s in ranked[:5]],
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("rank")
    r.add_argument("--ref", required=True)
    r.add_argument("--portraits", default=".omo/work/portraits")
    v = sub.add_parser("verify")
    v.add_argument("--refs", required=True, help="JSON {name:{ref,chara}}")
    v.add_argument("--portraits", default=".omo/work/portraits")
    v.add_argument("--out", required=True)
    args = ap.parse_args()

    atlas = load_atlas(args.portraits)
    if not atlas:
        print(f"no portraits under {args.portraits}", file=sys.stderr)
        return 1

    if args.cmd == "rank":
        print(json.dumps(classify(rank(args.ref, atlas)), ensure_ascii=False, indent=2))
        return 0

    refs = json.loads(open(args.refs, encoding="utf-8").read())
    results = {}
    for name, spec in refs.items():
        ref = spec["ref"] if isinstance(spec, dict) else spec
        if not os.path.exists(ref):
            results[name] = {"verdict": "ref-missing", "ref": ref}
            continue
        c = classify(rank(ref, atlas))
        c["official_chara"] = spec.get("chara") if isinstance(spec, dict) else None
        c["ref"] = ref
        results[name] = c
    confirmed = {n: r for n, r in results.items() if r.get("verdict") == "confirmed"}
    out = {
        "_method": "deterministic NCC pixel match of keyed official portraits vs decoded tcf slots; "
        f"accept iff best_ncc>={NCC_MIN} and gap>={GAP_MIN}. No AI vision.",
        "_atlas_size": len(atlas),
        "_criteria": {"ncc_min": NCC_MIN, "gap_min": GAP_MIN},
        "_counts": {"refs": len(results), "confirmed": len(confirmed)},
        "identities": results,
    }
    open(args.out, "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"confirmed": list(confirmed), "counts": out["_counts"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
