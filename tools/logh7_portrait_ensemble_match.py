from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

MATCH_SIZE = (64, 80)
ACCEPT_SCORE = 0.86
ACCEPT_GAP = 0.08
CANDIDATE_SCORE = 0.72
CANDIDATE_GAP = 0.04

WEIGHTS = {
    "ncc_gray": 0.18,
    "ncc_gray_mirror": 0.06,
    "ncc_center": 0.10,
    "ncc_upper": 0.04,
    "ncc_lower": 0.03,
    "ncc_left": 0.03,
    "ncc_right": 0.03,
    "ahash": 0.06,
    "dhash": 0.06,
    "gradient_hash": 0.05,
    "gray_hist": 0.06,
    "color_hist": 0.10,
    "edge_hist": 0.07,
    "edge_density": 0.03,
    "rgb_moments": 0.05,
    "luma_moments": 0.04,
    "spatial_color_grid": 0.11,
}


def _open_rgb(path: Path, size: tuple[int, int] = MATCH_SIZE) -> np.ndarray:
    img = Image.open(path).convert("RGB").resize(size, Image.Resampling.LANCZOS)
    return np.asarray(img, dtype=np.float64) / 255.0


def _gray(rgb: np.ndarray) -> np.ndarray:
    return rgb[:, :, 0] * 0.299 + rgb[:, :, 1] * 0.587 + rgb[:, :, 2] * 0.114


def _ncc(a: np.ndarray, b: np.ndarray) -> float:
    av = a - float(a.mean())
    bv = b - float(b.mean())
    denom = float(np.sqrt((av * av).sum() * (bv * bv).sum()))
    if denom <= 1e-12:
        return 0.0
    return max(0.0, min(1.0, (float((av * bv).sum() / denom) + 1.0) / 2.0))


def _region_ncc(a: np.ndarray, b: np.ndarray, region: str) -> float:
    h, w = a.shape
    if region == "center":
        return _ncc(a[h // 5 : h - h // 5, w // 5 : w - w // 5], b[h // 5 : h - h // 5, w // 5 : w - w // 5])
    if region == "upper":
        return _ncc(a[: h // 2, :], b[: h // 2, :])
    if region == "lower":
        return _ncc(a[h // 2 :, :], b[h // 2 :, :])
    if region == "left":
        return _ncc(a[:, : w // 2], b[:, : w // 2])
    if region == "right":
        return _ncc(a[:, w // 2 :], b[:, w // 2 :])
    return _ncc(a, b)


def _resize_gray_bits(gray: np.ndarray, width: int, height: int) -> np.ndarray:
    img = Image.fromarray(np.uint8(np.clip(gray * 255.0, 0, 255))).resize((width, height), Image.Resampling.LANCZOS)
    return np.asarray(img, dtype=np.float64) / 255.0


def _ahash(gray: np.ndarray) -> np.ndarray:
    small = _resize_gray_bits(gray, 8, 8)
    return small > float(small.mean())


def _dhash(gray: np.ndarray) -> np.ndarray:
    small = _resize_gray_bits(gray, 9, 8)
    return small[:, 1:] > small[:, :-1]


def _gradient_hash(gray: np.ndarray) -> np.ndarray:
    gy, gx = np.gradient(gray)
    mag = np.hypot(gx, gy)
    small = _resize_gray_bits(mag / (float(mag.max()) + 1e-12), 8, 8)
    return small > float(small.mean())


def _hash_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return 1.0 - float(np.count_nonzero(a != b)) / float(a.size)


def _hist_similarity(a: np.ndarray, b: np.ndarray, bins: int = 32) -> float:
    ha = _hist_vector(a, bins=bins)
    hb = _hist_vector(b, bins=bins)
    return float(np.minimum(ha, hb).sum())


def _hist_vector(a: np.ndarray, bins: int = 32) -> np.ndarray:
    hist, _ = np.histogram(a, bins=bins, range=(0.0, 1.0), density=False)
    hist = hist.astype(np.float64)
    return hist / (float(hist.sum()) + 1e-12)


def _color_hist_vector(a: np.ndarray, bins: int = 12) -> np.ndarray:
    parts = [_hist_vector(a[:, :, channel], bins=bins) for channel in range(3)]
    hist = np.concatenate(parts)
    return hist / (float(hist.sum()) + 1e-12)


def _hist_intersection(ha: np.ndarray, hb: np.ndarray) -> float:
    ha = ha.astype(np.float64)
    hb = hb.astype(np.float64)
    return float(np.minimum(ha, hb).sum())


def _color_hist_similarity(a: np.ndarray, b: np.ndarray, bins: int = 12) -> float:
    scores = [_hist_similarity(a[:, :, channel], b[:, :, channel], bins=bins) for channel in range(3)]
    return float(sum(scores) / len(scores))


def _edge_hist(gray: np.ndarray, bins: int = 12) -> np.ndarray:
    gy, gx = np.gradient(gray)
    mag = np.hypot(gx, gy)
    angle = (np.arctan2(gy, gx) + math.pi) / (2.0 * math.pi)
    hist, _ = np.histogram(angle, bins=bins, range=(0.0, 1.0), weights=mag)
    hist = hist.astype(np.float64)
    return hist / (float(hist.sum()) + 1e-12)


def _vector_intersection(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.minimum(a, b).sum())


def _edge_density_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return 1.0 - min(1.0, abs(_edge_density_value(a) - _edge_density_value(b)))


def _edge_density_value(x: np.ndarray) -> float:
    gy, gx = np.gradient(x)
    mag = np.hypot(gx, gy)
    return float((mag > (float(mag.mean()) + float(mag.std()))).mean())


def _moment_similarity(a: np.ndarray, b: np.ndarray) -> float:
    va = np.array([float(a.mean()), float(a.std()), float(np.median(a))], dtype=np.float64)
    vb = np.array([float(b.mean()), float(b.std()), float(np.median(b))], dtype=np.float64)
    distance = float(np.linalg.norm(va - vb))
    return max(0.0, 1.0 - distance)


def _rgb_moment_similarity(a: np.ndarray, b: np.ndarray) -> float:
    vals = []
    for channel in range(3):
        vals.append(_moment_similarity(a[:, :, channel], b[:, :, channel]))
    return float(sum(vals) / len(vals))


def _spatial_color_grid_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return max(0.0, min(1.0, float(np.dot(_spatial_color_grid(a), _spatial_color_grid(b)))))


def _spatial_color_grid(x: np.ndarray) -> np.ndarray:
    img = Image.fromarray(np.uint8(np.clip(x * 255.0, 0, 255))).resize((8, 10), Image.Resampling.BILINEAR)
    arr = np.asarray(img, dtype=np.float64).reshape(-1) / 255.0
    norm = float(np.linalg.norm(arr))
    return arr / (norm + 1e-12)


def _moment_vector(a: np.ndarray) -> np.ndarray:
    return np.array([float(a.mean()), float(a.std()), float(np.median(a))], dtype=np.float64)


def _rgb_moment_vector(a: np.ndarray) -> np.ndarray:
    return np.concatenate([_moment_vector(a[:, :, channel]) for channel in range(3)])


def _moment_vector_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return max(0.0, 1.0 - float(np.linalg.norm(a - b)))


def _image_profile(rgb: np.ndarray) -> dict[str, Any]:
    gray = _gray(rgb)
    mirror_rgb = rgb[:, ::-1, :]
    mirror_gray = gray[:, ::-1]
    return {
        "rgb": rgb,
        "gray": gray,
        "mirror_rgb": mirror_rgb,
        "mirror_gray": mirror_gray,
        "ahash": _ahash(gray),
        "ahash_mirror": _ahash(mirror_gray),
        "dhash": _dhash(gray),
        "dhash_mirror": _dhash(mirror_gray),
        "gradient_hash": _gradient_hash(gray),
        "gradient_hash_mirror": _gradient_hash(mirror_gray),
        "gray_hist": _hist_vector(gray),
        "color_hist": _color_hist_vector(rgb),
        "color_hist_mirror": _color_hist_vector(mirror_rgb),
        "edge_hist": _edge_hist(gray),
        "edge_hist_mirror": _edge_hist(mirror_gray),
        "edge_density": _edge_density_value(gray),
        "edge_density_mirror": _edge_density_value(mirror_gray),
        "rgb_moments": _rgb_moment_vector(rgb),
        "rgb_moments_mirror": _rgb_moment_vector(mirror_rgb),
        "luma_moments": _moment_vector(gray),
        "spatial_color_grid": _spatial_color_grid(rgb),
        "spatial_color_grid_mirror": _spatial_color_grid(mirror_rgb),
    }


def _feature_scores(ref: dict[str, Any], cand: dict[str, Any]) -> dict[str, float]:
    rg = ref["gray"]
    cg = cand["gray"]
    rg_mirror = ref["mirror_gray"]
    scores = {
        "ncc_gray": max(_ncc(rg, cg), _ncc(rg_mirror, cg)),
        "ncc_gray_mirror": _ncc(rg_mirror, cg),
        "ncc_center": max(_region_ncc(rg, cg, "center"), _region_ncc(rg_mirror, cg, "center")),
        "ncc_upper": max(_region_ncc(rg, cg, "upper"), _region_ncc(rg_mirror, cg, "upper")),
        "ncc_lower": max(_region_ncc(rg, cg, "lower"), _region_ncc(rg_mirror, cg, "lower")),
        "ncc_left": max(_region_ncc(rg, cg, "left"), _region_ncc(rg_mirror, cg, "left")),
        "ncc_right": max(_region_ncc(rg, cg, "right"), _region_ncc(rg_mirror, cg, "right")),
        "ahash": max(_hash_similarity(ref["ahash"], cand["ahash"]), _hash_similarity(ref["ahash_mirror"], cand["ahash"])),
        "dhash": max(_hash_similarity(ref["dhash"], cand["dhash"]), _hash_similarity(ref["dhash_mirror"], cand["dhash"])),
        "gradient_hash": max(
            _hash_similarity(ref["gradient_hash"], cand["gradient_hash"]),
            _hash_similarity(ref["gradient_hash_mirror"], cand["gradient_hash"]),
        ),
        "gray_hist": _hist_intersection(ref["gray_hist"], cand["gray_hist"]),
        "color_hist": max(_hist_intersection(ref["color_hist"], cand["color_hist"]), _hist_intersection(ref["color_hist_mirror"], cand["color_hist"])),
        "edge_hist": max(_vector_intersection(ref["edge_hist"], cand["edge_hist"]), _vector_intersection(ref["edge_hist_mirror"], cand["edge_hist"])),
        "edge_density": max(
            1.0 - min(1.0, abs(ref["edge_density"] - cand["edge_density"])),
            1.0 - min(1.0, abs(ref["edge_density_mirror"] - cand["edge_density"])),
        ),
        "rgb_moments": max(
            _moment_vector_similarity(ref["rgb_moments"], cand["rgb_moments"]),
            _moment_vector_similarity(ref["rgb_moments_mirror"], cand["rgb_moments"]),
        ),
        "luma_moments": _moment_vector_similarity(ref["luma_moments"], cand["luma_moments"]),
        "spatial_color_grid": max(
            float(np.dot(ref["spatial_color_grid"], cand["spatial_color_grid"])),
            float(np.dot(ref["spatial_color_grid_mirror"], cand["spatial_color_grid"])),
        ),
    }
    return {k: round(float(v), 6) for k, v in scores.items()}


def aggregate_score(scores: dict[str, float]) -> float:
    total_weight = sum(WEIGHTS.values())
    return float(sum(scores[k] * WEIGHTS[k] for k in WEIGHTS) / total_weight)


def _quick_score(ref: dict[str, Any], cand: dict[str, Any]) -> float:
    rg = ref["gray"]
    cg = cand["gray"]
    rg_mirror = ref["mirror_gray"]
    ncc = max(_ncc(rg, cg), _ncc(rg_mirror, cg))
    ahash = max(_hash_similarity(ref["ahash"], cand["ahash"]), _hash_similarity(ref["ahash_mirror"], cand["ahash"]))
    dhash = max(_hash_similarity(ref["dhash"], cand["dhash"]), _hash_similarity(ref["dhash_mirror"], cand["dhash"]))
    color = max(_hist_intersection(ref["color_hist"], cand["color_hist"]), _hist_intersection(ref["color_hist_mirror"], cand["color_hist"]))
    spatial = max(float(np.dot(ref["spatial_color_grid"], cand["spatial_color_grid"])), float(np.dot(ref["spatial_color_grid_mirror"], cand["spatial_color_grid"])))
    return float(ncc * 0.35 + ahash * 0.12 + dhash * 0.12 + color * 0.18 + spatial * 0.23)


def _reference_variants(path: Path) -> list[dict[str, Any]]:
    img = Image.open(path).convert("RGB")
    width, height = img.size
    boxes = [("full", (0, 0, width, height))]
    if width > 0 and height > 0:
        side = min(width, height)
        x0 = (width - side) // 2
        y0 = (height - side) // 2
        boxes.append(("center_square", (x0, y0, x0 + side, y0 + side)))
        boxes.append(("upper_half", (0, 0, width, max(1, height // 2))))
        boxes.append(("lower_half", (0, height // 2, width, height)))
        boxes.append(("left_half", (0, 0, max(1, width // 2), height)))
        boxes.append(("right_half", (width // 2, 0, width, height)))
    variants = []
    for label, box in boxes:
        crop = img.crop(box).resize(MATCH_SIZE, Image.Resampling.LANCZOS)
        variants.append({"variant": label, "profile": _image_profile(np.asarray(crop, dtype=np.float64) / 255.0)})
    return variants


def load_portrait_atlas(portraits_dir: Path) -> dict[str, dict[str, Any]]:
    atlas: dict[str, dict[str, Any]] = {}
    for path in sorted(portraits_dir.glob("*.png")):
        match = re.search(r"(\d+)", path.stem)
        key = f"{int(match.group(1)):04d}" if match else path.stem
        atlas[key] = {"path": str(path), "profile": _image_profile(_open_rgb(path))}
    return atlas


def _status(best: float, gap: float) -> str:
    if best >= ACCEPT_SCORE and gap >= ACCEPT_GAP:
        return "accepted"
    if best >= CANDIDATE_SCORE and gap >= CANDIDATE_GAP:
        return "candidate"
    return "rejected"


def rank_reference(ref_entry: dict[str, Any], atlas: dict[str, dict[str, Any]], topk: int, detail_pool: int) -> dict[str, Any]:
    ref_path = Path(ref_entry["local_path"])
    variants = _reference_variants(ref_path)
    coarse_by_slot: dict[str, dict[str, Any]] = {}
    for slot, cand in atlas.items():
        for variant in variants:
            quick = _quick_score(variant["profile"], cand["profile"])
            payload = {
                "slot": slot,
                "portrait_path": cand["path"],
                "variant": variant["variant"],
                "quick_score": round(quick, 6),
                "variant_profile": variant["profile"],
                "candidate_profile": cand["profile"],
            }
            if slot not in coarse_by_slot or payload["quick_score"] > coarse_by_slot[slot]["quick_score"]:
                coarse_by_slot[slot] = payload
    coarse = sorted(coarse_by_slot.values(), key=lambda x: x["quick_score"], reverse=True)
    ranked = []
    for payload in coarse[: max(detail_pool, topk)]:
        scores = _feature_scores(payload["variant_profile"], payload["candidate_profile"])
        aggregate = aggregate_score(scores)
        ranked.append(
            {
                "slot": payload["slot"],
                "portrait_path": payload["portrait_path"],
                "variant": payload["variant"],
                "quick_score": payload["quick_score"],
                "score": round(aggregate, 6),
                "feature_scores": scores,
            }
        )
    ranked.sort(key=lambda x: x["score"], reverse=True)
    best = ranked[0]["score"] if ranked else 0.0
    second = ranked[1]["score"] if len(ranked) > 1 else 0.0
    gap = best - second
    return {
        "reference": {
            "identifier": ref_entry.get("identifier"),
            "title": ref_entry.get("title"),
            "role": ref_entry.get("role"),
            "source_name": ref_entry.get("source_name"),
            "source_url": ref_entry.get("source_url"),
            "local_path": ref_entry.get("local_path"),
            "confidence_cap": ref_entry.get("confidence_cap"),
            "width": ref_entry.get("width"),
            "height": ref_entry.get("height"),
        },
        "status": _status(best, gap),
        "best_score": round(best, 6),
        "runner_up_score": round(second, 6),
        "gap": round(gap, 6),
        "top": ranked[:topk],
    }


def run_match(ref_manifest_path: Path, portraits_dir: Path, out_path: Path, topk: int = 8, limit: int | None = None) -> dict[str, Any]:
    manifest = json.loads(ref_manifest_path.read_text(encoding="utf-8"))
    refs = [e for e in manifest.get("entries", []) if e.get("status") in {"downloaded", "exists"} and e.get("local_path")]
    if limit is not None:
        refs = refs[:limit]
    atlas = load_portrait_atlas(portraits_dir)
    if not atlas:
        raise ValueError(f"no portrait PNG files found under {portraits_dir}")
    results = [rank_reference(ref, atlas, topk=topk, detail_pool=64) for ref in refs]
    counts = {
        "references": len(refs),
        "portraits": len(atlas),
        "accepted": sum(1 for r in results if r["status"] == "accepted"),
        "candidate": sum(1 for r in results if r["status"] == "candidate"),
        "rejected": sum(1 for r in results if r["status"] == "rejected"),
    }
    output = {
        "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "_method": "deterministic ensemble: NCC regions, mirror NCC, aHash, dHash, gradient hash, color/gray histograms, edge histogram, edge density, color/luma moments, spatial color grid",
        "_thresholds": {
            "accept_score": ACCEPT_SCORE,
            "accept_gap": ACCEPT_GAP,
            "candidate_score": CANDIDATE_SCORE,
            "candidate_gap": CANDIDATE_GAP,
        },
        "_weights": WEIGHTS,
        "_counts": counts,
        "results": results,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Score reference images against LOGH VII portrait slots with a deterministic feature ensemble.")
    ap.add_argument("--refs", type=Path, required=True)
    ap.add_argument("--portraits", type=Path, default=Path("content/roster/portraits"))
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--topk", type=int, default=8)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args(argv)

    output = run_match(args.refs, args.portraits, args.out, topk=args.topk, limit=args.limit)
    print(json.dumps(output["_counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
