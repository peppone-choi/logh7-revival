# LANE 1 — String.txt index (master string/name table sweep)

Tool: `tools/logh7_string_txt_index.py`
Output: `content/extracted/strings-index.json` + `content/extracted/strings-names.json`
Source: `.omo/work/logh7-installed/exe/String.txt` (cp932 / Shift-JIS; client renders via GDI ANSI)
Date: 2026-06-14

## Key finding

The `String.txt` present in the installed tree (`exe/String.txt`) is **NOT** the
~43,000-string master name/string table referenced in project memory
(`logh7-client-data-map`). It is a **927-byte, 127-line UI-string fragment** —
a developer data-dump file whose first line is the literal marker `吸出し start`
(JP *suidashi* = "extract/dump start").

- `String.txt` is **byte-identical** to `String.txt.original` (927 B each). No
  Korean localization has been applied to this file yet; both are cp932 JP.
- The ~43K figure in memory came from a survey across *many* client data files
  (`String.txt` + `constmsg.dat` + MsgDat + model rosters), and/or a fuller
  original `String.txt` that is **not present** in this installed tree. The
  honest content of the file we have is enumerated below.

## Structure of the fragment

128 newline-separated entries (127 kept; trailing newline dropped). Only **13
unique** string values. Layout = a 40-entry UI block repeated 3× plus a header:

| Line(s) | Content | Category |
|---|---|---|
| 1 | `吸出し start` (dump marker) | ui_label |
| 2 | (blank) | other |
| 3 | `タイトル` (Title) | ui_label |
| 4 | `メッセージスペース` (Message space) | ui_label |
| 5 | `ログインに失敗しました。` (Login failed.) | message_template |
| 6 | `バージョンが違います。` (Version mismatch.) | message_template |
| 7 | `艦艇在庫` (Ship stock/inventory) | ui_label |
| 8 | `乗船可能兵員数` (Boardable troop count) | ui_label |
| 9–16 | `ラジオボタン` ×8 (Radio button) | ui_label |
| 17–39 | `0` ×23 (placeholder) | other |
| 40–41 | `A`, `B` (placeholder) | other |
| (block repeats at 42, 81; tail) | `50` ×8 | other |

## Counts (returned to orchestrator)

- `records` (all strings) = **127**
- `names` (character/ship/system/planet/faction/rank/post) = **0**
- unique texts = 13
- by category: `other` 84, `ui_label` 37, `message_template` 6

No proper-name rows (katakana personal names, ship/system/planet/faction/rank/
post) exist in this file, so `strings-names.json` is intentionally empty.

## Classification heuristics (deterministic, no invented values)

- `faction`/`rank`/`post`: exact match vs LOGH canon vocab sets.
- `message_template`: contains a `$token$` marker, or is a full JP sentence
  (ends with `。`, or contains failure/result verbs `ました`/`ません`/`できません`).
- `character_name`: katakana + middle-dot `・` (given/family separator). None here.
- `ui_label`: short CJK label with no sentence terminator.
- `other`: blank, numeric, single ASCII letter, or non-CJK placeholder.

## Where the real name table lives

The actual game name/string data already extracted in this repo:
- `content/client/msgdat.json` (MsgDat tokens), `content/client/message-tokens.json`
- `content/client/schema.json`, `content/client/message-catalog.json`
- `content/roster/*`, `content/galaxy.json` (system/planet names)

If a fuller original `String.txt` (the 43K table) is recovered from the CD image
or an un-truncated install, re-run this tool — it scales to any line count and
will classify names via the katakana/`・` heuristic automatically.
