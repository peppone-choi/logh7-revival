---
name: logh7-orchestrator
description: "Orchestrate the evidence-first revival of LOGH VII with the original legacy client and an authoritative replacement server. Use for CD/data extraction, static or dynamic client reverse engineering, packet capture/proxy intervention, server gameplay restoration, platform-aware live QA, localization, reversible remastering, or engine-neutral future-client portfolio work."
---

# LOGH VII Revival Orchestrator

원본 `G7MTClient.exe`를 1차 제품·호환성 오라클로 유지하고 자체 서버를 권위 backend로 복원한다. 정적 RE, client runtime, wire, server persistence를 한 evidence chain으로 묶고 리마스터·장기 재이식은 별도 병렬 track으로 관리한다.

## 시작 계약

1. 루트 `AGENTS.md`, `docs/logh7-document-index-current.md`, `docs/logh7-requirements-current.md`, `docs/logh7-architecture-operations-current.md`, `.omo/plans/logh7-execution-plan-current.md`를 읽는다.
2. 해당 track을 시작하기 전에 `docs/logh7-reference-haul.md`를 읽되 외부 방법론을 canonical 근거로 쓰지 않는다.
3. `.codegraph/`가 있고 코드 위치·호출경로·영향범위를 묻는 작업이면 CodeGraph를 먼저 쓰고 `rg`로 확인한다.
4. `docs/harness/logh7-revival/team-spec.md`에서 phase, 역할, handoff, partial-failure 계약을 선택한다.
5. current checkout의 실제 파일/hash/evidence를 다시 확인한다. 역사 문서의 경로·성공 수치만으로 fresh gate를 만들지 않는다.

## Runtime routing

- 구체 model 이름이나 context-window 값을 skill에 고정하지 않는다. 현재 runtime 기본값을 상속한다.
- **low reasoning tier:** 파일·symbol lookup, hash/manifest inventory, 명령 실행, 로그 요약.
- **standard reasoning tier:** 일반 구현, refactor, codec/test, 문서 동기화.
- **deep reasoning tier:** RE 가설, architecture/root cause, 상충 증거 판정, phase 합성·최종 승인.
- worker는 구현 노동과 bounded evidence 수집을 맡고 orchestrator는 요구 분해, write scope, synthesis, review, acceptance를 맡는다.
- delegation은 한 계층만 사용한다. 독립 read-heavy branch만 병렬화하고 client runtime 자원(native session 또는 Wine prefix), GUI, ports, DB 같은 stateful 자원은 직렬화한다.

## 역할과 4-layer RE

세부 역할·산출물은 team spec을 따른다.

| 층/역할 | 질문 | 완료 증거 |
| --- | --- | --- |
| `static` | EXE가 무엇을 parse/call/write하는가 | hash/profile, Ghidra xref/CFG, layout, sentinel |
| `client` | 선택한 runtime에서 실제 인자·memory/FSM/UI가 어떻게 변하는가 | hook/breakpoint trace, natural client output |
| `wire` | client↔proxy↔server bytes/frame이 어떻게 이동하는가 | PCAP/proxy/decoder hash와 sequence |
| `server` | validation·domain·DB·response/broadcast가 무엇을 확정하는가 | command/event/transaction trace |

`live`는 네 층을 같은 run에서 검증하고, `remaster-engine-portfolio`는 원본 fallback과 engine-neutral PoC를 관리한다. 한 층의 성공으로 다른 층을 추론하지 않는다.

## Phase pipeline

### P0 — lineage와 실행 환경별 runtime

- canonical/patch EXE lineage, PE metadata, sentinel, backup/rollback을 확정한다.
- `$logh7-wine-live-qa`로 `sys.platform`을 먼저 기록한다. `win32`는 `native-windows`, `darwin`·`linux`는 `wine`, 그 밖은 `blocked`다.
- `native-windows`는 Wine 입력·명령 없이 검증된 EXE를 direct native harness로 실행한다.
- `wine`의 모든 command와 진단은 absolute binary와 repo 밖 전용 absolute `WINEPREFIX`를 사용한다. 기본 `~/.wine`과 repo 내부 prefix는 거부한다.
- run9 evidence가 없으면 normal regression은 fail-closed한다. exact lineage가 확정된 경우에만 team spec의 `recovery-baseline` mode로 새 receipt를 만들 수 있으며 그 run을 regression `pass`로 부르지 않는다.

### P1 — client/proxy/server correlation

- observe-only pass-through를 먼저 실행하고 양방향 byte count와 payload SHA-256 equality를 확인한다.
- client plaintext/runtime, host PCAP/proxy, server frame/DB/event를 team spec의 JSONL schema로 join한다.
- host network 판정과 선택한 client runtime의 game/Win32/D3D8 판정을 분리한다.

### P2 — `0x030b` root/FSM

- `0x030b → parser/registry allocator → model/cache join → DAT_009d2fa8 → FSM state 2`를 static/client/wire/server 네 층으로 추적한다.
- 18/19/20행과 one-field A/B로 admission, cache join, marker root, FSM 전이를 분리한다.
- root producer 확정 전 payload 확대, 순차 ID/model-zero, FSM 직접 변조를 canonical로 승격하지 않는다.

### M4 — Warp vertical slice

실제 UI 입력에서 시작해 wire factory, permission/precondition, resource reservation, command ledger/idempotency, timer/job, domain event, SQLite transaction, A response/B broadcast, 두 client output, restart persistence까지 한 correlation chain으로 닫는다. 실패 case는 무변경을 증명한다.

이 패턴이 닫힌 뒤 확인된 command부터 확장한다. 미확정 command는 fail-closed한다.

## 관측·개입 routing

- **Client-side:** static PE/Ghidra, Frida, debugger, memory trace/dump, GDI/D3D8/input/audio 관측, hash-guarded patch.
- **Wire:** PCAP/dissector/decoder, observe proxy, replay/drop/delay/one-field mutation. baseline 전 mutation과 unknown auto-response를 금지한다.
- **Server-side:** session/application/domain/persistence instrumentation, fixture A/B, event/DB inspection.
- **Cross-layer:** deterministic correlation IDs와 monotonic timeline으로 합성한다.

각 개입은 hypothesis, 원본/변형 hash, 예상 결과, rollback을 먼저 기록한다. 원본 EXE와 canonical asset을 in-place 수정하지 않는다.

## Platform-aware live QA

- `.agents/skills/logh7-wine-live-qa/SKILL.md`를 canonical skill로 사용한다. `.codex/skills/`와 `.claude/skills/`의 live-QA 사본은 byte-identical mirror다.
- live owner 한 명만 runtime 자원, install copy, DB, ports, GUI를 소유한다.
- 공통 D3D8, locale/codepage/font, audio, input/IME, registry pre/post hash와 mode별 native session 또는 Wine toolchain/prefix/drive mapping을 environment receipt에 포함한다.
- 기록된 PID만 종료하고 port listener, registry, EXE, runtime 자원 rollback을 증명한다. Wine server 정리는 Wine mode에만 적용한다.
- PCAP/proxy 성공은 gameplay 성공이 아니며 client screenshot은 server authority/DB 성공이 아니다.

## Remaster와 future-client portfolio

- asset 추출·변환·리마스터·generated/community import에는 `$logh7-asset-provenance`를 사용한다. R0-R3, source/hash/license, generated non-canonical, original fallback, default-off, rollback, proprietary binary commit 금지를 강제한다.
- future-client 비교에는 `$logh7-engine-spike`를 사용하고 engine-neutral command/event/replay contract를 먼저 고정한다.
- original asset은 canonical fallback이다. remaster output은 provenance, source hash, reviewer, `enabled: false` 기본, rollback을 가진 reversible overlay로만 실험한다.
- 로그인 원본 영역 `644×484`와 로그인 뒤 게임 영역 `1920×1080` 경계를 보존한다.
- 장기 재이식을 Unity에 고정하지 않는다. Godot+Unity equivalent thin slice, Unreal tactical-only spike, Stride/Bevy watch를 같은 portfolio decision에서 비교한다.
- future client는 legacy protocol adapter와 shared gameplay contract를 분리하고 M4 gate를 대신하지 않는다.
- future Windows x64 candidate acceptance는 별도 runtime 자원/ports/evidence를 사용하며 legacy `$logh7-wine-live-qa` verdict와 합치지 않는다. Wine host에서만 별도 Win64 prefix를 쓴다.
- 현재 삭제된 `client-unity/`를 engine 결정 전에 active 제품 계약으로 복원하지 않는다.

## Producer-Reviewer와 실패 정책

- producer와 reviewer를 분리하고 review status는 `pass|fix|redo`로 제한한다.
- revision은 artifact당 최대 2회다.
- 같은 증상 3회 또는 새 증거 없는 조사 2회면 static/client/wire/server 중 다른 관측층으로 전환하고 blocker를 남긴다.
- partial branch를 숨기지 않는다. 필수 branch가 없으면 phase 전체를 `pass`로 합성하지 않는다.
- 완료 전 diff, tests, live evidence, cleanup/rollback, docs/AGENTS/Obsidian sync가 실제 상태와 맞는지 orchestrator가 직접 확인한다.

## 출력

- `_workspace/logh7-revival/runs/<RUN_ID>/` 아래 역할별 branch, review, correlation, evidence manifest, synthesis.
- 바뀐 code/docs와 exact verification output.
- confirmed/contradicted/unobserved를 분리한 현재 판정.
- 남은 blocker, untested surface, 다음 phase의 가장 작은 ticket.

구현, 자동 test, host trace, client runtime 화면 중 하나만으로 완료를 주장하지 않는다.
