---
name: logh7-analyze
description: Analyze LOGH7 behavior, source evidence, protocols, binaries, or architecture without changing repository files. Use for feasibility studies, evidence gathering, codebase orientation, and questions that should end in findings rather than implementation.
---

# LOGH7 Analyze

Produce evidence-backed findings while keeping the repository unchanged.

## Workflow

1. Read the active task and decisions, then route through `docs/agent/README.md` instead of loading every document.
2. Load `docs/agent/prompt-pack.md` section `Prompt: 기능 분석` and the relevant domain section: `RE 도메인`, `프로토콜 도메인`, `한글화 도메인`, or `라이브QA 도메인`.
3. Prefer current canonical documents over historical paths. Label observations as `Verified`, `Inferred`, or `Unknown`.
4. Inspect code, tests, binary evidence, logs, or packet traces using read-only commands. Never promote an inference to fact without fresh evidence.
5. Stop after the same symptom fails three times or two investigation passes add no evidence. Change approach and report the blocker.
6. Separate root facts, hypotheses, risks, and the smallest next experiment.

## Output

Return concise findings with file paths or commands that support them, confidence labels, and recommended next actions. Do not edit files unless the user changes the task to implementation.
