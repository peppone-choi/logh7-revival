# LOGH VII missing strategic system coordinate forensics (2026-07-03)

## Scope

This note covers the five `constmsg`-confirmed systems whose strategic-map coordinates are still unrecovered:

| System | constmsg record | group `0x18` subId |
|---|---:|---:|
| `アンウレガルラ` | 1416 | 13 |
| `ケープホーン` | 1435 | 32 |
| `コブラヴェルデ` | 1437 | 34 |
| `ニーベルング` | 1455 | 52 |
| `モンサルヴァール` | 1478 | 75 |

Do not treat previous visual/minimap placement candidates as recovered authority. They remain problem context only.

## Current conclusion

No original installed/RE file scanned in this pass contains a recoverable strategic coordinate source for the five systems in any of these tested forms:

- ordered coordinate arrays matching known 80 system positions
- `0x315` RLE grid payloads matching the client parser
- decompressed 100x50 strategic grid blocks matching known subId-at-cell positions

The client RE path shows the real strategic-map position source is the runtime `0x315` grid payload, not a simple embedded coordinate table in `constmsg.dat`, EXE, DLL, MDX, or TCF files found here.

## Raw `constmsg.dat` evidence

Source: `.omo/work/logh7-installed/data/MsgDat/constmsg.dat`

- magic: `HFWR`
- size: `115546`
- `textPointerCount`: `3199`
- `offsetTableCount`: `120`
- `payloadOffset`: `496`
- group `0x18`: base record `1403`, next group `1492`, count `89`

The five missing systems are short NUL-terminated CP932 text records only:

| record | subId | raw offset | byte length |
|---:|---:|---:|---:|
| 1416 | 13 | 59758 | 10 |
| 1435 | 32 | 59930 | 8 |
| 1437 | 34 | 59944 | 12 |
| 1455 | 52 | 60097 | 6 |
| 1478 | 75 | 60301 | 8 |

Generated evidence: `.omo/analysis/toolchain-20260703/constmsg-missing-record-raw.json`.

## File forensics performed

Target list: `.omo/analysis/toolchain-20260703/raw-scan-targets.txt`

The broad scan covered 8,366 forensics targets: installed files, RE exports, server/client content, Wayback/update artifacts, PCAPs, live-analysis logs, images, sounds, PDFs, and project evidence outputs. Toolchain runtimes and downloaded installer caches under `.omo/toolchain`, `.omo/downloads`, `node_modules`, `.git`, and build/test output directories were excluded because they are analysis tooling, not LOGH VII evidence.

The ordered-coordinate scan additionally used a 1,931-file structured subset because raw coordinate arrays are only meaningful in executable/library/data/database/JSON/PCAP-like files. The RLE and raw-grid scans were run across the full 8,366-file forensics set.

| Scan | Artifact | Result |
|---|---|---:|
| ordered coordinate table scan | `.omo/analysis/toolchain-20260703/strategic-coordinate-table-scan-full-coordinate-structured.json` | 1,931 structured files scanned, 0 candidates, 0 errors |
| `0x315` RLE payload scan | `.omo/analysis/toolchain-20260703/grid-rle-payload-scan-full-forensics.json` | 8,366 files scanned, 0 candidates |
| decompressed 100x50 grid block scan | `.omo/analysis/toolchain-20260703/grid-raw-block-scan-full-forensics.json` | 8,366 files scanned, 0 candidates |

Scanner sources:

- `.omo/analysis/toolchain-20260703/scan-strategic-coord-tables.mjs`
- `.omo/analysis/toolchain-20260703/scan-strategic-coord-tables-anchor.mjs`
- `.omo/analysis/toolchain-20260703/scan-grid-rle-payloads.mjs`
- `.omo/analysis/toolchain-20260703/scan-grid-raw-blocks.mjs`

## RE-confirmed strategic grid consumer path

These findings come from `RE/.omo/ghidra/export/G7MTClient/functions.jsonl` through `python -m tools.logh7_redex`.

- `FUN_004b8b00`: cases `0x313` and `0x315` both declare payload size `0x138c` (`5004`) bytes.
- `FUN_004ba2b0`, case `0x313`: copies `0x4b` dwords plus one byte into `state + 0x3f57d4`.
- `FUN_004ba2b0`, case `0x315`: copies `0x4e3` dwords (`5004` bytes) into `state + 0x3f4448`, then calls `FUN_004abbb0(state + 0x3f444c, payload)`.
- `FUN_004abbb0`: parses `payload[0]` width, `payload[1]` height, `u16le payload[2:4]` RLE byte count, then expands `(runLength, value)` byte pairs into `width * height` bytes. For the strategic map this is expected to be `100 * 50 = 5000`.
- `FUN_004c5350`: promotes the received buffers into the active runtime grid: `state + 0x3f4448 -> state + 0x2c03c8` and `state + 0x3f57d4 -> state + 0x2c1754`.
- `FUN_004c8b70(col,row)`: reads `*(byte *)(DAT_007ccffc + row * 100 + 0x2c03cc + col)` for `0 <= col < 100`, `0 <= row < 50`, then maps the byte into the 3-byte grid-type table at `state + 0x2c1755 + value * 3`.
- `FUN_004c8bc0`: scans all 5000 cells and, for byte values `3..0x58`, stores the last seen `row * 100 + col` cell into a table indexed by that byte value.

Implication: if a valid official `0x315` payload is recovered, subIds `13`, `32`, `34`, `52`, and `75` can be read directly from the decompressed grid. If no official payload is recovered, assigning cells for those subIds is a project-created content/balance decision, not recovered canon.

## Next evidence routes

- Packet/protocol route: recover an official `0x315` payload from packet captures, archived server traces, or a preserved server binary/data dump.
- Archive route: continue Wayback/CDX search for old server data/update packages that may contain static grid payloads outside the installed client files.
- Runtime route: when our server emits `0x315`, capture and decode it with the RE-confirmed RLE parser to prove the client consumes intended subId cells.
- Content route: if official payload evidence remains unavailable, define the five missing cells as our own balance patch, clearly marked non-canon/P3 until better evidence upgrades it.
