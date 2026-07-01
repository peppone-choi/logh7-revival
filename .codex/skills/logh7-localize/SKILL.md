---
name: logh7-localize
description: Localize the LOGH VII client to natural Korean. Covers String.txt cp949, .rsrc UTF-16LE, Pretendard UI and D3D atlas font slots, and readable Korean UI/doc text.
---

# LOGH VII Localization

Localization has two jobs: put the right bytes into the client and make Korean read naturally.

## Byte Rules

- Primary GDI UI font face slot: VA `0x0077402c`.
- D3D glyph-atlas font face slot: VA `0x0076e240`.
- Both slots should be `Pretendard` in the canonical playable stack.
- `.rsrc` menus/dialogs/strings are UTF-16LE and must be rebuilt with correct dialog alignment.
- `String.txt` is cp949 and in-game text largely goes through ANSI GDI calls.
- Korean rendering claims require `logh7-live` proof, not just byte diffs.

## Humanizer Rules

- Prefer terse, military/strategy register suitable for LOGH.
- Avoid machine-translation rhythm, excessive punctuation, literal English word order, and passive filler.
- Preserve proper nouns and data provenance.
- Grade translations P3 unless sourced from an official/canonical Korean source.

## Tools

Run from `RE/`:

```bash
python -m tools.logh7_encode_font_face --show
python -m tools.logh7_encode_font_atlas_face --show
python -m tools.logh7_rsrc_patch patch --help
```
