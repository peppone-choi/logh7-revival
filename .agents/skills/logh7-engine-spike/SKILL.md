---
name: logh7-engine-spike
description: "Design and evaluate engine-neutral future-client spikes for LOGH VII without replacing the legacy client oracle. Use for equivalent Godot and Unity thin slices, an Unreal tactical-only experiment, Stride or Bevy watch reviews, deterministic command/event replay contracts, engine comparison rubrics, or isolated Wine Win64 candidate acceptance."
---

# LOGH VII Engine Spike

미래 클라이언트 후보를 같은 계약과 같은 fixture로 비교한다. 원본 `G7MTClient.exe`는 계속 1차 제품 경로와 호환성 오라클이며, engine PoC는 M4 또는 legacy Wine acceptance를 대신하지 않는다.

## 입력 gate

다음 입력이 없으면 engine implementation을 시작하지 않고 `blocked` 설계 보고서만 만든다.

- 검증된 server command/event schema와 version.
- deterministic replay fixture, seed, initial state hash, expected event/state hashes.
- legacy client의 동일 시나리오 natural-output evidence와 제한 사항.
- `$logh7-asset-provenance`를 통과한 original/remaster asset manifest.
- 후보 engine/version/platform, license, 설치·빌드 전제, 평가 rubric.
- thin-slice player outcome과 non-goals.

research/계획 단계에서는 editor, SDK, engine package, Wine runtime을 설치하지 않는다. 실제 설치와 실행은 별도 승인된 implementation ticket에서만 수행한다.

## 불변 경계

- shared contract에 Unity `MonoBehaviour`, Godot `Node`, Unreal `UObject`, ECS component 같은 engine type을 넣지 않는다.
- legacy binary protocol decoding은 adapter에 격리한다. 미래 client는 versioned command/event contract만 소비한다.
- engine별 mock이나 hardcoded state를 parity 증거로 사용하지 않는다.
- legacy client output과 다른 결과를 "개선"으로 덮지 말고 `difference`로 기록한다.
- 한 후보의 편의에 맞춰 fixture나 acceptance를 바꾸면 모든 후보를 같은 revision으로 다시 평가한다.
- engine winner를 먼저 정하지 않는다. Godot와 Unity equivalent slice가 모두 review되기 전에는 선택 결정을 금지한다.

## Engine-neutral command/event/replay contract

공통 계약은 engine과 무관한 schema package로 관리한다.

### Command envelope

필수 필드:

```text
schemaVersion, replayId, commandId, idempotencyKey, actorId, issuedAtTick,
commandType, payload, expectedAuthorityVersion
```

- `commandType`은 검증된 server command 이름을 사용한다.
- `payload`의 field/units/nullability를 schema로 고정한다.
- client prediction은 별도 hint이며 authoritative outcome을 바꾸지 않는다.

### Event envelope

필수 필드:

```text
schemaVersion, replayId, eventId, causationId, correlationId, aggregateId,
committedAtTick, eventType, payload, authorityVersion
```

- event 순서와 causation chain을 보존한다.
- UI animation event와 domain event를 구분한다.

### Replay package

각 fixture는 다음을 가진다.

```text
fixture.json
commands.jsonl
expected-events.jsonl
expected-state.json
asset-manifest.json
oracle-index.json
```

- canonical JSON key order, UTF-8, fixed numeric units, deterministic seed를 사용한다.
- input files와 각 candidate output의 SHA-256을 기록한다.
- wall-clock, random device, unordered iteration, frame rate에 결과가 의존하지 않게 한다.
- 같은 replay를 최소 두 번 실행해 event sequence와 final state hash가 같은지 확인한다.

## Equivalent thin slice

Godot와 Unity는 동일 fixture로 다음 범위를 각각 구현한다.

1. versioned session fixture 로드.
2. strategic map subset과 original asset fallback 표시.
3. 동일 actor가 `Warp` command 한 건을 제출.
4. authoritative accepted/rejected event와 timer/outcome을 소비.
5. replay를 재생해 같은 event order와 final state hash를 생성.
6. remaster overlay를 `default-off`로 켰다 끄고 원본 fallback/rollback을 증명.

두 구현은 같은 command/event parser conformance suite와 screenshot/state rubric을 사용한다. engine-native UI 차이는 허용하되 정보, command eligibility, authority result는 같아야 한다.

## Candidate portfolio

### Godot

- equivalent thin slice 전체를 구현한다.
- export reproducibility, C#/GDScript boundary, 2D/3D/UI/IME, headless testability, platform packaging을 측정한다.

### Unity

- Godot과 동일한 equivalent thin slice 전체를 구현한다.
- 삭제된 과거 `client-unity/`를 복원해 출발하지 않는다. 검증된 shared contract에서 최소 PoC를 새로 만든다.
- editor/license/build reproducibility, 2D/3D/UI/IME, testability, package size를 측정한다.

### Unreal

- **tactical-only spike**로 제한한다. login/lobby/strategic client 전체를 만들지 않는다.
- 같은 replay contract에서 unit selection, move, fire, hit/damage, destruction/effect를 한 tactical scenario로 평가한다.
- 렌더 품질 이점과 build size, iteration cost, server-contract integration cost를 함께 기록한다.
- tactical spike 성공을 full-client 채택 근거로 단독 사용하지 않는다.

### Stride와 Bevy

- 기본 상태는 `watch`다. runnable PoC를 요구하지 않는다.
- 정기 watch record에 release cadence, platform/export, 2D/3D/UI/IME, networking/serialization, tooling/debugging, license, community/bus factor, maintenance risk를 기록한다.
- material change가 있고 Godot/Unity 대비 명시적 이점이 있을 때만 동일 thin-slice 후보로 승격한다.

## Wine Win64 candidate acceptance

미래 client의 Windows x64 build는 legacy Wine QA와 완전히 분리한다.

- `RUN_KIND=engine-candidate-win64`, 전용 run ID, 별도 evidence namespace를 사용한다.
- repo 밖의 candidate 전용 absolute `WINEPREFIX`와 `WINEARCH=win64`를 사용한다.
- legacy 32-bit prefix, install copy, registry, ports, process ledger를 공유하지 않는다.
- 모든 Wine tool은 absolute path로 호출하고 candidate binary/build manifest hash를 기록한다.
- `$logh7-wine-live-qa` verdict를 재사용하거나 candidate 결과를 legacy regression `pass`로 합치지 않는다.
- native candidate run과 Wine Win64 run의 replay/state/render/input/audio/network 결과를 별도 비교한다.
- candidate acceptance는 그 build의 compatibility만 증명한다. 원본 client protocol/FSM parity는 frozen oracle evidence와 별도 review한다.

## 비교 rubric

모든 후보에 같은 weight와 측정법을 사용한다.

- command/event/replay parity와 determinism.
- legacy adapter 격리와 server contract 변경량.
- 2D/3D, strategic UI, tactical rendering, 한글 font/IME/input/audio 적합성.
- clean build 재현성, test/headless automation, startup/frame/memory.
- artifact size, target platform, Wine Win64 compatibility.
- tooling/iteration/debugging, dependency churn, license, maintenance/bus factor.
- asset provenance, original fallback, default-off overlay, rollback.

점수를 만들기 전에 blocking mismatch를 별도 열거한다. 평균 점수로 protocol parity 실패나 rights blocker를 숨기지 않는다.

## 산출물과 판정

raw output은 gitignored `_workspace/logh7-revival/engine-spikes/<SPIKE_ID>/`에 둔다.

```text
request.json
contract-version.json
fixture-hashes.json
candidates/<candidate>/result.json
candidates/<candidate>/replay-output/
reviews/<candidate>.json
comparison.json
decision.md
```

승인된 redacted comparison, frozen fixture index, decision만 `docs/verification/logh7/engine-spikes/<SPIKE_ID>/`로 승격하고 raw manifest SHA-256으로 연결한다. proprietary asset, engine cache/build, secret, raw binary를 commit하지 않는다.

- `pass`: 후보 하나의 spike acceptance가 닫힘. 전체 engine 선택을 뜻하지 않는다.
- `blocked`: shared contract, fixture, oracle, provenance, tool/license gate가 없음.
- `no-go`: parity 또는 rights/maintenance blocker가 있음.
- `watch`: 실행하지 않고 versioned research record만 유지.

최종 engine 결정은 Godot+Unity equivalent results, Unreal tactical result 또는 명시적 omission, Stride/Bevy watch record, independent review가 모두 있을 때 별도 decision record로 내린다.
