# LOGH VII — Original Character Creation Research

Research mission: find every recoverable source describing the **新キャラクターの作成** (create-new-character)
flow of 銀河英雄伝説VII / *Legend of the Galactic Heroes VII* (Bothtec / ボーステック, JP service
2004-05-14 → 2005-04-14; Korean service by Netmarble as 은하영웅전설 온라인; China by Shanda).
Compiled 2026-06-12.

> **Headline conclusion:** The original character-creation flow is **not fully documented in any surviving
> external source** — but it does **not need to be**, because the creation *send message* is preserved
> **inside our own client binary** (`CommandGenerateCharacterCharge`, `FUN_00407260`). External sources
> (Korean preview + JP press + fan pages) independently confirm the *design* of that flow (pick canon char
> OR build custom: set 8 abilities within a rule-bounded point budget, free name + face), and our client
> data (`Face/*.tcf` portrait pool + manual 8-ability schema + recovered prior-game stats) supplies the
> content. **Recommendation: implement the server side of the client's own `CommandGenerateCharacterCharge`
> handler — see "Ranked recommendations".**

---

## 1. Sources found (URL + contents + Wayback notes)

### Tier A — directly describe the character-creation design

| Source | URL | What it contains |
|---|---|---|
| **Namu Wiki — 은하영웅전설 7** (Korean) | `https://namu.wiki/w/은하영웅전설%207` | **Most complete external description.** 8 ability params (통솔/정치/운영/정보/지휘/기동/공격/방어), faction pick (제국군/동맹군), job system, "원작 캐릭터로 플레이 가능 under conditions", real-time 2000-concurrent / 300-per-side combat. *(Page is Cloudflare-gated — readable only via search synthesis, direct WebFetch returns 403; `ja.namu.wiki` mirror also 403.)* |
| **경향게임스 (Kyunghyang Games) preview — "유저가 캐릭터 '조작'…커뮤니케이션 '중요'"** | `https://www.khgames.co.kr/news/articleView.html?idxno=5571` | **The decisive source.** On session join you choose **원작에 등장하는 캐릭터 (canon, params pre-set)** OR **독자적으로 작성한 캐릭터 (custom: 패러미터를 룰의 범위 내에서 설정, 이름·얼굴 자유 변경)**. One ID = one character per session; cannot abandon to re-roll mid-session. |
| **GameMeca DB — 은하영웅전설 온라인** | `http://www.gamemeca.com/game.php?gmid=g0001192&rts=gmview` | Start as 일개 병사 (common soldier) → promote to 장교 (officer) → gain command authority + can select an **adjutant (부관) who is another real player, not an NPC.** Netmarble CBT scheduled Feb 2004. |
| **Personal fan page — toshichan "ゲームのお部屋（銀河英雄伝説VII）"** | `http://toshichan.my.coocan.jp/fcgamem2/gin7/index.html` | Play-diary. Confirms player character = allocate ability values + pick appearance; faction split 帝国/同盟 normally tied to 民族 (origin), but special codes let you cross factions; rank progression. |
| **Japanese Wikipedia — 銀河英雄伝説 (ゲーム)** | `https://ja.wikipedia.org/wiki/銀河英雄伝説_(ゲーム)` | Series-first MMORPG; **client cannot run standalone (server required)**; 50+ jobs (国務尚書, フェザーン高等弁務官, 艦隊司令官, 偵察 intelligence, etc.); service killed by license dispute (らいとすたっふ). |

### Tier B — press / system context (no per-field creation detail)

| Source | URL | Notes |
|---|---|---|
| 4Gamer VII summary (article index) | `https://www.4gamer.net/games/010/G001079/` | Full historical article list (below). |
| 4Gamer 2003-09-24 announcement | `…/20030924222608/` | **Session model**: 2000-concurrent MMOSLG; sessions held repeatedly, end when a capital (オーディン/ハイネセン) falls; **points carry over → next session starts at a higher rank/standing**; 2D map + 3D ships; guild/人脈 emphasis. |
| 4Gamer CBT recruitment | `…/20040123223724/`, `…/20040227203229/`, `…/20040409215614/` | CBT Jan-Apr 2004; recruitment questionnaire only — no creation spec. |
| 4Gamer service-end | `…/20050414184946/` | Shutdown; mentions **GM characters & politician characters** unlocked at end (confirms 軍人 vs 政治家 character tracks). |
| ITmedia 2004-01-26 | `https://www.itmedia.co.jp/lifestyle/articles/0401/26/news015.html` | **新キャラクター作成 contest** (募集 through Jan 31) — a player-character *design* contest; faction-based timeline-building; 1 session ≈ 1 month, divided into 1–6 week periods. |
| GAME Watch / 電撃 / スラド service-end | `…/20050414/ginga.htm`, `dengekionline…`, `srad.jp/story/05/04/15/133253/` | Shutdown cause = unauthorized trademark + **foreign licensing (Shanda CN, Prenassoft KR)** → Korean/Chinese material may exist. |
| GAME Watch 2003-09-24 (403 to fetch) | `https://game.watch.impress.co.jp/docs/20030924/` | 3-country (JP/KR/CN) MMORPG announcement. |

### Tier C — media / preservation status

| Source | URL | Notes |
|---|---|---|
| NicoNico — "銀河英雄伝説Ⅶ ある日の会戦風景" | `https://www.nicovideo.jp/watch/sm1776505` | Gameplay video — **battle scene only**, no creation UI shown in the title/desc retrievable. Worth a manual watch for UI screenshots. |
| Project EGG / D4 — 銀河英雄伝説 Ultimate Collection | `https://d4e.co.jp/20250718/4838` | Official 2026 revival pack — **includes I–V only; VII (the MMO) is NOT included.** No emulator/server. |
| archive.org item `arata_Gin7` | `https://archive.org/details/arata_Gin7` | **False lead** — an unrelated personal video, not the game. |
| GitHub / emulation wikis | (searched) | **No public VII server emulator, leaked server files, or private-server project exists.** Our revival appears to be the only one. |

### Wayback / archive.org status
- `web.archive.org` and `archive.org/wayback/available` are **blocked for this environment's fetcher**
  (WebFetch refuses the host; the JSON `available` API returns empty for `gin7.bothtec.co.jp`, i.e. that
  exact host was likely never the live URL or never crawled).
- **Follow-up for a human/unblocked fetcher:** run the CDX index
  `http://web.archive.org/cdx/search/cdx?url=bothtec.co.jp*&collapse=urlkey&output=text` and the same for
  `gin7*` / `netmarble`-hosted KR pages, then pull the official **manual / FAQ / キャラクター作成 guide**
  pages — those are the only sources likely to give exact starting values and the bonus-point budget.

---

## 2. Reconstructed character-creation flow (from the sources above)

Cross-referencing the Korean preview, GameMeca, the fan page, JP Wikipedia, and our own RE:

1. **Faction / origin first.** Choose **帝国 (Empire)** or **同盟 (Alliance)**. Faction is normally bound
   to **出自 (origin/民族)** — Empire: 貴族 / 帝国騎士 / 平民 / 亡命者; Alliance: 市民 / 亡命者
   (from `docs/logh7-manual-roster.md`). Empire 貴族 can hold a fief (영지). (Cross-faction allowed only
   via special code per the fan page.)
2. **Canon vs custom.** On joining a session you either:
   - **Pick a canon character** from the series (parameters pre-set, gated by conditions/standing), or
   - **Create an original character** — the "新キャラクターの作成" entry.
3. **Custom-character fields** (custom path):
   - **Name** — free (last + first; UCS-2 per char on the wire).
   - **Face / 顔** — free pick from the portrait pool (our `Face/*.tcf`, the
     gem/gef/gam/gaf/o/oam/oem rank·faction·sex buckets; see `logh7-portrait-pool`).
   - **8 abilities** — allocate points **within a rule-bounded budget** ("패러미터를 룰의 범위 내에서
     설정"): 統率 / 政治 / 運用 / 情報 (PCP, 政治系) and 指揮 / 機動 / 攻撃 / 防御 (MCP, 軍事系)
     (`docs/logh7-manual-roster.md` §Abilities). A **bonus_point** field exists on the wire (see §3).
   - **Birthday** (month/day), **flagship name/type/kind** also present on the create message.
4. **Start low, climb.** New players start as a **common soldier / junior officer** (KR: 일개 병사 →
   장교; rank ladder 二等兵 … 少尉 … 元帥). As you rank up you gain command authority and may recruit a
   **player adjutant (副官/부관)**.
5. **Sessions & carry-over.** A session ≈ 1 month (1–6 week periods); it ends when a capital
   (オーディン/ハイネセン) falls. **Earned points/標準 carry to the next session → start at a higher
   standing.** One game-ID registers one character per session; no mid-session re-roll.

**Starting values / exact bonus-point budget:** NOT pinned by any external source. Best recovery paths:
(a) the Wayback manual (see §1 follow-up), (b) live capture of `CommandGenerateCharacterCharge` from the
client's own creation screen, (c) the manual's 8-ability schema + prior-game baselines we already hold.

---

## 3. Protocol / server-side info discovered (the load-bearing find)

The client **already contains the character-creation send message.** From
`docs/logh7-character-record-wire.md` (Ghidra decompile of `FUN_00407260`,
`_INF:CommandGenerateCharacterCharge`):

| off | type | field | note |
|---|---|---|---|
| 0x00 | u32 | id | |
| 0x08 | u8 | **power** | nation/faction id |
| 0x09 | u8 | **blood** | parentage/origin class (貴族/平民/…) |
| 0x0b | u8+str | **lastname** | pascal, UCS-2/char |
| 0x26 | u8+str | **firstname** | pascal, UCS-2/char |
| 0x48/0x49 | u8 | **birth_month / birth_day** | |
| 0x4c | u32 | **face** | portrait-pool index (`Face/*.tcf`) |
| 0x50 | u8[8] | **ability_8** | the 8 stats (統率/政治/運用/情報/指揮/機動/攻撃/防御) |
| 0x58 | u8 | **bonus_point** | the rule-bounded budget the KR preview describes |
| 0x59 | u8 | special_ability_num | ≤80 |
| 0x5a | u8 | title | |
| 0x5b | u8 | **rank** | rank index |
| 0x5c.. | — | flagship_type/kind/name | |
| 0x7c | u8 | check | trailing validation |

Inbound counterpart (server → client) is **`ResponseInformationCharacter` 0x0323** (724-byte record,
`FUN_00419300`), already mapped field-for-field in `docs/logh7-info-records-wire.md` (ability_8 at
0x188 as `{point u16, experience u16}`×8; `power`@0x04; `face` inside the parentage sub-record @+0x74).

**Implication:** the creation loop is `client → CommandGenerateCharacterCharge (FUN_00407260 layout) →
server persists + assigns id → server → ResponseInformationCharacter 0x0323`. We own both ends' layouts.
No new client patching is required to *offer* creation — the lobby's 新キャラクターの作成 button already
emits this message; we only need the **server handler** to accept it.

---

## 4. Ranked recommendations — how to enable original character creation

1. **[BEST] Implement the server handler for the client's own `CommandGenerateCharacterCharge`.**
   Parse the `FUN_00407260` layout (§3): read `power`/`blood`/names/`face`/`ability_8`/`bonus_point`/
   `rank`/flagship → validate the point budget server-side (authoritative) → allocate a character id →
   persist (CQRS/in-memory authoritative + async DB, per `logh7-server-data-architecture`) → reply with
   a `0x0323` `ResponseInformationCharacter` built via the existing
   `buildInformationCharacterRecordInner` (already aware of the 724-byte schema). This drives the
   **unmodified** client's existing creation UI end-to-end — same philosophy as the G164 world-load win.
   *Risk:* exact `bonus_point` budget + per-rank/origin starting floors are unconfirmed → pick sane
   defaults from the manual schema, then refine via live capture.

2. **[VALIDATE] Live-capture the real creation packet.** Drive the actual client to the 新キャラクター作成
   screen (via `tools/logh7_ui_explorer.py`) and record the bytes it sends. This pins the true byte
   layout, the bonus-point budget, default abilities per faction/origin, and starting rank — turning the
   inferred §2 values into ground truth. Highest-value single experiment.

3. **[CONTENT] Reuse client-side assets for the creation menu data** (no external dependency):
   - **Face pool**: `Face/*.tcf` (gem/gef/gam/gaf/o/oam/oem = rank·faction·sex buckets) as the face
     picker (`logh7-portrait-pool`).
   - **Ability schema + effects**: `docs/logh7-manual-roster.md` §Abilities (8 stats, PCP/MCP groups).
   - **Origin/faction/rank tables**: manual roster (出自 classes, rank ladder).
   - **Starting-stat baselines**: prior-game stat data we already cracked (`E:\DGGL`, IV EX, see
     `logh7-prior-games-dggl`, `logh7-client-data-map`) for plausible defaults.

4. **[ENRICH] Recover the official manual via Wayback** (needs an unblocked fetcher): CDX-index
   `bothtec.co.jp*` + KR Netmarble pages, pull the キャラクター作成 manual/FAQ for exact starting values
   and the canonical bonus-point budget. Pairs with #2 as the documentary cross-check.

5. **[FALLBACK] If a faithful packet proves intractable, server-side preset creation.** Offer creation
   through our own flow (faction → origin → face → ability allocation under a chosen budget) and emit only
   the inbound `0x0323` record, bypassing the client's send form. Less faithful but fully under our
   control; keep behind a flag like the existing `LOGH_*` gates.

---

## Key local references
- `docs/logh7-character-record-wire.md` — `CommandGenerateCharacterCharge` SEND form (the creation packet).
- `docs/logh7-info-records-wire.md` — `ResponseInformationCharacter` 0x0323 (724B inbound record).
- `docs/logh7-manual-roster.md` — 8 abilities, ranks, 出自 classes, game-start roster.
- `src/server/logh7-character-gen.mjs` — existing stat generation + `NAMED_CANON`.
- Memory: `logh7-portrait-pool`, `logh7-character-record-schema`, `logh7-prior-games-dggl`,
  `logh7-manual-game-design`, `logh7-server-data-architecture`.
