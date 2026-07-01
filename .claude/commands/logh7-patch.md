---
description: LOGH VII EXE patch encoding, byte verification, and playable-client build
argument-hint: "[patch target, e.g. font | lobby | hud layout | C002 cave]"
---

Use the **logh7-patch** skill in `.claude/skills/logh7-patch/SKILL.md`. Encode/verify/build: `$ARGUMENTS`.

Run from `RE/`. Verify `originalHex`, prefer same-length patches, avoid referenced `.text` end slack, build with `tools.logh7_build_playable_client`, then live-verify with the real canonical game EXE.
