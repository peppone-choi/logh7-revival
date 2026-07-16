from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel, CLIPModel, CLIPProcessor

MATCH_SIZE = (224, 224)
DINO_WEIGHT = 0.58
CLIP_WEIGHT = 0.42
ACCEPT_SCORE = 0.86
ACCEPT_GAP = 0.035
CANDIDATE_SCORE = 0.80
CANDIDATE_GAP = 0.015


@dataclass(frozen=True)
class ImageItem:
    key: str
    path: Path
    title: str | None = None
    variant: str = "full"


def pick_device(requested: str) -> torch.device:
    if requested != "auto":
        return torch.device(requested)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def open_rgb(path: Path) -> Image.Image:
    return Image.open(path).convert("RGB")


def reference_variants(path: Path) -> list[tuple[str, Image.Image]]:
    img = open_rgb(path)
    width, height = img.size
    boxes = [("full", (0, 0, width, height))]
    if width > 0 and height > 0:
        side = min(width, height)
        x0 = (width - side) // 2
        y0 = (height - side) // 2
        boxes.extend(
            [
                ("center_square", (x0, y0, x0 + side, y0 + side)),
                ("upper_half", (0, 0, width, max(1, height // 2))),
                ("lower_half", (0, height // 2, width, height)),
                ("left_half", (0, 0, max(1, width // 2), height)),
                ("right_half", (width // 2, 0, width, height)),
            ]
        )
    return [(label, img.crop(box).resize(MATCH_SIZE, Image.Resampling.LANCZOS)) for label, box in boxes]


def load_refs(manifest_path: Path, limit: int | None) -> list[dict[str, Any]]:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    refs = [e for e in manifest.get("entries", []) if e.get("status") in {"downloaded", "exists"} and e.get("local_path")]
    return refs[:limit] if limit is not None else refs


def load_portrait_items(portraits_dir: Path) -> list[ImageItem]:
    items: list[ImageItem] = []
    for path in sorted(portraits_dir.glob("*.png")):
        match = re.search(r"(\d+)", path.stem)
        key = f"{int(match.group(1)):04d}" if match else path.stem
        items.append(ImageItem(key=key, path=path))
    if not items:
        raise ValueError(f"no portrait PNG files found under {portraits_dir}")
    return items


def normalize_matrix(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return matrix / np.maximum(norms, 1e-12)


class DinoEmbedder:
    def __init__(self, model_name: str, device: torch.device):
        self.model_name = model_name
        self.device = device
        self.processor = AutoImageProcessor.from_pretrained(model_name)
        self.model = AutoModel.from_pretrained(model_name).to(device)
        self.model.eval()

    def encode(self, images: list[Image.Image], batch_size: int) -> np.ndarray:
        chunks: list[np.ndarray] = []
        for start in range(0, len(images), batch_size):
            batch = images[start : start + batch_size]
            inputs = self.processor(images=batch, return_tensors="pt").to(self.device)
            with torch.inference_mode():
                outputs = self.model(**inputs)
                if getattr(outputs, "pooler_output", None) is not None:
                    features = outputs.pooler_output
                else:
                    features = outputs.last_hidden_state[:, 0, :]
            chunks.append(features.detach().float().cpu().numpy())
        return normalize_matrix(np.concatenate(chunks, axis=0))


class ClipEmbedder:
    def __init__(self, model_name: str, device: torch.device):
        self.model_name = model_name
        self.device = device
        self.processor = CLIPProcessor.from_pretrained(model_name)
        self.model = CLIPModel.from_pretrained(model_name).to(device)
        self.model.eval()

    def encode(self, images: list[Image.Image], batch_size: int) -> np.ndarray:
        chunks: list[np.ndarray] = []
        for start in range(0, len(images), batch_size):
            batch = images[start : start + batch_size]
            inputs = self.processor(images=batch, return_tensors="pt").to(self.device)
            with torch.inference_mode():
                features = self.model.get_image_features(**inputs)
            chunks.append(features.detach().float().cpu().numpy())
        return normalize_matrix(np.concatenate(chunks, axis=0))


def build_reference_images(refs: list[dict[str, Any]]) -> tuple[list[Image.Image], list[tuple[int, str]]]:
    images: list[Image.Image] = []
    owners: list[tuple[int, str]] = []
    for ref_index, ref in enumerate(refs):
        for variant, image in reference_variants(Path(ref["local_path"])):
            images.append(image)
            owners.append((ref_index, variant))
    return images, owners


def build_portrait_images(items: list[ImageItem]) -> list[Image.Image]:
    return [open_rgb(item.path).resize(MATCH_SIZE, Image.Resampling.LANCZOS) for item in items]


def status(best: float, gap: float) -> str:
    if best >= ACCEPT_SCORE and gap >= ACCEPT_GAP:
        return "accepted"
    if best >= CANDIDATE_SCORE and gap >= CANDIDATE_GAP:
        return "candidate"
    return "rejected"


def reference_payload(ref_entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "identifier": ref_entry.get("identifier"),
        "title": ref_entry.get("title"),
        "role": ref_entry.get("role"),
        "source_name": ref_entry.get("source_name"),
        "source_url": ref_entry.get("source_url"),
        "local_path": ref_entry.get("local_path"),
        "confidence_cap": ref_entry.get("confidence_cap"),
        "width": ref_entry.get("width"),
        "height": ref_entry.get("height"),
        "game": ref_entry.get("game"),
        "faction": ref_entry.get("faction"),
        "name_ja": ref_entry.get("name_ja"),
        "name_ko": ref_entry.get("name_ko") or ref_entry.get("name_kr"),
        "name_kr": ref_entry.get("name_kr") or ref_entry.get("name_ko"),
        "name_en": ref_entry.get("name_en"),
    }


def combine_scores(dino: np.ndarray | None, clip: np.ndarray | None) -> np.ndarray:
    if dino is not None and clip is not None:
        return dino * DINO_WEIGHT + clip * CLIP_WEIGHT
    if dino is not None:
        return dino
    if clip is not None:
        return clip
    raise ValueError("at least one model must be enabled")


def run_match(
    refs_path: Path,
    portraits_dir: Path,
    out_path: Path,
    dino_model: str | None,
    clip_model: str | None,
    device_name: str,
    batch_size: int,
    topk: int,
    limit: int | None,
) -> dict[str, Any]:
    refs = load_refs(refs_path, limit)
    portraits = load_portrait_items(portraits_dir)
    if not refs:
        raise ValueError(f"no usable reference entries in {refs_path}")
    device = pick_device(device_name)
    ref_images, owners = build_reference_images(refs)
    portrait_images = build_portrait_images(portraits)

    dino_ref = dino_portrait = None
    clip_ref = clip_portrait = None
    models: dict[str, str] = {}
    if dino_model:
        dino = DinoEmbedder(dino_model, device)
        dino_ref = dino.encode(ref_images, batch_size)
        dino_portrait = dino.encode(portrait_images, batch_size)
        models["dinov2"] = dino_model
    if clip_model:
        clip = ClipEmbedder(clip_model, device)
        clip_ref = clip.encode(ref_images, batch_size)
        clip_portrait = clip.encode(portrait_images, batch_size)
        models["clip"] = clip_model

    dino_cos = dino_ref @ dino_portrait.T if dino_ref is not None and dino_portrait is not None else None
    clip_cos = clip_ref @ clip_portrait.T if clip_ref is not None and clip_portrait is not None else None
    combined = combine_scores(dino_cos, clip_cos)

    by_ref: dict[int, list[dict[str, Any]]] = {i: [] for i in range(len(refs))}
    for variant_index, (ref_index, variant) in enumerate(owners):
        for portrait_index, portrait in enumerate(portraits):
            feature_scores: dict[str, float] = {}
            if dino_cos is not None:
                feature_scores["dinov2_cosine"] = round(float(dino_cos[variant_index, portrait_index]), 6)
            if clip_cos is not None:
                feature_scores["clip_cosine"] = round(float(clip_cos[variant_index, portrait_index]), 6)
            by_ref[ref_index].append(
                {
                    "slot": portrait.key,
                    "portrait_path": str(portrait.path),
                    "variant": variant,
                    "quick_score": round(float(combined[variant_index, portrait_index]), 6),
                    "score": round(float(combined[variant_index, portrait_index]), 6),
                    "feature_scores": feature_scores,
                }
            )

    results = []
    for ref_index, ref in enumerate(refs):
        best_by_slot: dict[str, dict[str, Any]] = {}
        for row in by_ref[ref_index]:
            slot = row["slot"]
            if slot not in best_by_slot or row["score"] > best_by_slot[slot]["score"]:
                best_by_slot[slot] = row
        ranked = sorted(best_by_slot.values(), key=lambda item: item["score"], reverse=True)[:topk]
        best = ranked[0]["score"] if ranked else 0.0
        second = ranked[1]["score"] if len(ranked) > 1 else 0.0
        gap = best - second
        results.append(
            {
                "reference": reference_payload(ref),
                "status": status(best, gap),
                "best_score": round(best, 6),
                "runner_up_score": round(second, 6),
                "gap": round(gap, 6),
                "top": ranked,
            }
        )

    counts = {
        "references": len(refs),
        "portraits": len(portraits),
        "accepted": sum(1 for r in results if r["status"] == "accepted"),
        "candidate": sum(1 for r in results if r["status"] == "candidate"),
        "rejected": sum(1 for r in results if r["status"] == "rejected"),
    }
    output = {
        "_created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "_method": "deep vision embeddings: DINOv2 CLS embedding and CLIP image embedding cosine similarity; reference crop variants max-pooled per slot",
        "_models": models,
        "_device": str(device),
        "_thresholds": {
            "accept_score": ACCEPT_SCORE,
            "accept_gap": ACCEPT_GAP,
            "candidate_score": CANDIDATE_SCORE,
            "candidate_gap": CANDIDATE_GAP,
        },
        "_weights": {"dinov2": DINO_WEIGHT if dino_model and clip_model else (1.0 if dino_model else 0.0), "clip": CLIP_WEIGHT if dino_model and clip_model else (1.0 if clip_model else 0.0)},
        "_counts": counts,
        "results": results,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return output


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rank LOGH VII portraits with DINOv2/CLIP deep image embeddings.")
    parser.add_argument("--refs", type=Path, required=True)
    parser.add_argument("--portraits", type=Path, default=Path("content/roster/portraits"))
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--dino-model", default="facebook/dinov2-small")
    parser.add_argument("--clip-model", default="openai/clip-vit-base-patch32")
    parser.add_argument("--disable-dino", action="store_true")
    parser.add_argument("--disable-clip", action="store_true")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--topk", type=int, default=12)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args(argv)

    output = run_match(
        refs_path=args.refs,
        portraits_dir=args.portraits,
        out_path=args.out,
        dino_model=None if args.disable_dino else args.dino_model,
        clip_model=None if args.disable_clip else args.clip_model,
        device_name=args.device,
        batch_size=args.batch_size,
        topk=args.topk,
        limit=args.limit,
    )
    print(json.dumps(output["_counts"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
