# LOGH VII model data archaeology — LANE 3 (`data/model/*.mdx` / `*.mds` + `tcf.hed`)

**Source:** `.omo/work/logh7-installed/data/model/**/*.{mdx,mds}` (406 `.mdx` + 12 `.mds` = 418 files)
**Tool:** `tools/logh7_mdx_extract.py` → `content/extracted/model-data.json` (+ per-table files)
**Method:** deterministic byte read. Every datum below is read from the file bytes; unknowns are omitted.

## File format (`.mdx` / `.mds`)

The `.mdx`/`.mds` files are the game's **3D scene-graph model containers**, produced by exporting
**LightWave `.lwo` objects** (the embedded source paths are literally `W:\Gin7\CG\...\*.lwo`).
They are geometry+material files, NOT primarily tabular game data — but they carry three extractable
DATA layers:

1. **Header (0x00–0x4F): 10 `(ptr, count)` descriptor pairs**, little-endian. The `ptr` words are stale
   runtime memory addresses (high word `~0x01xx`), so they are not file offsets; the **`count` words are
   the data**. Crucially, **`descriptor_counts[0]` == the scene-graph node count for 396/418 files (94.7%)**
   — independent confirmation that the node walk below recovers the real node list. (`.mds` shares the
   identical header.)

2. **Scene-graph node directory (from 0x58): fixed 0xE8-byte stride.** Each record begins with a
   NUL-terminated node name. Walking the 0xE8 grid from 0x58 until the name slot stops being a valid
   identifier yields the ordered node list with zero float-byte false positives. Top-level mesh nodes are
   named `<object>:Layer<N>`; sub-nodes are component mount points (see ships below).

3. **Embedded source-asset paths.** The exporter wrote the original CG asset path split across a few
   padding bytes (`W:\Gin7\CG\` + a `g\`/`D\`/`D3\` fragment + the body). These stitch back into full
   references to the `.lwo` mesh and every texture (`*.bmp` diffuse, `*_bump.tga`, tile maps).
   **632 unique source assets** across the corpus, **1009 path references**, **3722 total nodes**.

## DATA extracted

### A. Ship hardpoint geometry — `content/extracted/model-ship-hardpoints.json`

273 ship model files; **248 carry named component mount points**. The sub-node names ARE the ship's
weapon/engine layout (real geometry, not invented stats):

| node prefix | meaning |
|---|---|
| `ENGINE_NN` | engine nozzle |
| `GUN_NN` | gun (実弾砲) mount |
| `BEAM_NN` | beam emitter |
| `LASER_NN` | laser emitter |
| `MISSILE_NN` | missile launcher |
| `RAILGUN_NN` | railgun (rare; 2 ships) |
| `FF/FR/FL/RR/RL_NN` | thruster-flare positions (Front/Rear × Left/Right) |

Hardpoint-kind coverage (ships with ≥1): engine 230, laser 164, beam 157, missile 155, gun 147,
flare 175, railgun 2. Largest hulls (e.g. empire `EH027`/`EM027`) carry 5 engines + 16 flares + a full
beam/gun/laser/missile suite.

**Faction** (from directory `data/model/Ship/<dir>/`, with root-level files inferred by name prefix per
the same convention): alliance 125, empire 108, phezzan 12, phezzan_misc 2, unknown 1 (`unknown.mdx`
placeholder). Inferred entries carry `"faction_inferred": true`.

**Hull class** (2nd letter of model name, consistent with `E*`/`F*` faction prefix): `H`=Heavy (79),
`L`=Light (87), `M`=Medium/Main (61). The numeric ship STATS (armor/shield/beam power etc.) are a
separate lane — see `content/ship-stats.json` (from the gin7 manual). This lane supplies the
complementary 3D mount geometry.

### B. Galaxy stellar classification — `content/extracted/model-galaxy-stars.json`

`data/model/strategy/Null_galaxy.mdx` is the 3D galaxy-map mesh. Its scene-graph nodes are named
`star_<NN>_<spectralClass>` — i.e. **each of 79 star bodies is tagged with a Morgan-Keenan spectral
class letter**, NEW data not present in `content/galaxy.json` (which sourced system/planet NAMES from
the manual PDF). Plus 3 black holes (`bh_01..03`) and 3 neutron stars (`ns_01..03`).

Spectral histogram (79 stars): **M 21, G 19, K 17, F 8, A 7, B 5, O 2** — a plausible cool-dwarf-heavy
population. Index = map node order (NOT guaranteed to equal galaxy.json system order; not cross-linked
here because no byte links them).

### C. Planet / space / effect / strategy meshes

- **Planets (107 files, 38 base models + `_low`/`_mid` LOD variants):** type prefixes `p` (24),
  `fs` (7), `y` (6), `ds` (1). Each references its `.lwo` + surface `.bmp` under
  `W:\Gin7\CG\g\Stage\Planet\<type>\`.
- **Space backdrops (8):** `s000..s006` + `space` (starfield/nebula stages).
- **Effects (15):** `beam`, `railgun_a`, `exp_s/exp_m` (explosions), `shockwave`, `spark`, `b_wave`,
  `ef_thruster`, `m_smoke_a/b`, `repair(_p)`, `supply(_p)` — the combat/VFX model set.
- **Strategy (7):** `galaxy`, `Null_galaxy`, `grid`, `bh_core`, `bh_wave`, `06`, `test_warp` — the
  strategic-map render meshes.

### D. `tcf.hed` — face-atlas index (already cracked; referenced for completeness)

`data/image/Face/tcf.hed` is **not** a 3D-model table. It is the frame index for the 7 `*.tcf`
character-portrait atlases: 8-byte entries `[u32 offset][u32 size]` over a virtual concatenation of the
atlases, declared count `0x32`=50 at 0x08, frame stride `0x1812`. Fully decoded by
`tools/logh7_tcf_decode.py` (489 portraits, per `logh7-character-roster-portraits`). The summary records
its structure under `tcf_hed_index` but does not re-derive it.

## Outputs

- `content/extracted/model-data.json` — full record set (header counts, nodes, assets) + aggregates.
- `content/extracted/model-galaxy-stars.json` — 79 stars + spectral classes + 6 special bodies.
- `content/extracted/model-ship-hardpoints.json` — 248 ships × weapon/engine mount counts.
- `content/extracted/model-{ship,planets,strategy,effect,space,light,demo,root}.json` — per-category tables.

## What is NOT here (honest gaps)

- **No numeric balance stats** live in these meshes — armor/shield/firepower come from the manual lane
  (`content/ship-stats.json`), not the `.mdx`. The `.mdx` gives mount *geometry/count*, not damage values.
- **Vertex/material binary** (the bulk of each file: float vertex arrays, UVs, surface params) is left
  unparsed; it is render geometry, not game data, and the task targets DATA tables.
- **Star↔system linkage**: `Null_galaxy` star node order is not byte-linked to `galaxy.json` system
  order, so the spectral classes are published as an indexed list, not joined to system names.
