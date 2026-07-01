---
description: LOGH VII wire-record build/decode work using RE-confirmed client parser offsets
argument-hint: "[record/opcode, e.g. 0x0323 character | 0x031f economy | 0x0315 terrain]"
---

Use the **logh7-wire** skill in `.claude/skills/logh7-wire/SKILL.md`. Build/decode: `$ARGUMENTS`.

Offsets come from the client parser, not guesses. Add byte-offset tests under `server/tests/server/`, run from `server/`, and live-confirm user-facing behavior through `logh7-live`.
