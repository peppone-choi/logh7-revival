# 0x0325 핸들러 스테이징 최종 진단 (M3 종결)

- 대상: 정본 EXE `g7mtclient.exe` sha256 `9c97de2a…` (Ghidra DB import MD5 `d2ca2f17ae912d7aabc5a8a0b04b0611` — 동일 EXE 확인, `.omo/ghidra/export/decompiled/g7mtclient.exe_decompiled.c`)
- 선행 문서 계승: `logh7-0325-dispatch-skip` / `-recvque-gate` / `-codec-handoff` / `-signed-len`
- **기존 "크기·서명·길이" 결론은 전부 반증됨(A/B 크기축 사망)** — 본 문서는 내용/상태/순서 축.

---

## ★ 2026-07-11 확정 근본원인 (라이브+정적, 이게 M3 즉시 블로커) — 0x0325 레코드-카운트 u16 엔디안

team이 라이브로 0x0325 전용 핸들러 = **FUN_00419ca0 (0x419ca0)** 로 확정. 정본 EXE 실바이트 디스어셈:

```
0x419cbe  mov esi,[esp+0x184]   ; esi = arg1 = 와이어 입력스트림(디시리얼라이저)
0x419cc5  mov eax,[esi]          ; eax = 스트림 vtable
0x419cc8  mov edi,[esp+0x184]    ; edi = arg0 = 목적지 메시지 버퍼(=reader+0x14)
0x419ccf  push edi               ; dest
0x419cd0  mov ecx,esi            ; this = 스트림
0x419cd2  call [eax+0x20]        ; 스트림→read_u16(dest) : BODY[0..1]를 *edi에 적재
0x419cd7  mov ax,[edi]           ; ax = *(u16)dest = 방금 읽은 값
0x419cda  cmp ax,0x258           ; 600과 비교
0x419cde  jbe 0x419d9a           ; ≤600 스테이징 루프 / >600 에러경로(sprintf) — 정상 스테이징 안 함
스테이징 루프 0x419d9a: test ax,ax; ax회 반복, 레코드마다 edi+=0x58(0x419eaa),
                       필드 read via [stream+0x1c](u32)/[stream+0x20](u16); cmp index,count; jl loop
```

**과제1 답 — cmp 대상은 무엇인가:** `ax` = **body offset 0의 첫 u16 = 유닛 레코드 COUNT**(유닛 개수). 0x258=600 = 레지스트리 0x7db3c8 최대 슬롯수. 루프가 `count`회, 레코드 stride **0x58**로 도는 게 증거(0x419eaa `add edi,0x58`, 0x419eb1 `cmp index,count`). **즉 이 필드는 ID/스팟/팩션이 아니라 순수 카운트다.** body 레이아웃 `[u16 count]@0, records stride 0x58`과 일치.

**과제2 답 — jbe 이후:** ≤600이면 0x419d9a 루프가 `count`회 돌며 레코드를 읽어 채운다(그리고 후속 파이프라인으로 유닛이 들어감). >600이면 0x419ce4 에러경로(0x5fe8f3 sprintf "...")로 빠져 레코드를 제대로 못 읽음 → 스테이징 실패. 값은 유닛 수(반복 횟수)이지 슬롯 인덱스가 아님.

**과제3 답 — 엔디안, 무엇을 어떻게 넣어야 ≤600:**
- 이 read_u16 `[stream+0x20]`는 리더 FUN_00404210이 **메시지 OPCODE**를 읽는 바로 그 프리미티브(0x40422d `call [edx+0x20]` → opcode를 reader+6에). opcode 0x0325가 정상 디코드(핸들러 발화)되므로, **이 프리미티브의 엔디안 = 서버의 opcode 인코딩과 일치**.
- 라이브: 서버 count=25=0x0019 → ax=6400=0x1900. **0x1900 = byteswap16(0x0019)**. 즉 클라가 count를 의도값의 정확한 바이트스왑으로 디코드 → **서버가 count를 opcode와 반대 바이트오더로 인코딩하고 있다.**
- **수정(server-dev, buildInformationUnitInner): 0x0325 선두 레코드-카운트 u16을 메시지 opcode/헤더와 동일한 바이트오더로 써라. = 현재 서버가 내보내는 count 2바이트를 뒤집어라.** N=25면 클라 ax=25(≤600)가 되어 루프 25회 → 레지스트리 충전.

**[eax+0x20]가 바이트스왑하는가(team 결정변수):** 정적으로 스왑 여부 단정 불가 — 스트림 객체가 힙주입(reader+0x14)이고 그 구상 vtable/프리미티브가 부분 Ghidra DB에 없으며 순수 가상호출이라 실주소 미해석. **그러나 절대 BE/LE 없이도 수정은 확정**된다(위: opcode와 동일 오더 = 현재값 바이트스왑). runner의 실 wire 덤프로 절대값 확정:
  - 서버 현재 count 바이트 `19 00`(LE) → read는 BE(ntohs) → 서버는 **BE `00 19`** 로 보내야.
  - 서버 현재 count 바이트 `00 19`(BE) → read는 LE(verbatim) → 서버는 **LE `19 00`** 로 보내야.
  - 어느 쪽이든 = opcode 바이트오더에 맞춤 = 현재 바이트 스왑.

**0x0323 대조 (FUN_00417390):** 0x0323 핸들러 선두 read = `call [eax+0x1c]`(u32 단일값) 후 고정오프셋 필드들(edi+4,+5,+6…)을 0x610420로 읽음 — **선두 카운트 없음, cmp-vs-600 게이트 없음, 카운트기반 루프 없음.** 단일 고정레이아웃 캐릭터 레코드라서 엔디안 버그가 걸릴 카운트 필드가 아예 없다. **0x0325만 선두 카운트 u16을 600과 대조 → 그 필드만 바이트스왑돼 트립.** 이게 0x0323 통과/0x0325 차단의 정확한 갈림점.

> 이 절이 **즉시 M3 블로커**다: 바이트스왑된 count(6400>600)가 FUN_00419ca0의 cmp-vs-600을 트립 → 디코드 핸들러가 에러경로 → 유닛이 스테이징 파이프라인에 애초에 못 들어감. 아래 조인/순서/모드 분석(0x0b0a→FUN_004c2a80)은 이 카운트 게이트를 통과한 *다음* 단계의 사안이다.

---

## ★ 2026-07-11 스테이징 2단계 조인 — 정본 실바이트 capstone 확정 (count-BE 통과 후 잔여 블로커 후보)

count 게이트(1단계) 통과했는데도 activeCount=0/"NO TABLE". 2단계 스테이저 **FUN_004c2a80 (0x4c2a80)** 를 정본 EXE(9c97de2a) 실바이트로 재확정 — Ghidra 디컴파일 주소와 **드리프트 없음**(그 DB가 정본 import). 실디스어셈:

```
0x4c2af1  mov eax,[esi+0x36a5dc]        ; eax = 캐릭터 카운트
0x4c2b08  jle 0x4c2bf8                  ; 카운트<=0 → 루프 미실행(캐릭터 없으면 스테이징 0)
0x4c2b0e  lea ebp,[esi+0x36a8b4]        ; ebp = 캐릭터 테이블 base (stride 0x2d4)
  0x4c2b36  mov ecx,[ebp]               ; ecx = char.dword0 (캐릭터 ID)
  0x4c2b39  cmp ecx,[esi+0x3584a0]      ; == selectedID(0x0204가 세팅)?  ← 게이트1: "내 캐릭터인가"
  0x4c2b3f  jne 0x4c2ba4               ; 아니면 mode2 (FUN_004c2c80(2,char) — 유닛테이블 미사용)
  ; 내 캐릭터:
  0x4c2b43  mov cx,[esi+0x41a364]       ; cx = 유닛 카운트(u16)
  0x4c2b4c  mov byte[esp+0x13],1        ; found-my-char 플래그
  0x4c2b55  mov edi,[ebp+0x24]          ; ★ edi = char.dword9 @+0x24 (조인키, 캐릭터측)
  0x4c2b58  lea edx,[esi+0x41a368]      ; edx = 유닛 테이블 base
  0x4c2b5e  cmp edi,[edx]              ; ★ char.dword9 == unit.dword0 ?  (조인키 비교)  ← 게이트2
  0x4c2b60  je 0x4c2b6c               ; 매치 → 스테이징
  0x4c2b63  add edx,0x58              ; 다음 유닛 (stride 0x58)
  ...루프...
  0x4c2b6a  jmp 0x4c2b88             ; 매치 없음
  ; 매치:
  0x4c2b72  lea edi,[esi+eax*8+0x41a368] ; 유닛레코드 ptr (index*0x58)
  0x4c2b79  push edi; push ebp; push 0; call 0x4c2c80  ; FUN_004c2c80(0, char, unit) → 렌더영역 적재
  0x4c2b88  ; unitNotFound: push 0x770f9c; call log
  ...
0x4c2bf8  ; 내캐릭 없고 mode2도 없으면 push 0x770f68 (또 다른 에러)
```

### 조인키 확정 (양측 동일 프리미티브)
- **캐릭터측 char.dword9 @0x24** ← 0x0323 핸들러 FUN_00417390 **0x417471 `call [stream+0x1c]`(read-U32)**. (0x0323 레코드: dword0@0x00도 [stream+0x1c]로 읽음 → 0x4173c2.)
- **유닛측 unit.dword0 @0x00** ← 0x0325 핸들러 FUN_00419ca0 **0x419dba `call [stream+0x1c]`(read-U32)** → `[edi-4]`(=레코드+0, count 뒤 첫 dword).
- **둘 다 동일한 read-U32 프리미티브 [stream+0x1c]로 디코드된다.** 따라서 조인 `char.dword9 == unit.dword0`는 **서버가 두 필드를 바이트단위로 동일하게(같은 값·같은 엔디안) 인코딩하면 성립**하고, 절대 BE/LE와 무관하게 강건하다.

### 스테이징이 걸리는 두 게이트 (server-dev)
1. **게이트1 (내 캐릭터 식별):** `char.dword0`(0x0323 레코드 dword0, [stream+0x1c]) == `selectedID`(0x0204 body dword0, 0x3584a0). 불일치면 전 캐릭터가 mode2로 빠지고 내 유닛은 유닛테이블 조인을 못 탐 → 끝에 0x770f68 에러. **0x0204/0x0323의 캐릭터ID가 같은 값·같은 엔디안으로 디코드돼야.**
2. **게이트2 (유닛 조인):** `char.dword9`(0x0323 dword9 @0x24) == `unit.dword0`(0x0325 레코드[0] 첫 dword). 불일치면 0x770f9c "unit not found" → 스테이징 스킵 → activeCount=0. team이 이미 flagship+0x24 == unit[0].id 로 **논리값은 맞춤** → **잔여 위험 = 엔디안 불일치**.

### 가장 유력한 잔여 블로커 (검증 필요)
**count-BE 수정이 count u16만 뒤집었고 유닛 레코드 필드(특히 dword0=id)는 여전히 LE라면**, 클라 read-U32(BE 추정)가 unit.dword0를 바이트스왑해서 디코드 → 0x0323측 char.dword9(BE 정상)와 불일치 → 게이트2 실패 → "unit not found" → activeCount=0. **즉 0x0325 유닛 레코드의 모든 다바이트 필드를 count와 동일하게 BE로 인코딩해야 한다.** (0x0323이 정상 동작 = 0x0323 필드는 이미 BE. 0x0325 레코드도 BE로 통일.)
- 조인은 절대 엔디안과 무관하게 "두 필드 동일 인코딩"이면 성립하지만, 실무 요구 = **0x0204 캐릭터ID / 0x0323 캐릭터ID·dword9 / 0x0325 유닛레코드 dword0**를 전부 같은 엔디안(BE)·같은 값으로.

### server-dev 액션 요약
- buildInformationUnitInner: 유닛 레코드[k]의 dword0(id) 및 나머지 u32/u16 필드를 **BE**로(count와 동일 규약). 최소 내 캐릭터 대응 유닛[0].dword0 == 내 캐릭터 0x0323.dword9(@0x24) 값.
- buildInformationCharacterInner: dword0(캐릭터ID)가 0x0204 selectedID와 같은 값·BE.
- qa-marker2 라이브: FUN_004c2a80 진입 시 어느 문자열이 뜨나 — 0x770f68(내캐릭 못찾음=게이트1) vs 0x770f9c(유닛 못찾음=게이트2) 로 어느 게이트인지 확정.

---

## ★ 2026-07-11 char 조인 테이블이 비는 근본원인 — 정본 실바이트 확정 (qa-marker2: unit.dword0=1, char 레코드 ≈전부0)

count-BE로 유닛은 적재(unit.dword0=1)됐으나 char 조인 테이블 레코드가 ≈전부 0(@0x24=0) → char.dword9(0)≠unit.dword0(1) → 0x770f9c → NO TABLE. char 테이블 채우는 경로를 정본 실바이트로 확정:

### char 조인 테이블 = `session+0x36a8b4` (stride 0x2d4), count `+0x36a5dc` — 채우는 유일 경로 = FUN_004ba2b0 case 0x323
정본 디스어셈(0x4ba560~0x4bab49):
- case 0x323가 디코드된 0x0323 메시지객체(ebx=param_2)를 필드별로 스택로컬 → 그다음 **무조건**(게이트 없음) char 테이블 `[session + count*0x2d4 + 0x36a8b4]`(0x4ba935~0x4ba951)과 스크래치 `+0x36a5e0`(0x4ba75e~)에 복사.
- 복사 후 **count++**: `0x4bab25 mov esi,[ecx+0x36a5dc]; inc esi; mov [ecx+0x36a5dc],esi`. 첫 캐릭터(count==1)면 FUN_004c2c80(1,scratch,0)로 자기캐릭 슬롯도 등록.
- **0x0b09(NotifyEnterGridBegin)가 count `0x36a5dc=0`으로 리셋**(앞 절). 데이터영역은 안 지움 — count만 리셋. 즉 순서 `0x0b09 → 0x0323들 → 0x0b0a` 필수. **char 테이블은 오직 0x0323로만 채워진다(별도 트리거 없음).**

### 조인키 char측 소스 오프셋 (정본 확정, 오프셋 보존)
- **char 레코드+0x24 = [ebx+0x24]** (0x4ba5cd `mov ecx,[ebx+0x24]` → 0x4ba5e3 `mov [ebp-0x2e8],ecx` → 테이블+0x24). ebx = 디코드된 0x0323 객체.
- **char 레코드+0x00 = [ebx+0x00]** (0x4ba574 → +0x00, charId).
- 디코드객체 ebx = FUN_00417390 출력. **ebx+0x24 = 0x0323 와이어필드를 FUN_00417390 0x417471 `call [stream+0x1c]`(read-U32/BE)로 읽은 값** = server의 gridUnitId. ebx+0x00 = 0x4173c2 read-U32 = charId.
- 복사가 오프셋을 보존하므로: **char.dword9(조인키) ← 0x0323 디코드객체 +0x24 ← 0x0323 와이어의 그 필드(read-U32/BE).**

### 근본원인 (확정)
char 레코드는 **0x0323 바디에서 무조건 복사**된다(클라 게이트 없음). 레코드가 ≈전부 0이라는 건 **디코드된 0x0323 바디가 그 위치에서 0**이라는 뜻 = 서버측 문제(클라 스테이징 게이트 아님). 세부:
- **가장 유력:** 서버 buildInformationCharacterInner이 char 레코드 **+0x24(gridUnitId)를 0으로** 둔다(또는 그 필드를 안 채움/잘못된 오프셋). → char.dword9=0 ≠ unit.dword0=1 → 0x770f9c.
- charId(+0x00)도 0이면: selectedID(0x0204→0x3584a0)도 0일 때 "내캐릭" 오탐(0==0)으로 매치돼 조인키만 실패하는 그림과 정합.

### server-dev 액션 (2단계 조인 최종)
1. **0x0323 char 레코드 +0x24(gridUnitId) = 플레이어 유닛의 id(= 0x0325 유닛레코드[0].dword0 값)로 채워라. BE u32.** (현재 0 → 조인 실패의 직접 원인.)
2. **0x0323 char 레코드 +0x00(charId) = 0x0204 selectedID와 같은 값. BE u32.** (게이트1: 내캐릭 식별.)
3. 순서: `0x0b09 → 0x0323(플레이어 char 포함) → 0x0325 → 0x0b0a` 보장(0x0b09가 count 리셋하므로 char는 그 뒤에).
4. 0x0323 바디 전반이 0이면(≈전부0) buildInformationCharacterInner 자체가 FUN_00417390 기대 레이아웃과 어긋나 대부분 0으로 디코드되는지 점검(필드 오프셋/폭/BE).

### qa-marker2 판별 포인트
- char.dword0(charId)이 0인가 nonzero인가: nonzero면 서버가 +0x24만 안 채운 것(액션1). ≈전부0(charId도 0)이면 0x0323 바디 전체 미충전/오정렬(액션4).
- selectedID(0x3584a0) 실값: 0이면 0x0204 미전송/0.
- FUN_00417390(0x417390) 진입 및 case 0x323 진입 여부 + 원시 0x0323 바디 바이트.

---

## 한 줄 결론

**0x0325 전용 핸들러는 렌더 유닛 레지스트리(0x7db3c8)에 스테이징하지 않는다 — 설계상 그 책임이 아니다.**
0x0325는 유닛테이블을 전역버퍼 `0x41a364`에 적재만 하고, **실제 스테이징은 `0x0b0a`(NotifyEnterGridEnd)가 트리거하는 `FUN_004c2a80`**가 캐릭터테이블(0x0323 산출)과 유닛테이블(0x0325 산출)을 **조인**해서 수행한다.
따라서 "0x0325 핸들러가 body 어느 필드를 보고 스테이징을 스킵한다"는 기존 모델은 **틀렸다**. 스킵은 0x0325 핸들러 안이 아니라 0x0b0a 시점의 조인/순서/모드 게이트에서 일어난다.

## 함수 체인 (전부 정적 확정)

### 1. 리시브 → 인큐 → 펌프 (team 라이브 체인과 정합)
- reader `FUN_00404210` → dispatch `FUN_00404610` (team 확정과 일치). vtable[0]=디코드, vtable[8]=인큐.
- 인큐 `FUN_004b8850`, 게이트 `FUN_004b8b00(opcode, body, &deadline, &size)`:
  - **0x325 → `*size=0xce44`(52804), `*deadline=0`, `return 1`** → 정상 인큐. (0x323 → size=0x2d4=724.)
  - 즉 **크기/부호/길이 축은 여기서 전부 통과** — 인큐/펌프 레벨엔 0x325 차단 없음.
- 펌프 `FUN_004b8950`: deadline=0 → 즉시 선택 → `FUN_004ba2b0(opcode, body)` 호출.

### 2. 메시지 프로세서 `FUN_004ba2b0` — case 0x325 (ResponseInformationUnit_OK)
```c
case 0x325:
  log("ResponseInformationUnit_OK");
  memcpy(&DAT_0041a364 + session, body, 52804);   // 유닛테이블 전역버퍼 적재
  if (600 < *(u16)(&DAT_0041a364+session)) warn;    // count 상한 600
  FUN_005266e0(&DAT_0041a364+session);              // ★ 빈 스텁(ret only) — 수신시 파싱 안 함(지연)
  if (*(u16)(&DAT_0041a364+session) == 1)           // count==1 일 때만
      FUN_004c2c80(1, 0, &DAT_0041a368+session);    // "자기 유닛" 단일슬롯(session+0x80e8c)만 기록
  break;
```
- `FUN_005266e0`는 `void f(void){return;}` — **진짜 스텁**(파싱은 grid-enter로 연기).
- `FUN_004c2c80(1, 0, buf+4)`는 `param_2==0`이라 본 레코드 복사 블록(`if(param_2!=0)`) **스킵**; `param_3` 꼬리블록만 실행(88B → session+0x80e8c+0x318, `FUN_004b5bd0/004b5be0`). **렌더 레지스트리(0x7db3c8) 아님 — 플레이어 자기 유닛 단일슬롯.**
- **결론: 이 핸들러는 다중유닛 렌더 스테이징을 절대 하지 않는다.** body 필드로 early-return 하는 지점 자체가 없음(스테이징 코드가 여기 없으니까).

body 레이아웃(확정): `[u16 count][u16 pad][ unit×최대600, stride 0x58 ]` = 4 + 600×0x58 = 52804 = 0xce44.

### 3. 실제 스테이징 `FUN_004c2a80` (트리거 = `0x0b0a`)
`FUN_004ba2b0` case 0x0b0a (NotifyEnterGridEnd):
```c
case 0xb0a:
  grid_mode = *(u8)(session+0x126711);
  if (grid_mode == 2) { if (*(u8)(session+0x4376ec)==0) FUN_004c2a80(1); ... }
  else if (grid_mode == 0) { FUN_004c2a80(1); FUN_004c32a0(1); }
  // grid_mode == 1 → 스테이징 호출 자체 없음
```
`FUN_004c2a80(char param_1)` 핵심 루프:
```c
for (each char in table@session+0x36a8b4, stride 0x2d4, count=*(session+0x36a5dc)) {
  if (char.dword[0]  == *(session+0x3584a0)) {        // char ID == selectedID (0x0204가 세팅)
    for (each unit in table@session+0x41a368, stride 0x58, count=*(u16)(session+0x41a364)) {
      if (char.dword[9] == unit.dword[0]) {           // ★ 조인키: char@0x24 == unit@0x00
        FUN_004c2c80(0, char);                        // → 렌더영역(session+0xc) 스테이징
        goto next_char;
      }
    }
    log(&DAT_00770f9c);                               // "unit not found" — 유닛 안 뜸
  } else {
    FUN_004c2c80(2, char);                            // 다른 캐릭터: 기존 슬롯 ID검색 갱신(유닛테이블 미사용)
  }
}
```

## 스테이징 실패 실제 지점 (우선순위)

**A. 순서 의존 (1순위 유력).**
`0x0b09`(NotifyEnterGridBegin)가 **캐릭터 count `session+0x36a5dc`를 0으로 리셋**한다(디컴 라인 39327 확정).
스테이징 시퀀스는 반드시:
`0x0b09(리셋) → 0x0323×N(캐릭터 재적재, count++) → 0x0325(유닛버퍼 적재) → 0x0b0a(조인 스테이징)`.
서버가 0x0323/0x0325를 **0x0b09 이전에** 보내면 count가 0으로 밀려 `FUN_004c2a80` 루프가 0회 실행 → 유닛 0개. (진행 중 브랜치 `fix-worldenter-order` / `fix-gridenter-bracket`와 정합.)

**B. 조인키 불일치 (2순위).**
내 캐릭터의 `char.dword[9]`(= 0x0323 body dword[9], byte offset 0x24; 디컴 `local_2ec = param_2[9]`)와
어떤 유닛의 `unit.dword[0]`(= 0x0325 유닛레코드 첫 dword)가 **정확히 같아야** 그 유닛이 스테이징된다.
서버가 0x0325 유닛레코드[k].dword0 를 대응 캐릭터의 0x0323.dword[9] 값으로 채우지 않으면 `0x770f9c`("unit not found") 로그 후 스킵.

**C. grid-mode 게이트 (3순위).**
`session+0x126711`가 **1이면 0x0b0a가 `FUN_004c2a80`을 호출조차 안 함**. 진입 플로우가 mode 0(전략) 또는 2(전투)로 세팅돼야 함.
0x126711 = `FUN_004c45f0(param_1, param_2)`의 param_2 (byte1). 어떤 메시지가 FUN_004c45f0를 유발하는지는 별도 RE 필요.

## 0x0323 대조 (통과 vs 막힘의 갈림점)
- 0x0323도 렌더 레지스트리에 **직접 스테이징 안 함**. case 0x0323 = 캐릭터테이블 `0x36a8b4[count]`에 append + `0x36a5dc`++ + `FUN_004c2c80(1, char, 0)`로 자기캐릭 슬롯(0x80e8c) 기록.
- "0x0323 성공"의 실제 의미 = 캐릭터 데이터 적재 성공(성계에서 캐릭터/장수는 보임). 이건 유닛 스테이징 `FUN_004c2a80`의 **입력(캐릭터측)**을 제공.
- 갈림: 0x0323은 즉시 테이블 append, 0x0325는 버퍼에만 적재하고 스테이징을 0x0b0a로 연기. 0x0325만 "막힌 것처럼" 보이는 이유 = 0x0325 산출물이 0x0b0a 조인(A/B/C)을 통과 못 함.

## 수정 방향
- **(A) 서버 메시지 순서 보장(1순위):** `0x0b09 → 0x0323들 → 0x0325 → 0x0b0a`. 0x0b09 뒤에 캐릭터/유닛 재전송. exe-patch 불요.
- **(B) 서버 body 필드 교정:** 0x0325 유닛레코드[k].dword0 == 대응 캐릭터의 0x0323.dword[9]. 최소 내 캐릭터에 대응하는 유닛 1개는 이 조인 만족.
- **(C) grid-mode:** 진입이 0x126711 ∈ {0,2} 되게(FUN_004c45f0 유발 메시지 확인).
- **exe-patch 불요** — 전부 서버측 순서/필드로 해결 가능한 구조.

## 라이브 계측 포인트 (qa-marker용)
1. `0x4c2a80` 진입 여부. 진입시 `*(session+0x36a5dc)`(char count), `*(u16)(session+0x41a364)`(unit count), `*(session+0x3584a0)`(selectedID) 덤프.
2. `0x4c2a80` 내부 조인 성공(`FUN_004c2c80(0,…)` 도달) vs 실패(`0x770f9c` 로그) — 어느 쪽인지로 A/B/C 판별.
3. `0x4ba2b0` case 0x325 진입 후 `*(u16)(session+0x41a364)`가 실제 채워지는지(=서버 0x0325 도달·크기 검증).
- 참고: team의 "OnRecv 0x4ae0d0"는 이 Ghidra DB에서 함수경계로 안 잡힘(0x4ae050~0x4ae1c0 사이 미매핑, 데이터/vtable 참조도 없음). 렌더 스테이징 실경로는 위 `FUN_004c2a80`(0x4c2a80)이며, 0x4ae0d0 대신 이 지점을 계측할 것.

## 핵심 주소/오프셋 요약
| 심볼 | VA | 의미 |
|---|---|---|
| reader | FUN_00404210 | 메시지 리더 |
| dispatch | FUN_00404610 | opcode→핸들러 |
| enqueue gate | FUN_004b8b00 | size/deadline; 0x325→0xce44/0/accept |
| enqueue | FUN_004b8850 | recvque 적재 |
| pump | FUN_004b8950 | recvque 소비 |
| processor | FUN_004ba2b0 | opcode별 처리(case 0x325/0x323/0x0b09/0x0b0a) |
| unit-table 파서 | FUN_005266e0 | **빈 스텁** |
| 자기슬롯 기록 | FUN_004c2c80 | mode1=0x80e8c, mode0=+0xc(렌더), mode2=ID검색 |
| **유닛 스테이저** | **FUN_004c2a80** | **char×unit 조인, 0x0b0a 트리거** |
| grid-mode 세터 | FUN_004c45f0 | 0x126711=param_2 |
| 레지스트리 초기화 | FUN_004c94c0 | 0x7db3c8 zero (stride 0xb4c dw) |
| 유닛테이블 버퍼 | DAT_0041a364 | u16 count @0x41a364, records @0x41a368 stride 0x58 |
| 캐릭터테이블 | +0x36a8b4 | count @+0x36a5dc, stride 0x2d4 |
| selectedID | +0x3584a0 | 0x0204가 세팅 |
| 조인키 | char@0x24 == unit@0x00 | char=0x0323.dword[9], unit=0x0325 rec.dword[0] |
