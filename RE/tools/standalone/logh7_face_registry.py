#!/usr/bin/env python3
"""LOGH VII original-character ↔ portrait-index registry (STANDALONE / collaboration build).

Self-contained: stdlib only (no pefile/PIL/repo packages). Hand this single file + a roster JSON
to a collaborator and they can list, assign Korean names, validate, and export — pointing at their
own data with --roster / --face-dir.

Portrait face-code scheme (RE'd from G7MTClient.exe, FUN_00592c30/FUN_005924c0):
  face_value = (O/G)*1_000_000 + (E/A)*100_000 + (M/F)*10_000 + local_index
  atlas selector: 0 oem, 1 oam, 2 o, 3 gem, 4 gef, 5 gam, 6 gaf
  O-group (oem/oam/o)  = ORIGINAL (canon) characters — NOT shown in the creation picker.
  G-group (gem/gef/gam/gaf) = player-selectable in character creation (forced 'G' by the picker).
So: a canon character's portrait is an O-group slot; a player-created face is a G-group slot.

Collaboration workflow:
  1. python logh7_face_registry.py stats --roster roster.json
  2. python logh7_face_registry.py list --group O --roster roster.json        # canon slots
  3. python logh7_face_registry.py set-name <atlas_slot> "한글이름" --roster roster.json   # assign
  4. python logh7_face_registry.py export --roster roster.json --out canon-face-registry.json

Roster JSON shape (compatible with the project's content/character-roster.json):
  { "characters": [ { "name_ja": "...", "name_kr": null, "name_romaji": "...",
                      "faction": "empire|alliance", "atlas_slot": "oem_0008",
                      "face_value": 8, "portrait_confidence": "assigned" }, ... ] }
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

# ── face-code codec (inlined from tools/logh7_face_id_decode.py) ──────────────────────────────
ATLAS = {
    "oem": dict(sel=0, faction="empire",   sex="male",   rank="officer", cap=199, group="O"),
    "oam": dict(sel=1, faction="alliance", sex="male",   rank="officer", cap=95,  group="O"),
    "o":   dict(sel=2, faction=None,       sex=None,     rank="misc",    cap=99,  group="O"),
    "gem": dict(sel=3, faction="empire",   sex="male",   rank="general", cap=99,  group="G"),
    "gef": dict(sel=4, faction="empire",   sex="female", rank="general", cap=31,  group="G"),
    "gam": dict(sel=5, faction="alliance", sex="male",   rank="general", cap=99,  group="G"),
    "gaf": dict(sel=6, faction="alliance", sex="female", rank="general", cap=31,  group="G"),
}
ATLAS_BASE = {"oem": 0, "oam": 100000, "o": 10000, "gem": 1000000, "gef": 1010000, "gam": 1100000, "gaf": 1110000}
O_GROUP = ("oem", "oam", "o")
G_GROUP = ("gem", "gef", "gam", "gaf")


def encode_face(atlas: str, index: int) -> int:
    if atlas not in ATLAS:
        raise ValueError(f"unknown atlas {atlas!r}")
    cap = ATLAS[atlas]["cap"]
    if not 0 <= index <= cap:
        raise ValueError(f"index {index} out of range for {atlas} (0..{cap})")
    return ATLAS_BASE[atlas] + index


def decode_face(n: int):
    if not isinstance(n, int) or n < 0:
        return None
    idx, M = n % 1000, n // 1000000
    d5, d4, d3 = (n % 1000000) // 100000, (n % 100000) // 10000, (n % 10000) // 1000
    if d3 != 0:
        off = {(0, 1, 1): 10, (0, 2, 0): 20, (1, 0, 0): 40, (1, 0, 1): 50, (1, 1, 0): 60, (1, 1, 1): 70}.get((M, d5, d4))
        if off is None:
            return None
        atlas, idx = "o", idx + off
    else:
        atlas = {(0, 0, 0): "oem", (0, 1, 0): "oam", (0, 0, 1): "o", (1, 0, 0): "gem", (1, 0, 1): "gef", (1, 1, 0): "gam", (1, 1, 1): "gaf"}.get((M, d5, d4))
        if atlas is None:
            return None
    m = ATLAS[atlas]
    return dict(atlas=atlas, index=idx, group=m["group"], faction=m["faction"], sex=m["sex"], rank=m["rank"])


def atlas_group(atlas: str) -> str:
    return ATLAS[atlas]["group"] if atlas in ATLAS else None


def validate_player_face(face: int, faction: str, sex: str) -> dict:
    """A player-created face must be a G-group slot matching faction+sex."""
    if face == 0:
        return {"ok": True, "atlas": None, "index": 0}
    d = decode_face(face)
    if d is None:
        return {"ok": False, "reason": f"undecodable face {face}"}
    if d["group"] != "G":
        return {"ok": False, "reason": f"face {face} is O-group ({d['atlas']}); reserved for canon", "atlas": d["atlas"]}
    if d["faction"] != faction:
        return {"ok": False, "reason": f"face faction {d['faction']} != {faction}", "atlas": d["atlas"]}
    if d["sex"] != sex:
        return {"ok": False, "reason": f"face sex {d['sex']} != {sex}", "atlas": d["atlas"]}
    return {"ok": True, "atlas": d["atlas"], "index": d["index"]}


# ── tcf.hed art presence (optional; only if --face-dir given) ─────────────────────────────────
def real_art_slots(face_dir: Path) -> set[int]:
    hed = face_dir / "tcf.hed"
    if not hed.is_file():
        return set()
    data = hed.read_bytes()
    out = set()
    for i in range(len(data) // 8):
        _off, sz = struct.unpack_from("<II", data, i * 8)
        if sz > 0:
            out.add(i)
    return out


def _slot(s):
    if not s or "_" not in s:
        return None
    a, _, i = s.rpartition("_")
    if a not in ATLAS:
        return None
    try:
        return a, int(i)
    except ValueError:
        return None


def load_roster(path: Path) -> dict:
    d = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(d, list):
        d = {"characters": d}
    d.setdefault("characters", [])
    return d


def build_entries(roster: dict, art: set[int]) -> list[dict]:
    rows = []
    for c in roster["characters"]:
        sl = _slot(c.get("atlas_slot"))
        atlas, gi = (sl if sl else (None, None))
        face_code, needs_cal = None, True
        if atlas and gi is not None and 0 <= gi <= ATLAS[atlas]["cap"]:
            face_code, needs_cal = encode_face(atlas, gi), False
        rows.append({
            "name_ja": c.get("name_ja"), "name_kr": c.get("name_kr"), "name_romaji": c.get("name_romaji"),
            "faction": c.get("faction") or (ATLAS[atlas]["faction"] if atlas else None),
            "atlas": atlas, "group": atlas_group(atlas) if atlas else None, "global_index": gi,
            "face_code": face_code, "needs_calibration": needs_cal,
            "art_present": (gi in art) if (gi is not None and art) else None,
            "portrait_confidence": c.get("portrait_confidence"),
        })
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description="LOGH VII canon-character ↔ portrait-index registry (standalone).")
    ap.add_argument("--roster", type=Path, default=Path("character-roster.json"))
    ap.add_argument("--face-dir", type=Path, default=None, help="dir with tcf.hed for art-presence (optional)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("stats")
    pl = sub.add_parser("list"); pl.add_argument("--group", choices=["O", "G"]); pl.add_argument("--atlas", choices=sorted(ATLAS)); pl.add_argument("--limit", type=int, default=60)
    pv = sub.add_parser("validate"); pv.add_argument("face", type=int); pv.add_argument("--faction", required=True); pv.add_argument("--sex", required=True, choices=["male", "female"])
    ps = sub.add_parser("set-name", help="assign name_kr to the character at <atlas_slot>"); ps.add_argument("atlas_slot"); ps.add_argument("name_kr")
    pe = sub.add_parser("export"); pe.add_argument("--out", type=Path, default=Path("canon-face-registry.json"))
    args = ap.parse_args()

    if args.cmd == "validate":
        r = validate_player_face(args.face, args.faction, args.sex)
        print(json.dumps(r, ensure_ascii=False, indent=2)); return 0 if r["ok"] else 1

    roster = load_roster(args.roster)
    art = real_art_slots(args.face_dir) if args.face_dir else set()
    rows = build_entries(roster, art)

    if args.cmd == "stats":
        from collections import Counter
        g = Counter(r["group"] for r in rows if r["group"]); a = Counter(r["atlas"] for r in rows if r["atlas"])
        print(json.dumps({"characters": len(rows), "byGroup": dict(g), "byAtlas": dict(a),
                          "withFaceCode": sum(1 for r in rows if r["face_code"] is not None),
                          "needsCalibration": sum(1 for r in rows if r["needs_calibration"]),
                          "name_kr_filled": sum(1 for r in rows if r["name_kr"]),
                          "realArtSlots": len(art)}, ensure_ascii=False, indent=2))
    elif args.cmd == "list":
        f = [r for r in rows if (not args.group or r["group"] == args.group) and (not args.atlas or r["atlas"] == args.atlas)]
        for r in f[: args.limit]:
            print(f"  [{r['group']}/{r['atlas']}#{r['global_index']}] face={r['face_code']} art={r['art_present']} "
                  f"{r['name_ja']} / {r['name_kr'] or '—'} ({r['faction']})")
        print(f"  ({len(f)} entries)")
    elif args.cmd == "set-name":
        target = args.atlas_slot
        hit = [c for c in roster["characters"] if c.get("atlas_slot") == target]
        if not hit:
            print(f"no character with atlas_slot={target!r}", file=sys.stderr); return 1
        for c in hit:
            c["name_kr"] = args.name_kr
        args.roster.write_text(json.dumps(roster, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"set name_kr={args.name_kr!r} for {len(hit)} char(s) at {target}; wrote {args.roster}")
    elif args.cmd == "export":
        recs = [{"name_ja": r["name_ja"], "name_kr": r["name_kr"], "faction": r["faction"], "atlas": r["atlas"], "faceCode": r["face_code"]}
                for r in rows if r["face_code"] is not None and r["group"] == "O"]
        args.out.write_text(json.dumps({"_purpose": "canon O-group face codes for server registerCanon (calibrated subset)", "_count": len(recs), "records": recs}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {args.out} ({len(recs)} canon face codes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
