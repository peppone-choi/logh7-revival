from __future__ import annotations

import hashlib
import json
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DIR = PROJECT_ROOT / "client-unity/Assets/ArtSource/original/medals"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "client-unity/Assets/ArtSource/remaster/alliance-medals-4x"
DEFAULT_MANIFEST = PROJECT_ROOT / "server/content/generated/logh7-alliance-medal-upscale-manifest.json"
DEFAULT_SCALE = 4


@dataclass(frozen=True)
class UpscaleArgs:
    source_dir: Path
    output_dir: Path
    manifest: Path
    scale: int


def main() -> None:
    args = parse_args(sys.argv[1:])
    source_dir = args.source_dir
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    source_files = sorted(source_dir.glob("m_f*.png"))
    if len(source_files) != 15:
        raise SystemExit(f"expected 15 Alliance medal PNGs in {source_dir}, found {len(source_files)}")

    entries = [upscale_one(path, output_dir, args.scale) for path in source_files]
    manifest = {
        "id": "logh7-alliance-medal-upscale-manifest",
        "sourceDir": source_dir.as_posix(),
        "outputDir": output_dir.as_posix(),
        "scale": args.scale,
        "method": "Pillow LANCZOS resize plus light UnsharpMask; AI upscale not available in this environment",
        "entryCount": len(entries),
        "entries": entries,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    _ = args.manifest.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"entryCount": len(entries), "outputDir": output_dir.as_posix()}, ensure_ascii=False))


def parse_args(argv: Sequence[str]) -> UpscaleArgs:
    args = UpscaleArgs(
        source_dir=DEFAULT_SOURCE_DIR,
        output_dir=DEFAULT_OUTPUT_DIR,
        manifest=DEFAULT_MANIFEST,
        scale=DEFAULT_SCALE,
    )
    index = 0
    while index < len(argv):
        arg = argv[index]
        if index + 1 >= len(argv):
            raise SystemExit(f"missing value for {arg}")
        value = argv[index + 1]
        if arg == "--source-dir":
            args = UpscaleArgs(Path(value), args.output_dir, args.manifest, args.scale)
        elif arg == "--output-dir":
            args = UpscaleArgs(args.source_dir, Path(value), args.manifest, args.scale)
        elif arg == "--manifest":
            args = UpscaleArgs(args.source_dir, args.output_dir, Path(value), args.scale)
        elif arg == "--scale":
            args = UpscaleArgs(args.source_dir, args.output_dir, args.manifest, int(value))
        else:
            raise SystemExit(f"unknown argument: {arg}")
        index += 2
    if args.scale < 2:
        raise SystemExit("--scale must be at least 2")
    return args


def upscale_one(source_path: Path, output_dir: Path, scale: int) -> dict[str, object]:
    output_path = output_dir / f"{source_path.stem}_{scale}x.png"
    with Image.open(source_path) as image:
        rgba = image.convert("RGBA")
        output_size = (rgba.width * scale, rgba.height * scale)
        resized = rgba.resize(output_size, Image.Resampling.LANCZOS)
        sharpened = resized.filter(ImageFilter.UnsharpMask(radius=1.0, percent=90, threshold=3))
        sharpened.save(output_path, "PNG")

    return {
        "source": source_path.as_posix(),
        "output": output_path.as_posix(),
        "sourceSha256": sha256_file(source_path),
        "outputSha256": sha256_file(output_path),
        "sourceSize": read_png_size(source_path),
        "outputSize": read_png_size(output_path),
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_png_size(path: Path) -> dict[str, int]:
    with Image.open(path) as image:
        return {"width": image.width, "height": image.height}


if __name__ == "__main__":
    main()
