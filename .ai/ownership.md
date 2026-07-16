# Work Ownership

| Agent | Task | Branch/worktree | Owned files | Status | Updated at |
|---|---|---|---|---|---|
| Claude Code (메인) | Agent OS 부트스트랩 | main | `CLAUDE.md`, `AGENTS.md`, `docs/agent/**`, `.ai/**`, `.claude/**`, `.codex/hooks/**`, `scripts/agent/**` | in-progress | 2026-07-16 |

## 규칙 (정본: docs/agent/collaboration-protocol.md)

- 한 파일에는 한 시점에 한 에이전트만 writer가 된다 (single-writer-per-file).
- 다른 에이전트가 소유한 파일은 읽을 수 있지만 수정하지 않는다.
- 작업을 시작할 때 행을 추가하고, 끝낼 때 Status를 done으로 바꾸거나 행을 삭제한다.
- `Updated at`이 오래된(다른 브랜치 HEAD 기준 3일 이상) in-progress 행은 stale로 간주 — 사람에게 확인 후 해제한다.
