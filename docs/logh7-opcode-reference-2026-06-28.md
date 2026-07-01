# LOGH VII Opcode Reference (2026-06-28, full-RE wave)

Comprehensive RE of every protocol opcode (커맨드/제안/명령/전술맵 이동 + all families), produced by the
`logh7-opcode-full-re` workflow (13 family batches → adversarial verify → synthesis) and cross-checked
against redex (FUN_004b8b00 sizer, FUN_004b78a0 send-selector, FUN_004ba2b0 inbound dispatcher),
`.omo/ghidra/opcode-index.json`, and `server/src/server/*.mjs`. Per-opcode byte-level record layouts +
provenance are in the workflow output (subagents/workflows/wf_6e0c249c-5e8). This file is the curated index.

## Key naming corrections (opcode-index heuristic names were WRONG)
- 0x0203/0x0204 = SSCharacterIDRequest / SSCharacterIDResponce (index said RequestSSGameLogin / NotifyWorldPlayer)
- 0x0305 = ResponseStaticInformationCard (command-card master), not just 'Session'
- 0x0336/0x0337 = RequestTacticsCharacter / ResponseTacticsCharacter; 0x0348/0x0349 = Request/ResponsePositionUnit (index mislabeled 0x0348 as TacticsCharacter)
- 0x0b01 = **CommandMoveGrid** (index said CommandSelectGrid) → 0x0b07 NotifyMovedGrid
- 0x0b00=CommandMoveBase, 0x0b02=CommandSupplyFuel, 0x0b03=CommandSearch, 0x0b04=CommandUnloadTroop, 0x0b05=CommandLoadTroop, 0x0b06=CommandSwitchMode (all REAL via logh7-logistics.mjs)
- 0x2004/0x2006 = LobbyResponseInformationCharacterCharge / LobbyResponseInformationSession (index said SessionList/SessionLogin)
- 0x0f08/0x0f09 = TransactionInformationMailBegin/End (index said Request/ResponseInformationText)

## 제안/進言/提案 (PROPOSAL) system — located
- **Tactical: 0x0408 CommandSuggestion** (C→S, selector 0x80, sendVA 0x004b81ae, body 0x18 = 3-dword hdr + targetId@0x0c + suggestionType@0x10 + arg@0x14). Server: `logh7-battle-ops.mjs:878-884` parseInboundSuggestion (no ownsUnit gate, no broadcast). Nominal response 0x0430 ResponseSuggestion is DEAD/unwired on the client.
- **Order-mail: 0x0f13 CommandOrderSuggestMail / 0x0f14 CommandReplyOrderSuggestMail** → 0x0f15 NotifyCommandMail. Server: `logh7-social.mjs:47-49` (anchors targetId@0 + orderId@4 proven; wide-text follows). Plus NotifySimpleInformationOrderSuggestCharacter.

## Gap list (from this wave + #61 cross-map)
- 0x0410 CommandEvacuateTroops — NOT handled authoritatively (code-mapped but no processCommand branch). P2.
- 0x0430 ResponseSuggestion — client handler DEAD/unwired; server has no builder. The 0x0408 command IS handled. P3.
- 0x03xx INFO panels (tactics 0x033b/0x0337/0x0349/…, static arms/fighters/troop/power 0x0311/0x030f/0x030d/0x0309, card 0x0307) — REAL builders exist but mostly answered by the generic zero-fill walker by default (empty panels). See server-data-audit. Content for arms/fighters/troop/power tables is NOT recovered (do not fabricate).
- 0x031d static base names not pushed at world-import by default (DEFECT 2; fix gated behind LOGH_WORLD_IMPORT_STATIC_BASE this cycle).

---

## 0x02 session-bootstrap (SS login / character-id / game-login handshake)  (7 opcodes)
- **0x0200** RequestSSLogin (client builder Output_SSLoginRequest; client INF tag _INF:SSLoginRequest#) [C->S] server:server/src/server/logh7-login-session.mjs:1624-1627 (innerCode === SS_LOGIN_REQU
- **0x0201** SSLoginOK (Input/response; client INF tag _INF:SSLoginOK#; debug "SSLoginOK OK") [S->C] server:Built by server/src/server/logh7-login-protocol.mjs:1734 buildSsLoginOkInner({st
- **0x0202** SSLoginNG (Input_SSLoginNG; client INF tag _INF:SSLoginNG#; debug "SSLoginNG OK") [S->C] server:not handled — no buildSsLoginNg builder and no server branch emits 0x0202. SS_LO
- **0x0203** SSCharacterIDRequest (client INF tag _INF:SSCharacterIDRequest#) -- opcode-index mislabels this 'RequestSSGameLogin'; client strings prove it is the character-ID request [C->S] server:not handled. CONFIRMED: no innerCode === SS_CHARACTER_ID_REQUEST_CODE (0x0203) b
- **0x0204** SSCharacterIDResponce (debug "SSCharacterIDResponce OK"; INF tag _INF:SSCharacterIDResponce#) -- opcode-index mislabels this 'NotifyWorldPlayer'; the client handler prints SSCharacterIDResponce and stores the selected character id [S->C] server:Built by server/src/server/logh7-login-protocol.mjs:213-217 buildSsCharacterIdRe
- **0x0205** SSGameLoginRequest (client string SSGameLoginRequest; INF tag _INF:SSGameLoginRequest#) [C->S] server:server/src/server/logh7-login-session.mjs:1628-1652 (innerCode === SS_GAME_LOGIN
- **0x0206** SSGameLoginOK (debug "SSGameLoginOK OK"; client INF tag _INF:SSGameLoginOK#) [S->C] server:Built by server/src/server/logh7-login-protocol.mjs:1738 buildSsGameLoginOkInner
  NOTES: All seven entries are substantially CONFIRMED by re-running redex (FUN_004b8b00 sizer, FUN_004b78a0 send-selector, FUN_004ba2b0 inbound dispatch), the opcode-index, and the server files. Sizes 0x201->1, 0x202->0x102(258), 0x204->4, 0x206->1 all re-verified. Naming corrections for 0x0203/0x0204 (SSCharacterIDRequest/SSCharacterIDResponce vs index mislabels RequestSSGameLogin/NotifyWorldPlayer) are 

## 0x03 static-info-A (RequestStaticInformationSynchronize/Session/CardCommand + grid type/grid/grid-selector + unit/fighter/arms masters)  (22 opcodes)
- **0x0300** RequestStaticInformationSynchronize (server alias: RequestTime, SS_REQ_TIME_CODE) [C->S] server:server/src/server/logh7-login-session.mjs:1806-1808 — REAL handler: innerCode===
- **0x0301** ResponseStaticInformationSynchronize (server alias: ResponseTime, SS_RESP_TIME_CODE) [S->C] server:server/src/server/logh7-login-protocol.mjs:182-186 buildResponseTimeInner() (REA
- **0x0304** RequestStaticInformationSession (server: REQ_INFO_SESSION_CODE / SS_REQ_INFO_SESSION_CODE) [C->S] server:server/src/server/logh7-login-session.mjs:511 REQ_INFO_SESSION_CODE=0x0304; DEFA
- **0x0305** ResponseStaticInformationSession (opcode-index) / ResponseStaticInformationCard (client dispatcher debug str + server builder buildStaticInformationCardInner) [S->C] server:server/src/server/logh7-info-records.mjs:110-139 buildStaticInformationCardInner
- **0x0306** RequestStaticInformationCardCommand (opcode-index requestName null; server: REQ_WORLD_INFO_CHARACTER_CODE walker slot, answer 0x0307) [C->S] server:server/src/server/logh7-login-session.mjs:521 REQ_WORLD_INFO_CHARACTER_CODE=0x03
- **0x0307** ResponseStaticInformationCardCommand [S->C] server:server/src/server/logh7-info-records-static.mjs:174-202 buildStaticInformationCa
- **0x0308** Request (opcode-index requestName null) — pairs to 0x0309 ResponseStaticInformationPowerDistribution [C->S] server:NOT specially handled — generic size-correct zero-fill walker buildWorldDataResp
- **0x0309** ResponseStaticInformationPowerDistribution [S->C] server:server/src/server/logh7-info-records-static.mjs:217-255 buildStaticInformationPo
- **0x030a** Request (opcode-index requestName null) — server REQ_STATIC_INFORMATION_UNIT_SHIP_CODE; pairs 0x030b ResponseStaticUnitShip [C->S] server:server/src/server/logh7-login-session.mjs:2406-2407 — REAL builder buildStaticIn
- **0x030b** ResponseStaticUnitShip (ResponseStaticInformationUnitShip) [S->C] server:server/src/server/logh7-info-records-static.mjs:276-327 buildStaticInformationUn
- **0x030c** Request (opcode-index requestName null) — pairs 0x030d ResponseStaticUnitTroop [C->S] server:NOT specially handled — generic size-correct zero-fill walker -> 0x030d (logh7-l
- **0x030d** ResponseStaticUnitTroop (ResponseStaticInformationUnitTroop) [S->C] server:server/src/server/logh7-info-records-static.mjs:340-362 buildStaticInformationUn
- **0x030e** Request (opcode-index requestName null) — pairs 0x030f ResponseStaticFighters [C->S] server:NOT specially handled — generic size-correct zero-fill walker -> 0x030f (logh7-l
- **0x030f** ResponseStaticFighters (ResponseStaticInformationFighters) [S->C] server:server/src/server/logh7-info-records-static.mjs:373-389 buildStaticInformationFi
- **0x0310** Request (opcode-index requestName null) — pairs 0x0311 ResponseStaticArms [C->S] server:NOT specially handled — generic size-correct zero-fill walker -> 0x0311 (logh7-l
- **0x0311** ResponseStaticArms (ResponseStaticInformationArms) [S->C] server:server/src/server/logh7-info-records-static.mjs:400-410 buildStaticInformationAr
- **0x0312** RequestStaticInformationGridType (server SS_REQ_STATIC_GRID_TYPE_CODE) [C->S] server:server/src/server/logh7-login-session.mjs:1831-1856 — REAL: when worldPlayer+str
- **0x0313** ResponseStaticInformationGridType (strategic OBJECT TABLE) [S->C] server:server/src/server/logh7-login-protocol.mjs:653-674 buildStaticInformationGridTyp
- **0x0314** RequestStaticInformationGrid (server SS_REQ_STATIC_GRID_CODE) [C->S] server:server/src/server/logh7-login-session.mjs:1831-1856 — galaxy cell grid cellInner
- **0x0315** ResponseStaticInformationGrid (strategic CELL GRID, RLE) [S->C] server:server/src/server/logh7-login-protocol.mjs:576-628 buildStaticInformationGridInn
- **0x0316** RequestStaticInformationGridSelector [C->S] server:NOT handled by the canonical login-session (the canonical server sends 0x0315 on
- **0x0317** ResponseStaticInformationGridSelector (opcode-index) / ResponseInformationGrid (client debug str + server builder) [S->C] server:server/src/server/logh7-info-records-static.mjs:421-425 buildInformationGridInne
  NOTES: PROPOSAL/建議/進言/提案/제안 SYSTEM — NOT in 0x03xx (UNVERIFIED here — out of scope; I checked only that nothing in 0x0300-0x0317 is a proposal/order). The 0x0300-0x0317 family is read-only static/master/reference data (clock-sync, command-card master, ship/troop/fighter/arms/power masters, strategic-map grid). The batch's pointers to 0x0408 CommandSuggestion and 0x0f13/0x0f14 order-suggest MAIL, and reco

## 0x03 static-info-B (in-game read-model info panels: base/planet, institution, character card, unit table)  (20 opcodes)
- **0x0318** unknown [unknown] server:not handled
- **0x0319** unknown [unknown] server:not handled
- **0x031a** unknown [unknown] server:not handled
- **0x031b** unknown [unknown] server:not handled
- **0x031c** RequestStaticInformationBase [C->S] server:server/src/server/logh7-login-session.mjs:2202 (REQ_STATIC_INFORMATION_BASE_CODE
- **0x031d** ResponseStaticInformationBase [S->C] server:server/src/server/logh7-info-records.mjs builder buildStaticInformationBaseInner
- **0x031e** RequestInformationBase [C->S] server:server/src/server/logh7-login-session.mjs:2225 (REQ_INFORMATION_BASE_CODE=0x031e
- **0x031f** ResponseInformationBase [S->C] server:server/src/server/codec/base-record.mjs builder buildResponseInformationBaseInne
- **0x0320** RequestInformationInstitution [C->S] server:server/src/server/logh7-login-session.mjs:2356 (REQ_INFORMATION_INSTITUTION_CODE
- **0x0321** ResponseInformationInstitution [S->C] server:server/src/server/codec/institution-record.mjs builder buildResponseInformationI
- **0x0322** RequestInformationCharacter [C->S] server:server/src/server/logh7-login-session.mjs:2159 (REQ_INFO_CHARACTER_CODE=0x0322 h
- **0x0323** ResponseInformationCharacter [S->C] server:server/src/server/logh7-login-protocol.mjs:224 buildInformationCharacterRecordIn
- **0x0324** RequestInformationUnit [C->S] server:server/src/server/logh7-login-session.mjs:2341 (REQ_INFORMATION_UNIT_CODE=0x0324
- **0x0325** ResponseInformationUnit [S->C] server:server/src/server/logh7-login-protocol.mjs:501 buildInformationUnitRecordInner (
- **0x0326** RequestInformationWarehouse (보급창고) [C->S] server:server/src/server/logh7-login-session.mjs:2381 (REQ_INFORMATION_WAREHOUSE_CODE=0
- **0x0327** ResponseInformationWarehouse (보급창고) [S->C] server:server/src/server/codec/warehouse-record.mjs builder buildResponseInformationWar
- **0x0328** RequestInformationPackage (수송) [C->S] server:server/src/server/logh7-login-session.mjs:2392 (REQ_INFORMATION_PACKAGE_CODE=0x0
- **0x0329** ResponseInformationPackage (수송) [S->C] server:server/src/server/codec/warehouse-record.mjs builder buildResponseInformationPac
- **0x032a** RequestInformationOutfit [C->S] server:server/src/server/logh7-login-session.mjs:2316 (REQ_INFORMATION_OUTFIT_CODE=0x03
- **0x032b** ResponseInformationOutfit [S->C] server:server/src/server/logh7-info-records.mjs:371 builder buildInformationOutfitInner
  NOTES: PROPOSAL/建議/進言/提案 SYSTEM — confirmed NOT in this batch (string family Command/ResponseSuggestion + OrderSuggest mail path exists separately as Command*/Notify* opcodes, not 0x03xx). I did not re-disassemble those addresses but the claim is consistent and low-risk. The 0x0318-0x032b batch is read-model info-panel pairs (Request even / Response odd).

BATCH SHAPE: VERIFIED. 0x0318-0x031b are GAPS (0

## 0x03 tactics-info / battle-data family (0x032c-0x034f) — request/response pairs that feed the tactical battle map and battle-screen panels (per-ship position/state, shields, corps, base, obstacles) plus the adjacent outfit-info and card/position info codes that share the FUN_004ba2b0 dispatcher block. VERIFIED: all 12 request/response pairings, all 12 receive-sizer sizes, all 12 client selectors (FUN_004b78a0 cases 0xe-0x2e), and the server WORLD_RESPONSE_OBJECT_SIZES table reconcile exactly. Main corrections are in 0x033b's dispatcher dword count, 0x0345's header arithmetic, several count-width and builder-name details, and downgraded per-record field labels.  (24 opcodes)
- **0x032c** RequestGridInformationOutfit (index symbol is unnamed/None in normalizedOutboundRoutes; runtime dispatcher OK-string s_ResponseGridInformationOutfit on 0x32d is authoritative) [C->S] server:not specially handled in logh7-login-session.mjs request switch -> generic walke
- **0x032d** ResponseGridInformationOutfit [S->C] server:builder buildGridInformationOutfitInner (info-records-static.mjs:438) present bu
- **0x032e** RequestInformationOutfitParty [C->S] server:REAL handler: logh7-login-session.mjs:2328 (innerCode===REQ_INFORMATION_OUTFIT_P
- **0x032f** ResponseInformationOutfitParty [S->C] server:REAL builder buildInformationOutfitPartyInner (info-records-static.mjs:520) emit
- **0x0330** RequestOutfitInformationUnit [C->S] server:not specially handled -> generic walker buildWorldDataResponseInner(0x0331) zero
- **0x0331** ResponseOutfitInformationUnit [S->C] server:builder buildOutfitInformationUnitInner present (info-records-static.mjs); defau
- **0x0336** RequestTacticsCharacter (response 0x337 = Input_ResponseTacticsCharacter, confirmed; request-side symbol NOT independently confirmed) [C->S] server:not specially handled in request switch -> generic walker buildWorldDataResponse
- **0x0337** ResponseTacticsCharacter [S->C] server:builder buildTacticsCharacterInner present (logh7-battle-engine.mjs:264, NOT 'bu
- **0x033a** RequestTacticsInformationUnitShip [C->S] server:not specially handled in request switch -> generic walker zero-fill. The RESPONS
- **0x033b** ResponseTacticsInformationUnitShip [S->C] server:REAL builder buildTacticsInformationUnitShipInner (logh7-battle-engine.mjs:184).
- **0x033e** RequestTacticsInformationCorps [C->S] server:not specially handled -> generic walker zero-fill; RESPONSE 0x033f pushed via op
- **0x033f** ResponseTacticsInformationCorps [S->C] server:REAL builder buildTacticsInformationCorpsInner (logh7-battle-engine.mjs:285); pu
- **0x0340** RequestTacticsInformationFillShield [C->S] server:not specially handled -> generic walker zero-fill; RESPONSE 0x0341 pushed via op
- **0x0341** ResponseTacticsInformationFillShield [S->C] server:REAL builder buildTacticsInformationFillShieldInner (logh7-battle-engine.mjs:217
- **0x0344** RequestTacticsInformationBase [C->S] server:not specially handled -> generic walker zero-fill; RESPONSE 0x0345 pushed via op
- **0x0345** ResponseTacticsInformationBase [S->C] server:REAL builder buildTacticsInformationBaseInner (logh7-battle-engine.mjs:325); pus
- **0x0346** RequestInformationObstacle [C->S] server:not specially handled -> generic walker zero-fill; RESPONSE 0x0347 pushed via op
- **0x0347** ResponseInformationObstacle [S->C] server:builder buildInformationObstacleInner (logh7-battle-engine.mjs:376); pushed open
- **0x0348** RequestPositionUnit (index symbol alias 'RequestTacticsCharacter' is STALE; runtime is PositionUnit) [C->S] server:not specially handled -> generic walker zero-fill; RESPONSE 0x0349 pushed via op
- **0x0349** ResponsePositionUnit (index alias 'ResponseTacticsCharacter' is STALE) [S->C] server:REAL builder buildResponsePositionUnitInner (logh7-battle-engine.mjs:157); pushe
- **0x034a** RequestPositionBase [C->S] server:not specially handled -> generic walker zero-fill; RESPONSE 0x034b pushed via op
- **0x034b** ResponsePositionBase [S->C] server:REAL builder buildResponsePositionBaseInner (logh7-battle-engine.mjs:349); pushe
- **0x034e** RequestCardCharacter [C->S] server:REAL handler: logh7-login-session.mjs:2252 (innerCode===REQ_CARD_CHARACTER_CODE=
- **0x034f** ResponseCardCharacter [S->C] server:REAL builder buildCardCharacterInner (logh7-info-records-static.mjs:603, comment
  NOTES: VERIFY: I independently re-ran FUN_004b8b00 (sizer), FUN_004b78a0 (selector table, cases 0xe-0x2e), FUN_004ba2b0 (dispatcher, all relevant cases), FUN_0040cba0 (get_length), the five Input parsers (FUN_00421740/00421f80/00422d80/00423890/00424330), the opcode-index normalizedOutboundRoutes, the cap/OK string table, and the server files. Overall the batch is strong: all 12 req/resp pairings, all 12

## 0x04 combat-commands (tactical-map ship movement + combat orders: move/turn/reverse/warp/attack/shoot/fight/stop/airbattle/changemode + fleet/base ops + 進言/Suggestion). VERIFIED: all 21 dispatch sizes match WORLD_RESPONSE_OBJECT_SIZES and FUN_004b8b00 cases exactly. Named client classes confirmed present in binary for nearly all codes (the batch's repeated 'requestName=null/server name' refers only to the opcode-index route table not resolving the name — the client class strings DO exist).  (22 opcodes)
- **0x0400** CommandMoveShip [C->S] server:server/src/server/logh7-command-engine.mjs:402-445 processCommand (real handler)
- **0x0401** CommandTurnShip [C->S] server:server/src/server/logh7-battle-ops.mjs:696-711 processBattleOps (real handler, s
- **0x0402** CommandParallelMoveShip [C->S] server:server/src/server/logh7-command-engine.mjs:402-445 processCommand: COMMAND_PARAL
- **0x0403** CommandReverseShip [C->S] server:server/src/server/logh7-battle-ops.mjs:696-711 (shares Turn case via COMMAND_REV
- **0x0404** CommandWarpShip [C->S] server:server/src/server/logh7-command-engine.mjs:569-589 processCommand COMMAND_WARP_S
- **0x0405** CommandAttackShip [C->S] server:server/src/server/logh7-command-engine.mjs:478-538 processCommand (real handler,
- **0x0406** CommandShootShip [C->S] server:server/src/server/logh7-command-engine.mjs:478-538 (shares Attack case, kind='sh
- **0x0407** CommandFight [C->S] server:server/src/server/logh7-command-engine.mjs:591-642 processCommand COMMAND_FIGHT_
- **0x0408** CommandSuggestion (進言/提案/proposal) [C->S] server:server/src/server/logh7-battle-ops.mjs:878-884 processBattleOps case COMMAND_SUG
- **0x0409** CommandEncourageFlagship [C->S] server:server/src/server/logh7-battle-ops.mjs:827-845 processBattleOps case COMMAND_ENC
- **0x040a** CommandStop (CommandStopShip) [C->S] server:server/src/server/logh7-battle-ops.mjs:715-733 processBattleOps case COMMAND_STO
- **0x040b** CommandAdmission [C->S] server:server/src/server/logh7-battle-ops.mjs:798-811 processBattleOps case COMMAND_ADM
- **0x040c** CommandControl (C->S) / ResponseBattleSetup (S->C, opcode-index pairedResponseName) [both] server:server/src/server/logh7-battle-ops.mjs:887-901 processBattleOps case COMMAND_CON
- **0x040d** CommandFileFleet [C->S] server:server/src/server/logh7-battle-ops.mjs:736-754 processBattleOps case COMMAND_FIL
- **0x040e** CommandAirBattle [C->S] server:server/src/server/logh7-battle-ops.mjs:904-945 processBattleOps case COMMAND_AIR
- **0x040f** CommandSortieTroops [C->S] server:server/src/server/logh7-command-engine.mjs:644-680 processCommand COMMAND_SORTIE
- **0x0410** CommandEvacuateTroops [C->S] server:GAP — NOT handled authoritatively. COMMAND_EVACUATE_TROOPS_CODE 0x0410 is code-m
- **0x0411** CommandChangeMode [C->S] server:server/src/server/logh7-command-engine.mjs:540-567 processCommand COMMAND_CHANGE
- **0x0412** CommandAttackTroop (troop assault) [C->S] server:server/src/server/logh7-command-engine.mjs:644-680 (shares Sortie case via COMMA
- **0x0413** CommandRepairFleet [C->S] server:server/src/server/logh7-battle-ops.mjs:757-776 processBattleOps case COMMAND_REP
- **0x0414** CommandSupplyFleet [C->S] server:server/src/server/logh7-battle-ops.mjs:757-776 (shares Repair/Supply case via CO
- **0x0430** NotifyUnknown0430 (opcode-index pairedResponseName; paired with C->S 0x0408 CommandSuggestion) [S->C] server:NOT handled — no server builder/handler for 0x0430. The 0x0408 Suggestion handle
  NOTES: PROPOSAL/進言/提案/제안 SYSTEM (verified): lives at 0x0408 CommandSuggestion (C->S), selector 0x0080, send VA 0x004b81ae, body 0x18 = 3-dword header + targetId@0x0c + suggestionType@0x10 + arg@0x14 (server parseInboundSuggestion battle-ops.mjs:209-220; handler 878-884, NO ownsUnit gate, NO broadcast). Paired S->C with 0x0430 NotifyUnknown0430 (opcode-index only), whose layout/handler is genuinely unreso

## 0x04 combat command-ACK + combat NOTIFY family (0x0408 CommandSuggestion + 0x0419-0x0422 fleet/base command REQUESTS with same-code Command*_OK S->C ACK echoes, and 0x0423-0x0442 Notify* S->C combat broadcasts). VERIFIED: two sub-families share the range. Command REQUEST codes (C->S) each have a send-selector entry (FUN_004b78a0 jump table, base 0x004b864c), a sizer entry (FUN_004b8b00), and a FIRST-switch Command*_OK ACK consumer in dispatcher FUN_004ba2b0. Pure NOTIFY codes (S->C) have NO selector and are handled in the SECOND switch as Notify*_OK appliers. Server command handler = processBattleOps (logh7-battle-ops.mjs:693); notify builders = logh7-battle-ops.mjs (fleet/base ops) + logh7-login-protocol.mjs (maneuver/space-war/ground). Sizes mirror WORLD_RESPONSE_OBJECT_SIZES (login-protocol.mjs:1598-1608) exactly. ALL sizer/dispatcher/selector/server claims independently re-verified this pass.  (39 opcodes)
- **0x0419** CommandShootFortress (req) / CommandShootFortress_OK (ack) [C->S] server:logh7-battle-ops.mjs:963 case COMMAND_SHOOT_FORTRESS_CODE -> parseInboundShootFo
- **0x041a** CommandAdmissionBase (req) / CommandAdmissionBase_OK (ack) [C->S] server:logh7-battle-ops.mjs:799 case COMMAND_ADMISSION_BASE_CODE (shared with COMMAND_A
- **0x041b** CommandRepairBase (req) / CommandRepairBase_OK (ack) [C->S] server:logh7-battle-ops.mjs:779 case COMMAND_REPAIR_BASE_CODE (shared with SUPPLY at 78
- **0x041c** CommandSupplyBase (req) / CommandSupplyBase_OK (ack) [C->S] server:logh7-battle-ops.mjs:780 case COMMAND_SUPPLY_BASE_CODE (shared block with REPAIR
- **0x041d** CommandEncourageBase (req) / CommandEncourageBase_OK (ack) [C->S] server:logh7-battle-ops.mjs:846 case COMMAND_ENCOURAGE_BASE_CODE -> parseInboundBaseSin
- **0x041e** CommandStopBase (req) / CommandStopBase_OK (ack) [C->S] server:logh7-battle-ops.mjs:866 case COMMAND_STOP_BASE_CODE -> parseInboundBaseSingle, 
- **0x041f** CommandMoveFortress (req) / CommandMoveFortress_OK (ack) [C->S] server:logh7-battle-ops.mjs:983 case COMMAND_MOVE_FORTRESS_CODE -> parseInboundMoveFort
- **0x0420** CommandChangeAuthority (req) / CommandChangeAuthority_OK (ack) [C->S] server:logh7-battle-ops.mjs:1006 case COMMAND_CHANGE_AUTHORITY_CODE -> parseInboundChan
- **0x0421** CommandMission (req) / CommandMission_OK (ack) — index placeholder 'NotifyUnknown0421' is the SAME-code S->C ACK [C->S] server:logh7-battle-ops.mjs:1027 case COMMAND_MISSION_CODE -> parseInboundMission (L341
- **0x0422** CommandEmergencySupply (req) / CommandEmergencySupply_OK (ack) [C->S] server:logh7-battle-ops.mjs:812 case COMMAND_EMERGENCY_SUPPLY_CODE -> parseInboundEmerg
- **0x0424** NotifyTurnedShip [S->C] server:buildNotifyTurnedShipInner (logh7-login-protocol.mjs:1152). Emitted by COMMAND_T
- **0x0425** NotifyWarpedShip [S->C] server:not handled — 0x0404 CommandWarpShip is in RELAY_COMMAND_CODES (world-relay.mjs:
- **0x0426** NotifyAttackedShip [S->C] server:logh7-command-engine.mjs space-war damage resolution emits via buildNotifyAttack
- **0x0427** NotifyFought [S->C] server:buildNotifyFoughtInner (login-protocol.mjs:1274, NOT :1273); emitted by the Comm
- **0x0428** NotifyAirBattle [S->C] server:logh7-battle-ops.mjs:904 case COMMAND_AIR_BATTLE_CODE -> parseInboundIdList (L26
- **0x0429** NotifyMovedTroop [S->C] server:buildNotifyMovedTroopInner (login-protocol.mjs:1303, NOT :1302); emitted from gr
- **0x042a** NotifyLandCombat [S->C] server:buildNotifyLandCombatInner (login-protocol.mjs:1318, NOT :1313); emitted from gr
- **0x042c** NotifyEncourageFlagship [S->C] server:logh7-battle-ops.mjs:827 case COMMAND_ENCOURAGE_FLAGSHIP_CODE -> parseInboundEnc
- **0x042f** NotifyChangeMode [S->C] server:buildNotifyChangeModeInner (login-protocol.mjs:1251); emitted by CommandChangeMo
- **0x0421(resp-alias)** NotifyUnknown0421 (index placeholder = CommandMission_OK ACK echo) [S->C] server:The auth-server reflects accepted commands as same-code ACK; actual mission reso
- **0x0430** ResponseSuggestion (index placeholder 'NotifyUnknown0430') — DEAD/UNWIRED on client [S->C] server:not handled — processBattleOps case COMMAND_SUGGESTION_CODE (battle-ops.mjs:878)
- **0x0431** NotifyTacticsChiefCommander [S->C] server:buildNotifyTacticsChiefCommanderInner exists (battle-ops.mjs:539, builder-only).
- **0x0432** NotifyEncourageBase [S->C] server:logh7-battle-ops.mjs:846 (COMMAND_ENCOURAGE_BASE) emits buildNotifyEncourageBase
- **0x0433** NotifyRepairBase [S->C] server:logh7-battle-ops.mjs:779 (REPAIR_BASE) and 805 (Admission) emit buildNotifyRepai
- **0x0434** NotifySupplyBase [S->C] server:logh7-battle-ops.mjs:780 (SUPPLY_BASE) emits buildNotifySupplyBaseInner(0x434, L
- **0x0435** NotifyMovedFortress [S->C] server:logh7-battle-ops.mjs:983 (MOVE_FORTRESS) emits buildNotifyMovedFortressInner(0x4
- **0x0436** NotifyShootFortress [S->C] server:logh7-battle-ops.mjs:963 (SHOOT_FORTRESS) emits buildNotifyShootFortressInner(0x
- **0x0437** NotifySortie [S->C] server:buildNotifySortieInner (login-protocol.mjs:1328, NOT :1327); emitted from sortie
- **0x0438** NotifyEmergencySupplyBase [S->C] server:logh7-battle-ops.mjs:812 (EMERGENCY_SUPPLY) emits buildNotifyEmergencySupplyBase
- **0x0439** NotifyChangedAuthority [S->C] server:logh7-battle-ops.mjs:1006 (CHANGE_AUTHORITY) emits buildNotifyChangedAuthorityIn
- **0x043a** NotifyCharacterAchievement [S->C] server:buildNotifyCharacterAchievementInner (battle-ops.mjs:559, builder-only); no comm
- **0x043b** NotifyOutfitAchievement [S->C] server:buildNotifyOutfitAchievementInner (battle-ops.mjs:562, builder-only, on demand).
- **0x043c** NotifyMissionResult [S->C] server:logh7-battle-ops.mjs:1027 (MISSION) emits buildNotifyMissionResultInner(0x43c, L
- **0x043d** NotifyConfusionUnit [S->C] server:buildNotifyConfusionUnitInner (battle-ops.mjs:577, builder-only, on demand). VER
- **0x043e** NotifyConfusionRecoveredUnit [S->C] server:buildNotifyConfusionRecoveredUnitInner (battle-ops.mjs:580, builder-only, on dem
- **0x043f** NotifyShootBase [S->C] server:buildNotifyShootBaseInner (battle-ops.mjs:461, builder-only); NOT auto-emitted b
- **0x0440** NotifyMoraleDown [S->C] server:buildNotifyMoraleDownInner (login-protocol.mjs:1285, NOT :1284); emitted alongsi
- **0x0441** NotifyBlackHoleSuction [S->C] server:buildNotifyBlackHoleSuctionInner (battle-ops.mjs:585, builder-only; environmenta
- **0x0442** NotifyFinishOccupation [S->C] server:logh7-battle-ops.mjs:1042 (MISSION occupation branch, flagA && missionTarget) em
  NOTES: PROPOSAL/建議/進言/提案 SYSTEM (re-verified): (1) TACTICAL proposal = CommandSuggestion 0x0408 (C->S, sel 0x80, sendVA 0x004b81ae [opcode-index confirmed]; client str CommandSuggestion 0x0076967c; CommandSuggestion xref => only FUN_004ba2b0 references it = the 0x0408 ACK consumer). Nominal paired response 0x0430 = ResponseSuggestion (strings 0x00769360 + _INF:ResponseSuggestion# 0x0076b938). CONFIRMED D

## 0x07 appointment-personnel (人事 / cards): rank up/down, special promotion, card appoint/dismiss/resign  (6 opcodes)
- **0x0704** CommandRankUp [C->S] server:REAL handler (NOT zero-fill walker): logh7-personnel.mjs case COMMAND_RANK_UP_CO
- **0x0705** CommandSpeciallyRankUp [C->S] server:REAL handler: logh7-personnel.mjs case COMMAND_SPECIALLY_RANK_UP_CODE at lines 4
- **0x0706** CommandRankDown [C->S] server:REAL handler: logh7-personnel.mjs case COMMAND_RANK_DOWN_CODE at lines 429-456 (
- **0x0707** CommandCardAppointment [C->S] server:REAL handler: logh7-personnel.mjs case COMMAND_CARD_APPOINTMENT_CODE at lines 31
- **0x0708** CommandCardDismisal [C->S] server:REAL handler: logh7-personnel.mjs case COMMAND_CARD_DISMISAL_CODE at lines 362-3
- **0x0709** CommandCardResignation [C->S] server:REAL handler: logh7-personnel.mjs case COMMAND_CARD_RESIGNATION_CODE at lines 36
  NOTES: DIRECTION/PAIRING: All six 0x0704-0x0709 are C->S (outbound) commands — CONFIRMED. No paired response is QUEUED by the client: in FUN_004b78a0 the personnel cases 0x69-0x6e set only iVar1 (request code), unlike handshake cases 0-7 which also set iVar5 (expected response). Server replies asynchronously via broadcast notifies (0x0356/0x0358/0x070a/0x070b) consumed by receive dispatcher FUN_004ba2b0.

## 0x09 family — Strategy-Plan + Outfit (fleet organisation / 編成) commands (0x0900-0x0906 C->S; 0x0904/0x0905/0x0907/0x0908 S->C). NOT the proposal/進言 system. VERIFIED: all five C->S core facts (dispatch case, receive-size, inbound copy-count, client write-address, debug string, server handler) reproduced from redex + server source. Corrections applied to two side-claims (0x0905 size, 0x0907 client handler).  (5 opcodes)
- **0x0900** CommandMakePlan [both] server:REAL handler (NOT zero-fill). command-engine.mjs:106-108 routes STRATEGY_CODE_LO
- **0x0901** CommandWithdrawalPlan [both] server:REAL handler. strategy.mjs:605-617: parseInboundWithdrawalPlan (132-146), state.
- **0x0902** CommandAnnouncement [both] server:REAL handler. strategy.mjs:619-627: parseInboundAnnouncement (153-168), broadcas
- **0x0903** CommandCreateOutfit [both] server:REAL handler. strategy.mjs:629-653: parseInboundCreateOutfit (187-296) decodes h
- **0x0906** CommandDeleteOutfit [both] server:REAL handler at header level (NOT zero-fill). strategy.mjs:655-666: parseInbound
  NOTES: PROPOSAL/建議/進言/提案 SYSTEM LOCATION — CONFIRMED accurate: NOT in 0x09. Suggestion strings verified: CommandSuggestion @0x0076967c, ResponseSuggestion @0x00769360, CommandOrderSuggestMail @0x00767440, CommandReplyOrderSuggestMail @0x00767420, OrderSuggestType @0x00788a0c, NotifySimpleInformationOrderSuggestCharacter @0x0078a960 (all reproduced via redex str). FUN_004b78a0 case 0x72->0xf16, 0x73->0xf1

## 0x0b strategic-grid-move (전술맵/전략 이동 — strategic-map fleet/base movement, grid entry, and the strategic command-menu actions; C002 family). VERIFIED: all 14 wire sizes confirmed against client sizer FUN_004b8b00 AND server WORLD_RESPONSE_OBJECT_SIZES (logh7-login-protocol.mjs:1611-1613); all dispatcher 'X OK' strings/consumers/copy-counts and all FUN_004b78a0 selector->request/response pairings confirmed. MAJOR REFUTATION: 0x0b00/0x0b02/0x0b03/0x0b04/0x0b05/0x0b06 are REAL server handlers via logh7-logistics.mjs (processLogistics), NOT 'unknown-command'; and 0x0b08/0x0b0b/0x0b0c/0x0b0d have REAL server builders, NOT 'no builder'.  (14 opcodes)
- **0x0b00** CommandMoveBase [C->S] server:REAL HANDLER (refutes batch 'unknown-command'). 0x0b00 IS in LOGISTICS_COMMAND_C
- **0x0b01** CommandMoveGrid (opcode-index route table mislabels as CommandSelectGrid) [C->S] server:REAL HANDLER. logh7-command-engine.mjs:447-476 (COMMAND_MOVE_GRID_CODE=0x0b01, l
- **0x0b02** CommandSupplyFuel [C->S] server:REAL HANDLER (refutes 'unknown-command'). 0x0b02 in LOGISTICS_COMMAND_CODES -> p
- **0x0b03** CommandSearch [C->S] server:REAL HANDLER (refutes 'unknown-command'). 0x0b03 in LOGISTICS_COMMAND_CODES -> p
- **0x0b04** CommandUnloadTroop (opcode-index route table mislabels as CommandGridInformation) [C->S] server:REAL HANDLER (refutes 'unknown-command'). 0x0b04 in LOGISTICS_COMMAND_CODES -> p
- **0x0b05** CommandLoadTroop [C->S] server:REAL HANDLER (refutes 'unknown-command'). 0x0b05 in LOGISTICS_COMMAND_CODES -> p
- **0x0b06** CommandSwitchMode [C->S] server:REAL HANDLER (refutes batch 'NOT handled as a state mutation / unknown-command')
- **0x0b07** NotifyMovedGrid [S->C] server:REAL BUILDER. buildNotifyMovedGridInner (logh7-login-protocol.mjs:1353-1371). Em
- **0x0b08** NotifyLeaveOutGrid [S->C] server:REAL BUILDER (refutes batch 'no server builder/emitter at all'). buildNotifyLeav
- **0x0b09** NotifyEnterGridBegin [S->C] server:REAL BUILDER. buildNotifyEnterGridBeginInner (logh7-login-protocol.mjs:1187-1191
- **0x0b0a** NotifyEnterGridEnd [S->C] server:REAL BUILDER. buildNotifyEnterGridEndInner (logh7-login-protocol.mjs:1193-1196, 
- **0x0b0b** NotifyMovedBase (opcode-index route table mislabels as NotifyGridInformation) [S->C] server:REAL BUILDER (refutes batch 'not handled / no builder'). buildNotifyMovedBaseInn
- **0x0b0c** NotifySuppliedFuel [S->C] server:REAL BUILDER (refutes 'not handled'). buildNotifySuppliedFuelInner (logh7-logist
- **0x0b0d** NotifySearch [S->C] server:REAL BUILDER (refutes 'not handled'). buildNotifySearchInner (logh7-logistics.mj
  NOTES: CRITICAL NAMING CORRECTION (confirmed): opcode-index normalizedOutboundRoutes names (CommandSelectGrid/NotifyGridInformation/CommandGridInformation) are heuristic and DISAGREE with the authoritative client dispatcher strings in FUN_004ba2b0. Ground truth confirmed from each 'X OK' string load: 0xb00=CommandMoveBase(0x0076fd94), 0xb01=CommandMoveGrid(0x0076fd64), 0xb02=CommandSupplyFuel(0x0076fd20)

## 0x0c — Fleet Logistics / Organization commands (兵站・編成; CommandCompleteness*/Reorganization/Supplement/Carrying*/Assignment). NOT a proposal/政策 system. Family identity, all 7 codes, sizes, directions, and server wiring VERIFIED. Two field-offset errors found in the partial layouts (0xc02 moveTroops, 0xc08 troopPackages), two over-claimed array sets trimmed (0xc05, 0xc0b), and the notes' "no proposal system" assertion REFUTED (a separate Suggestion/進言 family exists outside 0x0c).  (7 opcodes)
- **0x0c00** RequestCommandCompletenessRepair (CommandCompletenessRepair; client send symbol unnamed, name from receive-ack/serializer strings) [C->S] server:REAL echo handler (NOT zero-fill). server/src/server/logh7-logistics.mjs:770-782
- **0x0c01** RequestCommandCompletenessSupply (CommandCompletenessSupply) [C->S] server:REAL echo handler. logh7-logistics.mjs:770-782 low-confidence branch: parseInbou
- **0x0c02** RequestCommandReorganization (CommandReorganization) [C->S] server:REAL field-by-field handler (not zero-fill). logh7-logistics.mjs:246-288 parseIn
- **0x0c05** RequestCommandSupplement (CommandSupplement) [C->S] server:REAL echo handler. logh7-logistics.mjs:770-782 low-confidence branch: parseInbou
- **0x0c08** RequestCommandCarryingInOut (CommandCarryingInOut) [C->S] server:REAL field-by-field handler. logh7-logistics.mjs:298-332 parseInboundCarryingInO
- **0x0c0b** RequestCommandAssignment (CommandAssignment) [C->S] server:REAL echo handler. logh7-logistics.mjs:770-782 low-confidence branch: parseInbou
- **0x0c0c** RequestCommandCarryingOut (CommandCarryingOut) [C->S] server:REAL echo handler. logh7-logistics.mjs:770-782 low-confidence branch: parseInbou
  NOTES: FAMILY VERIFIED: the 0x0c family is FLEET LOGISTICS / ORGANIZATION (兵站・編成), NOT proposals. All 7 codes, selectors, sizes, directions and server wiring independently re-confirmed.

SELECTOR->CODE MAP (re-derived from FUN_004b78a0 linear switch AND opcode-index jump table — they AGREE, no artifact): 0x63->0xc00, 0x64->0xc01, 0x65->0xc02, 0x66->0xc05, 0x67->0xc08, 0x68->0xc0c, 0x69->0xc0b. (case inde

## 0x0f world-and-chat (0x0e00, 0x0f00-0x0f1e world/grid-init + mail/messenger/order-suggest + chat, 0x1200/0x1201 transaction)  (33 opcodes)
- **0x0e00** CommandMoveInstitutionSpot (client str s_CommandMoveInstitutionSpot_OK_0076fb64) [both] server:AUTHORITATIVE: server/src/server/logh7-logistics.mjs:339 parseInboundMoveInstitu
- **0x0f00** RequestWorldInitialize (redex str 0x00767634 RequestWorldInitialize; 0x0076761c ResponseWorldInitialize) [C->S] server:generic world-init walk: server/src/server/logh7-login-session.mjs:2418 buildWor
- **0x0f01** ResponseWorldInitialize_OK (client str s_ResponseWorldInitialize_OK_0076fb84) [S->C] server:AUTHORITATIVE OK: server/src/server/logh7-login-protocol.mjs buildWorldDataRespo
- **0x0f02** RequestGridInitialize (redex str 0x00767604 RequestGridInitialize; 0x007675ec ResponseGridInitialize) [C->S] server:AUTHORITATIVE custom: server/src/server/logh7-login-session.mjs:113 SS_REQ_GRID_
- **0x0f03** ResponseGridInitialize_OK (client str s_ResponseGridInitialize_OK_0076fb48) [S->C] server:AUTHORITATIVE OK: buildWorldDataResponseInner(0x0f03) sets body[0]=1 (0x0f03 in 
- **0x0f04** RequestInformationMailAddress (redex str 0x007675cc RequestInformationMailAddress; resp 0x007675ac ResponseInformationMailAddress) [C->S] server:generic world-init walk: login-session.mjs:2418 buildWorldDataResponseInner(0x0f
- **0x0f05** ResponseInformationMailAddress_OK (client str s_ResponseInformationMailAddress_O_0076fb24) [S->C] server:WORLD_RESPONSE_OBJECT_SIZES 0x0f05:0x7214; generic walker zero-fill via buildWor
- **0x0f06** RequestInformationMessengerStatus (redex str 0x00767588 RequestInformationMessengerStatus; resp 0x00767564 ResponseInformationMessengerStatus) [C->S] server:server/src/server/logh7-login-session.mjs:256 SS_REQ_MESSENGER_STAT_CODE=0x0f06 
- **0x0f07** ResponseInformationMessengerStatus_OK (client str s_ResponseInformationMessengerStat_0076fafc) [S->C] server:WORLD_RESPONSE_OBJECT_SIZES 0x0f07:0x74cc; generic walker zero-fill. Not custom.
- **0x0f08** TransactionInformationMailBegin (client str s_TransactionInformationMailBegin_O_0076fad8; base str 0x00767544 TransactionInformationMailBegin). NOTE: opcode-index requestName 'RequestInformationText' is STALE/WRONG vs the client debug string. [C->S] server:generic world-init walk: login-session.mjs:2418 buildWorldDataResponseInner(0x0f
- **0x0f09** TransactionInformationMailEnd_OK (client str s_TransactionInformationMailEnd_OK_0076fab4; base 0x00767524 TransactionInformationMailEnd). opcode-index pairedResponseName 'ResponseInformationText' is stale/misnamed. [S->C] server:generic walker zero/1-byte via buildWorldDataResponseInner(0x0f09) (NOT in WORLD
- **0x0f0b** CommandExchangeMailAddress (client str s_CommandExchangeMailAddress_OK_0076fa94; base 0x007674f0 CommandExchangeMailAddress) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:34 COMMAND_EXCHANGE_MAI
- **0x0f0c** CommandDeleteMailAddress (client str s_CommandDeleteMailAddress_OK_0076fa78; base 0x007674d4 CommandDeleteMailAddress) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:35 + processSocial; rel
- **0x0f0d** CommandMessengerStatus (client str s_CommandMessengerStatus_OK_0076fa5c; base 0x007674bc CommandMessengerStatus) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:36 COMMAND_MESSENGER_ST
- **0x0f0e** CommandMessengerConnection (client str s_CommandMessengerConnection_OK_0076fa3c) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:37 COMMAND_MESSENGER_CO
- **0x0f0f** CommandMessenger (client str s_CommandMessenger_OK_0076fa28) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:38 COMMAND_MESSENGER_CO
- **0x0f10** CommandSendMail (client str s_CommandSendMail_OK_0076fa14) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:44 COMMAND_SEND_MAIL_CO
- **0x0f11** CommandReadMail (client str s_CommandReadMail_OK_0076fa00) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:45 COMMAND_READ_MAIL_CO
- **0x0f12** CommandDeleteMail (client str s_CommandDeleteMail_OK_0076f9e8) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:46 COMMAND_DELETE_MAIL_
- **0x0f13** CommandOrderSuggestMail (client str s_CommandOrderSuggestMail_OK_0076f9cc; base str 0x00767440 CommandOrderSuggestMail). PROPOSAL/進言/提案 system (order-mail flavor). [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:47 COMMAND_ORDER_SUGGES
- **0x0f14** CommandReplyOrderSuggestMail (client str s_CommandReplyOrderSuggestMail_OK_0076f9ac; base 0x00767420 CommandReplyOrderSuggestMail) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:48 COMMAND_REPLY_ORDER_
- **0x0f15** NotifyCommandMail (client str s_NotifyCommandMail_OK_0076f8e4; base 0x0076740c NotifyCommandMail) [S->C] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:49 NOTIFY_COMMAND_MAIL_
- **0x0f16** CommandSetTogether (client str s_CommandSetTogether_OK_0076f994) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:52 + parseInboundSettin
- **0x0f17** CommandSetWillMessage (client str s_CommandSetWillMessage_OK_0076f978) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:53 + parseInboundSettin
- **0x0f18** CommandSetOfflineDirection (client str s_CommandSetOfflineDirection_OK_0076f958) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:54 + parseInboundSettin
- **0x0f19** CommandSetUnitDistributePriority (client str s_CommandSetUnitDistributePriority_0076f934 — note no _OK suffix in the symbol) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:55 + parseInboundSettin
- **0x0f1a** CommandSetReturnBase (client str s_CommandSetReturnBase_OK_0076f91c) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:56 + parseInboundSettin
- **0x0f1b** CommandSetPrivateAccountRate (client str s_CommandSetPrivateAccountRate_OK_0076f8fc) [both] server:AUTHORITATIVE SOCIAL: server/src/server/logh7-social.mjs:57 + parseInboundSettin
- **0x0f1c** CommandChat / CommandGridChat (opcode-index requestName CommandChat; client str s_CommandGridChat_OK_0076f8bc) [both] server:AUTHORITATIVE: server/src/server/logh7-command-engine.mjs:359-400 processCommand
- **0x0f1d** CommandSpotChat (opcode-index requestName CommandSpotChat; client str s_CommandSpotChat_OK_0076f8a8) [both] server:AUTHORITATIVE: routed via command-engine.mjs:684 routeInternalAffairs -> social.
- **0x0f1e** CommandSpotUnicastChat (opcode-index requestName CommandSpotUnicastChat; client str s_CommandSpotUnicastChat_OK_0076f88c) [both] server:AUTHORITATIVE: social.mjs processSocial case COMMAND_SPOT_UNICAST_CHAT_CODE=0x0f
- **0x1200** TransactionSimpleDataBegin (client str s_TransactionSimpleDataBegin_OK_0076f7a0; base 0x0078ab54 TransactionSimpleDataBegin). Task label 'NotifySimpleInformationEnd' is wrong for 0x1200 (it fits the 0x1201 paired-name in the index). [both] server:AUTHORITATIVE builder: server/src/server/logh7-login-protocol.mjs:340 TRANSACTIO
- **0x1201** TransactionSimpleDataEnd (client str s_TransactionSimpleDataEnd_OK_0076f784; base 0x0078ab38 TransactionSimpleDataEnd). opcode-index pairedResponseName labels it 'NotifySimpleInformationEnd' (stale). [both] server:AUTHORITATIVE builder: server/src/server/logh7-login-protocol.mjs:344 TRANSACTIO
  NOTES: PROPOSAL/進言/提案/제안 SYSTEM LOCATION: Within THIS batch it lives in the order-mail pair 0x0f13 CommandOrderSuggestMail (C->S, 612B, selector 0x004f) + 0x0f14 CommandReplyOrderSuggestMail (604B, selector 0x0050), with S->C delivery via 0x0f15 NotifyCommandMail (604B). Server-proven anchors are ONLY targetId@0 + orderId@4 (parseInboundOrderMail social.mjs:258-269); the wide-text note follows (len@8/cha

## 0x10 account-char-mgmt (account / character entitlement / create — RequestInformationAccount 0x1000-0x1001, RequestUnChargeCharacter 0x1002-0x1003, RequestCharacterEntryState 0x1004-0x1005, CommandOriginalCharacterCharge 0x1006, CommandExtensionCharacterCharge 0x1007, CommandGenerateCharacterCharge 0x1008)  (9 opcodes)
- **0x1000** RequestInformationAccount [C->S] server:server/src/server/logh7-login-session.mjs:2102 (REQ_INFO_ACCOUNT_CODE branch) — 
- **0x1001** ResponseInformationAccount [S->C] server:server/src/server/logh7-account.mjs:105 buildResponseInformationAccountInner (RE
- **0x1002** RequestUnChargeCharacter [C->S] server:server/src/server/logh7-login-session.mjs:2114 (REQ_UNCHARGE_CHARACTER_CODE bran
- **0x1003** ResponseUnChargeCharacter [S->C] server:server/src/server/logh7-account.mjs:141 buildResponseUnChargeCharacterInner (RES
- **0x1004** RequestCharacterEntryState [C->S] server:server/src/server/logh7-login-session.mjs:2120 (REQ_CHARACTER_ENTRY_STATE_CODE b
- **0x1005** ResponseCharacterEntryState [S->C] server:server/src/server/logh7-account.mjs:165 buildResponseCharacterEntryStateInner (R
- **0x1006** CommandOriginalCharacterCharge [C->S] server:server/src/server/logh7-login-session.mjs:2139 (CMD_ORIGINAL_CHARGE_CODE branch,
- **0x1007** CommandExtensionCharacterCharge [C->S] server:CORRECTION (was WRONG in batch). parseInboundExtensionCharacterCharge defined at
- **0x1008** CommandGenerateCharacterCharge (= opcode-index 'CommandCreateCharacter') [C->S] server:server/src/server/logh7-login-protocol.mjs:1394 parseGenerateCharacterCharge + b
  NOTES: All six opcodes re-verified against redex (FUN_004b8b00 sizer, FUN_004b78a0 selector table, FUN_004ba2b0 inbound dispatcher), .omo/ghidra/opcode-index.json, and the server source. The CORE wire facts of this batch are SOUND: selector→case→request/response mappings (case8 0x1000/0x1001, case9 0x1001-wire/0x1003, case10 0x1004/0x1005, case0xb/0xc/0xd 0x1006/0x1007/0x1008 fire-and-forget gated), all 

## 0x20 lobby-session (SysLobby/LobbySessionLogin) + GIN7 0x7000 credential login  (10 opcodes)
- **0x7000** RequestLGLogin (GIN7 credential / LoginRequest) [C->S] server:server/src/server/logh7-login-session.mjs ~2696-2709 accountStore.authenticate(i
- **0x7001** ResponseLGLogin / LGLoginOK (lobby redirect) [S->C] server:logh7-login-protocol.mjs:2151-2170 buildRedirectInner; emitted by logh7-login-se
- **0x2000** RequestLogin / LobbyLoginRequest (LobbyLogin, version 4 GIN7) [C->S] server:logh7-login-session.mjs ~1610-1618: on innerCode==LOBBY_LOGIN_REQUEST_CODE phase
- **0x2001** ResponseLogin / LobbyLoginOK [S->C] server:logh7-login-protocol.mjs:52-57 buildLobbyLoginOkInner; emitted logh7-login-sessi
- **0x2003** RequestInformationCharacterCharge / LobbyRequestInformationCharacter (LobbyReqInfoCharacterCharge) [C->S] server:logh7-login-session.mjs:2425-2428: on innerCode==LOBBY_REQ_INFO_CHARACTER_CHARGE
- **0x2004** ResponseSessionList (opcode-index label is WRONG) -- actually LobbyResponseInformationCharacterCharge [S->C] server:logh7-login-protocol.mjs buildLobbyInformationCharacterChargeInner (~:1828-1835,
- **0x2005** RequestInformationSession / LobbyRequestInformationSession (LobbyReqInfoSession) [C->S] server:logh7-login-session.mjs ~2606-2643: requestVariant = innerPayload[2] (readUInt8(
- **0x2006** ResponseSessionLogin (opcode-index label is WRONG) -- actually LobbyResponseInformationSession [S->C] server:scenario-session.mjs:187 buildInformationSessionInner (fixed 0x5304); emitted lo
- **0x2009** CommandSelectSession / LobbySessionLoginRequest [C->S] server:logh7-login-session.mjs ~2645-2688: resolveLobbySessionSelection(requestedSessio
- **0x200a** ResponseSelectSession / LobbySessionLoginOK (world redirect) [S->C] server:logh7-login-protocol.mjs:1675-1691 buildLobbySessionLoginOk{,Message32}Inner; em
  NOTES: VERIFY: I re-ran FUN_004b78a0 (selector table), FUN_004ba2b0 (inbound dispatcher), FUN_004b8b00 (receive sizer), the four conn2 senders (FUN_0051bde0/be60/bea0/00593cf0), FUN_0043f830, FUN_0043fd60, FUN_00444900, the opcode-index normalizedOutboundRoutes, and the server protocol/session sources. Selector-table cases 0-7 and all dispatcher copy-counts/offsets/flags VERIFIED exactly as the batch sta


