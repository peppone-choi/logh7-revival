"""Apply drift-checked, same-length byte patches to the LOGH VII client EXE.

Used to force the client's text-conversion code page to CP949 (0x3b5) so the Korean
localization (CP949 String.txt/MsgDat + HANGEUL_CHARSET font) renders on a machine whose
system ANSI code page is UTF-8 (65001) — where the manifest activeCodePage override does
not take effect for this 2003-era MSVCRT binary.

This applies only **same-length in-place** patches (each patch's patched bytes must equal the
original byte length): no code caves, no relocation, no section resizing. Every site is
verified against an expected `originalHex` before writing (drift guard), mirroring
tools/logh7_japanese_font_patch.py. A code-cave / IAT-hook patch (different length) is out of
scope here and must use tools/logh7_x86_patch.X86Builder instead.

Patch spec JSON:
  { "patches": [ { "va": "0x00609xxx", "originalHex": "..", "patchedHex": "..", "note": ".." } ] }
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset


@dataclass(frozen=True, slots=True)
class PatchSite:
    va: int
    file_offset: int
    original_hex: str
    patched_hex: str
    note: str

    def to_json(self) -> dict:
        return {
            "virtualAddressHex": f"0x{self.va:08x}",
            "fileOffsetHex": f"0x{self.file_offset:08x}",
            "originalHex": self.original_hex,
            "patchedHex": self.patched_hex,
            "note": self.note,
        }


def apply_byte_patches(source: Path, destination: Path, patches: list[dict], manifest_out: Path | None = None) -> list[PatchSite]:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    applied: list[PatchSite] = []
    for spec in patches:
        va = int(spec["va"], 16) if isinstance(spec["va"], str) else int(spec["va"])
        original = bytes.fromhex(spec["originalHex"].replace(" ", ""))
        patched = bytes.fromhex(spec["patchedHex"].replace(" ", ""))
        if len(original) != len(patched):
            raise ValueError(f"patch at 0x{va:08x} is not same-length ({len(original)} != {len(patched)}); use a code cave")
        offset = _virtual_address_to_offset(image, va)
        actual = bytes(raw[offset : offset + len(original)])
        if actual != original:
            raise ValueError(
                f"drift at 0x{va:08x} (file 0x{offset:08x}): expected {original.hex()} but found {actual.hex()}"
            )
        raw[offset : offset + len(patched)] = patched
        applied.append(PatchSite(va, offset, original.hex(), patched.hex(), str(spec.get("note", ""))))

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(bytes(raw))
    manifest = {"source": str(source), "destination": str(destination), "patches": [p.to_json() for p in applied]}
    if manifest_out is not None:
        manifest_out.parent.mkdir(parents=True, exist_ok=True)
        manifest_out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return applied


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply same-length drift-checked byte patches to an EXE.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--patches", type=Path, required=True, help="JSON: {patches:[{va,originalHex,patchedHex,note}]}")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--manifest-out", type=Path)
    args = parser.parse_args()
    spec = json.loads(args.patches.read_text(encoding="utf-8"))
    try:
        applied = apply_byte_patches(args.source, args.out, spec["patches"], args.manifest_out)
    except (OSError, ValueError, KeyError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps({"applied": [p.to_json() for p in applied]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
