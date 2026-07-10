# LOGH VII 한글 채팅 입출력 RE — 정통 EXE 기준 (2026-07-11)

**분석 대상 (정통 단일 정본):** `artifacts/logh7-install/…/exe/g7mtclient.exe`
sha256 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`, ImageBase 0x400000, ASLR off (VA = 파일오프셋 + 0x400000).
**근거:** Ghidra 디컴파일 `.omo/ghidra/export/decompiled/g7mtclient.exe_decompiled.c` (정통 EXE 산출물, 406,183줄) + 정통 EXE 실바이트 검증(python).
**목적:** 죽은 MMO의 자체 서버 호환·한글 접근성 복원(방어적). 클라 원본은 패치만 가능.

> ⚠️ 기존 `docs/logh7-localization-re-groundwork.md`는 **비정본 -sjis본**(md5 b6bd51da) 기준. 본 문서는 정통 EXE 실바이트로 전 오프셋 재검증했다. 폰트 문자열·charset 구조는 동일했고, 함수 라인번호만 다르다.

---

## 한 줄 결론

**한글 입출력의 병목은 단 하나 — 프로세스의 ANSI 코드페이지(ACP/mbcp).**
이 EXE의 DBCS 리드바이트 판정은 전부 CRT `_mbctype` 테이블(`DAT_03351340`)을 거치고, 이 테이블은 기동 시 `GetACP()`로 채워진다(하드코딩 SJIS 범위 아님). IME 입력도 `ImmGetCompositionStringA`(A-API)로 **스레드 ACP 코드페이지**의 바이트를 돌려받는다.

→ **클라 프로세스를 한국어 ACP(949)로 구동**하면(네이티브 한글 Windows 또는 Locale Emulator/AppLocale) `_mbctype`가 cp949 리드범위(0x81–0xFE)를 커버하고, 한글 IME 완성 음절이 cp949 DBCS로 버퍼에 적재되며, 입력 수용 필터도 한글을 통과시킨다.
→ **바이너리 패치는 CreateFontA 2곳의 charset(0x80→0x81)만 필수.** 나머지는 로케일 + 서버 cp949 인코딩으로 해결된다. 확신도 **높음**(입력 실캡처만 미실측 — 아래 프로브 1건).

---

## 1. 출력 (한글 표시)

### 1.1 폰트 생성 — CreateFontA 2곳, charset 0x80 SHIFTJIS (정통 EXE 실바이트 확정)

전 바이너리에서 CreateFontA 호출은 **정확히 2곳**, 둘 다 charset 인자 = `push 0x80`(SHIFTJIS_CHARSET):

| 사이트 | 함수 | charset push 파일오프셋 | 실바이트 | CreateFontA IAT |
|---|---|---|---|---|
| #1 | `FUN_004aec70` (decompile :29070) | **0xAEDEB** (VA 0x4AEDEB) | `6A 80` | `call [0x66b08c]` (+34B) |
| #2 | `FUN_004b0960` (decompile :30410) | **0xB0B97** (VA 0x4B0B97) | `6A 80` | `call [0x66b08c]` (+32B) |

- `6A 80` = `push -0x80` → 부호확장 0xFFFFFF80, CreateFontA `fdwCharSet` 하위바이트 **0x80 = SHIFTJIS_CHARSET**. 디컴파일의 `0xffffff80`과 일치.
- **폰트 페이스명 "MS UI Gothic"**: 파일오프셋 **0x37402C**(VA 0x77402C), 뒤에 `00 00 00 00` 패딩(슬롯 16B). 로드: `FUN_004aec10(s_MS_UI_Gothic, 0xc, 1)` (길이 12). 객체에 복사되어 CreateFontA의 lpszFace로 전달됨. **-sjis본과 동일 오프셋.**

### 1.2 실제 화면 텍스트 렌더 — GetGlyphOutlineA 런타임 래스터 (아틀라스 없음)

인게임 텍스트(채팅 포함)의 지배 경로. `FUN_00524530`(VA 0x00524530):
- `:120210/:120212` `GetGlyphOutlineA(hdc, uChar, 6=GGO_GRAY8_BITMAP, …)` — 65단계 AA(`:120278` `(0x41-v)*3.923`). hdc에는 1.1의 SHIFTJIS "MS UI Gothic" 폰트가 SelectObject.
- `:120152/:120169` `uChar = CONCAT11(byte0, byte1)` = **빅엔디안 2바이트 DBCS 패킹**. 예 の(82 CC)→0x82CC.
- `:120177` 하드코딩 `uChar == 0x8140`(SJIS 전각 스페이스 　) 특수처리 — cp949 대응값 검토 대상(경미, 미교체시 전각 스페이스 1자만 오동작).

### 1.3 DBCS 리드바이트 판정 — **하드코딩 SJIS 범위 아님, CRT `_mbctype` 테이블** (핵심)

렌더 분해기 `FUN_00524ae0`(VA 0x00524ae0)가 자당 분해:
- `:120371` 타입테이블 `*(struct+0x1c)` 읽음: 타입 **2 = DBCS 리드** → `:120375` `FUN_00524530(…,0)` 2바이트 모드; 타입 1 = 트레일; 그 외 1바이트.
- 이 타입테이블(+0x1c)을 채우는 리드바이트 판정은 전 바이너리 공통 패턴:
  `iVar2 = ((*(byte*)((int)&DAT_03351340 + b + 1) & 4) != 0) + 1;` (`FUN_00522d60` :118504 등)
  = MSVC `_ismbblead` 그 자체 (`_mbctype[b+1] & _M2(0x4)`), 리드면 2·아니면 1.
- **`DAT_03351340` = CRT `_mbctype` 테이블.** 기동 시 `_setmbcp`(`FUN_00601359` 리셋 → `FUN_006012dc`가 `GetACP()`/`GetOEMCP()`로 코드페이지 결정)로 채워짐. **명시적 `_setmbcp(932)` 하드코딩 없음** — 시스템 ACP를 따름.
  - ACP 932 → `_mbctype` 리드 = 0x81–0x9F, 0xE0–0xFC (cp932). cp949 한글의 0xA1–0xDF 리드가 **단일바이트로 오분해** → 반쪽 글리프.
  - ACP 949 → `_mbctype` 리드 = 0x81–0xFE (cp949). **한글 2바이트 정상 분해·래스터.**

### 출력 방안

1. **서버 채팅 바디를 cp949로 인코딩** 후 전송(와이어 코드 0x0f1c GridChat, 0x0207 GlobalChat, 0x0f1e SpotChat 등 — `docs/logh7-client-dispatch-catalog.md` M군).
2. **CreateFontA charset 패치 (필수, 2곳):** 파일오프셋 `0xAEDEB`, `0xB0B97`의 `6A 80` → **`6A 81`**(push 0x81 = HANGUL_CHARSET). 전역 무분별 0x80→0x81 금지 — 이 2바이트만.
3. **폰트 페이스 (권장):** 0x37402C의 "MS UI Gothic\0" → 한글 폰트명(≤12B in-place: `Gulim`/`Dotum`/`Batang`, 널패딩). charset만 0x81로 바꿔도 GDI 폰트매퍼가 HANGUL charset 대체폰트를 고르므로 필수는 아니나, 결정성 위해 권장. "Malgun Gothic"(13B)은 길이인자 0xc→0xd 동반 패치 필요.
4. **DBCS 리드바이트 테이블: 별도 패치 불요.** `_mbctype`가 ACP=949로 기동되면 자동으로 cp949 커버. → **프로세스를 한국어 로케일로 구동**하는 것으로 해결(1.3).

---

## 2. 입력 (한글 타이핑) — 핵심 갭

### 2.1 IME 메시지 경로 (EXE는 IME 완전 지원 — 자체 차단 없음)

WndProc `FUN_004e7200`(VA 0x004e7200):
- `:74285` `WM_IME_COMPOSITION(0x10f)` → `FUN_004ff7f0`/`FUN_004ffb50`.
- `:74284–74317` WM_IME_STARTCOMPOSITION(0x10d)/ENDCOMPOSITION(0x10e)/NOTIFY(0x282)/SETCONTEXT(0x281)/SELECT(0x285)/CHAR(0x286)/KEYDOWN(0x290) 전부 처리(디버그 문자열 존재).
- `:74328` `WM_CHAR(0x102)`: `:74333` IME 조합중 플래그 `DAT_00c51598` 및 lParam 비트(0x800/0x8)로 **IME 유래 WM_CHAR는 스킵** → IME 결과는 아래 composition 경로로 일원화.
- EXE는 `ImmAssociateContext`/`ImmDisableIME`를 **호출하지 않음**(Imm* 사용: GetContext/ReleaseContext/GetOpenStatus/SetCompositionWindow/GetConversionStatus/**GetCompositionStringA**/SetOpenStatus). **즉 원본 클라는 한글 IME 조합을 네이티브로 받는다.**

### 2.2 완성 문자열 취득 — `ImmGetCompositionStringA` (A-API → 스레드 ACP 코드페이지)

`FUN_004ff820`(VA 0x004ff820), IME 조합/확정 처리:
- `:92366` `ImmGetCompositionStringA(himc, 0x800=GCS_RESULTSTR, NULL,0)` → 확정 문자열 길이.
- `:92367` `…(himc, 8=GCS_COMPSTR, …)` → 조합중 길이.
- `:92391` `…(himc, 0x800, &DAT_02213ea4, 0x400)` / `:92413` `…(himc,0x800,lpBuf,len)` → **확정 문자열을 앱 버퍼로 적재**, 널종단. 이어 `FUN_0064be4b(&DAT_02214770)`/`FUN_004ffc00`로 입력창 버퍼에 append.
- **`…A` 변형은 유니코드 조합을 스레드 ANSI 코드페이지로 변환해 돌려준다.** 한국어 IME + ACP 949 → **한글 완성 음절이 cp949 DBCS 바이트로** 그대로 적재됨. cp932 하드코딩 없음.
- `:92393` `if (DAT_02213ea4 == 0x4081)` = 첫 2바이트가 SJIS 전각스페이스(81 40)면 특수처리 — **전각 스페이스 한정**이라 한글 입력을 막지 않음(경미).

### 2.3 입력 수용 필터 — `_isctype`+`_ismbblead` (로케일 의존, 한글 미차단)

WM_CHAR/편집 경로의 per-byte 수용 판정 `FUN_004fff60`(:92763) → `FUN_00600de9`(:277073):
- `:277083` `_ctype`(`DAT_007b490e`, mask 0x117) + `:277086` `_mbctype`(`DAT_03351340`, mask 3) 테이블 조회. **하드코딩 SJIS 범위 아님** — 1.3과 동일 로케일 테이블. ACP 949면 cp949 바이트 수용.
- `FUN_004fff60`은 space/`\n`/`\r`도 수용. 백스페이스 시 DBCS 경계도 `_mbctype`로 처리(`FUN_004ffe80`).

### 2.4 입력 인코딩 → 와이어

타이핑 텍스트는 입력창 버퍼에 **ACP 코드페이지 멀티바이트 그대로** 저장되고, 채팅 송신 시 그 바이트가 와이어(0x0f1c 등)로 나간다. **ACP 949 구동 시 서버는 cp949 채팅 바이트를 받는다**(별도 변환 없음, 출력과 대칭).

### 입력 방안

- **필수 조건 = 프로세스 ACP 949 구동** (네이티브 한글 Windows, 또는 Locale Emulator / AppLocale / "유니코드 아닌 프로그램 언어=한국어"). 그러면 IME 완성 음절이 cp949로 적재·수용·송신된다. **입력측 바이너리 패치 불요.**
- **라이브 하네스의 IME 차단 해제 필수:** 하네스가 `ImmAssociateContext(hwnd, NULL)`로 IME를 끊어와 실입력 테스트 0회였다. EXE 자체는 IME를 지원하므로 하네스의 차단 훅만 제거하면 됨.
- 클라 수정 최소화 관점: 입력은 **패치 0, 환경(로케일)만**. 서버측 대안은 불요(입력 우회/정규화 없이 cp949 그대로 처리).
- 잔여 경미사항: 2.2의 0x4081(전각스페이스) 특수처리는 한글 무관.

---

## 3. 캐릭터 이름 한글 I/O — **채팅과 별개 경로 (내부 UTF-16 / 와이어 UTF-16LE)**

> 채팅 바디는 **멀티바이트 cp949**(§1–2)지만, 캐릭터 이름(성/이름/기함명/표시명/작위명)은 **클라 내부에서 UTF-16(u16 배열)로 저장되고 0x1008·캐릭터레코드 와이어에도 UTF-16LE로 실린다.** 인코딩 축이 다르므로 아래를 채팅과 명확히 구분한다.

### 3.1 내부 표현 = UTF-16 (전 구간, 실바이트/디컴파일 확정)

이름은 **u8 길이(문자수) 프리픽스 + u16[] UTF-16 배열**로 저장:
- **생성 구조체** (`FUN_00405ea0` 덤퍼 :3452~): lastname len@+0xb / 배열@+0xc, firstname len@+0x26 / @+0x28, flagshipname len@+0x60 / @+0x62. 배열을 `*param_3`(u16)로 순회.
- **캐릭터 레코드**(0x0323 계열, 덤퍼 :3820~): lastname len@+0x1e / @+0x20, firstname len@+0x3a / @+0x3c, display_name len@+0x56 / @+0x58, titlename len@+0x72 / @+0x74, flagship_name len@+0x8e / @+0x90. 전부 `*(undefined2*)`(u16) 순회.

→ **모든 이름은 클라 내부에서 UTF-16.** 한글은 BMP에 전부 있으므로 내부 표현은 무손실.

### 3.2 와이어 = UTF-16LE (NUL종단), 한글 무손실

- **0x1008 C→S** (`docs/logh7-custom-character-creation-re.md` §3.1): `u8 lastname_len(=실자수+NUL)` + `u16[] UTF-16LE(NUL종단)`, 이어 firstname 동일. **packed**(고정슬롯 아님).
- **캐릭터 레코드 S→C**: 위 3.1 레이아웃(u8 문자수 + u16[] UTF-16LE)이 그대로 와이어.
- 한글 코드포인트(가–힣 U+AC00–D7A3 등)는 UCS-2에 온전히 실림. **이름 와이어에는 cp949 불요 — 서버는 UTF-16LE로 인코딩**하면 됨(채팅과 반대: 채팅은 cp949, 이름은 UTF-16LE).

### 3.3 입력 = 멀티바이트(ACP) → UTF-16 변환 (CP_ACP)

- 이름 폼도 **와이드 입력 경로 없음**(ImmGetCompositionStringW / GetWindowTextW / *W 윈도우 API **0건**). 폼 텍스트 필드는 채팅과 동일한 멀티바이트 입력 경로(`ImmGetCompositionStringA`, §2)로 IME 완성음절을 **ACP 바이트**로 받는다.
- 그 멀티바이트 문자열이 구조체 UTF-16 이름 필드로 커밋될 때 **`MultiByteToWideChar(CP_ACP=0, …)`** 로 변환 (MFC CString 변환기 `FUN_0064c5ba` @0x0064c5ba). **codepage=0=CP_ACP → 시스템 ACP를 따름**(932 하드코딩 아님).
- ACP 949 → cp949 한글 입력 → 올바른 Unicode 음절로 변환·저장.

### 3.4 렌더 = UTF-16 → 멀티바이트(ACP) → GDI 글리프 (CP_ACP + charset)

- 저장된 UTF-16 이름을 화면(생성 위저드·HUD 초상·캐릭터 선택 리스트)에 그릴 때 **`WideCharToMultiByte(CP_ACP=0, …)`** 로 멀티바이트 환원 (MFC 변환기 `FUN_0064c584` @0x0064c584) 후 §1.2 글리프 래스터(`FUN_00524530`, charset 0x80 SHIFTJIS)로 넘어간다.
- 즉 이름 렌더는 **(a) 멀티바이트 변환 경로**(유니코드 직결 아님)이고, **(b) 리드바이트 분해·charset은 채팅과 동일 병목**. ACP 949 → UTF-16 한글이 cp949 멀티바이트로 환원되고, `_mbctype`(ACP 949)가 cp949 리드범위를 커버, **charset 0x81 HANGUL 패치**(§1의 2곳)로 한글 글리프 래스터.

### 이름 방안 (입력→저장→표시 무손실)

**필요한 수정은 채팅과 동일, 이름 전용 바이너리 패치는 없음:**
1. **프로세스 ACP 949 구동** — 3.3 입력 변환(CP_ACP)·3.4 렌더 환원(CP_ACP)·`_mbctype` 리드범위를 한 번에 cp949로 정렬.
2. **CreateFontA charset 패치 2곳**(0xAEDEB/0xB0B97 `6A80→6A81`) — §1과 **공유**. 이름 렌더도 이 글리프 래스터를 타므로 별도 패치 불요.
3. **서버: 이름 와이어 필드를 UTF-16LE로** (0x1008·캐릭터 레코드). 이름은 와이어가 이미 유니코드라 **cp949 인코딩 불요**(채팅 바디만 cp949). u8 길이=문자수(0x1008은 +NUL), packed 커서 파싱 준수.

**서버측 대안/주의:** 이름은 와이어가 UTF-16LE라 서버는 한글을 손실 없이 저장·중계 가능(입력 우회 불요). 단 **이름 와이어 필드에 cp949 멀티바이트를 잘못 실으면** 클라 UTF-16 파서가 깨진다 — 반드시 UTF-16LE. (채팅 cp949 vs 이름 UTF-16LE 혼동 금지.)

---

## 4. 확신도 / 미확정

| 항목 | 확신도 | 근거 |
|---|---|---|
| CreateFontA 2곳 charset=0x80, 오프셋 0xAEDEB/0xB0B97 | **높음** | 정통 EXE 실바이트 `6A 80` + 동일 IAT[0x66b08c] |
| "MS UI Gothic" @0x37402C (12B+널패딩) | **높음** | 실바이트 |
| 렌더 DBCS 판정 = `_mbctype`(`_ismbblead &4`), SJIS 하드코딩 아님 | **높음** | FUN_00522d60/FUN_00524ae0 디컴파일 |
| `_mbctype`는 `GetACP` 기반 `_setmbcp`로 채워짐(932 하드코딩 없음) | **높음** | FUN_00601359/FUN_006012dc |
| IME 입력 = `ImmGetCompositionStringA`(A-API, 스레드 ACP) | **높음** | FUN_004ff820 디컴파일 |
| EXE가 IME를 자체 차단하지 않음 | **높음** | ImmAssociateContext/ImmDisableIME 0건 |
| 입력 수용필터 로케일 의존, 한글 미차단 | **높음** | FUN_00600de9 (_ctype+_mbctype) |
| ACP 949 구동 시 한글 IME 완성음절이 cp949로 실제 적재·송신 | **중간** | 정적 근거 강함, **실입력 캡처 미실측** → 프로브 P1 |
| 0x8140/0x4081 전각스페이스 특수처리의 cp949 영향 | **높음(경미)** | 전각스페이스 한정 |
| **이름**: 내부 UTF-16(u16 배열+u8 문자수) 전 구간 | **높음** | FUN_00405ea0 / 레코드 덤퍼 u16 순회 |
| **이름**: 0x1008·레코드 와이어 = UTF-16LE | **높음** | custom-char 문서 §3.1 정적RE+실캡처 |
| **이름 입력**: 멀티바이트→UTF-16 `MBTWC(CP_ACP)` (932 하드코딩 아님) | **높음** | FUN_0064c5ba, *W IME/윈도우 API 0건 |
| **이름 렌더**: UTF-16→멀티바이트 `WCTMB(CP_ACP)` → charset 0x80 래스터 | **높음** | FUN_0064c584 + §1.2 |
| ACP 949에서 한글 이름 입력→UTF-16 와이어→렌더 무손실 | **중간** | 정적 근거 강함, **실생성 미실측** → 프로브 P2 |

### 라이브 프로브 (미확정 2건)
- **P1 (채팅 입력 실검증):** 하네스의 `ImmAssociateContext(hwnd,NULL)` 차단 훅 제거 → 클라를 **한국어 ACP(949)** 로 구동(Locale Emulator 등) → charset 패치(0xAEDEB/0xB0B97 `6A80→6A81`) 적용 → 채팅창에 한글 타이핑 → (a) `ImmGetCompositionStringA` 반환 바이트를 훅 로깅해 cp949 DBCS인지, (b) 화면에 한글이 정상 래스터되는지, (c) 와이어로 나가는 채팅 바이트가 cp949인지 캡처. live-qa 협업.
- **P2 (캐릭터 이름 실검증):** 동일 환경(ACP 949 + IME 차단 해제 + charset 패치)에서 생성 위저드로 **성·이름에 한글** 입력 → (a) `MultiByteToWideChar(CP_ACP)`(FUN_0064c5ba) 반환 UTF-16이 올바른 한글 코드포인트인지, (b) 0x1008 송신 프레임의 이름 필드가 UTF-16LE 한글 코드포인트(U+AC00~)인지, (c) 위저드/HUD 초상/캐릭터 선택 리스트에 한글 이름이 안 깨지고 표시되는지 캡처. live-qa 협업.

---

## 부록: 핵심 함수/오프셋 인덱스 (정통 EXE)

```
CreateFontA charset push #1   파일오프셋 0xAEDEB (VA 0x4AEDEB)  6A 80→6A 81   FUN_004aec70  :29070
CreateFontA charset push #2   파일오프셋 0xB0B97 (VA 0x4B0B97)  6A 80→6A 81   FUN_004b0960  :30410
CreateFontA IAT thunk         [0x0066b08c]
"MS UI Gothic" face 문자열     파일오프셋 0x37402C (VA 0x77402C), 12B+00패딩,  로드 FUN_004aec10(…,0xc,1)
글리프 래스터(GGO_GRAY8)       FUN_00524530 @0x00524530  uChar=CONCAT11 BE 2byte :120152 ; SJIS 0x8140 :120177
DBCS 렌더 분해기(타입테이블+0x1c) FUN_00524ae0 @0x00524ae0  타입2=리드 :120371
_ismbblead 패턴(_mbctype&4)   FUN_00522d60 @0x00522d60  :118504
_mbctype 테이블               DAT_03351340 ; 리셋 FUN_00601359 @0x00601359 ; 코드페이지 FUN_006012dc(GetACP/GetOEMCP)
WndProc IME 디스패치           FUN_004e7200 @0x004e7200  WM_IME_COMPOSITION 0x10f :74285 ; WM_CHAR 0x102 :74328
IME 완성문자열 취득            FUN_004ff820 @0x004ff820  ImmGetCompositionStringA :92366/:92391/:92413
입력 수용필터                 FUN_004fff60 @0x004fff60 → FUN_00600de9 @0x00600de9 (_ctype+_mbctype)
채팅 함수(기존 감사)           FUN_005159e0 @0x005159e0 ; FUN_00516bf0 @0x00516bf0 (CHAT_TEXTBUF_MAXSIZE)
```
