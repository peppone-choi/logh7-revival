"""Build content/character-portraits.json — evidence-based VII portrait <-> character identity links.

LANE C. ABSOLUTE RULE: never assert a link without a real, cited source. Every link records
{character_id, character_name, portrait_file, method, confidence, evidence}. Unknown => not asserted.

Evidence hierarchy actually available (verified 2026-06-13):
  1. PIXEL ANCHOR (HIGH): the ONLY 2 official gineiden.com chara/NNN.jpg that survived Wayback
     archiving (085 Schenkopp, 206 Yang; CDX-confirmed these are the only two) were pixel-matched
     (NCC) to a decoded canon atlas slot. Corroborated by AI vision + anime/wiki canonical look.
  2. CANON-UNIQUE APPEARANCE (MEDIUM): AI-vision named candidate whose unique canonical feature
     (Kircheis=red hair, Reinhard=blond wavy hair) is visible in the atlas slot and matches the
     anime/wiki description, AND atlas faction code agrees. No official face_number anchor exists.
  3. AI-VISION-ONLY candidate w/ non-unique feature (LOW): named candidate where the look is shared
     by several canon characters (e.g. several elderly white-haired alliance admirals) -> low.

DISPROVEN, NOT USED as identity: VI structural-NCC matches (portrait-identities-vi.json). Its own
anchor validation put the correct VI char at rank 4 (Yang) / rank 31 (Schenkopp), i.e. top-1 wrong.
The flat portraits/NNNN.png numbering is NOT the face_number (visual check: 0206.png != Yang).
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROSTER = ROOT / "content" / "roster"


def load(p):
    return json.loads((ROSTER / p).read_text(encoding="utf-8"))


def main() -> None:
    face_name = load("face-name-map.json")
    official = load("official-roster.json")
    ai = load("portrait-ai-classification.json")

    # face_number -> official confirmed name (12 entries, gineiden.com)
    by_face = {e["face_number"]: e for e in face_name["entries"]}

    links = []

    # ---- TIER 1: PIXEL-ANCHORED (HIGH) ----
    # Yang Wen-li, face 206, official chara/206.jpg pixel-matched to canon oam/0274 (NCC 0.923).
    links.append({
        "character_id": "VII_face_206",
        "character_name": "Yang Wen-li (ヤン・ウェンリー)",
        "faction": "alliance",
        "portrait_file": "content/roster/canon-portraits/oam/0274.png",
        "face_number": 206,
        "method": "official-image pixel-anchor + AI-vision + anime/wiki canon look",
        "confidence": "high",
        "evidence": [
            "OFFICIAL: gineiden.com/picture/chara/206.jpg (Wayback 20041016162511, one of only 2 "
            "official VII portraits that survived archiving; CDX-confirmed) pixel-matched to decoded "
            "atlas slot oam/0274 at NCC=0.923 (face-name-map.json entry face_number 206).",
            "OFFICIAL NAME: gineiden.com/st_char.html lists face_number 206 = ヤン (Yang Wen-li), "
            "post 艦隊司令官 (official-roster.json).",
            "AI-VISION (independent corroboration): portrait-ai-classification.json oam_0274 described "
            "'young dark-haired bereted soldier, alliance' (anchor_validation: signature described).",
            "ANIME/WIKI: Yang's canonical look = black beret w/ alliance crest + unruly black hair "
            "(gineipaedia.com/wiki/Yang_Wen-li; legendofthegalacticheroes.fandom.com) matches the slot.",
        ],
    })
    # Walter von Schenkopp, face 85, official chara/085.jpg pixel-matched to canon oam/0230 (NCC 0.878).
    links.append({
        "character_id": "VII_face_085",
        "character_name": "Walter von Schenkopp (シェーンコップ)",
        "faction": "alliance",
        "portrait_file": "content/roster/canon-portraits/oam/0230.png",
        "face_number": 85,
        "portrait_file_duplicates": [
            "content/roster/canon-portraits/oam/0481.png",
            "content/roster/canon-portraits/oam/0931.png",
        ],
        "method": "official-image pixel-anchor + AI-vision named-hit + anime/wiki canon look",
        "confidence": "high",
        "evidence": [
            "OFFICIAL: gineiden.com/picture/chara/085.jpg (Wayback 20050407195502, the other of only 2 "
            "surviving official VII portraits) pixel-matched to decoded atlas slot oam/0230 at NCC=0.878 "
            "(face-name-map.json entry face_number 85; duplicates oam/0481, oam/0931).",
            "OFFICIAL NAME: gineiden.com/st_char.html lists face_number 85 = シェーンコップ "
            "(Walter von Schenkopp), post 要塞守備隊指揮官 (official-roster.json).",
            "AI-VISION (independent named hit): portrait-ai-classification.json oam_0230 named "
            "'Walter von Schenkopp' conf 0.55 (anchor_validation result: 'independent hit').",
            "ANIME/WIKI: Schenkopp = rugged roguish Rosen Ritter commander, matches slot's "
            "'rugged roguish grinning warrior' look.",
        ],
    })

    # ---- TIER 2: CANON-UNIQUE APPEARANCE (MEDIUM) ----
    # Kircheis: unique red hair in the empire cast.
    links.append({
        "character_id": "VII_canon_oem_0026",
        "character_name": "Siegfried Kircheis (キルヒアイス)",
        "faction": "empire",
        "portrait_file": "content/roster/canon-portraits/oem/0026.png",
        "face_number": None,
        "method": "canon-unique-appearance (anime/wiki) + AI-vision named candidate + atlas faction",
        "confidence": "medium",
        "evidence": [
            "ANIME/WIKI: Kircheis's defining, near-unique canonical feature is 'flame-like red hair' "
            "(gineipaedia.com/wiki/Siegfried_Kircheis; legendofthegalacticheroes.fandom.com). The atlas "
            "slot oem/0026 shows a young red-haired empire officer -> visible match.",
            "AI-VISION: portrait-ai-classification.json named_candidate oem_0026 = 'Kircheis' conf 0.50, "
            "'gentle red-haired youth'.",
            "ATLAS FACTION: oem = empire/male (decode atlas code) agrees with Kircheis (empire).",
            "CAVEAT: NO official face_number anchor (only 2 official portraits survived); confidence "
            "rests on the rarity of red hair in the empire roster, not on a confirmed source mapping.",
        ],
    })
    # Reinhard: unique blond wavy hair / 'the blond admiral'. Official face_number is 209 (st_char),
    # but the surviving art for 209 was NOT pixel-archived; we link the canon-look slot, NOT claim it IS face 209.
    links.append({
        "character_id": "VII_canon_oem_0112",
        "character_name": "Reinhard von Lohengramm (ラインハルト)",
        "faction": "empire",
        "portrait_file": "content/roster/canon-portraits/oem/0112.png",
        "face_number_official_name_only": 209,
        "method": "canon-unique-appearance (anime/wiki) + AI-vision named candidate + atlas faction",
        "confidence": "medium",
        "evidence": [
            "ANIME/WIKI: Reinhard = 'the blond admiral' / 'blond angel' with iconic golden wavy hair "
            "(legendofthegalacticheroes.fandom.com; gineipaedia.com). Atlas slot oem/0112 shows a "
            "youthful long wavy blond empire officer with beautiful/androgynous features -> match.",
            "AI-VISION: portrait-ai-classification.json named_candidate oem_0112 = 'Reinhard' conf 0.60, "
            "'youthful long wavy blond hair, beautiful features' (highest-conf empire named candidate).",
            "ATLAS FACTION: oem = empire/male agrees with Reinhard (empire).",
            "OFFICIAL NAME (separate fact): gineiden.com gives Reinhard's face_number = 209, BUT chara/"
            "209.jpg did NOT survive Wayback (only 085/206 did), so 209 cannot be pixel-tied to a slot. "
            "This link is the canonical-look slot, NOT a claim that oem/0112 == face 209.",
        ],
    })

    # ---- TIER 3: AI-VISION-ONLY, NON-UNIQUE FEATURE (LOW) ----
    links.append({
        "character_id": "VII_canon_oam_0283",
        "character_name": "Alexandre Bucock (ビュコック)",
        "faction": "alliance",
        "portrait_file": "content/roster/canon-portraits/oam/0283.png",
        "face_number": None,
        "method": "AI-vision named candidate + canon look (non-unique elderly admiral)",
        "confidence": "low",
        "evidence": [
            "AI-VISION: portrait-ai-classification.json named_candidate oam_0283 = 'Bucock' conf 0.60, "
            "'grizzled old admiral, white hair'.",
            "ANIME/WIKI: Bucock is canonically an elderly white-haired/bearded alliance admiral -> "
            "consistent with the slot.",
            "CAVEAT (why LOW): white-haired elderly alliance admiral is NOT unique (Bucock, Cubresly, "
            "etc.); AI also proposed Bucock for oam_0232. No official anchor. Not asserted above low.",
        ],
    })

    out = {
        "_lane": "C — portrait <-> character identity links (evidence-only, no guessing)",
        "_generated": "2026-06-13",
        "_builder": "tools/logh7_build_character_portraits.py",
        "_rules": (
            "Every link cites a real source. No archetype/guess links. VI structural-NCC matches are "
            "NOT used for identity (their own anchor validation is top-1 wrong). Flat portraits/NNNN.png "
            "numbering is NOT the face_number (verified: portraits/0206.png is not Yang)."
        ),
        "_confidence_tiers": {
            "high": "official surviving portrait pixel-anchored to a decoded atlas slot + official name "
                    "+ independent AI-vision + anime/wiki canonical look all agree.",
            "medium": "AI-vision named candidate whose UNIQUE canonical feature (e.g. red/blond hair) is "
                      "visible in the slot and matches anime/wiki, and atlas faction agrees. No official anchor.",
            "low": "AI-vision named candidate with a non-unique canonical look; recorded for honesty, weak.",
        },
        "_hard_data_limits": {
            "official_portraits_surviving": [85, 206],
            "official_portraits_survival_note": (
                "Wayback CDX (url=gineiden.com/picture/chara/*) returns ONLY 085.jpg and 206.jpg with "
                "status 200. st_char.html itself states it shows only PART of the roster "
                "(このページではその一部を紹介します). The Korean Netmarble pages were 302 redirect stubs, "
                "never captured. Therefore only 2 portrait identities can be pixel-confirmed; no further "
                "official anchors are recoverable from the public internet."
            ),
            "face_number_to_atlas_slot": (
                "face_number (global Face/*.tcf index, the value in the 0x0323 record @0xf4) is NOT the "
                "atlas decode-slot number. The two are bridged ONLY by pixel-matching the official JPG, "
                "which exists for exactly 2 characters. The server CAN still emit the 12 official "
                "face_numbers for the right named characters (face-name-map.json) even though the picture "
                "for 10 of them is not locatable in our decode."
            ),
            "vi_to_vii_pixel_match": (
                "DISPROVEN as identity evidence: portrait-identities-vi.json._anchor_validation shows the "
                "correct VI character ranked 4th (Yang) and 31st (Schenkopp), top-1 wrong. The 514 VI "
                "'matches' are all confidence:'unidentified' and are NOT used to assert any identity here."
            ),
        },
        "links": links,
        "official_face_numbers_confirmed": [
            {"face_number": e["face_number"], "name_romaji": e["name_romaji"],
             "name_ja": e["name_ja"], "faction": e["faction"], "post_ja": e["post_ja"],
             "source": e["source"], "art_locatable_in_decode": e["face_number"] in (85, 206),
             "evidence": "gineiden.com/st_char.html (Wayback 20040115095030); "
                         "pixel-anchored to atlas slot only for 85/206."}
            for e in face_name["entries"]
        ],
    }

    # Coverage / unresolved accounting
    roster = load("characters.json")["characters"]
    n_high = sum(1 for l in links if l["confidence"] == "high")
    n_med = sum(1 for l in links if l["confidence"] == "medium")
    n_low = sum(1 for l in links if l["confidence"] == "low")
    out["_coverage"] = {
        "roster_size": len(roster),
        "links_high": n_high,
        "links_medium": n_med,
        "links_low": n_low,
        "links_high_plus_medium": n_high + n_med,
        "official_face_numbers_named": len(by_face),
        "summary": (
            f"{n_high} HIGH (pixel-anchored: Yang oam/0274, Schenkopp oam/0230) + "
            f"{n_med} MEDIUM (canon-unique look: Kircheis oem/0026, Reinhard oem/0112) "
            f"= {n_high + n_med} confident portrait identities. {n_low} LOW recorded. "
            f"Plus {len(by_face)} official name<->face_number facts (10 without locatable art)."
        ),
        "unresolved": [
            "~285 decoded atlas portraits (oam 181 + oem 187 + o 78, minus the few identified) remain "
            "WITHOUT a name: no labeled VII source exists. The game's roster was server-side and is lost; "
            "the client ships only an unlabeled face pool. Honest null.",
            "10 of the 12 official face_numbers (Reinhard 209 name-only-tied to a look-slot, Mittermeyer "
            "195, Kesler 69, Friedrich IV 270, Ofresser 41, Remscheid 286, Caselnes 48, Trunicht 125, "
            "Negroponti 268, Rebello 285) have a CONFIRMED name but their official portrait JPG did not "
            "survive Wayback, so their specific decoded slot cannot be pixel-confirmed.",
            "~85 roster characters (manual duty-holders) have NO source mapping them to any face_number "
            "or portrait at all (face-name-map.json._names_without_face_number) — cannot be linked.",
            "VI-labeled prior-game portraits (112) cannot be transferred to VII slots: VI->VII pixel "
            "matching is top-1 wrong on both ground-truth anchors (disproven above).",
        ],
    }

    out_path = ROOT / "content" / "character-portraits.json"
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("WROTE", out_path)
    print(json.dumps(out["_coverage"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
