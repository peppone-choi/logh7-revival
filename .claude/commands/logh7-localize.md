---
description: LOGH VII 한글화 (String.txt cp949 / .rsrc UTF-16LE / GDI 폰트 face) + 자연스러운 한국어
argument-hint: "[대상 예: font | menu rsrc | translate notice | humanize text]"
---

Use the **logh7-localize** skill — full procedure in `.claude/skills/logh7-localize/SKILL.md`. Localize/humanize: `$ARGUMENTS`.

Font: the single global face string `"MS UI Gothic"` @0x77402c → `"맑은 고딕"` (same-length, all text re-renders; charset 0x81 HANGEUL + quality 4 already set). `.rsrc` strings are UTF-16LE (codepage-independent) — patch via `logh7_rsrc_patch.py`. Apply the humanizer rules when writing Korean (cut excess commas, `~에 대해`, `~되어진다`, generic `중요하다`, reflexive 3-part lists; keep proper nouns 오딘/하이네센 exact). Verify Korean renders via `/logh7-live`.
