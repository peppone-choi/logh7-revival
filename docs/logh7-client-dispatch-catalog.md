# LOGH VII 클라이언트 메시지 디스패처 정본 카탈로그

> **소스:** g7mtclient.exe (sha256 9c97de2a…bb51), ImageBase 0x400000. 실바이트 정적분석(capstone).  
> **디스패처:** `FUN_004ba2b0` = `RobotImp::handle_message` — 클라이언트 **inbound** 메시지 핸들러.  
> 코드→핸들러는 0x4ba316의 중첩 이진탐색 트리(12개 범위 점프테이블 @0x4bde7c~0x4be324 + 23개 단일 `je` 피벗)로 라우팅.  
> 미등록 코드는 default `0x4bdcee`(→ `handle_message unsupported message = 0x%X` 로그).  
> **라벨 신뢰도: 높음** — 각 핸들러가 로거 `FUN_005923a0`에 넘기는 개발자 원본 메시지명 문자열에서 추출.

**전체 등록 코드 185개, 고유 핸들러 185개(1:1, 별칭 없음). 서버 참조 50 / 미참조 135.**

- **방향 주의:** 이 표는 클라가 *수신*하는 코드 집합이다. `Command*`는 원래 C→S(클라 발신)지만, 클라가 수신 핸들러를 가진다 = 서버가 권위적으로 되쏘는(relay/broadcast) 모델. 서버는 (1) 클라로부터 `Command*`를 **받아** 처리하고 (2) 결과를 `Notify*`/`Response*`로 **되쏜다**. `Response*`/`Notify*`/`SS*`/`Lobby*`는 순수 S→C.

| 범례 | 서버구현 |
|---|---|
| ✅=서버 코드가 이 상수 참조 | ❌=미참조(구현 로드맵 대상) |


## A. 로그인·게이트웨이 세션·글로벌채팅

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0201` | SSLoginOK | 0x004ba347 | Session | ✅ |
| `0x0202` | SSLoginNG | 0x004ba382 | Session | ✅ |
| `0x0204` | SSCharacterIDResponce | 0x004ba3dd | Session | ✅ |
| `0x0206` | SSGameLoginOK | 0x004ba3af | Session | ✅ |
| `0x0207` | GlobalChat | 0x004ba405 | Chat | ❌ |
| `0x7001` | LGLoginOK | 0x004bdca6 | Session | ✅ |
| `0x7002` | LGLoginNG | 0x004bdcfe | Session | ✅ |

## B. 시간·월드 기본

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0301` | ResponseTime | 0x004ba457 | Response | ✅ |

## C. 월드진입 정적정보 로드 (static-info)

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0305` | ResponseStaticInformationCard | 0x004bad1a | Response | ✅ |
| `0x0307` | ResponseStaticInformationCardCommand | 0x004bad47 | Response | ✅ |
| `0x0309` | ResponseStaticInformationPowerDistribution | 0x004baeb9 | Response | ✅ |
| `0x030b` | ResponseStaticInformationUnitShip | 0x004baee4 | Response | ✅ |
| `0x030d` | ResponseStaticInformationUnitTroop | 0x004bb0db | Response | ✅ |
| `0x030f` | ResponseStaticInformationFighters | 0x004bacc4 | Response | ✅ |
| `0x0311` | ResponseStaticInformationArms | 0x004bac99 | Response | ✅ |
| `0x0313` | ResponseStaticInformationGridType | 0x004bae37 | Response | ✅ |
| `0x0315` | ResponseStaticInformationGrid | 0x004badfd | Response | ✅ |
| `0x0317` | ResponseInformationGrid | 0x004babcc | Response | ✅ |
| `0x031d` | ResponseStaticInformationBase | 0x004bacef | Response | ✅ |
| `0x031f` | ResponseInformationBase | 0x004bae63 | Response | ✅ |
| `0x0321` | ResponseInformationInstitution | 0x004bae8e | Response | ✅ |

## D. 캐릭터/함대/창고/편성 정보

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0323` | ResponseInformationCharacter | 0x004ba560 | Response | ✅ |
| `0x0325` | ResponseInformationUnit | 0x004bb110 | Response | ✅ |
| `0x0327` | ResponseInformationWarehouse | 0x004bab96 | Response | ❌ |
| `0x0329` | ResponseInformationPackage | 0x004bac6e | Response | ❌ |
| `0x032b` | ResponseInformationOutfit | 0x004bab4e | Response | ❌ |
| `0x032d` | ResponseGridInformationOutfit | 0x004bac18 | Response | ❌ |
| `0x032f` | ResponseInformationOutfitParty | 0x004babed | Response | ❌ |
| `0x0331` | ResponseOutfitInformationUnit | 0x004bac43 | Response | ❌ |
| `0x034f` | ResponseCardCharacter | 0x004bb220 | Response | ✅ |

## E. 전술 정보·위치 (전투맵 배치)

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0337` | ResponseTacticsCharacter | 0x004bb17e | Response | ❌ |
| `0x033b` | ResponseTacticsInformationUnitShip | 0x004bb1a9 | Response | ✅ |
| `0x033f` | ResponseTacticsInformationCorps | 0x004bb518 | Response | ❌ |
| `0x0341` | ResponseTacticsInformationFillShield | 0x004bb543 | Response | ❌ |
| `0x0345` | ResponseTacticsInformationBase | 0x004bb4c2 | Response | ❌ |
| `0x0347` | InformationObstacle | 0x004bb4ed | Info | ❌ |
| `0x0349` | ResponsePositionUnit | 0x004bb56e | Response | ❌ |
| `0x034b` | ResponsePositionBase | 0x004bb5a4 | Response | ❌ |

## F. 정보변경 알림

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0356` | NotifyInformationCharacter | 0x004bbdc0 | Notify | ❌ |
| `0x0358` | NotifyChangeFlagShip | 0x004bbfb9 | Notify | ❌ |
| `0x0359` | NotifyInformationOutfit | 0x004bbd8b | Notify | ❌ |
| `0x035a` | NotifyEnding | 0x004bbb9d | Notify | ❌ |

## G. 함대·함선·요새 명령 (전술/전투 C→S)

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0400` | CommandMoveShip | 0x004bb5d9 | Command | ❌ |
| `0x0401` | CommandTurnShip | 0x004bb63a | Command | ❌ |
| `0x0402` | CommandParallelMoveShip | 0x004bb670 | Command | ❌ |
| `0x0403` | CommandReverseShip | 0x004bb840 | Command | ❌ |
| `0x0404` | CommandWarpShip | 0x004bb86a | Command | ❌ |
| `0x0405` | CommandAttackShip | 0x004bb767 | Command | ❌ |
| `0x0406` | CommandShootShip | 0x004bb79d | Command | ❌ |
| `0x0407` | CommandFight | 0x004bb8a0 | Command | ❌ |
| `0x0408` | CommandSuggestion | 0x004bbb73 | Command | ❌ |
| `0x0409` | CommandEncourageFlagship | 0x004bb90d | Command | ❌ |
| `0x040a` | CommandStop | 0x004bb610 | Command | ❌ |
| `0x040b` | CommandAdmission | 0x004bbabf | Command | ❌ |
| `0x040c` | CommandControl | 0x004bb7d4 | Command | ❌ |
| `0x040d` | CommandFileFleet | 0x004bb80a | Command | ❌ |
| `0x040e` | CommandAirBattle | 0x004bb8d6 | Command | ❌ |
| `0x040f` | CommandSortieTroops | 0x004bb6d1 | Command | ❌ |
| `0x0410` | CommandEvacuateTroops | 0x004bb731 | Command | ❌ |
| `0x0411` | CommandChangeMode | 0x004bb6a7 | Command | ❌ |
| `0x0412` | CommandSortie | 0x004bb707 | Command | ❌ |
| `0x0413` | CommandRepairFleet | 0x004bb92b | Command | ❌ |
| `0x0414` | CommandSupplyFleet | 0x004bb962 | Command | ❌ |
| `0x0419` | CommandShootFortress | 0x004bb998 | Command | ❌ |
| `0x041a` | CommandAdmissionBase | 0x004bbae9 | Command | ❌ |
| `0x041b` | CommandRepairBase | 0x004bb9ce | Command | ❌ |
| `0x041c` | CommandSupplyBase | 0x004bb9f8 | Command | ❌ |
| `0x041d` | CommandEncourageBase | 0x004bba22 | Command | ❌ |
| `0x041e` | CommandStopBase | 0x004bba40 | Command | ❌ |
| `0x041f` | CommandMoveFortress | 0x004bba5e | Command | ❌ |
| `0x0420` | CommandChangeAuthority | 0x004bbb13 | Command | ❌ |
| `0x0421` | CommandMission | 0x004bbb49 | Command | ❌ |
| `0x0422` | CommandEmergencySupply | 0x004bba95 | Command | ❌ |

## H. 전투·이동 결과 알림 (S→C 푸시)

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0423` | NotifyMovedShip | 0x004bbfef | Notify | ❌ |
| `0x0424` | NotifyTurnedShip | 0x004bc1d4 | Notify | ❌ |
| `0x0425` | NotifyWarpedShip | 0x004bc3f7 | Notify | ❌ |
| `0x0426` | NotifyAttackedShip | 0x004bc2cf | Notify | ❌ |
| `0x0427` | NotifyFought | 0x004bc42d | Notify | ❌ |
| `0x0428` | NotifyAirBattle | 0x004bc46a | Notify | ❌ |
| `0x0429` | NotifyMovedTroop | 0x004bc19e | Notify | ❌ |
| `0x042a` | NotifyLandCombat | 0x004bc32d | Notify | ❌ |
| `0x042c` | NotifyEncourageFlagship | 0x004bc49f | Notify | ❌ |
| `0x042d` | NotifyRepairFleet | 0x004bc4ca | Notify | ❌ |
| `0x042e` | NotifySupplyFleet | 0x004bc507 | Notify | ❌ |
| `0x042f` | NotifyChangeMode | 0x004bc169 | Notify | ❌ |
| `0x0431` | NotifyTacticsChiefCommander | 0x004bc304 | Notify | ❌ |
| `0x0432` | NotifyEncourageBase | 0x004bc399 | Notify | ❌ |
| `0x0433` | NotifyRepairBase | 0x004bc591 | Notify | ❌ |
| `0x0434` | NotifySupplyBase | 0x004bc5a9 | Notify | ❌ |
| `0x0435` | NotifyMovedFortress | 0x004bc364 | Notify | ❌ |
| `0x0436` | NotifyShootFortress | 0x004bc544 | Notify | ❌ |
| `0x0437` | NotifySortie | 0x004bc10c | Notify | ❌ |
| `0x0438` | NotifyEmergencySupplyBase | 0x004bc3c4 | Notify | ❌ |
| `0x0439` | NotifyChangedAuthority | 0x004bc0d7 | Notify | ❌ |
| `0x043a` | NotifyCharacterAchievement | 0x004bc04a | Notify | ❌ |
| `0x043b` | NotifyOutfitAchievement | 0x004bc07a | Notify | ❌ |
| `0x043c` | NotifyMissionResult | 0x004bc29c | Notify | ❌ |
| `0x043d` | NotifyConfusionUnit | 0x004bc242 | Notify | ❌ |
| `0x043e` | NotifyConfusionRecoveredUnit | 0x004bc26f | Notify | ❌ |
| `0x043f` | NotifyShootBase | 0x004bc579 | Notify | ❌ |
| `0x0440` | NotifyMoraleDown | 0x004bc20b | Notify | ❌ |
| `0x0441` | NotifyBlackHoleSuction | 0x004bc142 | Notify | ❌ |
| `0x0442` | NotifyFinishOccupation | 0x004bc0aa | Notify | ❌ |

## I. 유효성

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0500` | NotifyInvalidMessage | 0x004bc5dc | Notify | ❌ |

## J. 인사·전략계획·편성

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0706` | CommandRankDown | 0x004bc85c | Command | ❌ |
| `0x0709` | CommandCardResignation | 0x004bc90d | Command | ❌ |
| `0x0900` | CommandMakePlan | 0x004bc9d6 | Command | ❌ |
| `0x0903` | CommandCreateOutfit | 0x004bca87 | Command | ❌ |
| `0x0906` | CommandDeleteOutfit | 0x004bcb57 | Command | ❌ |
| `0x0908` | NotifyFinishStrategyPlan | 0x004bcbd6 | Notify | ❌ |

## K. 그리드/기지 유닛 명령·알림

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0b01` | CommandMoveGrid | 0x004bcbf1 | Command | ✅ |
| `0x0b02` | CommandSupplyFuel | 0x004bcca9 | Command | ❌ |
| `0x0b03` | CommandSearch | 0x004bccdf | Command | ❌ |
| `0x0b04` | CommandUnloadTroop | 0x004bcc3c | Command | ❌ |
| `0x0b05` | CommandLoadTroop | 0x004bcc72 | Command | ❌ |
| `0x0b06` | CommandSwitchMode | 0x004bcd15 | Command | ❌ |
| `0x0b07` | NotifyMovedGrid | 0x004bcf4f | Notify | ✅ |
| `0x0b08` | NotifyLeaveOutGrid | 0x004bcf19 | Notify | ❌ |
| `0x0b09` | NotifyEnterGridBegin | 0x004bce43 | Notify | ✅ |
| `0x0b0a` | NotifyEnterGridEnd | 0x004bce66 | Notify | ✅ |
| `0x0b0b` | NotifyMovedBase | 0x004bcf83 | Notify | ❌ |
| `0x0b0c` | NotifySuppliedFuel | 0x004bce0e | Notify | ❌ |
| `0x0b0d` | NotifySearch | 0x004bcee4 | Notify | ❌ |

## L. 보급·재편·시설

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0c00` | CommandCompletenessRepair | 0x004bcda2 | Command | ❌ |
| `0x0c01` | CommandCompletenessSupply | 0x004bcdd8 | Command | ❌ |
| `0x0c02` | CommandReorganization | 0x004bcd6b | Command | ❌ |
| `0x0c05` | CommandSupplement | 0x004bcfb7 | Command | ❌ |
| `0x0c0c` | CommandCarryingOut | 0x004bd08d | Command | ❌ |
| `0x0e00` | CommandMoveInstitutionSpot | 0x004bd0ea | Command | ❌ |

## M. 메일·메신저·설정·그리드채팅

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x0f03` | ResponseGridInitialize | 0x004bd121 | Response | ✅ |
| `0x0f05` | ResponseInformationMailAddress | 0x004bd157 | Response | ✅ |
| `0x0f07` | ResponseInformationMessengerStatus | 0x004bd18c | Response | ✅ |
| `0x0f08` | TransactionInformationMailBegin | 0x004bd1c2 | Txn | ✅ |
| `0x0f09` | TransactionInformationMailEnd | 0x004bd1f7 | Txn | ✅ |
| `0x0f0a` | TransactionInformationMailEnd | 0x004bd222 | Txn | ❌ |
| `0x0f0b` | CommandExchangeMailAddress | 0x004bd26c | Command | ❌ |
| `0x0f0c` | CommandDeleteMailAddress | 0x004bd297 | Command | ❌ |
| `0x0f0d` | CommandMessengerStatus | 0x004bd2c2 | Command | ❌ |
| `0x0f0e` | CommandMessengerConnection | 0x004bd2ed | Command | ❌ |
| `0x0f0f` | CommandMessenger | 0x004bd318 | Command | ❌ |
| `0x0f10` | CommandSendMail | 0x004bd343 | Command | ❌ |
| `0x0f11` | CommandReadMail | 0x004bd36e | Command | ❌ |
| `0x0f12` | CommandDeleteMail | 0x004bd399 | Command | ❌ |
| `0x0f13` | CommandOrderSuggestMail | 0x004bd3c4 | Command | ❌ |
| `0x0f14` | CommandReplyOrderSuggestMail | 0x004bd407 | Command | ❌ |
| `0x0f15` | NotifyCommandMail | 0x004bd55b | Notify | ❌ |
| `0x0f16` | CommandSetTogether | 0x004bd47f | Command | ❌ |
| `0x0f17` | CommandSetWillMessage | 0x004bd4b9 | Command | ❌ |
| `0x0f18` | CommandSetOfflineDirection | 0x004bd4e3 | Command | ❌ |
| `0x0f19` | CommandSetUnitDistributePriority | 0x004bd501 | Command | ❌ |
| `0x0f1a` | CommandSetReturnBase | 0x004bd51f | Command | ❌ |
| `0x0f1b` | CommandSetPrivateAccountRate | 0x004bd53d | Command | ❌ |
| `0x0f1c` | CommandGridChat | 0x004bd5be | Command | ✅ |
| `0x0f1d` | CommandSpotChat | 0x004bd5f2 | Command | ❌ |
| `0x0f1e` | CommandSpotUnicastChat | 0x004bd626 | Command | ❌ |
| `0x0f1f` | NotifyTactics | 0x004bd591 | Notify | ❌ |

## N. 계정·캐릭터 과금·엔트리

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x1001` | ResponseInformationAccount | 0x004bd65b | Response | ✅ |
| `0x1003` | ResponseUnChargeCharacter | 0x004bd6ac | Response | ✅ |
| `0x1005` | ResponseCharacterEntryState | 0x004bd6d7 | Response | ✅ |
| `0x1006` | CommandOriginalCharacterCharge | 0x004bd702 | Command | ✅ |
| `0x1007` | CommandExtensionCharacterCharge | 0x004bd739 | Command | ✅ |
| `0x1008` | CommandGenerateCharacterCharge | 0x004bd767 | Command | ✅ |

## O. Simple 벌크 스냅샷 (Transaction/NotifySimple*)

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x1200` | TransactionSimpleDataBegin | 0x004bd79e | Txn | ✅ |
| `0x1201` | TransactionSimpleDataEnd | 0x004bd7fa | Txn | ✅ |
| `0x1202` | NotifySimpleInformationCharacter | 0x004bd825 | Notify | ❌ |
| `0x1203` | NotifySimpleInformationOutfit | 0x004bd890 | Notify | ❌ |
| `0x1204` | NotifySimpleInformationBase | 0x004bd8c5 | Notify | ❌ |
| `0x1205` | NotifySimpleInformationGrid | 0x004bdadd | Notify | ❌ |
| `0x1206` | NotifySimpleInformationStrategy | 0x004bd968 | Notify | ❌ |
| `0x1207` | NotifySimpleInformationUnit | 0x004bd99d | Notify | ❌ |
| `0x1208` | NotifySimpleInformationCard | 0x004bd8fa | Notify | ❌ |
| `0x1209` | NotifySimpleInformationRank | 0x004bd930 | Notify | ❌ |
| `0x120a` | NotifySimpleInformationRankingCharacter | 0x004bd9d3 | Notify | ❌ |
| `0x120b` | NotifySimpleInformationCompletenessSupplyOutfit | 0x004bda08 | Notify | ❌ |
| `0x120c` | NotifySimpleInformationCardAvailableOutfitSeat | 0x004bda3d | Notify | ❌ |
| `0x120d` | NotifySimpleInformationCardAvailableBaseSeat | 0x004bda73 | Notify | ❌ |
| `0x120e` | NotifySimpleInformationOrderSuggestCharacter | 0x004bdaa8 | Notify | ❌ |
| `0x120f` | NotifySimpleInformationCharacterEntry | 0x004bd85a | Notify | ✅ |

## P. 로비 세션

| code | 메시지명 | 핸들러 VA | 역할 | 서버 |
|---|---|---|---|:--:|
| `0x2000` | LobbyLoginRequest | 0x004bdb13 | Lobby | ✅ |
| `0x2001` | LobbyLoginOK | 0x004bdb70 | Lobby | ✅ |
| `0x2002` | LobbyLoginNG | 0x004bdb9e | Lobby | ✅ |
| `0x2004` | LobbyResponseInformationCharacterCharge | 0x004bdbd8 | Lobby | ✅ |
| `0x2006` | LobbyResponseInformationSession | 0x004bdc03 | Lobby | ✅ |
| `0x200a` | LobbySessionLoginOK | 0x004bdc2e | Lobby | ✅ |
| `0x200b` | LobbySessionLoginNG | 0x004bdc6c | Lobby | ✅ |

---

## 구현 로드맵 — 동작시키려면 서버가 채워야 할 코드

> `✅`는 서버 소스가 해당 상수를 *참조*한다는 뜻일 뿐 정상 emit을 보증하지 않는다(정의만 되고 미사용인 상수 존재 가능 — 실제 emit은 검증 필요). 아래는 `❌`(미참조) 중심 우선순위.

현재 상태: 로그인→로비→월드진입→**전략맵 렌더까지 동작**(static-info 로드 A~C군 + 그리드 대부분 구현). 다음 기능들이 미구현.

### P1 · 전술·전투 실행 (핵심 게임플레이)  `0x0400-0x0442`
- 미구현 **61 / 61**. 함대·함선·요새 명령(Command*)과 그 결과 알림(Notify*). 클라가 함대를 움직이고 싸우려면 서버가 Command*를 받아 권위적으로 시뮬레이션하고 Notify*로 되쏴야 한다. 전략맵 렌더 다음의 최우선 기능.
- 대상: `0x0400` CommandMoveShip, `0x0401` CommandTurnShip, `0x0402` CommandParallelMoveShip, `0x0403` CommandReverseShip, `0x0404` CommandWarpShip, `0x0405` CommandAttackShip, `0x0406` CommandShootShip, `0x0407` CommandFight, `0x0408` CommandSuggestion, `0x0409` CommandEncourageFlagship, `0x040a` CommandStop, `0x040b` CommandAdmission … (+49)

### P1 · 유닛/편성/전술 정보 완성  `0x0327-0x034f`
- 미구현 **13 / 15**. 창고·편성(Outfit)·전술정보·위치. 유닛 상세 패널과 전투맵 배치가 이 응답에 의존. static-info 로드의 남은 절반.
- 대상: `0x0327` ResponseInformationWarehouse, `0x0329` ResponseInformationPackage, `0x032b` ResponseInformationOutfit, `0x032d` ResponseGridInformationOutfit, `0x032f` ResponseInformationOutfitParty, `0x0331` ResponseOutfitInformationUnit, `0x0337` ResponseTacticsCharacter, `0x033f` ResponseTacticsInformationCorps, `0x0341` ResponseTacticsInformationFillShield, `0x0345` ResponseTacticsInformationBase, `0x0347` InformationObstacle, `0x0349` ResponsePositionUnit … (+1)

### P2 · Simple 벌크 스냅샷 (로스터/랭킹 갱신)  `0x1200-0x120f`
- 미구현 **13 / 16**. Transaction*Begin/End로 감싸는 경량 정보 배치 푸시(캐릭터/함대/기지/그리드/전략/랭킹). 월드 상태 주기 갱신·목록 UI.
- 대상: `0x1202` NotifySimpleInformationCharacter, `0x1203` NotifySimpleInformationOutfit, `0x1204` NotifySimpleInformationBase, `0x1205` NotifySimpleInformationGrid, `0x1206` NotifySimpleInformationStrategy, `0x1207` NotifySimpleInformationUnit, `0x1208` NotifySimpleInformationCard, `0x1209` NotifySimpleInformationRank, `0x120a` NotifySimpleInformationRankingCharacter, `0x120b` NotifySimpleInformationCompletenessSupplyOutfit, `0x120c` NotifySimpleInformationCardAvailableOutfitSeat, `0x120d` NotifySimpleInformationCardAvailableBaseSeat … (+1)

### P2 · 정보변경 알림  `0x0356-0x035a`
- 미구현 **4 / 4**. 기함변경·편성정보·엔딩 등 상태변경 푸시. 전투/편성과 연동.
- 대상: `0x0356` NotifyInformationCharacter, `0x0358` NotifyChangeFlagShip, `0x0359` NotifyInformationOutfit, `0x035a` NotifyEnding

### P2 · 전략계획·인사·편성 명령  `0x0706-0x0c0c`
- 미구현 **20 / 24**. MakePlan/CreateOutfit/DeleteOutfit/RankDown/보급·재편. 전략 레이어와 부대 관리.
- 대상: `0x0706` CommandRankDown, `0x0709` CommandCardResignation, `0x0900` CommandMakePlan, `0x0903` CommandCreateOutfit, `0x0906` CommandDeleteOutfit, `0x0908` NotifyFinishStrategyPlan, `0x0b02` CommandSupplyFuel, `0x0b03` CommandSearch, `0x0b04` CommandUnloadTroop, `0x0b05` CommandLoadTroop, `0x0b06` CommandSwitchMode, `0x0b08` NotifyLeaveOutGrid … (+8)

### P2 · 그리드/기지 유닛 명령·알림  `0x0b02-0x0b0d`
- 미구현 **9 / 12**. 그리드 이동/보급/수색/상륙 명령과 알림(0x0b01/07/09/0a만 서버 참조). 기지·그리드 상호작용.
- 대상: `0x0b02` CommandSupplyFuel, `0x0b03` CommandSearch, `0x0b04` CommandUnloadTroop, `0x0b05` CommandLoadTroop, `0x0b06` CommandSwitchMode, `0x0b08` NotifyLeaveOutGrid, `0x0b0b` NotifyMovedBase, `0x0b0c` NotifySuppliedFuel, `0x0b0d` NotifySearch

### P3 · 채팅 (소셜)  `0x0207 / 0x0f1c-0x0f1e`
- 미구현 **3 / 4**. GlobalChat·GridChat·SpotChat·SpotUnicastChat. 0x0f1c만 서버 참조. 멀티플레이 소셜.
- 대상: `0x0207` GlobalChat, `0x0f1d` CommandSpotChat, `0x0f1e` CommandSpotUnicastChat

### P3 · 메일·메신저·개인설정  `0x0f05-0x0f1b`
- 미구현 **18 / 22**. 메일 송수신/메신저/오프라인지시/개인계좌율 등 비동기 통신·설정.
- 대상: `0x0f0a` TransactionInformationMailEnd, `0x0f0b` CommandExchangeMailAddress, `0x0f0c` CommandDeleteMailAddress, `0x0f0d` CommandMessengerStatus, `0x0f0e` CommandMessengerConnection, `0x0f0f` CommandMessenger, `0x0f10` CommandSendMail, `0x0f11` CommandReadMail, `0x0f12` CommandDeleteMail, `0x0f13` CommandOrderSuggestMail, `0x0f14` CommandReplyOrderSuggestMail, `0x0f15` NotifyCommandMail … (+6)

### P3 · 시설  `0x0e00`
- 미구현 **1 / 1**. CommandMoveInstitutionSpot — 기지 시설 배치.
- 대상: `0x0e00` CommandMoveInstitutionSpot


---

## 부록 — 디스패치 트리 기하 (재현·검증용)

`FUN_004ba2b0` (`RobotImp::handle_message`) 진입 후 `code = param[+8] & 0xffff`. 코드값을 `jg`/`je`로 분기하는 중첩 이진탐색. 각 leaf 범위는 `add eax, -base; cmp eax, N; ja default(0x4bdcee); jmp [.. *4 + table]` (일부는 `movzx cl, [idxtable + eax]` byte-index 경유). 단일 코드는 `je`로 직행.

| 점프테이블 VA | base code | count | byte-index 테이블 | 등록수 |
|---|---|---|---|---|
| 0x4bde7c | 0x0201 | 7 | - | 5 |
| 0x4bde98 | 0x0305 | 51 | 0x4bdef4 | 22 |
| 0x4bdf28 | 0x033f | 228 | 0x4bdfd4 | 42 |
| 0x4be0b8 | 0x0424 | 31 | - | 29 |
| 0x4be134 | 0x0b02 | 4 | - | 4 |
| 0x4be144 | 0x0b07 | 252 | 0x4be170 | 10 |
| 0x4be26c | 0x0f05 | 5 | - | 4 |
| 0x4be280 | 0x0f0b | 9 | - | 9 |
| 0x4be2a4 | 0x0f15 | 11 | - | 11 |
| 0x4be2d0 | 0x1003 | 6 | - | 5 |
| 0x4be2e8 | 0x1201 | 15 | - | 15 |
| 0x4be324 | 0x2001 | 11 | - | 6 |

단일 `je` 피벗 23개: 0x0301, 0x033b, 0x0423, 0x0500, 0x0706, 0x0709, 0x0900, 0x0903, 0x0906, 0x0908, 0x0b01, 0x0b06, 0x0c05, 0x0c0c, 0x0e00, 0x0f03, 0x0f0a, 0x0f14, 0x1001, 0x1200, 0x2000, 0x7001, 0x7002.

관련 좌표(기존 확정): 코드-라우터(0x0030 body) 0x4ae0d0, `mpsCTMsg32ParseSystem::parse_message` 0x403e30, 미등록 로그 "handle_message unsupported message = 0x%X" @0x76bfe4. 로그 함수 `FUN_005923a0`(각 핸들러가 메시지명 문자열을 넘김 → 라벨 소스).
