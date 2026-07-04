# LOGH VII Client Map Cache Model

Status: RE working note, 2026-06-30. This separates data the server must send from text/layout the client hardcodes.

## Strategic Map Cache

| Cache | Consumer | Server opcode | Client storage / effect | Notes |
|---|---:|---:|---|---|
| Strategic object table | `FUN_004ba2b0`, `FUN_004c5350`, `FUN_004c8b70` | `0x0313` | staging `clientBase+0x3f57d4`, live object table `clientBase+0x2c1755` | Records are `[byte0 content id, byte1 class, byte2 variant]`. Markers render when `byte1 == 3`. |
| Strategic cell grid | `FUN_004abbb0`, `FUN_004c5350` | `0x0315` | staging `clientBase+0x3f4448`, live cell grid `clientBase+0x2c03cc` | Fixed 5004-byte receive object. Cells index object table. |
| Current grid selector | dispatcher case `0x0317` | `0x0317` | selector dword around strategic grid state | Used as small mode/selector lever; safe postload probe. |
| Static base/system/planet names | `0x031d` dispatcher, SelectGrid panel `FUN_0057aa90` | `0x031d` | static base table around `clientBase+0x2eb800` | Needed so system/planet/base panels do not show unknown spot text before pull. |
| Dynamic base/economy/owner | `FUN_00414c70` | `0x031f` | base economy/owner table around `clientBase+0x3facf8` | Dynamic side of planets/bases. |
| Character records | `FUN_004c2a80`, `FUN_00419300` path | `0x0323` | character table `clientBase+0x36a5dc`/records | Selected character id must match a character whose flagship links to a unit. |
| Unit/fleet records | unit consumer path | `0x0325` | unit table `clientBase+0x41a364` count, `+0x41a368` records | Binds strategic fleet id/location. |
| Grid enter begin/end | `FUN_004c2a80`, `FUN_004c32a0` | `0x0b09`, `0x0b0a` | scene-side placement/linkage | `0x0b0a` triggers player-info/unit linkage after world init. |

## Tactical Map Cache

| Cache | Consumer | Server opcode | Client storage / effect | Notes |
|---|---:|---:|---|---|
| Tactical active-unit seed table | `FUN_004c32a0` | `0x033b` | source table `clientBase+0x4271a8/+0x4271ac`, active pool `clientBase+0x126718` | `FUN_004c32a0` combines this with `0x0325` unit records; it is route into active tactical units. |
| Tactical active-unit pool | many funcs: `FUN_004c0df0`, `FUN_004c1130`, `FUN_004c1c30`, command handlers | built by `FUN_004c32a0` | `clientBase+0x126718` | Most tactical notifies are ignored or no-op if this pool flag is not set. |
| Corps/aggregate table | dispatcher `0x033f` | `0x033f` | tactical corps cache | Server builder size: `0x8ca4`. |
| Shield fill table | dispatcher `0x0341` | `0x0341` | shield fill arrays | Server builder size: `0x5dc4`. |
| Beam-gun fill table | dispatcher `0x0343` | `0x0343` | beam/weapon fill arrays | Size table includes `0x0343`; fire notifies consume values. |
| Tactical characters | `0x0337` dispatcher | `0x0337` | tactical commander/character cache | Do not confuse with provisional base parameter collision history. |
| Tactical bases | dispatcher `0x0345` | `0x0345` | base/fortress tactical cache | Size `0x0204`. |
| Obstacles/hazards | obstacle parser | `0x0347` | battlefield obstacle tables | Circles, gas cloud, asteroid belt, black hole sections. |
| Position unit | battle setup path | `0x0349` | tactical unit positions | Used before mode flip. |
| Position base | dispatcher `0x034b` | `0x034b` | tactical base positions | Size `0x0044`. |
| Mode-change grant | dispatcher case `0x042f`, `FUN_004c1c30` | `0x042f` | tactical mode transition / spawn pose grant | Mode kind `0` enters tactical; mode kind `2` returns toward strategic. Live bisection: `0x042f` alone is safe. |
| Begin tactics signal | dispatcher `0x0f1f`, `FUN_004c1b20` | `0x0f1f` | battle start signal | Full `openBattleField()` tail. Live bisection: current prerequisites are incomplete; default server probes omit it and require explicit opt-in. |

Known full builder order tactical entry: `0x0349 -> 0x033b -> 0x0341 -> 0x0343 -> 0x0337 -> 0x033f -> 0x0345 -> 0x0347 -> 0x034b -> 0x042f -> 0x0f1f`.
Current live-safe default probe order stops at `0x042f`; `0x0f1f` is only for explicit crash/RE sessions.

## Split Of Responsibility

Client patch: hardcoded session-select labels, UI layout, font/glyph, screen text not provided by wire.

Server data: session rows (`0x2006`), strategic object/grid/base/unit/character records, tactical setup tables, command/card tables, and all state mutation notifies.
