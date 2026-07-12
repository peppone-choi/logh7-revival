# focus-id 조회 경로 — 전략맵 렌더러 크래시(0x58f83a) 정본 RE

대상: `artifacts/logh7-install/…/exe/g7mtclient.exe`
sha256 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`
분석: 정본 EXE 실바이트 디스어셈블(capstone x86-32, ImageBase 0x400000). Ghidra 주소가 이 영역에서는 **드리프트 없음**(크래시 VA 0x58f83a 바이트 `8b 0d 80 00 00 00` = `MOV ECX,[0x80]` 실측 일치, 즉 FUN_0058ee70/FUN_004c7290/FUN_004c2c80/FUN_004c2a80 주소 정확).

## 결론 3줄

1. **focusId 출처(확정)**: `focusId = *( *(clientBase+8) + 0x24 )`. clientBase = `*(0x7ccffc)`. 즉 clientBase+8에 든 포인터(포커스/셀렉션 오브젝트)의 `@0x24` 필드. 크래시 렌더러 FUN_0058ee70이 이 포인터를 `[esp+0x1c]`에 저장(0x58ef4e)하고, 렌더 말미(0x58f820)에 게터 FUN_004b5b80(=`[this+0x24]`)로 읽어 FUN_004c7290에 넘긴다.
2. **조회 키(확정)**: FUN_004c7290은 캐릭터 오브젝트 테이블(clientBase+0xc, 600엔트리 stride 0x370)을 선형 스캔. 점유판정 = `byte[entry+0] != 0`, 비교 키 = `*(entry+0x24)` = **캐릭터 id**(등록기 dedup이 이 필드를 char@0x00=id와 대조하는 것으로 확정). focusId와 일치하는 엔트리를 못 찾으면 eax=0 반환 → 0x58f834 `jne` 미통과 → 0x58f83a 널 read 크래시.
3. **서버 수정(핵심)**: 조회는 **캐릭터 테이블만** 훑고 키는 **char id**다. 크래시 회피 = 클라가 계산하는 focusId와 **같은 값을 @0x24로 갖는 캐릭터 엔트리**가 테이블에 존재해야 한다. 현재 라이브(char id=1, flagship=7=unit id)에서 focusId가 등록된 char id(=1) 집합에 없어 미스. **char.id / char.flagship / player unit.id 를 동일 값으로 정렬**(권장) 하거나, 라이브로 focusId 실측 후 그 값을 char.id로 등록하라. (아래 §5)

---

## 1. focusId 출처 — FUN_0058ee70 (크래시 렌더러)

```
0x58ef44  a1 fccf7c00      mov eax, [0x7ccffc]      ; clientBase
0x58ef49  8b 78 08         mov edi, [eax+8]         ; edi = *(clientBase+8) = focusObj (포인터)
0x58ef4c  8b cf            mov ecx, edi
0x58ef4e  89 7c 24 1c      mov [esp+0x1c], edi      ; focusObj 저장(이후 재사용)
0x58ef52  8d 6f 24         lea ebp, [edi+0x24]
0x58ef55  e8 ..            call 0x4b5b50            ; = lea eax,[ecx+0x318] (하위 서브구조 ptr, 신원 무관)
...
0x58f820  8b 4c 24 1c      mov ecx, [esp+0x1c]      ; ecx = focusObj
0x58f824  e8 ..            call 0x4b5b80            ; = mov eax,[ecx+0x24]  →  focusId = focusObj@0x24
0x58f829  50               push eax                 ; focusId
0x58f82a  e8 ..            call 0x4c7290            ; 오브젝트 테이블 조회(focusId)
0x58f82f  83 c4 04         add esp, 4
0x58f832  85 c0            test eax, eax
0x58f834  0f85 8a000000    jne 0x58f8c4             ; 히트 → 정상 렌더
0x58f83a  8b 0d 80000000   mov ecx, [0x00000080]    ; ★ 미스 폴스루 → 널페이지 read = APPCRASH
```

- `FUN_004b5b80` = `mov eax,[ecx+0x24]; ret` (0x4b5b80). 게터. **focusObj와 테이블 엔트리에 동일 게터가 쓰인다** → 둘의 `@0x24`는 같은 의미(오브젝트 id)여야 설계상 일치 가능.
- **clientBase+8 세터는 정적으로 미확정**(4가지 스캔 approach 실패 — Blocked-Loop로 중단). clientBase가 파라미터로 넘어가 `[this+8]`에 쓰이는 헬퍼 경로로 추정. focusObj가 "self/포커스 오브젝트"라는 성격은 §4의 HUD 판독 함수(0x4adeb0)가 focusObj@0x24를 숫자로 렌더하는 것으로 방증(= focus id는 화면 표시용 오브젝트 id).

## 2. 오브젝트 테이블 조회 — FUN_004c7290

```
0x4c72b1  a1 fccf7c00      mov eax, [0x7ccffc]
0x4c72b6  8d 74 07 0c      lea esi, [edi+eax+0xc]   ; entry = clientBase+0xc + edi
0x4c72ba  80 3e 00         cmp byte [esi], 0        ; 점유 판정 = entry@0x00
0x4c72bd  74 0b            je  skip
0x4c72bf  8b ce            mov ecx, esi
0x4c72c1  e8 ..            call 0x4b5b80            ; key = *(entry+0x24)
0x4c72c6  3b c5            cmp eax, ebp             ; ebp = focusId(인자)
0x4c72c8  74 14            je  hit                  ; 히트 → entry 포인터 반환
0x4c72ca  81 c7 70030000   add edi, 0x370           ; stride
0x4c72d0  81 ff 800e0800   cmp edi, 0x80e80         ; 0x80e80/0x370 = 600 엔트리
0x4c72d6  7c d9            jl  loop
0x4c72d8  ... xor eax,eax; ret                      ; 미스 → 0 반환
```

- 테이블: **clientBase+0xc, 600×0x370.** 점유 = byte@0, 키 = dword@0x24.
- **스캔 범위는 이 캐릭터 테이블만.** 인접한 2번째 테이블(clientBase+0x80e8c, 등록기 arg0=1 경로)은 스캔 안 함 → 포커스가 2번째 테이블/유닛 스테이징 오브젝트를 가리키면 영구 미스.

## 3. 등록 핸들러 — 어떤 키로 등록하나

### 0x0323 캐릭터 등록 — FUN_004c2c80(arg0, charPtr, unitPtr)
- `arg0=0`(self 캐릭터) → **테이블 슬롯 0**(this+0xc)에 고정 등록.
- `arg0=2`(그 외 캐릭터) → 슬롯 1..599 스캔해 빈칸/중복 슬롯에 등록.
- `arg0=1` → **다른 테이블 영역**(esi+0x80e8c, 0x4c2f3c)로 분기.
- **키 = entry@0x24 = char id (확정근거)**: 슬롯 스캔의 dedup에서
  ```
  0x4c2f71  mov ecx, edi           ; edi = 후보 entry
  0x4c2f73  call 0x4b5b80          ; *(entry+0x24)
  0x4c2f78  cmp eax, [ebp]         ; ebp = 신규 charSrc,  [ebp]=char@0x00 = id
  0x4c2f7b  je  reuse
  ```
  → entry@0x24를 char id와 대조 = entry@0x24는 char id.
- 캐릭터 레코드는 entry+0x24부터 복사(레코드 베이스 ebx=entry+0x24): `record@0x00(=entry@0x24)=char id`, `record@0x24(=entry@0x48)=flagship`
  (`0x4c2da3 mov ecx,[ebp+0x24]; 0x4c2da6 mov [ebx+0x24],ecx` = charSrc.flagship → record@0x24).

### begin/end 조인 — FUN_004c2a80(al)
- `al=0`(begin): 테이블 대량 클리어 — `rep stosd`가 this+0xc를 0x203a0 dword(=0x80e80=600×0x370) 제로필(0x4c2aa3), 유닛/그리드 영역들도 클리어.
- `al!=0`(end/join): self 캐릭터를 찾아 flagship 유닛과 링크 후 등록:
  ```
  0x4c2b36  mov ecx,[ebp]                      ; ebp = char 배열원소(stride 0x2d4), ecx=char@0x00=id
  0x4c2b39  cmp ecx,[esi+0x3584a0]             ; ★ self char id 전역과 대조
  0x4c2b3f  jne  → 그 외 캐릭터: call FUN_004c2c80(2, char, 0)
  0x4c2b55  mov edi,[ebp+0x24]                 ; char.flagship
  0x4c2b58  lea edx,[esi+0x41a368]             ; 유닛 배열(stride 0x58)
  0x4c2b5e  cmp edi,[edx]                      ; ★ flagship == unit@0x00(=unit id) 조인
  0x4c2b6c  (히트) ... call FUN_004c2c80(0, char, &unit)  ; self → 슬롯 0
  ```
  - self 캐릭터 판정 키 = `char@0x00(id) == *(clientBase+0x3584a0)`(로그인 시 세팅되는 self id 전역).
  - flagship 조인 키 = `char@0x24(flagship) == unit@0x00(id)` (0x0323 field-map의 조인 키와 정합).

## 4. focusObj 성격 방증 — HUD 판독 FUN(0x4adeb0)

```
0x4adebd  mov eax,[0x7ccffc]
0x4adec6  mov ecx,[eax+8]        ; focusObj
0x4adec9  test ecx,ecx; je null
0x4adecd  call 0x4b5b80          ; focusObj@0x24
0x4aded2  mov [0x7c24e8], eax    ; 전역에 저장 후 sprintf(0x5ff2c9)로 문자열화 → 렌더
```
→ clientBase+8은 "현재 포커스 오브젝트" 포인터, 그 @0x24는 화면에 숫자로 표시되는 오브젝트 id. (라이브가 crash 직전 `*(0x7c24e8)`를 덤프하면 focusId 실값을 직접 읽을 수 있다 — §5 검증.)

## 5. 서버 수정 결론 · 검증

### 문제의 국소화
- 조회는 캐릭터 테이블(clientBase+0xc)만, 키는 char id. focusId = focusObj@0x24.
- 라이브(char id=1, flagship=7=unit id, ccnt=1)에서 크래시 = **focusId ∉ {등록 char id} = {1}**.
- 회귀 대조상 크래시는 **flagship 조인 성립 직후** 처음 발생 → 조인 성공이 포커스 경로를 열었고, 그 포커스가 가리키는 오브젝트의 @0x24가 등록된 char id(1)와 다름. (미확정 축: focusObj가 self 캐릭터 엔트리인지 flagship 유닛/커서 오브젝트인지 — clientBase+8 세터 미확정으로 실바이트 확정 못 함. 단 유닛/2번째 테이블을 가리키면 §2대로 스캔 범위 밖이라 영구 미스.)

### 권장 수정 (server-dev)
1. **1순위 — id 정렬**: 플레이어의 `char.id`, `char.flagship`, `unit.id`를 **동일 값**으로 방출한다. 그러면 focusId가 (self char id든 flagship/unit id든) 그 공통값이 되고, 캐릭터 엔트리@0x24(=char.id)가 같은 값이라 조회 히트. 현재는 char.id=1 vs flagship=unit.id=7로 어긋남 → **char.id=7로 올리거나 flagship=unit.id=1로 내려 3자를 일치**시켜라. (조인은 flagship==unit.id만 요구하므로 셋 다 같으면 조인·포커스 동시 충족.)
2. self 캐릭터가 **슬롯 0에 확실히 등록**되도록 self id 전역(clientBase+0x3584a0) = 그 char id 이도록 로그인/월드-enter 순서를 유지(0x0204 charID 등).

### 라이브 검증 지침 (focusId 실측으로 1순위 확증)
크래시 직전 프리다/디버거로:
- `clientBase = *(0x7ccffc)`, `focusObj = *(clientBase+8)`, **`focusId = *(focusObj+0x24)`** 덤프. (또는 HUD 전역 `*(0x7c24e8)`.)
- 동시에 테이블 슬롯 0 `*(clientBase+0xc+0x24)`(등록 char id) 덤프.
- 두 값이 다르면 §권장1로 char.id를 focusId에 맞춰 재방출 → 재라이브. 같아지면 0x58f834 `jne`가 통과하여 크래시 소멸.

---

## 6. 스테이징→오브젝트 테이블 승격 실패 — 조인 유닛 원소 레이아웃 (2차 실측 후속, 정본 실바이트)

2차 라이브(`m3-idalign-20260711-190431`): id 정렬(char.id=flagship=unit.id=1) 반영했으나 오브젝트 테이블(clientBase+0xc) 여전히 empty → slot0@0x24=0, focusId=0, 크래시 지속. 원인 = **조인이 self 캐릭터를 승격(FUN_004c2c80(0,…)) 하지 못함**. 아래로 확정.

### 6.1 조인 self 판정과 self-id 전역의 출처 (확정)

FUN_004c2a80(al!=0) 조인 루프(`esi = this = clientBase`):
```
0x4c2af1  mov eax,[esi+0x36a5dc]          ; 스테이징 char 카운트
0x4c2b14  cmp ebx,0x258 (=600) …          ; 상한
0x4c2b36  mov ecx,[ebp]                    ; ebp = 스테이징 char 원소(base+0x36a8b4, stride 0x2d4), ecx=char@0x00=id
0x4c2b39  cmp ecx,[esi+0x3584a0]           ; ★ self 판정: char.id == self-id 전역
0x4c2b3f  jne 0x4c2ba4                     ; ≠ → 그 외 캐릭터: FUN_004c2c80(2,char,0)
```
- **self-id 전역 `clientBase+0x3584a0`의 출처 = `SSCharacterIDResponce` 핸들러**(0x4ba3dd, 문자열 "SSCharacterIDResponce OK" @0x7709bc):
  ```
  0x4ba3e7  mov eax,[ebx]                  ; ebx = wire body, eax = body dword0 (LE, 무변환)
  0x4ba3e9  mov [esi+0x3584a0],eax         ; self char id 전역 = wire dword0
  ```
  → self-id는 SSCharacterIDResponse(=task 추정 0x0204 charID)의 body 첫 dword를 **LE 무변환**으로 저장. 조인 begin(al=0)이 이 전역은 클리어하지 않음(로그인 시 1회 세팅, 지속).

### 6.2 조인 유닛 배열 순회 — 비교 오프셋은 원소 @0x00 (확정)

self 캐릭터 브랜치(char.id == self-id):
```
0x4c2b43  mov cx,[esi+0x41a364]            ; 유닛 카운트(u16) @ clientBase+0x41a364
0x4c2b55  mov edi,[ebp+0x24]               ; edi = char.flagship (스테이징 char@0x24)
0x4c2b58  lea edx,[esi+0x41a368]           ; edx = 유닛 배열 base (원소0), clientBase+0x41a368
0x4c2b5e  cmp edi,[edx]                    ; ★ flagship == *(원소+0x00)  ← 비교 대상 = 원소 @0x00
0x4c2b60  je  0x4c2b6c                      ; 매치 → self 캐릭터+유닛 승격
0x4c2b62  inc eax
0x4c2b63  add edx,0x58                     ; ★ 원소 stride 0x58
0x4c2b66  cmp eax,ecx ; jl 0x4c2b5e
0x4c2b6a  jmp 0x4c2b88                     ; 매치 실패 → 승격 안 함(=현재 상태)
0x4c2b6c  (매치) lea edi,[esi + n*0xa8*... + 0x41a368] ; 매치 유닛 ptr
0x4c2b7d  mov ecx,esi ; call FUN_004c2c80(0, char=ebp, &unit)  ; self → 슬롯0 승격
```
- **비교 오프셋 = 유닛 배열 원소 @0x00** (edx가 원소 base, [edx]=원소@0x00, **+4 보정 없음**). stride 0x58. 카운트 word @clientBase+0x41a364.
- 매치 실패 시 self 캐릭터를 슬롯0에 등록하지 않음 → 오브젝트 테이블 empty → focus 조회 미스 → 0x58f83a. **이것이 2차 라이브 증상.**

### 6.3 0x0325 유닛 배열은 파서가 아니라 raw 블릿 (확정 · 엔디안 함정)

`ResponseInformationUnit`(0x0325) 핸들러(0x4bb110, 문자열 "ResponseInformationUnit OK" @0x770678):
```
0x4bb11a  mov eax,[ebp-0x14]               ; clientBase
0x4bb11d  add eax,0x41a364                 ; dest = &유닛카운트
0x4bb122  mov ecx,0x3391                    ; 0x3391 dword = 52804 B
0x4bb127  mov esi,ebx (=wire body) ; mov edi,eax
0x4bb12e  rep movsd                         ; ★ wire body → clientBase+0x41a364 그대로 복사(무변환)
0x4bb130  cmp word [eax],0x259 (601)        ; 카운트 ≤600 검증
0x4bb15c  cmp word [esi],1 ; jne …          ; (카운트==1일 때만)
0x4bb169  lea edx,[ecx+0x41a368] ; push edx; push 0; push 1
0x4bb174  call 0x4c2c80                     ; FUN_004c2c80(1,0,&arr[0]) → 2번째 오브젝트 테이블(§2)
```
- **필드 파서 없음. 순수 memcpy 블릿**. 0x0323 캐릭터는 BE 스트림 파서(FUN_00417390)였지만 **0x0325 유닛은 바이트 스왑 없는 통짜 복사**. → 유닛 원소 바이트 = wire 바이트 그대로(LE).
- 크기 정확 일치: `0x3391*4 = 52804 = 4(카운트 헤더) + 600 × 0x58`. 즉 **wire body 레이아웃 = [u16 count @0x00][2B pad][원소0 @0x04, 원소 stride 0x58 × 600]**. 원소@0x00 = wire body @ (0x04 + i*0x58).

### 6.4 서버 수정 지침 (한 줄)

**0x0325 유닛 레코드의 unit id를 원소 오프셋 0x00에 little-endian u32로 써라.** (현재 라이브는 원소@0x00=0, id가 원소@0x04 → 4바이트 뒤로 밀려 있음. id를 원소 선두 @0x00으로 이동.) 구체:
- wire body = `[u16 count LE][u16 pad][ N × 0x58B 원소 ]`, 원소 base = body+0x04+i*0x58.
- **원소@0x00 = unit id, LE u32, 무변환**(블릿이므로 BE 스왑 금지 — 0x0323 char와 정반대).
- 이 값이 char.flagship(0x0323 char@0x24, BE 파서 통과분)의 **정수값과 동일**해야 조인 매치. 현재 정렬(flagship=unit.id=1)이면 원소@0x00=1(LE)로 놓으면 됨.
- 부수: `SSCharacterIDResponse` body dword0 = self char id(LE) = 그 char의 id와 동일해야 self 판정 성립(현재 1로 정렬됨).

수정 후 기대 체인: 원소@0x00=flagship → 조인 매치 → FUN_004c2c80(0,char,unit) → self 캐릭터 슬롯0 승격 → 오브젝트 테이블 non-empty(slot0@0x24=char.id) → focus 조회 히트 → 0x58f834 jne 통과 → 0x58f83a 크래시 소멸.

> **[2026-07-11 §7에서 정정]** §6.4의 "unit id→원소@0x00" 방향은 유효하나, 그 앞에 **더 바깥 게이트(0x0204 self-판정)가 닫혀 있어** 유닛 매치 로직에 도달조차 못 한다. §6 단독 수정으로 안 풀리는 이유가 이것. §7이 근본원인.

---

## 7. 근본원인 = self-판정 게이트(0x0204) 바이트순서 — 3회 실패 전부 설명 (정본 실바이트)

### 7.1 LE 가설(§6) 반증 수용
3차 라이브(`m3-le0325-20260711-213126`): 0x0325 원소를 LE로 돌리자 유닛 적재 자체가 붕괴(ucnt 25→0). 원인: 0x0325는 **필드 파서가 아니라 통짜 memcpy 블릿**이라 "필드 엔디안 전환"이 카운트 헤더(body@0x00 u16)까지 뒤집어 로더가 전량 거부. → 0x0325 body는 **정확한 인메모리 바이트 레이아웃**을 그대로 실어야 한다(개별 필드 BE 스왑 개념 없음). 단 §6.4의 "id를 원소@0x00에" 방향은 유효.

### 7.2 3회 공통 진짜 증상
| 런 | ccnt | char@0x24(flagship) | ucnt | slot0_id | focusId | 크래시 |
|---|---|---|---|---|---|---|
| 1(BE,flag=7) | 1 | 7 | 25 | **0** | 0 | 0x58f83a |
| 2(BE,정렬=1) | 1 | 1 | 25 | **0** | 0 | 0x58f83a |
| 3(LE) | 1 | 1 | **0** | **0** | 0 | 0x58f83a |

**3회 모두 slot0=0 = self 캐릭터가 오브젝트 테이블에 한 번도 승격 안 됨.** 유닛 엔디안/id 정렬을 아무리 바꿔도 안 풀림 = 유닛 매치보다 **더 앞단**이 막혀 있다는 뜻.

### 7.3 근본원인 — 0x0204 self-id 전역이 바이트 역전값

**클라 0x0204 SSCharacterIDResponce 핸들러(0x4ba3e7, 무스왑 raw 복사):**
```
0x4ba3e7  mov eax,[ebx]            ; ebx=wire body, eax = body dword0 (바이트 그대로)
0x4ba3e9  mov [esi+0x3584a0],eax   ; self-id 전역 = wire 4바이트 그대로 (BSWAP 없음)
```
**클라 0x0323 char id는 반대로 BE 스트림 파서(FUN_00417390 field#1, +0x1c reader = U32 BE 스왑) 통과** → `char.id = 정수값`.

**조인 self-판정(0x4c2b39):** `cmp char.id, [clientBase+0x3584a0]`
- char.id = 0x0323 파서가 **BE 스왑한 정수** (characterId=1 → 정수 1).
- 전역 = 0x0204 wire 4바이트를 **무스왑 native(LE)** 로 읽은 값.

**서버 현재(`logh7-world-records.mjs:197 buildSsCharacterIdInner`): `body.writeUInt32BE(characterId)`** → wire `00 00 00 01`.
- 전역 = raw(`00 00 00 01`) = **0x01000000** (=16777216).
- self-판정: `char.id(1) == 0x01000000`? **NO** → self 브랜치 미진입.
- → self 캐릭터가 0x4c2ba4(비-self) 경로로 빠져 `FUN_004c2c80(2,char,0)`로 슬롯1+ 등록되거나, self로 갔어도 §7.4 유닛게이트에서 탈락. **어느 쪽이든 slot0은 영원히 0.** (서버 주석 "0x0323 record BE와 바이트 동일" = 오판: 0x0323은 파서가 스왑, 0x0204는 무스왑이라 **정수를 맞춰야지 wire 바이트를 맞추면 안 됨**.)

숫자 검증(characterId=1):
- 0x0323: 서버 BE `00 00 00 01` → 파서 스왑 → char.id=1. ✓
- 0x0204 현재 BE: 서버 `00 00 00 01` → 전역=0x01000000. self-판정 1≠0x01000000 ✗
- 0x0204 수정 LE: 서버 `01 00 00 00` → 전역=0x00000001=1. self-판정 1==1 ✓

### 7.4 조인 트리거·유닛 게이트 (부수 확정)
- **트리거 정상**: FUN_004c2a80 호출부 3곳 = begin `0x4b780e`(push 0, 로더 스텝머신 FUN_004b76e0), end `0x4bcebb`/`0x4bced1`(push 1, 디스패처 → **0x0b0a end 브래킷**). 서버 0x0b09→0x0325→0x0323→0x0b0a emit이 end 조인을 실제로 부른다. 트리거는 문제 아님.
- **유닛 매치는 slot0 등록의 필수 조건**(확정): 조인 self 브랜치에서 `flagship == unit원소@0x00` 매치 성공(0x4c2b6c)일 때만 `FUN_004c2c80(0,char,&unit)` 호출. 매치 실패 → 0x4c2b88(에러 로그 "information_size=", 등록 안 함). 즉 **self-판정 통과 + 유닛 매치 성공 둘 다** 있어야 slot0 채워짐.
- `0x5266e0`(0x0325 핸들러가 부르는 "처리")은 `ret 4` **무동작 스텁** — 유닛 붕괴 원인 아님(카운트 헤더 엔디안이 원인, §7.1).

### 7.5 서버 수정 지침

**1순위 (3회 실패를 전부 설명하는 단일 근본 수정) — `buildSsCharacterIdInner`를 LITTLE-ENDIAN으로:**
```js
// logh7-world-records.mjs:197  (현재 writeUInt32BE → writeUInt32LE)
body.writeUInt32LE(characterId >>> 0, 0);   // 클라 0x0204 핸들러가 무스왑 raw 복사이므로
                                            // 전역(=self-id)이 0x0323 BE-파서 char.id와 정수로 일치해야 함
```
근거: 클라 0x0204 = 무스왑, 0x0323 = BE 스왑. 정수를 맞추려면 0x0204만 LE. (0x0323/flagship은 BE 유지.)

**2순위 (1순위로 self 브랜치 진입 후 slot0 실제 등록에 필요) — 0x0325 유닛 원소 id를 원소 오프셋 0x00에 LE로:**
- 현재 라이브: 유닛 원소@0x00=0, id가 원소@0x04. 조인은 원소@0x00을 읽음 → 4바이트 앞으로 이동.
- 0x0325 body = `[u16 count LE][u16 pad][원소 0x58B × N]`, 원소@0x00 = unit id (LE u32, 무스왑). 이 값이 char.flagship(BE-파서 정수)과 동일해야 매치(정렬 시 1).
- **주의: 0x0325 전체를 "LE 필드 전환" 하지 말 것**(§7.1 붕괴). 카운트 헤더·원소 stride 0x58·전체 프레이밍은 유지하고 **id 필드 위치(→원소@0x00)와 그 4바이트만 LE 정수로**.

**순서**: 1순위 먼저 적용 → 라이브에서 self-판정 통과(§7.6 프로브 1) 확인 → 2순위 적용 → slot0 등록 확인. 1순위 없이는 2순위 변경이 무의미(게이트가 닫혀 유닛 매치에 도달 못 함).

### 7.6 live-qa 프로브 체크리스트 (함수경계 훅 / 메모리 read만, 인라인 훅 금지)
`cb = *(0x7ccffc)` 로 두고, 0x0b0a(end 조인) 직후 시점에:
1. **self-id 전역**: `*(cb + 0x3584a0)` — 1순위 수정 후 **1**(=char.id) 기대. `0x01000000`이면 여전히 BE 버그.
2. **staging char.id / flagship**: `*(cb + 0x36a8b4 + 0x00)`(=id), `*(cb + 0x36a8b4 + 0x24)`(=flagship). 각 1 기대.
3. **유닛 원소0@0x00**: `*(cb + 0x41a368 + 0x00)` — 2순위 수정 후 **1**(=flagship) 기대(매치 조건). 카운트: `*(u16)(cb + 0x41a364)` = ucnt.
4. **slot0 등록 결과**: `*(u8)(cb + 0xc + 0x00)`(점유 바이트, ≠0 기대), `*(cb + 0xc + 0x24)`(slot0 id = char.id = 1 기대).
5. **focus 조회 입력**: `focusObj = *(cb + 8)`, `focusId = *(focusObj + 0x24)` (또는 HUD 전역 `*(0x7c24e8)`). slot0 채워지면 focusId=1, 조회 히트.
6. **조인 진입 확인(함수경계 훅 OK)**: `FUN_004c2a80`(0x4c2a80) 엔트리 훅 → 인자 `[esp+4]`(al) 로깅으로 begin(0)/end(1) 호출 시퀀스와 0x0b0a 연동 확인.

기대 최종 체인(1+2순위): 0x0204 LE → 전역=1=char.id → self 브랜치 진입 → 유닛 원소@0x00=1=flagship → 매치 → FUN_004c2c80(0,char,unit) → slot0 점유·id=1 → focusId=1 → 조회 히트 → 0x58f834 jne 통과 → 크래시 소멸.

> **[2026-07-11 §8에서 정정]** §7.5의 "1순위 0x0204 LE"는 **틀렸다**(라이브 반증). 0x0204는 BE가 정답(self-id는 애초에 버그 아님). 진짜 단일 블로커 = 유닛 원소 id 오프셋. §8이 정본.

---

## 8. 확정 근본원인 = 유닛 원소 id 오프셋 (self-id 반증 수용, 조인 매치 정밀 확정)

### 8.1 §7(self-id 엔디안) 반증 수용
4차 라이브(`m3-selfid-le-20260711-220933`): 0x0204를 LE(`01 00 00 00`)로 보내니 전역 `*(cb+0x3584a0)` = **0x01000000**(바이트 역순). → BE(`00 00 00 01`)를 보내야 전역=native 1. **0x0204는 BE가 정답 = 원래 상태.** §7의 "0x4ba3e7 무스왑" 판정은 오류: `[ebx]`가 raw wire가 아니라 **상위 프레이밍에서 이미 바이트 스왑된 파스 버퍼**다(0x0204/0x0323 같은 message32 계열은 프레이밍 파서가 정수화). 그래서 BE wire → [ebx]=native 1 → 전역=1=char.id로 self-판정은 **1·2차부터 이미 통과**했다. **self-id 엔디안은 4회 실패의 원인이 아니다.** (라이브 = ground truth, 정적 오독 정정.)

### 8.2 진짜 단일 블로커 — 유닛 원소 식별 키는 원소@0x00 (2개 함수로 이중 확정)

동일 유닛 배열을 읽는 **서로 다른 두 함수**가 모두 원소@0x00을 키로 비교:

**조인 FUN_004c2a80 (실바이트):**
```
0x4c2b43  66 8b 8e 64a34100   mov cx,[esi+0x41a364]      ; 유닛 카운트 u16
0x4c2b55  8b 7d 24            mov edi,[ebp+0x24]          ; char.flagship
0x4c2b58  8d 96 68a34100      lea edx,[esi+0x41a368]      ; 원소0 base
0x4c2b5e  3b 3a               cmp edi,[edx]               ; ★ flagship == 원소@0x00
0x4c2b63  83 c2 58            add edx,0x58                 ; stride 0x58
```
**인덱서 FUN_004c39c0 (교차검증, 실바이트):**
```
0x4c39d7  66 8b 83 64a34100   mov ax,[ebx+0x41a364]       ; 같은 카운트
0x4c39ea  8d 93 68a34100      lea edx,[ebx+0x41a368]       ; 같은 배열
0x4c39f0  39 2a               cmp [edx],ebp               ; ★ ebp == 원소@0x00
0x4c39f5  83 c2 58            add edx,0x58
```
→ **유닛 배열: base=`clientBase+0x41a368`, stride 0x58, 카운트 u16 @`clientBase+0x41a364`. 식별 키 = 원소@0x00.** (+0x04 아님. §6.2 재확인, +4 보정 없음.)

### 8.3 왜 4회 다 매치 실패했나 — id가 원소@0x04에 있다 (오프셋 오류)

0x0325 핸들러(0x4bb110)는 `rep movsd`로 wire body를 `clientBase+0x41a364`에 통짜 복사. 절대 오프셋으로 wire body 매핑 고정:
- `body[0..1]` → `0x41a364` = 카운트 u16
- `body[2..3]` → `0x41a366` = 패딩 2B
- `body[4..]` → `0x41a368` = 원소0. **원소i@k = body[4 + i*0x58 + k].**

라이브 실측(2차, id=1): 원소0 창 `00 00 00 00 | 01 00 00 00` = 원소@0x00=0, **원소@0x04 = `01 00 00 00` = native LE 1**. 즉 **id 값 자체는 이미 올바른 native LE(=1)인데 위치가 원소@0x04**. 조인은 원소@0x00(=0)을 읽어 flagship(1)과 비교 → 불일치 → 매치 실패 → self 승격 안 됨 → slot0=0 → 크래시. **4회 전부 이 한 가지 오프셋 오류.** (BE/LE/id-only-LE는 전부 원소 내 위치를 그대로 둔 채 인코딩만 바꾼 것이라 무의미했다.)

### 8.4 al=0x10 = 계측 아티팩트 (조인은 정상 실행)

FUN_004c2a80 첫 명령이 `mov al,[esp+4]`로 **al을 즉시 [esp+4](플래그 인자)로 덮어쓴다.** 4차 프로브가 본 al=0x10은 **진입 시점 레지스터 al의 잔여값**(호출 전 코드가 남긴 쓰레기)이고, 함수가 쓰는 실제 플래그가 아니다. 실제 플래그 = `[esp+4]`:
- 직접 호출부 3곳(전수): `0x4b780e` push **0**(begin, 로더 FUN_004b76e0), `0x4bcebb`/`0x4bced1` push **1**(end, 디스패처 → 0x0b0a end 브래킷; `[esi+0x126711]==2` 여부로 두 갈래).
- al!=0(0x10 포함) 전부 조인 경로(0x4c2af1)로 감(0x4c2a87은 zero-test뿐). **end 조인은 정상 실행됨.** 트리거는 문제 아님. → 프로브는 **al 레지스터가 아니라 `[esp+4]`(dword)** 를 읽어야 begin(0)/end(1) 판별 가능.

### 8.5 서버 수정 지침 (단일 · 확정)

**유닛 원소 id를 원소 오프셋 0x00으로 옮겨라. wire body offset 0x04 (= 원소0의 시작).**
- 현재: 원소@0x00=0, id가 원소@0x04(=body[8]). 서버가 원소 앞에 4바이트 선행 필드(0)를 두고 있음.
- 수정: 그 선행 4바이트를 제거해 **원소@0x00 = unit id**가 되게 한다. 즉 각 유닛 원소(0x58B)의 **첫 dword = unit id**.
- **엔디안·값은 그대로**(원소@0x04에 이미 native LE 1로 정확히 안착 중 → 순수 4바이트 앞당김). char.flagship(0x0323 BE-파서 정수)과 동일 정수(정렬 시 1)면 매치.
- **건드리지 말 것**: 카운트 헤더(body@0x00 u16 LE), 패딩(body@0x02), 원소 stride 0x58, 전체 프레이밍. 3차 붕괴(ucnt→0)는 이 프레이밍을 LE로 뒤집어서 생긴 것. **원소 내 id 필드 위치만** 바꾼다.
- **0x0204는 BE 유지**(원래대로, 손대지 말 것). §7 LE 권고 폐기.

wire body 목표 레이아웃(0x0325 ResponseInformationUnit):
```
body 0x00  u16 LE   count            → clientBase+0x41a364
body 0x02  u16      pad(0)           → clientBase+0x41a366
body 0x04  ┌ 원소0 (stride 0x58) ────→ clientBase+0x41a368
           │  +0x00  u32 LE  unit id  ★조인 키 = char.flagship 정수
           │  +0x04  … (기존 뒤 필드들, 전부 4바이트 앞당겨짐)
body 0x5c  ├ 원소1 …
           …
```

### 8.6 live-qa 5차 프로브 (갱신)
`cb = *(0x7ccffc)`, 0x0b0a(end 조인) 직후:
1. **self-판정(반증 확인용, BE 유지 상태)**: `*(cb+0x3584a0)` = **1**(=char.id) 기대. (이미 통과였음 — 회귀 감시용.)
2. **flagship**: `*(cb+0x36a8b4+0x24)` = 1 기대.
3. **★유닛 원소0@0x00**: `*(cb+0x41a368+0x00)` — 수정 후 **1**(=flagship) 기대(현재 0). 카운트 `*(u16)(cb+0x41a364)`=ucnt. (참고: 수정 전엔 id가 `*(cb+0x41a368+0x04)`=1에 보임.)
4. **slot0 등록 결과**: `*(u8)(cb+0xc+0x00)`≠0(점유), `*(cb+0xc+0x24)`=1(slot0 id).
5. **focus**: `focusObj=*(cb+8)`, `focusId=*(focusObj+0x24)` 또는 HUD `*(0x7c24e8)` = 1 기대, 조회 히트.
6. **조인 진입(함수경계 훅)**: `FUN_004c2a80`(0x4c2a80) 엔트리에서 **`[esp+4]` dword** 로깅(al 레지스터 아님) → begin(0)/end(1) 시퀀스 확인.

기대 최종 체인: 유닛 원소@0x00=1=flagship → 조인 매치 → FUN_004c2c80(0,char,&unit) → self 캐릭터 slot0 승격 → 오브젝트 테이블 non-empty(slot0@0x24=char.id=1) → focusId=1 조회 히트 → 0x58f834 jne 통과 → 0x58f83a 크래시 소멸.

> **[§8.7에서 정정]** §8.5의 "4바이트 앞당김(오프셋 이동)"은 **현 서버 코드 기준 틀렸다**. 현 코드는 id를 이미 body[4]=원소@0x00에 쓴다(오프셋 정확). 실제 버그는 **엔디안**: id를 BE로 써서 원소@0x00이 바이트 역순으로 읽혀 flagship과 안 맞는다. §8.5의 "+4"는 2차 런의 옛 레이아웃 잔상. §8.7이 현 코드 정본.

---

## 8.7 역설 해소 = 오프셋 아님, 엔디안 (현 서버 소스 실측 대조)

### memcpy src 기준점 (실바이트 확정)
- `buildMsg32Inner`(world-records.mjs:13-19): `out = [u32LE 0][u16BE code][body]`, **6바이트 프리픽스**. body는 out+6.
- 클라 0x0325 핸들러(0x4bb110) memcpy src = `ebx`. 0x0204 핸들러(0x4ba3e7 `mov eax,[ebx]`)가 characterId를 정확히 읽어 self-id 전역에 안착(라이브 검증)한다 = **ebx = body[0]**(6바이트 헤더는 디스패처가 이미 소비). 두 핸들러 동일 base.
- ∴ **클라 유닛배열 dest `clientBase+0x41a364`의 byte0 = 서버 전송 프레임의 body[0] = 프레임 7번째 바이트**(out+6). count=body[0], 원소0@0x00 = `0x41a368` = body[4].

### 4바이트 갭의 정체 — 현 코드엔 갭 없음, 엔디안이 문제
현 소스(world-records.mjs):
```
:365/374  body.writeUInt16BE(count, 0)                                   // count @body[0]  BE
:367      writeWireU32(body, unitId, CODE_INFO_UNIT_HEADER+UNIT_ELEM.ID, wireEndian)  // =off 4+0=body[4], wireEndian='be'
:379      writeWireU32(body, f.id, base+UNIT_ELEM.ID, wireEndian)         // base=4+i*0x58, id @원소@0x00, BE
```
`UNIT_ELEM.ID=0x00`, `HEADER=4` → **id는 이미 body[4] = 원소0@0x00에 기록**(오프셋 정확). 문제는 **BE로 씀**:
- unitId=1 → BE `00 00 00 01` → 원소@0x00(`0x41a368`) 바이트 = `00 00 00 01` → 조인이 native u32로 읽으면 **0x01000000**.
- char.flagship = 0x0323 **BE 스트림 파서**(field#14 +0x1c reader = U32 BE 스왑, world-records.mjs:271 wireEndian='be') 통과 → **native 정수 1**.
- 조인 `cmp edi(flagship=1), [edx](원소@0x00=0x01000000)` → 불일치 → 매치 실패. **이것이 진짜 원인.**

핵심 비대칭: **char 레코드(0x0323)는 BE 파서를 거쳐 정수화**되지만, **유닛 배열(0x0325)은 raw memcpy(무스왑)** 다. 그래서 조인이 비교하는 두 값이 native가 되려면 char id/flagship은 wire BE(파서가 스왑), **유닛 id는 wire LE**(스왑 없이 그대로 native)여야 한다. 소스 주석 `// unit[0].id ★BE만(조인 flagship 매치)`는 **정반대로 틀림** — LE여야 매치.

(2차 런의 "id가 원소@0x04" 덤프는 그 시점 코드의 다른 레이아웃 잔상. 현 코드는 원소@0x00에 있고 BE라서 못 맞는 것.)

### 서버 수정 — 정확한 한 줄 (상수 아님, 엔디안 인자)
**유닛 id write를 BE→LE로. `logh7-world-records.mjs:367` 과 `:379`의 id `writeWireU32`에 `wireEndian` 대신 `'le'` 고정:**
```js
// :367 (minimal path)
writeWireU32(body, unitId, CODE_INFO_UNIT_HEADER + UNIT_ELEM.ID, 'le'); // id LE (raw memcpy → native; flagship은 BE파서→native와 정수일치)
// :379 (fleets path)
writeWireU32(body, f.id ?? 0, base + UNIT_ELEM.ID, 'le');
```
→ unitId=1 → `01 00 00 00` → 원소@0x00 native = 1 = flagship(1) → 조인 i=0에서 즉시 매치.

### count 보존 확인 (매치-블로킹 아님)
- count도 클라는 **raw native LE로 읽는다**(핸들러 `cmp word[0x41a364]`, 조인 `mov cx,[..0x41a364]`, 인덱서 동일 — 전부 무스왑 word read). 서버 가정 "ntohs 스왑 스트림리더(FUN_00419ca0)"는 **0x0325 수신 경로가 아님**(0x0325 = 0x4bb110 raw memcpy, 52804B 크기 정확 일치로 확정). 즉 **count도 원칙상 LE**(현 BE는 native로 0x1900=6400로 읽힘).
- **단, count 엔디안은 조인 매치를 막지 않는다**: 조인은 i=0부터 스캔, 원소0@0x00==flagship이면 즉시 매치(je). count>0이면 진입하고 BE count(6400)도 >0이라 i=0 검사 도달. (부작용: 핸들러 `cmp word,0x259(601)` 초과 → "information_size over" **비치명 로그**만, 계속 진행. `cmp word,1` 불일치로 FUN_004c2c80(1,..) 2차테이블 등록만 스킵 — 조인/slot0와 무관.)
- 권장: id LE(크래시 블로커)를 먼저 넣어 매치 확인 → 이후 count도 `writeUInt16BE`→`writeUInt16LE`(:365/:374)로 정리하면 ucnt 정상화(over-601 로그 제거). **매치엔 id LE만으로 충분.**
- **§8.5의 "count/프레이밍 건드리지 말 것"은 부분 정정**: 프레이밍(6B 헤더·stride 0x58)은 유지하되, count/​id의 **엔디안은 LE가 정답**. 3차 붕괴는 "전체 LE 전환" 중 프레이밍까지 흔든 게 아니라 **id는 LE로 갔지만 count가 BE로 남아(하드코딩 :365) 카운트가 깨진** 불완전 전환이었다.

### 5차 프로브 (엔디안 확인 추가)
§8.6에 추가: 원소0@0x00을 **raw 4바이트**로 덤프(`(u8[4])(cb+0x41a368)`) → 수정 후 `01 00 00 00`(LE 1) 기대. 수정 전엔 `00 00 00 01`(BE, native 0x01000000). count도 raw 2바이트(`(u8[2])(cb+0x41a364)`) 덤프해 `19 00`(LE 25) 여부 확인.

**결론 한 줄**: `world-records.mjs:367`·`:379`의 유닛 id write를 `wireEndian`(='be')에서 **`'le'`로 바꿔라**(오프셋은 이미 원소@0x00로 정확). raw memcpy라 무스왑이므로 native LE여야 BE-파서 통과한 flagship 정수와 일치한다. count도 LE 권장이나 매치엔 불필요.

---

## 8.8 −3 규칙 교차검증 — 갭은 dest 아니라 src(1B), HEADER 4→3 안전

라이브 −3 규칙(2점: 2차 id BE '01'@body[7]→클라 index4, 5차 id LE '01'@body[4]→index1; 둘 다 client_elem = body−3)을 실바이트 대조:

1. **memcpy dest는 0x41a364 확정**(`0x4bb11d 05 64 a3 41 00 add eax,0x41a364`, edi=dest). **dest 시프트 아님.** 그러므로 1바이트 갭은 **src(ebx) 쪽** = 클라 memcpy src가 서버 body[0]보다 **1바이트 앞**(ebx = server_body − 1; 디스패처가 msg32 6B 헤더의 마지막 바이트=code 하위바이트를 body[−1]로 포함). 결과: **클라 원소@0x00(0x41a368) = 서버 body[3]** (내 정적 −4 모델을 라이브가 −3으로 1B 정정). → **HEADER 4→3이 맞다**: id를 body[3]에 써야 원소@0x00 안착. worker 수정 방향 정확. (완전 정적 확정 못 한 부분: 0x0204는 다른 디스패치 경로라 ebx 규약이 달라 직접 대조 불가 — Blocked-Loop로 프레이밍 정적추적 중단, 라이브 −3을 ground truth로 채택.)

2. **count는 HEADER 4→3으로 안 깨진다(매치 기준)**: −3 매핑상 서버 count@body[0]는 클라 0x41a365로 가고, 클라 count-read(0x41a364 u16)= body[−1..0] = **[msg32 code 하위바이트][body0]**. 0x0325 code=0x0325 → 하위바이트 0x25 → 클라 count 하위 = 0x25 ≠ 0. **∴ 클라 ucnt는 값이 부정확해도 항상 ≥0x25 > 0** → 조인이 진입해 원소 index 0(=id)에서 즉시 매치. count 정렬은 매치를 **막지 않는다**(0x25<601이라 over 로그도 없음). HEADER=3은 크래시 픽스에 안전. **단 ucnt 표시값은 코스메틱하게 어긋남**(정합시키려면 body 전체를 +1B 밀어야 하나 크래시 픽스엔 불필요).

3. **프로브(확정용)**: 수정 후 raw 덤프 — `(u8[4])(cb+0x41a368)`(원소@0x00) = `01 00 00 00` 기대, `(u8[2])(cb+0x41a364)`(ucnt) = 0 아님만 확인(정확값 불요). 원소@0x00==flagship이면 조인 매치 → slot0 승격 → 크래시 해소.

**요지**: dest는 0x41a364로 정확, 갭은 src 1B(클라가 헤더 1바이트를 body로 당겨봄) → HEADER 4→3이 정답. count는 헤더 바이트(0x25) 덕에 항상 nonzero라 HEADER=3이 count를 "깨서" 매치를 막는 일은 없다.
