"""Runtime probe: capture the actual bytes the recv worker reads, per transport.

Hooks 0x00615307 (`add esp,4; test al,al`) inside the recv worker 0x6152b0, right after the
recv() call 0x640b4e and the error check 0x615d20. At this point EDI = recv()'s return (bytes
read; <=0 = closed/error), ESI = transport `this`, and the just-written bytes are at
[esi+0x5c] (ring base) + [esi+0x4c] (write offset). This is GROUND TRUTH: it shows exactly what
each connection's socket recv() yields.

Decisive question (handoff G176/G177/G178): conn2's recv pump runs and reads frames, but the
server's 0x2001 (a 0x0030 frame) never reaches decipher. Does the 0x2001 actually arrive at conn2's
recv()? Frame headers are [u16 BE len][u16 BE code]; the first dword read little-endian is
0x{code:04x}{len:04x} reversed -> a 0x0030 frame shows buf0 = 0x3000xxxx, a 0x0034 handshake
0x3400xxxx, 0x0035 = 0x3500xxxx. If conn2's recv ever yields buf0 = 0x3000xxxx -> the 0x2001
arrived (so the divergence is in framing/parse, potentially server-fixable). If conn2 only yields
0x3400/0x3500 (handshake) and never 0x3000 -> the 0x2001 bytes never reach conn2's recv (a deeper
transport/delivery issue).

Displaces 5 bytes (add esp,4; test al,al) and replays them before 0x61530c (the jne).
Saved-frame layout after `pushfd; pushad`: EDI@[esp+0x00], ESI@[esp+0x04].
Ring record (32-byte stride): [magic 4][callIndex 4][this(esi) 4][recvCount(edi) 4][buf0 4][buf1 4][pad 8].

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

BUFFER_OFFSET: Final[int] = 176
RECORD_BYTES: Final[int] = 32
RECORD_CAPACITY: Final[int] = 16
MAGIC: Final[bytes] = b"L7RB"  # LOGH7 Recv Bytes


@dataclass(frozen=True, slots=True)
class RecvBytesProbePatch:
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
                "totalBytes": 8 + RECORD_BYTES * RECORD_CAPACITY,
            },
            "section": {"beforeHex": self.section_before, "afterHex": self.section_after},
        }


def apply_recv_bytes_probe_patch(source: Path, out: Path, manifest_out: Path) -> RecvBytesProbePatch:
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
        raise ValueError("recv bytes probe exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = RecvBytesProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(bytes.fromhex(ORIGINAL_HEX))  # replay add esp,4; test al,al
    builder.jmp_rel32(CONTINUATION_VA)
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("recv bytes trampoline overlaps its ring buffer")
    while len(builder.data) < BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + RECORD_BYTES * RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld
    builder.append(b"\xa1")
    builder.u32(counter_va)  # mov eax, [counter_va]
    builder.append(b"\x83\xf8")
    builder.u8(RECORD_CAPACITY)  # cmp eax, capacity
    log_entry = _jb_rel8_placeholder(builder)  # jb log_entry
    builder.append(b"\x61\x9d")  # popad; popfd
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)

    builder.append(b"\xbf")
    builder.u32(records_va)  # mov edi, records_va
    builder.append(b"\x8b\xc8\xc1\xe1\x05\x03\xf9")  # mov ecx,eax; shl ecx,5; add edi,ecx
    builder.append(b"\xc7\x07")
    builder.u32(int.from_bytes(MAGIC, "little"))  # mov dword [edi], MAGIC
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax (callIndex)
    builder.append(b"\xff\x05")
    builder.u32(counter_va)  # inc dword [counter_va]
    # transport (saved ESI) = [esp+0x04] -> ecx, and -> [edi+8]
    builder.append(b"\x8b\x4c\x24\x04\x89\x4f\x08")
    # recv count (saved EDI) = [esp+0x00] -> [edi+0x0c]
    builder.append(b"\x8b\x04\x24\x89\x47\x0c")
    # buffer write ptr = [ecx+0x5c] + [ecx+0x4c] -> edx
    builder.append(b"\x8b\x51\x5c\x03\x51\x4c")
    # buf0 = [edx] -> [edi+0x10]
    builder.append(b"\x8b\x02\x89\x47\x10")
    # buf1 = [edx+4] -> [edi+0x14]
    builder.append(b"\x8b\x42\x04\x89\x47\x14")
    builder.append(b"\x61\x9d")  # popad; popfd
    _patch_rel32(builder, overflow_exit, builder.current_va)


def _jb_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x72\x00")  # jb rel8 (placeholder)
    return len(builder.data) - 1


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    opcode_offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return opcode_offset


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after = builder.base_va + opcode_offset + 5
    rel = destination - source_after
    struct.pack_into("<i", builder.data, opcode_offset + 1, rel)


def decode_recv_bytes_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("recv bytes ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data) and index < RECORD_CAPACITY:
        chunk = data[offset : offset + RECORD_BYTES]
        if chunk[:4] != MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, this_ptr, recv_count, buf0, buf1 = struct.unpack_from("<IIiII", chunk, 4)
            head = struct.pack("<II", buf0, buf1)
            code = struct.unpack_from(">H", head, 2)[0] if recv_count >= 4 else None
            frame_len = struct.unpack_from(">H", head, 0)[0] if recv_count >= 2 else None
            records.append(
                {
                    "index": index,
                    "callIndex": call_index,
                    "thisHex": f"0x{this_ptr:08x}",
                    "recvCount": recv_count,
                    "headHex": head.hex(),
                    "frameLen": frame_len,
                    "frameCodeHex": None if code is None else f"0x{code:04x}",
                }
            )
        offset += RECORD_BYTES
        index += 1
    return {"path": str(path), "counter": counter, "records": records}


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII recv-bytes ring probe.")
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
        patch_result = apply_recv_bytes_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_recv_bytes_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
