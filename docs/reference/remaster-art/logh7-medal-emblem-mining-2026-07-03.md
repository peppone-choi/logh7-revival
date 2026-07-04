# LOGH VII Medal And Emblem Mining - 2026-07-03

## Result

- Medal list is a data-mined source, not a generated art prompt.
- Original medal names are confirmed from `server/content/client/msgdat.json` / `constmsg.dat` records `767..818`.
- Current localized Korean names are confirmed from `server/content/extracted/dat-tables.json` records `767..818`.
- Original medal image pool is present in the installed CD output: `.omo/work/logh7-installed/data/image/Medal/m_f001..m_f015` as both `.png` and `.tga`.
- The Unity art-source copy is byte-identical under `client-unity/Assets/ArtSource/original/medals/`.

## Catalog

- Generated artifact: `server/content/generated/logh7-medal-mining-catalog.json`
- Regenerate: `npm --prefix server run catalog:medals`
- Validation: `node --test server/tests/server/logh7-medal-catalog.test.mjs`

The catalog records 52 decorations:

- Empire: bits `0..25`, ids `767..792`
- Alliance: bits `26..51`, ids `793..818`
- Icon pool: 15 original stems, `m_f001..m_f015`, 30 files total (`15 png + 15 tga`)

## Remaster Policy

- For Alliance medals, do not generate replacements for the existing original `m_f001..m_f015` medal image pool; upscale/remaster those 15 first.
- For Alliance medals beyond the 15 original icon stems, generate similar variants only if the UI needs unique images.
- For Empire medals, generate new medals from the 26 mined Empire medal names, using the exact Imperial crest reference when a crest appears.
- The current `asset_hint` entries are not final proof of per-medal icon mapping. The exact 52-medal to 15-icon mapping still needs static RE or live UI proof.

## Imperial Crest Policy

- Canon reference: `client-unity/Assets/ArtSource/reference/logh7-imperial-double-eagle-reference.jpg`
- SHA256: `822276b190c3e83729de39c14e4e9fc06c2eb8b39a56225bdcbe16f147134e9e`
- Dimensions: `1000x600`

The crest must remain fully identical in silhouette and internal structure: both wings, the central double-headed/paired-neck form, crossed swords, and the lower point. A simplified/generated crest is not acceptable. Remastering may clean, vectorize, upscale, or material-render the same crest only if shape comparison keeps it equivalent to the supplied reference.

## Generated Imperial Medal Concept

- Concept sheet: `client-unity/Assets/ArtSource/concept/medals/imperial-medal-concept-sheet-2026-07-03.png`
- SHA256: `3149a72089d0b05ca646808b6899f78dbc4dca7af77afbd07b38fdde1c91527e`
- Role: reference-only for material quality, silhouette density, and German Empire / Prussian-inspired craftsmanship.

This generated sheet is not the production Empire set because it was not built from the 26 mined Empire medal names. Its central crest motifs are not exact matches to the supplied Imperial double-eagle reference, so production imperial medals must either composite/vectorize the exact reference crest or avoid crest-bearing centers until that pass is complete.
