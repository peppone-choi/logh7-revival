# LOGH VII (gin7) Character Roster — Extraction Feasibility

**Question:** 은하영웅전설 인물 추출도 가능한가? (Can the VII character roster — names, stats,
portraits, faction/rank — be extracted from available data?)

**Answer: YES (partial-by-source, but a complete playable roster is fully assemblable).**
A complete VII character roster is already built and integrated. It is *not* a single-source dump
— VII shipped as an online game, so the authoritative roster lived **server-side** and is **absent
from the client files**. The roster is instead **reconstructed** by combining three sources:
VII's own manual (duty-holders + ability schema), prior-game canon DBs (real names + cracked stats),
and the client's portrait pool (669 decodable faces). All sources are in hand and the merge is done.

Current built roster: **97 characters, 100% with the full 8 innate abilities, 100% with faction**,
in `content/roster/characters.json` and the content DB `characters` table.

---

## 1. Where the VII character data is (and is NOT)

### 1a. VII client files contain NO canon character names — confirmed
Searched the entire client string corpus (`content/logh7-content.db` → `client_strings`,
9,582 strings incl. `constmsg.dat` 3,199 + 16× `messages_*.dat` 594 each) for canon names in
Japanese: `ヤン`(Yang), `ミッターマイヤー`, `ロイエンタール`, `キルヒアイス`, `オーベルシュタイン`,
`ビッテンフェルト`, `ミューゼル` → **0 hits**. (`ライン` matched only `オフライン/オンライン`.)

**Conclusion:** the named-cast roster was an authoritative **server asset** (this is an online
game). It is irrecoverable from the client and does not need to be — the cast is the shared canon
LOGH cast, sourceable elsewhere. This matches the prior `logh7-portrait-pool` finding (the client's
faces are an *anonymous generation pool*, never name-tagged).

### 1b. What VII's own files DO give us
| VII client/manual source | yields | count |
|---|---|---|
| `gin7manual` (official 101p manual, archive.org) → `content/roster/manual-roster.json` | duty-holder posts with name + faction + rank + post | **75** (36 empire / 39 alliance) |
| manual ability scheme | the 8 innate abilities (統率/政治/運営/情報/指揮/機動/攻撃/防御) | 8 |
| manual rank ladder | military ranks | 20 |
| manual post definitions | org posts (capacity, min/max rank) | 121 |
| `Face/*.tcf` + `tcf.hed` | anonymous portrait pool (faces, NOT name-tagged) | **669** |
| `constmsg.dat` / `messages_*.dat` | UI/command strings (no character names) | 9,582 |

So VII's files give the **structural skeleton**: who holds which post, the ability axes, ranks,
and a face pool — but **no per-character stat values and no name↔face binding**.

---

## 2. Portraits — decode feasibility: SOLVED

**Format fully reverse-engineered and decoding works** (tool: `tools/logh7_tcf_decode.py`).

- 7 atlas files `Face/{gem,gef,gam,gaf,o,oam,oem}.tcf` (naming = `[rank g将/o士][faction e帝/a同][sex m/f]`).
- Magic `BA DA CA BE` + an SJIS dev joke comment (`…専用…見んな！`).
- Index file `tcf.hed`: **1,355 slots × 8 bytes** `[u32 offset][u32 size]` over a virtual
  concatenation of the 7 atlases (order gem+gef+gam+gaf+o+oam+oem). **669 slots non-empty** (the
  rest are holes; max populated index 1211).
- Each portrait region = **18B header + 256-color BGRA palette (1024B) + W×H 8-bit indices**,
  stored **bottom-up (vflip)**. Header: palette_count u16@0, width u16@0x0c, height u16@0x0e,
  bpp u16@0x10. Typical **64×80, region size 6162B** (536 of 669); the rest are larger variants
  (6082/6212/24698/43184…).
- **Verified live:** decoded index 209 and 206 to PNG — real 64×80 RGB officer portraits render
  correctly (e.g. `.omo/work/face-render/idx209.png` = a grey-haired officer).

**Caveat (important):** the global tcf index is a face id, but there is **no name↔face mapping**
in any VII data (the pool is anonymous; the gineiden.com `chara/NNN.jpg` numbering does **not**
align with tcf indices — disproven across both slot and dense interpretations). So portraits are
**100% extractable as images**, but each canon character's face must be **assigned by us**
(pick an atlas matching faction/sex, then an age/hair-appropriate slot) — the server is
authoritative for `face@0x4c` anyway (see `docs/logh7-character-record-wire.md`).

---

## 3. Cross-game canon: prior-game DBs supply names + real stats

The LOGH cast is shared across the series, so prior Korean ports at `E:\DGGL` fill the gap:

- `E:\DGGL\Games\G4EXWIN_Win_220604\db.mdb` (LOGH **IV EX** Korean): clean id→name table
  **인물 181 / 성계 58 / 행성 97** → extracted to content DB `ivex_roster` (181),
  `ivex_systems` (58), `ivex_planets` (97).
- **Stats are real, not invented:** IV EX 8-ability stats were cracked from user save-diffs
  (base 7586, stride 34) and live in `content/roster/ivex-stats.json` and DB `ivex_roster`
  (tochi/seiji/joho/kido/shiki + full 8). Sample (id, name_kr, faction, tochi, seiji, joho, kido, shiki):
  `(4, 안스바흐, empire, 58, 92, 89, 60, 63)`, `(7, 에렌베르크, empire, 50, 98, 92, 61, 32)`.
- A second mdb `E:\DGGL\Games\3KD2120g_Win\3kd2data.mdb` exists (different title) — not roster-relevant.

**Coverage:** of the 97 assembled VII characters, **45 carry real cracked IV-EX stats**
(`source = ivex-real` / `ivex`); the remaining **51** use manual-derived / canon-archetype stats
(rank+archetype tuned, faction/post correct). Name romaji/JA come from the canon cast (manual
duty-holders + IV EX name table).

---

## 4. The just-extracted texture patch — no character data

`.omo/work/logh7-patch/` (the 239 ship-texture + galaxy/grid `.mdx` extract) holds **ship and
map assets only**; it contributes nothing to the character roster. (Character faces are solely the
`Face/*.tcf` pool above.)

---

## 5. Result already integrated into the content pack

| artifact | content |
|---|---|
| `content/roster/characters.json` | **97** chars: name_ja, name_romaji, faction, rank_ja, kind, post_ja, source, full 8-ability `stats`. By faction: 45 empire / 52 alliance. By source: 51 manual, 38 ivex-real, 7 ivex, 1 canon. **100% have stats.** |
| `content/roster/manual-roster.json` | 75 VII duty-holders + abilities/ranks/classes/posts skeleton |
| `content/roster/ivex-stats.json` | real cracked LOGH IV-EX 8-ability stats |
| `content/roster/ivex-reference.json` | IV-EX name/faction reference |
| `content/logh7-content.db` | tables `characters`(97), `roster`(75), `ivex_roster`(181), `abilities`(8), `ranks`(20), `social_classes`(6), `posts`(121) |
| `tools/logh7_tcf_decode.py` | portrait decoder (669 faces → PNG) |

---

## 6. Recommended extraction pipeline (to a complete VII roster: names+stats+portraits+faction+rank)

```
[A] NAMES + POSTS + FACTION + RANK  (VII canon structure)
    gin7 manual (manual-roster.json) → 75 duty-holders (post, faction, rank)
        ⨉ canon cast (IV-EX db.mdb name table, 181) → fill principal cast beyond duty posts
    → identity layer

[B] STATS (8 innate abilities)
    IV-EX db.mdb + cracked save-diff stats (ivex-stats.json, 181 with real values)
        → match by canon name → inject real 8-ability stats   (45 matched today)
    unmatched → archetype+rank-tuned stats from manual ability scheme (51 today)
    → ability layer  (rank-INDEPENDENT, innate)

[C] PORTRAITS
    decode all 669 Face/*.tcf via logh7_tcf_decode.py → PNG library
        bucket by atlas code (faction e/a, sex m/f, rank g/o)
    → ASSIGN face index per character (faction/sex-correct atlas, age/hair-suitable slot)
        [no canonical name↔face binding exists — assignment is authoritative/ours]
    → portrait layer

[D] MERGE → content/roster/characters.json → content DB `characters`
    server emits each as the 0x0323 character-info record
    (docs/logh7-character-record-wire.md: power@8, name pascal-u16, face@0x4c,
     ability_8@0x50, rank@0x5b) — content pack already feeds this.

[E] (optional) widen coverage: lift more of the 181 IV-EX names with real stats into the
    VII roster (currently 97 used) to grow the playable cast toward the full canon set.
```

**Bottom line:** extraction is **YES**. Names/ranks/faction = VII manual (75) + IV-EX canon (181
available); stats = real cracked IV-EX values (45 injected, 181 available) + manual archetypes;
portraits = 669 decodable faces (assigned, since the pool is anonymous by design). A complete,
playable **97-character** roster with full stats is already assembled and integrated; it can be
widened toward the full ~181 canon cast using the same pipeline.
