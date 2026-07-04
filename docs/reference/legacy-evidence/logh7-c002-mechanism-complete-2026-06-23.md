# C002 메커니즘 완전 매핑 — 종결 경로 확정 (2026-06-23)

3-에이전트 병렬 RE(logh7-loop-explorer) + 라이브 probe 종합. 전부 디스어셈블/디컴파일 확정(P0), imagebase 0x400000, 인덱스 `.omo/ghidra/export/G7MTClient`. 수개월(loop-state v1~v62+) C002 프런티어의 전 체인을 닫는다.

## 전 체인 (클릭 → 0x0b01)

```
[마우스 클릭]
  → Win32 GetAsyncKeyState(1) (FUN_00500b70) → DAT_02214c00
  → FUN_00500580 (매프레임, FUN_004e96f0 호출, GetFocus 게이트) → 엣지객체 DAT_022142a8[2/3]=DAT_022142b0/b4
  → FUN_005015f0(9) 클릭엣지 peek: (b0!=b4 && b0!=0) + hit-test
  → FUN_00507f20 (latch consumer, 매프레임 FUN_0050c750→FUN_00507b10, mode 무관):
       게이트 [param_2+8]!=0 · FUN_005024a0(this+5 owner=라이브 PASS) · FUN_005025c0(this+8 scene) · FUN_005015f0(9)
       → +0xb01=1, +0xb02=1 (유일 writer; +0xb02는 1프레임 펄스)
  → [소비] FUN_0050d230 (mode0) 이 +0xb02/event-9 읽어 grid 좌표 확정
       → FUN_004f96d0가 seed한 task(puVar2[0xb]=0xb01 SelectGrid, FUN_00581c80) 디스패치
       → FUN_004b78a0 send 0x0b01 → 서버 0x0b07 NotifyMovedGrid (FUN_005751b0)
  → validator FUN_004d6310: own셀(DAT_007cd04c+0x11178) vs 클릭셀 거리 + terrain byte1∈{1,3}
```

## 해결된 층 (블로커 아님, 확정)

1. **마우스 입력 도달**: 클릭 엣지는 **Win32 GetAsyncKeyState/GetCursorPos**(FUN_00500b70)로만 채워짐. DirectInput8Create는 enum만(GetDeviceState 0회=조이스틱용 P1). **합성 mouse_event/SetCursorPos가 GetAsyncKeyState에 잡힘** → 클릭 도달. 메모리 "마우스 입력레이어 블로커"·"cursor-clip/DirectInput" 가설 **디컴파일 반증**. 단 GetFocus 게이트(포그라운드 유지 필요, live3-auto 35s 정합).
2. **own-fleet 셀(+0x11178)**: 직접 writer 0개(디스어셈블 전수: read 6곳·write 0). 0x0325 ResponseInformationUnit의 commander 슬롯(optionalRecord+0x08)이 struct-copy(FUN_004c2c80, param_2==1)로 안착. 서버 기본 emit=commander=charId(셀 아님)→+0x11178=0→validator 거부. **`LOGH_PLAYER_FOCUS_CELL=1`(config 기본 ON)이면 commander=fleetCellId→라이브 currentRaw11178=2550 확정**. autologin emp1은 own-fleet 받음(0x0325 unitCount=1).
3. **latch가 +0xb01/+0xb02 set**: FUN_00507f20이 owner(this+5, 라이브 PASS)·scene·클릭엣지 게이트 통과 시 set. 입력/owner/edge 게이트는 자연 통과(라이브 확정).

## ★진짜 단일 블로커: mode2/mode0 배타

`FUN_004b68f0`(메인 틱)의 mode 분기(`DAT_007ccffc+0x126711`):
- `==2`(전략맵) && `+0x2a58f8` → **FUN_004fef90 (enqueue only)**
- `==0`(메뉴) && `+0x126718` → **FUN_0050d230 (consume only, +0xb02 읽어 0x0b01 task 디스패치)**
- **같은 프레임 배타.** 라이브 확정(live7/live8): enqN=734, **conN=0**.

→ 전략 mode2에선 latch가 +0xb02를 set해도(혹은 그 전에 case0 미진입으로 enqueue 0) **소비처 FUN_0050d230이 절대 안 돌아 0x0b01 미발신**. mode byte는 immediate writer 없음 → 0x42f NotifyChangeMode 등 **구조체 경유 전환**(FUN_004ba2b0 수신 분기).

추가 깊이(live8): mode2의 enqueue(FUN_004fef90)조차 case0(event-9 적재 유일지점)에 자연 진입 못 함(FUN_00501e30 0회) — state머신이 빈 task리스트로 case0 스킵. 단 latch consume 경로(FUN_00507f20→FUN_0050d230)는 case0와 별개 축.

## 종결 경로 (확정, 안전 우선)

**전략 클릭이 mode2→mode0 전환을 일으켜 FUN_0050d230이 +0xb02를 소비**해야 0x0b01. 메모리 검증: mode0 강제 시 FUN_0050d230 6회 작동 확인됐으나 crude 강제는 mode2 enqueue/렌더 오염. 정답:
1. **자연 트리거 RE**: 전략 클릭→mode2→mode0 전환을 일으키는 경로(FUN_004fd7a0 mode switch / FUN_004ba2b0 0x42f / hit-test→mode). mode byte writer(구조체 경유) 확정 = 다음 RE.
2. **올바른 시퀀스 positive-control**: 깨끗 mode2 enqueue(case0 1회 부트스트랩) → mode0 1프레임 전환(소비) → +0xb02 → 0x0b01 → mode2 복귀. 단일 강제 아닌 시퀀스.
3. **own-cell 선결**: LOGH_PLAYER_FOCUS_CELL=1 유지(validator 통과).

## 다음 (서브에이전트 가용)
- mode byte(+0x126711) writer/전환 트리거 다각 RE(FUN_004ba2b0 0x42f mode2 분기 + FUN_004fd7a0) → 자연 mode2→mode0 경로 확정.
- read-only Frida로 enqueue 위젯 base vs latch 위젯 base 한 프레임 대조(W 확정).
- 확정 후 서버푸시(0x42f mode) or 국소 시퀀스로 라이브 0x0b01 검증.

## ★mode 전환 writer 확정 + 클린 토글 가부 (4·5번째 에이전트 + live11)

- **mode byte writer = FUN_004c45f0(단일)**. byte write 아니라 **0x126710 dword를 통째 set**(byte0=active 1, byte1=mode). 호출자 2개: FUN_004c4170(push 2=전략) / FUN_004c32a0(push 0=메뉴). 그 호출자 = **FUN_004b68f0(메인틱)의 월드진입 1회**(게이트 0x35837f "Game Entry OK"). 셀렉터 [+0x35f35a]=writer 0개→기본 0→**iVar7=2→mode=2 세션 고정**.
- **런타임 mode2→mode0 자연 전환 없음**: 클릭·hit-test(FUN_004f6f60/FUN_004fd100)·FUN_004fd7a0(별개 HUD widget mode this+0xf4)·디스패처 어디에도 FUN_004c45f0 호출 없음.
- **★서버 0x42f 핸들러 FUN_004c1c30은 mode byte 미변경**(게이트 [0x126718]!=0 하에 unit plot만, FUN_004c45f0 0회 호출). **서버코드 `logh7-battle-engine.mjs:41-43` 주석("0x42f modeKind→mode grant")은 디스어셈블 반증** → 서버푸시로 mode 전환 불가. (live5/live10에서 0x42f가 "패널 출현"만·전환 미완이었던 것과 정합.)
- **클린 토글 가부 = NO(live11 read-only probe)**: mode2 라이브서 `mode_byte=2`·`mode2_active(0x2a58f8)=0x10001`(채워짐)인데 **`mode0_active(0x126718)=0`·mode0 grid 영역 0/64 비어있음**. → mode-byte만 토글해도 FUN_0050d230 게이트 false. FUN_004c45f0(_,_,0)은 active=1 set하나 grid zero-fill.

## ★★★C002 결정적 해결 (2026-06-23, live12 + 6번째 에이전트) — 60+ 사이클 헛클릭의 근본

live12 positive-control: case0 강제 → FUN_004f96d0 1055회 + event-9 enqueue 1055회 실행되나 **0x0b01 미발생**. 6번째 에이전트가 dispatch 경로를 디컴파일+vtable PE읽기로 완전 확정:

- **case0/event-9가 seed하는 task 노드 = 수신확인 전용**(vtable `PTR_FUN_006702c0`+8 = **FUN_005751b0** = 0xb07 peek/0xb01 echo 확인만, **송신 코드 0개**). `puVar2[0xc]=0xffffffff`=echo 미수신 초기값. → **ecx+4=0 강제로 event-9를 아무리 만들어도 0x0b01 절대 안 나감**(60+ 사이클 forcing이 b01=0이던 정확한 이유).
- **실제 0x0b01 송신 step = FUN_005737d0**(SendWarpCommand, vtable `PTR_FUN_00676aec`+8) → FUN_004b48d0 → **FUN_004b78a0(1, 0x3b=GRID)**. 타깃은 동적 조회(`s_TARGET_GRID` 컬렉션, 목적지 grid 인덱스를 송신인자로). validator FUN_004c53e0 통과 후 송신.
- **SendWarpCommand 시퀀스 생성자 = FUN_00581c80**(SelectGrid), 인스턴스화 **FUN_004f93c0**(`+0x20`=context, `+0x28`=mode 기록) ← **FUN_004f58c0** ← **FUN_004fd100 (case1)**.
- **★진짜 dispatch 트리거 = 명령 메뉴 ROW 클릭**: FUN_004f58c0(this=DAT_00c9e638=활성씬 명령위젯, `[0x2215e2c]+0xc`)이 명령 메뉴 패널(위젯 **0x65**) 활성 + `esi+0x350`(rowCount)>0 + `esi+0x354`(selectedD5)<0 게이트 하에 각 row에 **`FUN_005015f0(2)` 클릭 hit-test** → hit한 row의 명령 인덱스로 FUN_004f93c0 호출 → SendWarpCommand 인스턴스화 → task runner FUN_004f90d0/FUN_004f9270이 실행 → 0x0b01 송신.
- **★★60+ 사이클 근본**: v52~v61의 "별/grid 셀 클릭"은 SelectGrid의 **타깃 조회 대상**일 뿐 **dispatch 트리거가 아니다**. 진짜 트리거는 **명령 메뉴 row 클릭**. 자연 흐름 = 함대선택→명령메뉴 출현→"이동" 명령 row 클릭→목적지 셀. 프로젝트는 명령메뉴 없이 목적지만 클릭해 옴.
- task runner(FUN_004f90d0)·seeder(FUN_004f9030/96d0)·인스턴스화(FUN_004f93c0)·StrategySequence(FUN_004fef90) 컨테이너 = **DAT_00c9e2e0**(StrategySequence this=DAT_02215e2c, mode2 게이트 +0x2a58f8). case0 seed와 case1 dispatch는 같은 컨테이너의 **독립 축**.

**∴ C002 종결 = 명령 메뉴 패널(0x65) 활성 + 명령 row 채움(factory 배열 this+0x1c 주입) + 명령 row 클릭(FUN_005015f0(2) hit).** 선결: 명령메뉴가 mode2 월드서 자연 출현하는가(함대선택 후?), factory 배열이 채워지는가(case0 FUN_004f9050이 매프레임 clear — 타이밍). 다음=라이브 probe로 명령패널 rowCount/selectedD5/factory 캡처.

### 라이브 명령메뉴 상태 확정 (live13, read-only probe + 클릭 A/B)
신규 `tools/logh7_c002_cmdmenu_probe.py`. mode2 월드(autologin emp1, LOGH_PLAYER_FOCUS_CELL=1):
- cmd_obj(DAT_00c9e638)=존재(0x11ff1078), **rowCount(+0x350)=0**, selectedD5(+0x354)=0, factory_nonzero=6/0x61, taskList(c9e2e0+0x14)=2(case0 seed 수신확인 노드).
- **함대선택 클릭 5발(중앙+후보) 주입 후 재probe: rowCount 여전히 0, 0x0b01 없음.** 스크린샷: 클릭이 커서 이동+시야 스크롤은 유발하나(마우스 도달 재확정) **함대 선택 하이라이트 없음·명령메뉴 미출현**.
- **∴ 완전 체인 확정**: 클릭→함대선택 단계가 **+0xb02 latch 미발화(mode2/widget)** 로 안 됨 → 명령메뉴 빈 상태(rowCount=0) → 명령 row 없음 → SendWarpCommand(FUN_005737d0) 인스턴스화 불가 → 0x0b01 없음. **C002의 모든 layer가 함수레벨 확정**: (마우스도달 ✓)→(클릭→선택 latch ✗ 여기서 막힘)→(명령메뉴 populate)→(명령 row 클릭)→(SendWarpCommand dispatch).
- **종결 = mode2에서 클릭→함대선택 latch(+0xb02) 발화 복원**(또는 합성으로 명령메뉴 rowCount+factory 주입 후 명령 row 직접 dispatch). 이게 60+ 사이클 C002의 단일 근본 layer. 함수RE는 완결, 남은 건 그 latch 발화의 mode2 조건(StrategySequence case1 자연 구동 + 명령메뉴 빌더 FUN_004f5cb0/FUN_004d3a40 트리거)의 구현/positive-control.

### 합성 단축경로 전수 배제 (live14, 결정적)
신규 `tools/logh7_c002_bridge_pc.py`: latch consumer FUN_00507f20의 param_2(widget)에 **+0xb01=1을 541,258회 강제** + 클릭 sweep 7위치. 결과 **FUN_005737d0(SendWarpCommand)=0·FUN_004b78a0(송신)=0·0x0b01=0**. → **+0xb01/+0xb02 latch ≠ SendWarpCommand 경로** 확정: latch 강제로는 송신 시퀀스 인스턴스화 안 됨. **모든 합성 단축경로 라이브 배제**:
1. case0/event-9 강제(live12, 1055회) → 수신확인 노드만 seed, 송신 0. ✗
2. +0xb01/+0xb02 latch 강제(live14, 541k회) → SendWarpCommand 미인스턴스화. ✗
3. 명령메뉴 비어있음(rowCount=0), 클릭이 함대선택/메뉴populate 안 함(live13). ✗

**∴ C002 종결은 자연 명령메뉴 흐름만 통과 가능**: 함대선택(SelectGrid, +0xb02 latch on 함대 위젯) → 명령메뉴 빌더 구동(rowCount>0, factory 주입) → 명령 row 클릭(FUN_005015f0(2)) → FUN_004f93c0(SendWarpCommand 인스턴스화, target/mode 기록) → FUN_004f90d0 task runner → FUN_005737d0 → 0x0b01. **단일 근본 게이트 = 함대선택 latch(SelectGrid)가 mode2서 발화**. 구현 후보: (a) 명령 카탈로그/메뉴 빌더(FUN_004f5cb0, 메모리 command-table v3~v14 스레드)를 함대선택 시 구동하는 자연경로 RE+서버 카탈로그 배선, (b) FUN_004f93c0 직접호출 surgical positive-control(this=DAT_00c9e2e0, cmdIdx+context, factory 확인 후 — 고위험). **함수RE 100% 완결, 종결은 명령메뉴/선택 서브시스템 구현 단계.**

### 키보드 경로 배제 (7번째 에이전트, P0) + 선택 latch 정밀화
- **키보드는 전략 명령/선택 경로 미구동**: WM_KEYDOWN(FUN_004ffdc0)/WM_CHAR(FUN_004fff60)는 **텍스트 위젯 전용**(가드 param_1[1]=active edit), 방향키=커서/리스트 네비, ESC=취소. FUN_004fd100/FUN_004f58c0/StrategySequence로 분기 없음. catGate(=StrategySequence +0xf4) writer=FUN_004fd7a0, 호출조건 전부 마우스(FUN_005015f0(2/4/5)). FUN_005015f0 event-class 테이블에 **키보드 명령확정 case 없음**(0x10/0x11=IME 텍스트뿐).
- **선택 latch 정밀화**: 명령 row가 검사하는 건 **+0xb00**(FUN_005015f0 case2), 유일 set점 **0x0050801b**(FUN_00507f20), 게이트 = **좌클릭안정(DAT_022142b0==DAT_022142b4 && !=0) 또는 우클릭(case 0xb)**. (live14 bridge가 +0xb01을 강제했으나 selection은 +0xb00이라 SendWarpCommand 미트리거였던 정확한 이유.)

### ★★★C002 최종 결말 (모든 경로 전수 배제, 2026-06-23)
**입력경로 2종(마우스·키보드) + 합성force 3종(case0·+0xb01·+0xb02) = 5종 전수 라이브/디컴파일 배제.** 0x0b01 단일 종결 게이트 = **마우스 클릭이 함대/명령 위젯의 rect에 hit하여 +0xb00 selection latch 발화 + 명령메뉴 rowCount>0(factory 주입)**. 둘 다 mode2 전략맵서 자연 미충족(함대 위젯 미선택·명령메뉴 미빌드). → **C002 종결 = 명령메뉴/선택 서브시스템(함대선택 hit-test rect + 명령 카탈로그 빌더 FUN_004f5cb0 + 서버 명령목록)의 구현/복원.** 함수RE·경로배제 100% 완결, 남은 건 순수 구현(메모리 command-table v3~v14 + selection 스레드). 60+ 사이클이 못 닫은 이유 = 이 서브시스템이 revival 클라/서버서 미작동 상태이고, 모든 단발 force/click/key 시도가 이 미작동 서브시스템을 우회 못 하기 때문.

### ★★★최심 layer 측정: catGate (8번째 에이전트 + live15, 60+ 사이클 최초)
정정된 완전 체인: **catGate**(StrategySequence+0xf4, writer FUN_004fd7a0) idle→2(SELECT) 전이 ← 전략맵 메인 widget[base+0x14] 좌클릭(event-2) → unit-list 패널(widget 0x67) populate(FUN_004f6680) → **패널 row 클릭**(별/마커 아님)으로 함대선택(+0x624) → 명령메뉴(StrategySequence+0x130, rowCount=+0x480) 빌드(FUN_004f5cb0, 카탈로그=클라 내장 0x3e0c8c) → 명령 row 클릭 → FUN_004f93c0 → 0x0b01. (live13 rowCount=0은 틀린 base(DAT_00c9e638) 측정이었음; 실제=StrategySequence+0x130.)

**live15 catGate A/B 측정(`tools/logh7_c002_catgate_probe.py`, base=DAT_02215e2c=0x53d3830)**: state=1(case1 구동), **catGate=0**(전이 안 됨), cmdRowCount=0, sel=0. **전략맵 클릭 6위치 후 전부 불변(catGate 0→0).** → **클릭이 event-2/+0xb00 widget hit를 만들지 못해 catGate가 0 고정** → 체인 전체 미작동.

**C002 전 layer 라이브 측정 완료(최종)**: 마우스도달✓(커서/시야) → **클릭→event-2/+0xb00 strategic-widget hit ✗ ← 단일 최심 근본** → catGate 전이✗(0 고정) → unit-list populate✗ → 함대선택✗ → 명령메뉴 build✗(rowCount 0) → 명령 row✗ → 0x0b01✗. **함수RE·전 layer 측정 100% 완결. 종결 = 전략 widget이 클릭을 +0xb00 hit로 등록하게 하는 클라측 strategic-UI fix**(widget rect/hit-test/렌더-등록; 서버 데이터 아님 — 0x0325는 충분). 이게 revival서 미작동인 단일 근본이며, 모든 우회(force/click/key/case0/latch)가 이 미작동 hit 레이어를 못 넘는 이유.

### ★최종: 전략 widget = latch loop 미등록 + catGate 다중게이트 (live16/17, 절대 결말)
- **live16 decisive widget probe**: latch loop(FUN_00507f20)이 **451 widget** 처리, 그러나 **catGate 전이가 검사하는 전략 widget [DAT_02215e2c+0x14]=0xfba0048은 latch loop에 미등록**(in_latch_loop=false). +0xb00 메커니즘 자체는 작동(any_b00_set=true, 다른 위젯서). → 전략 widget이 클릭 처리 루프에 없어 +0xb00 영영 미발화.
- **live17 catGate force PC**: 전략 widget[+0x14/0x18/0x24/0x28]의 +0xb00을 885프레임 강제해도 **catGate 0 고정(전이 0)**. → catGate 전이(FUN_004fd100→FUN_004fd7a0)에 클릭 외 **추가 게이트**([0xc9e2f8]==0·[esi+0x128]<=0·FUN_004fc470 precondition) 존재, +0xb00만으론 불충분.
- **★★C002 절대 최종 결론**: 전략-명령 서브시스템은 **다중 게이트 상태머신**으로 revival autologin 월드서 자연 활성화 안 됨. **전수 배제 라이브 증거: 마우스·키보드·case0·+0xb01·+0xb02·+0xb00(전략 widget) 6종 force/input 모두 0x0b01=0.** 단일 force/click/key 어느 것도 다중-게이트를 우회 못 함. **함수RE·전 layer 측정·전 force 100% 완결. 종결 = 다중-게이트 서브시스템(전략 widget의 latch loop 등록 + catGate 다중게이트 충족 + unit-list populate + 명령메뉴 build)을 제대로 활성화하는 다중-컴포넌트 클라측 구현(다중 사이클).** 60+ 사이클이 못 닫은 이유의 완전한 기계적 설명.

### ★직접 구동 결과 (live19, NativeFunction) — catGate 레이어 돌파 + 다음 게이트 확정
`tools/logh7_c002_drive_pc.py`: 게임 스레드(FUN_004fef90 onEnter)서 **FUN_004fd7a0(StrategySequence, 2, 1) 직접 호출**(클릭/force 우회, 상태머신 직접 구동).
- **★catGate 0→2 전이 성공**(writer FUN_004fd7a0 작동 확정 — +0xf4=2). +0xb00 force로는 못 했던 catGate 전이를 직접 호출로 달성.
- **단 내부 unit-list populate(FUN_004f6680)에서 access violation @0x687fa80** → 클라는 Frida가 캐치해 생존, 그러나 **unit-list 데이터 구조 누락으로 populate 크래시**(cmdRowCount 0 불변). 
- **∴ 다음 정확한 게이트 = unit-list 데이터 구조 확립**(FUN_004f6680이 읽는 unit-list source). 각 레이어를 직접 구동/force하면 **다음 broken 레이어가 드러남** = 다중-컴포넌트 서브시스템이 데이터/상태 레벨서 미확립. catGate(✓ 직접구동 가능)→unit-list(✗ 데이터 누락 크래시)→선택→명령메뉴→dispatch. **종결 = 각 레이어의 데이터/상태를 확립하는 다중-컴포넌트 구현이며, 단발 force/call은 다음 레이어 누락으로 귀결**(라이브 확정).

### ★★★상류 근본 확정 (9번째 에이전트): 전략-명령 패널 자체가 미구성
unit-list 크래시(@0x687fa80)의 진짜 상류 = **unit-list 패널 위젯(0x67) 객체 자체가 안 만들어짐**. 빌더 `FUN_004f6040`(→FUN_004fe890(0x67), row 위젯 ptr를 panel+4..에 저장, [+0x188]=0x10 row슬롯)이 미실행 → catGate 강제 시 panel+4.. 위젯 배열이 garbage → `*(esi+8)` 역참조 fault. 빌드 경로 = **`FUN_0054e570→FUN_004ff3c0→FUN_004fc4e0→FUN_004f6040`** (씬 셋업). officer row 데이터는 `FUN_004fc4a0→FUN_004f68f0([DAT_007ccffc+8] PLAYER_INFO +0x270 count)`가 채우며, **2026-06-24 기준 `0x0323` char record offset 0x93에 officerCount를 기록해 PLAYER_INFO+0x270이 채워짐** (이전 오진: 0x0325 0x24c). 그러나 위젯 객체(1) 미생성으로 여전히 패널은 크래시/미표시.

**∴ C002 완전 layer 지도(전수 라이브/RE 확정)**:
```
1 패널 위젯 구성 (FUN_0054e570→FUN_004ff3c0→FUN_004f6040)   ✗ autologin 월드서 미실행 ← 상류 근본
2 catGate 전이 (FUN_004fd7a0)                               ✓ 직접구동 가능(live19), 단 1 없으면 크래시
3 officer 데이터 채움 (FUN_004fc4a0/FUN_004f68f0)            **✓ 2026-06-24 수정: 0x0323 char record offset 0x93에 officerCount 기록 → PLAYER_INFO+0x270 채움(서버 1058 PASS+라이브 panel row 수 증가).**
4 함대선택 (FUN_004f6600, +0x624)                            ✗ row 위젯(1) + 데이터(3) 선결
5 명령메뉴 build (FUN_004f5cb0, 클라 내장 카탈로그)           ✗ 선택(4) 선결
6 명령 row dispatch (FUN_004f93c0→FUN_005737d0→0x0b01)       ✗ 메뉴(5) 선결
```
**전략-명령 서브시스템 전체가 autologin/revival 월드서 미구성·미초기화.** 단발 force/click/key/직접call은 항상 다음 미초기화 레이어로 귀결(9 에이전트·19 라이브세션 전수 확정). **종결 = 이 6-레이어 서브시스템을 구성/구동하는 다중-컴포넌트 구현**: ①씬-셋업 패널 구성 경로(FUN_0054e570→FUN_004ff3c0)를 autologin 월드서 트리거(or 직접구동) ②0x0325 네이티브 756B 레이아웃 RE→officer 필드(0x24c/0x250) 서버 배선 ③catGate→선택→메뉴→dispatch 자연/직접 구동. 각 레이어 positive-control 검증. **이것이 60+ 사이클이 못 닫은 이유의 완전·최종 기계적 설명이며, 솔로 단발이 아니라 서브시스템 구성 구현이 필요함을 라이브로 확정.**

## ~~★★C002 아키텍처 크럭스~~ (아래는 해결 전 가설 — 위 결정적 해결로 정정됨)
mode0 grid(0x126718)와 mode2 grid(0x2a58f8)가 **물리적으로 분리**, 전략 클릭(mode2)을 mode0 consume(FUN_0050d230)이 자연 처리할 구조가 아니다. 게다가 전략 0x0b01 task는 **mode0 consume이 아니라 StrategySequence case0**(FUN_004fef90→FUN_004f9030→FUN_004f96d0)가 seed하는데, case0는 빈 task리스트로 자연 진입 못 함(live8: FUN_00501e30 0회). 즉 (latch +0xb02) · (mode0 consume) · (StrategySequence case0 task) 세 경로가 자연 상태선 연결되지 않는다. **종결 = 단순 toggle/forcing 아님**(verifier NO-GO + 메모리 60+ 사이클 b01=0). 후보: (a) 원작 전략 상호작용 흐름/데이터 복원 (b) 합성 브리지(case0 1회 부트스트랩 + enqueue→latch 위젯 라우팅 + mode0 grid 채우기 + 1프레임 mode0 consume) — 복잡·고위험, 라이브 다각 검증 필수.

참조 함수: FUN_00507f20·FUN_005015f0·FUN_00500580·FUN_00500b70·FUN_004e96f0·FUN_004b68f0·FUN_0050d230·FUN_004fef90·FUN_00501e30·FUN_004f96d0·FUN_00581c80·FUN_004d6310·FUN_004c2c80·FUN_005751b0·FUN_004ba2b0·FUN_004c45f0·FUN_004c4170·FUN_004c32a0·FUN_004c1c30. 라이브 증거: `.omo/ui-explorer/live7-probe`(enqueue this=DAT_02215e2c), `live8`(FUN_00501e30 0회), `live4-click`(마우스 도달·0x0b01 미발신).
