# LOGH VII — 전략맵 함대 "이동모드 진입 → 0x0b01 송신" 입력/제스처 RE

**목표:** 전략맵에서 함대 이동모드를 여는 정확한 사용자 입력/UI 제스처를 디컴파일로 특정. 다중 세션 막혀온 프런티어(좌클릭=카메라패닝, 우클릭=무동작, 0x0b01 미발화).

**출처:** `.omo/ghidra/export/G7MTClient/` (functions.jsonl / strings.tsv / symbols.tsv). imagebase 0x400000. 도구 `python tools/logh7_redex.py func <VA>`. 모든 결론에 함수 VA + confidence(P0=RE확정 / P1=강한정황 / P2=추정) 태그. 정적분석만 — 라이브 미검증 항목은 명기.

**관련 선행 문서(반드시 함께 읽을 것):** `docs/logh7-strategic-input-wire.md` — 이 문서의 §1(G1~G5 enablement gate)이 "클릭이 0x0b01을 내려면 서버가 함대를 그리드 오브젝트로 배치해야 한다"는 **전제 게이트**를 이미 확정해 둠. 본 문서는 그 위에 얹히는 **입력 제스처 + 송신 프리미티브 + 상태머신** 레이어다.

---

## 0. 요약 (브리핑 가정 정정 포함)

- **브리핑 정정 1 — `FUN_004bea90`는 0x0b01 consumer가 아니다.** 본체가 `{ return; }` 빈 스텁. (선행 문서 §0과 일치: own-move ACK는 맵 상태를 안 바꾼다.)
- **브리핑 정정 2 — `DAT_009d2a3c`에 2를 쓰는 클라 코드는 존재하지 않는다.** EXE 전수 raw 스캔 결과 `DAT_009d2a34/3c/40` 셋 다 **read-only**(write opcode 0건, BSS 초기값 없음). 즉 `FUN_00570a10`은 이 전역을 **소비만** 하고, 1→2 전이의 writer는 클라 .text에 없다. → "writer=FUN_xxx"는 RE상 답이 "클라에 없음"이다(상세 §2).
- **브리핑 정정 3 — `FUN_00570a10`은 vtable 메서드다.** call-expression 호출자 0건. 주소 `0x00570a10`은 `.rdata` vtable `0x00676a64`의 슬롯[53](`0x00676b38`)에 함수포인터로만 등장. 이 vtable을 설치하는 객체는 `"SendSimpleDataCommand"` 문자열을 쓰는 전략 명령항목 위젯.

**한 줄 결론:** 0x0b01을 실제로 빌드/송신하는 건 `FUN_004b4600`→`FUN_004b78a0`(case 0x3a→0xb01)이고, 이를 호출하는 건 in-world 상태머신 `FUN_0050d230`(←월드루프 `FUN_004b68f0`)의 "확정(confirm)" 서브스테이트다. 이동모드는 **함대를 선택한 상태(`widget+0x48 != 0`)에서 명령 카테고리 다이얼로그(`FUN_00570a10`, `SELECT_TXT_STRATEGY_CATEGORY`)로 "이동" 항목을 고를 때** `FUN_004d51d0(this,2)`로 열린다. 그 다음 목적지 셀을 좌클릭하면 항행 게이트 `FUN_004d6310`을 통과한 셀이 위젯에 등록되고, confirm 단계에서 0x0b01이 일괄 발사된다.

---

## (a) DAT_009d2a3c 1→2 writer 함수 + VA

**결론: 클라이언트 .text에 writer 없음 (P0 — 부재 자체가 RE 확정).**

| 전역 | VA | EXE 내 등장 | 종류 |
|---|---|---|---|
| `DAT_009d2a34` | 0x009d2a34 | 5회 (read@0x570a29, @0x58f410/4a2/4fb, cmp@0x58f719) | **READ/CMP만** (셀ID/포인터; 0x101=무효·취소) |
| `DAT_009d2a3c` | 0x009d2a3c | 1회 (`A1` read @0x570b9c) | **READ만** (모드/결과 값 0·2·3) |
| `DAT_009d2a40` | 0x009d2a40 | 1회 (`8B15` read @0x570bfc) | **READ만** (목적지 셀; mode==2일 때 `widget+0x34`로 복사) |

- write opcode(`c705`/`a3`/`89`), lea, push 형태 모두 0건. 셋 다 `.data` raw 범위 밖 = **BSS(0 초기화)**, 정적 초기값도 없음.
- 간접쓰기 가설도 기각: 인접 전역 객체 `0x009d2a30`(`mov ecx,0x9d2a30`으로 단일 전역 this 로드 → 전략맵 컨트롤러 클래스 메서드 `FUN_004d3000~4d8400`)의 어느 메서드도 `[ecx+0xc]`(=0x9d2a3c)·`[ecx+0x10]`(=0x9d2a40)에 store 안 함. 블록 클리어 루프(`&DAT_009d1510`/`009d2a04`/`009d2934`/`009d2ecc`)도 이 주소를 덮지 않음(범위 확인).

**해석(P1):** `DAT_009d2a3c`(0/2/3)와 `DAT_009d2a40`(목적지 셀)은 **외부(서버 수신 디코드 버퍼/구조체 포인터 경유 memcpy)에서 채워지는 read-only 채널**일 가능성이 높다. LOGH VII가 authoritative-server 구조이고, `DAT_009d2a34`가 `(char*)`로 0x101(무효/취소)과 비교되는 점이 이 가설과 부합. → 즉 `FUN_00570a10`의 `DAT_009d2a3c==2` 분기(return 3, 목적지 적용)는 **서버가 이동을 승인/계산해 돌려준 결과를 폴링**하는 것으로 보인다. memcpy 대상은 절대주소 스캔에 안 잡히므로 미확정(§4 참조).

> ⚠️ 따라서 브리핑의 "DAT_009d2a3c 1→2 writer를 찾아라"는 전제가 어긋난다. **이 전역은 이동모드 진입의 *원인*이 아니라 서버 응답을 받는 *결과* 채널이다.** 실제 이동모드 진입은 §(c)의 위젯 mode 세터(`FUN_004d51d0`)와 상태머신(`FUN_0050d230`)으로 일어난다.

---

## (b) FUN_00570a10 호출체인 (입력 → 핸들러)

`FUN_00570a10` = 전략 "명령 카테고리 선택" 다이얼로그의 액션 핸들러 (vtable 메서드).

### vtable / 등록
- vtable base = `0x00676a64`, 슬롯[53] = `0x00676b38` = `FUN_00570a10`. (P0 — raw 포인터 단일 등장)
- 이 vtable을 설치하는 생성자(12곳): `FUN_0057faf0`(직전 문자열 `"SendSimpleDataCommand"`), 0x57feb0, 0x580310, 0x580830, 0x580f10, 0x581380, 0x584070, 0x5841e0, 0x58aa80, 0x58b3f0, 0x58b5c0, 0x58c040. (P0/P1)
- 동일 vtable 인접 액션 핸들러: `FUN_00570940`[슬롯123], `FUN_00570c80`[슬롯88], `FUN_005737d0`, `FUN_00573cd0`.

### 다이얼로그 정체 (문자열 증거)
- `FUN_00570a10`이 쓰는 문자열: `SELECT_TXT_STRATEGY_CATEGORY`(0x0078bc84), `Please choose the grid.`(0x0078bca4). → **"전략 명령 카테고리 선택 → 그리드 선택"** UI.
- `SELECT_TXT_STRATEGY_CATEGORY` 참조 함수: `FUN_00570a10`, `FUN_00573e50`(case 8), `FUN_0058aa80`(전략맵 명령 UI 빌더). 위젯 타입 0x13으로 `FUN_00570eb0(..., SELECT_TXT_STRATEGY_CATEGORY, 0x13, ...)` 생성.
- 인접 선택 UI: `TARGET_SELECT_S_STRATEGY`(0x0078bb9c, 함대 선택), `TARGET_SELECT_GRID`(0x0078bd98, 그리드 선택), `SELECT_TXT_MCP_MAKE_PLAN`(0x0078bfac).
- `FUN_00573e50`의 case 8(상태 `param_1+0x28==8`)이 카테고리 선택 완료 처리: CATEGORY → GRID → OUTFIT_TYPE → MCP_MAKE_PLAN 순서로 결과를 읽고 `FUN_004b54b0()` 호출.

### 입력 → 다이얼로그 (P1, 키바인딩 경유)
- 메인 프레임 루프 `FUN_004fd100` → 전략맵 입력 처리 `FUN_0052f700`.
- `FUN_0052f700`은 키 코드를 `FUN_004c8700()`(키바인딩 테이블)로 조회. `FUN_005312b0`에서 키코드 `0x19→0x903`, `0x3f→0xc02`, `0x40→0xc05`로 매핑 후 `*(param_1+0x2c8)=2`(전략 상태 2 전환). `FUN_005313f0`도 `0x19`/`0x3f` 처리.
- **함대 선택 게이트:** `FUN_00570a10`은 `widget+0x48 != 0`(=함대가 선택됨)일 때만 카테고리 처리 실행. 미선택이면 `FUN_004d51d0(0)`(모드 클리어).

### 핸들러 내부 동작 (디컴파일 확정, P0)
`FUN_00570a10(this=명령항목 위젯, param_2=항목 리스트)`:
1. `DAT_009d2a34 != 0x101`(선택 그리드 셀 유효)일 때만 본체 진입. `DAT_0078bb2c = DAT_009d2a34`로 셀 캐시 후 `FUN_004d5030(this)`.
2. `this+0x48 == 0` → `FUN_004d51d0(this, 0)`(선택해제). 아니면 `param_2` 리스트 순회(`FUN_005736d0`), 명령바이트 `0x21`을 로컬 레코드 `local_30[0]='!'`에 세팅 후:
   - 선택 항목의 `*(iVar7+0x14) == 0` → **`FUN_004d51d0(this, 1)`** (단일선택 모드)
   - else → **`FUN_004d51d0(this, 2)`** (이동/경로선택 모드) ← raw 확인: `6a 02`(push 2)·`call 0x4d51d0` @VA 0x570b78/0x570b8a
3. 이후 `DAT_009d2a3c` 분기: ==0→return 0(대기); ==2→`*(this+0x34)=DAT_009d2a40`(목적지 확정)+`FUN_00517db0()`+return 3; ==3→`FUN_00517db0()`+return 6; else→return 1.

---

## (c) 이동모드(=2) 진입 + 0x0b01 송신 경로

### mode 세터 `FUN_004d51d0(this, mode, arg3)` (P0)
- `*(this+0x14) = mode`. mode∈{1,2}이면 `*(this+0x20) = -1`(무제한 range), 그 외 5.
- mode != 0이면 자식 위젯 검증 후 `FUN_0056a950(0xc, mode, 0)` 호출(일반 화면/모달 FSM, 상태 0xc = 이동선택 서브화면으로 전이).
- **mode==2 = 이동/경로선택 모드.** 호출자: `FUN_00570a10`(카테고리에서 "이동" 선택), `FUN_004d5030`(리셋 시 mode 0).

### 항행 게이트 `FUN_004d6310(셀x, 셀y, range)` → bool (P0)
1. `FUN_004d35b0(x,y)` 셀 타입 != 1 && != 3 → false. → **셀 byte 타입 ∈ {1,3}일 때만 통과** (메모리 `[[logh7-terrain-navigability-model]]`의 byte1∈{1,3} 모델과 일치).
2. mode!=0이면 `FUN_004d35e0(x,y)`로 objectTable 조회, 엔트리 `+0x3c`==0이면 false(점유/도달 플래그).
3. 현재 함대 셀(`*(DAT_007cd04c+0x11178)`)과 목적지가 같고 mode==0이면 false.
4. `range>=0`이면 3D거리(`FUN_004d3540` 좌표화→`FUN_005ff524` sqrt) ≤ (range + `_DAT_0066e664`)일 때만 통과 (사거리 게이트).

**게이트는 송신 안 함 — 목적지 등록만.** 호출자 3곳:
- `FUN_004d4e90`: 통과 시 `this+0x18=x, this+0x1c=y`(목적지 확정) + `FUN_004f6ee0()`(카메라 포커스).
- `FUN_004d6480`: 사거리 셀 하이라이트 렌더(통과 셀 시각화).
- `FUN_004d6b70`: 위젯 update — 좌클릭 edge에서 목적지 확정.

### 마우스 입력 분기 `FUN_004d6b70` (P1)
- `bVar3 = DAT_02214bb0`(전략맵 활성) && `FUN_00500b60`(입력 포커스 `*(x+0x24)==1`).
- 목적지 선택 sub-state(`*(this+0xc)==1`)에서:
  - `FUN_00500b60` && `DAT_022142dc & 0x40`(**우클릭** edge) → `this[0xc]='\x03'`(취소).
  - else `bVar3 && DAT_022142db & 0x40`(**좌클릭** edge) && `FUN_004d6310(목적지, range)` 통과 → 목적지 확정, `this+0x10 = x + y*100`, `this[0xc]='\x02'`.
- 그 외 모드: `bVar3 && 좌클릭` && `FUN_004d6310(x,y,-1)` 통과 → 목적지 갱신 + `FUN_004f6ee0`(카메라 이동).
- 입력 뱅크: `0x022142da + VK` 인덱싱 → `DAT_022142db`=VK_LBUTTON(좌), `DAT_022142dc`=VK_RBUTTON(우). 비트 `0x40`=edge(눌린 순간), `0x80`=hold. (P1)

### 0x0b01 빌드/송신 (P0 — 직접 디컴파일 확인)
```
FUN_004b68f0  (월드 메인 루프)
  └─ FUN_0050d230  (in-world 전략 커맨드 상태머신; switch(*(param_1+4)), 값 0/1/2/3/...)
       └─ [confirm 서브스테이트] 선택함대 배열 DAT_02214cb0 순회
            └─ FUN_004b4600(1, cells)            ← 0xb01 빌더 (VA 0x004b4600)
                 · local_88 = FUN_004b4a90(); local_84 = count; local_80[]=cells
                 └─ FUN_004b78a0(0, 0x3a, local_90)  ← 공통 아웃바운드 디스패처 (VA 0x004b78a0)
                      case 0x3a:  iVar1 = 0xb01 (송신 opcode)  ← raw 확인
                      param_2==0 (즉시송신) → (**(DAT_007c25f4+0x44)+0x18)(socket, 0xb01, payload)
```
- `FUN_004b4600` 호출자 = `FUN_0050d230` **단 1곳**. `FUN_0050d230` 호출자 = `FUN_004b68f0`(월드 루프) 단 1곳.
- 0xb01 송신 크기 = **0x24(36)바이트** (사이즈 테이블 `FUN_004b8b00`의 `case 0xb01: *param_4=0x24`). 선행 문서 §2와 일치.
- 동일 송신 프리미티브로 `0x400 CommandMoveShip` = `FUN_004b78a0` case 0x30(디버그 `">>>>CommandMoveShip"`).
- `FUN_004ba2b0`(브리핑의 "dispatcher")는 `if(0xb01 < local_3c)` 비교를 하는 **인바운드 수신 파서**(서버→클라). 0x0b01 송신과 반대 방향이므로 송신 경로에서 제외.

### 선행 문서와의 화해 (SendWarpCommand vs FUN_004b4600)
- 선행 문서 §1.1은 SelectGrid 다이얼로그(`FUN_00581c80`)의 `SendWarpCommand`(vtable `PTR_FUN_00676aec`, 핸들러 `FUN_00582060`/`FUN_00583e20`)가 0x0b01을 보낸다고 기록. 본 문서의 `FUN_004b4600`→`FUN_004b78a0`는 **그 송신의 실제 프리미티브**다(다이얼로그 FSM이 confirm에 도달 → `FUN_0050d230` 상태머신이 `FUN_004b4600(1)` 발사). 두 기술은 모순이 아니라 **같은 경로의 상위(다이얼로그 FSM) / 하위(소켓 송신 프리미티브)** 레이어.
- `SendWarpCommand` 핸들러 `FUN_00582060`은 `FUN_00570eb0()`(SelectDialog 생성)을 호출 — 즉 카테고리/그리드 선택 UI와 송신 다이얼로그가 같은 위젯 패밀리.

---

## 추정 라이브 제스처 (confidence 태그)

라이브 증상(좌클릭=패닝, 우클릭=무동작, 0x0b01 미발화)과 코드 흐름(좌클릭=목적지선택, 우클릭=취소)이 **반대**다. 가장 가능성 높은 차단 지점 순서:

1. **[P1·최유력] 위젯이 "목적지 선택 sub-state"에 도달 못 함.** `FUN_00570a10`(카테고리 선택)에서 함대가 선택돼야(`widget+0x48 != 0`) `FUN_004d51d0(this,2)`로 mode=2가 되고, 그래야 `FUN_004d6b70`의 `*(widget+0xc)==1` 목적지선택 분기가 활성. 이 경로가 안 밟히면 좌클릭이 목적지선택 대신 카메라 패닝(`FUN_004f6f60`)으로 떨어진다.
   - **즉 누락된 제스처 = "함대 선택 → 명령 카테고리(STRATEGY_CATEGORY) 다이얼로그에서 *이동* 항목 선택".** 이게 mode=2를 여는 행위다. 단순 맵 클릭으로는 절대 안 열린다(브리핑 라이브 관찰과 일치).
   - 추정 입력: 함대 클릭/선택 후 키 `0x40`(또는 `0x19`/`0x3f`) 또는 우클릭 컨텍스트 → `FUN_0052f700` → 카테고리 다이얼로그. (키 매핑은 `FUN_004c8700` 키바인딩 테이블 의존 — 실제 물리 키는 라이브 확인 필요.)
2. **[P1] enablement 게이트(G1~G5, 선행 문서 §1.2) 미충족.** 특히 G4/G5 — 서버가 플레이어 함대를 그리드 오브젝트(`clientBase+0x2c1755`)로 배치하고 `0x0313`/`0x0315`/`0x0325`를 안 보내면, 클릭 대상 자체가 없어 `bVar3`/항행게이트가 false → 좌클릭이 패닝으로만 소비. (메모리: 0x0315 terrain·grid 서버가 빈 채로 내려보냄.)
3. **[P2] 항행 게이트 `FUN_004d6310`이 false.** 목적지 셀 타입 ∉ {1,3}, objectTable `+0x3c`==0, 또는 사거리 초과 → 좌클릭 무시. (현재 빈셀=값0=차단 모델과 부합 — 메모리 movement 버그 추정.)

---

## (d) 미확정 / 추가조사 필요

1. **`DAT_009d2a3c/40`을 채우는 서버 수신 디코더(memcpy 대상).** 0x9d2a30 인접 BSS를 채우는 수신 메시지 파서를 추적해야 1→2 전이의 실제 원천(서버 응답 레코드)을 확정. → logh7-wire 영역(레코드 오프셋).
2. **키 `0x40`/`0x19`/`0x3f`의 물리 입력.** `FUN_004c8700` 키바인딩 테이블이 어떤 마우스버튼/키에 매핑되는지(우클릭? 전용 단축키?) — 라이브 또는 키바인딩 리소스 확인 필요.
3. **라이브 차단 지점 확정.** 전략맵 함대 선택 직후 위젯 `+0x14`(mode), `+0xc`(sub-state), 전역 `DAT_02214bb0`, `DAT_009d2a34`(0x101 여부), `FUN_00500b60` 대상 `+0x24` 값을 캡처하면 §추정의 1/2/3 중 실제 차단을 특정. (함수경계 전용 Frida 프로브 + logh7-live.)
4. **`SELECT_TXT_STRATEGY_CATEGORY` 메뉴 항목 텍스트.** 카테고리(이동/공격/대기 등)의 실제 문자열은 String.txt/리소스에 있어 디컴파일 직접 확인 불가. `FUN_00573e50` case8의 로컬 enum {0,1,2,3,4} + {0,10,20,40}이 항목/단계로 추정(P2).

---

## 핵심 함수 VA 색인

| VA | 역할 | conf |
|---|---|---|
| 0x00570a10 | 명령 카테고리 선택 핸들러 (vtable[53]@0x676b38); mode 1/2 분기 | P0 |
| 0x00676a64 | 위젯 vtable base (슬롯53=0x570a10) | P0 |
| 0x0057faf0 | vtable 설치 생성자 (+`"SendSimpleDataCommand"`) | P0/P1 |
| 0x004d51d0 | mode 세터: `*(this+0x14)=mode` (2=이동/경로); `FUN_0056a950(0xc)` | P0 |
| 0x004d5030 | 전략 컨트롤러 상태 세터 (mode 리셋) | P0 |
| 0x0056a950 | 일반 화면/모달 FSM (상태 0xc=이동선택 서브화면) | P0 |
| 0x004d6310 | 항행 게이트: 셀타입∈{1,3} + objectTable+0x3c + 사거리 | P0 |
| 0x004d4e90 | 게이트 통과 시 목적지(`this+0x18/0x1c`) 등록 | P0 |
| 0x004d6b70 | 전략맵 위젯 update; 좌클릭 목적지선택 / 우클릭 취소 분기 | P1 |
| 0x004f6f60 | 카메라 패닝 핸들러 (우클릭 hold / 화면가장자리) | P1 |
| 0x0050d230 | in-world 전략 커맨드 상태머신; confirm에서 `FUN_004b4600(1)` | P0 |
| 0x004b68f0 | 월드 메인 루프 (→FUN_0050d230) | P0 |
| 0x004b4600 | **0xb01 빌더** → `FUN_004b78a0(0,0x3a,buf)` | P0 |
| 0x004b78a0 | **공통 아웃바운드 디스패처**; case 0x3a→0xb01 (case 0x30→0x400) | P0 |
| 0x004b8b00 | 송신 사이즈 테이블 (`0xb01`→0x24B) | P0 |
| 0x0052f700 | 전략맵 입력 처리 (키바인딩→카테고리 진입) | P1 |
| 0x005312b0 / 0x005313f0 | 키코드 0x19/0x3f/0x40 처리 | P1 |
| 0x00581c80 | SelectGrid 다이얼로그 팩토리 (선행 문서 §1.1) | P0 |
| 0x00582060 | SendWarpCommand 핸들러 (vtable PTR_FUN_00676aec) | P0 |
| 0x004bea90 | **빈 스텁** (0x0b01 consumer 아님) | P0 |
| 0x004ba2b0 | 인바운드 수신 파서 (송신 아님) | P0 |
| DAT_009d2a34/3c/40 | read-only 채널 (셀ID / 모드결과 / 목적지셀) — writer 클라에 없음 | P0 |

---

## (e) 라이브 계측 결과 (2026-06-19, Frida 프로브 logh7_frida_movemode_probe.py)

camera-focus 패치 클라(movetest)를 ui_explorer로 월드 진입 → Frida attach(5훅) → 포괄 입력 스윕 2회(좌/우클릭·방향키·Enter·Space·Esc·Tab·F1·숫자1-4·문자 M/A/C/W/S·HUD클릭). 하드 증거:

- **✅ terrain 항행판정 작동 확정**: `navGate`(FUN_004d6310)가 홈셀 `(col 0x32=50, row 0x18=24)` 및 커서셀 `(0x33,0x1a)`·`(0x30,0x1a)`에 대해 **`passed=true`**(ret -256/513, ecx_this=0x9d2a30). → **장기 미해결 "0x0315 terrain 빈/차단" 우려 해소** — 셀은 실제 항행가능, 서버 terrain·cave-detour 정상.
- **✅ 커서/셀 이동 작동**: 방향키가 커서를 셀 위로 이동(이동마다 navGate 발화).
- **❌ 이동모드 진입 미발화(정밀 국소화)**: `moveHandler`(FUN_00570a10, vtable[53])·`modeSetter`(FUN_004d51d0) **0회**(어떤 입력으로도). `catGate`(FUN_004fd100)는 매프레임 발화하나 `DAT_02214325`/`DAT_02214324` **항상 0x0**(카테고리 다이얼로그 입력 플래그가 표준 입력으로 안 켜짐). `pan`(FUN_004f6f60) 다수 — 클릭은 패닝으로 소비.
- **결론**: 블록은 terrain/항행/커서가 아니라 **"이동명령 입력 또는 그 전제(G5 PLAYER_INFO↔unit linkage)"** 하나로 좁혀짐. 표준 키/마우스 ~20종 어느 것도 moveHandler를 호출 안 함 → 구조적 전제 미충족 의심.
- **다음 RE 방향(rigorous)**: (1) **vtable[53]@0x676b38 dispatch** — 누가 move-mode 핸들러를 호출하나(다이얼로그 프레임워크의 항목선택 콜백). (2) **G5 linkage 검증** — `FUN_004c2a80`(0x0b0a 시 호출)이 char(0x0323)↔unit(0x0325) id를 실제 연결했는지 Frida로 확인(연결 실패 시 함대가 "선택가능 소유유닛"이 아니라 명령 다이얼로그가 거부). (3) 카테고리 다이얼로그를 여는 정확한 입력(HUD 명령버튼 좌표 or 미지 키) — 다이얼로그 빌더 FUN_0052f700의 오픈 조건 역추적.

---

## (f) 라이브 계측 결과 #2 (2026-06-20, 확장 프로브 + fleetfix 빌드)

§(e)를 **fleetfix 빌드(strat-camera-focus 포함, SHA 60b90c36)** + **송신경로까지 후킹한 확장 프로브**(sendB01
0x50d230·clickToCell 0x4fd560·cellStatePush 0x4fd7a0 + DAT_02214325 write-watch 추가, 14훅)로 재현·확장.
ui_explorer 월드진입(0x0f02/0x0313/0x0315/0x0323/0x0325/0x0b09/0x0b0a 전부) → Frida attach(PID) → 좌/우클릭·
HUD 패널 클릭 스윕. 하드 증거:

- **✅ §(e) 재확정**: `navGate`(FUN_004d6310) 우클릭에서 cell`(0x32=50,0x18=24)` `passed=true`(ret -256). 항행
  판정·terrain 정상. catGate(FUN_004fd100) 매프레임 폴링, `state_ecx_pf4` **전 샘플 0x1**(다이얼로그 상태 불변),
  `DAT_02214325` **전 샘플 0x0**(입력게이트 닫힘), PAN 다수.
- **✅ 송신경로도 미도달 확정(신규)**: 직접 후킹한 `sendB01`/`clickToCell`/`cellStatePush` **0회**. moveHandler·
  modeSetter도 0회. `INPUTGATE_WRITE`/`OWNCELL_WRITE` watch 0회. → 차단이 송신측이 아니라 **이동모드 진입(카테고리
  다이얼로그 활성화)** 단일 지점임이 더 강하게 확정.
- **✅ G5 linkage 부분해소(신규)**: `slotResolver`(FUN_004c7290) **id=0x2 → ret=0xf34d0d0, miss=false**. PLAYER_INFO
  슬롯이 **리졸브됨**(렌더측 char↔unit 연결 정상). §(e)의 "G5 linkage 실패" 의심은 적어도 슬롯 리졸브 레벨에선 반증
  — 남은 미지는 **다이얼로그를 여는 정확한 제스처/전제**(catGate state 1→오픈 전이 트리거).
- **결론(불변)**: raw 맵/HUD 클릭 어느 것도 카테고리 다이얼로그를 열지 않음 → 이동모드 미진입 → 0x0b01 미발신.
  다음 RE = **catGate(FUN_004fd100) state_ecx_pf4 1→? 전이 조건** + **다이얼로그 항목선택 콜백(vtable[53]@0x676b38)**
  호출자 역추적 + 다이얼로그 오픈 입력(FUN_0052f700 키바인딩/HUD 명령버튼 정확 좌표).
- **도구**: tools/logh7_frida_movemode_probe.py(이동-명령 클러스터 + 렌더-게이트 클러스터, selfcheck 14훅).

### (f-2) 정적 RE 체인 — 이동경로 게이트 = 입력-액션 인덱스 0x6a (2026-06-20)

§(f) 라이브에서 좁혀진 "이동모드 미진입"을 디컴파일로 추적(`tools/logh7_redex.py`), 게이트를 단일
입력-액션 인덱스로 국소화:

- **호출 계층**: `renderGate(FUN_004fef90)` → `catGate(FUN_004fd100)` 매프레임. catGate는 카테고리 다이얼로그가
  아니라 **전략맵 메인 뷰 핸들러**(카메라+클릭+HUD 다이얼로그 묶음).
- **catGate 최상단 게이트** `FUN_004fc470`: `*param_1 != 0 && inputAccessor(0x6a) != 0` 이어야 1 반환.
- **clickToCell(FUN_004fd560) 호출 조건**(catGate 내부): `*(param_1+0xf4) != 1` AND 입력이벤트 `FUN_005015f0(4,...)`.
  라이브 관측 `state(0xf4)=항상 1` → 이 조건 자체로도 clickToCell 차단. state(0xf4)는 1..8 뷰모드 스택
  (`cellStatePush(FUN_004fd7a0)`가 push/pop, **이것도 FUN_004fc470 게이트**).
- **inputAccessor(FUN_0050cf40, __thiscall(this, idx))** = 입력-상태 테이블 룩업 `*(this + 4 + idx*4)`, 115(0x73)
  엔트리. 즉 **이동-명령 경로 전체가 입력-액션 인덱스 0x6a(=106)가 활성(!=0)인지에 게이트**된다. 0x6a가 0이면
  FUN_004fc470=0 → catGate가 클릭/셀/송신 경로를 전혀 안 탐(라이브 sendB01/clickToCell/cellStatePush 0회와 일치).
- **다음 RE(라이브 효율적)**: 프로브에 추가한 `inputAccessor` 훅(idx 0x6a/0x32 change-gated)으로 **키/버튼 입력별
  인덱스 0x6a 활성 순간**을 캡처 → 액션 106에 매핑된 정확한 제스처(특정 키 or HUD 명령버튼) 특정. 그 입력을
  ui_explorer로 보내 moveHandler/modeSetter→clickToCell→cellStatePush→sendB01(0x0b01) 연쇄 발화를 라이브 확인.
  (입력-테이블 writer는 0x1ac grep이 노이즈라 정적 식별 실패 → 라이브 캡처가 정공법.)

### (f-3) 라이브 계측 #3 — 0x6a 가설 정정 + 입력 주입 진단 (2026-06-20)

확장 프로브(inputAccessor + 입력-이벤트 검증 훅)로 §(f-2) 정적 가설을 **라이브 반증·정정**:

- **❌ §(f-2) "0x6a 게이트" 가설 정정**: idle에서 `inputAccessor(0x6a) ret=0x11374170`, `inputAccessor(0x32)
  ret=0x1123d620` — **둘 다 non-null 포인터**. inputAccessor(FUN_0050cf40)는 입력-상태 플래그가 아니라
  **객체/리소스 포인터 테이블**(`*(this+4+idx*4)`)이고, 0x6a는 항상 set → **FUN_004fc470 게이트는 열려 있음
  (블로커 아님)**. 정적 디컴파일만으로 "0x6a=입력게이트"로 본 건 오독이었다.
- **✅ 실 블로커 재확정 = state(0xf4) 고정 1 = 함대 미선택**: 좌클릭2·우클릭·HUD클릭·키 ~19종(Enter/Space/Tab/
  Esc/1-4/CMASWF/F1-2/0x19/0x3f/0x40) 어느 입력 후에도 `state_ecx_pf4` 전 샘플(9696) **0x1 불변**, modeSetter/
  moveHandler/clickToCell/cellStatePush/sendB01 **전부 0**. clickToCell은 state!=1 필요 → 선택이 안 되니 영영 차단.
- **⚠️ PAN/navGate는 입력구동 아님(정정)**: PAN(FUN_004f6f60) count=9696=프레임수 → **매 프레임 내부호출**.
  navGate(FUN_004d6310)는 우클릭 위치와 무관하게 **항상 홈셀(0x32,0x18)만** 2회 → 커서 미추적, 내부 자가체크.
  §(e)(f)에서 "navGate=우클릭 결과"로 본 귀속은 정정 — 클릭이 navGate를 유발한 게 아님.
- **입력 주입 방식 진단(tools/logh7_ui_explorer.py)**: 키보드=`PostMessage(WM_KEYDOWN)` → **DirectInput 키
  폴링은 PostMessage 못 봄**(키 스윕 무효 확정). 마우스=`SetForegroundWindow + mouse_event`(하드웨어 레벨) →
  DirectInput에 닿아야 정상이나 선택 효과 無. → 남은 양분: **(A)** 클릭 도달하나 선택가능 함대 hit-test 미스/
  선택불가, **(B)** 클릭-이벤트 소스 FUN_00502780(+8 플래그)에 안 잡힘.
- **다음(결정적 검증)**: 추가한 훅 `inputEventSrc`(FUN_00502780 +8 클릭플래그)·`eventMatch`(FUN_005015f0
  type4/5)·`rclickHandler`(FUN_004d4e90)로 **내 마우스 클릭 순간 +8가 켜지는지** 확인 → (A)/(B) 판정.
  (B)면 in-world 자동화는 DirectInput 레벨 주입 필요(메시지 주입으로 불가, 로비만 됨). (A)면 정확 좌표/
  선택가능 오브젝트 포맷 문제. selfcheck 17훅.

### (f-4) 결정적 결론 — 인-월드 입력이 핸들러를 구동 안 함 (2026-06-20, 3사이클 종합)

검증훅(inputEventSrc/eventMatch/rclickHandler)로 (A)/(B) 판정 시도. 결론:

- **포그라운드 확인**: 클릭 시점 `GetForegroundWindow`=G7MTClient(銀河英雄伝説Ⅶ) → **창은 포그라운드**(포커스 문제 아님).
- **우클릭 3회(다른 위치) → `rclickHandler`(FUN_004d4e90) 0회·`eventMatch` type5 0회**. catGate의 우클릭 분기는
  state 무관(`*(iVar3+8)!=0 && FUN_005015f0(5,..)`)인데도 미발화 → **내 우클릭이 클릭-이벤트로 등록 안 됨**.
- **`navGate`는 우클릭 위치와 무관하게 항상 홈셀(0x32,0x18)** → 커서 미추적(내부 자가체크). PAN=매프레임.
- **state(0xf4) 전 입력에 불변(1)**, 좌클릭의 eventMatch type4는 catGate `state!=1` **단락평가로 호출 자체가 안 됨**.
- **입력 주입 진단**: 마우스=`SetForegroundWindow+mouse_event`(하드웨어), 키=`PostMessage`(DirectInput 못봄).
  창이 포그라운드인데도 하드웨어 마우스 이벤트가 인-월드 핸들러를 안 깨움.

**결론(P0, 3사이클 재현)**: **ui_explorer의 현 입력 주입으로는 인-월드 전략맵 명령(선택/이동)을 구동할 수 없다.**
로비/캐릭생성(메시지 기반 UI)은 되지만 인-월드(D3D8+DirectInput 추정)는 클릭이 이벤트시스템에 안 잡힌다.
서버 권위적 AI 함대전(0x0426 라이브 다수)은 입력 무관하게 동작하므로 **플레이어-구동 인-월드 명령만** 이 한계에 막힌다.

**경로(다음 인프라 세션)**: (1) **DirectInput 레벨 주입** — Frida로 `IDirectInputDevice8::GetDeviceState/
GetDeviceData` 후킹해 합성 마우스/버튼 상태 주입(메시지/mouse_event 우회). (2) 또는 커서-매핑 검증: 게임이
읽는 커서셀을 훅으로 읽어 SetCursorPos와 대조(좌표/해상도 불일치 여부). (3) inputEventSrc 훅은 1→0→1 누락
버그 수정 완료 — 다음 사이클서 +8 전이 정밀 재관측 가능. 단 rclickHandler=0가 이미 충분한 음성 증거.
