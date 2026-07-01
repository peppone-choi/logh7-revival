---
description: LOGH VII reverse-engineering lookup through redex/Ghidra export
argument-hint: "[function/opcode/question, e.g. FUN_004c4170 | who fires 0x0b01]"
---

Use the **logh7-re** skill in `.claude/skills/logh7-re/SKILL.md`. Investigate: `$ARGUMENTS`.

Run from `RE/`:

```bash
python -m tools.logh7_redex func 0x<addr>
python -m tools.logh7_redex grep "<symbol-or-opcode>"
```

Confirm calling convention, producer -> store -> consumer, and raw bytes when constants matter. Record VAs and offsets before implementing.
