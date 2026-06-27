> ⚠️ **검증 결과: 핵심 명제 반증(FAIL). 권장 레시피 NO-GO.** 이 문서의 개별 함수 디컴파일 인용은 대체로 정확하나, "큐 정체성" 결론이 잘못된 `this`(ecx) 식별(`DAT_007ccffc` 가정)에 기반해 뒤집혔다. 실제 enqueue/consume의 this는 `DAT_02215e2c`(활성씬)다. 정정 전문: **`docs/logh7-c002-verifier-refutation-2026-06-22.md`** 를 반드시 함께 읽을 것. 아래 본문은 maker 1차 분석으로 보존하되, 큐 정체성/레시피 부분은 정정 문서가 우선한다.

# C002 메커니즘 함수레벨 완결 — event-9 enqueue→dequeue→consume 체인 (2026-06-22, maker 1차·일부 반증됨)

대상: LOGH VII 실클라 `G7MTClient.exe` (Ghidra full-decompile 인덱스 `.omo/ghidra/export/G7MTClient`).
목표: 전략맵 클릭으로 자연 0x0b01이 발생하지 않는 C002 블로커를 디컴파일 함수레벨로 완결하고, 증거기반 언블록 레시피를 도출.

신뢰도 표기 규약:
- **P0-decompile**: 이 문서의 함수 디컴파일에서 직접 읽은 사실.
- **P1-decompile-inferred**: 디컴파일에서 강하게 함의되나 한 단계 추론이 들어간 것.
- **P3-inferred**: 정적 RE만으로 단정 못 하며 라이브로 확인해야 하는 추론.

---

## 0. 한 줄 결론 (P1)

event-9 **enqueue 큐**(`DAT_007ccffc` 전략클라이언트 객체의 한 widget)와 event-9 **dequeue/소비 큐**(매프레임 GUI 입력워커 `FUN_0050c750`가 순회하는 **활성씬 윈도우** `*(DAT_02215e2c+0xc)`의 widget 배열, category {0,2,1,3,4})는 **물리적으로 다른 객체**다. enqueue는 전략클라 mode2 경로(`FUN_004fef90`)에서, 클릭확정 dequeue 래치(`FUN_00507f20` → `+0xb01/+0xb02`)는 활성씬 입력워커 경로에서 일어나므로, **enqueue된 event-9가 dequeue 순회 대상에 들어가지 못한다.** 이것이 "쌓이지만 안 빠진다(b01=0)"의 함수레벨 근본이다.

단, mode0 소비처(`FUN_0050d230`)는 enqueue와 **동일 객체**(둘 다 `FUN_00502780(cat=0,idx=0)` = 전략클라 widget)에서 event-9를 polling하므로, 같은 객체 안에서의 mode0/mode2 배타가 또 하나의 게이트로 겹쳐 있다(아래 Q2).

---

## 1. 함수별 분석 (purpose / 매개변수 / 큐 base 오프셋)

### 1.1 `FUN_00501e30` — event enqueue 프리미티브 (P0)

```
void FUN_00501e30(undefined4 param_1, int param_2, undefined4 *param_3)
```
- `param_1` = event id (예: 9), `param_2` = **큐를 담는 widget base 포인터**, `param_3` = 13워드(0x34바이트) 페이로드(널 가능).
- 게이트: `FUN_00502770()` 결과 `+0x34`가 0이 아니면 **아무 것도 안 함**(early return). → 이 게이트는 전역 입력억제 플래그.
- 큐 레이아웃 (모두 `param_2` 기준 오프셋):
  - `+0x3f4` : **큐 길이(count)**. 0x1c(28) 초과면 overflow 로그 후 return → 최대 29슬롯.
  - `+0x470 + count*4` : event id 슬롯 (이 자리에 param_1=9 저장).
  - `+0x3f8 + count*4` : 보조 워드(`+0x3f0` 값 복사).
  - `+0x4e8 + count*0x34` : 13워드 페이로드 블록.
  - 마지막에 `+0x3f4`(count) +1.

### 1.2 `FUN_00501ed0` — event dequeue 프리미티브 (P0)

```
uint FUN_00501ed0(int param_1, int param_2, undefined4 *param_3, char param_4)
```
- `param_1` = **큐 widget base**, `param_2` = 찾을 event id, `param_3` = 페이로드 수신버퍼(널 가능), `param_4` = "peek 플래그"(1=제거 안 함, 0=제거).
- 동작: `+0x470`부터 count(`+0x3f4`)개를 선형 탐색해 `*piVar3 == param_2`(event id 일치)인 슬롯을 찾음. 찾으면 페이로드 복사, `param_4==0`이면 뒤 슬롯들을 한 칸씩 당겨(`+0x3f8`/`+0x4e8` 둘 다) 제거하고 count -1, **true** 반환. 없으면 false.
- **큐 base 오프셋(+0x3f4 count, +0x470 id, +0x4e8 payload)이 enqueue와 100% 동일** → enqueue/dequeue 프리미티브는 같은 큐 포맷을 읽고 쓴다. **문제는 누가 어느 base를 넘기느냐다(Q1).**

### 1.3 `FUN_005024a0`, `FUN_005025c0` — 게이트 (P0)

```
undefined1 FUN_005024a0(int param_1) { return *(undefined1*)(param_1+5); }      // widget+5
undefined1 FUN_005025c0(int param_1) { if (*(char*)(param_1+8)!=0) return *(undefined1*)(param_1+0x15); ... return 0; }
```
- `FUN_005024a0` = widget `+5` 바이트 반환 = **"가시/활성(gate05)" 플래그**. (메모리의 gate05와 동일 — 이미 라이브에서 1=통과 확인됨.)
- `FUN_005025c0` = widget `+8`(생성됨)이 참이면 `+0x15` 바이트 반환 = **"입력 수용 가능" 플래그**. `+8`이 0이면 에러로그+0 반환.
- 둘 다 **단순 멤버 게이트**일 뿐, 어떤 큐를 검사하지는 않는다. `FUN_005015f0`/`FUN_00507f20`가 event 처리 전 이 두 게이트를 본다.

### 1.4 `FUN_005015f0` — event poll (P0, code 9 경로 정밀)

```
bool __thiscall FUN_005015f0(undefined4 *param_1 /*ecx*/, int param_2 /*event id*/, int param_3 /*widget base*/, undefined4 *param_4 /*out payload*/, uint param_5 /*peek flag*/)
```
주: 디컴파일 시그니처는 `(param_1,param_2,param_3,param_4,param_5)`지만 thiscall이라 ecx=param_1=widget이고, 호출부(`FUN_005015f0(9, widgetbase, out)`)는 `(eventid, widgetbase, out)` 순으로 들어간다. 본문에서 `param_2`=event id, `param_3`=두 번째 widget 인자로 쓰임에 주의(디컴파일 변수 재사용으로 혼란스러움).

- 첫 동작: `FUN_00501ed0(param_3, param_2, param_4, param_5)` 호출(=위 dequeue 프리미티브로 **큐에 해당 event가 있는지 peek/pop**). 있으면 곧장 true.
- 없으면 `FUN_005024a0`/`FUN_005025c0`(gate05/입력수용) 통과 후, 마우스/엣지/히트테스트(`FUN_00500820/00500870/005008e0/005025f0`)로 **실시간 입력상태**를 합성.
- **code 9 경로 (case 9, LAB_0050198d):**
  ```
  case 9:
    iVar2 = DAT_022142b0;  iVar3 = DAT_022142b4;
    if (iVar2 == iVar3) return false;   // 변화 없으면 false
    bVar6 = (iVar2 == 0);               // 눌림상태 판정
  ```
  → code 9는 `DAT_022142b0`(현재 마우스 버튼/엣지 상태)와 `DAT_022142b4`(직전값) 비교 = **마우스 좌클릭 엣지 이벤트**. 이게 핵심 "클릭" 신호다.
- 참고: case 10(0xa)은 `return *(char*)(iVar2+0xb02) != 0;` = **+0xb02 클릭확정 비트 읽기**. 즉 +0xb02는 이 함수가 폴링하는 widget의 멤버.

### 1.5 `FUN_004c2a80` — 0x0b0a mode2/mode0 핸들러가 `(1)`로 호출 (P0)

```
void __thiscall FUN_004c2a80(int param_1 /*ecx=DAT_007ccffc*/, char param_2)
```
- `param_2 == '\0'`: **대규모 zero-fill 리셋** — `+0xc`부터 0x203a0워드, `+0x811fc`부터 800, `+0x126718`부터 0x5fc77워드, `+0x2a58f8`부터 0x6959워드 등 전략씬 버퍼 전체 초기화. (=그리드 떠날 때 호출되는 teardown.)
- `param_2 == 1`(0x0b0a가 부르는 값): zero-fill **건너뛰고**, `+0x36a5dc`(유닛 수)만큼 `+0x36a8b4` stride 0xb5 배열을 순회하며 `+0x3584a0`(선택 char-id)과 비교 → 일치하면 `FUN_004c2c80(0,..)`(focus), 불일치면 `FUN_004c2c80(2,..)`. 즉 **그리드 진입 완료 시 함대/유닛을 씬에 배치·표시**하는 핸들러. (param_2=1은 "표시만, 리셋 없음".)
- **이 함수 자체는 event-9 enqueue/dequeue를 직접 만지지 않는다.** 단, mode2 && `+0x4376ec==0`일 때만 불리며(아래 Q3), 이 호출이 곧 "전략 그리드가 자연 진입 완료됨"의 신호다. 메모리의 "+4376ec=0xb09 value byte0" 직관과 정합.

### 1.6 `FUN_00502780` — widget(target) base 리졸버 (P0, 큐 정체성의 열쇠)

```
int __thiscall FUN_00502780(int param_1 /*ecx=this widget-table*/, int category, int index)
```
category별로 **다른 base**를 돌려준다:
- `cat 0` → `this + 0x38` (idx 0/1만 유효) — 메인/단일 widget.
- `cat 1` → `FUN_00507bf0(idx)` = `this+0x30` 기준 `0x28ca2c + tbl[idx]*0xf18` (idx ≤ 0x77).
- `cat 2` → `FUN_00507ba0(idx)` = `this+0x30` 기준 `0x6e4 + tbl[idx]*0xd04` (idx ≤ 0x95).
- `cat 3` → `this + 0x1304 + idx*0xd24` (idx ≤ 7).
- `cat 4` → `this + 0x7c24 + idx*0x3f50` (idx ≤ 1).
- **default(그 외, 0xa 포함) → 에러로그 후 0 반환.** ★ cat=0xa는 유효 카테고리가 아니다.

`FUN_005028d0(category)`가 각 cat의 widget 개수를 돌려준다: cat0=1, cat1=`+0x1120`, cat2=`+0xec4`, cat3=8, cat4=2.

> ★ 디컴파일 주의: `FUN_004fef90` case0의 enqueue 셋업이 `pcStack_58=0xa, pcStack_5c=1`로 보이지만, `cat=0xa`는 `FUN_00502780` default(0 반환)라 정상 enqueue가 불가능하다. 이는 **디컴파일러의 스택슬롯 재사용 아티팩트**(직전 `FUN_0050cf40(0xa,..)`/`FUN_0050cf40(0x9,..)` 인자가 같은 슬롯에 겹쳐 보임)일 가능성이 높다(P1). mode0 소비처 `FUN_0050d230`와 GUI 폴러 `FUN_004f6f60`는 모두 명확히 `FUN_00502780(0,0)`(cat0)을 쓴다. → enqueue도 **cat0(전략클라 `this+0x38`)** 일 개연성이 가장 높다(P1, 라이브로 확정 필요).

### 1.7 `FUN_004fef90` — mode2 event-9 enqueue (전략 시퀀스 state machine) (P0)

```
void __fastcall FUN_004fef90(int param_1)   // param_1 = "M_FrameMoveTactics" 컨텍스트
```
- `DAT_007ccffc`(전략클라) 존재 + `**(DAT_007ccffc+8)`(이름) 비어있지 않음 체크.
- `FUN_004b7890()`(=`FUN_004b8950` StrategySequence Ready) 거짓이면 `DAT_02213e90=0` 후 return("STRATEGY SEQUENCE Waiting"). 참이면 `DAT_02213e90=1`("Ready").
- state 분기는 `*(param_1+4)`:
  - **case 0 (Init/Update):** `FUN_004c8a90()`, `DAT_00c9e2e0=='\0'`이면 `FUN_004f9030()`(task 자체생성), … 그리고 끝에서:
    ```
    FUN_0050cf40(...);                    // widget 인덱싱
    base = FUN_00502780(...);             // ★ enqueue 대상 widget (cat 모호, P1=cat0)
    FUN_00501e30(0 /*payload null*/, base, 9 /*event id*/);  // ★ event-9 ENQUEUE
    *(param_1+4) = 1;                     // state 0→1
    ```
    → **event-9는 오직 case 0에서만 enqueue된다.** (메모리 "case0만 enqueue"와 정합.)
  - **case 1:** 수신 폴링(`FUN_005015f0(0x16,..)` → 0x356 NotifyInformationCharacter / 0xb0d NotifySearch 처리), 렌더, 끝에서 `FUN_004f90d0()` 반환값이 2/4면 `LAB_004ff291: *(param_1+4)=0`(state0 복귀=재-enqueue), 5면 case3로 폴스루. 그 외엔 state1 유지.
  - **case 3:** `*DAT_007ccffc=1; *(DAT_007ccffc+4)=2; *(param_1+4)=0`.
  - **case 2 / case 4:** UI 갱신(`FUN_005015f0(0xe,..)` 등) / GetID 루프.
- 즉 정상 흐름은 **case0(enqueue+task생성) → case1(대기/수신) → (조건 충족 시) state0 복귀 → 다시 case0 enqueue** 의 ring. case0를 한 번도 안 거치면 event-9는 영원히 안 쌓인다.

### 1.8 `FUN_0050d230` — mode0 event-9 소비처 (P0)

```
void __fastcall FUN_0050d230(int param_1)
```
- `DAT_007ccffc` 및 `DAT_007ccffc[0x126718]`(mode0 씬 활성) 체크 → 0이면 return.
- 선택유닛(`FUN_004c7fc0`) 확보, `FUN_004b7890`(Ready) 확인.
- **event-9 소비:**
  ```
  base = FUN_00502780(0,0);              // ★ cat0 = 전략클라 this+0x38
  cVar7 = FUN_005015f0(9, base, &local_1cc);   // ★ event-9 POLL(=dequeue via FUN_00501ed0)
  if (cVar7 && (FUN_004ef910(...) 좌표→타깃)) DAT_007ca550 = ...;
  ```
  → mode0 소비처가 polling하는 widget base = **`FUN_00502780(0,0)` = enqueue 대상과 동일 cat0**.
- 이후 `switch(*(param_1+4))`로 카메라/포커스/그리드 상태 갱신(case 0.0 등 대량 DAT_0221xxxx 리셋).

### 1.9 `FUN_00507f20` — event-9 dequeue / 클릭확정 래치 (P0)

```
void __thiscall FUN_00507f20(int param_1 /*scene*/, int *param_2 /*widget base*/)
```
- 진입조건 `(char)param_2[2] != 0`(widget+8 활성).
- 매 호출 **`*(param_2 + 0xb02) = 0` 으로 클릭확정 비트 클리어**.
- gate05(`FUN_005024a0`) && 입력수용(`FUN_005025c0`) 통과 시:
  ```
  cVar1 = FUN_005015f0(9, param_2, local_50, 1 /*peek*/);   // event-9 peek
  if (cVar1) { param_2->[0xb01]=1; param_2->[0xb02]=1; }    // ★ event-9 있으면 클릭확정!
  else {
    if (DAT_022142b0==DAT_022142b4 && DAT_022142b0!=0) {     // 버튼 유지중
      if (param_2->[0xb01]) param_2->[0xb02]=1;
    } else {
      cVar1 = FUN_005015f0(0xb, param_2, local_50, 0);       // event-0xb(릴리즈)
      if (cVar1 && param_2->[0xb01]) { param_2->[0xb01]=0; param_2->[0x2c0]=1; }
    }
  }
  ```
  → **+0xb01(눌림 래치) / +0xb02(클릭확정)** 는 `param_2`(=이 함수가 받은 widget base)의 멤버다. event-9가 `param_2` 큐에 있어야만 +0xb01/+0xb02가 켜진다.
- 호출자 = `FUN_00507b10`(아래) → `param_2 = FUN_00502780(cat∈{0,2,1,3,4}, idx)`.

### 1.10 `FUN_00507b10` — 클릭확정 dequeue 순회 루프 (P0, 큐 정체성 결정)

```
void FUN_00507b10(void)   // this = ecx (widget-table)
  cats = {0, 2, 1, 3, 4};                  // ★ category 0xa는 없음
  for cat in cats:
    n = FUN_005028d0(cat);                  // 해당 cat widget 개수
    for idx in 0..n:
      base = FUN_00502780(cat, idx);
      FUN_00507f20(base);                   // 각 widget에 대해 클릭확정 래치
```
- **dequeue/클릭확정은 category {0,2,1,3,4}의 모든 widget**에 대해 돈다(cat0 포함!).
- **그러나 이 `this`(widget-table)가 무엇이냐가 관건** → 아래 1.11.

### 1.11 호출 컨텍스트 — enqueue vs dequeue가 **다른 객체** (P0/P1)

매프레임 틱 `FUN_004e96f0`:
```
if (DAT_007ccffc != 0) {
  FUN_004b68a0();
  FUN_00500580(active_window);
  if (*(int*)(DAT_02215e2c + 0xc) != 0) {     // 활성씬 root 존재
    DAT_007ca540 = 0;
    FUN_0050c750();                           // (A) 클릭확정 dequeue 워커
  }
  FUN_004b68f0();                             // (B) 전략클라 mode 디스패처
}
```

(A) `FUN_0050c750(param_1)`:
```
piVar5 = param_1 + 0x1d0;       // param_1 = *(DAT_02215e2c+0xc) 활성씬 윈도우
for 0x73 entries:
  if active: if FUN_005024a0()==0 FUN_00502510() else FUN_00507b10();
```
- **param_1 = 활성씬 윈도우(`DAT_02215e2c+0xc`가 가리키는 root).** `FUN_0050c750`/`FUN_00507b10`은 **`DAT_007ccffc`를 한 번도 참조하지 않는다**(grep 확인). 즉 클릭확정 루프의 widget-table `this` = **활성씬 윈도우**.

(B) `FUN_004b68f0(DAT_007ccffc)` = mode 디스패처. mode byte = `DAT_007ccffc + 0x126711`:
- `== '\0'` (mode0) & `+0x126718 != 0`: `FUN_004f6f60(); FUN_005266e0(); FUN_0050d230(); ...` → **event-9 소비**(전략클라 cat0).
- `== '\x02'` (mode2) & `+0x2a58f8 != 0`: `FUN_004f6f60(); FUN_005266e0(); FUN_004fef90(); FUN_0050cf10();` → **event-9 enqueue**(전략클라).
- `== '\x01'` (mode1): 에러.

★ **결론: enqueue(`FUN_004fef90`)와 mode0 소비(`FUN_0050d230`)는 `DAT_007ccffc`(전략클라) 위에서, 클릭확정 dequeue(`FUN_00507f20`+0xb01/+0xb02)는 활성씬 윈도우(`DAT_02215e2c+0xc`) 위에서 돈다. 두 widget-table는 서로 다른 객체다(P0: 코드가 서로 다른 base를 참조).** 같은 `FUN_00502780(0,0)` 호출이라도 ecx(this)가 다르므로 다른 메모리.

---

## 2. 핵심 질문 4개 답변

### Q1. enqueue 큐와 dequeue/consume 큐가 물리적으로 같은 객체인가?

**부분적으로만 같다 — 두 종류의 소비가 있고 정체성이 갈린다.** (P0)

| 경로 | 함수 | widget-table this | 큐 base |
|---|---|---|---|
| enqueue | `FUN_004fef90`(mode2) | `DAT_007ccffc` 전략클라 | `FUN_00502780(cat?,..)` (P1=cat0 `this+0x38`) |
| mode0 consume | `FUN_0050d230`(mode0) | `DAT_007ccffc` 전략클라 | `FUN_00502780(0,0)` = `this+0x38` |
| 클릭확정 dequeue | `FUN_00507f20`←`FUN_00507b10`←`FUN_0050c750` | **활성씬 윈도우** `*(DAT_02215e2c+0xc)` | `FUN_00502780(cat∈{0,2,1,3,4},idx)` |

- enqueue ↔ mode0 consume: **같은 `DAT_007ccffc` 객체의 같은 cat0 widget** → 큐 동일(P1, cat 확정은 라이브 필요).
- enqueue ↔ **클릭확정 dequeue(+0xb01/+0xb02)**: **다른 객체**(전략클라 vs 활성씬 윈도우) → **큐가 다르다(P0).** 이것이 메모리의 "enqueue widget≠dequeue widget" 가설을 **디컴파일로 확정**한 부분. event-9를 전략클라에 쌓아도, +0xb02를 켜는 루프는 활성씬 윈도우의 cat0 widget을 보므로 영원히 켜지지 않는다.

### Q2. mode0/mode2 배타가 event-9를 가두는 정확한 조건은?

(P0) `FUN_004b68f0`에서 `DAT_007ccffc + 0x126711` mode byte:
- mode byte == 2 → `FUN_004fef90`만 호출(enqueue), `FUN_0050d230`(consume) 안 불림.
- mode byte == 0 → `FUN_0050d230`만 호출(consume), `FUN_004fef90`(enqueue) 안 불림.
- 추가 게이트: mode0은 `+0x126718 != 0`, mode2는 `+0x2a58f8 != 0` 이어야 해당 본문 실행.

→ **전략맵에서 mode가 2로 고정**돼 있으면 enqueue만 매프레임 일어나고 같은 객체 안의 mode0 consume(`FUN_0050d230`)은 절대 안 돈다(전략클라 cat0 큐에 event-9가 쌓이기만 함). 그리고 Q1에서 본 대로 활성씬 윈도우의 dequeue 루프는 다른 객체라 +0xb02를 못 켠다 → **이중 게이트로 클릭이 막힌다.**

(P3) 전략맵에서 클릭이 "자연스럽게 mode2→mode0 전환(또는 동일 mode 안에서 소비)"을 일으키려면:
- mode byte(`+0x126711`)를 2→0으로 바꾸는 정식 경로가 있어야 한다. 디컴파일상 mode byte를 쓰는 곳은 0x0b0a 핸들러(아래 Q3)와 teardown 계열이다. **클릭→mode전환 트리거가 디컴파일에서 직접 안 보임**(=정식 전환은 서버 0x0b0x 시퀀스가 주도하는 것으로 추론). 따라서 "전략맵 상시 mode2에서 클릭만으로 mode0 전환"은 코드상 자연 경로가 확인되지 않는다.

### Q3. 0x0b0a → `FUN_004c2a80(1)` 자연발생 경로 (서버가 어떻게 0x0b09/0x0b0a를 보내야 하나)

(P0) 디스패처 `FUN_004ba2b0`:
```
case 0xb09 (NotifyEnterGridBegin):
  *(param_1+0x36a5dc) = 0;                       // 유닛카운트 리셋
  *(byte*)(param_1+0x4376ec) = *(byte*)param_3;  // ★ value byte 저장
case 0xb0a (NotifyEnterGridEnd):
  *(byte*)(param_1+0x4376ed) = *(byte*)param_3;
  if (*(char*)(param_1+0x126711) == '\x02') {    // mode2(전략)
    if (*(char*)(param_1+0x4376ec) == '\0')      // ★ 0xb09 value==0
      FUN_004c2a80(1);                            // 그리드 진입완료(유닛배치/표시)
    else { DAT_007ccffc[0x357e84]=0; *(+0x357e88)=1.0f; *DAT_007ccffc=1; *(+4)=1; }  // value!=0 분기
  } else if (*(char*)(param_1+0x126711) == '\0') {  // mode0(메뉴)
    FUN_004c2a80(1); FUN_004c32a0(1);
  }
```

→ **`FUN_004c2a80(1)` (mode2 분기)이 불리려면 서버가 반드시 `0x0b09 NotifyEnterGridBegin`의 value byte = 0 을 먼저 보내고(→ `+0x4376ec=0`), 이어서 `0x0b0a NotifyEnterGridEnd`를 보내야 한다. 그리고 그 시점 mode byte는 2(전략)여야 한다.** (P0)

(중요 상충, 메모리 G211과 정합 — P1) value byte=0 분기는 `FUN_004c2a80(1)`(유닛 표시)을 부르지만 **event-9 enqueue나 mode 전환을 직접 하지 않는다**. value!=0 분기는 `*(param_1+4)=1`(전략 state machine state1로 점프)과 `+0x357e88=1.0f`을 세팅한다. 즉:
- value=0 → 유닛/함대 표시 OK, 하지만 전략 시퀀스 state는 안 건드림.
- value!=0 → state machine을 state1로 직접 점프(case0 enqueue를 건너뜀) → event-9 미생성.

이는 메모리의 "value0=함대보임·클릭불가 / value!=0=클릭가능이나 함대깨짐(state0 스킵)"의 **함수레벨 근거**다. `LOGH_STRAT_SEQ_START`로 value0→value1 재전송했을 때 "StrategySequence 시작(+4=1)했으나 event-9 여전히 없음"이 나온 이유 = **value!=0 분기가 case0(유일 enqueue 지점)를 건너뛰고 state1로 직행**하기 때문(P1).

### Q4. 증거기반 언블록 레시피 — 서버측 무패치 vs 클라 code-cave

핵심 진단: **두 개의 독립 블로커가 직렬로 겹쳐 있다.**

(블로커 α — 큐 정체성) event-9는 전략클라(`DAT_007ccffc`)에 쌓이는데, 클릭확정(+0xb02)을 켜는 dequeue 루프(`FUN_00507f20`)는 활성씬 윈도우(`DAT_02215e2c+0xc`)를 본다. (P0) → 같은 큐가 아니므로, "전략클라에 event-9 쌓기"만으로는 클릭확정 불가.

(블로커 β — mode 배타 + value 분기) 전략클라 내부에서도 mode2면 enqueue만, mode0이라야 consume(`FUN_0050d230`)이 돈다. 그리고 mode0 consume의 클릭확정 결과(`DAT_007ca550` 타깃)는 +0xb02가 아니라 별도 경로(카메라/포커스)다. (P0)

레시피 평가:

1. **(권장 1순위, P1) mode0 소비처가 활성씬이 되도록 = `+0x126711` mode byte를 0(메뉴/소비)로 두고 + `+0x126718 != 0`**.
   - mode0이면 `FUN_0050d230`이 `FUN_00502780(0,0)`(전략클라 cat0)에서 event-9를 polling해 소비한다. enqueue도 cat0(P1)이면 **같은 큐**라 자연 소비된다.
   - 단 mode0에선 enqueue(`FUN_004fef90`)가 안 돈다 → 전략맵 시퀀스가 정지. 따라서 "전략맵 상시 mode2 → 클릭 순간 mode0 1프레임 → 다음 프레임 mode2 복귀"의 **toggle**가 필요. 이건 메모리의 "mode=0 강제 라이브: +0x126718=1 강제하니 FUN_0050d230=6회 작동" 관찰과 정합. **mode toggle 시퀀스를 깨끗하게(전략클라 재기동 후, mode 오염 없이) 1프레임만** 거는 것이 핵심.
   - 구현 위치: 클라 code-cave에서 `DAT_007ccffc+0x126711`를 클릭엣지(`DAT_022142b0` 변화) 검출 시 1프레임 0으로 토글 후 복귀. **서버 무패치로는 mode byte를 직접 못 건드림**(서버는 0x0b09/0x0b0a value만 보냄, mode byte는 클라가 CommandChangeMode/0x42f 등으로 설정).

2. **(권장 2순위 = 진짜 "자연" 경로, P3) 서버가 정상 grid-enter 시퀀스를 보내 `FUN_004c2a80(1)` + 전략 state ring을 정상 구동.**
   - 서버: `0x0b09 value=0` → `0x0b0a`(mode2 상태에서) → `FUN_004c2a80(1)` 호출(유닛 표시). 이건 무패치 가능(서버 메시지만).
   - 그러나 이것만으로는 event-9가 안 쌓인다(value=0 분기는 case0 enqueue 안 함). event-9 ring은 `FUN_004fef90` case0가 자율적으로(`FUN_004b7890` Ready일 때) 매프레임 돌아야 한다. Ready 조건 = `FUN_004b8950`(서버 수신큐 `+0x3552b8`/`+0x3552b4`에 전략 메시지 적재). 메모리상 서버가 큐에 넣는 opcode가 0x0301(시각동기)뿐이라 Ready가 안 떠 case0 미진입했던 정황 → **서버가 전략 시퀀스 메시지(StrategySequence를 Ready로 만드는 opcode)를 수신큐에 넣어야** case0가 돌아 event-9가 쌓인다(P3, opcode 미확정).

3. **(비권장, 회귀확인됨) `DAT_007ccffc+4=0` 또는 ecx+4=0 강제** — 메모리상 라이브에서 event-9 552회 enqueue까진 갔으나 +0xb02=0(블로커 α 때문). 디컴파일과 정합: enqueue 큐≠클릭확정 큐라 enqueue만 늘려선 영영 클릭확정 안 됨. **이 방향은 막다른 길.**

**최종 권고 (P1):** 정답은 **클라 code-cave**다 — 단, "event-9를 더 쌓는" 방향이 아니라 **mode byte(`DAT_007ccffc+0x126711`) toggle**(클릭엣지 검출 시 mode2→0 1프레임→복귀)로 mode0 소비처(`FUN_0050d230`)를 클릭 순간에만 깨워, enqueue된 event-9를 같은 전략클라 cat0 큐에서 소비시키는 것. 서버 무패치만으로는 mode byte를 못 만지므로 불충분(서버는 grid-enter value/시퀀스 메시지까지만 기여). **단, 블로커 α(전략클라 cat0 큐 ↔ 활성씬 +0xb02 큐 분리)는 mode0 소비가 +0xb02가 아닌 `DAT_007ca550` 타깃 경로로 가므로, "0x0b01 자연발생"의 정확한 출력 채널이 +0xb02인지 `DAT_007ca550`→후속 0x0b01 송신인지 라이브로 반드시 재확인**(아래 §3).

---

## 3. 다음 라이브 검증 절차 (logh7-live)

전제: ACP=949 복귀(UTF-8 베타 OFF), 스플래시 ~30초 대기 후 드라이브, 스테일 node kill. canonical playable EXE는 현행 SHA(`24611e07…`) 기준.

1. **enqueue cat 확정 (Q1·블로커 α 핵심):** 전략맵 진입 후 probe로 `FUN_004fef90` case0의 `FUN_00502780` 반환 base를 캡처해 `DAT_007ccffc+0x38`(cat0)인지 확인. 동시에 `FUN_0050d230`의 `FUN_00502780(0,0)` base와 **주소 동일성** 대조. 같으면 enqueue↔mode0consume 동일 큐 확정.
2. **클릭확정 큐 분리 확정:** `FUN_00507f20`가 받는 `param_2`(활성씬 윈도우 cat0 base)를 캡처해 1의 전략클라 cat0 base와 **다른 주소**임을 확인(블로커 α 라이브 증명).
3. **mode toggle 시도:** 전략맵에서 클릭엣지(`DAT_022142b0`≠`DAT_022142b4`) 검출 프레임에 `DAT_007ccffc+0x126711`를 0으로 1프레임 세팅(+`+0x126718` 보장)→다음 프레임 2 복귀. `FUN_0050d230` 진입횟수, event-9 큐 count(`base+0x3f4`) 감소, `DAT_007ca550` 타깃 갱신, 그리고 **실제 0x0b01 송신**(trace) 여부 캡처.
4. **0x0b01 출력채널 판별:** mode0 consume가 클릭을 처리할 때 와이어로 0x0b01이 나가는지, 아니면 +0xb02 경유 다른 함수가 필요한지 trace로 확정(Q4 잔여 불확실성 해소).
5. **서버 grid-enter 정상화 병행:** `0x0b09 value=0`→`0x0b0a`(mode2)로 `FUN_004c2a80(1)` 호출되어 함대 표시되는지 확인(함대 가시화 회귀 없이 mode toggle 가능한지 = G211 상충 해소 검증).

증거 없이 "해결"로 표기 금지. 각 단계는 trace/probe 캡처 + EXE SHA 기록과 함께 loop-state에 남길 것.

---

## 4. 부록 — 확정 오프셋 표 (모두 P0-decompile)

| 심볼/오프셋 | 의미 |
|---|---|
| `DAT_007ccffc` | 전략클라이언트 객체 base |
| `DAT_02215e2c` | 활성씬 매니저; `+0xc`=활성 윈도우 포인터 |
| `+0x126711` (on DAT_007ccffc) | mode byte (0=메뉴/소비, 1=에러, 2=전략/enqueue) |
| `+0x126718` | mode0 씬 활성 플래그/버퍼 시작 |
| `+0x2a58f8` | mode2 씬 활성 플래그 |
| `+0x4376ec` | 0x0b09 value byte 저장 (==0이면 `FUN_004c2a80(1)`) |
| `+0x4376ed` | 0x0b0a value byte |
| `+0x36a5dc` | 그리드 유닛 카운트 |
| `+0x3584a0` | 선택 char-id |
| widget `+5` | gate05 (가시/활성), `FUN_005024a0` |
| widget `+8` | 생성됨 플래그 |
| widget `+0x15` | 입력수용 플래그, `FUN_005025c0` |
| widget `+0x3f4` | event 큐 count (max 29) |
| widget `+0x470 + n*4` | event id 슬롯 |
| widget `+0x4e8 + n*0x34` | event 페이로드(13워드) |
| widget `+0xb01` | 클릭 눌림 래치 (FUN_00507f20) |
| widget `+0xb02` | 클릭확정 비트 (FUN_00507f20, code 10 폴링) |
| `DAT_022142b0`/`DAT_022142b4` | 마우스 버튼 현재/직전 (code 9 엣지) |
| `DAT_007ca550` | mode0 consume 클릭 타깃 결과 |
| `DAT_02213e90` | StrategySequence Ready 플래그(1=Ready) |
| `FUN_00502780(cat,idx)` | widget base 리졸버 (cat 0=this+0x38, 1/2=테이블, 3/4=stride) |
