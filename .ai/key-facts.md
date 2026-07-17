<!-- This card is injected every turn. Refresh when roadmap, known-issues, or task.md changes. -->
# LOGH VII Key Facts (NIAH)

## Active contract
- Active: P0 gate bundle LOGH7-43/44/45/46/47 (story LOGH7-18 / epic LOGH7-9, GitHub #10-14) — approved 2026-07-17 "정정 후 구현 승인". Implement order: 47→43→45→44→46.
- State recovery is DELIVERED: PR #172 merged `4f8c4281` (12:20 KST). External manifest applied+read-back; review workflow failure is an action-internal error, not a pass.
- Live-run gates: lineage fail-closed (EXE hash·image base·sentinel), server 47900, evidence (screenshots/logs/exit codes/cleanup receipt) required before any completion claim.
- Preserve the user-owned `.codex/config.toml` edit. Do not read, modify, or stage it. Never git-reset the working tree.

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
- P0 gate bundle is ACTIVE; push/PR/merge, Jira/GitHub writes, and live real-hardware runs each need separate approval.

## Invariants
- Server port: 47900.
- Native Windows runs the verified EXE directly; macOS/Linux use an isolated explicit `win32|wow64` Wine prefix. Other hosts block.
- Never launch, attach, or patch when EXE hash, image base, or sentinels mismatch.
- Commit `5bd249c` is reference-only. Do not transplant reference code or arbitrarily convert CP932 assets.
- Never claim live behavior without fresh command output, exit codes, screenshots, or equivalent evidence.
- Secrets stay user-managed and must not be read or printed.
