"""Client patch that fixes the world-entry crash so the LOGH VII client renders the game world.

G157 (crash-catcher, tools.logh7_crash_catcher): the deterministic world-load crash is a
NULL-page read at 0x0058f83a -- `mov ecx, dword ptr [0x80]` -- inside the HUD/display function
FUN_0058ee70. It is reached only when FUN_004c7290(...) returns 0 (an unhandled "no data" edge
case): `0x58f832 test eax,eax; 0x58f834 jne 0x58f8c4; 0x58f83a mov ecx,[0x80] (CRASH)`. The
intended path is the jne-taken branch (0x58f8c4); the fall-through reads a never-mapped global.

Fix: force the branch by rewriting `jne 0x58f8c4` (0f85 8a000000, 6 bytes) into
`jmp 0x58f8c4` (e9 8b000000) + nop (90), so the broken [0x80] read is always skipped.

G158 PROVEN: with this 6-byte patch the real client enters the game world (in-game space view +
HUD), responseWorldInitialized/responseGridInitialized flip from 0 to non-zero, and it runs with
ZERO exceptions for 75s+ (verified by the attached crash-catcher debugger). This is the
login -> lobby -> character-select -> session -> SS-login -> WORLD milestone.

This is a reversible 6-byte .text patch; restore the original EXE afterward (SHA 2848be76...).
A proper (non-skip) fix would supply whatever data makes FUN_004c7290 return non-zero, or guard
the [0x80] read; this skip is the minimal "get into the world" mod.

Usage: python -m tools.logh7_world_crash_patch patch <exe> --out <patched>
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset

CRASH_BRANCH_VA: Final[int] = 0x0058F834
ORIGINAL_HEX: Final[str] = "0f858a000000"  # jne 0x58f8c4
PATCHED_HEX: Final[str] = "e98b00000090"  # jmp 0x58f8c4 ; nop
CRASH_INSTRUCTION_VA: Final[int] = 0x0058F83A  # mov ecx, dword ptr [0x80]


@dataclass(frozen=True, slots=True)
class AppliedPatch:
    name: str
    virtual_address: int
    file_offset: int
    before_hex: str
    after_hex: str

    def to_json(self) -> dict[str, object]:
        return {
            "name": self.name,
            "virtualAddressHex": f"0x{self.virtual_address:08x}",
            "fileOffset": self.file_offset,
            "beforeHex": self.before_hex,
            "afterHex": self.after_hex,
            "crashInstructionHex": f"0x{CRASH_INSTRUCTION_VA:08x}",
        }


def apply_world_crash_patch(source: Path, out: Path) -> AppliedPatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    offset = _virtual_address_to_offset(image, CRASH_BRANCH_VA)
    actual = bytes(raw[offset : offset + 6]).hex()
    if actual != ORIGINAL_HEX:
        raise ValueError(f"world-crash branch drift at 0x{CRASH_BRANCH_VA:08x}: expected {ORIGINAL_HEX}, got {actual}")
    raw[offset : offset + 6] = bytes.fromhex(PATCHED_HEX)
    out.write_bytes(bytes(raw))
    return AppliedPatch("world-entry-crash-skip", CRASH_BRANCH_VA, offset, ORIGINAL_HEX, PATCHED_HEX)


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply the LOGH VII world-entry crash-skip client patch.")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("patch")
    p.add_argument("source", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--manifest-out", type=Path, default=None)
    args = parser.parse_args()
    applied = apply_world_crash_patch(args.source, args.out)
    payload = {"source": str(args.source), "out": str(args.out), "patch": applied.to_json()}
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.manifest_out is not None:
        args.manifest_out.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
