"""
logh7_portrait_pixelmatch.py
NCC (normalized cross-correlation) portrait matcher.

CLI:
    python tools/logh7_portrait_pixelmatch.py --ref <img> --pool <dir> --topk 8

API:
    from tools.logh7_portrait_pixelmatch import match_portrait
    results = match_portrait(ref_path, pool_dir, topk=8)
    # returns list of (filename_or_key, ncc_score) sorted descending
"""

import argparse
import os
import glob
import numpy as np
from PIL import Image

MATCH_W = 64
MATCH_H = 80


def _load_gray(path: str) -> np.ndarray:
    """Load image, convert to grayscale float32, resize to MATCH_W x MATCH_H."""
    img = Image.open(path).convert("L").resize((MATCH_W, MATCH_H), Image.LANCZOS)
    arr = np.asarray(img, dtype=np.float32)
    return arr


def _ncc(a: np.ndarray, b: np.ndarray) -> float:
    """Normalized cross-correlation in [-1, 1] between two same-shape arrays."""
    a_zero = a - a.mean()
    b_zero = b - b.mean()
    denom = (np.linalg.norm(a_zero) * np.linalg.norm(b_zero))
    if denom < 1e-9:
        return 0.0
    return float(np.sum(a_zero * b_zero) / denom)


def match_portrait(ref_path: str, pool_dir: str, topk: int = 8) -> list:
    """
    Match a reference portrait against all PNGs in pool_dir (recursive).

    Returns:
        list of (key, score) tuples, sorted by score descending, length <= topk.
        key is the relative path from pool_dir (with forward slashes).
    """
    ref_arr = _load_gray(ref_path)

    candidates = []
    pool_dir_norm = os.path.normpath(pool_dir)
    for fpath in glob.glob(os.path.join(pool_dir, "**", "*.png"), recursive=True):
        rel = os.path.relpath(fpath, pool_dir_norm).replace("\\", "/")
        candidates.append((rel, fpath))
    # Also match top-level PNGs (glob ** already covers them, but be safe)

    scores = []
    for key, fpath in candidates:
        try:
            arr = _load_gray(fpath)
            score = _ncc(ref_arr, arr)
            scores.append((key, score))
        except Exception:
            pass  # skip corrupt/unreadable files

    scores.sort(key=lambda x: x[1], reverse=True)
    return scores[:topk]


def main():
    parser = argparse.ArgumentParser(
        description="NCC portrait matcher for LOGH VII decoded atlas pools"
    )
    parser.add_argument("--ref", required=True, help="Reference image path")
    parser.add_argument("--pool", required=True, help="Directory of candidate PNGs")
    parser.add_argument("--topk", type=int, default=8, help="Return top K matches (default 8)")
    args = parser.parse_args()

    if not os.path.isfile(args.ref):
        print(f"ERROR: ref not found: {args.ref}")
        return
    if not os.path.isdir(args.pool):
        print(f"ERROR: pool dir not found: {args.pool}")
        return

    results = match_portrait(args.ref, args.pool, topk=args.topk)
    if not results:
        print("No candidates found in pool.")
        return

    print(f"Reference: {args.ref}")
    print(f"Pool:      {args.pool}")
    print(f"Top {args.topk} matches (NCC):")
    for rank, (key, score) in enumerate(results, 1):
        print(f"  {rank:2d}. {key:<30s}  NCC={score:.4f}")


if __name__ == "__main__":
    main()
