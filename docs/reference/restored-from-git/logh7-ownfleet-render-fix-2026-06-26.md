# own-fleet selectable 렌더 — case0 조건 + PLAYER_INFO 슬롯 + 서버 배선 (2026-06-26)

대상: `G7MTClient.exe`(.omo/ghidra/export/G7MTClient, `RE/tools/logh7_redex.py`) · 캐논 서버 `server/src/server`
선행: `docs/logh7-fleet-render-re.md`(§1·§5·§6), `docs/logh7-own-fleet-render-2026-06-26.md`, 메모리 `logh7-fleet-render-rootcause-2026-06-20`.
제약: **화면 깨뜨리는 EXE force 금지**(mode-force 라이브 반증 = mode2가 맞음). 서버 데이터/배선만, off-default 게이트 가능, 추측 P0 금지.

---

## 1. case0 own-fleet 렌더 조건 (정적 RE 확정, P0)

렌더 FSM `FUN_004fef90`의 **case0**(`*(param_1+4)==0`, 1회성 → 실행 후 `+4=1`)이 own-fleet **상태/패널**을 그린다.
case0 본체: `FUN_004c8a90` → (`DAT_00c9e2e0` 게이트) `FUN_004f9030` task gen → `FUN_0058f900(2)` → **`FUN_0058d140()`** → `FUN_004fc4a0` → `FUN_004d5030(1)`(own_cell 커서 쿼드) → `FUN_0050cf40(9)` → event-9 enqueue → `+4=1`.

`FUN_0058d140`(own-fleet 패널 렌더) AND 게이트 — 하나라도 false면 즉시 return(미렌더):

| # | 조건 | 출처 | 비고 |
|---|---|---|---|
| G1 | `FUN_0058d110` != 0 | `*param_1!=0 && FUN_0050cf40(0x6b)!=0` | **HUD 오브젝트 0x6b 로드** + 매니저 ptr 유효 |
| G2 | `iVar9 = *(DAT_007ccffc+8)` != 0, != -0x24 | 활성 char-record ptr | `FUN_004fef90` case0 진입부도 `**(DAT_007ccffc+8)==0`이면 경고 로그 |
| G3 | `DAT_007cd04c != -0x11174` | own_cell 페이지 유효 | (DAT_007cd04c = DAT_007ccffc + 0x50) |
| G4 | `local_34 = FUN_004b5b50()` != 0 | `= managerBase+0x318` 서브오브젝트 | |
| G5 | own_cell `*(DAT_007cd04c+0x11178)` col<100 && row<50 && `FUN_004c8b70(col)!=0` | own_cell 패킹 `row*100+col` | 셀이 유효 오브젝트테이블 슬롯이어야 |
| G6 | `FUN_004c7290()` != 0 | **PLAYER_INFO 슬롯 매칭** | 미스면 패널 데이터 없음 → 미렌더 |

→ own_cell(G5)이 0이면(셀 0,0=col0/row0) `FUN_004c8b70(0)` 결과/유효성에 따라 미렌더 또는 무가시 셀에 배치.
event-9 enqueue·dequeue(C002)는 별개 축; 이 문서는 **렌더(case0) 데이터 게이트**에 한정.

## 2. PLAYER_INFO 슬롯 요건 (G6, P0)

`FUN_004c7290(id)`: PLAYER_INFO 배열 base `DAT_007ccffc`, **slot0 = +0xc, stride 0x370**, 한계 0x80e80(=~600슬롯)을
순회해 `slot[0]!=0 && FUN_004b5b80(slot)==param_1`(= `slot+0x24` id == 조회 id)인 슬롯의 `slot+0xa4`를 반환. 미스 → 0.

슬롯을 **쓰는** 함수 = `FUN_004c2c80(base=DAT_007ccffc, mode, charRec, …)`:
- `mode==0` → slot = `base+0xc`(LOCAL 플레이어 slot0)
- `mode==1` → slot = `base+0x80e8c`(마지막 슬롯)
- `mode==2` → char id로 빈/매칭 슬롯 탐색
- 본체: charRec(param_3) 필드를 슬롯에 복사(`+0x24=id`, `+0x2c`, `+0x34`, …). **`+0x11178`(own_cell)은 안 씀.**

월드진입 링크 `FUN_004c2a80`(0x0b0a→mode!=0)의 3-way 매칭으로 slot0이 채워진다:
1. `0x0204` selectedChar id → `clientBase+0x3584a0` (키1: `char.id == selectedChar`)
2. `0x0323` char record의 flagship `char+0x24`(=char[9]) == unit.id (키2)
3. `0x0325` unit 리스트(`clientBase+0x41a368`, count `+0x41a364`, stride 0x58)에 그 id 존재(unitCount!=0)

→ **PLAYER_INFO slot0 채움 = 0x0204 + 0x0325 + 0x0323 동기화 필요**. 서버가 이미 셋 다 0x0f02에 emit(§3).

## 3. own_cell `+0x11178` 라이터 — 서버 닿는 경로 (P0/P1)

`+0x11178`(own_cell) 정적 WRITE **0건**(8 소비처 전부 READ) + 라이브 기준선 write 0. 유일 라이터 = **strat-camera-focus EXE 패치**
(`RE/tools/client_patches/strat-camera-focus.json`, DEFAULT_STACK 포함 — 이건 캐논 playable 빌드 패치이지 런타임 force 아님):
`FUN_004c4170` prologue → cave 0x5d5290, `source=*(mainState+8)=*(DAT_007ccffc+8)`(=G2 활성 char ptr), **`*(source+0x320)==0`일 때만** own_cell에 하드코딩 셀 `0xa1c`(2588=제국 수도 88,25) write + 카메라 센터링.

**핵심 RE 연결**: `source+0x320` == 0x0325 unit element의 **COMMANDER 슬롯(element+0x08)**(login-session 주석 확정).
- 즉 서버가 unit COMMANDER 슬롯에 **0이 아닌 값**을 실으면 패치 게이트가 FALSE → 패치가 own_cell을 안 덮음.
- 서버 `LOGH_PLAYER_FOCUS_CELL=1`이면 `localFleetRecord.commander = fleetCellId()`(진영-인지 cell) → COMMANDER 슬롯 = cellId →
  **own_cell이 서버 진영별 cell로 흐른다**(동맹 14,20=2014 정합). 게이트 OFF(기본)면 COMMANDER=charId, own_cell은 패치 하드코딩(2588).

⚠️ **진영 불일치 갭(신규 확정)**: 패치 하드코딩 own_cell = 제국 2588. **동맹 플레이어**는 서버가 함대를 2014에 두는데
패치가 own_cell=2588(빈 공간)로 써 함대 아이콘/카메라가 어긋난다. `LOGH_PLAYER_FOCUS_CELL=1`이 이 갭의 서버측 해소
(COMMANDER=cellId로 패치 게이트 비활성 + 서버 진영별 cell 주입). 라이브로 own_cell이 실제 COMMANDER 슬롯에서 흐르는지 확정 필요(U1).

## 4. 서버 배선 현황 / 수정 (P0)

`server/src/server/logh7-login-session.mjs`:
- 0x0f02 월드진입에 `0x0204`(selectedChar) + `0x0325`(unit, `localFleetRecord`) + `0x0323`(char) 이미 emit(:1503-1519, begin↔end 재전송 :1710-1754). §2 3-way 충족.
- `localFleetRecord`(:1191): `cell = fleetCellId()`(진영-인지, COMMANDER ≠), `commander = FOCUS_CELL?fleetCellId():(officer?.commander ?? charId)`(:1203).
- `fleetCellId()`(:1132) = `row*100+col`, `playerFleetCell()` = 진영 수도(empire 88,25 / alliance 14,20, `FACTION_CAPITAL` :337).
- unit element 오프셋(`logh7-login-protocol.mjs` UNIT_ELEM :466): ID 0x00, FACTION 0x04, **COMMANDER 0x08**, **CELL 0x0c**, OWNER 0x10.

**수정**: 코드 변경 없음 — 배선은 이미 RE 계약과 정합. 갭(§3 진영 불일치)의 서버측 해소는 기존 `LOGH_PLAYER_FOCUS_CELL`(off-default)
게이트로 이미 존재. 승격(기본 ON) 여부는 라이브 own_cell watchpoint 확정 후 결정(추측 P0 금지). **회귀 가드 오라클 추가**(아래 §5).

## 5. 검증 — 테스트 (직렬, P0)

`cd server && node --test --test-concurrency=1 tests/server/*.test.mjs` → **1180 pass / 0 fail / 18 skip**(이전 1179 + 신규 1).

신규 오라클(`tests/server/logh7-login-session.test.mjs`): "own-fleet 렌더 배선: LOGH_PLAYER_FOCUS_CELL 게이트가
0x0325 commander 슬롯(B+0x08)에 cell을 시드한다" — FOCUS_CELL ON이면 COMMANDER(=source+0x320)=cellId(2014),
CELL(B+0x0c)도 cellId, OFF(기본)면 COMMANDER=charId(777)/CELL=cellId 불변(1107 그린 경로 보호). 진영 동맹 14,20 사용.
기존 0x0325 officer/full-location/spawn-minimal 오라클 다수 유지.

## 6. 안전 라이브 검증 절차 (메인이 별도 신중 실행 — 서버데이터만, 화면깨짐 위험無)

skill `logh7-live`. ⚠️ BOTHTEC 스플래시 ~30초 대기, stale node 선kill, **autologin 금지 = 실유저 수동 로그인**.
1. node kill → `ui_explorer start`(login 서버+클라). 환경: `LOGH_AUTHORITATIVE=1 LOGH_STRAT_GALAXY=1 LOGH_FULL_UNIT_LOCATION=1`,
   own_cell 시드 실험 `LOGH_PLAYER_FOCUS_CELL=1`.
2. 실로그인 → 새 캐릭 → 진영선택 → 8단계폼 완주 → 세션연결 → world load(스플래시·NOW LOADING ~30초 준수).
3. trace: `0x0204`→`0x0325`→`0x0323`가 0x0f02 push에 나가고 0xb09 후 begin↔end 재전송 확인.
4. **검증 A**(렌더): 전략맵 shot. own-fleet home cell(진영 수도)에 함선 아이콘+상태패널 출현? (비교: shot 049/101 항성만).
   read-only Frida로 own_cell `*(DAT_007cd04c+0x11178)` 값 = 서버 cellId(2014/2588)인지, `FUN_0058d140` 히트, `FUN_004c7290` miss=false 확인.
5. **검증 B**(클릭→선택): 아이콘 셀 클릭 → 선택 하이라이트(`+0xb00`) latch? `FUN_004d68d0`/`FUN_004d6480`/`FUN_004c7290` 경로.
6. **검증 C**(명령메뉴→이동): 선택 후 인접 항행셀 클릭 → 명령메뉴(`FUN_004f6040`) → `0x0b01`(CommandMoveShip) 송신 카운트.
각 단계 P0/P1/P2 태깅 + shot/trace 증거. **EXE force 패치 금지**(mode-force=화면깨짐 반증).

## 7. 잔여 불확실 (D)

| # | 항목 | 상태 | 확정법 |
|---|---|---|---|
| U1 | own_cell `+0x11178`가 실제로 unit COMMANDER 슬롯(source+0x320)에서 흐르는가 | P2 미확정(정적 WRITE 0, 라이터=패치) | Frida write-watchpoint + FOCUS_CELL ON/OFF 차분 |
| U2 | 동맹 플레이어 own_cell 진영 정합(패치 하드코딩 2588 vs 서버 2014) | P1 | FOCUS_CELL=1로 own_cell==2014 라이브 관측 |
| U3 | `LOGH_PLAYER_FOCUS_CELL` 기본 ON 승격 | 결정대기 | U1/U2 라이브 후(추측 P0 금지) |
| U4 | `DAT_007ccffc+8`(활성 char ptr) 라이터 | P2(레지스터 폴딩) | 월드진입/0x0f06 중 watchpoint |
| U5 | event-9 enqueue↔dequeue(C002 선택 latch) | 별개 축(메모리 C002 트랙) | 본 문서 범위 외 |
