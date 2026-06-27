"""Runtime probe: per recv-pump run, did the recv worker yield a frame to decode?

Hooks 0x006152a0 (`test al,al; je 0x6152ab`) inside the recv pump 0x615290, right after the recv
worker 0x6152b0 returns AL = (a frame is ready -> call frame decode 0x6153b0 -> decipher 0x645db0).
ESI = transport `this`. This pinpoints, for conn2 (handoff G176: both transports' pumps DO run),
whether its recv worker ever returns AL!=0 (a frame was read) in the ~4ms window between the server
sending 0x2001 and conn2's FIN. AL==0 every time -> the 0x2001 bytes are never read (timing / overlapped
recv not posted before close = a connection-lifetime issue, possibly server-influenceable by keeping
conn2 alive longer). AL!=0 but decipher still 0 -> bytes read but 0x0030 frame decode diverges (encoding).

Displaces 6 bytes (test al,al; je 0x6152ab; mov ecx,esi) and replays them as a conditional:
AL==0 -> 0x6152ab, AL!=0 -> mov ecx,esi -> 0x6152a6 (call frame decode).
Saved-frame layout after `pushfd; pushad`: EAX@[esp+0x1c], ESI@[esp+0x04].
Ring record (16-byte stride): [magic 4][callIndex 4][this 4][al 4].

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

HOOK_VA: Final[int] = 0x006152A0
HOOK_LENGTH: Final[int] = 6  # test al,al (2) + je 0x6152ab (2) + mov ecx,esi (2)
ORIGINAL_HEX: Final[str] = "84c074078bce"
SKIP_TARGET_VA: Final[int] = 0x006152AB  # je target (no frame)
DECODE_TARGET_VA: Final[int] = 0x006152A6  # fall-through after mov ecx,esi (call frame decode)

BUFFER_OFFSET: Final[int] = 192
RECORD_BYTES: Final[int] = 16
RECORD_CAPACITY: Final[int] = 24
MAGIC: Final[bytes] = b"L7RR"  # LOGH7 Recv Result


@dataclass(frozen=True, slots=True)
class RecvResultProbePatch:
    cave: RuntimeCodeCave
    hook_bytes_hex: str
    section_before: str
    section_after: str

    def to_json(self) -> dict[str, object]:
        ring_va = self.cave.virtual_address + BUFFER_OFFSET
        return {
            "hook": {"virtualAddressHex": f"0x{HOOK_VA:08x}", "lengthBytes": HOOK_LENGTH, "bytesHex": self.hook_bytes_hex},
            "skipTargetHex": f"0x{SKIP_TARGET_VA:08x}",
            "decodeTargetHex": f"0x{DECODE_TARGET_VA:08x}",
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


def apply_recv_result_probe_patch(source: Path, out: Path, manifest_out: Path) -> RecvResultProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(bytes(raw))
    hook_offset = _virtual_address_to_offset(image, HOOK_VA)
    original = bytes(raw[hook_offset : hook_offset + HOOK_LENGTH])
    if original.hex() != ORIGINAL_HEX:
        raise ValueError(f"recv result bytes drift at 0x{HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    buffer_va = cave.virtual_address + BUFFER_OFFSET
    trampoline = _build_trampoline(cave.virtual_address, buffer_va)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("recv result probe exceeds code cave capacity")

    patched = bytearray(raw)
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(HOOK_VA, cave.virtual_address, HOOK_LENGTH)
    patched[hook_offset : hook_offset + HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    out.write_bytes(bytes(patched))

    patch = RecvResultProbePatch(cave, hook_bytes.hex(), before, after)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    # Replay conditional: test al,al; je SKIP; mov ecx,esi; jmp DECODE.
    builder.append(b"\x84\xc0")  # test al,al
    je_va = builder.current_va
    builder.append(b"\x0f\x84")  # je near
    builder.u32((SKIP_TARGET_VA - (je_va + 6)) & 0xFFFFFFFF)
    builder.append(b"\x8b\xce")  # mov ecx,esi
    builder.jmp_rel32(DECODE_TARGET_VA)  # jmp 0x6152a6
    if len(builder.data) > BUFFER_OFFSET:
        raise ValueError("recv result trampoline overlaps its ring buffer")
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
    builder.append(b"\x8b\xc8\xc1\xe1\x04\x03\xf9")  # mov ecx,eax; shl ecx,4; add edi,ecx
    builder.append(b"\xc7\x07")
    builder.u32(int.from_bytes(MAGIC, "little"))  # mov dword [edi], MAGIC
    builder.append(b"\x89\x47\x04")  # mov [edi+4], eax (callIndex)
    builder.append(b"\xff\x05")
    builder.u32(counter_va)  # inc dword [counter_va]
    # this (saved ESI) = [esp+0x04] -> [edi+8]
    builder.append(b"\x8b\x44\x24\x04\x89\x47\x08")
    # al (saved EAX) = [esp+0x1c] -> [edi+0x0c]
    builder.append(b"\x8b\x44\x24\x1c\x89\x47\x0c")
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


def decode_recv_result_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("recv result ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    per_transport: dict[int, dict[str, int]] = {}
    offset = 8
    index = 0
    while offset + RECORD_BYTES <= len(data) and index < RECORD_CAPACITY:
        chunk = data[offset : offset + RECORD_BYTES]
        if chunk[:4] != MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, this_ptr, al = struct.unpack_from("<III", chunk, 4)
            frame_ready = (al & 0xff) != 0
            agg = per_transport.setdefault(this_ptr, {"runs": 0, "framesReady": 0})
            agg["runs"] += 1
            if frame_ready:
                agg["framesReady"] += 1
            records.append({"index": index, "callIndex": call_index, "thisHex": f"0x{this_ptr:08x}", "al": al & 0xff, "frameReady": frame_ready})
        offset += RECORD_BYTES
        index += 1
    return {
        "path": str(path),
        "counter": counter,
        "perTransport": {f"0x{k:08x}": v for k, v in per_transport.items()},
        "records": records,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch/decode the LOGH VII recv-result ring probe.")
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
        patch_result = apply_recv_result_probe_patch(args.source, args.out, args.manifest_out)
        print(json.dumps(patch_result.to_json(), ensure_ascii=False, indent=2))
        return 0
    decoded = decode_recv_result_ring(args.ring)
    text = json.dumps(decoded, ensure_ascii=False, indent=2)
    if args.out is not None:
        args.out.write_text(text + "\n", encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
