# LOGH VII — UI 프레임워크 + 전체 엔티티 데이터 모델 RE

> 작성: re-ui-entities (re-analyst) · 정본 EXE `artifacts/logh7-install/…/exe/g7mtclient.exe`
> sha256 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51` (ImageBase 0x400000, ASLR off).
> 목적: 죽은 MMO 은하영웅전설 VII를 자체 서버로 복원 — 클라가 이미 구현한 UI 조작 계약과 엔티티 와이어
> 포맷을 오프셋 단위로 확정해 서버가 그대로 흉내내게 한다.

## 0. 정본 EXE 검증 (이 문서의 전제)

기존 RE 문서(`docs/reference/legacy-evidence/*`)는 Ghidra `-sjis` export 기준이라 CLAUDE.md가 함수주소
신뢰성을 경고한다. **정본 EXE 실바이트로 8개 핵심 함수 VA를 재검증**했다 — 전부 유효한 함수 프롤로그에
안착(파일오프셋 = VA − 0x400000, .text가 file-aligned):

| VA | 정본 EXE 실바이트(첫 16B) | 판정 |
|---|---|---|
| `0x00522010` constmsg lookup | `8b81 74290000 56 8b742408 48 3bf0 7209` = `mov eax,[ecx+0x2974]; push esi; mov esi,[esp+8]; dec eax; cmp esi,eax; jb` | ★ 경계검사 있는 테이블조회. 확정 |
| `0x004ba2b0` msg dispatcher | `558bec 6aff 68e0246600 64a1…` SEH 프롤로그 | 확정 |
| `0x00417390` char parser | `64a1000000 6aff 6800b66500 …` | 확정 |
| `0x00419300` char serializer | `5355 56 8b742418 57 …` | 확정 |
| `0x004c2a80` world-entry anchor | `8a442404 83ec0c 84c0 5355565 7…` | 확정 |
| `0x0054e570` scene-KIND dispatcher | `6aff 682b516600 64a1…` | 확정 |
| `0x0057aa90` base panel render | `6aff 68006c6600 64a1…` | 확정 |
| `0x004c45f0` mode setter | `83ec08 33c0 89442400 89442404 …` | 확정 |

**결론: 함수레벨 RE(주소·구조체 오프셋)는 정본 EXE에 그대로 유효.** `-sjis` 경고는 로컬라이즈용 36B 문자열
패치영역(.rdata/.data)에만 해당하며 .text 함수주소를 옮기지 않는다. 문자열 상수 참조(0x75xxxx/0x76xxxx)는
개별 확인 권장(예: 로비잠금 문자열은 SJIS 아닌 UTF-16LE @0x78677c로 실재 확인, §1.2).

---

# PART 1 — 클라이언트 UI 프레임워크 계약

클라 UI는 3개의 축으로 돈다: (A) **텍스트/라벨 조회** = constmsg 테이블, (B) **화면/패널 상태머신** =
씬-KIND 디스패처 + 로비 FSM + 월드-인 mode FSM, (C) **위젯/입력** = 번호붙은 위젯 슬롯 + hit-test latch.
서버는 A의 데이터를 채우고, B의 상태전이를 와이어 메시지로 밀고, C가 소비할 엔티티를 공급한다.

## 1.1 constmsg 텍스트 시스템 (모든 UI 라벨의 출처)

- **로더** `FUN_004e9bb0` → `FUN_00521dc0("../data/MsgDat/constmsg.dat")`. `messages_%d.dat`,
  `messages_com_%d.dat`, `messages_tac_%d.dat`도 함께 로드.
- **핵심 조회** `FUN_00522010(group, subId)` — group별 오프셋테이블 + sub-id로 문자열 해석. 정본 실바이트
  확인: `mov eax,[ecx+0x2974]`(this=msgdat객체, group 테이블 base) 후 `subId(=[esp+8])`를 `dec eax;cmp;jb`로
  경계검사. **범위초과 group → `NO TABLE`, group경계 넘는 sub → `NO DATA`** (화면의 "NO DATA" 핫스팟 원인).
- **첫문자열 조회** `FUN_005229d0(group)` — group 0x00..0x0e만 첫 레코드 반환.
- **group별 래퍼**(직접 호출용, 각 wrapper가 group 고정): `FUN_004c8cb0`=grp3(직무 라벨), `FUN_004c8cd0`=grp6(직무 설명),
  `FUN_004c8c90`=grp0x18(전략 그리드/성계/지형 라벨), `FUN_004c8d10`=grp0x49(시설 라벨),
  `FUN_004c8cf0`=grp0x4a(방/spot 라벨). 근거: `docs/reference/legacy-evidence/logh7-constmsg-re-audit-2026-06-30.md`.

주요 group (증거확정):

| group | 레코드ID | 의미 | 소비 함수 |
|---|---|---|---|
| 0x03 | 190–450 | 직무/직위 라벨(個人/皇帝/최고사령관…) | `FUN_004c8cb0` |
| 0x04 | 451–476 | 기관/조직 라벨(皇宮/内閣/軍務省…) | `FUN_005229d0(4)` |
| 0x06 | 498–758 | 직무 설명문 | `FUN_004c8cd0` |
| 0x0f | — | 출신(平民/貴族/市民…) 캐릭생성 origin | 생성 화면 |
| 0x18 | 1403–1491 | 전략 그리드/성계/지형 라벨(イゼルローン 등) | `FUN_004c8c90`, 맵/패널 `FUN_0057aa90/0057d0a0/0058d140` |
| 0x49 | 2271–2309 | 시설 라벨(政庁/防衛司令部/宇宙港…) | `FUN_004c8d10`, `FUN_00591450` |
| 0x4a | 2310–2414 | 방/spot 라벨(警戒ロビー/皇帝執務室…) | `FUN_004c8cf0`, `FUN_00591450` |
| 0x4e | 2429–2543 | 로비/세션 메뉴 텍스트(ゲーム開始/新キャラクター作成/削除/세션변경…) | `FUN_0051d580` (로비 메뉴 생성자, sub 0..7 순차) |
| 0x5f | 2957–2960(+) | 명령 실행상태/에러 + 기지패널 수치 라벨 | `FUN_0057aa90` (성계/요새/행성/기지 class 라벨 sub0..3, 경제라벨 sub0x13..0x16) |

**서버 함의:** UI 텍스트는 전부 클라 로컬 constmsg.dat에 있음. 서버는 텍스트를 보내지 않고 **id/index만** 보낸다.
예: 전략맵 오브젝트 라벨(0x0313 byte0=group0x18 index), 기지 진영(0x031f elem+0x04 → sub 0x2d/0x2e).

## 1.2 로비 상태머신 + 버튼 enable/잠금 (FUN_0051a370)

로비·캐릭터선택 화면은 단일 FSM `FUN_0051a370`이 구동(state 바이트 @stage 0x35837a 계열). 2026-07-09 라이브+RE로
잠금 게이트가 확정됨:

- **state 0x16 (IntoLobbyMain)**: `if ((char)DAT_02216c88 == 0) setText(0x78677c, "セッションサーバーの不具合につき…")`
  → **캐릭터 패널이 "대기"로 잠기고 작성/선택/삭제/게임시작/세션변경 버튼 전부 비활성.**
- **`DAT_02216c88` = 0x2004 ResponseInformationCharacterCharge body[0].** 디스패처 case 0x2004가
  `clientBase+0x35975c`에 0x6dc B 복사 → state 0x12 `FUN_0051be80`가 `DAT_02216c88`로 사본. **body[0]==0 = 잠금.**
- 서버가 빈 계정에 카드 0개(`encodeLobbyCharCardList` writeUInt8(0,0))를 보내면 이 잠금 발동. **첫 캐릭터 생성의
  전제 = body[0]≥1로 잠금 해제.**
- **정적 enable 배열(state 0x16)** = `{1,0,1,0,1,0,0,0}`: item0(→state0x18 작성)/item2(オリジナル抽選)/
  item4(セッション変更)는 0x2004와 무관하게 정적 enable. 環境設定/クレジット/ゲーム終了는 항상 동작.
- **잠금 문자열 정정**: 「不具合…」은 SJIS 아니라 **UTF-16LE @VA 0x0078677c**로 실재(정본 EXE). 첫 검색이 SJIS만
  봐서 "없음" 오판했던 것.
- **하위 캐릭터-선택 서브화면** = `FUN_00594f20` state 0x40~0x69 (팀리드가 말한 "state 0x41 위저드"가 이 범위).
  로비 잠금과 별개 게이트(0x1005 CharEntryState). 로비 해제 후 재점검 필요.

**메뉴 페이지/enable 테이블**(예/아니오 다이얼로그, 메뉴 페이지): `DAT_00675138 + page*0xa0` 페이지 배열.
`FUN_00570340`이 빈 페이지가 아닐 때만 콜백 arm(+0xde0=1). page1=[](빈), page4=[3,6,7,4,5], page5=[2,6,4,5](yes/no 포함).
이것이 팀리드가 언급한 page/group/index enable 스킴의 다이얼로그 측면. 근거:
`docs/reference/legacy-evidence/logh7-mode-dispatcher-re-2026-06-26.md` (b)[C].

## 1.3 씬-KIND 디스패처 + 패널 빌더 (FUN_0054e570)

패널 종류는 `FUN_0054e570(this, kind)`이 분기:

| kind | 빌더 | 패널 |
|---|---|---|
| 1 | `FUN_005123b0` | 함대/유닛 패널 |
| 2 | `FUN_004ff3c0` → `FUN_004fc4e0` → `FUN_004f6040` | 인물/장교 패널 (unit-list 위젯 0x67) |
| 3 | `FUN_0051ca30` | 기지/행성 패널 |

- kind3 기지패널 초기화 `FUN_0051ca30`이 서브빌더 다수 호출(`FUN_0051cda0/0051d570/0051d580/0051dc00/…`).
  그 중 `FUN_0051d580`이 로비/세션 메뉴 텍스트(constmsg grp0x4e)를 채운다.
- 진입 조건: C002 명령테이블 category(3=base) 또는 전략맵 셀 클릭 → `FUN_004b68f0`(mode dispatcher)이
  `FUN_0054e570(kind)` 호출. 근거: `docs/reference/legacy-evidence/base-panel-re-report.md` §1,5.

## 1.4 월드-인 메인루프 + mode FSM (FUN_004b68f0 / FUN_004c45f0)

월드 안 모든 상호작용의 단일 깔때기 = `FUN_004b68f0(esi=월드 전역객체)`.

- **mode 셀렉터** `[esi+0x35f35a]`: 0→mode2(strategy), !=0→mode1. **이 바이트의 writer가 전체 함수인덱스에 0건**
  → 기본 0 → 세션이 **항상 mode2(전략맵)** 고정. (interactive/menu mode가 자연히 안 켜지는 근본.)
- **mode setter** `FUN_004c45f0` (유일 writer, `[0x126710]` dword 통째 set: byte0=active, byte1=mode).
  호출자 정확히 2개: `FUN_004c4170`(push 2=strategy/StrategyFieldImport) / `FUN_004c32a0`(push 0=menu/TacticsFieldImport).
  둘 다 `FUN_004b68f0` 월드진입 1회 트랜지션(게이트 `esi[0x35837f]==0`)에서만 호출.
- **매프레임 mode poller** `[esi+0x126711]`:
  - `==0`(menu/consume) 게이트 `[0x126718]!=0` → `FUN_0050d230`(0x0b01 클릭확정 소비) 등.
  - `==2`(strategy/enqueue) 게이트 `[0x2a58f8]!=0` → `FUN_004fef90`(event-9 enqueue) 등.
  - **mode0/mode2는 같은 프레임 배타** (라이브: enqN=734, conN=0).
- **서버푸시 자연 flip**: 0x0b0a NotifyEnterGridEnd → `FUN_004ba2b0` case 0xb0a: `[0x126711]==0`이면
  `FUN_004c2a80(1)+FUN_004c32a0(1)` 둘 다 = 진짜 자연 flip. **단 0x42f NotifyChangeMode(`FUN_004c1c30`)는 mode
  미변경**(디스어셈블 반증 — 서버코드 주석은 틀림).

## 1.5 HUD 위젯 + 진영색 렌더

- **위젯 슬롯 번호제**: HUD/패널 위젯이 슬롯번호로 관리됨. 확정된 것: **0x65**=명령 메뉴 패널, **0x67**=unit-list(장교)
  패널, **0x6b(107)**=own-fleet HUD 위젯 슬롯(`FUN_0050cf40(0x6b)` 로드 확인 게이트). 위젯 로드 여부가
  렌더 게이트(`FUN_0058d110`).
- **기지패널 렌더** `FUN_0057aa90`(0x0057aa90): 0x031f 동적배열(`clientBase+0x3facf8` stride 0x180) + 정적기지테이블
  (`clientBase+0x2eb800` stride 0x250)을 읽어 행성명/진영/통치자/수비대장/경제수치 렌더. 진영: `elem+0x04`==2→"동맹"
  (grp0x5f sub0x2d), ==3→"제국"(sub0x2e). class(성계/요새/행성/기지): `elem+0x175` 0..3 → grp0x5f sub0..3.
  통치자/수비대장: 0x031f에 없음 → 0x0323 캐릭터를 `spot`(char+0x1c)로 역매칭. 근거: base-panel-re-report §3,6.
- **함대 마커 진영색** `FUN_004ef0d0`: 색은 0x0325 유닛 필드가 아니라 **함대 사령관 캐릭터의 char-table 엔트리
  +0xa/+0xb**(= 0x0323 power@0x04) 비교로 결정. 로컬플레이어와 다르면 ENEMY(0x1000), 같으면 FRIENDLY(0x800).
  **사령관 char-table 엔트리 없으면 마커 자체를 안 그린다**(iVar10==0 early return). → 함대 push 시 사령관 0x0323도
  같이(먼저) push 필수. 근거: `logh7-faction-projection-2026-06-26.md`.
- **"NO DATA" 필드**: constmsg group경계 넘는 sub 조회의 결과(§1.1). 서버가 해당 레코드 필드에 올바른 id/index를
  안 넣으면 뜬다.

## 1.6 명령 서브시스템 (클릭→명령→0x0b01) — 6레이어 상태머신

C002(전략 명령) 종결은 60+ 사이클 최난제. **함수RE·전 layer 라이브측정 100% 완결.** 전체 체인
(`logh7-c002-mechanism-complete-2026-06-23.md`):

```
1 패널 위젯 구성  FUN_0054e570→FUN_004ff3c0→FUN_004fc4e0→FUN_004f6040   ✗ autologin 월드서 미실행 ← 상류 근본
2 catGate 전이   FUN_004fd7a0 (StrategySequence+0xf4 idle→2=SELECT)        ✓ 직접구동 가능, 단 1 없으면 크래시
3 officer 데이터  FUN_004fc4a0/FUN_004f68f0 (PLAYER_INFO+0x270 count)      ✓ 0x0323 offset 0x93=officerCount 배선됨
4 함대선택       FUN_004f6600 (+0x624)                                    ✗ (1)(3) 선결
5 명령메뉴 build  FUN_004f5cb0 (클라 내장 카탈로그 0x3e0c8c)               ✗ (4) 선결
6 명령 row dispatch FUN_004f93c0→FUN_005737d0(SendWarpCommand)→FUN_004b78a0(1,0x3b)→0x0b01  ✗ (5) 선결
```

- **입력**: 마우스 좌클릭 = Win32 GetAsyncKeyState(1)(`FUN_00500b70`)로만 채워짐(DirectInput은 조이스틱). 합성
  mouse_event도 잡힘. GetFocus 게이트(포그라운드 필요). 선택 latch = **+0xb00**(`FUN_005015f0` case2, set점
  0x0050801b). 이동확정 latch = +0xb01/+0xb02(별개 축, SendWarpCommand와 무관 — latch 강제로는 송신 안 됨).
- **키보드 배제**: WM_KEYDOWN/WM_CHAR는 텍스트 위젯 전용, 전략 명령경로 미구동.
- **★단일 근본**: 전략 widget([DAT_02215e2c+0x14])이 **latch loop(`FUN_00507f20`)에 미등록** → 클릭이 +0xb00 hit로
  등록 안 됨 → catGate 전이 실패 → 이후 전 레이어 미작동. 상류는 unit-list 패널 위젯(0x67) 자체가 미생성(빌더
  `FUN_004f6040` 미실행). **종결 = 이 6레이어 서브시스템을 구성/구동하는 다중컴포넌트 클라측 구현** (단발
  force/click/key는 항상 다음 미초기화 레이어로 귀결 — 19 라이브세션 전수 확정).

---

# PART 2 — 전체 엔티티 데이터 모델 카탈로그

디스패처 `FUN_004ba2b0(this=clientBase, msgcode, inbound record)`가 `(code & 0xffff)`로 분기해 inbound를
dword벌크복사로 고정 전역에 적재 후 post-proc. 크기표 `FUN_004b8b00`. 아래는 클라가 유지하는 모든 엔티티
레코드 타입.

## 2.0 엔티티 → 코드 → 전역 → 크기 (마스터 인덱스)

| 엔티티 | 코드 | 저장 전역(clientBase+) | 크기/stride | 최대 | 확신 |
|---|---|---|---|---|---|
| 캐릭터 ResponseInformationCharacter | 0x0323 | array `+0x36a8b4` (count `+0x36a5dc`, scratch `+0x36a5e0`) | 724 (0x2d4)/rec | ~600 월드 | 0.93 |
| 유닛/함대 ResponseInformationUnit | 0x0325 | array `+0x41a368` (count u16 `+0x41a364`) | 0x58 (88)/elem, 바디 0xce44 고정 | 600 | 0.85 |
| 정적기지 ResponseStaticInformationBase | 0x031d | `+0x3f5ae8` (0x1483 dw) | dest 0x3c/rec (wire=helper stream) | — | HIGH(핵심)/MED(천문) |
| 동적기지 ResponseInformationBase | 0x031f | count `+0x3facf4`/array `+0x3facf8` | 0x180 (384)/elem, 바디 0x604 고정 | 4 | 0.60(배열 HIGH) |
| 시설 ResponseInformationInstitution | 0x0321 | `+0x3fb2f8` (0x2379 dw = 0x8de4) | 3중 중첩(outer 0x2378/inst 0xfc/spot 0xc) | 4/36/20 | 0.85(레이아웃 P0) |
| 성계경제 NotifyBaseParameter | 0x0337 | 없음(디스패처 case 없음, 서버/디버그 serializer) | 0x4a (74) 고정 | budget 6 | 0.82 |
| 간이기지 NotifySimpleInformationBase | 0x1204 | `+0x49ebac`→테이블 `+0x4c4b60` (count `+0x4c4b5c`) | 0x24 (36)/rec | 400 | MED |
| 파워분포 StaticInformationPowerDistribution | 0x0309 | `+0x4130a4` (0x157 dw) | — | — | 함선 파워커브(진영로스터 아님) |
| 그리드타입 StaticInformationGridType | 0x0313 | `+0x3f57d4` | 고정 5004, `1+value*3` 레코드 | — | HIGH |
| 그리드셀 StaticInformationGrid | 0x0315 | `+0x3f4448` | 고정 5004, RLE `[w][h][u16be cnt][run,val]` | 100×50 | HIGH |
| 현재그리드 ResponseInformationGrid | 0x0317 | `+0x35f358` | 단일 dword=현재 grid idx | — | HIGH |
| 전술기지 ResponseTacticsInformationBase | 0x0345 | (전투) | serializer `FUN_004247b0` | — | MED |
| 국가/세력 InformationSessionPower | (세션내) | 세션 파서 `FUN_00444900` | roster u16[≤14]@+0x2a | 2/session | HIGH |
| 계정 InformationAccount | 0x1001 | 파서 `FUN_00407920`(vtable, 정적호출자 없음) | 2배열(ext≤2/entry≤5) | — | MED(라우팅 미확정) |
| 카드로스터 ResponseCardCharacter | 0x034f | — | i*0x2d4, base+4, 0xb504 | 64 | HIGH |
| 생성완료 CommandGenerateCharacterCharge OK | 0x1008 | `DAT_02227f60` (파서 `FUN_004066f0`) | 128B packed | — | HIGH |
| 캐릭터카드 스트림 | 0x2004 | `+0x35975c` (0x6dc)→`DAT_02216c88`=body[0] | compact | — | HIGH |
| 현재캐릭 notify NotifyInformationCharacter | 0x0356 | 런타임 명령테이블 슬롯(stride 0x370) | 0x2d8 | — | HIGH |

전체 필드테이블은 아래 세부 + 기존 문서(`logh7-data-structures-re.md`, `logh7-info-records-wire.md`)에
바이트단위로 있음. 여기서는 load-bearing 오프셋과 링크만 확정.

## 2.1 캐릭터 0x0323 (724B) — 정본 근거 재확정

파서 `FUN_00417390`(Input_InformationCharacter), serializer `FUN_00419300`(header `_INF:ResponseInformationCharacter`
@0x761208), 디스패처 case 0x323 stride 0x2d4. 앵커: **id@0x00**(자기캐릭 매칭 `FUN_004c2a80`이 `record[0]==clientBase+0x3584a0`),
**flagship@0x24**(유닛리스트 `+0x41a368`과 매칭 = char→unit 1:1 링크).

핵심 필드(전체표는 `logh7-info-records-wire.md` §1):

| off | 타입 | 필드 | 비고 |
|---|---|---|---|
| 0x00 | u32 | id | 앵커. 값범위 검증 없음(raw u32) |
| 0x04 | u8 | power(陣영) | **진영색/기지진영 권위 출처** |
| 0x05 | u8 | camp | |
| 0x06 | u8 | state | |
| 0x1c | u32 | spot(현재 성계id) | 기지패널 통치자/수비대장 역매칭 키 |
| 0x20 | u32 | spot_owner | |
| 0x24 | u32 | flagship(grid-unit id) | **앵커 = unit.id@+0x00** |
| 0x2a | u16[13] | flagship_name | UCS-2, len@0x28 ≤13 |
| 0x80 | struct[2] stride 0x84 | parentage(신원 서브레코드) | lastname/firstname/display_name/titlename(각 u16[13] ≤13), blood, rank@+0x56, face@+0x74, rival, myhome, achievement |
| 0x188 | struct[8] stride 4 | ability_8 (고정 8개 {point u16, exp u16}) | 統率/政治/運用/情報(PCP) + 指揮/機動/攻撃/防御(MCP) |
| 0x1aa | u8 | special_ability_len (≤80) | 배열 @0x1ac u16[80] |
| 0x24c | u8 | card_len (≤16) | **count@0x24c, 배열@0x254 stride8 {u32,u32}. 0x250은 4B gap.** 서버가 0x250에 count 쓰면 카드 0개로 드롭 |
| 0x93(=오프셋 아님, PLAYER_INFO+0x270 채우는 값) | — | officerCount | 장교패널 row수. 2026-06-24 배선 |
| 0x2d0 | u8 | together | 마지막(패딩→0x2d4) |

**주의(0x24c vs 0x250)**: 0x0323 레코드는 count@**0x24c**. 0x0356 라이브 액션리스트 delta는 count@**0x250**(별개
구조체 0x2d8, 파서 `FUN_004c0400`). 서버가 혼동하면 카드/시트 드롭. 근거: `logh7-data-structures-re.md` §4.

## 2.2 유닛/함대 0x0325 (elem 0x58, 바디 0xce44)

유닛테이블 `+0x41a368`, count u16 `+0x41a364`, elem stride **0x58**, 바디 고정 **0xce44 = 4 + 600*0x58**, max 600.

| off(elem) | 타입 | 필드 | 확신 |
|---|---|---|---|
| +0x00 | u32 | unit.id | **앵커 = char.flagship@0x24** |
| +0x04 | u16 | faction_state | P3(진영색 실제론 사령관 char에서) |
| +0x08 | u32 | commander_cand | 자기유닛 마커 `+0x126714` 비교. LOGH_PLAYER_FOCUS_CELL시 fleetCellId 안착→own_cell |
| +0x0c | u32 | cell_cand | base/spot 테이블 `+0x811fc` 매칭 |
| +0x10 | u32 | owner_cand | **nation id 아님**(어떤 클라 read도 이걸 nation으로 소비 안 함) |
| +0x14 | u8 | boats_count (≤10) | 배열 @+0x18 u32[≤10] = 소속 함선/서브유닛 ids |
| +0x48 | u16 | mapSection_cand | 전략지역 후보 |

- **소유 모델**: char→unit 1:1(`char.flagship==unit.id`). 진영색은 사령관 char.power에서(§1.5). 유닛 mid-field
  (0x04/0x08/0x0c/0x10/0x40/0x48)는 레이아웃 P0지만 값 시맨틱 P3(serializer 미참조). 근거: `logh7-data-structures-re.md` §2.

## 2.3 국가/세력 (InformationSessionPower) — 1급 nation 엔티티

- 세션 파서 `FUN_00444900` 루프 `while (iStack_174 < 2)` → **세션당 정확히 2 파워**(라벨 `power[2]={` @0x761e58).
  제국 vs 동맹. **페잔은 3rd 파워 불가 — 중립 태그로만.**
- 파워 파서 `FUN_004301d0`: 함대 로스터 count@power+0x28(gate `<0xe`)→**u16[≤14]@+0x2a**(동맹 1~13번함대+친위),
  지도자 parentage count@+0x7d(gate `<3`)→**≤3 leaders**(stride 0x84 `Input_Parentage` @0x76369c).
- **종합**: nation이 번호붙은 함대 로스터(≤14)를 소유, 각 함대는 사령관 char가 지휘(unit-table elem). nation
  자금은 top-level struct 아니라 성계별(NotifyBaseParameter). 근거: `logh7-data-structures-re.md` §2,3.

## 2.4 성계/기지/시설 계층

원작엔 전용 star-system 메시지 없음. **성계 본체 = Base(拠点), 맵셀 = Grid.** 3개 레코드로 분산:

- **0x031d 정적기지**(불변 천문+이름) `+0x3f5ae8`, 파서 `FUN_004142e0`(dest stride 0x3c). **와이어는 helper
  스트림**(u16be count 선두), 각 레코드 순차. dest: id@+0x00(u32be), grid@+0x04(u16be), name_len@+0x0a(≤13),
  name@+0x0c(u16be[]), class_@+0x26, diameter@+0x28(f32be), revolution 계열 @+0x2c..+0x38. 라이브검증(2026-06-16)로
  스트림포맷 확정(NOW LOADING stall 해소).
- **0x031f 동적기지**(경제/방어/소유) count `+0x3facf4`/array `+0x3facf8` stride 0x180 max4, 바디 **0x604 고정**.
  핀된 offset: id@+0x00(매칭키), owner/state@+0x04, @+0x05. 배열(cap uniqueness로 확정):
  transport_supplies@+0x24(u32[≤30],cnt+0x20), outfit_supplies@+0xa0(≤30,+0x9c), budgeting@+0x130(u16[≤6],+0x12e),
  budget@+0x140(u32[≤5],+0x13c), commodity@+0x168(u32[≤3],+0x164). class_@+0x175(0..3). 스칼라 다수는 serializer
  server-side라 절대offset 미확정(P3, `fieldNN` 기본0). 파서 `FUN_00414c70`(bin)/`FUN_004154c0`(text), world-import
  `FUN_004c32a0`.
- **0x0321 시설**(施設 패널, req 0x0320) `+0x3fb2f8` 바디 **0x8de4 고정**. 3중 중첩(전부 P0, 패딩0):
  outer element stride 0x2378(id@+0x00, institution_count@+0x04 ≤36, institution[]@+0x08),
  institution stride 0xfc(field00 u16, field04 u32, spot_count@+0x08 ≤20, spot[]@+0x0c),
  spot stride 0xc(u16/u32/u16). 시설종류/레벨 스칼라 이름은 미확정(P3). 파서 `FUN_004167f0`/`FUN_00416bd0`,
  world-import `FUN_004c4170`.
- **NotifyBaseParameter**(성계경제, 디스패처 case 없음 = 서버/디버그) 0x4a고정: time@0x00, grid@0x04, base@0x08,
  budget[≤6]@0x10, population@0x28, adult_population@0x2c, approval@0x30, peace@0x34, thought@0x36, religion@0x38,
  energy@0x3c, food@0x40, living@0x44, supplies@0x46, armor@0x48. 3함수 교차검증(`FUN_00438a20/438390/438590`).
- 근거: `logh7-info-records-wire.md` §2/§2a/§3, `base-panel-re-report.md`.

## 2.5 전략맵 그리드 테이블 (렌더/클릭 대상)

- **0x0313 GridType** `+0x3f57d4` 고정 5004: `payload[0]=count`, 레코드 `1+value*3` = `[contentId, klass, variant]`.
  **klass==3이면 마커로 렌더/클릭.** byte0=group0x18 라벨 index(이젤론=14, 룬비니=86).
- **0x0315 Grid** `+0x3f4448` 고정 5004: `[u8 w][u8 h][u16be rleByteCount][run,value]...` 100×50 셀. **RLE count는
  BE**(회귀 주의). nonzero placeable 셀이 오브젝트 value 3..88 운반.
- **0x0317 현재그리드** `+0x35f358` 단일 dword.
- 프루븐: BE 수정 + 0x0313 첫바이트=count로 정상 클라가 81개 class-3 마커 슬롯 populate. 근거: `render-interaction-contract.md` §3.

## 2.6 엔티티 링크 그래프

```
계정(0x1001) ──entry_character[≤5]──▶ 캐릭터카드(0x2004/0x034f)
세션 ──InformationSessionPower[2]──▶ nation(제국/동맹)
  nation ──fleet_roster u16[≤14]──▶ 번호함대
캐릭터(0x0323) ──flagship@0x24 == unit.id@+0x00──▶ 유닛/함대(0x0325)
캐릭터 ──power@0x04──▶ 진영색(char-table +0xa/+0xb, FUN_004ef0d0)
캐릭터 ──spot@0x1c──▶ 성계/기지(0x031f/0x031d, 역매칭)  [기지가 통치자 가리키는게 아니라 통치자가 기지 가리킴]
유닛 ──boats_array@+0x18──▶ 함선/서브유닛 ids
성계기지(0x031f) ──institution[]──▶ 시설(0x0321) ──spot[]──▶ 방/room(constmsg grp0x4a)
그리드셀(0x0315 value) ──▶ 오브젝트타입(0x0313) ──group0x18 idx──▶ 라벨(constmsg)
```

---

## 3. 확신도 요약

| 항목 | 확신 | 근거 |
|---|---|---|
| constmsg 조회 `FUN_00522010`(group,sub) + group 카탈로그 | **확정(P0)** | 정본 실바이트 + audit 문서 |
| 로비잠금 = 0x2004 body[0]==0 (`DAT_02216c88`) | **확정(P0+라이브)** | 2026-07-09 RE+live |
| 로비 state0x16 enable `{1,0,1,0,1,0,0,0}` | HIGH | FSM RE(개별 create/delete 세부는 라이브 권장) |
| 씬-KIND 디스패처 kind1/2/3 | 확정 | `FUN_0054e570` |
| mode FSM(mode0/2 배타, `FUN_004c45f0` writer, 셀렉터 0x35f35a) | **확정(P0+라이브)** | 다각 RE+19세션 |
| C002 6레이어 체인·단일근본(widget latch loop 미등록) | **확정(RE완결)** | 9에이전트+19라이브 |
| 진영색 = 사령관 char.power(+0xa/+0xb) | 확정(RE), 라이브 대기 | `FUN_004ef0d0` |
| 캐릭터 0x0323 47필드/724B | 0.93 | `FUN_00417390/00419300` |
| 유닛 0x0325 앵커+boats | 0.85(mid-field 시맨틱 P3) | dual-parser |
| 국가 2파워/roster≤14/leaders≤3 | HIGH | `FUN_00444900/004301d0` |
| 0x031f/0x031d/0x0321 배열 offset | HIGH, 스칼라 P3 | cap-uniqueness |
| 그리드 0x0313/0x0315 포맷 | HIGH | 라이브 렌더 |
| 계정 0x1001 2배열 라우팅 | MED | 파서 정적호출자 없음 |

## 4. 라이브 프로브 필요(미확정 종결)

1. **로비잠금 해제**: 프리시드 1캐릭터로 0x2004 body[0]=1 → 잠금 해제 + item0(작성) 버튼 도달 확인. body[0]이
   순수 count인지 ready-flag인지 확정.
2. **C002 종결**: unit-list 패널(0x67) 빌더 `FUN_004f6040`를 mode2 월드서 트리거/직접구동 → catGate→선택→명령메뉴
   →dispatch 각 레이어 positive-control. 상류부터 데이터/상태 확립.
3. **진영색**: 2클라 in-world에서 사령관 char-table 엔트리 적재(iVar10!=0)와 +0xa/+0xb 분기로 아/적 distinct 색 확정.
4. **0x031f/0x0321 스칼라 이름↔offset**: ~36KB 프래그 수정 후 시설패널 라이브 A/B로 시설종류/경제스칼라 pin.
5. **0x1001 라우팅**: 0x1001이 실제 `FUN_00407920` 먹이는지 런타임 확인 후 2배열 레이아웃 재emit.
6. **캐릭 카드 "신참 0세"**: 표시 나이 필드 실측(서버 0x2004 age-second 변경 불충분).

## 관련 문서
- `docs/reference/legacy-evidence/logh7-data-structures-re.md` — 0x0323/0x0325 바이트단위
- `docs/reference/legacy-evidence/logh7-info-records-wire.md` — 0x031d/0x031f/0x0321/NotifyBaseParameter
- `docs/reference/legacy-evidence/base-panel-re-report.md` — 기지패널 렌더 체인
- `docs/reference/legacy-evidence/logh7-c002-mechanism-complete-2026-06-23.md` — 명령 서브시스템 6레이어
- `docs/reference/legacy-evidence/logh7-mode-dispatcher-re-2026-06-26.md` — mode FSM/다이얼로그/own-fleet
- `docs/reference/legacy-evidence/logh7-constmsg-re-audit-2026-06-30.md` — constmsg group 카탈로그
- `docs/reference/legacy-evidence/logh7-render-interaction-contract.md` — 표면별 다운링크 계약
- `docs/reference/legacy-evidence/logh7-faction-projection-2026-06-26.md` — 진영색 채널
- `docs/logh7-loop-state.md` (2026-07-09 M2 잠금 RE) — 로비 FSM 잠금 게이트
