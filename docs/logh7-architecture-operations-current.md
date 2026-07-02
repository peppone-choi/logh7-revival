# LOGH VII Architecture and Operations

Updated: 2026-07-02

This document is the current architecture and operations authority. Read it after `docs/logh7-requirements-current.md` and before `.omo/plans/logh7-internal-validation-plan.md`.

## Operating Model

LOGH VII revival has two normal runtime paths and one diagnostic path.

- **Operator server path**: Docker Compose service-style server. This is the first operational target.
- **Player client path**: launcher first, then legacy client. The launcher owns server address/config, update/patch checks, web signup/community links, and game launch.
- **Diagnostics path**: `ui_explorer`, RE probes, trace scripts, direct `G7MTClient.exe`, direct Node commands, and bypass flags. These prove and repair behavior, but they are never the normal user/admin workflow.

Server, web, tests, data tooling that does not require Windows APIs, and Docker Compose service work must remain developable on macOS. Do not add Windows-only path, shell, registry, or process assumptions to cross-platform server/web/test code.

## Components

### Server

Canonical server work belongs under `server/`.

Responsibilities:

- Account creation/login storage.
- Legacy login/session bridge.
- Character registry and persistence.
- Session/world state.
- Strategic map data and commands.
- Tactical/battle data and commands.
- Notices, board/community, moderation/report state.
- Mod Layer A data/content packs.
- Admin-only operations.

### Launcher and Client

Canonical launcher, client patch, localization, packaging, remaster asset, and client asset work belongs under `client/` or `RE/tools` when the work is explicitly RE/tooling.

Launcher responsibilities:

- Configure server address.
- Check patch/update status.
- Start the legacy client.
- Open web account creation.
- Open web notice/board/community surfaces.
- Surface optional remaster/mod pack state without making users manage RE tooling.

Legacy client responsibilities:

- Login.
- Character creation/selection.
- Lobby/session-selection server notice display.
- World/strategic play.
- Tactical/battle play.

### Web and Community

The web surface supports account creation/login and community/board functions. It does not replace gameplay.

Required first-development community functions:

- Notice viewing.
- Logged-in board read/write.
- Linked game-character identity display when a game-client-created character exists.
- Admin notice management.
- Board hide/delete.
- Report review/handling.

### Data, Remaster, and Mod Provenance

Every gameplay/content/remaster/mod record must carry provenance when ambiguity matters:

- `P0`: client-extracted/original binary asset evidence.
- `P1`: manual/original document evidence.
- `P2`: reconstructed from reliable secondary evidence.
- `P3`: development placeholder or speculative bridge.
- `R0`: original asset, unmodified fallback.
- `R1`: original-derived remaster, upscaled or cleaned.
- `R2`: hand-authored replacement.
- `R3`: generated/community placeholder.

P2/P3/R3 data may support development, but cannot be described as canonical without explicit upgrade evidence.

## Remastering and Modding Layers

Remastering and modding sit above the canonical preservation layer.

- **Base layer**: original client assets, extracted data, manual/client evidence, and byte-verified patches. This layer is the fallback and audit source.
- **Remaster layer**: optional font, UI, portrait, texture, background, and media improvements. It must be reversible and provenance-labeled.
- **Mod Layer A: data/content packs**: server-side content, scenarios, balance, faction/system/fleet data, and development placeholders.
- **Mod Layer B: localization/texture packs**: Korean strings, glossary packs, UI textures, remastered portraits/backgrounds.
- **Mod Layer C: client patch packs**: guarded EXE patches with original signatures, target hash recording, rollback, and live QA.

## Native System Extension Layer

Native system additions are core project features, not mod packs. They extend revived server/client behavior while preserving original behavior as fallback. Example target: Free Planets Alliance Supreme Council chair election.

Current feasibility basis:

- Server authority path exists: `server/src/server/logh7-command-engine.mjs` is already structured as validate/apply state/emit Notify, so new systems can be added as authoritative server state machines when their outputs fit existing client-visible routes.
- Command/proposal surface exists: `server/src/server/logh7-dev-command-cards.mjs` reads manual command groups and builds command cards; `server/src/server/logh7-dev-command-executor.mjs` classifies commands including political/announcement-style commands. This is enough to prototype native systems through existing command/report/notice surfaces before new client UI work.
- Legacy client RE evidence exists for command families: `docs/logh7-character-creation-wire.md` records client command codes such as `0x1008 CommandGenerateCharacterCharge`, and `logh7-re` confirms dispatcher/size-table functions such as `FUN_004ba2b0` and `FUN_004b8b00`. New client-consumed system records must get the same level of proof before emission.
- Client patch mechanics exist: `RE/tools/logh7_codepage_patch.py` verifies `originalHex`/same-length patch bytes, and patch descriptors under `RE/tools/client_patches/*.json` already support guarded UI/layout/routing patches. Larger native UI work still needs a deliberate appended-section or equivalent capacity strategy; the known safe `0xCC` cave is small and must not be overrun.

Native system extension sequence:

1. Define server-domain state, invariants, audit log, and rollback for the system.
2. Map the user-visible surface to existing client/web routes first: notices, proposal/report text, board/admin, command outcomes, faction/session state.
3. Use `logh7-re`/`logh7-wire` to prove any client packet, parser, display consumer, or command surface before emitting new bytes.
4. If existing surfaces cannot express the system, create a native-client expansion task using `logh7-patch`: patch target discovery, capacity plan, descriptor generation, hash/signature verification, rollback, and live QA.
5. Run `/cso` for voting, admin override, audit log, and client patch supply-chain surfaces.

Pack manifests must include:

- Pack id, version, author/source, license, target app/client/server version, and provenance.
- Files changed and owner layer.
- Dependencies and conflicts.
- Rollback instructions.
- Verification commands and live-QA evidence when client-visible.

Do not build public mod marketplace/community distribution before the normal playable loop is stable. Build pack boundaries first so the implementation does not paint itself into a corner.

Skill handling for these layers:

- Remaster work uses `image-upscaling` for original-derived upscale experiments and `game-assets`/`game-3d-assets` only for approved placeholder/prototype assets. Every output needs original fallback and provenance.
- Browser-rendered remaster previews or tactical/strategic visualization tools may use `game-engine`; this does not change legacy-client runtime requirements.
- Modding architecture may consult `multiplayer-game` for server authority, tick loops, state sync, and interest-management patterns, but LOGH7 protocol/client evidence remains authority. Do not adopt RivetKit or another runtime without separate architecture decision.
- If exact modding/editor/asset-pipeline skill support is missing, run `find-skills` at development start, install only high-fit candidates, and record command/output/fallback when install is rejected or unsuitable.

### DNT/Sourcebook AI Asset Pipeline

Sourcebook-derived mod content flows through a separate evidence pipeline:

1. Download or receive local PDF/image files from the setting-book source.
2. Render PDF pages to images with `pdf`; run `smart-ocr` where text or labels matter.
3. Record page id, crop coordinates, OCR confidence, extracted labels, and source notes.
4. Build structured asset briefs for ships, uniforms, portraits, UI motifs, scenarios, factions, systems, and tactical props.
5. Generate prototype models with `meshy-3d-generation` or `game-3d-assets`, preserving prompt chain, API task ids, costs, output hashes, and thumbnails.
6. Run 3D post-load checks: orientation, scale, polygon count, animation clips, texture maps, in-tool screenshot, and eventual client/tooling preview.
7. Package outputs as optional mod/remaster packs with R3 provenance unless a later manual art/review process promotes them.

Do not mix DNT-derived or AI-generated assets into original/canonical fallback trees. Keep them in separate mod pack overlays.

### macOS Client Compatibility Lab

macOS service development remains supported, but legacy-client playability is experimental. The lab should test CrossOver/Wineskin/PortingKit/maintained Wine builds, isolated prefixes, 32-bit client behavior, D3D8 rendering, DXVK/D3D8 or wrapper options, CP949/Korean text, audio/input, launcher handoff, and rollback. A Mac result is usable only with real-device evidence and exact bottle/prefix/install logs.

## Data Flow

Normal first validation route:

1. Operator starts Docker Compose server.
2. Player starts launcher.
3. Launcher checks config/update/remaster/mod status.
4. Launcher opens web signup/community as needed.
5. Launcher starts legacy client with the selected server config.
6. Player logs into legacy client.
7. Legacy client creates/selects a character.
8. Server persists the account-character relationship.
9. Server sends lobby/session notice data through a client-consumed route.
10. Server sends world/strategic records consumed by the real client.
11. Server sends tactical/battle records consumed by the real client.
12. Commands produce server-side state changes and client-visible responses.

## Security Boundaries

- Public web account creation is untrusted input.
- Legacy client login/session packets are untrusted input.
- Board posts, reports, and moderation targets are untrusted input.
- Admin endpoints must be separated from player endpoints.
- Launcher update/patch/remaster/mod metadata is supply-chain sensitive.
- Server logs and traces may contain account identifiers or private operational data.
- Agent skills and automation instructions are executable prompt supply chain and must be included in `/cso` review.
- Mod pack imports, remaster assets, and client patch packs are untrusted until manifest, provenance, and signature checks pass.

## Project Skill Routing

Use matching skills before ad hoc work:

- LOGH7 protocol, wire, patch, extraction, localization, and live-client tasks: use the corresponding LOGH7 skill.
- Planning or brainstorming: use Superpowers plus OMO planning.
- Architecture/review/security/shipping/documentation: use gstack role skills.
- Code location, call paths, blast radius, and subsystem explanation: use CodeGraph first when `.codegraph/` exists.
- Protocol packet analysis: use `protocol-reverse-engineering`.
- Node server work: use `nodejs-backend-patterns`.
- Browser/E2E tests: use `playwright-testing`.
- Docker/macOS runtime setup: use `docker-platform-guide`; on macOS with OrbStack use `orbstack-best-practices`.
- CI workflow work: use `github-actions-efficiency`.
- Remaster image experiments: use `image-upscaling` when appropriate, but keep original asset fallback and provenance.
- 2D/3D asset prototype work: use `game-assets` or `game-3d-assets` only for placeholders or approved remaster/mod experiments.
- Browser game/rendering/game-loop reference work: use `game-engine` only for web prototypes or visualization tooling, not legacy-client behavior proof.
- Multiplayer state/tick/interest-management reference work: use `multiplayer-game` only as pattern input; LOGH7 wire/client evidence stays authoritative.
- New capability gap: use `find-skills` before inventing a workflow.

CodeGraph is an orientation accelerator, not the sole source of truth. Confirm exhaustive answers with `rg` or direct source reads.

If a matching skill is not installed in the active environment, try to install it at the start of development with `find-skills` or `npx skills add <owner/repo@skill> -y`. If installation fails, record the command, output, and fallback path in the work unit notes instead of silently proceeding as if the skill were unavailable by design.

## gstack Role Hooks

Use the full gstack suite through its router when a specialized skill matches the work. During brainstorming and plan-writing, the following voices are the minimum one-sentence checks, not the full limit:

- `/office-hours`: checks whether the slice serves a real player/community need.
- `/plan-ceo-review`: challenges whether the plan reaches a 10-star player/operator experience.
- `/plan-eng-review`: checks architecture, data flow, edge cases, tests, and performance.
- `/review`: checks diffs/findings before ship decisions.
- `/cso`: mandatory security gate for threat model, OWASP/STRIDE, supply chain, and secrets.
- `/learn`: searches prior lessons before planning and stores durable learnings after review.
- `/retro`: summarizes execution/review lessons at milestone close.

## Blocked-Loop Control

Avoid token-burning loops. A worker must pivot, narrow, or report a blocker when the same approach fails three times, two independent probes add no new information, or a live route depends on unavailable external state.

The blocker report must include exact blocked surface, commands/probes already tried, evidence files/screenshots, why continuing the same path would not add information, and the next different path or precise input needed.

## Completion Gate

A work unit or milestone is not complete after code review alone. Completion requires:

1. Implementation.
2. Automated verification.
3. Real-client live QA where relevant.
4. Normal run path validation where relevant.
5. Review.
6. `/cso` security check or exact blocker.
7. Compound learning capture using the [Compound Engineering](https://every.to/guides/compound-engineering) loop: plan, work, review, compound, repeat.
8. Documentation sync.

The compound step must answer:

- What mistake or near-miss happened?
- What was the root cause?
- What reusable rule/check prevents it next time?
- Where was the learning stored?
- Which future plan/test/doc enforces it?
- Would the system catch this automatically next time?

## Documentation Automation Rule

Every work unit must end with a documentation sync pass:

- **Add** entries for new commands, evidence, risks, decisions, files, owner paths, skill requirements, remaster/mod pack rules, and provenance states.
- **Modify** entries whose behavior, scope, command, or acceptance evidence changed.
- **Prune** duplicate, stale, or misleading guidance.
- **Delete or retire** invalid instructions that would push future agents toward wrong behavior.

Sync targets:

- `docs/logh7-requirements-current.md`
- `docs/logh7-architecture-operations-current.md`
- `.omo/plans/logh7-internal-validation-plan.md`
- `docs/logh7-document-index-current.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/CLAUDE.md`

Do not rewrite unrelated historical evidence. Classify it in the document index instead.

## Operational Simplicity Rules

- Operator path is one stable Docker Compose service action plus documented config.
- Player path is launcher-first.
- Direct `G7MTClient.exe`, `ui_explorer`, trace tools, and preseed flags are diagnostics only.
- Do not require manual process cleanup for normal play.
- Do not blanket-kill `node.exe`.
- Keep live diagnostics in `RE/` with `--server-root ..\server`.
- Capture the current playable EXE hash fresh before live QA; do not trust old hardcoded hashes.
