# mode0 돌파 종합 — 2026-06-26

read-only RE 종합. 전부 redex VA / 즉치 인용. force 레버(EXE 강제·`+4=0` 강제·`+0x126718` 강제)는
60+ 사이클에서 라이브 무효/오염 확정 → **재제안하지 않는다**. 자연경로(서버푸시·클라조건·입력경로)만 다룬다.

라이브 현 상태(돌파 직전):
- world obj = `DAT_007ccffc`
- `mode_byte(+0x126711) = 2` (전략)
- `mode2_active(+0x2a58f8) = 0x10001` (데이터 있음)
- **`mode0_active(+0x126718) = 0`, mode0 region 비어있음(0/64)**
- own-fleet case0 6-AND 게이트(`FUN_0058d140`) 전부 통과(own_cell=2588, PLAYER_INFO 24슬롯)
- 클릭 → event-9 enqueue(mode2 `FUN_004fef90`)되나 consume(mode0 `FUN_0050d230`) 미실행 → `0x0b01` 미발생

---

## (a) mode0 grid writer — 확정 / 미확정

### 확정

**`+0x126718`은 "데이터 그리드"가 아니라 mode0 서브객체의 선형 멤버 영역 base다.**
유일한 dispatcher 바이트 라이터 `FUN_004c45f0(obj, param_3)`은 이 영역을 0으로 memset하고
byte0=1(init 플래그)만 세팅할 뿐 데이터를 채우지 않는다(`0x4c4684` `*(param_1+0x126710)=local_8`,
local_8 byte1=mode; param_3==0 → `+0x126718`부터 `0x5fc77` dword zero + byte0=1).
즉 라이브의 "비어있음(0/64)"은 정상 = 아직 import가 안 돈 상태.

**mode2가 채워지는 메커니즘(대조용):**
`FUN_004c4170 @0x4c4170`(StrategyFieldImport)이 `[+0x126711]==2` 게이트에서 실데이터를 COPY-IN.
`[+0x2b6a6c]=1`, `0x181` dword를 `+0x3facf4`→`+0x2b6a74`, `0x2379` dword를 `+0x3fb2f8`→`+0x2b7078`
복사, `[+0x2a58fa]=1`. mode2 region이 차는 이유 = **소스(`+0x3facf4`/`+0x3fb2f8`)가 이미 로드돼 있고
import가 그것을 복사**하기 때문.

**mode0를 채우는 함수 = `FUN_004c32a0 @0x4c32a0`(WorldIn_TacticsFieldImport), `[+0x126711]==0` 게이트.**
mode2와 달리 단일 블록 복사가 아니라 *소스 테이블을 순회하며 `FUN_004c46a0`로 객체를 alloc*해 mode0 풀을 채운다.
소스 = `+0x404xxx` 전술 필드 테이블군(`+0x4040dc` count, `+0x40443c`, `+0x4042e4`, `+0x4042f8`,
`+0x40430c`, `+0x404428`, `+0x4271a8`) + `0x0325` 유닛리스트(`+0x41a364`/`+0x41a368`).

**mode0 소스 테이블의 유일한 외부 라이터 = `FUN_004ba2b0 @0x4ba2b0`(인바운드 와이어 디스패처).**
redex grep `0x4040dc`/`0x4271a8` = 라이터 정확히 2함수(`FUN_004ba2b0` write / `FUN_004c32a0` read)뿐.
→ **mode0 grid는 서버 와이어 메시지가 소스 테이블을 채우고 → `FUN_004c32a0`가 객체로 풀어야 찬다.
클라 자생 데이터 아님 = 순수 서버푸시 레버.**

mode0 소스를 채우는 와이어 opcode 패밀리(`FUN_004ba2b0` case, 각 case가 payload를 `+0x404xxx`로 복사):
| opcode | 이름 | 목적지 | 크기(dword) |
|---|---|---|---|
| `0x33b` | ResponseTacticsInformationUnitShip | `+0x4271a8` | `0x1e79` (+ `FUN_004be750` finalize) |
| `0x33f` | TacticsInformationCorps | `+0x4044b8` | `0x2329` |
| `0x341` | TacticsInformationFillShip | `+0x40d15c` | `0x1771` |
| `0x345` | TacticsInformationBase | `+0x4040dc` | `0x81` |
| `0x347` | InformationObstacle | `+0x4042e0` | `0x76` |

### 미확정 (open)

- **O1**: 0x33f/0x341/0x345/0x347 서버 빌더 미존재 — `buildResponseTacticsInformationInner`(0x33b)만 있음
  (`logh7-login-protocol.mjs:1561`). `FUN_004c32a0`가 `+0x4040dc`(0x345 Base)와 `+0x4271a8`(0x33b)를
  모두 읽으므로 **최소 0x345+0x33b 동시 필요 가능성** → 라이브 전 빌더 추가 범위 확정 필요.
- **O4**: 0x33b의 mapSection/controllable payload 스키마가 `FUN_004be750` finalize +
  `FUN_004c32a0`의 `+0x4271a8` read(stride/count `0x1e79` dword=7801)와 byte-exact 정합인지 logh7-wire 재대조.
- **+0x126718 컬렉션 insert측**: `FUN_0050d230` 내부에서 `+0x126718`을 해시테이블 base로 조회
  (`FUN_004c7cd0(DAT_007ccffc+0x126718, key, …)` line 641/836/839/1062). insert측 호출자는 미추적 →
  `FUN_004c32a0` alloc 경로가 실제로 이 컬렉션을 populate하는지 라이브 확정 필요.

---

## (b) mode 전환 트리거

**`mode_byte(+0x126711)`의 유일 라이터 = `FUN_004c45f0`의 `0x4c4684`.**
redex `calls 0x004c45f0` 호출자 = 정확히 2개: `FUN_004c32a0`(mode0), `FUN_004c4170`(mode2).
나머지 18k 함수 어디에서도 mode_byte를 쓰지 않음 → 런타임 전환은 이 두 setter로만 가능.

- `FUN_004c4170`(mode2): 무조건 `FUN_004c45f0(.,2)`. 호출자 = `FUN_004b68f0` 단독 → **월드진입 latch에서만**.
- `FUN_004c32a0`(mode0): **`param_2==0`일 때만** mode_byte 기록. 호출자 = `FUN_004b68f0` + `FUN_004ba2b0`.
  그러나 `FUN_004ba2b0`의 단 한 호출(case 0xb0a, line 1354)은 `FUN_004c32a0(1)` = **param_2=1 → mode_byte 미기록**.
  → **서버메시지 0x0b0a는 mode를 0으로 flip하지 못한다**(이미 byte==0일 때만 own-fleet 등록 추가).

**결론: mode_byte를 실제로 쓰는 경로는 `FUN_004b68f0`의 월드진입 1회 latch 블록 단 한 곳.**

`FUN_004b68f0` [A] latch 블록(line 63-95):
```
if (param_1[0x35837f] == '\0') {        // self-latch, 1회만
    FUN_004b76e0(...); param_1[0x35837f]=1;
    iVar7 = 2;
    if (param_1[0x35f35a] != '\0') iVar7 = 1;   // ★ mode selector
    if (iVar7 == 1) { FUN_0054e570(); FUN_004c32a0(); }   // mode0/Tactics
    else            { FUN_004c4170(); }                   // mode2
}
```

- `[+0x35f35a]`(latch selector) == 0(기본) → iVar7=2 → mode2.
- `[+0x35f35a]` != 0 → iVar7=1 → mode0.
- latch는 `param_1[0x35837f]` self-latch라 진입 후 **1회 고정**.

**mode0 region이 비어있는 근본 = `[A]`가 항상 iVar7=2를 고르기 때문.**
`+0x35f35a` writer가 18k 인덱스에 0건(읽기 1건, foff `0xb6af4`) → 기본값 0 유지 → 항상 mode2 import →
mode0 init-region이 한 번도 안 채워짐(라이브 0/64와 정합).

### selector를 제어하는 와이어 = `0x0317`(ResponseInformationGrid)

`FUN_004ba2b0` case 0x317(line 400-404): `*(param_1+0x35f358) = *param_3` — payload dword 전체를 `+0x35f358`에 기록.
mode selector 바이트 `+0x35f35a`는 이 dword의 **byte[2]**다.
서버 `buildInformationGridInner({grid})`(`logh7-info-records-static.mjs:421`)가 u32 LE를 그대로 emit →
`grid = 0x00010000`(65536)이면 와이어 `00 00 01 00`, byte[2]=1 → `+0x35f35a=1` → `[A]` selector nonzero → mode0.
0x0317은 단일 dword(`WORLD_RESPONSE_OBJECT_SIZES 0x0317:0x0004`)라 렌더 stall 위험 없음.

### `[A]` 재실행을 일으키는 load 재arm

`[A]` latch는 1회성이지만, load 재arm으로 트랜지션 블록을 다시 통과시킬 수 있다.

- **0x0b0a(NotifyEnterGridEnd)** — `FUN_004ba2b0` case 0xb0a(line 1336-1356):
  `[+0x126711]==2` & `[+0x4376ec]!=0` → load 재arm
  (`DAT_007ccffc+0x357e84=0`, `+0x357e88=0x3f800000`(1.0f), `*DAT_007ccffc=1`, `+4=1`).
  0xb09(begin, line 1330-1335)이 `+0x4376ec=*param_3`(begin value)를 쓴다 → end value!=0이면 재arm.
- **0x0f1f(NotifyTactics → `FUN_004c1b20`)**: `(+0x2a58f8!=0 || +0x126718!=0)` 게이트에서 동일 load 재arm
  (`+0x357e84=0`, `+0x357e88=0x3f800000`, `*param_1=1`, `+4=1`). **mode_byte 미기록** = 재load에서 selector 의존.

**미확정(이 셋이 핵심 미지수):**
- **O2**: `+0x35f35a`가 실제로 `[A]`의 mode selector인지 라이브 미확정(객체 식별오인 2회 전례).
- **O3**: 타이밍 — 0x0317(selector)이 0xb0a(value!=0)보다 먼저 도착하는가. 현 postloadExtras push 순서
  = begin(0)/end(0) → stratSeq begin(1)/end(1) → selector(0x0317). selector가 stratSeq 0xb0a 뒤라
  **첫 재arm 시점엔 `+0x35f35a=0`(mode2 유지)**일 수 있음 → selector를 앞으로 재배치 필요 여부 라이브 확정.
- **O5**: 재arm이 `[A]` 트랜지션 블록을 실제로 재실행하는가 — 0xb0a 재arm은 `+0x357e88`/`*param_1`만 세팅,
  `+0x35837f`는 안 건드림. `[A]`의 selector 재평가가 `+0x35837f` 게이트 안/밖인지 디스어셈 정밀 확인 필요.

### 전환 안 되는 경로 (확정 반증)

- **0x42f(NotifyChangeMode)**: `FUN_004ba2b0` 최상위 switch에 case 부재(0x305~0x2xxx 열거에 없음).
  클라가 0x42f 수신해 `+0x126711`/mode0 region 쓰는 핸들러 없음. 서버 `LOGH_BATTLE_ENTRY_PROBE`의 0x42f는
  전술(battle) 풀 전환용이며 **전략맵 렌더를 깨뜨림이 라이브 확정**(`login-session.mjs:1863`).
- **0x0411(CommandChangeMode)**: 클라→서버 Command 계열 = 서버가 보낼 레버 아님(인-월드 입력 미해결).

---

## (c) consume 게이트 — `FUN_0050d230 @0x0050d230`

`__fastcall(ecx=param_1=event 객체)`. 진입부 게이트 다중:

1. **line 83**: `if (*(char*)(*(int*)(param_1+0xc)+0x3a0) == '\0') return;`
   event 객체의 `+0xc`가 가리키는 컨텍스트의 `+0x3a0`(consumer-active 플래그)이 0이면 즉시 return.
2. **line 89**: `if (DAT_007ccffc == 0) return;` (world obj 널 가드)
3. **line 93-98(★)**: `local_1e0 = DAT_007ccffc + 0x126718; if (DAT_007ccffc[0x126718]=='\0') { FUN_005923a0(&DAT_00785708); return; }`
   = **`mode0_active(+0x126718)==0`이면 즉시 return.** 라이브 `+0x126718=0`과 정합 → consume이 한 번도 본체 진입 못함.
4. **line 99-118**: `pcVar2=*(char**)(DAT_007ccffc+8); if(*pcVar2=='\0') goto LAB_0050d2d5;`(에러/리셋: `*puVar6=1`, `+4=1`로 FSM latch 리셋 후 return). 세션/플레이어 컨텍스트 문자열 비면 abort.
5. **line 119-132**: `local_1f0=FUN_004c7fc0();` 널이면 LAB_0050d2d5(리셋). 이후 `cVar7=FUN_004b7890();` 0이면 return(전략시퀀스 ready 체크).

**`+0x126718`은 단순 플래그가 아니라 mode0 grid 컬렉션의 BASE 포인터로도 쓰임**(`FUN_004c7cd0(DAT_007ccffc+0x126718, …)` 반복).
즉 region은 (a) byte0=active 플래그, (b) 이후=mode0 grid/유닛 해시테이블. **byte0만 켜도 컬렉션이 비면
`FUN_004c7cd0` 조회=0 → 후속 emit 분기 미진입.** ★force로 byte0만 켜는 것 무효 = 재제안 금지.

상위 poller 게이트(`FUN_004b68f0`):
```
cVar1 = param_1[0x126711];
if (cVar1 == '\0') {                 // mode0
    if (param_1[0x126718] != '\0') { // populate 됐을 때만
        FUN_004f6f60(); FUN_005266e0(); FUN_0050d230(); FUN_0050cf10(); FUN_004b6e00(); FUN_004c9640();
    }
} else if (cVar1 == '\x02') {        // mode2 — 배타
    if (param_1[0x2a58f8] != '\0') { ... FUN_004fef90(); FUN_0050cf10(); }
}
```
→ **`FUN_0050d230` 실행조건 = `mode_byte==0` AND `+0x126718!=0`(init+populate) 둘 다.**
mode0/mode2 분기는 switch로 **배타** → 같은 프레임에 enqueue(mode2)와 consume(mode0) 동시 실행 불가
= 라이브 관측 "event-9는 쌓이나 consume 미실행"과 정합.

---

## (d) 자연 클릭 → `0x0b01` 체인

```
[전제] mode_byte==0 AND +0x126718!=0(populate) AND event +0xc→+0x3a0 active
   │
클릭 → event-9 enqueue (mode0 컨텍스트)
   │   (FUN_005015f0(9,…) → FUN_00501ed0 dequeue: +0x3f4 count, +0x470 type배열==9,
   │    +0x4e8+idx*0x34에서 0xd dword payload copy + shift-down consume)
   ▼
FUN_0050d230 switch(*(float*)(param_1+4)):
   case +4==0  : 카메라/포커스 갱신 + 선택 클리어
   case +4==1  : 본격 mode0 처리
   case +4==3  : ★ 이동 확정 → FUN_004b3b20(...) 호출 (line 964)
   case +4==0x16: path-list 이동(동일 FUN_004b3b20)
   │
   ▼  (추가 in-게이트: bVar29 target valid, local_1f0+0x8c5 선택확정!=0,
   │   DAT_022166a0 선택셀수>0; 처리 후 *(param_1+4)=1 latch reset, line 977)
   ▼
FUN_004b3b20((uint)DAT_02216684&0xff, &DAT_02215630, &DAT_02215530, DAT_022166a0&0xff, DAT_0221669c&0xff)
   │   (이동/명령 빌더)
   ▼
FUN_004b78a0 (send dispatcher) case 0x3a:
   if (*(char*)(param_1+0x35837e) == '\0') goto LAB_004b8516;  // ★ 세션 ready 게이트
   iVar1 = 0xb01;  iVar5 = 0xb07(reply)
   ▼
0x0b01 (CommandMoveShip / strategic move) 송신, reply 0x0b07
```

**핵심: `0x0b01`은 클라가 보내는 send opcode다.** consume(`FUN_0050d230`)을 안 거치고 서버가
`0x0b07`(NotifyMovedGrid)를 직접 푸시하면 이동 결과는 적용된다 — 이미 검증된 server-authoritative-move 경로.
**consume 게이트(`+0x126718`)를 뚫는 것은 "클라발 유저 이동(C002 본질)"에만 필요하고, 데모/관전 MP에는 `0x0b07` 푸시로 우회 가능.**

미확정:
- `FUN_004b78a0` 인자 매핑(opcode = `(param_3&0xffff)-1` vs 래퍼 3인자 호출규약) — `0x3a` push 지점 어셈블리 확인.
- `+0x126718` 컬렉션 insert 경로(`FUN_004c7cd0` add측).

---

## (e) ★ 실행가능 돌파 레버 랭킹 (force 제외)

### L1 — selector + 재arm 조합(mode2→mode0 자연 전환): 서버푸시 단독, EXE 무변경 [최우선]
mode0 전환의 단일 RE-확정 자연경로. 두 env를 **동시** 적용:
- `LOGH_GRID_SELECTOR_PROBE=1` + `LOGH_GRID_SELECTOR_VALUE=0x10000`(65536)
  → `0x0317` byte[2]=1 push → `+0x35f35a=1`(mode0 selector).
  배선: `login-session.mjs:1824-1827, 1923-1924` → `buildInformationGridInner`.
- `LOGH_STRAT_SEQ_START=1` → `0xb0a` value=1 재전송 → `+0x4376ec!=0` → load 재arm → `[A]` 재통과.
  배선: `login-session.mjs:1815-1822, 1915-1921`.
→ 재arm 시점 `+0x35f35a=1`이면 `[A]`가 mode0(`FUN_004c32a0`) 선택. off-default, deferredBattle 미사용이라 무충돌.
**라이브 검증법**: 캐논 SHA 992dc7e2 복원 + 실유저 수동 로그인. read-only watchpoint —
(1) `WORLD(DAT_007ccffc)+0x35f35a` write-watch로 도착 타이밍·값 캡처(0x0317이 0xb0a보다 먼저인지),
(2) `FUN_004c45f0`의 `+0x126710` store hit 시 byte1==0(mode0) 확인,
(3) 진입 후 `+0x126711==0` & `+0x126718!=0` & `+0x2a58f8` 동시 read.
타이밍 미스(selector가 0xb0a 뒤)면 → L1b로.

### L1b — selector 우선순위 재배치: 서버 순서 조정 [L1 보조]
L1 라이브에서 `+0x35f35a`가 0xb0a value=1 재arm보다 늦게 도착하면(O3) selector(0x0317)를 stratSeq begin/end **앞**으로
postloadExtras 순서 재배치, 또는 selector 직후 0xb0a value=1을 1회 더 push.
**라이브 검증법**: 재배치 후 동일 watchpoint로 `+0x35f35a=1`이 재arm 프레임 이전에 latch됐는지 확인.

### L2 — mode0 소스 충전: ResponseTactics* 빌더 신설 + 푸시: 서버푸시 [L1 성공 후 필수]
mode0로 전환돼도 `+0x126718` 컬렉션이 비면(0/64) consume이 `FUN_004c7cd0` 조회 실패로 무의미.
`FUN_004c32a0`가 `+0x404xxx` 소스를 객체로 풀려면 소스가 차 있어야 함.
- 이미 구현: `0x33b`(`buildResponseTacticsInformationInner`, `LOGH_TACTICS_UNIT=1`, `login-session.mjs:1657-1665`).
- **신설 필요**: `0x345`(Base, 0x81)는 `FUN_004c32a0`가 `+0x4040dc`를 직접 읽으므로 0x33b와 동시 가능성 높음(O1).
  0x33f/0x341/0x347은 그다음.
**라이브 검증법**: L1로 mode0 진입 성립 후, `LOGH_TACTICS_UNIT=1`(+0x345 신설 빌더) push 상태에서
`+0x126718!=0`(컬렉션 채워짐) read-only 확인 → poller가 `FUN_0050d230` 본체(line 93 게이트 통과) 진입하는지 trace.

### L3 — `0x0f1f` 재arm 대안(0xb0a 대신): 서버푸시 [L1 selector 동작·재arm 불안정 시 대체]
`LOGH_STATE_TRANSITION_PROBE=1`(+`ARG0=1`) → `0x0f1f` NotifyTactics 지연 푸시(`login-session.mjs:1894-1898`).
`FUN_004c1b20`가 `(+0x2a58f8!=0)`에서 load 재arm(`*param_1=1`) = 0xb0a value!=0와 동등 재arm 효과.
단 deferredBattleInners 필드 공유라 battle/fleet-move probe와 **상호배타**. selector(L1)와 결합해서만 mode0 트리거.
**라이브 검증법**: L1 selector + L3(STATE_TRANSITION_PROBE, BATTLE/FLEET probe off) 동시 → `+0x35f35a` watchpoint +
`+0x126711` 전환 확인. 지연(DELAY_MS) 필수 — 즉시 푸시는 렌더 전 도착으로 stall 위험.

### L4 — `0x0b07` 직접 푸시(consume 완전 우회): 서버푸시 [데모/관전 MP 폴백]
`0x0b01`은 클라 send. 서버가 `0x0b07`(NotifyMovedGrid)를 직접 푸시하면 이동 결과 적용 — 검증된 경로.
mode0 consume 돌파가 길어지면 **데모/관전 MP는 이 경로로 우회 가능**(클라발 유저 이동 C002 본질만 미충족).
**라이브 검증법**: `LOGH_FLEET_MOVE_PROBE` 계열로 `0x0b07` 푸시 후 own-cell/마커 이동을 trace + 스크린샷.

### L5 — latch selector 동적 writer 캡처: 입력경로 미지수 해소 [근본 closure]
`+0x35f35a` writer가 정적 18k 인덱스에 0건 = 다른 base 레지스터(객체 별칭)로만 쓰일 가능성.
"자연 상태에서 누가/어떤 와이어가 selector를 1로 쓰는가"를 캡처하면 selector를 인위 푸시할 필요 없이
정규 char-select 시퀀스(FUN_0051a370 advance, recv-queue ring `+0x3552b8`)로 mode0 진입 경로가 드러날 수 있음.
**라이브 검증법**: read-only HW write-watch(`WORLD+0x35f35a`)를 정규 로그인~월드진입 전체에 걸어
자연 write 발생 여부·트리거 opcode를 캡처(L1 인위 푸시 없이).

---

## 죽은 경로(재제안 금지)

- EXE-force 패치 / `DAT_007ccffc+4=0` force / `+0x126718` byte0 force / `+0x126711` 직접 강제:
  60+ 사이클 라이브에서 전부 무효 또는 클라 mode 오염 확정.
- `0x42f`(NotifyChangeMode)로 mode0 전략 grid 충전: 핸들러 부재 + 전술 풀 전환 + 전략맵 렌더 깨짐(라이브 확정).
- `FUN_004fd7a0`을 mode setter로 가정: `+0xf4`(탭/시퀀스 selector) read/write일 뿐 `+0x126711` 미참조(정정 확정).
- byte0만 켜는 consume 게이트 우회: 컬렉션 비어 `FUN_004c7cd0` 조회 0 → emit 분기 미진입.
