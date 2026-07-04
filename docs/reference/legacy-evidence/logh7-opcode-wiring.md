# LOGH VII opcode 배선 권고 — 사교·정치·첩보·쿠데타·항복·공중전

> 작성 근거: 기능별 opcode RE 스윕 결과(클라 디컴파일 인덱스 `.omo/ghidra/export/G7MTClient` + `content/extracted/*` 카탈로그 + 서버 모듈 대조) 종합.
> **원칙**: 증거 없는 opcode는 "미확정"으로만 표기한다. 어떤 항목도 라이브 0x09xx/0x0fxx 캡처(`logh7-live`) 전까지 클라-대면 동작을 단정하지 않는다.
>
> 스윕 시점의 코드 사실(검증 완료):
> - `command-engine.routeInternalAffairs`는 **personnel(0x0704–0x0709) / strategy(0x0900–0x0906) / logistics / social(isSocialCommandCode) / battle-ops(BATTLE_OPS_CODE_SET) / account** 6개 도메인만 분기한다.
> - `logh7-economy.mjs`는 `auth-server`가 경제틱·시드용으로만 import → `adjustApproval`/`adjustSecurity`는 **어떤 커맨드 핸들러도 호출하지 않는다**(미배선).
> - `logh7-relations.mjs` / `logh7-intel.mjs` / `logh7-surrender.mjs` / `logh7-air-combat.mjs`는 `src/server` 어디에서도 import되지 않는 **데드 엔진 코드**(테스트만 import).
> - `processSocial`은 `0x0f13`(CommandOrderSuggestMail) / `0x0f14`(CommandReplyOrderSuggestMail)을 파싱·라우팅하지만 **coup sub-action 분기는 없다**.

---

## (a) 요약 표 — 기능 / 커맨드 / opcode(또는 sub-action) / 현재 라우팅 / confidence

| 기능 | 커맨드 | opcode / sub-action | 현재 라우팅 | confidence |
|---|---|---|---|---|
| 사교 → 影響力/友好度 | 야회·수렵·회담·담화·연설·회견 | **와이어 opcode 부재**(constmsg UI 라벨만, 860–864/937) | unrouted (코드 없음) | high (=opcode 없음 확정) |
| 정치 → 政府支持率 | 演説 | `0x0900` MakePlan sub-action (planId 판별) | strategy(processStrategy) — 큐잉만, economy 미호출 | medium |
| 정치 → 支持率↓ | 煽動工作 | `0x0900` MakePlan sub-action (planId) | strategy — economy 미호출 | medium |
| 정치 → 治安維持率 | 警戒出動 | `0x0900` MakePlan sub-action (planId) | strategy — economy 미호출 | medium |
| 정치 → 治安↑/支持↓ | 武力鎮圧 | `0x0900` MakePlan sub-action (planId) | strategy — economy 미호출 | medium |
| 정치 → 支持率↑ | 分列行進 | `0x0900` MakePlan sub-action (planId) | strategy — economy 미호출 | medium |
| 첩보 → intel.mjs | 潜入·情報·破壊·煽動·侵入(+脱出·帰還) | **미확정**(catalog 142–148; C→S opcode 미발견) | unrouted | high (=opcode 미확정 확정) |
| 쿠데타 → coup 게이트 | 叛意/謀議/説得/参加(모집·설득) | `0x0f13` CommandOrderSuggestMail sub-action | social(processSocial) — coup 분기 미구현 | medium |
| 쿠데타 → coup 게이트 | 反乱 회신(참가/반의) | `0x0f14` CommandReplyOrderSuggestMail sub-action | social — coup 분기 미구현 | medium |
| 쿠데타 표시상태 | coup_conduct | `0x0323` 캐릭터레코드 필드(@0x4c, S→C) | info-records(buildInformationCharacterRecordInner) — 0 하드코딩 | high |
| 쿠데타 표시상태 | coup | `0x0323` 캐릭터레코드 필드(@0x50, S→C) | info-records — 0 하드코딩 | high |
| 반란/충성 표시상태 | rebellion | `0x0325` 유닛레코드 필드(@0x21, S→C) | info-records(personnel.mjs:491) | high |
| 쿠데타 | 査閲(사열/검열) | **미확정**(Command명 부재) | unrouted | low |
| 공중전 진입 | AirBattle(발진) | `0x040e` CommandAirBattle (C→S) | **battle-ops(processBattleOps) 배선 완료** | high |
| 공중전 결과 | NotifyAirBattle | `0x0428` (S→C) | **battle-ops(buildNotifyAirBattleInner) 배선 완료** | high |
| 공중전 sub | 邀撃(intercept) | `0x040e` sub-action | unrouted (air-combat.computeAirCombat 미연결) | medium |
| 공중전 sub | 對艦(anti-ship) | `0x040e` sub-action | unrouted (air-combat 미연결) | medium |
| 공중전 sub | 着艦(landing) | `0x040e` sub-action | unrouted (서버 엔진 없음) | medium |
| 항복 | 降伏勧告 | **미확정**(클라에 항복 opcode 부재) | unrouted (surrender.mjs 미연결) | high (=opcode 없음 확정) |

---

## (b) 배선 가능 (high confidence) — `command-engine` 연결 구체 권고

high-confidence 항목은 두 부류다: ① opcode·라우팅이 이미 확정되어 **엔진만 연결하면 되는 것**, ② opcode 부재가 확정되어 **별도 경로로 가야 함이 명확한 것**. 클라-대면 단정은 ① 중 라이브로 증명한 것에만 허용한다.

### B-1. 공중전 sub-action 엔진 연결 (0x040e → battle-ops 내부) — **가장 확실한 배선 후보**

`0x040e CommandAirBattle`은 `BATTLE_OPS_CODE_SET`에 이미 들어 있고 `processBattleOps`로 라우팅된다(라우팅 확정). 빠진 것은 핸들러가 `result:1` 플랫 emit이라 **邀撃/對艦/着艦 sub-action 분기와 캐논 규칙엔진(`logh7-air-combat.mjs`)이 미연결**이라는 점이다.

- **연결 지점**: `logh7-battle-ops.mjs`의 `0x040e` case(L891 부근), `command-engine`은 **수정 불필요**(이미 도메인 라우팅됨).
- **권고**:
  1. `logh7-battle-ops.mjs`에서 `import { computeAirCombat, canLaunchFighters, FIGHTER_SUPPLY_COST } from './logh7-air-combat.mjs'` 추가.
  2. `0x040e` 핸들러에서 `parseInboundIdList`(FUN_004be8c0, body @0x98) 결과 + sub-action 판별자로 mode 결정 → `canLaunchFighters(物資)` 게이트 → `computeAirCombat(launcher, target, { mode })` 호출 → 결과(damage/slowFactor/fightersAfter)를 `buildNotifyAirBattleInner(0x0428)` body에 채워 emit.
- **⚠️ 라이브 게이트(필수)**: sub-action 판별자(邀撃/對艦/着艦)가 **0x040e body 내부의 어느 필드인지 미확정**(현재 medium). `0x040e` 핸들러를 sub-action으로 쪼개기 전에 **라이브 0x040e 캡처로 body 판별자 오프셋을 confirm**해야 한다. confirm 전에는 mode를 단일(`anti-ship`)로만 연결하고 분기는 보류한다.

### B-2. coup_conduct / coup / rebellion 표시상태 시드 (0x0323 / 0x0325) — **순수 S→C, 즉시 배선 가능**

쿠데타·반란은 C→S 커맨드가 아니라 **캐릭터/유닛 정보레코드의 표시 상태필드**다(RE 확정, high). 현재 서버가 0을 하드코딩한다.

- **연결 지점**: `logh7-personnel.mjs`
  - `buildInformationCharacterRecordInner`(L535 부근): body `@0x4c = coup_conduct`, `@0x50 = coup` — 현재 0 하드코딩 → `logh7-intel.mjs`의 `applyCoupLoyalty`로 누적한 캐릭터별 叛乱忠誠度를 시드.
  - `ResponseInformationUnit` builder(L491): body `@0x21 = rebellion` — 유닛 충성/반란 상태 시드.
- **권고**: command-engine 라우팅 변경 없음. personnel state에 coup-loyalty 맵을 두고 0x0323/0x0325 빌드 시 주입. **S→C 표시이므로 라이브 단정 불필요**(빌더 오프셋은 `logh7-wire`로 byte-verify).

### B-3. opcode 부재가 확정된 기능 — 신규 서버 권위 경로로 (와이어 신설 금지)

다음은 **원작 클라가 네트워크 메시지를 보내지 않음이 확정**된 것들(서버측 내정/판정으로만 처리). 기존 패밀리에 끼워넣지 말고 별도 처리한다.

- **사교 6종(야회·수렵·회담·담화·연설·회견)**: 클라 전체 Command 클래스 목록·`FUN_004b8b00` opcode 셋에 매칭 없음(high). `logh7-relations.mjs`(`adjustInfluence`/`adjustFriendliness`)는 **클라 트리거 없는 서버 내정 모듈**로 유지하거나, 굳이 클라에서 발신하려면 **커스텀 opcode 신설**이 필요(원작 미배선이므로 우리 규약). 라이브 대면 단정 금지.
- **降伏勧告**: 전 패밀리(203 카탈로그) 스캔 결과 항복 C→S opcode 없음(high). `logh7-surrender.mjs`는 **서버 전투엔진 내부 판정**(예: 전투 해소 루프에서 統率·사기로 `resolveSurrender` 호출)으로만 쓰고, 와이어 커맨드는 신설하지 않는다.

---

## (c) 추가 RE 필요 (low / medium) — 무엇이 불확실한가

### C-1. 정치 5종(演説/煽動/警戒/鎮圧/行進) ↔ planId 매핑 (medium)

- **확정**: 모두 독립 opcode 아님 → `0x0900 CommandMakePlan`의 sub-action, **planId(MakePlan body dword2 = `parseInboundMakePlan().planId`)가 판별자**. 라우팅(strategy)도 확정.
- **불확실**: planId ↔ 정치액션(연설=支持↑ / 선동=支持↓ / 경계=治安 / 진압=治安↑·支持↓ / 행진=支持↑)의 **정확한 수치 매핑**. 클라가 String DB 인덱스를 런타임에 보내므로 코드 상수로 못 박을 수 없다.
- **필요 작업**: 라이브 `0x0900` 캡처(`logh7-live`)로 각 정치 커맨드 선택 시 planId 실값 수집 → planId→effect 테이블 작성. confirm 전까지 effect 매핑은 **P3 추정(미확정)**으로만 두고 economy 호출을 활성화하지 않는다.

### C-2. 첩보 5종(+脱出·帰還) C→S opcode 전체 (high-부재 / 배선 medium)

- **확정**: catalog id 142–148에 캐논 텍스트 존재(매뉴얼·schema). `FUN_004b8b00` dispatch-size 테이블에 0x07xx=인사뿐, **0x08xx/0x0dxx 諜報 패밀리 자체가 없음**. `protocol-master` C→S 표에 諜報 행 없음.
- **불확실**: 첩보가 (가) 별도 opcode인데 우리가 못 찾은 것인지, (나) `0x0900` plan 류로 들어가는지, (다) 원작도 서버 내정 처리였는지가 **미판별**.
- **필요 작업**: 라이브 캡처로 첩보 커맨드 발신 시 실제 나가는 opcode 관측이 **유일한 확정 경로**. 관측 전 `logh7-intel.mjs` 와이어 배선 불가(엔진은 표시상태 시드 B-2로만 우선 활용).

### C-3. 쿠데타 모집·설득·참가 ↔ order-mail sub-action (medium)

- **추정**: 叛意/謀議/説得/参加는 독립 opcode 부재 → `0x0f13`/`0x0f14` order-mail payload의 sub-action으로 추정(social 라우팅은 확정, coup 분기만 미구현).
- **불확실**: order-mail body 안에서 "쿠데타 모의/참가"를 가리키는 **order-type 판별 필드 오프셋 미확정**. 일반 명령제안 메일과 동일 구조에서 어떻게 구분되는지 미상.
- **필요 작업**: 라이브 `0x0f13`/`0x0f14` 캡처로 order-type 필드 위치 confirm 후 `processSocial`에 coup 분기 추가.

### C-4. 査閲(사열) (low)

- Command명 전수목록(81종)·battleCommands·constmsg 3199 어디에도 매칭 없음. `RequestInformation*`(조회) 류로 대체되었을 가능성. **추가 RE 가치 낮음**(별도 액션이 아닐 공산).

---

## (d) sub-action 디스패치 — 기존 도메인 프로세서 내부 처리 명시

opcode가 sub-action인 항목은 **새 command-engine 분기를 만들지 않는다**. 이미 해당 패밀리로 라우팅되므로, 처리는 **도메인 프로세서 내부 sub-action 분기**로 한다.

| sub-action | 모체 opcode | 처리 위치(도메인 프로세서 내부) | 호출할 엔진 |
|---|---|---|---|
| 演説/煽動/警戒/鎮圧/行進 | `0x0900` | `processStrategy`의 `COMMAND_MAKE_PLAN_CODE` case (strategy.mjs L409) — planId 분기 추가 | `economy.adjustApproval`/`adjustSecurity` (라이브 planId confirm 후) |
| 邀撃/對艦/着艦 | `0x040e` | `processBattleOps`의 0x040e case (battle-ops.mjs L891) — body 판별자 분기 추가 | `air-combat.computeAirCombat`/`canLaunchFighters` (라이브 판별자 confirm 후) |
| 쿠데타 모집·설득·참가 | `0x0f13`/`0x0f14` | `processSocial`의 order-mail case (social.mjs L682) — order-type 분기 추가 | `intel.applyCoupLoyalty`/`canStartCoup` (라이브 order-type confirm 후) |
| coup_conduct/coup/rebellion | `0x0323`/`0x0325` | (sub-action 아님 — S→C 레코드 필드) `personnel.mjs` 빌더 L491/L535 | `intel.applyCoupLoyalty` 누적값 시드 |

→ 따라서 `routeInternalAffairs`에 **신규 패밀리 추가가 필요한 것은 없다**. 정치·공중전·쿠데타모집은 전부 기존 strategy/battle-ops/social 프로세서 안에서 sub-action으로 처리하고, 라우팅 변경 없이 도메인 엔진을 호출하면 된다. `relations`/`surrender`/(첩보 와이어)는 클라 opcode가 부재/미확정이므로 와이어 배선 대신 서버 내부 판정 또는 추가 RE 대기다.

---

## ⚠️ 정정 (2026-06-19, AU-3 배선 중 발견) — coup 오프셋 불일치

위 B-2/(d)의 `coup_conduct @0x4c, coup @0x50`(0x0323 char record) 매핑은 **권위 와이어 문서
`docs/logh7-info-records-wire.md`와 4바이트 어긋난다**. 권위 문서·실제 빌더 기준:
- `coup_conduct @0x48`, `coup @0x4c` (RE 스윕이 4B 밀려 적었음).
- 그리고 0x0356 stream에서 `@0x50`은 **`pcp`(統率)** 자리라, "coup@0x50" 매핑은 pcp와 충돌한다.

→ AU-3 배선은 **모호하지 않은 `coup_conduct`만** intel 누적값으로 시드하고, **pcp를 coup로 remap하지 않았다**
(byte-exact 보존). coup/rebellion 필드의 정확한 오프셋·실값 시드는 **0x0323/0x0325 빌더(login-protocol.mjs)에서
권위 와이어 문서 오프셋으로** + 라이브 검증 후 확정. 본 문서의 coup 오프셋 수치는 신뢰하지 말 것.
