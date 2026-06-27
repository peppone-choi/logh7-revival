#!/usr/bin/env python3
"""Extract ALL game text and classify it.

Sources (already decoded to cp949/Korean by the extraction pipeline):
  content/extracted/msgdat-full.json  - constmsg.dat (3199, 120 groups), messages_* (dialog),
                                        messages_tac_* (tactical), messages_com_*, g7sw.dat
  content/extracted/strings-index.json - String.txt runtime strings (if present)

Classification has TWO axes:
  1. STRUCTURAL (the game's own partition): file + constmsg offsetTable GROUP. Each constmsg group is a
     clear domain (commands, posts, ranks, medals, abilities, grid-types, info-panel labels, ...).
  2. CONTENT heuristic: name/label, command, sentence/description, prompt/message, template, enum, number.

Output: content/extracted/text-classified.json (every string tagged) + a printed summary.
Run: python tools/logh7_text_classify.py
"""
from __future__ import annotations
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MSGDAT = os.path.join(ROOT, "content", "extracted", "msgdat-full.json")
STRINGS = os.path.join(ROOT, "content", "extracted", "strings-index.json")
OUT = os.path.join(ROOT, "content", "extracted", "text-classified.json")

# constmsg group -> domain label (the game's own partition; verified by sampling group contents).
CONSTMSG_GROUP_DOMAIN = {
    0x00: "command.catalog", 0x01: "enum.faction", 0x02: "enum.army-type", 0x03: "post.title",
    0x04: "institution.name", 0x05: "rank.title", 0x06: "post.description", 0x07: "ability.name",
    0x08: "medal.name", 0x09: "enum.policy", 0x0a: "enum.policy", 0x0b: "enum.appoint-auth",
    0x0c: "enum.appoint-auth", 0x0d: "enum.policy", 0x0e: "enum.online-status", 0x0f: "enum.social-class",
    0x10: "enum.alive", 0x11: "enum.sex", 0x12: "personnel.action", 0x13: "economy.action",
    0x14: "ui.timer-label", 0x15: "ui.prompt", 0x16: "ui.tab-label", 0x17: "grid.type-label",
    0x18: "system.marker", 0x19: "ui.panel.character-list", 0x1a: "ui.panel.character-info",
    0x1b: "ui.panel.career", 0x1c: "ui.panel.medal", 0x1d: "ui.panel.duty-auth",
    0x1e: "ui.panel.special-ability", 0x1f: "ui.panel.ship-list", 0x20: "ui.panel.ship-info",
    0x21: "ui.panel.weapon", 0x22: "ui.panel.fighter", 0x23: "ui.panel.passenger",
    0x24: "ui.panel.help", 0x25: "ui.panel.info-tabs", 0x26: "ui.panel.flagship-info",
    0x27: "ui.panel.weapon", 0x28: "ui.panel.help", 0x29: "ui.panel.squadron-list",
    0x2a: "ui.panel.squadron-info", 0x2b: "ui.panel.ship-count", 0x2c: "ui.panel.troop",
}

FILE_DOMAIN = {
    "constmsg.dat": "catalog",          # partitioned by group (above)
    "g7sw.dat": "profanity-filter",
}


def file_kind(name: str) -> str:
    if name.startswith("messages_tac"):
        return "message.tactical"
    if name.startswith("messages_com"):
        return "message.command"
    if name.startswith("messages_"):
        return "message.dialog"
    return FILE_DOMAIN.get(name, "other")


TEMPLATE_RE = re.compile(r"%[-0-9.]*[dsxcfu]|[%￥¥][0-9]|\{[0-9]\}|％[ＳＤ]")
SENTENCE_END_RE = re.compile(r"[。.!?！？]\s*$|[。.!?！？].{0,3}\\n")
PROMPT_RE = re.compile(r"(하세요|하십시오|했습니다|하시겠습니까|해 주세요|주십시오|되었습니다|없습니다|있습니다)")
NUMBERISH_RE = re.compile(r"^[\d\s,.\-:/]+$")


def content_category(text: str) -> str:
    t = text.strip()
    if not t:
        return "empty"
    has_nl = "\n" in t
    if TEMPLATE_RE.search(t):
        return "template"  # carries a format token (count/value substitution)
    if NUMBERISH_RE.match(t):
        return "number"
    if PROMPT_RE.search(t):
        return "prompt-or-message"
    if has_nl or len(t) > 28 or SENTENCE_END_RE.search(t):
        return "sentence-or-description"
    if len(t) <= 16:
        return "name-or-label"
    return "phrase"


def ot_value(entry):
    if isinstance(entry, int):
        return entry
    if isinstance(entry, dict):
        return entry.get("value")
    return None


def constmsg_groups(recs, offset_table):
    bases = [ot_value(x) for x in offset_table]
    out = []
    for gi, b in enumerate(bases):
        if not isinstance(b, int):
            continue
        nxt = None
        for j in range(gi + 1, len(bases)):
            if isinstance(bases[j], int):
                nxt = bases[j]
                break
        if nxt is None:
            nxt = len(recs)
        out.append((gi, b, nxt))
    return out


def main() -> int:
    if not os.path.exists(MSGDAT):
        print(f"missing {MSGDAT}", file=sys.stderr)
        return 2
    d = json.load(open(MSGDAT, encoding="utf-8"))
    files = d["files"]

    entries = []  # {source, file, group, group_domain, sub_id, id, text, category}

    # constmsg.dat -> per-group domain
    cm = files.get("constmsg.dat")
    if cm:
        recs = cm.get("records", [])
        ot = cm.get("layout", {}).get("offsetTable", [])
        groups = constmsg_groups(recs, ot)
        idx_to_group = {}
        for gi, b, nxt in groups:
            for j in range(b, min(nxt, len(recs))):
                idx_to_group[j] = (gi, j - b)
        for j, rec in enumerate(recs):
            text = rec.get("text", "") or ""
            gi, sub = idx_to_group.get(j, (None, None))
            domain = CONSTMSG_GROUP_DOMAIN.get(gi, f"catalog.group_{gi:#04x}" if gi is not None else "catalog.ungrouped")
            entries.append({
                "source": "constmsg.dat", "file": "constmsg.dat", "group": gi, "group_domain": domain,
                "sub_id": sub, "id": rec.get("id", j), "text": text, "category": content_category(text),
            })

    # message_* / tac / com / g7sw
    for name, x in files.items():
        if name == "constmsg.dat":
            continue
        kind = file_kind(name)
        for rec in x.get("records", []):
            text = rec.get("text", "") or ""
            entries.append({
                "source": name, "file": name, "group": None, "group_domain": kind,
                "sub_id": None, "id": rec.get("id"), "text": text, "category": content_category(text),
            })

    # String.txt runtime strings
    if os.path.exists(STRINGS):
        si = json.load(open(STRINGS, encoding="utf-8"))
        sl = si.get("strings") if isinstance(si, dict) else si
        if isinstance(sl, list):
            for i, s in enumerate(sl):
                text = s if isinstance(s, str) else (s.get("text", "") if isinstance(s, dict) else "")
                if not text:
                    continue
                entries.append({
                    "source": "String.txt", "file": "String.txt", "group": None,
                    "group_domain": "string.runtime", "sub_id": None, "id": i,
                    "text": text, "category": content_category(text),
                })

    nonempty = [e for e in entries if e["category"] != "empty"]

    # summaries
    by_domain, by_category, by_source = {}, {}, {}
    for e in nonempty:
        by_domain[e["group_domain"]] = by_domain.get(e["group_domain"], 0) + 1
        by_category[e["category"]] = by_category.get(e["category"], 0) + 1
        by_source[e["source"]] = by_source.get(e["source"], 0) + 1

    result = {
        "_purpose": "All game text extracted and classified by structural domain (file+constmsg group) and content category.",
        "_counts": {"total": len(entries), "nonEmpty": len(nonempty),
                    "domains": len(by_domain), "categories": len(by_category)},
        "byDomain": dict(sorted(by_domain.items(), key=lambda kv: -kv[1])),
        "byCategory": dict(sorted(by_category.items(), key=lambda kv: -kv[1])),
        "bySource": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        "entries": entries,
    }
    json.dump(result, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    print(f"wrote {OUT}")
    print(f"total={len(entries)} nonEmpty={len(nonempty)} domains={len(by_domain)} categories={len(by_category)}")
    print("--- by domain (top 30) ---")
    for k, v in list(sorted(by_domain.items(), key=lambda kv: -kv[1]))[:30]:
        print(f"  {v:>5}  {k}")
    print("--- by content category ---")
    for k, v in sorted(by_category.items(), key=lambda kv: -kv[1]):
        print(f"  {v:>5}  {k}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
