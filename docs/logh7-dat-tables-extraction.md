# LOGH VII — LANE 4: data/*.dat + *.db + *.tcf headers extraction

Source: `.omo/work/logh7-installed/data/`. Output: `content/extracted/dat-tables.json`.
Tool: `tools/logh7_dat_tables.py` (builds on `tools/logh7_msgdat.py` + `tools/logh7_tcf_decode.py`).
Method: bytes-only — every datum read from the file; nothing invented.

## 1. MsgDat *.dat string tables (22 files, 9582 records)

All `data/MsgDat/*.dat` are indexed string-table containers with one of two magics:

| magic | hex | files | format |
|-------|-----|-------|--------|
| `HFWR` | `48465752` | 21 | header(16B: textPointerCount@8, offsetTableCount@12) + aligned dword offset table + NUL-terminated **CP932** (Shift-JIS) strings |
| `GFWR` | `47465752` | 1 (`g7sw.dat`) | header(16B: recordCount@12) + length-prefixed **UTF-16LE** strings |

Record totals (declared == decoded, no losses):

| file | magic | records | non-empty | role (from decoded content) |
|------|-------|--------:|----------:|------|
| `constmsg.dat` | HFWR | 3199 | 3198 | Master game-schema / UI catalog: flagship & squadron commands, facility blurbs, rank descriptions, screen labels — the full client command/string schema |
| `g7sw.dat` | GFWR | 14 | 14 | NG-word (swear/slur) chat/naming filter list |
| `messages_0.dat` | HFWR | 594 | 98 | Command-execution log templates (`$xcommand`/`$xdate`/promotion & appointment logs) |
| `messages_1.dat` | HFWR | 594 | 252 | Subordinate proposal/assent dialogue |
| `messages_2.dat` | HFWR | 594 | 148 | Council / opinion-exchange dialogue |
| `messages_3.dat` | HFWR | 594 | 256 | Order-issuing dialogue |
| `messages_4.dat` | HFWR | 594 | 103 | Proposal-approval dialogue |
| `messages_5.dat` | HFWR | 594 | 85 | Request / consult dialogue |
| `messages_6.dat` | HFWR | 594 | 117 | Imperial-cause persuasion dialogue |
| `messages_7.dat` | HFWR | 594 | 91 | Emperor-audience honorific dialogue (御意 register) |
| `messages_8.dat` | HFWR | 594 | 102 | Command-with-trust dialogue |
| `messages_com_0.dat` | HFWR | 174 | 159 | Strategic-map / command-mode messages (bank 0) |
| `messages_com_1.dat` | HFWR | 174 | 12 | Strategic-map / command-mode messages (bank 1) |
| `messages_tac_0..8.dat` | HFWR | 75×9 | tac0=0, tac1=55, others sparse | Tactical (space-battle) messages |

Key findings:
- The 9 `messages_N` banks are **not** duplicate localizations — they are 9 distinct dialogue/log
  **categories** sharing the same 594-slot id space, each populated at different sparse indices.
  Banks map to speaker registers (e.g. bank 7 is the Emperor honorific register `陛下の御聖断`).
- `$r10$`/`$r1$` mark random dialogue-variant boundaries; `$xname$`,`$yname$`,`$yrank$`,
  `$ytitleprioritya$`, etc. are runtime field placeholders. **125 distinct `$token$` placeholders**
  across all banks (matches the wire field-token catalog).
- Encoding is CP932 for HFWR; the Korean localization would substitute CP949 (see font-localization note).

## 2. TCF portrait atlases (7 .tcf + tcf.hed)

`data/image/Face/` — 7 portrait atlases indexed by `tcf.hed`.

- `tcf.hed`: 1355 entries of `[u32 offset][u32 size]` (8B each) into a virtual atlas concatenation;
  **669 non-zero**, **416 decode to valid portraits** (index range 1..1210). The hed index == global
  face id (official `picture/chara/NNN.jpg` numbering).
- Region layout: 18B header (w@0x0c, h@0x0e u16) + 256-entry BGRA palette (1024B) + w*h 8bpp palette
  indices, stored bottom-up. Typical 64×80.
- 173 decodable indices' `[offset,size]` also fit a second atlas (ambiguous); the atlas filename is the
  authoritative owner: `[rank g将/o士][faction e帝/a同][gender m/f]` → gem/gef/gam/gaf/o/oam/oem.

| atlas | size (B) | naming | portraits (first-assigned) | dims |
|-------|---------:|--------|---------------------------:|------|
| gem.tcf | 1663390 | general/empire/male | 232 | 64×80 |
| gef.tcf | 332638 | general/empire/female | 15 | 64×80 |
| gam.tcf | 277340 | general/alliance/male | 0* | — |
| gaf.tcf | 55508 | general/alliance/female | 0* | — |
| o.tcf | 154100 | officer generic | 0* | — |
| oam.tcf | 665546 | officer/alliance/male | 45 | 64×80 |
| oem.tcf | 973246 | officer/empire/male | 124 | 62–64×80 |

\* "first-assigned" counts under naive first-atlas resolution; full per-character decode (489 portraits)
already lives in `content/character-portraits-complete.json` + `tools/logh7_tcf_decode.py`.

## 3. The single .db file

`data/image/lens/Thumbs.db` (10240 B, magic `d0cf11e0a1b11ae1`) = **OLE2 / Microsoft Compound File** =
Windows Explorer thumbnail cache for the `image/lens/` folder. A filesystem artifact, **not game data** —
contains no extractable game records.
