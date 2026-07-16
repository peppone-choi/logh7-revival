# LOGH VII 렌더 검증 사양 — Windows 세션 실행용

작성일: 2026-06-14 · 작성자: iOS/Mac 협업자 · 수신: Windows 세션(frida 실행 담당)

---

## 0. 목적

코드페이지 변환(CP932→949 강제)은 해결됐다 (Task B).
이 문서는 **GDI 텍스트 출력 경로가 실제 호출되는지**, 그리고 **글리프가 0폭 없이 그려지는지**를 화면 캡처에 의존하지 않고 결정적으로 확인하기 위한 사양이다.

오프라인(Mac) 쪽에서 실행 가능한 사전 점검은 `tools/logh7_render_audit.py`로 완료했다.
이 문서는 **Windows 세션이 frida로 수행해야 할 라이브 검증** 절차를 정의한다.

---

## 1. Frida 훅 스크립트 사양

### 1.1 훅 대상 Win32 API

| API | DLL | 목적 |
|-----|-----|------|
| `ExtTextOutA` | gdi32.dll | 가장 자주 쓰이는 GDI 텍스트 출력; 위치·클리핑·옵션 포함 |
| `TextOutA` | gdi32.dll | 단순 텍스트 출력 |
| `DrawTextA` | user32.dll | 직사각형 내 텍스트 레이아웃 출력 |
| `CreateFontA` | gdi32.dll | 폰트 핸들 생성; charset·facename 캡처용 |

### 1.2 로그 레코드 필드 (각 호출마다)

```json
{
  "api": "ExtTextOutA",
  "hdc": "0x...",
  "lpString": "<hex bytes>",
  "lpStringUtf8": "<best-effort decode as cp949>",
  "nCount": 5,
  "returnValue": 1,
  "activeFont": {
    "hFont": "0x...",
    "lfCharSet": 129,
    "lfCharSetHex": "0x81",
    "lfFaceName": "굴림"
  }
}
```

- `lpString` — ANSI 바이트 원본을 hex string으로 기록. `nCount`가 -1이면 NUL까지 읽는다.
- `returnValue` — `ExtTextOutA`/`TextOutA`는 BOOL(1=성공), `DrawTextA`는 그려진 높이(px).
  반환값 0은 실패·0폭을 의미한다.
- `activeFont` — 훅 시점에서 `hdc`에 선택된 HFONT를 `GetCurrentObject(hdc, OBJ_FONT)`로 얻어
  `GetObjectA(hFont, sizeof(LOGFONTA), &lf)`로 `lfCharSet`·`lfFaceName`을 읽는다.

### 1.3 CreateFontA 훅 필드

```json
{
  "api": "CreateFontA",
  "lfCharSet": 129,
  "lfCharSetHex": "0x81",
  "lfFaceName": "굴림",
  "returnHFont": "0x..."
}
```

### 1.4 Frida 스크립트 골격 (JavaScript)

```javascript
// logh7_gdi_text_hook.js  — frida -l logh7_gdi_text_hook.js -p <pid>
"use strict";

const LOG = [];

function hexBytes(ptr, len) {
  if (ptr.isNull() || len === 0) return "";
  const actualLen = len < 0
    ? ptr.readCString().length   // NUL-terminated
    : Math.min(len, 512);        // cap to avoid huge dumps
  return Array.from(ptr.readByteArray(actualLen))
    .map(b => b.toString(16).padStart(2, "0")).join(" ");
}

function tryDecode(ptr, len) {
  // best-effort UTF-8 display; real bytes are in lpString hex
  try {
    const n = len < 0 ? ptr.readCString().length : len;
    return ptr.readByteArray(n)
      // Pass raw bytes back to Python side for proper CP949 decode
      ? "<see lpString>" : "";
  } catch (_) { return ""; }
}

function getActiveFont(hdc) {
  const OBJ_FONT = 6;
  const GetCurrentObject = new NativeFunction(
    Module.getExportByName("gdi32.dll", "GetCurrentObject"),
    "pointer", ["pointer", "uint32"]
  );
  const GetObjectA = new NativeFunction(
    Module.getExportByName("gdi32.dll", "GetObjectA"),
    "int32", ["pointer", "int32", "pointer"]
  );
  const hFont = GetCurrentObject(hdc, OBJ_FONT);
  if (hFont.isNull()) return null;
  // LOGFONTA: 60 bytes (lfHeight..lfFaceName[32])
  const buf = Memory.alloc(60);
  const ret = GetObjectA(hFont, 60, buf);
  if (ret === 0) return null;
  const lfCharSet = buf.add(23).readU8();   // offset 23 in LOGFONTA
  const lfFaceName = buf.add(28).readCString(); // offset 28
  return { hFont: hFont.toString(), lfCharSet, lfCharSetHex: "0x" + lfCharSet.toString(16).padStart(2,"0"), lfFaceName };
}

// --- ExtTextOutA ---
const ExtTextOutA = Module.getExportByName("gdi32.dll", "ExtTextOutA");
Interceptor.attach(ExtTextOutA, {
  onEnter(args) {
    this.hdc = args[0];
    this.lpString = args[5];
    this.nCount = args[6].toInt32();
  },
  onLeave(retval) {
    const rec = {
      api: "ExtTextOutA",
      hdc: this.hdc.toString(),
      lpString: hexBytes(this.lpString, this.nCount),
      nCount: this.nCount,
      returnValue: retval.toInt32(),
      activeFont: getActiveFont(this.hdc)
    };
    LOG.push(rec);
    send(rec);
  }
});

// --- TextOutA ---
const TextOutA = Module.getExportByName("gdi32.dll", "TextOutA");
Interceptor.attach(TextOutA, {
  onEnter(args) {
    this.hdc = args[0];
    this.lpString = args[3];
    this.nCount = args[4].toInt32();
  },
  onLeave(retval) {
    const rec = {
      api: "TextOutA",
      hdc: this.hdc.toString(),
      lpString: hexBytes(this.lpString, this.nCount),
      nCount: this.nCount,
      returnValue: retval.toInt32(),
      activeFont: getActiveFont(this.hdc)
    };
    LOG.push(rec);
    send(rec);
  }
});

// --- DrawTextA ---
const DrawTextA = Module.getExportByName("user32.dll", "DrawTextA");
Interceptor.attach(DrawTextA, {
  onEnter(args) {
    this.hdc = args[0];
    this.lpchText = args[1];
    this.nCount = args[2].toInt32();
  },
  onLeave(retval) {
    const rec = {
      api: "DrawTextA",
      hdc: this.hdc.toString(),
      lpString: hexBytes(this.lpchText, this.nCount),
      nCount: this.nCount,
      returnValue: retval.toInt32(),
      activeFont: getActiveFont(this.hdc)
    };
    LOG.push(rec);
    send(rec);
  }
});

// --- CreateFontA ---
const CreateFontA = Module.getExportByName("gdi32.dll", "CreateFontA");
Interceptor.attach(CreateFontA, {
  onEnter(args) {
    // CreateFontA(nHeight, nWidth, ..., lfCharSet=arg6, ..., lpszFace=arg13)
    this.lfCharSet = args[6].toInt32();
    this.lfFaceName = args[13].isNull() ? "" : args[13].readCString();
  },
  onLeave(retval) {
    const rec = {
      api: "CreateFontA",
      lfCharSet: this.lfCharSet,
      lfCharSetHex: "0x" + this.lfCharSet.toString(16).padStart(2,"0"),
      lfFaceName: this.lfFaceName,
      returnHFont: retval.toString()
    };
    LOG.push(rec);
    send(rec);
  }
});
```

Python ハーネス 측에서 `session.on("message", ...)` 콜백으로 각 레코드를 수집하고
최종적으로 JSON 파일로 저장한다 (`.omo/ui-explorer/gdi-text-hook-<timestamp>.json`).

---

## 2. CP949 강제 상태에서의 기대값 표

CP932→949 IAT 트램폴린 패치(Task B)가 적용된 빌드
(`.omo/work/logh7-ko-overlay/exe/G7MTClient.exe`)를 실행했을 때의 정상 기대값:

| 필드 | 기대값 | 비정상 시 의미 |
|------|--------|----------------|
| `CreateFontA.lfCharSet` | `0x81` (129 = HANGEUL_CHARSET) | `0x80` (SHIFTJIS) → 폰트 패치 미적용 |
| `CreateFontA.lfFaceName` | `"굴림"` | 다른 폰트명 → 폰트명 패치 미적용 또는 폰트 미설치 |
| `ExtTextOutA.lpString` (hex) | 유효한 CP949 바이트열 (한글 2바이트 시퀀스: `0xB0`–`0xC8` 범주 등) | 일본어 SJIS 바이트열 → 코드페이지 패치 미적용 |
| `ExtTextOutA.nCount` | `> 0` | `0` → 빈 문자열, UI 경로 미호출 |
| `ExtTextOutA.returnValue` | `1` (BOOL true) | `0` → GDI 렌더 실패 (charset/폰트 불일치) |
| `DrawTextA.returnValue` | `> 0` (그려진 높이 px) | `0` → 렌더 실패 |

예시 "결정" (CP949 = `0xB0 0xE1 0xC1 0xA4`) 기대 로그:

```json
{
  "api": "ExtTextOutA",
  "lpString": "b0 e1 c1 a4",
  "nCount": 4,
  "returnValue": 1,
  "activeFont": {
    "lfCharSet": 129,
    "lfCharSetHex": "0x81",
    "lfFaceName": "굴림"
  }
}
```

---

## 3. 근본 원인 결정 트리

```
GDI 텍스트 API 호출이 전혀 없음?
  YES → (c) UI 렌더 경로 미진입: 메뉴가 GDI가 아닌 D3D 텍스처폰트
         (FUN_004eb100 경로 별도 조사 필요)
  NO  ↓
nCount == 0 또는 lpString이 빈 바이트열?
  YES → (c) 상위 문자열 바인딩 실패: 변환 결과가 빈 문자열로 전달됨
  NO  ↓
lpString 바이트가 SJIS 패턴 (0x82, 0x8c 등 SJIS 2바이트 리드)?
  YES → (c) 코드페이지 패치 미적용, 여전히 CP932 경로
  NO  ↓
lfCharSet != 0x81 (HANGEUL_CHARSET)?
  YES → (b) 폰트 charset 불일치: CreateFontA 패치 미적용
         VA 0x004AEDEB, 0x004B0B97 재확인
  NO  ↓
returnValue == 0?
  YES → (b) GDI 렌더 실패: 한글 글리프 없음, 폰트명 불일치,
         또는 lfCharSet·코드페이지 조합 문제
         → lfFaceName 확인, 굴림 설치 여부 확인
  NO  ↓
returnValue > 0 + 바이트 정상 + charset 0x81이지만 화면에 글자 없음?
  → (a) 캡처 아티팩트: GDI는 성공, D3D8 서피스가 스크린샷 도구에 안 잡힘
         실모니터/창모드 전환 후 육안 확인 또는 PrintWindow API로 재캡처
```

---

## 4. 오프라인 폰트 패치 charset 감사

`tools/logh7_japanese_font_patch.py`가 적용하는 패치 사이트:

| VA | 파일 오프셋 (참고값) | 원본 바이트 | 패치 바이트 | 의미 |
|----|---------------------|-------------|-------------|------|
| `0x004AEDEB` | EXE에서 확인 필요 | `6a 01` (`push 1` = SHIFTJIS_CHARSET=0x80의 인자) | `6a 81` (`push 0x81` = HANGEUL_CHARSET) | CreateFontA charset 인자 #1 |
| `0x004B0B97` | EXE에서 확인 필요 | `6a 01` | `6a 81` | CreateFontA charset 인자 #2 |

> **주의**: 원본 바이트 `6a 01`에서 `01`은 SHIFTJIS_CHARSET(0x80)의 direct-push가 아니라
> `push 1`이다. `logh7_japanese_font_patch.py`의 `EXPECTED_ORIGINAL = b"\x6a\x01"`이 이 값.
> 패치 후 `6a 81` = `push 0x81` (HANGEUL_CHARSET=129).
> Windows 세션에서 EXE 로드 후 hex 에디터 또는 frida `Memory.readByteArray`로
> VA 값 일치 여부를 확인한다.

폰트명 `굴림` 패치 위치:

| VA | 내용 | 확인 방법 |
|----|------|-----------|
| `0x36e240` (추정) | ASCII 문자열 `"굴림\0"` (CP949: `b1 bc b8bc 00`) | frida `Memory.readCString(ptr("0x36e240"))` 또는 hex 에디터에서 `b1 bc b8 bc 00` 검색 |

> 이 주소는 `.omo/work/logh7-ko-overlay/exe/G7MTClient.exe` 기준이며 EXE 버전이 다르면
> 달라질 수 있다. Windows 세션에서 실제 EXE 대조 후 확정할 것.

예상 패치된 바이트 요약:

```
VA 0x004AEDEB: 6a 81   (HANGEUL_CHARSET push)
VA 0x004B0B97: 6a 81   (HANGEUL_CHARSET push)
VA 0x36e240  : b1 bc b8 bc 00   (CP949 "굴림\0")
```

---

## 5. 수용 기준 및 증거 경로

### 5.1 증거 파일 경로

```
.omo/ui-explorer/gdi-text-hook-<timestamp>.json   # frida 캡처 원본
.omo/ui-explorer/render-verdict-<timestamp>.json  # 결정 트리 적용 결과
```

### 5.2 각 원인별 수용 기준

| 결론 | 필요한 증거 |
|------|-------------|
| **(a) 캡처 아티팩트** | `ExtTextOutA.returnValue==1` + `lfCharSet==0x81` + `lpString` = 유효 CP949 한글 바이트 + 화면 글자 육안 확인 (창모드/PrintWindow) |
| **(b) 글리프/charset 불일치** | 호출은 있음 + `returnValue==0` 또는 `lfCharSet!=0x81` + 폰트 재설치·패치 재적용 후 재테스트 |
| **(c) 렌더 경로 미진입** | GDI 텍스트 API 호출 0건 (D3D 텍스처폰트 경로 `FUN_004eb100` 별도 조사; Wide char → texture blit 추적 필요) |

### 5.3 오프라인 사전 점검 결과 (Mac)

`python3 tools/logh7_render_audit.py --out /tmp/render-audit.json` 실행 결과:

- 60개 번역 문자열 전부 `utf16Ok=true` (MB_ERR_INVALID_CHARS 기준 변환 성공)
- `blocksSeen`: ASCII, Hangul Syllables
- `glyphCheck`: skipped (PIL/font unavailable) — Windows 세션에서 굴림 폰트로 재실행 권장

---

## 6. 참고: §7 증거 경로 (원 요청서 기준)

- `.omo/ui-explorer/mbtowc-capture-949.json` — MB→WC 변환 215건 캡처 원본
- `.omo/ui-explorer/menu-949-{a,b}.png` — 창모드 스크린샷 (D3D 캡처 실패 참조용)
- `.omo/work/logh7-ko-overlay/exe/G7MTClient.exe` — 폰트패치(굴림+HANGEUL) 베이스 EXE
- `tools/logh7_japanese_font_patch.py` — charset 패치 도구 (VA 참조)
- `tools/logh7_render_audit.py` — 오프라인 렌더 감사 도구 (본 문서 기반)
- `tools/tests/test_logh7_render_audit.py` — 감사 도구 단위 테스트
