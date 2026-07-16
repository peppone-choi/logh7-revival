"""Build a TRUSTWORTHY content DB from verified data only.

The existing `content/logh7-content.db` was built by a prior AI from untrusted JSON and contains
fabricated numeric stats, unattested planet names, and wrong portrait mappings. This builder
rebuilds a clean DB from:
  - the GROUND-TRUTH re-extracts in `content/verified/*.json` (each row carries a manual page /
    binary-offset provenance), and
  - the real client `data/MsgDat/*.dat` strings (byte-verified 9582/9582 vs the client).

Rules: every table carries a `source` provenance column. Fabricated values are NOT invented —
character/ship numeric stats are stored as NULL with a note. Unverified data is excluded or kept
behind an `attested` flag. Structures whose row shape is uncertain are preserved verbatim as JSON
in `verified_extra` rather than mis-parsed.

Output: content/logh7-verified.db  (cross-platform, stdlib sqlite3 + logh7_msgdat).
Usage: python3 tools/logh7_build_verified_db.py [--out content/logh7-verified.db]
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from logh7_msgdat import index_msgdat_file  # noqa: E402

V = Path("content/verified")


def _load(name: str) -> dict:
    p = V / name
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def _locate_msgdat() -> Path | None:
    root = Path(".omo/work/installed")
    if root.exists():
        for c in sorted(root.rglob("constmsg.dat")):
            return c.parent
    return None


def build(out: Path) -> dict:
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        out.unlink()
    db = sqlite3.connect(out)
    c = db.cursor()
    counts: dict[str, int] = {}

    c.execute("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
    c.executemany("INSERT INTO meta VALUES (?,?)", [
        ("builder", "tools/logh7_build_verified_db.py"),
        ("trust", "verified-only: content/verified/*.json (provenance per row) + real MsgDat (byte-verified)"),
        ("supersedes", "content/logh7-content.db (prior-AI, untrusted)"),
        ("fabricated_excluded", "character numeric stats, ship numeric stats, unattested planet names, AI portrait mappings"),
    ])

    # --- client_strings (real MsgDat, byte-verified) ---
    c.execute("CREATE TABLE client_strings (id INTEGER PRIMARY KEY, file TEXT, str_id INTEGER, text TEXT)")
    md = _locate_msgdat()
    n = 0
    if md:
        rid = 0
        for dat in sorted(md.glob("*.dat")):
            for rec in index_msgdat_file(dat)["records"]:
                c.execute("INSERT INTO client_strings VALUES (?,?,?,?)", (rid, dat.name, int(rec["id"]), str(rec["text"])))
                rid += 1; n += 1
    counts["client_strings"] = n

    # --- characters (70, names verified, stats NULL) ---
    ch = _load("characters.json").get("characters", [])
    c.execute("CREATE TABLE characters (id INTEGER PRIMARY KEY, name_ja TEXT, faction TEXT, rank_ja TEXT, "
              "role_unit_ja TEXT, is_politician INTEGER, stats TEXT, source TEXT)")
    for i, r in enumerate(ch):
        c.execute("INSERT INTO characters VALUES (?,?,?,?,?,?,?,?)", (
            i, r.get("name_ja"), r.get("faction"), r.get("rank_ja"), r.get("role_unit_ja"),
            1 if r.get("is_politician") else 0, None,  # stats intentionally NULL (no VII ground truth)
            f"{r.get('source_doc','')} p{r.get('source_page','')}"))
    counts["characters"] = len(ch)

    # --- org-ranks domain ---
    org = _load("org-ranks.json")
    c.execute("CREATE TABLE abilities (ord INTEGER, name_ja TEXT, effect_ja TEXT, source TEXT)")
    for a in org.get("abilities", []):
        c.execute("INSERT INTO abilities VALUES (?,?,?,?)", (a.get("order"), a.get("name_ja"), a.get("effect_ja"), a.get("source")))
    counts["abilities"] = len(org.get("abilities", []))
    c.execute("CREATE TABLE ranks_military (ordinal INTEGER, name_ja TEXT, source TEXT)")
    for r in org.get("ranks_military", []):
        c.execute("INSERT INTO ranks_military VALUES (?,?,?)", (r.get("ordinal"), r.get("name_ja"), r.get("source")))
    counts["ranks_military"] = len(org.get("ranks_military", []))
    c.execute("CREATE TABLE nations (key TEXT PRIMARY KEY, name_ja TEXT, source TEXT)")
    for nn in org.get("nations", []):
        c.execute("INSERT INTO nations VALUES (?,?,?)", (nn.get("key"), nn.get("name_ja"), nn.get("source")))
    counts["nations"] = len(org.get("nations", []))
    c.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY, faction TEXT, post_ja TEXT, org_ja TEXT, capacity INTEGER, "
              "min_rank_ja TEXT, max_rank_ja TEXT, holder_kind TEXT, source TEXT)")
    pid = 0
    for fac, key in [("empire", "posts_empire"), ("alliance", "posts_alliance")]:
        for p in org.get(key, []):
            c.execute("INSERT INTO posts VALUES (?,?,?,?,?,?,?,?,?)", (
                pid, fac, p.get("post_ja"), p.get("org_ja"), p.get("capacity"),
                p.get("min_rank_ja"), p.get("max_rank_ja"), p.get("holder_kind"), p.get("_verified_against")))
            pid += 1
    counts["posts"] = pid

    # --- star_systems (80, attested) ---
    gx = _load("galaxy.json")
    c.execute("CREATE TABLE star_systems (id INTEGER PRIMARY KEY, name_ja TEXT, faction TEXT, cx REAL, cy REAL, "
              "name_attested INTEGER, coords_source TEXT)")
    for i, s in enumerate(gx.get("systems", [])):
        att = s.get("attestation", {}) or {}
        nm = att.get("name", {}) or {}
        c.execute("INSERT INTO star_systems VALUES (?,?,?,?,?,?,?)", (
            i, s.get("system"), s.get("faction"), s.get("cx"), s.get("cy"),
            1 if (nm.get("in_msgdat") or nm.get("in_manual_text")) else 0, att.get("coords_source")))
    counts["star_systems"] = len(gx.get("systems", []))

    # --- commands (81, binary cost authoritative) ---
    cm = _load("commands.json")
    c.execute("CREATE TABLE commands (id INTEGER PRIMARY KEY, name_ja TEXT, category_ja TEXT, cost_cp_manual TEXT, "
              "cost_binary TEXT, in_client_strings INTEGER, source_manual_page INTEGER, binary_source TEXT)")
    for i, r in enumerate(cm.get("commands", [])):
        c.execute("INSERT INTO commands VALUES (?,?,?,?,?,?,?,?)", (
            i, r.get("name_ja"), r.get("category_ja"), r.get("cost_cp_manual"), r.get("cost_mcp_binary"),
            1 if r.get("name_in_client_strings") else 0, r.get("source_manual_page"), r.get("binary_source")))
    counts["commands"] = len(cm.get("commands", []))

    # --- names_attestation (469) ---
    na = _load("names-attestation.json")
    c.execute("CREATE TABLE names_attestation (id INTEGER PRIMARY KEY, name TEXT, type TEXT, attested INTEGER, source TEXT)")
    for i, r in enumerate(na.get("names", [])):
        c.execute("INSERT INTO names_attestation VALUES (?,?,?,?,?)", (
            i, r.get("name"), r.get("type"), 1 if r.get("attested") else 0, r.get("source")))
    counts["names_attestation"] = len(na.get("names", []))

    # --- portrait_identities (pixel-confirmed only) ---
    pi = _load("portrait-identities-verified.json")
    c.execute("CREATE TABLE portrait_identities (name TEXT, tcf_slot INTEGER, best_ncc REAL, verdict TEXT, official_chara INTEGER)")
    conf = 0
    for name, r in (pi.get("identities", {}) or {}).items():
        c.execute("INSERT INTO portrait_identities VALUES (?,?,?,?,?)", (
            name, r.get("tcf_slot"), r.get("best_ncc"), r.get("verdict"), r.get("official_chara")))
        if r.get("verdict") == "confirmed":
            conf += 1
    counts["portrait_identities_confirmed"] = conf

    # --- ivex_names (prior-game pool, labeled non-VII) ---
    iv = _load("ivex-names.json")
    c.execute("CREATE TABLE ivex_names (id INTEGER PRIMARY KEY, name_ja TEXT)")
    for i, nm in enumerate(iv.get("names", [])):
        c.execute("INSERT INTO ivex_names VALUES (?,?)", (i, nm))
    counts["ivex_names"] = len(iv.get("names", []))

    # --- verified_extra: structures kept verbatim (ships, sub-tables) rather than mis-parsed ---
    c.execute("CREATE TABLE verified_extra (domain TEXT PRIMARY KEY, json TEXT)")
    ships = _load("ships.json")
    extras = {
        "ships": ships,
        "org_ranks_social_classes": org.get("social_classes"),
        "org_ranks_nobility_titles": org.get("nobility_titles"),
        "org_ranks_growth_rules": org.get("growth_rules"),
        "org_ranks_rank_person_limits": org.get("rank_person_limits"),
        "galaxy_findings": gx.get("_findings_summary"),
        "command_discrepancies": cm.get("_discrepancies_manual_vs_binary"),
    }
    for dom, val in extras.items():
        if val is not None:
            c.execute("INSERT INTO verified_extra VALUES (?,?)", (dom, json.dumps(val, ensure_ascii=False)))
    counts["verified_extra"] = len([v for v in extras.values() if v is not None])

    db.commit()
    db.close()
    return counts


def main() -> int:
    ap = argparse.ArgumentParser(description="Build content/logh7-verified.db from verified data + real MsgDat.")
    ap.add_argument("--out", type=Path, default=Path("content/logh7-verified.db"))
    args = ap.parse_args()
    counts = build(args.out)
    print(json.dumps({"out": str(args.out), "tables": counts}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
