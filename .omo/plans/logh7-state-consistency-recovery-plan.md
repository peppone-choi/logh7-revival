# LOGH VII 상태 정합성 복구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 Git·로컬 상태 정본·현행 문서·승인된 외부 업무 뷰를 같은 사실과 다음 게이트로 정렬한다.

**Architecture:** Git과 실행 영수증을 관측 근거로 삼고 `.ai/`를 현재 세션 상태 정본으로 재구성한다. `docs/`는 장기 사실만 반영하며 Jira·GitHub·Obsidian은 로컬에서 exact change manifest를 만든 뒤 별도 승인을 받아 동기화한다. 제품 코드와 오래된 linked worktree는 건드리지 않는다.

**Tech Stack:** Markdown, Git, PowerShell/Git Bash, repository verification scripts, Atlassian Rovo/Jira JQL, GitHub CLI 또는 설치된 GitHub 커넥터.

## Global Constraints

- 이 계획은 `.ai/task.md`가 사용자 승인으로 ACTIVE가 된 뒤에만 실행한다.
- P0→P1→P2 순서를 바꾸거나 제품 코드를 수정하지 않는다.
- 사용자 소유 `.codex/config.toml`은 읽거나 수정하거나 stage하지 않는다.
- linked worktree `E:/logh7-revival.worktrees/agents-commit-push-and-verify-next-steps`는 읽기 전용 상태 비교만 허용한다.
- 비밀 파일, `server/data/**`, `reference/**`에는 접근·수정하지 않는다.
- 외부 Jira·GitHub·Obsidian 쓰기, push, PR 생성, merge는 각각 별도 승인 전 실행하지 않는다.
- main 직접 commit, force push, 히스토리 재작성, 작업트리 초기화는 금지한다.
- 검증하지 않은 과거 수치를 fresh evidence로 승격하지 않는다.

---

### Task 1: 승인된 실행 경계와 소유권 설정

**Files:**
- Modify: `.ai/task.md`
- Modify: `.ai/ownership.md`
- Read: `.ai/decisions.md`
- Read: `docs/agent/collaboration-protocol.md`

**Produces:** `codex/state-consistency-recovery` 브랜치와 이 계약의 단일 writer 소유권.

- [ ] **Step 1: 사용자 승인 확인**

  대화의 명시적 승인 문장을 기록한다. 승인이 없으면 어떤 명령이나 추가 파일 수정도 하지 않고 중단한다.

- [ ] **Step 2: fresh local baseline 확인**

  Run:

  ```powershell
  git -c safe.directory=E:/logh7-revival status --short --branch
  git -c safe.directory=E:/logh7-revival log -1 --oneline --decorate
  git -c safe.directory=E:/logh7-revival worktree list --porcelain
  ```

  Expected: `main...origin/main`, HEAD `a8420b8b` 또는 그 이후의 설명 가능한 successor. 알려진 planning diff는 `.ai/task.md`, `.omo/plans/logh7-state-consistency-recovery-plan.md`, 사용자 소유 `.codex/config.toml`뿐이어야 한다. 결과가 다르면 계획을 실행하지 말고 차이를 보고한다.

- [ ] **Step 3: 작업 브랜치 생성**

  Run:

  ```powershell
  git -c safe.directory=E:/logh7-revival switch -c codex/state-consistency-recovery
  ```

  Expected: 새 로컬 브랜치로 전환되고 기존 dirty 파일은 그대로 보존된다. 같은 이름이 이미 있으면 자동 재사용하지 않고 branch/HEAD를 보고한다.

- [ ] **Step 4: 계약 활성화와 ownership 등록**

  `.ai/task.md`의 Proposed Contract를 ACTIVE로 바꾸고 승인 시각·승인 범위를 기록한다. `.ai/ownership.md`의 오래된 플랫폼 하네스 행은 fresh Git 증거를 근거로 `done` 처리하고, 새 행을 다음 값으로 추가한다.

  - Agent: `Codex (root)`
  - Task: `상태 정합성 복구`
  - Branch/worktree: `codex/state-consistency-recovery`
  - Owned files: 계약의 Allowed local files만
  - Status: `in_progress`

- [ ] **Step 5: 경계 검증**

  Run:

  ```powershell
  git -c safe.directory=E:/logh7-revival diff -- .ai/task.md .ai/ownership.md
  ```

  Expected: 승인 상태와 ownership 변경만 있고 제품 파일 diff는 없다.

### Task 2: Git·worktree·Jira read-only 증거 원장 확정

**Files:**
- Modify: `.ai/current-state.md`
- Modify: `.ai/handoff.md`
- Read only: linked worktree 전체
- External read only: Jira LOGH7, merged PR #171 metadata

**Produces:** 각 상태 주장의 출처·시각·Observed/Inferred 구분을 가진 fresh 기준선.

- [ ] **Step 1: 루트와 linked worktree 관계 기록**

  Run:

  ```powershell
  git -c safe.directory=E:/logh7-revival rev-list --left-right --count main...agents/commit-push-and-verify-next-steps
  git -c safe.directory=E:/logh7-revival.worktrees/agents-commit-push-and-verify-next-steps -C E:/logh7-revival.worktrees/agents-commit-push-and-verify-next-steps status --short --branch
  ```

  Expected baseline: main 기준 `226 1`; linked worktree dirty 항목은 이름과 상태만 기록하고 내용은 열지 않는다. 값이 달라지면 새 값을 Observed로 기록한다.

- [ ] **Step 2: Jira 미완료 목록을 두 페이지 모두 읽기**

  JQL:

  ```text
  project = LOGH7 AND statusCategory != Done ORDER BY priority DESC, key ASC
  ```

  Required fields: key, summary, status, issue type, priority, assignee, parent, updated. 모든 페이지를 합쳐 count/status/priority/assignee/type 분포를 계산한다. 2026-07-17 baseline은 188건(LOGH7-9~196), 전부 `해야 할 일`·Medium·미배정이다.

- [ ] **Step 3: PR #171 merge 사실 읽기 검증**

  로컬 merge commit `a8420b8b`과 원격 PR read-only metadata의 merge commit·branch를 대조한다. 원격 읽기가 불가능하면 로컬 merge commit만 Confirmed로, PR 세부 상태는 Unobserved로 기록한다.

- [ ] **Step 4: current-state와 handoff 초안 갱신**

  반드시 다음을 분리한다.

  - 완료: platform-aware harness PR #171 merge 및 main 반영.
  - 미완료 제품 게이트: successful authentication/gameplay, Windows/Linux 실기, 수정 후 cleanup live receipt, run9 계보/evidence.
  - 운영 불일치: Jira 진행 중 0, 오래된 linked worktree, stale ownership.
  - 금지: linked worktree를 현재 제품 기준선으로 승격하거나 정리하지 않음.

### Task 3: 로컬 상태 정본과 현행 문서 최소 정합화

**Files:**
- Modify: `.ai/task.md`
- Modify: `.ai/current-state.md`
- Modify: `.ai/handoff.md`
- Modify: `.ai/ownership.md`
- Modify: `.ai/key-facts.md`
- Modify only if stale fact is proven: `.ai/known-issues.md`
- Modify only if stale fact is proven: `docs/agent/README.md`
- Modify only if stale fact is proven: `docs/agent/lifecycle-planning.md`
- Modify only if stale fact is proven: `docs/logh7-roadmap-current.md`
- Modify only if stale fact is proven: `AGENTS.md`, `CLAUDE.md`

**Produces:** 한 세션이 위 파일만 읽고 현재 완료·미완료·다음 작업·승인 경계를 동일하게 판단하는 로컬 상태.

- [ ] **Step 1: 오래된 플랫폼 계약 종결**

  `.ai/task.md`의 stale record를 fresh Git/PR 증거에 따라 DONE 또는 명시적 residual 상태로 바꾼다. 과거의 commit·push·PR·merge 승인을 현재 권한으로 재사용할 수 없다는 문장은 유지한다.

- [ ] **Step 2: key-facts에서 오래된 실행 권한 제거**

  다음 문구를 현재 사실로 교체한다.

  - 과거: platform-aware 계약의 commit/push/PR/merge 승인.
  - 현재: PR #171 merge 완료; 새 외부 쓰기와 push/PR/merge는 각각 별도 승인.
  - 다음 제품 게이트: P0의 lineage/run9 evidence와 cross-platform live gaps.

  `.ai/key-facts.md`는 40줄 이하를 유지한다.

- [ ] **Step 3: 관련 문서 사실 대조**

  `docs/agent/lifecycle-planning.md`의 Jira 범위 LOGH7-9~196, `docs/logh7-roadmap-current.md`의 P0→P1→P2와 PR #171 이후 live verdict, `AGENTS.md`·`CLAUDE.md`의 승인 규칙을 비교한다. 이미 맞는 파일은 수정하지 않고 handoff에 `no change required`와 근거를 남긴다.

- [ ] **Step 4: stale 실행 지시 검색**

  Run:

  ```powershell
  rg -n "codex/platform-aware-live-qa|commit·push까지만|PR·merge는 보류|플랫폼 분기 하네스 라이브 확인·배포" .ai docs/agent docs/logh7-roadmap-current.md AGENTS.md CLAUDE.md
  ```

  Expected: 남은 일치는 명시적으로 `DONE`, `historical`, `stale record` 중 하나로 표시된다. 실행 가능한 현재 지시로 남은 일치는 0건이다.

### Task 4: 외부 변경 manifest 작성과 승인 체크포인트

**Files:**
- Modify: `.ai/handoff.md`
- Modify: `.ai/current-state.md`
- External read only until approval: Jira, GitHub, configured Obsidian vault

**Produces:** 시스템·대상·현재 값·제안 값·근거·rollback을 모두 적은 exact external-change manifest.

- [ ] **Step 1: Jira 제안 목록 작성**

  완료 후보를 요약으로 추정하지 않는다. 각 Jira 키별 acceptance와 PR #171 diff/검증을 대조해 다음 표를 작성한다.

  ```text
  Jira key | current status | proposed status/field/comment | evidence | rollback
  ```

  특히 LOGH7-43의 `32-bit WINEPREFIX` 문구는 현재 `win32|wow64` 계약과 대조하되, acceptance 전체가 충족되지 않으면 완료로 전환하지 않는다.

- [ ] **Step 2: GitHub·Obsidian 제안 목록 작성**

  GitHub issue가 Jira와 1:1 연결된 경우에만 exact issue 번호와 제안 상태를 적는다. Obsidian은 configured vault의 `은하영웅전설 7 리바이벌/현재 상태.md`, `로드맵.md`에 필요한 사실 차이만 제안하고 기존 dirty 상태를 별도로 기록한다.

- [ ] **Step 3: 외부 쓰기 승인 요청 후 중단**

  manifest 전체를 사용자에게 보여주고 Jira/GitHub/Obsidian 쓰기 범위를 승인받는다. 승인 전에는 transition, comment, issue edit, vault edit을 하나도 실행하지 않는다.

### Task 5: 승인된 외부 쓰기와 read-back 검증

**Files:**
- External write: 사용자가 승인한 manifest 항목만
- Modify: `.ai/current-state.md`
- Modify: `.ai/handoff.md`

**Produces:** 승인 범위를 벗어나지 않은 외부 동기화 결과 또는 명시적인 미실행 기록.

- [ ] **Step 1: 승인 범위 고정**

  승인된 행만 별도 목록으로 복사하고 거절·보류 행은 `미실행`으로 표시한다. 모호한 승인은 전체 승인으로 해석하지 않는다.

- [ ] **Step 2: 승인된 외부 쓰기 실행**

  Jira, GitHub, Obsidian 순서로 실행하되 한 시스템의 실패가 다음 시스템을 자동 승인하지 않는다. 각 호출 결과와 식별자를 기록한다.

- [ ] **Step 3: read-back**

  변경한 각 Jira issue/PR·issue/vault 파일을 다시 읽어 proposed 값과 일치하는지 확인한다. 불일치하면 재시도 전에 보고하며 같은 쓰기를 반복하지 않는다.

- [ ] **Step 4: 로컬 상태에 결과 반영**

  `.ai/current-state.md`와 handoff에 실행한 외부 쓰기, 종료/응답, 미실행 항목, 실패를 구분해 기록한다.

### Task 6: 문서 검증과 독립 리뷰

**Files:**
- Verify: 이 계약에서 실제 변경된 local files 전부
- Review only: 전체 diff

**Produces:** fresh 명령 출력과 계약 대조 리뷰 결과.

- [ ] **Step 1: 변경 파일 allowlist 대조**

  Run:

  ```powershell
  git -c safe.directory=E:/logh7-revival diff --name-only
  git -c safe.directory=E:/logh7-revival status --short
  ```

  Expected: 기존 `.codex/config.toml`과 계약 Allowed local files만 보인다. 다른 새 변경은 BLOCKER다.

- [ ] **Step 2: Markdown 검증**

  실제 변경 파일마다 실행한다.

  ```powershell
  & 'C:/Program Files/Git/bin/bash.exe' scripts/agent/verify-changes.sh --file <path>
  ```

  Expected: 각 명령 exit 0. Git Bash 임시 공간 오류가 재현되면 도구 실패로 기록하고 우회 설치나 전역 설정 변경 없이 중단한다.

- [ ] **Step 3: diff와 불완전 표식 검사**

  Run:

  ```powershell
  git -c safe.directory=E:/logh7-revival diff --check
  rg -n "T[B]D|T[O]DO|implement l[a]ter|fill in d[e]tails|Similar to T[a]sk" .omo/plans/logh7-state-consistency-recovery-plan.md .ai/task.md
  ```

  Expected: `git diff --check` exit 0, 불완전 표식 검색 결과 0건.

- [ ] **Step 4: 보호 대상 before/after 대조**

  `.codex/config.toml`의 status만 baseline과 같고, linked worktree status가 Task 2 baseline과 같아야 한다. 파일 내용이나 바이너리를 열지 않는다.

- [ ] **Step 5: 독립 리뷰**

  `logh7-review` 또는 별도 reviewer에게 다음만 맡긴다: 계약 범위 이탈, stale 권한 잔존, 사실 충돌, 외부 승인 위반, 보호 파일 변화, 누락된 verification. BLOCKER/MAJOR가 있으면 Allowed files 안에서 수정하고 Task 6을 다시 실행한다.

### Task 7: 상태 종결과 local commit

**Files:**
- Modify: `.ai/task.md`
- Modify: `.ai/current-state.md`
- Modify: `.ai/handoff.md`
- Modify: `.ai/ownership.md`

**Produces:** 대화 없이 재개 가능한 DONE 상태와 검증된 로컬 커밋.

- [ ] **Step 1: 상태 문서 최종화**

  `.ai/task.md`를 DONE으로 바꾸고 실제 변경·미변경·외부 미실행을 기록한다. handoff는 Goal / Current result / Decisions already made / Files changed / Commands executed / Verification result / Known failures / Remaining work / Required human decisions / Files to read first를 포함한다. ownership의 새 행을 `done`으로 바꾸고 소유 파일을 해제한다.

- [ ] **Step 2: 최종 검증 반복**

  Task 6의 allowlist, Markdown, diff check, 보호 대상 대조를 최종 상태 diff에 다시 실행한다.

- [ ] **Step 3: 로컬 commit**

  Run only after all fresh checks pass:

  ```powershell
  $corePaths = @(
    '.ai/task.md',
    '.ai/current-state.md',
    '.ai/handoff.md',
    '.ai/ownership.md',
    '.ai/key-facts.md',
    '.omo/plans/logh7-state-consistency-recovery-plan.md'
  )
  git -c safe.directory=E:/logh7-revival add -- $corePaths

  $conditionalPaths = @(
    '.ai/known-issues.md',
    'docs/agent/README.md',
    'docs/agent/lifecycle-planning.md',
    'docs/logh7-roadmap-current.md',
    'AGENTS.md',
    'CLAUDE.md'
  )
  foreach ($path in $conditionalPaths) {
    git -c safe.directory=E:/logh7-revival diff --quiet -- $path
    if ($LASTEXITCODE -eq 1) { git -c safe.directory=E:/logh7-revival add -- $path }
    elseif ($LASTEXITCODE -ne 0) { throw "diff failed for $path" }
  }

  git -c safe.directory=E:/logh7-revival diff --cached --name-only
  git -c safe.directory=E:/logh7-revival commit -m "chore(state): reconcile merged live-qa task state"
  ```

  Conditional paths는 Task 1 baseline에서 clean이고 이 task가 ownership을 가진 경우에만 위 loop에 남긴다. `git diff --cached --name-only`에서 `.codex/config.toml` 또는 계약 밖 경로가 보이면 commit하지 않는다.

### Task 8: Push, PR, merge 개별 승인 게이트

> **정렬 노트 (2026-07-17):** 사용자가 `/start-task` 지시로 "복구 계약의 잔여 단계(외부 manifest 실행 → 검증·독립 리뷰 → commit·push·PR·merge) 완주"를 명시해, 이 계약에 한해 push·PR·merge가 전달 사슬로 함께 승인됐다(`.ai/task.md` Human checkpoints와 일치). 아래 Step 1~3의 단계별 중단은 이 계약에서는 결과 보고 의무로 대체하며, force push·main 직접 commit 금지는 그대로 유지한다. 이 승인은 후속 계약에 재사용하지 않는다.

**Files:** none locally unless external results require a documented follow-up.

**Produces:** 각 단계가 독립 승인된 원격 전달 상태.

- [ ] **Step 1: push 승인 요청**

  local commit SHA, 검증 결과, staged file list를 보고하고 멈춘다. 승인 후에만:

  ```powershell
  git -c safe.directory=E:/logh7-revival push -u origin codex/state-consistency-recovery
  ```

- [ ] **Step 2: PR 생성 승인 요청**

  push 결과와 원격 branch를 보고하고 다시 멈춘다. 승인 후에만 PR을 생성한다. PR 본문에는 상태 불일치, 변경 파일, 외부 쓰기 여부, 검증 명령·종료 코드, 보호 대상 보존을 적는다.

- [ ] **Step 3: merge 승인 요청**

  PR URL, CI/review 상태, base/head SHA를 보고하고 다시 멈춘다. 승인 후에만 merge한다.

- [ ] **Step 4: merge read-back**

  merge가 승인·성공한 경우에만 remote PR 상태와 merge SHA를 읽어 보고한다. 후속 상태 문서 수정이 필요하면 새 계약 없이 main에 직접 쓰지 않는다.

## Self-Review Result

- Spec coverage: 계약 승인, 구현, 검증, 독립 리뷰, 문서·상태 갱신, 외부 쓰기, push, PR, merge의 독립 승인 게이트를 모두 포함했다.
- Scope: 제품 코드와 linked worktree 정리는 제외했다.
- Interfaces: 로컬 상태 → external manifest → 승인된 external write → read-back → final state 순서로 고정했다.
- Verification: 문서 변경에 맞는 최소 행렬과 보호 파일 before/after 대조를 포함했다.
