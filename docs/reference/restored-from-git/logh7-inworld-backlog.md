# LOGH VII — In-World Implementation Backlog (consolidated RE, 2026-06-15)

Consolidated from four parallel RE sweeps + live frida/decode verification this session. Full raw
outputs:
- galaxy-marker-re (markers): `docs/logh7-strategic-map-wire.md` PART II
- playable-systems-re (game systems): workflow `wynnbmo3k` result
- entity-catalog-re (entities): workflow `wnrxbvo0h` result
- encoding-re (KO text) + nodata-re (NO DATA): agent reports

## ★ ROOT CAUSE (one sentence)
The world LOADS but is EMPTY because the **world-init walk answers most 03xx info/strategic codes with
the generic ZERO-FILLED walker** (`buildWorldDataResponseInner`, size-correct but count=0), and the one
real grid that IS sent (0x0313/0x0315 at 0x0f02) **never reaches the client LIVE tables** (snapshot
promotion fails). Real builders exist for almost everything but are unwired or lost.

## ★ LIVE-VERIFIED FACTS THIS SESSION (corrections to prior assumptions)
- **World entry works** (strategic map loads live; full 8-step walk fires).
- **Roster JSON is NOT ground truth.** `content/roster/*` and merged character lists are provisional
  working data, partly AI-assisted/incomplete. Use them only as seeds for exercising UI/protocol
  mechanisms. Promote content to "original" only when backed by shipped assets, client binary readers,
  official/manual evidence, live memory layout, or TCP field evidence.
- **Markers: server is CORRECT, client drops it.** `buildStrategicGalaxyGrid` emits 81 class-3 objects
  (80 systems value 4..83 + fleet) + 81 cells, padded to fixed 5004B (`SS_RESP_STATIC_GRID_BYTES=0x138c`)
  — decoded & verified. Live frida (clientBase=0x12cc3020, module@0x400000, no ASLR): LIVE object table
  has only **1** class-3 (v=4), LIVE cells = 27 scattered non-server values, `snapshotGuard 0x2c03c0=1`.
  → marker failure = **client snapshot promotion** (`FUN_004c2a30→FUN_004c5350` run-once), NOT server.
  Exact ordering fix pending marker-path-re follow-up.
- **KO text codepage is ALREADY 949** (frida read live menufix.exe): `DAT_03350674=949`,
  `__mb_cur_max=2`, dbcs_flag≠0, patch site 0x5fffbe already = patchedHex. The cp932-wall is FIXED in
  `korean.menufix.exe`. Remaining KO garbling ("1극깑긞긤" 광역권명) = **specific untranslated client
  data records** (constmsg/galaxy.mdx still JP, read at cp949 → mojibake) because world-init 0x031d is
  zero-filled so on-screen names come from CLIENT data, not the wire. Fix = wire real 0x031d (KO) OR
  finish constmsg KO coverage (3166/3199 → 33 untranslated).
- **Ability NO DATA: FIXED this session** — world-init 0x0323 now seeds abilities via
  `resolveCreatedAbilities` (login-session.mjs ~470). Server tests pass.
- **Marker labels** = constmsg group 0x18 (byte0 1-byte index, client .dat) → KO-overlayable; current
  byte0 = `index&0xff` placeholder (wrong labels even once markers render).

## ★ MASTER ENTITY CATALOG (status)
Totals: **5 missing, 11 stub, ~16 partial, 1 full.** Only the tactical space-battle plane (0x033b ship
state) is mature; strategic / territory-economy / meta-world are stub-or-missing.

CHARACTERS: Officer/Character 0x0323 **partial (5/47 fields)**; Account 0x1001 partial; rosters partial;
Rank/Title **missing**; Duty/Post **missing**; Lottery pool stub; Medal/decoration **missing**; special_ability missing.
MILITARY: Tactical ship state 0x033b **full**; ship-class 0x030b partial; strategic fleet 0x0325 **stub (8/52804B)**;
shields/beams partial; corps/outfit/weapon/troop/obstacle stub-or-partial; markers 0x0313/0x0315 partial (placeholder labels).
TERRITORY: StarSystem 0x031d builder **UNWIRED**; Planet economy **missing** (planet-economy.json orphaned);
Fortress stub; DynamicBase 0x031f **missing**; Institution stub; Warehouse/Package stub (unwired).
META: Nation stub; Scenario/Session **missing**; Calendar/Time stub (const); Messages partial; Medal stub;
Diplomacy **missing**; Org/House partial; Treasury partial; Ranking stub; Mail **missing**.

## ★ CRITICAL PATH TO A MINIMALLY PLAYABLE LOOP (move → battle → fight → manage base)
Only **2 NET-NEW** server handlers strictly required; rest = wiring + 1 timing fix + live verify.
- STEP 0 — live-verify S1 (0x0b01→0x0b07) + T1 (0x0411→0x42f) round-trip (two-client/frida).
- STEP 1 — **fix grid-enter placement timing** (login-session:522-549) so `FUN_004c2a80(1)` fires
  reliably (client mode *(this+0x126711)==2). **#1 cross-cutting blocker; gates ALL strategic clicks.**
  (Intertwined with the marker snapshot promotion — same in-world-placement frontier.)
- STEP 2 — byte-confirm parseInboundMoveGrid offsets (command-engine.mjs:183) via live 0x0b01 capture.
- STEP 3 — verify battle entry T1 spawn poses render.
- STEP 4 — verify one player-fire round-trip (0x0405/0x0406); combat else live via NPC.
- STEP 5 — ✅ **DONE (5f14cbc)**: battle conclusion (elimination detect → casualty tally → result →
  mode-switch back to strategic, 0x042f modeKind=2). battle-engine concludeBattle/tallyCasualties/
  closeBattleField + command-engine resolveBattleConclusion wired into fire(0x405/0x406)+fight(0x407).
- STEP 6 — ✅ **DONE in main**: economy 0x031e→ResponseInformationBase handler exists
  (login-session.mjs:1382, LOGH_BASE_ECONOMY gate) with builder from galaxy.json + planet-economy.json.

## ★ TIER A BACKLOG — blocks playability
**STATUS RE-AUDIT (2026-06-19)**: the parallel worktree workflow branched from the *session-start*
commit (69 commits behind main), so it re-derived items main had *already* implemented over the
session. After auditing current main, most of TIER A is **DONE**; only A7 + STEP5 were genuine gaps
(now integrated). A0/A5 (client-side marker/snapshot path) remain the real frontier.

| # | Add | File | Status |
|---|---|---|---|
| A1 | Strategic fleet record full 0x58 element | login-protocol.mjs buildInformationUnitRecordInner | ✅ main has the `fleets` param + full 0x58 element (id/boats/commander/supply). |
| A2 | Fleet entity in world-state | world-state.mjs | ✅ main has upsertFleet/listFleets/getFleet/moveFleet/removeFleet. |
| A3 | Planet economy builder + loader | base-economy.mjs + 0x031e handler | ✅ economy loaded via base-economy.mjs + 0x031e handler (login-session.mjs:1382). |
| A4 | Wire real 0x031d StaticInformationBase | login-session.mjs (0x031c handler) | ✅ main answers 0x031c→0x031d via buildStaticInformationBaseInner (login-session.mjs:1370). |
| A5 | Marker real labels + extra marker types | login-protocol.mjs buildStrategicGalaxyGrid | ⬜ byte0 → real constmsg group-0x18 index; add fortress/black-hole/NPC-fleet markers. Coupled to A0. |
| A6 | Char record runtime fields | login-session.mjs → login-protocol.mjs | ✅ main passes power/rank/spot/spotOwner (login-session.mjs:789-796). |
| A7 | Scenario/Session world-state | world-state.mjs | ✅ **DONE (eef8a57)**: setScenarioInfo/getScenarioInfo/advanceTurn/setEnding + snapshot + loader wiring. |
| A8 | factionSummary.totalPopulation | world-state.mjs | ✅ main has totalPopulation in factionSummary (world-state.mjs:384). |
| A0 | **Marker snapshot promotion fix** | login-session.mjs world-init (client-side patch) | ⬜ pending marker-path-re; gates A5 + all strategic clicks (with STEP 1). THE remaining frontier. |
| FR | **Fleet-render: stop poking fleetValue/fleetCell in object table** | login-protocol.mjs buildStrategicGalaxyGrid | ⬜ fleet must render via 0x0325 unit-entity path, NOT object-table byte1=3 (mis-renders as system dot). docs/logh7-fleet-render-re.md. NEXT. |

## ★ TIER B BACKLOG — enriches (canon completeness)
Rank/Title table (14-level faction-split, write rank@0xd6+titlename@0xd8) · Duty/Post seats (card[16]@0x250) ·
0x031f DynamicBase (~30 econ/defense fields, size 0x604) · Fortress real entity (6; Thor Hammer cannon) ·
ability experience half (login-protocol.mjs:232) · complete ship-stats (11 of 74 unstatted) · Outfit/Fleet
aggregate · ground-troop roster · Institution real facilities · wire Warehouse 0x0327/Package 0x0329 ·
Medal/decoration_bits[16]@0x6c (m_f### pool) · Diplomacy · Mail/Messenger · authoritative time-tick (S5).

## ★ CROSS-CUTTING BLOCKERS
1. **Grid-enter placement / marker snapshot** — gates ALL strategic clickability (markers, S1/S2/S6). #1.
2. **NO DATA panels** — generic walker zero-fills 0x031f/0x031d/0x1001/0x0337 → blank. Fix = real builders.
3. **KO text** — codepage already 949 (DONE); remaining = specific untranslated constmsg/galaxy.mdx
   records + wire real 0x031d. (S3 strategic menu mislabel = constmsg group-101 data, not server.)
4. **Two-client live capture absent** (auth-server.mjs:452) — ~25 systems stuck "unverified".
5. **No authoritative tick (S5)** — strategic orders never resolve over time.
