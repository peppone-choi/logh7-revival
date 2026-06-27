---
description: LOGH VII 에셋 추출/복구 (MDX/TCF/BMP/PDF — 항성위치·초상화·배치 등)
argument-hint: "[추출 대상 예: galaxy positions | portraits | spectral classes]"
---

Use the **logh7-extract** skill — full procedure in `.claude/skills/logh7-extract/SKILL.md`. Recover: `$ARGUMENTS`.

Always render/inspect before parsing (view images you produce; don't guess binary layout). MDX = scene-graph (0xE8-stride names + (ptr,count) header); `Null_galaxy.mdx` is a TEMPLATE (zero transforms = no positions). Canon star positions = **vector dots on gin7manual PDF page 101** via `fitz.get_drawings()` — mind the Y-flip (page rotation 90°). TCF = 18B hdr + 1024B BGRA palette + indices. Grade extracted data (PDF chart = P1).
