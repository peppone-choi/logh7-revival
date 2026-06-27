import struct
from pathlib import Path

def scan_floats(path):
    d = path.read_bytes()
    print(f'\n=== {path} ({len(d)} bytes) ===')
    vals = struct.unpack_from('<20I', d, 0)
    pairs = [(vals[i], vals[i+1]) for i in range(0,20,2)]
    print('descriptor pairs:')
    for i,(p,c) in enumerate(pairs):
        print(f'  [{i}] ptr={p:08x}({p}) count={c}')
    # Find all non-zero floats in the file
    floats = []
    for off in range(0, len(d)-3, 4):
        f = struct.unpack_from('<f', d, off)[0]
        if f != 0.0 and abs(f) < 1e6 and not (1e-6 < abs(f) < 1e-4):
            floats.append((off, f))
    print(f'non-zero floats: {len(floats)}')
    for off, f in floats[:30]:
        print(f'  0x{off:04x}: {f:.6f}')
    # Print the named node records fully
    off = 0x58
    while off + 0xE8 <= len(d):
        name = d[off:off+64].split(b'\x00')[0].decode('cp932','ignore')
        if not name or not all(c.isalnum() or c in '_:-.' for c in name):
            break
        print(f'  NODE {name!r} at 0x{off:04x}')
        for i in range(0, 0xE8, 16):
            vals16 = struct.unpack_from('<4I', d, off+i)
            flts16 = struct.unpack_from('<4f', d, off+i)
            print(f'    +0x{i:02x}: ' + ' '.join(f'{v:08x}' for v in vals16) + ' | ' + ' '.join(f'{fl:.3f}' for fl in flts16))
        off += 0xE8

for p in ['content/original-data/patch-2004-05-14/strategy/galaxy.mdx',
          'content/original-data/patch-2004-05-14/strategy/grid.mdx',
          'content/original-data/patch-2004-05-14/strategy/g_board.mdx',
          'content/original-data/patch-2004-05-14/strategy/grids.mdx',
          '.omo/work/logh7-installed/data/model/Planets/fs000.mdx',
          '.omo/work/logh7-installed/data/model/Planets/p000.mdx',
          '.omo/work/logh7-installed/data/model/Planets/fs001.mdx',
          '.omo/work/logh7-installed/data/model/Planets/p001.mdx']:
    scan_floats(Path(p))
