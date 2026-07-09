# LOGH VII Revival — Session Handoff (2026-06-19)

> 다음 세션(또는 다른 에이전트) 시작점. 정독 후 `docs/logh7-gap-backlog.md`(35 태스크) + `docs/logh7-loop-state.md`(상세 증거)로 이어간다.
> **데이터 등급 원칙**: P0(클라/와이어 바이너리 확정)·P1(공식 매뉴얼/PDF)·P2(IV-EX/넷마블)·P3(절차/플레이스홀더). 추측을 P0로 승격 금지. 클라-대면 결과는 라이브 검증 전 단정 금지.

---

## 🟢 라이브 세션 결과 (2026-06-20 "라이브 세션으로 가자" + 클라 RE 풀어택)
캐논 월드 클라 라이브 + Frida 렌더-게이트 계측으로 **§1.3 "함대 안 보임" 근본원인 확정·픽스**(상세
docs/logh7-fleet-render-re.md §5-6, [[logh7-fleet-render-rootcause-2026-06-20]]):
- **라이브 확정 작동**: 풀 플로우(부팅→로비→캐릭→0x0f02 월드진입 전 코드)·HUD(라인하르트 초상화)·한글·
  **AI 함대전(LOGH_NPC_AI=1로 0x0426 공격 636회·이동/선회 28회 브로드캐스트)**. 서버 984테스트.
- **§1.3 원인 정정(Frida)**: turn-ready(FUN_004b7890)=1 게이트 **열림**(기존 "닫힘" 가설 반증). 렌더 FSM
  상태1(HUD 루프) 체류, 함대렌더 case0(FUN_0058d140)은 init 1회성. **진짜 원인=own_cell(+0x11178) 미설정**.
- **결정적 발견+픽스**: own_cell을 set하는 기존 패치 **strat-camera-focus가 playable 기본 스택에서 누락**돼
  있었음. → DEFAULT_STACK에 추가(tools/logh7_build_playable_client.py), playable.exe 재빌드. fleetfix EXE
  라이브: **전략 그리드 렌더 + 카메라 홈셀 센터링**(미포함은 검은 성운만), 부팅·안정·SHA복원 OK. (7288623)
- **잔여**: ①own-fleet **스프라이트**(case0 1회성) 정확배치 — spawn(FUN_004c2a80 @0x4c2b72)에서 unit.cell로
  own_cell set하는 패치 **설계+바이트검증 완료**(cave 0x5d5290 strat-camera-focus와 공유→병합 필요).
  ②플레이어 이동명령(0x0b01) — **2026-06-20 라이브 3사이클로 차단점 확정 + 가설 정정**: 차단=이동모드 진입
  (송신경로 sendB01/clickToCell/cellStatePush 0회·modeSetter/moveHandler 0회·slotResolver miss=false).
  ⚠️**정정**: 정적가설 "0x6a 게이트"는 **반증**(라이브 inputAccessor(0x6a)=non-null 포인터=객체접근자, 게이트
  열림). **실 블로커=state(0xf4) 고정 1 = 함대 미선택**(좌/우클릭·HUD·키 ~19종 어느 입력에도 불변). PAN/navGate는
  매프레임 내부호출(입력구동 아님)로 정정. **입력 주입 진단**: 키=PostMessage(DirectInput 못봄)·마우스=mouse_event
  (하드웨어). **🔴결정적 결론(§f-4, 3사이클)**: 창이 **포그라운드인데도** 우클릭→rclickHandler 0회·eventMatch
  type5 0회·navGate 커서 미추적 → **ui_explorer 현 입력 주입으로는 인-월드 전략맵 명령(선택/이동) 구동 불가**
  (로비/캐릭생성=메시지UI는 됨, 인-월드=D3D8/DirectInput 추정은 안 잡힘). 서버 권위적 AI 함대전은 입력무관 동작.
  **경로(별도 인프라 세션)**: DirectInput 레벨 Frida 주입(IDirectInputDevice8::GetDeviceState/GetDeviceData 후킹)
  또는 커서-매핑 검증. → **이 프런티어는 입력-인프라 작업이므로 보류, 본 루프는 서버 Phase B 갭마감으로 피벗.**
- **도구 강화**: tools/logh7_frida_movemode_probe.py에 렌더-게이트 훅(turnReady/recvQueueScan/fleetRender/
  slotResolver/renderGate + own_cell write-watch) + **이동-명령 훅**(sendB01/clickToCell/cellStatePush/
  inputAccessor + 입력게이트 write-watch) + **입력-이벤트 검증 훅**(inputEventSrc/eventMatch/rclickHandler)
  추가(selfcheck 17훅 통과).

## 🟢 서버 Phase B 갭마감 (2026-06-20, 인-월드 입력 보류 후 피벗)
인-월드 입력이 인프라 게이트됨을 확정한 뒤 계획대로 순수-서버 갭마감으로 전환(자율·테스트·라이브 불필요):
- **✅ B6 쿠데타(叛乱) 라이프사이클** (`src/server/logh7-coup.mjs` 신규, +10테스트): logh7-intel 프리미티브
  (叛乱忠誠도·canStartCoup·espionage roll) 위에 캐논 6커맨드 상태머신 — 叛意(수괴)·謀議(포섭,情報 roll)·
  説得(유닛 충성↑→반란예정)·参加·叛乱(발동→충성유닛 반란군 분리)·査閲(탐지→발동차단). **완전승리=쿠데타불가**
  캐논 게이트(매뉴얼 p78). 순수(roll 주입), 수치=SERVER DESIGN. 클라 opcode 미확정이라 와이어 미배선(로직만).
  서버 **994테스트**.
- **✅ B6 첩보(諜報) 공작 라이프사이클** (`src/server/logh7-espionage.mjs` 신규, +9테스트): intel.mjs espionage
  roll 위에 캐논 諜報 커맨드 — **체포 매트릭스**(逮捕許可→執行命令→逮捕命令, 리스트+권한+동소 게이트→구금)·
  **침투 공작**(潜入→情報/破壊/脱出, 실패=발각+이탈)·煽動(支持率↓)·監視·襲撃. 순수(roll 주입). 서버 **1003테스트**.
- **→ B6(첩보&쿠데타) 도메인 완성** (intel 프리미티브 + coup 라이프사이클 + espionage 공작). 와이어는 클라 opcode
  확정 시 배선(로직·테스트 완비). 잔여 연계: 処断(구금자 처단)은 정치 도메인, detained→personnel 상태 노출.
- **✅ B5 age-drift 배선** (world-state + strategic-sim, +5통합테스트): 캐릭터 abilities[8]+age 추가 +
  applyMonthlyAgeDrift(권위적 rng, 젊으면↑·노년↓) + createStrategicSim 월간 훅(ticksPerMonth=30) → 무유저
  갤럭시서 인물 성장/쇠퇴. 서버 **1008테스트**.
- **⚠️ backlog 대규모 stale 정정(감사)**: 전 Phase B 도메인이 [모듈+테스트] 보유 — B4(air-combat 戦闘艇·
  combat-death 戦死·morale·surrender)·B5(imperial-titles 작위/봉토·age-drift)·B6(intel/coup/espionage)·
  B1(economy)·무유저 갤럭시 코어(strategic-sim) 전부 구현됨. "미구현 추정" 항목 대부분 **이미 구현**.
  상세=docs/logh7-gap-backlog.md "닫힘 2026-06-20". **진짜 잔여=배선/검증**: air-combat→battle 배선·
  intel/coup/espionage 와이어(opcode 확정 시)·strategicTick에 economy/combat-death 통합 검증·**Phase A2(codec
  추출)/A3(CQRS) 구조 리팩터**(A1 config·npm start은 완료)·인-월드 입력(DirectInput, 별도 인프라).

## 🟢 적대적 감사 + 구현 (2026-06-20 ultracode, "계속 구현")
8 도메인 병렬 감사 + 발견별 독립 적대검증(51 에이전트, 워크플로 wimljalbl) → **검증된 갭 41개**(추적
docs/logh7-audit-2026-06-20.md). 중복제거 후 P0부터 구현:
- ☑ **P0** private-delivery 누수(귓속말/개인메일/IM/명령메일이 dispatchNotifies targetConnectionId 무시로
  월드 전원 브로드캐스트) → planNotifyDispatch(순수,export) unicast 분기. **프라이버시 픽스**.
- ☑ **P1** SpotChat 0x0f1d가 command-engine GridChat 핸들러에 가로채여 오파싱 → 0x0f1c 전용화→processSocial.
- ☑ **P1** canCommand(저사기/혼란 지휘불가 p442) 게이트 MOVE/ATTACK/SHOOT/FIGHT 배선.
- ☑ **P1** merit 리셋(캐논§5.6 昇進→0/降等→100). ☑ **P2** 地上戦 반격피해 공격측 적용·抜擢 정원캡.
  ☑ **P3** resolveLandCombat result=2·抜擢 펀더 소유권·countAtRank null·confusion 게이트.
- 서버 **1023테스트**(+15). **잔여(후속 iteration)**: P1 economy-정복 동기·age-drift boot 시드(현 무유저
  no-op)·economyState 스냅샷·evaluateEnding 전략틱·政治 approval/security; P2/P3 다수(audit 문서 참조).

## 🔴 라이브 세션 결과 (2026-06-19 "전부 구현" — 사용자 요청)
실클라 라이브 검증(ui_explorer, movetest=korean+menufix+dlgfix+earlygrid+**strat-camera-focus cave**):
- **✅ 라이브 확정(major)**: 풀 부팅(서버→로그인→로비→세션→캐릭생성 0x1008→**월드진입 0x0f02**)·전략맵(0x0313/0x0314 함대·**0x0315 terrain**·0x0323 캐릭·0x0325 유닛·0x0b09/0x0b0a grid-enter 전부 발화)·**한글 렌더링(로비 7버튼+HUD)**·라인하르트 캐릭터/기함/HUD·**섹터 그리드 렌더**·카메라 패닝. camera-focus 패치 EXE end-to-end 부팅 안정(shaVerified:true 복원).
- **🔴 0x0b01 이동 미발화(프런티어 재확인)**: 맵 **좌클릭=카메라 패닝·우클릭=무동작** → 이동모드 진입은 맵 제스처 아님. cave 패치(셀 항행판정)는 필요조건이나 **이동모드 진입 입력/UI 제스처(DAT_009d2a3c 1→2)가 미확정**(별도 핸들러). RE 진전=`FUN_00570a10`(이동모드 핸들러)·`FUN_004d51d0(,2)`(모드세터)·커맨드 0x21 식별. **이동모드 트리거 전담 RE 진행중**(a72377968, →docs/logh7-movemode-re.md).
- **결론**: 월드진입·현지화·terrain 전달은 라이브 검증 완료. **인월드 커맨드(0x0b01 이동, 하류 정치/공중전/쿠데타 캡처)는 이동모드 UI 바인딩 RE가 게이트** — 빈 클릭 불가, 디컴파일 추적 필요(다중사이클).
- **이동모드 RE 완료**(docs/logh7-movemode-re.md): ⚠️전제 정정 — DAT_009d2a3c는 **writer 없는 read-only 서버응답 채널**(원인 아님). 실 흐름=**함대선택→명령 카테고리 다이얼로그(SELECT_TXT_STRATEGY_CATEGORY, FUN_0052f700←FUN_004fd100)→이동 항목→mode=2(FUN_004d51d0)→목적지셀(항행게이트 FUN_004d6310 ∈{1,3})→FSM FUN_0050d230 case 0x3a→0x0b01**(송신체인 P0 확정). 다이얼로그 트리거=**입력상태 DAT_02214325 &0x40**(vs 패닝 DAT_02214324 &0x40), 메시지펌프가 채움→물리입력 라이브확인 필요. **서버 G4(함대 그리드오브젝트)는 이미 구현**(login-session:621 fleetCell/fleetContentId).
- **라이브 실험 2세션(move2)**: 좌클릭=패닝·우클릭=무동작·더블클릭=무동작 → **함대 선택 자체가 등록 안 됨**(셀 hit-test 미스 또는 선택가능-오브젝트 포맷 불일치). 블라인드 클릭 한계 확정.
- **✅ Frida 계측 완료**(tools/logh7_frida_movemode_probe.py, docs/logh7-movemode-re.md §(e)): camera-focus 클라에 attach, 5훅 + 입력 스윕. **terrain 항행판정 작동 확정**(navGate passed=true 홈셀(50,24)+커서셀 — "0x0315 빈/차단" 우려 해소)·커서이동 작동. 단 **moveHandler/modeSetter 0회**(20종 입력 어느 것도)·DAT_02214325 항상 0 → **블록=이동모드 진입 입력/전제(G5 linkage)** 정밀 국소화. 다음 RE=vtable[53]@0x676b38 dispatch·G5(FUN_004c2a80 char↔unit linkage) Frida검증·다이얼로그 오픈조건. **0x0b01 미크랙(프로젝트 최난제)이나 terrain 작동 증명 + 블록 정밀 국소화로 추측→증거 전환.**

## 🟢 LIVE 진행중 — 서버 재아키텍처 (2026-06-19 후반 세션)

**승인된 플랜**: `C:\Users\user\.claude\plans\snazzy-doodling-stream.md` (한글). 목표 = **클린 아키텍처(3-레이어+CQRS) · env 없이 `npm start` 제로설정 · 인메모리 authoritative + DB 덤프(→ Docker RDB) · 전 캐논 갭 마감(원작 未実装 포함) · 커스텀 시스템 확장성 · 베이크인 클라**. Phase A(기반)→B(갭마감)→C(확장)→D(출하).

**표준 지침(메모리에도 저장)**: ① 코드 **주석은 한글** ② **동작1개→핸드오프 갱신 반복**(토큰 끊김 대비) ③ 데이터등급 P0~P3 ④ 클라-대면 라이브검증 전 단정금지.

### 이번 세션 완료 (서버 테스트 **810** 그린 유지)
1. **0x0315 terrain 인코딩** (RE+매뉴얼 확정): 항행성 게이트=**objectTable[V].byte1∈{1,3}**(raw 셀값 아님). 空間=값1(byte1=1)·航行不能=값2·プラズマ嵐=값0(둘 다 차단,라벨만)·성계=4+idx(byte1=3). `buildStrategicGalaxyGrid({terrain,plasmaCells})` + `TERRAIN_VALUE` + 오버플로 가드. 세션 게이트 `LOGH_STRAT_TERRAIN`(+`galaxyPlasmaCells` 로더). 실그리드 RLE 970B/5000. 테스트 4종 추가. 상세=`docs/logh7-strategic-map-wire.md`(2026-06-19 블록), [[logh7-terrain-navigability-model]]. **현재 버그 발견**: 기존 빈셀=값0=전배경 차단 → 0x0b01 이동 블로커 추정(terrain on이 유력 언락, **라이브 미검증**).
2. **플라즈마 위치 = 캐논 소스 없음**(매뉴얼 p31은 타입만 명시·위치 X, p101 銀河マップ 본문없음, 원작 소설/웹 무). → 플라즈마는 옵션 오버레이(`content/galaxy-plasma-cells.json` 부재=플라즈마 0), 추후 P2(星系図 성운)/P3(설계).
3. **매뉴얼 101p 전체 데이터마이닝** → `docs/logh7-manual-canon.md`(619 캐논 팩트, 커맨드 CP/시간 78개표·계급정원·함선성능·유닛상한·**§14 서버구현맵 ✅/⚠️**·원작 未実装 목록). Phase B의 기준 룰셋.
4. **A1 config 통합 + 제로설정** (Phase A1 1차): `src/server/logh7-config.mjs`(`loadConfig`·`PLAYABLE_ENV_DEFAULTS`·`applyEnvDefaults`·`loadDotEnv`). `package.json` `start` 추가. serveAuth가 `.env`→playable기본값 적용(우선순위 셸env>.env>프리셋). `.env.example`+`.gitignore`. **65 env→config 깊은 이관은 미완(다음)**.
5. **서버↔클라 분리** (사용자 지적): 서버가 클라 EXE 런타임 의존 제거. child-codec 테이블을 **`content/crypto/child-codec-tables.json`로 커밋**(추출툴 `tools/logh7_extract_codec_tables.mjs`). codec에 `resolveChildCodecTables`/`DEFAULT_CODEC_TABLES_PATH`, `buildPhase3...`은 `tables` 받음. auth-server·serveAuth가 tables 사용(EXE 불필요, `--client-exe`로 재추출만). **검증: env·EXE 없이 programmatic 부팅 OK(127.0.0.1 바인딩)**.
6. **A4 영속성 포트 ✅(완료)**: `src/server/logh7-repository.mjs`(`createRepository({backend:'memory'|'json'|...})` + `composeSnapshot`, json은 원자적 tmp→rename, sqlite/postgres는 후순위 명확 stub). world-state **`toSnapshot()`/`restore()`**(Map/Set/배열). **부팅 배선 완료**: startLogh7AuthServer가 `repository`(opt-in) 받아 start 시 load→restore, 주기 write-behind(unref) + close 시 마지막 save. serveAuth는 기본 on(json, `.omo/state/world-snapshot.json`, `LOGH_PERSIST=0`로 끔). 테스트 6종 + **스모크 검증(close 저장→재부팅 로드 OK)**. (테스트는 repository 미지정 → 영속성 off라 안전.) 나중에 backend만 Docker RDB로 교체.

### 이번 세션 후속 — TIER A 통합 + 함대렌더 정정 (서버 테스트 **937** 그린)
7. **⚠️ 병렬 worktree 워크플로 교훈**: TIER A를 4개 worktree-격리 에이전트로 동시 구현했으나, Workflow의
   worktree가 **세션-시작 커밋(813dd28, main 대비 69커밋 뒤)**에서 분기 → 에이전트들이 main이 세션 중
   이미 구현한 것을 재구현(중복). 현 main 재감사 결과 **A1/A2/A3/A4/A6/A8/STEP6 = 이미 done**. cherry-pick
   불가(stale base 충돌). → 진짜 신규분만 추출 통합. **다음 워크플로는 base가 현재 main인지 확인 필수**.
8. **✅ STEP5 전투 종결 (5f14cbc)**: battle-engine `concludeBattle`/`tallyCasualties`/`closeBattleField`
   + `RETURN_TO_STRATEGIC_MODE_KIND` (순수 결정론). command-engine `resolveBattleConclusion`이 fire(0x405/
   0x406)·fight(0x407) 해소 직후 전멸/공멸 판정→0x042f(modeKind=2) 전략복귀 + closeBattle. "전투 진입은
   되나 탈출 불가" 갭 마감.
9. **✅ A7 시나리오/세션 메타 (eef8a57)**: world-state `setScenarioInfo`/`getScenarioInfo`/`advanceTurn`/
   `setEnding` + toSnapshot/restore 왕복. loadScenarioInto가 시나리오 메타→world 배선. canon-801-07.json에
   sessionName + startYear=801(매뉴얼 p72 宇宙暦801) 추가, description 연도오타(791/482→801/492) 정정.
10. **✅ FR 함대렌더 정정 (55e1711)**: `buildStrategicGalaxyGrid` fleetAsMarker(기본 false) 게이트 —
    함대를 klass-3 마커로 안 박음(docs/logh7-fleet-render-re.md §1.1 P0: object-table엔 함대 클래스 없음,
    fleetValue=3=가짜 성계 dot 오인). 함대 셀 항행성은 terrain SPACE(byte1=1)가 담당, 렌더는 0x0325 경로.
    login-session 폴백도 SPACE로. **⚠️ 가시 렌더는 여전히 클라측 own-fleet cell(+0x11178, WRITE 0×, §1.3)
    블로커에 의존 — 이 커밋은 "틀린 렌더 제거"이지 "가시화 완성" 아님**. +0x11178 쓰기경로=Frida 워치포인트 필요.
11. **명명 상수**(200979b): 0x0325 count 상한 `SS_RESP_INFO_UNIT_MAX`=600. stale worktree 4종 정리 완료.
12. **✅ 캐논 801-07 기본 출하 (e196c24)**: PLAYABLE_ENV_DEFAULTS에 LOGH_SCENARIO=canon-801-07.json →
    제로설정 `npm start`가 80성계+24함대+120부대+A7메타(startYear 801)를 시드. **스모크 검증 완료**(빈 env→
    playable→config→로드→world: counts{systems:80,ships:24,fleets:24,troops:120}, getScenarioInfo OK).
    이제 A7+FR이 실제 부팅에서 데이터를 갖는다. serveAuth만 applyEnvDefaults라 테스트 무영향.
13. **⚠️ 세션 picker 13-unit 캡 주의(미수행, 의도적)**: A7 sessionName('은하영웅전설 VII — 宇宙暦801年')을
    0x2006 세션레코드에 넣으면 **SESSION_NAME_MAX_UNITS=13 초과로 클라 파서 bail → 빈 picker**(메모리의
    그 회귀 버그). 따라서 A7 sessionName은 **월드 메타 전용**으로 두고 0x2006(DEFAULT_SESSIONS)은 건드리지
    않음. 캐논 세션명을 picker에 노출하려면 **≤13 unit 짧은 이름**(예 'LOGH VII')을 별도 필드로 + 라이브
    picker 재검증 필요. (codec/scenario-session.mjs.)
14. **✅ S5 권위적 턴틱 + 완전승리 (01e52df)**: world-state evaluateEnding()(교전 진영 성계보유 1개면
    完全勝利, 페잔/중립 제외, ending=1 P3 마커·기존 보존). auth-server runEconomyTickOnce가 30일 주기
    경계마다 advanceTurn(1)+evaluateEnding 호출. currentTurn=경과 경제주기 수. 서버 내부(클라 와이어 무).
    이로써 A7 advanceTurn/setEnding이 실제 구동된다(완전승리=쿠데타불가 게이트 기반).

### ⚠️ Phase B 재감사 결과 (이번 세션 발견)
combat-gaps 순수함수 4종(戦闘艇 air-combat·戦死 combat-death·艦隊最大士気 morale·降伏勧告 surrender)은
**모듈+단위테스트 이미 존재**. 배선 진행상황:
- **✅ 艦隊最大士気(morale) 배선 (c626e8f)**: EncourageFlagship 0x7fff→clampMoraleToMax(maxMorale).
  battle-ops addUnit이 leadership→fleetMaxMorale. **단 현 spawn은 leadership 미시드** → maxMorale 기본 100.
- **✅ 전투 캐릭터 레지스트리 foundation (6cd6a28)**: world-state upsertCharacter/getCharacter/
  getCharacterByFlagship/listCharacters + snapshot + loadScenarioInto characters 시드. 戦死/항복 배선의
  사령관 데이터(統率/rank/deathToggle/returnPlanet) 단일 출처 — char-registry 부재 블로커 해소.
- **✅ 戦死(combat-death) 배선 (e5bd8f2)**: command-engine fire/fight 격침분기 resolveFlagshipLoss —
  getCharacterByFlagship로 旗艦이면 負傷워프(생존·injured) vs 사망(准将+ 평가포인트). result.casualties 노출.
- **✅ 플레이어 char 시드 (5ebefba)**: createLoginSession(worldState 옵션) — 월드진입 시 seedPlayerCharacter가
  플레이어 본인을 flagship=unitId 링크로 레지스트리에 시드. **戦死가 플레이어 end-to-end 가동**(진입→시드→
  기함격침→負傷/사망). 수직 완성: char-registry(6cd6a28)→戦死 배선(e5bd8f2)→시드(5ebefba).
- **✅ 캐논 NPC 사령관 시드 (473b3e8)**: tools/logh7_assign_canon_commanders.mjs로 로스터 14명을 canon-801-07
  함대에 진영별 1:1 배정(flagship=lead ship, returnPlanet=HQ) + characters[]. loadScenarioInto가 레지스트리에
  시드 → **combat-gaps가 canon 월드 NPC에서 가동**(라인하르트 등). char system 수직 완성(룰→배선→플레이어→NPC).
- **✅ 降伏勧告(surrender) 배선 (1ebadf2)**: fight 핸들러 recommendSurrender — 공격측 기함 사령관 統率로
  저사기 생존 적에게 항복 권고(resolveBattleSurrenders). 수락 시 markSurrendered=무력화(surrendered+사기0,
  격침 아님, pickTarget/NPC 제외). createWorldState({seed}) 결정론 rng + state.rng() 추가. inert화라
  클라싱크 이슈 없음. **→ combat-gaps 4종(air-combat·戦死·morale·surrender) 전부 battle-flow 배선 완료(§B4 완성).**
- ⬜ **canCommand(저사기 지휘불가) 게이트**: 기존 명령 경로 차단 회귀위험 → 보류(모듈 주석 권고).
- **✅ 전투 통합 테스트 + 버그픽스 (457733a)**: logh7-combat-integration — char→戦死→降伏→STEP5 end-to-end
  합성 검증. **실버그 포착**: 항복 함선이 listShips에 남아 전멸판정/STEP5를 막던 것 수정(tallyCasualties가
  surrendered를 생존 제외 + resolveBattleConclusion이 surrenderedIds도 트리거). 降伏↔STEP5 연동 완성.
- **✅ NPC 戦死 통합 + world-state 통합 (dd07d30)**: resolveFlagshipLoss를 world-state 메서드로 이동(공용),
  runNpcTick 격침분기에 배선 → **戦死가 플레이어/NPC 모든 전투 경로에서 일관 작동**(canon NPC 사령관 전사 반영).
  ⬜ NPC 자율 전투의 surrender/STEP5는 미적용(STEP5=플레이어 클라 모드전환이라 NPC-only엔 무의미; surrender는 후순위).
- **✅ 영속성 라운드트립 통합 테스트 (7f8c24b)**: snapshot/restore가 전 상태(players/ships[항복]/troops/systems/
  fleets/characters/scenario/battle/chat/clock) 손실 없이 왕복 + 깊은복사 검증. 재시작 영속 계약 고정(회귀 가드).
- **✅ 캐논 콘텐츠 무결성 가드 + rank 버그픽스 (a35674e)**: logh7-canon-content-integrity(canon-801-07 규모·
  참조무결성·진영일치 고정). **실버그 포착**: 사령관 배정이 Julian('Lieutenant')에 rank 0(무효) 기록 →
  rank-table에 느슨한 영문 별칭(lieutenant→中尉) 추가로 수정. **검증 접근이 잡은 실이슈 4건**(항복-전멸·
  NPC戦死·mojibake·rank0) — 통합/무결성 테스트가 고가치.

**personnel-honors §B5 진행**:
- **✅ 4.4 계급 사다리 5법칙 + 정원캡 — 수직 완성 (4183168 + 5203345)**: logh7-rank-ladder.mjs 순수룰
  (compareLadder/sortLadder/RANK_HEADCOUNT/canPromoteTo) + personnel RANK_UP에 정원 게이트 배선
  (addCharacter faction + countAtRank → 元帥5 등 초과 시 'rank-full', 중립진영 무캡=회귀0).
- ⬜ 4.1 작위수여(0x0356 wire)·4.2 봉토(economy 연계)·4.3 훈장(0x0356 wire)·4.6 연령드리프트(rng+틱, age/
  abilities 데이터 필요)·4.7 기함교체(char.flagship 활용)·4.8 체포매트릭스·4.9 관계(0x0356 wire). 다수 0x0356
  라이브 또는 데이터 의존.
- ⚠️ **spawn 배선 잔여**: auth-server가 캐릭터(로스터/시나리오)를 worldState.upsertCharacter로 시드 + 함선의
  commander 링크를 거는 spawn 경로는 아직(레지스트리는 준비됨, 시나리오 characters로는 시드됨).
economy(tax/treasury/approval/security/30일틱)는 거의 완성. intel-coup는 P3(opcode 미확정).
**즉 서버 순수로직은 대부분 완성, 남은 진짜 갭은 (a)commander-leadership spawn 플러밍→戦死/surrender 배선
(b)클라측 RE(§1.3 함대 가시화·0x0b01). (a)는 서버 무-라이브, (b)는 라이브/RE.**

### 🔴 다음 최우선 프런티어 (라이브/RE, 메인-직렬)
1. **§1.3 own-fleet cell(+0x11178) 클라측 RE** — 함대 가시화의 실제 블로커(사용자 핵심 이슈 "함대 안 보임").
   Frida 쓰기 워치포인트(`DAT_007cd04c+0x11178`)로 무엇이 쓰는지 확정(클릭/선택 핸들러 추정). docs/logh7-fleet-render-re.md §1.3·§4.
2. **0x0b01 이동모드 진입** — 인월드 조작 프런티어(docs/logh7-movemode-re.md). 다이얼로그 오픈조건(입력상태 DAT_02214325 &0x40) 물리입력 라이브확인.
3. combat-gaps 배선(戦死→COMMAND_FIGHT 격침분기·morale clamp·surrender NPC틱) + 각 라이브검증.

### 즉시 다음 (Phase A 잔여)
1. **A1c**: login-session/auth-server의 ~65 `process.env.LOGH_*` 깊은 읽기를 `config.*`로 실제 이관(현재는 playable env 브리지만). createLoginSession/startLogh7AuthServer가 config 객체 주입받게.
2. **A2**: `src/server/codec/`로 순수 build*Inner/parse* ~150개 이동(re-export shim, 매 이동 테스트그린).
3. **A3**: command→event→projection + 핸들러 레지스트리(인라인 if체인 제거).
4. **A4**: `logh7-repository.mjs` 영속성 포트(memory/json/sqlite, boot로드+덤프, postgres stub).
5. (A 끝나면) **Phase B 갭마감** 도메인별 + **라이브검증**(terrain→0x0b01).

### 라이브 검증 대기 (needsLive, 메인-직렬)
- terrain on 월드(`LOGH_STRAT_TERRAIN=1`, 이제 playable 기본 on)에서 전략맵 항행공간 렌더 + **실제 0x0b01 이동** 발생 여부. ⚠️스플래시 ~30초 대기 필수.

### 사용자 추가 백로그 (이번 세션, 플랜 외 명시)
- **클라 깨지는 텍스트 전부 수정**(현지화 트랙): String.txt(cp949)·.rsrc 메뉴(UTF-16LE)·잔존 일본어·?/박스 글리프. 분석=데이터(병렬 가능), 수정후 검증=라이브. 스킬 `/logh7-localize`.
  - **✅ P0 mojibake 잔존 해소 (5872bd1)**: text-classified.json에 cp949 수정 미반영분 6건(사기값/사기치/재고량)
    교정(msgdat-full과 동일 검증값) + 무결성 가드(logh7-localization-integrity) — 추출 회귀 시 포착. #1301
    (ﾀ釥邱ｮ, byte손상 의심)은 재추출 전 보존. ⚠️ 클라 화면 렌더는 라이브 검증 대기. **잔여**: 소스1 MFC 셸
    UI 116건 미번역(별도 트랙, 게임본문 아님)·#1301 재추출.
- **라이브 클라 드라이브 지속**: 메인-직렬로 진행(클라 1개·스플래시 타이밍). 동시성 모델 [[logh7-concurrency-model]].
- (플랜 내) 전 갭 마감(Phase B, 스펙 워크플로 백그라운드 진행중→`docs/logh7-phase-b-backlog.md`), 커스텀 시스템(Phase C), 베이크인 클라(Phase D).

### 동시성 진행 (이번 세션 모델)
- 백그라운드 병렬: Phase B 스펙 워크플로 **✅완료** → `docs/logh7-phase-b-backlog.md`(544줄, 8도메인, 0장 우선순위표+9장 의존그래프). 우선순위=movement(0x0b01 라이브언락) 최우선 → content-verify 게이트 선행 → economy/personnel/combat self-contained → operations → ai/intel-coup. **게임클록은 economy+operations 공용 인프라(단일 설계)**.
- 메인-직렬: 공유파일 편집/배선, 라이브 검증.

### Phase B 착수 순서 (백로그 기준)
1. **게임클록 ✅(완료)**: `src/server/logh7-game-clock.mjs`(`REAL_MS_PER_GAME_DAY=3,600,000` 24×·`GAME_DAYS_PER_MONTH=30` CONFIRMED, `createGameClock`/`gameDaysCrossed` 순수·결정론). world-state 통합(`gameDayOf/gameMonthOf` 노출 + `clockStartMs` 스냅샷 보존 → 재시작 게임시간 연속). 테스트 6종. **서버 816 그린.**
2. content-verify 게이트(인코딩 전 데이터 재OCR/대조) — economy/combat 수치 전제
3. movement 0x0b01 라이브 언락 검증
4. **economy 코어 ✅(부분완료)**: `src/server/logh7-economy.mjs`(`createEconomyState`·`computePlanetTax`(P3 공식)·`runEconomyTick`(30일 국고누적)·treasury(add/spend)·지지/치안 baseline회귀·**`seedEconomyFromSystems`**(성계→행성 진영별 등록+P3 세원)·toSnapshot/restore). `ECONOMY_TUNING` P3 계수 명시. 테스트 9종. **825 그린.** **`tickIfDue`**(30일 경계 1회) + **auth-server 배선 ✅**(게임클록 부팅앵커 `clockStartMs:Date.now()`, contentPack 성계 시드, `economyTickOnce`/`economyState` 노출, 게이트 `LOGH_ECONOMY`=1 기본 off, economyHandle unref 인터벌). 테스트 12종. **828 그린.** 잔여=정치커맨드 §1.5(opcode RE 필요)·와이어 패널(🔴라이브)·세수계수 P3 튜닝.
5. **combat-gaps 3.2 戦死 토글 ✅(순수)**: `src/server/logh7-combat-death.mjs`(`resolveFlagshipDestroyed`=토글off 負傷+帰還惑星/出身地 워프·생존, on 사망+`rankDeathAward` 准将+ 평가포인트 SERVER DESIGN). 진영-로컬 准将(제국9/동맹10) rank-table 해석. 테스트 5종. **833 그린.** 잔여=command-engine COMMAND_FIGHT 旗艦격침 분기 배선(🔴라이브)·returnPlanet 와이어. 다음 combat: 3.3 사기(회귀주의).
5b. **combat-gaps 3.1 戦闘艇 ✅(순수)**: `src/server/logh7-air-combat.mjs`(`computeAirCombat` 對艦=damage+slowFactor / 邀撃=양측 격감, `canLaunchFighters` 物資≥10 게이트). 발진 10物資 캐논(p50), 공격력/slow/격감수 SERVER DESIGN. 테스트 5종. **838 그린.** 잔여=battle-ops/command-engine AIR_BATTLE 스텁 교체 배선(🔴라이브 0x040e/0x0428)·ship fighters 필드 시드.
5c. **combat-gaps 3.4 降伏勧告 ✅(순수)**: `src/server/logh7-surrender.mjs`(`surrenderChance` 統率↑·표적사기↓→성공률, `resolveSurrender` roll 주입 재현). 곡선 SERVER DESIGN, "統率이 좌우" 캐논. 테스트 5종. **843 그린.** 잔여=SURRENDER 핸들러 배선+opcode RE(🔴)·surrenderShip 무력화/평가포인트.
5d. **combat-gaps 3.3 사기 ✅(순수부)**: `src/server/logh7-morale.mjs`(`fleetMaxMorale` 統率→상한, `canCommand` 사기<20/혼란→지휘불가, `clampMoraleToMax`). 곡선·임계 SERVER DESIGN. 테스트 4종. **847 그린.** **combat 순수 레이어 3.1/3.2/3.3/3.4 완료.** 잔여(combat 통합·회귀주의)=지휘게이트를 ChangeMode/Authority/Encourage 명령경로 적용 + EncourageFlagship clamp를 maxMorale로 교체(🔴라이브).
6. personnel → operations → ai/intel-coup (백로그 순)
   - **§B3 operation-plan ✅(순수)**: `src/server/logh7-operation-plan.mjs`(createOperationPlan draft, validateOperationPlan 타깃/유닛상한, issuePlan 입안≠발령 분리·불변). 規則 캐논, 상한값 호출자. 테스트 6종. **883 그린.**
   - **✅ Phase B 순수-로직 레이어 완성** (economy·combat×4·personnel×2·intel/coup·CP→XP·command-range·command-cost·operation-plan). **다음 큰 가치=통합 배선(command-engine 라우팅→순수모듈+wire)·라이브 검증·movement 0x0b01·opcode RE → 메인-직렬/라이브 패스 필요.** 루프(백그라운드)는 A2 codec 추출(기계적·안전) 이어감.
   - **§B3 command-cost ✅**: `src/server/logh7-command-cost.mjs`(loadCommandTable 78커맨드 표[P1], lookupCommand, commandTiming, effectiveCpCost=0우회/2배代用, canAfford). 표·規則 캐논. 테스트 3종. **877 그린.** 잔여=command-engine 실행 시 CP 풀 차감/대기 적용 배선·작전계획 lifecycle·AI §B7.
   - **📌 순수-로직 레이어 거의 완성**: economy/combat(4)/personnel(2)/intel·coup/CP→XP/command-range/command-cost. **잔여 대부분은 통합 배선(command-engine 라우팅+wire)+라이브 검증** → 메인-직렬 패스 필요(루프 백그라운드 불가). movement 0x0b01·정치/첩보 opcode는 RE+live.
   - **§B5 relations ✅(순수)**: `src/server/logh7-relations.mjs`(`createRelationsState` charId별 影響力/友好度, `adjustInfluence`(演説/夜会)·`adjustFriendliness`(狩猟/談話) 0..100 클램프, toSnapshot/restore). 곡선·델타 SERVER DESIGN, 사다리 law4 입력. 테스트 6종. **891 그린.** 잔여=社交 커맨드 opcode RE(🔴, social 도메인은 0x0f0x mail/messenger만 — 夜会/狩猟/会談/演説 코드 미확정)·핸들러 배선. **⚠️ 순수-로직 레이어 사실상 소진 — relations가 마지막 깔끔한 모듈. 이후 가치는 전부 통합/RE/라이브(메인-직렬).**
   - **A1 config ✅증분**: 경제 게이트(`LOGH_ECONOMY`)를 `loadConfig.gameplay.economy`+`economyIntervalMs`로 매핑, `PLAYABLE_ENV_DEFAULTS`에 추가 → **제로설정 `npm start`에서 경제 default-ON**(서버 내부 상태라 클라 노출 없어 안전). env override 유지. 테스트 +2. **893 그린.** (auth-server는 여전히 `process.env.LOGH_ECONOMY` 직접 읽음 — applyEnvDefaults가 채우므로 동작 정상. 완전한 A1c=auth-server가 config 객체 소비하도록 시그니처 이관, 후속.)
   - **Phase C 시나리오 로더 ✅**: `src/server/logh7-scenario.mjs`(`validateScenario` 순수 — name 필수/컬렉션 배열/엔티티 id·system name 필수, `loadScenarioInto(world,scenario)` — 성계/함선/함대/지상부대를 **기존 world-state 시드 API**(seedSystems/upsertShip/upsertFleet/upsertTroop)에만 배선·코어 무수정, clockStartMs는 생성시 결정이라 메타로 노출). 커스텀 시나리오+캐논 801-07 기본시작의 토대. 테스트 4종(실 createWorldState 배선 검증). **897 그린.** ⚠️seedSystems는 `faction`→`owner`로 저장(주의). 잔여=auth-server 부팅 경로가 시나리오 데이터파일 로드→world 시드(현재 contentPack 직접 시드)·기본 시나리오 JSON 출하·mod의 scenario 오버레이.
   - **Phase C 시나리오 fs+docs ✅**: `loadScenarioFile`(throw 없이 errors 보고·부팅 폴백 용이), 출하 예제 `content/scenarios/example-skirmish.json`(제국vs동맹 소규모, 포맷 시연), `docs/logh7-modding.md`(콘텐츠 오버레이 mod-loader + 시나리오 합치는 실전 워크드 예제). 테스트 +2. **899 그린.** **Phase C 데이터 표면 완료**(mod-loader 콘텐츠 오버레이 + scenario 시작상태 둘 다 fs로더+검증+실배선+문서). 잔여=auth-server 부팅이 시나리오 로드 사용하게 배선(공유파일·메인직렬)·캐논 801-07 검증배치 출하·룰훅(A3 핸들러레지스트리 위).
   - **Phase C→D 부팅 배선 ✅**: auth-server가 `LOGH_SCENARIO=경로`면 부팅 시 시나리오 로드 → clockStartMs를 world 생성에 반영 + 콘텐츠 시드 위에 엔티티 레이어(upsert 멱등). 미설정/로드실패면 현 동작 불변(graceful·경고만). `worldState`/`bootScenarioName` 반환 노출(관측), `config.content.scenarioPath` 매핑. 테스트 +4(실 부팅 시드 검증 incl. example-skirmish 함대/함선/성계, 깨진경로 폴백, config). **902 그린.** **이제 `LOGH_SCENARIO`로 커스텀 시작상태가 실제 부팅에 적용됨.** 잔여=캐논 801-07 검증배치 JSON 출하(content-verify 적대검증 후)·기본 시나리오로 출하·함급 stats→upsertShip stats 연결.
   - **A1c config 스레딩 ✅**: `startLogh7AuthServer({...config = loadConfig(process.env)})`. relay/authoritative/economy(+interval)/scenario/content-db/mods 읽기를 `process.env` 직접→`config.*`로 이행(동작 보존). **명시 config 주입 시 env 없이 동작 결정(DIP)** — 테스트로 증명(env 비우고 config로 경제 활성). **903 그린.** 잔여 A1c=login-session/login-protocol의 나머지 ~50개 LOGH_* 읽기 이행(world/strategic/comms 플래그)·composition root(createServer(config,deps)) A5.
   - **A2 L2 코덱 추출 시작 ✅**(a876385, 첫 코호트): `src/server/codec/` 신설 — `codec/simple-info.mjs`(0x1200 delta 코덱 전체 이동, shim export *) + `codec/offsets.mjs`(기지관리 0x32x: institution 0x0321·warehouse 0x0327·package 0x0329 오프셋 60+ 단일지점). institution/warehouse-record 상수 re-export. 기능 무변경·export 표면 보존(39/40/22)·순환없음·**920 그린**. 다음 코호트=base-record(0x031f, fs 분리)·scenario-session·personnel 빌더 → 이후 login-protocol/info-records(거대·중앙). A3 핸들러레지스트리는 A2 진행 후.
     - **A2 둘째 코호트 ✅**(02fc637): `codec/scenario-session.mjs`(0x2006 packed 세션레코드 빌더+createScenarioState+SESSION_* 전체 이동, 원본=export * shim, 15 exports 보존, 920 그린).
     - **A2 셋째 코호트 ✅**(44fc3c6): base-record 0x031f **순수코덱/fs로더 분리(SOLID)** — 순수 빌더→`codec/base-record.mjs`(fs 0), RESP_INFO_BASE_*+RIB_* 51상수→offsets.mjs(104 exports), 원본은 fs 로더만+shim. export 51 보존, 단방향 loader→codec, 920 그린. **codec/ 현황: simple-info·scenario-session·base-record + offsets(0x32x 기지관리 패밀리 104상수).** 남은 코호트=institution/warehouse 빌더(상수는 이미 offsets)·personnel·info-records/login-protocol(거대). A3는 A2 충분 진행 후.
     - **A2 넷째 코호트 ✅**(180e90f): institution(0x0321)/warehouse(0x0327/0x0329) 빌더 → codec/, export 22/40 보존, 920 그린. **→ 기지관리 0x32x 패밀리(base/institution/warehouse + offsets)가 codec/로 완전 추출 = 코덱 레이어 첫 도메인 완결.** codec/ 6모듈. 남은 A2=personnel 빌더·info-records/login-protocol(거대·중앙, 신중). A3 CQRS는 A2 큰 파일까지 후.
   - **폰트 결정 ✅: Pretendard**(사용자 선택 2026-06-19, "현대적인 거"). `tools/client_patches/font-face.json` patchedHex를 Pretendard(`50726574656e64617264`+NUL6, 16B 슬롯@0x77402c)로 갱신. 맑은고딕 폐기. ⚠️Win 기본폰트 아님 → **배포물이 TTF 설치 필요**(미설치 시 시스템 한글폰트 폴백). needsLive(빌드 후 인클라 렌더 확인). [[logh7-font-pretendard]].
   - **Pretendard 배포 번들링 ✅(메커니즘)**: `tools/packaging/install-pretendard.ps1`(Win10 1809+ per-user 폰트 설치, 관리자 불필요, LOCALAPPDATA Fonts 복사+HKCU 등록, 멱등, PARSE OK). `docs/logh7-font-remaster.md`에 배포 절차(빌드시 OFL TTF 취득→`fonts\` 동봉→설치 스크립트 1회 호출). 클라가 앱-로컬 폰트 미등록이라 시스템 설치 필수. 잔여=빌드 파이프라인에 TTF fetch+packager overlay 연결, 런처 자동호출, 라이브 렌더 확인.
   - **✅ opcode RE 스윕 워크플로 완료**(w0xqvkfqd, 5-에이전트) → `docs/logh7-opcode-wiring.md`. **순수모듈 배선 지도 확정**:
     - **relations(사교 6종)·surrender(降伏勧告) = 클라 opcode 부재 확정**(high) → 클라 커맨드 아님, **서버 내부 판정/AI 트리거**. ⇒ 이전 "사교/항복 opcode RE 필요" 플래그 **해소**(배선 대상 아님). surrender는 전투해소 루프에서 統率·사기로 `resolveSurrender` 호출이 자연스러운 서버측 배선처(테스트 가능, 라이브 불요 판정).
     - **정치 5종 = `0x0900` MakePlan의 planId sub-action**(strategy 라우팅 확정) / **공중전 = `0x040e` battle-ops sub-action**(라우팅 완료, 엔진 미연결) / **쿠데타모집 = `0x0f13/0x0f14` order-mail sub-action**(social 라우팅). ⇒ **command-engine 신규 패밀리 추가 불필요**, 도메인 프로세서 내부 sub-action 처리. 단 **판별자/매핑(planId↔effect, 0x040e body 판별자, order-type 필드)은 라이브 캡처 확정 후** 배선(보류).
     - **coup_conduct/coup/rebellion = S→C 표시필드**(0x0323 @0x4c/@0x50, 0x0325 @0x21, 현재 0 하드코딩) → `intel.applyCoupLoyalty` 누적값 시드로 배선 가능(byte-verify, 라이브 불요). coup-loyalty 소스 선행.
     - **첩보 C→S opcode = 미확정**, 라이브 관측이 유일 확정경로.
     - **📌 인플렉션**: 순수모듈(relations/intel/surrender/air-combat)은 현재 테스트만 import(dead engine). **남은 배선은 (a) surrender→battle-engine 서버판정(자율 가능)·coup 표시필드 시드(자율 가능) 외엔 대부분 라이브 0x0900/0x040e/0x0f13 캡처 게이트(메인-직렬 logh7-live 세션 필요)**. 서버측 자율 갭은 사실상 소진 — 다음 큰 진전은 라이브 세션.
   - **✅ 동시 개발 3트랙(2026-06-19 후반)**: 사용자 "동시적으로 개발" 요청 → 충돌없는 파일트리로 병렬 가동.
     - **Track A 서버배선 ✅커밋**(3562ada): air-combat→battle-ops 0x040e(단일 anti-ship, sub-action 라이브보류)·surrender→battle-engine 순수헬퍼(roll주입·기본결과불변)·coup→intel.createIntelState+personnel coupConduct 옵셔널(미지정=0불변). **919 그린(+16)**. ⚠️coup 오프셋: opcode-wiring문서(@0x4c/0x50)가 권위문서(coup_conduct@0x48, @0x50=pcp)와 4B 어긋나 모호한 coup_conduct만 시드(pcp remap 안 함, byte-exact 보존). air-combat/surrender dead-engine 해소.
     - **Track B 현지화.rsrc ✅커밋**(e877239): MFC셸 133건 ko 채움, va_offset를 패처슬롯 기준 재정렬(4B 어긋남=binary-strings가 슬롯보다 앞섬 + MFC 16엔트리 \n-결합블록 규명). 패처 드라이런 verifyOk=true. 빌드배선 설계 §7a(옵트인 --localize-rsrc). 잔여=라이브(캡션/rect/렌더).
     - **Track C content+시나리오 ✅커밋**(8856724): `content/initial-deployment.json`(p75 재추출, 제국 fleet12/patrol59/ground60·동맹 12/60/60, 第48gap·blank·병합셀·요새5)·`content/scenarios/canon-801-07.json`(validateScenario valid, systems80/fleets24/ships24/troops120, commander/기함/troop스탯 P3시드). **✅ galaxy 17 행성명 rename 완결**(121c80a, Track D): DB 재생성 가능(`node src/server/logh7-content-db.mjs build`) 확인 → galaxy/planet-economy/all-names/planets-ko(jp만)/auto-production/unit-types + **logh7-content.db 재생성(10,718행)** + 테스트 4파일 ja 전파 + deployment/scenario 잔존 ボルケーゼ 11건까지 ボルゲーゼ로 정합. **galaxy↔deployment↔scenario↔DB 전부 새 철자, 919 그린.** CRLF 파일은 인덱스(LF) 정합 정규화·실변경 17줄/파일. ko 음차는 placeholder(0.5) 불변. **교훈: galaxy 행성명 변경=7+파일+sqlite DB 커플링이나 DB가 재생성 가능해 원자 전파로 해소.**
     - **상태/동시성 워크플로 ✅**(w2cvopp5w) → `docs/logh7-status-and-plan.md`: 종합 **55%**, 병렬 5트랙 vs 라이브-직렬 13항목. **라이브 큐(0x0b01·opcode캡처·렌더)는 실클라 세션 필요**.
   - **✅ content-verify 적대검증 워크플로 완료**(wxdvqh1m3, 3-에이전트): docs/logh7-content-verify.md의 동맹 함선스탯 12교정 + 초기배치를 PDF(.omo/work/gin7manual/gin7manual.pdf) 독립 재추출/일관성으로 재확인 → `docs/logh7-content-verify-adversarial.md`. 결과 **confirm 14/refute 2/uncertain 1**. **✅ confirm만 ship-stats.json 적용 커밋**(33c3557): 동맹 11엔트리 교정+偵察巡航艦 8필드 복구. **refute 2(공작함 전체·양륙함 速度=변형열을 표준으로 오치환) 현행유지**, **uncertain 1(전함 ビーム64) 라이브 RE 대기**. initial-deployment는 Track C가 신규 인코딩 중.
   - **✅ 현지화 감사 워크플로 완료**(wx42jugu0, 4-에이전트 병렬): **156건** 집계 → `docs/logh7-localization-audit.md` 워크리스트. **근본원인 확정+수정**: msgdat 추출툴이 **짧은 한글 라벨을 cp932로 오판독**(한자 +20/자가 한글 +10/자 눌러 mojibake 채택; 긴 한글은 정상이라 미발견). `tools/logh7_msgdat.py`에 지문 교정자(`_correct_cp949_misread`: cp932에 반각가나 + cp949 재해독이 깨끗한 한글일 때만 cp949; 진짜 일본어·바이트손상 토큰 불변) + 회귀테스트(파이썬 4/4). `content/extracted/msgdat-full.json` **결정론적 디코드 정정 7건**(사기값/사기치×3/재고량×2/쟀ㅷ량 — 번역 아닌 바이트→cp949 정정). 서버 903 그린.
     - ⚠️**현지화 잔여(라이브+캐논 필요)**: (1) 캐논 함급토큰 `ｾ邱戓ﾔ`(바이트손상, 3슬롯) — 원본 재추출+캐논대조로 1종 확정 후 적용, **임의번역 금지**. (2) `#1301 쟀ㅷ량` 부분복원(캐논 '탑승 병력 수'? 대조). (3) **P1 MFC 셸 UI 116건**(.rsrc UTF-16LE 트랙, va_offset 4B 시프트 정렬 후 ko 채움, `%1`/`&X` 보존 — 게임 본문 아닌 별도 트랙). (4) 대부분 깨끗복원 토큰은 **우리 추출 아티팩트**(클라 constmsg.dat 바이트는 정상 cp949일 가능성↑) → 클라 실제 노출은 라이브 검증 필요.
   - **§B3 command-range-circle ✅(순수)**: `src/server/logh7-command-range.mjs`(`commandRangeRadius` 시작지연 후 指揮 기반 충전→상한, `fillTimeMs` 指揮↑→빠름, `resetCommandRange`). 수치 SERVER DESIGN, 규칙(指揮 좌우·발령 리셋·0-20s 지연) 캐논. 테스트 5종. **874 그린.**
   - **§B3 operations CP→XP ✅(순수)**: `src/server/logh7-ability-xp.mjs`(`gainAbilityXp` 100XP→능력치+1 carry, 代用 제외, 캡100 오버플로 가드). XP_PER_LEVEL/代用제외 캐논, quantum/대상매핑 SERVER DESIGN. 테스트 5종. **869 그린.** 잔여=command-engine 커맨드 실행 시 적립 훅(능력치 매핑)·command-range-circle·작전계획 lifecycle.
   - **§B6 intel/coup ✅(순수)**: `src/server/logh7-intel.mjs`(espionageChance 情報↑/치안↓→성공률, resolveEspionage roll주입, applyCoupLoyalty 0..100, canStartCoup 叛乱忠誠度 임계+완전승리 게이트). 곡선/임계 SERVER DESIGN. 테스트 4종. **864 그린.** 잔여=첩보/쿠데타 커맨드 opcode RE(🔴)·체포리스트·핸들러 배선.
   - **4.3 훈장 ✅(순수)**: `src/server/logh7-honors.mjs`(decoration_bits 비트필드 award/revoke/has/count/list, u32). 캐논: 원작 叙勲 未実装 → 사다리 law3 SKIP(비교자 미사용). 비트 인덱스 SERVER DESIGN. 테스트 6종. **853 그린.** (4.1 작위/4.2 봉토는 imperial-titles에 기존.) **4.6 연령드리프트 ✅(순수)**: `logh7-age-drift.mjs`(ageDriftDirection 젊음+1/노년-1, applyAgeDrift rolls 주입 결정론, 0..100 클램프). 임계/확률 SERVER DESIGN. 테스트 7종. **860 그린.** 잔여=0x0356 decoration 실값 배선(🔴)·4.4 사다리캡(personnel 기존 확인)·인사틱 배선.

### 동시성(2차 배치)
- 🟢 **content-verify ✅완료** → `docs/logh7-content-verify.md`. 좌표 재추출 결과: 동맹함선스탯 **verified(12건 오류 발견+偵察巡航艦 복구)**·자동생산 verified(`content/auto-production.json` 기록됨)·초기배치 verified(신규 `initial-deployment.json` 권고)·승무원효율 **unrecoverable(매뉴얼 공란→P3만)**. ⚠️**적용 보류**: ship-stats.json 12건 교정·initial-deployment 신규·galaxy 이름 17건 역수정은 **커밋된 데이터 덮어쓰기라 적대적 검증 후 적용**(단일 에이전트 좌표추출 신뢰 전 spot-check). 후속 태스크.

### 커밋 + 레포 구조 (2026-06-19, 최종 결정)
- **커밋 ✅**: 브랜치 `server-rearchitecture-2026-06-19`. 다수 커밋. `NUL`(예약명, gitignore)만 제외.
- **레포 = 2개 분리 (워크스페이스 폴더 없음)**: 사용자 정정 — 워크스페이스 폴더 래퍼는 철회하되 **레포 자체는 분리**.
  - **server**: `E:\logh7-server` (별도 git). src/server + tests/server(807 pass) + content(데이터, 이미지 제외) + crypto. **클라 EXE 없이 `npm start` 부팅**. 재추출 = 모노레포 `bash tools/sync-server-repo.sh`.
  - **client/dev**: `E:\logh7-revival` (모노레포). RE/도구/콘텐츠생성/docs + (현재 서버 미러도 보유 = dev 소스). content 생성→server로 sync.
  - 미정(소): 모노레포에서 src/server 완전 제거(클라전용화)는 dev 안정화 후 선택. 지금은 모노레포에서 서버 개발 + sync(마찰 적음).
- **부수 개선(유지)**: ① codec EXE-독립화(committed 테이블 폴백). ② 제로설정(`npm start`+`.env`). ③ 영속성 포트.

---

---

## TL;DR — 현재 위치
- **무유저 갤럭시 시뮬 + 캐논 항성 위치 + 한글 폰트/메뉴 + 리마스터 도구**가 전부 서버/도구에 들어왔고 **서버 795 테스트 그린**.
- **막혔던 in-world 명령(0x0b01)**: 메커니즘 라이브 증명 완료(cave가 카메라를 캐논셀로 센터하는 것까지 대조실험으로 확인). 잔여 = 정적 detour의 실제 0x0b01 송신(전략 move-UI 제스처) 라이브 확인.
- **세션 최대 교훈**: 월드진입 "회귀"는 코드가 아니라 **스플래시 화면 타이밍**(드라이브 전 ~30초 대기)이었음. 이거 하나로 라이브 검증이 다시 가능해짐.
- **미커밋 대량**(147 untracked + 63 modified) — 커밋 권장.

---

## 이번 세션 완료 (영역별)

### 1. in-world 전략 명령 (P0-02, 60사이클 난제)
- **메커니즘 증명**: `tools/logh7_p0_02_focus_pc.py`(함수경계 Frida positive-control). `FUN_004c4170` onEnter서 `source+0x320`=홈셀 write → `+0x126714` → root `*(DAT_007cd04c+0x11178)` → `FUN_004d6310` 검증기 PASS(이전 항상 -256). 카메라(FUN_004d4e90)도 0x11178을 읽어 **"항상 (1,1)" Front 3 동시 해결**.
- **정답 = surgical code-cave** (`tools/logh7_encode_strat_cave.py` → `tools/client_patches/strat-camera-focus.json`): `FUN_004c4170`@0xc4170 프롤로그(`a0 54 a5 7c 00`)→detour, **안전 cave VA 0x5d5290(48B 0xCC int3)**. 1바이트 mode-flip(strat-source-mode)은 월드진입 깸(배제), 서버플래그 단독도 무효.
- **cave 동적셀**: own char-id(`mainState+0x3584a0`)→`+0x36a8b4`배열→flagship `+0x24`→grid `0x41a368+0x08`=셀 체인 RE확정 + capstone검증. 단 `--scan` 본문 112B > 48B cave → **appended section 필요(needsSection)**. immediate(2550=서버시드 일치)는 빌드가능.
- **잔여**: 정적 detour로 월드 진입 후 클릭→**outbound 0x0b01** 라이브 미확인(클릭이 0x0300 info만 냄 → 전략 move-UI 모드 진입 제스처 RE 필요, 백로그 T16).

### 2. 캐논 항성 위치 복구 (T37, 항행불가 보정) ✅
- **소스 = gin7manual PDF `manual_saved.pdf` page 101 星系図의 벡터 dot**(`fitz.get_drawings()`서 정확히 80개 작은점). `Null_galaxy.mdx`는 **위치 없는 템플릿**(트랜스폼 0), galaxy_all.bmp는 성운배경 — 위치 없음.
- **돌파 = Y축 반전**(page rotation 90°). 정합 후 잔차 0.04pt, 진영색 매칭 80/80.
- **산출**: `content/galaxy.json`에 `canonCol/canonRow` 80/80 + `content/galaxy-passable-cells.json`(통과 3771셀/항행불가 1229). `buildStrategicGalaxyGrid`가 캐논셀 직접사용 + 통과셀 내 충돌해소. 수도셀 캐논보정(제국 ヴァルハラ 86,26 / 동맹 バーラト 12,22).
- **남은 한 조각**: 통과셀맵을 **0x0315 terrain 타입에 인코딩**해야 클라가 항행불가 영역을 렌더/적용(아래 §즉시 다음 1).

### 3. 무유저 갤럭시 시뮬 ✅
- `src/server/logh7-strategic-sim.mjs` + 테스트. 인접그래프·전략함대시드·strategicTick(사령관 의사결정: 카논 8능력치/behaviorProfile 기반 진군/교전/방어/증원)·성계 소유변동·broadcast. 게이트 `LOGH_STRAT_SIM=1`(기본 OFF), `worldRelay` 비종속(유저0명에도 진행).
- **라이브 미관측**: `LOGH_STRAT_SIM=1`로 자율 진영전쟁 틱 로그/관측 필요.

### 4. 리마스터 / 한글화 ✅(도구·패치, 다수 needsLive)
- **폰트**: 전체 텍스트 단일 전역 `"MS UI Gothic"`@VA 0x77402c → `"맑은 고딕"` 16B in-place(charset 0x81/quality 4 이미정상). `tools/logh7_encode_font_face.py` + `font-face.json`.
- **메뉴/다이얼로그**: `tools/logh7_rsrc_patch.py`(.rsrc UTF-16LE, 22 한글 문자열) + `content/localization/hardcoded-ui-ko.json`.
- **해상도**: `tools/logh7_graphics_config.py` `--detect`/`--list`(18프리셋)/`--native`/`--no-watermark`(3DfxWatermark=false). `tools/logh7_encode_lobby_res.py`(로비 1024×768→네이티브 8사이트). `widescreen-ui.json`(Path B 바이트확정).
- **텍스처**: `tools/logh7_upscale_textures.py`(무침습, 470+ .tga 8bit 팔레트).

### 5. 서버 컨텐츠 (게이트 OFF, needsLive)
- 경제 0x031f(`LOGH_BASE_ECONOMY`), 함선 0x30b(`LOGH_STATIC_SHIPS`), 작위 titlename(0x0323@0xd8/0x0356@0xdc). 함대 진영 수도 배치(login-session FACTION_CAPITAL).

### 6. 인프라
- **스킬 6종**(`.claude/skills/logh7-{live,patch,re,wire,extract,localize}/SKILL.md`) + command 래퍼 + CLAUDE.md 등록(OMC:END 밖). superpowers/humanizer/find-skills 패턴 채택.
- **워크플로**(`.claude/workflows/`): logh7-loop, gap-audit, push-all, close-galaxy-sim, close-remaster-tools, galaxy-positions. `logh7-loop`은 `agentType: 'Explore'/'general-purpose'`로 수정(커스텀 에이전트 미등록 회피).
- **백로그**: `docs/logh7-gap-backlog.md`(35 태스크 + criticalPath + 테마).

---

## 즉시 다음 (우선순위)
1. **0x0315 terrain 인코딩** ← 추천 시작점. `galaxy-passable-cells.json`의 항행불가 1229셀 → 0x0315 셀값 **2(航行不能)**, 플라즈마 폭풍셀 → 값 **0**, 통과 빈셀 → 1, 성계 → 4+index. 현재 `buildStrategicGalaxyGrid` cellInner는 성계셀만 마킹 → 나머지 미설정. **셀-값 스킴 RE 확정 후 byte-correct 인코딩**(skill: `/logh7-wire`).
2. **라이브검증 배치**(한 클라에): `logh7_build_playable_client.py --patches menufix dlgfix earlygrid-ringclear font-face` + lobby-res/widescreen + GraphicConfig 1920×1080 → `/logh7-live`로 스플래시대기→월드 → **맑은고딕 폰트·메뉴 한글·해상도·캐논 星系図(항성이 회랑/영역 정렬)·cave 0x0b01** 시각확인.
3. **무유저 시뮬 라이브**: `LOGH_STRAT_SIM=1` 자율 진영전쟁 관측 + 인접그래프 캐논셀 재빌드.
4. **서버 배치3**: 0x0337 격리(T08)·0x0323 mixed-endian(T09)·작위/봉토/진급 라우팅(T13)·0x031f 스칼라 offset 라이브핀(T10)·창고시드(T20).
5. **0x0b01 move-UI 제스처 RE**(T16): 함대선택→이동모드(DAT_009d2a3c 1→2 전이) writer 확정 → cave + 제스처로 실 0x0b01.
6. **플라즈마 폭풍 게임플레이**: terrain modifier(이동비용↑/시야↓/전투페널티) 서버 권위적, strategicTick 연결.

---

## 실행/검증 (핵심 명령)
```bash
# 서버 테스트 (현재 795 그린)
npm run test:server
# 라이브 (skill: /logh7-live — ⚠️ start 후 스플래시 ~30초 대기 필수)
taskkill //IM node.exe //F; taskkill //IM G7MTClient.exe //F; sleep 2
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/<id> start --port 47900 \
  --env LOGH_LOBBY_OK_FORMAT=message32 --env LOGH_LOBBY_EARLY_OK=1 --env LOGH_SS_FORMAT=message32 \
  --env LOGH_STRAT_GALAXY=1 --env LOGH_STRAT_GRID_EARLY=1 --env LOGH_WORLD_PLAYER=1 \
  --env LOGH_POSTLOAD_PLAYER_RECORD=1 --env LOGH_FULL_UNIT_LOCATION=1 --env LOGH_GRID_ENTER=1
# (30초 대기 → shot으로 로비 확인 → create-character → 관측 → stop[shaVerified])
# RE: python tools/logh7_redex.py func 0x<addr> / grep "<sym>"
# 패치 빌드: python tools/logh7_build_playable_client.py --patches menufix dlgfix earlygrid-ringclear <name> --out .omo/work/<x>.exe
```

## Hard-won 교훈 (반복 방지)
- **스플래시 타이밍**: fresh start 후 BOTHTEC/MPS 인트로 ~25–35초. 그 전 클릭은 전부 빗나가 세션리스트(0x2006)서 멈춤. **로비 확인 후 드라이브.**
- **code-cave 위치**: .text-끝 슬랙(0x66acd5)은 참조 read-only 데이터 인접 → 쓰면 클라 깸(라이브확정). **내부 0xCC int3 패드(0x5d5290, 48B)만 안전.** `--measure-caves`로 확인.
- **PDF 星系図**: 좌표가 빗나가면 **Y-flip(page rotation)** 의심. 라벨 색=faction 교차검증.
- **MDX `Null_` 접두**: 위치 없는 템플릿(트랜스폼 0). 좌표는 PDF 벡터 dot에.
- **폰트**: 단일 전역 face 문자열 하나 교체로 전체 전환. charset/quality는 머신코드(6a81/6a04)로 이미 정상.
- **0x0315**: 항행불가 그리드는 **서버가 내려줌**(per-cell terrain type, 2=航行不能). 클라 모델 아님.
- **stale node** → trace.jsonl 0바이트. start 전 항상 `taskkill node`.
- **블라인드 클릭**: D3D8 창은 windowText 없음 → shot+Read로 위치 확인 후 클릭.

## 스킬/하네스
`/logh7-live` `/logh7-patch` `/logh7-re` `/logh7-wire` `/logh7-extract` `/logh7-localize` (다음 세션 리로드 시 available-skills 반영). 표준 루프 = **re → wire/patch → live(검증)**.

## 참조 문서
- `docs/logh7-gap-backlog.md` — 35 태스크 + criticalPath
- `docs/logh7-loop-state.md` — P0-02/cave/캐논위치 상세 증거
- `docs/logh7-goal-roadmap.md` — M1~M4 마일스톤
- `docs/logh7-implementation-specs.md`, `docs/logh7-*-wire.md` — 와이어 레이아웃
- `content/galaxy.json`(+canonCol/Row), `content/galaxy-passable-cells.json`

## 커밋 권장
미커밋 147 untracked + 63 modified. 영역별로 나눠 커밋 권장: (1) 캐논위치+passable, (2) 무유저시뮬, (3) 리마스터/폰트/rsrc 도구, (4) cave/patch 도구, (5) 스킬/워크플로/docs.
