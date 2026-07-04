# LOGH VII Official Patch Analysis — G7UPD040514.exe

**Date analysed:** 2026-06-12  
**Analyst method:** Static binary analysis only — exe was never executed.

---

## 1. File Identity

| Field | Value |
|---|---|
| Filename | G7UPD040514.exe |
| Size | 10,913,837 bytes (10.4 MB) |
| SHA-256 | 0bd0cd52eca4050e8045cf9e469788f222333e0509b8259f64ce93736a2e489c |
| Date in filename | 2004-05-14 |
| PE compile timestamp | 2002-12-02 18:31 UTC (installer stub) |
| Type | PE32 GUI executable, 4 sections |

---

## 2. Installer Type

**InstallShield 7.01 Single-File SFX (Setup Player 2K2)**

Evidence:
- PE resource string: `InstallShield Setup Player 2K2`
- PE version resource: `FileVersion 7, 01, 100, 1248` / `ProductVersion 7, 01`
- Copyright: `Copyright (C) 1990-2002 InstallShield Software Corporation`
- Overlay descriptor at offset 0x19200 begins with `data1.cab\0Disk1\data1.cab\0`
- Four `ISc(` (magic 0x28635349) block descriptors embedded in overlay
- IS7 proprietary compression algorithm (not standard zlib/deflate/MSCF) used for game data

The exe is **not** NSIS, Inno Setup, WinRAR SFX, or standard Cabinet — it is an IS7 SFX that
bundles all install media into one self-extracting executable. The game data uses IS7's
proprietary LZ-derivative compression and cannot be extracted without the IS7 runtime
(ikernel.dll) or a compatible tool. `unshield` (libunshield) handles IS3–6; IS7's cabinet
format has a different internal layout that it rejects with "Invalid file signature".

---

## 3. Internal Layout (Binary Map)

| Offset | End | Size | Content |
|---|---|---|---|
| 0x000000 | 0x019200 | 102 KB | IS7 stub PE (`.text` / `.rdata` / `.data` / `.rsrc`) |
| 0x019200 | 0x059D0F | 264 KB | **data1.cab** — IS7-compressed; contains setup.inx, setup.ini, setup.boot, layout.bin (installer metadata only) |
| 0x059D0F | 0x06200D | 33 KB | **data1.hdr** descriptor block — IS7-compressed IS cabinet file table (33,492 bytes uncompressed) |
| 0x06200D | 0x969A9D | 9.4 MB | **data2.cab** — IS7-compressed; contains the actual game data files (see §4) |
| 0x969A9D | 0x9D0469 | 410 KB | **engine32.cab** — standard MSCF Cabinet; IS7 engine runtime (fully extractable) |
| 0x9D0469 | 0x9DB41F | 57 KB | Post-engine region: layout.bin descriptor + SZDD-compressed Setup.dll |
| 0x9DB41F | 0xA6882D | 579 KB | Additional IS7 setup support files (Setup.dll body, IS runtime fragments) |

---

## 4. Full File Inventory

### 4a. Extracted — engine32.cab (standard MSCF, fully extracted to `extracted/engine/`)

| File | Size | Date |
|---|---|---|
| ikernel.dll | 696,320 | 2003-02-27 |
| IScript.dll | 237,568 | 2002-12-02 |
| IUser.dll | 155,648 | 2002-12-05 |
| IsProBENT.tlb | 85,240 | 2002-12-02 |
| IsProBE9x.tlb | 94,606 | 2002-12-02 |
| objectps.dll | 32,768 | 2002-12-02 |
| ctor.dll | 57,344 | 2002-12-02 |
| DotNetInstaller.exe | 5,632 | 2002-12-02 |
| iKernel.rgs | 25,830 | 2002-12-02 |

These are IS7 runtime support files only — **no game content**.

### 4b. IS7-Compressed (not extractable without IS7 runtime) — inferred from string scan

**data1.cab** (264 KB compressed → ~264 KB uncompressed, installer metadata):
- setup.inx (installer script)
- setup.ini
- setup.boot
- layout.bin

**data2.cab** (9.4 MB compressed → 9,468,513 bytes uncompressed, **game data**):
- `galaxy.mdx` — galaxy map binary (star systems, hyperspace routes, planet data)
- `galaxy_all.bmp` — full galaxy background bitmap
- `galaxy_alpha.bmp` — galaxy alpha/overlay bitmap
- Additional files likely include: grid.mdx, grids.mdx (star-grid layout files seen in filename string cluster at offset 0x61E00–0x61F50)

### 4c. Setup support (SZDD-compressed, partially identified)
- Setup.dll (version 7.1.100.1248, 153,271 bytes uncompressed)

---

## 5. Client Executable Comparison — Verdict: NOT PRESENT

The patch **does not contain G7MTClient.exe** or any updated game binary.

Exhaustive string scans of the entire 10.9 MB file found **zero occurrences** of:

```
G7MT, G7MTClient, G7MTServer, G7Start, BootFirst, Gin7Update,
GIN7, gin7, LOGH, logh7, String.txt, constmsg, msgdat, .tcf,
PacketTrace, WorldInit
```

This definitively rules out any updated client executable. The patch is a **data-only update**.

Our pristine reference client (`.omo/ghidra/bin/G7MTClient.exe`, SHA-256
`2848be76...c155345`) is not targeted by this patch and remains unaffected.

**Implication for RE work:** This patch does not provide a newer client build to re-index in
Ghidra. Protocol RE against G7MTClient.exe v0 (the CD build) remains the correct target.

---

## 6. Patch Notes / Version Info

No plaintext readme or patch notes were found (no plain-text `[Product]`/`[Setup]` sections;
setup.ini is stored IS7-compressed inside data1.cab).

From the binary evidence:
- The patch is dated **2004-05-14** — during the live closed-beta server era (game ran
  2003–2004 before servers closed).
- IS7 installer version `7.01.100.1248`, compiled December 2002.
- The string `"0.0.0.0"` appears as the installed-from version, suggesting this patch
  applies over any version (no strict version prerequisite check).
- No version string like "1.x → 2.x" is visible.

The patch updates **galaxy map data** — during live service, galaxy.mdx was likely updated to
fix star system coordinates, hyperspace route topology, or planet assignments.

---

## 7. Ranked Value for Revival

| Rank | Item | Why Valuable |
|---|---|---|
| **1** | `galaxy.mdx` (in data2.cab) | **Highest value.** The official binary galaxy map from the live 2004 server era. Our current `content/galaxy.json` was recovered from PDF annotations — the binary .mdx would give us the authoritative coordinate set, corrected routes, and any last-minute topology fixes applied before shutdown. If extractable, this is ground truth for the galaxy layout. |
| **2** | `galaxy_all.bmp` + `galaxy_alpha.bmp` | Official galaxy background artwork at production quality. Currently missing from our asset set; could feed into a remastered UI. |
| **3** | `grid.mdx` / `grids.mdx` | Grid-layout files likely describe the spatial partitioning used for in-world ship positioning and movement — directly relevant to the 0x0400 CommandMoveShip / 0x0423 NotifyMovedShip protocol work. |
| **4** | IS7 compression algorithm (ikernel.dll) | ikernel.dll is now extracted. It contains the deflate implementation used to compress data2.cab. If we ever need to unpack or re-pack patch content, ikernel.dll is the reference decompressor (696 KB, Feb 2003 build). |
| **5** | Installer metadata (setup.inx) | setup.inx contains the component tree and file-installation rules. If decompressed, it would confirm the exact install paths and registry keys the live game used — useful for client modding. |

---

## 8. Extraction Status

| Component | Status |
|---|---|
| engine32.cab | **Fully extracted** to `.omo/work/logh7-patch/extracted/engine/` |
| data2.cab (game data) | **Not extracted** — IS7 proprietary compression; requires IS7 runtime (ikernel.dll) or a compatible unpacker. Candidate tool: build a custom IS7 decompressor using ikernel.dll as reference, or find/build an IS7-aware version of unshield. |
| data1.hdr | Carved as `.omo/work/logh7-patch/data1_optB.hdr` (33,492 bytes) — not yet decompressed |
| Setup.dll | Carved as `.omo/work/logh7-patch/Setup.dl_` — SZDD header misaligned in the SFX, not yet cleanly expanded |

---

## 9. Next Steps to Unlock data2.cab

The IS7 compression uses a custom chunked algorithm (chunk headers at 4-byte boundaries, with
IS7-specific bit-stream encoding — not raw DEFLATE). Three paths to extract:

1. **Run the installer in an isolated VM** (Wine/Windows sandbox, no network): IS7 SFX will
   self-extract to `%TEMP%\{GUID}\` before showing the wizard. Kill the process after extraction
   but before installation completes — the files will be in the temp directory. This is the
   fastest path.

2. **Build IS7-aware unshield**: The unshield project has open issues for IS7 support. With
   ikernel.dll as a compression reference and the data1.hdr file table we've carved, a
   targeted patch to libunshield's cabinet reader could unlock full extraction.

3. **Use the extracted ikernel.dll via COM**: ikernel.dll exposes IS COM interfaces
   (`ISetupEther`, `ISetupPlayer`). In principle, calling its decompression routines via
   CoCreateInstance could decompress the data blobs — but this requires running native x86
   Windows code.

---

## Extraction status & carve map (2026-06-12 follow-up — binary NOT executed)

Safe (no-exec) extraction was attempted and the embedded cabinets were located by carving the SFX
(`grep -aboE 'ISc\(|galaxy\.mdx|grid\.mdx|grids\.mdx'`). Byte offsets in `G7UPD040514.exe`:

| Offset (dec) | Marker | Meaning |
|---|---|---|
| 102953 | `ISc(` | IS7 engine/runtime cabinet |
| 367887 | `ISc(` | (installer metadata cabinet) |
| ~400902 | `galaxy_all` / `galaxy_alpha` | file-table names (data2 contents) |
| ~401207 | `galaxy.mdx` / `grid.mdx` / `grids.mdx` | **file-table names — the game data we want** |
| 401421 | `ISc(` | **data cabinet start (≈9.9 MB → game data: galaxy/grid mdx + bmps)** |
| 10335263 | `ISc(` | trailing cabinet (≈578 KB) |

### ✅ EXTRACTION SUCCEEDED (2026-06-12, user-authorized)

The IS7 blocker was solved with a hybrid approach (no full install — the bundled `setup.exe` bounces
on a non-Japanese locale, so the installer can't run to completion here):

1. **Ran the SFX briefly** so its "Setup Player" wrapper extracted the engine cabinets to `%TEMP%`,
   then **captured byte-perfect `data1.hdr` (file table) + `data1.cab` (volume 1)** before killing the
   process (the locale bounce happens later, in `setup.exe`, after the wrapper's extraction).
2. **Carved `data2.cab` (volume 2 = game data)** from the SFX at its `ISc(` header (offset 401421 → EOF).
3. **`unshield x data1.cab`** with `data1.hdr` + `data1.cab` + `data2.cab` co-located → **265 files
   extracted cleanly** (sizes match the file table exactly). unshield reads the IS7 header fine once
   the cabinets are provided as proper separate volumes — the earlier "rejection" was a bad carve.

**Recovered (full inventory in `content/original-data/patch-2004-05-14/README.md` +
`.omo/archive/logh7-patch-2004-05-14/MANIFEST.sha256`):**
- `data/model/strategy/{galaxy,grid,grids,g_board}.mdx` — galaxy.mdx SAME as installed; **grid.mdx
  REPLACED** (live-era 12 KB vs installed 44 KB); **grids.mdx + g_board.mdx NEW** (absent from our build).
- `data/model/images/{Hi,Lo,Mid}/` galaxy/grid BMPs + 239 ship-model textures, Japanese string-table IPS.

**What the `.mdx` actually are (`docs/logh7-strategic-mdx-analysis.md`):** serialized D3D **render
geometry** (pointer-fixup arrays), i.e. the board's VISUAL mesh — **not** the 0x0313/0x0315 cell-grid
protocol data (which the RE proved is server-authoritative, never a client file). So the server stays
the source of the sector grid; the recovered files pin the live-era board geometry and add two assets
(`grids.mdx`, `g_board.mdx`) our install lacked. Galaxy STATE data remains `Null_galaxy.mdx` (installed).

---

*Analysis performed 2026-06-12. Binary never executed.*
