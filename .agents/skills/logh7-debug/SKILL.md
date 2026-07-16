---
name: logh7-debug
description: Diagnose a LOGH7 runtime, build, test, protocol, or harness failure from reproducible evidence before proposing a minimal fix. Use whenever behavior is broken, flaky, unexpected, or a previous repair attempt failed.
---

# LOGH7 Debug

Find the root cause before editing the symptom.

## Workflow

1. Read the active task, decisions, current state, handoff, and relevant routed runbook.
2. Load `docs/agent/prompt-pack.md` section `Prompt: 근본 원인 디버깅`, `docs/agent/failure-cases.md`, and `docs/agent/verification.md`.
3. Reproduce the failure with the smallest command. Record exact input, output, exit code, and environment assumptions without exposing secrets.
4. Trace backward from the failure boundary. Form one falsifiable hypothesis at a time and run the cheapest discriminating test.
5. After three failures with the same symptom or two passes without new evidence, stop repeating the approach and report the blocker.
6. If the user requested a fix, add a regression test, implement the smallest causal repair, and rerun both the reproducer and affected verification matrix. If the user requested diagnosis only, do not edit.

## Output

State the root cause with evidence, rejected hypotheses, fix scope if authorized, fresh verification, and remaining uncertainty.
