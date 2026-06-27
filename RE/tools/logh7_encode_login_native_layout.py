#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / "tools/client_patches/login-native-layout.json"

BASE_WIDTH = 640
BASE_HEIGHT = 480
MIN_WIDTH = 1024
MIN_HEIGHT = 768


def encode_le32(value: int) -> str:
    return int(value).to_bytes(4, "little", signed=False).hex()


def rect_patch(va: str, prefix: str, original_value: int, target_value: int, note: str) -> dict:
    return {
        "va": va,
        "originalHex": prefix + encode_le32(original_value),
        "patchedHex": prefix + encode_le32(target_value),
        "note": note,
    }


def target_layout(width: int, height: int) -> dict[str, int]:
    group_width = min(840, max(620, int(width * 0.48)))
    group_x = (width - group_width) // 2
    group_y = max(220, int(height * 0.435))

    label_width = min(190, max(150, int(group_width * 0.22)))
    gap = max(20, int(group_width * 0.035))
    field_x = group_x + label_width + gap
    field_width = group_width - label_width - gap

    button_width = min(160, max(120, int(group_width * 0.19)))
    button_gap = max(36, int(group_width * 0.05))
    buttons_width = button_width * 2 + button_gap
    button_x = group_x + (group_width - buttons_width) // 2

    return {
        "title_x": group_x,
        "title_y": group_y,
        "title_w": group_width,
        "title_h": max(34, int(height * 0.037)),
        "hint_x": group_x,
        "hint_y": group_y + max(42, int(height * 0.04)),
        "hint_w": group_width,
        "hint_h": max(34, int(height * 0.037)),
        "id_label_x": group_x,
        "id_label_y": group_y + max(112, int(height * 0.108)),
        "id_label_w": label_width,
        "id_label_h": max(34, int(height * 0.034)),
        "pw_label_x": group_x,
        "pw_label_y": group_y + max(160, int(height * 0.156)),
        "pw_label_w": label_width,
        "pw_label_h": max(34, int(height * 0.034)),
        "field_x": field_x,
        "id_field_y": group_y + max(110, int(height * 0.106)),
        "pw_field_y": group_y + max(158, int(height * 0.154)),
        "field_w": field_width,
        "field_h": max(34, int(height * 0.034)),
        "button_x": button_x,
        "button_y": group_y + max(238, int(height * 0.222)),
        "button2_x": button_x + button_width + button_gap,
        "button_w": button_width,
    }


def build_spec(width: int, height: int) -> dict:
    layout = target_layout(width, height)
    patches = [
        {
            "va": "0x0051a50a",
            "originalHex": "68e0010000",
            "patchedHex": "68" + encode_le32(height),
            "note": f"login initial display height 480 -> {height}",
        },
        {
            "va": "0x0051a51c",
            "originalHex": "6880020000",
            "patchedHex": "68" + encode_le32(width),
            "note": f"login initial display width 640 -> {width}",
        },
        rect_patch("0x0051cf92", "c7442428", BASE_WIDTH, width, "login root layer width"),
        rect_patch("0x0051cf9a", "c744242c", BASE_HEIGHT, height, "login root layer height"),
        rect_patch("0x0051cff1", "c7442418", 170, layout["title_x"], "login top text x"),
        rect_patch("0x0051cff9", "c744241c", 226, layout["title_y"], "login top text y"),
        rect_patch("0x0051d001", "c7442424", 300, layout["title_w"], "login top text width"),
        rect_patch("0x0051d009", "c7442428", 32, layout["title_h"], "login top text height"),
        rect_patch("0x0051d08b", "c7442418", 170, layout["hint_x"], "login hint text x"),
        rect_patch("0x0051d093", "c744241c", 242, layout["hint_y"], "login hint text y"),
        rect_patch("0x0051d09b", "c7442424", 300, layout["hint_w"], "login hint text width"),
        rect_patch("0x0051d0a3", "c7442428", 32, layout["hint_h"], "login hint text height"),
        rect_patch("0x0051d126", "c7442418", 160, layout["id_label_x"], "login account label x"),
        rect_patch("0x0051d12e", "c744241c", 278, layout["id_label_y"], "login account label y"),
        rect_patch("0x0051d136", "c7442424", 300, layout["id_label_w"], "login account label width"),
        rect_patch("0x0051d13e", "c7442428", 32, layout["id_label_h"], "login account label height"),
        rect_patch("0x0051d1b7", "c7442418", 160, layout["pw_label_x"], "login password label x"),
        rect_patch("0x0051d1bf", "c744241c", 305, layout["pw_label_y"], "login password label y"),
        rect_patch("0x0051d1c7", "c7442424", 300, layout["pw_label_w"], "login password label width"),
        rect_patch("0x0051d1cf", "c7442428", 32, layout["pw_label_h"], "login password label height"),
        rect_patch("0x0051d243", "c7442418", 282, layout["button_x"], "login submit button x"),
        rect_patch("0x0051d24b", "c744241c", 331, layout["button_y"], "login submit button y"),
        rect_patch("0x0051d253", "c7442424", 69, layout["button_w"], "login submit button width"),
        rect_patch("0x0051d33d", "c7442418", 282, layout["button2_x"], "login exit button x"),
        rect_patch("0x0051d345", "c744241c", 397, layout["button_y"], "login exit button y"),
        rect_patch("0x0051d34d", "c7442424", 69, layout["button_w"], "login exit button width"),
        {
            "va": "0x0051d440",
            "originalHex": "bb18000000",
            "patchedHex": "bb" + encode_le32(layout["field_h"]),
            "note": f"login input field height 24 -> {layout['field_h']}",
        },
        rect_patch("0x0051d448", "c7442418", 254, layout["field_x"], "login account field x"),
        rect_patch("0x0051d450", "c744241c", 279, layout["id_field_y"], "login account field y"),
        rect_patch("0x0051d458", "c7442424", 200, layout["field_w"], "login account field width"),
        rect_patch("0x0051d4de", "c7442418", 254, layout["field_x"], "login password field x"),
        rect_patch("0x0051d4e6", "c744241c", 307, layout["pw_field_y"], "login password field y"),
        rect_patch("0x0051d4ee", "c7442424", 200, layout["field_w"], "login password field width"),
    ]
    return {
        "name": "login-native-layout",
        "desc": (
            f"Retarget the initial login scene from the legacy 640x480 window to a native "
            f"{width}x{height} canvas and reposition the login text, fields, and buttons. "
            "This is a real layout patch, not a letterbox or post-render stretch."
        ),
        "verified": (
            "Generated from RE-confirmed FUN_0051a370 initial display pushes and "
            "FUN_0051cda0 login object rectangles. The layout is centered on the system "
            "canvas with explicit field/button coordinates; live visual confirmation is "
            "required after each target resolution refresh."
        ),
        "patches": patches,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate login-native-layout.json for a target resolution.")
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--show", action="store_true", help="print JSON instead of writing it")
    args = parser.parse_args()

    if args.width < MIN_WIDTH or args.height < MIN_HEIGHT:
        raise SystemExit("target resolution must be at least 1024x768")
    spec = build_spec(args.width, args.height)
    text = json.dumps(spec, ensure_ascii=False, indent=2) + "\n"
    if args.show:
        print(text, end="")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out}: login native layout {args.width}x{args.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
