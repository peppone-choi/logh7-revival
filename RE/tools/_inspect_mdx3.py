import struct
from pathlib import Path

def dump_sections(path):
    d = path.read_bytes()
    print(f'\n=== {path} ({len(d)} bytes) ===')
    vals = struct.unpack_from('<20I', d, 0)
    pairs = [(vals[i], vals[i+1]) for i in range(0,20,2)]
    counts = [c for (_, c) in pairs]
    print('counts:', counts)
    # Compute section start offsets assuming pointers are monotonic and file starts at base
    # The first section starts at 0x50 (after header descriptors)
    # ptr differences give section sizes
    base = pairs[0][0]
    print(f'base ptr={base:08x}')
    for i,(p,c) in enumerate(pairs):
        rel = p - base
        print(f'  [{i}] rel=0x{rel:04x} count={c}')
    # Node table
    node_count = counts[1]
    node_off = 0x58
    print(f'node table: off=0x{node_off:04x} count={node_count} stride=0xE8')
    for i in range(node_count):
        off = node_off + i*0xE8
        name = d[off:off+64].split(b'\x00')[0].decode('cp932','ignore')
        print(f'  node[{i}] 0x{off:04x} {name!r}')
    # After node table, what comes next?
    next_off = node_off + node_count*0xE8
    print(f'after node table: 0x{next_off:04x}')
    print('  next 64 bytes:', d[next_off:next_off+64].hex())
    # Look for float patterns in the whole file
    print('candidate non-zero floats (|f|<1e5 and |f|>1e-3):')
    for off in range(0, len(d)-3, 4):
        f = struct.unpack_from('<f', d, off)[0]
        if f != 0.0 and abs(f) < 1e5 and abs(f) > 1e-3:
            print(f'  0x{off:04x}: {f:.4f}')

for p in ['content/original-data/patch-2004-05-14/strategy/galaxy.mdx',
          'content/original-data/patch-2004-05-14/strategy/grid.mdx']:
    dump_sections(Path(p))
