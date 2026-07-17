<!-- This card is injected every turn. Refresh when roadmap, known-issues, or task.md changes. -->
# LOGH VII Key Facts (NIAH)

## Active contract
- State consistency recovery is closing on `codex/state-consistency-recovery` (base `main@a8420b8b`); ownership moved Codex→Claude Code on 2026-07-17 with user approval.
- External manifest is APPLIED and read-back verified (LOGH7-43 title+comment, LOGH7-18 comment, GitHub #10 title+comment, 10:53 KST); zero Jira transitions; Obsidian not executed (LOGH7_VAULT_DIR unset).
- Remaining delivery: local commit → push → PR → merge under the 2026-07-17 approval chain; force push and main direct commit stay forbidden.
- Next contract (user-selected): LOGH7-43 P0 fresh evidence via native Windows live run. Preserve the user-owned `.codex/config.toml` edit — do not read, modify, or stage it.

## Current product gate
- M0.5/M1/M2/M3 are historical completions; current order is P0 → P1 → P2 before M4.
- macOS Wine reached server 47900 and a real client process, then ended at `invalid-credentials`/login-ng with client exit 3.
- Successful login/gameplay, native Windows·Linux live runs, post-fix live cleanup, the latest full Wine suite, and run9 tracked exact-hash evidence remain unverified.
- Do not claim a cross-platform full pass. P1 proxy/Frida/server correlation and P2 parser/cache/root/FSM remain open.
- Server-side SRV-CORR is complete in PR #8 (`3fd847b1`); it is not the missing three-surface live join.

## Work tracking
- Jira snapshot: 188 open issues (`LOGH7-9`~`LOGH7-196`), all To Do/Medium/unassigned; no issue is In Progress.
- PR #171 does not directly close or mention a Jira/GitHub issue. LOGH7-43 ↔ GitHub #10 remains open and only partially overlaps the merged harness.
- `agents/commit-push-and-verify-next-steps@0b9c324d` is 226 behind/1 ahead and dirty; treat it as read-only protected state, not a product baseline.

## Invariants
- Server port: 47900.
- Native Windows runs the verified EXE directly; macOS/Linux use an isolated explicit `win32|wow64` Wine prefix. Other hosts block.
- Never launch, attach, or patch when EXE hash, image base, or sentinels mismatch.
- Commit `5bd249c` is reference-only. Do not transplant reference code or arbitrarily convert CP932 assets.
- Never claim live behavior without fresh command output, exit codes, screenshots, or equivalent evidence.
- Secrets stay user-managed and must not be read or printed.
