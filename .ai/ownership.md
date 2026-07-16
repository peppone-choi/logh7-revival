# Work Ownership

| Agent | Task | Branch/worktree | Owned files | Status | Updated at |
|---|---|---|---|---|---|
| Claude Code (메인) | Agent OS 부트스트랩 | feat/ai-work-system (베이스라인 커밋 34b4b36d) | — (소유 해제) | done | 2026-07-16 |
| Claude Code (메인+서브에이전트) | AI 업무 시스템 고도화 (`.ai/task.md` DONE, 계획 `.omc/plans/logh7-ai-work-system-plan.md`) — Phase 1+2 PR #6 `be6499a3`, Phase 3 SRV-CORR PR #8 `3fd847b1` merge 완료 | chore/phase3-closeout (종결 커밋만) | — (소유 해제; 종결 브랜치 push/PR 승인 대기) | done | 2026-07-16 |
| Claude Code (메인+서브에이전트) | 문서 전수 분해 티켓화(Jira LOGH7-9~92, GH #10~59) + 스킬 부트스트랩(bootstrap-skills.sh) | chore/backlog-ticketization | — (소유 해제; push/PR 승인 대기) | done | 2026-07-17 |

## 규칙 (정본: docs/agent/collaboration-protocol.md)

- 한 파일에는 한 시점에 한 에이전트만 writer가 된다 (single-writer-per-file).
- 다른 에이전트가 소유한 파일은 읽을 수 있지만 수정하지 않는다.
- 작업을 시작할 때 행을 추가하고, 끝낼 때 Status를 done으로 바꾸거나 행을 삭제한다.
- `Updated at`이 오래된(다른 브랜치 HEAD 기준 3일 이상) in-progress 행은 stale로 간주 — 사람에게 확인 후 해제한다.
