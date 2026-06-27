#!/usr/bin/env python3
"""Consolidate the POST/직위 of every canon character from ALL roster sources.

The gin7 manual gives only 75 duty-card holders. This merges every source that carries a post/rank/unit
so coverage goes well beyond 75, keyed by character name (ja primary, romaji/kr secondary). Reports how
many distinct canon characters we have and how many have a recovered post — so the gap to mine (web /
fuller manual org-chart) is explicit. Output: content/roster/canon-character-posts.json + summary.

Provenance: posts are P1 (official manual/site) or P2 (manual/IV-EX/community reconstruction) — NOT
original server data. Each merged row keeps its source list.
Run: python tools/logh7_canon_posts.py
"""
from __future__ import annotations
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def jload(rel):
    p = os.path.join(ROOT, rel)
    return json.load(open(p, encoding="utf-8")) if os.path.exists(p) else None


def as_list(d, key="characters"):
    if d is None:
        return []
    if isinstance(d, list):
        return d
    if isinstance(d, dict) and isinstance(d.get(key), list):
        return d[key]
    return []


def norm_key(*names):
    for n in names:
        if isinstance(n, str) and n.strip():
            return n.strip()
    return None


def main() -> int:
    # name_ja -> merged record
    by_key = {}

    def merge(key, **fields):
        if not key:
            return
        rec = by_key.setdefault(key, {"name_ja": None, "name_romaji": None, "name_kr": None,
                                      "faction": None, "post_ja": None, "rank_ja": None,
                                      "unit_ja": None, "kind": None, "flagship": None,
                                      "has_stats": False, "sources": []})
        for k, v in fields.items():
            if k == "source":
                if v and v not in rec["sources"]:
                    rec["sources"].append(v)
            elif v not in (None, "") and not rec.get(k):
                rec[k] = v

    # 1) characters.json (97: post_ja + stats)
    for c in as_list(jload("content/roster/characters.json")):
        if not isinstance(c, dict):
            continue
        merge(norm_key(c.get("name_ja"), c.get("name_romaji")),
              name_ja=c.get("name_ja"), name_romaji=c.get("name_romaji"), faction=c.get("faction"),
              post_ja=c.get("post_ja"), rank_ja=c.get("rank_ja"), kind=c.get("kind"),
              has_stats=bool(c.get("stats")), source="characters.json")

    # 2) manual-roster.json (75 duty-card holders: post/rank/unit)
    mr = jload("content/roster/manual-roster.json") or {}
    for side in ("empire", "alliance"):
        for r in mr.get(side, []) if isinstance(mr, dict) else []:
            if not isinstance(r, dict):
                continue
            merge(norm_key(r.get("holder_ja"), r.get("holder_romaji")),
                  name_ja=r.get("holder_ja"), name_romaji=r.get("holder_romaji"), faction=side,
                  post_ja=r.get("post_ja"), rank_ja=r.get("rank_ja"), unit_ja=r.get("unit_ja"),
                  kind=r.get("kind"), source="manual-roster.json")

    # 3) character-roster.json (99: post/unit/flagship)
    for c in as_list(jload("content/character-roster.json")):
        if not isinstance(c, dict):
            continue
        merge(norm_key(c.get("name_ja"), c.get("name_romaji")),
              name_ja=c.get("name_ja"), name_romaji=c.get("name_romaji"), name_kr=c.get("name_kr"),
              faction=c.get("faction"), post_ja=c.get("post"), rank_ja=c.get("rank"),
              unit_ja=c.get("unit"), flagship=c.get("flagship"), kind=c.get("kind"),
              has_stats=bool(c.get("stats")), source="character-roster.json")

    # 4) official-roster.json (12: post_ja + desc)
    for c in as_list(jload("content/roster/official-roster.json")):
        if not isinstance(c, dict):
            continue
        merge(norm_key(c.get("name_ja"), c.get("name_romaji")),
              name_ja=c.get("name_ja"), name_romaji=c.get("name_romaji"), name_kr=c.get("name_kr"),
              faction=c.get("faction"), post_ja=c.get("post_ja"), rank_ja=c.get("rank"),
              source="official-roster.json")

    # 5) ivex-reference.json (181: name_kr + faction, NO post — adds names/identity only)
    for c in as_list(jload("content/roster/ivex-reference.json")):
        if not isinstance(c, dict):
            continue
        # IV-EX is keyed by Korean name; only attach kr/faction to an existing ja key if romaji matches,
        # else record as a name-only canon entry so the roster size is honest.
        merge(norm_key(c.get("name_kr")), name_kr=c.get("name_kr"), faction=c.get("faction"),
              source="ivex-reference.json")

    rows = list(by_key.values())
    with_post = [r for r in rows if r.get("post_ja")]
    by_faction = {}
    for r in with_post:
        by_faction[r.get("faction") or "?"] = by_faction.get(r.get("faction") or "?", 0) + 1

    out = {
        "_purpose": "Consolidated canon-character -> post/직위 mapping from all roster sources. P1/P2 reconstruction, NOT original server data.",
        "_counts": {"distinctCanonNames": len(rows), "withRecoveredPost": len(with_post),
                    "withPostByFaction": by_faction},
        "_note": "IV-EX adds 181 names but no posts; manual gives 75 duty holders. Gap (named chars without a "
                 "post) must be mined from the fuller manual org-chart / web wiki (tag P2) — see canon-extra-posts.",
        "characters": sorted(rows, key=lambda r: (r.get("post_ja") is None, r.get("name_ja") or r.get("name_kr") or "")),
    }
    outpath = os.path.join(ROOT, "content", "roster", "canon-character-posts.json")
    json.dump(out, open(outpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"wrote {outpath}")
    print(f"distinct canon names: {len(rows)}")
    print(f"with a recovered post: {len(with_post)}  (beyond the manual's 75)")
    print(f"with-post by faction: {by_faction}")
    print("--- sample posts ---")
    for r in with_post[:15]:
        print(f"  {(r.get('name_ja') or r.get('name_kr') or '?'):<16} {r.get('post_ja')}  [{','.join(r['sources'])}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
