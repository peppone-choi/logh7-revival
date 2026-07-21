# Agent Handoff

## 2026-07-21 216 인과 원장 완주 마라톤 (Wave 2~5)

- 사용자 지시: "새 계약 잡고 병렬구현하고 커밋PR머지 반복. 216 실 구현을 끝낼 것." → 계약 `.ai/task.md` ACTIVE. 잔여 축을 파동별 병렬 구현·commit·PR·merge 반복해 15축 완성.
- 진행: **Wave 1~4 merge 완료** — main에 13축 A02~A09·A11~A15 (PR #236/#241/#242/#243, `b6fd2968`; CI `test` 첫 시도 통과 연속으로 교훈 사전주입 안정화). **Wave 5 (A10 verification-matrix/clean-room synthesis = 최종 축) 구현 중** (branch `peppone-choi/wave5-a10`). 병합 시 A01~A15 **전 15축 완성 = 216 인과 원장 완주**.
- 구현 패턴(정본): 각 축 = A01 base 부트스트랩(`importSources(SOURCE_MANIFEST)`) → 도메인 node/edge/evidence append → 축 노드를 기존 coverage `targetNodeIds`에 부착 → `validateLedger(ledger,{manifest})`. Wave-1 CI 4교훈을 브리프·verify 게이트에 사전 주입(파일해시 LF정규화·비-base evidence 소스(master-design)·in-process 결정성·`import.meta.url` 이식 경로) → Wave 2는 CI 반복 0회로 통과.
- 워크플로: `.claude/.../workflows/scripts/ledger-wave2-a03-a05-*.js`(AXES만 교체해 재사용). 각 파동 = 1 PR → CI(LF) green → merge.
- 부수 정리: 축 생성 델타 `tools/causal-ledger/generated/a[0-9]*.json` gitignore로 추적 해제(재생성 산출물, master-design 변경 드리프트 churn 근절; A01 `ledger.json`/`import-report.json`은 유지).
- 주의: 각 축은 실 아티팩트 인용만, 공백은 Unknown/Blocked(open blocker: clock/RNG/replay, bounded-resource enforcement, 라이브 픽셀/오디오, roundtrip A/B, String.txt 0바이트). 날조 0. `.codex/config.toml` 불가침(이전 사고 미해결, 복구후보 scratchpad 보존).

## 2026-07-21 Wave-1 A02/A04/A06/A09/A13 구현·검증 완료

- Goal: A01 frozen schema를 소비하는 5개 축(A02 input/UI, A04 protocol, A06 data/P3, A09 lineage, A13 rights)의 axis-specific node/edge/evidence를 shared bootstrap pattern으로 납품한다.
- Result: 5개 모듈이 A01 schema 검증을 통과하고 독립 테스트 전부 green. A02 27 nodes 21/21 tests, A04 66 nodes+44 edges 7/7 tests, A06 170 nodes 13/13 tests, A09 18 nodes 4/4 tests, A13 4 nodes 7/7 tests. A01 regression 9/9 pass. Deterministic CLI 2회 실행 byte-identical, frozen files untouched, generated output delta-only.
- Branch: `peppone-choi/wave1-axes`, single PR `peppone-choi/wave1-axes → origin/main`. push authorized, merge NOT yet approved.
- Files changed: `tools/causal-ledger/axes/a{02,04,06,09,13}-*.mjs` (5), `server/tests/logh7-causal-ledger-a0{2,4,6,9,13}.test.mjs` (5), `tools/causal-ledger/generated/a{02,04,06,09,13}-*.json` (12).
- Commands executed: `node --test tests/logh7-causal-ledger-a0*.test.mjs` 각 exit 0, A01 test 9/9 exit 0, verify-changes.sh 각 exit 0, git diff --check exit 0, frozen files diff empty.
- Verification result: focused 5×pass, deterministic regeneration hash match, A01 regression preserved, no frozen file touch, no code/test leftover (console.log/TODO/debugger).
- Independent review: 초기 A02 WndProc hex 날조 적발 → 실제 UI 기록 + explicit Blocked로 정정, 재검증 pass. 어떤 node도 canonical 미승격, live behavior 주장 0.
- Known failures: 없음 (this wave).
- Remaining work: A03 (needs A01+A02+A04+A06 merge), A05 (needs A01+A04+A06 merge) 착수 eligible. Wave-1 PR merge 승인 대기.
- Files to read first: `.ai/task.md`, `tools/causal-ledger/axes/a02-input-ui-fsm.mjs`, `tools/causal-ledger/axes/a04-protocol-session.mjs`, `tools/causal-ledger/axes/a06-data-assets-provenance.mjs`, `tools/causal-ledger/axes/a09-lineage-failure-safety.mjs`, `tools/causal-ledger/axes/a13-rights-and-redistribution.mjs`, 해당 test 파일들.

---

## 2026-07-20 completed handoff — A01 #217 / LOGH7-214

- Goal: 모든 후속 축이 소비할 `1.0.0` node/edge/evidence/coverage/transition/migration/DAG 계약, fail-closed validator와 lossless audit adapter를 구현한다.
- Current result: `tools/causal-ledger/` 구현과 focused test 9/9가 통과했다. 네 primary snapshot 11,793 records는 imported 11,793, excluded/rejected/loss 0이며 auxiliary 배열은 count+비대상 사유를 별도 기록한다.
- Decisions already made: legacy status/grade/trust는 그대로 보존하고 O0/R1/I2/P3로 자동 변환하지 않는다. text/raw record hash는 LF-normalized exact slice SHA-256이다. generated output은 `server/content/generated` 밖에 둔다.
- Merge: PR #233 / `origin/main@43ee007a474f94b93fc3a9232add9f6813794ba3`; commits `7b2d7f37`, `bfcf3867`, `2912e528`.
- Files changed: `.ai/{task,current-state,handoff,key-facts,ownership}.md`, `.omo/plans/logh7-execution-plan-current.md`, `tools/causal-ledger/**`, `server/tests/logh7-causal-ledger.test.mjs`, `docs/{logh7-causal-ledger-master-design,logh7-document-index-current,logh7-roadmap-current}.md`.
- Commands executed: focused RED exit 1(module absent), focused GREEN 9/9 exit 0, CLI regeneration+`cmp` exit 0, changed-file 검증, exact/forced full regression과 packet-lab 단독 재현.
- Verification result: focused 9/9 exit 0(12,000-node/11,999-dependency chain 포함); ledger/report hashes `220c0b3f...f2e5` / `42c3b054...7507`; exact `npm test` 300초 timeout; forced full suite 520 pass/2 fail/8 skip exit 1. A01 tests는 full run에서도 pass.
- Independent review: 최종 PASS, BLOCKER 0 / MAJOR 0.
- Known failures: pre-existing `logh7-packet-lab-proxy.test.mjs` 2건(`438 !== 384`, SIGTERM exit `null !== 1`)이 단독 실행에서도 재현되고 열린 handle로 timeout된다. 첫 JSON changed-file 검증은 Windows CP949 때문에 실패했으며 `PYTHONUTF8=1` 재실행은 통과했다. LSP diagnostics는 매번 3초 timeout; `node --check`를 사용한다.
- Do not repeat: EXE JSON의 top 80을 11,593 함수 분모로 쓰지 않는다. `.omo/re-galaxy/functions.tsv` 주소를 stable identity로 쓴다. 사용자 dirty `.codex/config.toml`은 읽기·수정·stage하지 않는다.
- Remaining work: A01 없음. Full regression의 기존 packet-lab 2건은 별도 계약 blocker로 OPEN 유지한다.
- Recommended next action: A02/A04/A06/A09/A13 중 하나 또는 병렬 파동을 새 task 계약으로 승인·소유권 설정한 뒤 시작한다.
- Required human decisions: 없음. Packet-lab pre-existing failure를 별도 계약으로 고칠지는 후속 결정이며 A01에서 범위를 확장하지 않는다.
- Files to read first: `.ai/task.md`, 본 절, `tools/causal-ledger/schema.json`, `tools/causal-ledger/source-manifest.json`, `server/tests/logh7-causal-ledger.test.mjs`.
- Vault: `LOGH7_VAULT_DIR` unset이라 동기화 미실행.
- Documentation gate exception: A01 관련 current docs와 session state는 PR #234에 반영했다. `AGENTS.md`·`CLAUDE.md`에는 새 영구 규칙·워크플로·도구 계약이 없어 무변경이며, vault는 `LOGH7_VAULT_DIR` unset이라 갱신하지 않았다.

## Goal
P0 게이트(스토리 LOGH7-18) 완주 — LOGH7-47/43/45/44/46을 각 Jira 완료기준대로 닫는다. 순서 47→43→45→44→46. push·PR·merge·외부 쓰기·라이브 실기는 2026-07-17 상시 사전승인(하드 금지선 제외).

## Current result
- 작업 브랜치 `codex/opcode-coverage-and-state-docs`는 `main@956c41ef` 기반으로 상태 문서 현행화 중.
- GitHub PR #178 merge됨: base `d2cda7f1`, head `ddfb7ce2`, merge `956c41ef` (LOGH7-58: 전술 게이트 no-op 오타수정·`LOGH7_TACTICAL_ENTRY` 정본화·전략맵 전술 arm 크래시 기본 OFF·토글 재발방지 테스트).
- PR #171의 `CI / test`와 CodeRabbit status는 success다. `Claude Code Review / review`는 merge 뒤 PR이 닫힌 상태에서 failure였고 제출 review·inline thread는 0건이다.
- Jira 미완료 전수 조회는 188건(`LOGH7-9`~`196`), 전부 `해야 할 일`·Medium·미배정이다. 유형은 에픽 9, 스토리 25, 작업 50, 하위 작업 104다.
- PR #171만으로 LOGH7-18, 43~49, 144, 145, 150, 151의 완료 기준을 모두 충족한 항목은 없다. Jira 상태 전환은 0건으로 유지한다.
- 연결 worktree `agents/commit-push-and-verify-next-steps@0b9c324d`는 main 대비 226 behind/1 ahead이며 staged 3·unstaged 1·untracked 4개다. 내용은 읽거나 수정하지 않고 status 메타데이터만 기록했다.
- 현재 머신에서 `LOGH7_VAULT_DIR`는 설정되지 않아 Obsidian 정본 경로를 식별할 수 없다. vault 쓰기는 미실행 대상으로 고정한다.
- 2026-07-17 사용자 승인으로 소유권이 Codex에서 Claude Code로 인수됐다. Codex 레인은 10:53 KST 외부 쓰기까지 실행하고 상태 파일 갱신 전에 중단된 것으로 확인됐다.
- 외부 manifest 3건(Jira LOGH7-43 제목+코멘트 10084, LOGH7-18 코멘트 10085, GitHub #10 제목+코멘트)은 적용 완료이며 2026-07-17 read-back으로 manifest 제안 값과 일치를 확인했다. Jira 상태 전환 0건 유지.
- Jira read-back은 로컬 Atlassian MCP를 사용자 OAuth로 인증해 수행했다(정본 사이트 pepponechoi-jira.atlassian.net, cloudId 300c260a-54a7-4ab5-b843-ae94bf68dcd6). Rovo 커넥터의 pepponechoi.atlassian.net 테넌트는 suspended-inactivity로 사용 불가였다.
- 전달 완료: commit `572bf8f5`, PR #172, merge `4f8c4281`(2026-07-17 12:20 KST, MERGED read-back). checks: test·CodeRabbit pass, claude review 워크플로는 액션 내부 오류 fail(재분류 금지).
- Batch #1 매듭: 43·47 Windows 라이브 완료, 45/44/46 Wine-후속 이관(사용자 결정).

## Decisions already made
- 완료된 platform-aware 전달 계약은 DONE으로 종결하고 과거 승인을 재사용하지 않는다.
- 제품 완료와 하네스 merge를 분리한다. successful login/gameplay, Windows/Linux 실기, post-fix live cleanup, 최신 전체 Wine suite, run9 exact-hash evidence는 계속 미검증이다.
- `docs/agent/README.md`, `docs/agent/lifecycle-planning.md`, `docs/logh7-roadmap-current.md`, `AGENTS.md`, `CLAUDE.md`는 P0→P1→P2와 `win32|wow64` 계약이 이미 현행이라 수정하지 않는다.
- Jira/GitHub 상태는 닫지 않는다. LOGH7-43 ↔ GitHub #10의 오래된 `32-bit WINEPREFIX` 제목만 현재 runtime 계약으로 맞추고, PR #171의 부분 구현·남은 증거를 코멘트로 남긴다.

## External change manifest

| 대상 | 현재 값 | 승인된 변경 | 상태 판정 | rollback |
|---|---|---|---|---|
| Jira LOGH7-43 | `프로젝트 전용 32-bit WINEPREFIX 강제 + 기본 ~/.wine 접근 fail-closed` | 제목을 `실행 환경별 client runtime 격리(native Windows·Wine win32\|wow64) + 기본 ~/.wine 접근 fail-closed`로 교체하고 PR #171 부분 진척 코멘트 추가 | 적용 완료·read-back 일치(2026-07-17) | 제목 복원 + 정정 코멘트 |
| Jira LOGH7-18 | 코멘트에 PR #171 진척 없음 | P0의 부분 구현과 미충족 증거 목록 코멘트 추가 | 적용 완료·read-back 일치(2026-07-17) | 정정 코멘트 |
| GitHub #10 | Jira의 오래된 제목, open/backlog | Jira와 같은 제목으로 교체하고 PR #171 부분 진척 코멘트 추가 | 적용 완료·read-back 일치(2026-07-17) | 제목 복원 + 코멘트 수정/삭제 |
| Obsidian vault | `LOGH7_VAULT_DIR` unset | 미실행 | 미실행 확정(unset 재확인) | 해당 없음 |

## Files changed
- `.ai/task.md`: 새 계약 ACTIVE, 이전 플랫폼 계약 DONE, 승인 경계 분리.
- `.ai/current-state.md`: Git/PR/Jira/worktree/product gate 최신 관측 반영.
- `.ai/ownership.md`: 새 작업 소유 등록, 이전 작업 소유 해제.
- `.ai/key-facts.md`: 40줄 이하 현재 진입 카드로 갱신.
- `.ai/handoff.md`: 이 복구 작업 기준으로 전면 교체.
- `.omo/plans/logh7-state-consistency-recovery-plan.md`: 승인된 실행 계획.
- 조건부 문서와 `.ai/known-issues.md`: fresh audit에서 사실 불일치가 없어 변경하지 않음.
- 보호 파일 `.codex/config.toml`: 기존 사용자 dirty 상태를 읽거나 수정·stage하지 않음.

## Commands executed
- Git branch/HEAD/status/worktree/log/rev-list 조회: 모두 exit 0.
- Jira JQL 전 페이지 조회: 2페이지, 188건; 대상 이슈 설명·관계 조회 성공. remote-link/transition 단건 조회는 응답 지연으로 중단했으나 상태 전환을 하지 않아 실행에 필요하지 않다.
- GitHub PR #171/Issue #10 metadata·files·checks·reviews·threads 조회: 성공.
- `LOGH7_VAULT_DIR` 확인: unset.
- read-back: Atlassian MCP getJiraIssue LOGH7-43/LOGH7-18(제목·코멘트·상태 일치), gh issue view 10(제목·상태·코멘트 일치), LOGH7_VAULT_DIR unset 확인. 모두 성공.

## Verification result
- 계획 단계: `.ai/task.md`와 계획 문서 `verify-changes.sh --file` exit 0, `git diff --check` exit 0.
- 구현 단계 최종 검증(2026-07-17, 상태 파일 종결 편집 후 재실행): 변경 Markdown 6종(`.ai/task.md`·`current-state.md`·`handoff.md`·`ownership.md`·`key-facts.md`·`.omo/plans/logh7-state-consistency-recovery-plan.md`) `verify-changes.sh --file` 각 exit 0, `git diff --check` exit 0, allowlist 대조 위반 0건, placeholder(TBD/TODO 등) 0건, stale 실행 지시 rg 검색 일치 6건 전부 DONE/historical 문맥(실행 가능 지시 0건).
- 보호 대상 before/after 대조: `.codex/config.toml` 상태 `M` 유지(내용 미열람), linked worktree staged 3·unstaged 1·untracked 4로 Task 2 baseline과 동일.
- 독립 리뷰(Opus): BLOCKER 0·MAJOR 2(검증 기록 누락, 계획 Task 8과 task.md 승인 해석 상충) — 검증 기록 본 절 반영과 계획 Task 8 정렬 노트로 해소, 재검증 통과.
- 제품 코드가 바뀌지 않아 server/Python 제품 테스트는 미실행한다.

## Known failures
- Jira remote-link와 transition 목록 조회가 응답 지연으로 완료되지 않았다. GitHub PR/Issue와 Jira 자체 관계는 별도 조회로 확인했고, transition 0건으로 범위를 줄였다.
- PR #171의 Claude Code Review workflow는 merge 뒤 failure였다. 이 복구 작업에서 해당 과거 workflow를 성공으로 재분류하지 않는다.
- linked worktree는 오래되고 dirty지만 계약 밖이라 정리·merge하지 않는다.

## Remaining work
- (진행중) LOGH7-58 유닛 스테이징·Warp(0x032f OutfitParty 빌더+라이브): PR #178 merge로 전술 게이트 정상화. fleet roster 비는 원인 디버그(buildDeploymentFleetList/tactical-entry) → 전략맵 함대 렌더 → Warp(0x0b01+0x2b) 라이브.
- (진행중) LOGH7-62/59/60 세션 라이프사이클: 미확인 command fail-closed·disconnect시 online=false·reconnect idempotency. `npm test` TDD+검증.
- (병렬) 전수 opcode 커버리지 스윕: `docs/logh7-opcode-coverage-current.md` 원장에 Information/StaticInformation 확정, 나머지 엔드포인트 매핑 진행중.
- (병렬) RE 확정 사항 구현 백로그(추출 1단, 승인불요): 0x031d 행성 수치(class_/diameter/revolution galaxy 캐논 채움), 0x032f 멤버리스트(0x0325↔0x033b unitId 매칭), 정적테이블 0x0309/030d/030f/0311 추출.
- Wine 호스트(macOS/Linux) 세션에서 LOGH7-45(fullPassEligible 산출기 구현+`--execute --initialize-prefix` 라이브)·44(계보 integration)·46(run9/run3/run5 evidence, frozen baseline 복원 선행) 진행.
- P1 LOGH7-48/49(proxy/Frida/server 3면 correlation)도 Wine 호스트 의존.
- 이 Windows 호스트 완료분(43 login·47 gate)은 codex/logh7-43-p0-evidence에 있음 — PR로 main 정리 예정.

## Required human decisions
- 현재 계약의 계획·근거 기반 외부 쓰기·push·PR·merge는 2026-07-17 사용자 지시로 승인됐다.
- linked worktree 정리·삭제·merge와 제품 P0 구현은 별도 계약이 필요하다.
- 소유권 인수(Codex→Claude Code)와 후속 계약 선택은 2026-07-17 사용자 답변으로 승인됐다.

## 다음 세션 계획 (2026-07-18 사용자 확정) — main `70b16ca2`

이번 세션 코드는 전부 병합됐으나 **라이브 미검증이 최대 리스크**(서버 단위 테스트만 통과). 다음 세션 = **라이브 검증 우선 + 2개 병행**.

1. **[최우선] 라이브 검증 3종** (포트 47900 전용 슬롯, 직렬화 필수):
   - **유닛 스테이징**: "aa"(동맹, 수도 셀 2014 투영)가 전략맵에 **선택 가능한 함대 아이콘**으로 뜨는가. (`getFactionCapitalCell` 세력 수도 투영, PR #197 `70b16ca2`.)
   - **0x032f 멤버리스트**: 함대 선택 시 `0x032e→0x032f` 방출·멤버리스트 렌더 + **endian 확정**(BE 가정, 깨지면 `wireEndian='le'` 토글). (PR #181.)
   - **0x031d 검은 행성**: 성계정보 패널에서 행성/항성이 색을 갖는가(spectralClass 1..7 투영, 색↔index 매핑 MEDIUM). (PR #193.)
   - **연쇄 구조**: 함대 등장 → 선택 가능 → 멤버리스트 → 이동(0x0b01) → **Warp(0x2b, LOGH7-58 원 목표)**. 라이브 성공 시 Warp까지 구동 = standing directive "기본 게임플레이 라이브 검증" 실질 도달. 막히면 그 지점이 진짜 다음 블로커(RE 디버그).
   - 하네스: `python -m tools.logh7_ui_explorer --lineage-manifest <정본>` (fail-closed), `LOGH7_TACTICAL_ENTRY` OFF 유지(전략맵 크래시). 증거 evdir(스크린샷·서버로그·exit·cleanup).
2. **[병행] 로그인 첫 키 패치 (LOGH7-212)** — 클라 패치 프로그램 첫 MVP. 재베이스라인 인프라(LOGH7-201, PR #194 병합)는 준비됨. exact RE 바이트(FUN_004ffba0 tail에서 FUN_004ffb50 선호출)로 patch manifest transform_ops 채움 → **사용자 승인**(비가역 라이너지 결정) → 재베이스라인 → 패치 클라 라이브 검증(첫 키 온전 입력, keysetup 크래시 0). RE 근거는 LOGH7-212 설명 참조.
3. **[병행] 추출 백로그 opcode** — 0x032d(GridInformationOutfit 205)·0x0329(Package 206)·0x0331(OutfitInformationUnit 207)·정적 테이블 0x0309/030d/030f/0311(208~211). 커버리지 원장 `docs/logh7-opcode-coverage-current.md` 근거, CD 추출 캐논, 테스트만(라이브는 후속). 무날조.

트래킹: Jira 스프린트 미사용·status전이+증거코멘트, GitHub 라벨. 라이브 검증된 것만 완료 전환(가짜 완료 금지). 볼트 정본 `E:\obsidian-tech-vault\1. 프로젝트\은하영웅전설 7 리바이벌\`.

## Files to read first
`.ai/task.md`, `.ai/current-state.md`, `.ai/ownership.md`, `.ai/key-facts.md`, `.ai/known-issues.md`, `docs/logh7-roadmap-current.md`, `docs/logh7-opcode-coverage-current.md`, `docs/logh7-social-simulation-design.md`.
