# LOGH VII MsgDat / constmsg.dat command + message catalog (Lane 2)

Full byte-exact decode of the installed client's message container set:
`.omo/work/logh7-installed/data/MsgDat/*.dat` (22 files). Output:
`content/extracted/msgdat-full.json`. Tool: `tools/logh7_msgdat_full.py`
(reuses `tools/logh7_msgdat.py` for the container decode).

Every value below is decoded from the bytes. Nothing is inferred.

## Container formats

Two on-disk magics (see `head -c4`):

- **HFWR** (`48 46 57 52`) — indexed CP932 (Shift-JIS) string catalog. Layout:
  16-byte header (`textPointerCount` @0x08, `offsetTableCount` @0x0c), an
  offset table of `ceil(count/4)*4` u32 entries, then `textPointerCount`
  NUL-terminated CP932 strings. Records are addressed by index. 21 of 22 files.
- **GFWR** (`47 46 57 52`) — length-prefixed UTF-16LE list. Only `g7sw.dat`.

## File inventory (22 files)

| file | magic | records | non-empty | role |
|---|---|---|---|---|
| constmsg.dat | HFWR | 3199 | 3198 | master game-string catalog (command tables + vocabulary) |
| g7sw.dat | GFWR | 14 | 14 | NG-word (banned-word) filter list |
| messages_0.dat | HFWR | 594 | 97 | command-log entry templates (decree audit lines) |
| messages_1.dat | HFWR | 594 | 225 | subordinate->superior proposal/response dialogue |
| messages_2.dat | HFWR | 594 | 129 | council/consultation dialogue (卿 register) |
| messages_3.dat | HFWR | 594 | 236 | superior->subordinate order/verdict dialogue (発令) |
| messages_4.dat | HFWR | 594 | 85 | proposal/approval (military-merit register) |
| messages_5.dat | HFWR | 594 | 69 | request/approval (yname yrank register) |
| messages_6.dat | HFWR | 594 | 102 | imperial-cause persuasion dialogue |
| messages_7.dat | HFWR | 594 | 78 | emperor-address dialogue (陛下 御聖断 register) |
| messages_8.dat | HFWR | 594 | 88 | command-with-trust dialogue (ytitlepriorityb register) |
| messages_com_0.dat | HFWR | 174 | 159 | command-confirmation messages ($com_* tokens, MCP cost lines) |
| messages_com_1.dat | HFWR | 174 | 12 | command form placeholder/help strings |
| messages_tac_0.dat | HFWR | 75 | 0 | tactical bank 0 (empty reserve) |
| messages_tac_1..8.dat | HFWR | 75 | 15-50 | tactical in-battle / HQ-comms dialogue banks |

Totals: 9582 records, 4653 non-empty, 1294 token-bearing.

## constmsg.dat is the master catalog

Record id = string index. Two command tables are embedded as structured text:

1. **Battle-command tooltips** — ids 4..63, form `[ NAME ]\n…実行待機時間NN G秒\n
   実行所要時間…`. 60 commands decoded with `name`, `waitG`, `execG`
   (e.g. id 4 移動 wait 48G; id 8 白兵戦 wait 48G exec 240G). ids 0-3 are
   table headers (旗艦用コマンド / 戦隊用コマンド / 司令官のみ使用可 / 要塞司令官のみ使用可),
   64-66 are UI hints.
2. **Internal-affairs command descriptions** — ids 67+, form
   `…消費MCPNNN\n実行待機NG時間\n実行所要NG時間`. 94 commands decoded with
   `costMcp`, `waitG`, `execG`, `description` (e.g. id 67 一階級昇格 160MCP;
   id 75 封土授与 640MCP). These are the strategic/政治 commands.

Beyond the command tables, constmsg holds the rest of the game vocabulary
(unit types 軽装陸戦兵/装甲擲弾兵/装甲兵, weapon names 要塞砲/ガイエスハーケン,
crew grades グリーン/ノーマル/ベテラン/エリート, resource types 軍需物資/食料/資源, …).

## messages_* are indexed dialogue/template banks

Record id is a **semantic message slot**; the same id across banks is the
same situation rendered in a different speaker/rank register (the 9
`messages_N` banks, the 2 `com` banks, the 9 `tac` banks). `$token$`
placeholders are the wire fields the server populates at render time;
`$r10$` / `$r1$` are random-variant line separators (multiple phrasings per
slot, the engine picks one).

## Token vocabulary cross-reference

The decode yields **exactly 125 distinct `$token$`s**, matching
`content/client/message-tokens.json` 1:1 — 0 tokens missing, 0 extra. Token
groups (from the reference): `format` (2: $r10$ $r1$), `primary` (83, `$x…$`
command-fill fields), `secondary` (19, `$y…$` addressee fields), `plural`
(5, `$m…$`), `comms` (16, `$com_…$` confirmation fields). Per-file token
frequency is in the JSON (`files.<name>.tokenFrequency`).

## Protocol catalog relationship

`content/client/message-catalog.json` (203 wire codes, e.g. `0x0201
SSLoginOK`) is the **wire envelope** layer; MsgDat records are the
**human-readable templates** rendered into the command-log / dialogue UI.
They are distinct layers and do **not** share an id space — the server
sends a code + the `$token$` field values, and the client looks up the
MsgDat template and substitutes. The cross-reference block in the JSON
records this explicitly.

## g7sw.dat (GFWR)

14-entry banned-word list used by the client's text filter (chat/naming).
UTF-16LE, length-prefixed. Decoded verbatim from bytes.
