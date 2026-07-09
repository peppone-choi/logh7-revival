# LOGH VII — Server implementation roadmap (login → world → SPACE WAR + internal affairs)

Ordered, dependency-aware plan to make the original unpatched client (`G7MTClient.exe`) fully playable.
Each item names the **file to touch**, the **function to add**, and the **acceptance test**. Ground-truth
wire layouts live in the per-family docs (`docs/logh7-proto-*.md`) and the master index
`docs/logh7-protocol-master.md`. Server is Node.js ESM; every engine module is pure + synchronous so it is
unit-testable without a live client (see the existing `tests/server/*.test.mjs` pattern: import the builder/
parser/engine, assert on the returned Buffer/decision).

**Conventions every item obeys.** C→S inner = `[u16 BE code][LE body]`; S→C conn3 = message32
`[u32 0][u16 BE code][LE body]`. Build inners via `buildLobbyResponseInner(code, size)` + write into
`inner.subarray(6)`. Clamp every array count to its cap (the client throws + drops on overflow). Route every
notify through `processCommand`'s `{accept, notifies:[{inner, target:'all'|'others'}]}` contract.

---

## Status: what already works (do NOT redo)

- **login → lobby → session → world load** (G164/G200), unpatched client renders space view + HUD.
- **Tactical move** 0x400/0x402 → 0x423/0x424 (`parseInboundMoveShip`, full pose parse).
- **Strategic move** 0xb01 → 0xb07 (`parseInboundMoveGrid`, `buildNotifyMovedGridInner`).
- **SPACE WAR core (Phase 1 partially done):** `logh7-combat-engine.mjs` (`parseInboundAttack`,
  `parseInboundChangeMode`, `computeDamage`, ship stat catalog), `logh7-world-state.mjs` (ship pools,
  `pickTarget`, `applyDamage`, `removeShip`, `lowerMorale`, battle session), `processCommand` handlers for
  0x405/0x406 (attack/shoot → 0x426), 0x407 (fight), 0x404 (warp placeholder), 0x411 (changemode → 0x42f),
  and builders `buildNotifyAttackedShipInner`/`buildNotifyChangeModeInner`/`buildNotifyMoraleDownInner`/
  `buildNotifyFoughtInner`. Tested in `tests/server/logh7-{combat-engine,command-engine,world-state}.test.mjs`.
- **Character creation** 0x1008 (+0x1006/0x1007), chat 0x0f1c.

So Phase 1 below is the **remaining** space-war work to go from "fire resolves" to "a real battle the client
can be driven into and out of": the battle-entry setup tables, accurate NotifyChangeMode spawn-pose seeding,
the air/confusion notifies, and teardown — plus hardening the existing handlers.

---

# PHASE 1 — SPACE WAR (make a tactical battle enterable, playable, and exitable)

Dependency order. Items 1–3 = make the client actually ENTER a controllable battle (the current 0x42f
builder only seeds unit ids, not poses; no setup tables are pushed). Items 4–6 = round out the in-battle
fire/status loop. Item 7 = exit. Items 8–9 = hardening + live verification.

### P1.1 — NotifyChangeMode spawn-pose seeding (the battle-entry grant)

The current `buildNotifyChangeModeInner` writes only `unitId` per entry; the client applier `FUN_004c1c30`
reads `{shipId, heading, x, z, y}` (20B) and seeds each ship's world pose. Without poses the ships spawn at
the origin. Add the full participant pose array + `modeKind`/`anchorId`/tail params.

- **File:** `src/server/logh7-login-protocol.mjs`
- **Function:** extend `buildNotifyChangeModeInner({ modeKind=0, anchorId, mode, leaderId, participants:[{shipId,
  heading,x,z,y}], tail0, tail1 })` — write `u8 modeKind` low byte @0x04, `u32 anchorId` @0x08, `u8 count`
  @0x0c, then per entry @0x10 stride 20 `{u32 shipId, f32 heading, f32 x, f32 z, f32 y}`, `u32 tail0` @0x290,
  `u32 tail1` @0x294. Keep the existing `units` arg as a back-compat alias of `participants`.
- **Detail:** `modeKind=0` = normal engage (maps `ship+0x5c4=0`). Floats are LE IEEE-754, same XZ space as
  0x423. Evidence: `docs/logh7-proto-battle-core.md` §2a/§2b.
- **Test:** `tests/server/logh7-login-protocol.test.mjs` — build with 2 participants at distinct
  (x,z,heading); assert byte length 0x298+6, `modeKind`@(6+4), `count`@(6+0xc)===2, and `readFloatLE` of
  entry[1].x/z/heading round-trip within 1e-3.

### P1.2 — Battle-setup data tables (the read model pushed before 0x42f)

The client needs the tactics read model populated or the battle field is empty. Build the packed-wire
records (NOT zero-padded). Start with the three the fire loop needs (PositionUnit, UnitShip, FillShield/
FillBeamGun); add the rest behind the same builder set.

- **File (new):** `src/server/logh7-battle-engine.mjs` + builders in `src/server/logh7-login-protocol.mjs`
- **Functions:**
  - `buildResponsePositionUnitInner(units)` → `[u16 count][{u32 id, f32 x, f32 y, f32 z, f32 heading}×count]`
    (stride 20, cap 600). **This is the minimum to place ships.**
  - `buildTacticsInformationUnitShipInner(ships)` → `[u16 count][47B record×count]` (id/morale/confusion/
    character/pos vec3/direction/detachment leader+anchor+dir/search).
  - `buildTacticsInformationFillShieldInner(ships)` → `[u16 count][{u32 id, u32 shield[6], u16 fill[6]}×count]`
    (40B). `buildTacticsInformationFillBeamGunInner(ships)` → `[u16 count][{u32 id,(u32,u16)×2}×count]` (16B).
  - `buildTacticsCharacterInner(charIds)` → `[u16 field0][u16 count][u32 id×count]`.
  - (later) `buildTacticsInformationBaseInner`, `buildResponsePositionBaseInner`, `buildInformationObstacleInner`.
- **Detail:** counts are u16 except Base/PositionBase (u8 + 3 pad). Pull static caps (durability/beam/shield)
  from `content/ship-stats.json`; live state (pos/morale/shield-fill) from world-state. Evidence:
  `docs/logh7-proto-tactics-data.md` §1–§8.
- **Test:** `tests/server/logh7-battle-engine.test.mjs` — for each builder, assert the count header + that
  `2 + count*stride` bytes of records were written and a sample record's id/floats round-trip.

### P1.3 — Battle entry orchestration (0xb06 SwitchMode / 0x411 → open field + push tables + 0x42f)

Tie P1.1+P1.2 together: when a player engages, the server opens a battle field, seeds participant poses, and
pushes the read model then the grant.

- **Files:** `src/server/logh7-battle-engine.mjs` (new), `src/server/logh7-command-engine.mjs`,
  `src/server/logh7-world-state.mjs`
- **Functions:**
  - `logh7-combat-engine.mjs`: add `parseInboundSwitchMode(inner)` → `{mode, unitIds(≤70), charIds(≤10)}`
    (header dwords + u16 mode@0x14 + u8 unit_size@0x16 + u32 ids@0x18 + u8 char_size@0x138 + u32 ids@0x13c).
    Evidence: `docs/logh7-proto-strategic-logistics.md` A.5 / `battle-core` §9.
  - `logh7-battle-engine.mjs`: `openBattleField(state, { participants, anchorId, modeKind })` → returns the
    ordered list of notify inners: `[0x337, 0x33b, 0x341, 0x343, 0x349, (0x345,0x34b,0x347), 0x42f, 0xf1f]`.
  - `logh7-world-state.mjs`: extend `openBattle` to store `{anchorId, participants:Map<shipId,pose>, modeKind}`
    and a `battleField()` getter; spawn participant ships via `upsertShip` with their poses + factions.
  - `processCommand`: add a `COMMAND_SWITCH_MODE_CODE 0xb06` branch (and enrich the 0x411 branch) that calls
    `openBattleField` and returns its notifies with `target:'all'`.
- **Detail:** participants = both sides' ships (the server picks spawn poses in the XZ plane). `0xf1f
  NotifyTactics` (8B, `buildNotifyTacticsInner({arg0,arg1})`) is the final "enter space-war" trigger;
  byte0 of arg0 selects the setup branch (`==1`→state 2). Evidence: `tactics-data` §9.
- **Test:** `logh7-command-engine.test.mjs` — feed a 0xb06 inner with 2 unit ids + 1 char id; assert
  `accept`, that the returned notifies include codes 0x349, 0x33b, 0x42f, 0xf1f in that order, and that
  `state.isBattleActive()` and `state.getShip(unitId)` poses match the seeded participants.

### P1.4 — AirBattle 0x40e/0x428 + Confusion 0x43d/0x43e (round out fire types)

- **Files:** `src/server/logh7-combat-engine.mjs`, `logh7-login-protocol.mjs`, `logh7-command-engine.mjs`
- **Functions:**
  - `parseInboundAirBattle(inner)` (same attacker-array shape as attack; target @0x94). Reuse
    `parseInboundAttack` (target offset matches) — add a thin wrapper.
  - `buildNotifyAirBattleInner({ attackerId, targetId, showVisual, newDurability, newShield, hitLoc,
    sectionShield, statusByte })` — 24B, note `showVisual` is byte @0x0d (off-by-one), durability @0x0e,
    shield @0x10, hitLoc @0x12, sectionShield @0x14, status @0x16. Evidence: `battle-fire` §2b.
  - `buildNotifyConfusionUnitInner({unitId})` (8B, sets +0x956=1) / `buildNotifyConfusionRecoveredUnitInner`
    (clears). `processCommand`: 0x40e branch → air damage → 0x428; emit 0x43d when morale hits a threshold.
- **Detail:** air damage = simplified single-pool version of 0x426. Evidence: `battle-fire` §2b/§2e/§2f.
- **Test:** `logh7-combat-engine.test.mjs` — `buildNotifyAirBattleInner` writes `showVisual` at body byte
  0x0d (assert `inner[6+0x0d]`), durability at 0x0e; `logh7-command-engine.test.mjs` — 0x40e accepts and
  emits a 0x428 to `'all'`.

### P1.5 — Turn / Reverse / Stop 0x401/0x403/0x40a (maneuver siblings)

- **Files:** `src/server/logh7-combat-engine.mjs`, `logh7-command-engine.mjs`
- **Functions:** `parseInboundTurnShip(inner)` → `{count, units:[{shipId, heading}], turnParam}` (header +
  u8 count@0x0c + `{u32 shipId, f32 heading}`×count @0x10 stride 8 + f32 @0x110). `processCommand`: 0x401 →
  `applyShipTurn` → 0x424 per unit; 0x403 (reverse) → move backward + 0x423/0x424; 0x40a (stop) → clear move
  state + echo 0x424 at current heading. Evidence: `battle-core` §4–§6.
- **Test:** `logh7-command-engine.test.mjs` — 0x401 with 2 units emits two 0x424 notifies carrying the right
  shipIds; ownership rejection path returns `reject:'not-owner'`.

### P1.6 — Destruction + morale hardening (make the 0x426 loop fully faithful)

The existing 0x426 path already encodes HP=0 on destroy and removes the ship. Harden it: emit the cumulative
`maxStat − value` encoding for ALL three pools, set `hitLoc` from the depleted section, and push
`NotifyMoraleDown 0x440` on flagship loss / sustained fire (already wired in the fight path; extend to attack).

- **Files:** `src/server/logh7-command-engine.mjs`, `logh7-combat-engine.mjs`
- **Detail:** confirm `buildNotifyAttackedShipInner` sends `0xffff` for an unchanged pool (no-change marker)
  and that a destroyed ship's 0x426 carries durability encoding HP=0 (wire value = maxHP) before
  `removeShip`. Evidence: `battle-fire` §2a/§2g.
- **Test:** `logh7-command-engine.test.mjs` — seed a near-dead target, fire, assert the emitted 0x426 decodes
  to zanki current 0 and that a follow-up fire on the removed ship auto-picks a new target (no crash).

### P1.7 — Battle teardown (exit back to strategic)

- **Files:** `src/server/logh7-battle-engine.mjs`, `logh7-command-engine.mjs`, `logh7-world-state.mjs`
- **Functions:** `closeBattleField(state)` → emits `0x42f` with mode-back (and/or `0x35a NotifyEnding` stub)
  + clears battle ships; `processCommand` calls it when one side has no living ships (`listLivingShips`
  faction count) or on an explicit retreat. `world-state.closeBattle` already exists — extend to drop
  battle-spawned ships. Evidence: `battle-core` §3 (`FUN_004c2a80` teardown).
- **Test:** `logh7-command-engine.test.mjs` — destroy the last enemy ship; assert a teardown 0x42f is emitted
  and `state.isBattleActive()` is false.

### P1.8 — Live verification (the proof)

- **File:** `tools/logh7_world_init_probe_server.mjs` + a new `tools/logh7_battle_probe.py`
- **Detail:** drive the unpatched client through world-load, trigger a battle (0xb06/0x411 path), confirm via
  the crash-catcher (`logh7_crash_catcher.py`) that pushing 0x349/0x33b/0x341/0x42f/0xf1f does NOT crash and
  the client enters tactical view (`client+0x126718` active flag). Capture the screenshot to
  `.omo/ulw-loop/evidence/`. Restore + SHA-verify the EXE after.
- **Acceptance:** client enters a controllable tactical battle, ships spawn at the seeded poses, a fire
  command produces a visible hit, zero exceptions for ≥60s.

---

# PHASE 2 — Internal affairs read model (内政 data the client renders)

These are S→C-only record dumps — no client mutation; the server is the data source. They populate the
内政/org screens and unlock the rest of the game UI. Build pure, fed from the content DB.

### P2.1 — Static master tables (send once at world-load)

- **File (new):** `src/server/logh7-info-records.mjs`
- **Functions:** `buildPowerDistributionInner` (0x309), `buildStaticUnitShipInner` (0x30b, 140B/rec, ≤200),
  `buildStaticUnitTroopInner` (0x30d, 24B, ≤16), `buildStaticFightersInner` (0x30f, 12B, ≤4),
  `buildStaticArmsInner` (0x311, fixed 27×8 u16). Fed from `content/` ship/troop/weapon master. Evidence:
  `docs/logh7-proto-info-records.md` §2.
- **Test:** `tests/server/logh7-info-records.test.mjs` — each builder hits its dispatch size; Arms is exactly
  0x1b0; a sample UnitTroop record's labeled fields (kind/offence/defence/speed) round-trip.

### P2.2 — Personnel card catalog

- **File:** `src/server/logh7-info-records.mjs`
- **Functions:** `buildStaticInformationCardInner` (0x305, 70B/rec + ≤24 u16 command list, ≤300),
  `buildStaticInformationCardCommandInner` (0x307, 196B/rec, inner ≤24 stride-8 cmds),
  `buildResponseCardCharacterInner(chars)` (0x34f) — **reuse the existing 0x0323
  `buildInformationCharacterRecordInner` per element** (724B), `[u8 count]` @0x00, ≤64. Page if >64.
  Evidence: `info-records` §1.
- **Test:** assert 0x34f with 2 chars = `4 + 2*724` body; element[0] equals a standalone 0x0323 build.

### P2.3 — Per-base economy / facilities

- **File:** `src/server/logh7-info-records.mjs`
- **Functions:** `buildInformationInstitutionInner` (0x321, nested base→facility≤36→spot≤21),
  `buildInformationWarehouseInner` (0x327, supplies/food/mineral + reserve ships/troops),
  `buildInformationPackageInner` (0x329, in-transit transfers). Send on enter-base / on change. Evidence:
  `info-records` §3–§4.
- **Test:** Warehouse builder round-trips `supplies/food/mineral` at 0x2f4/0x2f8/0x2fc and a ships[] entry.

### P2.4 — Fleet / outfit org

- **File:** `src/server/logh7-info-records.mjs`
- **Functions:** `buildInformationOutfitInner` (0x32b, 28B/rec + 10 practice levels, ≤100),
  `buildGridInformationOutfitInner` (0x32d, 12B, ≤300), `buildInformationOutfitPartyInner` (0x32f, nested
  manifest: characters≤10/ships≤60/troops≤24/packages), `buildOutfitInformationUnitInner` (0x331, 88B, ≤70).
  Re-emit after Reorganization/Supplement/Assignment/SupplyFleet/CreateOutfit. Evidence: `info-records` §5.
- **Test:** OutfitParty streaming builder reproduces a manifest with 2 chars + 3 ships + supplies/max_supplies.

---

# PHASE 3 — Personnel + strategy mutations

C→S commands that mutate roster/outfit/plan, each validated then broadcast.

### P3.1 — Card appointment / dismiss / resign (highest playability)

- **Files (new):** `src/server/logh7-personnel-engine.mjs`; **edit** `logh7-command-engine.mjs`,
  `logh7-world-state.mjs` (add outfit seat tables).
- **Functions:** `parseCardAppointment(inner)` → `{targetOutfit@0x10, cardCharacter@0x18, seatRole@0x1c,
  chiefSpot@0x20}`; `state.appointCard(outfitId, {cardCharacter, seatRole}, chiefSpot)` (append to seat
  list ≤16, mirror `FUN_004c5580`); broadcast 0x358 (+0x356 for the moved char). `parseCardDismissal`/
  `parseCardResignation` → remove from seat → `buildNotifyCardLossInner` (0x70a: owner, silent, u16 cardId)
  + 0x70b if the spot moves. Evidence: `personnel-strategy` §2.4–§2.8.
- **Test:** `tests/server/logh7-personnel-engine.test.mjs` — appoint then dismiss; assert the seat list
  grows then shrinks and a 0x70a is emitted carrying the right card id.

### P3.2 — Rank up/down + create outfit

- **File:** `src/server/logh7-personnel-engine.mjs`
- **Functions:** `parseRankUp/RankDown/SpeciallyRankUp` (rank ladder 1..14, achievement debits);
  `parseCreateOutfit(inner)` → `{mode@0x08, base@0x11, kind@0x15, ships[≤99]{u16 kind,u8 unit_number,i16
  boat_number}, troops[≤24], max_troop, max_crew, power/camp/index, 10 practice_*}`; allocate outfit id →
  0x904 begin + 0x905 end + 0x358. Note signed i16 for boat/unit numbers. Evidence: `personnel-strategy`
  §2.1–§2.3, §3.4.
- **Test:** CreateOutfit parse round-trips a 2-ship/1-troop body incl. the 10 practice bytes and signed
  boat_number; rank up debits achievement and emits 0x356 + 0x43a.

### P3.3 — Char-info notify builders

- **File:** `src/server/logh7-login-protocol.mjs`
- **Functions:** `buildNotifyInformationCharacterInner` (0x356 — reuse the 0x0323 body, code-swap),
  `buildNotifyChangeFlagShipInner` (0x358, 92B outfit-state), `buildNotifyCharacterAchievementInner` /
  `buildNotifyOutfitAchievementInner` (0x43a/0x43b, 12B `{id, achievement, delta}`). Evidence:
  `personnel-strategy` §4.
- **Test:** 0x356 body equals a 0x0323 build with the code field swapped; 0x43a is 12B with the id @0x00.

---

# PHASE 4 — Strategic map + logistics + institutions

Every C→S command is **echoed** (ACKs the modal dialog FSM) + a broadcast notify. Order by proven layout.

### P4.1 — SupplyFuel / Search (high-value, proven applies)

- **Files (new):** `src/server/logh7-strategic-engine.mjs`; **edit** `logh7-command-engine.mjs`.
- **Functions:** `parseSupplyFuel` (`{targetUnitId@8, fuelA@0x10, fuelB@0x14}`) → echo 0xb02 + broadcast
  `buildNotifySuppliedFuelInner` (0x240, `{srcId, u8 count, {u32 unitId,u32 fuelAfter}[≤70]}`). `parseSearch`
  → compute revealed cells → `buildNotifySearchInner` (0xa9c, `{searcherId, u8 cellCount≤225, {u16 cell,
  u8 enemyCount≤2, {u8 facA,u8 facB,u16 unitId}}}`). Evidence: `strategic-logistics` A.2/A.3/A.9/A.10.
- **Test:** `tests/server/logh7-strategic-engine.test.mjs` — SuppliedFuel builder writes 70-slot array padded
  to 0x240; Search builder encodes a 1-cell/1-enemy scan and decodes back.

### P4.2 — Load/Unload troop + Reorganization + CarryingInOut (proven Input parsers)

- **File:** `src/server/logh7-strategic-engine.mjs`
- **Functions:** `parseLoadTroop`/`parseUnloadTroop` (36B: `{baseOrFleetId@8, targetId@0xc, spot@0x10, u8
  count@0x14≤3, u32 troopIds@0x18}`); `parseReorganization` (784B: move_ships≤99 stride6 + move_troops≤24);
  `parseCarryingInOut` (256B: otherPackages≤3 + troopPackages≤24 stride8). Echo each + emit the Begin/End
  notifies. Evidence: `strategic-logistics` A.4/B.1/B.2.
- **Test:** Reorganization parse round-trips a 2-ship move list with the stride-6 `{shipId, destSlot, param}`.

### P4.3 — MoveBase / MovedBase + LeaveOutGrid + institutions

- **File:** `src/server/logh7-strategic-engine.mjs`
- **Functions:** `buildNotifyMovedBaseInner` (0x44: `{baseId@8, u16@0xc, newX@0x10, newY@0x14, u8
  charCount≤10, u32 charIds@0x1c}`), `buildNotifyLeaveOutGridInner` (0x11c: `{u8 count≤70, u32 ids@4}`),
  `parseMoveInstitutionSpot` (0xe00, echo with new x/y). Evidence: `strategic-logistics` A.6/A.8/C.1.
- **Test:** MovedBase builder round-trips newX/newY + a char id; LeaveOutGrid is 0x11c with count@0.

---

# PHASE 5 — Simple-info delta sync + social/account

### P5.1 — Simple-info 0x12xx pump (the unified state-sync channel)

- **File (new):** `src/server/logh7-simple-info.mjs`
- **Functions:** `pushSimpleInfoSync(emit, deltas)` → emits `0x1200` then one or more
  `NotifySimpleInformation*` (each `[u8 count][pad][record×count]`, stride per master §1, split at the safe
  per-message count = min(per-msg max, buffer max)) then `0x1201`. Start with Character (0x1202, 288B), Base
  (0x1204, 36B), Unit (0x1207, 8B), Card (0x1208, 12B). Headers: 4B except 2B for 0x1207/0x1208/0x120b/0x120d
  and 1B for 0x1209. Evidence: `social-account` §2.
- **Test:** `tests/server/logh7-simple-info.test.mjs` — a 250-record Character set splits into ≥2 0x1202
  messages each ≤200 records inside one Begin/End; each record stride is 288B.

### P5.2 — Chat siblings + settings

- **File:** `src/server/logh7-login-protocol.mjs`, `logh7-command-engine.mjs`
- **Functions:** `buildCommandSpotChatInner` (0xf1d, msgLen@8/msg@10) + `buildCommandSpotUnicastChatInner`
  (0xf1e, targetId@8/msgLen@0xc/msg@0xe); `processCommand` 0xf1d → broadcast to same-spot, 0xf1e → unicast to
  targetId. Settings 0xf16–0xf1b parsers (small writes; persist on character). Evidence: `social-account` §3/§4.
- **Test:** Unicast builder places the target id @8 and shifts msgLen to 0xc; 0xf1d relay excludes the sender.

### P5.3 — Account / character entry + mail (lowest priority, stub first)

- **File:** `src/server/logh7-login-protocol.mjs`, `logh7-command-engine.mjs`
- **Functions:** `buildResponseInformationAccountInner` (0x1001, 448B), `buildResponseCharacterEntryStateInner`
  (0x1005, 32B), `buildResponseUnChargeCharacterInner` (0x1003, 4004B roster). Mail 0xf05/0xf07 + send/read/
  delete — **stub with count-0 records first** to satisfy the world-load sequence, fill incrementally.
  Evidence: `social-account` §5/§6.
- **Test:** account/entry-state builders hit their dispatch sizes; empty mail roster is a valid 0-count body.

---

## Cross-cutting acceptance gate (every phase)

1. `npm test` (or the server test runner) green — new builders/parsers each have a round-trip test.
2. New builders hit their dispatch size (the client allocates that buffer; oversize/undersize → throw).
3. Array counts clamped to caps; oversize input rejected, not truncated silently into the client.
4. For S→C builders touched by a live path: a probe run (Phase-1 style) shows the unpatched client (SHA
   `2848be76…`) consumes the message with zero exceptions, EXE restored + SHA-verified after.

## New modules to create (summary)

- `src/server/logh7-battle-engine.mjs` — battle FSM + setup-table orchestration (P1.2/P1.3/P1.7)
- `src/server/logh7-info-records.mjs` — internal-affairs read-model builders (P2)
- `src/server/logh7-personnel-engine.mjs` — roster/seat/plan mutations (P3)
- `src/server/logh7-strategic-engine.mjs` — strategic/logistics/institution ops (P4)
- `src/server/logh7-simple-info.mjs` — 0x12xx delta sync pump (P5.1)
