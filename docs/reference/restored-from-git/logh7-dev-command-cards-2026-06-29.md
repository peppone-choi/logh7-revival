# LOGH VII Dev Command Cards - 2026-06-29

2026-06-30 RE exposure update:

- `0x002b` is now P0 statically anchored to `FUN_00581c80` (`SelectGrid`, request `0x0b01`, response `0x0b07`) via `DAT_00c9e3a8`; `0x0041` is anchored to `FUN_00584c90` via `DAT_00c9e400`. This proves the factory slots, not the canonical authority-card mapping.
- Admin `devCommandCatalog` now exposes `factoryAnchors` and per-command `factoryAnchor`; route summaries expose `factoryProvenance`, and new admin snapshots also report `worldFactoryAnchors`.
- `contentExposure.opcodeContract` now lists `0x0304->0x0305 StaticInformationCard` and `0x0306->0x0307 StaticInformationCardCommand` as `known-builder-not-default`. They stay non-default because live evidence shows populated world-walk delivery can stall or fail to populate the native resident table.
- `decodeStaticInformationCardMenuFields()` now machine-checks the native menu consumer contract: `FUN_004f5cb0` reads `0x0305` card `record+0x14` as row count and `record+0x16` as u16 factory ids, with widget id `factory+0x43`.

This playable-route shim is not canon.

- 2026-06-30 correction: keep `LOGH_COMMAND_TABLE_PRELOAD_PROBE=0` and `LOGH_DEV_COMMAND_GRANT_ALL=0` in the standard live profile. The generic server-delivered card preload path proved useful as data exposure, but it did not populate the native resident command table reliably and can stall world load.
- The current fast dev route is explicit runtime resident-table injection: `python -m tools.logh7_c002_playable_route ...` injects category 0 factories `0x002b,0x0041`, dispatches through the native command manager, then verifies `0x0b01` and `0x0b07`.
- 2026-06-30 target model: `server/src/server/logh7-dev-command-cards.mjs` now exposes a separate dev catalog (`devCommandExposureCatalog`) that keeps wire-facing card records minimal but attaches category route, candidate opcode family, and required target kinds for tooling. `server/src/server/logh7-command-targets.mjs` seeds every required dev target class: base/planet, character, outfit, ship, ground troop, package, grid cell, fighter, weapon, operation plan, post, rank, power, and resources.
- Category 0 keeps previous probe factory ids `0x002b` and `0x0041` for compatibility. These are P3/dev-only until the original authority-card and factory-id mapping is recovered from client/manual/assets.
- Commands that need targets must use the playable target pool now: warehouse ships/troops (`0x0327`), outfit-party ships/troops (`0x032f`), package candidates (`0x0329`), grid/fleet movement targets (`0x0b01`/`0x0b07`), and dev-only fighter/weapon/personnel/political placeholders until the exact original consumers are recovered.
- Remove the dev module once canonical authority-card ownership and factory ids are recovered.
 
- 2026-06-30 target-slot exposure: dev catalog entries include `targetSlots[]` with `available/count/samples` and `missingTargetKinds[]`, so every dev card/command shows what target it needs before execution. `/admin/session-state` now exposes `world.commandTargets` and `world.devCommandCatalog` after command processing creates the shared target pool.
