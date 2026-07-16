# docs/

This directory is no longer a planning archive. For LOGH VII work, start from:

1. `docs/logh7-requirements-current.md`
2. `docs/logh7-architecture-operations-current.md`
3. `.omo/plans/logh7-execution-plan-current.md`

Then use `docs/logh7-document-index-current.md` to route older material.

Before every LOGH VII work unit, read the matching track in `docs/logh7-reference-haul.md` for methods and external-repository routing. It is methodology, not canonical game data. Keep external repositories isolated under gitignored `reference/`, and never copy code without an explicit license check.

## Rules

- Keep current guidance in the three entrypoint documents and this index.
- Keep old documents only when they contain source material, extraction evidence,
  reverse-engineering facts, manual/visual references, or provenance that has not
  yet been normalized into `server/content/`.
- Do not recreate deleted handoff, roadmap, status, live-client runtime,
  patch-builder, or remaster deployment documents.
- `docs/logh7-developer-dashboard.html` is derived status only, not a fourth
  startup authority.
- When cleanup changes document routing, update the index and dashboard in the
  same work unit.
- A LOGH VII work unit is incomplete until root `AGENTS.md`, the affected current
  documents, and the Obsidian project `현재 상태.md`/roadmap are synchronized.
