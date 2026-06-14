# LOGH VII — Personnel / Strategy / Character-info-notify wire layouts

Static RE of `G7MTClient.exe` (Ghidra index `.omo/ghidra/export/G7MTClient/`, binary
`.omo/ghidra/bin/G7MTClient.exe`). Decodes the internal-affairs **personnel** (0x07xx),
**strategy / outfit** (0x09xx), and the related **character-info notify** (0x356/0x358/0x359/0x35a,
0x43a/0x43b) message bodies so the authoritative server can parse appoint/dismiss/promote/plan/
create-outfit commands and emit the matching S→C records. **No client/server launch — static only.**

All offsets are **into the inner body** (the bytes AFTER the `[u16 BE code]` framing prefix). Bodies
are **little-endian**. C→S inner = `[u16 BE code][body]`; S→C conn3 = message32 `[u32 0][u16 code][body]`.

---

## 0. Method / reader-vtable key (evidence)

Each wire class has serialization methods. The **`Input_<Class>::input_from_stream`** functions read
the body field-by-field in wire order via an input-stream object whose **vtable slots are confirmed**
by reading the vtable at va `0x681f44` from the binary and disassembling each reader:

| vtable call in parser | reader fn | size | type | evidence |
|---|---|---|---|---|
| `(**(*stream + 0x14))(dst)` | `FUN_006106f0` | 2 | **i16** (signed) | `operator >> (int16_t)` @0x7b5f70; advances pos +2 |
| `(**(*stream + 0x1c))(dst)` | `FUN_00610650` | 4 | **u32** | `operator >> (uint32_t)` @0x7b5ef0 |
| `(**(*stream + 0x20))(dst)` | `FUN_00610600` | 2 | **u16** | `operator >> (uint16_t)` @0x7b5eb0; +2 confirmed |
| `(**(*stream + 0x24))(dst)` | `FUN_006105b0` | 1 | **u8** | `operator >> (uint8_t)` @0x7b5e70 |
| `FUN_00610420(dst,1,0,2)` | block read | 1 | **u8** (raw mem copy) | reads 1 byte (`param_3` len), used for rank/flag/enum bytes |

The **`_INF:<Class>#` debug-print** functions (`FUN_00439da0(stream, ctx, "label=", value)`) print every
field with its **source label string** — this is how the field *names* below were recovered (e.g.
`target_rank=`, `move_character[%d]=`, `practice_warp=`). The **`get_length`** functions give the size
formula. The client **receive/apply** handler is the giant switch `FUN_004ba2b0` (each `case` copies the
body into a static struct then calls an apply fn) — this gives both the dword-count (= body size) and
the **semantics** (what the field mutates).

> **Important framing note.** In the dispatch sizer `FUN_004b8b00`, every personnel/strategy *command*
> sets `*param_3 = *param_2` and does **not** call a parser at dispatch time — these bodies are decoded by
> the `Input_` classes / the `FUN_004ba2b0` receive path, not in the tactical fast-path. The dispatch
> `size` is a **max-allocation ceiling**; the `get_length` formula is the exact serialized length.

---

## 1. Dispatch sizes (ground truth — `FUN_004b8b00`, cross-checked vs `FUN_004ba2b0` dword copies)

| code | class | dispatch size | recv dword copy (`FUN_004ba2b0`) | bytes |
|---|---|---|---|---|
| 0x704 | CommandRankUp | `0xa0` | 0x28 dwords | 160 |
| 0x705 | CommandSpeciallyRankUp | `0x3f28` | 0xfca dwords | 16168 |
| 0x706 | CommandRankDown | `0xa8` | 0x2a dwords | 168 |
| 0x707 | CommandCardAppointment | `0x28` | 10 dwords | 40 |
| 0x708 | CommandCardDismisal | `0xa0` | 0x28 dwords | 160 |
| 0x709 | CommandCardResignation | `0x9c` | 0x27 dwords | 156 |
| 0x70a | NotifyCardLoss | (n/a, recv) | 3 dwords | 12 |
| 0x70b | NotifyCardLossMovedSpot | (n/a, recv) | 4 dwords | 16 |
| 0x900 | CommandMakePlan | `0x1c` | 7 dwords | 28 |
| 0x901 | CommandWithdrawalPlan | `0x18` | 6 dwords | 24 |
| 0x902 | CommandAnnouncement | `0x28` | 10 dwords | 40 |
| 0x903 | CommandCreateOutfit | `0x324` | (get_length, variable) | ≤804 |
| 0x904 | NotifyCreateOutfitBegin | (recv) | 1 dword | 4 |
| 0x905 | NotifyCreateOutfitEnd | `0x8c` | 1 dword used | 140 |
| 0x906 | CommandDeleteOutfit | `0x2b94` | 0xae5 dwords | 11156 |
| 0x908 | NotifyFinishStrategyPlan | (recv) | 3 dwords | 12 |
| 0x356 | NotifyInformationCharacter | `0x2d8` | field-wise | 728 |
| 0x358 | NotifyChangeFlagShip | `0x5c` | 0x17 dwords | 92 |
| 0x359 | NotifyInformationOutfit | `0x1c` | 7 dwords | 28 |
| 0x35a | NotifyEnding | `0x434` | field-wise | 1076 |
| 0x43a | NotifyCharacterAchievement | `0xc` | 3 dwords | 12 |
| 0x43b | NotifyOutfitAchievement | `0xc` | 3 dwords | 12 |

Strategy code map confirmed by the command-tray PTR array @ `0x768704` (names read from binary):
`0x900 CommandMakePlan, 0x901 CommandWithdrawalPlan, 0x902 CommandAnnouncement, 0x903 CommandCreateOutfit,
0x904 NotifyCreateOutfitBegin, 0x905 NotifyCreateOutfitEnd, 0x906 CommandDeleteOutfit,
0x907 NotifyDeleteOutfit, 0x908 NotifyFinishStrategyPlan`.

---

## 2. PERSONNEL (0x07xx)

All five personnel **commands** share a fixed 4-dword header that the `_INF:` printers label as
`time=` + 3 unlabelled dwords (separators `&DAT_0075edfc`, `&DAT_00761188`, `&DAT_00761180` — almost
certainly a per-command header: serialized-time + actor/context). Then each carries its action fields and
a trailing **`move_character[count]` u32 array** (count `u8`, max 32) — the set of character ids whose
spot/visual must be refreshed after the action. The shared apply fn is `FUN_004bfcd0` (UI redraw trigger).

### 2.1 CommandRankUp 0x704 — promote a card by merit
Parser `Input_CommandRankUp::input_from_stream` = **FUN_0043c150**; print **FUN_0043a430**; get_length
**FUN_0043a120** = `26 + 4*count` (`0x1a + count*4`).

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | serialized command time/context | print `time=` |
| 0x04 | 4 | u32 | hdr1 | header (actor/session) | print sep |
| 0x08 | 4 | u32 | hdr2 | header | print sep |
| 0x0c | 4 | u32 | hdr3 | header | print sep |
| 0x10 | 1 | u8 | `target_rank` | new rank to promote to (1..14 rank ladder) | print `target_rank=`, read via `FUN_00610420` |
| 0x14 | 4 | u32 | `rankchanged_character_achievement` | achievement value applied on promotion | print label |
| 0x18 | 4 | u32 | `move_spot` | spot/seat the promoted char moves to | print `move_spot=` |
| 0x1c | 1 | u8 | `move_character_size` | N of refresh ids (≤32) | get_length, loop bound |
| 0x20 | 4×N | u32[] | `move_character[]` | character ids to refresh | parser array @+0x20 stride 4 |

### 2.2 CommandSpeciallyRankUp 0x705 — special (mass) promotion
Parser **FUN_0043c710**; print **FUN_0043aaa0**; get_length **FUN_0043a590** =
`0x1b + downAch*8 + 5 + moveChar*4` (downAch is a **u16** count, max 2000=0x7d0; moveChar a u8, max 32).

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | command time | print |
| 0x04..0x0c | 4×3 | u32 | hdr1..3 | header | print |
| 0x10 | 4 | u32 | `target_character` | character being promoted | print `target_character=` |
| 0x14 | 1 | u8 | `target_goto_rank` | rank to jump to | print `target_goto_rank=` (block byte) |
| 0x18 | 4 | u32 | `rankchanged_character_achievement` | achievement set on the promoted char | print |
| 0x1c | 2 | u16 | `down_achievement_character_size` | N of demote/cost entries (≤2000) | get_length, parser `+0x20` u16 |
| 0x20 | 8×N | struct[] | `down_achievement_character[]` | per-entry **{u32 character, u32 achievement}** — chars whose achievement is *spent/reduced* to fund the special promotion | print loop `character=/achievement=`; parser stride 8 |
| +… | 4 | u32 | `move_spot` | promoted char's new spot (struct +0x3ea0) | print |
| +… | 1 | u8 | `move_character_size` | refresh count (≤32) (struct +0x3ea4) | print/parser |
| +… | 4×M | u32[] | `move_character[]` | refresh ids (struct +0x3ea8) | print/parser |

> The huge dispatch ceiling (0x3f28) reserves room for the max 2000 down-achievement pairs.

### 2.3 CommandRankDown 0x706 — demote a card
Parser **FUN_0043d080**; print **FUN_0043b000**; get_length **FUN_0043acd0** (= `0x1d + count*4`).

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | | print |
| 0x04..0x0c | 4×3 | u32 | hdr1..3 | header | print |
| 0x10 | 1 | u8 | `target_rank` | rank to demote to | print `target_rank=` |
| 0x14 | 4 | u32 | `target_character` | char being demoted | print `target_character=` |
| 0x18 | 4 | u32 | `exec_character_achievement` | achievement of the executor (the demoter) | print `exec_character_achievement=` |
| 0x1c | 4 | u32 | `rankchanged_character_achievement` | achievement set on demoted char | print |
| 0x20 | 4 | u32 | `move_spot` | demoted char's new spot | print `move_spot=` |
| 0x24 | 1 | u8 | `move_character_size` | refresh count (≤32) | parser/print |
| 0x28 | 4×N | u32[] | `move_character[]` | refresh ids | parser array |

### 2.4 CommandCardAppointment 0x707 — APPOINT a card to a seat (40 B) ★ highest playability
No standalone `Input_` parser is used (40-byte fixed; the receive path copies 10 dwords and calls the
apply). **Apply = FUN_004c5580** (definitive semantics):

```c
unit = FUN_004c8440(body[0x10]);        // find outfit/unit by id at body+0x10
if (unit) {
  n = *(u8*)(unit+0x270);               // current seat-card count
  *(u32*)(unit+0x274 + n*8) = body[0x18]; // append card entry: id
  *(u32*)(unit+0x278 + n*8) = body[0x1c]; // append card entry: value/role
  *(u8*)(unit+0x270) = n+1;             // ++count (cap 16 = 0x10)
  *(u32*)(unit+0x324) = body[0x20];     // set unit chief/spot field
}
```

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | command time | header |
| 0x04 | 4 | u32 | hdr1 | header (actor) | header |
| 0x08 | 4 | u32 | hdr2 | header | header |
| 0x0c | 4 | u32 | hdr3 | header | header |
| 0x10 | 4 | u32 | **`target_outfit`** | unit/outfit id the card is appointed INTO | apply `FUN_004c8440(body+0x10)` |
| 0x14 | 4 | u32 | hdr4 | header/context | apply |
| 0x18 | 4 | u32 | **`card_character`** | character/card id appointed (1st dword of seat entry) | apply `unit+0x274` |
| 0x1c | 4 | u32 | **`seat_role`** | seat role/value (2nd dword of seat entry) | apply `unit+0x278` |
| 0x20 | 4 | u32 | **`chief_spot`** | unit chief/spot id written to `unit+0x324` | apply |
| 0x24 | 4 | u32 | tail | (10th dword) | recv copy size 10 |

This is the **exact inverse** of NotifyCardLoss (§2.7), which removes from the same `unit+0x274`/`+0x270`
seat array. Card entries are **8 bytes each: {character/card id, role/value}**; up to 16 per unit.

### 2.5 CommandCardDismisal 0x708 — dismiss a card from a seat (160 B)
Parser **FUN_0043da60**; print **FUN_0043b6c0**; get_length **FUN_0043b3b0** (= `0x1d + count*4`).

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | | print |
| 0x04..0x0c | 4×3 | u32 | hdr1..3 | header | print |
| 0x10 | 4 | u32 | `target_character` | char being dismissed | print `target_character=` |
| 0x14 | 4 | u32 | `card` | the card/seat id being vacated | print `card=` |
| 0x18 | 4 | u32 | `move_spot` | where the dismissed char goes | print `move_spot=` |
| 0x1c | 1 | u8 | `move_character_size` | refresh count (≤32) | print/get_length |
| 0x20 | 4×N | u32[] | `move_character[]` | refresh ids | print/parser |

### 2.6 CommandCardResignation 0x709 — voluntary resignation (156 B)
Parser **FUN_0043e020**; print **FUN_0043bb30**; get_length **FUN_0043b820**.

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | | print |
| 0x04..0x0c | 4×3 | u32 | hdr1..3 | header | print |
| 0x10 | 4 | u32 | `card` | card/seat resigned | print `card=` |
| 0x14 | 4 | u32 | `move_spot` | resigning char's new spot | print `move_spot=` |
| 0x18 | 1 | u8 | `move_character_size` | refresh count (≤32) | print/parser |
| 0x1c | 4×N | u32[] | `move_character[]` | refresh ids | print/parser |

### 2.7 NotifyCardLoss 0x70a (12 B, S→C) — remove a card from a seat
Recv copies 3 dwords to `&DAT_004327b0`, apply **FUN_004c0670**:

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | hdr/time | | recv |
| 0x04 | 4 | u32 | `owner` | owner key (matched vs `FUN_004b5b80()` per unit, `unit+4`) | apply compares `body+4` |
| 0x08 | 1 | u8/flag | `silent` | when 0, plays a UI sound/effect (`FUN_00522010(0x76)`); when non-0, silent | apply `body+8` |
| 0x0a | 2 | u16 | `card_id` | the card removed from `unit+0x274` array (matched by short id) | apply `body+10` |

Apply walks all units whose owner == `body+4`; finds the matching short `card_id` in the seat array
`unit+0x274` (count `unit+0x270`, stride 8) and shifts the array down, decrementing `unit+0x270`.

### 2.8 NotifyCardLossMovedSpot 0x70b (16 B, S→C) — card lost + spot relocation
Recv copies 4 dwords to `&DAT_004327bc`, apply **FUN_004c0790**:

| Off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | hdr/time | | recv |
| 0x04 | 4 | u32 | `owner` | owner key matched per unit | apply compares `body+4` |
| 0x08 | 4 | u32 | `spot_x_or_a` | written to `unit+0x40` | apply |
| 0x0c | 4 | u32 | `spot_y_or_b` | written to `unit+0x44` | apply |

Updates the matched unit's position/spot pair (`unit+0x40/0x44`) — the card's seat relocated.

---

## 3. STRATEGY / OUTFITS (0x09xx)

### 3.1 CommandMakePlan 0x900 (28 B) — queue a strategy plan
Built from the **strategy command tray** (matcher `FUN_00492520`: maps tray-command names→code, reads the
plan id from `tray+0x28+idx*4`). Recv copies 7 dwords to `0x43ca2c`, apply `FUN_004bfcd0` (redraw).
Body = 7 dwords (28 B): a shared command header (time + context dwords) + the plan payload. The first
dword pair is the standard `time`/header; the remaining dwords carry the plan parameters (plan id +
target). Exact per-field labels not separately printed for the tray path — **confidence medium** on the
sub-field split; size 28 B and header shape are confirmed.

### 3.2 CommandWithdrawalPlan 0x901 (24 B) — cancel/withdraw a queued plan
Recv copies 6 dwords to `0x43ca48`, apply `FUN_004bfcd0`. Header (time/context) + plan id to withdraw.
Confidence medium on sub-fields; 24 B confirmed.

### 3.3 CommandAnnouncement 0x902 (40 B) — make an announcement/order
Recv copies 10 dwords to `0x43ca60`, apply `FUN_004bfcd0`. Header + announcement payload (target +
message id/code). Confidence medium on sub-fields; 40 B confirmed.

### 3.4 CommandCreateOutfit 0x903 — create a new fleet/outfit ★ deepest
Parser `Input_CommandCreateOutfit::input_from_stream` = **FUN_0048fb80**; print **FUN_0048df10**;
get_length **FUN_0048d860** = `0x17 + ships*5 + 1 + troops*5 + 0x1c` (ships u8 ≤99, troops u8 ≤24).
**Wire** element stride is **5** (`get_length`); the in-memory struct pads each element to 6.

Fixed head + two variable arrays + a practice/stat tail:

| Wire off | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `time` | command time | print `time=` |
| 0x04 | 4 | u32 | hdr1 | header | print sep |
| 0x08 | 1 | u8 | `mode` | creation mode (block byte) | print `mode=` |
| 0x09 | 4 | u32 | hdr3 | header | print sep |
| 0x0d | 4 | u32 | hdr4 | header | print sep |
| 0x11 | 4 | u32 | `base` | home base id of the outfit | print `base=` |
| 0x15 | 1 | u8 | `kind` | outfit kind/type (block byte) | print `kind=` |
| 0x16 | 1 | u8 | `move_ships` | ship-entry count (≤99) | get_length, parser `+0x19` |
| 0x17 | 5×S | struct[] | `ships[]` | **{u16 kind, u8 unit_number, i16 boat_number}** | parser `+0x20`/block/`+0x20`; print `kind/unit_number/boat_number` |
| … | 1 | u8 | `move_troops` | troop-entry count (≤24) | parser `+0x26c` |
| … | 5×T | struct[] | `troops[]` | **{u16 kind, u8 troop_grade, i16 unit_number}** | parser; print `kind/troop_grade/unit_number` |
| … | 4 | u32 | `max_troop` | troop capacity | print `max_troop=` |
| … | 4 | u32 | `max_crew` | crew capacity | print `max_crew=` |
| … | 4 | u32 | tailA | (struct +0x308 / `param_1[0xc2]`) | print sep |
| … | 1 | u8 | `kind2` | block byte | print `kind=` |
| … | 1 | u8 | `power` | faction/power id | print `power=` |
| … | 1 | u8 | `camp` | camp/side id | print `camp=` |
| … | 1 | u8 | `index` | outfit index | print `index=` |
| … | 2 | u16 | `achievement` | outfit achievement | print `achievement=` (parser `+0x310` u16) |
| … | 1 | u8 | `practice_warp` | training: warp | print `practice_warp=` |
| … | 1 | u8 | `practice_speed` | training: speed | print |
| … | 1 | u8 | `practice_command` | training: command | print |
| … | 1 | u8 | `practice_offence` | training: offence | print |
| … | 1 | u8 | `practice_defence` | training: defence | print |
| … | 1 | u8 | `practice_antiaircraft` | training: AA | print |
| … | 1 | u8 | `practice_search` | training: search | print |
| … | 1 | u8 | `practice_deception` | training: deception | print |
| … | 1 | u8 | `practice_landbattle` | training: land battle | print |
| … | 1 | u8 | `practice_airbattle` | training: air battle | print |

Practice fields are the 10 fleet-training proficiencies parsed as a contiguous block at struct
`+0x318..+0x321` (parser: 10× `FUN_00610420(...,1,...)`). The `ships[]`/`troops[]` arrays are the
composition of the new outfit (which ship/troop templates and how many).

### 3.5 CommandDeleteOutfit 0x906 (≤11156 B) — disband outfit(s)
Recv copies 0xae5 dwords to `0x434900`, apply `FUN_004c5700`. Huge ceiling = list of outfit ids +
disposition of all member ships/troops. Header + a bulk id table. **Confidence low** on inner layout
(not field-printed here); size & code confirmed.

### 3.6 NotifyCreateOutfitBegin 0x904 / End 0x905 / FinishStrategyPlan 0x908 (S→C)
- **0x904** (4 B used): `body[0]` = the outfit id being created → stashed at `0x4348f8`; UI "creating…".
- **0x905** (dispatch 0x8c=140 B; this client build reads only `body[0]` → `0x4348fc`): create-finished
  ack carrying the new outfit id. (The full 140-byte record likely mirrors the outfit-info struct, but
  this client only consumes the id — **confidence medium** on the unused tail.)
- **0x908** (12 B): `body[0..2]` → `0x43ca88`, apply `FUN_004bfcd0` (redraw); strategy-plan completion.

---

## 4. CHARACTER-INFO NOTIFIES (S→C)

### 4.1 NotifyInformationCharacter 0x356 (728 B) — full character record
Recv handler (`FUN_004ba2b0` case 0x356) deserializes a **full 0x2d8 character record** field-by-field
into `client+0x4324bc`, then calls **FUN_004c0400** (strategy command tray update — the doc string
`"NotifyInformationCharacter Receive / g_StrategyCommandTray.Update()"` confirms it pushes a fresh
character card into the UI). The body layout matches the **0x0323 ResponseInformationCharacter** record
(see `docs/logh7-info-records-wire.md`) — same field stream:

| Off | Size | Type | Field (per 0x0323 schema) | Evidence |
|---|---|---|---|---|
| 0x00 | 1 | u8 | record flag/valid | recv `*(u8)body` |
| 0x04 | 4 | u32 | character id | recv `body[1]` |
| 0x08 | 2 | u16 | (id2/face-low) | recv `*(u16)(body+8)` |
| 0x0a | 1 | u8 | rank | recv |
| 0x0b | 1 | u8 | class/flag | recv |
| 0x0c | 4 | u32 | spot / location | recv `body[3]` |
| 0x10..0x11 | 1+1 | u8 | flags | recv |
| 0x14..0x2c | u32×7 + u8 | misc ids/state | recv `body[5..0xb]` |
| 0x2e.. | wchar[12] | name (cp/wide) | recv 0xc-word copy loop |
| 0x48.. | u32×6 | stats block A | recv `body[0x12..0x17]` |
| 0x62..0x67 | u8×~6 | small attrs (`spot`,`camp`,…) | recv `*(u8)(body+0x62..0x67)` |
| 0x70.. | u8[16] | 16-byte attr array | recv `for(0..0x10)` loop |
| 0x84.. | struct[33]×u32×? | ability/seat matrix (`0x21` dwords × N) | recv `0x21`-dword block loop |
| 0x1a8.. | tail attrs + u16[0x50] | name2 / extra | recv 0x50-word copy |
| … | … | … | (full 728 B — same as 0x0323 minus the 0x0323-only selected-char tail) | |

Because the **field stream is identical to 0x0323**, the server should build 0x356 with the same
`buildInformationCharacterRecordInner` body and wrap it as a message32 with code 0x356. The difference is
purely the code + that 0x356 is a *delta/push* (single character) rather than the bulk init.

### 4.2 NotifyChangeFlagShip 0x358 (92 B) — outfit/flagship state record
Recv copies **0x17 dwords (92 B)** to `&DAT_004332d0`, apply **FUN_005266e0**. Print **FUN_0042f930**
gives the field labels (this is the per-outfit live record):

| Off | Size | Type | Field | Meaning |
|---|---|---|---|---|
| 0x00 | 4 | u32 | `character` | commander character id |
| 0x04 | 4 | u32 | hdr1 | header |
| 0x08 | 2 | u16 | `kind` | outfit kind |
| 0x0a | 1 | u8 | `mode` | outfit mode |
| 0x0c | 4 | u32 | `grid` | grid/strategic cell |
| 0x10 | 4 | u32 | `outfit` | outfit id |
| 0x14 | 4 | u32 | `boarding_ship` | flagship/boarding ship id |
| 0x18 | 1 | u8 | `troop_units` | troop unit count (array follows in struct) |
| … | 4 | u32 | `base` | home base |
| … | 1 | u8 | `morale_max` | morale cap |
| … | 1 | u8 | `rebellion` | rebellion flag/level |
| … | 2 | u16 | `damaged` | damaged ship count |
| … | 2 | u16 | `destroyed` | destroyed ship count |
| … | 4 | u32 | `supplies` | supply level |
| … | 4 | u32 | `mobilization` | mobilization level |
| … | 4 | f32 | `cruising` | cruising/range value (printed as float `%?f`) |

(Field order verified from the `_INF:NotifyChangeFlagShip` printer; struct offsets differ slightly from
wire offsets due to in-memory alignment — wire order is as listed.) Despite the class name, this carries
the **outfit's live combat/logistics state**; emitted when an outfit's flagship/state changes.

### 4.3 NotifyInformationOutfit 0x359 (28 B) — outfit info delta
Recv copies **7 dwords (28 B)** to `&DAT_00432794`, apply **FUN_004c03b0**. A compact outfit-info update
(7 dwords: outfit id + a handful of state dwords). Sub-field labels not separately printed in this build
— **confidence medium**; size & apply confirmed.

### 4.4 NotifyEnding 0x35a (1076 B) — end-of-game / ending record
Recv (`FUN_004ba2b0` case 0x35a) deserializes field-wise into `&DAT_0043caa0`:

| Off | Size | Type | Field | Evidence |
|---|---|---|---|---|
| 0x00 | 4 | u32 | hdr/type | recv `body[0]` |
| 0x04 | 2 | u16 | code2 | recv `*(u16)(body+4)` |
| 0x06 | 1 | u8 | b6 | recv |
| 0x07 | 1 | u8 | b7 | recv |
| 0x08 | 4 | u32 | d2 | recv `body[2]` |
| 0x0c..0x0d | 1+1 | u8 | flags | recv |
| 0x10 | 4 | u32 | d4 | recv `body[4]` |
| 0x14 | 2 | u16 | w5 | recv |
| 0x18.. | u32×4 | d6..d9 | recv `body[6..9]` |
| 0x28 | 1 | u8 | b10 | recv |
| 0x2a.. | u16[0xd] | text/name block | recv 0xd-word copy |
| 0x44.. | u32×2+… | tail | recv `body[0x11..]` |
| … | … | … | (full 1076 B ending payload — credits/result text + ids) | |

Low priority for the play loop; size confirmed, inner semantics are an end screen.

### 4.5 NotifyCharacterAchievement 0x43a / NotifyOutfitAchievement 0x43b (12 B each, S→C)
Recv copies **3 dwords**:
- 0x43a → `client+0x43315c`, apply `FUN_004bfcd0`-style (3-dword store).
- 0x43b → `client+0x433168`, same.

| Off | Size | Type | Field | Meaning |
|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | character id (0x43a) / outfit id (0x43b) |
| 0x04 | 4 | u32 | `achievement` | new achievement value |
| 0x08 | 4 | u32 | `delta/extra` | delta or secondary (e.g. rank-progress) |

Server emits these whenever a character/outfit's achievement (功績) changes (after combat, promotions,
missions) so the client UI updates the merit display.

---

## 5. SERVER TO-DO (authoritative engine)

The authoritative server owns the personnel roster, the outfit/seat tables, and the strategy plan queue.
On each C→S command it must **validate → mutate authoritative state → broadcast the matching S→C record**.

### Personnel
- [ ] **0x707 CardAppointment**: parse `{target_outfit@0x10, card_character@0x18, seat_role@0x1c,
      chief_spot@0x20}`. Validate the actor has authority over `target_outfit` and the seat isn't full
      (≤16 cards). Append `{card_character, seat_role}` to the outfit's seat list; set chief = `chief_spot`.
      Broadcast the seat change to all viewers (re-send the affected outfit via `0x358 NotifyChangeFlagShip`
      and/or `0x356 NotifyInformationCharacter` for the moved char). Mirror the client apply (FUN_004c5580).
- [ ] **0x708 CardDismisal / 0x709 CardResignation**: remove `card`/`target_character` from its current
      seat; relocate the char to `move_spot`. Broadcast **0x70a NotifyCardLoss** (12 B: owner, silent flag,
      u16 card id) to all clients that hold that outfit so they shift it out of the seat array; if the spot
      also moves, broadcast **0x70b NotifyCardLossMovedSpot** (owner + new x/y at +0x40/+0x44).
- [ ] **0x704 RankUp / 0x706 RankDown / 0x705 SpeciallyRankUp**: validate rank ladder bounds (1..14) and
      achievement costs (RankUp consumes `rankchanged_character_achievement`; SpeciallyRankUp debits each
      `down_achievement_character[]` entry by its `achievement`). Apply rank + spot move; broadcast updated
      character via **0x356** and a **0x43a NotifyCharacterAchievement** for each achievement change. Honor
      the `move_character[]` list as the set of records to re-push.
- [ ] **Endianness/types**: all bodies LE; `target_rank`/`mode`/`kind`/practice = u8, `card`/ids = u32,
      `down_achievement_character_size` = u16, `boat_number`/troop `unit_number` = **i16 (signed)**.

### Strategy / outfits
- [ ] **0x903 CreateOutfit**: parse fixed head (`mode@0x08`, `base@0x11`, `kind@0x15`), `ships[]`
      (`{u16 kind,u8 unit_number,i16 boat_number}` × `move_ships`≤99), `troops[]`
      (`{u16 kind,u8 troop_grade,i16 unit_number}` × `move_troops`≤24), then `max_troop/max_crew`,
      `power/camp/index/achievement`, and the 10 `practice_*` proficiencies. Validate the base/power owns
      the listed ships/troops; allocate a new outfit id; instantiate it in world state. Broadcast
      **0x904 NotifyCreateOutfitBegin**(new id) then **0x905 NotifyCreateOutfitEnd**(new id), plus a
      **0x358/0x359** outfit record so all clients see the new fleet.
- [ ] **0x900 MakePlan / 0x901 WithdrawalPlan / 0x902 Announcement**: maintain a per-faction strategy-plan
      queue. MakePlan enqueues (plan id + target from the 28-byte body), WithdrawalPlan dequeues, Announcement
      posts an order/message. On plan resolution broadcast **0x908 NotifyFinishStrategyPlan**.
      (Sub-field offsets are confidence-medium — confirm with a live capture before strict validation.)
- [ ] **0x906 DeleteOutfit**: disband; redistribute member ships/troops; broadcast outfit removal
      (0x907 NotifyDeleteOutfit). Inner id-list layout is confidence-low — capture before implementing.

### Char-info notifies (S→C builders)
- [ ] **0x356 NotifyInformationCharacter**: reuse `buildInformationCharacterRecordInner` (the 0x0323 body)
      and wrap as message32 code 0x356 — single-character delta push (call sites: after appoint/rank/move).
- [ ] **0x358 NotifyChangeFlagShip**: build the 92-byte outfit-state record (character, kind, mode, grid,
      outfit, boarding_ship, troop_units, base, morale, rebellion, damaged, destroyed, supplies,
      mobilization, cruising). Emit on any outfit flagship/state change.
- [ ] **0x43a/0x43b achievement notifies**: 12-byte `{id, achievement, delta}`; emit on every 功績 change.
- [ ] **0x359 NotifyInformationOutfit** (28 B) and **0x35a NotifyEnding** (1076 B): lower priority; 0x359 is
      a compact outfit delta, 0x35a is the end-screen payload.

---

## 6. Open questions / confidence flags

1. **Personnel header dwords (off 0x04..0x0c).** Labelled only by separators in the printer; very likely
   {actor character id, session/turn, context} but the exact split is **confidence medium**. A live
   0x704/0x707 capture would pin them.
2. **MakePlan/WithdrawalPlan/Announcement sub-fields.** Built from the strategy tray (no per-field printer
   on that path). Sizes (28/24/40) and the shared header are confirmed; the plan-payload field split is
   **confidence medium**.
3. **DeleteOutfit 0x906 inner layout.** Only the ceiling (11156 B) and apply fn are known — **confidence
   low** on the id/disposition table; needs a capture.
4. **0x905 NotifyCreateOutfitEnd tail.** Dispatch says 140 B but this client build consumes only the first
   dword (new outfit id). The remaining 136 B are unread here — **confidence medium** that they mirror the
   outfit-info struct.
5. **CardAppointment `seat_role@0x1c` exact enum.** It is the 2nd dword of the 8-byte seat entry
   (`unit+0x278`); whether it encodes seat-slot vs role-flags is **confidence medium** (the value is stored
   verbatim by the client; semantics live server-side).
6. **0x358 wire vs struct offsets.** The trailing fields (base, morale, …) were read from the printer in
   order; their exact wire byte offsets after the `troop_units` array depend on the troop array length —
   confirm the array stride with a capture for byte-exact parsing.

---

### Evidence index (Ghidra addrs)
- `FUN_004b8b00` — inner dispatch sizer (all 0x07xx/0x09xx/0x35x/0x43x sizes).
- `FUN_004ba2b0` — client receive/apply switch (dword copy sizes + apply fn per code + 0x356/0x35a field-wise).
- `FUN_0043c150` / `FUN_0043a430` / `FUN_0043a120` — RankUp input / print / get_length.
- `FUN_0043c710` / `FUN_0043aaa0` / `FUN_0043a590` — SpeciallyRankUp input / print / get_length.
- `FUN_0043d080` / `FUN_0043b000` / `FUN_0043acd0` — RankDown input / print / get_length.
- `FUN_0043da60` / `FUN_0043b6c0` / `FUN_0043b3b0` — CardDismisal input / print / get_length.
- `FUN_0043e020` / `FUN_0043bb30` / `FUN_0043b820` — CardResignation input / print / get_length.
- `FUN_004c5580` — **CardAppointment apply** (seat-array append semantics).
- `FUN_004c0670` — NotifyCardLoss apply (seat-array remove). `FUN_004c0790` — CardLossMovedSpot apply (spot).
- `FUN_0048fb80` / `FUN_0048df10` / `FUN_0048d860` — CreateOutfit input / print / get_length.
- `FUN_00492520` — strategy command-tray matcher (0x900-0x908 code map; tray PTR @0x768704).
- `FUN_0042f930` — NotifyChangeFlagShip printer (0x358 field names). `FUN_005266e0` — its apply.
- `FUN_004c0400` — 0x356 apply (g_StrategyCommandTray.Update). `FUN_004c03b0` — 0x359 apply.
- `FUN_004bfcd0` — shared personnel/strategy redraw trigger (UI refresh, not state).
- `FUN_006105b0`/`00610600`/`00610650`/`006106f0` — u8/u16/u32/i16 stream readers (vtable @0x681f44).
- `FUN_00610420` — 1-byte block reader (rank/flag/enum/practice bytes).
