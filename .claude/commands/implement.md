---
description: 승인된 계획 구현 — 최소 범위, 소유 파일만, 검증 포함
---
# /implement

이 커맨드는 `docs/agent/prompt-pack.md`의 "기능 구현" 섹션을 로드해 적용한다.

$ARGUMENTS: 구현할 항목 (승인된 계획의 일부여야 함).

전제 조건 — 하나라도 어긋나면 중단하고 보고:
- `.ai/task.md`가 ACTIVE이고 이번 구현이 그 범위 안이다.
- `.ai/ownership.md`에 소유가 등록돼 있고 충돌이 없다.

절차 (정본: `docs/agent/prompt-pack.md`의 "기능 구현", 검증: `docs/agent/verification.md`):

1. 소유 파일만, 계약의 Allowed files 안에서만 수정한다. 범위 밖 리팩터링 금지.
2. 기존 패턴 우선 (`docs/agent/coding-rules.md`). 코드 주석은 한글 (캐논 일본어 용어·바이너리 오프셋은 원문 유지).
3. 변경 유형에 맞는 최소 검증을 실행한다: `bash scripts/agent/verify-changes.sh --file <경로>` 또는 `--full`.
4. `git diff`를 직접 검토해 의도하지 않은 변경이 없는지 확인한다.
5. `.ai/current-state.md`를 갱신한다.

중단 조건: 검증 실패 반복(같은 증상 3회 → Blocked-Loop Rule), 범위 밖 수정 필요 발견(계약 갱신 승인 필요).
