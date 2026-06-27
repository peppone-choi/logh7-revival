---
name: logh7-re
description: Reverse-engineer the LOGH VII client by querying the Ghidra full-decompile index (tools/logh7_redex.py over .omo/ghidra/export/G7MTClient). Use to find a function, read its decompile, list callers, resolve a calling convention/offset, or confirm where a value is consumed BEFORE implementing or guessing. Triggers: "RE로 확인", "decompile", "FUN_00...", "어디서 쓰는지", "calling convention", "redex".
---

# LOGH VII — Reverse Engineering

Ground rule from the user, repeatedly: **verify via RE, never guess.** "이 데이터가 어디서 쓰이는지 더블체크해." Confirm the producer AND the consumer before changing a byte or an offset.

## Queries
```bash
python tools/logh7_redex.py func 0x004c4170      # full decompile of a function
python tools/logh7_redex.py grep "FUN_004c2c80"  # callers / references (with the call expr)
python tools/logh7_redex.py grep "s_some_string" # string xrefs
```
Index: `.omo/ghidra/export/G7MTClient/` — `functions.jsonl` (decompile), `strings.tsv`, `symbols.tsv`. ~13800 funcs. Image base `0x400000`; `.text` file offset = `VA − 0x400000`.

## Conventions that bite if assumed wrong
- **`__fastcall`/thiscall: `ecx` = `this`/param_1.** Confirm in the signature line before hooking — a wrong `ecx` means a write to a garbage address (crash).
- **Vtable stream readers**: `*(stream+0x1c)`=u32, `+0x20`=u16, `+0x24`=u8, `+0x14`/`+0xc`=float.
- **`DAT_00xxxxxx`** = a global; `*(DAT)` often holds a root pointer (e.g. `DAT_007ccffc` = mainState; `*(DAT_007cd04c)+0x11178` = strategic current cell).
- **Decompiler lies about sign-extended `imm8`** (shows `push 1` for `6a 81`); check the raw bytes with capstone when a constant matters.
- A decompile section with **pointers `0x01exxxxx` + small ints** in node records = a scene graph (names + child/sibling ptrs), not data — see [[logh7-extract]].

## Method
1. Find the dispatcher case / consumer for the opcode or value.
2. Walk producer → store location → consumer; note the exact offsets.
3. Distinguish RE-confirmed (P0) from inferred. Record VAs + offsets in the relevant `docs/logh7-*-wire.md` so [[logh7-wire]] / [[logh7-patch]] can rely on them.
4. For a decisive runtime question, pair static RE with a function-boundary-only Frida probe (mid-fn/call-site hooks crash this client) and a [[logh7-live]] run.
