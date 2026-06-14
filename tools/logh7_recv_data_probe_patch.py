"""Runtime probe: circular capture of recv() DATA reads (skips WSAEWOULDBLOCK), per transport.

Same hook site as the recv-bytes probe (0x00615307, after recv()), but records ONLY reads with
recvCount>0 into a CIRCULAR ring (slot = counter & 31), so over a long-lived conn2 (now that the
router-teardown patch keeps it open ~20s) the LAST 32 actual data reads are captured — answering
whether conn2 EVER receives the server's 0x2001 (a 0x0030 frame) or only ever gets the 0x0035
handshake. EDI = recv count, ESI = transport; buffer head at [esi+0x5c]+[esi+0x4c].

A 0x0030 frame head reads little-endian as 0x3000xxxx; 0x0035 handshake as 0x3500xxxx.
Displaces 5 bytes (add esp,4; test al,al) and replays them before 0x61530c.
Saved-frame layout after `pushfd; pushad`: EDI@[esp+0x00], ESI@[esp+0x04].
Ring record (16-byte stride, capacity 32 circular): [magic 4][tick 4][recvCount 4][buf0 4].

Subcommands: patch <exe> --out <patched> --manifest-out <json>; decode <ring.bin> --out <json>.
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

HOOK_VA: Final[int] = 0x00615307
CONTINUATION_VA: Final[int] = 0x0061530C
HOOK_LENGTH: Final[int] = 5  # add esp,4 (3) + test al,al (2)
ORIGINAL_HEX: Final[str] = "83c40484c0"

BUFFER_OFFSET: Final[int] = 200
RECORD_BYTES: Final[int] = 32
RECORD_CAPACITY: Final[int] = 16  # power of two for circular masking
MAGIC: Final[bytes] = b"L7RD"  # LOGH7 Recv Data


@dataclass(frozen=True, slots=True)
class RecvDataProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "continuationHex": f"0x{CONTINUATION_VA:08x}",
            "trampoline": {"virtualAddressHex": f"0x{self.cave.virtual_address:08x}"},
            "ringBuffer": {
                "virtualAddressHex": f"0x{ring_va:08x}",
                "counterBytes": 8,
                "recordBytes": RECORD_BYTES,
                "recordCapacity": RECORD_CAPACITY,
                "circular": True,
                "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
            },
            "section": {"beforeHex": self.section_before, "afterHex": self.section_after},
        }


def apply_recv_data_probe_patch(source: Path, out: Path, manifest_out: Path) -> RecvDataProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"recv worker bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("recv data probe exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = RecvDataProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(bytes.fromhex(ORIGINAL_HEX))  # replay add esp,4; test al,al
    builder.jmp_rel32(CONTINUATION_VA)
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("recv data trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    # skip if recvCount (saved EDI = [esp+0x00]) <= 0
    builder.append(b"\x8b\x04\x24")  # mov eax, [esp]   (saved edi = recv count)
    builder.append(b"\x85\xc0")  # test eax, eax
    skip = _jle_rel8_placeholder(builder)  # jle skip
    # record (circular)
    builder.append(b"\xa1")
    builder.u32(counter_va)  # mov eax, [counter_va]
    builder.append(b"\xbf")
    builder.u32(records_va)  # mov edi, records_va
    builder.append(b"\x8b\xc8\x83\xe1\x0f\xc1\xe1\x05\x03\xf9")  # mov ecx,eax; and ecx,0x0f; shl ecx,5; add edi,ecx
    builder.append(b"\xc7\x07")
    builder.u32(int.from_bytes(MAGIC, "little"))  # mov dword [edi], MAGIC
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax (tick)
    builder.append(b"\xff\x05")
    builder.u32(counter_va)  # inc dword [counter_va]
    # recvCount (saved EDI) = [esp+0x00] -> [edi+8]
    builder.append(b"\x8b\x04\x24\x89\x47\x08")
    # buf0 = [ [esi+0x5c] + [esi+0x4c] ]; saved ESI = [esp+0x04]
    builder.append(b"\x8b\x4c\x24\x04")  # mov ecx, [esp+4] (esi/transport)
    builder.append(b"\x89\x4f\x10")  # mov [edi+0x10], ecx (transport)
    builder.append(b"\x8b\x51\x5c\x03\x51\x4c")  # mov edx,[ecx+0x5c]; add edx,[ecx+0x4c]
    builder.append(b"\x8b\x02\x89\x47\x0c")  # mov eax,[edx]; mov [edi+0xc],eax
    builder.patch_rel8(skip, builder.current_va)
    builder.append(b"\x61\x9d")  # popad; popfd


def _jle_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x7e\x00")  # jle rel8 (placeholder)
    return len(builder.data) - 1


def decode_recv_data_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("recv data ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    slots: list[dict[str, object] | None] = [None] * RECORD_CAPACITY
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data) and index < RECORD_CAPACITY:
        chunk = data[offset : offset + RECORD_BYTES]
        if chunk[:4] == MAGIC:
            tick, recv_count, buf0, transport = struct.unpack_from("<IiiI", chunk, 4)
            head = struct.pack("<I", buf0 & 0xFFFFFFFF)
            code = struct.unpack_from(">H", head, 2)[0] if recv_count >= 4 else None
            slots[index] = {
                "tick": tick,
                "transportHex": f"0x{transport:08x}",
                "recvCount": recv_count,
                "frameCodeHex": None if code is None else f"0x{code:04x}",
                "headHex": head.hex(),
            }
        offset += RECORD_BYTES
        index += 1
    present = [s for s in slots if s is not None]
    present.sort(key=lambda s: s["tick"])
    return {"path": str(path), "counter": counter, "chronological": present}


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII recv-data (circular, data-only) ring probe.")
    sub = parser.add_subparsers(dest="command", required=True)
    patch = sub.add_parser("patch")
    patch.add_argument("source", type=Path)
    patch.add_argument("--out", type=Path, required=True)
    patch.add_argument("--manifest-out", type=Path, required=True)
    decode = sub.add_parser("decode")
    decode.add_argument("ring", type=Path)
    decode.add_argument("--out", type=Path)
    args = parser.parse_args()

    if args.command == "patch":
        patch_result = apply_recv_data_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_recv_data_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
