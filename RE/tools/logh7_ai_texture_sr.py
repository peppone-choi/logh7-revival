#!/usr/bin/env python3
"""AI 텍스처 초해상(Real-ESRGAN) 업스케일 — 고가치 텍스처(함성/배경/성운/항성글로우/전략).

기존 logh7_remaster_hud_tga.py(LANCZOS)는 type-1 팔레트 TGA(HUD/패널)만 다룬다.
이 도구는 PIL이 직접 읽는 truecolor 포맷(BMP/PNG/TGA32/JPG)의 "큰 가치" 텍스처를
Real-ESRGAN x4(CPU)로 신경망 초해상 → 원포맷 보존 재인코딩한다.

신 torchvision은 torchvision.transforms.functional_tensor 를 제거했으므로
basicsr import 전에 sys.modules 로 shim 패치한다(functional 로 우회).

원본 무손상: 산출은 오버레이 디렉토리, 배포는 --deploy(백업 후 드롭인).

사용:
  python -m tools.logh7_ai_texture_sr --list
  python -m tools.logh7_ai_texture_sr --scale 4              # 오버레이 생성
  python -m tools.logh7_ai_texture_sr --scale 4 --deploy     # 백업 후 배포
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
import shutil
import time
from pathlib import Path

import numpy as np
from PIL import Image

RE_ROOT = Path(__file__).resolve().parents[1]            # .../RE
REPO = RE_ROOT.parent if (RE_ROOT.parent / "client").exists() else RE_ROOT
IMG = REPO / "client/vendor/logh7-installed/data/image"  # 원본 소스(읽기)

# 배포 대상 캐논 이미지 트리(둘 다)
DEPLOY_DIRS = [
    REPO / "client/dist/logh7-client/data/image",
    REPO / "client/vendor/logh7-installed/data/image",
]

# ★고가치 미-리마스터 텍스처(truecolor, type-1 팔레트 TGA 파이프라인이 안 건드림).
#  항성 글로우(fs00x_f), 렌즈플레어/백라이트, 블랙홀, 전략 배경, 폭발/캐리어 effect.
HIVALUE_SET = [
    # 고정성(항성) 글로우 512x512 — 전략맵 다색 항성의 핵심 텍스처
    "strategy/fs000_f.bmp", "strategy/fs001_f.bmp", "strategy/fs002_f.bmp",
    "strategy/fs003_f.bmp", "strategy/fs004_f.bmp", "strategy/fs005_f.bmp",
    "strategy/fs006_f.bmp",
    "strategy/grid_glow.bmp",      # 전략 그리드 글로우
    "strategy/bh_flare.bmp",       # 블랙홀 플레어
    # 렌즈 플레어 / 항성 백라이트(fs000a/b = 항성 본체 768K)
    "lens/fs000a.bmp", "lens/fs000b.bmp",
    "lens/BackLight.bmp",
    # 전투 effect(폭발/캐리어/광원) — 전술맵 가치
    "effect/exp_a.bmp", "effect/CarrierCraft.tga", "effect/light.tga",
    # 전략 대형 텍스처(truecolor TGA — 팔레트 파이프라인 밖)
    "effect/strategy.tga",
]


def sr_enhance(img_rgb: np.ndarray, upsampler, outscale: int) -> np.ndarray:
    """Real-ESRGAN x4 신경망 업스케일. RGB(H,W,3) uint8 in/out."""
    out, _ = upsampler.enhance(img_rgb, outscale=outscale)
    return out


def process_one(rel: str, upsampler, scale: int, out_dir: Path, max_dim: int = 4096) -> dict:
    src = IMG / rel
    im = Image.open(src)
    fmt = (im.format or src.suffix.lstrip(".").upper())
    mode_in = im.mode
    has_alpha = mode_in in ("RGBA", "LA") or (mode_in == "P" and "transparency" in im.info)

    # 알파 채널은 Real-ESRGAN(3ch RGB)와 별도로 LANCZOS 업스케일해 재합성(NN은 RGB만)
    alpha = None
    if has_alpha:
        rgba = im.convert("RGBA")
        alpha = np.asarray(rgba)[..., 3]
        rgb = np.asarray(rgba)[..., :3]
    else:
        rgb = np.asarray(im.convert("RGB"))

    h, w = rgb.shape[:2]
    eff = scale
    while eff > 1 and (max(h, w) * eff) > max_dim:
        eff -= 1

    t = time.time()
    up_rgb = sr_enhance(rgb, upsampler, eff) if eff > 1 else rgb
    dt = round(time.time() - t, 1)
    H, W = up_rgb.shape[:2]

    if alpha is not None:
        up_a = np.asarray(Image.fromarray(alpha).resize((W, H), Image.LANCZOS))
        out_img = Image.fromarray(np.dstack([up_rgb, up_a]), "RGBA")
    else:
        out_img = Image.fromarray(up_rgb, "RGB")

    # 원포맷 보존 재인코딩(D3DX8 는 content magic 로드 → 더 큰 치수 드롭인 가능)
    dst = out_dir / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    suf = src.suffix.lower()
    if suf == ".jpg" or suf == ".jpeg":
        out_img.convert("RGB").save(dst, "JPEG", quality=95)
    elif suf == ".png":
        out_img.save(dst, "PNG")
    elif suf == ".tga":
        out_img.save(dst, "TGA")
    else:  # .bmp 등
        # BMP 는 알파 미보존 → 알파 있으면 32bpp 보존 위해 TGA 가 아니라 BMP(RGB)로
        out_img.convert("RGB" if not has_alpha else "RGBA").save(dst, "BMP")

    # 미리보기 PNG
    prev = out_dir / "_preview" / (rel.replace("/", "_") + ".png")
    prev.parent.mkdir(parents=True, exist_ok=True)
    out_img.save(prev, "PNG")

    return {"rel": rel, "fmt": fmt, "mode": mode_in, "src": f"{w}x{h}",
            "scale": eff, "out": f"{W}x{H}", "sec": dt,
            "bytes": dst.stat().st_size}


def deploy_with_backup(rels: list[str], overlay_img_dir: Path, backup_root: Path) -> dict:
    deployed, grew = 0, 0
    for tree in DEPLOY_DIRS:
        for rel in rels:
            up = overlay_img_dir / rel
            if not up.exists():
                continue
            dst = tree / rel
            if dst.exists():
                tag = "dist" if "dist" in tree.parts else "vendor"
                bak = backup_root / tag / rel
                if not bak.exists():
                    bak.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(dst, bak)
                grew += up.stat().st_size - dst.stat().st_size
            else:
                dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(up, dst)
            deployed += 1
    return {"deployed": deployed, "bytes_grew": grew}


def build_upsampler(model_name: str, scale: int):
    from realesrgan import RealESRGANer
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan.archs.srvgg_arch import SRVGGNetCompact

    weights = REPO / ".omo/work/remaster/weights"
    if model_name == "anime":
        path = weights / "RealESRGAN_x4plus_anime_6B.pth"
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=6,
                        num_grow_ch=32, scale=4)
    else:  # x4plus (사진/일반)
        path = weights / "RealESRGAN_x4plus.pth"
        model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23,
                        num_grow_ch=32, scale=4)
    return RealESRGANer(scale=4, model_path=str(path), model=model,
                        tile=256, tile_pad=10, half=False, device="cpu")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scale", type=int, default=4)
    ap.add_argument("--model", choices=["x4plus", "anime"], default="x4plus")
    ap.add_argument("--out", default=".omo/work/remaster/ai-texture-overlay")
    ap.add_argument("--deploy", action="store_true")
    ap.add_argument("--backup", default=".omo/work/remaster/ai-texture-backup-2026-06-26")
    ap.add_argument("--list", action="store_true", help="대상 목록만 출력")
    ap.add_argument("--only", default=None, help="콤마구분 rel 부분일치 필터(샘플용)")
    args = ap.parse_args()

    targets = HIVALUE_SET
    if args.only:
        keys = args.only.split(",")
        targets = [r for r in targets if any(k in r for k in keys)]
    if args.list:
        print(json.dumps({"targets": targets, "n": len(targets)}, indent=1))
        return 0

    out_dir = REPO / args.out / "data/image"
    upsampler = build_upsampler(args.model, args.scale)

    done, errs = [], []
    for rel in targets:
        try:
            done.append(process_one(rel, upsampler, args.scale, out_dir))
        except Exception as e:
            errs.append({"rel": rel, "err": repr(e)})

    total_sec = round(sum(d["sec"] for d in done), 1)
    result = {"model": args.model, "scale": args.scale, "upscaled": len(done),
              "errors": errs, "total_sec": total_sec, "out": str(out_dir),
              "samples": done}
    if args.deploy:
        rels = [d["rel"] for d in done]
        result["deploy"] = deploy_with_backup(rels, out_dir, REPO / args.backup)
    print(json.dumps(result, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
