# LOGH VII character record — wire field layout (binary-evidenced)

Source: Ghidra decompile of the client serializer **FUN_00407260** (the `_INF:CommandGenerateCharacterCharge`
debug dump in `G7MTClient.exe`), which writes every struct field through `FUN_00439da0(stream, fmt, label, value)`.
The `label` arguments (resolved from `strings.tsv`) name each field; the `value` arguments give the byte offset.

This is the **character record** used by `CommandGenerateCharacterCharge` / `Information*Character`. (It is a
*different* layout from the `ResponseCardCharacter` card serializer FUN_0042bff0, where face=@0x88 / rank=@0x69 —
see [[logh7-character-record-schema]]. The card is the lobby roster batch; this record is the single-char info form.)

| offset | type | field (label) | notes |
|---|---|---|---|
| 0x00 | u32 | id | character id |
| 0x04 | u32 | (unnamed) | possibly camp/return_base |
| 0x08 | u8 | **power** | nation id |
| 0x09 | u8 | **blood** | parentage/bloodline class |
| 0x0a | u8 | (unnamed) | |
| 0x0b | u8+str | **lastname** | pascal string: len@0xb, chars@0xc (≤? wide) |
| 0x26 | u8+str | **firstname** | pascal string: len@0x26, chars@0x28 |
| 0x44 | u32 | (unnamed) | |
| 0x48 | u8 | **birth_month** | |
| 0x49 | u8 | **birth_day** | |
| 0x4c | u32 | **face** | portrait pool index (≠ card's 0x88) |
| 0x50 | u8[8] | **ability_8** | the 8 abilities (統率/政治/運営/情報/指揮/機動/攻撃/防御) |
| 0x58 | u8 | **bonus_point** | |
| 0x59 | u8 | **special_ability_num** | count of special abilities (≤80 per parser cap) |
| 0x5a | u8 | **title** | titlename index |
| 0x5b | u8 | **rank** | rank index (≠ card's 0x69) |
| 0x5c | u8 | **flagship_type** | |
| 0x5e | u16 | **flagship_kind** | |
| 0x60 | u8+str | **flagship_name** | pascal string: len@0x60, chars@0x62 (≤13 per parser cap) |
| 0x7c | u8 | check | trailing validation byte |

Parser caps (from `Input_InformationCharacter::input_from_stream` validation strings):
`card_size ≤16`, `special_ability_size ≤80`, `parentage_size ≤2`, `flagship_name_size ≤13`, `character_size ≤1`.

**Bridge implication (Track 3):** the server's character-info builder must emit this exact layout. `ability_8`@0x50
is where our recovered IV EX 8-ability stats go; `face`@0x4c takes a portrait-pool index ([[logh7-portrait-pool]]);
`power`@8 is the nation id; names are pascal strings (len byte + chars). This supersedes the partial
`buildInformationCharacterRecordInner` (charId@0/gridUnitId@0x24 guesses).

## Serializer index (where each record's layout lives in G7MTClient.exe)

Each `_INF:Response*`/`_INF:Command*` debug-dump serializer reveals its record's field names+offsets via
`FUN_00439da0(stream, fmt, s_LABEL, value)`. This index is the map for precise per-record extraction:

| function | record / message | access style | notes |
|---|---|---|---|
| FUN_00407260 | CommandGenerateCharacterCharge (character struct) | clean `param_1+off` | power@8, face@0x4c, ability_8@0x50, rank@0x5b, flagshipname@0x60 (table above) |
| FUN_00419300 | ResponseInformationCharacter (full) | pointer-walk (`pbVar7[..]`) | full field NAMES only (face/ability_8/point/experience/influence/stamina/special_ability/achievement/kind/spot/...); absolute offsets not statically recoverable |
| FUN_0042bff0 | ResponseCardCharacter (lobby card) | — | card layout (face@0x88, rank@0x69) — different from the info record ([[logh7-character-record-schema]]) |
| FUN_0041aff0 | ResponseInformationWarehouse (base/spot inventory) | clean | base@?, ships, troops@0x98, supplies@0xbd, food@0xbe, mineral@0xbf — the 拠点 stock record |
| FUN_00438a20 | spot/planet info record | clean (`param_1+off`) | has planet fields (population/tax/security/food) at fixed offsets — best candidate for the **system/planet info layout**; precise offsets pending careful pairing (the auto-extractor mispairs label↔offset) |

## Name field encoding (u16[13] per char)

The name fields (lastname@0x82, firstname@0x9e, etc.) store **one u16 per character**, 2 bytes apart,
starting 1 byte after the length byte — confirmed from the `FUN_00419300` dump loop
(`param_3 = pbVar7+1; *(undefined2*)param_3; param_3 += 2`). The client uses **WideCharToMultiByte**
(15 call sites in G7MTClient) to convert wide strings to SJIS for its GDI ANSI text path
([[logh7-font-localization]]), so the u16 chars are **UCS-2 code points** (converted to cp932 at render).

Implication for `buildInformationCharacterRecordInner`: `charCodeAt(0)` → u16 is the correct encoding for
**both** ASCII and Japanese names. **Romaji (ASCII) names are robust either way** — an ASCII code is the
same value as UCS-2 and as the SJIS low byte — so the server uses romaji where available for safety, and
Japanese `name_ja` is encoding-correct under the UCS-2 reading (pending a live render confirmation).

**Track 2 status:** the *character* 0x0323 record resists static offset extraction (its full serializer is a
pointer-walk; the clean FUN_00407260 is the *send* form which conflicts with the proven 0x0323 gridUnitId@0x24).
The *spot/base* records (Warehouse FUN_0041aff0, spot FUN_00438a20) ARE clean fixed-offset and are the tractable
next target for a faithful system/planet record builder. Manual decomp reading needed to pin FUN_00438a20's pairs.
