---
name: logh7-extract
description: Recover canonical LOGH VII content from original assets: MDX models, TCF portraits, BMP textures, and the gin7manual PDF star chart.
---

# LOGH VII Asset Extraction

Always inspect or render outputs before trusting a parser.

## Sources

- MDX: scene-graph/model data. `Null_galaxy.mdx` is a template and does not contain real star positions.
- TCF: portrait archives with 18-byte header, 1024-byte BGRA palette, and 8-bit indices.
- BMP/TGA: UI and texture assets. Preserve palette/bit depth when replacing legacy UI pieces.
- Manual PDF: the star chart on page 101 is the canonical source for 80 star positions.

## Star Chart Method

Use PyMuPDF on the manual page and extract vector dots from drawings. Mind page rotation/Y-flip. The recovered data belongs in `server/content/galaxy.json` and related passable-cell content only when provenance is documented.

## Data Grades

- P0: client parser/runtime confirmed.
- P1: official manual/original asset extraction with clear provenance.
- P2: strong derived inference.
- P3: placeholder or design guess. Never present P3 as canon.
