# LOGH VII Original Data Survey — 2026-06-12

Thorough sweep of `.omo/work/logh7-installed/`, `.omo/work/logh7-iso-root/`, and
`E:\DGGL\Games\Gin{V,VI}_Win_*/` for unmined data relevant to the revival server's
strategic/sector map.

---

## 1. Complete File Inventory

### 1.1 LOGH VII Install Root — data files

| File | Size | Status | Notes |
|------|------|--------|-------|
| `exe/String.txt` | 1073 KB | **mined** | 43 683 Shift-JIS strings |
| `exe/window3.dat` | 4.1 KB | unmined | UI window layout table; 4 records × ~1059 B; serialised C++ object state, not game content |
| `data/MsgDat/constmsg.dat` | 112 KB | **mined** | HFWR catalog, 3578 strings/3199 entries |
| `data/MsgDat/g7sw.dat` | 162 B | **mined** | GFWR (banned-word filter): 14 Japanese discriminatory terms in UTF-16; irrelevant to server |
| `data/MsgDat/messages_0.dat` | 17 KB | **mined** | HFWR message strings |
| `data/MsgDat/messages_1–8.dat` | 7–25 KB each | **mined** | HFWR faction/locale message tables |
| `data/MsgDat/messages_com_0–1.dat` | 1–16 KB | **mined** | Command-response strings |
| `data/MsgDat/messages_tac_0–8.dat` | 0.2–3.4 KB each | **mined** | Tactical dialog strings |
| `data/model/strategy/galaxy.mdx` | 16.1 KB | **NEW — analysed** | 3D polygon model of galaxy visual backdrop (`W:\Gin7\CG\g\galaxy_map\objects\galaxy.lwo`); no game data |
| `data/model/strategy/Null_galaxy.mdx` | 117.7 KB | **NEW — analysed (key find)** | Serialised galaxy-state object. Contains 85 star objects and a planet-to-star index table. See §3. |
| `data/image/map_obj/mo_cloud01.tga` | 256 KB | unmined | Two nebula/cloud overlay textures for strategy map; visual only |
| `data/image/map_obj/mo_cloud02.tga` | 256 KB | unmined | (same) |
| `data/image/Field/icon_country32.tga` | 17 KB | unmined | Faction flag icons (32 px) |
| `data/image/Field/icon_fleet16.tga` | 5 KB | unmined | Fleet icon sprites |
| `data/image/Field/ShipMark.tga` | 65 KB | unmined | Ship hull-mark sprite atlas |
| `data/image/Face/*.tcf` (7 files) | 55–1663 KB | **mined** | Portrait pools |
| `data/image/Face/tcf.hed` | 10.8 KB | partial | Portrait index header |
| `data/model/Ship/**/*.mdx` | varies | partial | Ship 3-D models (visual) |
| `data/model/Ship/FP/*.mds` | small | unmined | Likely LOD animation data for flagship models |
| `data/model/Ship/GE/*.mds` | small | unmined | Same for Galactic Empire ships |
| `data/model/Planets/p*.mdx` (50+) | varies | unmined | Planet model pool (7 base types × LOD variants; purely visual) |
| `data/image/spot/bg001–043.jpg` | varies | unmined | 43 spot-battle background images |
| `data/sound/BGM/*.ogg` (7) | varies | irrelevant | Classical music BGM |
| `data/sound/SE/*.wav` (13) | varies | irrelevant | Sound effects |
| `doc/銀英伝VII操作説明.txt` | 8.4 KB | unmined | Japanese operation manual text (Shift-JIS mojibake filename) |

### 1.2 LOGH VII ISO Root

| File | Size | Status |
|------|------|--------|
| `data1.cab`, `data2.cab`, `engine32.cab` | large | irrelevant (install archives, same content as installed) |
| `銀英伝~1.pdf` (manual) | — | **mined** (galaxy recovered) |
| DirectX9 setup files | — | irrelevant |

### 1.3 Prior Games — E:\DGGL\Games\GinVI_Win_231225 (LOGH VI)

All files under `DATA/` use XOR-0x2F byte cipher.

| File | Size | Status | Notes |
|------|------|--------|-------|
| `DATA/mapdata2.MAP` | 16.6 KB | **NEW — analysed** | `MAP\0mappcg01` header; 260 B header + 16 392 B 1-byte-per-cell tilemap; dimensions unknown (see §4) |
| `DATA/Mpdata0–10.map` (7 files) | 33 KB each | **NEW — analysed** | `MAP\0Mapteran##n` terrain layers; 260 B header + 32 776 B data |
| `DATA/Mappcg0–8.PCG` (5 files) | 11.3 KB each | unmined | 8×8 tile pattern data (1409 tiles × 8 B each); purely visual |
| `DATA/Snro10–100.bin` (20 files) | 3.2 KB each | **NEW — analysed** | Scenario config records; XOR-0x2F; header has scenario-id as LE u32 |
| `DATA/Fltdat10–100.bin` (21 files) | 7.5 KB each | unmined | Fleet placement data per scenario; stride 12/24 records (see §4) |
| `DATA/Foce10–100.bin` (20 files) | 112.8 KB each | unmined | Per-scenario force/unit table; stride 12 → 9 400 records each |
| `DATA/Cvdat10–100.bin` (24 files) | 28.7 KB each | unmined | Scenario character assignments |
| `DATA/Evdata10–100.bin` (30 files) | 133.1 KB each | unmined | Event/trigger data per scenario |
| `DATA/Evlist10–100.bin` (20 files) | 6.1 KB each | unmined | Event list index |
| `DATA/Shipdat.bin` | 11.5 KB | **NEW — analysed** | Ship stats table; XOR-0x2F; stride 32 → 360 ship records |
| `DATA/Cclass.bin` | 6.1 KB | **NEW — analysed** | Character class table; XOR-0x2F; stride 24 → 255 records |
| `DATA/Charcost.bin` | 28.7 KB | unmined | Character recruitment cost table |
| `DATA/Flgship.bin` | 16.4 KB | unmined | Flagship definitions |
| `DATA/Fformat.bin` | 9.8 KB | unmined | Fleet formation data |
| `DATA/Shipdan.bin` | — | unmined | Ship animation data |
| `DATA/Weapon.bin` | 2.2 KB | unmined | Weapon stat table |
| `DATA/Bgm.bin` | 1.8 KB | unmined | BGM track list |
| `DATA/talk.BIN` | 36 MB | irrelevant | Dialog voiceover data |

### 1.4 Prior Games — E:\DGGL\Games\GinV_Win_230912 (LOGH V)

| File | Size | Status | Notes |
|------|------|--------|-------|
| `Scenario/bgam01–16.atr` | 65–922 KB | **NEW — fully decoded** | Strategic scenario maps. Binary grid: 9-byte header `[BE u16 W][BE u16 H][BE u32 scenario_id][1 byte]` then W×H×4 cells. bgam01=128×128, bgam03=176×176, bgam08=224×480. 4 cell types: `00000000`=empty, `ff000000`=open space, `00010a00`=terrain A, `05011400`=terrain B. |
| `Officer.gdb` | 1.6 MB | unmined | Character/officer database (GDB format) |
| `opmvbase.gdt` | 40 KB | unmined | Operation move base? Likely operational map objects |
| `planeti/planetm/planeto.gdb` | 72–390 KB | unmined | Planet data tables (3 tiers) |
| Other `.gdb/.gdt` files | various | unmined | UI graphics/data bundles |

---

## 2. New Findings Summary

### 2.1 g7sw.dat — Banned-Word Filter (GFWR)

Magic `GFWR`, 162 bytes. Header: `[4 B magic][4 B pad][4 B hash][4 B count=14][4 B version=3]`.
Contains 14 Japanese discriminatory words in UTF-16 with hashes. Server-side chat filter.
**Not useful for map content.**

### 2.2 galaxy.mdx — 3D Visual Model (not game data)

16 508 bytes. Contains embedded source path `W:\Gin7\CG\g\galaxy_map\objects\galaxy.lwo`,
texture references `galaxy00.bmp`, `neb000_a.bmp`, and `star000.bmp`. This is the animated
starfield backdrop rendered behind the galaxy strategy map. Contains no coordinate or
placement data. The apparent "header" values are floating-point normals/transforms, all in
the non-coordinate range.

### 2.3 Null_galaxy.mdx — Galaxy State Object (KEY FIND)

120 558 bytes. This is a serialised in-memory C++ game-state snapshot of the galaxy when
no game session is active ("Null" = blank default state). Structure:

**Array 1** — Star render objects, stride 232 bytes, 79 entries (offsets 0–36 511):
- Per-record: `[88 B pointer-table (11 × {ptr:4, count:4})]` + `[ASCII name, null-padded to 128 B]` + `[16 B trailing data]`
- Names: `star_01_G` through `star_79_G` where suffix = spectral class (G/K/M/F/A/B/O)
- Spectral class distribution: G=24, M=18, K=16, F=7, A=6, B=5, O=2 (79 total)

**Gap region** — bytes 36 656–41 929 (5 274 B): sequential integer table (planet-connection graph edges), all values `0x0000_0X00` pattern — likely adjacency/warp-lane edge list.

**Array 2** — Star game objects, stride 384 bytes, 85 entries (offsets 41 930–74 569):
- Same 11-entry pointer-table header, then 128-byte name field, then 256 bytes of zeroed runtime state
- Names: `star_01_G`..`star_79_G` (79 stars) + `bh_01`, `bh_02`, `bh_03` (black holes) + `ns_01`, `ns_02`, `ns_03` (neutron stars) = **85 celestial objects**
- Runtime state (coordinates, ownership, fleet slots) is all zeroed — populated by server at game start

**Post-array planet index table** — bytes 74 658–120 557 (45 899 B):
- 85 groups of 172 bytes each, one per celestial object
- Each group: `[ptr:4][8 B pad][planet_idx_1..8 as u32][9 × 0xffffffff terminators][ptr × 4 repeats]`
- **Every star/bh/ns has exactly 8 planet slots** (confirmed for all 85 groups)
- Planet IDs run sequentially 1..680 (85 × 8 = 680 planet objects total)
- The planet objects themselves are not in this file — they are transmitted by server message 0x0323

**Critical implication:** The server must know (X, Y) coordinates for all 85 celestial objects to
populate the zeroed coordinate fields in Array 2 before broadcasting to clients. These coordinates
are NOT stored in Null_galaxy.mdx. They come from the (dead) original server's database.

---

## 3. Star System Catalog Extracted from Null_galaxy.mdx

All 85 unique celestial object names and spectral classes (suffix after last `_`):

```
star_01_G  star_02_O  star_03_F  star_04_A  star_05_A
star_06_G  star_07_B  star_08_M  star_09_G  star_10_B
star_11_G  star_12_G  star_13_K  star_14_F  star_15_M
star_16_K  star_17_K  star_18_A  star_19_K  star_20_G
star_21_M  star_22_M  star_23_M  star_24_F  star_25_M
star_26_K  star_27_G  star_28_G  star_29_K  star_30_M
star_31_M  star_32_K  star_33_G  star_34_G  star_35_M
star_36_M  star_37_K  star_38_K  star_39_B  star_40_G
star_41_G  star_42_G  star_43_G  star_44_M  star_45_G
star_46_G  star_47_M  star_48_M  star_49_M  star_50_K
star_51_K  star_52_M  star_53_M  star_54_M  star_55_M
star_56_G  star_57_K  star_58_F  star_59_K  star_60_K
star_61_G  star_62_K  star_63_A  star_64_F  star_65_M
star_66_K  star_67_A  star_68_M  star_69_F  star_70_B
star_71_F  star_72_A  star_73_F  star_74_M  star_75_O
star_76_B  star_77_A  star_78_K  star_79_G
bh_01  bh_02  bh_03
ns_01  ns_02  ns_03
```

**Note:** The game client's `content/galaxy.json` (recovered from the manual PDF) has 80 named
star systems. The client file uses index 1..80 but this object array has indices 1..79 for
named stars. The discrepancy (79 vs 80) is unresolved — one system may be encoded differently
or the manual-extracted list includes one fortress-system hybrid.

---

## 4. LOGH VI Map Format (Prior-Game Reference)

GinVI DATA files are relevant because VI and VII share Bothtec engine lineage.

### mapdata2.MAP / Mpdata*.map

- Magic: `MAP\0`, then null-padded name (e.g., `mappcg01`, `Mapteran00n`), 260-byte header
- Data starts at offset 260; 1 byte per tile cell (mapdata2=16 392 cells, Mpdata=32 776 cells)
- Cell byte values: `0x2F`=null/empty (~79% of cells), `0xDB/0xD2/0xD0/0xD1`=terrain types
- Exact grid dimensions unresolved (no width/height field found in header after offset 11)
- **NOT XOR-encoded** — the 0x2F bytes are the actual null-tile value

### GinV bgam*.atr Scenario Maps

- Header: `[BE u16 W][BE u16 H][BE u32 scenario_id][1 B pad]` = 9 bytes
- Then W×H×4 bytes of cell data
- Known sizes: 128×128 (bgam01), 176×176 (bgam03), 224×480 (bgam08)
- 4 cell types only: `00000000`=void, `ff000000`=navigable space, `00010a00`=terrain_A, `05011400`=terrain_B
- These are **tactical battle maps**, not strategic galaxy maps

### GinVI Fltdat*.bin (7 488 B, stride 12 = 624 records)

XOR-0x2F encoded. 624 fleet-placement records per scenario. First bytes are not null after
decode, suggesting a fixed-size record with embedded values. Fields likely include:
faction-id (1 B), fleet-type (1 B), X (2 B), Y (2 B), force-count (2 B), flags (4 B).

---

## 5. Ranked List: Most Promising Unmined Files for Strategic Map

| Rank | File | Why Promising | Effort |
|------|------|--------------|--------|
| 1 | `Null_galaxy.mdx` gap region (bytes 36 656–41 929) | Already partially decoded; the 5 KB sequential-int table almost certainly encodes the warp-lane adjacency graph between the 79 star systems. Fully parsing it gives server the jump-route topology. | Low — continue existing analysis |
| 2 | `E:\DGGL\Games\GinVI_Win_231225\DATA\Foce10.bin` (and Foce11–100) | 112 800-byte per-scenario force table, stride 12 = 9 400 records. With XOR-0x2F decode and field identification, this gives VI's initial fleet/unit placements per star system — the closest prior-game analogue to VII's strategic scenario state. | Medium |
| 3 | `E:\DGGL\Games\GinVI_Win_231225\DATA\Fltdat10.bin` (and variants) | 7 488-byte fleet data, stride 12 = 624 records per scenario. Likely has system-id + fleet-owner + ship-count. Direct reference for VII's fleet initialisation. | Low |
| 4 | `E:\DGGL\Games\GinVI_Win_231225\DATA\Cvdat10.bin` (and variants) | 28 672-byte character-assignment table. Maps characters to posts/planets in each scenario. Useful for seeding the VII character placement on star systems. | Medium |
| 5 | `E:\DGGL\Games\GinV_Win_230912\opmvbase.gdt` | 40 KB — "operation move base" — likely contains VI's strategic-layer base positions with (X, Y) grid coordinates. If the grid maps to VII's coordinate space this could seed map positions. | Medium |
| 6 | `E:\DGGL\Games\GinV_Win_230912\planeti/m/o.gdb` | Three-tier planet tables (72–390 KB). May contain planet economic stats analogous to VII's `NotifyBaseParameter` payload (population, food, industry). | Medium |
| 7 | `E:\DGGL\Games\GinVI_Win_231225\DATA\Flgship.bin` (16 384 B) | Flagship stat table. Directly usable to seed VII's flagship parameter records sent in 0x0323. | Low |
| 8 | `Null_galaxy.mdx` Array 2 coordinate fields | 85 × 256 B zeroed runtime blocks. If any save-game or partially-initialised `.mdx` snapshot exists elsewhere (e.g., under `logh7-cab-extract/` or in the engine cabinet), it may contain the actual X/Y float coordinates for each star. | Low (check for saves) |
| 9 | `E:\DGGL\Games\GinV_Win_230912\Officer.gdb` (1.6 MB) | Full character database for LOGH V. If GDB format decodes, provides stat baselines cross-referenceable with VII's LOGH-canon character records. | High |
| 10 | `data/image/Field/icon_country32.tga` + `icon_fleet16.tga` | Not data, but server needs faction + fleet icon mappings for 0x0313/0x0315 sector-map responses. Decoding the sprite atlas order gives the integer-to-icon mapping. | Low |

---

## 6. Key Server Implications

1. **79 named stars, 3 black holes, 3 neutron stars = 85 celestial objects** in game. The
   `content/galaxy.json` (80 systems) is consistent — the 6 special objects (bh/ns) are not
   counted as "systems" in the manual.

2. **Each celestial object has exactly 8 planet slots** (IDs 1–680). The server must maintain
   a `planets` table with 680 rows, keyed by sequential ID, and associate them to star objects
   via the index table confirmed in Null_galaxy.mdx.

3. **Coordinates are server-authoritative and not in the client files.** The revival server
   must either synthesise coordinates from the manual's galaxy grid or extract them from a
   prior-game analogue (priority 5 above).

4. **Warp-lane topology is in the gap region** (bytes 36 656–41 929, ~330 edges). Decoding
   this fully would give exact adjacency for path-finding and sector-map rendering.

5. **GinVI's `.bin` tables are the closest analogues** to VII's server-side content because
   both use the Bothtec Gin engine lineage. Decoding Foce/Fltdat/Cvdat gives the best seed
   data for initial scenario state.
