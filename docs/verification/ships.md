# Ships / Ship-Class / Stats Verification

**Domain:** 함선명 (ship classes) + per-variant stats
**Verdict:** mostly-trustworthy (names/codes/descriptions trustworthy; the `stats` strings are garbled & unusable)
**Date:** 2026-06-14

## JSON files audited
- `content/manual/ship-units.json` — claims empire[] + alliance[] ship classes with `stats` strings
- `content/extracted/model-ship.json` — 273 client 3D model records (BINARY)
- `content/extracted/all-names.json` — `ships[]` (74 names)

## Ground truth used
1. **Manual PDF** (`/Users/apple/Downloads/gin7manual/gin7manual.pdf`), read via vision:
   - p45 — ship-category overview: "1艦艇ユニット=300隻", 11 ship types, Empire-only / Alliance-only restrictions.
   - p79-89 — 帝国軍 別表 stat tables (SS75/PK86/SK80/Z82/FR88/TR88/A76/A74/A72/A78/民間船).
   - p90-99 — 同盟軍 別表 stat tables (787/795/794/796 carrier/793/792/788/795-786/民間船).
   - p100 — 両陣営兵員ユニット (personnel) appendix table.
2. **msgdat-full.json** (already-verified decoded binary strings) — every ship-class name, type code, and description.
3. **ROOT/data/model/Ship/\*.mdx** filenames — model codes + faction prefixes (261 files on disk).

## Findings by classification

### VERIFIED
- **Ship-class lineup & names** — all 11 empire / 10 alliance types match the manual p45 and the verified msgdat strings exactly. Variant naming 戦艦Ⅰ…Ⅷ, 駆逐艦Ⅰ…Ⅷ etc. confirmed in msgdat (`'高速戦艦Ⅰ'`, `'巡航艦Ⅷ'`, …).
- **Type codes** — SS75, PK86, SK80, Z82, K86, FR88, TR88, A76, A74, A72, A78, GIS12 (empire) and 787/795/794/790/796/793/792/788/786 (alliance) are ALL present verbatim in msgdat. JSON's parenthetical codes are correct.
- **Faction restrictions** — manual p45 states 高速戦艦 & 雷撃艇母艦 = 帝国軍のみ, 打撃巡航艦 = 同盟軍のみ. JSON reflects this (empire has 高速戦艦/雷撃艇母艦; alliance has 打撃巡航艦 instead). VERIFIED.
- **`desc` fields** — the JSON description text is copied near-verbatim from the real msgdat strings (e.g. SS75 description matches char-for-char). Trustworthy.
- **model-ship.json E/F faction tagging** — E-prefix → empire (121), F-prefix → alliance (130). Prefix→faction is consistent and correct.
- **偵察巡航艦 = レダ級** (production from 795) — confirmed on manual p92 and in msgdat.
- **戦闘艇 = ワルキューレ (empire) / スパルタニアン x100 (alliance carrier)** — confirmed manual p83/p94 + msgdat.

### MISMATCH (JSON value ≠ ground truth)
- **Personnel appendix `stats` (ship-units.json alliance[] last entry, lines 324-326)**: JSON claims 装甲兵 "攻撃30/防御30" and lists "50/-" ambiguously. **Manual p100 ground truth: 装甲兵 = 攻撃50 / 防御50** (not 30/30). Also empire 擲弾兵教導 = 30/30, 近衛兵 = 20/20, 装甲擲弾兵 = 20/20, 軽装陸戦兵 = 10/10, 艦隊乗組員 = -/-. JSON's "装甲擲弾兵 180 (atk20/def20)" is correct but its "装甲兵 240 (atk30/def30…shown 50/-)" conflates two rows; correct is 装甲兵 240 / 50 / 50. Corrected values are in `content/verified/ships.json` → `personnel_units_appendix`.
- **ALL numeric `stats` strings in ship-units.json** are OCR word-salad and do NOT match the manual. Example: empire 標準戦艦 JSON stats string reads `"装甲(前/側/後): 390 / - ... 21,000 18,000 20,000; 28 36 34 / 17 22 20 / 30 9 14 / 48 64…"` — this is unreadable noise. Manual ground truth (p79): 装甲 base 34/20/12, シールド 70/30, ビーム 48, ガン 100, ミサイル 80, 対空 110, 搭載 3, 物資 760, 修理 140. The "390" the JSON dumped into 装甲 is actually the 出力 column. Every base-row stat is now correctly extracted in `content/verified/ships.json`.

### AI_INVENTED (no ground-truth source)
- **model-ship.json `faction: "phezzan"`** for P-prefix (18 records) — フェザーン (Phezzan) has NO ship-unit faction in the manual (manual lists only 帝国軍 & 同盟軍 ship tables). The label is an AI inference from the "P" filename prefix. Binary nuance: ph/pm models use their own geometry + `meca_tile_p.bmp`, but PL001-006 reuse alliance `FL012.lwo`.
- **model-ship.json `faction: "phezzan_misc"`** for Z-prefix (3 records: ZH001/ZM001/ZL001) — strongest invention. Binary shows these REUSE alliance geometry (FH042/FM042/FL042). No manual or string support for "phezzan_misc" anywhere.
- **The OCR-noise inside every `stats` string** (random number sequences) is effectively invented content masquerading as data — not usable.

### MANUAL_ONLY (manual has it, JSON missing/under-captured)
- The clean **per-variant numeric tables** (建造工期/出力/装甲/シールド/兵装/物資 per Ⅰ-Ⅷ variant) exist in the manual p79-99 but were never correctly transcribed into ship-units.json. Now extracted to `content/verified/ships.json`.
- **高速艇 (K86型)** appears as a destroyer-table flagship row in the manual (p82) with its own stats — JSON mentions it only inside the 駆逐艦 description, not as structured data.

### UNVERIFIABLE
- **model-ship.json `size`, `node_count`, `nodes[]`, `assets[]`** — these are byte-level facts about the .mdx files; not cross-checked field-by-field here (would require parsing all 273 mdx). Spot-check: filenames + .lwo asset paths are internally consistent. The model CODE list itself is real (261 mdx files on disk match the records, minus a few duplicate/aliased entries giving 273).
- **all-names.json `ships[]` `source` provenance** (e.g. `"content/ship-stats.json"`) — refers to a prior AI artifact, not independently verifiable; the `text_ja` names themselves are VERIFIED against msgdat.

## Counts
- Records in JSON (ship-units.json): 47 empire + alliance class entries (incl. variants merged) + appendix.
- Ship-type names/codes: **VERIFIED** (21 distinct types across both factions).
- Numeric stat sets correctly present in JSON: **0** (all garbled) → re-extracted: **21 type tables + 1 personnel table**.
- AI-invented faction labels: **21 model records** (18 phezzan + 3 phezzan_misc).
- MISMATCH: personnel 装甲兵 atk/def (30/30 → 50/50) + every numeric stats string.

## Deliverables
- Ground-truth data: `content/verified/ships.json`
- This report: `docs/verification/ships.md`
