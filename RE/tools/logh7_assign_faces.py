"""
logh7_assign_faces.py
=====================
Attribute-based face assignment for LOGH VII named characters.

Reads:
  content/roster/characters.json
  content/roster/portrait-ai-classification.json

Writes:
  content/roster/face-assignment.json

Algorithm:
  1. Build candidate pool from by_unique (289 unique atlas/slot faces).
  2. For each character compute desired attributes.
  3. HARD reject: faction mismatch (unless faction_guess=="unknown"), sex mismatch.
  4. SOFT score: weighted match on age_band, hair_color, hair_style, facial_hair.
  5. Greedy assignment, highest-priority characters first.
     - Priority order: pinned anchors -> canon majors (specific hair) -> rest (deterministic).
  6. Each face used at most once; if pool exhausted for a bucket, allow reuse and flag it.
  7. Two pixel-confirmed anchors are FIXED and bypass scoring.
"""

import json
import os
from copy import deepcopy

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHARS_PATH = os.path.join(BASE, "content", "roster", "characters.json")
CLASS_PATH = os.path.join(BASE, "content", "roster", "portrait-ai-classification.json")
OUT_PATH   = os.path.join(BASE, "content", "roster", "face-assignment.json")

# ---------------------------------------------------------------------------
# Canon overrides: name_romaji -> {faction, sex, hair_color, hair_style, age_band}
# ---------------------------------------------------------------------------
CANON = {
    "Lohengramm": {
        "faction": "empire", "sex": "male",
        "hair_color": "blond", "hair_style": "long", "age_band": "20s",
    },
    "Kircheis": {
        "faction": "empire", "sex": "male",
        "hair_color": "red", "hair_style": "long", "age_band": "20s",
    },
    "Yang Wen-li": {
        "faction": "alliance", "sex": "male",
        "hair_color": "black", "hair_style": "medium", "age_band": "30s",
    },
    "Mittermeyer": {
        "faction": "empire", "sex": "male",
        "hair_color": "silver", "hair_style": "short", "age_band": "30s",
    },
    "Reuenthal": {
        "faction": "empire", "sex": "male",
        "hair_color": "black", "hair_style": "medium", "age_band": "30s",
    },
    "Oberstein": {
        "faction": "empire", "sex": "male",
        "hair_color": "silver", "hair_style": "short", "age_band": "40s",
    },
    "Bittenfeld": {
        "faction": "empire", "sex": "male",
        "hair_color": "orange", "hair_style": "medium", "age_band": "30s",
    },
    "Schonkopp": {
        "faction": "alliance", "sex": "male",
        "hair_color": "brown", "hair_style": "medium", "age_band": "30s",
    },
    # Julian Mintz — not in roster by that name; skip
    # Annerose
    "von Musel": {
        "faction": "empire", "sex": "female",
        "hair_color": "blond", "hair_style": "long", "age_band": "20s",
    },
    # Frederica Greenhill
    "Greenhill": {
        "faction": "alliance", "sex": "female",
        "hair_color": "brown", "hair_style": "medium", "age_band": "20s",
    },
    # Hildegard von Mariendorf — not in the roster by name; skip
}

# Characters whose sex=female (derived from canon knowledge, since roster has no sex field)
KNOWN_FEMALES = {
    "von Musel",   # Annerose
    "Greenhill",   # Frederica (index 75); D. Greenhill (43) is male
}

# Pinned anchors: name_romaji -> atlas/slot key
PINNED = {
    "Yang Wen-li": "oam_0274",
    "Schonkopp":   "oam_0230",
}

# Priority order for greedy assignment (assigned first, so they get best pick)
# Canon majors with specific hair constraints
PRIORITY_NAMES = [
    "Lohengramm",    # blond long 20s empire
    "Kircheis",      # red long 20s empire
    "Bittenfeld",    # orange medium 30s empire
    "Mittermeyer",   # silver short 30s empire
    "Reuenthal",     # black medium 30s empire
    "Oberstein",     # silver short 40s empire
    "von Musel",     # blond long 20s empire female
    "Greenhill",     # brown medium 20s alliance female (index 75)
    "Schonkopp",     # pinned
    "Yang Wen-li",   # pinned
]

# Age-band ordering for proximity scoring
AGE_ORDER = ["teens", "20s", "30s", "40s", "50s", "60s+"]

# ---------------------------------------------------------------------------
# Scoring weights
# ---------------------------------------------------------------------------
W_AGE   = 2.0   # per band distance penalty
W_HAIR  = 3.0   # hair_color exact match
W_STYLE = 1.5   # hair_style exact match
W_FH    = 1.0   # facial_hair: prefer none for younger chars
W_VIBE  = 0.5   # rough vibe bonus (faction-relevant)

MAX_SCORE = W_HAIR + W_STYLE + W_FH + W_VIBE  # age contributes relative penalty


def age_distance(a, b):
    """Ordinal distance between two age bands."""
    try:
        return abs(AGE_ORDER.index(a) - AGE_ORDER.index(b))
    except ValueError:
        return 2  # default if unknown


def score_face(face, desired):
    """
    Return (score, hard_fail).
    score is positive; higher is better.
    hard_fail=True means this face must be rejected.
    """
    # --- HARD constraints ---
    # Sex mismatch
    desired_sex = desired.get("sex", "male")
    if face["sex"] != desired_sex:
        return 0.0, True

    # Faction mismatch
    fg = face["faction_guess"]
    desired_faction = desired.get("faction", "empire")
    # Map desired faction to what we expect from atlas+faction_guess
    if fg != "unknown" and fg != desired_faction:
        return 0.0, True

    # --- SOFT scoring ---
    s = 0.0

    # Age proximity (penalty-based; start from max and subtract)
    age_d = age_distance(face["age_band"], desired.get("age_band", "40s"))
    s += max(0.0, W_AGE * (3 - age_d))  # 0 distance -> +6, 1 -> +4, 2 -> +2, 3+ -> 0

    # Hair color
    if desired.get("hair_color") and face["hair_color"] == desired["hair_color"]:
        s += W_HAIR

    # Hair style
    if desired.get("hair_style") and face["hair_style"] == desired["hair_style"]:
        s += W_STYLE

    # Facial hair: if desired is young/clean, prefer none
    if desired.get("age_band") in ("teens", "20s", "30s"):
        if face["facial_hair"] == "none":
            s += W_FH
    else:
        s += W_FH * 0.5  # neutral for older chars

    # Vibe bonus: faction_guess explicitly matches
    if fg == desired_faction:
        s += W_VIBE

    return s, False


def derive_desired(char, canon_key):
    """Derive desired attributes for a character."""
    if canon_key in CANON:
        d = dict(CANON[canon_key])
    else:
        # Default: derive from roster data
        faction = char.get("faction", "empire")
        # Sex: check known females
        sex = "female" if canon_key in KNOWN_FEMALES else "male"
        d = {
            "faction": faction,
            "sex": sex,
            "hair_color": None,   # flexible
            "hair_style": None,   # flexible
            "age_band": "40s",    # neutral default
        }
    return d


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    with open(CHARS_PATH, encoding="utf-8") as f:
        chars_data = json.load(f)
    with open(CLASS_PATH, encoding="utf-8") as f:
        cls_data = json.load(f)

    characters = chars_data["characters"]
    faces = cls_data["by_unique"]

    # Build face pool dict keyed by atlas/slot key
    face_pool = {f["key"]: f for f in faces}

    # Track used faces
    used_keys = set()

    # Build assignment list (will be filled in priority order then remaining)
    assignments = []

    # Map name_romaji -> char record for quick lookup
    char_map = {c.get("name_romaji", ""): c for c in characters}

    # Assign index as character id
    char_indexed = [(i, c) for i, c in enumerate(characters)]

    # Determine processing order:
    # 1. Pinned anchors (by name)
    # 2. Priority names (canon majors)
    # 3. Rest (stable by index)
    def sort_key(idx_char):
        idx, c = idx_char
        name = c.get("name_romaji", "")
        if name in PINNED:
            return (0, PRIORITY_NAMES.index(name) if name in PRIORITY_NAMES else 99, idx)
        if name in PRIORITY_NAMES:
            return (1, PRIORITY_NAMES.index(name), idx)
        return (2, 0, idx)

    ordered = sorted(char_indexed, key=sort_key)

    # Process each character
    result_map = {}  # idx -> assignment record

    for idx, char in ordered:
        name = char.get("name_romaji", "")
        canon_key = name  # used for CANON lookup
        faction = char.get("faction", "empire")
        desired = derive_desired(char, canon_key)

        # Handle D. Greenhill (43) vs Greenhill (75) — D. Greenhill is male general
        if name == "D. Greenhill":
            desired = {
                "faction": "alliance",
                "sex": "male",
                "hair_color": None,
                "hair_style": None,
                "age_band": "50s",
            }

        pinned = name in PINNED
        assigned_key = None
        assigned_attrs = None
        match_score = 0.0
        reused = False

        if pinned:
            # Fixed assignment, no scoring
            assigned_key = PINNED[name]
            assigned_attrs = dict(face_pool[assigned_key])
            match_score = 99.0
            used_keys.add(assigned_key)
        else:
            # Score all candidates
            best_score = -1.0
            best_key = None
            second_best_score = -1.0
            second_best_key = None

            for key, face in face_pool.items():
                s, hard_fail = score_face(face, desired)
                if hard_fail:
                    continue
                if key in used_keys:
                    # Track as fallback for reuse
                    if s > second_best_score:
                        second_best_score = s
                        second_best_key = key
                    continue
                if s > best_score:
                    best_score = s
                    best_key = key

            if best_key is not None:
                assigned_key = best_key
                match_score = best_score
                used_keys.add(best_key)
            elif second_best_key is not None:
                # Reuse
                assigned_key = second_best_key
                match_score = second_best_score
                reused = True
            # else: no face at all (shouldn't happen with 289 faces for 97 chars)

            if assigned_key:
                assigned_attrs = dict(face_pool[assigned_key])

        result_map[idx] = {
            "index": idx,
            "character": name if name else f"(unnamed-{idx})",
            "faction": faction,
            "sex": desired.get("sex", "male"),
            "desired": {k: v for k, v in desired.items() if k not in ("faction", "sex")},
            "assigned_atlas_slot": assigned_key,
            "assigned_attrs": {
                k: assigned_attrs[k]
                for k in ("sex", "age_band", "hair_color", "hair_style",
                          "facial_hair", "expression", "vibe", "faction_guess")
            } if assigned_attrs else None,
            "match_score": round(match_score, 3),
            "pinned": pinned,
            "reused": reused,
            "face_number": None,
        }

    # Reassemble in original character index order
    assignments = [result_map[i] for i in range(len(characters))]

    # ---------------------------------------------------------------------------
    # Stats
    # ---------------------------------------------------------------------------
    n_chars    = len(assignments)
    n_assigned = sum(1 for a in assignments if a["assigned_atlas_slot"] is not None)
    n_pinned   = sum(1 for a in assignments if a["pinned"])
    n_reused   = sum(1 for a in assignments if a["reused"])
    n_unfilled = n_chars - n_assigned

    # Violation check: hard constraints
    violations = 0
    for a in assignments:
        if a["assigned_attrs"] is None:
            continue
        if a["assigned_attrs"]["sex"] != a["sex"]:
            violations += 1
            print(f"SEX VIOLATION: {a['character']}")
        aa_fg = a["assigned_attrs"]["faction_guess"]
        if aa_fg != "unknown" and aa_fg != a["faction"]:
            violations += 1
            print(f"FACTION VIOLATION: {a['character']} desired={a['faction']} got fg={aa_fg}")

    meta = {
        "n_characters": n_chars,
        "n_assigned": n_assigned,
        "n_pinned": n_pinned,
        "n_reused": n_reused,
        "n_unfilled": n_unfilled,
        "hard_constraint_violations": violations,
    }

    output = {
        "_meta": meta,
        "assignments": assignments,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Written: {OUT_PATH}")
    print(f"Characters: {n_chars}, Assigned: {n_assigned}, Pinned: {n_pinned}, "
          f"Reused: {n_reused}, Unfilled: {n_unfilled}, Violations: {violations}")

    # Spot-checks
    spot_names = [
        "Yang Wen-li", "Schonkopp",
        "Lohengramm", "Kircheis", "Bittenfeld",
    ]
    print("\nSpot-checks:")
    for a in assignments:
        if a["character"] in spot_names:
            attrs = a["assigned_attrs"] or {}
            print(f"  {a['character']:<20s} -> {a['assigned_atlas_slot']} "
                  f"hair={attrs.get('hair_color','?')} style={attrs.get('hair_style','?')} "
                  f"age={attrs.get('age_band','?')} pinned={a['pinned']}")


if __name__ == "__main__":
    main()
