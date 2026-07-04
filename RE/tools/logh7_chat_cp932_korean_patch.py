"""Minimal client patch for the cp932 Korean chat hazard (P0-03).

Three functions (FUN_004eac60, FUN_004eb100, FUN_00516bf0 @ G7MTClient.exe) call the CRT
`setlocale(LC_ALL, "Japanese")` (via FUN_005ffcc1) before doing a locale-dependent multibyte->wide
conversion (FUN_00600337 -> FUN_00600394, i.e. mbstowcs). Windows CRT's `"Japanese"` locale name
maps to codepage 932 (Shift-JIS); any Korean (cp949) byte sequence run through that conversion is
mangled. This is a hardcoded ASCII locale-name literal at VA 0x76e3fc (file offset 0x36e3fc), not a
charset immediate or a code path needing cave injection (both were checked and ruled out: the two
CreateFontA calls in this export pass charset=1/DEFAULT_CHARSET, and VA 0x5d5290 has zero
cross-references anywhere in the export -- genuinely dead space, not a jump target).

The fix is a same-length, in-place string patch: overwrite the "Japanese\0" literal with a
CRT-valid locale name whose codepage is 949 -- "Korean\0", null-padded to the original 9 bytes.
Trailing NULs after a C-string terminator are inert, so this is byte-for-byte safe.

This is a 9-byte, reversible .rdata patch. Verify the source EXE SHA before/after and restore from
backup after any live test (same pattern as logh7_lobby_unblock_patch.py).

Usage: python -m tools.logh7_chat_cp932_korean_patch patch <exe> --out <patched>
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

# (name, VA, expected original bytes hex, patched bytes hex, rationale).
PATCHES: Final[list[tuple[str, int, str, str, str]]] = [
    (
        "chat-setlocale-japanese-to-korean",
        0x0076E3FC,
        "4a6170616e65736500",  # "Japanese\0" (9 bytes), confirmed byte-exact against the current EXE
        "4b6f7265616e000000",  # "Korean\0" (7 bytes) + 2 zero-pad bytes to keep the 9-byte length
        "setlocale(LC_ALL, \"Japanese\") -> setlocale(LC_ALL, \"Korean\") so the CRT mbstowcs path "
        "used by chat text (FUN_004eac60/FUN_004eb100/FUN_00516bf0 via FUN_005ffcc1/FUN_00600337) "
        "uses codepage 949 instead of 932, matching cp949-encoded Korean chat bytes.",
    ),
]


@dataclass(frozen=True, slots=True)
class AppliedPatch:
    name: str
    virtual_address: int
    file_offset: int
    before_hex: str
    after_hex: str
    rationale: str

    def to_json(self) -> dict[str, object]:
        return {
            "name": self.name,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffset": self.file_offset,
            "beforeHex": self.before_hex,
            "afterHex": self.after_hex,
            "rationale": self.rationale,
        }


def apply_chat_cp932_korean_patch(source: Path, out: Path) -> list[AppliedPatch]:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    applied: list[AppliedPatch] = []
    for name, va, original_hex, patched_hex, rationale in PATCHES:
        offset = _virtual_address_to_offset(image, va)
        length = len(bytes.fromhex(original_hex))
        actual = bytes(raw[offset : offset + length])
        if actual.hex() != original_hex:
            raise ValueError(f"patch '{name}' byte drift at 0x{va:08x}: expected {original_hex}, found {actual.hex()}")
        raw[offset : offset + length] = bytes.fromhex(patched_hex)
        applied.append(AppliedPatch(name, va, offset, original_hex, patched_hex, rationale))
    out.write_bytes(bytes(raw))
    return applied


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply the minimal LOGH VII chat cp932->Korean locale patch.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, default=None)
    args = parser.parse_args()

    applied = apply_chat_cp932_korean_patch(args.source, args.out)
    payload = {"source": str(args.source), "out": str(args.out), "patches": [p.to_json() for p in applied]}
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.manifest_out is not None:
        args.manifest_out.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
