# LOGH VII — Internal-affairs READ MODEL wire spec (Information / Static-Information records)

Static RE of `G7MTClient.exe` (Ghidra full-decompile index `.omo/ghidra/export/G7MTClient/`).
Decodes the big **server→client** record dumps that drive the 内政 (internal-affairs) and org
screens: personnel CARDs, the unit/weapon master tables, faction power-curve, facilities
(institutions), warehouse / package logistics, and the fleet/outfit organisation records.
**No client/server launch — static only.**

All field offsets are **into the inner body** (the bytes AFTER the `[u16 BE code]` framing prefix;
S→C records arrive wrapped in a conn3 message32 `[u32 0][u16 code][body]`). Bodies are
**little-endian** (Intel client). The 2-byte inner code prefix is the only big-endian field.

> **2026-06-17 live-client correction:** the `0x0305/0x0307` static-card rows below are a static
> parser/builder candidate and must not be treated as the active conn3 world-login `0x0304->0x0305`,
> `0x0306->0x0307` path. Corrected `FUN_004ba2b0` thiscall hooks saw those live bodies carry
> InformationSession/InformationCharacter-style data such as `Friedrich IV`; injecting the static-card
> builder bytes on that path did not populate the runtime command table. Keep these layouts documented,
> but do not bind them to the default server world-login walker without new runtime evidence.

> Template: this doc follows `docs/logh7-moveship-wire.md` and extends
> `docs/logh7-info-records-wire.md` (which already covers 0x0323 character, 0x031f base,
> NotifyBaseParameter). Those three are NOT re-derived here; this doc adds the rest of the family.

---

## 0. RE method recap (how every layout below was pinned)

Each record is a C++ class with an `Input_<Class>::input_from_stream` (binary parser, **the wire
layout**) and usually a dump-label serializer that names the fields.

**Stream-reader vtable legend** (the parsers call `(**(code**)(*stream + N))(dest)`), confirmed
across UnitShip/UnitTroop/Institution and cross-checked against the dump serializers:

| vtable slot | reads |
|---|---|
| `*stream + 0x1c` | **u32** (4 bytes) |
| `*stream + 0x20` | **u16** (2 bytes) |
| `*stream + 0x24` | **u8** (1 byte) |
| `*stream + 0x0c` | **float** (4 bytes) |
| `FUN_00610420(dst,n,…)` | raw `n`-byte copy from the stream cursor (used for packed/byte fields) |

**Dump-label serializer legend** (`FUN_00439da0(stream, fmt, LABEL[, value])`): the `LABEL`
string names the field; the `value` arg's cast gives the type (`*(u8*)`, `*(undefined2*)`=u16,
`*(undefined4*)`=u32, `*(float*)`). Confidence is **high** when both parser and dump agree.

**Size cross-check (decisive).** Every record's `max_count × stride (+ small count header)` equals
the dispatch-declared body size in the catalog — this independently confirms each stride:

| Message | Code | max | stride | calc | dispatch | ✓ |
|---|---|---|---|---|---|---|
| ResponseStaticInformationCard | 0x305 | 300 | 0x46 (70) | 21000+2 | 0x520a (21002) | ✓ |
| ResponseStaticInformationCardCommand | 0x307 | 300 | 0xc4 (196) | 58800+2 | 0xe5b2 (58802) | ✓ |
| ResponseStaticInformationPowerDistribution | 0x309 | (fixed) | 0x55c | — | 0x55c | ✓ |
| ResponseStaticInformationUnitShip | 0x30b | 200 | 0x8c (140) | 28000+4 | 0x6d64 (28004) | ✓ |
| ResponseStaticInformationUnitTroop | 0x30d | 16 | 0x18 (24) | 384+4 | 0x184 (388) | ✓ |
| ResponseStaticInformationFighters | 0x30f | 4 | 0x0c (12) | 48+4 | 0x34 (52) | ✓ |
| ResponseStaticInformationArms | 0x311 | (fixed 27×8 u16) | — | 432 | 0x1b0 (432) | ✓ |
| ResponseInformationInstitution | 0x321 | 4 | 0x2378 (9080) | 36320+4 | 0x8de4 (36324) | ✓ |
| ResponseInformationWarehouse | 0x327 | 1 | — | — | 0x300 (768) | ✓ |
| ResponseInformationPackage | 0x329 | 1 | — | — | 0x154 (340) | ✓ |
| ResponseInformationOutfit | 0x32b | 100 | 0x1c (28) | 2800+4 | 0xaf4 (2804) | ✓ |
| ResponseGridInformationOutfit | 0x32d | 300 | 0x0c (12) | 3600+4 | 0xe14 (3604) | ✓ |
| ResponseInformationOutfitParty | 0x32f | 1 (big nested) | — | — | 0x8b04 (35588) | ✓ |
| ResponseOutfitInformationUnit | 0x331 | 70 | 0x58 (88) | 6160+4 | 0x1814 (6164) | ✓ |
| ResponseCardCharacter | 0x34f | 64 | 0x2d4 (724) | 46336+4 | 0xb504 (46340) | ✓ |

**Dispatcher store globals** (`FUN_004ba2b0`, `local_18` = clientBase): each record is bulk-copied
into a fixed global the screens read from.

| Code | Class | store global (clientBase+) | parser (binary) | dump serializer |
|---|---|---|---|---|
| 0x305 | StaticInformationCard | 0x3e0c8c | FUN_0040ee80 | (server-side only) |
| 0x307 | StaticInformationCardCommand | (cmd table) | FUN_0040f9f0 | (server-side only) |
| 0x309 | StaticInformationPowerDistribution | 0x4130a4 | — | **FUN_00410690** |
| 0x30b | StaticInformationUnitShip | 0x413600 region | FUN_004109a0 | (server-side only) |
| 0x30d | StaticInformationUnitTroop | 0x412f20 | FUN_004121f0 | **FUN_00412770** |
| 0x30f | StaticInformationFighters | 0x3f5ab4 | — | **FUN_00412d70** |
| 0x311 | StaticInformationArms | 0x3f5902 | — | **FUN_00412f90** |
| 0x321 | InformationInstitution | 0x3fb2f8 | **FUN_004167f0** | (server-side only) |
| 0x327 | InformationWarehouse | 0x3e098c | FUN_0041a870 | **FUN_0041aff0** |
| 0x329 | InformationPackage | 0x36a488 | FUN_0041b280 | **FUN_0041b990** |
| 0x32b | InformationOutfit | 0x3dfe98 | FUN_0041bbd0 | **FUN_0041c330** |
| 0x32d | GridInformationOutfit | 0x367e60 | — | **FUN_0041ca30** |
| 0x32f | InformationOutfitParty | 0x35f35c | (FUN_0041e…) | **FUN_0041eaa0** |
| 0x331 | OutfitInformationUnit | 0x368c74 | **FUN_0041f3d0** | (server-side only) |
| 0x34f | ResponseCardCharacter | 0x4271a8 | **FUN_00427160** | (reuses 0x0323) |

---

## 1. Personnel CARD catalog — the highest-playability sub-family

### 1a. ResponseCardCharacter `0x34f` (0xb504) — **ARRAY of the 724-byte character record**

- **Confidence: high.** Parser `FUN_00427160`; cap `< 0x41` (64, error
  `Input_ResponseCardCharacter … character_size … over than 64`); **element stride 0x2d4 = 724**
  (proven by the error indexer `iVar6 * 0x2d4` and `param_1 += 0x2d4`).
- **The element layout is byte-for-byte the `ResponseInformationCharacter` 0x0323 record** already
  fully documented in `docs/logh7-info-records-wire.md` §1 (47 fields, id@0x00, power@0x04,
  ability_8[8]@0x188, money@0x68, card[16]@0x250, …). The parser reads the same field offsets
  (id u32@+0x00, power/camp/state/sex bytes, begin_session_age@+0x08, fame@+0x10, … flagship@+0x24
  with a name[≤13], abilities, decorations, card slots) per element.

| off | type | field | meaning |
|---|---|---|---|
| 0x00 | u8 | count | number of character records (1..64) |
| 0x04 | struct[count] | characters[] | each = the 724-byte 0x0323 character record (see info-records-wire §1) |

> **Use:** this is how the server sends a batch of full character sheets (e.g. a faction's
> personnel roster / available-officer pool) in one message. Reuse the existing 0x0323 builder
> per element. Server store global `clientBase+0x4271a8`.

### 1b. ResponseStaticInformationCard `0x305` (0x520a) — static-card candidate, not the live world-login `0x0305`

- **Confidence: structure high, field semantics medium** (no dump-label serializer is compiled in;
  names inferred from class + parser shape). Parser `FUN_0040ee80`; outer **count u16 @0x00**,
  cap `< 0x12d` (300); **element stride 0x46 = 70 bytes** (`param_1 += 0x23` ushorts).
- Per element the parser reads, then a **variable u16 list** (the per-card command factory list)
  whose length is a u8 capped at 24 (`Input_StaticInformationCard … command_size over than 24`).
  2026-06-17 live G006 correction: the command list is at **record+0x14/+0x16**, not the older
  `+0x24/+0x26` note. `FUN_004f5cb0` reads the runtime table row count at `record+0x14` and factory
  ids at `record+0x16`; rendered widget ids are `factory + 0x43` (so widgets `110/112` correspond to
  factories `0x2b/0x2d`). A direct memory positive control at runtime `table+0x1e/+0x20` made
  `FUN_004f5cb0(0)` produce two menu rows, while the old offsets left category 0 empty.

Element layout (offsets relative to element base, LE):

| off | type | field (inferred) | evidence |
|---|---|---|---|
| 0x00 | u32 | card_id / index | first id slot; server writes the full dword even when ids fit u16 |
| 0x02 | u8 | b02 (kind?) | `FUN_00610420(+2,1)` byte |
| 0x03 | u8 | b03 (category?) | `FUN_00610420(+3,1)` byte |
| 0x04 | u8 | b04 | `FUN_00610420(+0?,1)` packed byte |
| 0x05 | u8 | b05 | `FUN_00610420(+1,1)` packed byte |
| 0x06 | u16 | w06 | generic packed short |
| 0x08 | u16 | w08 (achievement?) | `(*+0x20)(+2 ushort)` |
| 0x0a | u8 | b0a | generic packed byte |
| 0x0b | u8 | b0b | generic packed byte |
| 0x0c | u8 | b0c | generic packed byte |
| 0x0e | u16 | w0e | generic packed short |
| 0x10 | u8 | b10 | `FUN_00610420(+4 ushort,1)` |
| 0x12 | u16 | w12 | generic packed short |
| 0x14 | u8 | command_count | live `FUN_004f5cb0` row count, cap ≤ 24 |
| 0x16 | u16[command_count] | command_factories[] | live `FUN_004f5cb0` factory ids; widget id = factory + 0x43 |

> Field names for the small packed header are still medium/low confidence, but the 70-byte stride and
> the command-list offsets above are now live-pinned. Do not reintroduce `+0x24/+0x26` without a newer
> client trace that proves the old interpretation. Also do not route this builder through the current
> conn3 `0x0304->0x0305` world-login walker; P56 live evidence says that code-family collision is wrong.

### 1c. ResponseStaticInformationCardCommand `0x307` (0xe5b2) — static-card command candidate

- **Confidence: structure high.** Parser `FUN_0040f9f0`; outer **count u16 @0x00**, cap `< 0x12d`
  (300); **element stride 0xc4 = 196 bytes** (`puVar5 += 0x62` ushorts). Each element has an inner
  command array: **count u8 @element+0x02**, cap ≤ 24 (`Input_StaticInformationCardCommand …
  command_size over than 24`), inner **stride 8 bytes** (`puVar8 += 4` ushorts).
- Inner entry reads: `id u16 @ +0`, then `FUN_00610420(+2,3)` (a 3-byte packed field),
  `FUN_00610420(+5,2)` (2-byte), `FUN_00610420(+7,1)` (1-byte) — i.e. an 8-byte command descriptor
  `{ id:u16, packedA:u24, packedB:u16, flag:u8 }`.

| off | type | field | meaning |
|---|---|---|---|
| 0x00 | u16 | card_id | element header (the card these commands belong to) |
| 0x02 | u8 | command_count | ≤ 24 |
| 0x04 | struct[command_count] | commands[] (stride 8) | `{id u16, packed u24, w u16, flag u8}` per command |
| … | — | (record padded to 196 B) | unused slots zero |

> This is the per-card "what orders this appointment can issue" table. Semantics of the packed
> sub-fields (cost / target-type / cooldown) are **low confidence** without the label dump.

---

## 2. Unit / weapon MASTER data (immutable game tables)

### 2a. ResponseStaticInformationUnitShip `0x30b` (0x6d64) — ship-class master

- **Confidence: structure high, names high** (binary parser `FUN_004109a0` + class label
  `Input_StaticInformationUnitShip … name_size over than 13`). Outer **count u8 @0x00**, cap `< 0xc9`
  (200); **element stride 0x8c = 140 bytes** (`param_1 += 0x8c`; error indexer `*0x8c`).
- Each element starts `{ u16 kind, u8, u8, u16, u16 }` header, then a **name[≤13]** (u8 len@+6 then
  that many u16 chars — wide-char), followed by ~30 stat fields (mix of u16, u32@+0x26, and two
  floats read via `(*+0xc)` at +0x36 and +0x3a, an 11-entry u16 block @+0x3e, etc.).

Element wire order (from the parser, offsets relative to element base; **names are positional —
this is the ship spec sheet**):

| off | type | field | evidence |
|---|---|---|---|
| 0x00 | u16 | kind (ship-class id) | `(*+0x20)(elem-2)` |
| 0x02 | u8 | b02 | `FUN_00610420(+0,1)` |
| 0x03 | u8 | b03 | `FUN_00610420(+1,1)` |
| 0x04 | u16 | w04 | `(*+0x20)(+2)` |
| 0x06 | u16 | w06 | `(*+0x20)(+4)` |
| 0x0c | u8 | name_len | `(*+0x24)(+6 ushort)`, cap ≤ 13 |
| 0x10 | u16[name_len] | name[≤13] | loop `(*+0x20)`, wide chars |
| 0x44 | u16 | w44 | `(*+0x20)(+0x22)` |
| 0x4c | u32 | d4c | `(*+0x1c)(+0x26)` |
| 0x54..0x67 | u16×~8 | stat block | `(*+0x20)` ×8 at +0x2a..+0x34 |
| 0x6c | float | f6c | `(*+0xc)(+0x36)` (speed / a continuous stat) |
| 0x74 | float | f74 | `(*+0xc)(+0x3a)` |
| 0x7c | u16[11] | block11 | `(*+0x20)` ×11 from +0x3e |
| … | u16/u32/float/u8 mix | tail stats to +0x88 | reads at +0x54..+0x88 (offence/defence/armor/cost/etc.) |

> The exact economic/combat meaning of each stat slot (offence, defence, armor, build-cost,
> crew, supply-capacity) needs the server-side `_INF:ResponseStaticInformationUnitShip` label dump
> (not compiled into the client) or a capture; the **140-byte stride, the name[13], the two floats,
> and the field types** are solid. This table parallels `model/Ship` roster in `content/` — match
> by `kind`.

### 2b. ResponseStaticInformationUnitTroop `0x30d` (0x184) — ground-troop class master

- **Confidence: high** (parser `FUN_004121f0` + dump `FUN_00412770` agree field-for-field).
  Outer **count u8 @0x00**, cap ≤ 16; **element stride 0x18 = 24 bytes**.

| off | type | field | label (dump) |
|---|---|---|---|
| 0x00 | u16 | kind | `s_kind_` |
| 0x02 | u8 | type | `s_type_` |
| 0x03 | u8 | category | `s_category_` |
| 0x04 | u16 | achievement | `s_achievement_` |
| 0x06 | u16 | practice | `s_practice_` |
| 0x08 | u16 | practice_cost | `s_practice_cost_` |
| 0x0a | u16 | resources | `s_resources_` |
| 0x0c | float | speed | `s_speed_` (`*(float*)(pbVar1+10)` / parser `*+0xc`) |
| 0x10 | u16 | offence | `s_offence_` |
| 0x12 | u16 | defence | `s_defence_` |
| 0x14 | u16 | (tail stat) | dump field after defence |

### 2c. ResponseStaticInformationFighters `0x30f` (0x34) — fighter/spartanian master

- **Confidence: high** (dump `FUN_00412d70`). Outer **count u8 @0x00**, cap ≤ 4; **stride 0x0c = 12**.

| off | type | field | label |
|---|---|---|---|
| 0x00 | u16 | kind | `s_kind_` |
| 0x02 | u16 | airbattle | `s_airbattle_` |
| 0x04 | u16 | antiship | `s_antiship_` |
| 0x06 | u16 | defence | `s_defence_` |
| 0x08 | float | cruising | `s_cruising_` (`s_%3f_` float fmt) |

### 2d. ResponseStaticInformationArms `0x311` (0x1b0) — weapon hit/spread table

- **Confidence: high** (dump `FUN_00412f90`). **Fixed table, no count**: `information_27` =
  **27 weapon rows**, each `hit[8]` = **8 u16** → 27×8×2 = 432 = 0x1b0 exactly. Pure 2-D u16 array
  `arms[27][8]` (weapon × range/angle-bucket hit values). Stride per row = 16 bytes.

### 2e. ResponseStaticInformationPowerDistribution `0x309` (0x55c) — ship-perf curve table

- **Confidence: high** (dump `FUN_00410690`). **NOT a faction roster** — it is the global
  ship/weapon **performance-curve** table (one fixed blob, stored at `clientBase+0x4130a4`).
  Field walk (offsets in the float-base struct `param_1`):

| region | off (float idx) | type | field (label) |
|---|---|---|---|
| move | +0x00 | float[11] | `move[11]` |
| warp | +0x2c | u8[2] | `warp[2]` |
| sensor | +0x30 | float[4] | `sensor[4]` |
| shield | +0x40 | float[11][9] | `shield[11].fillup[9]` (each a `time` float) |
| beam | +0x1cc | u16[14][20] | `beam[14].fillup[20]` (each a `value` u16) |
| gun | … | u16[11][16] | `gun[11].fillup[16]` (each a `value` u16) |

> Total walks out to 0x55c. These are the global recharge/fill curves the tactical sim uses for
> shield regen, beam charge, and gun reload — the same constants the battle engine needs.

---

## 3. Facilities / economy buildings — ResponseInformationInstitution `0x321` (0x8de4)

- **Confidence: structure high** (binary parser `FUN_004167f0`); **names medium** (the
  `_INF:ResponseInformationInstitution` dump is server-side only; the labeled field set
  防衛/造兵/対空/衛星 is known from constmsg UI + the existing info-records doc).
- **3-level nested record.** Outer = per-base; this is where a system's **defense / shipyard /
  anti-air / satellite facilities** live.

```
outer:  count u8 @0x00, cap < 5 (max 4 bases)            element stride 0x2378 (9080B)
  base element:
    +0x00 u32 (base id / d04)                            (*+0x1c)
    +0x08 u8 institution_count, cap < 0x25 (max 36)      (*+0x24)  "institution_size over than 36"
    institution[] stride 0xfc (252B):
        +0x00 u16 (kind)                                 (*+0x20)
        +0x04 u32 (d04)                                  (*+0x1c)
        +0x08 u8 spot_count, cap < 0x15 (max 21)         (*+0x24)  "Institution … over than 20"
        spot[] stride 0xc (12B):
            +0x04 u16   (*+0x20)
            +0x08 u32   (*+0x1c)
            +0x0c u16   (*+0x20)
```

> Each base carries up to 36 facility records; each facility carries up to ~21 emplacement/spot
> sub-records. The facility `kind` selects 防衛施設 / 造兵工廠(shipyard) / 対空砲 / 戦闘衛星 etc.;
> the u32 fields are the per-facility level / hp / production values (exact mapping needs the
> server label dump). Store global `clientBase+0x3fb2f8`. **This is the primary economy-building
> record** the server must populate for the 内政 facility screens.

---

## 4. Warehouse / Package logistics (fully labeled)

### 4a. ResponseInformationWarehouse `0x327` (0x300) — base stockpile

- **Confidence: high** (dump `FUN_0041aff0`, parser `FUN_0041a870`). Single record (`param_1` =
  `u32*`; offsets below are byte offsets = `param_1[idx]`).

| off | type | field | label |
|---|---|---|---|
| 0x00 | u32 | base | `s_base_` |
| 0x04 | u32 | outfit | `s_outfit_` |
| 0x08 | u32 | index | `s_index_` |
| 0x0c | u8 | ships_count | `s_ships[%d]` cap ≤ 99 |
| 0x10 | struct[ships_count] (stride 6) | ships[] | `{ kind u16, unit_number u8, boat_number u16 }` |
| 0x260 | u8 | troops_count | `s_troops[%d]` cap ≤ 24 (`param_1[0x98]`) |
| 0x264 | struct[troops_count] (stride 6) | troops[] | `{ kind u16, troop_grade u8, unit_number u16 }` |
| 0x2f4 | u32 | supplies | `s_supplies_` (`param_1[0xbd]`) |
| 0x2f8 | u32 | food | `s_food_` (`param_1[0xbe]`) |
| 0x2fc | u32 | mineral | `s_mineral_` (`param_1[0xbf]`) — record ends 0x300 |

> Economically meaningful: `supplies / food / mineral` are the base's stored resources;
> `ships[]/troops[]` are the parked reserve units. Store global `clientBase+0x3e098c`.

### 4b. ResponseInformationPackage `0x329` (0x154) — transfer manifest

- **Confidence: high** (dump `FUN_0041b990`, parser `FUN_0041b280`).

| off | type | field | label |
|---|---|---|---|
| 0x00 | u32 | base | `s_base_` (source) |
| 0x04 | u32 | target_base | `s_target_base_` (destination) |
| 0x08 | u8 | other_package_count | `s_other_package[%d]` cap ≤ 3 |
| 0x0c | struct[count] (stride 12) | other_package[] | `{ kind u8, unit_kind u16, troop_grade u8, package_number u32 }` |
| 0x30 | u8 | troop_package_count | `s_troop_package[%d]` cap ≤ 24 (`param_1[0xc]`) |
| 0x34 | struct[count] (stride 12) | troop_package[] | `{ kind u8, unit_kind u16, troop_grade u8, package_number u32 }` |

> The in-transit logistics package (what's being shipped base→base). Store global
> `clientBase+0x36a488`.

### 4c. Implementation confirmation (2026-06-16) — `src/server/logh7-warehouse-record.mjs`

Both records were implemented (`buildResponseInformationWarehouseInner` / `buildResponseInformationPackageInner`,
wired req 0x0326→0x0327 and 0x0328→0x0329 in `logh7-login-session.mjs`) after re-pinning the offsets directly
against the Ghidra export (`tools/logh7_redex.py func …`). Three-way agreement per record:

- **Body sizes pinned by the dispatcher copy count** (`FUN_004ba2b0`): case 0x327 copies `iVar16 = 0xc0`
  (192) dwords = **0x300 (768B)**; case 0x329 copies `iVar16 = 0x55` (85) dwords = **0x154 (340B)**.
- **`supplies/food/mineral` doc contradiction RESOLVED — there was none.** §4a's `param_1[0xbd]/[0xbe]/[0xbf]`
  (the dump serializer `FUN_0041aff0` uses a `u32*` cursor) and `docs/logh7-implementation-roadmap.md` L198's
  `0x2f4/0x2f8/0x2fc` are the **same bytes**: 0xbd*4 = 0x2f4, 0xbe*4 = 0x2f8, 0xbf*4 = 0x2fc. The binary parser
  `FUN_0041a870` reads them as `(*+0x1c)(iStack_10 + 0x2f4 / +0x2f8 / +0x2fc)` — byte offsets — confirming
  **0x2f4/0x2f8/0x2fc** is the canonical layout. `record ends 0x300`. Both notations are kept in the §4a table.
- **Array-entry base nuance.** Each entry's `kind` sits 2 bytes BEFORE the parser's loop cursor (the cursor
  `iVar6`/`puVar6` starts past the kind). So warehouse `ships[0].kind` is at **0x0e** (cursor 0x10 − 2),
  `troops[0].kind` at **0x262** (cursor 0x264 − 2); package `other_package[0].kind` at **0x0c** (cursor 0x0e − 2),
  `troop_package[0].kind` at **0x34** (cursor 0x36 − 2). The §4a/§4b tables' "ships[] @0x10 / troops[] @0x264"
  point at the cursor (= unit_number byte for warehouse / unit_kind for package), not the entry base — the
  builder writes from the entry base so kind/unit_number/boat_number land at +0/+2/+4.
- **Caps** (parser guards, hard client-side reject on overflow): ships ≤ 99 (`< 100`), warehouse troops ≤ 24
  (`< 0x19`), other_package ≤ 3 (`< 4`), troop_package ≤ 24 (`< 0x19`). The builder clamps each.
- **Names are HIGH** for every field (both records have a compiled-in dump-label serializer), so no `fieldNN`
  provisionals are needed here — unlike the unlabeled 0x031f/0x0321 scalars.

---

## 5. Fleet / outfit organisation (the 艦隊編成 records)

### 5a. ResponseInformationOutfit `0x32b` (0xaf4) — outfit (fleet) roster summary

- **Confidence: high** (dump `FUN_0041c330`, parser `FUN_0041bbd0`). Outer **count u8 @0x00**,
  cap ≤ 100; **element stride 0x1c = 28 bytes**.

| off | type | field | label |
|---|---|---|---|
| 0x00 | u32 | id | (`&DAT_…`, the outfit id) |
| 0x04 | u8 | kind | `s_kind_` |
| 0x05 | u8 | power (陣営) | `s_power_` |
| 0x06 | u8 | camp | `s_camp_` |
| 0x07 | u8 | index | `s_index_` |
| 0x08 | u16 | achievement | `s_achievement_` |
| 0x0c | u32 | strategy_id | `s_strategy_id_` |
| 0x10 | u8 | practice_warp | `s_practice_warp_` |
| 0x11 | u8 | practice_speed | `s_practice_speed_` |
| 0x12 | u8 | practice_command | `s_practice_command_` |
| 0x13 | u8 | practice_offence | `s_practice_offence_` |
| 0x14 | u8 | practice_defence | `s_practice_defence_` |
| 0x15 | u8 | practice_antiaircraft | `s_practice_antiaircraft_` |
| 0x16 | u8 | practice_search | `s_practice_search_` |
| 0x17 | u8 | practice_deception | `s_practice_deception_` |
| 0x18 | u8 | practice_landbattle | `s_practice_landbattle_` |
| 0x19 | u8 | practice_airbattle | `s_practice_airbattle_` |

> The 10 `practice_*` are the fleet's trained-skill levels (内政 personnel/training screen). Store
> global `clientBase+0x3dfe98`.

### 5b. ResponseGridInformationOutfit `0x32d` (0xe14) — per-grid outfit presence

- **Confidence: high** (dump `FUN_0041ca30`). Outer **count u16 @0x00**, cap ≤ 300; **stride 0x0c
  = 12 bytes**.

| off | type | field | label |
|---|---|---|---|
| 0x00 | u32 | id (outfit id) | (`&DAT_…`) |
| 0x04 | u8 | kind | `s_kind_` |
| 0x05 | u8 | power | `s_power_` |
| 0x06 | u8 | camp | `s_camp_` |
| 0x07 | u8 | index | `s_index_` |
| 0x08 | u32 | supplies | `s_supplies_` |

> The compact "which fleets are on this map-cell + their supply" list. Store global
> `clientBase+0x367e60`.

### 5c. ResponseInformationOutfitParty `0x32f` (0x8b04) — full fleet composition

- **Confidence: high** (dump `FUN_0041eaa0`, parser caps from `Input_ResponseInformationOutfitParty`
  error strings). Single big nested record (~35 KB). Header then several variable arrays:

```
header:
  +0x00 u32 outfit            (s_outfit_)
  +0x04 u32 base              (s_base_)
  +0x08 u8  mode              (s_mode_)
  +0x09 u8  power             (s_power_)
  +0x0a u8  camp              (s_camp_)
  +0x0c u32 kind              (s_kind_)
  +0x10 u32 index             (s_index_)
  +0x14 u8  characters_count  (s_characters[%d], cap ≤ 10)
characters[] stride 0x24 (36B): { id u32, kind u8, rank u8, display_name(u8 len + u16[≤13]) }
ships[] (after characters): count u8 (cap ≤ 60), stride 0x120 (288B):
        { kind u16, unit_number u8, boat_number u16, units(u8 len + u32[≤70]) }
troops[] : count u8 (cap ≤ 24), stride 6: { kind u16, troop_grade u8, unit_number u16 }
+ supplies u32, max_supplies u32, package u16
other_packages[]   : count u8 (cap ≤ 3),  stride 12 (kind/unit_kind/troop_grade/package_number)
troop_packages[]   : count u8 (cap ≤ 24), stride 12
transport_package_empty_size u8, troop_transport_package_empty_size u8, carrying u8
not_together_ships[]  : count u8 (cap ≤ 60), stride 0x120 (same shape as ships[])
not_together_troops[] : count u8 (cap ≤ 24), stride 6
```

> This is the authoritative **complete fleet manifest**: which officers (characters) command it,
> every ship unit + the boats/units inside, ground troops, supply level, and the transport
> packages it is carrying. The single most important record for rendering a fleet's org screen.
> Store global `clientBase+0x35f35c`. `supplies/max_supplies` are the directly economic fields.

#### 5c-impl. Implementation confirmation (2026-07-17) — `src/server/codec/outfit-party-record.mjs`

The dedicated `0x032f` builder (`buildResponseInformationOutfitPartyInner`) is implemented and wired
`req 0x032e → resp 0x032f` in `logh7-world-session.mjs` (same interception pattern as `0x032a`, plus a
routing-recognition fallback in `ADMISSION_DEDICATED_BUILDERS`). Before this, `0x032e` was unregistered
so the fleet-info member-list panel bound to a zero-count record ("NO DATA").

- **Wire is a compact-cursor stream inside the fixed 0x8b04 (35588B) frame**, byte-for-byte like the
  sibling `0x0327` warehouse (§4c): the dispatcher bulk-copies the body to `clientBase+0x35f35c` and the
  parser reads it with a compact cursor into the *padded* native cache, so the wire carries **no native
  alignment padding**. The header offsets in §5c (`+0x00…+0x14`) are the native cache offsets; the wire
  header is compact 19B (`outfit u32, base u32, mode u8, power u8, camp u8, kind u32, index u32`) followed
  by `characters_count u8`, then the length-prefixed arrays in the §5c order.
- **Endianness = compact big-endian**, following the live-confirmed warehouse convention (B71: body first
  u32 = `00000046` = base 70 = u32BE). `name` chars (u16) are read by the same stream reader
  (`*stream+0x20`) so they are u16BE too. A single `options.wireEndian='le'` toggle flips everything if a
  live capture shows reversed numbers/names.
- **Caps (parser hard-reject)** the builder clamps: characters ≤ 10 (name ≤ 13 u16), ships ≤ 60
  (units ≤ 70), troops ≤ 24, other_packages ≤ 3, troop_packages ≤ 24, not_together_ships ≤ 60,
  not_together_troops ≤ 24. Max compact content ≈ 35145B ≤ 35588B (wire ≤ native, as expected).
- **No-fabrication projection.** `characters[]` = the fleet's real command officer (player character:
  id/rank/display_name from the seed), which is what the member-list widget binds to. `ships/troops/
  packages` have no domain source yet → count 0. `supplies/max_supplies` stay 0 (economy unimplemented is
  canon, manual p9). Header: `outfit=unitId`, `base=`current-system id, `power/camp=`faction; `kind/index`
  unbacked → 0. Names use the same `charCodeAt`→u16 encoding as the `0x0323` character record (no CP932→UTF
  transcoding).
- Unit tests: `tests/logh7-outfit-party-record.test.mjs` (fixed size, full round-trip via a client-like
  compact BE parser, member-list projection, cap clamping, scalar saturation).

### 5d. ResponseOutfitInformationUnit `0x331` (0x1814) — per-unit detail in an outfit

- **Confidence: high** (parser `FUN_0041f3d0`). Outer **count u8 @0x00**, cap ≤ 70; **element
  stride 0x58 = 88 bytes**. Each element = an `InformationUnit` sub-record:
  `{ u32 id, u16, u8(packed), u32, u32, u32, u8 boats_count(cap ≤ 10), u32[boats_count] boats,
  u32, …, two u16 + float tail }`. The boat list is the per-ship complement.

| off | type | field | evidence |
|---|---|---|---|
| 0x00 | u32 | unit_id | `(*+0x1c)(elem-1)` |
| 0x04 | u16 | w04 | `(*+0x20)` |
| 0x08 | u8 | b08 | `FUN_00610420(+2,1)` |
| 0x04..0x0c | u32×3 | d-fields | `(*+0x1c)` ×3 |
| 0x10 | u8 | boats_count | `(*+0x24)`, cap ≤ 10 (`Input_InformationUnit … over than 10`) |
| 0x14 | u32[boats_count] | boats[] | loop `(*+0x1c)` |
| 0x3c | u32 | dtail | `(*+0x1c)(+0xf)` |
| 0x40/0x41 | u8×2 | packed | `FUN_00610420(+0x10,1)`,`(+0x41,1)` |
| 0x44 | u16 | w44 | `(*+0x20)(+0x42)` |
| 0x46 | u16 | w46 | `(*+0x20)(+0x11)` |
| 0x48/0x4c | u32×2 | d-fields | `(*+0x1c)` ×2 |
| 0x50 | float | f50 | `(*+0xc)(+0x14)` |

> Store global `clientBase+0x368c74`. Field names beyond `unit_id`/`boats[]` are medium confidence
> (no label dump).

---

## 6. Server to-do (what the authoritative server must produce / do)

These are all **S→C read-model** records — the server is the data source; there is no client→server
mutation in this family (mutations come from the Command* family 0x4xx/0x9xx/0xbxx/0xcxx, which
then trigger the server to re-broadcast the relevant Notify/Information record). Server work:

- [ ] **Static master tables (send once at world-load / on request):** build and cache
      `0x309 PowerDistribution`, `0x30b UnitShip`, `0x30d UnitTroop`, `0x30f Fighters`,
      `0x311 Arms` from the content DB (`content/` ship/troop/weapon master + `model/Ship`). These
      are immutable; emit them in the world-init handshake (the client stores them at the globals in
      §0 and the tactical sim reads the curves directly). Stride/caps per the tables above.
- [ ] **Personnel cards:** `0x305 StaticInformationCard` + `0x307 StaticInformationCardCommand`
      remain parser/builder candidates for the 人事/card UI, but their live request/trigger path is not
      the conn3 world-login `0x0304/0x0306` walker. Find the real trigger before emitting them by default.
      Build from the card catalog only behind explicit RE evidence; respect caps (300 cards, ≤24 commands each).
      `0x34f ResponseCardCharacter` = batch of full 724-byte character sheets — reuse the existing
      0x0323 character builder per element, ≤64 per message; page if more.
- [ ] **Per-base economy/org (send on enter-base / on change):**
      `0x321 Institution` (facilities: defense/shipyard/AA/satellite — economy buildings),
      `0x327 Warehouse` (supplies/food/mineral + reserve ships/troops),
      `0x329 Package` (in-transit transfers). Recompute and re-send whenever a `Command*` mutates
      production/stock.
- [ ] **Fleet/outfit org (send on select-fleet / on reorganise):** `0x32b Outfit` (roster summary
      + training levels), `0x32d GridInformationOutfit` (per-cell presence + supply),
      `0x32f OutfitParty` (full manifest — officers/ships/troops/packages/supply),
      `0x331 OutfitInformationUnit` (per-ship boat complement). Re-emit after
      `CommandReorganization 0xc02`, `CommandSupplement 0xc05`, `CommandAssignment 0xc0b`,
      `CommandSupplyFleet 0x414`, `CommandCreateOutfit 0x903`.
- [ ] **Framing:** wrap each as conn3 message32 `[u32 0][u16 code][LE body]`. Respect the exact
      strides/caps (the client parser hard-rejects oversize counts → throws). Count headers: u16 for
      Card/CardCommand/GridOutfit, u8 for the rest, 4-byte aligned (the dispatch size includes the
      header padding shown in §0).
- [ ] **Endianness:** body little-endian; only the 2-byte inner code is big-endian.
- [ ] **Confidence flags:** UnitShip/Card/CardCommand/OutfitInformationUnit/Institution field
      **names** are medium/low (no client-side label dump). Strides, types, and array caps are
      high. For the labeled records (UnitTroop/Fighters/Arms/PowerDistribution/Warehouse/Package/
      Outfit/GridOutfit/OutfitParty) names are high. Confirm the medium ones with a live capture or
      by dumping the server-side `_INF:` label serializers if the original server binary surfaces.

---

## 7. Open questions

1. **Card / CardCommand field names** (0x305/0x307): the small packed bytes (kind/category/cost/
   target-type) are not labeled in the client; only structure is pinned. A capture of a real
   `ResponseStaticInformationCard` or the server label dump would name them.
2. **UnitShip stat slots** (0x30b): 140-byte spec sheet — which u16 is offence vs defence vs armor
   vs build-cost vs crew vs supply-capacity needs the label dump (the float at +0x6c is most likely
   `speed`; +0x74 a second continuous stat). Cross-reference `model/Ship` by `kind`.
3. **Institution facility `kind` enumeration** (0x321): the u32 sub-fields per facility (level / hp
   / productivity) are positionally pinned but unnamed; map `kind`→{防衛/造兵/対空/衛星} via the
   constmsg UI labels (ids 2000-3100) and a capture.
4. **OutfitParty exact byte offsets of the tail scalars** (supplies/max_supplies/package and the
   *_empty_size bytes): pinned to the in-memory struct walk (`puVar2[0x1166]…`), which equals the
   wire order, but absolute wire offsets depend on the preceding variable arrays — compute them
   sequentially when building (the arrays are length-prefixed, so a streaming builder reproduces
   them exactly).
5. **Whether 0x34f CardCharacter pages** when a faction has >64 officers (cap is hard at 64) — the
   server likely sends multiple 0x34f messages or uses `0x1202 NotifySimpleInformationCharacter`
   for the bulk roster and 0x34f for a focused subset.

---

## Evidence index (Ghidra addrs, `.omo/ghidra/export/G7MTClient/`)

- Dispatcher / store globals: `FUN_004ba2b0` (cases 0x305–0x34f).
- Binary parsers (wire layout): `FUN_0040ee80` Card, `FUN_0040f9f0` CardCommand, `FUN_004109a0`
  UnitShip, `FUN_004121f0` UnitTroop, `FUN_004167f0` Institution, `FUN_0041a870` Warehouse,
  `FUN_0041b280` Package, `FUN_0041bbd0` Outfit, `FUN_0041f3d0` OutfitInformationUnit,
  `FUN_00427160` CardCharacter.
- Dump-label serializers (field names): `FUN_00410690` PowerDistribution, `FUN_00412770`
  UnitTroop, `FUN_00412d70` Fighters, `FUN_00412f90` Arms, `FUN_0041aff0` Warehouse, `FUN_0041b990`
  Package, `FUN_0041c330` Outfit, `FUN_0041ca30` GridOutfit, `FUN_0041eaa0` OutfitParty.
- Stream-reader helper: `FUN_00610420` (raw n-byte read); label helper `FUN_00439da0`.
- Error/cap strings: `.../strings.tsv` (`Input_<Class>::input_from_stream … over than N`).

## Related docs
- `docs/logh7-info-records-wire.md` — 0x0323 character (= 0x34f element), 0x031f base,
  NotifyBaseParameter economy. The CardCharacter element reuses the 0x0323 layout verbatim.
- `docs/logh7-moveship-wire.md` — wire-spec style template + LE/framing conventions.
- Memory: `logh7-info-records-wire`, `logh7-message-code-scheme`, `logh7-content-db-and-catalog`,
  `logh7-manual-game-design`.
