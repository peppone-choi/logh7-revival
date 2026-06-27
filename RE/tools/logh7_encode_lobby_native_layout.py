#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "tools/client_patches/lobby-native-layout.json"

BASE_WIDTH = 1024
BASE_HEIGHT = 768
PATCH_SITES = [
    ("0x0051c983", "b886000000", "b8", 134, "common row y 134"),
    ("0x0051c990", "b8db020000", "b8", 731, "right-side submenu x 731"),
    ("0x0051c995", "b95d020000", "b9", 605, "middle submenu x 605"),
    ("0x0051c9ca", "c74424080f000000", "c7442408", 15, "left anchor x 15"),
    ("0x0051c9d2", "c74424102c010000", "c7442410", 300, "main lobby panel anchor x 300"),
    ("0x0051c9da", "c744241cce000000", "c744241c", 206, "submenu row y 206"),
    ("0x0051c9e2", "c7442424f3000000", "c7442424", 243, "submenu row y 243"),
    ("0x0051c9ea", "c744242c14010000", "c744242c", 276, "submenu row y 276"),
    ("0x0051c9f2", "c744243433010000", "c7442434", 307, "submenu row y 307"),
    ("0x0051c9fa", "c744243c51010000", "c744243c", 337, "submenu row y 337"),
    ("0x0051ca02", "c74424447c010000", "c7442444", 380, "submenu row y 380"),
    ("0x0051ca0a", "c744244c9e010000", "c744244c", 414, "submenu row y 414"),
    ("0x0051ca12", "c7442454bd010000", "c7442454", 445, "submenu row y 445"),
]
WIDTH_RATIOS = {
    731: 1376 / 1920,
    605: 1136 / 1920,
    15: 32 / 1920,
    300: 560 / 1920,
}


def encode_le32(value: int) -> str:
    return int(value).to_bytes(4, "little", signed=False).hex()


def target_value(base: int, width: int, height: int) -> int:
    if base in WIDTH_RATIOS:
        return int(width * WIDTH_RATIOS[base])
    return int(base * height / BASE_HEIGHT)


def build_spec(width: int, height: int) -> dict:
    patches = []
    for va, original_hex, prefix, base, note in PATCH_SITES:
        value = target_value(base, width, height)
        patches.append({
            "va": va,
            "originalHex": original_hex,
            "patchedHex": prefix + encode_le32(value),
            "note": f"{note} -> {value} on the {width}x{height} native canvas",
        })
    return {
        "name": "lobby-native-layout",
        "desc": (
            f"Move the lobby scene-group anchor table to a native {width}x{height} layout. "
            "This is not a 4:3 letterbox or uniform-scale patch: pair it with a matching "
            "lobby-res patch so the client has a real native UI/backbuffer canvas."
        ),
        "verified": (
            "Generated from the RE-confirmed FUN_0051c980 scene-anchor table. "
            "Scaled coordinates use integer truncation instead of rounding so regenerated "
            "patches match the legacy positive-coordinate cast behavior. "
            "The 1920x1080 native path has prior live no-stretch evidence; this truncation "
            "refresh and other resolutions still require live visual confirmation before release."
        ),
        "patches": patches,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate lobby-native-layout.json for a target resolution.")
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--show", action="store_true", help="print JSON instead of writing it")
    args = parser.parse_args()

    if args.width < BASE_WIDTH or args.height < BASE_HEIGHT:
        raise SystemExit("target resolution must be at least 1024x768")
    spec = build_spec(args.width, args.height)
    text = json.dumps(spec, ensure_ascii=False, indent=2) + "\n"
    if args.show:
        print(text, end="")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out}: lobby native layout {args.width}x{args.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
