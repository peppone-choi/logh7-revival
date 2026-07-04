# LOGH VII Client Data Structures — Reverse-Engineering Reference

Source of truth: the decompiled client `G7MTClient.exe`
(`.omo/ghidra/export/G7MTClient/`). Every field/constraint below is verified
against the actual client decompile (function addresses quoted), **not** against
the AI-written server source. Where the server contradicts the client, the
client wins and the discrepancy is called out.

Query tooling: `python tools/logh7_redex.py func 0x<addr>`,
`python tools/logh7_redex.py grep "<text>"`, or grep
`functions.jsonl`/`strings.tsv` directly.

> **Card-count offset alert (read first):** the client reads the per-character
> card/action-list count at **char+0x24c** (`FUN_00417390`:
> `pppuVar5 = param_1 + 0x24c; if (*(byte*)pppuVar5 < 0x11)`), array at
> **+0x254** (stride 8). The live action-list *staging* consumer `FUN_004c0400`
> reads its delta count at **rec+0x250**. These are two distinct reads in two
> distinct code paths; the 0x24c-vs-0x250 conflict is resolved per-path in
> §4. The byte at +0x250 is a 4-byte gap/scalar between the count (+0x24c) and
> the array (+0x254) in the 0x0323/InformationCharacter parser.

---

## 1. Character record — `0x0323 ResponseInformationCharacter`

Total record size = **0x2d4 = 724 bytes** (dispatcher `FUN_004ba2b0` case 0x323
strides `+0x36a8b4 + count*0x2d4`; size table `FUN_004b8b00` case 0x323 →
0x2d4). Dump-serializer `FUN_00419300` (header `_INF:ResponseInformationCharacter`
0x761208) types every field; dispatcher `FUN_004ba2b0` cross-validates.

### Field table

| Field | Offset | Type | Meaning / constraint |
|---|---|---|---|
| `id` | 0x00 | u32 | character id. Own-char anchor: `FUN_004c2a80` compares `record[0] == *(clientBase+0x3584a0)` |
| `power` | 0x04 | u8 | 陣営/faction id (`s_power_` 0x75ef28) |
| `camp` | 0x05 | u8 | camp (`s_camp_` 0x75ef20) |
| `state` | 0x06 | u8 | state (`s_state_` 0x75ef64) |
| `field07` | 0x07 | u8 | unlabeled byte after state — INFERRED sex/state-like (`DAT_0075ef0c`) |
| `begin_session_age` | 0x08 | u32 | (`s_begin_session_age_` 0x7611f4) |
| `birthday_month` | 0x0c | u8 | (`s_birthday_month_` 0x75eefc) |
| `birthday_day` | 0x0d | u8 | (`s_birthday_day_` 0x75eeec) |
| `fame` | 0x10 | u32 | (2-byte pad 0x0e–0x0f) (`s_fame_` 0x75ef58) |
| `max_of_special` | 0x14 | u16 | (`s_max_of_special_` 0x7611e4) |
| `return_base` | 0x18 | u32 | (pad 0x16–0x17) (`s_return_base_` 0x7611d4) |
| `spot` | 0x1c | u32 | current system/spot id (`s_spot_` 0x7611cc) |
| `spot_owner` | 0x20 | u32 | spot owner (`s_spot_owner_` 0x7611c0) |
| `flagship` | 0x24 | u32 | flagship grid-unit id. `FUN_004c2a80` matches `piVar5[9]` vs unit list 0x41a368 (`s_flagship_` 0x7611b4) |
| `flagship_name_len` | 0x28 | u8 | name length in u16 units, **≤13** (`flagship_name_size over than 13`, 0x75f624) |
| `flagship_name` | 0x2a | u16[13] | UCS-2, region [0x2a,0x44)=26B (1B pad at 0x29) |
| `strategy` | 0x44 | u32 | (`s_strategy_` 0x7611a8) |
| `coup_conduct` | 0x48 | u32 | (`s_coup_conduct_` 0x761198) |
| `coup` | 0x4c | u32 | (`s_coup_` 0x761190) |
| `stat_0x50` | 0x50 | u32 | unlabeled command/leadership attr (server uses as pcp) — INFERRED (`DAT_00761188`) |
| `stat_0x54` | 0x54 | u32 | unlabeled command/leadership attr (server uses as mcp) — INFERRED (`DAT_00761180`) |
| `evaluation` | 0x58 | u32 | (`s_evaluation_` 0x761174) |
| `sendmail` | 0x5c | u16 | (`s_sendmail_` 0x761168) |
| `ai_operation` | 0x5e | u8 | (`s_ai_operation_` 0x761158) |
| `ai_strategy` | 0x5f | u8 | (`s_ai_strategy_` 0x761148) |
| `ai_commanded` | 0x60 | u8 | (`s_ai_commanded_` 0x761138) |
| `ai_suggested` | 0x61 | u8 | (`s_ai_suggested_` 0x761128) |
| `ai_announcement` | 0x62 | u8 | (`s_ai_announcement_` 0x761114) |
| `ai_tactics` | 0x63 | u8 | (`s_ai_tactics_` 0x761108) |
| `online` | 0x64 | u8 | (`s_online_` 0x761100) |
| `money` | 0x68 | u32 | (3B pad 0x65–0x67) (`s_money_` 0x7610f8) |
| `decoration_bits` | 0x6c | u8[16] | 128 decoration bits, region [0x6c,0x7c) (`s_decoration__s_` 0x7610e8) |
| `arrested` | 0x7c | u8 | (`s_arrested_` 0x7610dc) |
| `parentage_len` | 0x7d | u8 | parentage/ending entry count. Wire cap **≤1** (`ending_size over than 1`, 0x75f5cc); struct holds 2 slots |
| `parentage[2]` | 0x80 | struct[2] stride 0x84 | identity sub-records, region [0x80,0x188)=264B (2B pad 0x7e–0x7f) |
| `ability_8[8]` | 0x188 | struct[8] stride 4 | **FIXED 8** entries {`point` u16 @+0, `experience` u16 @+2}, region [0x188,0x1a8) |
| `influence` | 0x1a8 | u8 | (`s_influence_` 0x761094) |
| `stamina` | 0x1a9 | u8 | (`s_stamina_` 0x761088) |
| `special_ability_len` | 0x1aa | u8 | count, **≤80** (`s_special_ability__d__` 0x761070) |
| `special_ability` | 0x1ac | u16[80] | ids, region [0x1ac,0x24c)=160B=80*2 |
| `card_len` | **0x24c** | u8 | card/action-seat count, **≤16** (`card_size over than 16`, 0x763564) |
| (gap) | 0x250 | u32 | 4-byte scalar/gap between count and array |
| `card[16]` | 0x254 | struct[16] stride 8 | seat/card rows, region [0x254,0x2d4); per entry `{id/kind u32 @+0, value/role u32 @+4}` |
| `together` | 0x2d0 | u8 | last field (`*(u8)(puVar2+0xb4)`); record padded to 0x2d4 |

> Note: the 0x0323 dump-serializer `FUN_00419300` reads the card block as
> `kind=*(u16)(puVar9-1)`@0x250 / `spot=*(u32)puVar9`@0x254 stride 8 (puVar9 base
> 0x254), with `card_len` at `*(u8)(puVar2+0x93)`=0x24c. The *InformationCharacter*
> parser `FUN_00417390` reads `card_len` at +0x24c (gate `<0x11`) and the array
> as `{u32, u32}` stride 8 from +0x254. **Authoritative: count @0x24c, array
> @0x254 stride 8, entry = two u32, max 16.** See §4 for the full reconciliation.

### Sub-record: `parentage[].` (stride 0x84, base 0x80 / 0x104)

| Field | Offset (entry-rel) | Type | Constraint |
|---|---|---|---|
| `truth` | +0x00 | u8 | (`s_truth_` 0x7610c4) |
| `lastname_len` | +0x01 | u8 | ≤13 (`lastname_size over than 13`, 0x75f79c) |
| `lastname` | +0x02 | u16[13] | UCS-2 |
| `firstname_len` | +0x1c | u8 | ≤13 (`firstname_size over than 13`, 0x75f740) |
| `firstname` | +0x1e | u16[13] | UCS-2 |
| `display_name_len` | +0x38 | u8 | ≤13 (`display_name_size over than 13`, 0x75f6e0) |
| `display_name` | +0x3a | u16[13] | UCS-2 |
| `blood` | +0x54 | u16 | (`s_blood_` 0x75ee70) |
| `rank` | +0x56 | u16 | (`s_rank_` 0x75ee68) |
| `titlename_len` | +0x58 | u8 | ≤13 (`titlename_size over than 13`, 0x75f684) |
| `titlename` | +0x5a | u16[13] | UCS-2 |
| `face` | +0x74 | u32 | (`s_face_` 0x75ee60) |
| `rival` | +0x78 | u32 | (`s_rival_` 0x7610bc) |
| `myhome` | +0x7c | u32 | (`s_myhome_` 0x7610b4) |
| `achievement` | +0x80 | u32 | (`s_achievement_` 0x7607ac) |

### Constraints

- **Record size = 0x2d4 (724 B).** Dispatcher `FUN_004ba2b0` case 0x323 stride
  `+0x36a8b4 + count*0x2d4`; `local_20 += 0x2d4`; `FUN_004c2a80` `piVar5 += 0xb5`
  dwords = 0x2d4. There is **no** separate per-opcode size table — the size is
  the struct stride.
- **All name fields ≤ 13 UCS-2 units**, enforced by the wire parser
  `Input_InformationChargedCharacter::input_from_stream`
  (`*_size over than 13`: flagship 0x75f624, titlename 0x75f684,
  display_name 0x75f6e0, firstname 0x75f740, lastname 0x75f79c). Each name
  region is u16[13] = 26 bytes.
- **`ability_8` = FIXED 8 entries** (serializer hardcodes `param_3 = 8`
  countdown; not wire-counted). Per-entry stride 4 = {`point` u16 @+0,
  `experience` u16 @+2}. Manual ordering 統率/政治/運用/情報 (PCP) then
  指揮/機動/攻撃/防御 (MCP) is **external/manual attribution**, not in the
  decompile — the decompile only proves the fixed-8 stride-4 layout.
- `special_ability`: count u8 @0x1aa, slot capacity 80 (160B), entry u16 stride 2.
- `card`: count u8 **@0x24c** (gate `<0x11`), slot capacity 16, entry stride 8.
- `parentage`/ending wire count cap = **1** (`ending_size over than 1`); struct
  physically holds 2 slots (stride 0x84).
- `card[i]` second field is **u32 @+0x04** (single-witness from `FUN_00419300`;
  the dispatcher copies the card block as a raw 32-dword block and does not type
  internal fields). Bytes +0x02..+0x03 are an in-struct gap inside the 8-byte
  stride.

### Ownership note (character is the owner)

Command/faction lives on the **character**, not on a Base record: `power`@0x04,
`camp`@0x05, `spot`@0x1c, `spot_owner`@0x20, `return_base`@0x18,
`flagship`@0x24. `clientBase+0x3584a0` is a **separate** 4-byte slot holding the
locally-selected character id (written by dispatcher case 0x204:
`*(u32)(param_1+0x3584a0) = *param_3`) — it is **not** a record base. The record
array is at `clientBase+0x36a8b4` (stride 0x2d4, count @+0x36a5dc); the first
stored character is pushed into the world via `FUN_004c2c80(1, +0x36a5e0, 0)`.

### Evidence

- `FUN_00419300` (0x00419300) — dump-serializer. Card block:
  `card_len = *(u8)(puVar2+0x93)` = byte 0x24c; `puVar9 = puVar2 + 0x95`
  (=0x254); `kind = *(u16)(puVar9-1)` (0x250 — NOTE this is the serializer's
  *output* layout, see §4); `spot = *(u32)puVar9` (0x254); `puVar9 += 2` dwords
  (stride 8). Ability block: `psVar8 = puVar2 + 0x18a`, `param_3 = 8`
  countdown, `{point=psVar8[-1], experience=*psVar8}`, `psVar8 += 2`.
- `FUN_00417390` (0x00417390) — `Input_InformationCharacter` parser. L349:
  `pppuVar5 = param_1 + 0x24c; bVar2 = *(byte*)pppuVar5; if (bVar2 < 0x11)`;
  array loop from `iVar7 = param_1 + 0x254`, `read(iVar7-4); read(iVar7);
  iVar7 += 8`. (Card count @0x24c, array @0x254 stride 8.)
- Dispatcher `FUN_004ba2b0` case 0x323 — appends at `+0x36a8b4 + count*0x2d4`;
  last write `*(u8)(puVar18+0xb4)` = byte 0x2d0; increments `+0x36a5dc`. The
  copy STOPS at +0xb4 and **never writes +0x250/+0x254**, confirming the
  action-list seat is not part of the in-world 0x0323 card region.
- Selected-char slot: `f_4ba2b0.txt` case 0x204
  `*(u32)(param_1+0x3584a0) = *param_3`.

---

## 2. Fleet / unit — `0x0325 ResponseInformationUnit`

Unit table at `clientBase+0x41a368`; count u16 @ `clientBase+0x41a364`. Element
stride **0x58 (88 B)**, dual-parser-proven. Wire size FIXED **0xce44 (52804) =
4 + 600*0x58**; max **600 units**.

### Field table (element B; B = element origin)

| Field | Offset (B-rel) | Type | Meaning / constraint |
|---|---|---|---|
| `unit.id` | +0x00 | u32 | unit/fleet id. **ANCHOR**: matched vs char `flagship`@0x24 by `FUN_004c2a80` |
| `faction_state` | +0x04 | u16 | per-unit faction/state slot (P3 value-semantics; in-world faction color actually comes from the commander char, see ownership) |
| `name_region` | +0x06 | u16+ | name/short region (second region at +0x44) |
| `commander_cand` | +0x08 | u32 | P3. `FUN_004c32a0` compares unit+0x08 vs own-unit marker `clientBase+0x126714` |
| `cell_cand` | +0x0c | u32 | P3. `FUN_004c32a0` matches unit+0x0c vs base/spot table `clientBase+0x811fc` (stride 0x20, ~100 slots) |
| `owner_cand` | +0x10 | u32 | P3 — **NOT confirmed as a nation id** (no client read consumes it as such) |
| `boats_count` | +0x14 | u8 | sub-unit (troop_units) count, **≤10** (`troop_units_size over than 10`, 0x7637f4) |
| `boats_array` | +0x18 | u32[≤10] | sub-unit/ship ids making up the fleet (role-pinned by both parsers) |
| `field_3c` | +0x3c | u32 | P3 |
| `supply_cand` | +0x40 | u32 | P3 value-slot |
| `field_42_46` | +0x42..+0x46 | u8/u8/u16 | small fields / second name-flag region |
| `mapSection_cand` | +0x48 | u16 | P3 strategic-region candidate |
| `tail` | +0x4c/+0x50/+0x54 | u32/u32/f32 | numeric tail (last read via vtable float). Element padded to 0x58 |

> **P3 caveat:** the mid-field NAMES (faction@0x04, commander@0x08, cell@0x0c,
> owner@0x10, supply@0x40, mapSection@0x48) are LAYOUT-proven but value-SEMANTICS
> unproven — the `_INF:ResponseInformationUnit` serializer (0x7612a0) is
> **unreferenced** in the client export. Only `id`@0x00, `boats_count`@0x14,
> `boats_array`@0x18 (and the world-build reads of +0x04/+0x08/+0x0c) are
> semantically load-bearing. Labels like `boat_number`/`ships[%d]`/`mineral`
> belong to the SISTER record `ResponseInformationWarehouse` (`FUN_0041aff0`,
> header 0x761318), **not** the 0x58 unit element.

### Nation layer — `InformationSessionPower` (`FUN_004301d0`)

| Field | Offset | Type | Constraint |
|---|---|---|---|
| fleet roster count | power+0x28 | u8 | gate `< 0xe` → **≤14** entries |
| fleet roster | power+0x2a | u16[≤14] | per-nation numbered-fleet ids (Alliance 1st–13th + guard) |
| leaders (parentage) | power+0x80 (count@+0x7d) | parentage[≤3] | gate `< 3`, stride 0x84 (`Input_Parentage` 0x76369c) |
| powers per session | session-level | `InformationSessionPower[2]` | **exactly 2** (label `power[2]={` 0x761e58) |

### Constraints

- Unit table **max 600** (`600 < *(u16)(clientBase+0x41a364)` reject; parser
  guard `count < 0x259`; `information_size over than 600` 0x763848).
- Wire size FIXED **0xce44** (`FUN_004b8b00` case 0x325; dispatcher copies 0x3391
  dwords; 0xce44 = 4 + 600*0x58).
- Element stride **0x58**; count u16 @0x41a364, array @0x41a368.
- **boats per fleet ≤10** (`if (10 < count)`, 0x7637f4).
- **per-nation fleet roster ≤14** (`if (bVar1 < 0xe)`); **nation leaders ≤3**
  (`if (bVar1 < 3)`); **2 powers/session** (label `power[2]={`).
- PLAYER_INFO table: stride 0x370, max 600 slots, keyed by char id (slot+0x24);
  embeds char record at +0x24 and unit element (88B) at +0x318.
- char→unit link is **1:1**: `char.flagship`(char+0x24) == `unit.id`(unit+0x00).

### Fleet ownership model — NATION vs CHARACTER (verdict)

**Two layers coexist; the user's "nation-managed not one-per-character" claim is
PARTIALLY confirmed.**

1. **The unit-table element (0x58) is addressed/controlled per-CHARACTER.** The
   client links character→unit, not unit→nation. `FUN_004c2a80` (0x004c2a80)
   iterates the char array (`piVar5 = clientBase+0x36a8b4`, stride 0x2d4),
   matches the selected char (`*piVar5 == *(clientBase+0x3584a0)`), then
   inner-loops the unit table (`piVar4 = clientBase+0x41a368`, stride 0x58) and
   on `piVar5[9] == *piVar4` (char.flagship == unit.id) calls
   `FUN_004c2c80(0, charRecord)`. The in-world object's **faction/team color
   comes from the COMMANDER character, not the unit element**:
   `FUN_004c32a0` (0x004c32a0) sets `*(u8)(iVar9+10) = *(u8)(local_364+4)`
   (char.power@+0x04) and `*(u8)(iVar9+0xb) = *(char*)(local_364+5)`
   (char.camp@+0x05), where `local_364 = clientBase+0x36a8b4 + i*0x2d4`. **No
   client read consumes `unit+0x10` as a nation id.** (Edge case: when no
   commander record is found, faction falls back to the base/spot-table entry
   `clientBase+0x811fc`, never the unit's owner@+0x10 — this reinforces the
   conclusion.)

2. **The first-class NATION entity is `InformationSessionPower`**
   (`FUN_004301d0`, 0x004301d0), which holds a **bounded fleet roster**
   (`u16[≤14]` @power+0x2a, gate `if (bVar1 < 0xe)`) plus **≤3 leaders**, with
   **exactly 2 powers per session** (label `power[2]={` 0x761e58, session parser
   `FUN_00444900` loop `} while (iStack_174 < 2)`).

**Synthesis:** nations own a bounded roster of numbered fleets (national-level,
cap 14); within that roster each individual fleet/unit is *commanded* by a
character (the unit-table element, keyed by `char.flagship == unit.id`). It is
neither one-fleet-per-arbitrary-officer-with-no-nation, nor is the unit element
addressed by a nation id.

### Evidence (citations)

- `FUN_004c2a80` (0x004c2a80): char stride `piVar5 += 0xb5`; selected match
  `*piVar5 == *(param_1+0x3584a0)`; unit stride `piVar4 += 0x16`; link
  `if (piVar5[9] == *piVar4) FUN_004c2c80(0, piVar5)`.
- `FUN_004c32a0` (0x004c32a0): `iVar14 = param_1+0x41a368 + i*0x58`; faction from
  char `*(u8)(iVar9+10) = *(u8)(local_364+4)`, `*(char*)(iVar9+0xb) = char+0x05`.
- `FUN_004301d0` (0x004301d0): `bVar1 = *(u8)(param_1+0x28); if (bVar1 < 0xe)`
  u16 roster @+0x2a; `bVar1 = *(u8)(param_1+0x7d); if (bVar1 < 3)` parentage.
- `FUN_004b5b80`: `return *(u32)(param_1+0x24)` (PLAYER_INFO id@slot+0x24).
- `FUN_004c2c80` (0x004c2c80): param_2==2 loop `iVar9 < 600` stride 0x370,
  unit array copied to slot+0x318.
- strings.tsv: `power[2]={` 0x761e58; `troop_units_size over than 10` 0x7637f4;
  `information_size over than 600` 0x763848.

---

## 3. Roster & nation constraints (caps)

All caps below are enforced by the client wire parsers; exceeding any of them
makes the parser **bail on the whole message**.

| Constraint | Value | Where (client) |
|---|---|---|
| `MAX_ENTRY_CHARACTERS` (account entry chars) | **5** | `FUN_00407920` `if (bVar3 < 6)`; ids @acct+0x1ac stride 4; `entry_character_size over than 5` 0x75f7f8 |
| extension/charged-character slots | **2** | `FUN_00407920` acct+0x08 `if (bVar3 < 3)`; `extension_character_size over than 2` 0x75f850; record stride 0xcc |
| `CARD_CHARACTER_MAX` (per-char card array) | **16** | `FUN_00417390` char+0x24c `if (bVar2 < 0x11)`; `card_size over than 16` 0x763564 |
| `ResponseCardCharacter` roster | **64** | outer copy loop runs 0x40 times; `character_size over than 64` 0x764534 |
| sessions in picker (`LobbyResponseInformationSession`) | **64** | `FUN_00444900` `if (bVar2 < 0x41)`; record stride 0x14c; 0x766278 |
| **powers/nations per session** | **2 (FIXED)** | `FUN_00444900` `} while (iStack_174 < 2)`; label `power[2]={` 0x761e58 |
| nation fleet roster | **14** | `FUN_004301d0` power+0x28 `if (bVar1 < 0xe)` |
| nation leaders (parentage) | **3** | `FUN_004301d0` power+0x7d `if (bVar1 < 3)` |
| world char roster | **~600** | `FUN_004c2a80` `if (600 < local_8)`; `ResponseTacticsCharacter character_size over than 600` |
| `NotifyBaseParameter` budget (per-system funds) | **6** | `FUN_00438390` +0xc `if (bVar1 < 7)`; budget u32[] @+0x10; `budget_size over than 6` 0x765040 |
| `ResponseInformationBase` base elements | **4** | stride 0x180 @clientBase+0x3facf8; owner bytes elem+0x04/+0x05 |
| `move_character` (Resign/Dismiss/RankUp/Down) | **32** | `move_character_size over than 32` 0x7658f8 |
| `ResponseAllCharacter` id_size | **2000** | 0x7644e4 |
| `ResponseUnChargeCharacter` id_size | **1000** | 0x75f8ac |
| special_ability per char | **80** | char+0x1aa, `if (bVar1 < 0x51)` |

### Notes

- **Character id is a raw u32 with NO value-range validation.** Dispatcher case
  0x204 stores it verbatim (`*(u32)(param_1+0x3584a0) = *param_3`);
  `FUN_004c2a80` compares it by **equality only**. The server's id space (incl.
  0x4000+) is unconstrained by the client.
- **Nation funds/budget are modeled PER-SYSTEM** via `NotifyBaseParameter`
  (`country_budget=`/`country_supplies=` labels 0x764c48/0x764c34), **not** as a
  top-level nation struct. Ownership of fleets/bases/officers is derived from
  each character/unit's `power`/`camp`, aggregated under one of the 2 session
  powers.
- **Phezzan must be NEUTRAL, not a 3rd session power.** The session power table
  is fixed at 2. A 3-faction map is OK only if Phezzan is a neutral tag on
  characters/bases and never a 3rd `InformationSession` power entry.

---

## 4. card_len 0x24c-vs-0x250 conflict — RESOLUTION

Three distinct code paths touch this region; the conflict only exists because
prior docs/server conflated them.

### Path A — `0x0323`/`InformationCharacter` parse & store (AUTHORITATIVE for the record)

- **Count: char+0x24c (u8), gate `< 0x11` (≤16).**
  `FUN_00417390` L349: `pppuVar5 = param_1 + 0x24c; bVar2 = *(byte*)pppuVar5;
  if (bVar2 < 0x11)`. Dump-serializer `FUN_00419300`: `card_len =
  *(u8)(puVar2+0x93)` = 0x24c.
- **Array: char+0x254, stride 8, entry = two u32** `{id/kind u32 @+0,
  value/role u32 @+4}`. `FUN_00417390` array loop from `param_1 + 0x254`,
  `read(iVar7-4); read(iVar7); iVar7 += 8`.
- **+0x250 is a 4-byte gap/scalar** between the count (+0x24c) and the array
  (+0x254). The 0x0323 dispatcher never writes +0x250/+0x254 into the in-world
  card array at all (copy stops at +0xb4=byte 0x2d0).

### Path B — `0x0356`/`NotifyInformationCharacter` live action-list staging

- `FUN_004c0400` (the live "action-list seat" consumer fed by 0x0356) reads its
  delta count at **rec+0x250** (`bVar3 = *(byte*)(param_1+0x250)`), rows at
  **rec+0x254** stride 8 (`{u32@+0, u32@+4}`; it compares `*psVar6` vs
  `(short)piVar7[-1]` at rec+0x254 and `*(int*)(psVar6+2)` vs `*piVar7` at
  rec+0x258). On mismatch it re-requests via `FUN_00517cd0(0x356, ...)`. It
  stages into the runtime command-table slot (`DAT_007ccffc+0xc`, stride 0x370,
  600 slots, keyed slot+0x24==rec+0x4; slot/record delta +0x20): count →
  slot+0x270, rows → slot+0x274.
- 0x0356 record size = **0x2d8** (`FUN_004b8b00` case 0x356), 4 bytes larger
  than the 0x2d4 card record (trailing byte at rec+0x2d4 → slot+0x2f4).

### Resolution

| Question | Answer | Source |
|---|---|---|
| `0x0323`/InformationCharacter card **count** offset | **char+0x24c** (u8, gate `<0x11`) | `FUN_00417390` L349, `FUN_00419300` `*(u8)(puVar2+0x93)` |
| `0x0323` card **array** offset/stride | **char+0x254**, stride 8, two u32 per entry | `FUN_00417390` array loop |
| meaning of +0x250 in the record | 4-byte gap/scalar between count and array | derived |
| `0x0356` live action-list **count** offset | **rec+0x250** (u8) | `FUN_004c0400` `*(byte*)(param_1+0x250)` |
| `0x0356` live action-list **rows** | rec+0x254, stride 8, two u32 | `FUN_004c0400` compare loop |
| second per-row field width | **u32 @+4** (not u16@+2) | `FUN_004c0400` `*(int*)(psVar6+2)`; `FUN_00419300` `*(u32)puVar9` |

> The two count offsets differ **by design** because they live in two different
> structs (the 724-byte character record vs the 0x2d8 NotifyInformationCharacter
> delta), wired by two different parsers. `docs/logh7-info-records-wire.md:95`
> (which claimed `spot u16 @0x252`, stride 8) is **wrong on the per-row field**:
> the second field is **u32**, not u16. The doc's count offset (0x24c) is
> **correct** for the InformationCharacter record.

### KNOWN-OPEN (verifier correction — do NOT mark resolved)

The earlier claim that `FUN_004f6b00` (the UI seat selector) reads the same
0x0356 rows and returns only the low u16 of the seat value is **UNSUBSTANTIATED**.
Re-verification shows `FUN_004f6b00` reads a u16 at `*(int*)(param_1+0x628)+0x26c
+ (...)*8` from an **unidentified UI structure**, and its callee chain
(`FUN_004f5cb0` → `FUN_004c8700`) consumes a **third** table
(`DAT_007ccffc+0x3416d8`, stride 0x46), not the 0x370 command-table slot fed by
`FUN_004c0400`. Therefore:

- The "FUN_004f6b00 returns low u16 of the seat value" justification for the
  server's `category === 0 ? 0x10000 : category` normalization is **invalid as
  RE evidence**. Whether the 0x10000 mapping zeroes the live seat value must be
  settled by **live A/B testing**, not asserted as RE-backed.
- The 0x24c-vs-action overload that would tie 0x24c to the seat selector via the
  +0x26c read stays **KNOWN-OPEN**. Only the Path-A count@0x24c and the
  Path-B count@0x250 / rows@0x254 layouts are RE-confirmed.

---

## 5. Server reconciliation TODO

Ordered, concrete changes to `src/server/*.mjs` so the server emits what the
**client** parses. Each item names the client authority.

1. **Character-record card emission — fix the count offset (HIGH).**
   `src/server/logh7-login-protocol.mjs` `buildInformationCharacterRecordInner`
   (~L262-271) writes the card count at **0x250**. The client
   (`FUN_00417390`) reads `card_len` at **0x24c** (gate `<0x11`). As written,
   the client sees `card_len = 0` and iterates **zero cards** — the seat data is
   silently dropped.
   - Change `payload.writeUInt8(count, 0x250)` → `payload.writeUInt8(count,
     0x24c)`.
   - Per-card layout: `{kind/id u32 @ 0x254 + i*8, value/role u32 @ 0x258 +
     i*8}`, stride 8, **max 16**. Keep the value write at `0x254 + i*8`; do
     **not** write a second u32 at `0x258` of the *same* card if it would land
     on the next card's slot — emit exactly two u32 per 8-byte row.
   - Leave 0x250 as the 4-byte gap; do not put the count there.
   - Remove/close the KNOWN-OPEN note at L257-261 **for the record path only**
     (the action-list/seat-selector overload remains open — see item 8).

2. **Action-list seat (live `0x0356`) — keep current layout, verify size
   (HIGH).** `logh7-login-protocol.mjs` (L262-271) +
   `logh7-login-session.mjs` `activeSeatEntries`/`actionListCategoryDword`
   (~L467-479) already match `FUN_004c0400`: count u8 @0x250, rows
   `{character u32 @0x254+i*8, role u32 @0x258+i*8}`, max 16. **KEEP.** Ensure
   the emitted `0x0356` record is the full **0x2d8** bytes (not 0x2d4) — the
   client copies through rec+0x2d4 and `FUN_004b8b00` declares 0x2d8.

3. **`categoryDword` normalization — flag for live A/B (MEDIUM).**
   `logh7-login-session.mjs` L469-471 maps `category===0 ? 0x10000 : category`.
   The RE justification (FUN_004f6b00 reads low u16) is **invalid** (see §4
   KNOWN-OPEN). Do not rely on it. Verify the intended seat value survives as
   the **low u16** by live test; if the live screen needs a non-zero seat, the
   low u16 must be non-zero (e.g. `0x0001`, not `0x10000`).

4. **`0x034f ResponseCardCharacter` builder — confirm matches (LOW).**
   `logh7-info-records-static.mjs buildResponseCardCharacter`: header (count
   low byte) + `i*0x2d4` records from base 4, `CARD_CHARACTER_MAX=64`, total
   **0xb504**. Matches `FUN_004ba2b0` case 0x34f. **KEEP.**

5. **Nation-owned fleets — add the 2-power session layer (HIGH).**
   `logh7-content-adapter.mjs` currently generates one fleet per named
   character (matches the per-character unit link — correct). Add:
   - **Invariant (load-bearing):** every generated character's 0x0323
     `flagship`@0x24 **must equal** its `unit.id`@0x00, or `FUN_004c2a80` won't
     place the player in-world.
   - Build **exactly TWO `InformationSessionPower` records** per session
     (Empire vs Alliance, label `power[2]`), each holding a bounded fleet
     roster `u16[≤14]` (the numbered Alliance 1st–13th + guard expressed as the
     14-slot national roster, **not** 14 ownerless units). Cap leaders to 3.
   - Do **not** seed a 3rd playable session power. Phezzan stays neutral.

6. **Fleet faction source — derive from commander, not unit owner (MEDIUM).**
   `logh7-world-state.mjs` `Fleet.owner`/`faction` are fine as bookkeeping, but
   **do not** rely on the client consuming `unit+0x10` as a nation id. The
   client derives in-world faction from the commander char's `power`@+0x04 /
   `camp`@+0x05 (`FUN_004c32a0`). Keep commander→nation consistent server-side;
   that is the authoritative faction source.

7. **Roster caps — enforce server-side before emit (MEDIUM).** Any code that
   builds these arrays must clamp to the client caps or the parser bails:
   - entry characters ≤5, extension slots ≤2 per account
     (`logh7-account.mjs` / `InformationAccount`).
   - `ResponseCardCharacter` ≤64; per-character card array ≤16.
   - sessions in picker ≤64; powers/session = **exactly 2**.
   - `NotifyBaseParameter` budget ≤6; `ResponseInformationBase` ≤4 elements.
   - boats per fleet ≤10; unit table ≤600; special_ability ≤80; all name
     fields ≤13 UCS-2 units.

8. **`InformationAccount` (0x1001) layout — verify routing (MEDIUM, hedged).**
   `logh7-account.mjs buildResponseInformationAccountInner` emits a FLAT struct
   (`ownedCharacterCount`@0x04, `maxCharacters`@0x0c). The client
   `Input_InformationAccount` (`FUN_00407920`) expects a two-array layout:
   `extension_character` count@+0x08 (≤2, stride-0xcc records) then
   `entry_character` count@+0x1a8 (≤5, u32[] ids@+0x1ac). The parser is
   vtable-dispatched and has **no static caller**, so routing can't be
   statically confirmed. **Action:** confirm at runtime whether 0x1001 actually
   feeds `FUN_00407920`; if so, re-emit the two-array layout. Do **not** assume.

9. **Canon roster size limits — assets vs roster (LOW).** The ~446-portrait
   pool is a FACE/asset pool, not a roster. Pushing >64 cards or >5 entry chars
   per account trips the client bail. Keep portrait selection independent of the
   per-account roster caps in item 7.

10. **Docs — correct the per-card field type (LOW).** Fix
    `docs/logh7-info-records-wire.md:95`: the card per-row second field is
    **u32 @+0x04**, not `u16 @0x252`. The count offset 0x24c there is correct.

### Load-bearing-vs-nice-to-have

- **Load-bearing (break world entry / drop data if wrong):** char-record card
  count @0x24c (item 1); `flagship`@0x24 == `unit.id`@0x00 (item 5); record size
  0x2d4; 0x0356 size 0x2d8 (item 2); 2-power session cap (items 5,7).
- **Emit-for-completeness (P3 semantics):** unit mid-fields (faction@0x04,
  commander@0x08, cell@0x0c, owner@0x10, supply@0x40, mapSection@0x48) — keep
  byte-correct offsets but treat only `id`@0x00 + boats@0x14/0x18 as
  semantically required.
- **Unverified — settle by live test, not RE:** `categoryDword` 0x10000 mapping
  (item 3); 0x1001→FUN_00407920 routing (item 8).
