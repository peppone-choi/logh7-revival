<!-- OMC:START -->

2026-07-04 G071 G070 삭제 후속 회귀정리(dual-write 제거, 테스트 180/180 회복) + P0-03 cp932 한글채팅 패치 스크립트(`RE/tools/logh7_chat_cp932_korean_patch.py`, VA 0x76e3fc 9바이트 동일길이 치환, 미적용/드라이런만 검증). 상세는 루트 `CLAUDE.md` 동일 날짜 항목.

2026-07-04 G070 Unity 클라이언트 완전 삭제: `client-unity/` 작업트리 제거(커밋 `dbf3b43` 보존 → `ca24dd3` 제거). 상세는 루트 `CLAUDE.md` 동일 날짜 항목.

2026-07-04 G069 방향 전환(사용자 명시적 재오픈): Unity 경로 잠정 중단, **레거시 클라이언트(`G7MTClient.exe`) 직접 수정을 현재 주 경로로 재개**. RE 완료 후 Unity 재이식이 장기 목표. 재개 전 재점검 필요: C002, cp932 한글 채팅 인코딩, 단일 패치 크래시 취약성. 상세는 루트 `CLAUDE.md` 동일 항목.

2026-07-04 G068: 로비 게이트가 원본 spot 배경(EXE 기본 bg005, P0)+施設内ロビー 패널(P1)+실서버 `/api/lobby` 슬롯으로 렌더(fileCount 17, 회귀 195/195, 증거 `g068-player-lobby-original-bg-20260704.png`).

2026-07-04 G067: 원본 로그인 화면에서 실서버(`serve:session`) 로그인 E2E 검증(ok+token만 게이트 전진, 원본 상태 문자열 P0). 오라클 반증: 설치본 클라는 부트 로고 스플래시 미표시 → 로고 시퀀스 슬라이스 보류. 회귀 194/194.

2026-07-04 G066 원본 로그인 화면 픽셀 패러티: Unity 로그인 이전 게이트는 원본 `title.tga` 디코드 배경(`export:original-ui-images`, StreamingAssets fileCount 16) 위 원본 좌표 위젯으로 렌더된다. 증거 `.omo/ulw-loop/evidence/g066-player-legacy-login-20260704.png`. 이후 씬도 동일한 원본-화면-재현 방식으로 전환한다.

2026-07-04 G048 Unity scene-panel manifest slice: panel text is now loaded from `logh7-unity-scene-surface-panels.json`, not hardcoded in C#; StreamingAssets export fileCount is 15 and canonical promotion remains blocked.

2026-07-04 Unity scene-panel slice: current Unity player builds and shows 10 distinct scene catalog surface panels; evidence contact sheet is `.omo/ulw-loop/evidence/g047-scene-panel-surfaces-compact-20260704/contact-sheet.png`. Treat as development surface only; canonical promotion remains blocked.
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

Apply `.omo/rules/logh7-capability-harness.md` after reading the three current entrypoint docs. The harness routes matched LazyCodex/OMO, Superpowers, gstack, LOGH7, CodeGraph/LSP/Git Bash/ast-grep, and Compound Engineering capabilities, but it does not change normal runtime boundaries.

For LOGH VII planning or development, start from these three current documents only:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-internal-validation-plan.md`

Then use `docs/logh7-document-index-current.md` to decide which older docs are current references, evidence, superseded, or archive references. Do not treat old handoffs or status docs as current guidance unless the current docs point to them.

At the end of every work unit, update documentation automatically: add new requirements/evidence, modify changed guidance, prune stale duplicate entries, and delete or retire invalid current-path guidance. Apply this to the three current docs, the document index, `AGENTS.md`, root `CLAUDE.md`, and `.claude/CLAUDE.md` when startup or workflow rules change.

Update `docs/logh7-developer-dashboard.html` whenever status, release phase, scope, evidence, blockers, progress percentage, or remaining tasks change. The dashboard is derived from current docs and is not a fourth startup authority document.

Current normal development boundary: data/spec mining, gameplay-logic implementation, and Unity import/runtime are product path. Legacy client, launcher, ui_explorer, direct EXE launches, direct Node commands, preseed flags, and trace tools are oracle diagnostics only.

Current development objective (2026-07-03): prioritize asset/data mining and game-logic reimplementation over legacy-client modification. Treat the original client, Archive.org `https://archive.org/download/logh-7`, manuals, extracted resources, and traces as evidence/oracle inputs; build canonical data/spec pipelines and gameplay logic from them.

Current bootstrap commands: `npm --prefix server test`, `npm --prefix server run inventory:sources`, `npm --prefix server run catalog:mdx`, `npm --prefix server run catalog:null-galaxy`, `npm --prefix server run catalog:tcf`, `npm --prefix server run catalog:tcf-portraits`, `npm --prefix server run export:tcf-portraits -- --limit-per-archive 2`, and `npm --prefix server run verify:source`. `catalog:mdx` writes `server/content/generated/logh7-mdx-catalog.json`; `catalog:null-galaxy` writes `server/content/generated/logh7-null-galaxy-template.json`; `catalog:tcf` writes `server/content/generated/logh7-face-tcf-catalog.json`; `catalog:tcf-portraits` writes `server/content/generated/logh7-face-portrait-catalog.json`; `export:tcf-portraits` writes controlled BMP samples under `.omo/ulw-loop/evidence/tcf-portrait-bmp-sample/`; `inventory:sources` should find preserved installed data; `verify:source` reports `artifact-root-missing` until Archive.org BIN/CUE files are downloaded under `artifacts/logh7-cd`.

EXE changes are legacy-oracle/mod-only and require a current plan explicitly reopening that path. Do not restore Python builders, JSON patch descriptors, generated client-copy stacks, or old direct-client helpers as normal implementation.

Use matching skills before ad hoc work. CodeGraph is mandatory first for code location, call-path, subsystem, and blast-radius questions when `.codegraph/` exists; confirm exhaustive answers with `rg` or direct reads. Use `find-skills` when a needed capability is missing.

LazyCodex/Superpowers/gstack capability harness: use the full installed routing stack when a task matches it. LazyCodex/OMO supplies `init-deep`, `ulw-plan`, `start-work`, `ulw-loop`, Hephaestus/ultrawork, hooks, model routing, and MCP tools such as CodeGraph/git_bash/LSP. Superpowers supplies process discipline (`using-superpowers`, `brainstorming`, `writing-plans`, TDD, systematic debugging, verification-before-completion, review/worktree/subagent skills when host policy permits). gstack supplies planning, QA, review, CSO/security, docs, design, deploy, learn, and retro roles through its router. Every work unit closes with Compound Engineering learning capture: plan, work, review, compound, repeat, including the reusable rule/check and where it was stored. If a capability is unavailable or host-forbidden, record the attempted route and fallback.

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
- Data/spec/game-logic work -> `server/` (`server/src/server`, `server/content`, `server/tests`, `server/tools`) for current bootstrap modules only.
- Unity client/import work -> `client-unity/`; remaster/localization assets remain optional provenance-labeled future work.
- RE/live oracle work -> original client/Ghidra/extracted data as evidence; old `RE/tools` were removed and must not be restored unless current docs reopen a fresh oracle tooling slice.

Live client authority:
- The canonical installed playable EXE's SHA256 changes with nearly every build/patch pass — do NOT trust
  a hardcoded hash value written in any doc (including prior versions of this file) as current fact. Before
  a live session, capture it fresh: `Get-FileHash .omo/work/logh7-installed/exe/G7MTClient.exe -Algorithm
  SHA256`. `ui_explorer stop` self-verifies `shaVerified:true` against the hash it captured at `start` time,
  which is the only trustworthy in-session check — a hardcoded doc value is not evidence of drift or
  corruption on its own (as of 2026-07-02: `3b4f634818ff0d2b2f59eb6ddacbe73c9bcbc9cda146b9cfdb9c5d1cb7b98573`,
  already stale by the next build).
- Do not rely on deleted `RE/tools/logh7_ui_explorer.py` as current path; recreate explicit oracle tooling only if a current validation slice reopens legacy-client live diagnostics.
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
## Latest Unity Visual Build Evidence

As of 2026-07-04, Unity `6000.5.2f1` builds the current prototype player at `client-unity/Builds/Windows/LOGH7RevivalUnity.exe`. Evidence: `.omo/ulw-loop/evidence/codex-unity-windows-build-final2-20260704.log`, `.omo/ulw-loop/evidence/codex-unity-player-window-screenshot-final-20260704.png`, `.omo/ulw-loop/evidence/codex-unity-validation-scene-screenshot-20260704.png`. This is a visible prototype shell, not full game parity.

G045 evidence: `.omo/ulw-loop/evidence/g045-player-clickthrough-strategic-map-20260704.png` proves real mouse-click progression to Strategic Map; `.omo/ulw-loop/evidence/g045-player-edge-strategic-blocked-20260704.png` proves direct Strategic Map is blocked at Boot.

G046 evidence: `.omo/ulw-loop/evidence/g046-player-scene-tactics-switch-20260704.png` proves the Unity player consumes the UI scene catalog and selects `tactics` after prerequisites; `.omo/ulw-loop/evidence/g046-player-scene-tactics-blocked-20260704.png` proves `tactics` stays blocked from Boot.
