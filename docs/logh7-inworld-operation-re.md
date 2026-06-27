# LOGH VII — 인월드 조작(이동모드 진입 → 0x0b01) 4각도 종합 확정

**목표:** 전략맵에서 함대 이동명령(`0x0b01` CommandMoveGrid)을 실제로 발사하는 전체 경로를, 4각도 재RE 결과를 종합해 단일 확정 모델로 정리한다. 라이브 차단의 **가장 유력한 단일 원인**을 지목하고, **자율(서버/데이터 수정) / 라이브(입력) / 추가RE**로 다음 액션을 분류한다.

**출처:** `.omo/ghidra/export/G7MTClient/` (imagebase 0x400000), `tools/logh7_redex.py`. 4각도 결과 + 선행 `docs/logh7-movemode-re.md`·`docs/logh7-strategic-input-wire.md`·`src/server/logh7-login-session.mjs`·`logh7-command-engine.mjs`. 본 문서의 모든 핵심 클레임은 redex 디컴파일로 **재검증**했다(아래 §검증로그).

**라이브 계측(반드시 정합):** navGate passed(terrain OK)·moveHandler(FUN_00570a10) **0회**·DAT_02214325 **항상 0**·커서이동 OK. → 아래 모델은 이 4개 사실과 모두 정합한다.

---

## (a) 이동모드 진입 전체 경로 확정 (입력 → … → moveHandler → 0x0b01)

전체 경로는 **단일 입력 이벤트가 아니라 "서버발 턴-레디 신호 × 함대선택 상태 × 카테고리 다이얼로그 오픈"의 곱**이다. 4각도가 같은 체인을 서로 다른 각도에서 비춘 결과 완전히 합치한다.

```
[L0] 월드 진입 (G1~G3: gridActive/field-mode2/world-active 충족)            P0
        clientBase+0x126710!=0, +0x126711==2, +0x2a58f8!=0
            │  (선행 strategic-input-wire §1.1, 라이브 'navGate passed'와 정합)
            ▼
[L1] G4 — 서버가 함대를 그리드 오브젝트로 배치 (0x0313/0x0315)             P0(코드)/P1(현상태 미충족)
        cell grid clientBase+0x2c03cc → object table +0x2c1755
            │  ※ 현재 서버는 EMPTY 그리드를 보냄(선행 §1.2) → G4 미충족 가능
            ▼
[L2] G5 — PLAYER_INFO ↔ unit linkage (자기 함대가 "선택가능 소유유닛")    P0(로직)/P1(미성립)
        FUN_004c2a80(0):
          char[0] dword0 == *(clientBase+0x3584a0)   (선택char id 매칭)  ─┐
          char+0x24(flagship) == grid-unit.id(+0x41a368, stride0x58)    ─┤ 둘 다 hit
          → FUN_004c2c80(0,char)  PLAYER_INFO 슬롯0(소유함대)에 push      ─┘
        실패시: 무음(로거 FUN_005923a0 = no-op 스텁) → 슬롯0 빈 채 진행
            │  호출자 = FUN_004ba2b0(0x0b0a 수신) / FUN_004b76e0(월드브링업)
            ▼
[L3] 턴-레디 게이트 — 서버가 "내 명령페이즈" 신호를 recv-queue에 넣음     P0(로직)/P1(미충족=최유력)
        FUN_004b7890 → FUN_004b8950:
          clientBase+0x3552b8부터 500엔트리(stride 0x14, +0x10=active) 스캔,
          실행대기 서버메시지 있으면 nonzero, 없으면 'Waiting' → DAT_02213e90=0
            │
            ▼
[L4] 전략 시퀀스 상태머신 FUN_004fef90 (←FUN_004b68f0 월드메인루프)        P0
        진입부: FUN_004b7890()==false면 'STRATEGY_SEQUENCE Waiting…' 후 즉시 return
        (→ case1 미진입 → 아래 전부 미실행)
        true면 DAT_02213e90=1, switch(*(param_1+4)):
          case1(능동 Ready 턴)에서만:
            FUN_0058ee70()==0이면 return
            FUN_004fd100()  (catGate)  ← 다이얼로그/입력 처리
            FUN_004f90d0()  (다이얼로그 스택 워커)
            (DAT_02214332&0x40 입력 edge면 FUN_004b78a0로 STRATEGY 명령 송신)
            │
            ▼
[L5] catGate FUN_004fd100 (전략맵 update; 다이얼로그 오프너 아님)          P0
        게이트 FUN_004fc470 = FUN_0050cf40(0x6a)!=0  (UI 서브상태 0x6a)
        말미 모드전이(DAT_00c9e2f8==0 && +0x128<=0 통과 후):
          FUN_005015f0(2, widget+0x14/0x18/0x24/0x28) 히트테스트 →
          FUN_004fd7a0(2,1)  ⇒ widget+0xf4 = 2  (mode2 = 이동)
        (DAT_02214325&0x40 분기는 K키 HUD 토글일 뿐 — 이동모드와 무관, §각도D)
            │
            ▼
[L6] 다이얼로그 항목 update 루프 FUN_004f9270 (←FUN_004f90d0)             P0
        활성 다이얼로그(SELECT_TXT_STRATEGY_CATEGORY, factory FUN_0058aa80,
        type 0x13, factory-table _DAT_00c9e354=index22)의 현재 아이템:
          slot1(*item+4)=predicate → 참이면 slot2(*item+8)=action 호출
            │
            ▼
[L7] moveHandler FUN_00570a10  (vtable PTR_00676a64 슬롯53@0x676b38)        P0
        = "SendSimpleDataCommand" 항목의 action(slot2) 핸들러
        진입게이트: if (*(char*)(this+0x48) == 0)  → FUN_004d51d0(0) (선택해제)
                    else                            → "Please choose the grid"
                                                       FUN_004d51d0(this,2) (이동모드 ON)
        반환 {0,1,3,6} = FUN_004f9270 switch가 소비하는 FSM 코드
            │  (소유권 재검증: 별개 FUN_00570940 vtable slot123 →
            │   선택유닛 id를 0x2b707c·0x2b6a78 테이블에서 조회, 실패시 '実行不可' return9)
            ▼
[L8] 목적지 셀 좌클릭 → 항행게이트 FUN_004d6310 통과셀 widget 등록             P0
        (라이브 'navGate passed' = 이 단계 자체는 OK)
            │
            ▼
[L9] confirm 서브스테이트 (in-world FSM FUN_0050d230 ←FUN_004b68f0)        P0 (선행 movemode-re §c/§d)
        → FUN_004b4600 → FUN_004b78a0 (case 0x3a → 0xb01)
        ⇒ 0x0b01 CommandMoveGrid 36B/9dword 송신  ✅
```

### 단계별 confidence 요약
| 단계 | 내용 | confidence |
|---|---|---|
| L0 | G1~G3 월드 진입(gridActive/mode2/world-active) | **P0** (라이브 navGate정합) |
| L1 | G4 서버 그리드 오브젝트 배치 | P0(코드)/**P1**(현 서버 EMPTY) |
| L2 | G5 PLAYER_INFO↔unit linkage(3중 id 매칭, 무음 실패) | **P0**(로직)/**P1**(미성립 의심) |
| L3 | 턴-레디 recv-queue 신호 | **P0**(로직)/**P1**(미충족=최유력) |
| L4 | FUN_004fef90 case1 Ready 게이트 | **P0** |
| L5 | catGate FUN_004fd100 mode2 전이 | **P0** |
| L6 | FUN_004f9270 아이템 action 디스패치 | **P0** |
| L7 | moveHandler FUN_00570a10 (widget+0x48 게이트) | **P0** |
| L8 | 좌클릭 → 항행게이트 통과셀 등록 | **P0** (라이브 navGate정합) |
| L9 | confirm → FUN_004b4600/004b78a0 → 0x0b01 | **P0** (선행 movemode-re) |

**한 줄 핵심:** moveHandler(L7)는 직접 호출이 절대 없고(redex `calls FUN_00570a10` = 자기 자신만), 오직 **카테고리 다이얼로그가 활성 스택에 올라 그 아이템이 매 프레임 update될 때(L6)**만 도달한다. 그 다이얼로그/아이템 순회는 **시퀀스가 case1(Ready)일 때만(L4)** 돌고, case1 진입은 **서버가 recv-queue에 명령페이즈 메시지를 넣어야(L3)** 열린다. 그리고 그 안에서 "이동" 항목이 활성(widget+0x48 != 0)이려면 **G5 linkage로 자기 함대가 PLAYER_INFO에 들어가 있어야(L2)** 한다.

---

## (b) 라이브 미발화의 가장 유력한 단일 원인

라이브 사실 4개를 게이트별로 대조하면 원인 후보가 자동으로 좁혀진다.

| 라이브 사실 | 의미 | 어느 게이트를 가리키나 |
|---|---|---|
| navGate passed (terrain OK) | L0·L8 항행판정 경로는 살아있음 | L0~L3 상위만 남음 |
| **moveHandler 0회** | L7에 **도달 자체 못 함** | L2/L3/L4/L6 중 하나가 차단 |
| **DAT_02214325 항상 0** | K키 cooked-state(각도D) — **이동모드와 무관** | (원인 아님; 0x6a/명령페이즈 비활성의 *동반 증상*) |
| 커서이동 OK | 메시지펌프/입력폴(FUN_005009d0)은 정상 | 입력 레이어 정상 |

**결정적 추론:** moveHandler가 0회 → **'実行不可'(FUN_00570940 소유권 거부) 메시지조차 안 뜬다** → 거부 게이트(L7 후단)에 **도달조차 못 함** → 차단은 L2~L6의 더 상류다. 두 후보가 남는다:

- **후보 A — L3 턴-레디 미충족(시퀀스 Waiting):** 서버가 "내 명령페이즈/턴 시작" 메시지를 recv-queue(+0x3552b8)에 한 번도 안 넣어서 FUN_004fef90이 'Waiting'으로 즉시 return → case1 자체가 안 돌아 catGate가 다이얼로그/아이템을 **평가조차 안 함**. DAT_02214325가 항상 0인 것(0x40 명령페이즈 비트 한 번도 안 켜짐)과 정합.
- **후보 B — L2 G5 linkage 무음 실패:** 서버가 0x0b0a로 FUN_004c2a80(1)을 돌렸으나 char.flagship(0x0323@+0x24) ↔ unit.id(0x0325 rec+0)가 매칭 안 돼 PLAYER_INFO 슬롯0이 빈 채 진행('自分の旗艦が見つからない' 무음). → 선택가능 소유함대 객체 부재 → 클릭대상 없음 → widget+0x48 미세팅 → moveHandler가 mode2로 못 감.

**🎯 유력 단일 원인 = 후보 B의 구체형: 0x0b09(NotifyEnterGridBegin)가 클라 char-record count(+0x36a5dc)를 0으로 리셋해, 0x0f02에서 미리 보낸 0x0325/0x0323 레코드가 0x0b0a 시점에 잔존하지 않아 G5 linkage가 무음 실패한다. (confidence P1-강)**

근거(코드+서버 주석 정합, 디컴파일 재검증 완료):
1. FUN_004c2a80은 char 배열을 `*(param_1+0x36a5dc)`(count)만큼만 순회한다 — count가 0이면 **루프가 한 번도 안 돈다** → bVar1 영원히 false → FUN_004c2c80(0,...) 0회 호출 → PLAYER_INFO 슬롯0 영원히 빈 채. (redex `func 0x004c2a80`: `if (0 < *(int*)(param_1+0x36a5dc)) { ... }` 확인)
2. 서버 자신이 이 함정을 이미 문서화: `src/server/logh7-login-session.mjs:1149-1153` — *"0xb09 NotifyEnterGridBegin RESETS the client char-record count (clientBase+0x36a5dc) to 0, so the 0x0325/0x0323 sent back at 0x0f02 are no longer resident when 0xb0a triggers FUN_004c2a80(1)."* 즉 begin→end 사이에 레코드를 **재전송**해야 한다는 미완 가설이 코드에 박혀 있다.
3. 로거가 no-op 스텁(redex `func 0x005923a0` = `return;`)이므로 linkage 실패는 **조용히** 일어난다 → 라이브에서 아무 에러도 안 뜨고 moveHandler만 0회. 정확히 관측과 일치.
4. 후보 A(턴-레디)도 동시 미충족일 가능성이 높지만(서버가 전략 명령페이즈 개시 메시지를 발신하는 코드는 아직 없음), B가 더 "구조적·확정적"이다: A는 메시지 코드 미상(추가 와이어RE 필요, P2)인 반면 B는 **이미 코드/주석으로 메커니즘이 특정**되어 서버 수정만으로 검증 가능하다.

> ⚠️ 정정 누적(중요): 라이브에서 DAT_02214325==0은 **원인이 아니라 증상**이다(각도D P0). 그것은 K키 cooked-state일 뿐이고, 이동모드는 raw VK 바이트가 아니라 vtable[53] 다이얼로그-항목 콜백으로 진입한다. 또 선행 movemode-re §(a) 정정대로 DAT_009d2a3c는 1→2 writer가 클라에 없는 **서버 응답 폴링 채널**이다. 두 정정 모두 본 종합과 정합.

---

## (c) 다음 액션 (자율 / 라이브 / 추가RE 분류)

### 🥇 #1 [자율 — 서버/데이터 수정] G5 linkage 무음 실패 해소: 0x0b09↔0x0b0a 사이 레코드 재전송 (가장 가능성 높음)
- **무엇:** `src/server/logh7-login-session.mjs`의 grid-enter 시퀀스에서, `buildNotifyEnterGridBeginInner({value:0})`(0xb09) **직후·`buildNotifyEnterGridEndInner`(0xb0a) 직전에** 플레이어 `0x0325`(unit, count≥1) + `0x0323`(char, flagship `char+0x24` == 그 unit.id) + `0x0204`(선택char id == char[0] dword0)를 **재전송**한다. 0xb09가 count(+0x36a5dc)를 0으로 리셋하므로, 0xb0a가 FUN_004c2a80(1)을 돌리는 시점에 char/unit 레코드가 **잔존**하도록 보장하는 것이 핵심.
- **왜 자율로 풀리나:** 클라 패치 불필요. 메커니즘이 이미 코드/주석에 특정되어 있고, 3중 id 매칭(char[0]==selectedChar, char+0x24==unit.id)은 전부 서버 레코드 정합성 문제다. 와이어 빌더(logh7-wire 스킬)로 byte-correct 재전송만 하면 된다.
- **검증(라이브):** 패치 후 ui_explorer로 월드 진입 → moveHandler가 0→1회 이상 발화하는지 trace. 그 전에 Frida로 FUN_004c2a80 진입직후 `clientBase+0x36a5dc`(char count)·`+0x41a364`(unit count)·char[0] dword0·char+0x24·`+0x3584a0`(selected char id)를 캡처하고 **FUN_004c2c80(0,...) 발화여부**를 본다 — 1회라도 불리면 G5 linkage 성공(슬롯0 채워짐), 0회면 여전히 데이터 전제 실패(어느 id가 안 맞는지 위 값으로 즉시 판별).

### 🥈 #2 [자율 — 서버, #1과 병행 가능] 턴-레디 신호: recv-queue에 명령페이즈 개시 엔트리 주입
- **무엇:** 서버가 플레이어 전략 턴/명령페이즈 개시를 알리는 인바운드 메시지를 발신해 클라 recv-queue(+0x3552b8)를 채워 FUN_004b8950(Ready)을 true로 만든다. 후보 메시지코드는 case1 분기에 등장하는 0x356(NotifyInformationCharacter) 또는 0xb0d 계열(각도C 추정, **P2 — 코드 확정 미완**).
- **왜:** L3가 안 열리면 #1로 G5를 고쳐도 case1 자체가 안 돌아 다이얼로그/아이템 update가 안 일어난다. #1과 #2는 AND 조건일 가능성이 높으므로 **둘 다** 충족시켜야 moveHandler가 돈다.
- **선행 추가RE 필요:** 어떤 inbound 메시지코드가 recv-queue 엔트리를 active(+0x10!=0)로 만들어 case1을 Ready로 전이시키는지 = 추가RE(아래 #3)로 먼저 확정.

### 🥉 #3 [추가RE — #2의 선행] recv-queue active 엔트리를 쓰는 인바운드 메시지코드 특정
- **무엇:** clientBase+0x3552b8 큐의 엔트리 +0x10(active)·+0x0(실행시각)을 **쓰는** 인바운드 디코드 경로를 redex로 역추적(FUN_004ba2b0 메인 디스패처에서 어떤 case가 큐 write로 분기하는지). 그 case의 메시지코드가 #2의 발신 대상.
- **왜:** #2의 P2 불확실성을 P0로 끌어올리는 유일 경로. (도구: `redex grep "0x3552b8"`, `redex calls FUN_004ba2b0`.)

### (라이브 단독 시도는 비권장)
표준 키/마우스 단발로는 절대 이동모드가 안 열린다(각도 A·C·D P0, 라이브 ~20입력 0회와 정합). 따라서 "HUD 좌표 클릭"만 바꿔보는 라이브-단독 시도는 #1·#2의 서버 전제가 충족되기 전엔 무의미하다. 단 #1 적용 후 검증 단계에서 카테고리 다이얼로그가 열렸는지 확인하려면, 키바인드 후보(각도C #10: C키→FUN_004fde60 카테고리 위젯 init, 또는 키 0x40→0xc05)를 라이브 trace로 보조 확인할 수 있다(P1, 검증 보조용).

---

## (d) 4각도 confidence 표

| 각도 | 핵심 결론 | 본 종합에서의 채택 | confidence |
|---|---|---|---|
| **A** vtable[53] dispatch | moveHandler는 직접호출 0, 카테고리 다이얼로그 아이템 action(slot2)으로만 진입; case1(Ready)+턴-레디(recv-queue) 전제 | **채택**(L3·L4·L6·L7 골격) | 디스패치체인 **P0** / 트리거합성·미상조각 **P1~P2** |
| **B** G5 linkage | 3중 id 매칭(char[0]==selectedChar, flagship==unit.id), 무음 실패(로거 no-op), 실제 소유권게이트 FUN_00570940→'実行不可', widget+0x48 게이트 | **채택**(L2·L7; 유력원인 후보 B의 근거) | 로직 전부 **P0** / "데이터 전제 실패" **P1-강** |
| **C** catGate 오픈조건 | FUN_004fd100/FUN_0052f700는 오프너 아닌 update 루프; case1+Ready+FUN_0058ee70 통과 시에만 mode2 전이; DAT_02214325 0x40은 동반증상 | **채택**(L4·L5·L6) | 게이트 구조 **P0** / 트리거 전제·메시지후보 **P1~P2** |
| **D** 입력 VK 뱅크 writer | 0x02214320~28 = VK cooked-state(0x25=K키); 이동모드는 이 뱅크에 트리거 없음; DAT_02214325는 원인 아닌 K키상태/동반증상 | **채택**(브리핑 'byte[5]&0x40 게이트' 전제 기각; 입력 레이어 정상 확인) | VK뱅크 writer/reader 전수 **P0** / 다이얼로그 오프너 입력후보 **P1~P2** |

**상충 해소:** 4각도는 상충하지 않고 같은 체인의 다른 층을 본다. A/C는 "다이얼로그가 안 열려서(상류 case1/Ready 미충족)"를, B는 "함대가 선택가능 소유유닛으로 안 올라와서(G5)"를 지목한다. 라이브 사실(moveHandler 0회 + '実行不可'조차 무발화)은 **두 상류 게이트(L2 G5, L3 턴-레디)가 함께 미충족**임을 시사하며, 둘 중 **서버 수정으로 즉시 검증 가능하고 코드/주석에 메커니즘이 이미 특정된 B(0xb09 count-reset)가 1순위 액션**이다.

---

## 검증로그 (redex 재검증, 본 세션)
- `calls FUN_00570a10` → 자기자신만 (직접 호출자 0건 = vtable 슬롯 진입 확정, 각도A P0 ✔)
- `func 0x00570a10` → `s_Please_choose_the_grid_`, `if (*(char*)(param_1+0x48)=='\0') FUN_004d51d0(0)` else `s_SELECT_TXT_STRATEGY_CATEGORY` 분기 ✔ (각도A·B P0)
- `func 0x004c2a80` → `if (0 < *(int*)(param_1+0x36a5dc))` count 게이트, `*piVar5==*(param_1+0x3584a0)` + `piVar5[9]==*piVar4` → `FUN_004c2c80(0,piVar5)`, `+0x41a364` u16 unit count ✔ (각도B P0)
- `func 0x005923a0` → `return;` (no-op 로거, 무음 실패 ✔)
- `func 0x004b7890` → `FUN_004b8950()!=0` 위임 ✔; `func 0x004b8950` → `+0x3552b8` 500엔트리 stride5 스캔, `uiRecvQueCount`/`m_iQueExecCount` ✔ (각도A·C P0)
- `func 0x004fd100` → `DAT_02214325&0x40`(K키 토글), `DAT_00c9e2f8==0 && +0x128<=0` 후 `FUN_005015f0(2,…)`→`FUN_004fd7a0(2,1)` mode2 ✔ (각도C·D P0)
- `grep STRATEGY_SEQUENCE` → FUN_004fef90 (`s_STRATEGY_SEQUENCE_NUM`) ✔
- 서버 정합: `logh7-login-session.mjs:1149-1153` 0xb09 count-reset 함정 주석 ✔; `logh7-command-engine.mjs:109` `COMMAND_MOVE_GRID_CODE=0x0b01` ✔

---

## (f) #1(G5 0x0204) 적용 + 라이브 재검증 (2026-06-19)

`logh7-login-session.mjs` grid-enter 재전송에 **0x0204(selectedChar==char[0]) 추가**(commit c7e768d, 순서 0x0204→0x0325→0x0323, 920 그린). 라이브 재검증(movetest 클라 + Frida 프로브, PID 재attach):
- 0x0204 trace 2회(월드진입 + grid-enter 재전송 = fix 활성), 0x0b0a 발화, HUD 초상/패널 렌더(NO DATA 아님).
- **단 moveHandler/modeSetter 여전히 0회** — navGate는 홈셀(50,24) passed=true(terrain OK 재확인).
- **결론: #1(G5 selectedChar)은 필요조건이나 단독 불충분 = RE 워크플로의 "#1 AND #2" 가설 라이브 확정.** moveHandler(카테고리 다이얼로그 경유)가 안 도는 건 **#2 turn-ready(명령페이즈 recv-queue active 엔트리, case1→Ready) 미충족** 때문. → 다음 = #2 메시지코드 RE(어떤 S→C 레코드가 클라를 command-ready로 전이시키나) 후 서버 발신.
