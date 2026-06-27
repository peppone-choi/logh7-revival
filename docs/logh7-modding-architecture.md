# LOGH VII — Modding Architecture (make every element changeable)

Goal: turn the RE'd client + authoritative server into a **moddable platform** where
every element — gameplay data, text, fonts, textures, models, audio, UI, resolution,
client behaviour — can be changed without forking the binary.

## Total teardown — every part of BOTH the client and the server

The two halves are opened differently because their nature differs:

| Half | Why it's open | What "tearing it apart" means |
|---|---|---|
| **Server (ours)** | We wrote it — full source, authoritative over all gameplay data/logic | (1) **Source-open** (edit `src/server/*.mjs`); (2) **data-driven content** (Layer A `common/` tree); (3) **scriptable RULES** — see below — so gameplay *logic* (costs, formulas, AI, triggers) is moddable without core edits |
| **Client (RE'd binary)** | Fully decompiled (.omo/ghidra, 13800 fns) + every format/structure/cap documented this session | (1) **Assets** replaceable (Layer B); (2) **text/font/dialog** swappable (Layer C); (3) **behaviour** patchable + injectable (Layer D descriptors + shim DLLs); the **RE docs are the teardown manual** — anything in the binary can be located and patched |

**The server RULES layer (the piece that makes *logic*, not just data, moddable):**
beyond content (Layer A), expose the gameplay rules so modders change *behaviour*
without touching engine code —

- **`defines.json`** — every magic number lifted out of the engine modules
  (`logh7-battle-engine`, `combat-engine`, `command-engine`, `strategy`, `logistics`,
  `world-state`): CP/MCP costs, warp ranges, combat-formula coefficients, AI weights,
  budgets, tick timers, fame/rank thresholds. Modders tune the game by editing values.
- **Scripted effects / triggers / modifiers** (Paradox-style) — data-defined
  `effects`/`triggers`/`modifiers` the server evaluates at gameplay events (on-battle,
  on-turn, on-capture, on-promote), so a mod can add a decision, a combat modifier, an
  AI behaviour, a victory condition as DATA, not code.
- **Pluggable rule modules** — the server loads a mod's `rules/*.mjs` in a sandbox and
  lets it subscribe to gameplay events (the authoritative loop stays in our core; mods
  hook it). For modders who want real logic, not just tuning.

So a single mod can carry **both halves at once** — server `content/` + `defines` +
`rules/` AND client `assets/` + `lang/` + `patches/` + `shims/` — applied together,
validated against the RE'd client caps, fully reversible (§ mod manifest below). The
RE documentation (`logh7-data-structures-re`, `file-re-coverage`, `content-catalog`,
`graphics-remaster`, `font-remaster`, this doc) is the **teardown manual** that makes
every element — on either side — locatable and changeable.

The enabling fact: **LOGH VII is client↔server, and we own the server.** So most mods
are *data*, not binary patches. The architecture is **4 layers**, ordered by how
cleanly they mod (Layer A is the biggest lever, Layer C the most invasive).

---

## Layer A — Server content packs (gameplay data) — NO client touch

The authoritative Node server (`src/server/*.mjs`) emits the wire records the client
parses, so **all gameplay data is server-owned and moddable by editing content**:
characters, fleets, nations, galaxy/systems/planets, ships, scenarios, economy.

- Existing plumbing: `logh7-content-source` → `logh7-content-adapter` →
  `logh7-content-pack` → world seeding. A mod = a **content pack** (a `content/`
  overlay or a `mods/<name>/content/` dir).
- **Constraint validation against the RE'd client caps is mandatory** — a mod that
  exceeds a client parser cap makes the client *bail on the whole message*. Validate
  every pack against `docs/logh7-data-structures-re.md §3`:
  - 2 session powers (Empire/Alliance; Phezzan = neutral tag, never a 3rd power)
  - ≤14 fleets / nation, ≤3 leaders / nation, ≤600 units, ≤10 boats / fleet
  - ≤5 entry chars + ≤2 extension / account, ≤64 card roster, ≤16 cards / char
  - names ≤13 UCS-2 units, ≤80 special abilities, budget ≤6, ≤4 base elements
  - `char.flagship@0x24 == unit.id@0x00` (1:1, or the player won't spawn)
- Provenance discipline carries into mods: tag each field P0/P1/P2/P3; never label a
  mod's invented data "original server data".
- **Result:** roster, galaxy, ships, fleets, nations, scenarios are fully moddable by
  dropping a validated content pack. Zero client patching.

**To build:** a `loadModContentPacks(modsDir)` that layers packs (load order),
validates against the cap table, and merges into the content source.

---

## Layer B — Loose-file asset overrides — file replacement, NO code patch

Every asset the client loads from disk is moddable by replacing the file, because the
loaders we RE'd are file-driven (`docs/logh7-file-re-coverage.md`):

| Asset | Path | Loader (RE) | Mod rule |
|---|---|---|---|
| Textures | `data/image/**`, `data/model/images/{Lo,Mid,Hi}/` | D3DX8 `FUN_005a478c`/`FUN_005a91a7` (reads file-header dims) | drop-in any-size BMP/TGA/PNG/JPG/DDS; keep pow2 |
| 3D models | `data/model/**/*.mdx,*.mds` | `FUN_004dd6a0` chain | scene-graph swappable; **mesh geometry RE = open gap** |
| Audio | `data/sound/**/*.wav,*.ogg` | `FUN_00621ef0`/`FUN_00622f20` (RIFF/Vorbis) | drop-in standard files |
| Text | `String.txt`, `data/MsgDat/*.dat` | `FUN_004ea180`/`FUN_00521dc0` (cp932/cp949 ANSI) | language packs (see Layer C font/text) |
| Portraits | `data/image/Face/*.tcf` | `FUN_005924c0` (atlas) | re-encode via `tools/logh7_tcf_decode.py` |
| Galaxy | `galaxy.mdx` / `Null_galaxy.mdx` | model loader | node-level edits |

**Mod rule:** a mod ships an `assets/` overlay mirroring the install tree; the
launcher copies/symlinks it over the base install (with a backup for revert).
Texture/audio/portrait mods need zero RE beyond what's done; model *mesh* mods wait
on the MDX polygon-array RE (file-re-coverage gap #1).

### B.1 TGA/texture pipeline — format-free editing (the .tga "problem" isn't one)

The client calls textures by **hardcoded path + extension** (e.g.
`../data/image/strategy/bh_moya.tga`, `../data/image/strategy/grid_glow.bmp` — a mix
of `.tga`/`.bmp`), but the loader is **D3DX8 `CD3DXImage`** which **dispatches on the
file's CONTENT magic via `GetImageInfo` (`FUN_005aacda`), NOT the extension**. So:

- You **cannot rename** a texture (the path is baked in the EXE), but you **can put
  any supported format's bytes in the same filename** — a PNG saved as `bh_moya.tga`
  loads as PNG (D3DX8 reads the magic). Supported: BMP/TGA/PNG/JPG/DDS.
- TGA itself is fine to edit — it is standard 24/32-bit (32bpp carries 8-bit alpha;
  type-1 is 8-bit indexed). Any editor (Photoshop/GIMP/Paint.NET) opens it.

**Tool to build — `tools/logh7_texture_pipeline.py`:** batch `TGA↔PNG` (edit in PNG,
repack to TGA *or* leave PNG-in-`.tga`-name), preserving the original pixel format
(32-bit alpha / 8-bit colormap) and **filenames**; optional 2x/4x upscale
(`logh7_upscale_textures`); drop-in over the install with backup. Net: textures are
edited as PNG and shipped as a Layer-B asset overlay — no format friction, no patch.

### B.2 Portraits — build the missing TCF PACKER so portraits are drop-in

Portraits live in the TCF atlases `data/image/Face/*.tcf` (cracked format:
18B header + 1024B BGRA-256 palette + `w*h` 8-bit indices, bottom-up; cells 64x80;
`tcf.hed` = `[u32 offset][u32 size]` slot directory, per-atlas blocks oem=0x0 /
oam=0x640 / o=0xaf0). The face VALUE is the composite atlas-selector+index codec
(`logh7-face-codec.mjs`). Today this feels "hardcoded" because **only a DECODER
exists (`tools/logh7_tcf_decode.py`) — there is no encoder/packer**, so you can't add
a face without hand-editing the atlas.

**Make portraits easily addable (build these):**
1. **`tools/logh7_tcf_pack.py` (the missing encoder)** — inverse of the decoder:
   take a folder of 64x80 PNGs → quantize to a shared 256-color BGRA palette → write
   the 18B header + palette + bottom-up indices → rebuild `tcf.hed` slot directory.
   Round-trip-verify against `logh7_tcf_decode.py`. Now "add a portrait" = drop a PNG
   + run the packer → it occupies a free atlas slot.
2. **Portrait manifest / face-id registry** — emit the new slot's composite face-id
   (`encodeFace(atlas, index)`) into a `content/roster/face-pool.json` (or a mod's
   `portraits.json`) so the **server** can assign it to a character (Layer A). Adding
   a portrait then needs zero client RE: pack → register face-id → assign in content.
3. **NEW SLOTS get created (not just free-slot reuse) — RE-located patch.** The
   per-atlas caps and the `tcf.hed` block bases are **hardcoded immediates in the
   atlas reader `FUN_005924c0`**: case 0 (oem) gates `if (199 < index)`; case 1
   (oam) addresses the directory at `param_1 + 0x640 + index*8`; case 2 (o) at
   `param_1 + 0xaf0 + index*8`; the face-id codec `FUN_00592c30` carries the matching
   `%1000` index + atlas bases (oem=0, o=10000, oam=100000, gem=1000000…). So a
   **Layer-D patch descriptor `tools/client_patches/face-atlas-expand.json`** can:
   (a) raise the cap immediate (e.g. oem `199` → up to ~9999 — there is huge face-id
   headroom: oem can hold 0..9999 before the `o` base at 10000, `o` 10000..99999,
   etc.), and (b) **shift the subsequent block-base immediates** (oam 0x640, o 0xaf0,
   gem… ) to fit the enlarged `tcf.hed`. Paired with the `logh7_tcf_pack` packer
   re-emitting the atlas + a `tcf.hed` sized to the new caps, and the server
   `logh7-face-codec.mjs` (+ the portrait registry) updated to the new caps/bases.
   **Result: the modder creates as many new portrait slots as needed**, bounded only
   by the (large) face-id numeric ranges — no fixed 199/95/99 ceiling.
   - Even cleaner long-term: add a dedicated **mod atlas** (a new `case` in
     `FUN_005924c0`'s switch via a code cave + a new codec base) so mod portraits
     live in their own `*.tcf` and never collide with canon slots. Bigger patch,
     fully isolates mod faces — flagged as the "unlimited new atlas" option.

Net: a portrait mod = `mods/<name>/portraits/*.png` → `logh7_tcf_pack` (writes the
`.tcf` + an expanded `tcf.hed`) + the `face-atlas-expand` patch (creates the new
slots) + new face-ids registered in `content` (Layer A). New slots are created on
demand; nothing is hardcoded or capped at the canon counts.

---

## Layer C — Text, font & localization — UTF-8 packs + a shim DLL

The cleanest, most general text/font mod path (`docs/logh7-font-remaster.md §8–9`):

- **Text-shim DLL** hooks the ANSI text APIs (`TextOutA`/`ExtTextOutA`/`DrawTextA`/
  `CreateFontA`) → Unicode-W with `MultiByteToWideChar(CP_UTF8)` + any modern TTF.
  No EXE code patch (IAT/proxy-DLL or extend the already-loaded dgVoodoo `D3D8.dll`).
- **Language = a swappable text pack** (`lang/<id>/{String.txt, MsgDat, dialog.rsrc}`,
  UTF-8). One binary + one CJK font (Noto/Source-Han covers JP+KR) → "swap text only"
  for JP↔KR↔any language.
- **Font mod** = bundle a TTF + name it in the shim config (or the §4 in-place
  face-swap byte patch for the no-DLL path).
- Login/menu (Win32 dialog `.rsrc`) is part of the pack as a `.rsrc` overlay.

---

## Layer D — Client behaviour mods — descriptor patches + shims (no source edits)

For things only the client controls (UI draw, scene gates, camera, resolution):

- **JSON patch descriptors** `tools/client_patches/*.json` (existing system:
  menufix, dlgfix, brightbtn, earlygrid, widescreen-ui, font-upgrade, camera-focus)
  — each `{name, desc, verified, patches:[{va, originalHex, patchedHex}]}`, applied
  reproducibly by `tools/logh7_build_playable_client.py` with SHA verify + revert.
  A behaviour mod = a descriptor; no source recompile.
- **Config mods** (no patch): `GraphicConfig.txt` (resolution/LOD via
  `tools/logh7_graphics_config.py`), `dgVoodoo.conf` (AA/aniso/scaling), `win.ini`
  (`kanjimenu`/`hangeulmenu`).
- **Shim/wrapper DLLs**: dgVoodoo (graphics), text-shim (text) — runtime behaviour
  without touching EXE bytes.

---

## Layer-spanning: the mod manifest + manager

A mod is a directory; a manifest ties the layers together:

```
mods/<modname>/
  mod.json          # name, version, loadOrder, deps, targetClientSHA, minServer
  content/          # Layer A — server gameplay data (validated vs RE caps)
  assets/           # Layer B — loose-file overrides (textures/audio/models/portraits)
  lang/<id>/        # Layer C — UTF-8 text packs + dialog.rsrc + font
  patches/          # Layer D — client_patches descriptors
  shims/            # Layer D — wrapper DLLs (optional)
```

The **mod manager** (to build):
1. Resolve load order + dependencies; detect conflicts (two mods editing the same
   content id / asset path / patch VA).
2. **Layer A:** layer + validate content packs against the
   `docs/logh7-data-structures-re.md` cap table; reject/clamp over-cap data with a
   clear error (so the client never bails).
3. **Layer B:** stage `assets/` over the install (backup originals).
4. **Layer C:** select the `lang/` pack + font; configure the shim.
5. **Layer D:** apply `patches/` descriptors (SHA-checked, reversible) + `shims/`.
6. Record an apply manifest for clean **revert** (restore EXE SHA + asset backups).

---

## What's ready vs what to build

**Ready now (RE-complete this session):** Layer A data modding (server owns it +
verified caps), Layer B textures/audio/text/portraits (file-driven loaders mapped),
Layer D config + the descriptor patch system + dgVoodoo shim.

**To build:** the content-pack mod loader + cap validator (Layer A); the text-shim
DLL + language packs (Layer C); the mod manifest/manager + revert (Layer D);
`logh7_graphics_config.py` is done.

**Blocked on more RE:** 3D *mesh* mods (MDX/MDS polygon arrays — file-re-coverage
gap #1); a few P3-semantics unit fields; the in-world strategic-command activation
(P0-02) before fleet-command mods are live-testable.

**Design rule:** prefer Layer A/B (data/files) over C/D (patches) — a mod that can be
done as server content or a loose file should never be a binary patch. Keep mods
reversible and SHA-pinned to a target client build.

---

## Paradox-style modding — the design I'd actually build, and why

We are better-positioned than a typical RE'd game: **the authoritative server is
ours**, so all gameplay data is already engine-external. Paradox's whole value prop
("everything that matters is editable text, the engine just reads it") maps directly
onto our server. The design choices:

### 1. Data over code — a declarative `common/` tree (Paradox's core idea)
Every gameplay definition is a plain JSON5 file the server reads at load — modders
never touch a binary:
```
mods/<modname>/
  mod.json                     # descriptor: name, version, deps, loadOrder,
                               #   supportedClientSHA, replace_paths, tags
  common/
    characters/*.json          # roster
    fleets/*.json              # nation fleet rosters (≤14/nation)
    nations/*.json             # the 2 session powers + neutral tags
    ships/*.json
    defines.json               # tunable constants (budgets, ranges, AI knobs)
  map/
    systems/*.json             # galaxy systems + grid cells
    planets/*.json
  scenarios/*.json             # start setups
  localization/<lang>/*.json   # keyed text packs (Paradox yml-style, UTF-8)
  gfx/textures/**              # Layer B loose textures (PNG, any name kept)
  gfx/portraits/*.png          # -> logh7_tcf_pack
  gui/*.rsrc                   # login/menu dialog overlays
  patches/*.json               # Layer D client patch descriptors
  shims/*.dll                  # Layer D wrapper DLLs (optional)
```
JSON5 (not a bespoke Paradox-script parser) because it is modern, diff-able, and has
universal editor/tooling/schema support.

### 2. Override-by-path + load order (Paradox mod composition)
The loader merges base + mods in `loadOrder`; a later mod's same-keyed entry
overrides; `replace_paths` wipes a whole dir; **additive by default** (add a
character without redefining the roster). A conflict report lists mods touching the
same id/path. This is exactly Paradox's override/replace semantics.

### 3. Schema-validated against the RE'd client CAPS — the safety net
This is the move that makes it *easy AND safe*. Each data type has a JSON Schema with
the `docs/logh7-data-structures-re.md §3` caps baked in (2 powers; ≤14 fleets/nation;
≤64 cards; ≤600 units; ≤10 boats/fleet; names ≤13 UCS-2; `flagship==unit.id`; …).
Because the **client hard-bails on any cap violation**, the validator catches mod
errors *before* they reach the client — our stricter, proactive version of Paradox's
`error.log`. Editor autocomplete + `logh7-mod validate` gives modders instant feedback.

### 4. Localization as first-class swappable packs (Paradox `localization/`)
Keyed UTF-8 text per language + the §C text-shim + one CJK font → add a language =
add a `localization/<lang>/` folder; JP↔KR↔EN by selection, one binary.

### 5. Fast iteration — hot reload (Paradox's `reload` console)
A dev server command re-reads the `common/` tree live and re-seeds the world, so a
modder edits a JSON and sees it without a full restart. Huge for mod authoring.

### 6. Minimal, reversible binary surface (where we differ from Paradox)
Paradox needs no binary patches because the engine is theirs. We keep Layer C/D
(client patches + shims) as a **small, reversible, SHA-pinned** surface for the few
presentation-only things the fixed client owns (UI scale, font routing, camera).
Everything else is data.

### 7. Distribution + manager (Workshop-like)
A `logh7-mod` CLI (enable/disable/order/conflict/validate/apply/revert) first; mod
folders are shareable as-is (zip or a git repo). A lightweight registry or Workshop
bridge can come later. An apply-manifest enables clean revert (restore EXE SHA +
asset backups).

### Why this is the right call
- **90% of mods become pure server data** (characters, fleets, galaxy, ships,
  nations, scenarios, balance) — no client touch, instantly safe via cap-schema.
- **Presentation mods are loose files** (textures via D3DX8 content-dispatch,
  portraits via the TCF packer, audio, fonts, localization) — no patches.
- **The binary is touched only for what only it controls**, reversibly.
- The RE already done this session (wire protocol, data caps, file formats/consumers,
  patch descriptors, injection vectors) is exactly the foundation each layer needs.

### Build order to get there
1. **Mod loader + JSON Schema validator** (Layer A) — `common/` tree, override+load
   order, cap validation, hot reload. *Biggest leverage; server-only.*
2. **Asset pipeline** — `logh7_tcf_pack` (portraits) + `logh7_texture_pipeline` +
   `logh7_upscale_textures` (Layer B).
3. **Text-shim DLL + localization packs** (Layer C).
4. **`logh7-mod` manager + descriptor + revert** (Layer D glue), then a Workshop bridge.
