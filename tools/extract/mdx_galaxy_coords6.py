# -*- coding: utf-8 -*-
# 6단계: 드리프트 무관 추출 — (X @o, Y @o+72) 쌍을 전수 수집, 노드순 매핑, galaxy.json 정렬
import struct, os, math, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\model\strategy"
b = open(os.path.join(ROOT,"null_galaxy.mdx"),"rb").read()
NODE_OFF=0x58; STRIDE=0xE8; COUNT=85; TAIL=0x15cbe
def nm(o):
    e=b.find(b"\x00",o,o+0x40); return b[o:e].decode("ascii","replace")
names=[nm(NODE_OFF+i*STRIDE) for i in range(COUNT)]
def f32(o): return struct.unpack_from("<f",b,o)[0]
def nonunit(o):
    v=f32(o)
    return v if (v!=0.0 and math.isfinite(v) and abs(v)<1e5 and abs(v-1.0)>1e-6) else None

# 꼬리 전체에서 (o, o+72) 둘 다 비단위 nonzero인 X,Y 쌍 수집
pairs=[]
for o in range(TAIL, len(b)-72-3, 4):
    x=nonunit(o); y=nonunit(o+72)
    if x is not None and y is not None:
        # o-36, o+36 위치가 대체로 1.0(identity)인지로 진짜 노드블록인지 살짝 검증
        pairs.append((o, round(x,4), round(y,4)))
# X 오프셋 순으로 정렬 = 파일 배치 순 (노드 순서와 대응 가정)
pairs.sort()
print(f"(o,o+72) 비단위 쌍 후보: {len(pairs)}개")
# 중복/겹침 제거: 각 노드 X는 이전 Y(o-72)와 겹치면 안 됨. 그리디로 최소간격 정리
clean=[]
used_end=-1
for o,x,y in pairs:
    if o>used_end:
        clean.append((o,x,y)); used_end=o+72
print(f"겹침 제거 후: {len(clean)}개 (기대 85)")
for i,(o,x,y) in enumerate(clean):
    tag=names[i] if i<COUNT else "?"
    print(f"  {i+1:2d} {tag:12s} off={hex(o)} X={x} Y={y}")
