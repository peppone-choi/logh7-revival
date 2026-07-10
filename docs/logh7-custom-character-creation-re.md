# 커스텀 캐릭터 생성(新キャラクターの作成 / item1 / 0x1008) 살리기 — RE 확정

**대상 (정본):** `artifacts/logh7-install/…/exe/g7mtclient.exe`
- **정통 EXE sha256 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`** (size 3,956,736) — **라이브 QA가 실제 구동하는 정본.** 다른 사본(`_exe-archive-nonCanonical/g7mtclient-sjis.exe` = `8f5c2dad…`, 구 `95d8ed11…`)은 격리됨.
- ImageBase 0x400000, ASLR off → VA = 파일오프셋 + 0x400000 (`.text` raw off == VA off == 0x1000).
- 근거: capstone 디스어셈블(**정통 EXE 9c97de2a 원바이트**) + Ghidra 12.1.2 디컴파일(`_exe-archive-nonCanonical/…-sjis.exe`, 8f5c2dad — 코드 레이아웃 동일, 값바이트 37개만 상이) 교차확인. 흐름/오프셋은 9c97de2a 실바이트로 재검증됨.

> **item1 라이브 EXE(9c97de2a) 상태 = 이미 enable, 패치 불요.** 정통 EXE의 IntoLobbyMain 정적 enable 배열 = **`{1,1,0,0,0,1,0,1}`** — item1(新キャラクターの作成, 0x1008) imm 바이트 파일오프셋 0x11ab3e = **`01`**(켜짐). 초기 분석의 item1=00(패치 필요)은 격리된 비정본 사본 기준이었다. **정본에서 정적 disable로 남은 건 item2(オリジナル抽選 0x1006)·item3(削除)·item4(セッション変更)뿐.**
>
> **로비 잠금 해제 = 0x2004 body[0](information_count)≥1** — 단, 이 잠금은 **캐릭터 패널의 안내 텍스트/카드에만** 걸리고 **메뉴 버튼을 런타임 disable하지 않는다**(§0). item enable은 전적으로 정적 배열이 결정.
>
> **한 줄:** item1은 정본에서 이미 클릭 가능. item1 클릭 → 시퀀서 state 0x19(DAT_02217398=0x41) → SS접속/인증 → state 0x41 → 위저드 `FUN_00594f20` **case 0x41(생성 분기: `FUN_00595ec0(0x14); FUN_00595d90()` 생성폼)** → 0x1008 송신. wire는 `docs/reference/legacy-evidence/logh7-character-creation-wire.md`에 정적 RE + 실캡처(Reinhard/Lohengramm)로 확정(§3 요약).

---

## 0. 로비 잠금(전제) — count==0 분기 정밀 분석 (확신도: 高 — 디스어셈블 확정)

팀리드의 세 질문에 대한 정적 확답. **결론: 로비 "잠금"은 캐릭터 패널 표시 문제이지 메뉴 버튼 게이트가 아니다.** item1/item2가 죽은 건 잠금 오버라이드가 아니라 정적 disable이다.

### 0.1 잠금 판정 변수 = 순수 count (별도 available 플래그 아님)

`DAT_02216c88` 의 write 소스 = `FUN_0051be80`:
```c
puVar2 = (undefined4 *)(DAT_007ccffc + 0x35975c);   // = 0x2004 raw 구조체(clientBase+0x35975c)
puVar3 = &DAT_02216c88;
for (iVar1 = 0x1b7; iVar1 != 0; ...) *puVar3++ = *puVar2++;   // 0x2004 body 1756B 통째 복사
```
즉 `DAT_02216c88` = **0x2004 `LobbyResponseInformationCharacterCharge` body의 첫 바이트 = `information_count`(≤2)** (wire 문서 §8.2). `FUN_0051f1c0`가 `(DAT_02216c88 & 0xff) < param_2+1` 로 인덱스 바운드에 쓰는 것도 count임을 뒷받침. → **순수 count. 세션서버-available 별도 플래그 아님.** 클라가 count==0 을 "세션서버 불구로 캐릭터 표시 불가"로 해석해 안내 텍스트를 띄우는 것뿐.

### 0.2 count==0 분기가 건드리는 대상 = 캐릭터 패널뿐 (메뉴 버튼 아님)

case 0x16 디스어셈블(0x51aaf1~0x51ab21):
```
push 0x50 ; call 0x50cf40      ; FUN_0050cf40(0x50) = 캐릭터-패널 페이지(0x50) 컨테이너 -> esi
push 1 ; push ebx(=2) ; call 0x502780   ; getItem(group2, index1) = 패널 텍스트 위젯 -> eax
mov cl,[0x2216c88] ; test cl,cl ; jne skip   ; count==0 이면:
  push 0x78677c ; push eax ; call 0x503560    ;   setText(패널위젯, "セッションサーバーの不具合につき…")
skip: push 1 ; push esi ; call 0x51c980        ; 패널 컨테이너 show/refresh
--- 그 다음, count와 무관하게 ---
push 0x52 ; <8바이트 enable 배열> ; call 0x50cf40(0x52)  ; 메뉴 페이지(0x52), group1 버튼
<루프: setEnable(getItem(1,i), byte[i])>
```
- 잠금 분기는 **페이지 0x50 / group 2 / index 1**(캐릭터 표시 패널)에만 `setText`. 메뉴 버튼 enable을 **전혀 만지지 않음**.
- 메뉴 enable 배열(**페이지 0x52 / group 1** 버튼)은 `DAT_02216c88` 조건 **밖에서 무조건** 적용 = `{1,0,0,0,0,1,0,1}`.
- FUN_0051a370 내 setEnable 호출은 이 배열 루프 + 클릭 시 타 버튼 일시 disable 2곳뿐 → **count 기반 런타임 disable/enable 경로 없음.**

**∴ item2(오리지널 추첨) 무반응의 원인은 런타임 잠금이 아니라 item2가 정적 disable(배열 byte[2]=0)이기 때문.** 팀리드가 근거로 든 `{1,0,1,0,1,0,0,0}`(item2=1)은 오독이며, 실측은 item2=0.

### 0.3 잠금 해제 조건과 온보딩 정답

- **잠금(안내 텍스트) 해제** = 서버가 0x2004 body[0]=`information_count`≥1 로 응답 → 텍스트 사라지고 캐릭터 카드 표시. **하지만 이건 item1/item2 버튼을 살리지 않는다.**
- 정상 플레이 온보딩 = **서버 스타팅-캐릭터 프로비저닝**(count≥1) → 패널 해제 → item0 `ゲーム開始` 으로 진입. item1/item2 불필요.
- 커스텀 생성(item1) offer = **정적 패치가 유일 레버**(§1.3). 서버 신호로는 절대 안 켜진다.
- **치킨-에그 아님:** 패치된 item1은 count==0(빈 계정)에서도 클릭 가능 — 클릭 흐름(§2)은 SS접속·0x1000 계정조회만 요구하고 count≥1을 요구하지 않는다. 즉 **item1 패치 + 0x1008 핸들러만으로 빈 계정이 첫 캐릭터를 직접 생성**할 수 있어, 서버 프로비저닝 없이도 온보딩이 성립한다. (레버 A=count≥1 프로비저닝, 레버 B=item1 패치는 서로 독립.)

---

## 1. item1 정적 disable 위치와 최소 패치 (확신도: 高 — 원바이트 확인)

### 1.1 로비 메인 메뉴 enable 배열 — 실측 정정

로비 시퀀서 `FUN_0051a370` @ 0x51a370, **case 0x16 `IntoLobbyMain`** 이 8개 메뉴 아이템의 enable을 스택 배열로 세팅한 뒤 루프로 적용한다. 디스어셈블 원바이트:

**정통 EXE 9c97de2a 실바이트** (파일오프셋 = VA − 0x400000):
```
0x51ab35  c6 44 24 14 01   mov byte [esp+0x14], 1   ; item0 enable
0x51ab3a  c6 44 24 15 01   mov byte [esp+0x15], 1   ; item1 ENABLE  ← 정본에서 이미 켜짐 (imm@0x11ab3e=01)
0x51ab3f  c6 44 24 16 00   mov byte [esp+0x16], 0   ; item2 disable ← 유일하게 남은 캐릭터 진입 disable
0x51ab44  c6 44 24 17 00   mov byte [esp+0x17], 0   ; item3 disable
0x51ab49  c6 44 24 18 00   mov byte [esp+0x18], 0   ; item4 disable
0x51ab4e  c6 44 24 19 01   mov byte [esp+0x19], 1   ; item5 enable
0x51ab53  c6 44 24 1a 00   mov byte [esp+0x1a], 0   ; item6 disable
0x51ab58  c6 44 24 1b 01   mov byte [esp+0x1b], 1   ; item7 enable
...
0x51ab5d  call 0x50cf40                              ; FUN_0050cf40(0x52) — stdcall, arg pop → esp+4
0x51ab66  8a 4c 34 10      mov cl, byte [esp+esi+0x10] ; 루프: byte[i] (i=0..7)
0x51ab72  call 0x502780                              ; getItem(group1, i)
0x51ab7a  call 0x5024e0                              ; setEnable(item, byte[i])
0x51ab80  cmp esi, 8 / jl
```

`FUN_0050cf40(0x52)` 가 인자를 pop(stdcall)하므로 저장 시점 `[esp+0x14+i]` 와 루프 소비 시점 `[esp+0x10+i]` 는 **동일 절대주소** = byte[i]. **정통 EXE(9c97de2a) 실 enable 배열 = `{1,1,0,0,0,1,0,1}`** (item0·item1·item5·item7 enable).

> **EXE 사본별 item1 차이 (동일 사이즈, 값바이트 37개만 상이):** 정통 `9c97de2a`는 **item1 imm@0x11ab3e = 01**(켜짐). 격리된 비정본(`8f5c2dad`/`95d8ed11`)은 **00**(꺼짐). 두 사본의 유일한 enable-배열 차이가 정확히 이 1바이트다.
> **기존 문서 정정:** `logh7-m2-character-creation-flow.md`·`logh7-loop-state.md`의 `{1,0,1,0,1,0,0,0}`(item2=1)은 **오류**(디컴파일 stack-coalescing 오독). 실측은 item2=0. → 정본 기준 캐릭터 진입 중 **item1(생성)만 enable, item2(추첨)는 정적 disable.**

### 1.2 index → 라벨 매핑 (확정 — 클릭 디스패처 + 디버그 문자열)

case 0x17 클릭 히트테스트(각 index 히트 → next state)와 각 state 핸들러의 디버그 문자열(`FUN_005923a0`)로 확정:

| index | 히트 시 state | 디버그 문자열 / 경로 | 라벨 | 정적 enable |
|---|---|---|---|---|
| 0 | 0x18 | (게임 시작, DAT_02217398=0x3d) | ゲーム開始 | ✅ 1 |
| **1** | **0x19** | **DAT_02217398=0x41 → 위저드 생성 분기(case 0x41)** | **新キャラクターの作成 (0x1008)** | ✅ **1 (정본)** |
| 2 | 0x1a | `PUSH_ORIGINAL`, DAT_02217398=0x40 | オリジナルキャラクター抽選 (0x1006) | ❌ 0 |
| 3 | 0x1b | `PUSH_DELETE`, DAT_02217398=0x39 | キャラクター削除 (0x2008) | ❌ 0 |
| 4 | 0x1c | `PUSH_SESSIONMOVE` (정본에선 핸들러 리다이렉트됨, §1.4) | セッションの変更 | ❌ 0 |
| 5 | 0x1d | `PUSH_CONFIG` | 環境設定 | ✅ 1 |
| 6 | 0x27 | (state 0x27) | クレジット(추정) | ❌ 0 |
| 7 | — | `FUN_0054eed0()` 즉시 호출 | ゲーム終了 | ✅ 1 |

정본에서 **item1은 enable** → 클릭 시 히트테스트 통과 → state 0x19 진입(§2). item2(추첨)만 정적 disable.

### 1.3 패치 (정본은 item1 불요, item2는 선택)

`tools/patch/exe-patch.mjs` 규칙: `offset`(10진), `originalBytes`==파일 현재바이트여야 적용, same-length. 인스트럭션 5바이트를 창으로 잡아 **imm 1바이트만** 바꾼다(오적용 방지 앵커링).

- **item1(新キャラクターの作成, 0x1008): 정통 EXE 9c97de2a엔 이미 enable(imm@0x11ab3e=01) → 패치 불요.**
- **item2(オリジナル抽選, 0x1006)를 켜려면 (선택):** item2 store는 `c6 44 24 16 00` @ 0x51ab3f, imm 바이트 @ **파일오프셋 0x11ab43(dec 1157955)**. (팀리드가 든 0x11ab40은 3바이트 어긋남 — 정확한 imm 위치는 0x11ab43.)
```json
{
  "id": "lobby-item2-enable-original-lottery",
  "sourceExeSha256": "9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51",
  "addressKind": "offset", "offset": 1157951,
  "originalBytes": "c644241600", "patchedBytes": "c644241601", "rollbackBytes": "c644241600",
  "reason": "Enable lobby item2 オリジナルキャラクター抽選 (CommandOriginalCharacterCharge 0x1006)"
}
```
- item3 삭제(0x2008) 선택: `offset:1157956, "c644241700"→"c644241701"`. item4 세션변경: `offset:1157961, "c644241800"→"c644241801"`.

> ⚠️ **매니페스트 sha 정합:** 패치를 추가하려면 `logh7-exe-patch-manifest.json`의 `targetExe.sha256`와 각 patch `sourceExeSha256`를 **`9c97de2a…`**(정본)로 맞춰야 한다(apply 도구가 `targetExe.sha256==파일해시` 강제). 현재 매니페스트는 구 `2848be76…` 기준이라 정본에 그대로 적용 불가. **모든 오프셋은 9c97de2a 실바이트로 검증됨.**

### 1.4 정통 EXE의 기타 하드패치 (참고 — 생성 흐름과 무관)

정본 9c97de2a는 비정본 대비 FUN_0051a370 내 코드 2곳이 손패치돼 있다(생성 흐름엔 영향 없음, 기록용):
- **@0x51a39c**: 함수 초입 조건분기 `je 0x51ba7a`(6B) → **NOP×6**. 초기 early-exit 가드 제거(시퀀서를 항상 진행시킴).
- **@0x51aded**: case 0x1c `SessionMove` 핸들러(`push 0x78673c; mov [ebp+4],0x16; …`) → **`jmp 0x51ad73`** 로 대체(세션변경 클릭을 다른 경로로 우회).
- (그 외 .data IP 등 값바이트 차이.) 이들은 item1 클릭→state 0x19→위저드 경로(불변)와 별개다.

---

## 2. item1 클릭 → 0x1008 송신까지의 시퀀스 (확신도: 高)

**정통 EXE 9c97de2a 기준 재검증 — 아래 경로 코드는 비정본 대비 불변(디프 없음):**
```
로비 메인(FUN_0051a370 state 0x16) — item1 정본에서 enable(imm@0x11ab3e=01)
 └ item1 클릭 → 히트테스트 통과 → state 0x19 : DAT_02217398 = 0x41, state → 0x2d
    ├ 0x2d~0x35  SS(세션서버) 접속·인증  (CONNECT_SS / CERTIFICATION_SS_TRY/OK)
    └ 0x35 CERT_SS_OK → *(seq+4) = DAT_02217398 = 0x41
 └ default 케이스: (0x3f < state < 0x6a) → FUN_00594f20()  ← 캐릭터-엔트리 위저드
FUN_00594f20  switch(*(DAT_02215e2c+4)) — 확정:
    case 0x40 (item2 원작추첨): FUN_00595ec0(2);  FUN_00595c80();   ← 원작 화면
    case 0x41 (item1 커스텀생성): FUN_00595ec0(0x14); FUN_00595d90();  ← ★생성 폼 (별도 분기 확정)★
    …이후 공유 서브스텝: case 0x46 FUN_005983c0 / case 0x47 FUN_00595ce0(charge) / case 0x48 결과판정
    → 생성 폼(진영/출신/성별/이름/능력/얼굴/기함) → ★0x1008 송신★
      (correlator FUN_004b78a0 kind 0xd → code 0x1008, gate 0x358375 LobbyLoginOK; 실캡처로 확정)
```

- **case 0x40(원작) vs case 0x41(생성)이 서로 다른 화면 함수로 분기**함을 디컴파일로 확정(FUN_00595c80 vs FUN_00595d90). item1(생성)은 case 0x41 → FUN_00595d90 생성폼.
- item1 enable + 이 경로 불변 + 실캡처(실클라가 실제로 0x1008 create 패킷 송신)까지 삼중으로 **item1→0x1008 생성 흐름이 정본에서 라이브 가동 가능**함이 확정.
- **생성엔 SS 접속이 선행**된다. 서버는 위저드 도달 전 SS 핸드셰이크(0x2009→0x200a / CONNECT_SS / CERT_SS)와 0x1000/0x1004 응답을 줘야 한다.

---

## 3. 0x1008 요청/응답 wire (확신도: 高 — 기존 정적 RE + 실캡처, 재확인)

전체 근거·필드표는 `docs/reference/legacy-evidence/logh7-character-creation-wire.md` §2·§2.1·§2.2 참조. 핵심 요약:

### 3.1 C→S 0x1008 CommandGenerateCharacterCharge (packed)
직렬화 `FUN_00405ea0` / 파서 `FUN_004066f0` / 길이 `FUN_00405720`(base 0x25 + 2×(이름 길이 합), 각 이름 <0xe=13자).
**실제 wire는 packed** — 이름을 NUL종단 UTF-16LE로 연속 기록해 뒤 필드가 이름길이만큼 밀린다(고정슬롯 아님). 실캡처(Reinhard/Lohengramm) 기준 BODY 좌표:

| body off | type | 필드 |
|---|---|---|
| 0x00 | u32 | request_category (생성 단계; 커밋 단계=4) |
| 0x05 | u8 | **power**(진영) |
| 0x06 | u8 | **blood**(출신) |
| 0x07 | u8 | **sex**(성별) |
| 0x08 | u8 | lastname_len (=실자수+NUL) |
| 0x0a.. | u16[] | lastname UTF-16LE (NUL종단) |
| next | u8 | firstname_len |
| next | u16[] | firstname UTF-16LE |
| next | u32 | face / 이후 birth·ability_8·bonus·title·rank·flagship (이름 길이만큼 이동) |

서버 파서는 이름을 커서로 읽고(길이에 NUL 포함, 실자수=len-1) 그 뒤 고정 tail을 읽어야 한다. (고정슬롯 오독 시 lastname='R'의 상위바이트 0을 길이로 읽어 빈 이름→생성 거부.)

### 3.2 S→C 0x1008 OK = 128바이트 packed 스트림
dispatcher `FUN_004ba2b0` case 0x1008: 응답을 파서 `FUN_004066f0`가 소비해 고정 0x20-dword(128B) 워킹 레코드로 확장(`+0x43243c`) → `FUN_004be7a0` → 이벤트 0x16 큐잉 → 위저드가 성공 판정. OK 스트림 필드(request_category, accepted, power@+0x08, blood@+0x09, sex, 이름들, birth, face, ability_8, bonus, special_num, title, rank, flagship…)는 wire 문서 §2.2 표 참조. **서버-부여 character id는 0x1008 OK body에 없고** 이후 0x2004/0x0323/0x0204 등으로 노출.

### 3.3 생성 후 흐름 (0x1006 원작추첨과 대비)
- 0x1008 OK 소비 → 위저드 성공 → 로비 복귀. 새 캐릭터가 계정 로스터에 charge되면 이후 로비의 **0x2003 재요청 → 0x2004 body[0]=count(≥1)** 로 로비 잠금 해제·카드 표시(잠금 게이트 = `DAT_02216c88` = 0x2004 body[0]; `docs/logh7-m2-character-creation-flow.md` §1).
- 계정 캐릭터 상한: entry_character ≤5, extension_character ≤2 (`Input_InformationAccount` 캡). 생성은 이 상한을 서버가 권위적으로 재검증.

---

## 4. 서버가 구현할 0x1008 핸들러 지시 (server-dev)

기존 wire 문서 §6과 동일하되 요지:
1. **0x1008 요청 파싱**(§3.1 packed): request_category, power(@0x05), blood(@0x06), sex(@0x07), packed lastname/firstname, tail(face·ability_8[8]·bonus·title·rank·flagship). 서버 재검증: 이름 ≤13 UCS-2, 능력 예산(UI 규칙 — 매뉴얼 기반 총합/스탯 min-max), 계정 상한(entry<5·extension<2).
2. **id 할당 + 영속**(CQRS/권위 스토어).
3. **0x1008 OK 응답**: `message32 [u32 0][u16 0x1008][128B packed OK 스트림]`(§3.2). 클라 파서가 확장하는 그 스트림 형식이어야 함(단순 id/status 튜플 아님).
4. **0x2004 갱신**: 이후 0x2003 재요청에 charge된 캐릭터를 실어 body[0]=count≥1 → 로비 잠금 해제.
5. **선행 핸드셰이크**: 위저드 도달 전 SS 접속(0x2009/CONNECT_SS/CERT_SS)·0x1000/0x1004 응답 필요(원작추첨과 공유). playable-server의 기존 world-session 경로와 정합 확인.

> 클라 미검증: 이름 셋(cp932/UCS-2 ≤13), power/blood/sex 값 범위는 **폼 UI가 강제**(스트림 파서는 이름 길이·배열 크기만 range-check). 정확한 능력 예산·진영/출신 열거값은 폼 위젯 로직/매뉴얼/실캡처로 확정(우선순위: 생성 게이트엔 무관, 서버 권위 재검증).

---

## 5. 확신도 / 미확정

| 항목 | 확신도 |
|---|---|
| **정통 EXE 9c97de2a에서 item1 이미 enable(imm@0x11ab3e=01), 패치 불요** | **높음** (정본 원바이트 + 비정본과 1바이트 디프) |
| 정본 enable 배열 = {1,1,0,0,0,1,0,1} (item2만 남은 캐릭터 진입 disable) | **높음** (정본 원바이트 8개) |
| 로비 잠금 = 0x2004 body[0](information_count)==0 → 캐릭터 패널 텍스트만, 메뉴 버튼 무관 | **높음** (FUN_0051be80 복사 소스 + case 0x16 분기 디스어셈블) |
| index→라벨(item1=新キャラ작성, item2=오리지널, item3=삭제) | **높음** (클릭 디스패처 + 디버그 문자열) |
| item1 클릭 → state 0x41 → 위저드 case 0x41 FUN_00595d90 생성폼 → 0x1008 (원작 0x40/FUN_00595c80과 분기) | **높음** (case 0x19 + FUN_00594f20 switch + 정본 코드 불변) |
| 0x1008 요청/응답 packed wire | **높음** (기존 정적 RE + 실캡처 Reinhard/Lohengramm) |
| 능력 예산·진영/출신 열거값 범위 | **미확정** (폼 UI 규칙; 서버 권위 재검증으로 우회) |

## 6. 검증 게이트
- [ ] (정본은 item1 패치 불요) — item2까지 켜려면 매니페스트 `targetExe.sha256`를 9c97de2a…로 정합 후 `exe-patch validate`(dry) 통과.
- [ ] 정본 EXE에서 **로비 item1(新キャラクターの作成) 클릭 → SS접속/인증 → 생성 폼(FUN_00595d90) 진입 → 0x1008 송신**(프레임 캡처).
- [ ] 서버 0x1008 핸들러: 파싱→영속→128B OK → 위저드 성공 → 0x2003/0x2004 count+1 → 로비 표시(라이브 + 스크린샷).
