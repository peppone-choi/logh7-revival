# LOGH VII — Social / Mail / Messenger / Settings + Simple-Info Deltas + Account/Character wire spec

Static RE of `G7MTClient.exe` (Ghidra index `.omo/ghidra/export/G7MTClient/`). Covers the
social/comms layer (mail 0x0f05–0x0f15, messenger, chat 0x0f1c–0x0f1e), the player-settings layer
(0x0f16–0x0f1b), the account/character layer (0x1001–0x1008), and the periodic **simple-info delta
broadcast** layer (0x1200–0x120f) the authoritative server pushes to keep every client's model in
sync. **Static analysis only — no client/server launch.**

All offsets are **into the inner body** (the bytes AFTER the framing prefix). Bodies are
**little-endian**. Framing recap (from `docs/logh7-moveship-wire.md`):
client→server inner = `[u16 BE code][body]`; server→client conn3 = message32 `[u32 0][u16 BE code][body]`.

## Ground-truth method (two dispatchers)

Two client switch functions pin every size and handler:

1. **`FUN_004b8b00`** — the **receive-object factory**. `case 0xNNN: *param_4 = SIZE` declares the
   fixed body size the client allocates for that code (goto-labels resolved below). This is the
   authoritative wire body length. Already mirrored verbatim in
   `src/server/logh7-login-protocol.mjs` `WORLD_RESPONSE_OBJECT_SIZES` — this doc's sizes match it.
2. **`FUN_004ba2b0`** — the **conn3 message32 apply/handler**. For each code it `memcpy`s the body
   (`for (iVar16 = N) *dst++ = *src++` → **N dwords = 4·N bytes**) into a fixed client struct buffer,
   then calls a per-code apply function. The dword count N **confirms** the body size, the destination
   offset reveals the struct layout, and the apply function reveals the **record stride / semantics**.

For the chat/messenger classes there are also `Input_<Class>::input_from_stream` /
`Output_<Class>::*` functions, but those parse a **text/CSV serialization** (comma-separated decimal
ASCII, `{`-delimited 16-bit code-point arrays; `FUN_005ff09b` = atoi) used for a different transport
(client-local persistence / lobby text channel). The **binary conn3 wire** is the raw struct that
`FUN_004ba2b0` copies — that is what this doc specifies and what the authoritative server must build.

---

## 1. Size & handler master table (evidence: `FUN_004b8b00`, `FUN_004ba2b0`)

| Code | Class | Dir | Body size | Apply fn | Dst struct off (clientBase+) | Notes |
|---|---|---|---|---|---|---|
| 0xf05 | ResponseInformationMailAddress | S→C | 0x7214 (29204) | FUN_005266e0 (stub) | 0x448808 | mail-address book (0x1c85 dw) |
| 0xf07 | ResponseInformationMessengerStatus | S→C | 0x74cc (29900) | — | — | buddy/messenger roster |
| 0xf08 | TransactionInformationMailBegin | S→C | 0x128 (296) | — | — | mail xfer begin |
| 0xf09 | TransactionInformationMail* | S→C | 1 | — | — | 1-byte status |
| 0xf0a | TransactionInformationMailEnd | S→C | 0x75c (1884) | FUN_004c2680 | 0x457014 | mail xfer end (0x1d7 dw) |
| 0xf0b | CommandExchangeMailAddress | C→S/echo | 0x24c (588) | — | 0x485764 | 0x93 dw |
| 0xf0c | CommandDeleteMailAddress | C→S/echo | 0x124 (292) | — | 0x4859b0 | 0x49 dw |
| 0xf0d | CommandMessengerStatus | C→S/echo | 0x128 (296) | — | 0x485ad4 | 0x4a dw |
| 0xf0e | CommandMessengerConnection | C→S/echo | 0x250 (592) | — | 0x485bfc | 0x94 dw |
| 0xf0f | CommandMessenger | C→S/echo | 0x52c (1324) | — | 0x485e4c | 0x14b dw |
| 0xf10 | CommandSendMail | C→S/echo | 0x75c (1884) | — | 0x486378 | 0x1d7 dw |
| 0xf11 | CommandReadMail | C→S/echo | 0x12c (300) | — | 0x486ad4 | 0x4b dw |
| 0xf12 | CommandDeleteMail | C→S/echo | 0x12c (300) | — | 0x486c00 | 0x4b dw |
| 0xf13 | CommandOrderSuggestMail | C→S/echo | 0x264 (612) | FUN_004c2710 | 0x486d2c | 0x99 dw; gated on flag @0x487449 |
| 0xf14 | CommandReplyOrderSuggestMail | C→S | 0x25c (604) | — | — | reply to suggest mail |
| 0xf15 | NotifyCommandMail | S→C | 0x25c (604) | FUN_004c07e0 | 0x4871ec | 0x97 dw; order-mail notify |
| 0xf16 | CommandSetTogether | C→S | 0xc (12) | FUN_004c5540 | 0x43ced4 | see §4 |
| 0xf17 | CommandSetWillMessage | C→S | 0x8c (140) | — | 0x43cee0 | 0x23 dw |
| 0xf18 | CommandSetOfflineDirection | C→S | 0x10 (16) | (inline) | 0x43cf6c | 0x4 dw |
| 0xf19 | CommandSetUnitDistributePriority | C→S | 0x10 (16) | (inline) | 0x43cf7c | 0x4 dw |
| 0xf1a | CommandSetReturnBase | C→S | 0xc (12) | (inline) | 0x43cf8c | 3 dw |
| 0xf1b | CommandSetPrivateAccountRate | C→S | 0xc (12) | (inline) | 0x43cf98 | 3 dw |
| 0xf1c | CommandGridChat (DONE) | bidir | 0x8c (140) | FUN_004be660 | 0x43cfa4 | see §3 |
| 0xf1d | CommandSpotChat | bidir | 0x8c (140) | FUN_004be680 | 0x43d030 | see §3 |
| 0xf1e | CommandSpotUnicastChat | bidir | 0x90 (144) | FUN_004be6a0 | 0x43d0bc | see §3 (+targetId) |
| 0xf1f | NotifyTactics | S→C | 8 | FUN_004c1b20 | DAT_00433b1c | 2 dw |
| 0x1001 | ResponseInformationAccount | S→C | 0x1c0 (448) | (inline) | 0x3584a4 | 0x70 dw account card |
| 0x1003 | ResponseUnChargeCharacter | S→C | 0xfa4 (4004) | (inline) | 0x358664 | 0x3e9 dw |
| 0x1005 | ResponseCharacterEntryState | S→C | 0x20 (32) | (inline) | 0x359608 | 8 dw |
| 0x1006 | CommandOriginalCharacterCharge | C→S | 0x18 (24) | FUN_004be760 | 0x43241c | 6 dw → UI event 0x1006 |
| 0x1007 | CommandExtensionCharacterCharge | C→S | 8 | FUN_004be780 | 0x432434 | 2 dw |
| 0x1008 | CommandGenerateCharacterCharge (DONE) | C→S | 0x80 (128) | FUN_004be7a0 | 0x43243c | 0x20 dw |

> **C→S/echo** = the client both SENDS this (built by its UI) and ACCEPTS it back on conn3 (the
> `FUN_004ba2b0` apply path exists). For relayed social messages the server's job is to validate then
> rebroadcast the same body; the byte layout is identical in both directions.

---

## 2. Simple-info delta broadcast layer (0x1200–0x120f) — STATE SYNC

This is the periodic state-sync mechanism. The server pushes a `0x1200 TransactionSimpleDataBegin`
(resets the client's delta accumulators to empty), then a stream of `NotifySimpleInformation*`
messages (each **appends** up to its per-message cap of records to the matching client buffer), then
`0x1201 TransactionSimpleDataEnd` (commits/flips the display buffers). Evidence:
`FUN_004c1dd0` (0x1200) zeroes 15 accumulator counters; each apply checks a "first since begin" flag
(`clientBase+0x487472`) and resets its own counter on the first record.

**Universal record framing** (all 0x12xx Notify bodies):

```
[ u8 count ][ pad to header size ][ record[0] ][ record[1] ] … [ record[count-1] ]
```

The header is **4 bytes** for most records (count u8 @0, 3 pad) and **2 bytes** for the small-record
ones (count u8 @0, 1 pad). `count` is the number of records IN THIS MESSAGE; the server may split a
large set across several messages (each capped at the per-message max below) inside one Begin/End
transaction. The client buffer max is the total it can hold across the whole transaction.

| Code | Class | Body size | Hdr | Record stride | Rec dwords | Per-msg max | Buf max | Apply fn | Counter (clientBase+) | Record dst |
|---|---|---|---|---|---|---|---|---|---|---|
| 0x1200 | TransactionSimpleDataBegin | 0x24 (36) | — | — | — | — | — | FUN_004c1dd0 | resets all | — |
| 0x1201 | TransactionSimpleDataEnd | 1 | — | — | — | — | — | FUN_004c1e50 | — | commit (byte@0x487470) |
| 0x1202 | NotifySimpleInformationCharacter | 0xe104 | 4 | **0x120 (288)** | 0x48 | 200 | 2000 | FUN_004c1e80 | 0x4c83a0 | 0x4c83a4 |
| 0x1203 | NotifySimpleInformationOutfit | 0x2264 | 4 | **0x2c (44)** | 0xb | 200 | 300 | FUN_004c1fa0 | 0x4c17c8 | 0x4c17cc |
| 0x1204 | NotifySimpleInformationBase | 0x1c24 | 4 | **0x24 (36)** | 9 | 200 | 400 | FUN_004c2040 | 0x4c4b5c | 0x4c4b60 |
| 0x1205 | NotifySimpleInformationGrid | 0x324 | 4 | **4 (u32)** | 1 | 200 | 180 | FUN_004c25b0 | 0x620958 | 0x62095c |
| 0x1206 | NotifySimpleInformationStrategy | 0x644 | 4 | **8 (2×u32)** | 2 | 200 | 100 | FUN_004c20d0 | 0x580368 | 0x58036c |
| 0x1207 | NotifySimpleInformationUnit | 0x12c4 | **2** | **8 (2×u32)** | 2 | 600 | 2000 | FUN_004c2250 | 0x58068c | 0x580690 |
| 0x1208 | NotifySimpleInformationCard | 0xe14 | **2** | **0xc (3×u32)** | 3 | 300 | 300 | FUN_004c2150 | 0x584510 | 0x584514 |
| 0x1209 | NotifySimpleInformationRank | 0x2b | **1** | **2 (u16)** | — | 21 | 21 | FUN_004c21e0 | 0x585324 | 0x585328 |
| 0x120a | NotifySimpleInformationRankingCharacter | 0x73a4 | 4 | **0x128 (296)** | 0x4a | 100 | 100 | FUN_004c22d0 | 0x585354 | 0x585358 |
| 0x120b | NotifySimpleInformationCompletenessSupplyOutfit | 0x3cf4 | **2** | **0x34 (52)** | 0xd | 300 | 100 | FUN_004c2360 | 0x61b35c | 0x61b360 |
| 0x120c | NotifySimpleInformationCardAvailableOutfitSeat | 0x21c4 | 4 | **0x30 (48)** | 0xc | 180 | 100 | FUN_004c23f0 | 0x61c7b0 | 0x61c7b4 |
| 0x120d | NotifySimpleInformationCardAvailableBaseSeat | 0x2ee4 | **2** | **0x14 (20)** | 5 | 600 | 300 | FUN_004c2480 | 0x61da74 | (computed) |
| 0x120e | NotifySimpleInformationOrderSuggestCharacter | 0x723c | 4 | **0xb6c (2924)** | 0x2db | 10 | 200 | FUN_004c2510 | 0x58c6f8 | 0x58c6fc |
| 0x120f | NotifySimpleInformationCharacterEntry | 0x73a4 | 4 | **0x128 (296)** | 0x4a | 100 | 600 | FUN_004c1f10 | 0x554da4 | 0x554da8 |

Notes:
- Size arithmetic checks (validating the table): 0x1202 `4 + 200·288 = 57604 = 0xe104`; 0x1203
  `4 + 200·44 = 8804 = 0x2264`; 0x1204 `4 + 200·36 = 7204 = 0x1c24`; 0x1205 `4 + 200·4 = 804 = 0x324`;
  0x1206 `4 + 200·8 = 1604 = 0x644`; 0x1207 `2 + 600·8 = 4802` (buf rounds to 0x12c4 = 4804);
  0x1208 `2 + 300·12 = 3602` (0xe14 = 3604); 0x1209 `1 + 21·2 = 43 = 0x2b`; 0x120a/0x120f
  `4 + 100·296 = 29604 = 0x73a4`; 0x120e `4 + 10·2924 = 29244 = 0x723c`. All consistent.
- 0x1209 Rank apply also reads two trailing partial fields (`*(u16)` + `*(u8)`) per the decompile — the
  record is effectively a u16 with the small leftover handled by the count loop; treat as u16/record.
- 0x120d copies **10 × u16 = 20 B/record** (loop `iVar1 = 10` over u16) into a `*5*8`-indexed slot —
  stride 20, max 600/msg, buffer 300.
- The per-message **max** is the largest `count` that fits the fixed body buffer; the **buffer max**
  is the client's `while (counter < N)` cap across the whole Begin/End transaction (overflow logs
  `SimpleInformation<X>_MAXSIZE over`).

### 2a. Per-record field hints (low/medium confidence — strides are HIGH confidence)

The client apply only memcpy's records into a buffer that the UI later reads; the per-field meaning
needs the UI reader (out of scope for a single pass). Best-effort, anchored to known schemas:

- **Character (0x1202, 288 B)** — a packed delta of `ResponseInformationCharacter` (0x0323, 724 B):
  the same id/ability/spot/flagship fields in a reduced 288-byte form. First dword almost certainly
  `character_id`. (See `docs/logh7-info-records-wire.md` for the full 0x0323 layout to map subfields.)
- **Outfit (0x1203, 44 B)** — fleet/squadron (艦隊/部隊) delta: id + parent + position + status counts.
- **Base (0x1204, 36 B)** — planet/base economy delta (population/food/morale snapshot); cross-ref the
  `NotifyBaseParameter` 18-field economy record in `docs/logh7-info-records-wire.md`.
- **Grid (0x1205, 4 B)** — one u32 per grid cell: packed grid ownership/visibility bitfield.
- **Strategy (0x1206, 8 B)** — `[u32 a][u32 b]`: likely `(planId/targetGrid, state)`.
- **Unit (0x1207, 8 B)** — `[u32][u32]` (the apply reads at +0 and +4 of a +2-based record): unit id +
  packed status/strength.
- **Card (0x1208, 12 B)** — `[u32][u32][u32]`: personnel-card (人事) delta = `(cardId, charId, seat)`.
- **Rank (0x1209, 2 B)** — u16 rank/promotion value list.
- **RankingCharacter (0x120a, 296 B) / CharacterEntry (0x120f, 296 B)** — same 296-byte stride as a
  ranking row / character-entry-state row (note they share apply shape and size with each other).
- **OrderSuggestCharacter (0x120e, 2924 B)** — the biggest record: an order/suggestion package per
  character (likely an array of order slots).

---

## 3. Chat family — CommandSpotChat 0xf1d / CommandSpotUnicastChat 0xf1e (siblings of GridChat 0xf1c)

The three chat commands share the **GridChat 0x0f1c** body shape already implemented in
`buildCommandGridChatInner` (`logh7-login-protocol.mjs`). The receive-side display helper is
`FUN_004be6f0(textPtr, msgLen_u8, contextDword)` which copies `msgLen` **UTF-16LE** code units
(2 bytes each, max 0xfe) into the chat log and null-terminates. The ONLY differences are where the
length byte and message start sit (because Unicast carries an extra target id):

| Code | Body | senderId/time | castType/channel | msgLen (u8) | message (UTF-16LE) | targetId | apply (recv) |
|---|---|---|---|---|---|---|---|
| 0xf1c CommandGridChat (DONE) | 0x8c (140) | u32 @0 | @4 channel(u32), @8 castType(u8) | **@9** | **@10**, ≤65 chars | — | FUN_004be660 → 6f0(t@+10,len@+9,ctx@+4) |
| 0xf1d CommandSpotChat | 0x8c (140) | u32 @4 (in struct; @0 inner) | @? | **@8** | **@10**, ≤65 chars | — | FUN_004be680 → 6f0(t@+10,len@+8,ctx@+4) |
| 0xf1e CommandSpotUnicastChat | 0x90 (144) | u32 @4 | @? | **@0xc** | **@0xe**, ≤65 chars | u32 (the extra dword) | FUN_004be6a0 → 6f0(t@+0xe,len@+0xc,ctx@+4) |

> The `param_1` passed to the apply is `structBase` (the copied buffer at clientBase+0x43d030 /
> 0x43d0bc); the `+4 / +8 / +0xc / +0xe / +0x10` offsets above are **into that struct = into the body
> at the same offset** (the memcpy is 1:1 from body to struct, dword-aligned). So on the wire body:
> - **SpotChat 0xf1d**: `[u32 sender/time @0][u32 ctx @4]…[u8 msgLen @8][?@9][u16[] message @10]`.
>   GridChat puts msgLen @9 and a castType @8; SpotChat reads msgLen @8 (no castType byte), message @10.
> - **SpotUnicastChat 0xf1e**: extra `targetCharId` dword pushes msgLen to @0xc and message to @0xe.
>   Layout: `[u32 sender/time @0][u32 ctx @4][u32 targetId @8][u8 msgLen @0xc][?@0xd][u16[] message @0xe]`.

**Confidence:** HIGH on the offsets above (directly from the three apply thunks). The exact identity
of the `@4` context dword (sender char-id vs server timestamp) and the `@8`/castType byte for
SpotChat is MEDIUM — by analogy to GridChat's `(time@0, channel@4, castType@8)` the SpotChat `@4` is
the spot/grid id and the unicast `@8` is the recipient char-id. A server can reuse the GridChat
builder, shifting the length/message for Unicast.

**Server semantics:** identical to the DONE GridChat relay (G190). On receipt:
- 0xf1d SpotChat → broadcast the body to every other player **in the same spot/grid** (scope = spot).
- 0xf1e SpotUnicastChat → deliver only to the single player whose char-id == `targetId @8`
  (private/whisper). Validate the sender owns the speaking character; clamp `msgLen ≤ 65`.

---

## 4. Settings family (0xf16–0xf1b) — small authoritative writes

These are C→S commands whose apply writes directly into the local player's settings struct. The
server must persist them on the account/character and, where they affect others, broadcast.

| Code | Class | Body | Field layout (body offsets) | Server semantics |
|---|---|---|---|---|
| 0xf16 | CommandSetTogether | 0xc | `[u32 @0 ?][u32 charId @4][u8 flag @8]` | apply `FUN_004c5540` walks the player table (stride 0x370, 0x80e80 span), finds the entry whose id == body@4 (id via `FUN_004b5b80`), sets `entry+0x2f4 = flag`. ⇒ a per-character "play together / grouping" toggle. Server: set the flag on that character, broadcast presence. **Confidence: HIGH on layout.** |
| 0xf17 | CommandSetWillMessage | 0x8c (140) | `[…0x23 dwords…]` (same 140-B shape as a chat msg: id + UTF-16 text) | player's "last will / status message" string. Persist; show to others on profile. **Med.** |
| 0xf18 | CommandSetOfflineDirection | 0x10 | `[u32 @0][u32 @4][u32 @8][u32 @0xc]` → copied to 0x43cf6c | offline-AI standing orders. Persist on character. **Med (4 dwords).** |
| 0xf19 | CommandSetUnitDistributePriority | 0x10 | 4 dwords → 0x43cf7c | supply/reinforcement distribution priority. Persist. **Med.** |
| 0xf1a | CommandSetReturnBase | 0xc | `[u32 @0][u32 @4][u32 @8]` → 0x43cf8c | default return/home base. Persist. **Med.** |
| 0xf1b | CommandSetPrivateAccountRate | 0xc | `[u32 @0][u32 @4][u32 @8]` → 0x43cf98 | private treasury / tax-cut rate. Persist; affects economy tick. **Med.** |

For 0xf18/0xf19 the handler copies `param_3[1]` into a local result first (`local_1c = param_3[1]`),
so **body dword 1 (@4) is an ack/result id** echoed by the client; the meaningful payload follows.

---

## 5. Account / Character family (0x1001–0x1008)

| Code | Class | Dir | Body | Layout / semantics | Conf |
|---|---|---|---|---|---|
| 0x1001 | ResponseInformationAccount | S→C | 0x1c0 (448) | 0x70-dword account card copied to clientBase+0x3584a4 (note: distinct from the selected-char id buffer at 0x3584a0 referenced in `docs/logh7-info-records-wire.md`). Account-level data: id, name, owned-character count, charge/billing state, entitlements. **Server: fill from the account store on world entry.** | Med |
| 0x1003 | ResponseUnChargeCharacter | S→C | 0xfa4 (4004) | 0x3e9-dword list of the account's **un-chartered/available** character slots (the roster the player may charge/activate). Copied to 0x358664. | Med |
| 0x1005 | ResponseCharacterEntryState | S→C | 0x20 (32) | 8-dword entry-state block (which character the account currently has "entered" / in-play, plus availability flags). Copied to 0x359608. **Server: send after login so the client knows the active-character state.** | Med |
| 0x1006 | CommandOriginalCharacterCharge | C→S | 0x18 (24) | 6-dword command: select/charge a canon ("original") character into the account. apply `FUN_004be760` raises UI event 0x1006. **Server: validate ownership/availability, mark the character active, reply 0x1005 + 0x1001.** | Med |
| 0x1007 | CommandExtensionCharacterCharge | C→S | 8 | 2-dword: `[u32 @0][u32 @4]` — charge an extension/extra character slot. **Server: validate entitlement.** | Med |
| 0x1008 | CommandGenerateCharacterCharge (DONE) | C→S | 0x80 (128) | 0x20-dword create-custom-character command (see `docs/logh7-character-creation-wire.md` / `docs/logh7-character-record-wire.md`). | High |

---

## 6. Mail / Messenger family (0x0f05–0x0f15) — detail

The mail layer is text-heavy and large; the binary conn3 bodies are fixed-size struct blocks (no
per-field bounds string except `CommandMessenger`/chat). The server only needs to **store, route, and
echo** these — full field decoding requires the UI reader. Sizes/handlers from §1.

### 6a. Mail-address book — ResponseInformationMailAddress 0xf05 (29204 B)
Bulk roster of the player's known mail addresses (the in-game messenger/mail contacts). Copied whole
to clientBase+0x448808. The apply `FUN_005266e0` is a **stub** ⇒ the UI reads the buffer directly.
Likely `[u16 count][address record × N]` with a per-record fixed string (cp949/UTF-16 name + id).
**Server: build from the account's contact list. Med confidence on internal layout.**

### 6b. Messenger status — ResponseInformationMessengerStatus 0xf07 (29900 B)
Online/offline/away status of all the player's messenger contacts (presence roster). **Server: push
on login and on any contact's presence change.** Internal record layout: Med/Low.

### 6c. CommandSendMail 0xf10 (1884 B)
The send-a-mail command. 0x1d7 dwords. Body = mail envelope + content: recipient id(s), subject,
body text (the bulk), attachments/flags. The same 1884-byte block is what `TransactionInformationMailEnd
0xf0a` carries back (same size, same 0x1d7-dword copy) ⇒ a sent/received mail record is 1884 B.
**Server: validate sender, store the mail, deliver to recipient(s) (push 0xf08/0xf0a or a mailbox
refresh), reply `CommandSendMail OK`.** Internal offsets: Med/Low (recipient id near the top, text
body the bulk; needs the compose-UI reader to pin exact offsets).

### 6d. CommandReadMail 0xf11 / CommandDeleteMail 0xf12 (300 B each)
Read/delete a mail by id. 0x4b dwords. Body ≈ `[u32 mailId][…flags/index…]`. **Server: mutate the
mailbox (mark read / remove), reply OK.**

### 6e. Order-suggest mail — 0xf13 / 0xf14 / 0xf15
The "order / suggestion" mail subsystem (a superior issuing orders, a subordinate replying):
- 0xf13 CommandOrderSuggestMail (612 B): compose an order/suggestion to another character. apply
  `FUN_004c2710`, gated on flag clientBase+0x487449.
- 0xf14 CommandReplyOrderSuggestMail (604 B): reply (accept/decline + message).
- 0xf15 NotifyCommandMail (604 B, S→C): server notifies the target that an order-mail arrived. apply
  `FUN_004c07e0`, struct at 0x4871ec.
**Server: route order-mail between characters, push 0xf15 to the recipient; on reply (0xf14) notify
the originator and optionally apply the order's command effect.** Med.

### 6f. Address/connection commands 0xf0b–0xf0f
- 0xf0b CommandExchangeMailAddress (588 B): add/exchange a contact's mail address.
- 0xf0c CommandDeleteMailAddress (292 B): remove a contact.
- 0xf0d CommandMessengerStatus (296 B): set own presence (online/away/busy/offline).
- 0xf0e CommandMessengerConnection (592 B): open/accept a 1:1 messenger session.
- 0xf0f CommandMessenger (1324 B): a messenger (live IM) payload — has bounds-checked text
  (`Input/Output_CommandMessenger … over than 512`), so the message text field is ≤512 bytes.
**Server: maintain the contact list + presence + active sessions; relay messenger payloads to the
peer; echo OK.** Med.

---

## 7. Server to-do (what the authoritative server must implement)

Priority order (highest playability first):

1. **Chat relay completion (0xf1d / 0xf1e).** Add `buildCommandSpotChatInner` and
   `buildCommandSpotUnicastChatInner` next to `buildCommandGridChatInner`, using the offsets in §3
   (SpotChat: msgLen@8, msg@10, 140 B; Unicast: targetId@8, msgLen@0xc, msg@0xe, 144 B). On inbound
   0xf1d → broadcast to all players in the sender's spot; 0xf1e → unicast to `targetId`. Reuse the
   G190 GridChat relay path; clamp `msgLen ≤ 65`, message is UTF-16LE.
2. **Simple-info delta pump (0x1200–0x120f).** Implement a `pushSimpleInfoSync(client, deltas)` that
   emits `0x1200` then one or more `NotifySimpleInformation*` (each `[u8 count][pad][record×count]`
   with the strides in §2), then `0x1201`. Start with Character (0x1202, 288 B), Base (0x1204, 36 B),
   Unit (0x1207, 8 B), Card (0x1208, 12 B) — these drive the in-world UI. Split sets larger than the
   per-message max across multiple Notify messages inside one Begin/End. Header is 4 B (count@0)
   except the 2-B-header records (0x1207/0x1208/0x120b/0x120d) and the 1-B-header 0x1209.
3. **Account/character entry (0x1001 / 0x1005 / 0x1003).** On world entry send `ResponseInformationAccount`
   (448 B, from the account store), `ResponseCharacterEntryState` (32 B), and `ResponseUnChargeCharacter`
   (4004 B roster). Handle 0x1006/0x1007 charge commands: validate, mutate active-character state,
   reply 0x1005+0x1001.
4. **Settings persistence (0xf16–0xf1b).** Parse each (layouts in §4), store on the
   account/character; for 0xf16 SetTogether set the per-character group flag and broadcast presence.
   Body dword 1 (@4) is an echo/result id for 0xf18/0xf19 — preserve it in the OK reply.
5. **Mail/messenger (0xf05–0xf15).** Implement a mailbox + contact list + presence service. Inbound
   CommandSendMail (1884 B) → store + deliver; CommandReadMail/DeleteMail (300 B) → mutate mailbox;
   messenger presence/session commands → maintain roster and relay. Push ResponseInformationMailAddress
   (29204 B) and ResponseInformationMessengerStatus (29900 B) on login. These are lower playability —
   social polish, not core combat/내정 — so stub with empty (count 0) records first to satisfy the
   world-load sequence, then fill incrementally.

**Endianness:** all bodies little-endian; only the 2-byte inner code prefix is big-endian. Chat
message text is UTF-16LE (2 B per code unit).

**Build helper note:** for the relayed S→C forms, reuse `buildLobbyResponseInner(code, size)` +
`subarray(6)` exactly as the existing GridChat/Tactics builders do; the conn3 wrapper adds the
`[u32 0]` message32 prefix.

---

## 8. Open questions

1. **Chat `@4` context dword & SpotChat `@8` byte.** By analogy to GridChat `(time@0, channel@4,
   castType@8)` — but whether SpotChat reuses a castType byte @8 or starts msgLen there is inferred
   from the apply reading `len@+8`; a live capture of a real 0xf1d would confirm there's no castType
   byte (i.e. SpotChat dropped GridChat's @8 castType, shifting msgLen up to @8).
2. **Per-record field maps for 0x12xx.** Strides are HIGH confidence (from the apply copy loops); the
   internal field meaning of each record (esp. Character 288 B, OrderSuggest 2924 B) needs the UI
   reader functions that consume `clientBase+0x4c83a4` etc. Cross-referencing the full-record
   equivalents (0x0323 = 724 B character) will recover most subfields.
3. **Mail body internal layout.** CommandSendMail (1884 B) recipient/subject/body offsets need the
   compose-UI writer; only the total size and the symmetric send/receive (0xf10 == 0xf0a size) are
   pinned here.
4. **0x120c per-msg max (180) vs buffer max (100).** The per-message cap (180 records fit the 0x21c4
   buffer) exceeds the client's `while (counter < 100)` buffer cap — the server should send ≤100
   CardAvailableOutfitSeat records per transaction to avoid the overflow log. Same pattern for
   0x1203 (200 vs 300 ok), 0x1205 (200 vs 180 — cap at 180), 0x120b (300 vs 100 — cap at 100),
   0x120d (600 vs 300 — cap at 300). **Use the smaller of the two as the safe per-message count.**
5. **Account card (0x1001) field semantics.** Size pinned (448 B); per-field meaning (billing,
   entitlements) is Med/Low without the account-UI reader.

---

### Evidence index (Ghidra addrs)
- `FUN_004b8b00` — receive-object factory (all body sizes; goto labels: f1d→0x8c, 42a→0xc, 43a→0xc,
  425→0x90, 431→8).
- `FUN_004ba2b0` — conn3 message32 apply/handler (copy dword-counts = sizes; dst struct offsets;
  per-code apply calls). Mail/messenger range ≈ lines 1566–1770; settings/account ≈ 813–976; simple
  info ≈ 1002–1170.
- Chat: `FUN_004be660` (0xf1c recv), `FUN_004be680` (0xf1d), `FUN_004be6a0` (0xf1e), `FUN_004be6f0`
  (display helper: UTF-16 copy, len u8, ctx dword).
- Settings: `FUN_004c5540` (0xf16 SetTogether — player-table walk, entry+0x2f4 flag).
- Account/char: `FUN_004be760` (0x1006), `FUN_004be780` (0x1007), `FUN_004be7a0` (0x1008).
- Simple-info Begin/End: `FUN_004c1dd0` (0x1200 reset), `FUN_004c1e50` (0x1201 commit).
- Simple-info applies (record strides): `FUN_004c1e80` (Character 288), `FUN_004c1fa0` (Outfit 44),
  `FUN_004c2040` (Base 36), `FUN_004c25b0` (Grid 4), `FUN_004c20d0` (Strategy 8), `FUN_004c2250`
  (Unit 8), `FUN_004c2150` (Card 12), `FUN_004c21e0` (Rank 2), `FUN_004c22d0` (RankingChar 296),
  `FUN_004c2360` (CompletenessSupplyOutfit 52), `FUN_004c23f0` (CardAvailOutfitSeat 48),
  `FUN_004c2480` (CardAvailBaseSeat 20), `FUN_004c2510` (OrderSuggestChar 2924), `FUN_004c1f10`
  (CharacterEntry 296).
- Mail applies: `FUN_005266e0` (0xf05 stub), `FUN_004c2680` (0xf0a), `FUN_004c07e0` (0xf15),
  `FUN_004c2710` (0xf13).
- Text-transport parsers (NOT the binary wire): `FUN_004815c0` (Input_CommandSpotChat),
  `FUN_00481120` (Input_CommandGridChat), `FUN_00471ba0` (Input_CommandMessenger) — comma/`{`-delimited
  ASCII (atoi `FUN_005ff09b`); the conn3 binary form is the struct copied by `FUN_004ba2b0`.
- Cross-check: `src/server/logh7-login-protocol.mjs` `WORLD_RESPONSE_OBJECT_SIZES` — every size in
  this doc matches the values already committed there.
