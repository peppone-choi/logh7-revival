#!/usr/bin/env python3
"""Encode the LOGH VII texture-glyph atlas font-face patch.

This is the second font face slot. The normal GDI UI cache uses
``s_MS_UI_Gothic_0077402c`` and is patched by ``font-face.json``. The D3D
glyph-atlas path is initialized separately:

  FUN_004b07c0 copies DAT_0076e240 into the atlas object at ``this+8``.
  FUN_004b0960 later calls CreateFontA(..., lpszFace=this+8).

Raw bytes in the current Korean base EXE:

  VA 0x0076e240 / file 0x0036e240:
    b1 bc b8 b2 00 00 00 00 00 00 00 00 00 00 00 00   "Gulim" in CP949

The slot is 16 bytes, so ``Pretendard\\0`` fits as a same-length data patch.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

ROOT = Path(__file__).resolve().parents[1]
PATCH_OUT = ROOT / "tools" / "client_patches" / "font-atlas-face.json"

ATLAS_FACE_VA = 0x0076E240
SLOT_LEN = 16
ORIGINAL_BYTES = bytes.fromhex("b1bcb8b2000000000000000000000000")
VANILLA_BYTES = bytes.fromhex("826c827220835383568362834e000000")

EXE_CANDIDATES = [
    ROOT / ".omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe",
    ROOT / ".omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe",
    ROOT / ".omo/work/logh7-installed/exe/G7MTClient.exe",
    ROOT / ".omo/ghidra/bin/G7MTClient.exe",
]


def encode_face(font: str) -> bytes:
    raw = font.encode("ascii")
    if len(raw) > SLOT_LEN - 1:
        raise ValueError(f"face name {font!r} is {len(raw)} bytes; slot holds {SLOT_LEN - 1} chars + NUL")
    return raw + b"\x00" * (SLOT_LEN - len(raw))


def file_offset(exe: Path, va: int) -> int:
    image = _parse_pe_image(exe.read_bytes())
    return _virtual_address_to_offset(image, va)


def verify_candidates(patched: bytes) -> list[dict]:
    results: list[dict] = []
    for exe in EXE_CANDIDATES:
        if not exe.exists():
            results.append({"path": str(exe), "exists": False})
            continue
        off = file_offset(exe, ATLAS_FACE_VA)
        actual = exe.read_bytes()[off : off + SLOT_LEN]
        if actual == ORIGINAL_BYTES:
            state = "korean-base-gulim"
        elif actual == patched:
            state = "already-patched"
        elif actual == VANILLA_BYTES:
            state = "vanilla-ms-gothic"
        else:
            state = "unexpected"
        results.append(
            {
                "path": str(exe),
                "exists": True,
                "fileOffsetHex": f"0x{off:08x}",
                "actualHex": actual.hex(),
                "state": state,
            }
        )
    return results


def build_descriptor(font: str) -> dict:
    patched = encode_face(font)
    assert len(patched) == len(ORIGINAL_BYTES) == SLOT_LEN
    return {
        "name": "font-atlas-face",
        "desc": (
            "Patch the separate D3D texture-glyph atlas face slot used by FUN_004b07c0/FUN_004b0960 "
            f"from CP949 Gulim (DAT_0076e240) to {font}. Raw-byte proof: FUN_004b07c0 contains "
            "`bf 40 e2 76 00` (mov edi,0x0076e240) and copies that 16-byte string into the atlas "
            "object at +8; FUN_004b0960 then passes +8 to CreateFontA. This is not the global GDI "
            "face slot at 0x0077402c, so both slots must be patched for a true all-Pretendard client."
        ),
        "verified": (
            "ENCODED + raw bytes verified against G7MTClient.korean.exe: file 0x0036e240 "
            "is b1bcb8b2000000000000000000000000. Same-length 16-byte data patch, no code cave. "
            "GDI spawn probe 2026-06-27 previously proved this path created faceHex=b1bcb8b200 "
            "while the other GDI path created Pretendard."
        ),
        "patches": [
            {
                "va": f"0x{ATLAS_FACE_VA:08x}",
                "fileOffsetHex": "0x0036e240",
                "originalHex": ORIGINAL_BYTES.hex(),
                "patchedHex": patched.hex(),
                "note": "D3D glyph-atlas face DAT_0076e240: CP949 Gulim -> Pretendard (16-byte slot)",
            }
        ],
    }


def selftest() -> int:
    patched = encode_face("Pretendard")
    failures: list[str] = []
    if patched != bytes.fromhex("50726574656e64617264000000000000"):
        failures.append(f"Pretendard encoding drifted: {patched.hex()}")
    if len(patched) != SLOT_LEN or len(ORIGINAL_BYTES) != SLOT_LEN:
        failures.append("patch is not same-length")
    try:
        encode_face("ThisFaceNameIsWayTooLong")
        failures.append("overflow face was not rejected")
    except ValueError:
        pass
    states = verify_candidates(patched)
    base = next((item for item in states if item["path"].endswith("G7MTClient.korean.exe")), None)
    if not base or base.get("state") not in {"korean-base-gulim", "already-patched"}:
        failures.append(f"korean base atlas slot not recognized: {base}")
    if failures:
        print(json.dumps({"selftest": "FAIL", "failures": failures, "states": states}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps({"selftest": "PASS", "states": states}, ensure_ascii=False, indent=2))
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--font", default="Pretendard")
    parser.add_argument("--show", action="store_true")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--selftest", action="store_true")
    args = parser.parse_args(argv)

    if args.selftest:
        return selftest()

    descriptor = build_descriptor(args.font)
    patched = bytes.fromhex(descriptor["patches"][0]["patchedHex"])
    summary = {
        "font": args.font,
        "sameLength": len(ORIGINAL_BYTES) == len(patched),
        "slotVa": f"0x{ATLAS_FACE_VA:08x}",
        "fileOffsetHex": "0x0036e240",
        "originalHex": ORIGINAL_BYTES.hex(),
        "patchedHex": patched.hex(),
        "candidateStates": verify_candidates(patched),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.show:
        print(json.dumps(descriptor, ensure_ascii=False, indent=2))
    if args.write:
        PATCH_OUT.write_text(json.dumps(descriptor, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"wrote {PATCH_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
