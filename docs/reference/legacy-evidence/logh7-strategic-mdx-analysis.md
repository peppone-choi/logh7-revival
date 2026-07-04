# LOGH VII strategy `.mdx` analysis (patch 2004-05-14)

Format analysis of the four `data/model/strategy/*.mdx` files recovered from the official patch
`G7UPD040514.exe` (see `content/original-data/patch-2004-05-14/README.md` for provenance).

## What `.mdx` is — serialized D3D model with pointer fixups

Each file is a **binary memory image of a serialized C++ model object**, not a text/tagged format
(zero ASCII strings). The header is a table of `[u32 pointer][u32 count]` array descriptors:

```
galaxy.mdx : a0 00 e3 01 | 02 00 00 00   → ptr 0x01e300a0, count 2
             70 02 e3 01 | 02 00 00 00   → ptr 0x01e30270, count 2
             94 03 e3 01 | 12 00 00 00   → ptr 0x01e30394, count 18
grid.mdx   : a0 00 d0 01 | 01 00 00 00   → ptr 0x01d000a0, count 1
grids.mdx  : a0 00 d0 01 | 01 00 00 00   → (byte-identical header to grid.mdx)
g_board.mdx: 78 3c c6 01 | 03 00 00 00   → ptr 0x01c63c78, count 3
```

- The pointers are **absolute addresses** into the client's data/heap region
  (`0x01c6_xxxx … 0x01e3_xxxx`). The loader relocates them on load — i.e. the file is a snapshot of an
  in-memory object graph (vertex/index/material arrays referenced by pointer + element count). This is
  the same family as `galaxy.mdx`/`Null_galaxy.mdx` (the data-survey pass found `galaxy.mdx` embeds the
  source path `W:\Gin7\CG\g\galaxy_map\objects\galaxy.lwo` — a LightWave model export).
- `grid.mdx` and `grids.mdx` share a **byte-identical 48-byte header** (`0x01d0_xxxx` pointers) → same
  object class, different payload sizes (12 KB vs 33 KB). `grids.mdx` ("grids", plural) is likely a
  multi-LOD or multi-variant board mesh.

## Patch delta vs our installed build
| File | Patch | Installed | Meaning |
|---|---|---|---|
| `galaxy.mdx` | 16,508 B | 16,508 B (same SHA) | unchanged galaxy backdrop model |
| `grid.mdx` | 11,934 B | 44,140 B | **replaced** — the live-era board mesh (much smaller → re-authored geometry) |
| `grids.mdx` | 32,818 B | absent | **new** board-mesh variant added by the patch |
| `g_board.mdx` | 7,982 B | absent | **new** "game board" model added by the patch |

## Relevance to the server (the key conclusion)

These are **client-side RENDER geometry** for the strategic board — they are **NOT** the strategic
**cell-grid / object-table protocol data** (0x0315 `ResponseStaticInformationGrid` / 0x0313
`ResponseStaticInformationGridType`). The reverse engineering already proved the 100×50 cell grid and
the object table are populated **only from the server wire** (`docs/logh7-strategic-map-wire.md` §5),
never from a client file. So:

- **The server stays authoritative** for the sector cell grid / fleet object placement — our
  `buildStaticInformationGridInner` / `buildStaticInformationGridTypeInner` remain the source of that
  data; these `.mdx` do not replace the synthetic placement.
- **Value of the recovered `.mdx`:** they pin the board's intended VISUAL structure and confirm the
  patch re-authored the board geometry in the live era. Useful if/when we render or validate the board
  client-side, and `g_board.mdx`/`grids.mdx` are assets our installed build lacked entirely (now
  archived). The richer galaxy STATE data (star objects, 8 planet slots, IDs 1–680) remains
  `Null_galaxy.mdx` (installed), the top target for galaxy-content mining — not these geometry files.

## Open follow-up
- Full `.mdx` vertex/material decode (relocate the pointer table, read the arrays) would let us render
  the board, but is not needed for the authoritative server. Deferred unless client-side board
  rendering/validation is pursued.
