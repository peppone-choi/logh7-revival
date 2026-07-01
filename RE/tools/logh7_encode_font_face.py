#!/usr/bin/env python3
"""T14 — replace the LOGH VII client's primary GDI UI font FACE NAME (data-driven).

RE (redex on G7MTClient; docs/logh7-font-localization.md):
  The primary UI CFont cache reads its face from a struct field rather than a literal
  at the call. FUN_004ea180 initializes that cache by calling FUN_004aec10
  (s_MS_UI_Gothic_0077402c, 0xc, 1), whose body strcpy's that source string into the
  cache object used by FUN_004aec70.

  2026-06-27 raw-byte correction: this is NOT the only font face slot. The D3D
  texture-glyph atlas path is initialized separately by FUN_004b07c0 from DAT_0076e240
  and consumed by FUN_004b0960. Keep this patch paired with font-atlas-face.json.

  Charset is correct in both call sites (decoded from machine code, not the
  Ghidra C which mis-renders the sign-extended imm8):
    push -0x7f  == push 0x81 == fdwCharSet = HANGEUL_CHARSET (0x81)      [the KO localization]
  Quality is handled by the separate default-stack `font-cleartype` patch:
    push 4      ==              fdwQuality = ANTIALIASED_QUALITY (4)
    push 5      ==              fdwQuality = CLEARTYPE_QUALITY (5)
  This task only swaps the face name string.

Region (VA 0x0077402c, this section maps raw==RVA so file offset == 0x37402c — but we compute
it via the shared PE helper, never assume):
    4d 53 20 55 49 20 47 6f 74 68 69 63 00 00 00 00   "MS UI Gothic\0\0\0\0"
  followed immediately by "mkCreateVertexBuffer...". That gives a fixed 16-byte slot:
  12 visible chars + 4 NUL. A replacement face name must be <= 15 chars + 1 NUL (<= 16 bytes),
  and we pad the remainder with NUL so the patch is the SAME LENGTH (16-byte in-place region
  replace, no code cave, no relocation).

Default replacement = "Pretendard", 10 bytes + NUL padding: modern Korean UI face selected for
the shipped client. It is not a Windows default, so the launcher/ui_explorer must register the
bundled Pretendard fonts before starting the client. GDI probing showed "Pretendard JP" falls back
to "굴림" under HANGEUL_CHARSET, so the EXE face remains "Pretendard".

Usage:
  python tools/logh7_encode_font_face.py --show
  python tools/logh7_encode_font_face.py --font "Pretendard" --write      # -> tools/client_patches/font-face.json
  python tools/logh7_encode_font_face.py --font "Gulim" --show
  python tools/logh7_encode_font_face.py --selftest
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
# Verify originalHex against the canonical installed/base EXEs when a vanilla-style reference is
# present. Current playable/installed trees may already contain the patched face.
EXE_CANDIDATES = [
    ROOT / ".omo/work/logh7-installed/exe/G7MTClient.exe",
    ROOT / ".omo/work/logh7-ko-overlay/exe/G7MTClient.korean.exe",
    ROOT / ".omo/work/logh7-ko-overlay/exe/G7MTClient.playable.exe",
    ROOT / ".omo/ghidra/bin/G7MTClient.exe",
]

FACE_VA = 0x0077402C            # s_MS_UI_Gothic
SLOT_LEN = 16                   # "MS UI Gothic" (12) + 4 NUL padding, bounded by "mkCreateVertexBuffer"
ORIGINAL_FACE = b"MS UI Gothic"
ORIGINAL_BYTES = ORIGINAL_FACE + b"\x00" * (SLOT_LEN - len(ORIGINAL_FACE))

KNOWN_FACES = {
    "Pretendard": "현대적 한글 UI 폰트 — shipped default; bundled font registration required",
    "Malgun Gothic": "맑은 고딕 — Windows 7+ default Korean UI font; ClearType; full Hangul",
    "Gulim": "굴림 — classic Korean Windows font, always present",
    "Dotum": "돋움 — classic Korean Windows sans, always present",
    "Batang": "바탕 — classic Korean Windows serif, always present",
    "NanumGothic": "나눔고딕 — Naver open font (11 chars; must be installed)",
}


def encode_face(font: str) -> bytes:
    """Encode a face name into the fixed 16-byte slot (Latin-1/ASCII face name + NUL pad)."""
    raw = font.encode("ascii")  # GDI ANSI face names are ASCII; raises on non-ASCII (intentional)
    if len(raw) > SLOT_LEN - 1:
        raise ValueError(
            f"face name {font!r} is {len(raw)} bytes; slot holds {SLOT_LEN - 1} chars + NUL "
            f"(bounded by the following 'mkCreateVertexBuffer' string — no room to grow)"
        )
    return raw + b"\x00" * (SLOT_LEN - len(raw))


def file_offset(exe: Path, va: int) -> int:
    img = _parse_pe_image(exe.read_bytes())
    return _virtual_address_to_offset(img, va)


def pick_exe() -> Path | None:
    for c in EXE_CANDIDATES:
        if c.exists():
            return c
    return None


def build_descriptor(font: str) -> tuple[dict, list[str]]:
    notes: list[str] = []
    patched = encode_face(font)
    assert len(patched) == len(ORIGINAL_BYTES) == SLOT_LEN, "patch must be same length as slot"

    exe = pick_exe()
    foff_hex = None
    if exe is not None:
        off = file_offset(exe, FACE_VA)
        foff_hex = f"0x{off:08x}"
        actual = exe.read_bytes()[off : off + SLOT_LEN]
        if actual == ORIGINAL_BYTES:
            notes.append(f"originalHex VERIFIED against {exe.name} at file {foff_hex}")
        else:
            notes.append(
                f"DRIFT vs {exe.name}: expected {ORIGINAL_BYTES.hex()} found {actual.hex()}"
            )
    else:
        notes.append("no reference EXE found — originalHex not byte-verified")

    patch = {
        "va": f"0x{FACE_VA:08x}",
        "originalHex": ORIGINAL_BYTES.hex(),
        "patchedHex": patched.hex(),
        "note": f"global GDI font face 'MS UI Gothic' -> '{font}' (16-byte slot, NUL-padded)",
    }
    if foff_hex:
        patch["fileOffsetHex"] = foff_hex

    desc = {
        "name": "font-face",
        "desc": (
            f"Replace the primary GDI UI font face string 'MS UI Gothic' (VA 0x{FACE_VA:08x}) "
            f"with '{font}'. RE: FUN_004ea180 calls FUN_004aec10(s_MS_UI_Gothic_0077402c,...) "
            f"for the UI CFont cache used by FUN_004aec70. The D3D texture-glyph atlas has a "
            f"separate face slot at DAT_0076e240 handled by font-atlas-face.json. Both CreateFontA "
            f"sites already pass HANGEUL_CHARSET (0x81, encoded as `push -0x7f`); text quality is "
            f"handled by the separate default-stack `font-cleartype` patch. Same-length 16-byte "
            f"in-place region replace (face <=15 chars + NUL, bounded by the following "
            f"'mkCreateVertexBuffer'); NO code cave. RE/docs: docs/logh7-font-remaster.md."
        ),
        "verified": (
            f"ENCODED + originalHex guarded for vanilla references; current playable/installed trees may "
            f"already contain the patched face. Same-length region patch (no cave). Requires '{font}' "
            f"present on the host; for the shipped Pretendard face, launcher/ui_explorer must register the "
            f"bundled fonts before client start."
        ),
        "patches": [patch],
    }
    return desc, notes


def selftest() -> int:
    failures = []
    # round-trip / length invariants
    enc = encode_face("Pretendard")
    if len(enc) != SLOT_LEN:
        failures.append(f"Pretendard enc len {len(enc)} != {SLOT_LEN}")
    if enc != b"Pretendard\x00\x00\x00\x00\x00\x00":
        failures.append(f"Pretendard enc wrong: {enc.hex()}")
    if enc[: len("Pretendard")].decode() != "Pretendard":
        failures.append("Pretendard decode mismatch")
    # original must NUL-pad to 16
    if len(ORIGINAL_BYTES) != SLOT_LEN or ORIGINAL_BYTES != bytes.fromhex("4d5320554920476f7468696300000000"):
        failures.append(f"ORIGINAL_BYTES wrong: {ORIGINAL_BYTES.hex()}")
    # same-length guarantee for every known face
    for face in KNOWN_FACES:
        e = encode_face(face)
        if len(e) != len(ORIGINAL_BYTES):
            failures.append(f"{face}: len {len(e)} != original {len(ORIGINAL_BYTES)}")
    # overflow guard
    try:
        encode_face("ThisFaceNameIsWayTooLong")
        failures.append("overflow not rejected")
    except ValueError:
        pass
    # originalHex must match unpatched references; already-patched current trees are accepted.
    exe = pick_exe()
    if exe is not None:
        off = file_offset(exe, FACE_VA)
        actual = exe.read_bytes()[off : off + SLOT_LEN]
        if actual not in {ORIGINAL_BYTES, enc}:
            failures.append(f"unexpected face slot vs {exe.name}: {actual.hex()}")
    if failures:
        print(json.dumps({"selftest": "FAIL", "failures": failures}, ensure_ascii=False, indent=2))
        return 1
    print(json.dumps({
        "selftest": "PASS",
        "slotLen": SLOT_LEN,
        "originalHex": ORIGINAL_BYTES.hex(),
        "pretendardHex": enc.hex(),
        "refExe": exe.name if exe else None,
    }, ensure_ascii=False, indent=2))
    return 0


def main(argv) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--font", default="Pretendard", help="replacement face name (<=15 ASCII chars)")
    ap.add_argument("--show", action="store_true", help="print the descriptor + verify notes (no write)")
    ap.add_argument("--write", action="store_true", help="write tools/client_patches/font-face.json")
    ap.add_argument("--selftest", action="store_true", help="run byte/length self-tests and exit")
    ap.add_argument("--list-faces", action="store_true", help="list known Korean faces that fit the slot")
    args = ap.parse_args(argv)

    if args.selftest:
        return selftest()
    if args.list_faces:
        print(json.dumps(KNOWN_FACES, ensure_ascii=False, indent=2))
        return 0

    desc, notes = build_descriptor(args.font)
    summary = {
        "font": args.font,
        "slotLen": SLOT_LEN,
        "originalHex": desc["patches"][0]["originalHex"],
        "patchedHex": desc["patches"][0]["patchedHex"],
        "sameLength": len(bytes.fromhex(desc["patches"][0]["originalHex"]))
        == len(bytes.fromhex(desc["patches"][0]["patchedHex"])),
        "verify": notes,
        "charsetQuality": "HANGEUL_CHARSET(0x81) is present; ClearType quality is handled by tools/client_patches/font-cleartype.json",
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.show:
        print(json.dumps(desc, ensure_ascii=False, indent=2))
    if args.write:
        out = ROOT / "tools/client_patches/font-face.json"
        out.write_text(json.dumps(desc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("wrote", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
