# LOGH VII 함대 렌더 + 선택 메커니즘 RE 확정

작성: 2026-06-19 · 저장소: `E:/logh7-revival` · 대상 바이너리: `G7MTClient.exe`
(.omo/ghidra/export/G7MTClient 풀 디컴파일 인덱스, `tools/logh7_redex.py`로 재확인)

> 한 줄 결론: **전략맵에 함대를 선택가능하게 그리는 게이트는 `0x0313`/`0x0315` 오브젝트테이블이 아니다.**
> 오브젝트테이블에는 "함대" 클래스가 없고(`byte1∈{1=빈공간,3=성계마커}`만 유효), `fleetValue=3`은
> 클라가 **성계 마커**로 해석한다(navGate만 통과, 스프라이트·클릭 없음). 함대는 별도 **unit 엔티티
> 경로**(`0x0325` unit 리스트 → PLAYER_INFO 링크 → own-fleet cell)에서만 렌더/선택된다.

이 문서는 3각도 RE를 종합하고, 그중 핵심 주장 5건을 본 세션에서 redex로 **직접 재확인**한 결과
(아래 §1 "재확인" 표시)를 근거로 한다.

---

## 1. 함대 렌더 + 선택 메커니즘 확정 (A)

### 1.1 오브젝트테이블(0x0313/0x0315) 경로 — 함대 아님 (확정 P0)

셀그리드/오브젝트테이블 조회는 **2단 간접**이다. 셀 바이트값을 ×3 해서 오브젝트 레코드 주소를 만든다.

```c
// FUN_004c8b70(col,row)  ── redex 재확인 ✅
int FUN_004c8b70(int col,int row){
  if (-1<col && col<100 && -1<row && row<0x32)
    return *(byte*)(DAT_007ccffc + row*100 + 0x2c03cc + col) * 3 + 0x2c1755 + DAT_007ccffc;
  return 0;
}
```

즉 셀에 들어가는 값은 **오브젝트 인덱스**이지 클래스가 아니다. 그 레코드의 의미는:

| 레코드 바이트 | 의미 | 소비처 |
|---|---|---|
| `byte0` (rec+0) | constmsg **group-0x18 라벨 subId** (성계명/그리드타입명) | `FUN_004c8c90(byte0)` → `FUN_00522010(0x18, byte0)` |
| `byte1` (rec+1) | **오브젝트 클래스** — 항행/마커 게이트 | `FUN_004d35b0` (navGate), `FUN_004d3a40`/`FUN_004d68d0` (마커) |
| `byte2` (rec+2) | 스프라이트/색 variant (성계 마커 한정) | 마커 렌더 |

항행 게이트는 `byte1∈{1,3}`만 통과시킨다(그 외는 차단). **함대용 클래스 값은 없다:**

```c
// FUN_004d6310 (navGate)  ── redex 재확인 ✅
iVar3 = FUN_004d35b0(col,row);                 // = *(byte*)(FUN_004c8b70()+1) = byte1
if ((iVar3 != 1) && (iVar3 - 3U != 0)) return iVar3-3U & 0xffffff00;  // 1 또는 3만 통과
```

`byte1==3`은 **성계 마커/라벨 클래스**다. `byte0`을 group-0x18 인덱스로 성계 이름 라벨을 등록한다:

```c
// FUN_004d3a40 (마커 라벨 등록)  ── redex 재확인 ✅
puVar2 = (byte*)FUN_004c8b70(col,row);
if (puVar2[1] == '\x03') uVar3 = FUN_004c8c90(*puVar2);  // byte1==3 일때만 byte0=성계 subId
// FUN_004c8c90(byte0){ FUN_00522010(0x18, byte0); }      ── redex 재확인 ✅
```

**결론:** `byte1=1`은 "함선이 워프해 들어갈 수 있는 빈 항행 공간"이고, `byte1=3`은 "성계 점/이름"이다.
어떤 byte 조합으로도 오브젝트테이블에서 **함선 스프라이트나 클릭 선택 엔티티가 키잉되지 않는다**.
`fleetValue=3`을 셀에 박으면 클라는 그 셀을 **성계 인덱스 3**으로 취급한다(`FUN_004c8bc0`의 성계 스캐터
범위 `3..0x58`의 최하단). → ground truth "함대 안 보임 · navGate passed · fleetValue=3 부적합"과 정확히 일치.

> **confidence: P0** (3각도 전원 합의 + 본 세션 redex 5함수 직접 재확인)

### 1.2 함대 엔티티 경로 — 진짜 렌더/선택 소스 (확정 P0)

함대 엔티티는 grid-unit 리스트 `clientBase+0x41a368`(count u16 @`+0x41a364`, stride **0x58**)에서 만들어진다.
이 테이블의 유일 소비자 3곳을 redex로 확인:

```
0x004ba2b0  FUN_004ba2b0  e.g. FUN_004c2c80(1,0,local_18 + 0x41a368);   // dispatcher case 0x325 적재
0x004c2a80  FUN_004c2a80  e.g. piVar4 = (int *)(param_1 + 0x41a368);    // world-entry 링크/스폰 (0x0b0a)
0x004c32a0  FUN_004c32a0  e.g. piVar20 = (int *)(param_1 + 0x41a368);   // 엔티티 팩토리 (전술 import)
```

→ **`0x0313`/`0x0315`(`FUN_004c5350`로만 채워짐)와 unit 리스트(`0x0325`로만 채워짐)는 완전히 분리된 채널.**

world-entry 링크 `FUN_004c2a80`(0x0b0a→`FUN_004c2a80(1)`)이 3-way 매칭 키를 어떻게 묶는지 redex로 확인:

```c
// FUN_004c2a80  ── redex 재확인 ✅ (mode!=0, 즉 0x0b0a 링크 경로)
if (0 < *(int*)(param_1 + 0x36a5dc)) {                 // char count
  piVar5 = (int*)(param_1 + 0x36a8b4);                 // char 테이블 (stride 0xb5*4 = 0x2d4)
  do {
    if (*piVar5 == *(int*)(param_1 + 0x3584a0)) {       // ★키1: char.id == selectedChar(0x0204가 씀)
      if (*(ushort*)(param_1 + 0x41a364) != 0) {        // unit count != 0
        piVar4 = (int*)(param_1 + 0x41a368);            // unit 리스트
        do {
          if (piVar5[9] == *piVar4) {                    // ★키2: char[9](=char+0x24 flagship) == unit.id
            FUN_004c2c80(0, piVar5);                      //  → LOCAL PLAYER_INFO 스폰
            ...
```

`FUN_004c2c80(0, charRecord)`는 PLAYER_INFO 슬롯(base `+0xc`, stride **0x370**)에 레코드를 복사한다
(`*piVar1 = *param_3` 등으로 char 필드를 슬롯에 펌핑). 단 — **`+0x11178`(own-fleet cell)은 쓰지 않는다.**

렌더 데이터 리졸버는 PLAYER_INFO를 순회해 매칭 슬롯을 찾는다:

```c
// FUN_004c7290(id)  ── redex 재확인 ✅
iVar4 = 0;
do { pcVar1 = (char*)(iVar4 + 0xc + DAT_007ccffc);
     if (*pcVar1 != '\0' && FUN_004b5b80() == param_1) return pcVar1 + 0xa4;   // 매칭 슬롯
     iVar4 += 0x370;
} while (iVar4 < 0x80e80);
return 0;   // 미스 → 렌더 데이터 없음 (함대 안 그려짐)
```

→ **함대 렌더/선택 메커니즘 = 별도 unit 엔티티 (오브젝트테이블 아님).** 3-way 동기화가 필요:
1. `0x0204` selectedChar id → `clientBase+0x3584a0` (키1)
2. `0x0323` character record의 flagship(`char+0x24` = `char[9]`) == unit.id (키2)
3. `0x0325` unit 리스트에 그 id의 unit 레코드(stride 0x58) 존재 + `0x0b0a`로 `FUN_004c2a80(1)` 트리거

> **confidence: P0** (3각도 전원 합의 + 본 세션 redex로 `FUN_004c2a80`/`FUN_004c2c80`/`FUN_004c7290`/
> `0x41a368` 소비자 직접 재확인)

### 1.3 own-fleet cell `+0x11178` — 미렌더의 진짜 잔존 블로커 (신규 확정 P0)

자기 함대 위치 마커·커서·이동 거리 판정은 모두 컨트롤러 전역 `DAT_007cd04c + 0x11178`(own-fleet cell,
패킹 `col + row*100`)을 읽는다. 본 세션에서 **이 주소의 소비자 14곳이 전부 READ이고, WRITE가 단 1곳도
없음**을 redex로 확정했다:

```
$ redex grep "0x11178" --names      → 8 함수 (FUN_004d4e90/4d5030/4d6310/4d6480/4d6b70/4d8280/58d140/58ee70)
$ redex grep "0x11178\) ="           → 0 함수   (어떤 함수도 +0x11178에 대입하지 않음)
```

대표 소비:
```c
// FUN_004d6310 (navGate) — 이동 "출발 셀"로 사용 ── redex 재확인 ✅
uVar4 = *(uint*)(DAT_007cd04c + 0x11178);  // own-fleet cell (이게 0이면 거리/도착 판정이 셀0 기준)
// FUN_0058d140 (own-fleet 스프라이트 렌더, FUN_004fef90 case0)
local_28 = *(int*)(DAT_007cd04c + 0x11178) % 100;  // own cell 위치에 함대 아이콘
```

`FUN_004c2c80`(PLAYER_INFO 스폰)도 `+0x11178`을 쓰지 않는다(슬롯 `+0x24/+0x2c/...`만 채움 — redex 확인).
즉 **`0x0325`+`0x0b0a` 경로를 완벽히 충족해 PLAYER_INFO 슬롯이 생겨도, own-fleet cell은 여전히 0**이라
함대 아이콘이 셀(0,0)에 그려지거나 안 그려지고, 클릭 시 navGate가 "셀0 → 목표" 거리로 오판한다.
`+0x11178`을 쓰는 코드는 디컴파일 심볼 폴딩 밖(레지스터 보유 포인터 경유 추정)이거나, **클릭/선택
입력 핸들러가 셋**하는 구조 — 즉 "함대를 한 번 선택해야 own cell이 채워진다"는 닭-달걀 가능성.
이건 라이브 Frida 워치포인트(`DAT_007cd04c+0x11178` 쓰기 watchpoint)로 확정해야 한다(§4 불확실분).

> **confidence: own cell이 READ-only로 함대 가시화/이동에 필수 = P0. 누가/언제 쓰는가 = P2 (RE 미확정).**

### 1.4 렌더 FSM 게이트 (확정 P0)

모든 함대 렌더는 전략 시퀀스 FSM `FUN_004fef90` 안에서만 돈다. 진입부에서 turn-ready를 요구:

```c
// FUN_004fef90 — turn-ready 게이트
cVar2 = FUN_004b7890();   // = (FUN_004b8950() != 0)   ── redex 재확인 ✅
if (cVar2 == '\0') { /* "STRATEGY_SEQUENCE Waiting" 로그 */ return; }
// case0: FUN_0058d140()  (own-fleet 렌더),  case1: FUN_0058ee70()  (HUD/info 렌더)
```

turn-ready(`FUN_004b8950`)가 false면 case0/case1 둘 다 안 돌아 **어떤 함대도 렌더되지 않는다.**
이 신호의 와이어 출처(명령 페이즈 recv-queue active 엔트리)는 §4 불확실분.

> **confidence: 렌더가 FSM+turn-ready 게이트 뒤에 있음 = P0. 어떤 메시지가 turn-ready를 켜는가 = P2.**

### 1.5 메커니즘 요약 — "둘 중 무엇?" 답

| 후보 | 함대 렌더/선택? | confidence |
|---|---|---|
| 오브젝트테이블 타입(`0x0313`/`0x0315`, fleetValue/klass) | **아니오** (성계 마커 전용, 함대 클래스 없음) | P0 |
| 별도 unit 엔티티(`0x0325` + PLAYER_INFO 링크 + own cell) | **예** (유일 경로) | P0 |
| 추가 게이트: 3-way id 매칭 + own cell write + turn-ready | **AND 조건 전부 필요** | 매칭=P0 / cell write·turn-ready=P2 |

→ **답: 별도 unit 엔티티 경로만이 함대를 만든다. 오브젝트테이블은 성계 마커 + 항행 배경 전용.**

---

## 2. 서버 수정안 (B)

기준 파일: `src/server/logh7-login-protocol.mjs` (`buildStrategicGalaxyGrid` @808,
`buildStaticInformationGridTypeInner` @637) · `src/server/logh7-login-session.mjs`
(`strategicGalaxyGridInners` @619, 0x0f02 emit @1034, `localFleetRecord` @804).

### 2.1 진단: 현재 서버가 틀린 곳

`buildStrategicGalaxyGrid`(@873-881)은 함대를 **오브젝트테이블 + 셀그리드에 klass:3 마커**로 박는다:

```js
if (fleetCell) {
  objects.push({ value: fleetValue, contentId: safeMarkerContentId(fleetContentId, 3), klass: 3, variant: 0 });
  const { col, row } = placeCell(fleetCell.col, fleetCell.row);
  cells.push({ col, row, value: fleetValue });   // ← 셀에 fleetValue=3 박음 = 성계 마커로 오인
}
```

§1.1에서 확정했듯 klass:3 마커는 **성계 점**이지 함대가 아니다. 이 레코드는 함대를 못 만든다.
(다행히 `0x0325` unit + `0x0323` char + `0x0204`는 세션이 이미 emit 중 — `logh7-login-session.mjs:1034/1044`,
begin↔end 재전송 `:1202`. 함대 마커만 잘못된 채널에 추가로 박혀 있는 상태.)

### 2.2 변경점 1 — `buildStrategicGalaxyGrid`: 오브젝트테이블에서 함대 마커 제거

**오브젝트테이블/셀그리드에 `fleetValue` 레코드를 넣는 로직(@873-881)을 삭제**한다. 함대는 이 채널로 못
그려지고, klass:3 마커는 성계 인덱스를 오염(`FUN_004c8bc0` 스캐터 슬롯 중복)시킬 뿐이다.
오브젝트테이블에는 **성계 마커(klass:3)와 지형(klass 1=빈공간/blocked)만** 둔다.

```diff
-  if (fleetCell) {
-    objects.push({ value: fleetValue, contentId: safeMarkerContentId(fleetContentId, 3), klass: 3, variant: 0 });
-    const { col, row } = placeCell(fleetCell.col, fleetCell.row);
-    cells.push({ col, row, value: fleetValue });
-  }
+  // 함대는 0x0313/0x0315 오브젝트테이블로 렌더되지 않는다(클라에 '함대' 오브젝트 클래스 없음 —
+  // byte1∈{1=빈공간,3=성계마커}만 유효, docs/logh7-fleet-render-re.md §1.1). 함대 마커를 셀그리드에
+  // 박으면 성계 인덱스로 오인된다. 함대 셀은 '항행 가능한 빈 공간'이기만 하면 되므로 별도 레코드를
+  // 추가하지 않는다. 함대 가시화는 0x0325 unit + PLAYER_INFO 링크 경로(세션 측)가 담당.
```

단, 함대가 놓일 셀이 **항행 가능(byte1=1)** 이어야 하므로 `terrain` 인코더(@882-918)는 함대 home cell이
`mask`(SPACE, class 1)에 포함되도록 보장한다(이미 capital cell이 passable mask에 들어가면 OK).
`fleetValue`/`fleetContentId` 파라미터는 **시그니처에서 deprecated 처리**(호출자 정리 후 제거)한다.

`buildStaticInformationGridTypeInner`(@637) 자체는 **바이트 정확하므로 변경 불필요** — count = `max(value)+1`,
레코드 `1 + value*3`에 `(byte0=contentId, byte1=klass, byte2=variant)` 직렬화는 클라 파서(0x00413050)와
정합. 바뀌는 건 "함대 오브젝트를 더 이상 push하지 않는다"는 호출자(`buildStrategicGalaxyGrid`)뿐.

### 2.3 변경점 2 — 세션: `0x0325` unit의 cell 필드를 own cell과 동기화

`localFleetRecord`(`logh7-login-session.mjs:804`)는 이미 `cell: fleetCellId()`(= `row*100+col`)와
`commander`/`owner`/`mapSection`을 채운다. unit 레코드의 **cell 슬롯(0x58 element의 `CELL=0x0c`)** 이
own-fleet cell의 후보 소스다. `LOGH_PLAYER_FOCUS_CELL=1`일 때 `commander`(element+0x08)에 cell을 싣는
실험(@807-813)이 바로 own cell 시드 시도 — 이걸 **기본 ON 후보**로 승격하되, 결정은 라이브로(§4).

핵심: **함대 마커를 오브젝트테이블에서 빼도 `0x0325`/`0x0323`/`0x0204` 경로는 그대로 유지**되어야 한다
(이미 emit 중). 즉 §2.2는 "잘못된 추가 레코드 제거"이고, 함대 데이터는 §2.3 unit 경로가 이미 보낸다.

### 2.4 변경점 3 (조건부) — own cell write 보강

§1.3에서 own cell `+0x11178`에 서버가 직접 닿는 와이어가 RE로 확정되지 않았다. 후보:
- `0x0325` element의 cell/commander 슬롯이 `FUN_004c2c80(mode=1)` 또는 후속 핸들러에서 `+0x11178`로
  흐르는지 → **라이브 Frida watchpoint로 확정**(§4). 흐른다면 §2.3만으로 충분.
- 흐르지 않으면 own cell은 "클릭 선택 입력"이 셋하는 구조 → 서버 수정으로 닿지 못하고, 별도 EXE 패치
  (초기 own cell = 함대 home cell 주입) 또는 입력 시퀀스 재현이 필요(logh7-patch 경로).

### 2.5 변경점 4 (조건부) — turn-ready 신호

§1.4 turn-ready(`FUN_004b8950`)를 켜는 메시지가 미확정(후보 `0x356` NotifyInformationCharacter / `0xb0d`
NotifySearch). 라이브에서 함대가 보이는데 **렌더가 한 틱도 안 도는** 증상이면 이 신호 발신이 추가로 필요.
이건 §4 후속 RE 항목.

---

## 3. 검증법 (C) — 라이브

기준: `tools/logh7_ui_explorer.py` (skill `logh7-live`). ⚠️ BOTHTEC 스플래시 ~30초 대기, stale node 선kill.

1. **준비**: 기존 node kill → `ui_explorer start`(login 서버 + 클라). 환경:
   `LOGH_AUTHORITATIVE=1 LOGH_STRAT_GALAXY=1`, 함대 unit 경로 활성(`fullUnitLocation`),
   own cell 시드 실험 토글 `LOGH_PLAYER_FOCUS_CELL=1`.
2. **월드 진입**: 새 캐릭 → 진영선택 → 8단계폼 완주 → 세션 연결 → world load. 스플래시·NOW LOADING
   타이밍(코드 아닌 ~30초 대기) 준수.
3. **trace**: `0x0204`→`0x0325`→`0x0323`가 0x0f02 push에 나가는지, 0xb09 후 begin↔end 재전송되는지 확인.
4. **검증 A (함대 아이콘 가시)**: 전략맵 스크린샷. 함대 home cell(capital)에 **함선 아이콘**이 보이는가?
   - 보이면 → §2.2 제거 + unit 경로가 함대 엔티티를 만든 것. (klass:3 마커 제거 전후 비교로 마커가
     성계 점이었음을 교차 확인.)
   - 안 보이면 → own cell(`+0x11178`) 미설정(§1.3) 또는 turn-ready 미충족(§1.4). Frida로
     `DAT_007cd04c+0x11178` watchpoint(누가 쓰는지) + `FUN_004fef90` "Waiting" 로그 확인.
5. **검증 B (클릭 선택)**: 함대 아이콘 셀 클릭 → 선택 하이라이트(원형 커서) 켜지는가?
   `FUN_004d68d0`(byte1==3 게이트)·`FUN_004d6480`(own cell 커서 쿼드)·`FUN_004c7290`(PLAYER_INFO 매칭) 경로.
6. **검증 C (moveHandler)**: 선택 후 인접 항행 셀 클릭 → `0x0b01`(CommandMoveShip 전략) 송신 발생?
   선행 라이브에서 "moveHandler 0회"였음 — own cell이 셋되어야 navGate(`FUN_004d6310`)가 통과하고
   이동 명령이 나간다. trace에서 클라→서버 `0x0b01` 카운트로 확정.

각 단계는 P0/P1/P2 태깅 + 스크린샷/trace 증거 첨부. 클라이언트 변경 없이(서버만) 검증 A/B까지 도달이
목표; 안 되면 §4 후속(EXE 패치/추가 RE)로 분기.

---

## 4. 불확실분 (D)

| # | 항목 | 상태 | 확정 방법 |
|---|---|---|---|
| U1 | own-fleet cell `+0x11178`를 **누가/언제 쓰는가** (디컴파일에 WRITE 0건) | **P2 미확정** | Frida 메모리 write watchpoint(`DAT_007cd04c+0x11178`) — world-entry/클릭 중 누가 쓰는지 캡처 |
| U2 | `0x0325` unit element의 cell/commander 슬롯이 own cell로 **흐르는지** | P2 | U1 watchpoint와 동시에, `LOGH_PLAYER_FOCUS_CELL` ON/OFF 차분 관찰 |
| U3 | turn-ready(`FUN_004b8950`)를 켜는 **와이어 메시지** (후보 0x356/0xb0d) | P2 | `FUN_004fef90` "Waiting" 로그 모니터 + 후보 메시지 발신 차분 |
| U4 | `0x58` unit element 중간 필드의 **값 의미**(commander/supply/owner 슬롯) | P3 | dump-label 시리얼라이저가 서버측이라 클라 export에 없음 — 라이브 차분으로만 |
| U5 | 함대 home cell이 `terrain` 인코더의 SPACE(byte1=1) 마스크에 **항상 포함되는지** | P1 | capital cell이 `galaxy-passable-cells.json` 마스크 안인지 데이터 점검 (서버측, 즉시 확인 가능) |

**핵심 미해결:** U1(own cell 라이터)이 가장 결정적. 이게 "클릭 입력이 셋"이면 서버만으로는 함대 첫
가시화 후 자동 선택이 불가하고 EXE 패치가 필요할 수 있다. 단 §2.2(잘못된 마커 제거) + §2.3(unit 경로
유지)은 U1 결과와 무관하게 **지금 적용해도 안전한 정방향 수정**이다(현재의 성계-오인 마커를 없앨 뿐,
이미 검증된 world-load 바이트는 건드리지 않음).

---

## 부록: 본 세션 redex 직접 재확인 목록

`FUN_004c8b70`(셀→오브젝트 ×3 간접), `FUN_004d6310`(navGate byte1∈{1,3}), `FUN_004d3a40`+`FUN_004c8c90`
(byte1==3 → group-0x18 성계 라벨), `FUN_004c2a80`(3-way 매칭: char.id==selectedChar @0x3584a0,
char[9]@0x24 flagship==unit.id @0x41a368, → `FUN_004c2c80(0,…)`), `FUN_004c2c80`(PLAYER_INFO 슬롯 stride
0x370 복사, `+0x11178` 미기록), `FUN_004c7290`(PLAYER_INFO 워크 stride 0x370, 미스시 0), `FUN_004b7890`
(=`FUN_004b8950()!=0` turn-ready), `+0x11178` 소비자 8함수·write 0건, `0x41a368` 소비자 3함수.
서버 ground truth: `buildStrategicGalaxyGrid` @808 / `buildStaticInformationGridTypeInner` @637 /
`buildStaticInformationGridInner` @560 / 세션 emit @1034·1044·1202 / `localFleetRecord` @804.

---

## 5. 라이브 Frida 확정 (2026-06-20) — §1.3 근본원인 정정

`tools/logh7_frida_movemode_probe.py`에 렌더-게이트 훅(turnReady/recvQueueScan/fleetRender/slotResolver/
renderGate + own_cell write-watch)을 추가해 캐논 월드 진입 클라(playable.exe)에 attach, 25초 기준선 관측. **결과가 §4의
"turn-ready 게이트가 닫혀 함대 미렌더(가설①)" 추정을 반증하고 진짜 메커니즘을 확정했다.**

### 5.1 라이브 관측 (P0, Frida 직접)
- **turnReady(FUN_004b7890) ret = 1** — 게이트 **열림**. 가설①(turn-ready 닫힘→전 렌더 스킵) **반증**.
- **renderGate(FUN_004fef90) fsmState = 1 고정** — 전략 렌더 FSM이 **상태 1(case1)** 에 머문다. (HUD가
  보이는 이유: case1 = FUN_0058ee70 HUD 렌더 = 메인 전략 루프.)
- **fleetRender(FUN_0058d140) 히트 0** — own-fleet 렌더 함수가 관측 내내 **호출 안 됨**.
- recvQueueScan(FUN_004b8950) ret=1, active=0 (큐 비어도 1 반환). slotResolver(FUN_004c7290) id=0x2 → miss=false.
- own_cell(+0x11178) write-watch armed(런타임 0xf5f6a90) — 기준선(무입력) 중 **write 0회**.

### 5.2 FSM 구조 (redex FUN_004fef90 디컴파일)
`switch(*(param_1+4))`(FSM 상태): **case0 = FUN_0058d140(own-fleet 렌더) → 실행 후 상태=1로 advance**(한 번만).
case1 = FUN_0058ee70(HUD) = 메인 루프(입력 대기, FUN_004f90d0()==2|4일 때만 이탈). case3 = 상태=0 리셋.

### 5.3 확정된 근본원인
함대 렌더(case0)는 **init 1회성**이다(상태 0→1 advance). FSM은 정상적으로 메인 루프(상태1, HUD)에 머문다.
그 init 1회 렌더 순간 **own_cell(+0x11178)이 미설정(0)**이면 함대가 셀(0,0)/무가시로 그려지고, FSM이 상태1에
머무는 한 case0이 재실행되지 않아 **영영 갱신되지 않는다**. → "함대 안 보임"의 메커니즘 = **turn-ready 아님 /
own_cell 미설정 + 함대 렌더의 1회성**. (turn-ready·PLAYER_INFO 슬롯·렌더 게이트는 모두 정상.)

### 5.4 다음 (미해결 — own_cell write 경로)
- own_cell(+0x11178)은 정적 WRITE 0 + 라이브 기준선 write 0 → **클릭/선택 입력 또는 스폰 경로에서만 set**될
  가능성. **드라이브 관측 필요**: 맵에서 함대 위치를 클릭했을 때 own_cell write가 발생하는지 + 그때 case0이
  재실행되는지(FUN_004fd560/4fd7a0 클릭→셀 체인). writer 잡히면 backtrace로 함수 VA 확정.
- 후보 픽스: (a) 클라 패치로 spawn 시 own_cell을 player 시작셀로 set, 또는 (b) case0을 메인 루프에서 주기
  재진입시켜 own_cell 갱신 반영. 둘 다 클라 바이너리 작업(logh7-patch).
- ⚠️ 이동모드 입력 게이트(DAT_02214325 &0x40)는 기준선에서 0 — 별도 드라이브 관측 대상(0x0b01 트랙).

## 6. 라이브 픽스 (2026-06-20) — strat-camera-focus가 playable 스택에 누락돼 있었음

§5에서 "own_cell 미설정"이 §1.3 원인으로 확정됐는데, **own_cell을 set하는 패치(strat-camera-focus,
FUN_004c4170 detour→cave 0x5d5290, *(src+0x320)==0일 때 home cell 0x9f6=셀(50,25)을 +0x11178에 write +
카메라 센터링)가 이미 존재**하나 **playable.exe 기본 스택([menufix,dlgfix,earlygrid-ringclear])에서 빠져
있었다.** 그래서 오늘 playable.exe 라이브 관측에서 own_cell write 0 + 함대/그리드 미가시였다.

### 6.1 라이브 검증 (fleetfix EXE = playable + strat-camera-focus)
빌드 후 캐논 월드 진입: **전략 섹터 그리드가 렌더되고 카메라가 홈셀로 센터링**(미포함 빌드는 검은 성운만).
부팅→월드→안정, stop 시 SHA 복원 OK. strat-camera-focus의 needsLive(static detour end-to-end)를 충족.
→ **DEFAULT_STACK에 strat-camera-focus 추가**(tools/logh7_build_playable_client.py), playable.exe 재빌드.

### 6.2 잔여 — own-fleet 스프라이트(case0) 1회성 타이밍
Frida상 own_cell set 후에도 fleetRender(FUN_0058d140, case0) 히트 0 / FSM 상태 1 고정(case0는 init 1회성).
own_cell이 case0의 init 렌더 시점에 이미 set돼 있어야 스프라이트가 정확히 배치된다. strat-camera-focus는
카메라 센터링(전략맵 가시화)은 해결하나, own-fleet **아이콘** 자체의 정확 배치는 case0 타이밍에 의존.
다음: own_cell을 **spawn(FUN_004c2a80 @0x4c2b72, grid-enter)** 에서 unit.cell(piVar4[3]@0x0c)로 set하는
패치(설계+바이트검증 완료, 단 cave 0x5d5290를 strat-camera-focus와 공유 → cave 병합 또는 별도 cave 필요).
