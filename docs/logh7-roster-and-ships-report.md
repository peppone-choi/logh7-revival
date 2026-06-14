# LOGH VII Revival — Roster & Ships Coverage Report

**Generated:** 2026-06-13
**Scope:** Consolidation of the 4 parallel data lanes (ship stats, character roster,
character→portrait linking, web character research) into a single honest coverage report.

> **Project rule (verbatim):** *Never guess a number, a name, or a portrait identity.*
> Unknown ⇒ `null` + note. This report is deliberately blunt about what is **real evidence**
> vs **inherited/transformed** vs **still unknown**. No archetype-estimates are presented as facts.

---

## 0. Source files merged (all parse as valid JSON — verified)

| File | Shape | Records |
|---|---|---|
| `content/ship-stats.json` | dict | 63 ships |
| `content/ship-stats-raw.json` | dict | raw OCR fragments, 63 ships |
| `content/character-roster.json` | dict | 99 characters |
| `content/character-portraits.json` | dict | 5 portrait links + 12 face-number facts |
| `content/roster/web-character-research.json` | dict | 35 canonical character appearance records |

All five validated with `python -c "import json;json.load(open(p,encoding='utf-8'))"`.
All 5 portrait files referenced in `links[]` exist on disk (verified).

---

## 1. Ship coverage

**Total ship types: 63** (52 Empire, 11 Alliance).
Source: `content/manual/ship-units.json` (gin7 manual 艦艇ユニット OCR) → `tools/logh7_ship_stats.py`.
Wire target: `ResponseStaticInformationUnitShip 0x30b` (28004 B), field layout from static dump
`0x760984..0x760b2c`.

### Ship-class breakdown
| Class | Count |
|---|---|
| battleship | 8 |
| fast_battleship | 6 |
| cruiser | 10 |
| destroyer | 10 |
| carrier | 3 |
| torpedo_carrier | 3 |
| repair | 5 |
| transport | 5 |
| trooper | 5 |
| lander | 4 |
| civilian | 2 |
| strike_cruiser | 1 |
| corvette | 1 |

### Real-number vs inherited vs transformed
- **61 / 63 ships carry at least one REAL manual number** in `_raw` (confidence `med`/`high`):
  e.g. SS75 標準戦艦 → shield_guard 70, shield_capacity 20,000, beam_power 5/110 — all read
  directly from the gin7 manual OCR. These are kept verbatim under `_raw`, with per-field
  `confidence` and `note` (corrupt/absent fields are `value: null, confidence: "none"`).
- **40 / 63 ships are marked `_inherits_from`** — variant hulls whose pools are derived from a
  base hull plus a documented `_variant_modifier`, because the manual prints stats once for the
  base and only deltas for variants. This is an explicit, cited inheritance — not a guess.
- **The `pools` block is a documented TRANSFORM, not raw manual data.** Every transform is
  spelled out in `_derivation.transform`:
  - `maxArmor` = armor_front + armor_side + armor_back (sum of the 3 real 装甲 facings)
  - `maxZanki` = unit_count (ユニット数 / 残機 pool)
  - `maxShield` = shield_capacity (real シールド容量)
  - `beamPower` = max(beam_power, gun_power, missile_power) (ship's strongest real 破壊力)
  - `defense` = shield_guard (real 防護値)
- **2 ships have NO usable real number** (OCR corruption only) — pools fall back to inherited/
  class defaults; flagged in `_raw` with `confidence: "none"`. `0` ships have an all-null pools
  block (everything resolves to either a real number or a documented inheritance).

**Honest ship caveat:** the *pools* are server-tuning derived from real manual stats via the
transform above. The manual numbers themselves are real; the pool mapping is an engineering
decision, clearly labelled, and reversible to `_raw`. Some OCR fields remain corrupt (装甲 on
several Empire hulls) and are honestly `null`.

---

## 2. Character coverage

**Total roster: 99 named characters.** Builder: `tools/build_character_roster.py`.
Sources (all cited per record in `source[]`):
- `content/roster/characters.json` — 97 chars with real 8-ability stats
- `content/roster/official-roster.json` — 12 gineiden.com official samples (face_index, bio, romaji)
- `content/roster/face-name-map.json` — 12 name↔face_number facts
- `content/roster/manual-roster.json` — gin7 manual duty cards (post/rank/unit)
- `content/roster/community-roster.json` — KR CBT memoir-attested names

### Stats
- **97 / 99 characters have the real 8-ability stat block** (`tochi`統率, `seiji`政治, `unei`運用,
  `joho`情報, `shiki`指揮, `kido`機動, `kogeki`攻撃, `bogyo`防御), `stats_known: true`.
- **2 / 99 have NO stats** (`stats_known: false`, all values `null` + note) — these are names
  attested only by duty card / memoir with no stat source:
  - **ネグロポンティ (Negroponti)**
  - **ブラウンシュヴァイク (Braunschweig)**

### Portrait linkage
Two independent kinds of evidence exist, and they are kept separate on purpose:

**(a) Actual portrait-FILE links (a name pinned to a decoded PNG): 5 links, 5 distinct roster chars.**

| Character | Roster id | Portrait file | Confidence | Anchor |
|---|---|---|---|---|
| Yang Wen-li | `yang-wen-li` | `canon-portraits/oam/0274.png` | **high** | official 206.jpg pixel-anchor NCC=0.92 |
| Walter von Schenkopp | `schonkopp` | `canon-portraits/oam/0230.png` | **high** | official 085.jpg pixel-anchor |
| Siegfried Kircheis | `kircheis` | `canon-portraits/oem/0026.png` | medium | unique red hair + atlas faction agree |
| Reinhard von Lohengramm | `von-musel` * | `canon-portraits/oem/0112.png` | medium | unique blond + atlas faction agree |
| Alexandre Bucock | `bucock` | `canon-portraits/oam/0283.png` | low | non-unique look (recorded for honesty) |

> \* **Mapping caveat:** Reinhard appears in our roster only under his pre-ennoblement name
> **ミューゼル / von Musel** (`von-musel`). The portrait link names him "Reinhard von Lohengramm".
> Same canonical person, two name forms — flagged here so the count is not silently inflated.

**Confident portrait identities = 4** (2 high pixel-anchored + 2 medium canon-unique). 1 low recorded.

**(b) Official name↔face_number facts (12).** These tie a confirmed name to a global `Face/*.tcf`
index (the value at `0x0323` record `@0xf4`), but for **10 of 12 the official portrait JPG did NOT
survive Wayback**, so the art slot cannot be located. Only **face#206 (Yang)** and **face#85
(Schenkopp)** have locatable art — and those are exactly the 2 high-confidence file links above.

The 12 face_number facts: Reinhard 209, Mittermeyer 195, Kessler 69, Friedrich IV 270, Ofresser 41,
Remscheid 286, Yang 206, Caselnes 48, Schenkopp 85, Trunicht 125, Negroponti 268, Rebello 285.
**12 / 99 roster characters carry a `face_number`**; 11 of those 12 map cleanly to a roster id
(Reinhard 209 ties to the `von-musel` look-slot but is a name-only tie, no surviving art).

### EXACT unresolved list (with reason)

| Bucket | Count | Reason |
|---|---|---|
| Roster chars with **no stats** | 2 (Negroponti, Braunschweig) | name attested by duty card / memoir only; no stat source exists |
| Roster chars with **no face_number and no portrait** | ~85 | manual duty-holders; no source maps them to any face slot (`face-name-map.json._names_without_face_number`) |
| Official face_numbers with **confirmed name but lost art** | 10 | their official JPG was never captured by Wayback (302 redirect stubs); slot unlocatable |
| Decoded atlas portraits with **no name** | ~285 (oam 181 + oem 187 + o 78, minus identified) | no labelled VII source exists; the game roster was server-side and is lost; client ships an unlabelled face pool |
| VI-labelled prior-game portraits (112) | not transferable | VI→VII pixel matching is **top-1 wrong on both ground-truth anchors** (disproven); cannot be used for VII identity |

---

## 3. What is still GUESSED vs REAL EVIDENCE (blunt section)

**REAL evidence (cited, kept verbatim):**
- All 8-ability stats for 97 characters — from `characters.json` (gin7 manual roster).
- All ship `_raw` manual numbers for 61/63 ships — from the gin7 manual OCR, per-field confidence.
- 2 portrait identities (Yang, Schenkopp) — **pixel-anchored** to a surviving official JPG. Hard fact.
- 12 name↔face_number facts — from the official gineiden.com character page (Wayback-dated).
- Character appearance (hair/eye/role) for 35 canonical figures — `web-character-research.json`,
  each value cited to ja.wikipedia / gineipaedia / animecharactersdatabase URL; unstated ⇒ `null`+note.

**NOT pixel-proven, but evidence-anchored (medium/low, labelled as such — NOT presented as fact):**
- Kircheis & Reinhard portrait slots — matched by a *unique canonical feature* (red / blond hair)
  visible in the atlas slot + atlas faction agreement. Plausible, **not** pixel-confirmed. Medium.
- Bucock slot — non-unique look; recorded `low` purely for honesty, weak.

**STILL GUESSED / UNKNOWN — explicitly NOT filled in (honest nulls):**
- The identity of **~285 decoded atlas portraits** — no labelled VII source exists. `null`.
- The portrait/face slot for **~85 roster duty-holders** — no mapping source. `null`.
- The art slot for **10 confirmed face_numbers** — official JPGs lost to archiving. `null`.
- Stats for **Negroponti and Braunschweig** — no source. `null`.
- A handful of **corrupt 装甲 OCR fields** on Empire hulls — `confidence: "none"`, `value: null`.

**Nothing in these files invents a number, name, or portrait identity.** Where the project could
not source a value, it is `null` with a note — per the absolute rule.

### Why the portrait gap is structural (root cause)
The VII character roster lived **server-side** (the now-dead Netmarble/gineiden servers). The
surviving client ships only an **unlabelled face pool** (`Face/*.tcf`), keyed by faction/gender/rank
atlases — there is no name→face table in the client. Only 2 official portraits survived public
archiving (Wayback CDX returns 200 for exactly `085.jpg` and `206.jpg`). The Korean Netmarble pages
were 302 redirect stubs and were never captured. So **2 portrait identities are the hard ceiling**
recoverable from official sources; everything beyond is inference or honest null.

---

## 4. Next steps to close the gaps

1. **Recover more official portraits** — deeper Wayback/Archive-It and CDX sweeps for
   `gineiden.com/picture/chara/*` and Netmarble KR mirrors; any new surviving JPG is a new
   *pixel-anchorable* identity (highest-value lead, each one is a hard fact).
2. **Prior-game labelled screens** — the `idkit/vi-labeled/_labels.json` (112) and IV/V/VI
   `db.mdb` give clean name↔portrait pairs. VI→VII *pixel* transfer is disproven, but VI labels
   can still **constrain by faction/rank/branch** (narrow the candidate pool per atlas slot)
   without claiming identity.
3. **Recover the two missing stat sources** — re-OCR / re-source Negroponti & Braunschweig from
   the gin7 manual duty cards or prior-game db; fill stats only if a real source is found.
4. **Repair corrupt 装甲 OCR** — re-OCR the Empire-hull armor facings from a cleaner manual scan
   to replace `confidence: "none"` armor fields with real numbers.
5. **Server-roster archaeology** — if any server-side roster dump (save files, packet captures
   with `0x0323` records carrying real `face_number`s) can be recovered, it would directly bridge
   name→face_number→atlas slot for the ~285 unnamed portraits. This is the only path to mass
   resolution and remains the biggest open item.

---

## Appendix — key file paths
- `E:\logh7-revival\content\ship-stats.json` (+ `ship-stats-raw.json`)
- `E:\logh7-revival\content\character-roster.json`
- `E:\logh7-revival\content\character-portraits.json`
- `E:\logh7-revival\content\roster\web-character-research.json`
- Portrait PNGs: `E:\logh7-revival\content\roster\canon-portraits\{oam,oem}\*.png`
- Builders: `tools/logh7_ship_stats.py`, `tools/build_character_roster.py`,
  `tools/logh7_build_character_portraits.py`
