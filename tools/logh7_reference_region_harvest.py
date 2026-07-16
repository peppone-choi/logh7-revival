from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

DEFAULT_SIZE = (64, 80)


def _safe(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "_", value)
    return value[:140] or "image"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _gray_stats(img: Image.Image) -> dict[str, float]:
    arr = np.asarray(img.convert("L"), dtype=np.float64) / 255.0
    gy, gx = np.gradient(arr)
    edge = np.hypot(gx, gy)
    return {
        "std": float(arr.std()),
        "edge_mean": float(edge.mean()),
        "entropy_hint": float(-(np.histogram(arr, bins=32, range=(0, 1), density=False)[0] / arr.size + 1e-12).clip(min=1e-12).dot(np.log2((np.histogram(arr, bins=32, range=(0, 1), density=False)[0] / arr.size + 1e-12).clip(min=1e-12)))),
    }


def _crop_boxes(width: int, height: int) -> list[tuple[str, tuple[int, int, int, int]]]:
    boxes: list[tuple[str, tuple[int, int, int, int]]] = [("full", (0, 0, width, height))]
    target = DEFAULT_SIZE[0] / DEFAULT_SIZE[1]
    scales = [1.0, 0.82, 0.66, 0.50, 0.38]
    positions = [0.0, 0.5, 1.0]
    seen: set[tuple[int, int, int, int]] = set()
    for scale in scales:
        crop_h = max(16, int(height * scale))
        crop_w = max(13, int(crop_h * target))
        if crop_w > width:
            crop_w = width
            crop_h = max(16, int(crop_w / target))
        if crop_h > height:
            crop_h = height
            crop_w = max(13, int(crop_h * target))
        for py in positions:
            for px in positions:
                x0 = int((width - crop_w) * px)
                y0 = int((height - crop_h) * py)
                box = (x0, y0, x0 + crop_w, y0 + crop_h)
                if box in seen or box[2] <= box[0] or box[3] <= box[1]:
                    continue
                seen.add(box)
                boxes.append((f"crop_s{scale:.2f}_x{px:.1f}_y{py:.1f}", box))
    return boxes


def harvest_regions(
    manifest_path: Path,
    out_path: Path,
    root: Path,
    limit_refs: int | None = None,
    max_regions_per_ref: int = 18,
    min_std: float = 0.04,
    min_edge: float = 0.008,
) -> dict[str, Any]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    refs = [e for e in manifest.get("entries", []) if e.get("status") in {"downloaded", "exists"} and e.get("local_path")]
    if limit_refs is not None:
        refs = refs[:limit_refs]
    entries: list[dict[str, Any]] = []
    root.mkdir(parents=True, exist_ok=True)
    for ref_i, ref in enumerate(refs, 1):
        src = Path(ref["local_path"])
        try:
            img = Image.open(src).convert("RGB")
        except Exception as exc:
            entries.append({"status": "error", "source_name": ref.get("source_name"), "local_path": str(src), "error": repr(exc)})
            continue
        scored: list[tuple[float, str, tuple[int, int, int, int], dict[str, float]]] = []
        for label, box in _crop_boxes(img.width, img.height):
            crop = img.crop(box).resize(DEFAULT_SIZE, Image.Resampling.LANCZOS)
            stats = _gray_stats(crop)
            if label != "full" and (stats["std"] < min_std or stats["edge_mean"] < min_edge):
                continue
            score = stats["std"] * 3.0 + stats["edge_mean"] * 8.0 + math.log2(stats["entropy_hint"] + 1.0) * 0.2
            scored.append((score, label, box, stats))
        scored.sort(key=lambda x: x[0], reverse=True)
        for rank, (_, label, box, stats) in enumerate(scored[:max_regions_per_ref], 1):
            crop = img.crop(box).resize(DEFAULT_SIZE, Image.Resampling.LANCZOS)
            dest_dir = root / f"{ref_i:04d}_{_safe(str(ref.get('source_name') or src.stem))}"
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / f"{rank:02d}_{label}.png"
            if not dest.exists():
                crop.save(dest)
            row = dict(ref)
            row.update(
                {
                    "identifier": ref.get("identifier", "reference") + "_regions",
                    "role": str(ref.get("role", "reference")) + "_region_crop",
                    "source_name": f"{ref.get('source_name')}#{label}",
                    "source_image_path": str(src),
                    "local_path": str(dest),
                    "status": "exists",
                    "crop_box": box,
                    "crop_rank": rank,
                    "width": DEFAULT_SIZE[0],
                    "height": DEFAULT_SIZE[1],
                    "format": "PNG",
                    "bytes": dest.stat().st_size,
                    "sha256": _sha256(dest),
                    "region_stats": {k: round(v, 6) for k, v in stats.items()},
                }
            )
            entries.append(row)
    output = {
        "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "_source_manifest": str(manifest_path),
        "_counts": {"source_refs": len(refs), "regions": len(entries)},
        "entries": entries,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Create portrait-aspect region crops from reference image manifests.")
    ap.add_argument("--manifest", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--limit-refs", type=int)
    ap.add_argument("--max-regions-per-ref", type=int, default=18)
    args = ap.parse_args(argv)
    result = harvest_regions(
        manifest_path=args.manifest,
        out_path=args.out,
        root=args.root,
        limit_refs=args.limit_refs,
        max_regions_per_ref=args.max_regions_per_ref,
    )
    print(json.dumps(result["_counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
