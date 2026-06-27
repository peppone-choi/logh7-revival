---
description: LOGH VII 리버스 엔지니어링 (redex 디컴파일 조회, 호출규약/오프셋/소비처 확정)
argument-hint: "[함수/심볼/질문 예: FUN_004c4170 | who fires 0x0b01]"
---

Use the **logh7-re** skill — full procedure in `.claude/skills/logh7-re/SKILL.md`. Investigate: `$ARGUMENTS`.

`python tools/logh7_redex.py func 0x<addr>` (decompile) / `grep "<sym>"` (callers). Index: `.omo/ghidra/export/G7MTClient/`. Confirm the calling convention (`__fastcall` ecx=this) and the producer→store→consumer chain BEFORE implementing — never guess an offset. The decompiler mis-shows sign-extended imm8 (check raw bytes / capstone when a constant matters). Record VAs+offsets in `docs/logh7-*-wire.md`.
