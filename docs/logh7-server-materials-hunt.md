# LOGH VII Server-Materials Hunt — Public Web Survey

**Date:** 2026-06-13
**Researcher goal:** Locate any surviving PUBLIC server-side material for the lost online game
銀河英雄伝説VII / Legend of the Galactic Heroes VII (Bothtec / ボーステック, JP) and its
Korean Netmarble incarnation (은하영웅전설 온라인). Legitimate public sources only.

---

## TL;DR (honest assessment)

**No server-side material for LOGH VII survives publicly. None.** No server binaries, no
server data files, no configs, no protocol specs, no packet captures, and no fan
server-reconstruction / private-server / emulator project exists for this game in Japanese,
Korean, or English sources. The original developer site (`bothtec.co.jp`) is **not** in the
Wayback Machine at all (`archived_snapshots: {}`).

The **only** surviving public game files are **CLIENT-side**, and they are already the same
class of material this project is built on:

- A full retail **CD image** of the Japanese client on the Internet Archive (`logh-7`).
- The official **manual PDF** on the Internet Archive (`gin7manual`) — already used by this
  project (memory: galaxy/manual recovery from `gin7manualsaved.pdf`).

The server was always remote and authoritative (Bothtec's MMOSLG infra, up to 2,000 players
per server). It was shut down in 2005 and, as far as any public record shows, never leaked,
never archived, and never reconstructed. This is exactly why this project's RE-the-client
approach is the correct (and apparently only) path.

---

## Confirmed historical facts (well-sourced)

- **Game:** 銀河英雄伝説VII, an online-only MMOSLG (strategy + real-time tactical battles),
  Empire vs Alliance, players rise from soldier to officer. Up to ~2,000 players/server.
- **Developer/operator:** Bothtec (ボーステック). **Rights holder:** 有限会社らいとすたっふ
  (Light Staff Ltd., manages the Tanaka Yoshiki LOGH license).
- **Cannot be played standalone** — the client requires the (now-dead) server. (JP Wikipedia
  states this explicitly: "ゲームクライアント単体で遊ぶことは出来ない".)
- **JP timeline:** CBT x3 in 2004 (Jan 23–31, Feb 27–Mar 5, Apr 9–12); package released +
  open beta May 14, 2004; **service abruptly terminated** — announced Apr 14, 2005, game
  **server stopped May 9, 2005** — because Light Staff revoked Bothtec's license (Bothtec
  accused of unauthorized trademark filing and unauthorized foreign sub-licensing).
- **KR (Netmarble):** Netmarble co-developed/published the Korean version. Korean CBT ran
  ~May 28 – Jun 7, 2004. Service likewise discontinued. (A *separate, later* product —
  GameOn/Neowiz browser game "은하영웅전설 온라인" 2012–2013 — was cancelled May 24, 2013
  and is NOT the same game; do not confuse it with the Bothtec VII title.)
- **System reqs (JP):** Win2000/XP, PentiumIII 800MHz+, 128MB+ RAM, 1024×768 16-bit,
  DirectX 8.1+, 1.5Mbps+ connection. (Matches the D3D8 client this project REs.)

---

## All leads found (with status & relevance)

### A. Internet Archive — actual game files (CLIENT only)

1. **`logh-7` — "Legend Of Galactic Heroes VII (Ginga Eiyuu Densetsu VII)"** ⭐ best file find
   - URL: https://archive.org/details/logh-7 / metadata: https://archive.org/metadata/logh-7
   - Contents: **`Logh7.bin` (229,070,688 bytes) + `Logh7.cue`** = a **CD image** of the
     Japanese retail client. Plus `Logh7.jpg` cover. Item size 218.6 MB. Creator: BOTHTEC.
     Uploaded by **PerrinAshcroft**, 2023-11-26, collection `cdrom_contributions`.
   - Uploader note: *"Servers for this game are no longer active so this is purely for
     archival purposes."* — i.e. **client disc only, explicitly no server.**
   - **Download status:** Publicly downloadable (direct + torrent).
   - **Relevance:** HIGH as a clean reference client, but this is the SAME class of material
     the project already has (the retail CD / installed client). It is **not** new server data.
     Worth pulling to cross-check against this repo's `G7MTClient.exe` / CD extract for
     integrity (cf. memory `logh7-cd-extract-integrity`, where 2 planetbattle files were lost).

2. **`gin7manual` — "Ginga Eiyuu Densetsu VII Manual PDF"** ⭐ (already in use)
   - URL: https://archive.org/details/gin7manual / metadata: https://archive.org/metadata/gin7manual
   - Contents: `gin7manual.pdf` (3.16 MB, 101 pages, official manual, OCR'd). Creator: Bothtec.
   - **Download status:** Publicly downloadable.
   - **Relevance:** This is the same document the project already mined for galaxy/system data
     (memory: `logh7-galaxy-recovered`, `logh7-manual-game-design` cite the 101p manual). The
     IA copy has searchable OCR (`gin7manual_djvu.txt`, `_hocr_searchtext.txt.gz`) which may be
     handier than the local PDF for text extraction. Canonical DESIGN data, not server data.

3. **Bothtec back-catalog on IA (context / canon data, NOT VII server):**
   - `galactic-heroes-series-ch` (LOGH III–VI, DOS+Win, CN): https://archive.org/details/galactic-heroes-series-ch
   - `logh-v-grand` (LOGH V-Grand ISO): https://archive.org/details/logh-v-grand
   - `gin-6` (LOGH V Grand + VI): https://archive.org/details/gin-6
   - `LOGHPC` (the 2008 single-player PC game — different title): https://archive.org/details/LOGHPC
   - **Relevance:** MEDIUM for canon stat/galaxy cross-referencing (prior games carry ship/
     character/system tables — cf. memory `logh7-prior-games-dggl`), LOW for VII server work.

### B. Press / history (good for facts, zero files)

4. 4Gamer VII hub: https://www.4gamer.net/games/010/G001079/ (CBT dates, specs, demo video was
   30.4MB/4:12 via BB.Games — link long dead). Service-stop article:
   https://www.4gamer.net/games/010/G001079/20050414184946/
5. Game Watch (Impress) service-stop: https://game.watch.impress.co.jp/docs/20050414/ginga.htm ;
   announcement: https://game.watch.impress.co.jp/docs/20030924/ginga.htm
6. ITmedia MMOSLG announce: https://www.itmedia.co.jp/broadband/0309/25/lp01.html
7. Dengeki Online (service stop): https://dengekionline.com/data/news/2005/4/14/...
8. Slashdot JP (srad) license-termination story: https://srad.jp/story/05/04/15/133253/
9. ネトゲブックマーク server-stop calendar entry: https://netgamebm.com/calendars/view/50
10. JP Wikipedia (LOGH games) — confirms client-can't-run-standalone, license dispute:
    https://ja.wikipedia.org/wiki/銀河英雄伝説_(ゲーム)
11. Korean coverage: OhMyNews "online rebirth" http://star.ohmynews.com/.../A0000188848 ;
    GameMeca pages g0001192 & g0004186 (screens + trailer only, no files).
12. NeoGAF 2009 thread: https://www.neogaf.com/threads/...371430/ — enthusiast discovery
    thread; a half-done English text patch + a (dead) FTP demo link were shared. **No server
    discussion, no preservation effort.**

### C. Searches that returned NOTHING (the negative result is the finding)

- GitHub for `G7MTClient`, `ginei7`, `logh7`, "galactic heroes" + server/emulator/protocol:
  **no game-related repos** (only unrelated "G7" / Marvel-Heroes-emulator noise).
- JP: 私設サーバー / エミュレータ / パケット解析 / 復活 / 復元 / 有志プロジェクト for 銀英伝VII:
  **nothing** — only fanfic 5ch threads and the same news articles.
- KR: 사설서버 / 에뮬 / 클라이언트 추출 / 복원 / CBT 후기 블로그 for 은하영웅전설 온라인:
  **nothing** — Netmarble CBT-era blogs from 2004 appear deindexed/gone.
- Wayback Machine availability API for `bothtec.co.jp`: **`archived_snapshots: {}`** (no
  snapshot at all). `web.archive.org` is additionally blocked for direct fetch in this tool,
  but the availability API is authoritative that nothing is stored.
- IA full-text search for 銀河英雄伝説 VII returned only the 3 items above (`logh-7`,
  `gin7manual`, a generic PC-98 collection) — **no server upload anywhere on IA.**

---

## Ranked shortlist — most promising to pursue

1. **`logh-7` CD image (archive.org)** — Pull it and diff against this repo's CD extract /
   `G7MTClient.exe`. Highest value because it may fill the 2 lost `planetbattle` files noted
   in memory `logh7-cd-extract-integrity`, and gives a pristine client to validate RE against.
   It will NOT yield server code, but it's the cleanest public client artifact in existence.
2. **`gin7manual` OCR text (archive.org)** — Use `gin7manual_djvu.txt` /
   `gin7manual_hocr_searchtext.txt.gz` for cleaner re-extraction of galaxy/ability/rank tables
   than re-OCRing the local PDF.
3. **Bothtec prior-games ISOs (III–VI, V-Grand) on IA** — For canon ship/character/system stat
   cross-referencing to back-fill VII server values (complements `logh7-prior-games-dggl`).
4. **(Long-shot, manual) 5ch/old-blog deep dig** — A human reading archived 2004–2005 CBT
   participant blogs/5ch logs *might* surface a screenshot of a config screen or a remembered
   packet detail, but automated search found nothing and yield expectation is near-zero.

There is **no #5 that is server data**, because none is known to exist publicly.

---

## Bottom line

- **Leads catalogued:** ~12 substantive (2 are downloadable game-file items; the rest are
  press/history or context catalog items), plus ~6 search avenues confirmed empty.
- **Single best lead:** the `logh-7` Internet Archive CD image
  (https://archive.org/details/logh-7) — a clean, downloadable copy of the JP retail client.
- **Actual server material located:** **NO.** No LOGH VII server binary, data file, config,
  protocol doc, or packet capture exists in any public source, and no fan server/emulator
  project exists. The authoritative server died in 2005 and was never preserved or leaked
  publicly. Reverse-engineering the client (this project's current approach) remains the only
  viable route to reconstruct the server.
