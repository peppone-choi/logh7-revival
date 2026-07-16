---
description: 변경 리뷰 — 요구사항·아키텍처·테스트·보안·성능, 심각도별 결과
---
# /review

$ARGUMENTS: (선택) 리뷰 대상 — 비우면 현재 작업트리 diff.

절차 (정본: `docs/agent/lifecycle-review.md`, 템플릿: `docs/agent/prompt-pack.md`의 "코드 리뷰"):

1. `git diff`와 `.ai/task.md`의 수용 기준을 대조한다.
2. `docs/agent/coding-rules.md`·`docs/agent/architecture.md` 기준으로 검토한다.
3. 심각도 분류: BLOCKER / MAJOR / MINOR / QUESTION.
4. 각 지적에 필수 포함: 파일과 위치, 문제, 실제 위험, 재현 또는 근거, 권장 수정, 확신 수준.

제약: 근거 없는 지적 금지 — 재현하거나 코드로 입증할 수 없으면 QUESTION으로 분류한다. 리뷰 단계에서 코드를 수정하지 않는다.
결과 저장: 응답으로 제시. BLOCKER가 있으면 `.ai/current-state.md`에 기록.
