# LOGH VII render/interaction server contract

Generated: 2026-06-16

이 문서는 현재 서버가 실제 클라이언트에 렌더링시킬 수 있는 표면과, 상호작용을 만들려면
서버가 추가로 내려야 하는 데이터를 분리한다. 기준은 `G7MTClient.exe` 라이브 증거, 디스패처/파서
역공학, 그리고 현재 서버 코드다. `content/`에서 나온 추정 데이터와 실제 설치 게임에서 확인한
데이터는 섞지 않는다.

## Confidence legend

| Mark | Meaning |
| --- | --- |
| P0 | 클라이언트 파서/디스패처/고정 크기로 와이어 레이아웃이 고정됨 |
| P1 | 실제 클라이언트 라이브 렌더 또는 상태 변화가 확인됨 |
| P2 | 서버 빌더/테스트/정적 분석은 있으나 해당 화면의 라이브 렌더가 별도 확인되지 않음 |
| P3 | 값은 재구성/시드/수동 입력이며 원 서버 데이터로 증명되지 않음 |
| BLOCKED | 렌더 또는 데이터는 일부 있으나 목표 상호작용까지 가지 못함 |

## Current verdict

렌더링 가능한 것:

| Surface | Server downlink | Current status |
| --- | --- | --- |
| Lobby login/session/character cards | `0x2001`, `0x2003->0x2004`, `0x2005->0x2006`, `0x2009->0x200a`, `0x1008` | P1. 로비, 세션 행, 캐릭터 생성/선택 흐름은 실클라에서 통과했다. |
| In-world HUD admission | `0x0204`, `0x0325`, `0x0323`, `0x0f03`, `0x0f06->0x0f07`, `0x0b09`, `0x0b0a`, `0x0356` | P1/P2. HUD 진입, PLAYER_INFO, current-character selection payload count=1은 확인. 단, 선택 row/actionability gate는 아직 열리지 않아 command row는 비어 있다. G247 QA에서 조기 `0x0f02` 위치 주입은 회귀 위험으로 분리됐고, 기본 스폰은 최소 레코드로 유지한다. |
| Strategic map marker slots | `0x0313` object table + `0x0315` cell grid | P1 partial. G225에서 class-3 object/marker slot 생성은 확인. G251에서 group-0x18 `byte0` label id는 원본 JP catalog + KO overlay layout merge로 복원(`イゼルローン=14`, `ルンビーニ=86`). 항성/요새 종류 스프라이트와 행성 companion data는 아직 올바르지 않음. |
| Character/personnel info | `0x0322->0x0323`, `0x034e->0x034f`, opt-in `0x0304->0x0305`, `0x0306->0x0307`, `0x0356` | P1/P2. 캐릭터 레코드와 compact `0x0356` current-character notify는 라이브 확인. 직무카드 테이블은 전송 안전성이 확인됐지만 명령 활성화에는 불충분. |
| System/base static info | `0x031c->0x031d` | P1. 생성 캐릭터 경로의 Now Loading stall을 해소하고 월드까지 진행. |
| Base dynamic/facility/logistics panels | `0x031e->0x031f`, `0x0320->0x0321`, `0x0326->0x0327`, `0x0328->0x0329` | P0/P2. 레이아웃은 고정. 값은 대부분 P3 시드 또는 0. |
| Outfit/unit/tactics tables | `0x0324->0x0325`, `0x032a->0x032b`, `0x032e->0x032f`, optional `0x033b` | P0/P2. 월드 진입용 unit anchor는 P1. 세부 값은 P3. |
| Tactical movement/combat notifies | `0x0423`, `0x0424`, `0x0426`, `0x0427`, `0x0429`, `0x042a`, `0x042f`, `0x0437`, `0x0440` | P0/P2. 빌더와 command engine은 존재. 별도 tactical full-loop QA가 필요. |

상호작용 가능한 것과 막힌 것:

| Interaction | Status | Evidence boundary |
| --- | --- | --- |
| Lobby character/session flow | Working | `0x2003/0x2005/0x2009/0x1008` 흐름은 실클라로 확인. |
| In-world HUD/mail/info loop | Working but weak | `0x0f08->0x0f09`는 확인됐지만 전략 gameplay loop가 아니다. |
| Strategic movement | BLOCKED | v14b positive-control은 실클라에서 `0x0b01` 송신까지 열었지만, 자연 입력의 `DAT_009d2a3c` 전이와 유효 목적지 writer가 아직 없다. `0x0b07` 권위 루프도 유효 payload 뒤에 검증해야 한다. |
| SelectGrid/command menu | BLOCKED | command row, SelectGrid factory, child command object, `SendWarpCommand` object는 확인됐다. 최신 blocker는 target 상태에서 `DAT_009d2a3c=1`이 자연히 `2`로 전이되지 않고 `DAT_009d2a40`이 `0xffffffff`로 남는 점이다. |
| Office/room actions | BLOCKED | `0x0321` 시설/spot 레이아웃은 있으나 집무실/방 위치, 점유자, 행동 컨텍스트가 서버 상태로 회수되지 않았다. |

## Server data required by surface

### 0. DB/backend/client round-trip contract

Canonical detail: see `docs/logh7-db-backend-client-contract.md`.

The database is a **content seed/read catalog**, not the live protocol state. The backend owns runtime
state in memory, shapes it into client-parser-specific wire records, and only then sends it to
`G7MTClient.exe`.

| Layer | Format | Current owner | What crosses the boundary |
| --- | --- | --- | --- |
| Content DB | SQLite via `src/server/logh7-content-db.mjs` (`content/logh7-content.db` by default) | recovered/manual/provisional content catalog | `nations`, `abilities`, `ranks`, `social_classes`, `star_systems`, `planets`, `fortresses`, `posts`, `roster`, `characters`, `ivex_roster`, `strategy_commands`, `unit_types`, `ship_classes`, `deployments`, `client_strings` |
| Backend read model | JS content-pack/world/account objects | `createContentPack`, content adapter/source, `createLoginSession`, world-state modules | account label, lobby character slots, selected session/character, generated-character draft, current location seed, unit/fleet anchors, posts, facilities, economy, battle state |
| Client wire | transport `0x0030` inner messages; lobby/SS usually message32 `[u32 0][u16 BE code][payload]` | protocol builders in `logh7-login-protocol.mjs` and record modules | packed, fixed, or compact payloads consumed by client parser/dispatcher: `0x1008`, `0x2004`, `0x0323`, `0x0325`, `0x0313`, `0x0315`, `0x0321`, `0x0327`, `0x0329`, tactical notifies |

Confirmed implications:

- DB rows must not be sent raw. Every downlink needs a client-specific record builder with proven size,
  endian, and offset rules.
- Dynamic gameplay fields are server state, not DB truth: selected character, current system/spot, current
  office room, fief owner, fleet position, active unit, command cooldowns, battle damage, and session ending.
- When original server state is missing, the server may seed a reconstructed value, but it must be tagged as
  authored/provisional. Do not mix that with installed-game or base VII evidence.
- The DB schema currently carries systems/planets/posts/characters/commands, but it does not carry original
  room coordinates, starting planet/office, fief ownership, or original session progression. Those must be
  recovered or authored as separate server-origin tables before they can be treated as gameplay state.

### 1. Lobby and character identity

Server must send:

| Field family | Messages | Required data |
| --- | --- | --- |
| Account/session list | `0x2005->0x2006`, `0x2009->0x200a` | session id, selectable status, session name, world endpoint token/ip/port |
| Character card list | `0x2003->0x2004`, `0x034e->0x034f` | character id, status, display name, face/portrait index, faction/rank/ability fields |
| Create character echo | `0x1008` | 128-byte packed OK stream parsed by `FUN_004066f0` into fixed `DAT_02227f60`; server id stays in backend state and later surfaces through `0x2004`/`0x0204`/`0x0323` |

Current name rule:

- `characterDisplayName()` uses `name`, `name_ja`, then romaji fallback.
- Active installed CP949 MsgDat and IV EX Korean names are not default VII base data.
- Installed-game mining did not find a full character naming table.
- Friend-provided portrait labels should be ingested as a separate human-labeled mapping, not as recovered
  server data. If each portrait slot gets a label, we can map `portraitIndex -> name_ja/romaji/source`, then
  feed `0x0323`/`0x034f` names and face fields consistently.

### 2. World admission and HUD

Server must send:

| Message | What it must carry |
| --- | --- |
| `0x0204` | selected character id |
| `0x0325` | unit table with `unitCount > 0` and `unit[0].id == characterRecord.gridUnitId` |
| `0x0323` | information-character record with `characterId == selected id`, `gridUnitId`, abilities, face, seat entries |
| `0x0f03` | GridInitialize OK, sent after the player anchor records |
| `0x0b09` / `0x0b0a` | grid-enter begin/end, with `0x0325`/`0x0323` refreshed between begin/end on the full path |
| `0x0356` | compact NotifyInformationCharacter stream parsed by `FUN_0042c7e0`; BE wire fields expand through `FUN_004c0400` into the native current-character object with `characterId@0x04`, `gridUnitId@0x24`, `seatCount@0x250`, seats at `0x254` |

Important gate:

- `0x0323` and `0x0356` are not interchangeable. `0x0323` is the response record path; `0x0356` is a
  compact notify stream whose parser writes the native current-character object. Reusing the swapped `0x0323`
  payload for `0x0356` corrupts the current-character payload; sending the compact stream with LE wire fields
  also corrupts the list payload. The current confirmed wire uses BE numeric fields while preserving LE/UTF-16
  name strings inside the stream.

Current player/location data now tracked by the server:

| Location field | Downlink | Current source |
| --- | --- | --- |
| selected character | `0x0204` payload, client global `client+0x3584a0` | `activeCharacterId()` |
| current spot/system | `0x0323` character `spot@0x1c` | Post-load/direct record path uses `LOGH_WORLD_SPOT_ID`, else character `spot/currentSpot`, else `1`; early `0x0f02` only sends this when `LOGH_EARLY_WORLD_LOCATION=1` |
| current spot owner | `0x0323` character `spot_owner@0x20` | Post-load/direct record path uses `LOGH_WORLD_SPOT_OWNER`, else character `spotOwner/power/faction/nationId`, else `1`; early `0x0f02` only sends this when `LOGH_EARLY_WORLD_LOCATION=1` |
| flagship/unit link | `0x0323` `flagship@0x24` and `0x0325 unit.id@+0x00` | `LOGH_WORLD_UNIT_ID`, default `1` |
| strategic fleet cell | `0x0325 unit.cell@+0x0c` | Only when `LOGH_FULL_UNIT_LOCATION=1`; value is `LOGH_FLEET_ROW * 100 + LOGH_FLEET_COL`, defaults `25*100+50 = 2550` |
| unit map section | `0x0325 unit.mapSection@+0x48` | Only when `LOGH_FULL_UNIT_LOCATION=1`; value is current spot id |

This is an authored current-location seed, not recovered original server state. It is deliberately not pushed into
the early live-critical `0x0f02` spawn by default: G247 live QA showed the client still terminates after the first
post-`0x0f03` `0x0300` when early location fields are injected. The safe default keeps `0x0325` minimal and keeps
`0x0323 spot/spot_owner` for post-load/direct-record experiments. It does not prove the original starting system,
planet, office room, or route state.

Text/font QA boundary:

- Protocol QA uses the stock/probe client plus router/FSM patches, so Korean or CP949-only text can appear as `?`.
- Korean glyph QA must use `.omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe` and the CP949 resource overlay.
  G247 confirmed the same lobby surface renders Korean menu labels under the Korean EXE path.

Rank, position, and seat data:

| Concept | Downlink / command | Current state |
| --- | --- | --- |
| create-card rank suffix | `0x1008 OK` packed stream field that expands to working-record `rank@0x5b` | constmsg group 5 subid; new-character default is `0x0d=소위` so the card does not fall through to `황제` |
| military/civil rank | `0x0323` parentage `rank@0xd6`; `0x0356` same native field | server rank-table id; new-character default is Empire `3=소위`, Alliance `4=소위`; canon roster rank data is partial |
| duty/post seat | `0x0323`/`0x0356` `seatCount@0x250`, seat entries `{character, role}` at `0x254` | one active seat is seeded for action-list population; role enum names are not recovered |
| card appointment | C->S `0x0707` `target_outfit@0x10`, `card_character@0x18`, `seat_role@0x1c`, `chief_spot@0x20` | parser/authoritative state exist; live office/post workflow still needs QA |
| organization posts | `content/manual/org-posts.json` | manual-derived: Empire 58 posts, Alliance 63 posts; usable as authoring data, not original server occupancy |

Character creation initial data:

| Source | Fields currently parsed/stored |
| --- | --- |
| `0x1008 CommandGenerateCharacterCharge` | `requestCategory`, `power`, `blood`, `sex`, `lastname`, `firstname`, `face`, `ability_8[8]`, `bonusPoint`, `title`, `rank` |
| `0x1008 OK` parser stream | 128-byte packed card source: `u8 status`, create power `2=제국`/`3=동맹`, origin, names, face, abilities, title, constmsg rank suffix, flagship fields; client expands it into the fixed card record |
| server registration | new id/status, card name/full name, names, create power, backend faction/world power, blood/sex, face, resolved abilities, bonus/title, create rank suffix, 0x0323 rank id, current `spot/spotOwner` |
| validation | name length <= 13 UCS-2 units; created characters reject O-group/canon-reserved faces; all-zero abilities get deterministic house-rule seed |

Faction/origin defaults recovered from the client create screens:

- Empire selection writes create power `2`; Alliance selection writes create power `3`.
- Empire origin defaults to constmsg group 0xf subid `2=평민`; Alliance defaults to subid `3=시민`.
- The bad live card `통일/귀족/황제` was a corrupted packed OK stream that expanded to wrong
  `DAT_02227f60` fields, not a localization phrase. Correct values land at fixed offsets `0x08`,
  `0x09`, and `0x5b` after parser expansion.
- 2026-06-16 live QA:
  - Empire: `.omo/ui-explorer/session-g008-create-wirefix-empire-20260616/shots/029-create-final-card.png`
    rendered `제국`, `평민`, `Flow Lee소위`, flagship `Echo`.
  - Alliance: `.omo/ui-explorer/session-g010-create-wirefix-alliance-20260616/shots/023-alliance-final-card.png`
    rendered `동맹`, `시민`, `Wenli Yang소위`, flagship `Hyperion`.

Gaps: the packed parser now accepts the live five-phase create and persists later face/birth and flagship
name, but not authoritative `flagship_type`/`flagship_kind`. Original starting system, planet, office room,
and command-duty assignment are still server-authored defaults unless captured from the original server.

### 3. Strategic map render

Server must send both tables:

| Message | Layout | Data needed |
| --- | --- | --- |
| `0x0313 ResponseStaticInformationGridType` | fixed 5004 body; `payload[0] = count`; records at `1 + value*3` | for each map object value `v`, `[contentId, klass, variant]`; `klass == 3` renders/clicks as marker |
| `0x0315 ResponseStaticInformationGrid` | fixed 5004 body; `[u8 w][u8 h][u16 BE rleByteCount][run,value]...` | 100x50 cells; each nonzero placeable cell carries object value `3..88` |

Current proven render path:

- `0x0315` RLE byte count must be BE.
- `0x0313` first byte is count, not a dummy lead byte.
- With those fixes, the normal playable client populated 81 class-3 marker slots.
- G251 fixed the group-0x18 label id bridge: `content/extracted/msgdat-full.json` supplies the recovered offset table,
  while `content/client/msgdat.json` supplies the original Japanese text rows. The content adapter and live session loader
  now map `イゼルローン -> byte0 14` and `ルンビーニ -> byte0 86` instead of the old `index & 0xff` placeholder.
- That is still not proof of correct full visual semantics. Current `byte2` is only a faction tint
  (`empire=1`, `alliance=2`, default `0`), not a recovered star/fortress/black-hole type.

Data still not original-server authoritative:

- `buildStrategicGalaxyGrid()` projects `content/galaxy.json` manual star-chart annotations into 100x50 cells.
  The source frames are distinct: direct PyMuPDF PDF storage rects fit rendered page-101 icons as
  `displayX=842-pdfCy`, `displayY=pdfCx`, while `content/galaxy.json` already stores the y-flipped/icon-anchor
  normalized frame, so the server grid uses `displayX=contentCy`, `displayY=contentCx`. These are still not
  proven original server coordinates.
- `content/galaxy.json` contains system/planet/fortress names and orbit order, not building positions or live
  room occupancy.
- `content/galaxy.json` has 80 system names and 281 planet names/orbits. `0x0313` carries the one-byte group-0x18
  object label id, not the full flat `constmsg.dat` record id; the label text still comes from the client's installed
  MsgDat resource.
- Fleet/skirmish positions in server content are provisional seeds.

### 4. Strategic movement and SelectGrid

Server can accept and answer once the client emits the command:

| Direction | Message | Server action |
| --- | --- | --- |
| C->S | `0x0b01 CommandMoveGrid` | parse 36-byte body; read `unitId@0x0c`, `destCell@0x10`; validate ownership/actionability |
| S->C | `0x0b07 NotifyMovedGrid` | send 580-byte body; header + up to 70 `{unitId, cell}` entries; include mover too |

Current blocker:

- Real client does not emit `0x0b01` in the tested rendered-map flows.
- `0x0b07` builder is not enough; the missing part is upstream UI/action activation.
- Prior probes show:
  - strategic markers render;
  - PLAYER_INFO/focus/unit gates are open;
  - static command table can contain SelectGrid index `0x2b`;
  - compact BE `0x0356` populates current-character seat count and selection payload count;
  - tested clicks and a `mouse_event(MOVE|ABSOLUTE)` full-window grid sweep do not produce row-hit true,
    selected index, command category, command refresh, SelectGrid, or SendWarp.

What server likely still must provide:

- A current-character/actionability payload that makes HUD selection choose a category/row for a fleet/object.
- Correct mapping from selected object/fleet to action category, selected row, and direct action id.
- Possibly room/institution/current-duty context if command availability depends on office/post state.

This is not solved by:

- only resending `0x0305`/`0x0307`;
- only sending `0x0f09` after `0x0f08`;
- only rendering `0x0313/0x0315` markers.

### 5. Base, planet, institution, office/room panels

Server downlink contract:

| Surface | Messages | Server data |
| --- | --- | --- |
| Static system/base master | `0x031c->0x031d` | base/system id, name/catalog id, grid/class/astronomy/static fields |
| Base defense/development/ownership | `0x031e->0x031f` | up to 4 fixed `0x180` records, id plus transport/outfit/budgeting/budget/commodity arrays |
| Facilities/buildings/rooms | `0x0320->0x0321` | up to 4 bases; each has up to 36 institution records; each has up to 20 spot records |
| Warehouse stockpile | `0x0326->0x0327` | base/outfit/index, reserve ships, reserve troops, supplies/food/mineral |
| Transfer/package manifest | `0x0328->0x0329` | source base, target base, other packages, troop packages |
| Planet economy | provisional `NotifyBaseParameter` builder | population/food/security/ideology/religion/support-type fields, but not dispatcher-pinned as a normal hot-path response |

Known office/room limitation:

- Room names such as `皇帝執務室` can be discovered as labels/catalog entries.
- The server does not yet know original room coordinates, which character occupies each room, or which room/post
  enables which command.
- Therefore "집무실" is currently a name/catalog surface, not a playable office state.

Known planet limitation:

- `0x031d` can carry a selected/static base name, grid, class, and astronomy-like slots.
- Planet names/count/economy are not currently wired into the live session. `content/galaxy.json` carries planet
  names/orbits; `content/planet-economy.json` has procedural population/food/industry; `logh7-base-economy.mjs`
  can shape `NotifyBaseParameter`, but that notify is not dispatcher-pinned or integrated into the hot path.
- Therefore "성계의 행성들" are data-catalogued, not stable in-game rendered planet state.

Empire fief/nobility system:

- Confirmed present in installed/base strings and manual command data. `content/manual/strategy-commands.json`
  contains `叙爵` (index 48, personnel command), `封土授与` (index 53), `封土直轄` (index 54), and `狩猟`
  (index 56, political command: invite someone to a mansion on the lord's own fief planet).
- `content/extracted/dat-tables.json` also contains title labels (`公爵`, `侯爵`, `伯爵`, `子爵`, `男爵`),
  `封土`, `爵位`, local/central tax labels, and explanatory text saying fief tax belongs to the lord.
- Server data needed: noble title/rank, title priority, fief owner character, fief planet/fortress id,
  direct imperial ownership vs noble fief, local/central tax split, mansion/estate room, and private-force effects.
- Current server status: not implemented as authoritative state and no live command/apply loop is proven. Treat as a
  real Empire-side gameplay system that must be authored/recovered, not as flavor text only.

### 6. Tactical battle surfaces

Server builders that can drive tactical render/state:

| Message | Purpose |
| --- | --- |
| `0x042f NotifyChangeMode` | battle-entry grant; seeds participant spawn pose and mode |
| `0x0423 NotifyMovedShip` | ship move in continuous X/Y/Z field |
| `0x0424 NotifyTurnedShip` | ship turn |
| `0x0426 NotifyAttackedShip` | authoritative damage broadcast |
| `0x0427 NotifyFought` | auto-resolved engagement result |
| `0x0440 NotifyMoraleDown` | morale update |
| `0x0429`, `0x042a`, `0x0437` | ground movement/combat/sortie surfaces |

These require server-owned world state: participants, ship ids, ownership, pose, target selection, damage, morale,
and battle/session mode. Builders and command engine exist, but this is separate from the blocked strategic map
movement loop.

## Data provenance rules

Use these buckets in future additions:

| Bucket | Use |
| --- | --- |
| Base installed game | `*.dat.jpbak`, base MsgDat, installed model/image resources confirmed from install tree |
| Active installed overlay | CP949/localized patch files; use only as localization evidence, not base VII truth |
| Official/manual recovered | official site fragments, manual star-chart, scans; mark source and confidence |
| Reconstructed/provisional | local projections, deterministic orbit slots, fleet seeds, default economy |
| Human-labeled | friend-supplied portrait/name mapping; valuable, but must remain labeled as human annotation |
| Server-origin unknown | original strategic coordinates, base/building positions, room occupancy/action context until recovered |

## Authorable data inventory

Data we can safely create or maintain, with provenance labels:

| Data family | Current material | Who can author it |
| --- | --- | --- |
| portrait identity mapping | 514 portrait files; 12 official face-number/name mappings; duplicate groups; friend labels pending | user/friend can label; server can ingest with `human-labeled` source |
| systems/planets | 80 systems, 281 planets/orbits, 6 fortresses from recovered/manual content | we can author coordinates and ownership as reconstruction; must not call it original server data |
| planet economy | 80-system/281-planet procedural economy table | we can tune population/food/industry/security once fields are wired |
| posts/offices | manual org posts: Empire 58, Alliance 63; room labels from schema/MsgDat | we can map posts to rooms/characters; original occupancy still unknown |
| commands | 81 manual strategy commands, including fief/nobility commands | we can map command availability and costs; wire/apply still needs RE where absent |
| units/fleets | content-pack units, ship classes, manual ship/deployment tables | we can seed fleets and positions; original scenario positions unknown |
| fiefs | confirmed labels/commands, no state table | we can create a fief ownership table as reconstructed server data |

## Next evidence needed

1. Capture a fresh real-client strategic command loop: `0x0b01 -> 0x0b07`, or prove an equivalent authoritative
   command/response path.
2. Mine or prove absence of original server world-instance data: strategic coordinates, building/base positions,
   room occupancy, command/action context.
3. Add human-labeled portrait mapping with source tags, then feed `0x0323`/`0x034f` names/faces without claiming
   it was recovered from installed resources.
4. Live-test `0x0321` office/room panels separately: visible panel render, room list population, and whether any
   room/post state changes command categories.
