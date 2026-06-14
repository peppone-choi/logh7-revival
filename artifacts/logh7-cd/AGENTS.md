<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# logh7-cd

## Purpose
Canonical Git LFS-managed CD image of the original "Legend of the Galactic Heroes VII" game disc, downloaded from Archive.org. These files are the reference inputs for the entire revival project: `tools/convert_mode2_bin_to_iso.py` converts the raw MODE2/2352 BIN track into a plain 2048-byte/sector ISO 9660 image, and `tools/logh7_pipeline.py` (subcommands `inspect`, `extract-root`, `discover-server`) reads that converted ISO to build localization manifests, extract the ISO root file tree into `.omo/work/`, and discover server-related binaries. Per docs/logh7-localization-pipeline.md, the ISO is an ISO9660 "CD-RTOS CD-BRIDGE" volume with volume identifier GINEIDEN7. The files are analysis/extraction inputs only — project rules (docs/windows-next-steps.md:140-142, docs/client-server-work-rules.md:142, docs/windows-client-tools.md:71) forbid modifying them and forbid shipping them in any release zip; all localization edits happen on extracted copies under `.omo/work/`.

## Key Files
| File | Description |
|------|-------------|
| Logh7.bin | Original Archive.org raw CD dump, 229,070,688 bytes = exactly 97,394 MODE2/2352 sectors; Git LFS; expected SHA-256 0b463820a980889d396b459c74720d48f9486b5133cea01172f4693de480acb1; sole input to tools/convert_mode2_bin_to_iso.py. |
| Logh7.cue | 3-line, 71-byte plain-text cue sheet (NOT LFS) declaring Logh7.bin as a single MODE2/2352 data track (FILE/TRACK 01/INDEX 01 00:00:00) for CD emulators/mounting tools. |
| Logh7_mode2_2048.iso | Converted ISO 9660 payload, 199,462,912 bytes = 97,394 x 2048; Git LFS; expected SHA-256 375838ce1c0798e166d9d127cd598705560de4efcff1ff0ad7d0b19fab01cc22; the file all `logh7_pipeline.py inspect/extract-root/discover-server` commands consume. |
| README.md | Documents the three artifacts, gives the `shasum -a 256` verification command with both expected hashes, and the deterministic rebuild command via tools/convert_mode2_bin_to_iso.py. |

## For AI Agents
### Working In This Directory
- WARNING: Logh7.bin (218 MB) and Logh7_mode2_2048.iso (190 MB) are large Git LFS binaries. NEVER edit, rewrite, re-encode, or casually `git add`/commit them; `.gitattributes` routes `artifacts/logh7-cd/*.bin, *.iso, *.cab, *.pdf` through LFS filters, so touching them creates huge LFS uploads and breaks the pinned SHA-256 hashes in README.md.
- Read-only rule (docs/windows-next-steps.md:142, docs/client-server-work-rules.md:142, docs/windows-client-tools.md:71): the original BIN/ISO are reference inputs only. All patching/localization is applied to extracted copies under `.omo/work/`, never to these files.
- Distribution rule (docs/windows-next-steps.md:140, docs/ios-extraction-request.md:35): Logh7.bin, Logh7.cue, and Logh7_mode2_2048.iso must NOT be included in any release zip — final user packages are image-free installed file trees.
- If the ISO is ever suspect, regenerate it deterministically with `python3 tools/convert_mode2_bin_to_iso.py artifacts/logh7-cd/Logh7.bin artifacts/logh7-cd/Logh7_mode2_2048.iso` instead of hand-editing.
- Gotcha: on a fresh clone without `git lfs pull`, the .bin/.iso on disk are ~130-byte LFS pointer text files, and any tool reading them as ISO data will fail — check actual file size before debugging pipeline errors.
- Logh7.cue and README.md are tiny plain-text files NOT in LFS (no *.cue or *.md rule in .gitattributes) and are safe to read normally.

### Testing Requirements
- Integrity check: `shasum -a 256 artifacts/logh7-cd/Logh7.bin artifacts/logh7-cd/Logh7_mode2_2048.iso` and compare against the hashes pinned in artifacts/logh7-cd/README.md (0b463820a9... for the BIN, 375838ce1c... for the ISO).
- Binary layout invariant: the BIN is MODE2/2352 (97,394 sectors); the ISO is the per-sector slice [24:24+2048] of the BIN (SECTOR_SIZE=2352, PAYLOAD_OFFSET=24 skipping 12-byte sync + 4-byte header + 8-byte MODE2 Form 1 subheader, PAYLOAD_SIZE=2048 in tools/convert_mode2_bin_to_iso.py). Sizes must satisfy bin_size/2352 == iso_size/2048 exactly; the converter raises ValueError on any partial sector.

### Common Patterns
- Canonical-input pattern: this directory holds immutable reference media; all derived/patched outputs live under `.omo/work/` and release zips, never here.
- Derived binaries are reproducible from a single source of truth (the BIN) via a deterministic converter script, with pinned SHA-256 hashes documented in the colocated README.md.
- Large binaries are gated through Git LFS by extension-scoped .gitattributes rules limited to the artifacts/logh7-cd/ path.
- Pipeline usage: `python3 tools/logh7_pipeline.py inspect|extract-root|discover-server artifacts/logh7-cd/Logh7_mode2_2048.iso`.

## Dependencies
### Internal
- tools/convert_mode2_bin_to_iso.py — BIN-to-ISO converter; only writer of Logh7_mode2_2048.iso.
- tools/logh7_pipeline.py — `inspect` / `extract-root` / `discover-server` subcommands consume the ISO.
- .gitattributes — LFS filter rules for artifacts/logh7-cd/*.bin, *.iso, *.cab, *.pdf.
- docs/logh7-localization-pipeline.md, docs/windows-next-steps.md, docs/client-server-work-rules.md, docs/windows-client-tools.md, docs/ios-extraction-request.md — usage commands and do-not-modify / do-not-ship rules.

### External
- Git LFS — required to fetch the real .bin/.iso content; without it only ~130-byte pointer files are present.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
