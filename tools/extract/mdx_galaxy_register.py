# -*- coding: utf-8 -*-
# 8단계: MDX 별 좌표 점군 <-> galaxy.json cx/cy 점군 강체정합(플립/스왑 + 최근접매칭)
import json, math, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
nd=json.load(open("server/content/extracted/model-galaxy-nodes.json",encoding="utf-8"))
stars=[n for n in nd["nodes"] if n["kind"]=="star"]
g=json.load(open("server/content/galaxy.json",encoding="utf-8"))
S=[s for s in g["systems"] if s.get("cx") is not None and s.get("cy") is not None]
print(f"MDX 별 {len(stars)}개, galaxy.json cx/cy 보유 {len(S)}개")

def norm(pts):
    n=len(pts); mx=sum(p[0] for p in pts)/n; my=sum(p[1] for p in pts)/n
    sx=(sum((p[0]-mx)**2 for p in pts)/n)**0.5; sy=(sum((p[1]-my)**2 for p in pts)/n)**0.5
    return [((p[0]-mx)/sx,(p[1]-my)/sy) for p in pts]

A=norm([(n["x"],n["y"]) for n in stars])
B=norm([(s["cx"],s["cy"]) for s in S])

best=None
for swap in (False,True):
    for sgx in (1,-1):
        for sgy in (1,-1):
            A2=[((p[1] if swap else p[0])*sgx,(p[0] if swap else p[1])*sgy) for p in A]
            # 그리디 최근접 매칭 A2->B
            tot=0; matched=0; usedB=set()
            for a in A2:
                bestd=1e9; bj=-1
                for j,bpt in enumerate(B):
                    if j in usedB: continue
                    d=(a[0]-bpt[0])**2+(a[1]-bpt[1])**2
                    if d<bestd: bestd=d; bj=j
                if bj>=0: usedB.add(bj); tot+=bestd**0.5; matched+=1
            mean=tot/matched
            key=(swap,sgx,sgy)
            if best is None or mean<best[0]:
                best=(mean,key,matched)
            print(f"swap={swap} sgx={sgx:+d} sgy={sgy:+d}  평균최근접거리(정규화)={mean:.3f}")
print("\n최선 정합:", best)
# 참고: 완전 무작위 점군의 정규화 평균최근접거리는 ~0.3-0.5. 진짜 동일배치면 <<0.15 기대.
