# -*- coding: utf-8 -*-
# 5단계: 노드별 (x,y) 추출 확정 + galaxy.json 정렬 시도 + 산출물 저장
import struct, os, math, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\model\strategy"
b = open(os.path.join(ROOT,"null_galaxy.mdx"),"rb").read()
NODE_OFF=0x58; STRIDE=0xE8; COUNT=85; TAIL=0x15cbe; PN=368
def nm(o):
    e=b.find(b"\x00",o,o+0x40); return b[o:e].decode("ascii","replace")
names=[nm(NODE_OFF+i*STRIDE) for i in range(COUNT)]
def f32(o): return struct.unpack_from("<f",b,o)[0]

nodes=[]
per_counts=[]
for i in range(COUNT):
    base=TAIL+i*PN
    nz=[]
    for o in range(0,PN,4):
        v=f32(base+o)
        if v!=0.0 and math.isfinite(v) and abs(v)<1e5 and abs(v-1.0)>1e-6:
            nz.append((o,round(v,4)))
    per_counts.append(len(nz))
    # 기대: nz 2개 = (x, y). 다르면 표시
    x=nz[0][1] if len(nz)>=1 else None
    y=nz[1][1] if len(nz)>=2 else None
    nodes.append({"index":i+1,"name":names[i],"x":x,"y":y,"nonunit_in_block":len(nz),"raw":nz})

from collections import Counter
print("블록당 비단위 float 개수 분포:", Counter(per_counts))
print("\n노드별 추출 (index name x y  [raw]):")
for n in nodes:
    print(f"  {n['index']:2d} {n['name']:12s} x={n['x']} y={n['y']}  raw={n['raw']}")

xs=[n['x'] for n in nodes if n['x'] is not None]
ys=[n['y'] for n in nodes if n['y'] is not None]
print(f"\nX 범위 [{min(xs)},{max(xs)}]  Y 범위 [{min(ys)},{max(ys)}]")
print(f"유효 (x,y) 노드수: {sum(1 for n in nodes if n['x'] is not None and n['y'] is not None)}")
uniq=set((n['x'],n['y']) for n in nodes if n['x'] is not None and n['y'] is not None)
print(f"고유 (x,y) 좌표쌍: {len(uniq)}")
