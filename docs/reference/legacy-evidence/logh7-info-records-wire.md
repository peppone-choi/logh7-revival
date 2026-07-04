# LOGH VII info-record wire layouts (binary-evidenced)

Consolidated wire layouts for the three strategic `Information*` records recovered from the
client `G7MTClient.exe`. Each record is grounded in the Ghidra decompile of the client
dispatcher, parser, and (where present) dump-serializer functions.

**Source export:** `E:/logh7-revival/.omo/ghidra/export/G7MTClient/`
(`functions.jsonl`, `strings.tsv`, `symbols.tsv`).

**Shared dispatcher:** `FUN_004ba2b0` (`switchD_004ba340`). Signature
`FUN_004ba2b0(param_1 = clientBase/this, param_2 = msgcode, param_3 = inbound record)`.
It routes `(param_2 & 0xffff)` to a case, bulk-copies the inbound record (`param_3`) as dwords
into a fixed global at `clientBase + <offset>`, then runs a post-store proc.

**Dump serializers** use the helper `FUN_00439da0(stream, fmt, LABEL, value)`; the `LABEL`
argument (resolved from `strings.tsv`) names the field and the `value` argument gives the byte
offset. Field types are recovered from the binary parser's stream vtable: `*(+0x1c)` = u32,
`*(+0x20)` = u16, `*(+0x24)` = u8.

| Message | Code | Record base global | Size | Confidence |
|---|---|---|---|---|
| ResponseInformationCharacter | 0x0323 | `clientBase+0x36a5e0` (scratch) / `clientBase+0x36a8b4 + count*0x2d4` (array, count@`+0x36a5dc`) | 724 (0x2d4) | 0.93 |
| ResponseInformationBase (system/基地 拠点) | 0x031f (case 799) | `clientBase+0x3facf4` (count) / `+0x3facf8` (array, stride 0x180, max 4) | 384 (0x180)/elem; **fixed body 0x604 = 4 + 4×0x180** | 0.70 (arrays HIGH, scalars provisional) |
| NotifyBaseParameter (planet/惑星 economy) | — (no dispatcher case) | none — server/debug-side serializer only | 74 (0x4a) | 0.82 |

---

## 1. Character record — `ResponseInformationCharacter` (0x0323)

- **Confidence: 0.93.** 47 fields pinned; all region boundaries reconcile to the byte and
  sum to 0x2d4 = 724.
- **Record base:** array at `clientBase+0x36a8b4` (stride 0x2d4, count at `+0x36a5dc`,
  scratch/current copy at `+0x36a5e0`).
- **NOT the base:** `0x3584a0` is a separate 4-byte global = the locally-selected character id,
  written by case 0x204 `SSCharacterIDResponce` (`*param_3`). `FUN_004c2a80` compares it against
  `record[0]` (id@0x00) to find the player's own character.
- **Dispatcher:** `FUN_004ba2b0` case 0x323 copies `param_3` into stack vars, then writes the
  identical layout to two destinations: the scratch at `+0x36a5e0` and the array slot at
  `+0x36a8b4 + counter*0x2d4`. On the first character it calls `FUN_004c2c80(1, +0x36a5e0, 0)`
  to push into the world.
- **Authoritative serializer:** `FUN_00419300`, header string `_INF:ResponseInformationCharacter`
  (0x761208). Pointer-walks `param_1` (= record base, `undefined4*`) with offsets that match the
  array-store block field-for-field (independent cross-validation).
- **Anchors confirmed:** id@0x00 (`FUN_004c2a80` own-character match) and flagship/grid-unit
  id@0x24 (`FUN_004c2a80` matches `piVar5[9]` against grid unit list at 0x41a368).

> WARNING: do **not** use `FUN_00407260` (`CommandGenerateCharacterCharge` SEND form,
> power@0x08 / face@0x4c on a packed send buffer) for these offsets — it is a different, smaller
> layout. See `docs/logh7-character-record-wire.md`, which documents that send form. This 724-byte
> record is the authoritative inbound 0x0323 layout from `FUN_00419300`.

| offset | type | field | evidence |
|---|---|---|---|
| 0x00 | u32 | id | `FUN_004ba2b0` case 0x323 `*puVar18=local_310=*param_3`; serializer label `id=`; `FUN_004c2a80` `*piVar5(off0) == *(0x3584a0)` |
| 0x04 | u8 | power (陣営/faction id) | `FUN_00419300` `s_power_` 0x75ef28; store covers 0x04 |
| 0x05 | u8 | camp | `FUN_00419300` `s_camp_` 0x75ef20 `*(u8)((int)param_1+5)` |
| 0x06 | u8 | state | `FUN_00419300` `s_state_` 0x75ef64 `*(u8)((int)param_1+6)` |
| 0x07 | u8 | field07 (inferred gender/sex) | `FUN_00419300` `*(u8)((int)param_1+7)` label `&DAT_0075ef0c` (UNSYMBOLIZED; CommandGenerate form uses same label after `blood`). INFERRED |
| 0x08 | u32 | begin_session_age | `FUN_00419300` `param_1[2]` `s_begin_session_age_` 0x7611f4 |
| 0x0c | u8 | birthday_month | `FUN_00419300` `*(u8)(param_1+3)` `s_birthday_month_` 0x75eefc |
| 0x0d | u8 | birthday_day | `FUN_00419300` `*(u8)((int)param_1+0xd)` `s_birthday_day_` 0x75eeec |
| 0x10 | u32 | fame | `FUN_00419300` `param_1[4]` `s_fame_` 0x75ef58 |
| 0x14 | u16 | max_of_special | `FUN_00419300` `*(u16)(param_1+5)` `s_max_of_special_` 0x7611e4 |
| 0x18 | u32 | return_base | `FUN_00419300` `param_1[6]` `s_return_base_` 0x7611d4 |
| 0x1c | u32 | spot (current system/spot id) | `FUN_00419300` `param_1[7]` `s_spot_` 0x7611cc |
| 0x20 | u32 | spot_owner | `FUN_00419300` `param_1[8]` `s_spot_owner_` 0x7611c0 |
| 0x24 | u32 | flagship (grid-unit id) | `FUN_00419300` `param_1[9]` `s_flagship_` 0x7611b4; ANCHOR `FUN_004c2a80` `piVar5[9]` vs grid list 0x41a368 |
| 0x28 | u8 | flagship_name_len | `FUN_00419300` `*(u8)(param_1+10)` `s_flagship_name__d__` 0x75ee78 |
| 0x2a | u16[13] | flagship_name[13] | `FUN_00419300` loop `(int)param_1+0x2a` u16 × len; region [0x2a,0x44) = 26B |
| 0x44 | u32 | strategy | `FUN_00419300` `param_1[0x11]` `s_strategy_` 0x7611a8 |
| 0x48 | u32 | coup_conduct | `FUN_00419300` `param_1[0x12]` `s_coup_conduct_` 0x761198 |
| 0x4c | u32 | coup | `FUN_00419300` `param_1[0x13]` `s_coup_` 0x761190 |
| 0x50 | u32 | stat_0x50 (unlabeled command/leadership attr) | `FUN_00419300` `param_1[0x14]` label `&DAT_00761188` (UNSYMBOLIZED; in strategy..evaluation block). INFERRED |
| 0x54 | u32 | stat_0x54 (unlabeled command/leadership attr) | `FUN_00419300` `param_1[0x15]` label `&DAT_00761180` (UNSYMBOLIZED). INFERRED |
| 0x58 | u32 | evaluation | `FUN_00419300` `param_1[0x16]` `s_evaluation_` 0x761174 |
| 0x5c | u16 | sendmail | `FUN_00419300` `*(u16)(param_1+0x17)` `s_sendmail_` 0x761168 |
| 0x5e | u8 | ai_operation | `FUN_00419300` `*(u8)((int)param_1+0x5e)` `s_ai_operation_` 0x761158 |
| 0x5f | u8 | ai_strategy | `FUN_00419300` `*(u8)((int)param_1+0x5f)` `s_ai_strategy_` 0x761148 |
| 0x60 | u8 | ai_commanded | `FUN_00419300` `*(u8)(param_1+0x18)` `s_ai_commanded_` 0x761138 |
| 0x61 | u8 | ai_suggested | `FUN_00419300` `*(u8)((int)param_1+0x61)` `s_ai_suggested_` 0x761128 |
| 0x62 | u8 | ai_announcement | `FUN_00419300` `*(u8)((int)param_1+0x62)` `s_ai_announcement_` 0x761114 |
| 0x63 | u8 | ai_tactics | `FUN_00419300` `*(u8)((int)param_1+0x63)` `s_ai_tactics_` 0x761108 |
| 0x64 | u8 | online | `FUN_00419300` `*(u8)(param_1+0x19)` `s_online_` 0x761100 |
| 0x68 | u32 | money | `FUN_00419300` `param_1[0x1a]` `s_money_` 0x7610f8 |
| 0x6c | u8[16] | decoration_bits[16] | `FUN_00419300` `decoration=%s` bit test over `(int)param_1+0x6c`, 0x80 bits = 16B (`s_decoration__s_` 0x7610e8); region [0x6c,0x7c) |
| 0x7c | u8 | arrested | `FUN_00419300` `*(u8)(param_1+0x1f)` `s_arrested_` 0x7610dc |
| 0x7d | u8 | parentage_len | `FUN_00419300` `*(u8)((int)param_1+0x7d)` `s_parentage__d__` 0x7610cc |
| 0x80 | u8[264] | parentage[2] (stride 0x84) | `FUN_00419300` walks `pbVar7=(int)param_1+0x81` truth@`pbVar7[-1]`=0x80, 2 × 0x84 = 264B; region [0x80,0x188). See sub-fields below |
| 0x188 | u8[32] | ability_8[8] {point u16, experience u16} | `FUN_00419300` `psVar8=(int)param_1+0x18a`, point@`psVar8[-1]`=0x188 + experience@`*psVar8`, 8 × 4B (`s_ability_8_` 0x75eed4 / point 0x7610ac / experience 0x7610a0); region [0x188,0x1a8) |
| 0x1a8 | u8 | influence | `FUN_00419300` `*(u8)(param_1+0x6a)` `s_influence_` 0x761094 |
| 0x1a9 | u8 | stamina | `FUN_00419300` `*(u8)((int)param_1+0x1a9)` `s_stamina_` 0x761088 |
| 0x1aa | u8 | special_ability_len | `FUN_00419300` `*(u8)((int)param_1+0x1aa)` `s_special_ability__d__` 0x761070 (max 80, cap @0x7636e8) |
| 0x1ac | u16[80] | special_ability[80] | `FUN_00419300` reads `(param_1+0x6b)`=0x1ac as u16 × len; region [0x1ac,0x24c) = 160B |
| 0x24c | u8 | card_len | count, ≤16. `FUN_00417390` reads it at +0x24c (gate `<0x11`); `FUN_00419300` `*(u8)(param_1+0x93)`=0x24c. **The array is at +0x254 (stride 8), NOT +0x250 — 0x250 is a 4-byte gap between count and array.** (docs/logh7-data-structures-re.md §4) |
| 0x254 | u32×2 ×16 | card[16] {id/kind u32 @+0, value/role u32 @+4} | `FUN_00417390` array loop from +0x254 stride 8, two u32 per entry. CORRECTION: the per-row second field is **u32 @+0x04**, not `spot u16 @0x252`; region [0x254,0x2d4) |
| 0x2d0 | u8 | together | `FUN_00419300` `*(u8)(param_1+0xb4)`=0x2d0 `s_together_` 0x761058; record padded to 0x2d4 = 724 |

### parentage[] sub-record (entry base 0x80 / 0x104, stride 0x84)

| rel. offset | type | field |
|---|---|---|
| +0x00 | u8 | truth |
| +0x01 | u8 | lastname_len |
| +0x02 | u16[13] | lastname[13] |
| +0x1c | u8 | firstname_len |
| +0x1e | u16[13] | firstname[13] |
| +0x38 | u8 | display_name_len |
| +0x3a | u16[13] | display_name[13] |
| +0x54 | u16 | blood |
| +0x56 | u16 | rank |
| +0x58 | u8 | titlename_len |
| +0x5a | u16[13] | titlename[13] |
| +0x74 | u32 | face |
| +0x78 | u32 | rival |
| +0x7c | u32 | myhome |
| +0x80 | u32 | achievement |

### ability_8[8] — the 8 LOGH stats (PCP/MCP scheme)

8 entries of `{point u16, experience u16}` at [0x188,0x1a8). Per the manual stat scheme:
統率 / 政治 / 運用 / 情報 (PCP) and 指揮 / 機動 / 攻撃 / 防御 (MCP). See `logh7-manual-game-design`.

### Uncertain in this record

- **0x07** (`DAT_0075ef0c`), **0x50** (`DAT_00761188`), **0x54** (`DAT_00761180`): label strings
  are NOT symbolized in the export and the binary is not in-repo to dump bytes. 0x50/0x54 are two
  adjacent command/leadership attributes inside the strategy..evaluation block; 0x07 follows
  `state` and in the CommandGenerate send form the same `DAT_0075ef0c` label appears right after
  `blood` (suggests a sex/state-like byte). Marked INFERRED above.

---

## 2. System / base record — `ResponseInformationBase` (0x031f, case 799)

- **Confidence: 0.60.** Only 3 element offsets pinned from compiled code (count@0x00,
  elem+0x04, elem+0x05); the full **named field set is recovered** from the dump-label block, but
  most **absolute byte offsets within the 0x180 element are not derivable** because the Base
  dump-serializer is not compiled into the client (only the parser + dispatcher store + world-import
  exist).
- **NOTE on naming:** there is no dedicated Spot/star-system message in `G7MTClient`. The system
  body = **Base (拠点)**; the map-cell = **Grid**. `SimpleInformationBase`
  (`NotifySimpleInformationBase` 0x1204) is the compact per-system summary.
- **Record base:** `ResponseInformationBase` byte count at `clientBase+0x3facf4`, element array at
  `+0x3facf8`, **stride 0x180, max 4 elements**. Dispatcher case 799 copies 0x181 dwords (0x604B).
- **Parsers:** `FUN_00414c70` (binary), `FUN_004154c0` (text). World-import `FUN_004c32a0` reads
  `*(byte*)(clientBase+0x3facf4)` as the element count.

### Pinned offsets (from `FUN_004c32a0` world-import)

| offset | type | field | evidence |
|---|---|---|---|
| 0x00 | u8 | count (number of base elements, max 4) | `FUN_004ba2b0` case 799 copies 0x181 dw to `+0x3facf4`; `FUN_004c32a0` reads `*(byte*)(param_1+0x3facf4)`; error `Input_ResponseInformationBase information_size over than 4` |
| elem+0x04 | u8 | base_field_b04 (owner/state candidate) | `FUN_004c32a0` `local_34d = *(u8*)(iVar16*0x180 + 0x3facfc + param_1)` = array(0x3facf8)+0x04 |
| elem+0x05 | u8 | base_field_b05 | `FUN_004c32a0` `local_34e = *(u8*)(iVar16*0x180 + param_1 + 0x3facfd)` = array+0x05 |
| elem stride | u8[384] | element stride | `FUN_004c32a0` indexes `iVar16*0x180`; `FUN_00414c70` parser uses `unaff_EBP*0x180`; 0x181 dw = 4B count + 4×0x180 |

### Raw parser offsets (NAMELESS in client decompile)

From `FUN_004154c0` / `FUN_00414c70` walking the 0x180 element. Order and types pinned; names not
resolvable here (the labeled serializer is server-side):

`+0x04 u32, +0x08 u8, +0x09 u8, +0x0c u32, +0x10 u32, +0x14 float, +0x18 u32, +0x1c u32,`
`+0x20 u8 cnt -> +0x24 u32[<=30], +0x9c u8 cnt -> +0xa0 u32[<=30], +0x118 u32, +0x11c u32,`
`+0x120 u32, +0x124 u32, +0x128 u32, +0x12c u16, +0x12e u8 cnt -> +0x130 u16[<=6],`
`+0x13c u8 cnt -> +0x140 u32[<=5], +0x154 u16, +0x156 u16, +0x158 u16, +0x15a u16, +0x15c u32,`
`+0x160 u32, +0x164 u8 cnt -> +0x168 u32[<=3], +0x174 float, +0x178 u8, +0x179 u8, +0x17a u16,`
`+0x17c u8, +0x180 u32(trailer/next-rec).`

### Named field set (offsets within 0x180 element UNRESOLVED)

Recovered from the `FUN_00439da0` dump-label block in `strings.tsv` plus parser size-caps
(`FUN_00414c70` error strings). Field **order** is from the label block; absolute byte offsets are
**not** all pinned.

**ResponseStaticInformationBase (0x031d, immutable astronomy + name)** — base `clientBase+0x3f5ae8`,
static parser `FUN_004142e0` (stride 0x3c), text-parse `FUN_004145b0`; `_INF` marker 0x760e1c:

`name[<=13]` (cap error `Input_StaticInformationBase name_size over than 13` @0x7631ac),
`class_` (0x760e0c), `grid` (0x760e14, the map-cell id this system sits in),
`diameter` (0x760da8), `revolution_radius` (0x760df8), `revolution_cycle` (0x760de4),
`revolution_direction` (0x760dcc), `revolution_init_angle` (0x760db4).

Live parser probes on 2026-06-16 proved the **wire body is a parser-helper stream**, not the
already-expanded 0x3c destination stride. The body starts with a helper-swapped `u16be count`; records
then stream fields sequentially. `FUN_004142e0` expands them into the 0x3c-byte destination layout below.
Evidence: `postcreate-031d-parser-fixed-ring.json` (count-only fix reached `nameOverPath`) and
`postcreate-031d-parser-stream-ring.json` (80 records reached `normalReturn`; live client continued to
`0x0308/0x030c/0x0f00/0x0f02/0x0f06` and displayed the in-world HUD).

| dest offset | wire helper | current server source | confidence |
|---|---|---|---|
| +0x00 | u32be | `id` | HIGH |
| +0x04 | u16be | `grid` | HIGH |
| +0x06 | u16be | `w06`/`field06` (default 0) | offset HIGH, name unresolved |
| +0x08 | u16be | `w08`/`field08` (default 0) | offset HIGH, name unresolved |
| +0x0a | u8 | `name.length` (<=13) | HIGH |
| +0x0c | u16be[name_len] | `name` / gated `name_ko` | HIGH |
| +0x26 | raw u8 | `class_` / `klass` | HIGH |
| +0x28 | f32be | `diameter` | MEDIUM |
| +0x2c | u32be | `u2c` or truncated `revolutionRadius` | offset HIGH, name unresolved |
| +0x30 | raw u8 | `revolutionDirection` | MEDIUM |
| +0x34 | f32be | `revolutionCycle` | MEDIUM |
| +0x38 | f32be | `revolutionInitAngle` | MEDIUM |

**ResponseInformationBase (0x031f, dynamic economy/defense/ownership)** — `_INF` marker 0x760fe0:

`cannon_start` (0x760e44), `cannon_angle` (0x760e54), `armor` (0x760e64),
`habitability` (0x760e6c), `atomosphere` (0x760e7c), `availability_ratio` (0x760e8c),
`commodity[3]` (0x760ea0), `living/food/religion/thought/peace/approval` (0x760eb0..0x760ee0),
`budget[5]` (0x760eec), `budgeting[6]` (0x760efc), `adult_population` (0x760f14),
`population` (0x760f28), `defence_supplies` (0x760f34), `ground_supplies` (0x760f48),
`patrol_supplies` (0x760f5c), `transport_supplies[30]` (0x760f70),
`outfit_supplies[30]` (0x760f8c), `supplies` (0x760fa4), `antiaircraft` (0x760fb0),
`price_index` (0x760fc0), `defense_outfit` (0x760fd0).
Array caps from `FUN_00414c70`: commodity<=3, budget<=5, budgeting<=6,
transport_supplies/outfit_supplies<=30.

### Array-cap cross-mapping (RESOLVED — server builder `logh7-base-record.mjs`)

The parser raw offsets and the named field set share a **unique array-size anchor**: each cap value
(30/30/6/5/3) appears exactly once in BOTH the parser walk and the named-field list, so the five arrays
map name↔offset at HIGH confidence (the only ambiguity, the two `[30]`s, is broken by list order —
`transport_supplies` is listed before `outfit_supplies`, matching the parser's read order +0x24 then +0xa0):

| named field | elem offset | type/cap | cnt offset | confidence | evidence |
|---|---|---|---|---|---|
| transport_supplies | +0x24 | u32[≤30] | +0x20 (u8) | **HIGH** | parser `if (0x1e < cnt)` @+0x20; listed 1st of two `[30]` |
| outfit_supplies | +0xa0 | u32[≤30] | +0x9c (u8) | **HIGH** | parser `if (0x1e < cnt)` @+0x9c; listed 2nd of two `[30]` |
| budgeting | +0x130 | u16[≤6] | +0x12e (u8) | **HIGH** | parser `if (6 < cnt)` @+0x12e; unique `[6]` (and only u16 array) |
| budget | +0x140 | u32[≤5] | +0x13c (u8) | **HIGH** | parser `if (5 < cnt)` @+0x13c; unique `[5]` |
| commodity | +0x168 | u32[≤3] | +0x164 (u8) | **HIGH** | parser `if (3 < cnt)` @+0x164; unique `[3]` |

Confirmed by direct re-decompile of `FUN_00414c70` (`.omo/f_414c70.txt`): the four over-limit guard sites
(`0x1e<`, `0x1e<`, `6<`, `5<`, `3<`) sit at exactly these cnt offsets, and the over-limit error string is
`Input_ResponseInformationBase information_size over than 4` (4-element max).

**Fixed body size — RESOLVED.** Dispatcher `FUN_004ba2b0` case 799 (`.omo/f_4ba2b0.txt` L419-428) copies a
**fixed 0x181 dwords (= 0x604 = 1540 bytes)** from `param_3` into `clientBase+0x3facf4` REGARDLESS of the
live count. World-import `FUN_004c32a0` reads count at `*(byte*)(param_1+0x3facf4)` (= body+0) and
element[0] at `param_1+0x3facf8` (= body+4), advancing `iVar16*0x180`. So the on-wire body is:
`count dword @ body+0` (low byte = u8 count, max 4) + `4 element slots of stride 0x180 @ body+4` (unused
zeroed) = **0x604 bytes**. `element+0x00` is the u32 id used as the match key (`FUN_004c32a0`
`*puVar7 == uVar12`); `element+0x04`/`+0x05` are read as owner/state candidate bytes (`local_34d`/
`local_34e`). The server builder `src/server/logh7-base-record.mjs` (`buildResponseInformationBaseInner`)
emits this fixed 0x604 body byte-accurately.

**Scalars still PROVISIONAL** (RE-pinned byte offset + type, but the name↔offset is NOT confirmed because
the labeled `_INF` serializer is server-side and its absolute offsets are unresolved in the client export):
elem `+0x04` (owner/state candidate), `+0x08`, `+0x09`, `+0x0c`, `+0x10`, `+0x14` (float; availability_ratio
candidate), `+0x18`, `+0x1c`, `+0x118`, `+0x11c`, `+0x120`, `+0x124`, `+0x128`, `+0x12c`, `+0x154`, `+0x156`,
`+0x158`, `+0x15a`, `+0x15c`, `+0x160`, `+0x174` (float; price_index candidate), `+0x178`, `+0x179`, `+0x17a`,
`+0x17c`. These are written byte-correct by the builder under `fieldNN` parameter names (values P3, default 0).

### Owner / ruler / garrison-commander (陣営名 / 統治者名 / 守備隊長)

These are **NOT plain fields inside the Base record**. Ownership/command is modeled on the
**character record** (0x0323, `FUN_00419300`): `power` (char+0x04 = 陣営/faction id),
`camp` (char+0x05), `spot` (param_1[7] = current system id), `spot_owner` (param_1[8] = who owns
the spot), `return_base` (param_1[6]), `flagship` (param_1[9]). The character whose `spot ==
systemId` and who holds the garrison role is the 守備隊長; the 統治者 is the faction leader of
`power`. Ship counts per system come from `ResponseInformationUnit` (0x0325 -> `+0x41a368`,
count u16 @`+0x41a364`), not from the Base record.

### Related globals (dispatcher cases verified)

| Message | Code | Global | Notes |
|---|---|---|---|
| ResponseStaticInformationPowerDistribution | 0x0309 | `+0x4130a4` | ship power-curve table (NOT faction roster), 0x157 dw |
| ResponseStaticInformationGridType | 0x0313 | `+0x3f57d4` | |
| ResponseStaticInformationGrid | 0x0315 | `+0x3f4448` | |
| ResponseInformationGrid | 0x0317 | `+0x35f358` | single dword = current grid index |
| ResponseStaticInformationBase | 0x031d | `+0x3f5ae8` | 0x1483 dw |
| ResponseInformationBase | 0x031f | `+0x3facf4` | 0x181 dw |
| ResponseInformationInstitution | 0x0321 | `+0x3fb2f8` | 0x2379 dw = 0x8DE4 fixed body (防衛/造兵/対空/衛星 facilities); 3-level nested, see §2a |
| ResponseInformationCharacter | 0x0323 | `+0x36a5e0` / `+0x36a8b4` | record 0x2d4 |
| ResponseInformationUnit | 0x0325 | `+0x41a368` | count u16 @`+0x41a364` |
| NotifySimpleInformationBase | 0x1204 | `+0x49ebac` -> table `+0x4c4b60` | stride 0x24 (36B), max 400, count @`+0x4c4b5c`, post-proc `FUN_004c2040`; carries `name[<=13]` + owner |
| ResponseTacticsInformationBase | 0x0345 | (in-battle) | serializer `FUN_004247b0`: per-emplacement antiaircraft@0x760fb0, cannon_angle@0x760e54, cannon_start@0x760e44, stamina@0x761088 |

> To fully pin offsets: trace `FUN_004c32a0` StaticBase decode (stride 0x3c) and the dynamic-base
> consumer that reads `+0x3facf8` elements field-by-field. **Live test recommended.**

---

## 2a. Base facilities record — `ResponseInformationInstitution` (0x0321, case 0x321)

- **Confidence: 0.85.** The full **nested LAYOUT is byte-exact (P0)** — both the binary parser
  `FUN_004167f0` AND the text parser `FUN_00416bd0` write identical offsets (independent
  cross-validation), the dispatcher + world-import agree on total size, and all three array caps come
  from over-limit error strings. The **scalar field NAMES inside institution/spot are not resolvable**
  (the labeled `_INF` serializer is server-side: `_INF:ResponseInformationInstitution#` @0x761030 has
  NO referencing function in the export, exactly like the 0x031f base scalars) → those stay PROVISIONAL.
- **This is the FACILITIES (施設) panel of the 「基地管理」 base-management screen** (UI-read pair req
  0x0320 → resp 0x0321). Per §3 scope note, the 防衛/造兵/対空/衛星 facilities are the `institution[]`
  sub-records carried here — the SISTER of `ResponseInformationBase` 0x031f (§2, the
  defense/development/ownership half).
- **Record base:** `clientBase+0x3fb2f8`. Dispatcher `FUN_004ba2b0` case 0x321
  (`.omo/f_4ba2b0.txt` L430-440) copies a **FIXED 0x2379 dwords (= 0x8DE4 = 36324 bytes)** from the
  inbound record into `+0x3fb2f8`, REGARDLESS of count, with **NO post-store proc**. World-import
  `FUN_004c4170` (`.omo/f_4c4170.txt` L36-42) bulk-copies the same 0x2379 dwords into the in-world
  strategy buffer (`+0x2b7078`) — confirms size.
- **Parsers:** `FUN_004167f0` (binary), `FUN_00416bd0` (text). Raw dumps `.omo/f_4167f0.txt`,
  `.omo/f_416bd0.txt`, `.omo/f_4c4170.txt`.

### Three-level nested layout (all offsets P0; ZERO padding — sizes reconcile to the byte)

**Body (the fixed 0x8DE4 region):**

| offset | type | field | evidence |
|---|---|---|---|
| body+0x00 | u8 (in dword) | count (outer elements, max 4) | dispatcher copies 0x2379 dw; parser `*param_1`, guard `bVar1 < 5`; error `Input_ResponseInformationInstitution ... information_size ... over than 4` (0x763504) |
| body+0x04 | — | element[i] base `B = body + 0x04 + i*0x2378` | parser `pbVar9 = param_1 + 8`, reads `pbVar9-4` (= body+0x04) as the element id; outer stride `pbVar9 + 0x2378` (L191) |

**Outer element (InformationInstitution), stride 0x2378 = 9080B:**

| rel. offset | type | field | confidence | evidence |
|---|---|---|---|---|
| B+0x00 | u32 | id (base/spot id) | offset HIGH, name MEDIUM | parser reads `pbVar9-4` first; serializer label `base=` (0x761028) is the lone scalar before the `_INF` marker |
| B+0x04 | u8 | institution_count (≤36) | HIGH | parser `*pbVar9`, guard `0x24 < cnt`; error `Input_InformationInstitution ... institution_size ... over than 36` (0x7634a8) |
| B+0x08 | — | institution[j] base `J = B + 0x08 + j*0xfc` | HIGH | parser `pbVar14 = pbVar9 + 0xc` (= body+0x14 = B+0x10 for the count; institution element physically begins at its u16 header 8B earlier = B+0x08); institution stride `pbVar14 + 0xfc` (L182); `institution[%d]={` (0x761014), unique ≤36 array |

**Institution sub-record, stride 0xfc = 252B (J-relative):**

| rel. offset | type | field | confidence | evidence |
|---|---|---|---|---|
| J+0x00 | u16 | field00 | offset/type HIGH, name PROVISIONAL | parser writes `(pbVar14-8)` (binary `*(+0x20)`) |
| J+0x04 | u32 | field04 | offset/type HIGH, name PROVISIONAL | parser writes `(pbVar14-4)` (binary `*(+0x1c)`) |
| J+0x08 | u8 | spot_count (≤20) | HIGH | parser `*pbVar14`, guard `0x14 < cnt`; error `Input_Institution ... spot_size ... over than 20` (0x763460) |
| J+0x0c | — | spot[k] base `S = J + 0x0c + k*0xc` | HIGH | parser spot index `*0xc` (L154/L162); `spot[%d]={` (0x761008), unique ≤20 array |

**Spot sub-record, stride 0xc = 12B (S-relative):**

| rel. offset | type | field | confidence | evidence |
|---|---|---|---|---|
| S+0x00 | u16 | field00 | offset/type HIGH, name PROVISIONAL | parser L154 `*(u16)` (binary `*(+0x20)`) |
| S+0x04 | u32 | field04 | offset/type HIGH, name PROVISIONAL | parser L165 `*(u32)` (binary `*(+0x1c)`) |
| S+0x08 | u16 | field08 | offset/type HIGH, name PROVISIONAL | parser L174 `*(u16)` (binary `*(+0x20)`) |

**Size reconciliation (byte-exact, no padding):** `36 * 0xfc = 0x2370` fills `B+0x08 .. B+0x2378`
(element stride); `20 * 0xc = 0xf0` fills `J+0x0c .. J+0xfc` (institution stride); body =
`4 + 4*0x2378 = 0x8DE4` = dispatcher copy. The server builder
`src/server/logh7-institution-record.mjs` (`buildResponseInformationInstitutionInner`) emits this
fixed body byte-accurately (verified field-for-field against the raw parser offsets).

### Name↔offset cross-map (RESOLVED via the array-cap uniqueness anchor — same technique as §2)

The serializer label block ends at `_INF:ResponseInformationInstitution#` (0x761030) and is immediately
preceded, in address order, by `file=` (0x761000), `spot[%d]={` (0x761008), `institution[%d]={`
(0x761014), `base=` (0x761028). Each of the three caps (4/36/20) is UNIQUE in BOTH the parser walk and
the label block, so the array STRUCTURE maps **HIGH**: element id ↔ `base=`, institution[] ↔
`institution[%d]={` (≤36), spot[] ↔ `spot[%d]={` (≤20). The element-id NAME is **MEDIUM** (server-side
serializer). The institution/spot SCALAR fields (J+0x00/J+0x04, S+0x00/S+0x04/S+0x08) have **no
resolvable labels** → written byte-correct under `fieldNN` PROVISIONAL names (values P3, default 0).

### Unresolved / provisional

- **Institution/spot scalar NAMES** (J+0x00 u16, J+0x04 u32, S+0x00 u16, S+0x04 u32, S+0x08 u16): the
  facility kind (造兵工廠/防衛施設/対空砲/戦闘衛星) and per-facility level/hp/production numbers almost
  certainly live in these scalars, but the labeled serializer is server-side and absolute offsets are
  not derivable from the client export. Marked PROVISIONAL `fieldNN`; pin via live A/B once the
  fragmentation fix lands (this ~36KB frame cannot be sent until then).

### ⚠ Discrepancy with the pre-existing `buildInformationInstitutionInner` (logh7-info-records.mjs)

There is a SEPARATE, already-wired builder `buildInformationInstitutionInner` in
`src/server/logh7-info-records.mjs` (L222) that places `institution_count` at `baseOff+0x08`
(= body+0x0c) and `institution[0]` at `baseOff+0x0c` (= body+0x10). The parser-pinned positions are
`institution_count` @body+0x08 and `institution[0]` @body+0x14 — so that older builder is **+4 / -4
off** for the nested fields (its outer `id` @body+0x04 is correct). The new
`logh7-institution-record.mjs` builder matches the parser exactly (verified field-for-field). See the
integration note in the §"Wiring" below before swapping the wired call.

---

## 3. Planet economy record — `NotifyBaseParameter` (惑星/基地 経済パラメータ)

- **Confidence: 0.82.** 18 fields pinned, fully labeled and triple-cross-validated. Fixed size
  0x4a = 74 bytes with full `budget[6]` (0x32 bytes with empty budget).
- **NO client-side authoritative store.** `NotifyBaseParameter` is **NOT routed** by the main
  dispatcher `FUN_004ba2b0` (no `NotifyBaseParameter OK` case). Its label string (0x764aa0) and the
  `tax_rate` (0x764c0c) / `institution` (0x764c58) labels are **unreferenced** by any client
  function => these serializers are **server-side / debug-dump paths** compiled in but not wired to
  a storage global. The client does not authoritatively store this as a named struct.
- **Validated by 3 mutually-consistent functions:** `FUN_00438a20` (dump-label serializer via
  `FUN_00439da0`), `FUN_00438390` (binary parser, types from stream vtable), `FUN_00438590`
  (text/CSV parser, identical offsets). Over-limit string @0x765040 confirms `budget[]` max 6.

| offset | type | field | evidence |
|---|---|---|---|
| 0x00 | u32 | time | `FUN_00438390` `(**+0x1c)(param_1)`; `FUN_00438a20` `s_time_` 0x7606dc `+ *param_1` |
| 0x04 | u16 | grid | `FUN_00438390` `(**+0x20)(param_1+4)`; `FUN_00438a20` `s_grid_` 0x760e14 `*(u16*)(param_1+1)` |
| 0x08 | u32 | base | `FUN_00438390` `(**+0x1c)(param_1+8)`; `FUN_00438a20` `s_base_` 0x761028 `param_1[2]` |
| 0x0c | u8 | budget_count | `FUN_00438390` `(**+0x24)(param_1+0xc)`, guard <7; `FUN_00438a20` `s_budget__d_` (budget[%d]={) |
| 0x10 | u32[budget_count] (max 6) | budget[] | `FUN_00438390` loop `iVar6=param_1+0x10` step +4 `(**+0x1c)`; over-limit `_Input_NotifyBaseParameter__budget_size>6` @0x765040 |
| 0x28 | u32 | population (人口) | `FUN_00438390` `(**+0x1c)(param_1+0x28)`; `FUN_00438a20` `s_population_` 0x760f28 `param_1[10]` |
| 0x2c | u32 | adult_population | `FUN_00438390` `(**+0x1c)(param_1+0x2c)`; `FUN_00438a20` `s_adult_population_` 0x760f14 `param_1[0xb]` |
| 0x30 | u32 | approval (支持率) | `FUN_00438390` `(**+0x1c)(param_1+0x30)`; `FUN_00438a20` `s_approval_` 0x760ee0 `param_1[0xc]` |
| 0x34 | u16 | peace (治安≈peace) | `FUN_00438390` `(**+0x20)(param_1+0x34)`; `FUN_00438a20` `s_peace_` 0x760ed8 `*(u16*)(param_1+0xd)` |
| 0x36 | u16 | thought (思想) | `FUN_00438390` `(**+0x20)(param_1+0x36)`; `FUN_00438a20` `s_thought_` 0x760ecc `*(u16*)((int)param_1+0x36)` |
| 0x38 | u16 | religion (宗教) | `FUN_00438390` `(**+0x20)(param_1+0x38)`; `FUN_00438a20` `s_religion_` 0x760ec0 `*(u16*)(param_1+0xe)` |
| 0x3c | u32 | energy | `FUN_00438390` `(**+0x1c)(param_1+0x3c)`; `FUN_00438a20` `s_energy_` 0x764f50 `param_1[0xf]` |
| 0x40 | u32 | food (食料) | `FUN_00438390` `(**+0x1c)(param_1+0x40)`; `FUN_00438a20` `s_food_` 0x760eb8 `param_1[0x10]` |
| 0x44 | u16 | living (生活レベル) | `FUN_00438390` `(**+0x20)(param_1+0x44)`; `FUN_00438a20` `s_living_` 0x760eb0 `*(u16*)(param_1+0x11)` |
| 0x46 | u16 | supplies | `FUN_00438390` `(**+0x20)(param_1+0x46)`; `FUN_00438a20` `s_supplies_` 0x760fa4 `*(u16*)((int)param_1+0x46)` |
| 0x48 | u16 | armor | `FUN_00438390` `(**+0x20)(param_1+0x48)`; `FUN_00438a20` `s_armor_` 0x760e64 `*(u16*)(param_1+0x12)`; record ends 0x4a |

### Scope note — UI labels vs wire fields

There is **no single client record** that carries the constmsg UI labels
税率(tax) / 治安(security) / 造兵工廠(shipyard) / 防衛施設(defense) / 対空砲 / 戦闘衛星 as named wire
fields. Those id 2000-3100 strings are UI display labels. The wire data is split:

1. **`NotifyBaseParameter`** [PRIMARY, fully labeled above] = planet/base ECONOMY parameters
   (人口/食料/生活/治安≈peace/思想/宗教/支持率). Server/debug-side serializer, not client-stored.
2. **`ResponseInformationBase` 0x031f** [SECONDARY container, §2] = strategic spot/base record;
   the 防衛/造兵/対空/衛星 facilities are the `institution[]` sub-records
   (`ResponseInformationInstitution` 0x0321 -> `+0x3fb2f8`).
3. **`ResponseTacticsInformationBase` 0x0345** = in-battle fortress cannon/antiaircraft array
   (serializer `FUN_004247b0`).

---

## Key files

- `E:/logh7-revival/.omo/ghidra/export/G7MTClient/functions.jsonl` — `FUN_004ba2b0` (dispatcher),
  `FUN_00419300` (char serializer), `FUN_004c2a80` (world-entry anchor), `FUN_004c2c80`
  (record-push), `FUN_004c32a0` (base world-import), `FUN_00414c70`/`FUN_004154c0`
  (base parsers), `FUN_00438a20`/`FUN_00438390`/`FUN_00438590` (NotifyBaseParameter
  dump/binary/text), `FUN_004247b0` (tactics base).
- `E:/logh7-revival/.omo/ghidra/export/G7MTClient/strings.tsv` — field label strings.
- Raw dumps (per RE session): `.omo/f_438a20.txt`, `.omo/f_438390.txt`, `.omo/f_438590.txt`,
  `.omo/f_4154c0.txt`, `.omo/f_414c70.txt`, `.omo/f_4ba2b0.txt`, `.omo/f_42e770.txt`,
  `.omo/f_4247b0.txt`.

## Related docs

- `docs/logh7-character-record-wire.md` — the `CommandGenerateCharacterCharge` SEND form
  (different, smaller layout; do not confuse with the 0x0323 record above).
- Memory: `logh7-character-record-schema`, `logh7-message-code-scheme`,
  `logh7-manual-game-design`, `logh7-server-data-architecture`.
