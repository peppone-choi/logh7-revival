# LOGH VII Revival — Agent Working Agreement

2008년 서비스 종료된 일본 MMO **은하영웅전설 VII**를 원본 클라이언트 + 자체 권위 서버로 복원한다.
이 문서는 Codex를 포함한 **모든 코딩 에이전트의 도구 독립 실행 계약**이다. Claude 전용 규칙은 `CLAUDE.md`.

## Read Order

1. `.ai/task.md` — 현재 작업 계약. EMPTY면 사람 승인 전 구현 금지.
2. `.ai/decisions.md` — 인간 승인 결정
3. `docs/agent/README.md` — 작업 유형별 문서 라우팅 (모든 문서를 읽지 않는다)
4. `.ai/current-state.md`, `.ai/handoff.md`, `.ai/ownership.md` — 재개·병렬 작업 시
5. 현재 작업 유형의 Runbook (`docs/agent/lifecycle-*.md`)

## Instruction Hierarchy

충돌 시 위가 우선한다. 조용히 하나를 고르지 말고 충돌을 보고한다.

1. 사용자의 현재 직접 지시
2. `.ai/task.md` 계약
3. `.ai/decisions.md` 승인 결정
4. `CLAUDE.md`·`AGENTS.md` 영구 규칙
5. 실행 가능한 설정·테스트·빌드 파일
6. `docs/agent/` Runbook
7. 코드베이스의 반복 패턴
8. `.ai/current-state.md`·`handoff.md`
9. 에이전트의 추론·가정

```md
## Instruction Conflict
- Source A: / Source B: / Conflict: / Safe temporary behavior: / Human decision required:
```

## Repository Boundaries

- 수정 전 `.ai/task.md`의 Allowed files와 `.ai/ownership.md` 소유를 확인한다.
- 보호: 비밀 파일(`.env*`, `*.pem`, `*.key`, `credentials*`, `secrets*`, `terraform.tfstate*`) 읽기·쓰기 금지, `server/data/` 라이브 데이터 삭제 금지, `reference/`의 외부 코드 이식 금지.
- 역사 문서(`docs/logh7-document-index-current.md`가 historical로 분류)의 코드 경로는 불신한다.
- 정본 라우팅: 마일스톤·게이트 = `docs/logh7-roadmap-current.md`, 클라이언트 계보 = `docs/logh7-client-lineage-current.md`, 방법론 = `docs/logh7-reference-haul.md`.

## Required Workflow

Explore → Plan → (필요시 범위 확인) → Implement minimally → Verify → Review diff → Update state → Report.
Blocked-Loop Rule: 같은 증상 3회 실패 또는 새 증거 없는 조사 2회 → 접근 전환 + 블로커 보고.
코드 주석은 한글 (캐논 일본어 용어·바이너리 오프셋은 원문 유지). 코딩 규칙: `docs/agent/coding-rules.md`.

## Verification Contract

- 정본: `docs/agent/verification.md` (변경 유형별 최소 검증 행렬).
- 공통 명령: `bash scripts/agent/verify-changes.sh --file <경로>` / `--full`, `cd server && npm test`.
- 실행한 명령과 종료 코드를 기록한다. 미실행 검증은 미실행으로 구분한다. 실패 테스트 삭제·약화·skip 금지.
- 클라이언트 가시 변경은 라이브 증거 없이 완료 주장 금지. 과거 수치는 historical baseline이지 fresh gate가 아니다.

## Git Safety (근거: `.ai/decisions.md` ADR-LITE-005)

- 작업 브랜치 commit: 검증 통과 후 허용. 관례: `codex/*` 등 작업 브랜치 → PR.
- push, PR 생성, merge, main 직접 커밋, 히스토리 재작성: **사용자 승인 필수.**
- `git reset --hard`·작업트리 초기화·다른 에이전트 변경 덮어쓰기 금지.

## Sensitive Data Policy

비밀값은 읽지도 출력하지도 않는다. 설정 예시는 `.env.example` 류로 대체한다.
(Claude/Codex 훅이 차단하지만, 훅 부재 환경에서도 이 계약은 유효하다.)

## Multi-Agent Ownership

single-writer-per-file. 시작 전 `.ai/ownership.md` 등록, 종료 시 해제. 다른 에이전트 소유 파일은 읽기만.
동일 기능 병렬 구현 금지. 결과 전달은 `.ai/handoff.md` — 추측(Inferred)을 사실로 승격하지 않는다.
상세: `docs/agent/collaboration-protocol.md`, `docs/agent/lifecycle-collaboration.md`.

## Completion Report

- 보고에 포함: 변경 파일, 실행 검증(명령+종료 코드), 미실행 검증, 남은 일, 필요한 사람 결정.
- **문서 현행화 게이트**: 파일을 변경한 턴은 관련 `docs/` 현행 문서, `AGENTS.md`·`CLAUDE.md`, `.ai/current-state.md`, (`LOGH7_VAULT_DIR` 설정 머신에서는) 옵시디언 볼트까지 갱신해야 끝난다. 반영할 것이 없으면 그 근거를 보고에 명시한다. 진행 로그를 누적하지 말고 낡은 지침은 수정·삭제한다.
- 세션 종료 전 `.ai/handoff.md` 갱신 — 다음 에이전트가 대화 기록 없이 재개 가능해야 한다.

## Tool Notes

- Claude 전용 Commands(`.claude/commands/`)·Hooks는 얇은 래퍼다 — 절차 정본은 `docs/agent/`와 `scripts/agent/`에 있고, Codex는 같은 스크립트를 수동 실행한다 (`.codex/hooks/`는 미러).
- 도구 실사·설치 스택: `docs/agent/tool-capabilities.md`.
