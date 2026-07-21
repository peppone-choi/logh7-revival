# Work Ownership

| Agent | Task | Branch/worktree | Owned files | Status | Updated at |
|---|---|---|---|---|---|
| Grok (main) | Ultragoal standing backlog Batch #1 (plan standing-backlog-win-native G001–G008) | peppone-choi/sole @ d10143e7 | `.ai/**`, batch-related `server/**` `tools/live/**` `docs/logh7-*.md`, `.omc/ultragoal/plans/standing-backlog-win-native/**`, live evidence dirs | in_progress | 2026-07-21 |
| — (stale release) | Wave-1 인과 원장 A02/A04/A06/A09/A13 | merged main | — | done | 2026-07-21 |
| Codex (root; 소유 해제) | A01 인과 원장 스키마·분류·누락 검출기 (#217 / LOGH7-214) | PR #233 merged `43ee007a` | — | done | 2026-07-20 |
| — (stale release) | P0 게이트 43·47 완료; 45/44/46 Wine-후속 | PR #174 merged | — | done / Wine-blocked | 2026-07-21 |
| Claude Code (메인+서브에이전트, 2026-07-17 사용자 승인으로 Codex에서 인수) | 상태 정합성 복구 | codex/state-consistency-recovery | — (소유 해제; 외부 manifest 적용 확인·상태 종결, 전달은 승인 사슬로 진행) | done | 2026-07-17 |
| Codex (root) | 플랫폼 분기 하네스 라이브 확인·배포 | codex/platform-aware-live-qa | — (소유 해제; PR #171 merge `a8420b8b`) | done | 2026-07-17 |
| Codex (root) | 실행 환경별 레거시 클라이언트 라이브 QA 하네스(Codex+Claude) | codex/platform-aware-live-qa | — (소유 해제) | done | 2026-07-17 |
| Claude Code (메인+서브에이전트) | Claude Code 사용자 매뉴얼 레포 맞춤 개작 + 루트 README 신설 + 배포 방침 문서화(ADR-LITE-006) + 사용자 승인 merge | codex/codex-user-manual | — (소유 해제) | done | 2026-07-17 |
| Codex (root) | Codex AI 자동 업무 관리 시스템 사용자 매뉴얼 작성 | current workspace | — (소유 해제) | done | 2026-07-17 |
| Codex (root) | Codex-native Claude automation parity and project-scoped skills.sh acquisition | codex/codex-harness-parity | — (소유 해제; `CLAUDE.md`와 `.codex/config.toml`의 동시 변경은 미수정) | done | 2026-07-17 |
| Claude Code (메인) | Agent OS 부트스트랩 | feat/ai-work-system (베이스라인 커밋 34b4b36d) | — (소유 해제) | done | 2026-07-16 |
| Claude Code (메인+서브에이전트) | AI 업무 시스템 고도화 (`.ai/task.md` DONE, 계획 `.omc/plans/logh7-ai-work-system-plan.md`) — Phase 1+2 PR #6 `be6499a3`, Phase 3 SRV-CORR PR #8 `3fd847b1` merge 완료 | chore/phase3-closeout (종결 커밋만) | — (소유 해제; 종결 브랜치 push/PR 승인 대기) | done | 2026-07-16 |
| Claude Code (메인+서브에이전트) | 문서 전수 분해 티켓화(Jira LOGH7-9~92, GH #10~59) + 스킬 부트스트랩(bootstrap-skills.sh) | chore/backlog-ticketization | — (소유 해제; push/PR 승인 대기) | done | 2026-07-17 |
| — (stale) | LOGH7-58 유닛 스테이징·Warp | historical worktree | — | done/merged (live open under G002–G005) | 2026-07-21 |
| — (stale) | LOGH7-62/59/60 세션 라이프사이클 | historical | — | done/merged | 2026-07-21 |

## 규칙 (정본: docs/agent/collaboration-protocol.md)

- 한 파일에는 한 시점에 한 에이전트만 writer가 된다 (single-writer-per-file).
- 다른 에이전트가 소유한 파일은 읽을 수 있지만 수정하지 않는다.
- 작업을 시작할 때 행을 추가하고, 끝낼 때 Status를 done으로 바꾸거나 행을 삭제한다.
- `Updated at`이 오래된(다른 브랜치 HEAD 기준 3일 이상) in-progress 행은 stale로 간주 — 사람에게 확인 후 해제한다.
