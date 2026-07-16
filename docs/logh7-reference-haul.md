# LoGH7 Revival — 참고 레포 & 스킬 수집 목록

리포를 실제로 읽고(RE·와이어·서버·한글화·라이브QA 트랙 확인) 각 트랙에 맞춰 조준한 목록.
이미 설치된 것과 겹치지 않게 골랐다.

## ⚠️ 클론 전 주의

- `docs/reference/`는 매뉴얼 PDF 전용이다. 코드 레포는 거기 섞지 말고 별도 폴더에.
- `.gitignore`에 `reference/`가 **없다** → 클론하면 커밋 대상이 된다. 먼저 무시 등록:
  ```bash
  echo "/reference/" >> .gitignore   # 참고 레포는 커밋하지 않음
  mkdir -p reference && cd reference
  ```
- 클론 목적은 **패턴·방법론 차용**이지 코드 복붙이 아니다. 라이선스(대부분 GPL/AGPL) 주의 — 서버 코드에 직접 이식 금지, 설계만 참고.

---

## 🥇 최우선: 방법론이 이 프로젝트와 동일한 레포

### MHServerEmu — 죽은 온라인 게임을 원본 클라 무수정 + 서버 RE로 복원
```bash
git clone https://github.com/Crypto137/MHServerEmu
```
**이 프로젝트의 쌍둥이다.** 서비스 종료된 Marvel Heroes(온라인 ARPG)를 원본 클라이언트를
그대로 두고, **클라 안에 들어있는 정보(stat/공식/로직 사본)로 서버를 리버스 엔지니어링**해
되살렸다. logh7-revival의 미션 정의와 토씨까지 같다. 서버 authoritative + 클라 prediction
구조에서 "클라가 기대하는 바이트를 서버가 되말해주는" 접근의 레퍼런스 구현. C#이지만
아키텍처·핸드셰이크·세션·패킷 디스패치 설계가 그대로 참고됨.
- 방법론 문서: https://crypto137.github.io/MHServerEmu/about/

---

## 🔧 Frida 런타임 계측 (tools/re, RE 트랙)

리포는 이미 rev-frida 스킬이 있지만, 실제 스크립트 예제 레포가 없다. objTable/게이트/
메모리 스캔 훅을 짤 때 참고할 것.

### frida-agent-example — TypeScript Frida 에이전트 공식 템플릿
```bash
git clone https://github.com/oleavr/frida-agent-example
```
Frida 창시자(oleavr)의 공식 TS 에이전트 스캐폴드. `agent/index.ts` 감시→컴파일 파이프라인.
리포의 `RE/tools/*.py` Frida 프로브를 TS로 재구성하거나 신규 훅 짤 때 뼈대.

### frida-snippets — 손수 만든 Frida 예제 모음
```bash
git clone https://github.com/iddoeldor/frida-snippets
```
Interceptor.attach, Memory.scan, 백트레이스, 구조체 읽기 등 실전 스니펫. objTable slot
순회(`FUN_004c7290`)나 self-match 게이트(`FUN_004c2a80`) 훅 짤 때 패턴 참고.

### frida-scripts (0xdea) — RE용 계측 스크립트 모음
```bash
git clone https://github.com/0xdea/frida-scripts
```
함수 트레이싱·인자 덤프 계열. B27~B36에서 했던 `FUN_004b48d0` 인자 계측 같은 작업의 참고.

> Frida JS API 레퍼런스(메모리 스캔 마스크, X86Writer 패치): https://frida.re/docs/javascript-api/

---

## 📡 자체 권위 서버 아키텍처 (server/, 서버 트랙)

리포 서버는 이미 Node.js로 잘 돌아가지만(297~308 테스트 통과), 확장·수천 동접 목표
아키텍처 설계 시 참고.

### colyseus — Node.js authoritative 멀티플레이 프레임워크
```bash
git clone https://github.com/colyseus/colyseus
```
룸 기반, 델타 압축 바이너리 상태 동기화, Redis 수평 확장. 리포의 "인메모리 권위 +
비동기 DB 영속성(CQRS)" 목표 아키텍처 참고. 직접 도입이 아니라 상태 동기화/룸 수명주기
설계 패턴만.

### pomelo — 분산 게임 서버 프레임워크 (오픈소스 MMO 데모 포함)
```bash
git clone https://github.com/NetEase/pomelo
```
멀티프로세스·커스텀 네트워크 프로토콜 지원. 오픈소스 MMORPG 데모가 딸려 있어 세션/영역
서버 분리(진영 서버 분리, manual p8) 설계에 참고.

> 순수 바이너리 TCP 프레이밍(길이 프리픽스 + 부분 읽기 누적)은 리포가 이미
> `logh7-frame-stream`으로 구현했으니 신규 도입 불필요. 위 둘은 확장 설계 참고용.

---

## 🈶 한글화 / GDI / Shift-JIS (localizer, M6 트랙)

**여기가 이번 수집의 핵심.** 리포의 M6(cp932 해저드, CreateFontA 경로, .rsrc UTF-16 패치)
문제를 정면으로 겨냥하는 레포들.

### VNTranslationTools — SJIS 터널링 + 프록시 DLL (★M6 핵심)
```bash
git clone https://github.com/arcusmaximus/VNTranslationTools
```
SJIS(cp932) 전용 게임에서 **미지원 문자(한글)를 미사용 SJIS 코드포인트로 터널링**하고,
프록시 `d2d1.dll`이 `TextOutA()`/`DrawText()` 렌더 시점에 원래 문자로 치환한다. 게다가:
- 커스텀 폰트(.ttf/.ttc) 강제 로드 — 리포의 `MS UI Gothic`→Pretendard 교체와 직결
- proportional 폰트 문자 위치 재조정
- SJIS 전용 게임을 Unicode 호환으로(비SJIS 경로·IME 입력 허용) — 한글 채팅 입력 문제와 연결

리포는 지금 `.rsrc` UTF-16LE 패치 + `String.txt` cp949 + `hangeulmenu=hangeul` 게이트로
접근 중인데, SJIS 터널링은 그 대안/보완 경로다. 폰트 프록시 접근(GDI 후킹)은 리포의
`logh7_gdi_font_watch.py`가 관측한 렌더 경로에 직접 적용 가능.

### VNTextPatch-net8 — 위 도구의 .NET 8 포팅 (최신 런타임)
```bash
git clone https://github.com/rafael-vasconcellos/VNTextPatch-net8
```
같은 SJIS 터널링 기능의 현대 런타임 버전. xlsx/json 추출·재삽입. 번역 JSON 파이프라인
(리포의 "추출 원천 + 적용 패치 함께 승격" 규칙)에 맞춤.

### Segagaga English Translation — BIOS 폰트 게임 한글화 케이스
```bash
git clone https://github.com/ExxistanceDC/Segagaga-English-Translation
```
게임이 자체 폰트시트 없이 시스템 폰트로 직접 렌더하는 경우의 해법 사례
(ASM으로 ASCII 강제 + 실행파일 여유공간에 번역 문자열 재배치). 리포처럼 GDI/시스템
폰트에 의존하는 클라의 한글화 전략 참고.

---

## 🔬 Ghidra 자동화 (tools/re, EXE 전수 RE 트랙)

리포는 ghidra 스킬 + `Logh7ExportSelectedDecomp.java`가 있지만, 전수 디컴파일·크로스버전
매칭 도구는 없다. `audit_exe_re_coverage.mjs` 커버리지 채울 때 참고.

### ghidra-headless-scripts — 전수 디컴파일/디스어셈블 헤드리스 스크립트
```bash
git clone https://github.com/galoget/ghidra-headless-scripts
```
`analyzeHeadless`로 인식된 전 함수를 pseudo-C로 덤프. 11593 함수(리포 기준) 전수
디컴파일 배치 참고. 리포는 이미 `g7mtclient-sjis.exe_decompiled.c`를 만들어뒀지만
재생성·검증 파이프라인 강화용.

### ghidra-mcp — AI 기반 RE MCP (200+ 툴, 크로스버전 함수 매칭)
```bash
git clone https://github.com/bethington/ghidra-mcp
```
헤드리스 서버 + MCP 도구. **크로스버전 함수 매칭**(정본 EXE 9c97…bb51 vs -sjis 사본 간
오프셋 대조)에 직접 유용 — 리포가 반복적으로 겪는 "Ghidra는 -sjis 기반이라 오프셋이
다르다" 문제를 해시 기반 매칭으로 자동화. Jython 대신 PyGhidra. **단, 리포에 MCP를
붙이는 건 오케스트레이션 오버헤드가 있으니 도구 참고 우선.**

---

## 🛡️ Claude Code / Codex 안전장치 (인코딩 보호)

### non-UTF-8 파일 보호 훅 (리포의 disable-utf8-beta.bat 문제 대응)
```bash
# github.com/topics/shift-jis 에서 "Prevent Claude Code from breaking your non-UTF-8 files" 훅 검색
```
Desktop의 `disable-utf8-beta.bat`가 다루던 그 문제 — 에이전트가 cp932/cp949 파일을
UTF-8로 저장해 깨뜨리는 것을 막는 훅. Codex/Claude Code가 `String.txt`·MsgDat·
constmsg.dat 같은 인코딩 민감 파일을 건드릴 때 필수. CRLF 보존도.

---

## Codex에 먹이는 순서 (권장)

```bash
# 1. 무시 등록 + 폴더 생성
echo "/reference/" >> .gitignore
mkdir -p reference && cd reference

# 2. 방법론 쌍둥이 (제일 먼저 읽을 것)
git clone https://github.com/Crypto137/MHServerEmu

# 3. 트랙별 (필요한 것만)
git clone https://github.com/oleavr/frida-agent-example          # Frida
git clone https://github.com/iddoeldor/frida-snippets            # Frida
git clone https://github.com/arcusmaximus/VNTranslationTools     # ★한글화 핵심
git clone https://github.com/rafael-vasconcellos/VNTextPatch-net8 # 한글화
git clone https://github.com/galoget/ghidra-headless-scripts     # Ghidra 전수
git clone https://github.com/colyseus/colyseus                   # 서버 확장 설계
```

---

## 스킬 추가 후보 (skills-lock.json 기준, 이미 있는 것 제외)

리포는 `find-skills` 스킬이 있으니 Codex가 스스로 찾게 할 수도 있다. 명시 후보:

| 후보 스킬 | 출처 후보 | 왜 |
|---|---|---|
| **web-cloning / real-source-first** | 검색 결과의 web-cloning 방법론 skill | "AI 환각 코드 말고 진짜 소스 먼저" — 리포의 "날조 금지·라이브 증거" 규칙과 정합. RE 결과를 추측으로 안 채우는 규율 강화 |
| **rev-struct** | (리포 문서가 이미 참조) | 메모리 접근 패턴으로 구조체 복원. 0x0323/0x0325 레코드 레이아웃 확정에 직접 |
| **pdf-ocr / smart-ocr** | 매뉴얼 표·성계도 OCR | manual PDF 5종에서 성계 좌표·커맨드 표 추출 (M4 전략 커맨드 81종 승격) |

> 이미 설치됨 (중복 금지): binary-triage, ghidra, protocol-reverse-engineering, rev-frida,
> test-driven-development, verification-before-completion, systematic-debugging, find-skills,
> karpathy-guidelines, grammar-checker, humanize-korean, humanizer, style-guide, logh7-orchestrator.

---

## 트랙 ↔ 레포 매핑 요약

```
방법론 전체    → MHServerEmu (쌍둥이 프로젝트)
RE (Frida)     → frida-agent-example, frida-snippets, 0xdea/frida-scripts
RE (Ghidra)    → ghidra-headless-scripts, ghidra-mcp
서버 아키텍처   → colyseus, pomelo (확장 설계 참고만, 프레이밍은 이미 구현됨)
한글화 (M6)    → VNTranslationTools ★, VNTextPatch-net8, Segagaga (GDI/SJIS 터널링/폰트 프록시)
인코딩 안전     → non-UTF-8 보호 훅
```
