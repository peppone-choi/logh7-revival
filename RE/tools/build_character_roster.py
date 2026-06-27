# -*- coding: utf-8 -*-
"""Consolidate every named LOGH VII character into content/character-roster.json.

ABSOLUTE RULE: never invent a number/name. Real stats from characters.json are kept
EXACTLY. Unknown -> null + note. Every value carries a source[].

Inputs (all real project assets):
  - content/roster/characters.json     : 97 chars, real 8-ability stats (tochi..bogyo)
  - content/roster/official-roster.json : 12 official gineiden.com chars (face_index, bio, romaji)
  - content/roster/face-name-map.json   : 12 name<->face_number (== official face_index)
  - content/roster/manual-roster.json   : gin7 manual duty cards (post, rank, unit, kind)
  - content/roster/community-roster.json: community/CBT attested names (Braunschweig)
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = lambda *p: os.path.join(ROOT, *p)


def load(*p):
    with open(R(*p), encoding="utf-8") as f:
        return json.load(f)


chars = load("content", "roster", "characters.json")["characters"]
official = load("content", "roster", "official-roster.json")["characters"]
facemap = load("content", "roster", "face-name-map.json")["entries"]
manual = load("content", "roster", "manual-roster.json")
community = load("content", "roster", "community-roster.json")

STAT_KEYS = ["tochi", "seiji", "unei", "joho", "shiki", "kido", "kogeki", "bogyo"]


def slugify(romaji, name_ja, idx):
    base = (romaji or "").strip()
    base = re.sub(r"[^A-Za-z0-9]+", "-", base).strip("-").lower()
    if not base:
        base = "char-%02d" % idx
    return base


# --- index manual duty cards by holder_ja (first/primary card wins for post/rank) ---
manual_by_holder = {}
manual_flagship = {}  # holder -> unit_ja (acts as fleet/command assignment, "flagship" proxy = None unless known)
for fac in ("empire", "alliance"):
    for e in manual[fac]:
        h = e["holder_ja"]
        # prefer a non-deputy command card; keep first seen primary
        if h not in manual_by_holder or (not e.get("is_deputy") and manual_by_holder[h].get("is_deputy")):
            manual_by_holder[h] = {**e, "_faction": fac}

# --- index official by its synthesized_match (the name_ja in characters.json) and by own name_ja ---
official_by_match = {}
for o in official:
    key = o.get("synthesized_match") or o["name_ja"]
    official_by_match[key] = o

facemap_by_name = {e["name_ja"]: e for e in facemap}
# also index facemap by romaji for cross-check
facemap_by_romaji = {e["name_romaji"]: e for e in facemap if e.get("name_romaji")}

records = []
seen_names = set()


def post_for(name_ja, base_post):
    """Return (post_ja, rank_ja, unit_ja) from manual duty card if present, else base."""
    m = manual_by_holder.get(name_ja)
    if m:
        return m.get("post_ja") or base_post or None, m.get("rank_ja") or None, m.get("unit_ja") or None
    return (base_post or None), None, None


idx = 0
for c in chars:
    idx += 1
    name_ja = c["name_ja"]
    seen_names.add(name_ja)
    romaji = c.get("name_romaji") or None

    # stats: keep EXACTLY from characters.json (real). order canonically.
    stats = {k: c["stats"][k] for k in STAT_KEYS}

    sources = []
    src_tag = c.get("source", "")
    if src_tag.startswith("ivex-real"):
        sources.append("characters.json (IV EX real save-diff stats)")
    elif src_tag.startswith("ivex"):
        sources.append("characters.json (IV EX-derived stats)")
    elif src_tag == "manual":
        sources.append("characters.json (gin7 manual roster; stats archetype+individual)")
    elif src_tag == "canon":
        sources.append("characters.json (canon-sourced stats)")
    else:
        sources.append("characters.json")
    if c.get("iv_id") is not None:
        sources[-1] += " iv_id=%s" % c["iv_id"]

    # base post/rank from characters.json, override/enrich with manual duty card
    base_post = c.get("post_ja") or None
    base_rank = c.get("rank_ja") or None
    post_ja, m_rank, unit_ja = post_for(name_ja, base_post)
    rank_ja = base_rank or m_rank
    if manual_by_holder.get(name_ja):
        sources.append("manual-roster.json (gin7 duty card: post/rank/unit)")

    # face_number, bio, romaji from official-roster / face-name-map
    face_number = None
    bio_ja = None
    o = official_by_match.get(name_ja)
    fm = facemap_by_name.get(name_ja)
    if o is None and romaji:
        # try romaji match against official
        for oo in official:
            if oo.get("name_romaji") and romaji and oo["name_romaji"].split()[-1].lower() in romaji.lower():
                pass  # avoid loose matches; rely on explicit synthesized_match only
    if o is not None:
        face_number = o.get("face_index")
        bio_ja = o.get("bio_ja")
        if not romaji and o.get("name_romaji"):
            romaji = o["name_romaji"]
        sources.append("official-roster.json (gineiden.com st_char.html: face_index/bio)")
    elif fm is not None:
        face_number = fm.get("face_number")
        sources.append("face-name-map.json (gineiden.com: face_number)")

    flagship = c.get("flagship")  # not present in source -> None (never invented)

    records.append({
        "id": slugify(romaji, name_ja, idx),
        "name_ja": name_ja,
        "name_romaji": romaji,
        "name_kr": None,  # no authoritative VII KR name source per face-name-recovery sweep
        "faction": c.get("faction"),
        "branch": None,   # not in any VII source for these records
        "kind": c.get("kind"),
        "rank": rank_ja,
        "post": post_ja,
        "unit": unit_ja,
        "flagship": flagship if flagship else None,
        "face_number": face_number,
        "bio_ja": bio_ja,
        "stats": stats,
        "stats_known": True,
        "source": sources,
    })

# --- add named canon characters NOT in the 97, with real repo evidence, stats null ---
extra = []

# Negroponti: official gineiden.com st_char.html entry (real), no stats on page
neg = official_by_match.get("ネグロポンティ") or next((o for o in official if o["name_ja"] == "ネグロポンティ"), None)
if neg and "ネグロポンティ" not in seen_names:
    extra.append({
        "id": "negroponti",
        "name_ja": neg["name_ja"],
        "name_romaji": neg.get("name_romaji"),
        "name_kr": None,
        "faction": neg.get("faction"),
        "branch": None,
        "kind": "politician",
        "rank": None,
        "post": neg.get("post_ja"),
        "unit": None,
        "flagship": None,
        "face_number": neg.get("face_index"),
        "bio_ja": neg.get("bio_ja"),
        "stats": {k: None for k in STAT_KEYS},
        "stats_known": False,
        "source": ["official-roster.json (gineiden.com st_char.html official VII sample; no numeric stats on page)"],
        "note": "Real VII official character (国防委員長). No numeric stats exist on any source; stats null by rule.",
    })
    seen_names.add("ネグロポンティ")

# Braunschweig: community CBT memoir attested (real), no face number, no stats
braun = community.get("community_canon_names_attested", [])
braun = next((b for b in braun if b["name_ja"] == "ブラウンシュヴァイク"), None)
if braun and "ブラウンシュヴァイク" not in seen_names:
    extra.append({
        "id": "otho-von-braunschweig",
        "name_ja": braun["name_ja"],
        "name_romaji": braun.get("name_romaji"),
        "name_kr": braun.get("name_kr"),
        "faction": braun.get("faction"),
        "branch": None,
        "kind": "military",
        "rank": None,
        "post": None,
        "unit": None,
        "flagship": None,
        "face_number": braun.get("face_number"),  # null
        "bio_ja": None,
        "stats": {k: None for k in STAT_KEYS},
        "stats_known": False,
        "source": ["community-roster.json (ruliweb KR CBT memoir 2022; attested playable canon admiral)"],
        "note": braun.get("note"),
    })
    seen_names.add("ブラウンシュヴァイク")

records.extend(extra)

out = {
    "_purpose": "Consolidated LOGH VII named-character roster. Lane B build. Real 8-ability stats kept EXACTLY from characters.json; unknown values are null with a note. Every record cites its source[]. NOTHING invented.",
    "_built": "2026-06-13",
    "_builder": "tools/build_character_roster.py",
    "_stat_keys": STAT_KEYS,
    "_stat_key_meaning_ja": {
        "tochi": "統率", "seiji": "政治", "unei": "運用", "joho": "情報",
        "shiki": "指揮", "kido": "機動", "kogeki": "攻撃", "bogyo": "防御",
    },
    "_sources": [
        "content/roster/characters.json (97 chars, real 8-ability stats)",
        "content/roster/official-roster.json (12 gineiden.com official sample: face_index, bio, romaji)",
        "content/roster/face-name-map.json (12 name<->face_number)",
        "content/roster/manual-roster.json (gin7 manual duty cards: post/rank/unit)",
        "content/roster/community-roster.json (KR CBT memoir attested names)",
    ],
    "_count": len(records),
    "_count_with_stats": sum(1 for r in records if r["stats_known"]),
    "_count_without_stats": sum(1 for r in records if not r["stats_known"]),
    "_count_with_face_number": sum(1 for r in records if r["face_number"] is not None),
    "_unresolved_no_stats": [r["name_ja"] for r in records if not r["stats_known"]],
    "characters": records,
}

with open(R("content", "character-roster.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print("wrote content/character-roster.json")
print("total records:", len(records))
print("with stats:", out["_count_with_stats"], "| without stats:", out["_count_without_stats"])
print("with face_number:", out["_count_with_face_number"])
print("no-stats (unresolved):", out["_unresolved_no_stats"])

# dedup sanity
names = [r["name_ja"] for r in records]
dups = sorted({n for n in names if names.count(n) > 1})
print("duplicate name_ja:", dups)
ids = [r["id"] for r in records]
iddups = sorted({i for i in ids if ids.count(i) > 1})
print("duplicate ids:", iddups)
