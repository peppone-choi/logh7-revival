# Current Task

## Completed Contract: A01 인과 원장 스키마·분류·누락 검출기

- Tracker: GitHub #217 / Jira LOGH7-214, parent GitHub #216 / Jira LOGH7-213.
- Status: **DONE — PR #233가 CI `test` pass와 독립 리뷰 BLOCKER 0 / MAJOR 0 후 `origin/main@43ee007a474f94b93fc3a9232add9f6813794ba3`로 merge됐다. GitHub #217과 Jira LOGH7-214는 증거 보존을 위해 open/진행 중으로 유지한다.**
- Problem: opcode·EXE RE·render/UI·data audit가 서로 다른 형식과 등급을 사용해 node/edge/evidence를 합성할 통합 계약이 없고, orphan·dangling·근거 없는 canonical 승격·누락 import를 자동 검출하지 못한다.
- Goal: 모든 후속 축이 소비할 versioned machine-readable 계약, fail-closed validator, 4종 lossless import adapter와 deterministic report를 표준 라이브러리만으로 구현한다.
- User value: A02~A15가 같은 ID·분류·증거·누락 규칙을 사용하고, clean-room 구현자가 근거와 Unknown/P3를 혼동하지 않은 채 인과 사슬을 재구성할 수 있다.

### 범위 / 비범위

- In scope: Node/Edge/Evidence/coverage/transition/migration/DAG 계약, stable ID와 enum, JSON-safe validator, positive/negative fixtures, opcode·EXE RE·UI/render·data audit adapter, deterministic ledger/import report, current docs/state와 GitHub/Jira 진행 증거 동기화.
- Out of scope: 제품 server runtime, client/EXE, DB·port 47900·GUI·라이브 QA, 개별 gameplay 의미 확정, canonical/P3 승격, 다른 축 구현, dependency 추가, issue close와 merge.
- Must not have: 외부 schema dependency, raw proprietary bytes, 원본 audit 수정, legacy P0/P1/P2/P3의 O0/R1/I2/P3 자동 변환, import 누락 은폐, 입력값을 노출하는 오류, 재귀 graph walk, 생성물이 source audit에 자기 포함되는 경로.

### Allowed files

- `.ai/{task.md,current-state.md,handoff.md,key-facts.md,ownership.md}`
- `tools/causal-ledger/**`
- `server/tests/logh7-causal-ledger.test.mjs`
- `docs/{logh7-causal-ledger-master-design.md,logh7-document-index-current.md,logh7-roadmap-current.md}`
- `.omo/plans/logh7-execution-plan-current.md`
- Protected: 사용자 소유 `.codex/config.toml`, 비밀 파일, `server/data/**`, `reference/**`, 기존 audit producer와 source artifact, 위 목록 밖의 사용자·다른 에이전트 변경.

### 수용 기준

- AC-1: `1.0.0` 계약이 필수 필드·고정 key·type·enum·stable ID·semantic version·migration receipt와 D0/A01~A15 DAG를 기계 판독 형식으로 정의한다.
- AC-2: validator가 JSON 비호환 값, 전역 duplicate ID, orphan coverage/node, dangling endpoint/evidence, dependency cycle/self/unknown, 누락 owner/provenance/AC/evidence, invalid direction을 구조화 오류로 거부한다.
- AC-3: P3 canonical, P3→canonical dependency, I2/P3/Unknown/contradicted의 canonical 전이, reviewer·`approvalRef`·source hash 없는 승격을 거부한다.
- AC-4: opcode Markdown, EXE RE, UI/render, data audit의 고정 분모를 전부 stable source pointer/line과 raw-record SHA-256으로 import하고 `source = imported + excluded + rejected`, rejected 0, loss 0을 증명한다.
- AC-5: 같은 입력은 byte-identical ledger/report를 만들며 source hash mismatch, record drift, artifact 부재를 실패시킨다. generated output은 `server/content/generated` 밖에 둔다.
- AC-6: positive fixture와 필수 negative fixture, 12,000-node 비재귀 graph 검증, bounded input cap을 focused `node:test`가 fresh 통과한다.
- AC-7: 오류는 `ERR_CAUSAL_LEDGER_SCHEMA`와 `{path, reason, id?}`만 노출하고 raw 입력값·비밀을 포함하지 않는다.
- AC-8: targeted test, 변경 파일 verification, 전체 `npm test`, deterministic regeneration/diff, placeholder·skip/only·scoped diff 검사가 통과하고 독립 reviewer BLOCKER/MAJOR가 0이다.
- AC-9: PR이 GitHub #217/Jira LOGH7-214를 연결하고 tracker/doc/state/handoff가 실제 branch·HEAD·검증 상태와 일치한다. issue close와 merge는 수행하지 않는다.

### 검증 명령·증거

- RED/GREEN: `cd server && node --test tests/logh7-causal-ledger.test.mjs`
- changed file: `bash scripts/agent/verify-changes.sh --file <path>`
- full regression: `cd server && npm test`
- deterministic CLI를 두 번 실행해 ledger/report hash와 working-tree diff를 비교
- `git diff --check`, allowlist 대조, `rg` placeholder·stub·skip/only 검사, staged diff review
- GitHub #217·PR과 Jira LOGH7-214 current read-back; 제품·client 가시 변경이 없어 live QA는 미실행(비적용)

### 사람 승인 필요 지점

- A01 PR merge는 2026-07-20 사용자 사전 승인됨. 검증·리뷰·CI 실패 시에는 병합하지 않는다.
- breaking schema/migration, 새 dependency, canonical/P3 승격, 승인 DAG 변경, 제품 runtime 소비, EXE patch/rebaseline, 권리·보안 결정, main 직접 commit, force push, 히스토리 재작성, 비밀 접근, 데이터 삭제.

---

## 다음 세션 계약 (2026-07-18 사용자 확정) — 라이브 검증 우선 + 2개 병행

main `70b16ca2`. 이번 세션 코드 전량 병합됐으나 **라이브 미검증**이 최대 리스크. 상세·근거·하네스는 `.ai/handoff.md`의 "다음 세션 계획" 섹션이 정본. 요지:
1. **[최우선] 라이브 검증 3종**(포트 47900 직렬): 유닛 스테이징(함대 아이콘, PR #197) → 0x032f 멤버리스트(+endian, PR #181) → 0x031d 검은 행성(PR #193). 성공 시 이동(0x0b01)→**Warp(0x2b, LOGH7-58)**까지 = standing directive 기본 게임플레이 라이브 검증 목표.
2. **[병행] 로그인 첫 키 패치(LOGH7-212)** — 클라 패치 프로그램 첫 MVP. 인프라(LOGH7-201) 병합됨. exact RE 바이트 → patch manifest → **사용자 승인**(비가역) → 재베이스라인 → 라이브.
3. **[병행] 추출 백로그 opcode**(LOGH7-205~211: 0x032d·0x0329·0x0331·정적 5종) — CD 추출 캐논, 테스트만, 무날조.

승인: push·PR·merge·외부 쓰기·라이브 실기는 2026-07-17 상시 사전승인. 클라 바이너리 패치·새 계보 승격은 2026-07-17 사용자 승인(단 각 패치별 재베이스라인은 인간 승인 게이트). force push·main 직접 commit·secret·server/data 삭제는 그대로 금지.

---

## Active Contract: P0 게이트 완주 (LOGH7-43~47, 스토리 LOGH7-18)

- Status: **ACTIVE — 2026-07-17 사용자 "정정 후 구현 승인".** 5건 P0 작업 구현이 승인됐다. 구현 순서는 저위험 기반부터 LOGH7-47 → LOGH7-43 → LOGH7-45 → LOGH7-44 → LOGH7-46. push·PR·merge, Jira 상태 전환·GitHub 코멘트 쓰기, 라이브 실기 실행은 2026-07-17 사용자 상시 사전승인에 따라 매 단계 확인 없이 진행하되 결과를 보고한다. force push·main 직접 commit·히스토리 재작성·linked worktree 정리·server/data 삭제·비밀 접근은 이 사전승인에서 제외되어 그대로 금지한다. 검증 통과 후 work-branch commit은 허용(ADR-LITE-005). fail-closed 차단은 버그가 아니다.
- 우선순위 근거: Jira priority는 5건 모두 Medium이라 변별력이 없어 로드맵 게이트 순서(P0 → P1 → P2)로 판정한다. 5건 전부 에픽 **LOGH7-9(M4 선행 게이트)** · 스토리 **LOGH7-18(P0 — 격리 Wine·정본 EXE 계보·evidence 복구)** 산하 P0 작업이다. P1(LOGH7-48/49, 스토리 LOGH7-19)은 이 P0가 닫힌 뒤 착수한다.
- Problem: P0 스토리 LOGH7-18의 완료 증거가 없다. PR #171/#172는 하네스 기반과 상태 정합성만 반영했고, 실행 격리·계보 무결·fail-closed 가드·run 증거가 fresh evidence로 닫히지 않았다.
- Goal: 아래 5개 P0 작업을 각 Jira 완료기준대로 닫아 스토리 LOGH7-18(P0 게이트)을 통과 가능 상태로 만든다.
- User value: P0가 닫히면 P1(3면 correlation)·P2로 진행할 수 있고, "죽은 게임 복원·자체 서버 호환성" 검증의 실행 축이 증거로 확정된다.

### 대상 5건 (P0, 로드맵 게이트 순 → 저위험 기반부터)

| 순 | Jira | 크기 | GitHub | 요약 | Jira 완료기준(정본) |
|---|---|---|---|---|---|
| 1 | LOGH7-47 | S | #14 | launcher/Frida/patch fail-closed guard | hash·image base·sentinel 불일치 시 실행 전 종료·exit code 기록 |
| 2 | LOGH7-43 | S | #10 | 실행 환경별 client runtime 격리(native Windows·Wine win32\|wow64)+기본 ~/.wine fail-closed | prefix 밖 변경 0, 기본 prefix에서 preflight fail-closed |
| 3 | LOGH7-45 | M | #12 | V1 runtime-support manifest+sentinel 복구 | fresh `--execute --initialize-prefix`가 `runtime_support_manifest_missing`(exit 2) 없이 launch, `fullPassEligible=true` (하위 LOGH7-95/96/97, GH #67/66/65) |
| 4 | LOGH7-44 | M | #11 | client-lineage 5단계 계보 재구성 integration | `LOGH7_LINEAGE_INTEGRATION=1`로 1+6+136+10+59 패치·sentinel/hash 영수증 통과, manifest/working path 산출 (하위 LOGH7-93/94/99, GH #62/63/64) |
| 5 | LOGH7-46 | L | #13 | run9/run3/run5 evidence 복구 또는 동일 exact hash 재실행 | client/server/seed hash·packet/log·DB·screenshot·cleanup을 tracked redacted receipt로 기록 (하위 LOGH7-142/143/147/149, GH #116/113/114/115) |

### 수용 기준 (측정 가능)

- (AC-1 · LOGH7-47) EXE hash·image base·sentinel 중 하나라도 불일치하면 launch/attach/patch가 실행 전에 종료하고 exit code를 receipt에 기록한다. 일치 케이스는 정상 진행한다.
- (AC-2 · LOGH7-43) native Windows는 Wine 없이, macOS/Linux는 명시적 `win32|wow64` prefix로만 실행하며, 기본 `~/.wine` 접근은 preflight fail-closed. run 전용 prefix 밖 변경 0을 fresh cleanup receipt로 입증한다.
- (AC-3 · LOGH7-45) fresh `--execute --initialize-prefix` 실행이 `runtime_support_manifest_missing`(exit 2) 없이 launch되고 `fullPassEligible=true`를 관측한다. manifest 스키마·sentinel 복구 절차가 존재한다.
- (AC-4 · LOGH7-44) `LOGH7_LINEAGE_INTEGRATION=1`에서 1+6+136+10+59 패치와 sentinel/hash 영수증이 통과하고 manifest·working path가 산출된다.
- (AC-5 · LOGH7-46) run9/run3/run5의 client·server·seed hash, packet/log, DB, screenshot, cleanup이 tracked redacted receipt로 기록되거나 동일 exact hash 재실행으로 대체된다.
- (AC-6) 각 항목 완료 시 Jira 상태 전환과 GitHub Issue 코멘트는 별도 승인 후 exact manifest로만 수행한다. 미검증 항목은 `해야 할 일` 유지.

### 범위 / 비범위

- In scope: 위 5개 P0 작업의 구현·검증, lineage/runtime/guard receipt 산출, native Windows 실기 라이브 evidence, 결과의 `.ai` 상태·현행 문서 반영.
- Out of scope: P1(LOGH7-48/49)·P2 구현, 서버·프로토콜 게임 기능 확장, 원본 EXE 패치, Linux 실기·전체 Wine suite(다른 호스트 필요), push·PR·merge, Jira/GitHub 쓰기(별도 manifest 승인 필요), linked worktree 접근, `server/data/**` 삭제, 비밀 파일 접근.

### Allowed files (승인 후, 항목 착수 시 구체화)

- 상태·계약: `.ai/{task.md,current-state.md,handoff.md,ownership.md,key-facts.md,known-issues.md}`.
- 실행·계보·가드(항목별로 소유 파일을 착수 시 확정): `tools/live/**`, `tools/tests/**`, `.agents/skills/logh7-wine-live-qa/**` 및 계보/런타임 매니페스트 관련 스크립트. 저장소 비추적 `_workspace/**` evidence.
- 라이브 결과 반영 문서: `docs/logh7-wine-live-qa.md`, `docs/logh7-client-lineage-current.md`, `docs/logh7-roadmap-current.md`, `docs/agent/tool-capabilities.md`.
- Protected: 사용자 소유 `.codex/config.toml`, 비밀 파일, `server/data/**`, `reference/**`, linked worktree 전체, 위 밖의 사용자/다른 에이전트 변경.

### 검증 명령

- 라이브 evidence: lineage/guard/cleanup receipt(스크린샷·로그·exit code), 서버 포트 47900 관측.
- 코드 변경 시: `cd server && npm test`(서버 변경 시), `tools/tests` Python unittest(도구 변경 시), 변경 Markdown별 `bash scripts/agent/verify-changes.sh --file <경로>`, `git diff --check`.
- 무결 게이트: `LOGH7_LINEAGE_INTEGRATION=1` 실행(LOGH7-44), `--execute --initialize-prefix` fresh 실행(LOGH7-45). 제품 코드 미변경 항목은 제품 테스트 미실행으로 명시.

### 사람 승인 필요 지점

- 이 계약의 ACTIVE 전환(현재 PROPOSED). 5건을 한 계약으로 진행할지, 항목별 개별 계약으로 쪼갤지 결정.
- (상시 사전승인됨, 결과 보고로 갈음) 각 항목의 구현 착수, 라이브 실기 실행, Jira 상태 전환·GitHub 코멘트 쓰기, push·PR·merge. 제외·금지: force push·main 직접 commit·히스토리 재작성·linked worktree 정리·server/data 삭제·비밀 접근.
- fail-closed 차단은 버그가 아니므로 mismatch 시 차단 receipt 후 보고한다.

### 관계 노트

- 현재 ACTIVE인 "LOGH7-43 P0 fresh evidence — native Windows 실기 라이브 런"은 이 P0 게이트의 2번 항목(LOGH7-43) 단건 계약이다. 승인 시 이 5건 계약이 그 단건 계약을 포함·대체하며, 진행 중인 native Windows 라이브 런 증거는 AC-2에 그대로 귀속된다.

## Standing Directive (2026-07-17 /ultragoal): 게임 플레이 가능까지 5개씩 무조건 계속

- 사용자 지시: 게임을 실제로 할 수 있을 때(in-game 월드진입·기본 플레이가 라이브 증거로 확인될 때)까지, 로드맵 게이트/우선순위 순으로 Jira 이슈를 **5개씩 배치**로 **무조건 계속** 처리한다.
- 현재 배치 = **P0 LOGH7-43~47**(진행 중; login-success·harness fix까지 확보, LOGH7-47 음성 경로·45/44/46 잔여). 배치 완료 시 checkpoint → 다음 5개를 게이트 순(P0 잔여 → P1 LOGH7-48/49 등 → P2 → M4 gameplay 슬라이스)으로 선택해 반복.
- "무조건 계속"의 경계: fail-closed 게이트·증거 기반 완료·비파괴 불변식을 무효화하지 않는다. 항목이 하드웨어/사용자 의존(예: `workflow` 스코프, 실기 조작)으로 막히면 블로커를 기록하고 **처리 가능한 것부터 계속**하며 블로커를 표면화한다. 가짜 완료·과장 금지.
- 전달(push/PR/merge)·외부 쓰기(Jira/GitHub)·라이브 실기는 2026-07-17 상시 사전승인. force push·main 직접 commit·히스토리 재작성·linked worktree 정리·server/data 삭제·비밀 접근은 제외·금지.
- 최종 배치·완료 게이트: ai-slop-cleaner + verification + code-review 통과(ultragoal 계약).
- durable 추적: `.omc/ultragoal/` 원장(마일스톤 arc G001-G006)은 coarse 진행 추적으로 유지. G001 "M3 월드 진입"은 현재 로드맵상 historical 완료로 보여 재조정 대상(비차단). 배치 체크포인트마다 원장·`.ai` 상태 갱신.
- Batch #1 매듭(2026-07-17 사용자 결정): Windows 라이브 검증 가능분 LOGH7-47(fail-closed 게이트)·LOGH7-43(native login·입력 신뢰성) 완료. LOGH7-45/44/46은 Wine 호스트(macOS/Linux)·설치 데이터·frozen run9 baseline 필요로 이 호스트 라이브 완료 불가 → Wine-호스트 후속 배치로 이관(가짜 완료 없이 blocker 기록). 다음 live 작업(P1 3면·P2)도 대부분 Wine/게임데이터 의존 — 이 Windows 호스트 live 축은 login+gate로 소진. 후속은 Wine 호스트 세션에서 45/44/46/P1 진행.

## Subsumed Contract: LOGH7-43 P0 fresh evidence — native Windows 실기 라이브 런

- 2026-07-17 P0 게이트 완주 계약(LOGH7-43~47)에 AC-2로 포함됨. 이 단건 계약의 라이브 런 증거는 상위 계약 AC-2에 귀속된다.
- Status: **ACTIVE — 2026-07-17 사용자 승인.** 사용자가 `/start-task` 지시로 "복구 종결 후 첫 후속 계약으로 LOGH7-43의 남은 P0 fresh evidence 확보(native Windows 실기 라이브 런 등)를 선택해 P0 게이트를 닫아"를 명시해 계약 선택과 실행이 승인됐다. push·PR 생성·merge는 이 승인에 포함되지 않으며 별도 승인이 필요하다. 작업 브랜치 local commit은 검증 후 허용(ADR-LITE-005).
- Problem: P0 잔여 증거가 없다 — native Windows 실기 라이브 런(현재 platform simulation만 검증), successful login/gameplay(macOS Wine run은 `invalid-credentials`/login-ng·client exit 3으로 종료), post-fix live drive-cleanup receipt, run9 exact-hash tracked evidence. Linux 실기와 최신 전체 Wine suite는 다른 호스트가 필요해 이 머신에서 닫을 수 없다.
- Goal: 이 native Windows 머신에서 lineage gate를 통과한 원본 클라이언트를 Wine 없이 직접 실행해 서버 `127.0.0.1:47900` 대상 fresh 라이브 증거를 확보하고, `invalid-credentials`의 원인을 판정해 가능하면 successful login까지 도달한다.
- User value: P0 게이트의 native Windows 축을 실제 실행 증거로 닫고, 로그인 실패의 원인(계정 부재 vs 서버 결함)을 확정해 다음 게이트 진입 조건을 만든다.
- In scope: EXE hash·image base·sentinel fresh 검증(lineage receipt), 서버 기동·port 관측, native Windows 직접 실행, 클라이언트 프로세스·스크린샷·로그·exit code 증거, 로그인 시도와 서버 trace 대조, 서버 정규 경로의 테스트 계정 준비, 기록된 PID·전용 자원만의 cleanup receipt, 라이브 결과의 상태·현행 문서 반영.
- Out of scope: Linux 실기·최신 전체 Wine suite, 원본 EXE 패치, 서버·프로토콜 제품 기능 변경(로그인 실패가 서버 결함으로 판정되면 보고 후 별도 범위 확인), push·PR·merge, linked worktree 접근, Jira/GitHub 쓰기(별도 manifest 승인 필요), `server/data/**` 삭제, 비밀 파일 접근.
- Allowed files: `.ai/{task.md,current-state.md,handoff.md,ownership.md,key-facts.md,known-issues.md}`, 저장소 비추적 `_workspace/**` evidence, 라이브 결과에 직접 영향받는 `docs/logh7-wine-live-qa.md`·`docs/logh7-roadmap-current.md`·`docs/agent/tool-capabilities.md`.
- Protected concurrent files: 사용자 소유 `.codex/config.toml`, 비밀 파일, `server/data/**`(삭제 금지), `reference/**`, linked worktree 전체, 위 Allowed files 밖 전부.
- Acceptance criteria: (1) lineage receipt — hash·base·sentinel 일치 관측 또는 fail-closed 차단 사유 기록, (2) 서버 fresh 기동과 `127.0.0.1:47900` 응답 관측, (3) 실제 클라이언트 프로세스 실행 관측(PID·스크린샷), (4) 로그인 시도 결과와 서버 trace의 대조 기록(성공 또는 원인 판정), (5) cleanup receipt — 기록된 PID·전용 자원만 정리, listener 잔존 확인, (6) 결과가 `.ai` 상태와 관련 현행 문서에 반영.
- Required verification: 라이브 증거(스크린샷·로그·exit code·receipt), 변경 Markdown별 `verify-changes.sh --file`, `git diff --check`. 서버 코드 미변경 시 제품 테스트는 미실행으로 명시.
- Stop conditions: lineage mismatch(fail-closed는 버그 아님 — 차단 receipt 후 보고), 같은 증상 3회 실패 또는 새 증거 없는 조사 2회, Allowed files 밖 수정 필요, ownership 충돌.

## Completed Contract: 상태 정합성 복구

- Status: **DONE — 2026-07-17 완료.** 2026-07-17 사용자 승인(계획·근거 기반 외부 쓰기·merge, push·PR은 전달 사슬로 해석) 하에 실행됐고, 같은 날 사용자 승인으로 소유권이 Codex에서 Claude Code로 인수되어 잔여 단계가 종결됐다. 외부 manifest는 Jira LOGH7-43 제목·코멘트(10:53:17 KST)·LOGH7-18 코멘트(10:53:19 KST)·GitHub #10 제목·코멘트(10:53:58 KST)로 적용됐고 2026-07-17 read-back으로 일치를 확인했다. Jira 상태 전환 0건, Obsidian은 LOGH7_VAULT_DIR unset으로 미실행. 전달(local commit·push·PR·merge)은 이 승인 사슬 안에서 실행하며 force push·main 직접 commit은 금지 유지. 이 계약의 승인 권한은 전달 완료로 소비되며 후속 작업에 재사용하지 않는다.
- Problem: 실제 Git은 `main`의 `a8420b8b`(PR #171 플랫폼 분기 하네스 merge)이고 `origin/main`과 일치하지만, `.ai/task.md`·`.ai/current-state.md`·`.ai/handoff.md`·`.ai/ownership.md`는 아직 `codex/platform-aware-live-qa`의 commit·push 대기 상태를 가리킨다. Jira LOGH7 미완료 188건은 모두 `해야 할 일`·Medium·미배정이고, 로컬 활성 작업은 Jira 진행 상태와 연결되지 않았다. 별도 연결 worktree `agents/commit-push-and-verify-next-steps`도 ownership 없이 main보다 226개 뒤·1개 앞이며 dirty 상태다.
- Goal: Git·로컬 상태 정본·현행 문서·승인된 외부 업무 뷰가 같은 사실과 남은 작업을 가리키도록 복구하고, 이후 P0 작업을 안전하게 시작할 수 있는 단일 진입점을 만든다.
- User value: 다음 에이전트가 오래된 브랜치·승인·Jira 상태를 실행 지시로 오해하지 않고, 현재 완료 범위와 실제 다음 게이트를 한 번에 판정할 수 있다.
- Plan: `.omo/plans/logh7-state-consistency-recovery-plan.md`.
- In scope after approval: (1) fresh Git/worktree/Jira read-only 기준선 재확인, (2) `codex/state-consistency-recovery` 로컬 작업 브랜치와 ownership 설정, (3) 오래된 플랫폼 하네스 계약의 실제 merge 결과 반영, (4) `.ai` 상태·인수인계·소유·키팩트 정합화, (5) 관련 현행 문서의 사실 불일치만 최소 수정, (6) exact external-change manifest 작성, (7) 별도 승인된 Jira·GitHub·Obsidian 쓰기만 실행하고 read-back 검증, (8) 검증·독립 리뷰·문서/상태 종결.
- Out of scope: 제품 코드·테스트·프로토콜·클라이언트 자산 변경, P0/P1/P2 구현, login-ng/runtime error 해결, linked worktree 정리·삭제·merge, dependency 설치, `.codex/config.toml` 변경 포함, `server/data/**` 변경·삭제, `reference/**` 코드 이식, 비밀 파일 접근, main 직접 commit, force push·히스토리 재작성.
- Allowed local files: 계획 단계는 `.ai/task.md`, `.omo/plans/logh7-state-consistency-recovery-plan.md`만. 승인 후에는 `.ai/{task.md,current-state.md,handoff.md,ownership.md,key-facts.md,known-issues.md}`. 사실 불일치가 fresh audit로 입증된 경우에만 `docs/agent/{README.md,lifecycle-planning.md}`, `docs/logh7-roadmap-current.md`, `AGENTS.md`, `CLAUDE.md`를 조건부 허용한다.
- Protected concurrent files: 사용자 소유 `.codex/config.toml`, `E:/logh7-revival.worktrees/agents-commit-push-and-verify-next-steps/**` 전체, 비밀 파일, `server/data/**`, `reference/**`, 위 Allowed local files 밖의 모든 사용자·다른 에이전트 변경.
- Related issue: 없음. Jira/GitHub 연결은 exact 대상·변경 전후 값을 제시해 외부 쓰기 승인을 받은 뒤에만 추가한다.
- Acceptance criteria: (1) 현재 계약은 승인 상태와 실행 가능 여부를 모순 없이 표시한다, (2) `.ai/current-state.md`·handoff·ownership이 실제 branch/HEAD/PR #171 merge와 일치한다, (3) 오래된 플랫폼 하네스 승인 문구가 현재 권한으로 재사용되지 않는다, (4) key-facts와 관련 현행 문서가 P0→P1→P2 및 미검증 범위를 동일하게 설명한다, (5) Jira/GitHub/Obsidian은 승인된 manifest만 변경되고 거절·보류 시 로컬에 `미실행`으로 기록한다, (6) 보호 파일과 linked worktree의 before/after 상태가 동일하다, (7) 문서 검증·diff 검토·독립 리뷰에 BLOCKER/MAJOR가 없다.
- Required verification: 변경 Markdown별 `bash scripts/agent/verify-changes.sh --file <경로>`, `git diff --check`, 변경 파일 allowlist 대조, stale 실행 지시 검색, 내부 링크 실재 확인, 보호 파일·linked worktree before/after 상태 대조. 제품 코드가 바뀌지 않으므로 server/Python 제품 테스트는 미실행으로 명시한다. 외부 쓰기가 승인되면 각 대상 read-back을 추가한다.
- Human checkpoints: **A~E 승인 충족** — 2026-07-17 사용자가 계획 승인과 즉시 시작을 지시하고, 이 계약의 exact manifest 기반 외부 쓰기 및 merge까지 승인했다. push·PR 생성은 merge에 필요한 전달 사슬로 함께 승인된 것으로 해석한다. 이 승인은 근거가 확인된 Jira·GitHub·Obsidian 변경에만 적용되며, linked worktree 정리·삭제는 계약 밖의 별도 승인 사항이다. 검증 통과 뒤 작업 브랜치 local commit은 ADR-LITE-005에 따라 허용한다.
- Stop conditions: Allowed files 밖 수정 필요, ownership 충돌, protected 파일 변화, 증거 없는 외부 변경 필요, 같은 증상 3회 실패 또는 새 증거 없는 조사 2회.

## Instruction Conflict

- Source A: 사용자 현재 지시 — 이번 단계에서는 작업 계약과 계획만 작성.
- Source B: `logh7-start-task`·`docs/agent/lifecycle-planning.md`·AGENTS.md completion gate — ownership/current-state/handoff/key-facts까지 즉시 갱신.
- Conflict: 지금 상태 파일까지 고치면 사용자가 제한한 두 문서 범위를 넘는다.
- Safe temporary behavior: `.ai/task.md`와 계획 문서만 작성하고 Status를 PROPOSED로 유지한다. ownership/current-state/handoff/key-facts 갱신은 승인 후 첫 실행 단계로 미룬다.
- Human decision required: 해결됨 — 2026-07-17 사용자가 계획을 승인하고 즉시 작업 시작을 지시했다.

- Source A: 실제 Git 증거 — `main` HEAD `a8420b8b`, PR #171 merge, `origin/main` 일치.
- Source B: 아래 기존 계약과 `.ai/current-state.md`·handoff·ownership — 작업 브랜치 commit·push 및 PR·merge 대기.
- Conflict: 기존 상태가 이미 완료된 Git 전달 단계를 현재 실행 지시로 남긴다.
- Safe temporary behavior: 아래 계약을 `STALE RECORD — DO NOT EXECUTE`로 격리하고, 승인 후 fresh audit로 DONE 종결 여부를 전체 상태 파일에 반영한다.
- Human decision required: 해결됨 — 새 상태 정합성 계약 승인 완료.

## Completed Contract: 플랫폼 분기 하네스 라이브 확인·배포

- Status: **DONE — 2026-07-17 PR #171 merge**. GitHub PR #171은 `codex/platform-aware-live-qa@9af444d1`을 `main@a8420b8b`로 병합했다. 이 계약의 전달 권한은 소비됐으며 현재 또는 후속 작업의 권한으로 재사용하지 않는다.
- Goal: 현재 플랫폼 분기 하네스 변경을 실제 macOS Wine 경로에서 서버와 함께 실행해 프로세스 시작 여부를 fresh evidence로 판정하고, 검증된 변경을 작업 브랜치에서 커밋·푸시·PR 병합한다.
- User value: native Windows 직접 실행과 macOS/Linux Wine 실행을 같은 하네스로 운용할 수 있는지, 문서·단위 테스트가 아니라 현재 머신의 실제 실행 결과로 확인한다.
- In scope: host/runtime/lineage 입력 점검, run 전용 저장소 외부 Wine prefix와 install copy, 서버 `127.0.0.1:47900` 시작, Wine client launch attempt, PID/port/receipt 기반 정리, 라이브 결과에 따른 상태·현행 문서 갱신, 현재 플랫폼 분기 diff의 검증·리뷰, 명시적 path staging, commit·push·PR·merge.
- Out of scope: Wine/런타임 지원 파일의 네트워크 설치, lineage/runtime gate 우회, 원본 EXE 패치, 서버·프로토콜 제품 기능 변경, `main` 직접 커밋, force push·히스토리 재작성, 사용자 소유 `.codex/config.toml` 변경 포함, 비밀 파일 접근, `server/data/**` 삭제, `reference/**` 코드 이식.
- Acceptance criteria: (1) `sys.platform`과 선택된 `runtimeMode`를 receipt에 기록한다, (2) 서버 프로세스와 `127.0.0.1:47900` 응답을 fresh 관측한다, (3) exact lineage·runtime gate가 통과하면 Wine으로 실제 client process start를 관측하고 그렇지 않으면 실행 전 차단 사유를 새 receipt로 남긴다, (4) 기록된 PID와 전용 자원만 정리하고 listener 잔존 여부를 확인한다, (5) 라이브 결과와 실행 명령·종료 코드를 상태 문서에 반영한다, (6) `.codex/config.toml`과 `_workspace/**` 증거를 제외한 의도된 변경만 커밋·푸시하고 PR을 병합한다.
- Allowed files: 직전 완료 계약의 모든 Allowed files, `.ai/{task.md,current-state.md,handoff.md,ownership.md,key-facts.md,known-issues.md}`, 라이브 결과에 직접 영향받는 `docs/logh7-wine-live-qa.md`, `docs/logh7-roadmap-current.md`, `docs/agent/tool-capabilities.md`, 저장소 비추적 `_workspace/**` evidence. 저장소 밖에는 이 run 전용 Wine prefix/install copy만 생성·변경한다.
- Protected concurrent files: 기존 사용자 변경 `.codex/config.toml`, 비밀 파일, `server/data/**`, `reference/**`, 위 Allowed files 밖의 사용자/다른 에이전트 변경 전체.
- Required verification: host/runtime receipt, 서버 시작·port probe, Wine adapter live attempt와 receipt, PID/listener cleanup probe, 변경 유형별 `docs/agent/verification.md` 최소 행렬, canonical↔Codex↔Claude mirror·skill 검증, `git diff --check`, staged diff review, 원격 PR merge 상태 확인.
- Historical checkpoints: 당시 계약에서 commit·push·PR·merge와 Wine GUI 실행이 승인됐지만 PR #171 merge로 소비됐다. 현재 또는 후속 작업의 권한으로 재사용하지 않는다.
- Interim live evidence: macOS `darwin`에서 Wine Stable 11의 명시적 `wow64` prefix로 서버 `127.0.0.1:47900` ready와 client process 시작을 관측했다. 서버 trace는 `0x0034 → 0x0035 → 0x0036 → 0x0030` 로그인 흐름 뒤 `invalid-credentials`/login-ng를 기록했고, client는 exit 3으로 종료됐다. 로그인 시 runtime error는 사용자 화면 관측이다.
- Interim verdict: macOS Wine 프로세스 실행·서버 도달 경로는 성립했지만 로그인·게임플레이와 native Windows/Linux 실기 검증은 통과하지 않아 cross-platform 전체 pass는 미달이다.
- Historical latest delivery instruction: 2026-07-17 당시에는 commit·push까지만 먼저 수행하고 PR·merge를 보류했으나, 이후 PR #171 merge로 이 지시는 종결됐다.

## Completed Contract: 실행 환경별 레거시 클라이언트 라이브 QA 하네스

- Status: DONE — 2026-07-17 사용자 직접 지시(Windows에서는 Wine 불필요, Codex와 Claude 모두 동일 적용).
- Goal: 라이브 QA 하네스가 호스트 실행 환경을 먼저 판별하고, native Windows에서는 Wine을 요구·실행하지 않으며 macOS/Linux에서는 기존 격리 Wine 계약을 유지한다.
- In scope: canonical live-QA skill의 `native-windows`/`wine` 분기, Codex·Claude 어댑터와 스킬 미러, 공통 prompt pack, P0/계보/검증/도구 현행 문서, 상태·인수인계·키팩트 동기화.
- Out of scope: 실제 원본 클라이언트 실행, Wine prefix 생성·변경, native Windows 라이브 결과 재검증, 서버·프로토콜·클라이언트 제품 코드 변경, commit·push·PR·merge.
- Acceptance criteria: (1) native Windows 분기는 `WINE_BIN`/`WINEBOOT_BIN`/`WINESERVER_BIN`/`WINEPREFIX`를 요구하거나 Wine 명령을 실행하지 않는다, (2) macOS/Linux 분기는 기존 Wine fail-closed 조건을 유지한다, (3) Codex와 Claude live-qa 진입점이 같은 canonical 계약을 사용한다, (4) runtime mode와 공통 lineage/evidence/cleanup 조건이 문서·프롬프트에서 일치한다, (5) 프로젝트 스킬 검증과 미러 일치 검사가 통과한다.
- Allowed files: `tools/live/logh7_wine_live_qa.py`, `tools/tests/test_logh7_wine_live_qa.py`, `.agents/skills/{logh7-wine-live-qa,logh7-orchestrator}/**`, `.codex/skills/logh7-wine-live-qa/**`, `.codex/agents/live-qa.toml`, `.claude/agents/live-qa.md`, `.claude/skills/{logh7-wine-live-qa,logh7-orchestrator}/**`, `scripts/agent/required-skills.tsv`, `docs/logh7-wine-live-qa.md`, `docs/logh7-roadmap-current.md`, `docs/logh7-client-lineage-current.md`, `docs/logh7-remaster-prep-current.md`, `docs/harness/logh7-revival/team-spec.md`, `.omo/plans/logh7-execution-plan-current.md`, `docs/agent/{prompt-pack.md,verification.md,tool-capabilities.md,lifecycle-ops.md,context-strategy.md,codex-user-manual.md,claude-code-ai-업무관리-매뉴얼.md}`, `CLAUDE.md`, `AGENTS.md`, `.ai/{task.md,key-facts.md,known-issues.md,current-state.md,handoff.md,ownership.md}`.
- Protected concurrent files: 기존 사용자 변경 `.codex/config.toml`, 비밀 파일, `server/data/**`, `reference/**`, 위 Allowed files 밖의 사용자/다른 에이전트 변경 전체.
- Required verification: Windows platform simulation의 Wine parser/invocation 차단 테스트, 기존 Wine 관련 Python suite, canonical↔Codex↔Claude skill mirror byte equality, skill validator, `bash scripts/agent/bootstrap-skills.sh --check`, 변경 파일 `verify-changes.sh --file`, `git diff --check`, scoped diff review.
- Human checkpoints: push·PR·merge는 별도 승인 필요. 실제 native Windows/Wine 라이브 실행은 lineage·runtime evidence 입력이 준비된 별도 QA run에서만 수행한다.
- Completion evidence: Windows·unsupported host는 Wine parser/subprocess 전에 차단되고 Wine 전용 인자 없이 direct API 호출 가능, macOS/Linux Wine 전체 unittest 38개 통과, canonical↔Codex↔Claude live-QA 및 canonical↔Claude orchestrator 일치, bootstrap `OK=26 MISSING=0 STALE=0`, Codex 훅 회귀 26개 통과. 실제 클라이언트 라이브 실행은 범위 밖으로 미실행.

## Completed Contract: Codex 사용자 매뉴얼

- Status: DONE — 2026-07-17 사용자 직접 요청. 사용자 매뉴얼 작성, 라우터 연결, Jira/Codex 현행 설명 보정 완료.
- Goal: 첨부된 1~4주차 AI 네이티브 개발 방법론을 참고하여, 사용자가 Codex와 프로젝트의 AI 자동 업무 관리·검증 시스템으로 실제 업무를 시작하고 완료하는 방법을 Markdown 매뉴얼로 작성한다.
- In scope: 프로젝트 열기, 훅·스킬 점검, 자연어/명시적 스킬 호출, 업무 계약, Jira·GitHub 흐름, 구현·검증·리뷰·체크포인트, 외부 쓰기 승인, 장애·운영·문서 현행화 절차.
- Out of scope: 제품 코드 수정, 첨부 PDF 복제·재배포, 새 외부 서비스 연결, commit·push·PR·merge.
- Acceptance criteria: (1) 사용자 관점의 처음부터 끝까지 흐름, (2) 복사 가능한 요청 예시, (3) 자동 처리와 사용자 승인 경계, (4) 스킬·상태 파일·Jira/GitHub 관계, (5) 실패·재개·완료 체크리스트, (6) 문서 라우터 연결.
- Allowed files: `docs/agent/codex-user-manual.md`, `docs/agent/README.md`, `docs/agent/lifecycle-planning.md`, `.ai/task.md`, `.ai/current-state.md`, `.ai/handoff.md`, `.ai/ownership.md`.
- Protected concurrent files: `.codex/config.toml`, `CLAUDE.md` 및 사용자/다른 에이전트 변경 전체.
- Required verification: Markdown 구조·내부 링크·용어 일관성, 변경 diff 검토.
- Publication: 2026-07-17 사용자 직접 지시로 작업 브랜치 commit·push·PR 생성·merge 승인.

## Completed Contract: Codex harness parity

- Status: DONE — 2026-07-17. Codex native hooks, eight workflow skills, and vetted project-only skills.sh acquisition implemented and locally verified. Live activation remains the user's `/hooks` trust checkpoint.
- Goal: Claude Code용 아직이던 업무·검증 하네스를 Codex 네이티브 스키마·훅·워크프로로 직접 실행하고, 외부 스킬 갭이 피요할 때 skills.sh에서 검증한 다은로드·프로젝트 스코프로 설치한다.
- In scope: Codex `apply_patch` payload 호환, git-root 경로, 세션별 상태 격리, Claude 커맨드 7종 대응 Codex 워크프로 스킬, SessionStart 로컬 갭 점검, skills.sh 검색·검토·품질·Codex 프로젝트 설치, 회귀 검증, 관련 문서·상태 현행화.
- Out of scope: 비밀 읽기·의존성 열람, 검증 없이 외부 스킬 실제 설치, push·PR·merge, 자동 훅 신뢰 생략.
- Acceptance criteria: (1) 하위 cwd에서도 훅 동작, (2) `apply_patch` 비밀 차단·후검증, (3) 세션별 Codex 상태 격리, (4) 7개 업무+skills.sh 관리 스킬 발견, (5) 외부 갭 부재 시에 skills.sh 검색·품질·안전 국여로 프로젝트 설치(`-g` 금지), (6) 회귀 검증·Codex strict config exit 0.
- Constraints: 시크릿 접근 금지, 스킬 설치는 반드시 프로젝트 스코프, 출처와 검증 제한은 `skills-lock.json`에 남긴다.
- Allowed files: `.codex/hooks.json`, `.codex/hooks/**`, `.agents/skills/logh7-*/**`, `scripts/agent/{bootstrap-skills.sh,required-skills.tsv,test-codex-hooks.sh}`, `.github/workflows/codex.yml`, `docs/agent/**`, `AGENTS.md`, `.gitignore`, `.ai/**`.
- Protected concurrent files: `CLAUDE.md`, `.codex/config.toml` (현재 미컷 보존).
- Required verification: `bash scripts/agent/test-codex-hooks.sh`, `bash scripts/agent/verify-changes.sh --file <변경 스크립트>`, JSON/TOML/SKILL 링크, `codex --strict-config --version`, 하위 cwd 훅 시물레이션.
- Human checkpoints: 수정 후 Codex `/hooks` 해시 신뢰, push·PR·merge, 외부 스킬 업데이트·설치 불가 의심 대로 외부 연결 자동화 정책이 종료한 경우.

## Historical completed contract (2026-07-16)

- Status: DONE — 2026-07-16 완료. Phase 0~3 전체 종결: PR #6(Phase 1+2, `be6499a3`)·PR #8(Phase 3 SRV-CORR, `3fd847b1`) merge, GitHub Issue #7 종료, Jira LOGH7-6/7/8 완료 전환. 최종 검증: merge 시점 fresh `npm test` 499/495/0/4 exit 0, AC-5 Sentry `NODE-1` 캡처+Seer AI 분석. (승인 이력: 사람 "전면 승인"·PR별 push/merge 승인. 계획 정본: `.omc/plans/logh7-ai-work-system-plan.md`)
- Goal: 기존 AI 하네스를 실전 개발용으로 고도화 — NIAH 키팩트 카드·재주입 훅·신선도 게이트, 프롬프트 팩 커맨드 배선(7섹션 표준)+도메인 팩 4종, 컨텍스트 전략 통합, 최소 CI·Claude GHA·CodeRabbit·Sentry·Jira MCP 연동, E2E는 M4-OBS-001 서버-테스트 슬라이스 1건 완주로 판정
- User value: 사람+에이전트가 같은 하네스로 기획→구현→테스트→리뷰→모니터링을 증거 기반으로 완주할 수 있다
- In scope: 계획 §3 Phase 0~3 전체 (P0-0 스파이크, 1A NIAH, 1B 팩, 1C 컨텍스트·스텁, 1D 헌법 3줄, 2A CI, 2B GHA+CodeRabbit, 2C Sentry, 2D MCP 정의/활성화 분리, 3 E2E)
- Out of scope: 과제 제출물·HEART 지표, CLAUDE.md·AGENTS.md 전면 개편, AWS/Terraform/Docker, MCP 서버 자작, 옛 코드(5bd249c) 부활, 게임 기능 자체 구현(E2E 슬라이스 내용물은 별도 계약)
- Acceptance criteria: 계획 §4 AC-0~AC-9 (판정 명령 포함)
- Constraints: 헌법 최소 증분(라우팅 3줄 내외), 기존 훅 4종 회귀 금지(additive만·fail-open 재주입), main 직접 커밋 금지, 시크릿은 사람 등록, Codex 레인에서 push/PR/merge/의존성/핵심 훅 변경 금지, key-facts ≤40줄
- Related issue: GitHub PR #6(Phase 1+2, merge 완료 `be6499a3`) / **Issue #7**(Phase 3 SRV-CORR) / Jira: **LOGH7-8**(Task, Issue #7과 1:1) · LOGH7-7(Story) · LOGH7-6(Epic) — 사이트 `pepponechoi-jira.atlassian.net`, 프로젝트 `LOGH7`
- Allowed files: `docs/agent/**`, `.claude/**`, `.codex/**`, `.ai/**`, `.github/**`, `.mcp.json`, `.coderabbit.yaml`, `scripts/agent/**`, `CLAUDE.md`, `AGENTS.md`, `server/src/**`(Sentry 한정), `server/tests/**`(E2E 슬라이스), 현행 docs TL;DR 헤더(roadmap 등). **Phase 3 확장(2026-07-16 전체 승인·Issue #7)**: 신규 `server/src/server/logh7-correlation-record.mjs`, `server/src/server/logh7-playable-server.mjs`(writeTrace 배선 한정)
- Protected files: `.env*`, `*.pem`, `*.key`, `credentials*`, `secrets*`, `terraform.tfstate*` (훅으로 차단됨)
- Required verification: `docs/agent/verification.md` 행렬 + 계획 §6 Phase 종료 게이트
- Human approval checkpoints: push·PR·merge 각 시점 / 시크릿 등록(사람 직접) / 계약 밖 변경 재승인. 핵심 훅 변경·`@sentry/node` 추가는 2026-07-16 전면 승인에 포함(계획에 명시된 범위 한정)

<!--
이 파일은 사람이 작성하거나 승인하는 작업 계약이다.
- 승인: 2026-07-16 사용자 "전면 승인" (ralplan 합의 계획 기준)
- 완료되면 DONE으로 바꾼 뒤 .ai/handoff.md에 결과를 남긴다.
-->
