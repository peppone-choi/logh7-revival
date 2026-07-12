# LOGH VII — 전술맵 진입 + 함대 이동 와이어 프로토콜 (M5 선행 RE)

정통 클라이언트 `G7MTClient.exe`(sha256 `9c97de2a…`) 정적 RE + 기존 RE 문서 3축 종합. 목적:
2008년 종료된 일본 MMO "은하영웅전설 VII" 합법 보존 복원 — M5(전술·전투) 서버 구현이 흉내내야 할
**전술맵 진입 시퀀스**와 **함대 이동 프로토콜**을 오프셋 단위로 확정한다.

**프레이밍(공통):** C→S 이너 = `[u16 BE code][body]`; S→C conn3 = message32 `[u32 0][u16 code][body]`.
**모든 body 필드는 little-endian**(2바이트 이너 코드 prefix만 BE). float은 IEEE-754 LE.
**바디 오프셋은 프레이밍 prefix 이후 이너 바디 기준.**

> **두 종류의 "크기"를 혼동하지 말 것** (battle-core §서두 재확인):
> - 디스패치 테이블 `FUN_004b8b00`의 `*param_4 = N` = 클라가 그 코드에 **할당하는 고정 in-memory 수신
>   구조체 크기**. 배열 메시지는 32슬롯 최대를 예약하므로 크다(예: NotifyChangeMode 0x298).
> - `Output_*::get_length` = **실제 직렬화 와이어 길이** = `fixed + stride*count` (와이어는 count개만
>   패킹, 32슬롯 예약분은 전송 안 함). **서버는 와이어-패킹(count entries only)으로 emit한다.**

---

## 0. 핵심 결론 (한 눈에)

전술맵은 **두 프로토콜 계층**으로 구성된다. 둘은 별개이며 순서가 있다:

1. **진입(strategic → tactical):** 서버가 전술 read-model 테이블 묶음(위치/함선스탯/실드/빔건/함장
   로스터)을 푸시 → **`0x042f NotifyChangeMode`** (spawn pose + 전술 풀 활성) → **`0x0f1f NotifyTactics`**
   (arg0 byte0=1 = "begin space-war", **시각 전환의 직접 트리거**). 클라 요청 트리거는
   **`0x0411 CommandChangeMode`**(engage 요청)지만 이건 로컬 타이머만 스탬프하고, 실제 전환은
   서버의 `0x042f`+`0x0f1f`가 권위적으로 일으킨다.
2. **이동(전술맵 내):** **`0x0400 CommandMoveShip`**(C→S, 목표 좌표) → **`0x0423 NotifyMovedShip`**(S→C,
   권위 위치 스트림). 이동은 **연속 float XZ 공간**(그리드 양자화 없음). 이는 전략맵 이동
   **`0x0b01 CommandMoveGrid → 0x0b07 NotifyMovedGrid`**(그리드-셀 정수 계층)와 **완전 별개 계열**이다.

**현재 서버 구현 상태(2026-07-05 리셋 후):** 전략맵 이동(0x0b01/0x0b07)만 구현됨. **전술 진입·전술
이동은 전부 미구현** — 기존 문서가 참조하는 `logh7-battle-engine.mjs`/`logh7-command-engine.mjs`는
리셋 때 삭제된 pre-reset 코드다(§7 상세).

---

## 1. 전술맵 진입 시퀀스

### 1a. 진입 트리거 (누가 전술맵을 여는가)

- **클라 요청 = `0x0411 CommandChangeMode`** (C→S). 함대 명령 다이얼로그 계열에서 "engage/교전"을
  선택할 때 발화. 이 코드는 `0x40f CommandSortieTroops`/`0x410 CommandEvacuateTroops`/`0x412
  CommandSortie`와 **동일 applier**(`FUN_004be8c0`→`FUN_004be7c0`)를 공유 — 함대 출격/교전 명령 패밀리다.
- **중요:** `0x0411`은 그 자체로 전투에 들어가지 않는다. applier는 지목된 각 함선에 **pending-action
  타이머만 스탬프**(`entity+0x5c0/0x5bc = (base+len) - now`)한다. 실제 모드 전환은 **서버가 결정**해
  `0x042f`로 grant한다. (battle-core §1b, 증거 `FUN_004be7c0`.)
- **진입 조건(추정, medium):** battle-core §10 서버 계약 — 요청 계정이 `unitIds` 전 함선을 소유하고,
  대상 함대가 접촉(인접 그리드/교전 사거리) 상태일 때 서버가 전투 필드를 만든다. 조우 방식(자동 조우
  vs 명시적 교전명령)은 라이브 캡처로 확정 필요.

**`0x0411 CommandChangeMode` 바디 (struct 0x98=152B; 와이어 = `0x12 + 4*count`):**

| Off | Size | Type | Field | 의미 | 근거 |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `base` | 페이로드 base/타임앵커. `base+len`을 타이머에 사용 | `Input *+0x1c`; `FUN_004be7c0` |
| 0x04 | 4 | u32 | `len` | 페이로드 길이 (base와 pair) | `param_2[1]` |
| 0x08 | 4 | u32 | `field8` | 헤더 slack (applier 미소비) | |
| 0x0c | 1 | u8 | **`unitCount`** | 유닛 id 개수 (1..32) | `Input *+0x24`; applier 루프 |
| 0x10 | 4×N | u32[] | **`unitIds`** | 모드 변경 대상 함선 id (stride 4) | `Input` 루프 `+0x10, +=4` |
| 0x90 | ≤4 | blob | `tail0` | `FUN_00610420` 짧은 read (low byte = sub-mode 추정, 타이머 applier 미소비) | med |
| 0x94 | 4 | u32 | `tail1` | 후행 dword (요청 모드/context 추정) | med |

- 파서 `FUN_004a01e0`(Input_CommandChangeMode). Confidence: 0x00/04/0c/10 = **high**; tail0/tail1 = **medium**.

### 1b. 서버가 푸시하는 전술 read-model 테이블 (진입 셋업)

전투 시작 시 서버는 다음 S→C 테이블을 순서대로 푸시한다. 이들이 클라 전술 풀을 채운다.
(라이브 확정 진입 순서 — tactical-seed-2026-06-26, battle-engine `openBattleField` 11-레코드 순서.)

| 순서 | 코드 | 이름 | 와이어 바디 | 파서 | 근거 |
|---|---|---|---|---|---|
| 1 | **0x0349** | ResponsePositionUnit | `[u16 count]` + count×20B | `FUN_00426360` | tactics-data §7a |
| 2 | **0x033b** | ResponseTacticsInformationUnitShip | `[u16 count]` + count×47B(스탯) | — | tactics-data §1 |
| 3 | **0x0341** | ResponseTacticsInformationFillShield | `[u16 count]` + count×40B (id + shield[6] + fill[6]) | — | tactics-data §3 |
| 4 | **0x0343** | ResponseTacticsInformationFillBeamGun | `[u16 count]` + count×20B (빔건 뱅크A/B) | — | tactics-data §4 |
| 5 | **0x0337** | ResponseTacticsCharacter | `[u16 field0][u16 count]` + u32 char_id×count | — | tactics-data §2 |
| (opt) | 0x033f / 0x034b / 0x0347 | Corps / PositionBase / Obstacle | corps 55B / base 16B×≤4 / 5-섹션 hazard | `FUN_004268b0` 등 | tactics-data §5·7b·8 |
| 6 | **0x042f** | NotifyChangeMode | spawn pose + 전술 풀 활성 (§1c) | `FUN_004a79b0` | battle-core §2 |
| 7 | **0x0f1f** | NotifyTactics | "begin space-war" 시각 전환 트리거 (§1d) | — | tactics-data §9 |

**0x0349 ResponsePositionUnit 레코드(20B, 전투 시작 위치 스냅샷 — 0x0423와 동일 float 공간):**

| Off | Size | Type | Field | Conf |
|---|---|---|---|---|
| 0x00 | 4 | u32 | `id` | high |
| 0x04 | 4 | f32 | `x` | high |
| 0x08 | 4 | f32 | `y` (≈0) | high |
| 0x0c | 4 | f32 | `z` | high |
| 0x10 | 4 | f32 | `heading` (rad, Y-yaw) | high |

### 1c. `0x042f NotifyChangeMode` — 권위적 모드 전환 (S→C) ★KEY

전술 배틀필드로 클라를 넣는(또는 빼는) 메시지. **필드 id + 참가자 리스트 + 각 참가자 spawn pose** 운반.

- 디스패치 `*param_4 = 0x298`(664B). 파서 `FUN_004a79b0`. 클라 핸들러 `FUN_004ba2b0` case 0x42f →
  664B 복사 후 applier **`FUN_004c1c30`**.

**바디 (0x298=664B; 와이어 = 16 + 20*count + 8):**

| Off | Size | Type | Field | 의미 | 근거 |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `field0` | 헤더 dword (cookie/seq) | `Input *+0x1c` |
| 0x04 | ≤4 | blob | **`modeKind`** | low byte = 전투/모드 종류 (4/5/6/7 → ship+0x5c4) | `FUN_00610420(+4)` |
| 0x08 | 4 | u32 | **`fieldOwnerId`** | 필드 앵커 (offset 기준 함선/기지, mode0 resolve) | `applier FUN_004c7cd0(...,0,...)` |
| 0x0c | 1 | u8 | **`unitCount`** | 참가자 pose 개수 (1..32) | `Input *+0x24` |
| 0x10 | 20×N | struct[] | **`participants`** | 함선별 spawn-pose (stride 0x14). §1c-i | `Input` 루프 `+=0x14` |
| 0x290 | 4 | u32 | `tail0` | 필드 obj+0x40 (배틀클럭/카메라 추정) | med |
| 0x294 | 4 | u32 | `tail1` | 필드 obj+0x44 | med |

**참가자 pose 엔트리 (20B/5dword — MoveShip 엔트리와 동일 shape):**

| Off | Dword | Type | Field | 의미 |
|---|---|---|---|---|
| +0x00 | 0 | u32 | **`shipId`** | 참가 함선 id (mode1 resolve) |
| +0x04 | 1 | f32 | **`heading`** | spawn 방위 (Y-yaw rad) |
| +0x08 | 2 | f32 | **`x`** | spawn X (world units, 연속) |
| +0x0c | 3 | f32 | **`z`** | spawn Z |
| +0x10 | 4 | f32 | **`y`** | spawn Y/수직 (≈0, medium) |

**applier `FUN_004c1c30`→`FUN_004c1d20` 효과:** 전술 풀(`client+0x126718`)이 이미 할당돼 있어야 하며,
각 함선의 권위 pose를 씀 — `ship+0x14=x, +0x1c=z, +0x24=heading`, 앵커 상대 `ship+0x50=x-anchor.x,
+0x58=z-anchor.z`. `modeKind` low byte가 `ship+0x5c4` 전투 sub-state 선택(4/6→0 normal, 5→5, 7→6).
**즉 0x042f가 모든 전투 함선의 위치/방위를 0x0423과 동일 연속 float XZ 공간에 시드한다.** Confidence:
레이아웃 = **high**; modeKind 값 의미·tail0/1 = **medium**.

### 1d. `0x0f1f NotifyTactics` — "begin space-war" 시각 전환 트리거 (S→C)

- 디스패치 `0xf1f` → case `0x431` 경로 공유, `*param_4 = 8` (**8바이트만 소비**). 클라 핸들러
  `FUN_004ba2b0` case 0xf1f: 2 dword를 `DAT_00433b1c/b20`에 복사 후 **`FUN_004c1b20`** 호출.

**바디 (8B):**

| Off | Size | Type | Field | 의미 | Conf |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | **`arg0`** | 전술 context. **byte0==1 이면 engage 분기** | med |
| 0x04 | 4 | u32 | `arg1` | 2차 context (side/phase) | low |

- **소비처 `FUN_004c1b20`(redex 확정):** `*param_2 == '\x01'`(arg0 byte0==1)일 때만 전술 engage 분기
  (`+0x357e8c = 2`, 전술 풀 켜짐). byte0 != 1이면 strategic-return(else, `= 0`)라 **전술 풀이 안 켜진다.**
  = 과거 라이브 "전술맵 시각 전환 stall"의 RE-확정 직접 원인. 배틀 카운터 zero + `client+0x12647c=0xf1f`
  스탬프 + `FUN_004c2920`(battle init). **서버는 §1b 테이블을 다 푸시한 뒤 마지막에 arg0 byte0=1로 emit.**

### 1e. 진입/이탈 FSM (클라 상태)

| 필드 | 의미 | 세터 |
|---|---|---|
| `client+0x126710` | 현재 모드 워드 = `(modeKind<<8)|1` (필드 활성), 0 (없음) | `FUN_004c45f0` |
| `client+0x126714` | 활성 필드 id | `FUN_004c45f0` |
| `client+0x126718` | **전술 엔티티 풀** (~1.5MB); byte[0]=활성 플래그 | `FUN_004c45f0(...,0)` |
| `client+0x2a58f8` | 전략 그리드 풀 | `FUN_004c45f0(...,2)` |

- 할당자 `FUN_004c45f0(client, fieldId, modeKind)`: `modeKind==0` → 전술 풀 활성(= "enter tactical"),
  `==2` → 전략 풀. FieldMake `FUN_004b64c0`(3D 그리드 빌더)가 MainLoop `FUN_004e96f0`→`FUN_004b68f0`에서
  전술 풀 활성 후 매 프레임 구동. 이탈: `0xb0a NotifyEnterGridEnd` → `FUN_004c2a80(0)`가 전술 풀 teardown
  → 전략맵 복귀.

---

## 2. 전술 이동 프로토콜 (전술맵 내 함대 이동)

### 2a. `0x0400 CommandMoveShip` (C→S) — 함선 이동 명령

- 디스패치 `*param_4 = 0x41c`(1052B). 파서 `FUN_004be8f0`. 동일 shape `0x0402 CommandParallelMoveShip`
  (파서 `FUN_004bf320`, `entity+0x62` 태그 2 vs 4만 차이 = 대형이동).

**바디 (1052B=0x41c, LE):**

| Off | Size | Type | Field | 의미 | 근거 |
|---|---|---|---|---|---|
| 0x00 | 4 | u32 | `base` | 페이로드 base/타임앵커 | `param_2[0]` |
| 0x04 | 4 | u32 | `len` | 길이 (`base+len`=context anchor `entity[0x19]`) | `param_2[1]` |
| 0x08 | 4 | u32 | `field8` | 헤더 slack (이동 math 미사용) | |
| 0x0c | 1 | u8 | **`unitCount`** | 유닛 엔트리 수 (1..32) | `*(byte*)(param_2+3)` |
| 0x10 | 20×N | struct[] | **`unitEntries`** | 유닛별 목표 (stride 20B). §2b | `piVar4=param_2+4; +=5` |
| 0x290 | 4 | f32 | **`speed`** | 이동 속도 스칼라 → `entity[0x107]` | `param_2[0xa4]` |
| 0x294 | 4 | f32 | **`arrivalHeading`** | 도착 시 최종 방위 (rad) | `param_2[0xa5]` |
| 0x298 | 1 | u8 | **`formationCount`** | 대형 멤버수-1 (0=단독) | `param_2[0xa6]` |
| 0x29c | 12×M | f32[3][] | **`formationOffsets`** | 대형 슬롯 (stride 12B: dx,_,dz) | `param_2+0xa7` |

**유닛 엔트리 (20B/5dword — 파서 `FUN_004c8110`):**

| Off | Dword | Type | Field | 의미 | 근거 |
|---|---|---|---|---|---|
| +0x00 | 0 | u32 | **`shipId`** | 함선 id (`FUN_004c7cd0(pool,id,1)` 매칭) | `*piVar4` |
| +0x04 | 1 | f32 | **`heading`** | 유닛별 목표 방위 (Y-yaw rad) | `param_4[4]` |
| +0x08 | 2 | f32 | **`targetX`** | 목표 X (world units, 연속) | `param_4[0]` |
| +0x0c | 3 | f32 | **`targetZ`** | 목표 Z | `param_4[2]` |
| +0x10 | 4 | f32 | **`targetY`** | 목표 Y/수직 (≈0) | `param_4[1]` |

- **좌표계:** 연속 world float, XZ 지면 평면, Y 수직(≈0), heading=Y축 yaw 라디안.
  **NotifyMovedShip 0x0423와 동일 공간.** 이동 math(`FUN_004c8110`/`FUN_004bf4c0`)는 **텔레포트가 아니라
  waypoint+속도 설정 → 월드 틱이 매 프레임 보간**. Confidence: 전 레이아웃 **high** (엔트리 dword4=Y,
  speed 단위는 medium — 라이브 캡처로 확정).

### 2b. `0x0423 NotifyMovedShip` (S→C) — 권위 위치 스트림

- 디스패치 case 0x423, **28B(0x1c)**. 월드 틱이 소비해 `entity+0x14` region에 적용.

**바디 (28B, 확정 필드):** `dword1 = shipId`, `dword3..5 = (x, y, z) float`. **0x0400 목표와 동일 float
공간** — 서버가 명령에서 `(targetX, targetY, targetZ, heading)` 파싱 후 같은 단위로 0x0423 emit 가능.
방위 변경 동반 시 **`0x0424 NotifyTurnedShip`(12B, dword1=shipId)** pair.

**틱 모델:** 서버가 waypoint 향해 `speed`로 보간 → 매 틱 0x0423 스트림 (또는 시작+도착만 보내고 클라가
`speed`로 보간 — 클라는 양쪽 지원). 권위 서버는 서버측 보간 주도 권장(동기화·안티치트).

### 2c. 이동 형제 명령 (turn/reverse/stop/warp)

| 코드 | 이름 | 방향 | struct | 파서 | 바디 요지 | 응답 |
|---|---|---|---|---|---|---|
| **0x0401** | CommandTurnShip | C→S | 0x114 | `FUN_0049b040` | 헤더+u8 count + `{u32 shipId; f32 heading}`×N (stride 8) @0x10 + f32 turnParam @0x110 | 0x0424 NotifyTurnedShip |
| **0x0403** | CommandReverseShip | C→S | 0x114 | (relay, no local apply) | TurnShip와 동형 (reverse intent) | 0x0423/0x0424 |
| **0x040a** | CommandStop | C→S | 0x114 | (relay) | TurnShip 패밀리, id 리스트가 핵심 (float 무시) | 0x0424 (현 heading) |
| **0x0404** | CommandWarpShip | C→S | 0x90 | `FUN_0049c5a0` | 헤더+u8 count + `u32 unitIds[]` @0x10 (stride 4). **목적지 없음** | 0x0425 NotifyWarpedShip |
| **0x0402** | CommandParallelMoveShip | C→S | 0x41c | `FUN_004bf320` | 0x0400과 동일 바디, 대형이동 (formation 필드 채움) | 0x0423/0x0424 (lead+멤버) |

- **Turn 엔트리 = 8B** (`+0x00 u32 shipId, +0x04 f32 heading`). applier `entity+0x62=3`(turn 태그) + 순수
  회전(speed=1.0f). Confidence high.
- **Warp = id 리스트 전용**: 목적지는 바디에 없음 — **서버가 목적지 결정/검증** 후 `0x0425
  NotifyWarpedShip`(같은 id 리스트, 90B: 헤더 + u16@0xc + u8 count@0xe + u32 ids@0x10) 브로드캐스트,
  이어 `0x0423`로 신위치 전달. (퇴각/워프.)

### 2d. 기타 핵심 조작 (사격 — 주 임무 외, 참고)

| 코드 | 이름 | 방향 | 공유 applier | 근거 |
|---|---|---|---|---|
| 0x0405 | CommandAttackShip | C→S | `FUN_004bfc40` (Warp/Attack/Shoot 공유, 0x90) | battle-core §7 |
| 0x0406 | CommandShootShip | C→S | `FUN_004bfc40` | battle-core §7 |
| 0x0426 | NotifyAttackedShip | S→C | — (데미지 resolution) | opcode-ref |
| 0x0410 | CommandEvacuateTroops | C→S | `FUN_004be8c0` (ChangeMode 패밀리, 0x90) | battle-core §1 |
| 0x0431 | NotifyTacticsChiefCommander | S→C | 8B (id + character) | tactics-data §10 |

사격 계열 상세 필드는 `logh7-proto-battle-fire.md` 참조. 대형 = 0x0402(§2c). 퇴각 = warp 0x0404 /
evac 0x0410.

---

## 3. 전략맵 이동과의 대조 (별개 계열임)

| 구분 | 전략맵 이동 | 전술맵 이동 |
|---|---|---|
| 요청 코드 | **0x0b01 CommandMoveGrid** (36B) | **0x0400 CommandMoveShip** (1052B) |
| 응답 코드 | **0x0b07 NotifyMovedGrid** | **0x0423 NotifyMovedShip** (28B) |
| 좌표 | **그리드 셀 정수**(col/row) | **연속 float XZ** (world units) |
| 빌더(클라 송신) | `FUN_004b4600`→`FUN_004b78a0` case 0x3a | `FUN_004b78a0` case 0x30 |
| 대상 | 함대(그리드 오브젝트) | 개별 함선(전술 풀 엔티티) |
| 계층 | 전략 그리드 풀 `client+0x2a58f8` | 전술 엔티티 풀 `client+0x126718` |

**두 계열은 공유하지 않는다.** 같은 아웃바운드 디스패처 `FUN_004b78a0`의 다른 case일 뿐. 전략 이동은
셀 단위 이산, 전술 이동은 float 연속. (movemode-re, moveship-wire 종합.)

> **전략 이동 입력 게이트(참고):** 전략맵에서 0x0b01을 실제로 내려면 함대 선택(`widget+0x48!=0`) →
> 명령 카테고리 다이얼로그에서 "이동" 선택(`FUN_004d51d0(this,2)`) → 목적지 셀 좌클릭 → confirm에서
> `FUN_0050d230` 상태머신이 `FUN_004b4600(1)` 발사. 라이브에서 ui_explorer 입력주입(PostMessage/
> mouse_event)이 인-월드 DirectInput 핸들러를 못 깨워 3사이클 막힘(movemode-re §f-4) — **전술 입력도
> 동일 in-world 입력 한계에 걸릴 것**이므로, 서버 권위 경로(AI/스크립트 구동) 우선.

---

## 4. 현재 서버 구현 상태 (2026-07-05 리셋 후)

정본 확인 (`server/src/server/*.mjs`, 리셋 후 재작성분):

- **구현됨 — 전략맵 이동:** `logh7-world-session.mjs:254` `handleMoveCommand` (0x0b01 →
  `decodeMoveGridCommand` → 상태 갱신 → `buildNotifyMovedGridInner` 0x0b07 브로드캐스트, world-records.mjs).
  월드 init 핸드셰이크·그리드·스폰(0x0325 유닛/0x0323 캐릭터)도 구현됨.
- **미구현 — 전술 진입 전체:** 0x0411 CommandChangeMode 파서 없음, 0x042f NotifyChangeMode 빌더 없음,
  0x0f1f NotifyTactics 빌더 없음, §1b read-model 테이블(0x0349/0x033b/0x0341/0x0343/0x0337) 빌더 없음.
- **미구현 — 전술 이동 전체:** 0x0400/0x0402 MoveShip 파서 없음, 0x0423/0x0424 Notify 빌더 없음,
  turn/reverse/stop/warp(0x0401/0x0403/0x040a/0x0404) 없음.
- **주의(함정):** opcode-reference-2026-06-28 등이 참조하는 `logh7-battle-engine.mjs`(:157/184/217/264
  빌더), `logh7-command-engine.mjs`, `logh7-battle-ops.mjs`, `logh7-login-protocol.mjs`는 **전부
  pre-reset(삭제됨) 경로**다. 현재 서버엔 존재하지 않는다 — 그 파일:라인 인용을 현 코드로 신뢰하지 말 것.
  레이아웃/오프셋 지식만 유효, 구현은 새로 작성해야 한다.

**서버 구현 체크리스트(신규 작성 대상):**
- `parseCommandChangeMode(body)` (0x0411): count@12 + unitIds@0x10.
- `buildNotifyChangeMode(fieldId, anchorId, modeKind, participants[], tail0, tail1)` (0x042f): §1c 레이아웃,
  와이어-패킹, `modeKind=0` normal engage, message32 래핑.
- `buildNotifyTactics(arg0, arg1)` (0x0f1f): **arg0 byte0=1 필수**(안 그러면 시각 전환 안 됨).
- read-model 빌더 0x0349/0x033b/0x0341/0x0343/0x0337 (§1b, 진입 순서대로 푸시).
- `parseCommandMoveShip(body)` (0x0400/0x0402): count@12 + 엔트리@0x10 stride20 + speed@0x290 등.
- `buildNotifyMovedShip(shipId,x,y,z)` (0x0423, 28B) + `buildNotifyTurnedShip` (0x0424, 12B).
- turn/reverse/stop/warp 파서 + `buildNotifyWarpedShip` (0x0425).
- 배틀 필드 상태(`BattleField{ id, anchorId, participants:Map<shipId,pose>, modeKind }`) = 클라
  `client+0x126710/0x126718`의 서버 아날로그.
- 검증: count clamp(32/70/10), NaN/Inf 좌표 reject, 전 id 소유권 체크.

---

## 5. Unknown / 라이브 캡처 대기 (날조 금지)

1. **진입 트리거 방식** — 자동 조우 vs 명시적 교전명령. 0x0411을 여는 정확한 UI 제스처(전술 카테고리
   다이얼로그 항목)와 서버 교전 판정 조건은 라이브 미확정(medium).
2. **`modeKind`(0x042f off 0x04) 값 4/5/6/7 ↔ ship+0x5c4 0/5/6** — 매핑은 RE 확정, *명명된* 전투 sub-mode
   (normal/evac/air-landing)는 추정. 각 전투 유형 진입 0x42f 캡처로 확정.
3. **`0x0f1f` arg1** = side/phase 추정(low). arg0 상위 3바이트 역할 미확정.
4. **`speed`(0x0400 off 0x290) 절대 단위** (world-units/tick vs 정규화). 서버 보간은 동일 per-tick 공식
   replay가 안전.
5. **Warp 후 위치 전달 채널** — 0x0404/0x0425는 id 리스트 전용, 신위치는 0x0423로 추정(medium). 0x0425
   직후 같은 id의 0x0423 캡처로 확인.
6. **0x0423 per-tick vs single-shot 케이던스** — 원 서버가 어느 쪽인지 라이브 서버 캡처 필요(재구현
   블로킹 아님).
7. **Reverse/Stop float 의미** — 둘 다 local applier 없이 relay라 per-unit float 역할(reverse 거리 vs
   heading; stop 무시)은 TurnShip 패밀리 shape에서 추정.

---

## 6. 증거 색인 (Ghidra VA / 기존 문서)

- **진입:** `FUN_004a01e0` Input_CommandChangeMode(0x411); `FUN_004a79b0` Input_NotifyChangeMode(0x42f);
  `FUN_004c1c30`→`FUN_004c1d20` 0x42f applier(필드 시드); `FUN_004be8c0`→`FUN_004be7c0` 0x411 타이머;
  `FUN_004c1b20` 0x0f1f 소비처(engage byte==1); `FUN_004c45f0` 필드 할당(0=전술/2=전략);
  `FUN_004c2a80` teardown; `FUN_004b64c0` FieldMake; `FUN_00426360` 0x349 파서.
- **이동:** `FUN_004be8f0` 0x400 파서; `FUN_004bf320` 0x402; `FUN_004c8110` pose resolver;
  `FUN_004bf4c0` move commit; `FUN_0049b040` 0x401 Turn; `FUN_0049c5a0` 0x404 Warp;
  `FUN_004a5cc0` 0x425 NotifyWarpedShip; `FUN_004c7cd0` 전술 풀 엔티티 lookup.
- **디스패치:** `FUN_004b8b00` 이너 수신 사이즈/파서 라우팅; `FUN_004ba2b0` S→C notify applier;
  `FUN_004b78a0` 아웃바운드 디스패처(case 0x30=0x400, 0x3a=0xb01).
- **기존 문서:** `logh7-proto-battle-core.md`(진입 FSM·turn/warp/switch), `logh7-moveship-wire.md`
  (0x400 전 레이아웃), `logh7-proto-tactics-data.md`(0x349/033b/0341/0343/0337/0f1f read-model),
  `logh7-tactical-seed-2026-06-26.md`(진입 순서), `logh7-tactical-mode0-o1-resolution-2026-06-29.md`
  (0x33b가 유닛 풀 소스로 충분), `logh7-movemode-re.md`(전략 이동 입력 게이트·in-world 입력 한계),
  `logh7-opcode-reference-2026-06-28.md`(코드 이름 정본화).
