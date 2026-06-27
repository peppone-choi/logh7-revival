# LOGH VII Mods

Drop a mod here and the server layers it over the base content — **no client patch, no recompile**.
The mod loader merges by id (additive: new id adds, existing id overrides) in load order, then validates
the result against the RE'd client caps so a mod can never bail the client parser.

See `docs/logh7-modding-architecture.md` for the full picture (4 layers, manifest, the Paradox-style design).

## Make a mod (Layer A — gameplay content)

```
mods/<your-mod>/
  mod.json                 # { name, version, loadOrder, enabled, defines? }
  content/
    characters.json        # [ {id, name, nameRomaji, nationId, abilities:[8], portraitIndex, ...} ]
    systems.json           # [ {name, contentId>=3, cx, cy, ...} ]
    ships.json             # shipClasses (file name = collection: characters/systems/nations/units/shipClasses)
    nations.json
```

Each `content/<collection>.json` is a JSON array (or `{ <collection>: [...] }`). Entries merge by `id`
(`name` for systems). Use `__remove: true` on an entry to delete a base entry by id.

## Caps you MUST respect (else the client bails)

From `docs/logh7-data-structures-re.md` §3, enforced by `src/server/logh7-content-caps.mjs`:

- **2 playable powers/session** (empire 0x500 + alliance 0x501); Phezzan/neutral = 0x502, never a 3rd power.
- names ≤ **13** UCS-2 units · ability block = exactly **8** · special abilities ≤ **80**
- units ≤ **600** · boats/fleet ≤ **10** · per-nation fleet roster ≤ **14**
- card roster ≤ **64** · cards/char ≤ **16** · entry chars ≤ **5**/account
- a system marker `contentId` must be **≥ 3** (0..2 are grid-type labels → "공간 그리드" phantom)

## Workflow

```
# 1. author your mod under mods/<name>/
# 2. pre-flight validate (proactive cap check)
node tools/logh7_validate_mod.mjs mods
# 3. serve with mods applied (opt-in)
LOGH_MODS_DIR=mods  npm run server:auth     # (+ LOGH_CONTENT_DB=1 to mod over the extracted DB)
```

If a mod exceeds a cap, validation fails and the server serves the **base unmodified** (logs the errors) —
modding never breaks the client. Portraits: add via `tools/logh7_tcf_pack.py` (+ `face-atlas-expand` for
new slots). Textures: `tools/logh7_texture_pipeline.py`. Text/localization: `tools/logh7_msgdat_encode.py`
+ the text-shim (see `docs/logh7-font-remaster.md`).

`example-add-officer/` is a working example (adds one Empire officer).
