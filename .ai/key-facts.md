<!-- This card is injected every turn. Refresh when roadmap, known-issues, or task.md changes. -->
# LOGH VII Key Facts (NIAH)

## Active contract
- **ACTIVE ultragoal standing backlog** (2026-07-21): plan `standing-backlog-win-native`. Playable live (select→move/Warp) via batches of 5. Client `E:\logh7-revival`, port **47900**, lineage fail-closed, tactical entry OFF.
- Stories: G001 Contract → G002 FleetMarkerU1 → G003 0x032f → G004 Move → G005 Warp → G006 zero-fill wire → G007 batch loop → G008 final gate.
- Batch #1: fleet marker/U1 · 0x032f+endian · 0x0b01 · 0x2b Warp · 0x031f(or visible) zero-fill. Git: `peppone-choi/sole` @ `d10143e7` = origin/main.
- Auth: 2026-07-17 push/PR/merge/live. Never: force push, secrets, `server/data/` delete, `.codex/config.toml`, `git add -A`, Wine-only AC as Windows done.
- Causal ledger A01–A15 DONE on main (tooling only; not live gameplay proof). Preserve user `.codex/config.toml`.

## Design invariants
- Close the real chain: input → client state → request → server authority → response → pixels/audio → next input.
- Unknown/Blocked explicit; never silent canonical. Server authoritative; rejected cmds commit nothing.
- Bounded queues/caches/sessions with owner/OOM/metrics. Rights ≠ technical provenance; fail-closed distribution.
- Legacy client untrusted: lineage hash, image base, sentinel required before launch/attach/patch.

## Current evidence and blockers
- **Game gate:** fleet marker/selection blocks 0x032f and Warp live reach. own_cell/commander U1 probe next.
- **2026-07-21 live:** world-enter PASS; fleet marker FAIL (0x032e=0). System view: star colored, **planets = black spheres** = missing 0x031d planet visual payload (user-defined meaning of “planet info not down”). Shots: g002-fleetmarker-r5 + liveqa-manual-planet.
- MoveGrid server path lacks same-correlation real input+pixels. Static tables 208–211 data-absent; zero-fill 0x031f/0321/032b wiring backlog. P0 45/44/46 Wine-host only.

## Live and repository safety
- Port 47900 serial. Native Windows direct EXE; macOS/Linux isolated Wine only.
- No live claim without fresh commands, exit codes, screenshots, cleanup. No secrets/reference transplant.
