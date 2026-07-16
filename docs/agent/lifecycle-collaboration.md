# Lifecycle Runbook: Collaboration

## Status
ACTIVE — Claude Code(`.claude/`)와 Codex(`.codex/`) 하네스가 모두 설치돼 있고, 소유권·인수인계 상태 파일(`.ai/ownership.md`, `.ai/handoff.md`)이 존재한다.

## Read This When
두 에이전트(또는 서브에이전트)가 동시에 작업하거나, 다른 에이전트의 작업을 이어받을 때.

## Preconditions
`.ai/ownership.md` 최신 상태 확인. 규칙 정본은 `collaboration-protocol.md`.

## Inputs
분해된 작업 목록과 파일 경계.

## Procedure
1. 작업 시작 전 `.ai/ownership.md`에 Agent/Task/Branch/Owned files 등록.
2. 브랜치 또는 worktree로 격리 (관례: `codex/*` 브랜치 → PR).
3. 작업 중 다른 에이전트 소유 파일은 읽기만.
4. 종료 시 `.ai/handoff.md` 작성(결정/추측 분리, 검증 실행/미실행 분리) 후 ownership 해제.
5. 이어받는 쪽은 handoff의 추측(Inferred)을 사실로 승격하지 않고 재확인한다.

## 병렬화에 적합
코드 조사, 독립 테스트 작성, 문서 검토, 서로 다른 모듈 리뷰, 로그 분석.

## 병렬화에 부적합
동일 파일 수정, 순서 의존 구현, 같은 마이그레이션 동시 수정, 요구사항 미확정 기능 구현.

## Human Approval Gates
stale ownership(3일 이상 미갱신 in-progress) 강제 해제는 사람 확인 후.

## Verification
merge 전 두 에이전트의 diff가 같은 파일을 건드리지 않았는지 `git diff --stat` 대조.

## Failure Handling
소유 충돌 발견 → 즉시 중단, 두 작업 상태를 사람에게 보고. 늦게 시작한 쪽이 양보가 기본.

## Completion Criteria
ownership 등록·해제가 실제 작업 구간과 일치, handoff만으로 재개 가능.

## State Files to Update
`.ai/ownership.md`, `.ai/handoff.md`, `.ai/current-state.md`.

## Handoff Requirements
`prompt-pack.md`의 "작업 인수인계" 필수 항목.
