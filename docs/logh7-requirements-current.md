# LOGH VII Current Requirements

Updated: 2026-07-02

This is the current requirements authority for LOGH VII revival planning. New agents must read this document, `docs/logh7-architecture-operations-current.md`, and `.omo/plans/logh7-internal-validation-plan.md` first. Older documents are evidence or historical context unless a current document points to them.

## North Star

Normal players should be able to install or update the Korean-localized original client, start it through a launcher, create an account on the web, log into the legacy client, create/select a character in the legacy client, and play through the revived server without using reverse-engineering harnesses.

The first internal validation milestone is an end-to-end playable loop through the real client:

1. Operator starts the Docker Compose service server.
2. Player starts the launcher.
3. Player creates a web account.
4. Player logs into the legacy client.
5. Player creates/selects a game character inside the legacy client.
6. Player enters the world/strategic map.
7. Player sees system, grid, fleet, ship-count, celestial-body, and faction/ownership data.
8. Player enters the tactical map.
9. Tactical map shows units/panels/objects without `NO DATA`.
10. Movement/warp, attack, hit, damage, destruction/explosion, and result presentation are visible.
11. All tactical-map commands in the milestone execute, not merely render.
12. Job/duty/authority commands and proposal/report surfaces work for every known group at least once.
13. Launcher/web notices, in-game lobby notices, board/community, reports, and moderation surfaces are validated.

## Actors

- **Operator/admin**: starts and manages the server. First service target is Docker Compose.
- **Player/user**: starts the launcher. Direct `G7MTClient.exe` launch is diagnostics/development only.
- **Developer/RE worker**: may use `ui_explorer`, probes, traces, direct Node commands, and bypass flags, but those tools never become normal player/admin workflow.
- **Moderator/admin**: manages notices, board visibility/deletion, and board reports. Account bans/suspensions are later scope.

## Core Scope

### Run and Account

- Server first deployment target: Docker Compose service-style runtime.
- Direct Node commands are development helpers only.
- Launcher first scope: server address/config, update/patch check, game launch, web signup entry, notice/board entry.
- Web account creation is required. Legacy client handles login only.
- Password storage, sessions, authorization, admin separation, and account persistence are security-critical.

### Character

- Character creation happens only inside the legacy game client.
- Web and launcher must not create gameplay characters.
- Character creation must cover every client creation-screen field and every downstream record field consumed for list, card, HUD, command eligibility, and session/community identity.
- Client-created characters must persist, reappear in client selection, be selectable, and drive world HUD/state.
- Old forced/preseeded/placeholder character paths must not count as QA evidence.

### World and Strategic Map

- World entry must show readable Korean UI.
- Strategic map must show system/grid/fleet info, grid ship counts, celestial body data, faction ownership, selection, and movement.
- Movement/warp must show visible effects, not silent coordinate changes only.
- Two accounts must be able to enter the same world and show visible awareness/state where the original client expects it.

### Tactical and Battle

- Tactical entry must work from the strategic route.
- Tactical units/panels/objects must render without `NO DATA`.
- Tactical selection, movement, warp/move effects, attack, hit, damage, destruction/explosion, and result display are in first internal validation.
- Every tactical-map command in the phase must actually execute.

### Jobs, Commands, and Proposals

- All jobs, duties, and authority groups must be checked.
- Job and command catalog sources: manual evidence plus actual client EXE/data-observed buttons, cards, hotkeys, and codes.
- Build a full catalog, then phase implementation.
- First command phase includes strategic commands, tactical-entry/basic combat commands, and at least one executable command per known job/duty/authority group.
- A command is not complete until action, state change, and UI/proposal/report result are visible where the client expects it.

### Korean Localization

- First localization scope: launcher, login/lobby, first playable loop screens, command/job/order/proposal text, menus/settings, and error messages.
- Quality target: natural Korean with LOGH-appropriate military/political register.
- Maintain a glossary. Translation is not complete unless the exact screen is live-proven.

### Remastering

Remastering is a first-class product track, but original assets remain the canonical fallback.

Brainstorming options:

- **A. Pure preservation only**: lowest risk, but does not solve readability and modern display expectations.
- **B. Full replacement art pass**: visually ambitious, but too likely to break canon fidelity and delay playability.
- **C. Optional layered remaster**: recommended. Keep original assets canonical, add opt-in high-readability fonts, UI scaling, cleaned textures, higher-resolution portraits/backgrounds, and remastered media with provenance and rollback.

Requirements:

- Remastering must be optional and reversible.
- Original assets remain canonical fallback.
- Remastered assets must carry provenance: original-derived upscale, hand-cleaned, generated placeholder, or community contribution.
- Generated or AI-upscaled assets cannot be described as original/canonical.
- First remaster scope: font/readability, launcher polish, UI texture cleanup, portrait/background upscale experiments, and packaging toggles.
- Remaster QA must compare original vs remastered output and include live-client screenshots when the legacy client consumes the asset.
- Remaster work must start by checking installed project skills. Use `image-upscaling` for original-derived upscale experiments, `game-assets`/`game-3d-assets` only for approved placeholder/prototype experiments, and `game-engine` only for browser rendering/game-loop reference work. These skills never replace original client evidence.

### Modding

Modding is a first-class product track, but public modding is not required for first internal playability validation.

Brainstorming options:

- **A. No modding until game works**: simplest, but risks hardcoding data paths that later block mod support.
- **B. Full mod platform early**: too broad before the server/client loop is stable.
- **C. Layered mod foundation**: recommended. Design data/content pack boundaries now, prove one internal mod pack later, and defer public creator tooling until after the playable loop.

Required mod layers:

- **Layer A: data/content packs** for server content, scenario data, balance tables, community replacement data, and provenance-labeled placeholders.
- **Layer B: localization/texture packs** for Korean text, optional remaster assets, UI textures, portraits, and glossary-managed strings.
- **Layer C: client patch packs** for byte-verified EXE patches only when server/data/asset routes cannot solve the behavior.

Modding requirements:

- Mods must be manifest-driven, versioned, reversible, and conflict-checked.
- Mods must not overwrite canonical source assets without backup and restoration path.
- Client patch mods require original-signature checks, target EXE hash recording, rollback, and live QA.
- Server-side mods must pass schema/provenance checks before use.
- Public mod distribution, ratings, and workshop-style UX are later scope.
- Modding work must start by checking installed project skills. Use LOGH7 `extract`, `localize`, `patch`, `re`, `wire` skills before generic game skills; use `multiplayer-game` only as a state-sync/interest-management/server-authority reference, not as approval to adopt RivetKit or replace the legacy protocol. A 2026-07-02 skills.sh search for generic `modding` returned Minecraft/Unity/DayZ-specific low-fit candidates; do not install keyword-only modding skills unless the exact work unit needs that ecosystem.

- DNT/setting-book-derived mods are allowed as optional derivative mod packs, not canonical OVA/original LOGH VII data. Each asset or record must preserve source reference, page/image id, prompt chain, generated/hand-authored status, license/rights note, reviewer, and acceptance screenshots.
- Generative AI 3D model work belongs to remaster/mod prototype scope until proven in client/tooling. Use `pdf`/`smart-ocr` to extract setting-book text/images, then `meshy-3d-generation` or `game-3d-assets` for image/text-to-3D experiments. Store outputs as R3/generated placeholders unless manually validated and explicitly promoted.
- The shared Google Drive setting-book folder is an input pointer only until files are downloaded or access is verified. If Drive redirects to login or permission wall, record the blocker and work from user-provided local PDFs/images instead.

### Native System Extensions

Native system additions are a core extension track, separate from modding and public mod packs. They add new server-authoritative gameplay or political systems to this revival while preserving original LOGH VII behavior as the fallback. They must not be described as original/canonical unless backed by P0/P1 evidence.

Feasibility ruling as of 2026-07-03:

- **Likely feasible:** systems whose state and outcomes can be represented by server data, command execution, notices, proposal/report text, board/community state, faction/session data, or existing client-consumed records.
- **Feasible with RE proof:** systems that need reused or repurposed legacy-client command, panel, lobby notice, or report surfaces. Every involved command code, parser, display consumer, and record size must be pinned by `logh7-re`/`logh7-wire` before implementation.
- **Native-client expansion foundation needed:** systems requiring new in-client windows, widgets, packet families, or control flow need a separate RE/patch foundation before feature work: candidate surface discovery, patch capacity/cave or appended-section strategy, original-signature descriptors, target hash recording, rollback, and real-client live QA.
- **Not acceptable:** speculative packets, auto-responding to unknown frames, or treating diagnostic-only hooks as normal player/operator workflow.

Example extension: Free Planets Alliance Supreme Council chair election. First implementation should define election term, eligibility, candidacy, voting window, vote ledger, tie/break rules, faction/government effects, audit log, and notice/report outputs as native server features. It can surface initially through web/community/admin plus in-game lobby/session notices and existing command/proposal/report routes. A richer in-client election panel belongs to the native-client expansion foundation, not to modding.

### Notices and Community

- Launcher/web notices are pre-login/community information.
- Server notices after login must appear in the in-game lobby/session-selection notice area.
- Web/community first development scope includes logged-in board read/write, character identity display if linked to a game-client-created character, notice management, board hide/delete, and report review/handling.

## Data Provenance

- `P0`: client-extracted/original binary asset evidence.
- `P1`: manual/original document evidence.
- `P2`: reconstructed from reliable secondary evidence.
- `P3`: development placeholder or speculative bridge.

P2/P3 data may support development, but cannot be described as canonical without explicit upgrade evidence.

## Security

Every executable plan must have a separate Security section and must invoke gstack `/cso` before a milestone can close.

Minimum CSO scope:

- Native system extensions, voting/election ledgers, government/faction effects, audit logs, and admin overrides.
- Public signup/login password handling.
- Legacy client login/session bridge.
- Account-to-game-character identity linking for board/session surfaces.
- Web board/notice endpoints, posting, moderation, and report handling.
- Lobby/session-selection server notice delivery.
- Account DB and character registry persistence.
- Server trace/log handling and PII leakage.
- Launcher/client patch supply chain.
- Node/Python/Playwright/browser tooling supply chain.
- Codex/Superpowers/OMO/gstack/project-skill supply chain and prompt-injection risk.
- Remaster/mod pack manifests, asset provenance, upload/import path, and client patch pack safety.

- DNT/sourcebook Drive links, local PDFs/images, OCR outputs, Meshy API keys/credits, prompt logs, generated model files, and third-party model imports are security/supply-chain review inputs. Do not commit API keys or copyrighted source scans; store generated models with provenance and hash records.

## Verification

Milestone evidence requires all three:

- Automated tests for parsers, records, persistence, web/community behavior, command execution, and security-sensitive paths.
- Real-client live QA proving the legacy client consumes server data and shows expected screens/effects.
- Normal run path validation through launcher plus Docker Compose service server.

`ui_explorer` traces, screenshots, and probes are valid diagnostic evidence, but diagnostic harness proof alone is insufficient for readiness.

## Skill and CodeGraph Requirement

Agents must use matching project skills instead of relying on memory-only reasoning. This includes LOGH7 skills, Superpowers, OMO, gstack, and project-installed skills under `.agents/skills`.

CodeGraph is mandatory for codebase orientation when `.codegraph/` exists and the task involves code location, call paths, impact analysis, or subsystem understanding. Use CodeGraph first, then use `rg`/direct reads as the completeness backstop because CodeGraph can miss dynamic or ambiguous edges.

Installed project skills that matter for this work:

- `find-skills`: search and install additional skills from skills.sh when a new capability gap appears.
- `codegraph`: code graph orientation and impact analysis.
- `protocol-reverse-engineering`: protocol and packet analysis.
- `nodejs-backend-patterns`: Node server work.
- `playwright-testing`: web/community and launcher-adjacent browser tests.
- `security-audit`: security review support, alongside mandatory gstack `/cso`.
- `docker-platform-guide`: cross-platform Docker setup.
- `orbstack-best-practices`: macOS Docker/OrbStack development.
- `github-actions-efficiency`: CI workflow review when CI is added or changed.
- `image-upscaling`: optional original-derived remaster image upscale experiments.
- `game-assets`: optional 2D asset prototyping for placeholders or remaster experiments.
- `game-3d-assets`: optional 3D asset prototyping for tooling/prototype work.
- `game-engine`: optional browser game/rendering/game-loop reference for launcher/web prototypes or visualization tooling.
- `multiplayer-game`: optional multiplayer state, tick-loop, interest-management, validation reference; RivetKit-specific guidance is not adopted architecture unless separately approved.

If a matching skill is required but missing in the active environment, the worker must attempt installation at development start:

1. Check project/global installed skills.
2. Use `find-skills` or `npx skills find <need>` to locate a suitable skill.
3. Prefer reputable, relevant, higher-install skills.
4. Run `npx skills add <owner/repo@skill> -y` for project skills unless global install is explicitly needed.
5. If install fails or the skill is unsuitable, record the exact command/output and continue with the best fallback only after documenting the blocker.

## Progress Budget and Blocker Rule

Do the best available investigation, but do not burn tokens repeating the same blocked loop. A worker must pivot or report a blocker when any of these happen:

- The same command/probe fails three times with the same root symptom.
- Two independent investigation paths produce no new evidence.
- A live-client route is blocked by missing external state, unavailable Windows UI, or a tool bootstrap still running.
- The next step would be speculative without new evidence.

The blocker report must state the exact blocker, what was tried, evidence paths, next different strategy, and smallest user/operator input needed if any.

Additional sourcebook/AI-mod skills:

- `pdf`: PDF visual rendering/extraction checks for setting books, manuals, and scanned source material.
- `smart-ocr`: OCR for scanned PDFs/images, including Japanese/Korean/English sourcebook pages; keep confidence and bounding-box evidence when used for data extraction.
- `meshy-3d-generation`: Meshy API 3D generation from text/images; requires API key, credit confirmation, generated output provenance, and post-load orientation/scale QA.

## macOS Development Requirement

Server, web/community, documentation, data extraction that does not require Windows APIs, automated tests, Docker Compose service work, and CI prep must be possible on macOS.

Windows-only scope remains:

- Running the original D3D8 legacy client.
- `ui_explorer` live QA.
- Windows PE patch deployment that needs the installed game.
- PowerShell or registry operations tied to the BOTHTEC installation.

macOS workers should use Docker Desktop or OrbStack for service runtime, keep host scripts POSIX-compatible where feasible, and avoid adding Windows-only assumptions to server/web/test code.

macOS client playability is an investigation track, not current normal-path evidence. Try CrossOver/Wineskin/PortingKit or maintained Wine builds first, then D3D8 translation options such as DXVK/D3D8 or dgVoodoo-style wrappers only in isolated bottles/prefixes. A macOS pass is complete only when launcher start, login, world entry, tactical rendering, Korean text, input, sound, network, and update/patch rollback are observed on real Mac hardware. If Wine/CrossOver cannot run the legacy 32-bit D3D8 client, document exact bottle/prefix settings, logs, and next route instead of treating macOS as supported.

## Documentation Sync Requirement

At the end of every work unit, the worker must update documentation automatically before claiming completion:

- **Add** new requirements, decisions, run commands, evidence links, risks, and doc-index entries introduced by the work.
- **Modify** current requirements, architecture/operations, validation plan steps, and entrypoint rules when behavior or scope changes.
- **Prune** stale guidance, superseded status claims, old accepted paths, and misleading references.
- **Delete or retire** entries that would cause future workers to follow invalid routes, especially forced/preseeded character flows or developer-only harnesses presented as normal operation.

This sync applies to the three current docs, `docs/logh7-document-index-current.md`, `AGENTS.md`, root `CLAUDE.md`, and `.claude/CLAUDE.md` when startup or workflow rules are affected.

## Must Not Do

- Do not use old forced/preseeded placeholder characters as QA subjects.
- Do not move gameplay character creation into the web app or launcher.
- Do not make server notices web-only.
- Do not turn `ui_explorer` into the normal launcher.
- Do not make direct `G7MTClient.exe` execution the player-facing normal path.
- Do not require players/operators to use RE harnesses, preseed flags, PID cleanup scripts, or trace sessions for routine play.
- Do not hide server startup behind many bespoke flags unless packaged into one stable operator action.
- Do not label generated/upscaled assets as canonical originals.
- Do not build public mod distribution before the playable loop and pack safety model are stable.
- Do not close work after implementation review alone. Completion is implementation, verification, review, CSO/security, compound learning capture, and updated docs.
