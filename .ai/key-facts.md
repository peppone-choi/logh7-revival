<!-- This card is injected every turn. Refresh when roadmap, known-issues, or task.md changes. -->
# LOGH VII Key Facts (NIAH)

## Active contract
- **ui-checklist-p0-p1-p2** G001–G008 complete. G001 **Blocked**: owner@+0x04 only, **no class_ invent**. G002 sticky 0323; seed-less pcp=0.
- Parent standing select→move/Warp **blocked** on fleet marker (0x032e=0). Client `E:\logh7-revival`, **47900**, tactical OFF, lineage fail-closed.
- Auth: 2026-07-17 push/PR/merge/live. Never: force push, secrets, `server/data/` delete, `.codex/config.toml`, `git add -A`.

## Design invariants
- Data/join before texture. Map labels OK ≠ panel/map-overlay consumers.
- Unknown/Blocked explicit. No invented ship-count wire (G003).
- 0x031f +0x175 = panel template switch 0..3, **not** faction name (loop-state RE).

## Evidence
- Live baseline: `_workspace/liveqa-20260721-ui-checklist-re/` (NO DATA panels, no markers).
- Checklist: `docs/logh7-ui-screen-checklist-current.md`.
- Focused tests: system-detail + static-base + world-records exit 0.

## Live safety
- Port 47900 serial. Desktop bat → sole. Do not kill client mid-session.
