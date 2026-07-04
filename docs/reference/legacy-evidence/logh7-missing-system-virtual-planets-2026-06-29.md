# LOGH VII Missing-System Virtual Planets

Date: 2026-06-29

Status: P3 design hypothesis only. This is not canon, not recovered server data, and not to be merged into `server/content/galaxy.json` without an explicit experimental overlay policy.

## Design Premise

The current minimap reconciliation leaves five likely coordinate candidates:

| Candidate | Cell | Proposed system | Faction hypothesis |
|---:|---:|---|---|
| 9 | `(17,43)` | `ケープホーン` | Alliance |
| 11 | `(23,39)` | `コブラヴェルデ` | Alliance |
| 12 | `(31,8)` | `アンウレガルラ` | Alliance |
| 13 | `(37,37)` | `モンサルヴァール` | Alliance |
| 19 | `(77,19)` | `ニーベルング` | Empire |

For the Alliance side, treat the names as settler memory names from the long voyage toward Barat: dangerous capes, islands, old cultural maps, and mythic names carried by emigrants. For the Empire side, keep the Germanic/Wagneric naming logic.

## Proposed Planets

### `ケープホーン` at candidate 9

Reason: south-west Alliance frontier, geography and sea-route naming.

| Orbit | Virtual planet | Theme |
|---:|---|---|
| 1 | `フエゴ` | Tierra del Fuego; harsh inner frontier |
| 2 | `ナバリノ` | Navarino; habitable harbor world |
| 3 | `ドレーク` | Drake Passage; storm-route/naval waypoint |
| 4 | `マゼラン` | Magellan route; remote logistics world |

### `コブラヴェルデ` at candidate 11

Reason: lower-left Alliance cluster near `リオ・ヴェルデ`; geography/Verde naming.

| Orbit | Virtual planet | Theme |
|---:|---|---|
| 1 | `サンティアゴ` | Cape Verde place-name memory |
| 2 | `ボア・ヴィスタ` | Cape Verde place-name memory |
| 3 | `サン・ヴィセンテ` | Cape Verde place-name memory |
| 4 | `サント・アンタオン` | Cape Verde place-name memory |

### `アンウレガルラ` at candidate 12

Reason: upper-left Alliance ancient-myth cluster near `シヴァ`, `ハダト`, and related old-culture names.

| Orbit | Virtual planet | Theme |
|---:|---|---|
| 1 | `エリドゥ` | ancient Sumerian origin/city memory |
| 2 | `ウルク` | ancient Sumerian city memory |
| 3 | `ニップル` | ancient Sumerian sacred-city memory |
| 4 | `ラガシュ` | ancient Sumerian city memory |

### `モンサルヴァール` at candidate 13

Reason: Alliance-side myth/culture cluster near `ガンダルヴァ`, `シャンダルーア`, and `マル・アデッタ`. Treat Montsalvat as a mixed real-place/art/Grail memory name rather than strictly Empire-Germanic.

| Orbit | Virtual planet | Theme |
|---:|---|---|
| 1 | `エルサム` | real-world Montsalvat/Eltham place context |
| 2 | `ヤラ` | regional river/place-name memory |
| 3 | `グラアル` | Grail/Parsifal cultural memory |

### `ニーベルング` at candidate 19

Reason: the only strongly Empire-coded missing name; right-side blank/passable candidate near Germanic/imperial clusters.

| Orbit | Virtual planet | Theme |
|---:|---|---|
| 1 | `ラインゴルト` | Ring/Nibelung cycle; inner resource world |
| 2 | `アルベリヒ` | Nibelung figure; industrial/mining world |
| 3 | `ミーメ` | Nibelung figure; workshop/shipyard world |
| 4 | `ジークフリート` | heroic outer settlement/fortified world |

## Implementation Rule

If this ever becomes a runnable experiment, do not mark it as manual/raster/canon. Use an explicit authority label such as:

`MINIMAP_P3_VIRTUAL_OVERLAY`

Keep the experiment separate from canonical recovered data until live behavior or a stronger source supports it.

Machine-readable companion:

`RE/.omo/ghidra/minimap/missing_system_virtual_planets_p3.json`

