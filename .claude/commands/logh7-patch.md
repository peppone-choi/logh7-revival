---
description: LOGH VII EXE 바이트패치 인코딩·검증·빌드 (detour/cave, originalHex 검증)
argument-hint: "[패치 대상 예: widescreen | lobby-res | font-face | strat cave]"
---

Use the **logh7-patch** skill — full procedure in `.claude/skills/logh7-patch/SKILL.md`. Encode/verify/build: `$ARGUMENTS`.

Rules: verify `originalHex` vs the installed EXE first (`.text` fileoff = VA−0x400000); prefer same-length immediate flips; for a cave use the one safe interior int3 pad (VA 0x5d5290, 48B) — **never** the referenced .text-end slack (0x66acd5, stuck the client live); a >48B body needs an appended section. Build via `logh7_build_playable_client.py`, re-verify the bytes landed, then live-verify with `/logh7-live`. Mark `needsLive` until a live observation confirms it.
