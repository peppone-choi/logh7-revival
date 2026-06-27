import struct
from pathlib import Path
import re

path = Path('.omo/work/logh7-installed/data/model/strategy/Null_galaxy.mdx')
d = path.read_bytes()
print(f'{path} ({len(d)} bytes)')
vals = struct.unpack_from('<20I', d, 0)
pairs = [(vals[i], vals[i+1]) for i in range(0,20,2)]
counts = [c for (_, c) in pairs]
print('counts:', counts)
node_count = counts[1]
print(f'node_count={node_count}')
off = 0x58
nodes = []
while off + 0xE8 <= len(d):
    name = d[off:off+64].split(b'\x00')[0].decode('cp932','ignore')
    if not name or not re.fullmatch(r'[A-Za-z0-9_:.-]+', name):
        break
    nodes.append((off, name))
    off += 0xE8
print(f'parsed {len(nodes)} nodes')
for off, name in nodes[:10]:
    print(f'  0x{off:04x} {name!r}')
# Check floats in node records
found = False
for off, name in nodes:
    for foff in range(0x10, 0x80, 4):
        f = struct.unpack_from('<f', d, off+foff)[0]
        if f != 0.0 and abs(f) < 1e6 and abs(f) > 1e-4:
            print(f'  {name} off+0x{foff:02x}: {f:.4f}')
            found = True
if not found:
    print('  no non-zero floats in 0x10-0x80 of node records')
# Check all floats in file
print('all candidate non-zero floats:')
for off in range(0, len(d)-3, 4):
    f = struct.unpack_from('<f', d, off)[0]
    if f != 0.0 and abs(f) < 1e6 and abs(f) > 1e-4:
        print(f'  0x{off:04x}: {f:.4f}')
