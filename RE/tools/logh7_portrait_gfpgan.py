"""LOGH VII 초상화 AI 얼굴복원 (GFPGAN v1.4, CPU).

파이프라인: Face/*.tcf 디코드 PNG(64x80) -> GFPGAN face restore (+upscale) -> 복원 PNG 저장.
배경 업샘플러(Real-ESRGAN)는 CPU 비용/불안정 때문에 끈다(None). 얼굴만 복원·업스케일한다.

사용:
  python -m tools.logh7_portrait_gfpgan --in-dir <raw_png_dir> --out-dir <out> \
      --weights <GFPGANv1.4.pth> --upscale 2 --indices 209,206,85,...
"""
from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--weights", required=True)
    ap.add_argument("--upscale", type=int, default=2)
    ap.add_argument("--indices", default="", help="쉼표구분 글로벌 인덱스(미지정시 in-dir 전체)")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    from gfpgan import GFPGANer

    restorer = GFPGANer(
        model_path=args.weights,
        upscale=args.upscale,
        arch="clean",
        channel_multiplier=2,
        bg_upsampler=None,  # 배경 업샘플 끔(얼굴만)
    )

    in_dir = Path(args.in_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.indices.strip():
        names = [f"{int(i):04d}.png" for i in args.indices.split(",") if i.strip()]
        files = [in_dir / n for n in names if (in_dir / n).exists()]
    else:
        files = sorted(in_dir.glob("*.png"))
    if args.limit:
        files = files[: args.limit]

    ok = 0
    for f in files:
        img = cv2.imread(str(f), cv2.IMREAD_COLOR)
        if img is None:
            print(f"skip(unreadable): {f.name}")
            continue
        # has_aligned=False -> 내부 얼굴검출+정렬. 검출 실패 가능성 대비해 결과 확인.
        _, _, restored = restorer.enhance(
            img, has_aligned=False, only_center_face=True, paste_back=True
        )
        if restored is None:
            print(f"no-face: {f.name} (검출 실패)")
            continue
        cv2.imwrite(str(out_dir / f.name), restored)
        ok += 1
        print(f"restored: {f.name} {img.shape[1]}x{img.shape[0]} -> {restored.shape[1]}x{restored.shape[0]}")
    print(f"DONE restored={ok}/{len(files)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
