# LOGH VII page-101 galaxy dot extraction

Updated: 2026-06-21

## Source and method

- Canon source is `gin7manual` page 101 `星系図`.
- Accepted star source is the actual circular star dot center recovered from the page-101 raster audit table:
  `content/galaxy-raster-star-centers.json`.
- PDF vector label/annotation marks remain provenance only. The black inner horizontal line markers and old
  label-center `cx/cy` positions are not used as `canonCol`/`canonRow`.
- The stale `tools/logh7_galaxy_canon_regrid.py` hypothesis remains disabled and was not used.
- Grid is the RE-confirmed 100x50 zero-indexed wire grid. Game coordinates are `canonCol+1`, `canonRow+1`.

Regeneration commands:

```powershell
python -m tools.logh7_galaxy_star_extract --pdf .omo/work/manual_saved.pdf --page 101 --out-dir .omo/work/galaxy-extract --write-content content/galaxy.json
python -m tools.logh7_galaxy_star_extract --rebuild-passable --canon .omo/work/galaxy-extract/canon-positions.json --out content/galaxy-passable-cells.json
```

## Current evidence

- `actualStarDots=80`, `systemsMatched=80`, `rasterSystemsMatched=80`, `annotationMarkersAccepted=0`.
- `content/galaxy.json` has 80 unique canon cells.
- Iserlohn is server cell `[53,12]`, game cell `[54,13]`; `[51,12]` is only corridor floor, not the
  system marker, and the stale annotation line row `[51,14]` is blocked.
- Fezzan is server cell `[51,38]`, game cell `[52,39]`.
- `content/galaxy-passable-cells.json` count is 3626 after closing the wide central gap.
- Central gap `col 48..57` is closed except the two 1-cell-high corridor rows `row 12` and `row 38`.
- All 80 recovered star cells are forced passable so 0x0315 markers do not land in non-navigable terrain.

## Live QA checkpoints

Start the client/server path with terrain enabled:

```powershell
python -m tools.logh7_ui_explorer --session .omo/ui-explorer/galaxy-page101-dot-qa start --port 47900 --no-login --env LOGH_STRAT_TERRAIN=1 --env LOGH_STRAT_GRID=1 --env LOGH_STRAT_GALAXY=1
```

Checkpoints:

- Strategic map terrain is not all black; `LOGH_STRAT_TERRAIN=1` must be present.
- Iserlohn marker appears on the actual red/orange dot line, not the old annotation row.
- Fezzan corridor is a single-cell-high channel through the central gap, not a broad open band.
- The two central corridor rows are the only open rows across `col 48..57`.
- Run `node tools/logh7_dump_strategic_grid.mjs --terrain --out .omo/work/galaxy-extract/live-grid-oracle.json` and confirm:
  `markerOutsidePassable=0`, `duplicateMarkerCells=[]`, and `readyForTerrainLiveSmoke=true`.
