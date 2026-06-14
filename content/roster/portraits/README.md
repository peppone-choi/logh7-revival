# LOGH VII character portraits — extracted

489 unique portraits decoded from the client's `data/image/Face/*.tcf` atlases via
`tools/logh7_tcf_decode.py dumpall`. Each `NNNN.png` is 64×80 RGB, named by its **global `tcf.hed`
index** (`NNNN` = the face id the official site used as `picture/chara/NNN.jpg`).

## Format (reverse-engineered)
- `tcf.hed` = the index: 1355 slots × 8 bytes `[u32 offset][u32 size]`; 669 are non-zero. The offset
  resolves against the 7 `.tcf` atlases; each portrait region = 18-byte header + 256-color BGRA
  palette (1024 B) + `w*h` 8-bit palette indices, stored bottom-up (vertical flip on decode).
- **489 decode to valid images** (the rest: 45 entries point past every atlas, ~135 fail region
  validation — likely a second/variant region format, a refinement TODO).
- Atlases are named `[rank][faction][gender]`: `g`=将(general/officer) / `o`=士(soldier);
  `e`=帝(Empire) / `a`=同盟(Alliance); `m`/`f`=gender. So `gem` = Empire officer male (the main cast),
  `gaf` = Alliance officer female, etc.

## Verified anchors (official site numbering)
- `0209.png` = Reinhard, `0206.png` = Yang, `0085.png` = Schenkopp (all decode to clean faces).
- `_sheets/` = per-atlas contact sheets (index-labelled) for visual browsing.

## Name↔face mapping
There is **no original name↔face mapping** — the portrait pool is anonymous (the live server assigned
faces, or the character-creation face-picker let the player choose). Our server therefore **assigns**
a face index per character (`content/roster/characters.json`), bucketed by the character's
faction/gender/rank to the matching atlas range. See `docs/logh7-character-extraction-feasibility.md`.

Regenerate: `python -m tools.logh7_tcf_decode dumpall --out-dir content/roster/portraits`
