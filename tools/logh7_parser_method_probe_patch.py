from __future__ import annotations

import argparse
import json
import shutil
import struct
import sys
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


JsonValue = str | int | bool | list["JsonValue"] | dict[str, "JsonValue"]

# The 0x30 fast-path (transport router 0x006130a0) parses a 0x0030 frame via an indirect vtable
# call at 0x00613193: call dword ptr [edx+0x18], where edx is the parser object's vtable and eax
# is the payload length. This probe captures the vtable (edx), the resolved parser method
# (*(edx+0x18)), and the payload length for each call, so the 0x0030 parser can be statically RE'd
# to learn the response format the server must send.
PARSER_PROBE_MAGIC: Final[bytes] = b"PMP1"
PARSER_RECORD_BYTES: Final[int] = 64
PARSER_RECORD_CAPACITY: Final[int] = 8
PARSER_BUFFER_OFFSET: Final[int] = 200
PARSER_HOOK_VA: Final[int] = 0x00613193
PARSER_CONTINUATION_VA: Final[int] = 0x00613198  # the jne after call+test
PARSER_ORIGINAL_HEX: Final[str] = "ff521884c0"  # call dword ptr [edx+0x18]; test al,al
PARSER_HOOK_LENGTH: Final[int] = 5


@dataclass(frozen=True, slots=True)
class ParserProbeHook:
    patched_hex: str
    trampoline_va: int

    def to_json(self) -> dict[str, JsonValue]:
        return {
            "target": "envelope0x30ParserVtableCall",
            "virtualAddressHex": f"0x{PARSER_HOOK_VA:08x}",
            "continuationHex": f"0x{PARSER_CONTINUATION_VA:08x}",
            "originalHex": PARSER_ORIGINAL_HEX,
            "patchedHex": self.patched_hex,
            "trampolineHex": f"0x{self.trampoline_va:08x}",
        }


@dataclass(frozen=True, slots=True)
class ParserProbePatch:
    cave: RuntimeCodeCave
    hook: ParserProbeHook
    before_characteristics: int
    after_characteristics: int

    def to_json(self) -> dict[str, JsonValue]:
        buffer_va = self.cave.virtual_address + PARSER_BUFFER_OFFSET
        return {
            "hooks": [self.hook.to_json()],
            "trampoline": {
                "virtualAddressHex": f"0x{self.cave.virtual_address:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset:08x}",
                "capacityBytes": self.cave.length_bytes,
                "bytesUsed": PARSER_BUFFER_OFFSET + 8 + PARSER_RECORD_BYTES * PARSER_RECORD_CAPACITY,
                "sectionCharacteristicsBeforeHex": f"0x{self.before_characteristics:08x}",
                "sectionCharacteristicsAfterHex": f"0x{self.after_characteristics:08x}",
            },
            "ringBuffer": {
                "virtualAddressHex": f"0x{buffer_va:08x}",
                "fileOffsetHex": f"0x{self.cave.file_offset + PARSER_BUFFER_OFFSET:08x}",
                "recordCapacity": PARSER_RECORD_CAPACITY,
                "totalBytes": 8 + PARSER_RECORD_BYTES * PARSER_RECORD_CAPACITY,
            },
            "recordFormat": {
                "magic": PARSER_PROBE_MAGIC.hex(),
                "recordBytes": PARSER_RECORD_BYTES,
                "layout": "magic,callIndex,vtable,parserMethod,inputPtr,payloadLen,outputPtr",
            },
        }


def apply_parser_method_probe_patch(source: Path, destination: Path, manifest_out: Path) -> ParserProbePatch:
    raw = bytearray(source.read_bytes())
    image = _parse_pe_image(raw)
    hook_offset = _virtual_address_to_offset(image, PARSER_HOOK_VA)
    original = raw[hook_offset : hook_offset + PARSER_HOOK_LENGTH]
    if original.hex() != PARSER_ORIGINAL_HEX:
        raise ValueError(f"0x30 parser vtable-call bytes drift at 0x{PARSER_HOOK_VA:08x}: {original.hex()}")

    cave = find_runtime_probe_code_cave(source)
    trampoline = _build_trampoline(cave.virtual_address, cave.virtual_address + PARSER_BUFFER_OFFSET)
    if len(trampoline) > cave.length_bytes:
        raise ValueError("0x30 parser method probe exceeds code cave capacity")

    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    patched = bytearray(destination.read_bytes())
    before, after = enable_section_write_for_virtual_address(patched, cave.virtual_address)
    hook_bytes = hook_jump(PARSER_HOOK_VA, cave.virtual_address, PARSER_HOOK_LENGTH)
    patched[hook_offset : hook_offset + PARSER_HOOK_LENGTH] = hook_bytes
    patched[cave.file_offset : cave.file_offset + len(trampoline)] = trampoline
    destination.write_bytes(patched)

    hook = ParserProbeHook(patched_hex=hook_bytes.hex(), trampoline_va=cave.virtual_address)
    patch = ParserProbePatch(cave, hook, before, after)
    manifest_out.parent.mkdir(parents=True, exist_ok=True)
    manifest_out.write_text(json.dumps(patch.to_json(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return patch


def _build_trampoline(base_va: int, buffer_va: int) -> bytes:
    builder = X86Builder(base_va)
    _append_record(builder, buffer_va)
    builder.append(b"\xff\x52\x18")  # replay call dword ptr [edx+0x18]
    builder.append(b"\x84\xc0")      # replay test al, al
    builder.jmp_rel32(PARSER_CONTINUATION_VA)
    if len(builder.data) > PARSER_BUFFER_OFFSET:
        raise ValueError("0x30 parser method trampoline overlaps its ring buffer")
    while len(builder.data) < PARSER_BUFFER_OFFSET:
        builder.u8(0x90)
    builder.append(bytes(8 + PARSER_RECORD_BYTES * PARSER_RECORD_CAPACITY))
    return bytes(builder.data)


def _append_record(builder: X86Builder, buffer_va: int) -> None:
    counter_va = buffer_va
    records_va = buffer_va + 8
    builder.append(b"\x9c\x60\xfc")  # pushfd; pushad; cld (esp -= 0x24). EDX@[esp+0x14], EAX@[esp+0x1c]
    _u32(builder, b"\xa1", counter_va)
    builder.append(b"\x83\xf8")
    builder.u8(PARSER_RECORD_CAPACITY)
    log_entry = _jb_rel8_placeholder(builder)
    builder.append(b"\x61\x9d")
    overflow_exit = _jmp_rel32_placeholder(builder)
    builder.patch_rel8(log_entry, builder.current_va)
    _u32(builder, b"\xbf", records_va)
    builder.append(b"\x8b\xc8\xc1\xe1\x06\x03\xf9")
    builder.append(b"\x89\x47\x04")  # callIndex
    _u32(builder, b"\xff\x05", counter_va)
    _u32(builder, b"\xc7\x07", int.from_bytes(PARSER_PROBE_MAGIC, "little"))
    builder.append(b"\x8b\x4c\x24\x14")  # mov ecx, [esp+0x14]  (saved EDX = vtable)
    builder.append(b"\x89\x4f\x08")      # mov [edi+8], ecx      (vtable)
    builder.append(b"\x8b\x41\x18")      # mov eax, [ecx+0x18]   (parser method = *(vtable+0x18))
    builder.append(b"\x89\x47\x0c")      # mov [edi+0xc], eax    (parserMethod)
    builder.append(b"\x8b\x44\x24\x24")
    builder.append(b"\x89\x47\x10")
    builder.append(b"\x8b\x44\x24\x28")
    builder.append(b"\x89\x47\x14")
    builder.append(b"\x8b\x44\x24\x2c")
    builder.append(b"\x89\x47\x18")
    builder.append(b"\x61\x9d")
    _patch_rel32(builder, overflow_exit, builder.current_va)


def decode_parser_method_ring(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 8:
        raise ValueError("parser method ring is too small")
    counter = struct.unpack_from("<I", data, 0)[0]
    records: list[dict[str, object]] = []
    offset = 8
    index = 0
    while offset + PARSER_RECORD_BYTES <= len(data):
        chunk = data[offset : offset + PARSER_RECORD_BYTES]
        if chunk[:4] != PARSER_PROBE_MAGIC:
            records.append({"index": index, "empty": True})
        else:
            call_index, vtable, method, input_ptr, payload_len, output_ptr = struct.unpack_from("<IIIIII", chunk, 4)
            records.append(
                {
                    "index": index,
                    "callIndex": call_index,
                    "vtableHex": f"0x{vtable:08x}",
                    "parserMethodHex": f"0x{method:08x}",
                    "inputPtrHex": f"0x{input_ptr:08x}",
                    "payloadLen": payload_len if payload_len <= 0x7FFFFFFF else payload_len - 0x100000000,
                    "outputPtrHex": f"0x{output_ptr:08x}",
                }
            )
        offset += PARSER_RECORD_BYTES
        index += 1
    methods = sorted({r["parserMethodHex"] for r in records if not r.get("empty")})
    return {"path": str(path), "counter": counter, "parserMethods": methods, "records": records}


def _u32(builder: X86Builder, raw: bytes, value: int) -> None:
    builder.append(raw)
    builder.u32(value)


def _jb_rel8_placeholder(builder: X86Builder) -> int:
    builder.append(b"\x72\x00")
    return len(builder.data) - 1


def _jmp_rel32_placeholder(builder: X86Builder) -> int:
    opcode_offset = len(builder.data)
    builder.u8(0xE9)
    builder.u32(0)
    return opcode_offset


def _patch_rel32(builder: X86Builder, opcode_offset: int, destination: int) -> None:
    source_after_instruction = builder.base_va + opcode_offset + 5
    builder.data[opcode_offset + 1 : opcode_offset + 5] = struct.pack("<i", destination - source_after_instruction)


def main() -> int:
    parser = argparse.ArgumentParser(description="Patch LOGH VII 0x30 envelope parser method ring probe.")
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
        apply_parser_method_probe_patch(args.source, args.out, args.manifest_out)
        print(f"wrote {args.out}")
        print(f"wrote {args.manifest_out}")
        return 0
    try:
        decoded = decode_parser_method_ring(args.ring)
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1
    text = json.dumps(decoded, ensure_ascii=False, indent=2) + "\n"
    if args.out is not None:
        args.out.write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
