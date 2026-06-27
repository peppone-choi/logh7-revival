#!/usr/bin/env python3
"""함선 디테일 텍스처 초해상(Real-ESRGAN) — 함체 UV 아틀라스 + 범프맵.

대상 선정 원칙(ESRGAN이 Lanczos보다 이득인 *디테일* 텍스처):
  - data/model/images/Hi 의 함체 디퓨즈 아틀라스(EH/EM/FH/FM###[_i##]) =
    패널라인·그리블·휘장이 살아있는 하드엣지 디테일 → ESRGAN 우위.
  - 함체 범프맵(*_BUMP) = 그레이스케일 디테일 → ESRGAN 우위.
  - ★제외: 항성 글로우(fs*, lens/, BackLight), 평활 광원/플레어 =
    Lanczos가 우위라 본 도구 대상 아님(별도 LANCZOS 파이프라인).

원본은 대부분 8bpp 팔레트(mode P) / 그레이스케일(mode L) BMP.
Real-ESRGAN은 3ch RGB만 → P/L 을 RGB로 변환해 SR → 24bpp BMP 재인코딩.
D3DX8 CD3DXImage 는 content magic 으로 로드하므로 더 큰 치수·다른 bpp 드롭인 가능
(2026-06-26 패널 리마스터 8bpp→32bpp 드롭인 선례로 검증됨).

3트리 배포(--deploy): client/dist + client/vendor + 라이브 .omo/work/logh7-installed.
백업 필수: 배포 전 원본을 backup_root 에 자동 보존(P0 무손상).

사용:
  python -m tools.logh7_ship_texture_sr --list
  python -m tools.logh7_ship_texture_sr --scale 2                 # 오버레이 생성
  python -m tools.logh7_ship_texture_sr --scale 2 --deploy        # 백업 후 3트리 배포
  python -m tools.logh7_ship_texture_sr --scale 2 --only EH001    # 샘플 1장
"""
from __future__ import annotations

# --- torchvision functional_tensor shim (신 torchvision 호환) -------------------
import sys
import types
import torchvision.transforms.functional as _tvF

_shim = types.ModuleType("torchvision.transforms.functional_tensor")
_shim.rgb_to_grayscale = _tvF.rgb_to_grayscale
sys.modules.setdefault("torchvision.transforms.functional_tensor", _shim)
# ------------------------------------------------------------------------------

import argparse
import json
import re
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image

RE_ROOT = Path(__file__).resolve().parents[1]                 # .../RE
REPO = RE_ROOT.parent if (RE_ROOT.parent / "client").exists() else RE_ROOT

# 원본 소스(읽기) = 프리징한 원본 스냅샷.
#  ★주의: 라이브 트리(.omo/work/logh7-installed)는 배포 *대상*이므로 소스로 쓰면
#  배포가 소스를 덮어써 재실행 시 이미 업스케일된 이미지를 또 업스케일하는 오염 발생.
#  그래서 배포 대상이 아닌 별도 프리징 스냅샷에서 읽는다(없으면 라이브 트리 폴백).
_FROZEN = REPO / ".omo/work/remaster/ship-texture-source-2026-06-26"
SRC_IMAGES = _FROZEN if _FROZEN.exists() else REPO / ".omo/work/logh7-installed/data/model/images"

# ★3트리 배포 대상(함선 텍스처는 model/images/{Hi,Mid,Lo} 아래)
DEPLOY_TREES = [
    REPO / "client/dist/logh7-client/data/model/images",
    REPO / "client/vendor/logh7-installed/data/model/images",
    REPO / ".omo/work/logh7-installed/data/model/images",      # 라이브 트리
]

# 함체 디퓨즈 아틀라스: EH/EM/FH/FM + 번호 (+ _i## 휘장/디테일 타일)
DIFFUSE_RE = re.compile(r"^(eh|em|fh|fm)\d+(_i\d+)?\.bmp$", re.I)
BUMP_RE = re.compile(r"_bump\.bmp$", re.I)


def collect_targets(lod: str = "Hi") -> list[str]:
    """함체 디퓨즈 + 범프 디테일 텍스처 rel 목록(lod 디렉토리 기준)."""
    base = SRC_IMAGES / lod
    rels: list[str] = []
    for f in sorted(p.name for p in base.iterdir() if p.is_file()):
        if not f.lower().endswith(".bmp"):
            continue
        if BUMP_RE.search(f) or DIFFUSE_RE.match(f):
            rels.append(f"{lod}/{f}")
    return rels


def sr_enhance(img_rgb: np.ndarray, upsampler, outscale: int) -> np.ndarray:
    out, _ = upsampler.enhance(img_rgb, outscale=outscale)
    return out


def process_one(rel: str, upsampler, scale: int, out_dir: Path, max_dim: int = 2048) -> dict:
    src = SRC_IMAGES / rel
    im = Image.open(src)
    mode_in = im.mode
    rgb = np.asarray(im.convert("RGB"))
    h, w = rgb.shape[:2]

    eff = scale
    while eff > 1 and (max(h, w) * eff) > max_dim:
        eff -= 1

    t = time.time()
    up_rgb = sr_enhance(rgb, upsampler, eff) if eff > 1 else rgb
    dt = round(time.time() - t, 1)
    H, W = up_rgb.shape[:2]

    out_img = Image.fromarray(up_rgb, "RGB")
    dst = out_dir / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    # 원포맷(BMP) 보존 — 24bpp 로 재인코딩(D3DX8 content-magic 로드)
    out_img.save(dst, "BMP")

    prev = out_dir / "_preview" / (rel.replace("/", "_") + ".png")
    prev.parent.mkdir(parents=True, exist_ok=True)
    out_img.save(prev, "PNG")

    return {"rel": rel, "mode": mode_in, "src": f"{w}x{h}",
            "scale": eff, "out": f"{W}x{H}", "sec": dt,
            "bytes": dst.stat().st_size}


def deploy_with_backup(rels: list[str], overlay_dir: Path, backup_root: Path) -> dict:
    deployed, grew, missing_tree = 0, 0, 0
    for tree in DEPLOY_TREES:
        tag = ("dist" if "dist" in tree.parts else
               "vendor" if "vendor" in tree.parts else "live")
        for rel in rels:
            up = overlay_dir / rel
            if not up.exists():
                continue
            dst = tree / rel
            if dst.exists():
                bak = backup_root / tag / rel
                if not bak.exists():
                    bak.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(dst, bak)        # ★배포 전 원본 백업
                grew += up.stat().st_size - dst.stat().st_size
            else:
                missing_tree += 1
                dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(up, dst)
            deployed += 1
    return {"deployed": deployed, "bytes_grew": grew, "dst_absent_pre": missing_tree}


def build_upsampler():
    from realesrgan import RealESRGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet
    path = REPO / ".omo/work/remaster/weights/RealESRGAN_x4plus.pth"
    model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23,
                    num_grow_ch=32, scale=4)
    return RealESRGANer(scale=4, model_path=str(path), model=model,
                        tile=256, tile_pad=10, half=False, device="cpu")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--lod", default="Hi")
    ap.add_argument("--out", default=".omo/work/remaster/ship-texture-overlay")
    ap.add_argument("--deploy", action="store_true")
    ap.add_argument("--backup", default=".omo/work/remaster/ship-texture-backup-2026-06-26")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--only", default=None, help="콤마구분 rel 부분일치 필터")
    args = ap.parse_args()

    targets = collect_targets(args.lod)
    if args.only:
        keys = args.only.split(",")
        targets = [r for r in targets if any(k.lower() in r.lower() for k in keys)]
    if args.list:
        print(json.dumps({"targets": targets, "n": len(targets)}, indent=1))
        return 0

    out_dir = REPO / args.out / "data/model/images"
    upsampler = build_upsampler()

    done, errs = [], []
    for i, rel in enumerate(targets):
        try:
            r = process_one(rel, upsampler, args.scale, out_dir)
            done.append(r)
            print(f"[{i+1}/{len(targets)}] {rel} {r['src']}->{r['out']} {r['sec']}s", flush=True)
        except Exception as e:
            errs.append({"rel": rel, "err": repr(e)})
            print(f"[{i+1}/{len(targets)}] ERR {rel}: {e!r}", flush=True)

    total_sec = round(sum(d["sec"] for d in done), 1)
    result = {"scale": args.scale, "lod": args.lod, "upscaled": len(done),
              "errors": errs, "total_sec": total_sec,
              "total_min": round(total_sec / 60, 1), "out": str(out_dir)}
    if args.deploy:
        rels = [d["rel"] for d in done]
        result["deploy"] = deploy_with_backup(rels, out_dir, REPO / args.backup)
    print(json.dumps(result, ensure_ascii=False, indent=1), flush=True)
    # 결과 JSON 영속(요약 문서용)
    (REPO / args.out / "result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
