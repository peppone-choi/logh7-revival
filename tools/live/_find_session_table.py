#!/usr/bin/env python3
from pathlib import Path
import struct

p = Path(r"E:/logh7-revival/artifacts/logh7-install/____________s___/____/exe/g7mtclient.exe")
data = p.read_bytes()
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


names = [
    b"SessionLoginRequest\x00",
    b"SessionLoginOK\x00",
    b"SessionLoginNG\x00",
    b"SessionRequestInformationCharacterCharge\x00",
    b"SessionResponseInformationCharacterCharge\x00",
    b"SessionRequestSessionState\x00",
    b"SessionResponseSessionState\x00",
    b"SessionRequestGenerateCharacterFinish\x00",
    b"SessionResponseGenerateCharacterFinish\x00",
]
for name in names:
    i = data.find(name)
    va = off2va(i) if i >= 0 else None
    print(name.decode().strip("\x00"), "file", hex(i) if i >= 0 else None, "va", hex(va) if va else None)
    if va is None:
        continue
    pat = struct.pack("<I", va)
    pos = 0
    hits = []
    while True:
        j = data.find(pat, pos)
        if j < 0:
            break
        hits.append(off2va(j) or j)
        pos = j + 1
    print("  ptrs", [hex(h) for h in hits[:12]])
    # if we find a table, dump nearby dwords as string VAs
    for h in hits[:3]:
        # h is VA of pointer slot; convert to file off
        for vaddr, vsize, roff, rsize in secs:
            rva = h - 0x400000
            if vaddr <= rva < vaddr + max(vsize, rsize):
                fo = roff + (rva - vaddr)
                print("  table@va", hex(h), "dump:")
                for k in range(-4, 20):
                    slot = fo + k * 4
                    if 0 <= slot < len(data) - 4:
                        pv = struct.unpack_from("<I", data, slot)[0]
                        # try resolve string
                        s = ""
                        for v2, vs2, ro2, rs2 in secs:
                            r2 = pv - 0x400000
                            if v2 <= r2 < v2 + max(vs2, rs2):
                                so = ro2 + (r2 - v2)
                                if 0 <= so < len(data):
                                    end = data.find(b"\x00", so, so + 80)
                                    if end > so:
                                        raw = data[so:end]
                                        if all(32 <= c < 127 for c in raw):
                                            s = raw.decode()
                                break
                        mark = f"  [{k:+d}] {hex(pv)} {s}"
                        print(mark)
                break
