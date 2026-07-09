#!/usr/bin/env python3
"""Find 0x1200 / Session family message codes in G7MTClient.exe."""
from __future__ import annotations

import re
import struct
from pathlib import Path

EXE = Path(
    r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
)


def main() -> None:
    data = EXE.read_bytes()
    e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
    nsec = struct.unpack_from("<H", data, e_lfanew + 6)[0]
    opt = struct.unpack_from("<H", data, e_lfanew + 20)[0]
    sec = e_lfanew + 24 + opt
    secs = []
    for i in range(nsec):
        o = sec + i * 40
        vsize, vaddr, rsize, roff = struct.unpack_from("<IIII", data, o + 8)
        secs.append((vaddr, vsize, roff, rsize))

    def off2va(off: int) -> int | None:
        for vaddr, vsize, roff, rsize in secs:
            if roff <= off < roff + max(vsize, rsize):
                return 0x400000 + vaddr + (off - roff)
        return None

    def va2off(va: int) -> int | None:
        rva = va - 0x400000
        for vaddr, vsize, roff, rsize in secs:
            if vaddr <= rva < vaddr + max(vsize, rsize):
                return roff + (rva - vaddr)
        return None

    print("=== Session* strings ===")
    for m in re.finditer(rb"Session[A-Za-z0-9_]{3,80}", data):
        s = m.group().decode("ascii", "ignore")
        if any(
            k in s
            for k in (
                "Generate",
                "Login",
                "State",
                "Information",
                "Charge",
                "Update",
                "Notify",
                "Command",
            )
        ):
            print(f"  {off2va(m.start()):#x}  {s}")

    print("\n=== code immediates around 0x12xx ===")
    # 66 B8 xx 12 = mov ax, 0x12xx
    for lo in range(0x00, 0x40):
        pat = bytes([0x66, 0xB8, lo, 0x12])
        j = data.find(pat)
        if j >= 0:
            print(f"  mov ax,0x12{lo:02x} @ {off2va(j):#x}")

    # 68 xx 12 00 00 = push 0x12xx
    for lo in range(0x00, 0x40):
        pat = bytes([0x68, lo, 0x12, 0x00, 0x00])
        j = data.find(pat)
        if j >= 0:
            print(f"  push 0x12{lo:02x} @ {off2va(j):#x}")

    # Look for FUN_0040a0f0-like registrar pattern: add reg, 0x1200
    # 05 00 12 00 00 = add eax, 0x1200
    for imm in (0x1200, 0x1000, 0x2000, 0x0200):
        pat = struct.pack("<BI", 0x05, imm)  # add eax, imm32
        idx = 0
        hits = []
        while True:
            j = data.find(pat, idx)
            if j < 0:
                break
            hits.append(off2va(j))
            idx = j + 1
        print(f"add eax,{imm:#x}: {[hex(h) for h in hits[:8] if h]}")

    # 81 C0 00 12 00 00 = add eax, 0x1200
    for imm in (0x1200, 0x1000, 0x2000):
        pat = b"\x81\xc0" + struct.pack("<I", imm)
        idx = 0
        hits = []
        while True:
            j = data.find(pat, idx)
            if j < 0:
                break
            hits.append(off2va(j))
            idx = j + 1
        print(f"add eax,{imm:#x} (81c0): {[hex(h) for h in hits[:8] if h]}")

    # Search "CommandGenerateCharacterCharge" VA and nearby name table
    for key in (
        b"CommandGenerateCharacterCharge\x00",
        b"RequestInformationAccount\x00",
        b"SSLoginRequest\x00",
        b"LobbyLoginRequest\x00",
    ):
        i = data.find(key)
        print(f"\n{key.decode().strip(chr(0))}: file={hex(i)} va={hex(off2va(i) or 0)}")


if __name__ == "__main__":
    main()
