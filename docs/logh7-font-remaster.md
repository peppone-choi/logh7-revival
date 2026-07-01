# LOGH VII ??Font & Korean Text (RE + remaster plan)

Read-only RE result; every claim cited to `.omo/ghidra/export/G7MTClient/`
(query `python tools/logh7_redex.py func 0x<addr>`). The text pipeline is **GDI
`CreateFontA`** ??a runtime *system* font, NOT a baked bitmap font ??so the look
is changed by swapping the face name + charset + quality, with no glyph re-authoring.

## Current display-quality note (2026-06-28)

- Current canonical font patches already target Pretendard in the primary GDI face slot and D3D atlas face slot, with Hangul charset and ClearType/antialias behavior patched.
- The latest non-live audit treats remaining blurry UI/text as a display-presentation problem first, not as proof that Pretendard failed to load.
- Windowed launcher/harness runs must use dgVoodoo `ScalingMode=centered` and `Resampling=pointsampled`; older `stretched` + `lanczos-3` windowed configs can blur 2D panels and font edges before the font patch itself is evaluated.
- Fresh visual proof is still required from the real canonical game EXE after Windows Application Control permits launch again.

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
- **Face name = "MS UI Gothic"** ??hardcoded string `s_MS_UI_Gothic` @ **0x0077402c**
  (12 chars + NUL = 13 bytes). Set in **`FUN_004ea180` @0x004ea180**:
  `FUN_004aec10(s_MS_UI_Gothic_0077402c, 0xc /*size 12*/, 1)`.
- **Charset = 1 (DEFAULT_CHARSET).** On a non-Korean ACP this can box Hangul; the
  recovered localization patches this byte to `0x81` (HANGEUL_CHARSET). See [[logh7-font-localization]].
- **Quality = 4 (ANTIALIASED_QUALITY)** ??already smoothed, but pre-ClearType.

## 2. Built-in Korean mode (major find ??config, NO patch)

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
> mode). If it does not, apply the 짠3 charset patch alongside the toggle.

## 3. Korean text ??make Hangul render reliably

1. **`win.ini [windows] hangeulmenu = hangeul`** (built-in mode, 짠2).
2. **`String.txt` / MsgDat in cp949** (already recovered ??[[logh7-font-localization]],
   [[logh7-localization-cp932-wall]]).
3. **Charset patch (if needed):** `FUN_004aec70` CreateFontA arg9 `1` ??`0x81`
   (HANGEUL_CHARSET) so Hangul renders regardless of system ACP. Single-byte imm.
4. Locale belt-and-suspenders: run under ko-KR app-locale / embedded manifest so
   `DEFAULT_CHARSET` resolves Korean even unpatched (per the cp932-wall note: this
   machine's ACP is UTF-8, which is the real boxing cause, not the EXE).

## 4. "Too plain / old format" ??upgrade the font (non-invasive)

Because text is a runtime GDI system font, the look upgrades by **changing the face
name to a modern/styled font** ??no glyph atlas work:

- **In-place face swap (??2 chars):** overwrite `s_MS_UI_Gothic` @0x0077402c with a
  short face name (e.g. `留묒? 怨좊뵓` in cp949 ??7 bytes, `Gulim`, `Batang`, or a
  bundled custom font given a ??2-char name). Pad remaining bytes with NUL.
- **Repoint for a longer name:** patch the string pointer in the
  `FUN_004aec10(0x77402c, 0xc, 1)` call (`FUN_004ea180`) to a new face string placed
  in a code cave (`"Malgun Gothic"`, `"NanumGothic"`, a sci-fi display face, etc.).
- **Bundle the font** so it exists without a manual install: register the `.ttf`
  with `AddFontResourceExA(path, FR_PRIVATE, 0)` at startup. The client does not
  call it today, so options: (a) ship the font and system-install it via the
  launcher/setup, or (b) add a tiny startup font-loader patch / a wrapper DLL that
  registers the private font before `CreateFontA`.
- **Crisper text:** `FUN_004aec70` CreateFontA arg12 quality `4` (ANTIALIASED) ??
  `5` (CLEARTYPE_QUALITY) for modern sub-pixel smoothing. Single-byte imm.
- A weightier/larger face: the CFont size (`0xc`=12 in `FUN_004ea180`) and the
  weight bit (param+0x54) are also patchable for a bolder look.

## 5. Build plan (follow-up)

- `tools/client_patches/font-upgrade.json` descriptor: charset `1??x81`
  (0x004aec70 site), quality `4??` (same site), face-name swap (0x77402c in-place or
  the `FUN_004ea180` pointer repoint to a cave). Wire via
  `tools/logh7_build_playable_client.py`. **Byte-exact `originalHex/patchedHex` to be
  dumped from the call-site disasm before applying; live-verify the glyphs.**
- Config side (no patch): set `win.ini [windows] hangeulmenu = hangeul`; ship the
  chosen modern Korean `.ttf`; register it (private font) at launch.
- Choose a face that fits LOGH's sci-fi tone (clean geometric sans / display face)
  while covering KS X 1001 Hangul (e.g. Noto Sans KR / Pretendard / a licensed
  display font) ??license-check before bundling.

## 6. Encoding ??cp949 vs UTF (RE verdict: the engine is ANSI, so cp949)

The client imports **only ANSI text APIs** ??`TextOutA`, `ExtTextOutA`, `DrawTextA`,
`TabbedTextOutA`, `GetGlyphOutlineA`, `CreateFontA` (GDI32/USER32 import table).
**There is NO `TextOutW`/`DrawTextW`/`CreateFontW`** anywhere. So every glyph is
drawn by a **codepage-based ANSI** call: the bytes are interpreted by the font's
charset codepage.

- With **HANGEUL_CHARSET** (the charset you need so GDI picks a Korean font), the
  ANSI text functions interpret bytes as **cp949 (EUC-KR / KS X 1001)**. Feeding
  **UTF-8 bytes would mojibake** ??they are not cp949.
- So the game's on-disk/in-memory strings (String.txt, MsgDat) **must be cp949**.
  This is not a preference over UTF ??it is forced by the ANSI engine.
- **UTF-8 is still the right SOURCE/authoring format** in this repo: keep content in
  UTF-8 and convert ??cp949 at the packaging step (the existing localization
  pipeline). UTF-8 in the repo, cp949 in the shipped files.
- A genuine **UTF runtime** would require converting the whole text layer to Unicode
  (`CreateFontW` + `TextOutW`/`DrawTextW` + UTF-16), i.e. hooking/patching every ANSI
  text call (a large invasive change) or a shim DLL that re-routes the A-calls to W
  with a UTF-8?뭊TF-16 decode. Since **cp949 already covers all modern Hangul**, UTF
  buys only non-Korean glyphs (emoji/CJK-ext) the game never uses ??not worth the
  rewrite. (A UTF-8 *ACP* manifest, codepage 65001, does NOT help here: HANGEUL_CHARSET
  forces the cp949 codepage regardless of ACP, and GDI's UTF-8-ACP ANSI text path is
  unreliable.)

**Verdict:** cp949 for the game files (engine-forced); UTF-8 for our sources. Don't
ship UTF-8 to the ANSI engine.

## 7. Login menu still Japanese ??it is a Win32 DIALOG RESOURCE, not String.txt

The user's symptom ("?댁슜? ?쒓??몃뜲 硫붾돱媛 ?쇱뼱" ??in-game CONTENT is Korean but the
login MENU is Japanese) is explained by RE: the login screen is a **Win32 dialog
resource** shown via **`DialogBoxParamA` / `CreateDialogIndirectParamA`** (imports at
0x0075be78 / 0x0075cb3c). Its button/label captions live in the EXE **`.rsrc` dialog
templates**, which the `String.txt`/`MsgDat` Korean localization never touched ??and
the `hangeulmenu` mode flag (`FUN_00641b90`) does not re-caption a Win32 dialog
template. So content (String.txt) is Korean, but the dialog-resource menu stays JP.

**Fix the login/menu to Korean:**
1. Enumerate the dialog templates in `G7MTClient.exe` `.rsrc` (Resource Hacker /
   `pefile`/`pywin32`); find the login dialog + any menu resources.
2. **Translate the Japanese control captions ??Korean (cp949)** in the dialog
   template, and set the template's **font charset to HANGEUL_CHARSET** (the
   `DS_SETFONT` font field) so the captions render Hangul, or point it at a Korean
   font face (짠4).
3. Re-inject the edited resource (Resource Hacker `-addoverwrite`, or a `.rsrc`
   patcher) and re-checksum. Track as a `tools/client_patches/` resource step (resource
   edit, not a code byte patch) wired into `tools/logh7_build_playable_client.py`.
4. **verify-later:** confirm the relocated/resized captions fit the dialog control
   rects (Korean strings differ in width) and that the dialog font renders Hangul.

> Scope: this is the LOGIN/launcher dialog layer. In-world UI text is the
> String.txt/MsgDat (cp949) layer (짠3) ??both must be Korean for a fully-localized
> menu+content experience.

### 7a. 援ы쁽??.rsrc ?⑥쿂 + 鍮뚮뱶 諛곗꽑 ?ㅺ퀎 (2026-06-19, WF-2)

짠7 3?④퀎??".rsrc ?⑥쿂" 寃쎈줈???댁젣 `tools/logh7_rsrc_patch.py`濡?援ы쁽?섏뼱 ?덈떎(Resource
Hacker 遺덊븘?? ?쒖닔 ?뚯씠??PE ?뚯꽌). ?숈옉쨌寃利씲룸같???ㅺ퀎 ?붿빟:

**?⑥쿂 ?숈옉.** `.rsrc` ?뱀뀡???듭㎏濡??뚯떛(?붾젆?곕━ ?몃━ + MENU/DIALOG/STRING 釉붾∼ ?덉쓽
?몃씪??臾몄옄????va_off`濡??쒓뎅???ㅼ솑??*???뱀뀡 ?ъ쭅?ы솕**(?곗씠??RVA쨌?ш린쨌?뱀뀡?ㅻ뜑
VirtualSize/SizeOfRawData쨌SizeOfImage쨌Resource ?곗씠?곕뵒?됲꽣由?Size ?ш퀎??. PE32 由ъ냼??
臾몄옄?댁? ?꾨줈?몄뒪 ANSI 肄붾뱶?섏씠吏媛 ?꾨땲??**UTF-16LE**濡???λ릺誘濡? 癒몄떊 ACP? 臾닿??섍쾶
?쒓뎅?닿? ?뺤긽 ?뚮뜑?쒕떎(?멸쾶??String.txt cp949 寃쎈줈? 遺꾨━). `.rsrc`媛 ?뚯씪??**留덉?留?
?뱀뀡**?대씪 臾몄옄?댁씠 湲몄뼱???뱀뀡??而ㅼ졇???ㅻ뵲瑜대뒗 ?뱀뀡 ?щ같移??놁씠 ?뚯씪留??섏뼱?쒕떎.

**?щ’ 紐⑤뜽 二쇱쓽(va_off ?섏뼱留곸쓽 ?듭떖).** ?⑥쿂媛 ?몄텧?섎뒗 ?⑥튂 ?щ’? **143媛?*?대ŉ, 洹?
`va_off`??`python tools/logh7_rsrc_patch.py dump`媛 沅뚯쐞(authoritative)?? ??媛믪?
`hardcoded-ui-ja.json`(= `logh7_binary_strings.py` ?곗텧, 蹂꾨룄 ?뚯꽌)???쇰? va_off?
**?ㅻⅤ??*:
- 硫붾돱/?ㅼ씠?쇰줈洹??꾨뱶??binary-strings ?ㅽ봽?뗭씠 ?⑥쿂 ?щ’蹂대떎 2~4B ?욎꽑???ㅻ뜑/?묐몢 諛붿씠??
  ?ы븿). ?? ja `3945824 節깍풄絶잞풕節뱄쉼節쇽쉰絶앫겗永귚틙(&X)` ???⑥쿂 ?щ’ `3945828`. (audit媛 吏?곹븳
  "ja?봩o 4諛붿씠???닿툔?????ㅼ껜.)
- MFC 臾몄옄?댄뀒?대툝? 16?뷀듃由?釉붾줉 ?⑥쐞?닿퀬, ?⑥쿂??**釉붾줉 泥??뷀듃由щ? ?섎굹??`\n`-寃고빀
  ?щ’**?쇰줈 蹂몃떎. 洹몃옒??ja.json??`3950618 ?계쫸?ワ풄節㏆쉿絶쇻굮鵝쒏닇` / `3950640 ?계쫸絶뚳쉑節뀐풖`泥섎읆
  蹂꾨룄 ?ㅽ봽?뗭쑝濡??섎닠 ???꾨옒洹몃㉫?몃뱾???⑥쿂?먮뒗 **?⑥씪 ?щ’ `3950618 "??n?계쫸絶뚳쉑節뀐풖"`**濡?
  蹂댁씤?? ?곕씪??ko???꾨옒洹몃㉫?몃퀎???꾨땲??**`\n`-寃고빀 臾몄옄???꾩껜**濡?梨꾩썙????踰덉쓽 ?ㅼ솑??
  紐⑤뱺 ?꾨옒洹몃㉫?멸? 踰덉뿭?쒕떎.

??洹몃옒??`hardcoded-ui-ko.json`???ㅻ뒗 ja.json???꾨땲??**?⑥쿂 ?щ’(dump) 湲곗?**?쇰줈 ?뺣젹?덈떎.
?꾩옱 133媛??щ’ 踰덉뿭 + 10媛?鍮꾨???null). 鍮꾨????고듃 face(竊?설 竊겹궡?룔긿??MS Shell Dlg)쨌
踰꾩쟾/??묎텒쨌?곹깭諛?ASCII ?좉?(EXT/CAP/NUM/SCRL)쨌?쇱뼱 IME ?좉?(節띰푷)쨌MFC 臾몄꽌?쒗뵆由?OLE
ProgID ?깅줉 臾몄옄??`G7MTClient.Document` ?????쒖떆 ?띿뒪?멸? ?꾨땲???깅줉 ?앸퀎?먮씪 ?먮?硫?
?깅줉 源⑥쭚). `%1/%2/%s`쨌`(&X)` ???좏겙? ?꾩튂 ?좎??섎ŉ 蹂댁〈.

**?쒕씪?대윴 寃利??쇱씠釉??꾨떂).** `python tools/logh7_rsrc_patch.py patch --out <tmp> --map
content/localization/hardcoded-ui-ko.json` ??`applied=133, verifiedPresent=133,
verifyOk=true`. selftest(臾댄렪吏??쇱슫?쒗듃由? `treeRoundTrip=true, blobStringRoundTrip=true`.
利??곗씠?걔룹씤肄붾뵫쨌?ъ쭅?ы솕??紐⑤몢 ?듦낵. **?? ?ㅼ젣 ?대씪?먯꽌 ?쒓뎅??罹≪뀡???ㅼ씠?쇰줈洹?而⑦듃濡?
rect???ㅼ뼱留욌뒗吏쨌?ㅼ씠?쇰줈洹??고듃媛 ?쒓????뚮뜑?섎뒗吏???쇱씠釉?寃利??꾩슂**(짠7 4?④퀎,
needsLive).

**鍮뚮뱶?ㅽ깮 諛곗꽑 ?ㅺ퀎(誘몄쟻?????곗씠???ㅺ퀎源뚯?留?.** `tools/logh7_build_playable_client.py`??
**?숈씪湲몄씠 諛붿씠?명뙣移??ㅽ깮**(`apply_byte_patches`, ?쒕━?꾪듃 寃利??ъ씠??留??곸슜?섍퀬 ?뚯씪
?ш린瑜?蹂댁〈?쒕떎. .rsrc ?⑥튂??**?뱀뀡 ?ъ쭅?ы솕(?뚯씪??而ㅼ쭏 ???덉쓬)**??`client_patches/*.json`
諛붿씠???ъ씠?몃줈 ?쒗쁽 遺덇? ??蹂꾨룄 **理쒖쥌 蹂???ㅽ뀒?댁?**濡?諛곗꽑?댁빞 ?쒕떎. 沅뚯옣:

1. `build()`???듯듃???몄옄 `--localize-rsrc`(湲곕낯 OFF) 異붽?.
2. 諛붿씠?명뙣移??ㅽ깮??`tmp`??紐⑤몢 ?곸슜??**??*, 留덉?留됱뿉 `logh7_rsrc_patch`??apply 寃쎈줈瑜?
   ?몄텧(媛숈? ?꾨줈?몄뒪 import ?먮뒗 ?쒕툕?꾨줈?몄뒪):
   `logh7_rsrc_patch.cmd_patch(exe=tmp, out=tmp, map_path=DEFAULT_MAP)`
   ?????④퀎???먯껜?곸쑝濡??ы뙆??`verifyOk` 寃利앹쓣 ?섑뻾?섎?濡? `verifyOk=false`硫?鍮뚮뱶 ?ㅽ뙣?쒗궓??
3. 留ㅻ땲?섏뒪?몄뿉 `"rsrcLocalized": true` + ?곸슜 嫄댁닔/?뚯씪?ш린 蹂?붾? 湲곕줉(??`applied_all`怨?
   蹂꾨룄 ??. `.rsrc` 蹂?섏? ?쒕━?꾪듃 ?ъ씠?멸? ?꾨땲誘濡?base SHA ?쒕━?꾪듃泥댄겕 ??곸뿉???쒖쇅.
4. ?쒖꽌 二쇱쓽: .rsrc ?ъ쭅?ы솕媛 ?뚯씪 ???ㅽ봽?뗭쓣 諛붽씀誘濡?**諛붿씠?명뙣移?.text ???욎そ ?뱀뀡)
   ?ㅼ쓬**??????쒕떎. .text/.data ?ㅽ봽?뗭? .rsrc ?욎씠???곹뼢 ?놁쓬(寃利? ?⑥튂 ??selftest ?듦낵).
5. ?고듃 face ?⑥튂(짠4, `0x77402c` ?⑥씪 ?꾩뿭)????낅┰ ??face ?⑥튂??諛붿씠?명뙣移??ㅽ깮,
   .rsrc 罹≪뀡? ???ㅽ뀒?댁?. ????耳쒕㈃ 硫붾돱 罹≪뀡=?쒓? + ?쒓? ?뚮뜑 ?고듃濡??꾩꽦.

> ?좑툘 ?ㅼ젣 EXE ?⑥튂 ?곸슜쨌諛고룷???쇱씠釉???logh7-live)?먯꽌: stop?뭩tart?믪뒪?뚮옒??~30珥??湲겸넂
> 濡쒓렇??硫붾돱 罹≪뀡 ?쒓? ?몄텧 + 而⑦듃濡?rect 留욎쓬 + ?고듃 ?쒓? ?뚮뜑 ?뺤씤. 蹂??몃옓? ?곗씠??ko.json)
> + ?⑥쿂 諛곗꽑 ?ㅺ퀎源뚯?留?留덇컧?쒕떎(臾대え??諛붿씠?명뙣移?湲덉? ?먯튃).

## 8. "What cp949 fonts even exist?" ??two corrections + the real mod

**Correction 1 ??the font is NOT limited by cp949.** `HANGEUL_CHARSET` + `CreateFontA`
works with **ANY modern Korean-covering TTF** (Pretendard, Noto Sans KR / 蹂멸퀬??
NanumGothic/?섎닎, Malgun Gothic/留묒? 怨좊뵓, Spoqa Han Sans??. GDI converts the cp949
bytes ??Unicode codepoints ??the chosen font's glyphs; the font only needs Korean
coverage, which every modern Korean font has. So "boring" is purely the hardcoded
`"MS UI Gothic"` face (짠4), not the encoding ??swap the face to a modern font and it
looks modern **with cp949 unchanged**.

**Correction 2 ??cp949 (UHC) covers ALL 11,172 modern Hangul syllables**, plus
KS X 1001 symbols. Nothing modern-Korean is missing; only old Hangul / emoji /
CJK-ext are out (the game needs none). So cp949 is not a quality ceiling for Korean.

**The real engine mod (媛쒖“) for full Unicode + UTF-8 + any font ??a TEXT-SHIM DLL.**
To escape the ANSI layer entirely, inject a DLL that **hooks the 5 ANSI text imports
and re-routes them to the Unicode-W equivalents**:

- Hook `CreateFontA` ??build a `CreateFontW` `LOGFONTW` with our **modern face**
  (`lfFaceName`), `DEFAULT_CHARSET`, `CLEARTYPE_QUALITY`.
- Hook `TextOutA` / `ExtTextOutA` / `DrawTextA` / `TabbedTextOutA` ??decode the
  incoming bytes with `MultiByteToWideChar` (we pick the codepage: **UTF-8 (65001)**
  if we ship UTF-8 String.txt, or cp949 (949) to keep current data) and call the
  matching `*W` function.

Result: **any TTF face, ClearType, full Unicode, and free choice of UTF-8 or cp949
source** ??without touching the EXE's code bytes (only its import behaviour at load).

Injection vectors (pick one):
- **Proxy DLL** the EXE already loads ??e.g. ship our shim as a `version.dll` /
  `winmm.dll` proxy in the exe dir (DLL-search-order load), which IAT-hooks GDI32/
  USER32 text imports then forwards the real exports.
- **Extend the already-deployed `dgVoodoo` `D3D8.dll`** load path with a companion
  shim (a second DLL it/we load), so no new proxy is needed.
- IAT patch of the known import slots (TextOutA @IAT, ExtTextOutA, DrawTextA,
  TabbedTextOutA, CreateFontA) at startup.

This is the recommended "媛쒖“" if you want UTF-8 + arbitrary fonts; otherwise the
짠4 face-swap (cp949-compatible, zero new DLL) already gives a modern look. Build:
`tools/logh7_text_shim/` (the shim DLL) + a bundled TTF; document the chosen
codepage. **verify-later:** confirm the game passes whole strings (not per-glyph) to
the text APIs so the multibyte decode has full context (LOGH draws via DrawTextAll()).

## 9. Unified JP/KR client ??"swap text only" (the goal)

Target: **one binary** where the Japanese and Korean versions differ ONLY by a
swappable text pack ??no per-language byte patches, no per-language font/charset.
The 짠8 text-shim DLL makes this clean:

**Architecture (one binary + shim + one CJK font + UTF-8 text packs):**

1. **Encoding = UTF-8 for ALL text** (both JP and KR). The shim decodes every
   `*A` text call with `MultiByteToWideChar(CP_UTF8, ??` ??`*W`. JP and KR are then
   both just UTF-8 files ??literally interchangeable.
2. **One font covering both languages** ??`Noto Sans CJK` / `Source Han Sans`
   (a single family with Japanese kanji+kana AND Korean Hangul; SIL OFL, free to
   bundle). The shim's `CreateFontW` uses it with `DEFAULT_CHARSET` + ClearType, so
   no charset switch per language.
3. **A "language pack" = the swappable text layer only:**
   - `String.txt` (UTF-8)
   - `data/MsgDat/*.dat` (UTF-8 re-encode of the message tables)
   - login/menu **dialog `.rsrc` captions** ??either a per-language `.rsrc` overlay
     swapped with the pack, or routed through the shim if the dialog text is drawn
     via the hooked `DrawTextA`/`TextOutA` (verify which; dialog static/button
     captions baked in the template need the `.rsrc` overlay).
4. **Switch language = drop in the other pack** (`lang/ja/` ??`lang/ko/`). The EXE,
   shim DLL, and font never change. The `win.ini [windows] kanjimenu`/`hangeulmenu`
   toggles (짠2) can select which pack the launcher copies in, or just present the
   chosen pack's files.

**Why this beats the byte-patch path:** the 짠3/짠4 approach (charset 1??x81, face
swap to a Korean font) hard-codes the client to Korean ??JP would then box. The shim
+ UTF-8 + CJK font keeps the binary language-neutral, so JP?봌R is a pure data swap,
exactly "?띿뒪?몃쭔 媛덈㈃ ?섍쾶".

**Build:** `tools/logh7_text_shim/` (the hook DLL) + bundled Noto/Source-Han +
`lang/{ja,ko}/{String.txt,MsgDat,dialog.rsrc}` packs + a packaging step that
re-encodes the existing cp932/cp949 tables ??UTF-8. Keep our repo content UTF-8
(already the source format) so the packs are produced directly, no cp949 round-trip.

> Fallback without the shim: keep two fully-built clients (JP cp932 / KR cp949 each
> with its own font+charset patch). Works, but it is NOT "swap text only" ??it
> duplicates the binary. The shim is what makes a single binary + text-swap possible.

## TL;DR

- Korean already has a **built-in mode** ??flip `win.ini [windows] hangeulmenu =
  hangeul`; add the `charset 1??x81` byte patch + cp949 text if the ACP still boxes.
- **One-binary JP/KR by text-swap (the goal):** 짠8 shim DLL + UTF-8 everywhere + a
  single CJK font (Noto/Source-Han covers JP+KR) ??language = a swappable text pack
  (`lang/ja` ??`lang/ko`), EXE/shim/font unchanged (짠9).
- **cp949 does NOT limit fonts** ??HANGEUL_CHARSET renders any modern Korean TTF, and
  cp949/UHC covers all 11,172 Hangul. "Boring" = the hardcoded "MS UI Gothic" face;
  swap it (짠4) for a modern look with cp949 intact.
- **For UTF-8 + any-font freedom (媛쒖“):** a **text-shim DLL** that hooks the ANSI
  text APIs ??Unicode-W (짠8) ??no EXE code patch, full Unicode, choose UTF-8 or cp949.
- The login menu is a **Win32 dialog resource** (DialogBoxParamA) ??translate its
  `.rsrc` captions + set a Hangul/Unicode font, separately from String.txt (짠7).
- The font is a **GDI system font ("MS UI Gothic")**, so "boring/old" is fixed by a
  **face-name swap to a modern bundled font + quality 4?? (ClearType)** ??no bitmap
  glyph work. Byte patches are at the `CreateFontA` site (0x004aec70) and the face
  string (0x77402c) / its setter (`FUN_004ea180`).

---

## Pretendard 諛고룷 踰덈뱾留?(?뺤젙 ??2026-06-19)

?꾩뿭 face = **Pretendard**(?꾨????쒓? UI ?고듃, OFL, ?ъ슜???좏깮). `tools/client_patches/font-face.json`??
face紐낆쓣 `Pretendard`濡??⑥튂(16B ?щ’ @0x77402c, 10??NUL6). HANGEUL_CHARSET???묒そ CreateFontA媛 ?대?
?꾨떖?섎?濡?charset ?⑥튂 遺덊븘??

**?듭떖 ?쒖빟 ???쒖뒪???ㅼ튂 ?꾩슂**: ?대씪??GDI `CreateFontA`濡?face瑜?**?쒖뒪?쒖뿉??議고쉶**?섍퀬
`AddFontResourceEx`濡???濡쒖뺄 ?고듃瑜??깅줉?섏? ?딅뒗?? ?곕씪??Pretendard媛 ?쒖뒪???ъ슜???고듃濡??ㅼ튂??
?덉뼱???쒕떎. 誘몄꽕移???GDI媛 ?쒖뒪??湲곕낯 ?쒓??고듃濡??대갚(?꾨????몄긽 ?곸떎).

**諛고룷 ?덉감(?대?吏-?꾨━ zip ?먯튃 ?좎?):**
1. **鍮뚮뱶??TTF 痍⑤뱷**: Pretendard??OFL ?쇱씠?좎뒪???щ같??媛?? 怨듭떇 由대━??
   (github.com/orioncactus/pretendard `Pretendard-Regular.ttf` ???먯꽌 諛쏆븘 諛고룷臾?`fonts\`???숇큺.
   (??μ냼??諛붿씠?덈━瑜?而ㅻ컠?섏? ?딆쓬 ??LFS ?꾪떚?⑺듃 ?먯튃怨??숈씪?섍쾶 鍮뚮뱶 ?낅젰?쇰줈 痍⑤뱷.)
2. **per-user ?ㅼ튂 ?ㅽ겕由쏀듃**: `tools/packaging/install-pretendard.ps1` ??`%LOCALAPPDATA%\Microsoft\Windows\Fonts`
   蹂듭궗 + `HKCU\...\Fonts` ?깅줉(Win10 1809+ 愿由ъ옄 遺덊븘?? 硫깅벑). ?곗쿂/理쒖큹 ?ㅽ뻾?먯꽌 1???몄텧.
3. **OFL ?쇱씠?좎뒪 ?숇큺**: `fonts\OFL.txt`(Pretendard ?쇱씠?좎뒪) ?ы븿.

?좑툘 needsLive: 鍮뚮뱶 ??`logh7_build_playable_client`濡?face ?⑥튂 ?곸슜 ???고듃 ?ㅼ튂 ???명겢?쇱뿉??Pretendard濡?
?쒓????뚮뜑?섎뒗吏 ?쇱씠釉??뺤씤(GDI HANGEUL_CHARSET face ?댁꽍 寃利?. 愿?? [[logh7-font-pretendard]].

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

### 2026-06-27 correction ??two face slots, live-proven

The old "one global font face" summary was incomplete. The client has at least two
RE-confirmed GDI face inputs:

- **Primary UI face**: `VA 0x0077402c / file 0x0037402c`, patched by
  `tools/client_patches/font-face.json` to `Pretendard`.
- **D3D glyph atlas face**: `VA 0x0076e240 / file 0x0036e240`. The previous Korean
  base still contained CP949 `援대┝` bytes (`b1 bc b8 b2 00...`). `FUN_004b07c0` copies
  this slot into the atlas object, and `FUN_004b0960` passes that copied face to
  `CreateFontA`.

The default playable stack now includes **`font-face` + `font-atlas-face` +
`font-cleartype`**. `font-atlas-face` is a data-slot patch, not a code-pointer patch:
it changes only `0x0076e240` to `Pretendard`, leaving the instruction
`bf 40 e2 76 00` intact.

Live GDI watcher evidence:

- EXE: `.omo/work/logh7-installed/exe/G7MTClient.exe`
- SHA256: `a7f4f80ff334cf01b81df1f5cfe75366f480400d373355e6631be01bb038f5a8`
- Log: `.omo/ui-explorer/font-gdi-after-atlas-20260627/gdi-font-spawn.jsonl`
- `AddFontResourceExW`: attempted/ok, 57 font files found, 135 faces loaded
- `font-created`: 31/31 face=`Pretendard`, no `援대┝` face hex observed
- Primary UI callstack included `0x4aee13`; atlas callstack included `0x4b0bbd`

So the remaining "blur" report after this patch should be treated as a display-mode
or dgVoodoo scaling/filter issue unless a fresh watcher proves mixed GDI faces again.
Use the same `a7f4f80f...` EXE for windowed/fullscreen/borderless A/B.

### 2026-06-28 previous canonical 98ca recheck

Fresh read-only GDI watcher evidence on the then-current canonical playable build:

- EXE: `.omo/work/logh7-installed/exe/G7MTClient.exe`
- SHA256: `98ca4acd2ec86b657e75b28623bf753029a83d116b052c54ba6e45d4f7952afc`
- Log: `.omo/ui-explorer/font-gdi-spawn-98ca-20260628/gdi-font.jsonl`
- Launch mode: `logh7_gdi_font_watch.py --spawn-exe`, with bundled Pretendard registration before resume
- `AddFontResourceExW`: attempted/OK, 57 font files found, 135 faces loaded
- `font-created`: 31/31 face=`Pretendard`
- `ExtTextOutA`: 125/125 current face=`Pretendard`
- Observed primary UI font: height `14`, quality `5` (`CLEARTYPE_QUALITY`), charset `-127` (`HANGEUL_CHARSET`)

Conclusion: on canonical 98ca, the "font is not Pretendard" hypothesis is currently false. Remaining visual issues are size/layout/display-mode problems unless a future watcher catches a non-Pretendard text path.

### 2026-06-28 atlas ClearType correction

The user's "outline / hollow center" description is now explained more narrowly than
the earlier generic size/display-mode note.

- `FUN_004aec70` is the primary UI font path. It uses the primary face slot and can
  keep `CLEARTYPE_QUALITY` because it renders into the primary 32bpp font atlas.
- `FUN_004b0960` is the dynamic D3D glyph-atlas path. It creates a **16bpp** DIB,
  draws text with `ExtTextOutA`, then converts pixels into texture alpha by taking
  the high nibble of the first byte (`byte >> 4`). This old conversion discards most
  of ClearType's subpixel information.
- Canonical 98ca currently has both paths patched to quality `5`: primary file
  `0x000aeddc = 6a05`, atlas file `0x000b0b91 = 6a05`.
- Non-live GDI reproduction tool: `RE/tools/logh7_font_raster_compare.py`.
  Outputs under `.omo/font-raster-compare-20260628*` show `Pretendard 14 q5 w400`
  in the atlas path has only about `393-430/1000` solid-alpha pixels, while
  `Pretendard 14 q4`, `Pretendard 16 q4`, and `Gulim 14 q4` produce solid
  `1000/1000` alpha after the same LOGH extraction.

Patch candidate: `RE/tools/client_patches/font-atlas-antialias.json`, applied after
`font-cleartype`, changes only atlas `0x004b0b91` from `6a05` to `6a04`. It leaves
the primary UI ClearType path intact. A candidate EXE built as
`G7MTClient.font-atlas-antialias.exe` (`b11c6ad3...`) byte-verifies but direct launch
is blocked by Windows `WinError 4551`, so the next test path should be a runtime
Frida patch on the canonical 98ca process. Live verification is intentionally
deferred until the end.

2026-06-28 runtime safety update: the Frida runtime-patch path now requires the
descriptor `originalHex` guard, preflights every site before writing, emits
`beforeOk`/`wrote`/`preflightOk`, and writes nothing if any canonical byte check
fails. Non-live verification: `tools.tests.test_logh7_ui_explorer` passes 24/24.

### 2026-06-28 canonical 79142d12 promotion

Live runtime verification on the real installed game EXE showed the atlas-antialias
candidate fixed the hollow/outline glyph symptom well enough to promote it into the
default playable stack. The user then requested larger text, so the default font size
patch was raised from 14px-ish to the already RE-documented 16px-ish candidate.
On 2026-06-30 the user reported that this was still too small, so the
default `font-readable-size` patch was raised again to an 18px-ish candidate.

- New canonical playable SHA256: `e0b3fcf29adf799005ce28ede165a9344807e042a3197618852dbc733770c54c`
- Default stack includes `font-atlas-antialias` after `font-cleartype`.
- Installed EXE byte checks:
  - atlas quality `file 0x000b0b91 = 6a04`
- primary size `file 0x000ea1c6 = 6a12`
- atlas size `file 0x000b0869 = 83c0059090`
- Login/start is windowed by default; switch to borderless after login when needed so
  display scaling does not contaminate login/font judgment.

