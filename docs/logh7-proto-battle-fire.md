# LOGH VII — Battle fire & damage family wire spec (Attack / Shoot / Fight / AirBattle + damage notifies)

Static RE of `G7MTClient.exe` (Ghidra index `.omo/ghidra/export/G7MTClient/`). This is **the core
tactical-combat loop**: how a player issues a fire order, how the authoritative server resolves a hit,
and how the resulting damage / destruction / morale / confusion is broadcast and applied to every
client's entity model. **No client/server launch — static only.**

All field offsets are **into the inner body** (the bytes AFTER the framing prefix). Client→server
inner framing = `[u16 BE code][body]`; server→client conn3 = message32 `[u32 0][u16 code][body]`. Bodies
are **little-endian**. "size" = the declared body size from the dispatcher `FUN_004b8b00` (cross-checked
against each apply's dword copy count).

> **Two serializations per class — read the BINARY one.** Every wire class has *two* (de)serializers:
> a **binary** `Input_<Class>::input_from_stream` (reads fixed-width fields via the `mtStreamInputBuffer`
> getters — vtable `+0x1c` = read 4 bytes u32/float, `+0x24` = read 1 byte; raw copy via
> `FUN_00610420(dst,1,…)` = read 1 byte) and a **text/CSV** `Output_<Class>` (comma/brace-delimited
> ASCII via `FUN_005ff09b`=atoi / `FUN_005ff0a6`=atof, used for logging/debug dumps). **The binary
> Input reader is the real wire layout.** The CSV one is a red herring for our purposes.

---

## 0. Family dispatch table (evidence: `FUN_004b8b00` @ 0x004b8b00)

| Code | Class | Dir | Body | Dispatch-side parser | Notes |
|---|---|---|---|---|---|
| 0x405 | CommandAttackShip | C→S | 0x98 (152) | `FUN_004bfc40(body,1)` | shared w/ Shoot/Warp; `*param_3=body[1]+body[0]` |
| 0x406 | CommandShootShip | C→S | 0x98 (152) | `FUN_004bfc40(body,1)` | identical dispatch to 0x405 |
| 0x404 | CommandWarpShip | C→S | 0x90 (144) | `FUN_004bfc40(body,1)` | sibling (no aim byte pair) |
| 0x407 | CommandFight | C→S | 0x24 (36) | `FUN_004c1070(body,1)` | melee/boarding auto-resolve |
| 0x40e | CommandAirBattle | C→S | 0x98 (152) | `FUN_004c0a80(body,1)` | fighter (Spartanian) combat |
| 0x426 | NotifyAttackedShip | S→C | 0x1c (28) | apply `FUN_004c0df0` (7 dwords) | **THE damage result** |
| 0x427 | NotifyFought | S→C | 0x10 (16) | apply `FUN_004c1130` (4 dwords) | melee result |
| 0x428 | NotifyAirBattle | S→C | 0x18 (24) | apply `FUN_004c0c80` (6 dwords) | fighter-combat damage |
| 0x440 | NotifyMoraleDown | S→C | 0xc (12) | apply `FUN_004c0bc0` (3 dwords) | morale state set |
| 0x43d | NotifyConfusionUnit | S→C | 8 | apply `FUN_004c0c00` (2 dwords) | sets confusion flag |
| 0x43e | NotifyConfusionRecoveredUnit | S→C | 8 | apply `FUN_004c0c40` (2 dwords) | clears confusion |

> **Dispatch-side parser vs apply.** `FUN_004bfc40` / `FUN_004c1070` / `FUN_004c0a80` are called from the
> dispatcher with `mode=1`. With `mode!=0` they take a *cooldown-stamp-only* branch (write the move/fire
> timer into `entity+0x5c0/+0x5bc`). The `mode==0` branch is the real local pre-apply, and it reveals the
> command body field offsets (which dwords are unit ids / target / aim). For C→S the **server only needs
> the body layout** (it doesn't run the client's local stamp). The body layout is fully given by the
> binary `Input_Command… Ship` reader (see §1).

---

## 1. C→S commands

### 1a. CommandAttackShip 0x405 / CommandShootShip 0x406 — body 0x98 (152B)

Binary wire reader: **`Input_CommandAttackShip::input_from_stream` = `FUN_0049ca30`** @ 0x0049ca30 and
**`Input_CommandShootShip::input_from_stream` = `FUN_0049cf90`** @ 0x0049cf90. They are **identical except
Shoot reads one extra aim byte at +0x91**. Both guard `unitCount < 0x21` (max 32) with the error string
`"[Input_CommandAttackShip::input_from_stream] unit_size[%d] is over than 32."` (0x0076b2a0) /
`"…CommandShootShip… is over than 32."` (0x0076b2f0). Cross-check: dispatch `*param_4 = 0x98`.

| Off (hex) | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `base` | payload base ptr/cookie (header). `base+len`=tail. | reader `(+0x1c)(param_1)`; dispatch `body[1]+body[0]` |
| 0x04 | 4 | u32 | `len`/time | payload length / time anchor (header). | reader `(+0x1c)(param_1+4)` |
| 0x08 | 4 | u32 | `field8` | header slack (3rd dword, unused by fire math). | reader `(+0x1c)(param_1+8)` |
| 0x0c | 1 | u8 | **`unitCount`** | number of attacker ship ids (1..32). | reader `(+0x24)(param_1+0xc)`; guard `<0x21`; loop bound |
| 0x0d | 3 | — | pad | high 3 bytes of dword 3. | only low byte consumed |
| 0x10 | 4×N | u32[] | **`attackerIds`** | attacking ship ids (`unitCount` entries, stride 4). | reader loop `iVar=param_1+0x10; (+0x1c)(iVar); iVar+=4` |
| … | — | — | (id array occupies 0x10 … 0x10+4*unitCount; max 32 → up to 0x90) | | |
| 0x90 | 1 | u8 | **`weaponType`** | weapon / fire mode selector (0..0x1a; 0xff = default). Drives damage class + visual (see §3). | `FUN_00610420(param_1+0x90,1,0,2)` (raw 1-byte read) |
| 0x91 | 1 | u8 | **`aimMode`** (Shoot only) | secondary aim/volley selector. **Present only in 0x406 Shoot** — Attack does NOT read it. | Shoot: extra `FUN_00610420(param_1+0x91,1,0,2)`; Attack omits it |
| 0x92 | 2 | — | pad | | |
| 0x94 | 4 | u32 | **`targetId`** | the target ship/base id. | reader `(+0x1c)(param_1+0x94)` |
| 0x98 | — | — | end (152B total) | | dispatch size 0x98 |

**Attack vs Shoot (semantic difference).** Layout is byte-identical except Shoot's extra `aimMode`@0x91.
- **0x405 Attack** = sustained / close-range engagement (one weaponType, no aim sub-mode). The
  multi-attacker array lets a player order a whole sub-unit (up to 32 ship records) to focus one target.
- **0x406 Shoot** = beam volley with an explicit aim/volley sub-mode (`aimMode`@0x91), e.g. choosing a
  salvo pattern / aim point. Otherwise resolves to the same `NotifyAttackedShip` damage broadcast.

> Confidence on the **0x90/0x91 split**: HIGH that Attack reads one trailing byte and Shoot reads two,
> and that the final u32 is the target id — straight from the two readers. The exact *semantic* of
> `weaponType`/`aimMode` (which weapon slot vs which fire pattern) is MEDIUM; what is certain is that
> `weaponType` (0x90) is the byte fed to the damage-class mapper on the notify side (`FUN_004c7790`).

Dispatch-side stamp parser `FUN_004bfc40` (mode 1 branch) reads the **same** shape: count at `body[3]`
(byte @0xc), ids from `body+4` (`piVar3=param_2+4`, stride 1 dword), and stamps `entity+0x5c0/+0x5bc`
(fire cooldown) for each looked-up attacker — confirming `attackerIds` start @0x10 with count @0xc.

### 1b. CommandFight 0x407 — body 0x24 (36B)

Parser **`FUN_004c1070`** @ 0x004c1070 (mode 0 branch = the apply, mode 1 = cooldown stamp). Reads two
ids out of the body:

| Off (hex) | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `base` | header. | `*param_2` |
| 0x04 | 4 | u32 | `len`/time | header / time anchor. | `param_2[1]` |
| 0x08 | 4 | u32 | `field8` | header slack. | unread in math |
| 0x0c | 4 | u32 | **`attackerId`** | the boarding/melee initiator ship id. | `param_2[3]` → `FUN_004c7cd0(...,1,...)` = iVar2 |
| 0x10 | 4×? | — | (slack between attacker and target) | | |
| 0x20 | 4 | u32 | **`targetId`** | the ship being boarded / fought. | `param_2[8]` → lookup = iVar1 |
| 0x24 | — | — | end (36B) | | dispatch size 0x24 |

Mode-0 apply writes onto the attacker entity: `entity+0x5c4 = 3` (fight/melee state), `entity+0x5c8 =
target.field4` (target id), `entity+0x5cc = target.field8` (target faction byte). So a Fight command
**latches the attacker into a "boarding" state vs a target**; the server auto-resolves it and replies
`NotifyFought 0x427`. Confidence: targetId @0x20 (`param_2[8]`) HIGH; the exact slack between is just
zero-padded header room.

### 1c. CommandAirBattle 0x40e — body 0x98 (152B)

Parser **`FUN_004c0a80`** @ 0x004c0a80. Same multi-attacker shape as Attack/Shoot but the **target is a
single id at body byte 0x94** (`param_2[0x25]`), and the parser iterates the attacker id array running a
faction check.

| Off (hex) | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 8 | — | `base`,`len` | header (same as Attack). | `param_2[0]`,`param_2[1]` |
| 0x08 | 4 | u32 | `field8` | header slack. | |
| 0x0c | 1 | u8 | **`unitCount`** | attacker (fighter-carrier) count 1..32. | `*(byte*)(param_2+3)`; loop bound; guard "over than 32" (0x0076b46c) |
| 0x10 | 4×N | u32[] | **`attackerIds`** | attacking unit ids. | `piVar4=param_2+4`, stride 1 dword |
| 0x94 | 4 | u32 | **`targetId`** | the targeted enemy unit. | `param_2[0x25]` (= byte 0x94) |
| 0x98 | — | — | end (152B) | | dispatch size 0x98 |

Mode-0 apply: for each attacker, `FUN_004b3460(attacker, target, kind)` triggers the air-battle visual
with `kind = 5` if attacker & target share faction bytes `+0xa` and `+0xb` (`*(char*)(e+0xa)` &
`*(char*)(e+0xb)`) else `kind = 4`. So `+0xa`/`+0xb` are the entity's **faction / affiliation** bytes
used to pick the dogfight animation. The damage itself arrives via `NotifyAirBattle 0x428`.

---

## 2. S→C damage / status notifies (THE damage model)

### 2a. NotifyAttackedShip 0x426 — body 0x1c (28B) — **THE core damage broadcast**

Apply: big switch case 0x426 in `FUN_004ba2b0` copies **7 dwords** (28B) into static buffer
`DAT_004332b4`, then calls the damage applier **`FUN_004c0df0`** @ 0x004c0df0. Field offsets are read by
that applier from `param_2` (= the 28-byte body):

| Off (hex) | Size | Type | Field | Meaning | Evidence (`FUN_004c0df0`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `seq`/header | header dword (not consumed by the applier; sequence/source tag). | not read in `FUN_004c0df0` |
| 0x04 | 4 | u32 | **`attackerId`** | attacker ship id → looked up (iVar3) for the visual link. | `FUN_004c7cd0(...,*(param_2+4),1,...)` |
| 0x08 | 1 | u8 | **`weaponType`** | weapon byte → `FUN_004c7790` → damage class (1/2/3); if nonzero triggers visual `FUN_004b3460`. | `FUN_004c7790(*(u8)(param_2+8))` |
| 0x09 | 3 | — | pad | | |
| 0x0c | 4 | u32 | **`targetId`** | the hit ship id → looked up (iVar4); all damage written onto it. | `FUN_004c7cd0(...,*(param_2+0xc),1,...)` |
| 0x10 | 2 | u16 | **`newDurability`** | new **durability/HP** value (`-1`/0xffff = "no change"). Applier computes `damage = maxHP − value` and **sets** `target+0x8d4 = maxHP − value`. | `*(short*)(param_2+0x10)`; `local_14 = template[0x218] − v`; `*(int*)(iVar4+0x8d4)=local_14` |
| 0x12 | 2 | u16 | **`newArmor`** (zanki) | new **secondary durability** (残機 / armour) value (`-1` = none). Applier sets `target+0x8d8 = maxHP − value` and logs `iZankiDamage_kita`. | `*(short*)(param_2+0x12)`; `iVar6=template[0x218]−v`; `*(int*)(iVar4+0x8d8)=iVar6` |
| 0x14 | 1 | u8 | **`hitSlot`** | hit location / damaged-section index (0..5). If `<6` sets on-fire flag `target+0x8e0+hitSlot = 1` and stores section shield-loss float at `target+0x8e8+hitSlot*4`. | `*(byte*)(param_2+0x14)`; `if(<6){ *(u8)(0x8e0+slot+iVar4)=1; *(float)(iVar4+0x8e8+slot*4)=fVar2; }` |
| 0x16 | 2 | u16 | **`newShield`** | new **shield** value (`-1` = none). Applier computes shield damage `= maxShield − value` (`template+0x288`); float `fVar2` drives the on-fire/section damage above. | `*(short*)(param_2+0x16)`; `local_1c = template[0x288] − v` (u16) |
| 0x18 | 1 | u8 | **`statusByte`** | morale / status byte → **always** written to `target+0x954` (ship status/morale). | `*(u8)(iVar4+0x954) = *(u8)(param_2+0x18)` |
| 0x19 | 3 | — | pad | (rounds body to 28). | |
| 0x1c | — | — | end (28B) | | dispatch size 0x1c |

**Damage model the server must implement (authoritative resolution of a fire command):**
1. Look up `attacker` and `target` in the tactical pool (`FUN_004c7cd0`, mode 1 = ship table).
2. The notify carries **resulting values, not deltas** — the server decides the new HP/armor/shield and
   sends the post-hit numbers. Client recomputes the delta only for the floating combat-text popup
   (`damage = maxStat − newValue`).
3. **HP/durability** → `target.durability (+0x8d4)` = `newDurability`. (Encoded on the wire as
   `maxHP − newDurability`; the client subtracts again, so on the wire send `maxHP − desiredHP`.)
   - `newDurability == 0xffff` (-1) ⇒ no HP change this packet.
4. **Armor (zanki)** → `target.armor (+0x8d8)` similarly (wire = `maxHP − value`; -1 = unchanged).
5. **Shield** → section shield-loss float at the hit slot; `target.shield` tracked via the per-section
   array. Encoded `maxShield − newShield`.
6. **Hit slot 0..5** → set `target.onFire[hitSlot] (+0x8e0+slot) = 1` and the section damage float at
   `+0x8e8+slot*4`. Six destructible sections per ship.
7. **statusByte** → `target.status (+0x954)` (morale / disabled state).
8. **Destruction** is signalled by HP/armor reaching the floor (see §2g — `target.durability=0` &
   `shield=0` & on-fire flags cleared is the destroyed/cleared state; a separate notify/flagship path
   removes the entity). The client renders death from HP=0 + the visual triggered by `weaponType`.

> Sign convention: `if (target.isBase /* +0x9 */) local_18 = local_c;` and a base-flag branch zero the
> shield deltas — bases take HP damage but not the per-section ship shield model. `bVar7 = (durability
> field == -1)` short-circuits "no damage this packet, just a status/visual ping".

### 2b. NotifyAirBattle 0x428 — body 0x18 (24B)

Apply: case 0x428 copies **6 dwords** (24B) to `local_18+0x438254`, then **`FUN_004c0c80`** @ 0x004c0c80.

| Off (hex) | Size | Type | Field | Meaning | Evidence (`FUN_004c0c80`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `seq`/header | not consumed. | — |
| 0x04 | 4 | u32 | **`attackerId`** | attacker (carrier) id (iVar5). | `FUN_004c7cd0(...,*(param_2+4),1,...)` |
| 0x08 | 4 | u32 | **`targetId`** | target id (iVar4); damage applied to it. | `FUN_004c7cd0(...,*(param_2+8),1,...)` |
| 0x0c | 1 | u8 | **`showVisual`** | if `==1` trigger air-battle visual `FUN_004b3460(att,tgt,6)`. | `if(*(char*)(param_2+0xd)==1) …` (byte @0xd, high byte of dword3) |
| 0x0d | 1 | u8 | (`showVisual` is actually @0x0d) | see note | the read is `param_2+0xd` |
| 0x0e | 2 | u16 | **`newDurability`** | sets `target.durability (+0x8d4) = maxHP(template+0x218) − value`. | `*(u16)(param_2+0xe)`; `*(int*)(iVar4+0x8d4)=template[0x218]−v` |
| 0x10 | 2 | u16 | **`newShield`** | sets `target.armor (+0x8d8) = maxHP − value`; shield delta → popup. | `*(u16)(param_2+0x10)`; `iVar6=template[0x218]−v; *(int*)(iVar4+0x8d8)=iVar6` |
| 0x12 | 1 | u8 | **`hitSlot`** | section index (0..5). If target not a base (`+0x9==0`) & slot<6 & `0x14 != 0xffff`: set `target.onFire[slot] (+0x8e0+slot)=1` and section float `+0x8e8+slot*4 = maxShield(template+0x288) − sectionShield`. | `*(byte*)(param_2+0x12)` |
| 0x14 | 2 | u16 | **`sectionShield`** | section shield value (0xffff = skip section damage). | `*(u16)(param_2+0x14)` |
| 0x16 | 1 | u8 | **`statusByte`** | → `target.status (+0x954)`. | `*(u8)(iVar4+0x954)=*(u8)(param_2+0x16)` |
| 0x17 | 1 | — | pad | | |
| 0x18 | — | — | end (24B) | | dispatch size 0x18 |

Air-battle damage is a **simplified single-target** version of 0x426 (one durability + one shield + one
section). The dogfight `kind` (5 same-faction vs 4 cross-faction) is chosen on the **command** side; the
notify's `showVisual` just gates the explosion FX (`kind 6`).

### 2c. NotifyFought 0x427 — body 0x10 (16B)

Apply: case 0x427 copies **4 dwords** (16B) to `param_1+0x438244`, then **`FUN_004c1130`** @ 0x004c1130.

| Off (hex) | Size | Type | Field | Meaning | Evidence (`FUN_004c1130`) |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `seq`/header | not consumed. | — |
| 0x04 | 4 | u32 | **`attackerId`** | the boarder/winner ship (iVar1). | `FUN_004c7cd0(...,*(param_2+4),1,...)` |
| 0x08 | 4 | u32 | **`targetId`** | the boarded/loser ship (iVar2). | `FUN_004c7cd0(...,*(param_2+8),1,...)` |
| 0x0c | 1 | u8 | **`resultByte`** | melee result code (only applied when the two combat-clock checks `FUN_004b5c00()==FUN_004b5b80()` agree; written to `*(client+8)+0x1cd`). | `*(u8)(param_2+0xe)` (byte @0xe = high byte of dword3) |
| 0x0d/0xf | 3 | — | pad/slack | | |
| 0x10 | — | — | end (16B) | | dispatch size 0x10 |

Apply effect: `FUN_004b3460(att,tgt,7)` (boarding visual, kind 7), **clears the attacker's fight latch**
(`att+0x5c4=0`, `+0x5cc=0`, `+0x5c8=0` — undoing the `CommandFight` state), stores the result, then
relays via `FUN_00517cd0(0x427, body)` and pops floating text `FUN_004b3500(att,tgt,-1,-1,0)`. So
NotifyFought = "the boarding action between A and B is resolved; result=byte@0xe". HP/morale changes
from the boarding arrive separately as 0x426/0x440. Confidence: ids HIGH; `resultByte`@0xe MEDIUM (it is
the only body field consumed, gated by a clock-sync check).

### 2d. NotifyMoraleDown 0x440 — body 0xc (12B)

Apply: case 0x440 copies **3 dwords** (12B) to `param_1+0x433140`, then **`FUN_004c0bc0`** @ 0x004c0bc0.

| Off (hex) | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `seq`/header | not consumed by applier. | — |
| 0x04 | 4 | u32 | **`unitId`** | the ship whose morale drops (looked up). | `FUN_004c7cd0(...,*(param_2+4),1,...)` |
| 0x08 | 1 | u8 | **`moraleValue`** | new morale/status byte → `unit+0x954` (same field 0x426 writes). | `*(u8)(iVar1+0x954)=*(u8)(param_2+8)` |
| 0x09 | 3 | — | pad | | |
| 0x0c | — | — | end (12B) | | dispatch size 0xc |

So **morale lives in entity `+0x954`** (the same `statusByte` slot the damage notifies set). NotifyMoraleDown
is a dedicated way to push just that byte (e.g. after taking fire, losing the flagship, or a black-hole event).

### 2e. NotifyConfusionUnit 0x43d — body 8

Apply: case 0x43d copies **2 dwords** to `param_1+0x43314c`, then **`FUN_004c0c00`** @ 0x004c0c00.

| Off (hex) | Size | Type | Field | Meaning | Evidence |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `seq`/header | not consumed. | — |
| 0x04 | 4 | u32 | **`unitId`** | the confused ship id (looked up). | `FUN_004c7cd0(...,*(param_2+4),1,...)` |
| 0x08 | — | — | end (8B) | sets `unit+0x956 = 1` (confusion flag). | `*(u8)(iVar1+0x956)=1` |

### 2f. NotifyConfusionRecoveredUnit 0x43e — body 8 (counterpart)

Apply: case 0x43e copies 2 dwords to `param_1+0x433154`, then `FUN_004c0c40`. Same `unitId` @0x04;
clears `unit+0x956 = 0`. (Mirror of 0x43d.)

### 2g. Destruction / repair reference (cross-checked from sibling appliers)

- **NotifyShootFortress 0x436** apply `FUN_004bfb70` (mode 0): for each hit unit, `unit.durability
  (+0x8d4)=0`, `unit.shield (+0x8d8)=0`, **zero the 6 section floats** `+0x8e8…+0x8e8+20`, then big
  popup `FUN_004b3500(...,9999,9999,...)` = the **destroyed** presentation. ⇒ HP=0 & shield=0 & sections
  cleared **is the destroyed state**; a value of 9999/9999 in the popup args is the "kill" marker.
- This confirms the destruction model: when the server's hit resolution drops a target's durability to 0,
  it sends `NotifyAttackedShip` with `newDurability` encoding HP=0 (wire value = maxHP); the client then
  treats HP=0 as destroyed and plays the death FX keyed by `weaponType`.

---

## 3. Weapon-type → damage-class map (evidence: `FUN_004c7790` @ 0x004c7790)

The `weaponType` byte (command @0x90, notify @0x08) maps to a damage/visual class used by the effect
trigger `FUN_004b3460`:

| weaponType byte | class returned | meaning (inferred) |
|---|---|---|
| 0x00–0x07 | 1 | beam / main-gun class |
| 0x08–0x0b | 3 | missile / torpedo class |
| 0x0c–0x0f | 2 | secondary / point-defense class |
| 0x10–0x1a | 0 (passthrough) | special / environmental |
| 0xff | (none) | no-weapon ping (status only) |
| >0x1a | logs warning, 0 | invalid |

Confidence on the *exact* weapon names is LOW (the binary only groups them into 4 classes); confidence on
the **byte ranges and that this byte is the weapon selector** is HIGH.

---

## 4. Entity combat-stat struct (the per-ship tactical record)

The tactical entity pool is at `client+0x126718`; `FUN_004c7cd0(pool, id, mode, f1,f2,f3)` resolves an id
to a record pointer. **mode 1** = ship table (600 entries, stride **0x9ec**, id at record+4, faction bytes
at record+5/+6/+7); **mode 0** = base/fortress table (10 entries, stride 0x8cc, id at record+0x... , flag
fields at record+0xd/0xe). `f1/f2/f3 = 0xff` (-1) are faction wildcards.

Confirmed combat-stat field offsets **into the ship record** (from the damage/repair/destroy appliers):

| Entity off | Type | Field | Meaning | Evidence |
|---|---|---|---|---|
| +0x04 | u32 | `id` | unit/ship id (match key). | `FUN_004c7cd0` mode 1 `*piVar2==id` |
| +0x05..+0x07 | u8×3 | `faction`,`affil`,`team` | faction / affiliation / team filter bytes. | lookup filters; also `+0xa/+0xb` faction compare in AirBattle |
| +0x09 | u8 | `isBase` | base flag (alters shield handling). | `if(*(char*)(iVar4+9)) local_18=local_c` in 0x426 / 0x428 |
| +0x0a, +0x0b | u8 | `factionA`,`factionB` | dogfight same/cross-faction selector. | `FUN_004c0a80`: `e2+0xa==e3+0xa && e2+0xb==e3+0xb` |
| +0x14..+0x28 | f32[6] | `pose` | world transform (x,y,z,…) copied to FX. | `FUN_004b3460` copies 6 dwords from `+0x14` |
| +0x5c0 / +0x5bc | i32 | `fireCooldown` | fire/move timer (stamped by command parsers). | `FUN_004bfc40` writes `(body[1]+body[0])−now` |
| +0x5c4 | u8 | `fightState` | 3 = boarding/fight latched, 0 = idle. | `FUN_004c1070` sets 3; `FUN_004c1130` clears to 0 |
| +0x5c8 | u32 | `fightTargetId` | boarding target id. | `FUN_004c1070` `=target+4` |
| +0x5cc | u8 | `fightTargetFaction` | boarding target faction byte. | `FUN_004c1070` `=target+8` |
| +0x8bc | u16 | `shipTypeId` | index into static ship template table (stride **0x2a8**, base `DAT_007ccffc+0x2c1a78`). | `template = base + shipType*0x2a8` in 0x426/0x428 |
| +0x8d4 | u32/i32 | **`durability`/HP** | current hull HP. 0 = destroyed. | written by every damage applier |
| +0x8d8 | u32/i32 | **`armor`/zanki** | current secondary durability (残機/armour). 0 = gone. | written by 0x426/0x428; zeroed on destroy |
| +0x8e0..+0x8e5 | u8[6] | **`onFire[6]`** | per-section on-fire / damaged flags. | `*(u8)(0x8e0+slot+e)=1` on hit; zeroed on full repair |
| +0x8e8..+0x8eff | f32[6] | **`sectionDamage[6]`** | per-section shield/damage float. | `*(float)(e+0x8e8+slot*4)=…`; zeroed on destroy/repair |
| +0x954 | u8 | **`status`/morale** | morale / disabled status byte. | written by 0x426, 0x428, 0x440 |
| +0x956 | u8 | **`confused`** | confusion flag (1=confused). | set by 0x43d, cleared by 0x43e |

Static ship **template** fields (per-shipType, stride 0x2a8):

| Template off | Type | Field | Meaning | Evidence |
|---|---|---|---|---|
| +0x218 | i32 | `maxDurability` | max hull HP (used to decode wire `maxHP − newHP`). | `template[0x218] − value` in 0x426/0x428 |
| +0x288 | u16 | `maxShield` | max shield (used to decode `maxShield − newShield`). | `template[0x288] − value` |

> The **full** per-ship combat stats (beam power, attack/defense/mobility, troop counts, fighter counts,
> fuel) live in `ResponseTacticsInformationUnitShip 0x33b` (body 0x79e4 ≈ 600 records). Its binary record
> stride and per-record fields are a separate (large) RE task — the `Input_ResponseTacticsUnitShip`
> string (0x00763fcc, guard "over than 600") marks the reader; `FUN_00422190` is the CSV variant showing
> the per-record field *order* (id, byte, byte, u32, then a run of floats = the stat block). For the
> **fire/damage loop**, the runtime fields above (HP/armor/shield/section/status/morale/confusion) are
> the authoritative set the server mutates; the static stat block only supplies the caps + weapon power
> for computing how much damage a hit deals.

---

## 5. Server to-do (authoritative combat engine)

(Docs only — do NOT edit `src/server/logh7-command-engine.mjs` in this RE pass.)

### 5a. Parse the fire commands
- [ ] **0x405 Attack / 0x406 Shoot** (`0x98`): read header (0..0x0b ignore), `unitCount=body[0xc]`
      (clamp 1..32), `attackerIds = body[0x10 + i*4]` for i<unitCount, `weaponType=body[0x90]`,
      `aimMode=body[0x91]` (**Shoot only**), `targetId=body[0x94]`.
- [ ] **0x40e AirBattle** (`0x98`): same `unitCount`@0xc + `attackerIds`@0x10; `targetId=body[0x94]`.
- [ ] **0x407 Fight** (`0x24`): `attackerId=body[0x0c]`, `targetId=body[0x20]`.
- [ ] Validate ownership of every `attackerId` (the issuing account must control the unit) and that
      `targetId` is a valid enemy in the same tactical field; reject otherwise (`NotifyError 0x501`).

### 5b. Resolve the hit (authoritative damage math) and broadcast
- [ ] For Attack/Shoot/AirBattle: compute damage from the attacker's stat block (beam power etc. from
      0x33b) vs the target's `maxShield`/`maxDurability`, applying shield → armor(zanki) → durability in
      that order, and pick a `hitSlot` (0..5). The exact per-tick damage formula needs a stat-block RE or
      a live capture; until then a simple `damage = attackerBeamPower − targetDefense` clamped ≥0 is a
      faithful placeholder (mark TODO).
- [ ] Emit **`NotifyAttackedShip 0x426`** (28B): `[u32 seq][u32 attackerId][u8 weaponType][3 pad]
      [u32 targetId][u16 newDurability][u16 newArmor][u8 hitSlot][u16 newShield][u8 statusByte][3 pad]`,
      where the u16 stat fields are sent as **`maxStat − desiredValue`** (the client subtracts again).
      Use `0xffff` for any stat that did not change this packet. Broadcast to all clients in the field.
- [ ] For air combat emit **`NotifyAirBattle 0x428`** (24B): `[u32 seq][u32 attackerId][u32 targetId]
      [u8 showVisual @0x0d][u16 newDurability @0x0e][u16 newShield @0x10][u8 hitSlot @0x12]
      [u16 sectionShield @0x14][u8 statusByte @0x16][1 pad]`. (Note the off-by-one byte packing —
      `showVisual` is byte 0x0d, not 0x0c.)
- [ ] For boarding emit **`NotifyFought 0x427`** (16B): `[u32 seq][u32 attackerId][u32 targetId]
      [u8 resultByte @0x0e][pad]`; follow with 0x426/0x440 for the actual HP/morale change.

### 5c. Status / destruction
- [ ] Track per-ship state server-side: `durability`, `armor`, `shield`, `onFire[6]`, `sectionDamage[6]`,
      `status/morale`, `confused`. These mirror the client's entity offsets and are what the notifies set.
- [ ] **Destruction:** when `durability` hits 0, send the 0x426 that encodes HP=0 (and shield=0); the
      client renders death + the `weaponType` FX. (Sibling 0x436 ShootFortress shows the kill path
      zeroes HP, shield, and the 6 section floats and pops a 9999/9999 marker.)
- [ ] **Morale:** push **`NotifyMoraleDown 0x440`** (12B) `[u32 seq][u32 unitId][u8 morale][3 pad]` to
      set `+0x954` when morale changes (after losing flagship, sustained fire, etc.).
- [ ] **Confusion:** **`NotifyConfusionUnit 0x43d`** (8B) `[u32 seq][u32 unitId]` sets confused;
      **`NotifyConfusionRecoveredUnit 0x43e`** (8B) clears it.

### 5d. Framing / endianness
- [ ] S→C uses message32 wrapping `[u32 0][u16 BE code][LE body]`. Inner code is **big-endian**, body is
      **little-endian**. The `seq`/header dword (body 0x00) of each notify is not consumed by the client
      apply — set 0 (or a server sequence) safely.
- [ ] C→S inner = `[u16 BE code][LE body]`; body header dwords 0/1 (base/len) are the client's serialized
      payload pointer/length pair — the server ignores them for combat (they only feed the client's local
      cooldown stamp).

---

## 6. Open questions

1. **`weaponType`/`aimMode` exact semantics.** The byte ranges → 4 damage classes are solid; *which*
   physical weapon (main beam vs secondary vs missiles) each sub-range is, and what `aimMode`@0x91
   selects on Shoot (volley pattern? aim point?), need a live capture of a real 0x406 or the weapon
   stat-table RE. (MEDIUM/LOW.)
2. **Per-hit damage formula.** The notifies carry *resulting* HP/shield, so the *amount* of damage is
   decided server-side. The original server's formula (beam power, range falloff, shield mitigation,
   crit/`hitSlot` selection) is not in the client; reconstruct from `0x33b` stat fields + canon, or
   capture. The client only needs correct post-hit values.
3. **`hitSlot` (0..5) meaning.** Six destructible sections per ship (bow/port/starboard/stern/etc.?).
   The mapping of slot index → physical section is cosmetic for damage but matters for repair UI;
   unconfirmed which index is which section.
4. **NotifyFought `resultByte`@0xe.** It's the only body field consumed and is gated by a combat-clock
   sync check before being stored at `(client+8)+0x1cd`. Whether it's a win/loss/casualty code is
   inferred (MEDIUM).
5. **`armor`/zanki (+0x8d8) vs shield (+0x16/+0x14).** Both 0x426 and 0x428 decode `+0x8d8` as
   `maxHP − value` (same cap as durability), suggesting `+0x8d8` is a *second hull pool* (残機 = remaining
   hull/lives) rather than a regenerating shield; the true regenerating shield is the per-section float at
   `+0x8e8`. Naming kept as `armor`/`zanki`; confirm with a capture of a shielded ship taking a beam hit.
6. **Static stat block (`0x33b`) field map.** Full per-ship beam power / attack / defense / mobility /
   troop & fighter counts are needed for the damage formula and are a separate large RE (binary record
   stride for 600 ships in a 0x79e4 body). The CSV reader `FUN_00422190` shows the field *order*.

---

### Evidence index (Ghidra addrs)
- `FUN_004b8b00` — inner dispatch (codes/sizes for 0x404–0x40e, 0x426–0x442).
- `FUN_0049ca30` — `Input_CommandAttackShip` (0x405 wire reader).
- `FUN_0049cf90` — `Input_CommandShootShip` (0x406 wire reader; extra aim byte @0x91).
- `FUN_004bfc40` — Attack/Shoot/Warp dispatch-side cooldown stamp (confirms id array @0x10, count @0xc).
- `FUN_004c1070` — CommandFight 0x407 parser (attacker @0x0c, target @0x20; sets fight latch).
- `FUN_004c0a80` — CommandAirBattle 0x40e parser (id array @0x10, target @0x94; faction dogfight kind).
- `FUN_004ba2b0` — big S→C apply switch (cases 0x426/0x427/0x428/0x440/0x43d/0x43e and dword copy counts).
- `FUN_004c0df0` — **NotifyAttackedShip 0x426 damage applier** (the damage model).
- `FUN_004c0c80` — NotifyAirBattle 0x428 applier.
- `FUN_004c1130` — NotifyFought 0x427 applier (clears fight latch, relays 0x427).
- `FUN_004c0bc0` — NotifyMoraleDown 0x440 applier (`+0x954`).
- `FUN_004c0c00` / `FUN_004c0c40` — Confusion set/clear 0x43d/0x43e (`+0x956`).
- `FUN_004bfb70` — NotifyShootFortress 0x436 applier (destruction reference: HP/shield/sections → 0).
- `FUN_004c7790` — weaponType → damage-class mapper.
- `FUN_004c7cd0` — tactical entity lookup (mode 1 ship table stride 0x9ec, mode 0 base table stride 0x8cc).
- `FUN_004b3460` / `FUN_004b3500` — combat visual / floating-damage-text triggers.
- `FUN_00422190` — `Input_ResponseTacticsUnitShip` CSV reader (per-ship stat field order, for 0x33b).
