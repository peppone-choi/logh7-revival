# LOGH VII Revival Harness Team Spec

## 목적과 현재 gate

원본 `G7MTClient.exe`를 1차 제품·호환성 오라클로 유지하면서 정적 RE, Wine client runtime, wire interception, 권위 서버를 같은 증거 체계로 결합한다. 리마스터와 장기 재이식은 병렬 포트폴리오로 운영하되 legacy M4 복원을 방해하거나 대체하지 않는다.

현재 checkout에는 run9/run3/run5 원본 evidence와 그 run의 정본 EXE lineage가 없으므로 normal regression용 P0는 닫히지 않았다. 과거 성공 기록은 역사적 근거로만 유지하고 fresh release gate로 재사용하지 않는다. exact lineage를 새로 확정한 경우에만 별도 `recovery-baseline` run으로 대체 evidence 후보를 만들 수 있다.

## 선택한 구조

- **외부 구조 — Pipeline:** `P0 → P1 → P2 → M4 vertical slice`를 순차 gate로 실행한다.
- **내부 구조 — bounded Fan-out/Fan-in:** 각 phase에서 독립적인 read-heavy 분석만 최대 6개 역할로 병렬화하고 orchestrator가 합성한다.
- **품질 구조 — Producer-Reviewer:** 모든 phase artifact는 독립 reviewer의 `pass|fix|redo` 판정을 받은 뒤 다음 gate로 이동한다.
- **위임 깊이:** orchestrator → specialist 한 계층만 허용한다. specialist는 하위 agent를 생성하지 않고 필요한 추가 작업을 orchestrator에 반환한다.
- **상태 자원:** Wine prefix, install copy, live DB, client/server ports, GUI는 단일 `live` owner가 직렬 소유한다.

병렬화의 목적은 정적·동적·wire·server 관점의 컨텍스트 격리와 latency 절감이다. 공유 파일이나 stateful test의 동시 쓰기는 허용하지 않는다.

## 공통 artifact tree

각 작업은 불변 `RUN_ID`를 만들고 다음 이름을 사용한다.

```text
_workspace/logh7-revival/runs/<RUN_ID>/
├── request.json
├── environment.json
├── client-lineage.json
├── port-lease.json
├── pids.json
├── correlation.jsonl
├── branches/
│   ├── client.md
│   ├── static.md
│   ├── wire.md
│   ├── server.md
│   ├── live.md
│   └── remaster-engine-portfolio.md
├── reviews/
│   └── <producer>-by-<reviewer>.json
├── evidence-manifest.json
└── synthesis.md
```

- artifact가 없는 역할은 빈 파일을 만들지 않고 `request.json`의 `omittedRoles`에 이유를 기록한다.
- `request.json`은 `runMode: regression|recovery-baseline`을 필수로 가지며 run 시작 뒤 바꾸지 않는다.
- `/_workspace/`는 gitignored scratch다. producer-reviewer가 승인한 redacted frozen index와 synthesis만 `docs/verification/logh7/<RUN_ID>/`로 승격하고 scratch manifest SHA-256과 artifact hash를 남겨 양쪽을 연결한다.
- raw PCAP, memory dump, screenshot, DB snapshot처럼 크거나 민감한 파일은 별도 evidence root에 두고 manifest에는 path, size, SHA-256, redaction state만 기록한다.
- raw PCAP, memory dump, 인증 payload, secret/PII는 tracked 경로로 절대 승격하지 않는다.
- source artifact를 수정하지 않는 분석은 branch markdown으로 전달한다. 코드 변경은 역할별 비중복 write scope와 별도 검증 명령을 `request.json`에 먼저 적는다.

## 역할 계약

| 역할 | 소유 경계 | 주요 입력 | 결정적 출력 | 기본 reviewer |
| --- | --- | --- | --- | --- |
| `client` | Wine 내 동적 RE, Frida/debugger, Win32/GDI/D3D8, parser/cache/root/FSM | exact EXE profile, static hypotheses, live scenario | `branches/client.md`, client events | `static` |
| `static` | PE/Ghidra authority, import/string/xref/CFG, structure/layout, patch sentinel | canonical EXE hash, manuals, existing RE ledger | `branches/static.md`, address profile | `client` |
| `wire` | PCAP/dissector/decoder, observe proxy, replay·one-field mutation contract | frame schema, proxy trace, client/server events | `branches/wire.md`, wire events | `server` |
| `server` | session/application command/domain/persistence authority와 instrumentation | wire contract, canonical fixtures, DB/event trace | `branches/server.md`, server events | `wire` |
| `live` | Wine environment, UI/game acceptance, ports/PID/cleanup/rollback | `$logh7-wine-live-qa`, runnable server, scenario | `branches/live.md`, evidence manifest | orchestrator + affected producer |
| `remaster-engine-portfolio` | reversible remaster overlay와 engine-neutral future-client PoC portfolio | `$logh7-asset-provenance`, `$logh7-engine-spike`, proven asset/command/event contracts | `branches/remaster-engine-portfolio.md`, comparison rubric | `live` |

### `client`

- exact EXE hash, image base, sentinel을 확인한 뒤에만 attach/hook한다.
- 함수 인자·반환값과 memory ownership을 관측하고, FSM 직접 변조를 증거 대신 쓰지 않는다.
- 쓰기 hook/patch는 observe baseline 뒤 별도 variant로 실행하며 original/modified/rollback hash를 남긴다.

### `static`

- Ghidra를 함수·구조체·control-flow 판정의 authority로 사용한다.
- capa/FLOSS/YARA/DIE/binwalk/strings는 후보 분류에 사용하되 canonical layout 승격 근거로 단독 사용하지 않는다.
- canonical EXE와 patched/profile EXE 사이 주소 차이는 hash·function signature·xref로 연결한다.

### `wire`

- observe-only byte-identical pass-through를 먼저 증명한다.
- PCAP, proxy, decoder, dissector 결과를 같은 frame sequence와 payload hash로 연결한다.
- replay/drop/delay/mutation은 hypothesis와 expected outcome이 있는 lab run에서 한 변수씩 실행한다. unknown frame을 자동 응답하거나 정본으로 승격하지 않는다.

### `server`

- `presentation/session → application command → domain authority → persistence` 경계를 유지한다.
- validation, command ledger/idempotency, cost/reservation, timer/job, event, DB commit, response/broadcast를 각 event로 기록한다.
- client를 통과시키기 위한 speculative bytes나 direct DB/state mutation을 completion evidence로 쓰지 않는다.

### `live`

- `.agents/skills/logh7-wine-live-qa/SKILL.md`를 읽고 `$logh7-wine-live-qa` 계약을 그대로 적용한다.
- host PCAP/proxy 판정과 Wine 화면·입력·D3D8·audio 판정을 분리한다.
- 한 run이 prefix, install copy, DB, ports, GUI를 독점하며 기록된 PID만 정리한다.
- 정본 EXE lineage가 없으면 client를 시작하지 않는다. run9 evidence만 없고 exact lineage/hash/sentinel이 검증되면 `$logh7-wine-live-qa`의 `recovery-baseline` mode만 사용할 수 있다.

### `remaster-engine-portfolio`

- asset intake·변환·packaging에는 `$logh7-asset-provenance`를 사용하고 R0-R3, rights, non-canonical generated, default-off/fallback/rollback을 강제한다.
- future-client 비교에는 `$logh7-engine-spike`를 사용하고 같은 command/event/replay fixture를 공유한다.
- original fallback, provenance, hash guard, `enabled: false` 기본, rollback이 있는 overlay만 legacy Wine A/B로 보낸다.
- 현재 삭제된 `client-unity/`를 active contract로 되살리지 않는다.
- Godot와 Unity는 equivalent thin slice, Unreal은 tactical-only spike, Stride/Bevy는 watch record로 관리한다. 특정 엔진을 계획 단계에서 winner로 고정하지 않는다.

## 4-layer RE 합성

모든 RE 가설은 가능한 한 다음 네 층을 통과한다.

1. **Static binary:** 함수/xref/layout/sentinel과 예상 관측점을 정한다.
2. **Client runtime:** Wine에서 인자·반환값·memory/FSM과 natural UI output을 관측한다.
3. **Wire:** client↔proxy↔server byte/frame/message 변화를 추적한다.
4. **Server authority:** validation, domain event, persistence, response/broadcast 결과를 확인한다.

한 층의 성공으로 다른 층을 추론하지 않는다. 예를 들어 PCAP이 맞아도 client marker가 null일 수 있고, 화면이 움직여도 DB transaction이 없을 수 있다. `synthesis.md`는 층별 `confirmed|contradicted|unobserved`를 따로 표시한다.

## 결정적 correlation JSONL

`correlation.jsonl`은 UTF-8, BOM 없음, 한 줄 한 JSON object다. producer는 다음 key order와 필드를 유지하고 알 수 없는 값은 생략하지 말고 `null`을 쓴다.

```text
schemaVersion, runId, eventId, source, stage, connectionId, clientId, direction, frameSeq, messageId, correlationId, causationId, commandId, transportCode, innerCode, payloadLength, payloadSha256, processId, threadId, monotonicTimestampNs, wallTimeUtc, outcome, redaction
```

필드 규칙:

- `schemaVersion`: 현재 `1`.
- `runId`: directory의 불변 ID.
- `eventId`: `<source>:<zero-padded source sequence>`; source 안에서 중복 금지.
- `source`: `client|proxy-client|proxy-server|server-session|server-domain|server-db|live`.
- `stage`: `static-hypothesis|client-recv|client-send|proxy-recv|proxy-send|server-recv|command|domain|db|server-send|client-ui|cleanup`.
- `connectionId`: accept 시 생성한 불변 ID. 재연결은 새 ID를 쓴다.
- `clientId`: 계정/캐릭터 PII가 아닌 run-local alias.
- `direction`: `c2s|s2c|internal|none`.
- `frameSeq`: connection+direction별 0부터 증가하는 정수. frame이 아닌 event는 `null`.
- `messageId`: frame이면 `<connectionId>:<direction>:<frameSeq>`, 아니면 run-local stable ID.
- `correlationId`: 하나의 player intent/command 전 경계를 묶는 ID.
- `causationId`: 이 event를 직접 유발한 `eventId` 또는 `null`.
- `commandId`: command ledger ID 또는 `null`.
- `transportCode`, `innerCode`: 알려진 경우 소문자 4자리 hex 문자열(예: `0x030b`), 아니면 `null`.
- `payloadLength`: wire payload byte 수. payload가 없으면 `null`.
- `payloadSha256`: full payload SHA-256. payload가 없으면 `null`; secret payload 원문은 저장하지 않는다.
- `processId`, `threadId`: 관측 가능할 때 정수, 아니면 `null`.
- `monotonicTimestampNs`: run 시작 host monotonic clock 기준 정수 nanoseconds. 모든 source는 같은 anchor를 공유한다.
- `wallTimeUtc`: anchor와 감사를 위한 RFC 3339 UTC. 정렬은 monotonic 값을 사용한다.
- `outcome`: `observed|forwarded|accepted|rejected|committed|rolled-back|rendered|failed|blocked|cleaned`.
- `redaction`: `none|metadata-only|redacted`.

예시 한 줄:

```json
{"schemaVersion":1,"runId":"20260716T120000Z-a1b2","eventId":"proxy-client:000042","source":"proxy-client","stage":"proxy-recv","connectionId":"conn-01","clientId":"client-a","direction":"c2s","frameSeq":17,"messageId":"conn-01:c2s:17","correlationId":"intent-warp-01","causationId":"client:000087","commandId":null,"transportCode":"0x0036","innerCode":"0x0b01","payloadLength":24,"payloadSha256":"<64 lowercase hex>","processId":1234,"threadId":null,"monotonicTimestampNs":918273645,"wallTimeUtc":"2026-07-16T12:00:03.123Z","outcome":"observed","redaction":"metadata-only"}
```

합성 전에 `(runId,eventId)` uniqueness, frame sequence gap/duplicate, required key, hex/hash format, monotonic order를 검사한다. source clock을 같은 anchor로 묶지 못하면 해당 branch는 `partial`이다.

## Phase pipeline

### P0 — Wine 격리·client lineage·evidence 복구

Producers: `static`, `client`, `live`. 정적 inventory는 병렬 가능하지만 exact lineage와 run mode가 확정되기 전에는 Wine 실행을 금지한다.

두 경로를 구분한다.

- `regression`: 기존 run9 원본 또는 검증 가능한 redacted evidence index를 입력으로 요구한다. 없으면 fail-closed한다.
- `recovery-baseline`: run9가 없고 exact lineage/hash/PE metadata/sentinel이 검증된 경우에만 새 격리 prefix에서 run9-equivalent evidence를 재생성한다. 해당 run verdict는 `provisional|recovered`뿐이며 `pass`가 아니다.

완료 gate:

- canonical/patch EXE full lineage, PE metadata, sentinel, backup/rollback이 검증됨.
- absolute Wine toolchain과 repo 밖 전용 absolute prefix, drive/D3D8/locale/audio/input/registry receipt가 있음.
- run9 원본/검증 가능한 redacted evidence index가 있거나, review를 마친 `recovered` candidate의 frozen manifest/hash index가 있음.
- missing hash/profile/artifact가 attach/patch/launch 전에 fail-closed함.

`recovery-baseline`은 world entry, 두 client awareness/movement, relogin, server restart persistence, packet/server/DB/screenshot, cleanup/rollback을 새 receipt에 모은다. 필수 evidence가 덜 모이면 `provisional`, 모두 모이고 static lineage + client/wire/server correlation + live cleanup reviews가 통과하면 `recovered`다. frozen candidate를 baseline index에 승격한 다음 별도 `regression` run으로 다시 검증해야 P1 normal pass가 가능하다.

exact lineage 또는 Wine 격리 gate가 없으면 두 경로 모두 시작하지 않는다.

### P1 — client + proxy + server 상관관계

Producers: `client`, `wire`, `server`; `live`가 단일 stateful run을 소유한다. 세 producer는 같은 EXE/server/seed/DB/input snapshot을 사용한다.

완료 gate:

- `127.0.0.1:47900 → 127.0.0.1:47901` 또는 run manifest에 선언된 host-neutral 전용 port pair의 observe-only byte equality가 양방향 통과함.
- client plaintext/runtime, proxy/PCAP, server frame/opcode/DB/event가 같은 correlation ID와 monotonic timeline으로 join됨.
- proxy 우회 direct-server control과 observe proxy 경로의 game result가 동일함.
- host network verdict와 Wine game verdict가 각각 존재하고 cleanup/rollback이 닫힘.

### P2 — `0x030b` parser/cache/root/FSM 경계

Producers: `static` hypothesis, `client` runtime trace, `wire` 18/19/20-row A/B, `server` exact variant provider. `live`는 variant를 순차 실행한다.

완료 gate:

- `0x030b → FUN_004ba2b0 → parser/registry allocator → model/cache join → DAT_009d2fa8 writer/reader → FSM state 2` 경로가 함수 인자·반환값과 correlation됨.
- 18/19/20행과 one-field A/B가 admission, cache join, root 생성, FSM 전이를 분리해 설명함.
- payload 확대, 순차 ID/model-zero, FSM mutation을 root producer 확정 전 canonical로 승격하지 않음.
- 두 client world entry, marker, movement, post-warp HUD natural output이 같은 run family에 남음.

### M4 — `0x2b` Warp vertical slice

Producers: `server`가 authority 구현, `wire`가 contract/round-trip, `client`가 UI→factory와 response consumer, `live`가 실제 run을 맡는다. write scope와 DB/port를 겹치지 않게 순차 통합한다.

한 correlation chain에 다음을 모두 넣는다.

```text
실제 UI 입력
→ client wire factory
→ server permission/precondition
→ PCP/MCP/CP reservation
→ command ledger/idempotency
→ timer/job
→ domain outcome/event
→ SQLite transaction commit
→ A response/B broadcast
→ 두 client natural UI output
→ disconnect/restart/reconnect persistence
```

실패 case는 state/event/response가 규정대로 무변경임을 증명한다. 이 slice가 닫힌 뒤 같은 pattern으로 81 command를 확장하며 미확정 79개는 fail-closed한다.

## Producer-Reviewer 규칙

- producer는 원 요청, input hashes, artifact, 검증 출력, gap을 함께 넘긴다.
- reviewer는 producer의 결론이 아니라 raw artifact와 acceptance gate를 읽는다.
- review JSON은 `status`, `blockingFindings`, `nonBlockingFindings`, `evidenceChecked`, `requiredFixes`를 가진다.
- `pass`: 다음 gate 가능. `fix`: 동일 방향의 제한 수정. `redo`: input/hypothesis가 잘못되어 새 branch 필요.
- 한 artifact의 revision은 최대 2회다. 이후에는 Blocked-Loop Rule에 따라 다른 관측층으로 전환하거나 blocker를 남긴다.
- producer와 reviewer가 충돌하면 orchestrator가 raw evidence를 기준으로 `synthesis.md`에 양쪽 주장을 보존하고 미해결 상태를 명시한다.

## Partial failure 정책

- branch status는 `complete|partial|blocked|invalid` 중 하나다.
- 성공한 branch artifact는 보존하되, 필수 branch가 `partial|blocked|invalid`면 phase 전체를 `pass`로 합성하지 않는다.
- P0 exact lineage/Wine prefix failure는 downstream 전체 blocker다. run9만 누락된 경우 normal regression은 blocker지만 `recovery-baseline` 예외를 사용할 수 있다.
- P1의 client/wire/server 중 하나가 누락되면 나머지 두 면의 결과만 좁게 보고하고 cross-layer claim을 금지한다.
- stateful live run failure는 같은 prefix/port에서 병렬 재시도하지 않는다. cleanup을 먼저 증명한 뒤 새 `RUN_ID`로 재시도한다.
- 같은 증상 3회 또는 새 증거 없는 조사 2회면 반복을 중단하고 static/client/wire/server 중 다른 층으로 전환한다.
- final synthesis는 omitted/failed branch, unresolved conflict, untested surface를 반드시 열거한다.

## Engine-neutral remaster/reimplementation portfolio

legacy client는 계속 제품 경로와 acceptance oracle이다. 미래 client PoC는 검증된 shared command/event/asset contract만 소비하며 legacy protocol adapter와 분리한다.

이 track은 `$logh7-engine-spike`와 `$logh7-asset-provenance`를 필수로 사용한다.

portfolio lane은 다음과 같다.

- Godot과 Unity: 동일 command/event/replay fixture의 equivalent strategic thin slice.
- Unreal: 같은 contract를 소비하는 tactical-only selection/move/fire/damage/effect spike.
- Stride와 Bevy: versioned release/tooling/platform/license risk를 추적하는 watch lane. material change가 있을 때만 equivalent slice 후보로 승격.

Godot/Unity 공통 PoC는 mock-only 데모가 아니라 검증된 server fixture로 login/session stub, strategic map subset, 한 command/event round trip, original/remaster asset fallback을 보여야 한다. 각 후보를 같은 rubric으로 평가한다.

미래 Windows x64 candidate의 Wine acceptance는 legacy `$logh7-wine-live-qa`와 분리한다. candidate 전용 Win64 prefix, ports, PID ledger, evidence namespace를 사용하고 candidate verdict를 legacy regression pass로 합치지 않는다.

| 기준 | 증거 |
| --- | --- |
| protocol/command parity | 같은 fixture와 expected event 결과 |
| legacy adapter 격리 | shared contract와 adapter dependency graph |
| 2D/3D·UI·한글 입력 적합성 | 최소 scene와 input/font capture |
| tooling/build reproducibility | clean build 명령과 artifact hash |
| 배포 크기·플랫폼 | 동일 configuration의 artifact size와 target matrix |
| runtime 성능 | 같은 scene의 frame/memory/startup 측정 |
| 라이선스·유지보수·bus factor | versioned dependency/rights/risk 기록 |
| provenance·fallback·rollback | original/remaster manifest와 disable proof |

PoC 결과는 M4 gate를 대신하지 않는다. engine 선택은 최소 세 lane의 같은 rubric 결과와 reviewer 승인이 나온 뒤 별도 결정 record에서 한다.

## 종료 증거

phase 완료는 다음이 모두 있어야 한다.

- producer artifacts와 reviewer verdict.
- correlation schema validation 결과.
- 관련 자동 test와 실제 Wine client natural-output evidence의 분리된 결과.
- exact hashes, PCAP/log/DB/screenshot index.
- process/port/prefix/registry/EXE cleanup·rollback receipt.
- 누락·미검증·부분 실패를 포함한 `synthesis.md`.

자동 test, process exit code, host proxy, Wine screenshot 중 하나만으로 gameplay 완료를 주장하지 않는다.
