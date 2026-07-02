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

## LOGH VII Current Startup Rule

For LOGH VII planning or development, start from these three current documents only:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-internal-validation-plan.md`

Then use `docs/logh7-document-index-current.md` to decide which older docs are current references, evidence, superseded, or archive references. Do not treat old handoffs or status docs as current guidance unless the current docs point to them.

At the end of every work unit, update documentation automatically: add new requirements/evidence, modify changed guidance, prune stale duplicate entries, and delete or retire invalid current-path guidance. Apply this to the three current docs, the document index, `AGENTS.md`, root `CLAUDE.md`, and `.claude/CLAUDE.md` when startup or workflow rules change.

Normal runtime boundaries: operator starts the Docker Compose server path; player starts the launcher path. `ui_explorer`, direct `G7MTClient.exe`, direct Node commands, preseed flags, and trace tools are diagnostics only, not normal player/operator workflow.

Use matching skills before ad hoc work. CodeGraph is mandatory first for code location, call-path, subsystem, and blast-radius questions when `.codegraph/` exists; confirm exhaustive answers with `rg` or direct reads. Use `find-skills` when a needed capability is missing.

Do not burn tokens repeating blocked routes. After three same-symptom failures or two no-new-evidence investigation paths, pivot or write a concise blocker report with evidence and the next different strategy.

Keep server, web/community, tests, documentation, and Docker Compose service work developable on macOS. Original D3D8 client live QA remains Windows-only; macOS developers should use Docker Desktop or OrbStack for service work.

## LOGH VII Skill Install, Remastering, and Modding Addendum

- If a matching skill is not installed in the active environment, attempt installation at development start with `find-skills` or `npx skills add <owner/repo@skill> -y`; if install fails, record command/output and fallback path.
- Remastering and modding are first-class planning tracks.
- Original assets stay canonical fallback.
- Remaster/mod packs must be optional, reversible, manifest-driven, provenance-labeled, and conflict-checked.
- Public mod distribution is later scope.
- Installed helpers: `image-upscaling`, `game-assets`, `game-3d-assets`, `game-engine`, `multiplayer-game`, `pdf`, `smart-ocr`, `meshy-3d-generation`. Use as sourcebook/remaster/prototype/pattern aids only; LOGH7 evidence and skills remain authority.

<!-- LOGH7-SKILLS:START (project skills outside the OMC-managed block so OMC updates won't clobber) -->
## LOGH VII Canonical Repos (2026-06-28)

All work must land in the canonical repos:
- Server, simulation, wire, content, and auth work -> `server/` (`server/src/server`, `server/content`, `server/tests`).
- Client, packaging, launcher, localization, assets, and remaster work -> `client/` or the active RE/client tooling path when explicitly scoped.
- RE/live tools -> `RE/tools` plus `.omo` work data. Root `src/tools/tests` and `RE/src` migration duplicates are not canonical edit targets.

Live client authority:
- The canonical installed playable EXE's SHA256 changes with nearly every build/patch pass — do NOT trust
  a hardcoded hash value written in any doc (including prior versions of this file) as current fact. Before
  a live session, capture it fresh: `Get-FileHash .omo/work/logh7-installed/exe/G7MTClient.exe -Algorithm
  SHA256`. `ui_explorer stop` self-verifies `shaVerified:true` against the hash it captured at `start` time,
  which is the only trustworthy in-session check — a hardcoded doc value is not evidence of drift or
  corruption on its own (as of 2026-07-02: `3b4f634818ff0d2b2f59eb6ddacbe73c9bcbc9cda146b9cfdb9c5d1cb7b98573`,
  already stale by the next build).
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

<!-- CODEGRAPH_START -->
## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tool** (when available): `codegraph_explore` answers most code questions in one call — the relevant symbols' verbatim source plus the call paths between them, including dynamic-dispatch hops grep can't follow. Name a file or symbol in the query to read its current line-numbered source. If it's listed but deferred, load it by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` prints the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.
<!-- CODEGRAPH_END -->
