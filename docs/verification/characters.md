# Character Roster + 8 Innate Abilities — Verification Report

Domain: Characters (인명) and the 8 innate ability stats.
JSON under audit: `content/roster/characters.json` (97), `content/character-roster.json` (99 master), `content/extracted/all-names.json` (characters[]).
Ground truth: official VII manual `gin7manual.pdf` (text in `.omo/work/manual.layout.txt`; tables vision-read directly from the PDF) and the real VII client strings (`content/extracted/msgdat-full.json`, pre-verified trustworthy).

## Headline verdict: PARTLY-FABRICATED

- Character **names, ranks, and factions** for the 70 manual-listed characters: **VERIFIED** (exact match to manual).
- Every character's **8-ability numeric stat block**: **AI_INVENTED** relative to the VII manual. The manual contains **no numeric stats at all**. The values were transplanted from a *different game* (LOGH IV EX).
- 27 of 97 characters do not appear in the VII manual roster at all.

---

## 1. The 8 ability NAMES — VERIFIED (manual p14)

Manual page 14 defines exactly 8 abilities with descriptions:

| key | manual kanji (p14) | JSON `_stat_key_meaning_ja` | match |
| --- | --- | --- | --- |
| tochi | 統率 | 統率 | ✅ |
| seiji | 政治 | 政治 | ✅ |
| unei | **運営** | **運用** | ⚠️ MISMATCH (master roster uses 運用; p14 ability list uses 運営. Note: p14 CP section writes 運用 once — inconsistent in source, but the ability label is 運営) |
| joho | 情報 | 情報 | ✅ |
| shiki | 指揮 | 指揮 | ✅ |
| kido | 機動 | 機動 | ✅ |
| kogeki | 攻撃 | 攻撃 | ✅ |
| bogyo | 防御 | 防御 | ✅ |

The 8 ability *names* and their order are real VII manual content.

## 2. The 8 ability VALUES — AI_INVENTED (no VII ground truth)

The manual section that lists characters (pp.56–66, "初期職務権限カード保持情報") is a **role-assignment org chart** with exactly four columns: 所属 (affiliation) · 役職名 (role) · character-name+rank · 職務権限解説 (role description). Confirmed by both layout text and **direct vision reads of PDF pages 59-61 (empire) and 65-66 (alliance)**. There is **no stats column and no numeric ability value anywhere** in the manual. A numeric scan of the roster pages found only unit-size/year text (e.g. "900隻", "490年間", "90000名"), never a stat.

The JSON itself admits the true origin of the numbers:
- `content/roster/characters.json` `_source`: "…+ IV EX known-faction + canon majors; 8 innate abilities … real IV/VI stat extraction in progress (ivex-stats.json)".
- `content/roster/ivex-stats.json` `_source`: "**LOGH IV EX** Korean save (.GIN) — character record @base7586 stride34, first 8 bytes = abilities" and `_column_map`: "raw8 -> […] **(best-effort)**".

So the stats come from a *different, older game* (LOGH IV EX) via a self-described best-effort byte mapping — not from the VII manual or VII client. Examples:
- `ローエングラム` stats `{tochi:101, seiji:32, kido:70, …}` — labeled `source:"ivex-real"`.
- `フリードリヒⅣ世` stats `{shiki:111, kido:101, kogeki:105, …}` — labeled `source:"manual"`, **but the manual prints no such numbers** (false attribution).

Verdict: **all 97 stat blocks are AI_INVENTED with respect to the declared ground truth (VII manual).** They may be plausible IV-EX-derived approximations, but they are unverifiable against any VII source and several are mis-attributed to "manual".

## 3. Names / ranks / factions — VERIFIED for manual characters

Cross-checking the 97 JSON characters against the vision-read manual roster (70 named characters):

- **70 / 97 names found in manual.**
- For those 70: **rank_ja matches the manual exactly for all 60 ranked officers** (0 mismatches); the 10 politicians/emperor correctly carry blank `rank_ja`.
- **faction matches the manual for all 70** (0 mismatches). Empire = manual pp.59-60, Alliance = pp.65-66.

Spot confirmations from the vision reads:
- ローエングラム = 第2艦隊 中将; キルヒアイス = 同 司令官副官 少佐 (JSON 少佐 ✅).
- メルカッツ 第3艦隊大将, シュターデン 第4艦隊中将, フォーゲル 第5艦隊中将, ヒルデスハイム 第6艦隊中将 — all ranks ✅.
- ミッターマイヤー / ロイエンタール / レンネンカンプ = 第53/54/55巡察隊 **少将** (JSON 少将 ✅).
- レムシャイト is a **politician** (フェザーン駐在高等弁務官 政治家), not a ranked officer — JSON correctly leaves rank blank.

## 4. Characters NOT in the VII manual roster — 27 (AI_INVENTED names for THIS roster)

These appear in `characters.json` but are absent from the manual's initial duty roster. All are sourced `ivex`/`ivex-real`/`canon` (i.e. IV-EX or novel canon, not VII manual):

アイゼナッハ, アッテンボロー, アンスバッハ, オーベルシュタイン, キャゼルヌ, グリーンヒル, ケスラー, ケンプ, コーネフ, シェーンコップ, シュタインメッツ, チュン, パトリチェフ, ビッテンフェルト, ファーレンハイト, フィッシャー, フォーク, ブルームハルト, ポプラン, ミュッケンベルガー (dup of G.ミュッケンベルガー), ミュラー, ムライ, メックリンガー, ルッツ, ワーレン, ミューゼル (= ローエングラム, duplicate of same person Reinhard), ヤン.

Note two internal duplications in the JSON: `ミューゼル`/`ローエングラム` are the same character (Reinhard), and `ミュッケンベルガー`/`G.ミュッケンベルガー` overlap.

These names are real LOGH-canon people, but they are **not VII-manual-attested**; for the purpose of "does the manual contain this roster entry", they are unverifiable / AI-added.

## 5. MANUAL_ONLY (manual has, JSON missing)

None at the character-name level — all 70 manual-named characters are present in the JSON. (The manual additionally lists many *unfilled roles* with no character name, e.g. 第7/第9/第11 帝国艦隊 vacancies; these are roles not characters, so not counted.)

---

## Summary counts

| Class | Count | Scope |
| --- | --- | --- |
| VERIFIED (name+rank+faction) | 70 | matched manual characters |
| AI_INVENTED (stat blocks vs VII manual) | 97 | every record's 8 stats |
| AI_INVENTED (name absent from VII manual roster) | 27 | ivex/canon-only characters |
| MISMATCH (false `source:"manual"` on stats) | ≥1 | フリードリヒⅣ世 et al. |
| MISMATCH (ability label 運営 vs 運用) | 1 | master roster `_stat_key_meaning_ja` |
| MANUAL_ONLY (missing character) | 0 | — |

Ground-truth extraction written to `content/verified/characters.json` (70 manual records, each with `source_page`, role/unit, rank, faction, and `stats:null` with the note that the manual carries no numeric stats).
