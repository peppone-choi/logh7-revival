# Agent Handoff

## 2026-07-20 active handoff — #216 / LOGH7-213 master design gate

- Goal: 15축 전체 인과 역기획 원장을 설계·승인한 뒤 축별 자식 이슈를 독립 PR로 구현하고, 실제 입력에서 픽셀·오디오와 다음 입력까지 닫힌 수직 인과 사슬을 증명한다.
- Current stage: 제품 구현 전 설계 게이트. `docs/logh7-causal-ledger-master-design.md`는 `PROPOSED`; 관련 계약·실행계획·로드맵·문서 인덱스 동기화와 독립 검토·로컬 검증을 마쳤고 설계 전용 commit·push·PR 발행이 남았다.
- Independent review: architecture/acceptance와 rights/security/resource 분리 검토가 입력 SHA-256 `bcfdd971875603f2ddd3c1f07709d159c47609ba7003ff15e82e79fa756d3989`에 대해 각각 `PASS`; BLOCKER/MAJOR 0. 초기 FIX 지적은 DAG 입력, canonical 전이, edge class, reject/audio, 전역 자원 상한, TLS, prohibited/P3, updater/SBOM, clean-room 역할 분리를 보강해 해소했다.
- Branch/baseline: `peppone-choi/216-실제-구현` / 시작 HEAD `110718e12a1e0ec8bcad14cfe594e571e6c37b0e`.
- Delivery: 설계 commit `83123966cbf9949c3f0e665aaf72e15cdff42f66` push 완료. draft PR #232 `https://github.com/peppone-choi/logh7-revival/pull/232`는 OPEN/DRAFT, base `main`, head branch/OID read-back 일치. 생성 직후 status checks 0건.
- Tracker scope: parent GitHub #216 / Jira LOGH7-213, children #217~#231 / LOGH7-214~228. 모두 열려 있으며 Jira는 `진행 중`·Highest·미배정이다.
- Known tracker drift: LOGH7-213과 LOGH7-85의 차단 방향이 본문 의도와 반대이고, A01은 일부 축만 언급하며, A10 의존성은 A11~A15를 빠뜨린다. 설계 병합 뒤 구조화 링크·본문을 바로잡는다.
- Hard gate: 설계 PR merge는 사용자 승인 필요. 승인 전 제품 코드, 자식 이슈 구현, Jira 완료 전환, parent close를 금지한다.
- Verification: 변경 Markdown 10종 `bash scripts/agent/verify-changes.sh --file <path>` 각각 exit 0. master validator는 축 계약 15/15, tracker mapping 15/15, graph node 16, cycle/unknown 0, A10 dependency 14, resource row 17, threat row 10으로 exit 0. tracked `git diff --check`와 untracked 설계 whitespace check도 exit 0. server/Python/live QA는 제품 코드·클라이언트 변경이 없어 미실행(비적용).
- Verification correction: 첫 untracked whitespace 검사에서 설계 머리말 trailing space 6곳을 찾아 제거했다. 뒤이은 한 번의 tracked 검사에 `core.autocrlf=false`를 잘못 적용해 기존 CRLF 전체가 오류처럼 보였고, 저장소 기본 설정의 올바른 scoped 검사로 재실행해 exit 0을 확인했다.
- Next exact actions: PR checks가 생기면 결과를 read-back하고, 사용자에게 설계 내용과 PR #232 merge 승인을 받는다. 승인 전 제품 구현·tracker dependency 수정·자식 issue 착수·merge를 하지 않는다.
- Preserved state: `.codex/config.toml`은 사용자 소유 dirty 변경이므로 읽기·수정·stage 금지. 과거 P0/M4 기록은 역사 증거로 남기되 현재 실행 계약으로 사용하지 않는다.
- Vault: `LOGH7_VAULT_DIR` unset으로 이번 설계 단계의 볼트 동기화는 미실행이다.

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
