# 전술맵 NOW LOADING 정체 종합 + 서버 구현 스펙 (2026-06-26)

read-only RE 종합. 모든 오프셋/즉치는 redex VA 또는 서버 파일:라인 인용. 추측 데이터는 **승격하지
않는다**(좌표/스탯 값 자체는 콘텐츠 P2, 본 문서는 byte-correct 빌더·푸시·게이트만 확정한다).

## ★메인 byte 확인 정밀화 (먼저 읽을 것)
battle-engine `buildTacticsInformationUnitShipInner`(:183, UNIT_SHIP_RECORD_BYTES=47)는 클라 reader와 **3중 불일치**:
1. **헤더 2B**(buildPackedU16Count: count u16@0, entry@+2) vs 클라 **4B**(entry@body+4, login-protocol:1568 `base=4+i*stride`).
2. **stride 47** vs 클라 **52**(TACTICS_UNIT_ENTRY_STRIDE, 13 dword).
3. **레이아웃**: 47B=morale@4/confusion@5/character@6/x@0xa vs 클라 52B=unitId@0/controllable@4/mapSection@8/x@0xc/y@0x10/z@0x14/heading@0x18/reserved@0x1c.
**정답 = login-protocol:1561 `buildResponseTacticsInformationInner`**(4B헤더·52B·고정버퍼 over-read 방지).
**제약**: login-protocol→battle-engine(openBattleField) import라 battle-engine이 login-protocol import하면 **순환** → 직접 재사용 불가.
**권장 구현(택1)**: (A) 정답 빌더를 codec/tactics-records.mjs로 분리해 양쪽 import(최선) / (B) login-session(양쪽 import 가능)에서 openBattleField steps의 0x33b inner를 buildResponseTacticsInformationInner(participants→{unitId,controllable:1,mapSection,x,y,z,heading})로 스왑(최소). +갭2: 참가 전원 0x325/0x323 동반(login-session:1804 게이트 전원 확장).
**라이브 선결(O5)**: 정체 진범=stride/로스터/mode0 중 무엇인지 +0x126718 watchpoint로 분리(stride 유력·미확정). ⚠️포화 컨텍스트서 byte-wire 서두름 금지(와이어 깨짐=현 stall보다 악화).

배경: 저널 #12에서 **mode 게이트는 돌파됨**(L1 selector로 mode2→mode0 전환 + LOGH_BATTLE_ENTRY_PROBE로
`openBattleField` 시퀀스 푸시 → 전술맵 NOW LOADING 화면 도달, 3D 기함+로고). **그러나 NOW LOADING에서
정체(로드 미완)**. 본 문서는 그 정체를 끝내는 데이터/포맷/푸시 갭을 닫는다.

관련 코드:
- `server/src/server/logh7-battle-engine.mjs` — 전술 레코드 빌더 + `openBattleField` (전부 존재).
- `server/src/server/logh7-login-protocol.mjs:1542-1579` — `buildResponseTacticsInformationInner`(0x33b),
  `:1592` `WORLD_RESPONSE_OBJECT_SIZES`.
- `server/src/server/logh7-login-session.mjs:1860-1883` — battleEntryProbe → `deferredBattleInners`.
- `server/src/server/logh7-auth-server.mjs:1319-1338` — `scheduleDeferredBattle`(지연 푸시 소비처).

---

## (a) NOW LOADING 완료 게이트 — 어느 데이터가 필요한가

로딩 종료는 단일 시그널이다: mode dispatcher `FUN_004b68f0`가 `bVar2`(FieldImport-ready latch)가
true일 때 **`FUN_004b64c0()`(FieldMake)** 를 호출하고, 직후 `**(DAT_02215e2c+0xc)=1`(활성씬 ON)을 세팅하면
NOW LOADING이 끝난다. `bVar2`가 영원히 false거나 FieldMake가 assert로 abort하면 무한 NOW LOADING.

게이트는 3단이다(순서대로):

| 단계 | 위치(redex) | 조건 | 실패 시 |
|---|---|---|---|
| G1 큐 드레인 | `FUN_004b8950` (`FUN_004b7890`→) | `DAT_007ccffc+0x3552b8` 수신큐(stride 5 dword=20B, max 500)가 미처리·미도래 항목 0 → `m_iQueExecCount(+0x3552b4)` 소진 | `bVar2` 영원히 false |
| G2 mode-init | `FUN_004b64c0` 진입 | `*(char*)(+0x126710)!='\0'` | 인자없는 `FUN_005923a0()` assert |
| **G3 ★주범 MakeTacticsUnit** | `FUN_004b64c0` mode0 분기 | `FUN_004f45c0()` 후 `*(char*)(+0x126718)!='\0'`(mode0_active) | `FUN_005923a0(&DAT_0076efac,0)` assert |

`DAT_0076efac` 인접 문자열 `0x0076efdc = 'MakeTacticsUnit T=%f[sec]'` → **G3 assert = MakeTacticsUnit
실패**가 정체의 근본임을 확정.

**핵심: `+0x126718`(mode0_active)이 0이면 무한 로딩.** 라이브 측정(mode0-breakthrough:10) = `+0x126718=0,
mode0 region 비어있음(0/64)`로 직접 확인됨.

`+0x126718`을 채우는 **유일한 자연경로** = mode0 populator `FUN_004c32a0`(WorldIn_TacticsFieldImport)의
mode0 분기(`+0x126711=='\0'`). 그 분기가 유닛 객체를 ≥1개 만들면 `+0x126718`이 채워진다.
`FUN_004f45c0`은 렌더/카메라 서브시스템 init만 하고 `+0x126718`은 건드리지 않는다(populator 아님, redex 확인).

> 주의(별도 트랙): populator 본체 진입 자체가 `+0x126718!=0` 게이트 뒤에 있는 incremental 호출
> 경로(`FUN_004ba2b0` 0xb0a, `FUN_004c32a0(1)`)와, `+0x126718` 무게이트 FULL 호출 경로
> (`FUN_004b68f0`→`FUN_004c32a0()` param_2=0)가 공존한다. mode0 전환(L1 selector + 0xb0a 재arm)은
> 저널 #12에서 돌파됨 — 본 문서는 **그 다음 갭(데이터/포맷)** 만 다룬다.

---

## (b) 전술 레코드 포맷 — 클라 파서 byte 레이아웃

★대전제: dispatcher `FUN_004ba2b0`의 전술 case는 **파싱하지 않는다.** 각 case는 payload를 고정개수 dword
block-copy(memcpy)로 world-obj 상대 슬롯에 통째 복사할 뿐이다. 실제 byte 레이아웃은 reader `FUN_004c32a0`가
정의한다. finalize `FUN_004be750`·error log `FUN_005923a0`는 이 인덱스에서 **no-op stub(return)** — 즉
클라측 packed→padded 재확장은 일어나지 않는다. **서버는 클라 in-memory 레이아웃과 byte-exact여야 한다.**

### dispatcher dest/copy-count (redex `FUN_004ba2b0`)

| code | 이름 | dest 오프셋 | copy(dword) | size table | finalize |
|---|---|---|---|---|---|
| 0x33b | UnitShip | +0x4271a8 | 0x1e79 | 0x79e4 | FUN_004be750 |
| 0x33f | Corps | +0x4044b8 | 0x2329 | 0x8ca4 | — |
| 0x341 | FillShield | +0x40d15c | 0x1771 | 0x5dc4 | — |
| 0x345 | Base | +0x4040dc | 0x81 | 0x0204 | — |
| 0x347 | Obstacle | +0x4042e0 | 0x76 | 0x01d8 | — |
| 0x349 | PositionUnit | +0x42eb8c | 0xbb9 | 0x2ee4 | FUN_004be750 |
| 0x34b | PositionBase | +0x431a70 | 0x11 | 0x0044 | FUN_004be750 |

★**0x343는 `FUN_004ba2b0` dispatcher에 case가 존재하지 않는다**(grep 0건). 클라가 받는 전술 응답은
0x33b/0x33f/0x341/0x345/0x347/0x349/0x34b 7종뿐. 질문의 0x343(FillBeamGun)은 dispatcher가 소비하지 않는
레코드 — **NOW LOADING 완료에 무관**(서버가 보내도 클라가 dest에 쓰지 않음).

### reader `FUN_004c32a0`가 읽는 실제 byte 레이아웃

**0x33b UnitShip (+0x4271a8) — ★주포맷, mode0 유닛 생성 소스:**
- header: u16 LE count @+0x4271a8.
- entries: +0x4271ac부터 **stride 13 dword = 52바이트**(`piVar23 = piVar23 + 0xd`, reader line 389/519).
- entry 필드(reader 소비 기준):
  - `[0]` u32 unitId — `+0x41a368`(0x325 unit-table) id와 stride 0x58=88B로 매칭 필수(미매칭=스킵).
  - `[1]` u32 controllable — unit+0x954.
  - `[2]` u32 mapSection — faction DB 검증, default=unitId.
  - `[3..6]` 4 dword → `FUN_004c4240(local, piVar23[3], piVar23[4], piVar23[5], piVar23[6])` (position/heading).
  - `[7..12]` reserved → unit+0x97c.
- cross-dep: reader line 382 `if(*(ushort*)(+0x41a364)!=0) break;`(0x325 count), line 407
  `*(int*)(+0x36a5dc)`(0x323 char count) — **0x325/0x323 로스터가 비면 유닛이 LAB_004c3a13로 스킵된다.**

**0x345 Base (+0x4040dc) — FULL import(param_2=0) 분기에서만 읽힘:**
- header: u8 count @+0x4040dc (max 0xff).
- entries: +0x4040e0부터 **stride 8 dword = 32바이트**(reader `puVar8 += 8`).
- entry `[0]` = base id key(0이면 경고 `DAT_00771278`). key를 `+0x3facf4` 전략 Base 테이블(count byte
  @+0x3facf4, entries @+0x3facf8 stride 0x60 dword=0x180B)과 대조해 ownership byte 추출 후
  `FUN_004c46a0(key,0,2,0,key,...)`로 객체 alloc. `[1..7]` 7 dword = 객체 페이로드(의미 미해석, zero-safe 미확정).

**0x349 PositionUnit (+0x42eb8c):** reader `FUN_004c32a0`가 **읽지 않는다**(grep `42eb8c` 0건). 위치는
0x33b의 `[3..6]`에서 나온다. → **이 import에 0x349는 불필요**(다른 소비처용). 푸시해도 무해하나 로드완료
의존 아님.

**0x347 Obstacle (+0x4042e0):** 헤더 다음 4개 서브카테고리 count byte = +0x4042e4/+0x4042f8/+0x40430c/
+0x404428(각 ≤0x10 검사), 추가 블록 +0x404448 stride 6 dword=24B. reader case0 보조 카운트(+0x40443c)·case4
카운트(+0x404428)는 모두 0x347 region([+0x4042e0,+0x4044b8)) 내부 바이트다 — 0x345와 무관. **count=0이면
`FUN_005923a0` no-op만 호출, 비치명.**

**0x341 FillShield(+0x40d15c)/0x33f Corps(+0x4044b8)/0x34b PositionBase(+0x431a70):** reader 측 명시적
read 분기를 import.txt 인덱스에서 직접 매칭하지 못함(미확정). **NOW LOADING 완료에 필수가 아님**(0x33b가
유닛 생성의 메인 소스). 빈/zero 페이로드 우선.

### 0x33b vs 0x345 차이
(1) dest 0x4271a8 vs 0x4040dc. (2) count u16(엔트리 stride 52B) vs u8(stride 32B). (3) 0x33b는 복사 후
finalize 호출/0x345는 미호출. (4) **게이트 분기**: 0x33b는 `+0x126718!=0` 분기에서 active-unit pool 채움,
0x345는 `param_2==0`(FULL) 분기에서 Base 엔트리 소스. **함대전(요새 없음)에는 0x345 불필요, 0x33b가 핵심.**

---

## (c) 누락 데이터 확정

라이브 정체의 근본은 "0x345 Base 빌더 미존재"가 **아니다**(빌더는 전부 존재, (d) 참조). 확정된 갭 2건:

### 갭 1 ★ (1순위·치명) — 0x33b 레코드 stride 47 vs 클라 52 불일치

- 클라 reader `FUN_004c32a0`는 0x33b를 **0xd dword = 52바이트 stride**로 순회한다(line 389 `piVar23+0xd`,
  line 519 레코드당 0xd dword 복사). 기존 `login-protocol.mjs:1544` `TACTICS_UNIT_ENTRY_STRIDE = 52`도
  이를 반영(13 dword, entries @body+4).
- 그러나 `battle-engine.mjs:89` `UNIT_SHIP_RECORD_BYTES = 47`로 **PACKED 47바이트** 레코드를 emit한다
  (`buildTacticsInformationUnitShipInner`, :183). 47 ≠ 52이므로 record[0] 이후 모든 레코드가 어긋나
  위치/함장/사기가 garbage로 읽혀 유닛 구성 실패 → NOW LOADING 정체.
- finalize `FUN_004be750`가 no-op stub이라 packed→padded 재확장은 **없다**. §0 주석의 "클라가 packed를
  재확장한다" 가정은 0x33b에 대해 RE로 반증됨.
- 두 빌더가 공존하는 점도 갭: `login-protocol.mjs:1561 buildResponseTacticsInformationInner`는 52B stride
  3 dword 헤더(unitId/controllable/mapSection)+x/y/z/heading로 emit(클라 정합), `battle-engine.mjs:183`은
  47B로 emit(불일치). `openBattleField` step2는 47B 빌더를 쓴다 → 정정 필요.

### 갭 2 (2순위) — 0x325/0x323 로스터 동반 미푸시

0x33b 유닛은 reader line 382/394/407에서 0x325 unit-table(+0x41a364 count, +0x41a368 stride 0x58)·0x323
char roster(+0x36a5dc count, +0x36a8d8)와 cross-match돼야 풀에 등록된다. 미매칭 유닛은 스킵.
현 probe(login-session.mjs)는 `postloadPlayerRecordEnabled` 게이트로 unitId/charId **1기만** 별도 푸시
(`buildInformationUnitRecordInner`/`buildInformationCharacterRecordInner`, :1804-1811) — 참가 함대 전원(cap
12)의 0x325/0x323이 없어 own-ship 외 유닛이 전부 스킵될 수 있다.

### 비-갭(누락 아님) 확정
- **0x345 Base**: 함대전(요새 없음)이면 `bases=[]`가 정답. count=0은 no-op만, MakeTacticsUnit 정체와 무관.
  단 FULL import(`+0x126711==0` & param_2=0)는 `+0x4040dc`를 읽으므로 요새 전투에서만 필요.
- **0x349 PositionUnit**: reader 미사용. 정체와 무관.
- **0x343 FillBeamGun**: dispatcher case 부재. 정체와 무관(보내도 무시).
- **0x347 Obstacle / 0x341 / 0x33f / 0x34b**: count=0 비치명.

---

## (d) ★ 서버 구현 스텝

모든 변경은 off-default 게이트 뒤. byte-correct 빌더만 추가하고 콘텐츠 값(좌표/스탯)은 P2로 남긴다.

### 스텝 1 ★ — 0x33b UnitShip 빌더 stride 47→52 정정 (1순위)

`server/src/server/logh7-battle-engine.mjs` `buildTacticsInformationUnitShipInner`(:183-206)가 emit하는
레코드를 **52바이트 / 13 dword**로 재구현한다. 이미 `login-protocol.mjs:1561-1579`
`buildResponseTacticsInformationInner`에 클라-정합 52B 빌더가 존재하므로 **그 레이아웃을 권위로 채택**한다:

byte-correct 52B 레코드(`TACTICS_UNIT_ENTRY_STRIDE=52`, entries @body+4):
```
@0    u32 unitId        (≠0; 0x325 unit-table +0x41a368 id와 매칭)
@4    u32 controllable  (1=player-controllable → unit+0x954)
@8    u32 mapSection    (faction DB 검증; default=unitId)
@0xc  f32 x             (piVar23[3])
@0x10 f32 y             (piVar23[4])
@0x14 f32 z             (piVar23[5])
@0x18 f32 heading       (piVar23[6])
@0x1c..0x33  reserved 6 dword (piVar23[7..12] → unit+0x97c; zero-fill)
```
헤더 = u16 LE count @0, entries @+4. body 총 길이 = 2 + count×52(packed) — dispatcher copy(0x1e79
dword=31204B = size table 0x79e4)는 고정복사이므로 **렌더 stall 방지 위해 body를 size-table 길이로 채울지
packed로 보낼지 라이브 확인 필요**(open). 우선은 packed(2+count×52)로 emit하되 dispatcher가 31204B 고정
복사임을 고려해 **0x33b는 packed가 아니라 dispatch-cap(31204B) 제로패딩이 안전할 수 있음** — logh7-wire로
byte 대조 후 확정(아래 O1).

구현 권장: `openBattleField` step2가 `battle-engine.mjs:183`의 47B 빌더 대신
`login-protocol.mjs:1561`의 52B `buildResponseTacticsInformationInner`(또는 그 레이아웃을 import해 52B로
재작성한 동등 빌더)를 호출하도록 step2를 교체한다. 위치: `battle-engine.mjs:589-599`.

★현 47B 빌더의 필드 오프셋(id@0/morale@4/conf@5/char@6/x@0xa)은 클라 52B 스키마와 의미·오프셋이 모두
다르므로 **단순 stride 변경이 아니라 레이아웃 재작성**이다. morale/confusion/character 등 47B 전용 필드는
클라 52B reader가 소비하지 않으므로(reader는 controllable/mapSection/xyz/heading만 읽음) **드롭**한다.

### 스텝 2 — 참가 함선 전원의 0x325/0x323 로스터 동반 푸시

`battle-engine.mjs` 또는 `login-session.mjs:1860-1883` battleEntryProbe 경로에서, `openBattleField` 시퀀스
**앞**에 참가 함선 전원(buildBattleEntryParticipants 산출 participants)의:
- 0x325 unit record: `buildInformationUnitRecordInner({ unitId, unitCount, fleets:[...] })`
  (`login-protocol.mjs`, 이미 존재) — unitId가 0x33b의 unitId와 일치해야 함.
- 0x323 char record: `buildInformationCharacterRecordInner(...)` (이미 존재) — character가 0x33b의
  character/0x337 로스터와 일치.

를 cap(12) 전원분 푸시한다. 현 `postloadPlayerRecordEnabled` 1기 게이트를 참가자 전원으로 확장하거나,
deferredBattleInners 앞에 별도 prepend한다. (single-source: participants 배열에서 파생.)

### 스텝 3 — 푸시 배선(deferredBattleInners)

`login-session.mjs:1871-1880`의 `openBattleField` 호출은 현재 `{participants, characters, anchorId,
modeKind:0, tacticsArg0:1}`만 넘기고 **corps/bases/obstacles 미전달** → 0x345/0x347/0x33f/0x34b step skip.
함대전이면 이것이 정답(누락 아님). 요새 전투 시에만 bases/obstacles 인자 추가:
- `battle-engine.mjs:631-633` 0x345 Base는 `bases.length>0`일 때만 push(기존 게이트 유지).
- bases/obstacles 시드 헬퍼는 신설 대상(요새 전투 시 worldState/contentPack에서 추출). 함대전 우선이면 불필요.

deferredBattleInners 경로(확정, 변경 불필요):
- `login-session.mjs:1881-1882`: `action.deferredBattleInners = battleSteps.map(s=>s.inner)`,
  `action.deferredBattleDelayMs`.
- `auth-server.mjs:1319-1338` `scheduleDeferredBattle`: grid-enter 응답 후 delay(기본 8000ms) `setTimeout`
  → 같은 소켓에 `sendExtraInners` 푸시. `timer.unref`로 테스트 비차단.
- ★즉시 푸시 금지(전략 씬 렌더 전 0x42f 도착 = 전략맵 stall, control 대조 확정). 지연 필수.

### 스텝 4 — off-default 게이트(전부 기존)

- `battleEntryProbeEnabled()` = `LOGH_BATTLE_ENTRY_PROBE`(off-default).
- `deferredBattleInners` 필드는 fleetMove/stateTransition probe와 **상호배타**(login-session.mjs 공유 필드).
- `tacticsArg0=1` 필수: 0x0f1f 소비처 `FUN_004c1b20`가 `*param_2==1`일 때만 전술 engage(+0x357e8c=2),
  기본(0)=strategic-return(else)라 전술 풀 미활성(RE 확정).
- mode0 전환 자체 = L1 0x0317 selector(`gridSelectorProbeEnabled`/`gridSelectorValue`,
  login-session.mjs:1923-1925) + 0xb0a 재arm(`stratSeqStartEnabled`, :1815-1820/:1915-1921). 저널 #12 돌파됨.

### 스텝 5 — 테스트 오라클(추가)

`server/tests/server/logh7-battle-engine.test.mjs`(기존 47B 테스트 :98-107이 `UNIT_SHIP_RECORD_BYTES==47`을
검증 중 — 정정 대상):
1. **52B stride 회귀가드**: `buildTacticsInformationUnitShipInner`(또는 교체 빌더)가 레코드당 정확히
   52바이트, 헤더 u16 count @0, entries @+4, 필드 오프셋 unitId@0/controllable@4/mapSection@8/x@0xc/
   y@0x10/z@0x14/heading@0x18 검증. body 길이 = 2 + count×52.
2. **0x33b ↔ login-protocol 동등성**: `openBattleField` step2 inner가
   `buildResponseTacticsInformationInner`와 byte-identical(같은 participants 입력)인지 대조.
3. **openBattleField 시퀀스 순서/코드**: 함대전 입력(participants≥2, bases=[], obstacles=null)에서 push
   순서 = 0x349,0x33b,0x341,0x343,(0x337),0x42f,0x0f1f 이고 0x345/0x347/0x34b 부재 검증.
4. **tacticsArg0=1 전파**: 마지막 0x0f1f inner의 arg0 byte0==1.
5. **0x325/0x323 동반(스텝2 구현 시)**: 참가자 전원의 unitId/characterId가 0x325/0x323 레코드로
   prepend되고, 각 0x33b unitId가 동반 0x325 unitId와 일치(스킵 방지 회귀가드).
6. **off-default 불변**: `LOGH_BATTLE_ENTRY_PROBE` 미설정 시 grid-enter 응답에 전술 inner 0건(기존 1145
   서버 테스트 그린 유지).

검증: `cd server && node --test tests/server/logh7-battle-engine.test.mjs` + 전체 `tests/server/*.test.mjs`.

### open items (라이브 전 확정 필요, 추측 승격 금지)
- O1: 0x33b body를 packed(2+count×52)로 보낼지 dispatch-cap(31204B) 제로패딩으로 보낼지 — dispatcher가
  0x1e79 dword 고정복사이므로 packed가 짧으면 over-read 위험. logh7-wire로 byte 대조 필수.
- O2: 0x33b `[3..6]` 4 dword가 x/y/z/heading인지 `FUN_004c4240`(5인자) 소비 확인.
- O3: 0x345 Base 엔트리 `[1..7]` 7 dword 의미·zero-safe 여부(요새 전투 시).
- O4: 0x33b mapSection이 faction DB 검증 통과하는지(default=unitId) byte 대조.
- O5: NOW LOADING 정체 원인이 stride 깨짐(갭1)인지 0x325/0x323 미동반(갭2)인지 mode0 미활성인지
  라이브로 분리 — stride fix 단독 적용 후 `+0x126718` watchpoint로 1차 측정.
- O6: openBattleField가 라이브에서 participants 비배열로 push되는지(=카운트 0 근본) 와이어 캡처 확정.
