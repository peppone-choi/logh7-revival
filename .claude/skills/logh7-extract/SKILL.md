---
name: logh7-extract
description: Recover canonical content from LOGH VII original assets — MDX models, TCF portraits, BMP textures, and the gin7manual PDF star chart. Use to pull star positions, spectral classes, portraits, deployments, or any datum the server needs from a binary/visual source. Triggers: "추출", "MDX", "TCF", "BMP", "PDF", "星系図", "에셋에서 복구", "galaxy positions".
---

# LOGH VII — Asset Extraction

Always inspect/render before parsing — guessing a binary layout wastes cycles. View images you produce.

## MDX models (`data/model/**/*.mdx`)
Header = 10 `(ptr,count)` dwords (ptrs are memory-dump addrs; **counts are the data**; file offset ≈ `ptr − 0x1e30000`). Named scene-graph nodes sit on a **0xE8 stride from 0x58** (`read_cstr`). Tool: `tools/logh7_mdx_extract.py`.
- **`Null_galaxy.mdx` is a TEMPLATE**: 79 `star_NN_<spectralClass>` nodes (G/O/F/A/B/M/K) but **transforms are all zero — NO positions** (positions are runtime/scenario data, lost with the original server). `galaxy.mdx` is the nebula backdrop, not stars.

## The real star positions: gin7manual PDF (page 101 星系図)
The canon layout is **vector dots on the manual's star chart**, not in any model. Use PyMuPDF (`fitz`):
```python
pg = fitz.open(".omo/work/manual_saved.pdf")[100]      # page 101
dots = [((r.x0+r.x1)/2,(r.y0+r.y1)/2) for d in pg.get_drawings()
        if (r:=d['rect']) and r.width<8 and r.height<8 and r.width>0.3]   # exactly 80 star dots
```
- **Watch the Y-flip / page rotation=90°.** Naive matching to `galaxy.json` cx/cy missed by 713px until the flipY was applied; with it, residual 0.04pt, faction-color match 80/80. Match each label box (color = faction) to its nearest dot.
- Grid: pixel-lattice autocorrelation gives pitch (14px@2x = 7pt/cell) + origin → `col/row` on the 100×50 grid. Teal fill = navigable, black = non-navigable → the passable-cell mask. Result lives in `content/galaxy-passable-cells.json` + `canonCol/canonRow` in `galaxy.json`.

## Others
- **TCF portraits**: 18B header + 1024B BGRA palette + w*h 8-bit indices bottom-up; `tcf.hed` = `[u32 offset][u32 size]` slots. Tools: `tools/logh7_tcf_decode.py` / `tcf_pack.py`. Face groups: O-group = canon, G-group = player.
- **BMP**: PIL; palette mode common. The galaxy backdrop has NO bright star points (mean ~60, max ~150).
- Grade extracted data: PDF star chart = **P1**; pixel-segmentation boundaries = ±1 cell uncertain. Never promote a P2/P3 source to canon.
