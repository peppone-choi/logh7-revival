# LOGH VII — 행성(planet) 갭 + 성계 소속(ownership) 갭 통합 진단 (2026-06-29)

읽기전용 합성 문서. 4개 발견(planet-client / planet-server / ownership-client / ownership-server)을
적대적 검증 결과와 교차해, **클라 소비처(decompile 근거) ↔ 서버 송신 상태 ↔ 콘텐츠 가용성**을
side-by-side로 정리한다. 검증자가 refuted/partial 한 항목은 신뢰도를 낮춰 반영했고, **검증자 자신이
틀린 부분(기본 게이트 상태)도 본 세션에서 직접 재확인해 정정**했다.

근거 권위:
- 클라 RE: `RE/.omo/ghidra/export/G7MTClient/functions.jsonl` (redex). 본 세션에서 `RE/tools/logh7_redex.py func <addr>`로 직접 재확인.
- 서버: `server/src/server/*.mjs` (직접 Read, file:line).
- 콘텐츠: `server/content/galaxy.json`, `server/content/planet-economy.json` (node로 직접 집계).
- 라이브 G7MTClient.exe 화면 증거는 본 합성에 **없음**(읽기전용 작업, 지시상 ui_explorer 미실행). 모든 "라이브"는 미검증으로 표기.

---

## 0. 검증자 적발 정정 (먼저 — 신뢰도 보정의 근거)

### 0.1 maker 측 환각/오기 (신뢰도 하향, 본문에서 제거됨)
| 항목 | maker 주장 | 실제(재확인) | 처리 |
|---|---|---|---|
| 파일 출처 | `RE/scratchpad/dispatcher.txt:405-435`, `.omo/f_4ba2b0.txt` 등 라인넘버 인용 | **그런 파일/디렉터리 없음** (`find` 결과 0). 유일 실소스 = `functions.jsonl` | 라인넘버 출처 전부 삭제, redex 주소만 인용 |
| base 레코드 +0x04 | "+4 = type(2/3)" | **owner/faction 바이트**. 패널 FUN_0057aa90 L178/L184: `*(char*)(local_10+4)=='\x02'→동맹 / =='\x03'→제국` | "type" 폐기, owner로 정정 |
| 좌표 출처 +0x10 | "base 레코드 +0x10 = coord(%100,/100)" | 패널이 좌표를 읽는 곳은 **그리드 셀**(local_18). FUN_0057aa90 L94 `local_18 = iVar6*0x250 + 0x2eb800`, L176 `(local_18+0x10)%100 , /100`. base 레코드의 +0x10은 정적 파서(FUN_004154c0 L111)가 쓰는 별개 dword | 좌표=그리드셀(stride 0x250)로 정정 |
| 클래스/타입 | "+0x175 = status(0-3)" | **class/type 0-3** (패널 L101 `switch(*(undefined1*)(iVar5+0x175))`). status가 아님 | class/type으로 정정 |

### 0.2 **검증자 자신의 오류** (본 세션 재확인으로 정정)
검증자는 "전략맵 경로 기본 OFF(`LOGH_STRAT_GALAXY`), 0x031f 기본 ON, 따라서 count-byte==0은 라이브
원인 아님"이라고 단정했다. 이는 **`process.env` 원시값만 보고 플레이어블 프리셋을 누락**한 결론이다.

`server/src/server/logh7-config.mjs:43-80` `PLAYABLE_ENV_DEFAULTS`는 zero-config 부팅(`applyEnvDefaults`,
L88-93)에서 다음을 **모두 ON**으로 채운다(env 미설정 키만):
```
LOGH_PLANET_BASE_RECORDS: '1'   (L60)
LOGH_STRAT_GALAXY:        '1'   (L62)
LOGH_STRAT_GRID:          '1'   (L63)
LOGH_STRAT_GRID_EARLY:    '1'   (L64)
LOGH_STRAT_TERRAIN/FLEET: '1'   (L65-66)
```
`LOGH_BASE_ECONOMY`은 `!== '0'` (기본 ON, L223). 게이트 함수들은 `process.env`를 읽지만 그 env는
`applyEnvDefaults`가 이미 채운 상태다. **따라서 실제 플레이어블 세션에서는 행성 base 레코드도, 성계
소속 owner 바이트도, 전략 갤럭시 마커도 전부 emit 된다.** 검증자의 "기본 OFF" 전제는 틀렸다 → 신뢰도 하향.

남는 정정: count-byte==0 실패모드 가능성은 **낮다**(서버가 매 세션 count>=1로 push)는 검증자 결론
자체는 옳다 — 단 근거를 "전략맵 OFF"가 아니라 "행성/owner 경로가 기본 ON으로 push됨"으로 교체한다.

---

## 1. 핵심 개념 (RE-확정)

LOGH VII에 별도의 "행성(planet)" 엔티티는 없다. **성계(star system) = 그리드 셀**, 그 위의
행성/요새/기지 = **BASE 레코드**(0x031f / 0x031d). redex 이름검색 `Planet|Star|World` = 0건.

- 그리드 셀 배열: `base+0x2eb800`, 350칸, stride **0x250**, id 배열 `base+0x2eb288`, 활성 플래그 cell+0.
- 라이브 base 배열: `base+0x3facf4` = count 바이트, 레코드 `base+0x3facf8`부터 stride **0x180**, 최대 4.
- node→cell 역참조: `node+0x8bc` (FUN_004c32a0 L146 `*(ushort*)(iVar9+0x8bc)*0x250 + 0x2eb800`).

---

## 2. 행성(planet) 갭 — side-by-side

| 레이어 | 상태 | 근거 |
|---|---|---|
| **클라 소비처** | 0x031f 라이브 base 배열 파싱+렌더 경로 존재(P0). dispatcher case 799가 `param_3`→`base+0x3facf4`로 0x181 dword 복사. 패널 FUN_0057aa90이 count(`*(byte*)(base+0x3facf4)`)만큼 stride 0x180 스캔, id 매칭, class/type(+0x175), owner(+0x04) 읽음. 월드임포트 FUN_004c32a0가 노드 배치+cell 역참조. | redex: FUN_0057aa90 L75/L94/L101/L176/L178, FUN_004c32a0 L120/L123/L146/L167-169, 정적파서 FUN_004154c0(stride 0x180, id@+4) |
| **서버 송신** | **이미 emit 됨(기본 ON)**. `buildResponseInformationBaseInner`(codec/base-record.mjs:284)가 count + 최대4 × 0x180 stride 스트림 생성. 세션이 매 월드임포트에 push(logh7-login-session.mjs:1637). 행성/요새를 base 목록에 펼치는 `planetBaseSeeds`(L1440-1477)는 `LOGH_PLANET_BASE_RECORDS` 게이트(기본 ON, L60/L1422). | codec/base-record.mjs:239-295, login-session.mjs:1440-1540, 1620-1645 |
| **콘텐츠** | **충분**. galaxy.json 80성계 중 77성계가 planets 보유(총 281 행성), 요새 6. 단 planet 객체는 `{name, orbit}`만(경제/방어 스칼라 없음). 경제는 planet-economy.json(3 시스템만, 사실상 빈 팩). | node 집계: totalPlanets=281, systemsWithPlanets=77, planet keys=[name,orbit] |

**행성 갭 근본원인(정정 후):** "행성이 0으로 보인다"는 **구조적 게이트(count byte @0x3facf4==0 / id 부재
/ cell 활성 플래그 0 / institution·warehouse count 0)**가 4개 분리 실패모드로 존재하지만, **서버가 기본
ON으로 count>=1 의 base 레코드를 push** 하므로 count==0은 라이브 원인일 가능성이 낮다. 실질 갭은
**(a) 행성 base 레코드의 0x180 필드 스칼라가 거의 전부 0(P3, 값 미주입)** — 이름/소유/타입만 채워지고
인구·식료·방어·보급은 비어 패널이 "행성은 뜨되 내용이 비어 보임"이 될 수 있음, **(b) static(+4) vs
live(+0) id 헤더의 4바이트 델타 미검증**(아래 §4), **(c) 어느 실패모드가 실제 라이브 증상인지 미확인**
(라이브 캡처 없음). 즉 "행성 미표시"보다 "행성 스칼라 공백 + 라이브 미검증"이 정직한 갭 기술이다.

---

## 3. 성계 소속(ownership) 갭 — side-by-side

핵심: **소속(진영)이 와이어로 나가는 유일·확정 채널은 0x031f base 레코드 elem+0x04 (동맹=2 / 제국=3)
뿐이다.** 전략맵 마커(0x0313/0x0315)에는 소속 전용 바이트가 없다.

| 레이어 | 상태 | 근거 |
|---|---|---|
| **클라 — base 패널** | elem+0x04 직접 읽어 진영명 분기. ==0x02→동맹(strId 0x2d), ==0x03→제국(strId 0x2e). 0x02/0x03 외 값은 분기 미진입(진영명 미표시). | redex FUN_0057aa90 L178-186 (faction strId는 FUN_00522010(0x4e,…)로 해석) |
| **클라 — 전략맵 마커** | **소속 바이트 미참조**. 0x0313 3바이트 레코드 = [byte0=성계명 라벨 subId, byte1=class(3=클릭마커), byte2=sprite/color variant]. 마커 렌더 FUN_004d3a40(L25-27: byte1==3 게이트+byte0만), FUN_004d68d0(byte1만)는 진영 바이트를 읽지 않음. | redex FUN_004d3a40, FUN_004d68d0 |
| **클라 — 친/적 색** | base owner와 **무관**. FUN_004ef0d0(L113-118)은 **char-table** 엔트리(로컬 플레이어 vs 유닛 사령관, stride 0x9ec, commander id 키)의 +0xa/+0xb를 비교해 0x800(아군)/0x1000(적)을 가른다. FUN_004c32a0이 base owner(elem+0x04/05)를 tactics-field 엔티티 +0xa/+0xb로 복사하긴 하나, **그 엔티티 +0xa/+0xb를 색으로 비교하는 함수는 0건**(grep). 즉 "elem+0x04→엔티티+0xa/+0xb→성계 dot 색"은 **RE로 미성립**(maker 요약 (3) 환각, 검증자 REFUTED 반영). 성계/유닛 마커 색의 실 레버는 **사령관 0x0323 power@+0x04 → char-table**. | redex FUN_004ef0d0 L113-118, FUN_004c32a0 L123-169; 검증자 grep 0건 |
| **서버 송신** | **owner 바이트 emit 됨(기본 ON)**. `baseOwnerByteFromFaction`(login-session.mjs:1038-1042) empire→3/alliance→2/else→1 → b04(L1499) → field04(codec L241, elem+0x04). 전략맵 마커 빌더 `buildStaticInformationGridTypeInner`(login-protocol.mjs:653-674)는 owner 슬롯 없음 — faction은 variant(byte2)에 **최종 폴백**으로만 새며, 80/80 성계에 spectralClass가 있어 분광형이 항상 우선 → variant에 faction 사실상 미반영(login-protocol.mjs:973-985). | login-session.mjs:1030-1043/1434/1445/1499, codec/base-record.mjs:241, login-protocol.mjs:653-674/973-985 |
| **콘텐츠** | **충분**. galaxy.json 80/80 성계에 faction 설정(empire 39 / alliance 40 / neutral 1, 누락 0). | node 집계 |

**소속 갭 근본원인:** 콘텐츠(faction)와 base-패널 채널(elem+0x04)은 **이미 연결**돼 있다. 진짜 갭은
**전략 성계 마커(전략맵 dot) 자체의 소속/색이 와이어로 표현 불가**라는 점 — 0x0313/0x0315 스키마에
owner 필드가 없고, 클라가 dot 색을 진영으로 칠하는 경로가 RE로 확인되지 않았다(색은 사령관 char-table
경로). 따라서 "전략맵에서 성계가 진영색으로 구분된다"는 **현재 미성립이며, 만들려면 RE 선행 필요**
(byte2 variant를 클라가 진영색으로 해석하는지 미확정 = P3). 중립(페잔) sentinel 값(elem+0x04=1)이
패널에서 진영명 미표시로만 동작하는지, 라이브 색 오인(중립이 적색)인지도 미검증(P2).

---

## 4. 미해결 / 불확실 (정직 기술)

1. **static(+4) vs live(+0) id 헤더 4바이트 델타** — 정적파서 FUN_004154c0는 id를 `iVar8*0x180+4`(L71)에
   쓰지만, 라이브 소비자(FUN_0057aa90, FUN_004c32a0)는 elem 오프셋 0에서 id를 매칭한다. 서버 코덱은
   **라이브 레이아웃(id@0, owner@4)을 따름**(codec L240-241) → emit은 정합. 그러나 정적-카탈로그 레코드의
   4바이트 헤더 차이는 **바이트단위 라이브 캡처로 미검증**. (maker가 정직하게 갭으로 플래그, 환각 아님.)
2. **0x180 레코드 미해독 필드** — +0x08/+0x09/+0x0c/+0x18/+0x1c/+0x118~+0x128 등 스칼라 의미 미확정.
   서버는 전부 0(P3, 값 미주입)으로 emit. 행성 패널 "내용 공백"의 직접 원인 후보.
3. **행성 "0 표시" 실패모드 미특정** — count==0 / id 부재 / cell 활성 0 / institution·warehouse count 0 중
   어느 것이 (만약) 라이브 증상인지 캡처 없음. 서버 기본 ON push 정황상 count==0은 가능성 낮음.
4. **전략 dot 소속색 경로 부재** — 엔티티 +0xa/+0xb를 성계 마커 색으로 쓰는 함수 미발견. byte2 variant의
   진영 의미 미확정(P3). 라이브 A/B 없이는 "전략맵 진영색" 주장 불가.
5. **중립 sentinel + 패널/전략맵 elem+0x04 공유** 라이브 교차검증 미수행(정적 RE만).
6. **라이브 EXE 증거 전무** — SHA 검증/ui_explorer 미실행. 모든 표시/색 주장은 정적 RE+서버소스 기준.

---

## 5. 최소 수정안 (정확한 file:line)

> 결론: **행성 레코드와 성계 소속 owner 바이트는 이미 RE-확정 레이아웃으로 emit되고 기본 ON이다.**
> 따라서 "없는 것을 새로 만드는" 수정이 아니라, (A) 값 주입 보강(P3, opt-in 권장)과 (B) 문서/플래그
> 정합이 최소 수정의 본질이다. galaxy.json은 gin7manual 추출물(아래 provenance) — **원본 권위 아님**.

### 5.1 행성 레코드 스칼라 주입 (선택, opt-in 권장)
- 현재: `informationBaseSeed`(login-session.mjs:1494-1504)가 id/owner(b04)/class(b175)만 채우고 나머지 0.
  `baseRecordForBuilder`(L1553-1560)가 `LOGH_BASE_ECONOMY` ON일 때 planet-economy.json에서 5개 보급/예산
  배열만 enrich, 스칼라는 0 유지(주석 L1549-1552, codec L297-355의 P3 정책과 일관).
- 변경 지점: `economyBaseRecord`(codec/base-record.mjs:297 이하) + planet-economy.json 콘텐츠 확장.
  스칼라 필드(+0x08…+0x128)는 **RE 의미 미확정이므로 라이브 A/B 전까지 주입 금지**(잘못된 필드 위험).
- 권고: **opt-in 유지**(`LOGH_BASE_ECONOMY`는 이미 기본 ON이나, 신규 스칼라 주입은 별도 플래그로 격리).
  현재 P3 정책(값 미주입, 0 기본)은 환각 회피로 **올바름** — 무리한 default 승격 금지.

### 5.2 성계 소속(owner) — 변경 불필요(이미 정합)
- `baseOwnerByteFromFaction`(login-session.mjs:1038-1042) → b04(L1499) → codec field04(elem+0x04, L241).
  empire=3/alliance=2/else=1 매핑은 패널 FUN_0057aa90(==2/==3) RE와 일치. **수정 불요.**
- 중립 sentinel: 현재 else=1. 패널은 1을 진영명으로 분기하지 않음(미표시) → 의도와 일치. **라이브로 색
  오인만 확인 권장**(코드 변경 아님).

### 5.3 전략맵 dot 소속색 — **수정 금지(RE 선행 필요)**
- `strategicMarkerVariantForSystem`(login-protocol.mjs:973-985)에서 분광형 대신 faction을 byte2에 넣는 변경은
  **클라가 byte2를 진영색으로 해석하는지 미확정(P3)** 이므로 **라이브 검증 전 P0 승격·default 변경 금지.**
- 0x0313/0x0315에 owner 바이트를 추가하는 것은 **와이어 스키마상 불가**(3바이트 고정, 클라 파서가 pin).
  전략 dot 소속색이 목표라면 RE로 (a) byte2 variant의 진영 의미 또는 (b) 별도 색 경로를 먼저 확정해야 함.

### 5.4 default vs opt-in 권고 요약
| 변경 | 권고 | 이유 |
|---|---|---|
| 행성 base 레코드 push | **default ON 유지**(현 상태) | 이미 RE-확정 레이아웃, count>=1 |
| owner 바이트(elem+0x04) | **default ON 유지**(현 상태) | 패널 RE 일치, 값 권위 충분(faction 80/80) |
| 행성 스칼라(경제/방어) 주입 | **opt-in (신규 플래그)** | 필드 의미 P3 미확정, 잘못 주입 위험 |
| 전략맵 byte2=faction | **금지(현 분광형 우선 유지)** | 클라 진영색 해석 미확정 P3, 라이브 선행 |

---

## 6. 콘텐츠 provenance (과장 금지)
- `server/content/galaxy.json` `_source`: *"gin7manualsaved.pdf 星系図 special Text annotations (80 system
  labels; cx/cy only); canonCol/canonRow = page-101 raster star-dot centers"*, `_extracted: 2026-06-12`.
  → **gin7manual PDF 추출물 + 래스터 dot 좌표**. 이름/좌표/분광형/faction은 매뉴얼·래스터 유래로
  **원본 서버 데이터가 아니라 재구성(P1~P2)**. faction 분포(39/40/1)는 매뉴얼 진영 구획 기반(P2).
- planet 객체(`{name, orbit}`)는 이름·궤도만(P2), 경제/방어 스칼라 **없음**.
- `planet-economy.json`은 `_purpose/_method` 메타 + 3 시스템 샘플(사실상 빈 팩, P3).
- base 레코드 0x180 스칼라 **필드명은 PROVISIONAL**(codec/base-record.mjs:45-52, 297-355). 바이트
  오프셋/stride/cap만 P0, 값·이름은 P3 — 본 문서 어디서도 P3를 원본 권위로 승격하지 않는다.

---

## 7. 위험 / 불확실성
1. 라이브 미검증 — 모든 표시/색 주장은 정적 RE+서버소스. shaVerified 없이 라이브 완료 주장 금지.
2. 행성 스칼라(+0x08…+0x128) 의미 미확정 — 추정 주입 시 잘못된 필드를 칠해 패널 오작동 위험(그래서 opt-in).
3. static(+4)/live(+0) id 헤더 델타 미검증 — 코덱은 live 레이아웃을 따르나 정적 카탈로그 정합 미확인.
4. 전략 dot 진영색은 RE 미성립 — byte2 의미 확정 전 default 변경 시 가짜 색/마커 위험.
5. 중립(elem+0x04=1)이 라이브에서 적색으로 오인될 가능성(P2) 미검증.
6. galaxy.json은 gin7manual 추출 재구성 — 원본 서버 수치와의 차이 가능. P1~P3로 다뤄야 함.
7. maker의 라인넘버 출처가 환각이었음 — 본 문서는 redex 주소·서버 file:line만 신뢰원으로 사용.
