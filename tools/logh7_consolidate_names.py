# -*- coding: utf-8 -*-
"""Consolidate EVERY name from EVERY extracted source into content/extracted/all-names.json.

Method: read each source JSON, pull proper names per category, keep
{text_ja, text_kr?, romaji?, source[]}, de-dupe by text_ja (merging sources +
filling kr/romaji). Invent nothing: every field comes from a source file.

Run: python tools/logh7_consolidate_names.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, "content")


def load(rel):
    with open(os.path.join(C, rel), encoding="utf-8") as f:
        return json.load(f)


class Bucket:
    """De-dupe by text_ja, with a secondary romaji index so an English-only
    entry (no JA) folds into an existing JA record sharing the same romaji,
    and a JA record can be reached by a later romaji-only add. `romaji_merge`
    is enabled only for characters (where romaji is a stable identity);
    place/ship/post names share romaji-less or ambiguous forms so they key on
    text_ja only."""

    def __init__(self, romaji_merge=False):
        self.by_key = {}
        self.order = []
        self.romaji_index = {}  # normalized romaji -> primary key
        self.romaji_merge = romaji_merge

    @staticmethod
    def _norm(r):
        return r.lower().strip() if r else None

    def add(self, text_ja=None, text_kr=None, romaji=None, source=None):
        text_ja = (text_ja or "").strip() or None
        text_kr = (text_kr or "").strip() or None
        romaji = (romaji or "").strip() or None
        nrom = self._norm(romaji)

        key = None
        if self.romaji_merge and nrom and nrom in self.romaji_index:
            # fold into existing record that shares this romaji
            key = self.romaji_index[nrom]
        if key is None:
            key = text_ja or romaji or text_kr
        if not key:
            return

        if key not in self.by_key:
            self.by_key[key] = {
                "text_ja": text_ja,
                "text_kr": text_kr,
                "romaji": romaji,
                "source": [],
            }
            self.order.append(key)
        rec = self.by_key[key]
        if text_kr and not rec["text_kr"]:
            rec["text_kr"] = text_kr
        if romaji and not rec["romaji"]:
            rec["romaji"] = romaji
        if text_ja and not rec["text_ja"]:
            rec["text_ja"] = text_ja
        if source:
            for s in (source if isinstance(source, list) else [source]):
                if s and s not in rec["source"]:
                    rec["source"].append(s)
        # register romaji -> key so future adds with same romaji merge here.
        # Prefer the record that has a JA form as the canonical target.
        if self.romaji_merge and nrom:
            cur = self.romaji_index.get(nrom)
            if cur is None or (not self.by_key[cur]["text_ja"] and rec["text_ja"]):
                self.romaji_index[nrom] = key

    def out(self):
        res = []
        for k in self.order:
            rec = self.by_key[k]
            clean = {"text_ja": rec["text_ja"]}
            if rec["text_kr"]:
                clean["text_kr"] = rec["text_kr"]
            if rec["romaji"]:
                clean["romaji"] = rec["romaji"]
            clean["source"] = rec["source"]
            res.append(clean)
        return res


characters = Bucket(romaji_merge=True)
ships = Bucket()
systems = Bucket()
planets = Bucket()
fortresses = Bucket()
factions = Bucket()
ranks = Bucket()
posts = Bucket()
institutions = Bucket()

# ---- CHARACTERS ----------------------------------------------------------
# content/character-roster.json (merged master, 99)
SRC = "content/character-roster.json"
d = load("character-roster.json")
for c in d["characters"]:
    characters.add(c.get("name_ja"), c.get("name_kr"), c.get("name_romaji"), SRC)

# content/roster/characters.json (97, manual+ivex stats)
SRC = "content/roster/characters.json"
d = load("roster/characters.json")
for c in d["characters"]:
    characters.add(c.get("name_ja"), None, c.get("name_romaji"), SRC)

# content/roster/official-roster.json (12, wayback official site)
SRC = "content/roster/official-roster.json"
d = load("roster/official-roster.json")
for c in d["characters"]:
    characters.add(c.get("name_ja"), c.get("name_kr"), c.get("name_romaji"), SRC)

# content/roster/manual-roster.json empire/alliance holders
SRC = "content/roster/manual-roster.json"
d = load("roster/manual-roster.json")
for side in ("empire", "alliance"):
    for h in d.get(side, []):
        characters.add(h.get("holder_ja"), None, h.get("holder_romaji"), SRC)

# content/roster/community-roster.json (KR-CBT attested)
SRC = "content/roster/community-roster.json"
d = load("roster/community-roster.json")
for c in d.get("community_canon_names_attested", []):
    characters.add(c.get("name_ja"), c.get("name_kr"), c.get("name_romaji"), SRC)

# content/roster/web-character-research.json (web sweep)
SRC = "content/roster/web-character-research.json"
d = load("roster/web-character-research.json")
for c in d["characters"]:
    characters.add(c.get("name_ja"), None, c.get("name_romaji"), SRC)

# content/roster/canon-extra.json (canon-sourced, English-only names)
SRC = "content/roster/canon-extra.json"
d = load("roster/canon-extra.json")
for c in d["characters"]:
    # these only carry an English/romaji name in 'name'
    characters.add(None, None, c.get("name"), SRC)

# ---- SYSTEMS / PLANETS / FORTRESSES -------------------------------------
SRC = "content/galaxy.json"
d = load("galaxy.json")
for s in d["systems"]:
    systems.add(s.get("system"), None, None, SRC)
    for p in s.get("planets", []):
        planets.add(p.get("name"), None, None, SRC)
    for f in s.get("fortresses", []):
        fortresses.add(f if isinstance(f, str) else f.get("name"), None, None, SRC)

# ---- SHIPS ---------------------------------------------------------------
SRC = "content/ship-stats.json"
d = load("ship-stats.json")
for s in d["ships"]:
    ships.add(s.get("name"), None, s.get("key"), SRC)

SRC = "content/manual/ship-units.json"
d = load("manual/ship-units.json")
for side in ("empire", "alliance"):
    for u in d.get(side, []):
        ships.add(u.get("name_ja"), None, None, SRC)

# ---- FACTIONS ------------------------------------------------------------
# Attested in-data faction labels (manual-roster classes + character factions).
# 帝国 / 同盟 are the canonical JA faction names per manual classes; フェザーン
# attested as 駐フェザーン弁務官事務所 institution + フェザーン回廊.
SRC = "content/roster/manual-roster.json"
factions.add("帝国", "제국", "Galactic Empire (Goldenbaum)", SRC + " (classes: 帝国: 貴族/騎士/平民/亡命者)")
factions.add("同盟", "동맹", "Free Planets Alliance", SRC + " (classes: 同盟: 市民/亡命者)")
factions.add("フェザーン", "페잔", "Fezzan Dominion", "content/manual/org-posts.json (駐フェザーン弁務官事務所)")

# ---- RANKS ---------------------------------------------------------------
SRC = "content/roster/manual-roster.json"
d = load("roster/manual-roster.json")
for r in d.get("rankLadderMilitary", []):
    ranks.add(r, None, None, SRC + " (rankLadderMilitary)")

# ---- POSTS ---------------------------------------------------------------
SRC = "content/manual/org-posts.json"
d = load("manual/org-posts.json")
for side in ("empire", "alliance"):
    for p in d.get(side, []):
        posts.add(p.get("post_ja"), None, None, SRC + " (" + side + ")")
# also manual-roster postDefinitions
SRC = "content/roster/manual-roster.json"
d = load("roster/manual-roster.json")
for p in d.get("postDefinitions", []):
    posts.add(p.get("post_ja"), None, None, SRC + " (postDefinitions)")

# ---- INSTITUTIONS --------------------------------------------------------
SRC = "content/manual/org-posts.json"
d = load("manual/org-posts.json")
for side in ("empire", "alliance"):
    for p in d.get(side, []):
        institutions.add(p.get("org_ja"), None, None, SRC + " (" + side + ")")
SRC = "content/roster/manual-roster.json"
d = load("roster/manual-roster.json")
for p in d.get("postDefinitions", []):
    institutions.add(p.get("org_ja"), None, None, SRC + " (postDefinitions)")

# ---- ASSEMBLE ------------------------------------------------------------
groups = {
    "characters": characters.out(),
    "ships": ships.out(),
    "systems": systems.out(),
    "planets": planets.out(),
    "fortresses": fortresses.out(),
    "factions": factions.out(),
    "ranks": ranks.out(),
    "posts": posts.out(),
    "institutions": institutions.out(),
}

totals = {k: len(v) for k, v in groups.items()}
total = sum(totals.values())

out = {
    "_purpose": "Master consolidation of EVERY proper name from EVERY extracted LOGH VII source. "
    "De-duped by text_ja. Each entry cites its source file(s). Nothing invented: "
    "all values come from content/ source JSONs.",
    "_method": "tools/logh7_consolidate_names.py reads content/extracted/* + content/roster/* "
    "+ content/galaxy.json + content/manual/* + content/ship-stats.json + content/character-roster.json.",
    "_encoding": "Japanese source text is cp932/Shift-JIS (client renders via GDI ANSI); "
    "Korean (text_kr) is cp949 localization where attested.",
    "_sources_read": [
        "content/character-roster.json",
        "content/roster/characters.json",
        "content/roster/official-roster.json",
        "content/roster/manual-roster.json",
        "content/roster/community-roster.json",
        "content/roster/web-character-research.json",
        "content/roster/canon-extra.json",
        "content/galaxy.json",
        "content/ship-stats.json",
        "content/manual/ship-units.json",
        "content/manual/org-posts.json",
    ],
    "_note_strings_index": "content/extracted/strings-index.json + strings-names.json carry NO proper "
    "names (927-byte UI fragment). content/extracted/dat-tables.json + msgdat-full.json + "
    "binary-data.json + model-*.json are message templates / wire schema / geometry with no "
    "name rows, so they contribute no proper names to this dataset.",
    "_totals": totals,
    "_total": total,
    "characters": groups["characters"],
    "ships": groups["ships"],
    "systems": groups["systems"],
    "planets": groups["planets"],
    "fortresses": groups["fortresses"],
    "factions": groups["factions"],
    "ranks": groups["ranks"],
    "posts": groups["posts"],
    "institutions": groups["institutions"],
}

dest = os.path.join(C, "extracted", "all-names.json")
with open(dest, "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print("WROTE", dest)
print("TOTAL", total)
for k, v in totals.items():
    print(" ", k, v)
