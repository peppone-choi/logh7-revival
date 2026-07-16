# Lifecycle Runbook: Planning

## Status
ACTIVE — 계획 정본은 로컬 Markdown(`.ai/task.md`, `.omc/plans/`)이며 Jira는 승인된 외부 백로그 뷰다. Claude는 `.mcp.json`과 로컬 allowlist, Codex는 현재 작업에 노출된 Atlassian Rovo 커넥터를 사용한다. 신규 사이트 `pepponechoi-jira.atlassian.net` + 프로젝트 `LOGH7`("은하영웅전설7 부활")로 Epic LOGH7-9~17 / Story LOGH7-18~42 / Task LOGH7-43~92 ↔ GitHub Issue #10~#59 생성이 실증됐고, 2026-07-17 L 13개와 복합 M 17개를 Sub-task LOGH7-93~196 ↔ GitHub Issue #62~#165로 추가 분해했다. 이후 상태 정본은 Jira다. 옛 `pepponechoi.atlassian.net`은 suspended이므로 사용하지 않는다.

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

**활성화 전제**: ① Jira 프로젝트가 존재하고, ② 현재 에이전트 작업에 Atlassian 도구가 실제 노출돼 있어야 한다. Claude는 프로젝트 MCP allowlist 또는 Atlassian 커넥터, Codex는 Atlassian Rovo 커넥터 노출 여부를 확인한다. 둘 중 하나라도 미충족이면 Jira를 추측하거나 우회 쓰기하지 않고 로컬 Markdown 계획(`.ai/task.md` + `.omc/plans/`)을 사용한다.

**계층 생성 절차** (2주차 교안의 계층 패턴만 방법론 차용 — 교안 자체·제출물 형식은 이식하지 않음):
1. **Epic** = 마일스톤 단위 (예: `docs/logh7-roadmap-current.md`의 M4). 로드맵 마일스톤 1개당 Epic 1개.
2. **Story** = 게이트·기능 단위 (예: M4 선행 P0/P1/P2 게이트 1개당 Story 1개). Story는 Epic에 연결.
3. **Task** = 계약 단위 — `.ai/task.md`로 승인된 작업 계약 1건당 Task 1개. Task는 Story에 연결.
4. **Sub-task** = 독립 구현·검증 가능한 S급 단위. L 또는 복합 M Task만 0.5~2일 범위로 분해하고, 이미 원자적인 S/M은 불필요하게 쪼개지 않는다.

**Task·Sub-task ↔ GitHub Issue 매핑**:
- Task 또는 Sub-task 생성 시 대응하는 GitHub Issue를 `gh issue create`로 만들거나 기존 Issue에 연결한다.
- GitHub Issue 제목에 Jira 키를 병기한다: `[JIRA-123] <이슈 제목>` 형식.
- `.ai/task.md`의 **Related issue** 칸에 `Jira: <PROJECT>-<번호> / GitHub: #<번호>` 형식으로 둘 다 기입한다.

**Codex 레인**: Atlassian Rovo 커넥터가 현재 작업에 노출되면 같은 Jira 루틴을 사용할 수 있다. 커넥터가 없거나 권한이 부족하면 로컬 Markdown 계획을 정본으로 유지하고, 사용자가 요청하지 않은 외부 쓰기는 수행하지 않는다.
