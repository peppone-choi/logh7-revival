# C002 메커니즘 — 적대적 검증 정정 (2026-06-22)

대상: `docs/logh7-c002-mechanism-2026-06-22.md`(maker 1차 분석). 검증자(logh7-loop-verifier)가 디컴파일이 아니라 **디스어셈블 레벨에서 call-site `ecx` 추적**으로 반증. 디스어셈블 원본 `.omo/ghidra/bin/G7MTClient.exe`(imagebase 0x400000, .text 파일오프셋 = VA − 0x400000).

## 종합 판정: **FAIL** — 큐 정체성 결론이 잘못된 `this` 식별에 기반. 레시피 **NO-GO**.

maker 문서의 부품(개별 함수 디컴파일: 0x0b0a 핸들러, mode 분기, FUN_005015f0 case9/10, enqueue/dequeue 프리미티브 레이아웃)은 대체로 정확. 그러나 그것들을 조립한 **큐 정체성 결론(this=DAT_007ccffc 가정)이 ecx 추적으로 반증**되어 블로커 분석과 권장 레시피의 근거가 무너짐.

## 반례 (디스어셈블 증거)

1. **enqueue의 this = `DAT_02215e2c`(활성씬), DAT_007ccffc 아님.**
   - `FUN_004b68f0` enqueue 호출부 @`0x004b6d72`: `mov ecx,[0x2215e2c]; call 0x4fef90`.
   - `FUN_004fef90` @`0x004fef95`: `mov ebp,ecx`(=DAT_02215e2c), state = `*(DAT_02215e2c+4)`.
2. **mode0 consume의 this도 `DAT_02215e2c`.**
   - 호출부 @`0x004b6dbc`: `mov ecx,[0x2215e2c]; call 0x50d230`.
   - `FUN_0050d230` @`0x0050d391`: `mov ecx,[ebp+0xc]; push 0x41; call 0x50cf40; ...; call 0x502780` → cat 베이스 = `FUN_0050cf40(*(DAT_02215e2c+0xc), 0x41)`(활성씬 윈도우의 자식 위젯). maker의 "cat0 = DAT_007ccffc+0x38" 반박.
3. **`DAT_02215e2c` ≠ `DAT_007ccffc`(별칭 아님).**
   - `FUN_004e9bb0`: `DAT_02215e2c = FUN_0050d110()`(작은 씬 매니저) / `DAT_007ccffc = FUN_004b6000()`(거대 게임클라). 다른 팩토리·다른 객체.
4. **enqueue cat = cat1·idx0xa (P1 cat0 추정 반박).**
   - `FUN_004fef90` case0 @`0x004ff0c2`: `mov ecx,[ebp+0xc]; push 9; call 0x50cf40; mov esi,eax; push 0xa; push 1; mov ecx,esi; call 0x502780` → `FUN_00502780(esi, cat=1, idx=0xa)`. 디스어셈블 레벨에서 명백히 cat1·idx0xa.
5. **enqueue 위젯 ≠ consume 위젯 ≠ dequeue 위젯 (같은 활성씬 윈도우 트리 내 다른 노드).**
   - enqueue: `FUN_00502780( FUN_0050cf40(win,9), 1, 0xa )` (win의 9번 자식, cat1[0xa])
   - consume: `FUN_00502780( FUN_0050cf40(win,0x41), 0, 0 )` (win의 0x41번 자식, cat0)
   - dequeue(`FUN_00507b10` @`0x00507b5e`): `FUN_00502780( win, cat∈{0,2,1,3,4}, idx )` — `FUN_0050cf40` 인덱싱 없이 win 직접.
   - 실제 분리축은 "전략클라 vs 활성씬"이 아니라 **동일 활성씬 윈도우 트리 안에서 서로 다른 노드를 만지는 것**.
6. **Q3 인과 base 불일치.**
   - 0x0b0a value!=0 분기(`FUN_004ba2b0`, this=DAT_007ccffc @`0x004b8a75`)는 `*(DAT_007ccffc+4)=1`을 씀.
   - enqueue state machine state = `*(DAT_02215e2c+4)`. **다른 객체의 +4** → "value!=0이 case0(event-9 enqueue)을 건너뛴다"는 직접 인과는 정적으로 성립 안 함.

## maker가 정확했던 부분(보존)

- 0x0b0a/0x0b09 핸들러 인용: `+0x4376ec`(0xb09 value), `+0x126711`(mode 0/1/2), mode2&&value==0→`FUN_004c2a80(1)`, mode0→`FUN_004c2a80(1);FUN_004c32a0(1)` — 일치. (이 오프셋들은 DAT_007ccffc 기준이 맞음; 디스패처 this=DAT_007ccffc @`0x004e989b`.)
- mode 분기(Q2): mode0&`+0x126718`→consume, mode2&`+0x2a58f8`→enqueue, mode1→에러 — 일치.
- FUN_005015f0 case9(`DAT_022142b0/b4`), case10(`+0xb02` 읽기), 진입 시 `FUN_00501ed0` peek — 일치.
- enqueue/dequeue 프리미티브 레이아웃(`+0x3f4`/`+0x470`/`+0x4e8`), FUN_00502780 cat별 base, FUN_00507b10 cats={0,2,1,3,4} — 일치.
- 호출그래프: enqueue/consume ← FUN_004b68f0 ← FUN_004e96f0; dequeue ← FUN_00507b10 ← FUN_0050c750 ← FUN_004e96f0; 0x0b0a ← FUN_004ba2b0 ← FUN_004b8950 — 확정.

## 레시피 안전성: **NO-GO**

maker 권장("클릭엣지 시 `DAT_007ccffc+0x126711` 2→0 1프레임 토글") 반려:
1. **타깃 오인** — enqueue 위젯(9번자식/cat1·0xa)과 consume 위젯(0x41번자식/cat0)이 다르므로(반례4·5), mode toggle로 consume을 깨워도 enqueue된 event-9를 소비할 보장 없음. 핵심 전제(같은 cat0 큐) 거짓.
2. **mode2 의존 로직 파괴(실재)** — `+0x126711==2`는 0x0b0a 분기·함대 가시화(G211) 게이트로도 쓰임. 1프레임 0 강제 시 그 프레임 0x0b0a가 mode0 분기로 빠져 상태 오염. 메모리 캐논 "ecx+4=0 강제=비활성 씬 억지구동 부작용"과 동형 위험.
3. **검증 미완** — 0x0b01 출력채널(+0xb02 vs DAT_007ca550), enqueue cat 라이브 미확정.

## 더 안전한 대안 (다음 단계)

- (a) **mode byte 만지지 말 것.** 읽기전용 라이브 probe로 세 위젯 base 실주소 캡처·대조:
  enqueue `FUN_00502780(FUN_0050cf40(*(DAT_02215e2c+0xc),9),1,0xa)`, consume `...(...,0x41),0,0)`, latch `FUN_00507b10`이 도는 `FUN_00502780(win,cat,idx)`.
- (b) **진짜 frontier**: 정상 게임에서 클릭이 latch 위젯(win 직접/cat순회)에 event-9를 쌓는 경로는 enqueue(9번자식/cat1·0xa)와 다른 경로다. `FUN_00501e30` 호출자 7개(FUN_004ba2b0, FUN_004c1700, FUN_00508f60, FUN_00517cd0/db0 등) 중 **latch 위젯에 쌓는 것**을 찾아라 — mode toggle보다 우선.
- (c) 클라 패치 불가피 시 전역 mode byte 아닌 **특정 위젯의 +0xb02/+0xb01만 국소 조작**(부작용 국소화), 단 (a) 확정 후.

## 2026-06-23 디큐 사이드 RE 완료 + 종결 타깃 확정 (라이브+정적)

라이브 read-only probe(`tools/logh7_c002_base_probe.py`)로 verifier 정정 확정 후, 디큐 경로를 정적으로 완결:

- **라이브 확정**: enqEcx=`0x5473830`==DAT_02215e2c(활성씬), DAT_007ccffc=`0xf307020`(불일치). enqN=734·**conN=0**(consume FUN_0050d230 미발화)·latchN=6606(latchEcx=`0x1100dcc8`).
- **디큐 게이트 `FUN_005024a0` = `return *(byte*)(this+5)`** (gate05). 라이브서 통과 확인됨 → **게이트는 블로커 아님**.
- **`FUN_0050c750`**(메인루프 FUN_004e96f0가 호출): 활성씬 자식 0x73(115)개 순회, 각 활성 자식에 gate05 통과 시 `FUN_00507b10` 실행.
- **`FUN_00507b10`**(latch 디큐): cats `{0,2,1,3,4}` × idx 순회, 각각 `FUN_00502780(this, cat, idx)` 위젯에 **`FUN_00507f20`**(클릭확정 → +0xb01 → +0xb02 → 0x0b01) 호출. **this=latch객체(0x1100dcc8)**.
- **불일치 근본**: enqueue(FUN_004fef90)는 `FUN_00502780(FUN_0050cf40(win,9), cat1, 0xa)` = win의 9번자식 위젯에 event-9 적재. latch 디큐는 latch객체(0x1100dcc8)의 cats{0,2,1,3,4} 위젯만 봄. **두 객체가 달라 6606회 디큐해도 event-9 미발견(b01=0).**

**★C002 종결 타깃(확정)**: 전략 클릭의 event-9가 **latch 객체(FUN_00507b10 순회 대상)의 위젯**에 쌓여야 FUN_00507f20이 0x0b01을 emit. 현재 FUN_004fef90의 9번자식 enqueue는 디큐 경로 밖. 종결 = enqueue 호출자(FUN_004c1700/FUN_00508f60/FUN_004ba2b0 등) 중 **latch 객체에 클릭 event를 쌓는 자연경로**를 식별·활성화(또는 그 경로로 라우팅). mode-byte 토글은 NO-GO(상단). 다음=각 enqueuer의 타깃 base를 정적/라이브로 대조(서브에이전트 다각 RE 적합). 이게 닫히면 0x0b01·맵전환 렌더·직무패널 동시 해금.

**★★결정적 근본(2026-06-23 라이브, `tools/logh7_c002_enqueue_trace.py`)**: enqueue 프리미티브 **`FUN_00501e30`이 idle·전략클릭 모두 0회 호출**(idle_callers={}, click_callers={}). 반면 `FUN_004fef90`=734회 진입, `FUN_00507b10`(latch)=**9개 객체**(0xfba97a8/0x110e6da0/0x90e6fd0/0xfb7a720/0x1102d278/0xfb8a1f8/0x11151078/0x1103cd50/**0x1100dcc8**)×867회 디큐. → **FUN_004fef90이 매프레임 돌지만 case0(=FUN_00501e30로 event-9 enqueue하는 유일 지점)에 진입 못 함**(state≠0·빈 task리스트, 메모리 "case1 끝 빈리스트→+4=8→state0 영원히 안감"과 정합) → **event-9가 아예 enqueue 안 됨**. 클릭도 FUN_00501e30 미트리거. 디큐 루프(FUN_00507b10/FUN_00507f20)는 빈 큐만 순회 → +0xb01=0 → 0x0b01 불가. **즉 C002 근본은 "enqueue widget≠latch widget"보다 한 단계 깊다: 자연 상태선 enqueue 자체가 0회.** 종결의 본질 = **StrategySequence를 case0에 (자연스럽게·1회) 진입시켜 task자체생성+event-9 enqueue를 부트스트랩**(메모리 DAT_00c9e2e0 one-shot 가설). 단 verifier 경고: ecx+4=0 강제는 enqueue를 만들지만(메모리 enq={'9':552}) latch가 안 집음(b01=0)→타깃 위젯도 동시 해결 필요. 안전 종결 = case0 진입 조건(task seed 경로 FUN_004f9030/FUN_004f96d0)의 자연 트리거 RE(서브에이전트 다각).

**enqueuer 후보 ruling(2026-06-23)**: `FUN_004c1700` = 자연 latch-enqueuer **아님** — `*(param_1+0x126718)==0` 게이트 후 캐릭터/유닛 레코드(param_2 8dword 복사·FUN_004c7fc0 own-unit·ability 필드 +0x91c/+0x94c/+0x958) 채우는 **0x0323/0x0325 데이터 컨슈머**(param_1=DAT_007ccffc 게임클라). 클릭→latch enqueue 경로 아님. 잔여 후보 = `FUN_00508f60`, 디스패처 입력경로(FUN_004ba2b0), `FUN_00517cd0/db0`(텍스트/채팅). 다음 사이클서 이들의 enqueue 타깃 base를 latch객체(FUN_00507b10 순회 대상) 기준으로 대조.

## 통과(maker 주장 채택)에 필요한 증거

1. 라이브 probe로 enqueue/consume/latch 세 base 실주소 대조.
2. enqueue/consume의 this가 `DAT_02215e2c`임을 런타임 ecx 캡처로 확인.
3. 0x0b01 실제 와이어 송신 trace 캡처(레시피 출력이 진짜 0x0b01인지).
4. canonical EXE SHA와 디스어셈블 인덱스 원본의 함수레이아웃 동일성 명시.
