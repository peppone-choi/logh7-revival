# LOGH VII Revival Current Roadmap

> **2026-07-20 실행 오버레이:** 현재 최우선 게이트는 GitHub #216 / Jira LOGH7-213의 15축 전체 인과 역기획 원장이다. 사용자가 [`logh7-causal-ledger-master-design.md`](logh7-causal-ledger-master-design.md)와 PR #232 merge를 승인했으며, PR merge read-back 전에는 제품 구현을 재개하지 않는다. merge 뒤에는 D0→A01을 먼저 닫고 문서의 하드 DAG에 따라 #217~#231을 각각 독립 PR로 처리한다. 아래 P0→P1→P2→M4 기록은 폐기하지 않고 이 원장의 현행 증거·미해결 노드로 편입한다.
> **TL;DR** M1~M3 라이브 완료(로그인→로비→월드·캐릭터), M4 전략맵은 구현 완료·관측 게이트 중. 다음 P0 = 실행 환경별 client runtime/EXE 계보/증거 복구(native Windows 직접 실행, macOS/Linux 격리 Wine). 데이터 승격 규칙: 정본 = 코드·테스트 실행 기록(명령·산출물·계보 함께), 문서는 예보일 뿐.

작성일: 2026-07-06 (현행화: **2026-07-20**)

> 상세 실시간 저널은 [[logh7-loop-state]]. 캐릭터 생성 플로우는 [[logh7-m2-character-creation-flow]]. 이 페이지는 마일스톤 수준 현황만 유지한다.

## 현재 판정 (2026-07-17)

목표는 원본 클라이언트 + 자체 서버로 은하영웅전설 VII의 온라인 기능 전체를 되살리는 것이다. M0.5/M1/M2/M3의 완료 판정은 유지한다. 마일스톤은 `4/8 = 50%`지만, 무거운 M4~M7을 반영한 전체 작업량은 보수적으로 `30~40%`, 대표값 `35%`다.

현재 checkout에는 run9/run3/run5 evidence directory가 없어 과거 live 수치를 release gate로 재사용할 수 없다. 다만 저장소 밖 복구 lineage에서 canonical `bd192...`부터 working `825635...`까지의 stage receipt·backup·rollback·sentinel을 검증했고, 2026-07-17 macOS Wine Stable 11의 명시적 WoW64 run에서 client process와 서버 로그인 패킷 도달까지 fresh 확인했다. 입력한 자격증명은 `invalid-credentials`로 거절됐고 client exit 3·사용자 관측 runtime error가 발생했으므로 로그인·게임플레이와 cross-platform 전체 pass는 여전히 미종결이다. 아래 M0.5~M3는 **완료 이력**으로 유지하고, M4 전에는 frozen baseline과 선택 runtime의 full evidence를 복구·재실행해야 한다.

| 마일스톤 | 상태 | 근거 |
|---|---|---|
| **M1 로그인→로비** | ✅ 라이브 완료 | 실클라가 0x0034/0x0035/0x0036 핸드셰이크→GIN7 자격증명→0x7000 로그인OK→로비 렌더. `.omo/live-qa/m16-login-lobby-*` |
| **M0.5 갤럭시 데이터** | ✅ GREEN 감사 | 80성계 정본, `null_galaxy.mdx` 좌표 복구 |
| **M2 첫 캐릭터 획득** | ✅ 라이브 완료 | 빈 계정→오리지널 추첨(0x1006)→0x2004 count≥1→로비 해제. [[logh7-m2-character-creation-flow]] |
| **M3 월드 진입·멀티플레이 영속** | ✅ 완료 이력 유지 | run9에서 두 계정 월드 진입, `0x0b01 → 0x0b07` B 반영, cell `2587` 재로그인·서버 재시작 유지, cleanup을 기록했다. 현재 evidence directory/실행 EXE lineage가 없어 checkout에서 재검증 불가 |
| M4 전략맵 커맨드 | 🟡 진행 전 관측 게이트 | production SQLite의 `EnterWorld`·`MoveGrid` CQRS/UoW와 `0x030b` 19행 admission은 구현됨. P0 runtime/계보/증거, P1 3면 correlation, P2 parser/cache/root/FSM을 먼저 닫아야 함. 81개 중 factory 확인 2개, 79개와 ledger/CP/timers/jobs/outcome 미해결 |
| M5 전술·전투 | ⬜ 대기 | |
| M6 채팅·한글화 | 🟡 부분 | 창 제목·메뉴만 한글. CP932 유지(`CreateFontA` 0x80); CP949 자산 변환과 SJIS tunneling/GDI proxy를 spike로 비교 후 선택 |
| M7 전체 회귀·운영 | ⬜ 대기 | |

기존 `server/content/**/*.json`은 정본으로 신뢰하지 않는다. `tools/extract/audit_data_decode.mjs`가 현재 기준선이다.

run9/run3의 JSON store QA와 production SQLite CQRS 증거는 분리한다. run3의 이동·broadcast·재로그인/재시작 기록은 SQLite CQRS 실행 증거가 아니며, 현재 checkout에는 run9/run3/run5 원증거가 없다. targeted `132/132`, 전체 server `460 total / 458 pass / 0 fail / 2 conditional skips`, Python `16/16`도 이전 기록이므로 exact 명령·환경·산출물과 함께 다시 실행하기 전에는 fresh gate로 인용하지 않는다. PostgreSQL skeleton도 아직 미연결이다. 남은 서버 범위는 auth/session/audit, character/presence, galaxy/planet/base, fleet/location/visibility, facilities/ownership, command/CP/timers/jobs, economy/warehouse/production, tactical initial state, battle formulas/results, chat/social/notice/logs/backups다.

M4~M5 실행 원칙은 `docs/logh7-reference-haul.md`의 MHServerEmu식 경계를 따른다. 원본 클라이언트는 frontend로서 입력 의도와 제한적 prediction을 담당하고, 서버는 validation·authority·persistence·broadcast를 담당한다. 외부 구현은 방법론 참고일 뿐 LOGH VII 정본 데이터나 복사 가능한 코드가 아니다.

실행 루프는 `docs/logh7-codex-harness-loop.md`를 따른다. 각 작업은 계획 및 RE, 구현, 테스트, 라이브 확인 순서로 반복한다.

## 개발 재개 선행 게이트

M4 코드 변경 전에 아래 순서를 지킨다. PCAP/proxy는 **host network 계층**, 게임 화면·Win32 입력·Frida·D3D8 acceptance는 **선택된 client runtime 계층**으로 구분하며 서로를 대체 증거로 쓰지 않는다.

### P0 - 실행 환경별 client runtime, 정본 EXE 계보, evidence 복구

**2026-07-17 fresh 증거:**
- **native Windows 라이브 런**: 127.0.0.1:47900 서버 + PID 31108 클라이언트 직접 실행 → lineage PASS (EXE sha256 `825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22` 확인, timestamp 0x40779eb8, image base 0x00400000, sentinel mismatch 없음) → 로그인 성공 (0x0034/0x0035/0x0036/0x0030 trace → authOk=true → 로비 okCode=0x2001, 1920×1080 렌더) → cleanup receipt (listener 0개, process 0개, data 무변경). **verdict: login-success (in-game gameplay·relogin·persistence 미종결).**
- **macOS 원인 확정**: 제품 버그 아님. QA 하네스 `tools/logh7_ui_explorer.py` `_hw_type_text` 첫 글자 누락 (`inei00`→`nei00`) 으로 invalid account id 반환. 재입력 시 정상.

**실행 규칙:**
- `sys.platform`을 먼저 기록한다. native Windows에서는 클라이언트를 직접 실행하고 Wine 입력·명령을 금지한다. macOS/Linux에서는 새 프로젝트/런 전용 `WINEPREFIX`와 명시적 `win32|wow64` prefix mode를 강제하고 기본 `~/.wine` 접근을 금지한다. 그 외 host는 blocked다.
- CD base → official/update → 1080p → localization/diagnostic patch의 full SHA-256, PE timestamp/image base, patch/rollback hash를 client-lineage manifest로 고정한다.
- run9 evidence를 복구하거나 같은 exact hash로 선택된 runtime에서 재실행해 client/server/seed hash, packet/log, DB, screenshot, cleanup을 tracked redacted receipt로 남긴다. run3/run5는 보조 이력이며 run9 대체 증거가 아니다.
- launcher/Frida/patch는 hash·image base·sentinel bytes가 다르면 실행 전에 fail-closed한다.

### P1 - client + proxy + server 세 면 correlation

- `127.0.0.1:47900` client-facing → `127.0.0.1:47901` server-facing lab proxy를 observe-only, byte-identical pass-through로 시작한다.
- Frida 평문 trace, proxy byte trace/PCAP, server frame/opcode/DB/event trace를 `runId`, `connectionId`, `direction`, `frameSeq`, `messageId`, `transportCode`, `innerCode`, `payloadLength`, `payloadSha256`, `stage`, `monotonicTimestamp`, `outcome`으로 결합한다.
- 양방향 byte count와 payload SHA-256가 end-to-end 일치하고 secret이 기본 redaction돼야 한다.
- 진행(2026-07-16, PR #8): **server 면 착지** — `server/src/server/logh7-correlation-record.mjs`(23키 스키마, proxy 정본 `tools/live/logh7_packet_lab_proxy.mjs`와 테스트 drift guard로 동기) + `logh7-playable-server.mjs` writeTrace 배선. 검증 실패는 흡수·Sentry 보고(관측이 서버를 죽이지 않음). proxy·client(Frida) 면과 선택된 runtime의 라이브 join은 잔여 — `M4-OBS-001` 게이트는 여전히 열려 있다.

### P2 - `0x030b` 소비 경계 확정

- `0x030b → FUN_004ba2b0 → parser/registry allocator → model/cache join → DAT_009d2fa8 writer/reader → FSM state 2` timeline을 함수 인자·반환값과 함께 기록한다.
- 18/19/20행과 한 필드씩의 A/B로 admission, cache join, root 생성, FSM 전이를 분리한다.
- root producer 확정 전에는 payload 확대, 순차 ID/model-zero의 정본 승격, FSM 직접 변조를 금지한다.

### 첫 티켓 `M4-OBS-001`

범위는 `47900 → 47901` 양방향 무변형 proxy, exact EXE hash/address-profile 검사, 위 correlation schema, 단일 실행 recipe, cleanup/rollback이다. 완료 증거는 선택된 runtime의 1회 run에서 proxy 입출력 byte/hash 동일, server outcome join, direct-server control과 동일한 게임 동작, 종료 뒤 listener/process 0개와 runtime 경계 밖 변경 0개, tracked redacted receipt다.

## 데이터 승격 규칙

각 데이터는 다음 조건을 통과해야 서버 입력으로 승격한다.

1. 원천 파일이 현재 트리에 존재한다.
2. 원천 파일 해시 또는 추출 방법이 기록돼 있다.
3. 재생성 스크립트가 현재 트리에서 실행된다.
4. 생성 JSON의 깨진 참조가 없다.
5. 서버 테스트 또는 라이브 클라이언트 검증이 해당 데이터를 실제 소비한다.

이 조건을 통과하지 못한 JSON은 참고 자료일 뿐이다.

## 문서/PDF 요구사항 승격 규칙

`docs/`의 모든 문서와 `docs/reference/*.pdf`의 공식 매뉴얼 요소는 구현 후보로 취급한다. 누락 방지는 `tools/extract/audit_docs_requirements.mjs`와 `server/content/generated/logh7-docs-requirements-audit.json`으로 추적한다.

완료 조건:

- 문서/PDF 요구사항이 기능 도메인별로 인덱싱돼 있다.
- 각 요구사항은 서버 코드, 데이터 원천, 테스트, 라이브 클라이언트 증거 중 맞는 표면으로 연결된다.
- 문서에 적혀 있다는 사실만으로 구현 완료를 주장하지 않는다.

## EXE 전체 기능 RE 규칙

`G7MTClient.exe`의 모든 기능은 함수/도메인 단위로 추적한다. `tools/extract/audit_exe_re_coverage.mjs`와 `server/content/generated/logh7-exe-re-coverage-audit.json`이 현재 커버리지 기준선이다.

완료 조건:

- 함수 주소와 디컴파일 또는 라이브 경로가 기록된다.
- 해당 함수가 wire/data/UI/렌더/상태 중 무엇을 소비하는지 분류된다.
- 서버 구현으로 옮긴 기능은 테스트 또는 실클라 라이브 증거를 갖는다.
- 미해석 함수는 크기/도메인별 backlog에 남긴다.

## UI 좌표 수정 규칙

UI 좌표는 신중히 수정한다. 창 위치, 클라이언트 영역, 해상도, EXE 해시, 패치 상태가 맞지 않으면 같은 숫자도 틀린 좌표다. `tools/extract/audit_ui_coordinates.mjs`와 `server/content/generated/logh7-ui-coordinate-audit.json`을 기준으로 추적한다.

좌표 승격 조건:

- EXE sha256과 실행 종류를 기록한다.
- 창 모드와 client rect를 기록한다.
- 클릭 전/후 스크린샷 또는 로그가 있다.
- 클릭 결과가 목표 UI 동작과 일치한다.
- 좌표는 중앙점과 안전 여백을 함께 기록한다.

## Phase 0: 데이터 전체 재해독 기준선

목표: 이전 JSON을 버리지 않고도 신뢰하지 않는 상태로 격리한다.

완료 조건:

- `node tools/extract/audit_data_decode.mjs`가 `server/content/generated/logh7-data-decode-audit.json`을 재생성한다.
- 감사 결과의 `reviewQueue` 상위 항목부터 원천 파일/추출기/깨진 참조를 줄인다.
- `artifacts/logh7-cd`, `artifacts/logh7-install`, `artifacts/official-patch-staging`, `docs/reference`를 소스 루트로 유지한다.

다음 작업:

- `server/content/generated/logh7-hidden-data-classification.json`
- `server/content/generated/logh7-portrait-full-export-manifest.json`
- `server/content/generated/models.json`
- `server/content/generated/logh7-mdx-catalog.json`
- `server/content/extracted/model-data.json`

위 항목부터 재해독하거나 폐기 후보로 강등한다.

## Phase 1: 로그인 transport와 암호

목표: 원본 클라이언트가 자체 서버에 연결하고 로그인 핸드셰이크를 통과한다.

현재 상태:

- 0x0030 봉투 모듈과 단위 테스트 있음.
- child-codec 정적 P/S 테이블 검증, 64비트 블록 암복호, Blowfish형 key expansion, 0x0031 GIN7 key material 추출 helper 있음.
- Ghidra `FUN_00614460` 근거로 8바이트 배수 raw buffer 암복호 helper 있음. 블록 dword는 클라이언트 x86 메모리와 리셋 전 live-validated codec에 맞춰 little-endian으로 처리한다. 패딩/프레이밍은 아직 추정하지 않는다.
- `docs/reference/legacy-evidence/logh7-0030-protocol.md` 증거 문서 있음.
- Ghidra headless 산출물: `.omo/re-targeted/child-codec-0030-java-v2`, `.omo/re-targeted/child-codec-key-schedule`.
- (2026-07-07) `logh7-login-harness-server.mjs`: 0x0034→0x0035 핸드셰이크, 0x0036/0x0030 트레이스, phase1 키 셋업 후 0x0030 GIN7 자격증명 복호까지 구현·테스트됨(44/44).
- `0x0200 GameLogin`은 playable server에서 `buildSsLoginOkInner`로 만든 `0x0201 SSLoginOK`를 받으며, M1 로그인→로비는 라이브 완료다.

완료 조건:

- 0x0034/0x0035/0x0036 handshake와 0x0030 child-codec가 서버 코드에 있다.
- 실클라 로그인 화면에서 서버 연결과 로그인 응답을 라이브 증거로 남긴다.

## Phase 2: 캐릭터 작성/삭제/선택

목표: 로그인 후 오리지널 캐릭터 작성, 삭제, 기존 캐릭터 선택이 된다.

증거 후보:

- `docs/reference/legacy-evidence/logh7-character-creation-wire.md`
- `docs/reference/legacy-evidence/logh7-character-record-wire.md`
- `docs/reference/legacy-evidence/logh7-character-creation-research.md`

완료 조건:

- 캐릭터 레코드 wire codec과 서버 상태 저장 구현.
- 작성/삭제/선택을 실클라 UI로 검증.

## Phase 3: 로비와 월드 진입

목표: 캐릭터 선택 후 로비/월드 초기 상태가 원본 클라이언트에 로드된다.

완료 조건:

- 플레이어, 소속, 계급, 함대, 위치, 성계/행성 기본 상태를 서버가 권위적으로 보낸다.
- 위치가 없는 5개 성계는 조작해서 채우지 않고, 증거 등급을 유지한다.
- Obsidian 기록의 `null_galaxy.mdx` 근거는 `server/content/extracted/model-galaxy-alignment.json` 재생성 경로로 복구한다.

## Phase 4: 전략맵과 커맨드 루프

목표: 전략맵에서 이동, 명령, 제안, 배치, 인사, 생산, 보급 등 주요 커맨드가 동작한다.

현재 production slice는 `createPlayableRuntime`가 `EnterWorld`·`MoveGrid`를 동기 CQRS/UoW로 SQLite에 연결한 범위다. 성공한 `0x0b01`만 cell과 `GridMoved` 1건을 커밋하고, 잘못된 account/unit·offline·비항법 cell은 DB/session/event/response를 바꾸지 않는다. `MoveGrid`는 policy 미주입 시 fail-closed다. 항법 집합은 현재 `0x0315`의 `spaceCells ∪ systemCells`와 정확히 같지만 canonical 승격이 아니며 `galaxy-passable-cells`와 galaxy trust 데이터는 blocked 상태다.

이전 run5 기록에서 `0x030b` 19행은 두 클라이언트 월드 진입과 이동을 보존했지만 함선 마커 root `DAT_009d2fa8` null과 post-warp HUD/FSM state 2 정체를 남겼다. 현재 evidence directory와 exact patch EXE가 없어 재검증할 수 없으므로 M4 완료도, 현재 release gate도 아니다. PCP/MCP ledger, CP charge, timers/jobs, 실제 command outcome, `0x0327` 미확정 stock(zero-fill), disconnect `online=false`, PostgreSQL용 async bridge가 남았다.

증거 후보:

- `docs/reference/legacy-evidence/logh7-strategic-map-wire.md`
- `docs/reference/legacy-evidence/logh7-strategic-input-wire.md`
- `docs/reference/legacy-evidence/logh7-opcode-reference-2026-06-28.md`
- `server/content/manual/strategy-commands.json`

완료 조건:

- opcode별 codec/test가 있다.
- 각 커맨드는 서버 상태를 변경하고 클라이언트 UI에 반영된다.
- 전략맵 라이브 QA가 스크린샷/로그를 남긴다.

다음 순서는 고정한다.

1. P0/P1/P2와 `M4-OBS-001`을 닫는다.
2. `0x2b` Warp를 실제 UI 입력 → wire factory → 권한/precondition → PCP/MCP/CP reservation → command ledger/idempotency → timer/job → domain outcome/event → SQLite commit → A response/B broadcast → client UI의 첫 수직 슬라이스로 구현한다.
3. disconnect `online=false`, restart/reconnect, 중복/경쟁 명령을 닫고 UoW/dispatch를 async-capable하게 바꾼 뒤 SQLite/PostgreSQL contract를 맞춘다.
4. 같은 패턴으로 81 command를 확장한다. 확인되지 않은 79개는 fail-closed한다.
5. galaxy/fleet/facility/economy canon/data를 승격한 뒤 M5 전술·전투, M6 전체 한글화, M7 운영으로 진행한다.

## Phase 5: 전술맵, 전투, 함대 작전

목표: 전술맵 진입, 함대 이동, 사격, 전투 판정, 손실/퇴각/점령이 동작한다.

증거 후보:

- `docs/reference/legacy-evidence/logh7-proto-battle-core.md`
- `docs/reference/legacy-evidence/logh7-proto-battle-fire.md`
- `docs/reference/legacy-evidence/logh7-proto-battle-fleetops.md`
- `docs/reference/legacy-evidence/logh7-tactical-seed-2026-06-26.md`

완료 조건:

- 전술 seed/state codec 구현.
- 서버 전투 엔진 최소판 구현.
- 실클라 전술 화면에서 이동/사격 결과를 확인.

## Phase 6: 채팅, 사회 기능, 한글화

목표: 원본 UI와 채팅/사회 상호작용을 사용할 수 있게 한다.

현재 판정: CP932 원본 자산에서는 `CreateFontA` charset `0x81`이 모지바케를 일으켜 `0x80`으로 복귀했다. `0x81`은 M6 spike에서 선택한 배포 인코딩이 요구할 때만 자산 변환과 함께 다시 검증한다.

M6 착수 전 짧은 spike gate에서 두 경로를 같은 화면·입력 시나리오로 비교한다: (A) `msgdat`/HFWR 자산의 CP949 변환, (B) VNTranslationTools/VNTextPatch식 SJIS tunneling + GDI proxy/font/IME. 글리프 표시, 문자열 길이·레이아웃, 한글 입력, 송수신, 패치 침습도와 rollback을 측정한 뒤 한 경로를 선택한다.

한글화는 복원 범위에 포함한다. `logh7-localize` 기준으로 바이트 계층을 분리한다.

- `.rsrc` 메뉴/대화상자 문자열은 UTF-16LE로 패치한다.
- `String.txt` 계열 인게임 문자열은 선택한 배포 인코딩과 GDI 소비 경로를 함께 검증한다.
- 폰트는 `MS UI Gothic` 전역 슬롯과 실제 `CreateFontA` 소비 경로를 확인한 뒤 바꾼다.
- 한국어 문장은 군사/전략물 톤을 유지하고, 기계번역투를 제거한다.

완료 조건:

- 채팅 입출력 wire와 인코딩 검증.
- 한글화 문자열은 실제 GDI/클라이언트 소비 경로에서 검증.
- 번역 JSON은 추출 원천과 적용 패치가 함께 있어야 승격한다.

## Phase R: 리마스터링 병렬 트랙

목표: 원본 동작 복원을 해치지 않고 UI/초상/함선/전략맵 자산을 고해상도화하며, 장기 신규 클라이언트 가능성을 엔진 중립적으로 검증한다. 원본 클라이언트는 계속 1차 제품 경로이자 호환 오라클이다.

원칙:

- 원본 자산, 해시, 추출 경로를 먼저 고정한다.
- 리마스터 산출물은 별도 overlay/pack과 manifest로만 관리하고 기본값은 `enabled: false`다.
- 원본 정본 데이터와 리마스터 파생물은 같은 JSON에 섞지 않는다.
- 업스케일/재작화 결과는 원본과 pixel/shape/anchor를 대조해 게임 UI 좌표를 깨지 않는 경우만 적용한다.
- 원본 클라이언트 패치는 reversible patch manifest 없이는 canonical로 승격하지 않는다.
- 리마스터 visual A/B는 선택된 client runtime 계층에서 수행하고 protocol/FSM trace가 원본과 동일해야 한다.
- 장기 재이식 엔진을 Unity로 고정하지 않는다. Unity, Godot, 기타 엔진 후보가 같은 shared command/event/asset contract PoC를 구현한 뒤 protocol parity, tooling, 배포 크기, 플랫폼, 2D/3D 적합성, 유지보수 비용을 같은 rubric으로 비교한다.
- 신규 PoC는 legacy protocol adapter를 우회해 검증된 server contract만 소비한다. 선택 전까지 삭제된 `client-unity/` 경로나 생성 manifest를 활성 제품 계약으로 되살리지 않는다.

가능한 작업:

- 초상화 TCF 추출 → 업스케일 → 얼굴 ID/이름 매핑 유지
- 전략맵/UI 이미지 추출 → 해상도 개선 → hitbox/좌표 영향 검증
- 함선/효과 텍스처 개선 → 원본 파일명/크기/포맷 호환성 검증
- 한글 폰트와 고해상도 UI를 함께 live QA
- shared command/event/asset contract의 작은 engine-neutral reference fixture 작성
- Unity/Godot/기타 후보가 동일 fixture를 렌더·입력·outcome 처리하는 PoC 비교

완료 조건:

- 원본 asset manifest와 remaster manifest가 모두 존재한다.
- 리마스터 파일마다 원본 해시, 생성 도구, 모델/파라미터, 적용 위치가 기록된다.
- 기본 off, 원본 fallback, rollback이 실제로 검증된다.
- 실클라 runtime A/B에서 렌더링이 깨지지 않고 client/proxy/server protocol/FSM trace가 동일한 증거가 있다.
- 신규 클라이언트 엔진 선택은 동일 contract PoC와 비교 rubric 결과가 있을 때만 한다.

## Phase 7: 전체 회귀와 라이브 운영

목표: 죽은 온라인 게임의 주요 기능을 한 세션에서 순서대로 통과한다.

최종 라이브 시나리오:

1. 클라이언트 실행
2. 로그인
3. 캐릭터 작성
4. 캐릭터 삭제
5. 오리지널 캐릭터 선택
6. 로비/월드 진입
7. 전략맵 이동과 명령
8. 제안/인사/생산/보급 상호작용
9. 전술맵 진입
10. 전투와 결과 반영
11. 채팅/사회 기능
12. 한글화 UI/채팅 표시
13. 선택한 경우 리마스터 자산 표시
14. 종료 후 서버 상태 재로드

완료 주장은 위 시나리오의 로그와 스크린샷이 있을 때만 한다.

## 트래커 매핑 (2026-07-18)

로드맵 단계를 이슈 트래커에 반영해 "다음 할 일"을 트래커에서 바로 읽는다.

**GitHub 마일스톤** (5개, 이슈는 제목의 주제 키워드로 배정):
- `M4 — 전략맵 커맨드` (현재 게이트: P0 runtime/계보/증거 · P1 3면 correlation · P2 0x030b 경계 · 전략맵 정보패널/이동/Warp/세션/ledger). 게임플레이 직접 작업이 여기.
- `M5 — 전술맵·전투·함대 작전` / `M6 — 채팅·사회 기능·한글화` / `Phase R — 리마스터링` / `M7 — 전체 회귀·라이브 운영`.

**Jira priority** = 게이트 순: 현재 M4·게임플레이 직접·P0/P1/P2 = High, 사회 시뮬(LOGH7-198~203)·opcode 백로그 = Medium, 먼 트랙(M5/M6/R/M7) = Low.

**트래킹 방식** (사용자 결정 2026-07-18): Jira는 **스프린트 미사용**(`customfield_10020` 금지) — status 전이(해야 할 일→진행 중→검토 중→완료) + 증거 코멘트 칸반. GitHub 이슈는 **라벨**로 관리. 완료 전환은 라이브 증거 확보 후에만.

**신규 티켓** (2026-07-18): 사회 시뮬 에픽 LOGH7-198(경로 A 클라 패치) + 스토리 199~203; opcode 백로그 작업 LOGH7-204(0x031d astronomy=검은 행성)~211; 0x032f 멤버리스트 = LOGH7-197.
