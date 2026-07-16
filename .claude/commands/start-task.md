---
description: 작업 시작 — 계약 확인, 문서 라우팅, 계획 수립 (코드 수정 없음)
---
# /start-task

$ARGUMENTS: 시작할 작업의 한 줄 설명. 비우면 `.ai/task.md`의 현재 계약을 사용.

절차 (정본: `docs/agent/lifecycle-planning.md`):

1. `.ai/task.md` 확인. Status가 EMPTY면 $ARGUMENTS 기반 계약 초안을 제안하고 사람 승인을 기다린다 — 승인 전 구현 금지.
2. `.ai/ownership.md` 확인 — 대상 파일을 다른 에이전트가 소유 중이면 중단하고 보고한다.
3. `.ai/decisions.md`, `.ai/known-issues.md` 확인 — 기존 결정과 모순되는 계획을 세우지 않는다.
4. `docs/agent/README.md`의 작업 유형 라우팅에 따라 **필요한 문서만** 읽는다.
5. 코드 수정 없이 계획을 작성한다: 범위/비범위, 수용 기준, 변경 파일 목록, 검증 계획, 사람 승인이 필요한 지점.

결과 저장: 계획은 응답으로 제시. 승인되면 `.ai/task.md`를 ACTIVE로 갱신하고 `.ai/ownership.md`에 소유 등록.
중단 조건: 소유 충돌, 계약 불명확, `CLAUDE.md`의 Human Approval Required 항목 해당.
