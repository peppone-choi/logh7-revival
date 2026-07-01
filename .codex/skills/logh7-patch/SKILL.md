---
name: logh7-patch
description: Encode, byte-verify, and build LOGH VII client EXE patches. Use for client behavior the server cannot reach: UI layout, font slots, D3D atlas, routing caves, or same-length immediate flips.
---

# LOGH VII EXE Byte Patching

Patch descriptors live under `RE/tools/client_patches/*.json` and are applied by `RE/tools/logh7_build_playable_client.py`. Never hand-edit the EXE.

## Rules

1. Verify `originalHex` against the current build before writing a descriptor.
2. Prefer same-length immediate patches when possible.
3. For code caves, use only safe interior `0xCC` padding. The known small safe cave is VA `0x005d5290`, 48 bytes. Do not use referenced `.text` end slack.
4. A body larger than the cave needs an appended-section design; do not silently overrun.
5. Broad opcode flips can affect unrelated paths. Prefer surgical patches with RE proof.
6. A patch is not user-facing complete until bytes verify and `logh7-live` proves the behavior.

## Workflow

Run from `RE/`:

```bash
python -m tools.logh7_encode_<name> --show
python -m tools.logh7_encode_<name> --write
python -m tools.logh7_build_playable_client --patches <stack> --out .omo/work/G7MTClient.<name>.exe
```

Descriptor shape:

```json
{
  "name": "patch-name",
  "patches": [
    {
      "va": "0x00500000",
      "fileOffsetHex": "0x00100000",
      "originalHex": "...",
      "patchedHex": "...",
      "note": "RE source and purpose"
    }
  ],
  "verified": false
}
```
