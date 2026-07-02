# LOGH VII Internal Validation Plan

Updated: 2026-07-02

**For agentic workers:** this is a planning artifact, not permission to implement blindly. Use Superpowers brainstorming/writing-plans discipline, OMO evidence-first planning, CodeGraph-first code orientation, and the full gstack suite through its router when a specialized skill matches the work. When execution starts, work one slice at a time and close each slice with verification, review, `/cso` when security-relevant, Compound Engineering learning capture, and documentation sync.

**Goal:** validate the first real playable loop for Korean-localized LOGH VII through normal operator/player paths, while preserving future remastering and modding paths.

**Architecture:** operator starts Docker Compose server; player starts launcher; launcher reaches web signup/community and starts legacy client; legacy client drives character, world, tactical, command, notice, and community-adjacent identity flows. Remastering and modding are optional manifest-driven layers above the original fallback.

## Startup Rule

New agents start only:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-internal-validation-plan.md`

Then use `docs/logh7-document-index-current.md` to decide which older docs to open.

## Work Unit Closure

Every work unit, even documentation-only units, must end with:

- Matching skill use: LOGH7, Superpowers, OMO, gstack, and project-installed skills where applicable.
- For remastering/modding work, first verify installed skills include `image-upscaling`, `game-assets`, `game-3d-assets`, `game-engine`, and `multiplayer-game`; if a narrower skill is needed, search/install only high-fit candidates and record unsuitable search results.
- CodeGraph-first orientation for codebase flow/call/path questions when `.codegraph/` exists, with `rg`/direct reads as completeness backstop.
- If a required matching skill is missing from the active environment, attempt installation with `find-skills` or `npx skills add <owner/repo@skill> -y` before development. If install fails, record exact output and fallback.
- Verification appropriate to the changed surface.
- Review or explicit reason review is not applicable.
- `/cso` if account, session, admin, moderation, launcher update, logging, supply chain, remaster pack, mod pack, or client patch pack behavior changed.
- Compound capture for mistakes/near-misses: make the lesson findable, update the agent-readable system, and verify the system would catch it next time.
- Documentation sync: add, modify, prune, and delete/retire entries in the current docs, document index, and entrypoint docs.

Documentation sync targets:

- `docs/logh7-requirements-current.md`
- `docs/logh7-architecture-operations-current.md`
- `.omo/plans/logh7-internal-validation-plan.md`
- `docs/logh7-document-index-current.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/CLAUDE.md`

## Slice 0: Documentation Baseline

**Purpose:** make current planning discoverable and prevent future agents from starting with stale summaries.

**Acceptance:**

- The three startup docs exist.
- The document index exists and classifies older docs.
- `AGENTS.md`, root `CLAUDE.md`, and `.claude/CLAUDE.md` instruct new agents to read the three startup docs first.
- Entry docs state documentation sync, skill-install, CodeGraph, blocked-loop, macOS, remastering, and modding rules.

**Verification:**

- `test -f docs/logh7-requirements-current.md`
- `test -f docs/logh7-architecture-operations-current.md`
- `test -f .omo/plans/logh7-internal-validation-plan.md`
- `test -f docs/logh7-document-index-current.md`
- Search entry docs for `LOGH VII Current Startup Rule`, `CodeGraph`, `matching skill`, `macOS`, `Remastering`, and `Modding`.

## Slice 1: Run and Account

**Purpose:** prove the normal operator/player startup route.

**Scope:**

- Docker Compose server path.
- macOS Docker Desktop or OrbStack service startup path.
- Launcher config/update/game launch path.
- Web account creation.
- Legacy client login with a web-created account.

**Acceptance:**

- Operator can start the server using Docker Compose without RE harnesses.
- macOS developer can run server/web/tests and service containers without Windows-only setup.
- Player can start launcher and launch the legacy client.
- Public account creation succeeds.
- Legacy client logs in with that account.
- Direct Node commands are documented as development helper only.

**Verification:**

- Server automated tests for signup/login/session persistence.
- Browser or HTTP test for web signup.
- Real-client login live QA.
- Normal path smoke test: Docker Compose server plus launcher launch.
- macOS smoke checklist for Docker Desktop/OrbStack service startup and server/web/test commands.

## Slice 1b: Skill and CodeGraph Operating Discipline

**Purpose:** make skill use explicit and avoid repeated blocked loops.

**Scope:**

- CodeGraph-first code orientation.
- Matching skill selection for LOGH7, Superpowers, OMO, gstack, and `.agents/skills`.
- Install-missing-skill attempt at development start.
- Blocked-loop budget.
- `find-skills` use when capability gaps appear.

**Acceptance:**

- Plans name skills that apply to each work unit.
- Code flow questions start with CodeGraph when `.codegraph/` exists.
- Missing required skills trigger an install attempt or documented blocker.
- No worker repeats the same blocked command/probe more than three times without pivoting.
- Blocker reports include attempted evidence and next different strategy.

**Verification:**

- Entry docs include skill, install, and blocker rules.
- `npx skills ls --json` lists expected project skills.
- CodeGraph CLI or MCP works when `.codegraph/` exists.
- `npx skills ls --json` lists `game-engine` and `multiplayer-game` alongside remaster asset skills.
- Blocked work includes concise blocker report instead of repeated trace churn.

## Slice 2: Forced Character Cleanup

**Purpose:** remove invalid character shortcuts from runtime and evidence.

**Scope:** runtime bypass/preseed paths, tests/fixtures, and docs/status references that imply forced characters are accepted flow.

**Acceptance:** normal validation cannot rely on forced/preseeded/placeholder characters; diagnostic bypasses are labeled and excluded from milestone evidence.

**Verification:** search for forced/preseed references, run server character registry tests, update document index classifications.

## Slice 3: Character

**Purpose:** make client-created characters authoritative.

**Scope:** legacy client character creation, persistence, selection, list/card/HUD/command eligibility fields, and web/community character identity link if feasible.

**Acceptance:** a client-created character reaches the server, persists, reappears in selection, can be selected, drives world HUD/state, and avoids emperor/placeholder fallback.

**Verification:** server record tests plus real-client live QA screenshots/traces for create, list, select, and world HUD.

## Slice 4: World and Strategic Map

**Purpose:** validate readable world play.

**Scope:** world entry, system/grid/fleet info, grid ship counts, celestial body data, faction ownership, selection, movement, visible movement/warp effects, and two-account same-world visibility/state.

**Acceptance:** selected character enters world/strategic map, Korean UI is readable, grid/system selection produces populated panel data, movement/warp shows visible effect, and two accounts observe relevant same-world state.

**Verification:** server strategic tests, real-client screenshots/traces, and two-account proof followed by real-client confirmation.

## Slice 5: Tactical and Battle

**Purpose:** make tactical mode playable enough for internal validation.

**Scope:** strategic-to-tactical entry, tactical object/panel population, no `NO DATA`, selection, movement, warp/move effects, attack, hit, damage, destruction/explosion, result display, and all first-phase tactical commands.

**Acceptance:** tactical map opens from strategic route, objects/panels are populated from server data, every in-scope tactical command executes, and combat/movement feedback is visible.

**Verification:** tactical record/parser tests, command execution tests, and real-client live QA screenshots/traces.

## Slice 6: Jobs, Commands, and Proposals

**Purpose:** stop treating command cards as flat dev UI.

**Scope:** full job/duty/authority catalog, full command catalog, phase membership, at least one executable command per known group, and proposal/report display.

**Acceptance:** every known group is represented in a coverage matrix; every first-phase command executes; proposals/reports are visible or on-route; dev-only command dumps are not accepted as canonical authority cards.

**Verification:** catalog tests, command execution tests, and real-client live QA for role-specific command availability/results.

## Slice 7: Community, Notices, and Moderation

**Purpose:** cover the non-game surfaces needed for internal validation.

**Scope:** launcher/web notices, in-game lobby/session notices, board read/write, linked character identity, admin notice management, board hide/delete, report review/handling.

**Acceptance:** player sees launcher/web notices and in-game lobby notice; logged-in account can use board; moderator/admin can handle posts and reports.

**Verification:** web/API tests, authz tests, and real-client live QA for lobby/session notice route.

## Slice 8: Remastering Foundation

**Purpose:** make remastering an optional, reversible layer without delaying the first playable loop.

**Scope:** font/readability, UI scaling, UI texture cleanup, portrait/background upscale experiments, launcher polish, remaster pack manifest, provenance labels, original/remaster toggle, rollback expectation.

**Acceptance:**

- Original assets remain canonical fallback.
- Remaster assets are opt-in and provenance-labeled.
- AI-upscaled or generated assets are never labeled as original.
- One internal remaster experiment can be enabled and disabled without damaging the base install.
- Live-client consumed remaster assets have screenshot evidence.

**Verification:**

- Asset manifest validation.
- Original/remaster file diff and rollback check.
- Live-client screenshot comparison where applicable.
- Use `image-upscaling` for upscale experiments when appropriate.
- Use `game-assets`, `game-3d-assets`, or `game-engine` only for approved prototypes/previews, with provenance and original fallback.

## Slice 9: Modding Foundation

**Purpose:** prevent future mod support from being blocked by hardcoded data and patch paths.

**Scope:** Layer A data/content pack manifest, Layer B localization/texture pack manifest, Layer C guarded client patch pack manifest, dependency/conflict metadata, schema/provenance validation, and one internal proof mod pack after the playable loop is stable.

**Acceptance:**

- Mods are manifest-driven, versioned, reversible, and conflict-checked.
- Server-side mods pass schema/provenance checks.
- Client patch mods require original signatures, target hash recording, rollback, and live QA.
- Public mod distribution is explicitly later scope.

**Verification:**

- Manifest parser/schema tests.
- Pack apply/remove dry run.
- Client patch pack byte/signature verification when Layer C is used.
- Use LOGH7 `extract`, `localize`, `patch`, `re`, and `wire` skills before generic game-asset skills.
- Use `multiplayer-game` only for state-sync/interest/server-authority pattern review; do not import RivetKit or replace LOGH7 protocol without separate approved architecture decision.
- If a dedicated modding/editor skill is needed, rerun `find-skills` with exact ecosystem and document install or rejection evidence.

## Slice 9b: DNT/Sourcebook AI Mod Pipeline

**Purpose:** support DNT/setting-book-derived optional mod packs without polluting original canonical data.

**Scope:** Google Drive or local setting-book PDFs/images, page rendering, OCR/crop extraction, structured asset briefs, Meshy/image-to-3D prototypes, generated asset provenance, prompt/cost/task-id records, mod pack overlay.

**Acceptance:**

- Drive folder access is verified or exact login/permission blocker recorded.
- Every extracted asset has source page/image id, crop coordinates or screenshot, OCR confidence when applicable, and rights/provenance label.
- AI-generated 3D assets are R3/generated placeholders unless reviewed and promoted.
- Meshy/API generation requires API-key presence, credit-cost confirmation, downloaded model hashes, thumbnails, and orientation/scale QA.

**Verification:**

- Use `pdf` page rendering and `smart-ocr` extraction for scanned source material.
- Use `meshy-3d-generation` or `game-3d-assets` for prototype 3D model generation.
- Validate manifest schema includes sourcebook provenance, prompt chain, generated status, and rollback.
- Preview generated model in tooling before any client-facing packaging.

## Slice 9c: macOS Client Compatibility Lab

**Purpose:** determine whether normal players can run the legacy client on macOS via Wine-family tooling.

**Scope:** CrossOver/Wineskin/PortingKit/maintained Wine builds, isolated prefixes/bottles, 32-bit Windows client behavior, D3D8 rendering through WineD3D/DXVK/D3D8/wrapper options, launcher handoff, Korean text, audio/input, network login, rollback.

**Acceptance:**

- macOS client support is not claimed until real Mac hardware shows launcher start, login, world entry, tactical rendering, Korean text, input, sound, network, and update/patch rollback.
- Failed attempts record exact macOS version, CPU, Wine/CrossOver/PortingKit version, bottle/prefix settings, DLL overrides, logs, and next different route.
- macOS server/web/dev remains supported even if legacy client playability fails.

**Verification:**

- Real-device smoke checklist.
- Wine/CrossOver logs and screenshots.
- DXVK/D3D8 or wrapper HUD/log evidence when used.
- Documentation update classifying macOS as supported, experimental, or blocked.

## Slice 10: Security, Review, and Compound Closure

**Purpose:** prevent repeated execution-review mistakes.

**Scope:** gstack `/cso`, gstack `/review` where a diff exists, `/learn`, `/retro`, compound learning capture, documentation sync, remaster/mod pack security.

**Acceptance:** security/review findings are fixed, mitigated, blocked with exact blocker, or intentionally deferred; compound capture answers mistake, root cause, prevention check, storage location, and future enforcement; current docs and entrypoints are updated.

**Verification:** `/cso` report or exact blocker, review report or exact reason no diff review applies, updated docs/entrypoints, and search confirming old invalid guidance is not current path.
