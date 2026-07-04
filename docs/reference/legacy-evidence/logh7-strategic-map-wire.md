# LOGH VII strategic sector-map wire format (0x0313 / 0x0315)

Static reverse-engineering of `G7MTClient.exe` to determine the exact wire data the server
must send so a player's fleet appears as a controllable object on the strategic sector map.

**Source export:** `E:/logh7-revival/.omo/ghidra/export/G7MTClient.exe/functions.jsonl`
(query with `python -m tools.logh7_redex func <addr>` / `grep` / `calls`).

**Original method:** every claim in the first pass cited a function address + decompiled line.
Later live-client corrections are called out explicitly where they supersede the static-only notes.

**2026-06-16 live correction:** `0x0315` is still a fixed 5004-byte record, but the
wire count at payload `+2` is a **BE RLE byte length**, not a LE pair count. The
message-object input parser `FUN_004134e0` helper-reads this value before the
dispatcher/`FUN_004abbb0` path sees the parsed buffer.

**2026-06-19 navigability model (RE high-confidence + manual p31, supersedes loop-state.md:195):**
The **navigability of a cell is NOT the raw 0x0315 cell value** — the cell value `V` is only an index
into the 0x0313 object table, and the gate keys on **`objectTable[V].byte1` (the class byte)**:
`FUN_004d6310`: `iVar3 = FUN_004d35b0(col,row); if (iVar3 != 1 && iVar3 - 3 != 0) return blocked;`
where `FUN_004d35b0` returns `objectTable[V*3 + 1]`. So a cell is **navigable IFF its object class byte1
∈ {1, 3}** — `1` = open navigable space (空間), `3` = navigable clickable marker (system/fleet); **any
other class (0, 2, …) is impassable**. The gate is **client-side** (it also drives the move-range overlay
`FUN_004d6480` and the destination commit `FUN_004d4e90`), so a blocked target **never emits `0x0b01`**.
Consequence: a background of cell value 0 with no object record (`byte1=0`) is **silently impassable** —
the entire non-marker board was non-navigable, leaving a fleet nowhere to warp (a likely 0x0b01 movement
blocker). The grid-type labels (0=プラズマ嵐 / 1=空間 / 2=航行不能, constmsg group 0x18 subIds, verified
against `content/client/msgdat.json`) are **byte0 display labels only**, not the navigability gate.

Manual p31 (P1) confirms the terrain semantics: 空間グリッド (navigable empty), 星系グリッド (navigable,
holds a system), 航行不能グリッド and 地形障害 (プラズマ嵐 / サルガッソ・スペース) — "いかなる旗艦/艦艇ユニット
も進入することができません" = impassable. **Plasma storm is STATIC** (no manual/msgdat dynamics; the record
is `ResponseStatic…`; the client snapshot `FUN_004c5350` is run-once). Plasma and 航行不能 are behaviorally
identical (both impassable); only the byte0 label differs.

**Server terrain encoding (`buildStrategicGalaxyGrid({ terrain:true })`, gate `LOGH_STRAT_TERRAIN=1`):**
navigable mask cell → value 1 (空間) with `objectTable[1] = {byte0:1, byte1:1}`; non-mask → value 2
(航行不能) with `objectTable[2] = {byte0:2, byte1:2}` (blocked); optional plasma cells → value 0 with
`objectTable[0] = {byte0:0, byte1:2}` (blocked, distinct label); systems → 4+idx, fleet → 3 (byte1:3).
The real 100×50 board RLE-encodes to ~970 B (well under the 5000 B budget). Plasma cell LOCATIONS have
**no P1 source** (manual names the type but never places it; p101 銀河マップ has no body text), so the
overlay defaults empty (`content/galaxy-plasma-cells.json` absent) until recovered from the 星系図 nebula
(P2) or designed (P3). ⚠️ Only emit the terrain grid on the 0x0f02 path — a non-empty 0x0315 at 0x0314
re-triggers the G210b world-init stall (early-grid is gated off by default).

---

## TL;DR

- **0x0313 ResponseStaticInformationGridType** = the **object table**: `[u8 count]` followed by
  `count` sequential **3-byte** records, declared wire size **0x138c (5004) bytes** (fixed).
  Object bytes:
  **byte0 = content-table record id** (resolved via `FUN_00522010(0x18, byte0)`),
  **byte1 = object type/class** (only `byte1 == 3` is placed/rendered as a map marker),
  **byte2 = sprite/color variant** (0..6, with 8→7).
- **0x0315 ResponseStaticInformationGrid** = the **cell grid**: RLE-encoded
  `[u8 w][u8 h][u16 BE rleByteCount]{[u8 run][u8 value]}…`, decoded by `FUN_004abbb0`,
  declared wire size **0x138c (5004) bytes** (fixed — same as 0x0313). The count is the
  byte length of the run/value region, so the pair count is `rleByteCount / 2`. Each decoded cell
  value `v` (2..88) indexes the
  object table: `objectRecord = &objectTable[v*3]`.
- **The 0x0315 "fails to dispatch" quirk root cause is the fixed 5004-byte size table entry**
  (`FUN_004b8b00` case `0x313/0x315 → *size = 0x138c`). A compact RLE frame shorter than 5004 bytes
  is not enqueued/decoded as-is — see §4.
- **Fleet→object linkage is NOT done client-side from the unit table.** The strategic object table
  is populated **only** from 0x0313+0x0315. The "this is my fleet" identity for the HUD flows
  separately: selected-char-id → char record `record[9]`=unitId (@0x24) → unit table (`0x41a368`,
  stride 0x58) → PLAYER_INFO. A sector object is tied to a fleet purely by **byte0** (its
  content-record id) — the server decides which object id is the player's fleet. See §5.

---

## 0. Memory map (client globals, `clientBase = DAT_007ccffc`)

| Global (clientBase+) | Name | Role | Source msg |
|---|---|---|---|
| `0x2c03c0` | `cellGrid.loaded` flag (u8) | guard set by `FUN_004c5350` | — |
| `0x2c03c4` | `cellGrid.ready` (u32=1) | set by `FUN_004c5350` | — |
| `0x2c03c8` | cell-grid staging base | dest of 0x4e3-dword copy | 0x0315 |
| `0x2c03cc` | **cell grid** 100×50 bytes | `+4` into staging = decoded cells | 0x0315 |
| `0x2c1754` | object-table staging base | dest of 0x4b-dword+1B copy | 0x0313 |
| `0x2c1755` | **object table** 100×3 bytes | `+1` into staging | 0x0313 |
| `0x3f4448` | 0x0315 raw landing (5004B) | dispatcher bulk-copy dest | 0x0315 |
| `0x3f444c` | 0x0315 RLE decode dest (`0x3f4448+4`) | `FUN_004abbb0` writes here | 0x0315 |
| `0x3f57d4` | 0x0313 raw landing (301B) | dispatcher bulk-copy dest | 0x0313 |
| `0x41a364` | unit count (u16) | | 0x0325 |
| `0x41a368` | **unit table**, stride **0x58** (88B) | | 0x0325 |
| `0x3584a0` | locally-selected char id (u32) | written by case 0x204 | 0x0204 |
| `0x36a8b4` | char record array, stride 0x2d4 (724B) | count @ `0x36a5dc` | 0x0323 |
| `0x126714` | **own-unit marker** (u32) | player's own unit id | (world-build) |
| `clientBase+0xc` | PLAYER_INFO table, stride 0x370 | id @ slot+0x24 | (built by `FUN_004c2c80`) |

---

## 1. The copy that splits staging → live tables — `FUN_004c5350`

```
FUN_004c5350(param_1 = clientBase):
  if (clientBase+0x2c03c0 == 0):            // run-once guard
    clientBase+0x2c03c0 = 1;  clientBase+0x2c03c4 = 1;
    // CELL GRID: 0x4e3 = 1251 dwords = 5004 bytes  0x3f4448 -> 0x2c03c8
    copy 1251 dwords from (clientBase+0x3f4448) to (clientBase+0x2c03c8);
    // OBJECT TABLE: 0x4b = 75 dwords + 1 byte = 301 bytes  0x3f57d4 -> 0x2c1754
    copy 75 dwords from (clientBase+0x3f57d4) to (clientBase+0x2c1754);
    copy 1 trailing byte;
```

- 5004 cell bytes = a 4-byte header + 100×50 = 5000 grid bytes. The cell **read accessor**
  `FUN_004c8b70` reads at `0x2c03cc` (= staging `0x2c03c8 + 4`), i.e. the grid proper starts 4 bytes
  into the staging block; the decode dest `0x3f444c` (= `0x3f4448 + 4`) matches this +4 offset.
- 301 object bytes = a 1-byte lead + 100×3 = 300 object bytes. The object accessor reads at
  `0x2c1755` (= staging `0x2c1754 + 1`).
- Caller: `FUN_004c2a30` (world reset/build) calls `FUN_004c5350` once.

---

## 2. Cell read accessor + value→position index

**`FUN_004c8b70(col, row)`** — returns a pointer to the 3-byte object record for a cell:

```
FUN_004c8b70(col, row):
  if (0 <= col < 100 && 0 <= row < 50):
     v = *(byte*)(clientBase + row*100 + 0x2c03cc + col);   // cell value
     return clientBase + 0x2c1755 + v*3;                    // &objectTable[v]
  return 0;
```

So **cell value `v` is an object index**; the object record is `objectTable + v*3` (3 bytes).
`v == 0` returns `objectTable[0]` (the empty/sentinel object). Callers test the returned pointer's
bytes (see §3).

**`FUN_004c8bc0(field)`** — builds a value→position reverse index (used by strategic field setup
`FUN_004c8a10` mode 2):

```
FUN_004c8bc0(field):
  for i in 0..0x58: field[8 + i*4] = 0xffffffff;     // 0x59=89 slots, one per object value
  for row*100 in 0..5000:
    for col in 0..100:
      v = *(byte*)(clientBase + (row*100) + 0x2c03cc + col);
      if (2 < v && v < 0x59):                          // value range 3..88
        field[8 + v*4] = (row*100) + col;              // linear cell position of object value v
```

- **Object value range = 3..88** (`2 < v < 0x59`). Value 0/1/2 are reserved/empty/sentinel;
  values 3..88 are placeable objects. (Matches the `< 0x59` clamps elsewhere and the
  `information_size[%d] is over than 100` cap on the object table.)
- Each placeable value appears at exactly one cell (last-wins) → object value is also the **object's
  identity on the map** (one object value = one map location).

---

## 3. Object record (3 bytes) — field meanings with evidence

The 3 bytes are read by every caller of `FUN_004c8b70`. The placement/render path is the
authoritative source of meaning.

### byte1 = object **type / class** (filter; only `== 3` is a placed marker)

`FUN_004d35b0(col,row)` — clean accessor returning **byte1**:
```
iVar1 = FUN_004c8b70(col,row);
if (iVar1 != 0) return *(byte*)(iVar1 + 1);   // OBJECT BYTE 1
return 0xffffffff;
```

`FUN_004d3a40` (map build) and `FUN_004d3bd0` (strategic placement) both gate on byte1:
```
puVar2 = FUN_004c8b70(...);
if (puVar2[1] == '\x03') { ... place/render ... }   // byte1 == 3
```
`FUN_004d3bd0` (the strategic-map object-placement loop, addr ~0x4d4160):
```
puStack_214 = FUN_004c8b70(col,row);
if (puStack_214 != 0 && puStack_214[1] == '\x03') {      // byte1 == 3 gate
   bVar1 = puStack_214[2];                                // BYTE 2
   if (bVar1 < 7) uVar4 = bVar1; else if (bVar1==8) uVar4 = 7;
   piVar13[2] = uVar4;                                    // sprite/color slot
   ...
   if (*(char*)(FUN_004c8b70(...)+1) == '\x03')           // re-test byte1
        iVar12 = FUN_004c8c90(*puStack_214);              // resolve BYTE 0
   piVar13[1] = iVar12;
   FUN_004b1690("%d %s %d _ _ _ x", idx, piVar13[1], *puStack_214, ...);  // byte0 printed
}
```
→ **byte1 is the object class.** Class 3 = the kind that is placed as a clickable sector marker
(fleet/base sprite). Other classes are skipped by the placement loop.

### byte2 = **sprite / faction-color variant**

From `FUN_004d3bd0`: `bVar1 = puStack_214[2]; if (bVar1 < 7) v = bVar1; else if (bVar1==8) v = 7;`
→ stored in the render slot `piVar13[2]`. Valid variants are **0..6 and 8** (8 maps to 7); any other
value skips placement (`goto LAB_004d4190`). This selects the sprite/tint of the marker.

### byte0 = **content-table record id** (the object's data link)

byte0 (`*puStack_214`) is passed to **`FUN_004c8c90(byte0)`**:
```
FUN_004c8c90(id): FUN_00522010(0x18, id);    // table tag 0x18, primary index = byte0
```
`FUN_00522010(this, idx, sub)` is a generic table-of-tables accessor:
```
if (this[0x2974]-1 <= idx) return "NO TABLE";
base = *(this[0x297c] + idx*4);
if (this[0x297c]+4+idx*4 - base <= sub) return "NO DATA";
return *(this[0x2980] + (base+sub)*4);
```
→ **byte0 indexes content table 0x18** to get the object's detail record (name/label/etc.). It is a
content-record id, **not** a raw unitId. The resolved value `piVar13[1]` is what the map marker
displays/links to.

### Other readers (consume the same 3 bytes)
- `FUN_0057aa90` (SelectGrid info panel): cross-refs the Base array `0x3facf8` by record id; at the
  end calls `FUN_004c8b70(...)` and `FUN_004c8c90(*ptr)` (byte0) to show the cell's object detail.
  Branches on `*(local_10+4)` (a Base field) `== 2`/`== 3` for faction labels via `FUN_00522010(0x4e, …)`.
- `FUN_0058d140`, `FUN_0058ee70` (cursor/character info panels): test the cursor cell via
  `FUN_004c8b70` for non-empty, then read PLAYER_INFO/focus (`FUN_004c7290`) — they use byte1 `==3`
  and the cell presence, not byte0 directly.

**Object record summary:**

| byte | meaning | evidence |
|---|---|---|
| 0 | content-record id (→ `FUN_00522010(0x18, byte0)`) | `FUN_004c8c90`, `FUN_004d3bd0` |
| 1 | object class/type (placed marker ⇔ `== 3`) | `FUN_004d35b0`, `FUN_004d3a40`, `FUN_004d3bd0` |
| 2 | sprite/color variant (valid 0..6, 8) | `FUN_004d3bd0` `bVar1<7 / ==8` |

---

## 4. Wire format — dispatcher cases (`FUN_004ba2b0`) and size table (`FUN_004b8b00`)

### 0x0313 (case 0x313) — object table

```
case 0x313:  // "ResponseStaticInformationGridType OK"
  copy 0x4b (75) dwords from param_3 to (clientBase+0x3f57d4);   // 300 bytes
  *(byte*)dest = *(byte*)src;                                    // +1 byte = 301 total
```

**2026-06-16 G224 correction:** before this dispatcher copy, message-object input method
`FUN_00413050` parses the wire in place. It reads `param_3[0]` as `count` and requires
`count < 0x65`, then helper-reads `count` sequential 3-byte records into
`param_3[1 + i*3]`. Byte 0 is **not** an unused lead byte. To preserve cell value `v` →
`objectTable[v]`, the server must set `count = maxObjectValue + 1` and include zero filler
records for unused lower values.

### 0x0315 (case 0x315) — cell grid (RLE)

```
case 0x315:  // "ResponseStaticInformationGrid OK"
  copy 0x4e3 (1251) dwords from param_3 to (clientBase+0x3f4448); // 5004 bytes raw snapshot
  FUN_004abbb0(clientBase+0x3f444c, param_3);                     // RLE decode from param_3 start
```

`param_3` = the **inbound record pointer = the inner payload after the message32 header**
(the dispatcher receives `(this, msgcode, record)`; the transport already stripped framing).

### RLE decoder `FUN_004abbb0(dest, src)`

```
w        = src[0]               // u8
h        = src[1]               // u8
rleByteCount = *(u16*)(src+2)   // parsed host-order u16, originally helper-read from BE wire;
                                // must be != 0 and < 0x1389 (5001)
pairs at src[4 + 2*k]: run = src[..], value = src[..+1]
  -> write `run` copies of `value` into dest (memset-style)
validates: sum(run) == w*h, else returns 0 (failure → grid stays empty)
```

→ **0x0315 inner payload layout (no header bytes before w/h):**
```
[u8 w][u8 h][u16 BE rleByteCount]  then rleByteCount bytes of [u8 run][u8 value] pairs
```
For the standard board: `w = 100 (0x64)`, `h = 50 (0x32)`, `w*h = 5000`. `rleByteCount` is the
number of bytes in the run/value region (the decoder iterates `uVar10` in steps of 2 up to
`uVar5-1`; total run bytes must equal 5000). The 2026-06-16 G222 live run proved that writing this
field little-endian makes `FUN_004134e0` read galaxy grid count `0x4601` (=17921) and stop before
the dispatcher; writing it big-endian lets the `0x0315` and `0x0313` dispatcher arms execute.

### Size table `FUN_004b8b00(code, payload, &seq, &size)` — the 0x0315 quirk

```
case 0x313:
case 0x315:  *size = 0x138c (5004);  *seq = 0;  return 1;   // BOTH fixed 5004 bytes
case 0x323:  *size = 0x2d4;          ...                     // char record 724
case 0x325:  *size = 0xce44;         ...                     // unit table 52804
case 0x317:  *size = 4;              ...                     // current grid index
```

**Root cause of "0x0315 fails to dispatch" (G187):** the client treats 0x0315 as a **fixed
5004-byte record**, identical to 0x0313. The enqueue `FUN_004b8850` mallocs `*size`=5004 and copies
5004 bytes from the wire payload before queuing; the queue executor `FUN_004b8950` later dispatches
to `FUN_004ba2b0`. A **compact** RLE frame (e.g. `[64][32][count][pairs]` ≈ tens–hundreds of bytes)
does not match the 5004-byte expectation:
- If the transport delivers exactly the compact frame, the 5004-byte copy in `FUN_004b8850` reads
  past the received bytes (the leading bytes are a valid RLE header so the *decode* may still run,
  but the frame-length bookkeeping that feeds `FUN_004b8b00` rejects/mis-sizes it → `cVar1 == '\0'`
  → log `DAT_0076f278`, **not enqueued**).
- 0x0313 survives the same fixed size because its real content (301B) is a strict prefix and the
  copy of 5004B is harmless padding; 0x0315's RLE has a hard `sum(run)==w*h` validation that fails
  if the trailing padding bytes are interpreted as extra run/value pairs (the decoder stops at
  `rleCount` pairs, so a correct `rleCount` is essential, but the upstream length gate is what blocks
  enqueue).

**Practical implication for the server:** send 0x0315 as a **full 5004-byte fixed record** to satisfy
the size table — i.e. pad the RLE payload out to 5004 bytes (`[w][h][rleCount][pairs…][zero pad to
5004]`). The decoder only reads `rleCount` pairs and validates `sum(run)==5000`, so trailing zero
padding is ignored by `FUN_004abbb0` but satisfies `FUN_004b8b00`/`FUN_004b8850`'s fixed-size copy.
This is the concrete hypothesis to test live to fix the G187 quirk.

### Dispatch pipeline summary
```
transport vtable -> FUN_004ae0d0(this, code, _, payload)
   -> FUN_004b8850(code, payload)                       // enqueue
        -> FUN_004b8b00(code, payload, &seq, &size)      // per-code FIXED size (0x138c for 0x315)
        -> malloc(size); copy `size` bytes; store code@+0x3552bc, ptr@+0x3552c4
   -> (later) FUN_004b8950()                             // queue executor, picks lowest seq @ due time
        -> FUN_004ba2b0(code, record)                    // dispatcher (case 0x313 / 0x315)
             -> 0x313: bulk copy 301B to +0x3f57d4
             -> 0x315: bulk copy 5004B to +0x3f4448; FUN_004abbb0(+0x3f444c, record)
   -> (world build) FUN_004c2a30 -> FUN_004c5350         // staging -> live tables 0x2c03cc / 0x2c1755
```

### message32 wrapper assumption
Per the verified conn3 framing (roadmap 2026-06-12, G172): S→C inner records are wrapped as
`[u32 0][u16 code][payload]` (message32). So on the wire:
```
0x0313:  [u32 0x00000000][u16 0x0313][ u8 count ][ count*3 byte records, padded to 5004 ]
0x0315:  [u32 0x00000000][u16 0x0315][ [u8 w][u8 h][u16 BE rleByteCount][pairs…] padded to 5004 ]
```
The dispatcher's `param_3` is the payload **after** the `[u32 0][u16 code]` 6-byte header.

---

## 5. Fleet → object linkage (how the client knows which object is the player's fleet)

**Finding: the strategic object table is NOT linked to the unit table client-side.** The client
populates `0x2c1755` only from 0x0313/0x0315 wire data. There is no code path that writes a unit's
id into the sector object/cell tables. Two independent identity systems exist:

### (a) Player/character identity (drives HUD focus, not sector placement)
`FUN_004c2a80` (world-entry), the proven G164 anchor:
```
for each char record in array (clientBase+0x36a8b4, stride 0xb5 dw = 724B):
   if (record[0] == *(clientBase+0x3584a0)):            // selected-char id match = MY character
      for each unit in unit table (clientBase+0x41a368, stride 0x16 dw = 0x58):
         if (record[9] == unit[0]):                     // record[9] @0x24 = flagship/unitId
            FUN_004c2c80(0, record);                    // push MY fleet into PLAYER_INFO (slot+0xc)
```
- `record[9]` = char field @0x24 (`flagship`, the grid-unit id) ↔ unit table entry[0] (unitId).
- `FUN_004c2c80` writes the 724-byte record into a **PLAYER_INFO** slot (`clientBase+0xc`, stride
  0x370, id @ slot+0x24). `FUN_004c7290(focusId)` scans PLAYER_INFO for the HUD focus character —
  this is the world-load survival path (G164), independent of the sector grid.

### (b) Sector object identity (drives map placement/clicks)
- A sector object's identity = its **object value** (cell value 3..88, unique cell via
  `FUN_004c8bc0`) + its **byte0** content-record id (`FUN_00522010(0x18, byte0)`).
- The **server** decides which object value/byte0 represents the player's fleet. There is no
  client-side cross-check tying `record[9]`/unitId to a specific object byte. (The `FUN_0057aa90`
  info panel cross-refs the **Base** array `0x3facf8`, not units.)
- Click→move: `FUN_00581c80` (`SelectGrid`, installed into the strategic handler table by
  `FUN_0058c750` at `_DAT_00c9e3a8`) builds the UI command objects `SelectGrid` / `TARGET_GRID` /
  `TARGET_BASE_GRID` / `SendWarpCommand` / `GoReceive`, and a command object carrying
  `puVar2[10]=0xb07 (NotifyMovedGrid), puVar2[0xb]=0xb01 (CommandMoveGrid), puVar2[0xc]=0xffffffff`.
  → the click on a target cell emits **CommandMoveGrid 0x0b01**. The fleet that moves is the player's
  authoritative fleet on the server side; the client just sends the target cell.

**Conclusion:** to make ONE player fleet controllable, the server must (1) place an object of
**class byte1=3** at a cell, with a **byte0** that the client can resolve in content table 0x18, and
(2) keep authoritative server-side knowledge that this object = this player's fleet (so a
`CommandMoveGrid 0x0b01` from that client moves it). The client does not need to be told "object X is
yours" for *rendering/clicking* — any class-3 object is clickable and emits 0x0b01 with the target
cell; ownership is enforced server-side.

---

## 6. Minimal data set for ONE controllable player fleet

Send, at the `0x0f02` push timing (proven window, G164), in this order before `0x0f03`:

1. **0x0325 ResponseInformationUnit** — already proven to deliver. Include the player's fleet unit
   (stride 0x58, entry[0]=unitId matching the char record `record[9]`@0x24). 52804-byte fixed
   (0xce44).
2. **0x0313 ResponseStaticInformationGridType** — the object table. Define **object value V** (pick
   3..88) for the player's fleet and set `count >= V+1`:
   - `objectTable[V*3 + 0]` = byte0 = a content-record id valid in table 0x18 (fleet label/sprite
     record).
   - `objectTable[V*3 + 1]` = **3** (class = placed clickable marker).
   - `objectTable[V*3 + 2]` = sprite/color variant in {0..6,8} (faction tint).
   - All other entries below `count` are zero filler records. Send as the counted sequential record
     stream, padded to 5004 bytes.
3. **0x0315 ResponseStaticInformationGrid** — the cell grid. Place value `V` at the fleet's cell
   `(col,row)` (linear `row*100+col`), everything else 0. RLE-encode `[100][50][rleByteCount BE][run,value]`
   padded to 5004 bytes (see §4 quirk fix).
4. **0x0323 ResponseInformationCharacter** (724B) + **0x0204** selected-char id — already in the G164
   flow; `record[9]`@0x24 must equal the unit id from step 1 so `FUN_004c2a80` binds the HUD focus.

### Concrete example (one fleet at cell col=10,row=20, object value V=3)

0x0313 payload (object table, count + records; bytes shown for value 3 = offset `1+3*3`):
```
offset 0x00: 04                       // count = records 0..3
offset 0x01..0x09: 00…00              // objects 0,1,2 (empty/sentinel)
offset 0x0a: <byte0=fleet content id> // objectTable[3].byte0
offset 0x0b: 03                       // objectTable[3].byte1 = class 3 (clickable marker)
offset 0x0c: <variant 0..6/8>         // objectTable[3].byte2 = sprite/color
offset 0x0d..0x12c: 00…00             // remaining objects empty  (total 301 bytes)
```
0x0315 payload (cell grid RLE, cell index = 20*100+10 = 2010):
```
[64]            // w = 100
[32]            // h = 50
[<u16 BE rleByteCount=2*number of run/value pairs>]
// runs (each run max 255 because run is u8) summing to 5000, with value 3 at linear cell 2010:
//   run of 255×0, 255×0, … (2010 zeros), then [01][03] (value 3 once), then zeros to 5000
// (split long zero spans into ≤255 runs)
… [01][03] …    // the player's fleet object value 3 at its cell
[00 … pad to 5004 bytes total]
```
(0x0325 / 0x0323 / 0x0204 per the existing G164 builders.)

Intended command path: once the client enters the SelectGrid movement mode, clicking a destination
cell should send **CommandMoveGrid 0x0b01** (target cell); the server then moves the fleet
authoritatively and broadcasts **NotifyMovedGrid 0x0b07 (580B)** to relayed clients (per
`src/server/logh7-world-relay.mjs`). Live G225 proves rendered map markers and info-click traffic, but
has **not** yet proven that a tested click enters this movement mode.

---

## 7. Open questions (clearly marked)

1. **SelectGrid / movement-mode enablement remains open.** G225 proves the normal playable client can
   reach HUD/grid-enter with rendered strategic markers: `liveAt2c1755Class3=81`,
   `liveMarkerRange=81`, and `markerTable.valid=81`. Tested minimap/object/marker/bottom-slot and
   destination clicks still produced only no trace or `0x0f08->0x0f09` info traffic, never
   `0x0b01` / `0x0b07`. The next open question is therefore the UI command path that opens
   `FUN_00581c80` SelectGrid, not 0x0313/0x0315 parsing or marker rendering.
2. **Which rendered marker is actionable as the player's fleet?** Object value, byte0, unit id, and
   PLAYER_INFO are distinct systems. G225's raw unit dump shows the unit table has `[count=1,pad=0,id=1]`
   and PLAYER_INFO matches focus char id 1, but tested visible markers behaved as info targets. We
   still need the client-side rule that distinguishes a movable own fleet marker from a system/base
   marker and routes the click to SelectGrid instead of the information request path.
3. **Content table 0x18 byte0 correctness.** `FUN_004c8c90(byte0)` resolves labels through
   `FUN_00522010(0x18, byte0)` from client `constmsg.dat`. G225 shows placeholder byte0 values are
   sufficient to render labels, but not necessarily sufficient for the correct marker identity. Map
   each emitted system/fortress/fleet byte0 to the real constmsg group-0x18 record id.
4. **byte2 variant semantics (faction vs sprite vs fleet icon).** Statically byte2∈{0..6,8} selects a
   render slot (`piVar13[2]`). G225 rendered markers, but the player-fleet icon/actionability is not
   pinned. Probe which byte2 values produce fleet, fortress, system, and black-hole markers and which,
   if any, are accepted by SelectGrid.
5. **0x0b01 payload dwords remain live-uncaptured.** The server parser/authoritative `0x0b07`
   positive-control is tested, but no real client `0x0b01` has been captured. Once SelectGrid emits,
   pin the payload offsets `0x0c..0x20` from the live command.

---

## Key functions (citations)

| Addr | Role |
|---|---|
| `FUN_004ba2b0` | message dispatcher; cases 0x313 / 0x315 store records |
| `FUN_004b8850` | enqueue (malloc fixed size, copy, queue) |
| `FUN_004b8b00` | **per-code size table** (0x313/0x315 → 0x138c=5004) |
| `FUN_004b8950` | recv-queue executor (seq/time order → dispatcher) |
| `FUN_004ae0d0` | transport per-message hook → `FUN_004b8850` |
| `FUN_004abbb0` | **RLE decoder** `[w][h][u16 cnt]{run,value}` |
| `FUN_004c5350` | staging → live tables copy (5004 cells + 301 objects) |
| `FUN_004c8b70` | cell read accessor → `&objectTable[v*3]` |
| `FUN_004c8bc0` | value→position reverse index (object value 3..88) |
| `FUN_004c8a10` | strategic field setup (mode 2) |
| `FUN_004d35b0` | object byte1 accessor |
| `FUN_004d3a40` | map build (byte1==3 gate) |
| `FUN_004d3bd0` | **strategic placement loop** (byte1==3, byte2 variant, byte0→link) |
| `FUN_004c8c90` / `FUN_00522010` | byte0 → content table 0x18 resolve |
| `FUN_0057aa90` | SelectGrid info panel (Base cross-ref) |
| `FUN_004c2a80` | world-entry; selected-char→record[9]→unit binding |
| `FUN_004c2c80` | push record into PLAYER_INFO (slot+0xc, stride 0x370) |
| `FUN_004c7290` | PLAYER_INFO focus lookup (HUD) |
| `FUN_00581c80` | SelectGrid handler → CommandMoveGrid 0x0b01 |
| `FUN_0058c750` | strategic handler-table installer (`_DAT_00c9e3a8 = FUN_00581c80`) |
| `FUN_004c32a0` | world-import (Base array + unit table → tactical pool, not strategic) |

**Related docs:** `docs/multiplayer-roadmap-2026-06-12.md` (strategic-map data model),
`docs/logh7-info-records-wire.md` (0x0323/0x031f/NotifyBaseParameter), `docs/logh7-0030-protocol.md`.

---

# PART II — EXHAUSTIVE MARKER-PLOTTING SPEC (2026-06-15 pass)

This part supersedes §3/§7 open questions with a full decompile of the **render-time** marker
pipeline (`FUN_004d3bd0` map-build + `FUN_004d6b70` per-frame render). Key correction: there are
**TWO distinct "class" notions** — the cell-placement gate `objectTable[v*3+1]==3` (byte1) and the
**marker-record class field** (`marker[2]`), which is the *variant byte (byte2)* remapped. The
render branches that pick icon/texture/black-hole use the marker-record class field, NOT byte1.

## A. The marker render-record at `DAT_009d1510` (stride 0x28 = 10 dwords) — CONFIRMED

`FUN_004d3bd0` placement loop (≈0x4d4160) writes records with `piVar13 = &DAT_009d1524 + i*10`,
so the record base is `DAT_009d1510 + i*0x28` (render reads from `DAT_009d1520 = base+0x10`). Up to
**0x500/10 = 128 records** (the zero-init `for iVar14=0x500` at `&DAT_009d1510`). Field map:

| dword | offset | written as | meaning | evidence |
|---|---|---|---|---|
| 0 | +0x00 | `piVar13[-5]` (u8 = 1) | **valid/selected flag** (render gate `marker[-4]!=0`) | `*(u8*)(piVar13-5)=1`; render `if(*(char*)(puVar13-4)!='\0')` |
| 1 | +0x04 | `piVar13[-4]` | **world X** (`FUN_004d3540` x = col − `_DAT_0066e624`) | `piVar13[-4]=(int)fStack_210` |
| 2 | +0x08 | `piVar13[-3]` | **world Y** (= 0, planar) | `piVar13[-3]=iStack_20c` |
| 3 | +0x0c | `piVar13[-2]` | **world Z** (`_DAT_0066e620` − row) | `piVar13[-2]=(int)fStack_208` |
| 4 | +0x10 | `piVar13[-1] = iVar14` | **col** (0..99) | `piVar13[-1]=iVar14` (inner loop var) |
| 5 | +0x14 | `*piVar13 = puStack_204` | **row** (0..49) | `*piVar13=(int)puStack_204` (outer loop var) |
| 6 | +0x18 | `piVar13[1] = FUN_004c8c90(byte0)` | **resolved label/link** = `FUN_00522010(0x18,byte0)` | `piVar13[1]=iVar12` |
| 7 | +0x1c | `piVar13[2] = uVar4` | **marker CLASS** = remapped byte2 (`<7→byte2; ==8→7`) | `piVar13[2]=uVar4` |
| 8 | +0x20 | `piVar13[3]` (icon handle, set later) | **icon model/anim handle** (FUN_004d1e70) | render `piVar13[1]=iVar14` for the 3D node |
| 9 | +0x24 | `piVar13[4]` (bh overlay handle) | **2nd handle** (black-hole light, class==7 only) | `piVar13[2]=iVar14` (bh light node) |

Render (`FUN_004d6b70`) confirms: `puVar13[3]` = **marker class** indexes the icon-texture array
`(&DAT_009d2934)[puVar13[3]]`, and `puVar13[3]==7` adds the bh_moya/bh_light overlay.

## B. CLASS-byte semantics — FINAL (confirmed)

Two layers, both must be set right by the server:

1. **Placement gate — `objectTable[v*3+1]` (byte1) must == 3.** ANY cell whose object record has
   byte1==3 becomes a clickable marker; byte1≠3 is skipped entirely (`goto LAB_004d4190`). Source:
   `FUN_004d3bd0` `if (puStack_214[1]=='\x03')`; `FUN_004d35b0` accessor. **There is no separate
   byte1 value for "fortress" vs "system" vs "fleet" — they are ALL byte1==3.** The visual
   distinction comes from the *marker class* (next).

2. **Marker class — `marker[2]` = remap of byte2 (`objectTable[v*3+2]`).** Map `byte2<7 → byte2;
   byte2==8 → 7;` else **skip placement**. So valid byte2 ∈ {0,1,2,3,4,5,6,8}; 8 is the
   black-hole encoding (stored class 7). This stored class drives the render icon:
   `(&DAT_009d2934)[class]` (8 icon-texture slots, indices 0..7), and `class==7` is the black hole
   (extra `bh_moya`/`bh_light` overlay; smaller scale `0x3b4ccccd` vs `0x3d800000`). Source: render
   loop `(&DAT_009d2934)[puVar13[3]]`, `if ((puVar13[3]==7) && DAT_009d2954 && DAT_009d2958)`.

**Fortress vs star system vs fleet are distinguished by BYTE2 (→ marker class / icon slot), not by
byte1 and not by byte0.** byte0 only selects the *label string*. The 8 icon slots (`DAT_009d2934[0..6]`
= the per-system `lo_fs_glow` glow textures loaded in the `fs_%03d`/`lo_fs_glow` loop, index 0..6;
slot 7 = black hole) are the marker-type palette. Which byte2 value = "Iserlohn fortress" vs "normal
system" vs "fleet" is a **content convention**, not a hard-coded branch — the code treats 0..6
uniformly (different glow texture each) and only special-cases 7 (black hole). **[needs-live-probe:
which byte2 index renders the fortress sprite vs a plain star — visually test 0..6.]**

## C. byte0 → LABEL verdict — **CLIENT .dat, KO-OVERLAYABLE** (CONFIRMED, high confidence)

`FUN_004c8c90(byte0)` = `FUN_00522010(0x18, byte0)` (the ONLY caller of group 0x18). `FUN_00522010`
is a generic string-table-of-tables accessor on an object whose tables (`+0x2974` group count,
`+0x297c` offset index, `+0x2980` string-pointer array, `+0x2988` string blob) are loaded by
**`FUN_00522060`**, which:
- opens a file (`FUN_0064d5ba(filename,…)`),
- validates magic `0x52574648` = **"HFWR"**,
- reads group count → `+0x2974`, string count → `+0x2978`, allocates the index, then `FUN_00522235`
  builds it.

The filename is supplied by `FUN_00521dc0` → `"constmsg.dat"`, and the path string is
`.\data\MsgDat\constmsg.dat` (0x00773f4c, referenced by `FUN_004e9bb0`). **So marker labels
(star-system / fortress names, group 0x18) are read from the CLIENT file
`data/MsgDat/constmsg.dat` and are KO-OVERLAYABLE via the same constmsg.dat overlay already used
for the rest of the UI.** byte0 is a *content-record index into constmsg group 0x18* — the wire
0x0313 record carries only the 1-byte index, NOT the name text. The server picks byte0; the Korean
text comes from the overlaid .dat. (This closes prior open-Q2.) `FUN_00522060`/`FUN_00521dc0`/
`FUN_004e9bb0` are the citations.

## D. PLANET orbit models (selected-system planet display) — `FUN_004d3bd0` planet loop

When a system is selected (`DAT_009d15b0 != 0`, selected cell id `DAT_009d15c0`), the map-build
loads planet models around it:

- Selected-system world pos: `FUN_004d3540(&fStack_210, DAT_009d15c0)` (so `DAT_009d15c0` is a
  **cell/grid id**, decoded col=id%100,row=id/100 — same as every other marker).
- Loop: `iVar12 = 0; iVar14 = 0; while (iVar12 < 0x50) { iVar12 += 10; iVar14 += 1; }` → **8 planet
  slots** (iVar14 = 0..7), model file `..\data\model\planets\p%03d_low.mdx` (format string
  `s____data_model_planets_p_03d_low`). Each slot's node handle stored at `(&DAT_009d2f74)[iVar14]`.
- A per-slot "present" mask byte `*(char*)((int)&puStack_204 + iVar14)` (init `puStack_204 =
  &DAT_01010101`, i.e. bytes `01 01 01 01` then `00 00 00 00` → **first 4 planets present** in the
  default/placeholder, rest hidden `+0xb0 = 1`).
- **Orbit ring radius** for a present planet:
  `radius = ((float)orbitIndex + _DAT_0066e074) * _DAT_0066e240`, applied as
  `local_1c0 = systemZ + radius` (a fixed linear increment per slot — `fStack_218` counts only the
  PRESENT planets, incremented inside the `else` branch). Each present planet scaled `0x3bcccccd`.
  → The planet ring uses a **fixed per-index increment `_DAT_0066e240` × (orbitIndex + base
  `_DAT_0066e074`)**, NOT the 0x031d `revolution_radius` directly in THIS loop. The 0x031d
  `revolution_radius`/`revolution_cycle`/`revolution_init_angle` fields feed the *animated* orbit
  position (the static-base astronomy parser `FUN_004142e0`, stride 0x3c), but the slot count and
  the visible/hidden mask here are placeholder (`01010101`).
- A second loop builds the **planet glow sprites**: `fs%03d_low.mdx` (`DAT_009d2a04[0..6]`, 7 slots)
  + `lo_fs_glow.*` images (`DAT_009d2934[0..6]` — **these are the same 7 textures used as the marker
  icon slots in §B**), then the 3 black-hole textures `bh_moya`/`bh_flare`/`bh_light`
  (`_DAT_009d2950`/`DAT_009d2954`/`DAT_009d2958`).

**What index drives `p%03d`?** In the decompiled loop the format arg is the *running counter*
(`fStack_218` of present planets) — i.e. it loads `p000_low`, `p001_low`, … sequentially for each
PRESENT slot, NOT a planet global-id. So the SELECTED system needs its planet set delivered as an
**ordered list of present slots (≤8)**; the model file is chosen by *ordinal*, and the name/economy
come from the companion records. **[needs-live-probe: whether the present-mask and the p%03d index
are overridden from a wire record when a real system is selected, or stay placeholder `01010101`/
sequential. The static decompile shows placeholder values; the override writer of `DAT_009d15c0`/
the present-mask was not located statically (single read site each).]**

**Server companion record for the SELECTED system:** to show the correct planets with KO names the
server must deliver, for the selected system's grid id, a **0x031d ResponseStaticInformationBase**
(stride 0x3c, base `+0x3f5ae8`) carrying per-system `name[≤13]` (constmsg-independent; this is a
literal name field in 0x031d), `grid` (= the cell id matching `DAT_009d15c0`), `class_`,
`revolution_radius`, `revolution_cycle`, `revolution_direction`, `revolution_init_angle`, plus the
**0x031f ResponseInformationBase** (stride 0x180, `+0x3facf8`) for the dynamic economy/ownership.
The planet *count/names* are carried at the per-planet economy level (`NotifyBaseParameter`, the
惑星 record). See `docs/logh7-info-records-wire.md` §2/§3.

## E. SERVER POPULATION SPEC — per-marker-type table

To plot ALL markers the server emits, per marker, ONE `objectTable[v]` record (in 0x0313) + ONE
`cell{col,row,value=v}` (in 0x0315). `v` ∈ 3..88 (object value range, `2 < v < 0x59`, one per
marker — cap ≤85 markers per board since `v ≤ 88`). For >85 markers, additional boards/pages needed.

| marker type | byte0 (constmsg 0x18 idx → KO label) | byte1 (class gate) | byte2 (→ marker class/icon) | cell | companion records |
|---|---|---|---|---|---|
| **Star system** | system's constmsg-0x18 name index | **3** | provisional spectral slot `O/B/A/F/G/K/M -> 0/1/2/3/4/5/6`, unknown -> `8` | `(col,row)` from manual star-chart projection; direct PDF storage rects use `displayX=842-pdfCy`, `displayY=pdfCx`, but `content/galaxy.json` is already normalized and the server grid uses `displayX=contentCy`, `displayY=contentCx` | 0x031d StaticBase (name/grid/astronomy) + 0x031f Base (economy) for the system; per-planet NotifyBaseParameter |
| **Fortress (Iserlohn等)** | fortress name index in 0x18 | **3** | a fortress icon slot (one of 0..6, distinct from plain system) **[probe which]** | fortress grid cell | 0x031d StaticBase w/ `class_`=fortress; 0x031f Base |
| **Player fleet** | charId&0xff (links to char record) | **3** | 0 (or faction tint 0..6) | fleet's `(col,row)` | 0x0325 unit table entry[0]=unitId, 0x0323 char record (record[9]@0x24=unitId), 0x0204 selected-char id |
| **NPC fleet** | npc fleet name/owner idx | **3** | faction-tint slot 0..6 | npc fleet cell | 0x0325 unit entry; (no char binding needed for non-focus) |
| **Black hole** | (label optional) | **3** | **8** (→ stored class 7 = bh_moya/flare/light) | black-hole cell | none (pure astronomy marker) |

Mapping onto the existing **`buildStrategicGalaxyGrid`** (src/server/logh7-login-protocol.mjs:480):
it now emits klass=3 systems with spectral `byte2` when `spectralClass` is present. Legacy/probe inputs
without any spectral field still fall back to the older faction tint, while an explicit `spectralClass:null`
uses unknown/special slot `8`. **Extend:**
1. **Fortresses** — add the 6 `content/galaxy.json` fortresses as their own objects with byte2 =
   a dedicated fortress icon index (TBD by probe), byte0 = their constmsg name index, at their grid
   cells.
2. **Black holes** — add objects with **byte2 = 8** (stored class 7) at corridor/black-hole cells
   so the bh sprite renders (currently NONE are emitted — that whole render branch is dead on the
   server side today).
3. **NPC fleets** — additional klass=3 objects with faction-tint byte2, byte0 = owner/name idx,
   from the scenario content pack, alongside their 0x0325 unit entries.
4. **byte0 must be a real constmsg-0x18 index.** G251 recovered this for the 80 star-system
   markers by merging the recovered `msgdat-full` offset table with the original `client/msgdat`
   Japanese rows (`イゼルローン=14`, `ルンビーニ=86`). Remaining gaps: map fortress/NPC-fleet/special
   body markers to their own real group-0x18 IDs instead of ad hoc IDs, and keep fleet `charId&0xff`
   clearly separate from system labels.
5. **Selected-system planets** — wire the **0x031d/0x031f** companion records for the system the
   player opens, so the planet-orbit models (§D) paint with correct names; today no 0x031d is sent.

## F. SNAPSHOT-GUARD verdict + ordering fix — CONFIRMED

`FUN_004c5350(clientBase)` is a **run-once** staging→live copier guarded by `clientBase+0x2c03c0`:
```
if (clientBase+0x2c03c0 == 0) { set guard=1, ready=1;
    copy 0x4e3 dw (5004B) 0x3f4448→0x2c03c8 (cell grid);
    copy 0x4b dw+1B (301B) 0x3f57d4→0x2c1754 (object table); }
else  FUN_005923a0(&DAT_007715c8,0);   // already-loaded: do NOTHING (log)
```
Caller chain: `FUN_004c5350` ← `FUN_004c2a30` (world-state reset: zeroes 0xd54ab dwords then runs
`FUN_004c4c50/…/FUN_004c5350/FUN_004c5300`) ← `FUN_004b76e0` (the **scene/screen state machine**,
driven by `DAT_007cd020`, NOT a single network message). So the snapshot fires **once, the first
time the strategic-map scene is entered**, copying whatever is currently in the staging buffers
(`0x3f4448`/`0x3f57d4`).

**THE BUG (confirmed by code, root cause of empty galaxy):** the staging buffers are written by the
0x0315/0x0313 dispatcher (`FUN_004ba2b0` cases) at the moment those messages arrive. The server's
**early-walk burst answers 0x0314 with an EMPTY grid** (generic walker, 0x138c zero-filled) — that
empty 0x0315 lands in `0x3f4448` FIRST. If the strategic scene is entered (firing `FUN_004c5350`)
**before** the real grid arrives at 0x0f02, the guard `0x2c03c0` is set with the EMPTY staging, and
the later real 0x0315 at 0x0f02 — even though it correctly refills `0x3f4448` — is **NEVER copied to
live** (`0x2c03cc`), because `FUN_004c5350` short-circuits on the guard. The real grid is ignored.

**Server-side ordering fix (two parts):**
1. **Do NOT answer 0x0314 with a zero-filled empty grid.** Either (a) answer 0x0314 with the REAL
   `buildStrategicGalaxyGrid` object+cell records (so the first staging snapshot is already correct),
   or (b) suppress the empty-grid walker answer for 0x0313/0x0315 entirely so staging stays
   un-snapshotted until the real push. The session code today explicitly routes the real grid to
   0x0f02 and lets 0x0314 fall to the empty walker (logh7-login-session.mjs:516-517,424) — that is
   exactly the order that arms the guard with empty data **if** the scene enters between 0x0314 and
   0x0f02.
2. **Guarantee the real 0x0313+0x0315 reach staging BEFORE the strategic scene is entered.** Since
   the snapshot is keyed to the *scene transition* not a message, the safest fix is **(a) above** —
   send the real galaxy grid as the 0x0314 answer (RequestStaticInformationGrid → ResponseStatic*),
   so the first and only snapshot captures it. The 0x0f02 push then becomes a redundant refresh
   (harmless, but won't reach live while the guard is set — so it can't be relied on alone).

**Verdict:** the real grid IS being ignored whenever the scene's run-once snapshot fires on the
empty 0x0314 answer. Fix = answer 0x0314 with the real `buildStrategicGalaxyGrid` records (not the
empty walker), OR clear/avoid arming `0x2c03c0` until the real grid is staged. **[needs-live-probe:
confirm scene-enter timing vs 0x0f02 — if the scene only enters AFTER 0x0f02 in practice, the empty
0x0314 is overwritten in staging before the snapshot and no bug manifests; the fix is still correct
defensively. The 5004-byte fixed-size padding from §4 is also required for 0x0315 to enqueue at
all.]**
