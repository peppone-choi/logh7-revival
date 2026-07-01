---
name: logh7-re
description: Reverse-engineer the LOGH VII client by querying the Ghidra full-decompile index from RE/. Use before implementing or guessing a client offset, opcode, calling convention, or consumer path.
---

# LOGH VII Reverse Engineering

Ground rule: verify through RE before changing server bytes, client patches, or data assumptions.

## Commands

Run from `RE/`:

```bash
python -m tools.logh7_redex func 0x004c4170
python -m tools.logh7_redex grep "FUN_004c2c80"
python -m tools.logh7_redex grep "0x0b01"
```

Index root: `RE/.omo/ghidra/export/G7MTClient/`.
Image base: `0x00400000`; for normal `.text` addresses, file offset is `VA - 0x400000`.

## Conventions

- Confirm `__fastcall` / thiscall signatures. Usually `ecx` is `this` / `param_1`.
- Stream vtable readers commonly use `+0x1c` for u32, `+0x20` for u16, `+0x24` for u8, and `+0x14` / `+0x0c` for float.
- `DAT_00xxxxxx` names globals; many are root pointers.
- Check raw bytes when a constant matters. The decompiler can misrepresent sign-extended `imm8`.
- Scene-graph node records often contain `0x01exxxxx` pointers plus small integers; do not treat them as gameplay data.

## Method

1. Find the dispatcher case or consumer for the opcode/value.
2. Walk producer -> store location -> consumer.
3. Record exact VAs, offsets, and whether the finding is P0 RE-confirmed or inferred.
4. Pair decisive static findings with function-boundary Frida probes and `logh7-live` when runtime behavior matters.
