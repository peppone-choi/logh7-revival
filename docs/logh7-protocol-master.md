# LOGH VII — Consolidated in-world protocol master reference

Single source of truth for the **in-world** (post-world-load) wire protocol of `G7MTClient.exe`,
synthesised from the 8 family RE passes (see the per-family docs linked below). Use this as the index;
drill into a family doc for byte-exact layouts and Ghidra evidence.

**Framing (verified G172).** Client→server inner = `[u16 BE code][body]`. Server→client conn3 =
message32 `[u32 0][u16 BE code][body]`. **All bodies are little-endian**; only the 2-byte inner code
prefix is big-endian. Floats are IEEE-754 LE. "size" = the dispatch-declared receive-buffer size
(`FUN_004b8b00` `*param_4`); the **wire** length of array messages is `header + count*stride` (packed,
NOT zero-padded to the dispatch size) — see each family doc's "dispatch size ≠ wire size" note.

**Coordinate space.** Continuous world floats, XZ ground plane, Y vertical (≈0 in the 2D battle plane).
`heading` = Y-yaw radians. Same space across `NotifyMovedShip 0x423`, `NotifyChangeMode 0x42f`
participant poses, `ResponsePositionUnit 0x349`, and the tactics data layer.

Status legend: **done** = builder/parser + engine + tests committed; **spec'd** = byte layout pinned in
a family doc, not yet coded; **todo** = code/size confirmed, body layout inferred (needs capture).

---

## 1. Master code table (~167 codes)

### Session / lobby / time (handshake — mostly done)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0x201 | SSLoginOK | S→C | 0x102 | done | login-protocol |
| 0x202 | SSLoginNG | S→C | — | done | login-protocol |
| 0x204 | SSCharacterIDResponce | S→C | — | done | login-protocol |
| 0x206 | SSGameLoginOK | S→C | 1 | done | login-protocol |
| 0x207 | GlobalChat | bidir | 0x108 | spec'd | social-account |
| 0x2000–0x200b | Lobby* | bidir | — | done | login-protocol |
| 0x7001 | LGLoginOK | S→C | — | done | login-protocol |
| 0x7002 | LGLoginNG | S→C | — | done | login-protocol |
| 0x301 | ResponseTime | S→C | — | done | login-protocol |

### Static / read-model info records (internal-affairs data — §4)

> Live-client note (2026-06-17): `0x305/0x307` below are static read-model candidates. The active
> conn3 world-login `0x0304->0x0305` / `0x0306->0x0307` bodies observed by `FUN_004ba2b0` are
> InformationSession/InformationCharacter-style data, not the duty-card command table. Do not bind
> the static builders to that walker path without fresh runtime evidence.

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0x305 | ResponseStaticInformationCard | S→C | 0x520a | spec'd | info-records |
| 0x307 | ResponseStaticInformationCardCommand | S→C | 0xe5b2 | spec'd | info-records |
| 0x309 | ResponseStaticInformationPowerDistribution | S→C | 0x55c | spec'd | info-records |
| 0x30b | ResponseStaticInformationUnitShip | S→C | 0x6d64 | spec'd | info-records |
| 0x30d | ResponseStaticInformationUnitTroop | S→C | 0x184 | spec'd | info-records |
| 0x30f | ResponseStaticInformationFighters | S→C | 0x34 | spec'd | info-records |
| 0x311 | ResponseStaticInformationArms | S→C | 0x1b0 | spec'd | info-records |
| 0x313 | ResponseStaticInformationGridType | S→C | 0x138c | done | strategic-map-wire |
| 0x315 | ResponseStaticInformationGrid | S→C | 0x138c | done | strategic-map-wire |
| 0x31d | ResponseStaticInformationBase | S→C | 0x520c | spec'd | info-records-wire |
| 0x31f | ResponseInformationSystem | S→C | 0x604 | done | info-records-wire |
| 0x321 | ResponseInformationInstitution | S→C | 0x8de4 | spec'd | info-records |
| 0x323 | ResponseInformationCharacter | S→C | 0x2d4 (724B) | done | info-records-wire |
| 0x325 | ResponseInformationUnit | S→C | 0xce44 | done | login-protocol |
| 0x327 | ResponseInformationWarehouse | S→C | 0x300 | spec'd | info-records |
| 0x329 | ResponseInformationPackage | S→C | 0x154 | spec'd | info-records |
| 0x32b | ResponseInformationOutfit | S→C | 0xaf4 | spec'd | info-records |
| 0x32d | ResponseGridInformationOutfit | S→C | 0xe14 | spec'd | info-records |
| 0x32f | ResponseInformationOutfitParty | S→C | 0x8b04 | spec'd | info-records |
| 0x331 | ResponseOutfitInformationUnit | S→C | 0x1814 | spec'd | info-records |

### Tactics battle-setup data (space-war read model — §3)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0x337 | ResponseTacticsCharacter | S→C | 0x964 | spec'd | tactics-data |
| 0x33b | ResponseTacticsInformationUnitShip | S→C | 0x79e4 | spec'd | tactics-data |
| 0x33f | ResponseTacticsInformationCorps | S→C | 0x8ca4 | spec'd | tactics-data |
| 0x341 | ResponseTacticsInformationFillShield | S→C | 0x5dc4 | spec'd | tactics-data |
| 0x343 | ResponseTacticsInformationFillBeamGun | S→C | 0x2ee4 | spec'd | tactics-data |
| 0x345 | ResponseTacticsInformationBase | S→C | 0x204 | spec'd | tactics-data |
| 0x347 | InformationObstacle | S→C | 0x1d8 | spec'd | tactics-data |
| 0x349 | ResponsePositionUnit | S→C | 0x2ee4 | spec'd | tactics-data |
| 0x34b | ResponsePositionBase | S→C | 0x44 | spec'd | tactics-data |
| 0x34f | ResponseCardCharacter | S→C | 0xb504 | spec'd | info-records |
| 0x356 | NotifyInformationCharacter | S→C | 0x2d8 | spec'd | personnel-strategy |
| 0x358 | NotifyChangeFlagShip | S→C | 0x5c | spec'd | personnel-strategy |
| 0x359 | NotifyInformationOutfit | S→C | 0x1c | spec'd | personnel-strategy |
| 0x35a | NotifyEnding | S→C | 0x434 | spec'd | personnel-strategy |

### Battle commands (C→S — §2 SPACE WAR)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0x400 | CommandMoveShip | C→S | 0x41c | done | moveship-wire |
| 0x401 | CommandTurnShip | C→S | 0x114 | spec'd | battle-core |
| 0x402 | CommandParallelMoveShip | C→S | 0x41c | done | moveship-wire |
| 0x403 | CommandReverseShip | C→S | 0x114 | spec'd | battle-core |
| 0x404 | CommandWarpShip | C→S | 0x90 | done (placeholder) | battle-core |
| 0x405 | CommandAttackShip | C→S | 0x98 | done | battle-fire |
| 0x406 | CommandShootShip | C→S | 0x98 | done | battle-fire |
| 0x407 | CommandFight | C→S | 0x24 | done | battle-fire |
| 0x408 | CommandSuggestion | C→S | 0x18 | todo | battle-fleetops |
| 0x409 | CommandEncourageFlagship | C→S | 0x10 | todo | battle-fleetops |
| 0x40a | CommandStop | C→S | 0x114 | spec'd | battle-core |
| 0x40b | CommandAdmission | C→S | 0x94 | spec'd | battle-fleetops |
| 0x40c | CommandControl | C→S | 0x20 | spec'd | battle-fleetops |
| 0x40d | CommandFileFleet | C→S | 0x294 | spec'd | battle-fleetops |
| 0x40e | CommandAirBattle | C→S | 0x98 | spec'd | battle-fire |
| 0x40f | CommandSortieTroops | C→S | 0x94 | spec'd | battle-fleetops |
| 0x410 | CommandEvacuateTroops | C→S | 0x90 | spec'd | battle-fleetops |
| 0x411 | CommandChangeMode | C→S | 0x98 | done | battle-core |
| 0x412 | CommandSortie | C→S | 0x90 | spec'd | battle-fleetops |
| 0x413 | CommandRepairFleet | C→S | 0x14 | spec'd | battle-fleetops |
| 0x414 | CommandSupplyFleet | C→S | 0x14 | spec'd | battle-fleetops |
| 0x419 | CommandShootFortress | C→S | 0x14 | spec'd | battle-fleetops |
| 0x41a | CommandAdmissionBase | C→S | 0x94 | spec'd | battle-fleetops |
| 0x41b | CommandRepairBase | C→S | 0x94 | spec'd | battle-fleetops |
| 0x41c | CommandSupplyBase | C→S | 0x94 | spec'd | battle-fleetops |
| 0x41d | CommandEncourageBase | C→S | 0x10 | todo | battle-fleetops |
| 0x41e | CommandStopBase | C→S | 0x10 | todo | battle-fleetops |
| 0x41f | CommandMoveFortress | C→S | 0x1a4 | spec'd | battle-fleetops |
| 0x420 | CommandChangeAuthority | C→S | 0x94 | spec'd | battle-fleetops |
| 0x421 | CommandMission | C→S | 0x98 | spec'd | battle-fleetops |
| 0x422 | CommandEmergencySupply | C→S | 0x14 | todo | battle-fleetops |

### Battle notifies (S→C — §2 SPACE WAR)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0x423 | NotifyMovedShip | S→C | 0x1c | done | moveship-wire |
| 0x424 | NotifyTurnedShip | S→C | 0xc | done | moveship-wire |
| 0x425 | NotifyWarpedShip | S→C | 0x90 | spec'd | battle-core |
| 0x426 | NotifyAttackedShip | S→C | 0x1c | done | battle-fire |
| 0x427 | NotifyFought | S→C | 0x10 | done | battle-fire |
| 0x428 | NotifyAirBattle | S→C | 0x18 | spec'd | battle-fire |
| 0x429 | NotifyMovedTroop | S→C | 0x14 | spec'd | battle-fleetops |
| 0x42a | NotifyLandCombat | S→C | 0xc | spec'd | battle-fleetops |
| 0x42c | NotifyEncourageFlagship | S→C | 0xfc | spec'd | battle-fleetops |
| 0x42d | NotifyRepairFleet | S→C | 0x10 | spec'd | battle-fleetops |
| 0x42e | NotifySupplyFleet | S→C | 0x10 | spec'd | battle-fleetops |
| 0x42f | NotifyChangeMode | S→C | 0x298 | done | battle-core |
| 0x431 | NotifyTacticsChiefCommander | S→C | 8 | spec'd | tactics-data |
| 0x432 | NotifyEncourageBase | S→C | 0xfc | todo | battle-fleetops |
| 0x434 | NotifySupplyBase | S→C | 0x10 | todo | battle-fleetops |
| 0x435 | NotifyMovedFortress | S→C | 0x14 | spec'd | battle-fleetops |
| 0x436 | NotifyShootFortress | S→C | 0x8c | spec'd | battle-fleetops |
| 0x437 | NotifySortie | S→C | 0x1c | spec'd | battle-fleetops |
| 0x438 | NotifyEmergencySupplyBase | S→C | 0x10 | spec'd | battle-fleetops |
| 0x439 | NotifyChangedAuthority | S→C | 0x88 | spec'd | battle-fleetops |
| 0x43a | NotifyCharacterAchievement | S→C | 0xc | spec'd | personnel-strategy |
| 0x43b | NotifyOutfitAchievement | S→C | 0xc | spec'd | personnel-strategy |
| 0x43c | NotifyMissionResult | S→C | 0x10 | spec'd | battle-fleetops |
| 0x43d | NotifyConfusionUnit | S→C | 8 | spec'd | battle-fire |
| 0x43e | NotifyConfusionRecoveredUnit | S→C | 8 | spec'd | battle-fire |
| 0x43f | NotifyShootBase | S→C | 0x10 | todo | battle-fleetops |
| 0x440 | NotifyMoraleDown | S→C | 0xc | done | battle-fire |
| 0x441 | NotifyBlackHoleSuction | S→C | 4 | todo | tactics-data |
| 0x442 | NotifyFinishOccupation | S→C | 8 | spec'd | battle-fleetops |
| 0x500 | NotifyInvalidMessage | S→C | — | todo | — |
| 0x501 | NotifyError | S→C | — | todo | — |

### Personnel / cards (§5)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0x704 | CommandRankUp | C→S | 0xa0 | spec'd | personnel-strategy |
| 0x705 | CommandSpeciallyRankUp | C→S | 0x3f28 | spec'd | personnel-strategy |
| 0x706 | CommandRankDown | C→S | 0xa8 | spec'd | personnel-strategy |
| 0x707 | CommandCardAppointment | C→S | 0x28 | spec'd | personnel-strategy |
| 0x708 | CommandCardDismisal | C→S | 0xa0 | spec'd | personnel-strategy |
| 0x709 | CommandCardResignation | C→S | 0x9c | spec'd | personnel-strategy |
| 0x70a | NotifyCardLoss | S→C | 0xc | spec'd | personnel-strategy |
| 0x70b | NotifyCardLossMovedSpot | S→C | 0x10 | spec'd | personnel-strategy |

### Strategy / outfits (§5)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0x900 | CommandMakePlan | C→S | 0x1c | todo | personnel-strategy |
| 0x901 | CommandWithdrawalPlan | C→S | 0x18 | todo | personnel-strategy |
| 0x902 | CommandAnnouncement | C→S | 0x28 | todo | personnel-strategy |
| 0x903 | CommandCreateOutfit | C→S | 0x324 | spec'd | personnel-strategy |
| 0x904 | NotifyCreateOutfitBegin | S→C | 4 | spec'd | personnel-strategy |
| 0x905 | NotifyCreateOutfitEnd | S→C | 0x8c | spec'd | personnel-strategy |
| 0x906 | CommandDeleteOutfit | C→S | 0x2b94 | todo | personnel-strategy |
| 0x908 | NotifyFinishStrategyPlan | S→C | 0xc | spec'd | personnel-strategy |

### Strategic map ops (§6)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0xb00 | CommandMoveBase | C→S | 0x20 | todo | strategic-logistics |
| 0xb01 | CommandMoveGrid | C→S | 0x24 | done | strategic-input-wire |
| 0xb02 | CommandSupplyFuel | C→S | 0x18 | spec'd | strategic-logistics |
| 0xb03 | CommandSearch | C→S | 0x14 | todo | strategic-logistics |
| 0xb04 | CommandUnloadTroop | C→S | 0x24 | spec'd | strategic-logistics |
| 0xb05 | CommandLoadTroop | C→S | 0x24 | spec'd | strategic-logistics |
| 0xb06 | CommandSwitchMode | C→S | 0x164 | spec'd | strategic-logistics / battle-core |
| 0xb07 | NotifyMovedGrid | S→C | 0x244 | done | strategic-input-wire |
| 0xb08 | NotifyLeaveOutGrid | S→C | 0x11c | spec'd | strategic-logistics |
| 0xb09 | NotifyEnterGridBegin | S→C | 1 | done | strategic-input-wire |
| 0xb0a | NotifyEnterGridEnd | S→C | 1 | done | strategic-input-wire |
| 0xb0b | NotifyMovedBase | S→C | 0x44 | spec'd | strategic-logistics |
| 0xb0c | NotifySuppliedFuel | S→C | 0x240 | spec'd | strategic-logistics |
| 0xb0d | NotifySearch | S→C | 0xa9c | spec'd | strategic-logistics |

### Logistics / organization (§6)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0xc00 | CommandCompletenessRepair | C→S | 0x35c | todo | strategic-logistics |
| 0xc01 | CommandCompletenessSupply | C→S | 0x324 | todo | strategic-logistics |
| 0xc02 | CommandReorganization | C→S | 0x310 | spec'd | strategic-logistics |
| 0xc05 | CommandSupplement | C→S | 0x9e5c | todo | strategic-logistics |
| 0xc08 | CommandCarryingInOut | C→S | 0x100 | spec'd | strategic-logistics |
| 0xc0b | CommandAssignment | C→S | 0x8dc | todo | strategic-logistics |
| 0xc0c | CommandCarryingOut | C→S | 0x20 | todo | strategic-logistics |

### Institutions (§6)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0xe00 | CommandMoveInstitutionSpot | C→S | 0x18 | spec'd | strategic-logistics |
| 0xe01–0xe0b | CommandInstitutionBuild/Destroy/Pause/… | C→S | — | todo | strategic-logistics |

### World init (done)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0xf00 | RequestWorldInitialize | C→S | — | done | server-setup |
| 0xf01 | ResponseWorldInitialize | S→C | — | done | server-setup |
| 0xf02 | RequestGridInitialize | C→S | — | done | multiplayer-roadmap |
| 0xf03 | ResponseGridInitialize | S→C | — | done | multiplayer-roadmap |

### Mail / messenger / social / settings (§7)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0xf05 | ResponseInformationMailAddress | S→C | 0x7214 | todo | social-account |
| 0xf07 | ResponseInformationMessengerStatus | S→C | 0x74cc | todo | social-account |
| 0xf08/0xf09/0xf0a | TransactionInformationMail* | S→C | — | todo | social-account |
| 0xf0b | CommandExchangeMailAddress | C→S | 0x24c | todo | social-account |
| 0xf0c | CommandDeleteMailAddress | C→S | 0x124 | todo | social-account |
| 0xf0d | CommandMessengerStatus | C→S | 0x128 | todo | social-account |
| 0xf0e | CommandMessengerConnection | C→S | 0x250 | todo | social-account |
| 0xf0f | CommandMessenger | C→S | 0x52c | todo | social-account |
| 0xf10 | CommandSendMail | C→S | 0x75c | todo | social-account |
| 0xf11 | CommandReadMail | C→S | 0x12c | todo | social-account |
| 0xf12 | CommandDeleteMail | C→S | 0x12c | todo | social-account |
| 0xf13 | CommandOrderSuggestMail | C→S | 0x264 | todo | social-account |
| 0xf14 | CommandReplyOrderSuggestMail | C→S | 0x25c | todo | social-account |
| 0xf15 | NotifyCommandMail | S→C | 0x25c | todo | social-account |
| 0xf16 | CommandSetTogether | C→S | 0xc | spec'd | social-account |
| 0xf17 | CommandSetWillMessage | C→S | 0x8c | todo | social-account |
| 0xf18 | CommandSetOfflineDirection | C→S | 0x10 | spec'd | social-account |
| 0xf19 | CommandSetUnitDistributePriority | C→S | 0x10 | spec'd | social-account |
| 0xf1a | CommandSetReturnBase | C→S | 0xc | spec'd | social-account |
| 0xf1b | CommandSetPrivateAccountRate | C→S | 0xc | spec'd | social-account |
| 0xf1c | CommandGridChat | bidir | 0x8c | done | social-account |
| 0xf1d | CommandSpotChat | bidir | 0x8c | spec'd | social-account |
| 0xf1e | CommandSpotUnicastChat | bidir | 0x90 | spec'd | social-account |
| 0xf1f | NotifyTactics | S→C | 8 | spec'd | tactics-data |

### Account / character (§7)

| Code | Class | Dir | Size | Status | Doc |
|---|---|---|---|---|---|
| 0x1001 | ResponseInformationAccount | S→C | 0x1c0 | todo | social-account |
| 0x1003 | ResponseUnChargeCharacter | S→C | 0xfa4 | todo | social-account |
| 0x1005 | ResponseCharacterEntryState | S→C | 0x20 | todo | social-account |
| 0x1006 | CommandOriginalCharacterCharge | C→S | 0x18 | done | character-creation-wire |
| 0x1007 | CommandExtensionCharacterCharge | C→S | 8 | done | character-creation-wire |
| 0x1008 | CommandGenerateCharacterCharge | C→S | 0x80 | done | character-creation-wire |

### Simple-info delta broadcast (state sync — §8)

| Code | Class | Dir | Size | Hdr | Stride | Status | Doc |
|---|---|---|---|---|---|---|---|
| 0x1200 | TransactionSimpleDataBegin | S→C | 0x24 | — | — | spec'd | social-account |
| 0x1201 | TransactionSimpleDataEnd | S→C | 1 | — | — | spec'd | social-account |
| 0x1202 | NotifySimpleInformationCharacter | S→C | 0xe104 | 4 | 288 | spec'd | social-account |
| 0x1203 | NotifySimpleInformationOutfit | S→C | 0x2264 | 4 | 44 | spec'd | social-account |
| 0x1204 | NotifySimpleInformationBase | S→C | 0x1c24 | 4 | 36 | spec'd | social-account |
| 0x1205 | NotifySimpleInformationGrid | S→C | 0x324 | 4 | 4 | spec'd | social-account |
| 0x1206 | NotifySimpleInformationStrategy | S→C | 0x644 | 4 | 8 | spec'd | social-account |
| 0x1207 | NotifySimpleInformationUnit | S→C | 0x12c4 | 2 | 8 | spec'd | social-account |
| 0x1208 | NotifySimpleInformationCard | S→C | 0xe14 | 2 | 12 | spec'd | social-account |
| 0x1209 | NotifySimpleInformationRank | S→C | 0x2b | 1 | 2 | spec'd | social-account |
| 0x120a | NotifySimpleInformationRankingCharacter | S→C | 0x73a4 | 4 | 296 | spec'd | social-account |
| 0x120b | NotifySimpleInformationCompletenessSupplyOutfit | S→C | 0x3cf4 | 2 | 52 | spec'd | social-account |
| 0x120c | NotifySimpleInformationCardAvailableOutfitSeat | S→C | 0x21c4 | 4 | 48 | spec'd | social-account |
| 0x120d | NotifySimpleInformationCardAvailableBaseSeat | S→C | 0x2ee4 | 2 | 20 | spec'd | social-account |
| 0x120e | NotifySimpleInformationOrderSuggestCharacter | S→C | 0x723c | 4 | 2924 | spec'd | social-account |
| 0x120f | NotifySimpleInformationCharacterEntry | S→C | 0x73a4 | 4 | 296 | spec'd | social-account |

---

## 2. SPACE WAR — the tactical-combat loop (THE end goal)

The user's stated end goal. The whole loop is now mapped end-to-end:

```
 STRATEGIC MAP                                              TACTICAL BATTLE
       |  C→S 0xb06 CommandSwitchMode (units≤70, chars≤10, mode u16)   ^
       |   — OR — C→S 0x411 CommandChangeMode (per-ship engage)        |
       v                                                               |
  server validates engagement, allocates a battle field id,           |
  picks both sides' spawn poses (continuous float XZ)                  |
       |                                                               |
       |  S→C battle-setup read model (push in this order):            |
       |    0x337 TacticsCharacter (commander roster)                  |
       |    0x33b TacticsInformationUnitShip (live per-ship state)     |
       |    0x33f TacticsInformationCorps                              |
       |    0x341 FillShield (6-dir shield + charge)                   |
       |    0x343 FillBeamGun (gun banks + cooldown)                   |
       |    0x349 ResponsePositionUnit (initial placement)             |
       |    0x345/0x34b base entries+positions, 0x347 obstacles        |
       |  then S→C 0x42f NotifyChangeMode (seeds every ship's pose,    |
       |   flips client into controllable tactical battle)             |
       |  and/or 0xf1f NotifyTactics (8B "enter space-war" trigger)    |
       v                                                               |
  CONTROLLABLE TACTICAL BATTLE: the fire/maneuver loop ───────────────+
    C→S 0x400/0x402 move, 0x401 turn, 0x403 reverse, 0x40a stop,
        0x404 warp, 0x405 attack, 0x406 shoot, 0x407 fight, 0x40e air
    S→C 0x423 moved, 0x424 turned, 0x425 warped, 0x426 ATTACKED (damage),
        0x427 fought, 0x428 air, 0x440 morale, 0x43d/0x43e confusion
       |  battle ends → 0x42f (mode back) / 0x35a NotifyEnding ────────+
       v  back to strategic
```

### The damage model (authoritative — server owns truth)

The client is a thin renderer: it SENDS a fire command and only shows damage when the server broadcasts
`NotifyAttackedShip 0x426`. Three cumulative pools on the wire (client derives `current = classMax −
wireValue`): **shield** → **armor** (装甲, entity+0x8d4) → **zanki** (残機, entity+0x8d8). Zanki=0 ⇒
destroyed. Per-section shield is a 6-facing array (`FillShield 0x341`); `hitLoc` 0..5 picks the section.
The original server's damage *formula* is unrecoverable (only the renderer survives) — it is an
authoritative **server design choice** (`computeDamage` in `logh7-combat-engine.mjs`): shield→armor→zanki
cascade with a defense-mitigation curve and a kind factor (shoot/attack/fight).

### Already implemented (committed + tested)

`src/server/logh7-combat-engine.mjs` (parsers + damage), `logh7-world-state.mjs` (ship pools, pickTarget,
applyDamage, battle session), `logh7-command-engine.mjs` `processCommand` (0x405/0x406 attack→0x426,
0x407 fight, 0x404 warp placeholder, 0x411 changemode→0x42f), and builders in `logh7-login-protocol.mjs`
(`buildNotifyAttackedShipInner`, `buildNotifyChangeModeInner`, `buildNotifyMoraleDownInner`,
`buildNotifyFoughtInner`, `buildNotifyMovedShipInner`, `buildNotifyTurnedShipInner`). See the roadmap
Phase 1 for the remaining battle-entry/teardown gaps.

---

## 3. Battle-setup data layer (read model the server pushes on battle entry)

Per-ship combat stats + battlefield. Server is the source of truth; push as packed wire records (NOT
zero-padded). Key records: `0x33b` UnitShip (47B record: id/morale/confusion/character/pos/dir/detachment),
`0x341` FillShield (40B: u32 id + u32 shield[6] + u16 fill[6]), `0x343` FillBeamGun (16B: 2 gun banks),
`0x349` PositionUnit (20B: id+x,y,z+heading — same space as 0x423). Static caps from
`PowerDistribution 0x309` (shield/beam recharge curves), `UnitShip 0x30b`, `Arms 0x311`. Full layouts:
`docs/logh7-proto-tactics-data.md`.

---

## 4. Internal-affairs read model (内政 data the server dumps)

S→C record dumps that drive the 内政/org screens. Personnel cards (`0x305/0x307/0x34f`), unit/weapon
master (`0x30b/0x30d/0x30f/0x311`), facilities (`0x321` Institution — defense/shipyard/AA/satellite),
warehouse/package logistics (`0x327/0x329`), fleet/outfit org (`0x32b/0x32d/0x32f/0x331`). All strides
and caps proven; `0x327/0x329/0x32b/0x32d/0x32f`, `UnitTroop/Fighters/Arms/PowerDistribution` are
fully field-labeled. Full layouts: `docs/logh7-proto-info-records.md`.

---

## 5. Personnel + strategy (mutations)

C→S commands that mutate the roster/outfit/plan tables, each echoed/broadcast. Highest playability:
`0x707 CardAppointment` (apply `FUN_004c5580`: append `{cardId, role}` to outfit seat array, ≤16),
`0x708/0x709` dismiss/resign → `0x70a NotifyCardLoss`, rank `0x704/0x705/0x706` → `0x356` + `0x43a`,
`0x903 CreateOutfit` (ships≤99/troops≤24 + 10 practice levels). Char notifies: `0x356` (=0x0323 body),
`0x358 NotifyChangeFlagShip` (92B outfit-state). Full layouts: `docs/logh7-proto-personnel-strategy.md`.

---

## 6. Strategic map ops + logistics + institutions (mutations)

Strategic `0xbxx` (move/supply/search/load/unload/switch-mode), logistics `0xcxx` (reorg/supplement/
assignment/carrying), institutions `0xexx`. Every C→S command is **echoed** by the server (ACKs the modal
dialog FSM + applies the authoritative result client-side). PROVEN layouts: `0xb04/0xb05` Load/Unload
troop, `0xb06` SwitchMode, `0xb0b` MovedBase, `0xb0c` SuppliedFuel, `0xb0d` Search (fog-of-war,
2716B), `0xb08` LeaveOutGrid, `0xc02` Reorganization, `0xc08` CarryingInOut. Full layouts:
`docs/logh7-proto-strategic-logistics.md`.

---

## 7. Social / account / settings

Chat siblings of the DONE GridChat (`0xf1d` spot, `0xf1e` unicast). Settings `0xf16–0xf1b` (small
authoritative writes). Account/char `0x1001/0x1003/0x1005`, charge `0x1006/0x1007/0x1008` (done). Mail/
messenger `0xf05–0xf15` (store/route/echo; lowest playability — stub empty first). Full layouts:
`docs/logh7-proto-social-account.md`.

---

## 8. Simple-info 0x12xx delta sync layer

The periodic state-sync pump: `0x1200 Begin` (resets accumulators) → a stream of `NotifySimpleInformation*`
(each appends `[u8 count][pad][record×count]`) → `0x1201 End` (commit/flip display buffers). Strides are
HIGH confidence (table in §1); per-record field maps are reduced forms of the full records (Character
288B ⊂ 0x0323 724B; Base 36B ⊂ NotifyBaseParameter). **Per-message safe count = min(per-msg max, buffer
max)** (e.g. 0x120b cap at 100, 0x120d cap at 300) to avoid the client's MAXSIZE overflow log.
Full layouts: `docs/logh7-proto-social-account.md` §2.

---

## 9. Recommended server architecture additions

The current modules (`logh7-command-engine`, `logh7-world-state`, `logh7-combat-engine`,
`logh7-login-protocol`, `logh7-world-relay`) cover space-war commands + chat + world load. To reach the
full playable game, add these modules (kept pure + synchronous for unit-testability, mirroring the
existing pattern):

1. **`logh7-battle-engine.mjs`** — the battle FSM + setup-table builder. Owns a `BattleField {id,
   anchorId, participants:Map<shipId,pose>, modeKind, obstacles}`; on engage (0xb06/0x411) builds the
   field, emits the 0x337/0x33b/0x341/0x343/0x349/0x345/0x34b/0x347 read-model tables then 0x42f +
   0xf1f; on end emits 0x42f(mode-back)/0x35a. Promotes the battle-session stub already in world-state.
2. **`logh7-info-records.mjs`** — internal-affairs record builders (§4): Card/CardCommand/CardCharacter,
   UnitShip/UnitTroop/Fighters/Arms/PowerDistribution, Institution, Warehouse/Package, Outfit/OutfitParty/
   OutfitInformationUnit. Pure builders fed from the content DB.
3. **`logh7-personnel-engine.mjs`** — roster + seat + plan tables and the §5 command handlers
   (appoint/dismiss/rank/create-outfit) with their notify broadcasts.
4. **`logh7-strategic-engine.mjs`** — strategic `0xbxx`/`0xcxx`/`0xexx` parsers + echo/notify handlers
   (§6): SupplyFuel/Search/Load/Unload/Reorganization/CarryingInOut + fog-of-war.
5. **`logh7-simple-info.mjs`** — the §8 0x12xx delta pump: `pushSimpleInfoSync(deltas)` emitting
   Begin → NotifySimpleInformation* (split per safe-count) → End. The unified "keep all clients' models
   in sync" channel that every mutation funnels into.

Wire each engine's notify outputs through the existing `processCommand` return contract
(`{accept, notifies:[{inner, target}]}`) and the auth-server's conn3 broadcaster — no new transport.

---

## Related family docs
- `docs/logh7-proto-battle-core.md` — ChangeMode/SwitchMode + Move/Turn/Reverse/Stop/Warp
- `docs/logh7-proto-battle-fire.md` — Attack/Shoot/Fight/AirBattle + damage notifies + entity combat stats
- `docs/logh7-proto-battle-fleetops.md` — Sortie/Repair/Supply/Encourage/Fortress/Authority/Mission
- `docs/logh7-proto-tactics-data.md` — tactics battle-setup read model (per-ship stats + field)
- `docs/logh7-proto-info-records.md` — internal-affairs read model (cards/units/grid/base/institution/outfit)
- `docs/logh7-proto-personnel-strategy.md` — personnel/cards + strategy/outfits + char notifies
- `docs/logh7-proto-strategic-logistics.md` — strategic map + logistics/org + institutions
- `docs/logh7-proto-social-account.md` — social/mail/messenger/settings + simple-info + account/char
- `docs/logh7-moveship-wire.md`, `docs/logh7-strategic-input-wire.md`, `docs/logh7-info-records-wire.md`,
  `docs/logh7-character-creation-wire.md`, `docs/logh7-combat-server-contract.md`
- `docs/multiplayer-roadmap-2026-06-12.md` — world-load + relay status (G164/G200)
