<!-- Imported from Claude Code: E:/logh7-revival/.claude/CLAUDE.md -->

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
Route code to `executor` (use `model=opus` for complex work). Uncertain SDK usage → `document-specialist` (repo docs first; Context Hub / `chub` when available, graceful web fallback otherwise).
</delegation_rules>

<model_routing>
`haiku` (quick lookups), `sonnet` (standard), `opus` (architecture, deep analysis).
Direct writes OK for: `~/.claude/**`, `.omc/**`, `.claude/**`, `CLAUDE.md`, `AGENTS.md`.
</model_routing>

<skills>
Invoke via `/oh-my-claudecode:<name>`. Trigger patterns auto-detect keywords.
Tier-0 workflows include `autopilot`, `ultrawork`, `ralph`, `team`, and `ralplan`.
Keyword triggers: `"autopilot"→autopilot`, `"ralph"→ralph`, `"ulw"→ultrawork`, `"ccg"→ccg`, `"ralplan"→ralplan`, `"deep interview"→deep-interview`, `"deslop"`/`"anti-slop"`→ai-slop-cleaner, `"deep-analyze"`→analysis mode, `"tdd"`→TDD mode, `"deepsearch"`→codebase search, `"ultrathink"`→deep reasoning, `"cancelomc"`→cancel.
Team orchestration is explicit via `/team`.
Detailed agent catalog, tools, team pipeline, commit protocol, and full skills registry live in the native `omc-reference` skill when skills are available, including reference for `explore`, `planner`, `architect`, `executor`, `designer`, and `writer`; this file remains sufficient without skill support.
</skills>

<verification>
Verify before claiming completion. Size appropriately: small→haiku, standard→sonnet, large/security→opus.
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

<!-- LOGH7-SKILLS:START (project skills — outside the OMC-managed block so OMC updates won't clobber) -->
## LOGH VII Skill Suite (bound to this harness)

Six project skills live in `.claude/skills/` (standard SKILL.md format → auto-discovered + model-invocable via the Skill tool; also `/logh7-<name>` via `.claude/commands/`). They encode the proven, hard-won procedures (and the traps) of this codebase — route LOGH VII reverse-engineering / implementation work to them instead of improvising.

- **logh7-live** — drive + verify the real D3D8 client (`ui_explorer`). ⚠️ wait ~30s for the BOTHTEC splash before driving, kill stale node first. Keywords: `라이브검증`, `실클라`, `ui_explorer`, `trace`, `스크린샷`.
- **logh7-patch** — encode → byte-verify → build EXE patches (prologue detour into the one safe 48B int3 cave; never the referenced .text-end slack). Keywords: `바이트패치`, `EXE 패치`, `code-cave`, `detour`.
- **logh7-re** — query the Ghidra decompile index via `tools/logh7_redex.py`; confirm convention/offset before acting. Keywords: `RE로 확인`, `decompile`, `FUN_00`, `어디서 쓰는지`.
- **logh7-wire** — build/decode server wire records at RE-confirmed (client-parser) offsets. Keywords: `와이어`, `0x0323`, `레코드 빌더`, `byte offset`.
- **logh7-extract** — recover content from MDX/TCF/BMP/PDF (incl. the page-101 星系図 vector dots + Y-flip lesson). Keywords: `추출`, `MDX`, `TCF`, `星系図`, `에셋`.
- **logh7-localize** — Korean localization (cp949 / UTF-16LE .rsrc / single global font face) + humanizer for natural Korean. Keywords: `한글화`, `현지화`, `폰트`, `메뉴 일어`, `humanizer`.

They compose: the standard loop is **logh7-re → logh7-wire/logh7-patch → logh7-live (verify)** per `docs/logh7-loop-engineering.md`. Always tag data P0/P1/P2/P3 and verify live before claiming any client-facing result. The deterministic multi-cycle driver is `/logh7-loop` (+ the `logh7-*` Workflow scripts in `.claude/workflows/`).
<!-- LOGH7-SKILLS:END -->

<!-- End imported from Claude Code: E:/logh7-revival/.claude/CLAUDE.md -->
