# LOGH VII Phase B — 캐논 갭 구현 백로그

> 본 문서는 LOGH VII Phase B(캐논 갭 마감)의 도메인별 구현 스펙을 하나의 실행 백로그로 합성한 것이다.
> 원작 매뉴얼(gin7manual) 페이지·캐논 룰을 근거로, 각 기능을 **이름 / 캐논룰+페이지 / 서버설계 / 커맨드코드 / 필요데이터 / 테스트 / 리스크** 7항목으로 기술한다.
>
> **데이터 등급 표기**: P0=실데이터 확정, P1=캐논 확정, P2=근사/부분확정, P3=튜닝상수(캐논 수치 부재). `⚠️ 검증필요`=데이터/오프셋/opcode 미확정으로 인코딩 전 선행 검증 필요. `🔴 라이브검증 필요`=클라-대면(와이어) 항목으로 `logh7-live` 검증 필수.
>
> **표준 루프**: `logh7-re` → `logh7-wire`/`logh7-patch` → `logh7-live(검증)`. 모든 클라-대면 결과는 라이브검증 전에 "완료" 주장 금지.

---

## 0. 실행 우선순위 & 의존성 순서

도메인을 다음 순서로 진행한다. 앞 단계의 **공용 인프라(게임클록 등)**가 뒤 단계의 선행 의존성이다.

| 순위 | 도메인 | 근거 | 핵심 의존 |
|------|--------|------|-----------|
| **P0 (최우선)** | **movement (0x0b01)** | 라이브 언락 후보 — in-world 조작의 마지막 블로커. self-contained 하며 즉시 라이브 가치. | 없음 (단, `fleet.cell`/터레인 마스크 시드 정합) |
| **P1** | **economy** | self-contained, 신규 모듈 위주. **게임클록**을 최초 도입(이후 전 도메인 공유). | movement 무관 / 게임클록 신규 |
| **P1** | **personnel-honors** | self-contained(룰 위주). 작위/봉토/사다리/체포. 다수 0x0356 배선. | economy의 봉토수입·게임클록 일부 의존 |
| **P1** | **combat-gaps** | self-contained(전투엔진 내부). 戦闘艇/戦死/morale/降伏勧告. | personnel(統率/평가포인트) 약결합 |
| **P1** | **content-verify** | **데이터 검증 선행** — 다른 도메인이 소비할 함선/배치/승무원 데이터의 무결성 게이트. **CI 가드(provenance)를 가장 먼저 구축**. | 없음 (PDF 재OCR + logh7-extract) |
| **P2** | **operations-growth** | CP풀/XP성장/작전계획/커맨드레인지. **게임클록 선행 필수**. | economy의 게임클록, personnel의 능력/직책 |
| **P3 (후순위)** | **ai** | 위 도메인의 상태(morale/작전/생산/색적)를 소비. | movement·combat·economy·personnel 다중 의존 |
| **P3 (후순위)** | **intel-coup** | 첩보·쿠데타. opcode 전부 미확정 + 경제(政府支持率)·personnel(직책카드) 의존 大. | economy·personnel·승패평가 다중 의존 |

### 데이터검증 선행 항목 (인코딩 전 반드시 통과)
- 🔴 **content-verify §4 (Ship-stats provenance CI 가드)** — **가장 먼저 구축**. 다른 재OCR 산출물이 통과해야 할 게이트.
- ⚠️ **content-verify §1 (Alliance 함선스탯 재OCR)** — pp.90-99 2단조판 재추출 전 인코딩 금지.
- ⚠️ **content-verify §3 (초기배치·자동생산 페어링)** — pp.75-78 2단조판 재OCR 전 인코딩 금지(현 OCR 페어링 known-wrong).
- ⚠️ **content-verify §2 (乗員効率 데이터)** — 매뉴얼 수치 부재, 재OCR 또는 VII-미존재 확인 전 null+confidence:none 유지.
- ⚠️ **economy §7 (자동생산 품목표)** 및 **ai §6 (조병공창 보유 성계)** — 위 §3 산출물에 의존.

---

## 1. 도메인: economy (내정·경제)

> **신규**: `src/server/logh7-economy.mjs`, `content/planet-economy.json`(확장, ⚠️ 검증필요), 테스트 1종.
> **수정**: `logh7-world-state.mjs`(경제필드+treasury+게임클럭), `logh7-auth-server.mjs`(30일틱 인터벌+정치커맨드 라우팅), `logh7-command-engine.mjs`(정치/경제 라우팅).
> **공통 인프라**: 본 도메인이 **게임클록(24×)**을 최초 도입한다 → economy 전용으로 만들지 말고 world-state 공용 클록으로 설계(operations-growth가 재사용).

- [ ] **1.1 행성 세금 징수 모델 + 국가예산고(treasury) 누적**
  - **캐논룰+페이지**: 행정·군사 비용은 各惑星から徴収する税金으로 충당. 統率(PCP)이 要職에서 徴税額·政府支持率에 영향. 원작 経済は現在未実装. — p9, p14-15.
  - **서버설계**: `logh7-economy.mjs` `createEconomyState()`. 각 행성 `{taxRate, taxBase=f(population,industry), revenue}`. `computePlanetTax(planet,{leadership,approval})` = `floor(taxBase × taxRate × approvalFactor × leadershipFactor)`. world-state systems 각 planet에 `economy{taxRate/revenue/approval/security/treasuryContribution}` 서브객체. 국가단위 `nationState{empire,alliance}.treasury` + `addTreasury/getTreasury/spendTreasury`. 30일틱이 자국 전 행성 세금 합산 → treasury 적립. `leadershipFactor/approvalFactor`는 **P3 튜닝상수**.
  - **커맨드코드**: 없음 (서버내부 상태). 단 패널 노출 시 0x0337/0x031f.
  - **필요데이터**: population_M/food/industry(**P3 존재**). taxRate 초기값·taxBase 계수·統率→徴税 곡선은 **P3 ⚠️ 검증필요**(매뉴얼 정성서술만).
  - **테스트**: ① taxRate↑→revenue 단조증가 ② approval 0%→revenue 하한(0/floor) ③ 높은 統率→revenue 배수 ④ treasury 적립 = 자국 행성 revenue 합.
  - **리스크**: 곡선/공식 캐논 수치 없음 → 전부 P3, 라이브 불요(서버내부). 패널 노출 시 🔴 라이브검증. 원작 未実装이라 대조 불가.

- [ ] **1.2 政府支持率(govt approval) 상태 + 변동 커맨드 연동**
  - **캐논룰+페이지**: 政府支持率은 統率이 要職에서 영향. 武力鎮圧(CP160 wait24)=치안↑·支持率↓, 分列行進(CP160 wait24)=支持率↑, 演説(CP320)=影響力+지역支持率, 煽動工作(CP160 諜報)=대상支持率↓. — p14-15, p72-74.
  - **서버설계**: planet.economy에 `approval`(0-100 또는 0-1000) 필드. `applyApprovalDelta(planet, delta, {clampMin:0,clampMax:MAX})`. 커맨드 핸들러가 分列行進/演説→+delta, 武力鎮圧/煽動工作→-delta. approval은 세금 `approvalFactor` 입력. 30일틱에서 baseline 방향 `meanReversion`(P3).
  - **커맨드코드**: 🔴 0x0337(NotifyBaseParameter approval@0x30 — **provisional**), 0x031f(ResponseInformationBase — approval **PROVISIONAL 오프셋**).
  - **필요데이터**: 스케일·초기값·delta **P3 ⚠️ 검증필요**. 와이어 오프셋(0x0337@0x30) dispatcher case 미확인(provisional) → 🔴 라이브검증.
  - **테스트**: ① 分列行進→approval+delta clamp상한 ② 武力鎮圧→-delta clamp하한 0 ③ 煽動工作(적)→-delta ④ meanReversion이 baseline 방향 이동.
  - **리스크**: 오프셋 PROVISIONAL → 패널 노출은 🔴 라이브검증 필수. delta P3. 커맨드 opcode는 静的 catalog 미존재(§1.6에서 검증필요).

- [ ] **1.3 治安維持率(security) 상태 + 변동 커맨드**
  - **캐논룰+페이지**: 警戒出動(CP160 wait24)=駐留 부대로 治安↑, 武力鎮圧=치안↑·支持率↓, 軍紀維持(CP80)=軍紀↑·混乱↓. NotifyBaseParameter 治安(peace u16 @0x34). — p68, docs/logh7-info-records-wire.md §3.
  - **서버설계**: planet.economy.security(u16). `applySecurityDelta(planet, delta)`. 警戒出動/武力鎮圧→+delta(주둔 부대 강도 가중 P3). 낮은 security는 세금 패널티(`revenue × securityFactor`) + 混乱発生率(쿠데타 도메인 연계 훅). peace@0x34에 매핑(`buildNotifyBaseParameterInner` peace 인자 — **빌더 존재**).
  - **커맨드코드**: 🔴 0x0337(peace/治安 @0x34 — HIGH 오프셋, provisional 코드).
  - **필요데이터**: 스케일·초기값·delta·駐留강도 가중·securityFactor 전부 **P3 ⚠️ 검증필요**.
  - **테스트**: ① 警戒出動→security+delta ② 武力鎮圧→security+delta AND approval-delta(동시) ③ 낮은 security→revenue 패널티 ④ peace@0x34 와이어 라운드트립.
  - **리스크**: @0x34는 HIGH지만 0x0337 코드 provisional → 🔴 라이브 A/B 검증. 駐留부대 강도 연계는 부대주둔↔행성 연결 미확인 ⚠️ 검증필요.

- [ ] **1.4 影響力(influence) 상태머신 + 정치/사교 커맨드**
  - **캐논룰+페이지**: 影響力은 계급사다리 법칙4. 夜会/狩猟/会談/談話/演説(각 CP320)이 影響力 변동. 狩猟/談話는 友好度도. 0x0356에 influence 필드(현재 passthrough). — p35, p72-73, p33-34.
  - **서버설계**: per-character `influenceState Map<charId,{influence,friendliness}>`. `applyInfluenceDelta(charId, delta)`. 사교커맨드 핸들러→+delta(개최지·게스트수 P3). 演説은 지역 approval delta 추가. personnel `buildNotifyInformationCharacterInner` influence 인자에 주입(현재 항상 0). 인사 사다리 law4 입력 `getInfluence(charId)`.
  - **커맨드코드**: 🔴 0x0356(NotifyInformationCharacter influence — 빌더 인자 존재).
  - **필요데이터**: 스케일·초기값·delta **P3 ⚠️ 검증필요**. 사교커맨드 opcode 静的 catalog 미확인 **⚠️ 검증필요**.
  - **테스트**: ① 夜会→influence+delta ② 演説→influence+delta AND 지역approval+delta ③ law4 비교자가 influence 높은 char 우선 ④ influence 인자 주입 시 와이어 반영.
  - **리스크**: opcode 미존재 → 🔴 라이브검증. delta P3. 인사 사다리 영향은 personnel 비교자 수정 필요(크로스모듈).

- [ ] **1.5 納入率変更/関税率変更/分配/統治目標 정치 커맨드 핸들러**
  - **캐논룰+페이지**: 納入率変更(CP320)=행성 세금납입율, 関税率変更(CP320)=품목 관세, 分配(CP320)=예산→행성 원조, 統治目標(CP80, 최저가). 권한: 帝国 財務尚書 / 同盟 財政委員長. 資金投入(個人 CP80)=사재→地方資金庫. — p72-73, p57/p664/p731, p789, p69.
  - **서버설계**: `processEconomyCommand({state,connectionId,innerCode,inner})` + `command-engine.routeInternalAffairs` 분기. 핸들러: 納入率変更→`planet.economy.deliveryRate`(권한카드 검증), 関税率変更→`nationState.tariff[commodity]`, 分配→treasury 차감+`planet.economy.aid` 가산, 統治目標→`governanceTarget`. CP비용 차감(統治目標 80/나머지 320). 권한카드는 personnel 카드보유 조회 의존.
  - **커맨드코드**: ⚠️ `CommandChangeTaxRate`(바이너리 문자열 @75696, **opcode 미확정**). 0x09xx 정치 패밀리(strategy.mjs 0x0900-0906은 plan/outfit이며 세금 아님 → **별도 코드 필요**).
  - **필요데이터**: 실제 opcode 静的 catalog/msgdat 미존재 → **`logh7-re`(redex)+라이브검증으로 opcode·바디레이아웃 확정 ⚠️ 검증필요**. deliveryRate/tariff/aid 단위 P3. 財務尚書/財政委員長 카드ID는 content-pack 역할레지스트리 의존.
  - **테스트**: ① 권한 보유 accept/미보유 reject ② tariff 반영 ③ 分配 treasury 충분→차감+aid / 부족→reject ④ CP비용 80/320 ⑤ CP풀 부족 시 reject 또는 代用.
  - **리스크**: ⚠️ **opcode 미확정** → `logh7-re→logh7-wire→logh7-live` 루프 필수(🔴 라이브검증). 바디 레이아웃 RE 필요. 권한 검증은 personnel 카드시스템(작위/封土 영역과 겹침). 원작 未実装 대조 불가.

- [ ] **1.6 30일 경제틱 (monthly economic tick) — 게임클록 연동** *(공용 인프라)*
  - **캐논룰+페이지**: 실시간 24배: 30실시간=30게임일=1개월. 功績·진급 30게임일 집계. 원작 経済 未実装. — p10, p46, p36.
  - **서버설계**: world-state 게임클록 신규 `{realStartMs, gameDayOf(now), realMsPerGameDay=3,600,000}`. `runEconomyTick(worldState, economyState, {gameDay})` = (1)자국 행성 세금 합산→treasury (2)approval/security meanReversion (3)aid 소멸 (4)자동생산(§1.7) 호출. auth-server `economyTick` 인터벌(setInterval+`.unref()`, stratTick 패턴) — 게임일 경계마다 1회. diff 반환. **플레이어 0명이면 silent**.
  - **커맨드코드**: 없음.
  - **필요데이터**: `realMsPerGameDay`=3,600,000ms (**CONFIRMED**). 30일 주기 **CONFIRMED**. meanReversion/aid감쇠 계수 P3.
  - **테스트**: ① 3,600,000ms→gameDay+1 ② 틱1회 treasury증가=행성 revenue 합 ③ 미경계 시 미실행(중복적립 방지) ④ N회 결정론 ⑤ 0명: 상태진행+브로드캐스트 없음.
  - **리스크**: 게임클록은 신규 인프라(현 world-state 시간개념 없음, strategicTick은 tickNo만). **클록은 CP회복·진급·작전 30일과 공유 → world-state 공용 클록으로 설계(operations-growth §6과 동일 클록)**. 24×·30일 CONFIRMED라 안전. 패널 갱신 브로드캐스트는 🔴 라이브검증.

- [ ] **1.7 행성별 自動生産(automatic production) 틱**
  - **캐논룰+페이지**: 自動生産은 소유권 변경 전까지 연속, 토글 불가. 세금 미영향(수동 募兵과 달리). 함선은 造兵工廠 보유 행성/요새만. 신규=Green 수련도. 비생산: 近衛兵/擲弾兵教導/薔薇の騎士. — p41, p100, p75-78(⚠️ 추출 페어링 불확실).
  - **서버설계**: `runProductionTick(worldState, productionState, {gameDay})`(30일틱 내부). 행성 productionProfile→행성 倉庫(warehouse 연계) 자동입고. 함선은 arsenal 행성만. Green 태그. 비생산 병종 제외. planet에 production+warehouse 카운터. conquerSystem 훅에서 신소유주로 프로파일 전환.
  - **커맨드코드**: 없음.
  - **필요데이터**: ⚠️ **自動生産品目一覧表(pp.76-78)는 2단 flatten으로 행성↔품목 페어링 불확실** → **재OCR/galaxy.json/ship-stats.json 교차검증 필요(content-verify §3 의존)**. 造兵工廠 행성목록 미확정. 修練度·생산율 P3.
  - **테스트**: ① arsenal 행성만 함선/미보유 병사만 ② warehouse 카운터 증가 ③ revenue 불변(세금 미영향) ④ 비생산 병종 제외 ⑤ conquerSystem 후 신소유주 전환.
  - **리스크**: ⚠️ **생산 페어링 추출-불확실(재OCR 전 인코딩 금지)**. 安全 시드(garrison=軽装陸戦兵, 요새/수도=중생산)로 시작 가능하나 byte-exact 아님. warehouse 연계는 logh7-warehouse-record 의존. 서버내부라 라이브 불요(패널 노출 시 🔴 와이어검증).

---

## 2. 도메인: operations-growth (§B3 — 작전계획·CP성장·커맨드레인지)

> **선행 의존: economy §1.6 게임클록**. 78커맨드 CP/시간표는 캐논데이터(`content/manual/strategy-commands.json`, 추출완료) — 본 도메인은 그것을 소비하는 **런타임 룰(미구현분)**만 정의.
> **신규**: `logh7-command-cost.mjs`, `logh7-operation-plan.mjs`(옵션), 테스트 4종.
> **수정**: `logh7-strategy.mjs`(작전 lifecycle), `logh7-command-engine.mjs`(CP풀 게이트+XP훅), `logh7-personnel.mjs`(8능력 XP/value), `logh7-world-state.mjs`(게임클록 day/24x+onDayTick), `logh7-auth-server.mjs`(틱 배선).

- [ ] **2.1 커맨드 CP/시간 코스트 테이블 로더 (`logh7-command-cost.mjs` 신규)**
  - **캐논룰+페이지**: 78커맨드(81행) 각 消費CP/待機時間/所要時間. 최저 고정 CP=5(近距離移動), 최고고정=800(逮捕許可/執行命令), 변동최대=1280(作戦計画). 변동: 作戦計画 10–1280, 発令 1–320, 作戦撤回 5–320, 燃料補給 dur 48–960. 비제로 待機는 作戦コマンド만(燃料補給 wait8/星系内航行 wait8/警戒出動·武力鎮圧·分列行進·徴発 wait24/特別警備 dur24), 그 외 wait0/dur0. — p68–74.
  - **서버설계**: `strategy-commands.json` 1회 로드(readFileSync, ability-seed 패턴). `getCommandCost(nameJa)` → `{cpType:'PCP'|'MCP'|'none', cost, costRange, waitTime, execTime, execRange, category}`. `cost_cp===-1`이면 desc의 '消費CP A〜B' 정규식 파싱→costRange. exec_time/wait_time 'A〜B'→execRange. 범주→cpType 매핑 + `const COMMAND_ABILITY`(p15 PCP=統率政治運用情報/MCP=指揮機動攻撃防御 원칙). `resolveVariableCost({nameJa, distance?, scheduledDelay?, units?})`로 거리/예정시기/유닛수 의존 CP 보간.
  - **커맨드코드**: 0x0900(作戦計画), 0x0902(発令), 0x0901(作戦撤回), 0x0400(ワープ航行).
  - **필요데이터**: `strategy-commands.json`(존재, 81행, cost_cp/-1+desc 확인됨). 커맨드명→PCP/MCP 정밀귀속표 **⚠️ 검증필요**(p15는 족 그룹만 → **족 단위 적립, 족내 분배는 P3**).
  - **테스트**: ① `近距離移動`.cost===5 ② `逮捕許可`.cost===800 ③ `作戦計画`.costRange===[10,1280]&&cost===null ④ `発令`.costRange===[1,320] ⑤ `燃料補給`.execRange===[48,960]&&waitTime===8 ⑥ 비-作戦コマンド 전부 wait0/dur0(스윕) ⑦ resolveVariableCost 경계(0→10, 최대→1280).
  - **리스크**: 변동CP 보간 공식 캐논 곡선 없음 → 경계값만 캐논, **내부 보간 P3 선형근사**. 커맨드별 단일귀속 미명시 → 족 단위 적립으로 안전구현.

- [ ] **2.2 CP 풀 + 코스트 게이트 + 2배 代用 (command-engine 수정)**
  - **캐논룰+페이지**: PCP/MCP 두 풀. 해당 족 풀에서 消費CP 차감. 부족하면 다른 풀 2배 代用. 消費CP 0은 풀 우회. 오프라인 재생, 전투 중 정지. — p15, p214(代用 2×), §14.
  - **서버설계**: `routeInternalAffairs` 이전 `chargeCommandPoint({state, player, nameJa})`. player/char에 `pcpPool/mcpPool`. 절차: cost===0→우회 → 해당 풀≥cost→차감+`spentReal` → 부족 시 반대 풀≥2×cost→2×차감+`spentSubstituted`(XP 제외 플래그) → 둘 다 부족→`reject:'insufficient-cp'`. 성공 시 반환객체에 `{cpSpent, cpType, substituted}` 부착(XP 훅 소비). cost>0 커맨드만 게이트, 전투/이동/채팅은 fast-path.
  - **커맨드코드**: 0x0900–0x0908(전략), 0x0704–0x0709(인사) 게이트 대상; 0x0f1c/0x0f1d 채팅·0x04xx 전투 비대상.
  - **필요데이터**: 초기 풀크기·재생률·전투정지·오프라인재생 **P3 ⚠️ 검증필요**(능력치 합 기반 시드).
  - **테스트**: ① 80커맨드 pcp 100→20 ② PCP부족+MCP충분→MCP 160(2×)차감 substituted=true ③ 양풀 부족→reject ④ cost0→풀 불변 accept ⑤ substituted=true(XP 제외 신호).
  - **리스크**: 풀 수치 P3. 회귀방지 위해 **풀 미정의=무제한(opt-in `LOGH_CP_GATE=1`)** 권장.

- [ ] **2.3 CP→능력치 XP 적립 성장 (personnel + command-engine 훅)**
  - **캐논룰+페이지**: 消費CP 누적, 고정 quantum마다 족 능력 1개 +1 XP. 100 XP→능력+1, XP 0 리셋. 代用 CP는 XP 제외. 상한 0–100(ability-seed clamp). — p15(§2.3 B), §14.
  - **서버설계**: char에 `abilityValue[8]`(0x0323 ability_8 동기)+`abilityXp[8]`. ABILITY_COLUMNS(tochi/seiji/unei/joho=PCP, shiki/kido/kogeki/bogyo=MCP). `applyCpXp(state, {charId, cpType, cpSpent, substituted})`: substituted면 no-op. `cpAccum[cpType]` 누적 → `XP_QUANTUM`(P3)마다 족 능력 라운드로빈 +1 XP. ≥100→value=min(100,+1), xp-=100. 성장 시 0x0356 재브로드캐스트. command-engine: chargeCommandPoint 성공 후 applyCpXp 호출.
  - **커맨드코드**: 🔴 0x0356(NotifyInformationCharacter — 성장 후 재푸시).
  - **필요데이터**: `XP_QUANTUM` **P3 ⚠️ 검증필요**(p15 '固定quantum'만). 족내 4능력 분배규칙 **P3 ⚠️ 검증필요**. 상한 100=ability-seed clampMax(P1).
  - **테스트**: ① PCP 100CP(quantum10)→족 +10 XP ② xp95+10→value+1 xp5 ③ substituted=true→XP 0 ④ MCP커맨드→PCP능력 불변 ⑤ value100 후 불변(clamp) ⑥ 성장 시 0x0356 1건.
  - **리스크**: quantum·분배 P3, 메커니즘은 캐논. 0x0356 능력 갱신 클라-대면 → 🔴 라이브검증(성장 후 패널 능력치 반영 확인).

- [ ] **2.4 작전계획 lifecycle: 입안·목적·목표검증 (strategy.mjs / operation-plan.mjs)**
  - **캐논룰+페이지**: 3목적 占領/防衛/掃討. 4필드(목적/목표성계/참가艦艇수/발동予定時期). 占領=목표 전부 적성계, 防衛=自성계≥1, 掃討=임의+독행艦 대상. 동일카드 동일성계 중복금지, 글로벌상한=참가유닛합≤진영 총유닛, 목표불성립화 시 자동철회·삭제. — p38, p39.
  - **서버설계**: `createOperationPlanState()`(또는 strategy 내부). Plan=`{id, power, drafter, purpose, targetSystem, participatingUnits, scheduledActivationDay, status, issuedUnits, startDay, ...}`. `validatePlan({worldState, power, plan})`: 목적별 목표검증(getSystem 소유 판정), 중복성계(drafter+targetSystem), 글로벌상한(sum ≤ factionTotalUnits). 0x0900: createPlan+validate, 거부 시 `plan-target-invalid`/`plan-duplicate-system`/`plan-unit-cap`. 0x0901: 삭제(active면 즉시종료). onDayTick `autoWithdrawUnmeetable`.
  - **커맨드코드**: 0x0900(MakePlan), 0x0901(WithdrawalPlan), 🔴 0x0908(NotifyFinishStrategyPlan).
  - **필요데이터**: 목표 소유=world-state systems(galaxy.json, P0). 독행艦 식별 **⚠️ 검증필요**(엔티티 구분 미모델, P3). 진영 총유닛=fleets 합산(P3 시드).
  - **테스트**: ① 占領 전부 적→accept/自포함→reject ② 防衛 自≥1→accept/0→reject ③ 掃討 임의 accept ④ 동일 drafter+target 2번째→reject ⑤ 합>총유닛→reject ⑥ 0x0900 body→Plan 매핑.
  - **리스크**: 0x0900/0x0901 body 서브필드 분해 conf-MEDIUM(헤더만 confirmed) → 🔴 라이브캡처 검증필요. 독행艦 모델 부재로 掃討 대상검증 P3.

- [ ] **2.5 발령(発令) 파이프라인: 입안≠발령 분리 + 활성화 게이트**
  - **캐논룰+페이지**: 입안부서≠발령부서. 발령은 활성 작전에 部隊를 count 한도까지 배정, scheduledActivationTime 전 차단. 개시 트리거=배정유닛/독행艦이 목표성계 도달. 지속=발령 후 30게임일 자동종료, 撤回 즉시. — p39.
  - **서버설계**: `issueOrder({state, worldState, gameDay, power, planId, charId, units})`: ① status planned/active ② gameDay<scheduledActivationDay→`order-too-early` ③ 누적≤participatingUnits 아니면 `order-over-count` ④ 발령자≠입안자(seat role; 단순구현 drafter≠issuer+권한카드) ⑤ issuedUnits 추가. 개시: `checkOperationStart(plan)`(배정유닛이 targetSystem 도달→status='active', startDay, meritEligibleFrom). 0x0902 라우팅. 0x0908 통지.
  - **커맨드코드**: 0x0902(CommandAnnouncement), 🔴 0x0908, 0x0325(ResponseInformationUnit — 도달판정 입력).
  - **필요데이터**: 입안/발령부서 권한카드=§11 org registry(작전一/二/三課長; Empire p56-58, Alliance p62-64). 카드보유=personnel seats(P3). 유닛 도달=fleet.cell vs targetSystem cell(P0).
  - **테스트**: ① gameDay<scheduled→`order-too-early` ② 도달 후 accept ③ 누적>participating→`order-over-count` ④ drafter===issuer→`order-same-department` ⑤ 도달→active+startDay ⑥ 발령 후 0x0908.
  - **리스크**: 부서분리 정밀검증은 §11 카드 의존 → 미완이면 charId불일치 근사(P2). 0x0902 body conf-MEDIUM 🔴 라이브검증. 개시 트리거는 fleet.cell 배선 의존.

- [ ] **2.6 30일 작전결과 평가 + 보상 + 掃討 400ly 격침보너스**
  - **캐논룰+페이지**: 占領 개시+30일: 전부 지배→풀 보너스/≥1→약50%. 防衛: 전부 보유→풀/≥1 상실→약50%. 掃討: 30일 윈도 목표성계 400ly 내 적함 격침마다 +1 보너스(통상 격침공적 위 +1점). 撤回 즉시종료(평가 없음). — p40, p38.
  - **서버설계**: `evaluatePlanAt30Days(plan, worldState)`: 占領=targetSystem.owner===power면 fullBonus(issuedUnits)/부분→halfBonus. 防衛 동일. 보너스→`applyMeritBonus`(char.achievement/evaluation). 掃討=윈도형 `accrueSweepBonus(plan, battle)`: battle.system이 targetSystem에서 distance≤400(1cell=100ly 환산 ⚠️ 검증필요)면 defenderLoss만큼 +1/척. auth-server `runStrategicTickOnce` 후 `operationPlan.onTick(gameDay, battles, conquests)`. onDayTick에서 startDay+30 도달 plan evaluate→0x0908+0x0356.
  - **커맨드코드**: 🔴 0x0908, 🔴 0x0356.
  - **필요데이터**: 400ly→좌표 환산계수 **⚠️ 검증필요**(§14 '100ly 셀'이면 4셀). 풀/50% 절대수치 **P3 ⚠️ 검증필요**(p40 '약 50%'만). 격침수=strategicTick `battles[].defenderLoss`(P3) — 실전투 0x0426도 산입 가능.
  - **테스트**: ① 占領 owner===power→full ② 부분→half ③ 防衛 full/half ④ 掃討 400ly내 defenderLoss=3→+3 ⑤ 400ly 밖→0 ⑥ 撤回 plan은 evaluate 안 됨 ⑦ startDay+30 미도달 스킵.
  - **리스크**: 400ly 환산·절대수치 P3. 격침신호 시뮬 근사, 0x0426 통합 추가배선. 보상통지 클라-대면 🔴 라이브검증. **게임클록(§2.7) 선행 의존**.

- [ ] **2.7 게임클록(24× day 카운터) + onDayTick 훅 (world-state + auth-server)** *(공용 인프라)*
  - **캐논룰+페이지**: 게임시간 24배(2겜시=5실분). 날짜가 CP재생·30일틱·801-07-27 데드라인 구동. — §14, p(시간규칙).
  - **서버설계**: `createWorldState`에 `clock={epochMs, gameDay, gameStartDate}`. `advanceGameTime(realMs)`: gameMs=realMs×24, 일경계 넘으면 onDayTick 콜백. `registerDayTick(fn)`/`currentGameDay()`. auth-server에 `clockHandle=setInterval`(strat 패턴). **economy §1.6과 동일 클록 — 공용 인프라로 단일 구현**.
  - **커맨드코드**: 없음(서버내부 시간원; 0x0908/0x0356 결과통지가 구동 결과).
  - **필요데이터**: 시작일자·데드라인 801-07-27=§14/memory(P1). 24× 배율=§14(P1).
  - **테스트**: ① advanceGameTime(5분 실ms)→+2게임시간 ② 하루 경계→onDayTick 1회 ③ 여러 날 점프→각 날/누적 전달 ④ currentGameDay 정확 ⑤ registerDayTick 콜백이 evaluate 수신.
  - **리스크**: 순수 추가(기본 미구동), opt-in 인터벌로 회귀 0. 세부 시작일/데드라인 와이어반영은 별도. 24× CONFIRMED.

- [ ] **2.8 커맨드레인지서클 (전술 명령권 자원)**
  - **캐논룰+페이지**: 명령원점=기함유닛/방위HQ. 기함자기/개인명령은 우회. 발령은 同戦隊·서클내; 저사기/혼란 불가. 반경은 시간성장(기함별 상한), 매 발행 0 리셋. 확장률=指揮 함수, 최대=기함성능 함수. 독행艦 서클 없음. 0–20초 기동지연. — p47–48, p53, p55.
  - **서버설계**: `createCommandRangeState()` `Map<flagshipId,{radius, maxRadius, growthRate, lastResetGameMs}>`. `computeRadius(flagship, nowMs)=min(maxRadius, growthRate*(now-lastReset))`. growthRate=f(指揮)[P3], maxRadius=f(기함성능)[P3]. `canCommand({flagshipId, targetId, worldState, nowMs})`: 독행艦→자기/개인만; 저사기/혼란→false; distance≤radius→true. `issueResetsCircle`. 전술핸들러(0x0400/0x0405)에서 적용 전 게이트(개인/자기기함 우회), 적용 후 리셋. notify에 `startupDelay`(0–20초).
  - **커맨드코드**: 0x0400/0x0405/0x0406/0x0401(전술 게이트), 🔴 0x0423/0x0424/0x0426(startupDelay 동반).
  - **필요데이터**: 확장률·최대반경·저사기 임계 **P3 ⚠️ 검증필요**. 0–20초=p53(범위 캐논, 명령별 §9.11 교차). 指揮=char abilities[shiki](P0). 기함성능=ship-stats.json(P1).
  - **테스트**: ① radius 성장 후 cap ② 발행 후 0 리셋 ③ 서클 밖→false ④ 독행艦 일반거부/자기우회 ⑤ 저사기 불가 ⑥ 指揮↑→growthRate↑ ⑦ notify startupDelay.
  - **리스크**: 계수 P3, 메커니즘 캐논. 전술 게이트 클라-대면 → 🔴 라이브검증(서클 밖 거부가 흐름 안 깨는지). 회귀방지 **opt-in `LOGH_CMD_RANGE=1`** 권장.

---

## 3. 도메인: combat-gaps (§B4 — 전투엔진 캐논 룰 마감)

> 戦闘艇·戦死 토글·艦隊最大士気/저사기 지휘불가·降伏勧告. (에너지/포즈/사선/지상전은 구현완료 제외.)
> **대상**: `logh7-combat-engine.mjs`, `logh7-battle-ops.mjs`, `logh7-world-state.mjs`, `logh7-command-engine.mjs`, `logh7-login-protocol.mjs`, `logh7-world-relay.mjs` + 테스트.

- [ ] **3.1 戦闘艇(Fighter) 발진/공중전 — 0x40e 스텁을 캐논 효과로 교체**
  - **캐논룰+페이지**: 戦闘艇은 공격력 낮으나 함선 표적 감속/적 전투정 격퇴. 발진 정액 10 物資. 원작 未実装. 空戦命令(w)=wait5/dur0, 표적별 對艦/邀撃 자동선택. 母艦 탑재=클래스별 fighter_num(동맹 戦闘艇母艦 796년형=Spartanian 100, FR88=10–12, SS75Ⅶ +Walküre4). 戦闘 자세=+공격/−sensor/+사기손실. — p50, p54, p79, p83, p94.
  - **서버설계**: `computeAirCombat(launcher, target, {mode})` 순수함수. 對艦=computeDamage(kind 'fighter')+`{slowFactor}`, intercept=양측 fighter 격감. 반환 `{kind, damage?, slowFactor?, launcherFightersAfter, targetFightersAfter, supplyCost:10}`. world-state upsertShip에 `fighterMax/fighters`(fighter_num 시드)+`supplies`. `launchFighters(shipId)`(물자≥10 검증·−10), `applySlow(targetId,slowFactor)`(ship.speedMul), `applyFighterLoss`. battle-ops/command-engine AIR_BATTLE 핸들러를 스텁(고정 result:1) 대신 computeAirCombat로 교체(소유검증→물자게이트 `no-supplies`→표적판정→effect→`buildNotifyAirBattleInner` 실값). NotifyMoraleDown/NotifyAttackedShip 보조.
  - **커맨드코드**: 🔴 0x040e(C→S CommandAirBattle, body 0x98), 🔴 0x0428(S→C NotifyAirBattle, 6 dwords), 0x030f(ResponseStaticInformationFighters — 빌더 존재, 시드 소스), 0x040f/0x0410.
  - **필요데이터**: ship-stats fighter_num(존재 확인). 일부 클래스 'no label' note **⚠️ 검증필요**. 戦闘艇 스탯(0x30f master) 콘텐츠 채워졌는지 **⚠️ 검증필요**(공란이면 정성서술만 → 수치는 **SERVER DESIGN 밸런스값**). slow비율·intercept 격감수 매뉴얼 부재 → **SERVER DESIGN**.
  - **테스트**: ① 對艦: damage>0+slowFactor<1+supplyCost10 ② intercept: 양측 fightersAfter 감소 ③ launchFighters supplies<10→short / ≥10→−10 ④ 물자부족 reject `no-supplies` ⑤ result가 고정1 아닌 계산값 ⑥ upsertShip: 戦闘艇母艦 fighters=100, 駆逐艦 0.
  - **리스크**: 원작 未実装(p50) — 클라 0x428 렌더 🔴 라이브검증. slow/intercept=SERVER DESIGN(정성규칙만 인용). fighter master 공란 가능 ⚠️ 검증필요.

- [ ] **3.2 戦死(Combat death) 토글 — 격침 시 기본 負傷+帰還惑星 워프, 옵트인 시 사망**
  - **캐논룰+페이지**: 戦死는 플레이어 선택. 旗艦 파괴 기본=負傷+帰還惑星 즉시 워프. 帰還惑星=System Settings→Game Settings→Return Planet, 미지정 시 出身地. 원작 戦闘死 未実装. 사망 시 准将+ 계급별 고정 평가포인트(§5.2). 세션 재등록 제한(§1.4). — p52, p14, §5.2, p10.
  - **서버설계**: character에 `deathToggle`(기본 false=injure), `returnPlanet`(null→birthplace), `injured`, `alive`. `setReturnPlanet`/`setDeathToggle`. `resolveFlagshipDestroyed({shipId, charId})`: toggle false면 injured=true+warp(returnPlanet/birthplace)+旗艦 재생성→`{outcome:'injured', warpTo}`; true면 alive=false+准将+ `rankDeathAward(rank)`+旗艦 제거→`{outcome:'killed', evalAward}`. `rankDeathAward` 순수함수(테이블=**SERVER DESIGN**). command-engine COMMAND_FIGHT의 destroyed 분기에서 旗艦(character≠0)이면 resolveFlagshipDestroyed→워프/사망 notify.
  - **커맨드코드**: 0x0426(격침 트리거, 구현됨), 0x0423(워프 표현, 구현됨), 🔴 0x0425(NotifyWarpedShip 0x90 — 후보, 레이아웃 미확정), 🔴 0x0500/0x0501(게임설정 family — 戦死 토글 매핑 ⚠️ 검증필요).
  - **필요데이터**: 계급별 사망 평가포인트(§5.2 언급, 수치표 미수록) **⚠️ 검증필요/SERVER DESIGN**. 帰還惑星 설정 와이어 미확정 **🔴 라이브검증**. 워프 표현(0x0425 vs 0x0423) **🔴 라이브검증**. 出身地→respawn=0x0323·galaxy.json 교차.
  - **테스트**: ① toggle false→'injured' injured=true alive유지 warpTo=returnPlanet ② 미지정→birthplace fallback ③ toggle true→'killed' alive=false 旗艦제거 ④ true&rank≥准将→evalAward>0 ⑤ true&rank<准将→0 ⑥ COMMAND_FIGHT 旗艦 격침→resolveFlagshipDestroyed 경유.
  - **리스크**: 원작 未実装(p52) — 사망 분기 미검증 영역, 🔴 라이브검증 필수(워프 vs 사망연출). 평가포인트=SERVER DESIGN. returnPlanet 와이어 미확정. 旗艦 재생성(§5.7 provisional)과 결합.

- [ ] **3.3 艦隊最大士気(Fleet max-morale) — 統率 기반 상한 + 저사기 지휘불가 게이트**
  - **캐논룰+페이지**: 統率(PCP index0)이 艦隊最大士気·降伏勧告성공률 좌우. 戦闘 자세=+사기손실. 低사기/混乱 유닛 지휘불가. NotifyMoraleDown 0x440. — p14-15, p47-48, p54.
  - **서버설계**: `fleetMaxMorale(leadership)` 순수함수(0–100→상한; 곡선 SERVER DESIGN, '統率이 상한' 캐논). ship에 `maxMorale`+`commanderLeadership`. lowerMorale floor 0 유지, raiseMorale은 maxMorale clamp(현 EncourageFlagship 0x7fff clamp→maxMorale로 교체). `setFleetMorale(fleetId, leadership)` 일괄. `canCommand(unitId)`: morale≥`LOW_MORALE_THRESHOLD`(SERVER DESIGN, 예 20)&&confusion===0. CHANGE_MODE/CHANGE_AUTHORITY/지휘 경로 + EncourageFlagship에서 canCommand 검사→실패 시 `low-morale` 또는 skip. 統率=char abilities[0](tochi).
  - **커맨드코드**: 0x0440(NotifyMoraleDown, 빌더 존재), 0x042c(EncourageFlagship — raiseMorale clamp 대상), 0x0411/0x042f(ChangeMode — canCommand 게이트), 0x0420/0x0439(ChangeAuthority — 저사기 제외).
  - **필요데이터**: 統率→상한 곡선·低사기 임계·混乱 수치 매뉴얼 부재 → **SERVER DESIGN**(규칙만 캐논). 統率=ability-seed/0x0323 abilities[0](확보). 사령관↔함대 매핑은 fleet/commander 필드 결합(부분).
  - **테스트**: ① fleetMaxMorale 統率0<100 단조 ② setFleetMorale 사령관 統率 기반 ③ raiseMorale가 maxMorale 초과 못함 ④ canCommand morale<임계/confusion>0→false ⑤ 지휘명령 低사기→`low-morale`/skip ⑥ 戦闘 posture 사기손실 가중.
  - **리스크**: 곡선/임계 SERVER DESIGN. 지휘 게이트가 기존 통과 경로 막을 수 있어 **회귀 위험**→테스트 영향 확인. 사령관↔함선 바인딩 fleet 의존. 사기 0x33b/0x33f 와이어 표시→상한 변경 시 🔴 라이브 표시 검증 권장.

- [ ] **3.4 降伏勧告(Surrender recommendation) — 統率 기반 성공률 + 항복 처리**
  - **캐논룰+페이지**: 降伏勧告성공률은 사령관 統率이 좌우. 성공 시 적 유닛 전투 이탈/접수(격침 아닌 무력화). 적 격파/점령 시 평가포인트(§5.2) — 항복=비격침 무력화. — p14-15, §5.2.
  - **서버설계**: `surrenderChance(leadership, target)` 순수함수(統率+표적 사기약화→0..1; '統率이 좌우' 캐논, 곡선 SERVER DESIGN) + `resolveSurrender(recommender, target, roll)`→`{accepted, chance}`. `surrenderShip(targetId, toFaction)`: faction 전환(접수) 또는 제거+점령측 평가포인트, reason='surrender'. SURRENDER 핸들러: 旗艦 소유검증→統率 조회→surrenderChance→roll 주입(state.rng)→성공 시 surrenderShip+notify, 실패 시 result:fail. 평가포인트 누적기 연동.
  - **커맨드코드**: 🔴 ⚠️ 降伏勧告 C→S **미확정**(battle 0x43x/0x44x 후보, status 'spec'), 🔴 ⚠️ S→C **미확정**(0x0442 NotifyFinishOccupation 유사 후보), 0x0440(사기0 보조), 0x0426(상태변경 보조).
  - **필요데이터**: C→S/S→C 코드 **⚠️ 검증필요**(message-catalog Surrender 엔트리 0건). 統率→성공률 곡선·표적사기 가중 매뉴얼 부재 → **SERVER DESIGN**. 항복 후 처리(전환 vs 제거)·평가식=설계 결정.
  - **테스트**: ① surrenderChance 統率↑→chance↑(0..1) ② 표적사기↓→chance↑ ③ roll<chance→true, ≥→false ④ 旗艦 비소유→`not-owner` ⑤ 성공→surrenderShip 무력화+평가포인트 ⑥ rng 주입 양 경로 재현.
  - **리스크**: 명령/notify 코드 미확정 → `logh7-re/logh7-live`로 0x43x/0x44x 대역 파서 확인(🔴 라이브검증 필수). 매뉴얼에 降伏勧告 wire 흔적 없음 → 원작 클라 UI 존재 여부조차 ⚠️ 검증필요(없으면 서버측 자율 무력화 한정). 성공률 SERVER DESIGN. 평가포인트는 personnel 미구현부 결합.

---

## 4. 도메인: personnel-honors (§B5 — 작위·봉토·훈장·연령·기함·체포·관계)

> **신규**: `logh7-honors.mjs`, `logh7-rank-ladder.mjs`, 테스트 2종.
> **확장**: `logh7-imperial-titles.mjs`(봉토 상태+라우터).
> **수정**: `logh7-personnel.mjs`(0x0356 decoration_bits/arrested/influence/title 실값 배선 + setter), `logh7-world-state.mjs`(인사 틱 훅+age/birthdate/decorations/relations), `logh7-command-engine.mjs`(인사명예 라우팅).
> **참고**: `imperial-titles.mjs`는 존재하나 어떤 명령에도 미배선(dead code) — **배선이 핵심 작업**.

- [ ] **4.1 작위(爵位) 수여 — 叙爵 + 0x0356 작위명 갱신**
  - **캐논룰+페이지**: 叙爵 CP160, Empire only. 게이트=귀족/帝国騎士 출신+일정 계급. 작위 사다리 7단(公/侯/伯/子/男/帝国騎士/平民). 사다리 law2=爵位 높을수록 우선(Empire military only). — p99, p601, p599, imperial-titles.json.
  - **서버설계**: `createHonorsState() {titles: Map<charId,{titleRank}>}`. processHonors 叙爵→`validateGrantTitle({target,newTitle,minMilitaryRank})`(imperial-titles 재사용)→setTitle+personnel 동기→`buildNotifyInformationCharacterInner({characterId, title})` 'all'. faction!=empire→`empire-only`. CP 160 차감.
  - **커맨드코드**: 🔴 0x0356(작위명=parentage+0x58 titlename[13]). ⚠️ C→S 叙爵 opcode **미확정**(0x0704-0709 외).
  - **필요데이터**: 작위 사다리=imperial-titles.json(P1/P2, 존재). 叙爵 opcode **⚠️ 검증필요**(redex CommandConferPeerage). minMilitaryRank 수치 미기재=P3.
  - **테스트**: ① commoner 거부 ② 계급 미달 거부 ③ titlename 신작위 일치 ④ 비제국 `empire-only`.
  - **리스크**: 0x0356 작위명 렌더 🔴 라이브검증. opcode ⚠️ 검증필요. imperial-titles 배선이 핵심.

- [ ] **4.2 봉토(封土) 수여/직할 — 封土授与/封土直轄 + 봉토 수입**
  - **캐논룰+페이지**: 封土授与 CP640 Empire only, 게이트=男爵(rank5)+ 작위. 封土直轄 CP640. 진급/강등 카드박탈 예외(個人/艦長/封土 유지). 봉토 수입=봉토 세금이 영주 것. — p604, p296/p298, p481.
  - **서버설계**: `state.fiefs: Map<baseId,{lordCharId,taxRatePct}>`. 封土授与→`validateGrantFief({target,base})`→`applyGrantFief(base,lord)`→base.owner=lordId, 영주 0x0356 spot_owner 갱신, 수입은 NotifyBaseParameter 틱에 `fiefIncome` 가산. 封土直轄→`applyRevokeFief`. character에 fiefs[]. 진급/강등(rank-ladder)에서 封土 카드 보존.
  - **커맨드코드**: 🔴 0x031d/0x031f(base owner)+0x0356(spot_owner@0x20), NotifyBaseParameter(0x031f 봉토 세수). ⚠️ C→S opcode **미확정**.
  - **필요데이터**: 세율/관세 수치=P3(DEFAULT_TUNING taxRatePct20). 봉토 가능 base=base 소유 모델 재사용. opcode **⚠️ 검증필요**.
  - **테스트**: ① 男爵 미만 거부 ② 이미 타 영주 거부 ③ base.owner=lordId&lord.fiefs ④ fiefIncome 합산 ⑤ 진급 시 封土 보존.
  - **리스크**: 봉토 수입→경제 틱 의존(**economy §1.5와 결합**, 원작 未実装). base owner 표시 🔴 라이브검증. opcode 미확정.

- [ ] **4.3 훈장(叙勲) — award + 0x0356 decoration_bits 배선 (law3 skip 준수)**
  - **캐논룰+페이지**: 叙勲 CP160. 단 사다리 law3(최고훈장순)=훈장 현재 未実装 → **skip**. 훈장 비트는 표시용 기록, 사다리 정렬 반영 금지. — p600, p270, p269-271.
  - **서버설계**: `state.decorations: Map<charId, Uint8Array(16)>`(0x0356 decoration_bits[16]@0x6c). 叙勲→비트 set→personnel 빌더의 `streamBytes(null,0x10)`을 state.decorations로 교체→0x0356 'all'. rank-ladder 비교자는 law3 **명시적 skip**(주석+테스트 고정).
  - **커맨드코드**: 🔴 0x0356(decoration_bits[16]@0x6c). ⚠️ C→S 叙勲 opcode **미확정**.
  - **필요데이터**: 훈장 카탈로그(종류/비트 인덱스) **⚠️ 검증필요**(constmsg 훈장명 그룹 추출). 현재 빌더 0 출력.
  - **테스트**: ① 지정 비트 set 후 region[0x6c,0x7c) 일치 ② 비교자: 훈장 차이 정렬 무영향(law3 skip) ③ decode round-trip 비트 보존.
  - **리스크**: 원작 自체 未実装(law3 skip) — 표시용 한정. 0x0356 렌더 🔴 라이브검증. 카탈로그 ⚠️ 검증필요. opcode 미확정.

- [ ] **4.4 계급 사다리 5법칙 비교자 + 정원캡**
  - **캐논룰+페이지**: 5법칙(p35): (1)功績 (2)爵位[帝国軍 military only] (3)최고훈장순[미구현 **SKIP**] (4)影響力 (5)전 파라미터 합. 軍人/政治家 분리 사다리. 정원캡: 元帥5/上級大将5(Empire만)/大将10/中将20/少将40/准将80/大佐이하 무제한. — p266-272, p273-284.
  - **서버설계**: `compareLadder(a,b,{faction})` 5법칙 순차(law3 skip, law2는 empire&&military). `RANK_HEADCOUNT={14:{empire:5,alliance:5},13:{empire:5,alliance:0},...}`. `sortLadder(chars,rank,track,faction)`. `enforceHeadcount(rank)`(초과 시 promote reject). char에 influence/paramSum/track/faction.
  - **커맨드코드**: 진급/강등 결과는 0x0356로 재정렬 표시.
  - **필요데이터**: 5법칙·정원캡=p35(**캐논 확정 P1**). 影響力=honors state, 功績=achievement, 爵位=honors titles, 파라미터합=abilities[8] 합.
  - **테스트**: ① 功績 동률→爵위(empire military) ② Alliance 爵위 무시 ③ law3 절대 무시 ④ 影響力 tiebreak ⑤ 파라미터합 최종 ⑥ 元帥 6번째 reject ⑦ 上級大将 Alliance 정원0→불가.
  - **리스크**: 순수 룰(비대면) — 라이브 불필요. 진급/강등 0x0356 표시는 🔴 라이브검증 권장. 기존 promote/demote가 정렬·캡 무시 중 → 비교자 통합 필요.

- [ ] **4.5 진급/강등 메커닉 보강 — merit리셋 + 카드박탈 예외 + 30게임일/월간 자동**
  - **캐논룰+페이지**: 진급: 상위 맨밑, 功績→0, 個人/艦長/封土 외 카드 상실. 강등: 하위 맨밑, 功績→100, 동일 예외. 월간 자동(大佐이하): 각 사다리 #1 매 실제月 1일. 30게임일 체크: 자격자 자동 승강, 자동승진자 목표사다리 평균功績. 元帥 정원시 차단. — p263-264, p296, p298.
  - **서버설계**: `applyPromote(char,outfits)`(rank+1, achievement=0, 個人/艦長/封土 외 제거+NotifyCardLoss 0x70a 다수). `applyDemote`(rank-1, achievement=100). world-state `onRealMonth()`(大佐이하 #1 promote 캡통과). `on30GameDays()`(일괄 승강, 자동승진 achievement=avg). 기존 COMMAND_RANK_UP가 비교자·카드규칙 호출하도록 보강.
  - **커맨드코드**: 0x70a(NotifyCardLoss, 빌더), 🔴 0x0356(merit/rank).
  - **필요데이터**: 임계·평균功績=p263-264 룰. 個人/艦長/封土 카드 식별=role enum **⚠️ 검증필요**.
  - **테스트**: ① applyPromote achievement→0 ② 個人/艦長/封土 외 0x70a 제거 ③ applyDemote→100 ④ onRealMonth 大佐이하 #1만 ⑤ on30GameDays 평균功績 ⑥ 캡 가득 시 차단.
  - **리스크**: 월간 틱은 **게임클록(operations §2.7) 의존**. 카드 role 값 ⚠️ 검증필요. 0x70a 클라 반영 🔴 라이브검증.

- [ ] **4.6 연령 드리프트(年齢効果) — 월간 확률변동**
  - **캐논룰+페이지**: 年齢効果(暫定 spec): 매月 若年 +확률, 壮年 -확률, 고정 cap/floor. 정확 경계·확률·cap 매뉴얼 미기재(must be sourced elsewhere). — p128/p15.
  - **서버설계**: `applyAgeDrift(char,rng,defines)`. character에 age/birthdate. world-state onRealMonth에서 전 캐릭 순회→경계(youngMaxAge/matureMinAge)·확률(driftProbPct)·cap/floor(0~100)→변동 시 0x0356. 수치 전부 **P3 define**(AGE_TUNING_DEFAULTS).
  - **커맨드코드**: 🔴 0x0356(abilities[8]@0x18c).
  - **필요데이터**: 경계/확률/cap 캐논 미기재 **P3 ⚠️ 검증필요**(IV EX 차분/라이브 관측 추정). age=0x0323 birthday(존재)지만 age 계산 미배선.
  - **테스트**: ① 若年 +변동(결정론 RNG) ② 壮年 -변동 ③ cap/floor 클램프 ④ 변동 시 0x0356.
  - **리스크**: 원작 暫定·수치 미기재 → 전부 P3 define. 능력치 0x0356 🔴 라이브검증. 추측 금지 → define 기본값으로만.

- [ ] **4.7 계급별 기함 자동교체 — 진급/강등 시 旗艦 swap**
  - **캐논룰+페이지**: 기함 변경(暫定): type은 생성 시 계급 결정, 계급변동 시 자동 교체. 志願(정치가→군인)=rank少佐+戦艦. — p301, p554.
  - **서버설계**: `flagshipForRank(rank,faction)` 매핑 테이블. applyPromote/applyDemote/志願 후 `newFlag=flagshipForRank`→`buildNotifyChangeFlagShipInner` 0x0358 'all'. character.flagshipClass 갱신.
  - **커맨드코드**: 🔴 0x0358(NotifyChangeFlagShip, 92B, 빌더).
  - **필요데이터**: 계급→기함 매핑표 **⚠️ 검증필요**(미기재 → ship-stats.json 추정·define). 클래스 id=ship-stats.json.
  - **테스트**: ① 中将→대응 기함 ② applyPromote 후 0x0358+flagshipClass ③ 志願 rank少佐&戦艦.
  - **리스크**: 원작 暫定·매핑 미기재 → P3 define. 0x0358 🔴 라이브검증. 매핑 ⚠️ 검증필요.

- [ ] **4.8 체포/규율 매트릭스 — 逮捕許可/執行命令/逮捕命令 + arrest list**
  - **캐논룰+페이지**: 逮捕許可 CP800(arrest list 등록), 執行命令 CP800(체포권 위임), 逮捕命令 CP160(동석 타겟 체포). 매트릭스(p791): Empire 内務尚書(≤大佐)/司法尚書(정치가)/憲兵総監(元帥 제외); Alliance 法秩序委員長(정치가)/憲兵司令官(元帥 포함). 拘禁→処断(CP320 정치). — p629-631, p791, p620, p663-666/p732.
  - **서버설계**: `state.arrestList: Set<charId>`, `state.detained: Map<charId,{atCapital}>`. 逮捕許可→자진영+arrestList.add. 逮捕命令→`canArrest(actorRole,targetClass,targetRank,faction)`+동석검증→detained.add→personnel 0x0356 arrested=1(현 하드코딩0 교체)→'all'. 処断은 정치 명령으로 해제/판결. 매트릭스는 content-pack org roles에서 actorRole.
  - **커맨드코드**: 🔴 0x0356(arrested@0x7c, 현 하드코딩0). ⚠️ C→S 逮捕許可/執行命令/逮捕命令 opcode **미확정**(諜報群).
  - **필요데이터**: 매트릭스=p791/p663-666(**캐논 확정**). registry=content-pack org roles. opcode **⚠️ 검증필요**(redex).
  - **테스트**: ① 内務尚書 ≤大佐 허용 ② 内務尚書 准将 거부 ③ 憲兵総監 元帥 거부(Empire) ④ 憲兵司令官 元帥 허용(Alliance) ⑤ 逮捕 후 arrested=1 ⑥ 타진영 逮捕許可 거부.
  - **리스크**: 0x0356 arrested 렌더+拘禁 UI 🔴 라이브검증. opcode ⚠️ 검증필요. 첩보/처단(intel-coup 도메인) 결합.

- [ ] **4.9 관계(友好度/影響力) — 会見/夜会/狩猟/会談/談話/演説 + 0x0356 influence 배선**
  - **캐논룰+페이지**: 影響力 0x0356 influence@0x1a8(u8). 夜会(CP320 影響力)/狩猟(影響力+友好度)/会談(影響力)/談話(友好度+影響力)/演説(影響力+지역支持率). 会見(個人 CP10, 동석 友好度↑). 統率은 law4. — p611-615, p558, p270, p577/p90.
  - **서버설계**: `state.influence: Map<charId,u8>`(0~100 클램프), `state.favor: Map<'a:b', value>`. 会見→favor++ 양측 0x0356. 夜会/会談/演説→influence±. 狩猟/談話→influence+favor 동시. personnel 빌더 influence param을 state.influence에서 공급. influence는 rank-ladder law4 입력.
  - **커맨드코드**: 🔴 0x0356(influence@0x1a8). ⚠️ C→S 会見/夜会/狩猟/会談/談話/演説 opcode **미확정**(個人/政治群).
  - **필요데이터**: 影響力/友好度 증감폭 **P3 define ⚠️ 검증필요**. 효과 방향=p611-615(**캐논 확정**). opcode **⚠️ 검증필요**.
  - **테스트**: ① 会見 favor++ 양측 0x0356 ② 夜会 influence@0x1a8 일치 ③ cap/floor 클램프 ④ law4 influence 높은쪽 우선.
  - **리스크**: 0x0356 influence 렌더 🔴 라이브검증. 증감폭 P3(추측금지). opcode 미확정. **演説 일부효과는 economy(政府支持率) 결합 의존**.

---

## 5. 도메인: intel-coup (첩보·쿠데타 — 후순위)

> **신규**: `logh7-intel.mjs`, `logh7-coup.mjs`, 테스트 2종.
> **수정**: `logh7-command-engine.mjs`(routeInternalAffairs), `logh7-personnel.mjs`(0x0323 coup_conduct/arrested 배선), `logh7-world-state.mjs`(spot/faction 권위 상태+decisive-victory no-coup 게이트).
> ⚠️ **이 도메인의 C→S opcode는 거의 전부 미확정** — 클라 dispatch-size 카탈로그에 0x07xx는 인사(0x0704-0709)만 존재. 순수 룰 엔진/상태는 지금 구현·테스트 가능, 와이어는 🔴 라이브검증.

- [ ] **5.1 Coup state engine — 叛意/謀議/参加 모집 그래프**
  - **캐논룰+페이지**: 叛意 CP640(주모자), 謀議 CP640(같은 스폿 인물 모집), 参加 CP160(부하 합류). 謀議는 同スポット 한정. — p69-70, p20/p149.
  - **서버설계**: `createCoupState()`→`{coups: Map<coupId,{id,ringleader,faction,members,recruited,loyalty,executed,createdAt}>, byRingleader, _nextCoupId}`. `declareRingleader`/`conspire(coupId,recruiterId,targetCharId,sameSpot)`(sameSpot false→`not-same-spot`)/`joinCoup`(recruited에 있어야). `processCoup` 디스패처는 strategy.mjs와 동일 `{accept,reject?,notifies}`. spot=worldState 캐릭터 spot.
  - **커맨드코드**: ⚠️ 🔴 叛意/謀議/参加 C→S **미확정**(카탈로그 부재).
  - **필요데이터**: CP(640/640/160) **캐논 확정**. 와이어 코드/바디 **⚠️ 검증필요**(RE). spot=worldState(존재).
  - **테스트**: ① declareRingleader→byRingleader+coup 생성 ② conspire(true)→recruited accept ③ conspire(false)→`not-same-spot` ④ joinCoup 미모집→`not-recruited` ⑤ joinCoup 모집→members.
  - **리스크**: C→S 코드 RE 미확정 → 🔴 라이브검증. 순수 룰은 지금 가능. CP 차감 미구현(cross-cutting) → 비용은 데이터 보관.

- [ ] **5.2 叛乱忠誠度 + 説得 Persuade**
  - **캐논룰+페이지**: 説得 CP640='↑叛乱忠誠度 of own units'. 叛乱忠誠度=쿠데타 실행 누적 게이지. — p69-70.
  - **서버설계**: coup.loyalty Map<charId,number>(0). `persuade(coupId, targetCharId, delta)`(delta 기본 `PERSUADE_STEP` const+TODO). own units(faction/owner) 한정.
  - **커맨드코드**: ⚠️ 🔴 説得 C→S **미확정**.
  - **필요데이터**: 1회 증가량·임계값 **캐논 미기재 ⚠️ 검증필요**(잠정 상수).
  - **테스트**: ① persuade(own)→loyalty 증가 ② 다른 faction→`not-own-unit` ③ 반복 누적(상한 클램프).
  - **리스크**: 수치 캐논 부재 → 잠정 상수+⚠️ 검증필요. own 판정 worldState owner 가능.

- [ ] **5.3 叛乱 Execute Coup — 발동 + decisive-victory no-coup 게이트**
  - **캐논룰+페이지**: 叛乱 CP640(발동). §1 決定的勝利 조건=세션 종료 시 쿠데타 부존재. 활성 쿠데타 있으면 限定的勝利로 강등. — p69-70, p12-13.
  - **서버설계**: `executeCoup(coupId)`→executed=true. worldState `hasActiveCoup(faction?)`(coupState lazy attach `worldState._coup`). 승패평가의 決定的勝利에서 hasActiveCoup→limited. (평가 함수 없으면 'no-coup 게이트 훅'을 진입점에 주입.)
  - **커맨드코드**: ⚠️ 🔴 叛乱 C→S **미확정**, 발동 통지 **미확정**.
  - **필요데이터**: no-coup 게이트 **캐논 확정**. 발동 성공조건(忠誠度/병력비) **⚠️ 검증필요**.
  - **테스트**: ① executeCoup→executed&hasActiveCoup true ② hasActiveCoup→evaluateVictory Limited ③ 없으면 Decisive 후보 유지.
  - **리스크**: 승패평가 함수가 world-state에 없을 수 있음(§14 ✅지만 grep 무매치) → 게이트는 진입점 훅, 평가 미구현이면 별도 갭. 성공조건 ⚠️ 검증필요.

- [ ] **5.4 coup_conduct / arrested 와이어 필드 배선 (0x0323)**
  - **캐논룰+페이지**: 0x0323에 coup_conduct(u32)+arrested(u8)(클라 파서 확정 오프셋). 현재 둘 다 하드코딩 0. — info-records-wire, personnel.mjs L535/L550.
  - **서버설계**: `buildInformationCharacterRecordInner`에 coupConduct, arrested 파라미터 추가(기본 0 회귀방지). L535 streamU32·L550 streamU8을 인자로 치환. 호출부에서 `coupState.getConduct(charId)`/`intelState.isArrested(charId)`. 값 인코딩(0=무관/1=모집/2=주모자/3=참가) **⚠️ 검증필요**(클라 소비처 RE).
  - **커맨드코드**: 🔴 0x0323(출력 확정).
  - **필요데이터**: coup_conduct enum 의미 **⚠️ 검증필요**(FUN_00419300 계열 RE). arrested=불리언 확정.
  - **테스트**: ① coupConduct=2→u32 2 기록(오라클) ② arrested=1→u8 1 ③ 미지정→0(회귀 불변).
  - **리스크**: 출력 와이어 → 🔴 라이브검증(클라 표시 방식). enum 의미 RE 미확정 → 잠정 인코딩+⚠️ 검증필요.

- [ ] **5.5 Intel state engine — 逮捕リスト + 拘禁/処断**
  - **캐논룰+페이지**: 逮捕許可 CP800/執行命令 CP800/逮捕命令 CP160(同스폿/그리드). 処断 CP320(拘禁 판결). 亡命 CP320(적 수도 拘禁+주소록 wipe). — p73-74, p72, p69.
  - **서버설계**: `createIntelState()`→`{arrestList: Map<faction,Set>, enforcement: Map<charId,authorizerId>, imprisoned: Map<charId,{by,faction,at}>, _detentionSpot}`. `authorizeArrest`/`grantEnforcement`/`arrest(targetId,actorId,sameSpotOrGrid)`(→imprisoned+拘禁室 이동)/`passJudgment(charId,verdict)`. `isArrested`(→0x0323 arrested 구동). 亡命은 personnel defection 경로에서 `imprison()` 통합. 拘禁室 facility(inferred-content).
  - **커맨드코드**: ⚠️ 🔴 逮捕許可/執行命令/逮捕命令/処断 C→S **미확정**, 체포 통지 **미확정**.
  - **필요데이터**: CP(800/800/160/320) **확정**. 同스폿/그리드=worldState(존재). 拘禁室 spot id **⚠️ 검증필요**. 処断 verdict 종류 **⚠️ 검증필요**.
  - **테스트**: ① authorizeArrest→arrestList ② arrest(true,충족)→imprisoned&isArrested ③ arrest(false)→`not-co-located` ④ passJudgment→제거 ⑤ defection→imprison+주소록 wipe 훅.
  - **리스크**: C→S RE 미확정 🔴 라이브검증. 拘禁室 spot·verdict ⚠️ 검증필요. 亡命 통합은 personnel defection 경로 확인 필요.

- [ ] **5.6 査閲 Inspection — 쿠데타 징후 탐지**
  - **캐논룰+페이지**: 査閲 CP160(쿠데타 징후 탐지). 国防委員会 査閲部長(정원1/最低中将)이 권한 게이트. — p73-74, p748.
  - **서버설계**: `inspect(actorId, targetFaction)`→coupState 질의로 활성/모집 쿠데타 존재 반환. 査閲部長 카드 게이트=personnel 직무카드(任命). intel↔coup 의존: processIntel에 coupState 핸들 주입(command-engine 라우팅에서 lazy attach 후 전달).
  - **커맨드코드**: ⚠️ 🔴 査閲 C→S **미확정**, 탐지 통지 **미확정**.
  - **필요데이터**: CP160 확정. 탐지 확률/노출 범위 **⚠️ 검증필요**(잠정=불리언). 査閲部長 카드 id=직무 레지스트리.
  - **테스트**: ① inspect(모집중)→detected:true ② 없음→false ③ 카드 미보유→`no-inspection-authority`.
  - **리스크**: C→S RE 미확정. 입도(부분정보 vs 불리언) ⚠️ 검증필요. 직무 게이트는 personnel 직무 연동.

- [ ] **5.7 Espionage field-ops — 潜入/情報工作/破壊工作/煽動/侵入/帰還/監視/襲撃/脱出/一斉捜索**
  - **캐논룰+페이지**: 一斉捜索160(위치탐색)/襲撃160(同스폿 적 습격)/監視160(탐지까지 지속)/潜入160(시설 잠입)/脱出160/情報工作160(정보 절취→본국)/破壊160(시한폭탄)/煽動160(대상 政府支持率↓)/侵入320(적 천체 진입)/帰還320. — p73-74.
  - **서버설계**: `agents: Map<charId,{location, infiltratedFacility, surveilling, status}>`. `massSearch`/`raid(sameSpotEnemy)`/`surveil`(detected 자동해제)/`infiltrate`/`escape`/`intelOp`(→본국)/`sabotage`(→`{bombTimer}` 만료 시 피해)/`agitate`(→政府支持率 -delta, **economy 미구현이면 hook+TODO**)/`intrude`(320)/`returnOp`(320). 監視/破壊 타이머는 게임시계 tick 연동.
  - **커맨드코드**: ⚠️ 🔴 전 諜報 C→S **미확정**. wait/dur=0(p643).
  - **필요데이터**: CP(160×7, 320×2) **확정**. 시한폭탄 타이머·정보절취·煽動 하락량 **⚠️ 검증필요**. **煽動은 economy(政府支持率) 의존(미구현 → hook만)**.
  - **테스트**: ① infiltrate→infiltratedFacility ② intelOp(잠입)→stolenIntel/미잠입→reject ③ sabotage→bombTimer/tick 만료→피해 ④ surveil→자동해제 ⑤ raid(false)→`not-same-spot-enemy` ⑥ intrude/returnOp CP320.
  - **리스크**: C→S 전부 RE 미확정 🔴 라이브검증 필수. **煽動은 economy 미구현 의존(hook만)**. 시한폭탄/감시탐지 수치 캐논 부재 → 잠정상수+⚠️ 검증필요. **監視/破壊 지속성은 게임클록(operations §2.7) 의존**.

---

## 6. 도메인: ai (NPC·전략 시뮬 AI — 후순위)

> 위 도메인의 상태(morale/작전/생산/색적)를 소비. **다중 의존**.
> **대상**: `logh7-npc-ai.mjs`, `logh7-strategic-sim.mjs` + 테스트, `logh7-battle-engine.mjs`(read-only morale 참조), `logh7-auth-server.mjs`(틱 배선, AI 도메인 밖).

- [ ] **6.1 behaviorProfile: 8능력치 전체 반영 (PCP 4종 추가)**
  - **캐논룰+페이지**: 8능력=PCP(統率/政治/運用/情報)+MCP(指揮/機動/攻撃/防御). 현재 MCP 4종만. 統率=함대최대士기&降伏勧告, 指揮=행동속도+서클재성장, 機動=조함민첩+反転, 情報=전술색적. 政治/運用=CP회복(전략층). — p14-15, p48, p49, p53.
  - **서버설계**: `behaviorProfile()`에서 tochi/joho 읽어 `leadership=tochi/120`, `intel=joho/120`. 파생 `moraleCeiling=0.6+leadership*0.4`, `sensorBonus=intel*0.5`. 기존 aggression/caution/command/mobility/fireRangeSq/retreatBelow/moveStep/damageMul 보존(**회귀 없음**). n() 기본 80.
  - **커맨드코드**: 없음.
  - **필요데이터**: character-roster.json `_stat_keys`(tochi/.../bogyo) — **실데이터 P0, 검증불필요**. _count_with_stats=97.
  - **테스트**: ① tochi120>tochi20 leadership ② joho110>joho30 sensorBonus ③ 기존 4-MCP 테스트 통과(회귀가드) ④ 미지정 기본.
  - **리스크**: 낮음. 순수함수 추가. morale/sensor 실반영은 별도(§6.2~). command(指揮)와 leadership 의미 분리 주의.

- [ ] **6.2 NPC 함대 사기(morale) 상태 + 低사기 행동억제**
  - **캐논룰+페이지**: 최대사기는 統率 좌우. 0x33b/0x33f morale u8(기본 100). 低사기/혼란 명령불가. 戦闘 자세=+morale-loss. — p14-15, p47-48, p54.
  - **서버설계**: ship에 morale(0..100)(world-state upsertShip 디폴트 100 — 0x33b emit과 정합). decideShipAction에 게이트: morale<`MORALE_CMD_FLOOR`(20, P3)→'hold'. runNpcTick fire 후 피격 대상 morale 감소, 상한 `moraleCeiling*100` 클램프. setMorale/getMorale+logCombat.
  - **커맨드코드**: 🔴 0x33b, 0x33f.
  - **필요데이터**: 회복/감소율 **P3**(캐논수치 아님 태그). 최대사기↔統率 정확공식 미기재 → 선형근사 P3.
  - **테스트**: ① morale10→'hold' ② 피격 후 target.morale 감소 ③ moraleCeiling 초과 안함 ④ 미설정→디폴트100(회귀가드).
  - **리스크**: 중. world-state ship 스키마에 morale 추가(0x33b emit 정합). 임계/감소율 P3. 0x33b 와이어 emit됨 → 🔴 라이브검증 권장(클라가 morale 바).

- [ ] **6.3 NPC 降伏勧告 의사결정**
  - **캐논룰+페이지**: 統率이 降伏勧告성공률 좌우. §14 battle-engine ⚠ 'likely partial/missing'. 패배측 절망 시 항복 수용→전투종료. — p14-15, §14.
  - **서버설계**: `decideSurrender(attackerProfile, defenderState, rng)`: 방어 integrity≤`SURRENDER_THRESHOLD`(0.1, P3) && p=clamp(0.2+attacker.leadership*0.6) 성공→`{surrender:true}`. runNpcTick 절망 시 호출→성공 시 removeShip+logCombat+Notify. 권고 주체=最高 leadership 적함대 지휘관.
  - **커맨드코드**: 없음(폴백 0x0426 계열).
  - **필요데이터**: 성공공식/임계 **P3**(태그 필수). 항복 wire(전용 메시지) **RE 미확인** → `logh7-re` 확인, 미확인 시 격침 Notify(0x0426) 폴백.
  - **테스트**: ① integrity0.05+leadership1.0→고확률 surrender(고정seed) ② integrity0.5→호출안됨/false ③ 낮은 leadership 성공률↓(통계) ④ 성공→removeShip.
  - **리스크**: 중-높. 항복 wire RE 미확인 → 🔴 라이브검증(`logh7-re→logh7-live`). 공식 P3. 폴백이면 클라영향 최소.

- [ ] **6.4 전략 사령관 작전계획(作戦計画/発令) AI 입안**
  - **캐논룰+페이지**: 作戦計画 3종(CP10-1280)+発令(CP1-320). 입안≠발령. 占領=상대성계, 防衛=자성계1+, 掃討=독행艦. 부합 행동 격침공적 +1. 지속=발령 후 30일, 트리거=목표성계 도달. — p38, p39, §14.
  - **서버설계**: `decideOperationPlan(faction, graph, simState, commanderStats, rng)`: 高統率+高指揮 사령관이 적성계 인접&약방어→占領, 위협→防衛. `{purpose, targetSystem, participatingFleets, scheduledTick}`→simState.operationPlans(전역 캡: Σ≤진영 총함대). decideStrategicOrder가 활성 작전 목표를 가중(+OP_ADHERENCE). strategicTick에 30-tick 만료+결과평가(占領 전부→full, 1+→~50%). decisions에 기록.
  - **커맨드코드**: 없음(내부 의사결정).
  - **필요데이터**: CP비용표=§10 P1. 공적보너스 +1=p38 확인. 입안권(작전一/二/三課長)=personnel 의존(전략층은 高統率 근사). 30일↔틱 환산 P3.
  - **테스트**: ① 약방어 적인접→占領 ② 캡 초과 거부 ③ 활성 占領→목표 우선 advance ④ 30틱 만료+outcome ⑤ 防衛 자성계만.
  - **리스크**: 중. command-engine 유저측 작전 파이프라인과 중복/정합 주의(여기는 NPC 전략층만). 30일↔틱 P3. 와이어 영향 없음 → 라이브 불필요.

- [ ] **6.5 情報(joho) 기반 전략 색적/안개 + 미발견 적 회피**
  - **캐논룰+페이지**: 情報=스파이+전술색적(자동·연속, 정지 보너스, 안개 진영공유 success-OR). 현재 strategic-sim 완전관측 — 정보비대칭 미반영. — p15, p49.
  - **서버설계**: `visibleEnemies(graph, simState, fleet)`: 인접성계 적을 `detectP=clamp(0.4+intel*0.5 - dist*k)`로 판정, 미발견 적은 defenderStrength 제외. 진영 공유 안개(success-OR). simState.sharedIntel Set<systemName> per faction per tick.
  - **커맨드코드**: 없음.
  - **필요데이터**: 전략 색적범위/정확도 **P3**(태그 필수, 전략 100ly그리드 매핑 없음). intel↔발견확률 공식 P3.
  - **테스트**: ① 低intel 일부 미발견(고정seed) ② 高intel 더 자주 발견 ③ 진영 공유(success-OR) ④ 미발견 강방어 진격(불완전정보 결정론).
  - **리스크**: 중. 기존 완전관측 테스트 충돌 가능 → 기본 detectP 보수적 + 신규 테스트 분리. 와이어 없음 → 라이브 불필요. 수치 P3.

- [ ] **6.6 전략 함대 생산/재보충 (조병공창 기반)**
  - **캐논룰+페이지**: 함선생산은 造兵工廠 성계/요새만. 자동생산 연속·세수 미영향. 후방수송이 전선 보충. 현재 reinforce는 fleet.supply 고정풀(성계 무관). — p41, p9, §14.
  - **서버설계**: strategicTick reinforce에서 `fleet.homeSystem`(또는 인접 arsenal 자성계) 생산능력 가산. simState.systemProduction Map(systemName→{hasArsenal, rate}). reinforce=min(생산풀, reinforceRate×tochiBonus). 정복/상실 시 생산원천 이동.
  - **커맨드코드**: 🔴 0x0325(unit re-push, 기존 경로).
  - **필요데이터**: 성계별 造兵工廠 **⚠️ 검증필요**(p76-78 페어링 불확실, **content-verify §3 의존**; galaxy.json arsenal 플래그 없음). 요새/수도(이젤론/오딘/하이네센)만 확실. rate P3.
  - **테스트**: ① arsenal home 함대 reinforce↑ ② 상실 시 보충풀 감소 ③ 정복 시 진영이동 ④ 데이터 없는 성계 baseSupply 폴백(회귀가드).
  - **리스크**: 중-높. arsenal 데이터 추출-불확실 → **`logh7-extract` p76-78 재추출 또는 요새/수도 보수적 시드**. rate P3. 0x0325 재push 🔴 라이브검증 권장.

- [ ] **6.7 전략 사령관 수도방어 우선순위 + 패배조건 회피**
  - **캐논룰+페이지**: 지배성계 ≤3→게임종료. 수도 점령=즉시 종료. 決定的勝利=종료 시 쿠데타 없음 등. 현재 decideStrategicOrder 임계/수도 인식 없음. — p12, p12-13.
  - **서버설계**: simState 진영별 ownedCount/capital 추적. ownedCount≤`CRISIS_THRESHOLD`(5, P3) 또는 수도 인접 적→defend 강제(+CAPITAL_DEFENSE). strategicTick이 capital 점령/≤3 도달 시 result `{gameOver, reason, winner}`(auth-server가 세션종료/재시작, world-state 승패평가 연동).
  - **커맨드코드**: 없음.
  - **필요데이터**: 수도=DEFAULT_CAPITALS(ヴァルハラ/동맹 corridor 차용, P0 이름; 동맹 수도성계 부재=galaxy.json 한계). ≤3=p12 P1. CRISIS P3.
  - **테스트**: ① 4개로 줄면 defend 급증 ② 수도 인접 적→수도방어 우선 ③ 수도 점령→gameOver winner ④ ≤3→gameOver reason='collapse' ⑤ 평시 advance 유지(회귀가드).
  - **리스크**: 중. world-state 승패평가(§14 ✅ 4티어)와 책임분담 명확화(strategic-sim은 신호만, 최종은 world-state). 동맹 수도 부재→corridor 차용. 와이어 없음 → 라이브 불필요, 세션 재시작은 통합테스트.

- [ ] **6.8 profileByFaction 캐논 지휘관 자동주입 (runNpcTick 전술층)**
  - **캐논룰+페이지**: 미선택 캐논 인물은 AI 조종, 각 NPC 함대=지휘관 실능력 인격. 현재 auth-server는 defaultProfile(중립)만 전달 — 전술 NPC가 캐논 인격 못 받음. — p11, p14-15.
  - **서버설계**: `buildFactionProfiles(roster)`: strategic-sim.pickCommanders 동일 규칙(faction별 高統率)으로 진영당 대표 stats→behaviorProfile 맵, FACTION_WIRE(1=empire,2=alliance) 키. npc-ai에서 export, auth-server가 profileByFaction로 주입(배선은 AI 도메인 밖이나 함수 제공).
  - **커맨드코드**: 🔴 0x0426(기존 경로, 라이브검증됨).
  - **필요데이터**: character-roster.json 실stats **P0(검증불필요)**. FACTION_WIRE(기존).
  - **테스트**: ① `{1,2}` 반환 각 高統率 반영 ② empire 高kogeki→aggression↑ ③ 빈/stats없음→폴백 안전 ④ 주입 시 진영별 행동 차이.
  - **리스크**: 낮음. 순수 헬퍼+기존 경로. auth-server 한 줄 배선(도메인 밖). 0x0426 기존 라이브검증됨(MEMORY).

---

## 7. 도메인: movement (0x0b01 전략 이동 — **최우선/라이브 언락**)

> in-world 조작의 마지막 블로커. **`logh7-loop-engineering` 표준 루프로 라이브검증 필수**.
> **대상**: `logh7-command-engine.mjs`, `logh7-world-state.mjs`, `logh7-login-session.mjs`, `logh7-login-protocol.mjs`, `logh7-galaxy-adjacency.mjs` + 테스트.
> **셀 스킴**: `destCell=row*100+col` (cell 2550=row25/col50 확인됨). `cellToColRow(cell)={col:cell%100, row:floor(cell/100)}`.

- [ ] **7.1 航続≥100 연료 게이트 (0x0b01 strategic move)** 🔴 라이브검증
  - **캐논룰+페이지**: 워프는 航続(연료) 소비, 실행에 航続≥100 필요. 비용 거리비례(§6.2). ワープ航行 CP40. 燃料補給 CP160 dur48–960. — p32, p68.
  - **서버설계**: world-state fleet에 fuel(default 100) 존재 → fuelCap 정렬(logistics 1000과 정합 ⚠️). `consumeFleetFuel(id, amount)`(0 floor). command-engine 0x0b01 분기(line 309-334)에 게이트: `if (fleet && fleet.fuel < 100) return {accept:false, reject:'insufficient-fuel', notifies:[]}`. 승인 시 거리비례 차감. `WARP_MIN_FUEL=100`. **fleet 미시드면 게이트 통과(관용, owner 0 패턴)**.
  - **커맨드코드**: 🔴 0x0b01, 0x0b07, 0x0b02.
  - **필요데이터**: fuel 초기값/캡: makeFleet=100 vs logistics fuelCap=1000 **⚠️ 정합 검증필요**. 거리당 소비계수 매뉴얼 무수치 → **잠정(셀거리×K, K=P3)**, **≥100 게이트만 P1 강제**.
  - **테스트**: ① fuel99→reject `insufficient-fuel` notifies빈 ② fuel100→accept, 차감(소비>0) ③ 미시드→통과(관용) ④ accept 시 0x0b07 차감 후 방출.
  - **리스크**: 🔴 라이브검증 필수(0x0b07). 소비계수 추측금지 → ≥100만 캐논, 소비량 P3 명시. fuel 시드값(100 vs 1000) 정합 의존.

- [ ] **7.2 워프 오차편차 (random adjacent space grid)** 🔴 라이브검증
  - **캐논룰+페이지**: 장거리 워프는 인접 임의 空間グリッ드로 빗나갈 수 있음. 편차 대상은 반드시 空間(빈) 그리드(星系/航行不能 제외). — p32.
  - **서버설계**: 승인 후 `applyWarpDeviation({fromCell, toCell, rng, passableCells, terrainBlocked})`→finalCell. distanceCells≥`LONG_WARP_CELLS`(P3)면 `deviationChance`(거리비례 P3)로 rng 판정→빗나가면 toCell 4/8-인접 중 navigable(passable ∈, terrain∈{1,3}) 셀 선택, 星系cell 제외. **RNG 주입식**(결정론). finalCell로 moveFleet+0x0b07. cellToColRow/colRowToCell 헬퍼.
  - **커맨드코드**: 🔴 0x0b01, 0x0b07.
  - **필요데이터**: navigable/space 마스크=galaxy-passable-cells.json(parsePassableCells)+星系cell 집합. 발동거리·확률 매뉴얼 무수치 **P3 ⚠️ 검증필요**. '空間 only'=P1.
  - **테스트**: ① 단거리→편차0% finalCell==toCell ② 장거리+당첨→인접 navigable space(星系/blocked 아님) ③ 장거리+미발생→toCell ④ 인접 없으면 편차안함(안전폴백) ⑤ finalCell이 0x0b07 반영.
  - **리스크**: 🔴 라이브검증 필수(0x0b07 위치). 거리·확률 추측금지 P3, 라이브 관찰 시 보정. RNG 미주입 시 비결정. '인접'(4 vs 8) 라이브검증 대상.

- [ ] **7.3 터레인 진입차단 서버검증 (0x0315→0x0b01 destCell gate)** 🔴 라이브검증
  - **캐논룰+페이지**: 그리드 3종(空間/星系/航行不能). プラズマ嵐/サルガッソ 통행불가. 0x0315 V=0x0313 인덱스, objectTable[V].byte1∈{1,3}만 항행가능(RE확정+p31). — p31.
  - **서버설계**: 현재 terrain 마스크는 클라 방출만, 서버 미검증(클라 FUN_004d6310 게이트만 → 위조/AI 우회 가능). world-state에 마스크 보관: `setNavigableMask(passableSet, plasmaSet)`+`isCellNavigable(cell)`. login-session 시드 시 galaxyPassableCells()/galaxyPlasmaCells()(두 로더 존재)를 주입. command-engine 0x0b01: `if (state.isCellNavigable && !state.isCellNavigable(dest)) return {accept:false, reject:'blocked-terrain', notifies:[]}`. **마스크 미설정이면 스킵(관용)**.
  - **커맨드코드**: 🔴 0x0315, 0x0313, 0x0b01.
  - **필요데이터**: galaxy-passable-cells.json(존재), galaxy-plasma-cells.json(존재). 航行不能=여집합. **plasma cells '검증필요'(추출-불확실, 라이브 라벨 확인)**.
  - **테스트**: ① non-navigable destCell→`blocked-terrain` ② plasma→`blocked-terrain` ③ navigable space→accept ④ 마스크 미설정→스킵(레거시) ⑤ 차단 시 0x0b07 없음(불변).
  - **리스크**: 🔴 라이브검증 필수 — **'0x0315 빈공간 수정이 0x0b01 언락 후보'가 핵심 미해결 블로커**. plasma 데이터 ⚠️ 검증필요. 클라가 애초에 차단셀 미전송 가능 → 서버검증은 위조/AI 방어용. 자연 0x0b01 도달 자체가 선행 미증명.

- [ ] **7.4 인접 게이트 워프 / 星系 staging 규칙** 🔴 라이브검증
  - **캐논룰+페이지**: 그리드간 이동=워프. 星系 진입은 먼저 인접 그리드로 워프해야(단일 장거리 직접 진입 불가). 이동 4계층: 그리드간=ワープ航行(艦長카드). — p32.
  - **서버설계**: galaxy-adjacency.mjs는 name-keyed(미배선). 권장 (a)셀-인접 직접판정+세포투영: world-state `systemCells:Set`(星系 점유 cell, setNavigableMask와 주입). 0x0b01: `if (systemCells.has(destCell)) { fromCell이 destCell 인접 아니면 reject 'must-stage-adjacent' }`. fromCell=getFleet(unitId).cell. neighbors8/distanceCells 헬퍼.
  - **커맨드코드**: 🔴 0x0b01, 0x0b07, 0x0313.
  - **필요데이터**: 星系 cell=buildStrategicGalaxyGrid가 systems(canonCol/canonRow)→cell 투영. galaxy-adjacency.json(존재). 모두 P1. fromCell 신뢰성=login-session home cell(line 810) **정합 확인필요**.
  - **테스트**: ① destCell=星系&fromCell 비인접→`must-stage-adjacent` ② 星系&8-인접→accept ③ 空間cell→인접규칙 미적용(편차만) ④ 미시드→스킵(관용) ⑤ neighbors8/cellToColRow 라운드트립(2550↔col50/row25).
  - **리스크**: 🔴 라이브검증 필수. fromCell 시드 정합 의존(login-session). '인접'이 셀-격자 8방인지 항로 엣지인지 라이브 확인(추측금지). 자연 0x0b01 미도달 선행 블로커.

- [ ] **7.5 0x0b07 authoritative 상태반영 릴레이 (apply moveFleet before broadcast)** 🔴 라이브검증
  - **캐논룰+페이지**: 모든 커맨드 서버측 권위적 처리. 移動=그리드간 워프; NotifyMovedGrid 0x0b07이 권위적 위치 브로드캐스트. — p10, p32.
  - **서버설계**: 현재 0x0b01 핸들러(line 324-333)는 ack+buildNotifyMovedGridInner만 하고 **state.moveFleet 미호출 → fleet.cell 미갱신(불일치)**. 수정: 승인+게이트통과 후 finalCell(편차본)로 `state.moveFleet(unitId, finalCell)` 호출 후 `buildNotifyMovedGridInner({units:[{unitId, cell:finalCell}]})`. **단일 권위경로: 게이트→연료차감→편차→moveFleet→0x0b07**. ack=mover self(0x17), 0x0b07=all(0x16).
  - **커맨드코드**: 🔴 0x0b01, 0x0b07.
  - **필요데이터**: 없음(기존 moveFleet/builder 재사용). finalCell은 §7.1~7.4 결과.
  - **테스트**: ① accept 시 getFleet(unitId).cell===finalCell(상태 갱신) ② 0x0b07 cell===finalCell===state cell ③ ack+notify 2패킷 순서/타깃 보존(line 213 회귀가드) ④ reject 시 moveFleet 미호출(불변).
  - **리스크**: 🔴 라이브검증 필수(0x0b07 클라 적용 FUN_004bee20→FUN_00517cd0). 기존 테스트(line 213)와 회귀 충돌 주의 — 편차 없는 경로는 기존 동작 유지. 자연 0x0b01 도달 전제(아직 미증명).

---

## 8. 도메인: content-verify (데이터 무결성 — **검증 선행 게이트**)

> 다른 도메인이 소비할 함선/배치/승무원 데이터의 무결성 게이트. **§8.4 CI 가드를 가장 먼저 구축**(다른 재OCR 산출물이 통과해야 할 게이트).
> **신규 도구**: `logh7_verify_ship_stats.py`, `logh7_alliance_ship_reocr.py`, `logh7_deployment_pairing.py`.
> **신규 콘텐츠**: `crew-efficiency.json`, `initial-deployment.json`, `auto-production.json`.
> **신규 서버**: `logh7-ship-verify.mjs`, `logh7-crew-efficiency.mjs`, `logh7-deployment-source.mjs` + 테스트 3종.

- [ ] **8.4 Ship-stats provenance/integrity CI 가드 (먼저 구축 — 키스톤)** ⚠️ 검증 게이트
  - **캐논룰+페이지**: ship-stats.json `_derivation.rule`: "모든 pool은 REAL 매뉴얼 수치 추적 또는 source null/OCR-corrupt 시 null. archetype invention/tier multiplier 금지". `_note.discriminator`: null pool은 _raw가 OCR-lost+definitionally 속성 보유 시에만 FILL, _raw '-'(canonical none)이면 LEFT NULL. '·'=no token(missing≠zero). — manual-canon §12.1, ship-stats.json _derivation/_note.
  - **서버설계**: `verifyShipStats(shipStatsJson)`→`{ok, violations[]}` 순수함수: (a) 모든 non-null pool이 non-null _raw.value OR _note.filled 정당화 (b) maxShield/defense는 _raw shield '-' 위치에서만 null(discriminator) (c) count===ships.length===63 (d) **Alliance 엔트리 numeric pool은 confidence≥med _raw 인용 OR _note.filled(§12.4 'cross-check before encoding' 게이트 머신 강제)**. 기존 static-info 테스트에 가드 배선 → 향후 ship-stats.json 손편집이 수치 invent 시 CI 실패.
  - **커맨드코드**: 0x030b.
  - **필요데이터**: 신규 콘텐츠 없음 — 기존 ship-stats.json + ship-stats-raw.json. (검증필요 데이터 없음; **이것이 다른 기능 출력을 게이트하는 검증기**.)
  - **테스트**: ① 현재 파일 .ok===true ② _raw 추적/_note.filled 없는 fabricated pool→violation ③ _raw '-'에 maxShield 수치→discriminator violation ④ Alliance med-confidence 없는 invented number→§12.4 게이트 violation ⑤ count 드리프트→violation.
  - **리스크**: **낮음** — 순수 in-repo 검증기, PDF/추출 의존 없음, 라이브 불요. **SAFE 키스톤 — 데이터 불변, 검증 규칙만 고정. 가장 먼저 구축**.

- [ ] **8.1 Alliance ship-stat 재OCR + cross-check 검증기 (§12.4)** ⚠️ 검증필요
  - **캐논룰+페이지**: §12.4(pp.90-99): "Alliance numeric tables가 linear stream으로 flatten — per-cell 매핑 NOT recoverable, as-seen 인용+flag(extraction-uncertain); 인코딩 전 ship-stats.json 교차검증". §12.1: 양 진영 동일 stat-column 스키마. 앵커: 標準戦艦787 armor 30/18/10 beam5600 speed22000; 打撃巡航艦794 3×missile no-beam; 駆逐艦796 6-pulse; 戦闘艇母艦796 100 Spartanian. — pp.79-80, pp.90-99.
  - **서버설계**: **DATA-VERIFICATION 절차**(소비처 0x030b 존재). (1) `logh7_alliance_ship_reocr.py`: Empire와 동일 spatial-clustering으로 pp.90-99 **per-column per-row 추출**(faction 컬럼 비interleave), `{value,raw,confidence,note}` cells. (2) `logh7_verify_ship_stats.py`: 모든 non-null pool이 non-null _raw.value 추적('rule' invariant), Alliance pool silent invention 없음 검증, 재OCR vs 현재 diff→mismatch 후보. (3) 확인 시 confidence none→low/med 승격+null fill, 충돌 시 기존 유지+note. **auto-overwrite 금지 → 리뷰 리포트(.omo/research/alliance-ship-verify.json)**.
  - **커맨드코드**: 0x030b.
  - **필요데이터**: ⚠️ **Alliance pp.90-99 cells**(ship-stats.json에 11/63 Alliance base, 전부 extraction-uncertain; variant Ⅱ-Ⅷ numeric row 없음). 소스 gin7manualsaved.pdf pp.90-99. **'·' vs '-' 구분 보존 필수**.
  - **테스트**: ① 모든 non-null pool이 _raw.value 추적 OR _note.filled('rule') ② Alliance maxShield/defense는 _raw '-' 위치에서만 null ③ confidence:'none' _raw 인용 시 _note.filled 없으면 non-zero exit ④ **회귀 픽스처: known-good Empire 페이지(p82 駆逐艦 Z82 speed=30000) 재OCR가 기존값 재현(Alliance 신뢰 전 방법 검증)**.
  - **리스크**: 추출깨짐+라이브 불요(0x030b는 static master, 수치 오류는 렌더 OK/플레이 wrong). **의존: gin7manualsaved.pdf + `logh7-extract`**. Alliance variant 수치 영구 unrecoverable 가능 → Empire-same-class interpolation 폴백. **재OCR을 Empire-페이지 회귀 게이트 없이 신뢰하면 silent wrong balance HIGH 리스크**.

- [ ] **8.2 Crew-efficiency(乗員効率) 데이터 + 보충 승무원 계산 (§8.5)** ⚠️ 검증필요
  - **캐논룰+페이지**: §8.5(p44-45): "승무원은 함선과 함께 자동보충, 각 클래스 乗員効率로 계산". 보충은 1 ship-type/실행, 소스 동일 클래스; warehouse crew 0→unmanned→決定 disabled; 商船 crew 불요. §11.6/§8.4: 클래스별 required crew count. §14: "乗員効率·required-crew counts — referenced but numbers not in these pages". — p44-45.
  - **서버설계**: Grep 확인: 乗員効率/crewEfficiency 매치 0건. 0x030b 빌더는 `crew`(必要乗組員, 38/62 non-null) 기록하나 乗員効率 비율·보충계산 없음. (1) `crew-efficiency.json`: `{shipClassKey, requiredCrew, crewEfficiency, merchantExempt, source, confidence}` — crewEfficiency는 페이지에 없음 → **value:null+confidence:none**, merchantExempt는 shipClass에서 계산. (2) `logh7-crew-efficiency.mjs`: `loadCrewEfficiency()`, `computeReplenishCrew({shipClassKey, shipsAdded})`, `isMerchant()`, `canConfirmReplenish({warehouseCrew, shipsAdded, shipClassKey})`(warehouseCrew==0 && !merchant→false, 決定-disabled 룰). 서버내부 logistics(no wire), 미래 補充(CP160) 핸들러 소비.
  - **커맨드코드**: 없음.
  - **필요데이터**: ⚠️ **乗員効率 수치 매뉴얼 페이지 부재(§14 명시)**. 必要乗組員은 ship-stats.json _raw.crew 부분 존재(38/62). **pp.79-99 必要乗組員/出力 컬럼 재OCR, 乗員効率 컬럼/각주 탐색 OR VII 미존재 확인(IV-EX/V carryover일 수 — E:/DGGL IV-EX 에디터 db 교차)**. 전부 confidence:none 유지.
  - **테스트**: ① isMerchant: 商船/transport→true, battleship→false ② canConfirmReplenish({warehouseCrew:0, merchant:false})===false, merchant→true ③ computeReplenishCrew는 crewEfficiency null이면 requiredCrew 폴백+결정론 ④ 모든 클래스 1:1 커버리지, null crewEfficiency는 confidence:none+note.
  - **리스크**: 추출-불확실 — 乗員効율 수치 genuinely absent, 재OCR 필요 OR VII-미구현 HIGH. 補充 핸들러(§14) 미구축이라 **데이터+헬퍼 groundwork**. 비대면 → 라이브 불요. **null+confidence:none 게이팅(핸들러는 null에서 계산 거부)으로 wrong balance 완화**.

- [ ] **8.3 초기배치+자동생산 페어링 구조화 (pp.75-78 미검증, §13.3)** ⚠️ 검증필요
  - **캐논룰+페이지**: §13.3(pp.75-78): 部隊初期配置+自動生産品目이 2단(帝国軍|同盟軍)을 extractor가 flatten/interleave. "VALUES 신뢰, PAIRING(어느 행성↔어느 함선/병력, 어느 진영) NOT". 확정: crew 컬럼 일률 艦隊乗組員; 병종∈{軽装陸戦兵,装甲擲弾兵,装甲兵}; 다수 행성 軽装陸戦兵-only(garrison); fortress/capital(이젤론/오딘/하이네센) 최다생산. §8.1(p41): 자동생산 연속·토글불가·세금 미영향. "pp.75-78 페어링을 byte-exact canon 취급 금지". — pp.75-78, §13.3+§8.1.
  - **서버설계**: Grep 확인: 유일 구조화는 `unit-types-deployments.json deployments[]`(free-text line-citation), content-db deployments 테이블 ingest되나 구조화 안 됨+생산 tick 미소비. (1) `logh7_deployment_pairing.py`: pp.75-78 **TRUE 2-column 읽기**(帝国軍 left/同盟軍 right, x-coord split, logh7-extract Y-flip 방식)→planet→`{shipUnits, groundUnits}`. (2) `initial-deployment.json`+`auto-production.json`: `{faction, system_ja, planet_ja, items:[{unitType, count, kind}], confidence, source}`. (3) `logh7-deployment-source.mjs`: `loadInitialDeployment()`/`loadAutoProduction()`+검증(system_ja/planet_ja가 galaxy 해소, unitType이 catalog 해소). **생산 tick 소비자 OUT OF SCOPE(downstream economy)** — 본 기능은 VERIFIED 구조화 데이터+로더만.
  - **커맨드코드**: 없음.
  - **필요데이터**: ⚠️ **페어링 현 flatten OCR에서 recoverable 아님 → pp.75-78 2-column 재OCR 필수**. galaxy.json(80성계/281행성)+unit-types-deployments.json 교차. 확정 invariant: crew 항상 艦隊乗組員; 병종⊆{軽装陸戦兵,装甲擲弾兵,装甲兵}; capital/fortress 최다. confidence 태그(2-column 명확 시만 high). **2-column 확인 없이 count canon 인코딩 금지**.
  - **테스트**: ① 모든 system_ja/planet_ja가 galaxy.json 해소(OCR typo orphan 없음, ボルゲーゼ vs ボルケーゼ) ② unitType이 catalog 해소 ③ auto-production crew 항상 艦隊乗組員, 병종⊆3종(§13.3 invariant) ④ capital/fortress(オーディン/ハイネセン/イゼルローン) present+최다 flag, garrison은 軽装陸戦兵-only ⑤ confidence:'high'는 2-column 재OCR sourced에만(provenance 게이트).
  - **리스크**: 추출깨짐+미검증 — **HIGHEST 리스크**: 현 OCR 페어링 known-wrong, typo orphan 이미 가시(ボルゲーゼ/ボルケーゼ, サンア・アナ, ロフォーデン/ロフォーテン, ガイエスブルク/ガイエスブルグ). **의존: 2-column 재OCR(`logh7-extract`+PDF)**. 소비자(자동생산 tick) 미구축(economy 未実装) → 라이브 불요. **2-column 확인 없이 인코딩 시 전 시작 갤럭시가 wrong forces 스폰 → strict confidence 게이팅+galaxy.json name-resolution 테스트가 가드레일**. Empire가 Alliance보다 신뢰성 높음(동일 flattening §12.4).

---

## 9. 통합 의존성 그래프 (요약)

```
[게임클록 24×]  ← economy §1.6 / operations §2.7 가 동일 인프라로 단일 구현
   ├─→ economy 30일틱(§1.6) → 자동생산(§1.7)
   ├─→ operations 작전 30일평가(§2.6), 발령 활성화(§2.5)
   ├─→ personnel 월간/30일 진급·연령드리프트(§4.5, §4.6)
   └─→ intel 監視/破壊 타이머(§5.7)

[content-verify §8.4 CI 가드]  ← 가장 먼저. 아래 재OCR 산출물의 게이트
   ├─→ §8.1 Alliance 함선스탯 → ai 생산(§6.6) 함선 스탯
   ├─→ §8.3 배치/생산 페어링 → economy 자동생산(§1.7), ai 조병공창(§6.6)
   └─→ §8.2 乗員효율 → (미래 補充 핸들러)

[movement 0x0b01]  ← 독립, 최우선 라이브 언락. 단 fleet.cell/터레인 마스크 시드 정합

[economy 政府支持率/影響力]
   ├─→ personnel law4 비교자(§4.4) influence 입력 (§1.4 ↔ §4.9)
   ├─→ personnel 봉토 수입(§4.2)
   └─→ intel 煽動工作(§5.7) 政府支持率 (hook)

[personnel 統率/평가포인트/직책카드]
   ├─→ combat 艦隊最대士気·降伏勧告(§3.3, §3.4)
   ├─→ operations CP풀·XP(§2.2, §2.3), 발령 부서분리(§2.5)
   └─→ intel 체포 매트릭스·査閲(§5.5, §5.6)

[ai]  ← morale(§6.2 ↔ combat §3.3), 작전(§6.4 ↔ operations §2.4), 색적/생산(§6.5, §6.6)
[intel-coup]  ← economy·personnel·승패평가 다중 의존 (최후순위)
```
