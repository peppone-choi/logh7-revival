# LOGH VII Revival 통합 경계

분석 기준: `main` HEAD `630b9c66`. 상태 표기는 `구현`, `부분`, `누락`, `후보`로 구분한다.

## 시스템 컨텍스트

```text
원본 CD/매뉴얼/EXE
  ├─ 추출·Ghidra ──> 근거/카탈로그/패치 매니페스트
  └─ 패치된 g7mtclient.exe (Wine 목표, 현재 native-Windows 하네스)
                    │ TCP :47900, custom 0x0030/child codec
                    ▼
Node presentation/session ─> application command/query ─> domain authority
                    │                                  │
                    ├─ JSONL trace                     └─ SQLite UoW/event/projection
                    └─ PCAP/Frida 관측                       └─ PostgreSQL 후보
```

제품 권위 경계는 `원본 클라이언트 = 표시/입력 의도`, `서버 = 검증/상태/영속화/브로드캐스트`다. RE/패킷 도구는 사실을 증명하지만 제품 상태 권위가 아니다.

## 통합 매트릭스

| 경계 | 상태 | 현재 계약 | 파일 근거 | 다음 게이트 |
| --- | --- | --- | --- | --- |
| 클라이언트 ↔ TCP 서버 | 구현/부분 | loopback `47900`, 로그인→로비→월드, 0x0030/child codec | `logh7-playable-server.mjs`, `logh7-world-session.mjs` | M4 79개 미해결 command factory와 실제 UI outcome |
| TCP ↔ application | 부분 | `EnterWorld`, `MoveGrid`를 동기 command bus에 전달 | `createPlayableRuntime.mjs`, `handlers.mjs` | 모든 전략 커맨드의 비용/타이머/job/outcome |
| application ↔ SQLite | 구현/부분 | UoW, WAL, state+domain event 원자 커밋 | `Database.mjs`, `UnitOfWork.mjs` | disconnect `online=false`, async 포트 |
| SQLite ↔ PostgreSQL | 후보 | PG pool/migration 스텁과 compose 서비스 | `PgConnection.mjs`, `migrate.mjs`, `0001_init.sql`, `docker-compose.yml` | `pg` 의존성, async UoW, 부팅 선택, backup/restore |
| 서버 ↔ 운영 컨테이너 | 부분 | Node image + Postgres 16 | `server/Dockerfile`, `docker-compose.yml` | Node/`node:sqlite` 호환 확인, healthcheck, secrets, non-loopback auth |
| EXE ↔ 패치 매니페스트 | 구현 | source hash/original bytes/rollback 중심 | `tools/live/prepare_direct_client.mjs`, `tools/patch/*` | Wine 설치 트리에도 동일 해시·백업·rollback 증거 |
| EXE ↔ Frida | 구현(Windows 기준) | ws2_32/dispatcher/cache/FSM/renderer 훅 | `tools/live/_frida_*.js`, `*_diag.py` | Wine 프로세스 attach/모듈 주소/다중 클라 재검증 |
| TCP ↔ PCAP | 구현(Windows 증거) | tshark 인터페이스 + dumpcap BPF + manifest | `tools/live/logh7_capture.mjs`, `.omo/captures/` | macOS/Wine loopback 인터페이스 확정과 디코더 연결 |
| CD ↔ 추출 카탈로그 | 부분 | BIN/CUE→MODE2 ISO→InstallShield→catalog | `tools/extract/logh7-cd-*.mjs`, `logh7-cd-media-manifest.json` | 현재 머신에 원천 재확보 후 해시 재검증 |
| 원본 자산 ↔ 리마스터 | 후보 | R0 fallback + R1/R2/R3 manifest 규칙 | `docs/logh7-remaster-prep-current.md` | 실제 asset pipeline와 실클라 비교 스크린샷 |
| 검증 계약 ↔ Unity | 역사/후보 | 삭제된 Unity 6000.5.2f1 포트 | 현행 요구/아키텍처 문서, git `dbf3b43` | RE 완료 뒤 별도 후보로 복원; 기존 클라 유지 |
| 프로젝트 ↔ 스킬/MCP | 부분 | 15 lock + 추적 orchestrator, 47 MCP schema | `skills-lock.json`, `.agents/skills/`, `mcps/`, `.codex/config.toml` | lock 동기화, macOS 실행 명령, 필요한 런타임 설치 |

## 클라이언트 측 RE 접근

### 정적 분석

- Ghidra가 함수/호출/구조 판정의 권위 도구다. `tools/re/Logh7ExportSelectedDecomp.java`와 `.agents/skills/ghidra/`가 자동화 표면이다.
- PE 직접 파서와 `pefile` miner가 import, 문자열, 섹션, VA/file offset을 교차 확인한다 (`tools/extract/logh7_exe_*`).
- 모든 주소/패치는 정본 EXE 해시와 원본 바이트 서명이 맞을 때만 적용한다.
- 현재 Ghidra 설치와 `.omo/ghidra/` 작업 산출물은 이 머신에 없어 재분석 준비가 필요하다.

### 동적 분석

- Frida JS는 `ws2_32 recv/WSARecv`, frame reader, dispatcher, object table, strategy FSM, marker/cache, renderer를 관측한다.
- Python 드라이버는 Frida event와 Win32 window/input/screenshot을 한 evidence directory에 묶는다.
- x64dbg/ProcDump/Volatility는 문서상 보조 수단이지만 저장소에 자동화가 거의 없다.
- 우회/강제 플래그로 만든 화면은 제품 성공 증거가 아니며, 자연 입력→서버 응답→클라이언트 소비를 재확인해야 한다.

### 패치/개입

- `.rsrc` UTF-16과 코드/리터럴 JSON 패치는 hash guard와 원본 바이트 비교를 거친다.
- in-place 패치 전 원본 백업과 rollback을 별도 검증해야 한다. `logh7_rsrc_patch.py` 자체는 기본 in-place 경로에서 백업을 만들지 않으므로 상위 오케스트레이터가 책임져야 한다.
- DirectX wrapper, GDI proxy, SJIS tunnel은 M6/Wine spike 후보이지 현재 배포 구성요소가 아니다.

## 서버 측 RE·관측 접근

- 서버는 모든 inbound/outbound transport frame과 opcode 처리 지점에서 결정론적으로 관측할 수 있다.
- `--trace`는 JSONL을 남기며 raw inner/secrets는 기본 redaction이다 (`LOGH_TRACE_RAW_INNER`, `LOGH_TRACE_SECRETS`는 격리 QA 전용).
- 코덱 단위 테스트와 실제 클라이언트 입력을 같은 parser/serializer에 통과시켜 wire 추측을 줄인다.
- 권위 상태 판정은 SQLite row, `domain_events`, `world_fleet`, session broadcast를 함께 비교한다. JSON store 라이브 결과를 production SQLite 증거로 대체하지 않는다.
- 안전 경계: public bind의 개발 계정 거부와 reconnect handoff 제한은 있으나 TLS, rate limit, 강한 재연결 티켓, 운영 secret 관리가 없다.

## 패킷 감청·수정·개입 접근

### 수동 감청(현재 있음)

`tools/live/logh7_capture.mjs`는 `tshark -D`로 인터페이스를 찾고 `dumpcap`에 `port 47900` BPF를 전달해 bounded PCAPNG와 manifest를 만든다. 추적된 7개 캡처 중 `login-harness-patched-20260706-2322`만 11 packets이며 나머지 6개는 0 packets다. 따라서 PCAP 존재만으로 프로토콜 성공을 주장할 수 없다.

### 클라이언트 내부 평문 관측(현재 있음)

Frida wiretap은 암호화 전/복호화 후 frame과 dispatcher/cache 소비를 연결할 수 있다. PCAP ciphertext ↔ server trace ↔ Frida decoded event를 timestamp/connection/frame id로 결합하는 공통 correlation id는 아직 없다.

### 능동 중계/수정(누락)

저장소에는 독립 TCP relay/MITM가 없다. 사용자 요구를 안전하게 충족하려면 제품 서버와 분리된 **lab-only packet mediator**가 필요하다.

권장 계층:

1. raw TCP chunk recorder: 양방향 바이트, monotonic timestamp, connection id.
2. transport parser: 길이/transport code/partial-read 재조립.
3. cipher boundary: key phase별 ciphertext와 decoded inner를 함께 보존.
4. rule engine: `observe` 기본, 명시적 `drop/delay/replace/inject`만 허용.
5. replay corpus: 원본 packet SHA-256, 변형 diff, 서버/클라이언트 결과를 한 manifest에 기록.
6. fail-closed: unknown phase/code/length/hash에서는 전달 또는 중단만 하고 임의 바이트를 만들지 않음.

이 중계는 정본 프로토콜을 대체하거나 공개 트래픽을 가로채는 용도가 아니라, 사용자 소유 클라이언트와 로컬 서버의 결정적 실험 전용이어야 한다.

## Wine 통합 경계

현재 live 하네스는 `sys.platform == win32`, `ctypes.windll`, `tasklist/taskkill`, pywin32, Windows ImageGrab을 전제로 한다. macOS 호스트에서 Wine EXE만 띄우면 이 하네스가 자동으로 작동하지 않는다.

필요한 파일/계약:

- `wine-environment` manifest: Wine 11.0 app path, dedicated prefix path, arch, renderer, locale, overrides, EXE/asset hash.
- 실행 래퍼: 모든 호출에 명시적 `WINEPREFIX`; default `~/.wine` 접근 금지; Wine 초기화 도구 자동 실행 금지.
- 클라이언트 런처: 설치 폴더 cwd, 직접 `g7mtclient.exe`, stdout/stderr/Wine debug log, process cleanup.
- 입력/화면 어댑터: Wine 창 식별·client rect·좌표·스크린샷을 native-Windows 드라이버와 분리.
- Frida 결정: Wine 내부 Windows Python/Frida 또는 호스트 attach 중 하나를 spike로 입증한 뒤 선택.
- PCAP 결정: macOS loopback/utun 인터페이스와 Wine socket 노출을 확인하고 server trace로 packet count 교차검증.
- D3D8 matrix: builtin/wined3d 우선, DXVK/D3D8·dgVoodoo류는 격리 후보; 그래픽·입력·오디오·IME·네트워크 모두 증거화.

부수효과 방지를 위해 이번 분석에서는 Wine 관련 실행 명령을 하나도 수행하지 않았다.

## 데이터·DB 통합 경계

현재 synchronous SQLite facade가 application과 world catalog 전체에 누출되어 있다. PostgreSQL 이식 순서는 다음과 같아야 한다.

1. command/query handler와 UoW를 Promise 기반 port로 승격.
2. SQLite/PG adapter 모두 동일 contract test 통과.
3. `DATABASE_URL` 기반 명시적 boot selection과 migration wiring.
4. event + projection 원자성, reconnect/restart persistence, disconnect offline 상태 검증.
5. backup/restore와 schema drift 검사 후 Docker 기본 경로 전환.

`docker-compose.yml`의 `DATABASE_URL`은 현재 소비되지 않으므로 환경변수 존재를 PG 통합으로 보고하면 안 된다.

## 자산·리마스터·Unity 경계

- 원천: Archive BIN/CUE와 공식 PDF. 현재 원천 디렉터리가 없으므로 tracked manifest를 실파일로 오인하지 않는다.
- R0 원본을 읽기 전용으로 보존하고, 모든 R1/R2/R3 결과는 별도 pack/manifest/default-off/rollback을 가진다.
- 1080p는 코드/레이아웃 패치이지 HD asset 완료가 아니다.
- 필요한 스킬: `image-upscaling`, `game-assets`, `game-3d-assets`, `game-engine`, `smart-ocr`/`pdf-ocr`; 현재 미설치다.
- 저장소의 Figma MCP schema 자체에는 실행 서버/인증이 없다. 이번 작업에서 Codex용 Figma connector 설치는 완료했지만 프로젝트 파일·권한·실제 handoff는 아직 검증하지 않았으므로, 디자인 검토/에셋 전달 단계에서 별도 연결 증거를 남긴다.
- Unity는 RE 완료 뒤 서버의 검증된 domain/wire 의미를 재사용하는 별도 리마스터 후보다. 기존 클라이언트를 계속 제품 호환 오라클/플레이 경로로 유지한다.

## 실행 환경과 누락 의존성

| 항목 | 관측 | 영향 |
| --- | --- | --- |
| Wine | 앱 11.0 존재, PATH 없음, 실행 금지 준수 | 전용 prefix/래퍼 없이는 테스트 재현 불가 |
| Node/npm | PATH 없음; 번들 loader도 응답 없음 | server/tool/test 실행 경로 미확정 |
| Python | 시스템 3.9.6 | 요구 `>=3.11`, Frida/Pillow/Pydantic 등 미충족 |
| Docker/Postgres CLI | PATH 없음 | compose/PG 전환 검증 불가 |
| Ghidra/Frida | PATH 없음 | 새 정적/동적 RE 실행 불가, 기존 산출물만 분석 가능 |
| tshark/dumpcap | PATH 없음 | 새 PCAP 불가; 기존 Windows 4.4.6 manifest만 있음 |
| 원본 artifacts | 현재 없음 | 설치/실클라/Wine 라이브 검증 불가 |
| Unity | 프로젝트/Editor 없음 | 장기 후보만 가능 |
| MCP | schema만 47개; `.codex/config`는 Windows 고정 | macOS 현재 세션에서 호출 불가 |

## 통합 우선순위

1. 원천 BIN/CUE·설치 EXE 재확보 후 해시 재검증.
2. side-effect-free Wine environment manifest/launcher를 만들고 로그인 화면까지만 smoke.
3. Node server runtime을 재현 가능하게 고정하고 Wine 클라이언트와 TCP 47900 연결.
4. PCAP + server trace + Frida decoded event correlation을 한 evidence schema로 통합.
5. M4 command authority/data를 wire/UI/SQLite 증거로 닫기.
6. async persistence port와 PostgreSQL을 연결.
7. M5 전술/전투, M6 한글화, 병렬 remaster asset pipeline 진행.
8. RE 의미가 안정된 뒤에만 Unity 후보를 별도 브랜치에서 복원·재이식.

## 검증 한계

이번 작업은 파일/설정/매니페스트 정적 분석이다. Wine, Node tests, Docker, Frida, Ghidra, tshark를 실행하지 않았으며 기존 로그의 성공 수치를 재검증한 것으로 주장하지 않는다. 관측된 실패는 (1) Codex dependency loader 장시간 무응답 후 종료, (2) 비 UTF-8 Python에서 첫 `sed` 스캔 실패 후 `LC_ALL=C` 재집계, (3) 빈 zsh glob 중단 후 `find` 재집계로 각각 격리·해결했다.
