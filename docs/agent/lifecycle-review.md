# Lifecycle Runbook: Review

## Status
PARTIAL — `gh` CLI와 브랜치→PR→merge 관례 실재 (PR #2~#5 이력). CI 자동 검사는 NOT_CONFIGURED — 사람과 AI 리뷰가 유일한 게이트.

## Read This When
구현이 끝나 병합 전 검토가 필요할 때, 리뷰를 요청받았을 때.

## Preconditions
검증(lifecycle-testing) 완료 상태. diff가 계약 범위 안.

## Inputs
`git diff`, `.ai/task.md` 수용 기준.

## Procedure
diff 확인 → 요구사항 대조 → AI 1차 리뷰(`/review`, 심각도 분류) → 테스트 확인 → 사람 리뷰 → 수정 → 재검증 → **병합 승인(사람)**.

## 책임 분리
- AI: 잠재 버그, 누락 테스트, 일관성(coding-rules 대조), 일반 보안 문제, 성능 위험, 변경 요약.
- 사람: 비즈니스 요구(게임 재현 충실도 판단), 아키텍처 의도, 운영 위험, 보안 승인, **병합 여부**.

## Tools / Commands
`/review` 커맨드, `gh pr view/diff`(읽기), codegraph `detect_changes`(Claude). PR 생성·merge는 사용자 승인 후.

## Human Approval Gates
PR 생성, merge, main 직접 커밋 (ADR-LITE-005).

## Verification
BLOCKER 0개 + 테스트 통과가 병합 요청의 전제.

## Failure Handling
BLOCKER 발견 → 수정 브리프로 재위임 → 재검증 후 재리뷰. 리뷰어와 구현자는 같은 컨텍스트에서 자기 승인 금지.

## Completion Criteria
사람이 병합을 승인했거나, 명시적으로 보류 사유가 기록됨.

## State Files to Update
`.ai/current-state.md`, 병합 후 `.ai/ownership.md` 해제.

## Handoff Requirements
미해결 지적이 있으면 심각도·위치·재현 근거를 `.ai/handoff.md`로.
