---
name: logh7-verify
description: Verify current LOGH7 changes with fresh, reproducible commands and the repository verification matrix. Use before completion claims, after implementation, or when auditing whether reported evidence still matches the working tree.
---

# LOGH7 Verify

Treat verification as fresh evidence, not confidence language.

## Workflow

1. Read `.ai/task.md`, inspect the current scoped diff, and load `docs/agent/prompt-pack.md` section `Prompt: 검증` plus `docs/agent/verification.md` and `docs/agent/lifecycle-testing.md`.
2. Map every changed file and acceptance criterion to the required checks. Start with `bash scripts/agent/verify-changes.sh --file <path>` and use `--full` when the matrix requires it.
3. Run tests from the documented working directory. Capture the command, exit code, and essential result.
4. Distinguish `PASS`, `FAIL`, and `NOT RUN`. Never present historical metrics as a fresh gate.
5. For client-visible changes, require current live evidence. For hook or skill changes, exercise the actual payload/protocol and skill validator rather than relying on syntax checks alone.
6. Review `git diff --check`, unexpected files, and documentation/state freshness.

## Output

Report a verification ledger tied to acceptance criteria, including failed or unrun checks and the exact remaining blocker. Do not weaken, delete, or skip failing tests.
