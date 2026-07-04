# LOGH VII RE-Backed Coverage Matrix

Updated: 2026-06-15

This document is the strict coverage ledger for playable revival work. It deliberately distrusts
derived content. A server path is not "covered" unless the wire layout, data source, client consumer,
and visible/rendered behavior are tracked separately.

## Evidence Tiers

| Tier | Meaning | May be default server data? |
|---|---|---|
| P0 binary/live | Client binary dispatcher/parser/decompile, TCP capture, or live memory/screenshot proves it. | Yes, if tests and QA pass. |
| P1 shipped data | Original installed/CD data file decoded by a reproducible parser, with client consumer known. | Yes, after parser and consumer proof. |
| P2 official/manual | Official manual/archive/source text, but not yet tied to a binary consumer or shipped data table. | Gated or annotated only. |
| P3 reconstructed | AI-assisted, hand-merged, community, canon enrichment, fallback seed, or synthetic server data. | Never as original/default. |

Default rule: P2/P3 can help UI smoke tests, but must not be claimed as original game data. Promote only
after a reproducible RE artifact points to the source and the client-side consumer.

## Current Totals Under Suspicion

| Source | Count | Current status |
|---|---:|---|
| `content/manual/strategy-commands.json` | 81 commands | P2 official/manual candidate. Needs opcode/consumer mapping per command. |
| `content/manual/org-posts.json` | 121 posts | P2 official/manual candidate. Needs server role model and client UI consumer. |
| `content/manual/ship-units.json` | 64 hull entries | P2 official/manual candidate. Needs original ship table or field-by-field binary consumer proof. |
| `content/manual/unit-types-deployments.json` | 38 unit types, 65 deployments | P2 official/manual candidate. Needs original scenario/deployment source proof. |
| `.omo/work/command-catalog.json` | 56 UI command labels | P1/P2 hybrid: extracted from installed `MsgDat/constmsg.dat`; labels are real, opcode mapping still needs binary consumer proof. |
| `content/galaxy.json` | 80 systems, 281 planets, 6 fortresses | P2 official/manual PDF annotations. `0x031d` wire is P0; names/positions still need shipped-data/live-memory cross-check before original-data claim. |
| `src/server/logh7-canon-content.mjs` | baseline nations/ships/characters/scenario | P3 reconstructed gameplay seed. Useful for tests and local experiments; not original server data. |

## Highest Priority: Marker Rendering / Interaction

| Surface | Evidence status | Current result | Next RE action |
|---|---|---|---|
| `0x0313` object table | P0 wire layout: `FUN_004ba2b0` copies 301B to `clientBase+0x3f57d4`; docs pin bytes 0..2. | Server can emit class-3 objects. | Confirm payload reaches staging/live during the scene transition, not just server trace. |
| `0x0315` sector grid | P0 wire layout: size `0x138c`, RLE decoder `FUN_004abbb0`, live table at `clientBase+0x2c03cc`. | Non-empty early grid can stall world-init; P11 markerfix reached traffic but not render mode. | Instrument `FUN_004b76e0` / `FUN_004b68f0` state flags and `FUN_004c5350` copy timing. |
| Strategic scene mode | P0 gate: `clientBase+0x126711`; P11 observed `mode=0`, expected strategic `2`. | Not rendering; live/staging marker counts remained zero. | Find which gate sets `0x126711` and what prevents `FUN_004b64c0`/`FUN_004d3bd0` build. |
| Click interaction | P0-ish partial: click requires rendered class-3 cell and mode-specific input path. | Not live-proven after P11. | Do not claim move/click UX until screenshot + outbound command trace proves it. |

Marker conclusion: server marker data is necessary but insufficient. Playability requires scene-mode
transition, render build, visible markers, and click emission.

## Wire / Data / UI Coverage

| Area | Wire layout | Data source | Server implementation | Render/UI QA | Status |
|---|---|---|---|---|---|
| Cipher/transport `0x0034/0x0035/0x0036/0x0030` | P0 binary/capture | N/A | Implemented | Login path used by live sessions | Covered core. |
| Lobby/session `0x2005 -> 0x2006` | P0: `FUN_00444900`, fixed `0x5304`, stride offsets | Server scenario records are synthetic unless backed by scenario file later | Implemented with `buildInformationSessionInner` | Server-surface parsed dump only | Wire covered; scenario data pending. |
| Character record `0x0322 -> 0x0323` | P0 parser/consumer offsets for IDs/HUD/name fields | Mixed: live-created chars P0-ish; roster/abilities often P2/P3 | Implemented in multiple paths | A6 default char live-proven; charId 209 crash pending | Covered for default flow only. |
| Static system/base `0x031c -> 0x031d` | P0 dispatcher size/copy and parser caps | `contentPack.systems` currently P2/P3 unless source individually proven | Implemented P12 | Server-surface parsed dump only | Wire covered; source and live render pending. |
| Dynamic base `0x031e -> 0x031f` | P0 case `799`, size `0x604`, copy to `+0x3facf4`; field offsets partial | `planet-economy.json` / manual values are suspect | Not wired intentionally | None | RE-first blocker. Do not substitute `0x0337`. |
| Institutions `0x0320 -> 0x0321` | P0-ish builder from info-record RE | Current seed is minimal/synthetic | Implemented for non-empty panel | Unit tests only | Needs original data source. |
| Warehouse/package `0x0326/0x0328` | P0-ish builders exist | Data source not proven | Builder exists, not fully wired in login-session | None | Pending. |
| Outfit/unit panels `0x032a/0x032e/0x0324` | P0-ish builders and sizes | Units/content mixed provenance | Implemented minimal paths | Unit tests only | Needs live UI and data proof. |
| Strategic commands `0x0900..0x0908` | P0 dispatcher/size and module parsers | Manual command semantics P2 | Implemented partial state machine | Tests only | Protocol covered; full manual semantics not. |
| Logistics `0x0b/0x0c/0x0e` | P0 codes/sizes from dispatcher | Semantics/data partial | Implemented echo/notify subset | Tests only | Needs live UI/click proof. |
| Battle/tactics `0x0400..0x0442` | P0 dispatcher and several parser docs | Ship stats/manual data suspect unless field source proven | Implemented broad command/notify subset | No full rendered battle proof here | Needs tactical render QA. |
| Personnel `0x0704..0x070b` | P0 dispatcher and parsers | Rank/post/manual data P2; roster P2/P3 | Implemented rank/card subset | Tests only | Needs role model and live UI. |
| Social/mail/messenger `0x0f05..0x0f1e` | P0 dispatcher and parsers | Runtime state server-owned | Implemented broad subset | Tests only | Needs two-client live QA. |
| Manual 81 strategy commands | P2 manual list | Not enough to imply opcode or behavior | Partially overlaps strategy/logistics/personnel/battle/social | Not covered as a whole | Needs command-by-command mapping. |

## Immediate Rules For Further Work

1. Do not add a default server response from `content/*.json` unless the row has P0/P1 data provenance.
2. When adding a response, split tests into wire-shape proof and data-source proof.
3. UI/rendering coverage requires a screenshot or live memory + outbound command trace. A passing server test is not enough.
4. For marker work, prioritize client scene/state gates over new server marker variants until mode `0x126711` reaches the render path.
5. For manual coverage, every command needs: manual name, opcode, client input parser, server handler, data source, test, live UI status.
6. `CANON_CONTENT` and content DB fallbacks may stay as opt-in/playability seeds, but every field must be marked P2/P3 until direct RE upgrades it.
