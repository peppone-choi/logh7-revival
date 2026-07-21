#!/usr/bin/env python3
"""Build lineage patch manifest: FUN_0057aa90 push 0x5f → 0x60 for subIds 4..0x16.

Only patches `6A <sub> 6A 5F` patterns inside FUN_0057aa90 file region where sub ∈ [4, 0x16].
Leaves sub 0..3 on group 0x5f (command-status / class template range).

Outputs:
  - patched working EXE (under --out-dir)
  - patch-manifest.json (lineage_patcher schema)
  - receipt.json (hashes + ops)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import struct
from pathlib import Path

# FUN_0057aa90 VA 0x0057aa90 → file off = VA - 0x400000 = 0x17aa90
FUNC_FILE_START = 0x17AA90
FUNC_FILE_END = 0x17C500
EXPECTED_PARENT = "825635783a9fb663ae3b9a2ecf8d4b74df648322256c57ee32f6426c42a23f22"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def find_ops(buf: bytes) -> list[dict]:
    ops: list[dict] = []
    i = FUNC_FILE_START
    end = min(FUNC_FILE_END, len(buf) - 1)
    while i < end:
        # pattern: 6A XX 6A 5F
        if buf[i] == 0x6A and buf[i + 2] == 0x6A and buf[i + 3] == 0x5F:
            sub = buf[i + 1]
            if 4 <= sub <= 0x16:
                # replace only the group push byte at i+3
                off = i + 3
                ops.append(
                    {
                        "op": "replace",
                        "offset": f"0x{off:x}",
                        "expect": "5f",
                        "bytes": "60",
                        "note": f"push group 0x5f→0x60 after push sub 0x{sub:x}",
                    }
                )
            i += 4
            continue
        i += 1
    return ops


def apply_ops(buf: bytearray, ops: list[dict]) -> None:
    for op in ops:
        off = int(op["offset"], 0)
        expect = bytes.fromhex(op["expect"])
        new = bytes.fromhex(op["bytes"])
        if buf[off : off + len(expect)] != expect:
            raise SystemExit(
                f"expect mismatch at 0x{off:x}: got {buf[off:off+len(expect)].hex()} want {expect.hex()}"
            )
        buf[off : off + len(new)] = new


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--base-exe",
        type=Path,
        default=Path(r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"),
    )
    ap.add_argument(
        "--out-dir",
        type=Path,
        default=Path("_workspace/lineage-constmsg-g60"),
    )
    ap.add_argument("--approval-ref", default="user-2026-07-21-constmsg-g60")
    args = ap.parse_args()

    base = args.base_exe.resolve()
    if not base.is_file():
        raise SystemExit(f"missing base exe {base}")
    parent = sha256_file(base)
    if parent != EXPECTED_PARENT:
        raise SystemExit(f"parent hash mismatch: {parent} != {EXPECTED_PARENT}")

    raw = bytearray(base.read_bytes())
    ops = find_ops(raw)
    if not ops:
        raise SystemExit("no patch sites found")
    apply_ops(raw, ops)
    new_hash = hashlib.sha256(raw).hexdigest()

    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    out_exe = out_dir / "g7mtclient.exe"
    out_exe.write_bytes(raw)

    # sentinel: first patched site
    first_off = int(ops[0]["offset"], 0)
    sentinel_hex = bytes(raw[first_off : first_off + 1]).hex()

    manifest = {
        "patch_manifest_id": "constmsg-g60-basepanel-labels-v1",
        "parent_hash": parent,
        "transform_ops": [
            {"op": o["op"], "offset": o["offset"], "expect": o["expect"], "bytes": o["bytes"]}
            for o in ops
        ],
        "expected_new_hash": new_hash,
        "image_base": "0x400000",
        "sentinel_set": [{"offset": ops[0]["offset"], "hex": sentinel_hex}],
        "capability_profile": "base-panel-constmsg-group60-labels",
        "provenance": (
            "docs/reference/legacy-evidence/logh7-constmsg-re-audit-2026-06-30.md; "
            "FUN_0057aa90 push sub then push 0x5f; sub 4..0x16 out of group 0x5f range (count=4) → NO DATA; "
            "group 0x60 holds warehouse/economy labels"
        ),
        "approval_ref": args.approval_ref,
    }
    (out_dir / "patch-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    receipt = {
        "parent_hash": parent,
        "new_hash": new_hash,
        "op_count": len(ops),
        "ops": ops,
        "out_exe": str(out_exe),
        "verify_command": (
            f"python -m tools.live.lineage_patcher --base {base} "
            f"--manifest {out_dir / 'patch-manifest.json'} --output {out_dir / 'verify.exe'}"
        ),
    }
    (out_dir / "receipt.json").write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"ok": True, "ops": len(ops), "new_hash": new_hash, "out": str(out_exe)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
