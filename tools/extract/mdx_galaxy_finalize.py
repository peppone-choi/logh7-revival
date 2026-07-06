# -*- coding: utf-8 -*-
# 9단계: 확정 정합(swap=True,sgx=-1,sgy=+1)으로 MDX 노드 <-> galaxy.json 성계 매핑 확정 + 스펙트럴표
import json, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
nd=json.load(open("server/content/extracted/model-galaxy-nodes.json",encoding="utf-8"))
stars=[n for n in nd["nodes"] if n["kind"]=="star"]
g=json.load(open("server/content/galaxy.json",encoding="utf-8"))
Sall=g["systems"]
S=[(i,s) for i,s in enumerate(Sall) if s.get("cx") is not None]

def norm(pts):
    n=len(pts); mx=sum(p[0] for p in pts)/n; my=sum(p[1] for p in pts)/n
    sx=(sum((p[0]-mx)**2 for p in pts)/n)**0.5; sy=(sum((p[1]-my)**2 for p in pts)/n)**0.5
    return [((p[0]-mx)/sx,(p[1]-my)/sy) for p in pts], (mx,my,sx,sy)

A,_=norm([(n["x"],n["y"]) for n in stars])
Bpts,_=norm([(s["cx"],s["cy"]) for _,s in S])
# 확정 변환: A2 = (-A.y, A.x)
A2=[(-p[1],p[0]) for p in A]

mapping=[]; used=set(); residuals=[]
for k,a in enumerate(A2):
    bestd=1e9; bj=-1
    for j,bp in enumerate(Bpts):
        if j in used: continue
        d=(a[0]-bp[0])**2+(a[1]-bp[1])**2
        if d<bestd: bestd=d; bj=j
    used.add(bj); residuals.append(bestd**0.5)
    sysidx,srec=S[bj]
    st=stars[k]
    mapping.append({"mdx_index":st["index"],"mdx_name":st["name"],"mdx_spectral":st["spectral"],
                    "mdx_x":st["x"],"mdx_y":st["y"],
                    "galaxy_system_arrayidx":sysidx,"galaxy_system":srec.get("system"),
                    "galaxy_cx":srec.get("cx"),"galaxy_cy":srec.get("cy"),
                    "galaxy_spectral_old":srec.get("spectralClass"),
                    "residual_norm":round(bestd**0.5,4)})

residuals.sort()
print(f"매칭 {len(mapping)}쌍, 잔차(정규화) 중앙값={residuals[len(residuals)//2]:.4f} 최대={residuals[-1]:.4f}")
bad=[m for m in mapping if m["residual_norm"]>0.05]
print(f"잔차>0.05 (의심 매칭): {len(bad)}개")
for m in bad: print("  ",m["mdx_name"],m["galaxy_system"],m["residual_norm"])

# 스펙트럴 교체 필요 건수(MDX 권위 vs galaxy.json 추정)
diff=sum(1 for m in mapping if m["mdx_spectral"]!=m["galaxy_spectral_old"])
print(f"\nMDX 권위 스펙트럴이 galaxy.json 추정과 다른 성계: {diff}/{len(mapping)}")

out={"_note":"null_galaxy.mdx 노드좌표 <-> galaxy.json 성계 확정 정합. 변환: galaxy축 ~ (-MDX_y, +MDX_x) (90° 회전). 정규화 잔차 중앙값<0.02 = 동일 은하 배치 확정.",
     "_transform":"norm(galaxy.cx,cy) ≈ (-norm(mdx.y), +norm(mdx.x)); node순서≠galaxy.json순서(위치정합으로 매칭)",
     "pairs":mapping}
op="server/content/extracted/model-galaxy-alignment.json"
json.dump(out,open(op,"w",encoding="utf-8"),ensure_ascii=False,indent=1)
print("저장:",op)
# 매핑 몇개 출력
for m in mapping[:8]:
    print(f"  {m['mdx_name']} ({m['mdx_spectral']}) -> {m['galaxy_system']} [old spec {m['galaxy_spectral_old']}] r={m['residual_norm']}")
