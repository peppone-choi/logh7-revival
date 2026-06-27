import struct
from pathlib import Path

for p in ['content/original-data/patch-2004-05-14/strategy/galaxy.mdx',
          'content/original-data/patch-2004-05-14/strategy/grid.mdx',
          '.omo/work/logh7-installed/data/model/Planets/fs000.mdx',
          '.omo/work/logh7-installed/data/model/Planets/p000.mdx']:
    path = Path(p)
    if not path.exists():
        print(f'MISSING {p}')
        continue
    d = path.read_bytes()
    print(f'\n=== {p} ({len(d)} bytes) ===')
    vals = struct.unpack_from('<20I', d, 0)
    pairs = [(vals[i], vals[i+1]) for i in range(0,20,10)]
    print('descriptors (first 5 pairs):', pairs[:5])
    for i in range(min(6, 20)):
        off = 0x58 + i*0xE8
        if off+0xE8 > len(d):
            break
        name = d[off:off+64].split(b'\x00')[0].decode('cp932','ignore')
        print(f'  node[{i}] off=0x{off:04x} name={name!r}')
        vals2 = struct.unpack_from('<12I', d, off)
        print('    dwords:', ' '.join(f'{v:08x}' for v in vals2))
        for foff in [0x4, 0x8, 0xc, 0x10, 0x14, 0x18, 0x1c, 0x20, 0x24, 0x28, 0x2c, 0x30, 0x34, 0x38, 0x3c, 0x40, 0x44, 0x48, 0x4c, 0x50, 0x54]:
            f = struct.unpack_from('<f', d, off+foff)[0]
            if abs(f) < 1e6 and (abs(f)>1e-4 or f==0.0):
                print(f'      off+0x{foff:02x}: {f:.6f}')
