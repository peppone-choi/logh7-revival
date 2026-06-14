"""Manage LOGH VII original (canon) characters keyed by PORTRAIT INDEX (face code).

Why this tool exists
--------------------
The client's character-creation face picker only ever exposes the **G(enerate)**
atlases (gem/gef/gam/gaf) — the grid painter FUN_00596f90 hard-codes the atlas
group to 1 ('G'). The **O(riginal)** atlases (oem/oam/o) never appear in the
picker, so every O-group face is **reserved for original/canon characters**
(RE workflow 2026-06-14; user hypothesis confirmed). A player-created face must
be a G-group slot for the chosen (faction, sex); a canon character's face is an
O-group slot.

This module is the single place that:
  * classifies any face code as PLAYER-SELECTABLE (G) vs CANON-ONLY (O),
  * reconciles the composite face code (atlas-selector + local index; see
    tools/logh7_face_id_decode) with the project roster's `atlas_slot`,
  * cross-checks which slots have real art in tcf.hed (669 of 1355),
  * emits a server-ready registry (canon character -> face code) for
    src/server/logh7-character-gen.registerCanon, replacing the placeholder
    sequential portraitIndex values, and
  * validates a submitted 0x1008 create face is a legal G-group slot.

Open calibration item (documented, not hidden)
-----------------------------------------------
The roster's `atlas_slot` index is the GLOBAL tcf.hed slot number (e.g. Yang =
oam_0274), whereas the in-game composite code needs the PER-ATLAS LOCAL index.
The global->local hed-range per atlas is not yet pinned (FUN_005924c0 remaps via
runtime arrays). So composite codes are emitted only for slots whose local index
is known/calibrated; the rest are reported with `face_code: null,
needs_calibration: true`. See logh7-face-id-encoding 'open item'.
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path
from typing import Final

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_face_id_decode import ATLAS, ATLAS_BASE, decode, encode

REPO_ROOT: Final = Path(__file__).resolve().parents[1]
DEFAULT_FACE_DIR: Final = REPO_ROOT / ".omo" / "work" / "logh7-installed" / "data" / "image" / "Face"
DEFAULT_ROSTER: Final = REPO_ROOT / "content" / "character-roster.json"

# Atlas group: O = original/canon-only (never in creation picker); G = player-selectable.
O_GROUP: Final = ("oem", "oam", "o")
G_GROUP: Final = ("gem", "gef", "gam", "gaf")


def atlas_group(atlas: str) -> str:
    return "O" if atlas in O_GROUP else "G"


def is_player_selectable_face(face_code: int) -> bool:
    """True iff `face_code` decodes to a G-group atlas (a legal player-created face)."""
    try:
        atlas, _ = decode(face_code)
    except ValueError:
        return False
    return atlas in G_GROUP


def is_canon_face(face_code: int) -> bool:
    """True iff `face_code` decodes to an O-group atlas (reserved for canon characters)."""
    try:
        atlas, _ = decode(face_code)
    except ValueError:
        return False
    return atlas in O_GROUP


def validate_player_face(face_code: int, *, faction: str, sex: str) -> dict:
    """Authoritative server check for a submitted 0x1008 create face.

    A player face must be a G-group slot matching the chosen faction+sex.
    Returns {ok, reason?, atlas?, index?}.
    """
    try:
        atlas, index = decode(face_code)
    except ValueError as error:
        return {"ok": False, "reason": f"undecodable face {face_code}: {error}"}
    meta = ATLAS[atlas]
    if atlas not in G_GROUP:
        return {"ok": False, "reason": f"face {face_code} is O-group ({atlas}); reserved for canon", "atlas": atlas}
    if meta["faction"] != faction:
        return {"ok": False, "reason": f"face faction {meta['faction']} != requested {faction}", "atlas": atlas}
    if meta["sex"] != sex:
        return {"ok": False, "reason": f"face sex {meta['sex']} != requested {sex}", "atlas": atlas}
    if not 0 <= index <= meta["cap"]:
        return {"ok": False, "reason": f"index {index} out of range 0..{meta['cap']} for {atlas}", "atlas": atlas}
    return {"ok": True, "atlas": atlas, "index": index}


def load_hed(face_dir: Path) -> list[tuple[int, int]]:
    hed = (face_dir / "tcf.hed").read_bytes()
    return [struct.unpack_from("<II", hed, i * 8) for i in range(len(hed) // 8)]


def real_art_slots(face_dir: Path) -> dict[int, dict]:
    """Map global tcf.hed slot -> {offset,size,atlases} for every slot with real art.

    `atlases` = atlas files the [offset,size] region fits inside (an entry may fit
    several; the exact owner needs the unresolved per-atlas hed-range calibration).
    """
    sizes = {a: (face_dir / f"{a}.tcf").stat().st_size for a in ATLAS}
    out: dict[int, dict] = {}
    for gi, (off, sz) in enumerate(load_hed(face_dir)):
        if sz == 0:
            continue
        fits = [a for a, fsz in sizes.items() if off < fsz and off + sz <= fsz]
        out[gi] = {"offset": off, "size": sz, "atlases": fits}
    return out


def _parse_atlas_slot(slot: str | None) -> tuple[str, int] | None:
    if not slot or "_" not in slot:
        return None
    atlas, _, idx = slot.rpartition("_")
    if atlas not in ATLAS:
        return None
    try:
        return atlas, int(idx)
    except ValueError:
        return None


def build_registry(roster_path: Path = DEFAULT_ROSTER, face_dir: Path = DEFAULT_FACE_DIR) -> dict:
    """Consolidate canon assignments keyed by portrait index, with O/G + art status."""
    roster = json.loads(roster_path.read_text(encoding="utf-8"))
    chars = roster.get("characters", roster if isinstance(roster, list) else [])
    art = real_art_slots(face_dir) if face_dir.exists() else {}

    entries: list[dict] = []
    for c in chars:
        slot = _parse_atlas_slot(c.get("atlas_slot"))
        atlas = slot[0] if slot else None
        global_index = slot[1] if slot else None  # roster uses the GLOBAL hed index
        # Composite face code: only when the slot index is a valid per-atlas local index.
        face_code = None
        needs_calibration = True
        if atlas is not None and global_index is not None and 0 <= global_index <= ATLAS[atlas]["cap"]:
            face_code = encode(atlas, global_index)
            needs_calibration = False
        meta = ATLAS[atlas] if atlas else {}
        entries.append({
            "name_ja": c.get("name_ja"),
            "name_kr": c.get("name_kr"),
            "name_romaji": c.get("name_romaji"),
            "faction": c.get("faction") or meta.get("faction"),
            "atlas": atlas,
            "group": atlas_group(atlas) if atlas else None,
            "global_index": global_index,
            "face_value_roster": c.get("face_value"),
            "face_number": c.get("face_number"),
            "face_code": face_code,
            "needs_calibration": needs_calibration,
            "art_present": (global_index in art) if global_index is not None else None,
            "portrait_confidence": c.get("portrait_confidence"),
            "portrait_file": c.get("portrait_file"),
        })

    by_group = {"O": 0, "G": 0, None: 0}
    by_atlas: dict[str, int] = {}
    for e in entries:
        by_group[e["group"]] = by_group.get(e["group"], 0) + 1
        if e["atlas"]:
            by_atlas[e["atlas"]] = by_atlas.get(e["atlas"], 0) + 1

    return {
        "_purpose": "canon character <-> portrait-index (face code) registry; O=canon-only, G=player-selectable",
        "_source": {"roster": str(roster_path), "faceDir": str(face_dir)},
        "_note": "atlas_slot index = GLOBAL tcf.hed slot; composite face_code emitted only for calibrated local indices",
        "counts": {
            "characters": len(entries),
            "byGroup": {k: v for k, v in by_group.items() if k},
            "byAtlas": by_atlas,
            "withFaceCode": sum(1 for e in entries if e["face_code"] is not None),
            "needsCalibration": sum(1 for e in entries if e["needs_calibration"]),
            "realArtSlots": len(art),
        },
        "entries": entries,
    }


def export_server_registry(registry: dict, out_path: Path) -> dict:
    """Emit the calibrated canon face codes for src/server registerCanon consumption."""
    records = [
        {
            "name_ja": e["name_ja"],
            "name_kr": e["name_kr"],
            "faction": e["faction"],
            "atlas": e["atlas"],
            "group": e["group"],
            "faceCode": e["face_code"],
        }
        for e in registry["entries"]
        if e["face_code"] is not None and e["group"] == "O"
    ]
    payload = {
        "_purpose": "server canon face codes (O-group composite face values) for registerCanon; "
        "calibrated subset only — uncalibrated canon faces pending per-atlas hed-range RE",
        "_count": len(records),
        "records": records,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage canon characters by portrait index (face code).")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("stats", help="registry counts")
    p_list = sub.add_parser("list", help="list entries")
    p_list.add_argument("--group", choices=["O", "G"], help="filter by atlas group")
    p_list.add_argument("--atlas", choices=sorted(ATLAS))
    p_list.add_argument("--limit", type=int, default=40)
    p_val = sub.add_parser("validate", help="validate a player-created face")
    p_val.add_argument("face", type=int)
    p_val.add_argument("--faction", required=True)
    p_val.add_argument("--sex", required=True, choices=["male", "female"])
    p_exp = sub.add_parser("export", help="emit server canon face registry json")
    p_exp.add_argument("--out", type=Path, default=REPO_ROOT / "content" / "canon-face-registry.json")
    parser.add_argument("--roster", type=Path, default=DEFAULT_ROSTER)
    parser.add_argument("--face-dir", type=Path, default=DEFAULT_FACE_DIR)
    args = parser.parse_args()

    if args.cmd == "validate":
        result = validate_player_face(args.face, faction=args.faction, sex=args.sex)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["ok"] else 1

    registry = build_registry(args.roster, args.face_dir)
    if args.cmd == "stats":
        print(json.dumps(registry["counts"], ensure_ascii=False, indent=2))
    elif args.cmd == "list":
        rows = registry["entries"]
        if args.group:
            rows = [e for e in rows if e["group"] == args.group]
        if args.atlas:
            rows = [e for e in rows if e["atlas"] == args.atlas]
        for e in rows[: args.limit]:
            print(f"  [{e['group']}/{e['atlas']}#{e['global_index']}] face={e['face_code']} "
                  f"art={e['art_present']} {e['name_ja']} ({e['faction']}) conf={e['portrait_confidence']}")
        print(f"  ({len(rows)} entries)")
    elif args.cmd == "export":
        payload = export_server_registry(registry, args.out)
        print(f"wrote {args.out} ({payload['_count']} O-group canon face codes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
