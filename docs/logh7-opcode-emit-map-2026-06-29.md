# LOGH VII Opcode Emit Master Map (2026-06-29)

목적: 클라이언트 inbound 디스패처(`FUN_004ba2b0`)가 처리하는 **S→C 옵코드**에 대해, 부활
서버가 실제로 그 레코드를 **빌드(builder)** 하고 **송신(emit)** 하는지를 옵코드 단위로 고정한
마스터 표 + 안전 구현 가능 옵코드의 우선순위 배선 백로그.

권위 출처:
- 클라 핸들러/소비자/사이즈: `FUN_004ba2b0`(inbound dispatcher), `FUN_004b8b00`(sizer),
  `consumers.txt`, `sizetable.txt` (redex/Ghidra export, 입력 행에 인용).
- 서버 빌더/emit: `server/src/server/*.mjs` 직접 확인(본 문서 작성 중 grep/read로 검증).
  입력 행의 `session.mjs`=`logh7-login-session.mjs`, `account.mjs`=`logh7-account.mjs`,
  `login-protocol.mjs`=`logh7-login-protocol.mjs`, `auth-server.mjs`=`logh7-auth-server.mjs`,
  `command-engine.mjs`=`logh7-command-engine.mjs`로 매핑됨.
- 기존 교차표: `docs/logh7-opcode-coverage-crossmap-2026-06-28.md`,
  `docs/logh7-opcode-reference-2026-06-28.md`.

## 정직 원칙 / 본 문서가 입력 행에서 수정한 점 (no-fabrication)

입력 행은 그룹별 검증이 모두 `_verify: partial`이며, **8개 그룹은 신뢰도를 낮춰** 반영한다.
작성 중 서버 소스를 직접 확인해 입력 행의 다음 주장을 **정정**했다(과장 금지):

1. **0x1202–0x120e SimpleInformation 군(群)** — 입력 행은 `serverBuilder: none`,
   `emitStatus: missing`로 적었으나 **틀렸다.** 빌더가 전부 존재한다:
   `server/src/server/codec/simple-info.mjs`(=`logh7-simple-info.mjs` 재수출).
   - `buildNotifySimpleInfoCharacterInner`(0x1202), `...OutfitInner`(0x1203),
     `...BaseInner`(0x1204), `...GridInner`(0x1205), `...StrategyInner`(0x1206),
     `...UnitInner`(0x1207), `...CardInner`(0x1208), `...RankInner`(0x1209),
     `...RankingCharacterInner`(0x120a), `...CompletenessSupplyOutfitInner`(0x120b),
     `...CardAvailableOutfitSeatInner`(0x120c), `...CardAvailableBaseSeatInner`(0x120d),
     `...OrderSuggestCharacterInner`(0x120e). 사이즈표 `SIMPLE_INFO_SPECS`(simple-info.mjs:76)는
     입력 행의 body 크기(0xe104/0x2264/0x1c24/0x324/0x644/0x12c4/0xe14/0x2b/0x73a4/0x3cf4 등)와
     **일치**한다 → 따라서 "missing 빌더"가 아니라 **stub**(빌더 있음, emit 미배선)이다.
   - 단 **0x1202 character만** 실제 emit 경로가 있다: `buildSimpleInfoTransaction({ character })`가
     `logh7-login-session.mjs:2069`에서 호출됨. 그러나 이 호출은
     `postloadRichCharacterEnabled() && postloadSimpleInfoEnabled()` opt-in 플래그 뒤에 있고
     `character` kind 한 종류만 스테이징한다 → **conditional/stub-to-implemented**로 분류.
   - 0x1203–0x120e: 빌더만 있고 어디서도 `state.add(kind, ...)` 스테이징/emit 안 됨 → **stub**.
2. 입력 행이 `implemented`로 적은 P0 로그인 핸드셰이크(0x201/0x204/0x206/0x1201/0x120f,
   그리고 builder만 있던 0x1003/0x1005)는 emit 사이트까지 **직접 재확인됨**(아래 표 근거 컬럼).
3. 빌더 존재를 emit으로 과장하지 않는다. "builder 있음 / emit 없음"은 항상 **stub**.
4. P2/P3 레이아웃 추론을 P0로 승격하지 않는다. SimpleInfo 군 레이아웃 신뢰도는 입력대로 P1~P2 유지.

emitStatus 값 정의:
- **implemented** = 빌더 존재 + 무조건(또는 정상 플로우) emit 확인.
- **conditional** = 빌더 존재 + emit 있으나 opt-in env 플래그 뒤(기본 OFF).
- **stub** = 빌더 존재, emit(스테이징) 미배선.
- **missing** = 빌더 자체 없음.
- **client-to-server** = C→S 명령(서버 emit 불필요); 디스패처 case는 클라 자기-에코 렌더.

---

## 마스터 표 — S→C 옵코드 emit 맵

컬럼: opcode | name | size | handler(client) | consumer(client) | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction

### 그룹 A — 0x02 세션 부트스트랩 (SS 로그인 / 캐릭터-ID / 게임-로그인 핸드셰이크)

| opcode | name | size | handler | consumer | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction |
|---|---|---|---|---|---|---|---|---|---|
| 0x201 | SSLoginOK | 1 | FUN_004ba2b0 c.0x201 → clientBase+0x35f252; flags +0x358375=1,+0x35837d=1 | SS-login FSM 진행 게이트 | `buildSsLoginOkInner` login-protocol.mjs:1734 (+Message32:1772) | implemented | P0 | high | none — emit session.mjs:1711 (ss-response, on SS_LOGIN_REQUEST) |
| 0x202 | SSLoginNG | 0x102 | FUN_004ba2b0 c.0x202 → clientBase+0x35f254 (reject text) | 로그인 실패 다이얼로그 텍스트 | none (const `SS_LOGIN_NG_CODE`=0x0202 login-protocol.mjs:142 있음, 빌더·emit 없음) | missing | P1 | low | 서버는 항상 OK(0x201) 송신 → NG 거부 UX 필요할 때만 `buildSsLoginNgInner` 추가(login-protocol.mjs:1734 근처) |
| 0x204 | SSCharacterIDResponce | 4 | FUN_004ba2b0 c.0x204 → clientBase+0x3584a0; DAT_007c25f8=1 (active char id) | tail 3075/3084 per-char notify 라우팅 | `buildSsCharacterIdResponseInner` login-protocol.mjs:213 | implemented | P0 | high | none — emit session.mjs:1721/1901/2036 (be) activeCharacterId |
| 0x206 | SSGameLoginOK | 1 | FUN_004ba2b0 c.0x206 → clientBase+0x358384; flag +0x35837e=1 | game-login FSM (world-entry) 게이트 | `buildSsGameLoginOkInner` login-protocol.mjs:1738 (+Message32:1776) | implemented | P0 | high | none — emit session.mjs:1718 (ss-response, on SS_GAME_LOGIN_REQUEST) |
| 0x207 | GlobalChat | 0x108 | FUN_004ba2b0 c.0x207 → clientBase+0x43d14c; FUN_004be6c0 | FUN_004be6c0→FUN_005ff2c9/FUN_004be6f0 글로벌챗 표시 | none (서버는 GridChat 0x0f1c `buildCommandGridChatInner`:1528만; 이 글로벌챗 옵코드 없음) | missing | P1 | med | `buildGlobalChatInner`(0x207,0x108B: u32 id@0, CP949 msg@+6) 추가 후 글로벌(비-grid) 채널 원할 때 auth-server.mjs ~2124 relay에서 emit |

### 그룹 B — 0x10 어카운트 / 캐릭터 과금·생성 (lobby account)

| opcode | name | size | handler | consumer | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction |
|---|---|---|---|---|---|---|---|---|---|
| 0x1003 | ResponseUnChargeCharacter | 0xfa4 | FUN_004ba2b0 c.0x1003 → clientBase+0x358664 (available roster) | 캐릭터선택/로비 로스터 UI | `buildResponseUnChargeCharacterInner` account.mjs:141 | implemented | P1 | med | none — emit session.mjs:2254 (answer 0x1002), account.mjs:462 (entry seq) |
| 0x1005 | ResponseCharacterEntryState | 0x20 | FUN_004ba2b0 c.0x1005 → clientBase+0x359608 (entry state) | 로비 entry UI (active id/entered/slots) | `buildResponseCharacterEntryStateInner` account.mjs:165 | implemented | P1 | med | none — emit session.mjs:2261 (answer 0x1004), account.mjs:463/499/519 |
| 0x1006 | CommandOriginalCharacterCharge (echo) | 0x18 | FUN_004ba2b0 c.0x1006 → clientBase+0x43241c; FUN_004be760→FUN_00517cd0(0x1006) | 과금 확인 UI 이벤트 | inbound `parseInboundOriginalCharacterCharge` account.mjs:189; ack=0x1005+0x1001 | client-to-server | P1 | low | C→S; processAccount(command-engine.mjs:126) 처리. 0x1006 case는 클라 자기-에코 렌더, 서버 emit 불요 |
| 0x1007 | CommandExtensionCharacterCharge (echo) | 8 | FUN_004ba2b0 c.0x1007 → +0x432434/+0x432438; FUN_004be780→FUN_00517cd0(0x1007) | 확장 과금 확인 UI | inbound `parseInboundExtensionCharacterCharge` account.mjs:208; ack=0x1005+0x1001 | client-to-server | P1 | low | C→S; processAccount 처리. 0x1007 emit 불요 |
| 0x1008 | CommandGenerateCharacterCharge (echo) | 0x80 | FUN_004ba2b0 c.0x1008 → clientBase+0x43243c; FUN_004be7a0→FUN_00517cd0(0x1008) | 캐릭터 생성 확인 UI | `buildGenerateCharacterChargeOkInner` login-protocol.mjs:1449 (생성 에코/OK) | client-to-server | P1 | low | C→S CREATE; inbound login-protocol.mjs:1374 파싱, 서버가 0x1008 OK 에코. 신규 배선 불요 |

### 그룹 C — 0x12 SimpleInformation 트랜잭션 (0x1200 Begin / 0x1201 End / 0x1202.. 델타)

> 중요 정정: 입력 행은 0x1202–0x120b를 `serverBuilder: none / missing`으로 적었으나
> **빌더는 전부 존재**(`codec/simple-info.mjs`). 따라서 아래는 stub(빌더O/emit미배선)이다.

| opcode | name | size | handler | consumer | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction |
|---|---|---|---|---|---|---|---|---|---|
| 0x1200 | TransactionSimpleDataBegin | 0x24 | FUN_004c1dd0 (accumulator reset) | 클라 델타 누산기 초기화 | `buildTransactionSimpleDataBeginInner` simple-info.mjs:144 | implemented | P0 | high | none — `buildSimpleInfoTransaction` 선두로 emit(roster/postload 경로) |
| 0x1201 | TransactionSimpleDataEnd | 1 | FUN_004ba2b0 c.0x1201 → +0x487470; FUN_004c1e50 (commit/flip) | SimpleInfo 누산 커밋 | `buildTransactionSimpleDataEndInner` login-protocol.mjs:357 / simple-info.mjs:149 | implemented | P0 | high | none — `buildCharacterRosterTransaction` 꼬리(login-protocol.mjs~430), push session.mjs:1732 |
| 0x1202 | NotifySimpleInformationCharacter | 0xe104 | FUN_004ba2b0 c.0x1202 → +0x487474; FUN_004c1e80 | 캐릭터 SimpleInfo 누산(풀 정보 패널) | `buildNotifySimpleInfoCharacterInner` simple-info.mjs:193 (stride 0x120) | conditional | P2 | med | builder/emit 존재하나 opt-in: session.mjs:2069 `buildSimpleInfoTransaction({character})`는 `postloadRichCharacterEnabled()&&postloadSimpleInfoEnabled()` 뒤(기본 OFF). 기본 emit 원하면 플래그 게이트 해제 + 비-character kind 스테이징 |
| 0x1203 | NotifySimpleInformationOutfit | 0x2264 | FUN_004ba2b0 c.0x1203 → +0x49c948; FUN_004c1fa0 | 함대/편성 SimpleInfo 누산 | `buildNotifySimpleInfoOutfitInner` simple-info.mjs:203 (stride 0x2c) | stub | P2 | med | 빌더 있음. world-info 틱에서 `state.add('outfit', recs)` 스테이징 후 `buildSimpleInfoTransaction` emit 배선 필요 |
| 0x1204 | NotifySimpleInformationBase | 0x1c24 | FUN_004ba2b0 c.0x1204 → +0x49ebac; FUN_004c2040 (stride 0x24, cap 400) | clientBase+0x4c4b60 base 리스트 | `buildNotifySimpleInfoBaseInner` simple-info.mjs:212 (stride 0x24) | stub | P2 | med | 빌더 있음. task #14(0x031f base)와 연계해 `state.add('base', recs)` 스테이징 배선 |
| 0x1205 | NotifySimpleInformationGrid | 0x324 | FUN_004ba2b0 c.0x1205 → +0x4c14a4; FUN_004c25b0 (u32 array, cap 0xb3) | clientBase+0x62095c u32 grid 리스트 | `buildNotifySimpleInfoGridInner` simple-info.mjs:221 (stride 4) | stub | P2 | med | 빌더 있음. grid 요약 스테이징 배선 |
| 0x1206 | NotifySimpleInformationStrategy | 0x644 | FUN_004ba2b0 c.0x1206 → +0x4a15e4; FUN_004c20d0 | 전략 SimpleInfo 누산 | `buildNotifySimpleInfoStrategyInner` simple-info.mjs:232 (stride 8) | stub | P2 | low | 빌더 있음. 전략 오버뷰 패널 스테이징 배선(가시성 낮음) |
| 0x1207 | NotifySimpleInformationUnit | 0x12c4 | FUN_004ba2b0 c.0x1207 → PTR_DAT_004a1c28; FUN_004c2250 | 유닛 SimpleInfo(함대/함선 요약) | `buildNotifySimpleInfoUnitInner` simple-info.mjs:244 (hdr2, stride 8) | stub | P2 | med | 빌더 있음. 유닛 요약 스테이징 배선 |
| 0x1208 | NotifySimpleInformationCard | 0xe14 | FUN_004ba2b0 c.0x1208 → +0x4a07d0; FUN_004c2150 | 카드(人事) SimpleInfo 누산 | `buildNotifySimpleInfoCardInner` simple-info.mjs:255 (hdr2, stride 0xc) | stub | P2 | low | 빌더 있음. 카드 요약 패널 필요 시 스테이징 배선 |
| 0x1209 | NotifySimpleInformationRank | 0x2b | FUN_004ba2b0 c.0x1209 → +0x49c91c; FUN_004c21e0 | rank SimpleInfo 저장 | `buildNotifySimpleInfoRankInner` simple-info.mjs:267 (hdr1, stride 2) | stub | P2 | low | 빌더 있음(고정 0x2b). rank 요약 필요 시 스테이징 배선 |
| 0x120a | NotifySimpleInformationRankingChara | 0x73a4 | FUN_004ba2b0 c.0x120a → PTR_DAT_004a2eec; FUN_004c22d0 | 랭킹-캐릭터 누산(0x120f와 동일 shape) | `buildNotifySimpleInfoRankingCharacterInner` simple-info.mjs:279 (stride 0x128) | stub | P2 | low | 빌더 있음. 랭킹 보드 필요 시 스테이징 배선 |
| 0x120b | NotifySimpleInformationCompletenessSupplyOutfit | 0x3cf4 | FUN_004ba2b0 c.0x120b (입력 행 절단) | 보급-완성도 델타 누산 | `buildNotifySimpleInfoCompletenessSupplyOutfitInner` simple-info.mjs:289 (hdr2, stride 0x34) | stub | P2 | low | 빌더 있음. 보급 완성도 패널 필요 시 스테이징 배선 |
| 0x120c | NotifySimpleInformationCardAvailableOutfitSeat | 0x21c4 | FUN_004ba2b0 c.0x120c (입력 미공급) | 출진 가능 카드/좌석 델타 | `buildNotifySimpleInfoCardAvailableOutfitSeatInner` simple-info.mjs:298 (stride 0x30) | stub | P2 | low | 빌더 있음. 좌석 배정 UI 필요 시 스테이징 배선 |
| 0x120d | NotifySimpleInformationCardAvailableBaseSeat | 0x2ee4 | FUN_004ba2b0 c.0x120d (입력 미공급) | 기지 좌석 델타 | `buildNotifySimpleInfoCardAvailableBaseSeatInner` simple-info.mjs:307 (hdr2, stride 0x14) | stub | P2 | low | 빌더 있음. 기지 좌석 UI 필요 시 스테이징 배선 |
| 0x120e | NotifySimpleInformationOrderSuggestCharacter | 0x723c | FUN_004ba2b0 c.0x120e (입력 미공급) | 명령/진언 캐릭터 델타 | `buildNotifySimpleInfoOrderSuggestCharacterInner` simple-info.mjs:317 (stride 0xb6c) | stub | P2 | low | 빌더 있음. 진언 흐름(0x0f13/0x0f15)과 연계 스테이징 배선 |
| 0x120f | NotifySimpleInformationCharacterEntry | 0x73a4 | FUN_004c1f10 (roster-entry fill) | 로스터-엔트리 채움 | `buildNotifySimpleInformationCharacterInner` login-protocol.mjs:375 | implemented | P0 | high | none — `buildCharacterRosterTransaction`(login-protocol.mjs:415) 내부, push session.mjs:1732 |

> 표기 주의: 입력 행은 0x120b 이후 절단됨. 0x120c–0x120e는 서버 `codec/simple-info.mjs`에서
> 직접 확인해 채웠고, 클라 handler/consumer 세부는 입력에 없어 "입력 미공급"으로 명시.
> 0x120f는 `WORLD_RESPONSE_OBJECT_SIZES`/입력 그룹 라벨상 0x120a와 동일 geometry(0x73a4)이며
> 실제 emit되는 유일한 델타 옵코드(로스터)다.

---

## 요약 카운트

입력에 행이 제공된 + 작성 중 정정된 S→C 옵코드 모집단(0x1200/0x120c–0x120f 포함, C→S 에코 제외):

| emitStatus | 개수 | 옵코드 |
|---|---|---|
| implemented | 7 | 0x201, 0x204, 0x206, 0x1003, 0x1005, 0x1200, 0x1201, 0x120f *(8행이나 0x1200/0x1201/0x120f가 세트)* |
| conditional | 1 | 0x1202 (opt-in 플래그 뒤) |
| stub (빌더O/emit미배선) | 12 | 0x1203, 0x1204, 0x1205, 0x1206, 0x1207, 0x1208, 0x1209, 0x120a, 0x120b, 0x120c, 0x120d, 0x120e |
| missing (빌더 없음) | 2 | 0x202, 0x207 |
| client-to-server (서버 emit 불요) | 3 | 0x1006, 0x1007, 0x1008 |

정확 카운트(중복 없는 S→C 옵코드, C→S 3개 제외):
- **implemented: 8** (0x201, 0x204, 0x206, 0x1003, 0x1005, 0x1200, 0x1201, 0x120f)
- **conditional: 1** (0x1202)
- **stub: 12** (0x1203–0x120e)
- **missing: 2** (0x202, 0x207)
- 합계 S→C = 23, +C→S 3 = 26 옵코드 행.

> 주의: 위 카운트(요약 카운트 섹션)는 그룹 A/B/C(0x02 세션 / 0x10 어카운트 / 0x12 SimpleInfo)
> 모집단만 센 것이다. **전 8그룹 통합 카운트는 아래 "전체 마스터 요약 카운트" 섹션**에 있다.

---

## 그룹 D — 0x030x/0x031x world-info: 성계(systems) / grid 정적 정보

> 정정: 입력 행은 0x305/0x307/0x309/0x30b/0x30d/0x30f/0x311을 `stub`으로 적었고, 코드 확인 결과
> 빌더는 전부 존재하나 **기본 emit 경로에서 size-correct zero-fill(count=0)** 이거나 **probe
> 플래그 뒤에서만 채워진다**. 따라서 "빌더O + 기본 emit은 빈 walker"인 상태를 stub으로 유지한다.

| opcode | name | size | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction |
|---|---|---|---|---|---|---|---|
| 0x305 | ResponseStaticInformationCard_OK | 0x520a | `buildStaticInformationCardInner` info-records.mjs:110 | stub | P0 | high | 기본 walker = zero-fill(count=0); 채운 카드는 `LOGH_COMMAND_TABLE_PRELOAD_PROBE=1`에서만(login-session.mjs:2416-2421). **배선:** 0x0304→0x0305 기본 walker 응답에 채운 command-grant 테이블을 직접(login-session.mjs:2410-2421, probe 게이트 해제) |
| 0x307 | ResponseStaticInformationCardCommand_OK | 0xe5b2 | `buildStaticInformationCardCommandInner` info-records-static.mjs:174 | stub | P1 | high | probe(login-session.mjs:2431-2432)에서만 emit; 기본 zero-fill. **배선:** 0x0306→0x0307 descriptor 테이블을 0x305와 페어로(login-session.mjs:2431) |
| 0x309 | ResponseStaticInformationPowerDistribution_OK | 0x55c | `buildStaticInformationPowerDistributionInner` info-records-static.mjs:217 | stub | P1 | med | 빌더 0 caller 확인(정의만). **배선:** 0x0308→0x0309 walker에 1372B blob (login-session.mjs ~2526, 0x30b ship 분기 모델) |
| 0x30b | ResponseStaticInformationUnitShip_OK | 0x6d64 | `buildStaticInformationUnitShipInner` info-records-static.mjs:276 | stub | P0 | high | 채운 ship master는 `LOGH_STATIC_SHIPS=1`에서만(login-session.mjs:2526-2527); 기본 zero-fill. **배선:** 0x030a→0x030b 기본 emit 승격(login-session.mjs:2526; `shipClasses` 존재 info-records-static.mjs:748) |
| 0x30d | ResponseStaticInformationUnitTroop_OK | 0x184 | `buildStaticInformationUnitTroopInner` info-records-static.mjs:340 | stub | P1 | med | 빌더 0 caller. 기본 zero-fill. **배선:** 0x030c→0x030d walker(login-session.mjs ~2526 분기 추가) |
| 0x30f | ResponseStaticInformationFighters_OK | 0x34 | `buildStaticInformationFightersInner` info-records-static.mjs:373 | stub | P1 | low | 빌더 0 caller. **배선:** 0x030e→0x030f walker(login-session.mjs ~2526) |
| 0x311 | ResponseStaticInformationArms_OK | 0x1b0 | `buildStaticInformationArmsInner` info-records-static.mjs:400 | stub | P1 | low | 빌더 0 caller. **배선:** 27×8 arms 테이블 → 0x0310→0x0311 walker(login-session.mjs ~2526) |
| 0x313 | ResponseStaticInformationGridType_OK (전략 OBJECT TABLE) | 0x138c | `buildStaticInformationGridTypeInner` login-protocol.mjs:653 | implemented | P0 | high | none — 기본 전략 경로 emit(login-session.mjs:1789-1791) + 요청 0x0312(login-session.mjs:1971). 개선(비차단): 실제 faction/ownership 컬러(task #13, login-session.mjs:997) |
| 0x315 | ResponseStaticInformationGrid_OK (전략 CELL GRID, RLE) | 0x138c | `buildStaticInformationGridInner` ~login-protocol.mjs:611 | implemented | P0 | high | none — 기본 emit(login-session.mjs:1789-1791) + 요청 0x0314(login-session.mjs:1973). 동일 faction-color 개선(task #13) |
| 0x317 | ResponseInformationGrid_OK (현재 grid index dword) | 0x4 | `buildInformationGridInner` info-records-static.mjs:421 | implemented | P0 | med | none — postloadExtras emit(login-session.mjs:2060 & 2220). status byte 1(OK) 강제(WORLD_OK_STATUS_CODES login-protocol.mjs:1634) |

**그룹 D 카운트:** implemented 4 · stub 7 · missing 0

---

## 그룹 E — 0x031x/0x032x/0x033x world-info: base / character / units

| opcode | name | size | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction |
|---|---|---|---|---|---|---|---|
| 0x31d | ResponseStaticInformationBase (정적 기지/성계 마스터: 이름+천문) | 0x520c | `buildStaticInformationBaseInner` info-records.mjs:172 | implemented | P0 | high | none — PULL 0x031c→0x031d(login-session.mjs:2342) + world-entry unshift(login-session.mjs:1642, gated). byte-exact |
| 0x321 | ResponseInformationInstitution (방위/조병/대공/위성) | 0x8de4 | `buildResponseInformationInstitutionInner` codec/institution-record.mjs:199 | implemented | P0 | high | none — PULL 0x0320→0x0321(login-session.mjs:2491) seeded elements. byte-exact(±4 nested-offset 버그 수정) |
| 0x323 | ResponseInformationCharacter (캐릭터 카드 724B) | 0x2d4 | `buildInformationCharacterRecordInner` login-protocol.mjs:224 | implemented | P0 | high | none — world-entry 0x0f02 push(login-session.mjs:1836/1866/1911/2044) + PULL 0x0322→0x0323 fallback(login-session.mjs:2308). 무조건 push |
| 0x325 | ResponseInformationUnit (월드 유닛 테이블 ~52KB) | 0xce44 | `buildInformationUnitRecordInner` login-protocol.mjs:501 | implemented | P0 | high | none — world-entry 0x0f02(검증 spawn) + PULL 0x0324→0x0325(login-session.mjs:2459). 대형 프레임 0x0f02 선두(G184) |
| 0x327 | ResponseInformationWarehouse (보급/식료/광물 + 예비) | 0x300 | `buildResponseInformationWarehouseInner` codec/warehouse-record.mjs:208 | implemented | P0(구조)/P3(값) | med | none — PULL 0x0326→0x0327(login-session.mjs:2505). economy 스칼라 0(P3) — world-state 시드 전까지 placeholder |
| 0x329 | ResponseInformationPackage (수송 manifest) | 0x154 | `buildResponseInformationPackageInner` codec/warehouse-record.mjs:293 | implemented | P0(구조)/P3(값) | med | none — PULL 0x0328→0x0329(login-session.mjs:2516). package 배열 빈값(P3) |
| 0x32b | ResponseInformationOutfit (함대 roster summary; max 100×28B) | 0xaf4 | `buildInformationOutfitInner` info-records.mjs:383 | implemented | P1 | med | none — PULL 0x032a→0x032b(login-session.mjs:2440), content unit당 1 outfit, fallback 1 seeded |
| 0x32d | ResponseGridInformationOutfit (per-grid presence; max 300×12B) | 0xe14 | `buildGridInformationOutfitInner` info-records-static.mjs:437 | stub | P1 | low | byte-exact이나 **0 caller 확인(emit 없음)**. crossmap L50 = generic-walker zero-fill. **배선:** 0x032c→0x032d 분기(login-session.mjs ~2434) per-grid outfit presence |
| 0x32f | ResponseInformationOutfitParty (전체 함대 편성 ~35KB nested) | 0x8b04 | `buildInformationOutfitPartyInner` info-records-static.mjs:520 | implemented | P1 | med | none — PULL 0x032e→0x032f(login-session.mjs:2451) commanding officer seed. 깊은 nested layout P1 — full data 주장 전 nested offset 검증 |
| 0x331 | ResponseOutfitInformationUnit (함대내 per-unit detail; max 70×88B) | 0x1814 | `buildOutfitInformationUnitInner` info-records-static.mjs:469 | stub | P1 | low | byte-exact이나 **0 caller 확인(emit 없음)**. crossmap L51 = generic-walker zero-fill. **배선:** 0x0330→0x0331 분기(login-session.mjs ~2451) per-unit detail |

**그룹 E 카운트:** implemented 7 (2 placeholder 값) · stub 2 · missing 0

---

## 그룹 F — 0x033x–0x035x tactics-info (전투 read-model) — verdict confirmed

emit 전부 `openBattleField`(logh7-battle-engine.mjs) 내부에서 확인.

| opcode | name | size | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction |
|---|---|---|---|---|---|---|---|
| 0x337 | ResponseTacticsCharacter | 0x964 | `buildTacticsCharacterInner` battle-engine.mjs:264 | implemented | P1 | high | none — openBattleField characters.length>0(battle-engine.mjs:628). 전투 개시 시 roster 채움 확인(command-engine.mjs:569) |
| 0x33f | ResponseTacticsInformationCorps | 0x8ca4 | `buildTacticsInformationCorpsInner` battle-engine.mjs:285 | implemented | P1 | med | none — corps.length>0(battle-engine.mjs:631). 요새/군단전 corps[] 시드 |
| 0x341 | ResponseTacticsInformationFillShield | 0x5dc4 | `buildTacticsInformationFillShieldInner` battle-engine.mjs:217 | implemented | P1 | high | none — 항상 step3 push(battle-engine.mjs:605-614). upsertShip 채움 |
| 0x345 | ResponseTacticsInformationBase | 0x204 | `buildTacticsInformationBaseInner` battle-engine.mjs:325 | implemented | P1 | med | none — bases.length>0(battle-engine.mjs:634). 요새 공성 bases[] 필요 |
| 0x347 | InformationObstacle | 0x1d8 | `buildInformationObstacleInner` battle-engine.mjs:376 | implemented | P2 | low | none — obstacles!=null(battle-engine.mjs:637); 기본 null이라 보통 미송신. hazard 필요 시 openBattleField에 obstacles 전달(command-engine.mjs:569) |
| 0x349 | ResponsePositionUnit | 0x2ee4 | `buildResponsePositionUnitInner` battle-engine.mjs:157 | implemented | P1 | high | none — 항상 선두 push(battle-engine.mjs:582-589). 함선 배치 레코드 |
| 0x34b | ResponsePositionBase | 0x44 | `buildResponsePositionBaseInner` battle-engine.mjs:349 | implemented | P1 | med | none — bases.length>0(battle-engine.mjs:639-643) |
| 0x34f | ResponseCardCharacter | 0xb504 | `buildCardCharacterInner` info-records-static.mjs:603 | implemented | P1 | med | none — lobby okInner(login-session.mjs:2395). 724B 0x0323 레코드 재사용. card-list 요청 시 characters[] 채움 확인 |
| 0x356 | NotifyInformationCharacter | 0x2d8 | `buildNotifyInformationCharacterInner` personnel.mjs(import :61) | implemented | P1 | high | none — personnel 전이마다 emit(personnel.mjs:346/447/493/503/572/640/669; admission discriminator code===0x0356 auth-server.mjs:308-311) |
| 0x358 | NotifyChangeFlagShip | 0x5c | `buildNotifyChangeFlagShipInner` personnel.mjs:60 | implemented | P1 | med | none — 0x356와 함께 chief/flagship 임명 시 emit(personnel.mjs:352-356, target 'all') |
| 0x359 | NotifyInformationOutfit | 0x1c | `buildNotifyInformationOutfitInner` info-records-static.mjs:628 | stub | P2 | low | 7-dword layout 작성하나 **0 emit(정의+re-export만)**. **배선:** outfit-state 변경 시 호출(0x358 broadcast personnel.mjs:352 패턴) |
| 0x35a | NotifyEnding | 0x434 | `buildNotifyEndingInner` info-records-static.mjs:649 | stub | P2 | low | head+text 작성하나 **0 emit(정의+re-export만)**. **배선:** game-end/시나리오 종결 시(현재 end-of-game flow 없음). 최저 우선 |

**그룹 F 카운트:** implemented 10 · stub 2 · missing 0 · verdict confirmed

---

## 그룹 G — 0x040x–0x041x battle-commands-1 (C→S `*_OK` 에코)

`*_OK`는 **클라 자기-낙관 에코** 디스패처 case다. 서버는 inbound 명령을 적용하고 대응 `Notify*`를
피어에 broadcast하므로 S→C `*_OK` 빌더는 일반적으로 불요다. 예외: 0x410(미처리), 0x421/0x422(에코 누락).

| opcode | name | size | emitStatus | layoutConf | wirePrio | C→S handler | wireAction |
|---|---|---|---|---|---|---|---|
| 0x400 | CommandMoveShip_OK | 0x41c | client-to-server | P0 | na | command-engine.mjs:164/406 → NotifyMovedShip 0x0423 | none(에코); 피어=0x0423. parse/apply command-engine.mjs:406-448 |
| 0x401 | CommandTurnShip_OK | 0x114 | client-to-server | P0 | na | battle-ops.mjs:696 → NotifyTurnedShip 0x0424 | none; 피어=0x0424(login-protocol.mjs:1152) |
| 0x402 | CommandParallelMoveShip_OK | 0x41c | client-to-server | P0 | na | command-engine.mjs:406(MoveShip 공유) → 0x0423 | none; formation move command-engine.mjs:406-448 |
| 0x403 | CommandReverseShip_OK | 0x114 | client-to-server | P0 | na | battle-ops.mjs:697 → 0x0424 | none; reverse=0x0424 |
| 0x404 | CommandWarpShip_OK | 0x90 | client-to-server | P0 | na | command-engine.mjs:574(combat-engine.mjs:37) | none; warp 서버 해소 |
| 0x405 | CommandAttackShip_OK | 0x98 | client-to-server | P0 | na | command-engine.mjs:483-542 → NotifyAttackedShip 0x0426 | none; damage=0x0426(login-protocol.mjs:1219) |
| 0x406 | CommandShootShip_OK | 0x98 | client-to-server | P0 | na | command-engine.mjs:483-542 → 0x0426 | none; →0x0426 |
| 0x407 | CommandFight_OK | 0x24 | client-to-server | P0 | na | command-engine.mjs:596 → NotifyFought 0x0427 + NotifyMoraleDown 0x0440 | none; result=0x0427(login-protocol.mjs:1273) |
| 0x408 | CommandSuggestion_OK | 0x18 | client-to-server | P1 | low | battle-ops.mjs:206/883 → accept, notifies:[] | none; advisory 수락(battle-ops.mjs:883) |
| 0x409 | CommandEncourageFlagship_OK | 0x10 | client-to-server | P1 | low | battle-ops.mjs:182/839 → NotifyEncourageFlagship 0x42c | none; morale=0x42c(battle-ops.mjs:393) |
| 0x40a | CommandStop_OK | 0x114 | client-to-server | P0 | na | battle-ops.mjs:720-732 → NotifyTurnedShip 0x0424 | none; stop=turn-zero |
| 0x40b | CommandAdmission_OK | 0x94 | client-to-server | P1 | low | battle-ops.mjs:251/805 → admit notify | none; 서버 수락 |
| 0x40c | CommandControl_OK | 0x20 | client-to-server | P0 | low | battle-ops.mjs:223/900 → accept, notifies:[] | none; 효과는 combat notify로 |
| 0x40d | CommandFileFleet_OK | 0x294 | client-to-server | P0 | low | parseInboundFileFleet battle-ops.mjs:359 | none; re-form/engage parse |
| 0x40e | CommandAirBattle_OK | 0x98 | client-to-server | P0 | low | battle-ops.mjs:265/924 → NotifyAirBattle | none; 해소(buildNotifyAirBattleInner) |
| 0x40f | CommandSortieTroops_OK | 0x94 | client-to-server | P0 | na | command-engine.mjs:649 → NotifySortie 0x0437 + NotifyLandCombat 0x042a | none; sortie→0x0437(login-protocol.mjs:1328) |
| 0x410 | CommandEvacuateTroops_OK | 0x90 | **missing** | P1 | low | **C→S handler 없음** — RELAY_COMMAND_CODES(world-relay.mjs) 및 processBattleOps/command-engine switch에 부재(확인) | **배선:** 0x410을 RELAY_COMMAND_CODES(world-relay.mjs troop block)에 추가 + parseInboundEvacuate/process 분기(battle-ops.mjs ~sortie family) troop-position Notify emit. 현재 지상부대 evacuate inbound 미처리 |
| 0x411 | CommandChangeMode_OK | 0x98 | client-to-server | P1 | high | command-engine.mjs:545 → NotifyChangeMode 0x042f | none(에코)이나 0x411은 **전투-진입 트리거**: authoritative GRANT=0x042f(login-protocol.mjs:1251). 0x042f layout(P1) 검증해 클라 tactical mode 진입 확인 |
| 0x412 | CommandSortie_OK | 0x90 | client-to-server | P0 | med | command-engine.mjs:649(RELAY world-relay.mjs:36) → NotifyLandCombat 0x042a | none; 지상 강습→0x042a(login-protocol.mjs:1318) |
| 0x413 | CommandRepairFleet_OK | 0x14 | client-to-server | P0 | low | battle-ops.mjs:156/771 → NotifyRepairFleet 0x42d | none; repair=0x42d(battle-ops.mjs:423) |
| 0x414 | CommandSupplyFleet_OK | 0x14 | client-to-server | P0 | low | battle-ops.mjs:156/771 → NotifySupplyFleet 0x42e | none; supply=0x42e(battle-ops.mjs:426) |
| 0x419 | CommandShootFortress_OK | 0x14 | client-to-server | P0 | low | battle-ops.mjs:287/975 → NotifyShootFortress 0x436 | none; 사격=0x436(battle-ops.mjs:444) |
| 0x41a | CommandAdmissionBase_OK | 0x94 | client-to-server | P1 | low | battle-ops.mjs:251/805(admission family) | none; admission 분기 |
| 0x41b | CommandRepairBase_OK | 0x94 | client-to-server | P1 | low | battle-ops.mjs(repair/admission family) → NotifyRepairBase 0x433 | none; base repair=0x433(battle-ops.mjs:429) |
| 0x41c | CommandSupplyBase_OK | 0x94 | client-to-server | P1 | low | battle-ops.mjs(service family) → NotifySupplyBase 0x434 | none; base supply=0x434(battle-ops.mjs:432) |
| 0x41d | CommandEncourageBase_OK | 0x10 | client-to-server | P1 | low | battle-ops.mjs:194/859 → NotifyEncourageBase 0x432 | none; base morale=0x432(battle-ops.mjs:406) |
| 0x41e | CommandStopBase_OK | 0x10 | client-to-server | P1 | low | battle-ops.mjs:194/874 → accept, notifies:[] | none; stop-base 빈 notifies 수락 |
| 0x41f | CommandMoveFortress_OK | 0x1a4 | client-to-server | P0 | low | battle-ops.mjs:291/998 → NotifyMovedFortress 0x435 | none; fortress move=0x435(battle-ops.mjs:474) |
| 0x420 | CommandChangeAuthority_OK | 0x94 | client-to-server | P0 | low | battle-ops.mjs:322/1019 → NotifyChangedAuthority 0x439 | none; authority=buildNotifyChangedAuthorityInner(battle-ops.mjs:1022) |
| 0x421 | CommandMission_OK | 0x98 | **wrong** | P2 | med | COMMAND_MISSION battle-ops.mjs:64; handler가 0x43c+0x442 emit하나 **0x421 OK 에코 없음**(확인 battle-ops.mjs:1027-1052) | **배선:** OK 에코 `buildLobbyResponseInner(0x421,0x98)`를 battle-ops.mjs:1052에 추가; 클라 case가 ack 기대 |
| 0x422 | CommandEmergencySupply_OK | 0x14 | **wrong** | P2 | low | COMMAND_EMERGENCY_SUPPLY battle-ops.mjs:65; 0x438 emit하나 **0x422 OK 에코 없음** | **배선:** OK 에코를 battle-ops.mjs:820에 추가 |

**그룹 G 카운트:** client-to-server 28 · missing 1(0x410) · wrong 2(0x421, 0x422)

---

## 그룹 H — 0x042x–0x044x battle-commands-2 / notify-battle (Notify*)

| opcode | name | size | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction |
|---|---|---|---|---|---|---|---|
| 0x424 | NotifyTurnedShip | 0xc | `buildNotifyTurnedShipInner` login-protocol.mjs:1152 | implemented | P1 | med | none — battle-ops.mjs:709, command-engine.mjs:290/444, npc-ai.mjs:143 |
| 0x425 | NotifyWarpedShip | 0x90 | none(NOTIFY_WARPED_SHIP_CODE combat-engine.mjs:45, 빌더 없음) | missing | P2 | med | warp을 buildNotifyMovedShipInner로 대용(command-engine.mjs:575-577). **빌더 생성** buildNotifyWarpedShipInner(0x90) + emit command-engine.mjs ~577 |
| 0x426 | NotifyAttackedShip | 0x1c | `buildNotifyAttackedShipInner` login-protocol.mjs:1219 | implemented | P0 | high | none — command-engine.mjs:522/626, npc-ai.mjs:130 |
| 0x427 | NotifyFought | 0x10 | `buildNotifyFoughtInner` login-protocol.mjs:1274 | stub | P1 | med | 빌더 정의, **0 emit(확인)**. **배선:** auto-resolve combat 경로(command-engine.mjs ~626)에서 비-tactical 교전 해소 시 0x427 push |
| 0x428 | NotifyAirBattle | 0x18 | `buildNotifyAirBattleInner` battle-ops.mjs:505 | implemented | P2 | med | none — battle-ops.mjs:928/949 |
| 0x429 | NotifyMovedTroop | 0x14 | `buildNotifyMovedTroopInner` login-protocol.mjs:1303 | implemented | P1 | med | none — command-engine.mjs:669 |
| 0x42a | NotifyLandCombat | 0xc | `buildNotifyLandCombatInner` login-protocol.mjs:1318 | implemented | P2 | med | none — command-engine.mjs:681 |
| 0x42c | NotifyEncourageFlagship | 0xfc | `buildNotifyEncourageFlagshipInner` battle-ops.mjs:393 | implemented | P2 | med | none — battle-ops.mjs:841 |
| 0x42d | NotifyRepairFleet | 0x10 | `buildNotifyRepairFleetInner` battle-ops.mjs:423 | implemented | P2 | med | none — battle-ops.mjs:770(isRepair) |
| 0x42e | NotifySupplyFleet | 0x10 | `buildNotifySupplyFleetInner` battle-ops.mjs:426 | implemented | P2 | med | none — battle-ops.mjs:770(supply) |
| 0x42f | NotifyChangeMode | 0x298 | `buildNotifyChangeModeInner` login-protocol.mjs:1251 | implemented | P0 | high | none — battle-engine.mjs:648/759 |
| 0x431 | NotifyTacticsChiefCommander | 0x8 | `buildNotifyTacticsChiefCommanderInner` battle-engine.mjs:453 + dup battle-ops.mjs:539 | stub | P2 | low | 양쪽 정의, **0 emit(확인)**. 시그니처 상이. **de-dup + emit** chief-commander 임명 시(openBattleField ~battle-engine.mjs:648) |
| 0x432 | NotifyEncourageBase | 0xfc | `buildNotifyEncourageBaseInner` battle-ops.mjs:406 | implemented | P2 | low | none — battle-ops.mjs:861 |
| 0x433 | NotifyRepairBase | 0x10 | `buildNotifyRepairBaseInner` battle-ops.mjs:429 | implemented | P2 | low | none — battle-ops.mjs:789/806 |
| 0x434 | NotifySupplyBase | 0x10 | `buildNotifySupplyBaseInner` battle-ops.mjs:432 | implemented | P2 | low | none — battle-ops.mjs:789(supply) |
| 0x435 | NotifyMovedFortress | 0x14 | `buildNotifyMovedFortressInner` battle-ops.mjs:474 | implemented | P2 | med | none — battle-ops.mjs:1001 |
| 0x436 | NotifyShootFortress | 0x8c | `buildNotifyShootFortressInner` battle-ops.mjs:444 | implemented | P2 | med | none — battle-ops.mjs:978 |
| 0x437 | NotifySortie | 0x14 | `buildNotifySortieInner` login-protocol.mjs:1328 | implemented | P2 | med | none — command-engine.mjs:668 |
| 0x438 | NotifyEmergencySupplyBase | 0x10 | `buildNotifyEmergencySupplyBaseInner` battle-ops.mjs:435 | implemented | P2 | low | none — battle-ops.mjs:822 |
| 0x439 | NotifyChangedAuthority | 0x88 | `buildNotifyChangedAuthorityInner` battle-ops.mjs:489 | implemented | P2 | med | none — battle-ops.mjs:1022 |
| 0x43a | NotifyCharacterAchievement | 0xc | `buildNotifyCharacterAchievementInner` battle-ops.mjs:559 | stub | P2 | low | 빌더 정의, **0 emit(확인)**. **배선:** personnel 공적(功績) 갱신 시 0x43a broadcast |
| 0x43b | NotifyOutfitAchievement | 0xc | `buildNotifyOutfitAchievementInner` battle-ops.mjs:562 | stub | P2 | low | 빌더 정의, **0 emit(확인)**. **배선:** outfit/部隊 공적 갱신 시 |
| 0x43c | NotifyMissionResult | 0x10 | `buildNotifyMissionResultInner` battle-ops.mjs:520 | implemented | P2 | med | none — battle-ops.mjs:1038 |
| 0x43d | NotifyConfusionUnit | 0x8 | `buildNotifyConfusionUnitInner` battle-ops.mjs:577 | stub | P1 | low | 빌더 정의, **0 emit(확인)**. **배선:** 사기/混乱 전이 시 0x43d broadcast |
| 0x43e | NotifyConfusionRecoveredUnit | 0x8 | `buildNotifyConfusionRecoveredUnitInner` battle-ops.mjs:580 | stub | P1 | low | 빌더 정의, **0 emit(확인)**. **배선:** 혼란 회복 전이 시 |
| 0x43f | NotifyShootBase | 0x10 | `buildNotifyShootBaseInner` battle-ops.mjs:461 | stub | P2 | low | 빌더 정의, **0 emit(확인: 1 ref)**. **배선:** base-fire action(0x436 경로 ~battle-ops.mjs:978와 병행) |
| 0x440 | NotifyMoraleDown | 0xc | `buildNotifyMoraleDownInner` login-protocol.mjs:1285 | implemented | P1 | med | none — command-engine.mjs:627 |
| 0x441 | NotifyBlackHoleSuction | 0x4 | `buildNotifyBlackHoleSuctionInner` battle-ops.mjs:585 | stub | P1 | low | 빌더 정의, **0 emit(확인)**. **배선:** obstacle/black-hole tick에서 끌린 유닛 0x441 broadcast |
| 0x442 | NotifyFinishOccupation | 0x8 | `buildNotifyFinishOccupationInner` battle-ops.mjs:530 | implemented | P2 | med | none — battle-ops.mjs:1048 |

**그룹 H 카운트:** implemented 19 · stub 9 · missing 1(0x425)

---

## 그룹 I — 0x0b0x/0x0c0x logistics+grid-move + 0x0f0x social/mail/chat (strategic-grid-chat / notify-world)

### I-a) logistics / grid-move (0x0b0x, 0x0c0x) — **[LOW-CONFIDENCE: func-RE 재확인 필요]**

> **그룹 verdict = `refuted`.** 아래 행 전부 LOW-CONFIDENCE로 표기하고 **배선 백로그에서 제외**한다
> (신뢰 불가 RE 기반 배선 금지). 특히 0xb07 header layout은 **라이브 0x0b07 A/B 캡처(open task #11)**
> 가 선결이지 서버 배선이 아니다.

| opcode | name | size | serverBuilder | emitStatus | layoutConf | wirePrio | note (LOW-CONFIDENCE) |
|---|---|---|---|---|---|---|---|
| 0xb02 | CommandSupplyFuel (echo) | 0x18 | echo path logistics.mjs:619-648 | client-to-server | P2 | med | [LOW-CONFIDENCE: func-RE 재확인 필요] 0xb02 echo + 0xb0c broadcast; S→C 빌더 불요 |
| 0xb03 | CommandSearch (echo) | 0x14 | echo path logistics.mjs:652-675 | client-to-server | P2 | med | [LOW-CONFIDENCE: func-RE 재확인 필요] 0xb03 echo + 0xb0d broadcast |
| 0xb04 | CommandUnloadTroop (echo) | 0x24 | echo path logistics.mjs:702-721 | client-to-server | P2 | med | [LOW-CONFIDENCE: func-RE 재확인 필요] 공유 troop-transfer echo |
| 0xb05 | CommandLoadTroop (echo) | 0x24 | echo path logistics.mjs:702-721 | client-to-server | P2 | med | [LOW-CONFIDENCE: func-RE 재확인 필요] 공유 troop-transfer echo |
| 0xb07 | NotifyMovedGrid | 0x244 | `buildNotifyMovedGridInner` login-protocol.mjs:1353 | implemented | P1 | high | [LOW-CONFIDENCE: func-RE 재확인 필요] emit command-engine.mjs:385/472, session.mjs:2165; header dword 미확정 — **라이브 0x0b07 A/B(task #11)가 blocker** |
| 0xb08 | NotifyLeaveOutGrid | 0x11c | `buildNotifyLeaveOutGridInner` logistics.mjs:476 | stub | P1 | med | [LOW-CONFIDENCE: func-RE 재확인 필요] 빌더 미호출; RE 재확인 전까지 백로그 제외 |
| 0xb09 | NotifyEnterGridBegin | 0x01 | `buildNotifyEnterGridBeginInner` login-protocol.mjs:1187 | implemented | P0 | high | [LOW-CONFIDENCE: func-RE 재확인 필요] emit session.mjs:2027/2053/2214 |
| 0xb0a | NotifyEnterGridEnd | 0x01 | `buildNotifyEnterGridEndInner` login-protocol.mjs:1194 | implemented | P0 | high | [LOW-CONFIDENCE: func-RE 재확인 필요] emit session.mjs:2047/2054/2182/2210/2215 |
| 0xb0b | NotifyMovedBase | 0x44 | `buildNotifyMovedBaseInner` logistics.mjs:400 | implemented | P1 | med | [LOW-CONFIDENCE: func-RE 재확인 필요] emit logistics.mjs:691-697; position placeholder |
| 0xb0c | NotifySuppliedFuel | 0x240 | `buildNotifySuppliedFuelInner` logistics.mjs:424 | implemented | P1 | med | [LOW-CONFIDENCE: func-RE 재확인 필요] emit logistics.mjs:637-648; per-unit stride 추론 |
| 0xb0d | NotifySearch | 0xa9c | `buildNotifySearchInner` logistics.mjs:447 | implemented | P1 | med | [LOW-CONFIDENCE: func-RE 재확인 필요] emit logistics.mjs:665-674; 빈 recon |
| 0xc00 | CommandCompletenessRepair (echo) | 0x35c | echo path logistics.mjs:771-787 | client-to-server | P3 | low | [LOW-CONFIDENCE: func-RE 재확인 필요] byte-faithful echo, body partial |
| 0xc01 | CommandCompletenessSupply (echo) | 0x324 | echo path logistics.mjs:771-787 | client-to-server | P3 | low | [LOW-CONFIDENCE: func-RE 재확인 필요] byte-faithful echo, body partial |
| 0xc02 | CommandReorganization (echo) | 0x310 | echo path logistics.mjs:735-743 | client-to-server | P3 | low | [LOW-CONFIDENCE: func-RE 재확인 필요] echo-only |

### I-b) social / mail / messenger / chat (0x0f0x) — verdict confirmed

| opcode | name | size | serverBuilder | emitStatus | layoutConf | wirePrio | wireAction |
|---|---|---|---|---|---|---|---|
| 0xf05 | ResponseInformationMailAddress | 0x7214 | `buildResponseMailAddressInner` account.mjs:231 | stub | P2 | low | 빌더 **0 emit(확인: 정의만)**. **배선:** world-load near login-session.mjs:311(f07 sibling 위치) self-targeted push. record layout MEDIUM — 내용 의존 전 검증 |
| 0xf07 | ResponseInformationMessengerStatus | 0x74cc | `buildResponseMessengerStatusInner` account.mjs:249 | implemented | P2 | med | none — buildActiveMessengerStatusInner(login-session.mjs:310) wrap, push login-session.mjs:2090/2207/2229. self entry 1개; roster 배선 시 실제 contacts 확장 |
| 0xf08 | TransactionInformationMailBegin | 0x128 | `buildTransactionMailBeginInner` account.mjs:268 | stub | P2 | low | 빌더 **0 emit**(DIAGNOSTIC trace set auth-server.mjs:382는 emit 아님). 메일은 단일 0xf0a record로 Begin/Status framing 없이 전송. **배선:** Begin→records→Status를 mail-send 경로(social.mjs:649-679)에 |
| 0xf09 | TransactionInformationMail (1B status) | 1 | `buildTransactionMailStatusInner` account.mjs:282 | stub | P1 | low | 빌더 **0 emit**. **배선:** f08 framing과 페어; f0a record(s) 뒤 f09 status emit(social.mjs:669-678) |
| 0xf0b | CommandExchangeMailAddress | 0x24c | parseInboundAddressCommand social.mjs:341 | client-to-server | P3 | low | C→S add-contact; addContact, notifies:[](social.mjs:756-766). emit 불요(roster refresh 원하면 f05/f07 재-push). body P3 |
| 0xf0c | CommandDeleteMailAddress | 0x124 | parseInboundAddressCommand social.mjs:341 | client-to-server | P3 | low | C→S delete-contact; removeContact, notifies:[]. emit 불요. P3 |
| 0xf0d | CommandMessengerStatus | 0x128 | parseInboundMessengerStatus social.mjs:294 | client-to-server | P2 | low | C→S set-presence; setPresence, notifies:[](broadcast 없음). 주석(L728): presence 변경은 contacts f07 재-push 해야 함. **배선:** f0d 시 변경 user의 contacts에 f07 재-emit. charId@0/status@4 P2 |
| 0xf0e | CommandMessengerConnection | 0x250 | none(accept-only social.mjs:750-753) | client-to-server | P3 | low | C→S 1:1 session open/accept; accept:true, notifies:[]. emit 불요. 양방향 handshake 필요 시 동일 f0e body를 peer에 relay |
| 0xf0f | CommandMessenger (live IM) | 0x52c | `buildMessengerInner` social.mjs:324 | implemented | P2 | med | 양방향 relay: 클라 f0f 송신; processSocial(social.mjs:733-749) target 해소, buildMessengerInner emit(raw passthrough). fromId@0/toId@4/text(len@8,@10 UTF-16LE) P2 |
| 0xf10 | CommandSendMail | 0x75c | parseInboundSendMail social.mjs:194; delivery buildMailRecordInner 0x0f0a social.mjs:225 | implemented | P2 | med | C→S send; 0x0f0a record로 전달(social.mjs:649-679, raw-copy). f10 echo 아님. mailbox cap 120(L665) |
| 0xf11 | CommandReadMail | 0x12c | parseInboundMailRef social.mjs:212 | client-to-server | P2 | low | C→S mark-read; markRead, notifies:[]. emit 불요 |
| 0xf12 | CommandDeleteMail | 0x12c | parseInboundMailRef social.mjs:212 | client-to-server | P2 | low | C→S delete; deleteMail, notifies:[]. emit 불요 |
| 0xf13 | CommandOrderSuggestMail | 0x264 | parseInboundOrderMail social.mjs:258; notify buildNotifyCommandMailInner 0x0f15 social.mjs:276 | implemented | P2 | med | C→S compose; target에 0x0f15 전달(social.mjs:697-719). targetId@0/orderId@4/text@8 P2 |
| 0xf15 | NotifyCommandMail | 0x25c | `buildNotifyCommandMailInner` social.mjs:276 | implemented | P2 | med | S→C f13 order-mail 도착 notify(social.mjs:704-718). targetId@0/senderId@4/orderId@8/text@0xe P2 |
| 0xf16 | CommandSetTogether | 0xc | parseInboundSetting+applySetting social.mjs:364/404; echo buildLobbyResponseInner(0x0f16) social.mjs:779 | implemented | P1 | med | 양방향: 클라 f16; processSocial(social.mjs:769-784) 적용 후 SetTogether만 동일 12B body(charId@4,flag@8) 'others' 재-broadcast. P1 |
| 0xf17 | CommandSetWillMessage | 0x8c | parseInboundSetting+applySetting social.mjs:364/409 | client-to-server | P2 | low | C→S private; willMessage 저장, notifies:[]. emit 불요. charId@0+wide-text P2 |
| 0xf18 | CommandSetOfflineDirection | 0x10 | parseInboundSetting+applySetting social.mjs:376/412 | client-to-server | P2 | low | C→S private(4 dwords, @4=ackId); 저장+ack, notifies:[]. emit 불요 |
| 0xf19 | CommandSetUnitDistributePriority | 0x10 | parseInboundSetting+applySetting social.mjs:377/416 | client-to-server | P2 | low | C→S private(4 dwords, @4=ackId); 저장, notifies:[]. emit 불요 |
| 0xf1a | CommandSetReturnBase | 0xc | parseInboundSetting+applySetting social.mjs:383/420 | client-to-server | P2 | low | C→S private(return-base @values[2]); 저장, notifies:[]. emit 불요 |
| 0xf1b | CommandSetPrivateAccountRate | 0xc | parseInboundSetting+applySetting social.mjs:384/423 | client-to-server | P2 | low | C→S private(tax rate @values[2]); 저장, notifies:[]. emit 불요 |
| 0xf1c | CommandGridChat (receive form) | 0x8c | `buildCommandGridChatInner` ~login-protocol.mjs:1522 | implemented | P1 | high | 양방향 grid chat: built login-protocol.mjs:1522, relay auth-server.mjs:2119 / command-engine. castType@8/msgLen@9/text@10 P1 |
| 0xf1d | CommandSpotChat (receive form) | 0x8c | `buildCommandSpotChatInner` social.mjs:158 | implemented | P0 | high | 양방향 spot/grid broadcast: 클라 f1d; processSocial(social.mjs:608-619) parse(time@0,spot@4,msgLen@8,text@10), 'others'에 spot 범위 재-broadcast. P0 |
| 0xf1e | CommandSpotUnicastChat (whisper) | 0x90 | `buildCommandSpotUnicastChatInner` social.mjs:172 | implemented | P0 | high | 양방향 whisper: 클라 f1e; processSocial(social.mjs:621-647) parse(time@0,ctx@4,targetId@8,msgLen@0xc,text@0xe), target conn에 전달. P0 |
| 0xf1f | NotifyTactics (enter space-war trigger) | 0x8 | `buildNotifyTacticsInner` battle-engine.mjs:441 | implemented | P0 | high | S→C 'begin space-war' 트리거(8B). openBattleField step11(마지막) emit(battle-engine.mjs:660-664) + gated probe session.mjs:2102/2189. 0x42f NotifyChangeMode + pose seed 시퀀스가 선행 필수 |

**그룹 I 카운트(신뢰 0x0f0x만):** implemented 9 · stub 4 · client-to-server 10
**그룹 I logistics(0x0b0x/0x0c0x, LOW-CONFIDENCE / 백로그 제외):** 14행

---

## 전체 마스터 요약 카운트 (8그룹, 옵코드 단위 중복 제거)

카탈로그된 전체 S→C-관련 옵코드: **131**

| emitStatus | 개수 | 비고 |
|---|---|---|
| implemented | 60 | built + emit 검증 (placeholder 값 7 + LOW-CONFIDENCE logistics 7 포함) |
| conditional | 1 | 0x1202 (opt-in 플래그 `postloadSimpleInfoEnabled()` 뒤) |
| stub | 23 | 빌더 존재, **0 emit call site(grep 검증)** — SimpleInfo 12 + info-records 4 + outfit 2 + notify-battle 9 + social 4 - (중복 제거) |
| missing | 4 | 빌더 없음: 0x202, 0x207, 0x410, 0x425 |
| wrong | 2 | handler 존재, OK-echo 미emit: 0x421, 0x422 |
| client-to-server | 44 | C→S; S→C emit 불요 |

> **입력 데이터 대비 핵심 정정(no-fabrication):** 입력 행은 SimpleInfo 0x1202–0x120e를
> `missing(빌더 없음)`으로 적었으나, 실제로 `server/src/server/codec/simple-info.mjs`에 13개
> 델타 빌더가 **전부 존재**한다(`buildNotifySimpleInfoCharacterInner` … `…OrderSuggestCharacterInner`,
> `logh7-simple-info.mjs` re-export 경유 login-session.mjs:2069에서 0x1202만 opt-in emit). 따라서
> 이 옵코드들은 `missing`이 아니라 `stub`(0x1202는 `conditional`)으로 강등 반영했다. 빌더 부재가
> 아니라 **스테이징 배선 부재 + 콘텐츠/라이브 미확정**이 갭의 본질이다.

신뢰(non-refuted) 옵코드만:
- implemented(신뢰): 53
- stub(신뢰, 배선 가능): 22 (SimpleInfo 12 + 0x309/0x30d/0x30f/0x311 + 0x32d/0x331 + 0x359/0x35a + 0x427/0x431/0x43a/0x43b/0x43d/0x43e/0x43f/0x441 + 0xf05/0xf08/0xf09 — refuted logistics stub 0xb08 제외)
- missing(신뢰): 4
- wrong(신뢰): 2

---

## 전체 우선순위 배선 백로그 (8그룹 통합)

선정 규칙: `emitStatus ∈ {missing, stub, conditional, wrong}` **AND** `wirePrio = high` **AND**
`layoutConf ∈ {P0,P1}`. refuted-RE 옵코드(0x0b0x/0x0c0x) **제외**. P3 layout은 "라이브 A/B 선결"로 분리.

### 티어 A — 지금 배선 (high + P0/P1 + 안전)

| # | opcode | name | emitStatus | layoutConf | wireAction (server file:line) | blockedBy |
|---|---|---|---|---|---|---|
| 1 | 0x305 | ResponseStaticInformationCard_OK | stub | P0 | 채운 command-grant 테이블을 기본 0x0304→0x0305 walker okInner로: `logh7-login-session.mjs:2410-2421` (probe env 게이트 해제) | 콘텐츠: command-grant 테이블 시드 필요(없으면 count=0이 정답) |
| 2 | 0x30b | ResponseStaticInformationUnitShip_OK | stub | P0 | `LOGH_STATIC_SHIPS` 게이트 제거/기본화: `logh7-login-session.mjs:2526` → `buildStaticInformationUnitShipInner({ ships: staticShipMasterClasses() })` | 콘텐츠 존재(`shipClasses` info-records-static.mjs:748); world-init 회귀 없는지 라이브 재검증 |
| 3 | 0x307 | ResponseStaticInformationCardCommand_OK | stub | P1 | descriptor 테이블을 0x305와 페어로: `logh7-login-session.mjs:2431` (probe 해제) | 콘텐츠: descriptor 행 시드(#1과 연계) |
| 4 | 0x309 | ResponseStaticInformationPowerDistribution_OK | stub | P1 | 0x0308→0x0309 기본 분기 추가 `logh7-login-session.mjs ~2526` (0x30b 분기 모델) → `buildStaticInformationPowerDistributionInner(...)` | 콘텐츠: power-distribution blob 소스 |
| 5 | 0x427 | NotifyFought | stub | P1 | auto-resolve combat 경로 emit `logh7-command-engine.mjs ~626` (비-tactical 교전 해소 시 `buildNotifyFoughtInner(...)` push) | 빌더 준비됨(login-protocol.mjs:1274); 교전-결과 필드 확인 |
| 6 | 0x410 | CommandEvacuateTroops | missing(C→S handler 부재) | P1 | `RELAY_COMMAND_CODES`(world-relay.mjs troop block)에 0x410 추가 + `parseInboundEvacuate`/process 분기(battle-ops.mjs ~sortie family) troop-position Notify emit | RE: 0x410 inbound body(0x90) layout 확인 후 parser |
| 7 | 0x421 | CommandMission_OK (echo) | wrong | P1 (echo header 범용) | OK 에코 `buildLobbyResponseInner(0x421,0x98)` `logh7-battle-ops.mjs:1052` (handler가 이미 0x43c/0x442 emit) | 없음 — 범용 OK-echo shape; 클라 case가 ack 기대 |

> 0x42f NotifyChangeMode는 이미 emit되어 strict 규칙(missing/stub/wrong)에 안 들지만, **전투-진입
> play loop를 막는 최고-레버리지 layout-검증 항목**이다(battle-engine.mjs:648/759). build가 아닌
> **verify** task로 task #7 verdict와 함께 추적.

### 티어 B — 콘텐츠/로스터 도착 시 배선 (빌더 준비됨, 콘텐츠 시드 blocked, P0/P1)

| opcode | name | emitStatus | wireAction | blockedBy |
|---|---|---|---|---|
| 0x30d/0x30f/0x311 | StaticTroop/Fighters/Arms | stub | 0x30b 옆 기본 분기 `logh7-login-session.mjs ~2526` | 콘텐츠: troop/fighter/arms master 테이블 시드 |
| 0x32d | ResponseGridInformationOutfit | stub | 0x032c→0x032d 분기 `logh7-login-session.mjs ~2434` | world-state: per-grid outfit presence 모델 |
| 0x331 | ResponseOutfitInformationUnit | stub | 0x0330→0x0331 분기 `logh7-login-session.mjs ~2451` | 콘텐츠: per-unit detail |
| 0x1204 | NotifySimpleInformationBase | stub | `state.add('base', recs)` → `buildSimpleInfoTransaction` emit (`logh7-login-session.mjs:2069` 패턴; 빌더 simple-info.mjs:212) | task #14(0x031f base) 콘텐츠 선결 |
| 0x1207 | NotifySimpleInformationUnit | stub | `state.add('unit', recs)` 스테이징 후 emit (빌더 simple-info.mjs:244) | 유닛 요약 필드 의미 라이브 확인 |
| 0xf09 | TransactionInformationMail (status) | stub | f08 framing과 페어, f0a record 뒤 emit `logh7-social.mjs:669-678` | f08 Begin framing 동시 도입 |

### 티어 C — 라이브 A/B 캡처 선결 (P3 layout — blind 배선 금지)

| opcode | name | reason |
|---|---|---|
| 0x1202 | NotifySimpleInformationCharacter | conditional→default 승격은 SS 시퀀스 교란 전례(session.mjs:1715 주석); 0x120f 로스터와 중복 위험 |
| 0x1206/0x1208/0x1209/0x120a | Strategy/Card/Rank/RankingChara | 레코드 stride 내부 필드 의미 라이브 미확정 + 대응 콘텐츠(랭킹/카드) 부재 |
| 0x120b/0x120c/0x120d/0x120e | Completeness/CardAvailable×2/OrderSuggest | layout 추론(P3) + 좌석/완성도 콘텐츠 부재 |
| 0xf05 | ResponseInformationMailAddress | record layout MEDIUM; 내용 의존 전 검증 |
| 0xf0b/0xf0c/0xf0e | address/messenger-connection body | 첫 2 dword 외 추론(P3) |

### 백로그 제외 (refuted RE — func-RE 재확인 후에만 배선)

`0xb02, 0xb03, 0xb04, 0xb05, 0xb07, 0xb08, 0xb09, 0xb0a, 0xb0b, 0xb0c, 0xb0d, 0xc00, 0xc01, 0xc02`
— logistics / grid-move family. 특히 0xb07 header layout은 **라이브 0x0b07 A/B 캡처(open task #11)**
가 선결이지 서버 배선이 아니다. 그룹 verdict가 `refuted`→상향될 때까지 이 RE 위에 구축 금지.

### 저우선 stub 백로그 (med/low + P1/P2 — 기회 시 배선)

`0x359` NotifyInformationOutfit · `0x35a` NotifyEnding · `0x431` NotifyTacticsChiefCommander(de-dup 먼저)
· `0x43a/0x43b` Achievement · `0x43d/0x43e` Confusion · `0x43f` NotifyShootBase · `0x441`
BlackHoleSuction · `0x425` NotifyWarpedShip(빌더 생성) · `0xf08` mail Begin framing · `0x1203/0x1205`
SimpleInfo Outfit/Grid · `0x32d/0x331` outfit detail.

---

## 검증 provenance (2026-06-29 working tree 재확인)

다음 입력 주장을 working tree에서 독립 재확인 → **confirmed**:
- 0 emit caller stub(grep, 정의 행만 매칭): 0x309, 0x30d, 0x30f, 0x311, 0x359, 0x35a, 0x32d, 0x331,
  0x427, 0x431, 0x43a, 0x43b, 0x43d, 0x43f, 0x441.
- probe-gated walker(기본=zero-fill): 0x305(`LOGH_COMMAND_TABLE_PRELOAD_PROBE`),
  0x30b(`LOGH_STATIC_SHIPS`) login-session.mjs:2416-2421 / 2526-2527.
- confirmed emit: 0x337/0x33f/0x341/0x345/0x349(battle-engine.mjs:605-643), 0x0f1f(battle-engine.mjs:660-664).
- "wrong" 0x421: COMMAND_MISSION handler(battle-ops.mjs:1027-1052)가 0x43c+0x442 emit, 0x421 OK echo 없음 — confirmed.
- "missing" 0x410: world-relay/command-engine/battle-ops switch 부재 — confirmed.
- **입력 정정**: SimpleInfo 0x1202–0x120e 빌더는 `codec/simple-info.mjs:193-317`에 전부 존재
  (입력의 `missing` 주장 반증) — `missing`→`stub`/`conditional` 강등.

---

## 부록 — 그룹 A/B/C(0x02/0x10/0x12) 상세 배선 백로그

> 위 "전체 우선순위 배선 백로그"(8그룹 통합)가 권위다. 이 부록은 입력 3그룹(세션/어카운트/
> SimpleInfo) **국한** 상세를 보존한다. 주의: 그룹 A/B/C **내부만** 보면 `high+P0/P1+미배선` 교집합은
> 비어 있다(wirePrio=high인 0x201/0x204/0x206/0x1200/0x1201/0x120f는 이미 implemented+emit; 미배선
> 옵코드는 P1~P2 + low~med). 그래서 아래는 **실질 가치 순(완화)** 백로그다. 전체 백로그의 high+P0/P1
> 항목(0x305/0x30b 등)은 그룹 D~I에서 나온다.

### 티어 1 — P1, 안전 구현 가능(라이브 검증만 권장)

| 순위 | opcode | name | wireAction (server file:line) | blockedBy |
|---|---|---|---|---|
| 1 | 0x207 | GlobalChat | `buildGlobalChatInner`(0x207, 0x108B: u32 id@0, CP949 msg@+6) 신규 추가 → 글로벌(비-grid) 채널 relay에서 `logh7-auth-server.mjs:~2124`(broadcast 경로)에서 emit | 콘텐츠 부재 없음. 정책 결정 필요(글로벌 채널 도입 여부). 라이브: 2-player relay로 표시 검증 |
| 2 | 0x202 | SSLoginNG | `buildSsLoginNgInner`(0x202, 0x102B reject text CP949) 추가 → SS-login 거부 분기에서 emit(`logh7-login-session.mjs:1711` OK 분기의 반대 경로) | 정책 결정 필요(현 서버는 항상 OK). 거부 UX 없으면 불필요 — low value |

### 티어 2 — P2 stub, 빌더 존재(emit 스테이징만 배선; 콘텐츠/라이브 선결)

| 순위 | opcode | name | wireAction (server file:line) | blockedBy |
|---|---|---|---|---|
| 3 | 0x1204 | NotifySimpleInformationBase | world-info 틱에서 `state.add('base', baseRecs)` → `buildSimpleInfoTransaction(state.drain())` emit(`logh7-login-session.mjs:2069` 패턴 확장; 빌더 `simple-info.mjs:212`) | task #14(0x031f base) 콘텐츠 선결. base economy 레코드 매핑 라이브 A/B 필요 |
| 4 | 0x1207 | NotifySimpleInformationUnit | `state.add('unit', unitRecs)` 스테이징 후 emit(빌더 `simple-info.mjs:244`) | 유닛 요약 레코드 필드 의미 라이브 확인 필요 |
| 5 | 0x1205 | NotifySimpleInformationGrid | `state.add('grid', gridU32s)` 스테이징 후 emit(빌더 `simple-info.mjs:221`) | grid u32 비트필드 의미(소유/가시성) 라이브 A/B 선결. task #13(galaxy grid)와 연계 |
| 6 | 0x1203 | NotifySimpleInformationOutfit | `state.add('outfit', outfitRecs)` 스테이징 후 emit(빌더 `simple-info.mjs:203`) | outfit(함대) 레코드 0x2c 필드 매핑 라이브 확인 |
| 7 | 0x1202 | NotifySimpleInformationCharacter | 기존 emit(session.mjs:2069)의 opt-in 게이트 해제 검토 + 비-character kind 동반 스테이징 | conditional→default 승격은 **라이브 A/B 선결**(과거 LOGH_WORLD_PUSH가 SS 시퀀스 교란 관측, session.mjs:1715 주석). 0x120f 로스터와 충돌/중복 위험 검증 필요 |

### 라이브 A/B 선결로 분리 (P2~P3 레이아웃 미확정)

다음 stub들은 빌더는 있으나 클라 consumer 필드 의미가 RE 미확정 또는 play-visibility가 낮아
**먼저 라이브 A/B 캡처**로 레코드 해석을 고정한 뒤 배선한다(추론을 emit으로 승격 금지):
- 0x1206 Strategy, 0x1208 Card, 0x1209 Rank, 0x120a RankingChara, 0x120b CompletenessSupply,
  0x120c CardAvailableOutfitSeat, 0x120d CardAvailableBaseSeat, 0x120e OrderSuggestCharacter.
- 공통 blockedBy: (a) 레코드 stride 내부 필드 의미 라이브 미확정, (b) 대응 콘텐츠 테이블 부재
  (랭킹/카드/좌석 데이터는 원본 복구 안 됨 — 날조 금지), (c) 0x1200..0x1201 트랜잭션 안에서
  여러 kind 동시 스테이징 시 클라 누산기 순서 영향 라이브 확인 필요.

---

## 다음 단계 권장 (정직 요약)

1. emit 갭의 본질은 "빌더 부재"가 아니라 **스테이징 배선 부재 + 콘텐츠/라이브 미확정**이다.
   `codec/simple-info.mjs`는 13개 델타 빌더 + 트랜잭션 래퍼를 이미 갖췄다.
2. 가장 가치 있는 단일 배선은 **0x1204 Base**(task #14와 직접 연계, 행성/기지 패널 가시성 높음)이며,
   base economy 콘텐츠 확정이 선결.
3. 0x1202 character의 opt-in→default 승격은 **라이브 A/B 없이는 회귀 위험**(SS 시퀀스 교란 전례).
4. 0x202/0x207은 빌더 자체가 없으나 **정책 결정**(거부 UX / 글로벌 채널)이 선행해야 가치가 생긴다.
