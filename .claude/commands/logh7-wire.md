---
description: LOGH VII 와이어 레코드 빌드/디코드 (클라 파서 확정 오프셋, 0x0313/0x0323/0x031f 등)
argument-hint: "[레코드 예: 0x0323 character | 0x031f economy | 0x0315 terrain]"
---

Use the **logh7-wire** skill — full procedure in `.claude/skills/logh7-wire/SKILL.md`. Build/decode: `$ARGUMENTS`.

Offsets come from the CLIENT PARSER (`/logh7-re` first), never a guess; unresolved labels keep the RE-pinned offset but write 0 (don't fabricate). Respect fixed sizes (0x0313/0x0315 = 5004B padded, RLE intact) and message32 wrapping. 0x0315 terrain cell values: 0=plasma storm, 1=space, 2=non-navigable, 4+index=object. Add a byte-offset oracle test, then confirm the panel renders real values via `/logh7-live`.
