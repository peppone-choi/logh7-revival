# LOGH VII 전체 인과 원장 마스터 설계

> 상태: **PROPOSED — 사용자 승인 전 제품 구현 금지**
> 설계 버전: `0.1.0`
> 기준 checkout: `110718e12a1e0ec8bcad14cfe594e571e6c37b0e`
> 적용 브랜치: `peppone-choi/216-실제-구현`
> 트래커: GitHub #216~#231 / Jira LOGH7-213~228
> 작성 기준일: 2026-07-20
> 독립 검토: architecture/acceptance **PASS**, rights/security/resource **PASS** (`bcfdd971875603f2ddd3c1f07709d159c47609ba7003ff15e82e79fa756d3989` 검토 입력 SHA-256)

## 1. 목적과 승인 경계

이 설계는 LOGH VII의 동작을 다음 인과 사슬로 기록하고 검증하는 공통 계약이다.

```text
실제 입력
→ 클라이언트 상태 전이
→ 요청
→ 서버 권위 검증·규칙·영속성
→ 응답·push
→ 클라이언트 상태 전이
→ 실제 픽셀·텍스트·오디오
→ 다음 입력 가능 상태
```

독립 구현 팀은 제한된 원본 바이너리나 외부 코드를 보지 않고 이 원장의 의미 사양, 합법적으로 확보한 리소스, fixture와 oracle만으로 대표 흐름을 재구현할 수 있어야 한다.

이 문서의 승인은 다음 범위만 승인한다.

- 15개 축의 책임, 의존성, 산출물, 검증과 완료 기준
- 승인된 범위 안에서 자식 이슈별 조사·구현·검증·commit·push·PR·tracker 동기화
- 이 문서가 정의한 P3 격리, clean-room, 보안, 자원 제한, 증거 계약

승인에 포함되지 않는 행위:

- 마스터 설계 PR merge
- 각 자식 PR merge
- main 직접 commit, force push, 히스토리 재작성
- 비밀 접근, 데이터 삭제, 외부 코드 이식
- canonical 승격, P3의 canonical 전환, 비가역 schema/migration, 새 의존성
- 실제 EXE patch/rebaseline, 권리 판정, 보안 게이트 약화, 설계 범위 변경

사용자가 이 설계와 설계 PR merge를 승인하기 전에는 제품 코드, 테스트, DB, client runtime, port 47900을 사용하지 않는다. 기존 P0/M4 계약은 역사와 근거로 보존하지만 실행 우선순위는 이 승인 게이트 뒤로 이동한다.

## 2. 선택한 구조와 대안

### 선택: 계약 문서 + 기계 판독 원장

이 문서는 축 경계, 공통 불변식, DAG와 완료 기준을 소유한다. A01이 versioned machine-readable schema와 validator를 구현하고, 나머지 축은 같은 schema로 node, edge, evidence를 납품한다. A10은 15축 전체를 독립 합성 검증한다.

검토한 대안:

1. 축별 자유 형식 문서만 작성: 빨리 시작할 수 있으나 orphan, dangling edge, 근거 없는 승격을 자동 검출할 수 없어 제외한다.
2. 단일 거대 그래프에 모든 의미를 즉시 고정: 기계 검증은 쉽지만 미확정 RE와 미래 구현 파일까지 고정하므로 제외한다.
3. 공통 schema와 축별 증분 원장을 결합: 경계를 검증하면서 Unknown과 P3를 보존할 수 있어 채택한다.

미래 코드의 파일명, 함수명, 클래스 구조는 이 설계에서 고정하지 않는다. 각 자식 이슈는 착수 직전 current checkout을 다시 조사해 최소 구현 지점을 정한다.

## 3. 상위 구성요소

| 구성요소 | 결과 | 포함 축 |
|---|---|---|
| Ledger core | 같은 ID·등급·검증 규칙으로 모든 인과를 기록한다 | A01 |
| Legacy client behavior | 입력, UI/FSM, 렌더, GDI/D3D8/DirectSound를 실제 클라이언트 증거와 연결한다 | A02, A03 |
| Wire and authority | protocol/session과 서버 권위 command/event를 연결한다 | A04, A05 |
| State and content | data/asset/P3, persistence/time/RNG, bounded runtime을 관리한다 | A06, A07, A08 |
| Product boundary | failure/lineage, gameplay coverage, localization, rights, security, packaging을 관리한다 | A09, A11~A15 |
| Independent synthesis | 전 축을 clean-room 구현과 실제 수직 슬라이스로 검증한다 | A10 |

각 구성요소는 독립적으로 실패할 수 있다. 한 구성요소의 PASS는 다른 구성요소를 암시하지 않는다.

## 4. 용어와 독립 판정 차원

| 용어 | 의미 |
|---|---|
| `O0` | 원본 CD·리소스·설정에서 직접 추출한 사실 |
| `R1` | 공식 문서, binary RE, 동일 실행 live evidence로 확인한 사실 |
| `I2` | 복수 근거가 지지하지만 직접 확정하지 못한 추론 |
| `P3` | 원 서버 값을 복구할 수 없어 승인된 규칙으로 만든 임시 비정본 값 |
| `canonical` | 요구된 승격 근거와 reviewer 승인을 모두 통과한 정본 |
| `Unknown` | 영향과 후속 실험은 알지만 값이나 인과를 아직 확정하지 못한 상태 |
| `blocker` | 해당 AC의 PASS를 막는 미충족 조건 |
| `orphan` | coverage manifest에는 있으나 원장 node 또는 근거 있는 제외가 없는 항목 |
| `dangling edge` | from 또는 to node가 없거나 잘못된 축·버전을 가리키는 edge |

다음 판정은 서로 독립이다.

- evidence grade: `O0|R1|I2|P3`
- confidence: `confirmed|inferred|unknown|provisional`
- canonicality: `canonical|noncanonical|blocked`
- rights: `allowed|restricted|unknown|prohibited`
- verification: `unverified|partial|verified|contradicted`

기술적으로 confirmed인 파일도 rights가 unknown이면 배포할 수 없다. P3는 항상 noncanonical이다.

## 5. 공통 불변식

1. 원본 클라이언트는 1차 제품 경로와 호환성 oracle이다.
2. 클라이언트는 신뢰하지 않는다. 서버가 actor, ownership, precondition, cost, time, mutation, persistence와 broadcast를 결정한다.
3. 거부된 command는 권위 DB/session/domain event를 변경하지 않고 success response/push를 만들지 않는다. 정확히 하나의 bounded reject response는 계약된 오류 코드와 correlation ID로 보낼 수 있다.
4. 한 관측층의 성공으로 다른 층을 추론하지 않는다. static, client runtime, wire, server authority를 따로 판정한다.
5. 실제 픽셀·오디오·다음 입력 증거가 없는 client-visible 경로는 PASS가 아니다.
6. 항성 색, 검은 화면 해소, zero-fill, packet 도달은 행성 렌더나 gameplay PASS가 아니다.
7. P3는 canonical과 물리적·논리적으로 분리하며 P3→canonical dependency를 금지한다.
8. 원본 asset은 read-only fallback이다. 파생 overlay는 기본 off, hash guard, conflict check와 rollback을 가진다.
9. 모든 queue, buffer, cache, retry set, log sink, render/audio resource는 owner, 수명, hard bound와 종료 동작을 가진다.
10. EXE hash, image base, sentinel 또는 승인 lineage node가 다르면 launch, attach, patch를 차단한다.
11. 비밀, PII, raw 인증 payload는 원장과 tracked evidence에 저장하지 않는다.
12. 도구, 로그, 브라우저, 외부 문서, agent 결과는 지시가 아니라 비신뢰 데이터다.
13. historical 성공 수치와 사라진 artifact는 fresh gate가 아니다.
14. 선행 계약은 merge된 산출물만 소비한다. 미병합 PR 위에 후속 branch를 쌓지 않는다.
15. cross-axis edge는 정확히 한 owner를 가진다. consumer가 edge 검증에 참여해도 write owner는 바뀌지 않는다.
16. 접근성, 입력 검증, 권리, 데이터 손실 방지와 보안은 편의를 위해 축소하지 않는다.

## 6. Node, edge, evidence 계약

### 6.1 버전과 ID

- schema는 semantic version을 사용한다.
- stable ID는 `<axis>:<kind>:<stable-slug>` 형식이다.
- edge ID는 `<owner-axis>:edge:<from-slug>--<verb>--<to-slug>` 형식이다.
- evidence ID는 `<run-id>:<source>:<sequence>` 형식이다.
- breaking field·enum 변경은 major, additive optional field는 minor, 설명 보정은 patch를 올린다.
- migration은 source version, target version, deterministic transform, before/after hash, rollback을 기록한다.
- ID rename은 새 ID와 `supersedes` edge를 만들며 기존 ID를 재사용하지 않는다.

### 6.2 Node

| 필드 | 계약 |
|---|---|
| identity | `schemaVersion`, `nodeId`, `axis`, `type`, `domain`, `owner` |
| semantics | `summary`, `preconditions`, `postconditions`, `failureConditions` |
| surface | input, client-state, function, opcode, command, event, data, asset, persistence, clock, RNG, render, audio, test, failure, security, package 중 하나 |
| direction | `local|c2s|s2c|internal|none` |
| state | evidence grade, confidence, canonicality, rights, verification을 각각 기록 |
| lifetime | creator, consumer, disposer, scope, hard bound 또는 `not-applicable` 근거 |
| traceability | evidence IDs, related issue, AC IDs, source manifest hash |
| unresolved | Unknown/P3의 영향, blocker, 다음 실험, 해제 조건 |

### 6.3 Edge

| 필드 | 계약 |
|---|---|
| identity | `schemaVersion`, `edgeId`, `ownerAxis`, `edgeClass`, `from`, `to`, `verb` |
| ordering | correlation ID, causation ID, sequence, temporal predicate |
| state change | before, read-set, write-set, after, transaction boundary |
| outcomes | accepted, rejected, failed, retry, reconnect edge를 분리 |
| replay | idempotency key, dedupe window, duplicate outcome |
| evidence | grade, confidence, provenance, evidence IDs |
| validation | 양 endpoint 존재, direction 적합, 금지된 P3→canonical edge 아님 |

`edgeClass`는 `causal|dependency|evidence|lifecycle` 중 하나다. dependency cycle과 P3→canonical dependency 검사는 `edgeClass=dependency`에만 적용한다. `observes`, `requests`, `validates`, `depends-on`, `mutates`, `persists`, `emits`, `responds`, `broadcasts`, `stages`, `renders`, `plays`, `releases`, `recovers`, `supersedes`를 기본 verb로 사용한다. 새 class나 verb는 A01 schema 변경으로 추가한다.

### 6.4 Evidence

| 필드 | 계약 |
|---|---|
| identity | evidence ID, type, producer, independent reviewer |
| source | URI/path, exact SHA-256, size, lineage, rights/access class |
| execution | platform, runtime mode, command, inputs, config hash, start/end time, exit code |
| observation | expected, observed, verdict, contradicted claim |
| artifacts | artifact path, SHA-256, redaction, retention, freshness |
| correlation | run, connection, message, command, node, edge와 AC 연결 |
| cleanup | PID, port, DB, temp, GUI, runtime workspace의 종료·잔여 상태 |

evidence 파일이 없거나 hash가 다르거나 reviewer가 접근할 수 없으면 verified로 판정하지 않는다.

### 6.5 Canonical 승격 상태 전이

| 후보 상태 | canonical 전이 | 필수 조건 |
|---|---|---|
| O0 | 조건부 허용 | 현재 source 존재, exact hash, deterministic extraction, reference loss 0, consumer 연결, fresh test/live evidence, contradiction 0, 독립 reviewer와 사용자 `approvalRef` |
| R1 | 조건부 허용 | primary manual/patch/binary/live 근거와 exact location/hash, 같은 의미를 검증하는 독립 evidence, consumer 연결, contradiction 0, 독립 reviewer와 사용자 `approvalRef` |
| I2 | 금지 | 새 O0/R1 근거로 새 candidate를 만들기 전에는 noncanonical 유지 |
| Unknown | 금지 | 영향·blocker·다음 실험·해제 조건 유지 |
| P3 | 금지 | P3 node 자체는 영구 noncanonical. 새 O0/R1 node가 증거를 얻으면 `supersedes`로 교체하고 P3 taint를 상속하지 않는 별도 승격 심사 |
| verification=contradicted | 금지 | 모순을 보존하고 source별 판정을 분리한 뒤 새 evidence로 해결 |

모든 전이는 이전/이후 state, evidence IDs, source-manifest hash, reviewer, `approvalRef`, 시각과 사유를 append-only transition으로 기록한다. rights는 기술 canonicality와 독립이므로 canonical이 되어도 rights `unknown|prohibited` package 차단은 유지한다.

### 6.6 Coverage manifest와 자동 실패

각 축은 coverage source의 exact hash와 생성 시각을 고정한다. 다음 항목은 validator 실패다.

- orphan node, dangling edge, duplicate ID, cycle이 금지된 dependency cycle
- 누락 provenance, 누락 owner, 누락 AC/evidence 연결
- `grade=P3 && canonicality=canonical`
- `grade=I2|P3`, confidence `unknown|provisional`, verification `contradicted`, 독립 reviewer 또는 `approvalRef` 누락 상태의 canonical 전이
- P3 node에서 canonical node로 향하는 dependency edge
- rights `unknown|prohibited` artifact의 distributable package 포함
- Unknown을 coverage 분모에서 제외하거나 근거 없이 confidence를 올리는 변경
- evidence artifact 부재, hash mismatch, stale lineage
- resource node의 owner, item/byte bound, shutdown/OOM 계약 누락

기존 opcode, RE, render, data audit import는 source record 수, imported 수, rejected 수와 이유를 기록하고 loss가 0이어야 한다.

## 7. Bounded resource 계약

### 7.1 공통 registry

모든 queue, buffer, cache, log, retry set, packet accumulator, DB projection, D3D8/GDI/DirectSound resource는 다음 값을 가진다.

| 필드 | 요구 |
|---|---|
| identity | resource ID, process/connection/session/world/transaction scope |
| ownership | producer, consumer, allocation owner, release owner |
| bounds | max items, max bytes, max item bytes, TTL. `unlimited` 금지 |
| watermarks | `0 < low < high < hard cap` |
| admission | allocation 전에 length/count를 검사하는 지점 |
| pressure | block, reject, drop, degrade 중 하나와 upstream 전파 |
| fairness | per-client와 process-global cap, starvation 방지 규칙 |
| retry | count, total time, backoff, jitter, dedupe key, bounded dead-letter 처리 |
| overflow | wire 오류, client state, authority state 불변 여부 |
| OOM | partial commit·success ack 금지, degrade 또는 controlled restart |
| shutdown | drain/abort timeout, in-flight ack, lease와 handle 회수 |
| observability | items, bytes, oldest age, lag, rejects, drops, RSS/heap, handles/GPU/audio resources |
| oracle | 부하율, 지속 시간, plateau, 허용 편차, 회수 grace, artifact path |

### 7.2 초기 안전 상한

원작 상한을 복구하지 못한 값은 `P3-SAFETY-1`로 격리한다. 아래 값은 운영 편의를 위한 canonical 게임 규칙이 아니며 부하 증거로 교체할 수 있다.

| Resource | scope/global hard bounds; single/TTL | high / low | pressure·overflow | owner | shutdown·OOM | hook·fault oracle |
|---|---|---|---|---|---|---|
| TCP frame accumulator | connection 1 frame/64 KiB; process 1,024/64 MiB; single 64 KiB; TTL 5초 | 48/16 KiB | header에서 선할당 전 reject+disconnect | session transport | 5초 abort·free; OOM은 connection fail, ack 0 | allocated bytes/age/reject; oversize·partial-header test |
| inbound frame queue | connection 256/1 MiB; process 65,536/256 MiB; single 64 KiB; TTL 5초 | 75%/25% | socket read pause, 5초 미복귀 시 disconnect | session dispatcher | 미착수 전량 reject, 10초 in-flight drain; OOM 새 read 차단 | items/bytes/oldest/pause/reject; fan-in burst |
| outbound frame queue | client 256/2 MiB; process 65,536/512 MiB; single 64 KiB; TTL 10초 | 75%/25% | `write(false)` 뒤 `drain`까지 producer 정지, timeout disconnect | session writer | 10초 drain 뒤 abort; post-commit OOM은 resync, rollback 금지 | items/bytes/drain age/disconnect; slow consumer/fanout |
| command admission queue | session 64/4 MiB; process 4,096/256 MiB; single 64 KiB; TTL 5초 | 48/16 items | `server-busy`, mutation·event·success ack 0 | application dispatcher | 미착수 reject, 15초 UoW drain; OOM admission close | depth/bytes/wait/reject; fair multi-session saturation |
| connection/session registry | account 1/4 KiB; process 10,000/40 MiB; single 4 KiB; heartbeat TTL 120초 | 7,500/2,500 | 새 login reject 또는 검증된 handoff, silent eviction 금지 | session authority | 10초 socket drain·presence reconcile; OOM 새 login 차단 | active/bytes/age/handoff/reconcile; reconnect storm |
| timer/job scheduler | world 2,000; process 10,000/16 MiB; single 64 KiB; TTL 최대 7일 | 75%/25% | 새 command reject, committed job은 durable ledger에서 재개 | scheduler owner | 10초 cursor checkpoint; OOM admission close+controlled restart | jobs/bytes/due lag/replay; clock jump·restart·cap |
| DB pool/UoW waiters | 16 connections; process 256 waiters/4 MiB; single 16 KiB; TTL 5초 | 192/64 waiters | FIFO timeout reject, transaction 전 mutation 0 | persistence owner | 15초 drain 뒤 rollback/close; OOM 새 transaction 차단 | busy/waiters/bytes/age/rollback; stall·crash |
| domain outbox/projection | process 4,096 events/32 MiB; single 64 KiB; TTL 24시간 | 3,072/1,024 | producer admission 중지; authority state와 outbox atomic | UoW/outbox owner | cursor 저장 뒤 15초 drain; OOM controlled restart | events/bytes/lag/parity/replay; projection stall |
| correlation buffer | run 1,024 events/4 MiB; process 4 runs/16 MiB; single 64 KiB; TTL 10분 | 75%/25% | debug drop 허용, domain/DB outcome drop은 release blocker | evidence writer | 5초 flush; OOM debug 비활성화, product state 불변 | items/bytes/age/drop/hash join; sink failure |
| diagnostic event ring | process 10,000 events/32 MiB; single 64 KiB; TTL 1시간 | 75%/25% | oldest diagnostic eviction, authority source 사용 금지 | observability owner | 즉시 clear; OOM ring disable+alert | depth/bytes/evict/RSS; sustained diagnostic flood |
| rotated log/file sink | file 16 MiB×16=256 MiB; queue 1,024/4 MiB; single 64 KiB; retention 30일 | 75%/25% | diagnostic drop+counter; audit spool 실패는 release blocker | operations owner | 5초 flush/fsync; OOM queue reject, product mutation과 분리 | queue/file bytes/age/drop/disk; disk-full·rotation |
| cache family | family 10,000/64 MiB; process 50,000/256 MiB; single 1 MiB; TTL 5분 | 75%/25% | LRU 후 source-of-truth resync, cache-only authority 금지 | cache owner | clear; OOM cache disable+explicit fetch/blocked | entries/bytes/hit/evict/resync; eviction storm |
| retry/dead-letter set | operation 5회/60초; process DLQ 1,000/64 MiB; single 1 MiB; TTL 7일 | 75%/25% | backoff+jitter+dedupe, cap에서 새 retry reject | originating service | durable record만 보존; OOM retry admission close | attempts/bytes/age/dedupe/DLQ; amplification test |
| reconnect handoff | account 1/4 KiB; process 10,000/40 MiB; single 4 KiB; TTL 30초 | 75%/25% | cryptographic consume-once, duplicate·expiry reject | session authority | 즉시 revoke; OOM 새 handoff 차단·fresh login | active/bytes/reuse/expiry; race·storm test |
| D3D8 texture/buffer set | process 4,096/512 MiB; single 64 MiB; TTL device lifetime | 75%/25% | optional cosmetic degrade, required surface는 reset/terminal UI | A03 render owner | 10초 Release grace; OOM success frame 금지 | Create/Reset/Release, bytes/handles; device-loss/allocation fault |
| GDI object set | surface 512 handles; process 8,000 handles/256 MiB private delta; single bitmap 16 MiB; TTL UI lifetime | 6,000/2,000 handles | optional create reject+stock fallback, selected object 삭제 금지 | A03 GDI owner | 10초 baseline+0; OOM optional UI degrade 또는 terminal UI | create/select/delete, handles/private bytes; leak/failure injection |
| DirectSound buffer/play queue | process 256 buffers/128 MiB, queue 512; single 8 MiB; TTL cue+10초 | 75%/25% | 중복 효과 drop+counter, required cue는 visible fallback+blocker | A03 audio owner | stop/release 10초 뒤 0; OOM success-audio 판정 금지 | create/play/stop/release, bytes/age/drop; allocation/device fault |

각 행은 item·byte·single-item cap 중 적용 가능한 세 값을 machine registry에 숫자로 기록하며, 적용 불가능한 단위는 `not-applicable` 근거를 validator가 요구한다. per-scope cap만 있고 process-global cap이 없거나, hook이 depth·bytes·oldest age·reject/drop·allocation/release를 관측하지 못하면 PASS가 아니다. 80% sustained 60초, hard-cap burst 10초, 종료 후 10초를 기본 stress oracle로 사용하고 authoritative state/event parity, RSS/heap·handle plateau ±5%, residual lease 0을 확인한다.

legacy client D3D8, GDI, DirectSound의 위 수치는 `P3-SAFETY-1` 예산이다. A03과 A08이 live hook으로 actual create/release 수와 plateau를 측정하고, 원본이 안전 예산을 초과하면 조용히 상한을 늘리지 않고 evidence와 영향으로 blocker를 제기한다. 상한을 관측하거나 안전하게 강제할 수 없는 resource도 PASS가 아니라 blocker로 남긴다.

필수 negative evidence:

- oversized packet 선할당 거부
- slow consumer와 broadcast fanout
- reconnect storm과 retry amplification
- DB stall과 projection lag
- cache eviction 뒤 authoritative resync
- D3D8 device loss와 DirectSound allocation failure
- shutdown 중 commit/emit 경계
- 통제된 allocation failure에서 partial success 0

## 8. 실패 전파와 복구

모든 failure node는 trigger, detector, propagation path, 차단 boundary, authority state, client-visible outcome, retry/idempotency, cleanup, recovery, operator owner와 evidence를 기록한다.

정상 command의 원자 경계:

```text
validate
→ reserve
→ mutate in UoW
→ persist state + command ledger + domain event
→ commit
→ response/broadcast
→ projection/client resync
```

commit 전 실패는 rollback하고 success 응답을 보내지 않는다. commit 뒤 response/broadcast 실패는 권위 상태를 되돌리지 않고 command ID로 resync한다. duplicate는 같은 결과를 반환하거나 명시적으로 거부하며 두 번째 mutation을 만들지 않는다.

| Failure class | authority 결과 | client/운영 결과 | 필수 복구 증거 |
|---|---|---|---|
| malformed, oversize, invalid encoding | 무변경 | bounded error 또는 disconnect | negative frame fixture, allocation 전 reject |
| authn/authz, forged actor, replay | 무변경 | 단일 거부 사유, rate/abuse signal | wrong actor, duplicate, replay, concurrency test |
| missing data 또는 승인된 P3 | 무변경 또는 별도 저장된 noncanonical overlay | 기능 blocked/P3 표시 | provenance/P3 taint validator |
| rights unknown/prohibited data | 접근·소비·파생·package 모두 차단 | rights blocker와 decision queue | allowlist deny fixture, package diff 0; 독립 생성 overlay는 금지 자료를 입력으로 쓰지 않고 별도 provenance 필요 |
| DB timeout/crash, partial write | rollback 또는 atomic commit 하나 | success ack 금지, retry 가능성 표시 | row/event/ledger parity, restart recovery |
| response/push failure after commit | committed 유지 | resync required, command ID 재조회 | reconnect 후 동일 state/event 1건 |
| queue/cache pressure, OOM | 새 admission 차단, in-flight UoW 보호 | degrade/reject/controlled restart | plateau, reject count, 회수 grace |
| disconnect/reconnect storm | committed state 유지 | 새 connection ID, one-time handoff | duplicate mutation 0, presence 정합 |
| D3D8/GDI/DirectSound failure | 서버 state 영향 없음 | reset/fallback 또는 terminal UI | handle/resource 회수와 다음 입력 상태 |
| lineage/runtime mismatch | 실행 전 무변경 | fail-closed receipt | process·port 0, expected/actual hash |
| migration/version mismatch | 적용 전 차단 또는 rollback | 이전 버전 유지 | backup→apply failure→restore hash/row parity |
| installer/update rollback | 원본 install 보존 | 실행 차단과 복구 안내 | file manifest·config·lineage 원복 |

## 9. 권리, clean-room, P3 경계

### 9.1 세 구역

1. Restricted evidence zone: 원본 binary, scan, raw memory/PCAP, 외부 코드는 승인된 분석자만 접근한다.
2. Sanitized specification zone: 의미 사양, hash metadata, redacted trace, fixture와 oracle만 둔다.
3. Independent implementation zone: 구현자는 sanitized export와 허용된 리소스만 사용한다.

공개 저장소와 배포 package에는 proprietary bytes, raw scan, 외부 코드, secret, PII를 넣지 않는다. 연구 evidence를 삭제할 필요가 있어도 기술 원장의 redacted metadata는 보존한다.

독립성은 정보 접근과 역할 분리를 모두 뜻한다. restricted-zone 분석자, sanitized export reviewer, independent implementer를 서로 다른 role ID로 기록하고 접근 이력·export hash·attestation을 남긴다. 한 사람이 여러 역할을 겸해야 하는 경우 clean-room PASS가 아니라 사람 승인 blocker로 남긴다.

### 9.2 Rights gate

- 배포 artifact 100%가 exact SHA-256와 rights disposition에 연결돼야 한다.
- `rights=unknown|prohibited`인 파일은 package를 fail-closed한다.
- `allowed` 판정은 holder/terms/license/evidence URI와 사람 승인 참조를 요구한다.
- client, server, public repo, internal evidence package는 서로 다른 allowlist를 가진다.
- 기술적 confirmed 상태는 rights 판정을 우회하지 않는다.

### 9.3 P3 gate

P3 record는 schema version, deterministic seed 또는 결정 규칙, 유효 범위, 적용 대상, 근거 없는 필드, overlay 우선순위, migration, rollback, 제거 조건, canonical 승격에 필요한 새 evidence를 기록한다.

P3는 queryable해야 하며 원본·canonical dataset 안에 inline으로 섞지 않는다. P3에서 생성한 cache, export, migration 결과에도 taint를 유지한다.

## 10. 보안과 접근성 경계

각 threat는 다음 사슬을 완성한다.

```text
untrusted boundary
→ protected asset
→ prevent
→ detect
→ respond
→ evidence
→ owner
→ test 또는 blocker
→ accepted residual risk
```

필수 경계는 legacy login/wire, reconnect/session, web/community, admin, DB/event log, trace/log, patch/mod/update, agent/toolchain, resource path와 rights/package다.

구현된 player command 100%는 authn, authz, ownership, schema/size/encoding, precondition, replay/idempotency, resource admission과 transaction 검증에 연결한다. security reviewer의 BLOCKER/MAJOR가 남으면 관련 milestone은 PASS가 아니다.

| Threat boundary | protected asset / prevent | detect / respond | owner / evidence·test / release blocker | residual risk |
|---|---|---|---|---|
| legacy login/wire | account·authority state / bounded parser, authn/authz, rate·replay·idempotency; public exposure는 TLS 또는 승인된 authenticated tunnel 전 차단 | malformed/replay/rate, certificate·downgrade metrics / reject·disconnect·cooldown·local-only 유지 | A04+A14 / wrong actor, duplicate, oversize, brute-force, invalid certificate·downgrade fixture / TLS 미구현 | owner·scope·expiry·사용자 승인 전 수용 불가 |
| reconnect/session | session identity·presence / cryptographic one-time token, bind, 30초 expiry, consume-once | reuse·concurrent handoff signal / revoke·fresh login | A07+A14 / reuse·expiry·race test / 비암호학적 handoff | owner·scope·expiry·사용자 승인 전 수용 불가 |
| web/community | identity·content·moderation / schema, authz, rate, output encoding | IDOR·injection·spam audit / reject·moderation queue | A11+A14 / cross-user, injection, flood test / surface Unknown | owner·scope·expiry·사용자 승인 전 수용 불가 |
| admin/operator | authority override·secrets / player surface 분리, least privilege, dual approval | immutable audit·privilege diff / revoke·incident process | A14+A15 / role escalation·override replay / active surface Unknown | owner·scope·expiry·사용자 승인 전 수용 불가 |
| DB/event log | canonical state·audit / UoW, append parity, backup | row/event/ledger mismatch / rollback·restore·reconcile | A07+A14 / crash·partial-write·restore drill / fresh restore 부재 | owner·scope·expiry·사용자 승인 전 수용 불가 |
| trace/log | credentials·token·PII / default redaction, allowlisted fields, bounded retention | secret scanner·retention metric / quarantine·delete·rotate | A09+A14 / credential/PII negative fixture / policy 미결정 | owner·scope·expiry·사용자 승인 전 수용 불가 |
| patch/mod/update | client lineage·host integrity / hash, signature where available, target sentinel, conflict, rollback | manifest/lineage mismatch / launch 차단·원본 복구 | A09+A15 / wrong target·tamper·rollback / signing model 미결정 | owner·scope·expiry·사용자 승인 전 수용 불가 |
| agent/toolchain | source·build·secret / pinned source/hash, output-as-data, secret isolation | dependency/provenance diff / quarantine·independent review | A09+A14 / prompt-injection·tampered dependency fixture / external tool trust | owner·scope·expiry·사용자 승인 전 수용 불가 |
| resource path | availability·state integrity / §7 hard caps and admission | depth/bytes/RSS/handle plateau / backpressure·reject·controlled restart | A08+A14 / oversize·slow consumer·storm·OOM / cap 미구현 | owner·scope·expiry·사용자 승인 전 수용 불가 |
| rights/package | lawful distribution·restricted evidence / separate rights disposition and allowlist | package diff·secret/proprietary scan / build fail-closed | A13+A15 / Unknown/prohibited injection fixture / human rights decision | owner·scope·expiry·사용자 승인 전 수용 불가 |

residual risk는 `owner`, `scope`, `expiry/review date`, 사용자 승인 참조 네 필드가 모두 있어야만 accepted 상태가 된다. 하나라도 비면 해당 threat는 blocker다.

새로 만들거나 수정한 UI는 keyboard-only 경로, visible focus, 색상 외 상태 표현, text 가독성/확대, IME/encoding 검증을 갖춘다. 수정할 수 없는 legacy 한계는 영향과 대체 경로를 기록하고 사람 승인 residual risk로 남긴다.

## 11. 15개 축 계약

GitHub와 Jira 번호를 순번으로 계산하지 않는다. 다음 표가 유일한 축 매핑이다. A09와 A10은 GitHub 생성 순서와 Jira P0 순서가 엇갈린다.

| Axis | GitHub | Jira | 단일 owner |
|---|---:|---|---|
| A01 Ledger schema | #217 | LOGH7-214 | ledger/schema owner |
| A02 Input/UI/FSM | #218 | LOGH7-215 | client-input owner |
| A03 Output/render/audio | #219 | LOGH7-216 | client-output owner |
| A04 Protocol/session | #220 | LOGH7-217 | wire owner |
| A05 Authority/domain | #221 | LOGH7-218 | server-domain owner |
| A06 Data/assets/P3 | #222 | LOGH7-219 | data-provenance owner |
| A07 Persistence/time/RNG | #223 | LOGH7-220 | persistence owner |
| A08 CQRS/resource/OOM | #224 | LOGH7-221 | runtime-resource owner |
| A09 Failure/ops/lineage | #225 | LOGH7-223 | operations owner |
| A10 Verification/handoff | #226 | LOGH7-222 | independent verification owner |
| A11 Gameplay coverage | #227 | LOGH7-224 | gameplay-catalog owner |
| A12 Korean/IME/encoding | #228 | LOGH7-225 | localization owner |
| A13 Rights/redistribution | #229 | LOGH7-226 | rights owner |
| A14 Security/anti-cheat | #230 | LOGH7-227 | security owner |
| A15 Packaging/lifecycle | #231 | LOGH7-228 | release owner |

### A01. Ledger schema, classification, missing detection

- 책임: versioned node/edge/evidence schema, stable ID, coverage manifest, import adapter, validator와 migration 계약.
- 비범위: 개별 gameplay 의미 확정, client/server 제품 동작 변경.
- 입력: 기존 opcode·RE·render·data audit와 15축 tracker 요구.
- 출력: 모든 축이 소비하는 schema, positive/negative fixtures, lossless import report, orphan/dangling/cycle report.
- 현재 근거: `tools/extract/audit_docs_requirements.mjs`, `audit_data_decode.mjs`, `audit_exe_re_coverage.mjs`는 부분 inventory를 제공하지만 통합 graph는 없다.
- PASS: 필수 필드·enum·ID·version·migration 정의, 대표 기존 audit import loss 0, duplicate/orphan/dangling/provenance 누락과 P3→canonical 오염 fixture가 모두 validator 실패.
- 위험·해제: 기존 schema checkpoint는 마스터 승인 전 구현이므로 초안 입력으로만 사용한다. 승인·merge 뒤 current schema와 비교해 채택·교체를 결정한다.

### A02. Client input, UI, FSM

- 책임: WndProc, DirectInput, keyboard, mouse, IME, launcher/config, menu/dialog/panel, focus, hit-test, camera와 local FSM.
- 비범위: wire DTO 의미와 server authority, 실제 draw/audio 소비.
- 입력: A01 schema, exact EXE lineage, UI coordinate audit, input hook.
- 출력: input node, client before/after state, enabled/disabled/select/cancel predicate, outbound/local edge, next-input state.
- 현재 근거: `tools/logh7_ui_explorer.py`와 Frida probe는 입력·관찰 도구지만 좌표 자동화 자체는 제품 PASS가 아니다.
- PASS: known input surface 100%가 transition, Unknown 또는 근거 있는 제외에 연결되고 대표 login/lobby/world/strategy/battle/chat 흐름의 순서와 다음 입력 가능 상태가 actual trace로 확인됨.
- 위험·해제: 폐쇄 EXE FSM과 focus/timing은 Unknown이다. lineage가 확인된 client hook과 정상·거부 A/B로 해제한다.

### A03. D3D8, GDI, DirectSound output

- 책임: draw/present, GDI text/font/dialog, DirectSound buffer/play/stop/release, asset lookup, camera/visibility, device loss.
- 비범위: upstream authority 규칙과 asset rights 판정.
- 입력: A02 client state, A04 response/push, A06 asset, exact runtime environment.
- 출력: upstream state→render/audio predicate→resource lifecycle→actual pixel/text/audio edge.
- 현재 근거: `docs/logh7-render-verification-spec.md`, D3D8 sidecar, screenshot/pixel probe가 있으나 command와 frame/audio event를 묶은 oracle은 없다.
- PASS: output 100%가 upstream state/data/function/asset에 연결되고 actual pixel/audio와 lifecycle failure/reset/release가 확인됨. 행성은 항성 색과 별도로 판정.
- 위험·해제: audio device 존재는 실제 출력 증거가 아니다. loopback capture 또는 동등한 physical-output signal과 DirectSound hook을 함께 요구한다.

### A04. Protocol, session, synchronization

- 책임: opcode 방향·pair, framing, DTO size/layout/endian/encoding, dispatcher/parser, session phase, order, correlation, timeout/retry/reconnect.
- 비범위: domain mutation의 정당성, screen/audio PASS.
- 입력: A01 schema, static/live parser evidence, current opcode coverage.
- 출력: request/response/push API ledger, multi-step FSM, malformed/oversize/replay semantics, client/proxy/server correlation.
- 현재 근거: `server/src/server/logh7-frame-stream.mjs`, `logh7-playable-server.mjs`, `tools/live/logh7_packet_lab_proxy.mjs`와 opcode 문서. 전체 3면 join은 미완성.
- PASS: known opcode 100%가 handler/DTO/evidence 또는 Unknown에 연결되고 normal/reject/timeout/reconnect sequence와 byte/hash correlation이 fresh run에서 일치함.
- 위험·해제: packet 도달로 output을 추론하지 않는다. doc/dispatcher drift와 endian Unknown은 exact client/parser A/B로 해제한다.

### A05. Server authority, domain command, event

- 책임: UI intent를 permission, ownership, precondition, cost/reservation, rule, transaction, event, response/broadcast와 observable outcome에 연결.
- 비범위: client-local FSM과 원본 asset extraction.
- 입력: A04 wire contract, A06 data/provenance, D0의 transaction·거부 불변식.
- 출력: command/query/event/projection ledger, invariant, read/write set, reject reason, audience, Unknown factory blocker.
- 현재 근거: `server/src/application/handlers.mjs`, `domain/authority-cards.mjs`; 81 strategy command 중 대부분과 CP ledger/timer/job/outcome은 미확정.
- PASS: 구현 command 100%가 UI→wire→validate→mutate/persist→event/response/broadcast→visible effect와 normal/reject/failure scenario에 연결됨. unknown factory 추측 구현 0.
- 위험·해제: 서버 미구현, client 미요청, data 누락을 구분하고 각각 다른 blocker/evidence로 해제한다.

### A06. Data, assets, content, P3

- 책임: CD/client/manual/patch/config/server-authored/generated source, data/asset consumer, P3 overlay와 taint.
- 비범위: rights 허용 판정과 renderer 동작.
- 입력: A01 schema, source root manifests, extractor/hash, manual/RE/live evidence.
- 출력: value/asset catalog, provenance/confidence/canonicality, consumer edge, orphan report, P3 migration/rollback.
- 현재 근거: `server/src/infrastructure/persistence/Database.mjs`, 15개 server-servable family manifest와 여러 audit. 기존 content JSON은 자동 정본이 아니다.
- PASS: value/asset 100%에 source와 consumer 또는 명시 Unknown이 있고 원본/generated/P3가 분리됨. P3 deterministic replay와 taint validator 통과, source/consumer orphan 0 또는 blocker.
- 위험·해제: source가 있어도 rights와 gameplay 의미는 별도다. A13 rights와 A03/A05 consumer evidence가 모두 있어야 배포·canonical 후보가 된다.

### A07. Persistence, time, RNG, reconnect

- 책임: persisted/derived state, transaction/recovery source, clock unit, scheduler, RNG seed/order, idempotency, restart/reconnect/resync, migration.
- 비범위: transport framing과 business command 규칙.
- 입력: A05 authoritative state/event, A06 data, DB schema와 session lifecycle.
- 출력: state owner, UoW boundary, clock/RNG ledger, replay fixture, backup/restore/resync oracle.
- 현재 근거: `Database.mjs`의 SQLite WAL/FK/migration과 `UnitOfWork.mjs` transaction. 주입 clock/RNG, deterministic replay, durable reconnect handoff와 restore drill은 없다.
- PASS: authority state 100%에 persistence/recovery owner가 있고 clock·restart, RNG seed/order 또는 격리, duplicate/disconnect/crash resync가 fresh DB/state diff로 확인됨.
- 위험·해제: 프로세스 메모리 handoff와 PostgreSQL stub은 release blocker다. one-time cryptographic handoff, contract suite와 restore drill로 해제한다.

### A08. CQRS, queue, buffer, cache, OOM

- 책임: process부터 projection까지 runtime resource 수명, bound, pressure, overload, allocation failure, metrics와 회수.
- 비범위: external incident 운영과 EXE lineage.
- 입력: A02 client input resource, A03 render/audio resource, A04 traffic, A05 command/event, A07 persistence, A09 runtime lease·cleanup contract.
- 출력: bounded-resource registry, overload policy, stress/fault fixtures, plateau/cleanup receipt.
- 현재 근거: `server/src/application/bus.mjs`, `GameApplication.mjs`; product server는 `socket.write()` pressure와 event/player/reconnect/trace 상한을 완결하지 않았다.
- PASS: 발견 resource의 무상한 항목 0 또는 blocker, 각 항목의 numeric item/byte cap·TTL·owner·pressure·shutdown/OOM·metrics 존재, §7 negative evidence 통과.
- 위험·해제: per-client cap만 두고 global/fanout cap을 빠뜨리거나 retry/DLQ가 새 무한 queue가 되는 설계를 validator가 차단한다.

### A09. Failure, operations, EXE lineage, safety

- 책임: failure trigger/detection/recovery, host/runtime capability, EXE lineage, stateful lease, cleanup, rollback, redaction과 receipt integrity.
- 비범위: 내부 queue sizing과 gameplay rule.
- 입력: client lineage, runtime mode, D0의 bounded-resource·cleanup 계약, operational baseline.
- 출력: fail-closed policy, environment/lineage/lease receipt, incident owner, cleanup residual report.
- 현재 근거: `docs/logh7-client-lineage-current.md`, `docs/logh7-wine-live-qa.md`; 일부 historical raw run evidence가 현재 checkout에 없다.
- PASS: failure class마다 safe outcome과 reproduction artifact, 모든 lineage 승인/거부 조건, stateful resource lease/cleanup, unsupported runtime silent success 0.
- 위험·해제: hash 동일성은 gameplay 증거가 아니다. environment, wire, client output, DB와 cleanup을 같은 run으로 연결한다.

### A10. Verification matrix and clean-room handoff

- 책임: A01~A09와 A11~A15 전부의 AC↔node/edge↔evidence 합성, 독립 재실행, clean-room export와 final audit.
- 비범위: producer 축의 제품 구현과 rights 판정 자체.
- 입력: 15축 merge 산출물, source-manifest hash, actual evidence와 blocker.
- 출력: verification matrix, sanitized handoff bundle, independent implementation receipt, pass/fix/redo reviews, completion audit.
- 현재 근거: `docs/agent/verification.md`는 변경 유형별 최소 검증을 제공하지만 master traceability와 독립 구현 bundle은 없다.
- PASS: 모든 top-level domain에 normal/reject/failure/reconnect가 있고 actual pixel/audio/next-input을 포함한 대표 흐름을 제한 원본 접근 없는 독립 구현자가 같은 oracle로 통과함.
- 위험·해제: tracker 본문이 A11~A15를 누락한다. 이 설계가 15축 전부를 hard dependency로 교정하며 merge 뒤 tracker도 동기화한다.

### A11. Gameplay capability and vertical-slice coverage

- 책임: strategy, tactical/combat/fleet, economy/logistics/production, social/community, AI/NPC의 player-facing capability 전수 색인.
- 비범위: 각 기술 축의 세부 구현 소유권.
- 입력: manual/patch/EXE/UI/data/live inventory와 A02~A09, A12~A14 산출물.
- 출력: capability→owner/Unknown/Blocked/P3 mapping, domain slice, orphan feature report.
- 현재 근거: EnterWorld/MoveGrid authority와 TCP/CQRS tests가 있으나 fleet marker/selection/0x032f/Warp부터 pixel/audio/next-input까지 fresh live chain은 없다.
- PASS: known capability 100%가 owner 상태를 가지며 각 domain에 authority mutation, persistence/replay, client-visible outcome, reject/failure path가 있음.
- 위험·해제: coverage 분모를 source-manifest hash로 고정한다. Unknown과 unimplemented를 분모에서 빼지 않는다.

### A12. Korean, IME, font, wire encoding

- 책임: at-rest text, patch conversion, IME input, wire, persistence, GDI/font/layout와 remote render.
- 비범위: 일반 render lifecycle과 text 내용의 권리 판정.
- 입력: A02 input, A03 output, A04 wire, A06 source, A07 persistence, A13 rights.
- 출력: text-surface inventory, field encoding contract, glossary/provenance, CP949/SJIS A/B와 rollback.
- 현재 근거: Hangul character-name tests, guarded charset patch, CP932/CP949 문서. 전체 UI와 two-client roundtrip은 미완료.
- PASS: text surface 100%에 encoding/conversion/consumer/font/layout limit이 있고 name/chat 두-client roundtrip, wire·DB bytes, actual screen과 rollback이 확인됨.
- 위험·해제: CP949 raw chat과 일부 u16LE 경로의 충돌을 field별로 분리하며 임의 전역 변환을 금지한다.

### A13. Rights, redistribution, clean-room provenance

- 책임: holder/terms/license, redistribution/derivative/storage/package 판정, restricted evidence와 sanitized spec의 접근 경계.
- 비범위: 기술 source/hash confidence와 package 구현.
- 입력: D0의 artifact candidate/source manifest와 sanitized-export 계약, 인간 권리 결정. A06 technical provenance는 병렬 산출물로 교차 검증하지만 rights 판정의 선행 권위가 아니다.
- 출력: rights registry, package allow/deny list, decision queue, clean-room attestation.
- 현재 근거: 원본 EXE 미커밋 정책과 P/R provenance는 기술 경계만 제공한다. 현재 rights는 Unknown이고 redistribution은 blocked다.
- PASS: 배포 후보 100%에 rights disposition 또는 blocker, restricted source와 clean-room spec 분리, package allowlist diff 0, 기술 confirmed로 rights Unknown 우회 0.
- 위험·해제: 최종 권리 판정은 사람 담당이며 이 문서는 법률 자문이 아니다.

### A14. Security, abuse resistance, anti-cheat

- 책임: trust boundary, protected asset, server-authoritative validation, replay/rate/resource/admin/PII/supply-chain defense와 residual risk.
- 비범위: client anti-tamper를 권위로 사용하는 접근.
- 입력: A04 protocol, A05 authority, A07 replay/session, A08 resource, A09 operations, A13 rights/supply chain.
- 출력: threat→control→test matrix, abuse telemetry, incident response, independent security verdict.
- 현재 근거: strict frame parsing과 일부 authority 검증은 있으나 plaintext dev-password registry, TLS/rate/replay/connection bounds, durable handoff와 admin surface는 release blocker다.
- PASS: untrusted boundary와 asset 100% 분류, implemented command 100% validation, replay/abuse/resource/PII/supply-chain negative evidence 또는 blocker, security BLOCKER/MAJOR 0.
- 위험·해제: accepted residual risk는 owner, scope, expiry/review date와 사용자 승인을 요구한다.

### A15. Packaging, install, update, config lifecycle

- 책임: client/server package manifest, direct player journey, platform/prerequisite/config/version/secrets boundary, update/rollback, backup/restore와 compatibility.
- 비범위: artifact rights 판정과 gameplay correctness.
- 입력: A03 client output, A09 lineage/ops, A12 localization layer, A13 rights, A14 security.
- 출력: package allowlist, deterministic layer order, config schema/migration, install/update/rollback/restore receipt, compatibility matrix.
- 현재 근거: Dockerfile/compose, npm scripts, patch/lineage 도구는 skeleton이다. 게임 installer/updater, signed manifest, SBOM, config migration과 mismatch policy는 없다.
- PASS: package/config owner 명확, CD→official patch→optional layer deterministic/rollback, fresh install direct `g7mtclient.exe` path, server backup/restore, version mismatch fail-closed, lineage/security/rights gate 통과. 네트워크 updater는 signed manifest, trusted key rotation/revocation, downgrade·rollback-attack 차단을 통과하고 배포 manifest는 SBOM 또는 동등한 dependency/provenance inventory와 rights allowlist를 포함한다.
- 위험·해제: helper만 통과하는 경로와 dev credential/loopback-only 구성을 release PASS로 쓰지 않는다. unsigned/tampered manifest, revoked key, older version, SBOM 누락 fixture는 package를 차단해야 한다.

## 12. 의존성 DAG와 실행 파동

`D0`은 사용자 승인을 받고 merge된 이 마스터 설계다.

```text
D0
└─ A01 schema
   ├─ A02 input/UI/FSM
   ├─ A04 protocol/session
   ├─ A06 data/assets/P3
   ├─ A09 failure/ops/lineage
   └─ A13 rights

A02 + A04 + A06
└─ A03 output/render/audio

A04 + A06
└─ A05 authority/domain

A05 + A06
└─ A07 persistence/time/RNG

A02 + A03 + A04 + A05 + A07 + A09
└─ A08 resource/CQRS/OOM

A02 + A03 + A04 + A06 + A07 + A13
└─ A12 Korean/IME/encoding

A04 + A05 + A07 + A08 + A09 + A13
└─ A14 security/anti-cheat

A02..A09 + A12 + A13 + A14
└─ A11 gameplay/vertical slices

A03 + A09 + A12 + A13 + A14
└─ A15 package/install/update

A01..A09 + A11..A15
└─ A10 independent verification/handoff
```

같은 DAG의 기계 판독 정본은 다음 JSON이다. 배열 값은 해당 축이 PASS 전에 요구하는 merge된 prerequisite다. A01 validator는 이 block을 schema artifact로 옮기고 cycle·unknown ID·self-edge·누락 A01 edge를 실패시킨다.

```json
{
  "D0": [],
  "A01": ["D0"],
  "A02": ["A01"],
  "A03": ["A01", "A02", "A04", "A06"],
  "A04": ["A01"],
  "A05": ["A01", "A04", "A06"],
  "A06": ["A01"],
  "A07": ["A01", "A05", "A06"],
  "A08": ["A01", "A02", "A03", "A04", "A05", "A07", "A09"],
  "A09": ["A01"],
  "A10": ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A11", "A12", "A13", "A14", "A15"],
  "A11": ["A01", "A02", "A03", "A04", "A05", "A06", "A07", "A08", "A09", "A12", "A13", "A14"],
  "A12": ["A01", "A02", "A03", "A04", "A06", "A07", "A13"],
  "A13": ["A01"],
  "A14": ["A01", "A04", "A05", "A07", "A08", "A09", "A13"],
  "A15": ["A01", "A03", "A09", "A12", "A13", "A14"]
}
```

파동 규칙:

1. Wave 0: D0와 A01을 순서대로 merge한다.
2. Wave 1: A02, A04, A06, A09, A13의 read-heavy inventory를 병렬로 진행한다.
3. Wave 2: merge된 A02+A04+A06을 바탕으로 A03을 우선해 입력→wire→pixel/audio 경로를 연다. A05도 병렬 가능하다.
4. Wave 3: A07, A08, A12, A14를 각 hard dependency merge 뒤 진행한다.
5. Wave 4: A11과 A15를 닫고, A10이 15축 전체를 독립 합성한다.

초기 inventory는 일찍 시작할 수 있어도 축 PASS와 downstream dependency는 위 hard edge를 지킨다. 같은 파동에서 가능한 축 중 실제 play, pixel, audio에 가장 가까운 경로를 먼저 선택한다. stateful client runtime, GUI, DB, ports, install copy는 단일 live owner가 직렬 소유한다.

Jira의 현재 `LOGH7-85 → LOGH7-213 blocked` 링크는 본문 의도와 반대다. D0 merge 뒤 reversed blocker를 제거하고 LOGH7-85를 LOGH7-213의 downstream consumer로 연결한다. LOGH7-214 본문은 A01이 A02~A15 전체의 공통 선행임을 명시하고, A10 tracker 설명도 A11~A15를 포함하도록 고친 뒤 모두 read-back한다.

## 13. 대표 수직 슬라이스: 전략맵 이동에서 Warp까지

현재 checkout의 가장 긴 확인 경로는 move 요청 `0x0b01` → authority validation → SQLite UoW → `0x0b07` broadcast다. 대표 slice는 이 경로를 실제 UI의 Warp command까지 확장한다. 미확정 `0x2b` field와 client predicate는 Unknown으로 유지한다.

### 13.1 정상 시나리오

| 순서 | 인과 | 소유 축 | 필수 증거 |
|---:|---|---|---|
| 1 | 사용자가 실제 전략맵에서 함대를 선택하고 Warp를 입력 | A02, A11 | input hook, before/after FSM, enabled predicate, screenshot |
| 2 | client가 command factory와 DTO를 만들고 전송 | A02, A04 | function trace, exact bytes/hash, connection/frame sequence |
| 3 | server가 session, actor, unit ownership, target, range, CP/PCP/MCP, cooldown을 검증 | A05, A14 | read-set, validation outcome, wrong-actor control |
| 4 | command ID와 idempotency key를 만들고 resource를 reserve | A05, A07, A08 | ledger row, reservation, bounded admission metrics |
| 5 | timer/job 또는 즉시 outcome이 domain event를 만든다 | A05, A07 | clock source, event, RNG seed/order 또는 not-applicable 근거 |
| 6 | state, command ledger, event를 SQLite transaction으로 commit | A07 | before/after DB, row/event count, transaction ID |
| 7 | actor response와 observer push를 전송 | A04, A05, A08 | A/B frame sequence, payload hash, slow-consumer control |
| 8 | 두 client가 state/cache/projection을 갱신 | A02, A03 | parser/memory trace, cache state, duplicate 적용 0 |
| 9 | 위치/HUD/효과의 실제 pixel/text와 canonical predicate가 요구하는 audio가 출력 | A03, A06 | render predicate, pixels, DirectSound/output capture, asset hash; Warp audio가 실제로 N/A이면 그 근거와 같은 run에서 다음 audio-bearing 입력까지 확장한 sibling chain |
| 10 | 다음 command가 입력 가능한 안정 상태가 된다 | A02, A11 | next-input probe와 화면 상태 |
| 11 | disconnect/restart/reconnect 뒤 같은 authoritative 결과를 복구 | A07, A09 | server restart, DB state, resync, cleanup receipt |

현재 fleet marker, selection, `0x032e→0x032f` 멤버리스트와 Warp 도달은 blocker다. 이 blocker를 숨기기 위해 direct packet injection, FSM mutation, preseed 또는 helper-only 경로를 gameplay PASS로 사용하지 않는다.

### 13.2 거부 시나리오

- wrong actor/unit, offline, invalid target, insufficient resource, cooldown, duplicate/replay를 각각 실행한다.
- 권위 DB/session/domain event mutation과 success response/broadcast가 0임을 증명한다.
- 정확히 하나의 bounded reject response 또는 계약된 disconnect를 correlation ID로 관측하고, client는 이유를 표시하거나 bounded terminal state로 가며 다음 유효 입력을 받을 수 있어야 한다.

### 13.3 실패 시나리오

- DB timeout/crash, response/push failure, slow observer, queue cap, allocation failure를 한 번에 하나씩 주입한다.
- commit 전 실패는 rollback, commit 뒤 전송 실패는 command ID resync로 수렴한다.
- success ack 뒤 state/event가 사라지는 경우를 허용하지 않는다.

### 13.4 재접속 시나리오

- 새 connection ID와 consume-once handoff를 사용한다.
- 동일 command mutation/event는 1건이고 두 client가 같은 위치·HUD로 수렴한다.
- reconnect storm에서도 §7 상한과 cleanup residual 0을 지킨다.

## 14. 축별 수용·증거 매트릭스

| Axis | 측정 가능한 PASS | 최소 fresh evidence |
|---|---|---|
| A01 | import loss 0, validator가 orphan/dangling/duplicate/provenance/P3 오염 fixture 전부 거부 | schema tests, import report, graph validation |
| A02 | known input 100% 분류, control predicate와 next-input 존재 | input/FSM hook, screen, normal/reject trace |
| A03 | output 100% upstream 연결, 실제 pixel/audio 없는 PASS 0 | render/audio hook, capture, device-failure receipt |
| A04 | known opcode 100% handler/DTO/evidence/Unknown, sequence와 3면 hash join | client/proxy/server trace, malformed/reconnect tests |
| A05 | implemented command 100% authority chain, reject 무변경 | normal/reject/failure state/event/DB receipt |
| A06 | datum/asset 100% provenance+consumer/Unknown, P3 taint leak 0 | catalog validator, deterministic P3 replay |
| A07 | authority state 100% persistence/recovery owner, time/RNG/reconnect oracle | restart/replay/DB diff, backup/restore |
| A08 | unbounded resource 0 또는 blocker, numeric bound와 plateau/reclaim | overload/OOM metrics and cleanup |
| A09 | failure/lineage/runtime/lease 전수 safe outcome, silent success 0 | fail-closed negative tests, lineage/environment/cleanup receipt |
| A10 | 15축 matrix 완결, 독립 구현자가 restricted source 없이 대표 oracle 통과 | sanitized export hash, independent run and attestation |
| A11 | known capability 100% owner/Unknown/Blocked/P3, 각 domain slice 존재 | capability coverage and vertical-slice receipts |
| A12 | text surface 100% field contract, two-client Korean roundtrip | input/wire/DB/font/screen A/B and rollback |
| A13 | distributable artifact 100% rights disposition, Unknown 포함 0 | rights registry, package allowlist diff, human approvals |
| A14 | boundary/asset 100% 분류, command validation 100%, BLOCKER/MAJOR 0 | threat-control-test matrix, independent security review |
| A15 | deterministic install/update/rollback/restore와 mismatch fail-closed | clean-host package manifests and lifecycle receipts |

100%의 분모는 source manifest exact hash와 생성 시각을 포함한다. source가 늘면 분모가 바뀌고 관련 축을 다시 검증한다.

## 15. 라이브·수동 QA 계약

1. `sys.platform`과 runtime mode를 먼저 기록한다.
2. Windows는 Wine 없이 direct native client를 실행한다. macOS/Linux만 repo 밖 전용 `win32|wow64` prefix를 쓴다.
3. EXE hash, image base, sentinel, approved lineage node가 맞아야 launch/attach/patch한다.
4. server/client/seed/config hash, port, PID, input와 correlation ID를 기록한다.
5. client input/state, wire, authority/event/DB, response/push, pixel/audio, next-input을 같은 monotonic timeline으로 결합한다.
6. normal, reject, failure, reconnect를 각각 fresh run으로 검증한다.
7. PID, port, DB, temp, GUI, install copy, runtime workspace의 cleanup과 residual 0을 기록한다.
8. 작성자와 다른 reviewer가 artifact 존재, hash, 내용과 AC 연결을 재확인한다.

라이브 환경이 없으면 platform, exact command, required input, expected evidence, cleanup을 기록하고 issue를 OPEN blocker로 유지한다.

## 16. 위험과 해제 조건

| 위험 | 현재 상태 | 해제 조건 |
|---|---|---|
| 마스터 승인 전 schema 구현 checkpoint | 정식 선행 계약 아님 | D0 merge 뒤 diff·tests·schema 적합성을 독립 검토해 채택 또는 교체 |
| fleet marker/selection/0x032f/Warp 차단 | gameplay vertical slice OPEN | exact lineage live input, marker, request/response, pixel, next-input chain |
| actual planet render 미확정 | 항성 색만 확인 | planet model writer, predicate, asset, pixel 증거를 항성과 분리 |
| protocol ledger와 dispatcher drift | 일부 문서·코드 불일치 | A04 source-manifest 고정과 code/test 우선 재감사 |
| unbounded server resources | socket pressure, event/player/reconnect/trace gap | A08 registry 전수, numeric cap, overload/OOM fresh evidence |
| clock/RNG/replay 부재 | deterministic recovery 불가 | injected clock/RNG, seed/order ledger, replay oracle |
| historical run evidence 부재 | release gate 재사용 불가 | exact lineage recovery-baseline 뒤 separate regression |
| rights Unknown | package blocked | artifact별 terms/license/holder와 사람 승인, allowlist diff 0 |
| security release gaps | plaintext dev secret, rate/replay/session/admin Unknown | A14 threat tests, secret boundary, independent review |
| packaging skeleton | direct distributable journey 없음 | clean-host install/update/rollback/restore/mismatch evidence |
| tracker state drift | GitHub OPEN/backlog, Jira 진행 중; assignee 없음 | D0 merge 뒤 owner·dependency·status·remote link read-back |
| LOGH7-85 dependency reversed | current Jira link가 본문과 반대 | D0 merge 뒤 downstream 방향으로 수정하고 read-back |
| 접근성 legacy 한계 | 상세 baseline 미완 | 변경 UI audit, 대체 경로, 사람 승인 residual risk |

Unknown은 영향, owner, 다음 실험과 해제 조건이 없으면 유효한 상태가 아니다. 새 증거 없이 같은 조사 2회 또는 같은 증상 3회면 다른 관측층으로 전환한다.

## 17. PR, tracker, 변경 통제

1. 이 설계는 한 PR로 검증·review·commit·push한다. merge는 사용자 승인을 기다린다.
2. D0 merge 뒤 A01부터 자식 이슈별 한 PR을 기본으로 한다.
3. 각 이슈 착수 직전에 current code, docs, tracker, merged dependencies를 다시 조사한다.
4. 한 파일에는 한 writer만 등록하고 stateful live resource는 직렬 소유한다.
5. 구현자와 reviewer를 분리한다. reviewer verdict는 `pass|fix|redo`만 사용한다.
6. 자식 issue는 AC evidence와 관련 PR merge를 read-back한 뒤에만 닫는다.
7. tracker prose dependency는 Jira structured link와 맞추고 GitHub↔Jira remote link를 양쪽 read-back한다.
8. 설계 범위 안의 reversible 구현 선택은 추가 승인 없이 진행한다. §1에서 제외한 결정은 사용자 승인을 받는다.
9. 축 수는 상한이 아니다. 새 영역이 독립 owner, evidence 방식, failure mode, DoD를 가지며 기존 축에 무손실로 들어가지 않을 때만 새 축을 제안한다.
10. 새 축은 A01 schema, DAG, A10 final verification과 parent checklist에 연결한 뒤 착수한다.

## 18. 최종 completion audit

GitHub #216 / Jira LOGH7-213은 다음 전수 대조가 모두 증명될 때만 complete다.

- 15축 AC 각각 verified, open blocker 0, unexplained orphan/dangling edge 0
- required code, tests, docs, machine-readable ledger와 fresh live evidence 존재
- 모든 필수 PR merge와 branch/HEAD read-back 완료
- GitHub/Jira parent-child, owner, dependency, status, comment와 remote link 동기화
- P3/canonical graph violation 0, rights Unknown/prohibited package 0
- security BLOCKER/MAJOR 0, accepted residual risk에 owner·expiry·사람 승인 존재
- representative normal/reject/failure/reconnect slice가 input부터 pixel/next-input까지 같은 correlation chain으로 통과하고, Warp audio가 canonical하게 N/A이면 같은 run의 별도 audio-bearing input→audio→next-input sibling chain까지 통과
- independent clean-room implementation이 restricted evidence 없이 같은 oracle 통과
- package install/update/rollback/restore와 cleanup residual 0
- 관련 current docs, `.ai/current-state.md`, `.ai/handoff.md`, key facts와 configured Obsidian vault 동기화

PR 생성, 테스트 통과, packet 도달, screenshot 하나, 과거 수치 또는 agent 보고만으로 Goal을 끝내지 않는다.

## 19. 설계 승인 뒤에도 남는 사람 결정

설계 승인은 아래 결정을 자동으로 대신하지 않는다.

- 원본 CD/EXE/DLL/DAT/image/audio/manual/official patch의 bootstrap package 포함 가능 범위
- client/server/public/internal package별 allowlist와 restricted evidence 접근 역할
- translation/remaster/AI/community 산출물의 license, derivative, attribution 조건
- 공개 플레이에서 허용할 P3 범위와 승격·제거 책임자
- public internet, admin/web, TLS/session expiry/rate-limit 운영 기준
- log/PII retention, deletion, operator access
- legacy accessibility residual risk와 future-client 최소 기준
- anti-cheat sanction/appeal과 accepted residual risk
- 최종 법률·라이선스 판정 담당자

이 결정이 필요한 축은 해당 결정을 blocker로 유지하면서 독립적으로 진행 가능한 다른 축을 계속 수행한다.
