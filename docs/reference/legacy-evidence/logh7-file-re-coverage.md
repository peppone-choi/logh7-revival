# LOGH VII — Per-File RE Coverage Ledger

Updated: (stamp on commit)

Scope: every file family in the original LOGH VII install tree (`.omo/work/logh7-installed/`),
plus the auxiliary/revival binaries and the loose config/index/runtime-artifact files. Each family
was audited from on-disk bytes this run and adversarially re-verified against the Ghidra exports at
`.omo/ghidra/export/<bin>/`. Verifier corrections have been folded in (tier downgrades, count fixes,
the mdx-mds offset-formula correction) and are called out inline.

Provenance tiers:
- **P0** — binary/live proven (format read from bytes AND bound to a real engine consumer function).
- **P1** — shipped data decoded with a known consumer, but consumer not pinned to an exact `FUN_` address.
- **P2** — manual / official documentation.
- **P3** — reconstructed / inferred.

A standard container (BMP/WAV/OGG/JPEG/PNG) decoded by header bytes with a known engine consumer is
P0/P1. A custom untagged container is "unknown" until the bytes are actually parsed.

---

## 1. Master coverage table

| Family | Files | Format known? | Parser | EXE consumer | Extracted artifact | Tier | Status |
|---|---|---|---|---|---|---|---|
| **bin-client** — `G7MTClient.exe` | 1 | Yes (PE32; per-asset loaders byte-proven) | `tools/logh7_redex.py` + PE/python | `0x00601fbc` entry, `0x004abaa0` whole-file read, `0x00522060` HFWR (literal `!= 0x52574648`), `0x004dd6a0` mdx/mds, `0x005924c0` tcf, `0x00621ef0` WAV, `0x00622f20` OGG, `0x00618700` DSound8, `0x004ba2b0` opcode dispatch | `.omo/re-audit/bin-client/file-consumer-map.json` | **P0** | Done — consumer map complete; 4 sub-parsers (g7sw, sound binder, mesh chunks, tcf pixel) remain |
| **bin-aux** — LOGH7Launcher, G7Start, BootFirst, Gin7UpdateClient, DSETUP/DSETUP32 | 6 | Yes (5 native PE + 1 .NET CLR assembly) | `pefile` + Ghidra (native) + `parse_launcher.py` | BootFirst `FUN_00401000` swap-bootstrap; G7Start `FUN_004029e0/4037d0/403bf0` DX9+launch; Gin7UpdateClient HTTP updater; Launcher = managed IL (mscoree!_CorExeMain) | `.omo/re-audit/bin-aux/launcher-pe.json`, `launcher-strings.txt`, `parse_launcher.py` | **P0** | Done for native bins + PE classification; Launcher CIL method bodies need .NET decompiler |
| **msgdat** — MsgDat/*.dat (HFWR) + g7sw (GFWR) + constmsg | 22 | Yes (HFWR/GFWR byte-exact) | `tools/logh7_msgdat.py` (+`_full.py`) | `FUN_00521dc0` master loader, `FUN_00522060` HFWR reader, `FUN_00521c10` g7sw GFWR | `content/extracted/msgdat-full.json`, `dat-tables.json`, `.omo/re-audit/msgdat/dat-inventory.json` | **P0** | Done — 9582 records / 4653 non-empty decoded; offset-table runtime role un-traced (vestigial, low priority) |
| **tcf-face** — Face/*.tcf + tcf.hed | 7 .tcf + 1 .hed | Yes (region: 18B hdr + 1024B BGRA pal + 8bpp bottom-up) | `tools/logh7_tcf_decode.py` | `FUN_005923b0` hed loader, `FUN_00592c30` face-id digit decoder, `FUN_005924c0` 7-way atlas reader | `.omo/re-audit/tcf-face/tcf-inventory.json` + PNGs | **P0** | Done — all 7 atlases decode; 3-frame-per-slot variant intent + 10 official face-id identity anchors open |
| **mdx-mds** — model/**/*.{mdx,mds} | **418** | Scene-graph YES; raw mesh geometry NO | `tools/logh7_mdx_extract.py` | `FUN_004d3bd0` (planet `p%03d_low.mdx` loader) | `content/extracted/model-*.json` (6), `.omo/re-audit/mdx-mds/model-inventory.json` | **P0** (scene-graph only) | Partial — named node directory 418/418 validated; **polygon mesh arrays NOT byte-mapped** (heavy tool) |
| **images** — image/** BMP/TGA/JPEG/PNG + _CATALOG.VIX | 1715 (993 BMP / **661 TGA** / 45 JPEG / 16 PNG / 1 VIX) | Yes (4 standard formats + VIX parsed) | `FUN_005a91a7` (D3DX8 BMP) + `.omo/re-audit/images/*.py` | `FUN_005a91a7` LoadBMP, `FUN_005b51fa` D3DX blit, D3D8.DLL!Direct3DCreate8 | `.omo/re-audit/images/image-inventory.json` | **P0** | Done — all standard, D3DX8 consumer proven; VIX has **no runtime consumer** (editor leftover) |
| **audio** — sound/**/*.{wav,ogg} | 20 (7 Ogg/Vorbis + 13 RIFF/WAVE PCM) | Yes (standard) | `.omo/re-audit/audio/parse_audio.py` | DSOUND!DirectSoundCreate8, WINMM mmio*, static libVorbis, path table `@0x0076ce90` | `.omo/re-audit/audio/audio-inventory.json` | **P0** | Done — every file's codec/rate/duration parsed; BGM player loop FUN_ + SFX→event map open |
| **misc-config** — GraphicConfig.txt, update.ini, _CATALOG.VIX, Thumbs.db, KLG2, window2/3.dat, etc. | 14 | Partial (txt/ini P0; VIX entry-TLV partial) | `.omo/re-audit/misc-config/parse_vix.py`, `tools/logh7_runtime_keylog.py` | GraphicConfig→G7MTClient `@0x77483c`; update.ini→Gin7UpdateClient `@0x508c48`; VIX→**no literal in any bin** | `.omo/re-audit/misc-config/misc-inventory.json` | **P1** | Done for txt/ini (P0); VIX loader unpinpointed (heavy tool); tcf.hed should also be listed here |

### Verifier corrections folded in

- **mdx-mds**: the audit's header arithmetic was **partly wrong** and is corrected here.
  - File count is **418** (406 mdx + 12 mds), not 420 (the "420" was a typo in the structured header).
  - "`pair[0].ptr` low16 always `0xa0`" is **FALSE in general** — true only for the 2 strategy/galaxy
    files; 232/418 files have other basePtrs (e.g. `beam.mdx` low16=`0x4298`).
  - The node-table offset formula is **`foff = ptr − desc0.ptr + 0x58`** (passes 418/418), NOT
    `ptr − basePtr + 0xa0` (passes 0/418). The `+0x58` form is consistent with the "node directory @0x58" claim.
  - Tier stays **P0 but scoped to the scene-graph only**; the polygon mesh is explicitly NOT decoded.
- **images**: TGA recount → **661** (478 type-1 8bpp + 183 type-2, of which 174 are 32bpp w/ alpha).
  The audit's "660 / 182 / 172" figures were off-by-1/2; the `icon_kj` 32×32 example dim was wrong
  (`com_bar.tga` is 358×26). Tier P0 unchanged.
- **misc-config**: tier held at **P1** (correct — VIX entry-TLV partial, VIX loader unpinpointed).
  `data/image/Face/tcf.hed` is an in-family index file that was missing from the inventory; it is a
  P1 Face-atlas header consumed by the tcf decoder (`FUN_005923b0` / `tools/logh7_tcf_decode.py`).
- **tcf-face**: file count is precisely **7 .tcf + 1 .hed** (the "8" was loose). The DAT-token
  letter-spelling (`O/E/M/F/G @0x78d800`) is an **inference** from the digit-decode loop, not bytes
  isolated in `strings.tsv`; the decode mechanism itself (digit decompose) is byte-grounded.
- **bin-client**: the cipher label `mpsCipherManager::decipher` is the investigator's own naming,
  not a symbol in `symbols.tsv` (the function is real; the name is hedged).
- **audio**: path-table base is `0x0076ce90` (first entry), not `0x0076cd90`; `attack4` does not
  exist (attack1/2/3/5 only). Tier P0 unchanged.
- All eight families: verifier confirmed **bytes were actually inspected** and every cited consumer
  function exists in the Ghidra index. No family had an over-tagged "unknown container" passed off as P0.

---

## 2. Gaps remaining for full playability RE

Ordered by leverage toward a fully playable revival client. "Heavy tool" = a full new decompile pass
(Ghidra on a not-yet-exported region, or a .NET IL decompiler) rather than a byte-read or xref.

1. **mdx/mds polygon mesh geometry not byte-mapped.** *(HEAVY)*
   The named scene-graph is fully decoded (418/418), but raw vertex/face/UV arrays live behind
   `descriptor[2..9]` pointer-chains (structured surface/component records, not flat XYZ).
   Next: decompile the mdx loader caller-chain into `FUN_004d3bd0` + the generic loader to see how
   child geometry `ptr+count` fields are walked into D3D vertex/index buffers, then byte-map the
   `descriptor[2]` surface records. Leverage: needed for any custom ship/galaxy model rendering or
   server-side geometry; not needed for current name/hardpoint/galaxy data which is already extracted.

2. ~~**LOGH7Launcher.exe CIL method bodies not disassembled.**~~ **RESOLVED 2026-06-22 (P0).**
   `.NET SDK 8.0.422` + `ilspycmd 8.2.0.7535`로 전 메서드 바디 디컴파일 →
   `.omo/re-audit/bin-aux/launcher-decompiled/LOGH7Launcher.decompiled.cs`. 전체 RE는
   `docs/logh7-launcher-re.md`. 부팅 순서(`Main`→`ConfigureWindows`→port 47900 미오픈 시
   `StartServer`[`SetServerEnv` 선행]+`WaitForServer 12s`→`StartClient`→WaitForExit),
   정규 `LOGH_*` 환경변수 세트, `--check/--signup/--signup-smoke/--server-smoke/--client-smoke`
   인자, 스모크 임계값(서버12s/클라5s/admin15s/폰트60s) 모두 IL 확정. 더 팔 것 없음.

3. **VIX `_CATALOG.VIX` loader function unpinpointed.** *(HEAVY)*
   No literal `ViX`/`_CATALOG`/`icon_kj` string appears in any decompiled binary, so the exact
   dispatch that consumes `.VIX` is not isolated. Independently confirmed: zero refs in `strings.tsv`,
   so `.vix` is most likely a **leftover editor artifact** (icons load loose as `.tga`). Next: search
   `functions.jsonl` for the dynamic `_CATALOG.VIX` path build + JFIF decode call site.
   Leverage: LOW — non-load-bearing; icons already render from loose files.

4. **g7sw.dat byte-level parse method not isolated.** *(light)*
   The MsgDat ctor (`FUN_00521c10`) stores the path and the GFWR container decodes cleanly (14
   UTF-16LE NG-words), but the exact runtime reader (likely an HFWR sibling of `FUN_00522060`) was
   not pinned. Next: grep `functions.jsonl` for the method that opens `..\Data\MsgDat\g7sw.dat` after
   the ctor. Leverage: LOW — it is a profanity filter, not gameplay data.

5. **Sound enum → path binder + BGM streaming loop.** *(light)*
   The path table at `0x0076ce90–0x0076e090` is found and every file's codec is parsed, but the
   function that maps a sound index → path → `FUN_00621ef0`/`FUN_00622f20` and creates the DirectSound
   secondary streaming buffer was inferred, not decompiled (verified 0 immediate refs to the table base).
   Next: find the function loading an immediate near `0x0076ce90` and walking it by stride `0x100`, plus
   callers of `DirectSoundCreate8` (`FUN_0061c0d0`). Leverage: MEDIUM — needed for in-game BGM/SFX
   triggering, not for the protocol/play loop.

6. **MsgDat HFWR offset-table runtime role.** *(light)*
   Records are recovered correctly by NUL-scan; whether the offset table is a runtime per-record index
   or vestigial is untraced (`FUN_00522235`/`FUN_005232d0`). Leverage: LOW — decode is already byte-correct.

7. **.tcf pixel decoder vs in-binary `FUN_005e32f0`.** *(light)*
   `tools/logh7_tcf_decode.py` decodes all atlases; cross-checking it against the in-binary decode would
   confirm parity and resolve the 3-frame-per-slot variant question (param_4 sub-index). Leverage: LOW.

8. **TGA decode sub-function + VIX TLV field map.** *(light)*
   BMP loader is pinned (`FUN_005a91a7`); the TGA branch of `D3DXCreateTextureFromFile` and the full VIX
   per-entry TLV field map are not isolated. Both formats are standard and the consumer family is proven,
   so this is documentation completeness only. Leverage: LOW.

9. **SERVER.INI / original update host.** *(non-RE)*
   Only `update.ini` (VERSION=131) survives on this tree; the original SERVER.INI
   (SERVER_ADDRESS/SERVER_PORT/PROXY_PORT) is absent. Recover from archived CD media if the original
   update-server host matters. Leverage: NONE for revival (we run our own server).

---

## 3. What was advanced this run

- **bin-client**: built the full per-asset consumer map for `G7MTClient.exe` without re-decompiling —
  every family's loader/parser resolved and confirmed against on-disk magics (HFWR/`.tcf`/`.hed`/`.mdx`).
  Upgraded WAV P1→P0 by decompiling `FUN_00621ef0` (inline RIFF/WAVE/`fmt ` magics + mmioDescend).
  → `.omo/re-audit/bin-client/file-consumer-map.json`
- **bin-aux**: cracked the key gap — proved `LOGH7Launcher.exe` is a **.NET managed assembly**
  (sole import mscoree!_CorExeMain, CLR data-dir), so native Ghidra is useless; recovered behavior from
  the `#US` string heap; confirmed BootFirst swap-bootstrap, G7Start DX9 launcher, Gin7UpdateClient
  updater; DSETUP/DSETUP32 = stock MS DirectX Setup.
  → `.omo/re-audit/bin-aux/launcher-pe.json`, `launcher-strings.txt`, `parse_launcher.py`
- **msgdat**: ran the real parser live over all 22 files (9582 records / 4653 non-empty); byte-proved
  the HFWR header layout against `FUN_00522060`; diffed KO `.dat` (cp949) vs JP `.jpbak` (cp932)
  proving localization is string-payload-only re-encode.
  → `.omo/re-audit/msgdat/dat-inventory.json` (+ 3 helper scripts)
- **tcf-face**: decompiled `FUN_005923b0`/`FUN_00592c30`/`FUN_005924c0`; reconstructed the tcf.hed
  per-atlas block partition (7 blocks, single vs 3-frame/slot); decoded all 7 atlases.
  → `.omo/re-audit/tcf-face/tcf-inventory.json`, `idx209.png`, `idx206.png`, `gam-sheet.png`
- **mdx-mds**: validated the memory-image header + `0xE8` node stride + `descriptor[0]`=node-count
  across **418/418** files (corrected offset formula `foff = ptr − desc0.ptr + 0x58`); confirmed
  `.mdx`==`.mds` container; found consumer `FUN_004d3bd0`.
  → `.omo/re-audit/mdx-mds/model-inventory.json`
- **images**: read magic bytes of 25+ samples across 4 types; proved all loose images are standard;
  cracked the `_CATALOG.VIX` container (65 TLV entries, embedded JPEGs); proved D3DX8 static-link
  consumer (LoadBMP/JPG/PNG/DDS, Direct3DCreate8) and that VIX has no runtime consumer.
  → `.omo/re-audit/images/image-inventory.json` (+ 4 scripts)
- **audio**: parsed RIFF + Ogg/Vorbis headers for all 20 files (byte-accurate rate/channels/duration);
  identified DirectSound8 + WINMM + static libVorbis engine; located the embedded sound path table.
  → `.omo/re-audit/audio/audio-inventory.json` (+ parse_audio.py, enrich.py)
- **misc-config**: parsed `_CATALOG.VIX` byte-by-byte; cross-referenced GraphicConfig (14 keys) and
  update.ini (6 fields) to their binaries; classified KLG2 + window2/3.dat as **our** runtime artifacts,
  not original game data.
  → `.omo/re-audit/misc-config/misc-inventory.json`, `parse_vix.py`
