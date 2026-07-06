# -*- coding: utf-8 -*-
# 4단계: 꼬리 float 섹션에서 노드별 translation(x,y,z) 추출 시도 + 검증
import struct, os, math, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\model\strategy"
b = open(os.path.join(ROOT,"null_galaxy.mdx"),"rb").read()
NODE_OFF=0x58; STRIDE=0xE8; COUNT=85
def name(o):
    e=b.find(b"\x00",o,o+0x40); return b[o:e].decode("ascii","replace")
names=[name(NODE_OFF+i*STRIDE) for i in range(COUNT)]
def f32(o): return struct.unpack_from("<f",b,o)[0]

# 전체 꼬리에서 모든 nonzero 유한 float을 (파일오프,값) 순서로 수집
TAIL=0x15cbe
seq=[]
for o in range(TAIL, len(b)-3, 4):
    v=f32(o)
    if v!=0.0 and math.isfinite(v) and abs(v)<1e5:
        seq.append((o,v))
print(f"꼬리 nonzero float 총 {len(seq)}개")
# 값 분포
from collections import Counter
cnt=Counter(round(v,4) for _,v in seq)
print("값 히스토그램(상위):", cnt.most_common(12))
# 1.0 개수
ones=sum(1 for _,v in seq if abs(v-1.0)<1e-6)
print(f"정확히 1.0: {ones}개,  1.0 아닌 값: {len(seq)-ones}개")
nonunit=[(o,v) for o,v in seq if abs(v-1.0)>1e-6]
print(f"비단위 값 {len(nonunit)}개 (== 3*{len(nonunit)/3:.2f}?), 85*3={85*3}")
print("비단위 값들 앞 40개:", [round(v,3) for _,v in nonunit[:40]])
# 오프셋 간격으로 노드 경계 추정: 연속 nonzero의 파일오프 간격
gaps=[seq[i+1][0]-seq[i][0] for i in range(len(seq)-1)]
print("오프셋 간격 히스토그램:", Counter(gaps).most_common(10))
