# Current State

- Updated at: 2026-07-17
- Active agent: Codex (root)
- Branch: `codex/codex-harness-parity` (base `chore/backlog-ticketization` at `07f06746`)
- Current phase: Codex-native Claude harness parity implementation complete; final repository verification and user `/hooks` trust remain.
- Implemented: native `.codex/hooks.json` routing for `apply_patch`, protected-file enforcement, changed-file verification, git-root and hook-input `cwd` resolution, per-session `.codex/state`, document/NIAH stop gate, and project-open skill checks.
- Workflow skills: `.agents/skills/logh7-{start-task,analyze,implement,debug,verify,review,checkpoint,skill-manager}`. Each is a thin entry point into the shared prompt pack and runbooks.
- skills.sh policy: SessionStart performs local `--check` only. On demand, `logh7-skill-manager` vets a candidate and calls `bootstrap-skills.sh --install <owner/repo> --skill <name> --reviewed`; the wrapper fixes Codex project scope and rejects global flags, option injection, traversal, and overwrite.
- Fresh verification: Codex regression 26/26 exit 0; Shell/JSON syntax exit 0; skill validator 8/8 exit 0; cached official skills CLI found all eight as `scope=project` and Codex-compatible; `codex --strict-config --version` exit 0 (`codex-cli 0.144.5`).
- Known baseline: `bootstrap-skills.sh --strict` exits 1 because the pre-existing Claude `logh7-orchestrator` copy is STALE. `skills-lock.json` also reports historical stale paths for `humanize` and `humanize-redo`. No automatic overwrite was performed.
- Preserved concurrent changes: `CLAUDE.md` and `.codex/config.toml` were not edited or included in this task.
- Human checkpoint: open `/hooks`, trust the new project hook hash, then start a new Codex task and confirm SessionStart plus native hook activation. Push/PR/merge remain approval-gated.
- Next product task remains LOGH7-49 / M4-OBS-001 after a new human-approved `.ai/task.md` contract.
