import struct
from pathlib import Path

def hexdump(d, start, length):
    for i in range(start, min(start+length, len(d)), 16):
        chunk = d[i:i+16]
        hex_part = ' '.join(f'{b:02x}' for b in chunk)
        ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in chunk)
        print(f'  0x{i:04x}: {hex_part:<48} {ascii_part}')

def inspect(path):
    d = path.read_bytes()
    print(f'\n=== {path} ({len(d)} bytes) ===')
    vals = struct.unpack_from('<20I', d, 0)
    pairs = [(vals[i], vals[i+1]) for i in range(0,20,2)]
    counts = [c for (_, c) in pairs]
    print('counts:', counts)
    node_count = counts[1]
    node_off = 0x58
    print(f'node table: 0x{node_off:04x} - 0x{node_off + node_count*0xE8:04x}')
    for i in range(node_count):
        off = node_off + i*0xE8
        name = d[off:off+64].split(b'\x00')[0].decode('cp932','ignore')
        print(f'  node[{i}] 0x{off:04x} {name!r}')
    # Dump after node table
    after = node_off + node_count*0xE8
    print(f'after node table (0x{after:04x}):')
    hexdump(d, after, 0x200)
    # Try to find printable names after node table
    print('printable runs after node table:')
    import re
    for m in re.finditer(rb'[\x20-\x7e]{4,}', d[after:]):
        print(f'  +0x{m.start():04x}: {m.group().decode("ascii","ignore")!r}')

for p in ['content/original-data/patch-2004-05-14/strategy/galaxy.mdx',
          'content/original-data/patch-2004-05-14/strategy/grid.mdx',
          '.omo/work/logh7-installed/data/model/Planets/fs000.mdx']:
    inspect(Path(p))
