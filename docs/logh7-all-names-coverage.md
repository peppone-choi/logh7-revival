# LOGH VII — Master Name Consolidation Coverage

**Deliverable:** `content/extracted/all-names.json` — every proper name from every
extracted LOGH VII source, de-duped and grouped by type, each entry citing its
source file(s). Built by `tools/logh7_consolidate_names.py` (re-runnable, deterministic).

This is the "이름 데이터 다 뽑아" (extract all the name data) deliverable.

## Totals (725 names)

| Type | Count |
|------|-------|
| characters | 133 |
| ships | 74 |
| systems | 80 |
| planets | 281 |
| fortresses | 6 |
| factions | 3 |
| ranks | 20 |
| posts | 98 |
| institutions | 30 |
| **total** | **725** |

## Per-entry shape

```json
{ "text_ja": "ルンビーニ", "text_kr": "...", "romaji": "...", "source": ["content/galaxy.json"] }
```

`text_kr` and `romaji` are present only where a source supplied them. Nothing is
invented — every value traces to a source file, and unknown fields are omitted.

## Sources read

- `content/character-roster.json` — merged master roster (99)
- `content/roster/characters.json` — manual + IV-EX stat roster (97)
- `content/roster/official-roster.json` — Wayback official-site roster (12)
- `content/roster/manual-roster.json` — gin7 manual: post holders, ranks, classes, post/org definitions
- `content/roster/community-roster.json` — KR-CBT attested names
- `content/roster/web-character-research.json` — web sweep (35)
- `content/roster/canon-extra.json` — canon-sourced English-only names (10)
- `content/galaxy.json` — 80 systems / 281 planets / 6 fortresses
- `content/ship-stats.json` — 63 ship stat records (names + keys)
- `content/manual/ship-units.json` — manual ship unit catalog (empire 52 / alliance 12)
- `content/manual/org-posts.json` — empire/alliance posts + organizations

## De-duplication

- De-duped by `text_ja`. For **characters**, a secondary normalized-romaji index
  merges name-form variants of the same person:
  - English-only `canon-extra.json` entries fold into their Japanese counterpart
    (e.g. `Ernest Mecklinger` → `エルネスト・メックリンガー`).
  - Short/long JA forms merge (`ヤン` + `ヤン・ウェンリー`; `ラインハルト` +
    `ラインハルト・フォン・ローエングラム`; `フリードリヒⅣ世` + `フリードリヒIV世`).
  - This collapsed 146 raw character entries → 133 unique people.
- Places, ships, posts, and institutions key on `text_ja` only (romaji is absent
  or ambiguous for these), with sources merged across the manual and stat files.

## New vs. existing

Every name already existed inside some `content/` file — the consolidation invents
nothing; it **unifies** them into one cited dataset. Of the 133 characters, **34**
come from secondary sweeps beyond the primary `content/character-roster.json`
(33 from `web-character-research.json` — e.g. ジークフリート・キルヒアイス,
ヒルデガルド・フォン・マリーンドルフ, アドリアン・ルビンスキー — plus 2 English-only
canon names: Wilhelm von Klopstock, Louis Machungo). All other 691 names
(ships/systems/planets/fortresses/factions/ranks/posts/institutions + 99 primary
roster characters) were already present in the primary extracts.

## Sources that contributed NO proper names

These were inspected and carry message templates / wire schema / geometry only:

- `content/extracted/strings-index.json` + `strings-names.json` — 927-byte UI-string
  fragment (`吸出し start` header, 40-entry block ×3); zero name rows.
- `content/extracted/dat-tables.json` — MsgDat string tables (constmsg.dat command
  catalog, messages_*.dat UI/message templates); no proper-name records.
- `content/extracted/msgdat-full.json` — full MsgDat message tokens (wire field schema).
- `content/extracted/binary-data.json` — PE-header + Ghidra-export string highlights.
- `content/extracted/model-*.json` — galaxy/ship/planet geometry and effect tables
  (spectral classes, hardpoints, light/space/strategy nodes); no proper names.

## Encoding

Japanese source text is cp932 / Shift-JIS (the client renders via GDI ANSI).
Korean `text_kr` is cp949 localization, present only where attested
(currently the 3 faction labels + the KR-CBT character).

## Regenerate

```sh
python tools/logh7_consolidate_names.py
```
