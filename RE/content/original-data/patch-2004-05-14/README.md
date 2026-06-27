# LOGH VII Official Patch G7UPD040514 — extracted strategy data (2004-05-14)

The official closed-beta-era Japanese client patch, recovered from the Wayback Machine and extracted
with `unshield`. This directory holds the **strategy `.mdx` files** — the high-value, small payload.
The full 265-file extraction (239 ship textures, galaxy/grid BMPs in Hi/Lo/Mid, Japanese string-table
IPS, etc.) is archived under `.omo/archive/logh7-patch-2004-05-14/` (gitignored, with `MANIFEST.sha256`).

## Provenance
- **Source:** `http://web.archive.org/web/20040625193252id_/http://gineiden.com/G7UPD040514.exe`
- **Patch SFX:** `G7UPD040514.exe` — 10,913,837 B, SHA-256 `0bd0cd52eca4050e8045cf9e469788f222333e0509b8259f64ce93736a2e489c`, dated 2004-05-14 (live closed-beta server era).
- **Installer type:** InstallShield 7 SFX ("Setup Player 2K2"). The bundled `setup.exe` bounces on a
  non-Japanese locale, so it cannot self-install here. Extraction path that worked:
  1. Run the SFX briefly so its wrapper writes the engine cabinets to `%TEMP%` → captured byte-perfect
     `data1.hdr` (file table) + `data1.cab` (volume 1).
  2. Carve `data2.cab` (volume 2, game data) from the SFX at the `ISc(` header (offset 401421 → EOF).
  3. `unshield x data1.cab` with `data1.hdr` + `data1.cab` + `data2.cab` co-located → 265 files.

## Strategy `.mdx` files (this directory) — vs our installed client
| File | Patch size | Installed | Verdict |
|---|---|---|---|
| `galaxy.mdx` | 16,508 B | 16,508 B | **SAME** — no change |
| `grid.mdx` | 11,934 B | 44,140 B | **DIFFERENT** — patch replaces it with the live-era version |
| `grids.mdx` | 32,818 B | (absent) | **NEW** — not in our installed build |
| `g_board.mdx` | 7,982 B | (absent) | **NEW** — not in our installed build |

`.mdx` = serialized D3D model/geometry (pointer-table header, load-address pointers in the `0x01c6…`/
`0x01d0…`/`0x01e3…` range) — the strategic board's RENDER geometry, distinct from the server-sent
cell-grid/object-table protocol data (0x0313/0x0315). The two NEW files (`grids.mdx`, `g_board.mdx`)
and the replaced `grid.mdx` are genuinely new assets the live patch carried. Format analysis:
`docs/logh7-strategic-mdx-analysis.md` (in progress).

## Full extraction inventory (archived, gitignored)
`.omo/archive/logh7-patch-2004-05-14/`:
- `data/model/strategy/` — the 4 `.mdx` above
- `data/model/images/{Hi,Lo,Mid}/` — `galaxy_all.bmp`, `galaxy_alpha.bmp`, `grid01.bmp`, `grid02.bmp`
  (3 resolution tiers) + 239 ship-model textures (`EH*/EM*/f*` `.bmp`/`.tga`)
- `japanese-string-table/StringTable-0011-Japanese.ips` — installer string patch
- `MANIFEST.sha256` (252 entries), `SOURCE.sha256` (SFX + cabinet hashes)
