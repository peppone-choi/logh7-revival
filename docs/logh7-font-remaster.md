# LOGH VII — Font & Korean Text (RE + remaster plan)

Read-only RE result; every claim cited to `.omo/ghidra/export/G7MTClient/`
(query `python tools/logh7_redex.py func 0x<addr>`). The text pipeline is **GDI
`CreateFontA`** — a runtime *system* font, NOT a baked bitmap font — so the look
is changed by swapping the face name + charset + quality, with no glyph re-authoring.

## 1. How text is rendered (RE-confirmed)

- **`CreateFontA`** is called in **`FUN_004aec70` @0x004aec70** (and `FUN_004b0960`),
  the `CFont` wrapper:
  ```
  CreateFontA(-height, 0,0,0, weight(400/700 from param+0x54 bit0),
              italic(param+0x54 bit1), 0,0,
              1,      // <- iCharSet = 1 = DEFAULT_CHARSET
              0,0,
              4,      // <- iQuality = 4 = ANTIALIASED_QUALITY
              2,      // pitchAndFamily
              param_1 // lpszFace (the CFont's stored face string)
  ```
- **Face name = "MS UI Gothic"** — hardcoded string `s_MS_UI_Gothic` @ **0x0077402c**
  (12 chars + NUL = 13 bytes). Set in **`FUN_004ea180` @0x004ea180**:
  `FUN_004aec10(s_MS_UI_Gothic_0077402c, 0xc /*size 12*/, 1)`.
- **Charset = 1 (DEFAULT_CHARSET).** On a non-Korean ACP this can box Hangul; the
  recovered localization patches this byte to `0x81` (HANGEUL_CHARSET). See [[logh7-font-localization]].
- **Quality = 4 (ANTIALIASED_QUALITY)** — already smoothed, but pre-ClearType.

## 2. Built-in Korean mode (major find — config, NO patch)

**`FUN_00641b90` @0x00641b90** reads `win.ini [windows]` at startup:

```
GetProfileStringA("windows","kanjimenu","roman", buf,9);  if lstrcmpiA(buf,"kanji")==0   -> kanji menu
GetProfileStringA("windows","hangeulmenu","english", buf,9); if lstrcmpiA(buf,"hangeul")==0 -> HANGEUL menu
```

So the shipped client already has a **Korean (hangeul) UI mode** gated purely by a
win.ini key. Enable it with **`[windows] hangeulmenu = hangeul`** (and/or
`kanjimenu = kanji` for Japanese). No binary patch for the mode toggle itself.

> verify-later in live client: confirm whether the `hangeulmenu=hangeul` path also
> switches the CreateFontA charset/face internally (some builds branch the font by
> mode). If it does not, apply the §3 charset patch alongside the toggle.

## 3. Korean text — make Hangul render reliably

1. **`win.ini [windows] hangeulmenu = hangeul`** (built-in mode, §2).
2. **`String.txt` / MsgDat in cp949** (already recovered — [[logh7-font-localization]],
   [[logh7-localization-cp932-wall]]).
3. **Charset patch (if needed):** `FUN_004aec70` CreateFontA arg9 `1` → `0x81`
   (HANGEUL_CHARSET) so Hangul renders regardless of system ACP. Single-byte imm.
4. Locale belt-and-suspenders: run under ko-KR app-locale / embedded manifest so
   `DEFAULT_CHARSET` resolves Korean even unpatched (per the cp932-wall note: this
   machine's ACP is UTF-8, which is the real boxing cause, not the EXE).

## 4. "Too plain / old format" — upgrade the font (non-invasive)

Because text is a runtime GDI system font, the look upgrades by **changing the face
name to a modern/styled font** — no glyph atlas work:

- **In-place face swap (≤12 chars):** overwrite `s_MS_UI_Gothic` @0x0077402c with a
  short face name (e.g. `맑은 고딕` in cp949 ≈ 7 bytes, `Gulim`, `Batang`, or a
  bundled custom font given a ≤12-char name). Pad remaining bytes with NUL.
- **Repoint for a longer name:** patch the string pointer in the
  `FUN_004aec10(0x77402c, 0xc, 1)` call (`FUN_004ea180`) to a new face string placed
  in a code cave (`"Malgun Gothic"`, `"NanumGothic"`, a sci-fi display face, etc.).
- **Bundle the font** so it exists without a manual install: register the `.ttf`
  with `AddFontResourceExA(path, FR_PRIVATE, 0)` at startup. The client does not
  call it today, so options: (a) ship the font and system-install it via the
  launcher/setup, or (b) add a tiny startup font-loader patch / a wrapper DLL that
  registers the private font before `CreateFontA`.
- **Crisper text:** `FUN_004aec70` CreateFontA arg12 quality `4` (ANTIALIASED) →
  `5` (CLEARTYPE_QUALITY) for modern sub-pixel smoothing. Single-byte imm.
- A weightier/larger face: the CFont size (`0xc`=12 in `FUN_004ea180`) and the
  weight bit (param+0x54) are also patchable for a bolder look.

## 5. Build plan (follow-up)

- `tools/client_patches/font-upgrade.json` descriptor: charset `1→0x81`
  (0x004aec70 site), quality `4→5` (same site), face-name swap (0x77402c in-place or
  the `FUN_004ea180` pointer repoint to a cave). Wire via
  `tools/logh7_build_playable_client.py`. **Byte-exact `originalHex/patchedHex` to be
  dumped from the call-site disasm before applying; live-verify the glyphs.**
- Config side (no patch): set `win.ini [windows] hangeulmenu = hangeul`; ship the
  chosen modern Korean `.ttf`; register it (private font) at launch.
- Choose a face that fits LOGH's sci-fi tone (clean geometric sans / display face)
  while covering KS X 1001 Hangul (e.g. Noto Sans KR / Pretendard / a licensed
  display font) — license-check before bundling.

## 6. Encoding — cp949 vs UTF (RE verdict: the engine is ANSI, so cp949)

The client imports **only ANSI text APIs** — `TextOutA`, `ExtTextOutA`, `DrawTextA`,
`TabbedTextOutA`, `GetGlyphOutlineA`, `CreateFontA` (GDI32/USER32 import table).
**There is NO `TextOutW`/`DrawTextW`/`CreateFontW`** anywhere. So every glyph is
drawn by a **codepage-based ANSI** call: the bytes are interpreted by the font's
charset codepage.

- With **HANGEUL_CHARSET** (the charset you need so GDI picks a Korean font), the
  ANSI text functions interpret bytes as **cp949 (EUC-KR / KS X 1001)**. Feeding
  **UTF-8 bytes would mojibake** — they are not cp949.
- So the game's on-disk/in-memory strings (String.txt, MsgDat) **must be cp949**.
  This is not a preference over UTF — it is forced by the ANSI engine.
- **UTF-8 is still the right SOURCE/authoring format** in this repo: keep content in
  UTF-8 and convert → cp949 at the packaging step (the existing localization
  pipeline). UTF-8 in the repo, cp949 in the shipped files.
- A genuine **UTF runtime** would require converting the whole text layer to Unicode
  (`CreateFontW` + `TextOutW`/`DrawTextW` + UTF-16), i.e. hooking/patching every ANSI
  text call (a large invasive change) or a shim DLL that re-routes the A-calls to W
  with a UTF-8→UTF-16 decode. Since **cp949 already covers all modern Hangul**, UTF
  buys only non-Korean glyphs (emoji/CJK-ext) the game never uses — not worth the
  rewrite. (A UTF-8 *ACP* manifest, codepage 65001, does NOT help here: HANGEUL_CHARSET
  forces the cp949 codepage regardless of ACP, and GDI's UTF-8-ACP ANSI text path is
  unreliable.)

**Verdict:** cp949 for the game files (engine-forced); UTF-8 for our sources. Don't
ship UTF-8 to the ANSI engine.

## 7. Login menu still Japanese — it is a Win32 DIALOG RESOURCE, not String.txt

The user's symptom ("내용은 한글인데 메뉴가 일어" — in-game CONTENT is Korean but the
login MENU is Japanese) is explained by RE: the login screen is a **Win32 dialog
resource** shown via **`DialogBoxParamA` / `CreateDialogIndirectParamA`** (imports at
0x0075be78 / 0x0075cb3c). Its button/label captions live in the EXE **`.rsrc` dialog
templates**, which the `String.txt`/`MsgDat` Korean localization never touched — and
the `hangeulmenu` mode flag (`FUN_00641b90`) does not re-caption a Win32 dialog
template. So content (String.txt) is Korean, but the dialog-resource menu stays JP.

**Fix the login/menu to Korean:**
1. Enumerate the dialog templates in `G7MTClient.exe` `.rsrc` (Resource Hacker /
   `pefile`/`pywin32`); find the login dialog + any menu resources.
2. **Translate the Japanese control captions → Korean (cp949)** in the dialog
   template, and set the template's **font charset to HANGEUL_CHARSET** (the
   `DS_SETFONT` font field) so the captions render Hangul, or point it at a Korean
   font face (§4).
3. Re-inject the edited resource (Resource Hacker `-addoverwrite`, or a `.rsrc`
   patcher) and re-checksum. Track as a `tools/client_patches/` resource step (resource
   edit, not a code byte patch) wired into `tools/logh7_build_playable_client.py`.
4. **verify-later:** confirm the relocated/resized captions fit the dialog control
   rects (Korean strings differ in width) and that the dialog font renders Hangul.

> Scope: this is the LOGIN/launcher dialog layer. In-world UI text is the
> String.txt/MsgDat (cp949) layer (§3) — both must be Korean for a fully-localized
> menu+content experience.

### 7a. 구현된 .rsrc 패처 + 빌드 배선 설계 (2026-06-19, WF-2)

§7 3단계의 ".rsrc 패처" 경로는 이제 `tools/logh7_rsrc_patch.py`로 구현되어 있다(Resource
Hacker 불필요, 순수 파이썬 PE 파서). 동작·검증·배선 설계 요약:

**패처 동작.** `.rsrc` 섹션을 통째로 파싱(디렉터리 트리 + MENU/DIALOG/STRING 블롭 안의
인라인 문자열)→`va_off`로 한국어 스왑→**전 섹션 재직렬화**(데이터 RVA·크기·섹션헤더
VirtualSize/SizeOfRawData·SizeOfImage·Resource 데이터디렉터리 Size 재계산). PE32 리소스
문자열은 프로세스 ANSI 코드페이지가 아니라 **UTF-16LE**로 저장되므로, 머신 ACP와 무관하게
한국어가 정상 렌더된다(인게임 String.txt cp949 경로와 분리). `.rsrc`가 파일의 **마지막
섹션**이라 문자열이 길어져 섹션이 커져도 뒤따르는 섹션 재배치 없이 파일만 늘어난다.

**슬롯 모델 주의(va_off 페어링의 핵심).** 패처가 노출하는 패치 슬롯은 **143개**이며, 그
`va_off`는 `python tools/logh7_rsrc_patch.py dump`가 권위(authoritative)다. 이 값은
`hardcoded-ui-ja.json`(= `logh7_binary_strings.py` 산출, 별도 파서)의 일부 va_off와
**다르다**:
- 메뉴/다이얼로그 필드는 binary-strings 오프셋이 패처 슬롯보다 2~4B 앞선다(헤더/접두 바이트
  포함). 예: ja `3945824 ｱﾌﾟﾘｹｰｼｮﾝの終了(&X)` → 패처 슬롯 `3945828`. (audit가 지적한
  "ja↔ko 4바이트 어긋남"의 실체.)
- MFC 문자열테이블은 16엔트리 블록 단위이고, 패처는 **블록 첫 엔트리를 하나의 `\n`-결합
  슬롯**으로 본다. 그래서 ja.json이 `3950618 新規にﾌｧｲﾙを作成` / `3950640 新規ﾌｧｲﾙ`처럼
  별도 오프셋으로 나눠 둔 프래그먼트들이 패처에는 **단일 슬롯 `3950618 "…\n新規ﾌｧｲﾙ"`**로
  보인다. 따라서 ko는 프래그먼트별이 아니라 **`\n`-결합 문자열 전체**로 채워야 한 번의 스왑에
  모든 프래그먼트가 번역된다.

→ 그래서 `hardcoded-ui-ko.json`의 키는 ja.json이 아니라 **패처 슬롯(dump) 기준**으로 정렬했다.
현재 133개 슬롯 번역 + 10개 비대상(null). 비대상=폰트 face(ＭＳ Ｐゴシック/MS Shell Dlg)·
버전/저작권·상태바 ASCII 토글(EXT/CAP/NUM/SCRL)·일어 IME 토글(ｶﾅ)·MFC 문서템플릿/OLE
ProgID 등록 문자열(`G7MTClient.Document` 등 — 표시 텍스트가 아니라 등록 식별자라 손대면
등록 깨짐). `%1/%2/%s`·`(&X)` 등 토큰은 위치 유지하며 보존.

**드라이런 검증(라이브 아님).** `python tools/logh7_rsrc_patch.py patch --out <tmp> --map
content/localization/hardcoded-ui-ko.json` → `applied=133, verifiedPresent=133,
verifyOk=true`. selftest(무편집 라운드트립) `treeRoundTrip=true, blobStringRoundTrip=true`.
즉 데이터·인코딩·재직렬화는 모두 통과. **단, 실제 클라에서 한국어 캡션이 다이얼로그 컨트롤
rect에 들어맞는지·다이얼로그 폰트가 한글을 렌더하는지는 라이브 검증 필요**(§7 4단계,
needsLive).

**빌드스택 배선 설계(미적용 — 데이터/설계까지만).** `tools/logh7_build_playable_client.py`는
**동일길이 바이트패치 스택**(`apply_byte_patches`, 드리프트 검증 사이트)만 적용하고 파일
크기를 보존한다. .rsrc 패치는 **섹션 재직렬화(파일이 커질 수 있음)**라 `client_patches/*.json`
바이트 사이트로 표현 불가 → 별도 **최종 변환 스테이지**로 배선해야 한다. 권장:

1. `build()`에 옵트인 인자 `--localize-rsrc`(기본 OFF) 추가.
2. 바이트패치 스택을 `tmp`에 모두 적용한 **뒤**, 마지막에 `logh7_rsrc_patch`의 apply 경로를
   호출(같은 프로세스 import 또는 서브프로세스):
   `logh7_rsrc_patch.cmd_patch(exe=tmp, out=tmp, map_path=DEFAULT_MAP)`
   — 이 단계는 자체적으로 재파싱+`verifyOk` 검증을 수행하므로, `verifyOk=false`면 빌드 실패시킨다.
3. 매니페스트에 `"rsrcLocalized": true` + 적용 건수/파일크기 변화를 기록(현 `applied_all`과
   별도 키). `.rsrc` 변환은 드리프트 사이트가 아니므로 base SHA 드리프트체크 대상에서 제외.
4. 순서 주의: .rsrc 재직렬화가 파일 끝 오프셋을 바꾸므로 **바이트패치(.text 등 앞쪽 섹션)
   다음**에 와야 한다. .text/.data 오프셋은 .rsrc 앞이라 영향 없음(검증: 패치 후 selftest 통과).
5. 폰트 face 패치(§4, `0x77402c` 단일 전역)와는 독립 — face 패치는 바이트패치 스택,
   .rsrc 캡션은 이 스테이지. 둘 다 켜면 메뉴 캡션=한글 + 한글 렌더 폰트로 완성.

> ⚠️ 실제 EXE 패치 적용·배포는 라이브 큐(logh7-live)에서: stop→start→스플래시 ~30초 대기→
> 로그인/메뉴 캡션 한글 노출 + 컨트롤 rect 맞음 + 폰트 한글 렌더 확인. 본 트랙은 데이터(ko.json)
> + 패처 배선 설계까지만 마감한다(무모한 바이트패치 금지 원칙).

## 8. "What cp949 fonts even exist?" — two corrections + the real mod

**Correction 1 — the font is NOT limited by cp949.** `HANGEUL_CHARSET` + `CreateFontA`
works with **ANY modern Korean-covering TTF** (Pretendard, Noto Sans KR / 본고딕,
NanumGothic/나눔, Malgun Gothic/맑은 고딕, Spoqa Han Sans…). GDI converts the cp949
bytes → Unicode codepoints → the chosen font's glyphs; the font only needs Korean
coverage, which every modern Korean font has. So "boring" is purely the hardcoded
`"MS UI Gothic"` face (§4), not the encoding — swap the face to a modern font and it
looks modern **with cp949 unchanged**.

**Correction 2 — cp949 (UHC) covers ALL 11,172 modern Hangul syllables**, plus
KS X 1001 symbols. Nothing modern-Korean is missing; only old Hangul / emoji /
CJK-ext are out (the game needs none). So cp949 is not a quality ceiling for Korean.

**The real engine mod (개조) for full Unicode + UTF-8 + any font — a TEXT-SHIM DLL.**
To escape the ANSI layer entirely, inject a DLL that **hooks the 5 ANSI text imports
and re-routes them to the Unicode-W equivalents**:

- Hook `CreateFontA` → build a `CreateFontW` `LOGFONTW` with our **modern face**
  (`lfFaceName`), `DEFAULT_CHARSET`, `CLEARTYPE_QUALITY`.
- Hook `TextOutA` / `ExtTextOutA` / `DrawTextA` / `TabbedTextOutA` → decode the
  incoming bytes with `MultiByteToWideChar` (we pick the codepage: **UTF-8 (65001)**
  if we ship UTF-8 String.txt, or cp949 (949) to keep current data) and call the
  matching `*W` function.

Result: **any TTF face, ClearType, full Unicode, and free choice of UTF-8 or cp949
source** — without touching the EXE's code bytes (only its import behaviour at load).

Injection vectors (pick one):
- **Proxy DLL** the EXE already loads — e.g. ship our shim as a `version.dll` /
  `winmm.dll` proxy in the exe dir (DLL-search-order load), which IAT-hooks GDI32/
  USER32 text imports then forwards the real exports.
- **Extend the already-deployed `dgVoodoo` `D3D8.dll`** load path with a companion
  shim (a second DLL it/we load), so no new proxy is needed.
- IAT patch of the known import slots (TextOutA @IAT, ExtTextOutA, DrawTextA,
  TabbedTextOutA, CreateFontA) at startup.

This is the recommended "개조" if you want UTF-8 + arbitrary fonts; otherwise the
§4 face-swap (cp949-compatible, zero new DLL) already gives a modern look. Build:
`tools/logh7_text_shim/` (the shim DLL) + a bundled TTF; document the chosen
codepage. **verify-later:** confirm the game passes whole strings (not per-glyph) to
the text APIs so the multibyte decode has full context (LOGH draws via DrawTextAll()).

## 9. Unified JP/KR client — "swap text only" (the goal)

Target: **one binary** where the Japanese and Korean versions differ ONLY by a
swappable text pack — no per-language byte patches, no per-language font/charset.
The §8 text-shim DLL makes this clean:

**Architecture (one binary + shim + one CJK font + UTF-8 text packs):**

1. **Encoding = UTF-8 for ALL text** (both JP and KR). The shim decodes every
   `*A` text call with `MultiByteToWideChar(CP_UTF8, …)` → `*W`. JP and KR are then
   both just UTF-8 files — literally interchangeable.
2. **One font covering both languages** — `Noto Sans CJK` / `Source Han Sans`
   (a single family with Japanese kanji+kana AND Korean Hangul; SIL OFL, free to
   bundle). The shim's `CreateFontW` uses it with `DEFAULT_CHARSET` + ClearType, so
   no charset switch per language.
3. **A "language pack" = the swappable text layer only:**
   - `String.txt` (UTF-8)
   - `data/MsgDat/*.dat` (UTF-8 re-encode of the message tables)
   - login/menu **dialog `.rsrc` captions** — either a per-language `.rsrc` overlay
     swapped with the pack, or routed through the shim if the dialog text is drawn
     via the hooked `DrawTextA`/`TextOutA` (verify which; dialog static/button
     captions baked in the template need the `.rsrc` overlay).
4. **Switch language = drop in the other pack** (`lang/ja/` ↔ `lang/ko/`). The EXE,
   shim DLL, and font never change. The `win.ini [windows] kanjimenu`/`hangeulmenu`
   toggles (§2) can select which pack the launcher copies in, or just present the
   chosen pack's files.

**Why this beats the byte-patch path:** the §3/§4 approach (charset 1→0x81, face
swap to a Korean font) hard-codes the client to Korean — JP would then box. The shim
+ UTF-8 + CJK font keeps the binary language-neutral, so JP↔KR is a pure data swap,
exactly "텍스트만 갈면 되게".

**Build:** `tools/logh7_text_shim/` (the hook DLL) + bundled Noto/Source-Han +
`lang/{ja,ko}/{String.txt,MsgDat,dialog.rsrc}` packs + a packaging step that
re-encodes the existing cp932/cp949 tables → UTF-8. Keep our repo content UTF-8
(already the source format) so the packs are produced directly, no cp949 round-trip.

> Fallback without the shim: keep two fully-built clients (JP cp932 / KR cp949 each
> with its own font+charset patch). Works, but it is NOT "swap text only" — it
> duplicates the binary. The shim is what makes a single binary + text-swap possible.

## TL;DR

- Korean already has a **built-in mode** — flip `win.ini [windows] hangeulmenu =
  hangeul`; add the `charset 1→0x81` byte patch + cp949 text if the ACP still boxes.
- **One-binary JP/KR by text-swap (the goal):** §8 shim DLL + UTF-8 everywhere + a
  single CJK font (Noto/Source-Han covers JP+KR) → language = a swappable text pack
  (`lang/ja` ↔ `lang/ko`), EXE/shim/font unchanged (§9).
- **cp949 does NOT limit fonts** — HANGEUL_CHARSET renders any modern Korean TTF, and
  cp949/UHC covers all 11,172 Hangul. "Boring" = the hardcoded "MS UI Gothic" face;
  swap it (§4) for a modern look with cp949 intact.
- **For UTF-8 + any-font freedom (개조):** a **text-shim DLL** that hooks the ANSI
  text APIs → Unicode-W (§8) — no EXE code patch, full Unicode, choose UTF-8 or cp949.
- The login menu is a **Win32 dialog resource** (DialogBoxParamA) — translate its
  `.rsrc` captions + set a Hangul/Unicode font, separately from String.txt (§7).
- The font is a **GDI system font ("MS UI Gothic")**, so "boring/old" is fixed by a
  **face-name swap to a modern bundled font + quality 4→5 (ClearType)** — no bitmap
  glyph work. Byte patches are at the `CreateFontA` site (0x004aec70) and the face
  string (0x77402c) / its setter (`FUN_004ea180`).

---

## Pretendard 배포 번들링 (확정 — 2026-06-19)

전역 face = **Pretendard**(현대적 한글 UI 폰트, OFL, 사용자 선택). `tools/client_patches/font-face.json`이
face명을 `Pretendard`로 패치(16B 슬롯 @0x77402c, 10자+NUL6). HANGEUL_CHARSET는 양쪽 CreateFontA가 이미
전달하므로 charset 패치 불필요.

**핵심 제약 — 시스템 설치 필요**: 클라는 GDI `CreateFontA`로 face를 **시스템에서 조회**하고
`AddFontResourceEx`로 앱-로컬 폰트를 등록하지 않는다. 따라서 Pretendard가 시스템/사용자 폰트로 설치돼
있어야 한다. 미설치 시 GDI가 시스템 기본 한글폰트로 폴백(현대적 인상 상실).

**배포 절차(이미지-프리 zip 원칙 유지):**
1. **빌드시 TTF 취득**: Pretendard는 OFL 라이선스라 재배포 가능. 공식 릴리스
   (github.com/orioncactus/pretendard `Pretendard-Regular.ttf` 등)에서 받아 배포물 `fonts\`에 동봉.
   (저장소엔 바이너리를 커밋하지 않음 — LFS 아티팩트 원칙과 동일하게 빌드 입력으로 취득.)
2. **per-user 설치 스크립트**: `tools/packaging/install-pretendard.ps1` — `%LOCALAPPDATA%\Microsoft\Windows\Fonts`
   복사 + `HKCU\...\Fonts` 등록(Win10 1809+ 관리자 불필요, 멱등). 런처/최초 실행에서 1회 호출.
3. **OFL 라이선스 동봉**: `fonts\OFL.txt`(Pretendard 라이선스) 포함.

⚠️ needsLive: 빌드 후 `logh7_build_playable_client`로 face 패치 적용 → 폰트 설치 → 인클라에서 Pretendard로
한글이 렌더되는지 라이브 확인(GDI HANGEUL_CHARSET face 해석 검증). 관련: [[logh7-font-pretendard]].

### 2026-06-20 status update

- `font-face` is now part of the default playable EXE stack.
- `font-cleartype` is also part of the default playable EXE stack. It changes the two RE-confirmed
  `CreateFontA` quality pushes from `ANTIALIASED_QUALITY` (`push 4`) to `CLEARTYPE_QUALITY` (`push 5`),
  so the patched face no longer keeps the old small-GDI rendering profile.
- `tools/logh7_ui_explorer.py start` registers the packaged Pretendard fonts before launching the client, using
  `.omo/work/logh7-installed/tools/packaging/install-pretendard.ps1` when available.
- GDI face matching on the test host resolved `Pretendard -> Pretendard`; `Pretendard JP` did not resolve under
  `HANGEUL_CHARSET`, so the executable face remains `Pretendard` while JP/Std are still bundled for distribution.
- Latest canonical playable SHA256:
  `15ed8a35ea3891374096b25d43878e74a6abbf97242b32ecf357ca4c577768e0`.
