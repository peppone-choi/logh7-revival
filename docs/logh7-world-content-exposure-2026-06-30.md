# LOGH VII World Content Exposure - 2026-06-30

Purpose: make the galaxy/planet/celestial content contract explicit before adding more playable interactions.

## Consumed Opcodes

- `0x0312 -> 0x0313`: static strategic object table. Object record is `[labelSubId, class, variant]`; class `3` is the clickable system marker path.
- `0x0314 -> 0x0315`: static strategic cell grid. `FUN_004abbb0` RLE-decodes `width * height` cells; marker cell values index the `0x0313` object table.
- `0x031e -> 0x031f`: base/planet information records for the base-management panel. Parser anchor: `FUN_00414c70`.
- `0x0320 -> 0x0321`: base institution/facility records.

## Current Content Contract

- Systems: 85 canon roster entries in `server/content/galaxy.json`.
- Strategic markers: 80 coordinate-confirmed manual star-chart systems are placed into `0x0315`. The remaining 5 have P3 virtual playable overlay coordinates only; they must not be promoted to original/canon coordinates.
- Planets: 300 planets are present in both the content pack and `server/content/planet-economy.json`.
- Special bodies: 3 black holes + 3 neutron stars are P1 existence/count from `Null_galaxy.mdx`; exact grid-cell placement is still P3/unverified and must stay labeled that way.

## Guard Added

`server/src/server/logh7-world-content-exposure.mjs` now builds a pure exposure catalog and validator over the live content pack:

- decodes `0x0315` back to 100x50 cells;
- checks 80 strategic markers are present;
- checks `0x0313` records match the corresponding system `contentId` and class `3`;
- checks content/economy planet counts stay aligned at 300;
- checks black-hole/neutron-star counts stay 3/3;
- records the opcode contract used by the real client consumers.

Test:

```bash
cd server
node --test tests/server/logh7-world-content-exposure.test.mjs tests/server/logh7-base-record.test.mjs tests/server/logh7-strategic-grid-provenance.test.mjs tests/server/logh7-content-adapter.test.mjs
```

This is not a claim that the 5 coordinate-pending systems or special-body cells are original server data. It is a guard that the currently playable map, planet economy, and consumed opcode paths remain connected while those original mappings are recovered.
