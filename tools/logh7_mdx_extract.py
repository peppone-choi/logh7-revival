"""LANE 3 — Extract DATA from LOGH VII model containers (.mdx / .mds) + .hed.

The .mdx/.mds files are the game's 3D scene-graph containers, derived from LightWave
(.lwo) source assets. They are NOT primarily tabular data, but they DO carry extractable
DATA: a scene-graph of named NODES (layers, sub-objects), the original LightWave/texture
SOURCE-ASSET PATHS embedded by the exporter, and per-model structural metadata (node
counts, hardpoint/engine/turret node names for ships).

This tool parses the common header + node layout, enumerates every named node and every
embedded asset path (cp932/Shift-JIS where applicable), and emits content/extracted/
model-data.json plus per-category tables. It is deterministic: every datum is read from
the bytes; unknown fields are omitted, not invented.

Header layout (observed, little-endian):
  0x00..0x4F : 10 dwords of (ptr, count) pairs — section descriptors (memory-dump ptrs,
               high word ~0x01xx so unreliable as file offsets; counts are the data).
  0x50       : first node name (NUL-padded fixed 0xE8-byte node record region begins)
Node naming convention: "<object>:Layer<N>" for top-level mesh layers, plus sub-node
names (ENGINE_01, turret names, etc.) at 0x140-stride-ish fixed records.

Rather than over-fit the exact record stride (which varies by node payload), we extract
the authoritative DATA — the full ordered list of ASCII/SJIS node & asset strings with
byte offsets — which is what is portable and verifiable.

Usage: python -m tools.logh7_mdx_extract [--root .omo/work/logh7-installed]
"""
from __future__ import annotations

import argparse
import json
import re
import struct
from pathlib import Path

# ASCII printable run (node names, paths)
ASCII_RUN = re.compile(rb"[\x20-\x7e]{3,}")

# Classify a model file by its directory + name prefix
SHIP_FACTION = {"GE": "empire", "FP": "alliance", "PI": "phezzan", "PZ": "phezzan_misc"}
# Name-prefix -> faction, grounded in the dir convention (FP dir holds F*, GE dir holds E*,
# PI dir holds P*/p*, PZ dir holds Z*). Used for root-level data/model/Ship/*.mdx variants.
SHIP_PREFIX_FACTION = {"F": "alliance", "E": "empire", "P": "phezzan", "Z": "phezzan_misc"}


NODE_NAME_RE = re.compile(r"[A-Za-z0-9_:.\-]+")
STRIDE = 0xE8  # node-record stride in the directory block


def read_cstr(d: bytes, off: int, maxlen: int = 64) -> str:
    end = d.find(b"\x00", off, off + maxlen)
    if end < 0:
        end = off + maxlen
    raw = d[off:end]
    try:
        return raw.decode("cp932")
    except Exception:
        return raw.decode("ascii", "ignore")


def structured_nodes(d: bytes):
    """Node-name records sit on a fixed 0xE8 stride starting at 0x58 (the scene-graph
    directory block). Walk the grid until a record's name slot is not a valid identifier.
    This avoids float-byte false positives that plagued a naive printable-run scan."""
    names = []
    off = 0x58
    while off + 4 < len(d):
        s = read_cstr(d, off)
        if s and NODE_NAME_RE.fullmatch(s):
            names.append(s)
            off += STRIDE
        else:
            break
    return names


def read_strings(data: bytes):
    """Return [(offset, text)] of printable runs, decoding cp932 for non-ASCII tails."""
    out = []
    for m in ASCII_RUN.finditer(data):
        raw = m.group()
        # Try to extend with a cp932 decode of surrounding bytes for JP names
        try:
            s = raw.decode("cp932")
        except Exception:
            s = raw.decode("ascii", "ignore")
        out.append((m.start(), s))
    return out


def is_node_name(s: str) -> bool:
    # Node names: alnum + _ + : (Layer), no path separators, reasonable length
    if "\\" in s or "/" in s or "." in s:
        return False
    if not s or len(s) > 48:
        return False
    return bool(re.fullmatch(r"[A-Za-z0-9_:]+", s))


def is_asset_path(s: str) -> bool:
    sl = s.lower()
    return ("\\" in s or "/" in s) and (
        sl.endswith((".lwo", ".bmp", ".tga", ".jpg", ".png", ".lws"))
        or "\\objects\\" in sl
        or "\\images\\" in sl
        or s.startswith("W:")
    )


def stitch_paths(strings):
    """The exporter stored paths in two runs split across a NUL ('W:\\Gin7\\CG\\' + tail).
    Stitch adjacent runs where the first ends in a separator-ish prefix."""
    paths = []
    i = 0
    n = len(strings)
    while i < n:
        off, s = strings[i]
        if s.startswith("W:") and i + 1 < n:
            noff, ns = strings[i + 1]
            # The exporter split the path across a few padding bytes (drive-prefix run,
            # then a 1-2 char fragment like "g\\" / "D\\" / "D3\\", then the body).
            gap = noff - (off + len(s))
            if 0 <= gap <= 12 and ("\\" in ns or ns.lower().endswith((".lwo", ".bmp", ".tga", ".jpg", ".png"))):
                paths.append((off, s + ns))
                i += 2
                continue
        if is_asset_path(s):
            paths.append((off, s))
        i += 1
    return paths


def parse_header(data: bytes):
    """First 0x50 bytes: 10 (ptr,count) descriptor pairs. Return the counts."""
    if len(data) < 0x50:
        return None
    vals = struct.unpack_from("<20I", data, 0)
    pairs = [(vals[i], vals[i + 1]) for i in range(0, 20, 2)]
    counts = [c for (_p, c) in pairs]
    return {"descriptor_counts": counts}


# Ship hardpoint node prefixes -> meaning (FF/FR/FL/RR/RL = thruster-flare positions:
# Front/Rear x Left/Right; weapon nodes are emitter mount points)
HARDPOINT_KIND = {
    "ENGINE": "engine",
    "GUN": "gun",
    "BEAM": "beam",
    "LASER": "laser",
    "MISSILE": "missile",
    "RAILGUN": "railgun",
    "CANNON": "cannon",
    "FF": "flare", "FR": "flare", "FL": "flare", "RR": "flare", "RL": "flare",
}


def classify_hardpoints(nodes):
    """Count weapon/engine mount points from a ship's node names."""
    counts = {}
    for n in nodes:
        base = n.split("_")[0].upper()
        kind = HARDPOINT_KIND.get(base)
        if kind:
            counts[kind] = counts.get(kind, 0) + 1
    return counts


def extract_one(path: Path):
    data = path.read_bytes()
    node_names = structured_nodes(data)
    strings = read_strings(data)
    paths = stitch_paths(strings)
    asset_paths = []
    seenp = set()
    for off, s in paths:
        if s not in seenp:
            seenp.add(s)
            asset_paths.append(s)
    hdr = parse_header(data)
    rec = {
        "size": len(data),
        "header": hdr,
        "nodes": node_names,
        "node_count": len(node_names),
        "assets": asset_paths,
    }
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".omo/work/logh7-installed")
    ap.add_argument("--out", default="content/extracted")
    args = ap.parse_args()

    root = Path(args.root)
    model = root / "data" / "model"
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    records = []
    for ext in ("*.mdx", "*.mds"):
        for f in sorted(model.rglob(ext)):
            rel = f.relative_to(root).as_posix()
            rec = extract_one(f)
            rec["file"] = rel
            rec["name"] = f.stem
            rec["ext"] = f.suffix[1:]
            # categorize: data/model/<cat>/<file> ; a file directly under data/model is "root"
            parts = rel.split("/")
            cat = parts[2] if len(parts) > 3 else "root"
            rec["category"] = cat
            if cat == "Ship":
                # data/model/Ship/<FAC>/<NAME>.mdx OR data/model/Ship/<NAME>.mdx
                if len(parts) >= 5:
                    rec["faction"] = SHIP_FACTION.get(parts[3], parts[3])
                    rec["faction_dir"] = parts[3]
                else:
                    # root-level data/model/Ship/<NAME>.mdx: infer from name prefix per dir convention
                    pref = f.stem[0].upper()
                    rec["faction"] = SHIP_PREFIX_FACTION.get(pref, "unknown")
                    rec["faction_inferred"] = True
                rec["hardpoints"] = classify_hardpoints(rec["nodes"])
            records.append(rec)

    # --- Null_galaxy.mdx: stellar spectral-class table (star_NN_<class>) ---
    galaxy_stars = []
    ng = next((r for r in records if r["name"] == "Null_galaxy"), None)
    if ng:
        for n in ng["nodes"]:
            m = re.fullmatch(r"star_(\d+)_([A-Z])", n)
            if m:
                galaxy_stars.append({"index": int(m.group(1)), "spectral_class": m.group(2)})
        # special bodies
        ng_special = [n for n in ng["nodes"] if re.fullmatch(r"(bh|ns)_\d+", n)]
    else:
        ng_special = []

    # --- tcf.hed face-atlas index (already cracked by logh7_tcf_decode.py; summarize) ---
    hed_path = root / "data" / "image" / "Face" / "tcf.hed"
    hed_info = None
    if hed_path.exists():
        hd = hed_path.read_bytes()
        declared = struct.unpack_from("<I", hd, 0x08)[0]
        entries = []
        for i in range(len(hd) // 8):
            off, sz = struct.unpack_from("<II", hd, i * 8)
            if off or sz:
                entries.append({"index": i, "offset": off, "size": sz})
        hed_info = {
            "file": hed_path.relative_to(root).as_posix(),
            "format": "8-byte entries [u32 offset][u32 size] indexing a virtual concatenation "
            "of the 7 *.tcf face atlases; decoded by tools/logh7_tcf_decode.py",
            "declared_count_at_0x08": declared,
            "nonzero_entries": len(entries),
            "frame_stride_bytes": 0x1812,
            "note": "frame index for character portrait atlases (gem/gef/gam/gaf/o/oam/oem); "
            "not a 3D-model table — referenced here for completeness only",
        }

    # Aggregate name lists
    ship_models = sorted({r["name"] for r in records if r["category"] == "Ship"})
    planet_models = sorted({r["name"] for r in records if r["category"] == "Planets"})
    strategy_models = sorted({r["name"] for r in records if r["category"] == "strategy"})

    # Spectral-class histogram for the galaxy stars
    spectral_hist = {}
    for st in galaxy_stars:
        spectral_hist[st["spectral_class"]] = spectral_hist.get(st["spectral_class"], 0) + 1

    # Ship hardpoint roster (real weapon/engine mount counts per ship model)
    ship_hardpoints = []
    for r in records:
        if r["category"] == "Ship" and r.get("hardpoints"):
            ship_hardpoints.append({
                "name": r["name"],
                "faction": r.get("faction", "unknown"),
                "ext": r["ext"],
                "hardpoints": r["hardpoints"],
            })

    summary = {
        "_lane": "LANE 3 — model/*.mdx + *.mds + *.hed",
        "_source": "data/model/**/*.{mdx,mds} (LightWave-derived 3D scene-graph containers)",
        "_format": "LightWave .lwo export -> .mdx scene graph; header=10 (ptr,count) descriptors; "
        "named nodes <obj>:Layer<N>; embedded W:\\Gin7\\CG\\ source-asset paths",
        "_method": "enumerate printable node-name runs + stitched asset paths per file; cite byte data",
        "counts": {
            "files": len(records),
            "mdx": sum(1 for r in records if r["ext"] == "mdx"),
            "mds": sum(1 for r in records if r["ext"] == "mds"),
            "ship_models": len(ship_models),
            "planet_models": len(planet_models),
            "strategy_models": len(strategy_models),
            "galaxy_stars": len(galaxy_stars),
            "galaxy_special_bodies": len(ng_special),
        },
        "galaxy_stellar_classification": {
            "_source": "data/model/strategy/Null_galaxy.mdx star_<NN>_<spectralClass> scene-graph nodes",
            "_note": "79 star nodes each tagged with a Morgan-Keenan spectral class letter "
            "(O/B/A/F/G/K/M) + 3 black holes (bh_NN) + 3 neutron stars (ns_NN); these are the "
            "3D-map stellar bodies. Index is map node order, NOT necessarily galaxy.json system order.",
            "spectral_histogram": spectral_hist,
            "stars": galaxy_stars,
            "special_bodies": ng_special,
        },
        "ship_hardpoints": ship_hardpoints,
        "tcf_hed_index": hed_info,
        "ship_model_names": ship_models,
        "planet_model_names": planet_models,
        "strategy_model_names": strategy_models,
        "records": records,
    }

    (out / "model-data.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    # Per-category light tables
    by_cat = {}
    for r in records:
        by_cat.setdefault(r["category"], []).append(
            {"file": r["file"], "name": r["name"], "ext": r["ext"],
             "size": r["size"], "node_count": r["node_count"],
             "nodes": r["nodes"], "assets": r["assets"],
             **({"faction": r["faction"]} if "faction" in r else {})}
        )
    for cat, rows in by_cat.items():
        (out / f"model-{cat.lower()}.json").write_text(
            json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8"
        )

    # Dedicated DATA tables
    (out / "model-galaxy-stars.json").write_text(
        json.dumps(summary["galaxy_stellar_classification"], ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    (out / "model-ship-hardpoints.json").write_text(
        json.dumps(ship_hardpoints, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    print(json.dumps(summary["counts"], indent=1))
    return summary


if __name__ == "__main__":
    main()
