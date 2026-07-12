# LOGH VII — Strategic-map output information: exhaustive field catalog

Purpose (defensive preservation): to let our authoritative server fill the strategic-map screen
(戦略マップ / 銀河マップ) with correct data, this document enumerates **every output information
item shown on that screen** and traces each to its **server record (inner opcode) + field
(offset / size / endian)**, with evidence, and states **whether our server fills it today**.

Compiled 2026-07-11 from three evidence axes, no new speculation:
1. **Manual** (game-rule ground truth): `docs/reference/*.pdf` via `logh7-manual-canon.md`,
   `logh7-manual-feature-condition-audit-2026-06-30.md`.
2. **Prior RE docs**: `logh7-strategic-map-wire.md`, `logh7-info-records-wire.md`,
   `logh7-proto-info-records.md`, `logh7-proto-strategic-logistics.md`,
   `logh7-proto-personnel-strategy.md`, `logh7-032a-flagship-wire.md`, `logh7-fleet-render-re.md`,
   `logh7-original-ui-reference-2026-06-23.md`, `logh7-ui-coordinate-map.md`,
   `logh7-minimap-mainmap-coord-2026-06-29.md`, `logh7-opcode-reference-2026-06-28.md`.
3. **EXE RE** (canonical `g7mtclient.exe`, sha256 `9c97de2a…`): render/placement functions cited
   from `logh7-strategic-map-wire.md` Part II.

Server-fill status is a **read-only audit** of `server/src/server/` (2026-07-11). Builders:
`logh7-world-records.mjs`, `logh7-galaxy-placement.mjs`, `logh7-deployment-units.mjs`.

Doc-citation shorthand: **SMW**=strategic-map-wire, **W**=info-records-wire,
**PIR**=proto-info-records, **PSL**=proto-strategic-logistics, **PPS**=proto-personnel-strategy,
**F32A**=032a-flagship-wire, **FR**=fleet-render-re, **UIR**=original-ui-reference,
**MIN**=minimap-mainmap-coord, **OPC**=opcode-reference, **CANON**=manual-canon (pNN = manual page).

Endianness note: S→C `Information*`/`Notify*` bodies are little-endian **once stored**; the inner
2-byte opcode is big-endian; the `0x03xx` family (0x0323/0x0325/0x032b/0x031d) is packed **big-endian
on the wire** and converted to native/LE before storage (W, F32A:76,97). "BE→LE" below = that path.

---

## PART 1 — MASTER TABLE (every strategic-map output item)

### Zone A — Main-map world layer (galaxy board, markers, terrain)

| # | Display item (JP / meaning) | Screen location | Source record (inner code) | Field (offset / size / endian) | Evidence | Server fills? |
|---|---|---|---|---|---|---|
| A1 | 星系マーカー (star-system marker sprite) | main map, on cell | 0x0313 object table + 0x0315 cell grid | objectTable[v]: byte1(class)=3 gate `+1`/u8; byte2(icon slot 0..6)`+2`/u8; cell value `v`@`row*100+col` | SMW:159-228, §B; render `FUN_004d3bd0`/`FUN_004d6b70` | YES — `getStrategicPaletteObjects` (galaxy-placement.mjs:180), klass=3, variant=spectral slot |
| A2 | 星系名 (system name label, e.g. イゼルローン, ルンビーニ) | label beside marker | 0x0313 byte0 → constmsg group 0x18 | objectTable[v].byte0 `+0`/u8 = constmsg-0x18 record id (name text lives in client `data/MsgDat/constmsg.dat`, KO-overlayable) | SMW §C (`FUN_004c8c90`→`FUN_00522010(0x18)`); G251 recovered 80 name idxs | YES — byte0=constmsg subId (galaxy-placement.mjs) |
| A3 | マーカー種別アイコン (system vs fortress vs fleet vs black-hole icon) | marker sprite | 0x0313 byte2 (marker class) | byte2 `+2`/u8: 0..6 → icon slot; ==8 → stored class 7 = black hole (bh_moya/flare/light overlay) | SMW §A/§B, render `(&DAT_009d2934)[class]` | PARTIAL — only star icons (spectral); **fortress icon idx unprobed, no black-hole object emitted** |
| A4 | 함대/ユニットアイコン (fleet icons on cells) | main map, on cell | 0x0325 unit table | count@`0x41a364`/u16; unit stride 0x58; `id`@+0x00, `cell`@+0x0c (row*100+col) | SMW:86-87, FR:65,224,349 | PARTIAL — id + cell + faction only; see D-zone strength gap |
| A5 | 航行궤도선/warp track (navigation orbit lines) | overlay | client-computed from 0x0315 navigability | navigable IFF objectTable[v].byte1 ∈ {1,3}; gate `FUN_004d6310` | SMW:17-34 | YES (implied by cell grid); space cells klass=1 |
| A6 | 星系/空間/航行不能グリッド + プラズマ嵐/サルガッソ (terrain cells) | grid cells | 0x0315 cell grid + 0x0313 byte0 label | byte0 = constmsg-0x18 terrain label (group 0x18 subIds: 0=プラズマ嵐,1=空間,2=航行不能); byte1 = navigability | SMW:26-44, manual p31 (CANON:314) | PARTIAL — 3 terrain palette entries emitted; **plasma-storm cell LOCATIONS have no P1 source → empty overlay** |
| A7 | 星系数字 (green ship/power numbers beside systems: 73000, 8944…) | beside system name | **UNKNOWN consumer** | render path distinct from own-fleet `FUN_0058d140`; source fn **not identified** | UIR:9,44 (flagged "소비처 미특정") | UNKNOWN — cannot confirm which record; **not filled** |
| A8 | 500LY / grid scale readout | near numbers | client scale (1 grid = 100光年) | — | UIR:9, manual p19 (CANON:160) | N/A (client-side) |
| A9 | 성계 소유/소속 색 (system faction ownership tint) | marker color | 0x0313 byte2 tint OR 0x031f base owner | byte2 faction slot; base owner cand. elem+0x04/u8 | SMW §E, W:153; audit "partial" | PARTIAL — spectral variant only; **no 0x031f owner data** |

### Zone B — Info windows & panels (opened on the map)

The manual (p20,23) lists **7 情報ウィンドウ types**: キャラクター情報 / 旗艦情報 / 戦隊情報 /
部隊情報 / 惑星要塞情報 / 国家情報 / 地形情報. Panel fields:

| # | Display item (JP / meaning) | Panel | Source record | Field (offset / size / endian) | Evidence | Server fills? |
|---|---|---|---|---|---|---|
| B1 | キャラクター名 (character display name) | 左下 char panel + キャラクター情報 | 0x0323 (parentage sub @0x80) | display_name len@+0x38/u8, name@+0x3a/u16×13 (LE) | W:107-108 | NO — parentage block written only if arg supplied; live spawn = 0 |
| B2 | 階級 (rank, e.g. 少将) | char panel | 0x0323 parentage | rank@+0x56/u16; titlename@+0x5a/u16×13 | W:110-112 | NO — 0 in live path |
| B3 | 8能力 統率/政治/運用/情報/指揮/機動/攻撃/防御 | char panel | 0x0323 ability_8 | @0x188, 8×{point u16, exp u16} (LE) | W:89,118-121 | CONDITIONAL — written only if abilities arg passed; live=0 |
| B4 | 体力/スタミナ (stamina), 影響力 (influence) | char panel | 0x0323 | stamina@0x1a9/u8, influence@0x1a8/u8 | W:90-91 | CONDITIONAL — 0 in live path |
| B5 | 功績 (achievement/merit) | char panel | 0x0323 parentage | achievement@+0x80(rel)/u32; also 0x043a NotifyCharacterAchievement@0x04/u32 | W:116, PPS:384 | NO |
| B6 | PCP / MCP (政略/軍事 command points) | char panel | 0x0323 | pcp@0x50/u32, mcp@0x54/u32 (LE) | UIR:12, W:73-74; audit maps 0x50/0x54 | CONDITIONAL — written if arg; live=0 |
| B7 | 名声 (fame), 資金 (money) | char panel/nation | 0x0323 | fame@0x10/u32, money@0x68/u32 (LE) | W:62,84 | CONDITIONAL — 0 in live path |
| B8 | 顔グラ (portrait / face id) | char panel | 0x0323 parentage | face@+0x74(rel)/u32 | W:113 | NO (0 in live) |
| B9 | 旗艦名 (flagship name) | 旗艦情報 | 0x0323 | flagship_name len@0x28/u8, name@0x2a/u16×13; flagship id@0x24/u32 | W:67-69 | PARTIAL — flagship id@0x24 always written; **name not written by builder** |
| B10 | 旗艦情報: 訓練値 warp/speed/command/offence/defence/AA/search/deception/land/air | 旗艦情報 / 戦隊情報 | 0x032b ResponseInformationOutfit (stride 0x1c) | practice_* @+0x10..+0x19, u8 each | F32A:58-67, PIR:377-386 | NO — 0x032b not emitted |
| B11 | 戦隊/部隊 ship composition (ship kinds & counts) | 戦隊情報 / 部隊情報 | 0x032f ResponseInformationOutfitParty | ships[] count u8 ≤60, stride 0x120; {kind u16, unit_number u8, boat_number u16} | PIR:425-426 | NO — 0x032f not emitted |
| B12 | 部隊 supply (보급) / max_supply | 部隊情報 | 0x032f | supplies u32, max_supplies u32 (sequential tail) | PIR:428 | NO |
| B13 | 部隊 morale/사기, damaged/destroyed ships, rebellion | live fleet state | 0x0358 NotifyChangeFlagShip | morale_max u8, damaged u16, destroyed u16, rebellion u8 (post-array offsets) | PPS:340-343 | NO — 0x0358 not emitted |
| B14 | 惑星要塞情報 (base panel): 支配陣営名, 統治者名, 守備隊長名 | 拠点選択 / 惑星要塞情報 | 0x0323 power/spot/spot_owner (NOT plain base fields) | power@0x04/u8, spot@0x1c/u32, spot_owner@0x20/u32 | W:254-262 | NO (0 in live) |
| B15 | 基地: 人口 (population), adult_population | base panel | 0x031f (offset UNKNOWN) OR NotifyBaseParameter | NBP population@0x28/u32, adult@0x2c/u32 (LE) | W:395-396; W:213 | NO — neither 0x031f nor NBP emitted |
| B16 | 基地: 軍需物資在庫 (supplies), 生活/食料/宗教/思想/治安/支持率 | base panel | 0x031f (offsets mostly UNKNOWN) / NotifyBaseParameter | NBP approval@0x30, peace@0x34, thought@0x36, religion@0x38, food@0x40, living@0x44, supplies@0x46 | W:211-214, W:397-404 | NO |
| B17 | 基地: 施設数 (防衛/生産/保管/対空/衛星), 要塞数 | base panel | 0x0321 ResponseInformationInstitution | institution_count@B+0x04/u8; per-facility fields UNKNOWN | W:311-337, PIR:281 | NO — 0x0321 not emitted |
| B18 | 基地: 艦船ユニット在庫 (reserve ships), 陸戦兵種数 | base panel | 0x0327 ResponseInformationWarehouse | ships_count@0x0c/u8, troops_count@0x260/u8; mineral@0x2fc/u32 | PIR:309-315 | NO |
| B19 | 基地/系: static name + grid + astronomy (revolution) | base/system static | 0x031d ResponseStaticInformationBase (stride 0x3c) | id@+0x00/u32be, grid@+0x04/u16be, name len@+0x0a/u8 name@+0x0c/u16be×13, class_@+0x26/u8, diameter@+0x28/f32be, revolution_radius@+0x2c, direction@+0x30, cycle@+0x34, init_angle@+0x38 | W:196-203 | NO — emitted only as all-zeros empty walker (reactive on 0x031c), carries no data |
| B20 | 惑星軌道モデル (selected-system planet orbit ring, ≤8 planets) | selected-system view | 0x031d (grid=DAT_009d15c0) + per-planet NotifyBaseParameter | present-mask placeholder 01010101 statically; radius from revolution fields | SMW §D | NO — no 0x031d/NBP emitted; planets show placeholder |

### Zone C — Minimap

| # | Display item | Location | Source | Evidence | Server fills? |
|---|---|---|---|---|---|
| C1 | ギャラクシーマップ area cursor (minimap navigation) | minimap corner | client-side; **no star-dot record** — `FUN_005123b0` has no coordinate source, widget rects hardcoded | MIN:16-24,43-62; manual p20 (CANON:160) | N/A — system dots come from main-map cell→screen projection, not a minimap record |
| C2 | rader `bar.tga` 4-frame status sprite | minimap chrome | decorative sprite `FUN_00502fe0`, **not** a data source | MIN:37,54-56 | N/A |

Note: `Rader/Rader_parts.tga` is the **tactical/battle** radar (`FUN_004ede60`), not the strategic minimap (MIN:37,58). The strategic minimap has **no comparable star-system position record**.

### Zone D — Fleet strength numbers (ships / fuel / morale / supply) — cross-record

The single biggest data need. There is **no fleet-strength field inside the 0x0325 unit struct** (id/faction/commander/cell/owner/boats_count only). Strength comes from separate records:

| # | Metric (JP) | Source record | Field (offset / size / endian) | Evidence | Server fills? |
|---|---|---|---|---|---|
| D1 | 함선数 (ship count) — per system/fleet | 0x0325 boats OR 0x032f ships[] OR 0x0358 | 0x0325 boats_count@0x14/u8; 0x032f ships[] count u8 ≤60; 0x0358 damaged/destroyed u16 | FR:65, PIR:425, PPS:342-343 | NO — 0x0325 boats_count=0; 0x032f/0x0358 not emitted |
| D2 | 燃料/fuel | 0xb02 CommandSupplyFuel / 0xb0c NotifySuppliedFuel | 0xb02 fuel@0x10/u32,@0x14/u32→playerInfo+0x74/+0x78; 0xb0c suppliedUnits[]{unitId,fuelAfter} stride 8 | PSL:114-115,268-275 | NO — fuel records not emitted (event-driven) |
| D3 | 사기/morale | 0x0358 NotifyChangeFlagShip | morale_max u8 (post-array) | PPS:340 | NO |
| D4 | 보급/supply | 0x032f / 0x032d / 0x0327 / 0x0358 / NBP / 0x031f | 0x032d supplies@0x08/u32; 0x0327 supplies@0x2f4/u32; NBP supplies@0x46/u16 | PIR:404,313; W:404 | NO |
| D5 | 弾薬/ammo | **NONE** — no ammo field labeled in any RE doc | — | (absent across all 6 docs) | N/A — likely not a wire field |

### Zone E — System console / chat / status text

| # | Display item (JP / meaning) | Location | Source record (inner code) | Evidence | Server fills? |
|---|---|---|---|---|---|
| E1 | システムアイコン (messenger/info/mail/system); mail icon flips on new mail | HUD icon row | 0x0f06→0x0f07 messenger; 0x0f08/0x0f09, 0x0f10-0x0f12 mail; new-mail flag push | manual p20 (CANON:165), OPC:238,247-249 | out of scope (not a map data field) |
| E2 | チャットウィンドウ 上段=システム/下段=チャット | bottom chat window | 0x0f1c CommandGridChat / 0x0f1d CommandSpotChat / 0x0f1e CommandSpotUnicastChat | manual p21 (CANON:166), OPC:259-261; KO sample UIR:24 | separate chat path (not this catalog) |

### Zone F — Date / turn / global resources

| # | Item | Finding | Evidence | Server fills? |
|---|---|---|---|---|
| F1 | 日付 date / turn (宇宙暦/帝国歴) on map HUD | **UNKNOWN / not evidenced.** No doc places a date/turn readout on the strategic HUD. A 24× real-time clock syncs via 0x0300 RequestTime→0x0301 ResponseTime; birthdate shows on the char card only. | manual p10 (CANON:32-39), OPC:41-42 | 0x0301 emits a single serverTime dword (world-init timestamp only), **not** a game turn/date (world-records.mjs:517) |
| F2 | 資源 / global resource totals (top-bar HUD) | **Not evidenced.** Resource readout appears only on the **base/拠点 panel** via 0x031f (人口/軍需物資在庫). Manual notes economy was 現在未実装 in the original. No separate top-bar resource HUD. | UIR:38, manual p9 (CANON:19) | NO — no record carries a global resource total or turn counter |

---

## PART 2 — SOURCE RECORD REFERENCE (fields the server must populate)

Key strategic-map records with their full displayable-field layout, for the server team.

### 0x0313 ResponseStaticInformationGridType — object/marker table (5004B fixed)
`[u8 count]` + count×3-byte records. Per object value `v` (3..88): byte0=constmsg-0x18 name idx,
byte1=class (3=clickable marker; 1=space; 0=bg), byte2=icon/tint (0..6 star slots, 8→black hole).
(SMW §3, §B, §C.)

### 0x0315 ResponseStaticInformationGrid — cell grid RLE (5004B fixed)
`[u8 w=100][u8 h=50][u16 BE rleByteCount]{[u8 run][u8 value]}…` pad to 5004. value = object index.
Must be big-endian rleByteCount, padded to 5004 to enqueue. (SMW §4.)

### 0x0325 ResponseInformationUnit — fleet/unit list (52804B, stride 0x58)
count@0x41a364/u16be; per unit: id@+0x00, faction@+0x04/u16, commander@+0x08, **cell@+0x0c**
(row*100+col), owner@+0x10, boats_count@+0x14/u8, boats_array@+0x18, spotResolverBase@+0x40,
mapSection@+0x48. Interior strength fields beyond boats are UNKNOWN/P3. (FR:224,278; audit.)

### 0x0323 ResponseInformationCharacter — character sheet (724B, stride 0x2d4)
See Zone B for displayed fields. Key: id@0x00, power@0x04, fame@0x10, spot@0x1c, spot_owner@0x20,
flagship@0x24, pcp@0x50, mcp@0x54, money@0x68, ability_8@0x188. parentage sub @0x80:
display_name@+0x3a, rank@+0x56, titlename@+0x5a, face@+0x74, achievement@+0x80. (W §1.)

### 0x031d ResponseStaticInformationBase — system/base static (stride 0x3c)
id@+0x00/u32be, grid@+0x04/u16be, name@+0x0c, class_@+0x26, revolution fields @+0x2c..+0x38. (W §2b.)

### 0x031f ResponseInformationBase — base economy/ownership (stride 0x180)
count@+0x00/u8 (max 4); element id@+0x00; owner cand.@+0x04. Most economy field offsets UNRESOLVED
(server-side serializer): transport_supplies[30]@+0x24, outfit_supplies[30]@+0xa0, budgeting[6]@+0x130,
budget[5]@+0x140, commodity[3]@+0x168. Names: population, supplies, approval, food… offsets UNKNOWN. (W §2.)

### NotifyBaseParameter (74B) — per-planet economy (fully labeled, LE)
time@0x00, grid@0x04, base@0x08, budget@0x10, population@0x28, adult_population@0x2c, approval@0x30,
peace@0x34, thought@0x36, religion@0x38, energy@0x3c, food@0x40, living@0x44, supplies@0x46,
armor@0x48. (W §3.) — the cleanest source for base-panel economy display.

---

## PART 3 — SUMMARY

### 3a. Server ALREADY fills (renders correctly today)
- **Star-system markers** (A1) with **class byte1=3** and **spectral icon variant** — 85 systems from
  `galaxy.json` via `getStrategicPaletteObjects`/`getStrategicGridCells` (galaxy-placement.mjs:74-180).
- **System name labels** (A2) — byte0 = real constmsg group-0x18 subId (G251 recovered 80 idxs).
- **Terrain palette** (A6, 3 entries: plasma/space/non-nav) and **space navigability** (A5).
- **Unit icons partial** (A4) — 0x0325 with id + cell + faction (deployment-units.mjs).
- **Character link** — 0x0323 id@0x00 + flagship@0x24, and 0x0204 selected-char id (for HUD focus binding only).

### 3b. Server does NOT fill (fields present in the client but sent empty/zero)
Ordered by player visibility:
1. **Fleet strength numbers** (D1-D4): ship count / fuel / morale / supply — **none emitted**.
   0x0325 boats_count=0; 0x032f/0x032d/0x0358/0xb0c not built.
2. **Character panel stats** (B1-B8): name, rank, 8 abilities, stamina, influence, 功績, PCP/MCP, fame,
   money, face — all 0 in the live spawn path (0x0323 stat fields written only if an arg is supplied).
3. **Base/拠点 panel** (B14-B19): ownership faction / ruler / garrison, population, supplies, economy,
   facility counts, warehouse — **0x031f NOT emitted; 0x031d only zero-fill; 0x0321/0x0327/NBP not built**.
4. **Flagship & squadron detail** (B9-B13): flagship name, training values, ship composition —
   0x032b/0x032f not emitted; flagship name not written even in 0x0323.
5. **Selected-system planets** (B20): no 0x031d/NBP → planet orbit shows placeholder set.
6. **Fortress & black-hole markers** (A3): only star icons; fortress icon index unprobed, no
   black-hole object emitted (that render branch is dead server-side).
7. **NPC-fleet strength**: fleets placed as unit records but with no strength fields.

### 3c. Cannot confirm — no evidence (do NOT fabricate)
- **A7 星系数字 (green ship/power numbers, 73000 etc.)** — the most prominent map HUD number, but its
  **consuming render function and source record are UNIDENTIFIED** (UIR flags it as a distinct path,
  next-RE candidate). Needs a live Frida probe / further EXE RE before the server can fill it.
- **F1 date/turn HUD** — not evidenced on the strategic screen; only a real-time clock exists.
- **F2 global resource totals** — not evidenced; resources are per-base only.
- **A6 plasma-storm cell LOCATIONS** — manual names the terrain type but never places it (no P1 source).
- **B10-B13 exact tail offsets** in 0x0358/0x031f — depend on variable-length arrays; server-side
  serializer, absolute offsets unresolved in the docs.
- **弾薬/ammo (D5)** — no ammo field labeled in any of the 6 wire docs.

### 3d. Highest-value next steps for the server (evidence-backed)
1. Emit **0x031f** (or **NotifyBaseParameter**, which is fully labeled) so the base panel shows
   population/supplies/ownership — currently the whole 拠点 panel is blank.
2. Populate **0x0323 stat fields** in the live spawn path (rank/name/abilities/money) — the builder
   already supports them; the live path just passes no args.
3. Emit **0x032f / 0x032d** for fleet ship-count & supply — the primary "how strong is this fleet" data.
4. RE the **A7 green-number** render path before attempting to fill it (unknown source).

---

**Related:** `logh7-strategic-map-wire.md` (0x0313/0x0315 render), `logh7-info-records-wire.md`
(0x0323/0x031d/0x031f/NBP layout), `logh7-proto-info-records.md` / `-strategic-logistics.md` /
`-personnel-strategy.md` (0x032b/0x032d/0x032f/0x0358/0xb0x fields), `logh7-032a-flagship-wire.md`
(0x032b outfit), `logh7-original-ui-reference-2026-06-23.md` (screenshot item inventory).
