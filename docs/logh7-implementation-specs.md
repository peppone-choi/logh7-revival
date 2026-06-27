# LOGH VII — Implementation Specs (ordered, byte-pinned)

Source: static RE of `.omo/ghidra/export/G7MTClient/` (imagebase 0x400000) cross-checked
against the server builders, plus adversarial verifier passes. Each blocker is one of:

- **RESOLVED (static)** — pinned to file/fn/offset; implement now (exact edit below).
- **NEEDS-LIVE** — layout is pinned but a single fact (input-parser endianness, focus
  routing, etc.) can only be confirmed by one live client run; the experiment is specified.

**Non-negotiable invariants (do not regress):**

1. The live-verified **0x2006 session builder** `src/server/logh7-scenario-session.mjs`
   (`buildInformationSessionInner` / `writeSessionRecord`) is byte-correct for the live
   parser `FUN_00444900` and **must not be touched**. Inserting any byte shifts the single
   packed cursor → record-0 `name_len > 13` bail → empty session picker (the historical
   regression).
2. The live-verified **world-entry P0-01** path (`0x031c → 0x031d` via `staticBaseRecords()`
   in `logh7-login-session.mjs`, plus the `0x0f02` world-init burst) must stay byte-identical.
   Any new payload rides behind a **default-OFF env flag** so the proven bytes are unchanged
   when the flag is off.

Vtable stream readers (consistent across all parsers): `*(stream+0x1c)=u32`,
`*(stream+0x20)=u16`, `*(stream+0x24)=u8`, `*(stream+0x14)=float/double`.

---

## Implementation order

| # | Blocker | Status | Gate flag | Touches |
|---|---------|--------|-----------|---------|
| 1 | NotifyBaseParameter / planet economy | RESOLVED (static) | reuse existing 0x031f gate | `logh7-base-record.mjs`, `logh7-base-economy.mjs` (comment only) |
| 2 | shipclass-0x30b name/float offsets | RESOLVED (static) — **was wrongly "resolved"; builder has a +4 bug** | `LOGH_STATIC_SHIPS=1` | `logh7-info-records-static.mjs`, its test, `logh7-login-session.mjs` |
| 3 | orbit-slot 0x2c (revolutionRadius) | RESOLVED (static) — **NO-OP** | — | none |
| 4 | fleet-roster in 0x2006 | RESOLVED (static) — **WRONG TARGET, CLOSE** | — | none (future: new FUN_004301d0 builder) |
| 5 | flagship-binding endianness | NEEDS-LIVE | `LOGH_UNIT_BIND_BE=1` | `logh7-login-session.mjs` (Part A only) |
| 6 | P0-02 strategic 0x0b01 activation | NEEDS-LIVE | `LOGH_PLAYER_FOCUS_CELL=1` or 1-byte client patch | TBD after experiment |

Do items 3 and 4 first (they are no-ops / documentation). Then item 1, then item 2.
Items 5 and 6 require a live capture and must not be enabled by default.

---

## 1. NotifyBaseParameter / planet economy — RESOLVED (static)

**Premise was stale.** `buildNotifyBaseParameterInner` already exists in
`src/server/logh7-base-economy.mjs` as a byte-exact 74-byte builder, and its layout matches
parser `FUN_00438390` 1:1. But **NotifyBaseParameter is dead on the wire**: it has no client
dispatcher case and no opcode. Its provisional opcode `0x0337` is a **hard collision** —
dispatcher `FUN_004ba2b0` case `0x337` is `ResponseTacticsCharacter` (prints
`s_ResponseTacticsCharacter_OK_00770650`, copies `0x259`=601 dwords = 2404 bytes), already
owned by `logh7-battle-engine.mjs` (`RESPONSE_TACTICS_CHARACTER_CODE=0x0337`). Emitting a
74-byte body there would short-read into the tactics roster mid-battle.

**Wire layout (FUN_00438390, LE body, record 0x4a=74 B with budget[6]):**

| off | type | field |
|-----|------|-------|
| 0x00 | u32 | time |
| 0x04 | u16 | grid |
| 0x08 | u32 | base |
| 0x0c | u8  | budget_count (guard `< 7`, max 6; over → `s__Input_NotifyBaseParameter…@0x765040`) |
| 0x10 | u32[budget_count] | budget (step +4) |
| 0x28 | u32 | population (jinkou) |
| 0x2c | u32 | adult_population |
| 0x30 | u32 | approval (shijiritsu) |
| 0x34 | u16 | peace (chian) |
| 0x36 | u16 | thought (shisou) |
| 0x38 | u16 | religion (shuukyou) |
| 0x3c | u32 | energy |
| 0x40 | u32 | food (shokuryou) |
| 0x44 | u16 | living (seikatsu) |
| 0x46 | u16 | supplies |
| 0x48 | u16 | armor |

**Edit (correct fix = route economy through the already-live 0x031f, NOT 0x0337):**

- `src/server/logh7-base-economy.mjs`: leave the builder as an **offline/test-only artifact**.
  Do NOT emit `NOTIFY_BASE_PARAMETER_CODE=0x0337` to any client. Its tests stay green (they
  assert byte layout, not delivery).
- `src/server/logh7-base-record.mjs` line ~6 comment: stop calling `0x0337` a real client
  opcode; note it is unrouted/dead-on-wire.
- To actually populate the base panel, extend `buildResponseInformationBaseInner`
  (`logh7-base-record.mjs`, 0x031f, dispatcher case 799) with the budget/supply arrays and
  feed it from `planet-economy.json` in `logh7-login-session.mjs`, where
  `buildResponseInformationBaseInner` is **already imported and emitted** (lines 69 / 759 /
  1253). Keep that emission gated exactly as today (no change to P0-01 or the 0x2006 builder).

**Caveat (only `needsLiveClient` sub-question):** `population@0x28` and `food@0x40` have NO
slot in 0x031f (they live only in the dead NotifyBaseParameter, and the client never stores
them as a named struct). The economy panel itself renders via 0x031f; if raw population/food
must be shown, a live RE pass is needed to find which on-screen field sources them. This does
**not** block delivering the economy panel.

**Risk:** zero — only `logh7-base-record.mjs` (0x031f) and a comment change. Hazard prevented:
never wire `buildNotifyBaseParameterInner` to a client (the 0x0337 collision corrupts tactics).

---

## 2. shipclass-0x30b ship-class master — RESOLVED (static), builder has a +4 BUG

**The earlier "resolved, just wire it in" claim was WRONG.** The verifier re-read both client
routines and the existing builder is **misaligned by +4 bytes** in the name and everything
after `w06`, plus the floats are at the wrong offsets. It is statically pinnable — it was
pinned wrong. **Do not enable until the builder offsets are corrected AND the test re-asserts
against client offsets.**

**Request/response (correct):** request `0x030a` (parameterless, world-load only), response
`0x030b ResponseStaticInformationUnitShip`, body `0x6d64`=28004 B, outer count u8 @0x00
(cap 200), 3 pad, records start @body+4, stride `0x8c`=140 B.

**Anchor (both client routines agree): record origin R = body+4.**
Store `FUN_004ba2b0`: kind dword @R+0, w04 @R+4, **name-length byte @R+0x08**.
Parser `FUN_004109a0`: `param_1 = R+2`; name-length read `(*+0x24)(param_1+6)` = **R+0x08**;
name guard `0xd < name_len` at R+0x08; name chars from `param_1+8` = **R+0x0a**.
Floats use the `+0xc` vtable reader at `param_1+0x36/0x3a/0x5a/0x5e` =
**R+0x38, R+0x3c, R+0x5c, R+0x60 (FOUR floats)**.

**Correct per-record layout (R = record base, stride 0x8c):**

```
kind   u16 @R+0x00
b02    u8  @R+0x02
b03    u8  @R+0x03
w04    u16 @R+0x04
w06    u16 @R+0x06
name_len u8 @R+0x08          (client bail if 0x0d < name_len)
name   u16[<=13] @R+0x0a
u16 @R+0x24 ; u32 @R+0x28 ; u16 @R+0x2c,0x2e,0x30,0x32,0x34
float @R+0x38 ; float @R+0x3c
11x u16 @R+0x40
u16 @R+0x56,0x58
float @R+0x5c ; float @R+0x60
u16 @R+0x64,0x66,0x68,0x6a,0x6c ; u8 @R+0x6e ; u16 @R+0x70
u8 @R+0x72,0x73 ; u16 @R+0x74 ; u8 @R+0x76,0x77 ; u16 @R+0x78
u8 @R+0x7a ; u16 @R+0x7c ; u8 @R+0x7e
u16 @R+0x80,0x82,0x84,0x86,0x88,0x8a
```

**Current builder defect** (`logh7-info-records-static.mjs:276` `buildStaticInformationUnitShipInner`):
- line 290 writes name at `base + 0x0c` → must be **`base + 0x0a`** (name-len byte at +0x08,
  chars at +0x0a). Off by +4.
- lines 303–304 write only TWO floats at `base+0x6c` and `base+0x74` → the client reads FOUR
  floats at `R+0x38, R+0x3c, R+0x5c, R+0x60`; those byte positions are never read as floats.
- The named-stat block @0x54 and tail @0x7c offsets also follow from the +4 drift and must be
  re-laid to the table above.
- Test `tests/server/logh7-info-records-static.test.mjs:167` (`readUInt8(s0+0x0c)==4`) passes
  only because it round-trips the builder against itself — it must be changed to assert
  **name-len @R+0x08, name chars @R+0x0a** (client offsets).

**Edits (in order):**

1. `src/server/logh7-info-records-static.mjs` — rewrite the per-record writes of
   `buildStaticInformationUnitShipInner` to the corrected table (name-len @+0x08, name @+0x0a,
   floats @+0x38/+0x3c/+0x5c/+0x60). Keep `writeName16` truncating to ≤13 wide chars.
2. `tests/server/logh7-info-records-static.test.mjs` — re-assert against the client offsets
   above (not builder-vs-builder).
3. `src/server/logh7-login-session.mjs`:
   - Extend the `./logh7-info-records-static.mjs` import to also import
     `buildStaticInformationUnitShipInner`.
   - Add `const REQ_STATIC_INFORMATION_UNIT_SHIP_CODE = 0x030a;`.
   - Add a branch **BEFORE** the generic walker fall-through (`const worldInner =
     buildWorldDataResponseInner(innerCode + 1)` at line **1407**), seeding from
     `contentPack.shipClasses` (normalized `{id,name,nationId,role,hp,attack,defense,speed}`),
     `.slice(0,200)`, names truncated to 13. Empty pack → emit the empty real frame (count 0)
     = today's exact bytes. Do NOT use `createInfoRecordsStaticState` (not wired into
     login-session).

**Gate:** put the real payload behind `LOGH_STATIC_SHIPS=1`, default to the existing empty
0x030b reply. Flip on only after ONE live world-load confirms `0x030b → 0x0310/0x0311` with
names rendered (post-w06 stat-slot semantics are MEDIUM confidence even after the offset fix).

**Why safe:** the new branch sits before line 1407, so all other walker codes still hit the
untouched generic fall-through; framing/inner-code/size (0x6d64) are byte-identical; count-0
frame == today's bytes; `0x030b` is not in `WORLD_OK_STATUS_CODES`.

---

## 3. orbit-slot 0x2c (revolutionRadius) — RESOLVED (static), NO-OP

Dest `+0x2c` (revolutionRadius) on the 0x031d static-base record has **NO orbit render
consumer.** The client draws planet rings from a fixed formula `ringRadius = (presentOrdinal +
1.0) * 0.25` (`FUN_004d3bd0` line 356; `FUN_004d68d0`), reading neither `+0x2c` nor `+0x28`
from the 0x3c-stride array at `clientBase+0x3f5ae8`. The only count-gated cap on 0x031d is the
name (`name_len <= 13` → `Input_StaticInformationBase name_size over than 13 @0x7631ac`).

**Edit: NONE.** Keep `buildStaticInformationBaseInner` (`logh7-info-records.mjs:172`) writing
`+0x2c = clampU32(undefined) = 0` (line 200) — exactly what the live P0-01 path ships today
(`staticBaseRecords()` omits revolutionRadius). Note `buildStaticInformationBaseInner` writes
name at `+0x0c`, which is **correct for 0x031d** (this is a different message from the 0x030b
ship-class record in item 2 — do not "fix" it).

Planet visibility/names come from the per-planet present-set + KO names (economy path,
item 1), not from `+0x2c`. Any future `+0x2c`/`+0x28` write is cosmetically inert (no renderer
reads them) and must keep u32/f32 typing and the name cap; gate + re-run the 031d stream-ring
live probe if ever changed.

---

## 4. fleet-roster in 0x2006 — RESOLVED (static), WRONG TARGET → CLOSE

The blocker's premise is false. A per-power fleet roster **cannot** be added to
`LobbyResponseInformationSession (0x2006)`. The live 0x2006 parser `FUN_00444900` has no
roster-count byte and no `u16[]` roster array anywhere. Its only count-gated arrays are
`session_name(<0xe)`, `begin_day(<0x42)`, `super_man(<0xe)`, per-power `pend(<2)`, session
`ending(<2)` — matching `writeSessionRecord` in `logh7-scenario-session.mjs` byte-for-byte.

Discriminator: error string `0x00766278`
(`[Input_LobbyResponseInformationSession…] information_size over than 64`) is referenced ONLY
by `FUN_00444900` and its text-dump sibling `FUN_00445170`, NEVER by `FUN_004301d0`.

The `u8 count(<0xe)` + `u16[count]` array the blocker saw lives in `FUN_004301d0`
(`Input_InformationCharacter`, at dest `+0x28` count / `+0x2a` array). Per its own gate string
`0x00763564 "card_size over than 16"`, that array is the character **card** array (cap 16),
not a fleet roster. `FUN_004301d0` also references `Input_Parentage` strings and an
8-iteration ability loop @+0x18a (the `ability_8` array) — unmistakably the personnel/character
message, reached by a **different opcode** (dispatch-table-registered; opcode TBD from the
receive-object factory).

**Edit: NONE.** Do NOT touch `logh7-scenario-session.mjs`. If a `<=14` numbered-fleet roster
is ever needed, it must be a NEW builder for the `FUN_004301d0` message behind a feature flag,
validated by a byte-oracle test mirroring `FUN_004301d0`'s read order — never on 0x2006.

**Status: CLOSE this blocker as wrong-target.**

---

## 5. flagship-binding (flagship@0x24 == unit.id) — NEEDS-LIVE

The bind chain is fully pinned statically; the current `0x0f02` path
(`LOGH_WORLD_PLAYER=1`) already satisfies all three client requirements **for id value 1**.

**Bind (`FUN_004c2a80`):**
OUTER `*piVar5 == *(clientBase+0x3584a0)` → char.id@record+0x00 == selected-char-id
(set only by dispatcher case `0x204`).
INNER `piVar5[9] == *piVar4` → char.flagship@record+0x24 == unit[i].id@elem+0x00
(unit table `clientBase+0x41a368`, stride 0x58, count u16 @0x41a364).
Both match → `FUN_004c2c80(0,piVar5)` writes the controllable PLAYER_INFO slot
(`clientBase+0xc`, stride 0x370, id@slot+0x24).

**The one unresolved fact — a BE/LE wire asymmetry:**
`0x0323` writes `gridUnitId@0x24` as **BE**; `0x0325` writes `unit[0].id` as **LE**. Masked
today because `worldCharId()==worldUnitId()==1` is endian-symmetric.
Test-proven: `tests/server/logh7-login-session.test.mjs:743` asserts unit id LE==1, `:748`
asserts gridUnitId BE==1. The dispatcher (`FUN_004ba2b0`) only does flat dword copies with no
per-field swap; the per-message-code wire→param_3 INPUT parser (upstream of the dispatcher) is
NOT in the decompile, so whether a **non-symmetric** id survives the raw 32-bit INNER compare
**cannot be pinned statically.**

**Part A (static, SAFE, gated — implement now, default OFF):** make `0x0325` unit[0].id
endianness MATCH the `0x0323` gridUnitId endianness on the world-init (`0x0f02`, ~line 911)
and grid-enter (`0x0f06`, ~line 1072) bursts. Add `wireEndian:'be'` (or
`wireLayout:'parser-stream'`, which maps to `valueEndian='be'` at
`logh7-login-protocol.mjs:492`) to `buildInformationUnitRecordInner` on those two bursts,
behind a NEW opt-in env **`LOGH_UNIT_BIND_BE=1`**. With the flag off, the proven LE-value-1
path is byte-for-byte unchanged. Keep `worldUnitId()==worldCharId()` default=1.
Part B (char.flagship/gridUnitId and selected-char-id) already correct — no change.

**Live experiment (Part C — disambiguate layout vs the masked id):** run the unpatched client
with `LOGH_WORLD_PLAYER=1` and a **non-symmetric** id `LOGH_WORLD_UNIT_ID=0x02000000`
(worldUnitId != worldCharId). Trace whether the `FUN_004c2a80` INNER match fires (PLAYER_INFO
slot at `clientBase+0xc` gets a non-zero id) via `tools/logh7_player_info_probe.py`.
- If LE works for the non-symmetric id → Part A is unnecessary (leave flag off).
- If it fails → enable `LOGH_UNIT_BIND_BE=1`.
`mode==2 (clientBase+0x126711)` is already set on the live world-entry path — no mode change.

**Caveat:** P0-02 burned 60 prior live cycles, so the failure could also be **timing** (the
`0x36a5dc` count reset at `0x0f01`/`0xb09 NotifyEnterGridBegin` wiping the 0x0323 record before
`FUN_004c2a80` runs), not layout. Keep all changes behind the existing
`LOGH_WORLD_PLAYER`/`LOGH_GRID_ENTER` opt-ins + the new default-OFF endianness gate; keep
oracle tests `:718`/`:767` green before any live cycle; then ONE live cycle with the
non-symmetric id.

---

## 6. P0-02 strategic command activation (0x0b01 CommandSelectGrid) — NEEDS-LIVE

Two static-confirmed defects gate the `0x0b01` emission. `0x0b01 CommandSelectGrid` fires only
when, on a LEFT-click, `FUN_004d6310` returns pass for the clicked cell, requiring (a) an
in-range projected gridX/gridY and (b) root current cell `*(DAT_007cd04c+0x11178)` to match
the clicked cell.

**Defect 1 (grid-X) — measurement artifact, NOT a real bug.** `FUN_004d3580` is a 2-arg
`__ftol` that pops two floats off the x87 FPU stack (projected vec from `FUN_004b25a0`); the
corrupted `gridX=0x007b360c` readings (v52–v56) were mid-function / call-instruction Frida
hook artifacts. Return-gated watchers (v57–v60) showed the projection is actually correct
(≈87/88, 25). Grid store targets: `[ebp+0x24]=gridX`, `[ebp+0x28]=gridY`.

**Defect 2 (empty current-source / focus) — THE REAL BLOCKER.** The validator pass needs
`cur=*(DAT_007cd04c+0x11178)` to point at the clicked cell, but the root current stays 0 every
run. Chain: `FUN_004c4170` (string `WorldIn_StrategyFieldImport`) reads `ecx=[mainState+8]`,
`src320 = *(ecx+0x320)`, calls `FUN_004c45f0(src320, 2)` which sets `mainState+0x126714=value`
and mode byte `+0x126711=2`, driving `FUN_004b64c0 → FUN_004c8a10` (root assign of
`DAT_007cd04c`). `[mainState+8]` is the inline source `mainState+0xc`. `source+0x320` is fed
ONLY by `FUN_004c2c80` param_4 (block-copied to `source+0x318`, so `source+0x320 ==
param_4[2] == optionalRecord+0x08`).

**The defect:** dispatcher `FUN_004ba2b0` case `0x325` calls
`FUN_004c2c80(this=mainState, mode=1, rec=0, optional=&unit[0])`. **`mode=1` routes to slot
`mainState+0x80e8c`, NOT the inline source `mainState+0xc`.** The inline source is written only
by `FUN_004c2a80 → FUN_004c2c80(mode=0, piVar5)` which passes NO param_4. So no path writes the
inline current-source `+0x320` → `FUN_004b5bb0` returns 0 → `+0x126714` stays 0 → root
`+0x11178` never gets the player cell → `FUN_004d6310` never matches → no natural `0x0b01`.
Matches loop evidence v37–v45 and v52–v61.

**Two candidate fixes (the live experiment decides which):**

- **Client routing:** change `mode 1→0` in case 0x325. The patch byte is the **imm8 of the
  `push 1` at `0x004bb172`** — i.e. write `0x004bb173: 01 → 00`. (Verifier correction: the
  `6A` opcode is at `0x004bb172`; the immediate is at `0x004bb173`.) 1-byte client patch in
  `tools/client_patches/`, no server change.
- **Server cell placement:** in `localFleetRecord()` (`logh7-login-session.mjs`) set the
  unit `+0x08` (commander) slot to the player home cell id (`row*100+col`, same as
  `fleetCellId()`) for the player's own fleet, behind default-OFF `LOGH_PLAYER_FOCUS_CELL=1`.
  (Server already supplies commander=charId @+0x08 and cell @+0x0c via `localFleetRecord()` /
  `unitFleetsForLocation()` while mode==2 — lines 911/1072/1346.)

Do NOT change `buildInformationUnitRecordInner`'s minimal no-fleets form (id+count only) — that
is the live-verified world-entry path.

**Live experiment (single fresh run, FUNCTION-BOUNDARY hooks ONLY):** mid-function / call-site
hooks crashed the client before (v26 ECONNRESET, v57 trampoline at 0x512062f) — forbidden.
Keep relay/NPC flags OFF (over-enabling → ECONNRESET on world entry).
1. stop; start with proven-safe flags (`LOGH_LOBBY_OK_FORMAT=message32`,
   `LOGH_LOBBY_EARLY_OK=1`, `LOGH_SS_FORMAT=message32`, `LOGH_STRAT_GALAXY=1`,
   `LOGH_STRAT_GRID_EARLY=1`, full-world + post-load player record); attach Frida BEFORE login;
   reach world via `ui_explorer`; left-click a known in-range cell (e.g. Fezzan (49,38)).
2. Hooks: (A) onEnter `FUN_004c4170` log `src320=*(ecx+0x320)`, onLeave log `+0x126714`,
   `+0x126711`; (B) onEnter `FUN_004c2c80` log `mode`, `optional`, dest slot; (C) onLeave
   return-gated `FUN_004d6310` log retval low byte, `STATE+0x24/+0x28`, `*(DAT…+0x11178)`.
3. **Positive control (one-shot, natural click):** at `FUN_004c4170` onEnter, if `src320==0`,
   WRITE `*(ecx+0x320)=row*100+col` of the player home cell. Observe whether `+0x126714`
   becomes nonzero, `*(DAT…+0x11178)` equals the clicked cell, `FUN_004d6310` flips to pass,
   and an outbound `0x0b01` appears. If `+0x11178` stays 0, add (D) onEnter `FUN_004c8a10` /
   `FUN_004c8bc0` to watch `DAT_007ccffc+0x2c03cc` (the 0x0315 RLE grid map) — the player cell
   may also need a nonzero 0x0315 cell value at the home position.
4. Cleanup: stop; verify canonical playable SHA restored; no G7MTClient/Frida/python watcher
   and no 4787/47900/47901 listeners.

**Gate:** any server change is default-OFF (`LOGH_PLAYER_FOCUS_CELL=1`) so P0-01 and the 0x2006
builder stay byte-identical. The Frida WRITE is diagnostic-only (one-shot, on a natural click).
