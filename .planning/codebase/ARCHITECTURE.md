# LOGH VII Revival 아키텍처 지도

> 정적 분석 스냅샷: 2026-07-16, `main == origin/main`
>
> 이 문서는 현재 구현의 경계와 다음 개발 순서를 설명한다. 게임 규칙과 와이어 값의 정본은 이 문서가 아니라 CD/정본 EXE, 공식 매뉴얼, 패킷, 라이브 관측이다.

## 1. 현재 결론

LOGH VII Revival은 새 클라이언트를 먼저 만드는 프로젝트가 아니다. 현재 제품 경로는 해시 가드로 패치한 원본 `g7mtclient.exe`를 frontend로 유지하고, Node 서버를 authoritative backend로 붙이는 구조다. 원본 로그인 화면은 `644×484`, 로그인 뒤 게임 영역은 `1920×1080`으로 전환한다.

서버 내부의 의도된 경계는 다음과 같다.

```text
원본 g7mtclient.exe
  UI 표시 · 입력 의도 · 제한적 로컬 상태
           │ legacy TCP / msg32 / 0x0030 envelope
           ▼
server/src/server                    legacy protocol adapter
           │ presentation/session DTO
           ▼
server/src/presentation              composition root · process lifecycle
           │ command/query
           ▼
server/src/application               use case · CQRS · transaction entry
           │ domain entity/event
           ▼
server/src/domain                    authority · invariant · policy
           │ repository / unit of work
           ▼
server/src/infrastructure/persistence
  SQLite production state · catalog · projection · seed
           │ committed result
           └──────────────► legacy broadcast ► 원본 클라이언트들
```

M0.5/M1/M2/M3는 현행 문서 기준 완료했고 M4는 진행 중이다. production 경로의 `EnterWorld`와 `MoveGrid`는 동기 command bus와 SQLite Unit of Work를 사용한다. 성공한 `MoveGrid`는 위치와 `GridMoved` 이벤트 한 건을 같은 transaction에서 커밋하고, 실패하면 둘 다 바꾸지 않는다. 이 경로는 이미 미래 shared core의 씨앗이지만 아직 legacy wire adapter와 완전히 분리되지는 않았다.

## 2. 권위 문서와 증거 순서

현재 작업을 시작할 때 함께 읽어야 할 세 문서는 다음과 같다.

1. [현행 요구사항](../../docs/logh7-requirements-current.md)
2. [아키텍처·운영 기준](../../docs/logh7-architecture-operations-current.md)
3. [현재 실행 계획](../../.omo/plans/logh7-execution-plan-current.md)

[문서 인덱스](../../docs/logh7-document-index-current.md)는 현행/역사 문서를 구분한다. [참고 방법론 라우터](../../docs/logh7-reference-haul.md)는 도구와 외부 사례를 찾는 용도이며 캐논 근거로 승격하지 않는다. 구현 순서와 milestone 상태는 [현행 로드맵](../../docs/logh7-roadmap-current.md), 리마스터 안전 규칙은 [리마스터 준비 기준](../../docs/logh7-remaster-prep-current.md)을 따른다.

증거 우선순위는 다음과 같다.

```text
정본 CD/EXE와 해시
  > 공식 매뉴얼
  > 실제 패킷·클라이언트 메모리·라이브 동작
  > 재현 가능한 추출기와 테스트
  > provisional generated data
  > 외부 레포·유사 게임·추측
```

## 3. 경계별 책임

| 경계 | 현재 구현 | 맡는 책임 | 맡기지 않는 책임 |
|---|---|---|---|
| 원본 클라이언트 | `artifacts/.../g7mtclient.exe`, direct patched copy | 화면, 입력 의도, 정본 클라이언트 FSM 관측 | 최종 권위, 영속성, 임의 게임 규칙 |
| Legacy protocol adapter | [`server/src/server`](../../server/src/server) | framing, encryption, opcode codec, session routing, legacy response/broadcast | 새 규칙의 권위, DB transaction 조립 |
| Presentation/composition | [`presentation/main.mjs`](../../server/src/presentation/main.mjs), [`createPlayableRuntime.mjs`](../../server/src/presentation/createPlayableRuntime.mjs) | process lifecycle, dependency wiring, TCP runtime 구성 | 도메인 정책 자체 |
| Application | [`GameApplication.mjs`](../../server/src/application/GameApplication.mjs), [`handlers.mjs`](../../server/src/application/handlers.mjs), [`bus.mjs`](../../server/src/application/bus.mjs) | command/query dispatch, use case, UoW 경계 | legacy byte layout |
| Domain | [`entities.mjs`](../../server/src/domain/entities.mjs), [`authority-cards.mjs`](../../server/src/domain/authority-cards.mjs), [`strategy-command-catalog.mjs`](../../server/src/domain/strategy-command-catalog.mjs) | invariant, authority, 전략 command admission | socket, SQLite SQL, UI geometry |
| Persistence | [`Database.mjs`](../../server/src/infrastructure/persistence/Database.mjs), [`UnitOfWork.mjs`](../../server/src/infrastructure/persistence/UnitOfWork.mjs) | transaction, identity map, projection, event persistence | 패킷 응답 조립 |
| Static catalog/seed | [`WorldSeedLoader.mjs`](../../server/src/infrastructure/persistence/WorldSeedLoader.mjs), [`WorldCatalog.mjs`](../../server/src/infrastructure/persistence/WorldCatalog.mjs), [`server/data/seed`](../../server/data/seed) | provenance가 붙은 읽기 모델과 seed | 미입증 값을 캐논으로 승격 |
| RE/live QA | [`tools/extract`](../../tools/extract), [`tools/live`](../../tools/live), [`tools/re`](../../tools/re) | 추출, 계측, 패킷/메모리/화면 교차 검증 | production 권위 상태 직접 대체 |
| Future remaster | 현재 활성 클라이언트 런타임 없음 | 같은 command/query와 projection을 소비할 새 presentation adapter | legacy codec 재사용, 별도 게임 권위 |

`server/src/server`는 이름과 달리 전체 backend의 도메인 계층이 아니라 원본 클라이언트 호환 adapter다. 이 구분을 흐리면 opcode 처리기에 DB 업데이트와 게임 규칙이 다시 섞이므로, 신규 M4 규칙은 application/domain에서 먼저 표현하고 adapter는 변환과 전송만 맡겨야 한다.

## 4. 주요 런타임 흐름

### 4.1 프로세스 조립

[`presentation/main.mjs`](../../server/src/presentation/main.mjs)가 CLI entrypoint이고, [`createPlayableRuntime.mjs`](../../server/src/presentation/createPlayableRuntime.mjs)가 다음을 조립한다.

- SQLite 기반 [`GameApplication`](../../server/src/application/GameApplication.mjs)
- 계정 인증 registry
- legacy TCP server와 world session
- `MoveGrid`용 navigability predicate
- 동기 command dispatch bridge
- SQLite catalog 63척 중 라이브 수용이 확인된 선두 19척의 ship slice

`server/src/server/logh7-playable-server.mjs` 단독 실행은 wire 중심 진단 경로다. production entrypoint는 presentation composition root를 통과해야 SQLite CQRS가 주입된다.

### 4.2 로그인과 로비

```text
TCP frame
  → length-prefixed parser
  → 0x0030 envelope/checksum
  → child codec/key setup
  → GIN7 credential parse/auth
  → lobby 0x1000/0x2000 message route
  → character query/create/delete
  → world handoff
```

핵심 codec과 router는 [`logh7-frame-stream.mjs`](../../server/src/server/logh7-frame-stream.mjs), [`logh7-envelope-0030.mjs`](../../server/src/server/logh7-envelope-0030.mjs), [`logh7-child-codec.mjs`](../../server/src/server/logh7-child-codec.mjs), [`logh7-lobby-session.mjs`](../../server/src/server/logh7-lobby-session.mjs)에 있다. JSON character store는 harness/호환 adapter이며 production SQLite 경로와 증거를 섞지 않는다.

### 4.3 월드 진입

[`logh7-world-session.mjs`](../../server/src/server/logh7-world-session.mjs)가 legacy session state와 msg32 요청을 받아 application command로 변환한다. `EnterWorld`가 성공하면 권위 상태를 먼저 커밋하고, 그 결과를 바탕으로 admission/world records를 보낸다.

현재 `0x030b` ship payload는 다음 제한이 있다.

- SQLite ship catalog는 63행이다.
- 클라이언트가 라이브에서 수용한 것은 선두 19행뿐이다.
- body 앞에 `undefined4 * + 1` 성격의 4-byte header가 있고 record stride는 `0x8c`다.
- 20행 이상은 admission 정지를 재현하므로 보내지 않는다.
- 이 slice로 두 클라이언트 진입과 이동은 보존되지만 ship marker root `DAT_009d2fa8`은 null이고 전략 FSM은 state 2에 머문다.

따라서 “패킷 수용”과 “전략 장면 완료”는 서로 다른 gate다.

### 4.4 이동 transaction과 broadcast

```text
legacy 0x0b01
  → world-session decode
  → MoveGrid command
  → account/online/captain/unit/cell/navigation 검증
  → UnitOfWork transaction
      ├─ character/world_fleet 위치 projection
      └─ GridMoved event 1건
  → commit 성공 후 0x0b07 broadcast
```

`MoveGrid`는 현재 `0x0315`가 내보내는 `spaceCells ∪ systemCells`만 허용하고 predicate가 없으면 fail-closed다. 이것은 화면과 권위의 일치를 위한 provisional policy이지 galaxy 데이터의 정본 승격이 아니다.

## 5. RE와 라이브 관측 아키텍처

RE는 한 지점의 추측이 아니라 세 관측면을 같은 session/capture manifest로 묶는 방식으로 수행한다.

```text
클라이언트 내부 관측                 네트워크 관측                 서버 내부 관측
Frida hook/memory/FSM/UI       tshark pcap + wiretap       frame/opcode/session/command
Ghidra decompile/static table  direction/timestamp/bytes   DB/event/broadcast trace
          └──────────────── evidence ledger ────────────────┘
```

### 클라이언트 측

- Ghidra exporter와 정적 문자열/테이블 sweep으로 함수·factory·opcode 후보를 찾는다.
- Frida probe로 reader, dispatch, handler, FSM, marker root, UI geometry, send/recv buffer를 계측한다.
- Win32 UI driver는 원본 클라이언트에서 실제 클릭·월드 진입·복귀를 재현한다.
- hash/signature guard가 있는 executable/resource patch만 재현 가능한 실험으로 인정한다.

### 네트워크 측

- [`tools/live/logh7_capture.mjs`](../../tools/live/logh7_capture.mjs)가 tshark capture와 manifest를 남긴다.
- `_frida_wiretap*` 계열은 암복호화 전후 buffer와 send/recv 경계를 함께 관측한다.
- opcode 수, 길이, 방향, 시점, 클라이언트 FSM 결과를 한 실험 단위로 묶는다.
- 패킷 수정·재전송·차등 주입은 격리된 QA session에서만 하고, 원본/수정 bytes와 rollback을 모두 남긴다.

### 서버 측

- adapter trace는 credential과 session secret을 기본 redaction한다.
- pure transcript regression은 [`logh7-playable-pipeline.mjs`](../../server/src/server/logh7-playable-pipeline.mjs), 실제 TCP는 [`logh7-playable-server.mjs`](../../server/src/server/logh7-playable-server.mjs)에서 관측한다.
- 패킷이 통과해도 DB/event/broadcast와 클라이언트 화면 gate가 함께 통과해야 완료다.
- `tools/live`의 dual-client harness는 입장, 이동 broadcast, 재로그인, 서버 재시작 영속성을 묶어서 검증한다.

외부 Frida/Ghidra 예제는 hook/automation 패턴만 참고한다. offset과 signature는 매 정본 EXE 해시에서 다시 확인해야 한다.

## 6. 현재 데이터와 권위의 상태

| 데이터 | 상태 | 사용 규칙 |
|---|---|---|
| 계정/캐릭터/권한/위치/event | production SQLite authority | command/UoW를 통해서만 갱신 |
| 63 ship catalog | SQLite static catalog | legacy 입장에는 검증된 선두 19행만 사용 |
| 81 strategy commands | 2 factory-confirmed, 79 unresolved | admission skeleton만 존재, outcome 구현 금지 |
| `0x0327` stock | 미확정 | 증거가 생길 때까지 zero-fill |
| galaxy cells/navigability | provisional | 화면-권위 정합용, canonical 승격 금지 |
| synthetic deployment/original candidates | non-canon | QA와 형태 검증에만 사용 |
| JSON character store/run3 | harness/backcompat | production SQLite 증거와 분리 |

[`strategy-command-catalog.mjs`](../../server/src/domain/strategy-command-catalog.mjs)는 command metadata와 admission 기반을 제공하지만 실행 결과는 명시적으로 `not-implemented`다. 다음 구현은 PCP/MCP ledger, CP charge, timer/job, 실제 outcome을 domain/application transaction으로 설계한 뒤 legacy response에 연결해야 한다.

## 7. Future remaster shared-core 경계

현재 활성 `client-unity/` 또는 새 remaster client runtime은 없다. 과거 Unity 경로는 제거되었고, 남은 generated manifest는 provenance/contract 자료이지 실행 가능한 새 frontend가 아니다. 리마스터는 원본 클라이언트를 대체하기 전에 병렬 검증 lane으로 진행한다.

목표 경계는 다음과 같다.

```text
                         ┌─ legacy adapter ─ original client
shared authoritative core
  domain + application  ─┤
  command/query contracts │
  canonical projections   └─ future remaster adapter ─ new client
           │
  SQLite → async-capable UoW → PostgreSQL
```

shared core에 포함할 것:

- command/query DTO와 domain outcome
- authority/invariant와 timer/job semantics
- canonical world/ship/fleet/facility/economy projection
- persistence port와 transaction contract
- adapter-neutral integration tests

legacy adapter에 남길 것:

- `0x0030` envelope, child codec, msg32 opcode와 byte stride
- 원본 session FSM 보정과 admission sequence
- CP932/CP949/GDI/resource 호환 처리
- original-client-only diagnostics

future remaster client가 맡을 것:

- presentation, input, camera/layout, 접근성, 고해상도 asset 선택
- server command 의도 전송과 projection 표시
- 원본 asset fallback, provenance manifest, default-off pack, rollback

새 클라이언트가 별도 규칙·DB·wire truth를 가지면 안 된다. 먼저 `server/src/server`에서 application 호출 전후의 DTO를 안정화하고, 그 계약을 두 adapter가 공유하게 하는 것이 안전한 분리 순서다.

## 8. 현재 구조적 부채와 위험

우선순위 순서다.

1. **M4 전략 command 결과 부재**: 81개 중 79개 factory가 미해결이고 ledger/cost/timer/job/outcome이 없다.
2. **전략 장면 gate 실패**: ship payload admission은 되지만 marker root가 null이고 FSM state 2를 넘지 못한다.
3. **disconnect 영속화 누락**: socket close는 in-memory session만 정리하며 `online=false`를 production DB에 command로 커밋하지 않는다.
4. **동기 application bridge**: SQLite API와 socket dispatch가 sync라 async PostgreSQL adapter를 바로 끼울 수 없다.
5. **legacy adapter 집중도**: `world-session`, `world-records`, `playable-server`에 많은 프로토콜 상태가 몰려 있어 신규 규칙을 잘못 넣기 쉽다.
6. **개발용 인증 경계**: JSON registry/plain development credential과 loopback handoff는 production 보안 모델이 아니다.
7. **생성물/문서 drift**: 일부 remaster manifest와 문서가 현재 트리에서 사라진 generator 또는 제거된 Unity runtime을 가리킨다.
8. **로컬 연구 잔여물**: untracked localization/portrait 도구는 current main의 authoritative pipeline으로 간주하면 안 된다.

## 9. 개발 순서

현행 execution plan을 아키텍처 의존성으로 풀면 다음과 같다.

1. client/server/wire 삼각 계측으로 strategy factory와 command contract를 복구한다.
2. PCP/MCP ledger, CP charge, timers/jobs, domain outcome을 adapter-neutral core에 구현한다.
3. galaxy/fleet/facility/economy data를 source/hash/extractor/reference/test/live gate로 승격한다.
4. disconnect를 application command로 만들고 `online=false`를 같은 persistence 규칙으로 커밋한다.
5. sync 전제를 걷어내고 async-capable UoW/dispatch 계약을 만든 뒤 PostgreSQL adapter를 연결한다.
6. M5 운영 경계를 완성한 뒤 한글화 M6과 remaster M7을 병렬이 아니라 검증 가능한 slice로 진행한다.
7. 새 remaster presentation은 원본 클라이언트와 같은 command/query/outcome을 소비하며 parity gate를 통과해야 한다.

실제 클라이언트 QA는 포트 `47900`을 사용하는 실험끼리 직렬화하고, 원본/패치 해시와 capture manifest, server trace, DB 결과, 화면 증거를 함께 보존한다.

## 10. 정적 분석 범위와 검증 한계

이번 지도는 다음을 정적으로 확인해 작성했다.

- `server/src` 42개 source file, 10,277 lines
- `tools` 167개 실제 파일, 35,562 lines (`__pycache__`, `.pyc` 제외)
- 현행 요구사항/아키텍처/로드맵/실행 계획/문서 인덱스/참고 라우터
- 현재 server composition, command handlers, domain, SQLite UoW, legacy TCP/session/codec, live instrumentation

이번 작업에서는 client/runtime 테스트를 실행하지 않았다. 현재 shell에서 `node`와 `omx` executable을 찾지 못했고, 사용자 기본 Wine prefix를 변경하지 않도록 Wine 계열 명령을 실행하지 않았다. 따라서 테스트 수치는 현행 문서에 기록된 기준선일 뿐 이번 지도의 재검증 결과가 아니다.

또한 현재 트리에 `.codegraph/`, root `package.json`, `server/README.md`, `server/AGENTS.md`, 일부 문서가 가리키는 remaster generator가 없다. 구조 지도는 실제 존재 파일을 기준으로 했고, 이 불일치는 복구 또는 문서 정리 대상으로 남긴다.
