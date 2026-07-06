# -*- coding: utf-8 -*-
# 3단계: null_galaxy.mdx 꼬리 float 섹션(파일오프 0x15cbe~) 구조 해독 + 좌표 추출
import struct, os, math, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\model\strategy"
NG = os.path.join(ROOT, "null_galaxy.mdx")
b = open(NG,"rb").read()
NODE_OFF=0x58; STRIDE=0xE8; COUNT=85
def name(o):
    e=b.find(b"\x00",o,o+0x40); return b[o:e].decode("ascii","replace")
names=[name(NODE_OFF+i*STRIDE) for i in range(COUNT)]

TAIL=0x15cbe          # 89278, 꼬리 float 섹션 시작
PN = (len(b)-TAIL)//COUNT   # 노드당 바이트
print(f"꼬리섹션 시작 {hex(TAIL)}={TAIL}, 노드당 {PN} bytes, 잔여 {(len(b)-TAIL)-PN*COUNT}")

def f32(o): return struct.unpack_from("<f",b,o)[0]
def u32(o): return struct.unpack_from("<I",b,o)[0]

# 노드0, 노드1 전체 덤프 (float으로)
for ni in (0,1,74,79):
    base=TAIL+ni*PN
    print(f"\n== node[{ni}] {names[ni]} @off {hex(base)} ({PN}B) float 뷰 ==")
    for o in range(0,PN,16):
        vs=[f32(base+o+k) for k in range(0,16,4) if base+o+k+4<=len(b)]
        us=[u32(base+o+k) for k in range(0,16,4) if base+o+k+4<=len(b)]
        vs_s=", ".join(f"{v:11.4g}" for v in vs)
        print(f"   +0x{o:03x}: f[{vs_s}]  u[{', '.join(hex(u) for u in us)}]")
    if ni==1: break_note=None
