#!/usr/bin/env python3
# 전수 스윕 ESRGAN 트랙(2026-06-26): detail subset(_esrgan.json)을 Real-ESRGAN로 업스케일,
# 원포맷 드롭인, 3트리(dist/vendor/.omo 라이브) 백업 후 배포. 2048² 캡(outscale 동적).
import json, shutil
from pathlib import Path
import importlib.util

RE_ROOT = Path(__file__).resolve().parents[1]
REPO = RE_ROOT.parent
spec = importlib.util.spec_from_file_location("aisr", RE_ROOT/"tools/logh7_ai_texture_sr.py")
aisr = importlib.util.module_from_spec(spec); spec.loader.exec_module(aisr)

OVERLAY = RE_ROOT/".omo/work/remaster/sweep-esrgan-overlay"/"data/image"
BACKUP  = RE_ROOT/".omo/work/remaster/sweep-original-backup-2026-06-26"
TREES = [
    REPO/"client/dist/logh7-client/data/image",
    REPO/"client/vendor/logh7-installed/data/image",
    RE_ROOT/".omo/work/logh7-installed/data/image",
]
DIST = TREES[0]

def main():
    import numpy as np
    from PIL import Image
    rels = json.load(open(RE_ROOT/"_esrgan.json"))
    up = aisr.build_upsampler("x4plus", 4)
    done, errs = [], []
    for rel in rels:
        try:
            src = DIST/rel
            w,h = Image.open(src).size
            scale = 4
            while scale>1 and max(w,h)*scale>2048: scale-=1
            r = aisr.process_one(rel, up, scale, OVERLAY, max_dim=2048)
            done.append(r)
        except Exception as e:
            errs.append({"rel": rel, "err": str(e)})
    # deploy 3 trees
    deployed=0; grew=0; per={}
    for tree in TREES:
        tag = "dist" if "dist" in str(tree) else ("vendor" if "vendor" in str(tree) else "live")
        c=0
        for d in done:
            rel=d["rel"]; o=OVERLAY/rel
            if not o.exists(): continue
            dst=tree/rel
            if dst.exists():
                bak=BACKUP/tag/rel
                if not bak.exists():
                    bak.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(dst,bak)
                grew+=o.stat().st_size-dst.stat().st_size
                shutil.copy2(o,dst); c+=1; deployed+=1
        per[tag]=c
    out={"esrgan_done":len(done),"errors":errs,"deploy":{"deployed":deployed,"bytes_grew":grew,"per_tree":per},"sample":done[:5]}
    json.dump(out,open(RE_ROOT/"_sweep_esrgan_result.json","w"),ensure_ascii=False,indent=1)
    print(json.dumps(out,ensure_ascii=False,indent=1))

if __name__=="__main__":
    raise SystemExit(main())
