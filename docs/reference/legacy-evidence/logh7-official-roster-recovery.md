# LOGH VII Official Roster Recovery — gineiden.com (Wayback)

Recovery of the authoritative 銀河英雄伝説VII (Ginga Eiyuu Densetsu VII / gin7) character
data from the **official developer site `gineiden.com`** (publisher BOTHTEC), preserved in
the Internet Archive Wayback Machine. This replaces trust in the previously synthesized
roster (`content/roster/characters.json`, 97 entries built from LOGH IV EX + the manual,
**not** VII's own data) for the subset the developer themselves published.

Date: 2026-06-12. Deliverable: `content/roster/official-roster.json` (12 characters).

---

## TL;DR

- **12 real VII characters recovered** straight from the developer's in-game reference page
  `st_char.html`, each with its **real face index** = `picture/chara/NNN.jpg` = the global
  `Face/*.tcf` pool index. This fixes our previously arbitrary face assignment for these 12.
- **Real numeric stats: NOT found.** `st_char.html` carries canon **prose bios + in-game
  post**, no ability numbers. Stats still need another source (client RE / IV-EX diff).
- **Korean (Netmarble) roster: NOT recoverable.** Every `story/character*.asp` snapshot is a
  302 redirect stub; Wayback never captured the real bodies. Only 3 screenshot GIFs survive.
- **Only 2 of the 12 portraits were ever archived** by Wayback (085 Schenkopp, 206 Yang);
  the other 10 `chara/NNN.jpg` were never crawled (CDX confirms). Both real JPEGs downloaded.
- `st_char.html` itself says it shows only **part** of the roster
  (「このページではその一部を紹介します」), so 12 is the developer's curated sample, not the full cast.

---

## Method & every Wayback URL used

Tooling: Wayback **CDX API** (`curl`) for enumeration; raw `id_` snapshots fetched with
`curl -L` and decoded from **Shift_JIS** (gineiden.com) / **EUC-KR** (Netmarble) via Python.
WebFetch is blocked for web.archive.org in this environment; all fetches were curl.

### Primary source — the character page (HIT)

- CDX: `http://web.archive.org/cdx/search/cdx?url=gineiden.com/st_char.html&output=json`
  → **exactly one** capture: `20040115095030` (200, 5,791 B).
- Page fetched + decoded:
  `http://web.archive.org/web/20040115095030id_/http://www.gineiden.com/st_char.html`
- Parsed structure: per-character block = `<img src="picture/chara/NNN.jpg">` +
  yellow `<strong>NAME</strong>` + prose bio + `ゲームでの役職「POST」` + post description.
  Faction split by the section banners `chara/teikoku.gif` (帝国/Empire) and
  `chara/doumei.gif` (同盟/Alliance).

### Portrait directory enumeration (mostly MISS)

- CDX: `…url=gineiden.com/picture/chara*` and `…url=www.gineiden.com/picture/chara*`
  → **only 2 archived**: `085.jpg` (20050407195502) and `206.jpg` (20041016162511).
- The 12 indices *referenced* by st_char are: 041, 048, 069, 085, 125, 195, 206, 209, 268,
  270, 285, 286. Attempts to pull the other 10 from Wayback return the IA 404 HTML page
  (magic `3c2144` = `<!D`octype, ~145 KB), i.e. **never captured**. Honest result: 10 missing.
- Downloaded + verified (FFD8FF…FFD9):
  - `085.jpg` 4,033 B — シェーンコップ (Schenkopp) —
    `…/web/20050407195502id_/http://www.gineiden.com/picture/chara/085.jpg`
  - `206.jpg` 4,279 B — ヤン (Yang) —
    `…/web/20040115095030id_/http://www.gineiden.com/picture/chara/206.jpg`
  Saved to `.omo/work/logh7-official-portraits/`.

### Other gineiden.com reference pages checked (NOT character lists)

- `st_index.html` (20040114092216) — landing page only; links to st_char, no roster.
- `st_pj.html` (planets), `st_job.html` (jobs/posts), `st_command.html`, `st_ship.html`,
  `st_cmake.html` (char-creation), `reference.html`, `ref_pj.html` — design catalogs, **no
  per-character roster** beyond st_char. (st_pj/st_job exact-ts pulls returned IA 404 stubs;
  st_char remains the sole character page.)

### Korean Netmarble microsite (DEAD END — honest)

- CDX: `…url=netmarble.net/cp_site/spacewar*` → found `story/character.asp` (25 snapshots),
  `story/character_freedom.asp` (6), `story/game_en.asp`, `story/game_freedom.asp`.
  **Every single snapshot is HTTP 302** (redirect stub, ~540 B, identical digest
  `STZMHV6B3H6C6PFWGI7WOZOLOGYVUKZM`). Following the redirect yields the Wayback
  "page not archived" shell — the real ASP body was never stored.
- CDN CDX `…url=cimg.netmarble.com/web/4G/CP_site/spacewar*` → only **3 screenshot GIFs**
  (`story/big/cap1_0{1,2,3}.gif`); no character portraits, no roster art.
- Conclusion: **no Korean character names/stats are recoverable.** `name_kr` left `null`.

---

## Recovered roster (12) — name ↔ face ↔ post

face = `picture/chara/NNN.jpg` = global `Face/*.tcf` index. P = portrait archived in Wayback.

| face | name_ja | romaji | faction | in-game post (役職) | P |
|---:|---|---|---|---|:-:|
| 209 | ラインハルト | Reinhard von Lohengramm | empire | 帝国軍最高司令官 (Imperial Supreme Commander) | – |
| 195 | ミッターマイヤー | Wolfgang Mittermeyer | empire | 宇宙艦隊司令長官 (Fleet Admiral / CinC Space Fleet) | – |
| 069 | ケスラー | Ulrich Kesler | empire | 憲兵総監 (Provost Marshal General) | – |
| 270 | フリードリヒIV世 | Friedrich IV | empire | 皇帝 (Kaiser) | – |
| 041 | オフレッサー | Ofresser | empire | 装甲擲弾兵総監 (Armored Grenadier C-in-C) | – |
| 286 | レムシャイト | Remscheid | empire | フェザーン駐在高等弁務官 (High Commissioner, Phezzan) | – |
| 206 | ヤン | Yang Wen-li | alliance | 艦隊司令官 (Fleet Commander) | ✔ |
| 048 | キャゼルヌ | Alex Caselnes | alliance | 宇宙艦隊参謀 (Space Fleet Staff Officer) | – |
| 085 | シェーンコップ | Walter von Schenkopp | alliance | 要塞守備隊指揮官 (Fortress Garrison Commander) | ✔ |
| 125 | トリューニヒト | Job Trunicht | alliance | 最高評議会 議長 (High Council Chairman) | – |
| 268 | ネグロポンティ | Negroponti | alliance | 最高評議会 国防委員長 (Defense Committee Chair) | – |
| 285 | レベロ | Joan Rebello | alliance | 最高評議会 財政委員長 (Finance Committee Chair) | – |

Full bios + post descriptions are preserved verbatim (Japanese) in
`content/roster/official-roster.json` (`bio_ja`, `post_desc_ja`).

---

## Cross-check vs synthesized roster (`characters.json`, 97 entries)

Match types (in `official-roster.json` → `match_type` / `synthesized_match`):

- **9 exact** name matches: ミッターマイヤー, ケスラー, オフレッサー, レムシャイト, ヤン,
  キャゼルヌ, シェーンコップ, トリューニヒト, レベロ.
- **2 name-variant** matches:
  - ラインハルト (official given-name UI label) = synthesized **ローエングラム** (his earned
    house name; synthesized also lists his birth name ミューゼル as a separate entry).
  - フリードリヒIV世 (ASCII `IV`) = synthesized **フリードリヒⅣ世** (full-width Roman `Ⅳ`).
- **1 genuinely new**: **ネグロポンティ** (Negroponti) — absent from the synthesized 97.

### What is now AUTHORITATIVE vs still-missing

- **Now authoritative (developer-sourced):** the **name → face-index** mapping for all 12,
  plus each one's **in-game post** and canon bio. These face numbers are real (cross-checked
  against the known anchors Reinhard=209, Yang=206, Schenkopp=85, Mittermeyer=195) and should
  **override** our arbitrary face assignment for these characters, and add ネグロポンティ (face
  268) to the cast.
- **Still synthesized / not yet authoritative:**
  - **Numeric stats** for all 12 — st_char has prose only. Our existing stats remain
    IV-EX/manual-derived guesses; a real-stat source (client RE, IV-EX save diff) is still
    required.
  - **Face indices for the other 85 synthesized characters** — st_char only covers 12.
  - **Korean localization** (`name_kr`) — Netmarble pages unrecoverable.
- **Honest gaps:** 10 of 12 portraits are not in Wayback (only 085, 206 survive); the full VII
  roster (beyond this 12-character developer sample) is not published anywhere archived.

---

## Files

- `content/roster/official-roster.json` — recovered authoritative roster (12), with
  `face_index`, `post_ja`, `bio_ja`, `name_romaji`, `match_type`, `wayback_url`. `stats`/
  `name_kr`/`rank` are `null` (not on the source page).
- `.omo/work/logh7-official-portraits/085.jpg`, `206.jpg` — the only two real archived
  portraits (verified JPEG).
- `.omo/work/logh7-roster-recovery/` — working artifacts (raw + decoded st_char.html,
  `char_records.json`, parse/build scripts).
