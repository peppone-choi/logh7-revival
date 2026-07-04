# LOGH VII Data Package

## Scope

This directory is the canonical server-side data/spec bootstrap package for the
LOGH VII revival. It no longer owns the old playable protocol server,
launcher/runtime, EXE patch builders, or diagnostic client automation.

## Owns

- `content/`: preserved and generated LOGH VII data, extracted resources,
  manual-derived records, roster/galaxy/economy fixtures, and provenance
  manifests.
- `src/server/`: pure modules for source provenance, source inventory, MDX
  cataloging, Null_galaxy fixture extraction, TCF archive/slot cataloging, TCF
  portrait payload decode cataloging, controlled BMP sample export, logistics
  allocation cataloging, explicit allocation authority rules, ship stat
 cataloging, explicit pool-readiness rules, operation planning cataloging,
 first operation state reducer,
  and explicit operation draft-gate rules.
- `tools/`: CLI wrappers that regenerate committed/generated catalogs and
  controlled evidence exports.
- `tests/server/`: node:test coverage for the current data/spec pipeline only.

## Does Not Own

- Legacy client EXE modification, playable EXE builders, JSON patch descriptors,
  Frida hooks, or direct game-client runtime.
- Historical auth/gameplay TCP server runtime removed during the 2026-07-03
  bootstrap cleanup.
- Tool caches, local RE scratch space, downloaded reverse-engineering tools, or
  assistant state.

## Rules

- Treat original media, installed game data, manuals, Ghidra exports, and
  extracted resources as evidence inputs.
- Do not infer facts that are not present in the source being cataloged. For
  example, `Null_galaxy.mdx` gives star template names/classes, not positions.
- Generated catalogs must be reproducible from `content/original-data` source
  roots and installed preserved data.
- Keep runtime dependencies minimal; use Node built-ins unless a current
  requirement justifies otherwise.

## Verification

```bash
npm test
npm run inventory:sources
npm run catalog:logistics-allocation
npm run catalog:mdx
npm run catalog:null-galaxy
npm run catalog:operations
npm run catalog:ranks-promotion
npm run catalog:ship-stats
npm run catalog:strategy-commands
npm run catalog:tcf
npm run catalog:tcf-portraits
npm run export:tcf-portraits -- --limit-per-archive 2
npm run verify:source
```
