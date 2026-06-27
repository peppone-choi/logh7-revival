"""Runtime probe: capture the transport frame-code the router reads, at FUN_006130a0 0x6130fb.

conn2's parse buffer holds two valid 0x0030 frames (verified) yet decipher (0x645db0) is never
called -> the router takes the non-0x30 path for them. The router reads the code at
[frame_readptr + [esi+0x12]] (esi = param_2 transport, +0x12 = header offset) via FUN_00614c70,
then `cmp word [esp+0x20], 0x30` at 0x6130fb. This hook (reached ONLY when a real frame was
returned, so no empty-poll noise) records the code + transport + readptr + header-offset so we see
whether conn2's 0x0030 frames read code==0x30 (then the divergence is downstream) or !=0x30
(header/alignment differs from conn1).

Displaces `cmp word [esp+0x20],0x30` (6 bytes) and replays before 0x613101.
Record (32B): [magic][counter][code u16][transport esi][readptr [ebx+4]][hdrOff [esi+0x12]][pad].

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
from tools.logh7_runtime_patch_targets import RuntimeCodeCave, enable_section_write_for_virtual_address, find_runtime_probe_code_cave
from tools.logh7_x86_patch import X86Builder, hook_jump

HOOK_VA: Final[int] = 0x006130FB
CONTINUATION_VA: Final[int] = 0x00613101
HOOK_LENGTH: Final[int] = 6
ORIGINAL_HEX: Final[str] = "66837c242030"
BUFFER_OFFSET: Final[int] = 176
RECORD_BYTES: Final[int] = 32
RECORD_CAPACITY: Final[int] = 16
MAGIC: Final[bytes] = b"L7RC"


@dataclass(frozen=True, slots=True)
class RouterCodeProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str

    def to_json(self) -> dict[str, object]:
        return {"hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "bytesHex": self.hook_bytes_hex},
                "ringBuffer": {"virtualAddressHex": f"0x{self.cave.virtual_address + BUFFER_OFFSET:08x}",
                               "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY}}


def apply_router_code_probe_patch(source: Path, out: Path, manifest_out: Path) -> RouterCodeProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"router code-check drift at 0x{HOOK_VA:08x}: {original.hex()}")
    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("router code probe exceeds code cave")
    patched = bytearray(raw)
    enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))
    patch = RouterCodeProbePatch(cave, hook_bytes.hex())
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    counter_va = buffer_va
    records_va = buffer_va + 8
    b = X86Builder(base_va)
    b.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    b.append(b"\xa1"); b.u32(counter_va)  # mov eax, [counter]
    b.append(b"\xbf"); b.u32(records_va)  # mov edi, records
    b.append(b"\x8b\xc8\x83\xe1\x0f\xc1\xe1\x05\x03\xf9")  # mov ecx,eax; and ecx,0xf; shl ecx,5; add edi,ecx
    b.append(b"\xc7\x07"); b.u32(int.from_bytes(MAGIC, "little"))
    b.append(b"\x89\x47\x04")  # [edi+4]=counter
    b.append(b"\xff\x05"); b.u32(counter_va)  # inc counter
    # code = word [esp+0x20] original; after pushfd(4)+pushad(32)=0x24 => [esp+0x44]
    b.append(b"\x0f\xb7\x44\x24\x44\x89\x47\x08")  # movzx eax, word [esp+0x44]; mov [edi+8], eax
    b.append(b"\x89\x77\x0c")  # [edi+0xc] = esi (transport param_2)
    b.append(b"\x8b\x43\x04\x89\x47\x10")  # mov eax,[ebx+4]; mov [edi+0x10],eax (readptr)
    b.append(b"\x0f\xb7\x46\x12\x89\x47\x14")  # movzx eax, word [esi+0x12]; [edi+0x14]=eax (hdrOff)
    b.append(b"\x61\x9d")  # popad; popfd
    b.append(bytes.fromhex(ORIGINAL_HEX))  # replay cmp
    b.jmp_rel32(CONTINUATION_VA)
    if len(b.data) > BUFFER_OFFSET:
        raise ValueError("overlap")
    while len(b.data) < BUFFER_OFFSET:
        b.u8(0x90)
    b.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(b.data)


def decode_router_code(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    counter = struct.unpack_from("<I", data, 0)[0]
    out = []
    off = 8
    while off + RECORD_BYTES <= len(data):
        chunk = data[off : off + RECORD_BYTES]
        if chunk[:4] == MAGIC:
            cnt, code, tr, rp, hdr = struct.unpack_from("<IIIII", chunk, 4)
            out.append({"counter": cnt, "codeHex": f"0x{code:04x}", "transportHex": f"0x{tr:08x}",
                        "readptrHex": f"0x{rp:08x}", "hdrOff": hdr, "is0x30": code == 0x30})
        off += RECORD_BYTES
    out.sort(key=lambda r: r["counter"])
    return {"counter": counter, "records": out}


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="command", required=True)
    pp = sub.add_parser("patch"); pp.add_argument("source", type=Path); pp.add_argument("--out", type=Path, required=True); pp.add_argument("--manifest-out", type=Path, required=True)
    dd = sub.add_parser("decode"); dd.add_argument("ring", type=Path)
    args = p.parse_args()
    if args.command == "patch":
        print(json.dumps(apply_router_code_probe_patch(args.source, args.out, args.manifest_out).to_json(), ensure_ascii=False, indent=2)); return 0
    print(json.dumps(decode_router_code(args.ring), ensure_ascii=False, indent=2)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
