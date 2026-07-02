# LOGH VII Document Index

Updated: 2026-07-02

This index prevents old handoffs and evidence docs from becoming accidental current guidance.

## Startup Rule

New Claude, Codex, OMO, and gstack sessions must start by reading only:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-internal-validation-plan.md`

After those three, open older docs only when a current doc or this index points to them for evidence.

## Classification Meanings

- **Current authority**: controls current planning or operations.
- **Current reference**: useful operational/technical detail, but subordinate to current authority docs.
- **Evidence**: historical or technical proof. Use for facts, not current process by default.
- **Superseded**: replaced by current authority or newer evidence. Do not use as current guidance.
- **Archive reference**: old handoff/status context. Read only when reconstructing history.

## Current Authority

| Document | Status | Use |
|---|---|---|
| `docs/logh7-requirements-current.md` | Current authority | Current requirements and must-not rules. |
| `docs/logh7-architecture-operations-current.md` | Current authority | Current architecture, operations, security boundaries, normal/diagnostic path split, remaster/mod layers. |
| `.omo/plans/logh7-internal-validation-plan.md` | Current authority | Current internal validation slices and closure gates. |
| `docs/logh7-document-index-current.md` | Current authority | Routing older documents and project skills. |

## Current Reference

| Document | Status | Use |
|---|---|---|
| `docs/logh7-live-test-standard.md` | Current reference | Diagnostic live-client QA standard only. Not normal run path. |
| `docs/logh7-loop-state.md` | Current reference | Current loop state and live evidence, subordinate to current requirements. |
| `docs/logh7-gap-backlog.md` | Current reference | Gap candidates and backlog context, subordinate to current validation slices. |
| `docs/logh7-current-requirements-status-2026-07-01.md` | Current reference | Previous requirements/status register. Use as evidence to update current docs. |
| `docs/logh7-active-goal-register-2026-06-30.md` | Current reference | Active goal history and unresolved technical tracks. |
| `.debug-journal.md` | Current reference | Append-only protocol/cipher source of truth. Keep sensitive runtime addresses scoped. |

## Project Skills

| Skill | Status | Use |
|---|---|---|
| `.agents/skills/find-skills` | Current reference | Search skills.sh and install additional project skills when a new capability gap appears. |
| `.agents/skills/codegraph` | Current reference | Codebase orientation, call paths, and impact analysis. Use `rg`/direct reads for completeness. |
| `.agents/skills/protocol-reverse-engineering` | Current reference | Network/protocol packet analysis. |
| `.agents/skills/nodejs-backend-patterns` | Current reference | Node server patterns. |
| `.agents/skills/playwright-testing` | Current reference | Web/community browser and E2E testing. |
| `.agents/skills/security-audit` | Current reference | Security audit support. gstack `/cso` remains mandatory. |
| `.agents/skills/docker-platform-guide` | Current reference | Cross-platform Docker setup, including macOS. |
| `.agents/skills/orbstack-best-practices` | Current reference | macOS OrbStack Docker workflow. |
| `.agents/skills/github-actions-efficiency` | Current reference | CI workflow efficiency when GitHub Actions are added or changed. |
| `.agents/skills/image-upscaling` | Current reference | Optional remaster image upscale experiments. Outputs need provenance and original fallback. |
| `.agents/skills/game-assets` | Current reference | 2D asset prototyping for placeholders/remaster experiments only. |
| `.agents/skills/game-3d-assets` | Current reference | 3D asset prototyping for tooling/remaster experiments only. |
| `.agents/skills/game-engine` | Current reference | Browser game/rendering/game-loop patterns for prototypes and visualization tooling; not legacy-client runtime authority. |
| `.agents/skills/multiplayer-game` | Current reference | Multiplayer state/tick/interest-management/validation patterns; RivetKit-specific runtime guidance is reference only unless separately approved. |
| `.agents/skills/pdf` | Current reference | PDF rendering and layout-aware extraction for setting books, manuals, and scanned source material. |
| `.agents/skills/smart-ocr` | Current reference | OCR scanned PDFs/images with confidence and bounding-box evidence, including Japanese/Korean/English source pages. |
| `.agents/skills/meshy-3d-generation` | Current reference | Meshy text/image-to-3D generation; requires API key, credit confirmation, provenance, output hashes, and model QA. |

## Skill Search Notes

| Date | Query | Result | Action |
|---|---|---|---|
| 2026-07-02 | `game engine`, `game assets` | High-install generic game candidates found; `github/awesome-copilot@game-engine` installed. | Use only for browser prototype/visualization planning. |
| 2026-07-02 | `game modding`, `multiplayer game` | `rivet-dev/skills@multiplayer-game` installed for multiplayer patterns. Generic `modding` search returned Minecraft/Unity/DayZ-specific low-fit candidates. | Do not install keyword-only modding skills; rerun `find-skills` for exact ecosystem if future work unit needs it. |
| 2026-07-02 | `image upscaling game assets`, `asset pipeline` | Existing `image-upscaling`, `game-assets`, `game-3d-assets` cover current remaster/prototype needs. | Keep original asset fallback and provenance labels mandatory. |
| 2026-07-03 | `pdf image OCR`, `pdf extraction`, `ocr opencv` | `openai/skills@pdf` and `claude-office-skills/skills@smart-ocr` installed. | Use for setting-book PDF rendering, OCR, crop evidence, and confidence tracking. |
| 2026-07-03 | `meshy 3d`, `3d model generation`, `fal 3d model` | `meshy-dev/meshy-3d-agent@meshy-3d-generation` installed; FAL query returned low-fit unrelated results. | Use Meshy for DNT/sourcebook-derived prototype 3D models after API-key/cost confirmation. |

## Evidence

| Document | Status | Use |
|---|---|---|
| `docs/logh7-character-record-wire.md` | Evidence | Character wire fields and record evidence. |
| `docs/logh7-character-creation-wire.md` | Evidence | Character creation packet evidence. |
| `docs/logh7-character-creation-research.md` | Evidence | Character creation research context. |
| `docs/logh7-character-origin-data-mining-status.md` | Evidence | Character origin/canon mining status. |
| `docs/logh7-canon-character-research.md` | Evidence | Canon character research. |
| `docs/logh7-0030-protocol.md` | Evidence | Protocol notes. |
| `docs/logh7-opcode-reference-2026-06-28.md` | Evidence | Opcode reference; verify against current RE before changing builders. |
| `docs/logh7-c002-playable-route-2026-06-30.md` | Evidence | C002 route evidence; dev-only route is not normal player path. |
| `docs/logh7-c002-mechanism-complete-2026-06-23.md` | Evidence | C002 mechanism evidence. |
| `docs/logh7-dev-command-cards-2026-06-29.md` | Evidence | Dev command card evidence; do not treat dev cards as canonical authority. |
| `docs/logh7-2player-e2e-plan.md` | Evidence | Earlier two-player plan; current Slice 4 controls. |
| `docs/logh7-all-names-coverage.md` | Evidence | Name/localization coverage evidence. |
| `docs/logh7-binary-data-extract.md` | Evidence | Binary extraction context. |
| `docs/logh7-client-state-journal.md` | Evidence | Client state journal. |

## Superseded

| Document | Status | Replacement |
|---|---|---|
| `docs/logh7-current-requirements-status-2026-07-01.md` | Superseded as authority | Use `docs/logh7-requirements-current.md`. |
| `docs/logh7-2player-e2e-plan.md` | Superseded as plan | Use `.omo/plans/logh7-internal-validation-plan.md`, Slice 4. |
| Any doc that presents forced/preseeded placeholder characters as accepted validation | Superseded | Use client-created character flow only. |
| Any doc that presents `ui_explorer` as normal user/operator runtime | Superseded | Use launcher plus Docker Compose normal path. |
| Any doc that labels generated/upscaled assets as original/canonical | Superseded | Use provenance labels in current requirements. |

## Archive Reference

| Document Pattern | Status | Use |
|---|---|---|
| `docs/SESSION-HANDOFF-*.md` | Archive reference | Historical handoff reconstruction only. |
| `docs/claude-handoff-2026-06-10.md` | Archive reference | Historical context only. |
| `docs/codex-handoff-2026-06-11.md` | Archive reference | Historical context only. |
| `docs/logh7-archive-sweep-2026-06-12.md` | Archive reference | Archive sweep context. |
| `docs/logh7-audit-2026-06-20.md` | Archive reference | Historical audit context; re-check current docs before acting. |

## Document Sync Rule

At the end of every work unit, update this index:

- **Add** new docs, evidence artifacts, skills, remaster/mod packs, and provenance routes.
- **Modify** classifications when a doc becomes current, evidence-only, superseded, or archive-only.
- **Prune** duplicate routing entries.
- **Delete or retire** entries that encourage invalid current behavior.

Do not move or delete old docs by default. Classification is the first cleanup mechanism.
