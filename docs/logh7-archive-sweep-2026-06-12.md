# LOGH VII Archive Sweep — 2026-06-12

Exhaustive sweep across three sources for anything relevant to the LOGH VII (Ginga
Eiyuu Densetsu VII / 銀河英雄伝説VII) revival: client installers, server binaries,
patches, disc images, manuals, data archives, and character-creation references.

Method: archive.org advancedsearch + metadata JSON APIs; Wayback CDX API (curl) for
gineiden.com; raw Wayback `id_` snapshots fetched and SHIFT_JIS-decoded for content.

---

## TL;DR — Single most valuable new lead

**`G7UPD040514.exe`** — the official LOGH VII client UPDATE/PATCH (2004-05-14, 10,594,762
bytes / ~10.6 MB), hosted on gineiden.com and preserved by the Wayback Machine. We do
NOT have it. Verified downloadable: ranged GET returns a valid `MZ` PE header.

> Download URL (verified, returns MZ executable):
> `http://web.archive.org/web/20040625193252id_/http://gineiden.com/G7UPD040514.exe`

Our extracted disc (`logh-7`) is the base InstallShield install (`g7start.exe`,
`data1/data2.cab`). The 040514 patch is dated to the live closed-beta server era and
likely carries updated executables/protocol/data that postdate the disc build — exactly
the era our wire-protocol RE targets. This should be downloaded and diffed against the
disc-installed client first.

---

## Source 1 — archive.org BOTHTEC search (all results)

Query `q=BOTHTEC` via advancedsearch returned **82 items**. Variants (Bothtec, ボーステック,
gin7, 銀河英雄伝説VII, Ginga Eiyuu Densetsu, Gineiden) surface subsets of the same set;
the LOGH-relevant ones are tabled below. The overwhelming majority are unrelated Bothtec
back-catalog titles (Relics, Puyo Puyo, Magical Chase, Topple Zip, Aspic, Maison Ikkoku,
Daisenryaku, etc.) and the offline LOGH strategy games III–VI — none of which are the
online VII client/server.

### LOGH-relevant items

| Identifier | Title | Type | Relevant files | Status vs us |
|---|---|---|---|---|
| **logh-7** | Legend Of Galactic Heroes VII | software (disc) | `Logh7.bin` 229,070,688 B + `Logh7.cue` | **HAVE** (extracted, see Source 2) |
| **gin7manual** | Ginga Eiyuu Densetsu VII Manual PDF | texts | `gin7manual.pdf` 2,113,352 B (101p) | HAVE (this is the manual already mined for galaxy/design) |
| gin-vs-t-02 | Ginga Eiyuu Densetsu VS Trial (No Sound) | software | `GinVS_T02.exe` 12,122,459 B | NEW but **not VII** — it's the separate "VS" tactical title (offline/local). Low priority. |
| galactic-heroes-series-ch | LOGH series 3–6 (Chinese) | software | Gin3/4/5/6 zips (DOS/Win) | NEW but **versions 3–6 only, NO VII**. Not relevant. |
| logh-v-grand | LOGH V-Grand | software | (V-Grand build) | NEW, **not VII**. Offline V. Skip. |
| gin-6 | LOGH V Grand and VI | software | (V/VI builds) | NEW, **not VII**. Skip. |
| ginVSmanual | LOGH VS Manual PDF | texts | VS manual pdf | NEW, VS manual (not VII). Skip. |
| gineidenVS-opening / gin-vs-t-02 | LOGH VS opening/trial | movies/software | media | VS only. Skip. |
| ginga-eiyuu-densetsu-w98-colection / -3-sp / -2 / II DX+ etc. | LOGH II/III/older | software | older titles | Pre-VII. Not relevant. |
| all-about-bothtec-...-projectegg | ProjectEGG 10th Anniv. disc | software | EGG anthology | Bothtec catalog disc; no VII online client. Skip. |

**New vs have (Source 1):** Nothing in archive.org's BOTHTEC corpus contains the VII
**online client/server/patch** beyond the `logh-7` disc we already extracted. The only VII
items are the disc (have) and the manual PDF (have). Everything else "BOTHTEC" is either
offline LOGH III–VI / VS or unrelated back-catalog. **No Korean Netmarble client appears
anywhere on archive.org.**

### Source 1 ranked action list
1. (none high-value) — archive.org has no new VII binaries. Optionally archive-mirror
   `gin-vs-t-02` (`GinVS_T02.exe`) only if the "VS" tactical engine is later deemed a useful
   cross-reference; it is a different product and **not** required for VII revival.

---

## Source 2 — archive.org/details/logh-7 (the disc we extracted)

`https://archive.org/metadata/logh-7` — full item file list:

| File | Size (bytes) | Type | Notes |
|---|---|---|---|
| **Logh7.bin** | 229,070,688 | disc image (Mode1/2352 track) | The single data track we extracted |
| **Logh7.cue** | 71 | cue sheet | 1 track, single BIN |
| Logh7.jpg / Logh7_thumb.jpg | 60,037 / 7,882 | disc-art photos | cosmetic |
| __ia_thumb.jpg | 16,350 | item tile | cosmetic |
| logh-7_archive.torrent | 10,989 | torrent | mirror convenience |
| logh-7_files.xml / _meta.xml / _meta.sqlite | — / 2,119 / 32,768 | IA metadata | — |

**Single disc, single data track.** The 71-byte cue references **one BIN, one track** —
there are NO hidden extra discs, NO separate install-vs-play disc, and NO CD-DA audio
tracks that could conceal data. Creator `BOTHTEC`, language Japanese, uploaded 2023-11-26,
described as the online game ("servers no longer active, archival only").

We already extracted this BIN's InstallShield CD to `.omo/work/logh7-iso-root/`:
`g7start.exe` (434,176 B), `setup.exe`, `data1.cab/.hdr`, `data2.cab` (153.5 MB),
`engine32.cab`, `directx9/`, and `銀英伝~1.pdf` (the manual). That is the **complete**
content of the disc — nothing in the archive.org item is un-downloaded.

**New vs have (Source 2):** Nothing new. We have the entire item; there is no second disc
or audio track to re-download.

### Source 2 ranked action list
1. (none) — disc is fully extracted; no re-download warranted. The 229 MB BIN and the
   InstallShield payload are complete and already on disk.

---

## Source 3 — gineiden.com Wayback Machine (full crawl)

CDX API (`http://web.archive.org/cdx/search/cdx?url=gineiden.com*`) returned **1,043 captured
URLs** (collapsed by urlkey). This is the **official LOGH VII operating site** (publisher
BOTHTEC; (C)2004 田中芳樹・TW / BOTHTEC / MicroVision; mecha design 加藤直之). Captures span
2001–2005. It documents the live closed-beta service: ticket billing, account CGI, manual,
update/patch history, and full game-design reference pages.

### Downloadable binaries found (the payload)

| File (Wayback raw URL) | Size | Type | Status vs us |
|---|---|---|---|
| **`/G7UPD040514.exe`** → `http://web.archive.org/web/20040625193252id_/http://gineiden.com/G7UPD040514.exe` | 10,594,762 B | **PE/EXE client PATCH** (verified `MZ`) | **NEW — DO NOT HAVE. Top priority.** |
| `/gin7manual.pdf` → `http://web.archive.org/web/20050504172714id_/http://www.gineiden.com/gin7manual.pdf` | 2,113,352 B | PDF manual | HAVE (= gin7manual / 銀英伝~1.pdf) |
| `/disposition.pdf` → `http://web.archive.org/web/20040503044718id_/http://www.gineiden.com/disposition.pdf` | 9,270 B | PDF | NEW (small; likely fleet "disposition"/formation chart). Low cost, grab it. |

No other binary types (.zip/.lzh/.lha/.cab/.msi/.dat/.iso) are present on the domain —
the **only** distributed binary is the `G7UPD040514.exe` patch. The base client shipped on
the retail CD (= our `logh-7` disc), consistent with the registration page text
("先行発売パッケージ" = advance-sale package; beta ticket on the package's inner lid).

### Account / server CGI endpoints (referenced, not archived as content)
The registration page links a separate live subdomain **`web.gineiden.com/cgi/`**:
`gin7acdata.cgi` (account data), `gin7delete.cgi` (withdrawal), `gin7upparam.cgi` (update
params). These were dynamic endpoints; the subdomain itself has **no archived snapshots**
(no captures under `web.gineiden.com` in the CDX), so no server-side code is recoverable —
only the endpoint names, useful as protocol/feature reference.

### Key archived pages (fetched + decoded)

| Page | What it gives us |
|---|---|
| `registration.html` | Billing model: ticket-based (30-day ¥1,890 / 90-day ¥4,725 incl. tax), WebMoney/credit; beta free with package ticket; 14-day lapse → account purge. Confirms retail-package + online-account architecture. |
| `beta_start.html` | Closed-beta login gate (ID/PW from a winning-notification email). |
| `st_cmake.html` | **Character creation spec** (see below). |
| `st_char.html`, `st_index.html`, `st_command.html`, `st_job.html`, `st_pj.html`, `st_ship.html`, `st_tactics*.html` | Full in-game reference: characters, commands, jobs, planets, ships, tactics. |
| `ref_job.html`, `ref_pj.html`, `ref_ship.html`, `ref_tactics.html`, `reference.html` | Mirror reference set (job/planet/ship/tactics catalogs). |
| `update01–05.html`, `update/*.html`, `/bin/update.cgi`, `/bin/backview.cgi?ct=update` | Patch/update changelog history (server-side news log; useful to date the 040514 patch contents). |
| `ginei7.html`, `what.html`, `gameinfo.html`, `release.html`, `platform.html` | Product overview, system requirements, release info. |
| `screen*.html`, `sc1–6.html`, `movie.html`, `jutsu01–03.html` | Screenshots / movies / technique pages (art reference). |

### Character-creation findings (st_cmake.html) — directly corroborates our RE

Two character classes:
- **ジェネレートキャラクター (Generate Character)** — player-created. Choose age, sex, faction.
  Face graphic picked from a pool and **changes with age**. Choose origin type: Empire =
  貴族(noble)/帝国騎士(imperial knight)/平民(commoner)/亡命者(defector); Alliance =
  市民(citizen)/亡命者(defector). Origin + age shift starting stats; Empire-noble can gain a
  **爵位 (peerage/title)**. **Carries over across sessions** (persistent progression).
- **オリジナルキャラクター (Original/canon Character)** — pick a novel character; requires
  accumulated 名声 (fame) earned by finishing a session; higher fame unlocks higher-rank canon
  characters. **Single-session only** (no carry-over). Unselected canon chars run as NPCs.

**8 ability parameters** (verbatim list — note variance vs MEMORY note):
`統率` (leadership), `指揮` (command), `政治` (politics), `機動` (mobility/fleet-maneuver),
`運営` (administration — governance of planets), `攻撃` (attack), `情報` (intelligence/info),
`防御` (defense). Stats grow with experience; older starting age → higher initial stats but
slower growth.

> Reconciliation note for `logh7-character-record-schema` / `logh7-manual-game-design`
> memory: the official site lists **運営 (administration)** and **機動 (mobility)**, whereas
> the manual-derived memory note recorded "運用" and split PCP/MCP into 統率/政治/運用/情報 +
> 指揮/機動/攻撃/防御. The site's flat 8-stat list (統率指揮政治機動運営攻撃情報防御) is the
> canonical UI ordering for the **generate-character** screen and should be cross-checked
> against `buildInformationCharacterRecordInner` ability_8 ordering.

### New vs have (Source 3)
- **NEW & high value:** `G7UPD040514.exe` patch (have NOT); `disposition.pdf` (have NOT).
- **NEW reference content (text/art, not binaries):** the full gineiden.com page set
  (character/command/ship/job/planet/tactics reference + update changelog + screenshots).
  Not previously captured into our docs; worth scraping wholesale for design canon and to
  date patch contents.
- **HAVE:** `gin7manual.pdf` (= disc PDF), the base client (= `logh-7` disc).
- **NOT FOUND anywhere:** server binaries (only CGI endpoint *names*), and any **Korean /
  Netmarble** client — the only operator evidenced is the Japanese BOTHTEC service.

### Source 3 ranked action list (exact URLs)
1. **[TOP] Download the patch:**
   `http://web.archive.org/web/20040625193252id_/http://gineiden.com/G7UPD040514.exe`
   → save, verify PE, diff against disc `g7start.exe` + cab payload to find updated
   executables / protocol changes from the live-server era.
2. **Grab `disposition.pdf`** (small, formation/disposition reference):
   `http://web.archive.org/web/20040503044718id_/http://www.gineiden.com/disposition.pdf`
3. **Scrape the update/changelog history** to date what the 040514 patch changed:
   `http://web.archive.org/web/20040625193252id_/http://gineiden.com/update05.html`
   (and `update01–04.html`, plus `/bin/update.cgi?num=0..6`).
4. **Mirror the design-reference page set** for canon (character/ship/job/planet/tactics):
   `st_cmake.html`, `st_char.html`, `st_command.html`, `st_ship.html`, `st_job.html`,
   `st_pj.html`, `st_tactics.html`/`2`/`3`, `ref_*.html` — all under
   `http://web.archive.org/web/2004id_/http://www.gineiden.com/<page>` (use exact CDX
   timestamps; e.g. st_cmake = `20040129020146`).
5. (optional) Capture screenshots/movies pages (`sc1–6.html`, `screen*.html`, `movie.html`)
   for art/UI reference.

---

## Cross-source conclusions

- **Architecture confirmed:** retail CD = base client (we have it) + online account service
  on `web.gineiden.com/cgi/` (gone) + a single distributed patch `G7UPD040514.exe` (we can
  still get it). Billing was ticket-based; beta was free with package ticket.
- **The one actionable new binary in the entire sweep is `G7UPD040514.exe`.** Nothing on
  archive.org adds a VII client/server; gineiden.com's only download payload is this patch
  (+ a 9 KB disposition PDF). Get the patch first.
- **No Korean / Netmarble client exists in any of the three sources.** The only operator on
  record is BOTHTEC (Japan), 2004 closed beta.
- **Character-creation canon recovered** from `st_cmake.html` corroborates our character
  record schema and flags a stat-naming reconciliation (運営/機動 vs 運用).
