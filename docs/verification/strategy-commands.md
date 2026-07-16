# Verification Report: Strategy / Tactical Commands

Domain: Strategy/tactical commands + costs
Date: 2026-06-14
Verifier: workflow subagent

## Scope

Two AI-generated JSON files were checked against ground truth:

1. `content/manual/strategy-commands.json` — 81 strategic commands, fields
   `cost_cp` / `wait_time` / `exec_time` / `category_ja`. Declared source:
   "gin7 manual 別表 戦略コマンド一覧表".
2. `content/client/schema.json` → `commands[]` — 151 records (id 4-163), fields
   `cost_mcp` / `wait_g` / `exec_g`. Declared source: "client constmsg.dat field labels".

## Ground-truth sources used

- **Manual**: `gin7manual.pdf` 別表 戦略コマンド一覧表, PDF pages **68-74**
  (text via `.omo/work/manual.layout.txt`; numeric tables confirmed by vision
  `Read(pdf, pages=68/70/72)` — all transcribed values matched the vision render).
- **Binary (100% real, trustworthy per brief)**: `content/extracted/msgdat-full.json`
  → `files["constmsg.dat"]`:
  - `commandTables.battleCommands` (60 entries, recordId 4-66) — names + waitG/execG.
  - `commandTables.internalAffairsCommands` (94 entries, recordId 67-163) —
    costMcp/waitG/execG + descriptions.
  - `records[]` (raw decoded strings, e.g. record 68 = "…一階級昇格します。\n消費MCP320\n…").

## Result summary

### strategy-commands.json (81 commands)

| Check | Result |
| --- | --- |
| Command count | 81 (categories: 作戦16 / 個人15 / 諜報14 / 政治12 / 人事10 / 指揮8 / 兵站6) |
| Names present in real client strings | **80 / 81** (`兵棋演習` not found verbatim — see below) |
| cost_cp / wait_time / exec_time vs MANUAL | **80 / 81 fully match** |
| Remaining "mismatch" | `燃料補給` exec `48〜960` vs manual `48～960` — identical value, different Unicode tilde (U+301C vs U+FF5E). Cosmetic only. |
| AI_INVENTED commands | **0** |
| MANUAL_ONLY (in manual, missing from JSON) | **0** — all 81 manual rows present |

Verdict: strategy-commands.json is a **faithful transcription of the printed manual**.
Every value matches the 別表 table. The variable-cost commands are encoded as
`cost_cp: -1` with the range stated in `desc` (`作戦計画` 10～1280, `作戦撤回` 5～320,
`発令` 1～320) — consistent with the manual.

### schema.json commands (151 records)

| Check | Result |
| --- | --- |
| Record ids exist in constmsg.dat | **151 / 151** (id 4-163) — **0 AI_INVENTED** |
| cost_mcp / wait_g / exec_g vs binary tables | **0 mismatches** — exact dump of constmsg values |
| `name` field correctness | Battle cmds (id 4-66): JSON strips binary `[ 移動 ]`→`移動` (correct, matches `battleCommands.name`). Internal-affairs (id 67+): `name` = the binary *description* line, since constmsg stores descriptions not short labels. 10 of these are **truncated** (clipped mid-sentence / trailing 。 dropped). |

Verdict: schema.json commands are a **faithful binary dump** (cost/wait/exec perfect).
The only defect is that 10 internal-affairs `name` values are truncated description
strings rather than command names. No fabricated data.

## Manual ⇄ Binary discrepancies (important)

The printed manual disagrees with the in-game binary on three commands. The JSON
copied the **manual**, so where the manual is wrong relative to the binary, the JSON
inherits the wrong value. Binary (constmsg.dat raw record text) is authoritative for runtime:

| Command | JSON / Manual cost | Binary cost | Binary evidence |
| --- | --- | --- | --- |
| 抜擢 (promote-pick) | 640 | **320** | constmsg record 68: `消費MCP320` |
| 降等 (demote) | 320 | **160** | constmsg record 69: `消費MCP160` |
| ワープ航行 (warp) | 40 (flat) | **80～320** (distance-variable) | constmsg record 110: `消費MCP80～320`, `実行待機？G時間` |

These were confirmed by vision-reading the PDF (pages 71/72 do print 抜擢=640, 降等=320)
— so this is a genuine manual-vs-game data divergence, not a transcription error.

## Name anomaly

`兵棋演習` (wargaming, 個人コマンド): appears in the manual (PDF p.70) and JSON, but the
closest real client string is **`兵棋講習`** (constmsg record 944). `兵棋演習` is not present
verbatim in any decoded client string. The manual-printed name and the runtime label
appear to differ (演習 vs 講習).

## Files produced

- `content/verified/commands.json` — 81 strategic commands with per-record manual page
  source, name-in-client-strings flag, and binary-cost overrides for the 3 discrepant commands.
- This report.
