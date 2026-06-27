"""Runtime probe: capture the ring-frame-getter state at FUN_00615ad0 entry.

frida showed conn2's router (FUN_006130a0) always returns 0 (no frame) even though conn2 received
the 20-byte 0x2001 -> decipher is never called. The router gets frames via FUN_00614ba0 -> this
FUN_00615ad0, which returns 0 when: [transport+0x1c]!=0 (frame checked-out/not consumed), or
[transport+0x1e]>[transport+0x14] (incomplete), or [+0x14]<2 (can't read length). This probe
records, per call (circular ring of 16), the transport ptr and those three fields so we can see
WHICH condition keeps conn2 stuck.

Hook displaces the 5-byte prologue (push ebx; mov ebx,ecx; push ebp; push esi) and replays it
before 0x615ad5. ECX = transport (__fastcall param_1) at entry.
Record (32B stride): [magic][counter][transport][avail +0x14][flag +0x1c][framelen +0x1e][pad 8].

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

HOOK_VA: Final[int] = 0x00615AD0
CONTINUATION_VA: Final[int] = 0x00615AD5
HOOK_LENGTH: Final[int] = 5
ORIGINAL_HEX: Final[str] = "538bd95556"
BUFFER_OFFSET: Final[int] = 176
RECORD_BYTES: Final[int] = 32
RECORD_CAPACITY: Final[int] = 16
MAGIC: Final[bytes] = b"L7RS"


@dataclass(frozen=True, slots=True)
class RingStateProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str

    def to_json(self) -> dict[str, object]:
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "bytesHex": self.hook_bytes_hex},
            "ringBuffer": {"virtualAddressHex": f"0x{self.cave.virtual_address + BUFFER_OFFSET:08x}",
                           "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY},
        }


def apply_ring_state_probe_patch(source: Path, out: Path, manifest_out: Path) -> RingStateProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"ring getter prologue drift at 0x{HOOK_VA:08x}: {original.hex()}")
    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("ring-state probe exceeds code cave")
    patched = bytearray(raw)
    enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))
    patch = RingStateProbePatch(cave, hook_bytes.hex())
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    counter_va = buffer_va
    records_va = buffer_va + 8
    b = X86Builder(base_va)
    b.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    b.append(b"\x8b\xf1")  # mov esi, ecx  (transport; ecx unchanged at entry)
    b.append(b"\xa1"); b.u32(counter_va)  # mov eax, [counter]
    b.append(b"\xbf"); b.u32(records_va)  # mov edi, records
    b.append(b"\x8b\xc8\x83\xe1\x0f\xc1\xe1\x05\x03\xf9")  # mov ecx,eax; and ecx,0xf; shl ecx,5; add edi,ecx
    b.append(b"\xc7\x07"); b.u32(int.from_bytes(MAGIC, "little"))  # mov [edi], MAGIC
    b.append(b"\x89\x47\x04")  # mov [edi+4], eax (counter)
    b.append(b"\xff\x05"); b.u32(counter_va)  # inc [counter]
    b.append(b"\x89\x77\x08")  # mov [edi+8], esi (transport)
    b.append(b"\x8b\x46\x14\x89\x47\x0c")  # mov eax,[esi+0x14]; mov [edi+0xc],eax (avail)
    b.append(b"\x0f\xb6\x46\x1c\x89\x47\x10")  # movzx eax,byte[esi+0x1c]; mov [edi+0x10],eax (flag)
    b.append(b"\x0f\xb7\x46\x1e\x89\x47\x14")  # movzx eax,word[esi+0x1e]; mov [edi+0x14],eax (framelen)
    b.append(b"\x61\x9d")  # popad; popfd
    b.append(bytes.fromhex(ORIGINAL_HEX))  # replay prologue
    b.jmp_rel32(CONTINUATION_VA)
    if len(b.data) > BUFFER_OFFSET:
        raise ValueError("trampoline overlaps ring")
    while len(b.data) < BUFFER_OFFSET:
        b.u8(0x90)
    b.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(b.data)


def decode_ring_state(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    counter = struct.unpack_from("<I", data, 0)[0]
    out = []
    off = 8
    while off + RECORD_BYTES <= len(data):
        chunk = data[off : off + RECORD_BYTES]
        if chunk[:4] == MAGIC:
            cnt, tr, avail, flag, flen = struct.unpack_from("<IIIII", chunk, 4)
            reason = ("flag!=0 (frame checked-out)" if flag != 0
                      else "framelen 0, avail<2" if flen == 0 and avail < 2
                      else "incomplete (avail<framelen)" if avail < flen
                      else "OK (would return frame)")
            out.append({"counter": cnt, "transportHex": f"0x{tr:08x}", "avail": avail,
                        "flag": flag, "framelen": flen, "verdict": reason})
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
        print(json.dumps(apply_ring_state_probe_patch(args.source, args.out, args.manifest_out).to_json(), ensure_ascii=False, indent=2)); return 0
    print(json.dumps(decode_ring_state(args.ring), ensure_ascii=False, indent=2)); return 0


if __name__ == "__main__":
    raise SystemExit(main())
