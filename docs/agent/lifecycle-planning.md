# Lifecycle Runbook: Planning

## Status
PARTIAL — 계획 도구는 로컬 Markdown(`.ai/task.md`, `.omc/plans/`)이 기본. Jira MCP **정의**는 `.mcp.json`(`atlassian`, `https://mcp.atlassian.com/v1/mcp` http — SSE는 2026-06-30 지원종료, 시크릿 미기입)으로 커밋됨 — **활성화**는 사람이 `.claude/settings.local.json`의 `enabledMcpjsonServers`에 `atlassian`을 명시 추가해야 하며 현재 미포함(의도적 미활성). 신규 사이트 `pepponechoi-jira.atlassian.net` + 프로젝트 `LOGH7`("은하영웅전설7 부활")로 아래 분해 루틴 첫 실행 실증됨(2026-07-16, 세션 직접 OAuth): Epic LOGH7-6 / Story LOGH7-7 / Task LOGH7-8 ↔ GitHub Issue #7. 2026-07-17 문서 전수 분해 백로그 일괄 생성 실증: Epic LOGH7-9~17 / Story LOGH7-18~42 / Task LOGH7-43~92 ↔ GitHub Issue #10~#59(`backlog` 라벨, 상호 링크·코멘트) — 분해 정본은 `.omc/plans/logh7-full-backlog-2026-07-16.md`, 이후 정본은 Jira. 옛 `pepponechoi.atlassian.net`은 suspended — 사용 안 함. GitHub Issues는 `gh`로 가능.

## Read This When
새 기능·마일스톤 작업을 시작하기 전, `.ai/task.md`가 EMPTY일 때.

## Preconditions
`.ai/decisions.md`·`.ai/known-issues.md` 확인. LOGH VII 도메인이면 `docs/logh7-roadmap-current.md`(정본)와 `docs/logh7-reference-haul.md` 해당 트랙.

## Inputs
사용자 요청 또는 로드맵의 다음 게이트 (현재: M4 선행 P0→P1→P2).

## Procedure
문제 정의 → 사용자 가치 → 범위/비범위 → 수용 기준 → 위험·제약 → 구현 가능한 Task 분해 → **사람 승인**.
결과를 `.ai/task.md` 계약 형식으로 작성한다. 장기 다단계 계획이면 `.omo/plans/`에 실행계획을 두고 task.md에서 링크한다.

## Tools / Commands
로컬 Markdown 편집만. 외부 쓰기(이슈 생성 등)는 사용자 승인 전 실행 금지.

## Human Approval Gates
- `.ai/task.md`의 Status를 ACTIVE로 만드는 것은 사람 승인.
- 비가역 아키텍처 결정·의존성 추가·스키마 변경이 계획에 포함되면 계획 단계에서 명시하고 승인받는다.

## Verification
계획 자체의 검증 = 수용 기준이 측정 가능한지, Allowed files가 실재하는지 확인.

## Failure Handling
요구사항이 모호해 범위를 정할 수 없으면 구현으로 넘어가지 말고 질문 목록으로 종료.

## Completion Criteria
사람이 승인한 ACTIVE `.ai/task.md` 존재.

## State Files to Update
`.ai/task.md`, `.ai/ownership.md`(소유 등록), `.ai/current-state.md`.

## Handoff Requirements
계획만 하고 세션을 넘기면 `.ai/handoff.md`에 "구현 미착수 — 계획 승인 상태"를 명시.

## Jira 분해 루틴 (활성화 전제 충족 시)

**활성화 전제** (둘 다 충족해야 이 루틴을 실행): ① 사람이 Jira 프로젝트를 생성(또는 기존 사이트 재활성화 — 현재 `pepponechoi.atlassian.net`은 `suspended-inactivity`로 조회 불가), ② MCP `atlassian`이 활성화됨 — `.claude/settings.local.json`의 `enabledMcpjsonServers`에 사람이 `atlassian`을 직접 추가하거나, claude.ai Atlassian 커넥터가 세션에 연결되어 있어야 함. 둘 중 하나라도 미충족이면 이 루틴은 실행하지 않고 기존 로컬 Markdown 계획(`.ai/task.md` + `.omc/plans/`)만 사용한다 — 이것이 항상 유효한 폴백이다.

**계층 생성 절차** (2주차 교안의 계층 패턴만 방법론 차용 — 교안 자체·제출물 형식은 이식하지 않음):
1. **Epic** = 마일스톤 단위 (예: `docs/logh7-roadmap-current.md`의 M4). 로드맵 마일스톤 1개당 Epic 1개.
2. **Story** = 게이트·기능 단위 (예: M4 선행 P0/P1/P2 게이트 1개당 Story 1개). Story는 Epic에 연결.
3. **Task** = 계약 단위 — `.ai/task.md`로 승인된 작업 계약 1건당 Task 1개. Task는 Story에 연결.

**Task ↔ GitHub Issue 매핑**:
- Task 생성 시 대응하는 GitHub Issue를 `gh issue create`로 만들거나 기존 Issue에 연결한다.
- GitHub Issue 제목에 Jira 키를 병기한다: `[JIRA-123] <이슈 제목>` 형식.
- `.ai/task.md`의 **Related issue** 칸에 `Jira: <PROJECT>-<번호> / GitHub: #<번호>` 형식으로 둘 다 기입한다.

**Codex 레인 예외**: Codex는 Atlassian MCP에 접근할 도구가 없다(`.codex/config.toml`에 `atlassian` 미정의, GitHub MCP만 존재). Codex 레인에서의 계획 작업은 이 Jira 루틴을 건너뛰고 로컬 Markdown 계획을 그대로 정본으로 사용한다 — 이것은 결함이 아니라 명시된 폴백이다.
