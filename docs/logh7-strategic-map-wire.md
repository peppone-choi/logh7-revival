# LOGH VII strategic sector-map wire format (0x0313 / 0x0315)

Static reverse-engineering of `G7MTClient.exe` to determine the exact wire data the server
must send so a player's fleet appears as a controllable object on the strategic sector map.

**Source export:** `E:/logh7-revival/.omo/ghidra/export/G7MTClient.exe/functions.jsonl`
(query with `python -m tools.logh7_redex func <addr>` / `grep` / `calls`).

**Method:** every claim below cites a function address + decompiled line. No live client/server
was run; this is pure static RE.

---

## TL;DR

- **0x0313 ResponseStaticInformationGridType** = the **object table**: 100 objects × **3 bytes** each
  (+1 lead byte), declared wire size **0x138c (5004) bytes** (fixed). Object bytes:
  **byte0 = content-table record id** (resolved via `FUN_00522010(0x18, byte0)`),
  **byte1 = object type/class** (only `byte1 == 3` is placed/rendered as a map marker),
  **byte2 = sprite/color variant** (0..6, with 8→7).
- **0x0315 ResponseStaticInformationGrid** = the **cell grid**: RLE-encoded
  `[u8 w][u8 h][u16 rleCount]{[u8 run][u8 value]}…`, decoded by `FUN_004abbb0`, declared wire size
  **0x138c (5004) bytes** (fixed — same as 0x0313). Each decoded cell value `v` (2..88) indexes the
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
rleCount = *(u16*)(src+2)       // u16, must be != 0 and < 0x1389 (5001)
pairs at src[4 + 2*k]: run = src[..], value = src[..+1]
  -> write `run` copies of `value` into dest (memset-style)
validates: sum(run) == w*h, else returns 0 (failure → grid stays empty)
```

→ **0x0315 inner payload layout (no header bytes before w/h):**
```
[u8 w][u8 h][u16 rleCount]  then rleCount worth of  [u8 run][u8 value] pairs
```
For the standard board: `w = 100 (0x64)`, `h = 50 (0x32)`, `w*h = 5000`. `rleCount` is the number
of run/value PAIRS (the decoder iterates `uVar10` in steps of 2 up to `uVar5-1`; total run bytes
must equal 5000).

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
0x0313:  [u32 0x00000000][u16 0x0313][ 301-byte object table (or 5004 fixed) ]
0x0315:  [u32 0x00000000][u16 0x0315][ [u8 w][u8 h][u16 rleCount][pairs…] padded to 5004 ]
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
   3..88) for the player's fleet:
   - `objectTable[V*3 + 0]` = byte0 = a content-record id valid in table 0x18 (fleet label/sprite
     record).
   - `objectTable[V*3 + 1]` = **3** (class = placed clickable marker).
   - `objectTable[V*3 + 2]` = sprite/color variant in {0..6,8} (faction tint).
   - All other entries 0. Send as the 301-byte (or 5004 fixed) record.
3. **0x0315 ResponseStaticInformationGrid** — the cell grid. Place value `V` at the fleet's cell
   `(col,row)` (linear `row*100+col`), everything else 0. RLE-encode `[100][50][rleCount][run,value]`
   padded to 5004 bytes (see §4 quirk fix).
4. **0x0323 ResponseInformationCharacter** (724B) + **0x0204** selected-char id — already in the G164
   flow; `record[9]`@0x24 must equal the unit id from step 1 so `FUN_004c2a80` binds the HUD focus.

### Concrete example (one fleet at cell col=10,row=20, object value V=3)

0x0313 payload (object table, 301 bytes; bytes shown for value 3 = offset `3*3=9`):
```
offset 0x00: 00                       // lead byte
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
[<u16 rleCount=number of run/value pairs>]
// runs (each run max 255 because run is u8) summing to 5000, with value 3 at linear cell 2010:
//   run of 255×0, 255×0, … (2010 zeros), then [01][03] (value 3 once), then zeros to 5000
// (split long zero spans into ≤255 runs)
… [01][03] …    // the player's fleet object value 3 at its cell
[00 … pad to 5004 bytes total]
```
(0x0325 / 0x0323 / 0x0204 per the existing G164 builders.)

Click on a destination cell on this map → client sends **CommandMoveGrid 0x0b01** (target cell);
server moves the fleet authoritatively and broadcasts **NotifyMovedGrid 0x0b07 (580B)** to relayed
clients (per `src/server/logh7-world-relay.mjs`).

---

## 7. Open questions (clearly marked)

1. **0x0315 fixed-size fix is a HYPOTHESIS.** §4 argues the failure is the `FUN_004b8b00`
   `0x313/0x315 → 0x138c (5004)` fixed-size entry + the `FUN_004b8850` fixed-size copy/length gate.
   The proposed fix (pad RLE to 5004 bytes) is derived statically and **must be verified live**
   (push a 5004-byte-padded 0x0315 at 0x0f02 and confirm `cellGrid` becomes non-empty). The exact
   upstream length comparison that returns `cVar1=='\0'` lives in the transport frame reader feeding
   `FUN_004ae0d0` (vtable-dispatched; no static caller resolved) — confirm whether it gates on the
   declared 5004 vs received length.
2. **Content table 0x18 contents (byte0 resolution).** `FUN_00522010(0x18, byte0)` returns a record
   from a table-of-tables at `this+0x297c/0x2980`. What populates table 0x18 and what byte0 range is
   valid for fleet objects is not pinned here (it is a content/resource table, likely loaded from
   client data or an earlier static message). Need to find the loader that fills tag-0x18.
3. **Object value vs byte0 vs unitId.** Confirmed object value (cell value 3..88) and byte0 are
   distinct (value indexes the object table; byte0 indexes content table 0x18). Whether byte0 is
   meant to equal a unitId, a base id, or a pure presentation id is **unconfirmed** — statically it
   is only used for display/resolution, never compared to the unit table. A live test (send a fleet
   object, observe what label/sprite renders) would disambiguate.
4. **Does any class other than byte1==3 matter for fleets?** The placement loop only handles class 3.
   Bases/systems appear via the Base array (`0x3facf8`) and `FUN_0057aa90`, cross-referenced by the
   cell's byte0 — so non-fleet map content may use other classes or the Base path. Not fully
   enumerated.
5. **byte2 variant semantics (faction vs sprite).** Statically byte2∈{0..6,8} selects a render slot
   (`piVar13[2]`); whether it encodes faction color, fleet size, or sprite frame is not pinned. Live
   visual test needed.

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
