"""Client patch: forward conn2's decoded lobby messages (inner 0x2001..0x200b) into the lobby
recv-queue, so they reach the lobby app dispatcher FUN_004ba2b0 / caseD_2001 and set the
login-success flag.

Workflow w7eroupk1 + netstat proved: the client multiplexes BOTH the type-4 login system and the
type-3 lobby system over ONE socket (conn2). Inbound dispatch (FUN_006122c0) routes by connection
TYPE (key 0x0004 = type-4 = LoginProcessor FUN_004ac700), which only understands 0x7001/0x7002 and
drops everything else ("unsupported message"). The ONLY path to FUN_004ba2b0 is the type-3 callback
FUN_004ae0d0 -> FUN_004b8850 (enqueue @*(0x7ccffc)+0x3552b8) -> FUN_004b8950 (drain) -> FUN_004ba2b0.
There is no separate type-3 socket to send on (netstat: one connection), so the fix is client-side.

This hook sits in the shared dispatch loop FUN_006122c0 at 0x0061231b, where EDI = the decoded
frame (EDI[0]=body ptr, *(u16)(EDI+8)=inner code) before the handler lookup overwrites EDI. For an
inner code in [0x2001,0x200b] it calls FUN_004b8850(this=*(0x7ccffc), code, body) -- exactly as the
type-3 callback does -- enqueuing the message so the lobby drain dispatches it. Login codes
(0x7001/0x7002) and the C->S request 0x2000 are outside the range and untouched. pushad/popad makes
the detour register-transparent; the displaced 8 bytes are replayed before continuing to 0x612323.

Layer on top of the lobby-unblock patch. Usage:
  python -m tools.logh7_lobby_forward_patch patch <exe> --out <patched>
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

HOOK_VA: Final[int] = 0x0061231B
CONTINUATION_VA: Final[int] = 0x00612323
HOOK_LENGTH: Final[int] = 8  # mov ecx,[edi] (2) + xor eax,eax (2) + mov ax,[edi+8] (4)
ORIGINAL_HEX: Final[str] = "8b0f33c0668b4708"
ENQUEUE_VA: Final[int] = 0x004B8850
RING_BASE_PTR_VA: Final[int] = 0x007CCFFC
LOBBY_CODE_LO: Final[int] = 0x2001
LOBBY_CODE_HI: Final[int] = 0x200B


@dataclass(frozen=True, slots=True)
class LobbyForwardPatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "continuationHex": f"0x{CONTINUATION_VA:08x}",
            "trampoline": {"virtualAddressHex": f"0x{self.cave.virtual_address:08x}"},
            "enqueueHex": f"0x{ENQUEUE_VA:08x}",
            "codeRange": [f"0x{LOBBY_CODE_LO:04x}", f"0x{LOBBY_CODE_HI:04x}"],
            "section": {"beforeHex": self.section_before, "afterHex": self.section_after},
        }


def apply_lobby_forward_patch(source: Path, out: Path, manifest_out: Path | None = None) -> LobbyForwardPatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"dispatch-loop bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("lobby-forward trampoline exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = LobbyForwardPatch(cave, hook_bytes.hex(), before, after)
    if manifest_out is not None:
        manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int) -> bytes:
    # At the hook, EDI[0] = decoded inner-buffer ptr, EDI[8] = message length (NOT the code).
    # The inner code is the first big-endian u16 of the inner buffer: ntohs(*(u16*)([EDI])).
    b = X86Builder(base_va)
    b.append(b"\x60")  # pushad
    b.append(b"\x8b\x17")  # mov edx, [edi]          (edx = inner-buffer ptr)
    b.append(b"\x0f\xb7\x02")  # movzx eax, word [edx]   (inner code, big-endian bytes)
    b.append(b"\x86\xe0")  # xchg al, ah             (byteswap -> host-order code)
    b.append(b"\x3d")
    b.u32(LOBBY_CODE_LO)  # cmp eax, 0x2001
    skip_lo = _jb_rel8(b)  # jb skip
    b.append(b"\x3d")
    b.u32(LOBBY_CODE_HI)  # cmp eax, 0x200b
    skip_hi = _ja_rel8(b)  # ja skip
    b.append(b"\x8b\x0d")
    b.u32(RING_BASE_PTR_VA)  # mov ecx, [0x7ccffc]  (this = ring base)
    b.append(b"\x85\xc9")  # test ecx, ecx
    skip_null = _jz_rel8(b)  # jz skip
    b.append(b"\x52")  # push edx          (body = inner-buffer ptr)
    b.append(b"\x50")  # push eax          (code = host-order)
    _call_rel32(b, ENQUEUE_VA)  # call FUN_004b8850 (__thiscall ecx=ring base, callee cleans 2 args)
    target = b.current_va
    b.patch_rel8(skip_lo, target)
    b.patch_rel8(skip_hi, target)
    b.patch_rel8(skip_null, target)
    b.append(b"\x61")  # popad
    b.append(bytes.fromhex(ORIGINAL_HEX))  # replay displaced 8 bytes
    b.jmp_rel32(CONTINUATION_VA)
    return bytes(b.data)


def _jb_rel8(b: X86Builder) -> int:
    b.append(b"\x72\x00")
    return len(b.data) - 1


def _ja_rel8(b: X86Builder) -> int:
    b.append(b"\x77\x00")
    return len(b.data) - 1


def _jz_rel8(b: X86Builder) -> int:
    b.append(b"\x74\x00")
    return len(b.data) - 1


def _call_rel32(b: X86Builder, target_va: int) -> None:
    b.append(b"\xe8")
    b.u32((target_va - (b.current_va + 4)) & 0xFFFFFFFF)


def main() -> int:
    parser = argparse.ArgumentParser(description="Forward conn2 lobby messages into the lobby recv-queue.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, default=None)
    args = parser.parse_args()
    result = apply_lobby_forward_patch(args.source, args.out, args.manifest_out)
    print(json.dumps(result.to_json(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
