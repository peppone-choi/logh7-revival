# LOGH VII Revival 기술 스택

분석 기준: `main` HEAD `630b9c66`, 2026-07-16 13:18 KST. 이 문서는 현재 추적 파일을 설명하며, 오래된 문서의 Unity/HTTP 경로를 현재 구현으로 오인하지 않는다.

## 결론

현재 제품은 **32비트 원본 Win32/D3D8 클라이언트 + 의존성 없는 Node.js 바이너리 TCP 권위 서버 + SQLite** 조합이다. Python/Frida/Ghidra/PCAP은 관측·패치·증거 생성 도구이며 제품 런타임이 아니다. PostgreSQL은 스키마와 연결 스텁만 있고 부팅 경로에 연결되지 않았다. Unity는 2026-07-04에 작업트리에서 제거됐고, RE가 닫힌 뒤 재이식할 장기 후보일 뿐이다.

근거: `AGENTS.md`, `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`, `.omo/plans/logh7-execution-plan-current.md`, `server/src/presentation/createPlayableRuntime.mjs`.

## 전수 파일 인벤토리

`git ls-tree -r --name-only HEAD`로 HEAD의 모든 4,143개 경로를 열거했다. 텍스트 소스·설정·현행 문서는 내용/참조를 분석했고, 이미지·PCAP·EXE·BIN·PDF는 경로·크기·해시·매니페스트만 확인했다. 대형/불투명 바이너리를 본문처럼 읽지 않은 이유는 정본 훼손 방지와 사용자 지시(메타데이터만) 때문이다.

| 확장자/유형 | 수 | 분석 범위 |
| --- | ---: | --- |
| `.png` | 2,727 | 증거/스크린샷 경로 인벤토리; 픽셀 전수 판독 제외 |
| `.md` | 426 | 현행 권위 문서 우선, 역사 문서는 라우팅/증거로 분리 |
| `.json` | 297 | 설정·시드·매니페스트·패치 계약; AI 생성 JSON은 정본으로 자동 승격하지 않음 |
| `.mjs` | 126 | Node 서버·추출·패치·캡처 구현 분석 |
| `.jpg` | 117 | 원본/참조 이미지 메타데이터만 |
| `.py` | 95 | 추출·Frida·Win32 라이브 하네스와 외부 import 분석 |
| `.jsonl` | 57 | 트레이스/RE 증거 형식 확인 |
| `.log` | 56 | 기존 실행 증거로만 취급, 현재 재실행 아님 |
| `.txt` | 44 | 추출/RE 데이터; 인코딩 혼재 확인 |
| `.c` | 40 | 디컴파일/RE 산출물, 재빌드 소스가 아님 |
| `.bin` | 39 | 바이너리 증거 메타데이터만 |
| `.js` | 30 | Frida 프로브 중심 |
| `.gif` | 18 | 시각 증거 메타데이터만 |
| `.java` | 14 | Ghidra 스크립트/산출물 |
| `.pid` | 13 | 과거 런타임 증거, 실행 상태로 간주하지 않음 |
| `.sh` | 8 | 도구/훅 정적 확인 |
| `.toml` | 7 | 에이전트/도구 설정 |
| `.pcapng` | 7 | 캡처 매니페스트와 SHA-256만 확인 |
| `.pdf` | 5 | 공식 매뉴얼 원천; 바이너리 본문은 이번 매핑에서 제외 |
| `.mdx` | 4 | 모델 바이너리 메타데이터만 |
| 확장자 없음/닷파일 | 3 | Git/프로젝트 설정 |
| `.tsv` | 2 | 카탈로그 데이터 |
| `.ts` | 2 | 타입스크립트 도구 표면 |
| `.html` | 2 | 개발 대시보드/로스터 편집기 |
| `.yml` | 1 | 설정 |
| `.sql` | 1 | PostgreSQL 타깃 마이그레이션 |
| `.exe` | 1 | 정본/패치 증거 메타데이터만 |
| `.cmd` | 1 | Claude Code 설치 스크립트; 게임 설치기가 아님 |

상위 경로 분포는 `server/` 2,704, `.omo/` 634, `docs/` 437, `tools/` 149, `.agents/` 75, `mcps/` 47, `agent/` 46, `.claude/` 36, 루트 8, `.codex/` 7이다. `server/content/` 1,903개와 `server/data/` 699개가 대부분의 이미지/증거/카탈로그를 차지한다.

작업트리 스냅샷은 산출물 작성 전 non-ignored untracked 79개, ignored 12,274개였다. 이 중 `content/`, 초상/검증 문서·도구, `.omo/venv-vision/`, 새 스킬/훅은 사용자 또는 병렬 에이전트 소유이므로 **main의 사실과 분리했고 수정하지 않았다**. ignored 대다수는 `.omo/` 9,776개와 `node_modules/` 2,414개다.

## 제품 런타임

### 원본 클라이언트

| 항목 | 현재 기술 | 파일 근거 |
| --- | --- | --- |
| 실행물 | 32비트 Win32 PE `g7mtclient.exe`, 설치 폴더에서 직접 실행 | `docs/logh7-requirements-current.md`, `tools/live/prepare_direct_client.mjs` |
| 그래픽 | Direct3D 8; D3D8 변환은 Wine 호환성 후보 | `docs/logh7-requirements-current.md`, `server/content/extracted/binary-strings-G7MTClient.json` |
| OS API | GDI32, IMM32, DINPUT8, DSOUND, WINMM, WS2_32, `d3dxof.dll` | `server/content/extracted/binary-strings-G7MTClient.json` |
| 화면 | 로그인 644×484 보존, 로그인 후 1920×1080 패치 | `server/content/client/logh7-1080p-client-patch.json`, `AGENTS.md` |
| 패치 | 해시 가드 JSON 매니페스트 + 직접 EXE/`.rsrc` 패치 | `tools/patch/exe-patch.mjs`, `tools/patch/logh7_rsrc_patch.py`, `server/content/client/*.json` |
| 인코딩 | 원본 CP932; M6에서 CP949 변환 대 SJIS tunneling/GDI proxy 비교 | `docs/logh7-localization-font-current.md` |

정상 플레이어 경로에 `ui_explorer`, overlay, 강제 시드, Frida가 끼면 안 된다. 이들은 불명확한 동작을 관측하는 진단 수단이다.

### Node.js 권위 서버

| 계층 | 기술/역할 | 파일 근거 |
| --- | --- | --- |
| Presentation | `node:net` TCP 서버, 기본 `127.0.0.1:47900`, 세션/와이어 연결 | `server/src/presentation/main.mjs`, `createPlayableRuntime.mjs`, `server/src/server/logh7-playable-server.mjs` |
| Wire/codec | big-endian 길이 프레임, `0x0030` 봉투, child codec, 로그인·로비·월드 레코드 | `server/src/server/logh7-frame-stream.mjs`, `logh7-envelope-0030.mjs`, `logh7-child-codec.mjs`, `codec/` |
| Application | 동기 command/query bus, `EnterWorld`·`MoveGrid` | `server/src/application/*.mjs` |
| Domain | entity, authority card, strategy command catalog | `server/src/domain/*.mjs` |
| Persistence | `node:sqlite` `DatabaseSync`, UoW/identity map, WAL, event + projection 동시 커밋 | `server/src/infrastructure/persistence/Database.mjs`, `UnitOfWork.mjs` |
| Static data | JSON seed → SQLite catalog | `server/data/seed/*.json`, `WorldSeedLoader.mjs`, `WorldCatalog.mjs` |

`server/package.json`은 ESM, Node `>=20`, 외부 runtime dependency 0개다. 루트 `package.json`과 모든 npm lockfile은 없다. 테스트 명령은 `npm --prefix server test`에 해당하지만 이번 매핑에서는 실행하지 않았다.

## 데이터베이스와 운영

- 현재 부팅: SQLite `server/data/logh7.sqlite`, 동기 `node:sqlite`, WAL.
- PostgreSQL 후보: `postgres:16-alpine`, `server/migrations/0001_init.sql`, `PgConnection.mjs`, `migrate.mjs`.
- 미연결: `main.mjs`/`createPlayableRuntime.mjs`는 `DATABASE_URL`을 읽지 않는다. `pg` 패키지도 `server/package.json`에 없다.
- `docker-compose.yml`은 DB와 서버를 선언하지만, 서버 컨테이너는 여전히 SQLite로 부팅한다.
- 운영 리스크: `server/Dockerfile`은 Node 20을 사용하면서 소스는 `node:sqlite`를 import한다. 실제 이미지 호환성 검증 전까지 배포 가능으로 간주하면 안 된다.
- PG 스키마는 SQLite의 최신 `authority_cards_seeded` 보정과 완전 동기인지 재검토가 필요하다.

## RE·추출·라이브 도구 스택

| 축 | 현재 구현 | 외부 의존성/조건 |
| --- | --- | --- |
| 정적 RE | Ghidra Java export, PE 문자열/테이블 miner | Ghidra/analyzeHeadless, Java; 현재 PATH에 없음 |
| 동적 RE | 42개 Python `frida` import, 다수 JS `Interceptor` 프로브 | Frida `>=17.2`; 현재 PATH/Python에 없음 |
| Win32 자동화 | `ctypes.windll`, SendInput, ImageGrab, pywin32 | Windows Python 또는 검증된 Wine 내부 Windows Python 필요 |
| PCAP | `tshark` 인터페이스 탐색 + `dumpcap` bounded capture + manifest | Wireshark/dumpcap; 현재 PATH에 없음 |
| 추출 | Node/Python CD/ISO/InstallShield/MsgDat/MDX/TCF/PDF 도구 | Python 3.11+, PyMuPDF, pefile; 일부 도구는 외부 CLI 필요 |
| 시각 증거 | Pillow ImageGrab, PNG/JSONL 로그 | Pillow; Wine 창 캡처 방법은 미배선 |

Python 외부 import는 Frida, Pillow, pefile, PyMuPDF(`fitz`), pydantic, typer, pytest, pywin32다. 통합 `pyproject.toml`/requirements/lock은 없고 일부 파일만 PEP 723 메타데이터를 가진다. 6개 Python 파일은 UTF-8이 아니어서 바이트 안전 도구가 필요하다.

## Wine 실행 환경

호스트에는 `/Applications/Wine Stable.app` 11.0이 있으며 실제 바이너리는 `Contents/Resources/wine/bin/wine`이다. 사용자 지시와 부수효과 방지 때문에 어떤 Wine/wineboot/winecfg/winetricks 명령도 실행하지 않았다.

현재 저장소에는 다음이 없다.

- 명시적 `WINEPREFIX`/`WINEARCH` 정책과 prefix manifest
- 기본 `~/.wine` 접근을 차단하는 실행 래퍼
- 32비트 D3D8, DirectInput, DSOUND, IME/CP932/CP949 검증 매트릭스
- Wine 안에서 Windows Python/Frida/pywin32를 구동하는 재현 가능한 환경
- 호스트 Node 서버 + Wine 클라이언트 + PCAP을 한 세션으로 묶는 오케스트레이터

따라서 “Wine으로 실행/테스트”는 현재 요구사항이지 구현된 스택이 아니다. 전용 격리 prefix, exact app/version, EXE/자산 해시, 렌더러, 로그, rollback을 먼저 계약으로 만들어야 한다.

## 리마스터/Unity 후보

현재 리마스터 구현은 원본 로그인 크기 보존과 본게임 1080p 네이티브 레이아웃까지다. 고해상도 텍스처·초상·3D·이펙트·사운드는 미착수다. R0 원본 fallback과 R1/R2/R3 provenance가 필수다 (`docs/logh7-remaster-prep-current.md`).

Unity 6000.5.2f1 경로는 커밋 `ca24dd3`에서 제거됐고 현재 `client-unity/`가 없다. 필요하면 보존 커밋 `dbf3b43`에서 **별도 후보 브랜치/작업트리로** 복원해 서버의 검증된 계약만 재이식한다. 기존 클라이언트를 버리는 대체 경로로 승격하지 않는다.

## 스킬·MCP·설치 상태

- `skills-lock.json`: 15개 잠금(binary-triage, ghidra, protocol-reverse-engineering, rev-frida, TDD/검증/디버깅 등).
- 실제 추적 스킬: `.agents/skills/logh7-orchestrator/`가 있으나 lock에 없다. 병렬 작업 중 untracked `harness`도 생겨 lock drift가 있다.
- 리마스터 문서가 요구하는 `image-upscaling`, `game-assets`, `game-3d-assets`, `game-engine`, 그리고 RE 보강 후보 `rev-struct`, `pdf-ocr`/`smart-ocr`는 현재 프로젝트에 없다.
- `mcps/`에는 47개 **도구 스키마**(Firecrawl 26, shadcn 10, tasks 6, Figma 2, Context7 2, sequential-thinking 1)가 있으나 실행 패키지/매니페스트는 없다.
- `.codex/config.toml`의 Context7/filesystem MCP는 Windows `cmd`와 `E:\logh7-revival`을 고정해 현재 macOS에서 실행 불가다.
- `install.cmd`는 Claude Code Windows 64-bit 설치기이며 게임/Wine/RE 의존성 설치기가 아니다.

## 확인된 누락과 드리프트

1. `artifacts/`와 `.omo/work/logh7-cd-extract/`는 현재 checkout에 없다. 추적된 `logh7-cd-media-manifest.json`은 BIN 229,070,688B와 ISO 199,462,912B의 과거 검증 값을 담지만 현재 파일 존재 증거는 아니다.
2. 문서 인덱스가 가리키는 `server/README.md`, `server/AGENTS.md`는 HEAD에 없다.
3. `.codegraph/`와 `omx` 실행 파일이 없다. 단순 탐색은 `rg`/Git 인벤토리로 대체했다.
4. 시스템 PATH에는 Node/npm/Docker/Frida/Ghidra/tshark/psql/uv가 없고 Python은 3.9.6뿐이다. Codex 번들 dependency loader는 90초 이상 응답하지 않아 종료했으며, 번들 런타임 경로는 확인하지 못했다.
5. 첫 Python import 스캔은 비 UTF-8 파일에서 `sed: illegal byte sequence`가 났다. `LC_ALL=C`로 재실행해 95개 Python 파일 집계를 완료했다.
6. Wine 앱은 발견했지만 실행하지 않았다. default `~/.wine` 부수효과를 피하기 위한 명시적 금지 기준이다.

## 소스 오브 트루스

- 현재 상태/경계: `AGENTS.md`, 세 현행 권위 문서, `.omo/plans/logh7-execution-plan-current.md`
- 서버: `server/src/`, `server/package.json`, `server/tests/`
- 도구: `tools/extract/`, `tools/live/`, `tools/patch/`, `tools/re/`
- 원천 메타데이터: `server/content/generated/logh7-cd-media-manifest.json`, `docs/reference/*.pdf`
- 패킷 증거: `.omo/captures/*/capture.manifest.json` + `.pcapng`
- 리마스터: `docs/logh7-remaster-prep-current.md`, `server/content/client/logh7-1080p-client-patch.json`
