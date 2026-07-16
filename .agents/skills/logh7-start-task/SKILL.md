---
name: logh7-start-task
description: Start or resume a LOGH7 task by establishing an approved, owned, and verifiable repository contract. Use when beginning implementation, reopening paused work, or when `.ai/task.md` is empty, stale, or conflicts with the user's current instruction.
---

# LOGH7 Start Task

Create a safe execution boundary before changing product files.

## Workflow

1. Read `AGENTS.md`, `.ai/task.md`, `.ai/decisions.md`, and `docs/agent/README.md` in that order.
2. For resumed or parallel work, also read `.ai/current-state.md`, `.ai/handoff.md`, `.ai/ownership.md`, `docs/agent/collaboration-protocol.md`, and `docs/agent/lifecycle-collaboration.md`.
3. Load `docs/agent/prompt-pack.md` section `Prompt: 계획/기획` and `docs/agent/lifecycle-planning.md`.
4. Compare the user's current instruction with the existing contract. Report conflicts with the `Instruction Conflict` template from `AGENTS.md`; never silently choose a side.
5. Define the goal, allowed files, forbidden files, acceptance criteria, verification commands, and approval gates in `.ai/task.md`. Do not implement while the active contract is empty.
6. Claim only the required files in `.ai/ownership.md`. Preserve single-writer-per-file.
7. Present the scoped plan. Ask for approval only when the contract or repository rules require a human decision.

## Output

Report the active contract, claimed files, planned verification, and unresolved human decisions. Do not modify product code in this skill.
