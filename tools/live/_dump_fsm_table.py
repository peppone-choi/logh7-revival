#!/usr/bin/env python3
"""Dump FUN_0051a370 switch jump table state -> handler."""
from __future__ import annotations

import struct
from pathlib import Path

EXE = Path(
    r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
)


def main() -> None:
    data = EXE.read_bytes()
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    nsec = struct.unpack_from("<H", data, e_lfanew + 6)[0]
    opt_size = struct.unpack_from("<H", data, e_lfanew + 20)[0]
    sec_off = e_lfanew + 24 + opt_size
    secs = []
    for i in range(nsec):
        o = sec_off + i * 40
        vsize, vaddr, rsize, roff = struct.unpack_from("<IIII", data, o + 8)
        secs.append((vaddr, vsize, roff, rsize))

    def va2off(va: int) -> int:
        rva = va - 0x400000
        for vaddr, vsize, roff, rsize in secs:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return roff + (rva - vaddr)
        raise ValueError(hex(va))

    pre = data[va2off(0x51A460) : va2off(0x51A490)]
    print("pre-switch", pre.hex())
    for i in range(len(pre) - 3):
        if pre[i] == 0x83 and pre[i + 1] in (0xF9, 0xF8, 0xFA, 0xFB):
            print(f"cmp reg, {pre[i + 2]} at +{i}")
        if pre[i] == 0x81 and pre[i + 1] in (0xF9, 0xF8, 0xFA, 0xFB):
            imm = struct.unpack_from("<I", pre, i + 2)[0]
            print(f"cmp reg, {imm}")

    tbl = 0x51BA98
    interesting = {
        0x17,
        0x18,
        0x19,
        0x1A,
        0x1B,
        0x1C,
        0x1D,
        0x1E,
        0x20,
        0x27,
        0x29,
        0x2A,
        0x2D,
        0x40,
        0x46,
    }
    print("state -> case handler")
    for st in range(0, 0x50):
        off = va2off(tbl + st * 4)
        target = struct.unpack_from("<I", data, off)[0]
        mark = " ***" if st in interesting else ""
        print(f"  case 0x{st:02x} -> 0x{target:08x}{mark}")

    # Disassemble key case bodies: first 40 bytes
    for st in sorted(interesting):
        off = va2off(tbl + st * 4)
        target = struct.unpack_from("<I", data, off)[0]
        body = data[va2off(target) : va2off(target) + 48]
        print(f"\n--- case 0x{st:02x} @0x{target:08x} ---")
        print(body.hex())
        # annotate mov [ebp+4],imm and mov [abs],imm
        for i in range(len(body) - 7):
            if body[i : i + 3] == b"\xc7\x45\x04":
                imm = struct.unpack_from("<I", body, i + 3)[0]
                print(f"  +{i}: mov [ebp+4], 0x{imm:x}")
            if body[i : i + 2] == b"\xc7\x05":
                addr = struct.unpack_from("<I", body, i + 2)[0]
                imm = struct.unpack_from("<I", body, i + 6)[0]
                print(f"  +{i}: mov [{addr:#x}], 0x{imm:x}")
            if body[i] == 0xE9:
                rel = struct.unpack_from("<i", body, i + 1)[0]
                print(f"  +{i}: jmp 0x{target + i + 5 + rel:08x}")
            if body[i] == 0xE8:
                rel = struct.unpack_from("<i", body, i + 1)[0]
                print(f"  +{i}: call 0x{target + i + 5 + rel:08x}")


if __name__ == "__main__":
    main()
