#!/usr/bin/env python3
from pathlib import Path
import struct

EXE = Path(
    r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\exe\g7mtclient.exe"
)
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


def va2off(va: int) -> int:
    rva = va - 0x400000
    for vaddr, vsize, roff, rsize in secs:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return roff + (rva - vaddr)
    raise ValueError(hex(va))


for va in [0x4C1E00, 0x4C1E30, 0x4C1E50, 0x567AE0, 0x567B00, 0x567CB0, 0x567CC0]:
    off = va2off(va)
    chunk = data[off : off + 64]
    print(f"\n=== {va:#x} ===")
    print(chunk.hex())
    # annotate push imm32 / mov ax imm / call
    i = 0
    while i < len(chunk) - 5:
        if chunk[i] == 0x68:
            imm = struct.unpack_from("<I", chunk, i + 1)[0]
            print(f"  +{i}: push {imm:#x}")
            i += 5
            continue
        if chunk[i : i + 2] == b"\x66\xb8":
            imm = struct.unpack_from("<H", chunk, i + 2)[0]
            print(f"  +{i}: mov ax,{imm:#x}")
            i += 4
            continue
        if chunk[i] == 0xE8:
            rel = struct.unpack_from("<i", chunk, i + 1)[0]
            print(f"  +{i}: call {va + i + 5 + rel:#x}")
            i += 5
            continue
        if chunk[i : i + 2] == b"\x05\x00" and chunk[i + 2] == 0x12:
            print(f"  +{i}: add eax,0x1200")
        i += 1
