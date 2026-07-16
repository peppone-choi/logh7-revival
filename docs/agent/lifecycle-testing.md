# Lifecycle Runbook: Testing

## Status
ACTIVE — `cd server && npm test` (`node --test`) 실재. Python은 pytest 환경 확인 필요(PARTIAL).

## Read This When
코드를 변경했을 때, 테스트가 실패했을 때, 완료를 주장하기 전.

## Preconditions
변경 파일 목록 파악 (`git status --short`).

## Inputs
현재 diff, `.ai/task.md`의 Required verification.

## Procedure
변경 분류 → 가장 작은 관련 테스트(`scripts/agent/verify-changes.sh --file`) → 정적 검사(구문 — lint는 NOT_CONFIGURED) → 하네스 변경이면 `scripts/agent/test-codex-hooks.sh` → 관련 영역 테스트 → 필요 시 전체(`--full` 또는 `cd server && npm test`) → 클라이언트 가시 변경이면 라이브 QA 증거(P0 게이트 통과 전이면 불가를 명시) → 결과 기록.

## Tools / Commands
`docs/agent/verification.md`의 실재 명령 표가 정본.

## Human Approval Gates
테스트 삭제·수정(약화 방향)은 사용자 승인 필요.

## Verification
명령 + 종료 코드 + 실패 시 원문 로그.

## Failure Handling
실패 → Claude `/debug` 또는 Codex `logh7-debug` 절차(가설 기반, `failure-cases.md` 선확인). 같은 증상 3회 → Blocked-Loop 보고.

## 금지
실패 테스트 삭제 / assertion 약화 / skip으로 통과 위장 / 실행 안 한 테스트를 통과로 기록 / 환경 오류(pytest 부재 등)를 제품 성공으로 해석.

## Completion Criteria
변경 유형별 회귀 명령을 포함한 행렬상 최소 검증 전부 종료 코드 0 + 미실행 검증이 보고에 구분 표기됨.

## State Files to Update
`.ai/current-state.md` (Verification run/result).

## Handoff Requirements
실패 중 인수인계 시 실패 원문·시도한 가설·기각 근거를 `.ai/handoff.md`에 기록.
