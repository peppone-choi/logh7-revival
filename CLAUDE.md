# logh7-revival Claude Entry

## LOGH VII Current Startup Rule

For LOGH VII planning or development, start from these three current documents only:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-internal-validation-plan.md`

Then use `docs/logh7-document-index-current.md` to decide which older docs are current references, evidence, superseded, or archive references. Do not treat old handoffs or status docs as current guidance unless the current docs point to them.

## Work Unit Documentation Sync

At the end of every work unit, update documentation automatically:

- Add new requirements, decisions, evidence links, commands, risks, and doc-index entries.
- Modify current requirements, architecture/operations guidance, validation-plan steps, and entrypoint rules when behavior or scope changes.
- Prune stale duplicate guidance and old status claims that no longer describe the current path.
- Delete or retire invalid current-path guidance, especially forced/preseeded character flows or developer-only harnesses presented as normal operation.

Apply this to:

- `docs/logh7-requirements-current.md`
- `docs/logh7-architecture-operations-current.md`
- `.omo/plans/logh7-internal-validation-plan.md`
- `docs/logh7-document-index-current.md`
- `AGENTS.md`
- `CLAUDE.md`
- `.claude/CLAUDE.md`

## Runtime Boundary

- Operator/admin starts and manages the Docker Compose server path.
- Player/user starts the launcher path.
- `ui_explorer`, direct `G7MTClient.exe`, direct Node commands, preseed flags, and trace tools are diagnostics only.

## Skill and CodeGraph Rule

Use matching skills before ad hoc work. CodeGraph is mandatory first for code location, call-path, subsystem, and blast-radius questions when `.codegraph/` exists; confirm exhaustive answers with `rg` or direct reads. Use `find-skills` when a needed capability is missing.

If a matching skill is not installed in the active environment, attempt installation at development start with `find-skills` or `npx skills add <owner/repo@skill> -y`; if install fails, record command/output and fallback path.

## Blocked-Loop Rule

Do not spend tokens repeating the same blocked route. After three same-symptom failures or two no-new-evidence investigation paths, pivot or write a concise blocker report with evidence and the next different strategy.

## macOS Development

Keep server, web/community, tests, documentation, and Docker Compose service work developable on macOS. Original D3D8 client live QA remains Windows-only; macOS developers should use Docker Desktop or OrbStack for service work.

## Remastering and Modding

Remastering and modding are first-class planning tracks. Original assets stay canonical fallback; remaster/mod packs must be optional, reversible, manifest-driven, provenance-labeled, and conflict-checked. Public mod distribution is later scope.

Installed project helpers include `image-upscaling`, `game-assets`, `game-3d-assets`, `game-engine`, `multiplayer-game`, `pdf`, `smart-ocr`, and `meshy-3d-generation`; use them only as sourcebook/remaster/prototype/pattern aids. LOGH7 skills and client evidence stay authoritative. If a narrower skill is missing, run `find-skills` and install only high-fit candidates at development start; record unsuitable search results.

## Completion Gate

Do not close a work unit after implementation review alone. Completion requires implementation, verification, review, `/cso` when security-relevant, [Compound Engineering](https://every.to/guides/compound-engineering) learning capture, and updated docs.
