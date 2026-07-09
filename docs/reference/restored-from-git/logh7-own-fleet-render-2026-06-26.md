# own-fleet 전략맵 렌더 RE + 서버 셋업 (2026-06-26)

대상: `G7MTClient.exe` (.omo/ghidra/export/G7MTClient, `RE/tools/logh7_redex.py`) · 캐논 서버 `server/src/server`
선행: `docs/logh7-fleet-render-re.md`(§1.3·§5·§6), 메모리 `logh7-fleet-render-rootcause-2026-06-20`.
라이브(2026-06-26): 전략맵 렌더되나 own-fleet 스프라이트 미출현(항성만, shot 049/101).

> 한 줄: own-fleet 스프라이트는 **렌더 FSM case0(1회성) 1틱에 own_cell(+0x11178)이 이미 채워져 있어야**
> 그려진다. own_cell 라이터는 정적 디컴파일에 0건(레지스터-폴딩) — strat-camera-focus EXE 패치(또는
> 동치 서버 시드 `LOGH_PLAYER_FOCUS_CELL`)가 `source+0x320`을 써서 채우는 게 현재 유일 경로. 추측 P0 금지.

---

## 1. own-fleet 렌더 조건 (정적 확정)

### 1.1 렌더 함수 체인
- 전략 시퀀스 FSM `FUN_004fef90(param_1=g_StrategyClient)`, `switch(*(param_1+4))`:
  - **case0** = `FUN_0058d140`(own-fleet 스프라이트 렌더) → 실행 후 `*(param_1+4)=1`로 **1회 advance**.
  - case1 = HUD 메인루프(`FUN_0058ee70`). case0은 init 1프레임만 돈다(라이브 fsmState=1 고정 확정 §5).
  - 진입 게이트: `FUN_004b7890()`(=`FUN_004b8950()!=0`, turn-ready) — 라이브 ret=1(열림, 가설 반증됨).

### 1.2 `FUN_0058d140` (own-fleet 렌더) 내부 AND 조건 — 전부 충족돼야 스프라이트 출현
1. `FUN_0058d110()`: `*param_1 != 0` **AND** `FUN_0050cf40(0x6b) != 0` (HUD 엘리먼트 0x6b 로드).
2. `iVar9 = *(DAT_007ccffc+8)` 가 `0`·`-0x24` 아님 **AND** `DAT_007cd04c != -0x11174`(컨트롤러 base 비널)
   **AND** `FUN_004b5b50() != 0`.
3. **own_cell** `local_28=*(DAT_007cd04c+0x11178)%100`(col), `local_2c=…/100`(row) 가
   `0<=col<100 && 0<=row<0x32(50)` **AND** `FUN_004c8b70(col,row)!=0`(셀이 유효 오브젝트). ← own_cell=0이면
   col=row=0 → (0,0)셀 또는 무가시.
4. `FUN_004c7290()` (PLAYER_INFO 슬롯 매칭, stride 0x370) `!=0`. 미스면 렌더데이터 없음 → 안 그림.
   (PLAYER_INFO 슬롯은 3-way 매칭 `0x0204 selectedChar==0x3584a0` / `0x0323 char[9]=flagship==unit.id` /
   `0x0325 unit + 0x0b0a→FUN_004c2a80(1)` 로 생성 — `docs/logh7-fleet-render-re.md §1.2.`)

→ 결론(정적 P0): **own_cell(+0x11178)이 case0 1틱 시점에 유효 셀로 채워져 있고**(조건3), PLAYER_INFO 슬롯이
존재해야(조건4) own-fleet이 그려진다. 둘 다 갖춰져도 case0 1회성이라 그 1프레임에 동시 충족돼야 한다.

### 1.3 own_cell(+0x11178) 라이터 = 정적 0건 (핵심 갭)
`redex grep "0x11178" --names` → **READ 8함수**(004d4e90/4d5030/4d6310/4d6480/4d6b70/4d8280/58d140/58ee70),
`grep "0x11178) ="` → **WRITE 0함수**. 라이브 기준선(무입력)에서도 write 0회(§5). → own_cell은
**레지스터-보유 포인터 경유 write(디컴파일 폴딩) 또는 클릭/스폰 입력 경로**에서만 채워진다.

### 1.4 strat-camera-focus 패치가 채우는 실제 경로 (RE+Frida)
`tools/client_patches/strat-camera-focus.json`: `FUN_004c4170` 프롤로그를 cave VA 0x5d5290으로 detour,
**`*(source+0x320)=0x0a1c`**(2588=row25*100+col88=제국 수도 ヴァルハラ canon dot) write. `source=*(mainState+8)`.
- `FUN_004c4170`는 **`*(param_1+0x126711)==2`(mode2=전략맵)** 일 때만 본체 실행(redex 확인) → 패치는
  전략맵 모드에서만 발동.
- Frida positive-control: `source+0x320` write가 validator(`FUN_004d6310`) 체인을 통과시키고 카메라가
  홈셀 센터링(증명됨). 단 **STATIC detour의 end-to-end own-fleet 스프라이트 라이브 미확정**(needsLive).
- DEFAULT_STACK에 포함됨(`RE/tools/logh7_build_playable_client.py:124`). 그래서 전략맵 그리드/카메라는
  렌더되나(2026-06-26 shot 일치), own-fleet **스프라이트**는 여전히 미출현 = 조건3(own_cell)이 case0
  타이밍에 안 맞거나 조건4(PLAYER_INFO) 미충족 추정. `source+0x320 == 0x11178` 동치는 Frida 관측이지
  정적 비유도 — 라이브로 own_cell write watchpoint 재확인 필요(P2).

---

## 2. 서버 셋업 현황 + 보강

### 2.1 현황 (`server/src/server/logh7-login-session.mjs`)
- `fleetCellId()`(:1128) = `row*100+col` (playerFleetCell 진영 수도). own_cell 패킹 포맷과 일치.
- `localFleetRecord`(:1187) → 0x0325 unit 레코드. `cell: fleetCellId()`(element+0x0c) 항상,
  `commander`(element+0x08 == `source+0x320`)는 **`LOGH_PLAYER_FOCUS_CELL==1`일 때만 `fleetCellId()`**,
  아니면 charId. = strat-camera-focus EXE 패치의 **서버측 동치 시드**(off-default).
- 게이트: `LOGH_FULL_UNIT_LOCATION==1`(:323) 이라야 localFleetRecord가 emit됨(unitFleetsForLocation:1212).
  `LOGH_MP_VISIBILITY==1`이면 worldState.upsertFleet로 공유 함대 등록(:1156).
- `LOGH_STRAT_SEQ_START==1`(:259) = 순차 grid-enter(value0→value1)로 StrategySequence 시작(C002 트랙).
- 모두 **off-default**, 검증된 월드진입 바이트 불변.

### 2.2 보강 판정
정적으로 own_cell 라이터가 미확정(§1.3)이라 **서버만으로 새 RE-확정 경로를 추가할 근거 없음**(추측 P0 금지).
현존 `LOGH_PLAYER_FOCUS_CELL` + `LOGH_FULL_UNIT_LOCATION` 조합이 이미 commander 슬롯(=source+0x320)에 home
cell을 싣는 **유일한 RE-grounded 서버 후크**다. → 코드 보강 없음. 라이브 실험으로 이 조합의 own-fleet 출현
여부를 측정한 뒤에만 다음 수정을 설계한다(아래 §4).

---

## 3. 검증 (직렬, 무회귀)

`cd server && npm test`(= `node --test tests/server/*.test.mjs`):
**tests 1187 · pass 1169 · fail 0 · skipped 18** (baseline 일치, 회귀 0).
주의: `node --test 'tests/server/'`(디렉터리 인자)는 MODULE_NOT_FOUND로 실패 — 반드시 glob(`*.test.mjs`)
또는 `npm test` 사용.

---

## 4. 다음 라이브 실험 설계 (own-fleet 렌더 + fleet-click 관측)

### 4.1 env 조합 (own_cell 시드 양방향)
```
LOGH_AUTHORITATIVE=1 LOGH_STRAT_GALAXY=1 \
LOGH_FULL_UNIT_LOCATION=1 LOGH_PLAYER_FOCUS_CELL=1 [LOGH_MP_VISIBILITY=1]
```
playable.exe(=strat-camera-focus 포함, 0x0a1c 제국수도 셀)와 서버 focus-cell 시드를 **동일 셀(row25,col88)**
로 정렬 → own_cell이 EXE·서버 양쪽에서 같은 (88,25)로 채워지는지 차분. (서버 수도 = FACTION_CAPITAL.empire.)

### 4.2 렌더 확인 (shot 좌표)
전략맵 카메라가 홈셀 센터링 상태이므로 own-fleet 스프라이트는 **화면 중앙 부근**(센터 셀 (88,25)).
shot 후 화면 중앙(약 캔버스 0.5×0.5 지점, 1920×1080이면 ~960,540) ±그리드 1셀에 함선 아이콘 출현 확인.
비교 기준 shot = 049/101(항성만, own-fleet 부재).

### 4.3 fleet-click → 선택 latch / 명령메뉴 관측 (Frida read-only)
own-fleet 아이콘이 보이면, 그 셀 클릭 후 read-only Frida로:
- **own_cell write watchpoint**: `DAT_007cd04c+0x11178`(런타임 deref) — 클릭이 채우는지 + 그 직후 case0
  (`FUN_0058d140`) 재실행되는지.
- **선택 latch +0xb00**: `FUN_00501e30` enqueue / dequeue 경로(event-9) + `g_StrategyClient` 멤버.
- **명령메뉴 `FUN_004f6040`** 히트 카운트(클릭 후 커맨드윈도우 트리거).
- **mode 전환**: `FUN_004c4170 param_1+0x126711`(2=전략맵) 및 mode2↔0 전환(`FUN_004fd7a0`).
절차: ui_explorer로 splash ~30초 대기 → autologin 금지(실로그인) → 월드진입 → trace 0x0325/0x0f02 →
중앙 셀 클릭 → 위 4 probe 동시 캡처. 클라 무수정(read-only), stop 시 SHA 복원.

### 4.4 C002 자연 트리거 가능성 판정
**조건부 YES**: own-fleet 스프라이트가 출현하고(§1.2 조건3+4 충족) 그 셀 클릭이 own_cell write→PLAYER_INFO
선택 latch(+0xb00)를 자연 발생시키면, 명령메뉴(`FUN_004f6040`)가 mode2 자연 경로로 트리거 → C002의
강제 mode 토글/event-9 인젝션 없이 자연 종결될 잠재력 있음(클릭 작동은 §확인됨). **단 전제 미충족 리스크**:
(a) own_cell이 case0 1회성 타이밍에 안 맞으면 스프라이트 부재 → 클릭 대상 없음, (b) 메모리 누적 결론상
enqueue(mode2)↔consume(mode0+0x126718) **mode 배타**가 근본이라, 스프라이트가 보여도 클릭 latch가 mode2
큐에 쌓이고 안 빠질 수 있음(`logh7-c002-...-2026-06-21`). → own-fleet 렌더는 **C002 자연 종결의 필요조건
후보이지 충분조건 아님**. §4.3 라이브 probe로 클릭→latch→mode 흐름을 먼저 측정해 판정해야 함(추측 금지).
