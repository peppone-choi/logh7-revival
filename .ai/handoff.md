# Agent Handoff

## Goal
Make the existing Claude automation and verification system directly usable by Codex, including safe project-scoped discovery and installation of missing skills from skills.sh.

## Current result
Implementation is complete on `codex/codex-harness-parity`. Codex now has native lifecycle hooks, eight repository workflow skills, project-open local skill checks, and an on-demand vetted skills.sh installation path. Local executable verification is green; live hook activation still requires the user's `/hooks` trust action in a new task.

## Decisions already made
- `.agents/skills/` is the canonical project skill directory; no `.codex/skills/` mirror and no global install.
- SessionStart never performs network search or installation. It runs `bootstrap-skills.sh --check || true` every project open.
- External installation requires source review plus the explicit `--reviewed` attestation. Existing project skills are not overwritten through this path.
- Claude Commands, Codex skills, and both native hook sets remain thin adapters over `docs/agent/` and `scripts/agent/`.
- `CLAUDE.md` and `.codex/config.toml` contain concurrent changes and were intentionally preserved.

## Files changed
- Codex hooks: `.codex/hooks.json`, `.codex/hooks/{protect-sensitive-files,inject-key-facts,verify-changes,turn-snapshot,stop-doc-gate}.sh`
- Project skills: `.agents/skills/logh7-{start-task,analyze,implement,debug,verify,review,checkpoint,skill-manager}/`
- Bootstrap/tests: `scripts/agent/{bootstrap-skills.sh,required-skills.tsv,test-codex-hooks.sh}`, `.gitignore`
- Contracts/docs/state: `AGENTS.md`, `docs/agent/{README,prompt-pack,tool-capabilities,verification,lifecycle-testing,context-strategy,collaboration-protocol}.md`, `.ai/{task,key-facts,current-state,handoff,known-issues,ownership}.md`

## Commands executed and verification result
- `bash scripts/agent/test-codex-hooks.sh` → 26 passed, 0 failed, exit 0.
- `bash -n scripts/agent/bootstrap-skills.sh scripts/agent/test-codex-hooks.sh .codex/hooks/*.sh` → exit 0.
- `python3 .../skill-creator/scripts/quick_validate.py .agents/skills/<each-new-skill>` → 8/8 valid, exit 0.
- cached official skills CLI `list --json` → exit 0; all eight new skills reported `scope: project` and Codex compatibility.
- `bash scripts/agent/bootstrap-skills.sh --check` → exit 0, `OK=25 MISSING=0 STALE=1`; candidates are informational.
- `bash scripts/agent/bootstrap-skills.sh --strict` → exit 1 from the pre-existing Claude `logh7-orchestrator` STALE copy; not caused or overwritten by this task.
- `codex --strict-config --version` plus hooks JSON parse → exit 0; CLI 0.144.5. PATH alias creation emitted a sandbox warning only.

## Failed approaches and recovery
- Initial skill scaffolding was denied because `.agents/skills` was sandbox-read-only; the approved project-only escalation created all eight with the official initializer.
- A multi-file skill patch exceeded edit-tool diagnostics time after four files; the remaining files were patched individually and all eight validators pass.
- Bash LSP diagnostics timed out after hook edits; fresh `bash -n` and behavioral payload tests replaced that diagnostic and pass.
- Direct `npx --yes skills list --json` did not return a usable exit/output in the tool wrapper during final verification. Running the same cached official skills CLI directly returned exit 0 and complete project discovery JSON.

## Remaining work
- User: run `/hooks`, trust the project hook hash, and verify the hooks are active in a new Codex task.
- Optional human decision: choose the canonical `logh7-orchestrator` version and whether to repair the two historical `skills-lock.json` paths; these pre-existing issues keep `--strict` red.
- Push, PR, merge, and commit were not performed.

## Files to read first
`.ai/task.md`, `.ai/current-state.md`, `.ai/known-issues.md`, `AGENTS.md`, `docs/agent/tool-capabilities.md`, `scripts/agent/test-codex-hooks.sh`.
