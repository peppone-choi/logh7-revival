import struct
from pathlib import Path
import re

def inspect(path):
    d = path.read_bytes()
    print(f'\n=== {path} ({len(d)} bytes) ===')
    vals = struct.unpack_from('<20I', d, 0)
    pairs = [(vals[i], vals[i+1]) for i in range(0,20,2)]
    counts = [c for (_, c) in pairs]
    node_count = counts[1]
    print(f'node_count={node_count}')
    # Walk node records
    off = 0x58
    nodes = []
    while off + 0xE8 <= len(d):
        name = d[off:off+64].split(b'\x00')[0].decode('cp932','ignore')
        if not name or not re.fullmatch(r'[A-Za-z0-9_:.-]+', name):
            break
        nodes.append((off, name))
        off += 0xE8
    print(f'parsed {len(nodes)} nodes')
    # Check for non-zero floats in first 0x80 bytes of each node record
    found = False
    for off, name in nodes:
        for foff in range(0x10, 0x80, 4):
            f = struct.unpack_from('<f', d, off+foff)[0]
            if f != 0.0 and abs(f) < 1e6 and abs(f) > 1e-4:
                print(f'  {name} off+0x{foff:02x}: {f:.4f}')
                found = True
    if not found:
        print('  no non-zero floats in 0x10-0x80 of node records')

for p in ['.omo/work/logh7-installed/data/model/Ship/e_unknown.mdx',
          '.omo/work/logh7-installed/data/model/Ship/FH047.mdx',
          '.omo/work/logh7-installed/data/model/Ship/FL024.mdx']:
    inspect(Path(p))
