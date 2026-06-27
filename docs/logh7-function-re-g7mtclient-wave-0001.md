# LOGH VII 함수 RE — G7MTClient 웨이브 0001 합성

생성일: 2026-06-22
대상 바이너리: `G7MTClient` (실클라)
원본 출력: `.omo/re-audit/functions/G7MTClient/out/batch-0000.json .. batch-0063.json`
원장: `.omo/re-audit/functions/G7MTClient/ledger.json`

> 정직 원칙: 이 문서는 디컴파일에서 **확정된 사실**과 **추론(inferred)**을 구분해 기록한다.
> 미확정 추론은 "추론" 또는 P3로 명시한다. 검증 안 된 가정을 확정처럼 적지 않는다.

---

## 1. 커버리지

| 항목 | 값 |
|---|---|
| 이번 웨이브 함수 수 | **176** (batch 0~63) |
| 누적 documented (ledger) | **176** |
| 전체 re_target | **6089** (`summary.json` / `worklist.order`) |
| 누적 커버리지 | **176 / 6089 = 약 2.89%** |
| 전체 계획 배치 수 | 926 (배치당 ~28함수 목표; 실제 배치는 1~28함수로 가변) |
| 다음 웨이브 시작 배치 | **64** |

확정 신뢰도 분포(이번 웨이브 176함수):
- **P0-decompile**: 175함수 (디컴파일 본문 근거 확정)
- **P3-inferred**: 1함수 — `FUN_004c8830`(0x004c8830, batch-0049). Ghidra 스택베이스 오추적으로 필드 오프셋 의미가 유닛테이블 stride 패턴에서 추론됨.

서브시스템 분포(이번 웨이브):
- strategic 다수(전략맵 상태머신/접근자/파서/빌더), render(전략맵/전장 렌더), ui(패널/리스트 빌더·상태머신), network(디스패처·와이어 빌더·텍스트 덤퍼), input(입력/IME/마우스), file(에셋/HFWR 로더), core(씬 init/cleanup), battle(전투 적용), audio(옵션 패널), crt(런타임 startup).

---

## 2. 핵심 발견

### 2.1 ★ 수신 옵코드 디스패처 `FUN_004ba2b0` (batch-0000, network/dispatcher, P0)

클라이언트측 **마스터 와이어 메시지 디스패처**. 호출규약 thiscall: `ecx=param_1`=거대 클라 상태객체 베이스, `param_2`=와이어 옵코드(하위16비트만 사용 `& 0xffff`), `param_3`=디코드된 inner 레코드 페이로드(word 배열, 0x0030 전송/디사이퍼 레이어 통과 후).

동작: 옵코드별 ~200개 핸들러로 분기 → 각 핸들러가 `FUN_005923a0`로 `'<Name> OK'` 디버그 문자열 로깅(→ 옵코드↔이름 카탈로그의 1차 출처) → 페이로드를 클라 상태객체 내 고정 슬롯(`param_1 + dest offset`)에 word 루프 복사 → 완료/소유 태그 `local_1c` 설정(-1=글로벌/정적, 0=브로드캐스트/노티파이, `param_3[1]`/`param_3[2]`=레코드별 ack id) → 타입드 post-handler(`FUN_004be..`/`FUN_004c..`) 호출(재렌더/적용). 에필로그에서 `local_1c == 선택캐릭id(+0x3584a0)`이면 100엔트리 히스토리 링(`FUN_004be350`)에 기록하고, 콜백 구독테이블(`+0x357ec0` count / `+0x357ec8` stride 0xc 엔트리)을 순회해 등록된 옵저버를 vtable 호출로 발화.

이 디스패처의 **opcode_table은 batch-0000에 169행으로 완전 수록**(아래 발췌). 전체 표는 원본 JSON 참조. 메모리 캐논과 정합한 핵심:

| 옵코드 | 이름 | dest 오프셋 | tag | 비고 |
|---|---|---|---|---|
| 0x0201 | SSLoginOK | +0x35f252 | -1 | DAT_007ccffc[0x358375/0x35837d]=1 |
| 0x0204 | SSCharacterIDResponce | +0x3584a0 | -1 | **선택캐릭id 설정**; 히스토리·콜백 게이트; DAT_007c25f8=1 |
| 0x0301 | ResponseTime | +0x432418 | -1 | **시각동기화**(RTT/drift). 전략상태 푸시 아님(C002 분석 관련) |
| 0x0313 | ResponseStaticInformationGridType | +0x3f57d4 | -1 | 전략그리드 terrain/항행성 테이블(서버 권위) |
| 0x0315 | ResponseStaticInformationGrid | +0x3f4448 | -1 | post `FUN_004abbb0` 재적용 |
| 0x0323 | ResponseInformationCharacter | +0x36a5e0→+0x36a8b4(stride 0x2d4) | -1 | 캐릭 47필드/724B; count==1이면 `FUN_004c2c80(1,rec,0)` |
| 0x0325 | ResponseInformationUnit | +0x41a364 | -1 | 함대/유닛; count>600 경고 |
| 0x031f | ResponseInformationBase | +0x3facf4 | -1 | 기지 경제(인구/식량) |
| 0x0400 | CommandMoveShip | &DAT_004327cc+param_1 | 0 | 전술 함대이동 |
| 0x0411 | CommandChangeMode | &DAT_004335fc+param_1 | 0 | 전략↔전술 모드변경(전술맵 진입경로) |
| 0x0426 | NotifyAttackedShip | &DAT_004332b4+param_1 | 0 | post `FUN_004c0df0`; AI 함대전 라이브검증 옵코드(G201) |
| 0x042f | NotifyChangeMode | &DAT_00433694+param_1 | 0 | 서버푸시 모드변경; post `FUN_004c1c30` |
| 0x0b01 | CommandMoveGrid | +0x4376f0 | param_3[2] | 전략 grid 이동(P0-02); post `FUN_004bea90` |
| 0x0b07 | NotifyMovedGrid | &DAT_00437714+param_1 | param_3[1] | 권위적 이동결과(G200); post `FUN_004bee20` |
| 0x0b09 | NotifyEnterGridBegin | +0x4376ec(value byte) | 0 | +0x36a5dc=0 리셋; **grid-begin value byte 저장**(C002 게이트) |
| 0x0b0a | NotifyEnterGridEnd | +0x4376ed(value byte) | 0 | **mode byte +0x126711 분기**: ==2(전략)&&+0x4376ec==0이면 `FUN_004c2a80(1)`, else DAT_007ccffc grid-render 상태; ==0이면도 `FUN_004c2a80(1)`. C002 own-fleet마커 vs 클릭가능 모드2 배타분기의 정확한 메커니즘 |
| 0x0f1c | CommandGridChat | +0x43cfa4 | param_3[1] | post `FUN_004be660` |
| 0x0f1e | CommandSpotUnicastChat | +0x43d0bc | param_3[1] | post `FUN_004be6a0`(채팅 수신측; cp932 송신해저드는 별도) |
| 0x1008 | CommandGenerateCharacterCharge | +0x43243c | 0 | 캐릭생성 커맨드 에코; post `FUN_004be7a0` |
| 0x2006 | LobbyResponseInformationSession | +0x359e3c | -1 | 세션리스트(picker 페이로드); packed-sequential 기대 |
| 0x7001 | LGLoginOK | +0x358388(4word) | -1 | 로그인게이트웨이 성공(리다이렉트); DAT_007ccffc[0x35837a]=1 |

> 관련 데이터 ref: `+0x126711` 모드 byte(2=전략), `+0x4376ec/+0x4376ed` grid-enter value byte, `+0x357ec0/+0x357ec8` 콜백테이블, `+0x3584a0` 선택캐릭id, `DAT_007ccffc` 제2 글로벌 베이스(로그인-스테이지 ready 비트).

### 2.2 ★ 송신 옵코드 디스패처 `FUN_004b78a0` (batch-0060, network/dispatcher, P0)

**클라→서버 커맨드 디스패처**. thiscall(`ecx=param_1`=네트워크/세션 커맨드객체). `param_3 & 0xffff`=1-based 논리 커맨드인덱스 → `(idx)-1`로 거대 switch → 옵코드 **쌍** 매핑: `iVar1`=송신(요청) 옵코드, `iVar5`=기대 응답 옵코드(-1=없음). `param_2==0`이면 transport(`DAT_007c25f4`)로 동기송신, `!=0`이면 100엔트리 링큐(`+0x357ec0`)에 `{opcode, expected-reply, payload}` 적재(지연/배치). 대부분 data/strategic/battle 커맨드는 in-world/접속 게이트 `+0x35837e`로 막혀 0이면 return; lobby/login/session(case 0~10)은 무조건 송신. 큐 오버플로(>99) 시 `'MAX QUE Waiting'` 로깅.

송신 옵코드 집합(요청/응답 쌍, 발췌): 0x0200/0x0201(SSLogin), 0x7000/0x7001(LG login), 0x2000~0x200a(lobby/session), 0x1000~0x1008(account/char), 0x0300~0x0349(static/info request), 0x0400~0x0422(전술 커맨드), 0x0b00~0x0b07(strategic grid: 0x0b01 MoveGrid, 0x0b07 MovedGrid), 0x0c00~0x0c0c(완성도/보급), 0x0704~0x0709(rank/card), 0x0900~0x0902(strategy plan), 0x0f04~0x0f1e(mail/messenger/chat).

> open_q(정직): `iVar5`=기대 응답 옵코드라는 강한 증거(+0x357ec8 큐슬롯 저장·동기 flush 사용)는 있으나 파서측 byte 검증은 이 함수만으로 미확정. case 0x35/0x7e처럼 두 옵코드가 같은 경우(self-ack vs no-reply)는 추론. case 0x20=0x31f/0x31e, 0x21=0x320/0x321은 디컴파일 십진 리터럴을 16진 확인 완료.

**이로써 LOGH VII 와이어의 양방향 옵코드 매핑(수신 `FUN_004ba2b0` + 송신 `FUN_004b78a0`)이 한 웨이브에 동시 확보됨.**

### 2.3 ★ C002 전략 클릭/event-9 파이프라인 (메모리 캐논 정합)

이번 웨이브가 메모리의 C002 조사를 정적 RE로 **교차확정**한 핵심 함수군:

- **`FUN_004b68f0`** (batch-0005, strategic/state-machine, P0) — 최상위 in-game 프레임틱 / 월드진입 부트 상태머신. mode byte `param_1[0x126711]` 분기: **mode 0** → `param_1[0x126718]` 세트 시 입력/전략클릭 소비 파이프라인(`FUN_004f6f60` 히트테스트 → `FUN_0050d230` **event-9 소비** → ...); **mode 2** → `param_1[0x2a58f8]` 세트 시 전략맵 enqueue 파이프라인(`FUN_004f6f60` → `FUN_004fef90` **StrategySequence/event-9 enqueue**). **mode 0/2 배타 → event-9가 mode2서 쌓이고 mode0서만 빠짐** = 메모리에 기록된 C002 근본의 정적 근거.
- **`FUN_004fef90`** (batch-0004, P0) — StrategySequence 상태머신 드라이버. state at `+4`. state0=Init/Update: `FUN_004f9030`로 task 시드(DAT_00c9e2e0==0일 때), `FUN_00501e30`로 **event id 9 enqueue**(C002 event-9 enqueue), state1로 진행. state1=poll/consume(`FUN_005015f0`로 0x356/0x0b0d 수신). `*(param_1+0xc)+0x3a0` 게이트.
- **`FUN_0050d230`** (batch-0003, P0) — 전략맵 HUD 커맨드/오더 상태머신 + 클릭확정 디스패처('mode0/menu' event-9 소비처). `*(param_1+4)` 액션상태(0..40) switch로 멀티선택·이동/오더발행. event-9 클릭큐의 진짜 소비처이자 플레이어 전략오더 발행지.
- **`FUN_005015f0`** (batch-0004, input/dispatcher, P0) — 이벤트/입력 poll-and-classify. `param_2`=이벤트클래스(0..0x17): case 10(0xa)=`+0xb02` 클릭확정 플래그 보고(C002 핵심). StrategySequence가 호출하는 'event 가용성 폴링' 프리미티브.
- **`FUN_00507f20`** (batch-0009, P0) — 전략맵 틱 + event-9 dequeue + 스크롤추종. `+0xb01` hit byte → `+0xb02` 클릭확정 byte 래치. C002 클릭확정 dequeue 루프.
- **`FUN_004f96d0`** (batch-0043, strategic/builder, P0) — 'ReceiveResult' 전략상태 task 빌드+enqueue(클라측 grid-state 이벤트 자체생성; 메모리의 case0→`FUN_004f96d0`→ReceiveResult task와 정합). 노드쌍: grid-BEGIN 0xb0b/0xb00, grid 0xb07/0xb01.
- **`FUN_00515950`** (batch-0049, strategic/dispatcher, P0) — 카테고리 3..0xb 위젯에서 pending event-9 스캔→`FUN_005015f0(9,...)` true면 모드변경(`FUN_004aff50(3)`)+커맨드 브로드캐스트. event-9 소비측.

### 2.4 입력 / IME / 마우스

- **`FUN_004e7200`** (batch-0015, input/dispatcher, P0) — Win32/IME 입력 메시지 핸들러. WM_IME_* (0x281/0x282/0x285/0x286/0x290/0x10d/0x10e/0x10f) composition 플래그(`DAT_00c51598`, `DAT_02214649`) 갱신; WM_KEYDOWN(0x100)→`FUN_004ffdc0`, ESC(0x1b)시 `FUN_0054eed0`; WM_CHAR(0x102)→`FUN_004fff60` 검증 후 라우팅. **한글 IME 입력경로의 핵심**(메모리: 캐릭 이름칸 한글 네이티브 지원 정합).
- **`FUN_00500b70`** (batch-0005, cdecl, P0) — 프레임별 입력/카메라드래그 샘플링. GetAsyncKeyState로 hot키 래치(`DAT_02214c2c`), GetCursorPos/ScreenToClient, 좌/우버튼 드래그 상태머신, 합성클릭 큐(`DAT_02214434/38`). 메모리의 keybd_event/합성클릭 라이브검증과 정합.
- **`FUN_004f6f60`** (batch-0002, render, P0) — 3D 전략맵 카메라/뷰 + raw 입력. VK 배열(`DAT_022142da`), 마우스 XY(`DAT_022143dc/e0`), 엣지스크롤·마우스룩·줌·북마크 보간.
- **`FUN_00500580`** (batch-0016, input/builder, P0) — 프레임별 마우스/커서 입력 스냅샷 빌드(focus/GetFocus 기록).

### 2.5 전략 그리드 / 항행성 (메모리 terrain 모델 정합)

- **`FUN_004c8b70`** (batch-0048, cdecl, P0) — 갤럭시-그리드 셀 접근자. 좌표검증 `0<=x<100, 0<=y<0x32(50)`(캐논 **100x50** 그리드 정합) → terrain/owner byte 테이블 `DAT_007ccffc+0x2c03cc`(row-major) 인덱스 → byte*3 → 속성/색 테이블 `+0x2c1755` 포인터 반환.
- **`FUN_004d6310`** (batch-0016, thiscall, P0) — 항행성+거리 술어. 타겟셀 terrain 항행성 `FUN_004d35b0`(**objectTable byte1 ∈ {1,3}**, 메모리 모델 정합) 확인 → own셀(`+0x11178`)·타겟셀 3D변환 → 유클리드거리 ≤ `param_4+epsilon` 판정.
- **`FUN_004d4e90`** (batch-0046, P0) — own셀(`+0x11178`) col=idx%100 row=idx/100 → 카메라포커스 triple(`_DAT_00c5153c/40/44`) → `FUN_004d6310(col,row,1)` 유효시 col→+0x18 row→+0x1c 기록.
- **`FUN_004c8bc0`** (batch-0051, P0) — terrain/owner 셀값→그리드 오프셋 역인덱스(0x59 sentinel, 5000셀 스캔).
- **`FUN_004d8280`**(batch-0011)·**`FUN_004ee3c0`**(batch-0040)·**`FUN_004d6b70`**(batch-0008) — 100x50 별-그리드 렌더·격자 정점버퍼·셀그리드 인터랙션 드라이버. "%d0 LY" 거리라벨.

### 2.6 HUD / 모드 전환

- **`FUN_004fd7a0`** (batch-0007, ui/state-machine, P0) — 활성 HUD/전략 표시모드 전환 + 패널슬롯 재배치. `param_2`(mode 1..8) 검증+`FUN_004fc470` 게이트 → `this+0xf4` 새 모드 저장 → 패널-레이아웃 테이블 `DAT_006703c0`(stride 0x50) 순회. 메모리의 "strat HUD mode 활성화(FUN_004fd7a0)" 정합.
- **`FUN_004b4a90`** (batch-0007, P0) — 현재 선택 캐릭id 접근자(override `DAT_007ccc24` 0이면 `+0x3584a0`).
- **`FUN_004fc4a0`**(batch-0047)·**`FUN_004d5030`**(batch-0043) — 전략객체 deferred 모드/씬 전환 커밋·뷰모드 setter(mode 8/4=활성 전략그리드).

### 2.7 채팅 cp932 송신 해저드 (메모리 P0-03 정합)

- **`FUN_00516bf0`** (batch-0018, ui/state-machine, P0) — in-world 채팅 입력/송신 펌프. 제출 시 C로캘을 **"Japanese"** 강제(`FUN_005ffcc1`/`s_Japanese_0076e3fc`) → `FUN_004eac60`(WideCharToMultiByte/MBTWC **코드페이지 932**) → `FUN_004b5600`(broadcast)/`FUN_004b5690`(private) 송신. **메모리의 cp932 채팅송신 해저드를 정적 RE로 직접 확정**(ACP=949 무관하게 송신경로가 locale Japanese 강제).
- **`FUN_004ae0d0`** (batch-0051, P0) — 채팅/텍스트 서브컨트롤 윈도 메시지핸들러(EM_/WM 0x202/0x204/0x205, **와이어 옵코드 아님** — 정직 명시).

### 2.8 코어 / 렌더 / 파일

- **`FUN_004e96f0`** (batch-0014, core/dispatcher, P0) — 메인 프레임 FrameMove+draw 오케스트레이션('MainLoop' 태그), `FUN_00401880`서 틱당 호출.
- **`FUN_004e8540`** (batch-0013, render/dispatcher, P0) — 'redboots::DrawWorld' 프레임별 월드/전략맵 마스터 렌더.
- **`FUN_004e9bb0`** (batch-0012, P0) — 'mkOneTimeSceneInit' 1회성 씬초기화(`DAT_00c515e8` 가드).
- **`FUN_004e76d0`** (batch-0054, P0, **rename 제안: `mkInitDeviceObjects`**) — D3D8 디바이스 초기화(IDirect3DDevice8 at +0x2a418).
- **`FUN_005e83f0`** (batch-0055, P0) — D3D8 셰이더셋 벌크 초기화.
- **`FUN_005924c0`** (batch-0006, file, P0) — 캐릭생성 얼굴/초상화 TCF 텍스처 lazy-load+캐시. `param_2`=7아틀라스(0=oem,1=oam,2=o,3=gem,4=gef,5=gam,6=gaf), `param_3`=슬롯인덱스. 메모리의 face군 인코딩 정합.
- **`FUN_004dd6a0`** (batch-0028, file/dispatcher, P0) — 확장자별 에셋 디코더 라우팅.
- **`FUN_00522060`** (batch-0028, file/parser, P0) — HFWR 포맷 문자열/메시지 테이블 로더(constmsg.dat 마스터카탈로그).
- **`FUN_0051a370`** (batch-0001, network/state-machine, P0) — 'WSEQ02_MAIN' 메인 로비/접속 시퀀스 상태머신(`+4` state 0x0~0x77): 로그인→메인메뉴→세션리스트→캐릭/원작/삭제/세션이동→체인지서버(LG2LB/LB2SS/SS2LG)→인증→월드진입 페이드.
- **`entry`/`0x00601fbc`** (batch-0022, crt) — CRT startup(SEH, GetVersion).
- **`FUN_00610420`** (batch-0053, file/library, P0) — `mtStreamInputBuffer::read`.

### 2.9 정보레코드 텍스트 덤퍼 군 (디버그 직렬화 — 와이어 스키마 1차출처)

batch-0052~0063 다수가 `_INF:<MessageName>#` 형식 디버그 텍스트 덤퍼. 와이어 필드 스키마 복원의 보조 출처:
- `FUN_0042e770`/`FUN_00419300` — ResponseInformationCharacter(0x0323) 덤퍼
- `FUN_0042bff0` — ResponseInformationDisplayCharacter
- `FUN_0041eaa0` — ResponseInformationOutfitParty
- `FUN_00409190` — ResponseInformationAccount
- `FUN_004908f0`/`FUN_0048df10` — CommandCreateOutfit 덤퍼(**동일 본문 2개** — 컴파일러 중복 인스턴스, 5483B 동일)
- `FUN_0047c270`/`FUN_00461440` — CommandOrderSuggestMail 덤퍼
- `FUN_0047f6f0` — CommandReplyOrderSuggestMail 덤퍼

---

## 3. verify 적발 / 정정 (정직)

이번 웨이브 출력에는 **별도의 verify-pass 정정 필드(hallucination/paramError/offsetError 명시 verdict)가 존재하지 않는다**. 검증성 내용은 각 함수의 `open_questions` / `purpose_confidence_note` / `confidence` 필드에 **자기-신뢰도 한정(self-flagged uncertainty)** 형태로 기록되어 있다. 아래는 그 한정 사항을 정정/주의 목록으로 정리한 것이다(허위 확정 방지 목적).

### 3.1 내부 sub-code를 와이어 옵코드로 오인하지 않도록 한 정정 (정확)
- `FUN_0054be80`(0x16), `FUN_0054bee0`(0xc): "0x16/0xc는 `FUN_0050cf40`에 넘기는 **로컬 커맨드 sub-code**이지 와이어 옵코드가 아니다. 실제 와이어 옵코드는 `FUN_005015f0`(op 0xe) 안에서 결정." — 와이어 카탈로그 오염 방지.
- `FUN_004ae0d0`: "0x202/0x204/0x205는 **Windows 컨트롤 통지코드(EM_/WM_)**, 와이어 옵코드 아님."
- `FUN_0052f700`: "uStack_698=0x22는 **내부 오더레코드 태그**(`FUN_0056a950`행), 와이어 family 옵코드 여부 미확정. 0x0022로 잠정 보고(저신뢰)."
- `FUN_0052d180`: "event opcode 0xf(`FUN_004b5810`→`FUN_004b78a0(1,0x46,...)`)는 in-engine 전략링 이벤트 셀렉터. 0x46가 별도 와이어 옵코드인지 이 함수만으로 미확정."
- `FUN_00539ce0`: "0xf는 in-game 전략 커맨드 sub-code(`FUN_004b78a0(1,0x46,..)`로 0x46바이트 커맨드). 온더와이어 매핑은 `FUN_004b78a0`/`FUN_004b4a90` 한 레이어 더 깊은 곳."

### 3.2 디컴파일러 아티팩트 식별 (정확)
- `FUN_004b68f0`: `in_EAX`는 **디컴파일러 아티팩트**(CONCAT31 carry 빌드용), 실제 의미인자 아님.
- `FUN_0051be40`/`0051bec0`/`0051bf90`: bool/char 반환의 `CONCAT31` 상위바이트는 **디컴파일 아티팩트**(al 단일바이트 반환).
- `FUN_004c8830`(**P3-inferred, 유일**): "Ghidra 스택베이스 오추적(register0x10, &stack 배열); -0xfa/-0xd2/-0x1c 오프셋 의미는 유닛테이블 stride 패턴에서 **추론**, 완전 확정 아님."

### 3.3 스텁/축소 본문 정직 표기 (정확)
- `FUN_004e76b0`/`FUN_004e7690`: "현 빌드에서 실제 작업이 로깅스텁 호출로 축소됨; 원래 동작은 디컴파일만으로 불명."

### 3.4 추론 명시(미확정으로 정직 표기된 항목)
- `FUN_0050d230`: 카테고리 마스크 상수(0x3d81 등) 비트의미, `FUN_005015f0` event code(2/3/4/5/9/0xd/0xe/0x10/0x16) 중 code 9만 확정.
- `FUN_00507f20`: param_2[0] kind 1/4는 apply 타깃에서 **추론**(명시 모드라벨 없음), kind 3만 확정.
- `FUN_0058ee70`: 커맨드슬롯 id 0x13..0x1c 의미는 분기구조 추론(0x1c=카메라포커스, 0x13/0x14=페이지스텝만 확정).
- `FUN_004b78a0`: iVar5=기대 응답 옵코드는 강한 증거 있으나 파서측 byte 미검증; equal-pair(self-ack vs no-reply) 추론.

> 종합: 이번 웨이브는 **확정/추론 분리가 비교적 정직**하게 되어 있고, 명백한 hallucination(존재하지 않는 호출/오프셋 날조)은 합성 검토 단계에서 발견되지 않았다. 가장 약한 항목은 P3 1건(`FUN_004c8830`)과 내부 sub-code↔와이어 옵코드 미해소 군이며, 이들은 모두 자기-한정되어 있다.

---

## 4. fail / partial 배치 (정직)

- **fail 배치: 없음.** batch-0000~0063 전부 유효 JSON으로 파싱되었고 `functions` 배열에 최소 1개 이상의 함수가 존재한다.
- **partial(축소) 함수**: `FUN_004e76b0`, `FUN_004e7690`(본문이 로깅스텁으로 축소 — 원동작 불명, 정직 표기됨). 함수 자체는 documented.
- **P3(저신뢰) 함수**: `FUN_004c8830` 1건(스택베이스 오추적). documented되었으나 오프셋 의미는 추론.
- **중복 본문**: `FUN_004908f0` ≡ `FUN_0048df10`(CommandCreateOutfit 덤퍼, 5483B 동일) — 둘 다 별도 addr로 documented(중복 제거 대상 아님, 실제 별도 함수 인스턴스).
- 배치별 함수수가 가변(1~28). batch-0051이 28개로 최대, batch-0000~0040 다수가 1~3개. 이는 worklist 정렬(중요/대형 함수 우선) 때문으로 보이며 fail이 아님.
- `out/_smoke-0014.json`은 스모크테스트 산출물로 합성에서 제외(정식 batch 아님).

---

## 5. 다음 웨이브

- **다음 웨이브 시작 배치 = 64**
- 누적 documented = 176 / 6089 (≈2.89%). 잔여 ≈5913함수.
- 권장: 다음 웨이브는 `FUN_004ba2b0`/`FUN_004b78a0`가 호출하는 미문서화 post-handler(`FUN_004be*`/`FUN_004c*` 군)와 `FUN_005015f0`의 하위 큐 프리미티브(`FUN_00501ed0` dequeue, `FUN_00501e30` enqueue, `FUN_005024a0`/`FUN_005025c0` 게이트)를 우선 확보하면 C002 파이프라인이 완결됨.
