"""Runtime probe: capture the decoded-frame layout at the dispatch-loop hook 0x0061231b.

The lobby-forward patch hooks here expecting EDI=frame, [EDI]=inner-buffer ptr, *(u16)[EDI]=inner
code. Two forward attempts didn't enqueue, so this records the ACTUAL layout to locate the inner
code 0x2001. EDI = frame (returned by router FUN_006130a0). Records per data slot (circular):
[magic][counter][edi][ [edi] (bufptr) ][ *(u32)[edi] (buf[0..3]) ][ [edi+8] (len?) ][ *(u32)([edi]+? ) ].

Hook displaces the same 8 bytes the forward patch does (mov ecx,[edi]; xor eax,eax; mov ax,[edi+8])
and replays them before 0x612323. Decode prints each slot so we can see where 0x2001 (or its BE
form 0x0120) sits.

Subcommands: patch <exe> --out <patched> --manifest-out <json>; decode <ring.bin>.
"""
from __future__ import annotations

import argparse
import json
import struct
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
HOOK_LENGTH: Final[int] = 8
ORIGINAL_HEX: Final[str] = "8b0f33c0668b4708"

BUFFER_OFFSET: Final[int] = 200
RECORD_BYTES: Final[int] = 32
RECORD_CAPACITY: Final[int] = 16
MAGIC: Final[bytes] = b"L7DF"


@dataclass(frozen=True, slots=True)
class DispatchFrameProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "bytesHex": self.hook_bytes_hex},
            "ringBuffer": {"virtualAddressHex": f"0x{ring_va:08x}", "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY},
        }


def apply_dispatch_frame_probe_patch(source: Path, out: Path, manifest_out: Path) -> DispatchFrameProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"dispatch-loop bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")
    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("dispatch frame probe exceeds code cave")
    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))
    patch = DispatchFrameProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    b = X86Builder(base_va)
    counter_va = buffer_va
    records_va = buffer_va + 8
    b.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    b.append(b"\x8b\x34\x24")  # mov esi, [esp]          (saved edi = frame ptr)
    b.append(b"\xa1")
    b.u32(counter_va)  # mov eax, [counter]
    b.append(b"\xbf")
    b.u32(records_va)  # mov edi, records_va
    b.append(b"\x8b\xc8\x83\xe1\x0f\xc1\xe1\x05\x03\xf9")  # mov ecx,eax; and ecx,0xf; shl ecx,5; add edi,ecx
    b.append(b"\xc7\x07")
    b.u32(int.from_bytes(MAGIC, "little"))  # mov [edi], MAGIC
    b.append(b"\x89\x47\x04")  # mov [edi+4], eax (counter)
    b.append(b"\xff\x05")
    b.u32(counter_va)  # inc [counter]
    b.append(b"\x89\x77\x08")  # mov [edi+8], esi (frame ptr edi)
    # [esi] = bufptr
    b.append(b"\x8b\x16")  # mov edx, [esi]
    b.append(b"\x89\x57\x0c")  # mov [edi+0xc], edx (bufptr)
    # *(u32)[bufptr] = buf[0..3]  (guard: only if bufptr nonzero)
    b.append(b"\x85\xd2")  # test edx, edx
    skip = _jz(b)
    b.append(b"\x8b\x0a")  # mov ecx, [edx]
    b.append(b"\x89\x4f\x10")  # mov [edi+0x10], ecx (buf first u32)
    b.append(b"\x8b\x4a\x08")  # mov ecx, [edx+8]
    b.append(b"\x89\x4f\x18")  # mov [edi+0x18], ecx (buf u32 at +8)
    b.patch_rel8(skip, b.current_va)
    # [esi+8] = length field
    b.append(b"\x8b\x4e\x08")  # mov ecx, [esi+8]
    b.append(b"\x89\x4f\x14")  # mov [edi+0x14], ecx (len)
    b.append(b"\x61\x9d")  # popad; popfd
    b.append(bytes.fromhex(ORIGINAL_HEX))
    b.jmp_rel32(CONTINUATION_VA)
    if len(b.data) > BUFFER_OFFSET:
        raise ValueError("trampoline overlaps ring")
    while len(b.data) < BUFFER_OFFSET:
        b.u8(0x90)
    b.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(b.data)


def _jz(b: X86Builder) -> int:
    b.append(b"\x74\x00")
    return len(b.data) - 1


def decode_dispatch_frame_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    counter = struct.unpack_from("<I", data, 0)[0]
    out = []
    off = 8
    while off + RECORD_BYTES <= len(data):
        chunk = data[off : off + RECORD_BYTES]
        if chunk[:4] == MAGIC:
            cnt, frame, bufptr, buf0, length, buf8 = struct.unpack_from("<IIIIII", chunk, 4)
            be0 = struct.unpack(">H", struct.pack("<I", buf0)[:2])[0]
            out.append({
                "counter": cnt, "frameHex": f"0x{frame:08x}", "bufptrHex": f"0x{bufptr:08x}",
                "buf0Hex": f"0x{buf0:08x}", "buf0_firstU16_LE": f"0x{buf0 & 0xffff:04x}",
                "buf0_firstU16_BEswap": f"0x{be0:04x}", "lenField": length, "buf8Hex": f"0x{buf8:08x}",
            })
        off += RECORD_BYTES
    out.sort(key=lambda r: r["counter"])
    return {"counter": counter, "records": out}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("patch"); p.add_argument("source", type=Path); p.add_argument("--out", type=Path, required=True); p.add_argument("--manifest-out", type=Path, required=True)
    d = sub.add_parser("decode"); d.add_argument("ring", type=Path)
    args = parser.parse_args()
    if args.command == "patch":
        print(json.dumps(apply_dispatch_frame_probe_patch(args.source, args.out, args.manifest_out).to_json(), ensure_ascii=False, indent=2))
        return 0
    print(json.dumps(decode_dispatch_frame_ring(args.ring), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
