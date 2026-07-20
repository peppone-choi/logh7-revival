# LOGH VII 부활 - 실행 계획 (2026-07-17)

## 2026-07-20 실행 오버레이: A01 인과 원장 구현 게이트

GitHub #216 / Jira LOGH7-213의 마스터 설계는 PR #232 merge `ec6d9b52`로 D0를 닫았다. 현재 작업은 A01 GitHub #217 / Jira LOGH7-214이며, 기계 판독 정본은 `tools/causal-ledger/schema.json`과 고정 hash source manifest다.

실행 순서는 `D0(완료) → A01(schema, 현재 검증/PR 단계) → dependency DAG의 병렬 파동 → A10(15축 독립 검증)`이다. A01 merge read-back 전에는 downstream branch를 만들지 않는다. 기존 P0→P1→P2→M4 증거와 구현은 각 축의 입력으로 보존한다.

이 오버레이가 끝나는 조건은 설계 문서의 `최종 completion audit` 전수 통과다. PR 생성이나 테스트 통과만으로 종료하지 않는다.

원본 `G7MTClient.exe`를 1차 제품 경로로 유지하고, M4 개발 전에 실행 환경별 client runtime·증거·관측 경계를 복구한다. native Windows에서는 직접 실행하고 macOS/Linux에서만 격리 Wine을 사용한다. 현재 병목은 전략 커맨드 구현 자체가 아니라 동일한 클라이언트 입력을 client/proxy/server 세 면에서 재현 가능하게 설명하는 것이다.

## 현재 판정과 증거 한계

- M0.5/M1/M2/M3 완료 판정(`4/8 = 50%`, 전체 작업량 대표값 `35%`)은 역사적 판정으로 유지한다.
- 현재 checkout에는 해당 판정과 M4 관측이 인용한 run9/run3/run5 evidence directory가 모두 없다. exact run에 사용한 canonical/patch EXE와 전체 hash lineage receipt도 없고, 직접 확인 가능한 EXE는 `bd192...` 계열뿐이다. 문서에 남은 `825635...` 문자열만으로 같은 바이너리를 재구성할 수 없다.
- 따라서 run9의 두 클라이언트 월드 진입·이동·재로그인/재시작 영속성, run3의 JSON-store 이동 QA, run5의 `0x030b` 19행 admission은 **완료 이력**이지만 이 checkout에서 재검증된 release gate가 아니다. production SQLite CQRS 구현은 이 live QA와 별도 증거로 취급한다.
- production SQLite는 `EnterWorld`·`MoveGrid`의 동기 CQRS/UoW를 사용한다. 성공한 `0x0b01`만 cell과 `GridMoved` 1건을 커밋한다.
- `0x030b`는 63행 catalog 중 선두 19행만 body+4/stride `0x8c`로 보낸다. 이는 admission 안전 cap이며 `DAT_009d2fa8 == null`과 전략 FSM state 2 정체를 해결하지 못했다.
- targeted `132/132`, server `460 total / 458 pass / 0 fail / 2 conditional skips`, Python `16/16`은 이전 기록이다. 명령·환경·산출물과 함께 다시 실행하기 전에는 fresh gate로 인용하지 않는다.

## 개발 전 선행 게이트

### P0 - 실행 환경별 client runtime, 클라이언트 계보, 증거 복구

`sys.platform`을 먼저 기록한다. native Windows는 Wine 입력·명령 없이 클라이언트를 직접 실행한다. macOS/Linux의 모든 Wine 명령은 새 프로젝트/런 전용 `WINEPREFIX`와 명시적 `win32|wow64` prefix mode에서만 실행하고 기본 `~/.wine`에는 접근하지 않는다. 그 외 host는 blocked다.

완료 증거:

1. CD base → 공식/update → 1080p → localization/diagnostic patch의 full SHA-256, PE timestamp/image base, patch receipt, rollback hash를 가진 client-lineage manifest.
2. host platform, `runtimeMode`, client path/hash, locale/font/D3D8 설정, 실행 명령과 runtime 경계 밖 변경 0건을 기록한 environment receipt. Wine mode는 toolchain build/hash, prefix, drive mapping을 추가하고 native Windows mode는 Wine 필드·명령을 포함하지 않음.
3. run9의 원본 또는 redacted evidence를 복구하거나 선택된 runtime에서 재실행하여 client/patch/server/seed hash, packet/log, DB, screenshot, cleanup을 tracked receipt로 남김. run3/run5는 보조 이력으로만 연결함.
4. launcher와 Frida가 full hash·image base·sentinel bytes 불일치 시 attach/patch 전에 fail-closed함.

### P1 - client + proxy + server 세 면 상관관계

client-facing `127.0.0.1:47900` → server-facing `127.0.0.1:47901`의 lab-only pass-through proxy를 두고, 원본 입력을 바꾸지 않은 관측부터 시작한다. PCAP/proxy는 host network 계층, 게임 화면·Win32 입력·Frida·D3D8 판정은 선택된 client runtime 계층으로 분리한다.

모든 이벤트는 다음 공통 필드를 갖는다: `runId`, `connectionId`, `direction`, `frameSeq`, `messageId`, `transportCode`, `innerCode`, `payloadLength`, `payloadSha256`, `stage`, `monotonicTimestamp`, `outcome`.

완료 증거:

1. 양방향 Frida 평문 trace, loopback proxy byte trace/PCAP, server frame/opcode/DB/event trace가 동일 ID와 monotonic timeline으로 join됨.
2. observe 모드에서 양방향 payload SHA-256와 byte count가 end-to-end 일치함.
3. unknown phase/code/length/hash는 임의 수정하지 않고 전달 또는 중단하며 secret은 기본 redaction됨.

### P2 - `0x030b` parser/cache/root/FSM 경계 확정

단일 run에서 `0x030b → FUN_004ba2b0 → parser/registry allocator → model/cache join → DAT_009d2fa8 writer/reader → FSM state 2 진입·이탈`을 함수 인자·반환값과 함께 추적한다.

완료 증거:

1. 18/19/20행 경계와 한 필드씩의 A/B가 admission, cache join, root 생성, FSM 전이를 분리해 설명함.
2. root producer가 확정되기 전 payload 확대, 순차 ID/model-zero의 정본 승격, FSM 직접 변조를 하지 않음.
3. 두 클라이언트 world entry, marker, 이동, post-warp HUD의 자연 출력 결과가 같은 timeline에 남음.

## 첫 티켓: M4-OBS-001

목표: 전략 커맨드를 구현하기 전에 재현 가능한 무변형 관측 하네스를 만든다.

범위:

- `47900` client-facing → `47901` server-facing 양방향 byte-identical pass-through.
- exact EXE hash와 address profile을 검사하는 단일 실행 recipe.
- P1 공통 correlation schema로 proxy/server/Frida trace를 결합.
- observe-only가 기본이며 process/port/runtime 작업 영역 cleanup, 원본 설정·포트 rollback을 포함.

완료 증거:

- 선택된 runtime에서 정본 hash가 확인된 클라이언트 1회 실행.
- 각 방향의 input/output payload SHA-256, byte count, frame sequence가 일치하고 서버 outcome까지 join됨.
- proxy 우회 direct-server control과 게임 동작이 동일하며, 종료 뒤 47900/47901 listener·client/server/proxy process 0개, runtime 경계 밖 변경 0개.
- tracked redacted receipt에 exact command, hashes, logs/PCAP index, screenshot, 실패 여부, cleanup/rollback 결과가 남음.

## M4 이후 실행 순서

1. **`0x2b` Warp vertical slice**: 실제 UI 입력 → wire factory → 권한/precondition → PCP/MCP/CP reservation → command ledger/idempotency → timer/job → domain outcome/event → SQLite commit → A response/B broadcast → client UI를 한 transaction/run으로 닫는다.
2. **Persistence 경계**: disconnect `online=false`, restart/reconnect, 중복/경쟁 명령을 검증하고 UoW/dispatch를 async-capable port로 바꾼 뒤 SQLite/PostgreSQL contract suite와 backup/restore를 연결한다.
3. **81 command 확장**: `0x2b` 패턴으로 factory, cost/source, mutation, timer/job, outcome, broadcast, canon grade를 채운다. 현재 확인된 2개 외 79개는 근거가 생길 때까지 fail-closed한다.
4. **M4 data**: galaxy/fleet/facility/economy data를 source hash → extractor → provenance/rights → runtime consumer → client live gate로 승격한다. `0x0327` 미확정 stock은 zero-fill/blocked를 유지한다.
5. **M5**: 전술맵 진입, 함대 이동, 사격, 전투 판정, 손실/퇴각/점령을 서버 권위 수직 슬라이스로 복원한다.
6. **M6**: 채팅/사회 기능과 CP949 asset conversion 대 SJIS tunneling + GDI proxy/font/IME를 같은 client runtime 시나리오로 A/B한 뒤 전체 한글화 경로를 선택한다.
7. **M7**: 보안, rights ledger, artifact hygiene, 운영/백업/복구, 전체 두 클라이언트 회귀와 배포 gate를 닫는다.

## 병렬 리마스터·신규 클라이언트 트랙

- legacy client가 계속 1차 제품·호환 오라클·live acceptance 경로다. 신규 클라이언트 때문에 M4 wire/FSM 변수를 바꾸지 않는다.
- 리마스터 자산은 provenance, 원본 fallback, 별도 overlay/pack, `enabled: false`, hash guard, rollback을 가진 뒤에만 선택된 client runtime에서 A/B한다.
- 장기 재이식은 Unity로 고정하지 않는다. Unity, Godot, 기타 엔진 후보가 동일한 shared command/event/asset contract로 작은 PoC를 구현하고 protocol parity, tooling, 배포 크기, 플랫폼, 2D/3D 적합성, 유지보수 비용을 같은 rubric으로 비교한 뒤 선택한다.
- 신규 PoC는 검증된 서버 contract만 소비하며 legacy protocol adapter와 분리한다. 선택 전까지 삭제된 `client-unity/` 경로/manifest를 활성 제품 계약으로 복원하지 않는다.

## 공통 완료 원칙

- host PCAP/proxy 성공은 client runtime의 게임/Win32 acceptance를 대신하지 않고, client 화면 성공은 서버 authority/DB 증거를 대신하지 않는다.
- 자동 테스트나 process exit code만으로 gameplay 완료를 주장하지 않는다.
- 각 slice는 exact input/hash, client natural output, 양방향 packet, server state/event, persistence, cleanup/rollback이 한 receipt에 있을 때만 완료한다.
- 같은 증상 3회 또는 새 증거 없는 조사 2회면 반복을 중단하고 client, proxy/network, server 중 다른 관측면으로 전환한다.
