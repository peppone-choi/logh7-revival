# mode dispatcher 프런티어 종결 플랜 — 2026-06-26

저장소 `E:/logh7-revival` · RE 인덱스 `RE/.omo/ghidra/export/G7MTClient/functions.jsonl` ·
바이너리 `RE/.omo/ghidra/bin/G7MTClient.exe` (imagebase 0x400000, foff=VA-0x400000) ·
캐논 playable `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe` (sha 992dc7e2, **미교체 원칙**).

이 문서는 5건의 mode dispatcher deep-RE(dispatcher / ownfleet-gate / case0-render / dialog-poller /
natural-flip)를 종합해, **EXE-force가 아닌 자연경로·서버푸시·입력경로로 interactive(menu) mode를
켜고 own-fleet을 selectable로 렌더하는 closure**를 찾는 단일 권위 RE 문서다.

★전제(60+ 사이클 누적): mode-force / event-9 force / latch(+4=0) force / +0x126718 강제 / DAT_007ccffc+4=0
강제는 **전부 화면을 깨거나 무효**임이 라이브로 반증됨(메모리 5차 라이브 시퀀스 + loop-state 12 run).
따라서 본 문서는 read-only RE 결론과 read-only Frida probe 스펙만 다루며, EXE-force는 (e) 랭킹의
**최후 수단**으로만 명시한다.

---

## (a) 게이트 funnel 구조도

월드-인 메인 루프 디스패처 **`FUN_004b68f0(esi = 거대 월드 전역객체)`** 가 모든 인-월드
상호작용의 단일 깔때기다. 두 종류의 상태 축이 직렬로 연결된다.

```
FUN_004b68f0  (월드-인 메인 루프 디스패처, esi=월드객체)
│
├─[A] 월드진입 1회 트랜지션 블록   게이트: esi[0x35837f]==0 (자기 self-latch=1)
│      선행: 0x4b6a43 FUN_004b7650 / 0x4b6ab0 FUN_004b76e0 (둘 다 true 필요)
│      ┌── latch selector  cl = [esi+0x35f35a]   (read1 / write0 = 전체 18k 함수 writer 0건)
│      │      selector==0  → iVar7=2 (기본)
│      │      selector!=0  → iVar7=1
│      ├── iVar7==1 → FUN_0054e570()  +  FUN_004c32a0()  ("WorldIn_TacticsFieldImport", mode0 setter)
│      └── iVar7==2 → (선행 esi[0x358382]!=0xff && !=2) FUN_004c4170() ("StrategyFieldImport", mode2 setter)
│            두 setter → FUN_004c45f0(obj, mode) = 디스패처 바이트 [0x126710] writer (유일)
│                mode0 → byte[0x126711]=0,  init 영역 [0x126718]부터 0x5fc77 dword zero (≈1.5MB)
│                mode2 → byte[0x126711]=2,  init 영역 [0x2a58f8]부터 0x6959 dword zero
│
├─[B] 매프레임 mode poller   cVar = [esi+0x126711]   (switch)
│      ┌ ==0  게이트 [0x126718]!=0 → FUN_004f6f60·FUN_005266e0·FUN_0050d230·FUN_0050cf10·FUN_004b6e00·FUN_004c9640
│      │        = ★ interactive / consume  (0x0b01 클릭확정 소비처 = FUN_0050d230)
│      ┌ ==1  → (poller 없음) idle / transition
│      ┌ ==2  게이트 [0x2a58f8]!=0 → FUN_004f6f60·FUN_005266e0·FUN_004fef90·FUN_0050cf10
│      │        = ★ strategic / enqueue  (event-9 enqueue = FUN_004fef90, 유일 호출처=본 디스패처)
│      └ else → FUN_005923a0 (에러)
│
└─[C] outer-else (트랜지션 미완 = 0x35837f 게이트 이전, mode poller 아님)
       FUN_0054eda0()  (다이얼로그 opener)  →  FUN_0054ee60()  (예/아니오 poller)
       결과!=0 → load-trigger arm (+0x357e84=0, +0x357e88=0x3f800000, *esi=1)
```

### 이 funnel에 매달린 5개 프런티어

| 프런티어 | 진입 경로 | 핵심 게이트 함수 |
|---|---|---|
| **C002 (인-월드 클릭→0x0b01)** | [B] poller ==0 (mode0/consume) | FUN_0050d230 dequeue, +0xb01/+0xb02 |
| **own-fleet selectable 렌더** | [B] ==2 case0 → FUN_004fef90 event-9 enqueue → FUN_0058d140 6-AND | FUN_0058d140 (G1~G6) |
| **캐릭생성 예/아니오 다이얼로그** | [C] outer-else FUN_0054eda0/FUN_0054ee60 | FUN_0056f960 +0xde0 게이트 |
| **맵전환 / 상태전환 (AXIS2)** | poller 외부, 와이어 0x0f1f/0x0b09/0x0b0a → load-arm | FUN_004c1b20, FUN_004ba2b0 case 0xb0a |
| **전술맵 / 직무·기지패널** | [A] setter mode0(Tactics) + 씬 KIND(FUN_0054e570 kind3) | FUN_0051ca30, +0x234 패널 writer |

---

## (b) 각 게이트 RE 확정 조건

### [A] latch selector `[esi+0x35f35a]` (interactive↔strategy 초기 선택)
- disasm 0x4b6af2 `mov cl,[esi+0x35f35a]` / 0x4b6afb `test cl,cl` / 0x4b6afd `mov eax,2`(기본) /
  0x4b6b06 `je 0x4b6b11` / 0x4b6b08 `mov eax,1`. → `iVar7 = (selector==0 ? 2 : 1)`.
- **★결정적: 이 바이트의 writer가 전체 18k 함수 인덱스에 0건**(절대-disp 0x35f35a 참조 = foff 0xb6af4
  단 1건, 읽기). 다른 base 레지스터(객체의 다른 핸들/별칭)로만 쓰일 수 있음.
- 기본값 0 유지 → FSM이 **항상 iVar7=2 (strategy/mode2) 선택** → "전략맵만, interactive 안 켜짐"
  증상과 정확히 정합. **이것이 정체 근본의 정적 식별.**

### [B] 매프레임 mode poller `[esi+0x126711]`
- 유일 writer = `FUN_004c45f0`의 0x4c4688 `[0x126710] store`의 byte1. = 0(mode0), 2(mode2).
- 재진입 가드 = init-region 플래그: mode0은 0x4c4655 `[esi+0x126718]!=0`이면 re-init skip,
  mode2는 0x4c462c `[esi+0x2a58f8]!=0`이면 skip. → selector가 매 stage 재평가돼도 init은 1회.
- `FUN_004c45f0` 호출자 = **정확히 2개**: FUN_004c4170(mode2) + FUN_004c32a0(mode0).

### [B/case0] own-fleet event-9 enqueue `FUN_004fef90`
- 호출처 = **FUN_004b68f0 단독**(redex `calls 0x004fef90` = 0x004b68f0). → mode2 poller에서만 돈다.
- 진입 게이트: 선두 `if(*(char*)(*(int*)(param_1+0xc)+0x3a0)=='\0') return;` (StrategySequence 비활성이면 즉시 반환).
- `switch(*(int*)(param_1+4))` = StrategySequence state. case0(state==0)에서만 1프레임 실행 후
  `*(param_1+4)=1` self-latch → **재진입 불가(1회성)**. case0 끝에 FUN_00501e30(.,0,9) = event-9 enqueue.
- param_1 = g_StrategyClient (메모리 라이브 캡처 = 0x5393830).

### [B/case0] own-fleet 렌더 6-AND 게이트 `FUN_0058d140`
- **G1** = FUN_0058d110: `*param_1!=0` AND `FUN_0050cf40(0x6b)!=0` (HUD 위젯 슬롯 0x6b=107 로드).
- **G2** = `iVar9=*(DAT_007ccffc+8)` 이며 `iVar9!=0 && iVar9!=-0x24` (활성 char-record ptr, -0x24=빈슬롯 sentinel).
- **G3** = `DAT_007cd04c != -0x11174` (=DAT_007ccffc+0x50, own_cell 페이지 base NULL 회피).
- **G4** = `FUN_004b5b50(p)=p+0x318 != 0` (매니저 서브객체 +0x318 생존).
- **G5(핵심)** = `col = *(DAT_007cd04c+0x11178) % 100`, `row = … / 100`,
  `0<=col<100 && 0<=row<0x32(50) && FUN_004c8b70(col,row)!=0` (100×50 그리드 유효 좌표).
  FUN_004c8b70: terrain 테이블 base+0x2c03cc, r*100+c 색인.
- **G6** = `FUN_004c7290(key)!=0`: char_table stride 0x370, limit 0x80e80 순회, 슬롯 활성+
  `FUN_004b5b80(slot)=*(slot+0x24)==key`(flagship unit.id) 매칭 시 slot+0xa4(PLAYER_INFO) 반환.

### [B] own_cell `*(DAT_007cd04c+0x11178)`
- **전체 18k 함수 디컴파일 인덱스에서 14개 참조 전부 READ, WRITE 0건.** 사용 형태 일관 `/100`·`%100`
  = 셀ID→(행,열) 분해 후 커서/카메라/렌더 위치 소비.
- 유일 현존 라이터 = strat-camera-focus **EXE 패치**(=force, 캐논 playable 빌드엔 포함되나 자연경로 아님).
- 0x0b07 NotifyMovedGrid→FUN_004bee20은 +0x11178 미참조(메모리 "0x11178=카메라 포커스라 불변"과 정합).

### [C] 예/아니오 다이얼로그 입력 게이트 `FUN_0056f960`
- 상단 게이트(0x56f9ac): `if(*(+0xde0)!=1 && *(+0xde0)!=2) goto LAB_0056fb04;`(콜백 미생성).
- yes위젯 +0x24 → +0xde0=3, no위젯 +0x28 → +0xde0=4 (FUN_005033b0/FUN_005015f0 hit-test 통과 시).
- +0xde0=1 유일 라이터 = `FUN_00570340`: `DAT_00675138 + page*0xa0 == -1`(빈 페이지)이면 +0xde0 미설정,
  비어있지 않을 때만 `*(+0xde0)=1`. (page1=[] 빈, page4=[3,6,7,4,5], page5=[2,6,4,5] yes/no 포함).
- poller `FUN_0054ee60`: +0x14(인스턴스)==0→0, +0x10(armed)==0→-1, 둘 통과+게이트 열림이면 3/4 반환.
- armed +0x10=1 라이터 = opener `FUN_0054eda0`(param2=0→page5, =1→page4, 둘 다 유효).
- opener 자연 호출 = `FUN_0051a370`(CHAR_SELECT_SEQUENCE FSM) case1. 단 진입부 `FUN_004b7890`
  (=FUN_004b8950 recv-queue ring +0x3552b8 스캔)이 '\0'이면 'Waiting' 정지, 통과해야 'Ready'→case advance.
- char-create 컨텍스트 게이트 `DAT_022173ec`: 라이터 FUN_0051ca30(kind3 char-create scene), 0이면 case no-op.

### [AXIS2] 와이어 load-arm (서버푸시)
- `0x0f1f` NotifyTactics → FUN_004c1b20: (+0x2a58f8!=0 || +0x126718!=0)일 때만 `+0x357e8c=2(전술)/0(전략)`,
  `+0x357e88=0x3f800000`. mode 바이트 미설정(이미 켜진 mode 내 load-arm).
- `0x0b0a` NotifyEnterGridEnd → FUN_004ba2b0 case 0xb0a (line1336-1356):
  `+0x126711==2`면 (+0x4376ec=='\0'→FUN_004c2a80(1) / else StrategySequence arm);
  **`+0x126711==0`면 FUN_004c2a80(1) + FUN_004c32a0(1) 둘 다 = 진짜 자연 flip.**
- `FUN_004c2a80(1)` = own-fleet 3-way 매칭: `*piVar5==+0x3584a0(selectedChar, 0x0204)` &&
  `piVar5[9]==+0x41a368(unit 리스트, 0x0325)` 매치 → FUN_004c2c80(0,..) selectable 등록.

---

## (c) autologin vs real-login 차이

| 항목 | autologin(부트스트랩 변종) | real-login(실유저 수동) |
|---|---|---|
| FSM 진입 분기 | [A] init→0x35837f latch→**[B] mode poller 직행** | [A]/[C] CHAR_SELECT_SEQUENCE 경유 |
| char-create 시퀀스 FUN_0051a370 | **건너뜀** (case 진행 안 함) | 매프레임 구동(stage 0x35837a) |
| DAT_022173ec (char-create 컨텍스트) | 0 추정(미셋업) | FUN_0051ca30 kind3 진입 시 셋업 |
| 예/아니오 다이얼로그 | **arm 안 됨**(opener 미호출) → 월드 직행 | opener 도달=필수 관문(현재 무반응 블로커) |
| StrategySequence 엔트리(FUN_004c7290) | 자연 셀렉트 생략 → 슬롯 키 미시드 → miss | 그리드-enter+3-way 매칭으로 시드 가능 |
| own_cell(+0x11178) | 자연 라이터 부재로 0(쓰레기) | 역시 자연 라이터 부재(공통 갭) |

**핵심 통찰**: 다이얼로그 poller·own-fleet 렌더의 자연 closure는 모두 "**char-select 시퀀스가
정상 advance**"에 매달려 있다. autologin은 시퀀스를 건너뛰어 [B] mode poller로 직행하므로 [C]의
opener가 애초에 안 불린다. real-login은 시퀀스를 타므로 게이트가 자연 발생하지만, 현재 (1) 다이얼로그
무반응(opener는 불렸으나 게이트 닫힘 추정)과 (2) own-fleet 미렌더(시퀀스가 state0/3-way 매칭/own_cell을
못 채움)에서 막힌다. → **자연경로 closure의 진짜 레버 = "서버/입력이 char-select 시퀀스를 advance시키는가"**.

---

## (d) ★ 자연경로 closure 후보 랭킹 (리스크 낮은 순)

EXE-force는 **최후**(R5). 위 R1~R4는 화면을 깨지 않는 자연경로/서버푸시/read-only probe다.
모든 probe는 esi(월드객체 base) 라이브 캡처 후 절대주소 = base+offset에 hardware watchpoint(read-only)로 건다.

### R1 — read-only Frida watchpoint로 selector/own_cell 라이터 관측 (최저 리스크, 무변경)
화면 무영향. "누가 자연 상태에서 이 바이트를 쓰는가"를 record-only로 캡처.
- **watch-A**: `[esi+0x35f35a]` (latch selector) write — 월드진입~상호작용 시 어떤 와이어/프레임이
  selector를 1로 advance하는지. writer 0건(정적)이므로 동적/별칭 base 라이터 식별이 1순위 미지수.
- **watch-B**: `[DAT_007cd04c+0x11178]` (own_cell, = DAT_007ccffc+0x50+0x11178) write — 0x0b07/0x0b09
  서버푸시 또는 카메라 이동 시 누가 쓰는지. 정적 WRITE 0건이라 간접/계산주소 동적 라이터 가능성.
- **watch-C**: `*(g_StrategyClient+4)` (StrategySequence state) — 0x0b09/0x0b0a 푸시 후 0→1 시퀀스
  관측. state0(case0=event-9 enqueue) 자연 경유 여부 확정(메모리 5차 라이브 = +4=1만 관측, state0 경유 미확정).

Frida probe 스펙(read-only, 의사코드):
```js
// esi 캡처: FUN_004b68f0 진입 후크에서 this.context.esi 저장(첫 1회)
Interceptor.attach(ptr(0x4b68f0), { onEnter(args){ if(!WORLD){ WORLD = this.context.esi; } } });
// selector watch (read-only, 값 변화만 로그)
Memory.protect / MemoryAccessMonitor 또는 hardware watchpoint(Process.setExceptionHandler) on WORLD.add(0x35f35a)
// own_cell, state도 동일하게 base+offset 주소에 write-watch, 콜백에서 backtrace만 기록(쓰기 차단/변조 금지)
```

### R2 — 서버푸시 0x0b0a 자연 flip 타이밍 측정 (낮은 리스크, 기존 probe 게이트 재사용)
RE 확정: 0x0b0a 수신 시 `+0x126711==0`이면 FUN_004c2a80(1)+FUN_004c32a0(1) **자연 flip 발동**.
단 mode2 import가 이미 +0x126711=2로 만들어 두므로, 자연 발동하려면 0x0b0a 도착 시점에 클라가 아직
mode0(미import) 윈도우여야 함. → **read-only로 0x0b0a 수신 직전 `[esi+0x126711]` 값 캡처**해 윈도우
실재 여부 확정. `LOGH_STATE_TRANSITION_PROBE`(0x0f1f)·0x0b09+0x0b0a 푸시 게이트는 이미 서버에 존재
(login-session.mjs). 함께 selectedChar 3-way 매칭 사전충족(+0x3584a0/+0x41a364/+0x41a368/+0x36a5dc) 캡처.
**주의**: 객체 식별 오인 2회 전례(DAT_007ccffc+4 등) → 단정 금지, 측정 결과로만 진행.

### R3 — char-select 시퀀스 advance 레버 = 서버 recv-queue 메시지 확정 (낮은~중간 리스크)
다이얼로그 poller·own-fleet 슬롯 시드 모두 FUN_0051a370 advance에 매달림. FUN_004b8950 recv-queue
(+0x3552b8 ring)에 어떤 opcode가 들어와야 FUN_004b7890이 'Ready'가 되는지 wire trace로 확정
(후보: 0x0204 selectedChar / 0x0323 char / 0x0325 unit / 세션 ack). 확정되면 서버가 그 메시지를
자연 푸시해 시퀀스를 advance → opener(FUN_0054eda0) 자연 도달 → 다이얼로그 arm. **dialog arm 자체는
서버가 직접 못 켬(+0xde0/+0x10/page 테이블은 전부 클라 로컬), 시퀀스 advance를 통한 간접 closure만 가능.**

### R4 — 입력경로 분리 측정 (낮은 리스크, 진단 전용)
다이얼로그 무반응이 "입력 주입 실패"인지 "게이트 닫힘"인지 분리. read-only로 다이얼로그 open 직후
`dialogInst+0x10(armed)`·`+0x37c(active page idx)`·`+0xde0` 캡처:
- +0x37c==1(빈 page1) → page 잔류가 원인(후보 B 영역).
- +0x37c∈{4,5}인데 무반응 → 입력경로/hit-test 문제로 좁혀짐(C002 입력층과 동류).
전략맵 클릭→자연 mode flip의 정적 경로는 **현재 인덱스상 부재**(FUN_004fd7a0는 tab/seq setter[+0xf4]
로 mode setter 아님 = 정정 확정). 따라서 입력→flip은 서버 0x0b0a 푸시 또는 selector advance가 유일 후보.

### R5 — EXE-force (최후 수단, 사용자 동의 전제, 화면 깨짐 전례)
**R1~R4가 자연 라이터/advance 레버를 못 찾을 때만.** 후보는 byte-verified·same-length로 디스크에 존재:
- moderoute (a): VA 0x4b6afd `02→01` (mov eax,2→1) = 무조건 mode0. 산출 EXE sha 0fda544e (미배포).
  ⚠ mode0='Tactics' import 라벨 → 전술/배틀 데이터 미비로 전략맵 stall/crash 전례 + 0x126718 대용량
  zeroing(0x5fc77 dword≈1.5MB) 충돌 위험. 12 run에서 mode0 강제=렌더 깨짐 반증.
- dialog-inputgate 후보A: VA 0x56f9ac `0f85…→90×6`(게이트 NOP) — 진단용(더블-트리거 위험).
→ **EXE force는 "진단 신호"로만**(살아나는가 1회 확인 후 즉시 SHA 복원), 상시 적용 금지.

---

## (e) 다음 라이브 1세션 실행계획

전제: 스플래시 ~30s 대기, 스테일 node kill, **stop 시 캐논 SHA 992dc7e2 복원 필수**, autologin 금지
(실유저 수동 로그인), 저널(old client-state journal removed during 2026-07-03 cleanup; fresh current evidence path) 기록.

1. **기동 + esi 캡처**: real-login(windowed)으로 0x7000→0x0020 로비→0x2005→캐릭생성 진입. Frida
   attach 후 FUN_004b68f0(0x4b68f0) 진입 후크로 WORLD=esi 1회 캡처. (read-only, 캐논 EXE 무변경).

2. **R1 watch 3종 동시 배치** (write-watch, record-only):
   - `WORLD+0x35f35a`(selector), `WORLD+0x50+0x11178`(own_cell), `g_StrategyClient+4`(seq state).
   - 캐릭생성 완주→다이얼로그→(가능하면)월드진입 동안 backtrace 캡처. **누가 selector/own_cell을 쓰는가**가
     세션 1순위 산출물.

3. **R4 다이얼로그 분리 측정**: 예/아니오 출현 직후 `dialogInst+0x10/+0x37c/+0xde0` 캡처 →
   "빈 page1 잔류" vs "입력경로" 판정. (이게 P0 백로그 2의 read-only 선행 진단.)

4. **R2 0x0b0a 윈도우 측정**: 서버 `LOGH_STATE_TRANSITION_PROBE`(또는 0x0b09+0x0b0a) 푸시 직전
   `WORLD+0x126711` 캡처. ==0 윈도우 실재면 FUN_004c2a80/FUN_004c32a0 자연 flip 도달 여부 관측.

5. **판정 분기**:
   - selector/own_cell 자연 라이터 발견 → 그 와이어/이벤트를 서버가 자연 푸시하도록 R3로 진행(EXE 무변경 closure).
   - 라이터 부재 확정(=정적과 일치) → R3(recv-queue advance opcode) 확정에 집중.
   - 전부 막히고 사용자 동의 시에만 R5 EXE-force를 **진단 신호 1회**로(살아나는가 확인 후 즉시 복원).

6. **stop**: 캐논 SHA 복원, 저널에 전진/정체/회귀 기록.

---

## 60+ 사이클 누적 반증 (재제안 금지 = 죽은 경로)

이미 라이브로 무효/화면깨짐 확정 — **다시 제안하지 말 것**:
- `DAT_007ccffc+4=0` 강제(state0 진입) = +4≠FUN_004fef90 state, param_1≠DAT_007ccffc (정적 객체 식별오류 2회).
- `g_StrategyClient ecx+4=0` 매프레임 강제 = event-9 552회 enqueue되나 +0xb02=0 (enqueue widget≠dequeue widget).
- `+0x126718=1` / mode0 강제(FUN_004c45f0 force) = consume(FUN_0050d230) 작동하나 클라 mode 오염=enqueue 무효.
- owner gate(param_2+5) 강제 / gate05(this+5) = 자연 통과 확정 = 블로커 아님.
- 마우스 입력층(합성/물리 동등) = enqueue=0 확정 = 마우스 문제 아님(mode2 게이트가 진짜).
- `+0x031f group0x5f` / `+0x35f35a` 등 정적 mode/owner 추론의 라이브 단정 = 반증 다수(P1, 측정 선행).
- own_cell(+0x11178) 직접 force = strat-camera-focus EXE 패치 외엔 자연 라이터 없음(force=화면 깨짐 동류 위험).
