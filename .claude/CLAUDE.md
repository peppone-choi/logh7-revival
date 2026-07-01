<!-- OMC:START -->
<!-- OMC:VERSION:4.14.6 -->

# oh-my-claudecode - Intelligent Multi-Agent Orchestration

You are running with oh-my-claudecode (OMC), a multi-agent orchestration layer for Claude Code.
Coordinate specialized agents, tools, and skills so work is completed accurately and efficiently.

<operating_principles>
- Delegate specialized work to the most appropriate agent.
- Prefer evidence over assumptions: verify outcomes before final claims.
- Choose the lightest-weight path that preserves quality.
- Consult official docs before implementing with SDKs/frameworks/APIs.
</operating_principles>

<delegation_rules>
Delegate for: multi-file changes, refactors, debugging, reviews, planning, research, verification.
Work directly for: trivial ops, small clarifications, single commands.
Route code to `executor` (use `model=opus` for complex work). Uncertain SDK usage -> `document-specialist` (repo docs first; Context Hub / `chub` when available, graceful web fallback otherwise).
</delegation_rules>

<model_routing>
`haiku` (quick lookups), `sonnet` (standard), `opus` (architecture, deep analysis).
Direct writes OK for: `~/.claude/**`, `.omc/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`.
</model_routing>

<skills>
Invoke via `/oh-my-claudecode:<name>`. Trigger patterns auto-detect keywords.
Tier-0 workflows include `autopilot`, `ultrawork`, `ralph`, `team`, and `ralplan`.
Keyword triggers: `"autopilot"->autopilot`, `"ralph"->ralph`, `"ulw"->ultrawork`, `"ccg"->ccg`, `"ralplan"->ralplan`, `"deep interview"->deep-interview`, `"deslop"`/`"anti-slop"`->ai-slop-cleaner, `"deep-analyze"`->analysis mode, `"tdd"`->TDD mode, `"deepsearch"`->codebase search, `"ultrathink"`->deep reasoning, `"cancelomc"`->cancel.
Team orchestration is explicit via `/team`.
Detailed agent catalog, tools, team pipeline, commit protocol, and full skills registry live in the native `omc-reference` skill when skills are available, including reference for `explore`, `planner`, `architect`, `executor`, `designer`, and `writer`; this file remains sufficient without skill support.
</skills>

<verification>
Verify before claiming completion. Size appropriately: small->haiku, standard->sonnet, large/security->opus.
If verification fails, keep iterating.
</verification>

<execution_protocols>
Broad requests: explore first, then plan. 2+ independent tasks in parallel. `run_in_background` for builds/tests.
Keep authoring and review as separate passes: writer pass creates or revises content, reviewer/verifier pass evaluates it later in a separate lane.
Never self-approve in the same active context; use `code-reviewer` or `verifier` for the approval pass.
Before concluding: zero pending tasks, tests passing, verifier evidence collected.
</execution_protocols>

<hooks_and_context>
Hooks inject `<system-reminder>` tags. Key patterns: `hook success: Success` (proceed), `[MAGIC KEYWORD: ...]` (invoke skill), `The boulder never stops` (ralph/ultrawork active).
Persistence: `<remember>` (7 days), `<remember priority>` (permanent).
Kill switches: `DISABLE_OMC`, `OMC_SKIP_HOOKS` (comma-separated).
</hooks_and_context>

<cancellation>
`/oh-my-claudecode:cancel` ends execution modes. Cancel when done+verified or blocked. Don't cancel if work incomplete.
</cancellation>

<worktree_paths>
State: `.omc/state/`, `.omc/state/sessions/{sessionId}/`, `.omc/notepad.md`, `.omc/project-memory.json`, `.omc/plans/`, `.omc/research/`, `.omc/logs/`
</worktree_paths>

## Setup

Say "setup omc" or run `/oh-my-claudecode:omc-setup`.

<!-- OMC:END -->

<!-- LOGH7-SKILLS:START (project skills outside the OMC-managed block so OMC updates won't clobber) -->
## LOGH VII Canonical Repos (2026-06-28)

All work must land in the canonical repos:
- Server, simulation, wire, content, and auth work -> `server/` (`server/src/server`, `server/content`, `server/tests`).
- Client, packaging, launcher, localization, assets, and remaster work -> `client/` or the active RE/client tooling path when explicitly scoped.
- RE/live tools -> `RE/tools` plus `.omo` work data. Root `src/tools/tests` and `RE/src` migration duplicates are not canonical edit targets.

Live client authority:
- Installed canonical playable EXE SHA256: `bc5e932212e790981c648c7b60acfbba06c0fdd5b8d7f583ef123fac71b098ad`.
- Run `RE/tools/logh7_ui_explorer.py` from `RE/` with `--server-root ..\server`.
- Start/login windowed by default; switch later with `display --mode borderless` when needed.
- Never blanket-kill `node.exe`; use `ui_explorer stop`, and only terminate verified game/session PIDs.
- Keep `LOGH_PRESEED_PLAYER_CHAR` off unless an isolated bypass diagnostic explicitly requires it.
- Always stop and require `shaVerified:true` before claiming live verification.

## LOGH VII Skill Suite

Six project skills live in `.claude/skills/` and `.codex/skills/`:
- **logh7-live**: real D3D8 client verification through `ui_explorer`.
- **logh7-patch**: byte-verified EXE patch building.
- **logh7-re**: Ghidra/redex decompile queries from `RE/`.
- **logh7-wire**: RE-confirmed wire record building and decoding.
- **logh7-extract**: canonical content recovery from original assets.
- **logh7-localize**: Korean localization, font, and string work.

Standard loop: `logh7-re` -> `logh7-wire`/`logh7-patch` -> `logh7-live` verification. Tag data P0/P1/P2/P3 and document every action in the active loop/session doc.
<!-- LOGH7-SKILLS:END -->
