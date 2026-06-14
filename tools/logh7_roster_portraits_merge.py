"""logh7_roster_portraits_merge -- give EVERY roster character a portrait + an in-game face value,
with an HONEST confidence tier (proven identity vs attribute-assigned). No guessing of identities.

Two distinct goals, kept separate and labeled:
  (A) GAMEPLAY completeness: every character needs a renderable face value (0x0323 record @0xf4) so the
      client draws SOME portrait. content/roster/face-assignment.json already assigns each of 97 chars an
      atlas slot by ATTRIBUTE (faction/sex/age/hair) — a reasoned visual assignment (not a random guess,
      not a claimed identity). 97/97 slots have a decoded PNG on disk.
  (B) CANON identity (is this portrait REALLY character X?): only the links in
      content/character-portraits.json are evidence-proven (2 pixel-anchored: Yang #206, Schenkopp #85;
      + a couple medium canon-feature matches). The rest are honest nulls — the VII roster was server-side
      and is lost, so most portraits cannot be identity-verified without a live-client calibration pass.

This merge writes, per character: portrait_file, atlas_slot, face_value (encode of the slot for the wire),
portrait_confidence ∈ {proven_high, proven_medium, assigned, none}, portrait_method, portrait_evidence.
Proven links (B) override the attribute assignment (A) and carry their real evidence. Output overwrites
content/character-roster.json (enriched) and writes content/character-portraits-complete.json (the flat
character→portrait table for the server/UI).

Usage:  python -m tools.logh7_roster_portraits_merge [--print]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Final

from tools.logh7_face_id_decode import ATLAS, encode

ROOT: Final[Path] = Path(__file__).resolve().parents[1]
ROSTER_JSON: Final[Path] = ROOT / "content" / "character-roster.json"
FACE_ASSIGN: Final[Path] = ROOT / "content" / "roster" / "face-assignment.json"
PORTRAITS: Final[Path] = ROOT / "content" / "character-portraits.json"
OUT_FLAT: Final[Path] = ROOT / "content" / "character-portraits-complete.json"


def _load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def _slot_to_file(slot: str) -> str | None:
    """atlas slot 'oem_0002' -> the decoded portrait PNG path (relative), or None."""
    if "_" not in slot:
        return None
    atlas, idx = slot.split("_", 1)
    for cand in (
        ROOT / "content" / "roster" / "canon-portraits" / atlas / f"{idx}.png",
        ROOT / "content" / "roster" / "portraits" / atlas / f"{idx}.png",
    ):
        if cand.exists():
            return str(cand.relative_to(ROOT)).replace("\\", "/")
    return None


def _slot_to_face_value(slot: str) -> int | None:
    """Encode an atlas slot into an in-game face value (0x0323 @0xf4). Index clamped to the atlas cap."""
    if "_" not in slot:
        return None
    atlas, idx = slot.split("_", 1)
    if atlas not in ATLAS:
        return None
    try:
        return encode(atlas, min(int(idx), ATLAS[atlas]["cap"]))
    except (ValueError, TypeError):
        return None


def _char_name(c: dict) -> str:
    return c.get("name_romaji") or c.get("name_ja") or ""


def build() -> tuple[list[dict], list[dict]]:
    roster_doc = _load(ROSTER_JSON)
    chars = roster_doc["characters"] if isinstance(roster_doc, dict) and "characters" in roster_doc else roster_doc

    # (A) attribute assignment: character name -> atlas slot
    assign = {a["character"]: a["assigned_atlas_slot"] for a in _load(FACE_ASSIGN)["assignments"]}

    # (B) proven identity links. The proven character_name is like "Yang Wen-li (ヤン・ウェンリー)" — index it
    # by the romaji part, the ja part (inside the parens), and every whitespace token so a roster record
    # named just "Yang" / "Kircheis" / "ヤン・ウェンリー" still resolves to its evidence-proven portrait.
    proven: dict[str, dict] = {}
    pdoc = _load(PORTRAITS)
    for link in pdoc.get("links", []) if isinstance(pdoc, dict) else []:
        nm = link.get("character_name", "")
        romaji = nm.split("(")[0].strip()
        ja = nm.split("(")[1].rstrip(")").strip() if "(" in nm else ""
        for key in {nm, romaji, ja, *romaji.split(), *(t for t in romaji.split() if len(t) > 2)}:
            if key:
                proven.setdefault(key, link)

    flat: list[dict] = []
    for c in chars:
        name = _char_name(c)
        slot = assign.get(name)
        # default: attribute-assigned
        portrait_file = _slot_to_file(slot) if slot else None
        face_value = _slot_to_face_value(slot) if slot else None
        confidence = "assigned" if portrait_file else "none"
        method = "attribute-assignment (faction/sex/age/hair)" if portrait_file else "no assignment"
        evidence = [f"face-assignment.json slot {slot}"] if slot else []

        # override with a proven identity link when one exists for this character (try romaji full/surname
        # and the ja name — proven links are indexed by all of those).
        ja = c.get("name_ja") or ""
        p = (proven.get(name) or proven.get(ja)
             or (proven.get(name.split(" ")[-1]) if name else None)
             or (proven.get(name.split(" ")[0]) if name else None))
        if p and p.get("portrait_file"):
            pf = p["portrait_file"]
            pf_abs = (ROOT / pf)
            if pf_abs.exists():
                portrait_file = pf if pf.startswith("content/") else str(pf_abs.relative_to(ROOT)).replace("\\", "/")
                conf = (p.get("confidence") or "").lower()
                confidence = "proven_high" if conf == "high" else "proven_medium" if conf == "medium" else "proven_low"
                method = p.get("method", "evidence link")
                evidence = p.get("evidence", [])

        c["portrait_file"] = portrait_file
        c["atlas_slot"] = slot
        c["face_value"] = face_value
        c["portrait_confidence"] = confidence
        c["portrait_method"] = method
        c["portrait_evidence"] = evidence
        flat.append({
            "name": name,
            "name_ja": c.get("name_ja"),
            "faction": c.get("faction"),
            "portrait_file": portrait_file,
            "atlas_slot": slot,
            "face_value": face_value,
            "confidence": confidence,
            "method": method,
        })

    return chars, flat


def main() -> None:
    chars, flat = build()
    roster_doc = _load(ROSTER_JSON)
    if isinstance(roster_doc, dict) and "characters" in roster_doc:
        roster_doc["characters"] = chars
        roster_doc["_portrait_merge"] = "logh7_roster_portraits_merge: every char has portrait_file + face_value; confidence proven_*/assigned/none"
        ROSTER_JSON.write_text(json.dumps(roster_doc, ensure_ascii=False, indent=1), encoding="utf-8")
    tiers: dict[str, int] = {}
    for f in flat:
        tiers[f["confidence"]] = tiers.get(f["confidence"], 0) + 1
    OUT_FLAT.write_text(json.dumps({
        "_note": "Every roster character -> portrait. confidence: proven_high/medium = evidence-verified identity; assigned = attribute-plausible visual assignment (NOT a claimed identity); none = no portrait. face_value = in-game 0x0323 @0xf4 encoding of the atlas slot.",
        "_tiers": tiers,
        "count": len(flat),
        "with_portrait": sum(1 for f in flat if f["portrait_file"]),
        "characters": flat,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"merged {len(flat)} characters; with_portrait={sum(1 for f in flat if f['portrait_file'])}; tiers={tiers}")
    if "--print" in sys.argv:
        for f in flat[:20]:
            print(f"  {f['confidence']:13s} {str(f['face_value'] or ''):>8}  {f['atlas_slot'] or '-':10s}  {f['name']}")


if __name__ == "__main__":
    main()
