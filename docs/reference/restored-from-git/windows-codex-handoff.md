# Windows Codex Handoff

이 문서는 Codex가 설치된 Windows PC에서 이 저장소 작업을 바로 이어가기 위한 인수인계 절차와 재개 프롬프트입니다. 이어갈 핵심 작업은 LOGH VII의 한글화와 게임 서버 구성입니다.

## Windows PC에서 먼저 실행

PowerShell에서 실행합니다.

```powershell
git clone <REPOSITORY_URL> LOGH-7-rework
cd LOGH-7-rework
git lfs install
git pull
git lfs pull
npm install
```

이미 클론한 저장소가 있다면:

```powershell
cd <LOCAL_REPO_PATH>
git status --short --branch
git pull
git lfs pull
npm install
```

## 확인 명령

```powershell
npm run build
npm test
```

`npm test`는 Playwright 브라우저가 필요합니다. 브라우저가 없다는 오류가 나오면 다음을 먼저 실행합니다.

```powershell
npx playwright install
```

설치 완료 트리와 한글화 오버레이가 준비된 뒤 배포 zip 후보를 만들 때는 다음을 실행합니다.

```powershell
python tools/logh7_pipeline.py package-installed .omo/work/logh7-installed --overlay .omo/work/logh7-ko-overlay --out .omo/work/logh7-build/logh7-ko-installed.zip --manifest-out .omo/work/logh7-build/logh7-ko-installed-manifest.json
```

이 zip 생성 명령은 `.bin`, `.cue`, `.iso`가 배포 트리에 섞이면 실패합니다. 최종 사용자가 CD 이미지나 LFS 아티팩트를 받지 않도록 하기 위한 검증입니다.

## Windows PC Codex 자동 재개 프롬프트

아래 프롬프트를 Windows PC의 Codex에 그대로 붙여 넣습니다.

```text
너는 Windows PC에서 실행 중인 Codex야. 이 저장소의 목표는 LOGH VII 자료를 기반으로 한글화와 게임 서버 구성을 완성하는 것이다.

작업 시작 전에 다음을 반드시 수행해:
1. `git status --short --branch`로 브랜치와 dirty state를 확인한다.
2. `git pull`과 `git lfs pull`을 실행해 macOS 작업자가 푸시한 최신 문서와 LFS CD 아티팩트를 받는다.
3. `npm install`을 실행한다. 이미 설치되어 있으면 빠르게 끝나도 된다.
4. `npm run build`와 `npm test`를 실행해 현재 표면을 검증한다. Playwright 브라우저가 없으면 `npx playwright install` 후 다시 테스트한다.

그 다음 자동으로 작업을 이어가:
- 문서와 현재 코드부터 읽고, 최종 목표인 한글화와 게임 서버 구성을 충족하는 방향으로 직접 구현한다.
- CD/ISO 아티팩트 구조를 조사해 한글화 대상 리소스, 텍스트/폰트/인코딩 제약, 패치 재빌드 경로를 정리하고 필요한 도구를 만든다.
- 게임 서버 구성에 필요한 실행 방식, 네트워크 포트, 설정 파일, 로컬/원격 실행 절차, 검증 방법을 확인하고 재현 가능하게 문서화/자동화한다.
- 모르는 형식이나 프로토콜은 추측으로 덮지 말고 샘플 추출, 헥스/문자열 분석, 실행 로그, 공식/신뢰 가능한 자료로 근거를 확보한다.
- `node_modules/`, `dist/`, Playwright 리포트, 테스트 산출물은 커밋하지 않는다.
- 웹/도구 표면을 바꾸면 관련 테스트를 추가하거나 갱신하고, `npm run build`와 `npm test`로 검증한다.
- 설치 완료 트리와 한글화 오버레이가 준비되면 `python tools/logh7_pipeline.py package-installed .omo/work/logh7-installed --overlay .omo/work/logh7-ko-overlay --out .omo/work/logh7-build/logh7-ko-installed.zip --manifest-out .omo/work/logh7-build/logh7-ko-installed-manifest.json`로 Windows 배포 zip 후보와 해시 매니페스트를 만든다.
- 커밋이 필요하면 Lore Commit Protocol을 따른다.
- 완료 전에는 실제 실행/변환/서버/테스트 표면으로 동작을 확인하고, 최종 답변에는 변경 파일, 통과한 검증, 남은 위험을 짧게 보고한다.

현재 알려진 저장소 표면:
- `artifacts/logh7-cd/`: Git LFS로 관리되는 LOGH VII CD 원본/변환 ISO 자료
- `tools/convert_mode2_bin_to_iso.py`: MODE2/2352 BIN을 2048-byte ISO payload로 변환하는 도구
- `src/`, `index.html`, `package.json`: Vite/React 작업 표면
- `tests/`: Playwright 회귀 테스트
- `docs/windows-codex-handoff.md`: 이 Windows 인수인계 문서

우선순위:
1. 한글화 대상 리소스와 패치 파이프라인을 찾아 재현 가능한 추출/변환/재삽입 흐름을 만든다.
2. 게임 서버 구성 요건을 확인하고 로컬 Windows 환경에서 실행 가능한 서버 설정/스크립트/문서를 만든다.
3. 작업 결과를 검증 가능한 명령과 테스트로 고정한다.

바로 시작해. 명확하고 안전한 다음 단계는 묻지 말고 실행해.
```

## 커밋 대상 기준

커밋해야 하는 파일:

- 작업 지시/인수인계 문서
- 소스 코드와 테스트
- lockfile과 설정 파일
- 재현 가능한 변환 도구

커밋하지 않을 파일:

- `node_modules/`
- `dist/`
- Playwright 리포트와 테스트 산출물
- 로컬 로그 파일

## 2026-06-10 OMO Loop Handoff

현재 목표는 여전히 LOGH VII를 한글화된 상태로 점진적으로 접속/플레이 가능하게 만드는 것이다. 이번 loop에서는 사용자 지시에 따라 패킷 캡처 우선 탐색을 멈추고, 게임 파일 정적 리버스 엔지니어링 우선으로 방향을 정정했다. 전체 목표는 아직 완료가 아니다.

현재 uncommitted 변경:

- `tools/logh7_message_family_maps.py`: `G7MTClient.exe` 내부 message-family lookup 객체를 정적으로 인덱싱한다.
- `tools/tests/test_logh7_message_family_maps.py`: `message-family-index` RED/GREEN 테스트.
- `tools/logh7_pe_inventory.py`: 설치 트리의 모든 `.exe`/`.dll`을 RE triage 인벤토리로 만든다.
- `tools/tests/test_logh7_pe_inventory.py`: `pe-inventory` RED/GREEN 테스트.
- `tools/logh7_packet_trace.py`, `tools/tests/test_logh7_packet_trace.py`: `0x0013/0x0014` world/grid 후보 trace 분류를 추가했다.
- `tools/logh7_pipeline.py`: `message-family-index`, `pe-inventory` CLI를 연결했다.
- `tools/logh7_launcher_update_index.py`: 런처/업데이터 PE의 서버/업데이트/실행 marker를 byte-precise offset/VA로 인덱싱한다.
- `tools/tests/test_logh7_launcher_update_index.py`: launcher/update index RED/GREEN 테스트.
- `docs/logh7-server-setup.md`, `.omo/ulw-loop/notepad.md`, `.omo/ulw-loop/ledger.jsonl`: G080/G081/G082 증거와 방향 정정 기록.

검증 완료:

- `python -m unittest tools.tests.test_logh7_message_family_maps tools.tests.test_logh7_pe_inventory tools.tests.test_logh7_packet_trace` 통과.
- `python -m unittest tools.tests.test_logh7_launcher_update_index` 통과.
- `npm test` 통과: Python 122 tests, Node server 25 tests, Playwright 5 tests.
- `npm run build` 통과.
- `git diff --check` 통과. CRLF 변환 경고만 있음.
- 프로세스/포트 cleanup 확인: `G7MTClient`, `G7Start`, `Gin7UpdateClient` 없음; `4787`, `47900`, `47901` listening 없음.

새 정적 RE 증거:

- `.omo/ulw-loop/evidence/g080-message-family-index.json`
  - `session-bootstrap`: base `0x0200`, count `8`, object size `0x0108`, lookup `0x0044f060`.
  - `post-handshake`: base `0x0400`, count `67`, object size `0x041c`, lookup `0x004aa530`.
  - `world-grid`: base `0x0f00`, count `32`, object size `0x74cc`, lookup `0x0048cd20`.
  - 결론: `0x0200/0x0205`, `0x0f01/0x0f03`은 임의 packet body가 아니라 등록된 internal message-family object lookup 대상이다.
- `.omo/ulw-loop/evidence/g081-pe-inventory.json`
  - 설치 트리 PE 6개, 모두 `machineHex=0x014c` 32-bit x86 GUI.
  - high: `exe/G7MTClient.exe`.
  - medium: `G7Start.exe`, `Gin7UpdateClient.exe`.
  - low: `BootFirst.exe`, `DSETUP.dll`, `DSETUP32.dll`.
- `.omo/ulw-loop/evidence/g082-launcher-update-index.json`
  - `Gin7UpdateClient.exe`: default server `202.8.80.179` at raw `0x0004a540` / VA `0x0044a540`.
  - 같은 바이너리 안에 `.\\exe\\G7MTClient.exe`, `SERVER_PORT`, `SERVER_ADDRESS`, `UPDATE`, `%sSERVER.INI`, `Gin7UpdateClient.new`, `UPDATE.LOG`, `ProxyServer`, `HTTP/%d.%d`, `ftp://`, `http://`가 있다.
  - `G7Start.exe`: `exe\\G7MTClient.exe`, `SETUP.EXE`.
  - `BootFirst.exe`: `.\\Gin7UpdateClient.exe`, `.old`, `.new`.

다음 RE 타깃:

- 모든 EXE/DLL을 같은 깊이로 파지 말고, 다음에는 `Gin7UpdateClient.exe`의 server-config string xref를 추적한다.
- 우선순위 marker는 다음과 같다:
  - `0x4a51c`: `.\\exe\\G7MTClient.exe`
  - `0x4a540`: `202.8.80.179`
  - `0x4a5a0`: `SERVER_PORT`
  - `0x4a5ac`: `SERVER_ADDRESS`
  - `0x4a5bc`: `UPDATE`
  - `0x4a5e8`: `%sSERVER.INI`
  - `0x4a63c`: `Gin7UpdateClient.new`
  - `0x4a668`: `UPDATE.LOG`
  - `0x4f234`: `http`
  - `0x4f61c`: `ftp://`
  - `0x4f62c`: `http://`
- `G7Start.exe`는 `exe\\G7MTClient.exe`와 `.INI` 문자열을 포함하지만, 다음 깊은 xref 타깃은 아니다.
- `BootFirst.exe`는 `.\\Gin7UpdateClient.exe`, `.old`, `.new`를 포함하므로 update replacement 보조 증거로 둔다.

권장 다음 증분:

1. `tools/logh7_launcher_update_xrefs.py` 같은 좁은 정적 xref 도구를 추가한다.
2. `Gin7UpdateClient.exe`의 G082 marker VA를 참조하는 함수 주변을 capstone으로 디스어셈블한다.
3. server file read/write, process launch, update replacement 흐름을 분류한다.
4. RED/GREEN 테스트와 실제 PE evidence를 남긴다.
5. 이 정적 결과로 서버 주소/업데이트 경로를 클라이언트 단독 patch가 아니라 launcher/updater 포함 정책으로 확정한다.

주의:

- `.omc/`는 로컬 OMO/session state로 보이며 이번 코드 변경 대상이 아니다. 커밋하지 않는다.
- 전체 목표는 아직 완료가 아니므로 `update_goal complete`로 닫지 않는다.

## 2026-06-10 G083 launcher/update flow classification (완료)

위 "권장 다음 증분"을 이행했다. 도구 이름은 `logh7_launcher_update_flow.py`로 두었다(흐름 분류가 목적이라 `_flow`).

추가 파일:

- `tools/logh7_launcher_update_flow.py`: import table를 해석하고 실행 섹션을 선형 디스어셈블해 watched Win32 import(`GetPrivateProfileString/Int`, `WritePrivateProfileString`, `CreateProcess`, `MoveFile/DeleteFile`, registry) 호출과 인접한 config 문자열 push를 상관시킨다. 세 결론을 도출한다: `serverIniOverride`, `processLaunch`, `updateFileReplacement`. 표준 입력 `root --out OUT`. (pipeline.py에 묶지 않고 `logh7_launcher_update_index.py`처럼 standalone 유지.)
- `tools/tests/test_logh7_launcher_update_flow.py`: 2섹션(.text/.rdata) 합성 PE + 손수 만든 import table로 세 결론을 모두 검증하는 RED/GREEN 테스트.

검증 완료:

- RED `.omo/ulw-loop/evidence/g083-launcher-update-flow-red.txt`(도구 부재 시 실패) → GREEN `g083-launcher-update-flow-green.txt`(통과).
- `node tools/run_python_tests.mjs` 통과: Python 125 tests OK.
- `python -m py_compile tools/logh7_launcher_update_flow.py` 통과.
- `git diff --check` 통과(CRLF 경고만).

실제 정적 RE 증거 `.omo/ulw-loop/evidence/g083-launcher-update-flow.json`:

- `Gin7UpdateClient.exe`: `serverIniOverride=true`. config-load 함수 `0x00404de0`가 `[UPDATE]` 섹션의 `SERVER_ADDRESS`/`SERVER_PORT`를 `GetPrivateProfileString` 래퍼 `0x00404fd0`로 읽고, INI 값이 비었을 때만 하드코딩 `202.8.80.179`(push `0x00404eca`)로 폴백한다. `GetPrivateProfileIntA`(`0x00404e13`) 인자에서 `[VERSION, UPDATE]` 확인. 클라이언트는 `.\\exe\\G7MTClient.exe`를 `CreateProcessA`(`0x004072c2`, lpApplicationName=NULL, dwCreationFlags=0x20, wShowWindow=5)로 기동.
- `G7Start.exe`: `exe\\G7MTClient.exe`를 3개 지점에서 `CreateProcessA`로 기동, ini-write + registry import 보유.
- `BootFirst.exe`: `MoveFile` import + `.\\Gin7UpdateClient.new`/`.old` 참조 → 자가 업데이트 파일 교체 보조 증거.

결론(서버 주소 정책 확정):

- **클라이언트 단독 바이너리 패치가 아니라 `SERVER.INI`의 `[UPDATE] SERVER_ADDRESS`(+`SERVER_PORT`) 키로 서버 주소를 로컬로 돌릴 수 있다.** 하드코딩 `202.8.80.179`는 폴백일 뿐이다. 현재 설치 트리에는 `update.ini`(`[UPDATE] VERSION=131 ...`)만 있고 `SERVER_ADDRESS` 키는 없어 폴백이 적용된다. 로컬 플레이는 `SERVER.INI`를 추가/생성하는 정책으로 확정한다.

다음 RE 타깃:

- `SERVER.INI` 파일명 조립 경로(`%sSERVER.INI`의 `%s` prefix = `BASE_DIR`)와 어느 프로세스가 최종적으로 `G7MTClient.exe`에 서버 주소를 전달하는지(updater write-back → client read) 체인을 확정한다.
- 그 위에서 남은 핵심 블로커인 SSLoginOK(`0x0200`)/SSGameLoginOK(`0x0205`) 응답 프레임을 G080 message-family 객체 레이아웃 기반으로 역설계해 서버가 합성하도록 한다. 이것이 "연결만 됨"을 "로그인+월드 진입"으로 바꾸는 단일 관문이다.

## 2026-06-11 로비 블로커 정밀 진단 + 클라 RE 인프라 (최신, 우선)

상세 인수인계: **`docs/codex-handoff-2026-06-11.md`** (자기완결). 요약:
- Cipher(Blowfish, 키=phase1Key) 해독 완료. 13,800함수 Ghidra 디컴파일 인덱스(`tools/logh7_redex.py`).
- 로비 블로커 정밀 핀포인트(frida): **conn2가 0x2001(20B) 수신·링소비까지 하나 decipher(0x645db0)로 디코드 안 됨** — 라우터 `FUN_006130a0`의 conn2 0x0030 분기가 원인.
- 다음 결정타: ui_explorer + 라우터 분기 프로브(frida는 타이밍 레이스 교란으로 간헐적). 그 후 분기 패치 → loginOkFlag.
- 부수: CD 무결성/메달/한글화-폰트(GDI ANSI DEFAULT_CHARSET, cp949 String.txt+1바이트 패치) 모두 정리됨.
