# LOGH VII — Face-Number ↔ Character-Name Recovery

Goal: recover (character name ↔ **face number** NNN) for 銀河英雄伝説VII, where the face
number is the value the VII client uses to draw a portrait. Decompiled `FUN_00517e70`
builds `data/image/Face/<NNN>.tga` from the face value, and the `0x0323` character record
carries that number at byte `@0xf4`. The official site numbered portraits
`picture/chara/NNN.jpg` with NNN == this face number. So recovering (name → NNN) lets the
authoritative server send NNN and the client renders the correct face — **art style and
prior-game IDs are irrelevant**.

Date: 2026-06-12. Deliverable: `content/roster/face-name-map.json` (12 entries).

---

## TL;DR — honest result

- **12 name ↔ face-number pairs recovered, all `confirmed`.** They come from the developer's
  in-game reference page `gineiden.com/st_char.html` (the only public source that publishes
  these face numbers). 2 of the 12 (face 85 シェーンコップ, face 206 ヤン) are **independently
  double-confirmed** by pixel-matching the two surviving official `chara/NNN.jpg` JPEGs.
- **No new pairs beyond the 12 are recoverable from any archived source.** This was
  exhaustively verified, not assumed:
  - Only `chara/085.jpg` + `chara/206.jpg` were ever crawled into Wayback (all of
    `picture/chara/*`, `picture/st/*`, every `picture/*` capture enumerated — 160 image
    captures total, 2 character portraits).
  - Korean Netmarble `spacewar` `story/character*.asp` are 100% HTTP-302 redirect stubs
    (identical digest `STZMHV6B3H6C6PFWGI7WOZOLOGYVUKZM`); the CDN holds only 3 screenshot
    GIFs, zero character portraits.
  - Modern fan/wiki sources cover the anime / other LOGH games, never the VII-online
    `chara/NNN` numbering (the game shut in 2005 amid rights issues and was scrubbed).
- **Coverage: 12 / ~597 face numbers ≈ 2.0%.** `st_char.html` itself states it shows only
  **part** of the cast (「このページではその一部を紹介します」). The full VII roster with face
  numbers is not published anywhere archived.

---

## Why this caps at 12 (the structural reason)

The face *number* NNN is an artifact of **this game's own asset numbering**
(`chara/NNN.jpg` == `Face/<NNN>.tga`). No external party — fan site, wiki, Korean operator —
ever republished that numbering; only BOTHTEC did, on `gineiden.com`. Therefore the universe
of recoverable (name → NNN) is bounded by what `gineiden.com` archived, which is exactly the
12-character `st_char.html` sample plus the 2 portrait JPEGs Wayback happened to crawl. Every
other VII name we know (from the manual) has **no published NNN** and cannot be assigned one
without fabrication.

---

## Method & every source/URL

Tooling: Wayback **CDX API** via `curl` (WebFetch is blocked for web.archive.org here); raw
`id_` snapshots fetched with `curl -L`; Shift_JIS decoded with `iconv`. Pixel-match with
Python + PIL/numpy (NCC over 64×80 RGB). WebSearch for fan-source discovery.

### 1. gineiden.com full-domain enumeration (HIT — the 12)

- CDX: `http://web.archive.org/cdx/search/cdx?url=gineiden.com&matchType=domain&output=json`
  → 1,642 distinct 200-status originals; 271 are `.html` / `chara` / `st/` resources.
- The **only** character-roster page is `st_char.html`. **All 7 of its captures share one
  digest** `NG6Z2Z5NOVY7TQ6AP6IZL2ISRJCKM5IK` (20040115…→20050211…) = identical content =
  the same 12 characters every time. No fuller character index exists on the domain.
- Page: `http://web.archive.org/web/20040115095030id_/http://www.gineiden.com/st_char.html`
- Face numbers referenced (= `chara/NNN.jpg`): 041, 048, 069, 085, 125, 195, 206, 209, 268,
  270, 285, 286.
- Other reference pages checked, **no per-character roster**: `st_cmake.html` (char-creation
  spec), `st_job.html` / `ref_job.html` (jobs), `reference.html`, `st_pj.html`, `st_ship.html`,
  `st_command.html`, `st_tactics{,2,3}.html`, the `screen/*` & `sc*.html` screenshot pages,
  `bigpict/jutsu_*`. None list names↔numbers.

### 2. Portrait directory — exhaustive (only 2 survive)

- CDX `url=gineiden.com/picture/&matchType=prefix` → **160** image captures enumerated.
- Character portraits archived: **exactly 2** — `chara/085.jpg`, `chara/206.jpg`. The other
  10 of the 12 (`041/048/069/125/195/209/268/270/285/286.jpg`) were **never crawled**.
- `picture/st/chara1.gif` is a 72×90 section-header decoration, not a roster.
- Downloaded (verified JPEG) to `.omo/work/logh7-official-portraits/`:
  - `085.jpg` — `…/web/20050407195502id_/…/picture/chara/085.jpg`
  - `206.jpg` — `…/web/20040115095030id_/…/picture/chara/206.jpg`

### 3. Pixel-match cross-validation (confirms 85 & 206)

NCC (mean-subtracted normalized cross-correlation), official JPG resized to 64×80, compared
against all **514** decoded `content/roster/canon-portraits/{oam,oem,o}/*.png`:

| official | best match | NCC | gap to #2 | verdict |
|---|---|---:|---:|---|
| `206.jpg` ヤン | `oam/0274.png` | **0.923** | →0.700 | decisive |
| `085.jpg` シェーンコップ | `oam/0230.png` (≡ `0481`,`0931` duplicates) | **0.878** | →0.641 | decisive |

Matches the pre-existing `content/roster/portrait-identities.json` anchors exactly. Note:
the matching art lives at atlas index `oam[230]`/`oam[274]`, which is **not** the same integer
as the face number (85/206) — `atlas_index` (where art is stored) and `face_number` (wire
value) are independent; both are recorded in the deliverable.

### 4. Korean Netmarble `spacewar` (DEAD END — re-verified)

- CDX `url=netmarble.net/cp_site/spacewar&matchType=prefix` → every `story/character.asp`,
  `story/character_freedom.asp`, all `guide/guide*_*.asp` are **HTTP 302** stubs (one shared
  digest `STZMHV6B3H6C6PFWGI7WOZOLOGYVUKZM`, ~530–560 B). Real ASP bodies never stored.
- CDN CDX `url=cimg.netmarble.com/web/4G/CP_site/spacewar&matchType=prefix` → **3 GIFs only**
  (`story/big/cap1_0{1,2,3}.gif`, screenshots). No character portraits, no roster.
- Result: **0 Korean name↔NNN pairs.** `name_kr` left `null` for all 12.

### 5. VII-era fan / wiki sources (NO yield for NNN)

- WebSearch (JA): `銀河英雄伝説VII BOTHTEC オリジナルキャラクター 顔 一覧 ジェネレート`,
  `銀河英雄伝説7 オンライン gineiden.com キャラクター 攻略 wiki 提督`.
- Hits are the anime "Die Neue These", the unrelated newer game "Die Neue Saga", the general
  ginei.fandom wiki, Wikipedia, and shutdown news (dengekionline 2005-04-14). **None** carry
  the VII-online `chara/NNN` face numbering. The 2005 shutdown + rights dispute scrubbed
  VII-online fan documentation; no atwiki/guide with face numbers survives.

### 6. Manual cross-reference (names yes, numbers no)

`content/roster/manual-roster.json` (gin7 official manual) lists ~70 game-start duty-holders
by name + post + rank, but **no face numbers**. Where a manual name equals an st_char name it
is already covered by the 12. The remaining manual names (Reuenthal, Kircheis, Merkatz,
Bucock, Sithole, …) are real VII characters with **no published NNN** — they are listed in the
deliverable's `_names_without_face_number` block for completeness and explicitly NOT assigned
a fabricated number.

---

## Coverage table (by tier / confidence)

| tier / source | pairs | confidence | notes |
|---|---:|---|---|
| official-page (`st_char.html` text) | 10 | confirmed | name + post + face number from developer page |
| official-image-pixel (`chara/NNN.jpg` MSE/NCC) | 2 | confirmed | 85, 206 — also on st_char, double-confirmed by surviving JPEG |
| manual-xref | 0 | — | manual gives names but zero face numbers |
| fan-source | 0 | — | no VII-online roster with NNN survives anywhere |
| **total recovered** | **12** | **confirmed** | **12 / ~597 ≈ 2.0%** |

All 12 are `confirmed`; there are no `probable`/`weak` entries because the only data path
(st_char.html) is unambiguous and the 2 image matches are decisive.

### Recovered 12 (name ↔ face)

| face | name_ja | romaji | faction | post | how |
|---:|---|---|---|---|---|
| 209 | ラインハルト | Reinhard von Lohengramm | empire | 帝国軍最高司令官 | page |
| 195 | ミッターマイヤー | Wolfgang Mittermeyer | empire | 宇宙艦隊司令長官 | page |
| 069 | ケスラー | Ulrich Kesler | empire | 憲兵総監 | page |
| 270 | フリードリヒIV世 | Friedrich IV | empire | 皇帝 | page |
| 041 | オフレッサー | Ofresser | empire | 装甲擲弾兵総監 | page |
| 286 | レムシャイト | Remscheid | empire | フェザーン駐在高等弁務官 | page |
| 206 | ヤン | Yang Wen-li | alliance | 艦隊司令官 | page + **image (NCC 0.923)** |
| 048 | キャゼルヌ | Alex Caselnes | alliance | 宇宙艦隊参謀 | page |
| 085 | シェーンコップ | Walter von Schenkopp | alliance | 要塞守備隊指揮官 | page + **image (NCC 0.878)** |
| 125 | トリューニヒト | Job Trunicht | alliance | 最高評議会 議長 | page |
| 268 | ネグロポンティ | Negroponti | alliance | 最高評議会 国防委員長 | page |
| 285 | レベロ | Joan Rebello | alliance | 最高評議会 財政委員長 | page |

---

## Honest gaps

- **~585 of ~597 face numbers have no recovered name** — there is no archived source that maps
  them. This is a hard ceiling given Wayback's coverage of gineiden.com, not a search shortfall.
- **10 of the 12 portraits** (`041/048/069/125/195/209/268/270/285/286.jpg`) are not in Wayback;
  only `085` and `206` survive, so only those 2 get image-pixel confirmation.
- **`name_kr` unrecoverable** — Netmarble pages are 302 stubs.
- **Numeric stats** are still not on any of these pages (prose bios only).

## Single best source for going further

`gineiden.com/st_char.html` is fully mined (all captures identical). The only realistic way to
extend coverage is **inside the client itself**: the disc `data2.cab` payload (and/or the
`G7UPD040514.exe` patch noted in `docs/logh7-archive-sweep-2026-06-12.md`) — search the
extracted client data for a name/portrait table (e.g. a record keyed by face NNN, or String.txt
/ constmsg-style catalogs) that the in-game roster screen draws from. That on-disc table, if it
exists, is the only place the full name↔NNN mapping could still live now that the live server
and Korean site are gone.

## Files

- `content/roster/face-name-map.json` — 12 recovered entries (face_number, name_ja, romaji,
  faction, post_ja, source, confidence, atlas_index, wayback_url) + `_names_without_face_number`.
- `.omo/work/logh7-official-portraits/085.jpg`, `206.jpg` — the 2 surviving official portraits.
- `.omo/work/logh7-face-recovery/` — CDX dumps + fetched pages (working artifacts).
