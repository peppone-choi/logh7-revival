# LOGH canon character research — LANE D (web/anime/prior-game appearance evidence)

Date: 2026-06-13. Purpose: (1) establish the CANONICAL named-character set for 銀河英雄伝説
(Empire / Free Planets Alliance / Phezzan / Earth Cult) to find gaps in our 97-char VII roster, and
(2) capture appearance facts for the MAJOR characters as portrait-matching identity evidence.

**No-guessing rule honoured:** every appearance value below is cited to a fetched source URL. Where a
source does not state hair/eye colour, the value is recorded as `null` (note: "NOT stated"). Companion
data file: `content/roster/web-character-research.json` (35 records, machine-readable).

## Sources (reliability notes)

| Source | Use | Reliability |
|---|---|---|
| Gineipaedia (`gineipaedia.com`) | Canon hard facts: rank, birth/death, nickname, flagship, role | High for facts; sparse on hair/eye colour prose |
| Anime Characters Database (`animecharactersdatabase.com`, source id=100167) | Structured hair-colour / eye-colour fields for the 21 main characters | High, but colours are the **1988 OVA render palette** (stylised — see caveat) |
| ja.Wikipedia 登場人物 / ・その他 | Canonical roster + third-power (Phezzan / Earth Cult) figures and roles | High for the canonical list |
| WebSearch snippets (TV Tropes / fandom, cited inline) | Role / epithet confirmation | Medium |

**ACDB colour caveat:** ACDB indexes the OVA's stylised cel palette, not "natural" colour. Examples that
matter for portrait matching: Yang Wen-li's near-black hair is indexed **"Blue"**; Julian's light ash-brown
is **"Gray"**; Annerose's eyes are **"Red"**. Treat ACDB colours as *the colour a VII portrait would be
drawn in*, which is exactly what we want for matching VII's anime-style portraits.

Blocked for WebFetch (403/404, could not extract prose): `manga.fandom.com`, `legendofthegalacticheroes.fandom.com`,
`en.namu.wiki`, `tvtropes.org`, `allthetropes.org`. ACDB + Gineipaedia + ja.Wikipedia carried the load.

## Roster cross-check (our 97 vs canon)

Our `content/roster/characters.json` is a **VII in-game duty roster**: fleet commanders, patrol-squadron
(巡察隊) commanders, and cabinet officials — 45 Empire + 52 Alliance. The Empire/Alliance **admiral**
coverage is essentially complete. All gaps are **civilians / non-officer principals / third-power figures**,
which a military duty list would never contain.

### Majors PRESENT in our roster
Reinhard (ローエングラム / ミューゼル both present), Kircheis, Mittermeyer, Reuenthal, Oberstein, Bittenfeld,
Fahrenheit, Mecklinger, Kessler, Müller, Wahlen, Lutz, Lennenkampf, Steinmetz, Kempf (ケンプ),
Eisenach (アイゼナッハ), Merkatz; Yang, Attenborough, Bucock, Caselnes (キャゼルヌ), Schönkopf, Poplan,
Murai, Patrichev (パトリチェフ), Fork (フォーク), Fischer (フィッシャー), Blumhart (ブルームハルト),
Chung (チュン), Konev (コーネフ), D. Greenhill (フェザーン父), Greenhill; Trünicht (politician).

### Majors MISSING from our roster (and why)
| Character | Faction | Why absent |
|---|---|---|
| **Wittenfeld** | — | **Not a separate person.** "Wittenfeld" in the brief = **Bittenfeld** (ビッテンフェルト), two romanizations of the one admiral. Bittenfeld **is** present. No gap. |
| Julian Mintz (ユリアン) | Alliance | Yang's ward/aide — non-admiral; civilians/aides not in the duty roster |
| Frederica Greenhill (フレデリカ) | Alliance | Yang's aide/wife — only her father D. Greenhill is in the roster |
| Hildegard von Mariendorf (ヒルダ) | Empire | Reinhard's civilian advisor → Empress |
| Annerose von Grünewald (アンネローゼ) | Empire | Reinhard's sister — civilian |
| Rubinsky (ルビンスキー) | Phezzan | No Phezzan civilians in the roster at all |
| Boltik / Kesselrink / Dominique | Phezzan | Phezzan civilians |
| de Villiers / Grand Bishop / Degsby | Earth Cult | No Earth-Cult figures in the roster |

**Conclusion:** the roster has no *military* gaps. If we want full canon coverage for character-creation /
NPC purposes we must add ~11 civilian / third-power principals (listed in the JSON, `MISSING` flag).

## Appearance evidence for portrait matching (majors)

Strongest single identity markers are **bolded** — these are the cheap, decisive discriminators when
matching a VII portrait.

### Empire
- **Reinhard von Lohengramm** — hair **blonde, wavy, to-ears**; eyes **blue**; handsome youth (d. age 25). [ACDB 17075; Gineipaedia]
- **Kircheis** — hair **red, to-ears**; eyes **blue**; tall. The red hair is decisive. [ACDB 17076; Gineipaedia]
- **Mittermeyer** — hair **blonde** with "hair intakes"; eyes **blue**. [ACDB 17078; Gineipaedia]
- **Reuenthal** — hair **black**; **HETEROCHROMIA: left eye blue, right eye brown** ("Bewitching Eyes"). The single most decisive marker in the cast. [ACDB 17073; Gineipaedia]
- **Oberstein** — hair brown w/ streak; **ARTIFICIAL prosthetic eyes** (pale/clear blue in OVA). Artificial eyes = marker. [ACDB 17074; Gineipaedia]
- Bittenfeld — fiery/aggressive ("Schwarz Lanzenreiter"); OVA orange-red ponytail **widely depicted but NOT in a fetched citable field → null**. [Gineipaedia]
- Mecklinger — "the Artist Admiral" (painter/pianist); colours not stated → null. [Gineipaedia]
- Müller — "Iron Wall"; colours not stated → null. [Gineipaedia]
- Eisenach — "the Silent Admiral" (commands by gesture); colours not stated → null (behavioural marker). [Gineipaedia]
- Kessler (capital MP/defense), Wahlen (loses an arm), Lutz, Lennenkampf, Steinmetz, Kempf, Fahrenheit — roles cited; **hair/eye colour NOT stated → null**. [Gineipaedia per-character]
- **Merkatz** — veteran, **elderly** ("only elderly commander in the fleet battle"), KIA aged 63; colours → null. [Gineipaedia]
- **Hildegard / "Hilda"** — hair **blonde, short**; eyes **blue**; male-style aide uniform. *(roster gap)* [ACDB 17069]
- **Annerose** — hair **blonde, wavy, long**; eyes **red** (OVA); resembles Reinhard. *(roster gap)* [ACDB 17066]

### Alliance
- **Yang Wen-li** — hair **black (ACDB "Blue"), messy**; eyes **black**; **black beret + rumpled uniform**. [ACDB 17079; Gineipaedia]
- **Julian Mintz** — hair light ash-brown (ACDB **"Gray"**) w/ cheek curls; eyes **black**; beret; teen. *(roster gap)* [ACDB 17070]
- **Frederica Greenhill** — hair **brown**; eyes **brown**; **glasses**. *(roster gap)* [ACDB 17068]
- **Schönkopf** — hair **brown w/ sideburns**; eyes **brown**; Rosen Ritter commander. [ACDB 17077; Gineipaedia]
- **Attenborough** — hair grey; eyes black; **freckles + beret**. Freckles = marker. [ACDB 17067]
- **Caselnes (キャゼルヌ)** — hair **brown**; eyes **blue**; logistics officer. [ACDB 17065]
- **Poplan** — hair **orange**; eyes **green**; pilot scarf + beret. Orange hair = marker. [ACDB 17072]
- **Bucock** — **elderly** veteran (CinC, d. age 74); colours → null (white-haired in OVA, unverified-field). [Gineipaedia]

### Phezzan / Earth Cult (all roster gaps)
- **Rubinsky** — "Black Fox of Fezzan", 5th Landesherr; canonically **bald** (OVA, unverified-field) → appearance null. [Gineipaedia]
- Boltik, Kesselrink (Rubinsky's secret son), Dominique (mistress) — Phezzan; appearance → null. [ja.WP ・その他]
- de Villiers (Archbishop, chief plotter), Grand Bishop, Degsby — Earth Cult; appearance → null. [ja.WP ・その他]

## Recommended next step
Use the **decisive markers** (Reuenthal heterochromia, Kircheis red hair, Poplan orange hair, Oberstein
artificial eyes, Annerose red eyes/golden hair, Attenborough freckles, Frederica glasses, Yang beret) as a
first-pass discriminator against `content/roster/idkit/vi-labeled/_labels.json` (112 VI labelled portraits)
and the AI portrait-attribute classifications — colour-match before name-match. The ~11 missing civilians
should be appended to the roster only if VII actually needs civilian/third-power NPCs.
