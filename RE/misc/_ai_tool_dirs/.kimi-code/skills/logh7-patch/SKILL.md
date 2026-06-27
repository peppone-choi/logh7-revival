---
name: logh7-patch
description: Encode, byte-verify, and build EXE patches for the LOGH VII client (same-length immediate flips, prologue detours into code-caves). Use when changing client behavior the server can't reach — UI scale (widescreen), lobby resolution, font face, the strategic-source cave, atlas slots. Triggers: "바이트패치", "EXE 패치", "detour", "code-cave", "client patch", "originalHex", "build playable client".
---

# LOGH VII — EXE Byte Patching

Patches live as version-controlled descriptors in `tools/client_patches/*.json` and are applied by `tools/logh7_build_playable_client.py`. NEVER hand-edit the EXE; encode → verify → build → re-verify.

## Iron rules (each cost real debugging)
1. **Always verify `originalHex` against the installed EXE before writing the descriptor.** `.text` file offset = `VA − 0x400000` (rawptr 0x1000 == vaddr 0x1000). Base EXE: `.omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe`.
2. **Prefer same-length immediate patches** (e.g. `68 00 04 00 00` push 0x400 → push 0x780) — no cave, no drift. The builder enforces same-length.
3. **Code-caves: a 0xCC int3 interior pad, NEVER the .text-END slack.** The .text-end zero slack (0x66acd5) is abutted by 271 referenced read-only pointers — writing there stuck the client pre-world (LIVE-confirmed). Use `--measure-caves` to find a real safe int3 run; the only safe one is **VA 0x5d5290, exactly 48 bytes**. A body over 48B needs an appended section (flag `needsSection`, don't silently emit).
4. **Detour mechanics**: overwrite N≥5 prologue bytes with `E9 <rel32>` (jmp cave); the cave runs your logic, replays the DISPLACED original instruction, then `jmp back` to `site+N`. Preserve clobbered regs (push/pop); flags usually don't matter if the next original insn resets them. A transparent passthrough detour must reach the same state — test it to isolate mechanism bugs.
5. **A broad opcode flip can break unrelated paths.** The `mode 1→0` flip in dispatcher case 0x325 fixed the inline-source routing but broke world-load unit delivery (case 0x325 is general). Prefer a surgical cave over a global flip.

## Workflow
```bash
python tools/logh7_encode_<x>.py --show          # encode + auto-verify originalHex + (capstone) disasm
python tools/logh7_encode_<x>.py --write         # -> tools/client_patches/<name>.json
python tools/logh7_build_playable_client.py --patches menufix dlgfix earlygrid-ringclear <name> --out .omo/work/G7MTClient.<x>.exe
python - <<'PY'                                  # re-verify bytes landed
d=open(r".omo/work/G7MTClient.<x>.exe","rb").read(); print(d[0x<fileoff>:0x<fileoff>+5].hex())
PY
```
Then live-verify with [[logh7-live]] (`start --patched-exe`). A patch is `verified` only after a byte check AND a live observation — annotate `needsLive` until then.

## Descriptor shape
`{ name, patches:[{ va, fileOffsetHex, originalHex, patchedHex, note }], verified }`. Cite the RE source ([[logh7-re]]) and a data grade for any chosen value (a hardcoded cell/dimension is P3 unless live-pinned).
