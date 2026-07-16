---
name: logh7-implement
description: Implement an approved LOGH7 feature, fix, or harness change through the repository's ownership, testing, verification, review, and state gates. Use only when `.ai/task.md` authorizes the requested files and acceptance criteria.
---

# LOGH7 Implement

Make the smallest authorized change and leave reproducible evidence.

## Workflow

1. Confirm the active contract, approved decisions, allowed files, and `.ai/ownership.md` claim before editing.
2. Load `docs/agent/prompt-pack.md` section `Prompt: 기능 구현`, the routed lifecycle runbook, `docs/agent/coding-rules.md`, and `docs/agent/verification.md`.
3. For features or bug fixes, create a focused failing test first and observe the intended failure. For documentation or harness-only changes, define an equivalent executable regression check.
4. Implement minimally. Preserve unrelated dirty files, protected data, and other agents' ownership.
5. Run the changed-file verification matrix, then review `git diff --check`, the scoped diff, and unexpected generated files.
6. Update current documentation rather than adding a progress-log layer. Refresh `.ai/current-state.md`, `.ai/handoff.md`, and `.ai/ownership.md` before completion.
7. Never claim live client behavior without fresh live evidence. Never push, open a PR, merge, or rewrite history without user approval.

## Completion Report

List changed files, each command and exit code, checks not run, remaining work, and required human decisions.
