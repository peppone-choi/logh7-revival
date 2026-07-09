# LOGH VII DB/backend/client data contract

Generated: 2026-06-16
Updated: 2026-06-21

This document fixes the boundary between recovered content data, authoritative server state, and the
wire records consumed by `G7MTClient.exe`. The rule is simple: the DB never crosses the client boundary
raw. Every value must be converted by a parser-specific protocol builder with known size, endian, and
offset rules.

## Layer Contract

| Layer | Stable format | Owner | Must not contain |
| --- | --- | --- | --- |
| Content seed | `content/*.json` and extracted audit JSON | recovered/manual/provisional source data | live session state, account state, mutable world state |
| Content DB | SQLite catalog from `src/server/logh7-content-db.mjs` (`content/logh7-content.db`) | recovered/manual/provisional content catalog built from seeds | live session state, original-server-only coordinates claimed as recovered |
| Backend state | in-memory authoritative JS objects plus SQLite persistence | authoritative replacement server | raw client parser buffers as business data |
| Client wire | encrypted `0x0030` transport carrying app inners; S->C conn3 mostly message32 `[u32 0][u16 BE code][body]` | `logh7-login-protocol.mjs` and record builders | DB rows, JSON object shapes, guessed variable layouts |
| Client local resources | installed EXE, MsgDat/constmsg, images/models/fonts | original install plus Korean overlay | server-owned dynamic state |

## Content DB

Current schema source: `src/server/logh7-content-db.mjs`.

| Table family | What it can seed | Provenance boundary |
| --- | --- | --- |
| `nations`, `abilities`, `ranks`, `social_classes`, `growth_rules` | faction/rank/class labels and ability schema | recovered/manual catalog |
| `star_systems`, `planets`, `fortresses` | strategic catalog, names, orbit order, manual map annotation centers | not original live server positions unless separately proven |
| `posts`, `roster`, `characters`, `ivex_roster` | duty/post labels, known/canon names, IV EX reference stats | mix of manual, prior-game reference, and reconstructed joins |
| `strategy_commands`, `unit_types`, `ship_classes`, `deployments` | command catalog, ship/unit seed data | command existence is real; runtime availability/state is server-authored until proven |
| `client_strings` | constmsg/MsgDat index lookup | local resource truth, not dynamic game state |

JSON files under `content/` are initial seed/source files. They are allowed to be regenerated from manual,
asset, or RE evidence, then imported into SQLite. They are not live mutable state.

DB rows are read through `logh7-content-source.mjs`, adapted by `logh7-content-adapter.mjs`, then normalized by
`createContentPack()` in `logh7-content-pack.mjs`. That content pack is still a seed. Runtime fields such as
selected character, current spot, office room, command cooldowns, fief owner, active battle participants, damage,
and ending condition belong to backend state.

As of 2026-06-21, star-system `canonCol/canonRow` and `spectralClass` are imported from the actual page-101
raster star circles (`content/galaxy-raster-star-centers.json` -> `content/galaxy.json` -> SQLite). The JSON is
the seed; `content/logh7-content.db` is the deployable content catalog.

## Backend State

The backend must own these runtime objects before it can claim normal play:

| Runtime object | Required fields | Current status |
| --- | --- | --- |
| account | login id, lobby character slots, selected session | implemented enough for live lobby/session flow |
| generated character draft | `power`, `blood`, `sex`, names, birth, face, abilities, rank suffix, flagship | live-tested for Empire and Alliance |
| world player anchor | selected character id, unit id, focus character, PLAYER_INFO seed | live-tested for world entry |
| strategic location | current system/spot, owner, fleet cell, unit map section | authored defaults/env overrides; not original-server recovered |
| office/post state | post id, room id, occupant, permitted commands | not recovered; builders exist for related info records |
| fief state | noble title, fief owner, planet/fortress id, tax split, estate room | real system in strings/manual; authoritative state not implemented |
| combat state | ships, units, ownership, pose, target, damage, morale, battle mode | builders/engines exist; full live battle loop still needs QA |

Persistence split:

| State | Default deploy file | Notes |
| --- | --- | --- |
| content catalog | `content/logh7-content.db` | built from JSON seeds; read-only during normal server runtime |
| accounts | `logh7-runtime/state/accounts.sqlite` | admin/signup writes here; legacy JSON may be imported through `LOGH_ACCOUNT_SEED_JSON` only |
| world snapshot | `logh7-runtime/state/world-state.sqlite` or `LOGH_SQLITE_PATH` | repository `sqlite` backend; optional JSON seed comes from `LOGH_SNAPSHOT_SEED_JSON` |

`createRepository()` defaults to SQLite. Runtime JSON persistence is disabled: `LOGH_REPOSITORY_BACKEND=json`
or `LOGH_PERSIST_BACKEND=json` must fail. JSON files are allowed only as initial seed/import inputs such as
`content/*.json`, `LOGH_ACCOUNT_SEED_JSON`, or `LOGH_SNAPSHOT_SEED_JSON`; once the server runs, account and
world mutations are written to SQLite.

## Client Wire

Only these parser-specific builders should cross into the client:

| Surface | C->S request | S->C downlink | Body contract |
| --- | --- | --- | --- |
| login/lobby OK | `0x0020`, `0x2000` | `0x2001` | message32 OK is the working live path; raw is A/B only |
| session list | `0x2005` | `0x2006` | packed sequential parser stream, not fixed stride wire |
| lobby character cards | `0x2003`, `0x034e` | `0x2004`, `0x034f` | compact card/list streams |
| create character | `0x1008` | `0x1008` | 128-byte packed OK stream parsed by `FUN_004066f0`; not an id/status tuple and not a DB row |
| selected character | world-init | `0x0204` | selected character id |
| world character record | `0x0322` or server push | `0x0323` | fixed 724-byte record; id/unit anchors plus parentage/name/rank/face fields |
| world unit table | `0x0324` or server push | `0x0325` | fixed 52804-byte unit table; minimal row is live-safe, rich fields are still P3 |
| strategic object/cell map | `0x0312`, `0x0314` | `0x0313`, `0x0315` | fixed 5004-byte object table and RLE cell grid |
| ship-class master | `0x030a` | `0x030b` | fixed 0x6d64 body; source is JSON/SQLite seed data, but normal live path sends only the current 19-row safe cap while `LOGH_STATIC_SHIPS_LIMIT`/`ONLY` are RE overrides |
| simple deltas | server push | `0x1200..0x120f`, `0x1201` | fixed transaction buffers; do not invent display-name fields in `0x1202` |
| native character delta | server push | `0x0356` | 728-byte native notify body, not byte-identical to response framing |
| facilities/economy/logistics | `0x031e`, `0x0320`, `0x0326`, `0x0328`, `0x032a` | `0x031f`, `0x0321`, `0x0327`, `0x0329`, `0x032b` | fixed info-record bodies from dedicated builders |
| strategic movement | `0x0b01` | `0x0b07` | command/result builders exist; v14b positive-control made the live client emit `0x0b01`, but natural state/destination writers and authoritative `0x0b07` are still unproven |
| tactical combat | `0x04xx` commands | `0x0423`, `0x0424`, `0x0426`, `0x0427`, `0x042f`, `0x0440` | battle builders exist; full session-ending loop not yet live-proven |

## Character Creation Findings

Live QA on 2026-06-16 confirmed the corrected `0x1008` OK contract with the canonical playable EXE
SHA `1f7fad439af2fc7f775b4cdfb2a8e10111ebd5209f98dab8905c9b3b238cc00c`.

| Faction | Live evidence | Confirmed values |
| --- | --- | --- |
| Empire | `.omo/ui-explorer/session-g008-create-wirefix-empire-20260616/shots/029-create-final-card.png` | request `power=2`, origin `blood=2=평민`, rank suffix `0x0d=소위`, final card `제국`, no `통일/황제` fallthrough |
| Alliance | `.omo/ui-explorer/session-g010-create-wirefix-alliance-20260616/shots/023-alliance-final-card.png` | request `power=3`, origin `blood=3=시민`, rank suffix `0x0d=소위`, final card `동맹`, no `통일/황제` fallthrough |

The Alliance memory check at the appointment step also showed the parser output pointer and fixed card buffer
matching, with `power=3`, `blood=3`, `rank=0x0d`, and `check=1`.

## Current Gaps

- Original character name table: not found in installed resources. Friend-supplied portrait labels can become
  `human-labeled` `portraitIndex -> name` data, not recovered base-server data.
- Strategic marker semantics: cells, class-3 markers, and group-0x18 label ids are now mapped through the original
  JP `constmsg.dat` text catalog plus the recovered KO overlay offset table (`イゼルローン=14`, `ルンビーニ=86`).
  Star/fortress type sprites and click/action linkage are still incomplete.
- In-world lower-left HUD: world entry succeeds, but the HUD can still show memory/path-like garbage. Do not hide this
  with guessed `0x1202` names; trace the real HUD string reader or provide correct full `0x0323`/`0x0356` source bytes.
- Session end/galaxy unification: requires backend rules for conquest, fiefs, battles, command availability, and ending
  triggers. These are not DB catalog rows.
