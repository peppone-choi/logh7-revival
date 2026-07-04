# LOGH VII Korean Client Hunt (은하영웅전설 온라인 / Netmarble SpaceWar)

Research log + verdict for locating the **Korean service** client/installer of 銀河英雄伝説VII
(Bothtec gin7), serviced in South Korea by Netmarble as **은하영웅전설 Online**.

**Date:** 2026-06-12 · **Verdict:** Client binary is **NOT obtainable from any public archive**
(Wayback/archive.org never captured it; CDN dead). Microsite metadata + screenshot URLs recovered;
best remaining path is **Korean community outreach** to 2004 CBT testers. See bottom.

---

## 1. Confirmed service facts (with sources)

| Fact | Value | Source |
|---|---|---|
| Korean title | **은하영웅전설 Online** (a.k.a. "은하영웅전설 온라인", gloss "은영전 온라인") | gamemeca, newswire |
| Internal site codename | **`spacewar`** (URL path `/cp_site/spacewar/`) | Wayback CDX (this hunt) |
| Publisher | **Netmarble** (넷마블) — exclusive Korean service rights | newswire #1739 |
| Publisher (later footer) | **CJ Internet** (cjinternet.com) — Netmarble's parent/operator by 2005 | Wayback game3 capture |
| Developer | **Bothtec / 보스텍** (CEO Yamaki Ryuichi / 야마키 류이치) — same studio as the JP gin7 client | newswire #1739 |
| Lineage | Explicitly "the **7th** LOGH work, reborn online" = **gin7 / VII engine** | gamemeca gid=120882 |
| Genre | MMOSLG (strategy-sim + RTS + MMORPG hybrid), real-time command | gamemeca |
| Scale | Up to **2,000** concurrent; **600/battle** (300 per faction); 2 factions (Empire/Alliance) | newswire #1739 |
| CBT tester recruit | until 2004-05-26; **999** testers selected (announced 05-27) | newswire #1739 |
| CBT period | **2004-05-28 → ~06-05/06-07** (short, ~3 days effective) | newswire #1739, gamemeca |
| Outcome | Never commercially launched. **Service/dev terminated** | namu, ruliweb |
| Termination | Announced **2005-04-14**, effective **~2005-05** | community/namu summary |
| Reason | **Copyright contract breach** between Bothtec and **Lightstaff (라이트스태프)**, Tanaka Yoshiki's rights manager → dev rights revoked | namu, ruliweb |

**Gameplay specifics recovered** (useful for our server/localization parity): player = a single character
holding ranks/posts in Empire or Alliance; flagships by canonical name (Yang's **Hyperion**, Reinhard's
**Brunhilde**); fleet = up to 10 players/unit (commander/vice/staff roles), up to **18,000 ships** max;
directional combat (front = max atk/def, side = mid, **rear = no attack**) — matches the JP gin7 model and
our reversed wire protocol.

### Source links
- newswire press release: https://www.newswire.co.kr/newsRead.php?no=1739
- gamemeca preview "온라인으로 다시 태어나는 7번째 작품": https://www.gamemeca.com/view.php?gid=120882
- gamemeca game DB (g0001192): https://www.gamemeca.com/game.php?rts=gmview&gmid=g0001192
- gamemeca game DB (g0004186, 가제): https://www.gamemeca.com/game.php?rts=gmview&gmid=g0004186
- moneytoday (2002 dev-deal announce): https://news.mt.co.kr/mtview.php?no=2002102911115200106
- namu 은하영웅전설/게임: https://namu.wiki/w/%EC%9D%80%ED%95%98%EC%98%81%EC%9B%85%EC%A0%84%EC%84%A4/%EA%B2%8C%EC%9E%84
- ruliweb first-hand CBT memoir (2022): https://bbs.ruliweb.com/community/board/300781/read/58901153

---

## 2. The breakthrough: site codename = `spacewar`

Netmarble hosted each title under `www.netmarble.net/cp_site/<codename>/`. Enumerating that namespace in
the Wayback CDX revealed the LOGH game's codename is **`spacewar`** (not "gin7"/"galaxy"/"logh"). All
microsite archival lives under that prefix, captured **Apr–Jun 2004** (exactly the CBT window).

### Archived microsite URLs (status as of this hunt)

Most `.asp` pages are **302 login-gated** (no body archived). Pages that returned **200 with real content**:

| URL | Wayback timestamp | Note |
|---|---|---|
| `/cp_site/spacewar/story/shotview.asp` | 20040406013033 | **Screenshot page** — yielded cap_01/02/03 image URLs |
| `/cp_site/spacewar/beta/popup.html` | 20040528091648 | CBT popup — yielded popup01–06 image URLs |
| `/cp_site/spacewar/beta/popup4.asp` | 20040605013048 | CBT beta popup |
| `game3.netmarble.net/cp_site/spacewar` | 20051126110117 | **"service ended" error page** (footer = cjinternet.com) — confirms shutdown |

Full archived page list (66 captures, all `text/html`, no binaries): community/, guide/guide1–4_*,
story/character.asp, story/screen.asp, beta/index.asp, beta/beta_process.asp, download/ — the
**`/download/` directory index is captured as a 302 only; no installer file under it was ever crawled.**

---

## 3. Screenshot / UI evidence (Korean client visuals)

These are the only recovered first-party Korean-UI image URLs. **All on `cimg.netmarble.com` CDN which
is now DEAD (no DNS/connection) and NOT archived in Wayback** — so the images themselves are currently
**unrecoverable** from these URLs, but they document exactly what existed:

```
http://cimg.netmarble.com/web/4G/CP_site/spacewar/story/big/cap_01.gif   (in-game screenshot 1)
http://cimg.netmarble.com/web/4G/CP_site/spacewar/story/big/cap_02.gif   (in-game screenshot 2)
http://cimg.netmarble.com/web/4G/CP_site/spacewar/story/big/cap_03.gif   (in-game screenshot 3)
http://cimg.netmarble.com/web/4G/CP_site/spacewar/beta/popup01..06.gif   (CBT beta announcement art)
```

**Live, recoverable screenshots:** gamemeca's own DB page (g0001192) hosts multiple combat/gameplay
screenshots via its CDN (`gmdata/0000/015/702`, `15644`, `15587` referenced in page) plus a trailer.
These are reachable through gamemeca and are the **best currently-downloadable Korean UI reference**
(useful for Hangul font/layout parity even without the client).

---

## 4. Client download URL hunt — exhaustive negative result

Searched the Wayback CDX across **every netmarble host** for the installer. Findings:

- `download.netmarble.net` archive = **166 entries, all post-2009** (NMAutoUpdate, gostop/sutda/poker
  casual games, gunz/cmind wallpapers). **No spacewar / gin / ginei / logh / galaxy binary.**
- No `.exe/.zip/.cab/.msi` with "spacewar" in the path exists in Wayback on **any** netmarble subdomain.
- `/cp_site/spacewar/download/` index = 302 redirect only (login wall); the real download pointed at a
  separate authenticated CDN host that crawlers never followed → **binary never entered the archive.**
- archive.org item search (gin7 / netmarble / 은하영웅전설 / "galaxy heroes" korean client) = **no items.**
- Korean community search (루리웹/인벤/디시/네이버/보존 커뮤니티) for a preserved client/installer =
  **no surviving upload found.** The one detailed first-hand account (ruliweb 2022, "Sieg Choys") is a
  memoir with gameplay description but **explicitly no client files**.

**Why no jackpot:** CBT was a tiny 999-tester, ~1-week event in 2004; the installer sat behind a
login-gated CDN; the title was killed before OBT; the CDN (`cimg`/`download`) was purged. The standard
preservation vectors (Wayback binary capture, archive.org community upload, fansite mirror) all came up
empty.

---

## 5. Next-step recommendations (ranked)

1. **Community outreach (highest EV).** Post in Korean asking 2004 CBT testers (999 existed) for a kept
   installer or `spacewar`/은영전 온라인 folder:
   - ruliweb 고전게임 / the existing 2022 thread author "Sieg Choys" (board 300781)
   - DCInside 고전게임 갤러리, 인벤 자유게시판, 네이버 카페 (은하영웅전설 / 추억의 온라인게임)
   - Korean abandonware/preservation: **silpir.net/oldgame** (already hosts 은영전4 EX), 고전게임 보존 디스코드들.
2. **Bothtec-side / JP angle.** The Korean client is the **same gin7 engine** with cp949/Hangul
   String.txt + ANSI fonts. If a Korean client never surfaces, the JP client we already have + our
   localization pipeline (cp949 String.txt + 1-byte charset patch, per memory `logh7-font-localization`)
   reproduces the Korean text layer ourselves. The Korean client is **"nice to have," not blocking.**
3. **Screenshot harvest (do now, cheap).** Pull gamemeca's live spacewar screenshots/trailer (g0001192)
   for Hangul UI reference; archive them locally before that page also rots.
4. **Periodic re-check.** Re-run the Wayback CDX on `*.netmarble.net` + `download.netmarble.net` yearly;
   if anyone ever re-uploads, archive.org full-text/item search will eventually index it.

---

## 6. Verdict

The Korean LOGH service is **fully identified and documented** (Netmarble × Bothtec, codename `spacewar`,
CBT 2004-05-28, killed 2005 over a Lightstaff copyright breach). But the **Korean client binary is not
publicly obtainable** — it was never archived by Wayback/archive.org, the hosting CDNs are dead, and no
community mirror survives. Recovery now depends on a **human who kept the 2004 CBT installer**. For our
revival, this is **non-blocking**: the JP gin7 client + our own cp949 localization layer is the practical
path; the Korean assets remain a bonus to chase via community outreach.

---

## Second hunt (2026-06-12) — re-check, harder

Re-ran every vector with the same persistence that recovered the JP patch (`G7UPD040514.exe` from
gineiden.com Wayback). **Result: still no downloadable Korean binary**, but the *preservation-community*
vector advanced materially — we found the exact people/collections most likely to ever hold it.

### A. Wayback CDX / live CDN — re-confirmed dead

| Action | URL / command | Result |
|---|---|---|
| spacewar namespace CDX | `cdx?url=www.netmarble.net/cp_site/spacewar&matchType=prefix` | 54 captures, **0 binaries**; all `.asp` = 302, only popup/shotview = 200 (same as hunt 1) |
| `/download/` dir captures | 4 snapshots (20040611–20040616) | **all 302** → redirect to `sso.netmarble.net/Logon/CookieCheck.aspx?r_url=…/download/index.asp` (SSO login wall) |
| `download/index.asp` raw fetch | `web/2004id_/…/download/index.asp` | **never crawled with a body** — installer filename never entered the archive |
| Live netmarble hosts probe | `game/game2/game3/www/download.netmarble.net` + `/cp_site/spacewar/download/` | `www` `/download/index.asp` = **403** (path still exists, forbidden); `game2` = 302→HTTPS |
| Live HTTPS download dir | `https://game2.netmarble.net/cp_site/spacewar/download/` | 200 but **2003-byte catch-all error page** ("넷마블 게임서비스" 404 shell); every guessed filename (`spacewar.exe`, `SpaceWar.exe`, `setup.exe`, `G7.exe`, `index.asp`…) returns the **same 2003-byte error** → no real file survives server-side |

**Conclusion on this vector:** definitively exhausted. The installer lived behind `sso.netmarble.net` SSO →
authenticated CDN; no crawler ever passed the login, and the live server is now a pure error responder.

### B. NEW — archive.org Korean-MMO preservation collections (the real lead)

archive.org item search (`advancedsearch.php`) revealed an **active, organized effort to preserve
Netmarble / Korean MMO clients of exactly the spacewar era and genre.** This is the most important new
finding. No spacewar item exists *yet*, but these are the collections+people who would host it:

| Uploader (archive.org) | Profile | Why relevant |
|---|---|---|
| **`mirubackup1@gmail.com`** | **186 items** — KMS MapleStory version history, **Vastian Online OBT 2003**, Bubble Shooter 2004, Granado Espada, Silkroad, TalesWeaver, Audition, RF Online, **netpower magazine CDs 1999–2004**, Netmarble Nova2/Tetris/Catchmind | **Single highest-value target.** Systematically archives 2003-2004 Korean MMO clients; the genre+era match is exact. Best person to ask / watch for a spacewar upload. |
| `muje90@gmail.com` | 12 items — Crazy Arcade client history (2002–2025), **Netmarble Sudden Attack**, DJMAX Portable | Netmarble-focused KR preservationist |
| `mneves.upstar@gmail.com` | 61 items — **DJMax Online v308/v400 NetMarble (KOR)**, PSO2, KOF | Holds Netmarble KR client installers |
| `maciej.sonski@gmail.com` | 2 items — **NosTale 2006 (Netmarble/Entwell, subject tags: clients/patches/netmarble/korean)** | Tags clients+patches+netmarble+korean explicitly |

- Full-text/title search across **all of archive.org** for `spacewar+netmarble`, `("galactic heroes" OR ginei OR gin7 OR 은하영웅전설) AND (client OR online OR installer OR CBT)` → **no spacewar / Korean-online item.** Only hit for the franchise+binary is `logh-7` (uploader `tnomad@gmail.com`) = the **JP single-player CD-ROM** (`Logh7.bin` 229 MB + `.cue`) — *not* the online client, already known to us.

### C. NEW — netpower magazine CD ISOs inspected (negative)

`mirubackup1` archived **넷파워 Net Power** monthly CDs incl. **2004_01/02/03/04/07** (the CBT ran 05-28→06-07,
so the June/July issue was the natural carrier). Inspected ISO directory trees **remotely via HTTP Range +
ISO9660/Joliet parser** (no full 600–800 MB download needed):
- `netpower_cd_2004_07` (628 MB ISO) tree = magazine Flash shell only (`200407.exe` launcher, `Fscommand/`,
  `movie/`, `voice1–4.mp3`) — **no game-client folders, no spacewar/gin/은하 entries.** Net Power's disc is a
  multimedia shell, not a bundled-installers disc. 2004_03/04 same structure.
- Verdict: magazine-CD vector does **not** carry the CBT client (CBT was download-only from the gated CDN).
  *(Re-check tool kept for reuse: `.omo/work/logh7-korean/isowalk_joliet.py` — Range-reads any archive.org
  ISO's Joliet tree without downloading the image.)*

### D. Community / forum / abandonware re-sweep — negative

| Target | Finding |
|---|---|
| ruliweb 2022 CBT memoir (board 300781, author **"Sieg Choys"**) | Re-fetched: pure gameplay memoir, **no kept files, no links, no other named holders** |
| namu wiki `은하영웅전설 7` + `/게임` | Korean CBT = "곧 묻혔다" (quickly buried); **no preserved client, no download link, no community source cited** |
| silpir.net/oldgame (hosts 은영전4 EX) | Searched `은하영웅전설` → **only the 4 EX entry; no 온라인/spacewar client** |
| JP-patch-host angle (Korean equivalent of gineiden.com/G7UPD*.exe) | No Korean patch host exists; JP hosts (ginei.jp, 4gamer G001079, toshichan gin7 page) cover only the **JP package/patch** we already have |
| WebSearch ×6 (KR/JP/EN: client·CBT·백업·보존·preserved·download) | Surfaced only namu/gamemeca/wiki articles — **zero file-hosting result** |

### E. Second-hunt verdict

**No Korean `spacewar` binary was recovered** (`/e/logh7-revival/.omo/work/logh7-korean/` holds only HTML
probes + the ISO walker — **no .exe/.iso/.zip/.cab**). Hunt-1 conclusion stands and is now *over-confirmed*:
the CBT installer never entered any public archive, the CDN/SSO chain is dead, and no fan mirror exists.

**What changed:** we now know the **specific preservation channel** through which it could still surface,
and the exact humans to engage.

### F. Ranked human-outreach targets (most likely to have the 2004 CBT client)

1. **archive.org uploader `mirubackup1@gmail.com`** — message via his IA profile
   (`https://archive.org/details/@mirubackup1`). He already archives 2003-2004 KR MMO OBT/CBT clients
   (Vastian OBT 2003, KMS history). **Ask directly if he has/​can source the Netmarble spacewar /
   은하영웅전설 온라인 CBT client; ask him to watch for it.** Highest EV of any single action.
2. **archive.org `mneves.upstar@gmail.com` & `muje90@gmail.com`** — Netmarble-KR client preservationists
   (DJMax Online KOR, Sudden Attack). Same ask.
3. **ruliweb user "Sieg Choys"** (bbs.ruliweb.com/community/board/300781/read/58901153) — confirmed 2004
   tester; reply asking whether he or fellow testers kept the installer.
4. **DCInside 고전게임 갤러리 / 온라인게임 추억 갤** + **인벤 / 네이버 카페 (추억의 온라인게임, 은하영웅전설)** —
   post a wanted-thread for the `spacewar` / 은영전 온라인 CBT folder; the 999-tester pool is the only source.
5. Periodic re-run of the archive.org item search (`spacewar netmarble`, `은하영웅전설 온라인 client`) — if any
   of the uploaders above ever posts it, full-text index will catch it within days.

**Bottom line (unchanged, non-blocking):** the JP gin7 client we already extracted + our cp949 String.txt
localization layer reproduces the Korean text layer ourselves. The Korean CBT binary stays a "nice-to-have"
recoverable **only by a human who kept it in 2004** — and we now have the precise people to ask.
