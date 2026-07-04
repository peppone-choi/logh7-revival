# LOGH VII — Community / Fan Roster Sweep (Korean Netmarble + Japanese Bothtec)

Exhaustive web sweep for **any pre-made character list / roster** of 銀河英雄伝説VII online
(JP Bothtec **gin7** package + KR Netmarble service **은하영웅전설 Online**, codename `spacewar`,
2004–2005). Mission: find a fan-compiled roster (names JA/KR/romaji, ideally with faction / stats /
**face-number** = `chara/NNN` = `Face/<NNN>.tga`) that goes beyond the official 12 (gineiden.com) +
~75 manual duty-holders we already have.

**Date:** 2026-06-12 · **Companion data:** `content/roster/community-roster.json`,
`content/roster/face-name-map.json` (12 official pairs).

---

## TL;DR — honest verdict

- **No usable fan/community character roster exists anywhere on the public web — Korean or Japanese.**
  Every Korean community (나무위키 / thewiki / 위키백과 / ruliweb / dcinside / inven / 네이버 / gamemeca /
  ohmynews) and every Japanese source (Wikipedia / pixiv百科 / fandom / atwiki probes / hatena blogs /
  4gamer / 電撃 / impress) returns **only** anime/novel rosters or *other* LOGH games — **never** the
  gin7-online `chara/NNN` numbering, and never a fuller VII-online cast list.
- **0 new name ↔ face-number pairs** beyond the official 12. **0 new character names** beyond the
  official 12 + manual 75. The 2005 rights-dispute shutdown (Bothtec × Lightstaff) scrubbed VII-online
  fan documentation; it was a ~3-day, 999-tester KR CBT and a 1-year JP service, then erased.
- **What the sweep DID recover (genuinely useful, non-roster):**
  1. **Korean-localized duty/post (직무) hierarchy** — the full Empire + Alliance post tree, transcribed
     from a 2022 ruliweb CBT-tester memoir's screenshots. This is the **authoritative Korean translation
     of the 121 manual `postDefinitions`** → directly reusable for the cp949 `String.txt` localization
     layer. (Captured in `community-roster.json → korean_duty_post_localization`.)
  2. **CBT character-model confirmation**: KR players first create an *original* officer (explicitly
     likened to **삼국지 신무장** / Romance of Three Kingdoms custom officer), then **unlock canon
     characters with merit points**. Independently corroborates our `face = portrait-POOL index` model
     (memory `logh7-portrait-pool`) — name↔face was never a fixed canon mapping in this game.
  3. One canon name attested in KR-CBT context: **폰 브라운슈바이크 / ブラウンシュヴァイク** (Duke von
     Braunschweig) — already a known LOGH character, **no face number**, not added to the face map.

**Bottom line:** the holy-grail (a fuller name↔face roster) **does not exist publicly**. The official
12 (gineiden.com `st_char.html`) remains the ceiling for name↔NNN; the only way to extend it is *inside
the client data* (on-disc name/portrait table), not the web.

---

## Sources searched — Korean (priority)

| Source | Query / URL | Result |
|---|---|---|
| 나무위키 은하영웅전설 7 | `namu.wiki/w/은하영웅전설 7` (WebFetch) | Game facts only. **One** canon name in passing context; **no roster, no face data, no community-list link.** |
| 나무위키 은하영웅전설/게임 | `namu.wiki/.../게임` | JP CBT dates (1/23–31, 2/27–3/5, 4/9–12), KR CBT 2004-05-28→06-07 "곧 묻혔다"; **no preserved client, no roster.** |
| thewiki.kr 은하영웅전설/게임 | `thewiki.kr/w/은하영웅전설/게임` | **403** to WebFetch; search snippet = same shutdown/feature facts, no roster. |
| 위키백과 은하영웅전설 등장인물 목록 | `ko.wikipedia.org/...등장인물_목록` | Novel/anime cast only — not the VII-online roster, no face numbers. |
| **ruliweb 2022 CBT memoir** (author "Sieg Choys") | `bbs.ruliweb.com/community/board/300781/read/58901153` (WebFetch) | **Best KR source.** Gameplay memoir. Confirms create-original→unlock-canon model; names Duke **von Braunschweig**; embeds **4 screenshots = the KR 직무 hierarchy + fleet panel** (now transcribed). **No client files, no name↔face roster.** |
| ruliweb memoir screenshots | `i2/i3.ruliweb.com/img/22/10/05/183a443f*…183a4440*.jpg` | Downloaded + pixel-inspected: **3 are the Korean POST/duty tree (both factions)**, 1 is the fleet-composition UI (small face thumbs, no names). Transcribed to `community-roster.json`. |
| gamemeca DB / preview | `gamemeca.com` g0001192 / gid=120882 | 2000-concurrent MMOSLG, 8 params, "특정 조건 만족 시 원작 캐릭터로 플레이". **No roster.** |
| ohmynews 2004 launch article | `star.ohmynews.com/...A0000188848` (WebFetch) | Names only ヤン / ラインハルト as examples; role-based hierarchy described; **no creation faces, no roster.** |
| dcinside 고전게임 갤 / inven / 네이버 카페 | WebSearch ×4 (캐릭터 목록 / 후기 / 인물도감 / 신무장) | Surfaced only 나무위키/위키백과/gamemeca — **zero fan roster, zero CBT character compendium.** |

## Sources searched — Japanese

| Source | Query / URL | Result |
|---|---|---|
| atwiki gin7 probes | Wayback CDX `gin7.atwiki.jp`, `ginei7/gin7online/gineiden7/gineiden.atwiki.jp` | **All empty** — no gin7 atwiki ever existed/archived. |
| JP free-host fansites | Wayback CDX `*.geocities.co.jp/jp`, `*.fc2.com`, `*.hp.infoseek.co.jp` (`*gin7*`) | Wildcard host search returns only robots.txt — **no gin7 fan page indexable this way.** No surviving gin7 fansite found. |
| gineiden.com (re-confirm) | Wayback CDX `gineiden.com` domain, `picture/chara` filter | **Only 2 portraits ever archived** (`085.jpg`, `206.jpg`) + `st/chara1.gif` decoration — exactly matches prior `logh7-face-name-recovery.md`. No fuller roster page. |
| ginei.jp "ON THE WEB" 登場人物 | `ginei.jp/character.php` (WebFetch) | Mojibake; appears to be a **separate/later** LOGH portal, not the gin7-online chara/NNN numbering. No face numbers. |
| hatena 2005 player blog | `unfreeman.hatenablog.com/entry/20050417/...` (WebFetch) | Period player lamenting the shutdown — **no characters, no roster, no fansite links** (only a 4gamer link). |
| 4gamer / 電撃 / impress / srad | shutdown coverage (`G001079`, dengeki, game.watch, srad) | All shutdown/rights-dispute news; **no roster, no face data.** |
| pixiv百科 / fandom / Wikipedia (ゲーム) | WebSearch ×5 (キャラ一覧 / 顔 / ジェネレート / 597 / 提督名鑑) | Anime/novel + *other* games (ノイサガ, 戦いの輪舞曲, DNT) only — **never** gin7-online chara/NNN. |
| 2ch/5ch まとめ | WebSearch (`gin7 2ch まとめ`, `銀英伝VII オンライン キャラ`) | **No surviving thread archive with a roster** surfaced. |

## archive.org item search

- `(gineiden OR gin7 OR "galactic heroes") AND (roster OR character OR chara)` → unrelated items only.
- `spacewar netmarble` / `은하영웅전설 온라인 client` → **no roster item** (consistent with the
  `logh7-korean-client-hunt.md` second-hunt finding; only `logh-7` = the JP single-player CD exists).

---

## Why nothing turned up (structural reason)

The face *number* (`chara/NNN` == `Face/<NNN>.tga` == `0x0323` byte @0xf4) is an artifact of **this
game's own asset numbering**, published by **only one party (BOTHTEC, on gineiden.com)** — and only as
a 12-character curated sample («このページではその一部を紹介します»). No fan, wiki, or the KR operator
ever republished that numbering. The KR character system was **player-generated originals → point-
unlocked canon**, so there was never a fixed public "name = face N" table to compile in the first place.
Combined with the 2005 rights-dispute scrub of a tiny CBT/short-lived service, the universe of
recoverable name↔NNN is hard-capped at the official 12. Community sources can add *names* and
*localization*, never *face numbers*.

---

## Tally

| Asset | Before sweep | After sweep | Delta |
|---|---:|---:|---:|
| name ↔ **face-number** pairs | 12 (official) | 12 | **+0** |
| VII canon **names** (no face) | ~75 (manual) + 12 | same (von Braunschweig already in canon) | **+0 net** |
| **Korean post (직무) localization** | 0 | **121 posts, both factions** | **+121** (NEW) |
| KR fleet/role structure | reversed from binary | independently confirmed | corroboration |

**Usable fuller roster found?** **No.** A name↔face roster beyond the 12 does **not** exist on the
public web (Korean or Japanese). The sweep's real yield is the **Korean duty-post localization** +
**model confirmation**, not new character identities.

---

## Files

- `content/roster/community-roster.json` — sweep output: attested canon name, CBT model confirmation,
  **Korean 직무 post hierarchy** (Empire+Alliance), fleet structure.
- `docs/logh7-community-roster-sweep.md` — this log.
- `.omo/work/logh7-community-roster/ruliweb/183a443f*…183a4440*.jpg` — the 4 transcribed CBT screenshots.

## Best single source

**ruliweb 2022 CBT memoir** (`bbs.ruliweb.com/community/board/300781/read/58901153`, author "Sieg
Choys") — the only first-hand KR source with usable artifacts (the 직무 hierarchy screenshots + the
create-original→unlock-canon confirmation). It is **not** a character roster, but it is the richest
community trace of the actual game that survives. For new *names* with *face numbers*, the only
remaining path is the **on-disc client name/portrait table** (per `logh7-face-name-recovery.md`), not
the web.
