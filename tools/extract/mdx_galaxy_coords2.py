# -*- coding: utf-8 -*-
# 2단계: null_galaxy.mdx 노드 레코드의 베이크된 포인터를 따라가 좌표 섹션을 찾는다
import struct, os, math, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\model\strategy"
NG = os.path.join(ROOT, "null_galaxy.mdx")
b = open(NG,"rb").read()
NODE_OFF=0x58; STRIDE=0xE8; COUNT=85
BASE_VA = 0x1e300a0 - NODE_OFF   # 0x1e30048

def va2off(va): return va - BASE_VA
def u32(o): return struct.unpack_from("<I", b, o)[0]
def f32(o): return struct.unpack_from("<f", b, o)[0]
def name(o):
    e=b.find(b"\x00",o,o+0x40); return b[o:e].decode("ascii","replace")

# 각 레코드의 +0x88, +0x94 포인터 수집
print("== 레코드별 포인터 (@+0x88, @+0x8c cnt, @+0x90 parent, @+0x94 ptr2) ==")
ptrs=[]
for i in range(COUNT):
    ro=NODE_OFF+i*STRIDE
    nm=name(ro); p1=u32(ro+0x88); c=u32(ro+0x8c); par=u32(ro+0x90); p2=u32(ro+0x94)
    ptrs.append((i,nm,p1,c,par,p2,ro))
    if i<6 or i>=COUNT-6:
        po1=va2off(p1); po2=va2off(p2)
        print(f"  [{i:2d}] {nm:12s} p1={hex(p1)}->off{hex(po1)} cnt={c} parent={par if par!=0xffffffff else -1} p2={hex(p2)}->off{hex(po2)}")

# p1 포인터가 가리키는 곳 덤프 (첫 3개 노드)
print("\n== p1 타깃 영역 덤프 (star_01/02/03) ==")
for i in range(3):
    _,nm,p1,c,par,p2,ro=ptrs[i]
    o=va2off(p1)
    print(f"-- {nm} p1 off {hex(o)} --")
    for r in range(0,64,16):
        ch=b[o+r:o+r+16]; hx=" ".join(f"{x:02x}" for x in ch)
        fl=[round(f32(o+r+k),3) for k in range(0,16,4)]
        print(f"   +{r:02x}: {hx}   f32={fl}")

# 포인터들이 노드별로 다른가? 간격은?
p1s=[p[2] for p in ptrs]
print("\np1 포인터 유니크수:", len(set(p1s)), "/", COUNT)
diffs=sorted(set(p1s[i+1]-p1s[i] for i in range(COUNT-1)))
print("연속 p1 간격 유니크:", diffs[:20])

# pair 섹션들 좌표 스캔: pair1(85), pair5(85), pair2(765)
pairs=[struct.unpack_from("<II",b,i*8) for i in range(10)]
def scan_floats_region(off, nbytes, label, stride_guess=None):
    print(f"\n== {label}: off {hex(off)} len {nbytes} ==")
    # 4바이트 float로 전부 해석, 유효좌표 후보 카운트
    good=[]
    for o in range(off, min(off+nbytes, len(b)-3), 4):
        v=f32(o)
        if v!=0.0 and math.isfinite(v) and 1e-4<abs(v)<1e6:
            good.append((o-off, round(v,4)))
    print(f"  유효좌표후보 float: {len(good)}개 / {nbytes//4} 슬롯")
    print("  샘플:", good[:24])

# 섹션 경계 추정
secs=[]
for i,(p,c) in enumerate(pairs):
    if c>0: secs.append((i,va2off(p),c))
secs_sorted=sorted(secs,key=lambda s:s[1])
print("\n섹션 오프셋 정렬:", [(s[0],hex(s[1]),s[2]) for s in secs_sorted])
for idx in range(len(secs_sorted)):
    slot,off,cnt=secs_sorted[idx]
    end = secs_sorted[idx+1][1] if idx+1<len(secs_sorted) else len(b)
    scan_floats_region(off, end-off, f"pair{slot} (count={cnt})")
