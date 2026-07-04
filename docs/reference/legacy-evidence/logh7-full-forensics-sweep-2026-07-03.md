# LOGH VII full forensics sweep 2026-07-03

This pass was run after the user rejected minimap-only reasoning and asked to run the whole analysis stack. It covers data-mining, packet/protocol, binary RE automation, live-state forensics, Wayback patch recovery, and a CSO-style security quick pass. It is diagnostic evidence only; it does not count as normal launcher plus Docker Compose readiness.

## Evidence root

- Summary JSON: `RE/.omo/forensics/full-sweep-20260703/full-sweep-summary.json`
- Summary markdown: `RE/.omo/forensics/full-sweep-20260703/full-sweep-summary.md`
- Rerun evidence: `RE/.omo/forensics/full-sweep-20260703-rerun/`
- Rerun strategic scan JSON: `.omo/analysis/toolchain-20260703/*-rerun-codex.json`
- Live PCAP: `RE/.omo/forensics/full-sweep-20260703/logh7-live-loopback-47900.pcapng`
- PCAP/trace correlation: `RE/.omo/forensics/full-sweep-20260703/logh7-live-pcap-trace-correlation.json`
- Runtime dump: `RE/.omo/forensics/full-sweep-20260703/G7MTClient-24356-full.dmp`
- Wayback update corpus: `RE/.omo/forensics/full-sweep-20260703/wayback-update-texts.txt`
- Allrun evidence: `RE/.omo/forensics/full-sweep-20260703-allrun-20260703-063624/`
- Allrun analysis: `.omo/analysis/full-sweep-20260703-allrun-20260703-063624/`
- Allrun summary JSON: `RE/.omo/forensics/full-sweep-20260703-allrun-20260703-063624/allrun-summary.json`
- Allrun summary markdown: `RE/.omo/forensics/full-sweep-20260703-allrun-20260703-063624/allrun-summary.md`

All new cache/evidence paths are under `E:\logh7-revival`. Do not intentionally add new development caches to `C:`.

## Allrun 2026-07-03 06:36 KST

This was the expanded "run everything" pass after the user rejected minimap-only reasoning. It kept evidence under the E: workspace and did not install/cache new analysis material on C:.

What changed from the earlier rerun:

- Strategic coordinate recovery was expanded beyond the previous 8,366-file scan. RLE payload and raw 100x50 grid scans covered 60,290 files each.
- RLE payload scan: 60,290 files, 0 candidates.
- Raw 100x50 grid scan: 60,290 files, 1 candidate, classified as analysis-tool false positive because the file is `.omo/toolchain/py311/Lib/site-packages/cv2/opencv_videoio_ffmpeg500_64.dll`, not a LOGH7 artifact.
- Structured coordinate table scan: 1,931 files, 0 candidates.
- Anchor coordinate table scan: 8,210 files, 0 candidates, 0 errors.
- Data survey confirmed 2,254 installed files: 73 binary/unknown, 1,719 image, 419 model, 21 HFWR string table, 1 GFWR table, 20 audio, 1 PDF.
- CD/install audit compared 25 CD entries against 2,254 installed files: 5 matched, 20 missing from install, 0 size mismatches among matched entries.
- EXE function audit covered 18,485 functions; ConstMsg audit covered 120 groups and 636 callsites; display-function audit covered 203 functions.
- Packet/protocol pass reused `logh7-live-loopback-47900.pcapng`: 236 packets, 109 TCP payload frames, 428,844 payload bytes. The LOGH7 Wireshark Lua dissector is installed; a Kaitai `.ksy` spec is still not written.
- capa ran against 22 PE targets: 4 done (`LOGH7Launcher.exe`, `BootFirst.exe`, `DSETUP.dll`, `D3D8.dll`), 18 timed out. FLOSS ran against 22 targets: 1 done (`LOGH7Launcher.exe`), 21 timed out. Therefore Ghidra/redex indexes remain the authority for `G7MTClient.exe`.
- binwalk rebuilt summary contains 87 non-empty JSON outputs and 87 non-empty text outputs.
- Volatility 3 `windows.info` failed on the ProcDump user-mode dump because that plugin family needs a full physical/system memory image with kernel layer/symbol requirements.
- CSO quick pass found no high-confidence externally exploitable finding under the daily 8/10 confidence gate. `npm audit` is still blocked by ENOLOCK because `server/` has no lockfile.

Current conclusion: no LOGH7 artifact source for the five missing strategic system coordinates was recovered in this allrun. Do not promote minimap inference as recovered original data; next attempts need a different evidence path such as packet/state RE, memory table tracing, CD/CAB recovery, Wayback/original-server evidence, or direct opcode-consumption probes.

## What ran

- PE inventory over installed EXE/DLL tree: 22 targets.
- capa pefile attempted over all 22 PE targets, but generated 0-byte JSON. Re-run with absolute `G7MTClient.exe` path failed with capa `NotImplementedError`; do not count pefile mode as successful evidence.
- capa vivisect succeeded for 5 core targets: `G7Start.exe`, `Gin7UpdateClient.exe`, `D3D8.dll`, `BootFirst.exe`, `DSETUP32.dll`.
- `G7MTClient.exe` capa vivisect was retried with absolute path, exceeded the timebox, and was stopped. Use Ghidra/redex full-decompile index for G7MTClient authority instead.
- DIE, FLOSS, binwalk, Sysinternals strings, LOGH7 YARA over PE targets.
- Client data survey over 2,254 installed files.
- DIE, YARA, strings, binwalk over 2,297 data/content targets.
- Strategic RLE payload scan over 8,366 files.
- Raw 100x50 strategic grid block scan over 8,366 files.
- Structured coordinate-table scan over 1,931 files.
- Live loopback PCAP through Wireshark/Npcap plus server trace correlation.
- ProcDump user-mode full dump of live `G7MTClient.exe`.
- x64dbg headless availability checked; no live breakpoint session was accepted as normal evidence in this pass.
- Volatility 3 attempted against the ProcDump output; failed because Windows kernel plugins require full physical/system memory image kernel symbols, not user-mode process dump.
- Wayback CDX scan for `www.gineiden.com` 2004-2005 restored update CGI pages including `2004.6.2`, `2004.6.11`, and `2004.6.24/25` candidates.
- CSO quick pass scanned tracked source/ops docs for secrets/admin-token exposure. No high-confidence externally exploitable finding was promoted; `npm audit` could not run because `server/` has no lockfile.

## Findings

- Full-file RLE/raw-grid/coordinate-table sweep did not find hidden strategic map coordinates for the five coordinate-pending systems.
- `FUN_004abbb0` remains the RE-confirmed `0x0315` strategic-grid RLE parser; coordinate recovery still needs server/source evidence, not minimap-only inference.
- Packet layer is now backed by real PCAP, not only server trace. TCP payload is still encrypted/framed; decoded opcode meaning comes from server trace correlation and static transport RE.
- `ui_explorer` canonical playable start hit `Errno 22` while copying playable EXE into installed slot. The diagnostic PCAP run used `--no-patch`, so it is not normal playable-client evidence.
- ProcDump produced a 315 MB user-mode dump. Volatility 3 kernel plugins rejected it because `windows.info` requires full physical/system memory image kernel symbols, not a user-mode process dump.
- Tool availability after recheck: Wireshark/Npcap, Ghidra, FLOSS, DIE, YARA, binwalk, strings, ProcDump, x64dbg, Noesis, and SleuthKit present. `bulk_extractor` exists as source tree only; no Windows exe was found. Assimp DLL/PDB are present; Assimp CLI exe was not found.
- SleuthKit image-level scan could not run because `artifacts/logh7-cd/Logh7_mode2_2048.iso` and the `artifacts/` tree are absent from the current checkout.
- Wayback `2004.6.2 [17:15]` update notice restores the official pre-close-beta backlog: command/proposal for promotion, demotion, appointment, dismissal, resignation, assignment; character deletion; tactical retreat warp-out fixes; tactical entry placement fix; later ground attacks against planets/fortresses; tactical repair; complete-repair bugfix; and return planet/fortress setting.
- Wayback `2004.6.11 [12:50]` confirms command/proposal implementation and additional growth, aging, rank-loss, complete-repair, mail, ship-info, and balance/fix items. Treat these as official patch-stack inputs to classify top-down before closed beta.
- CSO quick pass did not identify a reportable 8/10-confidence vulnerability. Operational gates remain: keep admin host on `127.0.0.1`, require deployment token override before public bind, and add a lockfile before dependency audit can be meaningful.

## Follow-up gates

- Fix or explain `ui_explorer` playable-copy `Errno 22` before next normal playable-client live run.
- If memory forensics must use Volatility, acquire a proper full memory image through an approved acquisition path; keep output on `E:\logh7-revival`.
- If a new candidate coordinate source appears, rerun all three strategic scans before accepting it.
- For deeper PE comparison, choose a concrete baseline pair first, then run Diaphora/BinDiff-style diff. This sweep had no second baseline selected.
- Build or install a Windows-runnable `bulk_extractor` before claiming byte-stream feature extraction coverage from that tool.
- Add a server lockfile or explicit dependency-audit policy before relying on `npm audit`.

## Rerun 2026-07-03 06:00 KST

This rerun was started after the user explicitly asked to run the whole stack again, not answer from minimap inference.

### Reconfirmed

- `python -m tools.logh7_data_survey --root .omo/work/logh7-installed --out .omo/forensics/full-sweep-20260703-rerun/data-survey` surveyed 2,254 installed files: 73 binary/unknown, 1,719 image, 419 model, 21 HFWR string table, 1 GFWR table, 20 audio, 1 PDF.
- `python -m tools.logh7_data_sweep --repo-root E:\logh7-revival --out .omo/forensics/full-sweep-20260703-rerun/data-sweep.json` wrote the current content/delivery/RE state. It also exposed current `server/content` vs `RE/content` divergence.
- `python tools/logh7_binary_data.py --print` re-parsed `DSETUP32.dll`, `DSETUP.dll`, and Ghidra-exported `BootFirst`, `G7Start`, `Gin7UpdateClient`, `setup`. DirectX setup DLLs remain stock Microsoft DirectX9 setup components, not LOGH-authored data.
- Strategic coordinate/data-mining reruns:
  - `.omo/analysis/toolchain-20260703/grid-rle-payload-scan-rerun-codex.json`: 8,210 files scanned, 0 candidates.
  - `.omo/analysis/toolchain-20260703/grid-raw-block-scan-rerun-codex.json`: 8,366 files scanned, 0 candidates.
  - `.omo/analysis/toolchain-20260703/strategic-coordinate-table-anchor-scan-rerun-codex.json`: 8,210 files scanned, 0 candidates.
  - `.omo/analysis/toolchain-20260703/strategic-coordinate-table-scan-rerun-codex.json`: 8,210 files scanned, 0 candidates.
- Protocol verification:
  - `python -m unittest tools.tests.test_logh7_packet_trace tools.tests.test_logh7_client_protocol tools.tests.test_logh7_opcode_index` passed 11 tests from `RE/`.
  - `tshark` re-read `logh7-live-loopback-47900.pcapng`; TCP conversations remain three loopback connections on port 47900.
  - Auto-loaded Wireshark Lua dissector produced `RE/.omo/forensics/full-sweep-20260703-rerun/logh7-live-loopback-47900-lua-rerun.tsv`. Some frames have empty opcode/body fields; keep using server trace correlation for opcode meaning.
- Server/grid verification: `node --test server/tests/server/logh7-login-protocol.test.mjs server/tests/server/logh7-strategic-sim.test.mjs server/tests/server/logh7-galaxy-star-extraction.test.mjs` passed 93 tests.
- RE recheck:
  - `FUN_00522010` is still the msgdat table consumer returning `NO TABLE` / `NO DATA`.
  - `FUN_004abbb0` is still the `0x0315` strategic-grid RLE decoder used by `FUN_004ba2b0` case `0x315`.
  - GDI text sinks remain `TextOutA` / `ExtTextOutA` callers around `0x004aec70`, `0x004b0960`, `0x005f72a1`, `0x005f72bd`, `0x00640ec0`.
- Tool smoke:
  - `dumpcap -D` confirmed Npcap loopback and host interfaces.
  - DIE and binwalk re-read `G7MTClient.exe`.
  - capa vivisect on `D3D8.dll` succeeded and wrote `capa-vivisect-D3D8-rerun.json`.
  - FLOSS on `D3D8.dll` ran with corrected current CLI syntax (`--no static`) and found no stack/tight/decoded strings.
  - Volatility still rejects the ProcDump user-mode dump for `windows.info`; full physical/system memory image is required for that plugin family.

### Rerun blockers and regressions

- `python -m unittest tools.tests.test_logh7_data_sweep tools.tests.test_logh7_galaxy_star_extract ...` failed. Important failures:
  - `server/content/galaxy.json` and `RE/content/galaxy.json` differ; test expected `same`.
  - `LOGH_STATIC_SHIPS` is now in playable defaults while the old test expected it out.
  - Five unresolved systems now carry `MINIMAP_P3_VIRTUAL_OVERLAY`; old test expected `UNVERIFIED_P3`.
  - Iserlohn raster spectral class extraction returned `B` where the test expected `K`.
  - A galaxy regeneration subprocess hit Windows cp949 decode failure reading UTF-8 stderr/stdout.
- capa pefile mode still fails. Corrected command `capa -f pe -b pefile` on `D3D8.dll` produced `NotImplementedError`; do not claim capa pefile coverage.
- `pytest` is not installed. Python tests in this area are `unittest` compatible; avoid installing pytest on C: merely to run them.

### Current conclusion

The full rerun strengthens the earlier result: no additional strategic coordinate table, raw grid, or RLE payload source was found in the scanned installed/source artifacts. The current strategic placement evidence remains server-delivered `0x0315` RLE grid data plus existing P1/P3 provenance, not recovered original-server coordinates for the five missing systems.
