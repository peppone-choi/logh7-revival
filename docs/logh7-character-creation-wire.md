# LOGH VII — Character Creation (新キャラクターの作成) flow & wire protocol

Static RE of `G7MTClient.exe` (pristine SHA `2848be76…`, base `0x400000`, ASLR off so Ghidra VA ==
runtime VA). Goal: map the ORIGINAL character-creation path — UI screens and client↔server protocol
— so our authoritative server can support creating new characters.

**Sources:** Ghidra full export `E:/logh7-revival/.omo/ghidra/export/G7MTClient/`
(`functions.jsonl`, `strings.tsv`), pointer tables read directly from the PE
(`.omo/ghidra/bin/G7MTClient.exe`), UI strings `.omo/work/logh7-installed/exe/String.txt` (cp932,
flat line-indexed). Query tool: `python -m tools.logh7_redex {func|grep|str|xref|calls}`.

---

## 0. TL;DR — the answer

"新キャラクターの作成" creates an **extension character** (a draft char slot) on the account, then
the new char appears in the lobby `0x2004` card list and can be selected into a session.

Two message FAMILIES are involved, both registered as `name → code` tables and dispatched by the
master switch `FUN_004ba2b0` (`switch(param_2 & 0xffff)`):

| Family | Registrar | Code = | Names |
|---|---|---|---|
| **Account/Character (0x1000+)** | `FUN_0040a0f0` (`PTR_s_RequestInformationAccount_0075ecb4`, 9 entries, code = `idx+0x1000`) | `idx+0x1000` | RequestInformationAccount … CommandGenerateCharacterCharge |
| **Lobby (0x2000+)** | `FUN_00446b10` (`PTR_s_LobbyLoginRequest_00765cb8`, 12 entries, code = `idx+0x2000`) | `idx+0x2000` | LobbyLoginRequest … LobbySessionLoginNG |

Both pointer tables were read byte-for-byte from the binary (see §1) — the codes below are
**definitive**, not inferred.

The client send path is the **request/response correlator** `FUN_004b78a0(conn, kind, recordPtr)`:
a `switch(kind-1)` that maps a UI "kind" to a `(reqCode → respCode)` pair (full table in §3).
The relevant create/list/delete kinds:

| kind | reqCode → respCode | meaning | gate |
|---|---|---|---|
| 5 | `0x2003 → 0x2004` | LobbyRequest/ResponseInformationCharacterCharge (the CARD list) | — |
| 8 | `0x1000 → 0x1001` | Request/ResponseInformationAccount (the account ROSTER; gates creation) | — |
| 9 | `0x1001 → 0x1003` | Request/ResponseUnChargeCharacter (DELETE) | — |
| 10 | `0x1004 → 0x1005` | Request/ResponseCharacterEntryState | — |
| 0xb | `0x1005? → 0x1006` | **CommandOriginalCharacterCharge** (sync existing char) | `0x358375` (LobbyLoginOK) |
| 0xc | `→ 0x1007` | **CommandExtensionCharacterCharge** (register new char slots) | `0x358375` |
| **0xd** | `→ 0x1008` | **CommandGenerateCharacterCharge** (CREATE a new character) | `0x358375` |

> Note the gate `0x358375` (the LobbyLoginOK success flag set by inner-`0x2001` consumer `0x4bdb70`).
> All three Command*CharacterCharge sends are **only allowed once the account is lobby-logged-in.**

---

## 1. Message-code tables (read from the PE pointer tables)

`FUN_0040a0f0` and `FUN_00446b10` are string-table linear scans: they `strcmp` the inbound message
name against `PTR[idx]` and return `code = idx + base`. The tables, dereferenced from the binary:

### Account/Character family `PTR_s_RequestInformationAccount_0075ecb4` (code = idx + 0x1000)
```
0x1000  RequestInformationAccount        (C→S: ask account roster)
0x1001  ResponseInformationAccount       (S→C: roster — entry_character[≤5] + extension_character[≤2])
0x1002  RequestUnChargeCharacter         (C→S: delete a character)
0x1003  ResponseUnChargeCharacter        (S→C: delete result)
0x1004  RequestCharacterEntryState       (C→S)
0x1005  ResponseCharacterEntryState      (S→C: num[≤5] entry states)
0x1006  CommandOriginalCharacterCharge   (C→S: sync existing char into session)
0x1007  CommandExtensionCharacterCharge  (C→S: register new/draft chars)
0x1008  CommandGenerateCharacterCharge   (C→S: CREATE a new character)  ← the creation request
```

### Lobby family `PTR_s_LobbyLoginRequest_00765cb8` (code = idx + 0x2000)
```
0x2000  LobbyLoginRequest
0x2001  LobbyLoginOK
0x2002  LobbyLoginNG
0x2003  LobbyRequestInformationCharacterCharge    (C→S: ask card list)
0x2004  LobbyResponseInformationCharacterCharge   (S→C: card stream — the roster CARDS)
0x2005  LobbyRequestInformationSession
0x2006  LobbyResponseInformationSession
0x2007  LobbyCommandExtensionCharacterCharge      (C→S: lobby-side register new chars)
0x2008  LobbyCommandDeleteCharacter               (C→S: lobby-side delete; payload = session_id u32)
0x2009  LobbySessionLoginRequest
0x200a  LobbySessionLoginOK
0x200b  LobbySessionLoginNG
```

Reproduce:
```python
import pefile, struct
pe=pefile.PE('.omo/ghidra/bin/G7MTClient.exe', fast_load=True); base=pe.OPTIONAL_HEADER.ImageBase
# va2off + read 12 dwords at 0x765cb8 (lobby) and 9 at 0x75ecb4 (account) — each points to a name cstr
```

The dispatcher `FUN_004ba2b0` confirms each code by printing `"<name> OK"` in its case body
(`FUN_005923a0(s_…_OK)`), e.g. case `0x1008` prints `CommandGenerateCharacterCharge OK` then copies
`0x20` dwords (`param_3`) into `clientBase+0x43243c` and calls `FUN_004be7a0` (the create-result
post-proc). Other create-family cases:

| Case (`FUN_004ba2b0`) | "OK" string | store dest | dwords | post-proc |
|---|---|---|---|---|
| `0x1003` | ResponseUnChargeCharacter OK | `+0x358664` | `0x3e9` | — |
| `0x1005` | ResponseCharacterEntryState OK | `+0x359608` | `8` | — |
| `0x1006` | CommandOriginalCharacterCharge OK | `+0x43241c` | `6` | `FUN_004be760` |
| `0x1007` | CommandExtensionCharacterCharge OK | `+0x432434` | `2` | `FUN_004be780` |
| `0x1008` | **CommandGenerateCharacterCharge OK** | `+0x43243c` | `0x20` | `FUN_004be7a0` |
| `0x2004` | LobbyResponseInformationCharacterCharge OK | `+0x35975c` | `0x1b7` | (card screen) |

---

## 2. The CREATE request — `CommandGenerateCharacterCharge` (code 0x1008) byte layout

This is the packed SEND form. Two independent sources agree:

- **Dump-serializer** `FUN_00405ea0` (`_INF:CommandGenerateCharacterCharge`): emits each field via
  `FUN_00439da0(stream, fmt, LABEL, value)`; LABEL+offset give the names.
- **Binary stream parser** `FUN_004066f0` (`Input_CommandGenerateCharacterCharge::input_from_stream`):
  reads fields via the stream vtable (`*+0x1c`=u32, `*+0x20`=u16, `*+0x24`=u8;
  `FUN_00610420(ptr,n,0,2)` = read n raw bytes) — gives wire ORDER, TYPES, and size CAPS.
- **get_length** `FUN_00405720` (`Output_…::get_length`): base length `0x25` (37) + `2×(lastname_len
  + firstname_len + flagshipname_len)`; each name capped `< 0xe` (≤13 chars).

| offset | type | field | notes / evidence |
|---|---|---|---|
| 0x00 | u32 | **request_category** | `s_request_category__0075f3ac`; create vs original vs extension discriminator |
| 0x04 | u32 | (unnamed) | `*(param_1+4)`; likely target session/account id |
| 0x08 | u8 | **power** | nation/faction id (`s_power__0075ef28`) |
| 0x09 | u8 | **blood** | parentage/bloodline class (`s_blood__0075ee70`) |
| 0x0a | u8 | (unnamed, `DAT_0075ef0c`) | sex/gender candidate (same label as char 0x0323 field07) |
| 0x0b | u8 | lastname_len | cap `< 0xe` (≤13); parser throws `lastname_size over than 13` |
| 0x0c | u16[len] | **lastname** (UCS-2) | one u16 per char (see name encoding note) |
| 0x26 | u8 | firstname_len | cap `< 0xe` |
| 0x28 | u16[len] | **firstname** (UCS-2) | |
| 0x44 | u32 | (unnamed) | |
| 0x48 | u8 | **birth_month** | `s_birth_month__0075f39c` |
| 0x49 | u8 | **birth_day** | `s_birth_day__0075f390` |
| 0x4c | u32 | **face** | portrait-pool index (`s_face__0075ee60`); see Face/*.tcf pool |
| 0x50 | u8[8] | **ability_8** | the 8 stats 統率/政治/運用/情報 (PCP) + 指揮/機動/攻撃/防御 (MCP) (`s_ability_8__`) |
| 0x58 | u8 | **bonus_point** | unspent allocation points (`s_bonus_point__0075f380`) |
| 0x59 | u8 | **special_ability_num** | count of special abilities |
| 0x5a | u8 | **title** | titlename index |
| 0x5b | u8 | **rank** | rank index (14-rank scheme) |
| 0x5c | u8 | **flagship_type** | |
| 0x5e | u16 | **flagship_kind** | |
| 0x60 | u8 | flagshipname_len | cap `< 0xe` |
| 0x62 | u16[len] | **flagship_name** (UCS-2) | |
| 0x7c | u8 | **check** | trailing validation byte |

**Name encoding:** one **u16 (UCS-2 code point) per character**, stored 2 bytes apart starting
immediately after the length byte. Romaji/ASCII names are identical under UCS-2; Japanese names are
encoding-correct as UCS-2 (client converts to cp932 at GDI render via `WideCharToMultiByte`).
`name.charCodeAt(i)` is the correct per-char u16.

**`CommandExtensionCharacterCharge` (0x1007)** and **`CommandOriginalCharacterCharge` (0x1006)** are
sibling commands over the same buffer family (`FUN_00595ce0` builds the Extension buffer
`DAT_02228358` = `[u8 count][u32 charId × count]`, up to 5 ids — i.e. it registers a *set* of
already-defined characters as the account's active/extension set). `LobbyCommandDeleteCharacter`
(0x2008) is just `[u32 session_id]` (serializer `FUN_0043f070`).

---

## 3. Client SEND correlator — `FUN_004b78a0(conn, kind, recordPtr)`

Single dispatcher for all request/response message pairs. `iVar = (kind & 0xffff) - 1; switch(iVar)`
selects `reqCode` (`iVar1`) and the expected `respCode` (`iVar5`); several kinds are gated on a
login flag (`0x358375` = LobbyLoginOK, `0x35837e` = SSGameLoginOK). Full extracted table:

```
kind  reqCode  respCode  (gate)          message
 0    0x0200   0x0201                     SSLogin
 1    0x7000   0x7001                     (conn1 login)
 2    0x0205   0x0206                     SSGameLogin
 3    0x0203   0x0204    (0x35837e)       SS char id
 4    0x2000   0x2001                     LobbyLogin
 5    0x2003   0x2004                     LobbyRequestInformationCharacterCharge → card list
 6    0x2005   0x2006                     LobbyRequestInformationSession
 7    0x2009   0x200a                     LobbySessionLogin
 8    0x1000   0x1001                     RequestInformationAccount  (account roster)
 9    0x1001   0x1003                     RequestUnChargeCharacter   (DELETE)
 10   0x1004   0x1005                     RequestCharacterEntryState
 0xb  ----     0x1006    (0x358375)       CommandOriginalCharacterCharge
 0xc  ----     0x1007    (0x358375)       CommandExtensionCharacterCharge
 0xd  ----     0x1008    (0x358375)       CommandGenerateCharacterCharge  ← CREATE
 0xe..0x18                                world Information/Notify pairs (0x32x/0xf0x/0x323…)
```

Wrappers seen passing each kind (the actual call sites):
- `FUN_0051bea0` → `FUN_004b78a0(1,8,&DAT_02216714)` — request account roster.
- `FUN_0051be60` → `FUN_004b78a0(1,6,…)` — session list (card screen).
- `FUN_00598940(charId)` → `FUN_004b78a0(1,0xb,&DAT_022283ac)` — Original charge (one char).
- `FUN_00595ce0` → `FUN_004b78a0(0,0xc,&DAT_02228358)` — Extension charge (the new-char set).
- (Generate kind `0xd` is submitted through the same correlator from the creation form; the buffer
  is the 0x80-byte record of §2.)

---

## 4. UI flow map (screen → handler addresses)

The lobby start menu (after login) shows ゲーム開始 / 新キャラクターの作成 / セッションの変更 /
ゲーム終了 (String.txt: `844='ゲーム終了'`, `843='システム設定'`; the menu items are composed from
the object/scene system, not all literal in String.txt). Selecting **新キャラクターの作成** enters the
**character-management screen** driven by `FUN_00594f20` (scene state at `*(DAT_02215e2c+4)`):

| scene state | action | sends |
|---|---|---|
| 0x40–0x45 | screen setup / roster paint (`FUN_00595c80/d90/ca0/cc0`, `FUN_00597ea0`) | reads roster `DAT_0222846c[5]` |
| **0x46** | `FUN_005983c0()` — per-char Original charge loop | `FUN_00598940(charId)` → kind 0xb (0x1006) |
| **0x47** | `FUN_00595ce0()` — Extension charge (register the new char set) | kind 0xc (0x1007) |
| **0x48** | `FUN_00595d30()` — UI hit-test on the result; prints `ORIGINAL_CHARGE_OK` (`0x78dab4`) / `ORIGINAL_CHARGE_MISSTAKE` (`0x78da94`) | — |
| 0x54–0x56 | further sub-screens (`FUN_005960b0`, `FUN_00596130`) | |

The **creation FORM** itself (name entry, ability-point allocation, face picker, faction/gender/rank)
builds the §2 record and submits it as **CommandGenerateCharacterCharge (kind 0xd / 0x1008)**. The
form's per-field widgets live in this screen cluster (`FUN_005983c0`/`FUN_00595…`); the roster array
`DAT_0222846c` holds up to **5** character ids (matches `entry_character ≤ 5`), and the Extension
buffer count (`DAT_02228358`) is also capped at 5 ids by the `iVar1 < 0x14` (5×4) loop in
`FUN_00595ce0`.

Card list (after creation) — the lobby card screen: `0x2004` stream is parsed by `FUN_0043fd60`
(compact sequential records, `count < 3` per response), card objects enabled by `FUN_005024e0`/
`FUN_0051f1c0` only when record status ∈ {1,2}. See `docs/codex-handoff-2026-06-11.md` §G129–G136.

---

## 5. Validation rules (client-side gates)

From parser cap strings (`FUN_004066f0`, `FUN_00405720`, `Input_InformationAccount`):

- **Name lengths:** lastname / firstname / flagship_name each **≤ 13** UCS-2 chars (cap `< 0xe`);
  over-length throws `…_size over than 13` and aborts the stream.
- **Account roster caps (`Input_InformationAccount`, gates creation):**
  - **`entry_character_size ≤ 5`** — max 5 active/committed characters per account.
  - **`extension_character_size ≤ 2`** — max 2 newly-created/draft character slots per account.
    → **This is the "max characters per account" gate.** Creation (Generate/Extension) must respect it.
- **0x2004 card response:** `LobbyResponseInformationCharacterCharge information_size ≤ 2`; each
  `InformationCharacterCharge` has `character_size ≤ 1` and `next_session_size ≤ 1`.
- **`ResponseCharacterEntryState` (0x1005):** `num_size ≤ 5` (entry states for the ≤5 chars).
- **Ability points:** the 8 abilities are u8 each (`ability_8`@0x50) with a separate `bonus_point`
  (@0x58) for unspent allocation. The total-points budget / per-stat min-max is **enforced by the
  form UI**, not by the stream parser (the parser only range-checks name/array sizes). The exact
  budget constant lives in the creation-form widget logic (the `FUN_00595…`/`FUN_005983c0` cluster);
  it is a **UI rule, not a wire rule** — the server should re-validate it authoritatively (see §6).

**Account roster record layout (`ResponseInformationAccount` 0x1001, serializer `FUN_00409190`):**
top-level `state`@0 (u8), `fame`@4 (u32), `extension_character`@8 (u8 count ≤2) then an array of
sub-records (each: `session_id` u32, `power` u8, `camp` u8, `generated` u8, sex u8, `birthday_month`
u8, `birthday_day` u8, a u32, `state` u8, `ability_8` u16[8], `lastname`/`firstname`/`display_name`/
`titlename` pascal-u16 strings…), followed later by `entry_character[≤5]` with the same record shape.

---

## 6. Minimal server implementation checklist (make 新キャラクターの作成 work end-to-end)

Server seam: `src/server/logh7-login-session.mjs` (lobby state machine) + `logh7-login-protocol.mjs`
(builders) + `logh7-character-gen.mjs` (record fields). Existing: `0x2003→0x2004` card list and
`0x2005→0x2006` session list are handled; **`0x2007/0x2008` and the `0x1000/0x1006/0x1007/0x1008`
account/charge family are NOT yet handled** — that is the gap.

1. **Add code constants** (`logh7-login-protocol.mjs`): `REQ_INFO_ACCOUNT=0x1000`,
   `RESP_INFO_ACCOUNT=0x1001`, `REQ_UNCHARGE_CHARACTER=0x1002`, `RESP_UNCHARGE_CHARACTER=0x1003`,
   `REQ_CHARACTER_ENTRY_STATE=0x1004`, `RESP_CHARACTER_ENTRY_STATE=0x1005`,
   `CMD_ORIGINAL_CHARGE=0x1006`, `CMD_EXTENSION_CHARGE=0x1007`, `CMD_GENERATE_CHARGE=0x1008`,
   `LOBBY_CMD_EXTENSION_CHARGE=0x2007`, `LOBBY_CMD_DELETE_CHARACTER=0x2008`. (Cross-check against §1.)

2. **Parse the CREATE request** (`CommandGenerateCharacterCharge` 0x1008, §2 layout). Decode:
   request_category, power(@8), blood(@9), sex(@0xa), lastname/firstname (pascal-u16), birth m/d,
   face(@0x4c), ability_8[8](@0x50), bonus_point(@0x58), title(@0x5a), rank(@0x5b),
   flagship_type/kind/name. **Server-side re-validate:** name ≤13 UCS-2; ability budget (UI rule —
   enforce a canonical total, e.g. sum(ability_8)+bonus_point == budget, per-stat min/max);
   account char count `< 5 entry + < 2 extension`.

3. **Persist + assign id.** Allocate a new character id; store the record (CQRS/in-memory
   authoritative per `logh7-server-data-architecture`). Reuse `logh7-character-gen.mjs` field shaping
   where the form leaves blanks (e.g. derived stats), but the player-supplied fields win.

4. **Respond.** Echo the create as the dispatcher expects: `0x1008` (CommandGenerateCharacterCharge
   OK) wrapped `mpsClientMessage32` `[u32 0][u16 code][payload]`, payload sized to the `0x20`-dword
   (128-byte) store the dispatcher copies to `+0x43243c` (drives `FUN_004be7a0`). For the simpler
   path, also support **0x2007 LobbyCommandExtensionCharacterCharge** (lobby-side) and reply so the
   client re-issues `0x2003` → return the updated **0x2004** card list now including the new char
   (reuse `buildLobbyInformationCharacterChargeInner`, which already builds the compact card stream).

5. **Account roster (`0x1000→0x1001`).** Implement `RequestInformationAccount`: reply with
   `ResponseInformationAccount` (serializer shape in §5) carrying `entry_character[≤5]` +
   `extension_character[≤2]`. The creation screen reads this to know existing chars and remaining
   slots — without it the form can't enforce the slot cap and may not paint the roster.

6. **Entry state (`0x1004→0x1005`) and Delete (`0x1002→0x1003` / lobby `0x2008`).** `0x2008` payload
   is `[u32 session_id]`; on delete, drop the character and (client re-requests) return the shrunk
   `0x2004`/`0x1001` lists. `ResponseCharacterEntryState` carries `num ≤ 5` per-char states.

7. **Gate awareness.** The client only sends 0x1006/0x1007/0x1008 after LobbyLoginOK (`0x358375`),
   which the server already drives. No extra handshake needed; just answer the new codes on the same
   lobby connection (never close it — the lobby RPCs block until answered, per existing
   `LOBBY_REQ_INFO_*` handling in `logh7-login-session.mjs`).

8. **RED→GREEN.** Add focused tests in `tests/server/logh7-login-protocol.test.mjs` (builders/parsers
   for 0x1008/0x2007/0x1001) and `tests/server/logh7-login-session.test.mjs` (the 0x2007/0x1008
   handler branches) before wiring, matching the existing lobby-response test style.

---

## 7. Open questions

- **Exact ability-point budget + per-stat min/max** is a UI-form rule (in the `FUN_00595…`/
  `FUN_005983c0` widget cluster), not a wire cap. Needs either a focused decomp of the form's
  point-allocation widget or a live observation (create a char in the real client and capture the
  0x1008 buffer) to pin the canonical total. Recommend sourcing the budget from the manual
  (`logh7-manual-game-design`: 8 abilities, allocation scheme) and re-validating server-side.
- **`request_category` (@0x00) enum values** — distinguishes Generate vs the Original/Extension reuse
  paths. Capture from a live create, or decomp the form-submit that writes it (the §3 kind-0xd call
  site).
- **0x2007 vs 0x1008 division of labour** — the lobby family (0x2007) appears to be the
  account-side register, the session family (0x1008) the in-session create. For our single-server
  topology either may suffice; implement 0x2007 + 0x2003-relist first (smallest path to a visible new
  card), then 0x1008 if the client requires the session-family echo.
- **`face` index space** — confirm the Face/*.tcf 7-file pool index mapping the form offers vs the
  full portrait pool (`logh7-portrait-pool`); the form likely exposes a subset filtered by
  faction/rank/gender (the gem/gef/gam/gaf/o/oam/oem naming).

---

## Key addresses (quick reference)

| addr | role |
|---|---|
| `FUN_004ba2b0` | master S→C dispatcher (`switch(code & 0xffff)`); cases 0x1003/0x1005/0x1006/0x1007/0x1008/0x2004 |
| `FUN_0040a0f0` | account/character family name→code registrar (`idx+0x1000`) |
| `FUN_00446b10` | lobby family name→code registrar (`idx+0x2000`) |
| `FUN_004b78a0` | client send correlator (kind → req/resp code pair) — §3 table |
| `FUN_00405ea0` / `FUN_004066f0` / `FUN_00405720` | CommandGenerateCharacterCharge dump / parse / get_length — §2 |
| `FUN_00595ce0` | Extension charge sender (kind 0xc, buffer `[u8 count][u32 id×]`) |
| `FUN_00598940` | Original charge sender (kind 0xb) |
| `FUN_0043eff0` / `FUN_0043f070` | LobbyCommandExtension / LobbyCommandDelete serializers |
| `FUN_00409190` | ResponseInformationAccount serializer (roster: entry[≤5]+extension[≤2]) |
| `FUN_00594f20` | character-management SCREEN controller (scene FSM, states 0x40–0x56) |
| `FUN_0043fd60` | 0x2004 card-stream parser |
| `0x358375` / `0x35837e` | LobbyLoginOK / SSGameLoginOK gate flags (clientBase-relative) |

PE pointer tables: lobby `0x765cb8` (12×u32), account `0x75ecb4` (9×u32).

## Related docs
- `docs/logh7-character-record-wire.md` — the 0x0323/CommandGenerate SEND-form field table (overlaps §2).
- `docs/logh7-info-records-wire.md` — 724-byte 0x0323 inbound record, base/planet records.
- `docs/codex-handoff-2026-06-11.md` §G123–G136 — 0x2004 card stream + enable gate.
- Memory: `logh7-character-record-schema`, `logh7-message-code-scheme`, `logh7-manual-game-design`,
  `logh7-portrait-pool`, `logh7-server-data-architecture`.
