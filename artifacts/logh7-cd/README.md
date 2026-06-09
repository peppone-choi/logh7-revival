# LOGH VII CD Artifacts

This directory contains Git LFS-managed CD artifacts for LOGH VII analysis.

## Files

- `Logh7.bin`: original Archive.org BIN track.
- `Logh7.cue`: original cue sheet.
- `Logh7_mode2_2048.iso`: converted ISO 9660 payload extracted from the MODE2/2352 BIN.

## Verification

```sh
shasum -a 256 artifacts/logh7-cd/Logh7.bin artifacts/logh7-cd/Logh7_mode2_2048.iso
```

Expected hashes:

```text
0b463820a980889d396b459c74720d48f9486b5133cea01172f4693de480acb1  artifacts/logh7-cd/Logh7.bin
375838ce1c0798e166d9d127cd598705560de4efcff1ff0ad7d0b19fab01cc22  artifacts/logh7-cd/Logh7_mode2_2048.iso
```

## Rebuild Converted ISO

```sh
python3 tools/convert_mode2_bin_to_iso.py artifacts/logh7-cd/Logh7.bin artifacts/logh7-cd/Logh7_mode2_2048.iso
```
