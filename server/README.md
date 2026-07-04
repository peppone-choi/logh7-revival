# LOGH VII Data/Spec Bootstrap

This package now contains the evidence-backed data pipeline for the LOGH VII
revival. The old playable protocol server and client-patch helper stack have
been removed from the normal development path.

## What Remains

- Preserved and generated data under `content/`.
- Source provenance manifests under `content/original-data/`.
- Generated catalogs under `content/generated/`.
- Small Node.js catalog modules under `src/server/`.
- Regeneration CLIs under `tools/`.
- Focused node:test coverage under `tests/server/`.

## Commands

```bash
npm test
npm run inventory:sources
npm run verify:source
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
```

`verify:source` currently reports the Archive.org original-media root as missing
until a locally hash-matched BIN/CUE import is present.

## Current Catalogs

- `content/generated/logh7-mdx-catalog.json`: installed MDX file inventory and
  structural header/node-name evidence.
- `content/generated/logh7-null-galaxy-template.json`: star template names and
 spectral classes from `strategy/Null_galaxy.mdx`; it does not contain star
 positions.
- `content/generated/logh7-logistics-allocation-catalog.json`: manual logistics
- `content/generated/logh7-rank-promotion-catalog.json`: manual rank ladder and headcount caps; cap values marked uncertain and lower ranks stay unlimited.
- `src/server/logh7-rank-promotion-rules.mjs`: explicit rank headcount-cap consumer; promotion formulas and fame costs stay unresolved.
allocation authority table normalized by role and unit type.
- `src/server/logh7-logistics-allocation-rules.mjs`: explicit allocation
authority consumer; OCR-null cells stay uncertain.
- `content/generated/logh7-ship-stat-catalog.json`: normalized ship stat
evidence plus side/class counts and pool coverage.
- `src/server/logh7-ship-stat-rules.mjs`: explicit ship pool-readiness
consumer; missing pools stay missing and combat formulas are not inferred.
- `content/generated/logh7-operation-catalog.json`: manual operation purposes,
planning fields, draft gates, 30-day duration, results, unresolved CP range.
- `src/server/logh7-operation-rules.mjs`: explicit operation draft-gate
consumer; CP formula and outcome simulation stay unresolved.
- `src/server/logh7-operation-state.mjs`: first state-changing operation
gameplay consumer; appends planned records only after draft gates pass.
- `content/generated/logh7-strategy-command-catalog.json`: manual strategy
  commands normalized into stable category/command ids plus CP and duration
  classifications.
- `src/server/logh7-strategy-command-rules.mjs`: first gameplay-rule consumer
  for the command catalog; fixed CP is payable/insufficient, variable CP stays
  unresolved.
- `src/server/logh7-strategic-grid-rules.mjs`: strategic grid entry gates from
  the 3628-cell passable mask and manual terrain/navigability restrictions.
- `content/generated/logh7-face-tcf-catalog.json`: Face TCF archive and HED slot
  metadata.
- `content/generated/logh7-face-portrait-catalog.json`: Face TCF portrait payload
  decode evidence using BGRA palettes and bottom-up 8-bit indices.
- `.omo/ulw-loop/evidence/tcf-portrait-bmp-sample/`: controlled visual BMP
  samples from decoded portraits; evidence output, not a full committed dump.

## Boundaries

Legacy live-client tooling is diagnostic/oracle-only. Product work should build
canonical data/spec artifacts and gameplay logic from evidence. Do not restore
Python EXE builders, JSON patch descriptors, Frida runtime patches, direct EXE
launch workflows, or old auth/gameplay server code as normal runtime.
