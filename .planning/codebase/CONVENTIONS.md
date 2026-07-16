# LOGH VII Revival 개발 컨벤션

> 정적 분석 기준: 2026-07-16, `HEAD == origin/main == 630b9c663040e24304028be10a4ffc62134bc27f`
>
> 범위는 `git ls-files`로 고정했다. 기존 untracked 연구 파일은 현재 main의 규칙이나 구현으로 간주하지 않았다.

## 1. 지침과 근거의 우선순위

1. 루트 `AGENTS.md`가 현재 작업 계약이다.
2. 시작 문서는 `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`, `.omo/plans/logh7-execution-plan-current.md` 세 개다.
3. `docs/logh7-document-index-current.md`로 현행 문서와 역사 자료를 구분한다.
4. `docs/logh7-reference-haul.md`는 방법론 라우터일 뿐 캐논 데이터 근거가 아니다.
5. 게임 규칙과 wire 값의 근거 우선순위는 정본 CD/EXE와 해시, 공식 매뉴얼, 실제 패킷·메모리·화면, 재현 가능한 추출기·테스트, provisional 데이터, 외부 레포·추측 순이다.

`CLAUDE.md`와 오래된 dashboard/loop-state에는 리셋 전 경로와 테스트 수가 남아 있다. 현재 `AGENTS.md` 및 실제 tracked 파일과 충돌하면 따르지 않는다. `.codegraph/`는 이 checkout에 없으므로 이번 지도는 `rg`와 직접 파일 읽기로 만들었다.

## 2. 제품과 계층 경계

- 원본의 수정된 `g7mtclient.exe`가 frontend다. 화면, 입력 의도, 제한적 로컬 상태만 맡는다.
- Node 서버가 authoritative backend다. 입력 검증, 게임 상태, 영속성, 다른 클라이언트 broadcast를 맡는다.
- 정상 플레이 경로는 설치 폴더의 수정된 EXE 직접 실행이다. `ui_explorer`, Frida, overlay, preseed, trace 도구는 진단 경로다.
- 신규 서버 기능은 `presentation/session -> application command/query -> domain authority -> persistence` 순서를 지킨다.
- `server/src/server/`는 이름과 달리 legacy protocol adapter다. 신규 게임 규칙이나 DB transaction 조립을 여기에 직접 넣지 않는다.

| 위치 | 책임 |
|---|---|
| `server/src/presentation/` | composition root, 프로세스와 dependency wiring |
| `server/src/application/` | command/query dispatch, use case, UoW 진입점 |
| `server/src/domain/` | authority, invariant, 정책, event |
| `server/src/infrastructure/persistence/` | SQLite transaction, repository, catalog/seed; PG는 아직 목표 adapter |
| `server/src/server/` | TCP framing, 암복호, opcode codec, legacy session/response |
| `tools/extract/`, `tools/re/`, `tools/live/` | 추출·RE·계측·QA; production 권위 상태의 대체물이 아님 |

## 3. 언어·파일·스타일

### JavaScript/Node

- `server/package.json`은 private ESM package이고 소스/테스트는 `.mjs`를 쓴다.
- 최소 선언은 Node `>=20`이지만 현재 코드가 `node:sqlite`의 `DatabaseSync`를 사용하므로 실제 runner는 해당 API를 제공해야 한다.
- 서버 runtime dependency를 추가하지 않고 Node built-in을 우선한다. 현재 lockfile과 외부 runtime dependency가 없다.
- 테스트는 `node:test`와 `node:assert/strict`를 사용한다.
- 임시 파일·DB·socket은 `mkdtemp`/OS temp 아래 만들고 `finally` 또는 test cleanup에서 닫는다.

### Python

- 신규 dependency-heavy 도구는 Python `>=3.11`과 PEP 723 inline metadata/`uv run --script` 패턴을 따른다.
- 기존 Win32 live 도구는 `ctypes.windll`, pywin32, PowerShell, Frida를 사용한다. 이를 macOS-native Python 도구처럼 취급하지 않는다.
- UI/PE 도구의 순수 로직은 가능한 한 fixture와 mock으로 분리해 client 실행 없이 검사한다.

### 주석과 이름

- 코드 주석은 한글로 쓴다. 캐논 일본어 용어, opcode, VA/file offset, 구조체 필드명은 원문을 유지한다.
- wire 상수는 opcode/크기/endian/근거 함수 주소를 함께 드러낸다.
- SQL migration은 `NNNN_snake_name.sql`, 자체 `BEGIN/COMMIT`, roll-forward only다.
- formatter/linter 설정(`eslint`, `prettier`, `ruff`, `.editorconfig`)은 tracked tree에 없다. 기존 파일의 형식과 `git diff --check`가 최소 스타일 gate다.

## 4. 증거 우선과 fail-closed

- 모르는 값은 만들지 않는다. 미확정 값은 zero/empty, `not-implemented`, provisional/P3로 남긴다.
- P0=원본 바이너리, P1=공식 문서, P2=신뢰 가능한 재구성, P3=개발용 추측이다.
- 리마스터는 R0 원본 fallback, R1 원본 파생, R2 수작업 대체, R3 생성/커뮤니티 자산을 분리한다.
- parser/decoder는 잘못된 길이, count, endian, checksum, path traversal, hash drift를 조용히 보정하지 않고 거부한다.
- server command 실패는 DB, in-memory session, domain event, 응답을 모두 바꾸지 않아야 한다.
- 외부 레포는 gitignored `reference/` 아래에만 두고 라이선스 확인 없이 코드를 이식하지 않는다.

## 5. 바이너리·패치 컨벤션

- 정본 source EXE SHA-256은 `9c97de2ae426f011680992d6c8d88b25488b5f51555ce5784aeef677f334bb51`다.
- 현재 direct/1080p/한글 패치 결과물의 문서상 SHA-256은 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22`다.
- in-place 패치는 원본 backup, source-hash guard, 각 site의 original-byte guard, dry-run, 원자 교체, rollback을 모두 갖춰야 한다.
- source와 output이 같은 파일/하드링크인지 검사하고, 예상 patched hash와 다른 결과를 쓰지 않는다.
- 정본 EXE가 없을 때 sparse PE fixture 계약은 patch engine만 증명한다. 실제 client 호환 증거로 승격하지 않는다.
- CP932/CP949 자산을 임의로 UTF-8로 저장하지 않는다. 인코딩, GDI charset/font, 입력, 송수신을 같은 live 시나리오에서 검증한다.

## 6. 테스트 작성 관례

- 수정 전 실패하는 최소 regression을 먼저 고정하고, 가장 작은 구현으로 통과시킨다.
- byte protocol은 exact length, record offset/stride/cap, endian, checksum, frame split/coalescing을 잠근다.
- real-client golden은 출처 문서/캡처/정본 해시를 주석으로 남긴다. 합성 fixture를 실측 golden이라고 부르지 않는다.
- integration test는 loopback TCP와 temp store/SQLite를 사용하며 실제 EXE를 띄우지 않는다.
- optional 정본 artifact와 Windows-only 동작은 명시적 conditional skip만 허용한다. skip을 pass 증거로 세지 않는다.
- source-inspection test(`logh7-live-input-driver`, `logh7-strategy-probe-order`)는 도구의 안전 순서만 잠근다. live 동작을 증명하지 않는다.
- 서버 테스트가 통과해도 gameplay slice 완료가 아니다. 해당 기능의 원본 client 화면/패킷/서버 상태가 함께 입증돼야 한다.

## 7. 라이브 QA 컨벤션

- 포트 `47900`을 쓰는 live run은 직렬화한다.
- 매 run에 EXE hash, patch manifest/receipt, server trace, packet/Frida trace, DB/store 결과, 전후 screenshot, process/port cleanup을 남긴다.
- 두 클라이언트 증거는 별도 PID, 양쪽 world 진입, A request, B notify 수신·적용, relogin retention, server-restart retention, cleanup을 각각 gate로 판정한다.
- `0x0b01` request 뒤 `0x0b07` response/broadcast 순서와 실제 destination cell 영속을 확인한다. 화면 생존만으로 이동 성공을 주장하지 않는다.
- `ui_explorer`/Frida 증거는 진단용이다. 정상 direct launch도 별도로 검증한다.
- `node.exe` blanket kill은 금지하며, 기록된 PID만 종료한다.
- Wine에서 실행할 때도 client 내부 Win32/D3D8, HWND 입력, Frida PID, loopback, drive mapping이 모두 실제로 연결됐다는 증거가 필요하다.

## 8. 문서와 작업트리

- 작업 시작 시 dirty worktree를 보존한다. unrelated staged/unstaged/untracked 파일을 정리하거나 `git add -A`하지 않는다.
- 같은 증상 3회 또는 새 증거 없는 조사 2회면 접근 축을 바꾸고 blocker를 문서화한다.
- LOGH VII 작업 단위는 종료 전에 `AGENTS.md`, 영향받은 current docs, Obsidian `현재 상태.md`/로드맵을 동기화한다.
- 단순 진행 로그를 누적하지 않고 낡은 지침을 수정·삭제하며, 반복 설명은 하나의 source of truth로 합친다.
- 커밋은 Lore protocol의 intent line과 필요한 `Constraint`, `Rejected`, `Confidence`, `Scope-risk`, `Directive`, `Tested`, `Not-tested` trailer를 따른다.

## 9. 현재 확인된 컨벤션 드리프트

- root `package.json`과 `playwright.config.js`가 없다. 테스트 명령은 root가 아니라 `server/package.json`이 권위다.
- CI workflow가 없다. 로컬 gate가 유일한 실행 표면이다.
- `.gitignore`가 `.omo/live-qa/*`를 무시하므로 최신 run9/run3/run5 증거는 문서에만 있고 이 checkout에는 없다.
- `docs/logh7-developer-dashboard.html`에는 제거된 `tests/server/...`, Unity, 과거 152/458 test 수가 남아 있다. derived dashboard를 명령 근거로 사용하지 않는다.
- `logh7-orchestrator`는 프로젝트 로컬 `.agents/skills/logh7-orchestrator/`에 존재한다. 글로벌 설치로 중복하지 말고 프로젝트 하네스의 canonical workflow로 유지하며, `.codex` adapter와의 routing 정합성을 검증한다.
- current docs의 Python live baseline `16/16`은 최신 tracked `test_m3_multiclient_probe.py`의 17개 테스트 함수와 어긋난다. 새 검증 시 수치와 명령을 함께 갱신해야 한다.

## 10. 변경 전 체크리스트

- 관련 `reference-haul` 트랙과 current docs를 읽었는가?
- canonical/provisional/diagnostic 경계를 명시했는가?
- 변경이 올바른 계층에 있는가?
- 실패/rollback/무변경 경로를 test로 잠갔는가?
- exact command와 artifact 조건을 기록했는가?
- client-visible 변경이면 Wine real-client gate까지 계획했는가?
- docs/AGENTS/vault 동기화 범위를 정했는가?
