# -*- coding: utf-8 -*-
# 7단계: MDX 노드좌표 추출 저장 + galaxy.json 정렬 판정
import struct, os, math, sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
ROOT = r"E:\logh7-revival\artifacts\logh7-install\____________s___\____\data\model\strategy"
b = open(os.path.join(ROOT,"null_galaxy.mdx"),"rb").read()
NODE_OFF=0x58; STRIDE=0xE8; COUNT=85; TAIL=0x15cbe; REC=324
def nm(o):
    e=b.find(b"\x00",o,o+0x40); return b[o:e].decode("ascii","replace")
names=[nm(NODE_OFF+i*STRIDE) for i in range(COUNT)]
def f32(o): return struct.unpack_from("<f",b,o)[0]

nodes=[]
for i in range(COUNT):
    base=TAIL+i*REC
    x=round(f32(base+0),4); y=round(f32(base+72),4)
    n=names[i]; spec=None
    if n.startswith("star_"): spec=n.split("_")[2] if len(n.split("_"))>2 else None
    kind="star" if n.startswith("star_") else ("blackhole" if n.startswith("bh") else "neutron_star")
    nodes.append({"index":i+1,"name":n,"kind":kind,"spectral":spec,"x":x,"y":y,"z":0.0,"parent":-1})

# 산출물 저장
out={"_source":"data/model/strategy/null_galaxy.mdx 씬그래프 노드 transform(꼬리 float 섹션)",
     "_layout":"노드 디렉토리 @0x58 stride 0xE8(232B); 꼬리 transform 섹션 @0x15cbe stride 324B(0x144), X@+0 Y@+72(둘 다 float32, 0.25배수). Z축 없음(2D 맵).",
     "_verdict":"coords-recoverable",
     "_axis_note":"MDX X: +우/-좌 (index1-39 양수=제국측, 40-79 음수=동맹측). Y: 화면 상하 미확정(플립 가능).",
     "count":len(nodes),"nodes":nodes}
op="server/content/extracted/model-galaxy-nodes.json"
json.dump(out, open(op,"w",encoding="utf-8"), ensure_ascii=False, indent=1)
print("저장:", op, len(nodes),"노드")

# ---- galaxy.json 정렬 ----
g=json.load(open("server/content/galaxy.json",encoding="utf-8"))
S=g["systems"]
stars=[n for n in nodes if n["kind"]=="star"]  # 79

def affine_fit(src, dst):
    # dst ~ A*src + t (최소자승, 2D->2D). src,dst: list of (x,y)
    import statistics
    n=len(src)
    # 정규방정식 풀이 (6 미지수). numpy 없이 수동.
    # 모델: dx = a*sx + b*sy + c ; dy = d*sx + e*sy + f
    Sxx=sum(s[0]*s[0] for s in src); Sxy=sum(s[0]*s[1] for s in src)
    Syy=sum(s[1]*s[1] for s in src); Sx=sum(s[0] for s in src); Sy=sum(s[1] for s in src)
    def solve(target):
        # [Sxx Sxy Sx; Sxy Syy Sy; Sx Sy n] [a;b;c] = [sum sx*t; sum sy*t; sum t]
        b1=sum(s[0]*t for s,t in zip(src,target)); b2=sum(s[1]*t for s,t in zip(src,target)); b3=sum(target)
        M=[[Sxx,Sxy,Sx,b1],[Sxy,Syy,Sy,b2],[Sx,Sy,n,b3]]
        # 가우스 소거
        for c in range(3):
            p=M[c][c]
            if abs(p)<1e-12: return None
            for r in range(3):
                if r!=c:
                    f=M[r][c]/p
                    for k in range(4): M[r][k]-=f*M[c][k]
        return [M[i][3]/M[i][i] for i in range(3)]
    cx=solve([d[0] for d in dst]); cy=solve([d[1] for d in dst])
    if not cx or not cy: return None
    # 잔차 R^2
    pred=[(cx[0]*s[0]+cx[1]*s[1]+cx[2], cy[0]*s[0]+cy[1]*s[1]+cy[2]) for s in src]
    mx=sum(d[0] for d in dst)/n; my=sum(d[1] for d in dst)/n
    ssr=sum((p[0]-d[0])**2+(p[1]-d[1])**2 for p,d in zip(pred,dst))
    sst=sum((d[0]-mx)**2+(d[1]-my)**2 for d in dst)
    r2=1-ssr/sst if sst else 0
    return {"cx":cx,"cy":cy,"r2":round(r2,4),"rms":round((ssr/n)**0.5,3)}

# 가정 A: node[i] <-> systems[i] (동일 순서), 79성계 대상
# galaxy.json 앞 79개가 star 대응인지 모름 → 여러 타깃으로 시험
def try_align(dstkey1,dstkey2,label,limit=79):
    src=[(n["x"],n["y"]) for n in stars[:limit]]
    dst=[]
    ok=True
    for j in range(limit):
        s=S[j]
        if s.get(dstkey1) is None or s.get(dstkey2) is None: ok=False; break
        dst.append((s[dstkey1],s[dstkey2]))
    if not ok: print(f"[{label}] 타깃 결측으로 스킵"); return
    r=affine_fit(src,dst)
    print(f"[{label}] node[i]<->systems[i] affine R²={r['r2']} rms={r['rms']}")

try_align("cx","cy","cx/cy")
try_align("canonGameCol","canonGameRow","canonGameCol/Row")
try_align("canonCol","canonRow","canonCol/Row")

# 스펙트럴 순서 일치 검사
node_spec="".join(n["spectral"] for n in stars)
sys_spec="".join((S[j].get("spectralClass") or "?") for j in range(79))
match=sum(1 for a,b_ in zip(node_spec,sys_spec) if a==b_)
print(f"\n스펙트럴 순서 일치(node vs galaxy.json 앞79): {match}/79")
from collections import Counter
print("MDX 스펙트럴 히스토:", dict(Counter(node_spec)))
print("galaxy.json 스펙트럴 히스토(전85):", dict(Counter((s.get('spectralClass') or '?') for s in S)))
