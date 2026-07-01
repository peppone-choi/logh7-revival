# LOGH VII constmsg.dat RE audit (2026-06-30)

## Scope

This audit backtraces `constmsg.dat` from raw MsgDat layout to EXE consumers. It deliberately excludes `schema.json` and visual image classification as authority.

Authoritative inputs:
- raw layout: `server\content\extracted\msgdat-full.json`
- canonical text: `server\content\client\msgdat.json`
- EXE decompile index: `RE\.omo\ghidra\export\G7MTClient\functions.jsonl`
- CodeGraph DB: `C:\Users\by0ng\OneDrive\Desktop\logh7-revival\.codegraph\codegraph.db`

## Loader and lookup

- `FUN_004e9bb0` calls `FUN_00521dc0("../data/MsgDat/constmsg.dat")`.
- `FUN_00521dc0` loads `constmsg.dat`, `messages_%d.dat`, `messages_com_%d.dat`, and `messages_tac_%d.dat`.
- `FUN_00522010(group, subId)` resolves a string by offset-table group plus sub-id. Out-of-range group returns `NO TABLE`; crossing a group boundary returns `NO DATA`.
- `FUN_005229d0(group)` returns the first string for groups `0x00..0x0e`, otherwise `NO DATA`.

## Key groups

| Group | Record ids | Count | Evidence-backed meaning | Samples |
|---:|---:|---:|---|---|
| `0x03` | 190-450 | 261 | authority card / duty post labels<br>FUN_004c8cb0 wraps FUN_00522010(3,param); records start with post labels: individual, emperor, supreme commander | 190:個人<br>191:皇帝<br>192:帝国軍最高司令官<br>193:幕僚総監 |
| `0x04` | 451-476 | 26 | organization / institution labels<br>FUN_005229d0(4) first-string consumer observed; records include Imperial Palace, Cabinet, Fleet HQ, Supreme Council | 451:皇宮<br>452:内閣<br>453:駐フェザーン弁務官事務所<br>454:軍務省 |
| `0x06` | 498-758 | 261 | authority card / duty post descriptions<br>FUN_004c8cd0 wraps FUN_00522010(6,param); record alignment mirrors group 0x03 post labels | 498:個人<br>499:銀河帝国の最高権力者。490年間に渡ってゴールデンパウム家一族が独占した。神聖不可侵であるが、官僚制度の巨大化に伴ってその権力の形骸化も著しい。親政の場合は、帝国軍最高司令官及び帝国宰相も兼ねるのが慣例である。<br>500:帝国軍の最高位司令官。皇帝の軍事面の権限を分与したもので、親政の場合は皇帝が兼務する。<br>501:皇帝の軍事的補佐機関である帝国軍大本営の最高責任者。帝国軍最高司令官によって任命される。各艦隊の参謀長の任免権を有しており、人事権の大部分を掌握する軍務尚書の権力をある程度掣肘している。 |
| `0x18` | 1403-1491 | 89 | strategic grid / system / location labels<br>FUN_004c8c90 wraps FUN_00522010(0x18,param); FUN_0057aa90 and FUN_0057a5d0 use FUN_004c8c90 in map/panel text formatting | 1403:プラズマ嵐グリッド<br>1404:空間グリッド<br>1405:航行不能グリッド<br>1406:アイゼンヘルツ |
| `0x49` | 2271-2309 | 39 | place / facility labels<br>FUN_004c8d10 wraps FUN_00522010(0x49,param); FUN_00591450 formats group 0x49 facility labels before group 0x4a spot labels | 2271:政庁<br>2272:防衛司令部<br>2273:中央広場<br>2274:公園 |
| `0x4a` | 2310-2414 | 105 | spot / room labels<br>FUN_004c8cf0 wraps FUN_00522010(0x4a,param); FUN_00591450 formats child spot labels through FUN_004c8cf0 | 2310:警戒ロビー<br>2311:自由ロビー<br>2312:会議室<br>2313:広場 |
| `0x4e` | 2429-2543 | 115 | login / lobby / session menu text<br>direct FUN_00522010(0x4e,subId) calls appear in lobby/session UI constructors; records include game start, create character, delete character, session change | 2429:ゲーム開始<br>2430:新キャラクターの作成<br>2431:オリジナルキャラクター抽選<br>2432:キャラクター削除 |
| `0x5f` | 2957-2960 | 4 | command execution status text / NO DATA hotspot<br>records are command execution status/error strings; FUN_0057aa90 directly calls FUN_00522010(0x5f,subId); several constant subIds exceed this group range and become NO DATA candidates | 2957:現在ほかのコマンドを実行選択中のため、%sコマンドは実行できません。<br>2958:%sコマンドは未実装です。<br>2959:%sコマンドはスクリプトが未実装機能を使用しているか、または別の原因で実行できませんでした。<br>2960:%sコマンド選択を行います。 |

## Anchor strings

| Text | constmsg positions |
|---|---|
| 皇宮 | id 451 / group `0x04` sub 0, id 2293 / group `0x49` sub 22 |
| 内閣 | id 452 / group `0x04` sub 1 |
| 宇宙艦隊司令部 | id 456 / group `0x04` sub 5, id 2300 / group `0x49` sub 29 |
| 最高評議会 | id 471 / group `0x04` sub 20, id 2295 / group `0x49` sub 24 |
| 政庁 | id 2271 / group `0x49` sub 0 |
| 防衛司令部 | id 2272 / group `0x49` sub 1 |
| 宇宙港 | id 2275 / group `0x49` sub 4 |
| 旗艦工廠 | id 2294 / group `0x49` sub 23 |
| 自治領主府 | id 2296 / group `0x49` sub 25 |
| 警戒ロビー | id 2310 / group `0x4a` sub 0 |
| 自由ロビー | id 2311 / group `0x4a` sub 1 |
| 航路管理センター | id 2315 / group `0x4a` sub 5 |
| 旗艦桟橋 | id 2316 / group `0x4a` sub 6 |
| シミュレーションルーム | id 2327 / group `0x4a` sub 17 |
| 黒真珠の間 | id 2329 / group `0x4a` sub 19 |
| 皇帝執務室 | id 2332 / group `0x4a` sub 22 |
| 自治領主執務室 | id 2414 / group `0x4a` sub 104 |

## EXE consumer backtrace

| Group | Consumer evidence |
|---:|---|
| `0x18` | `0x004c8c90` FUN_004c8c90 -> `FUN_00522010` sub `param_1`<br>`0x004d3a40` FUN_004d3a40 -> `FUN_004c8c90` sub `*puVar2`<br>`0x004d3bd0` FUN_004d3bd0 -> `FUN_004c8c90`<br>`0x0057aa90` FUN_0057aa90 -> `FUN_004c8c90` sub `*puVar13`<br>`0x0057d0a0` FUN_0057d0a0 -> `FUN_004c8c90`<br>`0x0057d6a0` FUN_0057d6a0 -> `FUN_004c8c90`<br>`0x0058d140` FUN_0058d140 -> `FUN_004c8c90` |
| `0x49` | `0x004c8d10` FUN_004c8d10 -> `FUN_00522010` sub `param_1`<br>`0x0058ee70` FUN_0058ee70 -> `FUN_004c8d10`<br>`0x00591450` FUN_00591450 -> `FUN_004c8d10` |
| `0x4a` | `0x004c8cf0` FUN_004c8cf0 -> `FUN_00522010` sub `param_1`<br>`0x0058ee70` FUN_0058ee70 -> `FUN_004c8cf0`<br>`0x0058ee70` FUN_0058ee70 -> `FUN_004c8cf0`<br>`0x00591450` FUN_00591450 -> `FUN_004c8cf0` |
| `0x03` | `0x004c8cb0` FUN_004c8cb0 -> `FUN_00522010` sub `param_1`<br>`0x004f5cb0` FUN_004f5cb0 -> `FUN_004c8cb0`<br>`0x004f68f0` FUN_004f68f0 -> `FUN_004c8cb0`<br>`0x00521820` FUN_00521820 -> `FUN_005229d0` sub `0` -> 個人<br>`0x0052d180` FUN_0052d180 -> `FUN_004c8cb0` sub `iVar10`<br>`0x005329c0` FUN_005329c0 -> `FUN_004c8cb0` sub `*pcVar12`<br>`0x0057af30` FUN_0057af30 -> `FUN_004c8cb0` sub `*puVar18`<br>`0x0057cbf0` FUN_0057cbf0 -> `FUN_004c8cb0`<br>... 2 more in JSON |
| `0x06` | `0x004c8cd0` FUN_004c8cd0 -> `FUN_00522010` sub `param_1`<br>`0x004f5cb0` FUN_004f5cb0 -> `FUN_004c8cd0`<br>`0x005218e0` FUN_005218e0 -> `FUN_005229d0` sub `0` -> 個人 |
| `0x4e` | `0x0051d580` FUN_0051d580 -> `FUN_00522010` sub `0` -> ゲーム開始<br>`0x0051d580` FUN_0051d580 -> `FUN_00522010` sub `1` -> 新キャラクターの作成<br>`0x0051d580` FUN_0051d580 -> `FUN_00522010` sub `2` -> オリジナルキャラクター抽選<br>`0x0051d580` FUN_0051d580 -> `FUN_00522010` sub `3` -> キャラクター削除<br>`0x0051d580` FUN_0051d580 -> `FUN_00522010` sub `4` -> セッションの変更<br>`0x0051d580` FUN_0051d580 -> `FUN_00522010` sub `5` -> 環境設定<br>`0x0051d580` FUN_0051d580 -> `FUN_00522010` sub `6` -> クレジット<br>`0x0051d580` FUN_0051d580 -> `FUN_00522010` sub `7` -> ゲーム終了<br>... 119 more in JSON |
| `0x5f` | `0x0057aa90` FUN_0057aa90 -> `FUN_00522010` sub `uVar23`<br>`0x0057aa90` FUN_0057aa90 -> `FUN_00522010` sub `6` -> NO DATA<br>`0x0057aa90` FUN_0057aa90 -> `FUN_00522010` sub `5` -> NO DATA<br>`0x0057aa90` FUN_0057aa90 -> `FUN_00522010` sub `4` -> NO DATA<br>`0x0057aa90` FUN_0057aa90 -> `FUN_00522010` sub `0x12` -> NO DATA<br>`0x0057aa90` FUN_0057aa90 -> `FUN_00522010` sub `0x11` -> NO DATA<br>`0x0057aa90` FUN_0057aa90 -> `FUN_00522010` sub `0x10` -> NO DATA<br>`0x0057aa90` FUN_0057aa90 -> `FUN_00522010` sub `0xf` -> NO DATA<br>... 12 more in JSON |

## CodeGraph server path

- CodeGraph available: `True`.
- `loadInferredCatalogs` -> `buildInferredCatalogs` incoming edges: 3.
- `buildInferredCatalogs` outgoing calls/references: 5.
- Server-side exposure must keep using raw constmsg ids/ranges for institutions, facilities, spots, and rooms. `schema.json` remains a hint at most, not authority.

## Derived client patch

- `RE/tools/client_patches/command-panel-msgdat-groupfix.json` is derived from this audit plus raw disassembly.
- It leaves valid group `0x5f` subIds `0..3` on command-status strings, and repoints only `FUN_0057aa90` subIds `4..0x12` from group `0x5f` to group `0x60`.
- The patch is same-length (`push 0x5f` -> `push 0x60`, `6a5f -> 6a60`) and is included in `RE/tools/logh7_build_playable_client.py` default stack.

## Current limits

- Place/facility/spot names are now constmsg-backed, but location-to-background mapping is not recovered here.
- Prior RE confirms spot record `S+0x08` is passed to `FUN_004d4f10`, which formats `../data/image/spot/bg%03d.jpg`; this audit does not assign background ids without data/EXE evidence.
- Constant lookups that cross a group boundary are recorded as `text: "NO DATA"` in JSON. Group `0x5f` currently has such static candidates in `FUN_0057aa90` and should be chased before treating panel text as complete.
- Tactical `NO DATA` should be chased through the same pattern: find the lookup group and the record field feeding sub-id, then fix the server record or client patch according to that evidence.

Generated artifacts:
- `server\content\extracted\constmsg-groups.json`
- `docs\logh7-constmsg-re-audit-2026-06-30.md`
