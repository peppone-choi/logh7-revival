#!/usr/bin/env python3
# 전수 텍스처 리마스터 스윕 (2026-06-26): 잔여 data/image 텍스처를 Lanczos 2x 업스케일하여
# 원본 포맷 드롭인 재인코딩하고 3개 배포 트리(dist/vendor/.omo 라이브)에 백업 후 배포.
# - TGA type-1(8bpp 팔레트)/type-2(24·32bpp) 자체 디코더 + BMP/PNG는 PIL.
# - 원포맷 보존: BMP→BMP, TGA→TGA(type-2 32bpp), PNG→PNG. (게임 D3DX8은 magic으로 로드)
# - ≤32px 또는 이미 리마스터된 rel은 스킵. 2x 결과가 2048² 초과 시 캡(1x).
import struct, json, shutil, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

RE_ROOT = Path(__file__).resolve().parents[1]
REPO = RE_ROOT.parent
DIST = REPO / "client/dist/logh7-client/data/image"
TREES = [
    REPO / "client/dist/logh7-client/data/image",
    REPO / "client/vendor/logh7-installed/data/image",
    RE_ROOT / ".omo/work/logh7-installed/data/image",   # ★라이브 트리
]
BACKUP = RE_ROOT / ".omo/work/remaster/sweep-original-backup-2026-06-26"
OVERLAY = RE_ROOT / ".omo/work/remaster/sweep-overlay/data/image"

def decode_tga(d):
    idlen,cmtype,imgtype,cmstart,cmlen,cmbpp,xo,yo,w,h,bpp,desc = struct.unpack("<BBBHHBHHHHBB", d[:18])
    off = 18 + idlen
    top = bool(desc & 0x20)
    out = np.zeros((h, w, 4), np.uint8)
    if imgtype in (1, 9):
        entry = cmbpp // 8
        pal = np.frombuffer(d[off:off+cmlen*entry], np.uint8).reshape(-1, entry); off += cmlen*entry
        pr = np.zeros((cmlen, 4), np.uint8)
        pr[:,0]=pal[:,2]; pr[:,1]=pal[:,1]; pr[:,2]=pal[:,0]
        pr[:,3]=pal[:,3] if entry==4 else 255
        idx = np.frombuffer(d[off:off+w*h], np.uint8).reshape(h, w)
        out = pr[idx]
    elif imgtype in (2, 10):
        px = np.frombuffer(d[off:off+w*h*(bpp//8)], np.uint8).reshape(h, w, bpp//8)
        out[...,0]=px[...,2]; out[...,1]=px[...,1]; out[...,2]=px[...,0]
        out[...,3]=px[...,3] if bpp==32 else 255
    else:
        raise ValueError(f"tga imgtype {imgtype}")
    if not top: out = out[::-1]
    return out

def encode_tga32(rgba):
    h, w = rgba.shape[:2]
    hdr = struct.pack("<BBBHHBHHHHBB", 0,0,2,0,0,0,0,0, w, h, 32, 0x28)
    bgra = np.empty_like(rgba)
    bgra[...,0]=rgba[...,2]; bgra[...,1]=rgba[...,1]; bgra[...,2]=rgba[...,0]; bgra[...,3]=rgba[...,3]
    return hdr + bgra.tobytes()

def load_rgba(p):
    suf = p.suffix.lower()
    if suf == ".tga":
        return decode_tga(p.read_bytes())
    im = Image.open(p).convert("RGBA")
    return np.asarray(im, np.uint8)

def remaster_one(rel, scale=2, max_dim=2048):
    src = DIST / rel
    suf = src.suffix.lower()
    rgba = load_rgba(src)
    h, w = rgba.shape[:2]
    if max(w, h) <= 32:
        return {"rel": rel, "skip": "tiny"}
    eff = scale
    while eff > 1 and max(w, h)*eff > max_dim:
        eff -= 1
    im = Image.fromarray(rgba, "RGBA")
    up = im.resize((w*eff, h*eff), Image.LANCZOS).filter(
        ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=2))
    dst = OVERLAY / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    arr = np.asarray(up, np.uint8)
    if suf == ".tga":
        dst.write_bytes(encode_tga32(arr))
    elif suf in (".bmp",):
        # BMP는 알파 없는 24bit로 저장(원본 다수 24bpp; 게임은 BM magic 로드)
        Image.fromarray(arr[...,:3], "RGB").save(dst, "BMP")
    elif suf == ".png":
        up.save(dst, "PNG")
    else:
        up.convert("RGB").save(dst, "JPEG", quality=92)
    return {"rel": rel, "src": f"{w}x{h}", "out": f"{w*eff}x{h*eff}", "eff": eff,
            "bytes": dst.stat().st_size}

def deploy(rels):
    deployed = 0; grew = 0; per_tree = {}
    for tree in TREES:
        tag = "dist" if "dist" in str(tree) else ("vendor" if "vendor" in str(tree) else "live")
        cnt = 0
        for rel in rels:
            up = OVERLAY / rel
            if not up.exists(): continue
            dst = tree / rel
            if dst.exists():
                bak = BACKUP / tag / rel
                if not bak.exists():
                    bak.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(dst, bak)
                grew += up.stat().st_size - dst.stat().st_size
                shutil.copy2(up, dst); cnt += 1; deployed += 1
            # dst가 없으면(그 트리에 원본 부재) 스킵 — 신규 생성 안 함
        per_tree[tag] = cnt
    return {"deployed": deployed, "bytes_grew": grew, "per_tree": per_tree}

def main():
    rels = json.load(open(RE_ROOT/"_upscalable.json"))
    # ESRGAN으로 별도 처리할 detail subset 제외(effect 폭발·map_obj·Stream·planetbattle은 별 트랙)
    ESRGAN = json.load(open(RE_ROOT/"_esrgan.json")) if (RE_ROOT/"_esrgan.json").exists() else []
    esr = set(ESRGAN)
    rels = [r for r in rels if r not in esr]
    done, errs, skipped = [], [], []
    for rel in rels:
        try:
            r = remaster_one(rel)
            (skipped if r.get("skip") else done).append(r)
        except Exception as e:
            errs.append({"rel": rel, "err": str(e)})
    dep = deploy([d["rel"] for d in done])
    out = {"lanczos_done": len(done), "skipped": len(skipped), "errors": errs[:20],
           "n_errors": len(errs), "deploy": dep, "sample": done[:5]}
    json.dump(out, open(RE_ROOT/"_sweep_result.json","w"), ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    raise SystemExit(main())
