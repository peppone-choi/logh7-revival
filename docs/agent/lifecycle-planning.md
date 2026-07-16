# Lifecycle Runbook: Planning

## Status
PARTIAL — 계획 도구는 로컬 Markdown(`.ai/task.md`, `.omo/plans/`)만 사용. Jira·Notion 미연동(NOT_CONFIGURED), GitHub Issues는 `gh`로 가능하나 현행 관례 아님.

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
