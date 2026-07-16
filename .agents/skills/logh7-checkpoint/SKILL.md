---
name: logh7-checkpoint
description: Record a resumable LOGH7 checkpoint with verified state, ownership, decisions, and next steps. Use before ending a session, pausing work, handing work to another agent, or after a material task transition.
---

# LOGH7 Checkpoint

Leave enough current state for a new agent to resume without conversation history.

## Workflow

1. Load `docs/agent/prompt-pack.md` section `Prompt: 작업 인수인계`, `docs/agent/lifecycle-collaboration.md`, and `docs/agent/collaboration-protocol.md`.
2. Inspect the current diff and recent verification. Do not convert assumptions into facts.
3. Update `.ai/current-state.md` with the active branch, phase, verified results, open blockers, and immediate next action.
4. Update `.ai/handoff.md` with completed work, exact commands and exit codes, files in flight, and restart instructions.
5. Record only human-approved durable choices in `.ai/decisions.md`.
6. Set `.ai/ownership.md` to `done` and release file ownership only when no required work remains; otherwise keep the precise in-progress claim.
7. Refresh current docs affected by the work. Remove stale guidance instead of appending a diary.

## Output

Report the checkpoint files changed, verified state, unrun checks, current owner, next action, and any human decision required.
