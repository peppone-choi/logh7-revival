"""Client patch: force the lobby login-success flag when the transport router decodes inner 0x2001.

The cipher is solved (phase1Key) so decipher_message ACCEPTS our 0x2001, and the router
(FUN_006130a0) routes it down the non-0x31 store-pending path at 0x613222. But conn2's recv is
wired to a transport handler (type 4), not the lobby app ParseSystem, so the 0x2001 never reaches
caseD_2001 (0x4bdb70) which sets the success flag *(0x7ccffc)+0x35837b. The lobby FSM polls that
flag; without it the FSM times out -> "ログインに失敗しました" (login failed) dialog.

This hook sits at the router's store-pending entry (0x613222), where eax/[esp+0x20] holds the just-
decoded inner code. When it equals 0x2001 it sets *(0x7ccffc)+0x35837b = 1 directly, so the FSM's
wait-state sees success and advances (open conn3 / proceed) instead of failing. This is a stepping
stone: it gets the UI past lobby login; the later lobby RPCs still need the processor properly wired.

Layer on top of the lobby-unblock patch (which keeps conn2 open + the FSM ticking). 7-byte hook ->
code cave trampoline; reversible. Usage: python -m tools.logh7_lobby_flag_force_patch patch <exe> --out <patched>
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from tools.logh7_child_codec import _parse_pe_image, _virtual_address_to_offset
from tools.logh7_runtime_patch_targets import (
    RuntimeCodeCave,
    enable_section_write_for_virtual_address,
    find_runtime_probe_code_cave,
)
from tools.logh7_x86_patch import X86Builder, hook_jump

HOOK_VA: Final[int] = 0x00613222
CONTINUATION_VA: Final[int] = 0x00613229
HOOK_LENGTH: Final[int] = 7  # mov edi,[edi] (2) + mov dx,[esp+0x10] (5)
ORIGINAL_HEX: Final[str] = "8b3f668b542410"
FLAG_BASE_PTR_VA: Final[int] = 0x007CCFFC
FLAG_OFFSET: Final[int] = 0x35837B
LOBBY_LOGIN_OK_CODE: Final[int] = 0x2001


@dataclass(frozen=True, slots=True)
class LobbyFlagForcePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "continuationHex": f"0x{CONTINUATION_VA:08x}",
            "trampoline": {"virtualAddressHex": f"0x{self.cave.virtual_address:08x}"},
            "flag": {"basePtrHex": f"0x{FLAG_BASE_PTR_VA:08x}", "offsetHex": f"0x{FLAG_OFFSET:08x}", "innerCodeHex": f"0x{LOBBY_LOGIN_OK_CODE:04x}"},
            "section": {"beforeHex": self.section_before, "afterHex": self.section_after},
        }


def apply_lobby_flag_force_patch(source: Path, out: Path, manifest_out: Path | None = None) -> LobbyFlagForcePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"router store-pending bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("flag-force trampoline exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = LobbyFlagForcePatch(cave, hook_bytes.hex(), before, after)
    if manifest_out is not None:
        manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int) -> bytes:
    b = X86Builder(base_va)
    b.append(b"\x9c\x50")  # pushfd; push eax
    # inner code was at [esp+0x20]; after pushfd(+4)+push eax(+4) it is at [esp+0x28]
    b.append(b"\x66\x81\x7c\x24\x28")  # cmp word [esp+0x28], imm16
    b.u8(LOBBY_LOGIN_OK_CODE & 0xFF)
    b.u8((LOBBY_LOGIN_OK_CODE >> 8) & 0xFF)
    skip = _jne_rel8(b)  # jne skip
    b.append(b"\xa1")
    b.u32(FLAG_BASE_PTR_VA)  # mov eax, [0x7ccffc]
    b.append(b"\x85\xc0")  # test eax, eax
    skip2 = _jz_rel8(b)  # jz skip
    b.append(b"\xc6\x80")  # mov byte [eax + disp32], 1
    b.u32(FLAG_OFFSET)
    b.u8(0x01)
    b.patch_rel8(skip, b.current_va)
    b.patch_rel8(skip2, b.current_va)
    b.append(b"\x58\x9d")  # pop eax; popfd
    b.append(bytes.fromhex(ORIGINAL_HEX))  # replay mov edi,[edi]; mov dx,[esp+0x10]
    b.jmp_rel32(CONTINUATION_VA)
    return bytes(b.data)


def _jne_rel8(b: X86Builder) -> int:
    b.append(b"\x75\x00")
    return len(b.data) - 1


def _jz_rel8(b: X86Builder) -> int:
    b.append(b"\x74\x00")
    return len(b.data) - 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Force the lobby login-success flag on decoded inner 0x2001.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, default=None)
    args = parser.parse_args()
    result = apply_lobby_flag_force_patch(args.source, args.out, args.manifest_out)
    print(json.dumps(result.to_json(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
