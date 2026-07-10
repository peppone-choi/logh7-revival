# LOGH VII 한글화 선행 RE — 텍스트 파이프라인 정적 분석 (2026-07-10)

**분석 대상:** `artifacts/logh7-install/____________s___/____/exe/g7mtclient-sjis.exe` (원본 무패치본, md5 `b6bd51da4609a4ffae50a13d1933449a`, ImageBase 0x400000, ASLR off)
**도구:** Ghidra 12.1.2 headless (ExportAll) + xxd/파이썬 바이너리 검증
**목적:** localizer가 문자열/폰트/인코딩을 건드리기 전에, 텍스트 파이프라인을 바이너리 근거로 확정 (방어적/원본 클라 호환 보존).

> `g7mtclient.exe`(md5 `34be49cb…`)는 `-sjis` 원본과 36바이트만 다른 **이미 패치된 사본**이다(대부분 `0x90` NOP, 폰트 문자열 영역은 동일). 정적 근거는 무패치 `-sjis`본 기준.

---

## 한 줄 결론

**한글화 접근 = codepage 교체(cp932→cp949) + GDI charset 교체(SHIFTJIS 0x80 → HANGUL 0x81).**
글리프는 `GetGlyphOutlineA`로 **시스템 GDI 폰트에서 런타임 래스터라이즈**되므로 글리프 아틀라스 이미지 교체는 **불필요**. W-API·`MultiByteToWideChar`가 **전무**하므로 유니코드 직결도 아님. 확신도 **높음**.

---

## 1. 문자열 로드 경로

### 소스: 외부 `data/msgdat/*.dat` 팩 (`HFWR` 포맷), **String.txt 아님**

- `exe/String.txt`, 루트 `String.txt` 모두 **0바이트(빈 파일)** — 런타임 문자열 소스가 아니다. (과거 문서가 String.txt를 원인으로 지목했으나, 실제 UI/메시지 본문은 msgdat.)
- 실제 게임 텍스트: `data/msgdat/` 하위 팩 파일들
  - `constmsg.dat` (114,905 B) — 상수 메시지 테이블 (constmsg_lookup의 타깃)
  - `messages_0..8.dat`, `messages_com_0/1.dat`, `messages_tac_0..8.dat` — 화면/전투/전략 메시지
  - `g7sw.dat` (162 B)

### 포맷: `HFWR` 매직 + LE 32비트 오프셋 테이블 + SJIS 블롭

```
+0x00  char[4]  magic = "HFWR" (48 46 57 52)
+0x04  u32      reserved/version = 0
+0x08  u32      필드 A (messages_0=0x252, constmsg=0xC7F)
+0x0C  u32      count (messages_0=0x62=98)
+0x10  u32[count+1]  오프셋 테이블 (블롭 기준 바이트 오프셋, LE)
              → messages_0.dat: 테이블 끝 0x19C에서 블롭 시작
그 뒤   블롭   Shift-JIS(cp932) 텍스트, '\n' 개행, $token$ 치환 변수
```

- **인코딩 = Shift-JIS(cp932) 확정.** messages_0.dat 블롭 바이트 예: `82cc`(の), `8f96 8edd`(職務), `93fa 8e9e`(日時) — 전부 SJIS 리드바이트(0x81–0x9f/0xe0–0xfc) 시퀀스.
- **치환 토큰**: `$xname$` `$xrank$` `$xcommand$` `$xdate$` `$xproposer$` `$xmedal$` `$r10$` 등 `$…$`로 감싼 ASCII 플레이스홀더. 한글화 시 토큰 문자열은 보존해야 한다.
- HFWR 오프셋 테이블의 정확한 세부(필드 A=0x252의 의미, 다중 서브테이블 여부)는 **완전 확정 못 함(확신도 중간)** → extract-miner에게 정밀 디코드 위임 권장. 기존 카탈로그: `docs/reference/legacy-evidence/logh7-msgdat-catalog.md`.

### 파싱/조회 함수 (Ghidra VA, 기존 감사와 교차확인)

| VA | 역할 |
|---|---|
| `0x00522010` | `constmsg_lookup` — group/subId로 msgdat 상수 메시지 조회 |
| `0x004eac60` | 기존 문서가 `ansi_to_wide_text`로 명명 — **단, MBTWC 호출 아님**(아래 §3 주의) |
| `0x00503560` | `ui_control_set_text` |
| `0x00503610` | `ui_control_append_or_alt_text` |

---

## 2. 폰트 렌더 경로

### GDI 폰트 생성: `CreateFontA`, lfCharSet = **SHIFTJIS_CHARSET (0x80)**, face = "MS UI Gothic"

- **CreateFontA 호출 2곳** (전 바이너리에서 이 둘뿐):
  - `g7mtclient-sjis.exe_decompiled.c:29065` 및 `:30406`
  - 9번째 인자(fdwCharSet) = `0xffffff80` → 하위 바이트 **0x80 = SHIFTJIS_CHARSET** (양쪽 동일).
  - 품질 인자 = 4 (`ANTIALIASED_QUALITY`), face는 포인터 인자로 전달.
- **폰트 페이스명 "MS UI Gothic"**: 파일 오프셋 `0x37402C` → VA `0x77402C` (= 파일오프셋 + 0x400000). 무패치본·패치본 **동일**(과거 언급된 MalgunGothic 패치는 이 사본엔 미적용).
  - 로드 지점: `:76125` `FUN_004aec10(s_MS_UI_Gothic_0077402c, 0xc, 1)` (0xc = 12바이트 길이).

### 실제 화면 텍스트 렌더 = **커스텀 D3D 글리프 아틀라스** (`GetGlyphOutlineA` 런타임 래스터화)

이것이 인게임 텍스트의 **지배적 경로**다. `TextOut`류 GDI 직접출력이 아니다.

- **래스터라이저: `FUN_00524530` (VA 0x00524530)** — 문자 1자를 GDI 폰트에서 비트맵으로 뽑아 D3D 텍스처에 블릿:
  - `:120212/:120214` `GetGlyphOutlineA(hdc, uChar, 6, &gm, …)` — 포맷 `6 = GGO_GRAY8_BITMAP`(65단계 AA). `:120280` `(0x41 - v) * 3.923`로 0–64 그레이 → 0–255 알파 변환. `hdc`(in_ECX+0xa8)에는 위 SHIFTJIS "MS UI Gothic" 폰트가 SelectObject 되어 있음.
  - 텍스처 포맷 분기 `:120288` 0x15=32bit ARGB, 0x19/0x1a=16bit.
  - **`uChar` 구성(핵심):** `:120154` 모드0 `uChar = CONCAT11(byte0, byte1)` = `(byte0<<8)|byte1` — **빅엔디안 패킹 2바이트(DBCS)**. 모드!=0 `:120175` 단일바이트. 예: の(82 CC) → uChar=0x82CC.
  - **하드코딩 SJIS 상수 `:120179` `uChar == 0x8140`** = SJIS 전각 스페이스(　). cp932 전용 특수처리.
- **DBCS 분해기(래스터라이저 호출부): `FUN_005243xx` (`:120345`~)** — 문자열을 자당 분해:
  - 바이트별 **타입 테이블** `*(struct+0x1c)` 를 읽음: 타입 `2`=**DBCS 리드바이트** → `:120377` `FUN_00524530(…,0)` 2바이트 모드; 그 외 → `:120389` 1바이트 모드, 다음 바이트 타입 `1`(트레일) 이면 `:120399` 모드2.
  - 즉 **실제 SJIS 리드바이트 범위 판정은 이 타입 테이블을 채우는 상류 ingest 패스**에 있음(별도 함수, 본 조사에서 주소 미확정 — 확신도 중간). CRT `_ismbblead` 계열 추정.

### 부차 경로: `ExtTextOutA` (ANSI 직접출력)

- `:29089/:30451/:30470` `ExtTextOutA` + `:29084/:30432` `GetTextExtentPoint32A`(측정). 위 2개 CreateFontA와 짝. 전각 스페이스/특정 오버레이·소수 화면용으로 보임. **역시 A(멀티바이트)-API** → 폰트 charset(SHIFTJIS)의 코드페이지로 바이트 해석.

### 인코딩 경계 판정

- **W-API·유니코드 전무:** `TextOutW`/`DrawTextW`/`MultiByteToWideChar`/`WideCharToMultiByte` **0건**. 전 텍스트 파이프라인이 A(멀티바이트)-API + SHIFTJIS_CHARSET로, 바이트열을 cp932로 취급한다. (`0x004eac60`의 "ansi_to_wide" 명칭은 오해 — Win32 MBTWC가 아니라 내부 버퍼 변환.)
- **로케일:** 명시적 `_setmbcp(932)` 미발견. `:277491` CRT 헬퍼가 LCID `0x411`(일본어) 하드코딩 반환, GetACP/GetOEMCP는 표준 CRT 경로. 게임은 **시스템 ACP=932(일본어) 가정**에 의존하나, GDI 렌더는 ACP와 무관하게 **CreateFontA의 하드코딩 charset 0x80**으로 SJIS 글리프를 뽑는다.

---

## 3. 채팅 입력 경로 (우선순위 낮음, 미심층)

- 채팅 관련 함수(기존 감사): `0x005159e0`, `0x00516bf0`(`CHAT_TEXTBUF_MAXSIZE over!!!`), 리소스 `data/image/chat/chat_parts.tga`. 입력 버퍼도 §2와 동일하게 멀티바이트(cp932) 취급으로 추정. WM_IME_* 처리 정밀 RE는 별도 태스크로 남김.

---

## 4. 한글화 가능성 판정 (경로별 난이도)

**결론: codepage 교체 + charset 교체 조합. 글리프 아틀라스 이미지 교체 불필요, 유니코드 직결 불가.**

글리프가 파일이 아니라 `GetGlyphOutlineA`로 GDI 폰트에서 실시간 생성되므로:

1. **문자열 데이터** — msgdat 블롭을 **cp949(한글)** 로 재작성 + `$token$` 보존. (constmsg.dat부터: P0 mojibake 5종)
2. **GDI charset** — `CreateFontA` 2곳의 `0xffffff80`(0x80 SHIFTJIS) → **0x81(HANGUL_CHARSET)**, face → 한글 폰트(예: 맑은 고딕/굴림). 두 함수 모두 패치 필요. **전역 무분별 0x80→0x81 금지** — 이 2개 CreateFontA만.
   - ⚠️ SHIFTJIS 폰트로는 `GetGlyphOutlineA`가 한글 글리프를 못 뽑는다(코드-only 교체만으론 깨짐). charset+face 동시 교체가 필수.
3. **DBCS 리드바이트 판정** — 타입 테이블(struct+0x1c) 생성 상류 패스의 SJIS 범위(0x81–0x9f/0xe0–0xfc)를 **cp949 리드 범위(0x81–0xFE)** 로 확장/교체. (해당 ingest 함수 주소 확정이 구현 전 선행 과제.) 미교체 시 cp949 2바이트가 오분해되어 반쪽 글리프.
4. **하드코딩 SJIS 상수** — `FUN_00524530:120179`의 `0x8140`(전각 스페이스) 등 cp949 대응값 검토(경미).

**불가/불필요 경로:**
- ❌ 유니코드 직결: W-API·MBTWC 전무 → 대규모 코드 리라이트 필요, 비현실적.
- ❌ 글리프 아틀라스 이미지 교체: 아틀라스가 없음(런타임 래스터화) → 교체 대상 자체가 없음. (단 `data/image/*.tga`의 그림 속 **구운 일본어 텍스트**는 별도 이미지 편집 대상 — 폰트 파이프라인과 무관.)

---

## 5. 확신도 / 미확정

| 항목 | 확신도 | 비고 |
|---|---|---|
| String.txt 빈 파일, msgdat가 소스 | 높음 | 0바이트 직접 확인 |
| msgdat = cp932 + $token$ | 높음 | 블롭 바이트 디코드 |
| HFWR 오프셋 테이블 세부 구조 | 중간 | 필드 A 의미 미확정 → extract-miner |
| CreateFontA charset=0x80, face="MS UI Gothic" | 높음 | 디컴파일 2곳 + 파일오프셋 |
| GetGlyphOutlineA 런타임 래스터(아틀라스 없음) | 높음 | FUN_00524530 디컴파일 |
| uChar = 빅엔디안 2바이트 SJIS | 높음 | CONCAT11 + 0x8140 상수 |
| W-API/MBTWC 전무 → cp949 경로 | 높음 | grep 0건 |
| SJIS 리드바이트 판정 함수 주소 | 중간(미확정) | 타입테이블 채우는 상류 패스, 구현 전 확정 요 |
| 채팅 IME 입력 경로 | 낮음 | 미심층 |

## 부록: 핵심 함수/오프셋 인덱스

```
CreateFontA (charset 0x80, face ptr)        decompiled.c:29065, :30406
ExtTextOutA / GetTextExtentPoint32A         :29089/:30451/:30470, :29084/:30432
GetGlyphOutlineA (GGO_GRAY8, uChar)         FUN_00524530 @0x00524530  :120212/:120214
  DBCS 2바이트 패킹 uChar=CONCAT11          :120154 ;  SJIS 0x8140 상수 :120179
DBCS 분해기(타입테이블 +0x1c)               FUN_005243xx  :120345~ :120377/:120389/:120399
"MS UI Gothic" 문자열                        파일오프셋 0x37402C / VA 0x77402C ; 로드 :76125
constmsg_lookup                              0x00522010
ui_control_set_text / append                 0x00503560 / 0x00503610
CRT LCID 0x411(일본어) 하드코딩              :277491
Ghidra 산출물(임시)                          scratchpad/ghidra-out/g7mtclient-sjis.exe_decompiled.c (844KB)
```
