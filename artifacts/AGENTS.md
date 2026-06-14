<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-10 | Updated: 2026-06-10 -->

# artifacts

## Purpose
Binary-artifact root of the LOGH VII revival repo. It is a thin container whose only content is `logh7-cd/`, the Git LFS-managed canonical CD image of the original "Legend of the Galactic Heroes VII" disc (Archive.org dump). These files are the immutable reference inputs for the whole project: `tools/convert_mode2_bin_to_iso.py` converts the raw BIN track to a plain ISO, and `tools/logh7_pipeline.py` reads that ISO for inspection, root extraction, and server-binary discovery. All derived/patched outputs live under `.omo/work/` and release zips — never here.

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| logh7-cd/ | Canonical Git LFS CD image (Logh7.bin MODE2/2352 + cue + converted Logh7_mode2_2048.iso) of the original game disc; read-only inputs for all conversion/extraction tooling. See logh7-cd/AGENTS.md. |

## For AI Agents
### Working In This Directory
WARNING: contains ~400 MB of Git LFS binaries (Logh7.bin 218 MB, Logh7_mode2_2048.iso 190 MB) — never edit, re-encode, or casually `git add` anything under here; treat all media as read-only reference inputs and never ship them in distribution zips.

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->
