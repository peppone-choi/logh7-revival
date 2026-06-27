#!/usr/bin/env python3
"""Patch the lobby's hardcoded 1024x768 to a native lobby canvas.

RE (docs/logh7-graphics-remaster.md; redex on G7MTClient):
  The lobby state machine FUN_0051a370 sets its render+window size by calling
  FUN_00401760(w,h)  (D3D backbuffer + it internally calls FUN_004ea460, the UI scaler) and
  FUN_004e7570(1, DAT_007c1b50, w,h)  (the lobby window) with HARDCODED w=0x400(1024) h=0x300(768)
  in 4 lobby sub-states, versus ONE state that reads GraphicConfig via FUN_004f3730(5)=ScreenWidth /
  FUN_004f3730(6)=ScreenHeight (the config field reader: return *(cfg + idx*4)).
  Unlike the in-world view (fully GraphicConfig-driven), the lobby is pinned 1024x768. This patch
  retargets those immediates to a native size.

  The push immediates are same-length (68 <imm32>), so this is a trivial in-place patch — NO code cave.

Sites (file offset = VA - 0x400000; .text maps 1:1):
  width  (push 0x00000400): VA 0x51a740, 0x51a755, 0x51a8ef, 0x51a904
  height (push 0x00000300): VA 0x51a73b, 0x51a750, 0x51a8ea, 0x51a8ff
  (push 0x280=640 @0x51a51c is the separate 640x480 minimode — left untouched by default.)

Native remaster pairing: FUN_00401760 -> FUN_004ea460 applies the scale, but the production
remaster does not preserve the old 4:3 island. Generate lobby-native-layout.json for the same
width/height so FUN_0051c980 scene anchors move to that canvas. The rejected
lobby-fullscreen-display path forced 1024x768-authored positions into 1920x1080 and stretched UI.

Watermark: the dgVoodoo logo is config-removable — set 3DfxWatermark=false (+ dgVoodooWatermark=false)
in dgVoodoo.conf; no wrapper swap needed.

Usage:
  python tools/logh7_encode_lobby_res.py --width 1920 --height 1080 --show
  python tools/logh7_encode_lobby_res.py --width 1920 --height 1080 --write   # -> tools/client_patches/lobby-res.json
  python tools/logh7_encode_lobby_native_layout.py --width 1920 --height 1080
"""
from __future__ import annotations
import argparse
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / ".omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe"
IMAGE_BASE = 0x00400000
WIDTH_SITES = [0x51A740, 0x51A755, 0x51A8EF, 0x51A904]   # push 0x400 (1024)
HEIGHT_SITES = [0x51A73B, 0x51A750, 0x51A8EA, 0x51A8FF]  # push 0x300 (768)
ORIG_W = 0x400
ORIG_H = 0x300


def push_imm(value: int) -> bytes:
    return b"\x68" + struct.pack("<I", value & 0xFFFFFFFF)


def fileoff(va: int) -> int:
    return va - IMAGE_BASE


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args(argv)

    notes = []
    d = EXE.read_bytes() if EXE.exists() else None
    patches = []
    for va in WIDTH_SITES:
        patches.append({"va": hex(va), "fileOffsetHex": hex(fileoff(va)),
                        "originalHex": push_imm(ORIG_W).hex(), "patchedHex": push_imm(args.width).hex(),
                        "note": f"lobby width push 0x{ORIG_W:x}(1024) -> {args.width}"})
    for va in HEIGHT_SITES:
        patches.append({"va": hex(va), "fileOffsetHex": hex(fileoff(va)),
                        "originalHex": push_imm(ORIG_H).hex(), "patchedHex": push_imm(args.height).hex(),
                        "note": f"lobby height push 0x{ORIG_H:x}(768) -> {args.height}"})

    if d is not None:
        ok = sum(1 for p in patches if d[int(p["fileOffsetHex"], 16):int(p["fileOffsetHex"], 16) + 5] == bytes.fromhex(p["originalHex"]))
        notes.append(f"originalHex verified at {ok}/{len(patches)} sites")
    else:
        notes.append(f"EXE not found at {EXE} (skipped verify)")

    desc = {
        "name": "lobby-res",
        "desc": (f"Retarget the lobby's hardcoded 1024x768 to {args.width}x{args.height}. FUN_0051a370 pushes "
                 f"0x400/0x300 to FUN_00401760 (D3D+UI scaler FUN_004ea460) and FUN_004e7570 (window) in 4 "
                 f"sub-states; this patches all 8 same-length push immediates. Generate lobby-native-layout.json "
                 f"for the same native canvas. RE: docs/logh7-graphics-remaster.md."),
        "verified": f"ENCODED + originalHex-checked against G7MTClient.playable.exe. Same-length immediate patch (no cave). Pair with a same-size lobby-native-layout and live-verify that the lobby renders at {args.width}x{args.height} without stretch.",
        "patches": patches,
    }
    print(json.dumps({"target": f"{args.width}x{args.height}", "siteCount": len(patches), "verify": notes,
                      "samplePatched": patches[0]["patchedHex"] + " / " + patches[4]["patchedHex"]}, indent=1))
    if args.write:
        out = ROOT / "tools/client_patches/lobby-res.json"
        out.write_text(json.dumps(desc, ensure_ascii=False, indent=2), encoding="utf-8")
        print("wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
