---
name: logh7-review
description: Review LOGH7 diffs for correctness, regressions, security, contract drift, and missing evidence without modifying files. Use for pre-landing review, independent verification, or when asked to assess another agent's work.
---

# LOGH7 Review

Perform a read-only, evidence-first review.

## Workflow

1. Read the task contract, approved decisions, ownership, and the scoped diff.
2. Load `docs/agent/prompt-pack.md` section `Prompt: 코드 리뷰`, `docs/agent/lifecycle-review.md`, `docs/agent/coding-rules.md`, and `docs/agent/verification.md`.
3. Check behavior against acceptance criteria and executable configuration before copying repository patterns.
4. Prioritize correctness, data loss, security, protocol compatibility, and missing regression coverage. Verify suspected issues with the smallest read-only command.
5. Separate actionable findings from questions and non-blocking suggestions. Do not report style preferences as defects.
6. If no issue remains, state that explicitly and name residual testing or environment risks.

## Output

Lead with findings ordered by severity. For each finding, include a tight file/line location, impact, and evidence. Do not edit files unless the user separately authorizes fixes.
